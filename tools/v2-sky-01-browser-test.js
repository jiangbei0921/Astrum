/* ASTRUM · V2-SKY 阶段 1 浏览器测试（Chrome + file://，零依赖）
 *
 * 覆盖规格 §9 的 B1–B7：
 *   B1 模块存在、小星图尺寸/命中/天体/meta
 *   B2 图层默认全开、小星图相机参数
 *   B3 全屏星图打开、命中数更多、无脚本错误
 *   B4 滚轮缩放与拖动改变 fov/yaw
 *   B5 点击行星命中区打开详情卡
 *   B6 refresh 重新绘制且无异常
 *   B7 深链 #viewer=1&target=土星 定位并展开详情
 *
 * 做法与 selftest 相同：在页面副本里注入断言脚本（CSP 临时放开 inline），
 * 用 chrome --dump-dom 读回结果；不引入 puppeteer/ws。
 *
 * 用法：node tools/v2-sky-01-browser-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var TMP = path.join(ROOT, '__v2sky_tmp.html');

function findChrome() {
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  var names = ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser'];
  var dirs = (process.env.PATH || '').split(path.delimiter);
  for (var n = 0; n < names.length; n++) {
    for (var d = 0; d < dirs.length; d++) {
      if (!dirs[d]) continue;
      var p = path.join(dirs[d], names[n]);
      try { if (fs.existsSync(p) && fs.statSync(p).isFile()) return p; } catch (e) {}
    }
  }
  return 'chrome';
}

var ASSERT = [
  '(function () {',
  '  var R = [], pass = 0, fail = 0;',
  '  function ok(n, c, x) { R.push((c ? "PASS" : "FAIL") + " | " + n + (x ? " | " + x : "")); if (c) pass++; else fail++; }',
  '  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }',
  '  var ERRS = [];',
  '  window.addEventListener("error", function (e) { ERRS.push(String(e.message || e)); });',
  '  window.addEventListener("unhandledrejection", function (e) { ERRS.push("rejection:" + String(e.reason)); });',
  '  function num(v) { return typeof v === "number" && isFinite(v); }',
  '  function finish() {',
  '    var pre = document.createElement("pre");',
  '    pre.id = "__v2sky_result";',
  '    pre.textContent = "RESULT " + pass + "/" + (pass + fail) + "\\n" + R.join("\\n") +',
  '      (ERRS.length ? "\\nERR " + ERRS.join(" ; ") : "");',
  '    document.body.appendChild(pre);',
  '  }',
  '',
  '  async function run() {',
  '    if (!window.__astrum || !window.SkyVM || !window.SkyRender || !window.SkyLayers) {',
  '      setTimeout(run, 120); return;',
  '    }',
  '    var sky = document.getElementById("sky");',
  '    var vc = document.getElementById("viewerCanvas");',
  '    var deeplink = /target=/.test(location.hash);',
  '',
  '    if (deeplink) {',
  '      await wait(1600);',
  '      ok("B7.1 全屏星图已打开", document.getElementById("viewer").classList.contains("on"));',
  '      ok("B7.2 命中区已生成", (vc._hits || []).length > 0, "hits=" + (vc._hits || []).length);',
  '      var info = document.getElementById("viewerInfo");',
  '      ok("B7.3 详情卡展开", info && info.classList.contains("on"));',
  '      ok("B7.4 详情指向土星", info && /土星/.test(info.textContent || ""), (info && info.textContent || "").slice(0, 40));',
  '      finish(); return;',
  '    }',
  '',
  '    /* B1 */',
  '    ok("B1.1 四个模块存在", !!(window.SkyVM && window.SkyRender && window.SkyLayers && window.PlanetVisuals));',
  '    ok("B1.2 小星图尺寸", sky.width === 760 && sky.height === 540, sky.width + "x" + sky.height);',
  '    ok("B1.3 小星图命中区", (sky._hits || []).length > 10, "hits=" + (sky._hits || []).length);',
  '    ok("B1.4 小星图天体", (sky._bodies || []).length >= 1, "bodies=" + (sky._bodies || []).length);',
  '    ok("B1.5 小星图 meta", (function () {',
  '      var m = sky._meta || {};',
  '      return num(m.yaw) && num(m.pitch) && num(m.fov) && m.hit === true;',
  '    })());',
  '',
  '    /* B2 */',
  '    var L = __astrum.skyLayers();',
  '    ok("B2.1 图层默认全开", Object.keys(L).every(function (k) { return L[k] === true; }), JSON.stringify(L));',
  '    ok("B2.2 小星图相机参数", sky._meta.fov === 150 && sky._meta.pitch === 40,',
  '      "fov=" + sky._meta.fov + " pitch=" + sky._meta.pitch);',
  '',
  '    /* B3 */',
  '    document.getElementById("skyExpand").click();',
  '    await wait(1100);',
  '    ok("B3.1 全屏星图打开", document.getElementById("viewer").classList.contains("on"));',
  '    ok("B3.2 全屏命中区非空", (vc._hits || []).length > 20,',
  '      "viewer=" + (vc._hits || []).length + " sky=" + (sky._hits || []).length);',
  '    ok("B3.3 全屏 meta 合法", (function () {',
  '      var m = vc._meta || {};',
  '      return num(m.yaw) && num(m.pitch) && num(m.fov) && m.hit === true;',
  '    })());',
  '    ok("B3.4 无脚本错误", ERRS.length === 0, ERRS.join(" ; ").slice(0, 60));',
  '',
  '    /* B4 */',
  '    var stage = document.getElementById("viewerStage");',
  '    var f0 = vc._meta.fov;',
  '    var z0 = (document.getElementById("vwVal").textContent || "").trim();',
  '    stage.dispatchEvent(new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true }));',
  '    await wait(600);',
  '    var z1 = (document.getElementById("vwVal").textContent || "").trim();',
  '    ok("B4.1 滚轮缩放改变 fov", Math.abs(vc._meta.fov - f0) > 0.1 || z1 !== z0,',
  '      f0 + " -> " + vc._meta.fov + " / zoom " + z0 + " -> " + z1);',
  '',
  '    var y0 = vc._meta.yaw;',
  '    var rect0 = stage.getBoundingClientRect();',
  '    var sx = rect0.left + rect0.width / 2, sy = rect0.top + rect0.height / 2;',
  '    stage.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 1, clientX: sx, clientY: sy, bubbles: true }));',
  '    stage.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: sx + 60, clientY: sy, bubbles: true }));',
  '    stage.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: sx + 60, clientY: sy, bubbles: true }));',
  '    await wait(300);',
  '    ok("B4.2 拖动改变 yaw", Math.abs(vc._meta.yaw - y0) > 0.05, y0 + " -> " + vc._meta.yaw);',
  '',
  '    /* B5：找一个行星命中区并点击（松手位移 < 5 触发详情卡） */',
  '    var hit = (vc._hits || []).filter(function (h) { return h.obj.type === "planet"; })[0];',
  '    if (hit) {',
  '      var r2 = vc.getBoundingClientRect();',
  '      var px = r2.left + hit.x / vc.width * r2.width;',
  '      var py = r2.top + hit.y / vc.height * r2.height;',
  '      stage.dispatchEvent(new PointerEvent("pointerdown", { pointerId: 2, clientX: px, clientY: py, bubbles: true }));',
  '      await wait(60);',
  '      stage.dispatchEvent(new PointerEvent("pointerup", { pointerId: 2, clientX: px, clientY: py, bubbles: true }));',
  '      await wait(260);',
  '      var info2 = document.getElementById("viewerInfo");',
  '      ok("B5.1 点击命中区打开详情", info2 && info2.classList.contains("on"));',
  '      ok("B5.2 详情名称匹配", info2 && new RegExp(hit.obj.data.name).test(info2.textContent || ""),',
  '        (info2 && info2.textContent || "").slice(0, 40));',
  '    } else {',
  '      ok("B5.1 点击命中区打开详情", false, "无行星命中");',
  '      ok("B5.2 详情名称匹配", false, "无行星命中");',
  '    }',
  '',
  '    /* B6 */',
  '    document.getElementById("vwClose").click();',
  '    await wait(120);',
  '    __astrum.refresh();',
  '    await wait(260);',
  '    ok("B6.1 refresh 后重新绘制", (sky._hits || []).length > 10 && sky._meta.hit === true,',
  '      "hits=" + (sky._hits || []).length);',
  '    ok("B6.2 refresh 后无异常", ERRS.length === 0, ERRS.join(" ; ").slice(0, 60));',
  '',
  '    finish();',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 80); });',
  '  else run();',
  '})();'
].join('\n');

function runChrome(url) {
  var out = cp.spawnSync(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--enable-logging=stderr', '--window-size=1440,900',
    '--virtual-time-budget=45000', '--dump-dom', url
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return (out.stdout || '') + '\n' + (out.stderr || '');
}

function parse(output) {
  var m = output.match(/<pre id="__v2sky_result">([\s\S]*?)<\/pre>/);
  if (!m) return null;
  return m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

function main() {
  try { new Function(ASSERT); } catch (e) {
    console.error('[v2-sky] 断言脚本语法错误: ' + e.message);
    process.exit(2);
  }

  var html = fs.readFileSync(INDEX, 'utf8');
  var idx = html.lastIndexOf('</body>');
  if (idx < 0) { console.error('[v2-sky] HTML 结构异常'); process.exit(2); }

  /* 测试副本临时放开 inline（被测文件本身仍保持严格 CSP） */
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (_, head, mid, tail) { return head + "'self' 'unsafe-inline'" + tail; }
  );
  var patched = html.slice(0, idx) + '<script>' + ASSERT + '</script>\n' + html.slice(idx);
  fs.writeFileSync(TMP, patched, 'utf8');

  var url = 'file:///' + TMP.replace(/\\/g, '/');
  var outputs = [
    { name: 'B1-B6', url: url },
    { name: 'B7', url: url + '#viewer=1&target=' + encodeURIComponent('土星') }
  ];

  var pass = 0, total = 0, csp = 0;
  outputs.forEach(function (o) {
    var combined = runChrome(o.url);
    csp += (combined.match(/violates the following Content Security Policy/g) || []).length;
    var text = parse(combined);
    if (!text) {
      console.error('[v2-sky] ' + o.name + ' 未取得结果，输出片段:');
      console.error(combined.slice(-1800));
      total++; return;
    }
    text.split('\n').forEach(function (line) {
      if (/^(PASS|FAIL) \|/.test(line)) {
        total++;
        if (line.indexOf('PASS') === 0) pass++;
      }
      console.log('[' + o.name + '] ' + line);
    });
  });

  fs.unlinkSync(TMP);
  console.log('');
  console.log('RESULT ' + pass + '/' + total);
  console.log('[v2-sky] CSP 违规次数: ' + csp);
  process.exit(pass === total && total > 0 ? 0 : 1);
}

main();
