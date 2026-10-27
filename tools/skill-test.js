/* ASTRUM · 技能链路专项测试（零依赖）
 *
 * 为什么单独一个工具：
 *   selftest 会先跑十余个用例，留下的历史消息与技能记录会污染技能链路的断言
 *   （曾出现"消息数 +2"这类由测试互相干扰造成的假失败）。
 *   技能涉及「历史累积」这一状态，必须从一个干净的页面开始验证。
 *
 * 覆盖：技能面板渲染 / 空态 / 单条删除 / 全部清空 /
 *       器材复用（A）/ 承接上次结论（B）/ 档案优先于历史
 *
 * 用法：node tools/skill-test.js [file-url]
 */
'use strict';

var fs = require('fs');
var path = require('path');
var os = require('os');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var target = process.argv[2] || ('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));

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

/* 断言脚本：注入到页面 </body> 之前 */
var SCRIPT = `
(function () {
  var R = [];
  function ok(name, pass, extra) { R.push({ n: name, p: !!pass, x: extra || '' }); }
  function finish() {
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) {
        return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? (' | ' + r.x) : '');
      }).join('\\n');
    document.body.appendChild(el);
  }
  function idle(cb) {
    if (document.querySelector('.thinking')) { setTimeout(function () { idle(cb); }, 300); return; }
    cb();
  }
  function ask(q, cb) {
    idle(function () {
      var before = document.querySelectorAll('.msg.bot').length;
      window.__astrum.ask(q);
      var t = 0;
      var iv = setInterval(function () {
        t++;
        var bots = document.querySelectorAll('.msg.bot');
        var last = bots[bots.length - 1];
        var ready = bots.length > before && last && last.querySelector('.sec-verdict, .narr') && !document.querySelector('.thinking');
        if (ready || t > 80) { clearInterval(iv); cb(last || null); }
      }, 250);
    });
  }
  function panel() { return document.querySelector('.skill-panel'); }
  function openSettings() { window.__astrum.openSheet('settings'); }

  function hasReuseMark(bot) {
    var hit = false;
    if (!bot) return false;
    bot.querySelectorAll('.sec-gearfit .gf-check').forEach(function (x) {
      if (/沿用/.test(x.textContent)) hit = true;
    });
    return hit;
  }

  window.addEventListener('error', function (e) {
    R.push({ n: 'no uncaught error', p: false, x: String(e.message).slice(0, 60) });
  });

  setTimeout(function () {
    try {
      var ACx = window.AgentCore;
      if (!ACx) { ok('runtime', false, 'AgentCore missing'); finish(); return; }
      window.__astrum.setGearProfile('');
      window.confirm = function () { return true; };

      /* 1) 面板存在 */
      openSettings();
      /* 设置已分页：器材与技能在「观测」页 */
      document.querySelectorAll('#settingsBody .set-tabs button').forEach(function (b) {
        if (b.textContent.trim() === '观测') b.click();
      });
      ok('面板渲染', !!panel());

      /* 2) 清空后为空态 */
      var clear = panel() && panel().querySelector('.skill-clear');
      if (clear) clear.click();
      ok('清空后显示空态', !!(panel() && panel().querySelector('.skill-empty')));

      /* 3) 第一问：记录生成、不沿用 */
      ask('M42 用 80mm 能拍吗', function (bot1) {
        ok('首问不沿用', hasReuseMark(bot1) === false);
        openSettings();
        var items = panel() ? panel().querySelectorAll('.skill-item') : [];
        ok('记录已生成', items.length === 1, 'n=' + items.length);

        /* 4) 第二问：沿用 + 承接 */
        ask('M42 能拍得下吗', function (bot2) {
          var gf = bot2 && bot2.querySelector('.sec-gearfit');
          ok('未提器材时沿用上次', !!(gf && /80mm/.test(gf.textContent)),
             gf ? gf.textContent.replace(/\\s+/g, ' ').slice(0, 30) : 'no gearfit');
          ok('复用有显式提示', hasReuseMark(bot2));
          var rc = bot2 && bot2.querySelector('.recall');
          ok('承接上次结论', !!rc && /上次结论/.test(rc.textContent));

          /* 5) 档案优先：设了档案就不再沿用 */
          window.__astrum.setGearProfile('new200');
          ask('M42 能拍得下吗', function (bot3) {
            var gf3 = bot3 && bot3.querySelector('.sec-gearfit');
            ok('档案优先于历史', !!(gf3 && /200\\/1000/.test(gf3.textContent)),
               gf3 ? gf3.textContent.replace(/\\s+/g, ' ').slice(0, 30) : 'no gearfit');
            ok('档案生效时不显示沿用', hasReuseMark(bot3) === false);
            window.__astrum.setGearProfile('');

            /* 6) 单条删除 */
            openSettings();
            var del = panel() && panel().querySelector('.skill-del');
            if (del) del.click();
            ok('单条删除生效', !!(panel() && panel().querySelector('.skill-empty')),
               panel() ? ('items=' + panel().querySelectorAll('.skill-item').length) : 'no panel');

            finish();
          });
        });
      });
    } catch (e) {
      ok('init', false, String(e && e.message));
      finish();
    }
  }, 400);
})();
`;

function main() {
  if (!fs.existsSync(target.replace(/^file:\/\/\//, '').replace(/\//g, path.sep)) &&
      target.indexOf('file://') === 0) {
    console.error('[skill-test] 目标文件不存在: ' + target);
    process.exit(1);
  }
  var html = fs.readFileSync(target.replace(/^file:\/\/\//, '').replace(/\//g, path.sep), 'utf8');
  /* 注入脚本同样受 CSP 约束，临时副本里放开 script-src，避免被静默拦截 */
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var i = html.lastIndexOf('</body>');
  html = html.slice(0, i) + '<script>' + SCRIPT + '</script>' + html.slice(i);

  /* 必须写在项目目录：页面用相对路径引用 core/*.js，放临时目录会全部 404 */
  var tmp = path.join(ROOT, '__skilltest_tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--virtual-time-budget=60000',
      '--dump-dom',
      'file:///' + tmp.replace(/\\/g, '/')
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }

  try { fs.unlinkSync(tmp); } catch (e) {}

  var m = out.match(/<pre id="__st_result">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('[skill-test] 未取得结果。输出片段：');
    console.error(out.slice(-2000));
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
