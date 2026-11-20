/* ASTRUM P2-02 提议与草稿测试
 * 用法：node tools/p2-skill-proposal-test.js
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

['core/task.js', 'core/agents.js', 'core/security.js', 'core/registry.js',
  'core/skill-contract.js', 'core/skill-store.js', 'core/skill-proposal.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var SC = global.AstroSkillContract;
var Store = global.AstroSkillStore;
var P = global.AstroSkillProposal;
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

function fakeRegistry() {
  var r = Registry.create({ network: false });
  ['demo.scan', 'demo.measure', 'demo.report'].forEach(function (id) {
    r.register({
      id: id, version: '1.0.0', caps: ['compute'],
      argsSchema: { type: 'object' },
      returns: 'object', timeoutMs: 1000,
      cost: { ms: 1, tokens: 0, searches: 0 },
      permissions: {}, idempotent: true, ttlMs: null,
      retry: { allowed: false, max: 0 }, deps: [],
      run: function () { return { ok: true, result: { result: { ok: true } } }; }
    });
  });
  return r;
}

function task(id, tools, success, projectId) {
  return {
    id: id,
    projectId: projectId || null,
    question: '批量复核目标 ' + id,
    success: success !== false,
    steps: tools.map(function (t, i) {
      return { stepId: 's' + (i + 1), tool: t, status: success === false ? 'failed' : 'ok' };
    })
  };
}

async function main() {
  /* ---------- 签名与相似度 ---------- */
  ok('P2-P-001 签名按工具序列生成', P.signatureOfSteps([{ tool: 'a' }, { tool: 'b' }]) === 'a|>b');
  ok('P2-P-002 签名忽略空步骤', P.signatureOfSteps([{ tool: 'a' }, null, { tool: '' }]) === 'a');
  ok('P2-P-003 技能步骤带前缀', P.signatureOfSteps([{ kind: 'skill', skillId: 'x' }]) === 'skill:x');
  ok('P2-P-004 相同签名相似度 1', P.similarity('a|>b', 'a|>b') === 1);
  ok('P2-P-005 不同工具相似度 0', P.similarity('a|>b', 'c|>d') === 0);
  ok('P2-P-006 部分重叠介于 0-1', P.similarity('a|>b', 'a|>c') > 0 && P.similarity('a|>b', 'a|>c') < 1);
  ok('P2-P-007 空签名相同为 1', P.similarity('', '') === 1);

  /* ---------- 去重 ---------- */
  var dd = P.dedupe([{ signature: 'a|>b' }, { signature: 'c|>d' }], [{ signature: 'a|>b' }], []);
  ok('P2-P-008 已存在技能签名被去重', dd.kept.length === 1 && dd.dropped.length === 1);
  ok('P2-P-009 去重原因标记', dd.dropped[0].reason === 'DUPLICATE');
  var dd2 = P.dedupe([{ signature: 'a|>b' }, { signature: 'a|>b' }], [], []);
  ok('P2-P-010 候选内部相同签名合并', dd2.kept.length === 1 && dd2.dropped.length === 1);
  var dd3 = P.dedupe([{ signature: 'a|>b|>c|>d|>e' }], [], [{ signature: 'a|>b|>c|>d', status: 'proposed' }]);
  ok('P2-P-011 相似提议去重', dd3.kept.length === 0);
  var dd4 = P.dedupe([{ signature: 'a|>b' }], [], [{ signature: 'a|>b', status: 'rejected' }]);
  ok('P2-P-012 已拒绝提议不参与去重', dd4.kept.length === 1);

  /* ---------- 阈值扫描 ---------- */
  var alice = user('alice');
  var reg = fakeRegistry();
  var store = Store.create({ ownerProfileId: 'alice', registry: reg });
  await store.init();

  var one = await P.scan(store, null, alice, {
    tasks: [task('t1', ['demo.scan', 'demo.measure'], true)],
    existingSkills: [], existingProposals: [], registry: reg
  });
  ok('P2-P-013 单次任务不产生提议', one.proposals.length === 0);
  ok('P2-P-014 单次任务原因 INSUFFICIENT_RUNS', one.reasons.INSUFFICIENT_RUNS === 1);

  var tasks3 = [
    task('t1', ['demo.scan', 'demo.measure'], true, 'prj_a'),
    task('t2', ['demo.scan', 'demo.measure'], true, 'prj_a'),
    task('t3', ['demo.scan', 'demo.measure'], true, 'prj_a')
  ];
  var scopedAlice = user('alice', 'prj_a');
  var out1 = await P.scan(store, null, scopedAlice, {
    tasks: tasks3, existingSkills: [], existingProposals: [], registry: reg, minRuns: 3
  });
  ok('P2-P-015 三次同类成功产生 1 条提议', out1.proposals.length === 1, JSON.stringify(out1.reasons));
  if (out1.proposals.length) {
    var prop = out1.proposals[0];
    ok('P2-P-016 提议记录运行次数', prop.occurrence.runs === 3);
    ok('P2-P-017 提议记录成功率', prop.occurrence.successRate === 1);
    ok('P2-P-018 提议保留来源 Task', prop.supportingTaskIds.length === 3);
    ok('P2-P-019 提议归属课题', prop.projectId === 'prj_a');
    ok('P2-P-020 提议签名一致', prop.signature === 'demo.scan|>demo.measure');
    ok('P2-P-021 提议置信度 high', prop.confidence === 'high');
  } else {
    for (var i = 16; i <= 21; i++) ok('P2-P-0' + i + ' 依赖提议', false);
  }

  var lowRate = [
    task('t1', ['demo.scan'], true),
    task('t2', ['demo.scan'], true),
    task('t3', ['demo.scan'], false)
  ];
  var out2 = await P.scan(store, null, alice, { tasks: lowRate, existingSkills: [], existingProposals: [], registry: reg });
  ok('P2-P-022 成功率低于阈值不提议', out2.proposals.length === 0);
  ok('P2-P-023 低成功率原因', out2.reasons.LOW_SUCCESS_RATE >= 1);

  var allFail = [task('f1', ['demo.report'], false), task('f2', ['demo.report'], false), task('f3', ['demo.report'], false)];
  var out3 = await P.scan(store, null, alice, { tasks: allFail, existingSkills: [], existingProposals: [], registry: reg });
  ok('P2-P-024 无成功来源不提议', out3.proposals.length === 0);
  ok('P2-P-025 无成功原因', out3.reasons.NO_SUCCESS >= 1);

  var cross = [
    task('c1', ['demo.scan'], true, 'prj_x'),
    task('c2', ['demo.scan'], true, 'prj_x'),
    task('c3', ['demo.scan'], true, 'prj_y'),
    task('c4', ['demo.scan'], true, 'prj_y')
  ];
  var out4 = await P.scan(store, null, alice, { tasks: cross, existingProjects: [], existingSkills: [], existingProposals: [], registry: reg, minRuns: 3 });
  ok('P2-P-026 跨课题不合并', out4.proposals.length === 0 && out4.reasons.INSUFFICIENT_RUNS === 2);

  var sigDup = [
    task('d1', ['demo.scan', 'demo.measure'], true, 'prj_a'),
    task('d2', ['demo.scan', 'demo.measure'], true, 'prj_a'),
    task('d3', ['demo.scan', 'demo.measure'], true, 'prj_a')
  ];
  var out5 = await P.scan(store, null, scopedAlice, { tasks: sigDup, existingSkills: [], existingProposals: [], registry: reg });
  ok('P2-P-027 重复签名不再提议', out5.proposals.length === 0 && out5.reasons.DUPLICATE_PROPOSAL >= 1);

  var out6 = await P.scan(store, null, scopedAlice, {
    tasks: sigDup, existingSkills: [{ signature: 'demo.scan|>demo.measure' }],
    existingProposals: [], registry: reg
  });
  ok('P2-P-028 已有同签名技能不提议', out6.proposals.length === 0 && out6.reasons.DUPLICATE_SKILL >= 1);

  var flaky = [];
  for (var k = 0; k < 5; k++) flaky.push(task('f' + k, ['demo.scan', 'demo.report'], k < 4, 'prj_b'));
  var out7 = await P.scan(store, null, user('alice', 'prj_b'), { tasks: flaky, existingSkills: [], existingProposals: [], registry: reg });
  ok('P2-P-029 成功率恰好 0.8 允许提议', out7.proposals.length === 1, JSON.stringify(out7.reasons));

  var open20 = [];
  for (var m = 0; m < 20; m++) open20.push({ signature: 'x' + m, status: 'proposed', projectId: 'prj_c' });
  var fourC = [0, 1, 2, 3].map(function (n) { return task('q' + n, ['demo.measure', 'demo.report'], true, 'prj_c'); });
  var out8 = await P.scan(store, null, user('alice', 'prj_c'), {
    tasks: fourC, existingSkills: [], existingProposals: open20, registry: reg
  });
  ok('P2-P-030 待处理提议上限生效', out8.proposals.length === 0 && out8.reasons.PROPOSAL_LIMIT >= 1);

  /* ---------- Store 提议 ---------- */
  ok('P2-P-031 提议落库可读回', !!(await store.getProposal(out1.proposals[0].proposalId, scopedAlice)));
  ok('P2-P-032 跨档案读取返回 null', (await store.getProposal(out1.proposals[0].proposalId, user('bob'))) === null);
  var dup = await store.createProposal({
    projectId: 'prj_a', candidateName: '重复', signature: 'demo.scan|>demo.measure'
  }, scopedAlice);
  ok('P2-P-033 Store 按签名去重', dup.duplicate === true);
  await expectReject('P2-P-034 跨档案写提议拒绝', store.createProposal({
    projectId: null, candidateName: 'x', signature: 'zzz'
  }, user('bob', null)), ['PROFILE_MISMATCH']);
  ok('P2-P-035 提议列表按课题过滤', (await store.listProposals(scopedAlice, { projectId: 'prj_a' })).length >= 1);

  /* ---------- 草稿生成 ---------- */
  var draft = P.draftFromProposal(out1.proposals[0], tasks3, { registry: reg, skillId: 'skl_x' });
  ok('P2-P-036 草稿结构合法', !!draft.draftId && draft.executionMode === 'declarative');
  ok('P2-P-037 草稿工作流来自任务样本', draft.workflow.length === 2 && draft.workflow[0].tool === 'demo.scan');
  ok('P2-P-038 草稿白名单包含全部工具', draft.allowedTools.length === 2);
  ok('P2-P-039 草稿保留来源提议', draft.source.proposalId === out1.proposals[0].proposalId);
  ok('P2-P-040 草稿输入输出契约完整', draft.inputs.length === 1 && draft.outputs.length === 1);
  ok('P2-P-041 草稿分类为工作流', draft.category === 'workflow');
  ok('P2-P-042 草稿通过 Schema 校验', (function () {
    try { SC.validateDraft(draft); return true; } catch (e) { return false; }
  })());

  ok('P2-P-043 无工具序列拒绝生成草稿', (function () {
    try { P.draftFromProposal({ proposalId: 'p', candidateName: 'x', signature: '', limits: { iterationDepth: 1 } }, [], {}); return false; }
    catch (e) { return e.code === 'NO_WORKFLOW'; }
  })());
  ok('P2-P-044 递归成长上限拒绝', (function () {
    try {
      P.draftFromProposal({ proposalId: 'p', candidateName: 'x', signature: 'demo.scan', limits: { iterationDepth: 5 } }, [], {});
      return false;
    } catch (e) { return e.code === 'GROWTH_LIMIT'; }
  })());

  /* ---------- Store 草稿与版本 ---------- */
  var created = await store.createDraft({
    proposalId: out1.proposals[0].proposalId,
    projectId: 'prj_a',
    name: draft.name,
    description: draft.description,
    category: draft.category,
    workflow: draft.workflow,
    inputs: draft.inputs,
    outputs: draft.outputs,
    allowedTools: draft.allowedTools,
    source: draft.source
  }, scopedAlice);
  ok('P2-P-045 草稿绑定 Skill', /^skl_/.test(created.skillId));
  ok('P2-P-046 草稿生成版本 1.0.0', created.version && created.version.version === '1.0.0');
  ok('P2-P-047 技能状态为 draft', (await store.getSkill(created.skillId, scopedAlice)).status === 'draft');
  ok('P2-P-048 草稿可读回', !!(await store.getDraft(created.draftId, scopedAlice)));
  ok('P2-P-049 版本哈希存在', /^sha256:/.test(created.version.contentHash));
  ok('P2-P-050 提议标记为 draft', (await store.getProposal(out1.proposals[0].proposalId, scopedAlice)).status === 'draft');

  await expectReject('P2-P-051 未注册工具拒绝', store.createDraft({
    skillId: created.skillId,
    name: '坏草稿',
    workflow: [{ stepId: 's1', tool: 'nope.tool', timeoutMs: 1000 }],
    inputs: [{ name: 'q', type: 'string', required: true }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    allowedTools: ['nope.tool']
  }, user('alice', 'prj_a')), ['UNKNOWN_TOOL']);

  await expectReject('P2-P-052 版本号冲突拒绝', store.createDraft({
    skillId: created.skillId,
    projectId: 'prj_a',
    name: '冲突草稿',
    version: '1.0.0',
    workflow: [{ stepId: 's1', tool: 'demo.scan', timeoutMs: 1000 }],
    inputs: [{ name: 'q', type: 'string', required: true }],
    outputs: [{ name: 'result', type: 'object', required: true }],
    allowedTools: ['demo.scan']
  }, user('alice', 'prj_a')), ['VERSION_CONFLICT']);

  var updated = await store.updateDraft(created.draftId, { description: '更新后的描述' }, scopedAlice);
  ok('P2-P-053 草稿可更新', updated.description === '更新后的描述');
  var ver = await store.getVersion(created.versionId, scopedAlice);
  ok('P2-P-054 更新草稿同步版本哈希', ver.contentHash === SC.contentHash(ver.content));

  await store.transitionSkill(created.skillId, 'validating', scopedAlice, { versionId: created.versionId });
  ok('P2-P-055 可进入验证', (await store.getSkill(created.skillId, scopedAlice)).status === 'validating');
  await expectReject('P2-P-056 验证中不可改草稿', store.updateDraft(created.draftId, { name: 'x' }, scopedAlice), ['DRAFT_LOCKED']);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  if (fail) process.exitCode = 1;
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exitCode = 1;
});
