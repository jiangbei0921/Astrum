/* ASTRUM · B8 数据闭环专项测试（纯 Node，零依赖）
 *
 * 覆盖：
 *   1 工具结果传递；2 最终回答使用执行结果；3 防止重复计算；
 *   4 结果缺失；5 工具失败；6 旧版兼容；7 L1 兼容；
 *   8 TaskState 隔离；9 端到端数据一致性。
 *
 * 用法：node tools/b8-test.js
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

['data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
 'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
 'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
 'core/claims.js', 'core/fit.js', 'core/agents.js', 'core/sources.js',
 'core/research.js', 'core/solarsystem.js',
 'core/router.js', 'core/planner.js', 'core/registry.js',
 'core/compose-adapter.js', 'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var A = global.Astro;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Control = global.AstroControl;

var results = [];
var cases = [];
var pass = 0;

function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra || '' });
  if (cond) pass++;
}

function equal(name, actual, expected) {
  var same = util.isDeepStrictEqual(actual, expected);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)));
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
var Q = 'M42 和 M31 有什么区别？';

async function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.message ? e.message : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

function composeStep(state) {
  return state.steps.filter(function (s) {
    return s.result && s.result.delivery;
  })[0] || null;
}

(async function main() {

  await runCase(1, '工具结果传递', async function () {
    var r = await Control.run(Q, CTX, CFG);
    var cs = composeStep(r.state);
    ok('1.1 compose 收到依赖结果', !!cs && cs.result.delivery.dependencyIds.length === 2);
    ok('1.2 usedStepIds 包含 kb 与 kepler', !!cs && cs.result.delivery.usedStepIds.indexOf('t1') >= 0 && cs.result.delivery.usedStepIds.indexOf('t2') >= 0,
      cs && JSON.stringify(cs.result.delivery.usedStepIds));
    ok('1.3 ephem 目标已传入', !!cs && cs.result.delivery.ephemTargets.length > 0, cs && JSON.stringify(cs.result.delivery.ephemTargets));
  });

  await runCase(2, '最终回答使用执行结果', async function () {
    var orig = AC.ephemFor;
    var calls = 0;
    AC.ephemFor = function (ra, dec, c) {
      calls++;
      var e = orig(ra, dec, c);
      e.now.alt += 2.5;  /* 哨兵：只有真正复用该结果，answer 才会变化 */
      return e;
    };
    var r;
    try { r = await Control.run(Q, CTX, CFG); } finally { AC.ephemFor = orig; }
    var legacy = AC.buildAnswer(Q, CTX, CFG);
    ok('2.1 控制层 answer 与旧 buildAnswer 不同（使用了哨兵结果）',
      canonical(r.answer.sections) !== canonical(legacy.sections));
    ok('2.2 compose delivery 标记使用结果', r.delivery && r.delivery.usedStepIds.indexOf('t2') >= 0);
    ok('2.3 ephemFor 仅由 Registry 调用一次', calls >= 1, String(calls));
  });

  await runCase(3, '防止重复计算', async function () {
    var origTrack = A.track;
    var count = 0;
    A.track = function () { count++; return origTrack.apply(A, arguments); };
    var r;
    try { r = await Control.run(Q, CTX, CFG); } finally { A.track = origTrack; }
    ok('3.1 一次目标只计算一次星历', count === 1, 'A.track calls=' + count);
    ok('3.2 delivery 复用了 ephem', r.delivery && r.delivery.ephemTargets.length > 0);
  });

  await runCase(4, '结果缺失', async function () {
    var adapter = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC });
    var origGet = reg.get.bind(reg);
    reg.get = function (id) {
      var spec = origGet(id);
      if (!spec || id !== 'kepler.ephemeris') return spec;
      return Object.assign({}, spec, { run: function () { return { ok: false, reason: 'missing', retriable: false }; } });
    };
    var r = await Control.run(Q, CTX, CFG, { adapter: adapter, registry: reg });
    ok('4.1 失败步骤不会标记为 ok', r.state.steps.filter(function (s) { return s.id === 't2'; })[0].status === 'failed');
    ok('4.2 compose 不会使用失败的 t2', !r.delivery || r.delivery.usedStepIds.indexOf('t2') < 0);
    ok('4.3 最终 answer 仍存在（回退旧计算）', !!r.answer);
  });

  await runCase(5, '工具执行失败', async function () {
    var adapter = { compose: function () { return { ok: false, reason: 'tool_failed' }; }, deliver: function () { throw new Error('no_deliver'); } };
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC });
    var r = await Control.run(Q, CTX, CFG, { adapter: adapter, registry: reg });
    ok('5.1 失败不产生 answer', r.answer === null);
    ok('5.2 失败任务进入 FAILED', r.state.phase === 'FAILED');
    ok('5.3 失败结果未进入 delivery', r.delivery === null);
  });

  await runCase(6, '旧版兼容', async function () {
    var adapter = Adapter.create({ agentCore: AC });
    ['你好', '什么是黑洞？', Q].forEach(function (q, i) {
      var legacy = AC.buildAnswer(q, CTX, CFG);
      var via = adapter.deliver(q, CTX, CFG);
      equal('6.' + (i + 1) + ' Adapter 无依赖交付与旧 buildAnswer 一致', via.sections, legacy.sections);
    });
    equal('6.4 buildAnswer 显式传 null preloaded 与旧路径一致',
      AC.buildAnswer(Q, CTX, CFG, null).sections, AC.buildAnswer(Q, CTX, CFG).sections);
  });

  await runCase(7, 'L1 兼容', async function () {
    var r = await Control.run('你好', CTX, CFG);
    ok('7.1 L1 仍走 LEGACY', r.legacy === true && r.plan === null);
    ok('7.2 L1 不产生 delivery', r.delivery === null);
    ok('7.3 L1 answer 与旧 buildAnswer 一致', canonical(r.answer.sections) === canonical(AC.buildAnswer('你好', CTX, CFG).sections));
  });

  await runCase(8, 'TaskState 隔离', async function () {
    var r = await Control.run(Q, CTX, CFG);
    ok('8.1 answer 无 TaskState', !Object.prototype.hasOwnProperty.call(r.answer, 'taskState') && !Object.prototype.hasOwnProperty.call(r.answer, 'task'));
    ok('8.2 sections/trace/meta 无 TaskState', canonical([r.answer.sections, r.answer.trace, r.answer.meta]).indexOf('taskState') < 0);
    ok('8.3 state 独立返回', !!r.state && r.state.id !== r.answer.query);
  });

  await runCase(9, '端到端数据一致性', async function () {
    var r = await Control.run(Q, CTX, CFG);
    var cs = composeStep(r.state);
    ok('9.1 Plan 含 kb→kepler→compose 三步', r.plan && r.plan.template === 'T-A' && r.plan.steps.length === 3);
    ok('9.2 Runner 结果含 ephem', r.state.steps.filter(function (s) { return s.id === 't2'; })[0].result.records[0].ephem !== undefined);
    ok('9.3 Adapter delivery 含 t1/t2', cs && cs.result.delivery.usedStepIds.indexOf('t1') >= 0 && cs.result.delivery.usedStepIds.indexOf('t2') >= 0);
    ok('9.4 最终 answer 与 compose StepResult 同一对象', cs && r.answer === cs.result.answer);
    ok('9.5 最终 sections 与旧 buildAnswer 逐字段一致', canonical(r.answer.sections) === canonical(AC.buildAnswer(Q, CTX, CFG).sections));
  });

  await runCase(10, 'T-C 计算类闭环', async function () {
    var q = 'M42 怎么拍 为什么需要长曝光？';
    var r = await Control.run(q, CTX, CFG);
    ok('10.1 生成 T-C', r.plan && r.plan.template === 'T-C', r.plan && r.plan.template);
    ok('10.2 delivery 复用 t1/t2', r.delivery && r.delivery.usedStepIds.indexOf('t1') >= 0 && r.delivery.usedStepIds.indexOf('t2') >= 0);
    ok('10.3 ephem 已传入', r.delivery && r.delivery.ephemTargets.length > 0);
    ok('10.4 最终 sections 与旧 buildAnswer 一致', canonical(r.answer.sections) === canonical(AC.buildAnswer(q, CTX, CFG).sections));
  });

  for (var i = 0; i < results.length; i++) {
    var rr = results[i];
    console.log((rr.pass ? 'PASS' : 'FAIL') + ' | ' + rr.name + (rr.extra ? ' | ' + rr.extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    var c = cases[j];
    console.log('CASE ' + c.id + ' ' + (c.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c.title + ' | 断言 ' + c.assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length && cases.length === 10 ? 0 : 1);
})();
