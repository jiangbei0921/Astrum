/* ASTRUM · V2-SKY 阶段 4 离线测试（纯 Node，零依赖）
 *
 * 覆盖行星视觉升级：
 *   Q1 相位角范围（金星大、木星小）
 *   Q2 照明比例公式
 *   Q3 土星环倾角随年代变化
 *   Q4 无 document 时纹理降级
 *   Q5 渲染器：相位遮罩只作用于行星，不作用于太阳
 *   Q6 渲染器：土星环短轴按倾角计算，不再是固定 0.62
 *   Q7 命中区与既有条件不变
 *
 * 用法：node tools/v2-sky-04-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

['data/catalog.js', 'data/bodies.js', 'core/astro.js',
 'data/sky-stars-l1.js', 'core/sky-star-data.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/planet-visuals.js', 'core/sky-renderer.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro;
var PV = global.PlanetVisuals;
var SkyVM = global.SkyVM;
var SkyLayers = global.SkyLayers;
var SkyRender = global.SkyRender;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var LAT = 31.23, LON = 121.47;
var JD0 = A.fromLocal(2026, 11, 5, 21, 0, 8);

/* ---------- Q1 相位角范围 ---------- */
function scan(key, days, step) {
  var min = 999, max = -999;
  for (var d = 0; d <= days; d += step) {
    var i = PV.phaseAngle(key, JD0 + d);
    if (i == null) continue;
    if (i < min) min = i;
    if (i > max) max = i;
  }
  return { min: min, max: max };
}
(function () {
  var venus = scan('venus', 600, 3);
  ok('Q1.1 金星相位角变化大（>120°）', (venus.max - venus.min) > 120,
    venus.min.toFixed(1) + '..' + venus.max.toFixed(1));
  var jup = scan('jupiter', 800, 5);
  ok('Q1.2 木星相位角始终很小（<12°）', jup.max < 12, jup.min.toFixed(1) + '..' + jup.max.toFixed(1));
  var mars = scan('mars', 800, 5);
  ok('Q1.3 火星相位角 < 50°', mars.max < 50, mars.min.toFixed(1) + '..' + mars.max.toFixed(1));
})();

/* ---------- Q2 照明比例 ---------- */
(function () {
  ok('Q2.1 相位 0° → 全亮', Math.abs(PV.illumFraction(0) - 1) < 1e-9);
  ok('Q2.2 相位 90° → 半亮', Math.abs(PV.illumFraction(90) - 0.5) < 1e-9);
  ok('Q2.3 相位 180° → 全暗', Math.abs(PV.illumFraction(180)) < 1e-9);
  ok('Q2.4 非法输入回落为 1', PV.illumFraction(null) === 1 && PV.illumFraction(NaN) === 1);
})();

/* ---------- Q3 环倾角 ---------- */
(function () {
  var t2026 = PV.ringTilt(A.fromLocal(2026, 1, 1, 0, 0, 0));
  var t2032 = PV.ringTilt(A.fromLocal(2032, 1, 1, 0, 0, 0));
  ok('Q3.1 环倾角可计算', t2026 != null && isFinite(t2026), 'B2026=' + t2026.toFixed(2) + '°');
  ok('Q3.2 六年内倾角变化 > 5°', Math.abs(t2026 - t2032) > 5,
    t2026.toFixed(2) + '° → ' + t2032.toFixed(2) + '°');
  ok('Q3.3 2026 年接近环面穿越（|B|<10°）', Math.abs(t2026) < 10, Math.abs(t2026).toFixed(2) + '°');
  ok('Q3.4 倾角恒在 ±90° 内', Math.abs(t2026) <= 90 && Math.abs(t2032) <= 90);
})();

/* ---------- Q4 纹理降级 ---------- */
(function () {
  ok('Q4.1 Node 无 document 时返回 null', PV.diskTexture('jupiter') === null);
  ok('Q4.2 未知天体返回 null', PV.diskTexture('nope') === null);
})();

/* ---------- 渲染辅助 ---------- */
function makeCtx(ops) {
  var grad = { addColorStop: function () { } };
  var target = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0,
    measureText: function (t) { return { width: String(t).length * 6 }; },
    createLinearGradient: function () { return grad; },
    createRadialGradient: function () { return grad; }
  };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'fill', 'stroke',
   'save', 'restore', 'translate', 'rotate', 'scale', 'clip', 'fillText', 'closePath',
   'drawImage'].forEach(function (m) {
    target[m] = function () { ops.push(['call', m]); };
  });
  target.ellipse = function (x, y, rx, ry) { ops.push(['ellipse', rx, ry]); };
  target.setLineDash = function () { };
  return new Proxy(target, {
    set: function (t, p, v) {
      if (p === 'fillStyle' || p === 'strokeStyle') ops.push(['style', String(v)]);
      t[p] = v; return true;
    }
  });
}
function render(jd, yaw, pitch, fov) {
  var ops = [];
  var ctx = makeCtx(ops);
  var cv = { width: 1600, height: 900, getContext: function () { return ctx; } };
  var vm = SkyVM.build(jd, LAT, LON, {
    width: 1600, height: 900, yaw: yaw, pitch: pitch, fov: fov,
    style: 'full', detail: true, compact: false, layers: SkyLayers.normalize(null)
  });
  var out = SkyRender.draw(cv, { showGlobe: false }, vm);
  return { ops: ops, vm: vm, out: out };
}
function findBody(vm, key) {
  for (var i = 0; i < vm.bodies.length; i++) if (vm.bodies[i].key === key) return vm.bodies[i];
  return null;
}

/* ---------- Q5/Q6 渲染器 ---------- */
(function () {
  /* 选一个土星在视野内的时刻：把相机对准土星方位 */
  var jd = JD0, sat = null, az = 0;
  for (var d = 0; d < 400 && !sat; d += 1) {
    var j2 = JD0 + d;
    var aa = A.altAz.apply(null, [A.planet('saturn', j2).ra, A.planet('saturn', j2).dec, j2, LAT, LON]);
    if (aa.alt > 15) { jd = j2; sat = aa; az = aa.az; break; }
  }
  if (!sat) { console.log('SKIP | Q5/Q6 未找到土星可见时刻'); return; }

  SkyVM.clear();
  /* pitch 取土星高度附近，保证土星落在 100° 视场内 */
  var pitchSat = Math.max(0, Math.min(70, sat.alt - 8));
  var r = render(jd, az, pitchSat, 100);
  var sb = findBody(r.vm, 'saturn');
  ok('Q5.1 土星在视野内', !!sb,
    sb ? ('r=' + sb.r.toFixed(1)) :
      ('bodies=' + r.vm.bodies.map(function (b) { return b.key + '@' + Math.round(b.alt); }).join(',') +
       ' satAlt=' + sat.alt.toFixed(1) + ' az=' + az.toFixed(1)));

  var night = r.ops.filter(function (o) { return o[0] === 'style' && o[1] === 'rgba(3,5,10,0.93)'; });
  ok('Q5.2 行星绘制了相位遮罩', night.length > 0, 'n=' + night.length);

  if (sb) {
    var B = PV.ringTilt(jd);
    var factor = Math.abs(Math.sin(B * Math.PI / 180));
    var ryOps = r.ops.filter(function (o) { return o[0] === 'ellipse'; });
    /* 环现在由 C/B/卡西尼缝/A 四条带组成：每条带的 ry/rx 都等于环倾角的正弦 */
    var bands = ryOps.filter(function (o) { return o[1] > sb.r * 1.25; });
    var got = bands.length >= 4 && bands.every(function (o) {
      return o[1] > 0 && Math.abs(o[2] / o[1] - factor) < 0.06;
    });
    ok('Q6.1 环短轴按倾角计算', got,
      'bands=' + bands.length + ' factor=' + factor.toFixed(3) + ' B=' + (B == null ? 'null' : B.toFixed(2)));
    var fixed = ryOps.some(function (o) {
      return Math.abs(o[2] - sb.r * 0.62) < 0.3;
    });
    ok('Q6.2 不再使用固定 0.62', !fixed, 'fixed=' + fixed);
  }

  /* 太阳不应有相位遮罩：扫出一个太阳高于 20° 的时刻，把相机对准它 */
  var sunJd = null, sunAA = null;
  for (var h = 0; h < 24 * 40 && !sunAA; h++) {
    var j3 = JD0 + h / 24;
    var s3 = A.sun(j3);
    var a3 = A.altAz(s3.ra, s3.dec, j3, LAT, LON);
    if (a3.alt > 20) { sunJd = j3; sunAA = a3; }
  }
  if (sunAA) {
    SkyVM.clear();
    var rs = render(sunJd, sunAA.az, Math.min(70, sunAA.alt - 8), 100);
    var sunBody = findBody(rs.vm, 'sun');
    /* 只保留太阳再绘一次：视野里可能还有别的行星，全局计数无法归因 */
    var onlySun = Object.assign({}, rs.vm);
    onlySun.bodies = rs.vm.bodies.filter(function (b) { return b.key === 'sun'; });
    var opsS = [];
    SkyRender.draw({ width: 1600, height: 900, getContext: function () { return makeCtx(opsS); } },
      { showGlobe: false }, onlySun);
    var nightSun = opsS.filter(function (o) { return o[0] === 'style' && o[1] === 'rgba(3,5,10,0.93)'; });
    ok('Q5.3 太阳不绘制相位遮罩', !!sunBody && nightSun.length === 0,
      'sunAlt=' + sunAA.alt.toFixed(1) + ' n=' + nightSun.length);
  } else {
    console.log('SKIP | Q5.3 未找到太阳可见时刻');
  }
})();

/* ---------- Q7 命中不变 ---------- */
(function () {
  SkyVM.clear();
  var r = render(JD0, 180, 32, 145);
  var starHits = r.out.hits.filter(function (h) { return h.obj.type === 'star' && String(h.obj.data.k || '').indexOf('l1:') !== 0; }).length;
  var expect = r.vm.stars.filter(function (s) { return s.alt > 0 && s.size > 1.9 * r.vm.view.k; }).length;
  ok('Q7.1 L0 命中条件未变', starHits === expect, starHits + ' vs ' + expect);
  ok('Q7.2 命中类型集合合法', r.out.hits.every(function (h) {
    return ['star', 'dso', 'planet', 'moon', 'sun'].indexOf(h.obj.type) >= 0;
  }));
})();

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
