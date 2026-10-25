/* ASTRUM · 单文件版功能回归（零依赖）
 *
 * 原理：把一段断言脚本注入到目标 HTML 的 </body> 之前，
 *      断言结果写入 <pre id="__selftest_result">，再用 chrome --dump-dom 读回。
 *      相比引入 puppeteer / ws，本项目保持零依赖。
 *
 * 关键点：
 *   1) 注入的断言脚本同样受 CSP 约束 —— 需把它的 sha256 授权写进 CSP meta，
 *      否则会被浏览器静默拦截，表现为"页面没反应"而不是明确报错。
 *   2) app.js 的 boot() 是同步执行的，DOMContentLoaded 之后即可断言，
 *      不依赖 setTimeout，避免 --dump-dom 提前返回造成的竞态。
 *
 * 用法：node tools/selftest.js [file-url]
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var crypto = require('crypto');

var CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
var DEFAULT_URL =
  'file:///D:/AI/workbuddy_cunchu/2026-10-22-18-29-15/astrum/astrum-standalone.html';

var ASSERT_BODY = [
  '(function () {',
  '  var R = [];',
  '  function ok(n, c, x) { R.push({ n: n, p: !!c, x: x || "" }); }',
  '  var errs = [];',
  '  window.addEventListener("error", function (e) { errs.push(String(e.message)); });',
  '  window.addEventListener("unhandledrejection", function (e) { errs.push("rej:" + e.reason); });',
  '',
  '  function run() {',
  '    /* 1) 核心模块全部就位 */',
  '    ["Astro", "CATALOG", "KNOWLEDGE", "AgentCore", "Sources", "SolarView", "OBSPLAN", "SOLAR"].forEach(function (k) {',
  '      ok("module:" + k, typeof window[k] !== "undefined");',
  '    });',
  '    /* 2) 数据量 */',
  '    try { ok("catalog.dso>=50", CATALOG.dso.length >= 50, "dso=" + CATALOG.dso.length); }',
  '    catch (e) { ok("catalog", false, e.message); }',
  '    try { ok("knowledge>=130", KNOWLEDGE.entries.length >= 130, "n=" + KNOWLEDGE.entries.length); }',
  '    catch (e) { ok("knowledge", false, e.message); }',
  '    /* 3) 动态 DOM（证明 app.js 已执行） */',
  '    ok("agentList rendered", document.querySelectorAll("#agentList > *").length >= 5,',
  '       "n=" + document.querySelectorAll("#agentList > *").length);',
  '    ok("sideSources rendered", document.querySelectorAll("#sideSources > *").length >= 3,',
  '       "n=" + document.querySelectorAll("#sideSources > *").length);',
  '    ok("catalog rendered", document.querySelectorAll("#catList > *").length >= 3,',
  '       "n=" + document.querySelectorAll("#catList > *").length);',
  '    /* 4) Agent 问答链路（buildAnswer(query, ctx, cfg) 为同步接口） */',
  '    try {',
  '      var city = AgentCore.findCity("北京") || AgentCore.CITIES[0];',
  '      var ctx = {',
  '        y: 2026, mo: 10, d: 23, h: 21, mi: 0,',
  '        tz: AgentCore.tzOf(city, 2026, 10, 23),',
  '        lat: city.lat, lon: city.lon, city: city.n, bortle: city.bortle,',
  '        cityRef: city, equipment: "单反", experience: "进阶"',
  '      };',
  '      var r = AgentCore.buildAnswer("今晚在北京能看到什么？", ctx, AgentCore.defaultConfig());',
  '      var txt = "";',
  '      if (r && r.sections) {',
  '        r.sections.forEach(function (s) {',
  '          ["text", "head", "sub", "title", "para", "note"].forEach(function (k) {',
  '            if (typeof s[k] === "string") txt += s[k] + " ";',
  '          });',
  '          if (Array.isArray(s.items)) s.items.forEach(function (it) {',
  '            txt += (typeof it === "string" ? it : (it && (it.text || it.label || it.title) || "")) + " ";',
  '          });',
  '        });',
  '      }',
  '      ok("ask returns text", txt.length > 20, "len=" + txt.length);',
  '      ok("ask has sections", !!(r && r.sections && r.sections.length),',
  '         "sections=" + (r && r.sections ? r.sections.length : 0));',
  '    } catch (e) { ok("ask", false, e.message); }',
  '    /* 5) 星历计算（helio 需要 jd 参数） */',
  '    try {',
  '      var jd = Astro.jdFromDate(new Date());',
  '      var h = Astro.helio("earth", jd);',
  '      ok("helio earth", isFinite(h.x) && isFinite(h.y) && isFinite(h.z),',
  '         "x=" + h.x.toFixed(3) + " y=" + h.y.toFixed(3) + " z=" + h.z.toFixed(3));',
  '      var mp = Astro.moonPhase(jd);',
  '      ok("moonPhase finite", isFinite(mp.age) && isFinite(mp.illum),',
  '         "age=" + mp.age.toFixed(2) + " illum=" + mp.illum.toFixed(3) + " " + mp.name);',
  '    } catch (e) { ok("astro", false, e.message); }',
  '    /* 6) 太阳系引擎可构建场景 */',
  '    try {',
  '      var s = SolarView.info ? SolarView.info("earth") : null;',
  '      ok("SolarView.info", !!s, s ? ("radius=" + s.radiusKm) : "null");',
  '    } catch (e) { ok("SolarView.info", false, e.message); }',
  '    /* 7) 观测参数建议 */',
  '    try {',
  '      var sa = OBSPLAN.samplingFor(60, 3.2);',
  '      ok("obsplan sampling", !!(sa && isFinite(sa.arcsecPerPx) || isFinite(sa)), "v=" + JSON.stringify(sa));',
  '    } catch (e) { ok("obsplan", false, e.message); }',
  '    /* 8) IP 定位降级链 —— 真实联网请求，验证至少一个端点可用 */',
  '    var ipDone = new Promise(function (resolve) {',
  '      var EPS = [',
  '        { n: "ipwho.is", u: "https://ipwho.is/", p: function (d) { return d && d.success !== false && isFinite(Number(d.latitude)) ? { la: Number(d.latitude), lo: Number(d.longitude), c: d.city || "" } : null; } },',
  '        { n: "ipinfo.io", u: "https://ipinfo.io/json", p: function (d) { var q = String((d||{}).loc||"").split(","); return (d && d.loc && isFinite(Number(q[0]))) ? { la: Number(q[0]), lo: Number(q[1]), c: d.city || "" } : null; } },',
  '        { n: "ipapi.co", u: "https://ipapi.co/json/", p: function (d) { return (d && isFinite(Number(d.latitude))) ? { la: Number(d.latitude), lo: Number(d.longitude), c: d.city || "" } : null; } },',
  '        { n: "ipapi.is", u: "https://api.ipapi.is/json/", p: function (d) { return (d && isFinite(Number(d.lat))) ? { la: Number(d.lat), lo: Number(d.lon), c: d.city || "" } : null; } }',
  '      ];',
  '      function ipStep(i, reasons) {',
  '        if (i >= EPS.length) return Promise.reject(new Error("all failed: " + reasons.join(",")));',
  '        var ep = EPS[i];',
  '        var ctrl = null; try { ctrl = new AbortController(); } catch (e) {}',
  '        var opt = { cache: "no-store", headers: { Accept: "application/json" } };',
  '        if (ctrl) { opt.signal = ctrl.signal; setTimeout(function () { ctrl.abort(); }, 6000); }',
  '        return fetch(ep.u, opt).then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })',
  '          .then(function (t) { var d; try { d = JSON.parse(t); } catch (e) { throw new Error("not json"); } var g = ep.p(d); if (!g) throw new Error("no coord"); return g; })',
  '          .catch(function (e) { reasons.push(ep.n); return ipStep(i + 1, reasons); });',
  '      }',
  '      ipStep(0, []).then(function (g) {',
  '        ok("ip locate chain works", isFinite(g.la) && isFinite(g.lo),',
  '           "lat=" + g.la.toFixed(3) + " lon=" + g.lo.toFixed(3) + " city=" + g.c);',
  '        resolve();',
  '      }).catch(function (e) {',
  '        ok("ip locate chain works", false, e.message);',
  '        resolve();',
  '      });',
  '    });',
  '    /* 8b) UI 端到端：点击「按 IP 定位」按钮，验证提示与地点真的更新 */',
  '    var uiDone = new Promise(function (resolve) {',
  '      var btn = document.getElementById("btnLocate");',
  '      if (!btn) { ok("ip locate button exists", false, "btnLocate missing"); resolve(); return; }',
  '      ok("ip locate button exists", true);',
  '      var toastMsg = "";',
  '      var mo = new MutationObserver(function () {',
  '        var t = document.getElementById("toast");',
  '        if (t && t.textContent) toastMsg = t.textContent;',
  '      });',
  '      mo.observe(document.body, { childList: true, subtree: true, characterData: true });',
  '      var before = (document.getElementById("ctxPlace") || {}).value || "";',
  '      btn.click();',
  '      var tries = 0;',
  '      var iv = setInterval(function () {',
  '        tries++;',
  '        var after = (document.getElementById("ctxPlace") || {}).value || "";',
  '        /* 成功：地点变了；失败：出现提示文案 —— 两者都算 UI 链路通 */',
  '        if ((after && after !== before) || toastMsg) {',
  '          clearInterval(iv); mo.disconnect();',
  '          ok("ip locate UI responds", !!(after || toastMsg),',
  '             "toast=\\"" + toastMsg + "\\" place=" + after + " (" + tries * 200 + "ms)");',
  '          resolve();',
  '        } else if (tries > 130) {',
  '          clearInterval(iv); mo.disconnect();',
  '          ok("ip locate UI responds", false, "no toast, no place change in 26s");',
  '          resolve();',
  '        }',
  '      }, 200);',
  '    });',
  '    /* 8c) 全球地点检索 —— 真实联网，验证内置 809 城市之外也能搜到 */',
  '    var geoDone = new Promise(function (resolve) {',
  '      if (typeof GeoSearch === "undefined") { ok("GeoSearch module loaded", false, "missing"); resolve(); return; }',
  '      ok("GeoSearch module loaded", true);',
  '      /* 三个代表：中文城市 / 英文首都 / 非人口地名（山峰） */',
  '      var G = ["黄山", "Reykjavik", "Mauna Kea"];',
  '      var gi = 0;',
  '      function gstep() {',
  '        if (gi >= G.length) { resolve(); return; }',
  '        var q = G[gi++];',
  '        GeoSearch.search(q, 20).then(function (list) {',
  '          ok("geo search: " + q, list && list.length > 0,',
  '             list && list.length ? (list[0].n + " | " + list[0].kind + " | tz=" + (list[0].tzid || "null")) : "no result");',
  '          gstep();',
  '        }).catch(function (e) { ok("geo search: " + q, false, e.message); gstep(); });',
  '      }',
  '      gstep();',
  '    });',
  '    /* 8d) 检索规划与证据链路（用 mock 检索，不联网，确定性） */',
  '    var resDone = new Promise(function (resolve) {',
  '      if (typeof Research === "undefined") { ok("Research module loaded", false, "missing"); resolve(); return; }',
  '      ok("Research module loaded", true);',
  '      /* 纯本地问题不检索 */',
  '      var pl = Research.plan("今晚在北京能看到什么？", { intent: "tonight" });',
  '      ok("local-only question skips search", pl.skip === true, "profile=" + pl.profile);',
  '      /* 机制类问题会拆子问题 */',
  '      var pm = Research.plan("为什么超新星爆发能产生那么大的能量？", { intent: "knowledge-target", entityName: "超新星", entityEn: "Supernova" });',
  '      ok("mechanism question splits sub-questions", pm.subs.length >= 3, "n=" + pm.subs.length);',
  '      /* 用 mock 跑一遍完整流程，验证证据编号与引用核验 */',
  '      var mock = function (qs) {',
  '        var items = (qs || []).map(function (q, i) {',
  '          return { title: "Supernova mechanism " + i, snippet: "core collapse supernova mechanism", excerpt: "core collapse supernova mechanism energy", url: "https://example.org/" + i, host: "example.org", date: "2020-01-0" + (i + 1), sourceType: "paper", authors: [], doi: "", extra: {}, endpoint: "mock", query: q, fetchedAt: Date.now() };',
  '        });',
  '        return Promise.resolve({ items: items, calls: (qs || []).length, errors: [], truncated: false });',
  '      };',
  '      Research.run("为什么超新星爆发能产生那么大的能量？", {',
  '        intent: "knowledge-target", entityName: "超新星", entityEn: "Supernova", searchFn: mock',
  '      }).then(function (rec) {',
  '        ok("research produces evidence", rec.evidence.length > 0, "n=" + rec.evidence.length);',
  '        ok("evidence has ids", rec.evidence.every(function (e) { return /^E\\d+$/.test(e.id); }));',
  '        var v = Research.verifyCitations({}, rec.evidence, {});',
  '        ok("citation verification runs", v && typeof v.verdict === "string", v.verdict);',
  '        var secs = Research.toSections(rec);',
  '        ok("research renders to sections", secs.length > 0 && secs[0].kind === "synthesis", "n=" + secs.length + " first=" + (secs[0] && secs[0].kind));',
  '        var syn = Research.synthesize(rec);',
  '        ok("synthesis counts evidence", syn.available === true && syn.counts.evidence > 0, "n=" + (syn.counts && syn.counts.evidence));',
  '        resolve();',
  '      }).catch(function (e) { ok("research pipeline", false, e.message); resolve(); });',
  '    });',
  '    /* 8e) API 配置流程 —— 密钥保存不得把「测试连接」按钮重绘掉 */',
  '    var cfgDone = new Promise(function (resolve) {',
  '      if (!window.__astrum) { ok("config flow", false, "__astrum missing"); resolve(); return; }',
  '      try { window.__astrum.openSheet("settings"); } catch (e) { ok("config flow", false, e.message); resolve(); return; }',
  '      setTimeout(function () {',
  '        var pick = null;',
  '        document.querySelectorAll("#settings button").forEach(function (b) {',
  '          if (!pick && /智谱/.test(b.textContent)) pick = b;',
  '        });',
  '        if (!pick) { ok("config flow", false, "provider chip not found"); resolve(); return; }',
  '        pick.click();',
  '        setTimeout(function () {',
  '          var kinp = document.querySelector(".mp-input[type=password]");',
  '          if (!kinp) { ok("config flow", false, "key input not found"); resolve(); return; }',
  '          var btn = null;',
  '          document.querySelectorAll("button").forEach(function (b) { if (/测试连接/.test(b.textContent)) btn = b; });',
  '          ok("config: test button present", !!btn);',
  '          kinp.value = "sk-selftest-fake";',
  '          kinp.dispatchEvent(new Event("input", { bubbles: true }));',
  '          kinp.dispatchEvent(new Event("change", { bubbles: true }));',
  '          var z = Sources.list().filter(function (x) { return x.id === "zhipu"; })[0];',
  '          ok("config: key saved", !!(z && z.hasKey), "hasKey=" + (z && z.hasKey));',
  '          ok("config: status no longer 未配置", !/未配置/.test(Sources.statusOf("zhipu").msg),',
  '             Sources.statusOf("zhipu").msg);',
  '          /* 核心回归点：重绘不得换掉用户正要点的按钮 */',
  '          ok("config: test button survives save", !!(btn && document.contains(btn)),',
  '             btn ? ("inDom=" + document.contains(btn)) : "btn missing");',
  '          var fired = false;',
  '          if (btn && document.contains(btn)) { btn.click(); fired = true; }',
  '          ok("config: click still lands after save", fired, "fired=" + fired);',
  '          try { window.__astrum.clearAttach && window.__astrum.clearAttach(); } catch (e) {}',
  '          resolve();',
  '        }, 320);',
  '      }, 320);',
  '    });',
  '    /* 8f) 输出可读性：折叠层、数据分级、术语双轨 */',
  '    var readDone = new Promise(function (resolve) {',
  '      window.__astrum.selectSource("local");',
  '      window.__astrum.ask("猎户座大星云是什么");',
  '      var tries = 0;',
  '      var iv = setInterval(function () {',
  '        tries++;',
  '        var bot = document.querySelector(".msg.bot:last-of-type") || document.querySelector(".msg.bot");',
  '        var v = bot && bot.querySelector(".sec-verdict");',
  '        if ((v && bot.querySelector(".kv-data")) || tries > 60) {',
  '          clearInterval(iv);',
  '          var fold = bot && bot.querySelector(".trace-fold");',
  '          ok("readability: 检索过程默认折叠", !!fold && fold.open === false,',
  '             fold ? ("open=" + fold.open) : "missing");',
  '          var kd = bot.querySelectorAll(".kv-data");',
  '          var km = bot.querySelectorAll(".kv-meta");',
  '          ok("readability: 关键数据独立成块", kd.length >= 1, "n=" + kd.length);',
  '          ok("readability: 数值与元信息分级", kd.length >= 1 && km.length >= 1,',
  '             "data=" + kd.length + " meta=" + km.length);',
  '          var txt = bot.textContent;',
  '          ok("readability: pop 模式用白话（已核对）", /已核对|已获得足够资料|检索 \\d+ 次/.test(txt) || !/可溯源|俯仰/.test(txt),',
  '             /可溯源|俯仰/.test(txt) ? "仍含研究术语" : "ok");',
  '          resolve();',
  '        }',
  '      }, 250);',
  '    });',
  '    /* 8g) 契约层：四档应答 / 执行记录 / 数值表示 */',
  '    var contractDone = new Promise(function (resolve) {',
  '      var RT = window.AstroRuntime;',
  '      if (!RT) { ok("contract: runtime loaded", false, "AstroRuntime missing"); resolve(); return; }',
  '      ok("contract: runtime loaded", true);',
  '      /* 四档判定：按答案构成而不是按问题 */',
  '      ok("contract: classify 可算", RT.classify({ sections: [{ kind: "evidence", items: [{ label: "距离", value: "1 光年" }] }], meta: { computed: true } }).key === "compute");',
  '      ok("contract: classify 可查", RT.classify({ sections: [{ kind: "web", items: [{}] }], meta: {} }).key === "fetch");',
  '      ok("contract: classify 可释", RT.classify({ sections: [{ kind: "evidence", items: [{}] }], meta: {} }).key === "infer");',
  '      ok("contract: classify 未知", RT.classify({ sections: [], meta: {} }).key === "unknown");',
  '      /* 数值表示 */',
  '      var q = RT.Qty(1344, "ly", { err: 20, src: "local" });',
  '      ok("contract: Qty 带误差与单位", RT.qtyText(q) === "1344 ± 20 光年", RT.qtyText(q));',
  '      ok("contract: Qty 可溯源判定", RT.qtyAttributable(q) === true && RT.qtyAttributable(RT.Qty(1, "ly")) === false);',
  '      ok("contract: 时刻带时区", /\\(UTC\\+9\\)$/.test(RT.fmtClock(22 + 14 / 60, 9)), RT.fmtClock(22 + 14 / 60, 9));',
  '      /* 未知档必须给出「缺什么 / 去哪拿 / 次优」。',
  '       * 问句不能含「这个/它」——前置测试已把实体写进记忆，代词会被还原成已知目标，',
  '       * 那样就走不到未知档了。 */',
  '      var beforeBots = 0;',
  '      window.__astrum.selectSource("local");',
  '      var asked = 0;',
  '      /* ask() 在 busy 时会静默返回，必须等上一条答案收尾再问 */',
  '      function tryAsk() {',
  '        asked++;',
  '        if (document.querySelector(".thinking") && asked < 40) { setTimeout(tryAsk, 500); return; }',
  '        beforeBots = document.querySelectorAll(".msg.bot").length;',
  '        window.__astrum.ask("光变曲线的原始观测数据在哪里下载");',
  '        poll(0);',
  '      }',
  '      function poll(tries2) {',
  '        var bots = document.querySelectorAll(".msg.bot");',
  '        var last = bots[bots.length - 1];',
  '        /* 新气泡先以「思考中」占位出现，必须等它渲染出结论章节再断言 */',
  '        var ready = bots.length > beforeBots && last && last.querySelector(".sec-verdict");',
  '        if (ready || tries2 > 120) { assert(last); return; }',
  '        setTimeout(function () { poll(tries2 + 1); }, 250);',
  '      }',
  '      function assert(bot) {',
  '        var txt = bot ? bot.textContent : "";',
  '        ok("contract: 未知档给出缺口", /缺口与获取路径/.test(txt) && /缺什么/.test(txt) && /去哪拿/.test(txt) && /次优方案/.test(txt));',
  '        ok("contract: 不再罗列能力清单", txt.indexOf("我可以可靠回答的方向") < 0);',
  '        var badge = bot && bot.querySelector(".srcbadge.t-unknown");',
  '        ok("contract: 未知档有徽标", !!badge, badge ? badge.textContent.trim() : (txt.slice(0, 40) || "missing"));',
  '        resolve();',
  '      }',
  '      tryAsk();',
  '    });',
  '    /* 9) 无未捕获异常 */',
  '    ok("no uncaught errors", errs.length === 0, errs.join(" | "));',
  '',
  '    ipDone.then(function () { return uiDone; }).then(function () { return geoDone; }).then(function () { return resDone; }).then(function () { return cfgDone; }).then(function () { return readDone; }).then(function () { return contractDone; }).then(finish);',
  '  }',
  '',
  '  function finish() {',
  '    var pass = R.filter(function (r) { return r.p; }).length;',
  '    var el = document.createElement("pre");',
  '    el.id = "__selftest_result";',
  '    el.textContent = "RESULT " + pass + "/" + R.length + "\\n" +',
  '      R.map(function (r) { return (r.p ? "PASS" : "FAIL") + " | " + r.n + (r.x ? (" | " + r.x) : ""); }).join("\\n");',
  '    document.body.appendChild(el);',
  '    document.title = "SELFTEST " + pass + "/" + R.length;',
  '  }',
  '',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { setTimeout(run, 60); });',
  '  else run();',
  '})();'
].join('\n');

function sha256B64(s) {
  return crypto.createHash('sha256').update(s, 'utf8').digest('base64');
}

function main() {
  /* 断言脚本以字符串数组拼装，易因转义出错 —— 先做一次语法自检 */
  try {
    new Function(ASSERT_BODY);
  } catch (e) {
    console.error('[selftest] 断言脚本语法错误: ' + e.message);
    console.error('--- 脚本内容 ---');
    console.error(ASSERT_BODY);
    process.exit(2);
  }

  var url = process.argv[2] || DEFAULT_URL;
  var filePath = url.replace(/^file:\/\/\/?/, '');
  filePath = decodeURIComponent(filePath).replace(/\//g, path.sep);
  if (!fs.existsSync(filePath)) {
    console.error('[selftest] 找不到文件: ' + filePath);
    process.exit(2);
  }

  var html = fs.readFileSync(filePath, 'utf8');
  var idx = html.lastIndexOf('</body>');
  if (idx < 0) { console.error('[selftest] HTML 结构异常'); process.exit(2); }

  /* 测试副本是一次性临时文件，安全不敏感 —— 在保留 'self' 的前提下追加
     'unsafe-inline'，避免因 HTML 解析器换行归一化导致的 hash 失配。
     被测的原始文件本身仍然是严格 CSP，不受影响。 */
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (_, head, mid, tail) { return head + "'self' 'unsafe-inline'" + tail; }
  );

  var patched = html.slice(0, idx) +
    '<script>' + ASSERT_BODY + '</script>\n' + html.slice(idx);

  /* 多文件版必须原地测试 —— 复制到临时目录会让 core/ data/ 相对路径失效，
     那是测试方法的问题，不是产品缺陷。
     单文件版可安全复制（所有资源已内联）。 */
  var isMultiFile = /<script src=/.test(html);
  var tmpDir = null;
  var tmpFile = filePath;
  if (!isMultiFile) {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrum_st_'));
    tmpFile = path.join(tmpDir, path.basename(filePath));
    fs.writeFileSync(tmpFile, patched, 'utf8');
  } else {
    /* 原地：写一个同目录的临时副本，保持相对路径可用 */
    tmpFile = path.join(path.dirname(filePath), '__selftest_tmp.html');
    fs.writeFileSync(tmpFile, patched, 'utf8');
  }

  var out = cp.spawnSync(CHROME, [
    '--headless=new', '--disable-gpu',
    '--enable-logging=stderr',
    '--window-size=1440,900',
    '--virtual-time-budget=45000',
    '--dump-dom',
    'file:///' + tmpFile.replace(/\\/g, '/')
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

  var combined = (out.stdout || '') + (out.stderr || '');
  var m = combined.match(/<pre id="__selftest_result">([\s\S]*?)<\/pre>/);
  var csp = (combined.match(/violates the following Content Security Policy/g) || []).length;

  if (!m) {
    console.error('[selftest] 未取得结果。输出片段:');
    console.error(combined.slice(-2500));
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
    else { try { fs.unlinkSync(tmpFile); } catch (e) {} }
    process.exit(1);
  }
  var text = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log(text);
  console.log('[selftest] CSP 违规次数: ' + csp);
  if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  else { try { fs.unlinkSync(tmpFile); } catch (e) {} }

  var head = text.split('\n')[0] || '';
  /* 注意：Windows 下首行可能带 \r，正则需容忍 */
  var mm = head.trim().match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main();
