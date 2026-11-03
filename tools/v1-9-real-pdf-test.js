/* ASTRUM · V1.9 真实复杂 PDF 验证
 *
 * 使用公开 arXiv 论文（不在仓库内分发 PDF 本体，运行前按 manifest 下载到
 * tools/fixtures/pdf-real/，该目录已 gitignore）。
 *
 * 覆盖：长篇/双栏/公式/表格/参考文献、真实 CID 编码、乱码必须拒绝。
 * 不使用合成 PDF 冒充真实样本；缺样本时明确 BLOCKED_SAMPLE。
 *
 * 用法：
 *   node tools/v1-9-real-pdf-test.js
 *   node tools/v1-9-real-pdf-test.js --offline   # 只用本地已下载样本
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var crypto = require('crypto');
var ROOT = path.resolve(__dirname, '..');
var DIR = path.join(ROOT, 'tools', 'fixtures', 'pdf-real');
var OUT = path.join(ROOT, 'tools', 'fixtures', 'v1-9-real-pdf-results.json');
var OFFLINE = process.argv.indexOf('--offline') >= 0;

global.window = global;
require(path.join(ROOT, 'core/pdf-text.js'));
var Pdf = global.AstroPdfText;

var SAMPLES = [
  {
    id: '1106.4307v1', url: 'https://arxiv.org/pdf/1106.4307v1',
    sha256: 'd4729548bce76a9d8d02b073d51b5e9e81079d8ea8f0c2bf616aaa6b55b8daf7',
    titleIncludes: 'Globular clusters in the outer Galactic halo',
    pages: 29, refsStart: 25, minSections: 8, minChunks: 30, minChars: 40000,
    traits: ['long', 'two-column', 'tables', 'references']
  },
  {
    id: '0901.4842v1', url: 'https://arxiv.org/pdf/0901.4842v1',
    sha256: '64983d011c9184997257acbf33930930e87e754cbd2af48249729094ee53c364',
    titleIncludes: 'Challenges for stellar pulsation',
    pages: 11, refsStart: 9, minSections: 5, minChunks: 20, minChars: 30000,
    traits: ['proceedings', 'equations', 'references']
  },
  {
    id: '1512.06519v1', url: 'https://arxiv.org/pdf/1512.06519v1',
    sha256: 'bbf4547f816dc85ca66ed615763ed6f1608f07ed8bcf8559818bece11a4faaa7',
    titleIncludes: 'Collision between Neutron Stars and Asteroids',
    pages: 6, refsStart: 6, minSections: 8, minChunks: 15, minChars: 12000,
    traits: ['equations', 'multi-column', 'references']
  },
  {
    id: '2302.11645v1', url: 'https://arxiv.org/pdf/2302.11645v1',
    sha256: '9be32eb50570acb1c6a14ac00b5771f247727a16449312dd5fd04df408f711b2',
    titleIncludes: 'Axion-mediated Transport of Fast Radio Bursts',
    pages: 9, refsStart: 8, minSections: 4, minChunks: 18, minChars: 25000,
    traits: ['equations', 'references']
  },
  {
    id: '2206.14908v1', url: 'https://arxiv.org/pdf/2206.14908v1',
    sha256: '0a0c4ba06304eb9dcfd9fe9956a0e271f0a3b9d11eb083a081906d36f37d8304',
    titleIncludes: 'The Prime Focus Spectrograph Galaxy Evolution Survey',
    pages: 28, refsStart: 25, minSections: 4, minChunks: 60, minChars: 80000,
    traits: ['large-14MB', 'long', 'two-column', 'tables', 'references']
  },
  {
    id: '2208.11692v1', url: 'https://arxiv.org/pdf/2208.11692v1',
    sha256: 'afab6aec1c644e50e0aa2d61f99f86b7e27501da577c8d6423068efbd8257c96',
    expectFail: 'pdf_unsupported_encoding',
    titleIncludes: 'Identification of carbon dioxide in an exoplanet atmosphere',
    traits: ['real-cid-encoding', 'garbled-must-reject']
  }
];

var results = [];
function ok(name, pass, extra) {
  results.push({ name: name, pass: !!pass, extra: extra == null ? '' : String(extra) });
}
function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }
async function ensureSample(s) {
  fs.mkdirSync(DIR, { recursive: true });
  var file = path.join(DIR, s.id + '.pdf');
  if (fs.existsSync(file)) return fs.readFileSync(file);
  if (OFFLINE) return null;
  try {
    var r = await fetch(s.url, { signal: AbortSignal.timeout(120000), headers: { 'User-Agent': 'ASTRUM-v1.9-pdf-test/1.0' } });
    if (!r.ok) return null;
    var buf = Buffer.from(await r.arrayBuffer());
    fs.writeFileSync(file, buf);
    return buf;
  } catch (e) { return null; }
}
function alphaRatio(text) {
  var t = String(text || '');
  if (!t.length) return 0;
  return (t.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length / t.length;
}

(async function main() {
  var jsonRows = [];
  var blocked = 0;
  for (var i = 0; i < SAMPLES.length; i++) {
    var s = SAMPLES[i];
    var buf = await ensureSample(s);
    if (!buf) {
      blocked += 1;
      jsonRows.push({ id: s.id, status: 'BLOCKED_SAMPLE', traits: s.traits, url: s.url });
      console.log('BLOCKED_SAMPLE | ' + s.id + ' | ' + s.url);
      continue;
    }
    ok(s.id + ' 样本来源校验', sha256(buf) === s.sha256, sha256(buf).slice(0, 16));
    var started = Date.now();
    var r = await Pdf.parse(new Uint8Array(buf));
    var ms = Date.now() - started;
    var row = {
      id: s.id, status: '', traits: s.traits, url: s.url, bytes: buf.length,
      ms: ms, ok: r.ok, code: r.code || '', title: r.title || '',
      pages: r.pageCount || 0, sections: (r.sections || []).length,
      chunks: (r.chunks || []).length, referencesStartPage: r.referencesStartPage,
      warnings: (r.warnings || []).slice(0, 6)
    };
    jsonRows.push(row);

    if (s.expectFail) {
      ok(s.id + ' 明确拒绝乱码', r.ok === false && r.code === s.expectFail, r.code);
      ok(s.id + ' 不返回伪造全文', !r.text || r.text.length === 0, r.text && r.text.length);
      ok(s.id + ' 记录失败原因', !!(r.error || '').length, r.error);
      row.status = r.ok === false && r.code === s.expectFail ? 'PASS_REJECTED' : 'FAIL';
      console.log((row.status === 'PASS_REJECTED' ? 'PASS' : 'FAIL') + ' | ' + s.id +
        ' | 拒绝乱码 ' + (r.code || '-') + ' | ' + ms + 'ms');
      continue;
    }

    ok(s.id + ' 解析成功', r.ok === true, r.code);
    if (r.ok) {
      ok(s.id + ' 页数', r.pageCount === s.pages, 'actual=' + r.pageCount + ' expected=' + s.pages);
      ok(s.id + ' 标题可识别', String(r.title || '').indexOf(s.titleIncludes) >= 0, r.title);
      ok(s.id + ' 章节数', (r.sections || []).length >= s.minSections, (r.sections || []).length);
      ok(s.id + ' 分块数', (r.chunks || []).length >= s.minChunks, (r.chunks || []).length);
      ok(s.id + ' 文本长度', (r.textLength || 0) >= s.minChars, r.textLength);
      ok(s.id + ' 参考文献起始页', r.referencesStartPage === s.refsStart, r.referencesStartPage);
      var refSec = (r.sections || []).filter(function (x) { return x.isReferences; })[0];
      ok(s.id + ' 参考文献章节存在', !!refSec, JSON.stringify((r.sections || []).slice(-2)));
      ok(s.id + ' 参考文献不污染证据块',
        (r.chunks || []).every(function (c) { return c.pageStart == null || c.pageStart <= s.refsStart; }),
        (r.chunks || []).map(function (c) { return c.pageStart; }).filter(function (p) { return p > s.refsStart; }).join(','));
      ok(s.id + ' 无粘连参考标题',
        (r.sections || []).every(function (x) { return !/References\.?\s*\|/i.test(x.name); }),
        (r.sections || []).map(function (x) { return x.name; }).filter(function (n) { return /References\.?\s*\|/i.test(n); }).join(';'));
      ok(s.id + ' 章节页码单调', (function () {
        var last = 0, good = true;
        (r.sections || []).forEach(function (x) {
          if (x.pageStart == null) return;
          if (x.pageStart < last) good = false;
          last = x.pageStart;
        });
        return good;
      })(), JSON.stringify((r.sections || []).map(function (x) { return x.pageStart; })));
      ok(s.id + ' 正文字母比例正常', alphaRatio(r.text) > 0.5, alphaRatio(r.text).toFixed(3));
      ok(s.id + ' 无 NaN/undefined', !/NaN|undefined/.test(JSON.stringify(r)), '');
      ok(s.id + ' 非扫描件', r.ocrRequired === false, r.ocrRequired);
      row.status = 'PASS';
      console.log('PASS | ' + s.id + ' | pages=' + r.pageCount + ' sections=' + (r.sections || []).length +
        ' chunks=' + (r.chunks || []).length + ' refs@p' + r.referencesStartPage + ' | ' + ms + 'ms');
    } else {
      row.status = 'FAIL';
      console.log('FAIL | ' + s.id + ' | ' + (r.code || '-') + ' | ' + (r.error || '') + ' | ' + ms + 'ms');
    }
  }

  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra)); });
  console.log('\nRESULT ' + (results.length - failed.length) + '/' + results.length +
    ' | BLOCKED_SAMPLE ' + blocked);
  fs.writeFileSync(OUT, JSON.stringify({
    generatedAt: new Date().toISOString(),
    environment: { node: process.version, os: os.platform(), offline: OFFLINE },
    samples: jsonRows
  }, null, 2) + '\n', 'utf8');
  console.log('JSON ' + OUT);
  process.exitCode = failed.length ? 1 : (blocked ? 2 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
