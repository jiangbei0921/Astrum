/* ASTRUM · 历史持久化专项测试（零依赖）
 *
 * 覆盖：存储后端可用性 / 消息写入与回读 / bot 答案完整往返 /
 *       线程计数 / 清空 / schema / 恢复渲染（含 restore 标记）
 *
 * 为什么独立于 selftest：本测试会写入并清空持久化数据，
 * 与 selftest 里其他用例共享同一存储会互相污染。
 *
 * 用法：node tools/store-test.js [file-url]
 */
'use strict';

var fs = require('fs');
var path = require('path');
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

var SCRIPT = `
(function () {
  var R = [];
  var done = false;
  /* 不设页面内看门狗。
   * 原因：Chrome 的 --virtual-time-budget 会把定时器与时钟一起快进，
   * 而 IndexedDB 的 I/O 不会跟着快进 —— 于是「20s 无进展」在真实几百毫秒内就成立，
   * 造成随机误报。页面真的卡住时，Node 驱动会因为取不到 <pre> 而打印诊断并退出 1，
   * 这条路径已经能覆盖「悬挂」这个故障。 */
  function ok(name, pass, extra) {
    if (done) return;
    R.push({ n: name, p: !!pass, x: extra || '' });
  }
  function finish() {
    if (done) return;
    done = true;
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
  /* 包装成 Promise，否则 Promise 链会在答案渲染前就继续 */
  function askP(q) {
    return new Promise(function (resolve) { ask(q, function (bot) { resolve(bot); }); });
  }

  window.addEventListener('error', function (e) {
    R.push({ n: 'no uncaught error', p: false, x: String(e.message).slice(0, 60) });
  });

  /* 等启动恢复彻底结束再开始：restoreHistory 的骨架消失 = 它已完成。
   * 否则会与 boot 的恢复并发，出现「测试刚清空、恢复又把数据读回来」的竞争。 */
  function waitReady(n, cb) {
    if ((!document.getElementById('restoreSkel') && !document.querySelector('.thinking')) || n <= 0) { cb(); return; }
    setTimeout(function () { waitReady(n - 1, cb); }, 200);
  }
  waitReady(25, function () {
  var S = window.Store, T = window.Thread;
    if (!S || !T) { ok('store/thread 已加载', false); finish(); return; }

    S.init().then(function (backend) {
      ok('存储后端可用', backend === 'idb' || backend === 'ls', 'backend=' + backend);
      return T.clearAll();
    }).then(function () {
      return T.loadMessages();
    }).then(function (msgs) {
      ok('清空后无残留消息', msgs.length === 0, 'n=' + msgs.length);
      return askP('猎户座大星云是什么');
    }).then(function () {
      return T.loadMessages();
    }).then(function (msgs) {
      ok('一轮问答落库两条', msgs.length === 2, 'n=' + msgs.length);
      ok('含 user 与 bot', msgs[0] && msgs[0].role === 'user' && msgs[1] && msgs[1].role === 'bot',
         msgs.map(function (m) { return m.role; }).join(','));
      var bot = msgs[1] || {};
      ok('bot 消息保存完整 ans', !!(bot.ans && bot.ans.sections && bot.ans.sections.length),
         bot.ans ? ('sections=' + bot.ans.sections.length) : 'missing');
      ok('ans 可反推意图与档位', !!(bot.ans && bot.ans.intent), bot.ans ? bot.ans.intent : 'missing');
      var th = T.current();
      /* appendBot 的 touch 是异步的，此刻计数可能还没落定；
       * 这里只验证「线程已建立」，最终计数在恢复之后再断言。 */
      ok('线程记录已建立', !!(th && th.count >= 1), th ? ('count=' + th.count) : 'no thread');
      ok('线程带 schema 版本', !!(th && th.schema >= 1), th ? ('schema=' + th.schema) : 'missing');
      ok('线程标题取自首问', !!(th && th.title && th.title.length > 0), th ? th.title : 'missing');

      /* 恢复渲染：清空 DOM 后从存储重建 */
      var threadEl = document.getElementById('thread');
      threadEl.innerHTML = '';
      window.__astrum.restoreHistory();
      var t = 0;
      var iv = setInterval(function () {
        t++;
        var users = document.querySelectorAll('.msg.user');
        var bots = document.querySelectorAll('.msg.bot');
        if ((users.length >= 1 && bots.length >= 1 && !document.querySelector('.thinking')) || t > 60) {
          clearInterval(iv);
          ok('恢复后用户消息还原', users.length === 1, 'n=' + users.length);
          ok('恢复后答案还原', bots.length === 1, 'n=' + bots.length);
          var restored = document.querySelectorAll('.msg.restored');
          ok('恢复态带 restored 标记（禁动画）', restored.length === 1, 'n=' + restored.length);
          ok('恢复后未重复落库', true, '下一项校验条数');

          var th2 = T.current();
          ok('线程计数最终为两轮', !!(th2 && th2.count >= 2), th2 ? ('count=' + th2.count) : 'no thread');

          T.loadMessages().then(function (again) {
            ok('恢复未产生重复记录', again.length === 2, 'n=' + again.length);
            return S.usage();
          }).then(function (u) {
            ok('容量接口可用', !!(u && typeof u.bytes === 'number'), JSON.stringify(u).slice(0, 60));
            return window.__astrum.clearHistory('all');
          }).then(function () {
            return T.loadMessages();
          }).then(function (after) {
            ok('清空全部后无消息', after.length === 0, 'n=' + after.length);
            finish();
          }).catch(function (e) {
            ok('收尾异常', false, String(e && e.message));
            finish();
          });
        }
      }, 250);
    }).catch(function (e) {
      ok('流程异常', false, String(e && e.message));
      finish();
    });
  });
})();
`;

function main() {
  var file = target.replace(/^file:\/\/\//, '').replace(/\//g, path.sep);
  if (!fs.existsSync(file)) { console.error('[store-test] 目标不存在: ' + file); process.exit(1); }

  var html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var i = html.lastIndexOf('</body>');
  html = html.slice(0, i) + '<script>' + SCRIPT + '</script>' + html.slice(i);

  /* 必须写在项目目录：页面用相对路径引用 core/*.js */
  var tmp = path.join(ROOT, '__storetest_tmp.html');
  fs.writeFileSync(tmp, html, 'utf8');
  /* 每次用全新配置目录：否则上一轮写入的 IndexedDB 会被 boot 的恢复逻辑读回来，
     与测试预期互相污染（表现为 Promise 链静默卡住、无结果输出） */
  var profile = path.join(ROOT, '__storetest_profile');
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--user-data-dir=' + profile,
      '--virtual-time-budget=90000',
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
    console.error('[store-test] 未取得结果。输出片段：');
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
