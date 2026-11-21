/*
 * ASTRUM-004 · 外部调用追踪与恢复测试
 * 覆盖：executionId / idempotencyKey、远端回执持久化、非幂等外部调用复用/确认、UNKNOWN 外部调用。
 * 用法：node tools/v2-external-call-recovery-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/dag-validator.js'));
require(path.join(ROOT, 'core/orchestrator.js'));
require(path.join(ROOT, 'core/recovery.js'));

var T = global.AstroTask;
var O = global.AstroOrchestrator;
var R = global.AstroRecovery;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function hashOf(v) { return T.sha256Hex(T.canonicalJSON(v)); }
function mkPlan() {
  return { planId: 'p', version: 1, steps: [{ id: 'w', tool: 'ext.write', deps: [], args: { target: 'M31' } }] };
}
function mkState() {
  var st = T.create({ question: 'external call', phase: 'EXECUTE', level: 'L3' });
  st.plan = mkPlan();
  st.steps = st.plan.steps.map(T.makeStep);
  return st;
}
function regOf(run, extra) {
  var spec = Object.assign({
    id: 'ext.write', version: '2.1.0', timeoutMs: 1000,
    idempotent: false, sideEffect: true, abortable: true, run: run
  }, extra || {});
  return { get: function (id) { return id === 'ext.write' ? spec : null; } };
}
function baseStep(over) {
  var result = over.result === undefined ? { ok: true, receipt: 'rcpt-1', externalState: 'succeeded' } : over.result;
  return Object.assign({
    id: 'w', tool: 'ext.write', status: 'ok', attempt: 1,
    inputHash: hashOf({ target: 'M31' }),
    outputHash: result == null ? null : hashOf(result),
    result: result,
    provenance: {
      tool: 'ext.write', version: '2.1.0', at: new Date().toISOString(),
      executionId: 'exec-1', idempotencyKey: 'idem-1',
      receipt: 'rcpt-1', externalState: 'succeeded'
    }
  }, over);
}
function stateFor(step) {
  var st = T.create({ question: 'ext recovery', level: 'L3' });
  st.plan = mkPlan();
  st.steps = [step];
  return st;
}
var CTX = {
  profileId: 'p1', contextHash: hashOf({}), persisted: true,
  authorized: { allowed: true }
};

(async function () {
  /* 1. 执行器生成稳定幂等键与唯一执行 ID，并持久化回执 */
  var seen = [];
  var st1 = mkState();
  var reg1 = regOf(function (args, ctx, spec, cfg, deps, rt) {
    seen.push({ id: rt.executionId, key: rt.idempotencyKey });
    return { ok: true, receipt: 'remote-42', externalState: 'succeeded', value: 1 };
  });
  var r1 = await O.runPlan(st1.plan, st1, { registry: reg1 });
  var p1 = st1.steps[0].provenance;
  ok('V2-EXT-01 外部工具收到 executionId/idempotencyKey',
    r1.completed === true && seen.length === 1 && !!seen[0].id && /^[0-9a-f]{64}$/.test(seen[0].key));
  ok('V2-EXT-02 回执与远端状态持久化到 provenance',
    p1.receipt === 'remote-42' && p1.externalState === 'succeeded' &&
    p1.executionId === seen[0].id && p1.idempotencyKey === seen[0].key);

  /* 2. 重试复用同一幂等键，但执行 ID 不同 */
  var retrySeen = [];
  var st2 = mkState();
  var tries = 0;
  var reg2 = regOf(function (args, ctx, spec, cfg, deps, rt) {
    tries += 1;
    retrySeen.push({ id: rt.executionId, key: rt.idempotencyKey });
    if (tries === 1) return { ok: false, reason: 'temporary network', kind: 'network', retriable: true };
    return { ok: true, receipt: 'remote-43', externalState: 'succeeded' };
  }, { idempotent: true, retry: { allowed: true, max: 1 } });
  await O.runPlan(st2.plan, st2, { registry: reg2 });
  ok('V2-EXT-03 重试使用同一幂等键', retrySeen.length === 2 &&
    retrySeen[0].key === retrySeen[1].key);
  ok('V2-EXT-04 每次尝试 executionId 唯一', retrySeen[0].id !== retrySeen[1].id);

  /* 3. 非幂等外部调用：远端明确成功 → 复用，不重复执行 */
  var st3 = stateFor(baseStep({}));
  var p3 = R.plan(Object.assign({ state: st3, registry: regOf(function () {}) }, CTX));
  ok('V2-EXT-05 远端确认成功时复用结果', p3.steps[0].strategy === 'reuse' &&
    p3.steps[0].reason === 'external_confirmed', p3.steps[0].reason);

  /* 4. 非幂等外部调用：远端明确失败 → 允许重跑 */
  var st4 = stateFor(baseStep({
    result: { ok: false, externalState: 'failed' }, outputHash: null,
    provenance: {
      tool: 'ext.write', version: '2.1.0', at: new Date().toISOString(),
      externalState: 'failed'
    }
  }));
  var p4 = R.plan(Object.assign({ state: st4, registry: regOf(function () {}) }, CTX));
  ok('V2-EXT-06 远端明确失败时重跑', p4.steps[0].strategy === 'rerun' &&
    p4.steps[0].reason === 'external_failed', p4.steps[0].reason);

  /* 5. 非幂等外部调用：没有回执/远端状态 → 人工确认 */
  var st5 = stateFor(baseStep({
    result: { ok: true, value: 1 }, outputHash: hashOf({ ok: true, value: 1 }),
    provenance: { tool: 'ext.write', version: '2.1.0', at: new Date().toISOString() }
  }));
  var p5 = R.plan(Object.assign({ state: st5, registry: regOf(function () {}) }, CTX));
  ok('V2-EXT-07 无回执的非幂等外部调用要求确认', p5.steps[0].strategy === 'confirm' &&
    p5.steps[0].reason === 'non_idempotent_requires_confirmation', p5.steps[0].reason);

  /* 6. UNKNOWN 外部工具：哈希有效但无回执 → 不盲目复用 */
  var unknownResult = { ok: true, value: 7 };
  var st6 = stateFor(baseStep({
    tool: 'unknown.write',
    result: unknownResult,
    outputHash: hashOf(unknownResult),
    provenance: { tool: 'unknown.write', version: '1.0.0', at: new Date().toISOString() }
  }));
  var reg6 = { get: function () { return { id: 'unknown.write', version: '1.0.0', sideEffect: true }; } };
  var p6 = R.plan(Object.assign({ state: st6, registry: reg6 }, CTX));
  ok('V2-EXT-08 未知外部工具无回执要求确认', p6.steps[0].strategy === 'confirm' &&
    p6.steps[0].reason === 'external_receipt_unverified', p6.steps[0].reason);

  /* 7. UNKNOWN 外部工具：带回执 → 复用 */
  var st7 = stateFor(baseStep({
    tool: 'unknown.write',
    result: unknownResult,
    outputHash: hashOf(unknownResult),
    provenance: {
      tool: 'unknown.write', version: '1.0.0', at: new Date().toISOString(),
      receipt: 'rcpt-u', externalState: 'succeeded'
    }
  }));
  var p7 = R.plan(Object.assign({ state: st7, registry: reg6 }, CTX));
  ok('V2-EXT-09 未知外部工具有回执可复用', p7.steps[0].strategy === 'reuse' &&
    p7.steps[0].reason === 'unknown_idempotent_verified', p7.steps[0].reason);

  /* 8. 明确幂等外部工具：远端失败仍不得复用 */
  var st8 = stateFor(baseStep({
    result: { ok: true, externalState: 'failed' },
    outputHash: hashOf({ ok: true, externalState: 'failed' }),
    provenance: {
      tool: 'ext.write', version: '2.1.0', at: new Date().toISOString(),
      externalState: 'failed'
    }
  }));
  var reg8 = regOf(function () {}, { idempotent: true });
  var p8 = R.plan(Object.assign({ state: st8, registry: reg8 }, CTX));
  ok('V2-EXT-10 幂等外部工具远端失败不复用', p8.steps[0].strategy === 'confirm' &&
    p8.steps[0].reason === 'external_failed_unverified', p8.steps[0].reason);

  /* 9. 外部直接调用 decide 也不能绕过回执校验 */
  var direct = R.decide(st6, st6.steps[0], reg6, Date.now(), CTX);
  ok('V2-EXT-11 直接 decide 同样要求回执', direct.strategy === 'confirm' &&
    direct.reason === 'external_receipt_unverified', direct.reason);

  /* 10. 无副作用工具不受影响 */
  var localResult = { ok: true, value: 2 };
  var st10 = stateFor(baseStep({
    tool: 'kb.lookup',
    result: localResult,
    outputHash: hashOf(localResult),
    provenance: { tool: 'kb.lookup', version: '1.0.0', at: new Date().toISOString() }
  }));
  var reg10 = { get: function () { return { id: 'kb.lookup', version: '1.0.0', idempotent: true, sideEffect: false }; } };
  var p10 = R.plan({ state: st10, registry: reg10 });
  ok('V2-EXT-12 无副作用工具复用不受回执约束', p10.steps[0].strategy === 'reuse');

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
