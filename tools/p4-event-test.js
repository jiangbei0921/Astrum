/* ASTRUM P4 B3 · Event 持久化与一致性测试
 * 用法：node tools/p4-event-test.js
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
function evData(dbName) {
  var db = fake.db(dbName);
  return db && db._stores.events ? db._stores.events.data : {};
}
function evRows(dbName) {
  var d = evData(dbName);
  return Object.keys(d).map(function (k) { return d[k]; });
}

function makeState() {
  var st = T.create({ question: '事件测试', phase: 'EXECUTE', level: 'L2' });
  st.plan = { planId: 'pe', version: 1, steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: {} }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  T.appendEvent(st, 'step.started', {}, 's1');
  T.appendEvent(st, 'step.ok', {}, 's1');
  T.appendEvent(st, 'progress.decided', { action: 'stop', reason: 'ok' });
  return st;
}

(async function () {
  var DB = 'p.ev.astrum.tasks.v1';
  var store = S.create({ ownerProfileId: 'ev' });
  await store.init();
  var st = makeState();
  await store.save(st);

  /* 1 持久化与顺序 */
  var rows = evRows(DB);
  ok('P4E-01 事件写入派生索引', rows.length === 3, rows.length);
  ok('P4E-02 事件 taskId 一致', rows.every(function (r) { return r.taskId === st.id; }));
  ok('P4E-03 事件按 seq 1..3', rows.map(function (r) { return r.seq; }).sort().join(',') === '1,2,3');
  ok('P4E-04 事件带稳定 eventId', rows.every(function (r) { return r.eventId === r.taskId + ':' + r.seq; }));
  ok('P4E-05 事件带 owner 作用域', rows.every(function (r) { return r.ownerProfileId === 'ev'; }));

  var list = await store.listEvents(st.id);
  ok('P4E-06 listEvents 顺序单调', list.map(function (r) { return r.seq; }).join(',') === '1,2,3');
  ok('P4E-07 listEvents 与内嵌副本一致', list.map(function (r) { return r.type; }).join(',') ===
    st.events.map(function (e) { return e.type; }).join(','));

  /* 2 过滤 */
  var after = await store.listEvents(st.id, { afterSeq: 1 });
  ok('P4E-08 afterSeq 过滤', after.length === 2 && after[0].seq === 2);
  var limited = await store.listEvents(st.id, { limit: 1 });
  ok('P4E-09 limit 限制', limited.length === 1 && limited[0].seq === 1);

  /* 3 重复保存幂等 */
  st.pausedAt = new Date().toISOString();
  await store.save(st);
  ok('P4E-10 重复保存不重复写事件', evRows(DB).length === 3, evRows(DB).length);
  ok('P4E-11 重复保存不报冲突', (await store.listEvents(st.id)).length === 3);

  /* 4 内容冲突 */
  var conflict = T.fromJSON(T.toJSON(st));
  conflict.events[0].at = '2000-01-01T00:00:00.000Z';
  var conflictCode = '';
  try { await store.save(conflict); } catch (e) { conflictCode = e.code; }
  ok('P4E-12 历史事件内容变化报 EVENT_CONFLICT', conflictCode === 'EVENT_CONFLICT', conflictCode);
  ok('P4E-13 冲突后权威记录不变', (await store.get(st.id)).events[0].at !== '2000-01-01T00:00:00.000Z');

  /* 5 断号检测辅助：seq 1,3 合法但可被恢复校验识别 */
  var gap = T.create({ question: '断号', phase: 'EXECUTE', level: 'L2' });
  gap.events = [
    { seq: 1, at: new Date().toISOString(), taskId: gap.id, type: 'step.started', stepId: 's1', payload: {} },
    { seq: 3, at: new Date().toISOString(), taskId: gap.id, type: 'step.ok', stepId: 's1', payload: {} }
  ];
  await store.save(gap);
  var gapLogs = await store.listEvents(gap.id);
  ok('P4E-14 断号事件仍按权威读取', gapLogs.length === 2 && gapLogs[1].seq === 3);

  /* 6 索引缺失重建 */
  var rowsAll = evData(DB);
  Object.keys(rowsAll).forEach(function (k) {
    if (rowsAll[k].taskId === st.id && rowsAll[k].seq === 2) delete rowsAll[k];
  });
  ok('P4E-15 模拟索引缺失', evRows(DB).filter(function (r) { return r.taskId === st.id; }).length === 2);
  var rebuilt = await store.listEvents(st.id);
  ok('P4E-16 读取自动重建索引', rebuilt.length === 3 &&
    evRows(DB).filter(function (r) { return r.taskId === st.id; }).length === 3);

  /* 7 跨档案读取 */
  var other = S.create({ ownerProfileId: 'ev2' });
  await other.init();
  ok('P4E-17 跨档案事件读取为空', (await other.listEvents(st.id)).length === 0);

  /* 8 删除级联后事件为空 */
  await store.remove(gap.id);
  ok('P4E-18 删除任务级联删除事件', evRows(DB).filter(function (r) { return r.taskId === gap.id; }).length === 0);
  ok('P4E-19 其他任务事件不受影响', evRows(DB).filter(function (r) { return r.taskId === st.id; }).length === 3);

  /* 9 事件 payload 白名单在契约层 */
  var payloadErr = '';
  try { T.appendEvent(st, 'step.ok', { secret: 'x' }, 's1'); } catch (e) { payloadErr = e.code; }
  ok('P4E-20 非白名单 payload 被拒绝', payloadErr === 'E_EVENT_PAYLOAD', payloadErr);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
