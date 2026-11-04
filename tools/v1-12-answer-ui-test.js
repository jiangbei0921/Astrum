/* ASTRUM · 结果阅读区重设计浏览器测试
 *
 * 覆盖：
 *   - 问题标题存在，系统徽标视觉隐藏
 *   - C–E 结论使用轻量强调区；A/B 直接作为导语，不额外套卡
 *   - 科研依据 / 执行详情默认折叠，正文不混入证据表、评审、来源状态
 *   - 论文列表位于科研依据内
 *   - 轻量操作：复制、有帮助、没有帮助、查看科研依据、继续追问
 *   - 深色模式与 390px 移动端无横向溢出
 *
 * 用法：node tools/v1-12-answer-ui-test.js
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
    '/usr/bin/google-chrome', '/usr/bin/chromium'];
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

var ANSWER_C = `(function(){
  var ans={query:'M13 球状星团的年龄与金属丰度目前有哪些研究结论？',intent:'knowledge-target',targets:['M13'],
    trace:[{agent:'muse',action:'解析意图',ok:true},{agent:'vega',action:'检索论文',ok:true}],
    sections:[
      {kind:'verdict',head:'M13 的年龄约为 12 Gyr，金属丰度 [Fe/H] ≈ -1.53。'},
      {kind:'analysis',title:'综合研判',mode:'C',paragraphs:[
        {role:'model',text:'多数文献给出的年龄集中在 11.6–12.8 Gyr；不同测量之间的差异主要来自恒星库与红化修正。'},
        {role:'conclusion',text:'核心结论：M13 的年龄约为 12 Gyr。'},
        {role:'limitation',text:'本轮仅获得摘要级证据，未对原始星表做独立复算。'}
      ]},
      {kind:'evidence',title:'关键数据',items:[{label:'年龄',value:'约 12 Gyr'},{label:'金属丰度',value:'[Fe/H] ≈ -1.53'}]},
      {kind:'sources',title:'知识来源与执行状态',items:[{label:'本地知识库',status:'hit',detail:'命中基础事实'}]},
      {kind:'review',title:'评审结论',passed:true,checks:[{ok:true,k:'证据自洽',v:'6 条'}]},
      {kind:'boundary',mode:'uncertain',text:'不同论文的年龄测量存在约 1 Gyr 差异。'}
    ],
    meta:{register:'pop',tier:'infer',quality:{mode:'C',passed:true,issues:[],unsupportedNumbers:[]},messageId:'m-ui-c'},
    research:{question:'M13',subject:{names:['M13']},retrievedAt:'2026-11-04',conclusions:[],papers:[
      {title:'A New Age Measurement of M13',authors:['A. Author'],date:'2024-01-01',doi:'10.1093/mnras/stz642',excerpt:'Age 11.6 Gyr.',url:'https://arxiv.org/abs/2401.00001',abstractOnly:true},
      {title:'Revisiting the Age of M13',authors:['B. Author'],date:'2023-05-01',doi:'10.3847/1538-4357/ab1234',excerpt:'Age 12.8 Gyr.',url:'https://arxiv.org/abs/2305.00002',abstractOnly:true}
    ],evidence:[],parameters:[],observations:[],conflicts:[],gaps:['仅摘要'],limitations:[]}
  };
  window.__astrum.renderAnswer(ans,{state:{id:'task-ui',steps:[{tool:'paper.search',status:'ok',ms:120}]}});
  return 'ok';
})()`;

var ANSWER_A = `(function(){
  var ans={query:'M42 是什么？',intent:'intro-target',targets:['M42'],
    sections:[
      {kind:'verdict',head:'M42 是猎户座大星云，一个正在孕育新恒星的发射星云。'},
      {kind:'evidence',title:'依据',items:[{label:'类型',value:'发射星云'},{label:'距离',value:'约 1,344 光年'}]}
    ],
    meta:{register:'pop',tier:'infer',quality:{mode:'A',passed:true,issues:[],unsupportedNumbers:[]},messageId:'m-ui-a'}
  };
  window.__astrum.renderAnswer(ans);
  return 'ok';
})()`;

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_ui12_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0',
    'http://127.0.0.1:' + srv.port + '/index.html'], { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    await cdp.send('Runtime.enable');
    for (var i = 0; i < 100; i++) {
      var ready = await cdp.eval('!!(window.__astrum && window.Sources)', 10000);
      if (ready && ready.result && ready.result.value === true) break;
      await sleep(250);
    }

    var renderC = await cdp.eval(ANSWER_C, 20000);
    ok('U1 复杂科研答案渲染', renderC && renderC.result && renderC.result.value === 'ok');
    await sleep(400);
    var c = await cdp.eval(`(function(){
      var ans=document.querySelector('#thread .msg.bot:last-child .answer');
      var head=ans.querySelector('.answer-head');
      var hs=getComputedStyle(head);
      var basis=ans.querySelector('.answer-basis');
      var details=ans.querySelector('.answer-details');
      var main=ans.querySelector('.answer-main');
      var primary=ans.querySelector('.ans-acts');
      return {
        question: !!ans.querySelector('.answer-question'),
        title: (ans.querySelector('.answer-question')||{}).textContent||'',
        headHidden: hs.position==='absolute' && head.getBoundingClientRect().width<=1,
        summary: !!ans.querySelector('.sec-verdict.answer-summary'),
        lead: !!ans.querySelector('.sec-verdict.answer-lead'),
        basis: !!basis, basisOpen: !!(basis&&basis.open),
        details: !!details, detailsOpen: !!(details&&details.open),
        mainEvidence: !!main.querySelector('.sec-evidence'),
        mainSources: !!main.querySelector('.sec-sources'),
        mainReview: !!main.querySelector('.review-fold'),
        mainTrace: !!main.querySelector('.trace-fold'),
        mainMeta: !!main.querySelector('.meta-bar'),
        paperCards: (basis?basis.querySelectorAll('.paper-card').length:0),
        researchPanel: !!(basis&&basis.querySelector('.research-panel')),
        acts: Array.prototype.map.call(primary.querySelectorAll(':scope > .ans-act'),function(b){return b.textContent.trim();}),
        moreHasFeedback: !!(ans.querySelector('.ans-more')&&Array.prototype.some.call(ans.querySelectorAll('.ans-more .ans-act'),function(b){return /反馈问题/.test(b.textContent);})),
        duplicateConclusion: Array.prototype.some.call(ans.querySelectorAll('.analysis-p'),function(p){return /^核心结论/.test(p.textContent.trim());})
      };
    })()`, 10000);
    var v = c && c.result && c.result.value;
    ok('U2 问题标题存在', v && v.question && /M13/.test(v.title || ''), v && v.title);
    ok('U3 系统徽标视觉隐藏', v && v.headHidden === true);
    ok('U4 C 类使用轻量结论区', v && v.summary === true && v.lead === false);
    ok('U5 综合分析不重复核心结论', v && v.duplicateConclusion === false);
    ok('U6 科研依据默认折叠', v && v.basis === true && v.basisOpen === false);
    ok('U7 执行详情默认折叠', v && v.details === true && v.detailsOpen === false);
    ok('U8 正文不混入证据/来源/评审/链路/元信息', v && !v.mainEvidence && !v.mainSources &&
      !v.mainReview && !v.mainTrace && !v.mainMeta,
      JSON.stringify({ e: v && v.mainEvidence, s: v && v.mainSources, r: v && v.mainReview, t: v && v.mainTrace, m: v && v.mainMeta }));
    ok('U9 论文在科研依据内', v && v.paperCards === 2 && v.researchPanel === true, v && v.paperCards);
    ok('U10 轻量操作齐全', v && ['复制', '有帮助', '没有帮助', '查看科研依据', '继续追问'].every(function (x) {
      return (v.acts || []).indexOf(x) >= 0;
    }), JSON.stringify(v && v.acts));
    ok('U11 反馈入口保留在更多中', v && v.moreHasFeedback === true);

    /* 操作行为 */
    var behave = await cdp.eval(`(function(){
      var ans=document.querySelector('#thread .msg.bot:last-child .answer');
      var btns=ans.querySelectorAll('.ans-act');
      var basisBtn=Array.prototype.filter.call(btns,function(b){return b.textContent==='查看科研依据';})[0];
      var helpBtn=Array.prototype.filter.call(btns,function(b){return b.textContent==='有帮助';})[0];
      var askBtn=Array.prototype.filter.call(btns,function(b){return b.textContent==='继续追问';})[0];
      if(basisBtn) basisBtn.click();
      if(helpBtn) helpBtn.click();
      if(askBtn) askBtn.click();
      return { basisOpen: !!ans.querySelector('.answer-basis') && ans.querySelector('.answer-basis').open,
        helpful: helpBtn && helpBtn.classList.contains('on'),
        focused: document.activeElement && document.activeElement.id };
    })()`, 10000);
    var bv = behave && behave.result && behave.result.value;
    ok('U12 查看科研依据可展开', bv && bv.basisOpen === true);
    ok('U13 有帮助有即时反馈状态', bv && bv.helpful === true);
    ok('U14 继续追问聚焦输入框', bv && bv.focused === 'input', bv && bv.focused);

    /* 简单事实：不额外套结论卡 */
    var renderA = await cdp.eval(ANSWER_A, 20000);
    ok('U15 简单事实答案渲染', renderA && renderA.result && renderA.result.value === 'ok');
    await sleep(300);
    var a = await cdp.eval(`(function(){
      var ans=document.querySelector('#thread .msg.bot:last-child .answer');
      return { summary: !!ans.querySelector('.answer-summary'), lead: !!ans.querySelector('.answer-lead'),
        narr: !!ans.querySelector('.narr'),
        basis: !!ans.querySelector('.answer-basis'), question: !!ans.querySelector('.answer-question') };
    })()`, 10000);
    var av = a && a.result && a.result.value;
    ok('U16 A 类直接导语，无额外结论卡', av && av.summary === false && (av.lead === true || av.narr === true), JSON.stringify(av));
    ok('U17 A 类不强行生成依据折叠', av && av.basis === false, JSON.stringify(av));

    /* 移动端与深色 */
    await cdp.eval(ANSWER_C, 20000);
    await sleep(300);
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(500);
    await cdp.eval("window.dispatchEvent(new Event('resize')); 'ok'");
    await sleep(300);
    var mob = await cdp.eval(`(function(){
      var ans=document.querySelector('#thread .msg.bot:last-child .answer');
      return { overflow: document.documentElement.scrollWidth - window.innerWidth,
        answerOverflow: ans.scrollWidth - ans.clientWidth,
        font: getComputedStyle(ans.querySelector('.analysis-p')||ans).fontSize };
    })()`, 10000);
    var mv = mob && mob.result && mob.result.value;
    ok('U18 390px 无横向溢出', mv && mv.overflow <= 1 && mv.answerOverflow <= 1, JSON.stringify(mv));
    ok('U19 移动端正文字号可读', mv && parseFloat(mv.font) >= 13, mv && mv.font);

    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false });
    await sleep(400);
    await cdp.eval("document.documentElement.setAttribute('data-theme','night'); 'ok'");
    await sleep(250);
    var dark = await cdp.eval(`(function(){
      var ans=document.querySelector('#thread .msg.bot:last-child .answer');
      var sm=ans.querySelector('.answer-summary');
      return { theme: document.documentElement.getAttribute('data-theme'),
        answerBg: getComputedStyle(ans).backgroundColor,
        summaryBg: sm?getComputedStyle(sm).backgroundColor:'',
        ink: getComputedStyle(ans.querySelector('.analysis-p')||ans).color };
    })()`, 10000);
    var dv = dark && dark.result && dark.result.value;
    ok('U20 深色主题生效', dv && dv.theme === 'night');
    ok('U21 深色正文仍使用高对比文字', dv && /rgb\(195, 201, 212\)/.test(dv.ink || ''), dv && dv.ink);
  } finally {
    try { if (cdp && cdp.ws) cdp.ws.close(); } catch (e) {}
    try { child.kill(); } catch (e) {}
    try { srv.server.close(); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
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
