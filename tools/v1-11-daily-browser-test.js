/* ASTRUM · V1.11 每日前沿浏览器测试
 *
 * 真实 Chrome + 本地 HTTP；给页面注入不同 sync 状态与论文时间，
 * 验证状态文案、北京时间筛选、近 30 天入口与缓存刷新。
 *
 * 用法：node tools/v1-11-daily-browser-test.js
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
  var self = this; this.ws = ws; this.id = 0; this.pending = {}; this.errors = [];
  this.ready = new Promise(function (res, rej) { ws.addEventListener('open', function () { res(); }); ws.addEventListener('error', function () { rej(new Error('ws')); }); });
  ws.addEventListener('message', function (e) {
    var m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      self.errors.push(String(m.params && m.params.exceptionDetails && m.params.exceptionDetails.text || 'exception').slice(0, 120));
    }
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

function bDate(offset) {
  var d = new Date(Date.now() + 8 * 3600000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}
function paper(id, title, date, offset) {
  return {
    id: id,
    title: title,
    authors: ['Author'],
    summary: '摘要',
    cat: 'astro-ph.GA',
    published: date,
    publishedAt: date + 'T00:00:00+08:00',
    updated: date,
    updatedAt: date + 'T00:00:00+08:00',
    doi: '',
    source: 'arXiv',
    sources: ['arXiv'],
    firstSeen: date,
    fetchedAt: new Date().toISOString(),
    url: 'https://arxiv.org/abs/' + id
  };
}
function daily(papers, sync, updated) {
  return {
    updated: updated || bDate(0),
    generatedAt: new Date().toISOString(),
    note: 'test',
    papers: papers,
    news: [],
    community: [],
    sync: sync
  };
}
function codeOf(data) {
  return '(function(root){root.ASTRUM_DAILY=' + JSON.stringify(data) + ';})(window);';
}

var TODAY = bDate(0), YDAY = bDate(-1), OLD = bDate(-20);
var P_TODAY = paper('2611.90001', 'A Paper Published Today (Beijing)', TODAY, 0);
var P_YDAY = paper('2611.90002', 'A Paper Published Yesterday (Beijing)', YDAY, -1);
var P_OLD = paper('2611.90003', 'A Paper Published 20 Days Ago', OLD, -20);

var ST_OK_NO_NEW = daily([P_TODAY], {
  lastAttemptAt: TODAY + 'T09:10:00+08:00',
  lastSuccessAt: TODAY + 'T09:10:00+08:00',
  newPapers: 0, updatedPapers: 8, newNews: 2,
  totalPapers: 1, totalNews: 0,
  sources: { papers: ['astro-ph.GA(8)'], news: ['ESA(8)'] },
  failures: [], ok: true, partial: false, status: 'ok'
});
var ST_OK_NEW = daily([P_TODAY], {
  lastAttemptAt: TODAY + 'T09:10:00+08:00',
  lastSuccessAt: TODAY + 'T09:10:00+08:00',
  newPapers: 2, updatedPapers: 7, newNews: 1,
  totalPapers: 1, totalNews: 0,
  sources: { papers: ['astro-ph.GA(8)'], news: ['ESA(8)'] },
  failures: [], ok: true, partial: false, status: 'ok'
});
var ST_PARTIAL = daily([P_TODAY, P_YDAY], {
  lastAttemptAt: TODAY + 'T09:10:00+08:00',
  lastSuccessAt: TODAY + 'T09:10:00+08:00',
  newPapers: 1, updatedPapers: 6, newNews: 0,
  totalPapers: 2, totalNews: 0,
  sources: { papers: ['astro-ph.CO(8)'], news: ['ESA(8)'] },
  failures: [{ source: 'ScienceDaily', msg: 'timeout' }],
  ok: true, partial: true, status: 'partial'
});
var ST_FAILED = daily([P_YDAY], {
  lastAttemptAt: TODAY + 'T09:20:00+08:00',
  lastSuccessAt: YDAY + 'T09:10:00+08:00',
  newPapers: 0, updatedPapers: 0, newNews: 0,
  totalPapers: 1, totalNews: 0,
  sources: { papers: [], news: [] },
  failures: [{ source: 'arXiv', category: 'astro-ph.GA', msg: 'HTTP 503' }],
  ok: false, partial: false, status: 'failed'
}, YDAY);
var ST_RUNNING = daily([P_TODAY], {
  lastAttemptAt: new Date(Date.now() - 60 * 1000).toISOString(),
  lastSuccessAt: YDAY + 'T09:10:00+08:00',
  newPapers: 0, updatedPapers: 0, newNews: 0,
  totalPapers: 1, totalNews: 0,
  sources: { papers: [], news: [] },
  failures: [], ok: null, partial: null, status: 'running'
}, YDAY);
var ST_STALE = daily([P_TODAY], {
  lastAttemptAt: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  lastSuccessAt: YDAY + 'T09:10:00+08:00',
  newPapers: 0, updatedPapers: 0, newNews: 0,
  totalPapers: 1, totalNews: 0,
  sources: { papers: [], news: [] },
  failures: [], ok: null, partial: null, status: 'running'
}, YDAY);
var ST_NONE = daily([P_YDAY], null, YDAY);
var RANGE_DATA = daily([P_TODAY, P_YDAY, P_OLD], ST_OK_NO_NEW);
var CACHE_OLD = daily([P_TODAY], ST_OK_NO_NEW);
var CACHE_NEW = daily([P_TODAY, P_YDAY], ST_OK_NO_NEW);

(async function main() {
  var srv = await serve();
  var profile = path.join(os.tmpdir(), 'astrum_dailybrowser_' + Date.now());
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
    var setup = await cdp.eval(`(function(){
      window.__dailyCode = ${JSON.stringify(codeOf(CACHE_OLD))};
      window.ASTRUM_DAILY = ${JSON.stringify(CACHE_OLD)};
      window.__origFetch = window.fetch;
      window.fetch = function(url, opts){
        if (String(url).indexOf('data/daily.js') >= 0) {
          return Promise.resolve({ ok:true, text:function(){ return Promise.resolve(window.__dailyCode); } });
        }
        return window.__origFetch(url, opts);
      };
      document.getElementById('btnFrontier').click();
      return 'ready';
    })()`, 20000);
    ok('B1 页面启动', setup && setup.result && setup.result.value === 'ready');
    await sleep(600);

    async function setState(data) {
      await cdp.eval(`window.__dailyCode=${JSON.stringify(codeOf(data))}; window.ASTRUM_DAILY=${JSON.stringify(data)};
        var r=document.querySelector('#frontierBody .fr-refresh'); if(r) r.click(); 'ok'`, 10000);
      await sleep(500);
    }
    async function statusText() {
      var r = await cdp.eval("(document.querySelector('#frontierBody .fr-note')||{}).textContent||''", 10000);
      return (r && r.result && r.result.value) || '';
    }
    async function clickTab(label) {
      await cdp.eval(`(function(){
        var bs=document.querySelectorAll('#frontierBody .fr-tab');
        for(var i=0;i<bs.length;i++){ if(bs[i].textContent.trim()===${JSON.stringify(label)}){ bs[i].click(); return 'ok'; } }
        return 'notfound';
      })()`, 10000);
      await sleep(250);
    }
    async function itemCount() {
      var r = await cdp.eval("document.querySelectorAll('#frontierBody .fr-item').length", 10000);
      return r && r.result ? r.result.value : -1;
    }

    await setState(ST_NONE);
    var t1 = await statusText();
    ok('B2 尚未执行显示最近成功时间', /尚未执行每日同步/.test(t1) && t1.indexOf(YDAY) >= 0, t1);

    await setState(ST_RUNNING);
    var t2 = await statusText();
    ok('B3 正在更新状态', /正在更新/.test(t2) && t2.indexOf(YDAY) >= 0, t2);

    await setState(ST_STALE);
    var t3 = await statusText();
    ok('B4 中断的 running 显示未完成', /上次更新未完成/.test(t3), t3);

    await setState(ST_OK_NO_NEW);
    var t4 = await statusText();
    ok('B5 成功但无新论文有明确文案', /本次同步成功，未发现新论文/.test(t4) && /更新 8 篇已有/.test(t4), t4);
    ok('B6 抓取数量标注为来源响应条数', /抓取来源（响应条数）/.test(t4) && /astro-ph\.GA\(8\)/.test(t4), t4);

    await setState(ST_OK_NEW);
    var t5 = await statusText();
    ok('B7 成功且有新增显示新增/更新数量', /新增 2 篇论文/.test(t5) && /更新 7 篇已有/.test(t5), t5);

    await setState(ST_PARTIAL);
    var t6 = await statusText();
    ok('B8 部分失败显示失败来源', /部分来源失败/.test(t6) && /ScienceDaily/.test(t6), t6);

    await setState(ST_FAILED);
    var t7 = await statusText();
    ok('B9 全部失败显示失败原因与上次成功', /本次更新失败/.test(t7) && /HTTP 503/.test(t7) &&
      t7.indexOf(YDAY) >= 0, t7);

    /* 北京时间日期边界与范围筛选 */
    await setState(RANGE_DATA);
    await clickTab('今日');
    var todayItems = await itemCount();
    var todayText = await cdp.eval("(function(){var b=document.querySelectorAll('#frontierBody .fr-item .paper-title');return Array.prototype.map.call(b,function(x){return x.textContent;}).join('|');})()", 10000);
    var tTitles = todayText && todayText.result ? todayText.result.value : '';
    ok('B10 今日包含北京时间边界内的论文', todayItems === 1 &&
      /Published Today/.test(tTitles) && !/Published Yesterday/.test(tTitles), todayItems + '/' + tTitles);

    await clickTab('近 7 天');
    var sevenItems = await itemCount();
    ok('B11 近 7 天包含昨天', sevenItems === 2, sevenItems);

    await clickTab('近 30 天');
    var thirtyItems = await itemCount();
    ok('B12 近 30 天包含更早论文', thirtyItems === 3, thirtyItems);

    /* 今日为空：明确提示 + 近 30 天入口 */
    await setState(daily([P_YDAY, P_OLD], ST_OK_NO_NEW));
    await clickTab('今日');
    var emptyText = await cdp.eval("Array.prototype.map.call(document.querySelectorAll('#frontierBody .fr-note'),function(x){return x.textContent;}).join(' | ')", 10000);
    var emptyVal = emptyText && emptyText.result ? emptyText.result.value : '';
    ok('B13 今日无论文明确提示', /今天没有检索到符合条件的新论文/.test(emptyVal), emptyVal);
    var more = await cdp.eval("!!document.querySelector('#frontierBody .fr-more')", 10000);
    ok('B14 提供近 30 天入口', more && more.result && more.result.value === true);
    var clicked = await cdp.eval("(function(){var b=document.querySelector('#frontierBody .fr-more'); if(b){b.click();return 'ok';}return 'none';})()", 10000);
    ok('B15 点击近 30 天可查看', clicked && clicked.result && clicked.result.value === 'ok');
    await sleep(250);
    var afterMore = await itemCount();
    ok('B16 近 30 天列表可用', afterMore >= 2, afterMore);

    /* 缓存刷新：页面加载时是 1 篇，刷新接口返回 2 篇 */
    await setState(CACHE_OLD);
    await sleep(900);
    var cacheEval = await cdp.eval(`(async function(){
      window.ASTRUM_DAILY=${JSON.stringify(CACHE_OLD)};
      window.__dailyCode=${JSON.stringify(codeOf(CACHE_NEW))};
      await window.__astrum.refreshFrontier();
      return window.ASTRUM_DAILY.papers.length;
    })()`, 15000);
    var cacheVal = cacheEval && cacheEval.result ? cacheEval.result.value : -1;
    var refreshed = await itemCount();
    ok('B17a 刷新后内存数据为 2 篇', cacheVal === 2, cacheVal);
    ok('B17 缓存刷新后读取新数据', refreshed >= 2, refreshed);
    ok('B18 页面无未捕获异常', cdp.errors.length === 0, cdp.errors.join(' | '));
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
