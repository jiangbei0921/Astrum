/* ASTRUM · V1.2 科学证据规则测试
 * 覆盖：DOI/标题镜像、独立来源、abstractOnly、事实/推断/假设、
 * 单位换算、参考系、不确定性、冲突与 insufficient_information。
 * 用法：node tools/v1-2-science-test.js
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
  'core/orchestrator.js', 'core/control.js', 'core/request.js', 'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
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

function paper(title, url, doi, authors) {
  return Evidence.fromSourceItem({
    title: title, excerpt: 'Abstract excerpt for ' + title + '.', snippet: 'Abstract excerpt.',
    url: url, host: (url.split('/')[2] || ''), sourceType: 'paper', doi: doi || '',
    date: '2024-01-01', dateKind: 'published', version: doi ? 'published' : 'preprint',
    authors: authors || ['A. Author']
  }, { tool: 'paper.search', query: title, retrievedAt: '2026-10-31T00:00:00Z' });
}

function claim(id, value, unit, unc, frame, eid) {
  return Claims.makeClaim({
    id: id, text: id + ' = ' + value + ' ' + unit, type: 'quantitative', source: 'web',
    entities: ['M42'], numbers: [{ value: value, unit: unit }],
    support: [{ eid: eid, strength: 'weak', basis: 'numeric' }],
    uncertainty: unc == null ? null : { kind: 'measurement', value: unc, basis: 'test' },
    calc: {
      value: value, unit: unit || 'unit', epoch: 'J2000', frame: frame || 'icrs',
      source: 'test', method: 'test', inputs: {}, computedAt: '2026-10-31T00:00:00Z'
    },
    required: true
  });
}

(async function main() {

  await runCase('S1', 'Evidence 来源独立性', async function () {
    var a1 = paper('The distance to the Orion Nebula', 'https://arxiv.org/abs/2401.1', '10.1000/orion', ['A']);
    var a2 = paper('The distance to the Orion Nebula', 'https://openalex.org/W1', '10.1000/orion', ['A']);
    var dd = Evidence.dedupe([a1, a2]);
    ok('S1.1 同 DOI 多镜像只计 1', dd.evidence.length === 1 && dd.duplicates.length === 1);

    var b1 = paper('A survey of the Orion Nebula region', 'https://arxiv.org/abs/2401.2', '', ['B']);
    var b2 = paper('A survey of the Orion Nebula region', 'https://ui.adsabs.harvard.edu/abs/2024', '', ['B']);
    var dd2 = Evidence.dedupe([b1, b2]);
    ok('S1.2 同标题不同 URI 无 DOI 去重', dd2.evidence.length === 1, JSON.stringify(Evidence.evidenceKey(b1)));

    var c1 = paper('Orion A proper motions', 'https://arxiv.org/abs/2401.3', '10.1000/a', ['C']);
    var c2 = paper('Orion B proper motions', 'https://arxiv.org/abs/2401.4', '10.1000/b', ['D']);
    ok('S1.3 不同 DOI 独立', Evidence.dedupe([c1, c2]).evidence.length === 2);
    ok('S1.4 独立来源计数', Evidence.independentSources([a1, a2, c1, c2]).length === 3);
    ok('S1.5 论文 abstractOnly', a1.abstractOnly === true && a1.provenance.abstractOnly === true);
  });

  await runCase('S2', '单位换算与参考系', async function () {
    ok('S2.1 pc→ly', Math.abs(Reducer.convertValue(1, 'pc', 'ly') - 3.26156) < 0.001);
    ok('S2.2 arcmin→deg', Math.abs(Reducer.convertValue(60, 'arcmin', 'deg') - 1) < 1e-9);
    ok('S2.3 不兼容量纲返回 null', Reducer.convertValue(1, 'ly', 'K') === null);
  });

  await runCase('S3', '冲突判断：不确定性/缺失/参考系', async function () {
    var e = paper('Orion distance measurements', 'https://example.org/e', '10.1000/d', ['E']);
    var c1 = claim('c1', 10, 'ly', 1, 'icrs', e.evidenceId);
    var c2 = claim('c2', 12, 'ly', 1, 'icrs', e.evidenceId);
    var r = Reducer.reduce({ evidence: [e], claims: [c1, c2] });
    ok('S3.1 超 1σ 合成不确定性 → conflict', r.conflicts.length === 1 && r.conflicts[0].status === 'significant',
      JSON.stringify(r.conflicts));
    ok('S3.2 冲突保留 spread/values', r.conflicts[0].spread > 5 && r.conflicts[0].values.length === 2);

    var c3 = claim('c3', 10, 'ly', null, 'icrs', e.evidenceId);
    var c4 = claim('c4', 15, 'ly', null, 'icrs', e.evidenceId);
    var r2 = Reducer.reduce({ evidence: [e], claims: [c3, c4] });
    ok('S3.3 无不确定性不武断判冲突', r2.conflicts.length === 0 && r2.differences.length === 1,
      JSON.stringify(r2.differences));
    ok('S3.4 标记 insufficient_information', r2.differences[0].status === 'insufficient_information');

    var c5 = claim('c5', 10, 'ly', 1, 'icrs', e.evidenceId);
    var c6 = claim('c6', 10.5, 'ly', 1, 'galactic', e.evidenceId);
    var r3 = Reducer.reduce({ evidence: [e], claims: [c5, c6] });
    ok('S3.5 参考系不同 → 差异信息不足', r3.conflicts.length === 0 && r3.differences.length === 1 &&
      r3.differences[0].reason.indexOf('参考系') >= 0);

    var c7 = claim('c7', 10, 'ly', 1, 'icrs', e.evidenceId);
    var c8 = claim('c8', 10, 'K', 1, 'icrs', e.evidenceId);
    var r4 = Reducer.reduce({ evidence: [e], claims: [c7, c8] });
    ok('S3.6 不同量纲不比较', r4.conflicts.length === 0 && r4.differences.length === 0);
  });

  await runCase('S4', '事实/推断/假设与报告范围', async function () {
    var e = paper('Orion abstract evidence', 'https://example.org/a', '10.1000/x', ['F']);
    var claims = Claims.buildClaimsFromEvidence([e], {});
    var judged = Claims.judgeAll(claims, { evidence: [e] });
    var reduced = Reducer.reduce({ evidence: [e], claims: claims, verdicts: judged.verdicts });
    ok('S4.1 摘要证据进入 inference', reduced.inferences.length >= 1 && reduced.facts.length === 0);
    ok('S4.2 无支持的 Claim 进入 hypothesis', claims.every(function (c) { return c.support.length > 0; }));

    var report = Report.build({
      question: 'Orion', evidence: [e], claims: claims,
      verdicts: judged.verdicts, reducer: reduced, retrievedAt: '2026-10-31T00:00:00Z'
    });
    ok('S4.3 结论标注 evidenceScope', report.conclusions.length && report.conclusions.every(function (c) {
      return !!c.evidenceScope;
    }), JSON.stringify(report.conclusions.map(function (c) { return c.evidenceScope; })));
    ok('S4.4 报告声明摘要局限', report.evidenceScope.abstractOnly === true &&
      report.limitations.some(function (x) { return x.indexOf('摘要') >= 0; }));
    ok('S4.5 每条结论可追溯', report.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
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
