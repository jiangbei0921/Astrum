/* ASTRUM · V1.2 部署静态检查
 * 覆盖：相对路径、模块顺序、standalone 重建/内联、CSP 主机、新模块存在。
 * 真实 Chrome/file:// 由 v1-1-browser-test / selftest 覆盖。
 * 用法：node tools/v1-2-deploy-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var ROOT = path.resolve(__dirname, '..');

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function caseRun(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.message || e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

var INDEX = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

caseRun('D1', '相对路径与模块顺序', function () {
  var srcs = [], re = /<script\s+src="([^"]+)"/g, m;
  while ((m = re.exec(INDEX))) srcs.push(m[1]);
  ok('D1.1 无绝对路径', srcs.every(function (s) {
    return !/^\/|^[A-Za-z]:\\|^https?:/i.test(s);
  }), JSON.stringify(srcs.filter(function (s) { return /^\/|^[A-Za-z]:\\|^https?:/i.test(s); })));
  ok('D1.2 资源全部相对 core/data', srcs.every(function (s) {
    return s.indexOf('core/') === 0 || s.indexOf('data/') === 0;
  }));
  function idx(name) { return srcs.indexOf(name); }
  ok('D1.3 control 在 request 前', idx('core/control.js') < idx('core/request.js'));
  ok('D1.4 request 在 bridge 前', idx('core/request.js') < idx('core/control-bridge.js'));
  ok('D1.5 attachment evidence 已加载', idx('core/attachment-evidence.js') >= 0);
  ok('D1.6 research ui 已加载', idx('core/research-ui.js') >= 0);
  ok('D1.7 app 最后加载', srcs[srcs.length - 1] === 'core/app.js', srcs[srcs.length - 1]);
});

caseRun('D2', 'CSP 与外部主机', function () {
  var csp = INDEX.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/);
  ok('D2.1 存在 CSP', !!csp);
  var c = csp ? csp[1] : '';
  ok('D2.2 connect-src 含 SIMBAD', c.indexOf('simbad.u-strasbg.fr') >= 0);
  ok('D2.3 connect-src 含论文源', c.indexOf('api.openalex.org') >= 0 && c.indexOf('api.semanticscholar.org') >= 0);
  ok('D2.4 object-src none', c.indexOf("object-src 'none'") >= 0);
  ok('D2.5 无 unsafe-eval', c.indexOf("'unsafe-eval'") < 0);
});

caseRun('D3', 'standalone 重建', function () {
  var out = cp.execFileSync(process.execPath, ['tools/build-standalone.js'], {
    cwd: ROOT, encoding: 'utf8', timeout: 120000
  });
  var file = path.join(ROOT, 'astrum-standalone.html');
  var html = fs.readFileSync(file, 'utf8');
  ok('D3.1 构建成功', fs.existsSync(file) && html.length > 1200000, String(html.length));
  ok('D3.2 新模块已内联', html.indexOf('AstroAttachmentEvidence') >= 0 &&
    html.indexOf('AstroResearchUI') >= 0 && html.indexOf('AstroControlBridge') >= 0);
  ok('D3.3 无外链 core 脚本', !/<script\s+src="core\//.test(html));
  ok('D3.4 构建日志包含内联脚本数', /内联脚本/.test(out), out.split('\n').slice(-3).join(' | '));
});

caseRun('D4', 'file:// 与数据路径', function () {
  ok('D4.1 无脚本/资源指向本地服务器', !/<(script|link)[^>]+(src|href)="(http:\/\/localhost|https?:\/\/127\.0\.0\.1)/.test(INDEX));
  ok('D4.2 数据文件相对路径', /<script src="data\//.test(INDEX));
  ok('D4.3 CSS 相对路径', /href="assets\/app\.css"/.test(INDEX));
  ok('D4.4 无硬编码密钥', !/sk-[A-Za-z0-9]{12,}/.test(INDEX) && !/api[_-]?key\s*[:=]\s*["'][^"']{12,}/i.test(INDEX));
});

for (var i = 0; i < results.length; i++) {
  console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
}
console.log('');
for (var j = 0; j < cases.length; j++) {
  console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' + cases[j].title + ' | 断言 ' + cases[j].assertions);
}
console.log('');
console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
console.log('ASSERTIONS ' + pass + '/' + results.length);
console.log('RESULT ' + pass + '/' + results.length);
process.exit(pass === results.length ? 0 : 1);
