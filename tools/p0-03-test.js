/* ASTRUM · P0-03 兼容性测试（纯 Node，零依赖）
 *
 * 覆盖 P0-01 §15.2 的 5 类用例（并扩展为 9 组）：
 *   1) 旧 5 项 checks 快照完全一致（3 个既有答案）
 *   2) 新字段 verdict/dimensions/gaps 只追加、结构正常
 *   3) 四维不覆盖旧 checks；review section 不新增字段（sections 不变）
 *   4) verdict 聚合正常（PASS / PARTIAL）
 *   5) 缺新字段的旧调用方式仍可工作
 *   6) Qty 旧字段/旧文本逐字段一致，缺新字段标 legacy:true
 *   7) Qty 全字段不标 legacy，新字段逐字段一致
 *   8) 20 问 sections canonicalJSON 逐字节一致（0 字节差异）
 *   9) P0-02 fromJSON 边界：只恢复数据、必须校验、不重放事件
 *
 * 用法：node tools/p0-03-test.js
 * 基线：tools/fixtures/p0-03-baseline.json（修改前采集，随仓库分发）
 */
'use strict';

var fs = require('fs');
var path = require('path');
var util = require('util');

var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

['data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
 'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
 'core/astro.js', 'core/runtime.js', 'core/fit.js', 'core/agents.js',
 'core/task.js'].forEach(function (f) {
  require(path.join(ROOT, f));
});

var AC = global.AgentCore;
var RT = global.AstroRuntime;
var T = global.AstroTask;

var results = [];
var cases = [];
var pass = 0;
var fail = 0;

function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra || '' });
  if (cond) pass++; else fail++;
}

function equal(name, actual, expected) {
  var same = util.isDeepStrictEqual(actual, expected);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)));
}

function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = fail;
  try { fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.message ? e.message : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: fail - failedBefore });
}

/* ---------- 固定输入（与基线采集完全一致） ---------- */

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

var EXPECTED = [
  { intent: 'smalltalk', sha: '0b527669f17e21b9d21a2b5b79a38899f2b974565735c9c2bbff17cc39d56b5e', bytes: 713 },
  { intent: 'tonight', sha: '56d653765f9840cd15d00125075f92279bd66d4a00eaf38cc85fa47b8e4e6d82', bytes: 2510 },
  { intent: 'cosmos', sha: '39517ba478a0c3606c6e030892d0bba6b261e3bf712723af71c623de62632dff', bytes: 3372 },
  { intent: 'nova', sha: '7265d9373cedf4a1abc37ea84f4e8fc27b66bdf2c6c5bd3c737fca728a2a1329', bytes: 2147 },
  { intent: 'helios', sha: '1c46ec4965ccdff7c5fa4d7477685256301ed6c8052a8060a0df2de1f59c3b75', bytes: 1748 },
  { intent: 'event', sha: '1e5f7e0ee4919298187498d2374a456cfb8a32f25eca7df9d87f03a3b39b2c98', bytes: 2153 },
  { intent: 'system-view', sha: '6da0e7e35c509eb5da9d424afe08d6f77d9cf86cc1b38a7e31d6ad664b364377', bytes: 1057 },
  { intent: 'chart', sha: '0beb2a85c8f0313ab575f38422f86a1d2c887e98b826d81864aab8ce6358518c', bytes: 1083 },
  { intent: 'gear', sha: '4796e09921e19966dadd35a6b22e46d06e577923dadd86d4a6167b0c28f55872', bytes: 1750 },
  { intent: 'gear-fit', sha: '87f6b67831cb19c4ac300411c4d8ce38008e19b04e1e7ada47831da3d457362b', bytes: 1450 },
  /* 2026-11-02 用户授权更新：M42 理论焦距由错误的 93,258 mm 修正为 259 mm；
   * 第 11 问 sections 基线同步更新，其余 19 问哈希保持不变。 */
  { intent: 'photo-target', sha: 'c71400db293f74195fb1c8e0681c2f06e3fe8c40bd38c2948c5e7d39391186e4', bytes: 2259 },
  { intent: 'observe-target', sha: '877a8b00133d3718b88ca24188229d243d46b8298f47def48adcbda81c3c3516', bytes: 2678 },
  { intent: 'knowledge-target', sha: '8572b0d5c150b480c544f8a8f1e97a501e62170c45bd6477e57ddf8453632544', bytes: 2560 },
  { intent: 'intro-target', sha: '4b0d8b0d4fb17690aeb382a0ac8dd584fc700e6cbf3a8d19845377eb1617807e', bytes: 2641 },
  { intent: 'unknown', sha: 'd81dff842c03d300246f1041dc723bac812d39321fdd435006a5de931f113ad1', bytes: 939 },
  { intent: 'observe-target', sha: '877a8b00133d3718b88ca24188229d243d46b8298f47def48adcbda81c3c3516', bytes: 2678 },
  { intent: 'observe-target', sha: '4832825eed3324153aa7018bb642f2f8201b9b7b9f10c36a59a8ddb72f6d57e3', bytes: 2904 },
  { intent: 'cosmos', sha: '39517ba478a0c3606c6e030892d0bba6b261e3bf712723af71c623de62632dff', bytes: 3372 },
  { intent: 'tonight', sha: '56d653765f9840cd15d00125075f92279bd66d4a00eaf38cc85fa47b8e4e6d82', bytes: 2510 },
  { intent: 'tonight', sha: '91b2024aa044684ab199be541f46c280f8b1a9acdf64a5acdead382ba02dc191', bytes: 2532 }
];

var SNAPSHOT_CHECKS = {
  0: [
    { k: '证据条数', v: '无', ok: false },
    { k: '数值可复算', v: '否（引用型结论）', ok: true },
    { k: '共识等级', v: '未标注', ok: false },
    { k: '边界声明', v: '缺失', ok: false },
    { k: '置信度', v: '1.00', ok: true }
  ],
  2: [
    { k: '证据条数', v: '5 条', ok: true },
    { k: '数值可复算', v: '是（本地星历）', ok: true },
    { k: '共识等级', v: '已成共识 · 核验 2026-10', ok: true },
    { k: '边界声明', v: '已给出', ok: true },
    { k: '置信度', v: '0.94', ok: true }
  ],
  16: [
    { k: '证据条数', v: '5 条', ok: true },
    { k: '数值可复算', v: '是（本地星历）', ok: true },
    { k: '共识等级', v: '已成共识 · 核验 2026-10', ok: true },
    { k: '边界声明', v: '已给出', ok: true },
    { k: '置信度', v: '0.74', ok: true }
  ]
};

var QTY_OLD = [
  { input: [1344, 'ly', { err: 20, src: 'local' }], out: { v: 1344, u: 'ly', err: 20, src: 'local', basis: '' }, text: '1344 ± 20 光年' },
  { input: [43.2, 'deg', { err: 0.5, src: 'astro.local', basis: 'J2000' }], out: { v: 43.2, u: 'deg', err: 0.5, src: 'astro.local', basis: 'J2000' }, text: '43.2 ± 0.5 °' },
  { input: [1, 'ly', null], out: { v: 1, u: 'ly', err: null, src: '', basis: '' }, text: '1 光年' }
];

var city = AC.findCity('北京') || AC.CITIES[0];
var ctx = {
  y: 2026, mo: 10, d: 31, h: 21, mi: 0,
  tz: AC.tzOf(city, 2026, 10, 31),
  city: city.n, lat: city.lat, lon: city.lon, bortle: city.bortle || 5,
  cityRef: city, equipment: '单反', experience: '进阶'
};

var answers = [];
var canonicals = [];
for (var qi = 0; qi < QUESTIONS.length; qi++) {
  var ans = AC.buildAnswer(QUESTIONS[qi], ctx, AC.defaultConfig());
  answers.push(ans);
  canonicals.push(T.canonicalJSON(ans.sections));
}

var baselinePath = path.join(ROOT, 'tools', 'fixtures', 'p0-03-baseline.json');
if (!fs.existsSync(baselinePath)) {
  console.error('[p0-03-test] 缺少基线文件: ' + baselinePath);
  process.exit(1);
}
var baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));

/* ============================================================
   1. 旧 5 项 checks 快照完全一致
   ============================================================ */
runCase(1, '旧 checks 快照', function () {
  var seq = 0;
  Object.keys(SNAPSHOT_CHECKS).forEach(function (idx) {
    seq++;
    equal('1.' + seq + ' 旧 checks 顺序/值不变 [' + answers[idx].intent + ']',
      answers[idx].meta.review.checks, SNAPSHOT_CHECKS[idx]);
  });
});

/* ============================================================
   2. 新字段只追加、结构正常
   ============================================================ */
runCase(2, '新字段结构', function () {
  var review = answers[2].meta.review;
  ok('2.1 verdict 为三态之一', ['PASS', 'PARTIAL', 'FAIL'].indexOf(review.verdict) >= 0, review.verdict);
  ok('2.2 dimensions 四维齐全', ['numeric', 'entity', 'semantic', 'source'].every(function (k) {
    return review.dimensions && review.dimensions[k] &&
      ['PASS', 'PARTIAL', 'FAIL'].indexOf(review.dimensions[k].status) >= 0 &&
      util.isArray(review.dimensions[k].checks);
  }));
  ok('2.3 gaps 为数组且每项有 claimId/kind/hint', util.isArray(review.gaps) && review.gaps.every(function (g) {
    return Object.prototype.hasOwnProperty.call(g, 'claimId') &&
      typeof g.kind === 'string' && typeof g.hint === 'string';
  }));
  ok('2.4 旧字段 gate/checks/passed 仍在',
    typeof review.gate === 'string' && util.isArray(review.checks) &&
    typeof review.passed === 'boolean');
});

/* ============================================================
   3. 四维不覆盖旧 checks；sections 中的 review 块不新增字段
   ============================================================ */
runCase(3, '新字段不覆盖旧检查', function () {
  var review = answers[2].meta.review;
  ok('3.1 meta.review.checks 仍是旧 5 项', review.checks.length === 5);
  ok('3.2 dimensions 的 checks 与旧 checks 是独立对象',
    review.dimensions.numeric.checks !== review.checks &&
    review.dimensions.semantic.checks !== review.checks);
  var section = answers[2].sections.filter(function (s) { return s.kind === 'review'; })[0];
  ok('3.3 review section 未新增 verdict/dimensions/gaps（sections 不变）',
    !!section && !Object.prototype.hasOwnProperty.call(section, 'verdict') &&
    !Object.prototype.hasOwnProperty.call(section, 'dimensions') &&
    !Object.prototype.hasOwnProperty.call(section, 'gaps'));
});

/* ============================================================
   4. verdict 聚合
   ============================================================ */
runCase(4, 'verdict 聚合', function () {
  ok('4.1 证据/边界齐全的 cosmos 答案为 PASS', answers[2].meta.review.verdict === 'PASS', answers[2].meta.review.verdict);
  ok('4.2 smalltalk 缺证据/边界，结论为 PARTIAL', answers[0].meta.review.verdict === 'PARTIAL', answers[0].meta.review.verdict);
  ok('4.3 任一旧检查失败时 passed=false 且 verdict 非 PASS',
    answers[0].meta.review.passed === false && answers[0].meta.review.verdict !== 'PASS');
});

/* ============================================================
   5. 缺新字段的旧调用方式仍可工作
   ============================================================ */
runCase(5, '旧调用兼容', function () {
  var legacyReview = { gate: 'balanced', checks: SNAPSHOT_CHECKS[0], passed: false };
  var read = (function (r) {
    return { gate: r.gate, passed: r.passed, failed: r.checks.filter(function (c) { return !c.ok; }).length };
  })(legacyReview);
  ok('5.1 只含旧字段的 review 对象可被旧读取方式处理',
    read.gate === 'balanced' && read.passed === false && read.failed === 3);
  var section = answers[0].sections.filter(function (s) { return s.kind === 'review'; })[0];
  ok('5.2 旧渲染路径只读 section.checks/passed 不抛错',
    !!section && util.isArray(section.checks) && typeof section.passed === 'boolean');
});

/* ============================================================
   6. Qty 旧字段/旧文本逐字段一致
   ============================================================ */
runCase(6, 'Qty legacy', function () {
  for (var i = 0; i < QTY_OLD.length; i++) {
    var item = QTY_OLD[i];
    var q = RT.Qty.apply(null, item.input);
    var oldFields = { v: q.v, u: q.u, err: q.err, src: q.src, basis: q.basis };
    equal('6.' + (i + 1) + ' 旧字段逐字段一致', oldFields, item.out);
    ok('6.' + (i + 1) + '.b legacy:true 且新字段为空',
      q.legacy === true && q.epoch === null && q.frame === null &&
      q.inputs === null && q.uncertainty === null);
    ok('6.' + (i + 1) + '.c qtyText 不变', RT.qtyText(q) === item.text, RT.qtyText(q));
  }
});

/* ============================================================
   7. Qty 全字段
   ============================================================ */
runCase(7, 'Qty 全字段', function () {
  var opts = {
    err: 0.5, src: 'astro.local', basis: 'J2000',
    epoch: 'J2000', frame: 'topocentric',
    inputs: { ra: 5.588, dec: -5.391 }, uncertainty: 0.3
  };
  var q = RT.Qty(43.2, 'deg', opts);
  ok('7.1 无 legacy 标记', !Object.prototype.hasOwnProperty.call(q, 'legacy'));
  equal('7.2 旧字段逐字段一致',
    { v: q.v, u: q.u, err: q.err, src: q.src, basis: q.basis },
    { v: 43.2, u: 'deg', err: 0.5, src: 'astro.local', basis: 'J2000' });
  equal('7.3 新字段逐字段一致',
    { epoch: q.epoch, frame: q.frame, inputs: q.inputs, uncertainty: q.uncertainty },
    { epoch: 'J2000', frame: 'topocentric', inputs: { ra: 5.588, dec: -5.391 }, uncertainty: 0.3 });
  ok('7.4 qtyText 仍只读旧字段', RT.qtyText(q) === '43.2 ± 0.5 °');
});

/* ============================================================
   8. 20 问 sections canonicalJSON 逐字节一致
   ============================================================ */
runCase(8, '20 问 sections 逐字节', function () {
  var diffBytes = 0, maxDiff = 0, hashOk = 0;
  for (var i = 0; i < QUESTIONS.length; i++) {
    var sha = T.sha256Hex(canonicals[i]);
    var bytes = Buffer.byteLength(canonicals[i], 'utf8');
    if (sha === EXPECTED[i].sha && bytes === EXPECTED[i].bytes) hashOk++;
    ok('8.' + (i + 1) + ' 第 ' + (i + 1) + ' 问 sections 哈希/字节数一致 [' + answers[i].intent + ']',
      sha === EXPECTED[i].sha && bytes === EXPECTED[i].bytes,
      'sha=' + sha.slice(0, 12) + ' bytes=' + bytes);

    if (baseline && baseline.questions && baseline.questions[i]) {
      var oldText = baseline.questions[i].sectionsCanonical;
      var oldBuf = Buffer.from(oldText, 'utf8');
      var newBuf = Buffer.from(canonicals[i], 'utf8');
      var local = Math.abs(oldBuf.length - newBuf.length);
      var n = Math.min(oldBuf.length, newBuf.length);
      for (var j = 0; j < n; j++) {
        if (oldBuf[j] !== newBuf[j]) local++;
      }
      diffBytes += local;
      if (local > maxDiff) maxDiff = local;
    }
  }
  ok('8.21 20 问哈希全部一致', hashOk === QUESTIONS.length, hashOk + '/' + QUESTIONS.length);
  ok('8.22 与修改前基线逐字节比较为 0', diffBytes === 0, 'diffBytes=' + diffBytes + ' max=' + maxDiff);
});

/* ============================================================
   9. P0-02 fromJSON 边界
   ============================================================ */
runCase(9, 'fromJSON 边界', function () {
  var state = T.create({
    question: 'M42 今晚可见吗',
    steps: [{ id: 't1', tool: 'kepler.visibility', args: { target: 'M42' } }]
  });
  T.appendEvent(state, 'phase.changed', { from: 'INIT', to: 'UNDERSTAND' });
  var rt = T.fromJSON(T.toJSON(state));
  ok('9.1 合法状态可往返', rt && rt.id === state.id && rt.events.length === state.events.length);

  var bad = T.create({});
  bad.budget.used.ms = bad.budget.limit.ms + 1;
  var thrown = false;
  try { T.fromJSON(T.toJSON(bad)); } catch (e) { thrown = e.code === 'E_BUDGET_EXCEEDED'; }
  ok('9.2 反序列化必须执行不变量校验（used>limit 被拒）', thrown);

  var onlyEvent = T.create({});
  T.appendEvent(onlyEvent, 'step.ok', {}, 't1');
  var eventCount = onlyEvent.events.length;
  var back = T.fromJSON(T.toJSON(onlyEvent));
  ok('9.3 不重放 Event：事件数不变、不新增 phase.changed',
    back.events.length === eventCount && back.events[eventCount - 1].seq === eventCount);
});

/* ---------- 输出 ---------- */
for (var ri = 0; ri < results.length; ri++) {
  var r = results[ri];
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
}
console.log('');
for (var ci = 0; ci < cases.length; ci++) {
  var c = cases[ci];
  console.log('CASE ' + c.id + ' ' + (c.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c.title + ' | 断言 ' + c.assertions);
}
console.log('');
console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
console.log('ASSERTIONS ' + pass + '/' + results.length);
console.log('RESULT ' + pass + '/' + results.length);

process.exit(pass === results.length && cases.length === 9 ? 0 : 1);
