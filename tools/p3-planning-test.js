/**
 * ASTRUM P3 B2 · ResearchGoal 与 DAG Validator 测试
 * 用法：node tools/p3-planning-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/research-goal.js'));
require(path.join(ROOT, 'core/dag-validator.js'));

var G = global.AstroResearchGoal;
var V = global.AstroDagValidator;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

/* ---------- ResearchGoal ---------- */
var legacy = G.fromRoute({ query: 'M31 在哪', route: { mode: 'single', complexity: 1 } });
ok('P3-G1-01 简单单问不创建 goal', legacy.ok === false && legacy.reason === 'legacy');

var research = G.fromRoute({
  query: 'JWST 对系外行星大气的最新观测有什么争议？只看2020年以后，只用JWST',
  intent: 'cosmos',
  route: { mode: 'research', complexity: 3, targets: ['WASP-39b'] }
}, { projectId: 'prj_1' });
ok('P3-G1-02 research 生成 goal', research.ok === true && !!research.goal);
ok('P3-G1-03 目标非空且含 must',
  research.goal.objectives.length >= 1 && research.goal.objectives[0].priority === 'must');
ok('P3-G1-04 约束解析', research.goal.constraints.length >= 1,
  JSON.stringify(research.goal.constraints));
ok('P3-G1-05 projectId 继承', research.goal.projectId === 'prj_1');
ok('P3-G1-06 目标校验通过', G.validate(research.goal).ok === true);

var cmp = G.fromRoute({
  query: '比较木星与土星的质量',
  intents: ['compare'],
  route: { mode: 'compare', complexity: 2, targets: ['木星'] }
});
ok('P3-G2-01 对比对象不足标记 missingInfo', cmp.ok === true && cmp.goal.missingInfo.length >= 1);

var mismatch = G.fromRoute({
  query: 'JWST 最新结果',
  route: { mode: 'research', complexity: 2 }
}, { projectId: 'prj_2', title: 'x' });
ok('P3-G2-02 project 继承无冲突', mismatch.ok === true && mismatch.goal.projectId === 'prj_2');

var bad = G.validate({ goalId: '', title: '', objectives: [] });
ok('P3-G3-01 非法 goal 报错', bad.ok === false && bad.errors.length >= 3);

/* ---------- DAG ---------- */
function plan(steps, extra) {
  var p = { planId: 'pln_t', version: 1, steps: steps };
  if (extra) for (var k in extra) p[k] = extra[k];
  return p;
}
var good = plan([
  { id: 't1', tool: 'evidence.search', deps: [], args: { query: 'a' }, critical: false, parallel: true },
  { id: 't2', tool: 'evidence.search', deps: [], args: { query: 'b' }, critical: false, parallel: true },
  { id: 't3', tool: 'compose.brief', deps: ['t1', 't2'], critical: true, parallel: false }
]);
var rGood = V.validate(good, {});
ok('P3-D1-01 合法计划通过', rGood.ok === true, JSON.stringify(rGood.errors));
ok('P3-D1-02 拓扑分层', rGood.levels.length === 2 && rGood.levels[0].length === 2);
ok('P3-D1-03 并行副作用降级为警告', rGood.warnings.length >= 1);

var strict = V.validate(good, { strictParallel: true });
ok('P3-D2-01 严格模式拒绝并行写', strict.ok === false &&
  strict.errors.some(function (e) { return e.code === 'E_PARALLEL_CONFLICT'; }));

function codeOf(p, opts) {
  var r = V.validate(p, opts || {});
  return r.errors.map(function (e) { return e.code; });
}
ok('P3-D3-01 重复 id', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: [], critical: true },
  { id: 'a', tool: 'astro.calc', deps: [], critical: false }
])).indexOf('E_STEP_ID_DUP') >= 0);
ok('P3-D3-02 缺失依赖', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: ['x'], critical: true }
])).indexOf('E_DEP_MISSING') >= 0);
ok('P3-D3-03 自依赖', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: ['a'], critical: true }
])).indexOf('E_DEP_SELF') >= 0);
ok('P3-D3-04 环检测', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: ['c'], critical: true },
  { id: 'b', tool: 'astro.calc', deps: ['a'], critical: false },
  { id: 'c', tool: 'astro.calc', deps: ['b'], critical: false }
])).indexOf('E_DEP_CYCLE') >= 0);
ok('P3-D3-05 无 critical', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: [], critical: false }
])).indexOf('E_NO_CRITICAL') >= 0);
ok('P3-D3-06 无能力', codeOf(plan([
  { id: 'a', deps: [], critical: true }
])).indexOf('E_NO_CAPABILITY') >= 0);

var nine = [];
for (var i = 0; i < 9; i++) {
  nine.push({ id: 's' + i, tool: 'astro.calc', deps: i ? ['s' + (i - 1)] : [], critical: i === 0 });
}
ok('P3-D3-07 超过 8 步', codeOf(plan(nine)).indexOf('E_PLAN_TOO_LARGE') >= 0);

ok('P3-D3-08 compose 并行', codeOf(plan([
  { id: 'a', tool: 'compose.brief', deps: [], critical: true, parallel: true }
])).indexOf('E_COMPOSE_PARALLEL') >= 0);

ok('P3-D3-09 孤立节点', codeOf(plan([
  { id: 'a', tool: 'astro.calc', deps: [], critical: true },
  { id: 'b', tool: 'astro.calc', deps: [], critical: false }
])).indexOf('E_ORPHAN') >= 0);

var reg = {
  get: function (id) { return id === 'evidence.search' ? { id: id, idempotent: true } : null; }
};
ok('P3-D4-01 工具未注册', codeOf(plan([
  { id: 'a', tool: 'no.such', deps: [], critical: true }
]), { registry: reg }).indexOf('E_CAPABILITY_MISSING') >= 0);
ok('P3-D4-02 工具已注册通过', V.validate(plan([
  { id: 'a', tool: 'evidence.search', deps: [], critical: true }
]), { registry: reg }).ok === true);

ok('P3-D4-03 Skill 未发布', codeOf(plan([
  { id: 'a', kind: 'skill', skillId: 'skl_x', deps: [], critical: true }
]), { skillLookup: function () { return null; } }).indexOf('E_CAPABILITY_MISSING') >= 0);

ok('P3-D5-01 预算超限', codeOf(plan([
  { id: 'a', tool: 'evidence.search', deps: [], critical: true }
], { estimate: { searches: 5 } }), { budget: { limit: { searches: 2, ms: 1000, parallel: 1 } } })
  .indexOf('E_BUDGET_PLAN') >= 0);

ok('P3-D6-01 parallelConflicts 识别 compose', V.parallelConflicts([
  { id: 'a', tool: 'compose.brief' }, { id: 'b', tool: 'astro.calc' }
], null).length === 1);
ok('P3-D6-02 sideEffectOf', V.sideEffectOf({ tool: 'evidence.search' }) === 'S2' &&
  V.sideEffectOf({ tool: 'compose.brief' }) === 'S3' &&
  V.sideEffectOf({ tool: 'astro.calc' }) === 'S1');

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
