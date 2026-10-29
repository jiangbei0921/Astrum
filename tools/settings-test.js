/* ASTRUM · 设置两级导航测试（零依赖）
 *
 * 守的是「列表 ↔ 详情」这套结构本身：
 *   1) 一级只见分类入口，不出现任何具体设置行
 *   2) 点进去只显示该分类的内容，标题与入口标题一致
 *   3) 返回、切页签、Esc 都能回到列表；列表里再按 Esc 才关面板
 *   4) 每个页签都走同一套结构（来源 / 帮助也一致）
 *
 * 时序一律 until(条件) 轮询，不猜固定毫秒：连跑多个 Chrome 实例时负载会变，
 * 固定 setTimeout 会随机红。
 *
 * 用法：node tools/settings-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

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
  function ok(n, p, x) { if (done) return; R.push({ n: n, p: !!p, x: x === undefined ? '' : String(x) }); }
  function finish() {
    if (done) return; done = true;
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? (' | ' + r.x) : ''); }).join('\\n');
    document.body.appendChild(el);
  }
  setTimeout(function () { ok('看门狗：流程未在 40s 内完成', false, ''); finish(); }, 40000);

  function until(cond, cb, ms) {
    var t0 = Date.now();
    var limit = ms || 6000;
    (function tick() {
      var v;
      try { v = cond(); } catch (e) { v = false; }
      if (v) return cb(true);
      if (Date.now() - t0 > limit) return cb(false);
      setTimeout(tick, 60);
    })();
  }

  var body = null;
  function items() { return Array.prototype.slice.call(body.querySelectorAll('.sec-item')); }
  function backBtn() { return body.querySelector('.sec-back'); }
  function detailTitle() { return body.querySelector('.sec-detail-title'); }
  function rowCount() { return body.querySelectorAll('.set-row').length; }
  function openTab(cn) {
    var want = window.I18N.t(cn);
    var btns = body.querySelectorAll('.set-tabs button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === want) { btns[i].click(); return true; }
    }
    return false;
  }
  function esc() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  /* 详情标题形如「02 对话与表述」，取掉序号后的文字 */
  function titleText() {
    var t = detailTitle();
    if (!t) return '';
    var gt = t.querySelector('.gn');
    return t.textContent.replace(gt ? gt.textContent : '', '').trim();
  }

  setTimeout(function () {
    window.__astrum.openSheet('settings');
    /* 条件函数里不能用 body：它要等这个回调才赋值，先取 body 会让条件永远为假 */
    until(function () { return document.querySelectorAll('#settingsBody .sec-item').length > 0; }, function (got) {
      body = document.getElementById('settingsBody');

      /* ---------- 一级：只有分类入口 ---------- */
      ok('设置页显示分类列表', got, 'items=' + items().length);
      ok('列表页不含具体设置行', rowCount() === 0, 'rows=' + rowCount());

      var its = items();
      ok('分类入口都有标题', its.every(function (b) {
        var t = b.querySelector('.si-t');
        return t && t.textContent.trim().length > 0;
      }));

      var noNum = its.filter(function (b) {
        var sn = b.querySelector('.sn');
        return !sn || !/[0-9]/.test(sn.textContent);
      });
      ok('分类入口都有序号', noNum.length === 0, '缺序号 ' + noNum.length + ' / 共 ' + its.length);

      var nums = its.map(function (b) { return b.querySelector('.sn').textContent.trim(); });
      var expect = its.map(function (_, i) { return (i + 1) < 10 ? '0' + (i + 1) : String(i + 1); }).join(',');
      ok('入口序号连续', nums.join(',') === expect, nums.join(','));

      ok('入口带一句摘要', its.some(function (b) {
        var d = b.querySelector('.si-d');
        return d && d.textContent.trim().length > 0;
      }));

      var firstName = its[0].querySelector('.si-t').textContent.trim();

      /* ---------- 进入详情 ---------- */
      its[0].click();
      until(function () { return !!detailTitle(); }, function (entered) {
        ok('点击入口进入详情', entered);
        ok('详情页有返回键', !!backBtn(), backBtn() ? backBtn().textContent.trim() : 'missing');
        ok('详情页不再显示分类列表', items().length === 0, 'items=' + items().length);
        ok('详情标题与入口标题一致', titleText() === firstName, titleText() + ' vs ' + firstName);
        ok('详情页显示具体设置项', rowCount() > 0, 'rows=' + rowCount());

        /* ---------- 返回 ---------- */
        backBtn().click();
        until(function () { return items().length > 0; }, function (backed) {
          ok('返回后回到分类列表', backed && !detailTitle(), 'items=' + items().length);

          /* ---------- 换页签要回到列表，不能停在上一个详情 ---------- */
          items()[0].click();
          until(function () { return !!detailTitle(); }, function () {
            openTab('来源');
            until(function () { return items().length > 0 && !detailTitle(); }, function (reset) {
              ok('换页签回到新页签的列表', reset, 'items=' + items().length + ' title=' + (detailTitle() ? '有' : '无'));
              ok('来源页有分类入口', items().length >= 2, 'items=' + items().length);

              /* ---------- 帮助页也走同一套结构 ---------- */
              openTab('帮助');
              until(function () { return items().length >= 3; }, function (helpOk) {
                ok('帮助页同样两级化', helpOk, 'items=' + items().length);

                /* ---------- Esc：详情 → 列表，列表 → 关面板 ---------- */
                openTab('设置');
                until(function () { return items().length > 0; }, function () {
                  items()[0].click();
                  until(function () { return !!detailTitle(); }, function () {
                    esc();
                    until(function () { return items().length > 0 && !detailTitle(); }, function (escBack) {
                      ok('详情里按 Esc 回到列表', escBack);
                      var stillOpen = document.getElementById('settings').classList.contains('on');
                      ok('此时面板仍未关闭', stillOpen);

                      esc();
                      setTimeout(function () {
                        ok('列表里再按 Esc 关闭面板',
                          !document.getElementById('settings').classList.contains('on'));
                        finish();
                      }, 260);
                    }, 4000);
                  }, 4000);
                }, 4000);
              }, 4000);
            }, 5000);
          }, 4000);
        }, 4000);
      }, 4000);
    }, 6000);
  }, 700);
})();
`;

function main() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>' + html.slice(idx);

  var tmp = path.join(ROOT, '__settings_test.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), '__settings_profile_' + process.pid + '_' + Date.now());

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile,
      '--window-size=1280,1000',
      '--virtual-time-budget=45000',
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
    console.error('[settings-test] 未取得结果。输出片段：');
    console.error(out.slice(-1200));
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
