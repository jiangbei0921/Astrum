/* ASTRUM · V1.3 兼容性测试
 * 20 问 sections、13 Agent、TRACE_ORDER、Critic 五项、Qty、Report 结构。
 * 旧套件由 CI 分别执行；本测试不修改旧断言。
 * 用法：node tools/v1-3-compatibility-test.js
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
var RT = global.AstroRuntime;
var T = global.AstroTask;
var Request = global.AstroRequest;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;

var QUESTIONS = [
  '你好', '今晚在北京能看到什么？', '什么是黑洞？', '超新星爆发能产生多大的能量？',
  '太阳活动对地球有什么影响？', '2026 年 10 月有什么流星雨？', '太阳系的结构是怎样的？',
  '星座怎么认？', '我该买什么望远镜？', 'M42 用 80mm 能拍吗', 'M42 怎么拍？',
  '猎户座大星云怎么找？', '猎户座大星云是什么？', '介绍一下仙女座星系',
  'zxqvkw 光变曲线原始观测数据在哪下载', 'M42 在哪', '木星和土星哪个更适合观测？',
  '黑洞研究的最新进展', '2026 年 12 月 31 日在北京能看到什么？', '在上海今晚能看到什么？'
];
function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0, tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();
var pass = 0, fails = [];
function ok(name, cond, extra) { if (cond) pass++; else fails.push(name + (extra ? ' | ' + extra : '')); }

(async function main() {
  var registry = global.AstroRegistry.createDefault({ adapter: global.AstroComposeAdapter.create({ agentCore: AC }), agentCore: AC, network: false });
  for (var i = 0; i < QUESTIONS.length; i++) {
    var q = QUESTIONS[i];
    try {
      var r = await Request.handle(q, CTX, CFG, { registry: registry, store: null });
      var old = AC.buildAnswer(q, CTX, CFG);
      var tpl = r.control && r.control.plan && r.control.plan.template;
      if (tpl === 'T-D') {
        /* 用户授权基线更新：显式比较新增 compare；原有 sections 必须不变。 */
        var base = (r.answer && r.answer.sections || []).filter(function (s) { return s.kind !== 'compare'; });
        var cmp = (r.answer && r.answer.sections || []).filter(function (s) { return s.kind === 'compare'; })[0];
        ok('Q' + (i + 1) + ' sections', T.canonicalJSON(base) === T.canonicalJSON(old.sections) &&
          !!cmp && (cmp.items || []).length === 2);
      } else {
        ok('Q' + (i + 1) + ' sections', T.canonicalJSON(r.answer && r.answer.sections) === T.canonicalJSON(old.sections));
      }
    } catch (e) { fails.push('Q' + (i + 1) + ' error ' + e.message); }
  }

  ok('13 Agent 名册', AC.AGENTS.length === 13);
  ok('TRACE_ORDER 不变', AC.TRACE_ORDER.muse === 1 && AC.TRACE_ORDER.critic === 12 && AC.TRACE_ORDER.navigator === 13);

  var sample = AC.buildAnswer('M42 用 80mm 能拍吗', CTX, CFG);
  ok('Critic 五项', sample.meta.review && sample.meta.review.checks && sample.meta.review.checks.length === 5,
    sample.meta.review && sample.meta.review.checks && sample.meta.review.checks.length);

  var qty = RT.Qty(42, 'ly');
  ok('Qty 字段', qty.v === 42 && qty.u === 'ly' && typeof RT.qtyText === 'function');

  var e = Evidence.fromSourceItem({
    title: 'Compat paper', excerpt: 'abstract', url: 'https://example.org/p', host: 'example.org',
    sourceType: 'paper', doi: '10.1000/p', version: 'published', authors: ['A']
  }, { tool: 'paper.search', query: 'p', retrievedAt: '2026-01-01T00:00:00Z' });
  var claims = Claims.buildClaimsFromEvidence([e], {});
  var judged = Claims.judgeAll(claims, { evidence: [e] });
  var red = Reducer.reduce({ evidence: [e], claims: claims, verdicts: judged.verdicts });
  var rep = Report.build({ question: 'Compat', evidence: [e], claims: claims, verdicts: judged.verdicts, reducer: red });
  ok('Report 结构', rep.reportId && Array.isArray(rep.conclusions) && Array.isArray(rep.papers) &&
    Array.isArray(rep.evidence) && Array.isArray(rep.sources) && rep.coverage && Array.isArray(rep.gaps));

  for (var j = 0; j < fails.length; j++) console.log('FAIL | ' + fails[j]);
  console.log('ASSERTIONS ' + pass + '/' + (pass + fails.length));
  console.log('RESULT ' + pass + '/' + (pass + fails.length));
  process.exit(fails.length ? 1 : 0);
})();
