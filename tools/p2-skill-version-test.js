/* ASTRUM P2-05 版本升级、对比与回滚测试
 * 用法：node tools/p2-skill-version-test.js
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
function agent(id) { return Sec.forTest({ principalType: 'agent', profileId: 'alice', agentId: id || 'muse' }); }

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

function baseInput(over) {
  return Object.assign({
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
  }, over || {});
}

async function publishVersion(store, principal, input) {
  var draft = await store.createDraft(baseInput(input), principal);
  var val = V.validate(draft, {
    registry: registry(),
    principal: principal,
    fixtures: { 'demo.echo': { ok: true, result: { result: { ok: true } } }, cases: [{ caseId: 'c1' }] },
    regressionCases: [{ caseId: 'h1', ok: true }],
    securityCases: [{ id: 'SEC-01', ok: true }]
  });
  await store.saveValidation(val, principal);
  await store.transitionSkill(draft.skillId, 'validating', principal, { versionId: draft.versionId });
  await store.transitionSkill(draft.skillId, 'pending_approval', principal, {
    versionId: draft.versionId, validationId: val.validationId
  });
  var approval = await store.requestApproval(draft.skillId, draft.versionId, principal, {});
  await store.decideApproval(approval.approvalId, 'approved', principal, {});
  var publication = await store.publish(draft.skillId, draft.versionId, approval.approvalId, principal);
  return { draft: draft, validation: val, approval: approval, publication: publication };
}

async function main() {
  var reg = registry();
  var store = Store.create({ ownerProfileId: 'alice', registry: reg });
  await store.init();
  var alice = user('alice', 'prj_a');

  /* ---------- 初始版本 ---------- */
  var v1 = await publishVersion(store, alice, { name: '版本技能' });
  ok('P2-VER-001 初始版本 1.0.0', v1.draft.version.version === '1.0.0');
  ok('P2-VER-002 初始版本已发布', (await store.getVersion(v1.draft.versionId, alice)).status === 'published');
  ok('P2-VER-003 技能指针指向初始版本', (await store.getSkill(v1.draft.skillId, alice)).currentVersionId === v1.draft.versionId);
  ok('P2-VER-004 getPublished 返回当前版本', (await store.getPublished(v1.draft.skillId, alice)).version.versionId === v1.draft.versionId);
  ok('P2-VER-005 发布记录 action=publish', (await store.listPublications(v1.draft.skillId, alice))[0].action === 'publish');

  /* ---------- 版本号与升级规则 ---------- */
  await expectReject('P2-VER-006 同版本号冲突拒绝', store.createDraft(baseInput({
    skillId: v1.draft.skillId, version: '1.0.0', name: '冲突'
  }), alice), ['VERSION_CONFLICT']);

  var v2d = await store.createDraft(baseInput({
    skillId: v1.draft.skillId,
    baseVersionId: v1.draft.versionId,
    name: '版本技能',
    description: '增加一步复核',
    workflow: [
      { stepId: 's1', tool: 'demo.echo', timeoutMs: 800 },
      { stepId: 's2', tool: 'demo.echo', timeoutMs: 800 }
    ]
  }), alice);
  ok('P2-VER-007 新增步骤升级 MINOR', v2d.version.version === '1.1.0', v2d.version.version);
  ok('P2-VER-008 差异记录新增步骤', v2d.diff.addedSteps.length === 1);
  ok('P2-VER-009 差异记录父版本', v2d.version.parentVersionId === v1.draft.versionId);

  var majorDraft = C.makeDraft({
    skillId: v1.draft.skillId,
    name: 'x',
    inputs: [{ name: 'q2', type: 'number', required: true }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'demo.echo', timeoutMs: 800 }],
    outputsHash: 'x'
  });
  var baseVersion = await store.getVersion(v1.draft.versionId, alice);
  var diffMajor = C.diffDraft(baseVersion, {
    content: {
      inputs: [{ name: 'q2', type: 'number', required: true }],
      outputs: [{ name: 'result', type: 'object', required: true }],
      workflow: [{ stepId: 's1', tool: 'demo.echo' }],
      allowedTools: ['demo.echo'],
      requiredCapabilities: []
    }
  });
  ok('P2-VER-010 输入契约变化标记', diffMajor.inputsChanged === true);
  ok('P2-VER-011 输入变化不兼容', diffMajor.compatible === false);
  ok('P2-VER-012 输入变化分类 MAJOR', C.semver.classify(baseVersion, {
    content: { inputs: [{ name: 'q2', type: 'number', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'demo.echo' }], allowedTools: ['demo.echo'], requiredCapabilities: [] }
  }) === 'major');

  var permDiff = C.diffDraft(baseVersion, {
    content: {
      inputs: baseVersion.content.inputs,
      outputs: baseVersion.content.outputs,
      workflow: baseVersion.content.workflow,
      allowedTools: ['demo.echo', 'demo.sum'],
      requiredCapabilities: ['tool.search']
    }
  });
  ok('P2-VER-013 权限扩大标记', permDiff.permissionsExpanded === true);
  ok('P2-VER-014 权限扩大列为不兼容', permDiff.compatible === false);
  ok('P2-VER-015 权限扩大分类 MAJOR', C.semver.classify(baseVersion, {
    content: { inputs: baseVersion.content.inputs, outputs: baseVersion.content.outputs, workflow: baseVersion.content.workflow, allowedTools: ['demo.echo', 'demo.sum'], requiredCapabilities: ['tool.search'] }
  }) === 'major');
  ok('P2-VER-016 版本列表按版本降序', (await store.listVersions(v1.draft.skillId, alice)).length === 2 &&
    (await store.listVersions(v1.draft.skillId, alice))[0].version === '1.1.0');

  /* ---------- 升级发布 ---------- */
  var val2 = V.validate(v2d, {
    registry: reg, principal: alice,
    fixtures: { 'demo.echo': { ok: true, result: { result: { ok: true } } }, cases: [{ caseId: 'c1' }] },
    regressionCases: [{ caseId: 'h1', ok: true }],
    securityCases: [{ id: 'SEC-01', ok: true }]
  });
  await store.saveValidation(val2, alice);
  await store.transitionSkill(v1.draft.skillId, 'validating', alice, { versionId: v2d.versionId });
  await store.transitionSkill(v1.draft.skillId, 'pending_approval', alice, {
    versionId: v2d.versionId, validationId: val2.validationId
  });
  var a2 = await store.requestApproval(v1.draft.skillId, v2d.versionId, alice, {});
  await store.decideApproval(a2.approvalId, 'approved', alice, {});
  var p2 = await store.publish(v1.draft.skillId, v2d.versionId, a2.approvalId, alice);
  ok('P2-VER-017 升级发布成功', p2.ok === true);
  ok('P2-VER-018 previousVersionId 记录旧版本', p2.previousVersionId === v1.draft.versionId);
  ok('P2-VER-019 指针切到新版本', (await store.getSkill(v1.draft.skillId, alice)).currentVersionId === v2d.versionId);
  ok('P2-VER-020 旧版本保留为 superseded', (await store.getVersion(v1.draft.versionId, alice)).status === 'superseded');
  ok('P2-VER-021 旧版本内容未被覆盖', (await store.getVersion(v1.draft.versionId, alice)).content.workflow.length === 1);
  var p2again = await store.publish(v1.draft.skillId, v2d.versionId, a2.approvalId, alice);
  ok('P2-VER-022 并发/重复发布幂等', p2again.idempotent === true && p2again.publicationId === p2.publicationId);

  /* ---------- 执行历史 ---------- */
  await store.recordExecution({
    executionId: 'ske_hist_1', skillId: v1.draft.skillId, versionId: v2d.versionId,
    status: 'ok', startedAt: '2026-01-01T00:00:00.000Z', completedAt: '2026-01-01T00:00:01.000Z',
    durationMs: 1000, stepResults: []
  }, alice);
  var execBefore = await store.listExecutions(v1.draft.skillId, alice);
  ok('P2-VER-023 执行记录已写入', execBefore.length === 1);

  /* ---------- 回滚 ---------- */
  await expectReject('P2-VER-024 Agent 回滚被拒绝', store.rollback(v1.draft.skillId, v1.draft.versionId, agent('muse'), 'x'), ['USER_ONLY']);
  await expectReject('P2-VER-025 回滚到不存在版本拒绝', store.rollback(v1.draft.skillId, 'skv_missing', alice, 'x'), ['VERSION_NOT_FOUND']);

  var rb = await store.rollback(v1.draft.skillId, v1.draft.versionId, alice, '回退到稳定版');
  ok('P2-VER-026 回滚成功', rb.ok === true && !!rb.publicationId);
  ok('P2-VER-027 指针回到旧版本', (await store.getSkill(v1.draft.skillId, alice)).currentVersionId === v1.draft.versionId);
  ok('P2-VER-028 目标版本重新 published', (await store.getVersion(v1.draft.versionId, alice)).status === 'published');
  ok('P2-VER-029 新版本标记 rolled_back', (await store.getVersion(v2d.versionId, alice)).status === 'rolled_back');
  ok('P2-VER-030 回滚不删除新版本', !!(await store.getVersion(v2d.versionId, alice)));
  ok('P2-VER-031 执行历史未被改写', (await store.listExecutions(v1.draft.skillId, alice)).length === 1 &&
    (await store.listExecutions(v1.draft.skillId, alice))[0].versionId === v2d.versionId);
  var pubsAfterRb = await store.listPublications(v1.draft.skillId, alice);
  ok('P2-VER-032 回滚写入 Publication(action=rollback)', pubsAfterRb.some(function (p) {
    return p.action === 'rollback' && p.previousVersionId === v2d.versionId;
  }));
  ok('P2-VER-033 回滚事件已记录', (await store.listEvents(v1.draft.skillId, alice)).some(function (e) {
    return e.action === 'rollback';
  }));

  var rbAgain = await store.rollback(v1.draft.skillId, v1.draft.versionId, alice, '再次回滚');
  ok('P2-VER-034 重复回滚到当前版本幂等', rbAgain.idempotent === true);

  var rb2 = await store.rollback(v1.draft.skillId, v2d.versionId, alice, '回到新版本');
  ok('P2-VER-035 多次回滚各自留痕', rb2.ok === true &&
    (await store.listPublications(v1.draft.skillId, alice)).filter(function (p) { return p.action === 'rollback'; }).length === 2);
  ok('P2-VER-036 回滚后指针再次切换', (await store.getSkill(v1.draft.skillId, alice)).currentVersionId === v2d.versionId);

  /* ---------- 已知漏洞版本 ---------- */
  var vuln = await publishVersion(store, alice, { name: '漏洞版本', securityKnownIssues: ['KNOWN-1'] });
  var safe = await publishVersion(store, alice, {
    skillId: vuln.draft.skillId, baseVersionId: vuln.draft.versionId,
    name: '漏洞版本', description: '修复版', version: '1.0.1'
  });
  await expectReject('P2-VER-037 回滚到已知漏洞版本拒绝',
    store.rollback(vuln.draft.skillId, vuln.draft.versionId, alice, 'x'), ['KNOWN_VULNERABILITY']);
  ok('P2-VER-038 安全版本指针保持不变',
    (await store.getSkill(vuln.draft.skillId, alice)).currentVersionId === safe.draft.versionId);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
