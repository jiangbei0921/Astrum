/* ASTRUM · V1.6 复杂 PDF 合成样本测试
 *
 * 目标：用可重复、无版权风险的合成 PDF 覆盖常见版面/编码类型，
 * 验证解析器在“能解析”和“不能解析”时都给出准确分类，不把乱码当成功。
 *
 * 覆盖：
 *   F1 普通文本（多页、章节、DOI）
 *   F2 双栏（内容流顺序）
 *   F3 扫描件（无文本层）
 *   F4 CID/Identity-H + ToUnicode
 *   F5 CID/Identity-H 无 ToUnicode（必须明确拒绝）
 *   F6 数学公式/希腊字母/上下标近似
 *   F7 表格（Td 定位）
 *   F8 图注与图片对象
 *   F9 罗马数字印刷页码
 *   F10 物理页码与印刷页码不一致
 *   F11 混合复杂论文
 *   F12 加密标记
 *   F13 截断/空文件/非 PDF/超限
 *
 * 用法：node tools/v1-6-pdf-fixtures-test.js [--write]
 *   --write 额外把样本写入 tools/fixtures/pdf/ 便于人工检查。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/pdf-text.js'));

var Pdf = global.AstroPdfText;
var OUT_DIR = path.join(__dirname, 'fixtures', 'pdf');
var WRITE = process.argv.indexOf('--write') >= 0;

/* ---------- 最小 PDF 生成器（无压缩，xref 可省略，解析器按对象扫描） ---------- */
function pad4(n) {
  var s = Number(n).toString(16).toUpperCase();
  while (s.length < 4) s = '0' + s;
  return s;
}
function pdfLiteral(s) {
  var out = '';
  for (var i = 0; i < String(s).length; i++) {
    var c = String(s).charAt(i), code = String(s).charCodeAt(i);
    if (c === '\\' || c === '(' || c === ')') out += '\\' + c;
    else if (code > 0x7E || code < 0x20) out += '\\' + ('000' + code.toString(8)).slice(-3);
    else out += c;
  }
  return out;
}
function streamObj(body, dict) {
  return '<< ' + (dict ? dict + ' ' : '') + '/Length ' + body.length + ' >>\nstream\n' + body + '\nendstream';
}
function obj(n, body) {
  return n + ' 0 obj\n' + body + '\nendobj\n';
}
function buildPdf(spec) {
  /* spec: { pages:[{content, resources?}], fonts:[{name,type,cmap?,...}], extraObjs:[] } */
  var objs = [];
  var fontNums = {};
  var next = 5;
  (spec.fonts || []).forEach(function (f) {
    fontNums[f.name] = next;
    next += f.type === 'cid' ? 3 : 1;
  });
  var pageContents = [];
  spec.pages.forEach(function (p) {
    pageContents.push(next++);
  });
  var childNext = next;
  (spec.pages || []).forEach(function (p) {
    if (p.image) p.imageNum = next++;
  });
  var pageNums = [];
  spec.pages.forEach(function () { pageNums.push(next++); });
  var total = next;

  function contentOf(p) {
    var fonts = Object.keys(fontNums).map(function (name) {
      return '/' + name + ' ' + fontNums[name] + ' 0 R';
    }).join(' ');
    var res = '<</Font<<' + fonts + '>>' + (p.image ? '/XObject<</Im1 ' + p.imageNum + ' 0 R>>' : '') + '>>';
    return '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources' + res +
      '/Contents ' + pageContents[spec.pages.indexOf(p)] + ' 0 R>>';
  }

  objs[1] = '<</Type/Catalog/Pages 2 0 R>>';
  objs[2] = '<</Type/Pages/Kids[' + pageNums.map(function (n) { return n + ' 0 R'; }).join(' ') +
    ']/Count ' + pageNums.length + '>>';
  (spec.fonts || []).forEach(function (f) {
    var n = fontNums[f.name];
    if (f.type === 'cid') {
      objs[n] = '<</Type/Font/Subtype/Type0/BaseFont/' + (f.base || 'SimSun') +
        '/Encoding/Identity-H/DescendantFonts[' + (n + 1) + ' 0 R]' +
        (f.cmap ? '/ToUnicode ' + (n + 2) + ' 0 R' : '') + '>>';
      objs[n + 1] = '<</Type/Font/Subtype/CIDFontType2/BaseFont/' + (f.base || 'SimSun') + '>>';
      if (f.cmap) objs[n + 2] = streamObj(f.cmap);
    } else {
      objs[n] = '<</Type/Font/Subtype/Type1/BaseFont/' + (f.base || 'Helvetica') + '>>';
    }
  });
  spec.pages.forEach(function (p, i) {
    objs[pageContents[i]] = streamObj(p.content);
    if (p.image) {
      objs[p.imageNum] = streamObj('\xff\x00\x00',
        '<</Type/XObject/Subtype/Image/Width 1/Height 1/ColorSpace/DeviceRGB/BitsPerComponent 8>>');
    }
    objs[pageNums[i]] = contentOf(p);
  });
  (spec.extraObjs || []).forEach(function (e) { objs[e.n] = e.body; });
  var out = '%PDF-1.4\n';
  for (var i = 1; i < total; i++) if (objs[i] != null) out += obj(i, objs[i]);
  if (spec.encrypt) out += '/Encrypt ' + spec.encrypt + ' 0 R\n';
  out += 'trailer\n<</Size ' + total + '>>\n%%EOF\n';
  var bytes = new Uint8Array(out.length);
  for (var j = 0; j < out.length; j++) bytes[j] = out.charCodeAt(j) & 0xFF;
  return bytes;
}

function textContent(lines, opts) {
  opts = opts || {};
  var out = 'BT /' + (opts.font || 'F1') + ' ' + (opts.size || 10) + ' Tf ' +
    (opts.x || 50) + ' ' + (opts.y || 720) + ' Td\n';
  lines.forEach(function (line, i) {
    if (i) out += 'T*\n';
    out += '(' + pdfLiteral(line) + ') Tj\n';
  });
  return out + 'ET';
}
function cidContent(text, font, opts) {
  opts = opts || {};
  var chars = Array.from(text);
  var code = 1, map = {}, codes = [];
  chars.forEach(function (ch) {
    if (!map[ch]) map[ch] = code++;
    codes.push(pad4(map[ch]));
  });
  var out = 'BT /' + (font || 'F1') + ' ' + (opts.size || 10) + ' Tf ' +
    (opts.x || 50) + ' ' + (opts.y || 720) + ' Td\n<' + codes.join('') + '> Tj\nET';
  return { content: out, map: map };
}
function utf16beHex(ch) {
  var cp = ch.codePointAt(0);
  if (cp <= 0xFFFF) return pad4(cp);
  var v = cp - 0x10000;
  return pad4(0xD800 + (v >> 10)) + pad4(0xDC00 + (v & 0x3FF));
}
function cmapFor(map) {
  var pairs = Object.keys(map).map(function (ch) {
    return '<' + pad4(map[ch]) + '> <' + utf16beHex(ch) + '>';
  });
  return '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n' +
    '/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
    '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n' +
    '1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n' +
    pairs.length + ' beginbfchar\n' + pairs.join('\n') + '\nendbfchar\n' +
    'endcmap\nCMapName currentdict /CMap defineresource pop\nend\nend\n';
}

/* ---------- 样本 ---------- */
var PLAIN_TEXT = [
  'ASTRUM synthetic plain text paper',
  'ABSTRACT',
  'We measure the distance to the Orion Nebula (M42) using calibrated parallax.',
  'The distance is 1344 light years with a standard error of 12 light years.',
  '1. INTRODUCTION',
  'The Orion Nebula is the nearest massive star-forming region to the Sun.',
  '2. RESULTS',
  'Our measurement agrees with the recent Gaia parallax determination.',
  'DOI: 10.1000/astrum.synthetic'
];
function plainPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [
      { content: textContent(PLAIN_TEXT.slice(0, 4)) },
      { content: textContent(PLAIN_TEXT.slice(4)) }
    ]
  });
}
function twoColumnPdf() {
  var left = [
    '1. INTRODUCTION', 'Left column starts here with the primary argument.',
    'The left column continues with background and previous measurements.',
    'This text must appear before the right column in reading order.'
  ];
  var right = [
    '2. RESULTS', 'Right column carries the measurement and its uncertainty.',
    'M42 distance is 1344 light years with a calibrated parallax.',
    'The right column ends the page with the discussion.'
  ];
  var content = 'BT /F1 9 Tf 40 720 Td\n' + left.map(function (l, i) {
    return (i ? '0 -14 Td\n' : '') + '(' + pdfLiteral(l) + ') Tj\n';
  }).join('') + '300 648 Td\n' + right.map(function (l, i) {
    return (i ? '0 -14 Td\n' : '') + '(' + pdfLiteral(l) + ') Tj\n';
  }).join('') + 'ET';
  return buildPdf({ fonts: [{ name: 'F1' }], pages: [{ content: content }] });
}
function scannedPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [{ content: 'q 50 500 200 200 re W n /Im1 Do Q', image: true }]
  });
}
var CID_TEXT = '猎户座大星云M42的距离是1344光年，测量误差为12光年。' +
  '该结果来自校准后的视差数据，并与近期的独立测量相互一致。' +
  '重复的正文用于验证跨页与分块，不改变测量本身。' +
  '样本明确标注为合成数据，仅用于解析器回归测试。' +
  '第二段继续补充关于星云距离、误差预算和独立复核的说明。' +
  '这些文字都属于合成样本，不代表任何真实观测结论。';
function cidPdf(withMap) {
  var enc = cidContent(CID_TEXT, 'F1');
  return buildPdf({
    fonts: [{
      name: 'F1', type: 'cid', base: 'SimSun',
      cmap: withMap ? cmapFor(enc.map) : null
    }],
    pages: [{ content: enc.content }]
  });
}
function mathPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [{
      content: textContent([
        '3. MEASUREMENTS',
        'The Hubble constant is H0 = 67.4 ± 0.5 km/s/Mpc.',
        'The rest energy relation is E = mc^2.',
        'The measured redshift is z = 0.0234 and the lookback time is 0.32 Gyr.'
      ])
    }]
  });
}
function tablePdf() {
  var rows = [
    ['Object', 'Distance', 'Error'],
    ['M42', '1344 ly', '12 ly'],
    ['M31', '2.54 Mly', '0.04 Mly'],
    ['M33', '2.73 Mly', '0.05 Mly'],
    ['M51', '23.1 Mly', '1.2 Mly'],
    ['M101', '20.9 Mly', '1.1 Mly']
  ];
  var content = 'BT /F1 9 Tf 50 720 Td\n';
  rows.forEach(function (r, i) {
    content += (i ? '0 -18 Td\n' : '');
    r.forEach(function (cell, j) {
      content += (j ? '120 0 Td\n' : '') + '(' + pdfLiteral(cell) + ') Tj\n';
    });
    content += '-240 0 Td\n';
  });
  content += '0 -40 Td\n(The table lists distances and errors for five nearby galaxies.) Tj\n' +
    '0 -14 Td\n(Each row keeps its object name and measurement traceable in the text layer.) Tj\nET';
  return buildPdf({ fonts: [{ name: 'F1' }], pages: [{ content: content }] });
}
function captionPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [{
      content: 'q 50 500 120 120 re W n /Im1 Do Q\n' + textContent([
        'Figure 1: The Orion Nebula (M42) observed with a 200 mm telescope.',
        'The image shows the bright core and the surrounding molecular cloud.',
        'Caption text belongs to the figure and must remain traceable.'
      ], { y: 420 }),
      image: true
    }]
  });
}
function romanPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [
      { content: textContent(['Page i', 'Preface', 'This preface introduces the synthetic roman page fixture.']) },
      { content: textContent(['Page ii', '1. INTRODUCTION', 'The introduction explains why roman page labels differ from physical pages.']) },
      { content: textContent(['Page iii', '2. RESULTS', 'The results confirm that physical page numbers remain 1 2 3 in the parser.']) }
    ]
  });
}
function offsetPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [
      { content: textContent(['Printed page 1344', '1. INTRODUCTION', 'The printed page number is 1344 while the physical page is one.']) },
      { content: textContent(['Printed page 1345', '2. RESULTS', 'The printed page number is 1345 while the physical page is two.']) }
    ]
  });
}
function mixedPdf() {
  return buildPdf({
    fonts: [{ name: 'F1' }],
    pages: [
      { content: textContent(['ASTRUM Mixed Complex Paper', 'ABSTRACT', 'We combine text, a table, a formula and a figure caption.']) },
      { content: textContent(['1. INTRODUCTION', 'The survey targets M42 and uses a calibrated distance ladder.']) },
      {
        content: 'BT /F1 9 Tf 50 720 Td\n(2. RESULTS) Tj\n0 -16 Td\n(The distance is 1344 ly with H0 = 67.4 \\261 0.5.) Tj\n' +
          '0 -30 Td\n(Object) Tj\n120 0 Td\n(Distance) Tj\n120 0 Td\n(Error) Tj\n' +
          '-240 0 Td\n0 -18 Td\n(M42) Tj\n120 0 Td\n(1344 ly) Tj\n120 0 Td\n(12 ly) Tj\n' +
          '0 -30 Td\n(Figure 1: M42 survey field.) Tj\nET\nq 50 400 100 100 re W n /Im1 Do Q',
        image: true
      }
    ]
  });
}

/* ---------- 断言框架 ---------- */
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}
async function parseFixture(name, bytes) {
  var r = await Pdf.parse(bytes);
  return { name: name, r: r, bytes: bytes };
}
function save(name, bytes) {
  if (!WRITE) return;
  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, name + '.pdf'), bytes);
  console.log('WROTE ' + path.join(OUT_DIR, name + '.pdf') + ' (' + bytes.length + ' B)');
}

(async function main() {
  var plain = await parseFixture('plain', plainPdf());
  save('plain', plain.bytes);
  ok('F1.1 普通 PDF 成功', plain.r.ok === true, plain.r.code || '');
  ok('F1.2 多页识别', plain.r.pageCount === 2, 'pages=' + plain.r.pageCount);
  ok('F1.3 章节边界', plain.r.ok && ['ABSTRACT', 'INTRODUCTION', 'RESULTS'].every(function (n) {
    return plain.r.sections.some(function (s) { return s.name.indexOf(n) >= 0; });
  }), plain.r.ok ? plain.r.sections.map(function (s) { return s.name; }).join('/') : '');
  ok('F1.4 DOI 识别', plain.r.ok && plain.r.doi === '10.1000/astrum.synthetic', plain.r.doi);
  ok('F1.5 正文分块', plain.r.ok && plain.r.chunks.length >= 1 && plain.r.text.length >= 120,
    'chunks=' + (plain.r.chunks || []).length + ' chars=' + (plain.r.text || '').length);
  ok('F1.6 页码映射存在', plain.r.ok && plain.r.pages.length === 2 &&
    plain.r.pages[0].page === 1 && plain.r.pages[1].page === 2,
    JSON.stringify(plain.r.pages));

  var two = await parseFixture('two-column', twoColumnPdf());
  save('two-column', two.bytes);
  ok('F2.1 双栏 PDF 成功', two.r.ok === true, two.r.code || '');
  ok('F2.2 两栏文本均提取', two.r.ok && two.r.text.indexOf('Left column starts') >= 0 &&
    two.r.text.indexOf('Right column carries') >= 0, 'chars=' + (two.r.text || '').length);
  ok('F2.3 内容流顺序保持', two.r.ok &&
    two.r.text.indexOf('Left column starts') < two.r.text.indexOf('Right column carries'),
    'left<' + (two.r.ok ? two.r.text.indexOf('Right column carries') : 'n/a'));
  ok('F2.4 双栏章节识别', two.r.ok && two.r.sections.some(function (s) { return s.name.indexOf('RESULTS') >= 0; }),
    two.r.ok ? two.r.sections.map(function (s) { return s.name; }).join('/') : '');

  var scan = await parseFixture('scanned', scannedPdf());
  save('scanned', scan.bytes);
  ok('F3.1 扫描件明确失败', scan.r.ok === false && scan.r.code === 'pdf_no_text', scan.r.code);
  ok('F3.2 扫描件不伪造正文', !scan.r.text || scan.r.text.length === 0, 'chars=' + ((scan.r.text || '').length));
  /* V1.11：能力边界必须明确。扫描件只能标记 OCR 需求，绝不能宣称已识别。 */
  ok('F3.3 扫描件标记 OCR 需求', !!(scan.r.ocrRequired || scan.r.detailCode === 'pdf_ocr_required'),
    (scan.r.detailCode || '') + '/' + !!scan.r.ocrRequired);

  var cid = await parseFixture('cid-tounicode', cidPdf(true));
  save('cid-tounicode', cid.bytes);
  ok('F4.1 CID+ToUnicode 成功', cid.r.ok === true, cid.r.code || '');
  ok('F4.2 Unicode 文本正确', cid.r.ok && cid.r.text.indexOf(CID_TEXT) >= 0,
    cid.r.ok ? cid.r.text.slice(0, 40) : '');
  ok('F4.3 CID 章节/分块可用', cid.r.ok && cid.r.chunks.length >= 1 &&
    cid.r.sections.length >= 1, 'chunks=' + ((cid.r.chunks || []).length));

  var cidNo = await parseFixture('cid-no-tounicode', cidPdf(false));
  save('cid-no-tounicode', cidNo.bytes);
  ok('F5.1 CID 无 ToUnicode 明确拒绝', cidNo.r.ok === false && cidNo.r.code === 'pdf_cid_unsupported',
    cidNo.r.code || ('ok chars=' + (cidNo.r.text || '').length));
  ok('F5.2 拒绝时不输出乱码正文', !cidNo.r.text || cidNo.r.text.length === 0);

  var math = await parseFixture('math', mathPdf());
  save('math', math.bytes);
  ok('F6.1 公式 PDF 成功', math.r.ok === true, math.r.code || '');
  ok('F6.2 公式符号保留', math.r.ok && math.r.text.indexOf('H0 = 67.4 \u00b1 0.5 km/s/Mpc') >= 0,
    math.r.ok ? math.r.text.slice(0, 80) : '');
  ok('F6.3 上下标近似文本', math.r.ok && math.r.text.indexOf('E = mc^2') >= 0 && math.r.text.indexOf('z = 0.0234') >= 0);

  var table = await parseFixture('table', tablePdf());
  save('table', table.bytes);
  ok('F7.1 表格 PDF 成功', table.r.ok === true, table.r.code || '');
  ok('F7.2 表格单元格文本保留', table.r.ok && ['Object', 'Distance', 'Error', 'M42', '1344 ly', 'M31'].every(function (v) {
    return table.r.text.indexOf(v) >= 0;
  }), table.r.ok ? table.r.text.replace(/\n/g, '|').slice(0, 100) : '');
  ok('F7.3 表格不伪造行列结构', table.r.ok && table.r.text.indexOf('Object') < table.r.text.indexOf('1344 ly'));

  var cap = await parseFixture('caption', captionPdf());
  save('caption', cap.bytes);
  ok('F8.1 图注文本保留', cap.r.ok === true && cap.r.text.indexOf('Figure 1: The Orion Nebula') >= 0, cap.r.code || '');
  ok('F8.2 图片对象不进入正文', cap.r.ok && cap.r.text.indexOf('\u00ff') < 0 && cap.r.text.indexOf('DeviceRGB') < 0);

  var roman = await parseFixture('roman-pages', romanPdf());
  save('roman-pages', roman.bytes);
  ok('F9.1 罗马页码样本可解析', roman.r.ok === true, roman.r.code || '');
  ok('F9.2 印刷罗马页码保留在文本', roman.r.ok && roman.r.text.indexOf('Page ii') >= 0);
  ok('F9.3 物理页码不被罗马数字替换', roman.r.ok && roman.r.pages.length === 3 &&
    roman.r.pages[1].page === 2 && roman.r.pages[2].page === 3,
    JSON.stringify(roman.r.pages));

  var offset = await parseFixture('offset-pages', offsetPdf());
  save('offset-pages', offset.bytes);
  ok('F10.1 偏移页码样本可解析', offset.r.ok === true, offset.r.code || '');
  ok('F10.2 印刷页码保留在文本', offset.r.ok && offset.r.text.indexOf('Printed page 1344') >= 0);
  ok('F10.3 物理页码仍是 1/2', offset.r.ok && offset.r.pages[0].page === 1 && offset.r.pages[1].page === 2,
    JSON.stringify(offset.r.pages));

  var mixed = await parseFixture('mixed', mixedPdf());
  save('mixed', mixed.bytes);
  ok('F11.1 混合 PDF 成功', mixed.r.ok === true, mixed.r.code || '');
  ok('F11.2 多页/章节/图表', mixed.r.ok && mixed.r.pageCount === 3 &&
    mixed.r.sections.length >= 3 &&
    mixed.r.text.indexOf('Figure 1: M42 survey field') >= 0 &&
    mixed.r.text.indexOf('H0 = 67.4 \u00b1 0.5') >= 0,
    mixed.r.ok ? ('pages=' + mixed.r.pageCount + ' sections=' + mixed.r.sections.length) : '');
  ok('F11.3 混合 PDF 分块', mixed.r.ok && mixed.r.chunks.length >= 2, 'chunks=' + ((mixed.r.chunks || []).length));

  var enc = await parseFixture('encrypted', (function () {
    var b = buildPdf({ fonts: [{ name: 'F1' }], pages: [{ content: textContent(PLAIN_TEXT) }], encrypt: 99 });
    return b;
  })());
  save('encrypted', enc.bytes);
  ok('F12.1 加密 PDF 明确失败', enc.r.ok === false && enc.r.code === 'pdf_encrypted', enc.r.code || 'ok');

  var truncBytes = (function () {
    var b = plainPdf();
    var s = '';
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    s = s.replace(/%%EOF\s*$/, '');
    var out = new Uint8Array(s.length);
    for (var j = 0; j < s.length; j++) out[j] = s.charCodeAt(j) & 0xFF;
    return out;
  })();
  var trunc = await parseFixture('truncated', truncBytes);
  ok('F13.1 截断 PDF 保留警告', trunc.r.ok === true &&
    trunc.r.warnings.some(function (w) { return w.indexOf('截断') >= 0; }), (trunc.r.warnings || []).join('；'));
  ok('F13.2 空文件明确失败', (await Pdf.parse(new Uint8Array(0))).code === 'pdf_empty');
  ok('F13.3 非 PDF 明确失败', (await Pdf.parse(new Uint8Array(100))).code === 'not_pdf');
  ok('F13.4 超限明确失败', (await Pdf.parse(plainPdf(), { maxBytes: 100 })).code === 'pdf_too_large');

  console.log('');
  var bad = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
  });
  console.log('');
  console.log('RESULT ' + pass + '/' + results.length);
  if (bad.length) console.log('FAILED ' + bad.map(function (r) { return r.name; }).join('; '));
  process.exitCode = pass === results.length ? 0 : 1;
})();
