/* ASTRUM · 设置面板层级测试（零依赖）
 *
 * 守的是「层级不要退化」：
 *   1) 页签(L1) → 小节(L2，带序号) → 组内小节标题(L3) → 行(L4) 这四层必须都在
 *   2) 索引条与分组一一对应（数量、文字、顺序）
 *   3) 序号连续、视觉元素不进无障碍名
 *   4) 单节页签不渲染索引（只有一节时索引是噪音）
 *   5) 滚动/点击时高亮跟随
 *
 * 为什么不断言「索引有 4 项」这类硬数字：文案增删就会红，
 * 而真正要守的是「索引和分组对得上」。所以用自洽断言。
 *
 * 时序一律用 until(条件) 轮询，不猜固定毫秒：
 * 连续跑多个 Chrome 实例时机器负载会变，固定 setTimeout 会随机红。
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

  /* 等一个条件成立，而不是等一个固定时长 */
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
  function groups() { return Array.prototype.slice.call(body.querySelectorAll('.group')); }
  function chips() { return Array.prototype.slice.call(body.querySelectorAll('.si-chip')); }
  function onChip() {
    var on = body.querySelector('.si-chip.on');
    return on ? on.textContent.trim() : '';
  }
  function headText(g) {
    var gt = g.querySelector('h4 .gt');
    return gt ? gt.textContent.trim() : '';
  }
  function openTab(cn) {
    var want = window.I18N.t(cn);
    var btns = body.querySelectorAll('.set-tabs button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === want) { btns[i].click(); return true; }
    }
    return false;
  }

  /* 点第三节 → 等它高亮 → 滚到第二节 → 等它高亮 → 触底 → 高亮仍在视口内 */
  function phaseScroll() {
    var third = chips()[2];
    if (!third) {
      ok('主页签至少有 3 个小节（否则无法验证跳转）', false, 'chips=' + chips().length);
      finish();
      return;
    }
    var want3 = third.textContent.trim();
    third.click();
    until(function () { return onChip() === want3; }, function (got3) {
      ok('点击索引后该项高亮', got3, onChip());

      /* 点击会锁 900ms 的滚动联动，等锁过期再手动滚，否则这次滚动会被吞掉 */
      setTimeout(function () {
        var s2 = document.getElementById('set-sec-2');
        var want2 = chips()[1].textContent.trim();
        body.scrollTop = s2.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 46;
        until(function () { return onChip() === want2; }, function (got2) {
          ok('滚动到第二节时高亮它', got2, onChip());

          body.scrollTop = body.scrollHeight;
          until(function () {
            var on = body.querySelector('.si-chip.on');
            if (!on) return false;
            var sec = groups()[chips().indexOf(on)];
            if (!sec) return false;
            var r = sec.getBoundingClientRect(), br = body.getBoundingClientRect();
            return r.top < br.bottom && r.bottom > br.top;
          }, function (got4) {
            ok('触底时高亮项仍在视口内', got4, 'on=' + onChip());
            phaseOtherTabs();
          }, 4000);
        }, 4000);
      }, 1100);
    }, 4000);
  }

  function phaseOtherTabs() {
    openTab('观测');
    until(function () { return groups().length > 0; }, function () {
      var g1 = groups().length, c1 = chips().length;
      if (g1 >= 2) ok('两节以上的页签有索引', c1 === g1, c1 + ' vs ' + g1);
      else ok('单节页签不渲染索引', c1 === 0, 'groups=' + g1 + ' chips=' + c1);

      openTab('数据与档案');
      until(function () { return groups().length >= 3; }, function () {
        var gs2 = groups();
        var missing = gs2.filter(function (g) { return !g.querySelector('h4 .gn'); });
        ok('手写分组的序号不缺失', missing.length === 0,
          '缺序号 ' + missing.length + ' / 共 ' + gs2.length);
        ok('数据页索引项数 = 分组数', chips().length === gs2.length,
          chips().length + ' vs ' + gs2.length);
        finish();
      }, 4000);
    }, 4000);
  }

  setTimeout(function () {
    window.__astrum.openSheet('settings');
    until(function () {
      return !!document.querySelector('#settingsBody .set-index');
    }, function () {
      body = document.getElementById('settingsBody');

      /* ---------- 四层结构与索引 ---------- */
      var gs = groups();
      var cs = chips();
      ok('主页签有分组', gs.length >= 2, 'groups=' + gs.length);
      ok('主页签渲染了索引条', cs.length > 0, 'chips=' + cs.length);
      ok('索引项数 = 分组数', cs.length === gs.length, cs.length + ' vs ' + gs.length);

      var navText = cs.map(function (c) { return c.textContent.trim(); }).join(' | ');
      var headTexts = gs.map(headText).join(' | ');
      ok('索引文字与分组标题一一对应', navText === headTexts, navText + ' ≠ ' + headTexts);

      var nums = gs.map(function (g) {
        var gn = g.querySelector('h4 .gn');
        return gn ? gn.textContent.trim() : '';
      });
      var expect = gs.map(function (_, i) { return (i + 1) < 10 ? '0' + (i + 1) : String(i + 1); }).join(',');
      ok('分组序号连续', nums.join(',') === expect, nums.join(','));

      /* 序号只是刻度：不能被读屏念成「01Language」 */
      ok('序号不进入无障碍名称', gs.every(function (g) {
        var gn = g.querySelector('h4 .gn');
        return gn && gn.getAttribute('aria-hidden') === 'true';
      }));

      ok('分组标题都有可见文字', gs.every(function (g) { return headText(g).length > 0; }));

      var nav = body.querySelector('.set-index');
      ok('索引条吸顶', nav && getComputedStyle(nav).position === 'sticky',
        nav ? getComputedStyle(nav).position : 'missing');

      phaseScroll();
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
