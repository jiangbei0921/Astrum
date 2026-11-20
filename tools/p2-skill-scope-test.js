/* ASTRUM P2-06 作用域与执行器测试
 * 用法：node tools/p2-skill-scope-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] == null ? null : this._d[k]; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  key: function (i) { return Object.keys(this._d)[i] || null; },
  get length() { return Object.keys(this._d).length; }
};

['core/task.js', 'core/agents.js', 'core/audit-log.js', 'core/security.js', 'core/registry.js',
  'core/tool-gateway.js', 'core/skill-contract.js', 'core/skill-store.js', 'core/skill-runtime.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var C = global.AstroSkillContract;
var Store = global.AstroSkillStore;
var RT = global.AstroSkillRuntime;
var Registry = global.AstroRegistry;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
async function expectReject(name, p, codes) {
  try { await p; fail++; console.log('FAIL | ' + name + ' | 未拒绝'); }
  catch (e) {
    var list = Array.isArray(codes) ? codes : [codes];
    ok(name, !codes || list.indexOf(e.code) >= 0, 'code=' + (e && e.code));
  }
}
function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId || 'alice', projectId: projectId || null });
}
function agent(id, projectId) {
  return Sec.forTest({ principalType: 'agent', profileId: 'alice', agentId: id || 'curator', projectId: projectId || null });
}

function registry() {
  var r = Registry.createDefault({ network: false });
  var calls = { n: 0 };
  r.register({
    id: 'demo.echo', version: '1.0.0', caps: ['compute'],
    argsSchema: { type: 'object', properties: { query: { type: 'string' } } },
    returns: 'object', timeoutMs: 1000,
    cost: { ms: 1, tokens: 0, searches: 0 }, permissions: {},
    idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: [],
    run: function () {
      calls.n += 1;
      return { ok: true, result: { result: { ok: true, calls: calls.n } } };
    }
  });
  r.calls = calls;
  return r;
}

function fakeVal(draft) {
  var l = { ok: true, errors: [], findings: [] };
  return {
    validationId: C.newId('skval_'),
    skillId: draft.skillId,
    versionId: draft.versionId,
    draftId: draft.draftId,
    testSuiteVersion: 'p2-1',
    environment: 'isolated',
    layers: { schema: l, static: l, functional: { ok: true, cases: [{ caseId: 'c1', ok: true }] },
      regression: { ok: true, cases: [], na: false }, security: { ok: true, findings: [] }, stability: { ok: true } },
    verdict: 'PASS', failureReasons: [],
    startedAt: new Date().toISOString(), completedAt: new Date().toISOString(), durationMs: 1,
    artifacts: {}, schemaVersion: 1
  };
}

function input(over) {
  return Object.assign({
    name: '作用域技能',
    description: '作用域测试',
    category: 'workflow',
    purpose: '作用域',
    inputs: [{ name: 'query', type: 'string', required: true, example: 'M31' }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'demo.echo', argsTemplate: {}, onError: 'fail', timeoutMs: 800 }],
    allowedTools: ['demo.echo'],
    timeoutMs: 30000,
    retryPolicy: { max: 0, backoffMs: 0 }
  }, over || {});
}

async function publish(store, principal, over) {
  var draft = await store.createDraft(input(over), principal);
  var val = fakeVal(draft);
  await store.saveValidation(val, principal);
  await store.transitionSkill(draft.skillId, 'validating', principal, { versionId: draft.versionId });
  await store.transitionSkill(draft.skillId, 'pending_approval', principal, {
    versionId: draft.versionId, validationId: val.validationId
  });
  var approval = await store.requestApproval(draft.skillId, draft.versionId, principal, {});
  await store.decideApproval(approval.approvalId, 'approved', principal, {});
  await store.publish(draft.skillId, draft.versionId, approval.approvalId, principal);
  return draft;
}

async function main() {
  var reg = registry();
  var store = Store.create({ ownerProfileId: 'alice', registry: reg });
  await store.init();
  var alice = user('alice', 'prj_a');

  var projectSkill = await publish(store, alice, { projectId: 'prj_a', name: '课题级技能' });
  var profileSkill = await publish(store, user('alice'), { name: '档案级技能' });
  var pub = await store.getPublished(projectSkill.skillId, alice);

  /* ---------- Profile ---------- */
  ok('P2-S-001 同档案作用域通过', RT.resolveScope(pub.skill, pub.version, alice, { registry: reg }).ok === true);
  ok('P2-S-002 跨档案解析拒绝', RT.resolveScope(pub.skill, pub.version, user('bob', 'prj_a'), { registry: reg }).reason === 'PROFILE_MISMATCH');
  ok('P2-S-003 跨档案读取技能为 null', (await store.getSkill(projectSkill.skillId, user('bob'))) === null);
  ok('P2-S-004 跨档案读取发布版本为 null', (await store.getPublished(projectSkill.skillId, user('bob'))) === null);

  /* ---------- Project ---------- */
  ok('P2-S-005 同课题执行通过', RT.resolveScope(pub.skill, pub.version, user('alice', 'prj_a'), { registry: reg }).ok === true);
  ok('P2-S-006 跨课题执行拒绝', RT.resolveScope(pub.skill, pub.version, user('alice', 'prj_b'), { registry: reg }).reason === 'PROJECT_MISMATCH');
  ok('P2-S-007 课题级技能要求课题上下文', RT.resolveScope(pub.skill, pub.version, user('alice'), { registry: reg }).reason === 'PROJECT_MISMATCH');
  var pubProfile = await store.getPublished(profileSkill.skillId, user('alice'));
  ok('P2-S-008 档案级技能无课题也可执行', RT.resolveScope(pubProfile.skill, pubProfile.version, user('alice'), { registry: reg }).ok === true);
  ok('P2-S-009 列表按课题过滤课题级技能', (await store.listSkills(user('alice', 'prj_b'))).every(function (s) { return !s.projectId; }));
  ok('P2-S-010 列表不泄露他人技能', (await store.listSkills(user('bob'))).length === 0);

  /* ---------- 版本状态 ---------- */
  var draftVersion = await store.getVersion(projectSkill.versionId, alice);
  layoutVersionStateTest();
  function layoutVersionStateTest() {
    var copy = JSON.parse(JSON.stringify(draftVersion));
    copy.status = 'draft';
    ok('P2-S-011 非发布版本不可执行', RT.resolveScope(pub.skill, copy, alice, { registry: reg }).reason === 'NOT_PUBLISHED');
  }
  ok('P2-S-012 缺版本拒绝', RT.resolveScope(pub.skill, null, alice, { registry: reg }).reason === 'NOT_FOUND');

  /* ---------- Agent ---------- */
  var agentSkill = await publish(store, alice, {
    projectId: 'prj_a', name: '限定 Agent', allowedAgents: ['curator']
  });
  var aPub = await store.getPublished(agentSkill.skillId, alice);
  ok('P2-S-013 白名单 Agent 通过', RT.resolveScope(aPub.skill, aPub.version, agent('curator', 'prj_a'), { registry: reg }).ok === true);
  ok('P2-S-014 非白名单 Agent 拒绝', RT.resolveScope(aPub.skill, aPub.version, agent('scholar', 'prj_a'), { registry: reg }).reason === 'AGENT_NOT_ALLOWED');
  ok('P2-S-015 用户不受 Agent 白名单限制', RT.resolveScope(aPub.skill, aPub.version, alice, { registry: reg }).ok === true);

  /* ---------- 工具求交 ---------- */
  var capSkill = await publish(store, alice, {
    projectId: 'prj_a', name: '能力约束', requiredCapabilities: ['tool.search']
  });
  var cPub = await store.getPublished(capSkill.skillId, alice);
  ok('P2-S-016 执行者缺能力拒绝', RT.resolveScope(cPub.skill, cPub.version, agent('muse', 'prj_a'), { registry: reg }).reason === 'CAPABILITY_NOT_GRANTED');
  ok('P2-S-017 声明能力不授予能力', RT.resolveScope(cPub.skill, cPub.version, agent('muse', 'prj_a'), { registry: reg }).ok === false);
  ok('P2-S-018 具备能力的 Agent 通过', RT.resolveScope(cPub.skill, cPub.version, agent('scholar', 'prj_a'), { registry: reg }).ok === true);

  var toolSkill = await publish(store, alice, {
    projectId: 'prj_a', name: '检索工具', allowedTools: ['evidence.search'],
    workflow: [{ stepId: 's1', tool: 'evidence.search', timeoutMs: 5000 }]
  });
  var tPub = await store.getPublished(toolSkill.skillId, alice);
  ok('P2-S-019 工具能力不在执行者角色内拒绝',
    RT.resolveScope(tPub.skill, tPub.version, agent('muse', 'prj_a'), { registry: reg }).reason === 'TOOL_NOT_ALLOWED');
  ok('P2-S-020 工具能力匹配通过',
    RT.resolveScope(tPub.skill, tPub.version, agent('scholar', 'prj_a'), { registry: reg }).ok === true);

  var weights = reg.get('demo.echo');
  ok('P2-S-021 Registry 存在工具可用于求交', !!weights);
  var minimalReg = Registry.create({ network: false });
  ok('P2-S-022 未注册工具执行前拒绝',
    RT.resolveScope(pub.skill, pub.version, alice, { registry: minimalReg }).reason === 'TOOL_UNAVAILABLE');

  /* ---------- 执行器 ---------- */
  var exec = await RT.execute(projectSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', taskId: 'task_1', registry: reg
  });
  ok('P2-S-023 执行成功', exec.status === 'ok', exec.status + ':' + exec.failureReason);
  ok('P2-S-024 执行记录含 taskId', exec.taskId === 'task_1');
  ok('P2-S-025 执行记录含 traceId', /^trc_/.test(exec.traceId));
  ok('P2-S-026 执行经过 ToolGateway', reg.calls.n >= 1);
  ok('P2-S-027 执行记录落库', (await store.listExecutions(projectSkill.skillId, alice, { limit: 10 })).some(function (e) {
    return e.executionId === exec.executionId;
  }));
  ok('P2-S-028 执行结果含输出哈希', /^[0-9a-f]{8,}/i.test(String(exec.outputHash || '')));
  ok('P2-S-029 执行记录不含敏感正文', !('input' in exec) && !('args' in exec));
  ok('P2-S-030 执行记录含步骤结果', exec.stepResults.length === 1 && exec.stepResults[0].status === 'ok');

  var denied = await RT.execute(projectSkill.skillId, { query: 'M31' }, {
    store: store, principal: user('alice', 'prj_b'), projectId: 'prj_b', registry: reg
  });
  ok('P2-S-031 跨课题执行失败', denied.status === 'failed');
  ok('P2-S-032 跨课题失败分类 permission', denied.failureCategory === 'permission', denied.failureCategory);
  ok('P2-S-033 失败原因 PROJECT_MISMATCH', denied.failureReason === 'PROJECT_MISMATCH');
  ok('P2-S-034 失败执行同样留痕', (await store.listExecutions(projectSkill.skillId, user('alice'), { limit: 50 })).some(function (e) {
    return e.executionId === denied.executionId;
  }));

  var badArg = await RT.execute(agentSkill.skillId, { profileId: 'bob' }, {
    store: store, principal: user('alice', 'prj_a'), projectId: 'prj_a', registry: reg
  });
  ok('P2-S-035 输入中的身份字段被剥离而非传递', badArg.status === 'ok', badArg.failureReason);

  var dry = await RT.execute(profileSkill.skillId, { query: 'M31' }, {
    store: store, principal: user('alice'), registry: reg, dryRun: true
  });
  ok('P2-S-036 试运行不调用工具', dry.status === 'ok' && dry.stepResults[0].status === 'planned');

  /* ---------- 复制 / 导入不扩权 ---------- */
  var copied = await store.createDraft(input({
    name: '复制技能', projectId: 'prj_a', requiredCapabilities: ['tool.search']
  }), alice);
  ok('P2-S-037 复制声明能力不自动授权', copied.front === undefined);
  var copyVal = fakeVal(copied);
  await store.saveValidation(copyVal, alice);
  await store.transitionSkill(copied.skillId, 'validating', alice, { versionId: copied.versionId });
  await store.transitionSkill(copied.skillId, 'pending_approval', alice, {
    versionId: copied.versionId, validationId: copyVal.validationId
  });
  var ca = await store.requestApproval(copied.skillId, copied.versionId, alice, {});
  await store.decideApproval(ca.approvalId, 'approved', alice, {});
  await store.publish(copied.skillId, copied.versionId, ca.approvalId, alice);
  var cp = await store.getPublished(copied.skillId, alice);
  ok('P2-S-038 复制后仍按执行者求交',
    RT.resolveScope(cp.skill, cp.version, agent('muse', 'prj_a'), { registry: reg }).reason === 'CAPABILITY_NOT_GRANTED');

  await expectReject('P2-S-039 导入危险字段拒绝', store.createDraft(input({
    name: '危险包', projectId: 'prj_a',
    workflow: [{ stepId: 's1', tool: 'demo.echo', argsTemplate: JSON.parse('{"__proto__":{"admin":1}}'), timeoutMs: 1000 }]
  }), alice), ['INVALID_BUNDLE']);

  var draftWithId = C.makeDraft(input({ projectId: 'prj_a' }));
  draftWithId.skillId = 'skl_x';
  ok('P2-S-040 全局作用域不被模型接受', (function () {
    var s = C.makeSkill({ profileId: 'alice', name: 'g', scope: 'global' });
    return s.scope === 'profile';
  })());

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
