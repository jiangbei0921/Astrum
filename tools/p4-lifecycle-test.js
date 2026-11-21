/* ASTRUM P4 B6 · 数据生命周期与故障测试
 * 用法：node tools/p4-lifecycle-test.js
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
function count(dbName, store) {
  var db = fake.db(dbName);
  return db && db._stores[store] ? Object.keys(db._stores[store].data).length : -1;
}

function makeState(phase) {
  var st = T.create({ question: '生命周期', phase: phase || 'EXECUTE', level: 'L3' });
  st.plan = { planId: 'pl', version: 1, steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: {} }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  T.appendEvent(st, 'step.started', {}, 's1');
  T.addCheckpoint(st, { stepId: 's1', taskStatus: 'EXECUTE' });
  return st;
}

(async function () {
  var DB = 'p.life.astrum.tasks.v1';
  var store = S.create({ ownerProfileId: 'life' });
  await store.init();
  var st = makeState();
  await store.save(st);
  ok('P4L-01 初始保存成功', (await store.get(st.id)) !== null);

  /* 1 保留策略 */
  for (var i = 0; i < 30; i++) {
    st.phase = i % 2 ? 'PROGRESS' : 'EXECUTE';
    T.addCheckpoint(st, { taskStatus: 'LOOP' });
  }
  ok('P4L-02 任务内检查点上限 20', st.checkpoints.length === 20, st.checkpoints.length);
  await store.save(st);
  ok('P4L-03 派生检查点上限 20', count(DB, 'checkpoints') === 20, count(DB, 'checkpoints'));
  var latestId = st.checkpoints[st.checkpoints.length - 1].checkpointId;
  var latest = await store.loadLatestCheckpoint(st.id);
  ok('P4L-04 最终检查点保留', latest && latest.checkpointId === latestId);

  /* 2 级联删除 */
  var child = makeState();
  await store.save(child);
  ok('P4L-05 子任务事件/检查点已写入', count(DB, 'events') >= 2 && count(DB, 'checkpoints') === 21,
    JSON.stringify({ e: count(DB, 'events'), c: count(DB, 'checkpoints') }));
  await store.remove(child.id);
  ok('P4L-06 删除级联清理检查点', count(DB, 'checkpoints') === 20, count(DB, 'checkpoints'));
  ok('P4L-07 删除级联清理事件', count(DB, 'events') === 1, count(DB, 'events'));

  /* 3 配额 */
  var revBefore = (await store.getRecord(st.id)).revision;
  fake.failNextPut('QuotaExceededError');
  var quota = '';
  try { await store.save(st); } catch (e) { quota = e.code; }
  ok('P4L-08 配额不足返回 QUOTA_EXCEEDED', quota === 'QUOTA_EXCEEDED', quota);
  ok('P4L-09 配额失败保留原记录', (await store.getRecord(st.id)).revision === revBefore);

  /* 4 多标签页并发写 */
  var tabA = S.create({ ownerProfileId: 'life' });
  var tabB = S.create({ ownerProfileId: 'life' });
  await tabA.init(); await tabB.init();
  var stateA = await tabA.get(st.id);
  var stateB = await tabB.get(st.id);
  var rev = (await tabA.getRecord(st.id)).revision;
  stateA.pausedAt = new Date().toISOString();
  await tabA.save(stateA, { expectedRevision: rev });
  ok('P4L-10 标签 A 写入成功', (await tabA.getRecord(st.id)).revision === rev + 1);
  var stale = '';
  try { await tabB.save(stateB, { expectedRevision: rev }); } catch (e) { stale = e.code; }
  ok('P4L-11 标签 B 陈旧写被拒', stale === 'STALE_WRITE', stale);
  ok('P4L-12 拒绝后记录仍为 A 版本', (await tabA.getRecord(st.id)).revision === rev + 1);

  /* 5 可恢复列表与终态 */
  var done = makeState('PROGRESS');
  done.phase = 'DONE';
  await store.save(done);
  var running = makeState('EXECUTE');
  await store.save(running);
  var resumables = await store.listResumable({ limit: 10 });
  ok('P4L-13 终态不进入可恢复列表', !resumables.some(function (x) { return x.id === done.id; }));
  ok('P4L-14 可恢复列表包含执行中任务', resumables.some(function (x) { return x.id === running.id; }));

  /* 6 健康信息 */
  var h = store.getHealth();
  ok('P4L-15 健康信息版本为 2', h.dbVersion === 2 && h.backend === 'idb');
  ok('P4L-16 健康信息记录最后保存时间', typeof h.lastSaveAt === 'string' && h.lastSaveAt.length > 0);

  /* 7 clear 后仍可用 */
  await store.clear();
  ok('P4L-17 clear 后任务为空', (await store.list()).length === 0);
  ok('P4L-18 clear 后继续保存可用', (await store.save(makeState())).indexOf('tsk_') === 0);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + (pass) + '/' + (pass + fail + 1));
  process.exit(1);
});
