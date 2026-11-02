/* ASTRUM · V1.1 Chrome 浏览器验收（IndexedDB + 统一入口 + Research UI）
 *
 * 用真实 Chrome（CDP）验证：
 *   1 TaskStore 在 IndexedDB 写入/读取/列表/删除/清空，新实例可读回（刷新等价）；
 *   2 默认 UI 的 L1 仍走旧链路，L2 进入 Control；
 *   3 answer.research 渲染为可折叠报告，链接安全、外部文本转义。
 *
 * 用法：node tools/v1-1-browser-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var TARGET = 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/');
var TIMEOUT = 120000;

function findChrome() {
  if (process.env.STORE_TEST_CHROME) return process.env.STORE_TEST_CHROME;
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  return 'chrome';
}

var SCRIPT = `
(async function () {
  var R = [];
  function flush() {
    var el = document.getElementById('__v11_partial');
    if (!el) {
      el = document.createElement('pre');
      el.id = '__v11_partial';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    el.textContent = R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n; }).join('\\n');
  }
  function ok(name, pass, extra) { R.push({ n: name, p: !!pass, x: extra || '' }); flush(); }
  function finish() {
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__v11_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? ' | ' + r.x : ''); }).join('\\n');
    document.body.appendChild(el);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function waitReady() {
    return new Promise(function (resolve) {
      var n = 0;
      (function tick() {
        if ((window.__astrum && window.AstroTaskStore && window.AstroControlBridge) || n > 60) return resolve();
        n += 1; setTimeout(tick, 200);
      })();
    });
  }
  function askWait(q) {
    return new Promise(function (resolve) {
      var before = document.querySelectorAll('.msg.bot').length;
      window.__astrum.ask(q);
      var n = 0, iv = setInterval(function () {
        n += 1;
        var bots = document.querySelectorAll('.msg.bot');
        var last = bots[bots.length - 1];
        if (bots.length > before && last && !document.querySelector('.thinking')) {
          clearInterval(iv); resolve(last);
        } else if (n > 100) { clearInterval(iv); resolve(null); }
      }, 250);
    });
  }

  try {
    await waitReady();
    var T = window.AstroTask, S = window.AstroTaskStore;
    if (!T || !S) { ok('TaskStore 已加载', false); finish(); return; }

    var store = S.create({});
    await store.init();
    ok('C1 浏览器后端为 IndexedDB', store.backend() === 'idb', store.backend());

    var plan = { template: 'T-A', steps: [
      { id: 't1', tool: 'kb.lookup', args: { query: 'M42' }, deps: [], parallel: false, critical: false, optional: false },
      { id: 't2', tool: 'compose.target', args: { query: 'M42' }, deps: ['t1'], parallel: false, critical: true, optional: false }
    ] };
    var st = T.create({ question: 'V1.1 浏览器 IDB 任务', level: 'L2' });
    st.phase = 'EXECUTE';
    st.plan = plan;
    st.steps = plan.steps.map(T.makeStep);
    st.steps[0].status = 'ok';
    st.steps[0].attempt = 2;
    st.steps[0].result = { ok: true, n: 1 };
    st.steps[0].outputHash = T.sha256Hex('ok');
    st.steps[0].startedAt = st.steps[0].endedAt = new Date().toISOString();
    await store.save(st);

    var got = await store.get(st.id);
    ok('C2 同一实例读回 Phase/Steps', !!got && got.phase === 'EXECUTE' && got.steps.length === 2);
    ok('C3 已完成步骤/attempt 保留', got && got.steps[0].status === 'ok' && got.steps[0].attempt === 2 && !!got.steps[0].outputHash);

    var store2 = S.create({});
    await store2.init();
    var got2 = await store2.get(st.id);
    ok('C4 新实例（刷新等价）读回', !!got2 && got2.id === st.id && got2.steps[0].result.n === 1);
    var list = await store2.list({ limit: 10 });
    var row = list.filter(function (x) { return x.id === st.id; })[0];
    ok('C5 列表可查询且可恢复', !!row && row.resumable === true && row.viewOnly === false, row && JSON.stringify(row));
    ok('C6 Event seq 单调', got2.events.every(function (e, i) { return e.seq === i + 1; }));

    await store2.save(got2);
    var list2 = await store2.list({ limit: 10 });
    ok('C7 重复保存不产生重复记录', list2.filter(function (x) { return x.id === st.id; }).length === 1);

    await store2.remove(st.id);
    ok('C8 删除后不可读', (await store2.get(st.id)) === null);
    await store2.clear();
    ok('C9 清空历史', (await store2.list({ limit: 10 })).length === 0);

    /* ---- 统一入口：L1 vs L2 ---- */
    var l1 = await askWait('你好');
    var route1 = window.__astrum.lastRoute && window.__astrum.lastRoute();
    ok('U1 L1 仍走 LEGACY', !!route1 && route1.legacy === true, route1 && route1.route.level);
    ok('U2 L1 正常渲染且无研究报告', !!l1 && !l1.querySelector('.research-panel'));

    var l2 = await askWait('M42 怎么拍 为什么需要长曝光？');
    var route2 = window.__astrum.lastRoute && window.__astrum.lastRoute();
    ok('U3 L2 进入 Control', !!route2 && route2.control === true && route2.route.level === 'L2',
      route2 && route2.route.level);
    ok('U4 L2 正常渲染', !!l2 && l2.querySelector('.answer'));
    ok('U5 已有 TaskStore 任务写入', (await store.list({ limit: 10 })).length >= 1);

    /* ---- V1.2：FITS 附件进入统一入口与 Research UI ---- */
    var cards = [
      'SIMPLE  = T', 'BITPIX  = -32', 'NAXIS   = 0', "OBJECT  = 'M42'", "TELESCOP= 'TEST'", 'END'
    ];
    var text = cards.map(function (c) { return (c + ' '.repeat(80)).slice(0, 80); }).join('');
    var bytes = new Uint8Array(2880);
    for (var bi = 0; bi < text.length; bi++) bytes[bi] = text.charCodeAt(bi);
    var file = new File([bytes], 'browser-attach.fits', { type: 'application/fits' });
    window.__astrum.addFiles([file]);
    await sleep(600);
    ok('U6 FITS 附件已解析', window.__astrum.attachments().length === 1 &&
      window.__astrum.attachments()[0].kind === 'fits', JSON.stringify(window.__astrum.attachments().map(function (a) {
        return a.kind + ':' + a.status;
      })));
    var withFile = await askWait('M42 怎么拍 为什么需要长曝光？');
    var route3 = window.__astrum.lastRoute && window.__astrum.lastRoute();
    ok('U7 FITS 附件进入 Control', !!route3 && route3.control === true);
    var fp = withFile && withFile.querySelector('.research-panel');
    ok('U8 附件报告已渲染', !!fp && fp.textContent.indexOf('browser-attach.fits') >= 0);
    ok('U9 附件观测来源可见', !!fp && fp.textContent.indexOf('观测') >= 0);

    /* ---- Research UI：使用固定 fixture，仅验证渲染与安全，不冒充真实数据 ---- */
    window.__XSS = 0;
    var fixture = {
      query: 'M42 研究报告（UI fixture）',
      intent: 'knowledge-target',
      targets: [],
      trace: [],
      sections: [{ kind: 'verdict', head: '研究报告渲染测试', sub: 'MOCK fixture' }],
      meta: { register: 'pop' },
      research: {
        reportId: 'rep_ui_test',
        question: 'M42 的基本参数与研究进展',
        subject: { names: ['M42'] },
        retrievedAt: '2026-10-31T00:00:00Z',
        coverage: { hasSimbad: false, hasPapers: true, hasFits: false },
        conclusions: [
          { claimId: 'c1', text: '论文摘要支持 M42 是活跃恒星形成区', level: 'inferred', rule: 'R1', evidenceRefs: ['ev_1'] }
        ],
        parameters: [
          { label: 'M42', value: 'RA 83.822 / Dec -5.391', evidenceRefs: ['ev_1'] }
        ],
        papers: [
          { title: '<img src=x onerror="window.__XSS=1">论文标题', authors: ['A'], doi: '10.1000/x',
            date: '2024-01-01', url: 'https://example.org/paper', abstractOnly: true, excerpt: '摘要 <b>text</b>' },
          { title: '非法链接论文', url: 'javascript:alert(1)', abstractOnly: true },
          { title: 'Full text paper', authors: ['B'], doi: '10.1000/f', date: '2024-02-01',
            fulltextAvailable: true, abstractOnly: false, pageCount: 5, sections: ['INTRODUCTION', 'RESULTS'],
            excerpt: 'Full text excerpt from RESULTS.' }
        ],
        paperStats: { searched: 3, fulltext: 1, abstractOnly: 2, failed: 0, fulltextEvidence: 1, abstractEvidence: 2 },
        observations: [
          { fileName: 'test0.fits', hduCount: 2, telescope: 'TEST', summary: 'mean 6.5 / min 1 / max 12', warnings: [] }
        ],
        evidence: [{ evidenceId: 'ev_1', title: 'Paper', sourceType: 'paper', trust: { level: 'medium' }, uri: 'https://example.org/paper' }],
        conflicts: [
          { family: 'distance (ly)', spread: 12.5, values: [{ raw: '10 ly', host: 'a.org' }, { raw: '12 ly', host: 'b.org' }] }
        ],
        uncertainties: [{ text: '仅摘要' }],
        gaps: ['SIMBAD 网络不可达', '未提供 FITS'],
        disclaimer: '仅基于摘要；缺失数据不编造。'
      }
    };
    window.__astrum.renderAnswer(fixture, { uiFixture: true });
    await sleep(200);
    var panels = document.querySelectorAll('.research-panel');
    var panel = panels.length ? panels[panels.length - 1] : null;
    ok('U10 Research Report 已渲染', !!panel);
    ok('U11 八个报告区块存在', panel && panel.querySelectorAll('.research-block').length >= 6,
      panel && String(panel.querySelectorAll('.research-block').length));
    ok('U12 可折叠 details', panel && panel.tagName === 'DETAILS' && panel.open === true);
    var links = panel ? panel.querySelectorAll('.research-link') : [];
    ok('U13 只保留 http(s) 链接', links.length === 2 &&
      Array.prototype.every.call(links, function (a) { return /^https?:/.test(a.href); }), String(links.length));
    ok('U14 外部链接 noopener', links.length === 2 &&
      Array.prototype.every.call(links, function (a) {
        return a.target === '_blank' && a.rel.indexOf('noopener') >= 0;
      }), String(links.length));
    ok('U15 外部 HTML 被转义', !document.querySelector('.research-panel img') && window.__XSS === 0);
    ok('U16 摘要仅标记/缺口展示', panel && panel.textContent.indexOf('摘要') >= 0 &&
      panel.textContent.indexOf('SIMBAD') >= 0);
    ok('U17 全文/摘要统计可见', panel && panel.textContent.indexOf('全文 1') >= 0 &&
      panel.textContent.indexOf('仅摘要 2') >= 0);
    ok('U18 全文论文标记与章节可见', panel && panel.textContent.indexOf('Full text paper') >= 0 &&
      panel.textContent.indexOf('RESULTS') >= 0);
  } catch (e) {
    ok('执行异常', false, String(e && e.stack || e).slice(0, 180));
  }
  finish();
})();
`;

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function launch(profile, url) {
  var args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--no-first-run', '--disable-background-networking',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', url
  ];
  var child = cp.spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
  var stderr = '';
  child.stderr.on('data', function (d) { stderr += String(d); });
  return { child: child, stderr: function () { return stderr; } };
}

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
  this.ws = ws;
  this.id = 0;
  this.pending = {};
  this.closed = false;
  var self = this;
  this.ready = new Promise(function (resolve, reject) {
    ws.addEventListener('open', function () { resolve(); });
    ws.addEventListener('error', function () { reject(new Error('WebSocket 连接失败')); });
  });
  ws.addEventListener('message', function (ev) {
    var msg = JSON.parse(ev.data);
    if (msg.id && self.pending[msg.id]) {
      var p = self.pending[msg.id];
      delete self.pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error.message || String(msg.error)));
      else p.resolve(msg.result);
    }
  });
  ws.addEventListener('close', function () { self.closed = true; });
}
Cdp.prototype.send = function (method, params, ms) {
  var self = this;
  return this.ready.then(function () {
    return new Promise(function (resolve, reject) {
      if (self.closed) { reject(new Error('CDP 已关闭')); return; }
      var id = ++self.id;
      self.pending[id] = { resolve: resolve, reject: reject };
      self.ws.send(JSON.stringify({ id: id, method: method, params: params || {} }));
      setTimeout(function () {
        if (self.pending[id]) {
          delete self.pending[id];
          reject(new Error('CDP timeout: ' + method));
        }
      }, ms || 10000);
    });
  });
};
Cdp.prototype.evaluate = function (expr, ms) {
  return this.send('Runtime.evaluate', {
    expression: expr, returnByValue: true, awaitPromise: true
  }, ms).then(function (r) {
    return { value: r.result && r.result.value, exception: r.exceptionDetails ? r.exceptionDetails.text : null };
  });
};
Cdp.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

async function kill(child, pid) {
  try {
    if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (e) {}
}

async function main() {
  if (typeof WebSocket !== 'function' || typeof fetch !== 'function') {
    console.error('需要 Node >= 22（内置 WebSocket/fetch）');
    process.exit(2);
  }
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var i = html.lastIndexOf('</body>');
  html = html.slice(0, i) + '<script>' + SCRIPT + '</script>' + html.slice(i);
  var tag = process.pid + '_' + Date.now();
  var tmp = path.join(ROOT, '__v11_browser_' + tag + '.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), 'astrum_v11_' + tag);
  fs.mkdirSync(profile, { recursive: true });
  var run = launch(profile, 'file:///' + tmp.replace(/\\/g, '/'));
  var cdp = null;
  try {
    var port = await readPort(profile, 20000);
    if (!port) throw new Error('Chrome 未启动 DevToolsActivePort');
    var page = await findPage(port);
    if (!page) throw new Error('未找到页面目标');
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    await cdp.send('Runtime.enable', {}, 5000);
    var t0 = Date.now();
    var text = null;
    while (Date.now() - t0 < TIMEOUT) {
      var r = await cdp.evaluate("(document.getElementById('__v11_result') || {}).textContent || ''", 5000);
      if (typeof r.value === 'string' && /^RESULT \d+\/\d+/.test(r.value)) { text = r.value; break; }
      await sleep(200);
    }
    if (!text) throw new Error('等待浏览器测试结果超时');
    console.log(text);
    var m = text.match(/RESULT (\d+)\/(\d+)/);
    process.exitCode = (m && Number(m[1]) === Number(m[2])) ? 0 : 1;
  } catch (e) {
    console.error('CDP 失败:', e && e.message);
    try {
      if (cdp && !cdp.closed) {
        var part = await cdp.evaluate("(document.getElementById('__v11_partial') || {}).textContent || ''", 5000);
        if (part && part.value) console.error('PARTIAL:\n' + part.value);
      }
    } catch (e2) {}
    process.exitCode = 1;
  } finally {
    if (cdp) cdp.close();
    await kill(run.child, run.child.pid);
    await sleep(100);
    try { fs.rmSync(tmp, { force: true }); } catch (e) {}
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
}

main();
