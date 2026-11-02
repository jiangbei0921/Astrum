/* ASTRUM · V1.2 对比与场景覆盖测试
 * 覆盖：canControl 场景矩阵、对比目标保留、单位一致、跨目标不混淆、缺失数据。
 * 用法：node tools/v1-2-comparison-test.js
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
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js',
  'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var Request = global.AstroRequest;
var Bridge = global.AstroControlBridge;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
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

function ev(title, url, doi) {
  return Evidence.fromSourceItem({
    title: title, excerpt: 'Abstract', url: url, host: url.split('/')[2],
    sourceType: 'paper', doi: doi, version: 'published', authors: ['A']
  }, { tool: 'paper.search', query: title, retrievedAt: '2026-10-31T00:00:00Z' });
}
function claim(id, entity, value, unit, unc, frame, eid, support) {
  return Claims.makeClaim({
    id: id, text: entity + ' ' + value + ' ' + unit, type: 'quantitative', source: 'web',
    entities: [entity], numbers: [{ value: value, unit: unit }],
    support: support === false ? [] : [{ eid: eid, strength: 'weak', basis: 'numeric' }],
    uncertainty: unc == null ? null : { kind: 'measurement', value: unc, basis: 'test' },
    calc: {
      value: value, unit: unit || 'unit', epoch: 'J2000', frame: frame || 'icrs',
      source: 'test', method: 'test', inputs: {}, computedAt: '2026-10-31T00:00:00Z'
    },
    required: true
  });
}

(async function main() {

  await runCase('C1', '场景覆盖矩阵', async function () {
    var info = Request.classify('M42 怎么拍 为什么需要长曝光？', CTX, CFG);
    var base = { mode: 'single', sourceType: 'local', attachments: [] };
    ok('C1.1 本地 L2 可取数', Bridge.canControl(info, base) === true);
    ok('C1.2 对比模式仍走旧链路', Bridge.canControl(info, Object.assign({}, base, { mode: 'compare' })) === false);
    ok('C1.3 Web/云端仍走旧链路', Bridge.canControl(info, Object.assign({}, base, { sourceType: 'web' })) === false);
    var fits = { id: 'F1', kind: 'fits', fits: { hdus: [{ index: 0 }] }, name: 'a.fits' };
    ok('C1.4 FITS 附件可接管', Bridge.canControl(info, Object.assign({}, base, { attachments: [fits] })) === true);
    var paper = { id: 'P1', kind: 'other', name: 'a.pdf' };
    ok('C1.5 论文/未知附件仍走旧链路', Bridge.canControl(info, Object.assign({}, base, { attachments: [paper] })) === false);
    ok('C1.6 L1 永不接管', Bridge.canControl(Request.classify('你好', CTX, CFG), base) === false);
  });

  await runCase('C2', '对比目标保留', async function () {
    var c = Request.classify('M42 和 M31 有什么区别？', CTX, CFG);
    ok('C2.1 compare/L3', c.route.mode === 'compare' && c.route.level === 'L3');
    ok('C2.2 两个目标不丢失', c.route.targets.length >= 2, JSON.stringify(c.route.targets));
    ok('C2.3 目标不混淆（M42/M4 边界）', c.route.targets.some(function (n) {
      return n.indexOf('猎户') >= 0 || n.indexOf('M42') >= 0 || n.indexOf('M 42') >= 0;
    }) && c.route.targets.some(function (n) {
      return n.indexOf('仙女') >= 0 || n.indexOf('M31') >= 0 || n.indexOf('M 31') >= 0;
    }), JSON.stringify(c.route.targets));
  });

  await runCase('C3', '单位一致与冲突隔离', async function () {
    var e = ev('Distance paper', 'https://example.org/d', '10.1000/d');
    var c1 = claim('m42-pc', 'M42', 1, 'pc', 0.1, 'icrs', e.evidenceId);
    var c2 = claim('m42-ly', 'M42', 3.26, 'ly', 0.1, 'icrs', e.evidenceId);
    var r = Reducer.reduce({ evidence: [e], claims: [c1, c2] });
    ok('C3.1 pc/ly 换算后不误判冲突', r.conflicts.length === 0, JSON.stringify(r.conflicts));
    ok('C3.2 保持同量纲分组', r.conflicts.length === 0 && r.differences.length === 0);

    var c3 = claim('m31-pc', 'M31', 100, 'pc', 1, 'icrs', e.evidenceId);
    var r2 = Reducer.reduce({ evidence: [e], claims: [c1, c3] });
    ok('C3.3 不同天体不互相比较', r2.conflicts.length === 0 && r2.differences.length === 0);
  });

  await runCase('C4', '数据缺失与报告缺口', async function () {
    var e = ev('Only M42 paper', 'https://example.org/m42', '10.1000/m42');
    var c = claim('missing', 'M31', 0, 'pc', null, 'icrs', e.evidenceId, false);
    var judged = Claims.judgeAll([c], { evidence: [e] });
    var reduced = Reducer.reduce({ evidence: [e], claims: [c], verdicts: judged.verdicts });
    var report = Report.build({
      question: 'M42 与 M31 对比', evidence: [e], claims: [c],
      verdicts: judged.verdicts, reducer: reduced, retrievedAt: '2026-10-31T00:00:00Z'
    });
    ok('C4.1 无支持 Claim 进入 hypothesis/unknown', reduced.hypotheses.length >= 1 && reduced.unknowns.length >= 1);
    ok('C4.2 报告明确证据不足', report.gaps.some(function (g) { return g.indexOf('证据不足') >= 0; }) ||
      report.limitations.length > 0, JSON.stringify(report.gaps));
    ok('C4.3 不生成虚构结论值', report.conclusions.every(function (x) { return x.evidenceRefs.length > 0; }));
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
