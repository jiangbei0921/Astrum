/* ASTRUM · FITS 解析器（D3）
 *
 * 依据：docs/architecture/00-README.md、D3 任务要求
 * 零依赖：2880 字节块 / 80 字符卡片 / 多 HDU / BITPIX 8,16,32,-32,-64 /
 * BSCALE-BZERO / 图像统计 / Binary Table 结构 / 常用 WCS 键。
 * 只做解析与事实提取，不把缺失/截断数据补成有效值。
 */
(function (root) {
  'use strict';

  var CARD = 80, BLOCK = 2880, MAX_HDU = 20, SAMPLE_MAX = 10000;

  function nowIso() { return new Date().toISOString(); }

  function hashHeader(bytes, size) {
    var T = root.AstroTask;
    var s = '';
    var n = Math.min(bytes.length, 4096);
    for (var i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
    s += '|size:' + size + '|tail:' + Math.min(bytes.length, 256);
    if (T && T.sha256Hex) return 'fits_' + T.sha256Hex(s).slice(0, 20);
    return 'fits_' + String(size).toString(36);
  }

  function decodeBase64(str) {
    var clean = String(str || '').replace(/\s+/g, '');
    if (typeof root.atob === 'function') {
      var bin = root.atob(clean);
      var out = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
      return out;
    }
    var table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    var buf = [], bits = 0, acc = 0;
    for (var j = 0; j < clean.length; j++) {
      var ch = clean.charAt(j);
      if (ch === '=') break;
      var v = table.indexOf(ch);
      if (v < 0) continue;
      acc = (acc << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        buf.push((acc >> bits) & 0xFF);
      }
    }
    return new Uint8Array(buf);
  }

  function bytesOf(input) {
    if (!input) return null;
    if (typeof input === 'string') return decodeBase64(input);
    if (input instanceof ArrayBuffer) return new Uint8Array(input);
    if (ArrayBuffer.isView(input)) {
      return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    }
    if (input.base64) return decodeBase64(input.base64);
    if (input.bytes) return input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
    if (input.text) return null;
    return null;
  }

  function parseValue(raw) {
    var v = String(raw || '').trim();
    var q = v.charAt(0);
    if (q === "'") {
      var out = '', i = 1;
      while (i < v.length) {
        if (v.charAt(i) === "'") {
          if (v.charAt(i + 1) === "'") { out += "'"; i += 2; continue; }
          break;
        }
        out += v.charAt(i);
        i += 1;
      }
      return out.replace(/\s+$/, '');
    }
    var slash = v.indexOf('/');
    if (slash >= 0) v = v.slice(0, slash).trim();
    if (v === 'T') return true;
    if (v === 'F') return false;
    if (/^[+-]?[\d.]+(?:E[+-]?\d+)?$/i.test(v)) {
      var n = parseFloat(v);
      if (isFinite(n)) return n;
    }
    return v;
  }

  function readHeader(bytes, start) {
    var cards = 0, header = {}, comments = [], end = false, pendingKey = null;
    var offset = start;
    while (offset + CARD <= bytes.length && cards < 1000) {
      var card = '';
      for (var i = 0; i < CARD; i++) card += String.fromCharCode(bytes[offset + i]);
      offset += CARD;
      cards += 1;
      var key = card.slice(0, 8).trim();
      if (key === 'END') { end = true; break; }
      if (key === '' || key === 'COMMENT' || key === 'HISTORY') {
        var text = card.slice(8).trim();
        if (text) comments.push({ key: key || 'COMMENT', text: text });
        continue;
      }
      if (card.charAt(8) !== '=') {
        /* CONTINUE 或非法卡片：并入上一个字符串键 */
        if (key === 'CONTINUE' || pendingKey) {
          var more = parseValue(card.slice(10) || card.slice(8));
          if (pendingKey) {
            header[pendingKey] = String(header[pendingKey] || '') + String(more);
            if (card.indexOf("'") >= 0) pendingKey = null;
          }
        }
        continue;
      }
      var raw = card.slice(10);
      var value = parseValue(raw);
      if (value === '' && raw.trim().charAt(0) === "'" && raw.indexOf("'", 1) < 0) {
        pendingKey = key;
      }
      if (header[key] === undefined) header[key] = value;
      else if (!Array.isArray(header[key])) header[key] = [header[key], value];
      else header[key].push(value);
    }
    return {
      header: header,
      comments: comments,
      cards: cards,
      bytes: Math.ceil(cards * CARD / BLOCK) * BLOCK,
      end: end
    };
  }

  function hduDataBytes(h) {
    var naxis = Number(h.NAXIS || 0);
    var bitpix = Number(h.BITPIX || 0);
    var pcount = Number(h.PCOUNT || 0);
    var gcount = Number(h.GCOUNT || 1);
    if (String(h.XTENSION || '').toUpperCase() === 'BINTABLE') {
      return Number(h.NAXIS1 || 0) * Number(h.NAXIS2 || 0) + pcount * gcount;
    }
    if (!naxis || !bitpix) return 0;
    var dims = 1;
    for (var i = 1; i <= naxis; i++) dims *= Number(h['NAXIS' + i] || 0);
    return Math.abs(bitpix) / 8 * dims * gcount + pcount;
  }

  function statsOf(view, dataStart, count, bitpix, bscale, bzero) {
    if (!count) return null;
    var bpp = Math.abs(bitpix) / 8;
    var sampleN = Math.min(SAMPLE_MAX, count);
    var values = [], nan = 0, k, idx, raw;
    for (k = 0; k < sampleN; k++) {
      idx = Math.floor(k * count / sampleN);
      var at = dataStart + idx * bpp;
      if (bitpix === 8) raw = view.getUint8(at);
      else if (bitpix === 16) {
        raw = (bzero === 32768) ? view.getUint16(at, false) : view.getInt16(at, false);
      } else if (bitpix === 32) raw = view.getInt32(at, false);
      else if (bitpix === -32) raw = view.getFloat32(at, false);
      else if (bitpix === -64) raw = view.getFloat64(at, false);
      else return null;
      /* FITS 无符号 16 位约定：数据以有符号存储，BZERO=32768；
       * 这里直接读无符号值，避免再加一次 BZERO。 */
      var v = (bitpix === 16 && bzero === 32768) ? raw * bscale : (raw * bscale + bzero);
      if (!isFinite(v)) { nan += 1; continue; }
      values.push(v);
    }
    if (!values.length) return { count: 0, min: null, max: null, mean: null, std: null, median: null, finite: 0, nan: nan };
    var sum = 0, min = Infinity, max = -Infinity, i;
    for (i = 0; i < values.length; i++) {
      sum += values[i];
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    var mean = sum / values.length;
    var sq = 0;
    for (i = 0; i < values.length; i++) sq += (values[i] - mean) * (values[i] - mean);
    var std = Math.sqrt(sq / values.length);
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var median = sorted[Math.floor(sorted.length / 2)];
    return {
      count: values.length,
      finite: values.length,
      nan: nan,
      min: min, max: max, mean: mean, std: std, median: median
    };
  }

  function wcsOf(h) {
    var keys = ['CTYPE1', 'CTYPE2', 'CRPIX1', 'CRPIX2', 'CRVAL1', 'CRVAL2',
      'CDELT1', 'CDELT2', 'CUNIT1', 'CUNIT2', 'CD1_1', 'CD1_2', 'CD2_1', 'CD2_2',
      'RADESYS', 'EQUINOX'];
    var out = {};
    var any = false;
    keys.forEach(function (k) {
      if (h[k] !== undefined) { out[k] = h[k]; any = true; }
    });
    if (!any) return null;
    var nx = Number(h.NAXIS1 || 0), ny = Number(h.NAXIS2 || 0);
    var cd1 = Number(h.CD1_1 != null ? h.CD1_1 : (h.CDELT1 || 0));
    var cd2 = Number(h.CD2_2 != null ? h.CD2_2 : (h.CDELT2 || 0));
    out.widthDeg = nx && cd1 ? Math.abs(cd1 * nx) : null;
    out.heightDeg = ny && cd2 ? Math.abs(cd2 * ny) : null;
    return out;
  }

  function tableOf(view, header, dataStart) {
    var rows = Number(header.NAXIS2 || 0);
    var rowBytes = Number(header.NAXIS1 || 0);
    var fields = Number(header.TFIELDS || 0);
    var columns = [], off = 0;
    for (var i = 1; i <= fields; i++) {
      var form = String(header['TFORM' + i] || 'A1');
      var m = form.match(/^(\d*)([A-Z])/);
      var repeat = m ? Number(m[1] || 1) : 1;
      var code = m ? m[2] : 'A';
      var size = 1;
      if (code === 'I') size = 2;
      else if (code === 'J') size = 4;
      else if (code === 'K') size = 8;
      else if (code === 'E') size = 4;
      else if (code === 'D') size = 8;
      else if (code === 'L') size = 1;
      else if (code === 'B') size = 1;
      else if (code === 'X') size = 0;
      columns.push({
        index: i,
        name: String(header['TTYPE' + i] || ('col' + i)),
        form: form,
        code: code,
        repeat: repeat,
        offset: off,
        bytes: size * repeat,
        unit: header['TUNIT' + i] || ''
      });
      off += size * repeat;
    }
    var sampleRows = Math.min(rows, 100);
    var numeric = columns.filter(function (c) {
      return c.code === 'I' || c.code === 'J' || c.code === 'K' ||
        c.code === 'E' || c.code === 'D' || c.code === 'B' || c.code === 'L';
    });
    numeric.slice(0, 3).forEach(function (c) {
      var values = [];
      for (var r = 0; r < Math.min(sampleRows, 5); r++) {
        var at = dataStart + r * rowBytes + c.offset;
        var v = null;
        try {
          if (c.code === 'I') v = view.getInt16(at, false);
          else if (c.code === 'J') v = view.getInt32(at, false);
          else if (c.code === 'K') v = Number(view.getBigInt64(at, false));
          else if (c.code === 'E') v = view.getFloat32(at, false);
          else if (c.code === 'D') v = view.getFloat64(at, false);
          else if (c.code === 'B') v = view.getUint8(at);
          else if (c.code === 'L') v = view.getUint8(at) ? true : false;
        } catch (e) { v = null; }
        values.push(v);
      }
      c.sample = values;
    });
    return {
      rows: rows,
      rowBytes: rowBytes,
      fields: fields,
      columns: columns,
      sampleRows: sampleRows
    };
  }

  function parseTextHeader(text) {
    var header = {}, comments = [], lines = String(text || '').split(/\r?\n/);
    lines.forEach(function (line) {
      var card = (line + ' '.repeat(CARD)).slice(0, CARD);
      var key = card.slice(0, 8).trim();
      if (key === 'END') return;
      if (key === 'COMMENT' || key === 'HISTORY' || !key) {
        comments.push({ key: key || 'COMMENT', text: card.slice(8).trim() });
        return;
      }
      if (card.charAt(8) !== '=') return;
      if (header[key] === undefined) header[key] = parseValue(card.slice(10));
      else if (!Array.isArray(header[key])) header[key] = [header[key], parseValue(card.slice(10))];
      else header[key].push(parseValue(card.slice(10)));
    });
    return { header: header, comments: comments, cards: lines.length, bytes: 0, end: true };
  }

  function parse(input) {
    var warnings = [], errors = [];
    var parsedAt = nowIso();
    var textOnly = false;
    var bytes = bytesOf(input);
    if ((!bytes || !bytes.length) && input && typeof input.text === 'string') {
      textOnly = true;
    }
    if (textOnly) {
      var th = parseTextHeader(input.text);
      if (!th.header.SIMPLE && !th.header.XTENSION) {
        return { ok: false, errors: ['不是有效的 FITS 头文本（缺少 SIMPLE/XTENSION）'], warnings: warnings, parsedAt: parsedAt };
      }
      var hdu = {
        index: 0,
        type: 'primary',
        header: th.header,
        comments: th.comments,
        dataStart: null,
        dataBytes: 0,
        stats: null,
        table: null,
        wcs: wcsOf(th.header)
      };
      return {
        ok: true, fileName: input.fileName || '', fileSize: 0, fileHash: '',
        hdus: [hdu], imageCount: 0, tableCount: 0,
        warnings: ['header-only：未提供数据区，未计算统计量'], errors: [],
        parsedAt: parsedAt
      };
    }
    if (!bytes || !bytes.length) {
      return { ok: false, errors: ['FITS 输入为空或无法解码'], warnings: warnings, parsedAt: parsedAt };
    }
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    var hdus = [], offset = 0, imageCount = 0, tableCount = 0, truncated = false;

    while (offset + CARD <= bytes.length && hdus.length < MAX_HDU) {
      var h = readHeader(bytes, offset);
      if (!h.header.SIMPLE && !h.header.XTENSION) {
        if (hdus.length === 0) {
          return { ok: false, errors: ['首个 HDU 缺少 SIMPLE/XTENSION，不是有效 FITS'], warnings: warnings, parsedAt: parsedAt };
        }
        break;
      }
      var dataStart = offset + h.bytes;
      var dataBytes = hduDataBytes(h.header);
      var type = String(h.header.XTENSION || 'primary').toLowerCase();
      var hdu = {
        index: hdus.length,
        type: type === 'image' ? 'image' : (type === 'bintable' ? 'bintable' : (type === 'primary' ? 'primary' : type)),
        header: h.header,
        comments: h.comments,
        dataStart: dataStart,
        dataBytes: dataBytes,
        stats: null,
        table: null,
        wcs: wcsOf(h.header)
      };
      var isTable = String(h.header.XTENSION || '').toUpperCase() === 'BINTABLE';
      var hduBitpix = h.header.BITPIX == null ? null : Number(h.header.BITPIX);
      var unsupported = !isTable && h.header.NAXIS >= 1 && hduBitpix != null &&
        [8, 16, 32, -32, -64].indexOf(hduBitpix) < 0;
      if (unsupported) {
        warnings.push('HDU ' + hdu.index + ' BITPIX=' + hduBitpix + ' 不支持，未计算统计量');
      }
      if (h.header.NAXIS >= 1 && dataBytes > 0) {
        if (dataStart + dataBytes > bytes.length) {
          warnings.push('HDU ' + hdu.index + ' 数据区被截断（需要 ' + dataBytes + ' B，实际 ' + (bytes.length - dataStart) + ' B）');
          truncated = true;
        } else if (isTable) {
          hdu.table = tableOf(view, h.header, dataStart);
          tableCount += 1;
        } else if (hduBitpix != null && !unsupported) {
          var bitpix = hduBitpix;
          var bscale = h.header.BSCALE == null ? 1 : Number(h.header.BSCALE);
          var bzero = h.header.BZERO == null ? 0 : Number(h.header.BZERO);
          hdu.stats = statsOf(view, dataStart, dataBytes / (Math.abs(bitpix) / 8),
            bitpix, bscale, bzero);
          imageCount += 1;
        }
      }
      hdus.push(hdu);
      if (truncated) break;
      offset = dataStart + Math.ceil(dataBytes / BLOCK) * BLOCK;
      if (dataBytes === 0 && h.bytes === 0) break;
    }

    if (!hdus.length) {
      return { ok: false, errors: ['未解析到任何 HDU'], warnings: warnings, parsedAt: parsedAt };
    }
    if (offset < bytes.length && bytes.length - offset > 0 && !truncated) {
      /* 剩余字节通常为补零；不视为错误 */
    }
    return {
      ok: true,
      fileName: (input && input.fileName) || '',
      fileSize: bytes.length,
      fileHash: hashHeader(bytes, bytes.length),
      hdus: hdus,
      imageCount: imageCount,
      tableCount: tableCount,
      warnings: warnings,
      errors: errors,
      parsedAt: parsedAt
    };
  }

  root.AstroFits = {
    parse: parse,
    readHeader: readHeader,
    statsOf: statsOf,
    decodeBase64: decodeBase64,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
