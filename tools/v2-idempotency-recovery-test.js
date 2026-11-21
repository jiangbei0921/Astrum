/*
 * ASTRUM V2-B3 · 恢复上下文校验与人工确认测试
 * 用法：node tools/v2-idempotency-recovery-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/recovery.js'));

var T = global.AstroTask;
var R = global.AstroRecovery;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function hashOf(v) { return T.sha256Hex(T.canonicalJSON(v)); }
function registry(map) {
  var cache = {};
  return { get: function (id) { if (!(id in cache)) cache[id] = map[id] || null; return cache[id]; } };
}
function mkStep(o) {
  o = o || {};
  var result = o.result === undefined ? { ok: true, value: o.id } : o.result;
  return {
    id: o.id || 's', tool: o.tool || 't', status: o.status || 'ok',
    attempt: o.attempt == null ? 1 : o.attempt,
    inputHash: o.inputHash === undefined ? hashOf({ q: o.id || 's' }) : o.inputHash,
    outputHash: o.outputHash === undefined ? (result == null ? null : hashOf(result)) : o.outputHash,
    result: result,
    skillVersionId: o.skillVersionId || null,
    provenance: o.provenance === undefined ? {
      tool: o.tool || 't', version: o.toolVersion || '1.0.0', at: new Date().toISOString(),
      profileId: o.profileId || 'p1',
      contextHash: o.contextHash === undefined ? hashOf({ q: 'q' }) : o.contextHash
    } : o.provenance,
    error: o.error || null
  };
}
function mkState(steps) {
  var plan = {
    planId: 'p', version: 1,
    steps: steps.map(function (s) { return { id: s.id, tool: s.tool, deps: [], args: { q: s.id } }; })
  };
  var st = T.create({ question: 'q', level: 'L3' });
  st.plan = plan;
  st.steps = steps;
  return st;
}
function ctx(extra) {
  return Object.assign({
    profileId: 'p1', contextHash: hashOf({ q: 'q' }), persisted: true,
    authorized: { allowed: true }
  }, extra || {});
}
function strategyOf(p, id) {
  var hit = p.steps.filter(function (s) { return s.id === id; })[0];
  return hit ? hit.strategy : null;
}
function reasonOf(p, id) {
  var hit = p.steps.filter(function (s) { return s.id === id; })[0];
  return hit ? hit.reason : null;
}

(async function () {
  /* 1. 全部上下文一致 → 复用 */
  var s1 = mkState([mkStep({ id: 'a', tool: 'unknown.tool' })]);
  var p1 = R.plan({ state: s1, registry: registry({}), profileId: 'p1', contextHash: hashOf({ q: 'q' }), persisted: true, authorized: { allowed: true } });
  ok('V2-IR-01 上下文一致允许复用', strategyOf(p1, 'a') === 'reuse', reasonOf(p1, 'a'));

  /* 2. 输入参数变化 → 重跑 */
  var s2 = mkState([mkStep({ id: 'a', tool: 'unknown.tool', inputHash: 'changed' })]);
  var p2 = R.plan({ state: s2, registry: registry({}) });
  ok('V2-IR-02 输入参数变化重跑', strategyOf(p2, 'a') === 'rerun' && reasonOf(p2, 'a') === 'input_changed');

  /* 3. 工具版本变化 → 显式幂等也不复用 */
  var s3 = mkState([mkStep({ id: 'a', tool: 'idem.tool', toolVersion: '1.0.0' })]);
  var p3 = R.plan({ state: s3, registry: registry({ 'idem.tool': { id: 'idem.tool', version: '2.0.0', idempotent: true } }) });
  ok('V2-IR-03 工具版本变化不复用', strategyOf(p3, 'a') === 'rerun' && reasonOf(p3, 'a') === 'tool_version_changed');

  /* 4. Skill 版本变化 → 重跑 */
  var s4 = mkState([mkStep({ id: 'a', tool: 'skill:demo', skillVersionId: 'v1' })]);
  var p4 = R.plan({ state: s4, registry: registry({}), skillVersionId: 'v2' });
  ok('V2-IR-04 Skill 版本变化不复用', strategyOf(p4, 'a') === 'confirm' &&
    reasonOf(p4, 'a') === 'unknown_idempotency_skill_version_changed', reasonOf(p4, 'a'));

  /* 5. Profile 变化 → 重跑 */
  var s5 = mkState([mkStep({ id: 'a', tool: 'unknown.tool', profileId: 'p1' })]);
  var p5 = R.plan({ state: s5, registry: registry({}), profileId: 'p2', contextHash: hashOf({ q: 'q' }), persisted: true });
  ok('V2-IR-05 Profile 变化不复用', strategyOf(p5, 'a') === 'confirm' &&
    reasonOf(p5, 'a') === 'unknown_idempotency_profile_changed', reasonOf(p5, 'a'));

  /* 6. 执行上下文变化 → 重跑 */
  var s6 = mkState([mkStep({ id: 'a', tool: 'unknown.tool', contextHash: hashOf({ q: 'old' }) })]);
  var p6 = R.plan({ state: s6, registry: registry({}), contextHash: hashOf({ q: 'new' }), profileId: 'p1', persisted: true });
  ok('V2-IR-06 执行上下文变化不复用', strategyOf(p6, 'a') === 'confirm' &&
    reasonOf(p6, 'a') === 'unknown_idempotency_context_changed', reasonOf(p6, 'a'));

  /* 7. Principal 重新授权失败 → 人工确认 */
  var s7 = mkState([mkStep({ id: 'a', tool: 'unknown.tool' })]);
  var p7 = R.plan({ state: s7, registry: registry({}), profileId: 'p1', contextHash: hashOf({ q: 'q' }), persisted: true, authorized: { allowed: false, reason: 'SESSION_CHANGED' } });
  ok('V2-IR-07 授权撤销要求人工确认', strategyOf(p7, 'a') === 'confirm' &&
    reasonOf(p7, 'a') === 'unknown_idempotency_authorization_revoked', reasonOf(p7, 'a'));

  /* 8. 结果未持久化 → 人工确认 */
  var s8 = mkState([mkStep({ id: 'a', tool: 'idem.tool' })]);
  var p8 = R.plan({ state: s8, registry: registry({ 'idem.tool': { id: 'idem.tool', version: '1.0.0', idempotent: true } }), persisted: false });
  ok('V2-IR-08 未持久化结果要求人工确认', strategyOf(p8, 'a') === 'confirm' && reasonOf(p8, 'a') === 'result_not_persisted');

  /* 9. 哈希不符 → 人工确认，不覆盖原结果 */
  var s9 = mkState([mkStep({ id: 'a', tool: 'unknown.tool', outputHash: 'deadbeef' })]);
  var before = JSON.stringify(s9.steps[0].result);
  var a9 = R.apply({ state: s9, registry: registry({}), profileId: 'p1', contextHash: hashOf({ q: 'q' }), persisted: true });
  ok('V2-IR-09 哈希不符进入人工确认', a9.applied.confirm.indexOf('a') >= 0 &&
    s9.steps[0].status === 'waiting_approval' && JSON.stringify(s9.steps[0].result) === before);

  /* 10. 有外部副作用且非幂等 → 不自动重跑 */
  var s10 = mkState([mkStep({ id: 'a', tool: 'write.tool' })]);
  var reg10 = registry({ 'write.tool': { id: 'write.tool', version: '1.0.0', idempotent: false, sideEffect: true } });
  var p10 = R.plan({ state: s10, registry: reg10 });
  var a10 = R.apply({ state: s10, registry: reg10 });
  ok('V2-IR-10 有副作用步骤不自动重跑', strategyOf(p10, 'a') === 'confirm' &&
    s10.steps[0].status === 'waiting_approval' && a10.applied.rerun.indexOf('a') < 0);
  ok('V2-IR-11 人工确认错误码可追踪', s10.steps[0].error.kind === 'recovery_confirmation_required' &&
    s10.steps[0].error.message === 'non_idempotent_requires_confirmation');

  /* 11. 外部操作可能已发生但本地崩溃 → 人工确认 */
  var s11 = mkState([mkStep({ id: 'a', tool: 'write.tool', status: 'running', attempt: 2, result: null, outputHash: null })]);
  var p11 = R.plan({ state: s11, registry: reg10 });
  ok('V2-IR-12 崩溃后外部状态未知要求确认', strategyOf(p11, 'a') === 'confirm' && reasonOf(p11, 'a') === 'side_effect_state_unknown');

  /* 12. 外部操作尚未开始（attempt=0）→ 可安全重跑 */
  var s12 = mkState([mkStep({ id: 'a', tool: 'write.tool', status: 'pending', attempt: 0, result: null, outputHash: null })]);
  var p12 = R.plan({ state: s12, registry: reg10 });
  ok('V2-IR-13 未开始的外部操作可重跑', strategyOf(p12, 'a') === 'rerun');

  /* 13. 重复恢复不重置人工确认结果 */
  var result13 = JSON.stringify(s11.steps[0].result);
  R.apply({ state: s11, registry: reg10 });
  ok('V2-IR-14 重复恢复保持等待人工确认', s11.steps[0].status === 'waiting_approval' &&
    JSON.stringify(s11.steps[0].result) === result13);

  /* 14. 结果不完整 → 不复用 */
  var s14 = mkState([mkStep({ id: 'a', tool: 'idem.tool', result: null, outputHash: null })]);
  var p14 = R.plan({ state: s14, registry: registry({ 'idem.tool': { id: 'idem.tool', version: '1.0.0', idempotent: true } }) });
  ok('V2-IR-15 结果不完整不复用', strategyOf(p14, 'a') === 'rerun' && reasonOf(p14, 'a') === 'result_incomplete');

  /* 15. plan 与 apply 对同一状态给出同一策略 */
  var s15 = mkState([mkStep({ id: 'a', tool: 'unknown.tool' })]);
  var opt15 = ctx();
  var pl = R.plan(Object.assign({ state: s15, registry: registry({}) }, opt15));
  var ap = R.apply(Object.assign({ state: s15, registry: registry({}) }, opt15));
  ok('V2-IR-16 plan/apply 策略一致', strategyOf(pl, 'a') === 'reuse' && ap.applied.reuse.indexOf('a') >= 0);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
