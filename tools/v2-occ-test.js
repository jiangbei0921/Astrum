/*
 * ASTRUM V2-B4 · 多标签页乐观并发控制测试
 * 用法：node tools/v2-occ-test.js
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

require('./fake-idb').install();
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/task-store.js'));

var T = global.AstroTask;
var S = global.AstroTaskStore;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}
function mkState(question) {
  var st = T.create({ question: question, phase: 'EXECUTE', level: 'L2' });
  st.plan = { planId: 'p1', version: 1, steps: [{ id: 's1', tool: 'kb.lookup', deps: [], args: {} }] };
  st.steps = [T.makeStep(st.plan.steps[0])];
  return st;
}

(async function () {
  var a = S.create({});
  var b = S.create({});
  var st = mkState('标签页 A');

  var id = await a.save(st);
  var rec1 = await a.getRecord(id);
  ok('V2-OCC-01 首次保存 revision=1', rec1 && rec1.revision === 1, rec1 && rec1.revision);

  /* 标签页 A 基于 revision 1 保存成功 */
  st.question = '标签页 A 更新';
  await a.save(st, { expectedRevision: 1 });
  var rec2 = await a.getRecord(id);
  ok('V2-OCC-02 同修订保存成功且 revision+1', rec2.revision === 2, rec2.revision);

  /* 标签页 B 仍拿着 revision 1 → 必须被拒绝 */
  var stB = await b.get(id);
  stB.question = '标签页 B 覆盖';
  var stale = null;
  try {
    await b.save(stB, { expectedRevision: 1 });
  } catch (e) { stale = e; }
  ok('V2-OCC-03 旧修订写入被 STALE_WRITE 拒绝', stale && stale.code === 'STALE_WRITE', stale && stale.code);

  var rec3 = await b.getRecord(id);
  ok('V2-OCC-04 旧修订未覆盖最新内容', rec3.revision === 2 && rec3.question === '标签页 A 更新');

  /* 重新读取最新修订后可成功写入 */
  await b.save(stB, { expectedRevision: 2 });
  var rec4 = await b.getRecord(id);
  ok('V2-OCC-05 刷新修订后可写入', rec4.revision === 3 && rec4.question === '标签页 B 覆盖');

  /* 重复点击恢复：两个请求都基于同一任务的 revision 3，只允许一个成功 */
  var stR = await a.get(id);
  stR.question = '恢复一';
  var first = await a.save(stR, { expectedRevision: 3 });
  ok('V2-OCC-06 第一个恢复成功', !!first);
  stR.question = '恢复二';
  var dup = null;
  try {
    await b.save(stR, { expectedRevision: 3 });
  } catch (e) { dup = e; }
  ok('V2-OCC-07 第二个恢复被拒绝', dup && dup.code === 'STALE_WRITE', dup && dup.code);

  /* 未提供 expectedRevision 的兼容路径仍可用（旧调用方） */
  var legacy = mkState('旧调用方');
  var okLegacy = true;
  try { await a.save(legacy); } catch (e) { okLegacy = false; }
  ok('V2-OCC-08 旧调用方兼容', okLegacy);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.message));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
