/* ASTRUM · V1.5 性能基线（Node 本地、零依赖）
 *
 * 记录：模块冷加载、Router/Planner、Control 本地任务、PDF 解析、
 *       Evidence/Report、TaskStore 持久化的真实耗时。
 * 不设定虚构指标；只输出平均值/中位数/P95/最小/最大，供前后对比。
 *
 * 用法：node tools/v1-5-perf-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var t0 = process.hrtime.bigint();

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js',
  'core/control-bridge.js', 'core/attachment-evidence.js',
  'core/pdf-text.js', 'core/paper-fulltext.js', 'core/paper-attachment.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Router = global.AstroRouter;
var Planner = global.AstroPlanner;
var Control = global.AstroControl;
var Ev = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;
var Store = global.AstroTaskStore;
var PA = global.AstroPaperAttachment;

var coldLoadMs = Number(process.hrtime.bigint() - t0) / 1e6;
var CTX = {
  y: 2026, mo: 11, d: 1, h: 21, mi: 0, tz: 8,
  city: '北京', lat: 39.9, lon: 116.4, bortle: 5,
  equipment: '单反', experience: '进阶'
};
var CFG = AC.defaultConfig();

function ms(fn) {
  var a = process.hrtime.bigint();
  var r = fn();
  var b = process.hrtime.bigint();
  return { ms: Number(b - a) / 1e6, value: r };
}
async function msAsync(fn) {
  var a = process.hrtime.bigint();
  var r = await fn();
  var b = process.hrtime.bigint();
  return { ms: Number(b - a) / 1e6, value: r };
}
function stats(nums) {
  var a = nums.slice().sort(function (x, y) { return x - y; });
  var n = a.length;
  var sum = a.reduce(function (s, x) { return s + x; }, 0);
  return {
    n: n,
    avg: +(sum / n).toFixed(2),
    median: +a[Math.floor((n - 1) / 2)].toFixed(2),
    p95: +a[Math.min(n - 1, Math.floor((n - 1) * 0.95))].toFixed(2),
    min: +a[0].toFixed(2),
    max: +a[n - 1].toFixed(2)
  };
}

function syntheticPdf() {
  var text = 'BT\n/F1 12 Tf\n72 720 Td\n(ASTRUM PERF PAPER) Tj\n0 -22 Td\n(ABSTRACT) Tj\n0 -22 Td\n(Local measurement.) Tj\n0 -22 Td\n(RESULTS) Tj\n0 -22 Td\n(Value 250 km/s.) Tj\nET\n';
  var objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(text, 'latin1') + ' >>\nstream\n' + text + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  var out = '%PDF-1.4\n', offsets = [];
  objs.forEach(function (body, i) {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  var xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach(function (off) { out += String(off).padStart(10, '0') + ' 00000 n \n'; });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

(async function main() {
  var out = {};
  out.coldLoadMs = +coldLoadMs.toFixed(2);

  var qs = [
    '猎户座大星云是什么？',
    '比较 M42 和 M31 的区别',
    '研究 M42 的距离测量与近五年论文',
    'M42 怎么拍 为什么需要长曝光？'
  ];
  var router = [];
  for (var k = 0; k < 60; k++) {
    var q = qs[k % qs.length];
    var rr = ms(function () {
      var targets = AC.resolveTargets(q);
      var intent = AC.detectIntent(q, targets);
      return Router.route({ query: q, intent: intent, targets: targets, ctx: CTX, cfg: CFG });
    });
    router.push(rr.ms);
  }
  out.router = stats(router);

  var planner = [];
  for (var p = 0; p < 40; p++) {
    var qp = qs[p % qs.length];
    var pr = ms(function () {
      var targets = AC.resolveTargets(qp);
      var intent = AC.detectIntent(qp, targets);
      var route = Router.route({ query: qp, intent: intent, targets: targets, ctx: CTX, cfg: CFG });
      return Planner.plan({
        query: qp, ctx: CTX, cfg: CFG, intent: intent, targets: targets,
        route: route, registry: global.AstroRegistry.createDefault({ agentCore: AC, network: false }),
        budget: T.makeBudget(route.level)
      });
    });
    planner.push(pr.ms);
  }
  out.planner = stats(planner);

  var control = [];
  for (var c = 0; c < 5; c++) {
    var cr = await msAsync(function () {
      return Control.run('M42 怎么拍 为什么需要长曝光？', CTX, CFG, {
        network: false, store: Store.create({ memory: true }), maxReplans: 0
      });
    });
    control.push(cr.ms);
  }
  out.controlLocal = stats(control);

  var pdfBytes = syntheticPdf();
  var pdf = [];
  for (var d = 0; d < 20; d++) {
    var pd = await msAsync(function () { return PA.parseBytes(pdfBytes, { fileName: 'perf.pdf', maxEvidenceChunks: 4 }); });
    pdf.push(pd.ms);
  }
  out.pdfParse = stats(pdf);

  var evMs = [];
  for (var e = 0; e < 20; e++) {
    var evr = ms(function () {
      var items = [];
      for (var i = 0; i < 100; i++) {
        items.push(Ev.fromSourceItem({
          title: 'Paper ' + i, excerpt: 'Abstract ' + i, url: 'https://example.org/p/' + i,
          host: 'example.org', sourceType: 'paper', doi: '10.1000/' + i
        }, { tool: 'paper.search', query: 'perf', retrievedAt: '2026-11-01T00:00:00Z' }));
      }
      var dd = Ev.dedupe(items);
      var cl = Claims.buildClaimsFromEvidence(dd.evidence, {});
      var red = Reducer.reduce({ evidence: dd.evidence, claims: cl });
      return Report.build({ question: 'perf', evidence: dd.evidence, claims: cl, reduced: red, retrievedAt: '2026-11-01T00:00:00Z' });
    });
    evMs.push(evr.ms);
  }
  out.evidence100Report = stats(evMs);

  var store = Store.create({ memory: true });
  var storeMs = (await msAsync(async function () {
    for (var s = 0; s < 200; s++) {
      var st = T.create({ question: 'perf-' + s, level: 'L3' });
      st.phase = 'EXECUTE';
      await store.save(st);
    }
    await store.list();
    await store.clear();
  })).ms;
  out.taskStore200 = +storeMs.toFixed(2);

  var heap = process.memoryUsage();
  out.heapUsedMB = +(heap.heapUsed / 1024 / 1024).toFixed(2);
  out.rssMB = +(heap.rss / 1024 / 1024).toFixed(2);

  console.log('=== V1.5 性能基线（Node 本地）===');
  console.log('cold load: ' + out.coldLoadMs + ' ms');
  ['router', 'planner', 'controlLocal', 'pdfParse', 'evidence100Report'].forEach(function (k) {
    var s = out[k];
    console.log(k + ': avg=' + s.avg + 'ms median=' + s.median + 'ms p95=' + s.p95 +
      'ms min=' + s.min + 'ms max=' + s.max + 'ms n=' + s.n);
  });
  console.log('taskStore200: ' + out.taskStore200 + ' ms');
  console.log('heapUsed=' + out.heapUsedMB + ' MB rss=' + out.rssMB + ' MB');
  console.log('PERF_JSON=' + JSON.stringify(out));
  process.exit(0);
})().catch(function (e) {
  console.error('[v1-5-perf] ' + (e && e.stack || e));
  process.exit(1);
});
