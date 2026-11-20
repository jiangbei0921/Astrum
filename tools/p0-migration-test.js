/* ASTRUM P0 历史任务迁移测试
 *
 * 验证：隔离而非归属、幂等、不删除旧数据、损坏记录不阻塞、新格式不重复迁移。
 * 用法：node tools/p0-migration-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] == null ? null : this._d[k]; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

['core/profile.js', 'core/profile-context.js', 'core/task.js', 'core/task-store.js']
  .forEach(function (f) { require(path.join(ROOT, f)); });

var P = global.Profile;
var T = global.AstroTask;
var Store = global.AstroTaskStore;

var pass = 0;
var fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra || '')); }
}

function legacyRec(id, question) {
  var s = T.create({ question: question, phase: 'EXECUTE', level: 'L3' });
  return {
    id: id, question: question, phase: 'EXECUTE',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    state: T.toJSON(s)
  };
}

async function main() {
  var A = P.currentId();
  var legacy = {
    tsk_legacy_a: legacyRec('tsk_legacy_a', '旧任务 A'),
    tsk_legacy_b: legacyRec('tsk_legacy_b', '旧任务 B')
  };
  legacy.tsk_legacy_b.state = 'not-json';
  global.localStorage.setItem('astrum.tasks.v1', JSON.stringify(legacy));

  var m1 = await Store.migrateLegacy({ force: true });
  ok('P0-MIGRATION-101 扫描到全部旧任务', m1.total === 2, JSON.stringify(m1));
  ok('P0-MIGRATION-102 全部进入隔离区', m1.quarantined === 2, JSON.stringify(m1));
  ok('P0-MIGRATION-103 损坏记录不阻塞', m1.failed === 0, JSON.stringify(m1));

  var q = JSON.parse(global.localStorage.getItem(Store.QUARANTINE_DB) || '{}');
  var qa = q['legacy:tsk_legacy_a'];
  var qb = q['legacy:tsk_legacy_b'];
  ok('P0-MIGRATION-104 隔离状态为 pending_migration',
    qa && qa.migrationState === 'pending_migration', qa && qa.migrationState);
  ok('P0-MIGRATION-105 不自动分配档案',
    qa && qa.candidateProfileId === null && qb && qb.candidateProfileId === null);
  ok('P0-MIGRATION-106 旧数据保留', JSON.parse(global.localStorage.getItem('astrum.tasks.v1')).tsk_legacy_a.id === 'tsk_legacy_a');

  var m2 = await Store.migrateLegacy({ force: true });
  var q2 = JSON.parse(global.localStorage.getItem(Store.QUARANTINE_DB) || '{}');
  ok('P0-MIGRATION-107 重复迁移不膨胀',
    Object.keys(q2).length === 2 && m2.quarantined === 2, JSON.stringify(m2));

  var flag = JSON.parse(global.localStorage.getItem(Store.MIGRATION_KEY) || '{}');
  ok('P0-MIGRATION-108 迁移标记写入', flag.version === 1 && flag.done === true,
    JSON.stringify(flag));

  var storeA = Store.create({});
  var list = await storeA.list();
  ok('P0-MIGRATION-109 隔离任务不出现在当前档案',
    !list.some(function (x) { return x.id === 'tsk_legacy_a' || x.id === 'tsk_legacy_b'; }));

  var s = T.create({ question: '新格式任务', phase: 'EXECUTE', level: 'L3' });
  await storeA.save(s);
  var m3 = await Store.migrateLegacy({ force: true });
  var q3 = JSON.parse(global.localStorage.getItem(Store.QUARANTINE_DB) || '{}');
  ok('P0-MIGRATION-110 新格式任务不会被再次隔离',
    !q3['legacy:' + s.id] && m3.total === 2, JSON.stringify(m3));

  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
