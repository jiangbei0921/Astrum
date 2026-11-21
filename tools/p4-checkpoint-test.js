/* ASTRUM P4 B4 · Checkpoint 生成与读取测试
 * 用法：node tools/p4-checkpoint-test.js
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

var fake = require('./fake-idb').install();
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/task-store.js'));

var T = global.AstroTask;
var S = global.AstroTaskStore;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function cpCount(dbName) {
  var db = fake.db(dbName);
  return db && db._stores.checkpoints ? Object.keys(db._stores.checkpoints.data).length : -1;
}

function baseState() {
  var st = T.create({ question: '检查点测试', phase: 'PLAN', level: 'L3', projectId: 'prj_cp' });
  st.plan = {
    planId: 'plan_cp', version: 1, template: 'T-B',
    steps: [
      { id: 's1', tool: 'kb.lookup', deps: [], args: { q: 1 } },
      { id: 's2', tool: 'compose.target', deps: ['s1'], args: {} }
    ]
  };
  st.steps = st.plan.steps.map(T.makeStep);
  return st;
}

(async function () {
  var DB = 'p.cp.astrum.tasks.v1';
  var store = S.create({ ownerProfileId: 'cp' });
  await store.init();
  var st = baseState();
  T.appendEvent(st, 'plan.expanded', { action: 'append', reason: 'test' });

  /* 1 生成时机 */
  var cp1 = T.addCheckpoint(st, { stepId: 'plan', taskStatus: 'PLAN' });
  ok('P4C-01 PLAN 检查点生成', cp1 && cp1.taskStatus === 'PLAN' && cp1.phase === 'PLAN');
  st.steps[0].status = 'ok';
  st.steps[0].outputHash = T.sha256Hex('r1');
  st.steps[0].result = { ok: true };
  T.addCheckpoint(st, { stepId: 's1', taskStatus: 'EXECUTE' });
  st.phase = 'PROGRESS';
  var cp3 = T.addCheckpoint(st, { taskStatus: 'PROGRESS' });
  ok('P4C-02 关键步骤/PROGRESS 检查点生成', st.checkpoints.length === 3 && cp3.phase === 'PROGRESS');

  /* 2 新增字段 */
  ok('P4C-03 检查点保存 snapshot 原像', cp1.snapshot && cp1.snapshot.phase === 'PLAN');
  ok('P4C-04 stateHash 可由 snapshot 复算',
    cp1.stateHash === T.sha256Hex(T.canonicalJSON(cp1.snapshot)));
  ok('P4C-05 completedStepIds 记录成功节点',
    cp3.completedStepIds.indexOf('s1') >= 0 && cp3.pendingStepIds.indexOf('s2') >= 0);
  ok('P4C-06 outputs 记录输出哈希', cp3.outputs.some(function (o) {
    return o.stepId === 's1' && o.outputHash === T.sha256Hex('r1');
  }));
  ok('P4C-07 版本连续递增', st.checkpoints.map(function (c) { return c.version; }).join(',') === '1,2,3');

  /* 3 持久化与读取 */
  await store.save(st);
  ok('P4C-08 检查点派生记录写入', cpCount(DB) === 3, cpCount(DB));
  var latest = await store.loadLatestCheckpoint(st.id);
  ok('P4C-09 读取最新检查点', latest && latest.checkpointId === cp3.checkpointId);
  ok('P4C-10 记录注入 taskId/owner/project', latest.taskId === st.id &&
    latest.ownerProfileId === 'cp' && latest.projectId === 'prj_cp');
  ok('P4C-11 记录注入 eventsUpToSeq', latest.eventsUpToSeq === 1, latest.eventsUpToSeq);
  ok('P4C-12 记录含 summary', latest.summary && latest.summary.completed === 1);
  var byId = await store.loadCheckpoint(st.id, cp1.checkpointId);
  ok('P4C-13 按 ID 读取检查点', byId && byId.checkpointId === cp1.checkpointId && byId.version === 1);

  /* 4 重复保存幂等 */
  await store.save(st);
  ok('P4C-14 重复保存检查点不翻倍', cpCount(DB) === 3, cpCount(DB));

  /* 5 stateHash 随状态变化 */
  var beforeHash = cp3.stateHash;
  st.phase = 'EXECUTE';
  var cp4 = T.addCheckpoint(st, { taskStatus: 'EXECUTE' });
  ok('P4C-15 状态变化后 stateHash 不同', cp4.stateHash !== beforeHash);

  /* 6 保留最近 20 个 */
  for (var i = 0; i < 25; i++) {
    st.phase = i % 2 ? 'PROGRESS' : 'EXECUTE';
    T.addCheckpoint(st, { taskStatus: 'LOOP' });
  }
  ok('P4C-16 单任务最多保留 20 个检查点', st.checkpoints.length === 20, st.checkpoints.length);
  ok('P4C-17 修剪后版本仍单调递增', (function () {
    for (var j = 1; j < st.checkpoints.length; j++) {
      if (st.checkpoints[j].version !== st.checkpoints[j - 1].version + 1) return false;
    }
    return true;
  })(), st.checkpoints.map(function (c) { return c.version; }).join(','));

  /* 7 清理派生记录 */
  await store.save(st);
  var total = cpCount(DB);
  ok('P4C-18 派生记录数量与任务一致', total === 20, total);
  var finalId = st.checkpoints[st.checkpoints.length - 1].checkpointId;
  var pruned = await store.pruneCheckpoints(st.id, 5);
  ok('P4C-19 pruneCheckpoints 删除旧记录', pruned === 15 && cpCount(DB) === 5,
    JSON.stringify({ pruned: pruned, left: cpCount(DB) }));
  var afterPrune = await store.loadLatestCheckpoint(st.id);
  ok('P4C-20 清理保留最新检查点', afterPrune && afterPrune.checkpointId === finalId);

  /* 8 不可恢复终态仍保留检查点 */
  st.phase = 'DONE';
  T.addCheckpoint(st, { taskStatus: 'DONE' });
  await store.save(st);
  ok('P4C-21 终态检查点可读取', !!(await store.loadLatestCheckpoint(st.id)));

  /* 9 旧检查点无 snapshot 仍可读取 */
  var legacy = T.create({ question: 'legacy cp', phase: 'EXECUTE', level: 'L2' });
  legacy.checkpoints = [{ checkpointId: 'chk_old', at: new Date().toISOString(), phase: 'EXECUTE', stateHash: 'abc', inputHash: 'x', budgetUsed: {}, version: 1 }];
  await store.save(legacy);
  var oldCp = await store.loadLatestCheckpoint(legacy.id);
  ok('P4C-22 旧检查点兼容读取', oldCp && oldCp.checkpointId === 'chk_old' && !oldCp.snapshot);

  /* 10 删除级联 */
  await store.remove(legacy.id);
  ok('P4C-23 删除任务级联删除检查点', (await store.loadLatestCheckpoint(legacy.id)) === null);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + (pass) + '/' + (pass + fail + 1));
  process.exit(1);
});
