/* ASTRUM · V1.11 真实浏览器流式输出测试
 *
 * 真实 Chrome + 本地 HTTP；只替换模型流式回调，不替换 DOM/渲染/Thread。
 * 覆盖：
 *   - 首段在完成前出现、后续增量增长、不重复追加
 *   - 完成后临时流式卡被结构化答案替换
 *   - 停止按钮保留 partial、标记中断而非系统故障
 *   - 流式期间 HTML 只按文本渲染，不执行注入
 *   - Thread 持久化包含 meta.stream
 *   - 最终答案不出现 Agent/工具执行日志
 *
 * 用法：node tools/v1-11-stream-browser-test.js
 */
'use strict';
var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var http = require('http');
var ROOT = path.resolve(__dirname, '..');

function findChrome() {
  var c = ['C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  return 'chrome';
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function mime(p) {
  if (/\.html$/.test(p)) return 'text/html; charset=utf-8';
  if (/\.js$/.test(p)) return 'text/javascript; charset=utf-8';
  if (/\.css$/.test(p)) return 'text/css; charset=utf-8';
  return 'application/octet-stream';
}
function serve() {
  return new Promise(function (resolve) {
    var s = http.createServer(function (req, res) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      var full = path.join(ROOT, rel);
      fs.readFile(full, function (e, buf) {
        if (e) { res.writeHead(404); res.end('404'); return; }
        res.writeHead(200, { 'Content-Type': mime(full), 'Cache-Control': 'no-store' });
        res.end(buf);
      });
    });
    s.listen(0, '127.0.0.1', function () { resolve({ server: s, port: s.address().port }); });
  });
}
async function readPort(profile, budget) {
  var f = path.join(profile, 'DevToolsActivePort'), t = Date.now();
  while (Date.now() - t < budget) {
    if (fs.existsSync(f)) { var l = fs.readFileSync(f, 'utf8').split('\n'); if (l[0]) return Number(l[0]); }
    await sleep(200);
  }
  return null;
}
async function findPage(port) {
  var r = await fetch('http://127.0.0.1:' + port + '/json/list');
  var l = await r.json();
  return (l || []).filter(function (x) { return x.type === 'page'; })[0] || null;
}
function Cdp(ws) {
  var self = this; this.ws = ws; this.id = 0; this.pending = {};
  this.ready = new Promise(function (res, rej) { ws.addEventListener('open', function () { res(); }); ws.addEventListener('error', function () { rej(new Error('ws')); }); });
  ws.addEventListener('message', function (e) {
    var m = JSON.parse(e.data);
    if (m.id && self.pending[m.id]) {
      var p = self.pending[m.id]; delete self.pending[m.id];
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
}
Cdp.prototype.send = function (method, params, ms) {
  var self = this;
  return this.ready.then(function () {
    return new Promise(function (res, rej) {
      var id = ++self.id; self.pending[id] = { resolve: res, reject: rej };
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; rej(new Error('timeout')); } }, ms || 60000);
    });
  });
};
Cdp.prototype.eval = function (expr, ms) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, ms);
};
var results = [];
function ok(n, p, x) { results.push({ n: n, p: !!p, x: x == null ? '' : String(x) }); }

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v111stream_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'http://127.0.0.1:' + srv.port + '/index.html'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    for (var i = 0; i < 100; i++) {
      var ready = await cdp.eval('!!(window.__astrum && window.AstroControlBridge && window.Sources && window.Thread)', 10000);
      if (ready && ready.result && ready.result.value === true) break;
      await sleep(250);
    }

    var setup = await cdp.eval(`(async function(){
      try { if (window.Thread && window.Thread.clearAll) await window.Thread.clearAll(); } catch(e) {}
      window.__astrum.newChat();
      window.Sources.setConfig('openai', {
        key: 'browser-test-key', endpoint: 'https://offline.local/v1/chat/completions',
        model: 'browser-test-model', enabled: true, temperature: 0.2, maxTokens: 200
      });
      window.__astrum.selectSource('openai');
      window.Research.run = function (q, opts) {
        return Promise.resolve({
          question: q, intent: (opts && opts.intent) || 'intro-target',
          plan: { skip: true, subs: [] }, rounds: [], budget: {},
          stopReason: 'skip', evidence: [], conflicts: [], citations: null,
          terms: {}, ms: 0
        });
      };
      window.__streamCalls = 0;
      window.AstroControlBridge.modelStream = function (id, payload, handlers, opts) {
        window.__streamCalls++;
        return new Promise(function (resolve) {
          var t0 = Date.now(), first = null, k = 0;
          var toks = [
            '核心结论：M42 是猎户座大星云。',
            '\\n\\n它在猎户座方向，距离约 1344 光年。',
            '\\n\\n<script>window.__xss=1</script>'
          ];
          function tick() {
            if (opts && opts.signal && opts.signal.aborted) {
              resolve({ ok: false, code: 'cancelled', text: toks.slice(0, k).join(''),
                aborted: true, completed: false, ttft: first || 0, latency: Date.now() - t0,
                stream: true, fallback: false, usage: { prompt: 5, completion: k * 3, total: 5 + k * 3 } });
              return;
            }
            if (k >= toks.length) {
              resolve({ ok: true, code: 'ok', text: toks.join(''), raw: toks.join(''),
                stream: true, fallback: false, completed: true, aborted: false,
                ttft: first || 0, latency: Date.now() - t0, tokens: 12,
                usage: { prompt: 5, completion: 7, total: 12 } });
              return;
            }
            if (first == null) first = Date.now() - t0;
            handlers.onToken(toks[k++]);
            setTimeout(tick, 220);
          }
          setTimeout(tick, 80);
        });
      };
      return 'ready';
    })()`, 20000);
    ok('B1 流式环境就绪', setup && setup.result && setup.result.value === 'ready');

    var ask1 = await cdp.eval("window.__astrum.ask('M42 是什么？'); 'asked'", 10000);
    ok('B2 提问入口可用', ask1 && ask1.result && ask1.result.value === 'asked');

    var firstSnap = '', snapshots = 0, lastSnap = '', firstBeforeDone = false;
    var t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      var st = await cdp.eval(`(function(){
        var b=document.querySelector('.stream-msg .stream-body');
        var card=document.querySelectorAll('.msg.bot .answer');
        return { body: b?b.textContent:'', streaming: !!b, answers: card.length,
          xss: !!window.__xss, streamCount: window.__streamCalls||0 };
      })()`, 10000);
      var v = st && st.result && st.result.value;
      if (v && v.body) {
        if (!firstSnap) { firstSnap = v.body; firstBeforeDone = !!v.streaming; }
        if (v.body !== lastSnap) { snapshots++; lastSnap = v.body; }
      }
      if (v && !v.streaming && v.answers >= 1) break;
      await sleep(80);
    }
    ok('B3 首段在完成前出现', !!firstSnap && firstBeforeDone, firstSnap.slice(0, 30));
    ok('B4 内容逐步增长而非一次性', snapshots >= 2, 'snapshots=' + snapshots);
    var finalEval = await cdp.eval(`(function(){
      var msgs=document.querySelectorAll('.msg.bot');
      var last=msgs[msgs.length-1];
      var ana=last?last.querySelector('.analysis-body'):null;
      var ans=last?last.querySelector('.answer'):null;
      return {
        analysis: ana?ana.textContent:'',
        streamLeft: document.querySelectorAll('.stream-msg').length,
        xss: !!window.__xss,
        scriptInAnswer: ans?ans.querySelectorAll('script').length:-1,
        custom: last?last.querySelectorAll('.sec-custom,.custom-note').length:-1,
        text: ans?ans.textContent:''
      };
    })()`, 10000);
    var fv = finalEval && finalEval.result && finalEval.result.value;
    ok('B5 临时流式卡在完成后移除', fv && fv.streamLeft === 0, fv && fv.streamLeft);
    ok('B6 最终正文由结构化答案承载', fv && /M42/.test(fv.analysis) && /1344/.test(fv.analysis),
      fv && fv.analysis.slice(0, 60));
    ok('B7 增量内容未重复追加', fv && fv.analysis.indexOf('M42 是猎户座大星云') < 0 ||
      (fv.analysis.match(/M42 是猎户座大星云/g) || []).length === 1,
      fv && (fv.analysis.match(/M42 是猎户座大星云/g) || []).length);
    ok('B8 流式文本不被当成 HTML 执行', fv && fv.xss === false && fv.scriptInAnswer === 0,
      JSON.stringify({ xss: fv && fv.xss, script: fv && fv.scriptInAnswer }));
    ok('B9 最终答案无 Agent 输出卡片', fv && fv.custom === 0, fv && fv.custom);
    ok('B10 最终答案无工具执行日志', fv && !/(工具调用|执行步骤|检索词生成|任务分配)/.test(fv.text));

    var thread1 = await cdp.eval(`(async function(){
      var msgs=await window.Thread.loadMessages();
      var bots=msgs.filter(function(m){return m.role==='bot';});
      var last=bots[bots.length-1]||{};
      return { bots: bots.length, stream: last.ans&&last.ans.meta&&last.ans.meta.stream||null,
        id: last.ans&&last.ans.meta&&last.ans.meta.messageId||'' };
    })()`, 20000);
    var t1 = thread1 && thread1.result && thread1.result.value;
    ok('B11 Thread 保存完整回答', t1 && t1.bots === 1 && !!t1.id, JSON.stringify({ bots: t1 && t1.bots, id: t1 && t1.id }));
    ok('B12 Thread 记录流式元数据', t1 && t1.stream && t1.stream.stream === true &&
      t1.stream.completed === true && typeof t1.stream.ttft === 'number', JSON.stringify(t1 && t1.stream));

    /* 停止生成：保留已生成部分，不标记为系统故障 */
    var ask2 = await cdp.eval("window.__astrum.ask('M42 是什么？'); 'asked'", 10000);
    ok('B13 第二次提问可用', ask2 && ask2.result && ask2.result.value === 'asked');
    var clicked = false, waited = Date.now();
    while (Date.now() - waited < 8000) {
      var s2 = await cdp.eval(`(function(){
        var b=document.querySelector('.stream-msg .stream-body');
        var stop=document.querySelector('.stream-msg .stream-stop');
        return { body: b?b.textContent:'', hasStop: !!stop };
      })()`, 10000);
      var v2 = s2 && s2.result && s2.result.value;
      if (v2 && v2.body && v2.hasStop) {
        var c = await cdp.eval("document.querySelector('.stream-msg .stream-stop').click(); 'clicked'", 10000);
        clicked = c && c.result && c.result.value === 'clicked';
        break;
      }
      await sleep(80);
    }
    ok('B14 停止按钮可用', clicked === true);
    var stopped = null, st2t = Date.now();
    while (Date.now() - st2t < 10000) {
      var s3 = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ana=last?last.querySelector('.analysis-body'):null;
        var bd=last?last.querySelector('.boundary'):null;
        return { streaming: !!document.querySelector('.stream-msg'),
          analysis: ana?ana.textContent:'', boundary: bd?bd.textContent:'',
          text: last?last.textContent:'' };
      })()`, 10000);
      var v3 = s3 && s3.result && s3.result.value;
      if (v3 && !v3.streaming && v3.analysis) { stopped = v3; break; }
      await sleep(100);
    }
    ok('B15 停止后保留部分正文', stopped && /M42 是猎户座大星云/.test(stopped.analysis),
      stopped && stopped.analysis.slice(0, 40));
    ok('B16 停止不被写成系统故障', stopped && /已由用户停止生成/.test(stopped.boundary) &&
      !/(系统故障|异常中断|调用失败)/.test(stopped.text), stopped && stopped.boundary.slice(0, 60));
    var thread2 = await cdp.eval(`(async function(){
      var msgs=await window.Thread.loadMessages();
      var bots=msgs.filter(function(m){return m.role==='bot';});
      var last=bots[bots.length-1]||{};
      return { bots: bots.length, stream: last.ans&&last.ans.meta&&last.ans.meta.stream||null };
    })()`, 20000);
    var t2 = thread2 && thread2.result && thread2.result.value;
    ok('B17 停止后只保存一条回答', t2 && t2.bots === 2, t2 && t2.bots);
    ok('B18 Thread 标记用户中止', t2 && t2.stream && t2.stream.aborted === true &&
      t2.stream.completed === false, JSON.stringify(t2 && t2.stream));

    var calls = await cdp.eval('window.__streamCalls', 10000);
    ok('B19 两次提问各触发一次流式请求', calls && calls.result && calls.result.value === 2,
      calls && calls.result && calls.result.value);
  } finally {
    try { if (cdp && cdp.ws) cdp.ws.close(); } catch (e) { /* 忽略 */ }
    try { child.kill(); } catch (e) { /* 忽略 */ }
    try { srv.server.close(); } catch (e) { /* 忽略 */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
  }

  var pass = results.filter(function (r) { return r.p; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (r) {
    console.log((r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? ' | ' + r.x : ''));
  });
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('UNEXPECTED', e && e.stack || e);
  process.exit(1);
});
