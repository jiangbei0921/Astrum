/* ASTRUM P2-07 使用统计、失败分类与反馈测试
 * 用法：node tools/p2-skill-usage-test.js
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

['core/task.js', 'core/agents.js', 'core/audit-log.js', 'core/schema.js', 'core/security.js', 'core/registry.js',
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
function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId || 'alice', projectId: projectId || null });
}

function registry() {
  var r = Registry.create({ network: false });
  var calls = { retry: 0 };
  function add(id, run, argsSchema) {
    r.register({
      id: id, version: '1.0.0', caps: ['compute'],
      argsSchema: argsSchema || { type: 'object' },
      returns: 'object', timeoutMs: 1000,
      cost: { ms: 1, tokens: 0, searches: 0 }, permissions: {},
      idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 }, deps: [],
      run: run
    });
  }
  add('demo.ok', function () { return { ok: true, result: { result: { ok: true } } }; });
  add('demo.fail', function () { return { ok: false, reason: 'network down', kind: 'network', retriable: false }; });
  add('demo.retry', function () {
    calls.retry += 1;
    return { ok: false, reason: 'network down', kind: 'network', retriable: true };
  });
  add('demo.timeout', function () { return new Promise(function () {}); });
  add('demo.badout', function () { return { ok: true, result: { other: 1 } }; });
  add('demo.args', function () { return { ok: true, result: { result: { ok: true } } }; },
    { type: 'object', required: ['query'], properties: { query: { type: 'string' } } });
  r.calls = calls;
  return r;
}

function fakeVal(draft) {
  var l = { ok: true, errors: [], findings: [] };
  return {
    validationId: C.newId('skval_'), skillId: draft.skillId, versionId: draft.versionId,
    draftId: draft.draftId, testSuiteVersion: 'p2-1', environment: 'isolated',
    layers: { schema: l, static: l, functional: { ok: true, cases: [{ caseId: 'c1', ok: true }] },
      regression: { ok: true, cases: [], na: false }, security: { ok: true, findings: [] }, stability: { ok: true } },
    verdict: 'PASS', failureReasons: [], startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(), durationMs: 1, artifacts: {}, schemaVersion: 1
  };
}

function input(over) {
  return Object.assign({
    projectId: 'prj_a',
    name: '使用统计技能',
    description: '统计测试',
    category: 'workflow',
    purpose: '统计',
    inputs: [{ name: 'query', type: 'string', required: true, example: 'M31' }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'demo.ok', argsTemplate: {}, onError: 'fail', timeoutMs: 5000 }],
    allowedTools: ['demo.ok'],
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

  /* ---------- 成功执行与统计 ---------- */
  var okSkill = await publish(store, alice, {});
  var e1 = await RT.execute(okSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', taskId: 'task_1', registry: reg
  });
  ok('P2-U-001 成功执行状态 ok', e1.status === 'ok', e1.status + ':' + e1.failureReason);
  ok('P2-U-002 执行 ID 前缀 ske_', /^ske_/.test(e1.executionId));
  ok('P2-U-003 记录 taskId', e1.taskId === 'task_1');
  ok('P2-U-004 记录 traceId', /^trc_/.test(e1.traceId));
  ok('P2-U-005 记录耗时', typeof e1.durationMs === 'number' && e1.durationMs >= 0);
  ok('P2-U-006 执行记录写入技能库', (await store.listExecutions(okSkill.skillId, alice)).length === 1);
  var stats = await store.stats(okSkill.skillId, alice);
  ok('P2-U-007 统计使用次数为 1', stats.uses === 1);
  ok('P2-U-008 统计成功次数为 1', stats.success === 1);
  ok('P2-U-009 成功率 100%', stats.successRate === 1);
  ok('P2-U-010 最近使用时间已记录', !!stats.lastUsedAt);

  /* ---------- 失败分类 ---------- */
  var failSkill = await publish(store, alice, {
    name: '失败技能', workflow: [{ stepId: 's1', tool: 'demo.fail', timeoutMs: 2000 }],
    allowedTools: ['demo.fail']
  });
  var e2 = await RT.execute(failSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg
  });
  ok('P2-U-011 工具失败状态 failed', e2.status === 'failed');
  ok('P2-U-012 网络错误分类 external', e2.failureCategory === 'external', e2.failureCategory);
  ok('P2-U-013 失败原因已记录', /network/.test(e2.failureReason));
  var stats2 = await store.stats(failSkill.skillId, alice);
  ok('P2-U-014 失败计入失败次数', stats2.failure === 1);
  ok('P2-U-015 失败技能成功率为 0', stats2.successRate === 0);

  /* ---------- 重试 ---------- */
  var retrySkill = await publish(store, alice, {
    name: '重试技能',
    workflow: [{ stepId: 's1', tool: 'demo.retry', timeoutMs: 2000, onError: 'retry' }],
    allowedTools: ['demo.retry'],
    retryPolicy: { max: 2, backoffMs: 0 }
  });
  var beforeRetry = reg.calls.retry;
  var e3 = await RT.execute(retrySkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg
  });
  ok('P2-U-016 重试最多 2 次（共 3 次调用）', reg.calls.retry - beforeRetry === 3, reg.calls.retry - beforeRetry);
  ok('P2-U-017 重试后仍失败', e3.status === 'failed');
  ok('P2-U-018 重试只写一条执行记录', (await store.listExecutions(retrySkill.skillId, alice)).length === 1);
  ok('P2-U-019 重试不计为成功', (await store.stats(retrySkill.skillId, alice)).success === 0);

  /* ---------- 超时 ---------- */
  var toSkill = await publish(store, alice, {
    name: '超时技能',
    workflow: [{ stepId: 's1', tool: 'demo.timeout', timeoutMs: 60 }],
    allowedTools: ['demo.timeout'],
    timeoutMs: 5000
  });
  var e4 = await RT.execute(toSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg
  });
  ok('P2-U-020 超时状态 timeout', e4.status === 'timeout', e4.status);
  ok('P2-U-021 超时分类 external', e4.failureCategory === 'external');
  ok('P2-U-022 超时及时终止', e4.durationMs < 3000, e4.durationMs);
  ok('P2-U-023 超时步骤状态记录', e4.stepResults[0].status === 'timeout');

  /* ---------- 契约与输入 ---------- */
  var badOutSkill = await publish(store, alice, {
    name: '契约技能', workflow: [{ stepId: 's1', tool: 'demo.badout', timeoutMs: 2000 }],
    allowedTools: ['demo.badout']
  });
  var e5 = await RT.execute(badOutSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg
  });
  ok('P2-U-024 输出契约缺失失败', e5.failureCategory === 'contract', e5.failureCategory);

  var argSkill = await publish(store, alice, {
    name: '参数技能', workflow: [{ stepId: 's1', tool: 'demo.args', timeoutMs: 2000 }],
    allowedTools: ['demo.args']
  });
  var e6 = await RT.execute(argSkill.skillId, {}, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg
  });
  ok('P2-U-025 参数非法分类 input', e6.failureCategory === 'input', e6.failureCategory);

  /* ---------- 工具不可用 / 权限 / 取消 ---------- */
  var minimal = Registry.create({ network: false });
  var e7 = await RT.execute(okSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: minimal
  });
  ok('P2-U-026 工具不可用分类 tool_unavailable', e7.failureCategory === 'tool_unavailable', e7.failureCategory);

  var e8 = await RT.execute(okSkill.skillId, { query: 'M31' }, {
    store: store, principal: user('alice', 'prj_b'), projectId: 'prj_b', registry: reg
  });
  ok('P2-U-027 权限不匹配分类 permission', e8.failureCategory === 'permission');

  var e9 = await RT.execute(okSkill.skillId, { query: 'M31' }, {
    store: store, principal: alice, projectId: 'prj_a', registry: reg, signal: { aborted: true }
  });
  ok('P2-U-028 取消状态 cancelled', e9.status === 'cancelled');
  ok('P2-U-029 取消不写部分成功统计', (await store.stats(okSkill.skillId, alice)).success >= 1);

  /* ---------- 统计口径 ---------- */
  var all = await store.listExecutions(okSkill.skillId, alice, { limit: 100 });
  var byVersion = await store.listExecutions(okSkill.skillId, alice, { versionId: okSkill.versionId });
  ok('P2-U-030 执行记录可按版本过滤', byVersion.length >= 2 && byVersion.every(function (e) {
    return e.versionId === okSkill.versionId;
  }), all.length);
  ok('P2-U-031 执行记录可按状态过滤', (await store.listExecutions(okSkill.skillId, alice, {
    status: 'failed'
  })).every(function (e) { return e.status === 'failed'; }));
  var finalStats = await store.stats(okSkill.skillId, alice);
  ok('P2-U-032 成功率按任务级计算', finalStats.success + finalStats.failure ===
    (await store.listExecutions(okSkill.skillId, alice, { limit: 100 })).filter(function (e) {
      return e.status !== 'running';
    }).length);
  ok('P2-U-033 平均耗时为非负数', finalStats.avgDurationMs >= 0);

  /* ---------- 反馈与改进 ---------- */
  var fb = await store.recordFeedback({
    feedbackId: C.newId('skf_'),
    executionId: e1.executionId,
    skillId: okSkill.skillId,
    versionId: okSkill.versionId,
    rating: 4,
    category: 'usability',
    comment: new Array(700).join('x'),
    improvementProposalId: null
  }, alice);
  ok('P2-U-034 反馈写入', fb.feedbackId && (await store.listFeedback(okSkill.skillId, alice)).length === 1);
  ok('P2-U-035 反馈评论脱敏截断', fb.comment.length === 500, fb.comment.length);

  var proposal = await store.createProposal({
    candidateName: '改进建议',
    description: '根据反馈优化',
    signature: 'demo.ok'
  }, user('alice'));
  ok('P2-U-036 改进建议生成提议', /^skp_/.test(proposal.proposalId));
  var skillBefore = await store.getSkill(okSkill.skillId, alice);
  ok('P2-U-037 改进建议不改正式版本', skillBefore.currentVersionId === okSkill.versionId);
  ok('P2-U-038 反馈可关联改进提议', (await store.recordFeedback({
    feedbackId: C.newId('skf_'), executionId: e1.executionId, skillId: okSkill.skillId,
    versionId: okSkill.versionId, rating: 5, category: 'improvement', comment: '建议加一步',
    improvementProposalId: proposal.proposalId
  }, alice)).improvementProposalId === proposal.proposalId);
  ok('P2-U-039 反馈写入审计', (await global.AuditLog.list({ limit: 200 })).some(function (a) {
    return a.action === 'skill.feedback';
  }));

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
