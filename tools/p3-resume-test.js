/**
 * ASTRUM P3 B5 · 暂停与恢复门槛测试
 * 用法：node tools/p3-resume-test.js
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

['core/task.js', 'core/security.js', 'core/task-store.js', 'core/control.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
var TS = global.AstroTaskStore;
var C = global.AstroControl;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

function execState(opts) {
  opts = opts || {};
  var st = T.create({
    question: 'q',
    phase: 'EXECUTE',
    level: opts.level || 'L3',
    budget: opts.budget,
    checkpoints: opts.checkpoints || [],
    steps: [{ id: 't1', tool: 'astro.calc', deps: [], args: {} }]
  });
  st.steps[0].status = opts.status || 'pending';
  return st;
}

(async function () {
  var store = TS.create({});

  /* P1 暂停 */
  var st = execState({});
  await store.save(st);
  var p1 = await C.pause(st.id, { store: store });
  ok('P3-R1-01 暂停成功', p1 && p1.verdict === 'PAUSED' && p1.paused === true);
  ok('P3-R1-02 写入 pausedAt', typeof p1.state.pausedAt === 'string' && !!p1.state.pausedAt);
  ok('P3-R1-03 记录 task.paused 事件', p1.state.events.some(function (e) { return e.type === 'task.paused'; }));
  var persisted = await store.get(st.id);
  ok('P3-R1-04 暂停已持久化', !!persisted && !!persisted.pausedAt);
  var p2 = await C.pause(st.id, { store: store });
  ok('P3-R1-05 重复暂停幂等', p2 && p2.already === true);

  /* P2 终态不可暂停 */
  var done = T.create({ question: 'd', phase: 'DONE' });
  await store.save(done);
  var p3 = await C.pause(done.id, { store: store });
  ok('P3-R2-01 终态暂停为只读', p3 && p3.verdict === 'VIEW_ONLY' && p3.paused === false);

  /* P3 恢复次数上限 */
  var limited = execState({ level: 'L2' });
  limited.budget.used.recoveries = 1;
  await store.save(limited);
  var r1 = await C.resume(limited.id, {}, {}, { store: store });
  ok('P3-R3-01 超出恢复上限拒绝', r1 && r1.verdict === 'DENIED' && r1.error === 'RECOVERY_LIMIT',
    JSON.stringify(r1 && { v: r1.verdict, e: r1.error }));

  /* P4 检查点损坏 */
  var bad = execState({ level: 'L3', checkpoints: [{ checkpointId: 'chk_x', version: 1 }] });
  await store.save(bad);
  var r2 = await C.resume(bad.id, {}, {}, { store: store });
  ok('P3-R4-01 检查点缺失 stateHash 拒绝', r2 && r2.verdict === 'DENIED' && r2.error === 'CHECKPOINT_INVALID',
    JSON.stringify(r2 && { v: r2.verdict, e: r2.error }));

  /* P5 旧任务缺 recoveries 字段：补齐后允许一次恢复（这里只验证加载与计数） */
  var legacy = JSON.parse(T.toJSON(execState({ level: 'L1' })));
  delete legacy.budget.limit.recoveries;
  delete legacy.budget.used.recoveries;
  delete legacy.recoveries;
  var reloaded = T.fromJSON(legacy);
  ok('P3-R5-01 旧任务恢复预算兼容', reloaded.budget.limit.recoveries === 1 &&
    reloaded.budget.used.recoveries === 0);

  console.log('\nRESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.log('FAIL | 异常 | ' + (e && e.stack || e));
  console.log('\nRESULT ' + pass + '/' + (pass + fail + 1));
  process.exit(1);
});
