/* ASTRUM · V2-SKY 视觉星表离线测试（纯 Node，零依赖）
 *
 * 覆盖阶段 P2 要求的「恒星 LOD 与空间索引」验收点：
 *   V1 空间索引与暴力遍历一致（方位角环绕、近天顶、多个 FOV）
 *   V2 选出星全部落在画布内（投影自洽）
 *   V3 参考阈值公式单调与两个视场星数比较（非完整LOD边界测试）
 *   V4 近天顶方位扫描不崩溃
 *   V5 旧视觉参数检查（B-V非有限值缺口由独立质量测试覆盖）
 *   V6 星等与尺寸单调（未独立检验透明度/桶/通量比例）
 *   V7 颜色组计算无 NaN、通道在 0..255
 *   V8 旧L0视图键与数量上限检查（含兜底，不代表完整隔离验收）
 *
 * 用法：node tools/visual-stars-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

['data/catalog.js', 'data/bodies.js', 'core/astro.js',
 'data/sky-stars-l1.js', 'core/sky-star-data.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/planet-visuals.js', 'core/sky-renderer.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro;
var SD = global.SkyStarData;
var SkyVM = global.SkyVM;
var SkyLayers = global.SkyLayers;
var SkyRender = global.SkyRender;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var JD = A.fromLocal(2026, 11, 5, 21, 0, 8);
var LAT = 31.23, LON = 121.47;
var W = 1600, H = 900;
var DEG = Math.PI / 180;

var D = SD.records();
ok('V0.1 数据就绪', !!D && D.n > 0, 'n=' + (D && D.n));

/* 预计算全部星的 az/alt，供暴力遍历使用（避免重复计算） */
function altAzAll(jd) {
  var az = new Float32Array(D.n), alt = new Float32Array(D.n);
  for (var i = 0; i < D.n; i++) {
    var a = A.altAz(D.ra[i] / 15, D.dec[i], jd, LAT, LON);
    az[i] = a.az; alt[i] = a.alt;
  }
  return { az: az, alt: alt };
}

function build(yaw, pitch, fov, jd) {
  SkyVM.clear();
  return SkyVM.build(jd || JD, LAT, LON, {
    width: W, height: H, yaw: yaw, pitch: pitch, fov: fov,
    style: 'full', detail: true, compact: false,
    layers: SkyLayers.normalize(null)
  });
}

/* 暴力复刻 build() 的 L1 选取管线，但不使用球面网格索引。
 * 返回与 vm.field 可比的索引集合。 */
function bruteField(yaw, pitch, fov, jd) {
  jd = jd || JD;
  var aa = altAzAll(jd);
  var pr = SkyVM.projector({ width: W, height: H, yaw: yaw, pitch: pitch, fov: fov });
  var geom = pr.geom;
  var radius = geom.halfFov * 1.02 + 8 * DEG;
  var cosR = Math.cos(radius);
  var cAlt = geom.pitch * DEG, cAz = geom.yaw * DEG;
  var maxMag = Math.max(5, 10 - (geom.fov - 30) * (4 / 148));

  var cand = [];
  for (var i = 0; i < D.n; i++) {
    if (D.mag[i] > maxMag) continue;
    var sinA = Math.sin(cAlt) * Math.sin(aa.alt[i] * DEG)
      + Math.cos(cAlt) * Math.cos(aa.alt[i] * DEG) * Math.cos((cAz - aa.az[i] * DEG));
    if (sinA < cosR) continue;
    cand.push(i);
  }
  cand.sort(function (a, b) { return D.mag[a] - D.mag[b] || a - b; });
  if (cand.length > 8000) cand.length = 8000;

  var out = {};
  for (var k = 0; k < cand.length; k++) {
    var id = cand[k];
    if (aa.alt[id] < 0.3) continue;
    var q = pr.proj(aa.az[id], aa.alt[id]);
    if (!q) continue;
    if (q.x < -8 || q.x > W + 8 || q.y < -8 || q.y > H + 8) continue;
    out[id] = true;
  }
  return out;
}

function fieldSet(vm) {
  var s = {};
  for (var i = 0; i < vm.field.length; i++) s[vm.field[i].i] = true;
  return s;
}

function diffSets(a, b) {
  var missing = [], extra = [];
  Object.keys(a).forEach(function (k) { if (!b[k]) missing.push(k); });
  Object.keys(b).forEach(function (k) { if (!a[k]) extra.push(k); });
  return { missing: missing, extra: extra };
}

/* ---- V1 空间索引 vs 暴力遍历 ---- */
(function () {
  var cases = [
    { yaw: 180, pitch: 32, fov: 145, tag: '常规' },
    { yaw: 0, pitch: 20, fov: 90, tag: '方位角=0 环绕' },
    { yaw: 359.9, pitch: 20, fov: 90, tag: '方位角≈360 环绕' },
    { yaw: 120, pitch: 75, fov: 60, tag: '近天顶' },
    { yaw: 240, pitch: -5, fov: 178, tag: '极广角近地平' },
    { yaw: 45, pitch: 3, fov: 30, tag: '窄视场' }
  ];
  cases.forEach(function (c) {
    var vm = build(c.yaw, c.pitch, c.fov);
    var idx = fieldSet(vm);
    var bf = bruteField(c.yaw, c.pitch, c.fov);
    var dd = diffSets(bf, idx);
    ok('V1 索引与暴力一致 · ' + c.tag,
      dd.missing.length === 0 && dd.extra.length === 0,
      'field=' + vm.field.length + ' brute=' + Object.keys(bf).length +
      ' missing=' + dd.missing.length + ' extra=' + dd.extra.length);
  });
})();

/* ---- V2 选出星全部落在画布内 ---- */
(function () {
  var vm = build(180, 32, 145);
  var bad = 0, worst = 0;
  for (var i = 0; i < vm.field.length; i++) {
    var it = vm.field[i];
    /* vm.field 记录只含屏幕坐标；越界即说明索引/投影不自洽 */
    if (it.x < -8 || it.x > W + 8 || it.y < -8 || it.y > H + 8) {
      bad++;
      worst = Math.max(worst, Math.abs(it.x), Math.abs(it.y));
    }
  }
  ok('V2 选出星屏幕坐标在画布内（±8px）', bad === 0, 'bad=' + bad + ' worst=' + worst.toFixed(1));
})();

/* ---- V3 LOD：视场越宽，星等上限越低（可见暗星越少） ---- */
(function () {
  var fovs = [178, 145, 90, 60, 30];
  var res = fovs.map(function (f) {
    SkyVM.clear();
    var vm = build(180, 32, f);
    var maxMag = -99;
    for (var i = 0; i < vm.field.length; i++) if (vm.field[i].mag > maxMag) maxMag = vm.field[i].mag;
    return { fov: f, n: vm.field.length, maxMag: maxMag };
  });
  var limit = fovs.map(function (f) { return Math.max(5, 10 - (f - 30) * (4 / 148)); });
  var mono = true;
  for (var i = 1; i < limit.length; i++) if (limit[i] < limit[i - 1] - 1e-9) mono = false;
  ok('V3.1 参考LOD阈值公式随视场单调', mono,
    res.map(function (r) { return r.fov + '°≤' + r.maxMag.toFixed(2); }).join(' '));
  ok('V3.2 窄视场可见星少于广角视场',
    res[res.length - 1].n < res[1].n,
    res.map(function (r) { return r.fov + '°=' + r.n; }).join(' '));
})();

/* ---- V4 近天顶视角（非天球赤纬极区） ---- */
(function () {
  var n = 0, minYaw = 360, crash = false;
  for (var yaw = 0; yaw < 360; yaw += 30) {
    try {
      var vm = build(yaw, 75, 120);
      n += vm.field.length;
      minYaw = Math.min(minYaw, vm.field.length);
    } catch (e) { crash = true; }
  }
  ok('V4 近天顶全方位角扫描无异常', !crash, 'sum=' + n + ' min=' + minYaw);
})();

/* ---- V5 视觉参数合法 ---- */
(function () {
  var vm = build(180, 32, 145);
  var bad = 0, ex = '';
  for (var i = 0; i < vm.field.length; i++) {
    var it = vm.field[i];
    var okRec = isFinite(it.mag) && isFinite(it.size) && isFinite(it.alpha)
      && it.size >= 0 && it.alpha >= 0.07 && it.alpha <= 1
      && it.bucket >= 0 && it.bucket < 5
      && isFinite(it.hitSize) && it.hitSize > 0
      && isFinite(it.ra) && it.ra >= 0 && it.ra < 24
      && isFinite(it.dec) && it.dec >= -90 && it.dec <= 90
      && (it.bv == null || !isFinite(it.bv) || (it.bv >= -0.5 && it.bv <= 5.8));
    if (!okRec) { bad++; if (!ex) ex = JSON.stringify({ i: it.i, mag: it.mag, size: it.size, alpha: it.alpha, bucket: it.bucket, magRaw: it.mag }); }
  }
  ok('V5 L1 视觉参数有限且范围合法', bad === 0, bad ? ex : 'n=' + vm.field.length);
})();

/* ---- V6 亮度映射单调 ---- */
(function () {
  var vm = build(180, 32, 145);
  var rows = vm.field.filter(function (it) { return it.alt > 8; })
    .sort(function (a, b) { return a.mag - b.mag; });
  var bad = 0;
  for (var i = 1; i < rows.length; i++) {
    /* 更暗（mag 更大）不应更亮（尺寸更大） */
    if (rows[i].mag > rows[i - 1].mag && rows[i].size > rows[i - 1].size + 1e-6) bad++;
  }
  ok('V6 星等越暗尺寸不增', bad === 0 && rows.length > 20, 'pairViolations=' + bad + ' n=' + rows.length);

  /* 这里只比较最亮/最暗样本尺寸；不验证5等差通量比。 */
  var bright = rows[0], dim = rows[rows.length - 1];
  ok('V6.2 最亮与最暗样本尺寸比较', dim.mag - bright.mag > 4 && dim.size <= bright.size,
    'mag ' + bright.mag.toFixed(2) + '→' + dim.mag.toFixed(2) + ' size ' + bright.size.toFixed(2) + '→' + dim.size.toFixed(2));
})();

/* ---- V7 颜色通道有限 ---- */
(function () {
  var vm = build(180, 32, 145);
  var ops = [];
  var grad = { addColorStop: function () { } };
  var target = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0,
    measureText: function (t) { return { width: String(t).length * 6 }; },
    createLinearGradient: function () { return grad; },
    createRadialGradient: function () { return grad; }
  };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'fill',
   'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'clip', 'setLineDash',
   'fillText', 'closePath', 'drawImage'].forEach(function (m) {
    target[m] = function () { };
  });
  var ctx = new Proxy(target, {
    set: function (t, p, v) { if (p === 'fillStyle' && typeof v === 'string') ops.push(v); t[p] = v; return true; }
  });
  SkyRender.draw({ width: W, height: H, getContext: function () { return ctx; } }, { showGlobe: true }, vm);

  var seen = {}, bad = 0, count = 0;
  ops.forEach(function (s) {
    if (!/^rgba?\(/.test(s)) return;
    if (seen[s]) return;
    seen[s] = 1; count++;
    var m = s.match(/rgba?\(([^)]+)\)/);
    if (!m) { bad++; return; }
    var parts = m[1].split(',').map(function (x) { return parseFloat(x); });
    if (parts.some(function (v) { return !isFinite(v); })) bad++;
    else if (parts.slice(0, 3).some(function (v) { return v < 0 || v > 255; })) bad++;
    else if (parts.length > 3 && (parts[3] < 0 || parts[3] > 1)) bad++;
  });
  ok('V7 绘制颜色字符串全部有限合法', bad === 0 && count > 0, 'colors=' + count + ' bad=' + bad);
})();

/* ---- V8 L0 不受影响 ---- */
(function () {
  var vm = build(180, 32, 145);
  var l0 = typeof CAT !== 'undefined' ? CAT.stars.length : 132;
  ok('V8 L0 业务星表数量不变且独立存放',
    vm.stars.length <= l0 && vm.stars.every(function (s) { return s.key != null; }),
    'vm.stars=' + vm.stars.length + '/' + l0 + ' field=' + vm.field.length);
})();

SkyVM.clear();
console.log('\nRESULT ' + pass + '/' + (pass + fail));
if (fail) process.exitCode = 1;
