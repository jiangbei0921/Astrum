/* ASTRUM · CSP 拦截 / CORS / 断网 三类失败的回归测试
 *
 * 背景：浏览器把这三种失败都报成同一个 TypeError: Failed to fetch，
 * 但应对方式完全不同。曾经把「宿主 CSP 限制」显示成「网络不可达或被
 * CORS 拦截（可填写自建代理地址）」，把人引去搭一个根本不需要的代理。
 *
 * 本工具用一个临时本地服务**注入 CSP 响应头**，复现该场景并断言：
 *   ① 注入 CSP 后必须报「被当前页面的 CSP 拦截」，而不是 CORS/网络
 *   ② 不注入 CSP 时不得误报为 CSP
 *
 * 用法：node tools/csptest.js
 */
'use strict';

var http = require('http');
var fs = require('fs');
var path = require('path');
var execFile = require('child_process').execFile;

var ROOT = path.resolve(__dirname, '..');
var CHROME = process.env.CHROME_PATH ||
  'C:/Program Files/Google/Chrome/Application/chrome.exe';

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png'
};

/* 只保留 sources.js 所需的最小环境，避免跑整个应用 */
var PROBE = [
  '<!doctype html><meta charset="utf-8"><body><pre id="o">run</pre>',
  '<script src="data/catalog.js"></script>',
  '<script src="data/knowledge.js"></script>',
  '<script src="data/bodies.js"></script>',
  '<script src="data/places.js"></script>',
  '<script src="core/astro.js"></script>',
  '<script src="core/agents.js"></script>',
  '<script src="core/sources.js"></script>',
  '<script>',
  'var out = [];',
  'Sources.setConfig("zhipu", { key: "test-key" });',
  'Sources.test("zhipu").then(function (r) {',
  '  out.push("TEST|ok=" + r.ok + "|csp=" + !!r.csp + "|" + r.msg);',
  '  return Sources.diagnose();',
  '}).then(function (rows) {',
  '  rows.forEach(function (r) { out.push("ENDP|" + r.name + "|" + (r.ok ? "ok" : "fail") + "|" + r.msg); });',
  '  document.getElementById("o").textContent = "RESULT\\n" + out.join("\\n");',
  '}).catch(function (e) {',
  '  document.getElementById("o").textContent = "RESULT\\nERR|" + e.message;',
  '});',
  '<\/script></body>'
].join('\n');

/* 只含腾讯系域名，完全不含任何大模型/检索端点 —— 用来复现宿主预览面板的限制 */
var STRICT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://*.map.qq.com"
].join('; ');

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

function serve(withCsp) {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var p = decodeURIComponent(req.url.split('?')[0]);
      if (p === '/probe') {
        var h = { 'Content-Type': 'text/html; charset=utf-8' };
        /* 只有场景一注入限制性白名单；场景二必须放开，否则测不出「不误报」 */
        if (withCsp) h['Content-Security-Policy'] = STRICT_CSP;
        res.writeHead(200, h);
        return res.end(PROBE);
      }
      var f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f)) {
        res.writeHead(404); return res.end('nf');
      }
      var headers = { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream' };
      res.writeHead(200, headers);
      fs.createReadStream(f).pipe(res);
    });
    srv.listen(0, '127.0.0.1', function () {
      resolve({ srv: srv, port: srv.address().port });
    });
  });
}

function runChrome(url) {
  return new Promise(function (resolve) {
    execFile(CHROME, [
      '--headless=new', '--disable-gpu', '--virtual-time-budget=12000',
      '--dump-dom', url
    ], { timeout: 60000 }, function (e, so) {
      var m = String(so).match(/RESULT[\s\S]*?(?=<\/pre>)/);
      resolve(m ? m[0].replace(/^RESULT\s*/, '') : '(未取到结果)');
    });
  });
}

function main() {
  if (!fs.existsSync(CHROME)) {
    console.log('SKIP | 未找到 Chrome，跳过浏览器侧验证（设 CHROME_PATH 环境变量可指定）');
    process.exit(0);
  }

  var blocked;
  serve(true).then(function (o) {
    blocked = o;
    console.log('--- 场景一：注入 connect-src 白名单（不含数据源）---');
    return runChrome('http://127.0.0.1:' + o.port + '/probe');
  }).then(function (txt) {
    var testLine = txt.split('\n').filter(function (l) { return l.indexOf('TEST|') === 0; })[0] || '';
    ok('失败时标记 csp=true', /csp=true/.test(testLine), testLine.slice(0, 90));
    ok('文案指向 CSP 而非 CORS', /被当前页面的 CSP 拦截/.test(testLine));
    ok('文案指出被拦的域名', /open\.bigmodel\.cn/.test(testLine), testLine.slice(0, 110));
    ok('文案给出可操作指引', /独立浏览器标签/.test(testLine));

    var eps = txt.split('\n').filter(function (l) { return l.indexOf('ENDP|') === 0; });
    ok('检索端点也按 CSP 分类', eps.length > 0 &&
      eps.every(function (l) { return /被当前页面的 CSP 拦截/.test(l); }),
      eps.length + ' 个端点');

    return new Promise(function (r) { blocked.srv.close(); r(); });
  }).then(function () {
    return serve(false);
  }).then(function (o) {
    console.log('--- 场景二：正常环境（未注入限制性 CSP）---');
    return runChrome('http://127.0.0.1:' + o.port + '/probe').then(function (txt) {
      var testLine = txt.split('\n').filter(function (l) { return l.indexOf('TEST|') === 0; })[0] || '';
      ok('正常环境不误报为 CSP', !/CSP 拦截/.test(testLine), testLine.slice(0, 90));
      o.srv.close();
    });
  }).then(function () {
    console.log('');
    console.log('RESULT ' + pass + '/' + (pass + fail));
    process.exit(fail === 0 ? 0 : 1);
  }).catch(function (e) {
    console.log('FAIL | 运行异常 | ' + (e && e.message));
    process.exit(1);
  });
}

main();
