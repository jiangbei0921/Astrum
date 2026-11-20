/* ASTRUM P2 补充：Orchestrator Skill 步骤集成测试
 * 用法：node tools/p2-skill-orchestrator-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] == null ? null : this._d[k]; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

['core/task.js', 'core/agents.js', 'core/schema.js', 'core/audit-log.js', 'core/security.js',
  'core/registry.js', 'core/tool-gateway.js', 'core/skill-contract.js', 'core/skill-store.js',
  'core/skill-runtime.js', 'core/orchestrator.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var C = global.AstroSkillContract;
var Store = global.AstroSkillStore;
var O = global.AstroOrchestrator;
var Registry = global.AstroRegistry;
var T = global.AstroTask;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function user() { return Sec.forTest({ principalType: 'user', profileId: 'alice', projectId: 'prj_a' }); }

function registry() {
  var r = Registry.create({ network: false });
  ['demo.echo', 'demo.args'].forEach(function (id) {
    r.register({
      id: id, version: '1.0.0', caps: ['compute'],
      argsSchema: id === 'demo.args'
        ? { type: 'object', required: ['query'], properties: { query: { type: 'string' } } }
        : { type: 'object' },
      returns: 'object', timeoutMs: 1000,
      cost: { ms: 1, tokens: 0, searches: 0 }, permissions: {},
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: [],
      run: function () { return { ok: true, result: { result: { ok: true } } }; }
    });
  });
  return r;
}

function input(over) {
  return Object.assign({
    projectId: 'prj_a', name: '编排技能', description: 'orchestrator test',
    category: 'workflow', purpose: 'test',
    inputs: [{ name: 'query', type: 'string', required: true, example: 'M31' }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'demo.echo', timeoutMs: 1000 }],
    allowedTools: ['demo.echo'], timeoutMs: 10000, retryPolicy: { max: 0, backoffMs: 0 }
  }, over || {});
}
function fakeVal(draft) {
  var l = { ok: true, errors: [], findings: [] };
  return {
    validationId: C.newId('skval_'), skillId: draft.skillId, versionId: draft.versionId,
    draftId: draft.draftId, testSuiteVersion: 'p2-1', environment: 'isolated',
    layers: { schema: l, static: l, functional: { ok: true, cases: [{ caseId: 'c', ok: true }] },
      regression: { ok: true, cases: [], na: false }, security: { ok: true }, stability: { ok: true } },
    verdict: 'PASS', failureReasons: [], startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(), durationMs: 1, artifacts: {}, schemaVersion: 1
  };
}
async function publish(store, principal, over) {
  var draft = await store.createDraft(input(over), principal);
  var val = fakeVal(draft);
  await store.saveValidation(val, principal);
  await store.transitionSkill(draft.skillId, 'validating', principal, { versionId: draft.versionId });
  await store.transitionSkill(draft.skillId, 'pending_approval', principal, {
    versionId: draft.versionId, validationId: val.validationId
  });
  var a = await store.requestApproval(draft.skillId, draft.versionId, principal, {});
  await store.decideApproval(a.approvalId, 'approved', principal, {});
  await store.publish(draft.skillId, draft.versionId, a.approvalId, principal);
  return draft;
}
function makeState() {
  return T.create({
    id: 'task_skill_1', projectId: 'prj_a', question: '执行技能',
    steps: [{ id: 'st1', status: 'pending' }]
  });
}
function makePlan(skillId, over) {
  return { steps: [Object.assign({ id: 'st1', kind: 'skill', skillId: skillId, args: { query: 'M31' }, critical: true }, over || {})] };
}

async function main() {
  var reg = registry();
  var store = Store.create({ ownerProfileId: 'alice', registry: reg });
  await store.init();
  var alice = user();
  var skill = await publish(store, alice, {});

  /* ---------- 成功路径 ---------- */
  var state = makeState();
  var plan = makePlan(skill.skillId);
  var out = await O.runPlan(plan, state, {
    principal: alice, registry: reg, skillStore: store, projectId: 'prj_a'
  });
  var step = state.steps[0];
  ok('P2-O-001 Skill 步骤执行成功', step.status === 'ok', step.status + ':' + JSON.stringify(step.error));
  ok('P2-O-002 步骤 toolId 标记 skill', step.toolId === 'skill:' + skill.skillId);
  ok('P2-O-003 步骤记录执行结果', !!step.result && step.result.status === 'ok');
  ok('P2-O-004 步骤含输出哈希', /^[0-9a-f]{8,}/i.test(String(step.outputHash || '')));
  ok('P2-O-005 步骤事件含 step.ok', state.events.some(function (e) { return e.type === 'step.ok' && e.stepId === 'st1'; }));
  ok('P2-O-006 执行落入技能库', (await store.listExecutions(skill.skillId, alice)).length === 1);
  ok('P2-O-007 执行关联任务 ID', (await store.listExecutions(skill.skillId, alice))[0].taskId === 'task_skill_1');
  ok('P2-O-008 计划全部落定', out.completed === true);

  /* ---------- 失败路径（参数非法） ---------- */
  var argSkill = await publish(store, alice, {
    name: '参数技能', workflow: [{ stepId: 's1', tool: 'demo.args', timeoutMs: 1000 }],
    allowedTools: ['demo.args']
  });
  var s2 = makeState();
  var p2 = makePlan(argSkill.skillId, { args: {} });
  var out2 = await O.runPlan(p2, s2, { principal: alice, registry: reg, skillStore: store, projectId: 'prj_a' });
  var st2 = s2.steps[0];
  ok('P2-O-009 输入失败步骤 failed', st2.status === 'failed');
  ok('P2-O-010 失败分类 input', st2.error && st2.error.kind === 'input', st2.error && st2.error.kind);
  ok('P2-O-011 关键步骤失败中止计划', out2.criticalFailed === true);
  ok('P2-O-012 失败事件已记录', s2.events.some(function (e) { return e.type === 'step.failed'; }));

  /* ---------- 工具缺失 ---------- */
  var s3 = makeState();
  var out3 = await O.runPlan(makePlan(skill.skillId), s3, {
    principal: alice, registry: Registry.create({ network: false }), skillStore: store, projectId: 'prj_a'
  });
  ok('P2-O-013 工具不可用步骤 failed', s3.steps[0].status === 'failed');
  ok('P2-O-014 工具不可用分类 tool_unavailable', s3.steps[0].error.kind === 'tool_unavailable',
    s3.steps[0].error.kind);
  ok('P2-O-015 工具不可用中止计划', out3.criticalFailed === true);

  /* ---------- 取消 ---------- */
  var s4 = makeState();
  var out4 = await O.runPlan(makePlan(skill.skillId), s4, {
    principal: alice, registry: reg, skillStore: store, signal: { aborted: true }
  });
  ok('P2-O-016 取消步骤 aborted', s4.steps[0].status === 'aborted');
  ok('P2-O-017 取消标记 cancelled', s4.steps[0].cancelled === true);
  ok('P2-O-018 取消事件已记录', s4.events.some(function (e) { return e.type === 'step.cancelled'; }));
  ok('P2-O-019 取消返回 aborted', out4.aborted === true);

  /* ---------- 会话变化 ---------- */
  var s5 = makeState();
  var stale = { principalType: 'user', profileId: 'alice', sessionId: '', projectId: 'prj_a' };
  var out5 = await O.runPlan(makePlan(skill.skillId), s5, {
    principal: stale, registry: reg, skillStore: store
  });
  ok('P2-O-020 无会话拒绝执行', out5.reason === 'SESSION_CHANGED', out5.reason);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
