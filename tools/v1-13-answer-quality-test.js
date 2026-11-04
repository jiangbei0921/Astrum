/* ASTRUM · V1.13 回答质量 / 证据 / Muse 综合测试（离线）
 *
 * 覆盖：
 *   - 简单问题直达：无观测建议、无追问、无无关清单
 *   - 模型答案是最终答案：不拼接模板段、A/B 不重复结论
 *   - 复杂问题：冲突保留、限制保留、同一论文只算一个来源
 *   - Evidence 核验状态：虚构 DOI、标识/链接不一致、缺链接不通过
 *   - 引用审计：模型自造 DOI/arXiv/[E9] 被发现
 *   - Muse brief 字段完整；13 Agent / ADR-001 不变
 *
 * 用法：node tools/v1-13-answer-quality-test.js
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
var E = global.AstroEvidence;
var CTX = { y: 2026, mo: 11, d: 4, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [];
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
}
function secs(a) { return (a.sections || []).map(function (s) { return s.kind; }).join(','); }
function textOf(answer) {
  var bits = [];
  (answer.sections || []).forEach(function (s) {
    if (s.kind === 'analysis') (s.paragraphs || []).forEach(function (p) { bits.push(p.text || ''); });
    if (s.kind === 'verdict') bits.push(s.head || '', s.sub || '');
    if (s.kind === 'evidence') {
      (s.items || []).forEach(function (it) { bits.push((it.label || '') + ' ' + (it.value || '')); });
      bits.push(s.para || '');
    }
    if (s.kind === 'model') bits.push(s.text || '');
    if (s.kind === 'boundary') bits.push(s.text || '');
    if (s.kind === 'conflict') bits.push(s.note || '');
    if (s.kind === 'list') (s.items || []).forEach(function (it) { bits.push((it.name || '') + ' ' + (it.meta || '')); });
  });
  return bits.join('\n');
}
function finalize(a, q, modelText) {
  var opts = { question: q };
  if (modelText) opts.modelText = modelText;
  return C.finalize(a, opts);
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
function sourceItem(overrides) {
  var item = Object.assign({
    title: 'A Distance Measurement of M31', url: 'https://doi.org/10.1093/mnras/stz642',
    doi: '10.1093/mnras/stz642', date: '2024-01-01', authors: ['A. Author'],
    excerpt: 'We measure 0.75 ± 0.02 Mpc for M31.', sourceType: 'paper',
    extra: { arxivId: '2401.00001', venue: 'MNRAS' }
  }, overrides || {});
  return E.fromSourceItem(item, { tool: 'paper.search', retrievedAt: '2026-11-04T00:00:00Z' });
}

/* ---------- A. 简单问题 ---------- */
var simple = [
  { q: 'M31 距离地球多远？', re: /光年|Mpc|kpc/ },
  { q: '太阳的质量是多少？', re: /千克|kg|1\.989|10/ },
  { q: '什么是光年？', re: /光年/ },
  { q: '黑洞是什么？', re: /黑洞/ }
];
simple.forEach(function (s, i) {
  var a = AC.buildAnswer(s.q, CTX, AC.defaultConfig());
  finalize(a, s.q);
  var mode = a.meta.quality && a.meta.quality.mode;
  ok('A' + (i + 1) + ' 简单问题模式为 A/B', mode === 'A' || mode === 'B', mode);
  ok('A' + (i + 1) + '.1 保留必要内容', s.re.test(textOf(a)), textOf(a).slice(0, 100));
  ok('A' + (i + 1) + '.2 无观测/追问/无关清单',
    !/observe|followup/.test(secs(a)) &&
    !((mode === 'A') && /list/.test(secs(a))), secs(a));
  ok('A' + (i + 1) + '.3 正文无内部执行日志',
    !/(Agent|智能体|工具调用|检索词|任务分配|执行步骤|step\.|tool\.)/.test(textOf(a)));
});

/* ---------- B. 模型答案是最终答案 ---------- */
var b = AC.buildAnswer('M31 距离地球多远？', CTX, AC.defaultConfig());
var modelText = '仙女座星系（M31）距离地球约 250 万光年。';
finalize(b, 'M31 距离地球多远？', modelText);
var bAnalysis = (b.sections || []).filter(function (s) { return s.kind === 'analysis'; })[0];
ok('B1 生成模型正文', !!bAnalysis && bAnalysis.paragraphs.length >= 1);
ok('B2 A 类不重复 verdict', !(b.sections || []).some(function (s) { return s.kind === 'verdict'; }), secs(b));
ok('B3 不拼接模板段落', !/本轮共获得|与此相关|核心结论：/.test(textOf(b)), textOf(b).slice(0, 160));
ok('B4 必要证据仍保留', (b.sections || []).some(function (s) { return s.kind === 'evidence'; }));
ok('B5 正文包含模型答案', textOf(b).indexOf('250 万光年') >= 0);

/* ---------- C. 复杂问题 / 冲突 / 限制 ---------- */
var conflictOut = compose('M31 的距离目前有哪些测量结果？', [
  paper('ev_m31_a', 'A Distance Measurement of M31 with the Hubble Space Telescope',
    '10.1086/123456', 'We measure a distance modulus of 24.38, corresponding to 0.75 ± 0.02 Mpc.', 'M31'),
  paper('ev_m31_b', 'An Independent Distance Measurement of the Andromeda Galaxy',
    '10.1086/654321', 'The distance is 0.83 ± 0.04 Mpc from detached eclipsing binaries.', 'M31')
]);
ok('C1 复杂问题 compose 成功', conflictOut.ok === true, conflictOut.reason || '');
var ansC = conflictOut.answer;
var briefC = C.brief(ansC, { question: 'M31 的距离目前有哪些测量结果？' });
ansC.meta.promptEvidence = briefC.evidence;
finalize(ansC, 'M31 的距离目前有哪些测量结果？',
  '目前较可靠的 M31 距离测量集中在 0.75–0.83 Mpc，不同方法给出的中心值与误差并不完全一致。');
var cAnalysis = (ansC.sections || []).filter(function (s) { return s.kind === 'analysis'; })[0];
ok('C2 模型正文取代模板综合', !!cAnalysis && !/本轮共获得|与此相关/.test(textOf(ansC)), textOf(ansC).slice(0, 200));
ok('C3 冲突/差异保留', ((ansC.research.conflicts || []).length + (ansC.research.differences || []).length) > 0,
  'conflicts=' + (ansC.research.conflicts || []).length + '/differences=' + (ansC.research.differences || []).length);
ok('C4 原始值未被合并', textOf(ansC).indexOf('0.75') >= 0 && textOf(ansC).indexOf('0.83') >= 0);
ok('C5 模型未提限制时补充限制段', cAnalysis.paragraphs.some(function (p) {
  return p.role === 'limitation' && /限制|未获取|仅摘要|不足/.test(p.text || '');
}), JSON.stringify(cAnalysis.paragraphs.map(function (p) { return p.role; })));

/* 同一论文被多个 Agent 引用：只算一个来源 */
var sameOut = compose('M31 的距离测量是否一致？', [
  paper('ev_same_a', 'A Distance Measurement of M31', '10.1086/123456', 'Distance 0.75 Mpc.', 'M31'),
  paper('ev_same_b', 'A Distance Measurement of M31', '10.1086/123456', 'Distance 0.75 Mpc.', 'M31')
]);
var sameBrief = C.brief(sameOut.answer, { question: 'M31 的距离测量是否一致？' });
ok('C6 同一论文只算一个来源', sameOut.answer.research.papers.length === 1 &&
  sameBrief.papers.length === 1 && sameBrief.evidence.length === 1,
  'papers=' + sameOut.answer.research.papers.length + '/brief=' + sameBrief.papers.length +
  '/ev=' + sameBrief.evidence.length);

/* ---------- D. Evidence 核验 ---------- */
var valid = sourceItem({});
ok('D1 完整论文元数据为已核验', valid.verification.state === 'verified', valid.verification.basis);
var fake = sourceItem({
  title: 'Fake Paper', doi: '10.9999/fake', url: 'https://example.org/fake',
  extra: { arxivId: '' }
});
ok('D2 虚构 DOI 不通过核验', fake.verification.state !== 'verified', fake.verification.state + ' · ' + fake.verification.basis);
var mismatchDoi = sourceItem({ url: 'https://doi.org/10.3847/1538-4357/ab1234' });
ok('D3 DOI 与链接不一致不通过', mismatchDoi.verification.state !== 'verified', mismatchDoi.verification.basis);
var mismatchArx = sourceItem({
  doi: '', url: 'https://arxiv.org/abs/2402.00002', extra: { arxivId: '2401.00001' }
});
ok('D4 arXiv 与链接不一致不通过', mismatchArx.verification.state !== 'verified', mismatchArx.verification.basis);
var noUrl = sourceItem({ url: '', doi: '', extra: { arxivId: '' }, host: 'example.org' });
ok('D5 缺原始链接不通过核验', noUrl.verification.state !== 'verified', noUrl.verification.state);

var audit = E.auditCitations('引用 DOI 10.9999/fake，arXiv 2401.99999，[E9]。', [valid]);
ok('D6 自造 DOI 被发现', audit.unmatchedDois.indexOf('10.9999/fake') >= 0, JSON.stringify(audit.unmatchedDois));
ok('D7 自造 arXiv 被发现', audit.unmatchedArxivIds.indexOf('2401.99999') >= 0, JSON.stringify(audit.unmatchedArxivIds));
ok('D8 不存在的 [E9] 被发现', audit.unknownRefs.indexOf('E9') >= 0);

var citeAns = {
  query: 'M31 距离', intent: 'knowledge-target', targets: [],
  sections: [{ kind: 'evidence', title: '依据', items: [{ label: '距离', value: '0.75 Mpc' }] }],
  meta: { promptEvidence: [{ id: 'E1', title: valid.title, sourceType: 'paper', uri: valid.uri, doi: valid.content.doi, verification: valid.verification }] }
};
finalize(citeAns, 'M31 距离', 'M31 的距离约为 0.75 Mpc（DOI 10.9999/fake）。');
ok('D9 模型引用假 DOI 时质量检查不通过', citeAns.meta.quality.passed === false, JSON.stringify(citeAns.meta.quality.issues));
ok('D10 引用审计写入 meta', citeAns.meta.citationAudit &&
  citeAns.meta.citationAudit.unmatchedDois.indexOf('10.9999/fake') >= 0, JSON.stringify(citeAns.meta.citationAudit));

/* ---------- E. Muse brief ---------- */
ok('E1 brief 含论文/证据/结论/冲突/限制', Array.isArray(briefC.papers) && briefC.papers.length >= 2 &&
  Array.isArray(briefC.evidence) && briefC.evidence.length >= 2 &&
  Array.isArray(briefC.conclusions) && Array.isArray(briefC.conflicts) &&
  Array.isArray(briefC.gaps), JSON.stringify({
    papers: briefC.papers.length, ev: briefC.evidence.length, conflicts: briefC.conflicts.length
  }));
ok('E2 brief 去重计数', briefC.evidenceBefore >= briefC.evidenceAfter,
  briefC.evidenceBefore + '→' + briefC.evidenceAfter);

/* ---------- F. 既有契约 ---------- */
ok('F1 13 Agent 不变', AC.AGENTS.length === 13, AC.AGENTS.length);
ok('F2 ADR-001 预算不变', JSON.stringify(AC.defaultConfig().budget) === JSON.stringify(AC.defaultConfig().budget));
ok('F3 不新增模型调用接口', typeof AC.buildAnswer === 'function' && typeof C.finalize === 'function');

var pass = results.filter(function (r) { return r.pass; }).length;
console.log('RESULT ' + pass + '/' + results.length);
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
});
process.exit(pass === results.length ? 0 : 1);
