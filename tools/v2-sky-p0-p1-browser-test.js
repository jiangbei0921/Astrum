/* ASTRUM · V2-SKY P0/P1 浏览器测试（Chrome + file://，零依赖）
 *
 * 覆盖：
 *   V1 模块版本与纹理
 *   V2 命中区/meta 语义不变
 *   V3 银河方位：银心方向显著亮于画布平均
 *   V4 亮星光晕：亮星邻域比“抑制光晕”版本更亮
 *   V5 光晕只作用于亮星：暗星邻域无变化
 *   V6 亮星核心在背景上仍清晰
 *   V7 fallback 与图层开关
 *   V8 CSP 与未捕获错误
 *
 * 用法：node tools/v2-sky-p0-p1-browser-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var INDEX = path.join(ROOT, 'index.html');
var TMP = path.join(ROOT, '__v2sky_p0p1_tmp.html');

function findChrome() {
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
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
  '    var pre = document.createElement("pre"); pre.id = "__p0p1_result";',
  '    pre.textContent = "RESULT " + pass + "/" + (pass + fail) + "\\n" + R.join("\\n") +',
  '      (ERRS.length ? "\\nERR " + ERRS.join(" ; ") : "");',
  '    document.body.appendChild(pre);',
  '  }',
  '  function meanBox(cv, x, y, r) {',
  '    var g = cv.getContext("2d");',
  '    var d = g.getImageData(Math.max(0, x - r), Math.max(0, y - r), r * 2 + 1, r * 2 + 1).data;',
  '    var s = 0, n = 0;',
  '    for (var i = 0; i < d.length; i += 4) { s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++; }',
  '    return n ? s / n : 0;',
  '  }',
  '  function meanOutside(cv, ex, ey, er) {',
  '    var g = cv.getContext("2d");',
  '    var d = g.getImageData(0, 0, cv.width, cv.height).data;',
  '    var s = 0, n = 0;',
  '    for (var y = 0; y < cv.height; y += 2) {',
  '      for (var x = 0; x < cv.width; x += 2) {',
  '        if (Math.hypot(x - ex, y - ey) < er) continue;',
  '        var i = (y * cv.width + x) * 4;',
  '        s += (d[i] + d[i + 1] + d[i + 2]) / 3; n++;',
  '      }',
  '    }',
  '    return n ? s / n : 0;',
  '  }',
  '  function build(jd, lat, lon, o) {',
  '    var opts = o || {}; opts.width = 760; opts.height = 540;',
  '    return SkyVM.build(jd, lat, lon, opts);',
  '  }',
  '  function draw(vm) { var cv = document.createElement("canvas"); cv.width = 760; cv.height = 540; SkyRender.draw(cv, { showGlobe: false }, vm); return cv; }',
  '',
  '  async function run() {',
  '    if (!window.__astrum || !window.SkyBackground || !window.MILKYWAY_BG) { setTimeout(run, 120); return; }',
  '    var sky = document.getElementById("sky");',
  '    var key = __astrum.perf().model.key || "";',
  '    var parts = key.split("|"), jd0 = Number(parts[0]), lat = Number(parts[1]), lon = Number(parts[2]);',
  '',
  '    ok("V1.1 背景模块 1.1.0", SkyBackground.version === "1.1.0", SkyBackground.version);',
  '    ok("V1.2 渲染器 1.2.0", SkyRender.version === "1.2.0", SkyRender.version);',
  '    ok("V1.3 纹理 512x256 就绪", SkyBackground.ready() === true && SkyBackground.stats().texture.w === 512 && SkyBackground.stats().texture.h === 256);',
  '',
  '    ok("V2.1 小星图命中不受影响", (sky._hits || []).length > 10, "hits=" + (sky._hits || []).length);',
  '    ok("V2.2 meta 键不变", Object.keys(sky._meta || {}).sort().join(",") === "fov,hit,hz,pitch,yaw");',
  '    ok("V2.3 命中类型不变", (sky._hits || []).every(function (h) {',
  '      return ["star", "dso", "planet", "moon", "sun"].indexOf(h.obj.type) >= 0;',
  '    }));',
  '',
  '    /* V3 银河方位：银心升起时刻，银心方向应显著亮于画布平均 */',
  '    var jdGC = Astro.fromLocal(2026, 6, 1, 21, 30, 8);',
  '    var gc = Astro.altAz(17.76033, -28.9362, jdGC, lat, lon);',
  '    var optsGC = { yaw: gc.az, pitch: Math.max(4, gc.alt - 5), fov: 70, style: "full", detail: true };',
  '    var vmGC = build(jdGC, lat, lon, optsGC);',
  '    var cvGC = draw(vmGC);',
  '    var prj = SkyVM.projector({ width: 760, height: 540, yaw: gc.az, pitch: Math.max(4, gc.alt - 5), fov: 70 });',
  '    var q = prj.proj(gc.az, gc.alt);',
  '    var gcv = q ? meanBox(cvGC, Math.round(q.x), Math.round(q.y), 3) : 0;',
  '    var allv = q ? meanOutside(cvGC, q.x, q.y, 70) : 0;',
  '    ok("V3.1 银心方向可见", !!q, q ? ("x=" + Math.round(q.x) + " y=" + Math.round(q.y)) : "null");',
  '    ok("V3.2 银心显著亮于画布其余区域", gcv > allv * 1.4 && gcv > 25, "GC=" + gcv.toFixed(1) + " rest=" + allv.toFixed(1));',
  '',
  '    /* V4/V5 光晕：同一视图，仅把 mag 改大以抑制光晕 */',
  '    var vmBase = build(jd0, lat, lon, { yaw: 180, pitch: 32, fov: 145, style: "full", detail: true });',
  '    var bright = null, faint = null;',
  '    vmBase.stars.forEach(function (it) {',
  '      if (it.alt <= 0 || it.x < 30 || it.x > 730 || it.y < 30 || it.y > 510) return;',
  '      if (it.mag <= 1.5 && (!bright || it.size > bright.size)) bright = it;',
  '      if (it.mag >= 3 && (!faint || it.size > faint.size)) faint = it;',
  '    });',
  '    var cvOn = draw(vmBase);',
  '    var vmNo = build(jd0, lat, lon, { yaw: 180, pitch: 32, fov: 145, style: "full", detail: true });',
  '    vmNo.stars.forEach(function (it) { it.mag = 9; });',
  '    var cvOff = draw(vmNo);',
  '    if (bright) {',
  '      var bOn = meanBox(cvOn, Math.round(bright.x), Math.round(bright.y), 7);',
  '      var bOff = meanBox(cvOff, Math.round(bright.x), Math.round(bright.y), 7);',
  '      ok("V4.1 亮星有光晕（邻域更亮）", bOn > bOff + 1.5, "on=" + bOn.toFixed(1) + " off=" + bOff.toFixed(1) + " mag=" + bright.mag);',
  '      var cOn = meanBox(cvOn, Math.round(bright.x), Math.round(bright.y), 1);',
  '      ok("V6.1 亮星核心突出于背景", cOn > 150, "core=" + cOn.toFixed(1));',
  '    } else { ok("V4.1 亮星有光晕（邻域更亮）", false, "无可测亮星"); ok("V6.1 亮星核心突出于背景", false, "无可测亮星"); }',
  '    if (faint) {',
  '      var fOn = meanBox(cvOn, Math.round(faint.x), Math.round(faint.y), 7);',
  '      var fOff = meanBox(cvOff, Math.round(faint.x), Math.round(faint.y), 7);',
  '      ok("V5.1 暗星邻域无光晕变化", Math.abs(fOn - fOff) < 0.6, "on=" + fOn.toFixed(2) + " off=" + fOff.toFixed(2) + " mag=" + faint.mag);',
  '    } else { ok("V5.1 暗星邻域无光晕变化", true, "无可测暗星，跳过比较"); }',
  '',
  '    /* V7 fallback / 图层 */',
  '    SkyBackground.__setMode("missing");',
  '    var cvFb = draw(build(jd0, lat, lon, { yaw: 180, pitch: 32, fov: 145, style: "full", detail: true }));',
  '    ok("V7.1 缺失时降级无异常", cvFb && ERRS.length === 0, ERRS.join(";").slice(0, 60));',
  '    SkyBackground.__setMode("auto"); SkyBackground.invalidate();',
  '    var lay = SkyLayers.normalize(null); lay.milkyWay = false;',
  '    var vmNoBg = build(jd0, lat, lon, { yaw: 180, pitch: 32, fov: 145, style: "full", detail: true, layers: lay });',
  '    var cvNoBg = draw(vmNoBg);',
  '    var b0 = SkyBackground.stats().draws;',
  '    ok("V7.2 关闭 milkyWay 不绘制背景", SkyBackground.draw({ save: function () {}, restore: function () {}, drawImage: function () {} }, vmNoBg) === false);',
  '    ok("V7.3 关闭背景仍有恒星命中", vmNoBg.stars.length > 0);',
  '',
  '    ok("V8.1 无未捕获错误", ERRS.length === 0, ERRS.join(" ; ").slice(0, 80));',
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
    console.error('[p0p1] 断言脚本语法错误: ' + e.message);
    process.exit(2);
  }
  var html = fs.readFileSync(INDEX, 'utf8');
  var idx = html.lastIndexOf('</body>');
  if (idx < 0) { console.error('[p0p1] HTML 结构异常'); process.exit(2); }
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (_, head, mid, tail) { return head + "'self' 'unsafe-inline'" + tail; }
  );
  fs.writeFileSync(TMP, html.slice(0, idx) + '<script>' + ASSERT + '</script>\n' + html.slice(idx), 'utf8');

  var combined = runChrome('file:///' + TMP.replace(/\\/g, '/'));
  fs.unlinkSync(TMP);
  var csp = (combined.match(/violates the following Content Security Policy/g) || []).length;
  var m = combined.match(/<pre id="__p0p1_result">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('[p0p1] 未取得结果，输出片段:');
    console.error(combined.slice(-2000));
    process.exit(1);
  }
  var text = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log(text);
  console.log('[p0p1] CSP 违规次数: ' + csp);
  var head = text.split('\n')[0].trim();
  var mm = head.match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] && csp === 0 ? 0 : 1);
}

main();
