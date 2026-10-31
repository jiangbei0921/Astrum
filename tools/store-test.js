/* ASTRUM · 历史持久化专项测试（零依赖）
 *
 * 覆盖：存储后端可用性 / 消息写入与回读 / bot 答案完整往返 /
 *       线程计数 / 清空 / schema / 恢复渲染（含 restore 标记）
 *
 * 为什么独立于 selftest：本测试会写入并清空持久化数据，
 * 与 selftest 里其他用例共享同一存储会互相污染。
 *
 * 驱动方式（v2）：Chrome 常驻 + CDP 轮询，不再用 --dump-dom。
 * 旧实现靠 --dump-dom 一次性取回 DOM，而 dump 由 --virtual-time-budget 驱动：
 * 虚拟时间会快进定时器，但不会等 IndexedDB 的真实回调，于是断言链还没跑完
 * DOM 就被序列化了，Node 只能看到「没有 __st_result」。CI 上因此长期红。
 * 现改为 spawn 一个带 --remote-debugging-port=0 的 Chrome，从 DevToolsActivePort
 * 拿到端口，用 Node 内置 WebSocket 连 CDP，每 200ms 调 Runtime.evaluate 读
 * #__st_result 的 textContent；拿到完整 "RESULT n/m" 才算完成，否则按真实时间超时。
 *
 * 前提：Node >= 22（全局 WebSocket / fetch 原生可用），不引入任何 npm 依赖。
 *
 * 环境变量（仅用于验收，不改变任何断言）：
 *   STORE_TEST_TIMEOUT_MS  单次尝试的结果轮询预算，默认 120000
 *   STORE_TEST_CHROME      指定 Chrome/Chromium 可执行文件，默认按平台探测
 *
 * 用法：node tools/store-test.js [file-url]
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var target = process.argv[2] || ('file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/'));

function findChrome() {
  /* 验收时可指定任意可执行文件（例如一个必然退出的 stub），用于覆盖异常路径 */
  if (process.env.STORE_TEST_CHROME) return process.env.STORE_TEST_CHROME;
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
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

/* ---------- CDP 驱动（替代 --dump-dom） ---------- */

var PORT_BUDGET_MS = 15000;       /* 等 Chrome 写出 DevToolsActivePort */
var TARGET_BUDGET_MS = 8000;      /* 等 /json/list 出现页面目标 */
var WS_BUDGET_MS = 8000;          /* 等 CDP WebSocket 握手 */
var KILL_GRACE_MS = 3000;         /* 杀进程后的宽限 */
var POLL_INTERVAL_MS = 200;       /* 轮询间隔（真实时间，不受虚拟时间影响） */
var DEFAULT_TIMEOUT_MS = 120000;  /* 单次尝试的结果轮询预算 */

var TIMEOUT_MS = (function () {
  var v = parseInt(process.env.STORE_TEST_TIMEOUT_MS || '', 10);
  return (isFinite(v) && v > 0) ? v : DEFAULT_TIMEOUT_MS;
})();

/* 结果节点存在且以完整的 "RESULT n/m" 开头才算完成；
 * finish() 有 done 守卫，且是一次 textContent 赋值 + 一次 append，
 * 不存在半截结果，所以「能解析」等价于「断言全部跑完」。 */
var RESULT_EXPR = '(() => { var e = document.getElementById("__st_result"); return e ? e.textContent : null; })()';
var DIAG_EXPR = '(() => ({ hasResult: !!document.getElementById("__st_result"),' +
  ' partial: (((document.getElementById("__st_result") || {}).textContent) || "").slice(0, 300),' +
  ' thinking: !!document.querySelector(".thinking"),' +
  ' restoreSkel: !!document.getElementById("restoreSkel"),' +
  ' msgs: document.querySelectorAll(".msg").length,' +
  ' bots: document.querySelectorAll(".msg.bot").length,' +
  ' readyState: document.readyState,' +
  ' storeLoaded: !!(window.Store && window.Thread) }))()';

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function launchChrome(profileDir, url) {
  var child = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--no-first-run', '--no-default-browser-check', '--disable-extensions',
    '--user-data-dir=' + profileDir,
    '--remote-debugging-port=0',
    url
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  var state = { exit: false, code: null, signal: null, spawnError: null, stderr: '' };
  child.on('error', function (e) {
    state.exit = true; state.code = 'spawn-error'; state.spawnError = String(e && e.message);
  });
  child.on('exit', function (code, signal) {
    state.exit = true; state.code = code; state.signal = signal;
  });
  child.stderr.on('data', function (d) {
    state.stderr += d.toString();
    if (state.stderr.length > 20000) state.stderr = state.stderr.slice(-20000);
  });

  return { child: child, state: state, stderr: function () { return state.stderr; } };
}

function readPort(profileDir, budgetMs, runState) {
  var file = path.join(profileDir, 'DevToolsActivePort');
  var t0 = Date.now();
  return new Promise(function (resolve) {
    (function tick() {
      if (runState && runState.exit) return resolve(null);
      if (fs.existsSync(file)) {
        try {
          var port = parseInt(fs.readFileSync(file, 'utf8').split('\n')[0], 10);
          if (port > 0) return resolve(port);
        } catch (e) { /* 文件可能还在写，下一轮再读 */ }
      }
      if (Date.now() - t0 >= budgetMs) return resolve(null);
      setTimeout(tick, 100);
    })();
  });
}

async function findPageTarget(port, budgetMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    try {
      var r = await fetch('http://127.0.0.1:' + port + '/json/list', { signal: AbortSignal.timeout(1500) });
      var list = await r.json();
      var page = list.filter(function (t) { return t.type === 'page'; })[0];
      if (page && page.webSocketDebuggerUrl) return page;
    } catch (e) { /* 端口刚就绪时可能还不可达，继续等 */ }
    await sleep(200);
  }
  return null;
}

function openCdp(wsUrl, budgetMs) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);
    var timer = setTimeout(function () {
      try { ws.close(); } catch (e) {}
      reject(new Error('CDP WebSocket 握手超时（' + budgetMs + 'ms）'));
    }, budgetMs);
    ws.addEventListener('open', function () { clearTimeout(timer); resolve(ws); });
    ws.addEventListener('error', function () {
      clearTimeout(timer); reject(new Error('CDP WebSocket 握手失败（端口不可达或被拒绝）'));
    });
  });
}

/* 极简 CDP 会话：只做 send/evaluate + 事件缓存，不引入依赖 */
function Cdp(ws) {
  var self = this;
  this.ws = ws;
  this.seq = 0;
  this.pending = {};
  this.events = [];
  this.closed = null;

  ws.addEventListener('message', function (ev) {
    var msg;
    try { msg = JSON.parse(ev.data); } catch (e) { return; }
    if (msg.id && self.pending[msg.id]) {
      var fn = self.pending[msg.id];
      delete self.pending[msg.id];
      fn(msg);
      return;
    }
    if (msg.method) {
      self.events.push(msg);
      if (self.events.length > 200) self.events.shift();
    }
  });
  ws.addEventListener('close', function (e) {
    self.closed = 'CDP 连接已断开（close code=' + ((e && e.code) || 'unknown') + '）';
  });
  ws.addEventListener('error', function () {
    if (!self.closed) self.closed = 'CDP 连接错误';
  });
}

Cdp.prototype.send = function (method, params, budgetMs) {
  var self = this;
  var id = ++this.seq;
  return new Promise(function (resolve, reject) {
    if (self.closed) return reject(new Error(self.closed));
    var timer = setTimeout(function () {
      delete self.pending[id];
      reject(new Error('CDP 调用超时: ' + method));
    }, budgetMs || 10000);
    self.pending[id] = function (msg) {
      clearTimeout(timer);
      if (msg.error) reject(new Error(msg.error.message || 'CDP error'));
      else resolve(msg.result || {});
    };
    try {
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
    } catch (e) {
      clearTimeout(timer);
      delete self.pending[id];
      reject(e);
    }
  });
};

Cdp.prototype.evaluate = function (expr, budgetMs) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true }, budgetMs || 5000)
    .then(function (r) {
      var ex = r.exceptionDetails;
      return {
        value: (r.result && r.result.value !== undefined) ? r.result.value : null,
        exception: ex ? ((ex.exception && ex.exception.description) || ex.text || 'exception') : null
      };
    });
};

Cdp.prototype.close = function () {
  try { this.ws.close(); } catch (e) {}
};

Cdp.prototype.consoleText = function () {
  return this.events.map(function (e) {
    if (e.method === 'Runtime.exceptionThrown') {
      var d = e.params && e.params.exceptionDetails || {};
      var desc = (d.exception && d.exception.description) || d.text || '';
      return '[exception] ' + String(desc).split('\n')[0];
    }
    if (e.method === 'Log.entryAdded') {
      var en = (e.params && e.params.entry) || {};
      return '[log:' + (en.level || '') + '] ' + (en.text || '');
    }
    if (e.method === 'Runtime.consoleAPICalled') {
      var args = (e.params && e.params.args) || [];
      return '[console] ' + args.map(function (a) {
        return String(a.value !== undefined ? a.value : (a.description || a.type));
      }).join(' ');
    }
    return '';
  }).filter(function (s) { return s; });
};

async function pollResult(cdp, runState, budgetMs) {
  var t0 = Date.now();
  while (Date.now() - t0 < budgetMs) {
    if (cdp.closed) return { reason: cdp.closed };
    if (runState.exit) {
      return { reason: 'Chrome 提前退出（code=' + runState.code + ', signal=' + runState.signal + '）' };
    }
    try {
      var r = await cdp.evaluate(RESULT_EXPR, 5000);
      if (r.exception) return { reason: '页面求值抛出异常: ' + String(r.exception).slice(0, 200) };
      var text = r.value;
      if (typeof text === 'string' && /^RESULT \d+\/\d+/.test(text)) return { text: text };
    } catch (e) {
      return { reason: 'CDP 求值失败: ' + (e && e.message) };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { reason: '等待结果超时（' + budgetMs + 'ms）' };
}

function killTree(child, runState, graceMs) {
  return new Promise(function (resolve) {
    if (!child || !child.pid || runState.exit) return resolve();
    var done = false;
    function fin() { if (!done) { done = true; resolve(); } }
    child.once('exit', fin);
    try {
      if (process.platform === 'win32') {
        cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      } else {
        child.kill('SIGKILL');
      }
    } catch (e) { /* 进程可能已自行退出 */ }
    setTimeout(fin, graceMs);
  });
}

async function rmWithRetry(dir, tries) {
  for (var i = 0; i < (tries || 3); i++) {
    try { fs.rmSync(dir, { recursive: true, force: true }); return true; }
    catch (e) { await sleep(200); }
  }
  return false;
}

async function runAttempt(profileDir, url, timeoutMs) {
  fs.mkdirSync(profileDir, { recursive: true });
  var run = launchChrome(profileDir, url);
  var cdp = null;
  try {
    var port = await readPort(profileDir, PORT_BUDGET_MS, run.state);
    if (!port) {
      return {
        ok: false,
        reason: run.state.exit
          ? ('Chrome 提前退出（code=' + run.state.code + ', signal=' + run.state.signal +
             (run.state.spawnError ? ', ' + run.state.spawnError : '') + '）')
          : ('Chrome 未写出 DevToolsActivePort（' + PORT_BUDGET_MS + 'ms）'),
        stderr: run.stderr()
      };
    }
    var page = await findPageTarget(port, TARGET_BUDGET_MS);
    if (!page) {
      return { ok: false, reason: 'CDP 未发现页面目标（/json/list，' + TARGET_BUDGET_MS + 'ms）', stderr: run.stderr() };
    }
    cdp = new Cdp(await openCdp(page.webSocketDebuggerUrl, WS_BUDGET_MS));
    await cdp.send('Runtime.enable', {}, 5000);
    try { await cdp.send('Log.enable', {}, 5000); } catch (e) { /* Log 域不可用时忽略 */ }

    var poll = await pollResult(cdp, run.state, timeoutMs);
    if (poll.text) return { ok: true, text: poll.text };

    /* 没拿到结果时，把页面当前状态抓回来，避免「只报结果不存在」 */
    var diag = null;
    if (!cdp.closed) {
      try { diag = (await cdp.evaluate(DIAG_EXPR, 5000)).value; } catch (e) {}
    }
    return {
      ok: false, reason: poll.reason, diag: diag,
      diagConsole: cdp.consoleText(), stderr: run.stderr()
    };
  } catch (e) {
    return {
      ok: false, reason: 'CDP 失败：' + (e && e.message),
      diagConsole: cdp ? cdp.consoleText() : [], stderr: run.stderr()
    };
  } finally {
    if (cdp) cdp.close();
    await killTree(run.child, run.state, KILL_GRACE_MS);
    await sleep(100);
    if (!(await rmWithRetry(profileDir, 3))) {
      console.error('[store-test] 警告：profile 未能删除，可能仍被占用: ' + profileDir);
    }
  }
}

async function main() {
  if (typeof WebSocket !== 'function' || typeof fetch !== 'function') {
    console.error('[store-test] 需要 Node >= 22（内置 WebSocket/fetch），当前 ' + process.version);
    process.exit(2);
  }

  var file = target.replace(/^file:\/\/\//, '').replace(/\//g, path.sep);
  if (!fs.existsSync(file)) { console.error('[store-test] 目标不存在: ' + file); process.exit(1); }

  var html = fs.readFileSync(file, 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var i = html.lastIndexOf('</body>');
  html = html.slice(0, i) + '<script>' + SCRIPT + '</script>' + html.slice(i);

  /* 必须写在项目目录：页面用相对路径引用 core/*.js。
   * 文件名唯一，避免上一轮尚未退出的 Chrome 占用同一路径。 */
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__storetest_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profileBase = path.join(os.tmpdir(), 'astrum_store_' + tag);
  var url = 'file:///' + tmp.replace(/\\/g, '/');

  var text = null;
  var last = null;

  try {
    /* 三次重试：断言本身是确定性的，重试只兜 Chrome 启动/CDP 链路的基础设施抖动。
     * 每次重试用独立 profile，互不共享状态。 */
    for (var attempt = 1; attempt <= 3; attempt++) {
      var result = await runAttempt(profileBase + '_a' + attempt, url, TIMEOUT_MS);
      if (result.ok) { text = result.text; break; }
      last = result;
      console.error('[store-test] 第 ' + attempt + ' 次未取得结果：' + result.reason);
      if (attempt < 3) console.error('[store-test] 重试一次（独立 profile）…');
    }
  } finally {
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.rmSync(profileBase, { recursive: true, force: true }); } catch (e) {}
  }

  if (!text) {
    console.error('[store-test] 三次尝试均未取得结果。最后一次原因：' + (last ? last.reason : '未知'));
    if (last && last.diag) console.error('[store-test] 页面状态: ' + JSON.stringify(last.diag));
    if (last && last.diagConsole && last.diagConsole.length) {
      console.error('[store-test] 页面控制台/异常:\n' + last.diagConsole.slice(-20).join('\n'));
    }
    if (last && last.stderr) console.error('[store-test] Chrome stderr 末尾:\n' + String(last.stderr).slice(-1500));
    process.exit(1);
  }

  /* textContent 已解码，不能再做 HTML 反实体（会把断言里的 & 破坏） */
  console.log(text);

  var head = (text.split('\n')[0] || '').trim();
  var mm = head.match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main().catch(function (e) {
  console.error('[store-test] 未捕获异常: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
