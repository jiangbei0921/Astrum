/* ASTRUM · V1.5 本机论文 PDF 附件测试
 *
 * 覆盖：PDF 解析、章节、分块、fulltext Evidence、附件分类、
 *       非法文件、大小限制、无文本失败；不联网、不伪造。
 *
 * 用法：node tools/v1-4-paper-attachment-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'core/task.js', 'core/evidence.js', 'core/pdf-text.js',
  'core/paper-fulltext.js', 'core/paper-attachment.js',
  'core/attachment-evidence.js', 'core/attachments.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var PA = global.AstroPaperAttachment;
var AttEv = global.AstroAttachmentEvidence;
var ATT = global.Attachments;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

/* 生成一个最小、可被零依赖解析器读取的单页 PDF（无压缩流）。 */
function makePdf(lines) {
  var text = 'BT\n/F1 12 Tf\n72 720 Td\n';
  lines.forEach(function (line, i) {
    if (i) text += '0 -22 Td\n';
    text += '(' + String(line).replace(/[()\\]/g, '\\$&') + ') Tj\n';
  });
  text += 'ET\n';
  var objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    '<< /Length ' + Buffer.byteLength(text, 'latin1') + ' >>\nstream\n' + text + 'endstream',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  var out = '%PDF-1.4\n';
  var offsets = [];
  objs.forEach(function (body, i) {
    offsets.push(Buffer.byteLength(out, 'latin1'));
    out += (i + 1) + ' 0 obj\n' + body + '\nendobj\n';
  });
  var xref = Buffer.byteLength(out, 'latin1');
  out += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
  offsets.forEach(function (off) {
    out += String(off).padStart(10, '0') + ' 00000 n \n';
  });
  out += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n';
  return new Uint8Array(Buffer.from(out, 'latin1'));
}

(async function main() {
  var pdf = makePdf([
    'ASTRUM TEST PAPER',
    'ABSTRACT',
    'This paper reports a local bulk flow measurement.',
    'INTRODUCTION',
    'We describe the PDF attachment evidence pipeline.',
    'RESULTS',
    'The measured value is 250 km/s with a 30 km/s error.'
  ]);

  await runCase('P1', '本机 PDF 解析与全文证据', async function () {
    var r = await PA.parseBytes(pdf, { fileName: 'local-paper.pdf' });
    ok('P1.1 解析成功', r.ok === true, r.code);
    ok('P1.2 页数识别', r.pageCount >= 1, 'pages=' + r.pageCount);
    ok('P1.3 章节识别', (r.sections || []).length >= 2 &&
      r.sections.some(function (s) { return s.name === 'INTRODUCTION'; }),
      (r.sections || []).map(function (s) { return s.name; }).join('/'));
    ok('P1.4 正文分块', r.chunks.length >= 1 && r.chunks[0].content.length > 10, 'chunks=' + r.chunks.length);
    ok('P1.5 fulltext Evidence', r.evidence.length >= 1 &&
      r.evidence[0].contentLevel === 'fulltext' && r.evidence[0].abstractOnly === false,
      'n=' + r.evidence.length);
    ok('P1.6 本机来源标记', r.evidence[0].uri.indexOf('local:') === 0 &&
      r.evidence[0].provenance.localOnly === true && r.evidence[0].provenance.tool === 'attachments.paper');
    ok('P1.7 章节/页码保留', r.evidence[0].content.section &&
      r.evidence[0].content.pageStart != null,
      JSON.stringify({ s: r.evidence[0].content.section, p: r.evidence[0].content.pageStart }));
  });

  await runCase('P2', '附件 Evidence 与分类', async function () {
    var r = await PA.parseBytes(pdf, { fileName: 'local-paper.pdf' });
    var item = { name: 'local-paper.pdf', size: pdf.length, kind: 'paper', paper: r };
    var pack = AttEv.fromAttachments([item]);
    ok('P2.1 论文附件生成 Evidence', pack.evidence.length >= 1);
    ok('P2.2 allSupported 为真', pack.allSupported === true);
    ok('P2.3 不再是 allFits', pack.allFits === false);
    ok('P2.4 文件分类为 paper', ATT.kindOf({ name: 'x.pdf', type: 'application/pdf', size: 10 }) === 'paper');
    ok('P2.5 文本附件仍是 text', ATT.kindOf({ name: 'x.txt', type: 'text/plain', size: 10 }) === 'text');
  });

  await runCase('P3', '失败与限制', async function () {
    var bad = await PA.parseBytes(new Uint8Array(200), { fileName: 'bad.pdf' });
    ok('P3.1 非 PDF 明确失败', bad.ok === false && bad.code === 'not_pdf', bad.code);
    var big = await PA.parseBytes(pdf, { fileName: 'big.pdf', maxBytes: 100 });
    ok('P3.2 大小限制', big.ok === false && big.code === 'pdf_too_large', big.code);
    var empty = await PA.parseBytes(new Uint8Array(0), { fileName: 'empty.pdf' });
    ok('P3.3 空文件失败', empty.ok === false, empty.code);
    var item = { name: 'bad.pdf', kind: 'paper', paper: bad };
    var pack = AttEv.fromAttachments([item]);
    ok('P3.4 失败不生成全文证据', pack.evidence.length === 0 && pack.gaps.length >= 1);
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' +
      cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-4-paper-attachment] ' + (e && e.stack || e));
  process.exit(1);
});
