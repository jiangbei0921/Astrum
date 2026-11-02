/* ASTRUM · V1.3 论文全文测试
 * 真实 arXiv PDF 下载/解析/分块/Evidence/Claims/Report；资源限制、类型检查、取消。
 * 用法：node tools/v1-3-paper-fulltext-test.js [--offline]
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
var Report = global.AstroReport;
var FT = global.AstroPaperFulltext;
var Pdf = global.AstroPdfText;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

var REAL_PAPER = { title: 'A Large-Scale Bulk Flow of Galaxy Clusters', content: { arxivId: 'astro-ph/9901001' }, url: 'https://arxiv.org/abs/astro-ph/9901001' };
var CTX = { y: 2026, mo: 10, d: 31, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };

(async function main() {

  await runCase('P1', '真实 arXiv PDF 全文', async function () {
    if (OFFLINE) { ok('P1.0 离线跳过真实下载', true, 'OFFLINE'); return; }
    var r = await FT.get(REAL_PAPER, { timeoutMs: 60000, maxBytes: 5 * 1024 * 1024, maxEvidenceChunks: 4 });
    ok('P1.1 真实 PDF 下载成功', r.ok === true && r.size === 185574, 'REAL: ' + r.size + ' B');
    ok('P1.2 页面/章节识别', r.pageCount >= 5 && r.sections.length >= 4,
      'pages=' + r.pageCount + ' sections=' + r.sections.map(function (s) { return s.name; }).slice(0, 5).join('/'));
    ok('P1.3 正文分块', r.chunks.length >= 5 && r.chunks[0].content.length > 100,
      'chunks=' + r.chunks.length);
    var secChunk = r.chunks.filter(function (c) {
      return c.section !== '正文' && c.pageStart != null && c.sourceUrl;
    })[0];
    ok('P1.4 页码/章节/来源', !!secChunk, JSON.stringify(secChunk && {
      p: secChunk.pageStart, s: secChunk.section
    }));
    ok('P1.5 fulltext Evidence', r.evidence.length >= 1 &&
      r.evidence[0].contentLevel === 'fulltext' && r.evidence[0].abstractOnly === false);
  });

  await runCase('P2', '资源限制/类型/取消', async function () {
    var big = await FT.fetchPdf(FT.resolveUrl(REAL_PAPER), { maxBytes: 1000 });
    ok('P2.1 大小限制', big.ok === false && big.code === 'pdf_too_large', big.code);
    var html = await FT.fetchPdf('https://arxiv.org/abs/astro-ph/9901001', { maxBytes: 10 * 1024 * 1024 });
    ok('P2.2 非 PDF 拒绝', html.ok === false && html.code === 'not_pdf', html.code);
    var ac = new AbortController(); ac.abort();
    var cancel = await FT.fetchPdf(FT.resolveUrl(REAL_PAPER), { signal: ac.signal });
    ok('P2.3 取消分类', cancel.ok === false && cancel.code === 'cancelled', cancel.code);
    var bad = await Pdf.parse(new Uint8Array(100));
    ok('P2.4 非 PDF 字节明确失败', !!bad && bad.ok === false && bad.code === 'not_pdf');
    ok('P2.5 解析器限制存在', Pdf.DEFAULTS.maxBytes > 0 && FT.DEFAULTS.maxBytes > 0 &&
      FT.DEFAULTS.timeoutMs > 0);
  });

  await runCase('P3', '摘要 vs 全文 Evidence', async function () {
    var paper = { title: REAL_PAPER.title, content: { doi: '10.1000/x' }, url: 'https://arxiv.org/pdf/astro-ph/9901001' };
    var chunks = [
      { chunkId: 'ft_1', paperId: 'doi:10.1000/x', title: paper.title, section: 'RESULTS',
        content: 'The bulk flow measurement is reported in Section 4 with a systematic error budget.',
        pageStart: 4, pageEnd: 4, doi: '10.1000/x', sourceUrl: paper.url, contentType: 'fulltext' }
    ];
    var parse = { ok: true, pageCount: 5, sections: [{ name: 'RESULTS', pageStart: 4, pageEnd: 4 }], warnings: [], extractionMethod: 'pdf-text-v1' };
    var fullEv = FT.buildEvidence(paper, parse, chunks, { maxEvidenceChunks: 1 });
    ok('P3.1 全文 Evidence 构建', fullEv.length === 1 && fullEv[0].contentLevel === 'fulltext' &&
      fullEv[0].content.section === 'RESULTS' && fullEv[0].content.pageStart === 4);

    var metaEv = Ev.fromSourceItem({
      title: paper.title, excerpt: 'Abstract only.', url: 'https://arxiv.org/abs/astro-ph/9901001',
      host: 'arxiv.org', sourceType: 'paper', doi: '10.1000/x', version: 'published', authors: ['A']
    }, { tool: 'paper.search', query: paper.title, retrievedAt: '2026-10-31T00:00:00Z' });
    var dd = Ev.dedupe([metaEv].concat(fullEv));
    ok('P3.2 同 DOI 摘要/全文不互相覆盖', dd.evidence.length === 2 && dd.duplicates.length === 0);
    var claims = Claims.buildClaimsFromEvidence([metaEv].concat(fullEv), {});
    ok('P3.3 两类证据均可构建 Claim', claims.length >= 2 && claims.every(function (c) { return c.support.length > 0; }));
    var report = Report.build({
      question: 'Bulk flow', evidence: [metaEv].concat(fullEv), claims: claims,
      retrievedAt: '2026-10-31T00:00:00Z'
    });
    ok('P3.4 报告区分全文/摘要', report.paperStats.fulltext === 1 &&
      report.paperStats.abstractEvidence >= 1 && report.paperStats.fulltextEvidence >= 1,
      JSON.stringify(report.paperStats));
    ok('P3.5 全文结论 evidenceScope', report.conclusions.some(function (c) { return c.evidenceScope === 'fulltext'; }));
  });

  await runCase('P4', '真实全文 + Adapter 报告链路', async function () {
    if (OFFLINE) { ok('P4.0 离线跳过', true, 'OFFLINE'); return; }
    var ft = await FT.get(REAL_PAPER, { timeoutMs: 60000, maxBytes: 5 * 1024 * 1024, maxEvidenceChunks: 4 });
    ok('P4.1 全文可复用于报告', ft.ok === true && ft.evidence.length >= 1,
      'REAL: chunks=' + (ft.chunks || []).length);
    var metaEv = Ev.fromSourceItem({
      title: REAL_PAPER.title, excerpt: 'Abstract only.', url: REAL_PAPER.url,
      host: 'arxiv.org', sourceType: 'paper', version: 'preprint', authors: ['A']
    }, { tool: 'paper.search', query: REAL_PAPER.title, retrievedAt: '2026-10-31T00:00:00Z' });
    var dep = {
      ok: true, items: [metaEv], evidenceIds: [metaEv.evidenceId],
      fulltexts: [{ paperId: ft.paperId, url: ft.url, evidence: ft.evidence, chunks: ft.chunks, parse: ft.parse }],
      fulltextErrors: []
    };
    var a = Adapter.create({ agentCore: AC });
    var r = a.compose({ query: REAL_PAPER.title, from: ['t1'] }, CTX, AC.defaultConfig(), { t1: dep });
    ok('P4.2 报告含全文统计', r.ok === true && r.answer.research &&
      r.answer.research.paperStats.fulltext >= 1,
      r.answer.research && JSON.stringify(r.answer.research.paperStats));
    ok('P4.3 全文结论有引用', r.answer.research.conclusions.some(function (c) {
      return c.evidenceScope === 'fulltext' && c.evidenceRefs.length > 0;
    }));
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
