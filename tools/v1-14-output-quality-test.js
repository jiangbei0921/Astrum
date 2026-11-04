/* ASTRUM · V1.14 最终答案输出质量测试（离线）
 *
 * 覆盖：
 *   - 简单参数题：verdict 与 evidence 同一事实不重复
 *   - 复杂模型答案：无独立 verdict、单一 analysis、结论列表/边界/追问进详情
 *   - meta.layout 单一正文标记
 *   - Sources.clean 不截断、保留段落、标题文字与列表条目
 *   - 同一论文多来源仍只算一个来源
 *   - 科研限制摘要级去重
 *   - 13 Agent / ADR-001 / 兼容接口不变
 *
 * 用法：node tools/v1-14-output-quality-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};
global.I18N = {
  current: function () { return 'zh'; },
  t: function (s) { return s; },
  tpl: function (s, a, b) {
    return String(s).replace('{0}', a == null ? '' : a).replace('{1}', b == null ? '' : b);
  },
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
var Adapter = global.AstroComposeAdapter;
var C = global.AstroAnswerComposer;
var S = global.Sources;
var CTX = { y: 2026, mo: 11, d: 4, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [];
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
}
function kinds(a) { return (a.sections || []).map(function (s) { return s.kind; }).join(','); }
function paper(id, title, doi, excerpt, query) {
  return {
    evidenceId: id, sourceId: 'src_' + id, sourceType: 'paper', title: title,
    uri: doi ? 'https://doi.org/' + doi : 'https://arxiv.org/abs/2401.00001',
    abstractOnly: true, retrievedAt: '2026-11-04T00:00:00Z', publishedAt: '2024-01-01',
    provenance: { tool: 'paper.search', query: query || 'M31' },
    content: { doi: doi || '', arxivId: doi ? '' : '2401.00001', authors: ['A. Author'], excerpt: excerpt, version: 'published' },
    trust: { level: 'peer-reviewed' }
  };
}
function compose(query, items) {
  var deps = {}, ids = [];
  items.forEach(function (ev, i) {
    var id = 'p' + (i + 1);
    deps[id] = { ok: true, items: [ev], evidenceIds: [ev.evidenceId], provenance: { tool: 'paper.search' } };
    ids.push(id);
  });
  var adapter = Adapter.create({ agentCore: AC });
  return adapter.compose({ query: query, from: ids }, CTX, AC.defaultConfig(), deps);
}

/* ---------- A. 简单参数题不重复 ---------- */
var simple = AC.buildAnswer('太阳的质量是多少？', CTX, AC.defaultConfig());
C.finalize(simple, { question: '太阳的质量是多少？' });
var vSimple = (simple.sections || []).filter(function (s) { return s.kind === 'verdict'; })[0];
var eSimple = (simple.sections || []).filter(function (s) { return s.kind === 'evidence'; })[0] || { items: [] };
var dupItem = (eSimple.items || []).filter(function (it) {
  return /质量/.test(String(it.label || '')) &&
    C.overlap(String(it.label || '') + ' ' + String(it.value || ''), vSimple && vSimple.head) >= 0.75;
})[0];
ok('A1 参数题保留结论数值', !!(vSimple && /1\.989|10\^30|千克|kg/.test(vSimple.head)), vSimple && vSimple.head);
ok('A2 依据中的同一数值已在结论出现', !!dupItem, dupItem && (dupItem.label + '=' + dupItem.value));
ok('A3 简单题不再生成评审章节', !/review/.test(kinds(simple)), kinds(simple));
ok('A4 简单题无追问/观测', !/followup|observe/.test(kinds(simple)), kinds(simple));

/* ---------- B. 复杂模型答案：单一正文 ---------- */
var out = compose('M31 的距离目前有哪些测量结果？', [
  paper('ev_m31_a', 'A Distance Measurement of M31 with the Hubble Space Telescope',
    '10.1086/123456', 'We measure a distance modulus of 24.38, corresponding to 0.75 ± 0.02 Mpc.', 'M31'),
  paper('ev_m31_b', 'An Independent Distance Measurement of the Andromeda Galaxy',
    '10.1086/654321', 'The distance is 0.83 ± 0.04 Mpc from detached eclipsing binaries.', 'M31')
]);
var ans = out.answer;
var longModel = '目前较可靠的 M31 距离测量集中在 0.75–0.83 Mpc。' +
  '不同方法给出的中心值与误差并不完全一致；0.75 Mpc 与 0.83 Mpc 的差异需要按样本与测量方法核对。' +
  '两篇论文都只提供摘要级证据，因此这些数值应视为研究结果，而不是已经统一的定论。' +
  '如果需要更严格的比较，应继续核对全文中的样本选择、消光修正与误差模型。' +
  '在这些信息补齐之前，最稳妥的做法是保留两个原始值，并说明它们各自的测量依据。' +
  '这类距离测量还会受到星际消光、造父变星定标与几何方法系统误差的影响。' +
  '因此，当前答案能够给出的是测量范围与差异，而不是一个唯一的“正确距离”。' +
  '后续若出现独立全文复核，应优先比较同一物理量在相同样本上的结果。' +
  '这就是本条回答的结论与边界。';
C.finalize(ans, { question: 'M31 的距离目前有哪些测量结果？', modelText: longModel });
var analyses = (ans.sections || []).filter(function (s) { return s.kind === 'analysis'; });
ok('B1 复杂答案没有独立 verdict', !(ans.sections || []).some(function (s) { return s.kind === 'verdict'; }), kinds(ans));
ok('B2 复杂答案只有一个 analysis 正文', analyses.length === 1, 'analysis=' + analyses.length + ' / ' + kinds(ans));
ok('B3 正文保留完整模型答案', analyses[0] && analyses[0].paragraphs.map(function (p) { return p.text; }).join('').indexOf('这就是本条回答的结论与边界。') >= 0,
  analyses[0] && analyses[0].paragraphs.length + ' paras');
ok('B4 科学结论列表不再留在正文', !(ans.sections || []).some(function (s) {
  return s.kind === 'list' && /科学结论|按证据强度/.test(String(s.title || ''));
}), kinds(ans));
ok('B5 边界/追问标记为详情', (ans.sections || []).filter(function (s) {
  return s.kind === 'boundary' || s.kind === 'followup';
}).every(function (s) { return s.detail === true; }), kinds(ans));
ok('B6 meta.layout 单一正文', ans.meta && ans.meta.layout && ans.meta.layout.body === 'single',
  ans.meta && JSON.stringify(ans.meta.layout));

/* ---------- C. 不截断 / 段落保留 ---------- */
var raw = '# 主要发现\n\n第一段：M31 的距离测量存在差异。\n\n```\nw(z) 公式\n```\n\n- 条目一\n- 条目二\n\n' +
  '长文本'.repeat(360) + '结尾标记';
var cleaned = S.cleanText(raw, 360);
ok('C1 长答案不被 maxChars 截断', cleaned.length > 1000 && cleaned.indexOf('结尾标记') >= 0, 'len=' + cleaned.length);
ok('C2 段落结构保留', /\n\n/.test(cleaned), JSON.stringify(cleaned.slice(0, 80)));
ok('C3 标题文字保留但去掉 #', cleaned.indexOf('主要发现') >= 0 && !/#/.test(cleaned), cleaned.slice(0, 40));
ok('C4 列表条目保留', /· 条目一/.test(cleaned), cleaned.slice(0, 160));
ok('C5 代码围栏内文字保留', /w\(z\) 公式/.test(cleaned), cleaned.slice(0, 160));

/* ---------- D. 同一论文去重 ---------- */
var same = compose('M31 的距离测量是否一致？', [
  paper('ev_same_a', 'A Distance Measurement of M31', '10.1086/123456', 'Distance 0.75 Mpc.', 'M31'),
  paper('ev_same_b', 'A Distance Measurement of M31', '10.1086/123456', 'Distance 0.75 Mpc.', 'M31')
]);
var sameBrief = C.brief(same.answer, { question: 'M31 的距离测量是否一致？' });
ok('D1 同一论文只算一个来源', same.answer.research.papers.length === 1 &&
  sameBrief.papers.length === 1 && sameBrief.evidence.length === 1,
  'papers=' + same.answer.research.papers.length + '/brief=' + sameBrief.papers.length +
  '/ev=' + sameBrief.evidence.length);

/* ---------- E. 限制摘要级去重 ---------- */
var limitAns = {
  query: 'DESI DR2', intent: 'unknown', targets: [], sections: [{ kind: 'boundary', text: '旧边界' }],
  research: {
    papers: [], evidence: [], conflicts: [], differences: [], sources: [],
    gaps: ['2 篇论文仅获得摘要，未获取全文；', '部分结论仅基于论文摘要，未阅读全文。'],
    limitations: []
  },
  meta: {}
};
C.finalize(limitAns, { question: 'DESI DR2' });
var lim = C.scientificLimits(limitAns);
ok('E1 同一摘要限制只保留一条', lim.length === 1, JSON.stringify(lim));
ok('E2 限制文本去掉重复标点', lim[0] && !/[；;，,。]$/.test(lim[0]), lim[0]);

/* ---------- F. 既有契约 ---------- */
ok('F1 13 Agent 不变', AC.AGENTS.length === 13, AC.AGENTS.length);
ok('F2 ADR-001 预算不变', global.AstroTask.makeBudget('L1').limit.llmCalls === 0 &&
  global.AstroTask.makeBudget('L2').limit.llmCalls === 1 &&
  global.AstroTask.makeBudget('L3').limit.llmCalls === 2,
  JSON.stringify({
    L1: global.AstroTask.makeBudget('L1').limit.llmCalls,
    L2: global.AstroTask.makeBudget('L2').limit.llmCalls,
    L3: global.AstroTask.makeBudget('L3').limit.llmCalls
  }));
ok('F3 兼容接口存在', typeof AC.buildAnswer === 'function' && typeof AC.detectIntent === 'function' &&
  typeof global.Research.toSections === 'function' && typeof C.finalize === 'function' &&
  typeof Adapter.create === 'function');

var pass = results.filter(function (r) { return r.pass; }).length;
console.log('RESULT ' + pass + '/' + results.length);
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
});
process.exit(pass === results.length ? 0 : 1);
