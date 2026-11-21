/* ASTRUM P4 B2 · 数据库 v1→v2 迁移测试
 * 用法：node tools/p4-migration-test.js
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
function count(name, store) {
  var db = fake.db(name);
  return db && db._stores[store] ? Object.keys(db._stores[store].data).length : -1;
}

function makeLegacyDb(dbName, records) {
  return new Promise(function (resolve, reject) {
    var req = fake.indexedDB.open(dbName, 1);
    req.onupgradeneeded = function () {
      req.result.createObjectStore('tasks', { keyPath: 'id' });
    };
    req.onsuccess = function () {
      var db = req.result;
      var tx = db.transaction(['tasks'], 'readwrite');
      tx.oncomplete = function () { db.close(); resolve(); };
      tx.onabort = function () { reject(tx.error || new Error('seeding failed')); };
      records.forEach(function (r) { tx.objectStore('tasks').put(r); });
    };
    req.onerror = function () { reject(req.error); };
  });
}

function legacyState() {
  var st = T.create({ question: 'v1 旧任务', phase: 'EXECUTE', level: 'L2' });
  st.plan = { planId: 'plan_v1', version: 1, steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: {} }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  T.appendEvent(st, 'step.started', {}, 's1');
  T.appendEvent(st, 'step.ok', {}, 's1');
  T.addCheckpoint(st, { stepId: 's1', taskStatus: 'EXECUTE' });
  return st;
}

(async function () {
  /* 1 构造 v1 数据库：只有 tasks store */
  var DB = 'p.legacy.astrum.tasks.v1';
  var st = legacyState();
  var legacyRec = {
    id: st.id,
    question: st.question,
    phase: st.phase,
    createdAt: st.createdAt,
    updatedAt: st.updatedAt,
    template: 'T-A',
    ownerProfileId: 'legacy',
    projectId: null,
    state: T.toJSON(st)
  };
  await makeLegacyDb(DB, [legacyRec]);
  ok('P4M-01 预置 v1 库仅含 tasks', fake.db(DB).version === 1 && count(DB, 'tasks') === 1,
    JSON.stringify({ v: fake.db(DB).version, n: count(DB, 'tasks') }));

  /* 2 打开 v2：只增 store，旧记录保留 */
  var store = S.create({ ownerProfileId: 'legacy' });
  var backend = await store.init();
  ok('P4M-02 v1→v2 升级成功', backend === 'idb' && fake.db(DB).version === 2, backend);
  ok('P4M-03 新增 events/checkpoints/meta', ['events', 'checkpoints', 'meta'].every(function (n) {
    return fake.db(DB).objectStoreNames.contains(n);
  }));
  ok('P4M-04 旧任务记录保留', count(DB, 'tasks') === 1);
  var rec = await store.getRecord(st.id);
  ok('P4M-05 旧任务可读取', rec && rec.question === 'v1 旧任务' && !!rec.state);
  var got = await store.get(st.id);
  ok('P4M-06 旧状态可反序列化', got && got.id === st.id && got.events.length === 2);

  /* 3 派生索引补齐 */
  ok('P4M-07 升级后事件索引为空', count(DB, 'events') === 0);
  var logs = await store.listEvents(st.id);
  ok('P4M-08 读取时按内嵌事件回填', logs.length === 2 && count(DB, 'events') === 2,
    JSON.stringify({ logs: logs.length, idx: count(DB, 'events') }));
  var cp = await store.loadLatestCheckpoint(st.id);
  ok('P4M-09 无检查点记录时回退内嵌检查点', cp && cp.checkpointId === st.checkpoints[0].checkpointId);

  /* 4 保存旧任务：revision 从默认值递增 */
  got.pausedAt = new Date().toISOString();
  await store.save(got);
  var rec2 = await store.getRecord(st.id);
  ok('P4M-10 旧记录保存后 revision 递增', rec2.revision === 2, rec2.revision);
  ok('P4M-11 检查点派生记录写入', count(DB, 'checkpoints') === 1, count(DB, 'checkpoints'));

  /* 5 重复初始化不重复升级 */
  var store2 = S.create({ ownerProfileId: 'legacy' });
  var b2 = await store2.init();
  var metaCount = count(DB, 'meta');
  ok('P4M-12 重复初始化版本不变', b2 === 'idb' && fake.db(DB).version === 2);
  ok('P4M-13 重复初始化不重复建 store', metaCount >= 1 && metaCount <= 2, metaCount);

  /* 6 升级失败：降级 localStorage 且报 DB_UPGRADE_FAILED */
  fake.failNextOpen(new Error('upgrade blocked'));
  var broken = S.create({ ownerProfileId: 'broken' });
  var b3 = await broken.init();
  ok('P4M-14 升级失败降级 ls', b3 === 'ls' && broken.backend() === 'ls', b3);
  ok('P4M-15 升级失败记录错误码', broken.getHealth().lastError === 'DB_UPGRADE_FAILED',
    JSON.stringify(broken.getHealth()));
  var stB = legacyState();
  await broken.save(stB);
  ok('P4M-16 降级后仍可保存读取', (await broken.get(stB.id)) !== null);

  /* 7 旧 v1 库未被破坏 */
  ok('P4M-17 升级失败不影响既有 v2 库', count(DB, 'tasks') === 1 && fake.db(DB).version === 2);

  /* 8 历史任务隔离：无 owner 的旧记录进入隔离区，不混入当前档案 */
  var BASE = 'astrum.tasks.v1';
  var noOwner = {
    id: 'tsk_no_owner',
    question: '无归属旧任务',
    phase: 'EXECUTE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    state: T.toJSON(legacyState())
  };
  await makeLegacyDb(BASE, [noOwner]);
  var mig = await S.migrateLegacy({ force: true });
  ok('P4M-18 无归属旧任务被隔离', mig.quarantined >= 1 && mig.failed === 0, JSON.stringify(mig));
  var current = S.create({ ownerProfileId: 'legacy' });
  await current.init();
  var list = await current.list({ limit: 50 });
  ok('P4M-19 隔离任务不进入当前档案', !list.some(function (x) { return x.id === 'tsk_no_owner'; }));

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
