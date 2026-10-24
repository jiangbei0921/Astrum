/* ASTRUM · CSP 内联脚本哈希同步工具（零依赖）
 *
 * 背景：index.html 的 CSP 使用 script-src 'self' 严格模式，不放开 'unsafe-inline'。
 *       启动守卫（资源缺失自诊断）必须内联在 index.html 中，
 *       因此需要用 sha256 hash 授权。
 *       浏览器在解析 HTML 时会把脚本内容的 CRLF/CR 归一化为 LF，
 *       所以哈希必须按归一化后的内容计算。
 *
 * 用法：node tools/sync-csp-hash.js          # 写入并同步 index.html
 *      node tools/sync-csp-hash.js --check  # 仅校验，不写入（CI 用）
 */
'use strict';

var fs = require('fs');
var path = require('path');
var crypto = require('crypto');

var INDEX = path.resolve(__dirname, '..', 'index.html');

function normalize(s) {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sha256B64(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64');
}

function main() {
  var check = process.argv.indexOf('--check') >= 0;
  var html = normalize(fs.readFileSync(INDEX, 'utf8'));

  /* 找出所有不含 src 的内联 <script> */
  var hashes = [];
  var re = /<script>([\s\S]*?)<\/script>/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    hashes.push("'sha256-" + sha256B64(m[1]) + "'");
  }
  if (!hashes.length) {
    console.log('[astrum] index.html 无内联脚本，CSP 无需 hash 授权');
    return;
  }

  /* 定位 script-src 段：保留 'self'，把内联 hash 追加在后面 */
  var cspRe = /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/;
  var cspMatch = html.match(cspRe);
  if (!cspMatch) {
    console.error('[astrum] 未找到 CSP script-src 段，无法同步');
    process.exit(1);
  }

  var selfPart = cspMatch[2]
    .split(/\s+/)
    .filter(function (t) { return t && t.charAt(0) !== "'" || t === "'self'"; })
    .join(' ');
  var want = (selfPart + ' ' + hashes.join(' ')).replace(/\s+/g, ' ').trim();

  if (cspMatch[2] === want) {
    console.log('[astrum] CSP 内联脚本哈希已是最新（' + hashes.length + ' 个）');
    return;
  }
  if (check) {
    console.error('[astrum] CSP 哈希失配，请运行: node tools/sync-csp-hash.js');
    process.exit(1);
  }

  html = html.replace(cspRe, function (_, head, _mid, tail) {
    return head + want + tail;
  });
  fs.writeFileSync(INDEX, html, 'utf8');
  console.log('[astrum] 已同步 CSP 内联脚本哈希: ' + hashes.length + ' 个');
}

main();
