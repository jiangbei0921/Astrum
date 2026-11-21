/**
 * ASTRUM P3 B1 · TaskState 契约增补测试
 * 用法：node tools/p3-contract-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));

var T = global.AstroTask;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

/* T1 状态枚举 */
ok('P3-T1-01 STEP_STATUS 含 paused', T.STEP_STATUS.indexOf('paused') >= 0);
ok('P3-T1-02 STEP_STATUS 含 waiting_approval', T.STEP_STATUS.indexOf('waiting_approval') >= 0);

/* T2 预算档位 */
ok('P3-T2-01 L1 不允许恢复', T.BUDGET_LIMITS.L1.recoveries === 0, T.BUDGET_LIMITS.L1.recoveries);
ok('P3-T2-02 L2 允许 1 次恢复', T.BUDGET_LIMITS.L2.recoveries === 1);
ok('P3-T2-03 L3 允许 1 次恢复（P4/D-1）', T.BUDGET_LIMITS.L3.recoveries === 1, T.BUDGET_LIMITS.L3.recoveries);

/* T3 新增字段往返 */
var st = T.create({
  id: 'tsk_p3_1',
  level: 'L3',
  question: 'JWST 最新系外行星大气结果',
  goal: { goalId: 'g1', title: 'x' },
  pausedAt: '2026-11-21T00:00:00.000Z',
  recoveries: 2,
  planHistory: [{ planId: 'p0', version: 1 }],
  steps: [{ id: 't1', tool: 'evidence.search', deps: [], args: { query: 'x' } }]
});
ok('P3-T3-01 goal 保留', st.goal && st.goal.goalId === 'g1');
ok('P3-T3-02 pausedAt 保留', st.pausedAt === '2026-11-21T00:00:00.000Z');
ok('P3-T3-03 recoveries 保留', st.recoveries === 2);
ok('P3-T3-04 planHistory 保留', st.planHistory.length === 1);
ok('P3-T3-05 预算补齐 recoveries', st.budget.limit.recoveries === 1 && st.budget.used.recoveries === 0);
var round = T.fromJSON(T.toJSON(st));
ok('P3-T3-06 往返一致', round.goal.goalId === 'g1' && round.recoveries === 2 && round.planHistory.length === 1);

/* T4 旧任务兼容：缺少 recoveries 仍可加载 */
var legacy = JSON.parse(T.toJSON(st));
delete legacy.budget.limit.recoveries;
delete legacy.budget.used.recoveries;
delete legacy.recoveries;
delete legacy.goal;
delete legacy.pausedAt;
delete legacy.planHistory;
var okLegacy = true, legacyErr = '';
try { legacy = T.fromJSON(legacy); } catch (e) { okLegacy = false; legacyErr = e.message; }
ok('P3-T4-01 旧任务可加载', okLegacy, legacyErr);
ok('P3-T4-02 旧任务补齐默认值', legacy.recoveries === 0 && legacy.budget.limit.recoveries === 1);

/* T5 步骤可选语义字段 */
ok('P3-T5-01 步骤 kind/agentId 保留', st.steps[0].kind === '' && st.steps[0].agentId === '');
var st2 = T.create({ steps: [{ id: 's1', kind: 'skill', skillId: 'skl_1', title: '核验', criteria: ['c1'], requiredCaps: ['tool.calculate'], agentId: 'critic' }] });
ok('P3-T5-02 skill 步骤字段保留',
  st2.steps[0].kind === 'skill' && st2.steps[0].skillId === 'skl_1' &&
  st2.steps[0].criteria.length === 1 && st2.steps[0].agentId === 'critic');

/* T6 检查点增量字段 */
st.plan = { planId: 'pln_1', version: 2, steps: [] };
st.steps[0].status = 'ok';
st.steps[0].outputHash = 'h1';
st.pausedAt = null;
var cp = T.addCheckpoint(st, { stepId: 't1' });
ok('P3-T6-01 planId/planVersion', cp.planId === 'pln_1' && cp.planVersion === 2);
ok('P3-T6-02 completed/pending', cp.completedStepIds[0] === 't1' && cp.pendingStepIds.length === 0);
ok('P3-T6-03 inputs/outputs', cp.inputs.length === 1 && cp.outputs[0].outputHash === 'h1');
ok('P3-T6-04 recoveries', cp.recoveries === 2 && cp.paused === false);

/* T7 事件 */
var evtOk = true, evtErr = '';
try {
  T.appendEvent(st, 'task.paused', { reason: 'user' });
  T.appendEvent(st, 'task.waiting_approval', { reason: 'critical_claim' });
} catch (e) { evtOk = false; evtErr = e.message; }
ok('P3-T7-01 新事件类型可用', evtOk, evtErr);

/* T8 非法类型仍拒绝 */
var bad = true;
try { T.appendEvent(st, 'task.unknown', {}); } catch (e) { bad = false; }
ok('P3-T8-01 未知事件仍拒绝', bad === false);
var badGoal = true;
try { T.validate(T.create({ goal: 'not-object' })); } catch (e) { badGoal = false; }
ok('P3-T8-02 非法 goal 被拒绝', badGoal === false);

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
