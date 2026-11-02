/* ASTRUM · V1.3 对比研究测试
 * 覆盖：双/多目标 Control、单位换算、参考系/历元、缺数据、证据不串扰。
 * 用法：node tools/v1-3-comparison-test.js
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
var Request = global.AstroRequest;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;

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
function claim(id, entity, value, unit, unc, frame, epoch, eid) {
  return Claims.makeClaim({
    id: id, text: entity + ' ' + value + ' ' + unit, type: 'quantitative', source: 'web',
    entities: [entity], numbers: [{ value: value, unit: unit }],
    support: [{ eid: eid, strength: 'weak', basis: 'numeric' }],
    uncertainty: unc == null ? null : { kind: 'measurement', value: unc, basis: 'test' },
    calc: {
      value: value, unit: unit || 'unit', epoch: epoch || 'J2000', frame: frame || 'icrs',
      source: 'test', method: 'test', inputs: {}, computedAt: '2026-10-31T00:00:00Z'
    },
    required: true
  });
}

(async function main() {

  await runCase('C1', '双目标对比', async function () {
    var r = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG,
      Object.assign(runtime(), { forceCompare: true }));
    ok('C1.1 T-D 计划', r.control.plan && r.control.plan.template === 'T-D');
    var kepler = r.control.plan.steps.filter(function (s) { return s.tool === 'kepler.ephemeris'; });
    ok('C1.2 两个目标并行取数', kepler.length === 2 && kepler.every(function (s) { return s.parallel === true; }),
      'n=' + kepler.length);
    ok('C1.3 对比答案两项', r.answer.compare && r.answer.compare.length === 2);
    ok('C1.4 目标名独立', r.answer.compare[0].name !== r.answer.compare[1].name);
  });

  await runCase('C2', '多目标对比', async function () {
    var r = await Request.handle('M42、M31 和 M4 有什么区别？', CTX, CFG,
      Object.assign(runtime(), { forceCompare: true }));
    ok('C2.1 计划含 3 个取数步骤', r.control.plan.steps.filter(function (s) {
      return s.tool === 'kepler.ephemeris';
    }).length === 3);
    ok('C2.2 对比答案 3 项', r.answer.compare && r.answer.compare.length === 3,
      r.answer.compare && r.answer.compare.length);
    var names = (r.answer.compare || []).map(function (x) { return x.name; });
    ok('C2.3 名称不重复', names.length === new Set(names).size);
  });

  await runCase('C3', '单位 / 参考系 / 历元', async function () {
    var e = Evidence.fromSourceItem({
      title: 'Distances', excerpt: 'a', url: 'https://example.org/d', host: 'example.org',
      sourceType: 'paper', doi: '10.1000/d', version: 'published', authors: ['A']
    }, { tool: 'paper.search', query: 'd', retrievedAt: '2026-01-01T00:00:00Z' });
    var c1 = claim('c1', 'M42', 1, 'pc', 0.1, 'icrs', 'J2000', e.evidenceId);
    var c2 = claim('c2', 'M42', 3.26, 'ly', 0.1, 'icrs', 'J2000', e.evidenceId);
    var r = Reducer.reduce({ evidence: [e], claims: [c1, c2] });
    ok('C3.1 pc/ly 换算后不冲突', r.conflicts.length === 0, JSON.stringify(r.conflicts));
    var c3 = claim('c3', 'M42', 3.26, 'ly', 0.1, 'galactic', 'J2000', e.evidenceId);
    var r2 = Reducer.reduce({ evidence: [e], claims: [c1, c3] });
    ok('C3.2 参考系差异 → insufficient', r2.conflicts.length === 0 && r2.differences.length === 1,
      JSON.stringify(r2.differences));
    var c4 = claim('c4', 'M42', 3.26, 'ly', 0.1, 'icrs', 'J2015', e.evidenceId);
    var r3 = Reducer.reduce({ evidence: [e], claims: [c1, c4] });
    ok('C3.3 历元差异 → insufficient', r3.conflicts.length === 0 && r3.differences.length === 1);
    ok('C3.4 量纲不兼容不比较', Reducer.convertValue(1, 'pc', 'K') === null);
  });

  await runCase('C4', '缺数据目标不虚构', async function () {
    var a = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: a, agentCore: AC, network: false });
    var orig = reg.get.bind(reg);
    var calls = 0;
    reg.get = function (id) {
      var spec = orig(id);
      if (!spec || id !== 'kepler.ephemeris') return spec;
      return Object.assign({}, spec, {
        run: function () {
          calls += 1;
          if (calls === 2) return { ok: false, reason: 'target_not_found', retriable: false };
          return spec.run.apply(spec, arguments);
        }
      });
    };
    var r = await Request.handle('M42 和 M31 有什么区别？', CTX, CFG,
      { adapter: a, registry: reg, forceCompare: true });
    var items = r.answer.compare || [];
    ok('C4.1 不生成双项目对比', items.length < 2, String(items.length));
    ok('C4.2 不伪造缺失目标', items.every(function (x) { return !!x.name; }));
    ok('C4.3 状态记录失败/阻塞', r.control.state.steps.some(function (s) {
      return s.status === 'failed' || s.status === 'blocked';
    }));
  });

  await runCase('C5', 'Claims 与 Report 对应', async function () {
    var e = Evidence.fromSourceItem({
      title: 'Two targets', excerpt: 'a', url: 'https://example.org/t', host: 'example.org',
      sourceType: 'paper', doi: '10.1000/t', version: 'published', authors: ['A']
    }, { tool: 'paper.search', query: 't', retrievedAt: '2026-01-01T00:00:00Z' });
    var c1 = claim('m42', 'M42', 10, 'ly', 1, 'icrs', 'J2000', e.evidenceId);
    var c2 = claim('m31', 'M31', 20, 'ly', 1, 'icrs', 'J2000', e.evidenceId);
    var judged = Claims.judgeAll([c1, c2], { evidence: [e] });
    var red = Reducer.reduce({ evidence: [e], claims: [c1, c2], verdicts: judged.verdicts });
    var rep = Report.build({ question: 'M42 vs M31', evidence: [e], claims: [c1, c2],
      verdicts: judged.verdicts, reducer: red, retrievedAt: '2026-01-01T00:00:00Z' });
    ok('C5.1 不同目标不误判冲突', red.conflicts.length === 0);
    ok('C5.2 每条结论有引用', rep.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
    ok('C5.3 报告主题保留目标', rep.subject.names.length >= 2, JSON.stringify(rep.subject.names));
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
