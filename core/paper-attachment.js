/* ASTRUM · 本机论文 PDF 附件解析（V1.5）
 *
 * 与远程 paper.search/fulltext 共享同一套零依赖解析器：
 *   PDF bytes → pdf-text → 章节/分块 → fulltext Evidence
 *
 * 只处理用户本机上传的 PDF；不联网、不绕过版权、不伪造页码。
 * 解析失败、无文本、扫描件等情况返回明确 code，不生成 fulltext 证据。
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    maxBytes: 12 * 1024 * 1024,
    maxChunks: 40,
    maxEvidenceChunks: 4,
    chunkChars: 1400
  };

  function hashShort(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value)).slice(0, 20);
    return String(value == null ? '' : value).length.toString(36);
  }

  function cleanName(name) {
    return String(name || 'paper.pdf').replace(/^[\/\\]+/, '');
  }

  function localPaper(fileName, parse) {
    var title = (parse && parse.title) || cleanName(fileName).replace(/\.pdf$/i, '');
    return {
      title: title,
      url: 'local:' + cleanName(fileName),
      content: {
        pdfUrl: 'local:' + cleanName(fileName),
        fileName: cleanName(fileName)
      }
    };
  }

  async function parseBytes(bytes, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var fileName = cleanName(opts.fileName);
    var P = root.AstroPdfText;
    var FT = root.AstroPaperFulltext;
    if (!P || typeof P.parse !== 'function') {
      return { ok: false, code: 'pdf_parser_missing', reason: 'PDF 解析模块未加载', fileName: fileName };
    }
    if (!bytes || !bytes.length) {
      return { ok: false, code: 'pdf_empty', reason: 'PDF 文件为空', fileName: fileName };
    }
    if (bytes.length > opts.maxBytes) {
      return { ok: false, code: 'pdf_too_large', reason: 'PDF 超过大小上限', fileName: fileName, size: bytes.length };
    }

    var parsed;
    try {
      parsed = await P.parse(bytes, { maxBytes: opts.maxBytes });
    } catch (e) {
      return { ok: false, code: 'pdf_parse_error', reason: String(e && e.message || e), fileName: fileName };
    }
    if (!parsed || parsed.ok !== true) {
      var reason = (parsed && parsed.error) || 'PDF 解析失败';
      var ocrRequired = !!(parsed && (parsed.ocrRequired || parsed.detailCode === 'pdf_ocr_required'));
      if (ocrRequired) reason = 'PDF 没有可提取的文本层（扫描件）。本项目不提供 OCR，无法读取图像中的文字';
      return {
        ok: false,
        code: (parsed && parsed.code) || 'pdf_parse_failed',
        reason: reason,
        detailCode: parsed && parsed.detailCode || '',
        ocrRequired: ocrRequired,
        fileName: fileName,
        warnings: (parsed && parsed.warnings) || []
      };
    }
    if (!parsed.textLength) {
      return { ok: false, code: 'pdf_no_text', reason: 'PDF 未提取到正文文本（可能是扫描件或字体缺失）', fileName: fileName };
    }

    var paper = localPaper(fileName, parsed);
    var chunks = FT && FT.buildChunks
      ? FT.buildChunks(parsed, paper, { maxChunks: opts.maxChunks, chunkChars: opts.chunkChars })
      : [];
    var evidence = FT && FT.buildEvidence
      ? FT.buildEvidence(paper, parsed, chunks, { maxEvidenceChunks: opts.maxEvidenceChunks })
      : [];

    var fileHash = hashShort({ name: fileName, size: bytes.length, pages: parsed.pageCount, chunks: chunks.length });
    evidence.forEach(function (ev) {
      ev.sourceId = 'src_local_' + fileHash;
      ev.uri = 'local:' + fileName;
      ev.title = fileName + ' · ' + (ev.content && ev.content.section || '全文');
      ev.abstractOnly = false;
      ev.contentLevel = 'fulltext';
      ev.content.fileName = fileName;
      ev.content.fulltext = true;
      ev.content.pdfUrl = 'local:' + fileName;
      ev.provenance.localOnly = true;
      ev.provenance.tool = 'attachments.paper';
      ev.provenance.fileName = fileName;
      ev.provenance.fileSize = bytes.length;
      ev.provenance.fileHash = fileHash;
      ev.trust = {
        level: 'high',
        score: 0.85,
        basis: '本机 PDF 全文解析；页码与章节可追溯，未上传服务器'
      };
    });

    return {
      ok: true,
      code: 'fulltext_ok',
      fileName: fileName,
      size: bytes.length,
      title: paper.title,
      pageCount: parsed.pageCount,
      sections: parsed.sections || [],
      chunks: chunks,
      evidence: evidence,
      textLength: parsed.textLength,
      warnings: parsed.warnings || [],
      extractionMethod: parsed.extractionMethod || 'pdf-text-v1'
    };
  }

  root.AstroPaperAttachment = {
    parseBytes: parseBytes,
    DEFAULTS: DEFAULTS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
