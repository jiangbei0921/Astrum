/* ASTRUM · 星图渲染器（V2-SKY 阶段 1）
 *
 * 职责：把 sky-viewmodel.js 产出的视图模型画到 Canvas，并维护命中区。
 * 这里不计算天体位置、不读星表来推导坐标，也不修改任何天文数据。
 *
 * 绘制顺序（与改造前一致，深度关系不能变）：
 *   天空背景 → 银河 → 背景星场 → 恒星 → 深空天体 → 星座线
 *   → 行星/月球/太阳 → 地平线与地面 → 方位标注 → 标签 → 地球小窗
 *
 * 命中区（canvas._hits/_bodies/_meta）由本模块唯一创建；app.js 只负责写入画布
 * 属性并消费。结构与阈值逐字保留，避免影响深链定位与详情卡。
 *
 * 依赖：window.SkyVM（仅星表键反查）、window.Astro（地球小窗）、window.CATALOG（星座名）。
 */
(function (root) {
  'use strict';

  var A = root.Astro;
  var C = root.CATALOG;

  /* 颜色工具：与 app.js 旧实现等价（模块内私有，避免跨模块耦合） */
  function hexRGB(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixColor(hex, target, t) {
    var a = hexRGB(hex), b = hexRGB(target);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }
  function hexA(hex, a) {
    var h = String(hex || '#3b3bd6').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.substring(0, 2), 16) + ',' + parseInt(h.substring(2, 4), 16) + ',' + parseInt(h.substring(4, 6), 16) + ',' + a + ')';
  }

  function skyBackground(g, vm) {
    /* 夜空底色（P1-2）：在真实银河背景之上需保持深邃，避免把银河结构衬成灰雾。
     * 与原实现相比各停靠点压暗约 2/3（保留约 1/3 亮值），渐变形状不变；
     * 关闭背景/降级时同样受益。 */
    var grad = g.createLinearGradient(0, 0, 0, vm.view.h);
    grad.addColorStop(0, '#010203');
    grad.addColorStop(0.45, '#03050a');
    grad.addColorStop(0.72, '#060a11');
    grad.addColorStop(1, '#080d14');
    g.fillStyle = grad;
    g.fillRect(0, 0, vm.view.w, vm.view.h);
  }

  /* ---- 银河 ---- */
  function milkyWay(g, vm) {
    var colors = ['rgba(120,150,205,0.085)', 'rgba(160,185,230,0.095)', 'rgba(205,218,242,0.10)'];
    var k = vm.view.k;
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    vm.milky.forEach(function (band) {
      g.lineWidth = band.width * k * 4;
      g.strokeStyle = colors[band.index] || colors[0];
      var drawing = false;
      g.beginPath();
      for (var i = 0; i < band.points.length; i++) {
        var q = band.points[i];
        if (!q) { drawing = false; continue; }
        if (!drawing) { g.moveTo(q.x, q.y); drawing = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke();
    });
    g.restore();
  }

  /* ---- 背景星场（示意密度，非实测星表；沿银道面聚集）----
   * 性能要点：按亮度分桶合并成少量 Path2D，每桶一次 fill。 */
  function starField(g, vm) {
    var BUCKETS = root.SkyVM.buckets.dust;
    var hasP2D = (typeof Path2D !== 'undefined');
    var paths = [], i;
    for (i = 0; i < BUCKETS; i++) paths.push(hasP2D ? new Path2D() : null);
    var fallback = [];
    vm.dust.points.forEach(function (dp) {
      if (hasP2D) {
        paths[dp.bucket].moveTo(dp.x + dp.r, dp.y);
        paths[dp.bucket].arc(dp.x, dp.y, dp.r, 0, Math.PI * 2);
      } else {
        fallback.push(dp);
      }
    });
    for (i = 0; i < BUCKETS; i++) {
      if (hasP2D) {
        if (!paths[i]) continue;
        g.fillStyle = 'rgba(207,221,245,' + (0.2 + (i + 0.5) / BUCKETS * 0.34).toFixed(3) + ')';
        g.fill(paths[i]);
      }
    }
    if (!hasP2D) {
      for (i = 0; i < fallback.length; i++) {
        var f = fallback[i];
        g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        g.fillStyle = 'rgba(207,221,245,' + (0.2 + (f.bucket + 0.5) / BUCKETS * 0.34).toFixed(3) + ')';
        g.fill();
      }
    }
  }

  /* ---- L1 真实亮星星场（V2-SKY 阶段 2B）----
   * 数据：BSC5P（公有领域，NASA HEASARC 修订版），见 core/sky-star-data.js。
   * 保留既有带名亮星 hit，其余仅绘制；不参与标签、不改 vm.stars。
   * 按「5 亮度桶 × 33 色温组」合并成 165 个 Path2D，避免逐星 fill。
   * 颜色由 B-V 近似（无 B-V 时用光谱型首字母兜底），不是肉眼实景颜色。 */
  var FIELD_ALPHAS = [1, 0.9, 0.68, 0.42, 0.2];
  function fieldColorRGB(i) {
    var t = i / 32;
    var r = Math.round(198 + 57 * t), g = Math.round(214 + 12 * t), b = Math.round(255 - 59 * t);
    var mid = Math.max(0, 1 - Math.abs(t - 0.5) * 2);
    r = Math.round(r + (255 - r) * mid * 0.12);
    g = Math.round(g + (226 - g) * mid * 0.12);
    b = Math.round(b + (196 - b) * mid * 0.12);
    return r + ',' + g + ',' + b;
  }

  function fieldColorGroup(bv, cls) {
    if (typeof bv === 'number' && isFinite(bv)) {
      var ix = Math.max(0, Math.min(32, Math.round((bv + 0.4) * 10)));
      return ix;
    }
    var si = typeof cls === 'number' && cls >= 1 && cls <= 7 && cls % 1 === 0 ? cls - 1 : -1;
    if (si >= 0) return [0, 4, 8, 14, 20, 27, 32][si];
    return 16;
  }

  function fieldStars(g, vm, c) {
    var pts = vm.field;
    if (!pts || !pts.length) return;
    var hasP2D = (typeof Path2D !== 'undefined');
    var paths = [], i, j;
    for (i = 0; i < 5; i++) {
      var row = [];
      for (j = 0; j < 33; j++) row.push(hasP2D ? new Path2D() : []);
      paths.push(row);
    }
    var k = vm.view.k;
    for (i = 0; i < pts.length; i++) {
      var it = pts[i];
      var b = it.bucket < 0 ? 0 : (it.bucket > 4 ? 4 : it.bucket);
      var cg = fieldColorGroup(it.bv, it.cls);
      var t = paths[b][cg];
      var r = it.size < 0.6 ? 0.6 : it.size;
      if (hasP2D) { t.moveTo(it.x + r, it.y); t.arc(it.x, it.y, r, 0, Math.PI * 2); }
      else t.push({ x: it.x, y: it.y, r: r });
      /* 命中：只有带名称的亮星（V≤5.0）才可点，条件与 L0 恒星一致，
       * 避免数千颗暗星抢命中导致误点。 */
      if (c && it.en && it.mag <= 5 && it.alt > 0 && it.hitSize > 1.9 * k) {
        c.hits.push({
          x: it.x, y: it.y,
          r: Math.max(8 * k, it.hitSize + 4 * k),
          obj: {
            type: 'star',
            data: {
              k: 'l1:' + it.i, cn: it.cn || '', en: it.en,
              bayer: it.bayer || '', con: it.con || '',
              ra: it.ra, dec: it.dec, mag: it.mag, source: 'L1/BSC5P'
            }
          }
        });
      }
    }
    for (i = 0; i < 5; i++) {
      for (j = 0; j < 33; j++) {
        g.fillStyle = 'rgba(' + fieldColorRGB(j) + ',' + FIELD_ALPHAS[i] + ')';
        if (hasP2D) {
          g.fill(paths[i][j]);
        } else {
          var fb = paths[i][j];
          for (var k = 0; k < fb.length; k++) {
            g.beginPath(); g.arc(fb[k].x, fb[k].y, fb[k].r, 0, Math.PI * 2); g.fill();
          }
        }
      }
    }
  }

  /* ---- 亮星光晕（P1-2）----
   * 只对亮星（mag ≤ 2.5）叠加适度光晕，两档强度；预先渲染 64×64 精灵，
   * 逐帧只做 drawImage，避免每颗星创建径向渐变。不产生 hit，不改任何数据。 */
  var _glowSprite = null;
  function glowSprite() {
    if (_glowSprite || typeof document === 'undefined') return _glowSprite;
    var S = 64, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var cg = cv.getContext('2d');
    var gr = cg.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(236,242,255,0.90)');
    gr.addColorStop(0.22, 'rgba(214,227,250,0.34)');
    gr.addColorStop(0.55, 'rgba(186,206,244,0.10)');
    gr.addColorStop(1, 'rgba(160,186,235,0)');
    cg.fillStyle = gr;
    cg.fillRect(0, 0, S, S);
    _glowSprite = cv;
    return _glowSprite;
  }

  function starGlow(g, vm) {
    var sp = glowSprite();
    if (!sp) return;
    var W = vm.view.w, H = vm.view.h;
    g.save();
    vm.stars.forEach(function (it) {
      if (typeof it.mag !== 'number' || it.mag > 2.5 || it.alt <= 0) return;
      if (it.x < -60 || it.x > W + 60 || it.y < -60 || it.y > H + 60) return;
      var strong = it.mag <= 1.5;
      var r = Math.max(5, Math.min(30, it.size * (strong ? 5.4 : 3.6)));
      g.globalAlpha = strong ? 0.55 : 0.28;
      g.drawImage(sp, it.x - r, it.y - r, r * 2, r * 2);
    });
    g.restore();
  }

  /* ---- 恒星（按亮度分桶批量绘制，命中区同步创建）---- */
  function stars(g, vm, c) {
    var BUCKETS = root.SkyVM.buckets.stars;
    var hasP2D = (typeof Path2D !== 'undefined');
    var paths = [], i;
    for (i = 0; i < BUCKETS; i++) paths.push(hasP2D ? new Path2D() : null);
    var fb = [];
    vm.stars.forEach(function (it) {
      if (hasP2D) {
        paths[it.bucket].moveTo(it.x + it.size, it.y);
        paths[it.bucket].arc(it.x, it.y, it.size, 0, Math.PI * 2);
      } else {
        fb.push(it);
      }
      if (it.alt > 0 && it.size > 1.9 * vm.view.k) {
        c.hits.push({
          x: it.x, y: it.y,
          r: Math.max(9 * vm.view.k, it.size + 5 * vm.view.k),
          obj: { type: 'star', data: it.raw || root.SkyVM.starByKey(it.key) }
        });
      }
    });
    var alphas = [1, 0.9, 0.68, 0.42, 0.2];
    for (i = 0; i < BUCKETS; i++) {
      if (hasP2D) {
        if (!paths[i]) continue;
        g.fillStyle = 'rgba(226,234,248,' + alphas[i] + ')';
        g.fill(paths[i]);
      }
    }
    if (!hasP2D) {
      for (i = 0; i < fb.length; i++) {
        var f = fb[i];
        g.beginPath(); g.arc(f.x, f.y, f.size, 0, Math.PI * 2);
        g.fillStyle = 'rgba(226,234,248,' + alphas[f.bucket] + ')';
        g.fill();
      }
    }
  }

  /* ---- 深空天体 ---- */
  function deepSky(g, vm, c) {
    var k = vm.view.k;
    vm.dso.forEach(function (it) {
      var r = it.r;
      g.beginPath();
      g.moveTo(it.x, it.y - r); g.lineTo(it.x + r, it.y);
      g.lineTo(it.x, it.y + r); g.lineTo(it.x - r, it.y); g.closePath();
      g.strokeStyle = 'rgba(186,166,232,0.8)'; g.lineWidth = Math.max(0.6, 0.9 * k); g.stroke();
      g.fillStyle = 'rgba(186,166,232,0.16)'; g.fill();
      c.hits.push({ x: it.x, y: it.y, r: 11 * k, obj: { type: 'dso', data: it.raw } });
    });
  }

  /* ---- 星座连线 ---- */
  function constellationLines(g, vm) {
    var k = vm.view.k;
    var detail = vm.view.detail;
    g.lineWidth = Math.max(0.6, (detail ? 1.1 : 0.9) * k);
    g.strokeStyle = 'rgba(140,170,235,' + (detail ? 0.26 : 0.18) + ')';
    vm.constellations.forEach(function (rec) {
      rec.segs.forEach(function (sg) {
        g.beginPath(); g.moveTo(sg.ax, sg.ay); g.lineTo(sg.bx, sg.by); g.stroke();
      });
    });
  }

  /* 相位遮罩（阶段 4）：把背光侧压暗，形态由相位角决定。
   * 终结线投影为椭圆（半长轴 r、半短轴 r·|cos i|）：
   *   i<90°（凸相）椭圆向左收，i>90°（残月/新月）向右鼓。
   * 角度 ang 指向太阳，+x 为受光侧。 */
  function nightOverlay(g, cx, cy, r, iDeg, ang) {
    var k = Math.cos(iDeg * Math.PI / 180);
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.translate(cx, cy); g.rotate(ang);
    g.beginPath();
    g.arc(0, 0, r, Math.PI / 2, Math.PI * 1.5, false);
    if (k >= 0) g.ellipse(0, 0, k * r, r, 0, Math.PI * 1.5, Math.PI / 2, true);
    else g.ellipse(0, 0, -k * r, r, 0, Math.PI * 1.5, Math.PI / 2, false);
    g.closePath();
    g.fillStyle = 'rgba(3,5,10,0.93)';
    g.fill();
    g.restore();
  }

  /* ---- 行星 / 月球 / 太阳：球体 ---- */
  function bodyLayer(g, vm, c) {
    var W = vm.view.w;
    var k = vm.view.k;
    var PV = root.PlanetVisuals;
    var jd = vm.meta ? vm.meta.jd : NaN;
    var sunQ = vm.sun.visible ? { x: vm.sun.x, y: vm.sun.y } : null;

    /* 土星环：按真实环倾角 B 计算短轴，并分成 C/B/卡西尼缝/A 四条带，
     * 不再是单根灰环。环面接近侧视时短轴趋零（2025 年前后的环面穿越）。 */
    var satTilt = (PV && PV.ringTilt) ? PV.ringTilt(jd) : null;
    var ringRyFactor = 0.62;
    if (satTilt != null && isFinite(satTilt)) {
      ringRyFactor = Math.abs(Math.sin(satTilt * Math.PI / 180));
    }
    var RING_BANDS = [
      [1.30, 1.42, 0.26],   /* C 环：暗、窄 */
      [1.44, 1.72, 0.62],   /* B 环：最亮最宽 */
      [1.74, 1.80, 0.10],   /* 卡西尼缝 */
      [1.82, 1.99, 0.44]    /* A 环 */
    ];
    function drawRingBands(g, q, r, front) {
      g.save();
      g.translate(q.x, q.y);
      g.rotate(-0.38);
      g.lineCap = 'butt';
      for (var i = 0; i < RING_BANDS.length; i++) {
        var bd = RING_BANDS[i];
        var rr = (bd[0] + bd[1]) / 2;
        var rx = r * rr;
        var ry = Math.max(0.5, r * 1.95 * ringRyFactor * rr / 1.95);
        g.strokeStyle = 'rgba(232,216,182,' + bd[2] + ')';
        g.lineWidth = Math.max(0.8, r * (bd[1] - bd[0]) * 0.9);
        g.beginPath();
        if (front) g.ellipse(0, 0, rx, ry, 0, 0, Math.PI);
        else g.ellipse(0, 0, rx, ry, 0, Math.PI, Math.PI * 2);
        g.stroke();
      }
      g.restore();
    }

    vm.bodies.forEach(function (src) {
      var q = { x: src.x, y: src.y };
      var r = src.r;
      var info = src.info || {};
      var alpha = src.below ? 0.35 : 1;

      /* 光照方向：朝太阳 */
      var lx = -0.45, ly = -0.6;
      if (sunQ) {
        var dx = sunQ.x - q.x, dy = sunQ.y - q.y;
        var dl = Math.hypot(dx, dy) || 1;
        lx = dx / dl; ly = dy / dl;
      }

      g.save();
      g.globalAlpha = alpha;

      /* 光晕 */
      var halo = g.createRadialGradient(q.x, q.y, r * 0.8, q.x, q.y, r * 3.4);
      halo.addColorStop(0, hexA(info.glow || info.color || '#ffffff', 0.24));
      halo.addColorStop(1, hexA(info.glow || info.color || '#ffffff', 0));
      g.beginPath(); g.arc(q.x, q.y, r * 3.4, 0, Math.PI * 2);
      g.fillStyle = halo; g.fill();

      /* 土星环（后半） */
      if (info.ring) drawRingBands(g, q, r, false);

      if (src.kind === 'moon') {
        var ang = Math.atan2(ly, lx);
        g.save(); g.translate(q.x, q.y); g.rotate(ang);
        miniMoon(g, 0, 0, r, src.phase.illum, true);
        g.restore();
      } else {
        /* 真实感优先：有 PlanetTextures 且半径够大时，直接用球面贴图精灵
         * （经纬带纹 + Lambert 光照 + 临边辉光），否则退回渐变球 + 简化纹理。 */
        var PT = root.PlanetTextures;
        var drewSprite = false;
        if (src.kind === 'planet' && PT && PT.sphereSprite && r >= 5) {
          var spr = PT.sphereSprite(src.key, r > 34 ? 160 : 96, Math.atan2(ly, lx));
          if (spr) {
            g.drawImage(spr, q.x - r, q.y - r, r * 2, r * 2);
            drewSprite = true;
          }
        }
        if (!drewSprite) {
        var base = info.color || '#cfcfcf';
        var sph = g.createRadialGradient(q.x + lx * r * 0.42, q.y + ly * r * 0.42, r * 0.08,
          q.x, q.y, r * 1.06);
        sph.addColorStop(0, mixColor(base, '#ffffff', src.kind === 'sun' ? 0.75 : 0.42));
        sph.addColorStop(0.55, base);
        sph.addColorStop(1, mixColor(base, '#05070d', 0.62));
        g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2);
        g.fillStyle = sph; g.fill();

        /* 程序化磁盘纹理：仅在半径足够大时贴，避免小尺寸变噪点 */
        var drewTex = false;
        if (PV && PV.diskTexture && r >= 7) {
          var tex = PV.diskTexture(src.key);
          if (tex) {
            g.save();
            g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.clip();
            g.globalAlpha = alpha * 0.62;
            g.drawImage(tex, q.x - r, q.y - r, r * 2, r * 2);
            g.restore();
            drewTex = true;
          }
        }

        /* 木星条纹（无纹理时的降级） */
        if (info.bands && !drewTex) {
          g.save();
          g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.clip();
          g.globalAlpha = alpha * 0.28;
          g.fillStyle = '#8f6b45';
          [[-0.42, 0.16], [0.05, 0.20], [0.48, 0.14]].forEach(function (bd) {
            g.fillRect(q.x - r, q.y + bd[0] * r, r * 2, bd[1] * r);
          });
          g.restore();
        }
        /* 地表纹理（火星/金星淡淡一条，无纹理时的降级） */
        if (src.key === 'mars' && !drewTex) {
          g.save();
          g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.clip();
          g.globalAlpha = alpha * 0.22;
          g.fillStyle = '#f2e3d2';
          g.beginPath(); g.ellipse(q.x, q.y - r * 0.75, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        }

        /* 相位遮罩：太阳不遮；月球已由 miniMoon 处理 */
        if (src.kind !== 'sun' && PV && PV.phaseAngle && r >= 3.5) {
          var iDeg = PV.phaseAngle(src.key, jd);
          if (iDeg != null && iDeg > 2) {
            nightOverlay(g, q.x, q.y, r, iDeg, Math.atan2(ly, lx));
          }
        }
        }
      }

      /* 土星环（前半） */
      if (info.ring) drawRingBands(g, q, r, true);

      /* 地平线以下：虚线环标记，仍可点开查看资料。
       * 接近地平线（−6°~0°）时加强对比，明确「刚落下」而不是「看不见」。 */
      if (src.below) {
        var nearHz = src.alt > -6;
        g.save();
        g.setLineDash(nearHz ? [5 * k, 2 * k] : [3 * k, 3 * k]);
        g.strokeStyle = hexA(info.color || '#ffffff', nearHz ? 0.72 : 0.45);
        g.lineWidth = Math.max(0.8, (nearHz ? 1.3 : 1) * k);
        g.beginPath(); g.arc(q.x, q.y, r * 1.34, 0, Math.PI * 2); g.stroke();
        g.restore();
      }

      g.restore();

      /* 命中/详情使用的记录保持旧字段集合（不含 x/y，pt 为投影点） */
      var rec = {
        kind: src.kind, key: src.key, name: src.name, info: info,
        ra: src.ra, dec: src.dec, mag: src.mag,
        az: src.az, alt: src.alt, below: src.below,
        pt: { x: q.x, y: q.y }, r: r
      };
      if (src.dist !== undefined) rec.dist = src.dist;
      if (src.phase !== undefined) rec.phase = src.phase;
      c.bodies.push(rec);
      c.hits.push({
        x: q.x, y: q.y, r: Math.max(r * 1.35, 14 * k),
        obj: { type: src.kind === 'moon' ? 'moon' : src.kind, data: rec }
      });
    });
  }

  /* ---- 地平线与地面 ---- */
  function horizonAndGround(g, vm) {
    var W = vm.view.w, H = vm.view.h;
    var cx = vm.view.cx, cy = vm.view.cy, Rmax = vm.view.rmax;
    var k = vm.view.k, yaw = vm.view.yaw;
    var proj = vm.project;
    var hzPts = vm.horizon.points;
    if (!vm.horizon.visible) return;
    var hMin = vm.horizon.hMin;

    /* 只在天穹圆内绘制地面，圆外留黑，避免出现贯穿画面的假地平线 */
    g.save();
    g.beginPath(); g.arc(cx, cy, Rmax, 0, Math.PI * 2); g.clip();

    /* 地平光害：以地平线为中心的柔和带，两侧渐隐避免硬边 */
    var glowH = Math.max(80, H * 0.22);
    var gl = g.createLinearGradient(0, hMin - glowH, 0, hMin + glowH * 0.35);
    gl.addColorStop(0, 'rgba(198,152,98,0)');
    gl.addColorStop(0.62, 'rgba(198,152,98,0.10)');
    gl.addColorStop(0.82, 'rgba(206,160,104,0.20)');
    gl.addColorStop(1, 'rgba(206,160,104,0)');
    g.fillStyle = gl;
    g.fillRect(0, hMin - glowH, W, glowH * 1.35);

    /* 地面底色 */
    g.beginPath();
    g.moveTo(-10, H + 10);
    hzPts.forEach(function (q) { g.lineTo(q.x, q.y); });
    g.lineTo(W + 10, H + 10);
    g.closePath();
    var gnd = g.createLinearGradient(0, hMin, 0, H);
    gnd.addColorStop(0, '#0a1422');
    gnd.addColorStop(0.35, '#050a12');
    gnd.addColorStop(1, '#010204');
    g.fillStyle = gnd;
    g.fill();

    /* 地面方位辐线：从地平线向脚下收敛，给出「站在地表」的纵深 */
    g.strokeStyle = 'rgba(132,172,214,0.15)';
    g.lineWidth = Math.max(0.6, 0.85 * k);
    for (var sa = Math.ceil((yaw - 92) / 30) * 30; sa <= yaw + 92; sa += 30) {
      var sOn = false;
      g.beginPath();
      for (var sAlt = -2; sAlt >= -64; sAlt -= 2) {
        var qs = proj(sa, sAlt);
        if (!qs) { sOn = false; continue; }
        if (!sOn) { g.moveTo(qs.x, qs.y); sOn = true; } else g.lineTo(qs.x, qs.y);
      }
      g.stroke();
    }

    /* 负高度圈：地平面以下的刻度，读起来像脚下的球面 */
    g.strokeStyle = 'rgba(132,172,214,0.12)';
    [-15, -30, -45].forEach(function (altLv) {
      var on2 = false;
      g.beginPath();
      for (var az2 = yaw - 95; az2 <= yaw + 95; az2 += 2) {
        var qa2 = proj(az2, altLv);
        if (!qa2) { on2 = false; continue; }
        if (!on2) { g.moveTo(qa2.x, qa2.y); on2 = true; } else g.lineTo(qa2.x, qa2.y);
      }
      g.stroke();
      var qt = proj(yaw, altLv);
      if (qt && qt.x > 40 && qt.x < W - 40 && qt.y < H - 4) {
        g.textAlign = 'center';
        g.font = '400 ' + Math.max(9, 11 * k) + 'px "PingFang SC",sans-serif';
        g.fillStyle = 'rgba(150,178,210,0.40)';
        g.fillText('−' + Math.abs(altLv) + '°', qt.x, qt.y - 5);
        g.textAlign = 'left';
      }
    });

    /* 两层山脊：远山略亮、近山更暗，形成纵深 */
    function ridge(seed, amp, offset, fill) {
      g.beginPath();
      g.moveTo(-10, H + 10);
      hzPts.forEach(function (q) {
        var t = q.x / W;
        var hgt = offset + Math.sin(t * Math.PI * (2.2 + seed) + seed) * amp
          + Math.sin(t * Math.PI * (6.1 + seed) + seed * 2) * amp * 0.35;
        g.lineTo(q.x, q.y + hgt);
      });
      g.lineTo(W + 10, H + 10);
      g.closePath();
      g.fillStyle = fill;
      g.fill();
    }
    ridge(0.3, H * 0.016, H * 0.004, '#0c1522');
    ridge(1.7, H * 0.028, H * 0.026, '#05080f');

    /* 地平线 */
    g.beginPath();
    hzPts.forEach(function (q, i) { if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); });
    g.strokeStyle = 'rgba(226,190,132,0.8)';
    g.lineWidth = Math.max(1.2, 1.4 * k);
    g.stroke();
    g.restore();
  }

  /* ---- 方位标注 ---- */
  function directionLabels(g, vm) {
    var proj = vm.project;
    var k = vm.view.k, W = vm.view.w;
    var yaw = vm.view.yaw;

    /* 细刻度（每 10°）与主刻度（每 30°）：随 yaw 实时重算，只在视野内绘制。
     * 刻度画在地平线上方，避免与地面辐线混淆。 */
    var minorL = Math.max(3, 5 * k);
    var majorL = Math.max(5, 9 * k);
    g.save();
    g.lineWidth = Math.max(0.6, 0.8 * k);
    g.strokeStyle = 'rgba(132,172,214,0.30)';
    g.beginPath();
    for (var a10 = Math.ceil((yaw - 95) / 10) * 10; a10 <= yaw + 95; a10 += 10) {
      if (((a10 % 30) + 30) % 30 === 0) continue;
      var qm = proj(a10, 0);
      if (!qm || qm.x < 8 || qm.x > W - 8) continue;
      g.moveTo(qm.x, qm.y);
      g.lineTo(qm.x, qm.y - minorL);
    }
    g.stroke();

    g.strokeStyle = 'rgba(170,196,226,0.55)';
    g.beginPath();
    for (var a30 = Math.ceil((yaw - 95) / 30) * 30; a30 <= yaw + 95; a30 += 30) {
      var qM = proj(a30, 0);
      if (!qM || qM.x < 8 || qM.x > W - 8) continue;
      g.moveTo(qM.x, qM.y);
      g.lineTo(qM.x, qM.y - majorL);
    }
    g.stroke();
    g.restore();

    /* 主刻度度数（跳过四正方向，那里已有字母） */
    g.textAlign = 'center';
    g.font = '400 ' + Math.max(9, 11 * k) + 'px "PingFang SC",sans-serif';
    for (var a30b = Math.ceil((yaw - 95) / 30) * 30; a30b <= yaw + 95; a30b += 30) {
      if (((a30b % 360) + 360) % 360 % 90 === 0) continue;
      var qd = proj(a30b, 0);
      if (!qd || qd.x < 18 || qd.x > W - 18) continue;
      g.fillStyle = 'rgba(170,190,215,0.45)';
      g.fillText(((a30b % 360) + 360) % 360 + '°', qd.x, qd.y + 13 * k);
    }

    /* 八向字母 */
    g.font = '500 ' + Math.max(11, 15 * k) + 'px "PingFang SC",sans-serif';
    [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]].forEach(function (dir) {
      var q = proj(dir[1], 0);
      if (!q || q.x < 10 || q.x > W - 10) return;
      g.fillStyle = 'rgba(216,226,244,0.55)';
      g.fillText(dir[0], q.x, q.y + 20 * k);
    });
    g.textAlign = 'left';
  }

  /* ---- 标签（避让）---- */
  function labels(g, vm, c) {
    var W = vm.view.w;
    var k = vm.view.k;
    var detail = vm.view.detail;
    var placed = [];

    function fits(x, y, w, h) {
      for (var i = 0; i < placed.length; i++) {
        var b2 = placed[i];
        if (x < b2.x + b2.w && x + w > b2.x && y < b2.y + b2.h && y + h > b2.y) return false;
      }
      return true;
    }
    function put(text, x, y, font, color, align) {
      g.font = font;
      var w = g.measureText(text).width;
      var bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      var hh = parseInt(font.match(/(\d+)px/)[1], 10) + 6;
      if (bx + w > W - 4) bx = W - 4 - w;
      if (bx < 4) bx = 4;
      if (!fits(bx - 4, y - hh + 4, w + 8, hh)) return false;
      placed.push({ x: bx - 4, y: y - hh + 4, w: w + 8, h: hh });
      g.shadowColor = 'rgba(4,7,12,0.95)'; g.shadowBlur = 6;
      g.fillStyle = color;
      g.fillText(text, bx, y);
      g.shadowBlur = 0;
      return true;
    }

    var FS = '500 ' + Math.max(11, 14 * k) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    var FSsm = '400 ' + Math.max(9.5, 12 * k) + 'px "PingFang SC","Microsoft YaHei",sans-serif';

    /* 行星名（优先占位） */
    c.bodies.forEach(function (b) {
      put((b.below ? '↓ 已落下 ' : '') + b.name + (detail ? ' ' + Math.round(b.alt) + '°' : ''),
        b.pt.x, b.pt.y - b.r - 8 * k, FS,
        hexA(b.info.color || '#ffffff', b.below ? 0.55 : 0.95), 'center');
    });

    /* 高亮目标 */
    if (vm.highlight && vm.highlight.visible) {
      var hq = { x: vm.highlight.x, y: vm.highlight.y };
      g.beginPath(); g.arc(hq.x, hq.y, 15 * k, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(232,200,148,0.85)'; g.lineWidth = 2 * k; g.stroke();
      g.beginPath(); g.arc(hq.x, hq.y, 23 * k, 0, Math.PI * 2);
      g.strokeStyle = 'rgba(232,200,148,0.22)'; g.lineWidth = 1; g.stroke();
      put(vm.highlight.label, hq.x, hq.y - 26 * k, FS, '#e8c894', 'center');
    }

    if (detail) {
      vm.dso.slice().sort(function (a, b) { return a.mag - b.mag; }).forEach(function (x) {
        put(String(x.id).replace('NGC ', 'N'), x.x + 6 * k, x.y + 4 * k, FSsm, 'rgba(198,182,232,0.78)');
      });
      vm.stars.slice().sort(function (a, b) { return a.mag - b.mag; }).forEach(function (x) {
        if (x.mag < 3.6 && x.alt > 4) {
          put(x.cn || x.en, x.x + 5 * k, x.y + 4 * k, FSsm, 'rgba(222,229,242,0.6)');
        }
      });
      C.constellations.forEach(function (cn) {
        var sx = 0, sy = 0, n = 0;
        cn.lines.reduce(function (a, s2) { return a.concat(s2); }, []).forEach(function (kk) {
          var sp = vm.stars.filter(function (z) { return z.key === kk; })[0];
          if (!sp || sp.alt < 12) return;
          sx += sp.x; sy += sp.y; n++;
        });
        if (n >= 3) {
          put(cn.cn.replace('（北斗七星）', '') + ' ' + cn.abbr, sx / n, sy / n,
            'italic 400 ' + Math.max(11, 14 * k) + 'px Georgia,"Songti SC",serif',
            'rgba(152,176,222,0.32)', 'center');
        }
      });
    }
  }

  /* ---- 地球小窗 ---- */
  function globe(g, vm) {
    var W = vm.view.w, H = vm.view.h;
    var gr = Math.min(W, H) * 0.075;
    drawGlobe(g, W - gr - 14, gr + 14, gr, vm.meta.lat, vm.meta.lon, vm.meta.jd,
      Math.max(0.7, gr / 46), vm.view.compact);
  }

  /* 星图内的小月相 */
  function miniMoon(g, x, y, r, illum, waxing) {
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#eae5d7'; g.fill();
    g.clip();
    var c = (1 - 2 * illum) * r;
    g.fillStyle = 'rgba(5,8,14,0.95)';
    for (var dx = -r; dx <= r; dx += 0.8) {
      var chord = Math.sqrt(Math.max(0, r * r - dx * dx));
      var spans = [];
      if (Math.abs(c) < 0.5) { if (dx >= 0) spans.push([-chord, chord]); }
      else if (c > 0) {
        if (dx > 0) {
          var t1 = dx / c;
          if (t1 >= 1) spans.push([-chord, chord]);
          else { var y1 = r * Math.sqrt(1 - t1 * t1); spans.push([-chord, -y1], [y1, chord]); }
        }
      } else {
        if (dx >= 0) spans.push([-chord, chord]);
        else {
          var t2 = dx / c;
          if (t2 < 1) { var y2 = r * Math.sqrt(1 - t2 * t2); spans.push([-y2, y2]); }
        }
      }
      spans.forEach(function (sp) {
        if (sp[1] - sp[0] > 0.3) g.fillRect(x + dx, y + sp[0], 0.9, sp[1] - sp[0]);
      });
    }
    if (!waxing) { /* 已按 waxing 绘制，亏月时整体镜像 */ }
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(234,229,215,0.5)'; g.lineWidth = 0.8; g.stroke();
  }

  /* 地球小窗：以观测者为球心，含昼夜线与「你在这里」 */
  function drawGlobe(g, cx, cy, R, lat, lon, jd, k, compact) {
    var D = A.RAD;
    var sun = A.sun(jd);
    var gmst = A.lstHours(jd, 0) * 15;
    var subLon = A.norm180(sun.ra * 15 - gmst);
    var subLat = sun.dec;

    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();

    var sea = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
    sea.addColorStop(0, '#1c3b57');
    sea.addColorStop(1, '#0b1a2a');
    g.fillStyle = sea;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);

    /* 经纬网 */
    function proj(latD, lonD) {
      var dL = (lonD - lon) * D, p1 = latD * D, p0 = lat * D;
      var x = Math.cos(p1) * Math.sin(dL);
      var y = Math.cos(p0) * Math.sin(p1) - Math.sin(p0) * Math.cos(p1) * Math.cos(dL);
      var z = Math.sin(p0) * Math.sin(p1) + Math.cos(p0) * Math.cos(p1) * Math.cos(dL);
      return { x: cx + x * R, y: cy - y * R, vis: z > 0 };
    }
    g.strokeStyle = 'rgba(160,200,235,0.18)';
    g.lineWidth = Math.max(0.5, 0.7 * k);
    for (var la = -60; la <= 60; la += 30) {
      g.beginPath();
      var started = false;
      for (var lo = -180; lo <= 180; lo += 6) {
        var q = proj(la, lo);
        if (!q.vis) { started = false; continue; }
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke();
    }
    for (var lo2 = -180; lo2 < 180; lo2 += 30) {
      g.beginPath();
      var st2 = false;
      for (var la2 = -90; la2 <= 90; la2 += 6) {
        var q2 = proj(la2, lo2);
        if (!q2.vis) { st2 = false; continue; }
        if (!st2) { g.moveTo(q2.x, q2.y); st2 = true; } else g.lineTo(q2.x, q2.y);
      }
      g.stroke();
    }

    /* 昼夜：采样网格填充夜半球 */
    g.fillStyle = 'rgba(2,6,14,0.62)';
    var step = 5;
    for (var lt = -85; lt <= 85; lt += step) {
      for (var ln = -180; ln < 180; ln += step) {
        var sLat = lt * D, sLon = (ln - subLon) * D;
        var cosZ = Math.sin(lat * D) * Math.sin(sLat) +
          Math.cos(lat * D) * Math.cos(sLat) * Math.cos((ln - lon) * D);
        var sunElev = Math.sin(sLat) * Math.sin(subLat * D) +
          Math.cos(sLat) * Math.cos(subLat * D) * Math.cos(sLon);
        if (sunElev > 0) continue;
        var q3 = proj(lt, ln);
        if (!q3.vis) continue;
        var cell = R * step * D * 1.6;
        g.fillRect(q3.x - cell / 2, q3.y - cell / 2, cell * 1.15, cell * 1.15);
      }
    }

    /* 观测者（球心） */
    g.beginPath(); g.arc(cx, cy, Math.max(2, 2.2 * k), 0, Math.PI * 2);
    g.fillStyle = '#ffd79a'; g.fill();
    g.beginPath(); g.arc(cx, cy, Math.max(5, 6 * k), 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,215,154,0.5)'; g.lineWidth = 1; g.stroke();

    g.restore();

    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(180,205,235,0.35)'; g.lineWidth = Math.max(0.6, 0.8 * k); g.stroke();

    if (!compact) {
      g.font = '400 ' + (11 * k) + 'px "PingFang SC",sans-serif';
      g.fillStyle = 'rgba(196,210,230,0.6)';
      g.textAlign = 'center';
      g.fillText('你在这里', cx, cy + R + 14 * k);
      g.textAlign = 'left';
    }
  }

  /* ============================================================
     主入口：渲染一次并返回命中区
     ============================================================ */
  function paint(canvas, p, vm) {
    p = p || {};
    var g = canvas.getContext('2d');
    var layers = vm.layers;
    var c = {
      hits: [], bodies: [],
      W: vm.view.w, H: vm.view.h, k: vm.view.k
    };

    g.clearRect(0, 0, vm.view.w, vm.view.h);

    skyBackground(g, vm);
    var realBg = false;
    if (layers.milkyWay) {
      realBg = !!(root.SkyBackground && root.SkyBackground.draw(g, vm));
      if (!realBg) milkyWay(g, vm);
    }
    if (layers.stars) {
      /* 合成星场只在没有真实银河背景时绘制，避免与真实密度重复；
       * 图层归属仍由 stars 控制，没有迁移到 milkyWay。 */
      if (!realBg) starField(g, vm);
      fieldStars(g, vm, c);
      starGlow(g, vm);
      stars(g, vm, c);
    }
    if (layers.deepSkyObjects) deepSky(g, vm, c);
    if (layers.constellations) constellationLines(g, vm);
    if (layers.planets) bodyLayer(g, vm, c);
    if (layers.horizon) {
      horizonAndGround(g, vm);
      directionLabels(g, vm);
    }
    if (layers.labels && vm.view.showLabels) labels(g, vm, c);
    if (p.showGlobe) globe(g, vm);

    return {
      hits: c.hits,
      bodies: c.bodies,
      meta: { yaw: vm.view.yaw, pitch: vm.view.pitch, fov: vm.view.fov, hz: vm.horizon.points.length, hit: true }
    };
  }

  /* 最近一次绘制的参数：银河 150ms 去抖重建后用它做一次自恢复重绘，
   * 不依赖 app.js（app.js 仍只负责调用 drawSky 和写回返回值）。 */
  var lastPaint = null;

  function draw(canvas, p, vm) {
    var out = paint(canvas, p, vm);
    lastPaint = { canvas: canvas, p: p, vm: vm };
    return out;
  }

  /* 银河背景异步重建完成后需要重绘。优先交给 app 用「当前」相机参数重绘，
   * 否则会用 lastPaint 里过期的 vm 覆盖画面（拖动后视角被弹回、_meta 错乱）。 */
  var repaintHook = null;
  function setRepaintHook(fn) { repaintHook = fn; }

  if (root.SkyBackground && root.SkyBackground.onDirty) {
    root.SkyBackground.onDirty(function () {
      if (repaintHook) { try { repaintHook(); } catch (e) { } return; }
      if (!lastPaint) return;
      var lp = lastPaint, cv = lp.canvas;
      if (!cv || !cv.width || cv.width !== lp.vm.view.w) return;
      var out = paint(cv, lp.p, lp.vm);
      if (!out) return;
      cv._hits = out.hits;
      cv._bodies = out.bodies;
      cv._meta = out.meta;
    });
  }

  root.SkyRender = {
    version: '1.2.0',
    draw: draw,
    setRepaintHook: setRepaintHook,
    colors: { hexA: hexA, mixColor: mixColor }
  };
})(typeof window !== 'undefined' ? window : globalThis);
