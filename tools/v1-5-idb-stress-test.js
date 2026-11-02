/* ASTRUM · V1.5 真实浏览器 IndexedDB 1000 条压力测试
 *
 * 使用 Chrome + file:// 真实加载 index.html，调用 AstroTaskStore：
 * 1000 条写入、列表、读取、删除、清理；验证后端为 idb。
 *
 * 用法：node tools/v1-5-idb-stress-test.js
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');

function findChrome() {
  if (process.env.STORE_TEST_CHROME) return process.env.STORE_TEST_CHROME;
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  return 'chrome';
}

var SCRIPT = `
(async function(){
  var R=[];
  function ok(n,p,x){R.push({n:n,p:!!p,x:x||''});}
  try{
    var store=window.AstroTaskStore.create({});
    await store.init();
    var T=window.AstroTask;
    var t0=Date.now();
    for(var i=0;i<1000;i++){
      var s=T.create({question:'idb-'+i,level:'L2'});
      s.phase='EXECUTE';
      await store.save(s);
    }
    var saveMs=Date.now()-t0;
    var list=await store.list({limit:1000});
    ok('I1 后端为 IndexedDB',store.backend()==='idb',store.backend());
    ok('I2 1000 条写入',list.length===1000,'n='+list.length+' ms='+saveMs);
    var ids={};
    ok('I3 无重复',list.every(function(x){var d=!!ids[x.id];ids[x.id]=1;return !d;}));
    var got=await store.get(list[0].id);
    ok('I4 单条读取',!!got&&got.phase==='EXECUTE');
    var t1=Date.now();
    for(var k=0;k<500;k++) await store.remove(list[k].id);
    var left=await store.list({limit:1000});
    ok('I5 删除 500 条',left.length===500,'n='+left.length+' ms='+(Date.now()-t1));
    await store.clear();
    var after=await store.list({limit:20});
    ok('I6 清理后为空',after.length===0,'n='+after.length);
    ok('I7 总耗时记录',true,'save='+saveMs+'ms');
  }catch(e){ok('IDB 异常',false,String(e&&e.message||e));}
  var pass=R.filter(function(r){return r.p;}).length;
  var pre=document.createElement('pre');pre.id='__v15_idb_result';
  pre.textContent='RESULT '+pass+'/'+R.length+'\\n'+R.map(function(r){return (r.p?'PASS':'FAIL')+' | '+r.n+(r.x?' | '+r.x:'');}).join('\\n');
  document.body.appendChild(pre);
})();
`;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
async function readPort(profile, budget) {
  var file = path.join(profile, 'DevToolsActivePort');
  var t0 = Date.now();
  while (Date.now() - t0 < budget) {
    if (fs.existsSync(file)) {
      var txt = fs.readFileSync(file, 'utf8').split('\n');
      if (txt[0]) return Number(txt[0]);
    }
    await sleep(200);
  }
  return null;
}
async function findPage(port) {
  var r = await fetch('http://127.0.0.1:' + port + '/json/list');
  var list = await r.json();
  return (list || []).filter(function (p) { return p.type === 'page'; })[0] || null;
}
function Cdp(ws) {
  var self = this;
  this.ws = ws; this.id = 0; this.pending = {}; this.closed = false;
  this.ready = new Promise(function (resolve, reject) {
    ws.addEventListener('open', function () { resolve(); });
    ws.addEventListener('error', function () { reject(new Error('WebSocket error')); });
  });
  ws.addEventListener('message', function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && self.pending[m.id]) {
      var p = self.pending[m.id]; delete self.pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || String(m.error)));
      else p.resolve(m.result);
    }
  });
  ws.addEventListener('close', function () { self.closed = true; });
}
Cdp.prototype.evaluate = function (expr, ms) {
  var self = this;
  return this.ready.then(function () {
    return new Promise(function (resolve, reject) {
      var id = ++self.id;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify({ id: id, method: 'Runtime.evaluate', params: {
        expression: expr, returnByValue: true, awaitPromise: true
      } }));
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; reject(new Error('CDP timeout')); } }, ms || 10000);
    });
  });
};

async function main() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>\n' + html.slice(idx);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__v15_idb_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');

  var profile = path.join(os.tmpdir(), 'astrum_v15_idb_' + tag);
  fs.mkdirSync(profile, { recursive: true });
  var child = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { stdio: ['ignore', 'ignore', 'inherit'] });
  var cdp = null, decoded = '';
  try {
    var port = await readPort(profile, 20000);
    if (!port) throw new Error('Chrome 未启动 DevToolsActivePort');
    var page = await findPage(port);
    if (!page) throw new Error('未找到页面');
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    var t0 = Date.now();
    while (Date.now() - t0 < 90000) {
      var r = await cdp.evaluate("(document.getElementById('__v15_idb_result')||{}).textContent||''", 5000);
      if (r && typeof r.result.value === 'string' && /^RESULT \d+\/\d+/.test(r.result.value)) {
        decoded = r.result.value; break;
      }
      await sleep(500);
    }
  } catch (e) {
    console.error('[v1-5-idb] CDP 失败: ' + (e && e.message));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) {} }
    try {
      if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  if (!decoded) { console.error('[v1-5-idb] 未取得结果'); process.exit(1); }
  console.log(decoded);
  var mm = decoded.match(/RESULT (\d+)\/(\d+)/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main();
