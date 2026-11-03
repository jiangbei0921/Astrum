/* ASTRUM · 真实研究场景质量回归
 *
 * 覆盖本轮实际发现的问题：
 *   Q1 目录编号前缀误匹配（M42→M4，M33→M3）
 *   Q2 中文整句直接检索导致论文结果跑题
 *   Q3 “比较 M31 和 M33”被错选成 T-A 单目标模板
 *   Q4 对比章节缺少每个目标的距离/类型/可见性
 *   Q5 全文失败只给“失败”，没有具体原因
 *
 * 用法：node tools/v1-6-research-quality-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/pdf-text.js', 'core/paper-fulltext.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var R = global.AstroRequest;
var P = global.AstroPlanner;
var C = global.AstroControl;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Report = global.AstroReport;
var Ev = global.AstroEvidence;

var CTX = { y: 2026, mo: 11, d: 2, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var CFG = AC.defaultConfig();
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}
function namesOf(targets) {
  return (targets || []).map(function (t) {
    var it = t.item || t;
    return it.kind === 'kb' ? it.entry.cn : (it.cn || it.id || it.key);
  });
}
function planFor(q) {
  var c = R.classify(q, CTX, CFG);
  var p = P.plan({ query: q, ctx: CTX, cfg: CFG, route: c.route, intent: c.intent, targets: c.targets });
  return { c: c, p: p };
}

(async function main() {
  /* Q1 目录编号必须独立出现 */
  var t42 = AC.resolveTargets('M42 的距离是多少？');
  ok('Q1.1 M42 不再误命中 M4',
    namesOf(t42).filter(function (n) { return n === 'M4 球状星团'; }).length === 0,
    namesOf(t42).join(','));
  var t33 = AC.resolveTargets('M33 的观测难度');
  ok('Q1.2 M33 不再误命中 M3',
    namesOf(t33).filter(function (n) { return n === 'M3 球状星团'; }).length === 0,
    namesOf(t33).join(','));
  var tBoth = AC.resolveTargets('M4 和 M42 哪个更适合拍摄？');
  ok('Q1.3 显式双目标仍保留',
    namesOf(tBoth).indexOf('猎户座大星云') >= 0 && namesOf(tBoth).indexOf('M4 球状星团') >= 0,
    namesOf(tBoth).join(','));

  /* Q2 研究检索式：英文目标 + 主题词，而不是整句中文 */
  var m42 = planFor('M42 的距离是多少？不同论文的测量是否一致？');
  ok('Q2.1 仍进入 T-E', m42.p && m42.p.template === 'T-E', m42.p && m42.p.template);
  var pStep = (m42.p.steps || []).filter(function (s) { return s.tool === 'paper.search'; })[0];
  var eStep = (m42.p.steps || []).filter(function (s) { return s.tool === 'evidence.search'; })[0];
  /* 2026-11-02 调整：检索式由 "distance measurement" 收敛为 "distance"。
   * 实测 OpenAlex 上后者返回 3 篇距离测量论文；叠加 measurement 只剩 1 篇，
   * 另外 2 条位置被无关的星云结构论文占据。断言仍要求英文目标 + 距离主题词。 */
  ok('Q2.2 论文检索式聚焦到目标+距离',
    pStep && pStep.args.query === 'Orion Nebula distance',
    pStep && pStep.args.query);
  ok('Q2.3 反证检索复用同一检索式',
    eStep && eStep.args.query === 'Orion Nebula distance',
    eStep && eStep.args.query);
  ok('Q2.4 最终回答仍保留原始问题',
    (m42.p.steps || []).filter(function (s) { return s.tool === 'compose.domain'; })[0].args.query ===
    'M42 的距离是多少？不同论文的测量是否一致？');

  /* Q3 比较型问题必须走 T-D，而不是 T-A 单目标 */
  var cmp = planFor('比较 M31 和 M33 的观测难度与距离测量');
  ok('Q3.1 比较问题进入 T-D', cmp.p && cmp.p.template === 'T-D', cmp.p && cmp.p.template);
  ok('Q3.2 目标不再包含 M3',
    cmp.c.route.targets.indexOf('M3 球状星团') < 0,
    cmp.c.route.targets.join(','));
  ok('Q3.3 每个目标各有一个星历步骤',
    (cmp.p.steps || []).filter(function (s) { return s.tool === 'kepler.ephemeris'; }).length === 2,
    (cmp.p.steps || []).map(function (s) { return s.tool; }).join(','));

  /* Q4 对比章节必须包含同口径的距离/类型/可见性 */
  var adapter = Adapter.create({ agentCore: AC });
  var recM31 = { target: '仙女座星系', ra: 0.71231, dec: 41.2692, alt: 76.7, az: 78.4, ephem: { score: 0.87 } };
  var recM33 = { target: '三角座星系', ra: 1.5646, dec: 30.6602, alt: 63.8, az: 101.2, ephem: { score: 0.72 } };
  var ans = adapter.deliverWithDelivery('比较 M31 和 M33 的观测难度与距离测量', CTX, CFG, {
    t1: { ok: true, records: [recM31] },
    t2: { ok: true, records: [recM33] }
  }, { compare: true });
  var cmpSection = (ans.answer.sections || []).filter(function (s) { return s.kind === 'compare'; })[0];
  ok('Q4.1 生成多目标对比章节', !!cmpSection && cmpSection.items.length === 2,
    cmpSection && cmpSection.items.length);
  ok('Q4.2 对比包含距离/类型/星等',
    cmpSection && cmpSection.items[0].text.indexOf('距离') >= 0 &&
    cmpSection.items[0].text.indexOf('类型') >= 0 &&
    cmpSection.items[0].text.indexOf('视星等') >= 0,
    cmpSection && cmpSection.items[0].text);
  ok('Q4.3 对比包含可见性判断',
    cmpSection && /可见性/.test(cmpSection.items[0].text) && /可见性/.test(cmpSection.items[1].text),
    cmpSection && cmpSection.items.map(function (x) { return x.text; }).join(' || '));

  /* Q5 全文失败原因写进报告，不只给笼统“失败” */
  var meta = Ev.fromSourceItem({
    title: 'The distance to the Orion Nebula', excerpt: 'Abstract only.', url: 'https://doi.org/10.1051/0004-6361:20078247',
    host: 'doi.org', sourceType: 'paper', doi: '10.1051/0004-6361:20078247', version: 'published', authors: ['A']
  }, { tool: 'paper.search', query: 'Orion Nebula distance', retrievedAt: '2026-11-02T00:00:00Z' });
  var report = Report.build({
    question: 'M42 distance', evidence: [meta], claims: [],
    fulltextFailures: [{ code: 'network', reason: 'HTTP 403' }],
    retrievedAt: '2026-11-02T00:00:00Z'
  });
  ok('Q5.1 报告写出全文失败原因',
    report.gaps.some(function (g) { return g.indexOf('全文失败原因') >= 0 && g.indexOf('HTTP 403') >= 0; }),
    report.gaps.join(' | '));
  ok('Q5.2 局限说明出版社拒绝',
    report.limitations.some(function (l) { return l.indexOf('出版社拒绝') >= 0; }),
    report.limitations.join(' | '));

  /* Q6 Control 打开全文时最多尝试 3 篇 */
  var ctl = await C.run('M42 的距离是多少？不同论文的测量是否一致？', CTX, CFG, {
    routeData: m42.c.routeData, adapter: adapter,
    registry: Registry.createDefault({ adapter: adapter, agentCore: AC, network: false }),
    network: false, fulltext: true
  });
  var ctlStep = ((ctl.state && ctl.state.plan && ctl.state.plan.steps) || []).filter(function (s) {
    return s.tool === 'paper.search';
  })[0];
  ok('Q6.1 Control 为 paper.search 打开全文',
    ctlStep && ctlStep.args.fulltext === true && ctlStep.args.maxFulltext === 4,
    ctlStep && JSON.stringify(ctlStep.args));
  ok('Q6.2 Control 最多尝试 3 篇全文',
    ctlStep && ctlStep.args.fulltextItems === 3, ctlStep && ctlStep.args.fulltextItems);

  /* Q7 拍摄参数：意图识别、焦距公式、用户口径 */
  var photoQ = '今晚在北京用 200mm 望远镜拍摄 M42，应该怎么设置参数？';
  var photoTargets = AC.resolveTargets(photoQ);
  ok('Q7.1 拍摄参数问题识别为 photo-target',
    AC.detectIntent(photoQ, photoTargets) === 'photo-target',
    AC.detectIntent(photoQ, photoTargets));
  var P2 = global.OBSPLAN;
  ok('Q7.2 焦距公式不再随目标角径放大',
    P2 && P2.focalFor(85, 3.76, 3) === 259 && P2.focalFor(85, 3.76, 1.5) === 517,
    P2 && P2.focalFor(85, 3.76, 3));
  var photoAnswer = AC.buildAnswer(photoQ, CTX, CFG);
  var photoSection = (photoAnswer.sections || []).filter(function (s) { return s.kind === 'evidence'; })[0];
  var photoValues = (photoSection && photoSection.items || []).map(function (i) { return i.label + '=' + i.value; }).join(' | ');
  ok('Q7.3 回答给出拍摄参数',
    photoSection && photoSection.title === '拍摄参数' && photoValues.indexOf('理论焦距=259 mm') >= 0,
    photoValues.slice(0, 160));
  ok('Q7.4 回答识别用户 200mm 口径',
    photoValues.indexOf('你的口径=200 mm') >= 0, photoValues.slice(0, 120));
  ok('Q7.5 不再出现荒谬焦距',
    photoValues.indexOf('93258') < 0 && photoValues.indexOf('9 万') < 0, photoValues);

  /* Q8 摘要结论必须保留测量值：旧实现 slice(0,320) 会把 414 ± 7 pc 截掉 */
  var longAbstract = 'We have used the Very Long Baseline Array to measure the trigonometric parallax of several member stars of the Orion Nebula Cluster showing non-thermal radio emission. We have determined the distance to the cluster to be 414 ± 7 pc. Our distance determination allows for an improved calibration of luminosities and ages of young stars in the cluster.';
  var paperEv = Ev.fromSourceItem({
    title: 'The distance to the Orion Nebula', excerpt: longAbstract,
    url: 'https://doi.org/10.1051/0004-6361:20078247', host: 'doi.org',
    sourceType: 'paper', doi: '10.1051/0004-6361:20078247', version: 'published', authors: ['Menten']
  }, { tool: 'paper.search', query: 'Orion Nebula distance', retrievedAt: '2026-11-02T00:00:00Z' });
  var paperClaims = global.AstroClaims.buildClaimsFromEvidence([paperEv], { query: 'M42 distance' });
  var paperClaim = paperClaims.filter(function (c) { return c.text && c.text.indexOf('distance') >= 0; })[0];
  ok('Q8.1 摘要结论保留测量值 414 ± 7 pc',
    paperClaim && paperClaim.text.indexOf('414') >= 0 && paperClaim.text.indexOf('pc') >= 0,
    paperClaim && paperClaim.text);
  ok('Q8.2 摘要结论不再从 ABSTRACT 开头',
    paperClaim && !/^ABSTRACT/i.test(paperClaim.text), paperClaim && paperClaim.text.slice(0, 40));

  var gapEv = Ev.fromSourceItem({
    title: 'The distance to the Orion Nebula', excerpt: 'We have used the Very Long Baseline Array to measure the trigonometric parallax of several member stars of the Orion Nebula Cluster. We have determined the distance to the cluster to be pc. Our distance determination allows for an improved calibration of luminosities and ages of young stars.',
    url: 'https://doi.org/10.1051/0004-6361:20078247', host: 'doi.org',
    sourceType: 'paper', doi: '10.1051/0004-6361:20078247', version: 'published', authors: ['Menten']
  }, { tool: 'paper.search', query: 'Orion Nebula distance', retrievedAt: '2026-11-02T00:00:00Z' });
  var gapClaims = global.AstroClaims.buildClaimsFromEvidence([gapEv], { query: 'M42 distance' });
  var gapClaim = gapClaims[0];
  ok('Q8.3 摘要缺少数值时不伪造测量结果',
    gapClaim && /摘要缺少测量数值/.test(gapClaim.text) && !/\d+\s*pc/.test(gapClaim.text),
    gapClaim && gapClaim.text);

  var kwEv = Ev.fromSourceItem({
    title: 'Galaxy Formation and Evolution', excerpt: 'Galaxy、Galaxy formation and evolution、Astrophysics、Physics、Dark matter、Supermassive black hole',
    url: 'https://doi.org/10.1000/kw', host: 'doi.org', sourceType: 'paper', doi: '10.1000/kw', version: 'published'
  }, { tool: 'paper.search', query: 'galaxy formation', retrievedAt: '2026-11-02T00:00:00Z' });
  ok('Q8.4 主题词列表不被当成论文摘要',
    global.AstroClaims.buildClaimsFromEvidence([kwEv], { query: 'galaxy formation' }).length === 0,
    global.AstroClaims.buildClaimsFromEvidence([kwEv], { query: 'galaxy formation' }).map(function (c) { return c.text; }).join('|'));

  /* Q9 论文测量值必须结构化，才能比较不同论文的分歧 */
  function paperEvOf(title, doi, excerpt, query) {
    return Ev.fromSourceItem({
      title: title, excerpt: excerpt, url: 'https://doi.org/' + doi, host: 'doi.org',
      sourceType: 'paper', doi: doi, version: 'published', authors: ['A']
    }, { tool: 'paper.search', query: query, retrievedAt: '2026-11-02T00:00:00Z' });
  }
  var evA = paperEvOf('The distance to the Orion Nebula', '10.1051/0004-6361:20078247',
    'We measured the parallax. We have determined the distance to the cluster to be 414 ± 7 pc. This improves the calibration.', 'Orion Nebula distance');
  var evB = paperEvOf('The distance to the Orion Nebula cluster', '10.1111/j.1365-2966.2007.11471.x',
    'A distance of 440 ± 34 pc is found from a sample of 74 PMS stars. This falls to 392 ± 32 pc when discs are excluded.', 'Orion Nebula distance');
  var qClaims = global.AstroClaims.buildClaimsFromEvidence([evA, evB], { query: 'M42 distance' });
  var qNums = qClaims.filter(function (c) { return c.type === 'quantitative' && c.numbers && c.numbers.length; });
  ok('Q9.1 摘要测量值被抽成定量声明', qNums.length === 2, qNums.length);
  ok('Q9.2 两篇论文使用同一实体和量纲', qNums.length === 2 &&
    qNums[0].entities[0] === qNums[1].entities[0] &&
    qNums[0].numbers[0].unit === qNums[1].numbers[0].unit,
    qNums.map(function (c) { return c.entities[0] + '|' + c.numbers[0].unit; }).join(' / '));
  var evC = paperEvOf('A conflicting distance measurement', '10.1000/conflict',
    'We determine a distance of 500 ± 5 pc from a reanalysis of the cluster.', 'Orion Nebula distance');
  var cClaims = global.AstroClaims.buildClaimsFromEvidence([evA, evB, evC], { query: 'M42 distance' });
  var red = global.AstroReducer.reduce({
    evidence: [evA, evB, evC], claims: cClaims, stepResults: {}
  });
  ok('Q9.3 超过 1σ 的距离差异进入 conflicts', red.conflicts.length >= 1 &&
    red.conflicts.some(function (c) { return c.status === 'significant' && /Orion/i.test(c.family); }),
    JSON.stringify(red.conflicts));
  var red2 = global.AstroReducer.reduce({
    evidence: [evA, evB], claims: global.AstroClaims.buildClaimsFromEvidence([evA, evB], { query: 'M42 distance' }),
    stepResults: {}
  });
  ok('Q9.4 1σ 以内的差异不虚构冲突', red2.conflicts.length === 0, JSON.stringify(red2.conflicts));

  console.log('');
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
  });
  console.log('');
  console.log('RESULT ' + pass + '/' + results.length);
  process.exitCode = pass === results.length ? 0 : 1;
})();
