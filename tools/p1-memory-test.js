/* ASTRUM P1-02 ResearchMemory 测试
 * 用法：node tools/p1-memory-test.js
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
var M = global.AstroMemory;
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
function user(profileId, projectId) {
  return Sec.forTest({ principalType: 'user', profileId: profileId, projectId: projectId || null });
}

function candidate(pid, over) {
  var base = {
    projectId: pid, type: 'progress', content: '候选内容 ' + Math.random(),
    summary: '候选', source: { kind: 'user', refs: [] }
  };
  Object.keys(over || {}).forEach(function (k) { base[k] = over[k]; });
  return base;
}

async function toVerified(store, m, principal) {
  await store.transitionMemory(m.memoryId, 'proposed', principal, { reason: 'test' });
  await store.transitionMemory(m.memoryId, 'under_review', principal, { reason: 'test' });
  return store.transitionMemory(m.memoryId, 'verified', principal, { reason: 'test' });
}

async function main() {
  var alice = user('alice');
  var store = RS.create({ ownerProfileId: 'alice' });
  await store.init();
  var project = await store.createProject({ title: '记忆测试课题' }, alice);
  var pid = project.projectId;
  var scoped = user('alice', pid);
  var scholar = Sec.forTest({ profileId: 'alice', agentId: 'scholar', projectId: pid });
  var muse = Sec.forTest({ profileId: 'alice', agentId: 'muse', projectId: pid });

  /* ---------- 类型与字段校验 ---------- */
  ok('P1-MEM-001 10 类记忆枚举完整', M.TYPES.length === 10, M.TYPES.length);
  var allValid = true;
  M.TYPES.forEach(function (t) {
    try {
      var x = M.make({ profileId: 'alice', projectId: pid, type: t, content: '内容', summary: '摘要' });
      M.validate(x);
    } catch (e) { allValid = false; }
  });
  ok('P1-MEM-001b 10 类均可构造并校验', allValid);
  var bad = M.make({ profileId: 'alice', projectId: pid, type: 'fact', content: 'x' });
  bad.type = 'unknown';
  ok('P1-MEM-001c 非法 type 拒绝', (function () {
    try { M.validate(bad); return false; } catch (e) { return e.code === 'E_MEMORY_TYPE'; }
  })());
  ok('P1-MEM-001d 空内容拒绝', (function () {
    try { M.validate(M.make({ profileId: 'alice', projectId: pid, type: 'fact', content: '  ' })); return false; }
    catch (e) { return e.code === 'E_MEMORY_CONTENT'; }
  })());

  /* ---------- 候选与审核 ---------- */
  var m1 = await store.putMemory(candidate(pid, {
    type: 'fact', content: '仙女座距离约 2.5 Mly', summary: 'M31 距离约 2.5 Mly',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_a', uri: 'https://example.org/a' }] },
    evidenceIds: ['ev_a']
  }), alice);
  var vDraft = m1.version;
  ok('P1-MEM-002a 写入即为 draft', m1.status === 'draft', m1.status);
  ok('P1-MEM-002b 初始 version=1', m1.version === 1);
  await expectReject('P1-MEM-012 越级 draft→verified 拒绝',
    store.transitionMemory(m1.memoryId, 'verified', scoped, {}), 'INVALID_TRANSITION');
  var m1b = await store.transitionMemory(m1.memoryId, 'proposed', scoped, {});
  var vProposed = m1b.version;
  ok('P1-MEM-002c draft→proposed', m1b.status === 'proposed');
  var m1c = await store.transitionMemory(m1.memoryId, 'under_review', scoped, {});
  var vReview = m1c.version;
  ok('P1-MEM-002d proposed→under_review', m1c.status === 'under_review');

  /* 证据未落库：核实必须失败 */
  await expectReject('P1-MEM-006 fact 无证据不得 verified',
    store.transitionMemory(m1.memoryId, 'verified', scoped, {}),
    ['DANGLING_EVIDENCE', 'EVIDENCE_REQUIRED', 'MISSING_SOURCE']);

  await store.putEvidenceBundle([{
    evidenceId: 'ev_a', sourceId: 'paper:a', sourceType: 'paper', title: 'Andromeda distance',
    uri: 'https://example.org/a', verification: { state: 'ok' }
  }], pid, alice);
  var m1d = await store.transitionMemory(m1.memoryId, 'verified', scoped, {});
  var vVerified = m1d.version;
  ok('P1-MEM-004 用户审核通过 verified', m1d.status === 'verified' && !!m1d.verifiedAt && m1d.verifiedBy === 'user',
    JSON.stringify({ s: m1d.status, v: m1d.verifiedBy }));

  var m2 = await store.putMemory(candidate(pid, { content: '待拒绝的内容', type: 'progress' }), alice);
  await store.transitionMemory(m2.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(m2.memoryId, 'under_review', scoped, {});
  var m2r = await store.transitionMemory(m2.memoryId, 'rejected', scoped, { reason: '证据不足' });
  ok('P1-MEM-005 审核拒绝进入 rejected', m2r.status === 'rejected');
  var m2d = await store.transitionMemory(m2.memoryId, 'draft', scoped, { reason: 'revise' });
  ok('P1-MEM-005b rejected→draft 可修订', m2d.status === 'draft');

  /* ---------- Agent 不能自证 ---------- */
  var m3 = await store.putMemory(candidate(pid, { content: 'Agent 候选', type: 'progress' }), scholar);
  ok('P1-MEM-003a 被授权 Agent 可提交候选', m3.status === 'draft');
  await store.transitionMemory(m3.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(m3.memoryId, 'under_review', scoped, {});
  var agentErr = null;
  try { await store.transitionMemory(m3.memoryId, 'verified', scholar, {}); }
  catch (e) { agentErr = e.code; }
  ok('P1-MEM-003b Agent 不能 verified', agentErr === 'CAPABILITY_NOT_GRANTED' || agentErr === 'APPROVER_NOT_USER', agentErr);
  await expectReject('P1-MEM-003c muse 也不能 verified',
    store.transitionMemory(m3.memoryId, 'verified', muse, {}),
    ['CAPABILITY_NOT_GRANTED', 'APPROVER_NOT_USER']);

  /* ---------- 类型最低条件 ---------- */
  var po = await store.putMemory(candidate(pid, {
    type: 'paper_opinion', content: '论文观点', summary: '观点',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_a', uri: 'https://example.org/a' }] },
    evidenceIds: ['ev_a']
  }), alice);
  await store.transitionMemory(po.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(po.memoryId, 'under_review', scoped, {});
  await expectReject('P1-MEM-007 paper_opinion 无 claimIds 不得 verified',
    store.transitionMemory(po.memoryId, 'verified', scoped, {}), 'EVIDENCE_AND_CLAIM_REQUIRED');

  var calc = await store.putMemory(candidate(pid, {
    type: 'calculation', content: '轨道周期计算', summary: '周期',
    source: { kind: 'calculation', refs: [{ kind: 'calculation', id: 'cl_calc', uri: '' }] },
    claimIds: ['cl_calc']
  }), alice);
  await store.putClaimBundle([{
    id: 'cl_calc', type: 'quantitative', source: 'kepler',
    support: [{ eid: 'ev_a', strength: 'strong', basis: 'numeric' }], contradict: [],
    calc: { value: 1, unit: 'yr', epoch: 'J2000', frame: 'icrs', source: 'kepler', method: 'test', computedAt: '2026-01-01' }
  }], pid, alice);
  await store.transitionMemory(calc.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(calc.memoryId, 'under_review', scoped, {});
  var calcV = await store.transitionMemory(calc.memoryId, 'verified', scoped, {});
  ok('P1-MEM-007b calculation 有 calc 主张可 verified', calcV.status === 'verified');

  var concl = await store.putMemory(candidate(pid, {
    type: 'conclusion', content: '结论', summary: '结论',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_a', uri: 'https://example.org/a' }] },
    claimIds: ['cl_calc']
  }), alice);
  await store.transitionMemory(concl.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(concl.memoryId, 'under_review', scoped, {});
  var conclV = await store.transitionMemory(concl.memoryId, 'verified', scoped, {});
  ok('P1-MEM-007c conclusion 有支持主张可 verified', conclV.status === 'verified');

  /* ---------- 无效证据 ---------- */
  await store.putEvidenceBundle([{
    evidenceId: 'ev_bad', sourceType: 'paper', title: '无效证据', uri: '',
    verification: { state: 'invalid' }
  }], pid, alice);
  var badMem = await store.putMemory(candidate(pid, {
    type: 'fact', content: '引用无效证据', summary: '无效',
    source: { kind: 'paper', refs: [{ kind: 'paper', id: 'ev_bad', uri: '' }] },
    evidenceIds: ['ev_bad']
  }), alice);
  await store.transitionMemory(badMem.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(badMem.memoryId, 'under_review', scoped, {});
  await expectReject('P1-MEM-011 无效/冲突证据只能停留 under_review',
    store.transitionMemory(badMem.memoryId, 'verified', scoped, {}), 'EVIDENCE_INVALID');
  var badNow = await store.getMemory(badMem.memoryId, scoped);
  ok('P1-MEM-011b 失败后状态未变', badNow.status === 'under_review', badNow.status);

  /* ---------- 取代链 ---------- */
  var oldMem = await store.putMemory(candidate(pid, { content: '旧结论', type: 'progress' }), alice);
  await toVerified(store, oldMem, scoped);
  var newMem = await store.putMemory(candidate(pid, {
    content: '新结论', type: 'progress', supersedes: oldMem.memoryId
  }), alice);
  await toVerified(store, newMem, scoped);
  var oldSup = await store.transitionMemory(oldMem.memoryId, 'superseded', scoped, { supersededBy: newMem.memoryId });
  var newAfter = await store.getMemory(newMem.memoryId, scoped);
  ok('P1-MEM-008a 旧记忆转 superseded', oldSup.status === 'superseded' && oldSup.supersededBy === newMem.memoryId);
  ok('P1-MEM-008b 新记忆 supersedes 双向一致', newAfter.supersedes === oldMem.memoryId);
  ok('P1-MEM-009 取代成环拒绝', (function () {
    var byId = {};
    byId.a = { memoryId: 'a', supersedes: 'b' };
    byId.b = { memoryId: 'b', supersedes: 'a' };
    try { M.assertNoCycle(byId, 'a', 'b'); return false; }
    catch (e) { return e.code === 'SUPERSEDE_CYCLE'; }
  })());

  /* ---------- 去重 ---------- */
  var d1 = await store.putMemory(candidate(pid, { content: '重复内容', type: 'progress' }), alice);
  var d2 = await store.putMemory(candidate(pid, { content: '重复内容', type: 'progress' }), alice);
  ok('P1-MEM-010 同 fingerprint 去重', d2.memoryId === d1.memoryId && d2.duplicate === true,
    JSON.stringify({ a: d1.memoryId, b: d2.memoryId, dup: d2.duplicate }));
  var dList = await store.listMemories(pid, scoped, { status: ['draft', 'proposed'] });
  ok('P1-MEM-010b 去重后仅一条', dList.filter(function (x) { return x.memoryId === d1.memoryId; }).length === 1);

  /* ---------- 归档与来源链 ---------- */
  var v1 = await store.getMemory(m1.memoryId, scoped);
  var arch = await store.transitionMemory(m1.memoryId, 'archived', scoped, { reason: 'archive' });
  ok('P1-MEM-013 归档后状态 archived', arch.status === 'archived');
  var verifiedList = await store.listMemories(pid, scoped, { status: 'verified' });
  ok('P1-MEM-013b 默认召回集合不含归档', !verifiedList.some(function (x) { return x.memoryId === m1.memoryId; }));
  ok('P1-MEM-014 来源链字段持久化', !!v1.sourceThreadId === false &&
    v1.evidenceIds[0] === 'ev_a' && v1.source.kind === 'paper' &&
    v1.source.refs[0].id === 'ev_a', JSON.stringify(v1.source));
  ok('P1-MEM-014b claimIds 持久化', conclV.claimIds[0] === 'cl_calc');

  /* ---------- 版本单调 ---------- */
  var versions = [vDraft, vProposed, vReview, vVerified];
  ok('P1-MEM-015 每次写入 version 递增',
    versions.every(function (v, i) { return i === 0 || v > versions[i - 1]; }), JSON.stringify(versions));
  ok('P1-MEM-015b 归档后 version 继续递增', arch.version > v1.version, arch.version);

  /* ---------- 事件与审计留痕 ---------- */
  ok('P1-MEM-016 审核留痕（verifiedBy/verifiedAt）', !!m1d.verifiedAt && m1d.verifiedBy === 'user');
  var m4 = await store.putMemory(candidate(pid, { content: '将被拒绝的内容', type: 'progress' }), alice);
  await store.transitionMemory(m4.memoryId, 'proposed', scoped, {});
  await store.transitionMemory(m4.memoryId, 'under_review', scoped, {});
  await store.transitionMemory(m4.memoryId, 'rejected', scoped, { reason: 'no-source' });
  var evAfter = await store.listMemories(pid, scoped, { status: 'rejected' });
  ok('P1-MEM-016b 拒绝记录保留并可查询', evAfter.some(function (x) { return x.memoryId === m4.memoryId; }));

  /* ---------- 非法输入 ---------- */
  await expectReject('P1-MEM-017 记忆必须属于课题',
    store.putMemory({ type: 'progress', content: 'x', summary: 'x' }, alice), 'PROJECT_REQUIRED');
  await expectReject('P1-MEM-018 暂停课题不得新增记忆',
    (async function () {
      var p2 = await store.createProject({ title: '暂停课题' }, alice);
      await store.setProjectStatus(p2.projectId, 'paused', alice);
      return store.putMemory(candidate(p2.projectId), alice);
    })(), 'PROJECT_PAUSED');

  /* ---------- 模型级补充 ---------- */
  ok('P1-MEM-019 fingerprint 归一化稳定',
    M.fingerprint('Alpha  Beta') === M.fingerprint(' alpha beta '));
  ok('P1-MEM-019b fingerprint 区分内容', M.fingerprint('a') !== M.fingerprint('b'));
  ok('P1-MEM-020 非法 confidence 归一为 medium', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x', confidence: { level: 'extreme' } });
    return M.validate(x) && x.confidence.level === 'medium';
  })());
  ok('P1-MEM-020b version<1 拒绝', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x' });
    x.version = 0;
    try { M.validate(x); return false; } catch (e) { return e.code === 'E_MEMORY_VERSION'; }
  })());
  ok('P1-MEM-020c summary 超长拒绝', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x' });
    x.summary = new Array(210).join('s');
    try { M.validate(x); return false; } catch (e) { return e.code === 'E_MEMORY_SUMMARY'; }
  })());
  ok('P1-MEM-020d 缺少 projectId 拒绝', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x' });
    x.projectId = null;
    try { M.validate(x); return false; } catch (e) { return e.code === 'E_MEMORY_PROJECT'; }
  })());
  ok('P1-MEM-021 证据类无来源不得核实', (function () {
    var bad = ['fact', 'paper_opinion', 'calculation', 'conclusion'];
    return bad.every(function (t) {
      var x = M.make({ profileId: 'a', projectId: 'p', type: t, content: 'x', source: { kind: 'user', refs: [] } });
      return M.canVerify(x, { evidenceIds: [], claims: {} }).reason === 'MISSING_SOURCE';
    });
  })());
  ok('P1-MEM-021b 用户类记忆无需证据即可核实', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'decision', content: '决定', source: { kind: 'user', refs: [] } });
    return M.canVerify(x, { evidenceIds: [], claims: {} }).ok === true;
  })());
  ok('P1-MEM-022 状态机合法/非法边界',
    M.canTransition('draft', 'proposed') === true &&
    M.canTransition('draft', 'verified') === false &&
    M.canTransition('verified', 'archived') === true &&
    M.canTransition('superseded', 'draft') === false &&
    M.canTransition('archived', 'proposed') === true &&
    M.canTransition('verified', 'draft') === false);
  ok('P1-MEM-023 evidenceIds 去重', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x', evidenceIds: ['e1', 'e1', 'e2'] });
    return x.evidenceIds.length === 2;
  })());
  ok('P1-MEM-023b 未知 source.kind 回退为 user', (function () {
    var x = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x', source: { kind: 'hack', refs: [] } });
    return x.source.kind === 'user';
  })());
  var scopedB = user('bob', pid);
  var storeB = RS.create({ ownerProfileId: 'bob' });
  ok('P1-MEM-024 跨 Profile 读取记忆为空', (await storeB.getMemory(m1.memoryId, scopedB)) === null);
  var byType = await store.listMemories(pid, scoped, { type: 'calculation' });
  ok('P1-MEM-024b 列表按 type 过滤', byType.length === 1 && byType[0].memoryId === calc.memoryId, byType.length);
  await expectReject('P1-MEM-025 关联缺失证据拒绝',
    store.linkMemory(concl.memoryId, { evidenceIds: ['ev_missing'] }, scoped), 'DANGLING_EVIDENCE');
  await expectReject('P1-MEM-025b rejected 不得直接 verified',
    store.transitionMemory(m4.memoryId, 'verified', scoped, {}), 'INVALID_TRANSITION');
  ok('P1-MEM-026 profileId 由 principal 决定', d1.profileId === 'alice', d1.profileId);
  var forced = await store.putMemory(candidate(pid, { content: '伪造状态', type: 'progress', status: 'verified' }), alice);
  ok('P1-MEM-027 输入 status 被强制为 draft', forced.status === 'draft', forced.status);
  ok('P1-MEM-027b 读取不存在的记忆返回 null', (await store.getMemory('mem_missing', scoped)) === null);
  ok('P1-MEM-028 跨 Project principal 读取记忆为空',
    (await store.getMemory(m1.memoryId, user('alice', 'prj_other'))) === null);
  var props = await store.listMemories(pid, scoped, { status: 'proposed' });
  ok('P1-MEM-028b 列表按状态过滤', props.every(function (x) { return x.status === 'proposed'; }));
  var linked = await store.linkMemory(po.memoryId, { evidenceIds: ['ev_a'] }, scoped);
  var linkedV = linked.version;
  await store.putClaimBundle([{ id: 'cl_link', type: 'qualitative', source: 'llm', support: [{ eid: 'ev_a', strength: 'partial', basis: 'semantic' }], contradict: [] }], pid, alice);
  var linked2 = await store.linkMemory(po.memoryId, { claimIds: ['cl_link'] }, scoped);
  ok('P1-MEM-029 关联可解析时写入成功', linked2.claimIds[0] === 'cl_link' && linked2.evidenceIds[0] === 'ev_a');
  ok('P1-MEM-029b 关联写入 version 递增', linked2.version > linkedV);
  var p2forDup = await store.createProject({ title: '另一个课题' }, alice);
  var dOther = await store.putMemory(candidate(p2forDup.projectId, { content: '重复内容', type: 'progress' }), alice);
  ok('P1-MEM-030 去重不跨课题', dOther.memoryId !== d1.memoryId);
  var longContent = new Array(4100).join('x');
  var clamped = await store.putMemory(candidate(pid, { content: longContent, type: 'progress' }), alice);
  ok('P1-MEM-030b 超长正文被截断到 4000', clamped.content.length === 4000, clamped.content.length);
  var normalizedRef = M.make({ profileId: 'a', projectId: 'p', type: 'fact', content: 'x', source: { kind: 'user', refs: [{ kind: 'hack', id: '1', uri: '' }] } });
  ok('P1-MEM-031 source.refs 未知 kind 归一', normalizedRef.source.refs[0].kind === 'user', normalizedRef.source.refs[0].kind);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
