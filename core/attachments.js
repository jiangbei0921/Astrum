/* ASTRUM · 附件处理层
 *
 * 目标：接受任意类型的文件，但按类型给出**如实**的处理结果，不假装能读懂一切。
 *
 *   image  png/jpg/webp/gif/bmp → 生成预览；若所选来源支持视觉，作为多模态输入
 *   text   txt/md/csv/tsv/json/log/py/js 等 → 读取文本（有上限），作为参考材料
 *   fits   .fits/.fit/.fts → 解析头信息（目标、赤经赤纬、曝光、望远镜、滤镜）
 *                            → 若能解出 RA/Dec，可直接接管星历计算
 *   other  其余二进制 → 只显示名称/大小/类型，明确标注「未解析」
 *
 * 所有解析都在本机完成，不上传任何服务器；只有当你选择云端模型时，
 * 其摘要或图像才会随请求发出，这一点在界面上如实标注。
 */
(function (root) {
  'use strict';

  var IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp|avif)$/i;
  var IMAGE_MIME = /^image\//;
  var TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|log|ya?ml|xml|html?|ini|cfg|py|js|ts|css|sh|tex|bib)$/i;
  var TEXT_MIME = /^text\/|^application\/(json|xml|x-yaml)/;
  var FITS_EXT = /\.(fits?|fts)$/i;
  var PDF_EXT = /\.pdf$/i;

  /* 上限：单文件读取量与总附件数，避免把浏览器内存打满 */
  var LIMITS = {
    maxFiles: 8,
    textChars: 12000,      /* 单文件最多读这么多字符 */
    promptChars: 4000,     /* 送模型时每个文件最多带这么多字符 */
    fitsBytes: 28800,      /* FITS 头最多读 10 个 2880 字节块 */
    fitsFullBytes: 8 * 1024 * 1024,  /* D3：完整解析最多读 8 MB（多 HDU + 统计） */
    pdfBytes: 12 * 1024 * 1024,      /* 本机论文 PDF 上限，与远程全文一致 */
    imageBytes: 6 * 1024 * 1024,
    previewSize: 240
  };

  var seq = 0;

  function fmtSize(n) {
    if (!isFinite(n)) return '—';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function extOf(name) {
    var m = String(name || '').match(/(\.[^.\/\\]+)$/);
    return m ? m[1].toLowerCase() : '';
  }

  function extKindOf(name) {
    name = name || '';
    if (FITS_EXT.test(name)) return 'fits';
    if (PDF_EXT.test(name)) return 'paper';
    if (IMAGE_EXT.test(name)) return 'image';
    if (TEXT_EXT.test(name)) return 'text';
    return '';
  }

  function mimeKindOf(type) {
    type = String(type || '').toLowerCase();
    if (!type) return '';
    if (/^application\/pdf/.test(type)) return 'paper';
    if (IMAGE_MIME.test(type)) return 'image';
    if (TEXT_MIME.test(type)) return 'text';
    return '';
  }

  /* 扩展名与 MIME 都属于已知类别且互相冲突时，拒绝解析。
   * 例如 look.txt 声明 image/png，或 photo.png 声明 text/plain：
   * 两边都不可信，不能按其中一边“猜”出一个可执行路径。 */
  function kindOf(file) {
    var ext = extKindOf(file.name || '');
    var mime = mimeKindOf(file.type || '');
    if (ext === 'fits' || ext === 'paper') return ext; /* 容器格式以扩展名为准，解析器还会校验字节头 */
    if (ext && mime && ext !== mime) return 'mismatch';
    return ext || mime || 'other';
  }

  /* ---------- FITS 头解析 ----------
   * FITS 头由若干 2880 字节块组成，每块 36 张 80 字符卡片。
   * 卡片格式：1-8 关键字，9-10 通常为 '= '，其后为值。
   * 这是纯文本层面就能读的部分，不需要解码像素数据 —— 我们只取头，不碰图像。
   */
  function parseFitsHeader(buf) {
    var bytes = new Uint8Array(buf);
    var text = '';
    for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);

    if (!/^SIMPLE\s*=\s*T/i.test(text.slice(0, 80))) return null;

    var header = {};
    var broken = false;
    for (var off = 0; off + 80 <= text.length; off += 80) {
      var card = text.slice(off, off + 80);
      var key = card.slice(0, 8).trim();
      if (key === 'END') { broken = true; break; }
      if (!key || card[8] !== '=') continue;
      var raw = card.slice(10);
      var val = raw.trim();
      /* 去掉行尾注释：值后的 / 之后不是字符串的一部分 */
      var q = val.charAt(0);
      if (q === "'") {
        var end = val.indexOf("'", 1);
        val = end > 0 ? val.slice(1, end).trim() : val.slice(1).trim();
      } else {
        var slash = val.indexOf('/');
        if (slash > 0) val = val.slice(0, slash).trim();
        if (val === 'T') val = true;
        else if (val === 'F') val = false;
        else if (/^[+-]?[\d.]+(?:E[+-]?\d+)?$/i.test(val)) {
          var n = parseFloat(val);
          if (isFinite(n)) val = n;
        }
      }
      header[key] = val;
    }
    return broken || Object.keys(header).length ? header : null;
  }

  /* 把 FITS 的 'HH:MM:SS.S' 或 'HH MM SS.S' 转成小时数 */
  function sexToHours(s) {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    var parts = String(s).trim().split(/[:\s]+/).map(parseFloat);
    if (!parts.length || parts.some(function (x) { return !isFinite(x); })) return null;
    return parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600;
  }

  /* 把 FITS 的 'DD:MM:SS' 转成度数（带符号） */
  function sexToDeg(s) {
    if (s == null) return null;
    if (typeof s === 'number') return s;
    var str = String(s).trim();
    var sign = /^-/.test(str) ? -1 : 1;
    var parts = str.replace(/^[-+]/, '').split(/[:\s]+/).map(parseFloat);
    if (!parts.length || parts.some(function (x) { return !isFinite(x); })) return null;
    return sign * (parts[0] + (parts[1] || 0) / 60 + (parts[2] || 0) / 3600);
  }

  function summarizeFits(h) {
    var ra = h.RA != null ? sexToHours(h.RA)
      : (h.RA_DEG != null ? (typeof h.RA_DEG === 'number' ? h.RA_DEG / 15 : sexToHours(h.RA_DEG)) : null);
    var dec = h.DEC != null ? sexToDeg(h.DEC)
      : (h.DEC_DEG != null ? sexToDeg(h.DEC_DEG) : null);

    var facts = [];
    if (h.OBJECT) facts.push(['目标', String(h.OBJECT)]);
    if (ra != null && dec != null) {
      facts.push(['坐标 (J2000)', String(h.RA || ra.toFixed(5)) + ' / ' + String(h.DEC || dec.toFixed(5))]);
    }
    if (h.DATE_OBS) facts.push(['观测时刻', String(h.DATE_OBS) + (h.TIME_OBS ? ' ' + h.TIME_OBS : '')]);
    if (h.EXPTIME != null) facts.push(['曝光', h.EXPTIME + ' s']);
    if (h.TELESCOP) facts.push(['望远镜', String(h.TELESCOP)]);
    if (h.INSTRUME) facts.push(['相机/仪器', String(h.INSTRUME)]);
    if (h.FILTER) facts.push(['滤镜', String(h.FILTER)]);
    if (h.NAXIS1 && h.NAXIS2) facts.push(['尺寸', h.NAXIS1 + ' × ' + h.NAXIS2 + ' px']);
    if (h.BITPIX != null) facts.push(['位深', 'BITPIX ' + h.BITPIX]);
    if (h.SITELAT || h.SITELONG) facts.push(['站点', String(h.SITELAT || '?') + ' / ' + String(h.SITELONG || '?')]);

    return {
      ra: ra, dec: dec, decDeg: dec,
      facts: facts,
      hasCoords: ra != null && dec != null
    };
  }

  /* ---------- 单个文件的处理 ---------- */
  function readAsText(file, limit) {
    return new Promise(function (resolve) {
      var rd = new FileReader();
      rd.onload = function () {
        var t = String(rd.result || '');
        resolve(t.length > limit ? t.slice(0, limit) : t);
      };
      rd.onerror = function () { resolve(''); };
      rd.readAsText(file.slice(0, Math.max(limit * 4, 65536)));
    });
  }

  /* 声称是文本、实际是二进制/错误编码时，明确失败，不把乱码当正文。 */
  function looksBinaryText(t) {
    if (!t || t.length < 8) return false;
    var bad = 0;
    for (var i = 0; i < t.length; i++) {
      var c = t.charCodeAt(i);
      if (c === 0xFFFD || c < 9 || (c > 13 && c < 32)) bad++;
    }
    return bad / t.length > 0.15;
  }

  function readSlice(file, bytes) {
    return new Promise(function (resolve) {
      var rd = new FileReader();
      rd.onload = function () { resolve(rd.result); };
      rd.onerror = function () { resolve(null); };
      rd.readAsArrayBuffer(file.slice(0, bytes));
    });
  }

  function readDataUrl(file) {
    return new Promise(function (resolve) {
      var rd = new FileReader();
      rd.onload = function () { resolve(String(rd.result || '')); };
      rd.onerror = function () { resolve(''); };
      rd.readAsDataURL(file);
    });
  }

  /* 生成缩略图，避免把原图直接塞进 DOM 造成内存膨胀 */
  function makeThumb(file) {
    return readDataUrl(file).then(function (url) {
      return new Promise(function (resolve) {
        if (!url) return resolve({ thumb: '', full: '' });
        var img = new Image();
        img.onload = function () {
          var scale = Math.min(1, LIMITS.previewSize / Math.max(img.width, img.height));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * scale));
          cv.height = Math.max(1, Math.round(img.height * scale));
          try {
            cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
            resolve({ thumb: cv.toDataURL('image/jpeg', 0.82), full: url, w: img.width, h: img.height });
          } catch (e) {
            resolve({ thumb: url, full: url, w: img.width, h: img.height });
          }
        };
        img.onerror = function () { resolve({ thumb: '', full: url }); };
        img.src = url;
      });
    });
  }

  function process(file) {
    var kind = kindOf(file);
    var item = {
      id: 'F' + (++seq),
      name: file.name || '未命名',
      size: file.size || 0,
      sizeText: fmtSize(file.size || 0),
      mime: file.type || '',
      ext: extOf(file.name),
      kind: kind,
      status: 'parsing',
      note: '',
      text: '',
      thumb: '',
      full: '',
      width: 0, height: 0,
      fits: null,
      paper: null
    };

    if (kind === 'mismatch') {
      item.status = 'unparsed';
      item.note = '扩展名与 MIME 类型不一致，已拒绝解析';
      return Promise.resolve(item);
    }

    if (kind === 'image') {
      if (item.size > LIMITS.imageBytes) {
        item.status = 'too-large';
        item.note = '图片超过 ' + fmtSize(LIMITS.imageBytes) + '，仅记录信息，未做预览';
        return Promise.resolve(item);
      }
      return makeThumb(file).then(function (r) {
        item.thumb = r.thumb; item.full = r.full;
        item.width = r.w || 0; item.height = r.h || 0;
        item.status = r.thumb ? 'ready' : 'error';
        if (!r.thumb) item.note = '图片无法预览';
        return item;
      });
    }

    if (kind === 'fits') {
      var readBytes = Math.min(file.size || LIMITS.fitsFullBytes, LIMITS.fitsFullBytes);
      return readSlice(file, readBytes).then(function (buf) {
        if (!buf) { item.status = 'error'; item.note = '读取失败'; return item; }
        var h = null;
        var product = null;
        try {
          if (root.AstroFits && typeof root.AstroFits.parse === 'function') {
            product = root.AstroFits.parse({ bytes: new Uint8Array(buf), fileName: item.name });
          }
          if (product && product.ok && product.hdus && product.hdus[0]) {
            h = product.hdus[0].header;
          }
          if (!h) h = parseFitsHeader(buf);
        } catch (e) { h = parseFitsHeader(buf); product = null; }
        if (!h) {
          item.status = 'error';
          item.note = '不是有效的 FITS 头（缺少 SIMPLE = T）';
          return item;
        }
        var s = summarizeFits(h);
        var stats = (product && product.hdus || []).map(function (x) {
          return {
            index: x.index, type: x.type,
            naxis1: x.header.NAXIS1, naxis2: x.header.NAXIS2,
            bitpix: x.header.BITPIX, stats: x.stats || null,
            table: x.table ? { rows: x.table.rows, fields: x.table.fields } : null,
            wcs: x.wcs || null
          };
        });
        var truncated = (file.size || 0) > readBytes;
        var warnings = (product && product.warnings || []).slice();
        if (truncated) warnings.push('文件超过 ' + fmtSize(readBytes) + '，仅解析前 ' + fmtSize(readBytes));
        item.fits = {
          header: h,
          facts: s.facts,
          ra: s.ra,
          dec: s.dec,
          hasCoords: s.hasCoords,
          hdus: stats,
          warnings: warnings,
          file: { name: item.name, size: item.size, sizeText: item.sizeText, fileHash: product && product.fileHash || '' }
        };
        item.status = s.hasCoords ? 'ready' : 'partial';
        item.note = s.hasCoords
          ? '已解析头信息，可用于定位' + (stats.length > 1 ? ' · ' + stats.length + ' HDU' : '')
          : (s.facts.length ? '已解析头信息（无坐标）' : '头信息里没有可用字段');
        return item;
      });
    }

    if (kind === 'paper') {
      if ((file.size || 0) > LIMITS.pdfBytes) {
        item.status = 'too-large';
        item.note = 'PDF 超过 ' + fmtSize(LIMITS.pdfBytes) + '，已拒绝解析';
        return Promise.resolve(item);
      }
      return readSlice(file, file.size || 0).then(function (buf) {
        if (!buf) { item.status = 'error'; item.note = '读取失败'; return item; }
        if (!root.AstroPaperAttachment || typeof root.AstroPaperAttachment.parseBytes !== 'function') {
          item.status = 'error'; item.note = 'PDF 解析模块未加载'; return item;
        }
        return root.AstroPaperAttachment.parseBytes(new Uint8Array(buf), {
          fileName: item.name, maxBytes: LIMITS.pdfBytes
        }).then(function (r) {
          if (!r || !r.ok) {
            item.status = 'error';
            item.note = (r && r.reason) || 'PDF 解析失败';
            /* OCR 能力边界必须明确：本项目只读原生文本层，不宣称支持扫描件。 */
            if (r && (r.ocrRequired || r.detailCode === 'pdf_ocr_required') &&
              !/OCR/i.test(item.note)) {
              item.note += '；本项目不提供 OCR';
            }
            item.paper = r || null;
            return item;
          }
          item.paper = r;
          item.status = 'ready';
          item.note = '已解析 ' + (r.pageCount || '?') + ' 页 · ' +
            (r.sections || []).length + ' 章节 · ' + (r.chunks || []).length + ' 块';
          return item;
        });
      });
    }

    if (kind === 'text') {
      return readAsText(file, LIMITS.textChars).then(function (t) {
        item.text = t;
        if (!t) { item.status = 'error'; item.note = '文本为空或编码无法识别'; return item; }
        if (looksBinaryText(t)) {
          item.status = 'error';
          item.text = '';
          item.note = '文本编码异常或包含二进制内容，未作为正文';
          return item;
        }
        item.status = 'ready';
        item.note = '已读取 ' + t.length + ' 字';
        return item;
      });
    }

    item.status = 'unparsed';
    item.note = '该类型暂不解析，仅作记录';
    return Promise.resolve(item);
  }

  /* ---------- 汇总为可注入答案的结构 ---------- */
  function brief(items) {
    return (items || []).map(function (it) {
      var o = { id: it.id, name: it.name, kind: it.kind, size: it.sizeText };
      if (it.kind === 'image') { o.width = it.width; o.height = it.height; o.thumb = it.thumb; }
      if (it.kind === 'text') o.chars = it.text.length;
      if (it.kind === 'paper' && it.paper && it.paper.ok) {
        o.pageCount = it.paper.pageCount;
        o.sections = (it.paper.sections || []).map(function (s) { return s.name; });
        o.chunks = (it.paper.chunks || []).length;
        o.fulltextAvailable = true;
      }
      if (it.kind === 'fits') {
        o.facts = it.fits.facts;
        o.hasCoords = it.fits.hasCoords;
      }
      o.status = it.status;
      o.note = it.note;
      return o;
    });
  }

  /* 送模型的文本参考材料：只取文本类，且每份截断 */
  function forPrompt(items) {
    var out = [];
    (items || []).forEach(function (it) {
      if (it.kind === 'text' && it.text && it.status === 'ready') {
        out.push({
          name: it.name,
          excerpt: it.text.replace(/\s+/g, ' ').slice(0, LIMITS.promptChars)
        });
        return;
      }
      if (it.kind === 'paper' && it.paper && it.paper.ok) {
        var text = (it.paper.chunks || []).map(function (c) {
          return '[' + (c.section || '正文') + '] ' + c.content;
        }).join('\n').replace(/\s+/g, ' ');
        out.push({
          name: it.name,
          excerpt: text.slice(0, LIMITS.promptChars),
          pageCount: it.paper.pageCount,
          sections: (it.paper.sections || []).map(function (s) { return s.name; })
        });
      }
    });
    return out;
  }

  /* 送模型的图像：只取图片，且只给支持视觉的来源 */
  function imagesForPrompt(items) {
    return (items || []).filter(function (it) {
      return it.kind === 'image' && it.full;
    }).map(function (it) {
      return { name: it.name, dataUrl: it.full, mime: it.mime || 'image/png' };
    });
  }

  root.Attachments = {
    process: process,
    brief: brief,
    forPrompt: forPrompt,
    imagesForPrompt: imagesForPrompt,
    parseFitsHeader: parseFitsHeader,
    sexToHours: sexToHours,
    sexToDeg: sexToDeg,
    kindOf: kindOf,
    fmtSize: fmtSize,
    LIMITS: LIMITS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
