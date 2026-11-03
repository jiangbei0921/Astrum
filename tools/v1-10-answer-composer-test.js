/* ASTRUM · V1.10 最终回答整合测试
 *
 * 覆盖：
 *   - 五类回答模式（A 事实 / B 原理 / C 数据 / D 多论文对比 / E 综合科研）
 *   - Evidence 去重、重复 verdict 清理、结构排序
 *   - Claim → Evidence 引用检查
 *   - 无来源数字、无证据确定性措辞
 *   - 缺口/限制声明
 *   - 不改变 evidenceRefs / 原始证据 ID
 *
 * 用法：node tools/v1-10-answer-composer-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/answer-composer.js'));

var C = global.AstroAnswerComposer;
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}
function paper(title, id) {
  return { title: title, abstractOnly: true, doi: '10.1093/mnras/' + id, date: '2026-01-01', url: 'https://doi.org/' + id };
}
function baseAnswer(extra) {
  return Object.assign({
    query: 'M13 的年龄和金属丰度测量在不同论文中是否一致？',
    intent: 'knowledge-target',
    targets: [],
    sections: [
      { kind: 'verdict', head: 'M13 是球状星团。' },
      { kind: 'evidence', title: '依据', items: [{ label: '类型', value: '球状星团' }] },
      { kind: 'boundary', mode: 'uncertain', text: '仅摘要。' }
    ],
    meta: {}
  }, extra || {});
}
function researchOf(extra) {
  var ids = ['ev_a', 'ev_b'];
  var rep = Object.assign({
    reportId: 'rep_test',
    summary: '现有摘要支持 M13 为球状星团，但年龄测量仍需全文核对。',
    papers: [paper('A new study of the variable star population in M13', 'stz642'), paper('Globular Star Clusters', '038365c0'), paper('Chemical composition of M13', 'vak2021')],
    evidence: [{ evidenceId: 'ev_a', title: 'M13 A', excerpt: 'age 11.6 Gyr' }, { evidenceId: 'ev_b', title: 'M13 B', excerpt: 'metallicity -1.5' }],
    conclusions: [
      { text: 'M13 是球状星团。', level: 'verified', evidenceRefs: ['ev_a'], evidenceScope: 'abstract-only' },
      { text: '年龄测量约 116 亿年。', level: 'inferred', evidenceRefs: ['ev_a', 'ev_b'], evidenceScope: 'abstract-only' }
    ],
    conflicts: [{ family: '年龄', spread: 12, values: [{ raw: '11.6 Gyr' }, { raw: '13.0 Gyr' }] }],
    gaps: ['3 篇论文仅获得摘要，未获取全文', '未获得 SIMBAD 天体参数'],
    limitations: ['部分结论仅基于论文摘要，未阅读全文。']
  }, extra || {});
  return rep;
}

/* 1. 模式选择 */
(function () {
  ok('A1 简单事实 → A', C.modeFor({ query: 'M13 是什么类型的星团？', sections: [], meta: {} }) === 'A');
  ok('A2 原理解释 → B', C.modeFor({ query: '为什么恒星会形成？', sections: [], meta: {} }) === 'B');
  ok('A3 对比+多论文 → D',
    C.modeFor({ query: '不同论文对 M13 年龄的测量是否一致？', research: researchOf(), sections: [], meta: {} }) === 'D');
  ok('A4 有论文证据 → E',
    C.modeFor({ query: 'M13 的年龄和金属丰度研究现状如何？', research: researchOf(), sections: [], meta: {} }) === 'E');
  ok('A5 显式 mode 可覆盖', C.modeFor({ query: '', sections: [], meta: {} }, { mode: 'C' }) === 'C');
})();

/* 2. 完整 research 回答整合 */
(function () {
  var a = baseAnswer({
    research: researchOf(),
    sections: [
      { kind: 'verdict', head: 'M13 是球状星团。' },
      { kind: 'verdict', head: '重复结论。' },
      { kind: 'evidence', title: '研究证据 · 真实来源', items: [{ label: '论文 A', value: 'DOI 10.1093/mnras/stz642' }, { label: '论文 A', value: 'DOI 10.1093/mnras/stz642' }] },
      { kind: 'evidence', title: '依据', items: [{ label: '类型', value: '球状星团' }, { label: '类型', value: '球状星团' }] },
      { kind: 'list', title: '科学结论（按证据强度分级）', items: [{ name: 'M13 是球状星团。', meta: '已验证', text: 'ev_a' }] },
      { kind: 'boundary', mode: 'uncertain', text: '仅摘要。' },
      { kind: 'followup', items: ['再问一个问题'] }
    ]
  });
  var beforeRefs = JSON.stringify(a.research.conclusions.map(function (c) { return c.evidenceRefs; }));
  C.finalize(a, { question: a.query });
  ok('B1 只保留一个 verdict', a.sections.filter(function (s) { return s.kind === 'verdict'; }).length === 1);
  ok('B2 生成 analysis 段', a.sections.some(function (s) { return s.kind === 'analysis'; }));
  ok('B3 结论在分析之前', a.sections.findIndex(function (s) { return s.kind === 'verdict'; }) <
    a.sections.findIndex(function (s) { return s.kind === 'analysis'; }));
  ok('B4 证据合并为一个章节', a.sections.filter(function (s) { return s.kind === 'evidence'; }).length === 1);
  var ev = a.sections.filter(function (s) { return s.kind === 'evidence'; })[0];
  ok('B5 重复证据已去重', ev.items.length === 2, ev.items.length);
  ok('B6 analysis 段落有逻辑衔接', (a.sections.filter(function (s) { return s.kind === 'analysis'; })[0].paragraphs || [])
    .some(function (p) { return /在此基础上|与此相关|需要注意的是|综合来看/.test(p.text); }));
  ok('B7 冲突被写入分析', (a.sections.filter(function (s) { return s.kind === 'analysis'; })[0].paragraphs || [])
    .some(function (p) { return p.role === 'conflict'; }));
  ok('B8 限制被保留', (a.sections.filter(function (s) { return s.kind === 'analysis'; })[0].paragraphs || [])
    .some(function (p) { return p.role === 'limitation'; }));
  ok('B9 evidenceRefs 未被改写', beforeRefs === JSON.stringify(a.research.conclusions.map(function (c) { return c.evidenceRefs; })));
  ok('B10 引用校验通过', a.meta.quality.badRefs.length === 0 && a.meta.quality.refs === 3, a.meta.quality.refs);
  ok('B11 质量检查通过', a.meta.quality.passed === true, JSON.stringify(a.meta.quality.issues));
  ok('B12 mode 为 D/E', ['D', 'E'].indexOf(a.meta.quality.mode) >= 0, a.meta.quality.mode);
})();

/* 3. 坏引用与重复证据 */
(function () {
  var rep = researchOf();
  rep.conclusions[1].evidenceRefs = ['ev_a', 'ev_missing'];
  var a = baseAnswer({ research: rep });
  C.finalize(a, { question: a.query });
  ok('C1 坏引用被识别', a.meta.quality.badRefs.indexOf('ev_missing') >= 0);
  ok('C2 坏引用使质量检查不通过', a.meta.quality.passed === false);
  ok('C3 坏引用不被删除', rep.conclusions[1].evidenceRefs.indexOf('ev_missing') >= 0);
})();

/* 4. 模型表述审计 */
(function () {
  var a = baseAnswer({ research: researchOf() });
  C.finalize(a, { question: a.query, modelText: '结论：M13 年龄一定是 11.6 Gyr，误差 0.3。' });
  var analysis = a.sections.filter(function (s) { return s.kind === 'analysis'; })[0];
  ok('D1 模型表述进入 analysis', analysis && analysis.paragraphs[0].role === 'model');
  ok('D2 无来源数字被标记', a.meta.quality.unsupportedNumbers.indexOf('0.3') >= 0, a.meta.quality.unsupportedNumbers);
  ok('D3 确定性措辞被标记', a.meta.quality.issues.some(function (i) { return i.kind === 'certainty-without-evidence'; }));
  ok('D4 模型表述不新增 Evidence', (a.research.evidence || []).length === 2);
})();

/* 5. 不支持数字但全部有来源时不误报 */
(function () {
  var a = baseAnswer({ research: researchOf() });
  C.finalize(a, { question: a.query, modelText: '结论：M13 年龄约 11.6 Gyr，来自摘要证据。' });
  ok('E1 有来源的 11.6 不误报', a.meta.quality.unsupportedNumbers.length === 0, a.meta.quality.unsupportedNumbers);
})();

/* 6. 非研究答案不被强行加 analysis */
(function () {
  var a = { query: '今晚能看到什么？', intent: 'tonight', sections: [{ kind: 'verdict', head: '今晚可见 M42。' }, { kind: 'observe', items: [] }], meta: {} };
  C.finalize(a, { question: a.query });
  ok('F1 无 research 不生成 analysis', !a.sections.some(function (s) { return s.kind === 'analysis'; }));
  ok('F2 原有章节保留', a.sections.length === 2, a.sections.length);
  ok('F3 仍产生产生质量元数据', !!a.meta.quality);
})();

/* 7. 幂等 */
(function () {
  var a = baseAnswer({ research: researchOf() });
  C.finalize(a, { question: a.query });
  var n = a.sections.length;
  C.finalize(a, { question: a.query });
  ok('G1 重复 finalize 不重复插入', a.sections.length === n, a.sections.length + '/' + n);
})();

console.log('');
results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : '')); });
console.log('');
console.log('RESULT ' + pass + '/' + results.length);
process.exitCode = pass === results.length ? 0 : 1;
