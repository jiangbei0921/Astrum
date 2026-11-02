/* ASTRUM · V1.5 长时间运行测试（Gate 4，真实浏览器 + 真实计时）
 *
 * 用法：
 *   node tools/v1-5-longrun-test.js --minutes=30 --label=LR-01 --out=<日志路径>
 *
 * 真实 Chrome（headless）+ file:// 加载 index.html，持续执行：
 *   T-A / T-B / T-E(Research Loop) / T-F / compare / 取消 / 文件解析 /
 *   TaskStore 读写 / 缓存探针 / 受控 Replan / 恢复。
 * 每分钟记录 17 项指标；日志逐分钟落盘，页面崩溃时保留已产生日志。
 *
 * 供应商：`network:false`（Stub/离线），不声称真实云端模型。
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

var args = process.argv.slice(2);
var minutes = 1, label = 'LR-SMOKE', outPath = '';
args.forEach(function (a, i) {
  var m = String(a).match(/^--minutes=(\S+)/);
  if (m) minutes = Math.max(0.1, Math.min(180, Number(m[1]) || 1));
  if (/^--minutes$/.test(a) && args[i + 1]) minutes = Math.max(0.1, Math.min(180, Number(args[i + 1]) || 1));
  m = String(a).match(/^--label=(\S+)/); if (m) label = m[1];
  m = String(a).match(/^--out=(\S+)/); if (m) outPath = m[1];
});
var durationMs = Math.round(minutes * 60 * 1000);

var PAGE = `
(async function(){
  var CTX={y:2026,mo:11,d:1,h:21,mi:0,tz:8,city:'北京',lat:39.9,lon:116.4,bortle:5};
  var CFG=window.AgentCore.defaultConfig();
  var DURATION=${durationMs};
  var c={tasks:0,ok:0,fail:0,cancelled:0,running:0,appends:0,replans:0,idbOk:0,idbFail:0,cacheHit:0,cacheMiss:0,pageErrors:0,unhandled:0,resumes:0,fileRuns:0,claimsRuns:0,timeouts:0};
  var snapshots=[], maxAppendsPerTask=0, maxReplansPerRun=0, maxRunning=0;
  window.addEventListener('error',function(){c.pageErrors++;});
  window.addEventListener('unhandledrejection',function(){c.unhandled++;});
  function sleep(ms){return new Promise(function(r){setTimeout(r,ms);});}
  function heapMB(){return (typeof performance!=='undefined'&&performance.memory)?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:-1;}
  function makeStub(){
    var base=window.AstroRegistry.createDefault({agentCore:window.AgentCore,network:false,adapter:window.AstroComposeAdapter.create({agentCore:window.AgentCore})});
    var sim=window.AstroEvidence.fromSimbad({id:'M42',ra:83.82,dec:-5.39,otype:'Cl*,OpC',plx:1.2},{query:'M42'});
    var paper=window.AstroEvidence.fromSourceItem({url:'https://arxiv.org/abs/2401.00001',title:'M42 distance',sourceType:'paper',excerpt:'Gaia parallax distance measurement for M42.',doi:'10.48550/arXiv.2401.00001'},{tool:'paper.search',query:'M42'});
    function run(items){return function(){return Promise.resolve({ok:true,items:items.slice(),evidenceIds:items.map(function(x){return x.evidenceId;}),provenance:{tool:'stub'}});};}
    return {register:base.register,has:base.has,list:base.list,validateArgs:base.validateArgs,checkDeps:base.checkDeps,setRuntime:base.setRuntime,
      get:function(id){var spec=base.get(id); if(!spec) return null;
        if(id==='simbad.tap') return Object.assign({},spec,{run:run([sim])});
        if(id==='paper.search') return Object.assign({},spec,{run:run([paper])});
        if(id==='evidence.search') return Object.assign({},spec,{run:run([paper])});
        return spec;}};
  }
  function makeFailing(){
    var base=window.AstroRegistry.createDefault({agentCore:window.AgentCore,network:false,adapter:window.AstroComposeAdapter.create({agentCore:window.AgentCore})});
    return {register:base.register,has:base.has,list:base.list,validateArgs:base.validateArgs,checkDeps:base.checkDeps,setRuntime:base.setRuntime,
      get:function(id){var spec=base.get(id); if(!spec) return null;
        /* T-E 的 simbad 步骤为 optional；要让 criticalFailed 触发，失败必须落在关键 compose 步骤。 */
        if(id==='compose.domain') return Object.assign({},spec,{run:function(){return Promise.resolve({ok:false,reason:'stub_fail',kind:'network',retriable:false});}});
        return spec;}};
  }
  var stub=makeStub(), failing=makeFailing();
  var store=window.AstroTaskStore.create({}); await store.init();
  var pdf=(function(){var t='BT\\n/F1 12 Tf\\n72 720 Td\\n(ASTRUM LONG RUN) Tj\\n0 -22 Td\\n(The measured value is 250 km/s.) Tj\\nET\\n';var o=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>','<< /Length '+t.length+' >>\\nstream\\n'+t+'endstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];var s='%PDF-1.4\\n',offs=[];o.forEach(function(b,i){offs.push(s.length);s+=(i+1)+' 0 obj\\n'+b+'\\nendobj\\n';});var x=s.length;s+='xref\\n0 '+(o.length+1)+'\\n0000000000 65535 f \\n';offs.forEach(function(v){s+=('0000000000'+v).slice(-10)+' 00000 n \\n';});s+='trailer\\n<< /Size '+(o.length+1)+' / Root 1 0 R >>\\nstartxref\\n'+x+'\\n%%EOF\\n';var u=new Uint8Array(s.length);for(var i=0;i<s.length;i++)u[i]=s.charCodeAt(i);return u;})();
  var fits=(function(){function card(k,v){var s=String(k);while(s.length<8)s+='=';s+='= ';if(v!==''){v=String(v);while(v.length<20)v=' '+v;s+=v;}while(s.length<80)s+=' ';return s.slice(0,80);}var u=new Uint8Array(5760);var cs=[card('SIMPLE','T'),card('BITPIX','16'),card('NAXIS','2'),card('NAXIS1','100'),card('NAXIS2','8'),card('END','')];for(var i=0;i<cs.length;i++)for(var k=0;k<80;k++)u[i*80+k]=cs[i].charCodeAt(k);return u;})();

  async function runOne(kind){
    var t0=Date.now();
    c.tasks++; c.running++; if(c.running>maxRunning) maxRunning=c.running;
    var opts={network:false,store:store,maxReplans:0};
    var q='M42 是什么';
    try{
      if(kind==='ta'){ q='M42 是什么'; }
      else if(kind==='tb'){ q='今晚能看到什么'; }
      else if(kind==='te'){ q='研究 M42 的距离测量、近五年论文与观测数据'; opts.registry=stub; opts.researchLoop=true; c.claimsRuns++; }
      else if(kind==='tf'){ q='关于 M42 距离测量存在争议的不同观点'; opts.registry=stub; }
      else if(kind==='cmp'){ q='比较 M42 和 M31'; opts.forceCompare=true; }
      else if(kind==='cancel'){ q='研究 M42 的最新论文'; var ac=new AbortController(); ac.abort(); opts.signal=ac.signal; opts.researchLoop=true; }
      else if(kind==='file'){ q='M42 是什么'; }
      else if(kind==='replan'){ q='研究 M42 的距离与论文'; opts.registry=failing; opts.maxReplans=1; }
      else { q='M42 是什么'; }

      var timer=null;
      var guard=new Promise(function(_,rej){ timer=setTimeout(function(){rej(new Error('__task_timeout__'));},30000); });
      var r=await Promise.race([window.AstroControl.run(q,CTX,CFG,opts),guard]);
      if(timer){clearTimeout(timer);timer=null;}
      if(r&&r.cancelled){ c.cancelled++; }
      else if(r&&r.answer){ c.ok++; } else { c.fail++; }
      var ev=(r&&r.state&&r.state.events)||[];
      var app=ev.filter(function(e){return e.type==='plan.expanded';}).length;
      var rep=ev.filter(function(e){return e.type==='task.replanned';}).length;
      c.appends+=app; c.replans+=rep;
      if(app>maxAppendsPerTask) maxAppendsPerTask=app;
      if(rep>maxReplansPerRun) maxReplansPerRun=rep;
      try{ await store.save(r.state); c.idbOk++; }catch(e){ c.idbFail++; }
    }catch(e){
      c.fail++;
      if(String(e&&e.message||'').indexOf('__task_timeout__')>=0) c.timeouts++;
    }
    c.running--;
    return Date.now()-t0;
  }

  async function probes(){
    try{ await store.list({limit:20}); c.idbOk++; }catch(e){ c.idbFail++; }
    try{
      localStorage.setItem('astrum.simbad.cache.v1',JSON.stringify({'m42':{at:Date.now(),info:{id:'M42',plx:1.2}}}));
      var h=await window.Simbad.lookup('M42',{}); if(h&&h.from==='cache') c.cacheHit++; else c.cacheMiss++;
      localStorage.setItem('astrum.simbad.cache.v1',JSON.stringify({'m42':{at:Date.now()-25*3600*1000,info:{id:'M42',plx:1.2}}}));
      var ac=new AbortController(); ac.abort();
      var m=await window.Simbad.lookup('M42',{signal:ac.signal});
      if(m&&m.from==='cache') c.cacheHit++; else c.cacheMiss++;
    }catch(e){ c.cacheMiss++; }
  }

  var start=Date.now(), lastSnap=start, i=0, maxTaskMs=0;
  function pushSnap(){
    try{ if(window.gc) window.gc(); }catch(e){}
    snapshots.push({t:new Date().toISOString(),elapsedMin:Math.round((Date.now()-start)/6000)/10,
      tasks:c.tasks,ok:c.ok,fail:c.fail,cancelled:c.cancelled,running:c.running,
      appends:c.appends,replans:c.replans,idbOk:c.idbOk,idbFail:c.idbFail,
      cacheHit:c.cacheHit,cacheMiss:c.cacheMiss,heap:heapMB(),pageErrors:c.pageErrors,
      unhandled:c.unhandled,ws:'n/a',maxTaskMs:maxTaskMs});
    lastSnap=Date.now();
  }
  while(Date.now()-start<DURATION){
    var kind=['ta','tb','te','tf','cmp','cancel','file','replan'][i%8];
    window.__lr_progress={i:i,kind:kind,elapsedMin:Math.round((Date.now()-start)/6000)/10,counters:c,beat:Date.now()};
    var ms=await runOne(kind);
    if(ms>maxTaskMs) maxTaskMs=ms;
    if(i%6===0){ await probes(); }
    if(i%12===0){
      try{ await window.AstroPaperAttachment.parseBytes(pdf,{fileName:'lr.pdf'}); c.fileRuns++; }catch(e){ c.fail++; }
      try{ window.AstroFits.parse({bytes:fits,fileName:'lr.fits'}); c.fileRuns++; }catch(e){ c.fail++; }
    }
    if(i%20===0){
      try{ var loaded=await window.AstroControl.load('__none__',{store:store}); if(loaded===null){ await store.list({limit:5}); } c.resumes++; }catch(e){ c.idbFail++; }
    }
    i++;
    if(Date.now()-lastSnap>=60000){ pushSnap(); }
    await sleep(100);
  }
  pushSnap();
  c.running=0;
  window.__lr_snapshots=snapshots;
  window.__lr_result={label:'${label}',minutes:DURATION/60000,counters:c,maxAppendsPerTask:maxAppendsPerTask,
    maxReplansPerRun:maxReplansPerRun,maxRunning:maxRunning,maxTaskMs:maxTaskMs,snapshots:snapshots.length,
    completed:true,provider:'stub(network:false)'};})();
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
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; reject(new Error('CDP timeout')); } }, ms || 120000);
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
  html = html.slice(0, idx) + '<script>' + PAGE + '</script>\n' + html.slice(idx);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__v15lr_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), 'astrum_v15lr_' + tag);
  fs.mkdirSync(profile, { recursive: true });

  if (!outPath) outPath = path.join(ROOT, 'docs', 'logs', 'longrun-' + label + '.jsonl');
  try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (e) {}
  fs.writeFileSync(outPath, '');
  var logStream = fs.createWriteStream(outPath, { flags: 'a' });

  var child = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--enable-precise-memory-info', '--js-flags=--expose-gc',
    '--user-data-dir=' + profile, '--remote-debugging-port=0',
    'file:///' + tmp.replace(/\\/g, '/')
  ], { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null, result = null, printed = 0, crashed = false;
  try {
    var port = await readPort(profile, 20000);
    if (!port) throw new Error('Chrome 未启动 DevToolsActivePort');
    var page = await findPage(port);
    if (!page) throw new Error('未找到页面');
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    var startedAt = Date.now();
    var deadline = Date.now() + durationMs + 150000;
    while (Date.now() < deadline) {
      try {
        var prog = await cdp.evaluate('window.__lr_progress||null', 30000);
        var pv = prog && prog.result ? prog.result.value : null;
        if (pv && pv.beat && (Date.now() - pv.beat > 180000) && (Date.now() - startedAt > 200000)) {
          logStream.write(JSON.stringify({ stalled: true, at: new Date().toISOString(), progress: pv }) + '\n');
          console.error('[v1-5-longrun] 页面心跳停止，任务可能卡死: kind=' + pv.kind + ' i=' + pv.i);
          crashed = true;
          break;
        }
        var snaps = await cdp.evaluate('window.__lr_snapshots||[]', 30000);
        var list = snaps && snaps.result ? snaps.result.value : [];
        for (; printed < list.length; printed++) logStream.write(JSON.stringify(list[printed]) + '\n');
        var done = await cdp.evaluate('window.__lr_result||null', 30000);
        var res = done && done.result ? done.result.value : null;
        if (res && res.completed) { result = res; break; }
        var href = await cdp.evaluate('location.href', 10000);
        if (!href || !href.result) crashed = true;
      } catch (e) {
        await sleep(5000);
        try { var h2 = await cdp.evaluate('1', 5000); } catch (e2) { crashed = true; }
      }
      await sleep(10000);
    }
  } catch (e) {
    console.error('[v1-5-longrun] 失败: ' + (e && e.message));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) {} }
    try {
      if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
    try { logStream.end(); } catch (e) {}
  }

  var snaps = [];
  try {
    snaps = fs.readFileSync(outPath, 'utf8').split('\n').filter(Boolean).map(function (l) { return JSON.parse(l); });
  } catch (e) {}
  var c = result ? result.counters : {};
  /* 30 分钟级长跑中 Heap 呈 GC 锯齿（0→200MB 再回落到个位数），
   * 不能取最后一个原始采样当趋势；用分区最小值的增长判断 live set 是否增长。 */
  function minsOf(list) {
    return list.map(function (s) { return s.heap; }).filter(function (v) { return typeof v === 'number' && v >= 0; });
  }
  var heaps = minsOf(snaps);
  var third = Math.max(1, Math.floor(heaps.length / 3));
  var firstMin = heaps.length ? Math.min.apply(null, heaps.slice(0, third)) : -1;
  var lastMin = heaps.length ? Math.min.apply(null, heaps.slice(-third)) : -1;
  var peak = heaps.length ? Math.max.apply(null, heaps) : -1;
  var growth = (firstMin >= 0 && lastMin >= 0) ? lastMin - firstMin : 0;
  var rows = [
    ['分钟点数量', snaps.length, snaps.length >= Math.max(1, Math.floor(minutes))],
    ['Task 总数', c.tasks || 0, (c.tasks || 0) > 0],
    ['成功', c.ok || 0, (c.ok || 0) > 0],
    ['失败', c.fail || 0, (c.fail || 0) === 0],
    ['取消', c.cancelled || 0, true],
    ['Research Loop 追加', c.appends || 0, true],
    ['单任务最大追加', result ? result.maxAppendsPerTask : 0, result ? result.maxAppendsPerTask <= 2 : false],
    ['Replan 次数', c.replans || 0, result ? result.maxReplansPerRun <= 2 : false],
    ['IndexedDB 成功', c.idbOk || 0, (c.idbOk || 0) > 0],
    ['IndexedDB 失败', c.idbFail || 0, (c.idbFail || 0) === 0],
    ['Cache Hit', c.cacheHit || 0, true],
    ['Cache Miss', c.cacheMiss || 0, true],
    ['页面错误', c.pageErrors || 0, (c.pageErrors || 0) === 0],
    ['未处理 Promise', c.unhandled || 0, (c.unhandled || 0) === 0],
    ['Task 卡死（并发未回落）', result ? result.maxRunning : 0, result ? result.maxRunning <= 1 : false],
    ['单任务超时', c.timeouts || 0, (c.timeouts || 0) === 0],
    ['Heap live-set 趋势', 'firstMin=' + firstMin + 'MB lastMin=' + lastMin + 'MB peak=' + peak + 'MB', heaps.length > 0 && growth < 20],
    ['测试完整性', result ? (result.completed ? '完成' : '未完成') : '未完成', !!result && result.completed]
  ];
  console.log('LONGRUN ' + label + ' ' + minutes + 'min');
  console.log('日志: ' + outPath);
  var pass = 0;
  rows.forEach(function (r) {
    console.log((r[2] ? 'PASS' : 'FAIL') + ' | ' + r[0] + ' | ' + r[1]);
    if (r[2]) pass++;
  });
  console.log('RESULT ' + pass + '/' + rows.length);
  if (!result || !result.completed) console.log('WARN 测试未完成或被中断，结果不得标记为通过');
  process.exit(pass === rows.length ? 0 : 1);
}

main();
