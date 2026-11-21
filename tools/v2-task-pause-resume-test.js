/*
 * ASTRUM V2-B2 · 暂停/恢复两阶段语义测试
 * 用法：node tools/v2-task-pause-resume-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/dag-validator.js'));
require(path.join(ROOT, 'core/orchestrator.js'));
require(path.join(ROOT, 'core/control.js'));

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var C = global.AstroControl;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitFor(fn, ms) {
  var end = Date.now() + (ms || 1500);
  while (Date.now() < end) { if (fn()) return true; await wait(5); }
  return false;
}

/* 可注入失败的内存 Store（仅实现 Control 需要的接口）。 */
function memStore(opts) {
  opts = opts || {};
  var recs = {};
  var failOnce = false;
  var api = {
    failNext: function () { failOnce = true; },
    ownerProfileId: function () { return null; },
    get: async function (id) { return recs[id] ? T.fromJSON(recs[id].state) : null; },
    getRecord: async function (id) { return recs[id] || null; },
    isResumable: function (st) {
      return !!st && st.phase === 'EXECUTE' && (st.steps || []).some(function (s) {
        return s.status === 'pending' || s.status === 'running' || s.status === 'paused';
      });
    },
    save: async function (state, sopts) {
      if (failOnce) {
        failOnce = false;
        var e = new Error('injected tx abort');
        e.code = 'PERSIST_TX_FAILED';
        throw e;
      }
      var prev = recs[state.id];
      if (sopts && sopts.expectedRevision != null) {
        var cur = prev ? prev.revision : 0;
        if (cur !== sopts.expectedRevision) {
          var se = new Error('stale'); se.code = 'STALE_WRITE'; throw se;
        }
      }
      recs[state.id] = {
        id: state.id, ownerProfileId: null, projectId: state.projectId || null,
        revision: (prev ? prev.revision : 0) + 1,
        updatedAt: new Date().toISOString(),
        state: T.toJSON(state)
      };
      return state.id;
    },
    raw: function (id) { return recs[id]; }
  };
  return api;
}
function mkPlanState() {
  var plan = {
    planId: 'p', version: 1,
    steps: [
      { id: 's1', tool: 'fast', deps: [], args: {} },
      { id: 's2', tool: 'slow', deps: ['s1'], args: {} },
      { id: 's3', tool: 'fast', deps: ['s2'], args: {} }
    ]
  };
  var st = T.create({ question: 'pause', phase: 'EXECUTE', level: 'L3' });
  st.plan = plan;
  st.steps = plan.steps.map(T.makeStep);
  return st;
}
function regOf(calls, abortable) {
  return {
    get: function (id) {
      if (id === 'slow') {
        return {
          id: id, version: '1', timeoutMs: 5000, idempotent: true, abortable: abortable !== false,
          run: function (a, c, sp, cf, d, rt) {
            calls.slow += 1;
            return new Promise(function (resolve) {
              if (rt && rt.signal && rt.signal.addEventListener) {
                rt.signal.addEventListener('abort', function () {
                  resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
                });
              }
            });
          }
        };
      }
      return { id: id, version: '1', timeoutMs: 100, idempotent: true, run: function () { calls.fast += 1; return { ok: true, v: calls.fast }; } };
    }
  };
}

(async function () {
  /* 1. Orchestrator：PAUSE_REQUESTED 后不再分发新步骤 */
  var st1 = mkPlanState();
  st1.pauseRequestedAt = new Date().toISOString();
  var calls1 = { fast: 0, slow: 0 };
  var r1 = await O.runPlan(st1.plan, st1, { registry: regOf(calls1) });
  ok('V2-PR-01 暂停请求直接返回 PAUSE_REQUESTED',
    r1.paused === true && r1.pauseRequested === true && r1.reason === 'PAUSE_REQUESTED');
  ok('V2-PR-02 暂停请求不启动任何工具', calls1.fast === 0 && calls1.slow === 0);

  /* 2. 在飞暂停：当前步骤回队，后续步骤不启动 */
  var st2 = mkPlanState();
  var calls2 = { fast: 0, slow: 0 };
  var ctl2 = new AbortController();
  var run2 = O.runPlan(st2.plan, st2, { registry: regOf(calls2), signal: ctl2.signal });
  await waitFor(function () { return calls2.slow >= 1; });
  st2.pauseRequestedAt = new Date().toISOString();
  ctl2.abort('pause');
  var r2 = await run2;
  var by2 = {};
  st2.steps.forEach(function (s) { by2[s.id] = s; });
  ok('V2-PR-03 在飞暂停返回 PAUSED', r2.paused === true && r2.reason === 'PAUSED');
  ok('V2-PR-04 已完成步骤保持 ok', by2.s1.status === 'ok');
  ok('V2-PR-05 在飞步骤回到 pending', by2.s2.status === 'pending' && by2.s2.abort.code === 'PAUSE_REQUESTED');
  ok('V2-PR-06 未启动后续步骤', by2.s3.status === 'pending' && calls2.fast === 1);
  ok('V2-PR-07 暂停不产生 failed 步骤', st2.steps.every(function (s) { return s.status !== 'failed'; }));

  /* 3. 不可中断工具：执行到安全边界后再暂停，不提前标记 */
  var st3 = mkPlanState();
  var calls3 = { fast: 0, slow: 0 };
  var release = null;
  var reg3 = regOf(calls3, false);
  var cache3 = {};
  var baseGet3 = reg3.get;
  reg3.get = function (id) { if (!cache3[id]) cache3[id] = baseGet3(id); return cache3[id]; };
  var slowSpec = reg3.get('slow');
  slowSpec.run = function () {
    calls3.slow += 1;
    return new Promise(function (resolve) { release = function () { resolve({ ok: true, done: true }); }; });
  };
  var ctl3 = new AbortController();
  var run3 = O.runPlan(st3.plan, st3, { registry: reg3, signal: ctl3.signal });
  await waitFor(function () { return calls3.slow >= 1; });
  st3.pauseRequestedAt = new Date().toISOString();
  ctl3.abort('pause');
  await wait(20);
  var early = st3.steps.filter(function (s) { return s.id === 's2'; })[0];
  var earlyPending = early.status === 'running';
  release();
  var r3 = await run3;
  ok('V2-PR-08 不可中断步骤先执行到安全边界', earlyPending && early.status === 'ok');
  ok('V2-PR-09 安全边界后才确认暂停', r3.paused === true && calls3.fast === 1);

  /* 4. 并行步骤暂停：全部回队且后续不启动 */
  var st4 = T.create({ question: 'parallel', phase: 'EXECUTE', level: 'L3' });
  var plan4 = {
    planId: 'p4', version: 1, steps: [
      { id: 'a', tool: 'slow', deps: [], args: {}, parallel: true },
      { id: 'b', tool: 'slow', deps: [], args: {}, parallel: true },
      { id: 'c', tool: 'fast', deps: ['a', 'b'], args: {} }
    ]
  };
  st4.plan = plan4;
  st4.steps = plan4.steps.map(T.makeStep);
  var calls4 = { fast: 0, slow: 0 };
  var ctl4 = new AbortController();
  var run4 = O.runPlan(plan4, st4, { registry: regOf(calls4), signal: ctl4.signal });
  await waitFor(function () { return calls4.slow >= 2; });
  ctl4.abort('pause');
  await run4;
  ok('V2-PR-10 并行步骤全部回队', st4.steps[0].status === 'pending' && st4.steps[1].status === 'pending');
  ok('V2-PR-11 并行暂停后不启动下游', st4.steps[2].status === 'pending' && calls4.fast === 0);

  /* 5. Control.pause：空闲任务两阶段持久化 */
  var store5 = memStore();
  var st5 = mkPlanState();
  await store5.save(st5);
  var p5 = await C.pause(st5.id, { store: store5 });
  var rec5 = store5.raw(st5.id);
  var saved5 = rec5 ? T.fromJSON(rec5.state) : null;
  ok('V2-PR-12 空闲暂停确认 PAUSED 并持久化', p5.verdict === 'PAUSED' && p5.paused === true &&
    saved5 && saved5.pausedAt && !saved5.pauseRequestedAt);
  ok('V2-PR-13 暂停事件与请求事件同时存在',
    saved5.events.some(function (e) { return e.type === 'task.pause_requested'; }) &&
    saved5.events.some(function (e) { return e.type === 'task.paused'; }));

  /* 6. 重复暂停幂等 */
  var p6 = await C.pause(st5.id, { store: store5 });
  ok('V2-PR-14 重复暂停返回 already', p6.verdict === 'PAUSED' && p6.already === true);

  /* 7. 持久化失败不得伪造 PAUSED */
  var store7 = memStore();
  var st7 = mkPlanState();
  await store7.save(st7);
  store7.failNext();
  var p7 = await C.pause(st7.id, { store: store7 });
  ok('V2-PR-15 暂停持久化失败返回 PAUSE_PERSIST_FAILED',
    p7.verdict === 'PAUSE_PERSIST_FAILED' && p7.paused === false && p7.error === 'PERSIST_TX_FAILED');
  ok('V2-PR-16 失败后内存不保留 pausedAt', !p7.state.pausedAt && !!p7.state.pauseRequestedAt);

  /* 8. 刷新后可恢复：持久化状态可重新加载并继续调度 */
  var loaded = await C.load(st5.id, { store: store5 });
  ok('V2-PR-17 刷新后任务可加载且可恢复', !!loaded && loaded.resumable === true &&
    loaded.state.pausedAt && loaded.revision >= 1);
  var resumedState = loaded.state;
  resumedState.pausedAt = null;
  resumedState.pauseRequestedAt = null;
  var calls8 = { fast: 0, slow: 0 };
  var reg8 = regOf(calls8);
  var cache8 = {};
  var baseGet8 = reg8.get;
  reg8.get = function (id) { if (!cache8[id]) cache8[id] = baseGet8(id); return cache8[id]; };
  reg8.get('slow').run = function () { calls8.slow += 1; return { ok: true }; };
  var r8 = await O.runPlan(resumedState.plan, resumedState, { registry: reg8 });
  ok('V2-PR-18 恢复后不重复执行已完成步骤', r8.completed === true && calls8.fast === 2 && calls8.slow === 1);

  /* 9. 取消任务不可通过普通恢复入口重启 */
  var store9 = memStore();
  var st9 = mkPlanState();
  st9.phase = 'ABORTED';
  st9.steps.forEach(function (s) { if (s.status === 'pending') s.status = 'aborted'; });
  await store9.save(st9);
  var l9 = await C.load(st9.id, { store: store9 });
  ok('V2-PR-19 取消任务不可恢复', !!l9 && l9.resumable === false && l9.viewOnly === true);

  /* 10. 暂停与取消同时发生：暂停原因优先，不误记取消 */
  var st10 = mkPlanState();
  var calls10 = { fast: 0, slow: 0 };
  var ctl10 = new AbortController();
  var run10 = O.runPlan(st10.plan, st10, { registry: regOf(calls10), signal: ctl10.signal });
  await waitFor(function () { return calls10.slow >= 1; });
  ctl10.abort('pause');
  ctl10.abort('user');
  var r10 = await run10;
  ok('V2-PR-20 暂停与取消竞争保持暂停语义',
    r10.paused === true && st10.steps[1].status === 'pending' && st10.steps[1].abort.code === 'PAUSE_REQUESTED');

  /* 11. 暂停期间重复点击不启动工具 */
  var st11 = mkPlanState();
  var calls11 = { fast: 0, slow: 0 };
  st11.pauseRequestedAt = new Date().toISOString();
  await O.runPlan(st11.plan, st11, { registry: regOf(calls11) });
  st11.pausedAt = new Date().toISOString();
  await O.runPlan(st11.plan, st11, { registry: regOf(calls11) });
  ok('V2-PR-21 暂停期间重复运行不启动工具', calls11.fast === 0 && calls11.slow === 0);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
