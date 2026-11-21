/**
 * ASTRUM P3 B4 · 调度批次过滤与 TaskExecutor 门面测试
 * 用法：node tools/p3-executor-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
['core/task.js', 'core/dag-validator.js', 'core/orchestrator.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var S = O.Scheduler;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function mk(planSteps) {
  var state = T.create({
    question: 'q', level: 'L3',
    steps: planSteps.map(function (s) { return { id: s.id, tool: s.tool, deps: s.deps || [], args: s.args || {} }; })
  });
  return { plan: { planId: 'p', version: 1, steps: planSteps }, state: state };
}

/* ---------- 并行副作用过滤 ---------- */
var a = mk([
  { id: 't1', tool: 'evidence.search', deps: [], parallel: true, critical: false },
  { id: 't2', tool: 'paper.search', deps: [], parallel: true, critical: false }
]);
var b1 = S.nextBatch(a.plan, a.state, 4);
ok('P3-X1-01 两个检索不同批', b1.steps.length === 1 && b1.parallel === false, JSON.stringify(b1.steps.map(function (s) { return s.id; })));

var b = mk([
  { id: 't1', tool: 'astro.calc', deps: [], parallel: true, critical: false },
  { id: 't2', tool: 'astro.lookup', deps: [], parallel: true, critical: false }
]);
var b2 = S.nextBatch(b.plan, b.state, 4);
ok('P3-X1-02 只读工具可并行', b2.steps.length === 2 && b2.parallel === true);

var c = mk([
  { id: 't1', tool: 'evidence.search', deps: [], parallel: true, critical: false },
  { id: 't2', tool: 'astro.calc', deps: [], parallel: true, critical: false }
]);
ok('P3-X1-03 写证据与只读可同批', S.nextBatch(c.plan, c.state, 4).steps.length === 2);

/* ---------- 暂停与审批 ---------- */
var d = mk([{ id: 't1', tool: 'astro.calc', deps: [], critical: true }]);
d.state.pausedAt = new Date().toISOString();
var pausedRun = null;
O.runPlan(d.plan, d.state, {}).then(function (r) { pausedRun = r; });
/* runPlan 是 async，同步断言放到 then 后统一输出，见文末 */

var e = mk([{ id: 't1', tool: 'astro.calc', deps: [], critical: true }]);
e.state.steps[0].status = 'waiting_approval';
ok('P3-X2-01 识别待审批步骤', S.waitingApprovalStep(e.plan, e.state) === 't1');

/* ---------- 超时 aborts 下游 ---------- */
var g = mk([{ id: 't1', tool: 'slow.tool', deps: [], critical: true }]);
var abortSeen = false;
var slowRegistry = {
  get: function () {
    return {
      id: 'slow.tool', version: 'test', timeoutMs: 20, idempotent: false,
      run: function (args, ctx, spec, cfg, deps, extra) {
        return new Promise(function (resolve) {
          if (extra && extra.signal && extra.signal.addEventListener) {
            extra.signal.addEventListener('abort', function () {
              abortSeen = true;
              resolve({ ok: false, reason: 'aborted', kind: 'cancelled', retriable: false });
            });
          }
        });
      }
    };
  },
  validateArgs: function () { return { ok: true }; },
  checkDeps: function () { return { ok: true }; }
};

/* ---------- TaskExecutor 门面 ---------- */
var f = mk([{ id: 't1', tool: 'astro.calc', deps: [], critical: true }]);
f.state.steps[0].status = 'ok';
O.TaskExecutor.execute(f.plan.steps[0], f.state, {}).then(function (r) {
  ok('P3-X3-01 ok 步骤直接复用', r.ok === true && r.reused === true);
  return O.TaskExecutor.execute(e.plan.steps[0], e.state, {});
}).then(function (r) {
  ok('P3-X3-02 waiting_approval 阻塞', r.ok === false && r.waitingApproval === true);
  return O.TaskExecutor.execute(f.plan.steps[0], d.state, {});
}).then(function (r) {
  ok('P3-X3-03 暂停优先阻塞', r.ok === false && r.paused === true);
  f.state.steps[0].status = 'failed';
  return O.TaskExecutor.execute(f.plan.steps[0], f.state, {});
}).then(function (r) {
  ok('P3-X3-04 非可执行状态拒绝', r.ok === false && r.reason === 'invalid_state');
  return O.TaskExecutor.execute({ id: 'nope', critical: true }, f.state, {});
}).then(function (r) {
  ok('P3-X3-05 缺步骤拒绝', r.ok === false && r.reason === 'step_missing');
  return O.TaskExecutor.execute(g.plan.steps[0], g.state, { registry: slowRegistry });
}).then(function (r) {
  ok('P3-X4-01 超时会 abort 下游请求', abortSeen === true);
  ok('P3-X4-02 超时结果为 timeout', r.ok === false && r.kind === 'timeout', r.kind);
  ok('P3-X2-02 暂停的 runPlan 返回 PAUSED', !!pausedRun && pausedRun.paused === true && pausedRun.reason === 'PAUSED');
  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}).catch(function (err) {
  console.log('FAIL | 异常 | ' + err.message);
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
