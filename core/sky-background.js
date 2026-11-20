/* ASTRUM · 银河背景模块（V2-SKY 子阶段 2C）
 *
 * 数据：data/milkyway-bg.js 中的 NASA SVS 银河纹理（512×256 RGB565 + base64）。
 * 为什么不用 Image：file:// 下 Chrome 会把本地图片视为跨源，drawImage 后
 * getImageData 可能抛 SecurityError；且图片解码异步会让首帧缺背景。
 *
 * 两级缓存：
 *   1) 天空纹理 256×128（alt/az），时间/地点变化时重建，150ms 去抖；
 *   2) 屏幕栅格 160×160（低端/拖动中 128×128），相机/画布变化时重建。
 *
 * 本模块只负责背景：不读恒星/行星/星座数据，不创建任何 hit。
 * 依赖：window.Astro（只读）、window.SkyVM（altAzToEq/eqToUv）。
 */
(function (root) {
  'use strict';

  var A = root.Astro;

  var SKY_W = 256, SKY_H = 128;
  var RASTER_HI = 160, RASTER_LO = 128;
  var THROTTLE_MS = 150;
  /* ---- 视觉参数（集中管理，便于对比与回退） --------------------------
   * 基线（2C）：无色调映射、ALPHA 0.55。
   * 当前：亮度保比色调映射 + ALPHA 0.80，用于拉开银河与暗尘埃带的层次。
   * 回退：TONE_ENABLED=false 且 SKY_BACKGROUND_ALPHA=0.55 即回到基线。 */
  var TONE_ENABLED = true;
  var SKY_BRIGHTNESS_FLOOR = 10;     /* F：亮度底噪切除阈值（0–255） */
  var SKY_BRIGHTNESS_GAMMA = 1.45;   /* G：亮度对比曲线指数 */
  var SKY_BACKGROUND_ALPHA = 0.80;   /* 背景合成 alpha */

  var TEX = null;                 /* { w,h,data(Uint8Array rgb565),meta } */
  var SKY = { key: '', w: SKY_W, h: SKY_H, data: null };
  var RASTER = { key: '', w: 0, h: 0, canvas: null };
  /* 相机级栅格缓存：拖动/缩放时相机键每帧都变，单条缓存等于没有缓存。
   * 保留最近 4 个栅格，让来回拖动、档位切换、复位等复用已有结果。 */
  var RASTER_CACHE_MAX = 4;
  var RASTER_CACHE = [];
  var DIRTY = null;               /* 供渲染器注册的“可重绘”回调 */
  var PENDING = null;             /* 去抖中的重建任务 */
  var STATE = { ready: false, mode: 'auto', lastError: null };
  var STATS = {
    decodeMs: 0, skyBuilds: 0, rasterBuilds: 0, cacheHits: 0,
    lastSkyMs: 0, lastRasterMs: 0, lastDrawMs: 0,
    rasterW: 0, rasterH: 0, draws: 0, fallbacks: 0
  };

  function now() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /* 亮度保比 LUT：256 项，模块加载时生成一次。
   * Y' = 255 * ((Y - F)/(255 - F))^G；缩放因子 k = Y'/Y 作用于 RGB 三个通道，
   * 因此只改变亮度，不改变 R:G:B 比例（不破坏色相）。
   * 边界：Y<=0 → 0；Y>=255 → k=1；全程无 NaN/Infinity。 */
  var TONE = (function () {
    var span = 255 - SKY_BRIGHTNESS_FLOOR;
    var k = new Float64Array(256);
    for (var i = 0; i < 256; i++) {
      var y2 = 0;
      if (i > SKY_BRIGHTNESS_FLOOR) {
        y2 = 255 * Math.pow((i - SKY_BRIGHTNESS_FLOOR) / span, SKY_BRIGHTNESS_GAMMA);
        if (!isFinite(y2)) y2 = 255;
        if (y2 < 0) y2 = 0;
        if (y2 > 255) y2 = 255;
      }
      k[i] = i > 0 ? y2 / i : 0;
    }
    return { k: k };
  })();

  /* 热路径查表：直接整数索引，避免每像素函数调用与插值 */
  function toneK(lumY) {
    if (!TONE_ENABLED) return 1;
    var i = lumY < 0 ? 0 : (lumY > 255 ? 255 : (lumY | 0));
    return TONE.k[i];
  }

  function b64ToBytes(b64) {
    var bin = root.atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function load() {
    if (TEX) return true;
    if (STATE.mode !== 'auto') return false;
    if (STATE.ready) return true;
    try {
      var bg = root.MILKYWAY_BG;
      if (!bg || typeof bg.data !== 'string' || !bg.meta) throw new Error('MILKYWAY_BG 缺失');
      var t0 = now();
      var bytes = b64ToBytes(bg.data);
      var w = bg.meta.texture.width, h = bg.meta.texture.height;
      if (bytes.length !== w * h * 2) throw new Error('纹理字节数不匹配: ' + bytes.length + ' != ' + (w * h * 2));
      TEX = { w: w, h: h, data: bytes, meta: bg.meta };
      STATS.decodeMs = Math.round((now() - t0) * 100) / 100;
      STATE.ready = true;
      STATE.lastError = null;
      return true;
    } catch (e) {
      STATE.ready = false;
      STATE.lastError = String((e && e.message) || e);
      return false;
    }
  }

  /* RGB565（小端）采样；返回 [r,g,b] */
  function sampleTex(raHours, decDeg) {
    if (!TEX) return null;
    var uv = root.SkyVM.eqToUv(raHours, decDeg, 0);
    var x = Math.min(TEX.w - 1, Math.max(0, Math.floor(uv.u * TEX.w)));
    var y = Math.min(TEX.h - 1, Math.max(0, Math.floor(uv.v * TEX.h)));
    var o = (y * TEX.w + x) * 2;
    var v = TEX.data[o] | (TEX.data[o + 1] << 8);
    return [
      Math.round(((v >> 11) & 0x1f) * 255 / 31),
      Math.round(((v >> 5) & 0x3f) * 255 / 63),
      Math.round((v & 0x1f) * 255 / 31)
    ];
  }

  function skyKey(jd, lat, lon) {
    return Math.floor(jd * 1440) + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
  }

  function buildSky(jd, lat, lon) {
    if (!TEX && !load()) return null;
    var t0 = now();
    var data = new Uint8ClampedArray(SKY_W * SKY_H * 3);
    for (var y = 0; y < SKY_H; y++) {
      var alt = 90 - (y + 0.5) / SKY_H * 180;
      for (var x = 0; x < SKY_W; x++) {
        var az = (x + 0.5) / SKY_W * 360;
        var eq = root.SkyVM.altAzToEq(alt, az, jd, lat, lon);
        var o = (y * SKY_W + x) * 3;
        if (!eq) { data[o] = 0; data[o + 1] = 0; data[o + 2] = 0; continue; }
        var c = sampleTex(eq.ra, eq.dec);
        /* 亮度保比色调映射：压暗底噪、拉开高光，RGB 比例不变 */
        var lumY = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
        var s = toneK(lumY);
        data[o] = c[0] * s;
        data[o + 1] = c[1] * s;
        data[o + 2] = c[2] * s;
      }
    }
    SKY.key = skyKey(jd, lat, lon);
    SKY.data = data;
    SKY.lastAt = now();
    STATS.skyBuilds++;
    STATS.lastSkyMs = Math.round((now() - t0) * 100) / 100;
    return SKY;
  }

  function ensureSky(jd, lat, lon) {
    var key = skyKey(jd, lat, lon);
    if (SKY.data && SKY.key === key) { STATS.cacheHits++; return SKY; }
    if (PENDING) return SKY;
    if (SKY.data && (now() - (SKY.lastAt || 0)) < THROTTLE_MS) {
      /* 连续变化：复用旧纹理，150ms 后再重建，避免重复三角运算 */
      PENDING = setTimeout(function () {
        PENDING = null;
        buildSky(jd, lat, lon);
        if (DIRTY) { try { DIRTY(); } catch (e) { } }
      }, THROTTLE_MS);
      return SKY;
    }
    return buildSky(jd, lat, lon);
  }

  function sampleSky(u, v) {
    if (!SKY.data) return null;
    var x = Math.min(SKY_W - 1, Math.max(0, Math.floor(u * SKY_W)));
    var y = Math.min(SKY_H - 1, Math.max(0, Math.floor(v * SKY_H)));
    var o = (y * SKY_W + x) * 3;
    return [SKY.data[o], SKY.data[o + 1], SKY.data[o + 2]];
  }

  function rasterKey(vm, rw) {
    var v = vm.view;
    return [rw, v.yaw.toFixed(2), v.pitch.toFixed(2), v.fov.toFixed(2), v.w, v.h, SKY.key].join('|');
  }

  /* 栅格尺寸：拖动中用 128，静止用 160（大画布）。
   * 两档共用同一投影，只影响采样密度，不改变方位。 */
  function pickRasterSize(vm) {
    if (vm.view && vm.view.interactive) return RASTER_LO;
    var v = vm.view || {};
    return (v.w >= 1200 && v.h >= 700) ? RASTER_HI : RASTER_LO;
  }

  /* 纯计算：返回 RGBA 数组，便于 Node 测试与性能测量 */
  function computeRaster(vm, rwOverride) {
    var v = vm.view;
    var rw = rwOverride || ((v.w >= 1200 && v.h >= 700) ? RASTER_HI : RASTER_LO);
    var rh = rw;
    var D = Math.PI / 180;
    var yaw = v.yaw * D, pitch = v.pitch * D, fov = v.fov * D;
    var half = fov / 2;
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var fwd = [cp * Math.sin(yaw), cp * Math.cos(yaw), sp];
    var right = [fwd[1], -fwd[0], 0];
    var rl = Math.hypot(right[0], right[1]) || 1;
    right = [right[0] / rl, right[1] / rl, 0];
    var up = [
      right[1] * fwd[2] - right[2] * fwd[1],
      right[2] * fwd[0] - right[0] * fwd[2],
      right[0] * fwd[1] - right[1] * fwd[0]
    ];

    var N = 1024, CA = new Float64Array(N + 1), SA = new Float64Array(N + 1);
    for (var i = 0; i <= N; i++) { var a = i / N * half; CA[i] = Math.cos(a); SA[i] = Math.sin(a); }

    var out = new Uint8ClampedArray(rw * rh * 4);
    for (var py = 0; py < rh; py++) {
      var dy = 1 - (py + 0.5) / rh * 2;
      for (var px = 0; px < rw; px++) {
        var dx = (px + 0.5) / rw * 2 - 1;
        var rho = Math.hypot(dx, dy);
        var o = (py * rw + px) * 4;
        if (rho > 1) { out[o + 3] = 0; continue; }
        var bi = Math.round(rho * N), ca = CA[bi], sa = SA[bi];
        var rx = rho < 1e-6 ? 0 : dx / rho, ry = rho < 1e-6 ? 0 : dy / rho;
        var vx = fwd[0] * ca + (right[0] * rx + up[0] * ry) * sa;
        var vy = fwd[1] * ca + (right[1] * rx + up[1] * ry) * sa;
        var vz = fwd[2] * ca + (right[2] * rx + up[2] * ry) * sa;
        var alt = Math.asin(Math.max(-1, Math.min(1, vz)));
        var az = Math.atan2(vx, vy);
        /* 天空纹理的 x 轴以 az/360 构建（0=北、向东增大），此处必须同基准取样。
         * 之前是 (0.5 + az/2π)，与构建基准相差 180° 方位，会把银河整体绕天顶旋转。 */
        var u = (az / (2 * Math.PI)) % 1;
        if (u < 0) u += 1;
        var vv = 0.5 - alt / Math.PI;
        var c = sampleSky(u, vv);
        if (!c) continue;
        out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
      }
    }
    return { w: rw, h: rh, data: out };
  }

  function ensureRaster(vm) {
    var rw = pickRasterSize(vm);
    var key = rasterKey(vm, rw);
    if (RASTER.canvas && RASTER.key === key) { STATS.cacheHits++; return RASTER; }
    for (var i = 0; i < RASTER_CACHE.length; i++) {
      if (RASTER_CACHE[i].key === key) {
        RASTER = RASTER_CACHE[i];
        /* 命中项提到队首，保证最近使用的不被淘汰 */
        RASTER_CACHE.splice(i, 1);
        RASTER_CACHE.unshift(RASTER);
        STATS.cacheHits++;
        return RASTER;
      }
    }
    if (typeof document === 'undefined') return null;
    var t0 = now();
    var r = computeRaster(vm, rw);
    var cv = document.createElement('canvas');
    cv.width = r.w; cv.height = r.h;
    var cg = cv.getContext('2d');
    var img = cg.createImageData(r.w, r.h);
    img.data.set(r.data);
    cg.putImageData(img, 0, 0);
    RASTER = { key: key, w: r.w, h: r.h, canvas: cv };
    RASTER_CACHE.unshift(RASTER);
    while (RASTER_CACHE.length > RASTER_CACHE_MAX) RASTER_CACHE.pop();
    STATS.rasterBuilds++;
    STATS.lastRasterMs = Math.round((now() - t0) * 100) / 100;
    STATS.rasterW = r.w; STATS.rasterH = r.h;
    return RASTER;
  }

  function draw(g, vm) {
    if (!vm || !vm.view) return false;
    if (vm.layers && vm.layers.milkyWay === false) return false;
    if (STATE.mode !== 'auto') { STATS.fallbacks++; return false; }
    if (!TEX && !load()) { STATS.fallbacks++; return false; }
    var m = vm.meta || {};
    if (!isFinite(m.jd) || !isFinite(m.lat) || !isFinite(m.lon)) { STATS.fallbacks++; return false; }
    var sky = ensureSky(m.jd, m.lat, m.lon);
    if (!sky || !sky.data) { STATS.fallbacks++; return false; }
    var ras = ensureRaster(vm);
    if (!ras || !ras.canvas) { STATS.fallbacks++; return false; }

    var t0 = now();
    var v = vm.view;
    g.save();
    g.globalAlpha = SKY_BACKGROUND_ALPHA;
    g.imageSmoothingEnabled = true;
    g.drawImage(ras.canvas, v.cx - v.rmax, v.cy - v.rmax, v.rmax * 2, v.rmax * 2);
    g.restore();
    STATS.draws++;
    STATS.lastDrawMs = Math.round((now() - t0) * 100) / 100;
    return true;
  }

  function invalidate() {
    SKY = { key: '', w: SKY_W, h: SKY_H, data: null };
    RASTER = { key: '', w: 0, h: 0, canvas: null };
    RASTER_CACHE = [];
    if (PENDING) { clearTimeout(PENDING); PENDING = null; }
  }

  root.SkyBackground = {
    version: '1.1.0',
    ready: function () { return STATE.ready || (STATE.mode === 'auto' && load()); },
    load: load,
    draw: draw,
    invalidate: invalidate,
    onDirty: function (fn) { DIRTY = typeof fn === 'function' ? fn : null; },
    stats: function () {
      return {
        ready: STATE.ready, mode: STATE.mode, lastError: STATE.lastError,
        texture: TEX ? { w: TEX.w, h: TEX.h, bytes: TEX.data.length } : null,
        decodeMs: STATS.decodeMs, skyBuilds: STATS.skyBuilds,
        rasterBuilds: STATS.rasterBuilds, cacheHits: STATS.cacheHits,
        lastSkyMs: STATS.lastSkyMs, lastRasterMs: STATS.lastRasterMs,
        lastDrawMs: STATS.lastDrawMs, rasterW: STATS.rasterW, rasterH: STATS.rasterH,
        draws: STATS.draws, fallbacks: STATS.fallbacks
      };
    },
    meta: function () { return TEX ? TEX.meta : null; },
    uvFor: function (ra, dec) { return root.SkyVM.eqToUv(ra, dec); },
    sampleAt: function (ra, dec) { return sampleTex(ra, dec); },
    /* 仅供测试：强制缺失/损坏，或直接计算两级纹理 */
    __setMode: function (m) {
      STATE.mode = (m === 'missing' || m === 'corrupt') ? m : 'auto';
      if (STATE.mode !== 'auto') { TEX = null; STATE.ready = false; invalidate(); }
    },
    __computeSky: function (jd, lat, lon) { return buildSky(jd, lat, lon); },
    __computeRaster: function (vm, rw) { return computeRaster(vm, rw); },
    __rasterCacheSize: function () { return RASTER_CACHE.length; },
    __sky: function () { return SKY; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
