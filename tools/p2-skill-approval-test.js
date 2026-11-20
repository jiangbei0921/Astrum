/* ASTRUM P2-04 审批、发布与回滚测试
 * 用法：node tools/p2-skill-approval-test.js
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
  'core/skill-contract.js', 'core/skill-store.js', 'core/skill-validator.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var C = global.AstroSkillContract;
var Store = global.AstroSkillStore;
var V = global.AstroSkillValidator;
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
function agent(id, profileId) {
  return Sec.forTest({ principalType: 'agent', profileId: profileId || 'alice', agentId: id || 'muse' });
}

function registry() {
  var r = Registry.create({ network: false });
  ['demo.echo', 'demo.sum'].forEach(function (id) {
    r.register({
      id: id, version: '1.0.0', caps: ['compute'],
      argsSchema: { type: 'object' }, returns: 'object', timeoutMs: 1000,
      cost: { ms: 1, tokens: 0, searches: 0 }, permissions: {},
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: [],
      run: function () { return { ok: true, result: { result: { ok: true } } }; }
    });
  });
  return r;
}

function makeValidation(draft, opts) {
  opts = opts || {};
  return V.validate(draft, {
    registry: opts.registry || registry(),
    principal: opts.principal || user('alice', 'prj_a'),
    fixtures: { 'demo.echo': { ok: true, result: { result: { ok: true } } }, cases: [{ caseId: 'c1' }] },
    regressionCases: opts.regression === false ? [] : [{ caseId: 'h1', ok: true }],
    securityCases: opts.securityFail ? [{ id: 'SEC-01', ok: false }] : [{ id: 'SEC-01', ok: true }]
  });
}

async function createDraft(store, principal, over) {
  return store.createDraft(Object.assign({
    projectId: 'prj_a',
    name: '可见性复核',
    description: '复核目标可见性',
    category: 'calculation',
    purpose: '批量复核',
    inputs: [{ name: 'query', type: 'string', required: true, example: 'M31' }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'demo.echo', argsTemplate: {}, onError: 'fail', timeoutMs: 800 }],
    allowedTools: ['demo.echo'],
    timeoutMs: 30000,
    retryPolicy: { max: 1, backoffMs: 100 }
  }, over || {}), principal);
}

async function toPending(store, draft, principal, validationOpts) {
  var val = makeValidation(draft, validationOpts);
  await store.saveValidation(val, principal);
  await store.transitionSkill(draft.skillId, 'validating', principal, { versionId: draft.versionId });
  await store.transitionSkill(draft.skillId, 'pending_approval', principal, {
    versionId: draft.versionId, validationId: val.validationId
  });
  return val;
}

async function approveAndPublish(store, draft, principal, validationOpts) {
  var val = await toPending(store, draft, principal, validationOpts);
  var approval = await store.requestApproval(draft.skillId, draft.versionId, principal, {});
  await store.decideApproval(approval.approvalId, 'approved', user('alice', 'prj_a'), { reason: 'ok' });
  var pub = await store.publish(draft.skillId, draft.versionId, approval.approvalId, user('alice', 'prj_a'));
  return { validation: val, approval: approval, publication: pub };
}

async function main() {
  var reg = registry();
  var store = Store.create({ ownerProfileId: 'alice', registry: reg });
  await store.init();
  var alice = user('alice', 'prj_a');
  var alicePlain = user('alice');
  var bob = user('bob', 'prj_a');

  /* ---------- 草稿 → 验证 → 待审批 ---------- */
  var d1 = await createDraft(store, alice);
  ok('P2-A-001 草稿初始状态 draft', d1.status === 'draft');
  var val = makeValidation(d1);
  ok('P2-A-002 验证结论 PASS', val.verdict === 'PASS', val.verdict);
  await store.saveValidation(val, alice);
  ok('P2-A-003 验证记录可读回', !!(await store.getValidation(val.validationId, alice)));
  ok('P2-A-004 验证记录归属档案', (await store.getValidation(val.validationId, bob)) === null);

  var d0 = await createDraft(store, alice, { name: '无验证草稿' });
  await expectReject('P2-A-005 无验证不得进审批', store.transitionSkill(d0.skillId, 'validating', alice, { versionId: d0.versionId })
    .then(function () {
      return store.transitionSkill(d0.skillId, 'pending_approval', alice, { versionId: d0.versionId });
    }), ['VALIDATION_REQUIRED']);

  await store.transitionSkill(d1.skillId, 'validating', alice, { versionId: d1.versionId });
  var skillNow = await store.getSkill(d1.skillId, alice);
  ok('P2-A-006 验证中状态', skillNow.status === 'validating');

  var val2 = makeValidation(d1);
  await store.saveValidation(val2, alice);
  await store.transitionSkill(d1.skillId, 'pending_approval', alice, {
    versionId: d1.versionId, validationId: val2.validationId
  });
  ok('P2-A-007 验证通过进入待审批', (await store.getSkill(d1.skillId, alice)).status === 'pending_approval');

  var approval = await store.requestApproval(d1.skillId, d1.versionId, alice, {});
  ok('P2-A-008 审批记录 pending', approval.decision === 'pending');
  ok('P2-A-009 审批绑定版本哈希', approval.contentHash === (await store.getVersion(d1.versionId, alice)).contentHash);
  ok('P2-A-010 快照含验证结论', approval.snapshot.validationVerdict === 'PASS');
  ok('P2-A-011 快照含输入输出契约', approval.snapshot.inputs.length === 1 && approval.snapshot.outputs.length === 1);
  ok('P2-A-012 快照含工具清单', approval.snapshot.allowedTools.indexOf('demo.echo') >= 0);

  /* ---------- 未审批发布 / 越权 ---------- */
  await expectReject('P2-A-013 未审批不能发布', store.publish(d0.skillId, d0.versionId, null, alice), ['APPROVAL_REQUIRED']);
  await expectReject('P2-A-014 Agent 审批被拒绝', store.decideApproval(approval.approvalId, 'approved', agent('muse')), ['USER_ONLY']);
  await expectReject('P2-A-015 Agent 发布被拒绝', store.publish(d1.skillId, d1.versionId, approval.approvalId, agent('muse')), ['USER_ONLY']);
  await expectReject('P2-A-016 跨档案审批不可见', store.decideApproval(approval.approvalId, 'approved', bob), ['NOT_FOUND']);

  var tampered = { versionId: d1.versionId, contentHash: 'sha256:fake', decision: 'approved', expiresAt: null };
  ok('P2-A-017 旧审批+新哈希失效', C.verifySnapshot(tampered,
    await store.getVersion(d1.versionId, alice)).reason === 'APPROVAL_MISMATCH');

  /* ---------- 批准与拒绝 ---------- */
  var decided = await store.decideApproval(approval.approvalId, 'approved', alice, { reason: '同意' });
  ok('P2-A-018 用户批准成功', decided.decision === 'approved');
  ok('P2-A-019 技能状态 approved', (await store.getSkill(d1.skillId, alice)).status === 'approved');
  ok('P2-A-020 版本状态 approved', (await store.getVersion(d1.versionId, alice)).status === 'approved');
  ok('P2-A-021 审批幂等', (await store.decideApproval(approval.approvalId, 'approved', alice, {})).decision === 'approved');

  var pub = await store.publish(d1.skillId, d1.versionId, approval.approvalId, alice);
  ok('P2-A-022 发布成功', pub.ok === true && !!pub.publicationId);
  ok('P2-A-023 技能指针切换到新版本', (await store.getSkill(d1.skillId, alice)).currentVersionId === d1.versionId);
  ok('P2-A-024 版本标记 published', (await store.getVersion(d1.versionId, alice)).status === 'published');
  ok('P2-A-025 发布记录写库', (await store.listPublications(d1.skillId, alice)).length === 1);
  var pub2 = await store.publish(d1.skillId, d1.versionId, approval.approvalId, alice);
  ok('P2-A-026 重复发布幂等', pub2.idempotent === true && pub2.publicationId === pub.publicationId);

  /* ---------- 拒绝流程 ---------- */
  var d2 = await createDraft(store, alice, { name: '拒绝测试' });
  await toPending(store, d2, alice);
  var a2 = await store.requestApproval(d2.skillId, d2.versionId, alice, {});
  await store.decideApproval(a2.approvalId, 'rejected', alice, { reason: '不合规' });
  ok('P2-A-027 拒绝后技能 rejected', (await store.getSkill(d2.skillId, alice)).status === 'rejected');
  await expectReject('P2-A-028 已拒绝版本不能发布', store.publish(d2.skillId, d2.versionId, a2.approvalId, alice),
    ['APPROVAL_NOT_GRANTED', 'INVALID_TRANSITION']);

  /* ---------- 安全失败阻断 ---------- */
  var d3 = await createDraft(store, alice, { name: '安全失败' });
  var badVal = makeValidation(d3, { securityFail: true });
  ok('P2-A-029 安全失败验证为 FAIL', badVal.verdict === 'FAIL');
  await store.saveValidation(badVal, alice);
  await store.transitionSkill(d3.skillId, 'validating', alice, { versionId: d3.versionId });
  await expectReject('P2-A-030 安全失败禁止进审批', store.transitionSkill(d3.skillId, 'pending_approval', alice, {
    versionId: d3.versionId, validationId: badVal.validationId
  }), ['SECURITY_BLOCKED', 'VALIDATION_FAILED']);

  /* ---------- 条件通过 ---------- */
  var d4 = await createDraft(store, alice, { name: '条件通过' });
  var condVal = makeValidation(d4, { regression: false });
  ok('P2-A-031 无回归为 CONDITIONAL_PASS', condVal.verdict === 'CONDITIONAL_PASS');
  await store.saveValidation(condVal, alice);
  await store.transitionSkill(d4.skillId, 'validating', alice, { versionId: d4.versionId });
  await store.transitionSkill(d4.skillId, 'pending_approval', alice, {
    versionId: d4.versionId, validationId: condVal.validationId
  });
  var a4 = await store.requestApproval(d4.skillId, d4.versionId, alice, {});
  await store.decideApproval(a4.approvalId, 'approved', alice, {});
  await expectReject('P2-A-032 条件通过需明确接受条件', store.publish(d4.skillId, d4.versionId, a4.approvalId, alice),
    ['APPROVAL_CONDITION_REQUIRED']);
  var a4b = await store.requestApproval(d4.skillId, d4.versionId, alice, {});
  await store.decideApproval(a4b.approvalId, 'conditional', alice, { conditions: ['限制在本地工具'] });
  var condPub = await store.publish(d4.skillId, d4.versionId, a4b.approvalId, alice);
  ok('P2-A-033 条件审批后可发布', condPub.ok === true);

  /* ---------- 过期审批 ---------- */
  var d5 = await createDraft(store, alice, { name: '过期审批' });
  await toPending(store, d5, alice);
  var a5 = await store.requestApproval(d5.skillId, d5.versionId, alice, { expiresAt: '2000-01-01T00:00:00.000Z' });
  await expectReject('P2-A-034 过期审批不能批准', store.decideApproval(a5.approvalId, 'approved', alice), ['APPROVAL_EXPIRED']);

  /* ---------- 版本升级与旧版本保留 ---------- */
  var d6 = await createDraft(store, alice, { name: '版本升级' });
  var first = await approveAndPublish(store, d6, alice);
  var v1Id = d6.versionId;
  var d6b = await createDraft(store, alice, {
    skillId: d6.skillId,
    baseVersionId: v1Id,
    name: '版本升级',
    description: '改进后的版本',
    version: '1.0.1'
  });
  ok('P2-A-035 新版本号自动递增', d6b.version.version === '1.0.1', d6b.version.version);
  var val6 = makeValidation(d6b);
  await store.saveValidation(val6, alice);
  await store.transitionSkill(d6.skillId, 'validating', alice, { versionId: d6b.versionId });
  await store.transitionSkill(d6.skillId, 'pending_approval', alice, {
    versionId: d6b.versionId, validationId: val6.validationId
  });
  var a6 = await store.requestApproval(d6.skillId, d6b.versionId, alice, {});
  await store.decideApproval(a6.approvalId, 'approved', alice, {});
  var pub6 = await store.publish(d6.skillId, d6b.versionId, a6.approvalId, alice);
  ok('P2-A-036 升级发布切换指针', (await store.getSkill(d6.skillId, alice)).currentVersionId === d6b.versionId);
  ok('P2-A-037 旧版本保留为 superseded', (await store.getVersion(v1Id, alice)).status === 'superseded');
  ok('P2-A-038 发布记录包含 previousVersionId', pub6.previousVersionId === v1Id);
  ok('P2-A-039 版本列表保留两版', (await store.listVersions(d6.skillId, alice)).length === 2);

  /* ---------- 废弃与归档 ---------- */
  await store.deprecate(d6.skillId, alice);
  ok('P2-A-040 废弃状态', (await store.getSkill(d6.skillId, alice)).status === 'deprecated');
  await store.archive(d6.skillId, alice);
  ok('P2-A-041 归档状态', (await store.getSkill(d6.skillId, alice)).status === 'archived');

  /* ---------- 事件与审计 ---------- */
  var events = await store.listEvents(d6.skillId, alice);
  ok('P2-A-042 生命周期事件已记录', events.length >= 5);
  ok('P2-A-043 事件包含审批动作', events.some(function (e) { return e.action === 'approve'; }));
  ok('P2-A-044 事件包含发布动作', events.some(function (e) { return e.action === 'publish'; }));
  var audits = await global.AuditLog.list({ limit: 200 });
  ok('P2-A-045 审计写入 skill.publish', audits.some(function (a) { return a.action === 'skill.publish'; }));
  ok('P2-A-046 审计写入 skill.approve', audits.some(function (a) { return a.action === 'skill.approve'; }));

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
