/* ASTRUM · 附件 → Evidence（V1.2）
 *
 * 只把已经在本机解析成功的 FITS 附件转成 observation Evidence。
 * 图片/文本/PDF/未知格式不生成科学证据，只返回明确的不支持说明。
 * 不读取文件、不重新解析、不上传任何内容。
 */
(function (root) {
  'use strict';

  function hashShort(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value)).slice(0, 20);
    return String(value == null ? '' : value).length.toString(36);
  }

  function fromFitsItem(item) {
    if (!item || item.kind !== 'fits' || !item.fits) return null;
    var f = item.fits;
    var hdus = f.hdus || [];
    var primary = hdus[0] || {};
    var dataHdu = hdus.filter(function (h) { return h.stats || h.table; })[0] || primary;
    var header = f.header || {};
    var file = f.file || {};
    var fileHash = file.fileHash || hashShort({ name: item.name, size: item.size, hdus: hdus.length });
    var stats = dataHdu.stats || null;
    var E = root.AstroEvidence;
    if (!E || !E.make) return null;
    return E.make({
      sourceId: 'src_fits_' + fileHash,
      sourceType: 'observation',
      title: item.name,
      uri: 'local:' + item.name,
      retrievedAt: new Date().toISOString(),
      publishedAt: header.DATE_OBS || null,
      content: {
        fileName: item.name,
        fileSize: item.size || 0,
        hduCount: hdus.length,
        imageHdus: hdus.filter(function (h) { return h.stats; }).length,
        tableHdus: hdus.filter(function (h) { return h.table; }).length,
        dataHdu: dataHdu.index,
        primary: {
          naxis: dataHdu.naxis1 != null ? 2 : header.NAXIS,
          naxis1: dataHdu.naxis1,
          naxis2: dataHdu.naxis2,
          bitpix: dataHdu.bitpix,
          bunit: header.BUNIT || ''
        },
        stats: stats,
        object: header.OBJECT || '',
        telescope: header.TELESCOP || '',
        instrument: header.INSTRUME || ''
      },
      trust: { level: 'high', score: 0.9, basis: '本机 FITS 文件头与数据统计，可复算' },
      provenance: {
        tool: 'attachments.fits',
        fileName: item.name,
        fileSize: item.size || 0,
        fileHash: fileHash,
        parsedAt: new Date().toISOString(),
        warnings: (f.warnings || []).slice(),
        localOnly: true
      },
      abstractOnly: false
    });
  }

  function fromPaperItem(item) {
    if (!item || item.kind !== 'paper' || !item.paper || item.paper.ok !== true) return [];
    return (item.paper.evidence || []).slice();
  }

  function fromAttachments(atts) {
    var evidence = [], gaps = [], unsupported = [];
    (atts || []).forEach(function (it) {
      if (!it) return;
      if (it.kind === 'paper') {
        var pev = fromPaperItem(it);
        if (pev.length) {
          pev.forEach(function (ev) { evidence.push(ev); });
        } else {
          unsupported.push(it.name);
          gaps.push('论文 PDF 未能提取全文证据：' + (it.name || '未命名') +
            (it.paper && it.paper.reason ? '（' + it.paper.reason + '）' : ''));
        }
      } else if (it.kind === 'fits') {
        var ev = fromFitsItem(it);
        if (ev) evidence.push(ev);
        else {
          unsupported.push(it.name);
          gaps.push('FITS 附件未能解析为可用观测证据：' + (it.name || '未命名'));
        }
      } else if (it.kind === 'image') {
        unsupported.push(it.name);
        gaps.push('图片附件不生成科学证据：' + (it.name || '未命名'));
      } else if (it.kind === 'text') {
        unsupported.push(it.name);
        gaps.push('文本附件仅作参考材料，未作为外部科学证据：' + (it.name || '未命名'));
      } else {
        unsupported.push(it.name);
        gaps.push('暂不支持解析该附件类型：' + (it.name || '未命名'));
      }
    });
    var allSupported = !!(atts && atts.length && atts.every(function (x) {
      if (!x) return false;
      if (x.kind === 'fits') return !!(x.fits && Array.isArray(x.fits.hdus) && x.fits.hdus.length);
      if (x.kind === 'paper') return !!(x.paper && x.paper.ok === true);
      return false;
    }));
    return {
      evidence: evidence,
      gaps: gaps,
      unsupported: unsupported,
      allFits: !!(atts && atts.length && atts.every(function (x) { return x && x.kind === 'fits'; })),
      allSupported: allSupported
    };
  }

  root.AstroAttachmentEvidence = {
    fromAttachments: fromAttachments,
    fromFitsItem: fromFitsItem,
    fromPaperItem: fromPaperItem,
    version: '1.5.0'
  };
})(typeof window !== 'undefined' ? window : global);
