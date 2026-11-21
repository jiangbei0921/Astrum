/*
 * ASTRUM V2-B1 · 超时与取消信号贯穿测试
 * 用法：node tools/v2-timeout-abort-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/dag-validator.js'));
require(path.join(ROOT, 'core/orchestrator.js'));

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function mkState() {
  return T.create({ question: 'timeout', level: 'L3' });
}
function planWith(steps) {
  return { planId: 'p', version: 1, steps: steps };
}
function reg(map) {
  return { get: function (id) { return map[id] || null; } };
}

(async function () {
  var unhandled = [];
  process.on('unhandledRejection', function (e) { unhandled.push(e); });

  /* 1. 正常请求在超时前完成 */
  var s1 = mkState();
  var p1 = planWith([{ id: 'a', tool: 'fast', deps: [], args: {} }]);
  s1.steps = p1.steps.map(T.makeStep);
  var r1 = await O.runPlan(p1, s1, {
    registry: reg({ fast: { id: 'fast', version: '1', timeoutMs: 200, idempotent: true, run: function () { return Promise.resolve({ ok: true, value: 1 }); } } })
  });
  ok('V2-ABORT-01 正常请求完成', r1.completed === true && s1.steps[0].status === 'ok');
  ok('V2-ABORT-02 完成步骤不写 abort 记录', s1.steps[0].abort == null);

  /* 2. 超时真正中止支持取消的下游请求 */
  var seen = { abort: false, cleanup: false, signal: null };
  var s2 = mkState();
  var p2 = planWith([{ id: 'slow', tool: 'slow', deps: [], args: {} }]);
  s2.steps = p2.steps.map(T.makeStep);
  var r2 = await O.runPlan(p2, s2, {
    registry: reg({
      slow: {
        id: 'slow', version: '1', timeoutMs: 25, idempotent: false, abortable: true,
        run: function (args, ctx, spec, cfg, deps, rt) {
          seen.signal = rt && rt.signal;
          return new Promise(function (resolve) {
            if (rt && rt.signal) {
              rt.signal.addEventListener('abort', function () {
                seen.abort = true;
                seen.cleanup = true;
                resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
              });
            }
          });
        }
      }
    })
  });
  var st2 = s2.steps[0];
  ok('V2-ABORT-03 超时后下游收到 abort', seen.abort === true && seen.cleanup === true);
  ok('V2-ABORT-04 超时错误可识别', st2.status === 'failed' && st2.error.errorName === 'TimeoutError' &&
    st2.error.abortCode === 'TIMEOUT');
  ok('V2-ABORT-05 记录 abort_requested/supported/confirmed',
    st2.abort && st2.abort.requested === true && st2.abort.supported === true && st2.abort.confirmed === true);
  ok('V2-ABORT-06 runPlan 未把超时步骤视为成功', r2.ok === false && st2.status === 'failed');

  /* 3. 用户取消与超时区分 */
  var s3 = mkState();
  var p3 = planWith([{ id: 'slow', tool: 'slow', deps: [], args: {} }]);
  s3.steps = p3.steps.map(T.makeStep);
  var ctl = new AbortController();
  var run3 = O.runPlan(p3, s3, {
    signal: ctl.signal,
    registry: reg({
      slow: {
        id: 'slow', version: '1', timeoutMs: 5000, idempotent: false, abortable: true,
        run: function (args, ctx, spec, cfg, deps, rt) {
          return new Promise(function (resolve) {
            rt.signal.addEventListener('abort', function () {
              resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
            });
          });
        }
      }
    })
  });
  setTimeout(function () { ctl.abort('user'); }, 15);
  var r3 = await run3;
  ok('V2-ABORT-07 用户取消返回 aborted', r3.aborted === true && r3.paused !== true);
  ok('V2-ABORT-08 用户取消错误名与超时不同',
    s3.steps[0].error.errorName === 'UserCancelled' && s3.steps[0].error.abortCode === 'USER_CANCELLED');

  /* 4. 超时后不启动依赖的下一步 */
  var calls4 = { next: 0 };
  var s4 = mkState();
  var p4 = planWith([
    { id: 'a', tool: 'slow', deps: [], args: {} },
    { id: 'b', tool: 'next', deps: ['a'], args: {} }
  ]);
  s4.steps = p4.steps.map(T.makeStep);
  await O.runPlan(p4, s4, {
    registry: reg({
      slow: { id: 'slow', version: '1', timeoutMs: 20, idempotent: false, abortable: true, run: function (a, c, sp, cf, d, rt) { return new Promise(function () { if (rt.signal) rt.signal.addEventListener('abort', function () {}); }); } },
      next: { id: 'next', version: '1', timeoutMs: 100, idempotent: true, run: function () { calls4.next += 1; return { ok: true }; } }
    })
  });
  ok('V2-ABORT-09 超时后不启动后续依赖步骤', calls4.next === 0 &&
    s4.steps.filter(function (s) { return s.id === 'b'; })[0].status !== 'ok');

  /* 5. 并行步骤全部收到取消 */
  var hits = { a: false, b: false };
  function slowNamed(name) {
    return {
      id: name, version: '1', timeoutMs: 5000, idempotent: false, abortable: true,
      run: function (a, c, sp, cf, d, rt) {
        return new Promise(function (resolve) {
          rt.signal.addEventListener('abort', function () { hits[name] = true; resolve({ ok: false, kind: 'cancelled', reason: 'cancelled', retriable: false }); });
        });
      }
    };
  }
  var s5 = mkState();
  var p5 = planWith([
    { id: 'a', tool: 'pa', deps: [], args: {}, parallel: true },
    { id: 'b', tool: 'pb', deps: [], args: {}, parallel: true }
  ]);
  s5.steps = p5.steps.map(T.makeStep);
  var ctl5 = new AbortController();
  var run5 = O.runPlan(p5, s5, { signal: ctl5.signal, registry: reg({ pa: slowNamed('a'), pb: slowNamed('b') }) });
  setTimeout(function () { ctl5.abort('user'); }, 15);
  await run5;
  ok('V2-ABORT-10 并行步骤都收到取消', hits.a && hits.b &&
    s5.steps.every(function (s) { return s.status === 'aborted'; }));

  /* 6. 重复取消不产生状态异常 */
  var s6 = mkState();
  var p6 = planWith([{ id: 'a', tool: 'slow', deps: [], args: {} }]);
  s6.steps = p6.steps.map(T.makeStep);
  var ctl6 = new AbortController();
  var run6 = O.runPlan(p6, s6, { signal: ctl6.signal, registry: reg({ slow: slowNamed('a') }) });
  setTimeout(function () { ctl6.abort('user'); ctl6.abort('pause'); }, 10);
  await run6;
  ok('V2-ABORT-11 重复取消状态稳定', s6.steps[0].status === 'aborted' && !s6.steps[0].result);

  /* 7. 已完成步骤不被误标记 */
  var s7 = mkState();
  var p7 = planWith([
    { id: 'a', tool: 'fast', deps: [], args: {} },
    { id: 'b', tool: 'slow', deps: ['a'], args: {} }
  ]);
  s7.steps = p7.steps.map(T.makeStep);
  var ctl7 = new AbortController();
  var run7 = O.runPlan(p7, s7, {
    signal: ctl7.signal,
    registry: reg({
      fast: { id: 'fast', version: '1', timeoutMs: 100, idempotent: true, run: function () { return { ok: true, value: 1 }; } },
      slow: slowNamed('b')
    })
  });
  setTimeout(function () { ctl7.abort('user'); }, 20);
  await run7;
  var a7 = s7.steps.filter(function (s) { return s.id === 'a'; })[0];
  ok('V2-ABORT-12 已完成步骤保持 ok 且无 abort 记录', a7.status === 'ok' && a7.abort == null);

  /* 8. 不支持取消的工具不得伪造 confirmed */
  var s8 = mkState();
  var p8 = planWith([{ id: 'a', tool: 'sync', deps: [], args: {} }]);
  s8.steps = p8.steps.map(T.makeStep);
  await O.runPlan(p8, s8, {
    registry: reg({
      sync: {
        id: 'sync', version: '1', timeoutMs: 20, idempotent: false, abortable: false,
        run: function () { return new Promise(function () { /* 不响应 signal */ }); }
      }
    })
  });
  ok('V2-ABORT-13 不支持取消的工具标记 ABORT_UNSUPPORTED',
    s8.steps[0].error.abortCode === 'ABORT_UNSUPPORTED' &&
    s8.steps[0].abort.supported === false && s8.steps[0].abort.confirmed === false);

  /* 9. 完成与超时竞态只产生一个结果 */
  var s9 = mkState();
  var p9 = planWith([{ id: 'a', tool: 'race', deps: [], args: {} }]);
  s9.steps = p9.steps.map(T.makeStep);
  await O.runPlan(p9, s9, {
    registry: reg({
      race: { id: 'race', version: '1', timeoutMs: 30, idempotent: true, run: function () { return wait(30).then(function () { return { ok: true, raced: true }; }); } }
    })
  });
  var st9 = s9.steps[0];
  ok('V2-ABORT-14 完成/超时竞态只有单一终态',
    (st9.status === 'ok' && st9.error == null) || (st9.status === 'failed' && st9.error.errorName === 'TimeoutError'));

  /* 10. 用户取消与超时同时发生：只保留一个明确终态 */
  var s10 = mkState();
  var p10 = planWith([{ id: 'a', tool: 'race', deps: [], args: {} }]);
  s10.steps = p10.steps.map(T.makeStep);
  var ctl10 = new AbortController();
  var run10 = O.runPlan(p10, s10, {
    signal: ctl10.signal,
    registry: reg({
      race: {
        id: 'race', version: '1', timeoutMs: 30, idempotent: false, abortable: true,
        run: function (a, c, sp, cf, d, rt) {
          return new Promise(function (resolve) {
            rt.signal.addEventListener('abort', function () {
              resolve({ ok: false, kind: 'cancelled', reason: 'cancelled', retriable: false });
            });
          });
        }
      }
    })
  });
  setTimeout(function () { ctl10.abort('user'); }, 30);
  var r10 = await run10;
  var st10 = s10.steps[0];
  var terminal10 = (st10.status === 'aborted' && st10.error.abortCode === 'USER_CANCELLED') ||
    (st10.status === 'failed' && st10.error.abortCode === 'TIMEOUT');
  ok('V2-ABORT-16 取消与超时竞争只有单一终态', terminal10, JSON.stringify({
    status: st10.status, code: st10.error && st10.error.abortCode
  }));

  /* 11. 上游取消与下游错误同时发生：不产生双终态/未处理 rejection */
  var s11 = mkState();
  var p11 = planWith([{ id: 'a', tool: 'boom', deps: [], args: {} }]);
  s11.steps = p11.steps.map(T.makeStep);
  var ctl11 = new AbortController();
  var run11 = O.runPlan(p11, s11, {
    signal: ctl11.signal,
    registry: reg({
      boom: {
        id: 'boom', version: '1', timeoutMs: 500, idempotent: false, abortable: true,
        run: function (a, c, sp, cf, d, rt) {
          setTimeout(function () { ctl11.abort('upstream'); }, 1);
          return Promise.reject(new Error('downstream failed'));
        }
      }
    })
  });
  var r11 = await run11;
  var st11 = s11.steps[0];
  ok('V2-ABORT-17 上游取消与下游错误只有一个结果',
    (st11.status === 'aborted') || (st11.status === 'failed' && /downstream failed/.test(st11.error.message)));

  await wait(30);
  ok('V2-ABORT-18 无未处理 Promise rejection', unhandled.length === 0, unhandled.length);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
