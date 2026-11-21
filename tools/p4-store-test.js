/* ASTRUM P4 B1 · TaskStore v2 测试
 * 用法：node tools/p4-store-test.js
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

function makeState(level) {
  var st = T.create({ question: '持久化测试', phase: 'EXECUTE', level: level || 'L2' });
  st.plan = { planId: 'p1', version: 1, template: 'T-A', steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: { query: 'M42' } }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  T.appendEvent(st, 'step.started', {}, 's1');
  T.addCheckpoint(st, { stepId: 's1', taskStatus: 'EXECUTE' });
  return st;
}

function recStore(name) {
  var db = fake.db(name);
  return db && db._stores.tasks ? db._stores.tasks.data : null;
}

function countStore(name, store) {
  var db = fake.db(name);
  if (!db || !db._stores[store]) return -1;
  return Object.keys(db._stores[store].data).length;
}

(async function () {
  var DB = 'p.u1.astrum.tasks.v1';
  var store = S.create({ ownerProfileId: 'u1' });

  /* 1 初始化与 store 结构 */
  var backend = await store.init();
  ok('P4S-01 初始化后端为 idb', backend === 'idb' && store.backend() === 'idb', backend);
  var health = store.getHealth();
  ok('P4S-02 健康信息含版本', health.backend === 'idb' && health.dbVersion === 2, JSON.stringify(health));
  var db = fake.db(DB);
  ok('P4S-03 创建 tasks/events/checkpoints/meta',
    db && ['tasks', 'events', 'checkpoints', 'meta'].every(function (n) {
      return db.objectStoreNames.contains(n);
    }));

  /* 2 保存 / 读取 */
  var st = makeState();
  var id = await store.save(st);
  ok('P4S-04 save 返回任务 id（兼容旧接口）', id === st.id, id);
  var got = await store.get(st.id);
  ok('P4S-05 任务往返一致', got && got.id === st.id && got.steps.length === 1 && got.events.length === 1);
  var rec = await store.getRecord(st.id);
  ok('P4S-06 记录带 revision/eventsUpToSeq', rec.revision === 1 && rec.eventsUpToSeq === 1,
    JSON.stringify({ r: rec.revision, s: rec.eventsUpToSeq }));
  ok('P4S-07 记录带 owner/project', rec.ownerProfileId === 'u1', rec.ownerProfileId);

  /* 3 更新 revision 递增 */
  st.pausedAt = new Date().toISOString();
  await store.save(st);
  var rec2 = await store.getRecord(st.id);
  ok('P4S-08 再次保存 revision 递增', rec2.revision === 2, rec2.revision);

  /* 4 陈旧写 */
  var staleCode = '';
  try { await store.save(st, { expectedRevision: 1 }); } catch (e) { staleCode = e.code; }
  ok('P4S-09 expectedRevision 不符报 STALE_WRITE', staleCode === 'STALE_WRITE', staleCode);

  var older = T.fromJSON(rec2.state);
  older.updatedAt = '2000-01-01T00:00:00.000Z';
  var staleCode2 = '';
  try { await store.save(older); } catch (e) { staleCode2 = e.code; }
  ok('P4S-10 updatedAt 回退报 STALE_WRITE', staleCode2 === 'STALE_WRITE', staleCode2);

  /* 5 项目不匹配 */
  var pstore = S.create({ ownerProfileId: 'u1', projectId: 'prj_b' });
  var mism = T.create({ question: 'm', projectId: 'prj_a' });
  var mismCode = '';
  try { await pstore.save(mism); } catch (e) { mismCode = e.code; }
  ok('P4S-11 项目不匹配拒绝保存', mismCode === 'PROJECT_MISMATCH', mismCode);

  /* 6 跨档案隔离 */
  var other = S.create({ ownerProfileId: 'u2' });
  await other.init();
  ok('P4S-12 跨档案读取返回 null', (await other.get(st.id)) === null);
  ok('P4S-13 跨档案列表为空', (await other.list()).length === 0);

  /* 7 事务：事件与检查点同事务可见 */
  ok('P4S-14 事件派生索引已写入', countStore(DB, 'events') === 1, countStore(DB, 'events'));
  ok('P4S-15 检查点派生记录已写入', countStore(DB, 'checkpoints') === 1, countStore(DB, 'checkpoints'));
  var events = await store.listEvents(st.id);
  ok('P4S-16 listEvents 返回事件', events.length === 1 && events[0].seq === 1 && events[0].taskId === st.id);
  var cp = await store.loadLatestCheckpoint(st.id);
  ok('P4S-17 loadLatestCheckpoint 返回检查点', cp && cp.checkpointId === st.checkpoints[0].checkpointId);

  /* 8 摘要字段 */
  var list = await store.list({ limit: 10 });
  var sum = list.filter(function (x) { return x.id === st.id; })[0];
  ok('P4S-18 摘要含 paused/recoveries/revision', sum && sum.paused === true && sum.recoveries === 0 && sum.revision === 2,
    JSON.stringify(sum));
  var resumable = await store.listResumable();
  ok('P4S-19 listResumable 只含可恢复任务', resumable.length === 1 && resumable[0].id === st.id);

  /* 9 配额失败 */
  var beforeRev = (await store.getRecord(st.id)).revision;
  fake.failNextPut('QuotaExceededError');
  var quotaCode = '';
  try { await store.save(st); } catch (e) { quotaCode = e.code; }
  ok('P4S-20 配额不足报 QUOTA_EXCEEDED', quotaCode === 'QUOTA_EXCEEDED', quotaCode);
  var afterRev = (await store.getRecord(st.id)).revision;
  ok('P4S-21 配额失败不删除当前任务', afterRev === beforeRev && (await store.get(st.id)) !== null,
    beforeRev + '->' + afterRev);

  /* 10 事务 abort */
  fake.abortNextTransaction();
  var abortCode = '';
  try { await store.save(st); } catch (e) { abortCode = e.code; }
  ok('P4S-22 事务异常报 PERSIST_TX_FAILED', abortCode === 'PERSIST_TX_FAILED', abortCode);

  /* 11 损坏记录 */
  var bad = T.create({ question: 'bad', phase: 'EXECUTE', level: 'L2' });
  await store.save(bad);
  var raw = recStore(DB);
  raw[JSON.stringify(bad.id)].state = '{not-json';
  var badSummary = (await store.list({ limit: 50 })).filter(function (x) { return x.id === bad.id; })[0];
  ok('P4S-23 损坏记录标 stale', badSummary && badSummary.stale === true && badSummary.resumable === false,
    JSON.stringify(badSummary));
  ok('P4S-24 损坏记录不可读取为状态', (await store.get(bad.id)) === null);

  /* 12 级联删除 */
  await store.remove(st.id);
  ok('P4S-25 删除后不可读', (await store.get(st.id)) === null);
  ok('P4S-26 级联删除事件', countStore(DB, 'events') === 0, countStore(DB, 'events'));
  ok('P4S-27 级联删除检查点', countStore(DB, 'checkpoints') === 0, countStore(DB, 'checkpoints'));

  /* 13 clear */
  await store.clear();
  ok('P4S-28 clear 清空任务', (await store.list()).length === 0);
  ok('P4S-29 clear 清空派生索引', countStore(DB, 'events') === 0 && countStore(DB, 'checkpoints') === 0);

  /* 14 重复初始化不重复建 store（同实例） */
  var b2 = await store.init();
  ok('P4S-30 重复初始化幂等', b2 === 'idb' && db.objectStoreNames.contains('meta'));

  /* 15 降级：无 indexedDB 时 localStorage */
  var savedIdx = global.indexedDB;
  delete global.indexedDB;
  var lsStore = S.create({ ownerProfileId: 'u3' });
  var b3 = await lsStore.init();
  ok('P4S-31 无 IDB 降级 localStorage', b3 === 'ls' && lsStore.backend() === 'ls', b3);
  var st3 = makeState();
  await lsStore.save(st3);
  var got3 = await lsStore.get(st3.id);
  ok('P4S-32 降级后仍可读写', got3 && got3.id === st3.id);
  var ev3 = await lsStore.listEvents(st3.id);
  var cp3 = await lsStore.loadLatestCheckpoint(st3.id);
  ok('P4S-33 降级事件/检查点回退 state', ev3.length === 1 && !!cp3 && !!cp3.checkpointId);
  global.indexedDB = savedIdx;

  /* 16 健康错误码 */
  ok('P4S-34 getHealth 结构稳定', typeof store.getHealth().lastError !== 'undefined');

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
