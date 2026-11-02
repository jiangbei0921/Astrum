/* ASTRUM · V1 B 阶段专项测试（纯 Node，零依赖）
 *
 * 覆盖：Router 目标边界 / Planner 解释与预算 / TaskState 统一字段 /
 * Runner 幂等重试 / 取消 / Event / T-A、T-C 旧回答回归。
 * 用法：node tools/v1b-test.js
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
var Router = global.AstroRouter;
var Planner = global.AstroPlanner;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var O = global.AstroOrchestrator;
var Control = global.AstroControl;

var results = [], cases = [], pass = 0;

function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra || '' });
  if (cond) pass++;
}
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
  if (plan) {
    s.plan = plan;
    s.steps = plan.steps.map(T.makeStep);
  }
  return s;
}

function fakeRegistry(specs) {
  var r = Registry.create({ agentCore: AC, network: false });
  (specs || []).forEach(function (s) {
    r.register(Object.assign({
      version: '1.0.0', caps: ['local'], argsSchema: { type: 'object' },
      timeoutMs: 100, cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, deps: [], run: function () { return { ok: true }; }
    }, s));
  });
  return r;
}

function seqOk(state) {
  for (var i = 0; i < state.events.length; i++) {
    if (state.events[i].seq !== i + 1) return false;
  }
  return true;
}

(async function main() {

  await runCase('B1', 'Router 目标边界 M42/M4', async function () {
    var r = Router.route({ query: 'M42 是什么', intent: 'knowledge-target', targets: AC.resolveTargets('M42') });
    ok('B1.1 M42 不命中 M4', r.targets.indexOf('M4') < 0 && r.targets.indexOf('M4 球状星团') < 0, JSON.stringify(r.targets));
    ok('B1.2 M42 保留为单一目标', r.targets.length === 1, JSON.stringify(r.targets));
    var both = Router.route({ query: 'M4 和 M42 有什么区别', intent: 'knowledge-target', targets: AC.resolveTargets('M4 和 M42') });
    ok('B1.3 显式双目标保留', both.targets.length >= 2 && both.targets.indexOf('M4 球状星团') >= 0,
      JSON.stringify(both.targets));
    var prep = Control.prepare(Q_TC, CTX, CFG);
    ok('B1.4 Planner 目标不含 M4', prep.plan && prep.plan.steps.filter(function (s) {
      return s.tool === 'kepler.ephemeris';
    })[0].args.target !== 'M4');
  });

  await runCase('B2', 'Planner 解释 / 预算 / 上限', async function () {
    var prep = Control.prepare(Q_TC, CTX, CFG);
    ok('B2.1 有模板解释', !!prep.plan.explanation && prep.plan.explanation.template === 'T-C');
    ok('B2.2 有逐步理由', prep.plan.explanation.steps.length === prep.plan.steps.length);
    ok('B2.3 有预算估算', !!prep.plan.estimate && prep.plan.estimate.steps === 3, JSON.stringify(prep.plan.estimate));
    var plan = JSON.parse(JSON.stringify(prep.plan));
    plan.estimate.ms = 999999;
    var bad = Planner.validate(plan, { budget: prep.state.budget });
    ok('B2.4 超预算被拒', bad.ok === false && bad.errors.some(function (e) { return e.path === '$.budget'; }));
    var many = JSON.parse(JSON.stringify(prep.plan));
    while (many.steps.length < 10) many.steps.push(JSON.parse(JSON.stringify(many.steps[0])));
    ok('B2.5 步骤上限 8 被拒', Planner.validate(many).ok === false);
  });

  await runCase('B3', 'TaskState 统一字段 / Event', async function () {
    var r = await Control.run(Q_TC, CTX, CFG);
    var cs = r.state.steps.filter(function (s) { return s.status === 'ok'; });
    ok('B3.1 成功步骤有 toolId', cs.length && cs.every(function (s) { return !!s.toolId; }));
    ok('B3.2 成功步骤有耗时', cs.length && cs.every(function (s) { return typeof s.durationMs === 'number'; }));
    ok('B3.3 成功步骤有 provenance', cs.length && cs.every(function (s) { return !!s.provenance; }));
    ok('B3.4 Event seq 单调', seqOk(r.state));
    ok('B3.5 TaskState 不在 answer 顶层', !Object.prototype.hasOwnProperty.call(r.answer, 'taskState'));
  });

  await runCase('B4', 'Runner 幂等重试策略', async function () {
    var plan = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.slow', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
    var state = makeState(plan);
    var reg = fakeRegistry([{
      id: 'fake.slow', timeoutMs: 15, idempotent: true, retry: { allowed: true, max: 1 },
      run: function () { return new Promise(function () {}); }
    }]);
    var r = await O.Runner.executeOne(plan.steps[0], state, { registry: reg, ctx: CTX });
    ok('B4.1 幂等超时重试 1 次', state.steps[0].attempt === 2, 'attempt=' + state.steps[0].attempt);
    ok('B4.2 记录 step.retry 事件', state.events.some(function (e) { return e.type === 'step.retry'; }));
    ok('B4.3 最终仍失败且 kind=timeout', r.ok === false && state.steps[0].error.kind === 'timeout');

    var st2 = makeState(plan);
    var reg2 = fakeRegistry([{
      id: 'fake.slow', timeoutMs: 10, idempotent: false, retry: { allowed: false, max: 0 },
      run: function () { return new Promise(function () {}); }
    }]);
    await O.Runner.executeOne(plan.steps[0], st2, { registry: reg2, ctx: CTX });
    ok('B4.4 非幂等不自动重试', st2.steps[0].attempt === 1, 'attempt=' + st2.steps[0].attempt);
    ok('B4.5 Registry 声明 12 工具 + retry', Registry.createDefault({ agentCore: AC, network: false }).list().length === 12 &&
      Registry.SPECS.every(function (s) { return !!s.retry; }));
  });

  await runCase('B5', '取消传播入口', async function () {
    var ac = new AbortController();
    ac.abort();
    var r = await Control.run(Q_TC, CTX, CFG, { signal: ac.signal });
    ok('B5.1 返回 cancelled', r.cancelled === true && r.answer === null, String(r.cancelled));
    ok('B5.2 终态 ABORTED', r.state.phase === 'ABORTED', r.state.phase);
    ok('B5.3 未执行步骤 aborted', r.state.steps.every(function (s) { return s.status === 'aborted'; }),
      r.state.steps.map(function (s) { return s.status; }).join(','));
  });

  await runCase('B6', 'T-A/T-C 旧回答回归', async function () {
    var a = await Control.run(Q_TA, CTX, CFG);
    var b = await Control.run(Q_TC, CTX, CFG);
    ok('B6.1 T-A sections 与旧 buildAnswer 一致',
      canonical(a.answer.sections) === canonical(AC.buildAnswer(Q_TA, CTX, CFG).sections));
    ok('B6.2 T-C sections 与旧 buildAnswer 一致',
      canonical(b.answer.sections) === canonical(AC.buildAnswer(Q_TC, CTX, CFG).sections));
    ok('B6.3 T-C delivery 复用 t1/t2', b.delivery && b.delivery.usedStepIds.indexOf('t1') >= 0 &&
      b.delivery.usedStepIds.indexOf('t2') >= 0, b.delivery && JSON.stringify(b.delivery.usedStepIds));
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
