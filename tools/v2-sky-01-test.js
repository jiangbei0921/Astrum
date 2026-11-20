/* ASTRUM · V2-SKY 阶段 1 离线测试（纯 Node，零依赖）
 *
 * 覆盖规格 §9 的 L1–L9：
 *   L1 图层状态接口
 *   L2 视图模型与 Astro.altAz 数据一致（132 星 / 54 DSO / 22 星座 / 行星 / 月 / 日）
 *   L3 模型缓存语义
 *   L4 不修改 CATALOG、不伪造物理字段
 *   L5 投影几何一致性
 *   L6 渲染器绘制顺序
 *   L7 图层门控
 *   L8 命中区/天体/meta 结构契约
 *   L9 行星视觉接口降级
 *
 * 用法：node tools/v2-sky-01-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

['data/catalog.js', 'data/bodies.js', 'core/astro.js',
 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/planet-visuals.js', 'core/sky-renderer.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var A = global.Astro;
var CAT = global.CATALOG;
var SkyVM = global.SkyVM;
var SkyLayers = global.SkyLayers;
var SkyRender = global.SkyRender;
var PlanetVisuals = global.PlanetVisuals;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

var JD = A.fromLocal(2026, 11, 5, 21, 0, 8);
var LAT = 31.23, LON = 121.47;

/* ---------- L1 图层状态 ---------- */
(function () {
  var d = SkyLayers.DEFAULTS;
  ok('L1.1 默认 7 图层全开', SkyLayers.ORDER.length === 7 &&
    SkyLayers.ORDER.every(function (k) { return d[k] === true; }), JSON.stringify(d));

  var s = SkyLayers.create();
  ok('L1.2 all() 返回副本', (function () {
    var a = s.all(); a.stars = false;
    return s.isOn('stars') === true;
  })());

  ok('L1.3 set 生效', s.set('stars', false) === true && s.isOn('stars') === false);
  ok('L1.4 toggle 生效', s.toggle('stars') === true && s.isOn('stars') === true);
  ok('L1.5 未知键无副作用', s.set('nope', false) === false && s.isOn('stars') === true);
  ok('L1.6 reset 回到默认', (function () { s.set('horizon', false); s.reset(); return s.isOn('horizon') === true; })());
  ok('L1.7 normalize 补全缺键', (function () {
    var n = SkyLayers.normalize({ stars: false });
    return n.stars === false && n.labels === true && Object.keys(n).length === 7;
  })());
})();

/* ---------- L2 数据一致性 ---------- */
(function () {
  var m = SkyVM.model(JD, LAT, LON);

  var starOracle = CAT.stars.filter(function (s) {
    return A.altAz(s.ra, s.dec, JD, LAT, LON).alt >= -1;
  });
  ok('L2.1 恒星数量一致', m.stars.length === starOracle.length,
    'vm=' + m.stars.length + ' oracle=' + starOracle.length);

  var maxErr = 0;
  m.stars.forEach(function (rec) {
    var aa = A.altAz(rec.st.ra, rec.st.dec, JD, LAT, LON);
    maxErr = Math.max(maxErr, Math.abs(aa.az - rec.az), Math.abs(aa.alt - rec.alt));
  });
  ok('L2.2 恒星 alt/az 一致（1e-9）', maxErr < 1e-9, 'maxErr=' + maxErr);

  var dsoOracle = CAT.dso.filter(function (d) { return A.altAz(d.ra, d.dec, JD, LAT, LON).alt >= 0; });
  ok('L2.3 DSO 数量一致', m.dso.length === dsoOracle.length,
    'vm=' + m.dso.length + ' oracle=' + dsoOracle.length);

  var planets = A.planets(JD);
  ok('L2.4 行星数量一致', m.planets.length === planets.length, 'n=' + m.planets.length);
  var pErr = 0;
  planets.forEach(function (pl, i) {
    var aa = A.altAz(pl.ra, pl.dec, JD, LAT, LON);
    pErr = Math.max(pErr, Math.abs(aa.az - m.planets[i].az), Math.abs(aa.alt - m.planets[i].alt));
  });
  ok('L2.5 行星 alt/az 一致', pErr < 1e-9, 'maxErr=' + pErr);

  var sp = A.sun(JD);
  var saa = A.altAz(sp.ra, sp.dec, JD, LAT, LON);
  ok('L2.6 太阳 alt/az 一致', Math.abs(saa.alt - m.sun.alt) < 1e-9 && Math.abs(saa.az - m.sun.az) < 1e-9);

  var mp = A.moonPhase(JD);
  var maa = A.altAz(mp.ra, mp.dec, JD, LAT, LON);
  ok('L2.7 月球 alt/az 一致', Math.abs(maa.alt - m.moon.alt) < 1e-9 && Math.abs(maa.az - m.moon.az) < 1e-9);

  var consOracle = CAT.constellations.filter(function (c) {
    return c.lines.some(function (seg) {
      var s1 = SkyVM.starByKey(seg[0]), s2 = SkyVM.starByKey(seg[1]);
      if (!s1 || !s2) return false;
      return A.altAz(s1.ra, s1.dec, JD, LAT, LON).alt >= -1 &&
        A.altAz(s2.ra, s2.dec, JD, LAT, LON).alt >= -1;
    });
  });
  ok('L2.8 星座数量一致', m.cons.length === consOracle.length,
    'vm=' + m.cons.length + ' oracle=' + consOracle.length);

  var segErr = 0;
  m.cons.forEach(function (rec) {
    rec.segs.forEach(function (sg) {
      var s1 = null, s2 = null;
      rec.c.lines.forEach(function (ln) {
        var a1 = SkyVM.starByKey(ln[0]), a2 = SkyVM.starByKey(ln[1]);
        var aa1 = A.altAz(a1.ra, a1.dec, JD, LAT, LON);
        var aa2 = A.altAz(a2.ra, a2.dec, JD, LAT, LON);
        if (Math.abs(aa1.az - sg[0]) < 1e-9 && Math.abs(aa1.alt - sg[1]) < 1e-9) { s1 = a1; s2 = a2; }
      });
      if (!s1) segErr++;
    });
  });
  ok('L2.9 星座端点可反查', segErr === 0, 'bad=' + segErr);
})();

/* ---------- L3 缓存 ---------- */
(function () {
  var a = SkyVM.model(JD, LAT, LON);
  var b = SkyVM.model(JD, LAT, LON);
  ok('L3.1 同参数返回同一对象', a === b);

  var c = SkyVM.model(JD + 0.5, LAT, LON);
  ok('L3.2 新时刻重建', c !== a && c.stars.length >= 0);

  SkyVM.clear();
  var d = SkyVM.model(JD, LAT, LON);
  ok('L3.3 clear 后可重建', d !== a && d.stars.length === a.stars.length);

  var key = SkyVM.cache().key;
  ok('L3.4 缓存键格式不变', /^\d+\.\d{5}\|\d+\.\d{4}\|\d+\.\d{4}$/.test(key), key);
  ok('L3.5 记录了构建耗时', SkyVM.cache().buildMs >= 0, String(SkyVM.cache().buildMs));
})();

/* ---------- L4 不修改星表 / 不伪造字段 ---------- */
(function () {
  var before = JSON.stringify(CAT);
  var vm = SkyVM.build(JD, LAT, LON, { width: 760, height: 540, style: 'full', detail: true });
  ok('L4.1 build 不修改 CATALOG', JSON.stringify(CAT) === before);

  var extra = ['bv', 'spectral', 'distPc', 'pmRA', 'pmDec'];
  var bad = [];
  vm.stars.slice(0, 20).forEach(function (s) {
    extra.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(s, k)) bad.push('star:' + k); });
  });
  vm.dso.slice(0, 20).forEach(function (d) {
    extra.forEach(function (k) { if (Object.prototype.hasOwnProperty.call(d, k)) bad.push('dso:' + k); });
  });
  ok('L4.2 不伪造 B-V/光谱/自行字段', bad.length === 0, bad.join(','));

  ok('L4.3 视图对象不复用原始对象', vm.stars.length > 0 && vm.stars[0].raw !== vm.stars[0]);
})();

/* ---------- L5 投影几何 ---------- */
(function () {
  var p = SkyVM.projector({ width: 760, height: 540, yaw: 180, pitch: 12, fov: 145 });
  var g = p.geom;
  ok('L5.1 视线方向落在中心', (function () {
    var q = p.proj(180, 12);
    return q && Math.abs(q.x - g.cx) < 1e-9 && Math.abs(q.y - g.cy) < 1e-9;
  })());

  ok('L5.2 地平线在中心下方', (function () {
    var q = p.proj(180, 0);
    return q && q.y > g.cy;
  })());

  ok('L5.3 正东在中心左侧（面南时西在右）', (function () {
    var pw = SkyVM.projector({ width: 760, height: 540, yaw: 180, pitch: 12, fov: 178 });
    var q = pw.proj(90, 0);
    return q && q.x < pw.geom.cx;
  })());

  var small = SkyVM.build(JD, LAT, LON, { width: 760, height: 540, yaw: 180, pitch: 12, fov: 40 });
  var wide = SkyVM.build(JD, LAT, LON, { width: 760, height: 540, yaw: 180, pitch: 12, fov: 160 });
  ok('L5.4 视场越大可见恒星越多', wide.stars.length > small.stars.length,
    'small=' + small.stars.length + ' wide=' + wide.stars.length);
})();

/* ---------- 渲染测试桩 ---------- */
function makeCtx(ops) {
  var grad = { addColorStop: function () {} };
  var target = {
    font: '10px sans-serif', fillStyle: '', strokeStyle: '', lineWidth: 1,
    globalAlpha: 1, globalCompositeOperation: 'source-over', textAlign: 'left',
    shadowColor: '', shadowBlur: 0,
    measureText: function (t) { return { width: String(t).length * 6 }; },
    createLinearGradient: function () { ops.push(['call', 'createLinearGradient']); return grad; },
    createRadialGradient: function () { ops.push(['call', 'createRadialGradient']); return grad; }
  };
  ['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'arc', 'ellipse', 'fill',
   'stroke', 'save', 'restore', 'translate', 'rotate', 'scale', 'clip', 'setLineDash',
   'fillText', 'closePath', 'drawImage'
  ].forEach(function (m) {
    target[m] = function () { ops.push(['call', m, arguments[0]]); };
  });
  return new Proxy(target, {
    set: function (t, prop, v) {
      ops.push(['set', prop, (typeof v === 'string' || typeof v === 'number') ? v : 'object']);
      t[prop] = v;
      return true;
    }
  });
}
function makeCanvas(ops, w, h) {
  var ctx = makeCtx(ops);
  return { width: w || 760, height: h || 540, _ops: ops, getContext: function () { return ctx; } };
}
function find(ops, type, prop, needle) {
  for (var i = 0; i < ops.length; i++) {
    var o = ops[i];
    if (o[0] === type && o[1] === prop) {
      if (needle == null) return i;
      var v = String(o[2]);
      if (typeof needle === 'number') { if (Number(o[2]) === needle) return i; }
      else if (needle instanceof RegExp) { if (needle.test(v)) return i; }
      else if (v === needle) return i;
    }
  }
  return -1;
}

function drawWith(layers) {
  var ops = [];
  var canvas = makeCanvas(ops, 1600, 900);
  var vm = SkyVM.build(JD, LAT, LON, {
    width: 1600, height: 900, yaw: 180, pitch: 32, fov: 145,
    style: 'full', detail: true, compact: false,
    layers: layers || SkyLayers.normalize(null)
  });
  var out = SkyRender.draw(canvas, { showGlobe: true }, vm);
  return { ops: ops, out: out, vm: vm };
}

/* ---------- L6 绘制顺序 ---------- */
(function () {
  var r = drawWith();
  var iSky = find(r.ops, 'call', 'fillRect');
  var iMilky = find(r.ops, 'set', 'strokeStyle', 'rgba(120,150,205,0.085)');
  var iDust = find(r.ops, 'set', 'fillStyle', /rgba\(207,221,245/);
  var iStars = find(r.ops, 'set', 'fillStyle', /rgba\(226,234,248/);
  var iDso = find(r.ops, 'set', 'strokeStyle', 'rgba(186,166,232,0.8)');
  var iCons = find(r.ops, 'set', 'strokeStyle', /rgba\(140,170,235/);
  var iBody = find(r.ops, 'set', 'globalAlpha');
  var iHz = find(r.ops, 'set', 'strokeStyle', 'rgba(226,190,132,0.8)');
  var iDir = find(r.ops, 'set', 'fillStyle', 'rgba(216,226,244,0.55)');
  var iLabels = find(r.ops, 'set', 'shadowBlur', 6);
  var iGlobe = find(r.ops, 'call', 'fillText', '你在这里');

  ok('L6.1 清屏先于绘制', find(r.ops, 'call', 'clearRect') < r.ops.length && find(r.ops, 'call', 'clearRect') < iSky);
  ok('L6.2 背景 → 银河 → 星场 → 恒星', iSky >= 0 && iMilky > iSky && iDust > iMilky && iStars > iDust,
    [iSky, iMilky, iDust, iStars].join(','));
  ok('L6.3 恒星 → DSO → 星座线', iDso > iStars && iCons > iDso, [iStars, iDso, iCons].join(','));
  ok('L6.4 星座线 → 天体', iBody > iCons, [iCons, iBody].join(','));
  ok('L6.5 天体 → 地平线 → 方位 → 标签', iHz > iBody && iDir > iHz && iLabels > iDir,
    [iBody, iHz, iDir, iLabels].join(','));
  ok('L6.6 标签 → 地球小窗', iGlobe > iLabels, [iLabels, iGlobe].join(','));
  ok('L6.7 save/restore 配对', (function () {
    var depth = 0, bad = 0;
    r.ops.forEach(function (o) {
      if (o[0] === 'call' && o[1] === 'save') depth++;
      if (o[0] === 'call' && o[1] === 'restore') { depth--; if (depth < 0) bad++; }
    });
    return bad === 0 && depth === 0;
  })());
})();

/* ---------- L7 图层门控 ---------- */
(function () {
  var off = SkyLayers.normalize(null);
  off.stars = false;
  var r1 = drawWith(off);
  ok('L7.1 关闭 stars 时不画星场/恒星',
    find(r1.ops, 'set', 'fillStyle', /rgba\(207,221,245/) < 0 &&
    find(r1.ops, 'set', 'fillStyle', /rgba\(226,234,248/) < 0);
  ok('L7.2 关闭 stars 时其他层仍在', find(r1.ops, 'set', 'strokeStyle', /rgba\(140,170,235/) >= 0);

  var off2 = SkyLayers.normalize(null);
  off2.horizon = false;
  off2.labels = false;
  var r2 = drawWith(off2);
  ok('L7.3 关闭 horizon 时无地平线', find(r2.ops, 'set', 'strokeStyle', 'rgba(226,190,132,0.8)') < 0);
  ok('L7.4 关闭 labels 时无文字阴影', find(r2.ops, 'set', 'shadowBlur', 6) < 0);
  ok('L7.5 关闭 labels 时天体仍绘制', find(r2.ops, 'set', 'globalAlpha') >= 0);
})();

/* ---------- L8 命中区结构 ---------- */
(function () {
  var r = drawWith();
  var out = r.out;
  var hits = out.hits || [];
  var bodies = out.bodies || [];

  ok('L8.1 bodies 非空', bodies.length >= 1, 'bodies=' + bodies.length);
  ok('L8.2 bodies 记录字段完整', bodies.every(function (b) {
    return b && b.pt && isFinite(b.pt.x) && isFinite(b.pt.y) && isFinite(b.r) && b.r > 0 &&
      typeof b.name === 'string' && b.info;
  }), 'n=' + bodies.length);

  ok('L8.3 hits 结构合法', hits.length > 0 && hits.every(function (h) {
    return isFinite(h.x) && isFinite(h.y) && isFinite(h.r) && h.r > 0 &&
      h.obj && ['star', 'dso', 'planet', 'moon', 'sun'].indexOf(h.obj.type) >= 0 && h.obj.data;
  }), 'hits=' + hits.length);

  ok('L8.4 命中总数 = 恒星 + DSO + 天体', (function () {
    var starHits = hits.filter(function (h) { return h.obj.type === 'star'; }).length;
    var dsoHits = hits.filter(function (h) { return h.obj.type === 'dso'; }).length;
    var bodyHits = hits.length - starHits - dsoHits;
    return bodyHits === bodies.length;
  })());

  ok('L8.5 土星可检索', hits.some(function (h) {
    return h.obj.type === 'planet' && h.obj.data && h.obj.data.name === '土星';
  }));

  ok('L8.6 恒星命中携带原始星表对象', (function () {
    var h = hits.filter(function (x) { return x.obj.type === 'star'; })[0];
    return h && h.obj.data && typeof h.obj.data.k === 'string' && typeof h.obj.data.mag === 'number';
  })());

  ok('L8.7 meta 键集合不变', (function () {
    var keys = Object.keys(out.meta).sort().join(',');
    return keys === 'fov,hit,hz,pitch,yaw';
  })(), Object.keys(out.meta).sort().join(','));
})();

/* ---------- L9 行星视觉接口 ---------- */
(function () {
  var cap = PlanetVisuals.capabilities();
  ok('L9.1 缺少 primitives 时降级', cap.source === 'none' && cap.detailedSphere === false && cap.rings === false,
    JSON.stringify(cap));
  ok('L9.2 sphere 安全返回 false', PlanetVisuals.sphere(makeCtx([]), { key: 'saturn' }) === false);
  ok('L9.3 rings 安全返回 false', PlanetVisuals.rings(makeCtx([]), { key: 'saturn' }, true) === false);
  ok('L9.4 texture 返回 null', PlanetVisuals.texture('mars') === null);
  ok('L9.5 summary 给出阶段 5 前提', PlanetVisuals.summary().requiredChanges.length >= 3);
})();

console.log('');
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail === 0 ? 0 : 1);
