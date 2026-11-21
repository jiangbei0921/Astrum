/* ASTRUM P4 B7 · 可恢复任务 UI 信息测试（Node 静态 + 摘要契约）
 * 用法：node tools/p4-ui-test.js
 */
'use strict';

var fs = require('fs');
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

var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var app = fs.readFileSync(path.join(ROOT, 'core/app.js'), 'utf8');

function stateWith(opts) {
  var st = T.create({ question: opts.q || 'UI', phase: 'EXECUTE', level: 'L2' });
  st.steps = [T.makeStep({ id: 's1', tool: 'kb.lookup', deps: [], args: {} })];
  st.steps[0].status = opts.status || 'pending';
  if (opts.paused) st.pausedAt = new Date().toISOString();
  st.recoveries = opts.recoveries || 0;
  return st;
}

(async function () {
  var store = S.create({ ownerProfileId: 'ui' });
  await store.init();

  var paused = stateWith({ paused: true, recoveries: 1 });
  await store.save(paused);
  var waiting = stateWith({ status: 'waiting_approval' });
  await store.save(waiting);
  var normal = stateWith({});
  await store.save(normal);
  var broken = stateWith({});
  await store.save(broken);
  var data = fake.db('p.ui.astrum.tasks.v1')._stores.tasks.data;
  data[JSON.stringify(broken.id)].state = '{broken';

  var all = await store.list({ limit: 20 });
  var byId = {};
  all.forEach(function (x) { byId[x.id] = x; });

  ok('P4U-01 摘要透出暂停状态', byId[paused.id] && byId[paused.id].paused === true);
  ok('P4U-02 摘要透出待审批状态', byId[waiting.id] && byId[waiting.id].waitingApproval === true);
  ok('P4U-03 摘要透出恢复次数', byId[paused.id] && byId[paused.id].recoveries === 1);
  ok('P4U-04 摘要透出最后保存时间', !!(byId[normal.id] && byId[normal.id].updatedAt));
  ok('P4U-05 损坏任务标 stale', byId[broken.id] && byId[broken.id].stale === true);
  ok('P4U-06 损坏任务不进入可恢复列表',
    !(await store.listResumable()).some(function (x) { return x.id === broken.id; }));

  /* 恢复卡片信息 */
  ok('P4U-07 卡片展示保存时间', app.indexOf('保存于') >= 0);
  ok('P4U-08 卡片展示暂停/待审批', app.indexOf('已暂停') >= 0 && app.indexOf('待审批') >= 0);
  ok('P4U-09 卡片展示恢复次数', app.indexOf('已恢复') >= 0);

  /* 失败原因映射 */
  ['RECOVERY_LIMIT', 'CHECKPOINT_INVALID', 'PROJECT_NOT_ACTIVE', 'TOOL_MISSING',
    'STALE_WRITE', 'QUOTA_EXCEEDED'].forEach(function (code, i) {
    ok('P4U-' + (10 + i) + ' 失败原因映射 ' + code, app.indexOf(code) >= 0);
  });
  ok('P4U-16 恢复失败按错误码提示', app.indexOf('resumeFailureText') >= 0);

  /* 模块加载顺序 */
  var iRec = html.indexOf('core/recovery.js');
  var iCtl = html.indexOf('core/control.js');
  ok('P4U-17 index.html 加载 recovery.js', iRec > 0);
  ok('P4U-18 recovery.js 在 control.js 之前', iRec > 0 && iCtl > iRec, iRec + ':' + iCtl);

  /* 不后台执行文案 */
  ok('P4U-19 恢复入口需用户主动点击', html.indexOf('继续任务') >= 0 || app.indexOf('继续任务') >= 0);

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  console.log('\nRESULT ' + (pass) + '/' + (pass + fail + 1));
  process.exit(1);
});
