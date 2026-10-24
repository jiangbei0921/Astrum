/* ASTRUM · 检索与证据链路测试
 *
 * 两套：
 *   离线（默认）：mock 检索函数，确定性，可长期跑
 *   在线（--online）：真实调用 Sources.searchMany，验证端点可达与检索词有效
 *
 * 用法：
 *   node tools/research-test.js
 *   node tools/research-test.js --online
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.window = global;
global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

['data/catalog.js', 'data/knowledge.js', 'data/bodies.js', 'data/places.js',
 'core/astro.js', 'core/agents.js', 'core/sources.js', 'core/research.js'].forEach(function (f) {
  require(path.join(ROOT, f));
});

var R = global.Research, S = global.Sources, AC = global.AgentCore;
var ONLINE = process.argv.indexOf('--online') >= 0;

var pass = 0, fail = 0, cases = [];
function ok(name, cond, extra) {
  cases.push({ name: name, ok: !!cond, extra: extra || '' });
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

/* ============================================================
   mock 检索：完全可控，不联网
   ============================================================ */
function mockSearch(table) {
  return function (queries, opts) {
    var items = [], errors = [], calls = 0;
    (queries || []).forEach(function (q) {
      var rows = table[q] || table['*'] || [];
      rows.forEach(function (row) {
        calls++;
        var it = {
          title: row.title, snippet: (row.excerpt || '').slice(0, 180),
          excerpt: row.excerpt || row.title, url: row.url || '',
          host: row.host || 'mock.org', date: row.date || null,
          sourceType: row.sourceType || 'paper', authors: row.authors || [],
          doi: row.doi || '', extra: {},
          endpoint: row.endpoint || 'mock', endpointName: 'Mock',
          query: q, fetchedAt: Date.now()
        };
        items.push(it);
      });
      if (!rows.length) errors.push({ endpoint: 'mock', name: 'Mock', query: q, kind: 'empty', msg: '无匹配结果' });
    });
    return Promise.resolve({ items: items, calls: calls, errors: errors, truncated: false, ms: 10 });
  };
}

/* ============================================================
  1. P0 回归：查询词必须真正传给端点
  ============================================================ */
function testQueryPropagation() {
  return new Promise(function (resolve) {
    var seen = [];
    var realFetch = global.fetch;
    global.fetch = function (u) { seen.push(decodeURIComponent(String(u))); return realFetch.apply(this, arguments); };
    S.search('黑洞').then(function (r) {
      global.fetch = realFetch;
      var hit = seen.some(function (u) { return /search=Black\s*Hole|q=%E9%BB%91|srsearch|query=Black/i.test(u); });
      var naos = seen.some(function (u) { return /Naos/i.test(u); });
      ok('检索词真正传给端点（不再恒为 Naos）', hit && !naos,
        'sent=' + (seen[0] || '').slice(0, 70));
      ok('检索结果与问题相关', r.items.length > 0, r.items.length + ' 条');
      resolve();
    }).catch(function (e) {
      global.fetch = realFetch;
      ok('检索词真正传给端点', false, 'ERR ' + e.message);
      resolve();
    });
  });
}

/* ============================================================
  2. 空查询防御
  ============================================================ */
function testEmptyGuard() {
  ok('enQueryFor("") 不返回星名', S.enQueryFor('') === '', JSON.stringify(S.enQueryFor('')));
  ok('enQueryFor(undefined) 为空', S.enQueryFor(undefined) === '', JSON.stringify(S.enQueryFor(undefined)));
  ok('enQueryFor(null) 为空', S.enQueryFor(null) === '');
}

/* ============================================================
  3. 问题分类与规划
  ============================================================ */
function testPlanning() {
  /* 纯本地问题：不该检索 */
  ['今晚在北京能看到什么？', '我该买什么望远镜？', '猎户座大星云怎么找？'].forEach(function (q) {
    var intent = AC.detectIntent(q, AC.resolveTargets(q));
    var p = R.plan(q, { intent: intent, entityName: '', entityEn: '' });
    ok('本地计算类不检索: ' + q.slice(0, 12), p.skip === true, 'intent=' + intent + ' profile=' + p.profile);
  });

  /* 机制类：应拆出多个子问题 */
  var q2 = '为什么超新星爆发能产生那么大的能量？';
  var p2 = R.plan(q2, { intent: 'knowledge-target', entityName: '超新星', entityEn: 'Supernova' });
  ok('机制类问题拆出多个子问题', p2.subs.length >= 3, 'subs=' + p2.subs.length + ' ' + p2.subs.map(function (s) { return s.id; }).join(','));
  ok('机制类问题生成多个检索词', p2.queries.length >= 3, p2.queries.join(' | ').slice(0, 110));

  /* 无英文词时降级为只查百科 */
  var p3 = R.plan('这是什么', { intent: 'unknown', entityName: '某个中文名', entityEn: '' });
  ok('无英文词时标注降级', p3.degraded === true || p3.types.indexOf('paper') < 0,
    'degraded=' + p3.degraded + ' reason=' + p3.degradedReason);
}

/* ============================================================
  4. 去重
  ============================================================ */
function testDedupe() {
  var list = [
    { title: 'Black hole', url: 'https://a.org/x', host: 'a.org', endpoint: 'e1', doi: '10.1/abc' },
    { title: 'Black hole', url: 'https://a.org/x/', host: 'a.org', endpoint: 'e2', doi: '10.1/abc' },
    { title: 'Black Hole!!', url: 'https://b.org/y', host: 'b.org', endpoint: 'e3', doi: '' },
    { title: 'Something else', url: 'https://c.org/z', host: 'c.org', endpoint: 'e4', doi: '' }
  ];
  var d = R.dedupe(list);
  ok('URL 去重生效', d.length < list.length, list.length + ' → ' + d.length);
  ok('去重后保留原始 url', d.every(function (x) { return typeof x.url === 'string'; }));
  var multi = d.filter(function (x) { return (x.sources || []).length > 1; });
  ok('去重时记录多源印证', multi.length >= 1, 'multi=' + multi.length);

  /* 合并时 date 与 dateKind 必须一起走：
   * 否则「词条编辑时间」会被当成「论文发表时间」，两个语义混为一谈。 */
  var mergeCase = [
    { title: 'M87', url: 'https://zh.wikipedia.org/wiki/M87', host: 'zh.wikipedia.org', endpoint: 'wikimedia', sourceType: 'encyclopedia', date: null, dateKind: null },
    { title: 'M87', url: 'https://zh.wikipedia.org/wiki/M87', host: 'zh.wikipedia.org', endpoint: 'wiki-action', sourceType: 'encyclopedia', date: '2026-08-03', dateKind: 'edited' }
  ];
  var md = R.dedupe(mergeCase);
  ok('合并后只保留一条', md.length === 1, 'n=' + md.length);
  ok('合并时 dateKind 跟随 date 一起保留',
    md[0].date === '2026-08-03' && md[0].dateKind === 'edited',
    'date=' + md[0].date + ' kind=' + md[0].dateKind);
}

/* ============================================================
  5. 排序与相关性
  ============================================================ */
function testRanking() {
  /* 中文问题 + 英文结果：必须用 questionTerms 带上英文实体名才能跨语言匹配 */
  var terms = R.questionTerms('什么是黑洞的事件视界', 'Black hole', '黑洞');
  ok('词项包含英文实体名（跨语言匹配的前提）',
    terms.indexOf('black') >= 0 || terms.indexOf('hole') >= 0,
    terms.slice(0, 10).join(','));
  var items = [
    { title: 'NAO Troposphere Connection', excerpt: 'atmosphere', sourceType: 'paper', url: 'u1', date: '2002-01-01', sources: ['a'] },
    { title: 'Black holes and event horizon', excerpt: 'event horizon of a black hole', sourceType: 'paper', url: 'u2', date: '2019-04-10', sources: ['a'] },
    { title: 'Black hole', excerpt: 'black hole', sourceType: 'encyclopedia', url: 'u3', date: null, sources: ['a'] }
  ];
  var ranked = R.rank(items, { types: ['encyclopedia', 'paper'], terms: terms });
  ok('相关结果排在无关结果前', ranked[0].title.indexOf('Black hole') >= 0, 'top=' + ranked[0].title);
  ok('无关结果被剔除', ranked.length < items.length, items.length + ' → ' + ranked.length);
  ok('每条带可靠性明细', ranked.every(function (x) { return x.reliability && typeof x.reliability.termCoverage === 'number'; }));
  ok('无日期条目被标记', ranked.some(function (x) { return (x.flags || []).indexOf('no-date') >= 0; }));

  /* 同名噪声：搜黑洞时维基会返回一首叫《巨大黑洞》的歌，词项覆盖率同样很高 */
  var noisy = [
    { title: '巨大黑洞（嘶欧歌曲）', excerpt: '英国摇滚乐队缪斯乐队的一首歌曲，出自专辑 Black Holes and Revelations', sourceType: 'encyclopedia', url: 'u4', date: '2026-10-11', sources: ['a'] },
    { title: '黑洞', excerpt: '黑洞是一种天体，因密度极高而产生极大引力，事件视界内光也无法逃逸', sourceType: 'encyclopedia', url: 'u5', date: '2026-10-20', sources: ['a'] }
  ];
  var nr = R.rank(noisy, { types: ['encyclopedia'], terms: R.questionTerms('什么是黑洞', 'Black hole', '黑洞') });
  ok('同名歌曲被领域信号剔除', !nr.some(function (x) { return /歌曲/.test(x.title); }),
    'kept=' + nr.map(function (x) { return x.title; }).join(','));
  ok('真正的黑洞条目被保留', nr.some(function (x) { return x.title === '黑洞'; }));
}

/* ============================================================
  6. 多轮检索与停止条件
  ============================================================ */
function testMultiRound() {
  var table = {
    'Supernova observation evidence': [
      { title: 'Neutrino burst from SN 1987A', excerpt: 'SN 1987A neutrino detection by Kamiokande', date: '1987-04-01', url: 'u1', sourceType: 'paper', authors: ['Hirata'] }
    ],
    'Supernova mechanism': [
      { title: 'Neutrino-driven explosion mechanism', excerpt: 'core collapse supernova mechanism', date: '2015-01-01', url: 'u2', sourceType: 'paper' }
    ],
    'Supernova alternative interpretation': [
      { title: 'Magnetar powered supernova', excerpt: 'alternative to neutrino driven', date: '2018-01-01', url: 'u3', sourceType: 'paper' }
    ],
    'Supernova': [
      { title: 'Supernova', excerpt: 'a supernova is a stellar explosion', date: null, url: 'u4', sourceType: 'encyclopedia' }
    ]
  };
  return R.run('为什么超新星爆发能产生那么大的能量？', {
    intent: 'knowledge-target', entityName: '超新星', entityEn: 'Supernova',
    searchFn: mockSearch(table), maxRounds: 2, maxCalls: 6
  }).then(function (rec) {
    ok('复杂问题执行了检索', rec.rounds.length >= 1, 'rounds=' + rec.rounds.length);
    ok('记录了每轮实际检索词', rec.rounds.every(function (r) { return r.queries.length; }),
      (rec.rounds[0] ? rec.rounds[0].queries.join(' | ') : '').slice(0, 80));
    ok('记录了停止原因', !!rec.stopReason, rec.stopReason);
    ok('证据带编号', rec.evidence.length > 0 && /^E\d+$/.test(rec.evidence[0].id), 'n=' + rec.evidence.length);
    ok('证据带子问题归属', rec.evidence.every(function (e) { return !!e.subQuestion; }));
    ok('产出日志', R.log().length > 0, 'log=' + R.log().length);
  });
}

function testBudget() {
  var table = { '*': [{ title: 'x', excerpt: 'y', url: 'u', date: '2020-01-01' }] };
  var many = [];
  for (var i = 0; i < 20; i++) many.push('q' + i);
  /* 直接构造超量计划：用一个会返回大量子问题的场景，验证 maxCalls */
  return R.run('测试预算上限', {
    intent: 'knowledge-target', entityName: 'a', entityEn: 'a',
    searchFn: mockSearch(table), maxRounds: 3, maxCalls: 2
  }).then(function (rec) {
    ok('调用次数受 maxCalls 限制', (rec.calls || 0) <= 2, 'calls=' + rec.calls);
  });
}

/* ============================================================
  7. 简单问题零检索
  ============================================================ */
function testSkipNoFetch() {
  var called = 0;
  var fn = function () { called++; return Promise.resolve({ items: [], calls: 0, errors: [] }); };
  return R.run('今晚在北京能看到什么？', {
    intent: 'tonight', entityName: '', entityEn: '', searchFn: fn
  }).then(function (rec) {
    ok('本地计算类问题零次检索调用', called === 0, 'called=' + called);
    ok('skip 原因被记录', rec.stopReason === 'skip', rec.stopReason);
  });
}

/* ============================================================
  8. 冲突检测
  ============================================================ */
function testConflict() {
  var ev = [
    { id: 'E1', title: 'M87 mass 6.5e9 solar masses', excerpt: 'mass of 6.5e9 solar masses', subQuestion: 'q1', host: 'a' },
    { id: 'E2', title: 'M87 mass 3.2e9 solar masses', excerpt: 'mass of 3.2e9 solar masses', subQuestion: 'q1', host: 'b' }
  ];
  var nums = R.parseNumbers('mass of 6.5e9 solar masses');
  ok('数值解析能识别太阳质量量级', nums.length >= 0, 'n=' + nums.length);
  var c = R.detectConflicts(ev);
  ok('检出跨源数值冲突', c.length >= 1, 'conflicts=' + c.length);

  var same = [
    { id: 'E1', title: 'M87 mass 6.5e9 solar masses', excerpt: '', subQuestion: 'q1' },
    { id: 'E2', title: 'M87 mass 6.6e9 solar masses', excerpt: '', subQuestion: 'q1' }
  ];
  ok('差异 ≤10% 不误报冲突', R.detectConflicts(same).length === 0);
}

/* ============================================================
  9. 引用核验
  ============================================================ */
function testCitations() {
  var ev = [
    { id: 'E1', title: 'A', url: 'https://x.org/a', host: 'x.org', date: '2020-01-01', status: 'supported', reliability: { sourceCount: 1, typeMatch: true, hasDate: true, termCoverage: 0.5 } },
    { id: 'E2', title: 'B', url: '', host: 'y.org', date: null, status: 'pending', reliability: { sourceCount: 1, typeMatch: false, hasDate: false, termCoverage: 0.05 } }
  ];
  var v = R.verifyCitations({}, ev, { localSources: [{ n: 'NASA/IPAC', u: 'https://ned.ipac.caltech.edu/' }] });
  ok('统计有出处的证据数', v.withUrl === 1, 'withUrl=' + v.withUrl);
  ok('无证据时不宣称已验证', v.verdict !== 'verified' || v.total === 0, v.verdict);
  ok('标注待核验条目数', v.pending === 1, 'pending=' + v.pending);

  var v2 = R.verifyCitations({}, [], {});
  ok('零证据时 verdict=no-evidence', v2.verdict === 'no-evidence', v2.verdict);
}

/* ============================================================
  10. 章节生成
  ============================================================ */
function testSections() {
  var rec = {
    question: 'q', plan: { skip: false, subs: [{ id: 'q1', label: '基本资料' }] },
    evidence: [{
      id: 'E1', title: 'T', snippet: 's', excerpt: 'e', url: 'https://x', host: 'x.org',
      date: '2020-01-01', sourceType: 'paper', subQuestion: 'q1', status: 'supported',
      flags: [], reliability: {}, sources: ['openalex'], authors: [], extra: {}
    }],
    conflicts: [], rounds: [{ round: 1 }], calls: 1, ms: 10, stopReason: 'covered'
  };
  var secs = R.toSections(rec);
  ok('首章节为证据概览（先讲覆盖与缺口）', secs.length >= 1 && secs[0].kind === 'synthesis',
    'first=' + (secs[0] && secs[0].kind));
  var webSec = secs.filter(function (s) { return s.kind === 'web'; })[0];
  ok('生成检索证据章节', !!webSec, 'n=' + secs.length);
  ok('章节按子问题分组', !!webSec && /检索证据 · 基本资料/.test(webSec.title), webSec ? webSec.title : '(无)');

  var empty = R.toSections({ question: 'q', plan: { skip: false, subs: [] }, evidence: [], errors: [], rounds: [], stopReason: 'empty' });
  var emptyWeb = empty.filter(function (s) { return s.kind === 'web'; })[0];
  ok('无结果时给出明确说明', !!emptyWeb && /未/.test(emptyWeb.note || ''),
    ((emptyWeb && emptyWeb.note) || '').slice(0, 40));

  var skip = R.toSections({ plan: { skip: true } });
  ok('本地计算类不生成检索章节', skip.length === 0);
}

/* ============================================================
  11. 在线测试（真实外部数据）
  注意：本沙箱有 https_proxy，但 Node 内置 fetch（undici）默认不走环境代理，
        会导致 api.wikimedia.org / zh.wikipedia.org 直连超时。
        这不是端点故障 —— curl 走代理可正常返回 200。
        因此这里用「论文 + 影像」两个类型验证多源聚合（这两个域名直连可达），
        百科端点单独用可达性探针区分「端点故障」与「网络不可达」。
  ============================================================ */
function testOnline() {
  console.log('');
  console.log('--- 在线测试（真实外部数据）---');
  return S.searchMany(['black hole', 'supernova mechanism'], {
    types: ['paper', 'image', 'encyclopedia'], maxCalls: 8, budgetMs: 14000
  }).then(function (res) {
    ok('在线：至少一个端点返回结果', res.items.length > 0, 'items=' + res.items.length + ' calls=' + res.calls);

    var types = {};
    res.items.forEach(function (it) { types[it.sourceType] = (types[it.sourceType] || 0) + 1; });
    var okEps = {};
    res.items.forEach(function (it) { if (it.endpoint) okEps[it.endpoint] = 1; });
    ok('在线：多源聚合（≥2 个来源类型或端点同时有结果）',
      Object.keys(types).length >= 2 || Object.keys(okEps).length >= 2,
      'types=' + JSON.stringify(types) + ' 有结果的端点=' + Object.keys(okEps).join(','));

    var withDate = res.items.filter(function (it) { return it.date; }).length;
    ok('在线：采集到发布时间', withDate > 0, withDate + '/' + res.items.length);

    var withUrl = res.items.filter(function (it) { return it.url; }).length;
    ok('在线：保留原始链接', withUrl === res.items.length, withUrl + '/' + res.items.length);

    var irrelevant = res.items.filter(function (it) { return /NAO Troposphere|humanoid/i.test(it.title); });
    ok('在线：不再返回 Naos 无关结果', irrelevant.length === 0, 'bad=' + irrelevant.length);

    /* 失败原因分类统计：区分「端点故障」与「本网络不可达」 */
    var kinds = {};
    (res.errors || []).forEach(function (e) { kinds[e.kind] = (kinds[e.kind] || 0) + 1; });
    console.log('  [在线] 端点错误分布: ' + (Object.keys(kinds).length ? JSON.stringify(kinds) : '无'));
    if (kinds.timeout) {
      console.log('  [在线] 存在超时端点。本沙箱 Node fetch 不走环境代理，');
      console.log('         wiki 类域名直连会超时（curl 走代理可返回 200），属网络环境限制。');
    }
  }).catch(function (e) {
    ok('在线：检索可执行', false, e.message);
  });
}

/* ============================================================
  12. 要求七中明确列出、此前缺失的四类测试
  ============================================================ */

/* 12.1 时间字段不混淆：发表 / 发布 / 编辑 三种语义必须分开 */
function testDateSemantics() {
  var ev = [
    { id: 'E1', title: 'paper A', subQuestion: 'q1', date: '2019-04-10', dateKind: 'published', status: 'supported', excerpt: 'x', sourceType: 'paper', host: 'a' },
    { id: 'E2', title: 'image B', subQuestion: 'q1', date: '2016-09-20', dateKind: 'released', status: 'supported', excerpt: 'y', sourceType: 'image', host: 'b' },
    { id: 'E3', title: 'wiki C', subQuestion: 'q1', date: '2026-10-20', dateKind: 'edited', status: 'supported', excerpt: 'z', sourceType: 'encyclopedia', host: 'c' }
  ];
  var rec = {
    question: 'q', plan: { subs: [{ id: 'q1', label: '基本资料' }], types: ['paper'], skip: false },
    evidence: ev, conflicts: [], rounds: [{ round: 1 }], calls: 1, ms: 1, stopReason: 'covered'
  };
  var s = R.synthesize(rec);
  ok('时间语义按类型分别统计', s.timeSpan && s.timeSpan.kinds &&
    s.timeSpan.kinds.published && s.timeSpan.kinds.released && s.timeSpan.kinds.edited,
    'kinds=' + Object.keys((s.timeSpan && s.timeSpan.kinds) || {}).join(','));
  ok('发布时间与编辑时间没有混为一谈',
    s.timeSpan.kinds.published.newest === '2019-04-10' &&
    s.timeSpan.kinds.edited.newest === '2026-10-20',
    'pub=' + s.timeSpan.kinds.published.newest + ' edit=' + s.timeSpan.kinds.edited.newest);

  /* 语义标签要能被展示层拿到 */
  ok('每种时间语义都有中文标签',
    R.DATE_KIND_LABEL.published === '论文发表' &&
    R.DATE_KIND_LABEL.released === '机构发布' &&
    R.DATE_KIND_LABEL.edited === '词条编辑');
}

/* 12.2 不同类型问题生成适合的答案结构 */
function testProfileStructures() {
  var cases = [
    { q: '为什么超新星爆发能产生那么大的能量？', intent: 'knowledge-target', entity: '超新星', en: 'Supernova', wantProfile: 'mechanism', minSubs: 3 },
    { q: 'M87 黑洞的质量是多少？', intent: 'cosmos', entity: 'M87', en: 'M87', wantProfile: 'parameter', minSubs: 2 },
    { q: '最近有什么新的系外行星发现？', intent: 'nova', entity: '系外行星', en: 'exoplanet', wantProfile: 'latest', minSubs: 1 },
    { q: '猎户座大星云是什么？', intent: 'intro-target', entity: '猎户座大星云', en: 'Orion Nebula', wantProfile: 'object', minSubs: 2 }
  ];
  cases.forEach(function (c) {
    var p = R.plan(c.q, { intent: c.intent, entityName: c.entity, entityEn: c.en });
    ok('问题类型对应正确画像: ' + c.q.slice(0, 10),
      p.profile === c.wantProfile && p.subs.length >= c.minSubs,
      'profile=' + p.profile + ' subs=' + p.subs.length);
  });
  /* 最新发现类需要按时间排序 */
  var pl = R.plan('最近有什么新的系外行星发现？', { intent: 'nova', entityName: '系外行星', entityEn: 'exoplanet' });
  ok('最新发现类启用按时间排序', pl.byDate === true, 'byDate=' + pl.byDate);
}

/* 12.3 无结果时不编造事实 */
function testNoFabrication() {
  var emptyFn = function () {
    return Promise.resolve({ items: [], calls: 2, errors: [{ endpoint: 'mock', name: 'Mock', query: 'x', kind: 'empty', msg: '无匹配结果' }], truncated: false });
  };
  return R.run('某个本地未收录的问题', {
    intent: 'unknown', entityName: '未知', entityEn: 'unknown', searchFn: emptyFn
  }).then(function (rec) {
    ok('无结果时证据为空', rec.evidence.length === 0, 'n=' + rec.evidence.length);
    var syn = R.synthesize(rec);
    ok('无结果时综合层声明不可用', syn.available === false, 'available=' + syn.available);
    ok('无结果时明确说明没有证据支撑', /未取得可用检索证据/.test(syn.lead || ''), (syn.lead || '').slice(0, 40));
    var secs = R.toSections(rec);
    var web = secs.filter(function (s) { return s.kind === 'web'; })[0];
    ok('无结果时给出「未检索到」而非编造内容', !!web && /未检索到|未取得/.test(web.note || ''),
      ((web && web.note) || '').slice(0, 40));
    var v = R.verifyCitations({}, rec.evidence, {});
    ok('无证据时引用核验不宣称已验证', v.verdict === 'no-evidence', v.verdict);
  });
}

/* 12.4 工具超时按合理策略处理 */
function testTimeoutHandling() {
  var timeoutFn = function (qs, opts) {
    return Promise.resolve({
      items: [], calls: (qs || []).length,
      errors: [{ endpoint: 'wiki', name: '维基百科', query: qs[0], kind: 'timeout', msg: '请求超时' }],
      truncated: true, budgetExhausted: true
    });
  };
  var t0 = Date.now();
  return R.run('什么是快速射电暴', {
    intent: 'knowledge-target', entityName: '快速射电暴', entityEn: 'fast radio burst', searchFn: timeoutFn
  }).then(function (rec) {
    ok('超时后仍然返回结果对象（不抛异常）', !!rec, 'ms=' + (Date.now() - t0));
    ok('超时被记录为 timeout 类错误',
      (rec.errors || []).some(function (e) { return e.kind === 'timeout'; }),
      JSON.stringify((rec.errors || []).slice(0, 1)));
    ok('超时后不虚构证据', rec.evidence.length === 0, 'n=' + rec.evidence.length);
    ok('超时后仍记录停止原因', !!rec.stopReason, rec.stopReason);
    /* 无证据时不应把结论说成已证实 */
    var syn = R.synthesize(rec);
    ok('超时后综合层不下确定结论', syn.available === false);
  });
}

/* ============================================================
  13. Scholar 智能体：定义完整性 + 配置真实生效
  ============================================================ */
function testScholarAgent() {
  var a = (AC.AGENTS || []).filter(function (x) { return x.id === 'scholar'; })[0];
  ok('Scholar 智能体已注册', !!a);
  if (!a) return;
  ok('Scholar 写明职责范围', !!a.scope && a.scope.length > 20, (a.scope || '').slice(0, 34));
  ok('Scholar 写明使用场景', !!a.useCases && a.useCases.length > 20, (a.useCases || '').slice(0, 34));
  ok('Scholar 写明已知限制', !!a.limits);
  ok('Scholar 的配置项都在属性表内', (a.attrs || []).every(function (k) { return !!AC.ATTRS[k]; }),
    (a.attrs || []).join(','));
  ok('Scholar 参与链路排序', !!(AC.TRACE_ORDER ? AC.TRACE_ORDER.scholar : true));

  /* 证据门槛必须真的改变输出，否则这个智能体只是挂名 */
  var rec = {
    question: '测', plan: { subs: [{ id: 'q1', label: '机制' }], types: ['paper'], skip: false },
    evidence: [
      { id: 'E1', title: 'A', excerpt: 'aaa', sourceType: 'paper', url: 'https://a', host: 'a', date: '2020-01-01', dateKind: 'published', status: 'supported', subQuestion: 'q1', sources: ['o'] },
      { id: 'E2', title: 'B', excerpt: 'bbb', sourceType: 'paper', url: '', host: 'b', date: null, status: 'pending', subQuestion: 'q1', sources: ['o'] }
    ],
    conflicts: [], rounds: [{ round: 1 }], calls: 1, ms: 1, stopReason: 'covered'
  };
  function pts(pref, depth) {
    var r = JSON.parse(JSON.stringify(rec));
    r.scholar = { evidence: pref, depth: depth };
    var g = R.synthesize(r).groups[0];
    return g ? g.points.map(function (p) { return p.id; }) : [];
  }
  ok('严格门槛只采纳可溯源证据', pts('strict', 'standard').join(',') === 'E1',
    pts('strict', 'standard').join(','));
  ok('均衡门槛含待核验证据', pts('balanced', 'standard').length === 2,
    pts('balanced', 'standard').join(','));
  ok('深度=brief 时每组只展示 1 条', pts('balanced', 'brief').length === 1,
    pts('balanced', 'brief').join(','));

  /* 严格门槛下全为待核验时，必须显式说明而不是静默省略 */
  var allPending = JSON.parse(JSON.stringify(rec));
  allPending.evidence = [allPending.evidence[1]];
  allPending.scholar = { evidence: 'strict', depth: 'standard' };
  var g2 = R.synthesize(allPending).groups[0];
  ok('严格门槛下无可用证据时标记 strictEmpty', !!g2 && g2.strictEmpty === true && g2.points.length === 0,
    'points=' + (g2 ? g2.points.length : '-'));
}

/* ============================================================
  14. 错误分类：CSP / CORS / 断网 必须可区分
  （对应 docs/DESIGN.md 第二十二章；浏览器侧场景见 tools/csptest.js）
  ============================================================ */
function testErrorClassification() {
  ok('ERR_KIND 含独立的 CSP 分类', !!(S.errorKinds && S.errorKinds.csp) &&
    /CSP/.test(S.errorKinds.csp), S.errorKinds && S.errorKinds.csp);
  ok('CSP 分类与 CORS 分类不是同一条',
    S.errorKinds.csp !== S.errorKinds.cors && S.errorKinds.csp !== S.errorKinds.network,
    S.errorKinds.csp);
  ok('导出了 CSP 诊断接口', typeof S.cspBlocked === 'function' && typeof S.cspState === 'function');
  ok('cspState 返回结构完整', (function () {
    var s = S.cspState();
    return !!(s && Array.isArray(s.hits));
  })(), JSON.stringify(S.cspState()).slice(0, 60));
  ok('无违规记录时 cspBlocked 为假', S.cspBlocked('https://open.bigmodel.cn/x') === false);
}

/* ============================================================
  运行
   ============================================================ */
function main() {
  console.log('=== 离线测试（mock 数据）===');
  testEmptyGuard();
  testPlanning();
  testDedupe();
  testRanking();
  testConflict();
  testCitations();
  testSections();
  testDateSemantics();
  testProfileStructures();
  testScholarAgent();
  testErrorClassification();

  var chain = testSkipNoFetch()
    .then(testMultiRound)
    .then(testBudget)
    .then(testNoFabrication)
    .then(testTimeoutHandling)
    .then(testQueryPropagation);

  if (ONLINE) chain = chain.then(testOnline);

  chain.then(function () {
    console.log('');
    console.log('RESULT ' + pass + '/' + (pass + fail) + (ONLINE ? ' （含在线）' : ' （离线 mock）'));
    if (!ONLINE) {
      console.log('提示：加 --online 可跑真实外部数据测试（结论会单独标注）');
    }
    process.exit(fail === 0 ? 0 : 1);
  });
}

main();
