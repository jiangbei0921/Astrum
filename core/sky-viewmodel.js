/* ASTRUM · 星图视图模型（V2-SKY 阶段 1）
 *
 * 职责：把「时刻 + 地点」的天文计算结果整理成绘制所需的标准视图数据。
 * 不负责位置计算：所有 alt/az 都来自 model() 里一次算好的缓存，build() 只做
 * 投影与视觉参数换算，绝不重新调用 A.altAz（高亮目标例外，与旧实现一致）。
 *
 * 边界：
 *   - 不修改 CATALOG 中的任何对象，视图对象全部新建；
 *   - 不修改 Astro.altAz / Astro.planets / Astro.sun / Astro.moonPhase；
 *   - 星表缺少 B-V、光谱、自行时，不生成对应字段（不伪造物理属性）；
 *   - 缓存只有一条（键 = 精度截断后的时刻+经纬度），由本模块独占。
 *
 * 依赖：window.Astro、window.CATALOG（只读）。
 */
(function (root) {
  'use strict';

  var A = root.Astro;
  var C = root.CATALOG;

  var CACHE = { key: '', model: null, buildMs: 0 };
  var BANDS = [9, 5, 2.2];          /* 银河三条带的线宽基准 */
  var DUST_BUCKETS = 6;             /* 背景星场亮度分桶数（与旧渲染一致） */
  var STAR_BUCKETS = 5;             /* 恒星亮度分桶数 */
  var _starIdx = null;

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  function cacheKey(jd, lat, lon) {
    return jd.toFixed(5) + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
  }

  function starByKey(k) {
    if (!_starIdx) {
      _starIdx = {};
      (C.stars || []).forEach(function (s) { _starIdx[s.k] = s; });
    }
    return _starIdx[k];
  }

  /* 银道坐标 -> 赤道坐标（J2000）。纯坐标变换，逐字沿用旧实现。 */
  function galToEq(l, b) {
    var D = A.RAD;
    var aG = 192.85948 * D, dG = 27.12825 * D, lN = 122.93192 * D;
    var lb = l * D, bb = b * D;
    var sinDec = Math.sin(dG) * Math.sin(bb) + Math.cos(dG) * Math.cos(bb) * Math.cos(lN - lb);
    var dec = Math.asin(Math.max(-1, Math.min(1, sinDec))) / D;
    var y = Math.cos(bb) * Math.sin(lN - lb);
    var x = Math.cos(dG) * Math.sin(bb) - Math.sin(dG) * Math.cos(bb) * Math.cos(lN - lb);
    var ra = (aG + Math.atan2(y, x)) / D;
    return { ra: A.norm360(ra) / 15, dec: dec };
  }

  /* 地平坐标（alt/az）-> 赤道坐标（J2000, 小时/度）。
   * 银河背景反投影采样使用；不改 astro.js 的正向 altAz 实现。
   * 边界：alt 夹到 ±90°，az 归一到 [0,360)，非法输入返回 null。 */
  function altAzToEq(alt, az, jd, lat, lon) {
    alt = Number(alt); az = Number(az);
    if (!isFinite(alt) || !isFinite(az) || !isFinite(jd) || !isFinite(lat) || !isFinite(lon)) return null;
    var D = A.RAD;
    var d = Math.max(-90, Math.min(90, alt)) * D;
    var phi = lat * D;
    var h = A.norm360(az) * D;
    var sinDec = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(h);
    var dec = Math.asin(Math.max(-1, Math.min(1, sinDec)) / 1) / D;
    var hAng = Math.atan2(-Math.sin(h) * Math.cos(d),
      Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(h));
    var ra = A.norm360(A.lstHours(jd, lon) * 15 - hAng / D) / 15;
    return { ra: ra, dec: dec };
  }

  /* 赤经赤纬 -> NASA SVS 赤道版 Plate Carrée 纹理 UV。
   * 图像中心 RA 0h、RA 向左增大；上边界 Dec +90°。 */
  function eqToUv(raHours, decDeg) {
    var u = (0.5 - raHours / 24) % 1;
    if (u < 0) u += 1;
    var v = Math.max(0, Math.min(1, 0.5 - decDeg / 180));
    return { u: u, v: v };
  }

  /* ============================================================
     天文数据缓存（旧 app.js skyModel 的等价实现）
     alt/az 只依赖 (时刻, 地点)，与相机无关：拖动相机时只做投影。
     ============================================================ */
  function model(jd, lat, lon) {
    var key = cacheKey(jd, lat, lon);
    if (CACHE.key === key && CACHE.model) return CACHE.model;
    var t0 = now();
    var m = { milky: [[], [], []], dust: [], stars: [], dso: [], cons: [], planets: [], sun: null, built: Date.now() };

    /* 银河带 */
    for (var b = 0; b < 3; b++) {
      for (var l = 0; l <= 360; l += 2) {
        var eq = galToEq(l, 0);
        var aa = A.altAz(eq.ra, eq.dec, jd, lat, lon);
        m.milky[b].push(aa);
      }
    }
    /* 背景星场（示意密度，非实测星表） */
    var seed = 20261022;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (var i = 0; i < 2400; i++) {
      var gl = rnd() * 360;
      var gb = (rnd() + rnd() + rnd() - 1.5) * 11;
      if (rnd() < 0.34) gb = (rnd() - 0.5) * 155;
      var geq = galToEq(gl, gb);
      var gaa = A.altAz(geq.ra, geq.dec, jd, lat, lon);
      if (gaa.alt < 0.5) continue;
      m.dust.push({ az: gaa.az, alt: gaa.alt, magF: 4.2 + rnd() * 2.8 });
    }
    /* 恒星 */
    C.stars.forEach(function (st) {
      var a = A.altAz(st.ra, st.dec, jd, lat, lon);
      if (a.alt < -1) return;
      m.stars.push({ st: st, az: a.az, alt: a.alt });
    });

    /* L1 视觉亮星表（阶段 2B）：与业务星表 CATALOG.stars 分离。
     * 不参与标签、不进入 vm.stars；保留渲染器内既有带名亮星命中，其余仅绘制；
     * 数据缺失时 m.l1 = null，渲染退化为阶段 1 表现。 */
    m.l1 = null;
    var SD = root.SkyStarData;
    var l1d = SD && SD.load ? SD.load() : null;
    if (l1d && l1d.n) {
      var az1 = new Float32Array(l1d.n);
      var alt1 = new Float32Array(l1d.n);
      var grid = [];
      for (var gi = 0; gi < 648; gi++) grid.push([]);
      for (var s1 = 0; s1 < l1d.n; s1++) {
        /* 数据文件存的是「度」，Astro.altAz 的 raH 参数是「小时」，必须 /15。
         * 这与 L0（data/catalog.js 直接存小时）不同，切勿混用。 */
        var aa1 = A.altAz(l1d.ra[s1] / 15, l1d.dec[s1], jd, lat, lon);
        az1[s1] = aa1.az;
        alt1[s1] = aa1.alt;
        var gx = Math.floor(A.norm360(aa1.az) / 10) % 36;
        var gy = Math.max(0, Math.min(17, Math.floor((aa1.alt + 90) / 10)));
        grid[gy * 36 + gx].push(s1);
      }
      m.l1 = { src: l1d, az: az1, alt: alt1, grid: grid };
    }
    /* 深空天体 */
    C.dso.forEach(function (dd) {
      var a = A.altAz(dd.ra, dd.dec, jd, lat, lon);
      if (a.alt < 0) return;
      m.dso.push({ d: dd, az: a.az, alt: a.alt });
    });
    /* 星座连线 */
    C.constellations.forEach(function (c) {
      var segs = [];
      c.lines.forEach(function (seg) {
        var s1 = starByKey(seg[0]), s2 = starByKey(seg[1]);
        if (!s1 || !s2) return;
        var a1 = A.altAz(s1.ra, s1.dec, jd, lat, lon);
        var a2 = A.altAz(s2.ra, s2.dec, jd, lat, lon);
        if (a1.alt < -1 || a2.alt < -1) return;
        segs.push([a1.az, a1.alt, a2.az, a2.alt]);
      });
      if (segs.length) m.cons.push({ c: c, segs: segs });
    });
    /* 太阳 */
    var sp = A.sun(jd);
    var saa = A.altAz(sp.ra, sp.dec, jd, lat, lon);
    m.sun = { ra: sp.ra, dec: sp.dec, az: saa.az, alt: saa.alt, pos: sp };
    /* 行星 */
    A.planets(jd).forEach(function (pl) {
      var a = A.altAz(pl.ra, pl.dec, jd, lat, lon);
      m.planets.push({ pl: pl, az: a.az, alt: a.alt });
    });
    /* 月球 */
    var mp = A.moonPhase(jd);
    var maa = A.altAz(mp.ra, mp.dec, jd, lat, lon);
    m.moon = { ra: mp.ra, dec: mp.dec, dist: mp.dist, phase: mp, az: maa.az, alt: maa.alt };

    CACHE.key = key;
    CACHE.model = m;
    CACHE.buildMs = Math.round((now() - t0) * 100) / 100;
    return m;
  }

  /* ============================================================
     投影：等距鱼眼（与旧 drawSky 完全一致）
     与视线夹角线性映射到半径，广角时不失真、可容纳整个天穹。
     ============================================================ */
  function projector(o) {
    o = o || {};
    var W = Math.max(1, o.width || 0);
    var H = Math.max(1, o.height || 0);
    var yaw = o.yaw == null ? 180 : o.yaw;
    var pitch = Math.max(-6, Math.min(78, o.pitch == null ? 12 : o.pitch));
    var fov = Math.max(30, Math.min(178, o.fov || 145));
    var D = A.RAD;
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.min(W, H) * 0.49;      /* 视场半径 */
    var halfFov = fov / 2 * D;
    var k = (Rmax / 450) * (100 / fov) * 1.45;   /* 字号与线宽随视场缩放 */

    var cp = Math.cos(pitch * D), sp = Math.sin(pitch * D);
    var fwd = [cp * Math.sin(yaw * D), cp * Math.cos(yaw * D), sp];
    /* 右手系：right 指向观测者右手侧（面南时西在右），up 指向天顶 */
    var right = vnorm(vcross(fwd, [0, 0, 1]));
    var upv = vcross(right, fwd);
    /* 视锥外判定的余弦阈值：与 ang > halfFov*1.02 等价，但对屏外点免去 acos。
     * 星场每帧投影上万次，绝大多数点落在视野外，早退省下大量反余弦。 */
    var cosHalfFov = Math.cos(halfFov * 1.02);

    function proj(az, alt) {
      var a1 = alt * D, a2 = az * D;
      var ca = Math.cos(a1);
      var v0 = ca * Math.sin(a2);
      var v1 = ca * Math.cos(a2);
      var v2 = Math.sin(a1);
      /* 内联点积，免去每次调用构造 [x,y,z] 临时数组 */
      var cosA = v0 * fwd[0] + v1 * fwd[1] + v2 * fwd[2];
      if (cosA < cosHalfFov) return null;
      if (cosA > 1) cosA = 1;
      var ang = Math.acos(cosA);
      var xr = v0 * right[0] + v1 * right[1] + v2 * right[2];
      var yr = v0 * upv[0] + v1 * upv[1] + v2 * upv[2];
      var len = Math.hypot(xr, yr);
      var rr = ang / halfFov * Rmax;
      if (len < 1e-6) return { x: cx, y: cy, z: cosA, ang: ang };
      return { x: cx + xr / len * rr, y: cy - yr / len * rr, z: cosA, ang: ang };
    }

    return {
      proj: proj,
      geom: {
        W: W, H: H, cx: cx, cy: cy, Rmax: Rmax, k: k,
        yaw: yaw, pitch: pitch, fov: fov, halfFov: halfFov
      }
    };
  }

  /* 向量工具：仅投影使用，逐字沿用旧实现 */
  function vcross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function vnorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* 视觉参数：星等 → 显示尺寸 / 透明度 / 亮度桶。公式与旧 drawSky 完全一致。 */
  function starVisual(mag, alt, k) {
    var size = Math.max(1.0 * k, (4.9 - (mag + 1.5) * 0.56) * k);
    var alpha = (mag < 1 ? 1 : mag < 2 ? 0.9 : mag < 3 ? 0.68 : 0.42)
      * (alt < 8 ? 0.6 + alt / 16 : 1);
    var bucket = Math.min(STAR_BUCKETS - 1, Math.max(0, Math.floor((1 - alpha) * STAR_BUCKETS)));
    return { size: size, alpha: alpha, bucket: bucket };
  }

  /* 行星/月球/太阳的显示半径：沿用旧的比例（BODY_INFO.scale），不是真实角直径 */
  function bodyVisual(info, kind, k) {
    var scale = (info && info.scale) || 0.4;
    var r = Math.max(3.2, 16 * scale * k * (kind === 'moon' || kind === 'sun' ? 1.55 : 1));
    return { r: r };
  }

  /* ============================================================
     视图模型：把缓存数据 + 投影 + 视觉参数合成绘制输入
     ============================================================ */
  function build(jd, lat, lon, opts) {
    opts = opts || {};
    var W = Math.max(1, opts.width || 0);
    var H = Math.max(1, opts.height || 0);
    var m = model(jd, lat, lon);
    var pr = projector({ width: W, height: H, yaw: opts.yaw, pitch: opts.pitch, fov: opts.fov });
    var proj = pr.proj;
    var geom = pr.geom;

    var style = opts.style || 'labeled';
    var detail = opts.detail === true || style === 'full';
    var compact = !!opts.compact;
    var showLabels = style !== 'minimal';
    var layers = opts.layers || (root.SkyLayers ? root.SkyLayers.normalize(null) : {
      stars: true, constellations: true, milkyWay: true, deepSkyObjects: true,
      planets: true, horizon: true, labels: true
    });

    var vm = {
      /* project 只做几何投影（无天文计算），供地平线网格、方位标注等绘制段复用 */
      project: proj,
      meta: { jd: jd, lat: lat, lon: lon, built: m.built, key: CACHE.key },
      view: {
        w: W, h: H, cx: geom.cx, cy: geom.cy, rmax: geom.Rmax, k: geom.k,
        yaw: geom.yaw, pitch: geom.pitch, fov: geom.fov,
        detail: detail, style: style, compact: compact, showLabels: showLabels,
        /* 拖动中为 true：银河栅格降到 128，松手后回到 160 */
        interactive: opts.interactive === true
      },
      layers: layers,
      counts: {
        stars: m.stars.length, dso: m.dso.length,
        constellations: m.cons.length, dust: m.dust.length
      },
      milky: [],
      dust: { total: m.dust.length, points: [] },
      field: [],
      stars: [],
      dso: [],
      constellations: [],
      bodies: [],
      sun: { x: 0, y: 0, visible: false, az: m.sun.az, alt: m.sun.alt },
      moon: { x: 0, y: 0, visible: false, az: m.moon.az, alt: m.moon.alt, ra: m.moon.ra, dec: m.moon.dec, phase: m.moon.phase },
      highlight: null,
      horizon: { points: [], hMin: 0, visible: false }
    };

    /* 银河：三条带；不可见处保留 null，供渲染器断线（与旧逻辑一致） */
    m.milky.forEach(function (pts, bi) {
      var out = [];
      for (var i = 0; i < pts.length; i++) {
        var q = proj(pts[i].az, pts[i].alt);
        out.push(q ? { x: q.x, y: q.y } : null);
      }
      vm.milky.push({ index: bi, width: BANDS[bi], points: out });
    });

    /* 背景星场：按亮度分桶合并 Path2D 的旧策略不变 */
    var dn = compact ? 700 : (opts.interactive ? 600 : m.dust.length);
    for (var di = 0; di < dn; di++) {
      var dp = m.dust[di];
      if (!dp) break;
      var dq = proj(dp.az, dp.alt);
      if (!dq || dq.z < 0.04) continue;
      if (dq.x < -20 || dq.x > W + 20 || dq.y < -20 || dq.y > H + 20) continue;
      var dal = (0.2 + ((dp.magF * 37) % 100) / 100 * 0.34) * Math.min(1, (dp.alt + 5) / 22) * (dq.z * 0.5 + 0.5);
      vm.dust.points.push({
        x: dq.x, y: dq.y,
        r: Math.max(0.6, (5.9 - dp.magF) * 0.95 * geom.k),
        alpha: dal,
        bucket: Math.min(DUST_BUCKETS - 1, Math.max(0, Math.floor(dal * DUST_BUCKETS)))
      });
    }

    /* 恒星 */
    m.stars.forEach(function (rec) {
      var q = proj(rec.az, rec.alt);
      if (!q) return;
      if (q.x < -60 || q.x > W + 60 || q.y < -60 || q.y > H + 60) return;
      var st = rec.st;
      var vs = starVisual(st.mag, rec.alt, geom.k);
      vm.stars.push({
        key: st.k, cn: st.cn, en: st.en, bayer: st.bayer, con: st.con,
        ra: st.ra, dec: st.dec, mag: st.mag,
        az: rec.az, alt: rec.alt,
        x: q.x, y: q.y,
        size: vs.size, alpha: vs.alpha, bucket: vs.bucket,
        raw: st
      });
    });

    /* L1 背景星场：与 vm.stars 完全分离，避免影响 L0 命中、详情与标签。
     * 只有带名称的亮星（V≤5.0）在渲染器里产生命中，其余仅绘制。 */
    if (m.l1 && layers.stars) {
      var l1s = m.l1.src, l1az = m.l1.az, l1alt = m.l1.alt;
      var l1names = root.SkyStarData;
      var candidates = [], seen = {};
      var centerAz = geom.yaw, centerAlt = geom.pitch;
      var centerD = A.RAD, radius = geom.halfFov * 1.02 + 8 * centerD;
      var cAlt = centerAlt * centerD, cAz = centerAz * centerD;
      var cosRadius = Math.cos(radius);
      for (var gy = 0; gy < 18; gy++) for (var gx = 0; gx < 36; gx++) {
        var ca = (gy * 10 - 90 + 5) * centerD, cz = (gx * 10 + 5) * centerD;
        if (Math.sin(cAlt) * Math.sin(ca) + Math.cos(cAlt) * Math.cos(ca) * Math.cos(cAz - cz) < cosRadius) continue;
        var cell = m.l1.grid[gy * 36 + gx];
        for (var ci = 0; ci < cell.length; ci++) if (!seen[cell[ci]]) { seen[cell[ci]] = true; candidates.push(cell[ci]); }
      }
      var maxMag = Math.max(5, 10 - (geom.fov - 30) * (4 / 148));
      candidates = candidates.filter(function (id) { return l1s.mag[id] <= maxMag; });
      candidates.sort(function (a, b) { return l1s.mag[a] - l1s.mag[b] || a - b; });
      if (candidates.length > 8000) candidates.length = 8000;
      candidates.sort(function (a, b) { return a - b; });
      for (var fi = 0; fi < candidates.length; fi++) {
        var idx = candidates[fi];
        var fAlt = l1alt[idx];
        if (fAlt < 0.3) continue;
        var fq = proj(l1az[idx], fAlt);
        if (!fq) continue;
        if (fq.x < -8 || fq.x > W + 8 || fq.y < -8 || fq.y > H + 8) continue;
        var fmag = l1s.mag[idx];
        var flux = Math.pow(10, -0.4 * fmag);
        var fsize = Math.max(0.6 * geom.k, Math.min(4.9 * geom.k, Math.sqrt(flux) * 1.8 * geom.k));
        var falpha = Math.min(1, Math.max(0.12, Math.log1p(flux * 100) / Math.log(101)))
          * (fAlt < 8 ? 0.6 + fAlt / 16 : 1);
        var fbucket = Math.min(STAR_BUCKETS - 1, Math.max(0, Math.floor((1 - falpha) * STAR_BUCKETS)));
        var nm = (l1names && l1names.nameAt) ? l1names.nameAt(idx) : null;
        var entry = {
          i: idx, x: fq.x, y: fq.y,
          /* 详情卡与 L0 一致按「小时」显示，故这里 /15；绘制尺寸仍用原始星等 */
          mag: Math.round(fmag * 100) / 100, alt: fAlt,
          size: fsize, alpha: falpha, bucket: fbucket,
          hitSize: starVisual(fmag, fAlt, geom.k).size,
          bv: l1s.bv[idx], cls: l1s.cls[idx],
          ra: l1s.ra[idx] / 15, dec: l1s.dec[idx]
        };
        /* 名称表存在才可点击：拜耳/弗兰斯蒂德名按末段拆出星座缩写 */
        if (nm) {
          entry.en = nm.name;
          entry.cn = '';
          entry.bayer = '';
          entry.con = '';
          if (nm.alt) {
            var parts = nm.alt.split(' ');
            if (parts.length >= 2) {
              entry.con = parts[parts.length - 1];
              entry.bayer = parts.slice(0, parts.length - 1).join(' ');
            } else {
              entry.bayer = nm.alt;
            }
          }
        }
        vm.field.push(entry);
      }
    }

    /* 深空天体 */
    if (detail || style === 'deep') {
      m.dso.forEach(function (rec) {
        var dd = rec.d;
        var q = proj(rec.az, rec.alt);
        if (!q || q.x < -40 || q.x > W + 40 || q.y < -40 || q.y > H + 40) return;
        vm.dso.push({
          id: dd.id, cn: dd.cn, en: dd.en, ra: dd.ra, dec: dd.dec, mag: dd.mag,
          type: dd.type, az: rec.az, alt: rec.alt,
          x: q.x, y: q.y,
          r: Math.max(2.2, (dd.mag < 5 ? 4 : dd.mag < 8 ? 3.2 : 2.6) * geom.k),
          raw: dd
        });
      });
    }

    /* 星座连线 */
    m.cons.forEach(function (rec) {
      var segs = [];
      rec.segs.forEach(function (sg) {
        var p1 = proj(sg[0], sg[1]), p2 = proj(sg[2], sg[3]);
        if (!p1 || !p2) return;
        segs.push({ ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
      });
      if (segs.length) {
        vm.constellations.push({ key: rec.c.key, cn: rec.c.cn, abbr: rec.c.abbr, segs: segs });
      }
    });

    /* 太阳系天体：先投影，渲染器只负责画 */
    var INFO = root.BODY_INFO || {};
    var sunQ = proj(m.sun.az, m.sun.alt);
    vm.sun.x = sunQ ? sunQ.x : 0;
    vm.sun.y = sunQ ? sunQ.y : 0;
    vm.sun.visible = !!sunQ;

    var moonQ = proj(m.moon.az, m.moon.alt);
    vm.moon.x = moonQ ? moonQ.x : 0;
    vm.moon.y = moonQ ? moonQ.y : 0;
    vm.moon.visible = !!moonQ;

    var mp = opts.phase || m.moon.phase;

    function pushBody(b) {
      var q = proj(b.az, b.alt);
      if (!q) return;
      if (q.x < -80 || q.x > W + 80) return;
      var info = b.info || {};
      var r = bodyVisual(info, b.kind, geom.k).r;
      vm.bodies.push({
        kind: b.kind, key: b.key, name: b.name, info: info,
        ra: b.ra, dec: b.dec, dist: b.dist, mag: b.mag,
        az: b.az, alt: b.alt, phase: b.phase,
        x: q.x, y: q.y, r: r, below: b.alt < 0
      });
    }

    m.planets.forEach(function (rec) {
      pushBody({
        kind: 'planet', key: rec.pl.key, name: rec.pl.cn, info: INFO[rec.pl.key] || {},
        ra: rec.pl.ra, dec: rec.pl.dec, dist: rec.pl.dist, mag: rec.pl.mag,
        az: rec.az, alt: rec.alt
      });
    });
    pushBody({
      kind: 'moon', key: 'moon', name: '月球', info: INFO.moon || {},
      ra: m.moon.ra, dec: m.moon.dec, mag: -12.7, phase: mp,
      az: m.moon.az, alt: m.moon.alt
    });
    if (m.sun.alt > -3) {
      pushBody({
        kind: 'sun', key: 'sun', name: '太阳', info: INFO.sun || {},
        ra: m.sun.ra, dec: m.sun.dec, mag: -26.7,
        az: m.sun.az, alt: m.sun.alt
      });
    }

    /* 高亮目标：旧实现每次绘制算一次 altAz，这里保持同样的调用次数与语义 */
    if (opts.highlight) {
      var ha = A.altAz(opts.highlight.ra, opts.highlight.dec, jd, lat, lon);
      var hq = proj(ha.az, ha.alt);
      vm.highlight = {
        x: hq ? hq.x : 0, y: hq ? hq.y : 0,
        visible: !!hq, label: opts.highlight.label || ''
      };
    }

    /* 地平线：不依赖任何天体数据，纯投影 */
    var hzPts = [];
    for (var haz = geom.yaw - 88; haz <= geom.yaw + 88; haz += 1.5) {
      var qh = proj(haz, 0);
      if (!qh) continue;
      hzPts.push({ x: qh.x, y: qh.y });
    }
    hzPts.sort(function (a, b) { return a.x - b.x; });
    vm.horizon.points = hzPts;
    vm.horizon.visible = hzPts.length > 1;
    vm.horizon.hMin = vm.horizon.visible
      ? Math.min.apply(null, hzPts.map(function (q) { return q.y; }))
      : 0;

    return vm;
  }

  root.SkyVM = {
    version: '1.1.0',
    model: model,
    build: build,
    projector: projector,
    starVisual: starVisual,
    bodyVisual: bodyVisual,
    starByKey: starByKey,
    galToEq: galToEq,
    altAzToEq: altAzToEq,
    eqToUv: eqToUv,
    cache: function () { return { key: CACHE.key, model: CACHE.model, buildMs: CACHE.buildMs }; },
    clear: function () { CACHE.key = ''; CACHE.model = null; CACHE.buildMs = 0; },
    buckets: { dust: DUST_BUCKETS, stars: STAR_BUCKETS }
  };
})(typeof window !== 'undefined' ? window : globalThis);
