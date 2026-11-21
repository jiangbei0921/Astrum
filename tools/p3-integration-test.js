/**
 * ASTRUM P3 B7 · 模块接入测试
 * 用法：node tools/p3-integration-test.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

['data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
 'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
 'core/astro.js', 'core/runtime.js', 'core/task.js',
 'core/research-goal.js', 'core/dag-validator.js', 'core/capability-resolver.js',
 'core/schema.js', 'core/claims.js', 'core/fit.js', 'core/agents.js',
 'core/sources.js', 'core/research.js', 'core/solarsystem.js', 'core/simbad.js',
 'core/router.js', 'core/planner.js', 'core/registry.js',
 'core/compose-adapter.js', 'core/orchestrator.js', 'core/control.js',
 'core/report.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var Control = global.AstroControl;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

var CTX = { lat: 39.9, lon: 116.4, city: '北京', y: 2026, mo: 11, d: 21, h: 21, mi: 0, tz: 8 };
var CFG = {};
var Q = 'JWST 对系外行星大气的最新研究有什么争议？';

/* I1 开关：默认无 goal，显式启用后创建 goal */
var off = Control.prepare(Q, CTX, CFG, {});
ok('P3-I1-01 未启用时不创建 goal', !off.state.goal);
var on = Control.prepare(Q, CTX, CFG, { goalEnabled: true });
var isResearch = on.route && !on.route.legacy;
ok('P3-I1-02 研究类问题创建 goal', !isResearch || (!!on.state.goal && !!on.state.goal.goalId),
  isResearch ? JSON.stringify(on.state.goal) : 'legacy');
ok('P3-I1-03 goal 通过 TaskState 校验', (function () {
  try { global.AstroTask.validate(on.state); return true; } catch (e) { return false; }
})());

/* I2 index.html 按依赖顺序加载新模块 */
var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
var iTask = html.indexOf('core/task.js');
var iGoal = html.indexOf('core/research-goal.js');
var iDag = html.indexOf('core/dag-validator.js');
var iRes = html.indexOf('core/capability-resolver.js');
var iOrch = html.indexOf('core/orchestrator.js');
ok('P3-I2-01 新模块已加载', iGoal > 0 && iDag > 0 && iRes > 0);
ok('P3-I2-02 位于 task 之后、orchestrator 之前',
  iGoal > iTask && iDag > iTask && iRes > iTask && iGoal < iOrch && iDag < iOrch && iRes < iOrch);

/* I3 全局导出存在 */
ok('P3-I3-01 ResearchGoal 导出', !!global.AstroResearchGoal && typeof global.AstroResearchGoal.fromRoute === 'function');
ok('P3-I3-02 DagValidator 导出', !!global.AstroDagValidator && typeof global.AstroDagValidator.validate === 'function');
ok('P3-I3-03 CapabilityResolver 导出', !!global.AstroCapabilityResolver && typeof global.AstroCapabilityResolver.resolve === 'function');
ok('P3-I3-04 Scheduler 使用并行过滤', typeof global.AstroOrchestrator.Scheduler.hasBatchConflict === 'function');

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
