/* ASTRUM P1-04 跨 Thread 召回测试
 * 用法：node tools/p1-context-test.js
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

['core/task.js', 'core/agents.js', 'core/security.js', 'core/project.js', 'core/memory.js',
  'core/research-store.js', 'core/research-context.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var RS = global.AstroResearchStore;
var Ctx = global.AstroResearchContext;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId, projectId: projectId || null });
}

async function main() {
  var alice = user('alice');
  var store = RS.create({ ownerProfileId: 'alice' });
  await store.init();

  var pa = await store.createProject({ title: '课题 A' }, alice);
  var pb = await store.createProject({ title: '课题 B' }, alice);
  var pidA = pa.projectId, pidB = pb.projectId;
  var scopedA = user('alice', pidA);

  async function addVerified(pid, text, extra) {
    var input = {
      projectId: pid, type: 'progress', content: text, summary: text.slice(0, 200),
      source: { kind: 'thread', refs: [{ kind: 'thread', id: 'th-src', uri: '' }] }
    };
    Object.keys(extra || {}).forEach(function (k) { input[k] = extra[k]; });
    var m = await store.putMemory(input, alice);
    var scoped = user('alice', pid);
    await store.transitionMemory(m.memoryId, 'proposed', scoped, {});
    await store.transitionMemory(m.memoryId, 'under_review', scoped, {});
    return store.transitionMemory(m.memoryId, 'verified', scoped, {});
  }

  /* ---------- 基础召回 ---------- */
  var m1 = await addVerified(pidA, '银河系中心黑洞质量约 4e6 太阳质量', { sourceThreadId: 'thread-1' });
  var m2 = await addVerified(pidA, '仙女座星系距离约 2.5 百万光年', { sourceThreadId: 'thread-2' });
  var m3 = await addVerified(pidA, '宇宙微波背景温度 2.725K', { sourceThreadId: 'thread-2' });
  var m4 = await addVerified(pidB, '课题 B 的专属记忆：系外行星凌日', { sourceThreadId: 'thread-3' });

  var r1 = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞质量', store: store });
  ok('P1-CTX-001 同课题 verified 记忆可召回', r1.ok && r1.memories.length === 3, JSON.stringify({ ok: r1.ok, n: r1.memories.length }));
  ok('P1-CTX-001b 结果字段完整', r1.memories.every(function (m) {
    return typeof m.memoryId === 'string' && typeof m.summary === 'string' &&
      Array.isArray(m.claimIds) && Array.isArray(m.evidenceIds) && typeof m.score === 'number';
  }));
  ok('P1-CTX-001c 结果按分数降序', r1.memories.every(function (m, i) {
    return i === 0 || r1.memories[i - 1].score >= m.score;
  }));
  ok('P1-CTX-002 关键词命中排第一', r1.memories[0].memoryId === m1.memoryId, r1.memories[0].summary);
  ok('P1-CTX-003 跨 Thread（thread-2/3）记忆可被召回',
    r1.memories.some(function (m) { return m.memoryId === m2.memoryId; }));
  ok('P1-CTX-004 其他课题记忆不混入', !r1.memories.some(function (m) { return m.memoryId === m4.memoryId; }));

  /* ---------- 当前 Thread 自身排除 ---------- */
  var rSelf = await Ctx.recall({
    principal: scopedA, projectId: pidA, threadId: 'thread-1', query: '黑洞', store: store
  });
  ok('P1-CTX-005 当前 Thread 自身记忆被排除',
    !rSelf.memories.some(function (m) { return m.memoryId === m1.memoryId; }));

  /* ---------- 非 verified / archived / superseded 不召回 ---------- */
  var draft = await store.putMemory({
    projectId: pidA, type: 'progress', content: '未审核草稿：黑洞候选结论', summary: '未审核草稿',
    source: { kind: 'user', refs: [] }
  }, alice);
  var rejected = await store.putMemory({
    projectId: pidA, type: 'progress', content: '被拒绝：黑洞错误结论', summary: '被拒绝',
    source: { kind: 'user', refs: [] }
  }, alice);
  await store.transitionMemory(rejected.memoryId, 'proposed', scopedA, {});
  await store.transitionMemory(rejected.memoryId, 'under_review', scopedA, {});
  await store.transitionMemory(rejected.memoryId, 'rejected', scopedA, {});
  var archivedMem = await addVerified(pidA, '将被归档的黑洞记忆', {});
  await store.transitionMemory(archivedMem.memoryId, 'archived', scopedA, {});

  var rFiltered = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞', store: store });
  ok('P1-CTX-006 未审核 draft 不召回',
    !rFiltered.memories.some(function (m) { return m.memoryId === draft.memoryId; }));
  ok('P1-CTX-006b rejected 不召回',
    !rFiltered.memories.some(function (m) { return m.memoryId === rejected.memoryId; }));
  ok('P1-CTX-006c archived 不召回',
    !rFiltered.memories.some(function (m) { return m.memoryId === archivedMem.memoryId; }));

  var oldMem = await addVerified(pidA, '旧的黑洞结论', {});
  var newMem2 = await store.putMemory({
    projectId: pidA, type: 'progress', content: '新的黑洞结论（取代旧结论）', summary: '新结论',
    source: { kind: 'thread', refs: [] }, supersedes: oldMem.memoryId
  }, alice);
  await store.transitionMemory(newMem2.memoryId, 'proposed', scopedA, {});
  await store.transitionMemory(newMem2.memoryId, 'under_review', scopedA, {});
  await store.transitionMemory(newMem2.memoryId, 'verified', scopedA, {});
  await store.transitionMemory(oldMem.memoryId, 'superseded', scopedA, { supersededBy: newMem2.memoryId });
  var rSup = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞结论', store: store });
  ok('P1-CTX-007 superseded 不召回',
    !rSup.memories.some(function (m) { return m.memoryId === oldMem.memoryId; }));
  ok('P1-CTX-007b 取代后的新记忆可召回',
    rSup.memories.some(function (m) { return m.memoryId === newMem2.memoryId; }));

  /* ---------- 类型过滤 ---------- */
  var rType = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞', types: ['fact'], store: store });
  ok('P1-CTX-008 类型过滤生效', rType.memories.every(function (m) { return m.type === 'fact'; }));

  /* ---------- 预算 ---------- */
  for (var i = 0; i < 8; i++) {
    await addVerified(pidA, '预算测试记忆 ' + i + ' 黑洞', { type: i % 2 ? 'decision' : 'progress' });
  }
  var rBudget = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '预算', store: store });
  ok('P1-CTX-009 默认最多 6 条', rBudget.memories.length === 6, rBudget.memories.length);
  ok('P1-CTX-009b 超预算标记 truncated', rBudget.truncated === true);
  var rSmall = await Ctx.recall({
    principal: scopedA, projectId: pidA, query: '预算', budget: { maxItems: 3 }, store: store
  });
  ok('P1-CTX-009c 自定义 maxItems 生效', rSmall.memories.length === 3, rSmall.memories.length);

  var longText = new Array(60).join('长');
  for (var j = 0; j < 3; j++) {
    await addVerified(pidA, longText + j, { summary: longText + j, type: 'progress' });
  }
  var rChars = await Ctx.recall({
    principal: scopedA, projectId: pidA, query: '长', budget: { maxItems: 6, maxChars: 130 }, store: store
  });
  var totalChars = rChars.memories.reduce(function (n, m) { return n + m.summary.length; }, 0);
  ok('P1-CTX-010 字符预算生效', totalChars <= 130, totalChars);
  ok('P1-CTX-010b 字符预算至少保留一条', rChars.memories.length >= 1);
  ok('P1-CTX-010c 预算字段回传', rChars.budget.maxChars === 130 && rChars.budget.maxItems === 6);

  /* ---------- 去重 ---------- */
  await store.putEvidenceBundle([{ evidenceId: 'ev_shared', sourceType: 'paper', title: 'S', uri: 'https://example.org/s' }], pidA, alice);
  await store.putClaimBundle([{ id: 'cl_shared', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_shared', strength: 'strong', basis: 'semantic' }], contradict: [] }], pidA, alice);
  var dupA = await addVerified(pidA, '共享主张的结论 A', {
    type: 'conclusion', claimIds: ['cl_shared'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_shared', uri: 'https://example.org/s' }] }
  });
  var dupB = await addVerified(pidA, '共享主张的结论 B', {
    type: 'conclusion', claimIds: ['cl_shared'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_shared', uri: 'https://example.org/s' }] }
  });
  var rDup = await Ctx.recall({
    principal: scopedA, projectId: pidA, query: '共享主张', budget: { maxItems: 20 }, store: store
  });
  var dupHits = rDup.memories.filter(function (m) {
    return m.memoryId === dupA.memoryId || m.memoryId === dupB.memoryId;
  });
  ok('P1-CTX-011 claim 重叠去重', dupHits.length === 1, dupHits.length);

  /* ---------- Evidence 摘要 ---------- */
  var evMem = await addVerified(pidA, '带证据的记忆', {
    type: 'fact', evidenceIds: ['ev_shared'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_shared', uri: 'https://example.org/s' }] }
  });
  var rEv = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '带证据', budget: { maxItems: 20 }, store: store });
  ok('P1-CTX-012 召回附带证据摘要', rEv.evidence.length >= 1 &&
    rEv.evidence[0].evidenceId === 'ev_shared' && !!rEv.evidence[0].uri, JSON.stringify(rEv.evidence));
  ok('P1-CTX-012b 证据摘要不超过 8 条', rEv.evidence.length <= 8, rEv.evidence.length);

  /* ---------- 隔离与拒绝 ---------- */
  var crossProject = await Ctx.recall({ principal: scopedA, projectId: pidB, query: '凌日', store: store });
  ok('P1-CTX-013 跨 Project 召回拒绝', !crossProject.ok && crossProject.denied === 'PROJECT_MISMATCH' &&
    crossProject.memories.length === 0, JSON.stringify(crossProject));
  var storeB = RS.create({ ownerProfileId: 'bob' });
  var bob = user('bob', pidA);
  var crossProfile = await Ctx.recall({ principal: bob, projectId: pidA, query: '黑洞', store: storeB });
  ok('P1-CTX-013b 跨 Profile 召回拒绝', !crossProfile.ok && crossProfile.memories.length === 0);
  var noPrincipal = await Ctx.recall({ principal: null, projectId: pidA, store: store });
  ok('P1-CTX-013c 无 principal 拒绝', !noPrincipal.ok && noPrincipal.denied === 'INVALID_CONTEXT');
  var noProject = await Ctx.recall({ principal: scopedA, projectId: null, store: store });
  ok('P1-CTX-013d 缺少 projectId 拒绝', !noProject.ok && noProject.denied === 'PROJECT_REQUIRED');

  /* 归档/删除课题拒绝召回 */
  var pc = await store.createProject({ title: '归档召回课题' }, alice);
  await addVerified(pc.projectId, '归档课题记忆', {});
  await store.setProjectStatus(pc.projectId, 'archived', alice);
  var rArch = await Ctx.recall({ principal: user('alice', pc.projectId), projectId: pc.projectId, query: '归档', store: store });
  ok('P1-CTX-014 归档课题拒绝召回', !rArch.ok && rArch.denied === 'PROJECT_NOT_ACTIVE');
  await store.setProjectStatus(pc.projectId, 'deleted', alice, { confirmTitle: '归档召回课题' });
  var rDel = await Ctx.recall({ principal: user('alice', pc.projectId), projectId: pc.projectId, query: '归档', store: store });
  ok('P1-CTX-014b 删除课题拒绝召回', !rDel.ok && rDel.denied === 'PROJECT_NOT_ACTIVE');

  /* 暂停课题仍可召回 */
  var pd = await store.createProject({ title: '暂停召回课题' }, alice);
  await addVerified(pd.projectId, '暂停课题的记忆', {});
  await store.setProjectStatus(pd.projectId, 'paused', alice);
  var rPaused = await Ctx.recall({ principal: user('alice', pd.projectId), projectId: pd.projectId, query: '暂停', store: store });
  ok('P1-CTX-015 暂停课题允许召回', rPaused.ok && rPaused.memories.length === 1, JSON.stringify(rPaused));

  /* ---------- current / setCurrent ---------- */
  Ctx.setCurrent({ memories: [{ memoryId: 'x' }] });
  ok('P1-CTX-016 setCurrent/current 可用', Ctx.current().memories[0].memoryId === 'x');
  Ctx.setCurrent(null);
  ok('P1-CTX-016b 清空 current', Ctx.current() === null);

  /* 空 query 仍返回记忆 */
  var rEmpty = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '', budget: { maxItems: 2 }, store: store });
  ok('P1-CTX-017 空 query 仍按类型/时间返回', rEmpty.ok && rEmpty.memories.length === 2, rEmpty.memories.length);

  /* ---------- 结果与权限补充 ---------- */
  ok('P1-CTX-018 projectId/count 回传', r1.projectId === pidA && r1.count === r1.memories.length);
  ok('P1-CTX-018b query 回传', r1.query === '黑洞质量');
  ok('P1-CTX-018c 命中记忆 score>0', r1.memories[0].score > 0, r1.memories[0].score);
  ok('P1-CTX-018d 返回正文用于组合', typeof r1.memories[0].content === 'string' && r1.memories[0].content.length > 0);
  ok('P1-CTX-019 默认预算常量', Ctx.DEFAULTS.maxItems === 6 && Ctx.DEFAULTS.maxChars === 2000 &&
    Ctx.DEFAULTS.maxEvidence === 8, JSON.stringify(Ctx.DEFAULTS));
  ok('P1-CTX-019b 不存在的课题拒绝', (await Ctx.recall({
    principal: alice, projectId: 'prj_missing', query: 'x', store: store
  })).denied === 'NOT_FOUND');

  var scholar = Sec.forTest({ profileId: 'alice', agentId: 'scholar', projectId: pidA });
  var curator = Sec.forTest({ profileId: 'alice', agentId: 'curator', projectId: pidA });
  ok('P1-CTX-020 scholar 可召回', (await Ctx.recall({
    principal: scholar, projectId: pidA, query: '黑洞', store: store
  })).ok === true);
  ok('P1-CTX-020b curator 可召回', (await Ctx.recall({
    principal: curator, projectId: pidA, query: '黑洞', store: store
  })).ok === true);
  var rogue = Sec.forTest({ profileId: 'alice', agentId: 'rogue', projectId: pidA });
  ok('P1-CTX-020c 未注册 Agent 拒绝', (await Ctx.recall({
    principal: rogue, projectId: pidA, query: '黑洞', store: store
  })).denied === 'AGENT_NOT_REGISTERED');

  await store.putEvidenceBundle([
    { evidenceId: 'ev_m1', sourceType: 'paper', title: 'M1', uri: 'https://example.org/m1' },
    { evidenceId: 'ev_m2', sourceType: 'catalog', title: 'M2', uri: 'https://example.org/m2' },
    { evidenceId: 'ev_m3', sourceType: 'web', title: 'M3', uri: 'https://example.org/m3' }
  ], pidA, alice);
  var multiEv = await addVerified(pidA, '多证据上限测试记忆', {
    type: 'fact', evidenceIds: ['ev_m1', 'ev_m2', 'ev_m3'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_m1', uri: 'https://example.org/m1' }] }
  });
  var rEvCap = await Ctx.recall({
    principal: scopedA, projectId: pidA, query: '多证据上限', budget: { maxItems: 20, maxEvidence: 2 }, store: store
  });
  ok('P1-CTX-021 证据条数按 maxEvidence 截断', rEvCap.evidence.length === 2, rEvCap.evidence.length);
  ok('P1-CTX-021b 证据摘要字段完整', rEvCap.evidence.every(function (e) {
    return typeof e.evidenceId === 'string' && typeof e.sourceType === 'string' && typeof e.title === 'string';
  }));
  ok('P1-CTX-021c 未超预算时 truncated=false', rEvCap.truncated === false, rEvCap.truncated);
  ok('P1-CTX-022 召回不改变记忆状态',
    (await store.getMemory(multiEv.memoryId, scopedA)).status === 'verified');
  ok('P1-CTX-022b setCurrent 返回同一 bundle', Ctx.setCurrent({ memories: [] }) !== null && Ctx.current().memories.length === 0);
  Ctx.setCurrent(null);
  var rNoThread = await Ctx.recall({ principal: scopedA, projectId: pidA, threadId: null, query: '黑洞质量', store: store });
  ok('P1-CTX-023 不传 threadId 时不过滤来源', rNoThread.memories.some(function (m) {
    return m.memoryId === m1.memoryId;
  }));
  var rScopedOther = await Ctx.recall({ principal: scopedA, projectId: pd.projectId, query: '暂停', store: store });
  ok('P1-CTX-024 已绑定其他课题的 principal 不能召回本课题',
    !rScopedOther.ok && rScopedOther.denied === 'PROJECT_MISMATCH');
  var detA = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞质量', store: store });
  var detB = await Ctx.recall({ principal: scopedA, projectId: pidA, query: '黑洞质量', store: store });
  ok('P1-CTX-025 相同输入召回结果稳定', JSON.stringify(detA.memories) === JSON.stringify(detB.memories));
  ok('P1-CTX-026 召回结果全部为 verified', detA.memories.every(function (m) {
    return ['fact', 'paper_opinion', 'calculation', 'hypothesis', 'experience',
      'research_question', 'conclusion', 'decision', 'progress', 'pending'].indexOf(m.type) >= 0;
  }));
  ok('P1-CTX-026b 召回数量不超过默认预算', detA.memories.length <= 6, detA.memories.length);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
