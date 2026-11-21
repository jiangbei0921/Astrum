/*
 * ASTRUM V2-B3 · 未知幂等性恢复凭证测试
 * 用法：node tools/v2-recovery-idempotency-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/recovery.js'));

var T = global.AstroTask;
var R = global.AstroRecovery;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

var registry = {
  get: function (id) {
    if (id === 'unknown.tool') return { id: id, version: '2.0.0' };
    if (id === 'idem.tool') return { id: id, version: '1.0.0', idempotent: true };
    if (id === 'nonidem.tool') return { id: id, version: '1.0.0', idempotent: false };
    return null;
  }
};

function stateWith(defs) {
  var st = T.create({
    question: 'q', level: 'L3',
    steps: defs.map(function (d) { return { id: d.id, tool: d.tool, deps: [], args: { q: d.id } }; })
  });
  st.plan = { planId: 'p', version: 1, steps: defs.map(function (d) {
    return { id: d.id, tool: d.tool, deps: [], args: { q: d.id } };
  }) };
  st.steps.forEach(function (s) {
    var d = defs.filter(function (x) { return x.id === s.id; })[0];
    s.status = 'ok';
    s.result = d.result === undefined ? { ok: true, value: d.id } : d.result;
    s.outputHash = d.hash !== undefined ? d.hash : T.sha256Hex(T.canonicalJSON(s.result));
    s.provenance = d.provenance || { tool: d.tool, version: d.provVersion || '2.0.0', at: new Date().toISOString() };
  });
  return st;
}

var st = stateWith([
  { id: 'a', tool: 'unknown.tool' },                                  /* 凭证一致 → reuse */
  { id: 'b', tool: 'unknown.tool', hash: 'deadbeef' },                /* 哈希不符 → block */
  { id: 'c', tool: 'unknown.tool', provVersion: '1.9.0' },            /* 版本变化 → block */
  { id: 'd', tool: 'idem.tool' },                                     /* 显式幂等 → reuse */
  { id: 'e', tool: 'nonidem.tool' },                                  /* 显式非幂等 → rerun */
  { id: 'f', tool: 'unknown.tool', hash: '' }                          /* 无输出哈希 → block */
]);

var applied = R.apply({ state: st, registry: registry }).applied;
var byId = {};
st.steps.forEach(function (s) { byId[s.id] = s; });

ok('V2-IDEM-01 凭证一致的未知幂等步骤复用', applied.reuse.indexOf('a') >= 0);
ok('V2-IDEM-02 哈希不符的未知幂等步骤阻塞', applied.blocked.indexOf('b') >= 0);
ok('V2-IDEM-03 哈希不符不重置结果', byId.b.status === 'ok' && byId.b.result != null);
ok('V2-IDEM-04 工具版本变化阻塞', applied.blocked.indexOf('c') >= 0);
ok('V2-IDEM-05 显式幂等步骤仍复用', applied.reuse.indexOf('d') >= 0);
ok('V2-IDEM-06 显式非幂等步骤重跑并重置', applied.rerun.indexOf('e') >= 0 &&
  byId.e.status === 'pending' && byId.e.result === null);
ok('V2-IDEM-07 无输出哈希阻塞', applied.blocked.indexOf('f') >= 0);

/* 外部直接调用 decide 也必须经过凭证校验 */
var directBad = R.decide(st, byId.b, registry, Date.now());
ok('V2-IDEM-08 直接 decide 对哈希不符返回 block',
  directBad.strategy === 'block' && directBad.reason === 'unknown_idempotency_hash_mismatch', directBad.reason);
var directGood = R.decide(st, byId.a, registry, Date.now());
ok('V2-IDEM-08b 直接 decide 对凭证一致返回 verified reuse',
  directGood.strategy === 'reuse' && directGood.reason === 'unknown_idempotent_verified', directGood.reason);

/* plan 与 apply 使用同一 decide 策略（含凭证校验） */
var planned = R.plan({ state: st, registry: registry });
ok('V2-IDEM-09 plan 返回步级策略', planned.steps.length === 6 &&
  planned.steps.filter(function (x) { return x.id === 'e'; })[0].strategy === 'rerun');

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
