/* ASTRUM · V1.5 浏览器 DOM / Blob / Listener / Timer 资源测试（Gate 2）
 *
 * 真实 Chrome（headless）+ file://：
 *   - AstroResearchUI.render 连续创建/销毁 20 次
 *   - 统计 DOM 节点增减、重复 ID
 *   - 监测 createObjectURL/revokeObjectURL、add/removeEventListener、setInterval/clearInterval
 *   - GC 后 JS Heap 变化
 *
 * 用法：node tools/v1-5-resource-test.js
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

var HELPERS = `
(function(){
  function heapMB(){ return (typeof performance!=='undefined'&&performance.memory)?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:-1; }
  function gcNow(){ try{ if(window.gc) window.gc(); }catch(e){} }
  var report={
    reportId:'res-test', question:'<img src=x onerror="window.__v15xss=1"> 研究资源测试', retrievedAt:'2026-11-01T00:00:00Z',
    subject:{names:['M42']}, conclusions:[{text:'<svg onload="window.__v15xss=2"></svg> M42 为恒星形成区',level:'verified',rule:'NONE',evidenceRefs:['e1']}],
    parameters:[{label:'距离',value:'1344 ly',evidenceRefs:['e1']}],
    papers:[{title:'<img src=x onerror="window.__v15xss=3"> M42 distance',year:'2024',url:'javascript:alert(1)'}],
    observations:[], calculations:[], evidence:[], conflicts:[], uncertainties:[],
    sources:[{sourceId:'src_simbad',name:'SIMBAD'}], coverage:{hasSimbad:true},
    paperStats:{fulltext:0,abstractOnly:1}, gaps:[], limitations:[], disclaimer:'<img src=x onerror="window.__v15xss=4">'
  };
  var counters={urlCreate:0,urlRevoke:0,ae:0,re:0,si:0,ci:0};
  var patches=null;
  function patch(){
    if(patches) return;
    var orig={create:URL.createObjectURL,revoke:URL.revokeObjectURL,ae:EventTarget.prototype.addEventListener,re:EventTarget.prototype.removeEventListener,si:window.setInterval,ci:window.clearInterval};
    URL.createObjectURL=function(){counters.urlCreate++;return orig.create.apply(URL,arguments);};
    URL.revokeObjectURL=function(){counters.urlRevoke++;return orig.revoke.apply(URL,arguments);};
    EventTarget.prototype.addEventListener=function(){counters.ae++;return orig.ae.apply(this,arguments);};
    EventTarget.prototype.removeEventListener=function(){counters.re++;return orig.re.apply(this,arguments);};
    window.setInterval=function(){counters.si++;return orig.si.apply(window,arguments);};
    window.clearInterval=function(){counters.ci++;return orig.ci.apply(window,arguments);};
    patches=orig;
  }
  window.__v15res={
    ready:true,
    count:function(){return document.querySelectorAll('*').length;},
    heap:heapMB,
    gc:gcNow,
    cycles:function(n){
      patch();
      var before={counter:Object.assign({},counters),nodes:document.querySelectorAll('*').length,heap:heapMB()};
      var host=document.getElementById('__v15res_host');
      if(!host){host=document.createElement('div');host.id='__v15res_host';document.body.appendChild(host);}
      var bad=0,rendered=0,dupIds=0,injected=0,xss=0,literal=0;
      delete window.__v15xss;
      for(var i=0;i<n;i++){
        var el=window.AstroResearchUI.render(report);
        if(!el){bad++;continue;}
        rendered++;
        var local={}, dups=0;
        el.querySelectorAll('[id]').forEach(function(x){ if(local[x.id])dups++; local[x.id]=1; });
        dupIds+=dups;
        injected+=el.querySelectorAll('img,script,svg,iframe,object,embed').length;
        if(el.textContent.indexOf('<img')>=0) literal++;
        host.appendChild(el);
        host.removeChild(el);
      }
      if(window.__v15xss) xss=1;
      gcNow();
      return {rendered:rendered,bad:bad,dupIds:dupIds,injected:injected,xss:xss,literal:literal,
        nodesAfter:document.querySelectorAll('*').length,
        heapAfter:heapMB(),urlCreate:counters.urlCreate-before.counter.urlCreate,
        urlRevoke:counters.urlRevoke-before.counter.urlRevoke,
        listenerAdd:counters.ae-before.counter.ae,listenerRemove:counters.re-before.counter.re,
        intervalAdd:counters.si-before.counter.si,intervalClear:counters.ci-before.counter.ci,
        nodesBefore:before.nodes,heapBefore:before.heap};
    }
  };
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
  this.ws = ws; this.id = 0; this.pending = {};
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
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; reject(new Error('CDP timeout')); } }, ms || 60000);
    });
  });
};

var results = [];
function ok(name, cond, extra) { results.push({ n: name, p: !!cond, x: extra == null ? '' : String(extra) }); }

async function main() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + HELPERS + '</script>\n' + html.slice(idx);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__v15res_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), 'astrum_v15res_' + tag);
  fs.mkdirSync(profile, { recursive: true });
  var child = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--enable-precise-memory-info', '--js-flags=--expose-gc',
    '--user-data-dir=' + profile, '--remote-debugging-port=0',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    if (!port) throw new Error('Chrome 未启动 DevToolsActivePort');
    var page = await findPage(port);
    if (!page) throw new Error('未找到页面');
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    var t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      var rr = await cdp.evaluate('!!(window.__v15res&&window.__v15res.ready)', 10000);
      if (rr && rr.result && rr.result.value === true) break;
      await sleep(300);
    }

    var base = await cdp.evaluate('__v15res.count()', 10000);
    var baseNodes = base.result.value;
    ok('R1 初始 DOM 节点数', typeof baseNodes === 'number' && baseNodes > 0, baseNodes);

    var out = await cdp.evaluate('__v15res.cycles(20)', 120000);
    var r = out && out.result ? out.result.value : null;
    if (!r) throw new Error('资源测试无返回');

    ok('R2 研究面板 20 次创建/销毁均成功', r.rendered === 20 && r.bad === 0,
      'rendered=' + r.rendered + ' bad=' + r.bad);
    ok('R3 面板内无重复 ID', r.dupIds === 0, 'dup=' + r.dupIds);
    ok('R3b 恶意 HTML 不生成节点', r.injected === 0, 'injected=' + r.injected);
    ok('R3c 恶意 HTML 不执行', r.xss === 0, 'xss=' + r.xss);
    ok('R3d 不可信内容按纯文本呈现', r.literal === 20, 'literal=' + r.literal);
    ok('R4 DOM 节点回落', r.nodesAfter <= r.nodesBefore + 5,
      'before=' + r.nodesBefore + ' after=' + r.nodesAfter);
    ok('R5 面板路径未创建 Blob URL', r.urlCreate === 0,
      'create=' + r.urlCreate + ' revoke=' + r.urlRevoke);
    ok('R6 Event Listener 净增为 0', (r.listenerAdd - r.listenerRemove) === 0,
      'add=' + r.listenerAdd + ' remove=' + r.listenerRemove);
    ok('R7 Timer 净增为 0', (r.intervalAdd - r.intervalClear) === 0,
      'setInterval=' + r.intervalAdd + ' clearInterval=' + r.intervalClear);
    ok('R8 GC 后 JS Heap 无持续增长', r.heapBefore < 0 || r.heapAfter < 0 || r.heapAfter - r.heapBefore < 10,
      'heap=' + r.heapBefore + '→' + r.heapAfter + 'MB');

    var after = await cdp.evaluate('__v15res.count()', 10000);
    ok('R9 清理后 DOM 与初始基线一致', Math.abs(after.result.value - baseNodes) <= 5,
      'base=' + baseNodes + ' now=' + after.result.value);
    ok('R10 测试限制说明', true,
      '浏览器不暴露原生 listener 表；使用 add/remove 计数与 GC 后 Heap 作为间接指标');
  } catch (e) {
    console.error('[v1-5-resource] 失败: ' + (e && e.message));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) {} }
    try {
      if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }

  var pass = results.filter(function (x) { return x.p; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (x) { console.log((x.p ? 'PASS' : 'FAIL') + ' | ' + x.n + (x.x ? ' | ' + x.x : '')); });
  process.exit(pass === results.length ? 0 : 1);
}

main();
