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

  /* 上限：单文件读取量与总附件数，避免把浏览器内存打满 */
  var LIMITS = {
    maxFiles: 8,
    textChars: 12000,      /* 单文件最多读这么多字符 */
    promptChars: 4000,     /* 送模型时每个文件最多带这么多字符 */
    fitsBytes: 28800,      /* FITS 头最多读 10 个 2880 字节块 */
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

  function kindOf(file) {
    var name = file.name || '';
    if (FITS_EXT.test(name)) return 'fits';
    if (IMAGE_MIME.test(file.type || '') || IMAGE_EXT.test(name)) return 'image';
    if (TEXT_MIME.test(file.type || '') || TEXT_EXT.test(name)) return 'text';
    return 'other';
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
      fits: null
    };

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
      return readSlice(file, LIMITS.fitsBytes).then(function (buf) {
        if (!buf) { item.status = 'error'; item.note = '读取失败'; return item; }
        var h = null;
        try { h = parseFitsHeader(buf); } catch (e) { h = null; }
        if (!h) {
          item.status = 'error';
          item.note = '不是有效的 FITS 头（缺少 SIMPLE = T）';
          return item;
        }
        var s = summarizeFits(h);
        item.fits = { header: h, facts: s.facts, ra: s.ra, dec: s.dec, hasCoords: s.hasCoords };
        item.status = s.hasCoords ? 'ready' : 'partial';
        item.note = s.hasCoords
          ? '已解析头信息，可用于定位'
          : (s.facts.length ? '已解析头信息（无坐标）' : '头信息里没有可用字段');
        return item;
      });
    }

    if (kind === 'text') {
      return readAsText(file, LIMITS.textChars).then(function (t) {
        item.text = t;
        if (!t) { item.status = 'error'; item.note = '文本为空或编码无法识别'; return item; }
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
    return (items || []).filter(function (it) {
      return it.kind === 'text' && it.text && it.status === 'ready';
    }).map(function (it) {
      return {
        name: it.name,
        excerpt: it.text.replace(/\s+/g, ' ').slice(0, LIMITS.promptChars)
      };
    });
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
