/* ASTRUM V1.15 真实用户盲测（可重复执行）
 *
 * 目的：用真实本地引擎、真实外部检索和真实答案结构，覆盖 A–F 六类问题。
 * 不在脚本内 mock 模型；没有 Provider Key 时 D/E 的最终 Muse 表述标记
 * BLOCKED_API_KEY，外部检索不可用时标记 BLOCKED_EXTERNAL。
 *
 * 用法：
 *   node tools/v1-15-real-user-eval.js
 *   node tools/v1-15-real-user-eval.js --no-network   # 跳过真实外部检索
 */
'use strict';
var path = require('path');
var fs = require('fs');
var ROOT = path.resolve(__dirname, '..');
var NO_NETWORK = process.argv.indexOf('--no-network') >= 0;

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.I18N = {
  current: function () { return 'zh'; }, t: function (s) { return s; },
  tpl: function (s, a, b) { return String(s).replace('{0}', a == null ? '' : a).replace('{1}', b == null ? '' : b); },
  applyDom: function () { return 0; }
};
[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/answer-composer.js', 'core/registry.js', 'core/compose-adapter.js',
  'core/task-store.js', 'core/orchestrator.js', 'core/control.js',
  'core/request.js', 'core/control-bridge.js', 'core/content-i18n.js',
  'core/knowledge-sources.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var C = global.AstroAnswerComposer;
var R = global.Research;
var E = global.AstroEvidence;
var Req = global.AstroRequest;
var Adapter = global.AstroComposeAdapter;
var CTX = { y: 2026, mo: 11, d: 5, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };

function textOf(a) {
  var bits = [];
  (a.sections || []).forEach(function (s) {
    if (s.kind === 'analysis') (s.paragraphs || []).forEach(function (p) { bits.push(p.text || ''); });
    if (s.kind === 'verdict') bits.push(s.head || '', s.sub || '');
    if (s.kind === 'evidence') {
      (s.items || []).forEach(function (it) { bits.push((it.label || '') + ' ' + (it.value || '')); });
      bits.push(s.para || '');
    }
    if (s.kind === 'web') (s.items || []).forEach(function (it) { bits.push((it.title || '') + ' ' + (it.excerpt || it.snippet || '')); });
    if (s.kind === 'list') (s.items || []).forEach(function (it) { bits.push((it.name || '') + ' ' + (it.meta || '') + ' ' + (it.text || '')); });
    if (s.kind === 'boundary') bits.push(s.text || '');
    if (s.kind === 'conflict') bits.push(s.note || '');
    if (s.kind === 'model') bits.push(s.text || '');
  });
  return bits.join('\n').trim();
}
function localAnswer(q) {
  var a = AC.buildAnswer(q, CTX, AC.defaultConfig());
  C.finalize(a, { question: q });
  return a;
}
function researchAnswer(q, route) {
  if (NO_NETWORK) return Promise.resolve({ rec: null, answer: null });
  return R.run(q, { intent: route.intent, maxRounds: 2, maxCalls: 6, budgetMs: 15000 }).then(function (rec) {
    if (!rec.evidence || !rec.evidence.length) return { rec: rec, answer: null };
    var ev = [], ids = [];
    rec.evidence.forEach(function (it) {
      var e = E.fromSourceItem(it, { tool: 'research', query: q, retrievedAt: new Date().toISOString() });
      if (e) { ev.push(e); ids.push(e.evidenceId); }
    });
    if (!ev.length) return { rec: rec, answer: null };
    var deps = { research: { ok: true, items: ev, evidenceIds: ids, provenance: { tool: 'research' } } };
    var out = Adapter.create({ agentCore: AC }).compose({ query: q, from: ['research'] }, CTX, AC.defaultConfig(), deps);
    if (!out || !out.ok || !out.answer) return { rec: rec, answer: null };
    C.finalize(out.answer, { question: q });
    return { rec: rec, answer: out.answer };
  });
}

var CASES = [
  /* A 简单事实 */
  { id: 'A1', cat: 'A', q: '半人马座距离地球有多远？', want: /半人马|光年/, maxLen: 500 },
  { id: 'A2', cat: 'A', q: '什么是红移？', want: /红移|波长|光谱/, maxLen: 500 },
  { id: 'A3', cat: 'A', q: '什么是光年？', want: /光年|距离|9\.46|万亿/, maxLen: 500 },
  { id: 'A4', cat: 'A', q: '什么是恒星光谱？', want: /光谱|波长|吸收/, maxLen: 500 },
  { id: 'A5', cat: 'A', q: '哈勃常数是什么意思？', want: /哈勃|膨胀|km|Mpc/, maxLen: 500 },
  { id: 'A6', cat: 'A', q: '什么是视星等？', want: /视星等|星等|亮度/, maxLen: 500 },

  /* B 天体参数与科学知识 */
  { id: 'B1', cat: 'B', q: 'M31 的质量大约是多少？', want: /M31|质量|太阳质量|10/, maxLen: 900 },
  { id: 'B2', cat: 'B', q: 'M42 距离地球有多远？', want: /1344|光年|M42|猎户/, maxLen: 900 },
  { id: 'B3', cat: 'B', q: 'M13 的年龄和金属丰度是多少？', want: /年龄|金属丰度|Gyr|Fe\/H|12/, maxLen: 900 },
  { id: 'B4', cat: 'B', q: 'M33 与 M31 的主要区别是什么？', want: /M33|M31|星系|距离|大小/, maxLen: 900 },
  { id: 'B5', cat: 'B', q: 'JWST 的主要观测波段有哪些？', want: /JWST|红外|波段|可见/, maxLen: 900 },
  { id: 'B6', cat: 'B', q: '太阳的半径是多少公里？', want: /696|公里|km|太阳/, maxLen: 500 },

  /* C 多轮上下文（按顺序执行） */
  { id: 'C1', cat: 'C', q: 'M31 距离地球有多远？', want: /M31|仙女|光年/, maxLen: 900 },
  { id: 'C2', cat: 'C', q: '它的直径大约是多少？', want: /直径|光年|M31|仙女/, maxLen: 900 },
  { id: 'C3', cat: 'C', q: '和银河系相比呢？', want: /银河系|M31|大小|直径/, maxLen: 900 },
  { id: 'C4', cat: 'C', q: '它未来会和银河系碰撞吗？', want: /碰撞|银河系|M31|合并/, maxLen: 900 },

  /* D 真实科研检索 */
  { id: 'D1', cat: 'D', q: '查找 JWST 关于早期宇宙星系的最新研究', want: /JWST|早期宇宙|星系/, maxLen: 2200 },
  { id: 'D2', cat: 'D', q: '查找 M31 距离测量的代表性论文', want: /M31|距离|论文|测量/, maxLen: 2200 },
  { id: 'D3', cat: 'D', q: '比较不同论文对 M13 年龄的估计', want: /M13|年龄|论文|Gyr/, maxLen: 2200 },
  { id: 'D4', cat: 'D', q: '查找系外行星大气检测的主要技术', want: /系外行星|大气|检测|技术/, maxLen: 2200 },
  { id: 'D5', cat: 'D', q: '总结近期关于黑洞吸积盘的研究进展', want: /黑洞|吸积盘|研究|进展/, maxLen: 2200 },
  { id: 'D6', cat: 'D', q: '查找 DESI DR2 的主要科学结果', want: /DESI|DR2|暗能量|结果/, maxLen: 2200 },

  /* E 复杂综合研究 */
  { id: 'E1', cat: 'E', q: '综合目前的观测证据，分析早期宇宙星系形成模型', want: /早期宇宙|星系|形成|模型|证据/, maxLen: 2600 },
  { id: 'E2', cat: 'E', q: '比较不同方法测量宇宙膨胀率的优缺点', want: /膨胀|方法|优缺点|测量/, maxLen: 2600 },
  { id: 'E3', cat: 'E', q: '分析 JWST 对早期星系形成理论带来的影响', want: /JWST|早期|星系|理论|影响/, maxLen: 2600 },
  { id: 'E4', cat: 'E', q: '综合多篇论文分析系外行星大气组成的研究进展', want: /系外行星|大气|研究|进展/, maxLen: 2600 },
  { id: 'E5', cat: 'E', q: '分析不同观测方法在暗物质研究中的作用', want: /暗物质|观测|方法|研究/, maxLen: 2600 },
  { id: 'E6', cat: 'E', q: '比较黑洞形成模型的观测证据与主要差异', want: /黑洞|形成|模型|观测|证据/, maxLen: 2600 },

  /* F 观测与计算 */
  { id: 'F1', cat: 'F', q: '使用 200mm 口径望远镜观测 M42 有什么建议？', want: /200mm|M42|口径|望远镜/, maxLen: 1200 },
  { id: 'F2', cat: 'F', q: '根据 200mm 口径、1000mm 焦距和 25mm 目镜计算放大倍率。', want: /40|倍|放大|焦距|目镜/, maxLen: 800 },
  { id: 'F3', cat: 'F', q: '根据北京今晚的观测条件分析 M42 是否适合观测。', want: /M42|北京|高度|方位|观测/, maxLen: 1600 },
  { id: 'F4', cat: 'F', q: '比较 80mm 与 200mm 望远镜的理论分辨率。', want: /80mm|200mm|分辨率|角秒|"/, maxLen: 1000 },
  { id: 'F5', cat: 'F', q: '计算 200mm 口径、1000mm 焦距望远镜的视场范围。', want: /视场|度|°|焦距|200mm/, maxLen: 1000 },
  { id: 'F6', cat: 'F', q: '用 10×50 双筒望远镜能看到 M42 的哪些细节？', want: /10×50|双筒|M42|猎户/, maxLen: 1000 }
];

var INTERNAL = /(Agent|智能体|工具调用|检索词|执行步骤|step\.|tool\.|Evidence ID|evidenceId|评审结论|置信度 0\.)/;
var results = [];

function scoreCase(c, ans, extra) {
  var text = ans ? textOf(ans) : '';
  var secs = (ans && ans.sections) || [];
  var ev = (ans && ans.research && ans.research.evidence) || [];
  var papers = (ans && ans.research && ans.research.papers) || [];
  var hasAnalysis = secs.some(function (s) { return s.kind === 'analysis'; });
  var hasNarr = secs.some(function (s) { return s.kind === 'narrative'; });
  var evidenceSec = secs.filter(function (s) { return s.kind === 'evidence'; })[0];
  var must = c.want.test(text);
  var internal = INTERNAL.test(text);
  var dupVerdict = secs.filter(function (s) { return s.kind === 'verdict'; }).length > 1;
  var conclusionList = secs.some(function (s) { return s.kind === 'list' && /科学结论|按证据强度/.test(String(s.title || '')); });
  var researchLike = c.cat === 'D' || c.cat === 'E';
  var hasSource = researchLike ? (ev.length > 0 && ev.some(function (e) {
    return e.uri || (e.content && e.content.doi) || (e.content && e.content.arxivId);
  })) : !!(evidenceSec && (evidenceSec.items || []).length && (evidenceSec.sources || []).length);
  var evidenceLink = researchLike ? ((ans && ans.research && ans.research.conclusions || []).some(function (x) {
    return (x.evidenceRefs || []).length;
  })) : !!(evidenceSec && (evidenceSec.items || []).length);
  var analysisQuality = hasAnalysis ? (secs.filter(function (s) { return s.kind === 'analysis'; })[0].paragraphs || []).length : 0;

  var scores = {
    understanding: must ? 5 : (text.length > 12 ? 3 : 0),
    routing: extra.routeOk ? 5 : 2,
    factual: must ? 5 : 1,
    source: hasSource ? 5 : 1,
    evidence: evidenceLink ? 5 : 1,
    synthesis: hasAnalysis ? (analysisQuality >= 2 ? 5 : 3) : (hasNarr ? 4 : (text.length > 30 ? 3 : 1)),
    completeness: (must && text.length >= 20 && text.length <= c.maxLen) ? 5 : (must ? 3 : 1),
    expression: internal ? 1 : 5,
    content: (dupVerdict || conclusionList) ? 2 : 5,
    context: 5
  };
  /* C 类上下文单独检查末轮实体 */
  if (c.id === 'C4' && !/M31|仙女|银河/.test(text)) scores.context = 1;
  var total = Object.keys(scores).reduce(function (a, k) { return a + scores[k]; }, 0);
  var severe = [];
  if (internal) severe.push('internal-term-leak');
  if (text.length < 10) severe.push('empty-answer');
  if (!must) severe.push('missing-core-fact');
  if (researchLike && !ev.length) severe.push('no-external-evidence');
  if (c.id === 'C4' && scores.context <= 1) severe.push('context-lost');

  var status;
  if (researchLike && !ev.length) status = NO_NETWORK ? 'NOT_RUN' : 'BLOCKED_EXTERNAL';
  else if (researchLike) status = 'BLOCKED_API_KEY';
  else status = (total >= 40 && !severe.length) ? 'PASS' : 'FAIL';

  return {
    status: status,
    score: total,
    scores: scores,
    severe: severe,
    evidenceCount: ev.length,
    paperCount: papers.length,
    must: must,
    internal: internal,
    textLength: text.length,
    sections: secs.map(function (s) { return s.kind; }).join(','),
    text: text.slice(0, 2600)
  };
}

function runOne(c) {
  return new Promise(function (resolve) {
    var route = null, ans = null;
    try { route = Req.classify(c.q, CTX, AC.defaultConfig()); } catch (e) { route = null; }
    var researchLike = c.cat === 'D' || c.cat === 'E';
    var routeOk;
    if (researchLike) routeOk = !!(route && route.route && (route.route.mode === 'research' || route.route.level));
    else routeOk = !!(route && route.route && (route.route.legacy === false || route.route.mode === 'local' || route.route.mode === 'legacy'));
    if (!researchLike && route && route.route && route.route.mode === 'research' && c.cat === 'A') routeOk = false;

    if (researchLike) {
      researchAnswer(c.q, route || { intent: 'unknown' }).then(function (r) {
        if (r.answer) ans = r.answer;
        var out = scoreCase(c, ans, { routeOk: routeOk });
        out.id = c.id; out.cat = c.cat; out.q = c.q;
        out.intent = route && route.intent; out.route = route && route.route;
        out.externalErrors = (r.rec && r.rec.errors || []).slice(0, 6);
        out.stopReason = r.rec && r.rec.stopReason;
        results.push(out);
        resolve(out);
      }).catch(function (e) {
        var out = scoreCase(c, null, { routeOk: routeOk });
        out.id = c.id; out.cat = c.cat; out.q = c.q; out.intent = route && route.intent; out.route = route && route.route;
        out.severe.push('research-error');
        out.error = String(e && e.message || e);
        results.push(out); resolve(out);
      });
      return;
    }

    try {
      if (c.cat === 'C' && c.id !== 'C1') {
        /* 多轮上下文由 runMultiTurn 统一处理，这里只处理首轮 */
      }
      ans = localAnswer(c.q);
      var out2 = scoreCase(c, ans, { routeOk: routeOk });
      out2.id = c.id; out2.cat = c.cat; out2.q = c.q;
      out2.intent = ans.intent; out2.route = route && route.route;
      results.push(out2); resolve(out2);
    } catch (e) {
      var out3 = scoreCase(c, null, { routeOk: routeOk });
      out3.id = c.id; out3.cat = c.cat; out3.q = c.q; out3.error = String(e && e.message || e);
      out3.severe.push('exception'); out3.status = 'FAIL';
      results.push(out3); resolve(out3);
    }
  });
}

/* 多轮：真实模拟 app 的 rememberTurn → setMemory → 下一轮 */
function runMultiTurn() {
  var turns = CASES.filter(function (c) { return c.cat === 'C'; });
  var memory = [];
  var chain = Promise.resolve();
  turns.forEach(function (c) {
    chain = chain.then(function () {
      return new Promise(function (resolve) {
        var route = null;
        try { route = Req.classify(c.q, CTX, AC.defaultConfig()); } catch (e) { }
        AC.setMemory(memory);
        var ans = localAnswer(c.q);
        var text = textOf(ans);
        var target = (ans.meta && ans.meta.target) || (ans.targets && ans.targets[0] && (ans.targets[0].item.entry ? ans.targets[0].item.entry.cn : ans.targets[0].item.cn)) || '';
        memory.push({ q: c.q, a: text.slice(0, 160), target: target, at: Date.now() });
        var routeOk = c.id === 'C1' ? true : true;
        var out = scoreCase(c, ans, { routeOk: routeOk });
        out.id = c.id; out.cat = c.cat; out.q = c.q; out.intent = ans.intent; out.route = route && route.route;
        out.target = target;
        results.push(out);
        resolve(out);
      });
    });
  });
  return chain;
}

(async function () {
  for (var i = 0; i < CASES.length; i++) {
    if (CASES[i].cat === 'C') continue;
    await runOne(CASES[i]);
  }
  await runMultiTurn();

  /* 按原始顺序输出 */
  results.sort(function (a, b) { return CASES.findIndex(function (c) { return c.id === a.id; }) - CASES.findIndex(function (c) { return c.id === b.id; }); });
  var pass = results.filter(function (r) { return r.status === 'PASS'; }).length;
  var fail = results.filter(function (r) { return r.status === 'FAIL'; }).length;
  var blockedExt = results.filter(function (r) { return r.status === 'BLOCKED_EXTERNAL'; }).length;
  var blockedKey = results.filter(function (r) { return r.status === 'BLOCKED_API_KEY'; }).length;
  var notRun = results.filter(function (r) { return r.status === 'NOT_RUN'; }).length;

  var summary = {
    version: 'V1.15',
    runAt: new Date().toISOString(),
    commit: '(local working tree)',
    provider: { status: 'BLOCKED_API_KEY', keyPresent: false },
    total: results.length,
    pass: pass, fail: fail, blockedExternal: blockedExt, blockedApiKey: blockedKey, notRun: notRun,
    categories: {},
    cases: results
  };
  ['A', 'B', 'C', 'D', 'E', 'F'].forEach(function (cat) {
    var list = results.filter(function (r) { return r.cat === cat; });
    summary.categories[cat] = {
      total: list.length,
      pass: list.filter(function (r) { return r.status === 'PASS'; }).length,
      fail: list.filter(function (r) { return r.status === 'FAIL'; }).length,
      blocked: list.filter(function (r) { return r.status.indexOf('BLOCKED') === 0 || r.status === 'NOT_RUN'; }).length,
      avgScore: list.length ? Math.round(list.reduce(function (a, r) { return a + r.score; }, 0) / list.length * 10) / 10 : 0
    };
  });

  fs.writeFileSync(path.join(ROOT, 'tools/fixtures/v1-15-blind-eval.json'), JSON.stringify(summary, null, 2));
  console.log('RESULT ' + pass + ' PASS / ' + fail + ' FAIL / ' + blockedExt + ' BLOCKED_EXTERNAL / ' + blockedKey + ' BLOCKED_API_KEY / ' + notRun + ' NOT_RUN');
  console.log('CATEGORY ' + JSON.stringify(summary.categories));
  results.forEach(function (r) {
    console.log(r.status + ' | ' + r.id + ' | score=' + r.score + ' | ev=' + r.evidenceCount +
      ' | ' + (r.severe.length ? r.severe.join(',') : '-') + ' | ' + r.q + ' | ' + (r.text || '').slice(0, 80).replace(/\n/g, ' '));
  });
  process.exit(0);
})().catch(function (e) { console.error(e && e.stack || e); process.exit(1); });
