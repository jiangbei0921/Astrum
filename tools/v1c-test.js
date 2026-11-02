/* ASTRUM · V1 C 阶段专项测试（纯 Node，零依赖）
 *
 * 覆盖：Reducer 去重/冲突/不改原件 / TaskStore 持久化 / resume /
 * 有限重规划 / 在飞取消 / Event 历史 / 成功结果保留。
 * 用法：node tools/v1c-test.js
 */
'use strict';

var path = require('path');
var util = require('util');

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
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var A = global.Astro;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var O = global.AstroOrchestrator;
var Control = global.AstroControl;
var Reducer = global.AstroReducer;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var TaskStore = global.AstroTaskStore;
var Planner = global.AstroPlanner;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function equal(name, actual, expected) {
  var same = util.isDeepStrictEqual(actual, expected);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)));
}
function canonical(x) { return T.canonicalJSON(x); }

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
var Q_TC = 'M42 怎么拍 为什么需要长曝光？';
var Q_TA = 'M42 是什么';

async function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.stack ? e.stack.split('\n')[0] : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

function makeState(plan, level) {
  var s = T.create({ question: 'test', level: level || 'L3' });
  if (plan) { s.plan = plan; s.steps = plan.steps.map(T.makeStep); }
  return s;
}

function fakeRegistry(specs) {
  var r = Registry.create({ agentCore: AC, network: false });
  (specs || []).forEach(function (s) {
    r.register(Object.assign({
      version: '1.0.0', caps: ['local'], argsSchema: { type: 'object' },
      timeoutMs: 100, cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: [],
      run: function () { return { ok: true }; }
    }, s));
  });
  return r;
}

function paper(host, doi) {
  return Evidence.fromSourceItem({
    title: 'Paper ' + doi, snippet: 'abstract text', excerpt: 'abstract text',
    url: 'https://' + host + '/paper', host: host, sourceType: 'paper',
    doi: doi, date: '2024-01-01', dateKind: 'published', version: 'published',
    authors: ['A. Author'], extra: { venue: 'ApJ' }
  }, { tool: 'paper.search', query: 'M42', retrievedAt: '2026-10-31T00:00:00Z' });
}

(async function main() {

  await runCase('C1', 'Reducer 去重/冲突/不改原件', async function () {
    var e1 = paper('arxiv.org', '10.1000/xyz');
    var e2 = paper('openalex.org', '10.1000/xyz');
    var e3 = paper('ui.adsabs.harvard.edu', '10.1000/abc');
    var before = canonical([e1, e2, e3]);
    var r = Reducer.reduce({ evidence: [e1, e2, e3] });
    ok('C1.1 同 DOI 只保留一条', r.evidence.length === 2, 'n=' + r.evidence.length);
    ok('C1.2 记录 duplicate', r.duplicates.length === 1, JSON.stringify(r.duplicates));
    ok('C1.3 独立来源计数', r.sources.length === 2, 'sources=' + r.sources.length);
    ok('C1.4 不修改原始 Evidence', canonical([e1, e2, e3]) === before);

    var c1 = Claims.makeClaim({
      id: 'c1', text: 'M42 距离约 10 ly', type: 'quantitative', source: 'web',
      entities: ['M42'], numbers: [{ value: 10, unit: 'ly' }],
      support: [{ eid: e3.evidenceId, strength: 'weak', basis: 'numeric' }],
      uncertainty: { kind: 'measurement', value: 1, basis: 'test' },
      calc: { value: 10, unit: 'ly', epoch: 'J2000', frame: 'icrs', source: 'test', method: 'test', inputs: {}, computedAt: '2026-10-31T00:00:00Z' },
      required: true
    });
    var c2 = Claims.makeClaim({
      id: 'c2', text: 'M42 距离约 12 ly', type: 'quantitative', source: 'web',
      entities: ['M42'], numbers: [{ value: 12, unit: 'ly' }],
      support: [{ eid: e3.evidenceId, strength: 'weak', basis: 'numeric' }],
      uncertainty: { kind: 'measurement', value: 1, basis: 'test' },
      calc: { value: 12, unit: 'ly', epoch: 'J2000', frame: 'icrs', source: 'test', method: 'test', inputs: {}, computedAt: '2026-10-31T00:00:00Z' },
      required: true
    });
    var r2 = Reducer.reduce({ evidence: [e3], claims: [c1, c2] });
    ok('C1.5 同实体同单位数值冲突', r2.conflicts.length === 1, JSON.stringify(r2.conflicts));
    ok('C1.6 冲突跨度计算', r2.conflicts[0].spread > 5, String(r2.conflicts[0] && r2.conflicts[0].spread));
  });

  await runCase('C2', 'TaskStore 持久化/列表/删除', async function () {
    var store = TaskStore.create({});
    var plan = Planner.buildPlan({ query: Q_TA, intent: 'knowledge-target', targets: AC.resolveTargets(Q_TA), route: { legacy: false, targets: ['猎户座大星云'], reason: 'test' }, ctx: CTX, registry: null });
    var s = makeState(plan, 'L2');
    s.phase = 'EXECUTE';
    s.steps[0].status = 'pending';
    var id = await store.save(s);
    ok('C2.1 保存返回 id', id === s.id);
    ok('C2.2 后端为 localStorage', store.backend() === 'ls', store.backend());
    var got = await store.get(s.id);
    ok('C2.3 读取恢复 Phase/Steps', got && got.phase === 'EXECUTE' && got.steps.length === plan.steps.length);
    var list = await store.list({ limit: 10 });
    ok('C2.4 列表可查询', list.length === 1 && list[0].id === s.id);
    ok('C2.5 可恢复判定', list[0].resumable === true && list[0].viewOnly === false, JSON.stringify(list[0]));

    var term = T.create({ question: 'done', level: 'L2' });
    term.phase = 'DONE';
    await store.save(term);
    var l2 = await store.list({ limit: 10 });
    var t = l2.filter(function (x) { return x.id === term.id; })[0];
    ok('C2.6 终态只能查看', t && t.resumable === false && t.viewOnly === true);
    await store.remove(s.id);
    ok('C2.7 删除后不可读', (await store.get(s.id)) === null);
    await store.clear();
  });

  await runCase('C3', '刷新后恢复执行', async function () {
    var plan = Planner.buildPlan({ query: Q_TA, intent: 'knowledge-target', targets: AC.resolveTargets(Q_TA), route: { legacy: false, targets: ['猎户座大星云'], reason: 'test' }, ctx: CTX, registry: null });
    var s = makeState(plan, 'L2');
    s.phase = 'EXECUTE';
    s.plan = plan;
    var t1 = s.steps.filter(function (x) { return x.id === 't1'; })[0];
    t1.status = 'ok';
    t1.result = { ok: true, targets: AC.resolveTargets(Q_TA), names: ['猎户座大星云'] };
    t1.outputHash = T.sha256Hex('t1');
    t1.startedAt = t1.endedAt = new Date().toISOString();
    var store = TaskStore.create({});
    await store.save(s);
    var r = await Control.resume(s.id, CTX, CFG, { store: store });
    ok('C3.1 恢复执行成功', !!r && !!r.answer && r.resumed === true, r && r.state.phase);
    ok('C3.2 剩余步骤执行完成', r && r.state.steps.every(function (x) { return x.status === 'ok'; }),
      r && r.state.steps.map(function (x) { return x.status; }).join(','));
    ok('C3.3 终态不可再恢复', r && r.resumable === false && T.isTerminal(r.state.phase));
    ok('C3.4 恢复事件已记录', r && r.state.events.some(function (e) { return e.type === 'task.recovered'; }));
  });

  await runCase('C4', '有限重规划（保留成功结果）', async function () {
    var composeCalls = 0;
    var fakeAnswer = { sections: [{ kind: 'verdict', head: '重规划后回答' }], trace: [], meta: {} };
    var adapter = {
      compose: function () {
        composeCalls += 1;
        if (composeCalls === 1) return { ok: false, reason: 'forced_compose_fail', retriable: false };
        return { ok: true, answer: fakeAnswer, delivery: { usedStepIds: ['t1', 't2'], dependencyIds: ['t1', 't2'] }, evidenceIds: [] };
      }
    };
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: false });
    var r = await Control.run(Q_TC, CTX, CFG, { adapter: adapter, registry: reg, maxReplans: 1 });
    ok('C4.1 发生 1 次重规划', r.replanned === true && r.state.replans.length === 1, 'replans=' + r.state.replans.length);
    ok('C4.2 新 compose 步骤成功', r.state.steps.some(function (s) { return s.id === 't3r' && s.status === 'ok'; }));
    ok('C4.3 成功步骤未重跑', r.state.steps.filter(function (s) { return s.id === 't1' || s.id === 't2'; })
      .every(function (s) { return s.status === 'ok' && s.attempt === 1; }), r.state.steps.map(function (s) { return s.id + ':' + s.status + ':' + s.attempt; }).join(','));
    ok('C4.4 最终交付重规划回答', r.answer === fakeAnswer);
    ok('C4.5 重规划事件存在', r.state.events.some(function (e) { return e.type === 'task.replanned'; }));
    ok('C4.6 预算 replans 已扣减', r.state.budget.used.replans === 1, String(r.state.budget.used.replans));
  });

  await runCase('C5', '在飞取消与 pending 标记', async function () {
    var plan = { template: 'T-A', steps: [
      { id: 't1', tool: 'fake.slow', args: {}, deps: [], parallel: true, critical: false, optional: false },
      { id: 't2', tool: 'fake.slow', args: {}, deps: [], parallel: true, critical: false, optional: false }
    ] };
    var s = makeState(plan, 'L3');
    var reg = fakeRegistry([{ id: 'fake.slow', timeoutMs: 1000, idempotent: true, run: function () { return new Promise(function () {}); } }]);
    var ac = new AbortController();
    var p = O.runPlan(plan, s, { registry: reg, ctx: CTX, signal: ac.signal });
    setTimeout(function () { ac.abort(); }, 30);
    var r = await p;
    ok('C5.1 Scheduler 返回 aborted', r.aborted === true);
    ok('C5.2 在飞步骤 aborted', s.steps.every(function (x) { return x.status === 'aborted'; }),
      s.steps.map(function (x) { return x.status; }).join(','));
    ok('C5.3 标记 pendingAbort', s.steps.every(function (x) { return x.error && x.error.pendingAbort === true; }));
    ok('C5.4 取消事件已记录', s.events.some(function (e) { return e.type === 'step.cancelled'; }));
  });

  await runCase('C6', '失败恢复保留成功结果', async function () {
    var plan = { template: 'T-A', steps: [
      { id: 't1', tool: 'fake.ok', args: {}, deps: [], parallel: true, critical: false, optional: false },
      { id: 't2', tool: 'fake.bad', args: {}, deps: [], parallel: true, critical: false, optional: false }
    ] };
    var s = makeState(plan, 'L3');
    s.phase = 'EXECUTE';
    var reg = fakeRegistry([
      { id: 'fake.ok', run: function () { return { ok: true, value: 42 }; } },
      { id: 'fake.bad', run: function () { return { ok: false, reason: 'data_source_error', kind: 'data_source', retriable: false }; } }
    ]);
    var r = await O.runPlan(plan, s, { registry: reg, ctx: CTX });
    ok('C6.1 成功结果保留', s.steps[0].status === 'ok' && s.steps[0].result.value === 42);
    ok('C6.2 失败步骤不伪造', s.steps[1].status === 'failed' && s.steps[1].result === null);
    ok('C6.3 无答案不标记成功', r.ok === false && r.answer === null);
  });

  for (var i = 0; i < results.length; i++) {
    var rr = results[i];
    console.log((rr.pass ? 'PASS' : 'FAIL') + ' | ' + rr.name + (rr.extra ? ' | ' + rr.extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    var c = cases[j];
    console.log('CASE ' + c.id + ' ' + (c.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c.title + ' | 断言 ' + c.assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})();
