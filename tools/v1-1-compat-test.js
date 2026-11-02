/* ASTRUM · V1.1 旧答案兼容测试（20 问）
 *
 * 通过统一入口执行 20 问，和旧 buildAnswer 的 sections 做 canonicalJSON 逐字节比较。
 * 允许 L2-L4 进入 Control，但输出必须保持旧 sections 契约。
 *
 * 用法：node tools/v1-1-compat-test.js
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
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js', 'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Request = global.AstroRequest;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;

var QUESTIONS = [
  '你好',
  '今晚在北京能看到什么？',
  '什么是黑洞？',
  '超新星爆发能产生多大的能量？',
  '太阳活动对地球有什么影响？',
  '2026 年 10 月有什么流星雨？',
  '太阳系的结构是怎样的？',
  '星座怎么认？',
  '我该买什么望远镜？',
  'M42 用 80mm 能拍吗',
  'M42 怎么拍？',
  '猎户座大星云怎么找？',
  '猎户座大星云是什么？',
  '介绍一下仙女座星系',
  'zxqvkw 光变曲线原始观测数据在哪下载',
  'M42 在哪',
  '木星和土星哪个更适合观测？',
  '黑洞研究的最新进展',
  '2026 年 12 月 31 日在北京能看到什么？',
  '在上海今晚能看到什么？'
];

function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();

(async function main() {
  var adapter = Adapter.create({ agentCore: AC });
  var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: false });
  var pass = 0, fails = [];
  for (var i = 0; i < QUESTIONS.length; i++) {
    var q = QUESTIONS[i];
    try {
      var r = await Request.handle(q, CTX, CFG, { adapter: adapter, registry: registry, store: null });
      var old = AC.buildAnswer(q, CTX, CFG);
      var same = T.canonicalJSON(r.answer && r.answer.sections) === T.canonicalJSON(old.sections);
      if (same) pass++;
      else fails.push({ q: q, mode: r.mode, template: r.control && r.control.plan && r.control.plan.template });
    } catch (e) {
      fails.push({ q: q, error: String(e && e.message) });
    }
  }
  for (var j = 0; j < fails.length; j++) {
    console.log('FAIL | ' + fails[j].q + ' | mode=' + (fails[j].mode || '-') +
      ' template=' + (fails[j].template || '-') + (fails[j].error ? ' error=' + fails[j].error : ''));
  }
  console.log('');
  console.log('CASES ' + (QUESTIONS.length - fails.length) + '/' + QUESTIONS.length);
  console.log('ASSERTIONS ' + pass + '/' + QUESTIONS.length);
  console.log('RESULT ' + pass + '/' + QUESTIONS.length);
  process.exit(fails.length === 0 ? 0 : 1);
})();
