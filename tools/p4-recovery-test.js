/* ASTRUM P4 B5 · 恢复前校验分支测试
 * 用法：node tools/p4-recovery-test.js
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
function clone(st) { return T.fromJSON(T.toJSON(st)); }
function codes(res) {
  return (res.errors || []).map(function (e) { return e.code; });
}
function has(res, code) { return codes(res).indexOf(code) >= 0; }

var registry = {
  get: function (tool) {
    var map = {
      'kb.lookup': { id: 'kb.lookup', idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 } },
      'paper.search': { id: 'paper.search', idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 } }
    };
    return map[tool] || null;
  }
};

function makeBase() {
  var st = T.create({ question: '恢复校验', phase: 'EXECUTE', level: 'L2', projectId: 'prj_1' });
  st.plan = {
    planId: 'plan_r', version: 2, template: 'T-A',
    steps: [
      { id: 's1', tool: 'kb.lookup', deps: [], args: {} },
      { id: 's2', tool: 'paper.search', deps: ['s1'], args: {} }
    ]
  };
  st.steps = st.plan.steps.map(T.makeStep);
  st.steps[0].status = 'ok';
  st.steps[0].outputHash = T.sha256Hex('r1');
  st.steps[0].result = { ok: true };
  T.appendEvent(st, 'step.ok', {}, 's1');
  var cp = T.addCheckpoint(st, { taskStatus: 'EXECUTE' });
  var cpRec = {};
  Object.keys(cp).forEach(function (k) { cpRec[k] = cp[k]; });
  cpRec.taskId = st.id;
  cpRec.ownerProfileId = 'u1';
  cpRec.eventsUpToSeq = 1;
  var record = { id: st.id, ownerProfileId: 'u1', projectId: 'prj_1', revision: 1 };
  return { st: st, cp: cpRec, record: record };
}

function run(base, extra) {
  var input = Object.assign({
    state: base.st,
    record: base.record,
    checkpoint: base.cp,
    principal: { profileId: 'u1', agentId: 'muse' },
    enforcePrincipal: true,
    project: { projectId: 'prj_1', status: 'active' },
    registry: registry,
    limit: 1
  }, extra || {});
  return R.validate(input);
}

/* 1 正常 */
var base = makeBase();
var okRes = run(base);
ok('P4R-01 合法任务通过校验', okRes.ok === true && okRes.errors.length === 0, JSON.stringify(okRes.errors));

/* 2 schema */
var bad = makeBase(); bad.st.schemaVersion = 0;
ok('P4R-02 schema 不兼容', has(run(bad), 'SCHEMA_INCOMPATIBLE'));

/* 3 身份 */
var b3 = makeBase();
ok('P4R-03 缺少 principal', has(run(b3, { principal: null }), 'NO_PRINCIPAL'));
ok('P4R-04 档案不匹配', has(run(b3, { principal: { profileId: 'u2' } }), 'PROFILE_MISMATCH'));
global.Security = { ensureSession: function () { return { allowed: false }; } };
ok('P4R-05 会话已切换', has(run(makeBase()), 'SESSION_CHANGED'));
delete global.Security;
ok('P4R-06 能力拒绝', has(run(makeBase(), { authorized: { allowed: false, reason: 'POLICY_DENIED' } }), 'POLICY_DENIED'));

/* 4 项目 */
ok('P4R-07 项目归档拒绝', has(run(makeBase(), { project: { status: 'archived' } }), 'PROJECT_NOT_ACTIVE'));
var b8 = makeBase(); b8.record.projectId = 'prj_2';
ok('P4R-08 项目不一致', has(run(b8), 'PROJECT_MISMATCH'));

/* 5 检查点完整性 */
var b9 = makeBase(); b9.cp.stateHash = 'bad';
ok('P4R-09 stateHash 不符', has(run(b9), 'CHECKPOINT_INVALID'));
var b10 = makeBase();
b10.cp.snapshot = JSON.parse(JSON.stringify(b10.cp.snapshot));
b10.cp.snapshot.claims = 999;
ok('P4R-10 snapshot 被篡改', has(run(b10), 'CHECKPOINT_INVALID'));
var b11 = makeBase();
b11.st.steps[0].status = 'failed';
b11.st.steps[0].outputHash = null;
ok('P4R-11 完成节点状态无效', has(run(b11), 'CHECKPOINT_INVALID'));
var b12 = makeBase();
b12.cp.pendingStepIds = ['s1'];
ok('P4R-12 完成/待办交集', has(run(b12), 'CHECKPOINT_INVALID'));
var b13 = makeBase();
b13.cp.pendingStepIds = [];
ok('P4R-13 计划节点未覆盖', has(run(b13), 'CHECKPOINT_INVALID'));
var b14 = makeBase();
b14.cp.taskId = 'tsk_other';
ok('P4R-14 检查点 taskId 不一致', has(run(b14), 'CHECKPOINT_INVALID'));

/* 6 依赖 */
var b15 = makeBase();
b15.st.plan.steps[1].deps = ['missing'];
ok('P4R-15 依赖缺失', has(run(b15), 'DEP_INVALID'));
var b16 = makeBase();
b16.st.plan.steps[0].deps = ['s2'];
b16.st.plan.steps[1].deps = ['s1'];
ok('P4R-16 依赖成环', has(run(b16), 'DEP_INVALID'));
var b17 = makeBase();
b17.st.plan.steps[0].deps = ['s1'];
ok('P4R-17 自依赖', has(run(b17), 'DEP_INVALID'));

/* 7 Tool / Skill */
var noTool = { get: function () { return null; } };
ok('P4R-18 工具缺失', has(run(makeBase(), { registry: noTool }), 'TOOL_MISSING'));
var skillState = makeBase();
skillState.st.steps[0].skillId = 'skl_1';
skillState.st.steps[0].skillVersionId = 'sv_1';
ok('P4R-19 Skill 撤销', has(run(skillState, { skillLookup: { skl_1: null } }), 'SKILL_REVOKED'));
ok('P4R-20 Skill 版本不匹配', has(run(skillState, {
  skillLookup: { skl_1: { published: true, versionId: 'sv_2' } }
}), 'SKILL_VERSION_MISMATCH'));

/* 8 计划版本 */
var b21 = makeBase(); b21.cp.planVersion = 1;
ok('P4R-21 计划版本不匹配', has(run(b21), 'PLAN_VERSION_MISMATCH'));
var b22 = makeBase(); b22.cp.planId = 'plan_other';
ok('P4R-22 计划 ID 不匹配', has(run(b22), 'PLAN_VERSION_MISMATCH'));

/* 9 次数与预算 */
var b23 = makeBase();
b23.st.recoveries = 1;
b23.st.budget.used.recoveries = 1;
ok('P4R-23 恢复次数超限', has(run(b23), 'RECOVERY_LIMIT'));
var b24 = makeBase();
b24.st.budget.used.ms = b24.st.budget.limit.ms;
ok('P4R-24 预算耗尽', has(run(b24), 'BUDGET_EXHAUSTED'));

/* 10 终态与事件 */
var b25 = makeBase();
b25.st.phase = 'DONE';
ok('P4R-25 终态只读', has(run(b25), 'VIEW_ONLY'));
var b26 = makeBase();
b26.st.events.push({ seq: 3, at: new Date().toISOString(), taskId: b26.st.id, type: 'step.ok', stepId: 's1', payload: {} });
ok('P4R-26 事件断号', has(run(b26), 'EVENT_SEQ_GAP'));

/* 11 无检查点历史任务兼容 */
var legacy = makeBase();
ok('P4R-27 无检查点允许兼容恢复', run(legacy, { checkpoint: null }).ok === true);

/* 12 全部修复后通过 */
var fixed = makeBase();
ok('P4R-28 修复后重新通过', run(fixed).ok === true);

console.log('');
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
