/* ASTRUM · 英文模式中文残留扫描（零依赖，诊断工具）
 *
 * 目的：英文模式下逐页收集「仍然含中日韩字符」的文本节点，连同出处一起打印。
 * 这是一个**报告工具**，不做门禁：答案正文与知识库内容本来就是中文（见待办：
 * 160 条知识正文英译），把它们算作失败会让这条命令永远红。
 * 它只负责把「哪些该翻而没翻」摆出来，判断由人做。
 *
 * 覆盖范围：
 *   首屏 / 侧栏、设置五个页签、观测台、每日前沿、四个入口详情、一次未知档问答、
 *   一次问候（smalltalk）与一次真实天文问题（含展开的检索过程）。
 *
 * 用法：
 *   node tools/i18n-scan.js            打印完整清单
 *   node tools/i18n-scan.js --max=328  界面残留超过 328 条时以 1 退出（CI 门禁）
 *   node tools/i18n-scan.js --quiet    只打印结论行
 *
 * 为什么要门禁：这个数字目前不是 0，短期内也到不了 0（首屏观测台卡片、帮助正文
 * 各自是独立的一批活）。没有门禁的话，每加一条新文案就悄悄变差一点，没人发现。
 * 基线只能往下调，不能往上调——想加基线就得先还债。
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
  var HITS = [];
  var seen = {};
  var ERR = [];
  var done = false;
  var CJK = /[\\u3400-\\u4dbf\\u4e00-\\u9fff]/;

  window.addEventListener('error', function (e) { ERR.push(String(e.message)); });

  /* 三类文本，别混在一起数：
   *   用户  —— 用户自己输入的原话，永远不该翻译
   *   内容  —— 答案正文与知识库表述，按产品约定保持中文
   *   界面  —— 其余全部，都应翻译；这一桶是本文具要清零的目标
   *
   * 注意 .sec 是个混合容器：章节标题、推荐问句、星图跳转按钮都在里面，
   * 但它们由代码拼出来、属于骨架，不能跟着正文一起豁免。
   * 所以先挑出这些骨架选择器，再判内容。 */
  function kindOf(node) {
    if (!node.closest) return '界面';
    if (node.closest('.msg.user')) return '用户';
    if (node.closest('.sec-title, .sec.followup, .sec.mapref, .sec-note, .trace-fold')) return '界面';
    if (node.closest('.answer .narr, .answer .sec, .answer .p, .answer .md, .q-block')) return '内容';
    return '界面';
  }

  function where(node) {
    var out = [];
    var el = node;
    for (var i = 0; i < 4 && el && el.nodeType === 1; i++) {
      var tag = el.tagName.toLowerCase();
      var id = el.id ? '#' + el.id : '';
      var cls = (el.className && typeof el.className === 'string')
        ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '';
      out.unshift(tag + id + cls);
      el = el.parentElement;
    }
    return out.join(' > ');
  }

  function scan(scope, label) {
    if (!scope) return;
    var walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentNode;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|CODE|PRE)$/.test(p.nodeName)) return NodeFilter.FILTER_REJECT;
        if (!CJK.test(n.nodeValue || '')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    }, false);
    var n;
    while ((n = walker.nextNode())) {
      var t = (n.nodeValue || '').replace(/\\s+/g, ' ').trim();
      if (!t) continue;
      var kind = kindOf(n.parentNode);
      var key = kind + '|' + t;
      if (seen[key]) { seen[key].n += 1; continue; }
      seen[key] = { n: 1, label: label, kind: kind, where: where(n.parentNode), text: t };
      HITS.push(seen[key]);
    }
  }

  function finish() {
    if (done) return; done = true;
    function bucket(k) { return HITS.filter(function (h) { return h.kind === k; }).length; }
    var lines = HITS.map(function (h) {
      return 'HIT | ' + h.kind + ' | ' + h.label + ' | ' + h.where + ' | ' + h.text +
        (h.n > 1 ? ' (×' + h.n + ')' : '');
    });
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT 界面 ' + bucket('界面') + ' 条 / 内容 ' + bucket('内容') +
      ' 条 / 用户 ' + bucket('用户') + ' 条\\n' +
      (ERR.length ? 'ERR | ' + ERR.join(' ; ') + '\\n' : '') + lines.join('\\n');
    document.body.appendChild(el);
  }

  /* 兜底：任何一步抛错或超时，先把已收集到的结果写出去，别交白卷 */
  setTimeout(finish, 25000);

  /* __astrum 是 boot() 里挂的，而本脚本在 </body> 前同步执行——此时还没有。
   * 所以只能在第一步取，不能在 IIFE 顶部取。 */
  var A = null;
  var TAB_NAMES = ['Settings', 'Sources', 'Observing', 'Data & Profiles', 'Help'];

  function step(fn, delay) { setTimeout(fn, delay || 60); }

  function openTab(name) {
    var body = document.getElementById('settingsBody');
    if (!body) return;
    var btns = body.querySelectorAll('.set-tabs button');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].textContent.trim() === name) { btns[i].click(); return; }
    }
    ERR.push('找不到页签：' + name);
  }

  /* 切页签是同步重建 DOM，而翻译走的是 40ms 防抖的 MutationObserver。
   * 点完立刻读，读到的是渲染瞬间的原样，会把「有词条、只是还没翻」误算成残留。 */
  function scanSettings(then) {
    var ti = 0;
    (function next() {
      if (ti >= TAB_NAMES.length) { then(); return; }
      var name = TAB_NAMES[ti++];
      openTab(name);
      step(function () {
        scan(document.getElementById('settingsBody'), '设置/' + name);
        next();
      }, 160);
    })();
  }

  function scanTopics(then) {
    var ids = ['observing', 'objects', 'cosmology', 'agents'];
    var i = 0;
    (function next() {
      if (i >= ids.length) { then(); return; }
      var id = ids[i++];
      location.hash = '#/topic/' + id;
      step(function () {
        scan(document.querySelector('.sheet.on') || document.body, '入口/' + id);
        next();
      }, 180);
    })();
  }

  /* 未知档最容易留中文拼接句；真实问题才会走到检索过程折叠区 */
  function scanDialogs() {
    A.ask('what is the airspeed velocity of an unladen swallow');
    step(function () {
      scan(document.getElementById('thread'), '对话/未知档');
      A.ask('你好');
      step(function () {
        scan(document.getElementById('thread'), '对话/问候');
        A.ask('M42 今晚在北京能看到吗');
        step(function () {
          scan(document.getElementById('thread'), '对话/正常');
          /* 折叠区默认收起，展开后才算「用户看得到的界面」。
           * 找不到折叠区时要显式说出来，否则「一条都没报」会被误读成干净。 */
          var folds = document.querySelectorAll('details.trace-fold');
          if (!folds.length) ERR.push('未找到 trace 折叠区，检索过程未被扫描');
          Array.prototype.forEach.call(folds, function (d, i) {
            d.open = true;
            scan(d, '对话/检索过程' + (i + 1));
          });
          step(function () {
            scan(document.getElementById('thread'), '对话/终态');
            finish();
          }, 250);
        }, 700);
      }, 400);
    }, 500);
  }

  step(function () {
    A = window.__astrum;
    if (!A) { ERR.push('__astrum 未就绪'); finish(); return; }
    /* 切英文：只改界面层，答案与知识库仍是中文（这是产品约定） */
    window.I18N.set('en');
    A.refresh();
    step(function () {
      scan(document.body, '首屏');

      A.openSheet('settings');
      step(function () {
        scanSettings(function () {
          document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
          step(function () {
            scan(document.getElementById('obsPanel') || document.body, '观测台');
            scan(document.getElementById('threadList'), '侧栏列表');

            A.openSheet('frontier');
            step(function () {
              scan(document.querySelector('.sheet.on, #frontier') || document.body, '每日前沿');
              document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
              step(function () { scanTopics(scanDialogs); }, 150);
            }, 250);
          }, 200);
        });
      }, 250);
    }, 150);
  });
})();
`;

function main() {
  var file = path.join(ROOT, 'index.html');
  var html = fs.readFileSync(file, 'utf8');

  /* 注入的脚本不受页面 CSP 信任，这里放宽 script-src 仅用于本次离屏运行 */
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>' + html.slice(idx);

  var tmp = path.join(ROOT, '__i18n_scan_tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), '__i18n_scan_profile_' + process.pid + '_' + Date.now());
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile,
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
    console.error('[i18n-scan] 未取得结果。输出片段：');
    console.error(out.slice(-1500));
    process.exit(1);
  }
  var text = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');

  /* --quiet：CI 里只要结论，完整清单留给本地排障 */
  if (process.argv.indexOf('--quiet') < 0) console.log(text);
  else console.log((text.split('\n')[0] || ''));

  var maxArg = process.argv.filter(function (a) { return a.indexOf('--max=') === 0; })[0];
  if (maxArg) {
    var max = parseInt(maxArg.slice(6), 10);
    var hit = text.match(/^RESULT 界面 (\d+) 条/m);
    var n = hit ? parseInt(hit[1], 10) : -1;
    if (!hit) {
      console.error('× 结果行格式不符，无法与基线比较');
      process.exit(1);
    }
    if (n > max) {
      console.error('× 英文界面残留 ' + n + ' 条，超过基线 ' + max + ' 条');
      process.exit(1);
    }
    console.log('\n基线检查通过：' + n + ' ≤ ' + max);
  }
}

main();
