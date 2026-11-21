/*
 * ASTRUM V2-B · 跨模块联合测试
 * 覆盖：超时+暂停、暂停+多标签、恢复+幂等、取消+持久化失败
 * 用法：node tools/v2-b-joint-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/dag-validator.js'));
require(path.join(ROOT, 'core/orchestrator.js'));
require(path.join(ROOT, 'core/recovery.js'));
require(path.join(ROOT, 'core/control.js'));

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var R = global.AstroRecovery;
var C = global.AstroControl;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function waitFor(fn, ms) {
  var end = Date.now() + (ms || 2000);
  while (Date.now() < end) { if (fn()) return true; await wait(5); }
  return false;
}
function hashOf(v) { return T.sha256Hex(T.canonicalJSON(v)); }

function memStore(opts) {
  opts = opts || {};
  var recs = {};
  var writes = 0;
  return {
    writes: function () { return writes; },
    get: async function (id) { return recs[id] ? T.fromJSON(recs[id].state) : null; },
    getRecord: async function (id) { return recs[id] || null; },
    isResumable: function () { return true; },
    save: async function (state, sopts) {
      writes += 1;
      if (opts.failAfter && writes > opts.failAfter) {
        var e = new Error('injected persist failure'); e.code = 'PERSIST_TX_FAILED'; throw e;
      }
      var prev = recs[state.id];
      if (sopts && sopts.expectedRevision != null) {
        var cur = prev ? prev.revision : 0;
        if (cur !== sopts.expectedRevision) {
          var se = new Error('stale'); se.code = 'STALE_WRITE'; throw se;
        }
      }
      recs[state.id] = {
        id: state.id, ownerProfileId: null, projectId: null,
        revision: (prev ? prev.revision : 0) + 1,
        updatedAt: new Date().toISOString(), state: T.toJSON(state)
      };
      return state.id;
    },
    raw: function (id) { return recs[id]; }
  };
}

(async function () {
  /* 1. 超时 + 暂停：暂停在超时前到达，任务进入 PAUSED 而非超时失败 */
  var st1 = T.create({ question: 'joint timeout pause', phase: 'EXECUTE', level: 'L3' });
  var plan1 = { planId: 'p', version: 1, steps: [{ id: 's1', tool: 'slow', deps: [], args: {} }] };
  st1.plan = plan1; st1.steps = plan1.steps.map(T.makeStep);
  var ctl1 = new AbortController();
  var r1 = O.runPlan(plan1, st1, {
    signal: ctl1.signal,
    registry: { get: function () { return {
      id: 'slow', version: '1', timeoutMs: 40, idempotent: true, abortable: true,
      run: function (a, c, sp, cf, d, rt) {
        return new Promise(function (resolve) {
          rt.signal.addEventListener('abort', function () {
            resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
          });
        });
      }
    }; } }
  });
  await wait(15);
  st1.pauseRequestedAt = new Date().toISOString();
  ctl1.abort('pause');
  var rr1 = await r1;
  ok('V2-JOINT-01 暂停先于超时到达', rr1.paused === true && st1.steps[0].status === 'pending');
  ok('V2-JOINT-02 不产生超时失败', st1.steps[0].error == null &&
    st1.steps[0].abort.code === 'PAUSE_REQUESTED');

  /* 2. 暂停 + 多标签：一页暂停后另一页基于旧修订恢复必须被拒绝 */
  var store2 = memStore();
  var st2 = T.create({ question: 'joint pause multitab', phase: 'EXECUTE', level: 'L2' });
  var plan2 = { planId: 'p', version: 1, steps: [{ id: 's1', tool: 'fast', deps: [], args: {} }] };
  st2.plan = plan2; st2.steps = plan2.steps.map(T.makeStep);
  await store2.save(st2);
  var rec2 = store2.raw(st2.id);
  var tabA = T.fromJSON(rec2.state);
  tabA.pausedAt = new Date().toISOString();
  await store2.save(tabA, { expectedRevision: 1 });
  var tabB = T.fromJSON(store2.raw(st2.id).state);
  tabB.pausedAt = null;
  var stale2 = null;
  try { await store2.save(tabB, { expectedRevision: 1 }); } catch (e) { stale2 = e; }
  ok('V2-JOINT-03 另一标签页旧修订暂停/恢复被拒绝', stale2 && stale2.code === 'STALE_WRITE');
  tabB = T.fromJSON(store2.raw(st2.id).state);
  tabB.pausedAt = null;
  await store2.save(tabB, { expectedRevision: 2 });
  var rec2b = store2.raw(st2.id);
  ok('V2-JOINT-04 重读后可安全恢复且只有一个终态', rec2b.revision === 3 &&
    !T.fromJSON(rec2b.state).pausedAt);

  /* 3. 恢复 + 幂等：复用已完成结果，有副作用步骤进入人工确认 */
  var st3 = T.create({ question: 'joint resume idem' });
  var plan3 = {
    planId: 'p', version: 1,
    steps: [
      { id: 'a', tool: 'read.tool', deps: [], args: { q: 'a' } },
      { id: 'b', tool: 'write.tool', deps: [], args: { q: 'b' } }
    ]
  };
  st3.plan = plan3; st3.steps = plan3.steps.map(T.makeStep);
  var a3 = st3.steps[0]; var b3 = st3.steps[1];
  a3.status = 'ok'; a3.result = { ok: true, v: 'cached' };
  a3.outputHash = hashOf(a3.result);
  a3.provenance = { tool: 'read.tool', version: '1', at: new Date().toISOString(), profileId: 'p1', contextHash: hashOf({}) };
  b3.status = 'ok'; b3.result = { ok: true, receipt: 'r1' };
  b3.outputHash = hashOf(b3.result);
  b3.provenance = { tool: 'write.tool', version: '1', at: new Date().toISOString(), profileId: 'p1', contextHash: hashOf({}) };
  var reg3 = { get: function (id) {
    if (id === 'read.tool') return { id: id, version: '1', idempotent: true, sideEffect: false };
    if (id === 'write.tool') return { id: id, version: '1', idempotent: false, sideEffect: true };
    return null;
  } };
  var applied3 = R.apply({ state: st3, registry: reg3, profileId: 'p1', contextHash: hashOf({}), persisted: true });
  ok('V2-JOINT-05 恢复复用只读结果', applied3.applied.reuse.indexOf('a') >= 0 && st3.steps[0].result.v === 'cached');
  ok('V2-JOINT-06 有副作用结果不被重跑或覆盖', applied3.applied.rerun.indexOf('b') < 0 &&
    st3.steps[1].status === 'waiting_approval' && st3.steps[1].result.receipt === 'r1');
  var applied3b = R.apply({ state: st3, registry: reg3, profileId: 'p1', contextHash: hashOf({}), persisted: true });
  ok('V2-JOINT-07 重复恢复保持稳定', applied3b.applied.confirm.indexOf('b') >= 0 &&
    st3.steps[1].status === 'waiting_approval');

  /* 4. 取消 + 持久化失败：任务内存为 ABORTED，但不得伪造已保存 */
  var calls4 = { slow: 0 };
  var store4 = memStore({ failAfter: 1 }); /* 初始保存成功，取消落盘失败 */
  var router = { route: function () { return { legacy: false, mode: 'single', level: 'L2', targets: ['M31'] }; } };
  var planner = {
    plan: function () { return { planId: 'pj', version: 1, steps: [{ id: 's1', tool: 'slow', deps: [], args: {} }] }; },
    replan: function () { return null; }, expand: function () { return null; }
  };
  var agentCore = { resolveTargets: function () { return ['M31']; }, detectIntent: function () { return 'lookup'; } };
  global.AstroRouter = router;
  global.AstroPlanner = planner;
  global.AgentCore = agentCore;
  var registry4 = {
    get: function () { return {
      id: 'slow', version: '1', timeoutMs: 5000, idempotent: true, abortable: true,
      run: function (a, c, sp, cf, d, rt) {
        calls4.slow += 1;
        return new Promise(function (resolve) {
          rt.signal.addEventListener('abort', function () {
            resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
          });
        });
      }
    }; },
    list: function () { return []; }
  };
  var ctl4 = new AbortController();
  var run4 = C.run('取消落盘失败', {}, {}, {
    registry: registry4, store: store4, adapter: { deliver: function () { return { text: 'x' }; } },
    signal: ctl4.signal
  });
  await waitFor(function () { return calls4.slow >= 1; });
  ctl4.abort('user');
  var res4 = await run4;
  ok('V2-JOINT-08 取消返回 ABORTED 且标记持久化失败',
    res4.cancelled === true && res4.verdict === 'ABORTED' && res4.persistFailed === true &&
    res4.error === 'PERSIST_TX_FAILED', JSON.stringify({ v: res4.verdict, p: res4.persistFailed, e: res4.error }));
  var persisted4 = store4.raw(res4.state.id);
  ok('V2-JOINT-09 未伪造取消已落盘', persisted4 && persisted4.revision === 1 &&
    T.fromJSON(persisted4.state).phase !== 'ABORTED' && !T.fromJSON(persisted4.state).pausedAt);

  /* 5. 运行中暂停：Control.pause 只发 PAUSE_REQUESTED，运行收尾后确认 PAUSED */
  var calls5 = { slow: 0 };
  var store5 = memStore();
  var registry5 = {
    get: function () { return {
      id: 'slow', version: '1', timeoutMs: 5000, idempotent: true, abortable: true,
      run: function (a, c, sp, cf, d, rt) {
        calls5.slow += 1;
        return new Promise(function (resolve) {
          rt.signal.addEventListener('abort', function () {
            resolve({ ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false });
          });
        });
      }
    }; },
    list: function () { return []; }
  };
  var captured = null;
  var origCreate = T.create;
  T.create = function (input) {
    var s = origCreate(input);
    captured = s;
    return s;
  };
  var run5 = C.run('运行中暂停', {}, {}, {
    registry: registry5, store: store5, adapter: { deliver: function () { return { text: 'x' }; } }
  });
  await waitFor(function () { return calls5.slow >= 1 && captured; });
  var pause5 = await C.pause(captured.id, { store: store5 });
  ok('V2-JOINT-10 运行中暂停先返回 PAUSE_REQUESTED', pause5.verdict === 'PAUSE_REQUESTED' &&
    pause5.paused === false && pause5.pauseRequested === true);
  var res5 = await run5;
  T.create = origCreate;
  var rec5 = store5.raw(res5.state.id);
  var saved5 = rec5 ? T.fromJSON(rec5.state) : null;
  ok('V2-JOINT-11 运行收尾后确认 PAUSED', res5.paused === true && res5.verdict === 'PAUSED');
  ok('V2-JOINT-12 PAUSED 已持久化且步骤回队', saved5 && saved5.pausedAt &&
    saved5.steps[0].status === 'pending' && !saved5.pauseRequestedAt);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
