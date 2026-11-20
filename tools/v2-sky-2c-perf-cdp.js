/* ASTRUM · V2-SKY 子阶段 2C 真实浏览器性能补测（Chrome + CDP，零依赖）
 *
 * 与 tools/v2-sky-2c-browser-test.js 的差别：
 *   旧脚本用 --virtual-time-budget --dump-dom，页面时钟被虚拟化，performance.now
 *   不反映真实耗时；本脚本用 --remote-debugging-port + Runtime.evaluate 在真实
 *   时钟下测量，Node 只搬运聚合结果。
 *
 * 覆盖场景：
 *   A 冷启动（首帧解码/天空纹理/栅格/首帧绘制）与强制冷重建
 *   B 缓存命中（同视图连续绘制）
 *   C 相机变化（yaw/fov 变化触发栅格重建）
 *   D 观测时间变化（150ms 去抖合并 + 分离式重建）
 *   E 观测地点变化
 *   F 高负载（fov 上限 178°、全图层、1600×1000）
 *   G 连续帧 rAF 间隔（长帧统计）
 *   H 典型查看器尺寸 760×540
 *
 * 统计：每个场景预热 10 次、正式采样 100 次，输出 avg / p50 / p95 / max。
 *
 * 用法：node tools/v2-sky-2c-perf-cdp.js
 * 输出：stdout 打印 JSON（结果）+ 简要表格
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var net = require('net');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var WARMUP = 10;
var SAMPLES = 100;

function findChrome() {
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

function freePort() {
  return new Promise(function (res, rej) {
    var srv = net.createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', function () {
      var p = srv.address().port;
      srv.close(function () { res(p); });
    });
  });
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* 页面内基准脚本：全部计时使用页面真实 performance.now() */
var BENCH = fs.readFileSync(path.join(__dirname, 'v2-sky-2c-perf-bench-inline.js'), 'utf8');

async function main() {
  var port = await freePort();
  var profile = path.join(os.tmpdir(), 'astrum-perf-profile-' + Date.now());
  var proc = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--window-size=1600,1000',
    '--remote-debugging-port=' + port,
    '--user-data-dir=' + profile,
    'about:blank'
  ], { stdio: 'ignore' });

  var ver = null;
  for (var i = 0; i < 80; i++) {
    try {
      var r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) { ver = await r.json(); break; }
    } catch (e) { }
    await sleep(250);
  }
  if (!ver) {
    console.error('[perf] BLOCKED: CDP 调试端点不可用');
    proc.kill();
    process.exit(3);
  }

  var list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  var target = list.filter(function (t) { return t.type === 'page'; })[0];
  var ws = new WebSocket(target.webSocketDebuggerUrl);
  var seq = 0, pending = {};
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  };
  function send(method, params) {
    seq++;
    var myId = seq;
    return new Promise(function (res) {
      pending[myId] = res;
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
    });
  }

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + INDEX.replace(/\\/g, '/') });

  var ready = false;
  for (var t = 0; t < 160; t++) {
    var ev = await send('Runtime.evaluate', {
      expression: '!!(window.__astrum && window.SkyBackground && window.SkyRender && window.SkyVM)',
      returnByValue: true
    });
    if (ev.result && ev.result.result && ev.result.result.value === true) { ready = true; break; }
    await sleep(200);
  }
  if (!ready) {
    console.error('[perf] BLOCKED: 页面模块未就绪');
    ws.close(); proc.kill(); process.exit(4);
  }

  var res = await send('Runtime.evaluate', {
    expression: '(' + BENCH + ')(' + WARMUP + ',' + SAMPLES + ')',
    awaitPromise: true, returnByValue: true, timeout: 240000
  });
  var out = res.result && res.result.result;
  if (!out || !out.value) {
    console.error('[perf] FAIL: 基准脚本未返回结果');
    console.error(JSON.stringify(res).slice(0, 2000));
    ws.close(); proc.kill(); process.exit(5);
  }

  var data = out.value;
  data.browser = ver['Browser'];
  data.node = process.version;
  console.log(JSON.stringify(data, null, 2));
  console.log('\n[perf] 表格');
  console.log(pad('场景') + pad('n') + pad('avg') + pad('p50') + pad('p95') + pad('max'));
  Object.keys(data.scenarios).forEach(function (k) {
    var s = data.scenarios[k];
    if (!s || !s.n) return;
    console.log(pad(k) + pad(s.n) + pad(s.avg) + pad(s.p50) + pad(s.p95) + pad(s.max));
  });
  console.log('\n[perf] 环境: ' + JSON.stringify(data.env));
  console.log('[perf] 缓存: ' + JSON.stringify(data.cache));

  ws.close();
  proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  process.exit(0);
}

function pad(v) { return String(v).padEnd(26, ' '); }

main().catch(function (e) {
  console.error('[perf] 异常: ' + (e && e.stack || e));
  process.exit(1);
});
