/* ASTRUM · 轻量 PDF 文本解析（V1.3）
 *
 * 目标：纯浏览器 / 零外部运行时依赖，从公开论文 PDF 提取可追溯文本。
 * 不还原复杂版面；只提取 BT/ET 文本、章节、页码与 DOI。
 * 支持 FlateDecode 内容流与常见对象结构；失败时明确分类，不伪造全文。
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    maxBytes: 12 * 1024 * 1024,
    maxPages: 40,
    maxChars: 200000,
    maxChunks: 60,
    chunkChars: 1400,
    minChars: 120
  };

  function latin1(bytes) {
    var out = [], chunk = 4096;
    for (var i = 0; i < bytes.length; i += chunk) {
      out.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return out.join('');
  }

  async function inflate(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('no DecompressionStream');
    var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
    var buf = await new Response(stream).arrayBuffer();
    return new Uint8Array(buf);
  }

  function pdfString(s) {
    var out = '', i = 0;
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '\\') {
        var n = s.charAt(i + 1);
        if (n === 'n') { out += '\n'; i += 2; continue; }
        if (n === 'r') { out += '\r'; i += 2; continue; }
        if (n === 't') { out += '\t'; i += 2; continue; }
        if (n === 'b') { out += '\b'; i += 2; continue; }
        if (n === 'f') { out += '\f'; i += 2; continue; }
        if (n === '(' || n === ')' || n === '\\') { out += n; i += 2; continue; }
        var oct = s.slice(i + 1, i + 4).match(/^[0-7]{1,3}/);
        if (oct) { out += String.fromCharCode(parseInt(oct[0], 8)); i += 1 + oct[0].length; continue; }
        i += 2;
        continue;
      }
      out += c;
      i += 1;
    }
    return out;
  }

  function decodePdfLiteral(s) {
    if (!s) return '';
    var body = s.charAt(0) === '(' ? s.slice(1, -1) : s;
    return pdfString(body);
  }

  function decodeHex(s) {
    var hex = s.slice(1, -1).replace(/[^0-9a-f]/gi, '');
    var out = '';
    for (var i = 0; i + 1 < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
    return out;
  }

  function decodeToken(tok) {
    if (!tok) return '';
    return tok.charAt(0) === '<' ? decodeHex(tok) : decodePdfLiteral(tok);
  }

  function streamBytes(body) {
    /* 优先按 /Length 截取，避免二进制流中出现 endstream 造成提前截断。 */
    var m = body.match(/stream\r?\n/);
    if (!m) return null;
    var start = m.index + m[0].length;
    var d = dictOf(body);
    var indirect = /\/Length\s+\d+\s+\d+\s+R/.test(d);
    var lenM = d.match(/\/Length\s+(\d+)/);
    var len = (!indirect && lenM) ? Number(lenM[1]) : null;
    var end = (len && start + len <= body.length) ? start + len : body.indexOf('endstream', start);
    if (end < 0) end = body.length;
    var raw = body.slice(start, end);
    var bytes = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xFF;
    return bytes;
  }

  function dictOf(body) {
    var end = body.indexOf('stream');
    return end >= 0 ? body.slice(0, end) : body;
  }

  function refOf(dict, key) {
    var re = new RegExp('/' + key + '\\s+(\\d+)\\s+(\\d+)\\s+R');
    var m = dict.match(re);
    return m ? m[1] + ' ' + m[2] : null;
  }

  function refsOf(dict, key) {
    var arr = dict.match(new RegExp('/' + key + '\\s*\\[([^\\]]*)\\]'));
    if (arr) {
      var out = [], re = /(\d+)\s+(\d+)\s+R/g, m;
      while ((m = re.exec(arr[1]))) out.push(m[1] + ' ' + m[2]);
      return out;
    }
    var one = refOf(dict, key);
    return one ? [one] : [];
  }

  function isFlate(dict) {
    return /\/FlateDecode/.test(dict);
  }

  async function objectMap(bytes) {
    var text = latin1(bytes);
    var map = {}, m, re = /(\d+)\s+(\d+)\s+obj\s*([\s\S]*?)\s*endobj/g;
    while ((m = re.exec(text))) {
      map[m[1] + ' ' + m[2]] = { body: m[3], order: map.__order = (map.__order || 0) + 1 };
    }
    delete map.__order;
    /* 对象流（PDF 1.5+）：解压后追加内部对象 */
    var keys = Object.keys(map);
    for (var i = 0; i < keys.length && i < 400; i++) {
      var o = map[keys[i]];
      if (!/\/Type\s*\/ObjStm/.test(o.body)) continue;
      var s = streamBytes(o.body, text);
      if (!s) continue;
      try {
        var dec = isFlate(o.body) ? await inflate(s) : s;
        var t = latin1(dec);
        var n = Number((o.body.match(/\/N\s+(\d+)/) || [])[1] || 0);
        var first = Number((o.body.match(/\/First\s+(\d+)/) || [])[1] || 0);
        var pairs = t.slice(0, first).trim().split(/\s+/);
        for (var j = 0; j < n; j++) {
          var num = pairs[j * 2], off = Number(pairs[j * 2 + 1]);
          if (!num || !isFinite(off)) continue;
          var nextOff = Number(pairs[j * 2 + 3]);
          var end = isNaN(nextOff) ? t.length : first + nextOff;
          map[num + ' 0'] = { body: t.slice(first + off, end), order: 100000 + j, fromObjectStream: true };
        }
      } catch (e) { /* 对象流失败时保留其它对象 */ }
    }
    return { map: map, text: text };
  }

  function pageRefs(map) {
    var catalog = null, key;
    for (key in map) if (/\/Type\s*\/Catalog/.test(map[key].body)) { catalog = map[key]; break; }
    var out = [];
    var seen = {};
    function walk(id) {
      if (!id || seen[id]) return;
      seen[id] = 1;
      var o = map[id];
      if (!o) return;
      if (/\/Type\s*\/Page\b/.test(o.body) && !/\/Type\s*\/Pages/.test(o.body)) { out.push(id); return; }
      refsOf(o.body, 'Kids').forEach(walk);
    }
    if (catalog) walk(refOf(catalog.body, 'Pages'));
    if (!out.length) {
      Object.keys(map).forEach(function (k) {
        if (/\/Type\s*\/Page\b/.test(map[k].body) && !/\/Type\s*\/Pages/.test(map[k].body)) out.push(k);
      });
    }
    return out;
  }

  function extractText(content) {
    var s = String(content || '').replace(/\r/g, '\n');
    s = s.replace(/\b(Td|TD|Tm|T\*|ET)\b/g, '\u0001');
    var segments = s.split('\u0001');
    var lines = segments.map(function (seg) {
      var out = [], re = /(\((?:\\\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*(Tj|TJ|'|")/g, m;
      while ((m = re.exec(seg))) out.push(decodeToken(m[1]));
      re = /\[((?:\((?:\\\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|[^\]])*)\]\s*TJ/g;
      while ((m = re.exec(seg))) {
        var arr = m[1];
        var ire = /(\((?:\\\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|[-+]?\d+(?:\.\d+)?)/g, im;
        var parts = [];
        while ((im = ire.exec(arr))) {
          var tok = im[1];
          if (tok.charAt(0) === '(' || tok.charAt(0) === '<') {
            var piece = decodeToken(tok);
            if (piece) parts.push(piece);
          } else {
            var kern = Number(tok);
            if (isFinite(kern) && kern <= -100) parts.push(' ');
          }
        }
        if (parts.length) out.push(parts.join(''));
      }
      return out.join('');
    });
    return lines.join('\n').replace(/\s+\n\s+/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }

  function cleanText(t) {
    return String(t || '')
      .replace(/\u0000/g, ' ')
      .replace(/\\[nrtbf]/g, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function sectionOf(line) {
    var t = String(line || '').trim();
    if (!t || t.length > 90) return null;
    if (/^(abstract|references|bibliography|acknowledg|appendix)/i.test(t)) return t;
    if (/^\d+(\.\d+)*\s+[A-Z][A-Za-z0-9 ,:;()\-]{2,80}$/.test(t)) return t;
    if (/^(introduction|methods?|results?|discussion|conclusions?|background|data and methods)$/i.test(t)) return t;
    return null;
  }

  function chunkText(text, pageStart, pageEnd) {
    var chunks = [], paragraphs = String(text || '').split(/\n\s*\n/);
    var buf = '';
    paragraphs.forEach(function (p) {
      p = p.trim();
      if (!p) return;
      if ((buf + '\n\n' + p).length <= 1400) {
        buf = buf ? buf + '\n\n' + p : p;
        return;
      }
      if (buf) chunks.push({ content: buf, pageStart: pageStart, pageEnd: pageEnd });
      if (p.length <= 1400) { buf = p; return; }
      var sentences = p.split(/(?<=[.!?。！？])\s+/);
      var cur = '';
      sentences.forEach(function (s) {
        if ((cur + ' ' + s).length > 1400) {
          if (cur) chunks.push({ content: cur, pageStart: pageStart, pageEnd: pageEnd });
          cur = s;
        } else cur = cur ? cur + ' ' + s : s;
      });
      buf = cur;
    });
    if (buf) chunks.push({ content: buf, pageStart: pageStart, pageEnd: pageEnd });
    return chunks;
  }

  async function parse(bytes, opts) {
    opts = Object.assign({}, DEFAULTS, opts || {});
    var warnings = [], errors = [];
    if (!bytes || !bytes.length) return fail('pdf_empty', 'PDF 输入为空');
    if (bytes.length > opts.maxBytes) return fail('pdf_too_large', 'PDF 超过大小上限');
    var head = latin1(bytes.subarray(0, Math.min(bytes.length, 1024)));
    if (!/%PDF-/.test(head)) return fail('not_pdf', '不是 PDF 文件');
    var headBytes = latin1(bytes.subarray(0, Math.min(bytes.length, 4096)));
    if (/\/Encrypt/.test(headBytes)) {
      return fail('pdf_encrypted', 'PDF 已加密，无法解析');
    }

    var built = await objectMap(bytes);
    var map = built.map, textAll = built.text;
    var pages = pageRefs(map);
    if (!pages.length) warnings.push('未找到页面对象，尝试全文文本提取');
    if (pages.length > opts.maxPages) {
      warnings.push('页面数超过上限，仅解析前 ' + opts.maxPages + ' 页');
      pages = pages.slice(0, opts.maxPages);
    }

    var pageTexts = [];
    for (var i = 0; i < pages.length; i++) {
      var page = map[pages[i]];
      if (!page) continue;
      var refs = refsOf(page.body, 'Contents');
      var pieces = [];
      for (var j = 0; j < refs.length; j++) {
        var obj = map[refs[j]];
        if (!obj) continue;
        var raw = streamBytes(obj.body, textAll);
        if (!raw) continue;
        try {
          var dec = isFlate(obj.body) ? await inflate(raw) : raw;
          pieces.push(extractText(latin1(dec)));
        } catch (e) {
          warnings.push('第 ' + (i + 1) + ' 页内容流解码失败');
        }
      }
      pageTexts.push({ page: i + 1, text: cleanText(pieces.join('\n')) });
    }
    if (!pageTexts.length && !pages.length) {
      /* 缺少页面树（常见于线性化/截断文件）：扫描所有非图像内容流 */
      var keys = Object.keys(map);
      for (var k = 0; k < keys.length; k++) {
        var oo = map[keys[k]];
        if (/\/Subtype\s*\/Image/.test(oo.body) || !isFlate(oo.body)) continue;
        var rb = streamBytes(oo.body, textAll);
        if (!rb) continue;
        try {
          var dd = await inflate(rb);
          var tt = latin1(dd);
          if (/BT[\s\S]*ET/.test(tt)) {
            pageTexts.push({ page: null, text: cleanText(extractText(tt)) });
          }
        } catch (e2) { /* 跳过非文本流 */ }
      }
      if (pageTexts.length) warnings.push('未找到页面树，按内容流提取（页码未知）');
    }
    if (!pageTexts.length && /BT[\s\S]*ET/.test(textAll)) {
      pageTexts.push({ page: null, text: cleanText(extractText(textAll)) });
    }
    if (!/%%EOF/.test(textAll.slice(-2048))) warnings.push('PDF 可能被截断（缺少 %%EOF）');
    var text = pageTexts.map(function (p) { return p.text; }).join('\n\n');
    text = text.slice(0, opts.maxChars);
    if (text.length < opts.minChars) {
      return fail('pdf_no_text', '未能从 PDF 提取到可读正文（可能是扫描件或特殊编码）', warnings);
    }

    var lines = text.split('\n').filter(Boolean);
    var sections = [], current = { name: '正文', pageStart: pageTexts[0] ? pageTexts[0].page : null, text: [] };
    lines.forEach(function (line) {
      var sec = sectionOf(line);
      if (sec && (current.text.join('').length > 0)) {
        sections.push(current);
        current = { name: sec, pageStart: null, text: [line] };
      } else current.text.push(line);
    });
    sections.push(current);
    sections.forEach(function (s) {
      s.text = s.text.join('\n').trim();
      s.name = s.name || '正文';
      if (s.pageStart == null) {
        var idx = text.indexOf(s.text.slice(0, 80));
        if (idx >= 0) {
          var before = text.slice(0, idx).split(/\n\n/).length;
          s.pageStart = pageTexts[Math.min(before, pageTexts.length - 1)] ? pageTexts[Math.min(before, pageTexts.length - 1)].page : null;
        }
      }
      s.pageEnd = s.pageStart;
    });
    sections = sections.filter(function (s) { return s.text && s.text.length > 20; });

    var chunks = [];
    sections.forEach(function (s) {
      chunkText(s.text, s.pageStart, s.pageEnd).forEach(function (c) {
        chunks.push(c);
      });
    });
    if (chunks.length > opts.maxChunks) {
      warnings.push('分块数量超过上限，仅保留前 ' + opts.maxChunks + ' 块');
      chunks = chunks.slice(0, opts.maxChunks);
    }
    var title = '';
    var tm = textAll.match(/\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]+>)/);
    if (tm) title = cleanText(decodeToken(tm[1])).slice(0, 200);
    var doiM = text.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    var refIdx = text.search(/\n\s*(References|Bibliography)\s*\n/i);
    return {
      ok: true,
      title: title,
      doi: doiM ? doiM[0].replace(/[.,;]$/, '') : '',
      text: text,
      textLength: text.length,
      pageCount: pageTexts.length,
      pages: pageTexts.map(function (p) { return { page: p.page, chars: p.text.length }; }),
      sections: sections.map(function (s) {
        return { name: s.name, pageStart: s.pageStart, pageEnd: s.pageEnd, chars: s.text.length };
      }),
      chunks: chunks,
      referencesStartPage: refIdx > 0 ? null : null,
      warnings: warnings,
      errors: errors,
      extractionMethod: 'pdf-text-v1'
    };
  }

  function fail(code, message, warnings) {
    return { ok: false, code: code, error: message, warnings: warnings || [], errors: [message], extractionMethod: 'pdf-text-v1' };
  }

  root.AstroPdfText = {
    parse: parse,
    DEFAULTS: DEFAULTS,
    _objectMap: objectMap,
    _pageRefs: pageRefs,
    _extractText: extractText,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
