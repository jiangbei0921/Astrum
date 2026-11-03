/* ASTRUM · V1.9 研究目标与多轮上下文回归
 *
 * 真实 Provider 验收中发现：
 *   - M13 的 KB en 是 "Hercules Cluster"，OpenAlex 会召回武仙座星系团；
 *   - Control 路径未做 MEMORY 指代消解，追问检索式退化成 "age"。
 *
 * 本测试锁定两处修复，避免以后回归。
 * 用法：node tools/v1-9-research-target-test.js
 */
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
global.localStorage = { _d: {}, getItem: function (k) { return this._d[k] != null ? this._d[k] : null; }, setItem: function (k, v) { this._d[k] = String(v); }, removeItem: function (k) { delete this._d[k]; } };
global.sessionStorage = global.localStorage;
[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/task.js', 'core/schema.js', 'core/agents.js',
  'core/sources.js', 'core/research.js', 'core/router.js', 'core/request.js',
  'core/planner.js', 'core/registry.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });
var AC = global.AgentCore, S = global.Sources, R = global.AstroRequest, Pl = global.AstroPlanner;
var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [], pass = 0;
function ok(n, c, x) { results.push({ name: n, pass: !!c, extra: x == null ? '' : String(x) }); if (c) pass++; }

function planOf(q) {
  var c = R.classify(q, CTX, AC.defaultConfig());
  var p = Pl.plan({ query: q, ctx: CTX, cfg: AC.defaultConfig(), route: c.route, intent: c.intent, targets: c.targets });
  return { c: c, p: p };
}

ok('E1 M13 中文名映射到球状星团',
  /globular/i.test(S.enQueryFor('武仙座球状星团')) && !/^Hercules Cluster$/i.test(S.enQueryFor('武仙座球状星团')),
  S.enQueryFor('武仙座球状星团'));
ok('E2 M13 编号映射到球状星团', /globular/i.test(S.enQueryFor('M13')), S.enQueryFor('M13'));
ok('E3 M13 小写编号映射', /globular/i.test(S.enQueryFor('m13')), S.enQueryFor('m13'));
ok('E4 M31 仍映射到 Andromeda Galaxy', /andromeda/i.test(S.enQueryFor('M31')), S.enQueryFor('M31'));
ok('E5 M45 映射到 Pleiades', /pleiades/i.test(S.enQueryFor('M45')), S.enQueryFor('M45'));
ok('E6 行星映射不变', S.enQueryFor('木星') === 'Jupiter', S.enQueryFor('木星'));

var m13 = planOf('M13 的年龄和金属丰度测量在不同论文中是否一致？');
var paper1 = (m13.p.steps || []).filter(function (s) { return s.tool === 'paper.search'; })[0];
ok('E7 M13 研究进入 T-E', m13.p.template === 'T-E', m13.p.template);
ok('E8 M13 检索式带球状星团限定', paper1 && /Hercules Globular Cluster/i.test(paper1.args.query), paper1 && paper1.args.query);
ok('E9 M13 检索式带 age 而非泛 measurement', paper1 && /\bage\b/i.test(paper1.args.query) && !/\bmeasurement\b/i.test(paper1.args.query),
  paper1 && paper1.args.query);

AC.setMemory([{ q: 'M13 的年龄和金属丰度测量在不同论文中是否一致？', a: '武仙座球状星团，年龄约 116 亿年', target: 'M13', at: Date.now() }]);
var follow = planOf('上一条回答中那个星团的年龄数据来自哪篇论文？测量不确定性是多少？');
ok('E10 多轮指代解析到 M13', follow.c.route.targets.indexOf('武仙座球状星团') >= 0, follow.c.route.targets.join(','));
var paper2 = (follow.p.steps || []).filter(function (s) { return s.tool === 'paper.search'; })[0];
ok('E11 多轮检索式包含目标', paper2 && /Hercules Globular Cluster/i.test(paper2.args.query), paper2 && paper2.args.query);
ok('E12 多轮检索式不再退化为裸 age', paper2 && !/^age$/i.test(paper2.args.query.trim()), paper2 && paper2.args.query);
AC.clearMemory();

var noMem = planOf('上一条回答中那个星团有多远？');
ok('E13 无 MEMORY 时不冒充指代', noMem.c.route.targets.length === 0 || noMem.c.route.mode !== 'research',
  JSON.stringify(noMem.c.route.targets));

var failed = results.filter(function (r) { return !r.pass; });
results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra)); });
console.log('\nRESULT ' + pass + '/' + results.length);
process.exitCode = failed.length ? 1 : 0;
