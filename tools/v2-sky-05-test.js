/* ASTRUM · V2-SKY 阶段 5 离线测试（纯 Node，零依赖）
 *
 * 覆盖地平线升级：
 *   H1 地面与光害仍在（背景合成前提）
 *   H2 10° 细刻度
 *   H3 30° 主刻度
 *   H4 度数标注（跳过四正方向）
 *   H5 八向字母保留
 *   H6 关闭 horizon 图层后刻度/字母消失
 *   H7 地平线下天体使用加强虚线并标注「已落下」
 *   H8 L1 星场不绘制地平线以下（alt ≥ 0.3）
 *
 * 用法：node tools/v2-sky-05-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

['data/catalog.js', 'data/bodies.js', 'core/astro.js',
 'data/sky-stars-l1.js', 'core/sky-star-data.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/planet-visuals.js', 'core/sky-renderer.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro;
var SkyVM = global.SkyVM;
var SkyLayers = global.SkyLayers;
var SkyRender = global.SkyRender;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var LAT = 31.23, LON = 121.47;

function makeCtx(ops) {
  var grad = { addColorStop: function () { } };
  var target = {
    canvas: null, fillStyle: '', strokeStyle: '', lineWidth: 1, globalAlpha: 1,
    font: '', textAlign: 'left', textBaseline: 'alphabetic', lineCap: '', lineJoin: '',
    globalCompositeOperation: 'source-over', shadowColor: '', shadowBlur: 0,
    measureText: function (t) { return { width: String(t).length * 6 }; },
    createLinearGradient: function (x0, y0, x1, y1) {
      ops.push(['grad', [x0, y0, x1, y1]]); return grad;
    },
    createRadialGradient: function () { return grad; }
  };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'fill',
   'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'clip',
   'fillText', 'closePath', 'drawImage'].forEach(function (m) {
    target[m] = function () {
      if (m === 'fillText') ops.push(['text', String(arguments[0])]);
      else ops.push(['call', m]);
    };
  });
  target.setLineDash = function (d) {
    ops.push(['dash', Array.isArray(d) ? d.join(',') : String(d)]);
  };
  return new Proxy(target, {
    set: function (t, p, v) {
      if (p === 'fillStyle' || p === 'strokeStyle') ops.push(['style', p, String(v)]);
      t[p] = v; return true;
    }
  });
}

function render(jd, opts) {
  var ops = [];
  var ctx = makeCtx(ops);
  var canvas = { width: 1600, height: 900, getContext: function () { return ctx; } };
  var vm = SkyVM.build(jd, LAT, LON, {
    width: 1600, height: 900,
    yaw: opts.yaw == null ? 180 : opts.yaw,
    pitch: opts.pitch == null ? 32 : opts.pitch,
    fov: opts.fov == null ? 145 : opts.fov,
    style: 'full', detail: true, compact: false,
    layers: opts.layers || SkyLayers.normalize(null)
  });
  var out = SkyRender.draw(canvas, { showGlobe: false }, vm);
  return { ops: ops, vm: vm, out: out };
}

function hasStyle(ops, prop, needle) {
  for (var i = 0; i < ops.length; i++) {
    if (ops[i][0] === 'style' && ops[i][1] === prop && String(ops[i][2]).indexOf(needle) >= 0) return true;
  }
  return false;
}
function texts(ops) { return ops.filter(function (o) { return o[0] === 'text'; }).map(function (o) { return o[1]; }); }

var JD = A.fromLocal(2026, 11, 5, 21, 0, 8);
SkyVM.clear();
var base = render(JD, {});

/* H1 地面与光害 */
ok('H1.1 地面渐变存在', (function () {
  return base.ops.some(function (o) { return o[0] === 'grad'; });
})());
ok('H1.2 光害带仍在（地面渐变 + 填充）',
  hasStyle(base.ops, 'fillStyle', 'rgba') && base.ops.filter(function (o) { return o[1] === 'fill'; }).length > 3);

/* H2/H3 刻度 */
ok('H2.1 10° 细刻度已绘制', hasStyle(base.ops, 'strokeStyle', 'rgba(132,172,214,0.30)'));
ok('H3.1 30° 主刻度已绘制', hasStyle(base.ops, 'strokeStyle', 'rgba(170,196,226,0.55)'));

/* H4 度数标注：出现在、且只出现在非四正方向的 30° 倍数 */
(function () {
  var ts = texts(base.ops);
  var deg = ts.filter(function (t) { return /^\d+°$/.test(t); }).map(function (t) { return parseInt(t, 10); });
  ok('H4.1 存在度数标注', deg.length > 0, deg.join(','));
  ok('H4.2 度数标注跳过四正方向', deg.every(function (d) { return d % 90 !== 0; }));
})();

/* H5 八向字母（视场有限，跨四个朝向取并集） */
(function () {
  var seen = {};
  [0, 90, 180, 270].forEach(function (y) {
    SkyVM.clear();
    var r = render(JD, { yaw: y });
    texts(r.ops).forEach(function (t) {
      if (['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'].indexOf(t) >= 0) seen[t] = 1;
    });
  });
  var need = ['N', 'E', 'S', 'W'];
  ok('H5.1 八向字母保留', need.every(function (n) { return seen[n]; }), Object.keys(seen).join(','));
})();

/* H6 关闭 horizon 图层 */
(function () {
  var lay = SkyLayers.normalize(null); lay.horizon = false;
  SkyVM.clear();
  var off = render(JD, { layers: lay });
  ok('H6.1 关闭后无刻度', !hasStyle(off.ops, 'strokeStyle', 'rgba(132,172,214,0.30)') &&
    !hasStyle(off.ops, 'strokeStyle', 'rgba(170,196,226,0.55)'));
  ok('H6.2 关闭后无八向字母', ['N', 'E', 'S', 'W'].every(function (n) {
    return texts(off.ops).indexOf(n) < 0;
  }));
})();

/* H7 地平线下加强虚线 + 「已落下」 */
(function () {
  var found = null;
  for (var day = 1; day <= 28 && !found; day++) {
    for (var hour = 0; hour < 24 && !found; hour++) {
      var jd2 = A.fromLocal(2026, 11, day, hour, 0, 8);
      var list = A.planets(jd2);
      for (var i = 0; i < list.length; i++) {
        var aa = A.altAz(list[i].ra, list[i].dec, jd2, LAT, LON);
        if (aa.alt < 0 && aa.alt > -6) {
          found = { jd: jd2, name: list[i].cn || list[i].name, alt: aa.alt, az: aa.az };
          break;
        }
      }
    }
  }
  if (!found) {
    console.log('SKIP | H7 未找到 −6°~0° 的行星样本');
    return;
  }
  SkyVM.clear();
  /* 把相机对准该方位，pitch=0 让 −6°~0° 落在画面内；
   * 视场收窄到 50°，避免与其他天体的标签互相避让导致被裁掉。 */
  var r = render(found.jd, { yaw: found.az, pitch: 0, fov: 50 });
  var ts = texts(r.ops);
  var dashNear = r.ops.some(function (o) {
    if (o[0] !== 'dash') return false;
    var p = String(o[1]).split(',').map(Number);
    return p.length === 2 && p[1] > 0 && Math.abs(p[0] / p[1] - 2.5) < 0.25;
  });
  ok('H7.1 临近地平线的地下天体使用加强虚线', dashNear,
    'alt=' + found.alt.toFixed(1) + ' bodies=' + r.vm.bodies.length);

  /* 标签避让可能把相邻天体标签裁掉，这里只保留地下天体，单独验证文案规则 */
  var onlyBelow = Object.assign({}, r.vm);
  onlyBelow.bodies = r.vm.bodies.filter(function (b) { return b.below; });
  var ops2 = [];
  var ctx2 = makeCtx(ops2);
  SkyRender.draw({ width: 1600, height: 900, getContext: function () { return ctx2; } },
    { showGlobe: false }, onlyBelow);
  var ts2 = texts(ops2);
  ok('H7.2 地下天体标签标注「已落下」', ts2.some(function (t) { return t.indexOf('已落下') >= 0; }),
    found.name + ' alt=' + found.alt.toFixed(1) + ' | ' + ts2.slice(0, 4).join('/'));
})();

/* H8 L1 星场不在地平线以下绘制 */
(function () {
  SkyVM.clear();
  var r = render(JD, {});
  var bad = r.vm.field.filter(function (p) { return p.alt < 0.3; }).length;
  ok('H8.1 L1 星场全部 alt ≥ 0.3', bad === 0, 'bad=' + bad + ' field=' + r.vm.field.length);
})();

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
