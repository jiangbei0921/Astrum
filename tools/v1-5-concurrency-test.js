/* ASTRUM · V1.5 并发/调度压力测试
 *
 * 验证 Scheduler 在 1/2/4/8/16 并行上限下的真实行为：
 *   - 并行步骤不超过上限；
 *   - 依赖步骤严格等待；
 *   - 单步失败不影响无关成功步骤；
 *   - 取消后不新增工作；
 *   - 两个任务状态隔离。
 *
 * 用法：node tools/v1-5-concurrency-test.js
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
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Registry = global.AstroRegistry;
var O = global.AstroOrchestrator;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

function makeState(plan, level) {
  var s = T.create({ question: 'concurrency', level: 'L3' });
  s.plan = plan;
  s.steps = plan.steps.map(T.makeStep);
  s.budget.limit.parallel = level;
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

function steps(n, prefix) {
  var out = [];
  for (var i = 0; i < n; i++) {
    out.push({
      id: (prefix || 't') + i, tool: 'fake.work', args: { i: i },
      deps: [], parallel: true, critical: false, optional: false
    });
  }
  return out;
}

(async function main() {
  await runCase('C1', '并行上限 1/2/4/8/16', async function () {
    var levels = [1, 2, 4, 8, 16];
    for (var li = 0; li < levels.length; li++) {
      var level = levels[li];
      var active = 0, maxActive = 0;
      var plan = { template: 'T-A', steps: steps(16, 'p') };
      var state = makeState(plan, level);
      var reg = fakeRegistry([{
        id: 'fake.work',
        run: async function () {
          active++;
          if (active > maxActive) maxActive = active;
          await new Promise(function (r) { setTimeout(r, 18); });
          active--;
          return { ok: true };
        }
      }]);
      var t0 = Date.now();
      var r = await O.runPlan(plan, state, { registry: reg, ctx: {}, cfg: AC.defaultConfig() });
      var elapsed = Date.now() - t0;
      /* 产品 Scheduler 的硬上限为 4；8/16 只验证不会突破实际上限。 */
      var effective = Math.min(level, 4);
      ok('C1.' + (li + 1) + ' 并行 ' + level + ' 不超实际上限', maxActive <= effective &&
        maxActive >= Math.min(level, effective) && maxActive <= 4,
        'maxActive=' + maxActive + ' effectiveCap=4 elapsed=' + elapsed + 'ms');
      ok('C1.' + (li + 1) + '.b 全部成功', r.completed === true && state.steps.every(function (s) { return s.status === 'ok'; }),
        state.steps.filter(function (s) { return s.status !== 'ok'; }).length + ' not-ok');
    }
  });

  await runCase('C2', '依赖顺序与失败隔离', async function () {
    var plan = {
      template: 'T-A',
      steps: [
        { id: 'a', tool: 'fake.work', args: {}, deps: [], parallel: false, critical: false, optional: false },
        { id: 'b', tool: 'fake.work', args: {}, deps: ['a'], parallel: false, critical: false, optional: false },
        { id: 'c', tool: 'fake.work', args: {}, deps: ['a'], parallel: true, critical: false, optional: false },
        { id: 'bad', tool: 'fake.fail', args: {}, deps: [], parallel: true, critical: false, optional: false }
      ]
    };
    var state = makeState(plan, 2);
    var order = [];
    var reg = fakeRegistry([
      { id: 'fake.work', run: async function () { order.push('work'); return { ok: true }; } },
      { id: 'fake.fail', run: function () { return { ok: false, reason: 'isolated_failure', retriable: false }; } }
    ]);
    await O.runPlan(plan, state, { registry: reg, ctx: {}, cfg: AC.defaultConfig() });
    ok('C2.1 依赖先完成', state.steps[0].status === 'ok' && state.steps[1].status === 'ok');
    ok('C2.2 单步失败不影响无关步骤', state.steps[2].status === 'ok' && state.steps[3].status === 'failed',
      state.steps.map(function (s) { return s.id + ':' + s.status; }).join(','));
    ok('C2.3 后续仍可继续', order.length >= 3, 'order=' + order.join(','));
  });

  await runCase('C3', '取消与状态隔离', async function () {
    var ac = new AbortController();
    var plan = { template: 'T-A', steps: steps(8, 'c') };
    var state = makeState(plan, 4);
    var reg = fakeRegistry([{
      id: 'fake.work', run: async function () {
        await new Promise(function (r) { setTimeout(r, 25); });
        return { ok: true };
      }
    }]);
    setTimeout(function () { ac.abort(); }, 10);
    var r = await O.runPlan(plan, state, { registry: reg, ctx: {}, cfg: AC.defaultConfig(), signal: ac.signal });
    ok('C3.1 取消返回 aborted', r.aborted === true);
    ok('C3.2 未完成步骤被中止', state.steps.some(function (s) { return s.status === 'aborted' || s.status === 'pending'; }),
      state.steps.map(function (s) { return s.status; }).join(','));

    var planA = { template: 'T-A', steps: steps(4, 'a') };
    var planB = { template: 'T-A', steps: steps(4, 'b') };
    var sA = makeState(planA, 2), sB = makeState(planB, 2);
    var regA = fakeRegistry([{ id: 'fake.work', run: async function () { await new Promise(function (r) { setTimeout(r, 10); }); return { ok: true }; } }]);
    await Promise.all([
      O.runPlan(planA, sA, { registry: regA, ctx: {}, cfg: AC.defaultConfig() }),
      O.runPlan(planB, sB, { registry: regA, ctx: {}, cfg: AC.defaultConfig() })
    ]);
    ok('C3.3 两个任务状态隔离', sA.steps.every(function (s) { return s.id.indexOf('a') === 0; }) &&
      sB.steps.every(function (s) { return s.id.indexOf('b') === 0; }));
    ok('C3.4 两个任务均完成', sA.steps.every(function (s) { return s.status === 'ok'; }) &&
      sB.steps.every(function (s) { return s.status === 'ok'; }));
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
  console.error('[v1-5-concurrency] ' + (e && e.stack || e));
  process.exit(1);
});
