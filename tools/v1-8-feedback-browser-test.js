/* ASTRUM · V1.8 反馈浏览器测试
 *
 * 真实 Chrome + 本地 HTTP：
 *   - 失败任务触发对话内轻提示，可打开反馈弹窗、可忽略、同任务同类别不重复
 *   - 成功任务不误触发
 *   - 回答操作条「反馈问题」关联当前回答/消息 ID/Task ID
 *   - 表单必填校验、诊断预览脱敏、确认页主题/收件人/不自动发送
 *   - 设置 → 帮助 → 问题反馈入口
 *   - 390px 窄屏不横向溢出；无 JS/CSP 错误
 *
 * 用法：node tools/v1-8-feedback-browser-test.js
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
    if (fs.existsSync(f)) {
      var l = fs.readFileSync(f, 'utf8').split('\n');
      if (l[0]) return Number(l[0]);
    }
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
  this.ready = new Promise(function (res, rej) {
    ws.addEventListener('open', function () { res(); });
    ws.addEventListener('error', function () { rej(new Error('ws')); });
  });
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
      setTimeout(function () {
        if (self.pending[id]) { delete self.pending[id]; rej(new Error('timeout')); }
      }, ms || 60000);
    });
  });
};
Cdp.prototype.eval = function (expr, ms) {
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, ms);
};
function valueOf(r) { return r && r.result ? r.result.value : undefined; }
var results = [];
function ok(n, p, x) { results.push({ n: n, p: !!p, x: x == null ? '' : String(x) }); }

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v18fb_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0',
    'http://127.0.0.1:' + srv.port + '/index.html?layout=fixed'], { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    var t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      var ready = valueOf(await cdp.eval('!!(window.__astrum&&window.AstroFeedback&&window.Thread)', 10000));
      if (ready) break;
      await sleep(300);
    }
    await cdp.eval(`(function(){
      window.__fbErrs=[];
      window.__fbCsp=[];
      window.addEventListener('error',function(e){window.__fbErrs.push(String(e.message||e));});
      window.addEventListener('securitypolicyviolation',function(e){window.__fbCsp.push(e.violatedDirective||'csp');});
      return true;
    })()`, 10000);

    var cfg = valueOf(await cdp.eval('window.AstroFeedback.config()', 10000));
    ok('B1 反馈模块已加载', !!valueOf(await cdp.eval('!!window.AstroFeedback')));
    ok('B2 收件邮箱正确', cfg && cfg.feedbackEmail === '2185428966@qq.com', cfg && cfg.feedbackEmail);
    ok('B3 九种反馈类型可选', valueOf(await cdp.eval('window.AstroFeedback.TYPES.length')) === 9);

    /* 创建线程，保证 renderAnswer 可持久化 */
    ok('B4 测试线程就绪', valueOf(await cdp.eval(`(async function(){
      await window.Thread.ensure('反馈 UI 测试');
      return !!(window.Thread.current() && window.Thread.current().id);
    })()`, 20000)) === true);
    await cdp.eval('window.AstroFeedback.clearPromptHistory();true', 10000);

    /* 失败任务触发提示 */
    var rendered = valueOf(await cdp.eval(`(function(){
      var ans={
        query:'M42 的距离是多少？',
        intent:'lookup', targets:[],
        trace:[{agent:'muse',action:'检索规划',tool:'paper.search'},
               {agent:'scholar',action:'解析 PDF',tool:'paper.fulltext',ok:false}],
        sections:[
          {kind:'verdict',head:'M42 距离约 1344 光年',text:'引用外部论文摘要。'},
          {kind:'evidence',title:'依据',items:[{label:'距离',value:'1344 光年',source:'论文摘要'}]},
          {kind:'review',title:'评审',verdict:'PARTIAL',note:'外部检索失败'}
        ],
        meta:{register:'pop',tier:'fetch',agents:['muse','scholar'],status:'established'}
      };
      var state={id:'task-ui-err',question:ans.query,steps:[
        {id:'s1',tool:'paper.search',status:'failed',error:{kind:'timeout',message:'HTTP 403'},durationMs:20},
        {id:'s2',tool:'paper.fulltext',status:'failed',error:{kind:'pdf_no_text',message:'PDF 无文本'},durationMs:30}
      ],events:[{type:'step.failed',stepId:'s1',payload:{reason:'timeout'}}],plan:{template:'T-E'}};
      window.__astrum.renderAnswer(ans,{state:state});
      var offers=document.querySelectorAll('.fb-offer');
      var offer=offers[offers.length-1]||null;
      return {offer:!!offer,
        text:offer?offer.textContent:'',
        buttons:offer?offer.querySelectorAll('.fb-btn').length:0,
        tag:offer&&offer.querySelector('.fb-tag')?offer.querySelector('.fb-tag').textContent:''};
    })()`, 20000));
    ok('B5 失败任务出现主动提示', rendered && rendered.offer === true, JSON.stringify(rendered));
    ok('B6 主动提示包含说明文案', rendered && /是否将问题反馈给 ASTRUM 开发团队/.test(rendered.text || ''));
    ok('B7 主动提示提供两个操作', rendered && rendered.buttons === 2, rendered && rendered.buttons);
    ok('B8 主动提示标注错误类别', rendered && /外部服务错误|数据解析错误/.test(rendered.tag || ''), rendered && rendered.tag);

    /* 打开反馈弹窗 */
    var opened = valueOf(await cdp.eval(`(function(){
      var offers=document.querySelectorAll('.fb-offer');
      var offer=offers[offers.length-1];
      var go=offer?offer.querySelector('.fb-btn.primary'):null;
      if(!go) return {error:'no offer button'};
      go.click();
      var body=document.getElementById('feedbackBody');
      return {
        on:document.getElementById('feedback').classList.contains('on'),
        type:document.getElementById('fbType').value,
        title:document.getElementById('fbTitle').value,
        diag:document.getElementById('fbDiag').checked,
        ctx:body.querySelector('.fb-context')?body.querySelector('.fb-context').textContent:'',
        ctxHasTask:body.querySelector('.fb-context')?(body.querySelector('.fb-context').textContent.indexOf('task-ui-err')>=0):false
      };
    })()`, 20000));
    ok('B9 点击反馈问题打开弹窗', opened && opened.on === true, opened && JSON.stringify(opened));
    ok('B10 自动选择反馈类型', opened && opened.type === 'pdf_parse', opened && opened.type);
    ok('B11 自动填写问题标题', opened && /任务异常反馈/.test(opened.title || ''), opened && opened.title);
    ok('B12 关联当前任务 ID', opened && opened.ctxHasTask === true, opened && opened.ctx);
    ok('B13 诊断默认不附加', opened && opened.diag === false);
    ok('B14 关联当前问题文本', opened && /M42 的距离是多少/.test(opened.ctx || ''));

    /* 关闭后草稿可恢复 */
    await cdp.eval("document.getElementById('feedbackClose').click();true", 10000);
    ok('B15 关闭后弹窗收起', valueOf(await cdp.eval("!document.getElementById('feedback').classList.contains('on')")) === true);
    var restored = valueOf(await cdp.eval(`(function(){
      var offers=document.querySelectorAll('.fb-offer');
      var offer=offers[offers.length-1];
      if(!offer) return {error:'no offer'};
      offer.querySelector('.fb-btn.primary').click();
      var body=document.getElementById('feedbackBody');
      return {title:document.getElementById('fbTitle').value,
        note:/已恢复上次未提交/.test(body.textContent)};
    })()`, 20000));
    ok('B16 重新打开恢复未提交草稿', restored && /任务异常反馈/.test(restored.title || ''), restored && restored.title);
    ok('B17 明确提示已恢复草稿', restored && restored.note === true);

    /* 忽略提示，并验证同任务同类别不重复 */
    await cdp.eval("document.getElementById('feedbackClose').click();true", 10000);
    var beforeCount = valueOf(await cdp.eval("document.querySelectorAll('.fb-offer').length"));
    var ignored = valueOf(await cdp.eval(`(function(){
      var offers=document.querySelectorAll('.fb-offer');
      var offer=offers[offers.length-1];
      var skip=offer?offer.querySelector('.fb-btn.ghost'):null;
      if(!skip) return {error:'no skip'};
      skip.click();
      return {text:offer.textContent};
    })()`, 10000));
    ok('B18 可以暂时忽略提示', ignored && /已忽略本次提示/.test(ignored.text || ''), ignored && ignored.text);
    await cdp.eval(`(function(){
      var ans={query:'M42 的距离是多少？',intent:'lookup',targets:[],trace:[],
        sections:[{kind:'verdict',head:'M42 距离约 1344 光年'}],
        meta:{register:'pop',tier:'fetch',agents:['muse']}};
      var state={id:'task-ui-err',question:ans.query,steps:[
        {id:'s1',tool:'paper.search',status:'failed',error:{kind:'timeout',message:'HTTP 403'},durationMs:20},
        {id:'s2',tool:'paper.fulltext',status:'failed',error:{kind:'pdf_no_text',message:'PDF 无文本'},durationMs:30}
      ],events:[{type:'step.failed',stepId:'s1',payload:{reason:'timeout'}}],plan:{template:'T-E'}};
      window.__astrum.renderAnswer(ans,{state:state});
      return true;
    })()`, 20000);
    var afterCount = valueOf(await cdp.eval("document.querySelectorAll('.fb-offer').length"));
    ok('B19 同任务同类别不重复弹出', afterCount === beforeCount, 'before=' + beforeCount + ' after=' + afterCount);

    /* 成功任务不误触发 */
    var success = valueOf(await cdp.eval(`(function(){
      var ans={query:'M42 是什么？',intent:'lookup',targets:[],trace:[{agent:'muse',action:'检索'}],
        sections:[{kind:'verdict',head:'M42 是猎户座大星云'},{kind:'evidence',title:'依据',items:[{label:'类型',value:'发射星云'}]}],
        meta:{register:'pop',tier:'infer',agents:['muse']}};
      var state={id:'task-ui-ok',question:ans.query,steps:[{id:'s1',tool:'kb.lookup',status:'ok'}],events:[],plan:{template:'T-B'}};
      window.__astrum.renderAnswer(ans,{state:state});
      var msg=document.querySelector('#thread .msg.bot:last-child');
      return {offer:!!msg.querySelector('.fb-offer'),actions:msg.querySelectorAll('.ans-act').length,
        fbBtn:Array.prototype.some.call(msg.querySelectorAll('.ans-act'),function(b){return b.textContent.indexOf('反馈问题')>=0;})};
    })()`, 20000));
    ok('B20 成功任务不出现主动提示', success && success.offer === false, JSON.stringify(success));
    ok('B21 每条回答有操作条', success && success.actions >= 3, success && success.actions);
    ok('B22 回答操作条含反馈问题', success && success.fbBtn === true);

    /* 回答反馈入口与上下文 */
    var ansOpen = valueOf(await cdp.eval(`(function(){
      var msg=document.querySelector('#thread .msg.bot:last-child');
      var btn=Array.prototype.filter.call(msg.querySelectorAll('.ans-act'),function(b){return b.textContent.indexOf('反馈问题')>=0;})[0];
      if(!btn) return {error:'no feedback button'};
      btn.click();
      var body=document.getElementById('feedbackBody');
      return {on:document.getElementById('feedback').classList.contains('on'),
        type:document.getElementById('fbType').value,
        title:document.getElementById('fbTitle').value,
        ctx:body.querySelector('.fb-context')?body.querySelector('.fb-context').textContent:''
      };
    })()`, 20000));
    ok('B23 回答反馈打开弹窗', ansOpen && ansOpen.on === true, JSON.stringify(ansOpen));
    ok('B24 回答反馈默认研究结果类型', ansOpen && ansOpen.type === 'research_result', ansOpen && ansOpen.type);
    ok('B25 回答反馈关联当前问题', ansOpen && /M42 是什么/.test(ansOpen.ctx || ''));
    ok('B26 回答反馈关联消息 ID', ansOpen && /消息 ID/.test(ansOpen.ctx || '') && /m-/.test(ansOpen.ctx || ''));
    ok('B27 回答反馈关联任务 ID', ansOpen && /task-ui-ok/.test(ansOpen.ctx || ''));

    /* 必填校验 */
    var invalid = valueOf(await cdp.eval(`(function(){
      document.getElementById('fbType').value='';
      document.getElementById('fbType').dispatchEvent(new Event('change',{bubbles:true}));
      document.getElementById('fbTitle').value='';
      document.getElementById('fbTitle').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('fbDesc').value='';
      document.getElementById('fbDesc').dispatchEvent(new Event('input',{bubbles:true}));
      document.getElementById('fbGenerate').click();
      var t=document.getElementById('toast');
      return {toast:t?t.textContent:'',focus:document.activeElement?document.activeElement.id:''};
    })()`, 10000));
    ok('B28 必填项校验提示明确', invalid && /请选择反馈类型/.test(invalid.toast || ''), invalid && invalid.toast);
    ok('B29 校验后焦点落到缺失字段', invalid && invalid.focus === 'fbType', invalid && invalid.focus);

    /* 填写 + 诊断预览 + 生成确认页 */
    var filled = valueOf(await cdp.eval(`(function(){
      function setVal(id,v,evt){var n=document.getElementById(id);n.value=v;n.dispatchEvent(new Event(evt,{bubbles:true}));}
      setVal('fbType','bug','change');
      setVal('fbTitle','UI 测试反馈','input');
      setVal('fbDesc','回答数值与引用不一致。','input');
      setVal('fbSteps','打开 M42 问题，查看依据章节。','input');
      var diag=document.getElementById('fbDiag');
      diag.checked=true;diag.dispatchEvent(new Event('change',{bubbles:true}));
      var pre=document.querySelector('#fbDiagBox .fb-diag-pre');
      return {visible:!document.getElementById('fbDiagBox').hidden,
        diagText:pre?pre.textContent:'',
        hasKey:/sk-live-abcdef/i.test(pre?pre.textContent:'')};
    })()`, 10000));
    ok('B30 勾选后展示诊断预览', filled && filled.visible === true);
    ok('B31 诊断预览不含测试密钥', filled && filled.hasKey === false, filled && filled.diagText.slice(0, 80));
    ok('B32 诊断预览含步骤/事件', filled && /steps/.test(filled.diagText || '') && /events/.test(filled.diagText || ''));

    var confirmPage = valueOf(await cdp.eval(`(function(){
      document.getElementById('fbGenerate').click();
      var body=document.getElementById('feedbackBody');
      var subject=body.querySelector('.fb-readonly')?body.querySelector('.fb-readonly').textContent:'';
      return {open:document.getElementById('feedback').classList.contains('on'),
        subject:subject,
        hasOpenMail:!!document.getElementById('fbOpenMail'),
        hasCopy:!!document.getElementById('fbCopyConfirm'),
        hasDownload:!!document.getElementById('fbDownloadConfirm'),
        notice:/不会在未经确认的情况下自动发送/.test(body.textContent),
        recipient:/2185428966@qq.com/.test(body.textContent),
        status:(document.getElementById('fbStatus')||{}).textContent||'',
        href:location.href};
    })()`, 15000));
    ok('B33 生成进入确认页', confirmPage && confirmPage.hasOpenMail === true, JSON.stringify(confirmPage));
    ok('B34 邮件主题格式正确', confirmPage && /^\[ASTRUM Feedback\]\[Bug \/ 功能异常\] UI 测试反馈$/.test(confirmPage.subject || ''), confirmPage && confirmPage.subject);
    ok('B35 确认页显示正确收件人', confirmPage && confirmPage.recipient === true);
    ok('B36 明确提示不会自动发送', confirmPage && confirmPage.notice === true);
    ok('B37 确认前未触发邮件客户端', confirmPage && confirmPage.status === '' && confirmPage.href.indexOf('mailto:') < 0, confirmPage && confirmPage.status);
    ok('B38 提供复制与下载替代方式', confirmPage && confirmPage.hasCopy && confirmPage.hasDownload);

    var downloaded = valueOf(await cdp.eval(`(function(){
      document.getElementById('fbDownloadConfirm').click();
      var t=document.getElementById('toast');
      return t?t.textContent:'';
    })()`, 10000));
    ok('B39 诊断报告下载有明确反馈', /诊断报告已下载/.test(downloaded || ''), downloaded);
    await cdp.eval("document.getElementById('feedbackClose').click();true", 10000);

    /* 设置 → 帮助 → 问题反馈 */
    var help = valueOf(await cdp.eval(`(function(){
      window.__astrum.openSheet('settings');
      var tabs=document.querySelectorAll('#settingsBody .set-tabs button');
      var helpTab=Array.prototype.filter.call(tabs,function(b){return b.textContent==='帮助';})[0];
      if(!helpTab) return {error:'no help tab'};
      helpTab.click();
      var item=Array.prototype.filter.call(document.querySelectorAll('#settingsBody .sec-item'),function(b){return b.textContent.indexOf('问题反馈')>=0;})[0];
      if(!item) return {error:'no feedback section',text:document.getElementById('settingsBody').textContent};
      item.click();
      var entry=document.getElementById('feedbackEntry');
      return {entry:!!entry,
        mail:document.querySelector('#settingsBody .fb-mail')?document.querySelector('#settingsBody .fb-mail').textContent:'',
        text:document.getElementById('settingsBody').textContent};
    })()`, 15000));
    ok('B40 帮助页存在问题反馈入口', help && help.entry === true, JSON.stringify(help && { error: help.error, mail: help.mail }));
    ok('B41 帮助页显示正确邮箱', help && help.mail === '2185428966@qq.com', help && help.mail);
    ok('B42 帮助页说明文字完整', help && /研究结果不准确/.test(help.text || '') && /功能改进建议/.test(help.text || ''));

    var settingsOpen = valueOf(await cdp.eval(`(function(){
      document.getElementById('feedbackEntry').click();
      var body=document.getElementById('feedbackBody');
      return {on:document.getElementById('feedback').classList.contains('on'),
        type:document.getElementById('fbType').value,
        hasCtx:!!body.querySelector('.fb-context'),
        title:document.getElementById('fbTitle').value};
    })()`, 10000));
    ok('B43 设置入口打开反馈弹窗', settingsOpen && settingsOpen.on === true);
    ok('B44 通用反馈不强关联回答上下文', settingsOpen && settingsOpen.hasCtx === false);
    ok('B45 通用反馈默认类型为空', settingsOpen && settingsOpen.type === '', settingsOpen && settingsOpen.type);

    /* 窄屏 */
    await cdp.send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, 10000);
    await sleep(300);
    var narrow = valueOf(await cdp.eval(`(function(){
      var sheet=document.getElementById('feedback');
      var r=sheet.getBoundingClientRect();
      var input=document.getElementById('fbTitle').getBoundingClientRect();
      return {w:r.width,vw:window.innerWidth,docW:document.documentElement.scrollWidth,
        right:r.right,inputRight:input.right,overflow:document.documentElement.scrollWidth>window.innerWidth+1};
    })()`, 10000));
    ok('B46 窄屏弹窗不超出视口', narrow && narrow.overflow === false && narrow.right <= narrow.vw + 1, JSON.stringify(narrow));
    ok('B47 窄屏表单输入框不横向溢出', narrow && narrow.inputRight <= narrow.vw + 1, narrow && narrow.inputRight);
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, 10000);

    await cdp.eval("document.getElementById('feedbackClose').click();true", 10000);
    await sleep(200);
    var errs = valueOf(await cdp.eval('window.__fbErrs', 10000));
    var csp = valueOf(await cdp.eval('window.__fbCsp', 10000));
    ok('B48 无未捕获 JS 错误', !errs || errs.length === 0, errs && errs.join(' | '));
    ok('B49 无 CSP 违规', !csp || csp.length === 0, csp && csp.join(' | '));

    var failed = results.filter(function (r) { return !r.p; });
    results.forEach(function (r) {
      console.log((r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.p ? '' : ' | ' + r.x));
    });
    console.log('\nRESULT ' + (results.length - failed.length) + '/' + results.length);
    process.exitCode = failed.length ? 1 : 0;
  } catch (e) {
    console.error('FATAL', e && e.stack || e);
    process.exitCode = 1;
  } finally {
    try { if (cdp) await cdp.send('Browser.close', {}, 5000); } catch (e) {}
    try { child.kill(); } catch (e) {}
    try { srv.server.close(); } catch (e) {}
  }
})();
