/* ASTRUM · 跨版本遗留任务验收测试（V1.6 前置）
 *
 * 覆盖：T-B/T-D 结果复用、evidence.search 独立性、统一入口边界、
 * FITS 标准误语义、全文 chunk 级结论粒度。
 *
 * 用法：node tools/v1-6-legacy-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

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
  'core/router.js', 'core/evaluator.js', 'core/planner.js',
  'core/reducer.js', 'core/report.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Control = global.AstroControl;
var Bridge = global.AstroControlBridge;
var Planner = global.AstroPlanner;
var E = global.AstroEvidence;
var C = global.AstroClaims;
var R = global.AstroReducer;
var Report = global.AstroReport;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 220)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

var CTX = { y: 2026, mo: 11, d: 2, h: 21, mi: 0, tz: 8, city: '北京', lat: 39.9, lon: 116.4, bortle: 5 };
var CFG = AC.defaultConfig();

(async function main() {
  await runCase('L03', 'T-B/T-D 模板级结果复用', async function () {
    var tbTargets = AC.resolveTargets('M42');
    var tbRoute = {
      intent: 'tonight', targets: tbTargets,
      route: { level: 'L2', mode: 'control', targets: ['猎户座大星云'], legacy: false, reason: 'legacy-test' }
    };
    var b = await Control.run('今晚有什么推荐，M42 能看到吗', CTX, CFG, {
      network: false, maxReplans: 0, routeData: tbRoute
    });
    ok('L03.1 T-B 交付复用 t1 结果', !!b.delivery && b.delivery.usedStepIds.indexOf('t1') >= 0 &&
      b.delivery.fallback !== true, JSON.stringify(b.delivery && { used: b.delivery.usedStepIds, fallback: b.delivery.fallback }));
    var d = await Control.run('比较 M42 和 M31', CTX, CFG, { network: false, forceCompare: true, maxReplans: 0 });
    var used = (d.delivery && d.delivery.usedStepIds) || [];
    ok('L03.2 T-D 交付复用取数结果', used.length >= 2 && d.delivery.fallback !== true,
      JSON.stringify({ used: used, fallback: d.delivery && d.delivery.fallback }));
    ok('L03.3 T-D 两项目标不混淆', d.answer && d.answer.compare && d.answer.compare.length >= 2,
      d.answer && d.answer.compare ? d.answer.compare.length : 'none');
  });

  await runCase('L12', 'evidence.search 独立于 paper.search', async function () {
    var plan = Planner.plan({
      query: '研究 M42 的最新论文', ctx: CTX, cfg: CFG,
      intent: 'research', targets: AC.resolveTargets('M42'),
      route: { mode: 'research', level: 'L4', targets: ['猎户座大星云'] }
    });
    var t3 = (plan.steps || []).filter(function (s) { return s.tool === 'evidence.search'; })[0];
    ok('L12.1 evidence.search 不依赖 paper.search', !!t3 && Array.isArray(t3.deps) && t3.deps.length === 0,
      t3 ? JSON.stringify(t3.deps) : 'none');
    var spec = global.AstroRegistry.SPECS.filter(function (s) { return s.id === 'evidence.search'; })[0];
    ok('L12.2 工具注册依赖不含 paper', !!spec && spec.deps.indexOf('paper') < 0, spec ? spec.deps.join(',') : 'none');
  });

  await runCase('L16', '统一入口边界', async function () {
    var local = { control: true, route: { mode: 'research' } };
    ok('L16.1 无附件可接管', Bridge.canControl(local, { sourceType: 'local', attachments: [] }) === true);
    ok('L16.2 文本附件不入 Control（保留旧链路）',
      Bridge.canControl(local, { sourceType: 'local', attachments: [{ kind: 'text', text: 'x' }] }) === false);
    ok('L16.3 图片附件不入 Control（保留旧链路）',
      Bridge.canControl(local, { sourceType: 'local', attachments: [{ kind: 'image' }] }) === false);
    ok('L16.4 未解析 PDF 不入 Control',
      Bridge.canControl(local, { sourceType: 'local', attachments: [{ kind: 'paper', paper: { ok: false } }] }) === false);
    ok('L16.5 L1 永不接管', Bridge.canControl({ control: false }, { sourceType: 'local', attachments: [] }) === false);
  });

  await runCase('L20', 'FITS 标准误语义', async function () {
    var ev = E.fromFits({
      ok: true, fileHash: 'legacy-sem', fileName: 'sem.fits', fileSize: 100, parsedAt: new Date().toISOString(),
      hdus: [{ index: 0, type: 'primary', header: { NAXIS: 2, NAXIS1: 10, NAXIS2: 10, BITPIX: 16, OBJECT: 'M42' },
        stats: { count: 100, mean: 10, std: 2, min: 1, max: 20 } }]
    }, { fileName: 'sem.fits', size: 100 });
    var claims = C.buildClaimsFromEvidence([ev], {});
    var fitted = claims.filter(function (c) { return c.id.indexOf('c_fits_') === 0; })[0];
    ok('L20.1 FITS 定量 Claim 存在', !!fitted);
    ok('L20.2 uncertainty = std/sqrt(n)', !!fitted && Math.abs(fitted.uncertainty.value - 0.2) < 1e-9,
      fitted && fitted.uncertainty.value);
    ok('L20.3 明确标注标准误而非原始离散度', !!fitted && /标准误|SEM/.test(fitted.uncertainty.basis),
      fitted && fitted.uncertainty.basis);
  });

  await runCase('L17', '实时步骤事件与多任务恢复数据', async function () {
    var info = Bridge.classify('研究 M42 的距离测量与论文', CTX, CFG);
    var events = [];
    var r = await Bridge.runWithRoute(info, '研究 M42 的距离测量与论文', CTX, CFG, {
      network: false, maxReplans: 0,
      onEvent: function (e) { events.push(e); }
    });
    var types = events.map(function (e) { return e.type; });
    ok('L17.1 收到真实 step.started', types.indexOf('step.started') >= 0, types.join(','));
    ok('L17.2 收到真实 step.ok', types.indexOf('step.ok') >= 0, types.slice(-6).join(','));
    ok('L17.3 事件带 stepId', events.some(function (e) { return !!e.stepId; }),
      events.filter(function (e) { return e.stepId; }).length + ' with stepId');
    ok('L17.4 结果保留 TaskState.steps', !!(r.control && r.control.state && r.control.state.steps.length),
      r.control && r.control.state ? r.control.state.steps.length : 'none');

    var store = global.AstroTaskStore.create({});
    await store.init();
    var seeded = [];
    for (var i = 0; i < 2; i++) {
      var st = T.create({ question: '多任务恢复 ' + i, level: 'L2' });
      st.phase = 'EXECUTE';
      var s1 = T.makeStep({ id: 's1', tool: 'kb.lookup', args: {}, deps: [], parallel: false, critical: false, optional: false });
      s1.status = 'ok';
      s1.outputHash = 'test';
      st.steps = [s1, T.makeStep({ id: 's2', tool: 'compose.simple', args: {}, deps: [], parallel: false, critical: false, optional: false })];
      T.validate(st);
      await store.save(st);
      seeded.push(st);
    }
    var list = await store.list({ limit: 10 });
    var hits = list.filter(function (x) { return x.resumable; });
    ok('L18.1 多任务均可列出', hits.length >= 2, 'n=' + hits.length);
    var states = await Promise.all(hits.slice(0, 2).map(function (h) { return store.get(h.id); }));
    ok('L18.2 每个任务独立读取', states.length === 2 && states.every(function (s) { return s && s.steps; }));
    ok('L18.3 已完成步骤不重复', states.every(function (s) {
      return s.steps.filter(function (x) { return x.status === 'ok'; }).length === 1;
    }),
    states.map(function (s) { return s.steps.map(function (x) { return x.status; }).join('/'); }).join(' | '));
  });

  await runCase('L29', '全文 chunk 级结论粒度', async function () {
    var e1 = E.make({
      evidenceId: 'ev_chunk_1', sourceId: 'src_doi_10.1000/x', sourceType: 'paper',
      title: 'Paper · RESULTS', uri: 'https://arxiv.org/pdf/2401.00001', contentLevel: 'fulltext', abstractOnly: false,
      content: { contentLevel: 'fulltext', excerpt: 'The measured distance is 1344 ly.', chunkId: 'ft_1', section: 'RESULTS', pageStart: 3, pageEnd: 3 },
      trust: { level: 'high', score: 0.9, basis: 'test' }, provenance: {}
    });
    var claim = C.makeClaim({
      id: 'c_chunk', text: 'M42 距离 1344 ly', type: 'qualitative', entities: ['M42'],
      numbers: [], premises: [], support: [{ eid: 'ev_chunk_1', strength: 'strong', basis: 'semantic' }],
      contradict: [], uncertainty: null, source: 'web', calc: null, required: true
    });
    var judged = C.judgeAll([claim], { evidence: [e1] });
    var reduced = R.reduce({ evidence: [e1], claims: judged.claims, verdicts: judged.verdicts });
    var report = Report.build({ question: 'M42', evidence: [e1], claims: judged.claims, verdicts: judged.verdicts, reducer: reduced });
    var c = report.conclusions.filter(function (x) { return x.claimId === 'c_chunk'; })[0];
    ok('L29.1 结论保留 chunk 粒度', !!c && c.supportGranularity === 'fulltext_chunk', c && c.supportGranularity);
    ok('L29.2 结论关联 chunk/section/page', !!c && c.sourceChunks.length === 1 &&
      c.sourceChunks[0].chunkId === 'ft_1' && c.sourceChunks[0].section === 'RESULTS' &&
      c.sourceChunks[0].pageStart === 3, c && JSON.stringify(c.sourceChunks));
    ok('L29.3 原有 evidenceScope 兼容', !!c && c.evidenceScope === 'fulltext', c && c.evidenceScope);
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' +
      cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-6-legacy] ' + (e && e.stack || e));
  process.exit(1);
});
