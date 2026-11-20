/* ASTRUM P1-01 ResearchProject 测试
 * 用法：node tools/p1-project-test.js
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

['core/task.js', 'core/security.js', 'core/project.js', 'core/memory.js',
  'core/research-store.js', 'core/research-context.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var RS = global.AstroResearchStore;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function expectThrow(name, fn, code) {
  try { fn(); fail++; console.log('FAIL | ' + name + ' | 未抛错'); }
  catch (e) { ok(name, !code || e.code === code, 'code=' + (e && e.code)); }
}
async function expectReject(name, p, code) {
  try { await p; fail++; console.log('FAIL | ' + name + ' | 未拒绝'); }
  catch (e) { ok(name, !code || e.code === code, 'code=' + (e && e.code)); }
}

function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId, projectId: projectId || null });
}

async function main() {
  var alice = user('alice');
  var bob = user('bob');
  var store = RS.create({ ownerProfileId: 'alice' });
  var storeB = RS.create({ ownerProfileId: 'bob' });
  await store.init();

  /* ---------- 创建 ---------- */
  var p1 = await store.createProject({ title: '银河系中心', description: 'Sgr A* 研究', researchGoal: '测质量' }, alice);
  ok('P1-PRJ-001 创建课题 status=active', p1.status === 'active', p1.status);
  ok('P1-PRJ-001b profileId 来自 principal', p1.profileId === 'alice', p1.profileId);
  ok('P1-PRJ-001c 初始 version=1', p1.version === 1, p1.version);
  ok('P1-PRJ-001d 字段默认值正确',
    p1.archivedAt === null && p1.deletedAt === null && p1.schemaVersion === 1 &&
    p1.metadata.memoryCount === 0 && Array.isArray(p1.metadata.tags), JSON.stringify(p1.metadata));
  ok('P1-PRJ-001e 研究问题归一化',
    p1.researchQuestions.length === 0 && Array.isArray(p1.hypotheses), '');
  var p1withQ = await store.createProject({
    title: '带问题', researchQuestions: ['问题一', { text: '问题二', status: 'investigating' }],
    hypotheses: ['假设一'], profileId: 'hacker'
  }, alice);
  ok('P1-PRJ-001f 研究问题/假设结构化', p1withQ.researchQuestions.length === 2 &&
    p1withQ.researchQuestions[1].status === 'investigating' && p1withQ.hypotheses[0].id === 'h1');
  ok('P1-PRJ-001g profileId 不可由调用方指定', p1withQ.profileId === 'alice', p1withQ.profileId);
  await expectReject('P1-PRJ-002 title 为空拒绝',
    store.createProject({ title: '   ' }, alice), 'E_PROJECT_TITLE');
  await expectReject('P1-PRJ-002b 超长 title 拒绝',
    store.createProject({ title: new Array(90).join('x') }, alice), 'E_PROJECT_TITLE');

  /* ---------- 编辑与版本 ---------- */
  var p1v2 = await store.updateProject(p1.projectId, { title: '银河系中心 v2', version: 1 }, alice);
  ok('P1-PRJ-003 编辑成功且 version+1', p1v2.version === 2 && p1v2.title === '银河系中心 v2',
    JSON.stringify({ v: p1v2.version, t: p1v2.title }));
  var p1v3 = await store.updateProject(p1.projectId, { researchGoal: '新目标', version: 2 }, alice);
  ok('P1-PRJ-003b 研究目标可编辑且 version 继续递增', p1v3.version === 3 && p1v3.researchGoal === '新目标');
  ok('P1-PRJ-003c 编辑不改状态', p1v3.status === 'active');
  await expectReject('P1-PRJ-004 旧 version 编辑冲突',
    store.updateProject(p1.projectId, { title: 'x', version: 1 }, alice), 'VERSION_CONFLICT');

  /* ---------- 状态流转 ---------- */
  var paused = await store.setProjectStatus(p1.projectId, 'paused', alice);
  ok('P1-PRJ-005a 暂停', paused.status === 'paused', paused.status);
  var resumed = await store.setProjectStatus(p1.projectId, 'active', alice);
  ok('P1-PRJ-005b 恢复', resumed.status === 'active', resumed.status);
  var archived = await store.setProjectStatus(p1.projectId, 'archived', alice);
  ok('P1-PRJ-005c 归档并记录 archivedAt', archived.status === 'archived' && !!archived.archivedAt, archived.archivedAt);
  var unarchived = await store.setProjectStatus(p1.projectId, 'paused', alice);
  ok('P1-PRJ-005d 恢复归档回到 paused', unarchived.status === 'paused', unarchived.status);
  ok('P1-PRJ-005f 状态变更递增 version', unarchived.version > archived.version, unarchived.version);
  var pausedList = await store.listProjects(alice, { status: 'paused' });
  ok('P1-PRJ-005g 列表按状态过滤', pausedList.length === 1 && pausedList[0].projectId === p1.projectId, pausedList.length);
  await store.setProjectStatus(p1.projectId, 'active', alice);

  /* ---------- 隔离 ---------- */
  var p2 = await store.createProject({ title: '第二个课题' }, alice);
  ok('P1-PRJ-007c 课题 ID 唯一', p2.projectId !== p1.projectId);
  ok('P1-PRJ-008c 读取不存在的课题返回 null', (await store.getProject('prj_missing', alice)) === null);
  var listA = await store.listProjects(alice, {});
  ok('P1-PRJ-007 同 Profile 多课题全可见', listA.length === 3, listA.length);
  ok('P1-PRJ-008 跨 Profile 读取为空', (await storeB.getProject(p1.projectId, bob)) === null);
  ok('P1-PRJ-008b 跨 Profile 列表为空', (await storeB.listProjects(bob, {})).length === 0);
  await expectReject('P1-PRJ-009 跨 Profile 覆盖写入拒绝',
    storeB.updateProject(p1.projectId, { title: 'hack', version: p1v2.version }, bob), 'NOT_FOUND');

  /* 跨 Project（同 Profile，principal 已绑定 Project1） */
  var p1Scoped = user('alice', p1.projectId);
  var cross = await store.listMemories(p2.projectId, p1Scoped, {});
  ok('P1-PRJ-007b 跨 Project 记忆读取为空', cross.length === 0, cross.length);

  /* ---------- 持久化 ---------- */
  var store2 = RS.create({ ownerProfileId: 'alice' });
  await store2.init();
  var reread = await store2.getProject(p1.projectId, alice);
  ok('P1-PRJ-010 重建 store 后仍可读取', !!reread && reread.title === '银河系中心 v2',
    reread && reread.title);
  ok('P1-PRJ-010b 后端为 localStorage 回退', store2.backend() === 'ls', store2.backend());

  /* ---------- 记忆与召回：删除前后 ---------- */
  var mem = await store.putMemory({
    projectId: p1.projectId, type: 'progress', content: 'Sgr A* 质量约 4e6 太阳质量',
    summary: 'Sgr A* 质量约 4e6 M⊙', source: { kind: 'user', refs: [] }
  }, alice);
  var scopedP1 = user('alice', p1.projectId);
  await store.transitionMemory(mem.memoryId, 'proposed', scopedP1, {});
  await store.transitionMemory(mem.memoryId, 'under_review', scopedP1, {});
  var verified = await store.transitionMemory(mem.memoryId, 'verified', scopedP1, {});
  ok('P1-PRJ-011a 用户可审核记忆', verified.status === 'verified', verified.status);
  var recall1 = await global.AstroResearchContext.recall({
    principal: scopedP1, projectId: p1.projectId, query: 'Sgr A* 质量', store: store
  });
  ok('P1-PRJ-011b 删除前可召回', recall1.ok && recall1.memories.length === 1, JSON.stringify(recall1));

  await store.putEvidenceBundle([{ evidenceId: 'ev_keep_1', title: '保留证据', sourceType: 'paper', uri: 'https://example.org/e1' }], p1.projectId, alice);
  await expectReject('P1-PRJ-006a 删除需标题匹配（错误标题拒绝）',
    store.setProjectStatus(p1.projectId, 'deleted', alice, { confirmTitle: '错误标题' }), 'CONFIRM_REQUIRED');
  await store.setProjectStatus(p1.projectId, 'deleted', alice, { confirmTitle: '银河系中心 v2' });
  var deletedList = await store.listProjects(alice, {});
  ok('P1-PRJ-006b 删除后默认列表隐藏', !deletedList.some(function (x) { return x.projectId === p1.projectId; }));
  var withDeleted = await store.listProjects(alice, { includeDeleted: true });
  ok('P1-PRJ-006e 显式包含删除时可列出', withDeleted.some(function (x) {
    return x.projectId === p1.projectId && x.status === 'deleted' && !!x.deletedAt;
  }));
  var recall2 = await global.AstroResearchContext.recall({
    principal: scopedP1, projectId: p1.projectId, query: 'Sgr A*', store: store
  });
  ok('P1-PRJ-011c 删除后不召回', !recall2.ok && recall2.memories.length === 0, JSON.stringify(recall2));
  var evAfter = await store.listEvidence(p1.projectId, alice);
  ok('P1-PRJ-012 删除后 Evidence 保留', evAfter.length === 1 && evAfter[0].evidenceId === 'ev_keep_1');
  var memAfter = await store.listMemories(p1.projectId, scopedP1, {});
  ok('P1-PRJ-012b 删除后 Memory 保留但不可召回', memAfter.length === 1, memAfter.length);

  /* ---------- 删除确认与恢复 ---------- */
  await expectReject('P1-PRJ-006c 确认标题不匹配拒绝删除',
    store.setProjectStatus(p2.projectId, 'deleted', alice, { confirmTitle: '错误标题' }), 'CONFIRM_REQUIRED');
  var restored = await store.setProjectStatus(p1.projectId, 'active', alice);
  ok('P1-PRJ-006d 软删除可恢复', restored.status === 'active' && !restored.deletedAt, restored.status);

  /* ---------- 非法状态流转 ---------- */
  await expectReject('P1-PRJ-005e 归档→active 非法',
    store.setProjectStatus(p2.projectId, 'active', alice), 'INVALID_TRANSITION');

  /* ---------- 无 principal 写入拒绝 ---------- */
  await expectReject('P1-PRJ-013 无 principal 创建拒绝',
    store.createProject({ title: 'x' }, null), 'INVALID_CONTEXT');

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
