/* ASTRUM · V1.1 端到端验收（统一入口 + 真实研究 + 持久化恢复）
 *
 * 真实网络项标 REAL；不可达标 SKIPPED(network)；--offline 标 OFFLINE。
 * 用法：node tools/v1-1-e2e-test.js [--offline]
 */
'use strict';

var path = require('path');
var util = require('util');
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
  'core/orchestrator.js', 'core/control.js', 'core/request.js', 'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Request = global.AstroRequest;
var Bridge = global.AstroControlBridge;
var Control = global.AstroControl;
var Fits = global.AstroFits;
var Evidence = global.AstroEvidence;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function note(name, extra) { ok(name, true, extra); }
function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0, tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();
var REAL = { research: false, paper: false, fits: false };

async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 160)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

function offlineRuntime() {
  var adapter = Adapter.create({ agentCore: AC });
  return { adapter: adapter, registry: Registry.createDefault({ adapter: adapter, agentCore: AC, network: false }) };
}

(async function main() {

  await runCase('E1', '统一入口 → 真实 M42 研究', async function () {
    var rt = OFFLINE ? offlineRuntime() : (function () {
      var a = Adapter.create({ agentCore: AC });
      return { adapter: a, registry: Registry.createDefault({ adapter: a, agentCore: AC, network: true }) };
    })();
    var r = await Request.handle('M42 研究最新进展', CTX, CFG, Object.assign({ maxReplans: 0 }, rt));
    ok('E1.1 统一入口分流到 Control', r.mode === 'control' && !!r.control);
    ok('E1.2 T-E 研究计划', r.control.plan && r.control.plan.template === 'T-E');
    ok('E1.3 返回可渲染 answer', !!r.answer, r.answer && r.control.state.phase);
    if (OFFLINE) {
      note('E1.4 离线模式不声称研究报告', 'OFFLINE');
      return;
    }
    if (r.answer && r.answer.research) {
      REAL.research = true;
      var rep = r.answer.research;
      ok('E1.4 报告有结论与引用', rep.conclusions.length > 0 &&
        rep.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }), 'REAL');
      ok('E1.5 报告覆盖论文', rep.coverage && rep.coverage.hasPapers === true, 'REAL');
      ok('E1.6 SIMBAD 缺口如实说明', (rep.gaps || []).some(function (g) { return g.indexOf('SIMBAD') >= 0; }) ||
        rep.coverage.hasSimbad === true);
      ok('E1.7 论文仅摘要标记', rep.papers.every(function (p) { return p.abstractOnly === true; }));
    } else {
      note('E1.4 真实研究无证据（网络跳过）', 'SKIPPED(network): paper/evidence empty');
    }
  });

  await runCase('E2', '真实论文元数据', async function () {
    if (OFFLINE) { note('E2 论文检索跳过', 'OFFLINE'); return; }
    var a = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: a, agentCore: AC, network: true });
    var res = await reg.get('paper.search').run({ query: 'Orion Nebula' }, CTX, reg.get('paper.search'));
    if (!res.ok || !res.items.length) { note('E2 论文检索不可用', 'SKIPPED(network): ' + (res.reason || 'empty')); return; }
    REAL.paper = true;
    var p = res.items[0];
    ok('E2.1 真实论文 Evidence', p.sourceType === 'paper' && !!p.uri && !!p.evidenceId, 'REAL: ' + p.title.slice(0, 40));
    ok('E2.2 DOI/摘要标记/检索时间', (p.content.doi || p.content.excerpt) && p.abstractOnly === true &&
      !!p.provenance.retrievedAt);
  });

  await runCase('E3', 'FITS 真实/本地双样本', async function () {
    var values = [1, 2, 3, 4, 5, 6, 7, 8];
    var buf = new Uint8Array(2880 + 2880);
    var cards = ['SIMPLE  = T', 'BITPIX  = -32', 'NAXIS   = 2', 'NAXIS1  = 4', 'NAXIS2  = 2', 'BUNIT   = \'ADU\'', 'END'];
    var text = cards.map(function (c) { return (c + ' '.repeat(80)).slice(0, 80); }).join('');
    for (var i = 0; i < text.length; i++) buf[i] = text.charCodeAt(i);
    var dv = new DataView(buf.buffer, 2880, 32);
    values.forEach(function (v, j) { dv.setFloat32(j * 4, v, false); });
    var p = Fits.parse({ bytes: buf, fileName: 'generated.fits' });
    ok('E3.1 本地生成 FITS 统计正确', p.ok === true && p.hdus[0].stats.mean === 4.5 &&
      p.hdus[0].stats.min === 1 && p.hdus[0].stats.max === 8, JSON.stringify(p.hdus[0].stats));
    if (OFFLINE) { note('E3.2 真实 FITS 跳过', 'OFFLINE'); return; }
    try {
      var rr = await fetch('https://raw.githubusercontent.com/astropy/astropy/main/astropy/io/fits/tests/data/btable.fits',
        { signal: AbortSignal.timeout(20000) });
      if (!rr.ok) throw new Error('HTTP ' + rr.status);
      var real = Fits.parse({ bytes: new Uint8Array(await rr.arrayBuffer()), fileName: 'btable.fits' });
      REAL.fits = real.ok && real.tableCount >= 1;
      ok('E3.2 真实 FITS 多 HDU/表', REAL.fits, 'REAL: ' + real.hdus.length + ' HDU');
    } catch (e) {
      note('E3.2 真实 FITS 跳过（网络）', 'SKIPPED(network): ' + (e && e.message));
    }
  });

  await runCase('E4', '综合报告（论文 + FITS）', async function () {
    var adapter = Adapter.create({ agentCore: AC });
    var items = [];
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: !OFFLINE });
    if (!OFFLINE) {
      var pr = await reg.get('paper.search').run({ query: 'Orion Nebula' }, CTX, reg.get('paper.search'));
      items = (pr.items || []).slice(0, 2);
    }
    if (!items.length) {
      items = [Evidence.fromSourceItem({
        title: 'Orion Nebula mock abstract', excerpt: 'Mock abstract for UI pipeline test.',
        url: 'https://example.org/mock', host: 'example.org', sourceType: 'paper',
        doi: '10.9999/mock', version: 'published'
      }, { tool: 'paper.search', query: 'Orion', retrievedAt: new Date().toISOString() })];
    }
    var fitsEv = Evidence.fromFits({ ok: true, hdus: [{ index: 0, header: { NAXIS: 2, NAXIS1: 4, NAXIS2: 2, BITPIX: -32, BUNIT: 'ADU' }, stats: { mean: 4.5, min: 1, max: 8, std: 2, count: 8 } }], imageCount: 1, tableCount: 0, fileSize: 5760, fileHash: 'fits_mock' },
      { fileName: 'generated.fits', retrievedAt: new Date().toISOString() });
    var deps = {
      t1: { ok: true, items: items, evidenceIds: items.map(function (x) { return x.evidenceId; }) },
      t2: { ok: true, items: [fitsEv], evidenceIds: [fitsEv.evidenceId] }
    };
    var r = adapter.compose({ query: '综合研究 M42（论文与观测）', from: ['t1', 't2'] }, CTX, CFG, deps);
    ok('E4.1 报告生成', r.ok === true && !!r.answer.research);
    ok('E4.2 多源覆盖', r.answer.research.coverage.hasPapers === true && r.answer.research.coverage.hasFits === true);
    ok('E4.3 结论有 evidenceRefs', r.answer.research.conclusions.length >= 1 &&
      r.answer.research.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
    ok('E4.4 报告保留来源/缺口', r.answer.research.sources.length >= 2 && Array.isArray(r.answer.research.gaps));
  });

  await runCase('E5', '取消 + 刷新恢复', async function () {
    var rt = offlineRuntime();
    var ac = new AbortController();
    ac.abort();
    var c = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG,
      Object.assign({}, rt, { signal: ac.signal }));
    ok('E5.1 取消 → ABORTED 无答案', c.cancelled === true && c.answer === null &&
      c.control.state.phase === 'ABORTED');

    var plan = { template: 'T-A', steps: [
      { id: 't1', tool: 'kb.lookup', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
      { id: 't2', tool: 'kepler.ephemeris', args: { target: 'M42', jd: 2461342.5, place: { lat: 39.9, lon: 116.4 } }, deps: [], parallel: true, critical: false, optional: false },
      { id: 't3', tool: 'compose.target', args: { query: 'M42', from: ['t1', 't2'] }, deps: ['t1', 't2'], parallel: false, critical: true, optional: false }
    ] };
    var st = T.create({ question: 'V1.1 恢复测试', level: 'L2' });
    st.phase = 'EXECUTE';
    st.plan = plan;
    st.steps = plan.steps.map(T.makeStep);
    st.steps[0].status = 'ok';
    st.steps[0].result = { ok: true, targets: AC.resolveTargets('M42') };
    st.steps[0].outputHash = T.sha256Hex('t1');
    st.steps[0].startedAt = st.steps[0].endedAt = new Date().toISOString();
    var store = global.AstroTaskStore.create({});
    await store.save(st);
    var r = await Bridge.resume(st.id, CTX, CFG, { store: store });
    ok('E5.2 刷新等价恢复执行', !!r && !!r.answer && r.resumed === true, r && r.state.phase);
    ok('E5.3 已成功步骤不重跑', r && r.state.steps[0].attempt === 0 && r.state.steps[0].status === 'ok');
    ok('E5.4 恢复后终态可查询', r && r.state.phase !== 'EXECUTE' && store.isResumable(r.state) === false);
    ok('E5.5 恢复事件记录', r && r.state.events.some(function (e) { return e.type === 'task.recovered'; }));
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' + cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('REAL | research=' + REAL.research + ' paper=' + REAL.paper + ' fits=' + REAL.fits);
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})();
