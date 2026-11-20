/* ASTRUM · V2-SKY 子阶段 2C 离线测试（纯 Node，零依赖）
 *
 * 覆盖：
 *   R1 纹理资源与解码
 *   R2 银河纹理 UV 与参考方向亮度
 *   R3 altAzToEq 往返/边界/非法输入
 *   R4 缺失/损坏时的降级
 *   R5 背景不改变命中区
 *   R6 构建耗时（多次，含 p95）
 *
 * 用法：node tools/v2-sky-2c-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
global.window = global;

['data/catalog.js', 'data/bodies.js', 'core/astro.js', 'data/milkyway-bg.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/sky-background.js', 'core/sky-renderer.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro;
var SkyVM = global.SkyVM;
var SkyBG = global.SkyBackground;
var SkyRender = global.SkyRender;
var CAT = global.CATALOG;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var JD = A.fromLocal(2026, 11, 5, 21, 0, 8);
var LAT = 31.23, LON = 121.47;

/* ---------- R1 资源与解码 ---------- */
ok('R1.1 MILKYWAY_BG 已加载', !!(global.MILKYWAY_BG && global.MILKYWAY_BG.meta), '');
ok('R1.2 纹理尺寸 512×256', global.MILKYWAY_BG.meta.texture.width === 512 && global.MILKYWAY_BG.meta.texture.height === 256,
  JSON.stringify(global.MILKYWAY_BG.meta.texture));
ok('R1.3 格式 RGB565 little-endian', global.MILKYWAY_BG.meta.texture.format === 'rgb565' &&
  global.MILKYWAY_BG.meta.texture.byteOrder === 'little-endian');
ok('R1.4 SkyBackground.ready()', SkyBG.ready() === true, JSON.stringify(SkyBG.stats()));
ok('R1.5 解码字节数正确', SkyBG.stats().texture && SkyBG.stats().texture.bytes === 512 * 256 * 2,
  'bytes=' + (SkyBG.stats().texture && SkyBG.stats().texture.bytes));
ok('R1.6 元数据含来源/许可/哈希', (function () {
  var s = global.MILKYWAY_BG.meta.source;
  return s && s.page && s.download && /^[0-9a-f]{64}$/.test(s.sha256) && /public domain/i.test(s.license);
})());
ok('R1.7 采样颜色为有限值', (function () {
  var c = SkyBG.sampleAt(17.76033, -28.9362);
  return c && c.length === 3 && c.every(function (v) { return isFinite(v) && v >= 0 && v <= 255; });
})(), JSON.stringify(SkyBG.sampleAt(17.76033, -28.9362)));

/* ---------- R2 UV 与参考方向 ---------- */
function meanBrightness(ra, dec) {
  var n = 0, sum = 0;
  for (var dr = -0.02; dr <= 0.02; dr += 0.01) {
    for (var dd = -0.4; dd <= 0.4; dd += 0.2) {
      var c = SkyBG.sampleAt((ra + dr + 24) % 24, Math.max(-89.9, Math.min(89.9, dec + dd)));
      if (!c) continue;
      sum += (c[0] + c[1] + c[2]) / 3; n++;
    }
  }
  return n ? sum / n : 0;
}

ok('R2.1 银北极 UV', (function () {
  var uv = SkyBG.uvFor(12.85730, 27.12825);
  return Math.abs(uv.u - 0.96429) < 0.001 && Math.abs(uv.v - 0.34929) < 0.001;
})(), JSON.stringify(SkyBG.uvFor(12.85730, 27.12825)));

ok('R2.2 银南极 UV', (function () {
  var uv = SkyBG.uvFor(0.85730, -27.12825);
  return Math.abs(uv.u - 0.46429) < 0.001 && Math.abs(uv.v - 0.65071) < 0.001;
})(), JSON.stringify(SkyBG.uvFor(0.85730, -27.12825)));

ok('R2.3 银心方向 UV', (function () {
  var uv = SkyBG.uvFor(17.76033, -28.9362);
  return Math.abs(uv.u - 0.76000) < 0.001 && Math.abs(uv.v - 0.66076) < 0.001;
})(), JSON.stringify(SkyBG.uvFor(17.76033, -28.9362)));

ok('R2.4 反银心 UV', (function () {
  var uv = SkyBG.uvFor(5.76033, 28.9362);
  return Math.abs(uv.u - 0.26000) < 0.001 && Math.abs(uv.v - 0.33924) < 0.001;
})(), JSON.stringify(SkyBG.uvFor(5.76033, 28.9362)));

var gc = meanBrightness(17.76033, -28.9362);
var anti = meanBrightness(5.76033, 28.9362);
var ngp = meanBrightness(12.85730, 27.12825);
var sgp = meanBrightness(0.85730, -27.12825);
ok('R2.5 银心亮度显著高于反银心', gc > anti * 1.3,
  'GC=' + gc.toFixed(1) + ' ANTI=' + anti.toFixed(1) + ' ratio=' + (gc / anti).toFixed(2));
ok('R2.6 银极明显暗于银心', ngp < gc * 0.5 && sgp < gc * 0.5,
  'NGP=' + ngp.toFixed(1) + ' SGP=' + sgp.toFixed(1) + ' GC=' + gc.toFixed(1));
ok('R2.7 RA 增大时 u 减小（RA 向左）', SkyBG.uvFor(18, 0).u < SkyBG.uvFor(17, 0).u);
ok('R2.8 Dec 增大时 v 减小（上边 +90）', SkyBG.uvFor(0, 60).v < SkyBG.uvFor(0, 0).v);
ok('R2.9 RA 0/24 环绕', (function () {
  var a = SkyBG.uvFor(0, 0).u, b = SkyBG.uvFor(24, 0).u;
  return Math.abs(a - 0.5) < 1e-12 && Math.abs(b - 0.5) < 1e-12;
})());

/* ---------- R3 altAzToEq ---------- */
function wrapDiff(a, b) {
  var d = Math.abs(a - b) % 24;
  return d > 12 ? 24 - d : d;
}
ok('R3.1 1000 组随机往返 ≤1e-9', (function () {
  var max = 0;
  for (var i = 0; i < 1000; i++) {
    var ra = (i * 0.61803398875 * 24) % 24;
    var dec = -89 + (i * 0.7421 % 178);
    var aa = A.altAz(ra, dec, JD, LAT, LON);
    var back = SkyVM.altAzToEq(aa.alt, aa.az, JD, LAT, LON);
    max = Math.max(max, wrapDiff(back.ra, ra), Math.abs(back.dec - dec));
  }
  return max <= 1e-9;
})(), 'maxErr 见 R3.2');

ok('R3.2 记录最大往返误差', (function () {
  var max = 0;
  for (var i = 0; i < 1000; i++) {
    var ra = (i * 0.61803398875 * 24) % 24;
    var dec = -89 + (i * 0.7421 % 178);
    var aa = A.altAz(ra, dec, JD, LAT, LON);
    var back = SkyVM.altAzToEq(aa.alt, aa.az, JD, LAT, LON);
    max = Math.max(max, wrapDiff(back.ra, ra), Math.abs(back.dec - dec));
  }
  console.log('INFO | R3 maxErr=' + max.toExponential(2));
  return max <= 1e-9;
})());

ok('R3.3 极区（dec ±89.9）往返', (function () {
  var okAll = true;
  [89.9, -89.9].forEach(function (dec) {
    var aa = A.altAz(6, dec, JD, LAT, LON);
    var back = SkyVM.altAzToEq(aa.alt, aa.az, JD, LAT, LON);
    if (!back || Math.abs(back.dec - dec) > 1e-9) okAll = false;
  });
  return okAll;
})());

ok('R3.4 天顶与地平线边界有限', (function () {
  var z = SkyVM.altAzToEq(90, 0, JD, LAT, LON);
  var h = SkyVM.altAzToEq(0, 359.999, JD, LAT, LON);
  return z && h && isFinite(z.ra) && isFinite(z.dec) && isFinite(h.ra) && isFinite(h.dec);
})());

ok('R3.5 非法输入返回 null', (function () {
  return SkyVM.altAzToEq(NaN, 0, JD, LAT, LON) === null &&
    SkyVM.altAzToEq(0, Infinity, JD, LAT, LON) === null &&
    SkyVM.altAzToEq(0, 0, NaN, LAT, LON) === null;
})());

/* ---------- R4 降级 ---------- */
ok('R4.1 缺失模式 draw 返回 false', (function () {
  SkyBG.__setMode('missing');
  var vm = SkyVM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true });
  var fakeG = { save: function () {}, restore: function () {}, drawImage: function () {} };
  return SkyBG.draw(fakeG, vm) === false && SkyBG.ready() === false;
})());
SkyBG.__setMode('auto');
SkyBG.invalidate();
ok('R4.2 恢复后 ready', SkyBG.ready() === true);

/* ---------- R5 命中不变 ---------- */
ok('R5.1 背景不新增命中', (function () {
  var vm = SkyVM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true });
  var out = SkyRender.draw({ width: 760, height: 540, getContext: function () { return fakeCtx(); } }, { showGlobe: false }, vm);
  return out.hits && out.hits.every(function (h) {
    return ['star', 'dso', 'planet', 'moon', 'sun'].indexOf(h.obj.type) >= 0;
  });
})());

function fakeCtx() {
  var grad = { addColorStop: function () {} };
  var t = {
    font: '10px sans-serif', fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    globalCompositeOperation: 'source-over', textAlign: 'left', shadowColor: '', shadowBlur: 0,
    imageSmoothingEnabled: true,
    measureText: function (s) { return { width: String(s).length * 6 }; },
    createLinearGradient: function () { return grad; },
    createRadialGradient: function () { return grad; },
    createImageData: function (w, h) { return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }; },
    putImageData: function () {}, getImageData: function () { return { data: [] }; }
  };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'fill', 'stroke',
   'save', 'restore', 'translate', 'rotate', 'scale', 'clip', 'setLineDash', 'fillText',
   'closePath', 'drawImage'].forEach(function (m) { t[m] = function () {}; });
  return t;
}

/* ---------- R6 性能 ---------- */
(function () {
  var vm = SkyVM.build(JD, LAT, LON, { width: 1600, height: 900, yaw: 180, pitch: 32, fov: 145, style: 'full', detail: true });
  function stats(arr) {
    arr.sort(function (a, b) { return a - b; });
    var n = arr.length;
    var avg = arr.reduce(function (a, b) { return a + b; }, 0) / n;
    return {
      n: n, avg: Math.round(avg * 100) / 100,
      p50: Math.round(arr[Math.floor(n * 0.5)] * 100) / 100,
      p95: Math.round(arr[Math.floor(n * 0.95)] * 100) / 100,
      max: Math.round(arr[n - 1] * 100) / 100
    };
  }
  var skyT = [], rasT = [];
  for (var i = 0; i < 8; i++) {
    var t0 = performance.now();
    SkyBG.__computeSky(JD + i / 1440, LAT, LON);
    skyT.push(performance.now() - t0);
  }
  for (var j = 0; j < 12; j++) {
    var t1 = performance.now();
    SkyBG.__computeRaster(vm);
    rasT.push(performance.now() - t1);
  }
  console.log('PERF | decodeMs=' + SkyBG.stats().decodeMs);
  console.log('PERF | sky ' + JSON.stringify(stats(skyT)));
  console.log('PERF | raster ' + JSON.stringify(stats(rasT)));
  console.log('PERF | texture=' + JSON.stringify(SkyBG.stats().texture));
})();

console.log('');
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
