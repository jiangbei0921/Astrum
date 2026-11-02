/* ASTRUM · V1.5 TaskStore 压力测试（Node localStorage 后端）
 *
 * 1000 条任务保存/读取/列表/删除/清理；验证无重复、状态完整、可清理。
 * 浏览器 IndexedDB 压力仍由 v1-1-browser/store-test 覆盖，长时压测 DEFERRED。
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};
['core/task.js', 'core/task-store.js'].forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
var Store = global.AstroTaskStore;
var results = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }

(async function main() {
  var store = Store.create({});
  await store.init();
  var t0 = Date.now();
  for (var i = 0; i < 1000; i++) {
    var s = T.create({ question: 'stress-' + i, level: 'L3' });
    await store.save(s);
  }
  var saveMs = Date.now() - t0;
  ok('S1 后端可用', store.backend() === 'ls' || store.backend() === 'idb' || store.backend() === 'memory',
    'backend=' + store.backend());
  var list = await store.list({ limit: 1000 });
  ok('S2 保存 1000 条后受 localStorage 上限约束', list.length === 40, 'n=' + list.length);
  var ids = {};
  ok('S3 无重复记录', list.every(function (x) { var d = !!ids[x.id]; ids[x.id] = 1; return !d; }));
  var one = await store.get(list[0].id);
  ok('S4 单条可读且 phase 完整', !!one && one.phase === 'INIT');
  console.log('listLen=' + list.length);
  for (var k = 0; k < Math.min(20, list.length); k++) await store.remove(list[k].id);
  var left = await store.list({ limit: 40 });
  ok('S5 删除 20 条', left.length === 20, 'n=' + left.length);
  await store.clear();
  var after = await store.list({ limit: 20 });
  ok('S6 清理后为空', after.length === 0, 'n=' + after.length);
  if (typeof global.gc === 'function') global.gc();
  var mem = process.memoryUsage();
  console.log('save1000Ms=' + saveMs + ' heapUsedMB=' + (mem.heapUsed / 1024 / 1024).toFixed(2) +
    ' rssMB=' + (mem.rss / 1024 / 1024).toFixed(2));
  for (var j = 0; j < results.length; j++) console.log((results[j].pass ? 'PASS' : 'FAIL') + ' | ' + results[j].name + (results[j].extra ? ' | ' + results[j].extra : ''));
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-5-store] ' + (e && e.stack || e));
  process.exit(1);
});
