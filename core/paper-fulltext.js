/* ASTRUM · 论文全文获取与解析（V1.3）
 *
 * 流程：paper metadata → 公开 PDF URL → 下载（大小/超时/取消限制）
 *      → pdf-text 解析 → 章节/分块 → fulltext Evidence。
 * 只处理公开可访问 PDF；不绕过付费墙/登录/版权；失败明确分类。
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    maxBytes: 12 * 1024 * 1024,
    timeoutMs: 30000,
    maxChunks: 40,
    maxEvidenceChunks: 6,
    chunkChars: 1400,
    cacheMax: 8
  };

  var CACHE = {};

  function hash(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value)).slice(0, 16);
    return String(value == null ? '' : value).length.toString(36);
  }

  function paperIdOf(paper) {
    var c = paper.content || paper;
    var doi = (c.doi || '').replace(/^https?:\/\/doi\.org\//, '').trim();
    if (doi) return 'doi:' + doi;
    var arxiv = c.arxivId || (paper.extra && paper.extra.arxivId) || '';
    if (arxiv) return 'arxiv:' + arxiv;
    return 'title:' + hash((paper.title || '') + '|' + (c.date || paper.publishedAt || ''));
  }

  function arxivOf(paper) {
    var c = paper.content || paper;
    var id = c.arxivId || (paper.extra && paper.extra.arxivId) || '';
    if (id) return String(id).replace(/^arXiv:/i, '').trim();
    var s = String(paper.url || '') + ' ' + String(c.doi || '');
    var m = s.match(/arxiv\.org\/(?:abs|pdf)\/([0-9]{4}\.[0-9]{4,}|[a-z-]+\/[0-9]+)/i) ||
      s.match(/10\.48550\/arxiv\.([0-9]{4}\.[0-9]{4,})/i);
    return m ? m[1] : '';
  }

  function fulltextUrlOf(paper) {
    var c = paper.content || paper;
    var ex = paper.extra || {};
    var id = arxivOf(paper);
    if (id) return 'https://arxiv.org/pdf/' + encodeURIComponent(id).replace(/%2F/g, '/');
    var direct = c.pdfUrl || ex.pdfUrl || ex.oaUrl || (paper.provenance && paper.provenance.pdfUrl) || paper.pdfUrl || '';
    if (direct) return String(direct);
    var u = String(paper.url || '');
    if (/\.pdf($|\?)/i.test(u)) return u;
    return '';
  }

  async function fetchPdf(url, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    if (!url) return { ok: false, code: 'fulltext_unavailable', reason: '没有公开 PDF 地址' };
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var ext = opts.signal;
    var cancelled = false;
    if (ext && ext.aborted) return { ok: false, code: 'cancelled', reason: '已取消', url: url };
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, opts.timeoutMs);
    function onAbort() { cancelled = true; if (ctrl) ctrl.abort(); }
    if (ext && ext.addEventListener) ext.addEventListener('abort', onAbort);
    try {
      var r = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      var ct = String(r.headers.get('content-type') || '').toLowerCase();
      var len = Number(r.headers.get('content-length') || 0);
      if (len && len > opts.maxBytes) {
        return { ok: false, code: 'pdf_too_large', reason: 'PDF 超过 ' + opts.maxBytes + ' B', url: url };
      }
      if (ct && (!/pdf|octet-stream/.test(ct))) {
        return { ok: false, code: 'not_pdf', reason: '返回内容不是 PDF（' + ct + '）', url: url };
      }
      var buf = await r.arrayBuffer();
      if (buf.byteLength > opts.maxBytes) {
        return { ok: false, code: 'pdf_too_large', reason: 'PDF 超过大小上限', url: url };
      }
      return { ok: true, bytes: new Uint8Array(buf), url: r.url || url, size: buf.byteLength };
    } catch (e) {
      return {
        ok: false,
        code: cancelled ? 'cancelled' : ((e && e.name === 'AbortError') ? 'timeout' : 'network'),
        reason: cancelled ? '已取消' : ((e && e.name === 'AbortError') ? '下载超时' : String(e && e.message || e)),
        url: url
      };
    } finally {
      clearTimeout(timer);
      if (ext && ext.removeEventListener) ext.removeEventListener('abort', onAbort);
    }
  }

  function chunkIdOf(paperId, idx) {
    return 'ft_' + hash(paperId + '|' + idx);
  }

  function buildChunks(parse, paper, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var pid = paperIdOf(paper);
    var doi = (paper.content && paper.content.doi) || paper.doi || '';
    var url = fulltextUrlOf(paper);
    var out = [];
    (parse.chunks || []).slice(0, opts.maxChunks).forEach(function (c, i) {
      var section = '正文';
      (parse.sections || []).forEach(function (s) {
        if (c.pageStart != null && s.pageStart != null && c.pageStart >= s.pageStart && c.pageStart <= (s.pageEnd || s.pageStart)) {
          section = s.name;
        }
      });
      out.push({
        chunkId: chunkIdOf(pid, i),
        paperId: pid,
        title: paper.title || parse.title || '',
        section: section,
        content: String(c.content || '').slice(0, opts.chunkChars),
        pageStart: c.pageStart == null ? null : c.pageStart,
        pageEnd: c.pageEnd == null ? null : c.pageEnd,
        doi: doi,
        sourceUrl: url,
        contentType: 'fulltext',
        provenance: {
          extractionMethod: parse.extractionMethod || 'pdf-text-v1',
          pdfUrl: url,
          pageCount: parse.pageCount || null,
          chunkIndex: i,
          retrievedAt: new Date().toISOString()
        }
      });
    });
    return out;
  }

  function buildEvidence(paper, parse, chunks, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var E = root.AstroEvidence;
    if (!E || !E.make) return [];
    var pid = paperIdOf(paper);
    var c = paper.content || {};
    var doi = c.doi || paper.doi || '';
    var url = fulltextUrlOf(paper);
    var sourceId = doi ? ('src_doi_' + doi.replace(/^https?:\/\/doi\.org\//, ''))
      : ('src_pdf_' + hash(url || paper.title || '').slice(0, 12));
    return chunks.slice(0, opts.maxEvidenceChunks).map(function (ch) {
      return E.make({
        sourceId: sourceId,
        sourceType: 'paper',
        title: (paper.title || parse.title || '论文全文') + ' · ' + ch.section,
        uri: url,
        retrievedAt: new Date().toISOString(),
        publishedAt: paper.publishedAt || c.date || null,
        abstractOnly: false,
        contentLevel: 'fulltext',
        content: {
          contentLevel: 'fulltext',
          excerpt: ch.content,
          fulltext: true,
          paperId: pid,
          chunkId: ch.chunkId,
          section: ch.section,
          pageStart: ch.pageStart,
          pageEnd: ch.pageEnd,
          doi: doi,
          pdfUrl: url,
          extractionMethod: parse.extractionMethod || 'pdf-text-v1'
        },
        trust: { level: 'high', score: 0.9, basis: '公开 PDF 全文，含章节/页码定位' },
        provenance: {
          tool: 'paper.fulltext',
          service: 'fulltext',
          host: (url.split('/')[2] || ''),
          pdfUrl: url,
          sourceUrl: url,
          extractionMethod: parse.extractionMethod || 'pdf-text-v1',
          pageCount: parse.pageCount || null,
          warnings: (parse.warnings || []).slice(),
          retrievedAt: new Date().toISOString()
        }
      });
    });
  }

  async function get(paper, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var pid = paperIdOf(paper);
    var url = fulltextUrlOf(paper);
    if (!url) return { ok: false, code: 'fulltext_unavailable', reason: '没有公开全文地址', paperId: pid, url: '' };
    var key = pid + '|' + url;
    if (CACHE[key]) return CACHE[key];

    var res = await fetchPdf(url, opts);
    if (!res.ok) {
      var fail = { ok: false, code: res.code, reason: res.reason, paperId: pid, url: url };
      CACHE[key] = fail;
      return fail;
    }
    var P = root.AstroPdfText;
    if (!P) return { ok: false, code: 'pdf_parser_missing', reason: 'PDF 解析模块未加载', paperId: pid, url: url };
    var parsed = await P.parse(res.bytes, opts);
    if (!parsed.ok) {
      var pf = { ok: false, code: parsed.code, reason: parsed.error, paperId: pid, url: url, warnings: parsed.warnings };
      CACHE[key] = pf;
      return pf;
    }
    var chunks = buildChunks(parsed, paper, opts);
    var evidence = buildEvidence(paper, parsed, chunks, opts);
    var out = {
      ok: true, code: 'fulltext_ok', paperId: pid, url: url, size: res.size,
      parse: {
        title: parsed.title, doi: parsed.doi, textLength: parsed.textLength,
        pageCount: parsed.pageCount, sections: parsed.sections, warnings: parsed.warnings,
        extractionMethod: parsed.extractionMethod
      },
      pageCount: parsed.pageCount,
      sections: parsed.sections,
      chunks: chunks,
      evidence: evidence,
      warnings: parsed.warnings,
      retrievedAt: new Date().toISOString()
    };
    CACHE[key] = out;
    var keys = Object.keys(CACHE);
    while (keys.length > opts.cacheMax) { delete CACHE[keys[0]]; keys.shift(); }
    return out;
  }

  function clearCache() { CACHE = {}; }

  root.AstroPaperFulltext = {
    get: get,
    fetchPdf: fetchPdf,
    resolveUrl: fulltextUrlOf,
    paperIdOf: paperIdOf,
    buildChunks: buildChunks,
    buildEvidence: buildEvidence,
    DEFAULTS: DEFAULTS,
    clearCache: clearCache,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
