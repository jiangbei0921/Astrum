/* ASTRUM · Evidence（D4）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §8.6
 *       docs/architecture/06-科学证据与验证机制.md §4
 *
 * 统一 Evidence 结构：evidenceId / sourceId / sourceType / title / uri /
 * retrievedAt / publishedAt / content / claimRefs / trust / provenance。
 * 所有数据必须可追溯到真实来源；缺失来源不生成 Evidence。
 * 论文只有元数据/摘要时 abstractOnly=true，不声称已读全文。
 */
(function (root) {
  'use strict';

  function nowIso() { return new Date().toISOString(); }

  function hash(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value));
    return String(value == null ? '' : value).length.toString(36);
  }

  function shortHash(value, n) {
    return hash(value).slice(0, n || 16);
  }

  function normDoi(d) {
    return String(d == null ? '' : d).trim().toLowerCase()
      .replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:/, '');
  }

  /* V1.13：证据核验状态。只描述“这条 Evidence 能否追溯到原始来源”，
   * 不代表论文结论已被复现。核验不通过的内容不得写成已核验。 */
  var VERIFY_STATES = {
    VERIFIED: 'verified',
    PARTIAL: 'partial',
    UNVERIFIED: 'unverified',
    UNAVAILABLE: 'unavailable',
    CONFLICT: 'conflict'
  };
  var VERIFY_LABEL = {
    verified: '已核验',
    partial: '部分核验',
    unverified: '未核验',
    unavailable: '来源不可用',
    conflict: '证据冲突'
  };
  var DOI_RE = /^10\.\d{4,9}\/\S+$/i;
  var FAKE_DOI_RE = /^10\.(0000|0001|1111|1234|5555|9999)\//i;
  var ARXIV_RE = /^(?:\d{4}\.\d{4,5}(?:v\d+)?|(?:astro-ph|cond-mat|gr-qc|hep-ex|hep-lat|hep-ph|hep-th|math-ph|nlin|nucl-ex|nucl-th|physics|quant-ph)\/\d{7}(?:v\d+)?)$/i;
  var TRUSTED_SOURCE_RE = /(doi\.org|arxiv\.org|openalex\.org|semanticscholar\.org|crossref\.org|adsabs\.harvard\.edu|simbad|nasa\.gov|esa\.(?:int|com)|nature\.com|science\.org|iopscience|aanda\.org|academic\.oup\.com|pnas\.org|springer|elsevier|wiley|tandfonline|iop\.org)/i;

  function hasHttp(u) { return /^https?:\/\/\S+/i.test(String(u || '')); }
  function normArxiv(v) {
    return String(v == null ? '' : v).trim()
      .replace(/^arxiv:\s*/i, '').replace(/^https?:\/\/arxiv\.org\/(?:abs|pdf)\//i, '')
      .replace(/\.pdf$/i, '');
  }
  function uriDoiOf(uri) {
    var m = String(uri || '').match(/doi\.org\/(10\.\d{4,9}\/\S+)/i);
    return m ? normDoi(m[1]).replace(/[?#].*$/, '').replace(/\/+$/, '') : '';
  }
  function uriArxivOf(uri) {
    var m = String(uri || '').match(/arxiv\.org\/(?:abs|pdf)\/([^?#\s]+)/i);
    return m ? normArxiv(m[1]) : '';
  }

  function verificationOf(ev, opts) {
    opts = opts || {};
    var checks = [];
    function ck(name, ok, detail) {
      checks.push({ name: name, ok: !!ok, detail: detail || '' });
      return !!ok;
    }
    var type = ev && ev.sourceType;
    var uri = ev && ev.uri;
    var title = ev && ev.title;
    var c = (ev && ev.content) || {};
    var doi = normDoi(c.doi);
    var arx = normArxiv(c.arxivId);
    var http = hasHttp(uri);
    var local = /^local:/i.test(String(uri || ''));
    var titleOk = ck('title.present', !!String(title || '').trim(), '标题');
    if (opts.unavailable) {
      return { state: VERIFY_STATES.UNAVAILABLE, basis: String(opts.reason || '来源暂时无法访问'), checkedAt: nowIso(), checks: checks };
    }
    if (opts.conflictWith && (Array.isArray(opts.conflictWith) ? opts.conflictWith.length : !!opts.conflictWith)) {
      return { state: VERIFY_STATES.CONFLICT, basis: '多个可信来源存在实质性差异', checkedAt: nowIso(), checks: checks };
    }

    if (type === 'paper') {
      var doiOk = ck('doi.format', !doi || (DOI_RE.test(doi) && !FAKE_DOI_RE.test(doi)), doi ? 'DOI 格式' : '无 DOI');
      var arxOk = ck('arxiv.format', !arx || ARXIV_RE.test(arx), arx ? 'arXiv 格式' : '无 arXiv ID');
      var idOk = ck('paper.identifier', !!(doi || arx || http), 'DOI/arXiv/URL 至少一项');
      var uriDoi = uriDoiOf(uri);
      var uriArx = uriArxivOf(uri);
      var consistent = true;
      if (doi && uriDoi && uriDoi !== doi) consistent = false;
      if (arx && uriArx && uriArx !== arx) consistent = false;
      ck('identifier.uri.consistent', consistent, consistent ? '标识与链接一致' : '标识与链接不一致');
      var trusted = http && TRUSTED_SOURCE_RE.test(uri);
      var sourceOk = ck('source.present', trusted,
        !http ? '缺少原始链接' : trusted ? '有可识别的学术来源链接' : '来源链接不是可识别的学术来源');
      var authors = ck('authors.present', Array.isArray(c.authors) && c.authors.length > 0, '作者信息');
      var date = ck('date.present', !!String(ev.publishedAt || '').trim(), '发表时间');
      var abstract = ck('abstract.present',
        !!(String(c.excerpt || c.snippet || '').trim() || c.contentLevel === 'fulltext' || c.fulltext === true),
        '摘要或全文片段');
      ck('retrievedAt.present', !!String(ev.retrievedAt || '').trim(), '检索时间');
      if (!sourceOk || !titleOk) {
        return {
          state: VERIFY_STATES.UNVERIFIED,
          basis: sourceOk ? '缺少可核对的标题' : '缺少原始链接，无法确认来源真实存在',
          checkedAt: nowIso(), checks: checks
        };
      }
      if (!idOk || !doiOk || !arxOk || !consistent) {
        return {
          state: VERIFY_STATES.PARTIAL,
          basis: !consistent ? '论文标识与原始链接不一致' : '来源存在，但标识/元数据尚未完整确认',
          checkedAt: nowIso(), checks: checks
        };
      }
      if (!authors || !date || !abstract) {
        return {
          state: VERIFY_STATES.PARTIAL,
          basis: '来源与标识存在，但作者/时间/摘要等关键细节不完整',
          checkedAt: nowIso(), checks: checks
        };
      }
      return { state: VERIFY_STATES.VERIFIED, basis: '原始链接与论文标识一致，关键元数据可核对', checkedAt: nowIso(), checks: checks };
    }

    if (type === 'database' || type === 'observation' || type === 'calculation') {
      var src = ck('source.present', http || local || !!ev.sourceId, '来源/原始记录');
      var record = true;
      if (type === 'observation') record = ck('record.fileHash', !!(ev.provenance && ev.provenance.fileHash), '本地文件哈希');
      if (type === 'calculation') {
        record = ck('calc.inputs', !!(c.inputs && c.epoch && c.frame), '可复算输入');
      }
      if (!src || !titleOk) {
        return { state: VERIFY_STATES.UNVERIFIED, basis: '缺少可追溯来源或标题', checkedAt: nowIso(), checks: checks };
      }
      if (!record) {
        return { state: VERIFY_STATES.PARTIAL, basis: '来源存在，但复算/文件信息不完整', checkedAt: nowIso(), checks: checks };
      }
      return {
        state: VERIFY_STATES.VERIFIED,
        basis: type === 'database' ? '权威数据库条目，可追溯'
          : type === 'observation' ? '本地观测文件可复算'
            : '本地计算结果可复算',
        checkedAt: nowIso(), checks: checks
      };
    }

    var present = ck('source.present', http || local || !!ev.sourceId, '来源');
    if (!present || !titleOk) {
      return { state: VERIFY_STATES.UNVERIFIED, basis: '缺少可追溯来源或标题', checkedAt: nowIso(), checks: checks };
    }
    return { state: VERIFY_STATES.PARTIAL, basis: '来源存在，但来源类型未分类，未做完整性核验', checkedAt: nowIso(), checks: checks };
  }

  function normalizeVerification(v, ev, opts) {
    if (v && VERIFY_LABEL[v.state]) {
      return {
        state: v.state,
        basis: v.basis || VERIFY_LABEL[v.state],
        checkedAt: v.checkedAt || nowIso(),
        checks: Array.isArray(v.checks) ? v.checks.slice() : []
      };
    }
    if (typeof v === 'string' && VERIFY_LABEL[v]) {
      return { state: v, basis: VERIFY_LABEL[v], checkedAt: nowIso(), checks: [] };
    }
    return verificationOf(ev, opts);
  }

  function verify(ev, opts) {
    if (!ev) return null;
    ev.verification = normalizeVerification(ev.verification, ev, opts);
    return ev.verification;
  }

  function verifyAll(list, opts) {
    var counts = { verified: 0, partial: 0, unverified: 0, unavailable: 0, conflict: 0 };
    var out = (list || []).map(function (ev) {
      if (!ev) return ev;
      ev.verification = normalizeVerification(ev.verification, ev, opts);
      if (counts[ev.verification.state] == null) counts[ev.verification.state] = 0;
      counts[ev.verification.state] += 1;
      return ev;
    });
    return { evidence: out, counts: counts };
  }

  /* 引用真实性审计：编号、DOI、arXiv ID、URL 都必须能在本轮 Evidence 中找到。
   * 只做“是否对应真实来源”，不判断语义是否支持该结论。 */
  function auditCitations(text, evidence) {
    var src = String(text || '');
    var ids = {}, dois = {}, arxivs = {}, uris = {};
    (evidence || []).forEach(function (ev) {
      if (!ev) return;
      if (ev.evidenceId) ids[ev.evidenceId] = ev;
      if (ev.id) ids[ev.id] = ev;
      var c = ev.content || {};
      var d = normDoi(c.doi || ev.doi);
      if (d) dois[d] = ev;
      var a = normArxiv(c.arxivId || ev.arxivId);
      if (a) arxivs[a] = ev;
      if (ev.uri || ev.url) {
        uris[String(ev.uri || ev.url).toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '')] = ev;
      }
    });
    var refs = [], unknownRefs = [];
    var refRe = /[\[【]\s*E\s*(\d+)\s*[\]】]/g, m;
    while ((m = refRe.exec(src)) !== null) {
      var id = 'E' + m[1];
      refs.push(id);
      if (!ids[id] && unknownRefs.indexOf(id) < 0) unknownRefs.push(id);
    }
    var unmatchedDois = [];
    var doiRe = /\b10\.\d{4,9}\/[^\s，。；、）)\]"'<>]+/g;
    while ((m = doiRe.exec(src)) !== null) {
      var d2 = normDoi(m[0]).replace(/[.,;:]+$/, '');
      if (d2 && !dois[d2] && unmatchedDois.indexOf(d2) < 0) unmatchedDois.push(d2);
    }
    var cleaned = src.replace(doiRe, ' ');
    var unmatchedArxivIds = [];
    var arxRe = /\b(?:arXiv[:\s]*)?(\d{4}\.\d{4,5}(?:v\d+)?)\b/g;
    while ((m = arxRe.exec(cleaned)) !== null) {
      var a2 = normArxiv(m[1]);
      if (a2 && !arxivs[a2] && unmatchedArxivIds.indexOf(a2) < 0) unmatchedArxivIds.push(a2);
    }
    var unmatchedUrls = [];
    var urlRe = /https?:\/\/[^\s)）"'，。；]+/g;
    while ((m = urlRe.exec(src)) !== null) {
      var u = String(m[0]).toLowerCase().replace(/[.,;]+$/, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
      if (uris[u]) continue;
      var ud = uriDoiOf(u), ua = uriArxivOf(u);
      if (ud && dois[ud]) continue;
      if (ua && arxivs[ua]) continue;
      if (unmatchedUrls.indexOf(u) < 0) unmatchedUrls.push(u);
    }
    var verifiedEvidence = (evidence || []).filter(function (ev) {
      return ev && ev.verification && ev.verification.state === 'verified';
    }).length;
    var unverifiedEvidence = (evidence || []).filter(function (ev) {
      return ev && (!ev.verification || ev.verification.state !== 'verified');
    }).length;
    return {
      total: refs.length,
      refs: refs,
      unknownRefs: unknownRefs,
      unmatchedDois: unmatchedDois,
      unmatchedArxivIds: unmatchedArxivIds,
      unmatchedUrls: unmatchedUrls,
      verifiedEvidence: verifiedEvidence,
      unverifiedEvidence: unverifiedEvidence
    };
  }

  function verificationLabel(state) {
    return VERIFY_LABEL[state] || VERIFY_LABEL.unverified;
  }

  function hostOf(uri) {
    var m = String(uri || '').match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function makeEvidence(input) {
    input = input || {};
    if (!input.sourceId) throw new Error('Evidence 缺少 sourceId');
    if (!input.sourceType) throw new Error('Evidence 缺少 sourceType');
    var retrievedAt = input.retrievedAt || nowIso();
    var uri = input.uri || '';
    var evidenceId = input.evidenceId || ('ev_' + shortHash({
      sourceId: input.sourceId,
      uri: uri,
      title: input.title || '',
      publishedAt: input.publishedAt || ''
    }));
    var out = {
      evidenceId: evidenceId,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      title: input.title || '',
      uri: uri,
      retrievedAt: retrievedAt,
      publishedAt: input.publishedAt == null ? null : input.publishedAt,
      content: input.content == null ? {} : input.content,
      contentLevel: input.contentLevel || (input.content && input.content.contentLevel) || '',
      claimRefs: Array.isArray(input.claimRefs) ? input.claimRefs.slice() : [],
      trust: input.trust || { level: 'unknown', score: 0, basis: '未评估' },
      provenance: input.provenance || {},
      abstractOnly: !!input.abstractOnly,
      verification: null
    };
    out.verification = normalizeVerification(input.verification, out, input.verifyOpts || null);
    return out;
  }

  function trustForPaper(item) {
    var doi = normDoi(item.doi);
    var preprint = item.version === 'preprint';
    if (doi && !preprint) return { level: 'high', score: 0.85, basis: '有 DOI 的正式发表论文元数据' };
    if (preprint) return { level: 'medium', score: 0.6, basis: '预印本（未经同行评审）' };
    return { level: 'medium', score: 0.55, basis: '论文元数据，无 DOI' };
  }

  function fromSourceItem(item, meta) {
    if (!item || (!item.url && (!item.title || !item.host))) return null;
    meta = meta || {};
    var doi = normDoi(item.doi);
    var uri = item.url || (doi ? 'https://doi.org/' + doi : '');
    var sourceId = doi ? ('src_doi_' + doi)
      : (item.host ? ('src_' + item.host) : 'src_' + (meta.tool || 'sources'));
    var type = item.sourceType || 'encyclopedia';
    var trust;
    if (type === 'paper') trust = trustForPaper(item);
    else if (type === 'encyclopedia') trust = { level: 'medium', score: 0.65, basis: '百科词条，可追溯但非原始文献' };
    else if (type === 'database') trust = { level: 'high', score: 0.85, basis: '数据库条目' };
    else if (type === 'image') trust = { level: 'low', score: 0.5, basis: '影像发布，非定量数据' };
    else trust = { level: 'low', score: 0.4, basis: '来源类型未分类' };

    var arxivId = (item.extra && (item.extra.arxivId || item.extra.arxiv)) || '';
    return makeEvidence({
      sourceId: sourceId,
      sourceType: type,
      title: item.title || '',
      uri: uri,
      retrievedAt: meta.retrievedAt || nowIso(),
      publishedAt: item.date || null,
      abstractOnly: type === 'paper',
      content: {
        excerpt: item.excerpt || item.snippet || '',
        snippet: item.snippet || '',
        authors: Array.isArray(item.authors) ? item.authors.slice(0, 8) : [],
        doi: doi,
        arxivId: arxivId || '',
        pdfUrl: (item.extra && item.extra.pdfUrl) || '',
        venue: (item.extra && item.extra.venue) || item.venue || '',
        dateKind: item.dateKind || null,
        version: item.version || '',
        section: (item.extra && item.extra.section) || item.section || '',
        pageStart: item.extra && item.extra.pageStart != null ? item.extra.pageStart
          : (item.pageStart == null ? null : item.pageStart),
        pageEnd: item.extra && item.extra.pageEnd != null ? item.extra.pageEnd
          : (item.pageEnd == null ? null : item.pageEnd),
        uncertainty: item.uncertainty || ''
      },
      trust: trust,
      provenance: {
        tool: meta.tool || 'evidence',
        query: meta.query || '',
        direction: meta.direction || '',
        host: item.host || hostOf(uri),
        service: item.host || '',
        retrievedAt: meta.retrievedAt || nowIso(),
        abstractOnly: type === 'paper',
        raw: {
          dateKind: item.dateKind || null,
          version: item.version || '',
          citedBy: item.extra && item.extra.citedBy,
          venue: item.extra && item.extra.venue,
          pdfUrl: item.extra && item.extra.pdfUrl,
          arxivId: arxivId || ''
        }
      }
    });
  }

  function fromSimbad(info, meta) {
    if (!info || !info.id) return null;
    meta = meta || {};
    var retrievedAt = meta.retrievedAt || nowIso();
    var uri = meta.uri || ('https://simbad.cds.unistra.fr/simbad/sim-id?Ident=' + encodeURIComponent(info.id));
    var distanceLy = null;
    if (info.plx && info.plx > 0) distanceLy = Math.round((1000 / info.plx) * 3.26156);
    return makeEvidence({
      sourceId: 'src_simbad',
      sourceType: 'database',
      title: info.id,
      uri: uri,
      retrievedAt: retrievedAt,
      publishedAt: null,
      content: {
        mainId: info.id,
        ra: info.ra,
        dec: info.dec,
        otype: info.otype || '',
        plx: info.plx,
        vmag: info.vmag,
        distanceLy: distanceLy
      },
      trust: { level: 'high', score: 0.95, basis: 'SIMBAD 权威星表（TAP basic/ident）' },
      provenance: {
        tool: 'simbad.tap',
        service: 'SIMBAD TAP',
        host: meta.host || 'simbad.u-strasbg.fr',
        query: meta.query || info.id,
        from: meta.from || 'network',
        retrievedAt: retrievedAt
      }
    });
  }

  function fromFits(product, meta) {
    if (!product || product.ok !== true) return null;
    meta = meta || {};
    var primary = (product.hdus || [])[0] || {};
    var dataHdu = (product.hdus || []).filter(function (h) { return h.stats || h.table; })[0] || primary;
    var dh = dataHdu.header || {};
    var fileHash = product.fileHash || shortHash({
      name: meta.fileName || product.fileName || '',
      size: meta.size || product.fileSize || 0,
      hdus: (product.hdus || []).length
    }, 20);
    var fileName = meta.fileName || product.fileName || 'FITS';
    var retrievedAt = meta.retrievedAt || nowIso();
    return makeEvidence({
      sourceId: 'src_fits_' + fileHash,
      sourceType: 'observation',
      title: fileName,
      uri: 'local:' + fileName,
      retrievedAt: retrievedAt,
      publishedAt: dh.DATE_OBS || null,
      content: {
        fileName: fileName,
        fileSize: product.fileSize || meta.size || 0,
        hduCount: (product.hdus || []).length,
        imageHdus: product.imageCount || 0,
        tableHdus: product.tableCount || 0,
        dataHdu: dataHdu.index,
        primary: {
          naxis: dh.NAXIS == null ? primary.NAXIS : dh.NAXIS,
          naxis1: dh.NAXIS1,
          naxis2: dh.NAXIS2,
          bitpix: dh.BITPIX,
          bunit: dh.BUNIT || ''
        },
        stats: dataHdu.stats || null,
        object: dh.OBJECT || primary.OBJECT || '',
        telescope: dh.TELESCOP || primary.TELESCOP || '',
        instrument: dh.INSTRUME || primary.INSTRUME || ''
      },
      trust: { level: 'high', score: 0.9, basis: '本地 FITS 文件头与数据统计，可复算' },
      provenance: {
        tool: 'fits.parse',
        fileName: fileName,
        fileSize: product.fileSize || 0,
        fileHash: fileHash,
        parsedAt: product.parsedAt || retrievedAt,
        warnings: (product.warnings || []).slice(),
        localOnly: true
      }
    });
  }

  function fromCalc(calc, meta) {
    if (!calc || typeof calc.value !== 'number') return null;
    meta = meta || {};
    var retrievedAt = meta.retrievedAt || nowIso();
    return makeEvidence({
      sourceId: 'src_calc_' + (calc.method || 'kepler'),
      sourceType: 'calculation',
      title: (meta.title || calc.method || '本地计算') + ' · ' + calc.target,
      uri: meta.uri || '',
      retrievedAt: retrievedAt,
      publishedAt: calc.computedAt || retrievedAt,
      content: {
        target: calc.target,
        value: calc.value,
        unit: calc.unit,
        epoch: calc.epoch,
        frame: calc.frame,
        method: calc.method,
        inputs: calc.inputs
      },
      trust: { level: 'high', score: 0.9, basis: '本地可复算（epoch/frame/inputs 齐全）' },
      provenance: {
        tool: meta.tool || 'kepler.ephemeris',
        target: calc.target,
        computedAt: calc.computedAt || retrievedAt,
        epoch: calc.epoch,
        frame: calc.frame
      }
    });
  }

  function dedupe(list) {
    var out = [], dup = [], seen = {};
    (list || []).forEach(function (ev) {
      if (!ev) return;
      var key = evidenceKey(ev);
      if (seen[key]) { dup.push({ kept: seen[key], dropped: ev.evidenceId || '', key: key }); return; }
      seen[key] = ev.evidenceId || key;
      out.push(ev);
    });
    return { evidence: out, duplicates: dup };
  }

  function normTitle(t) {
    return String(t == null ? '' : t).toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function evidenceKey(ev) {
    var doi = normDoi(ev && ev.content && ev.content.doi);
    var level = ev && (ev.contentLevel || (ev.content && ev.content.contentLevel) || (ev.abstractOnly ? 'abstract' : ''));
    if (doi) return 'doi:' + doi + (level ? '|' + level : '') +
      (ev && ev.content && ev.content.chunkId ? '|' + ev.content.chunkId : '');
    var title = normTitle(ev && ev.title);
    var isPaper = ev && (ev.sourceType === 'paper' || (ev.content && ev.content.version));
    if (isPaper && title.length >= 12) {
      var authors = ev.content && Array.isArray(ev.content.authors) ? ev.content.authors : [];
      var first = authors.length ? String(authors[0]).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') : '';
      var year = String(ev.publishedAt || '').slice(0, 4);
      return 'title:' + title + '|' + year + '|' + first + (level ? '|' + level : '') +
        (ev && ev.content && ev.content.chunkId ? '|' + ev.content.chunkId : '');
    }
    var uri = String(ev && ev.uri || '').trim().toLowerCase()
      .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    if (uri) return 'uri:' + uri + (level ? '|' + level : '') +
      (ev && ev.content && ev.content.chunkId ? '|' + ev.content.chunkId : '');
    return 'id:' + (ev && ev.evidenceId || '') + '|' + shortHash(ev && (ev.content || ev.title) || '');
  }

  function independentSources(evidence) {
    var seen = {}, out = [];
    (evidence || []).forEach(function (ev) {
      var sid = ev && ev.sourceId;
      if (!sid || seen[sid]) return;
      seen[sid] = 1;
      out.push(sid);
    });
    return out;
  }

  root.AstroEvidence = {
    make: makeEvidence,
    fromSourceItem: fromSourceItem,
    fromSimbad: fromSimbad,
    fromFits: fromFits,
    fromCalc: fromCalc,
    dedupe: dedupe,
    evidenceKey: evidenceKey,
    normTitle: normTitle,
    independentSources: independentSources,
    normDoi: normDoi,
    normArxiv: normArxiv,
    verify: verify,
    verifyAll: verifyAll,
    verificationOf: verificationOf,
    normalizeVerification: normalizeVerification,
    auditCitations: auditCitations,
    verificationLabel: verificationLabel,
    VERIFY_STATES: VERIFY_STATES,
    VERIFY_LABEL: VERIFY_LABEL,
    hostOf: hostOf,
    version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : global);
