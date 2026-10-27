/* ASTRUM · 无障碍专项测试（零依赖）
 *
 * 覆盖：可访问名称 / 地标与 role / live region / tab 状态 / 跳转链接 / 焦点管理
 *
 * 说明：这里只做「结构可查」的断言，不做真实读屏验证。
 * 目的是防止以后新增按钮或面板时又把可访问名称漏掉。
 *
 * 用法：node tools/a11y-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');

function findChrome() {
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < c.length; i++) { if (fs.existsSync(c[i])) return c[i]; }
  return 'chrome';
}

var SCRIPT = `
(function () {
  var R = [];
  var done = false;
  function ok(n, p, x) { if (done) return; R.push({ n: n, p: !!p, x: x || '' }); }
  setTimeout(function () { if (!done) { ok('看门狗', false, '未在 20s 内完成'); finish(); } }, 20000);
  function finish() {
    if (done) return; done = true;
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? (' | ' + r.x) : ''); }).join('\\n');
    document.body.appendChild(el);
  }

  setTimeout(function () {
    /* 1) 所有按钮都要有可访问名称 */
    var noName = [];
    Array.prototype.forEach.call(document.querySelectorAll('button'), function (b) {
      var name = (b.getAttribute('aria-label') || '').trim() ||
                 (b.textContent || '').trim() ||
                 (b.getAttribute('title') || '').trim();
      if (!name) noName.push(b.id || b.className || '(匿名)');
    });
    ok('按钮都有可访问名称', noName.length === 0, noName.slice(0, 3).join(','));

    /* 2) 线程区是 live log，新答案会被播报 */
    var th = document.getElementById('thread');
    ok('对话区带 role=log 与 aria-live',
       !!(th && th.getAttribute('role') === 'log' && th.getAttribute('aria-live')),
       th ? (th.getAttribute('role') + '/' + th.getAttribute('aria-live')) : 'missing');

    /* 3) 跳转链接与主地标 */
    var skip = document.querySelector('.skip-link');
    ok('存在跳转到主内容的链接', !!(skip && skip.getAttribute('href') === '#main'));
    ok('主地标存在', !!document.getElementById('main'));

    /* 4) 模式切换的语义状态 */
    var tabs = document.querySelectorAll('#modeSeg button[role="tab"]');
    var allSelected = tabs.length > 0;
    Array.prototype.forEach.call(tabs, function (t) {
      if (!t.hasAttribute('aria-selected')) allSelected = false;
    });
    ok('模式切换带 aria-selected', allSelected, 'n=' + tabs.length);

    /* 5) toast 是 live region —— 触发一次真实提示来验证 */
    window.__astrum.ask('');
    var t = document.getElementById('toast');
    ok('toast 是 live region',
       !!(t && (t.getAttribute('role') === 'status' || t.getAttribute('aria-live'))),
       t ? (t.getAttribute('role') + '/' + t.getAttribute('aria-live')) : 'missing');

    /* 6) 打开设置：焦点进入面板 */
    var btn = document.getElementById('btnSettings');
    btn.focus();
    window.__astrum.openSheet('settings');
    setTimeout(function () {
      var inPanel = !!(document.getElementById('settings').contains(document.activeElement));
      ok('打开设置后焦点进入面板', inPanel,
         document.activeElement ? (document.activeElement.tagName + '.' + document.activeElement.className) : 'none');

      /* 7) Esc 关闭后焦点回到触发点 */
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      setTimeout(function () {
        ok('关闭后焦点回到触发按钮', document.activeElement === btn,
           document.activeElement ? (document.activeElement.id || document.activeElement.tagName) : 'none');

        /* 8) 折叠区用原生 details，键盘可达 */
        ok('折叠区是原生 details',
           !!document.querySelector('details.trace-fold, details.verify-fold, details.q-block') ||
           document.querySelectorAll('.msg.bot').length === 0);
        finish();
      }, 200);
    }, 250);
  }, 400);
})();
`;

function main() {
  var file = path.join(ROOT, 'index.html');
  var html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>' + html.slice(idx);

  var tmp = path.join(ROOT, '__a11y_tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(require('os').tmpdir(), '__a11y_profile_' + process.pid + '_' + Date.now());
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=30000',
      '--dump-dom',
      'file:///' + tmp.replace(/\\/g, '/')
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }
  try { fs.unlinkSync(tmp); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var m = out.match(/<pre id="__st_result">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('[a11y-test] 未取得结果。输出片段：');
    console.error(out.slice(-1500));
    process.exit(1);
  }
  var text = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log(text);

  var head = (text.split('\n')[0] || '').trim();
  var mm = head.match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main();
