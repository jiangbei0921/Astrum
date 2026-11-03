/* ASTRUM · V1.11 浏览器设置页 + Provider 流式端到端（本地 mock）
 *
 * 真实 Chrome + 本地 HTTP；Provider 为本地 mock 服务（SIMULATED），
 * 不冒充真实外部账户。真实 Key 缺失时由 v1-9-provider-test 标记 BLOCKED_API_KEY。
 *
 * 覆盖：
 *   - 设置页输入 Key / Endpoint 并保存
 *   - 测试连接（真实浏览器 fetch，非流式响应）
 *   - 真实 SSE 流式问答（真实浏览器 fetch + streamChat）
 *   - 刷新后配置恢复、Key 只以掩码展示
 *   - 切换 Provider 后调用使用新配置
 *
 * 用法：node tools/v1-11-provider-browser-test.js
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

var LOGS = [];
function serve() {
  return new Promise(function (resolve) {
    var s = http.createServer(function (req, res) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
      if (rel === 'chat' && req.method === 'POST') {
        var raw = '';
        req.on('data', function (c) { raw += c; });
        req.on('end', function () {
          var body = {};
          try { body = JSON.parse(raw); } catch (e) { body = {}; }
          /* 只记录非敏感字段：绝不记录 Authorization / Key。 */
          LOGS.push({ model: body.model, stream: !!body.stream, msgs: (body.messages || []).length });
          if (!body.stream) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              choices: [{ message: { content: 'OK' } }],
              usage: { prompt_tokens: 2, completion_tokens: 2, total_tokens: 4 }
            }));
            return;
          }
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-store',
            Connection: 'keep-alive'
          });
          var toks = ['M42 是猎户座大星云。', '\\n\\n它距离约 1344 光年。'];
          var i = 0;
          function next() {
            if (i >= toks.length) {
              res.write('data: ' + JSON.stringify({
                choices: [{ delta: { content: '' } }],
                usage: { prompt_tokens: 9, completion_tokens: 8, total_tokens: 17 }
              }) + '\n\n');
              res.write('data: [DONE]\n\n');
              res.end();
              return;
            }
            res.write('data: ' + JSON.stringify({
              choices: [{ delta: { content: toks[i++] } }]
            }) + '\n\n');
            setTimeout(next, 180);
          }
          setTimeout(next, 80);
        });
        return;
      }
      var full = path.join(ROOT, rel || 'index.html');
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

async function waitAstrium(cdp) {
  for (var i = 0; i < 100; i++) {
    var r = await cdp.eval('!!(window.__astrum && window.AstroControlBridge && window.Sources)', 10000);
    if (r && r.result && r.result.value === true) return true;
    await sleep(250);
  }
  return false;
}

function stubResearchExpr() {
  return `window.Research.run = function (q, opts) {
    return Promise.resolve({ question: q, intent: (opts && opts.intent) || 'intro-target',
      plan: { skip: true, subs: [] }, rounds: [], budget: {}, stopReason: 'skip',
      evidence: [], conflicts: [], citations: null, terms: {}, ms: 0 });
  };`;
}

async function askAndWait(cdp, question) {
  await cdp.eval("window.__astrum.newChat();" + stubResearchExpr() +
    "window.__astrum.ask(" + JSON.stringify(question) + "); 'asked'", 10000);
  var t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    var r = await cdp.eval(`(function(){
      var m=document.querySelectorAll('.msg.bot');
      var last=m[m.length-1];
      var ana=last?last.querySelector('.analysis-body'):null;
      return { streaming: !!document.querySelector('.stream-msg'),
        analysis: ana?ana.textContent:'', answers: m.length };
    })()`, 10000);
    var v = r && r.result && r.result.value;
    if (v && !v.streaming && v.analysis) return v;
    await sleep(120);
  }
  return null;
}

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v111provider_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'http://127.0.0.1:' + srv.port + '/index.html'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    ok('P1 页面启动', await waitAstrium(cdp));

    var endpoint = 'http://127.0.0.1:' + srv.port + '/chat';
    var setup = await cdp.eval(`(async function(){
      try { if (window.Thread && window.Thread.clearAll) await window.Thread.clearAll(); } catch(e) {}
      window.__astrum.newChat();
      window.__astrum.openSheet('settings');
      await new Promise(function(r){setTimeout(r,300);});
      var tabs=document.querySelectorAll('#settingsBody .set-tabs button');
      Array.prototype.forEach.call(tabs,function(b){ if(b.textContent.trim()==='来源') b.click(); });
      await new Promise(function(r){setTimeout(r,300);});
      Array.prototype.forEach.call(document.querySelectorAll('#settingsBody .sec-item'),function(b){
        var t=b.querySelector('.si-t'); if(t && /云端模型/.test(t.textContent)) b.click();
      });
      await new Promise(function(r){setTimeout(r,350);});
      var chip=null;
      Array.prototype.forEach.call(document.querySelectorAll('.mp-chip'),function(b){
        if(!chip && /OpenAI/.test(b.textContent)) chip=b;
      });
      if(!chip) return {error:'chip missing'};
      chip.click();
      await new Promise(function(r){setTimeout(r,350);});
      var kinp=document.querySelector('.mp-input[type=password]');
      if(!kinp) return {error:'key input missing'};
      kinp.value='sk-browser-mock-key';
      kinp.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(function(r){setTimeout(r,250);});
      var einp=document.querySelector('input[placeholder*="接口地址"]');
      if(!einp) return {error:'endpoint input missing'};
      einp.value=${JSON.stringify(endpoint)};
      einp.dispatchEvent(new Event('change',{bubbles:true}));
      await new Promise(function(r){setTimeout(r,250);});
      var testBtn=null,useBtn=null;
      Array.prototype.forEach.call(document.querySelectorAll('#settings button'),function(b){
        if(/测试连接/.test(b.textContent)) testBtn=b;
        if(/^设为默认$/.test(b.textContent.trim())) useBtn=b;
      });
      if(!testBtn) return {error:'test button missing'};
      testBtn.click();
      await new Promise(function(r){setTimeout(r,1200);});
      var status=window.Sources.statusOf('openai');
      if(useBtn) useBtn.click();
      await new Promise(function(r){setTimeout(r,250);});
      var saved=window.Sources.conf('openai');
      return { status:status.state, msg:status.msg, hasKey:!!saved.key,
        mask:window.Sources.maskKey('openai'), source:window.__astrum.getSettings().sourceId,
        endpoint:saved.endpoint, useClicked:!!useBtn };
    })()`, 30000);
    var sv = setup && setup.result && setup.result.value;
    ok('P2 设置页保存 Key 与 Endpoint', sv && sv.hasKey === true && sv.endpoint === endpoint,
      JSON.stringify({ hasKey: sv && sv.hasKey, endpoint: sv && sv.endpoint, error: sv && sv.error }));
    ok('P3 Key 只以掩码展示', sv && /^••/.test(sv.mask || ''), sv && sv.mask);
    ok('P4 测试连接真实走浏览器请求', sv && sv.status === 'ready', sv && sv.status + '/' + (sv && sv.msg));
    ok('P5 设为默认生效', sv && sv.source === 'openai' && sv.useClicked === true,
      JSON.stringify({ source: sv && sv.source, clicked: sv && sv.useClicked }));
    ok('P6 测试连接请求为非流式', LOGS.length >= 1 && LOGS[0].stream === false,
      JSON.stringify(LOGS[0] || null));

    var ans1 = await askAndWait(cdp, 'M42 是什么？');
    ok('P7 浏览器内真实 SSE 流式完成', ans1 && /M42/.test(ans1.analysis) && /1344/.test(ans1.analysis),
      ans1 && ans1.analysis.slice(0, 60));
    ok('P8 流式请求带 stream=true', LOGS.length >= 2 && LOGS[1].stream === true &&
      LOGS[1].model === 'gpt-4o-mini', JSON.stringify(LOGS[1] || null));

    /* 刷新：配置恢复、Key 不在 DOM 明文出现 */
    await cdp.eval('location.reload()', 20000);
    ok('P9 刷新后页面恢复', await waitAstrium(cdp));
    var afterReload = await cdp.eval(`(function(){
      var c=window.Sources.conf('openai');
      return { hasKey:!!c.key, mask:window.Sources.maskKey('openai'),
        endpoint:c.endpoint, source:window.__astrum.getSettings().sourceId,
        bodyHasKey: document.body.innerText.indexOf('sk-browser-mock-key')>=0 };
    })()`, 10000);
    var ar = afterReload && afterReload.result && afterReload.result.value;
    ok('P10 刷新后配置恢复', ar && ar.hasKey === true && ar.endpoint === endpoint,
      JSON.stringify({ hasKey: ar && ar.hasKey, endpoint: ar && ar.endpoint }));
    ok('P11 刷新后 Key 仍只显示掩码', ar && /^••/.test(ar.mask || '') && ar.bodyHasKey === false,
      JSON.stringify({ mask: ar && ar.mask, bodyHasKey: ar && ar.bodyHasKey }));

    /* 切换 Provider：DeepSeek，使用同一 mock 端点，真实流式调用应使用新配置 */
    var switchRes = await cdp.eval(`(function(){
      window.Sources.setConfig('deepseek',{key:'sk-browser-mock-deepseek',
        endpoint:${JSON.stringify(endpoint)},model:'deepseek-chat',enabled:true});
      window.__astrum.selectSource('deepseek');
      try { window.Thread.clearAll(); } catch(e) {}
      window.__astrum.newChat();
      return { source: window.__astrum.getSettings().sourceId };
    })()`, 10000);
    var sw = switchRes && switchRes.result && switchRes.result.value;
    ok('P12 切换 Provider 生效', sw && sw.source === 'deepseek', sw && sw.source);
    var ans2 = await askAndWait(cdp, 'M42 是什么？');
    ok('P13 切换后仍能流式完成', ans2 && /M42/.test(ans2.analysis), ans2 && ans2.analysis.slice(0, 40));
    var lastLog = LOGS[LOGS.length - 1];
    ok('P14 调用使用新 Provider 配置', lastLog && lastLog.model === 'deepseek-chat' &&
      lastLog.stream === true, JSON.stringify(lastLog || null));
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
