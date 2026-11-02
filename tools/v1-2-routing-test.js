/* ASTRUM · V1.2 统一入口场景测试
 * 覆盖：L1/L2/L3/L4、FITS 附件、论文/未知附件、对比模式、Web/云端、
 * 控制层初始化失败、取消、Router 单次、无重复执行。
 * 用法：node tools/v1-2-routing-test.js
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
  'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Router = global.AstroRouter;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Request = global.AstroRequest;
var Bridge = global.AstroControlBridge;
var AttEv = global.AstroAttachmentEvidence;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function equal(name, a, b) {
  var same = util.isDeepStrictEqual(a, b);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(a).slice(0, 120)));
}
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 160)); }
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
function fitsPack() {
  return AttEv.fromAttachments([{
    id: 'F1', name: 'fake.fits', size: 5760, sizeText: '5.6 KB', kind: 'fits', status: 'ready',
    fits: {
      header: { SIMPLE: true, BITPIX: -32, NAXIS: 2, NAXIS1: 4, NAXIS2: 3, OBJECT: 'M42' },
      hdus: [{ index: 0, type: 'primary', naxis1: 4, naxis2: 3, bitpix: -32,
        stats: { mean: 6.5, min: 1, max: 12, std: 3.45, count: 12 } }],
      warnings: [], file: { name: 'fake.fits', size: 5760, fileHash: 'h1' }
    }
  }]);
}

(async function main() {

  await runCase('R1', 'L1/L2/L3/L4 分流', async function () {
    var l1 = await Request.handle('你好', CTX, CFG);
    ok('R1.1 L1 legacy', l1.mode === 'legacy' && l1.answer);
    equal('R1.2 L1 sections 不变', l1.answer.sections, AC.buildAnswer('你好', CTX, CFG).sections);

    var rt = runtime();
    var l2 = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG, rt);
    ok('R1.3 L2 control/T-C', l2.mode === 'control' && l2.control.plan.template === 'T-C');

    var l3 = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG, runtime());
    ok('R1.4 L3 control', l3.mode === 'control' && l3.route.level === 'L3');

    var l4 = await Request.handle('M42 和 M31 研究最新进展', CTX, CFG, runtime());
    ok('R1.5 L4 control/T-E', l4.mode === 'control' && l4.control.plan.template === 'T-E');
  });

  await runCase('R2', 'FITS 附件覆盖', async function () {
    var pack = fitsPack();
    var r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG,
      Object.assign(runtime(), { attachmentsEvidence: pack.evidence }));
    ok('R2.1 附件进入 Control', r.mode === 'control');
    ok('R2.2 FITS 证据进入报告', r.answer.research && r.answer.research.observations.length === 1 &&
      r.answer.research.coverage.hasFits === true);
    ok('R2.3 观测 Evidence 可追溯', r.answer.research.evidence.some(function (e) {
      return e.sourceType === 'observation';
    }));
  });

  await runCase('R3', '场景边界（论文/未知/对比/Web）', async function () {
    var info = Request.classify('M42 怎么拍 为什么需要长曝光？', CTX, CFG);
    var base = { mode: 'single', sourceType: 'local', attachments: [] };
    ok('R3.1 无附件可接管', Bridge.canControl(info, base) === true);
    ok('R3.2 论文附件不接管', Bridge.canControl(info, Object.assign({}, base,
      { attachments: [{ kind: 'other', name: 'paper.pdf' }] })) === false);
    ok('R3.3 文本附件不接管', Bridge.canControl(info, Object.assign({}, base,
      { attachments: [{ kind: 'text', name: 'notes.txt' }] })) === false);
    ok('R3.4 显式对比模式不接管', Bridge.canControl(info, Object.assign({}, base, { mode: 'compare' })) === false);
    ok('R3.5 Web 来源不接管', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'web' })) === false);
    ok('R3.6 云端来源不接管', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'cloud' })) === false);
    var compare = Request.classify('M42 和 M31 有什么区别？', CTX, CFG);
    ok('R3.7 对比目标保留', compare.route.targets.length >= 2, JSON.stringify(compare.route.targets));
  });

  await runCase('R4', 'Router 单次 / 无重复执行', async function () {
    var orig = Router.route;
    var calls = 0;
    Router.route = function () { calls += 1; return orig.apply(Router, arguments); };
    var r;
    try { r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG, runtime()); }
    finally { Router.route = orig; }
    ok('R4.1 Router 仅执行一次', calls === 1, 'calls=' + calls);
    ok('R4.2 每步 attempt=1（无重复）', r.control.state.steps.filter(function (s) {
      return s.status === 'ok';
    }).every(function (s) { return s.attempt === 1; }), r.control.state.steps.map(function (s) {
      return s.id + ':' + s.attempt;
    }).join(','));
    ok('R4.3 只执行一条链路', r.mode === 'control' && !r.control.legacy);
  });

  await runCase('R5', '控制层初始化失败安全回退', async function () {
    var old = global.AstroControl;
    var r = null;
    try {
      global.AstroControl = null;
      r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG);
    } finally {
      global.AstroControl = old;
    }
    ok('R5.1 回退旧链路', r && r.mode === 'legacy' && !!r.answer);
    ok('R5.2 回退原因保留', r && r.fallbackReason === 'control_missing');
    equal('R5.3 回退答案与旧 buildAnswer 一致', r.answer.sections,
      AC.buildAnswer('M42 怎么拍 为什么需要长曝光？', CTX, CFG).sections);
  });

  await runCase('R6', '取消与空结果', async function () {
    var ac = new AbortController();
    ac.abort();
    var r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG,
      Object.assign(runtime(), { signal: ac.signal }));
    ok('R6.1 取消不伪装成功', r.cancelled === true && r.answer === null &&
      r.control.state.phase === 'ABORTED');

    var empty = await Request.handle('M42 研究最新进展', CTX, CFG, runtime());
    ok('R6.2 空结果可读回退', !!empty.answer);
    ok('R6.3 空结果不生成报告', !empty.answer.research);
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
