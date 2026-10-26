/* ASTRUM · 数值一致性测试（零依赖）
 *
 * 守住一条底线：**身份只改表达，不改事实**。
 * 同一个问题在「看星 / 研究 / 了解」三种身份下，出现的数值必须一致。
 *
 * 判定方式（不用「集合完全相等」，因为深度不同信息量本就不同）：
 *   1) 对每个问题分别用三种身份提问；
 *   2) 抽取答案里的「数字 + 单位」，剔除置信度/耗时等元信息；
 *   3) 逐对比较：**较短答案里的每个数值，必须在较长答案里找到对应值**（相对误差 ≤ 5%）。
 *
 * 为什么允许 5%：语体会影响取整（专业给 57.3°，科普给 57°），
 * 这类差异不是事实冲突。真正的冲突是 1344 变成 1500，那会远超容差。
 *
 * 用法：node tools/consistency-test.js
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
  setTimeout(function () {
    if (done) return;
    ok('看门狗：流程未在 100s 内完成', false, '');
    finish();
  }, 100000);
  function finish() {
    if (done) return; done = true;
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? (' | ' + r.x) : ''); }).join('\\n');
    document.body.appendChild(el);
  }

  /* 数字 + 单位。排除时间/百分比，避免把耗时、占比当成事实 */
  var RE = /(\\d+(?:\\.\\d+)?)\\s*(万光年|亿光年|光年|kpc|Mpc|pc|AU|公里|km|毫米|mm|度|等|倍|小时|分钟|秒)/g;

  function extract(node) {
    var clone = node.cloneNode(true);
    ['.meta-bar', '.trace-fold', '.recall', '.model-note', '.verify-fold'].forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (x) { x.remove(); });
    });
    var txt = clone.textContent || '';
    var out = [];
    var m;
    RE.lastIndex = 0;
    while ((m = RE.exec(txt)) !== null) {
      out.push({ v: parseFloat(m[1]), u: m[2] });
    }
    return out;
  }

  /* 较短答案的每个值都要在较长答案里找到对应（同单位，误差 ≤5%） */
  function compare(a, b) {
    var small = a.length <= b.length ? a : b;
    var big = small === a ? b : a;
    var used = {};
    var miss = [];
    small.forEach(function (x) {
      var hit = false;
      for (var i = 0; i < big.length; i++) {
        if (used[i]) continue;
        if (big[i].u !== x.u) continue;
        var d = Math.abs(big[i].v - x.v);
        var tol = Math.max(Math.abs(x.v) * 0.05, 0.051);
        if (d <= tol) { used[i] = 1; hit = true; break; }
      }
      if (!hit) miss.push(x.v + x.u);
    });
    return miss;
  }

  function idle(cb) {
    if (document.querySelector('.thinking')) { setTimeout(function () { idle(cb); }, 300); return; }
    cb();
  }

  function askOnce(q, cb) {
    idle(function () {
      var before = document.querySelectorAll('.msg.bot').length;
      window.__astrum.ask(q);
      var t = 0;
      var iv = setInterval(function () {
        t++;
        var bots = document.querySelectorAll('.msg.bot');
        var last = bots[bots.length - 1];
        var ready = bots.length > before && last && last.querySelector('.sec-verdict, .narr') && !document.querySelector('.thinking');
        if (ready || t > 90) { clearInterval(iv); cb(last); }
      }, 250);
    });
  }

  var QS = ['猎户座大星云是什么', 'M31 能拍得下吗', '参宿四是什么'];
  var ROLES = ['observer', 'researcher', 'learner'];
  var i = 0;

  function nextQ() {
    if (i >= QS.length) { finish(); return; }
    var q = QS[i++];
    var store = {};
    var j = 0;
    function nextRole() {
      if (j >= ROLES.length) {
        var o = store.observer || [], r = store.researcher || [], l = store.learner || [];
        if (!o.length || !r.length || !l.length) {
          ok('「' + q + '」三种身份均有数值', false, 'o=' + o.length + ' r=' + r.length + ' l=' + l.length);
        } else {
          var m1 = compare(o, r), m2 = compare(o, l), m3 = compare(r, l);
          var all = m1.concat(m2, m3);
          ok('「' + q + '」数值跨身份一致', all.length === 0,
             all.length ? ('对不上：' + all.slice(0, 4).join('、')) : ('o=' + o.length + ' r=' + r.length + ' l=' + l.length));
        }
        nextQ();
        return;
      }
      var role = ROLES[j++];
      window.__astrum.applyPersona(role);
      askOnce(q, function (bot) {
        store[role] = bot ? extract(bot) : [];
        setTimeout(nextRole, 200);
      });
    }
    nextRole();
  }

  setTimeout(function () {
    /* 自检：证明比较器既能发现冲突、也能容忍取整。
     * 没有这一步，测试可能是「永远通过」的摆设。 */
    ok('自检：能发现数值冲突',
       compare([{ v: 1344, u: '光年' }], [{ v: 1500, u: '光年' }]).length === 1);
    ok('自检：容忍同值',
       compare([{ v: 1344, u: '光年' }], [{ v: 1344, u: '光年' }]).length === 0);
    ok('自检：容忍小幅取整',
       compare([{ v: 57.3, u: '度' }], [{ v: 57, u: '度' }]).length === 0);
    ok('自检：不同单位不算一致',
       compare([{ v: 1344, u: '光年' }], [{ v: 1344, u: 'km' }]).length === 1);
    nextQ();
  }, 600);
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

  var tmp = path.join(ROOT, '__consistency_tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');

  var profile = path.join(ROOT, '__consistency_profile');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=140000',
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
    console.error('[consistency-test] 未取得结果。输出片段：');
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
