/* ASTRUM · V1.4 GitHub Pages 本地等价验收
 *
 * 覆盖：
 *   1) `tools/build-pages.js` 生成白名单发布目录；
 *   2) 无 tools/docs/dev/worker、无密钥、无绝对路径、无大小写不一致；
 *   3) 以 `/Astrum/` 子路径启动本地 HTTP 服务，逐文件验证 200/404 与 MIME；
 *   4) Chrome 通过真实 HTTP 加载发布目录，验证 13 个 Agent、控制层模块与 CSP。
 *
 * 明确不是 GitHub Pages 线上验证：线上验收需要远端部署授权，见 V1.4 线上验证报告。
 *
 * 用法：node tools/v1-4-pages-test.js
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var http = require('http');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, '_site');
var PREFIX = '/Astrum/';
var TIMEOUT = 120000;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

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

function mimeOf(rel) {
  if (/\.html$/.test(rel)) return 'text/html; charset=utf-8';
  if (/\.css$/.test(rel)) return 'text/css; charset=utf-8';
  if (/\.js$/.test(rel)) return 'text/javascript; charset=utf-8';
  if (/\.json$/.test(rel)) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

function request(port, urlPath, timeout) {
  return new Promise(function (resolve) {
    var req = http.get({ host: '127.0.0.1', port: port, path: urlPath, timeout: timeout || 8000 }, function (res) {
      var body = '';
      res.setEncoding('utf8');
      res.on('data', function (d) { body += d; });
      res.on('end', function () { resolve({ status: res.statusCode, type: res.headers['content-type'] || '', body: body }); });
    });
    req.on('timeout', function () { req.destroy(); resolve({ status: 0, type: '', body: '' }); });
    req.on('error', function () { resolve({ status: 0, type: '', body: '' }); });
  });
}

function startServer(probe) {
  var server = http.createServer(function (req, res) {
    var pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch (e) { res.writeHead(400); res.end('bad request'); return; }

    if (pathname === '/') { res.writeHead(404); res.end('root is not the app'); return; }
    if (pathname === PREFIX || pathname === PREFIX.slice(0, -1)) pathname = PREFIX + 'index.html';
    if (pathname === PREFIX + '__pages_probe.html') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      res.end(probe);
      return;
    }
    if (pathname.indexOf(PREFIX) !== 0) { res.writeHead(404); res.end('outside prefix'); return; }

    var rel = pathname.slice(PREFIX.length);
    if (!rel || rel.indexOf('..') >= 0 || rel.indexOf('\\') >= 0 || rel.indexOf('/') === 0) {
      res.writeHead(404); res.end('bad path'); return;
    }
    var full = path.join(OUT, rel);
    var stat;
    try { stat = fs.statSync(full); } catch (e) { res.writeHead(404); res.end('not found'); return; }
    if (!stat.isFile()) { res.writeHead(404); res.end('not a file'); return; }

    res.writeHead(200, { 'content-type': mimeOf(rel), 'cache-control': 'no-store' });
    fs.createReadStream(full).pipe(res);
  });
  return server;
}

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

function launch(profile, url) {
  var args = [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-extensions',
    '--no-first-run', '--disable-background-networking',
    '--user-data-dir=' + profile, '--remote-debugging-port=0', url
  ];
  return cp.spawn(findChrome(), args, { stdio: ['ignore', 'ignore', 'pipe'] });
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
  this.handlers = {};
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
      return;
    }
    if (msg.method && self.handlers[msg.method]) self.handlers[msg.method].forEach(function (fn) { fn(msg.params || {}); });
  });
  ws.addEventListener('close', function () { self.closed = true; });
}
Cdp.prototype.on = function (method, fn) { (this.handlers[method] = this.handlers[method] || []).push(fn); };
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
  return this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, ms)
    .then(function (r) { return { value: r.result && r.result.value, exception: r.exceptionDetails ? r.exceptionDetails.text : null }; });
};
Cdp.prototype.close = function () { try { this.ws.close(); } catch (e) {} };

async function kill(child, pid) {
  try {
    if (process.platform === 'win32') cp.execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGKILL');
  } catch (e) {}
}

/* 用 CDP 而不是 --dump-dom：dump-dom 在 HTTP 页面上会等待网络空闲，
   而应用的时钟/动画让 Chrome 迟迟不退出；CDP 可以精确等待某个 DOM 条件后关闭。 */
async function browserCheck(port, pagePath, expr, want) {
  var profile = path.join(os.tmpdir(), 'astrum_pages_' + process.pid + '_' + Date.now());
  fs.mkdirSync(profile, { recursive: true });
  var child = launch(profile, 'http://127.0.0.1:' + port + PREFIX + pagePath);
  var cdp = null, problems = [], value = null, initMs = null;

  try {
    var devPort = await readPort(profile, 20000);
    if (!devPort) throw new Error('Chrome 未启动 DevToolsActivePort');
    var page = await findPage(devPort);
    if (!page) throw new Error('未找到页面目标');
    cdp = new Cdp(new WebSocket(page.webSocketDebuggerUrl));
    await cdp.send('Runtime.enable', {}, 5000);
    await cdp.send('Log.enable', {}, 5000);
    cdp.on('Log.entryAdded', function (p) {
      if (p.entry && p.entry.level === 'error') {
        problems.push(String(p.entry.url || '') + ' ' + String(p.entry.text || ''));
      }
    });
    cdp.on('Runtime.exceptionThrown', function (p) {
      problems.push('Uncaught: ' + String((p.exceptionDetails && p.exceptionDetails.text) || ''));
    });
    var t0 = Date.now();
    while (Date.now() - t0 < 20000) {
      var r = await cdp.evaluate(expr, 5000);
      if (r.exception) throw new Error(r.exception);
      if (typeof r.value === 'number' ? r.value >= want : (typeof r.value === 'string' && r.value.indexOf(want) >= 0)) {
        value = r.value;
        break;
      }
      await sleep(200);
    }
    var perf = await cdp.evaluate('performance.now()', 3000);
    if (typeof perf.value === 'number') initMs = Math.round(perf.value);
  } finally {
    if (cdp) cdp.close();
    await kill(child, child.pid);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}
  }
  return { value: value, problems: problems, initMs: initMs };
}

function dirSize(dir) {
  var n = 0;
  fs.readdirSync(dir, { withFileTypes: true }).forEach(function (e) {
    var full = path.join(dir, e.name);
    if (e.isDirectory()) n += dirSize(full);
    else n += fs.statSync(full).size;
  });
  return n;
}

function bodyText(file) { return fs.readFileSync(path.join(OUT, file), 'utf8'); }

(async function main() {
  var buildLog = '';
  await runCase('S0', '发布目录构建', function () {
    var r = cp.spawnSync(process.execPath, ['tools/build-pages.js'], { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    buildLog = (r.stdout || '') + (r.stderr || '');
    ok('S0.1 构建退出码 0', r.status === 0, 'status=' + r.status);
    ok('S0.2 输出体积/版本摘要', /Pages 发布目录构建完成/.test(buildLog) && /版本: V1\.4/.test(buildLog),
      buildLog.split('\n').filter(Boolean).slice(-3).join(' | '));
    ok('S0.3 安全扫描通过', /密钥 0，本地绝对路径 0/.test(buildLog), '');
  });

  var files = fs.readdirSync(OUT).sort();
  var index = bodyText('index.html');
  var refs = [];
  var re = /<script[^>]*\ssrc="([^"]+)"[^>]*><\/script>/g, m;
  while ((m = re.exec(index))) refs.push(m[1]);
  var css = (index.match(/<link\s+rel="stylesheet"\s+href="([^"]+)"/) || [])[1] || '';
  var refsAll = refs.concat(css ? [css] : []);
  var version = JSON.parse(bodyText('version.json'));

  await runCase('S1', '发布目录白名单', function () {
    ok('S1.1 顶层只有运行文件', JSON.stringify(files) === JSON.stringify(
      ['.nojekyll', 'assets', 'core', 'data', 'index.html', 'privacy.html', 'version.json'].sort()
    ), JSON.stringify(files));
    ok('S1.2 无 tools/docs/dev/worker', ['tools', 'docs', 'dev', 'worker'].every(function (d) { return !fs.existsSync(path.join(OUT, d)); }));
    ok('S1.3 无 standalone 产物', !fs.existsSync(path.join(OUT, 'astrum-standalone.html')));
    ok('S1.4 入口与隐私页存在', fs.existsSync(path.join(OUT, 'index.html')) && fs.existsSync(path.join(OUT, 'privacy.html')));
    ok('S1.5 模块数量完整', refs.length >= 50 && fs.readdirSync(path.join(OUT, 'core')).length >= 41,
      'scripts=' + refs.length + ' core=' + fs.readdirSync(path.join(OUT, 'core')).length);
  });

  await runCase('S2', '资源路径与子路径兼容', function () {
    ok('S2.1 无绝对/外链资源', refsAll.every(function (s) { return !/^\/|^[A-Za-z]:\\|^https?:/.test(s); }));
    ok('S2.2 无 base 元素', !/<base\s/i.test(index));
    ok('S2.3 所有引用存在', refsAll.every(function (s) { return fs.existsSync(path.join(OUT, s)); }));
    ok('S2.4 CSS 相对路径', css === 'assets/app.css', css);
    ok('S2.5 隐私页相对返回', /href="\.\/"/.test(bodyText('privacy.html')));
  });

  await runCase('S3', '版本与资源预算', function () {
    ok('S3.1 版本字段完整', version.releaseVersion === 'V1.4' && !!version.appVersion &&
      !!version.buildTime && !!version.buildMode && !!version.deployEnv,
      JSON.stringify(version).slice(0, 160));
    ok('S3.2 commit 标识存在', typeof version.commit === 'string' && version.commit.length >= 7,
      version.commitShort + ' dirty=' + String(version.dirty));
    ok('S3.3 脏工作区如实记录', version.dirty === true || version.dirty === false, 'dirty=' + String(version.dirty));
    var bytes = dirSize(OUT);
    ok('S3.4 发布体积在预算内', bytes > 1000 * 1000 && bytes < 4 * 1024 * 1024, bytes + ' B');
  });

  await runCase('H1', '本地 /Astrum/ 子路径 HTTP 与 Chrome', function () {
    var probe = '<!doctype html><html><head><meta charset="utf-8"><base href="' + PREFIX + '"></head><body>' +
      refs.filter(function (r) { return r !== 'core/app.js'; }).map(function (r) {
        return '<script src="' + r + '"></script>';
      }).join('') +
      '<script>(function(){var need=' + JSON.stringify([
        'CATALOG', 'KNOWLEDGE', 'AgentCore', 'Sources', 'AstroRuntime', 'AstroTask', 'AstroEvidence',
        'AstroClaims', 'AstroFits', 'Simbad', 'AstroRouter', 'AstroPlanner', 'AstroReducer',
        'AstroReport', 'AstroRegistry', 'AstroComposeAdapter', 'AstroTaskStore', 'AstroOrchestrator',
        'AstroControl', 'AstroRequest', 'AstroControlBridge', 'AstroAttachmentEvidence',
        'AstroPdfText', 'AstroPaperFulltext', 'AstroResearchUI'
      ]) + ';var missing=need.filter(function(k){return !window[k];});' +
      'var el=document.createElement("pre");el.id="__pages_probe";' +
      'el.textContent=(missing.length?"PROBE FAIL "+missing.join(","):"PROBE PASS "+need.length);' +
      'document.body.appendChild(el);})();</script></body></html>';

    var server = startServer(probe);
    var port = 0;
    var checks = {};
    return new Promise(function (resolve) {
      server.listen(0, '127.0.0.1', function () { port = server.address().port; resolve(); });
    }).then(async function () {
      checks.base = await request(port, PREFIX);
      checks.root = await request(port, '/');
      checks.style = await request(port, PREFIX + 'assets/app.css');
      checks.privacy = await request(port, PREFIX + 'privacy.html');
      checks.nojekyll = await request(port, PREFIX + '.nojekyll');
      checks.version = await request(port, PREFIX + 'version.json');
      checks.tools = await request(port, PREFIX + 'tools/build-pages.js');
      checks.docs = await request(port, PREFIX + 'docs/README.md');
      checks.dev = await request(port, PREFIX + 'dev/p0-03-capture.js');

      var allOk = true;
      for (var i = 0; i < refsAll.length; i++) {
        checks[refsAll[i]] = await request(port, PREFIX + refsAll[i]);
        if (checks[refsAll[i]].status !== 200) allOk = false;
      }

      var probeRun = await browserCheck(port, '__pages_probe.html',
        "(document.getElementById('__pages_probe')||{}).textContent||''", 'PROBE PASS');
      var pageRun = await browserCheck(port, 'index.html',
        "document.querySelectorAll('#agentList .agent').length", 13);
      /* favicon.ico 是 Chrome 在部分情况下补请求的默认资源，站点用 data URI 图标；
         GitHub Pages 上同样会 404，不属于关键错误。 */
      var badLog = probeRun.problems.concat(pageRun.problems).filter(function (p) {
        return /Failed to load resource|net::ERR_|Uncaught|Refused to|Content Security Policy|CSP/i.test(p) &&
          !/favicon\.ico/i.test(p) &&
          /* Chrome 会提示 meta 里的 frame-ancestors 无效（它确实只支持 HTTP 头）。
           * 这是浏览器规范提示，不是当前页面被拦截；不能因此判 CSP 失败。 */
          !/frame-ancestors.*ignored when delivered via a <meta>/i.test(p);
      });

      ok('H1.1 首页 200 且为 HTML', checks.base.status === 200 && /text\/html/.test(checks.base.type) && checks.base.body.indexOf('ASTRUM') >= 0, 'status=' + checks.base.status);
      ok('H1.2 根路径不冒充站点', checks.root.status === 404, 'status=' + checks.root.status);
      ok('H1.3 CSS 200 且 MIME 正确', checks.style.status === 200 && /text\/css/.test(checks.style.type), 'status=' + checks.style.status);
      ok('H1.4 隐私页 200', checks.privacy.status === 200 && checks.privacy.body.indexOf('隐私') >= 0, 'status=' + checks.privacy.status);
      ok('H1.5 .nojekyll 可访问', checks.nojekyll.status === 200, 'status=' + checks.nojekyll.status);
      ok('H1.6 version.json 可访问', checks.version.status === 200 && /application\/json/.test(checks.version.type), 'status=' + checks.version.status);
      ok('H1.7 tools 不公开', checks.tools.status === 404, 'status=' + checks.tools.status);
      ok('H1.8 docs 不公开', checks.docs.status === 404, 'status=' + checks.docs.status);
      ok('H1.9 dev 不公开', checks.dev.status === 404, 'status=' + checks.dev.status);
      ok('H1.10 全部脚本/样式 200', allOk, refsAll.length + ' 个引用');
      ok('H1.11 脚本 MIME 正确', /text\/javascript/.test(checks[refs[0]].type), refs[0] + ' ' + checks[refs[0]].type);
      ok('H1.12 模块在子路径下全部加载', typeof probeRun.value === 'string' && /^PROBE PASS/.test(probeRun.value), probeRun.value || 'no probe result');
      ok('H1.13 真机页面渲染 13 Agent', typeof pageRun.value === 'number' && pageRun.value >= 13,
        'agents=' + pageRun.value + ' init=' + pageRun.initMs + 'ms');
      ok('H1.14 控制台无加载/CSP 错误', badLog.length === 0, badLog.join(',') || 'none');
      ok('H1.15 全部 HTTP 检查执行', port > 0);
    }).catch(function (e) {
      ok('H1.16 HTTP/Chrome 流程异常', false, String(e && e.message || e).slice(0, 160));
    }).then(function () {
      try {
        if (server.closeAllConnections) server.closeAllConnections();
        server.close();
      } catch (e) {}
    });
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' +
      cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  console.log('MODE LOCAL_HTTP_SUBPATH（非 GitHub Pages 线上验证）');
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-4-pages] 未捕获异常: ' + (e && e.stack || e));
  process.exit(1);
});
