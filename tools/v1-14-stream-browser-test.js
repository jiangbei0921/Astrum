/* ASTRUM · V1.14 最终答案渲染 / 流式一致性浏览器测试
 *
 * 真实 Chrome + 本地 HTTP；只替换模型流式回调与 Control 返回，不替换 DOM/渲染/Thread。
 * 覆盖：
 *   - 简单题：正文只有一份，不再有独立结论卡/评审/推荐问题
 *   - 简单题：来源入口为“数据来源”，不出现“科研依据”重复标签
 *   - 复杂题：正文只有 analysis，无科学结论列表/边界卡；边界进入科研详情
 *   - 审计提示只进详情，不混入正文
 *   - 长答案不被 maxChars 截断，段落结构保留
 *   - 停止生成保留部分正文
 *
 * 用法：node tools/v1-14-stream-browser-test.js
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

function longText() {
  var parts = [];
  for (var i = 0; i < 30; i++) {
    parts.push('第' + (i + 1) + '段用于验证长答案不会被截断。这一段讨论测量方法、样本选择与适用范围，确保答案完整交付。');
  }
  parts.push('长答案结尾标记。');
  return parts.join('\n\n');
}

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_v114stream_' + Date.now());
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

    var long = longText();
    var setup = await cdp.eval(`(async function(){
      try { if (window.Thread && window.Thread.clearAll) await window.Thread.clearAll(); } catch(e) {}
      window.__astrum.newChat();
      window.Sources.setConfig('openai', {
        key: 'browser-test-key', endpoint: 'https://offline.local/v1/chat/completions',
        model: 'browser-test-model', enabled: true, temperature: 0.2, maxTokens: 400
      });
      window.__astrum.selectSource('openai');
      window.__mockKind = 'simple';
      window.__longText = ${JSON.stringify(long)};
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
        var kind = window.__mockKind;
        var toks;
        if (kind === 'complex') {
          toks = ['暗能量的演化仍无定论。',
            '\\n\\nDESI DR2 与联合分析给出的 w(z) 偏好并不一致 [E1]；0.75 与 0.83 的差异必须保留。',
            '\\n\\n两篇论文都只提供摘要级证据，不能当作已读全文的定论。'];
        } else if (kind === 'long') {
          var chunks = [], s = window.__longText;
          for (var i = 0; i < s.length; i += 40) chunks.push(s.slice(i, i + 40));
          toks = chunks;
        } else {
          toks = ['仙女座星系（M31）距离地球约 250 万光年。',
            '\\n\\n另有资料给出 999 万光年。'];
        }
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
                ttft: first || 0, latency: Date.now() - t0, tokens: toks.length * 3,
                usage: { prompt: 8, completion: toks.length * 3, total: 8 + toks.length * 3 } });
              return;
            }
            if (first == null) first = Date.now() - t0;
            handlers.onToken(toks[k++]);
            setTimeout(tick, kind === 'long' ? 35 : 220);
          }
          setTimeout(tick, 80);
        });
      };
      return 'ready';
    })()`, 20000);
    ok('B1 流式环境就绪', setup && setup.result && setup.result.value === 'ready');

    /* ---------- 1. 简单题：单一正文 + 轻量数据来源 ---------- */
    await cdp.eval("window.__mockKind='simple'; window.__astrum.ask('M31 距离地球多远？'); 'asked'", 10000);
    var simple = null, s0 = Date.now();
    while (Date.now() - s0 < 15000) {
      simple = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ans=last?last.querySelector('.answer'):null;
        var main=ans?ans.querySelector('.answer-main'):null;
        var basis=ans?ans.querySelector('.answer-basis'):null;
        var details=ans?ans.querySelector('.answer-details'):null;
        return {
          streaming: !!document.querySelector('.stream-msg'),
          answers: msgs.length,
          mainText: main?main.textContent:'',
          analysis: main?main.querySelectorAll('.analysis-body').length:-1,
          verdicts: main?main.querySelectorAll('.sec-verdict').length:-1,
          followups: main?main.querySelectorAll('.followup').length:-1,
          review: main?main.querySelectorAll('.review-fold').length:-1,
          basisText: basis?basis.textContent:'',
          basisSummary: basis&&basis.querySelector('.answer-basis-summary')?basis.querySelector('.answer-basis-summary').textContent:'',
          detailsText: details?details.textContent:'',
          labelCount: (ans?ans.textContent:'').split('科研依据').length - 1
        };
      })()`, 10000);
      var sv = simple && simple.result && simple.result.value;
      if (sv && !sv.streaming && sv.answers >= 1 && sv.analysis >= 1) break;
      await sleep(80);
    }
    var sv = simple && simple.result && simple.result.value;
    ok('B2 简单题正文只有 analysis', sv && sv.analysis === 1 && sv.verdicts === 0, JSON.stringify({ a: sv && sv.analysis, v: sv && sv.verdicts }));
    ok('B3 简单题首屏无追问/评审', sv && sv.followups === 0 && sv.review === 0, JSON.stringify({ f: sv && sv.followups, r: sv && sv.review }));
    ok('B4 简单题来源入口为“数据来源”', sv && /数据来源/.test(sv.basisSummary) && !/参考来源/.test(sv.basisSummary), sv && sv.basisSummary);
    ok('B5 不再出现重复“科研依据”标签', sv && sv.labelCount === 0, sv && sv.labelCount);
    ok('B6 审计提示只进详情', sv && !/未能在本地事实/.test(sv.mainText) && /未能在本地事实/.test(sv.detailsText),
      sv && sv.mainText.slice(0, 80));

    /* ---------- 2. 复杂题：单一正文 + 详情层 ---------- */
    var complexSetup = await cdp.eval(`(function(){
      var answer = {
        query: '暗能量是否可能随时间演化？', intent: 'unknown', targets: [],
        trace: [], sections: [
          { kind: 'verdict', head: '暗能量是否随时间演化，目前尚无定论。' },
          { kind: 'evidence', title: '依据', items: [
            { label: 'DESI DR2', value: '给出与 w(z) 演化相关的测量差异' }
          ] },
          { kind: 'list', title: '科学结论（按证据强度分级）', items: [
            { name: 'DESI DR2 对演化暗能量给出偏好', meta: '推断' }
          ] },
          { kind: 'boundary', mode: 'uncertain', text: '两篇论文仅获得摘要，未读全文；结论不能当作已证实事实。' },
          { kind: 'followup', items: ['暗能量的最新进展是什么？'] }
        ],
        research: {
          reportId: 'rep_v114', question: '暗能量是否可能随时间演化？',
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
          limitations: [], coverage: { hasPapers: true, hasFulltext: false, hasSimbad: false, independentSources: 2 },
          sources: [{ name: 'arXiv', uri: 'https://arxiv.org' }], paperStats: { abstractOnly: 2 }
        },
        meta: { register: 'pop', tier: 'infer' }
      };
      window.AstroControlBridge.runWithRoute = function () {
        return Promise.resolve({
          mode: 'control', answer: answer, route: { mode: 'research' },
          cancelled: false, verdict: 'PARTIAL',
          control: { state: { id: 'task-v114', steps: [{ tool: 'paper.search', status: 'ok' }] } }
        });
      };
      window.__mockKind = 'complex';
      return 'ready';
    })()`, 20000);
    ok('B7 复杂场景就绪', complexSetup && complexSetup.result && complexSetup.result.value === 'ready');
    await cdp.eval("window.__astrum.ask('暗能量是否可能随时间演化？'); 'asked'", 10000);
    var complex = null, c0 = Date.now();
    while (Date.now() - c0 < 25000) {
      complex = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ans=last?last.querySelector('.answer'):null;
        var main=ans?ans.querySelector('.answer-main'):null;
        var basis=ans?ans.querySelector('.answer-basis'):null;
        var details=ans?ans.querySelector('.answer-details'):null;
        return {
          streaming: !!document.querySelector('.stream-msg'),
          answers: msgs.length,
          main: main?main.textContent:'',
          analysisCount: main?main.querySelectorAll('.sec-analysis').length:-1,
          verdicts: main?main.querySelectorAll('.sec-verdict').length:-1,
          conclusionList: main?main.querySelectorAll('.sec-list').length:-1,
          boundaryMain: main?main.querySelectorAll('.boundary').length:-1,
          boundaryDetail: details?details.querySelectorAll('.boundary').length:-1,
          basisSummary: basis&&basis.querySelector('.answer-basis-summary')?basis.querySelector('.answer-basis-summary').textContent:'',
          basisText: basis?basis.textContent:'',
          detailText: details?details.textContent:'',
          labelCount: (ans?ans.textContent:'').split('科研依据').length - 1,
          paperCards: basis?basis.querySelectorAll('.paper-card').length:0
        };
      })()`, 10000);
      var cv0 = complex && complex.result && complex.result.value;
      if (cv0 && !cv0.streaming && cv0.answers >= 2 && cv0.analysisCount >= 1) break;
      await sleep(100);
    }
    var cv = complex && complex.result && complex.result.value;
    ok('B8 复杂题正文只有一份 analysis', cv && cv.analysisCount === 1 && cv.verdicts === 0, JSON.stringify({ a: cv && cv.analysisCount, v: cv && cv.verdicts }));
    ok('B9 科学结论列表不在正文', cv && cv.conclusionList === 0, cv && cv.conclusionList);
    ok('B10 边界卡不在正文、进入详情', cv && cv.boundaryMain === 0 && cv.boundaryDetail >= 1,
      JSON.stringify({ m: cv && cv.boundaryMain, d: cv && cv.boundaryDetail }));
    ok('B11 来源入口为“参考来源”', cv && /参考来源/.test(cv.basisSummary) && /篇论文/.test(cv.basisSummary), cv && cv.basisSummary);
    ok('B12 不再出现重复“科研依据”', cv && cv.labelCount === 0, cv && cv.labelCount);
    ok('B13 论文与核验状态仍可见', cv && cv.paperCards >= 1 && /已核验|部分核验/.test(cv.basisText),
      cv && (cv.paperCards + ' · ' + cv.basisText.slice(0, 80)));
    ok('B14 复杂正文保留冲突数值', cv && /0.75/.test(cv.main) && /0.83/.test(cv.main), cv && cv.main.slice(0, 100));

    /* ---------- 3. 长答案不截断 ---------- */
    await cdp.eval("window.__mockKind='long'; window.__astrum.ask('M31 距离地球多远？'); 'asked'", 10000);
    var longSnap = null, l0 = Date.now();
    while (Date.now() - l0 < 30000) {
      longSnap = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ans=last?last.querySelector('.answer'):null;
        var ana=ans?ans.querySelector('.analysis-body'):null;
        return { streaming: !!document.querySelector('.stream-msg'), answers: msgs.length,
          text: ana?ana.textContent:'', paras: ana?ana.querySelectorAll('.analysis-p').length:0 };
      })()`, 10000);
      var lv = longSnap && longSnap.result && longSnap.result.value;
      if (lv && !lv.streaming && lv.answers >= 3 && /长答案结尾标记/.test(lv.text)) break;
      await sleep(100);
    }
    var lv = longSnap && longSnap.result && longSnap.result.value;
    ok('B15 长答案完整保留结尾', lv && /长答案结尾标记/.test(lv.text), lv && ('len=' + lv.text.length));
    ok('B16 长答案超过 1200 字未被截断', lv && lv.text.length > 1200, lv && lv.text.length);
    ok('B17 长答案保留段落', lv && lv.paras >= 5, lv && lv.paras);

    /* ---------- 4. 停止生成 ---------- */
    await cdp.eval("window.__mockKind='long'; window.__astrum.ask('M31 距离地球多远？'); 'asked'", 10000);
    var clicked = false, w0 = Date.now();
    while (Date.now() - w0 < 15000) {
      var s4 = await cdp.eval(`(function(){
        var b=document.querySelector('.stream-msg .stream-body');
        var stop=document.querySelector('.stream-msg .stream-stop');
        return { body: b?b.textContent:'', hasStop: !!stop, calls: window.__streamCalls||0 };
      })()`, 10000);
      var v4 = s4 && s4.result && s4.result.value;
      if (v4 && v4.body && v4.hasStop && v4.calls >= 4) {
        var c = await cdp.eval("document.querySelector('.stream-msg .stream-stop').click(); 'clicked'", 10000);
        clicked = c && c.result && c.result.value === 'clicked';
        break;
      }
      await sleep(60);
    }
    ok('B18 停止按钮可用', clicked === true);
    var stopSnap = null, z0 = Date.now();
    while (Date.now() - z0 < 10000) {
      stopSnap = await cdp.eval(`(function(){
        var msgs=document.querySelectorAll('.msg.bot');
        var last=msgs[msgs.length-1];
        var ans=last?last.querySelector('.answer'):null;
        var ana=ans?ans.querySelector('.analysis-body'):null;
        var bd=last?last.querySelector('.boundary'):null;
        return { streaming: !!document.querySelector('.stream-msg'),
          analysis: ana?ana.textContent:'', boundary: bd?bd.textContent:'',
          text: last?last.textContent:'' };
      })()`, 10000);
      var sv4 = stopSnap && stopSnap.result && stopSnap.result.value;
      if (sv4 && !sv4.streaming && sv4.analysis) break;
      await sleep(100);
    }
    var sv4 = stopSnap && stopSnap.result && stopSnap.result.value;
    ok('B19 停止后保留部分正文', sv4 && /第1段|长答案/.test(sv4.analysis), sv4 && sv4.analysis.slice(0, 40));
    ok('B20 停止不被写成系统故障', sv4 && /已由用户停止生成/.test(sv4.boundary) &&
      !/(系统故障|异常中断|调用失败)/.test(sv4.text), sv4 && sv4.boundary.slice(0, 60));

    var counts = await cdp.eval('({stream:window.__streamCalls,research:window.__researchCalls})', 10000);
    var cnt = counts && counts.result && counts.result.value;
    ok('B21 四次提问各一次流式请求', cnt && cnt.stream === 4, JSON.stringify(cnt));

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
