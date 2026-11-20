/* ASTRUM · P2 独立运行时质量测试（Node 内置模块，零依赖）
 * node tools/visual-stars-quality-test.js
 * TEST_ONLY 数据只存在于隔离 VM；不修改生产模块、全局或旧测试。
 * 编码测试使用真实适配器。仅超出 [-2,8] 编码范围的 LOD 测试替换隔离 VM 的 SD.load。
 * 画布记录真实 SkyRender.draw 的 Path2D/颜色/命中，不复制私有颜色函数。
 */
'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var nodeVM = require('vm');
var ROOT = path.resolve(__dirname, '..');
var JD = 2461349.5;
var W = 1200, H = 900;
var pass = 0, fail = 0;
var hostCatalog = global.CATALOG;
var hostStarData = global.SkyStarData;
var SCALE = { ra: 360 / 65536, dec: 180 / 65535, magMin: -2, magMax: 8, bvMin: -0.5, bvMax: 5.8 };
var MAG_STEP = 10 / 255, BV_STEP = 6.3 / 255;

function test(name, fn) {
  try {
    var detail = fn();
    pass++;
    console.log('PASS | ' + name + (detail ? ' | ' + detail : ''));
  } catch (err) {
    fail++;
    console.error('FAIL | ' + name + ' | ' + (err.stack || err));
  }
}
function near(actual, expected, epsilon, label) {
  assert(Number.isFinite(actual) && Number.isFinite(expected), label + ': non-finite');
  assert(Math.abs(actual - expected) <= epsilon, label + ': ' + actual + ' != ' + expected);
}
function plain(value) { return JSON.parse(JSON.stringify(value)); }
function ids(view) { return Array.from(view.field, function (s) { return s.i; }); }
function loadFile(context, relative) {
  nodeVM.runInContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), context, { filename: relative });
}
function CapturePath() { this.arcs = []; }
CapturePath.prototype.moveTo = function () {};
CapturePath.prototype.arc = function (x, y, r) { this.arcs.push({ x: x, y: y, r: r }); };

function isolated(source) {
  var context = nodeVM.createContext({
    atob: function (text) { return Buffer.from(text, 'base64').toString('binary'); },
    Path2D: CapturePath
  });
  nodeVM.runInContext('globalThis.global = globalThis;', context);
  ['data/catalog.js', 'data/bodies.js', 'core/astro.js'].forEach(function (f) { loadFile(context, f); });
  if (source === 'production') loadFile(context, 'data/sky-stars-l1.js');
  else if (source) context.SKY_STARS_L1 = source;
  ['core/sky-star-data.js', 'core/sky-layers.js', 'core/sky-viewmodel.js', 'core/sky-renderer.js']
    .forEach(function (f) { loadFile(context, f); });
  return context;
}

/* Explicit TEST_ONLY binary encoder, not the builder under test. No clamping:
 * out-of-range fixture inputs must fail rather than silently changing the case. */
function fixture(rows) {
  var bytes = Buffer.alloc(rows.length * 7);
  var names = [];
  rows.forEach(function (s, i) {
    assert(Number.isFinite(s.ra) && s.ra >= 0 && s.ra < 360);
    assert(Number.isFinite(s.dec) && s.dec >= -90 && s.dec <= 90);
    assert(Number.isFinite(s.mag) && s.mag >= -2 && s.mag <= 8);
    assert(s.bv == null || (Number.isFinite(s.bv) && s.bv >= -0.5 && s.bv <= -0.5 + 254 * BV_STEP));
    var raCode = Math.round(s.ra / SCALE.ra);
    var decCode = Math.round((s.dec + 90) / SCALE.dec);
    assert(raCode >= 0 && raCode <= 65535 && decCode >= 0 && decCode <= 65535);
    bytes.writeUInt16LE(raCode, i * 7);
    bytes.writeUInt16LE(decCode, i * 7 + 2);
    bytes[i * 7 + 4] = Math.round((s.mag + 2) / MAG_STEP);
    bytes[i * 7 + 5] = s.bv == null ? 255 : Math.round((s.bv + 0.5) / BV_STEP);
    bytes[i * 7 + 6] = s.cls || 0;
    if (s.name) names.push([i, s.altName || '', s.name]);
  });
  return {
    version: 'TEST_ONLY', source: 'TEST_ONLY deterministic synthetic stars; NOT observations',
    epoch: 'J2000', pm: false, count: rows.length, scale: Object.assign({}, SCALE),
    magStep: MAG_STEP, bvStep: BV_STEP, names: names, data: bytes.toString('base64')
  };
}
function row(ra, dec, mag, bv, cls) { return { ra: ra, dec: dec, mag: mag, bv: bv, cls: cls || 0 }; }
function longitudeAtRA(context, ra) {
  return context.Astro.norm180(ra - context.Astro.lstHours(JD, 0) * 15);
}
function options(yaw, pitch, fov) {
  return {
    width: W, height: H, yaw: yaw, pitch: pitch, fov: fov, style: 'minimal',
    layers: { stars: true, constellations: false, milkyWay: false,
      deepSkyObjects: false, planets: false, horizon: false, labels: false }
  };
}
function aim(context, ra, dec, lat, lon, fov) {
  var aa = context.Astro.altAz(ra / 15, dec, JD, lat, lon);
  assert(aa.alt > 0.3, 'target must be above horizon');
  return options(aa.az, Math.min(78, aa.alt), fov);
}
function build(context, lat, lon, opts) { return context.SkyVM.build(JD, lat, lon, opts); }

/* No grid/cell/radius filter here. Small fixtures deliberately avoid the 8000
 * candidate cap: enumerate every decoded coordinate through public projection. */
function reference(context, data, lat, lon, opts) {
  assert(data.n < 8000, 'reference requires uncapped fixture');
  var pr = context.SkyVM.projector(opts);
  var limit = Math.max(5, 10 - (pr.geom.fov - 30) * (4 / 148));
  var result = [];
  for (var i = 0; i < data.n; i++) {
    var aa = context.Astro.altAz(data.ra[i] / 15, data.dec[i], JD, lat, lon);
    var alt = Math.fround(aa.alt), az = Math.fround(aa.az);
    if (data.mag[i] > limit || alt < 0.3) continue;
    var q = pr.proj(az, alt);
    if (q && q.x >= -8 && q.x <= W + 8 && q.y >= -8 && q.y <= H + 8) {
      result.push({ i: i, x: q.x, y: q.y, alt: alt });
    }
  }
  return result;
}
function compareReference(context, data, lat, lon, opts) {
  var view = build(context, lat, lon, opts);
  var expected = reference(context, data, lat, lon, opts);
  assert(expected.length > 0 && view.field.length > 0, 'non-vacuous visible result');
  assert.deepStrictEqual(ids(view), expected.map(function (s) { return s.i; }));
  view.field.forEach(function (s, i) {
    near(s.x, expected[i].x, 1e-8, 'projected x');
    near(s.y, expected[i].y, 1e-8, 'projected y');
    near(s.alt, expected[i].alt, 1e-6, 'actual equatorial direction altitude');
    assert(s.x >= -8 && s.x <= W + 8 && s.y >= -8 && s.y <= H + 8);
  });
  return view;
}
function draw(context, view) {
  var fills = [];
  var gradient = { addColorStop: function () {} };
  var g = {
    fillStyle: '',
    clearRect: function () {}, fillRect: function () {},
    createLinearGradient: function () { return gradient; },
    fill: function (p) {
      assert(p instanceof CapturePath, 'star layers must use captured real Path2D');
      p.arcs.forEach(function (arc) { fills.push({ x: arc.x, y: arc.y, r: arc.r, color: g.fillStyle }); });
    }
  };
  var canvas = { width: W, height: H, getContext: function (kind) { assert.strictEqual(kind, '2d'); return g; } };
  var result = context.SkyRender.draw(canvas, {}, view);
  /* Same write-back contract as app.js: hits originate only from real renderer. */
  canvas._hits = result.hits;
  canvas._bodies = result.bodies;
  canvas._meta = result.meta;
  return { canvas: canvas, fills: fills };
}
function colorAt(rendered, star) {
  var matches = rendered.fills.filter(function (op) {
    return Math.abs(op.x - star.x) < 1e-8 && Math.abs(op.y - star.y) < 1e-8 &&
      Math.abs(op.r - Math.max(0.6, star.size)) < 1e-8;
  });
  assert.strictEqual(matches.length, 1, 'one real L1 path arc per fixture star');
  var match = /^rgba\((\d+),(\d+),(\d+),([\d.]+)\)$/.exec(matches[0].color);
  assert(match, 'valid captured rgba: ' + matches[0].color);
  var channels = match.slice(1).map(Number);
  channels.slice(0, 3).forEach(function (v) { assert(Number.isFinite(v) && v >= 0 && v <= 255); });
  assert(Number.isFinite(channels[3]) && channels[3] >= 0 && channels[3] <= 1);
  return channels;
}
function verifyBV(source, data) {
  var bytes = Buffer.from(source.data, 'base64');
  assert.strictEqual(bytes.length, data.n * 7);
  for (var i = 0; i < data.n; i++) {
    var code = bytes[i * 7 + 5];
    assert.strictEqual(typeof data.bv[i], 'number');
    if (code === 255) assert(Number.isNaN(data.bv[i]), 'only 255 means NaN at ' + i);
    else {
      assert(Number.isFinite(data.bv[i]), 'non-sentinel B-V must be finite at ' + i);
      near(data.bv[i], Math.fround(code * source.bvStep + source.scale.bvMin), 1e-6, 'B-V decode');
    }
  }
}

// ---- Runtime tests (all fixture values are TEST_ONLY, never physical claims) ----
test('Q01 real adapter decodes TEST_ONLY bytes and explicit missing B-V', function () {
  var rows = [row(0, -90, -2, -0.5, 1), row(359.99, 90, 8, null, 7), row(120, 0, 1, 1.2, 5)];
  var source = fixture(rows), context = isolated(source), data = context.SkyStarData.load();
  assert(data && data.n === rows.length);
  assert.strictEqual(context.SkyStarData.load(), data, 'real adapter cache');
  rows.forEach(function (s, i) {
    near(data.ra[i], s.ra, SCALE.ra / 2 + 0.00002, 'RA degrees');
    near(data.dec[i], s.dec, SCALE.dec / 2 + 0.00001, 'Dec degrees');
    near(data.mag[i], s.mag, MAG_STEP / 2 + 0.000001, 'quantized V');
    assert.strictEqual(data.cls[i], s.cls);
  });
  verifyBV(source, data);
  assert.strictEqual(context.SkyStarData.recordAt(1).bv, null);
  return '3 decoded records; RA degrees, polar endpoints, byte 255';
});

test('Q02 B-V oracle rejects both infinities, including sentinel slots', function () {
  var source = fixture([row(0, 0, 1, 0.4, 3), row(1, 0, 1, null, 0)]);
  var data = isolated(source).SkyStarData.load();
  verifyBV(source, data);
  [Infinity, -Infinity].forEach(function (bad) {
    [0, 1].forEach(function (index) {
      var invalid = { n: data.n, bv: Array.from(data.bv) };
      invalid.bv[index] = bad;
      assert.throws(function () { verifyBV(source, invalid); }, assert.AssertionError);
    });
    assert.throws(function () { fixture([row(0, 0, 1, bad, 0)]); }, assert.AssertionError);
  });
  return 'negative control of test oracle; NOT an adapter malformed-metadata rejection claim';
});

var directionRows = [
  row(0, 0, 1, 0.4), row(359.98, 0, 1, 0.4), row(0.02, 0, 1, 0.4),
  row(0, 89.98, 1, null), row(359.98, 89.98, 1, null), row(180, 89.98, 1, null), row(90, 90, 1, null),
  row(0, -89.98, 1, null), row(359.98, -89.98, 1, null), row(180, -89.98, 1, null), row(90, -90, 1, null),
  row(90, 0, 1, 1.2), row(180, 0, 1, 1.2), row(270, 0, 1, 1.2)
];
[
  { label: 'actual RA=0 seam', ra: 0, dec: 0, lat: 35, required: [0, 1, 2] },
  { label: 'actual RA near 360 seam', ra: 359.98, dec: 0, lat: 35, required: [0, 1, 2] },
  { label: 'actual Dec near +90 north pole', ra: 0, dec: 89.98, lat: 35, required: [3, 4, 5, 6] },
  { label: 'actual Dec near -90 south pole', ra: 0, dec: -89.98, lat: -35, required: [7, 8, 9, 10] }
].forEach(function (c) {
  [30, 90, 178].forEach(function (fov) {
    test('Q03 no-grid reference: ' + c.label + ', FOV=' + fov, function () {
      var context = isolated(fixture(directionRows)), data = context.SkyStarData.load();
      var lon = longitudeAtRA(context, c.ra), opts = aim(context, c.ra, c.dec, c.lat, lon, fov);
      var view = compareReference(context, data, c.lat, lon, opts);
      c.required.forEach(function (index) { assert(ids(view).includes(index), 'required boundary direction ' + index); });
      return 'visible=' + view.field.length + ', yaw=' + opts.yaw.toFixed(3) + ', pitch=' + opts.pitch.toFixed(3);
    });
  });
});

test('Q04 actual encoded LOD at FOV=178 keeps V=6 and rejects next byte', function () {
  var context = isolated(fixture([row(0, 0, 1, null), row(0.02, 0, 6 - MAG_STEP, null),
    row(0.04, 0, 6, null), row(0.06, 0, 6 + MAG_STEP, null)]));
  var data = context.SkyStarData.load(), lat = 35, lon = longitudeAtRA(context, 0);
  var opts = aim(context, 0, 0, lat, lon, 178);
  var pr = context.SkyVM.projector(opts);
  for (var i = 0; i < data.n; i++) {
    var aa = context.Astro.altAz(data.ra[i] / 15, data.dec[i], JD, lat, lon);
    assert(pr.proj(aa.az, aa.alt), 'every candidate shares the visible direction');
  }
  assert.strictEqual(data.mag[2], 6);
  assert(data.mag[1] < 6 && data.mag[3] > 6);
  var wide = compareReference(context, data, lat, lon, opts);
  assert.deepStrictEqual(ids(wide), [0, 1, 2]);
  var narrow = build(context, lat, lon, aim(context, 0, 0, lat, lon, 30));
  assert.deepStrictEqual(ids(narrow), [0, 1, 2, 3]);
  return 'bright retained; same sky directions, not total counts in changing sky coverage';
});

[ { fov: 104, limit: 8 }, { fov: 30, limit: 10 } ].forEach(function (c) {
  test('Q05 TEST_ONLY load injection: real LOD threshold ' + c.limit + ', FOV=' + c.fov, function () {
    var magnitudes = [1, c.limit - 0.001, c.limit, c.limit + 0.001];
    var source = fixture(magnitudes.map(function (_, i) { return row(i * 0.02, 0, 1, null); }));
    var context = isolated(source), decoded = context.SkyStarData.load();
    var extended = Object.assign({}, decoded, { mag: new Float32Array(magnitudes) });
    var originalLoad = context.SkyStarData.load, originalBytes = source.data;
    /* The 8/10 boundaries cannot have both sides represented by the shipped
     * encoding. Replace only this VM's load, never decode/production exports. */
    context.SkyStarData.load = function () { return extended; };
    try {
      var lat = 35, lon = longitudeAtRA(context, 0), opts = aim(context, 0, 0, lat, lon, c.fov);
      var view = compareReference(context, extended, lat, lon, opts);
      assert.deepStrictEqual(ids(view), [0, 1, 2]);
      var model = context.SkyVM.model(JD, lat, lon), pr = context.SkyVM.projector(opts);
      for (var i = 0; i < extended.n; i++) {
        assert(model.l1.alt[i] > 8 && pr.proj(model.l1.az[i], model.l1.alt[i]), 'all four geometrically visible');
      }
      assert.strictEqual(extended.mag[2], c.limit, 'inclusive exact threshold');
      assert.strictEqual(source.data, originalBytes, 'encoded source untouched');
    } finally {
      context.SkyStarData.load = originalLoad;
      context.SkyVM.clear();
    }
    assert.strictEqual(context.SkyStarData.load(), decoded);
    return 'indices 0/1/2 retained, 3 rejected; +/-0.001 before rounded display magnitude';
  });
});

test('Q06 unsaturated radius squared follows flux; size/alpha/bucket endpoints', function () {
  var mags = [-2, 0, 1, 2, 3, 4, 8];
  var context = isolated(fixture(mags.map(function (mag, i) { return row(i * 0.03, 0, mag, 0.4, 3); })));
  var data = context.SkyStarData.load(), lat = 35, lon = longitudeAtRA(context, 0);
  var view = build(context, lat, lon, aim(context, 0, 0, lat, lon, 30)), k = view.view.k;
  assert.strictEqual(view.field.length, mags.length);
  [1, 2, 3].forEach(function (i) { assert(view.field[i].size > 0.6 * k && view.field[i].size < 4.9 * k); });
  [[1, 2], [2, 3], [1, 3]].forEach(function (pair) {
    var a = view.field[pair[0]], b = view.field[pair[1]];
    var fluxRatio = Math.pow(10, -0.4 * (data.mag[a.i] - data.mag[b.i]));
    near(Math.pow(a.size / b.size, 2), fluxRatio, 1e-10, 'unsaturated area/flux ratio');
    near(a.size / b.size, Math.sqrt(fluxRatio), 1e-10, 'radius/sqrt flux ratio');
  });
  near(view.field[0].alpha, 1, 1e-12, 'bright alpha ceiling above 8 degrees');
  near(view.field[6].alpha, 0.12, 1e-12, 'dim alpha floor above 8 degrees');
  near(view.field[6].size, 0.6 * k, 1e-12, 'dim size floor');
  assert.deepStrictEqual(Array.from(new Set(Array.from(view.field, function (s) { return s.bucket; }))).sort(), [0, 1, 2, 3, 4]);
  var rendered = draw(context, view);
  view.field.forEach(function (s, i) {
    assert(s.size >= 0.6 * k && s.size <= 4.9 * k && s.alpha >= 0.12 && s.alpha <= 1);
    assert(Number.isInteger(s.bucket) && s.bucket >= 0 && s.bucket <= 4);
    near(colorAt(rendered, s)[3], [1, 0.9, 0.68, 0.42, 0.2][s.bucket], 1e-12, 'rendered bucket alpha');
    if (i) {
      assert(s.size <= view.field[i - 1].size && s.alpha <= view.field[i - 1].alpha);
      assert(s.bucket >= view.field[i - 1].bucket);
    }
  });
  return '3 unsaturated pairs; all 5 rendered buckets; encoded upper radius bound, not unreachable saturation';
});

test('Q07 horizon cutoff and current post-clamp alpha semantics (may exceed 1)', function () {
  var altitudes = [0.29, 0.31, 7.99, 8.01, 0.31];
  var rows = altitudes.map(function (alt, i) { return row(i * 0.001, alt - 30, i === 4 ? 8 : 0, null); });
  var context = isolated(fixture(rows)), data = context.SkyStarData.load();
  var lat = 60, lon = longitudeAtRA(context, 0), opts = options(180, 4, 30);
  var view = compareReference(context, data, lat, lon, opts);
  assert.deepStrictEqual(ids(view), [1, 2, 3, 4]);
  var low = view.field[0], beforeEight = view.field[1], afterEight = view.field[2], dim = view.field[3];
  assert(low.alt >= 0.3 && low.alt < 0.33 && beforeEight.alt < 8 && afterEight.alt > 8);
  near(low.alpha, 0.6 + low.alt / 16, 1e-12, 'bright horizon attenuation');
  near(beforeEight.alpha, 0.6 + beforeEight.alt / 16, 1e-12, 'current below-eight multiplier');
  assert(beforeEight.alpha > 1 && beforeEight.alpha < 1.1, 'source clamps before, not after altitude multiplier');
  near(afterEight.alpha, 1, 1e-12, 'eight-degree branch');
  near(dim.alpha, 0.12 * (0.6 + dim.alt / 16), 1e-12, 'dim horizon floor');
  var rendered = draw(context, view);
  view.field.forEach(function (s) {
    assert(s.alpha >= 0.12 * (0.6 + 0.3 / 16) && s.alpha < 1.1);
    assert(Number.isInteger(s.bucket) && s.bucket >= 0 && s.bucket <= 4);
    assert(colorAt(rendered, s)[3] <= 1, 'rendered bucket opacity stays bounded');
  });
  assert.strictEqual(beforeEight.bucket, 0);
  assert.strictEqual(dim.bucket, 4);
  return '0.3-degree selection, 8-degree discontinuity; model alpha <1.1, rendered alpha <=1';
});

test('Q08 real Path2D colors: cool/warm order, spectral fallback, neutral midpoint', function () {
  var anchorBV = [-0.4, 0, 0.4, 1, 1.6, 2.3, 2.8];
  var rows = anchorBV.map(function (bv) { return row(0, 0, 1, bv, 7); });
  for (var cls = 1; cls <= 7; cls++) rows.push(row(0, 0, 1, null, cls));
  rows.push(row(0, 0, 1, 1.2, 1)); // finite midpoint, not spectral fallback
  [0, 8, 15].forEach(function (cls) { rows.push(row(0, 0, 1, null, cls)); });
  rows.push(row(0, 0, 1, -0.4, 1)); // finite B-V wins over conflicting class
  rows.forEach(function (s, i) { s.ra = i * 0.15; });
  var source = fixture(rows), context = isolated(source), data = context.SkyStarData.load();
  verifyBV(source, data);
  var lat = 35, lon = longitudeAtRA(context, 0);
  var view = build(context, lat, lon, aim(context, 0, 0, lat, lon, 30));
  assert.strictEqual(view.field.length, rows.length);
  var rendered = draw(context, view);
  var colors = Array.from(view.field, function (s) { return colorAt(rendered, s); });
  for (var i = 1; i < 7; i++) {
    assert(colors[i][0] > colors[i - 1][0], 'red increases cool to warm');
    assert(colors[i][2] < colors[i - 1][2], 'blue decreases cool to warm');
  }
  for (var j = 0; j < 7; j++) assert.deepStrictEqual(colors[j], colors[j + 7], 'OBAFGKM fallback ' + (j + 1));
  [15, 16, 17].forEach(function (index) { assert.deepStrictEqual(colors[index], colors[14], 'unknown class neutral midpoint'); });
  assert(colors[14][0] > colors[0][0] && colors[14][0] < colors[6][0]);
  assert(colors[14][2] < colors[0][2] && colors[14][2] > colors[6][2]);
  assert.deepStrictEqual(colors[0], colors[18], 'finite B-V takes priority over spectrum');
  return rows.length + ' individually matched real draw arcs; no copied color function';
});

test('Q09 production B-V and missing sourceId/full spectrum are not fabricated', function () {
  var context = isolated('production'), sd = context.SkyStarData, data = sd.load();
  assert(data && data.n === context.SKY_STARS_L1.count && data.n > 0);
  verifyBV(context.SKY_STARS_L1, data);
  var missingBV = 0;
  for (var i = 0; i < data.n; i++) {
    var rec = sd.recordAt(i);
    assert.strictEqual(sd.sourceIdAt(i), null);
    assert.strictEqual(rec.sourceId, null);
    assert.strictEqual(rec.hr, null);
    assert.strictEqual(rec.spectType, null, 'full spectrum exposed as spectType is absent');
    assert(!Object.prototype.hasOwnProperty.call(rec, 'fullSpectrum'), 'do not invent a fullSpectrum export');
    assert.strictEqual(rec.parallax, null);
    assert.strictEqual(rec.pmra, null);
    assert.strictEqual(rec.pmdec, null);
    if (Number.isNaN(data.bv[i])) { missingBV++; assert.strictEqual(rec.bv, null); }
    else assert(Number.isFinite(rec.bv));
  }
  assert(missingBV > 0 && missingBV < data.n);
  return 'production=' + data.n + ', missing B-V=' + missingBV + '; sourceId/spectType=null';
});

test('Q10 global.CATALOG real contents, keys, L0 model and hits identical with/without L1', function () {
  var withL1 = isolated('production'), withoutL1 = isolated(null);
  var catalog = withL1.global.CATALOG.stars;
  var before = JSON.stringify(catalog), beforeKeys = Array.from(catalog, function (s) { return s.k; });
  var refs = Array.from(catalog);
  assert(catalog.length > 100 && new Set(beforeKeys).size === catalog.length, 'actual catalog, never a fallback count');
  assert.deepStrictEqual(plain(catalog), plain(withoutL1.global.CATALOG.stars));
  var sirius = catalog.filter(function (s) { return s.k === 'sirius'; })[0];
  assert(sirius && sirius.en === 'Sirius' && sirius.cn === '天狼星');
  near(sirius.ra, 6.75248, 1e-12, 'real catalog RA hours');
  var lat = 0, lon = longitudeAtRA(withL1, sirius.ra * 15);
  var opts = aim(withL1, sirius.ra * 15, sirius.dec, lat, lon, 90);
  var a = build(withL1, lat, lon, opts), b = build(withoutL1, lat, lon, opts);
  var ma = withL1.SkyVM.model(JD, lat, lon), mb = withoutL1.SkyVM.model(JD, lat, lon);
  assert(ma.l1 && mb.l1 === null && a.field.length > 0 && b.field.length === 0);
  assert(a.stars.length > 0 && ma.stars.length > 0);
  assert.deepStrictEqual(plain(ma.stars), plain(mb.stars));
  assert.deepStrictEqual(plain(a.stars), plain(b.stars));
  assert.deepStrictEqual(plain(a.counts), plain(b.counts));
  var ra = draw(withL1, a), rb = draw(withoutL1, b);
  var l0Hits = Array.from(ra.canvas._hits).filter(function (hit) { return !hit.obj.data.k.startsWith('l1:'); });
  assert(l0Hits.length > 0);
  assert.deepStrictEqual(plain(l0Hits), plain(rb.canvas._hits));
  l0Hits.forEach(function (hit) { assert.strictEqual(hit.obj.data, catalog.find(function (s) { return s.k === hit.obj.data.k; })); });
  assert.strictEqual(JSON.stringify(withL1.global.CATALOG.stars), before);
  assert.strictEqual(JSON.stringify(withoutL1.global.CATALOG.stars), before);
  assert.strictEqual(withL1.global.CATALOG.stars.length, refs.length);
  assert.deepStrictEqual(Array.from(withL1.global.CATALOG.stars, function (s) { return s.k; }), beforeKeys);
  refs.forEach(function (s, i) { assert.strictEqual(withL1.global.CATALOG.stars[i], s); });
  return 'actual L0=' + catalog.length + ', visible=' + a.stars.length + ', unchanged L0 hits=' + l0Hits.length;
});

test('Q11 existing production named L1 hit key, legacy radius and detail fields', function () {
  var context = isolated('production'), sd = context.SkyStarData, data = sd.load();
  var index = -1;
  for (var i = 0; i < data.n; i++) {
    var named = sd.nameAt(i);
    if (named && named.name && data.mag[i] < 3 && Math.abs(data.dec[i]) < 60) { index = i; break; }
  }
  assert(index >= 0, 'real existing named bright star');
  var lat = 0, lon = longitudeAtRA(context, data.ra[index]);
  var opts = aim(context, data.ra[index], data.dec[index], lat, lon, 60);
  var view = build(context, lat, lon, opts), item = view.field.find(function (s) { return s.i === index; });
  assert(item && item.en && item.alt > 0);
  var rendered = draw(context, view);
  var hits = Array.from(rendered.canvas._hits).filter(function (hit) { return hit.obj.data.k === 'l1:' + index; });
  assert.strictEqual(hits.length, 1);
  var hit = hits[0], oldSize = context.SkyVM.starVisual(data.mag[index], item.alt, view.view.k).size;
  near(item.hitSize, oldSize, 1e-12, 'legacy starVisual hitSize');
  near(hit.r, Math.max(8 * view.view.k, oldSize + 4 * view.view.k), 1e-12, 'L1 old radius (not L0 9k/5k)');
  near(hit.x, item.x, 1e-12, 'hit x'); near(hit.y, item.y, 1e-12, 'hit y');
  assert.strictEqual(hit.obj.type, 'star');
  assert.deepStrictEqual(plain(hit.obj.data), {
    k: 'l1:' + index, cn: '', en: item.en, bayer: item.bayer, con: item.con,
    ra: data.ra[index] / 15, dec: data.dec[index], mag: Math.round(data.mag[index] * 100) / 100, source: 'L1/BSC5P'
  });
  var named = sd.nameAt(index), parts = named.alt.split(' ');
  assert.strictEqual(item.en, named.name);
  assert.strictEqual(item.con, parts.length >= 2 ? parts[parts.length - 1] : '');
  assert.strictEqual(item.bayer, parts.length >= 2 ? parts.slice(0, -1).join(' ') : named.alt);
  assert.strictEqual(sd.sourceIdAt(index), null);
  assert.strictEqual(sd.recordAt(index).spectType, null);
  assert(!('sourceId' in hit.obj.data) && !('fullSpectrum' in hit.obj.data));
  return 'real named index=' + index + ', ' + named.name;
});

test('Q12 unnamed bright star is drawn but never clickable; naming alone is insufficient', function () {
  var rows = [row(0, 0, 1, 0.4), row(0.2, 0, 1, 0.4), row(0.4, 0, 5, 0.4), row(0.6, 0, 5.1, 0.4)];
  rows[0].name = 'TEST_ONLY Named'; rows[0].altName = 'Alp Ori';
  rows[2].name = 'TEST_ONLY Near V5'; rows[3].name = 'TEST_ONLY Above V5';
  var context = isolated(fixture(rows)), data = context.SkyStarData.load();
  var lat = 35, lon = longitudeAtRA(context, 0);
  var view = build(context, lat, lon, aim(context, 0, 0, lat, lon, 30));
  assert.strictEqual(view.field.length, rows.length);
  var unnamed = view.field[1], rendered = draw(context, view);
  assert.strictEqual(context.SkyStarData.nameAt(1), null);
  assert(!unnamed.en && unnamed.mag <= 5 && unnamed.alt > 0 && unnamed.hitSize > 1.9 * view.view.k);
  colorAt(rendered, unnamed); // prove it was actually drawn, not merely absent
  var l1 = Array.from(rendered.canvas._hits).filter(function (hit) { return hit.obj.data.k.startsWith('l1:'); });
  assert.deepStrictEqual(l1.map(function (hit) { return hit.obj.data.k; }), ['l1:0']);
  assert.strictEqual(l1[0].obj.data.bayer, 'Alp');
  assert.strictEqual(l1[0].obj.data.con, 'Ori');
  assert(view.field[2].hitSize <= 1.9 * view.view.k, 'legacy radius condition also gates named V~5');
  near(view.field[0].hitSize, context.SkyVM.starVisual(data.mag[0], view.field[0].alt, view.view.k).size, 1e-12, 'encoded, unrounded hit size');
  return '4 real draw entries, 1 L1 hit; no artificial source identifiers';
});

test('Q13 isolated contexts do not alter host production globals', function () {
  assert.strictEqual(global.CATALOG, hostCatalog);
  assert.strictEqual(global.SkyStarData, hostStarData);
});

// ---- TEST_ONLY TDAT fixtures and real CLI subprocess checks ----
var cp = require('child_process');
var os = require('os');
var crypto = require('crypto');
var cliDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrum-TEST_ONLY-stars-'));
var cliSeq = 0;
var LICENSE_URL = 'https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw';
var fields = ['name', 'alt_name', 'hr', 'ra', 'dec', 'vmag', 'bv_color', 'spect_type'];
function tdat(rows) {
  return '<HEADER>\n# TEST_ONLY synthetic CLI fixture; never a production observation\n' +
    fields.map(function (name) { return 'field[' + name + '] = char'; }).join('\n') +
    '\n<DATA>\n' + rows.join('\n') + '\n<END>\n';
}
function cliRow(overrides) {
  var record = Object.assign({ name: 'TEST_ONLY HR 1', alt_name: 'Alp Ori', hr: 1, ra: 12.3,
    dec: -45.6, vmag: 2, bv_color: 0.4, spect_type: 'A1V' }, overrides);
  return fields.map(function (name) { return record[name]; }).join('|');
}
function cli(text, options) {
  options = options || {};
  var input = path.join(cliDir, 'TEST_ONLY-' + (++cliSeq) + (options.gzip ? '.tdat.gz' : '.tdat'));
  var output = options.output || path.join(cliDir, 'TEST_ONLY-output-' + cliSeq + '.js');
  var bytes = Buffer.from(text, 'latin1');
  if (options.gzip) bytes = require('zlib').gzipSync(bytes);
  fs.writeFileSync(input, bytes);
  var args = [path.join(ROOT, 'tools/build-star-data.js'), '--input', input, '--output', output];
  if (options.check) args.push('--check');
  if (options.noRecords) args.push('--no-records');
  if (options.license !== false) args.push('--license-evidence', options.license || LICENSE_URL);
  var before = fs.readdirSync(cliDir).sort();
  var result = cp.spawnSync(process.execPath, args, { cwd: cliDir, encoding: 'utf8', timeout: 15000 });
  assert.ifError(result.error);
  assert.strictEqual(result.signal, null, 'CLI must exit normally');
  return { input: input, output: output, status: result.status, stdout: result.stdout, stderr: result.stderr,
    bytes: bytes, before: before, after: fs.readdirSync(cliDir).sort() };
}
function jsonLine(text, prefix) {
  var line = text.split(/\r?\n/).find(function (s) { return s.startsWith(prefix + ' '); });
  assert(line, 'missing diagnostic ' + prefix);
  return JSON.parse(line.slice(prefix.length + 1));
}
function diagnostic(result) {
  var value = jsonLine(result.stdout, 'INPUT_DIAGNOSTICS');
  assert.strictEqual(value.dataRows, value.accepted + value.rejected + value.excluded);
  assert.strictEqual(value.totalLines, value.dataRows + value.nonDataRows);
  return value;
}
function rejectedCase(text, field, reason) {
  var r = cli(text);
  assert.strictEqual(r.status, 7, r.stderr);
  assert(!fs.existsSync(r.output), 'failure must not write output');
  assert.deepStrictEqual(r.after, r.before, 'no sidecar output on rejection');
  var d = diagnostic(r), rows = jsonLine(r.stderr, 'REJECTED_ROWS');
  assert.strictEqual(d.rejected, rows.length);
  assert(rows.some(function (row) { return row.reasons.some(function (x) { return x.field === field && x.reason === reason; }); }));
  return { run: r, diagnostics: d, rows: rows };
}

try {
  test('C01 short, missing and extra columns are rejected with line/HR diagnostics', function () {
    var cases = ['TEST_ONLY|Alp Ori|7', cliRow().split('|').slice(0, -1).join('|'), cliRow() + '|extra'];
    cases.forEach(function (line, i) {
      var out = rejectedCase(tdat([line]), '*', 'field_count');
      assert.strictEqual(out.diagnostics.dataRows, 1);
      assert.strictEqual(out.diagnostics.rejected, 1);
      assert.strictEqual(out.rows[0].line, 12);
      assert.strictEqual(out.rows[0].hr, i === 0 ? 7 : 1);
    });
    var fakeHeader = rejectedCase(tdat(['field[ra] = corrupt']), '*', 'field_count');
    assert(fakeHeader.rows[0].reasons.length > 1, 'header-like text in DATA must not disappear');
  });

  test('C02 blank, illegal and non-finite numeric tokens stay distinct', function () {
    ['hr', 'ra', 'dec', 'vmag', 'bv_color'].forEach(function (field) {
      [['oops', 'invalid'], ['Infinity', 'non_finite'], ['-Infinity', 'non_finite'],
        ['NaN', 'non_finite'], ['1e999', 'non_finite'], ['0x10', 'invalid']].forEach(function (pair) {
        var o = {}; o[field] = pair[0];
        var out = rejectedCase(tdat([cliRow(o)]), field, pair[1]);
        assert.strictEqual(out.diagnostics.rejected, 1);
        assert.strictEqual(out.diagnostics.legalMissing.bv_color, 0);
      });
      if (field !== 'bv_color') {
        var missing = {}; missing[field] = '  ';
        rejectedCase(tdat([cliRow(missing)]), field, 'missing');
      }
    });
    var multiple = rejectedCase(tdat([cliRow({ ra: '', dec: 'bad', vmag: 'Infinity', bv_color: 'bad' })]), 'ra', 'missing');
    assert.strictEqual(multiple.rows.length, 1, 'one rejection for multiple field errors');
    assert.strictEqual(multiple.rows[0].reasons.length, 4);
    assert.deepStrictEqual(multiple.diagnostics.reasonCounts, { missing: 1, invalid: 2, non_finite: 1 });
  });

  test('C03 range and positive integer HR boundaries are hard failures', function () {
    [['ra', -0.001], ['ra', 360], ['dec', -90.001], ['dec', 90.001], ['vmag', -2.001],
      ['vmag', 8.001], ['bv_color', -0.501], ['bv_color', -0.5 + 254 * BV_STEP + 0.001]].forEach(function (pair) {
      var o = {}; o[pair[0]] = pair[1];
      rejectedCase(tdat([cliRow(o)]), pair[0], 'out_of_range');
    });
    [0, -1, 1.5, '9007199254740992'].forEach(function (hr) {
      rejectedCase(tdat([cliRow({ hr: hr })]), 'hr', 'invalid_integer');
    });
  });

  test('C04 duplicate HR includes earlier rejected records and preserves accounting', function () {
    var out = rejectedCase(tdat([cliRow(), cliRow({ ra: 20 })]), 'hr', 'duplicate');
    assert.strictEqual(out.diagnostics.accepted, 1);
    assert.strictEqual(out.rows[0].line, 13);
    var invalidFirst = rejectedCase(tdat([cliRow({ ra: 'bad' }), cliRow()]), 'hr', 'duplicate');
    assert.strictEqual(invalidFirst.diagnostics.accepted, 0);
    assert.strictEqual(invalidFirst.diagnostics.rejected, 2);
  });

  test('C05 DATA controls, comments and malformed structure cannot silently pass', function () {
    var valid = tdat(['# TEST_ONLY in-data comment', '', cliRow() + '|']).replace(/\n/g, '\r\n');
    var r = cli(valid, { check: true });
    assert.strictEqual(r.status, 0, r.stderr);
    assert.strictEqual(diagnostic(r).dataRows, 1);
    assert.deepStrictEqual(r.after, r.before);
    [tdat([]), tdat([cliRow()]).replace('<DATA>', ''), tdat([cliRow()]).replace('<END>', ''),
      tdat([cliRow()]).replace('<DATA>', '<DATA>\n<DATA>'), tdat([cliRow()]) + 'unexpected-data'].forEach(function (text) {
      var bad = cli(text, { check: true });
      assert.strictEqual(bad.status, 7);
      assert(diagnostic(bad).structureErrors.length > 0);
      assert(!fs.existsSync(bad.output));
      assert.deepStrictEqual(bad.after, bad.before);
    });
  });

  test('C06 valid endpoint encoding, names, full spectrum and missing B-V sentinel', function () {
    var text = tdat([
      cliRow({ ra: 0, dec: -90, vmag: -2, bv_color: -0.5 }),
      cliRow({ hr: 2, ra: 359.999, dec: 90, vmag: 8, bv_color: -0.5 + 254 * BV_STEP }),
      cliRow({ hr: 3, vmag: 5, bv_color: ' ', spect_type: '', alt_name: '  Bet   Ori ' }),
      cliRow({ hr: 4, name: '', alt_name: '', ra: '1.23e1', vmag: 1 })
    ]);
    var result = cli(text);
    assert.strictEqual(result.status, 0, result.stderr);
    var d = diagnostic(result);
    assert.strictEqual(d.accepted, 4);
    assert.strictEqual(d.rejected, 0);
    assert.deepStrictEqual(d.legalMissing, { bv_color: 1, spect_type: 1 });
    var context = nodeVM.createContext({});
    nodeVM.runInContext(fs.readFileSync(result.output, 'utf8'), context);
    var src = context.SKY_STARS_L1, bytes = Buffer.from(src.data, 'base64');
    assert.strictEqual(bytes.length, 28);
    assert.deepStrictEqual(Array.from(bytes.slice(0, 7)), [0, 0, 0, 0, 0, 0, 3]);
    assert.deepStrictEqual(Array.from(bytes.slice(7, 14)), [255, 255, 255, 255, 255, 254, 3]);
    assert.strictEqual(bytes[19], 255);
    assert.deepStrictEqual(plain(src.names), [[0, 'Alp Ori', 'TEST_ONLY HR 1'], [2, 'Bet Ori', 'TEST_ONLY HR 1']]);
    assert.deepStrictEqual(Array.from(src.records, function (s) { return s.sourceId; }), ['HR 1', 'HR 2', 'HR 3', 'HR 4']);
    assert.strictEqual(src.records[0].spectType, 'A1V');
    assert.strictEqual(src.records[2].bv, null);
    assert.strictEqual(src.inputSha256, crypto.createHash('sha256').update(result.bytes).digest('hex'));
    var decoded = isolated(src).SkyStarData;
    verifyBV(src, decoded.load());
    assert.strictEqual(decoded.sourceIdAt(2), 'HR 3');
    assert.strictEqual(decoded.recordAt(0).spectType, 'A1V');
  });

  test('C07 gzip and plain inputs produce identical payload/order/names, distinct byte hashes', function () {
    var text = tdat([cliRow(), cliRow({ hr: 2, bv_color: '', spect_type: 'G2V' })]);
    var a = cli(text), b = cli(text, { gzip: true });
    assert.strictEqual(a.status, 0); assert.strictEqual(b.status, 0);
    var ca = nodeVM.createContext({}), cb = nodeVM.createContext({});
    nodeVM.runInContext(fs.readFileSync(a.output, 'utf8'), ca);
    nodeVM.runInContext(fs.readFileSync(b.output, 'utf8'), cb);
    assert.strictEqual(ca.SKY_STARS_L1.data, cb.SKY_STARS_L1.data);
    assert.deepStrictEqual(plain(ca.SKY_STARS_L1.records), plain(cb.SKY_STARS_L1.records));
    assert.deepStrictEqual(plain(ca.SKY_STARS_L1.names), plain(cb.SKY_STARS_L1.names));
    assert.notStrictEqual(ca.SKY_STARS_L1.inputSha256, cb.SKY_STARS_L1.inputSha256);
    assert.strictEqual(cb.SKY_STARS_L1.inputSha256, crypto.createHash('sha256').update(b.bytes).digest('hex'));
    var bad = cli(tdat([cliRow({ bv_color: 'Infinity' })]), { gzip: true });
    assert.strictEqual(bad.status, 7); assert(!fs.existsSync(bad.output));
  });

  test('C08 --check writes no files and does not require a license declaration', function () {
    [false, true].forEach(function (gzip) {
      var r = cli(tdat([cliRow()]), { check: true, license: false, gzip: gzip });
      assert.strictEqual(r.status, 0, r.stderr);
      assert(r.stdout.includes('CHECK OK'));
      assert.deepStrictEqual(r.after, r.before);
      assert(!fs.existsSync(r.output));
    });
    var output = path.join(cliDir, 'TEST_ONLY-existing.js');
    fs.writeFileSync(output, 'TEST_ONLY DO NOT OVERWRITE');
    var r = cli(tdat([cliRow()]), { check: true, output: output, license: false });
    assert.strictEqual(r.status, 0);
    assert.strictEqual(fs.readFileSync(output, 'utf8'), 'TEST_ONLY DO NOT OVERWRITE');
    assert.deepStrictEqual(r.after, r.before);
  });

  test('C09 missing input/header, declaration gate and overwrite retain exit codes', function () {
    var missing = cp.spawnSync(process.execPath, [path.join(ROOT, 'tools/build-star-data.js'), '--input', path.join(cliDir, 'ABSENT-TEST_ONLY')], { encoding: 'utf8', timeout: 15000 });
    assert.strictEqual(missing.status, 2);
    var header = cli(tdat([cliRow()]).replace('field[hr] = char\n', ''));
    assert.strictEqual(header.status, 3); assert(!fs.existsSync(header.output));
    [false, 'https://example.invalid/TEST_ONLY'].forEach(function (license) {
      var result = cli(tdat([cliRow()]), { license: license });
      assert.strictEqual(result.status, 5); assert(!fs.existsSync(result.output));
    });
    var output = path.join(cliDir, 'TEST_ONLY-existing.js');
    var before = fs.readFileSync(output);
    var existing = cli(tdat([cliRow()]), { output: output });
    assert.strictEqual(existing.status, 6);
    assert.deepStrictEqual(fs.readFileSync(output), before);
    assert.deepStrictEqual(existing.after, existing.before);
  });

  test('C10 non-stellar HR excluded only when V magnitude is missing', function () {
    var missing = cli(tdat([cliRow({ hr: 92, vmag: ' ', name: 'NGC 9999' })]), { check: true, license: false });
    assert.strictEqual(missing.status, 0, missing.stderr);
    var d = diagnostic(missing);
    assert.strictEqual(d.accepted, 0);
    assert.strictEqual(d.rejected, 0);
    assert.strictEqual(d.excluded, 1);
    var ex = jsonLine(missing.stdout, 'EXCLUDED_ROWS');
    assert.deepStrictEqual(ex, [{ line: 12, hr: 92, name: 'NGC 9999', altName: 'Alp Ori', reason: 'nonstellar_no_vmag' }]);
    assert.deepStrictEqual(missing.after, missing.before);

    [cliRow({ hr: 92 }), cliRow({ hr: 92, vmag: 'Infinity' }), cliRow({ hr: 92, ra: 'bad' })].forEach(function (line) {
      var r = cli(tdat([line]));
      assert.strictEqual(r.status, 7, 'non-stellar list must not hide other anomalies');
      var rows = jsonLine(r.stderr, 'REJECTED_ROWS');
      assert.strictEqual(rows.length, 1);
      assert(!r.stdout.includes('EXCLUDED_ROWS'));
      if (line.indexOf('Infinity') === -1 && line.indexOf('bad') === -1) {
        assert(rows[0].reasons.some(function (x) { return x.reason === 'listed_nonstellar_has_magnitude'; }));
      }
    });
    var unlisted = cli(tdat([cliRow({ hr: 93, vmag: ' ' })]));
    assert.strictEqual(unlisted.status, 7);
    assert.strictEqual(diagnostic(unlisted).excluded, 0);
  });

  test('C11 --no-records keeps payload/names identical and drops only the records field', function () {
    var text = tdat([cliRow(), cliRow({ hr: 2, bv_color: '', spect_type: 'G2V' })]);
    var full = cli(text), slim = cli(text, { noRecords: true });
    assert.strictEqual(full.status, 0); assert.strictEqual(slim.status, 0, slim.stderr);
    var cf = nodeVM.createContext({}), cs = nodeVM.createContext({});
    nodeVM.runInContext(fs.readFileSync(full.output, 'utf8'), cf);
    nodeVM.runInContext(fs.readFileSync(slim.output, 'utf8'), cs);
    assert(Array.isArray(cf.SKY_STARS_L1.records));
    assert(!('records' in cs.SKY_STARS_L1), 'records must be omitted');
    assert.strictEqual(cf.SKY_STARS_L1.data, cs.SKY_STARS_L1.data);
    assert.deepStrictEqual(plain(cf.SKY_STARS_L1.names), plain(cs.SKY_STARS_L1.names));
    assert.strictEqual(cs.SKY_STARS_L1.count, cf.SKY_STARS_L1.count);
    assert.strictEqual(cs.SKY_STARS_L1.count, 2);
    assert.strictEqual(cs.SKY_STARS_L1.inputSha256, cf.SKY_STARS_L1.inputSha256);
    assert(fs.statSync(slim.output).size < fs.statSync(full.output).size);
    var slimCtx = isolated(cs.SKY_STARS_L1);
    var decoded = slimCtx.SkyStarData.load();
    assert(decoded, 'decode failed: ' + JSON.stringify(slimCtx.SkyStarData.stats()));
    assert.strictEqual(decoded.n, 2);
    assert.strictEqual(slimCtx.SkyStarData.sourceIdAt(1), null, 'no fabricated sourceId without records');
  });
} finally {
  fs.rmSync(cliDir, { recursive: true, force: true });
}

console.log('\nRESULT ' + pass + '/' + (pass + fail) + ' | PASS=' + pass + ' FAIL=' + fail);
if (fail) process.exitCode = 1;
