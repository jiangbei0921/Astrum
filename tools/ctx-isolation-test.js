/* ASTRUM · P2 上下文隔离测试（零依赖，纯 Node）
 *
 * 为什么需要：P2 计划用「分片 + 并行」执行 compose，但 compose 会原地写 answer。
 * 上下文（ctx）是否会被分片之间互相污染，此前只有静态阅读，没有可执行证据。
 *
 * 本测试锁定四个事实：
 *   A) 浅拷贝（Object.assign({}, ctx)）**不能**隔离嵌套引用（cityRef）
 *   B) 浅冻结（Object.freeze(ctx)）**不能**阻止修改嵌套对象
 *   C) 现有 compose 不修改 ctx（连续多次调用，CITIES 快照不变）
 *   D) 相同输入重复执行，输出结构一致（可复算前提）
 *   E) ALIAS 惰性初始化：只能间接验证（未导出，见文末说明）
 *
 * 用法：node tools/ctx-isolation-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

/* agents.js 依赖 localStorage 的只有别的模块，这里仍先兜底，避免加载期访问 */
global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

/* 加载顺序与 index.html 一致：先全部 data，再 core。
 * 两个容易漏的依赖（都是测试跑出来的，不是读出来的）：
 *   - data/gear.js   → composeGearFit 引用 GEAR，缺了抛 "GEAR is not defined"
 *   - core/fit.js    → composeGearFit 调 root.FIT.evaluate，缺了抛 "reading 'evaluate'"
 * 结论：13 个 compose 的依赖不止 astro/KB/CAT，至少还有 GEAR/FIT/OBSPLAN。 */
['data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
 'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
 'core/astro.js', 'core/runtime.js', 'core/fit.js', 'core/agents.js'].forEach(function (f) {
  require(path.join(ROOT, f));
});

var AC = global.AgentCore;
if (!AC) { console.error('AgentCore 未挂载'); process.exit(1); }

var pass = 0, fail = 0, lines = [];
function ok(name, cond, extra) {
  if (cond) { pass++; lines.push('PASS | ' + name + (extra ? ' | ' + extra : '')); }
  else { fail++; lines.push('FAIL | ' + name + (extra ? ' | ' + extra : '')); }
}

/* 真实 ctx 形状（与 app.js initContext 一致：扁平 + cityRef 一个对象引用） */
function makeCtx(city) {
  var c = city || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0, tz: 8,
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c
  };
}

/* ---------- A) 浅拷贝 vs 双层拷贝 ---------- */
(function testA() {
  var city = AC.CITIES[0];
  var original = city.n;

  /* A1：浅拷贝后改嵌套对象 → 会污染源对象 */
  var ctx1 = makeCtx(city);
  var shallow = Object.assign({}, ctx1);
  shallow.cityRef.n = '__probe_shallow__';
  var leakedByShallow = (city.n === '__probe_shallow__');
  city.n = original;

  ok('A1 浅拷贝无法隔离 cityRef（确实会污染源对象）', leakedByShallow === true,
    'leaked=' + leakedByShallow);

  /* A2：双层拷贝（外层 + cityRef 一层）→ 不污染 */
  var ctx2 = makeCtx(city);
  var deep = Object.assign({}, ctx2, { cityRef: Object.assign({}, ctx2.cityRef) });
  deep.cityRef.n = '__probe_deep__';
  var leakedByDeep = (city.n === '__probe_deep__');
  city.n = original;

  ok('A2 双层拷贝可隔离 cityRef（值语义副本）', leakedByDeep === false,
    'leaked=' + leakedByDeep);

  /* 还原，避免污染后续测试 */
  city.n = original;
})();

/* ---------- B) 浅冻结 vs 双层冻结 ---------- */
(function testB() {
  var city = AC.CITIES[1];
  var original = city.n;

  /* B1：只冻结外层，嵌套仍可写 */
  var ctx1 = Object.freeze(makeCtx(city));
  var threwOuter = false;
  try {
    'use strict';
    ctx1.cityRef.n = '__frozen_probe__';   // 不抛：冻结只作用于 ctx 自身属性
  } catch (e) { threwOuter = true; }
  var nestedWritable = (city.n === '__frozen_probe__');
  city.n = original;

  ok('B1 浅冻结不覆盖嵌套对象（嵌套仍可写）', threwOuter === false && nestedWritable === true,
    'threw=' + threwOuter + ' writable=' + nestedWritable);

  /* B2：连 cityRef 一起冻结 → 写嵌套会抛 TypeError（严格模式） */
  var ctx2 = Object.freeze(Object.assign({}, makeCtx(city), { cityRef: Object.freeze({ n: city.n }) }));
  var threwNested = false;
  try { ctx2.cityRef.n = '__x__'; } catch (e) { threwNested = true; }

  ok('B2 双层冻结可阻止写嵌套', threwNested === true, 'threw=' + threwNested);
})();

/* ---------- C) compose 是否修改 ctx ---------- */
(function testC() {
  var ctx = makeCtx();
  var snapshot = JSON.stringify(AC.CITIES.map(function (c) { return [c.n, c.lat, c.lon]; }));

  var queries = ['M42 在哪', '今晚在北京能看到什么', '你好', '木星现在离地球多远', 'M31 和 M33 哪个更适合 80mm'];
  var ctxBefore = JSON.stringify(ctx);
  var cfg = AC.defaultConfig();
  var errors = [];

  queries.forEach(function (q) {
    try { AC.buildAnswer(q, ctx, cfg); } catch (e) { errors.push(q + ': ' + e.message); }
  });

  var ctxAfter = JSON.stringify(ctx);
  var citiesAfter = JSON.stringify(AC.CITIES.map(function (c) { return [c.n, c.lat, c.lon]; }));

  ok('C1 连续 5 次 buildAnswer 未修改 ctx', ctxBefore === ctxAfter,
    ctxBefore === ctxAfter ? '一致' : '有变更');
  ok('C2 全局 CITIES 未被污染', snapshot === citiesAfter,
    snapshot === citiesAfter ? '一致' : '有变更');
  ok('C3 上述调用无异常', errors.length === 0, errors.slice(0, 2).join('; '));
})();

/* ---------- D) 重复执行一致性 ---------- */
(function testD() {
  var cfg = AC.defaultConfig();
  var q = 'M42 今晚在北京几点最高';

  function run() {
    var ans = AC.buildAnswer(q, makeCtx(), cfg);
    return JSON.stringify({
      intent: ans.intent,
      kinds: ans.sections.map(function (s) { return s.kind; }),
      meta: { confidence: ans.meta && ans.meta.confidence, tier: ans.meta && ans.meta.tier }
    });
  }

  var a = run(), b = run();
  ok('D1 同输入两次执行结构一致', a === b, a === b ? '一致' : '不同');

  /* 交替不同问题后再跑，验证无历史残留 */
  AC.buildAnswer('你好', makeCtx(), cfg);
  AC.buildAnswer('今晚在北京能看到什么', makeCtx(), cfg);
  var c = run();
  ok('D2 中间插入其他问题后仍一致（无残留）', a === c, a === c ? '一致' : '不同');
})();

/* ---------- E) ALIAS（间接验证） ---------- */
(function testE() {
  /* ALIAS 未由 AgentCore 导出，无法直接断言长度或 READY。
   * 可执行证据有两条：
   *   1) 源码静态守卫：agents.js:301 `if (READY) return;`，334 `READY = true`
   *   2) 行为：首次调用后再次调用，结果与首次一致（说明别名表稳定，不会半途重建）
   * 真正的并发风险在当前实现下不存在：JS 单线程 + 构建过程无 await。 */
  var cfg = AC.defaultConfig();
  var first = AC.buildAnswer('M42 在哪', makeCtx(), cfg);
  var second = AC.buildAnswer('M42 在哪', makeCtx(), cfg);
  var same = JSON.stringify(first.sections) === JSON.stringify(second.sections);
  ok('E1 二次执行与首次一致（别名表稳定）', same, same ? '一致' : '不同');

  lines.push('NOTE | E2 ALIAS 未导出，长度/READY 无法直接断言；以静态守卫 + 行为一致性替代');
  lines.push('NOTE | E3 当前为单线程同步构建，并发初始化风险不成立；若未来改为 async 需重新评估');
})();

/* ---------- F) 逐 intent 覆盖 13 个 compose ---------- */
(function testF() {
  /* 每个 intent 至少一个问题，用于覆盖 13 个 compose 分支。
   * 目的不是验证答案对不对，而是验证"跑遍所有分支都不污染 ctx"。 */
  var cases = [
    '你好',                       // composeSmalltalk
    '打开太阳系',                 // composeSystemView
    '今晚有流星雨吗',             // composeEvent
    'M42 是什么',                 // composeTarget · knowledge
    '超新星爆发是怎么回事',       // composeNova
    '今天太阳活动强吗',           // composeHelios
    '黑洞是什么',                 // composeCosmos
    '今晚在北京能看到什么',       // composeTonight
    '买什么望远镜好',             // composeGear（不能用「推荐」，会被 tonight 抢先命中）
    'M42 用 80mm 能拍吗',         // composeGearFit
    '星座怎么认',                 // composeChart（不能带具体目标，否则走 target 分支）
    'M42 拍摄参数',               // composePhoto
    'M42 在哪',                   // composeTarget · observe
    'M42',                        // composeTarget · intro
    'asdfghjkl'                   // composeFallback
  ];

  var cfg = AC.defaultConfig();
  var ctx = makeCtx();
  var ctxSnap = JSON.stringify(ctx);
  var citySnap = JSON.stringify(AC.CITIES.map(function (c) { return [c.n, c.lat, c.lon]; }));
  var seen = {}, errs = [];

  cases.forEach(function (q) {
    try {
      var ans = AC.buildAnswer(q, ctx, cfg);
      seen[ans.intent] = (seen[ans.intent] || 0) + 1;
    } catch (e) {
      errs.push(q + ' → ' + e.message);
    }
  });

  var intents = Object.keys(seen).sort();
  ok('F1 覆盖全部 15 个 intent 分支', intents.length === 15, intents.join(','));
  ok('F2 全部分支未修改 ctx', JSON.stringify(ctx) === ctxSnap,
    JSON.stringify(ctx) === ctxSnap ? '一致' : '有变更');
  ok('F3 全部分支未污染 CITIES', JSON.stringify(AC.CITIES.map(function (c) { return [c.n, c.lat, c.lon]; })) === citySnap,
    '快照比对');
  ok('F4 无异常', errs.length === 0, errs.slice(0, 2).join('; '));

  lines.push('NOTE | F5 覆盖的 intent：' + intents.join(', '));
})();

/* ---------- 输出 ---------- */
lines.unshift('RESULT ' + pass + '/' + (pass + fail));
console.log(lines.join('\n'));
process.exit(fail === 0 ? 0 : 1);
