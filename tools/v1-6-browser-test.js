/* ASTRUM · 多任务恢复与步骤面板浏览器测试
 *
 * 真实 Chrome + 本地 HTTP：种入 2 个可恢复任务，刷新后检查列表，
 * 逐个恢复并检查 TaskState 步骤面板。用法：node tools/v1-6-browser-test.js
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
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  return 'chrome';
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function mime(p) {
  if (/\.html$/.test(p)) return 'text/html; charset=utf-8';
  if (/\.js$/.test(p)) return 'text/javascript; charset=utf-8';
  if (/\.css$/.test(p)) return 'text/css; charset=utf-8';
  if (/\.json$/.test(p)) return 'application/json';
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
  ws.addEventListener('message', function (e) { var m = JSON.parse(e.data); if (m.id && self.pending[m.id]) { var p = self.pending[m.id]; delete self.pending[m.id]; m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } });
}
Cdp.prototype.eval = function (expr, ms) {
  var self = this;
  return this.ready.then(function () {
    return new Promise(function (res, rej) {
      var id = ++self.id; self.pending[id] = { resolve: res, reject: rej };
      self.ws.send(JSON.stringify({ id: id, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true, awaitPromise: true } }));
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; rej(new Error('timeout')); } }, ms || 60000);
    });
  });
};
var results = [];
function ok(n, p, x) { results.push({ n: n, p: !!p, x: x == null ? '' : String(x) }); }

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v16b_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'http://127.0.0.1:' + srv.port + '/index.html?layout=fixed'], { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    var t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      var r = await cdp.eval('!!(window.AstroTaskStore&&window.AstroTask&&window.AstroControlBridge)', 10000);
      if (r && r.result && r.result.value === true) break;
      await sleep(300);
    }
    var seed = await cdp.eval(`(async function(){
      var store=window.AstroTaskStore.create({}); await store.init(); await store.clear();
      var T=window.AstroTask;
      for(var i=0;i<2;i++){
        var st=T.create({question:'浏览器多任务恢复 '+i,level:'L2'});
        st.phase='EXECUTE';
        var a=T.makeStep({id:'s1',tool:'kb.lookup',args:{},deps:[],parallel:false,critical:false,optional:false});
        a.status='ok';a.outputHash='test';
        var b=T.makeStep({id:'s2',tool:'compose.simple',args:{query:'M42',from:[]},deps:[],parallel:false,critical:false,optional:false});
        st.steps=[a,b];
        await store.save(st);
      }
      return 'seeded';
    })()`, 30000);
    ok('B1 任务种入成功', seed && seed.result && seed.result.value === 'seeded');
    await cdp.eval('location.reload()', 20000);
    await sleep(1500);
    var rows = null;
    for (var k = 0; k < 30; k++) {
      var rr = await cdp.eval("document.querySelectorAll('.resume-row').length", 10000);
      rows = rr && rr.result ? rr.result.value : 0;
      if (rows >= 2) break;
      await sleep(300);
    }
    ok('B2 刷新后列出 2 个可恢复任务', rows >= 2, 'rows=' + rows);
    var txt = await cdp.eval("Array.prototype.map.call(document.querySelectorAll('.resume-q'),function(x){return x.textContent;}).join('|')", 10000);
    ok('B3 任务问题文本独立展示', txt && txt.result && txt.result.value.indexOf('浏览器多任务恢复 0') >= 0 &&
      txt.result.value.indexOf('浏览器多任务恢复 1') >= 0, txt && txt.result.value);
    var click = await cdp.eval("document.querySelector('.resume-row button').click();'clicked'", 10000);
    ok('B4 可单独恢复第一个任务', click && click.result && click.result.value === 'clicked');
    var stepRows = 0, sum = '';
    for (var q = 0; q < 60; q++) {
      var sr = await cdp.eval("document.querySelectorAll('.step-panel .step-row').length", 10000);
      stepRows = sr && sr.result ? sr.result.value : 0;
      var su = await cdp.eval("(document.querySelector('.step-summary')||{}).textContent||''", 10000);
      sum = su && su.result ? su.result.value : '';
      if (stepRows >= 2) break;
      await sleep(300);
    }
    ok('B5 恢复后展示真实步骤面板', stepRows >= 2, 'stepRows=' + stepRows + ' summary=' + sum);
    ok('B6 步骤面板不是固定百分比', /执行步骤 · \d+\/\d+ 完成/.test(sum), sum);
    var left = await cdp.eval("document.querySelectorAll('.resume-row').length", 10000);
    ok('B7 恢复后只移除对应任务', left && left.result && left.result.value === 1, 'left=' + (left && left.result && left.result.value));
  } catch (e) {
    ok('浏览器异常', false, String(e && e.stack || e).slice(0, 240));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) {} }
    try { if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); else child.kill('SIGKILL'); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    try { srv.server.close(); } catch (e) {}
  }
  var pass = results.filter(function (x) { return x.p; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (x) { console.log((x.p ? 'PASS' : 'FAIL') + ' | ' + x.n + (x.x ? ' | ' + x.x : '')); });
  process.exitCode = pass === results.length ? 0 : 1;
})();
