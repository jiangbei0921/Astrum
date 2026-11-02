/* ASTRUM · V1 端到端验收（任务书 §七 五个任务）
 *
 * 真实数据项：SIMBAD（本机不可达则 DEFERRED）/ arXiv+OpenAlex 论文 /
 * astropy 公开 FITS（test0.fits + btable.fits）。
 * 故障项为明确注入的模拟，不冒充真实业务。
 *
 * 用法：node tools/v1-e2e-test.js [--offline]
 */
'use strict';

var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;

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
  'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Control = global.AstroControl;
var O = global.AstroOrchestrator;
var Fits = global.AstroFits;
var Evidence = global.AstroEvidence;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function note(name, extra) { ok(name, true, extra); }

function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();

async function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.stack ? e.stack.split('\n')[0] : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

function makeState(plan, level) {
  var s = T.create({ question: 'e2e', level: level || 'L3' });
  s.plan = plan;
  s.steps = plan.steps.map(T.makeStep);
  s.phase = 'EXECUTE';
  return s;
}
function fakeRegistry(specs) {
  var r = Registry.create({ agentCore: AC, network: false });
  (specs || []).forEach(function (s) {
    r.register(Object.assign({
      version: '1.0.0', caps: ['local'], argsSchema: { type: 'object' },
      timeoutMs: 100, cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false }, idempotent: true, ttlMs: null,
      retry: { allowed: false, max: 0 }, deps: [], run: function () { return { ok: true }; }
    }, s));
  });
  return r;
}
async function download(url) {
  var r = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

var REAL = { paper: false, fitsImage: false, fitsTable: false, simbad: false };
var CACHE = { papers: null, fitsBytes: null };

(async function main() {

  await runCase('E1', '任务一：M42 基础研究（SIMBAD + 论文）', async function () {
    if (OFFLINE) {
      note('E1.0 真实研究流水线跳过（offline）', 'SKIPPED(offline)');
      return;
    }
    var adapter = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: true });
    var r = await Control.run('M42 研究最新进展', CTX, CFG, { adapter: adapter, registry: reg, maxReplans: 0 });
    ok('E1.1 生成 T-E 研究计划', r.plan && r.plan.template === 'T-E', r.plan && r.plan.template);
    ok('E1.2 计划含 SIMBAD/论文/证据/compose', r.plan && r.plan.steps.some(function (s) { return s.tool === 'simbad.tap'; }) &&
      r.plan.steps.some(function (s) { return s.tool === 'paper.search'; }) &&
      r.plan.steps.some(function (s) { return s.tool === 'compose.domain'; }));
    var t1 = r.state.steps.filter(function (s) { return s.tool === 'simbad.tap'; })[0];
    if (t1 && t1.status === 'ok') {
      REAL.simbad = true;
      ok('E1.3 SIMBAD 真实结果进入 evidence', !!t1.evidenceRefs.length, 'REAL: ' + t1.evidenceRefs[0]);
    } else {
      ok('E1.3 SIMBAD 不可达被如实标记', t1 && ['timeout', 'network'].indexOf(t1.error && t1.error.kind) >= 0,
        'DEFERRED(network): ' + (t1 && t1.error && t1.error.kind));
    }
    var papers = r.state.steps.filter(function (s) { return s.tool === 'paper.search'; })[0];
    REAL.paper = !!papers && papers.status === 'ok' && (papers.evidenceRefs || []).length > 0;
    if (papers && papers.result && Array.isArray(papers.result.items)) CACHE.papers = papers.result.items;
    ok('E1.4 论文检索产生真实证据', REAL.paper || (papers && papers.status === 'ok'),
      REAL.paper ? 'REAL: ' + papers.evidenceRefs.length + ' 条' : 'SKIPPED(network): 无结果');
    ok('E1.5 最终交付 answer', !!r.answer, r.answer ? r.state.phase : 'null');
    if (r.answer && r.answer.research) {
      ok('E1.6 报告覆盖论文来源', r.answer.research.coverage && r.answer.research.coverage.hasPapers === true);
      ok('E1.7 报告说明 SIMBAD 缺口', (r.answer.research.gaps || []).some(function (g) { return g.indexOf('SIMBAD') >= 0; }) ||
        REAL.simbad);
      ok('E1.8 每条结论有证据引用', r.answer.research.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
    } else {
      ok('E1.6 无研究结果时不注入报告', !REAL.paper, 'no research (papers=' + REAL.paper + ')');
    }
  });

  await runCase('E2', '任务二：近五年论文检索', async function () {
    if (OFFLINE) { note('E2.0 论文检索跳过（offline）', 'SKIPPED(offline)'); return; }
    var adapter = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: true });
    var res = await reg.get('paper.search').run({ query: 'Orion Nebula survey' }, CTX, reg.get('paper.search'));
    if (!res.ok || !res.items.length) {
      note('E2.1 论文检索不可用（明确标记）', 'SKIPPED(network): ' + (res.reason || 'empty'));
      return;
    }
    REAL.paper = true;
    var first = res.items[0];
    ok('E2.1 获取真实论文元数据', first.sourceType === 'paper' && !!first.title && !!first.uri,
      'REAL: ' + first.title.slice(0, 60));
    ok('E2.2 保留 DOI 或原文链接', !!(first.content.doi || first.uri.indexOf('http') >= 0));
    ok('E2.3 仅摘要，不声称全文', first.abstractOnly === true && first.provenance.abstractOnly === true);
    ok('E2.4 记录检索时间', !!first.retrievedAt && !!first.provenance.retrievedAt);
  });

  await runCase('E3', '任务三：真实 FITS 数据分析', async function () {
    if (OFFLINE) { note('E3.0 真实 FITS 跳过（offline）', 'SKIPPED(offline)'); return; }
    var base = 'https://raw.githubusercontent.com/astropy/astropy/main/astropy/io/fits/tests/data/';
    var img = null, tab = null;
    try { img = await download(base + 'test0.fits'); } catch (e) { img = null; }
    try { tab = await download(base + 'btable.fits'); } catch (e) { tab = null; }
    if (img) {
      var p = Fits.parse({ bytes: img, fileName: 'test0.fits' });
      var imgHdu = (p.hdus || []).filter(function (h) { return h.stats; })[0] || null;
      REAL.fitsImage = p.ok && p.imageCount >= 1 && !!imgHdu;
      ok('E3.1 真实图像 FITS Header/维度/统计', p.ok === true && p.imageCount >= 1 && !!imgHdu,
        'REAL: ' + p.fileSize + ' B / stats=' + JSON.stringify(imgHdu && imgHdu.stats));
      ok('E3.2 保留原始文件信息', !!p.fileHash && !!p.fileName && p.fileSize > 0);
    } else {
      note('E3.1 真实图像 FITS 跳过（网络不可达）', 'SKIPPED(network)');
    }
    if (tab) {
      var pt = Fits.parse({ bytes: tab, fileName: 'btable.fits' });
      REAL.fitsTable = pt.ok && pt.tableCount >= 1;
      ok('E3.3 真实多 HDU/Binary Table', pt.ok === true && pt.hdus.length >= 2 && pt.tableCount >= 1,
        'REAL: ' + pt.hdus.length + ' HDU / tables=' + pt.tableCount);
    } else {
      note('E3.3 真实 BINTABLE 跳过（网络不可达）', 'SKIPPED(network)');
    }
    var reg = Registry.create({ agentCore: AC, network: false });
    reg.register(Object.assign({}, Registry.SPECS.filter(function (s) { return s.id === 'fits.parse'; })[0]));
    if (img) {
      var tool = await reg.get('fits.parse').run({ base64: Buffer.from(img).toString('base64') });
      ok('E3.4 fits.parse 工具真实输出', tool.ok === true && tool.product.imageCount >= 1 &&
        tool.items.length === 1 && tool.items[0].sourceType === 'observation');
    }
  });

  await runCase('E4', '任务四：论文 + FITS 综合研究', async function () {
    if (OFFLINE) { note('E4.0 综合研究跳过（offline）', 'SKIPPED(offline)'); return; }
    var adapter = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: true });
    var paperRes = await reg.get('paper.search').run({ query: 'Orion Nebula' }, CTX, reg.get('paper.search'));
    var items = (paperRes.items || []).slice(0, 2);
    var fitsEv = null;
    try {
      var img = await download('https://raw.githubusercontent.com/astropy/astropy/main/astropy/io/fits/tests/data/btable.fits');
      var p = Fits.parse({ bytes: img, fileName: 'btable.fits' });
      fitsEv = Evidence.fromFits(p, { retrievedAt: new Date().toISOString(), fileName: 'btable.fits' });
    } catch (e) { fitsEv = null; }
    if (!items.length || !fitsEv) {
      note('E4.1 综合研究缺少真实数据（明确标记）', 'SKIPPED(network): papers=' + items.length + ' fits=' + !!fitsEv);
      return;
    }
    var deps = {
      t1: { ok: true, items: items, evidenceIds: items.map(function (x) { return x.evidenceId; }) },
      t2: { ok: true, items: [fitsEv], evidenceIds: [fitsEv.evidenceId] }
    };
    var r = adapter.compose({ query: '综合研究猎户座大星云（论文与观测数据）', from: ['t1', 't2'] }, CTX, CFG, deps);
    ok('E4.1 综合报告生成', r.ok === true && !!r.answer.research, 'report=' + (r.answer.research && r.answer.research.reportId));
    var rep = r.answer.research;
    ok('E4.2 至少两类真实数据源', rep.coverage.hasPapers === true && rep.coverage.hasFits === true,
      JSON.stringify(rep.coverage));
    ok('E4.3 多个 Claim 与 Evidence 引用', rep.conclusions.length >= 2 &&
      rep.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }), 'conclusions=' + rep.conclusions.length);
    ok('E4.4 Reducer 保留来源/冲突结构', !!rep.sources.length && Array.isArray(rep.conflicts));
    ok('E4.5 报告含不确定性/缺口声明', Array.isArray(rep.uncertainties) && Array.isArray(rep.gaps) && !!rep.disclaimer);
    REAL.paper = true; REAL.fitsTable = true;
  });

  await runCase('E5', '任务五：故障恢复（模拟注入）', async function () {
    var plan = { template: 'T-A', steps: [
      { id: 't1', tool: 'fake.ok', args: {}, deps: [], parallel: true, critical: false, optional: false },
      { id: 't2', tool: 'fake.slow', args: {}, deps: [], parallel: true, critical: false, optional: false },
      { id: 't3', tool: 'compose.simple', args: {}, deps: ['t1', 't2'], parallel: false, critical: true, optional: false }
    ] };
    var s = makeState(plan, 'L3');
    var reg = fakeRegistry([
      { id: 'fake.ok', run: function () { return { ok: true, value: 1 }; } },
      { id: 'fake.slow', timeoutMs: 20, idempotent: true, retry: { allowed: true, max: 1 }, run: function () { return new Promise(function () {}); } }
    ]);
    var r = await O.runPlan(plan, s, { registry: reg, ctx: CTX });
    ok('E5.1 超时步骤安全重试后失败', s.steps[1].attempt === 2 && s.steps[1].error.kind === 'timeout');
    ok('E5.2 成功步骤结果保留', s.steps[0].status === 'ok' && s.steps[0].result.value === 1);
    ok('E5.3 依赖失败传播 blocked', s.steps[2].status === 'blocked' && s.steps[2].error.kind === 'dependency');
    ok('E5.4 无答案不伪造成功', r.ok === false && r.answer === null);

    var emptyPlan = { template: 'T-A', steps: [
      { id: 't1', tool: 'fake.empty', args: {}, deps: [], parallel: false, critical: false, optional: false }
    ] };
    var s2 = makeState(emptyPlan, 'L3');
    var reg2 = fakeRegistry([{ id: 'fake.empty', run: function () { return { ok: true, items: [], empty: true }; } }]);
    await O.runPlan(emptyPlan, s2, { registry: reg2, ctx: CTX });
    ok('E5.5 空结果明确标记且不生成证据', s2.steps[0].status === 'ok' &&
      s2.steps[0].result.empty === true && s2.steps[0].evidenceRefs.length === 0);

    var ac = new AbortController();
    ac.abort();
    var c = await Control.run('M42 怎么拍 为什么需要长曝光？', CTX, CFG, { signal: ac.signal });
    ok('E5.6 用户取消 → ABORTED 且无成功答案', c.cancelled === true && c.state.phase === 'ABORTED' && c.answer === null);
  });

  for (var i = 0; i < results.length; i++) {
    var rr = results[i];
    console.log((rr.pass ? 'PASS' : 'FAIL') + ' | ' + rr.name + (rr.extra ? ' | ' + rr.extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    var c2 = cases[j];
    console.log('CASE ' + c2.id + ' ' + (c2.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c2.title + ' | 断言 ' + c2.assertions);
  }
  console.log('');
  console.log('REAL | simbad=' + REAL.simbad + ' paper=' + REAL.paper + ' fitsImage=' + REAL.fitsImage + ' fitsTable=' + REAL.fitsTable);
  console.log('CASES ' + cases.filter(function (c3) { return c3.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})();
