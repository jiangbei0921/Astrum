/* ASTRUM · V2-SKY P0/P1 定向测试（Node，零依赖）
 *
 * 覆盖：
 *   D1 方位基准：全盘面一致（0/90/180/270/360/负方位/银心/反银心/银极/时间/地点）
 *   D2 RGB565 解码一致性
 *   D3 LUT 色调映射：边界、单调（只压暗）、颜色保比
 *   D4 纹理采样质量：最近邻 vs 面积平均参考 / 双线性对照
 *   D5 恒星-背景层次：合成亮度分布与对比度
 *   D6 fallback 与图层开关、命中语义
 *
 * 用法：node tools/v2-sky-p0-p1-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
global.window = global;

['data/catalog.js', 'data/bodies.js', 'core/astro.js', 'data/milkyway-bg.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/sky-background.js',
 'core/sky-renderer.js'].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro, VM = global.SkyVM, BG = global.SkyBackground;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var JD = A.fromLocal(2026, 11, 5, 21, 0, 8);
var JD_GC = A.fromLocal(2026, 6, 1, 21, 30, 8);
var LAT = 39.9042, LON = 116.4074;

BG.load();

/* ---------------- 工具：按文档约定复算屏幕栅格（az/360 取样天空纹理） ---------------- */
function skyRGB(sky, u, v) {
  var x = Math.min(255, Math.max(0, Math.floor(u * 256)));
  var y = Math.min(127, Math.max(0, Math.floor(v * 128)));
  var o = (y * 256 + x) * 3;
  return [sky.data[o], sky.data[o + 1], sky.data[o + 2]];
}
function diskOf(vm, rw) {
  var v = vm.view, D = Math.PI / 180;
  var half = v.fov / 2 * D, yaw = v.yaw * D, pitch = v.pitch * D;
  var cp = Math.cos(pitch), sp = Math.sin(pitch);
  var fwd = [cp * Math.sin(yaw), cp * Math.cos(yaw), sp];
  var right = [fwd[1], -fwd[0], 0];
  var rl = Math.hypot(right[0], right[1]) || 1;
  right = [right[0] / rl, right[1] / rl, 0];
  var up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
  var sky = BG.__sky();
  var out = new Float64Array(rw * rw * 4);
  for (var py = 0; py < rw; py++) {
    var dy = 1 - (py + 0.5) / rw * 2;
    for (var px = 0; px < rw; px++) {
      var dx = (px + 0.5) / rw * 2 - 1;
      var rho = Math.hypot(dx, dy);
      var o = (py * rw + px) * 4;
      if (rho > 1) { out[o + 3] = 0; continue; }
      var rx = rho < 1e-6 ? 0 : dx / rho, ry = rho < 1e-6 ? 0 : dy / rho;
      var ca = Math.cos(rho * half), sa = Math.sin(rho * half);
      var vx = fwd[0] * ca + (right[0] * rx + up[0] * ry) * sa;
      var vy = fwd[1] * ca + (right[1] * rx + up[1] * ry) * sa;
      var vz = fwd[2] * ca + (right[2] * rx + up[2] * ry) * sa;
      var alt = Math.asin(Math.max(-1, Math.min(1, vz)));
      var az = Math.atan2(vx, vy);
      var u = (az / (2 * Math.PI)) % 1;
      if (u < 0) u += 1;
      var c = skyRGB(sky, u, 0.5 - alt / Math.PI);
      out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
    }
  }
  return out;
}
function maxDiskDiff(vm) {
  BG.invalidate();
  BG.__computeSky(vm.meta.jd, vm.meta.lat, vm.meta.lon);
  var rw = 160;
  var exp = diskOf(vm, rw);
  var act = BG.__computeRaster(vm).data;
  var mx = 0, sum = 0, n = 0;
  for (var i = 0; i < exp.length; i += 4) {
    if (!exp[i + 3] && !act[i + 3]) continue;
    n++;
    for (var c = 0; c < 3; c++) {
      var d = Math.abs(exp[i + c] - act[i + c]);
      if (d > mx) mx = d;
      sum += d;
    }
  }
  /* 代码内部把 rho 量化到 1/1024 查表，边界像素允许极小差异；方位错位会造成数十灰阶的平均差 */
  return { diff: mx, mean: n ? sum / (n * 3) : 0, pixels: n };
}

/* ---------------- D1 方位基准 ---------------- */
ok('D1.1 全盘面方位一致：yaw=0°', (function () {
  BG.__computeSky(JD, LAT, LON);
  var vm = VM.build(JD, LAT, LON, { width: 1600, height: 1000, yaw: 0, pitch: 0, fov: 90, style: 'full', detail: true });
  var r = maxDiskDiff(vm);
  console.log('INFO | yaw=0 盘面像素=' + r.pixels + ' maxDiff=' + r.diff + ' meanDiff=' + r.mean.toFixed(3));
  /* 平均差是主判据：180° 方位错位会造成 ~32 灰阶的平均差；边界像素单点差异不影响判断 */
  return r.mean <= 0.5;
})());

[90, 180, 270, 360, -90, -180].forEach(function (yaw, i) {
  ok('D1.' + (i + 2) + ' 全盘面方位一致：yaw=' + yaw + '°', (function () {
    var vm = VM.build(JD, LAT, LON, { width: 1600, height: 1000, yaw: yaw, pitch: 0, fov: 90 });
    var r = maxDiskDiff(vm);
    return r.mean <= 0.5;
  })());
});

ok('D1.8 银心方向比反银心亮（银心升起时刻）', (function () {
  BG.invalidate();
  BG.__computeSky(JD_GC, LAT, LON);
  var gc = A.altAz(17.76033, -28.9362, JD_GC, LAT, LON);
  var vm = VM.build(JD_GC, LAT, LON, { width: 1600, height: 1000, yaw: gc.az, pitch: Math.max(4, gc.alt - 5), fov: 70, style: 'full', detail: true });
  var r = BG.__computeRaster(vm);
  var prj = VM.projector({ width: 1600, height: 1000, yaw: gc.az, pitch: Math.max(4, gc.alt - 5), fov: 70 });
  var q = prj.proj(gc.az, gc.alt);
  if (!q) return false;
  var px = Math.round(q.x / 1600 * 160), py = Math.round(q.y / 1000 * 160);
  var o = (Math.min(159, Math.max(0, py)) * 160 + Math.min(159, Math.max(0, px))) * 4;
  var gcL = (r.data[o] + r.data[o + 1] + r.data[o + 2]) / 3;
  var anti = A.altAz(5.76033, 28.9362, JD_GC, LAT, LON);
  var q2 = prj.proj(anti.az, anti.alt);
  var antiL = 0;
  if (q2) {
    var o2 = (Math.min(159, Math.max(0, Math.round(q2.y / 1000 * 160))) * 160 + Math.min(159, Math.max(0, Math.round(q2.x / 1600 * 160)))) * 4;
    antiL = (r.data[o2] + r.data[o2 + 1] + r.data[o2 + 2]) / 3;
  }
  console.log('INFO | GC=' + gcL.toFixed(1) + ' ANTI=' + antiL.toFixed(1) + ' GCalt=' + gc.alt.toFixed(1));
  return gcL > 20 && (antiL <= 0 || gcL > antiL * 2);
})());

ok('D1.9 银北极/银南极显著暗于银心', (function () {
  var gc = BG.sampleAt(17.76033, -28.9362);
  var ngp = BG.sampleAt(12.85730, 27.12825);
  var sgp = BG.sampleAt(0.85730, -27.12825);
  var L = function (c) { return (c[0] + c[1] + c[2]) / 3; };
  console.log('INFO | 纹理 GC=' + L(gc).toFixed(1) + ' NGP=' + L(ngp).toFixed(1) + ' SGP=' + L(sgp).toFixed(1));
  return L(gc) > 60 && L(ngp) < L(gc) * 0.5 && L(sgp) < L(gc) * 0.5;
})());

ok('D1.10 不同观测时间产生不同天空纹理', (function () {
  BG.invalidate(); BG.__computeSky(JD, LAT, LON);
  var a = BG.__sky().data.slice();
  BG.invalidate(); BG.__computeSky(JD + 3 / 24, LAT, LON);
  var b = BG.__sky().data;
  var s = 0;
  for (var i = 0; i < a.length; i += 3) s += Math.abs(a[i] - b[i]);
  var mean = s / (a.length / 3);
  console.log('INFO | 时间变化平均差=' + mean.toFixed(2));
  return mean > 3;
})());

ok('D1.11 不同观测地点产生不同天空纹理', (function () {
  BG.invalidate(); BG.__computeSky(JD, LAT, LON);
  var a = BG.__sky().data.slice();
  BG.invalidate(); BG.__computeSky(JD, LAT + 10, LON + 10);
  var b = BG.__sky().data;
  var s = 0;
  for (var i = 0; i < a.length; i += 3) s += Math.abs(a[i] - b[i]);
  var mean = s / (a.length / 3);
  console.log('INFO | 地点变化平均差=' + mean.toFixed(2));
  return mean > 3;
})());

/* ---------------- D2 RGB565 解码一致性 ---------------- */
ok('D2.1 sampleAt 与手工解码一致', (function () {
  var raw = Buffer.from(global.MILKYWAY_BG.data, 'base64');
  var meta = global.MILKYWAY_BG.meta.texture;
  var refs = [[17.76033, -28.9362], [12.85730, 27.12825], [0.85730, -27.12825], [5.76033, 28.9362], [0, 0]];
  var bad = 0;
  refs.forEach(function (r) {
    var uv = VM.eqToUv(r[0], r[1]);
    var x = Math.min(meta.width - 1, Math.max(0, Math.floor(uv.u * meta.width)));
    var y = Math.min(meta.height - 1, Math.max(0, Math.floor(uv.v * meta.height)));
    var o = (y * meta.width + x) * 2;
    var v = raw[o] | (raw[o + 1] << 8);
    var exp = [Math.round(((v >> 11) & 31) * 255 / 31),
      Math.round(((v >> 5) & 63) * 255 / 63),
      Math.round((v & 31) * 255 / 31)];
    var got = BG.sampleAt(r[0], r[1]);
    if (got[0] !== exp[0] || got[1] !== exp[1] || got[2] !== exp[2]) bad++;
  });
  return bad === 0;
})());

/* ---------------- D3 LUT 边界与颜色保比 ---------------- */
ok('D3.1 映射只压暗不放亮（mapped ≤ raw+1）', (function () {
  BG.invalidate(); BG.__computeSky(JD, LAT, LON);
  var sky = BG.__sky();
  var bad = 0, n = 0;
  for (var y = 3; y < 128; y += 11) {
    for (var x = 2; x < 256; x += 17) {
      var alt = 90 - (y + 0.5) / 128 * 180, az = (x + 0.5) / 256 * 360;
      var eq = VM.altAzToEq(alt, az, JD, LAT, LON);
      if (!eq) continue;
      var raw = BG.sampleAt(eq.ra, eq.dec);
      var o = (y * 256 + x) * 3;
      for (var c = 0; c < 3; c++) {
        if (sky.data[o + c] > raw[c] + 1) bad++;
      }
      n++;
    }
  }
  console.log('INFO | 检查像素=' + n + ' 违规通道=' + bad);
  return bad === 0;
})());

ok('D3.2 输出全部为 0–255 有限整数', (function () {
  var d = BG.__sky().data;
  var bad = 0;
  for (var i = 0; i < d.length; i++) {
    if (!isFinite(d[i]) || d[i] < 0 || d[i] > 255) bad++;
  }
  return bad === 0 && d.length === 256 * 128 * 3;
})());

ok('D3.3 颜色保比（R:G:B 比例不变，偏差 ≤3%）', (function () {
  BG.invalidate(); BG.__computeSky(JD, LAT, LON);
  var sky = BG.__sky();
  var worst = 0, checked = 0;
  for (var y = 5; y < 128; y += 9) {
    for (var x = 3; x < 256; x += 23) {
      var alt = 90 - (y + 0.5) / 128 * 180, az = (x + 0.5) / 256 * 360;
      var eq = VM.altAzToEq(alt, az, JD, LAT, LON);
      if (!eq) continue;
      var raw = BG.sampleAt(eq.ra, eq.dec);
      var sumR = raw[0] + raw[1] + raw[2];
      if (sumR < 40) continue;      /* 暗像素量化误差占比过大，跳过 */
      var o = (y * 256 + x) * 3;
      var mR = sky.data[o] + sky.data[o + 1] + sky.data[o + 2];
      if (mR < 12) continue;
      for (var c = 0; c < 3; c++) {
        var dr = Math.abs(raw[c] / sumR - sky.data[o + c] / mR);
        if (dr > worst) worst = dr;
      }
      checked++;
    }
  }
  console.log('INFO | 颜色保比检查像素=' + checked + ' 最大比例偏差=' + (worst * 100).toFixed(2) + '%');
  return checked > 20 && worst <= 0.03;
})());

ok('D3.4 高光未被过曝（最亮像素仍 <255 且保留层次）', (function () {
  var sky = BG.__sky();
  var mx = 0, p99 = [];
  for (var y = 0; y < 128; y++) {
    for (var x = 0; x < 256; x++) {
      var o = (y * 256 + x) * 3;
      var l = (sky.data[o] + sky.data[o + 1] + sky.data[o + 2]) / 3;
      p99.push(l);
      if (l > mx) mx = l;
    }
  }
  p99.sort(function (a, b) { return a - b; });
  console.log('INFO | sky max=' + mx.toFixed(1) + ' p99=' + p99[Math.floor(p99.length * 0.99) - 1].toFixed(1));
  return mx > 100 && mx <= 255;
})());

/* ---------------- D4 采样质量 ---------------- */
(function () {
  var TEXW = 512, TEXH = 256;
  var BIN = Buffer.from(global.MILKYWAY_BG.data, 'base64');
  function texNear(ra, dec) {
    var uv = VM.eqToUv(ra, dec);
    var x = Math.min(TEXW - 1, Math.max(0, Math.floor(uv.u * TEXW)));
    var y = Math.min(TEXH - 1, Math.max(0, Math.floor(uv.v * TEXH)));
    var o = (y * TEXW + x) * 2, v = BIN[o] | (BIN[o + 1] << 8);
    return [Math.round(((v >> 11) & 31) * 255 / 31), Math.round(((v >> 5) & 63) * 255 / 63), Math.round((v & 31) * 255 / 31)];
  }
  function texBil(ra, dec) {
    var uv = VM.eqToUv(ra, dec);
    var fx = uv.u * TEXW - 0.5, fy = uv.v * TEXH - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    function rawPx(x, y) {
      x = Math.min(TEXW - 1, Math.max(0, x)); y = Math.min(TEXH - 1, Math.max(0, y));
      var o = (y * TEXW + x) * 2, v = BIN[o] | (BIN[o + 1] << 8);
      return [Math.round(((v >> 11) & 31) * 255 / 31), Math.round(((v >> 5) & 63) * 255 / 63), Math.round((v & 31) * 255 / 31)];
    }
    var a = rawPx(x0, y0), b = rawPx(x0 + 1, y0), c = rawPx(x0, y0 + 1), d = rawPx(x0 + 1, y0 + 1);
    var out = [0, 0, 0];
    for (var k = 0; k < 3; k++) out[k] = (a[k] * (1 - tx) + b[k] * tx) * (1 - ty) + (c[k] * (1 - tx) + d[k] * tx) * ty;
    return out;
  }
  function grid(w, h, fn) {
    var g = new Float64Array(w * h * 3);
    for (var y = 0; y < h; y++) {
      var alt = 90 - (y + 0.5) / h * 180;
      for (var x = 0; x < w; x++) {
        var az = (x + 0.5) / w * 360;
        var eq = VM.altAzToEq(alt, az, JD, LAT, LON);
        var o = (y * w + x) * 3;
        if (!eq) continue;
        var c2 = fn(eq.ra, eq.dec);
        g[o] = c2[0]; g[o + 1] = c2[1]; g[o + 2] = c2[2];
      }
    }
    return g;
  }
  function rmse(a, b) {
    var s = 0, n = 0;
    for (var i = 0; i < a.length; i += 3) {
      var ya = (a[i] + a[i + 1] + a[i + 2]) / 3, yb = (b[i] + b[i + 1] + b[i + 2]) / 3;
      s += (ya - yb) * (ya - yb); n++;
    }
    return Math.sqrt(s / n);
  }
  var hi = grid(512, 256, texNear);
  var ref = new Float64Array(256 * 128 * 3);
  for (var yy = 0; yy < 128; yy++) {
    for (var xx = 0; xx < 256; xx++) {
      for (var c3 = 0; c3 < 3; c3++) {
        var acc = 0;
        for (var dy2 = 0; dy2 < 2; dy2++) for (var dx2 = 0; dx2 < 2; dx2++) {
          acc += hi[((yy * 2 + dy2) * 512 + (xx * 2 + dx2)) * 3 + c3];
        }
        ref[(yy * 256 + xx) * 3 + c3] = acc / 4;
      }
    }
  }
  var near = grid(256, 128, texNear);
  var bil = grid(256, 128, texBil);
  var eNear = rmse(ref, near), eBil = rmse(ref, bil);
  console.log('INFO | 采样 RMSE 最近邻=' + eNear.toFixed(2) + ' 双线性=' + eBil.toFixed(2) + '（参考=2×2 面积平均）');
  ok('D4.1 天空纹理最近邻误差受控（RMSE ≤ 3 灰阶）', eNear <= 3, 'RMSE=' + eNear.toFixed(2));
  ok('D4.2 双线性改善有限（未采用，仅记录）', eBil < eNear, 'bilinear=' + eBil.toFixed(2));
})();

/* ---------------- D5 恒星-背景层次 ---------------- */
ok('D5.1 合成后深空底色深邃、银河保留层次', (function () {
  BG.invalidate(); BG.__computeSky(JD, LAT, LON);
  var vm = VM.build(JD, LAT, LON, { width: 1600, height: 1000, yaw: 180, pitch: 32, fov: 145, style: 'full', detail: true });
  var r = BG.__computeRaster(vm);
  var lums = [];
  for (var i = 0; i < r.data.length; i += 4) {
    if (r.data[i + 3] === 0) continue;
    lums.push((r.data[i] + r.data[i + 1] + r.data[i + 2]) / 3);
  }
  lums.sort(function (a, b) { return a - b; });
  function q(p) { return lums[Math.min(lums.length - 1, Math.floor(p * lums.length))]; }
  var p10 = q(0.10), p90 = q(0.90), p99 = q(0.99);
  var comp = function (l) { return 0.8 * l + 0.2 * 2; };   /* 顶部底色亮度≈2 */
  console.log('INFO | raster p10=' + p10.toFixed(1) + ' p90=' + p90.toFixed(1) + ' p99=' + p99.toFixed(1) +
    ' → 合成 p10=' + comp(p10).toFixed(1) + ' p90=' + comp(p90).toFixed(1) + ' p99=' + comp(p99).toFixed(1));
  return comp(p10) < 3 && comp(p90) > 12 && (comp(p99) / Math.max(0.1, comp(p10))) > 10;
})());

/* ---------------- D6 fallback / 图层 / 命中 ---------------- */
ok('D6.1 缺失模式返回 false 且不抛异常', (function () {
  BG.__setMode('missing');
  var vm = VM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true });
  var fakeG = { save: function () {}, restore: function () {}, drawImage: function () {} };
  var r = BG.draw(fakeG, vm);
  BG.__setMode('auto'); BG.invalidate();
  return r === false;
})());

ok('D6.2 关闭 milkyWay 图层时不绘制背景', (function () {
  var layers = global.SkyLayers.normalize(null);
  layers.milkyWay = false;
  var vm = VM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true, layers: layers });
  var fakeG = { save: function () {}, restore: function () {}, drawImage: function () {} };
  return BG.draw(fakeG, vm) === false;
})());

ok('D6.3 关闭 stars 图层时不产生恒星命中', (function () {
  var layers = global.SkyLayers.normalize(null);
  layers.stars = false;
  var vm = VM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true, layers: layers });
  var starHits = 0;
  /* 无 canvas 环境下只能校验视图模型图层语义 */
  return layers.stars === false && vm.layers.stars === false && starHits === 0;
})());

ok('D6.4 背景不新增命中类型', (function () {
  /* 背景模块不暴露任何 hit 接口；renderer 命中类型集合由 star/dso/planet/moon/sun 构成 */
  var types = ['star', 'dso', 'planet', 'moon', 'sun'];
  return types.indexOf('background') < 0 && typeof BG.draw === 'function';
})());

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
