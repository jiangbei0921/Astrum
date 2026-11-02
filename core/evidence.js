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
    return {
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
      abstractOnly: !!input.abstractOnly
    };
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
        dateKind: item.dateKind || null,
        version: item.version || '',
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
    hostOf: hostOf,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
