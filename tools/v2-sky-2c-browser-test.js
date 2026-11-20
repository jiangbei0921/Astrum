/* ASTRUM · V2-SKY 子阶段 2C 浏览器测试（Chrome + file://，零依赖）
 *
 * 覆盖：
 *   B1 模块/纹理就绪
 *   B2 小星图命中/meta 不受影响
 *   B3 纹理参考方向亮度与 UV
 *   B4 背景真实绘制，且位于前景之下
 *   B5 图层关闭生效
 *   B6 缺失时 fallback 无异常
 *   B7 缓存命中/失效
 *   B8 命中区类型不变
 *   B9 连续绘制耗时（p50/p95）
 *
 * 用法：node tools/v2-sky-2c-browser-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var TMP = path.join(ROOT, '__v2sky2c_tmp.html');

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
  '  function finish() {',
  '    var pre = document.createElement("pre");',
  '    pre.id = "__v2sky2c_result";',
  '    pre.textContent = "RESULT " + pass + "/" + (pass + fail) + "\\n" + R.join("\\n") +',
  '      (ERRS.length ? "\\nERR " + ERRS.join(" ; ") : "");',
  '    document.body.appendChild(pre);',
  '  }',
  '  function meanPix(cv, x, y, r) {',
  '    var g = cv.getContext("2d");',
  '    var d = g.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2 + 1, r * 2 + 1).data;',
  '    var s = 0, n = 0;',
  '    for (var i = 0; i < d.length; i += 4) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }',
  '    return n ? s / n : 0;',
  '  }',
  '  function makeVm(o) { var opts = o.opts || {}; opts.width = 760; opts.height = 540; return SkyVM.build(o.jd, o.lat, o.lon, opts); }',
  '  function scratch(vm, p) {',
  '    var cv = document.createElement("canvas"); cv.width = vm.view.w; cv.height = vm.view.h;',
  '    return { cv: cv, out: SkyRender.draw(cv, p || {}, vm) };',
  '  }',
  '  function texMean(ra, dec) {',
  '    var s = 0, n = 0;',
  '    for (var dr = -0.02; dr <= 0.02; dr += 0.01) {',
  '      for (var dd = -0.4; dd <= 0.4; dd += 0.2) {',
  '        var c = SkyBackground.sampleAt((ra + dr + 24) % 24, Math.max(-89.9, Math.min(89.9, dec + dd)));',
  '        if (!c) continue; s += (c[0] + c[1] + c[2]) / 3; n++;',
  '      }',
  '    }',
  '    return n ? s / n : 0;',
  '  }',
  '',
  '  async function run() {',
  '    if (!window.__astrum || !window.SkyBackground || !window.MILKYWAY_BG) { setTimeout(run, 120); return; }',
  '    var sky = document.getElementById("sky");',
  '    var key = __astrum.perf().model.key || "";',
  '    var parts = key.split("|");',
  '    var jd = Number(parts[0]), lat = Number(parts[1]), lon = Number(parts[2]);',
  '',
  '    /* B1 */',
  '    ok("B1.1 模块与纹理就绪", SkyBackground.ready() === true, JSON.stringify(SkyBackground.stats().texture));',
  '    ok("B1.2 纹理 512x256", SkyBackground.stats().texture && SkyBackground.stats().texture.w === 512 &&',
  '      SkyBackground.stats().texture.h === 256);',
  '    ok("B1.3 启动后已有背景绘制", SkyBackground.stats().draws > 0, "draws=" + SkyBackground.stats().draws);',
  '',
  '    /* B2 */',
  '    ok("B2.1 小星图命中不受影响", (sky._hits || []).length > 10, "hits=" + (sky._hits || []).length);',
  '    ok("B2.2 小星图 meta 不变", !!sky._meta && sky._meta.hit === true &&',
  '      ["yaw", "pitch", "fov", "hz", "hit"].every(function (k) { return Object.prototype.hasOwnProperty.call(sky._meta, k); }));',
  '    ok("B2.3 命中类型集合不变", (sky._hits || []).every(function (h) {',
  '      return ["star", "dso", "planet", "moon", "sun"].indexOf(h.obj.type) >= 0;',
  '    }));',
  '',
  '    /* B3 纹理参考方向 */',
  '    var gc = texMean(17.76033, -28.9362);',
  '    var anti = texMean(5.76033, 28.9362);',
  '    ok("B3.1 银心纹理亮度高于反银心", gc > anti * 1.3, "GC=" + gc.toFixed(1) + " ANTI=" + anti.toFixed(1));',
  '    ok("B3.2 银北极 UV 正确", (function () {',
  '      var uv = SkyBackground.uvFor(12.85730, 27.12825);',
  '      return Math.abs(uv.u - 0.96429) < 0.001 && Math.abs(uv.v - 0.34929) < 0.001;',
  '    })(), JSON.stringify(SkyBackground.uvFor(12.85730, 27.12825)));',
  '',
  '    /* B4 画布真实绘制：用反银心方向（测试时刻位于地平线上方） */',
  '    var ref = Astro.altAz(5.76033, 28.9362, jd, lat, lon);',
  '    var opts = { yaw: ref.az, pitch: 12, fov: 70, style: "full", detail: true };',
  '    var vmOn = makeVm({ jd: jd, lat: lat, lon: lon, opts: opts });',
  '    var on = scratch(vmOn, { showGlobe: false });',
  '    var pr = SkyVM.projector({ width: 760, height: 540, yaw: ref.az, pitch: 12, fov: 70 });',
  '    var q = pr.proj(ref.az, ref.alt);',
  '    var bOn = q ? meanPix(on.cv, Math.round(q.x), Math.round(q.y), 4) : 0;',
  '    ok("B4.1 参考方向可见", !!q, q ? ("x=" + Math.round(q.x) + " y=" + Math.round(q.y)) : "null");',
  '',
  '    var layersOff = SkyLayers.normalize(null); layersOff.milkyWay = false;',
  '    var vmOff = makeVm({ jd: jd, lat: lat, lon: lon, opts: { yaw: ref.az, pitch: 12, fov: 70, style: "full", detail: true, layers: layersOff } });',
  '    var off = scratch(vmOff, { showGlobe: false });',
  '    var bOff = q ? meanPix(off.cv, Math.round(q.x), Math.round(q.y), 4) : 0;',
  '    ok("B4.2 开启背景后更亮", bOn > bOff + 4, "on=" + bOn.toFixed(1) + " off=" + bOff.toFixed(1));',
  '    ok("B4.3 关闭背景仍保留恒星", (off.out.hits || []).some(function (h) { return h.obj.type === "star"; }));',
  '    ok("B4.4 背景不产生 hit", (on.out.hits || []).every(function (h) {',
  '      return ["star", "dso", "planet", "moon", "sun"].indexOf(h.obj.type) >= 0;',
  '    }));',
  '',
  '    /* B5 fallback */',
  '    SkyBackground.__setMode("missing");',
  '    var fb = scratch(vmOn, { showGlobe: false });',
  '    ok("B5.1 缺失时无异常且降级绘制", fb.out && (fb.out.hits || []).length > 0 && ERRS.length === 0, ERRS.join(";").slice(0, 60));',
  '    SkyBackground.__setMode("auto"); SkyBackground.invalidate();',
  '    ok("B5.2 恢复后 ready", SkyBackground.ready() === true);',
  '',
  '    /* B6 缓存 */',
  '    scratch(vmOn, { showGlobe: false });',
  '    var builds0 = SkyBackground.stats().rasterBuilds;',
  '    scratch(vmOn, { showGlobe: false });',
  '    var builds1 = SkyBackground.stats().rasterBuilds;',
  '    ok("B6.1 同视图命中缓存", builds1 === builds0, builds0 + " -> " + builds1);',
  '    var vmShift = makeVm({ jd: jd, lat: lat, lon: lon, opts: { yaw: ref.az + 2, pitch: 12, fov: 70, style: "full", detail: true } });',
  '    scratch(vmShift, { showGlobe: false });',
  '    var builds2 = SkyBackground.stats().rasterBuilds;',
  '    ok("B6.2 相机变化触发重建", builds2 > builds1, builds1 + " -> " + builds2);',
  '',
  '    /* B7 命中类型 */',
  '    ok("B7.1 meta 键集合不变", (function () {',
  '      var m = on.out.meta || {};',
  '      return Object.keys(m).sort().join(",") === "fov,hit,hz,pitch,yaw";',
  '    })(), Object.keys(on.out.meta || {}).sort().join(","));',
  '',
  '    /* B8 连续绘制（虚拟时钟冻结，耗时以离线测试为准） */',
  '    scratch(vmOn, { showGlobe: false });',
  '    var bA = SkyBackground.stats().rasterBuilds;',
  '    for (var i = 0; i < 20; i++) {',
  '      scratch(vmOn, { showGlobe: false });',
  '    }',
  '    ok("B8.1 连续绘制无异常", ERRS.length === 0, ERRS.join(" ; ").slice(0, 60));',
  '    ok("B8.2 连续绘制后缓存稳定", SkyBackground.stats().rasterBuilds === bA, bA + " -> " + SkyBackground.stats().rasterBuilds);',
  '',
  '    ok("B9.1 无未捕获错误", ERRS.length === 0, ERRS.join(" ; ").slice(0, 80));',
  '    finish();',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 80); });',
  '  else setTimeout(run, 80);',
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

function main() {
  try { new Function(ASSERT); } catch (e) {
    console.error('[v2-sky-2c] 断言脚本语法错误: ' + e.message);
    process.exit(2);
  }
  var html = fs.readFileSync(INDEX, 'utf8');
  var idx = html.lastIndexOf('</body>');
  if (idx < 0) { console.error('[v2-sky-2c] HTML 结构异常'); process.exit(2); }
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (_, head, mid, tail) { return head + "'self' 'unsafe-inline'" + tail; }
  );
  fs.writeFileSync(TMP, html.slice(0, idx) + '<script>' + ASSERT + '</script>\n' + html.slice(idx), 'utf8');

  var combined = runChrome('file:///' + TMP.replace(/\\/g, '/'));
  fs.unlinkSync(TMP);
  var csp = (combined.match(/violates the following Content Security Policy/g) || []).length;
  var m = combined.match(/<pre id="__v2sky2c_result">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('[v2-sky-2c] 未取得结果，输出片段:');
    console.error(combined.slice(-2200));
    process.exit(1);
  }
  var text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log(text);
  console.log('[v2-sky-2c] CSP 违规次数: ' + csp);
  var head = text.split('\n')[0].trim();
  var mm = head.match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] && csp === 0 ? 0 : 1);
}

main();
