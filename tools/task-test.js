/* ASTRUM · P0-02 基础契约层测试（纯 Node，零依赖）
 *
 * 对应冻结清单：
 *   docs/architecture/P0-01-目标架构总蓝图.md §15.1（24 例）
 *   docs/architecture/P0-01.1-设计冻结检查.md §6.1/§6.3
 *
 * 覆盖：
 *   A. TaskState 结构、5 条不变量、状态机合法/非法转移、Event 追加（12 例）
 *   B. Schema 校验器正/负例（2 例）
 *   C. Claim 结构与 6 条 fixture + R1 派生（7 例）
 *   D. Qty legacy 兼容（2 例）
 *   E. Node 环境可用性（1 例）
 *
 * 用法：node tools/task-test.js
 */
'use strict';

var path = require('path');
var util = require('util');
var crypto = require('crypto');

require(path.resolve(__dirname, '..', 'core', 'task.js'));
require(path.resolve(__dirname, '..', 'core', 'schema.js'));
require(path.resolve(__dirname, '..', 'core', 'claims.js'));

var T = global.AstroTask;
var S = global.AstroSchema;
var C = global.AstroClaims;

var results = [];
var cases = [];

function ok(name, pass, extra) {
  results.push({ name: name, pass: !!pass, extra: extra || '' });
}

function equal(name, actual, expected, extra) {
  var pass = util.isDeepStrictEqual(actual, expected);
  ok(name, pass, pass ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected) + (extra ? ' | ' + extra : '')));
}

function noThrow(name, fn) {
  try {
    fn();
    ok(name, true);
  } catch (e) {
    ok(name, false, e && e.message ? e.message : String(e));
  }
}

function throwsWith(fn, code, pathText) {
  try {
    fn();
    return { ok: false, error: null };
  } catch (e) {
    var codeOk = !code || e.code === code;
    var pathOk = !pathText || (e.path && e.path.indexOf(pathText) >= 0);
    return { ok: codeOk && pathOk, error: e };
  }
}

function transitionRejected(from, to, ctx, reasonText) {
  try {
    T.assertValidTransition(from, to, ctx);
    return false;
  } catch (e) {
    return e.code === 'E_INVALID_TRANSITION' &&
      e.from === from && e.to === to &&
      String(e.message).indexOf('from=' + from) >= 0 &&
      String(e.message).indexOf('to=' + to) >= 0 &&
      String(e.message).indexOf(reasonText) >= 0;
  }
}

function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try {
    fn();
  } catch (e) {
    ok(id + ' 执行异常', false, e && e.message ? e.message : String(e));
  }
  var added = results.length - before;
  var failedNow = results.filter(function (r) { return !r.pass; }).length;
  cases.push({ id: id, title: title, assertions: added, failed: failedNow - failedBefore });
}

/* ============================================================
   例 1：create() 默认值 + 与旧 answer 隔离
   ============================================================ */
runCase(1, 'create() 默认值', function () {
  var s = T.create({});
  var answer = {
    query: 'M42 今晚可见吗',
    intent: 'tonight',
    ctx: { place: { name: '北京' } },
    targets: [],
    trace: [{ agent: 'muse', action: 'detectIntent', detail: '', ms: 1 }],
    sections: [{ kind: 'text', text: 'x' }],
    meta: {}
  };
  var snapshot = JSON.stringify(answer);

  ok('1.1 phase=INIT', s.phase === 'INIT', s.phase);
  ok('1.2 events=[]', Array.isArray(s.events) && s.events.length === 0);
  ok('1.3 schemaVersion=1', s.schemaVersion === 1);
  ok('1.4 默认值可通过 validate', (function () {
    try { T.validate(s); return true; } catch (e) { return false; }
  })());
  ok('1.5 不挂载到 answer/sections', !('sections' in s) && !('answer' in s) && !('task' in s) && !('taskState' in s));
  ok('1.6 answer 未被污染且 trace 独立', JSON.stringify(answer) === snapshot && s.trace !== answer.trace);
});

/* ============================================================
   例 2：序列化往返
   ============================================================ */
runCase(2, 'create→toJSON→fromJSON', function () {
  var s = T.create({
    question: 'M42 今晚可见吗',
    mode: 'single',
    steps: [{ id: 't1', tool: 'kepler.visibility', args: { target: 'M42' }, critical: true }],
    claims: [C.FIXTURE.C2.claim]
  });
  var text = T.toJSON(s);
  var rt = T.fromJSON(text);
  equal('2.1 深比较相等', rt, s);
  ok('2.2 无函数残留', text.indexOf('function') === -1 && typeof rt.create === 'undefined');
  ok('2.3 可再次序列化', typeof T.toJSON(rt) === 'string');
  var canonical = T.canonicalJSON({ target: 'M42' });
  var expectedHash = crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
  ok('2.4 inputHash=sha256(canonicalJSON(args))',
    s.steps[0].inputHash === expectedHash &&
    T.sha256Hex('abc') === crypto.createHash('sha256').update('abc', 'utf8').digest('hex'));
});

/* ============================================================
   例 3/4：不变量 1 —— ok ⇒ outputHash 非空
   ============================================================ */
runCase(3, '不变量 1 正例', function () {
  var s = T.create({ steps: [{ id: 't1', status: 'ok', outputHash: 'h1' }] });
  noThrow('3.1 ok+outputHash 通过', function () { T.validate(s); });
});

runCase(4, '不变量 1 反例', function () {
  var s = T.create({ steps: [{ id: 't1', status: 'ok', outputHash: null }] });
  var r = throwsWith(function () { T.validate(s); }, 'E_STEP_OUTPUT_HASH', 'steps[0].outputHash');
  ok('4.1 抛错且带字段路径', r.ok, r.error ? r.error.message : '未抛错');
  ok('4.2 错误码正确', r.error && r.error.code === 'E_STEP_OUTPUT_HASH', r.error ? r.error.code : '');
});

/* ============================================================
   例 5/6：不变量 2 —— kepler + quantitative ⇒ CalcRecord
   ============================================================ */
runCase(5, '不变量 2 正例', function () {
  var s = T.create({ claims: [C.FIXTURE.C1.claim] });
  noThrow('5.1 kepler 定量 + 合法 CalcRecord 通过', function () { T.validate(s); });
});

runCase(6, '不变量 2 反例', function () {
  var claim = C.makeClaim({
    id: 'c-no-calc', text: 'M42 视高度 43.2°', type: 'quantitative',
    source: 'kepler', calc: null,
    uncertainty: { kind: 'measurement', value: 0.3, basis: '星历' },
    support: [{ eid: 'e1', strength: 'strong', basis: 'semantic' }]
  });
  var s = T.create({ claims: [claim] });
  var r = throwsWith(function () { T.validate(s); }, 'E_CLAIM_CALC_REQUIRED', 'claims[0].calc');
  ok('6.1 calc=null 抛错', r.ok, r.error ? r.error.message : '未抛错');
  ok('6.2 错误码 E_CLAIM_CALC_REQUIRED', r.error && r.error.code === 'E_CLAIM_CALC_REQUIRED', r.error ? r.error.code : '');
});

/* ============================================================
   例 7：不变量 3 —— 无 calc 的定量 claim，numeric 不得 PASS
   ============================================================ */
runCase(7, '不变量 3 负向', function () {
  var claim = C.makeClaim({
    id: 'c-no-calc-2', text: 'M42 视高度 43.2°', type: 'quantitative',
    source: 'kb', calc: null,
    uncertainty: { kind: 'measurement', value: 0.3, basis: '星历' },
    support: [{ eid: 'e2', strength: 'strong', basis: 'semantic' }]
  });
  var judged = C.judgeClaim(claim, { claims: [claim] });
  ok('7.1 numeric 不得 PASS', judged.dimensions.numeric.status !== 'PASS', judged.dimensions.numeric.status);
  ok('7.2 整体 verdict 不得 PASS', judged.verdict !== 'PASS', judged.verdict);
});

/* ============================================================
   例 8：不变量 4 —— eval ≠ null ⇒ 至少一条 required claim
   ============================================================ */
runCase(8, '不变量 4 正/反', function () {
  var evalObj = {
    verdict: 'PASS',
    dimensions: {
      numeric: { status: 'PASS', checks: [] },
      entity: { status: 'PASS', checks: [] },
      semantic: { status: 'PASS', checks: [] },
      source: { status: 'PASS', checks: [] }
    },
    checks: [], gaps: [], retryHint: null, llmNote: null
  };
  var claim = C.makeClaim({
    id: 'c-req', text: 'M42 是恒星形成区', type: 'qualitative',
    source: 'kb', required: true, support: [{ eid: 'e2', strength: 'strong', basis: 'semantic' }]
  });
  var good = T.create({ claims: [claim], eval: evalObj });
  var badClaim = C.makeClaim({
    id: 'c-not-req', text: 'M42 是恒星形成区', type: 'qualitative',
    source: 'kb', required: false, support: [{ eid: 'e2', strength: 'strong', basis: 'semantic' }]
  });
  var bad = T.create({ claims: [badClaim], eval: evalObj });

  ok('8.1 有 required:true 通过', (function () {
    try { T.validate(good); return true; } catch (e) { return false; }
  })());
  var r = throwsWith(function () { T.validate(bad); }, 'E_EVAL_REQUIRES_REQUIRED_CLAIM', 'claims');
  ok('8.2 无 required:true 抛错', r.ok, r.error ? r.error.message : '未抛错');
  ok('8.3 错误码正确', r.error && r.error.code === 'E_EVAL_REQUIRES_REQUIRED_CLAIM', r.error ? r.error.code : '');
});

/* ============================================================
   例 9：不变量 5 —— used ≤ limit
   ============================================================ */
runCase(9, '不变量 5', function () {
  var s = T.create({});
  ok('9.1 默认预算通过', (function () {
    try { T.validate(s); return true; } catch (e) { return false; }
  })());
  s.budget.used.ms = s.budget.limit.ms + 1;
  var r = throwsWith(function () { T.validate(s); }, 'E_BUDGET_EXCEEDED', 'budget.used.ms');
  ok('9.2 used>limit 抛错', r.ok, r.error ? r.error.message : '未抛错');
  ok('9.3 错误路径指向 ms', r.error && r.error.path === '$.budget.used.ms', r.error ? r.error.path : '');
});

/* ============================================================
   例 10：合法转移（§3.4 全表 20 条）
   ============================================================ */
runCase(10, '合法转移', function () {
  var legal = [
    ['INIT', 'UNDERSTAND'],
    ['INIT', 'ABORTED'],
    ['UNDERSTAND', 'ROUTE'],
    ['ROUTE', 'LEGACY'],
    ['ROUTE', 'PLAN'],
    ['LEGACY', 'DONE'],
    ['PLAN', 'EXECUTE'],
    ['PLAN', 'LEGACY'],
    ['PLAN', 'ABORTED'],
    ['EXECUTE', 'PROGRESS'],
    ['EXECUTE', 'ABORTED'],
    ['PROGRESS', 'EXECUTE'],
    ['PROGRESS', 'PLAN'],
    ['PROGRESS', 'JUDGE'],
    ['JUDGE', 'COMPOSE'],
    ['JUDGE', 'EXECUTE'],
    ['JUDGE', 'FAILED'],
    ['COMPOSE', 'DONE'],
    ['COMPOSE', 'PARTIAL'],
    ['ABORTED', 'COMPOSE']
  ];
  var allOk = true, failedPair = '';
  for (var i = 0; i < legal.length; i++) {
    try {
      var ctx = legal[i][0] === 'JUDGE' && legal[i][1] === 'EXECUTE'
        ? { retryHint: true, retries: 0 }
        : null;
      if (T.assertValidTransition(legal[i][0], legal[i][1], ctx) !== true) {
        allOk = false; failedPair = legal[i].join('→');
      }
    } catch (e) {
      allOk = false;
      failedPair = legal[i].join('→') + ' ' + e.message;
    }
  }
  ok('10.1 §3.4 全表 20 条合法转移均返回 true', allOk, failedPair);
});

/* ============================================================
   例 11：非法转移（§3.4 的 8 类）
   ============================================================ */
runCase(11, '非法转移', function () {
  var cls = [
    ['DONE', 'EXECUTE', null, '终态不可复活', '类1 终态不可复活'],
    ['LEGACY', 'PLAN', null, 'LEGACY 不再进入编排', '类2 LEGACY 不再进入编排'],
    ['PROGRESS', 'COMPOSE', null, '跳过评审', '类3 跳过评审'],
    ['JUDGE', 'PLAN', null, '重规划必须经 EXECUTE', '类4 不得绕回 Planner'],
    ['ABORTED', 'EXECUTE', null, '取消后不得重启执行', '类5 取消后不得重启'],
    ['INIT', 'PLAN', null, '必须先 UNDERSTAND/ROUTE', '类6 INIT 不得直接 PLAN'],
    ['EXECUTE', 'DONE', null, '不得跳过 PROGRESS/JUDGE', '类7 不得跳过评审'],
    ['JUDGE', 'EXECUTE', { retryHint: true, retries: 1 }, '补检只允许一次', '类8 retries≥1 拒绝']
  ];
  for (var i = 0; i < cls.length; i++) {
    ok('11.' + (i + 1) + ' ' + cls[i][4], transitionRejected(cls[i][0], cls[i][1], cls[i][2], cls[i][3]));
  }
  var terminals = ['DONE', 'PARTIAL', 'FAILED'];
  var allTerminalRejected = true;
  for (var j = 0; j < terminals.length; j++) {
    if (!transitionRejected(terminals[j], 'INIT', null, '终态不可复活')) allTerminalRejected = false;
  }
  ok('11.9 DONE/PARTIAL/FAILED 终态均拒绝', allTerminalRejected);
});

/* ============================================================
   例 12：Event 追加（8 类、seq 单调、payload 白名单）
   ============================================================ */
runCase(12, 'events 追加', function () {
  var s = T.create({});
  var items = [
    ['phase.changed', { from: 'INIT', to: 'UNDERSTAND' }, null],
    ['step.started', {}, 't1'],
    ['step.ok', {}, 't1'],
    ['step.failed', { reason: 'timeout' }, 't1'],
    ['step.skipped', { reason: 'budget' }, 't1'],
    ['progress.decided', { action: 'continue' }, null],
    ['verdict.issued', { verdict: 'PASS' }, null],
    ['task.aborted', { reason: 'user' }, null]
  ];
  for (var i = 0; i < items.length; i++) {
    T.appendEvent(s, items[i][0], items[i][1], items[i][2]);
  }
  var seqOk = true, typeOk = true, payloadOk = true, taskOk = true;
  for (var j = 0; j < s.events.length; j++) {
    if (s.events[j].seq !== j + 1) seqOk = false;
    if (s.events[j].type !== items[j][0]) typeOk = false;
    if (s.events[j].taskId !== s.id) taskOk = false;
    var keys = Object.keys(s.events[j].payload);
    for (var k = 0; k < keys.length; k++) {
      if (T.EVENT_PAYLOAD_KEYS.indexOf(keys[k]) < 0) payloadOk = false;
    }
  }
  ok('12.1 seq 从 1 单调递增', seqOk);
  ok('12.2 8 类事件逐条落位', typeOk && s.events.length === 8);
  ok('12.3 payload 仅含白名单键且 taskId 一致', payloadOk && taskOk);
});

/* ============================================================
   例 13/14：Schema 校验器
   ============================================================ */
runCase(13, 'Schema 正例', function () {
  var sample = {
    tasks: [
      { kind: 'tonight', confidence: 0.8 },
      { kind: 'target', confidence: 0.6 }
    ],
    entities: ['M42'],
    complexity: 2
  };
  var r = S.validateIntent(sample);
  ok('13.1 全部命中返回 ok:true', r.ok === true && r.errors.length === 0);
  ok('13.2 12 个 kind 未扩充', S.SCHEMA_KINDS.length === 12);
  ok('13.3 smalltalk/unknown 不在 LLM kind 枚举', S.SCHEMA_KINDS.indexOf('smalltalk') < 0 && S.SCHEMA_KINDS.indexOf('unknown') < 0);
  ok('13.4 15 intent 映射完整且规则专属返回 null',
    S.INTENTS.length === 15 &&
    S.kindForIntent('smalltalk') === null &&
    S.kindForIntent('unknown') === null &&
    S.kindForIntent('observe-target') === 'target');
});

runCase(14, 'Schema 负例', function () {
  var r = S.validateIntent({
    tasks: [{ kind: 'smalltalk', confidence: 'high' }],
    complexity: 5
  });
  ok('14.1 返回 ok:false', r.ok === false);
  ok('14.2 至少 4 条错误', r.errors.length >= 4, 'errors=' + r.errors.length);
  var allHavePathReason = true;
  for (var i = 0; i < r.errors.length; i++) {
    if (typeof r.errors[i].path !== 'string' || !r.errors[i].path) allHavePathReason = false;
    if (typeof r.errors[i].reason !== 'string' || !r.errors[i].reason) allHavePathReason = false;
  }
  ok('14.3 每条错误带 path 与 reason', allHavePathReason);
});

/* ============================================================
   例 15–20：6 条 fixture 逐条验证
   ============================================================ */
function fixtureCase(id, key, extraCheck) {
  runCase(id, 'fixture ' + key, function () {
    var f = C.FIXTURE[key];
    var judged = C.judgeClaim(f.claim, { claims: [f.claim], evidence: f.evidence });
    ok(id + '.1 verdict=' + f.expected.verdict, judged.verdict === f.expected.verdict, judged.verdict);
    ok(id + '.2 rule=' + f.expected.rule, judged.rule === f.expected.rule, judged.rule);
    if (extraCheck) extraCheck(f, judged, id);
  });
}

fixtureCase(15, 'C1', function (f, judged, id) {
  ok(id + '.3 numeric PASS 且不变量 2 成立',
    judged.dimensions.numeric.status === 'PASS' && (function () {
      try { T.validate(T.create({ claims: [f.claim] })); return true; } catch (e) { return false; }
    })());
  ok(id + '.4 6 条 fixture 总数不变', Object.keys(C.FIXTURE).length === 6);
  ok(id + '.5 Claim 无 confidence、support 带 basis、Evidence 带 trust',
    !Object.prototype.hasOwnProperty.call(f.claim, 'confidence') &&
    f.claim.support[0].basis === 'semantic' &&
    !!f.evidence[0].trust && typeof f.evidence[0].trust.score === 'number');
});

fixtureCase(16, 'C2');
fixtureCase(17, 'C3', function (f, judged, id) {
  ok(id + '.3 numeric PASS 但 semantic 非 PASS',
    judged.dimensions.numeric.status === 'PASS' && judged.dimensions.semantic.status !== 'PASS');
});
fixtureCase(18, 'C4');
fixtureCase(19, 'C5');
fixtureCase(20, 'C6');

/* ============================================================
   例 21：R1 派生（C2 副本，premises 指向失败 claim）
   ============================================================ */
runCase(21, 'R1 派生用例', function () {
  var r = C.R1_DERIVED;
  var judged = C.judgeClaim(r.claim, { claims: r.claims, evidence: r.evidence });
  ok('21.1 最高 PARTIAL', judged.verdict === 'PARTIAL', judged.verdict);
  ok('21.2 触发 R1', judged.rule === 'R1', judged.rule);
  ok('21.3 不新增第 7 条 fixture', Object.keys(C.FIXTURE).length === 6 && r.id === 'R1');
});

/* ============================================================
   例 22/23：Qty 兼容（P0 不改 runtime.js）
   ============================================================ */
runCase(22, 'Qty 缺新字段', function () {
  var q = C.qtyCompat({ value: 43, unit: 'deg' });
  ok('22.1 legacy:true', q.legacy === true);
  ok('22.2 旧字段原值不变', q.value === 43 && q.unit === 'deg');
  ok('22.3 不抛错', q != null);
});

runCase(23, 'Qty 全字段', function () {
  var input = {
    value: 43, unit: 'deg', epoch: 'J2000', frame: 'topocentric',
    inputs: { ra: 5.588 }, uncertainty: 0.3
  };
  var q = C.qtyCompat(input);
  ok('23.1 无 legacy 标记', !Object.prototype.hasOwnProperty.call(q, 'legacy'));
  ok('23.2 旧字段逐字段相等', q.value === 43 && q.unit === 'deg');
  ok('23.3 新字段逐字段相等',
    q.epoch === 'J2000' && q.frame === 'topocentric' &&
    util.isDeepStrictEqual(q.inputs, { ra: 5.588 }) && q.uncertainty === 0.3);
});

/* ============================================================
   例 24：Node 可用性
   ============================================================ */
runCase(24, 'Node 可用', function () {
  ok('24.1 无 window 依赖', typeof window === 'undefined');
  ok('24.2 三个模块单全局出口', typeof T === 'object' && typeof S === 'object' && typeof C === 'object');
  ok('24.3 所需接口齐全',
    typeof T.create === 'function' && typeof T.validate === 'function' &&
    typeof S.validate === 'function' && typeof C.makeClaim === 'function' &&
    typeof C.judgeClaim === 'function' && typeof C.qtyCompat === 'function');
  ok('24.4 未向 Node 全局注入 window', !Object.prototype.hasOwnProperty.call(global, 'window') || typeof window === 'undefined');
});

/* ============================================================
   汇总输出
   ============================================================ */
var pass = results.filter(function (r) { return r.pass; }).length;
var total = results.length;
var casePass = cases.filter(function (c) { return c.failed === 0; }).length;

for (var i = 0; i < results.length; i++) {
  var r = results[i];
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
}
console.log('');
for (var j = 0; j < cases.length; j++) {
  var c = cases[j];
  console.log('CASE ' + c.id + ' ' + (c.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c.title + ' | 断言 ' + c.assertions);
}
console.log('');
console.log('CASES ' + casePass + '/' + cases.length);
console.log('ASSERTIONS ' + pass + '/' + total);
console.log('RESULT ' + pass + '/' + total);

process.exit(pass === total && cases.length === 24 && casePass === 24 ? 0 : 1);
