/* ASTRUM · V1.1 统一入口分流测试（纯 Node）
 *
 * 覆盖：L1/LEGACY / L2 单目标 / L3 多目标 / L4 研究 /
 * Router 只执行一次 / M42-M4 边界 / 旧 answer 兼容 / 取消 / 空结果不伪造。
 * 用法：node tools/v1-1-routing-test.js
 */
'use strict';

var path = require('path');
var util = require('util');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js',
  'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Router = global.AstroRouter;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Request = global.AstroRequest;
var Bridge = global.AstroControlBridge;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function equal(name, a, b) {
  var same = util.isDeepStrictEqual(a, b);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(a)));
}
function canonical(x) { return T.canonicalJSON(x); }

function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();

async function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.stack ? e.stack.split('\n')[0] : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

function offlineRuntime() {
  var adapter = Adapter.create({ agentCore: AC });
  var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: false });
  return { adapter: adapter, registry: registry };
}

(async function main() {

  await runCase('R1', 'L1/LEGACY 分流', async function () {
    var c = Request.classify('你好', CTX, CFG);
    ok('R1.1 L1 不进 Control', c.legacy === true && c.control === false);
    var r = await Request.handle('你好', CTX, CFG);
    ok('R1.2 走 legacy', r.mode === 'legacy' && !!r.answer);
    ok('R1.3 旧 sections 一致', canonical(r.answer.sections) === canonical(AC.buildAnswer('你好', CTX, CFG).sections));
  });

  await runCase('R2', 'L2 单目标进入 Control', async function () {
    var q = 'M42 怎么拍 为什么需要长曝光？';
    var c = Request.classify(q, CTX, CFG);
    ok('R2.1 L2 control', c.control === true && c.route.level === 'L2', c.route.level);
    var rt = offlineRuntime();
    var r = await Request.handle(q, CTX, CFG, rt);
    ok('R2.2 mode=control', r.mode === 'control' && !!r.control);
    ok('R2.3 T-C 计划生成', r.control.plan && r.control.plan.template === 'T-C');
    ok('R2.4 旧 sections 一致', canonical(r.answer.sections) === canonical(AC.buildAnswer(q, CTX, CFG).sections));
  });

  await runCase('R3', 'L3 多目标比较', async function () {
    var q = 'M42 和 M31 有什么区别？';
    var c = Request.classify(q, CTX, CFG);
    ok('R3.1 L3/compare', c.control === true && c.route.level === 'L3' && c.route.mode === 'compare',
      c.route.level + '/' + c.route.mode);
    var rt = offlineRuntime();
    var r = await Request.handle(q, CTX, CFG, rt);
    ok('R3.2 进入控制层并生成计划', r.control.plan && r.control.plan.template === 'T-A',
      r.control.plan && r.control.plan.template);
    ok('R3.3 answer 存在', !!r.answer);
  });

  await runCase('R4', 'L4 综合研究进入 T-E', async function () {
    var q = 'M42 和 M31 研究最新进展';
    var c = Request.classify(q, CTX, CFG);
    ok('R4.1 L4/research', c.control === true && c.route.level === 'L4' && c.route.mode === 'research',
      c.route.level + '/' + c.route.mode);
    var rt = offlineRuntime();
    var r = await Request.handle(q, CTX, CFG, rt);
    ok('R4.2 T-E 计划', r.control.plan && r.control.plan.template === 'T-E');
  });

  await runCase('R5', 'Router 只执行一次 / M42-M4', async function () {
    var orig = Router.route;
    var calls = 0;
    Router.route = function () { calls += 1; return orig.apply(Router, arguments); };
    var r;
    try { r = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG, offlineRuntime()); }
    finally { Router.route = orig; }
    ok('R5.1 Router 仅一次', calls === 1, 'calls=' + calls);
    var c = Request.classify('M42 是什么', CTX, CFG);
    ok('R5.2 M42 不命中 M4', c.route.targets.indexOf('M4 球状星团') < 0 &&
      c.route.targets.indexOf('M4') < 0, JSON.stringify(c.route.targets));
  });

  await runCase('R6', '取消与空结果不伪造', async function () {
    var ac = new AbortController();
    ac.abort();
    var r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG,
      Object.assign(offlineRuntime(), { signal: ac.signal }));
    ok('R6.1 取消返回 cancelled', r.cancelled === true && r.answer === null);
    ok('R6.2 阶段 ABORTED', r.control && r.control.state.phase === 'ABORTED', r.control && r.control.state.phase);

    var rt = offlineRuntime();
    var empty = await Request.handle('M42 研究最新进展', CTX, CFG, rt);
    ok('R6.3 空结果仍有可读回退', !!empty.answer);
    ok('R6.4 空结果不注入 research', !empty.answer.research && !empty.research);
  });

  await runCase('R7', 'Bridge 直连与 legacy 兼容', async function () {
    var b = await Bridge.run('你好', CTX, CFG);
    ok('R7.1 bridge legacy 返回', b.mode === 'legacy');
    var b2 = await Bridge.run('M42 怎么拍 为什么需要长曝光？', CTX, CFG, offlineRuntime());
    ok('R7.2 bridge control 返回', b2.mode === 'control' && !!b2.control);
    var resumeStore = global.AstroTaskStore.create({});
    equal('R7.3 bridge 暴露 resume', typeof Bridge.resume, 'function');
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' + cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})();
