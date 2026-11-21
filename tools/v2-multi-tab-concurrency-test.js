/*
 * ASTRUM V2-B4 · 多标签页并发与原子事务测试
 * 用法：node tools/v2-multi-tab-concurrency-test.js
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
function mkState(question, id) {
  var st = T.create({ question: question, phase: 'EXECUTE', level: 'L2' });
  if (id) st.id = id;
  st.plan = { planId: 'p1', version: 1, steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: {} }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  return st;
}
function loadState(rec) {
  var raw = typeof rec.state === 'string' ? JSON.parse(rec.state) : rec.state;
  return T.fromJSON(JSON.parse(JSON.stringify(raw)));
}
function injectRaw(dbName, rec) {
  var db = fake.db(dbName);
  db._stores.tasks.data[JSON.stringify(rec.id)] = rec;
}

(async function () {
  var a = S.create({});
  var b = S.create({});
  var st = mkState('并发基线');
  var id = await a.save(st);
  var rec1 = await a.getRecord(id);
  ok('V2-MT-01 基线 revision=1', rec1 && rec1.revision === 1, rec1 && rec1.revision);

  /* 1. 两个标签页同时基于 revision 1 写入：只有一个成功 */
  var copyA = loadState(rec1);
  var copyB = loadState(rec1);
  copyA.question = 'A 写入';
  copyB.question = 'B 写入';
  var rr = await Promise.allSettled([
    a.save(copyA, { expectedRevision: 1 }),
    b.save(copyB, { expectedRevision: 1 })
  ]);
  var fulfilled = rr.filter(function (x) { return x.status === 'fulfilled'; }).length;
  var rejected = rr.filter(function (x) { return x.status === 'rejected'; });
  var recAfter = await a.getRecord(id);
  ok('V2-MT-02 并发写入恰好一个成功', fulfilled === 1, fulfilled);
  ok('V2-MT-03 失败方得到 STALE_WRITE', rejected.length === 1 && rejected[0].reason.code === 'STALE_WRITE',
    rejected[0] && rejected[0].reason.code);
  ok('V2-MT-04 修订只递增一次无丢更新', recAfter.revision === 2 &&
    (loadState(recAfter).question === 'A 写入' || loadState(recAfter).question === 'B 写入'), recAfter.revision);

  /* 2. 首次保存并发：第二个基于 revision 0 必须失败 */
  var st2 = mkState('首次并发', 'task-first-concurrent');
  var r2 = await Promise.allSettled([
    a.save(st2, { expectedRevision: 0 }),
    b.save(st2, { expectedRevision: 0 })
  ]);
  var ok2 = r2.filter(function (x) { return x.status === 'fulfilled'; }).length;
  ok('V2-MT-05 首次并发保存仅一个成功', ok2 === 1, ok2);

  /* 3. 事件追加冲突：历史 seq 内容不可被覆盖 */
  var st3 = mkState('事件追加');
  var id3 = await a.save(st3);
  var rec3 = await a.getRecord(id3);
  var base3 = loadState(rec3);
  var base3b = loadState(rec3);
  T.appendEvent(base3, 'step.started', { reason: 'a' }, 's1');
  T.appendEvent(base3b, 'step.started', { reason: 'b' }, 's1');
  var er = await Promise.allSettled([
    a.save(base3, { expectedRevision: 1 }),
    b.save(base3b, { expectedRevision: 1 })
  ]);
  var eWin = er.filter(function (x) { return x.status === 'fulfilled'; }).length;
  var eLose = er.filter(function (x) { return x.status === 'rejected'; });
  ok('V2-MT-06 并发事件追加单写成功', eWin === 1 && eLose.length === 1, eWin);

  /* 失败方重新读取后重放事件可成功，且 seq 继续递增 */
  var rec3c = await b.getRecord(id3);
  var st3c = loadState(rec3c);
  var oldSeq = st3c.events[st3c.events.length - 1].seq;
  T.appendEvent(st3c, 'step.retry', { reason: 'b' }, 's1');
  await b.save(st3c, { expectedRevision: rec3c.revision });
  var rec3d = await b.getRecord(id3);
  var events3d = loadState(rec3d).events;
  ok('V2-MT-07 冲突后重读重放成功且 seq 单调', rec3d.revision === rec3c.revision + 1 &&
    events3d[events3d.length - 1].seq > oldSeq);

  /* 4. 不同任务并发保存互不阻塞/互不冲突 */
  var stA = mkState('任务 A', 'task-a');
  var stB = mkState('任务 B', 'task-b');
  var different = await Promise.allSettled([
    a.save(stA, { expectedRevision: 0 }),
    b.save(stB, { expectedRevision: 0 })
  ]);
  ok('V2-MT-08 不同任务并发保存均成功',
    different.every(function (x) { return x.status === 'fulfilled'; }));

  /* 5. 不同 Profile 数据隔离 */
  var p1 = S.create({ ownerProfileId: 'p1' });
  var p2 = S.create({ ownerProfileId: 'p2' });
  var sP1 = mkState('Profile 1', 'shared-id');
  var sP2 = mkState('Profile 2', 'shared-id');
  await p1.save(sP1, { expectedRevision: 0 });
  await p2.save(sP2, { expectedRevision: 0 });
  var g1 = await p1.get('shared-id');
  var g2 = await p2.get('shared-id');
  ok('V2-MT-09 不同 Profile 互不可见', g1.question === 'Profile 1' && g2.question === 'Profile 2');

  /* 6. 事务中断：失败无部分写入，revision 不变 */
  var st6 = mkState('事务中断');
  var id6 = await a.save(st6);
  var before6 = await a.getRecord(id6);
  var st6b = loadState(before6);
  st6b.question = '不应落盘';
  fake.abortNextTransaction();
  var abortErr = null;
  try { await a.save(st6b, { expectedRevision: 1 }); } catch (e) { abortErr = e; }
  var after6 = await a.getRecord(id6);
  ok('V2-MT-10 事务中断返回持久化错误', abortErr && abortErr.code === 'PERSIST_TX_FAILED', abortErr && abortErr.code);
  ok('V2-MT-11 事务中断无部分写入', after6.revision === 1 && loadState(after6).question === '事务中断');

  /* 7. 数据库升级版本可见 */
  var health = a.getHealth();
  ok('V2-MT-12 数据库版本为 2', health.dbVersion === 2 && S.DB_VER === 2);

  /* 8. 历史记录无 revision 时按 revision=1 兼容 */
  var legacyId = 'legacy-task';
  var legacyState = T.toJSON(mkState('历史格式', legacyId));
  injectRaw(S.DB_NAME, {
    id: legacyId, ownerProfileId: null, projectId: null,
    updatedAt: new Date().toISOString(), eventsUpToSeq: 0,
    state: legacyState
  });
  var legacy = await a.getRecord(legacyId);
  ok('V2-MT-13 历史无 revision 记录可兼容读取', legacy && legacy.revision == null);
  var legacyState2 = loadState(legacy);
  legacyState2.question = '历史格式更新';
  await a.save(legacyState2, { expectedRevision: 1 });
  var legacy2 = await a.getRecord(legacyId);
  ok('V2-MT-14 历史记录可在 revision=1 上更新', legacy2.revision === 2 && loadState(legacy2).question === '历史格式更新');

  /* 9. 导入旧格式（缺少 pauseRequestedAt / abort 字段）可读写 */
  var oldId = 'old-format';
  var oldState = mkState('旧格式', oldId);
  oldState.pauseRequestedAt = undefined;
  oldState.steps[0].abort = undefined;
  var oldJson = JSON.parse(T.toJSON(oldState));
  delete oldJson.pauseRequestedAt;
  delete oldJson.steps[0].abort;
  injectRaw(S.DB_NAME, {
    id: oldId, ownerProfileId: null, projectId: null, revision: 1,
    updatedAt: new Date().toISOString(), eventsUpToSeq: 0,
    state: oldJson
  });
  var oldLoaded = await a.get(oldId);
  ok('V2-MT-15 旧格式可加载', oldLoaded && oldLoaded.question === '旧格式');
  await a.save(oldLoaded, { expectedRevision: 1 });
  var oldSaved = await a.getRecord(oldId);
  ok('V2-MT-16 旧格式可再次保存', oldSaved.revision === 2);

  /* 10. 无修订号旧调用方仍受 updatedAt 兜底保护 */
  var sp = S.create({ ownerProfileId: 'p9' });
  var st10 = mkState('时间兜底');
  var id10 = await sp.save(st10);
  var r10 = await sp.getRecord(id10);
  var stale10 = loadState(r10);
  stale10.updatedAt = new Date(Date.now() - 10000).toISOString();
  var tErr = null;
  try { await sp.save(stale10); } catch (e) { tErr = e; }
  ok('V2-MT-17 无 expectedRevision 时 updatedAt 兜底', tErr && tErr.code === 'STALE_WRITE', tErr && tErr.code);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
