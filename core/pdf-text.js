/* ASTRUM · 轻量 PDF 文本解析（V1.3）
 *
 * 目标：纯浏览器 / 零外部运行时依赖，从公开论文 PDF 提取可追溯文本。
 * 不还原复杂版面；只提取 BT/ET 文本、章节、页码与 DOI。
 * 支持 FlateDecode 内容流与常见对象结构；失败时明确分类，不伪造全文。
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    /* 真实天文论文常见 10–20 MB（含图版、附录）。12 MB 会直接拒绝
     * 14.3 MB 的正式调查论文；24 MB 仍低于浏览器常见 Blob/内存上限。 */
    maxBytes: 24 * 1024 * 1024,
    maxPages: 60,
    maxChars: 400000,
    maxChunks: 120,
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
    var reader = stream.getReader();
    var chunks = [], total = 0, failure = null;
    /* 真实 PDF 常在压缩流末尾追加多余字节（换行、增量更新残留）。
     * DecompressionStream 会因此报 “Trailing junk found after the end of the compressed stream”，
     * 但有效数据已经全部产出。逐块读取，遇到这类尾部垃圾即停止；其它损坏仍抛错。 */
    while (true) {
      var step;
      try { step = await reader.read(); }
      catch (e) {
        var msg = String(e && e.message || e);
        if (/trailing junk|junk found after/i.test(msg) && total > 0) { failure = msg; break; }
        throw e;
      }
      if (step.done) break;
      if (step.value && step.value.length) { chunks.push(step.value); total += step.value.length; }
    }
    var out = new Uint8Array(total), at = 0;
    chunks.forEach(function (c) { out.set(c, at); at += c.length; });
    return out;
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

  /* 读取 << ... >> 子字典；可能是直接字典，也可能是指向对象的引用。 */
  function subDictOf(body, key) {
    var ref = body.match(new RegExp('/' + key + '\\s+(\\d+)\\s+(\\d+)\\s+R'));
    if (ref) return { ref: ref[1] + ' ' + ref[2], body: null };
    var idx = body.search(new RegExp('/' + key + '\\s*<<'));
    if (idx < 0) return null;
    var start = body.indexOf('<<', idx) + 2;
    var depth = 1, i = start;
    while (i < body.length && depth > 0) {
      if (body.substr(i, 2) === '<<') { depth++; i += 2; }
      else if (body.substr(i, 2) === '>>') { depth--; i += 2; }
      else i++;
    }
    return { ref: null, body: body.slice(start, Math.max(start, i - 2)) };
  }

  /* 页面资源可能继承自父节点（Pages 树）。 */
  function pageResources(pageId, map) {
    var cur = pageId, seen = {};
    for (var depth = 0; depth < 4 && cur; depth++) {
      if (seen[cur]) break;
      seen[cur] = 1;
      var o = map[cur];
      if (!o) break;
      var r = subDictOf(o.body, 'Resources');
      if (r) return r.ref ? (map[r.ref] ? map[r.ref].body : null) : r.body;
      var p = refOf(o.body, 'Parent');
      cur = p;
    }
    return null;
  }

  function fontMapOf(resBody, map) {
    var fd = subDictOf(resBody || '', 'Font');
    if (!fd) return {};
    var body = fd.ref ? (map[fd.ref] ? map[fd.ref].body : '') : (fd.body || '');
    var out = {}, re = /\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+(\d+)\s+R/g, m;
    while ((m = re.exec(body))) out[m[1]] = m[2] + ' ' + m[3];
    return out;
  }

  function utf16beHex(hex) {
    var out = '';
    for (var i = 0; i + 3 < hex.length; i += 4) {
      out += String.fromCharCode(parseInt(hex.substr(i, 4), 16));
    }
    return out;
  }

  function parseCMap(text) {
    var cmap = { bytes: 1, map: {} };
    var cs = String(text || '').match(/begincodespacerange([\s\S]*?)endcodespacerange/);
    if (cs) {
      var c = cs[1].match(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/);
      if (c) cmap.bytes = Math.max(1, Math.ceil(c[1].length / 2));
    }
    var bc = /beginbfchar([\s\S]*?)endbfchar/g, m;
    while ((m = bc.exec(text))) {
      var pair = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g, p;
      while ((p = pair.exec(m[1]))) cmap.map[parseInt(p[1], 16)] = utf16beHex(p[2]);
    }
    var br = /beginbfrange([\s\S]*?)endbfrange/g;
    while ((m = br.exec(text))) {
      var item = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(<([0-9A-Fa-f]+)>|\[((?:<[0-9A-Fa-f]+>\s*)+)\])/g, q;
      while ((q = item.exec(m[1]))) {
        var lo = parseInt(q[1], 16), hi = parseInt(q[2], 16);
        if (hi - lo > 65535) continue;
        if (q[4]) {
          var base = utf16beHex(q[4]);
          var code = base.charCodeAt(0);
          for (var k = lo; k <= hi; k++) cmap.map[k] = String.fromCharCode(code + (k - lo));
        } else {
          var arr = q[5].match(/<[0-9A-Fa-f]+>/g) || [];
          for (var a = 0; a < arr.length && lo + a <= hi; a++) {
            cmap.map[lo + a] = utf16beHex(arr[a].slice(1, -1));
          }
        }
      }
    }
    return cmap;
  }

  async function toUnicodeOf(fontId, map) {
    var o = map[fontId];
    if (!o) return null;
    var ref = refOf(o.body, 'ToUnicode');
    var t = ref && map[ref];
    if (!t) return null;
    var raw = streamBytes(t.body);
    if (!raw) return null;
    try {
      var dec = isFlate(t.body) ? await inflate(raw) : raw;
      return parseCMap(latin1(dec));
    } catch (e) { return null; }
  }

  async function pageFontInfo(pageId, map) {
    var res = pageResources(pageId, map);
    var refs = fontMapOf(res, map);
    var out = {}, names = Object.keys(refs);
    for (var i = 0; i < names.length; i++) {
      var name = names[i], id = refs[name], o = map[id];
      var cid = !!o && (/\/Subtype\s*\/Type0/.test(o.body) ||
        /\/Encoding\s*\/Identity-H/.test(o.body) || /\/CIDFont/.test(o.body));
      var cmap = null;
      if (cid) {
        try { cmap = await toUnicodeOf(id, map); } catch (e) { cmap = null; }
      }
      out[name] = { cid: cid, cmap: cmap };
    }
    return out;
  }

  function decodeHexCmap(tok, cmap, stats) {
    var hex = tok.slice(1, -1).replace(/[^0-9a-f]/gi, '');
    var step = (cmap.bytes || 1) * 2, out = '';
    for (var i = 0; i + step <= hex.length; i += step) {
      var code = parseInt(hex.substr(i, step), 16);
      var ch = cmap.map[code];
      if (ch != null) {
        out += ch;
        if (stats) stats.cidMapped += ch.length;
      } else {
        out += '\uFFFD';
        if (stats) stats.cidUnmapped++;
      }
    }
    if (hex.length % step) out += decodeHex('<' + hex.slice(hex.length - (hex.length % step)) + '>');
    return out;
  }

  function decodeLiteralCmap(str, cmap, stats) {
    var n = cmap.bytes || 1, out = '';
    for (var i = 0; i + n <= str.length; i += n) {
      var code = 0;
      for (var k = 0; k < n; k++) code = (code << 8) | (str.charCodeAt(i + k) & 0xFF);
      var ch = cmap.map[code];
      if (ch != null) {
        out += ch;
        if (stats) stats.cidMapped += ch.length;
      } else {
        out += '\uFFFD';
        if (stats) stats.cidUnmapped++;
      }
    }
    return out;
  }

  function decodeTokenWith(tok, font, stats) {
    if (!font) return decodeToken(tok);
    if (font.cid && !font.cmap) {
      if (stats) stats.cidUnmapped++;
      return decodeToken(tok);
    }
    if (!font.cmap) return decodeToken(tok);
    if (tok.charAt(0) === '<') return decodeHexCmap(tok, font.cmap, stats);
    return decodeLiteralCmap(decodePdfLiteral(tok), font.cmap, stats);
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

  function extractText(content, fonts, stats) {
    var s = String(content || '').replace(/\r/g, '\n');
    var lines = [], cur = [], curFont = null;
    var re = /\/([A-Za-z0-9_.+-]+)\s+[-\d.]+\s+Tf|(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>)\s*(Tj|'|")|\[((?:\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|[^\]])*)\]\s*TJ|(?:^|[^A-Za-z0-9*])(Td|TD|Tm|ET|T\*)(?![A-Za-z0-9*])/g;
    /* 上面字符串分支中的 \\. 表示“反斜杠 + 任意字符”，只吞一个反斜杠；
     * PDF 文本里的 \( 与 \) 正是这种单反斜杠转义。 */
    var m;
    function flush() { lines.push(cur.join('')); cur = []; }
    while ((m = re.exec(s))) {
      if (m[1]) {
        curFont = fonts ? (fonts[m[1]] || null) : null;
        continue;
      }
      if (m[2]) {
        if (m[3] === "'" || m[3] === '"') flush();
        var piece = decodeTokenWith(m[2], curFont, stats);
        if (piece) cur.push(piece);
        continue;
      }
      if (m[4] != null) {
        var arr = m[4];
        var ire = /(\((?:\\.|[^\\()])*\)|<[0-9A-Fa-f\s]+>|[-+]?\d+(?:\.\d+)?)/g, im;
        while ((im = ire.exec(arr))) {
          var tok = im[1];
          if (tok.charAt(0) === '(' || tok.charAt(0) === '<') {
            var p = decodeTokenWith(tok, curFont, stats);
            if (p) cur.push(p);
          } else {
            var kern = Number(tok);
            if (isFinite(kern) && kern <= -100) cur.push(' ');
          }
        }
        continue;
      }
      if (m[5]) flush();
    }
    flush();
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
    /* 标题必须是短行：真实 PDF 的两栏抽取常把正文粘在标题后面
     * （如 “References. | Sources of data are ...”），不能因为前缀命中就当章节。 */
    if (/^(abstract|references|bibliography|acknowledg|appendix)$/i.test(t)) return t;
    if (/^(abstract|references|bibliography|acknowledg|appendix)\b/i.test(t) &&
      t.length <= 40 && !/[|]/.test(t) && !/[.!?]\s+\S/.test(t)) return t;
    var m = t.match(/^\d+(?:\.\d+)*[.)]?\s+([A-Z][A-Za-z0-9 ,:;()\-]{2,80})$/);
    if (m) {
      /* 拒绝 “1.1 Mly” 这类测量值行：首个单词过短或带单位后缀。 */
      var first = m[1].split(/\s+/)[0] || '';
      if (first.length >= 4 && !/[|]/.test(t) &&
        !/(?:^|\s)(?:ly|pc|kpc|Mpc|Gyr|Myr|km|AU|mag|deg)$/i.test(t)) return t;
    }
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

  /* 页码定位：按页面文本累计偏移映射，而不是按段落数猜。
   * 真实论文常见“图表页文本很少、正文跨页”，按段落数会把后面所有
   * 章节都标到最后一页（实测 29 页论文的 References 全被标成 p29）。 */
  function pageRangesOf(pageTexts) {
    var ranges = [], acc = 0;
    pageTexts.forEach(function (p) {
      var len = String(p.text || '').length;
      ranges.push({ page: p.page, start: acc, end: acc + len });
      acc += len + 2;
    });
    return ranges;
  }

  function pageAtOffset(ranges, offset) {
    if (!ranges.length) return null;
    var off = Math.max(0, offset || 0);
    for (var i = 0; i < ranges.length; i++) {
      if (off >= ranges[i].start && off <= ranges[i].end) return ranges[i].page;
    }
    return off < ranges[0].start ? ranges[0].page : ranges[ranges.length - 1].page;
  }

  function plausibleTitle(t) {
    return !!t && t.length >= 10 &&
      !/^\d+(?:\.\d+)*[.)]?\s+/.test(t) &&
      !/^(introduction|abstract|references|untitled|contents)$/i.test(t) &&
      !/^(arxiv:|microsoft word|\.docx|\.pdf$)/i.test(t) &&
      !/\.(?:docx?|pdf|tex)\s*$/i.test(t);
  }

  /* 真实 PDF 可能“解析成功但全是乱码”：字体给了 ToUnicode 却映射到错误码位。
   * 用字母比例、标点比例和常见英文词共同判定，宁可明确失败，也不把乱码当全文。 */
  function looksGarbled(text) {
    var t = String(text || '');
    if (t.length < 1000) return false;
    var alpha = (t.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
    var punct = (t.match(/[!"#$%&'()*+,\-./:;<=>?@[\]^_{|}~]/g) || []).length;
    var common = (t.match(/\b(the|and|of|to|in|is|we|with|for|from|that|this|are|as|on|by)\b/gi) || []).length;
    return (alpha / t.length) < 0.22 && (punct / t.length) > 0.2 && common < 8;
  }

  /* 从首页正文猜标题：过滤 arXiv/期刊/日期/版权行，遇到作者或机构行停止。
   * 标题换行常以小写开头（“…new HST/ACS / imaging of 6…”），继续拼接。 */
  function guessTitle(pageTexts) {
    if (!pageTexts || !pageTexts[0]) return '';
    var lines = String(pageTexts[0].text || '').split('\n').map(function (x) {
      return x.replace(/[ \t]+/g, ' ').trim();
    }).filter(Boolean);
    var meta = /^(arxiv:|accepted|submitted|preprint|published|copyright|©|doi:|subject headings|key words|keywords|draft|version|raft version|typeset|latex|twocolumn|style in aastex|aastex|comm\.|proceedings|symposium|jenam|the astrophysical|astronomy & astrophysics|mnras|apj\b|aj\b|a&a\b|(?:january|february|march|april|may|june|july|august|september|october|november|december)\b)/i;
    var head = [];
    for (var i = 0; i < lines.length; i++) {
      var l = lines[i];
      if (/^abstract\b/i.test(l)) break;
      if (meta.test(l)) continue;
      if (!/[A-Za-z\u4e00-\u9fff]/.test(l) || /^\d+:\s/.test(l)) continue;
      if (head.length && (/@/.test(l) || /\b(University|Institute|Center|Centre|Observatory|Department|Laboratory|Telescope)\b/i.test(l))) break;
      if (head.length && !/^[a-z]/.test(l) && !/^(of|and|the|for|in|with|from|to|on|at|by|de|la)\b/i.test(l)) break;
      if (l.length < 8) continue;
      head.push(l);
      if (head.length >= 3 || /[.!?]$/.test(l)) break;
    }
    return head.join(' ').replace(/\s+/g, ' ').trim().slice(0, 260);
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

    var built;
    try {
      built = await objectMap(bytes);
    } catch (e) {
      return fail('pdf_corrupt', 'PDF 对象结构损坏，无法解析：' + String(e && e.message || e).slice(0, 120));
    }
    var map = built.map, textAll = built.text;
    if (/\/Encrypt\s+\d+\s+\d+\s+R/.test(textAll)) {
      return fail('pdf_encrypted', 'PDF 已加密，无法解析');
    }
    var fontStats = { cidMapped: 0, cidUnmapped: 0 };
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
      var fonts = await pageFontInfo(pages[i], map);
      for (var j = 0; j < refs.length; j++) {
        var obj = map[refs[j]];
        if (!obj) continue;
        var raw = streamBytes(obj.body, textAll);
        if (!raw) continue;
        try {
          var dec = isFlate(obj.body) ? await inflate(raw) : raw;
          pieces.push(extractText(latin1(dec), fonts, fontStats));
        } catch (e) {
          warnings.push('第 ' + (i + 1) + ' 页内容流解码失败：' + String(e && e.message || e).slice(0, 60));
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
    if (looksGarbled(text)) {
      return fail('pdf_unsupported_encoding',
        'PDF 字体编码无法正确还原为可读文本，拒绝把乱码当作有效全文',
        warnings.concat(['检测到高比例符号/低比例字母，疑似编码映射错误']));
    }
    if (fontStats.cidUnmapped > 0) {
      return fail('pdf_cid_unsupported',
        'PDF 使用 CID/Identity-H 字体且缺少可用的 ToUnicode 映射，拒绝输出可能乱码的正文',
        warnings.concat(['检测到 ' + fontStats.cidUnmapped + ' 处 CID 文本无法映射到 Unicode']));
    }
    if (fontStats.cidMapped > 0) warnings.push('CID/Identity-H 字体已按 ToUnicode 解码');
    if (text.length < opts.minChars) {
      var noText = fail('pdf_no_text', '未能从 PDF 提取到可读正文（可能是扫描件或特殊编码）', warnings);
      /* 保留旧错误码兼容，同时明确告诉上层「这是需要 OCR 的扫描件」还是普通无文本。 */
      if (/\/Subtype\s*\/Image/.test(textAll)) {
        noText.detailCode = 'pdf_ocr_required';
        noText.ocrRequired = true;
      }
      return noText;
    }

    var lines = text.split('\n').filter(Boolean);
    var sections = [], current = {
      name: '正文', isReferences: false,
      pageStart: pageTexts[0] ? pageTexts[0].page : null, text: []
    };
    lines.forEach(function (line) {
      var sec = sectionOf(line);
      if (sec && (current.text.join('').length > 0)) {
        sections.push(current);
        current = {
          name: sec, isReferences: /^(references|bibliography)\b/i.test(sec),
          pageStart: null, text: [line]
        };
      } else current.text.push(line);
    });
    sections.push(current);

    var ranges = pageRangesOf(pageTexts);
    var cursor = 0;
    sections.forEach(function (s) {
      s.text = s.text.join('\n').trim();
      s.name = s.name || '正文';
      if (!s.text) return;
      var probe = s.text.slice(0, Math.min(120, s.text.length));
      var idx = text.indexOf(probe, cursor);
      if (idx < 0) idx = text.indexOf(probe);
      if (idx < 0) idx = cursor;
      cursor = Math.max(cursor, idx);
      s.pageStart = pageAtOffset(ranges, idx);
      s.pageEnd = pageAtOffset(ranges, Math.max(idx, idx + s.text.length - 1));
    });
    sections = sections.filter(function (s) { return s.text && s.text.length > 20; });

    var refSection = sections.filter(function (s) { return s.isReferences; })[0] || null;
    var referencesStartPage = refSection ? refSection.pageStart : null;

    var chunks = [];
    sections.forEach(function (s) {
      /* 参考文献不进入全文证据块：它们不是论文结论，混入后会污染 Claim。 */
      if (s.isReferences) return;
      chunkText(s.text, s.pageStart, s.pageEnd).forEach(function (c) {
        chunks.push(c);
      });
    });
    if (chunks.length > opts.maxChunks) {
      warnings.push('分块数量超过上限，仅保留前 ' + opts.maxChunks + ' 块');
      chunks = chunks.slice(0, opts.maxChunks);
    }

    var rawTitle = '';
    var tm = textAll.match(/\/Title\s*(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]+>)/);
    if (tm) rawTitle = cleanText(decodeToken(tm[1])).slice(0, 220);
    var title = plausibleTitle(rawTitle) ? rawTitle : guessTitle(pageTexts);
    var frontText = pageTexts.slice(0, 2).map(function (p) { return p.text; }).join('\n');
    var doiM = frontText.match(/\b10\.\d{4,9}\/[-._;()/:A-Za-z0-9]+\b/);
    var arxivM = frontText.match(/arXiv:\s*([0-9]{4}\.[0-9]{4,5}(?:v[0-9]+)?)/i);
    if (!title) warnings.push('未能可靠识别论文标题');
    if (!doiM && !arxivM) warnings.push('首页未识别到 DOI/arXiv 标识');

    return {
      ok: true,
      title: title,
      doi: doiM ? doiM[0].replace(/[.,;]$/, '') : '',
      arxivId: arxivM ? arxivM[1] : '',
      text: text,
      textLength: text.length,
      pageCount: pageTexts.length,
      pages: pageTexts.map(function (p) { return { page: p.page, chars: p.text.length }; }),
      sections: sections.map(function (s) {
        return {
          name: s.name, pageStart: s.pageStart, pageEnd: s.pageEnd,
          chars: s.text.length, isReferences: !!s.isReferences
        };
      }),
      chunks: chunks,
      referencesStartPage: referencesStartPage,
      hasReferences: !!refSection,
      ocrRequired: false,
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
