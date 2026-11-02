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
global.sessionStorage = {
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
    /* 大小限制是纯本地逻辑，不依赖真实网络；离线 CI 也必须稳定通过。 */
    var oldFetchBig = global.fetch;
    global.fetch = function () {
      return Promise.resolve(new Response(new Uint8Array(2048),
        { headers: { 'content-type': 'application/pdf', 'content-length': '2048' } }));
    };
    var big;
    try { big = await FT.fetchPdf(FT.resolveUrl(REAL_PAPER), { maxBytes: 1000 }); }
    finally { global.fetch = oldFetchBig; }
    ok('P2.1 大小限制', big.ok === false && big.code === 'pdf_too_large', big.code);
    var oldFetch2 = global.fetch;
    global.fetch = function () {
      return Promise.resolve(new Response('<html><body>not a pdf article</body></html>',
        { headers: { 'content-type': 'text/html' } }));
    };
    var html;
    try { html = await FT.fetchPdf('https://example.org/article', { maxBytes: 10 * 1024 * 1024 }); }
    finally { global.fetch = oldFetch2; }
    ok('P2.2 非 PDF 响应被识别', (html.ok === true && html.kind === 'html') ||
      (html.ok === false && (html.code === 'html_error_page' || html.code === 'not_pdf')),
      html.ok ? ('html kind=' + html.kind) : ('code=' + html.code));
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

  await runCase('P5', '全文缓存会话持久化', async function () {
    var paper = { title: 'Cache Paper', content: { arxivId: '2401.00001' }, url: 'https://arxiv.org/abs/2401.00001' };
    var pid = FT.paperIdOf(paper);
    var url = FT.resolveUrl(paper);
    var key = pid + '|' + url;
    var cachedValue = {
      ok: true, code: 'fulltext_ok', paperId: pid, url: url, size: 100,
      chunks: [{ chunkId: 'ft_cached', section: 'RESULTS', content: 'cached text', pageStart: 1 }],
      evidence: [], parse: { pageCount: 1, sections: [] }, pageCount: 1, sections: [], warnings: []
    };
    FT.clearCache();
    global.sessionStorage.setItem(FT.CACHE_KEY, JSON.stringify({}));
    var map = {}; map[key] = { at: Date.now(), value: cachedValue };
    global.sessionStorage.setItem(FT.CACHE_KEY, JSON.stringify(map));
    FT.clearMemory();
    var oldFetch = global.fetch;
    var fetched = 0;
    global.fetch = function () { fetched++; return Promise.reject(new Error('should-not-fetch')); };
    try {
      var hit = await FT.get(paper, {});
      ok('P5.1 刷新后命中会话缓存', hit && hit.ok === true && hit.code === 'fulltext_ok' &&
        hit.chunks[0].chunkId === 'ft_cached', hit && hit.code);
      ok('P5.2 命中不重复下载', fetched === 0, 'fetch=' + fetched);
      map[key].at = Date.now() - 8 * 24 * 3600 * 1000;
      global.sessionStorage.setItem(FT.CACHE_KEY, JSON.stringify(map));
      FT.clearMemory();
      var expired = await FT.get(paper, {});
      ok('P5.3 过期缓存不复用', expired.ok === false && expired.code === 'network', expired.code);
      ok('P5.4 过期后会尝试下载', fetched >= 1, 'fetch=' + fetched);
    } finally {
      global.fetch = oldFetch;
    }
    FT.clearCache();
    ok('P5.5 主动清理会话缓存', !global.sessionStorage.getItem(FT.CACHE_KEY));
    ok('P5.6 缓存统计接口', typeof FT.cacheStats === 'function' && FT.cacheStats().key === FT.CACHE_KEY);
  });

  await runCase('P6', 'HTML 全文与错误页分类', async function () {
    var paper = { title: 'HTML Paper', content: { arxivId: '2401.00002' }, url: 'https://arxiv.org/abs/2401.00002' };
    var article = '<html><head><title>HTML Paper</title></head><body><h1>RESULTS</h1><p>' +
      'We measure the distance to M42 as 1344 light years with a calibrated parallax. '.repeat(8) +
      '</p></body></html>';
    var blocked = '<html><head><title>Access Denied</title></head><body>Enable JavaScript and cookies to continue. captcha</body></html>';
    var oldFetch = global.fetch;
    global.fetch = function () {
      return Promise.resolve(new Response(article, { headers: { 'content-type': 'text/html' } }));
    };
    FT.clearCache(); FT.clearMemory();
    try {
      var r = await FT.get(paper, {});
      ok('P6.1 HTML 正文可提取', r.ok === true && r.contentType === 'html' && r.chunks.length >= 1,
        r.ok ? 'chunks=' + r.chunks.length + ' method=' + r.parse.extractionMethod : r.code);
      ok('P6.2 HTML 不冒充 PDF', r.ok === true && r.parse.extractionMethod === 'html-text-v1', r.parse && r.parse.extractionMethod);
      global.fetch = function () {
        return Promise.resolve(new Response(blocked, { headers: { 'content-type': 'text/html' } }));
      };
      FT.clearCache(); FT.clearMemory();
      var b = await FT.get(paper, {});
      ok('P6.3 反爬/错误页明确失败', b.ok === false && b.code === 'html_error_page', b.code);
      ok('P6.4 错误页不生成全文证据', !b.evidence || b.evidence.length === 0);
    } finally {
      global.fetch = oldFetch;
    }
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
  process.exitCode = pass === results.length ? 0 : 1;
})();
