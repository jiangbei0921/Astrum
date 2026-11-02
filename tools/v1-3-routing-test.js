/* ASTRUM · V1.3 全场景统一入口测试
 * 覆盖：Web/云端复杂研究、显式对比 Control、Router 单次、L1 兼容、取消/回退。
 * 用法：node tools/v1-3-routing-test.js
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

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/pdf-text.js', 'core/paper-fulltext.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var Router = global.AstroRouter;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Request = global.AstroRequest;
var Bridge = global.AstroControlBridge;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}
function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0, tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();
function runtime() {
  var a = Adapter.create({ agentCore: AC });
  return { adapter: a, registry: Registry.createDefault({ adapter: a, agentCore: AC, network: false }) };
}

(async function main() {

  await runCase('R1', 'Web/云端复杂研究进入 Control', async function () {
    var info = Request.classify('M42 研究最新进展', CTX, CFG);
    ok('R1.1 研究意图', info.control === true && info.route.mode === 'research');
    var base = { mode: 'single', attachments: [] };
    ok('R1.2 本地研究可接管', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'local' })) === true);
    ok('R1.3 Web 研究可接管', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'web' })) === true);
    ok('R1.4 云端研究可接管', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'cloud' })) === true);
    var simple = Request.classify('M42 怎么拍 为什么需要长曝光？', CTX, CFG);
    ok('R1.5 Web L2 非研究仍走旧链路', Bridge.canControl(simple, Object.assign({}, base, { sourceType: 'web' })) === false);
    ok('R1.6 L1 永不接管', Bridge.canControl(Request.classify('你好', CTX, CFG),
      Object.assign({}, base, { sourceType: 'local' })) === false);
  });

  await runCase('R2', '显式对比模式进入 Control', async function () {
    var q = 'M42 和 M31 有什么区别？';
    var info = Request.classify(q, CTX, CFG);
    var scene = { mode: 'compare', sourceType: 'local', attachments: [], forceCompare: true };
    ok('R2.1 本地显式对比可接管', Bridge.canControl(info, scene) === true);
    ok('R2.2 Web 对比不接管', Bridge.canControl(info, Object.assign({}, scene, { sourceType: 'web' })) === false);
    var r = await Request.handle(q, CTX, CFG, Object.assign(runtime(), { forceCompare: true }));
    ok('R2.3 进入 Control 且 T-D', r.mode === 'control' && r.control.plan.template === 'T-D');
    ok('R2.4 对比答案含多目标', r.answer && Array.isArray(r.answer.compare) && r.answer.compare.length >= 2,
      r.answer && JSON.stringify(r.answer.compare && r.answer.compare.map(function (x) { return x.name; })));
    ok('R2.5 目标不串扰', r.answer.compare.every(function (x, i) {
      return x.name && x.name !== r.answer.compare[(i + 1) % r.answer.compare.length].name;
    }));
  });

  await runCase('R3', 'Router 单次 / routeData', async function () {
    var orig = Router.route, calls = 0;
    Router.route = function () { calls += 1; return orig.apply(Router, arguments); };
    var r;
    try { r = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG, Object.assign(runtime(), { forceCompare: true })); }
    finally { Router.route = orig; }
    ok('R3.1 Router 仅一次', calls === 1, 'calls=' + calls);
    ok('R3.2 成功步骤 attempt=1', r.control.state.steps.filter(function (s) { return s.status === 'ok'; })
      .every(function (s) { return s.attempt === 1; }));
    ok('R3.3 routeData 目标保留', r.route.targets.length >= 2);
  });

  await runCase('R4', 'L1 / 取消 / 回退', async function () {
    var l1 = await Request.handle('你好', CTX, CFG);
    ok('R4.1 L1 旧链路', l1.mode === 'legacy' && !!l1.answer);
    var ac = new AbortController(); ac.abort();
    var c = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG,
      Object.assign(runtime(), { forceCompare: true, signal: ac.signal }));
    ok('R4.2 取消不伪装成功', c.cancelled === true && c.answer === null);
    var old = global.AstroControl;
    var f;
    try { global.AstroControl = null; f = await Request.handle('M42 研究最新进展', CTX, CFG); }
    finally { global.AstroControl = old; }
    ok('R4.3 控制层缺失安全回退', f.mode === 'legacy' && !!f.answer && f.fallbackReason === 'control_missing');
  });

  await runCase('R5', '对比缺数据不虚构', async function () {
    var a = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: a, agentCore: AC, network: false });
    var orig = reg.get.bind(reg);
    var keplerCalls = 0;
    reg.get = function (id) {
      var spec = orig(id);
      if (!spec || id !== 'kepler.ephemeris') return spec;
      return Object.assign({}, spec, {
        run: function () {
          keplerCalls += 1;
          if (keplerCalls === 2) return { ok: false, reason: 'target_not_found', retriable: false };
          return spec.run.apply(spec, arguments);
        }
      });
    };
    var r = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG,
      { adapter: a, registry: reg, forceCompare: true });
    ok('R5.1 仍有可读答案', !!r.answer);
    ok('R5.2 缺目标不生成虚构对比项', !r.answer.compare || r.answer.compare.length < 2,
      r.answer && r.answer.compare && r.answer.compare.length);
    ok('R5.3 状态如实', r.control.state.steps.some(function (s) { return s.status === 'failed' || s.status === 'blocked'; }));
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
