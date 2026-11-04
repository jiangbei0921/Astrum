/* ASTRUM · V1.13 真实浏览器流式交付测试
 *
 * 真实 Chrome + 本地 HTTP；只替换模型流式回调与 Control 返回，不替换 DOM/渲染/Thread。
 * 覆盖：
 *   - 简单问题不启动 Research.run，首屏直接增量输出
 *   - 复杂问题研究完成后只流式输出 Muse 最终答案
 *   - 最终正文与流式内容一致，不被模板段替换
 *   - 科研依据折叠包含论文/核验状态，正文不混入
 *   - 停止生成保留部分内容，不写成系统故障
 *   - Markdown/公式/[E#] 不被破坏，无内部 Agent/工具日志
 *
 * 用法：node tools/v1-13-stream-browser-test.js
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

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v113stream_' + Date.now());
  fs.mkdirSync(profile);
  var child = cp.spawn(findChrome(), ['--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', 'http://127.0.0.1:' + srv.port + '/index.html'],
    { stdio: ['ignore', 'ignore', 'ignore'] });
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    var page = await findPage(port);
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    for (var i = 0; i < 100; i++) {
      var ready = await cdp.eval('!!(window.__astrum && window.AstroControlBridge && window.Sources && window.Thread)', 10000);
      if (ready && ready.result && ready.result.value === true) break;
      await sleep(250);
    }

    var setup = await cdp.eval(`(async function(){
      try { if (window.Thread && window.Thread.clearAll) await window.Thread.clearAll(); } catch(e) {}
      window.__astrum.newChat();
      window.Sources.setConfig('openai', {
        key: 'browser-test-key', endpoint: 'https://offline.local/v1/chat/completions',
        model: 'browser-test-model', enabled: true, temperature: 0.2, maxTokens: 400
      });
      window.__astrum.selectSource('openai');
      window.__researchCalls = 0;
      window.Research.run = function (q, opts) {
        window.__researchCalls++;
        return Promise.resolve({
          question: q, intent: (opts && opts.intent) || 'unknown',
          plan: { skip: true, subs: [] }, rounds: [], budget: {},
          stopReason: 'skip', evidence: [], conflicts: [], citations: null,
          terms: {}, ms: 0
        });
      };
      window.__streamCalls = 0;
      window.AstroControlBridge.modelStream = function (id, payload, handlers, opts) {
        window.__streamCalls++;
        window.__lastPayload = payload;
        var toks = payload && payload.synthesis
          ? ['复杂问题的核心结论：暗能量的演化仍无定论。',
            '\\n\\n部分观测给出 $w(z)$ 的演化迹象，但不同数据集之间存在张力 [E1]。',
            '\\n\\n不同测量值 0.75 与 0.83 必须保留，不能取平均。']
          : ['仙女座星系（M31）距离地球约 250 万光年。',
            '\\n\\n这是目前较常用的距离值。'];
        return new Promise(function (resolve) {
          var t0 = Date.now(), first = null, k = 0;
          function tick() {
            if (opts && opts.signal && opts.signal.aborted) {
              resolve({ ok: false, code: 'cancelled', text: toks.slice(0, k).join(''),
                aborted: true, completed: false, ttft: first || 0, latency: Date.now() - t0,
                stream: true, fallback: false, usage: { prompt: 5, completion: k * 3, total: 5 + k * 3 } });
              return;
            }
            if (k >= toks.length) {
              resolve({ ok: true, code: 'ok', text: toks.join(''), raw: toks.join(''),
                stream: true, fallback: false, completed: true, aborted: false,
                ttft: first || 0, latency: Date.now() - t0, tokens: 24,
                usage: { prompt: 8, completion: 16, total: 24 } });
              return;
            }
            if (first == null) first = Date.now() - t0;
            handlers.onToken(toks[k++]);
            setTimeout(tick, 220);
          }
          setTimeout(tick, 80);
        });
      };
      return 'ready';
    })()`, 20000);
    ok('B1 流式环境就绪', setup && setup.result && setup.result.value === 'ready');

    /* ---------- 简单问题：不检索，直接流式 ---------- */
    var ask1 = await cdp.eval("window.__astrum.ask('M31 距离地球多远？'); 'asked'", 10000);
    ok('B2 简单问题提问入口可用', ask1 && ask1.result && ask1.result.value === 'asked');
    var firstSnap = '', snapshots = 0, lastSnap = '', firstBeforeDone = false;
    var t0 = Date.now();
    while (Date.now() - t0 < 15000) {
      var st = await cdp.eval(`(function(){
        var b=document.querySelector('.stream-msg .stream-body');
        var card=document.querySelectorAll('.msg.bot .answer');
        return { body: b?b.textContent:'', streaming: !!b, answers: card.length };
      })()`, 10000);
      var v = st && st.result && st.result.value;
      if (v && v.body) {
        if (!firstSnap) { firstSnap = v.body; firstBeforeDone = !!v.streaming; }
        if (v.body !== lastSnap) { snapshots++; lastSnap = v.body; }
      }
      if (v && !v.streaming && v.answers >= 1) break;
      await sleep(80);
    }
    ok('B3 首段在完成前出现', !!firstSnap && firstBeforeDone, firstSnap.slice(0, 30));
    ok('B4 内容逐步增长', snapshots >= 2, 'snapshots=' + snapshots);
    var simple = await cdp.eval(`(function(){
      var msgs=document.querySelectorAll('.msg.bot');
      var last=msgs[msgs.length-1];
      var ana=last?last.querySelector('.analysis-body'):null;
      var ans=last?last.querySelector('.answer'):null;
      var basis=ans?ans.querySelector('.answer-basis'):null;
      var main=ans?ans.querySelector('.answer-main'):null;
      return {
        analysis: ana?ana.textContent:'',
        text: ans?ans.textContent:'',
        mainText: main?main.textContent:'',
        secObserve: ans?ans.querySelectorAll('.sec-observe').length:-1,
        secFollowup: ans?ans.querySelectorAll('.sec-followup,.followup').length:-1,
        streamLeft: document.querySelectorAll('.stream-msg').length,
        question: !!(ans&&ans.querySelector('.answer-question')),
        basis: !!basis, basisOpen: !!(basis&&basis.open),
        researchCalls: window.__researchCalls||0
      };
    })()`, 10000);
    var sv = simple && simple.result && simple.result.value;
    ok('B5 简单问题不启动 Research.run', sv && sv.researchCalls === 0, sv && sv.researchCalls);
    ok('B6 临时流式卡完成前保留后移除', sv && sv.streamLeft === 0);
    ok('B7 最终正文包含流式答案', sv && /250 万光年/.test(sv.analysis), sv && sv.analysis.slice(0, 60));
    ok('B8 简单答案无模板重复', sv && !/本轮共获得|与此相关|核心结论：/.test(sv.analysis), sv && sv.analysis.slice(0, 100));
    ok('B9 简单问题不生成观测/追问栏目', sv && sv.secObserve === 0 && sv.secFollowup === 0 &&
      !/观测延伸|观测建议|继续追问/.test(sv.mainText || ''),
      JSON.stringify({ o: sv && sv.secObserve, f: sv && sv.secFollowup, m: sv && sv.mainText.slice(0, 40) }));
    ok('B10 问题标题保留', sv && sv.question === true);
    ok('B11 首屏无内部执行日志', sv && !/(Agent|智能体|工具调用|检索词|执行步骤)/.test(sv.analysis));

    /* ---------- 复杂问题：研究完成后只流式最终答案 ---------- */
    var complexSetup = await cdp.eval(`(function(){
      var answer = {
        query: '暗能量是否可能随时间演化？', intent: 'unknown', targets: [],
        trace: [], sections: [
          { kind: 'verdict', head: '暗能量是否随时间演化，目前尚无定论。' },
          { kind: 'evidence', title: '依据', items: [
            { label: 'DESI DR2', value: '给出与 w(z) 演化相关的测量差异' }
          ] }
        ],
        research: {
          reportId: 'rep_v113', question: '暗能量是否可能随时间演化？',
          papers: [
            { title: 'DESI DR2 Results II', authors: ['DESI Collaboration'], date: '2025-03-01',
              doi: '10.1103/physrevd.111.023532', arxivId: '2503.14738', url: 'https://arxiv.org/abs/2503.14738',
              abstractOnly: true, excerpt: 'We find preferences for evolving dark energy.', evidenceIds: ['ev_desi'] },
            { title: 'A Joint Analysis of Dark Energy', authors: ['A. Author'], date: '2024-06-01',
              doi: '10.1103/physrevd.109.123456', arxivId: '2406.00001', url: 'https://arxiv.org/abs/2406.00001',
              abstractOnly: true, excerpt: 'The data are consistent with a cosmological constant.', evidenceIds: ['ev_joint'] }
          ],
          evidence: [
            { evidenceId: 'ev_desi', sourceType: 'paper', title: 'DESI DR2 Results II',
              uri: 'https://arxiv.org/abs/2503.14738', publishedAt: '2025-03-01', abstractOnly: true,
              verification: { state: 'verified', basis: 'arXiv 链接与标识一致' } },
            { evidenceId: 'ev_joint', sourceType: 'paper', title: 'A Joint Analysis of Dark Energy',
              uri: 'https://arxiv.org/abs/2406.00001', publishedAt: '2024-06-01', abstractOnly: true,
              verification: { state: 'partial', basis: '仅摘要' } }
          ],
          conclusions: [
            { claimId: 'c1', text: 'DESI DR2 对演化暗能量的偏好与部分数据集存在张力', level: 'inferred', verdict: 'PARTIAL', evidenceRefs: ['ev_desi'] }
          ],
          conflicts: [
            { family: 'w0', unit: '', spread: 8, values: [
              { raw: '0.75', title: 'DESI DR2' }, { raw: '0.83', title: 'Joint Analysis' }
            ] }
          ],
          differences: [], gaps: ['两篇论文仅获得摘要，未读全文'],
          limitations: ['摘要级证据不能替代全文复核'], coverage: { hasPapers: true, hasFulltext: false, hasSimbad: false, independentSources: 2 },
          sources: [{ name: 'arXiv', uri: 'https://arxiv.org' }], paperStats: { abstractOnly: 2 }
        },
        meta: { register: 'pop', tier: 'infer' }
      };
      window.AstroControlBridge.runWithRoute = function () {
        return Promise.resolve({
          mode: 'control', answer: answer, route: { mode: 'research' },
          cancelled: false, verdict: 'PARTIAL',
          control: { state: { id: 'task-v113', steps: [{ tool: 'paper.search', status: 'ok' }] } }
        });
      };
      return 'ready';
    })()`, 20000);
    ok('B12 复杂场景就绪', complexSetup && complexSetup.result && complexSetup.result.value === 'ready');
    var ask2 = await cdp.eval("window.__astrum.ask('暗能量是否可能随时间演化？'); 'asked'", 10000);
    ok('B13 复杂问题提问入口可用', ask2 && ask2.result && ask2.result.value === 'asked');
    var cSnap = null, c0 = Date.now();
    while (Date.now() - c0 < 25000) {
      cSnap = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ans=last?last.querySelector('.answer'):null;
        var ana=last?last.querySelector('.analysis-body'):null;
        var basis=ans?ans.querySelector('.answer-basis'):null;
        return {
          answers: msgs.length,
          streamCalls: window.__streamCalls||0,
          streaming: !!document.querySelector('.stream-msg'),
          analysis: ana?ana.textContent:'',
          text: ans?ans.textContent:'',
          basis: !!basis,
          basisText: basis?basis.textContent:'',
          streamLeft: document.querySelectorAll('.stream-msg').length,
          payloadSynthesis: !!(window.__lastPayload&&window.__lastPayload.synthesis),
          payloadEvidence: (window.__lastPayload&&window.__lastPayload.evidence||[]).length,
          mainEvidence: !!(ans&&ans.querySelector('.answer-main .sec-evidence')),
          mainBasis: !!(ans&&ans.querySelector('.answer-main .answer-basis')),
          mainReview: !!(ans&&ans.querySelector('.answer-main .review-fold')),
          mainTrace: !!(ans&&ans.querySelector('.answer-main .trace-fold')),
          paperCards: basis?basis.querySelectorAll('.paper-card').length:0
        };
      })()`, 10000);
      var cv0 = cSnap && cSnap.result && cSnap.result.value;
      if (cv0 && cv0.answers >= 2 && cv0.streamCalls >= 2 && !cv0.streaming && cv0.analysis) break;
      await sleep(100);
    }
    var cv = cSnap && cSnap.result && cSnap.result.value;
    ok('B14 复杂问题只流式最终答案', !!cv && !cv.streaming && cv.streamLeft === 0);
    ok('B15 复杂问题传入结构化 brief', cv && cv.payloadSynthesis === true, cv && cv.payloadEvidence);
    ok('B16 最终正文=流式 Muse 答案', cv && /暗能量的演化仍无定论/.test(cv.analysis) &&
      /0.75/.test(cv.analysis) && /0.83/.test(cv.analysis), cv && cv.analysis.slice(0, 80));
    ok('B17 不再拼接模板综合', cv && !/本轮共获得|与此相关/.test(cv.text));
    ok('B18 冲突与限制保留', cv && /0.75/.test(cv.text) && /0.83/.test(cv.text) &&
      /限制与未完成项/.test(cv.text), cv && cv.analysis.slice(-120));
    ok('B19 科研依据默认折叠', cv && cv.basis === true && cv.basisText.length > 0);
    ok('B20 依据含论文与核验状态', cv && cv.paperCards >= 1 && /已核验|部分核验/.test(cv.basisText),
      cv && (cv.paperCards + ' · ' + cv.basisText.slice(0, 80)));
    ok('B21 正文不混入证据/评审/执行链路',
      cv && !cv.mainEvidence && !cv.mainBasis && !cv.mainReview && !cv.mainTrace,
      JSON.stringify({ e: cv && cv.mainEvidence, b: cv && cv.mainBasis, r: cv && cv.mainReview, t: cv && cv.mainTrace }));
    ok('B22 公式/引用标记保留', cv && /w\(z\)/.test(cv.analysis) && /\[E1\]/.test(cv.analysis));
    ok('B23 正文无内部 Agent/工具日志',
      cv && !/(Agent|智能体|工具调用|执行步骤|检索词|paper\.search|DESI DR2 Results II 论文检索)/.test(cv.analysis));

    /* ---------- 停止生成 ---------- */
    var ask3 = await cdp.eval("window.__astrum.ask('M31 距离地球多远？'); 'asked'", 10000);
    var clicked = false, w0 = Date.now();
    while (Date.now() - w0 < 12000) {
      var s3 = await cdp.eval(`(function(){
        var b=document.querySelector('.stream-msg .stream-body');
        var stop=document.querySelector('.stream-msg .stream-stop');
        return { body: b?b.textContent:'', hasStop: !!stop, calls: window.__streamCalls||0 };
      })()`, 10000);
      var v3 = s3 && s3.result && s3.result.value;
      if (v3 && v3.body && v3.hasStop && v3.calls >= 3) {
        var c = await cdp.eval("document.querySelector('.stream-msg .stream-stop').click(); 'clicked'", 10000);
        clicked = c && c.result && c.result.value === 'clicked';
        break;
      }
      await sleep(80);
    }
    ok('B24 停止按钮可用', clicked === true);
    var stopSnap = null, s0 = Date.now();
    while (Date.now() - s0 < 10000) {
      stopSnap = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ana=last?last.querySelector('.analysis-body'):null;
        var bd=last?last.querySelector('.boundary'):null;
        return { streaming: !!document.querySelector('.stream-msg'),
          analysis: ana?ana.textContent:'', boundary: bd?bd.textContent:'',
          text: last?last.textContent:'' };
      })()`, 10000);
      var v4 = stopSnap && stopSnap.result && stopSnap.result.value;
      if (v4 && !v4.streaming && v4.analysis) break;
      await sleep(100);
    }
    var v4 = stopSnap && stopSnap.result && stopSnap.result.value;
    ok('B25 停止后保留部分正文', v4 && /M31/.test(v4.analysis), v4 && v4.analysis.slice(0, 40));
    ok('B26 停止不被写成系统故障', v4 && /已由用户停止生成/.test(v4.boundary) &&
      !/(系统故障|异常中断|调用失败)/.test(v4.text), v4 && v4.boundary.slice(0, 60));

    var counts = await cdp.eval('({stream:window.__streamCalls,research:window.__researchCalls})', 10000);
    var cnt = counts && counts.result && counts.result.value;
    ok('B27 三次提问各一次流式请求', cnt && cnt.stream === 3, JSON.stringify(cnt));

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
