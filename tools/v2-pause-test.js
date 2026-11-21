/*
 * ASTRUM V2-B2 · 协作式暂停/取消测试
 * 用法：node tools/v2-pause-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
['core/task.js', 'core/dag-validator.js', 'core/orchestrator.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitFor(fn, ms) {
  var end = Date.now() + (ms || 1500);
  while (Date.now() < end) {
    if (fn()) return true;
    await wait(5);
  }
  return false;
}
function mk() {
  return T.create({
    question: 'q', level: 'L3',
    steps: [
      { id: 's1', tool: 'fast.tool', deps: [] },
      { id: 's2', tool: 'slow.tool', deps: ['s1'] },
      { id: 's3', tool: 'fast.tool', deps: ['s2'] }
    ]
  });
}
function registryOf(counters) {
  return {
    get: function (id) {
      if (id === 'slow.tool') {
        return {
          id: id, version: 't', timeoutMs: 5000, idempotent: true,
          run: function (args, ctx, spec, cfg, deps, extra) {
            counters.slow += 1;
            if (counters.slow > 1) return Promise.resolve({ ok: true, result: { slow: counters.slow } });
            return new Promise(function (resolve) {
              if (extra && extra.signal && extra.signal.addEventListener) {
                extra.signal.addEventListener('abort', function () {
                  resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
                });
              }
            });
          }
        };
      }
      return {
        id: id, version: 't', timeoutMs: 1000, idempotent: true,
        run: function () {
          counters.fast += 1;
          return Promise.resolve({ ok: true, result: { fast: counters.fast } });
        }
      };
    }
  };
}

(async function () {
  /* 1. 空闲暂停：pausedAt 已存在，不应启动任何工具 */
  var idle = mk();
  idle.pausedAt = new Date().toISOString();
  var idleCalls = { fast: 0, slow: 0 };
  var idleRun = await O.runPlan({ planId: 'p', version: 1, steps: idle.steps }, idle, {
    registry: registryOf(idleCalls)
  });
  ok('V2-PAUSE-01 空闲暂停直接返回 PAUSED', idleRun.paused === true && idleRun.reason === 'PAUSED');
  ok('V2-PAUSE-02 空闲暂停不启动工具', idleCalls.fast === 0 && idleCalls.slow === 0);

  /* 2. 在飞暂停：s1 完成，s2 被中止并回队，s3 不启动 */
  var st = mk();
  var calls = { fast: 0, slow: 0 };
  var ctl = new AbortController();
  var plan = { planId: 'p', version: 1, steps: [
    { id: 's1', tool: 'fast.tool', deps: [] },
    { id: 's2', tool: 'slow.tool', deps: ['s1'] },
    { id: 's3', tool: 'fast.tool', deps: ['s2'] }
  ] };
  var running = O.runPlan(plan, st, { registry: registryOf(calls), signal: ctl.signal });
  var started = await waitFor(function () { return calls.slow >= 1; });
  ctl.abort('pause');
  var pr = await running;
  var byId = {};
  st.steps.forEach(function (s) { byId[s.id] = s; });
  ok('V2-PAUSE-03 在飞暂停返回 PAUSED', started && pr.paused === true && pr.reason === 'PAUSED');
  ok('V2-PAUSE-04 已完成步骤保持 ok', byId.s1.status === 'ok');
  ok('V2-PAUSE-05 在飞步骤回到 pending', byId.s2.status === 'pending' && !byId.s2.error);
  ok('V2-PAUSE-06 后续步骤未启动', byId.s3.status === 'pending' && calls.fast === 1);
  ok('V2-PAUSE-07 无步骤被标记失败', st.steps.every(function (s) { return s.status !== 'failed'; }));
  ok('V2-PAUSE-08 记录 step.paused 事件',
    st.events.filter(function (e) { return e.type === 'step.paused'; }).length === 1);

  /* 3. 恢复后继续：s2 第二次调用成功，s3 完成，s1 不重复调用 */
  var resumeCtl = new AbortController();
  var rr = await O.runPlan(plan, st, { registry: registryOf(calls), signal: resumeCtl.signal });
  ok('V2-PAUSE-09 恢复后执行完成', rr.completed === true && rr.paused !== true);
  ok('V2-PAUSE-10 恢复不重跑已完成步骤', calls.fast === 2 && byId.s1.status === 'ok');
  ok('V2-PAUSE-11 恢复完成剩余步骤', byId.s2.status === 'ok' && byId.s3.status === 'ok');

  /* 4. 用户取消：仍走 aborted，不冒充分暂停 */
  var cs = mk();
  var cc = { fast: 0, slow: 0 };
  var cancelCtl = new AbortController();
  var cRun = O.runPlan(plan, cs, { registry: registryOf(cc), signal: cancelCtl.signal });
  await waitFor(function () { return cc.slow >= 1; });
  cancelCtl.abort('user');
  var cr = await cRun;
  ok('V2-PAUSE-12 用户取消返回 aborted', cr.aborted === true && cr.paused !== true);
  ok('V2-PAUSE-13 用户取消步骤为 aborted',
    cs.steps.filter(function (s) { return s.id === 's2'; })[0].status === 'aborted');

  /* 5. 已完成任务再次运行不受暂停影响 */
  var done = mk();
  done.steps.forEach(function (s) { s.status = 'ok'; });
  var doneRun = await O.runPlan({ planId: 'p', version: 1, steps: done.steps }, done, {
    registry: registryOf({ fast: 0, slow: 0 })
  });
  ok('V2-PAUSE-14 已完成任务不误报暂停', doneRun.paused !== true && doneRun.completed === true);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.message));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
