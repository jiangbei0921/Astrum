/* ASTRUM P1-05 检查点与恢复测试
 * 用法：node tools/p1-resume-test.js
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

['data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/profile.js', 'core/task.js', 'core/task-store.js', 'core/schema.js',
  'core/claims.js', 'core/fit.js', 'core/agents.js', 'core/security.js', 'core/sources.js',
  'core/research.js', 'core/solarsystem.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/orchestrator.js', 'core/control.js',
  'core/project.js', 'core/memory.js', 'core/research-store.js', 'core/research-context.js',
  'core/audit-log.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Control = global.AstroControl;
var TS = global.AstroTaskStore;
var RS = global.AstroResearchStore;
var Sec = global.Security;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function isPlain(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

function makeCtx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}

async function main() {
  var CTX = makeCtx();
  var CFG = AC.defaultConfig();
  var OWNER = global.Profile.init();
  var aliceUser = Sec.forTest({ principalType: 'user', profileId: OWNER });
  var q = '请综述一下黑洞研究的最新进展';

  var rs = RS.create({});
  await rs.init();
  var project = await rs.createProject({ title: '恢复测试课题' }, aliceUser);
  var pid = project.projectId;
  var aliceTask = Sec.forTest({ profileId: OWNER, agentId: 'scholar', projectId: pid });
  var store = TS.create({ projectId: pid });

  /* ---------- 检查点写入 ---------- */
  var run = await Control.run(q, CTX, CFG, {
    store: store, projectId: pid, principal: aliceTask
  });
  ok('P1-RSM-001 任务完成后包含检查点', T && run.state.checkpoints.length >= 2,
    run.state.checkpoints.length);
  var cps = run.state.checkpoints;
  ok('P1-RSM-001b PLAN 阶段检查点存在', cps.some(function (c) { return c.taskStatus === 'PLAN'; }));
  ok('P1-RSM-001c PROGRESS/后续检查点存在', cps.some(function (c) { return c.phase === 'PROGRESS'; }));
  var cp = cps[0];
  ok('P1-RSM-002 检查点字段完整',
    typeof cp.checkpointId === 'string' && cp.checkpointId.indexOf('chk_') === 0 &&
    typeof cp.at === 'string' && typeof cp.stateHash === 'string' &&
    typeof cp.inputHash === 'string' && typeof cp.budgetUsed === 'object' &&
    cp.projectId === pid && typeof cp.version === 'number' &&
    Array.isArray(cp.memoryIds) && Array.isArray(cp.evidenceIds) && Array.isArray(cp.claimIds),
    JSON.stringify(cp));
  ok('P1-RSM-002b 检查点版本递增', cps.every(function (c, i) { return i === 0 || c.version === cps[i - 1].version + 1; }),
    cps.map(function (c) { return c.version; }).join(','));
  ok('P1-RSM-002c 中间态不产生 running 检查点', cps.every(function (c) { return c.taskStatus !== 'running'; }));

  /* ---------- 持久化与 projectId 透传 ---------- */
  var rec = await store.getRecord(run.state.id);
  ok('P1-RSM-003 任务记录带 projectId', rec && rec.projectId === pid, rec && rec.projectId);
  var store2 = TS.create({ projectId: pid });
  var reloaded = await store2.get(run.state.id);
  ok('P1-RSM-004 重建 store 后可读取任务', !!reloaded && reloaded.id === run.state.id);
  var byProject = await store2.listByProject(pid, {});
  ok('P1-RSM-004b listByProject 返回该课题任务', byProject.some(function (r) { return r.id === run.state.id; }));
  var otherProjectList = await store2.listByProject('prj_other', {});
  ok('P1-RSM-004c listByProject 不混入其他课题', otherProjectList.length === 0);
  var rebuildCps = await store2.get(run.state.id);
  ok('P1-RSM-004d 检查点随任务持久化', rebuildCps.checkpoints.length >= 2, rebuildCps.checkpoints.length);

  /* ---------- 已完成任务：只读 ---------- */
  var doneResume = await Control.resume(run.state.id, CTX, CFG, { store: store2, principal: aliceTask });
  ok('P1-RSM-005 已完成任务恢复为只读', doneResume && doneResume.viewOnly === true,
    JSON.stringify(doneResume && { verdict: doneResume.verdict, viewOnly: doneResume.viewOnly }));

  /* ---------- 中断任务恢复 ---------- */
  var prep = Control.prepare(q, CTX, CFG, { projectId: pid, principal: aliceTask });
  var st = prep.state;
  st.projectId = pid;
  T.transition(st, 'EXECUTE');
  st.steps[0].status = 'running';
  T.addCheckpoint(st, { stepId: st.steps[0].id, taskStatus: 'EXECUTE' });
  await store.save(st);
  var resumed = await Control.resume(st.id, CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-006 恢复后 running 步骤被重置并执行',
    resumed && resumed.state.steps[0].status !== 'running', resumed && resumed.state.steps[0].status);
  ok('P1-RSM-006b 恢复事件被记录', resumed && resumed.state.events.some(function (e) {
    return e.type === 'task.recovered';
  }));
  ok('P1-RSM-006c 恢复后所有步骤收敛', resumed && resumed.state.steps.every(function (s) {
    return s.status === 'ok' || s.status === 'failed' || s.status === 'skipped';
  }));
  ok('P1-RSM-006d 恢复终态为终态之一', resumed && ['DONE', 'PARTIAL', 'FAILED'].indexOf(resumed.state.phase) >= 0,
    resumed && resumed.state.phase);

  /* ---------- 不重复执行 ok 步骤 ---------- */
  var prep2 = Control.prepare(q, CTX, CFG, { projectId: pid, principal: aliceTask });
  var st2 = prep2.state;
  st2.projectId = pid;
  T.transition(st2, 'EXECUTE');
  st2.steps.forEach(function (s, i) {
    s.status = 'ok'; s.attempt = 1; s.result = { ok: true }; s.outputHash = 'h' + i;
  });
  T.addCheckpoint(st2, { taskStatus: 'EXECUTE' });
  await store.save(st2);
  var beforeAttempts = st2.steps.map(function (s) { return s.attempt; }).join(',');
  var resumed2 = await Control.resume(st2.id, CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-007 已 ok 步骤不重复执行',
    resumed2 && resumed2.state.steps.map(function (s) { return s.attempt; }).join(',') === beforeAttempts,
    resumed2 && resumed2.state.steps.map(function (s) { return s.attempt; }).join(','));

  /* ---------- 权限与归属拒绝 ---------- */
  var missing = await Control.resume('task_missing_id', CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-008 不存在的任务返回 null', missing === null);

  var bobStore = TS.create({ ownerProfileId: 'bob' });
  var bob = Sec.forTest({ profileId: 'bob', agentId: 'scholar' });
  var bobResume = await Control.resume(st.id, CTX, CFG, { store: bobStore, principal: bob });
  ok('P1-RSM-008b 跨 Profile 无法读取任务', bobResume === null);

  /* 课题归档/删除后拒绝恢复 */
  var prep3 = Control.prepare(q, CTX, CFG, { projectId: pid, principal: aliceTask });
  var st3 = prep3.state;
  st3.projectId = pid;
  T.transition(st3, 'EXECUTE');
  await store.save(st3);
  await rs.setProjectStatus(pid, 'archived', aliceUser);
  var archResume = await Control.resume(st3.id, CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-009 归档课题拒绝恢复', archResume && archResume.verdict === 'DENIED' &&
    archResume.error === 'PROJECT_NOT_ACTIVE', JSON.stringify(archResume && { v: archResume.verdict, e: archResume.error }));
  await rs.setProjectStatus(pid, 'paused', aliceUser);
  await rs.setProjectStatus(pid, 'deleted', aliceUser, { confirmTitle: '恢复测试课题' });
  var delResume = await Control.resume(st3.id, CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-010 删除课题拒绝恢复', delResume && delResume.verdict === 'DENIED' &&
    delResume.error === 'PROJECT_NOT_ACTIVE', JSON.stringify(delResume && { v: delResume.verdict, e: delResume.error }));

  /* ---------- 无 principal 兼容 ---------- */
  var noP = await Control.resume(st2.id, CTX, CFG, { store: store });
  ok('P1-RSM-011 无 principal 保持旧行为（可读）', noP && noP.state && noP.state.id === st2.id);

  /* ---------- 纯函数边界 ---------- */
  var s4 = T.create({ question: 'x' });
  var cp4 = T.addCheckpoint(s4, { stepId: 's1', memoryIds: ['m1'], evidenceIds: ['e1'], claimIds: ['c1'], taskStatus: 'PLAN' });
  ok('P1-RSM-012 addCheckpoint 记录关联 ID',
    cp4.memoryIds[0] === 'm1' && cp4.evidenceIds[0] === 'e1' && cp4.claimIds[0] === 'c1');
  ok('P1-RSM-012b addCheckpoint 默认 projectId 为 null',
    cp4.projectId === null && cp4.version === 1);
  ok('P1-RSM-012c stateHash 相同输入稳定', (function () {
    var a = T.create({ question: 'y' });
    var b = T.create({ question: 'y' });
    return T.addCheckpoint(a).stateHash === T.addCheckpoint(b).stateHash;
  })());
  ok('P1-RSM-013 检查点 ID 唯一', cps.length === cps.map(function (c) { return c.checkpointId; })
    .filter(function (id, i, arr) { return arr.indexOf(id) === i; }).length);
  ok('P1-RSM-013b 检查点不改变 phase', (function () {
    var s = T.create({ question: 'z' });
    var ph = s.phase;
    T.addCheckpoint(s, { taskStatus: 'PLAN' });
    return s.phase === ph;
  })());
  ok('P1-RSM-013c 连续检查点 version 递增', (function () {
    var s = T.create({ question: 'v' });
    var a = T.addCheckpoint(s);
    var b = T.addCheckpoint(s);
    return a.version === 1 && b.version === 2;
  })());
  var cpStateDifferent = (function () {
    var a = T.create({ question: 'w' });
    a.phase = 'EXECUTE';
    var cpA = T.addCheckpoint(a);
    a.phase = 'PROGRESS';
    var cpB = T.addCheckpoint(a);
    return cpA.stateHash !== cpB.stateHash;
  })();
  ok('P1-RSM-013d 状态变化后 stateHash 不同', cpStateDifferent);
  ok('P1-RSM-013e budgetUsed 为对象', isPlain(cp.budgetUsed), typeof cp.budgetUsed);
  ok('P1-RSM-014 恢复结果保留检查点', resumed && resumed.state.checkpoints.length >= 1,
    resumed && resumed.state.checkpoints.length);
  var rawRecs = await store.listByProject(pid, { raw: true });
  ok('P1-RSM-014b listByProject raw 返回 state',
    rawRecs.length >= 1 && !!rawRecs[0].state &&
    (typeof rawRecs[0].state === 'string' || !!rawRecs[0].state.id));
  var again = await Control.resume(st2.id, CTX, CFG, { store: store, principal: aliceTask });
  ok('P1-RSM-014c 已恢复任务再次恢复为只读', again && again.viewOnly === true,
    JSON.stringify(again && again.verdict));
  var otherScoped = Sec.forTest({ profileId: OWNER, agentId: 'scholar', projectId: 'prj_wrong' });
  var wrongResume = await Control.resume(st.id, CTX, CFG, { store: store, principal: otherScoped });
  ok('P1-RSM-015 绑定其他课题的 principal 无法恢复', wrongResume === null);
  try {
    var mismatched = T.create({ question: 'm', projectId: 'p_a' });
    var badStore = TS.create({ projectId: 'p_b' });
    await badStore.save(mismatched);
    ok('P1-RSM-016 课题不匹配的保存被拒绝', false);
  } catch (e) {
    ok('P1-RSM-016 课题不匹配的保存被拒绝', e.code === 'PROJECT_MISMATCH', e.code);
  }
  ok('P1-RSM-017 检查点带任务终态/阶段语义', cps.every(function (c) {
    return typeof c.taskStatus === 'string' && c.taskStatus.length > 0;
  }));
  ok('P1-RSM-018 检查点字段默认空数组', (function () {
    var s = T.create({ question: 'd' });
    var c = T.addCheckpoint(s);
    return Array.isArray(c.memoryIds) && c.memoryIds.length === 0 &&
      Array.isArray(c.evidenceIds) && Array.isArray(c.claimIds);
  })());
  ok('P1-RSM-018b 检查点时间 ISO 格式', /^\d{4}-\d{2}-\d{2}T/.test(cp.at), cp.at);
  ok('P1-RSM-018c stateHash 为十六进制或指纹', typeof cp.stateHash === 'string' && cp.stateHash.length > 0);
  ok('P1-RSM-019 任务记录 ownerProfileId 一致', rec && rec.ownerProfileId === OWNER, rec && rec.ownerProfileId);
  ok('P1-RSM-019b listByProject 支持 limit', (await store.listByProject(pid, { limit: 1 })).length === 1);
  ok('P1-RSM-020 恢复结果包含 state 与 verdict', resumed && !!resumed.state && typeof resumed.verdict === 'string',
    resumed && resumed.verdict);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
