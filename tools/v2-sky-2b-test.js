/* ASTRUM · V2-SKY 阶段 2B 离线测试（纯 Node，零依赖）
 *
 * 覆盖 L1 真实亮星表的接入：
 *   N1 数据文件结构与许可元信息
 *   N2 解码完整性（范围/NaN/缺失 B-V）
 *   N3 已知星位置量化误差
 *   N4 数据缺失时的降级
 *   N5 视图模型新增 vm.field，且 vm.stars 仍为 L0 132 条
 *   N6 命中区不受 L1 影响
 *   N7 图层门控
 *   N8 L1 记录不含可点击字段
 *   N9 绘制顺序（背景 → 星场 → L1 → 恒星）
 *   N10 性能只报告 + 宽松上界
 *
 * 用法：node tools/v2-sky-2b-test.js
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
var L0_COUNT = global.CATALOG.stars.length;

/* ---------- N1 数据元信息 ---------- */
(function () {
  var m = SD.meta();
  ok('N1.1 数据可加载', !!m, m ? 'count=' + SD.count() : 'null');
  ok('N1.2 许可为美国政府作品', !!m && /U\.S\. Government Work/i.test(m.license), m && m.license);
  ok('N1.3 来源含 HEASARC', !!m && /HEASARC/i.test(m.source));
  ok('N1.4 记录字节为 7', SD.recordBytes === 7 && (!m || m.recordBytes === 7));
  ok('N1.5 位置为 J2000 且未施加自行', !!m && m.epoch === 'J2000' && m.pm === 'not applied');
  ok('N1.6 条数与 meta.count 一致', SD.count() === (m && m.count), 'count=' + SD.count() + ' meta=' + (m && m.count));
})();

/* ---------- N2 解码完整性 ---------- */
(function () {
  var d = SD.records();
  var badRange = 0, badMag = 0, nanBV = 0, noCls = 0, minMag = 99, maxMag = -99;
  for (var i = 0; i < d.n; i++) {
    if (!(d.ra[i] >= 0 && d.ra[i] <= 360)) badRange++;
    if (!(d.dec[i] >= -90.001 && d.dec[i] <= 90.001)) badRange++;
    if (!isFinite(d.mag[i])) badMag++;
    else { if (d.mag[i] < minMag) minMag = d.mag[i]; if (d.mag[i] > maxMag) maxMag = d.mag[i]; }
    if (!isFinite(d.bv[i])) nanBV++;
    if (!d.cls[i]) noCls++;
  }
  ok('N2.1 全部坐标在合法范围', badRange === 0, 'bad=' + badRange);
  ok('N2.2 星等全部有限', badMag === 0, 'bad=' + badMag);
  ok('N2.3 星等范围合理', minMag < -1.0 && maxMag > 7.5, minMag + '..' + maxMag);
  ok('N2.4 缺失 B-V 数量符合预期（约 310）', Math.abs(nanBV - 310) <= 12, 'nanBV=' + nanBV);
  ok('N2.5 光谱型覆盖', noCls < d.n * 0.2, 'noCls=' + noCls);

  var st = SD.stats();
  ok('N2.6 亮度分档合理', st.ready && st.bins.le2_5 > 80 && st.bins.le6_5 > 8000,
    JSON.stringify(st.bins));
})();

/* ---------- N3 已知星量化误差 ---------- */
(function () {
  var d = SD.records();
  /* 天狼星 HR2491：ra 101.2871 dec -16.7161 mag -1.46；织女星 HR7001 */
  function nearest(ra, dec) {
    var best = 1e9, bi = -1;
    for (var i = 0; i < d.n; i++) {
      var dd = Math.abs(d.ra[i] - ra) + Math.abs(d.dec[i] - dec);
      if (dd < best) { best = dd; bi = i; }
    }
    return { i: bi, d: best };
  }
  var s = nearest(101.2871, -16.7161);
  ok('N3.1 天狼星位置可定位', s.i >= 0 && s.d < 0.01,
    'dRA+dDec=' + s.d.toFixed(4));
  var raErr = Math.abs(d.ra[s.i] - 101.2871), decErr = Math.abs(d.dec[s.i] + 16.7161);
  ok('N3.2 位置误差在半步内', raErr <= 360 / 65536 / 2 + 1e-6 && decErr <= 180 / 65535 / 2 + 1e-6,
    'ra=' + raErr.toFixed(4) + ' dec=' + decErr.toFixed(4));
  ok('N3.3 天狼星最亮且星等正确', Math.abs(d.mag[s.i] + 1.46) < 0.05, 'mag=' + d.mag[s.i].toFixed(2));

  /* N3.4 投影口径：数据文件 RA 以「度」存储，Astro.altAz 收「小时」。
   * 用天狼星在冬季夜晚复核：若漏了 /15，高度角会明显不符。 */
  var JD_W = A.fromLocal(2026, 1, 15, 22, 0, 8);
  var expected = A.altAzJ2000(d.ra[s.i] / 15, d.dec[s.i], JD_W, LAT, LON);
  SkyVM.clear();
  var vmW = SkyVM.build(JD_W, LAT, LON, {
    width: 1600, height: 900, yaw: 180, pitch: 32, fov: 145,
    style: 'full', detail: true, compact: false, layers: SkyLayers.normalize(null)
  });
  var hitW = null;
  for (var wi = 0; wi < vmW.field.length; wi++) {
    if (vmW.field[wi].i === s.i) { hitW = vmW.field[wi]; break; }
  }
  ok('N3.4 L1 投影按小时口径（天狼星高度角一致）',
    !!hitW && Math.abs(hitW.alt - expected.alt) < 0.05,
    hitW ? ('vm=' + hitW.alt.toFixed(2) + ' ref=' + expected.alt.toFixed(2)) : '天狼星不在视野');
  ok('N3.5 详情卡坐标按小时存储', !!hitW && Math.abs(hitW.ra - d.ra[s.i] / 15) < 1e-4,
    hitW ? ('ra=' + hitW.ra.toFixed(4) + 'h') : 'n/a');
  SkyVM.clear();
})();

/* ---------- N5/N6/N7 视图模型与命中 ---------- */
function build(yaw, pitch, fov, layers) {
  return SkyVM.build(JD, LAT, LON, {
    width: 1600, height: 900, yaw: yaw, pitch: pitch, fov: fov,
    style: 'full', detail: true, compact: false,
    layers: layers || SkyLayers.normalize(null)
  });
}
function draw(vm, ops) {
  var target = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0,
    measureText: function (t) { return { width: String(t).length * 6 }; },
    createLinearGradient: function () { return grad; },
    createRadialGradient: function () { return grad; }
  };
  var grad = { addColorStop: function () { } };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'fill',
   'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'clip', 'setLineDash',
   'fillText', 'closePath', 'drawImage'].forEach(function (m) {
    target[m] = function () { ops.push(['call', m, arguments[0]]); };
  });
  var ctx = new Proxy(target, {
    set: function (t, p, v) { ops.push(['set', p, typeof v === 'string' ? v : 'obj']); t[p] = v; return true; }
  });
  var canvas = { width: 1600, height: 900, getContext: function () { return ctx; } };
  return SkyRender.draw(canvas, { showGlobe: true }, vm);
}
function starHitCount(hits) {
  return hits.filter(function (h) { return h.obj && h.obj.type === 'star'; }).length;
}
function l1HitCount(hits) {
  return hits.filter(function (h) {
    return h.obj && h.obj.type === 'star' && h.obj.data && String(h.obj.data.k || '').indexOf('l1:') === 0;
  }).length;
}
function l0HitCount(hits) { return starHitCount(hits) - l1HitCount(hits); }

(function () {
  var vm = build(180, 32, 145);
  ok('N5.1 模型含 L1 数组', !!vm && vm.field.length > 0, 'field=' + vm.field.length);
  ok('N5.2 vm.stars 只含 L0 记录（均有 key）',
    vm.stars.length <= L0_COUNT && vm.stars.every(function (s) { return s.key != null; }),
    'stars=' + vm.stars.length + '/' + L0_COUNT);
  ok('N5.3 L1 可见数不超过总数', vm.field.length <= SD.count(), vm.field.length + '/' + SD.count());

  var ops = [];
  var out = draw(vm, ops);
  var expectedL0 = vm.stars.filter(function (s) {
    return s.alt > 0 && s.size > 1.9 * vm.view.k;
  }).length;
  ok('N6.1 L0 命中数与既有条件一致', l0HitCount(out.hits) === expectedL0,
    'l0=' + l0HitCount(out.hits) + ' expect=' + expectedL0);
  ok('N6.2 带名称的 L1 亮星可产生命中', l1HitCount(out.hits) > 0,
    'l1Hits=' + l1HitCount(out.hits) + ' named=' + SD.namedCount());
  ok('N6.3 L1 命中都带 ra/dec/mag/en', out.hits.filter(function (h) {
    return h.obj.data && String(h.obj.data.k || '').indexOf('l1:') === 0;
  }).every(function (h) {
    var d = h.obj.data;
    return isFinite(d.ra) && isFinite(d.dec) && isFinite(d.mag) && !!d.en;
  }));

  /* 关闭数据，强制重建模型后再比较命中数 */
  SD.__setMissing(true);
  SkyVM.clear();
  var vm2 = build(180, 32, 145);
  var ops2 = [];
  var out2 = draw(vm2, ops2);
  ok('N6.4 无 L1 时 L0 命中数不变',
    l0HitCount(out.hits) === l0HitCount(out2.hits) && vm.stars.length === vm2.stars.length,
    l0HitCount(out.hits) + ' vs ' + l0HitCount(out2.hits));
  ok('N6.5 无数据时 field 为空', vm2.field.length === 0);
  SD.__setMissing(false);
  SkyVM.clear();

  var lay = SkyLayers.normalize(null); lay.stars = false;
  SkyVM.clear();
  var vm3 = build(180, 32, 145, lay);
  ok('N7.1 关闭 stars 图层后 field 为空', vm3.field.length === 0);

  SkyVM.clear();
  var vm4 = build(180, 32, 145);
  var sample = vm4.field[0];
  ok('N8.1 L1 记录不含 key/raw', !('key' in sample) && !('raw' in sample), Object.keys(sample).join(','));
  ok('N8.2 L1 记录带记录索引', typeof sample.i === 'number', 'i=' + sample.i);
})();

/* ---------- N9 绘制顺序 ---------- */
(function () {
  SkyVM.clear();
  var vm = build(180, 32, 145);
  var ops = [];
  draw(vm, ops);
  function idx(prop, re) {
    for (var i = 0; i < ops.length; i++) {
      if (ops[i][0] === 'set' && ops[i][1] === prop && re.test(String(ops[i][2]))) return i;
    }
    return -1;
  }
  var iDust = idx('fillStyle', /rgba\(207,221,245/);
  var iField = idx('fillStyle', /rgba\(198,214,255/);
  var iL0 = idx('fillStyle', /rgba\(226,234,248/);
  ok('N9.1 星场 → L1 → 恒星', iDust >= 0 && iField > iDust && iL0 > iField,
    [iDust, iField, iL0].join(','));
})();

/* ---------- N10 性能（只报告 + 宽松上界） ---------- */
(function () {
  SkyVM.clear();
  var t0 = Date.now();
  SkyVM.build(JD, LAT, LON, { width: 1600, height: 900, yaw: 180, pitch: 32, fov: 145 });
  var tModel = Date.now() - t0;

  var vm = SkyVM.build(JD, LAT, LON, { width: 1600, height: 900, yaw: 180, pitch: 32, fov: 145 });
  var t1 = Date.now();
  for (var i = 0; i < 10; i++) {
    SkyVM.build(JD, LAT, LON, { width: 1600, height: 900, yaw: 180 + i, pitch: 32, fov: 145 });
  }
  var tBuild = (Date.now() - t1) / 10;

  var ops = [];
  var t2 = Date.now();
  for (var j = 0; j < 5; j++) draw(vm, ops);
  var tDraw = (Date.now() - t2) / 5;

  console.log('PERF | model(含L1)=' + tModel + 'ms build=' + tBuild.toFixed(1) +
    'ms draw(含L1)=' + tDraw.toFixed(1) + 'ms field=' + vm.field.length);
  ok('N10.1 模型构建未失控（<400ms）', tModel < 400, tModel + 'ms');
  ok('N10.2 相机重建未失控（<400ms）', tBuild < 400, tBuild.toFixed(1) + 'ms');
})();

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
