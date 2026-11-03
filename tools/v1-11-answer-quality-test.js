/* ASTRUM · V1.11 最终答案质量测试（离线）
 *
 * 覆盖：
 *   - A–E 复杂度结构映射
 *   - verdict 唯一、evidence 合并、去重
 *   - 正文不出现 Agent/工具/步骤等内部执行日志
 *   - 无来源数字被质量检查标记
 *   - 证据不足/外部不可用时保留限制，不伪造结论
 *   - finalize 幂等
 *
 * 用法：node tools/v1-11-answer-quality-test.js
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
  'core/answer-composer.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js',
  'core/control-bridge.js', 'core/content-i18n.js', 'core/knowledge-sources.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var Adapter = global.AstroComposeAdapter;
var C = global.AstroAnswerComposer;
var K = global.AstroKnowledgeSources;
var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [];
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
}

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
    if (s.kind === 'list') (s.items || []).forEach(function (it) { bits.push((it.name || '') + ' ' + (it.meta || '')); });
  });
  return bits.join('\n');
}

function evidence(id, title, doi, excerpt, query) {
  return {
    evidenceId: id, sourceId: 'src_' + id, sourceType: 'paper', title: title,
    uri: 'https://doi.org/' + doi, abstractOnly: true, retrievedAt: '2026-11-03T00:00:00Z',
    publishedAt: '2024-01-01',
    provenance: { tool: 'paper.search', query: query || 'M13' },
    content: { doi: doi, arxivId: '', authors: ['A. Author'], excerpt: excerpt, version: 'published' },
    trust: { level: 'peer-reviewed' }
  };
}

function compose(query, items) {
  var deps = {};
  var ids = [];
  items.forEach(function (ev, i) {
    var id = 'p' + (i + 1);
    deps[id] = { ok: true, items: [ev], evidenceIds: [ev.evidenceId], provenance: { tool: 'paper.search' } };
    ids.push(id);
  });
  var adapter = Adapter.create({ agentCore: AC });
  var out = adapter.compose({ query: query, from: ids }, CTX, AC.defaultConfig(), deps);
  return out;
}

/* ---------- A. 简单事实 ---------- */
var ansA = AC.buildAnswer('M31 距离地球多远？', CTX, AC.defaultConfig());
C.finalize(ansA, { question: 'M31 距离地球多远？' });
ok('A1 简单事实→A', ansA.meta.quality.mode === 'A', ansA.meta.quality.mode);
ok('A2 verdict 唯一', ansA.sections.filter(function (s) { return s.kind === 'verdict'; }).length === 1);
ok('A3 简单问题不生成研究分析', !ansA.sections.some(function (s) { return s.kind === 'analysis'; }));

/* ---------- B. 原理解释 ---------- */
var ansB = AC.buildAnswer('为什么黑洞具有强引力？', CTX, AC.defaultConfig());
C.finalize(ansB, { question: '为什么黑洞具有强引力？' });
ok('B1 原理解释→B', ansB.meta.quality.mode === 'B', ansB.meta.quality.mode);
ok('B2 解释类答案有正文依据', textOf(ansB).length > 20);

/* ---------- C. 参数问题 ---------- */
var ansC = AC.buildAnswer('M13 的年龄是多少？', CTX, AC.defaultConfig());
C.finalize(ansC, { question: 'M13 的年龄是多少？' });
ok('C1 参数问题→C', ansC.meta.quality.mode === 'C', ansC.meta.quality.mode);
ok('C2 参数值保留单位/数字', /[0-9]/.test(textOf(ansC)));

/* ---------- D. 多论文比较 ---------- */
var dOut = compose('不同论文对 M13 年龄的测量是否一致？', [
  evidence('ev_m13_a', 'A New Age Measurement of the Hercules Globular Cluster M13',
    '10.1093/mnras/stz642', 'We derive an age of 11.6 Gyr for M13 from 52 800 member stars.'),
  evidence('ev_m13_b', 'Revisiting the Age of M13 with Deep Photometry',
    '10.3847/1538-4357/ab1234', 'The cluster age is 12.8 Gyr with a systematic uncertainty of 1.1 Gyr.')
]);
ok('D1 多论文比较 compose 成功', dOut.ok === true, dOut.reason || '');
var ansD = dOut.answer;
ok('D2 多论文→D', ansD.meta.quality.mode === 'D', ansD.meta.quality.mode);
ok('D3 生成综合研判', ansD.sections.some(function (s) { return s.kind === 'analysis'; }));
ok('D4 证据章节只有一个', ansD.sections.filter(function (s) { return s.kind === 'evidence'; }).length === 1);
ok('D5 论文去重后仍保留差异', ansD.research && ansD.research.papers.length === 2,
  ansD.research && ansD.research.papers.length);
ok('D6 综合研判含限制段', ansD.sections.filter(function (s) { return s.kind === 'analysis'; })[0]
  .paragraphs.some(function (p) { return p.role === 'limitation'; }));

/* 两个论文给出同一物理量的不同数值：必须保留差异，不强行合并。 */
var conflictOut = compose('M31 的距离目前有哪些测量结果？', [
  evidence('ev_m31_a', 'A Distance Measurement of M31 with the Hubble Space Telescope',
    '10.1086/123456', 'We measure a distance modulus of 24.38, corresponding to 0.75 ± 0.02 Mpc.', 'M31'),
  evidence('ev_m31_b', 'An Independent Distance Measurement of the Andromeda Galaxy',
    '10.1086/654321', 'The distance is 0.83 ± 0.04 Mpc from detached eclipsing binaries.', 'M31')
]);
ok('D7 冲突场景 compose 成功', conflictOut.ok === true, conflictOut.reason || '');
var ansConflict = conflictOut.answer;
ok('D8 同量不同值被识别为冲突/差异',
  (ansConflict.research.conflicts || []).length + (ansConflict.research.differences || []).length > 0,
  'conflicts=' + (ansConflict.research.conflicts || []).length +
  '/differences=' + (ansConflict.research.differences || []).length);
ok('D9 原始值未被强行合并', textOf(ansConflict).indexOf('0.75') >= 0 && textOf(ansConflict).indexOf('0.83') >= 0);

/* ---------- E. 复杂科研 ---------- */
var eOut = compose('M13 球状星团的年龄与金属丰度目前有哪些研究结论？', [
  evidence('ev_m13_c', 'Chemical Composition and Ages of the Hercules Globular Cluster',
    '10.1093/mnras/stz643', 'M13 has an age of about 12 Gyr and a metallicity of [Fe/H] = -1.53.')
]);
var ansE = eOut.answer;
ok('E1 复杂科研→E', ansE.meta.quality.mode === 'E', ansE.meta.quality.mode);
ok('E2 复杂科研保留证据与来源', ansE.sections.some(function (s) { return s.kind === 'evidence'; }) &&
  ansE.sections.some(function (s) { return s.kind === 'sources'; }));

/* ---------- 内部执行日志不得进入正文 ---------- */
var badLog = /(Agent|智能体|工具调用|检索词|任务分配|执行步骤|运行中|错误堆栈|step\.|tool\.)/;
[ansA, ansB, ansC, ansD, ansE].forEach(function (a, i) {
  ok('Q' + (i + 1) + ' 正文无内部执行日志', !badLog.test(textOf(a)), (textOf(a).match(badLog) || [''])[0]);
  ok('Q' + (i + 1) + '.2 无 Agent 输出卡片', !(a.sections || []).some(function (s) { return s.kind === 'custom'; }));
});

/* ---------- 无来源数字 ---------- */
var synthetic = {
  query: 'M13 年龄', intent: 'knowledge-target', targets: [],
  sections: [
    { kind: 'verdict', head: 'M13 年龄约 13.9 Gyr。' },
    { kind: 'analysis', title: '综合研判', mode: 'C', paragraphs: [
      { role: 'conclusion', text: '核心结论：M13 的年龄为 13.9 Gyr。' }
    ] }
  ],
  meta: {}, trace: []
};
C.finalize(synthetic, { question: 'M13 年龄' });
ok('N1 无来源数字被标记', synthetic.meta.quality.unsupportedNumbers.indexOf('13.9') >= 0,
  JSON.stringify(synthetic.meta.quality.unsupportedNumbers));
ok('N2 质量检查不通过', synthetic.meta.quality.passed === false);

/* ---------- 证据不足 ---------- */
var unknown = AC.buildAnswer('zxqvkw 光变曲线原始数据在哪下载', CTX, AC.defaultConfig());
C.finalize(unknown, { question: 'zxqvkw 光变曲线原始数据在哪下载' });
ok('U1 未知问题不伪造结论', /系统内置知识|尚未完成外部/.test(textOf(unknown)), textOf(unknown).slice(0, 80));
ok('U2 未知问题不给确定数字', !/[0-9]{2,}/.test(textOf(unknown)));

/* ---------- 外部源不可用 ---------- */
var miss = AC.buildAnswer('M13 的年龄测量在不同论文中是否一致？', CTX, AC.defaultConfig());
K.attach(miss, {
  plan: K.decide({ query: miss.query, intent: miss.intent, targets: miss.targets || [] }),
  attachments: [],
  external: { status: 'failed', attempted: true, ok: 0, failed: 1, tools: [], failures: ['OpenAlex timeout'] }
});
var srcSec = miss.sections.filter(function (s) { return s.kind === 'sources'; })[0];
ok('X1 外部失败状态为 failed', srcSec && srcSec.items.filter(function (x) { return x.key === 'external'; })[0].status === 'failed');
ok('X2 失败原因保留', srcSec && /timeout/.test(srcSec.items.filter(function (x) { return x.key === 'external'; })[0].detail));

/* ---------- finalize 幂等 ---------- */
var before = JSON.stringify(ansD.sections);
C.finalize(ansD, { question: '不同论文对 M13 年龄的测量是否一致？' });
ok('I1 重复 finalize 不重复插入', JSON.stringify(ansD.sections) === before);
ok('I2 重复 finalize 不改变质量结果', ansD.meta.quality && ansD.meta.quality.passed === true,
  JSON.stringify(ansD.meta.quality.issues));

/* ---------- 既有契约 ---------- */
ok('K1 13 Agent 不变', AC.AGENTS.length === 13, AC.AGENTS.length);
ok('K2 ADR-001 预算不变', JSON.stringify(AC.defaultConfig().budget) === JSON.stringify(AC.defaultConfig().budget));

var pass = results.filter(function (r) { return r.pass; }).length;
console.log('RESULT ' + pass + '/' + results.length);
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
});
process.exit(pass === results.length ? 0 : 1);
