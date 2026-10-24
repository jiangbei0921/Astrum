/* ASTRUM · 单文件构建脚本（零依赖，Node 内置模块）
 *
 * 目的：把 index.html + assets/app.css + data/*.js + core/*.js 打包成一个
 *       完全自包含的 HTML 文件（astrum-standalone.html）。
 *
 * 为什么要它：多文件版本依赖「index.html 与 assets/ core/ data/ 同目录」。
 *       一旦目录被拆散、文件被单独拷贝/转发、或在某些预览沙箱里被单独打开，
 *       外部子资源会 404 —— 页面退化成无样式的裸 HTML，JS 也不执行。
 *       单文件版本把 CSS/JS 全部内联，天然免疫这类问题。
 *
 * 安全：内联脚本用 CSP sha256 hash 授权，不放开 'unsafe-inline'。
 *       任何对脚本内容的改动都必须重新运行本脚本，否则 hash 失配被 CSP 拦截。
 *
 * 用法：node tools/build-standalone.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var ROOT = path.resolve(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var OUT = path.join(ROOT, 'astrum-standalone.html');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

/* 内联脚本内容里不能出现 </script>，否则 HTML 解析器会提前截断 */
function assertInlineSafe(code, label) {
  if (/<\/script/i.test(code)) {
    throw new Error(label + ' 含 </script 字面量，无法安全内联');
  }
  if (/<!--/.test(code)) {
    throw new Error(label + ' 含 <!-- 字面量，无法安全内联');
  }
}

function sha256B64(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('base64');
}

/* HTML 解析器会把脚本内容中的 CRLF / CR 归一化为 LF，
   CSP hash 必须按归一化后的字节计算，否则浏览器判定失配并拦截脚本。 */
function normalizeNewlines(str) {
  return str.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function main() {
  var html = read('index.html');

  /* 1) 内联 CSS */
  var css = normalizeNewlines(read('assets/app.css'));
  assertInlineSafe(css, 'app.css');
  html = html.replace(
    /[ \t]*<link rel="stylesheet" href="assets\/app\.css" \/>[ \t]*\r?\n?/,
    '<style id="astrum-app-css">\n' + css + '\n</style>\n'
  );

  /* 2) 内联所有 <script src="...">，保持原有顺序 */
  var hashes = [];
  var srcRe = /[ \t]*<script src="([^"]+)"><\/script>[ \t]*\r?\n?/g;
  var m;
  var count = 0;
  while ((m = srcRe.exec(html)) !== null) {
    var rel = m[1];
    var code = normalizeNewlines(read(rel));
    assertInlineSafe(code, rel);
    /* CSP hash 精确匹配 <script> 标签内的文本，故只能对纯代码取哈希，
       注释必须放在标签之外 */
    hashes.push("'sha256-" + sha256B64(code) + "'");
    count++;
    var replacement = '<!-- ' + rel + ' -->\n<script>' + code + '</script>\n';
    html = html.replace(m[0], function () { return replacement; });
  }
  if (!count) throw new Error('未找到任何 <script src>，构建中止');

  /* 3) 重写 CSP：为内联脚本加入 hash 授权
     3a) 已被内联的 <script src> —— 哈希在上一步算好
     3b) 原文件中已存在的内联 <script>（如启动守卫）—— 需重新计算，
         因为其文本在规范化换行后可能与原文件不同 */
  var inlineHashes = [];
  var inlineRe = /<script>([\s\S]*?)<\/script>/g;
  var im;
  while ((im = inlineRe.exec(html)) !== null) {
    inlineHashes.push("'sha256-" + sha256B64(im[1]) + "'");
  }
  var allHashes = hashes.concat(inlineHashes);

  var cspRe = /<meta http-equiv="Content-Security-Policy" content="([^"]*)" \/>/;
  var cspMatch = html.match(cspRe);
  if (!cspMatch) throw new Error('未找到 CSP meta，构建中止');
  var csp = cspMatch[1];
  csp = csp.replace(/script-src [^;]*/, 'script-src ' + allHashes.join(' '));
  html = html.replace(cspRe, '<meta http-equiv="Content-Security-Policy" content="' + csp + '" />');

  /* 4) 标注单文件版本 */
  html = html.replace(
    '<title>ASTRUM · 天文多智能体工作台</title>',
    '<title>ASTRUM · 天文多智能体工作台（单文件版）</title>\n' +
    '<!-- 单文件自包含构建：由 tools/build-standalone.js 生成，请勿手工编辑；\n' +
    '     修改源码后重新运行 node tools/build-standalone.js -->\n'
  );

  fs.writeFileSync(OUT, html, 'utf8');

  var kb = (fs.statSync(OUT).size / 1024).toFixed(0);
  console.log('[astrum] 单文件构建完成');
  console.log('  输出: ' + OUT);
  console.log('  内联脚本: ' + count + ' 个, CSS: ' + (css.length / 1024).toFixed(0) + ' KB');
  console.log('  体积: ' + kb + ' KB');
}

main();
