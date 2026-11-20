/* ASTRUM · 行星程序化球面精灵（V2-SKY 阶段 4 增强）
 *
 * 目标：让星图里的行星不再是「纯色球/几条平条带」，而是按真实环流带纹、
 * 极区、标志性结构生成的球面贴图 + Lambert 光照 + 相位终结线。
 *
 * 纯程序化，不下载任何图片资源；离屏 canvas 生成一次后按（天体/尺寸/光照方向）缓存。
 * 依赖：无（仅 Canvas 2D）。无 document 时返回 null，调用方自行降级。
 */
(function (root) {
  'use strict';

  var SIZE_SMALL = 96;
  var SIZE_LARGE = 160;
  var CACHE = {};
  var CACHE_MAX = 48;
  var DEG = Math.PI / 180;

  /* ---------- 噪声 ---------- */
  function hash2(x, y, seed) {
    var n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise2(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    var u = smooth(xf), v = smooth(yf);
    return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
  }
  function fbm(x, y, seed, oct) {
    var s = 0, amp = 0.5, f = 1;
    for (var i = 0; i < oct; i++) {
      s += noise2(x * f, y * f, seed + i * 13) * amp;
      amp *= 0.5; f *= 2.03;
    }
    return s;
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function mix(c1, c2, t) {
    t = clamp(t, 0, 1);
    return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
  }
  function angDiff(a, b) { var d = ((a - b) % 360 + 540) % 360 - 180; return d; }

  function seedOf(key) {
    var s = 0;
    for (var i = 0; i < key.length; i++) s = (s * 31 + key.charCodeAt(i)) >>> 0;
    return s % 1000;
  }

  /* ---------- 各天体表面色 ---------- */
  /* lat: -90..90（+北）；lon: -180..180 */
  function surface(key, u, v, lat, lon, seed) {
    switch (key) {
      case 'jupiter': {
        /* 纬向带 + 湍流；大红斑位于南纬 22° */
        var band = Math.sin(lat * DEG * 11.2) * 0.5 + 0.5;
        var turb = fbm(u * 24 + band * 2.6, lat * 0.42, seed, 4);
        var c = mix([214, 190, 156], [156, 112, 78], band * 0.9);
        c = mix(c, [238, 222, 196], turb * 0.45);
        var dLon = angDiff(lon, 120), dLat = lat + 22;
        var g = Math.pow((dLon / 26) * (dLon / 26) + (dLat / 8) * (dLat / 8), 1.5);
        if (g < 1) c = mix(c, [172, 84, 58], (1 - g) * 0.92);
        if (Math.abs(lat) > 60) c = mix(c, [146, 130, 118], (Math.abs(lat) - 60) / 30 * 0.65);
        return c;
      }
      case 'saturn': {
        var b2 = Math.sin(lat * DEG * 7.6) * 0.5 + 0.5;
        var w2 = fbm(u * 16, lat * 0.3, seed, 4);
        var c2 = mix([236, 218, 178], [198, 170, 126], b2 * 0.8);
        c2 = mix(c2, [246, 236, 208], w2 * 0.4);
        if (lat > 70) c2 = mix(c2, [118, 136, 150], (lat - 70) / 20 * 0.55);
        return c2;
      }
      case 'mars': {
        var base = [188, 104, 68];
        var alb = fbm(u * 9, v * 5.2, seed + 5, 4);
        var c3 = mix(base, [132, 70, 48], clamp(alb * 1.15 - 0.25, 0, 1) * 0.85);
        c3 = mix(c3, [206, 132, 92], clamp(fbm(u * 26, v * 13, seed + 11, 3) - 0.35, 0, 1) * 0.5);
        if (Math.abs(lat) > 74) c3 = mix(c3, [242, 238, 232], (Math.abs(lat) - 74) / 16);
        return c3;
      }
      case 'venus': {
        var sw = fbm(u * 6 + v * 2.2, v * 24, seed, 4);
        var c4 = mix([236, 218, 172], [184, 158, 110], sw * 0.9);
        if (Math.abs(lat) > 76) c4 = mix(c4, [170, 154, 128], 0.5);
        return c4;
      }
      case 'mercury': {
        var cr = fbm(u * 40, v * 26, seed, 4);
        var c5 = mix([150, 148, 142], [96, 94, 90], cr * 0.8);
        return mix(c5, [176, 172, 164], clamp(fbm(u * 90, v * 55, seed + 3, 2) - 0.5, 0, 1) * 0.6);
      }
      case 'uranus': {
        var bu = Math.sin(lat * DEG * 4.2) * 0.5 + 0.5;
        var c6 = mix([186, 226, 230], [150, 200, 210], bu * 0.55);
        return mix(c6, [212, 240, 242], fbm(u * 10, v * 6, seed, 3) * 0.25);
      }
      case 'neptune': {
        var bn = Math.sin(lat * DEG * 5.1) * 0.5 + 0.5;
        var c7 = mix([92, 138, 210], [58, 96, 172], bn * 0.6);
        c7 = mix(c7, [130, 176, 232], fbm(u * 12, v * 7, seed, 3) * 0.3);
        /* 大暗斑：南纬 22° 附近 */
        var dn = Math.pow((angDiff(lon, -60) / 24) * (angDiff(lon, -60) / 24) + ((lat + 22) / 9) * ((lat + 22) / 9), 1.4);
        if (dn < 1) c7 = mix(c7, [30, 58, 120], (1 - dn) * 0.75);
        return c7;
      }
      case 'moon': {
        var mar = fbm(u * 7, v * 4.4, seed, 4);
        var c8 = mix([196, 194, 188], [120, 118, 114], clamp(mar * 1.3 - 0.3, 0, 1) * 0.85);
        return mix(c8, [220, 218, 212], clamp(fbm(u * 44, v * 26, seed + 7, 3) - 0.5, 0, 1) * 0.5);
      }
      default: {
        var cg = mix([196, 196, 196], [150, 150, 150], fbm(u * 20, v * 12, seed, 3));
        return cg;
      }
    }
  }

  /* ---------- 球面精灵 ---------- */
  function sphereSprite(key, size, lightAngle, opts) {
    if (typeof document === 'undefined') return null;
    opts = opts || {};
    size = size <= 110 ? SIZE_SMALL : SIZE_LARGE;
    var angB = Math.round(((lightAngle || 0) * 180 / Math.PI) / 15) * 15;
    var ck = key + '|' + size + '|' + angB;
    if (CACHE[ck]) return CACHE[ck];

    var seed = seedOf(key);
    var cv = document.createElement('canvas');
    cv.width = size; cv.height = size;
    var g = cv.getContext('2d');
    if (!g) return null;
    var img = g.createImageData(size, size);
    var d = img.data;
    var half = size / 2;
    var la = (angB * DEG);
    /* 光照方向（屏幕空间，+x 朝太阳） */
    var Lx = Math.cos(la), Ly = Math.sin(la);
    var Lz = 0.42;
    var ll = Math.sqrt(Lx * Lx + Ly * Ly + Lz * Lz);
    Lx /= ll; Ly /= ll; Lz /= ll;
    var amb = opts.ambient == null ? 0.055 : opts.ambient;
    var rot = (seed % 360) * DEG;

    for (var py = 0; py < size; py++) {
      var dy = (half - (py + 0.5)) / half;
      for (var px = 0; px < size; px++) {
        var dx = (px + 0.5 - half) / half;
        var o = (py * size + px) * 4;
        var s2 = dx * dx + dy * dy;
        if (s2 > 1) { d[o + 3] = 0; continue; }
        var nz = Math.sqrt(1 - s2);
        /* 正交球面 → 经纬度（近似，足够视觉使用） */
        var lat = Math.asin(clamp(dy, -1, 1)) / DEG;
        var lon = Math.atan2(dx, nz) / DEG + rot / DEG;
        var u = ((lon / 360) % 1 + 1) % 1;
        var v = 0.5 - lat / 180;
        var c = sampleReal(key, u, v) || surface(key, u, v, lat, lon, seed);
        /* Lambert + 临边昏暗 */
        var diff = dx * Lx + dy * Ly + nz * Lz;
        var k = clamp((diff + 0.12) / 1.12, 0, 1);
        var sh = amb + (k * k * (3 - 2 * k)) * (1 - 0.3 * s2);
        /* 边缘一圈大气辉光（气态行星更明显） */
        var rim = (1 - nz) * (1 - nz);
        var glow = 0;
        if (key === 'jupiter' || key === 'saturn' || key === 'venus' || key === 'uranus' || key === 'neptune') {
          glow = rim * 0.28;
        }
        d[o] = clamp(c[0] * sh + 255 * glow, 0, 255);
        d[o + 1] = clamp(c[1] * sh + 245 * glow, 0, 255);
        d[o + 2] = clamp(c[2] * sh + 255 * glow, 0, 255);
        d[o + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    var keys = Object.keys(CACHE);
    if (keys.length >= CACHE_MAX) delete CACHE[keys[0]];
    CACHE[ck] = cv;
    return cv;
  }

  /* ---------- 真实贴图（data/planet-textures.js 内联 Base64） ---------- */
  var REAL = {};
  var decoding = {};
  var pending = 0;
  var fired = false;

  function realMap() {
    return (root.PLANET_TEX && root.PLANET_TEX.map) ? root.PLANET_TEX.map : null;
  }

  function markDone() {
    pending--;
    if (pending <= 0 && !fired) {
      fired = true;
      try { root.dispatchEvent(new CustomEvent('planet-textures-ready', { detail: { count: Object.keys(REAL).length } })); } catch (e) { }
    }
  }

  function decodeOne(key, url, meta) {
    if (typeof Image === 'undefined' || typeof document === 'undefined') return;
    pending++;
    var img = new Image();
    img.onload = function () {
      var cv, g;
      try {
        cv = document.createElement('canvas');
        cv.width = meta.w; cv.height = meta.h;
        g = cv.getContext('2d');
        g.drawImage(img, 0, 0);
      } catch (e) { markDone(); return; }
      /* 分片读取像素：单次 getImageData 2MB 会阻塞主线程，拖动时会掉帧。
       * 每片 128 行（约 256KB），片间让出时间片。 */
      var data = new Uint8ClampedArray(meta.w * meta.h * 4);
      var rows = 128, y = 0;
      function slice() {
        var h = Math.min(rows, meta.h - y);
        try {
          var part = g.getImageData(0, y, meta.w, h).data;
          data.set(part, y * meta.w * 4);
        } catch (e) { markDone(); return; }
        y += h;
        if (y < meta.h) {
          setTimeout(slice, 0);
        } else {
          REAL[key] = { w: meta.w, h: meta.h, data: data };
          CACHE = {}; /* 已缓存的程序化精灵作废 */
          markDone();
        }
      }
      setTimeout(slice, 0);
    };
    img.onerror = markDone;
    img.src = url;
  }

  /* 启动解码；可重复调用，只会解一次 */
  function init() {
    var map = realMap();
    if (!map) return 0;
    var meta = { w: (root.PLANET_TEX && root.PLANET_TEX.w) || 1024, h: (root.PLANET_TEX && root.PLANET_TEX.h) || 512 };
    Object.keys(map).forEach(function (k, i) {
      if (decoding[k]) return;
      decoding[k] = 1;
      setTimeout(function () { decodeOne(k, map[k], meta); }, i * 30);
    });
    return Object.keys(map).length;
  }

  /* 最近邻采样（u 环绕、v 夹紧）；未就绪返回 null */
  function sampleReal(key, u, v) {
    var t = REAL[key];
    if (!t) return null;
    var x = Math.floor(u * t.w);
    x = ((x % t.w) + t.w) % t.w;
    var y = Math.floor(v * t.h);
    if (y < 0) y = 0; else if (y >= t.h) y = t.h - 1;
    var o = (y * t.w + x) * 4;
    return [t.data[o], t.data[o + 1], t.data[o + 2]];
  }

  function hasReal(key) { return !!REAL[key]; }
  function realKeys() { return Object.keys(REAL); }

  root.PlanetTextures = {
    version: '1.1.0',
    sphereSprite: sphereSprite,
    surface: surface,
    init: init,
    sampleReal: sampleReal,
    hasReal: hasReal,
    realKeys: realKeys,
    __cacheSize: function () { return Object.keys(CACHE).length; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
