/* ASTRUM · V1.15 真实环境修复回归（离线）
 *
 * 覆盖本轮从真实盲测中发现的问题：
 *   - 星座包含关系误匹配（半人马座 → 人马座）
 *   - 多目标对比只回答第一个目标
 *   - 多轮对比/碰撞问题丢失上一轮主体
 *   - 纯光学计算被当成器材匹配
 *   - 太阳半径问题误入太阳活动模板
 *   - M31 质量、M13 金属丰度、哈勃常数定义缺失
 *   - 研究检索中文硬查、重复检索词、用户级限流误伤
 *   - Crossref 真实论文源已接入
 *
 * 用法：node tools/v1-15-regression-test.js
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
var S = global.Sources;
var CTX = { y: 2026, mo: 11, d: 5, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var results = [];
function ok(n, p, x) { results.push({ n: n, p: !!p, x: x == null ? '' : String(x) }); }
function answer(q) {
  var a = AC.buildAnswer(q, CTX, AC.defaultConfig());
  C.finalize(a, { question: q });
  return a;
}
function textOf(a) {
  var out = [];
  (a.sections || []).forEach(function (s) {
    if (s.kind === 'verdict') out.push(s.head || '', s.sub || '');
    if (s.kind === 'analysis') (s.paragraphs || []).forEach(function (p) { out.push(p.text || ''); });
    if (s.kind === 'evidence') {
      (s.items || []).forEach(function (i) { out.push((i.label || '') + ' ' + (i.value || '')); });
      out.push(s.para || '');
    }
  });
  return out.join('\n');
}

/* A1 星座包含关系 */
var t1 = AC.resolveTargets('半人马座距离地球有多远？');
ok('A1.1 半人马座不再误匹配人马座', t1.length === 1 && t1[0].item.kind === 'kb' && t1[0].item.entry.id === 'centaurus',
  t1.map(function (x) { return x.item.entry ? x.item.entry.cn : x.item.cn; }).join(','));
var a1 = answer('半人马座距离地球有多远？');
ok('A1.2 半人马座给出单一距离澄清', /没有单一|不存在单一/.test(textOf(a1)) && /4\.24|4\.37/.test(textOf(a1)), textOf(a1).slice(0, 120));

/* A4/A5/B1/B3/B5/B6 内容缺口 */
ok('A4 恒星光谱已覆盖', /连续谱|吸收线/.test(textOf(answer('什么是恒星光谱？'))));
ok('A5 哈勃常数先定义再讲张力', /膨胀率/.test(textOf(answer('哈勃常数是什么意思？'))));
ok('B1 M31 质量已覆盖', /1\.5/.test(textOf(answer('M31 的质量大约是多少？'))));
ok('B3 M13 金属丰度已覆盖', /-1\.53|−1\.53|金属丰度/.test(textOf(answer('M13 的年龄和金属丰度是多少？'))));
ok('B5 JWST 波段已覆盖', /0\.6–28|红外/.test(textOf(answer('JWST 的主要观测波段有哪些？'))));
ok('B6 太阳半径按直径一半计算', /696,350/.test(textOf(answer('太阳的半径是多少公里？'))), textOf(answer('太阳的半径是多少公里？')).slice(0, 60));

/* B4 多目标对比 */
var b4 = answer('M33 与 M31 的主要区别是什么？');
var b4t = textOf(b4);
ok('B4.1 对比答案包含两个目标', /仙女座星系/.test(b4t) && /三角座星系/.test(b4t));
ok('B4.2 对比保留双方关键数值', /254/.test(b4t) && /273/.test(b4t) && /22 万/.test(b4t) && /6 万/.test(b4t));
ok('B4.3 不再只回答第一个目标', /三角座星系 · 距离|三角座星系 · 直径/.test(b4t));

/* C3/C4 多轮上下文 */
AC.setMemory([{ q: 'M31', a: '', target: '仙女座星系', at: Date.now() }]);
var c3 = answer('和银河系相比呢？');
var c3t = textOf(c3);
ok('C3.1 对比承接上一轮 M31', /仙女座星系/.test(c3t) && /银河系/.test(c3t));
ok('C3.2 对比包含双方数值', /254/.test(c3t) && /10 万/.test(c3t));
var c4 = answer('它未来会和银河系碰撞吗？');
var c4t = textOf(c4);
ok('C4.1 碰撞问题保留 M31 与银河系', /仙女座星系/.test(c4t) && /银河系/.test(c4t));
ok('C4.2 碰撞给出明确可执行结论', /会/.test(c4t) && /110/.test(c4t) && /合并/.test(c4t));
AC.setMemory([]);

/* F2/F4/F5 光学计算 */
var f2 = answer('根据 200mm 口径、1000mm 焦距和 25mm 目镜计算放大倍率。');
ok('F2 放大倍率 = 40×', /40×|40 ×/.test(textOf(f2)), textOf(f2).slice(0, 80));
var f4 = answer('比较 80mm 与 200mm 望远镜的理论分辨率。');
ok('F4 分辨率按瑞利判据计算', /1\.73/.test(textOf(f4)) && /0\.69/.test(textOf(f4)));
var f5 = answer('计算 200mm 口径、1000mm 焦距望远镜的视场范围。');
ok('F5 缺少目镜/传感器时明确说明', /缺少|无法给出唯一/.test(textOf(f5)) && /视场/.test(textOf(f5)));

/* D/E 检索计划：英文归一化、去重、不硬查中文 */
var p1 = R.plan('查找 JWST 关于早期宇宙星系的最新研究', { intent: 'unknown' });
ok('P1 JWST 计划生成英文检索词', /JWST/.test(p1.baseEn) && /early universe/.test(p1.baseEn), p1.baseEn);
ok('P2 检索词不含中文', p1.queries.length > 0 && p1.queries.every(function (q) { return /^[\x00-\x7F]+$/.test(q); }),
  p1.queries.join(' | '));
var p2 = R.plan('查找 M31 距离测量的代表性论文', { intent: 'unknown' });
ok('P3 检索词去重', p2.queries[0] === 'M31 distance measurement', p2.queries[0]);

/* 研究流水线跳过用户级限流 */
(async function () {
  var captured = null;
  var orig = S.searchMany;
  S.searchMany = function (queries, opts) {
    captured = opts || {};
    return Promise.resolve({ items: [], calls: 0, errors: [], truncated: false });
  };
  try {
    await R.run('查找 JWST 关于早期宇宙星系的最新研究', { intent: 'unknown', maxRounds: 1, maxCalls: 1, budgetMs: 2000 });
  } finally {
    S.searchMany = orig;
  }
  ok('P4 研究流水线使用 internal 跳过用户级限流', captured && captured.internal === true, JSON.stringify(captured || {}));

  /* Crossref 真实论文源已注册 */
  var ids = S.endpoints.map(function (e) { return e.id; });
  ok('P5 Crossref 已接入真实论文源', ids.indexOf('crossref') >= 0, ids.join(','));

  ok('F1 13 Agent 不变', AC.AGENTS.length === 13);
  ok('F2 兼容接口存在', typeof AC.buildAnswer === 'function' && typeof AC.detectIntent === 'function' &&
    typeof C.finalize === 'function' && typeof R.toSections === 'function');
  ok('F3 finalize 幂等', (function () {
    var a = answer('什么是光年？');
    var before = a.sections.length;
    C.finalize(a, { question: '什么是光年？' });
    return a.sections.length === before;
  })());

  var pass = results.filter(function (r) { return r.p; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (r) { console.log((r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? ' | ' + r.x : '')); });
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('UNEXPECTED', e && e.stack || e);
  process.exit(1);
});
