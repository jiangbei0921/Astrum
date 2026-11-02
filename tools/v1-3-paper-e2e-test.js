/* ASTRUM · V1.3 论文全文端到端
 * 真实论文检索 + 真实 arXiv PDF + Evidence/Claims/Reducer/Report。
 * 用法：node tools/v1-3-paper-e2e-test.js [--offline]
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
var Ev = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;
var FT = global.AstroPaperFulltext;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}
var CTX = { y: 2026, mo: 10, d: 31, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var PAPER = {
  title: 'A Large-Scale Bulk Flow of Galaxy Clusters',
  content: { arxivId: 'astro-ph/9901001' },
  url: 'https://arxiv.org/abs/astro-ph/9901001'
};

(async function main() {

  await runCase('E1', '真实论文元数据检索', async function () {
    if (OFFLINE) { ok('E1.0 离线跳过', true, 'OFFLINE'); return; }
    var a = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: a, agentCore: AC, network: true });
    var res = await reg.get('paper.search').run({ query: 'bulk flow galaxy clusters' }, CTX, reg.get('paper.search'));
    if (!res.ok || !res.items.length) {
      ok('E1.1 检索不可用', true, 'SKIPPED(network): ' + (res.reason || 'empty'));
      return;
    }
    ok('E1.1 真实论文元数据', res.items.length >= 1 && res.items[0].title && res.items[0].uri,
      'REAL: ' + res.items[0].title.slice(0, 50));
    ok('E1.2 元数据 abstractOnly', res.items[0].abstractOnly === true);
  });

  await runCase('E2', '真实全文 → Evidence → Claims → Report', async function () {
    if (OFFLINE) { ok('E2.0 离线跳过', true, 'OFFLINE'); return; }
    var ft = await FT.get(PAPER, { timeoutMs: 60000, maxBytes: 5 * 1024 * 1024, maxEvidenceChunks: 4 });
    if (!ft.ok) {
      ok('E2.1 全文不可用', false, 'DEFERRED(network): ' + ft.code + ' / ' + ft.reason);
      return;
    }
    var meta = Ev.fromSourceItem({
      title: PAPER.title, excerpt: 'Abstract metadata only.', url: PAPER.url, host: 'arxiv.org',
      sourceType: 'paper', version: 'preprint', authors: ['M. Hudson']
    }, { tool: 'paper.search', query: PAPER.title, retrievedAt: '2026-10-31T00:00:00Z' });
    var dep = {
      ok: true, items: [meta], evidenceIds: [meta.evidenceId],
      fulltexts: [{ paperId: ft.paperId, url: ft.url, evidence: ft.evidence, chunks: ft.chunks, parse: ft.parse }],
      fulltextErrors: []
    };
    var a = Adapter.create({ agentCore: AC });
    var r = a.compose({ query: PAPER.title, from: ['t1'] }, CTX, AC.defaultConfig(), { t1: dep });
    ok('E2.1 全文真实解析', ft.pageCount >= 5 && ft.sections.length >= 4 && ft.chunks.length >= 5,
      'REAL: pages=' + ft.pageCount + ' sections=' + ft.sections.length + ' chunks=' + ft.chunks.length);
    ok('E2.2 报告生成', r.ok === true && !!r.answer.research);
    ok('E2.3 全文统计', r.answer.research.paperStats.fulltext >= 1 &&
      r.answer.research.paperStats.fulltextEvidence >= 1, JSON.stringify(r.answer.research.paperStats));
    ok('E2.4 结论范围 fulltext', r.answer.research.conclusions.some(function (c) {
      return c.evidenceScope === 'fulltext' && c.evidenceRefs.length > 0;
    }));
    ok('E2.5 报告保留章节/页码', r.answer.research.papers.some(function (p) {
      return p.fulltextAvailable && p.sections.length > 0 && p.pageStart != null;
    }));
  });

  await runCase('E3', '全文失败不伪装', async function () {
    var bad = await FT.get({ title: 'No PDF', content: {}, url: 'https://example.org/not-a-pdf' }, { timeoutMs: 5000 });
    ok('E3.1 失败分类', bad.ok === false && ['not_pdf', 'network', 'timeout', 'fulltext_unavailable'].indexOf(bad.code) >= 0,
      bad.code + ' / ' + bad.reason);
    var meta = Ev.fromSourceItem({ title: 'No PDF', excerpt: 'Abstract only', url: 'https://example.org/x',
      host: 'example.org', sourceType: 'paper', version: 'published', authors: ['A'] },
      { tool: 'paper.search', query: 'x', retrievedAt: '2026-10-31T00:00:00Z' });
    var report = Report.build({
      question: 'No PDF', evidence: [meta], claims: Claims.buildClaimsFromEvidence([meta], {}),
      fulltextFailures: [{ code: bad.code, reason: bad.reason }], retrievedAt: '2026-10-31T00:00:00Z'
    });
    ok('E3.2 报告记录失败', report.paperStats.failed === 1 && report.gaps.some(function (g) {
      return g.indexOf('全文获取') >= 0;
    }));
    ok('E3.3 不生成 fulltext 证据', report.paperStats.fulltext === 0 && report.paperStats.fulltextEvidence === 0);
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
