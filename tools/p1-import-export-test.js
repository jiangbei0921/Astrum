/* ASTRUM P1-06 导入导出测试
 * 用法：node tools/p1-import-export-test.js
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
async function expectReject(name, p, code) {
  try { await p; fail++; console.log('FAIL | ' + name + ' | 未拒绝'); }
  catch (e) { ok(name, !code || e.code === code, 'code=' + (e && e.code)); }
}
function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId, projectId: projectId || null });
}

async function main() {
  var alice = user('alice');
  var store = RS.create({ ownerProfileId: 'alice' });
  await store.init();
  var p = await store.createProject({
    title: '导入导出课题', description: '完整关系测试', researchGoal: '验证 Schema',
    researchQuestions: ['Q1']
  }, alice);
  var pid = p.projectId;
  var scoped = user('alice', pid);

  await store.putEvidenceBundle([
    { evidenceId: 'ev1', sourceId: 'paper:1', sourceType: 'paper', title: 'E1', uri: 'https://example.org/1', verification: { state: 'ok' } },
    { evidenceId: 'ev2', sourceId: 'catalog:2', sourceType: 'catalog', title: 'E2', uri: 'https://example.org/2', verification: { state: 'ok' } }
  ], pid, alice);
  await store.putClaimBundle([
    { id: 'cl1', type: 'qualitative', source: 'llm', support: [{ eid: 'ev1', strength: 'strong', basis: 'semantic' }], contradict: [] },
    { id: 'cl2', type: 'quantitative', source: 'kepler', support: [{ eid: 'ev2', strength: 'partial', basis: 'numeric' }], contradict: [{ eid: 'ev1', strength: 'weak', basis: 'semantic' }] }
  ], pid, alice);

  async function add(text, extra, verify) {
    var input = {
      projectId: pid, type: 'progress', content: text, summary: text,
      source: { kind: 'user', refs: [] }
    };
    Object.keys(extra || {}).forEach(function (k) { input[k] = extra[k]; });
    var m = await store.putMemory(input, alice);
    if (verify) {
      await store.transitionMemory(m.memoryId, 'proposed', scoped, {});
      await store.transitionMemory(m.memoryId, 'under_review', scoped, {});
      await store.transitionMemory(m.memoryId, 'verified', scoped, {});
      m = await store.getMemory(m.memoryId, scoped);
    }
    return m;
  }

  var fact = await add('已核实事实', {
    type: 'fact', evidenceIds: ['ev1'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev1', uri: 'https://example.org/1' }] }
  }, true);
  var prop = await add('待审核观点');
  await store.transitionMemory(prop.memoryId, 'proposed', scoped, {});
  var rej = await add('被拒绝记录');
  await store.transitionMemory(rej.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(rej.memoryId, 'under_review', scoped, {});
  await store.transitionMemory(rej.memoryId, 'rejected', scoped, {});
  var arch = await add('已归档记录', {}, true);
  await store.transitionMemory(arch.memoryId, 'archived', scoped, {});
  var oldM = await add('旧结论', {}, true);
  var newM = await add('新结论', {}, true);
  await store.transitionMemory(oldM.memoryId, 'superseded', scoped, { supersededBy: newM.memoryId });
  var concl = await add('带主张的结论', {
    type: 'conclusion', claimIds: ['cl1'],
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev1', uri: 'https://example.org/1' }] }
  }, true);

  /* ---------- 导出 ---------- */
  var bundle = await store.exportProject(pid, alice);
  ok('P1-IO-001 Schema 版本正确', bundle.schema === 'astrum.project/1', bundle.schema);
  ok('P1-IO-001b 导出含 exportedAt', typeof bundle.exportedAt === 'string' && bundle.exportedAt.length > 0);
  ok('P1-IO-001c 导出含 project', bundle.project && bundle.project.projectId === pid);
  ok('P1-IO-002 导出含全部记忆状态', bundle.memories.length === 7, bundle.memories.length);
  ok('P1-IO-002b 记忆状态覆盖 verified/proposed/rejected/archived/superseded',
    ['verified', 'proposed', 'rejected', 'archived', 'superseded'].every(function (st) {
      return bundle.memories.some(function (m) { return m.status === st; });
    }));
  ok('P1-IO-003 导出含 evidence/claims', bundle.evidence.length === 2 && bundle.claims.length === 2);
  ok('P1-IO-003b 导出含 threads/checkpoints 数组', Array.isArray(bundle.threads) && Array.isArray(bundle.checkpoints));
  ok('P1-IO-004 manifest counts 与数组一致',
    bundle.manifest.counts.memories === bundle.memories.length &&
    bundle.manifest.counts.evidence === bundle.evidence.length &&
    bundle.manifest.counts.claims === bundle.claims.length, JSON.stringify(bundle.manifest.counts));
  ok('P1-IO-004b manifest checksum 非空',
    typeof bundle.manifest.checksum === 'string' && bundle.manifest.checksum.length > 0);
  ok('P1-IO-004c 导出不修改源数据', (await store.listMemories(pid, scoped, { status: 'verified' })).length === 3);

  /* ---------- 导入到新档案 ---------- */
  var carol = user('carol');
  var target = RS.create({ ownerProfileId: 'carol' });
  await target.init();
  var imported = await target.importProject(bundle, carol, {});
  ok('P1-IO-005 导入成功并生成新 projectId', imported.ok && imported.projectId && imported.projectId !== pid);
  ok('P1-IO-005b 导入计数正确', imported.counts.memories === 7 && imported.counts.evidence === 2 && imported.counts.claims === 2,
    JSON.stringify(imported.counts));
  var newProj = await target.getProject(imported.projectId, carol);
  ok('P1-IO-006 导入课题归属新档案', newProj && newProj.profileId === 'carol' && newProj.status === 'active');
  ok('P1-IO-006b 课题标题/目标保留', newProj.title === '导入导出课题' && newProj.researchGoal === '验证 Schema');

  var importedMems = await target.listMemories(imported.projectId, user('carol', imported.projectId), { status: null, limit: 100 });
  ok('P1-IO-007 导入记忆数量完整', importedMems.length === 7, importedMems.length);
  ok('P1-IO-007b 原 verified 记忆降级为 proposed', (function () {
    var x = importedMems.find(function (m) { return m.content === '已核实事实'; });
    return x && x.status === 'proposed' && x.verifiedAt === null;
  })());
  ok('P1-IO-007c 原 archived 记忆降级为 proposed', (function () {
    var x = importedMems.find(function (m) { return m.content === '已归档记录'; });
    return x && x.status === 'proposed';
  })());
  ok('P1-IO-007d 原 superseded 记忆降级为 proposed', (function () {
    var x = importedMems.find(function (m) { return m.content === '旧结论'; });
    return x && x.status === 'proposed';
  })());
  ok('P1-IO-007e draft/proposed/rejected 状态保留', (function () {
    var x = importedMems.find(function (m) { return m.content === '被拒绝记录'; });
    return x && x.status === 'rejected';
  })());
  ok('P1-IO-008 所有记忆 ID 已重生成', importedMems.every(function (m) {
    return m.memoryId.indexOf('mem_') === 0 && m.memoryId !== fact.memoryId;
  }));
  ok('P1-IO-008b idMap 包含四类映射',
    imported.idMap && imported.idMap.project && imported.idMap.memories &&
    imported.idMap.evidence && imported.idMap.claims);

  var newEv = await target.listEvidence(imported.projectId, carol);
  ok('P1-IO-009 证据 ID 已重生成', newEv.length === 2 && newEv.every(function (e) {
    return e.evidenceId !== 'ev1' && e.evidenceId !== 'ev2';
  }));
  var newCl = await target.listClaims(imported.projectId, carol);
  ok('P1-IO-009b 主张 ID 已重生成', newCl.length === 2 && newCl.every(function (c) {
    return c.id !== 'cl1' && c.id !== 'cl2';
  }));
  ok('P1-IO-009c Claim.support 指向新 Evidence', (function () {
    return newCl.every(function (c) {
      return (c.support || []).every(function (s) {
        return newEv.some(function (e) { return e.evidenceId === s.eid; });
      });
    });
  })());
  ok('P1-IO-009d Claim.contradict 指向新 Evidence', (function () {
    var c = newCl.find(function (x) { return x.contradict && x.contradict.length; });
    return !!c && newEv.some(function (e) { return e.evidenceId === c.contradict[0].eid; });
  })());
  var importedConcl = importedMems.find(function (m) { return m.content === '带主张的结论'; });
  ok('P1-IO-010 记忆 claimIds 指向新 Claim',
    !!importedConcl && newCl.some(function (c) { return c.id === importedConcl.claimIds[0]; }));
  ok('P1-IO-010b 记忆 evidenceIds 指向新 Evidence',
    !!importedConcl && importedConcl.evidenceIds.every(function (id) {
      return newEv.some(function (e) { return e.evidenceId === id; });
    }));
  ok('P1-IO-010c source.refs 指向新 Evidence', (function () {
    var ref = importedConcl.source.refs[0];
    return newEv.some(function (e) { return e.evidenceId === ref.id; });
  })());
  var integrity = await target.verifyProject(imported.projectId, user('carol', imported.projectId));
  ok('P1-IO-011 导入后关系完整无悬空', integrity.ok === true, JSON.stringify(integrity.errors));

  /* ---------- 原库不受影响 ---------- */
  ok('P1-IO-011b 原课题仍存在', !!(await store.getProject(pid, alice)));
  ok('P1-IO-011c 原库记忆数量不变', (await store.listMemories(pid, scoped, { status: null, limit: 100 })).length === 6);

  /* ---------- 重复导入 ---------- */
  var imported2 = await target.importProject(bundle, carol, {});
  ok('P1-IO-012 重复导入生成不同课题', imported2.projectId !== imported.projectId);
  ok('P1-IO-012b 重复导入后课题数递增', (await target.listProjects(carol, {})).length === 2);

  /* ---------- 非法输入 ---------- */
  await expectReject('P1-IO-013 字符串输入拒绝', target.importProject('not-an-object', carol), 'INVALID_BUNDLE');
  await expectReject('P1-IO-013b schema 不匹配拒绝', target.importProject({
    schema: 'other/1', project: { title: 'x' }
  }, carol), 'INVALID_BUNDLE');
  await expectReject('P1-IO-013c 缺少 title 拒绝', target.importProject({
    schema: 'astrum.project/1', project: {}
  }, carol), 'INVALID_BUNDLE');
  var missingEvBundle = JSON.parse(JSON.stringify(bundle));
  missingEvBundle.evidence = [];
  await expectReject('P1-IO-013d 证据引用缺失拒绝', target.importProject(missingEvBundle, carol), 'DANGLING_EVIDENCE');
  var missingClBundle = JSON.parse(JSON.stringify(bundle));
  missingClBundle.claims = [];
  await expectReject('P1-IO-013e 主张引用缺失拒绝', target.importProject(missingClBundle, carol), 'DANGLING_CLAIM');
  var beforeCount = (await target.listProjects(carol, {})).length;
  ok('P1-IO-013f 失败导入无残留课题', beforeCount === 2, beforeCount);

  var big = JSON.parse(JSON.stringify(bundle));
  big.project.description = new Array(10 * 1024 * 1024 + 10).join('x');
  await expectReject('P1-IO-014 超过 10MB 拒绝', target.importProject(big, carol), 'BUNDLE_TOO_LARGE');

  var polluted = JSON.parse('{"schema":"astrum.project/1","__proto__":{"polluted":true},"project":{"title":"p"}}');
  await expectReject('P1-IO-015 原型污染字段拒绝', target.importProject(polluted, carol), 'INVALID_BUNDLE');
  await expectReject('P1-IO-015b 无 principal 导入拒绝', target.importProject(bundle, null), 'INVALID_CONTEXT');

  /* ---------- 导出权限 ---------- */
  var bob = user('bob');
  var bobStore = RS.create({ ownerProfileId: 'bob' });
  await expectReject('P1-IO-016 跨档案导出拒绝', bobStore.exportProject(pid, bob), 'NOT_FOUND');

  /* ---------- 失败回滚：写入阶段异常 ---------- */
  var rollbackBundle = JSON.parse(JSON.stringify(bundle));
  rollbackBundle.memories[0].content = '';
  rollbackBundle.memories[0].summary = '';
  var beforeRollback = (await target.listProjects(carol, {})).length;
  await expectReject('P1-IO-017 写入阶段校验失败', target.importProject(rollbackBundle, carol), 'E_MEMORY_CONTENT');
  ok('P1-IO-017b 回滚后无残留课题', (await target.listProjects(carol, {})).length === beforeRollback,
    (await target.listProjects(carol, {})).length);

  /* ---------- 已删除课题可导出（保留审计） ---------- */
  await store.setProjectStatus(pid, 'deleted', alice, { confirmTitle: '导入导出课题' });
  var deletedBundle = await store.exportProject(pid, alice);
  ok('P1-IO-018 已删除课题仍可导出备份', deletedBundle.project.status === 'deleted' &&
    deletedBundle.memories.length === 7);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
