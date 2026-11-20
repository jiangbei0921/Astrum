/* ASTRUM P2-01 技能契约测试
 * 用法：node tools/p2-skill-contract-test.js
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

['core/task.js', 'core/agents.js', 'core/security.js', 'core/skill-contract.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var C = global.AstroSkillContract;
var Security = global.Security;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function codeOf(fn) {
  try { fn(); return ''; } catch (e) { return e.code || 'ERR'; }
}
function user(profileId) { return Security.forTest({ principalType: 'user', profileId: profileId || 'alice' }); }
function agent(id, profileId) { return Security.forTest({ principalType: 'agent', profileId: profileId || 'alice', agentId: id || 'muse' }); }

function draftInput(over) {
  var base = {
    skillId: 'skl_test',
    name: '可见性复核',
    description: '对候选目标做可见性复核',
    category: 'calculation',
    purpose: '批量复核目标可见性',
    inputs: [{ name: 'query', type: 'string', required: true, example: 'M31' }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    workflow: [{ stepId: 's1', tool: 'kepler.visibility', argsTemplate: { targets: ['M31'] }, onError: 'fail', timeoutMs: 800 }],
    allowedTools: ['kepler.visibility'],
    requiredCapabilities: [],
    allowedAgents: [],
    timeoutMs: 30000,
    retryPolicy: { max: 1, backoffMs: 100 }
  };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}
function validDraft(over) {
  var d = C.makeDraft(draftInput(over));
  C.validateDraft(d);
  return d;
}

function main() {
  /* ---------- 常量 ---------- */
  ok('P2-C-001 技能状态枚举 10 项', C.STATUS.length === 10, C.STATUS.length);
  ok('P2-C-002 版本状态枚举 8 项', C.VERSION_STATUS.length === 8, C.VERSION_STATUS.length);
  ok('P2-C-003 分类枚举 6 项', C.CATEGORIES.length === 6);
  ok('P2-C-004 能力映射完整', C.CAPABILITY_MAP.approve === 'skill.approve' &&
    C.CAPABILITY_MAP.rollback === 'skill.rollback');
  ok('P2-C-005 schemaVersion 固定为 1', C.SCHEMA_VERSION === 1);

  /* ---------- Proposal ---------- */
  var p = C.makeProposal({ profileId: 'alice', candidateName: ' 可见性复核 ', description: 'd', signature: 'a|>b' });
  ok('P2-C-006 提议 ID 前缀', /^skp_/.test(p.proposalId), p.proposalId);
  ok('P2-C-007 提议默认 proposed', p.status === 'proposed');
  ok('P2-C-008 名称去空白', p.candidateName === '可见性复核');
  ok('P2-C-009 提议校验通过', C.validateProposal(p) === true);
  ok('P2-C-010 缺名称拒绝', codeOf(function () {
    C.validateProposal(Object.assign({}, p, { candidateName: '' }));
  }) === 'E_PROPOSAL_NAME');
  ok('P2-C-011 非法状态拒绝', codeOf(function () {
    C.validateProposal(Object.assign({}, p, { status: 'published' }));
  }) === 'E_PROPOSAL_STATUS');
  ok('P2-C-012 名称超长拒绝', codeOf(function () {
    C.validateProposal(Object.assign({}, p, { candidateName: new Array(80).join('x') }));
  }) === 'E_PROPOSAL_NAME');

  /* ---------- Draft Schema ---------- */
  var d = validDraft();
  ok('P2-C-013 草稿 ID 前缀', /^skd_/.test(d.draftId));
  ok('P2-C-014 执行模式固定 declarative', d.executionMode === 'declarative');
  ok('P2-C-015 合法草稿校验通过', C.validateDraft(d) === true);
  ok('P2-C-016 workflow 为空拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ workflow: [] })));
  }) === 'E_DRAFT_WORKFLOW');
  ok('P2-C-017 stepId 重复拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({
      workflow: [
        { stepId: 's1', tool: 'a', timeoutMs: 100 },
        { stepId: 's1', tool: 'b', timeoutMs: 100 }
      ]
    })));
  }) === 'E_DRAFT_STEP_ID');
  ok('P2-C-018 非法 onError 拒绝', codeOf(function () {
    var d0 = validDraft();
    d0.workflow[0].onError = 'ignore';
    C.validateDraft(d0);
  }) === 'E_DRAFT_ONERROR');
  ok('P2-C-019 步骤超时超 120s 拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({
      workflow: [{ stepId: 's1', tool: 'a', timeoutMs: 130000 }]
    })));
  }) === 'E_DRAFT_TIMEOUT');
  ok('P2-C-020 超时非数字拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ timeoutMs: '30000' })));
  }) === 'E_DRAFT_TIMEOUT');
  ok('P2-C-021 重试超过 2 拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ retryPolicy: { max: 3, backoffMs: 0 } })));
  }) === 'E_DRAFT_RETRY');
  ok('P2-C-022 缺输入契约拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ inputs: [] })));
  }) === 'E_DRAFT_INPUTS');
  ok('P2-C-023 输出缺 type 拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ outputs: [{ name: 'result', required: true }] })));
  }) === 'E_DRAFT_OUTPUTS');
  ok('P2-C-024 输入 required 非布尔拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({
      inputs: [{ name: 'q', type: 'string', required: 'yes' }]
    })));
  }) === 'E_DRAFT_INPUTS');
  ok('P2-C-025 非法分类拒绝', codeOf(function () {
    var d0 = validDraft();
    d0.category = 'magic';
    C.validateDraft(d0);
  }) === 'E_DRAFT_CATEGORY');
  ok('P2-C-026 可执行字段 code 拒绝', codeOf(function () {
    var bad = C.makeDraft(draftInput());
    bad.workflow[0].argsTemplate = { code: 'alert(1)' };
    C.validateDraft(bad);
  }) === 'EXECUTABLE_FIELD');
  ok('P2-C-027 可执行字段 eval 拒绝', codeOf(function () {
    var bad = C.makeDraft(draftInput());
    bad.eval = 'x';
    C.validateDraft(bad);
  }) === 'EXECUTABLE_FIELD');
  ok('P2-C-028 原型污染字段拒绝', codeOf(function () {
    var bad = C.makeDraft(draftInput());
    bad.workflow[0].argsTemplate = JSON.parse('{"__proto__":{"x":1}}');
    C.validateDraft(bad);
  }) === 'INVALID_BUNDLE');
  ok('P2-C-029 非 declarative 拒绝', codeOf(function () {
    var bad = C.makeDraft(draftInput());
    bad.executionMode = 'script';
    C.validateDraft(bad);
  }) === 'E_DRAFT_MODE');
  ok('P2-C-030 缺 skillId 拒绝', codeOf(function () {
    C.validateDraft(C.makeDraft(draftInput({ skillId: '' })));
  }) === 'E_DRAFT_SKILL');

  /* ---------- 状态机 ---------- */
  ok('P2-C-031 proposed→draft 允许', C.canTransition('proposed', 'draft'));
  ok('P2-C-032 draft→validating 允许', C.canTransition('draft', 'validating'));
  ok('P2-C-033 validating→pending_approval 允许', C.canTransition('validating', 'pending_approval'));
  ok('P2-C-034 pending_approval→approved 允许', C.canTransition('pending_approval', 'approved'));
  ok('P2-C-035 approved→published 允许', C.canTransition('approved', 'published'));
  ok('P2-C-036 published→deprecated→archived', C.canTransition('published', 'deprecated') &&
    C.canTransition('deprecated', 'archived'));
  ok('P2-C-037 跳级 draft→approved 拒绝', !C.canTransition('draft', 'approved'));
  ok('P2-C-038 draft→published 拒绝', !C.canTransition('draft', 'published'));
  ok('P2-C-039 rejected→published 拒绝', !C.canTransition('rejected', 'published'));
  ok('P2-C-040 validation_failed→draft 允许', C.canTransition('validation_failed', 'draft'));
  ok('P2-C-041 非法枚举拒绝', !C.canTransition('magic', 'draft') && !C.canTransition('draft', 'magic'));
  ok('P2-C-042 approved 仅 user 可转移', C.canOperate('approved', 'published', user()) &&
    !C.canOperate('approved', 'published', agent('muse')));
  ok('P2-C-043 draft 允许 agent 推进验证', C.canOperate('draft', 'validating', agent('muse')));
  ok('P2-C-044 transition 生成新状态', C.transition({ status: 'draft' }, 'validating', { principal: agent('muse') }).status === 'validating');
  ok('P2-C-045 transition 非法抛错', codeOf(function () {
    C.transition({ status: 'draft' }, 'published', { principal: user() });
  }) === 'INVALID_TRANSITION');
  ok('P2-C-046 transition 非 user 审批拒绝', codeOf(function () {
    C.transition({ status: 'pending_approval' }, 'approved', { principal: agent('muse') });
  }) === 'USER_ONLY');

  /* ---------- 哈希 ---------- */
  var c1 = { purpose: 'p', inputs: [{ name: 'a', type: 'string', required: true }], workflow: [] };
  var c2 = { workflow: [], inputs: [{ required: true, type: 'string', name: 'a' }], purpose: 'p' };
  ok('P2-C-047 规范化与键序无关', C.canonical(c1) === C.canonical(c2));
  ok('P2-C-048 内容哈希稳定', C.contentHash(c1) === C.contentHash(c2));
  ok('P2-C-049 哈希前缀 sha256', /^sha256:/.test(C.contentHash(c1)));
  ok('P2-C-050 内容变化哈希变化', C.contentHash(c1) !== C.contentHash({ purpose: 'q' }));
  var v = C.makeVersion({ skillId: 'skl_test', version: '1.0.0', content: c1 });
  ok('P2-C-051 版本哈希与内容一致', v.contentHash === C.contentHash(v.content));
  ok('P2-C-052 篡改内容校验失败', codeOf(function () {
    var bad = Object.assign({}, v, { content: { purpose: 'tampered' } });
    C.validateVersion(bad);
  }) === 'E_VERSION_HASH');
  ok('P2-C-053 非法 SemVer 拒绝', codeOf(function () {
    C.makeVersion({ skillId: 'skl_test', version: '1.0', content: c1 });
    C.validateVersion(C.makeVersion({ skillId: 'skl_test', version: '1.0', content: c1 }));
  }) === 'E_SEMVER');

  /* ---------- 差异 / SemVer ---------- */
  var base = C.makeVersion({
    skillId: 'skl_test', version: '1.0.0',
    content: { inputs: [{ name: 'q', type: 'string', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'a' }], allowedTools: ['a'], requiredCapabilities: [] }
  });
  var same = C.makeVersion({
    skillId: 'skl_test', version: '1.0.1',
    content: { inputs: [{ name: 'q', type: 'string', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'a' }], allowedTools: ['a'], requiredCapabilities: [] }
  });
  var moreSteps = C.makeVersion({
    skillId: 'skl_test', version: '1.1.0',
    content: { inputs: [{ name: 'q', type: 'string', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'a' }, { stepId: 's2', tool: 'a' }], allowedTools: ['a'], requiredCapabilities: [] }
  });
  var morePerm = C.makeVersion({
    skillId: 'skl_test', version: '2.0.0',
    content: { inputs: [{ name: 'q', type: 'string', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'a' }], allowedTools: ['a', 'evidence.search'], requiredCapabilities: [] }
  });
  var diffSame = C.diffDraft(base, same);
  ok('P2-C-054 相同内容差异为空', diffSame.addedSteps.length === 0 && diffSame.removedSteps.length === 0);
  ok('P2-C-055 相同内容兼容', diffSame.compatible === true);
  ok('P2-C-056 新增步骤识别', C.diffDraft(base, moreSteps).addedSteps.length === 1);
  ok('P2-C-057 权限扩大识别', C.diffDraft(base, morePerm).permissionsExpanded === true);
  ok('P2-C-058 权限扩大不兼容', C.diffDraft(base, morePerm).compatible === false);
  ok('P2-C-059 工具增加记录', C.diffDraft(base, morePerm).toolsAdded.indexOf('evidence.search') >= 0);
  ok('P2-C-060 SemVer 解析', C.semver.parse('1.2.3').minor === 2);
  ok('P2-C-061 SemVer 解析非法返回 null', C.semver.parse('v1') === null);
  ok('P2-C-062 SemVer 比较', C.semver.compare('1.2.0', '1.1.9') === 1 && C.semver.compare('1.0.0', '1.0.0') === 0);
  ok('P2-C-063 SemVer 升级 major', C.semver.bump('1.2.3', 'major') === '2.0.0');
  ok('P2-C-064 SemVer 升级 minor', C.semver.bump('1.2.3', 'minor') === '1.3.0');
  ok('P2-C-065 SemVer 升级 patch', C.semver.bump('1.2.3', 'patch') === '1.2.4');
  ok('P2-C-066 分类 patch', C.semver.classify(base, same) === 'patch');
  ok('P2-C-067 分类 minor', C.semver.classify(base, moreSteps) === 'minor');
  ok('P2-C-068 分类 major（权限扩大）', C.semver.classify(base, morePerm) === 'major');
  var inputChanged = C.makeVersion({
    skillId: 'skl_test', version: '2.0.0',
    content: { inputs: [{ name: 'q', type: 'number', required: true }], outputs: [{ name: 'result', type: 'object', required: true }], workflow: [{ stepId: 's1', tool: 'a' }], allowedTools: ['a'], requiredCapabilities: [] }
  });
  ok('P2-C-069 分类 major（输入变化）', C.semver.classify(base, inputChanged) === 'major');

  /* ---------- 审批快照绑定 ---------- */
  var ap = {
    versionId: v.versionId, contentHash: v.contentHash, decision: 'approved', expiresAt: null
  };
  ok('P2-C-070 合法审批通过绑定校验', C.verifySnapshot(ap, v).ok === true);
  ok('P2-C-071 版本不匹配拒绝', C.verifySnapshot(Object.assign({}, ap, { versionId: 'other' }), v).reason === 'APPROVAL_MISMATCH');
  ok('P2-C-072 哈希不匹配拒绝', C.verifySnapshot(Object.assign({}, ap, { contentHash: 'sha256:x' }), v).reason === 'APPROVAL_MISMATCH');
  ok('P2-C-073 未批准拒绝', C.verifySnapshot(Object.assign({}, ap, { decision: 'pending' }), v).reason === 'APPROVAL_NOT_GRANTED');
  ok('P2-C-074 已过期拒绝', C.verifySnapshot(Object.assign({}, ap, { expiresAt: '2000-01-01T00:00:00.000Z' }), v).reason === 'APPROVAL_EXPIRED');
  ok('P2-C-075 条件审批通过校验', C.verifySnapshot(Object.assign({}, ap, { decision: 'conditional' }), v).ok === true);

  /* ---------- Skill / Version 模型 ---------- */
  var s = C.makeSkill({ profileId: 'alice', name: '测试技能' });
  ok('P2-C-076 技能 ID 前缀', /^skl_/.test(s.skillId));
  ok('P2-C-077 默认 profile 级作用域', s.scope === 'profile');
  ok('P2-C-078 技能校验通过', C.validateSkill(s) === true);
  ok('P2-C-079 project 级缺 projectId 拒绝', codeOf(function () {
    C.validateSkill(C.makeSkill({ profileId: 'alice', name: 'x', scope: 'project' }));
  }) === 'E_SKILL_SCOPE');
  ok('P2-C-080 版本 ID 前缀与默认版本', /^skv_/.test(v.versionId) && v.version === '1.0.0');
  ok('P2-C-081 新 ID 单调可用', C.newId('skp_') !== C.newId('skp_'));

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main();
