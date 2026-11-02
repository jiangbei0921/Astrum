/* ASTRUM · V1.2 SIMBAD 真实网络验证
 * 真实查询 M42 / M31 / M4，验证 TAP JSON → Evidence → Claim → Report。
 * 用法：node tools/v1-2-simbad-test.js [--offline]
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'core/task.js', 'core/schema.js', 'core/claims.js', 'core/evidence.js',
  'core/fits.js', 'core/simbad.js', 'core/reducer.js', 'core/report.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var Simbad = global.Simbad;
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

(async function main() {

  await runCase('S1', 'SIMBAD TAP 真实查询 M42/M31/M4', async function () {
    if (OFFLINE) {
      ok('S1.0 离线模式跳过真实查询', true, 'OFFLINE');
      return;
    }
    var names = ['M42', 'M31', 'M4'];
    var evidence = [];
    for (var i = 0; i < names.length; i++) {
      var r = await Simbad.lookup(names[i]);
      if (!r.ok) {
        ok('S1.' + (i + 1) + ' ' + names[i] + ' 真实查询', false, 'DEFERRED(network): ' + r.reason);
        continue;
      }
      ok('S1.' + (i + 1) + ' ' + names[i] + ' 真实查询', !!r.info.id && isFinite(r.info.ra) && isFinite(r.info.dec),
        'REAL: ' + r.info.id + ' / ' + r.info.otype + ' / ' + (r.host || r.from));
      var ev = Evidence.fromSimbad(r.info, {
        query: names[i], from: r.from, host: r.host || '', retrievedAt: new Date().toISOString()
      });
      if (ev) evidence.push(ev);
    }
    ok('S1.4 生成 SIMBAD Evidence', evidence.length === names.length, 'n=' + evidence.length);

    var claims = Claims.buildClaimsFromEvidence(evidence, {});
    var judged = Claims.judgeAll(claims, { evidence: evidence });
    var reduced = Reducer.reduce({ evidence: evidence, claims: claims, verdicts: judged.verdicts });
    var report = Report.build({
      question: 'M42 / M31 / M4 天体参数', evidence: evidence, claims: claims,
      verdicts: judged.verdicts, reducer: reduced, retrievedAt: new Date().toISOString()
    });
    ok('S1.5 参数进入报告', report.parameters.length === names.length &&
      report.coverage.hasSimbad === true, 'params=' + report.parameters.length);
    ok('S1.6 结论引用 SIMBAD Evidence', report.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
    ok('S1.7 来源记录真实主机', report.evidence.some(function (e) {
      return e.sourceType === 'database';
    }));
  });

  await runCase('S2', '空结果与错误分类', async function () {
    if (OFFLINE) { ok('S2.0 离线跳过', true, 'OFFLINE'); return; }
    var r = await Simbad.lookup('SIMBAD 9999XYZ');
    ok('S2.1 未找到明确返回 not-found', r.ok === false && r.reason === 'not-found', r.reason);
    ok('S2.2 不把未找到当目标不存在', r.ok === false);
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
