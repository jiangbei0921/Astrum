/* ASTRUM · V1.2 附件研究测试
 * 覆盖：FITS → Evidence → Claim → Report；多 HDU/Binary Table/截断；
 * 不支持附件不生成证据；论文元数据 abstractOnly；无全文不冒充全文。
 * 用法：node tools/v1-2-attachment-test.js
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
var T = global.AstroTask;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Request = global.AstroRequest;
var Fits = global.AstroFits;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var Report = global.AstroReport;
var AttEv = global.AstroAttachmentEvidence;

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

function fitsItem(opts) {
  opts = opts || {};
  var stats = opts.stats || { count: 12, finite: 12, nan: 0, min: 1, max: 12, mean: 6.5, std: 3.45, median: 7 };
  return {
    id: 'F1', name: opts.name || 'test.fits', size: opts.size || 5760,
    sizeText: '5.6 KB', kind: 'fits', status: 'ready',
    fits: {
      header: { SIMPLE: true, BITPIX: -32, NAXIS: 2, NAXIS1: 4, NAXIS2: 3, BUNIT: 'ADU', OBJECT: 'M42', TELESCOP: 'TEST', DATE_OBS: '2026-01-01' },
      hdus: opts.hdus || [
        { index: 0, type: 'primary', naxis1: 4, naxis2: 3, bitpix: -32, stats: stats, table: null },
        { index: 1, type: 'bintable', naxis1: 8, naxis2: 2, bitpix: 8, stats: null, table: { rows: 2, fields: 2 } }
      ],
      warnings: opts.warnings || [],
      file: { name: opts.name || 'test.fits', size: opts.size || 5760, sizeText: '5.6 KB', fileHash: opts.hash || 'fits_hash_1' }
    }
  };
}

(async function main() {

  await runCase('A1', 'FITS 附件 → Evidence', async function () {
    var pack = AttEv.fromAttachments([fitsItem()]);
    ok('A1.1 生成 1 条 observation Evidence', pack.evidence.length === 1 &&
      pack.evidence[0].sourceType === 'observation' && pack.evidence[0].abstractOnly === false);
    var ev = pack.evidence[0];
    ok('A1.2 保留文件/HDU/统计', ev.content.fileName === 'test.fits' && ev.content.hduCount === 2 &&
      ev.content.stats.mean === 6.5 && !!ev.provenance.fileHash);
    ok('A1.3 不把文件名当观测结果', ev.title === 'test.fits' && ev.content.object === 'M42');
    ok('A1.4 支持全部 FITS 判定', pack.allFits === true);

    var claims = Claims.buildClaimsFromEvidence(pack.evidence, {});
    ok('A1.5 FITS 定量 Claim 带 CalcRecord', claims.length >= 1 && claims[0].type === 'quantitative' &&
      !!claims[0].calc && !!claims[0].uncertainty);
    var judged = Claims.judgeAll(claims, { evidence: pack.evidence });
    ok('A1.6 R1-R4 判定', judged.verdicts.length === claims.length, JSON.stringify(judged.summary));
  });

  await runCase('A2', '多 HDU / Binary Table / 截断', async function () {
    var hdus = [
      { index: 0, type: 'primary', naxis1: 4, naxis2: 3, bitpix: -32, stats: { mean: 6.5, min: 1, max: 12, std: 3.45, count: 12 } },
      { index: 1, type: 'image', naxis1: 2, naxis2: 2, bitpix: -32, stats: { mean: 2.5, min: 1, max: 4, std: 1, count: 4 } },
      { index: 2, type: 'bintable', naxis1: 4, naxis2: 2, bitpix: 8, stats: null, table: { rows: 2, fields: 1 } }
    ];
    var multi = AttEv.fromAttachments([fitsItem({ hdus: hdus })]);
    ok('A2.1 多 HDU 计数', multi.evidence.length === 1 && multi.evidence[0].content.hduCount === 3 &&
      multi.evidence[0].content.imageHdus === 2 && multi.evidence[0].content.tableHdus === 1);
    var trunc = AttEv.fromAttachments([fitsItem({ hdus: [{ index: 0, type: 'primary', naxis1: 100, naxis2: 100, bitpix: -32, stats: null }], warnings: ['数据区被截断'] })]);
    ok('A2.2 截断保留警告且无统计', trunc.evidence.length === 1 && trunc.evidence[0].content.stats === null &&
      trunc.evidence[0].provenance.warnings[0].indexOf('截断') >= 0);
    var bad = Fits.parse({ bytes: new Uint8Array(2880) });
    ok('A2.3 非法 FITS 明确失败', bad.ok === false && bad.errors.length > 0);
  });

  await runCase('A3', '不支持附件不生成证据', async function () {
    var pack = AttEv.fromAttachments([
      { id: 'I1', name: 'photo.jpg', kind: 'image', size: 100 },
      { id: 'T1', name: 'notes.txt', kind: 'text', size: 100, text: 'hello' },
      { id: 'P1', name: 'paper.pdf', kind: 'other', size: 1000 }
    ]);
    ok('A3.1 无 Evidence', pack.evidence.length === 0);
    ok('A3.2 明确 unsupported/gaps', pack.unsupported.length === 3 && pack.gaps.length === 3);
    ok('A3.3 不冒充全文', pack.gaps.some(function (g) { return g.indexOf('文本') >= 0; }) &&
      pack.gaps.some(function (g) { return g.indexOf('暂不支持') >= 0; }));
  });

  await runCase('A4', '论文元数据/摘要级证据', async function () {
    var p = Evidence.fromSourceItem({
      title: 'Orion Nebula survey', excerpt: 'We survey the Orion Nebula and report...',
      url: 'https://arxiv.org/abs/2401.1', host: 'arxiv.org', sourceType: 'paper',
      doi: '10.1000/orion', date: '2024-01-01', version: 'published', authors: ['A']
    }, { tool: 'paper.search', query: 'Orion', retrievedAt: '2026-10-31T00:00:00Z' });
    var claims = Claims.buildClaimsFromEvidence([p], {});
    var report = Report.build({ question: 'Orion', evidence: [p], claims: claims, retrievedAt: '2026-10-31T00:00:00Z' });
    ok('A4.1 abstractOnly 保留', p.abstractOnly === true && report.papers[0].abstractOnly === true);
    ok('A4.2 摘要级结论范围', report.conclusions.every(function (c) { return c.evidenceScope === 'abstract-only'; }));
    ok('A4.3 报告明确未读全文', report.limitations.some(function (x) { return x.indexOf('未阅读全文') >= 0; }));
  });

  await runCase('A5', '统一入口 FITS 附件 → Report', async function () {
    var pack = AttEv.fromAttachments([fitsItem()]);
    var adapter = Adapter.create({ agentCore: AC });
    var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: false });
    var r = await Request.handle('M42 怎么拍 为什么需要长曝光？', CTX, CFG, {
      adapter: adapter, registry: registry, attachmentsEvidence: pack.evidence
    });
    ok('A5.1 进入 Control', r.mode === 'control' && !!r.control);
    ok('A5.2 answer.research 存在', !!r.answer.research);
    ok('A5.3 观测数据进入报告', r.answer.research.observations.length === 1 &&
      r.answer.research.coverage.hasFits === true);
    ok('A5.4 报告引用 FITS Evidence', r.answer.research.evidence.some(function (e) {
      return e.sourceType === 'observation';
    }));
    ok('A5.5 每条结论可追溯', r.answer.research.conclusions.every(function (c) { return c.evidenceRefs.length > 0; }));
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
