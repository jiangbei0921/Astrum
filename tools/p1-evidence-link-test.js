/* ASTRUM P1-03 Evidence / Claims 关联测试
 * 用法：node tools/p1-evidence-link-test.js
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
  'core/research-store.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var Sec = global.Security;
var RS = global.AstroResearchStore;

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
function user(pid) { return Sec.forTest({ principalType: 'user', profileId: 'alice', projectId: pid || null }); }

async function main() {
  var alice = user(null);
  var store = RS.create({ ownerProfileId: 'alice' });
  await store.init();
  var project = await store.createProject({ title: '证据链课题' }, alice);
  var pid = project.projectId;
  var scoped = user(pid);

  await store.putEvidenceBundle([
    { evidenceId: 'ev_1', sourceId: 'paper:1', sourceType: 'paper', title: 'Paper 1', uri: 'https://example.org/1', verification: { state: 'ok' } },
    { evidenceId: 'ev_2', sourceId: 'catalog:2', sourceType: 'catalog', title: 'Catalog 2', uri: 'https://example.org/2', verification: { state: 'ok' } }
  ], pid, alice);
  await store.putClaimBundle([
    { id: 'cl_1', type: 'quantitative', source: 'kepler', support: [{ eid: 'ev_1', strength: 'strong', basis: 'numeric' }, { eid: 'ev_2', strength: 'partial', basis: 'semantic' }], contradict: [], claimKey: 'k1' },
    { id: 'cl_2', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_1', strength: 'partial', basis: 'semantic' }], contradict: [{ eid: 'ev_2', strength: 'weak', basis: 'semantic' }], claimKey: 'k2' }
  ], pid, alice);

  /* ---------- 单 Claim 多 Evidence ---------- */
  var mem = await store.putMemory({
    projectId: pid, type: 'paper_opinion', content: '多证据观点', summary: '观点',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_1', uri: 'https://example.org/1' }] },
    evidenceIds: ['ev_1', 'ev_2'], claimIds: ['cl_1']
  }, alice);
  await store.transitionMemory(mem.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(mem.memoryId, 'under_review', scoped, {});
  var verified = await store.transitionMemory(mem.memoryId, 'verified', scoped, {});
  ok('P1-EV-001 单 Claim 多 Evidence 全部可解析', verified.status === 'verified' &&
    verified.evidenceIds.length === 2 && verified.claimIds[0] === 'cl_1');
  var evAll = await store.listEvidence(pid, alice);
  ok('P1-EV-001b 证据索引完整', evAll.length === 2 && !!evAll.find(function (e) { return e.evidenceId === 'ev_2'; }));

  /* ---------- 多 Claim 引用同一 Evidence ---------- */
  var clAll = await store.listClaims(pid, alice);
  var cl1 = clAll.find(function (c) { return c.id === 'cl_1'; });
  ok('P1-EV-002 多 Claim 引用同一 Evidence', cl1.support.length === 2 &&
    cl1.support[0].eid === 'ev_1' && cl1.support[1].eid === 'ev_2');
  ok('P1-EV-002b claim 记录带项目归属', cl1.projectId === pid);

  /* ---------- 缺失证据 ---------- */
  var dangling = await store.putMemory({
    projectId: pid, type: 'fact', content: '引用不存在的证据', summary: '缺失',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_missing', uri: '' }] },
    evidenceIds: ['ev_missing']
  }, alice);
  await store.transitionMemory(dangling.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(dangling.memoryId, 'under_review', scoped, {});
  await expectReject('P1-EV-003 Evidence 缺失 → DANGLING_EVIDENCE',
    store.transitionMemory(dangling.memoryId, 'verified', scoped, {}), 'DANGLING_EVIDENCE');
  var danglingNow = await store.getMemory(dangling.memoryId, scoped);
  ok('P1-EV-003b 缺失证据记忆保持 under_review', danglingNow.status === 'under_review');

  /* ---------- 来源缺失 ---------- */
  await store.putEvidenceBundle([{ evidenceId: 'ev_nosrc', sourceType: 'paper', title: '无来源' }], pid, alice);
  var nosrc = await store.putMemory({
    projectId: pid, type: 'fact', content: '来源缺失', summary: '无来源',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_nosrc', uri: '' }] },
    evidenceIds: ['ev_nosrc']
  }, alice);
  await store.transitionMemory(nosrc.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(nosrc.memoryId, 'under_review', scoped, {});
  await expectReject('P1-EV-004 来源缺失不得 verified',
    store.transitionMemory(nosrc.memoryId, 'verified', scoped, {}), 'EVIDENCE_SOURCE_MISSING');

  /* ---------- 证据更新触发复审 ---------- */
  var upd = await store.putMemory({
    projectId: pid, type: 'fact', content: '将因证据更新而复审', summary: '复审',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_upd', uri: 'https://example.org/old' }] },
    evidenceIds: ['ev_upd']
  }, alice);
  await store.putEvidenceBundle([{ evidenceId: 'ev_upd', sourceId: 'paper:upd', sourceType: 'paper', title: 'U', uri: 'https://example.org/old', verification: { state: 'ok' } }], pid, alice);
  await store.transitionMemory(upd.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(upd.memoryId, 'under_review', scoped, {});
  await store.transitionMemory(upd.memoryId, 'verified', scoped, {});
  await store.putEvidenceBundle([{ evidenceId: 'ev_upd', sourceId: 'paper:upd', sourceType: 'paper', title: 'U', uri: 'https://example.org/new', verification: { state: 'ok' } }], pid, alice);
  var updAfter = await store.getMemory(upd.memoryId, scoped);
  ok('P1-EV-005 Evidence 更新后记忆转 under_review', updAfter.status === 'under_review', updAfter.status);
  ok('P1-EV-005b 复审后清空 verifiedBy', updAfter.verifiedBy === null);

  /* ---------- Claim 被取代：旧记录不删 ---------- */
  await store.putClaimBundle([{ id: 'cl_new', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_1', strength: 'strong', basis: 'semantic' }], contradict: [], claimKey: 'k1' }], pid, alice);
  var clAfter = await store.listClaims(pid, alice);
  ok('P1-EV-006 新 Claim 写入且旧 Claim 保留', clAfter.some(function (c) { return c.id === 'cl_new'; }) &&
    clAfter.some(function (c) { return c.id === 'cl_1'; }));
  var relink = await store.linkMemory(mem.memoryId, { claimIds: ['cl_new'] }, scoped);
  ok('P1-EV-006b 记忆链可指向新 Claim', relink.claimIds[0] === 'cl_new');
  ok('P1-EV-006c 旧 Claim 未被删除', (await store.listClaims(pid, alice)).length >= 3);

  /* ---------- 冲突证据可查询 ---------- */
  var cl2 = (await store.listClaims(pid, alice)).find(function (c) { return c.id === 'cl_2'; });
  ok('P1-EV-007 冲突证据可查询', cl2.contradict.length === 1 && cl2.contradict[0].eid === 'ev_2');

  /* ---------- 课题归档/删除后证据保留 ---------- */
  await store.setProjectStatus(pid, 'archived', alice);
  var evArchived = await store.listEvidence(pid, alice);
  var clArchived = await store.listClaims(pid, alice);
  ok('P1-EV-008 归档后 Evidence 保留', evArchived.length >= 3, evArchived.length);
  ok('P1-EV-008b 归档后 Claim 保留', clArchived.length >= 3, clArchived.length);
  await store.setProjectStatus(pid, 'deleted', alice, { confirmTitle: '证据链课题' });
  ok('P1-EV-008c 删除后 Evidence/Claim 仍保留',
    (await store.listEvidence(pid, alice)).length >= 3 && (await store.listClaims(pid, alice)).length >= 3);

  /* ---------- 模型文字伪装 Evidence ---------- */
  var before = (await store.listEvidence(pid, alice)).length;
  var n = await store.putEvidenceBundle([{ title: '模型生成的文字', sourceType: 'llm', uri: 'llm://x' }], pid, alice);
  var after = (await store.listEvidence(pid, alice)).length;
  ok('P1-EV-009 无 evidenceId 的文字不落库', n === 0 && before === after, JSON.stringify({ n: n, before: before, after: after }));

  /* ---------- verifyProject ---------- */
  var project2 = await store.createProject({ title: '完整性课题' }, alice);
  var pid2 = project2.projectId;
  var scoped2 = user(pid2);
  await store.putMemory({
    projectId: pid2, type: 'progress', content: '干净记忆', summary: '干净',
    source: { kind: 'user', refs: [] }
  }, alice);
  await store.putMemory({
    projectId: pid2, type: 'fact', content: '悬空引用', summary: '悬空',
    source: { kind: 'paper', refs: [] }, evidenceIds: ['ev_x']
  }, alice);
  await store.putEvidenceBundle([{ evidenceId: 'ev_x2', sourceType: 'paper', title: '孤儿证据', uri: 'https://example.org/x' }], pid2, alice);
  var report = await store.verifyProject(pid2, alice);
  ok('P1-EV-010 verifyProject 报出悬空引用', !report.ok &&
    report.errors.some(function (e) { return e.code === 'DANGLING_EVIDENCE'; }), JSON.stringify(report.errors));
  ok('P1-EV-010b verifyProject 返回结构化 errors/warnings',
    Array.isArray(report.errors) && Array.isArray(report.warnings));
  var cleanProject = await store.createProject({ title: '无错误课题' }, alice);
  var cleanReport = await store.verifyProject(cleanProject.projectId, alice);
  ok('P1-EV-010c 空课题完整性通过', cleanReport.ok === true && cleanReport.errors.length === 0);

  /* ---------- 跨 Profile 不可解析 ---------- */
  var bobStore = RS.create({ ownerProfileId: 'bob' });
  var bob = Sec.forTest({ principalType: 'user', profileId: 'bob' });
  ok('P1-EV-011 跨 Profile 证据不可见', (await bobStore.listEvidence(pid, bob)).length === 0);
  ok('P1-EV-011b 跨 Profile 主张不可见', (await bobStore.listClaims(pid, bob)).length === 0);

  /* ---------- 关联完整性 ---------- */
  var linkedMem = await store.getMemory(mem.memoryId, scoped);
  ok('P1-EV-012 记忆→Claim→Evidence→Source 链路完整',
    linkedMem.claimIds.length === 1 && linkedMem.evidenceIds.length === 2 &&
    linkedMem.source.kind === 'paper' && !!linkedMem.source.refs[0].uri);

  /* ---------- 补充边界 ---------- */
  var nEv = await store.putEvidenceBundle([
    { evidenceId: 'ev_dup', sourceType: 'paper', title: 'D', uri: 'https://example.org/d' },
    { evidenceId: 'ev_dup2', sourceType: 'paper', title: 'D2', uri: 'https://example.org/d2' }
  ], pid2, alice);
  ok('P1-EV-013 批量写入证据计数正确', nEv === 2, nEv);
  var nCl = await store.putClaimBundle([
    { id: 'cl_dup1', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_dup', strength: 'weak', basis: 'semantic' }], contradict: [] },
    { id: 'cl_dup2', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_dup2', strength: 'weak', basis: 'semantic' }], contradict: [] }
  ], pid2, alice);
  ok('P1-EV-013b 批量写入主张计数正确', nCl === 2, nCl);
  var evP2 = await store.listEvidence(pid2, alice);
  ok('P1-EV-013c 证据按课题隔离', evP2.every(function (e) { return e.projectId === pid2; }));
  var clP2 = await store.listClaims(pid2, alice);
  ok('P1-EV-013d 主张按课题隔离', clP2.every(function (c) { return c.projectId === pid2; }));
  await store.putEvidenceBundle([{ evidenceId: 'ev_dup', sourceType: 'paper', title: 'D', uri: 'https://example.org/d' }], pid2, alice);
  var dupAfter = await store.getMemory(upd.memoryId, scoped);
  ok('P1-EV-014 证据内容未变不触发误降级', dupAfter.status === 'under_review');
  await expectReject('P1-EV-015 关联缺失主张拒绝',
    store.linkMemory(mem.memoryId, { claimIds: ['cl_missing'] }, scoped), 'DANGLING_CLAIM');
  var badMem = await store.putMemory({
    projectId: pid2, type: 'fact', content: '悬空主张', summary: '悬空主张',
    source: { kind: 'paper', refs: [] }, claimIds: ['cl_missing']
  }, alice);
  var report2 = await store.verifyProject(pid2, alice);
  ok('P1-EV-016 verifyProject 报出悬空主张',
    report2.errors.some(function (e) { return e.code === 'DANGLING_CLAIM'; }), JSON.stringify(report2.errors));
  var skipped = await store.putEvidenceBundle([{ title: '无 id' }, null, 'bad'], pid2, alice);
  ok('P1-EV-017 非法证据条目被跳过', skipped === 0, skipped);
  var skippedClaims = await store.putClaimBundle([{ type: 'qualitative' }, null], pid2, alice);
  ok('P1-EV-017b 非法主张条目被跳过', skippedClaims === 0, skippedClaims);
  var evCount = (await store.listEvidence(pid2, alice)).length;
  ok('P1-EV-018 跳过非法条目不影响既有数据', evCount >= 3, evCount);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
