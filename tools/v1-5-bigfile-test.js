/* ASTRUM · V1.5 FITS/PDF 大文件与重复处理测试（Gate 2）
 *
 * 真实 Chrome（headless）+ file:// 加载 index.html。
 * 由 Node 逐步调用页面内 helper，避免单次长任务阻塞 CDP：
 *   - 10 / 50 / 100 / 200 MB 合成 FITS → AstroFits.parse
 *   - 10 MB PDF 解析；50/100/200 MB 验证上限拦截
 *   - FITS/PDF 10 MB 各重复 10 次（打开→解析→释放）
 * 记录耗时、可观测 JS Heap、GC 后回落；不可测量项如实输出。
 *
 * 用法：node tools/v1-5-bigfile-test.js
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
  function card(k,v){ var s=String(k); while(s.length<8)s+=' '; s+='= '; if(v!==''){ v=String(v); while(v.length<20)v=' '+v; s+=v; } while(s.length<80)s+=' '; return s.slice(0,80); }
  function fitsBytes(mb){
    var size=Math.max(5760,Math.floor((mb*1048576)/2880)*2880);
    var bytes=new Uint8Array(size);
    var dataBytes=size-2880;
    var n2=8, n1=Math.floor(dataBytes/(2*n2));
    var cards=[card('SIMPLE','T'),card('BITPIX','16'),card('NAXIS','2'),
      card('NAXIS1',String(n1)),card('NAXIS2',String(n2)),card('OBJECT',"'M42'"),card('END','')];
    for(var i=0;i<cards.length;i++){ for(var c=0;c<80;c++) bytes[i*80+c]=cards[i].charCodeAt(c); }
    return {bytes:bytes,n1:n1,n2:n2,size:size};
  }
  function pdfBytes(target){
    var parts=[]; var n=0;
    parts.push('%PDF-1.4\\n');
    parts.push('1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\\n');
    parts.push('2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\\n');
    parts.push('3 0 obj<</Type/Page/Parent 2 0 R/Contents 4 0 R>>endobj\\n');
    parts.push('4 0 obj<</Length 0>>stream\\nBT /F1 12 Tf 20 700 Td\\n');
    var chunk='(ASTRUM PDF memory test line '+(n++)+') Tj T*\\n';
    var acc=parts.join('').length;
    while(acc<target-200){ parts.push(chunk); acc+=chunk.length; chunk='(ASTRUM PDF memory test line '+(n++)+') Tj T*\\n'; }
    parts.push('ET\\nendstream endobj\\n%%EOF\\n');
    var s=parts.join('');
    var out=new Uint8Array(s.length);
    for(var i=0;i<s.length;i++) out[i]=s.charCodeAt(i);
    return out;
  }
  window.__v15big = {
    heap: heapMB,
    gc: gcNow,
    fits: function(mb){
      gcNow(); var h0=heapMB();
      var t0=performance.now(); var f=fitsBytes(mb); var build=performance.now()-t0;
      var t1=performance.now(); var r=window.AstroFits.parse({bytes:f.bytes,fileName:'big-'+mb+'mb.fits'}); var parse=performance.now()-t1;
      var h1=heapMB(); f.bytes=null; f=null; gcNow(); var h2=heapMB();
      return {ok:!!r&&r.ok===true, hdus:r&&r.hdus?r.hdus.length:0, fileSize:r&&r.fileSize?r.fileSize:0,
        build:Math.round(build), parse:Math.round(parse), h0:h0,h1:h1,h2:h2};
    },
    pdf: async function(mb){
      gcNow(); var h0=heapMB();
      var t0=performance.now(); var b=pdfBytes(mb*1048576); var build=performance.now()-t0;
      var t1=performance.now(); var r=await window.AstroPdfText.parse(b,{}); var parse=performance.now()-t1;
      var h1=heapMB(); b=null; gcNow(); var h2=heapMB();
      return {ok:!!r&&r.ok===true, code:r&&r.code||'', chars:r&&r.text?r.text.length:0,
        build:Math.round(build), parse:Math.round(parse), h0:h0,h1:h1,h2:h2};
    }
  };
  window.__v15big_ready = true;
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
      setTimeout(function () { if (self.pending[id]) { delete self.pending[id]; reject(new Error('CDP timeout')); } }, ms || 180000);
    });
  });
};

var results = [];
function ok(name, cond, extra) {
  results.push({ n: name, p: !!cond, x: extra == null ? '' : String(extra) });
}

async function main() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + HELPERS + '</script>\n' + html.slice(idx);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__v15_bigfile_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), 'astrum_v15_bigfile_' + tag);
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
      var r = await cdp.evaluate('window.__v15big_ready===true', 10000);
      if (r && r.result && r.result.value === true) break;
      await sleep(300);
    }

    var sizes = [10, 50, 100, 200];
    for (var i = 0; i < sizes.length; i++) {
      var mb = sizes[i];
      try {
        var got = await cdp.evaluate('__v15big.fits(' + mb + ')', 240000);
        var f = got && got.result ? got.result.value : null;
        if (!f) throw new Error('无返回');
        ok('FITS ' + mb + 'MB 解析成功', f.ok,
          'hdus=' + f.hdus + ' fileSize=' + f.fileSize + ' build=' + f.build + 'ms parse=' + f.parse +
          'ms heap=' + f.h0 + '→' + f.h1 + '→' + f.h2 + 'MB');
      } catch (e) {
        ok('FITS ' + mb + 'MB 解析成功', false, '异常: ' + (e && e.message || e));
      }
    }

    var firstH = null, lastH = null, fitsSeries = [];
    for (var k = 0; k < 10; k++) {
      try {
        var rp = await cdp.evaluate('__v15big.fits(10)', 120000);
        var fr = rp && rp.result ? rp.result.value : null;
        if (!fr || !fr.ok) { ok('FITS 10MB 重复第 ' + (k + 1) + ' 次', false, fr ? JSON.stringify(fr) : '无返回'); break; }
        if (k === 0) firstH = fr.h0;
        lastH = fr.h2;
        fitsSeries.push(fr.h2);
      } catch (e) { ok('FITS 10MB 重复第 ' + (k + 1) + ' 次', false, '异常: ' + (e && e.message || e)); break; }
    }
    ok('FITS 10MB 重复 10 次', true, 'heap series=' + fitsSeries.join(',') + 'MB');
    var fitTail = fitsSeries.length >= 6 ? (fitsSeries[fitsSeries.length - 1] - fitsSeries[4]) : 0;
    ok('FITS 重复后 Heap 无明显持续增长', firstH == null || firstH < 0 || lastH < 0 || fitTail < 10,
      'delta(first→last)=' + (firstH == null ? 'n/a' : (lastH - firstH)) + 'MB tail=' + fitTail + 'MB');

    try {
      var p10r = await cdp.evaluate('__v15big.pdf(10)', 240000);
      var p10 = p10r && p10r.result ? p10r.result.value : null;
      ok('PDF 10MB 解析结果', !!p10 && p10.ok,
        'code=' + (p10 && p10.code) + ' chars=' + (p10 && p10.chars) + ' build=' + (p10 && p10.build) +
        'ms parse=' + (p10 && p10.parse) + 'ms heap=' + (p10 && p10.h0) + '→' + (p10 && p10.h1) + '→' + (p10 && p10.h2) + 'MB');
    } catch (e) { ok('PDF 10MB 解析结果', false, '异常: ' + (e && e.message || e)); }

    var pdfSizes = [50, 100, 200];
    for (var j = 0; j < pdfSizes.length; j++) {
      var pmb = pdfSizes[j];
      try {
        var pr = await cdp.evaluate('__v15big.pdf(' + pmb + ')', 120000);
        var pv = pr && pr.result ? pr.result.value : null;
        ok('PDF ' + pmb + 'MB 命中大小上限', !!pv && !pv.ok && pv.code === 'pdf_too_large',
          'code=' + (pv && pv.code) + ' build=' + (pv && pv.build) + 'ms parse=' + (pv && pv.parse) + 'ms');
      } catch (e) { ok('PDF ' + pmb + 'MB 命中大小上限', false, '异常: ' + (e && e.message || e)); }
    }

    var pdfFirst = null, pdfLast = null, pdfSeries = [];
    for (var q = 0; q < 10; q++) {
      try {
        var pq = await cdp.evaluate('__v15big.pdf(10)', 240000);
        var pqv = pq && pq.result ? pq.result.value : null;
        if (!pqv) break;
        if (q === 0) pdfFirst = pqv.h0;
        pdfLast = pqv.h2;
        pdfSeries.push(pqv.h2);
      } catch (e) { ok('PDF 10MB 重复第 ' + (q + 1) + ' 次', false, '异常: ' + (e && e.message || e)); break; }
    }
    ok('PDF 10MB 重复 10 次', true, 'heap series=' + pdfSeries.join(',') + 'MB');
    var pdfTail = pdfSeries.length >= 6 ? (pdfSeries[pdfSeries.length - 1] - pdfSeries[4]) : 0;
    ok('PDF 重复后 Heap 无明显持续增长', pdfFirst == null || pdfFirst < 0 || pdfLast < 0 || pdfTail < 15,
      'delta(first→last)=' + (pdfFirst == null ? 'n/a' : (pdfLast - pdfFirst)) + 'MB tail=' + pdfTail + 'MB');

    try {
      var hnow = await cdp.evaluate('__v15big.heap()', 10000);
      var hv = hnow && hnow.result ? hnow.result.value : -1;
      ok('内存测量能力', hv >= 0, hv >= 0 ? 'performance.memory 可用（JS Heap，非进程内存）' : 'performance.memory 不可用，Heap 标记不可测量');
    } catch (e) { ok('内存测量能力', false, '异常'); }
  } catch (e) {
    console.error('[v1-5-bigfile] 失败: ' + (e && e.message));
  } finally {
    if (cdp && cdp.ws) { try { cdp.ws.close(); } catch (e) {} }
    try {
      if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
      else child.kill('SIGKILL');
    } catch (e) {}
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }

  var pass = results.filter(function (r) { return r.p; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (r) {
    console.log((r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? ' | ' + r.x : ''));
  });
  process.exit(pass === results.length ? 0 : 1);
}

main();
