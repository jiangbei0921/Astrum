/* ASTRUM P4 B8 · 真实 Chrome 刷新恢复测试
 *
 * 使用 Chrome + file:// 加载 index.html：
 *   1) 首次加载：保存一个执行中任务（幂等步骤已完成 + 待办步骤），刷新页面；
 *   2) 刷新后：可恢复卡片出现，用户主动入口存在，恢复后续跑完成；
 *   3) 幂等步骤 attempt 不变，非幂等/待办步骤执行。
 *
 * 用法：node tools/p4-browser-test.js
 * 未检测到 Chrome 时退出 1，不标记通过。
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');

function findChrome() {
  if (process.env.STORE_TEST_CHROME) return process.env.STORE_TEST_CHROME;
  var list = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < list.length; i++) if (fs.existsSync(list[i])) return list[i];
  return null;
}

var SCRIPT = `
(function(){
  var PHASE_KEY='__p4_phase_v1';
  var TASK_KEY='__p4_task_v1';
  function emit(R){
    var pass=R.filter(function(r){return r.p;}).length;
    var pre=document.createElement('pre');
    pre.id='__p4_result';
    pre.textContent='RESULT '+pass+'/'+R.length+'\\n'+R.map(function(r){
      return (r.p?'PASS':'FAIL')+' | '+r.n+(r.x?' | '+r.x:'');
    }).join('\\n');
    document.body.appendChild(pre);
  }
  function ready(n){
    if(window.AstroTask&&window.AstroTaskStore&&window.AstroControlBridge) return true;
    if(n<=0){ emit([{n:'模块加载',p:false}]); return false; }
    setTimeout(function(){ready(n-1);},200);
    return false;
  }
  if(!ready(100)) return;
  var phase=localStorage.getItem(PHASE_KEY);
  (async function(){
    var T=window.AstroTask;
    var store=window.AstroTaskStore.create({});
    await store.init();
    if(phase!=='verify'){
      var st=T.create({question:'P4 刷新恢复实测',phase:'EXECUTE',level:'L3'});
      st.plan={planId:'p4_plan',version:1,template:'T-A',steps:[
        {id:'s1',tool:'kb.lookup',deps:[],args:{query:'M42'}},
        {id:'s2',tool:'compose.target',deps:['s1'],args:{query:'M42',from:['s1']},critical:true}
      ]};
      st.steps=st.plan.steps.map(T.makeStep);
      st.steps[0].status='ok';
      st.steps[0].attempt=0;
      st.steps[0].outputHash=T.sha256Hex('seed');
      st.steps[0].result={ok:true,targets:['M42']};
      T.appendEvent(st,'step.ok',{},'s1');
      T.addCheckpoint(st,{stepId:'s1',taskStatus:'EXECUTE'});
      await store.save(st);
      localStorage.setItem(TASK_KEY,st.id);
      localStorage.setItem(PHASE_KEY,'verify');
      location.reload();
      return;
    }
    var R=[];
    function ok(n,p,x){R.push({n:n,p:!!p,x:x||''});}
    try{
      var id=localStorage.getItem(TASK_KEY);
      ok('P4B-01 真实后端为 IndexedDB',store.backend()==='idb',store.backend());
      var list=await store.list({limit:20});
      var sum=list.filter(function(x){return x.id===id;})[0];
      ok('P4B-02 刷新后任务仍在列表',!!sum);
      ok('P4B-03 刷新后标记为可恢复',!!sum&&sum.resumable===true);
      var cps=await store.loadLatestCheckpoint(id);
      ok('P4B-04 刷新后检查点可读',!!cps&&!!cps.checkpointId);
      var before=await store.get(id);
      ok('P4B-05 刷新后步骤状态保留',!!before&&before.steps[0].status==='ok');
      await new Promise(function(res){setTimeout(res,1800);});
      var btn=Array.prototype.slice.call(document.querySelectorAll('button')).filter(function(b){
        return b.textContent&&b.textContent.indexOf('继续任务')>=0;
      })[0];
      ok('P4B-06 用户主动恢复入口出现',!!btn);
      var AC=window.AgentCore;
      var city=AC.findCity('北京')||AC.CITIES[0];
      var ctx={y:2026,mo:10,d:31,h:21,mi:0,tz:AC.tzOf(city,2026,10,31),
        city:city.n,lat:city.lat,lon:city.lon,bortle:city.bortle||5,
        cityRef:city,equipment:'单反',experience:'进阶'};
      var cfg=AC.defaultConfig();
      var r=await window.AstroControlBridge.resume(id,ctx,cfg,{store:store});
      ok('P4B-07 恢复返回答案',!!r&&!!r.answer&&r.resumed===true,
        JSON.stringify({phase:r&&r.state&&r.state.phase,error:r&&r.error,verdict:r&&r.verdict}));
      ok('P4B-08 恢复次数为 1',!!r&&r.recovery&&r.recovery.attempt===1, r&&r.recovery&&r.recovery.attempt);
      var after=r&&r.state;
      ok('P4B-09 幂等步骤不重跑',!!after&&after.steps[0].attempt===0&&after.steps[0].status==='ok',
        after&&after.steps[0]&&after.steps[0].attempt);
      ok('P4B-10 待办步骤已执行',!!after&&after.steps[1].status==='ok',
        JSON.stringify({s:after&&after.steps[1]&&after.steps[1].status,e:after&&after.steps[1]&&after.steps[1].error}));
      ok('P4B-11 恢复后进入终态',!!after&&['DONE','PARTIAL'].indexOf(after.phase)>=0, after&&after.phase);
      var left=await store.listResumable();
      ok('P4B-12 完成后不再可恢复',!left.some(function(x){return x.id===id;}));
      ok('P4B-13 恢复事件已记录',!!after&&after.events.some(function(e){return e.type==='task.recovered';}));
    }catch(e){
      ok('浏览器恢复异常',false,String(e&&e.message||e));
    }
    emit(R);
  })();
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
  var chrome = findChrome();
  if (!chrome) {
    console.error('[p4-browser] 未找到 Chrome，测试未运行（不计通过）。');
    process.exit(1);
  }
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>\n' + html.slice(idx);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__p4_browser_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');

  var profile = path.join(os.tmpdir(), 'astrum_p4_browser_' + tag);
  fs.mkdirSync(profile, { recursive: true });
  var child = cp.spawn(chrome, [
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
    while (Date.now() - t0 < 120000) {
      var r = await cdp.evaluate("(document.getElementById('__p4_result')||{}).textContent||''", 5000);
      if (r && typeof r.result.value === 'string' && /^RESULT \d+\/\d+/.test(r.result.value)) {
        decoded = r.result.value; break;
      }
      await sleep(500);
    }
  } catch (e) {
    console.error('[p4-browser] CDP 失败: ' + (e && e.message));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) { /* ignore */ } }
    try {
      if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch (e) { /* ignore */ }
    try { fs.unlinkSync(tmp); } catch (e) { /* ignore */ }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { /* ignore */ }
  }
  if (!decoded) { console.error('[p4-browser] 未取得结果（未运行/超时，不计通过）。'); process.exit(1); }
  console.log(decoded);
  var mm = decoded.match(/RESULT (\d+)\/(\d+)/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main();
