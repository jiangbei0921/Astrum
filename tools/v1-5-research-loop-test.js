/* ASTRUM · V1.5 Progress Evaluator / Research Loop 测试
 *
 * 覆盖：continue / append / replan / stop、预算耗尽、重复检索拒绝、
 *       Planner.expand 只追加不改写、Control 真实追加步骤与事件。
 *
 * 用法：node tools/v1-5-research-loop-test.js
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
  'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Planner = global.AstroPlanner;
var Eval = global.AstroEvaluator;
var Control = global.AstroControl;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 200)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}
function stateFor(plan, used, limit) {
  var s = T.create({ question: 'loop', level: 'L3' });
  s.plan = plan;
  s.steps = plan.steps.map(T.makeStep);
  if (used) Object.keys(used).forEach(function (k) { s.budget.used[k] = used[k]; });
  if (limit) Object.keys(limit).forEach(function (k) { s.budget.limit[k] = limit[k]; });
  return s;
}
function settle(s) {
  s.steps.forEach(function (x) { x.status = 'ok'; });
  return s;
}
var TE_NOEV = { template: 'T-E', steps: [
  { id: 't1', tool: 'simbad.tap', args: { query: 'M42' }, deps: [], parallel: false, critical: true, optional: false },
  { id: 't2', tool: 'paper.search', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
  { id: 'c1', tool: 'compose.domain', args: { query: 'M42' }, deps: ['t1', 't2'], parallel: false, critical: true, optional: false }
] };
var TE = { template: 'T-E', steps: [
  { id: 't1', tool: 'simbad.tap', args: { query: 'M42' }, deps: [], parallel: false, critical: true, optional: false },
  { id: 't2', tool: 'paper.search', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
  { id: 't3', tool: 'evidence.search', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
  { id: 'c1', tool: 'compose.domain', args: { query: 'M42' }, deps: ['t1', 't2', 't3'], parallel: false, critical: true, optional: false }
] };
var CTX = { y: 2026, mo: 11, d: 1, h: 21, mi: 0, tz: 8, city: '北京', lat: 39.9, lon: 116.4, bortle: 5 };
var CFG = AC.defaultConfig();

(async function main() {
  await runCase('E1', 'Progress Evaluator 判定', async function () {
    var st = stateFor(TE);
    st.steps[0].status = 'pending';
    var r = Eval.decide({ state: st, plan: TE, opts: { query: 'M42' } });
    ok('E1.1 有待执行 → continue', r.action === 'continue', r.action);

    var st2 = settle(stateFor(TE, { searches: 3 }, { searches: 3 }));
    var r2 = Eval.decide({ state: st2, plan: TE, opts: { query: 'M42' } });
    ok('E1.2 搜索预算耗尽 → stop', r2.action === 'stop' && r2.reason === 'budget_exhausted', r2.reason);

    var st3 = settle(stateFor(TE_NOEV));
    var r3 = Eval.decide({ state: st3, plan: TE_NOEV, opts: { query: 'M42' } });
    ok('E1.3 无证据 → append', r3.action === 'append' && r3.gaps.indexOf('no_evidence') >= 0, r3.reason);

    var st4 = settle(stateFor({ template: 'T-A', steps: TE.steps }));
    var r4 = Eval.decide({ state: st4, plan: { template: 'T-A', steps: TE.steps }, opts: { query: 'M42' } });
    ok('E1.4 非研究模板 → stop', r4.action === 'stop' && r4.reason === 'not_research', r4.reason);

    var st5 = settle(stateFor(TE));
    st5.criticalFailed = true;
    st5.budget.used.replans = 0;
    var r5 = Eval.decide({ state: st5, plan: TE, opts: { query: 'M42' } });
    ok('E1.5 关键失败且有预算 → replan', r5.action === 'replan', r5.action);

    var st6 = settle(stateFor(TE, { appends: 2 }, { appends: 2 }));
    var r6 = Eval.decide({ state: st6, plan: TE, opts: { query: 'M42' } });
    ok('E1.6 append 预算耗尽 → stop', r6.action === 'stop', r6.reason);

    var st7 = settle(stateFor(TE, { searches: 0 }, { searches: 0 }));
    var r7 = Eval.decide({ state: st7, plan: TE, opts: { query: 'M42' } });
    ok('E1.7 无搜索预算 → stop', r7.action === 'stop', r7.reason);
  });

  await runCase('E2', 'Planner.expand', async function () {
    var reg = global.AstroRegistry.createDefault({ agentCore: AC, network: false });
    var st = stateFor(TE_NOEV, null, { searches: 4 });
    var ex = Planner.expand(TE_NOEV, { gaps: ['no_evidence'] }, { registry: reg, budget: st.budget, query: 'M42' });
    ok('E2.1 T-E 追加步骤', !!ex && ex.steps.length === TE_NOEV.steps.length + 1, ex ? ex.steps.length : 'null');
    ok('E2.2 不改写原步骤', ex.steps.slice(0, TE_NOEV.steps.length).every(function (s, i) { return s.id === TE_NOEV.steps[i].id; }));
    ok('E2.3 新步骤 ID 唯一', ex.steps[ex.steps.length - 1].id === 'x1' &&
      ex.steps.filter(function (s) { return s.id === 'x1'; }).length === 1);
    ok('E2.4 新步骤在模板允许工具内', ex.steps[ex.steps.length - 1].tool === 'evidence.search');
    var ex2 = Planner.expand(ex, { gaps: ['no_evidence'] }, { registry: reg, budget: st.budget, query: 'M42' });
    ok('E2.5 第二次追加不同 ID', !!ex2 && ex2.steps[ex2.steps.length - 1].id === 'x2');
    var ex3 = Planner.expand({ template: 'T-A', steps: TE_NOEV.steps }, {}, { registry: reg, query: 'M42' });
    ok('E2.6 非研究模板拒绝', ex3 === null);
  });

  await runCase('E3', 'Control Research Loop 真实集成', async function () {
    var r = await Control.run('研究 M42 的距离测量、近五年论文与观测数据', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0,
      store: global.AstroTaskStore.create({})
    });
    var events = r.state.events || [];
    var expanded = events.filter(function (e) { return e.type === 'plan.expanded'; });
    var decided = events.filter(function (e) { return e.type === 'progress.decided'; });
    var appended = r.state.steps.filter(function (s) { return /^x/.test(s.id); });
    ok('E3.1 发出 progress.decided', decided.length >= 1, 'n=' + decided.length);
    ok('E3.2 追加计划事件', expanded.length >= 1, 'n=' + expanded.length);
    ok('E3.3 实际追加步骤', appended.length >= 1, 'n=' + appended.length);
    ok('E3.4 appends 预算被消耗', r.state.budget.used.appends >= 1, String(r.state.budget.used.appends));
    var ids = {};
    ok('E3.5 步骤唯一且保留原计划', r.state.steps.length === 5 &&
      r.state.steps.every(function (x) { var dup = !!ids[x.id]; ids[x.id] = 1; return !dup; }),
      'n=' + r.state.steps.length);
    ok('E3.6 未新增第 8 模板', r.plan && r.plan.template === 'T-E', r.plan && r.plan.template);
    /* Gate 1：修复原“只断言步骤存在”的假通过，验证追加搜索真实执行与预算单次扣减。 */
    ok('E3.7 追加步骤真实执行 ok', appended.length >= 1 && appended[0].status === 'ok',
      appended.length ? appended[0].status : 'none');
    ok('E3.8 searches 只扣一次', r.state.budget.used.searches === 3,
      String(r.state.budget.used.searches));
    ok('E3.9 追加依据可追溯', !!r.plan.expansion && Array.isArray(r.plan.expansion.basis) &&
      r.plan.expansion.basis.length >= 1,
      r.plan.expansion ? r.plan.expansion.basis.map(function (b) { return b.code; }).join(',') : 'none');
  });

  await runCase('E4', 'Replan 预算 ADR-001', async function () {
    function limit(level, opts) {
      var st = T.create({ question: 'replan', level: level });
      return Control.maxReplansOf(st, opts || {});
    }
    ok('E4.1 L1 = 0', limit('L1') === 0, String(limit('L1')));
    ok('E4.2 L2 = 1', limit('L2') === 1, String(limit('L2')));
    ok('E4.3 L3 = 2', limit('L3') === 2, String(limit('L3')));
    ok('E4.4 L4 = 2', limit('L4') === 2, String(limit('L4')));
    ok('E4.5 显式 0 收紧', limit('L3', { maxReplans: 0 }) === 0);
    ok('E4.6 显式 1 收紧', limit('L3', { maxReplans: 1 }) === 1);
    ok('E4.7 超过 2 被硬上限拒绝', limit('L4', { maxReplans: 9 }) === 2);
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
  console.error('[v1-5-research-loop] ' + (e && e.stack || e));
  process.exit(1);
});
