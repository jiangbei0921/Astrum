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
  if (/\.pdf$/.test(p)) return 'application/pdf';
  return 'application/octet-stream';
}
/* 生成浏览器测试用 PDF（合法、可重复；不依赖外部样本）。 */
function pdfEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}
function pdfStream(body) {
  return '<< /Length ' + body.length + ' >>\nstream\n' + body + '\nendstream';
}
function pdfText(lines) {
  return 'BT /F1 10 Tf 50 720 Td\n' + lines.map(function (l, i) {
    return (i ? 'T*\n' : '') + '(' + pdfEscape(l) + ') Tj\n';
  }).join('') + 'ET';
}
function makeUiPdf() {
  var p1 = pdfText([
    'ASTRUM UI Fulltext Paper',
    'ABSTRACT',
    'We measure the distance to M42 with a calibrated parallax and a full error budget.',
    'The measured distance is 1344 light years with a standard error of 12 light years.'
  ]);
  var p2 = pdfText([
    '1. INTRODUCTION',
    'The Orion Nebula is the nearest massive star-forming region to the Sun.',
    '2. RESULTS',
    'The fulltext evidence keeps the section name, page number and chunk identifier.',
    'DOI: 10.1000/astrum.ui'
  ]);
  var objs = {
    1: '<</Type/Catalog/Pages 2 0 R>>',
    2: '<</Type/Pages/Kids[3 0 R 4 0 R]/Count 2>>',
    3: '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 6 0 R>>',
    4: '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</Font<</F1 5 0 R>>>>/Contents 7 0 R>>',
    5: '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>',
    6: pdfStream(p1),
    7: pdfStream(p2)
  };
  var out = '%PDF-1.4\n';
  for (var i = 1; i <= 7; i++) out += i + ' 0 obj\n' + objs[i] + '\nendobj\n';
  out += 'trailer\n<</Size 8>>\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
function makeScannedPdf() {
  var out = '%PDF-1.4\n' +
    '1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n' +
    '2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n' +
    '3 0 obj\n<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Resources<</XObject<</Im1 5 0 R>>>>/Contents 4 0 R>>\nendobj\n' +
    '4 0 obj\n' + pdfStream('q 50 500 200 200 re W n /Im1 Do Q') + '\nendobj\n' +
    '5 0 obj\n' + pdfStream('\xff\x00\x00', '<</Type/XObject/Subtype/Image/Width 1/Height 1/ColorSpace/DeviceRGB/BitsPerComponent 8>>') + '\nendobj\n' +
    'trailer\n<</Size 6>>\n%%EOF\n';
  return Buffer.from(out, 'latin1');
}
function serve() {
  return new Promise(function (resolve) {
    var uiPdf = makeUiPdf(), scannedPdf = makeScannedPdf();
    var s = http.createServer(function (req, res) {
      var rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '') || 'index.html';
      if (rel === 'fixtures/ui.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
        res.end(uiPdf);
        return;
      }
      if (rel === 'fixtures/scanned.pdf') {
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' });
        res.end(scannedPdf);
        return;
      }
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
        st.plan={id:'p_browser_'+i,template:'T-B',steps:[a,b]};
        st.mode='single';
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

    var att = await cdp.eval(`(async function(){
      var A=window.Attachments, out={};
      var t=new File(['\\ufeffM42 是猎户座大星云'], 'note.txt', {type:'text/plain'});
      var ti=await A.process(t);
      out.text={status:ti.status,kind:ti.kind,chars:ti.text.length,bom:ti.text.indexOf('\\ufeff')<0};
      var e=new File([''], 'empty.txt', {type:'text/plain'});
      var ei=await A.process(e);
      out.empty={status:ei.status,kind:ei.kind,note:ei.note};
      var bin=atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=');
      var u=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
      var p=new File([u], 'one.png', {type:'image/png'});
      var pi=await A.process(p);
      out.png={status:pi.status,kind:pi.kind,w:pi.width,h:pi.height,thumb:!!pi.thumb};
      var bad=new File(['x'], 'bad.exe', {type:'application/octet-stream'});
      var bi=await A.process(bad);
      out.bad={status:bi.status,kind:bi.kind,note:bi.note};
      out.prompt=A.forPrompt([ti]);
      return out;
    })()`, 60000);
    var av = att && att.result && att.result.value;
    ok('B8 UTF-8 BOM 文本可读', av && av.text && av.text.status === 'ready' && av.text.chars > 0 && av.text.bom === true,
      av && JSON.stringify(av.text));
    ok('B9 空文本明确失败', av && av.empty && av.empty.status === 'error', av && JSON.stringify(av.empty));
    ok('B10 PNG 图片生成预览', av && av.png && av.png.status === 'ready' && av.png.w === 1 && av.png.thumb === true,
      av && JSON.stringify(av.png));
    ok('B11 不支持类型明确标注', av && av.bad && av.bad.status === 'unparsed', av && JSON.stringify(av.bad));
    ok('B12 文本进入任务上下文', av && av.prompt && av.prompt.length === 1 && av.prompt[0].excerpt.indexOf('M42') >= 0,
      av && JSON.stringify(av.prompt));

    var more = await cdp.eval(`(async function(){
      var A=window.Attachments, out={};
      var c=document.createElement('canvas');c.width=2;c.height=2;
      var ctx=c.getContext('2d');ctx.fillStyle='#3366cc';ctx.fillRect(0,0,2,2);
      function blob(type){return new Promise(function(r){c.toBlob(r,type,0.85);});}
      var jb=await blob('image/jpeg'); var jf=new File([jb],'two.jpg',{type:'image/jpeg'}); var jp=await A.process(jf);
      out.jpg={status:jp.status,kind:jp.kind,w:jp.width,h:jp.height,thumb:!!jp.thumb};
      var wb=await blob('image/webp'); var wf=new File([wb],'two.webp',{type:'image/webp'}); var wp=await A.process(wf);
      out.webp={status:wp.status,kind:wp.kind,w:wp.width,h:wp.height,thumb:!!wp.thumb};
      var big=new File([new Uint8Array(7*1024*1024)],'big.png',{type:'image/png'}); var bp=await A.process(big);
      out.big={status:bp.status,kind:bp.kind,note:bp.note};
      var mis=new File(['<script>window.__x=1</script>'],'look.txt',{type:'image/png'}); var mp=await A.process(mis);
      out.mismatch={status:mp.status,kind:mp.kind,text:mp.text,note:mp.note};
      var revMis=new File(['fake png'],'fake.png',{type:'text/plain'}); var rp=await A.process(revMis);
      out.reverse={status:rp.status,kind:rp.kind,text:rp.text,note:rp.note};
      var raw=new Uint8Array(64); for(var z=0;z<64;z++)raw[z]=z%4;
      var bt=new File([raw],'binary.txt',{type:'text/plain'}); var btp=await A.process(bt);
      out.binText={status:btp.status,text:btp.text.length,note:btp.note};
      var emptyTxt=new File([''],'empty.txt',{type:'text/plain'});
      var goodTxt=new File(['可用参考'],'ok.txt',{type:'text/plain'});
      var badImg=new File(['not an image'],'bad.png',{type:'image/png'});
      var multi=await Promise.all([emptyTxt,goodTxt,badImg].map(function(f){return A.process(f);}));
      out.multi={statuses:multi.map(function(x){return x.status;}),kinds:multi.map(function(x){return x.kind;}),
        goodText:multi[1].text, badText:multi[2].text};
      out.images=A.imagesForPrompt([jp,jf,wp]).length;
      out.multiPrompt=A.forPrompt([new File(['参考文本'],'ref.txt',{type:'text/plain'})]).length;
      return out;
    })()`, 90000);
    var mv = more && more.result && more.result.value;
    ok('B13 JPG 图片可预览', mv && mv.jpg && mv.jpg.status === 'ready' && mv.jpg.thumb === true, mv && JSON.stringify(mv.jpg));
    ok('B14 WebP 图片可预览', mv && mv.webp && mv.webp.status === 'ready' && mv.webp.thumb === true, mv && JSON.stringify(mv.webp));
    ok('B15 超大图片明确 too-large', mv && mv.big && mv.big.status === 'too-large', mv && JSON.stringify(mv.big));
    ok('B16 MIME/扩展名冲突拒绝解析', mv && mv.mismatch && mv.mismatch.kind === 'mismatch' &&
      mv.mismatch.status === 'unparsed' && mv.mismatch.text === '' &&
      /不一致/.test(mv.mismatch.note || ''), mv && JSON.stringify(mv.mismatch));
    ok('B17 多图片进入视觉上下文', mv && mv.images >= 2, mv && mv.images);
    ok('B17a 反向 MIME 冲突同样拒绝', mv && mv.reverse && mv.reverse.kind === 'mismatch' &&
      mv.reverse.status === 'unparsed' && mv.reverse.text === '', mv && JSON.stringify(mv.reverse));
    ok('B17b 二进制伪装文本明确失败', mv && mv.binText && mv.binText.status === 'error' &&
      mv.binText.text === 0 && /编码异常|二进制/.test(mv.binText.note || ''), mv && JSON.stringify(mv.binText));
    ok('B17c 单附件失败不影响其它附件', mv && mv.multi && mv.multi.statuses[0] === 'error' &&
      mv.multi.statuses[1] === 'ready' && mv.multi.statuses[2] === 'error' &&
      mv.multi.goodText.indexOf('可用参考') >= 0 && mv.multi.badText === '',
      mv && JSON.stringify(mv.multi));

    var ui = await cdp.eval(`(function(){
      var E=window.AstroEvidence, C=window.AstroClaims, R=window.AstroReducer, Rep=window.AstroReport, FT=window.AstroPaperFulltext;
      var result;
      if(!E||!C||!R||!Rep||!FT) return {error:'modules missing'};
      var meta=E.fromSourceItem({title:'M42 研究',excerpt:'M42 is a star-forming region at 1344 ly.',url:'https://simbad.harvard.edu/',host:'simbad.harvard.edu',sourceType:'database',version:'2026'},{tool:'simbad.tap',query:'M42',retrievedAt:'2026-11-02T00:00:00Z'});
      var evs=[meta];
      var parse={ok:true,title:'M42 Paper',pageCount:4,sections:[{name:'RESULTS',pageStart:2,pageEnd:2}],chunks:[{content:'The measured distance is 1344 light years with calibrated parallax.',pageStart:2,pageEnd:2}],textLength:100,extractionMethod:'pdf-text-v1',warnings:[]};
      var chunks=FT.buildChunks(parse,{title:'M42 Paper',content:{doi:'10.1000/m42'},url:'https://arxiv.org/pdf/2401.00001'},{});
      var full=FT.buildEvidence({title:'M42 Paper',content:{doi:'10.1000/m42'},url:'https://arxiv.org/pdf/2401.00001'},parse,chunks,{});
      evs=evs.concat(full);
      var claims=C.buildClaimsFromEvidence(evs,{});
      var judged=C.judgeAll(claims,{evidence:evs});
      var reduced=R.reduce({evidence:evs,claims:judged.claims});
      var report=Rep.build({question:'研究 M42',evidence:evs,claims:judged.claims,verdicts:judged.verdicts,reducer:reduced,retrievedAt:'2026-11-02T00:00:00Z'});
      var el=window.AstroResearchUI.render(report);
      document.body.appendChild(el);
      result={text:el.textContent,rows:el.querySelectorAll('.row-item').length,conclusions:report.conclusions.length,
        chunksCount:report.conclusions.filter(function(c){return c.supportGranularity==='fulltext_chunk';}).length,
        scope:(report.conclusions.filter(function(c){return c.supportGranularity==='fulltext_chunk';})[0]||{}).evidenceScope,
        granularity:(report.conclusions.filter(function(c){return c.supportGranularity==='fulltext_chunk';})[0]||{}).supportGranularity,
        paper:report.papers[0]&&{title:report.papers[0].title,fulltext:report.papers[0].fulltextAvailable,section:(report.papers[0].sections||[])[0],page:report.papers[0].pageStart}};
      el.remove(); return result;
    })()`, 30000);
    var uv = ui && ui.result && ui.result.value;
    ok('B18 Research UI 渲染真实报告', uv && !uv.error && uv.rows >= 3, uv && (uv.error || ('rows=' + uv.rows)));
    ok('B19 Research UI 显示结论/论文/证据', uv && /核心研究结论/.test(uv.text) && /相关论文/.test(uv.text) && /证据验证/.test(uv.text), uv && uv.text.slice(0,120));
    ok('B20 论文全文/章节/页码展示', uv && uv.paper && uv.paper.fulltext === true && uv.paper.section === 'RESULTS' && uv.paper.page === 2,
      uv && JSON.stringify(uv.paper));
    ok('B21 Claim 保留 chunk 粒度', uv && uv.chunksCount >= 1 && uv.granularity === 'fulltext_chunk' && uv.scope === 'fulltext',
      uv && (uv.granularity + '/' + uv.scope + ' n=' + uv.chunksCount));

    var partial = await cdp.eval(`(function(){
      var UI=window.AstroResearchUI; if(!UI) return {error:'ui missing'};
      var long='这是一段用于验证长结论截断的文本，不包含任何外部指令。'.repeat(30);
      var rep={question:'空证据报告',conclusions:[{text:long,level:'unknown',evidenceRefs:[]}],
        papers:[],parameters:[],observations:[],evidence:[],conflicts:[],
        gaps:['未获取论文全文','外部搜索超时'],limitations:['仅有摘要级证据'],
        uncertainties:[],disclaimer:'合成 UI 测试'};
      var el=UI.render(rep); document.body.appendChild(el);
      var n=el.querySelector('.row-item .n');
      var boundary=el.querySelector('.boundary');
      var out={rows:el.querySelectorAll('.row-item').length,
        boundary:boundary?boundary.textContent:'',
        firstLen:n?n.textContent.length:0,
        hasDisclaimer:el.textContent.indexOf('合成 UI 测试')>=0};
      el.remove(); return out;
    })()`, 30000);
    var pv = partial && partial.result && partial.result.value;
    ok('B22 空/长文本报告显示局限', pv && !pv.error && pv.rows >= 1 &&
      /未获取/.test(pv.boundary) && /仅有摘要级证据/.test(pv.boundary) &&
      pv.firstLen <= 190 && pv.hasDisclaimer === true,
      pv && (pv.error || ('rows=' + pv.rows + ' len=' + pv.firstLen + ' boundary=' + pv.boundary.slice(0, 60))));

    var ftUi = await cdp.eval(`(async function(){
      var FT=window.AstroPaperFulltext,E=window.AstroEvidence,C=window.AstroClaims,
        R=window.AstroReducer,Rep=window.AstroReport,UI=window.AstroResearchUI;
      if(!FT||!E||!C||!R||!Rep||!UI) return {error:'modules missing'};
      FT.clearCache(); FT.clearMemory();
      var paper={title:'UI Fulltext Paper',content:{doi:'10.1000/astrum.ui',
        pdfUrl:location.origin+'/fixtures/ui.pdf'},url:location.origin+'/fixtures/ui.pdf'};
      var r=await FT.get(paper,{timeoutMs:15000,maxBytes:5*1024*1024,maxEvidenceChunks:4});
      if(!r.ok) return {error:r.code||r.reason};
      var evs=r.evidence||[];
      var claims=C.buildClaimsFromEvidence(evs,{});
      var judged=C.judgeAll(claims,{evidence:evs});
      var reduced=R.reduce({evidence:evs,claims:judged.claims});
      var report=Rep.build({question:'UI 全文',evidence:evs,claims:judged.claims,
        verdicts:judged.verdicts,reducer:reduced,retrievedAt:'2026-11-02T00:00:00Z'});
      var el=UI.render(report); document.body.appendChild(el);
      var p=report.papers[0]||{};
      var out={ok:true,pageCount:r.pageCount,sections:(r.sections||[]).map(function(s){return s.name;}),
        chunks:r.chunks.length,text:el.textContent,evidence:evs.length,
        conclusions:report.conclusions.length,
        granularity:(report.conclusions.filter(function(c){return c.supportGranularity==='fulltext_chunk';})[0]||{}).supportGranularity,
        paper:{title:p.title,pageCount:p.pageCount,fulltext:p.fulltextAvailable,sections:p.sections||[]},
        cache:FT.cacheStats()};
      el.remove(); return out;
    })()`, 45000);
    var fv = ftUi && ftUi.result && ftUi.result.value;
    ok('B23 真实 PDF 字节经 HTTP 解析', fv && fv.ok && fv.pageCount === 2 && fv.chunks >= 2,
      fv && (fv.error || ('pages=' + fv.pageCount + ' chunks=' + fv.chunks)));
    ok('B24 全文 UI 显示论文页码/章节', fv && fv.ok && fv.text.indexOf('相关论文') >= 0 &&
      fv.text.indexOf('全文') >= 0 && fv.text.indexOf('2页') >= 0 &&
      fv.text.indexOf('INTRODUCTION') >= 0 && fv.text.indexOf('RESULTS') >= 0,
      fv && (fv.error || fv.text.slice(0, 120)));
    ok('B25 全文 UI 保留证据与 chunk 粒度', fv && fv.ok && fv.evidence >= 1 &&
      fv.text.indexOf('证据验证') >= 0 && fv.granularity === 'fulltext_chunk',
      fv && (fv.granularity + ' evidence=' + fv.evidence + ' conclusions=' + fv.conclusions));

    var scanUi = await cdp.eval(`(async function(){
      var FT=window.AstroPaperFulltext; if(!FT) return {error:'missing'};
      FT.clearCache(); FT.clearMemory();
      var paper={title:'Scanned Paper',content:{pdfUrl:location.origin+'/fixtures/scanned.pdf'},
        url:location.origin+'/fixtures/scanned.pdf'};
      var r=await FT.get(paper,{timeoutMs:15000,maxBytes:5*1024*1024});
      return {ok:r.ok,code:r.code,reason:r.reason,evidence:(r.evidence||[]).length,
        chunks:(r.chunks||[]).length,warnings:r.warnings||[]};
    })()`, 30000);
    var sv = scanUi && scanUi.result && scanUi.result.value;
    ok('B26 扫描件失败不伪造全文证据', sv && sv.ok === false && sv.code === 'pdf_no_text' &&
      sv.evidence === 0 && sv.chunks === 0, sv && (sv.code || 'ok'));

    var seedFail = await cdp.eval(`(async function(){
      var store=window.AstroTaskStore.create({}); await store.init();
      var T=window.AstroTask;
      var st=T.create({question:'失败步骤 UI',level:'L2'});
      st.phase='EXECUTE';
      var a=T.makeStep({id:'f1',tool:'fits.parse',args:{},deps:[],parallel:false,critical:false,optional:false});
      var b=T.makeStep({id:'f2',tool:'compose.simple',args:{query:'失败步骤 UI',from:[]},deps:[],parallel:false,critical:false,optional:false});
      st.steps=[a,b];
      st.plan={id:'p_fail',template:'T-B',steps:[a,b]};
      st.mode='single';
      await store.save(st);
      return 'seeded';
    })()`, 30000);
    ok('B27 失败任务种入', seedFail && seedFail.result && seedFail.result.value === 'seeded');
    await cdp.eval('location.reload()', 20000);
    await sleep(1500);
    var clickedFail = null;
    for (var cr = 0; cr < 40; cr++) {
      var cRes = await cdp.eval(`(function(){
        var rows=Array.prototype.slice.call(document.querySelectorAll('.resume-row'));
        var t=rows.filter(function(r){
          var q=r.querySelector('.resume-q');
          return q && q.textContent.indexOf('失败步骤 UI')>=0;
        })[0];
        if(!t) return {clicked:false,n:rows.length};
        t.querySelector('button').click();
        return {clicked:true,n:rows.length};
      })()`, 10000);
      clickedFail = cRes && cRes.result ? cRes.result.value : null;
      if (clickedFail && clickedFail.clicked) break;
      await sleep(300);
    }
    var cf = clickedFail;
    ok('B28 可单独恢复失败任务', cf && cf.clicked === true, cf && JSON.stringify(cf));
    var failUi = null;
    for (var fr = 0; fr < 60; fr++) {
      var fu = await cdp.eval(`(function(){
        var row=document.querySelector('.step-row.st-failed');
        var failed=document.querySelectorAll('.step-row.st-failed').length;
        var err=(row&&row.querySelector('.step-err')||{}).textContent||'';
        var state=(row&&row.querySelector('.step-state')||{}).textContent||'';
        var sum=(document.querySelector('.step-summary')||{}).textContent||'';
        return {failed:failed,err:err,state:state,sum:sum};
      })()`, 10000);
      failUi = fu && fu.result ? fu.result.value : null;
      if (failUi && failUi.failed >= 1) break;
      await sleep(300);
    }
    ok('B29 失败步骤显示状态与错误原因', failUi && failUi.failed >= 1 &&
      failUi.err.length > 0 && failUi.state === '失败',
      failUi && JSON.stringify(failUi));

    await cdp.send('Emulation.setDeviceMetricsOverride',
      { width: 375, height: 812, deviceScaleFactor: 1, mobile: true }, 10000);
    await sleep(400);
    var narrow = await cdp.eval(`(function(){
      var b=document.body, de=document.documentElement;
      return {w:window.innerWidth, sw:Math.max(b.scrollWidth,de.scrollWidth),
        overflow:Math.max(b.scrollWidth,de.scrollWidth)-window.innerWidth};
    })()`, 10000);
    var nv = narrow && narrow.result && narrow.result.value;
    ok('B30 窄屏无横向溢出', nv && nv.w === 375 && nv.overflow <= 1, nv && JSON.stringify(nv));
    await cdp.send('Emulation.clearDeviceMetricsOverride', {}, 10000);
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
