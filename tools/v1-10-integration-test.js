/* ASTRUM · V1.10 三项改造集成测试
 *
 * 覆盖：
 *   - 外部论文证据 → Report → 最终回答 analysis / evidence / sources 结构
 *   - Claim → Evidence 引用保持
 *   - 系统内置知识未命中 → 如实文案，不再写“没有依据”
 *   - 中文/英文论文展示切换
 *   - 语言切换不重新执行研究、不重新调用检索
 *   - 翻译不改变 DOI/arXiv/Evidence/evidenceRefs
 *
 * 用法：node tools/v1-10-integration-test.js
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
global.sessionStorage = global.localStorage;
var LANG = 'zh';
global.I18N = {
  current: function () { return LANG; },
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

var AC = global.AgentCore, Adapter = global.AstroComposeAdapter;
var C = global.AstroAnswerComposer, K = global.AstroKnowledgeSources, I = global.AstroContentI18n;
var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}

function paperEvidence() {
  return {
    evidenceId: 'ev_m13_age',
    sourceId: 'src_openalex',
    sourceType: 'paper',
    title: 'A new study of the variable star population in the Hercules globular cluster (M13; NGC 6205)',
    uri: 'https://doi.org/10.1093/mnras/stz642',
    abstractOnly: true,
    retrievedAt: '2026-11-03T00:00:00Z',
    publishedAt: '2019-03-05',
    content: {
      doi: '10.1093/mnras/stz642',
      arxivId: '1902.06742',
      authors: ['X. Mei', 'D. Xu'],
      excerpt: 'A membership analysis of 52 800 stars in the field of M13 is presented. The cluster age is about 11.6 Gyr.',
      version: 'published'
    },
    trust: { level: 'peer-reviewed' }
  };
}

(async function () {
  /* 1. 外部论文 → Report → 统一回答 */
  var deps = {
    p1: { ok: true, items: [paperEvidence()], evidenceIds: ['ev_m13_age'], provenance: { tool: 'paper.search' } }
  };
  var adapter = Adapter.create({ agentCore: AC });
  var out = adapter.compose({ query: 'M13 的年龄测量在不同论文中是否一致？', from: ['p1'] }, CTX, AC.defaultConfig(), deps);
  ok('A1 compose 成功', out.ok === true, out.ok ? '' : out.reason);
  if (!out.ok) {
    console.log('COMPOSE FAILED', out.reason);
    process.exitCode = 1;
    return;
  }
  var ans = out.answer;
  ok('A2 生成 research 报告', !!ans.research && ans.research.papers.length === 1);
  ok('A3 论文 DOI 保留', ans.research.papers[0].doi === '10.1093/mnras/stz642');
  ok('A4 生成综合研判', ans.sections.some(function (s) { return s.kind === 'analysis'; }));
  var ana = ans.sections.filter(function (s) { return s.kind === 'analysis'; })[0];
  ok('A5 段落顺序有结论/证据/限制', ana.paragraphs.some(function (p) { return p.role === 'conclusion'; }) &&
    ana.paragraphs.some(function (p) { return p.role === 'evidence'; }) &&
    ana.paragraphs.some(function (p) { return p.role === 'limitation'; }));
  ok('A6 段落有衔接词', ana.paragraphs.some(function (p) { return /在此基础上|与此相关|需要注意的是|综合来看/.test(p.text); }));
  ok('A7 来源章节存在', ans.sections.some(function (s) { return s.kind === 'sources'; }));
  var src = ans.sections.filter(function (s) { return s.kind === 'sources'; })[0];
  ok('A8 外部来源为已获取', src.items.filter(function (r) { return r.key === 'external'; })[0].status === 'ok');
  ok('A9 结论带 evidenceRefs', ans.research.conclusions.length > 0 && ans.research.conclusions[0].evidenceRefs.length > 0);
  var refs = ans.research.conclusions[0].evidenceRefs;
  ok('A10 evidenceRefs 可解析', refs.every(function (id) { return ans.research.evidence.some(function (e) { return e.evidenceId === id; }); }));
  ok('A11 质量检查通过', ans.meta.quality.passed === true, JSON.stringify(ans.meta.quality.issues));
  ok('A12 质量模式为 D/E', ['D', 'E'].indexOf(ans.meta.quality.mode) >= 0, ans.meta.quality.mode);

  /* 2. 系统内置知识未命中 */
  var miss = AC.buildAnswer('zxqvkw 光变曲线原始数据在哪下载', CTX, AC.defaultConfig());
  ok('B1 不再写“本地没有依据”', !/本地没有这个问题的依据/.test(miss.sections[0].head));
  ok('B2 明确系统内置知识未命中', /系统内置知识/.test(miss.sections[0].head));
  ok('B3 明确尚未外部核验', /尚未完成外部科研资料核验/.test(miss.sections[0].head));
  K.attach(miss, { attachments: [], external: K.externalStatus([]) });
  var msrc = miss.sections.filter(function (s) { return s.kind === 'sources'; })[0];
  ok('B4 未调用外部工具时为 skipped', msrc.items.filter(function (r) { return r.key === 'external'; })[0].status === 'skipped');
  ok('B5 不虚构外部来源名', !/arXiv|OpenAlex|SIMBAD/.test(msrc.items[2].detail), msrc.items[2].detail);

  /* 3. 动态论文展示 */
  var paper = {
    originalTitle: ans.research.papers[0].title,
    originalAbstract: ans.research.papers[0].excerpt,
    authors: ['X. Mei', 'D. Xu'],
    doi: ans.research.papers[0].doi,
    arxivId: ans.research.papers[0].arxivId,
    url: ans.research.papers[0].url,
    evidenceId: 'ev_m13_age',
    evidenceRefs: ['ev_m13_age']
  };
  var beforePaper = JSON.stringify(paper);
  var calls = 0;
  function translate(payload) {
    calls++;
    return Promise.resolve({
      text: payload.kind === 'title'
        ? 'M13 球状星团中变星族群的新研究'
        : '本文对 M13 视场中的 52 800 颗恒星做成员分析，星团年龄约 11.6 Gyr。'
    });
  }
  var zh = await I.ensurePaper(paper, { generate: translate });
  ok('C1 中文标题优先', /M13 球状星团/.test(zh.title));
  ok('C2 中文摘要优先', /成员分析/.test(zh.abstract));
  ok('C3 英文原文保留', zh.originalTitle === paper.originalTitle && zh.originalAbstract === paper.originalAbstract);
  ok('C4 原文对象未被翻译覆盖', beforePaper === JSON.stringify(paper));
  ok('C5 DOI/arXiv/Evidence 不变', paper.doi === '10.1093/mnras/stz642' &&
    paper.arxivId === '1902.06742' && paper.evidenceId === 'ev_m13_age');
  var callsAfterZh = calls;
  LANG = 'en';
  var en = await I.ensurePaper(paper, {
    generate: function () { calls++; return Promise.resolve({ text: '不应调用' }); }
  });
  ok('C6 英文模式显示原文', en.title === paper.originalTitle && en.abstract === paper.originalAbstract);
  ok('C7 语言切换不重新翻译/不重新检索', calls === callsAfterZh, 'calls=' + calls + '/' + callsAfterZh);
  LANG = 'zh';
  var zhAgain = I.displayOf(paper, 'zh');
  ok('C8 切回中文复用缓存', /M13 球状星团/.test(zhAgain.title));
  ok('C9 缓存按语言区分', I.get(paper.originalTitle, 'title', 'en') === null);
  ok('C10 翻译统计可观测', I.stats().calls >= 2 && I.stats().cacheHits >= 0, JSON.stringify(I.stats()));

  console.log('');
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : '')); });
  console.log('');
  console.log('RESULT ' + pass + '/' + results.length);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exitCode = 1;
});
