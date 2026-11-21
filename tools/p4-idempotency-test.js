/* ASTRUM P4 B5 · 幂等策略矩阵测试
 * 用法：node tools/p4-idempotency-test.js
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

var NOW = Date.parse('2026-11-21T12:00:00.000Z');
var registry = {
  get: function (tool) {
    var map = {
      'kb.lookup': { id: 'kb.lookup', idempotent: true, ttlMs: null, retry: { allowed: false, max: 0 } },
      'paper.search': { id: 'paper.search', idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 } },
      'simbad.tap': { id: 'simbad.tap', idempotent: true, ttlMs: 604800000, retry: { allowed: true, max: 1 } },
      'evidence.search': { id: 'evidence.search', idempotent: false, ttlMs: 0, retry: { allowed: false, max: 0 } }
    };
    return map[tool] || null;
  }
};

function stateWith(steps) {
  var st = T.create({ question: '幂等矩阵', phase: 'EXECUTE', level: 'L3' });
  st.plan = { planId: 'p', version: 1, steps: steps.map(function (s) {
    return { id: s.id, tool: s.tool, deps: [], args: s.args || {} };
  }) };
  st.steps = steps.map(function (s) {
    var step = T.makeStep({ id: s.id, tool: s.tool, deps: [], args: s.args || {} });
    step.status = s.status || 'ok';
    step.attempt = s.attempt == null ? 1 : s.attempt;
    step.outputHash = s.noOutput ? null : ('h_' + s.id);
    step.result = s.noResult ? null : { ok: true };
    step.endedAt = s.endedAt || null;
    if (s.endedAt) step.provenance = { tool: s.tool, at: s.endedAt };
    if (s.inputHash) step.inputHash = s.inputHash;
    if (s.failed) {
      step.status = 'failed';
      step.error = { kind: 'tool_error', message: 'x', retriable: !!s.retriable };
    }
    return step;
  });
  return st;
}

function strategyOf(plan, id) {
  var hit = plan.steps.filter(function (s) { return s.id === id; })[0];
  return hit ? hit.strategy : null;
}

/* 1 三策略 */
var fresh = new Date(NOW - 1000).toISOString();
var expired = new Date(NOW - 8 * 24 * 3600 * 1000).toISOString();
var st = stateWith([
  { id: 'a', tool: 'kb.lookup' },
  { id: 'b', tool: 'paper.search' },
  { id: 'c', tool: 'simbad.tap', endedAt: fresh },
  { id: 'd', tool: 'simbad.tap', endedAt: expired }
]);
var p = R.plan({ state: st, registry: registry, now: NOW });
ok('P4I-01 幂等工具复用', strategyOf(p, 'a') === 'reuse', strategyOf(p, 'a'));
ok('P4I-02 非幂等工具重跑', strategyOf(p, 'b') === 'rerun', strategyOf(p, 'b'));
ok('P4I-03 TTL 内复用', strategyOf(p, 'c') === 'reuse', strategyOf(p, 'c'));
ok('P4I-04 TTL 过期重跑', strategyOf(p, 'd') === 'rerun', strategyOf(p, 'd'));
ok('P4I-05 plan 返回策略清单', p.steps.length === 4 && p.reusable.length === 2 && p.rerun.length === 2,
  JSON.stringify({ re: p.reusable, rr: p.rerun }));

/* 2 输入变化优先重跑 */
var changed = stateWith([
  { id: 'e', tool: 'kb.lookup', inputHash: 'different' }
]);
var pc = R.plan({ state: changed, registry: registry, now: NOW });
ok('P4I-06 输入变化即使幂等也重跑', strategyOf(pc, 'e') === 'rerun', strategyOf(pc, 'e'));

/* 3 缺失声明 */
var unknown = stateWith([
  { id: 'u1', tool: 'custom.unknown' },
  { id: 'u2', tool: 'custom.unknown', noOutput: true }
]);
var pu = R.plan({ state: unknown, registry: registry, now: NOW });
ok('P4I-07 未知工具但有结果保守复用', strategyOf(pu, 'u1') === 'reuse', strategyOf(pu, 'u1'));
ok('P4I-08 未知工具且无结果阻断', strategyOf(pu, 'u2') === 'block', strategyOf(pu, 'u2'));

/* 4 未完成与失败 */
var mixed = stateWith([
  { id: 'p1', tool: 'kb.lookup', status: 'pending' },
  { id: 'f1', tool: 'simbad.tap', failed: true, retriable: true, attempt: 1 },
  { id: 'f2', tool: 'kb.lookup', failed: true, retriable: false }
]);
var pm = R.plan({ state: mixed, registry: registry, now: NOW });
ok('P4I-09 pending 重跑', strategyOf(pm, 'p1') === 'rerun');
ok('P4I-10 可重试失败重跑', strategyOf(pm, 'f1') === 'rerun', strategyOf(pm, 'f1'));
ok('P4I-11 不可重试失败阻断', strategyOf(pm, 'f2') === 'block', strategyOf(pm, 'f2'));

/* 5 apply 变更 */
var before = JSON.stringify(st.steps[0]);
var applied = R.apply({ state: st, registry: registry, now: NOW });
ok('P4I-12 apply 保持复用步骤结果', applied.applied.reuse.indexOf('a') >= 0 &&
  st.steps[0].status === 'ok' && st.steps[0].outputHash === 'h_a');
var b = st.steps.filter(function (s) { return s.id === 'b'; })[0];
ok('P4I-13 apply 重跑步骤重置', b.status === 'pending' && b.result === null && b.outputHash === null);
ok('P4I-14 apply 不预增 attempt（由执行器自增）', b.attempt === 1, b.attempt);
ok('P4I-15 apply 返回策略分组', applied.applied.rerun.indexOf('b') >= 0);

/* 6 复用步骤保持 attempt */
var reuseStep = st.steps.filter(function (s) { return s.id === 'a'; })[0];
ok('P4I-16 复用步骤 attempt 不变', reuseStep.attempt === 1);
ok('P4I-17 复用步骤状态仍 ok', reuseStep.status === 'ok');

console.log('');
console.log('RESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
