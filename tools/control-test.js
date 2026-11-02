/* ASTRUM · 控制层测试（B1–B7，纯 Node，零依赖）
 *
 * 覆盖：Router / Planner / TaskState / Scheduler / Runner /
 *       Tool Registry / Compose Adapter / 控制层整链路。
 *
 * 用法：node tools/control-test.js
 */
'use strict';

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
 'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
 'core/claims.js', 'core/fit.js', 'core/agents.js', 'core/sources.js',
 'core/research.js', 'core/solarsystem.js', 'core/simbad.js',
 'core/router.js', 'core/planner.js', 'core/registry.js',
 'core/compose-adapter.js', 'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var S = global.AstroSchema;
var Router = global.AstroRouter;
var Planner = global.AstroPlanner;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var O = global.AstroOrchestrator;
var Control = global.AstroControl;

var results = [];
var cases = [];
var pass = 0;

function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra || '' });
  if (cond) pass++;
}

function equal(name, actual, expected, extra) {
  var same = util.isDeepStrictEqual(actual, expected);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected) + (extra ? ' | ' + extra : '')));
}

function throwsWith(fn, code, part) {
  try { fn(); return null; } catch (e) {
    var codeOk = !code || e.code === code;
    var partOk = !part || String(e.message).indexOf(part) >= 0 || (e.path || '').indexOf(part) >= 0;
    return codeOk && partOk ? e : null;
  }
}

var QUEUE = [];

function queueCase(id, title, fn) {
  QUEUE.push({ id: id, title: title, fn: fn });
}

async function executeCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.message ? e.message : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

function makeCtx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}

var CTX = makeCtx();
var CFG = AC.defaultConfig();

function makeState(plan, level) {
  var s = T.create({ question: 'test', level: level || 'L3' });
  if (plan) {
    s.plan = plan;
    s.steps = plan.steps.map(T.makeStep);
  }
  return s;
}

function fakeRegistry(specs) {
  var r = Registry.create({ agentCore: AC });
  (specs || []).forEach(function (s) {
    r.register(Object.assign({
      version: '1.0.0', caps: ['local'], argsSchema: { type: 'object' },
      timeoutMs: 100, cost: { ms: 0, tokens: 0, searches: 0 },
      permissions: { canProduceNumbers: false },
      idempotent: true, ttlMs: null, deps: [], run: function () { return { ok: true }; }
    }, s));
  });
  return r;
}

function seqOk(state) {
  for (var i = 0; i < state.events.length; i++) {
    if (state.events[i].seq !== i + 1) return false;
  }
  return true;
}

/* ============================================================
   Router（B1）
   ============================================================ */
queueCase('R1', 'Router L1 LEGACY', async function () {
  var r = Control.prepare('你好', CTX, CFG);
  ok('R1.1 小问候走 LEGACY', r.legacy === true && r.plan === null);
  ok('R1.2 终态 DONE', r.state.phase === 'DONE');
  ok('R1.3 intent=smalltalk', r.intent === 'smalltalk');
});

queueCase('R2', 'Router 规划路径', async function () {
  var q = '请综述一下黑洞研究的最新进展';
  var r = Control.prepare(q, CTX, CFG);
  ok('R2.1 进入 Planner', r.legacy === false && !!r.plan, r.route.reason);
  ok('R2.2 mode=research', r.route.mode === 'research', r.route.mode);
  ok('R2.3 complexity>=2', r.route.complexity >= 2, String(r.route.complexity));
});

queueCase('R3', 'Router unknown / 异常输入', async function () {
  var unknown = Control.prepare('zxqvkw 光变曲线原始数据', CTX, CFG);
  ok('R3.1 unknown 走 LEGACY', unknown.legacy === true && unknown.intent === 'unknown');
  var empty = Router.route({ query: '', intent: '', targets: null });
  ok('R3.2 空输入不抛错且 LEGACY', empty.legacy === true && empty.complexity === 1);
  var weird = Router.route({ query: null, intent: null, targets: undefined });
  ok('R3.3 null 输入不抛错', weird && weird.mode === 'single');
});

queueCase('R4', 'Router 复杂度分级', async function () {
  var compare = Router.route({ query: '木星和土星有什么区别', intent: 'observe-target', targets: [{ item: { kind: 'planet', key: 'jupiter', cn: '木星' } }, { item: { kind: 'planet', key: 'saturn', cn: '土星' } }] });
  ok('R4.1 双目标+对比 → L3', compare.level === 'L3' && compare.mode === 'compare', compare.level + '/' + compare.mode);
  var research = Router.route({ query: '黑洞研究的最新进展', intent: 'cosmos', targets: [] });
  ok('R4.2 研究关键词 → research', research.mode === 'research' && research.complexity >= 3);
  var simple = Router.route({ query: 'M42 在哪', intent: 'observe-target', targets: [{ item: { kind: 'dso', key: 'm42', cn: 'M42' }, match: 'm42' }] });
  ok('R4.3 单目标单意图 → L1', simple.level === 'L1' && simple.legacy === true);
});

/* ============================================================
   Planner（B2）
   ============================================================ */
queueCase('P1', 'Planner 7 模板映射', async function () {
  var route = function (mode, legacy) { return { mode: mode, legacy: !!legacy, reason: 'test' }; };
  var target = [{ item: { kind: 'dso', key: 'm42', cn: 'M42' }, match: 'm42' }];
  equal('P1.1 T-A', Planner.chooseTemplate({ query: 'M42 是什么', intent: 'knowledge-target', targets: target, route: route('single') }), 'T-A');
  equal('P1.2 T-B', Planner.chooseTemplate({ query: '今晚看什么', intent: 'tonight', targets: [], route: route('single') }), 'T-B');
  equal('P1.3 T-C', Planner.chooseTemplate({ query: 'M42 怎么拍 为什么', intent: 'photo-target', targets: target, route: route('single') }), 'T-C');
  equal('P1.4 T-D', Planner.chooseTemplate({ query: '对比木星和土星', intent: 'cosmos', targets: target.concat(target), route: route('compare') }), 'T-D');
  equal('P1.5 T-E', Planner.chooseTemplate({ query: '黑洞研究最新进展', intent: 'cosmos', targets: [], route: route('research') }), 'T-E');
  equal('P1.6 T-F', Planner.chooseTemplate({ query: '黑洞研究存在争议', intent: 'cosmos', targets: [], route: route('research') }), 'T-F');
  equal('P1.7 T-G', Planner.chooseTemplate({ query: '太阳系的结构', intent: 'system-view', targets: [], route: route('single') }), 'T-G');
});

queueCase('P2', 'Planner 生成与 Schema 校验', async function () {
  var adapter = Adapter.create({ agentCore: AC });
  var reg = Registry.createDefault({ adapter: adapter, agentCore: AC });
  var ctx = CTX;
  var plans = [
    Planner.buildPlan({ query: 'M42 是什么', ctx: ctx, intent: 'knowledge-target', targets: AC.resolveTargets('M42'), route: { legacy: false, mode: 'single', reason: 't' } }),
    Planner.buildPlan({ query: '今晚看什么', ctx: ctx, intent: 'tonight', targets: [], route: { legacy: false, mode: 'single', reason: 't' } }),
    Planner.buildPlan({ query: 'M42 怎么拍 为什么', ctx: ctx, intent: 'photo-target', targets: AC.resolveTargets('M42'), route: { legacy: false, mode: 'single', reason: 't' } }),
    Planner.buildPlan({ query: '对比木星和土星', ctx: ctx, intent: 'cosmos', targets: AC.resolveTargets('木星和土星'), route: { legacy: false, mode: 'compare', reason: 't' } }),
    Planner.buildPlan({ query: '黑洞研究最新进展', ctx: ctx, intent: 'cosmos', targets: [], route: { legacy: false, mode: 'research', reason: 't' } }),
    Planner.buildPlan({ query: '黑洞研究存在争议', ctx: ctx, intent: 'cosmos', targets: [], route: { legacy: false, mode: 'research', reason: 't' } }),
    Planner.buildPlan({ query: '太阳系的结构', ctx: ctx, intent: 'system-view', targets: [], route: { legacy: false, mode: 'single', reason: 't' } })
  ];
  ok('P2.1 7 个模板均生成 Plan', plans.every(function (p) { return !!p; }));
  var valid = plans.map(function (p) { return Planner.validate(p, { registry: reg }).ok; });
  ok('P2.2 7 个 Plan 全部通过 Schema/工具/依赖校验', valid.every(Boolean), JSON.stringify(valid));
  ok('P2.3 每个步骤有唯一 stepId', plans.every(function (p) {
    var ids = p.steps.map(function (s) { return s.id; });
    return ids.length === new Set(ids).size;
  }));
  ok('P2.4 L1 不生成 Plan', Planner.plan({ query: '你好', intent: 'smalltalk', targets: [], route: { legacy: true, mode: 'single', reason: 'L1' } }) === null);
});

queueCase('P3', 'Planner 非法 Plan 拒绝', async function () {
  var base = {
    template: 'T-A',
    steps: [
      { id: 't1', tool: 'kb.lookup', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
      { id: 't2', tool: 'kepler.ephemeris', args: { target: 'M42', jd: 2461342.5, place: { lat: 39.9, lon: 116.4 } }, deps: [], parallel: true, critical: false, optional: false },
      { id: 't3', tool: 'compose.target', args: { query: 'M42' }, deps: ['t1', 't2'], parallel: false, critical: true, optional: false }
    ]
  };
  var badTemplate = JSON.parse(JSON.stringify(base)); badTemplate.template = 'T-X';
  ok('P3.1 未知模板拒绝', throwsWith(function () { Planner.assertValid(badTemplate); }, 'E_PLAN_INVALID', 'template') !== null);
  var cycle = JSON.parse(JSON.stringify(base));
  cycle.steps[0].deps = ['t3'];
  ok('P3.2 依赖环拒绝', throwsWith(function () { Planner.assertValid(cycle); }, 'E_PLAN_INVALID', '环比') !== null || throwsWith(function () { Planner.assertValid(cycle); }, 'E_PLAN_INVALID', '环') !== null);
  var missingCompose = { template: 'T-A', steps: [base.steps[0]] };
  ok('P3.3 缺 compose 拒绝', throwWith(function () { Planner.assertValid(missingCompose); }, 'E_PLAN_INVALID', 'compose') !== null);
  var parallelCompose = JSON.parse(JSON.stringify(base));
  parallelCompose.steps[2].parallel = true;
  ok('P3.4 compose 并行拒绝', throwsPlanner(parallelCompose, '并行') !== null);
  var illegalTool = JSON.parse(JSON.stringify(base));
  illegalTool.steps[0].tool = 'evidence.search';
  ok('P3.5 模板外工具拒绝', throwsPlanner(illegalTool, '模板') !== null);
  var noCritical = JSON.parse(JSON.stringify(base));
  noCritical.steps.forEach(function (s) { s.critical = false; });
  ok('P3.6 无 critical 拒绝', throwsPlanner(noCritical, 'critical') !== null);
  var futureDep = JSON.parse(JSON.stringify(base));
  futureDep.steps[0].deps = ['t3'];
  ok('P3.7 依赖未来步骤拒绝', throwsPlanner(futureDep, '依赖') !== null);
});

function throwWith(fn, code, part) {
  try { fn(); return null; } catch (e) {
    return (!code || e.code === code) && (!part || String(e.message).indexOf(part) >= 0) ? e : null;
  }
}
function throwsPlanner(plan, part) {
  return throwWith(function () { Planner.assertValid(plan); }, 'E_PLAN_INVALID', part);
}

/* ============================================================
   TaskState（B3）
   ============================================================ */
queueCase('T1', 'TaskState 初始化与合法转换', async function () {
  var r = Control.prepare('请综述一下黑洞研究的最新进展', CTX, CFG);
  ok('T1.1 PLAN 阶段', r.state.phase === 'PLAN');
  ok('T1.2 steps 全部 pending', r.state.steps.length === r.plan.steps.length && r.state.steps.every(function (s) { return s.status === 'pending'; }));
  ok('T1.3 plan 已写入 state', r.state.plan && r.state.plan.template === 'T-E');
  ok('T1.4 phase.changed 事件 seq 1..3', r.state.events.length === 3 && seqOk(r.state));
  var err = throwsWith(function () { T.transition(r.state, 'PROGRESS'); }, 'E_INVALID_TRANSITION', 'PLAN');
  ok('T1.5 PLAN→PROGRESS 非法转换被拒', !!err);
});

queueCase('T2', 'TaskState Step/Event 更新', async function () {
  var plan = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.echo', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var state = makeState(plan);
  var reg = fakeRegistry([{ id: 'fake.echo', run: function () { return { value: 42 }; } }]);
  var r = await O.Runner.executeOne(plan.steps[0], state, { registry: reg, ctx: CTX });
  ok('T2.1 step ok', state.steps[0].status === 'ok');
  ok('T2.2 attempt=1 且 outputHash 非空', state.steps[0].attempt === 1 && !!state.steps[0].outputHash);
  ok('T2.3 Event 为 step.started + step.ok', state.events.length === 2 && state.events[0].type === 'step.started' && state.events[1].type === 'step.ok');
  ok('T2.4 seq 单调', seqOk(state));
});

/* ============================================================
   Scheduler（B4）
   ============================================================ */
queueCase('S1', 'Scheduler 顺序依赖', async function () {
  var plan = { template: 'T-A', steps: [
    { id: 't1', tool: 'kb.lookup', args: {}, deps: [], parallel: true, critical: false, optional: false },
    { id: 't2', tool: 'compose.target', args: {}, deps: ['t1'], parallel: false, critical: true, optional: false }
  ] };
  var s = makeState(plan);
  var ready = O.Scheduler.readySteps(plan, s);
  ok('S1.1 初始仅 t1 就绪', ready.length === 1 && ready[0].id === 't1');
  s.steps[0].status = 'ok';
  var ready2 = O.Scheduler.readySteps(plan, s);
  ok('S1.2 t1 完成后 t2 就绪且 t1 不重复', ready2.length === 1 && ready2[0].id === 't2');
  s.steps[0].status = 'failed';
  ok('S1.3 依赖失败 → t2 blocked', O.Scheduler.blockedSteps(plan, s).some(function (x) { return x.id === 't2'; }));
});

queueCase('S2', 'Scheduler 并行取数与 compose 串行', async function () {
  var plan = { template: 'T-C', steps: [
    { id: 't1', tool: 'kepler.ephemeris', args: {}, deps: [], parallel: true, critical: false, optional: false },
    { id: 't2', tool: 'kb.lookup', args: {}, deps: [], parallel: true, critical: false, optional: false },
    { id: 't3', tool: 'compose.target', args: {}, deps: ['t1', 't2'], parallel: false, critical: true, optional: false }
  ] };
  var s = makeState(plan);
  var b1 = O.Scheduler.nextBatch(plan, s, 4);
  ok('S2.1 两个取数步骤同批并行', b1.parallel === true && b1.steps.length === 2 && b1.steps.every(function (x) { return x.tool !== 'compose.target'; }));
  s.steps[0].status = 'ok'; s.steps[1].status = 'ok';
  var b2 = O.Scheduler.nextBatch(plan, s, 4);
  ok('S2.2 compose 单独成批且不并行', b2.parallel === false && b2.steps.length === 1 && b2.steps[0].tool === 'compose.target');
});

queueCase('S3', 'Scheduler 已完成不重复', async function () {
  var plan = { template: 'T-B', steps: [
    { id: 't1', tool: 'kepler.visibility', args: {}, deps: [], parallel: false, critical: true, optional: false },
    { id: 't2', tool: 'compose.simple', args: {}, deps: ['t1'], parallel: false, critical: true, optional: false }
  ] };
  var s = makeState(plan);
  s.steps[0].status = 'ok'; s.steps[1].status = 'ok';
  ok('S3.1 全部完成后无下一批', O.Scheduler.nextBatch(plan, s, 4) === null);
  ok('S3.2 allSettled=true', O.Scheduler.allSettled(plan, s) === true);
});

/* ============================================================
   Runner（B5）
   ============================================================ */
queueCase('X1', 'Runner 正常/异常/超时', async function () {
  var plan = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.ok', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var state = makeState(plan);
  var reg = fakeRegistry([
    { id: 'fake.ok', run: function () { return { ok: true, n: 1 }; } }
  ]);
  var r = await O.Runner.executeOne(plan.steps[0], state, { registry: reg, ctx: CTX });
  ok('X1.1 正常工具返回 ok', r.ok === true && state.steps[0].status === 'ok');
  var missing = { template: 'T-A', steps: [{ id: 't1', tool: 'no.such', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var st2 = makeState(missing);
  var r2 = await O.Runner.executeOne(missing.steps[0], st2, { registry: fakeRegistry([]), ctx: CTX });
  ok('X1.2 工具不存在 → failed/tool_missing', r2.ok === false && st2.steps[0].status === 'failed' && st2.steps[0].error.kind === 'tool_missing');
  var boom = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.boom', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var st3 = makeState(boom);
  var reg3 = fakeRegistry([{ id: 'fake.boom', run: function () { throw new Error('boom'); } }]);
  var r3 = await O.Runner.executeOne(boom.steps[0], st3, { registry: reg3, ctx: CTX });
  ok('X1.3 异常 → failed 且不崩溃', r3.ok === false && st3.steps[0].status === 'failed');
  var slow = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.slow', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var st4 = makeState(slow);
  var reg4 = fakeRegistry([{ id: 'fake.slow', timeoutMs: 50, run: function () { return new Promise(function () {}); } }]);
  var r4 = await O.Runner.executeOne(slow.steps[0], st4, { registry: reg4, ctx: CTX });
  ok('X1.4 timeout → failed', r4.ok === false && st4.steps[0].error.kind === 'timeout', st4.steps[0].error && st4.steps[0].error.kind);
});

queueCase('X2', 'Runner 参数校验', async function () {
  var reg = Registry.createDefault({ adapter: Adapter.create({ agentCore: AC }), agentCore: AC });
  var bad = reg.validateArgs('kepler.ephemeris', { target: 'M42', jd: 'x', place: { lat: 39.9 } });
  ok('X2.1 缺 lon/类型错 → ok:false', bad.ok === false && bad.errors.length >= 2);
  var good = reg.validateArgs('kepler.ephemeris', { target: 'M42', jd: 2461342.5, place: { lat: 39.9, lon: 116.4 } });
  ok('X2.2 合法参数通过', good.ok === true && good.errors.length === 0);

  var plan = { template: 'T-A', steps: [{ id: 't1', tool: 'kepler.ephemeris', args: { target: 'M42', jd: 'x', place: { lat: 39.9 } }, deps: [], parallel: false, critical: true, optional: false }] };
  var st = makeState(plan);
  var r = await O.Runner.executeOne(plan.steps[0], st, { registry: reg, ctx: CTX });
  ok('X2.3 参数非法在 Runner 层拒绝', r.ok === false && st.steps[0].status === 'failed' && st.steps[0].error.kind === 'args_invalid');

  var depPlan = { template: 'T-A', steps: [{ id: 't1', tool: 'fake.dep', args: {}, deps: [], parallel: false, critical: true, optional: false }] };
  var st2 = makeState(depPlan);
  var depReg = fakeRegistry([{ id: 'fake.dep', deps: ['no_such_global'], run: function () { return { ok: true }; } }]);
  var r2 = await O.Runner.executeOne(depPlan.steps[0], st2, { registry: depReg, ctx: CTX });
  ok('X2.4 依赖缺失在 Runner 层拒绝', r2.ok === false && st2.steps[0].status === 'failed' && st2.steps[0].error.kind === 'deps_missing');
});

/* ============================================================
   Tool Registry（B6）
   ============================================================ */
queueCase('G1', 'Registry 注册/查找/重复', async function () {
  var reg = Registry.createDefault({ adapter: Adapter.create({ agentCore: AC }), agentCore: AC });
  ok('G1.1 12 项工具基线', reg.list().length === 12, String(reg.list().length));
  ok('G1.2 按 id 查找', reg.get('kepler.ephemeris').id === 'kepler.ephemeris');
  ok('G1.3 不存在返回 null', reg.get('no.such') === null);
  var dup = throwsWith(function () { reg.register(Registry.SPECS[0]); }, 'E_TOOL_DUPLICATE', '重复');
  ok('G1.4 重复注册抛错', !!dup);
  var missing = reg.validateArgs('no.such', {});
  ok('G1.5 未注册工具返回明确错误', missing.ok === false && missing.errors[0].reason.indexOf('未注册') >= 0);
});

queueCase('G2', 'Registry 依赖检查', async function () {
  var reg = Registry.create();
  reg.register({
    id: 'fake.dep', version: '1.0.0', caps: ['local'], argsSchema: { type: 'object' },
    timeoutMs: 100, cost: { ms: 0, tokens: 0, searches: 0 },
    permissions: {}, idempotent: true, ttlMs: null,
    deps: ['no_such_global'], run: function () { return { ok: true }; }
  });
  var r = reg.checkDeps('fake.dep');
  ok('G2.1 缺失依赖被识别', r.ok === false && r.reason.indexOf('no_such_global') >= 0, r.reason);
  var good = Registry.createDefault({ adapter: Adapter.create({ agentCore: AC }), agentCore: AC }).checkDeps('compose.target');
  ok('G2.2 已加载依赖通过', good.ok === true, good.reason || '');
});

/* ============================================================
   Compose Adapter（B7）
   ============================================================ */
queueCase('A1', 'Adapter 旧业务兼容', async function () {
  var adapter = Adapter.create({ agentCore: AC });
  ['你好', '什么是黑洞？', 'M42 今晚在北京能看到吗'].forEach(function (q, i) {
    var old = AC.buildAnswer(q, CTX, CFG);
    var via = adapter.deliver(q, CTX, CFG);
    equal('A1.' + (i + 1) + ' sections 与旧 buildAnswer 一致', via.sections, old.sections);
  });
  var c = adapter.compose({ query: '什么是黑洞？' }, CTX, CFG);
  ok('A1.4 compose 返回 ok + answer', c.ok === true && !!c.answer);
  var v = adapter.view(c.answer);
  ok('A1.5 view 保持 sections/trace/meta', util.isArray(v.sections) && util.isArray(v.trace) && typeof v.meta === 'object');
  ok('A1.6 answer 未挂载 TaskState', !Object.prototype.hasOwnProperty.call(c.answer, 'taskState') && !Object.prototype.hasOwnProperty.call(c.answer, 'task'));
});

/* ============================================================
   控制层整链路
   ============================================================ */
queueCase('C1', '控制层 L1 与规划链路', async function () {
  var l1 = await Control.run('你好', CTX, CFG);
  ok('C1.1 L1 answer 存在且 legacy=true', l1.legacy === true && !!l1.answer);
  ok('C1.2 L1 状态 DONE', l1.state.phase === 'DONE');
  equal('C1.3 L1 sections 与旧 buildAnswer 一致', l1.answer.sections, AC.buildAnswer('你好', CTX, CFG).sections);

  var planRun = await Control.run('请综述一下黑洞研究的最新进展', CTX, CFG);
  ok('C1.4 规划任务进入 T-E', planRun.plan && planRun.plan.template === 'T-E');
  ok('C1.5 步骤全部 ok', planRun.state.steps.every(function (s) { return s.status === 'ok'; }), planRun.state.steps.map(function (s) { return s.status; }).join(','));
  ok('C1.6 终态 DONE/PARTIAL', planRun.state.phase === 'DONE' || planRun.state.phase === 'PARTIAL', planRun.state.phase);
  ok('C1.7 Event seq 单调', seqOk(planRun.state));
  ok('C1.8 answer 未挂载 TaskState', !Object.prototype.hasOwnProperty.call(planRun.answer, 'taskState') && !Object.prototype.hasOwnProperty.call(planRun.answer, 'task'));
});

queueCase('C2', '控制层失败链路', async function () {
  var badAdapter = { compose: function () { return { ok: false, reason: 'no_compose' }; }, deliver: function () { throw new Error('no_deliver'); } };
  var reg = Registry.createDefault({ adapter: badAdapter, agentCore: AC });
  var r = await Control.run('M42 和 M31 有什么区别？', CTX, CFG, { adapter: badAdapter, registry: reg });
  ok('C2.1 无答案 → FAILED', r.state.phase === 'FAILED' && r.answer === null, r.state.phase);
  ok('C2.2 verdict=FAIL', r.verdict === 'FAIL');
});

queueCase('C3', '旧契约与 Agent 名册', async function () {
  ok('C3.1 13 Agent 名册不变', AC.AGENTS.length === 13, String(AC.AGENTS.length));
  var r = await Control.run('M42 和 M31 有什么区别？', CTX, CFG);
  var answer = r.answer;
  ok('C3.2 answer 保留旧契约核心键', ['query', 'intent', 'ctx', 'targets', 'trace', 'sections', 'meta'].every(function (k) {
    return Object.prototype.hasOwnProperty.call(answer, k);
  }));
  ok('C3.3 TaskState 不在 sections/trace/meta',
    JSON.stringify(answer.sections).indexOf('taskState') < 0 &&
    JSON.stringify(answer.trace).indexOf('taskState') < 0 &&
    JSON.stringify(answer.meta).indexOf('taskState') < 0);
});

queueCase('C4', '无 compose 模板由 Adapter 统一交付', async function () {
  var td = await Control.run('对比木星和土星的视场', CTX, CFG);
  ok('C4.1 T-D 正常生成', td.plan && td.plan.template === 'T-D', td.plan && td.plan.template);
  ok('C4.2 T-D 无 compose 步骤但 answer 存在', td.answer && td.plan.steps.every(function (s) { return s.tool.indexOf('compose.') !== 0; }));
  ok('C4.3 T-D 终态 DONE/PARTIAL', td.state.phase === 'DONE' || td.state.phase === 'PARTIAL', td.state.phase);

  var tf = await Control.run('黑洞研究存在争议', CTX, CFG);
  ok('C4.4 T-F 正常生成', tf.plan && tf.plan.template === 'T-F', tf.plan && tf.plan.template);
  ok('C4.5 T-F 无 compose 步骤但 answer 存在', tf.answer && tf.plan.steps.every(function (s) { return s.tool.indexOf('compose.') !== 0; }));
  ok('C4.6 T-F 终态 DONE/PARTIAL', tf.state.phase === 'DONE' || tf.state.phase === 'PARTIAL', tf.state.phase);
});

/* ---------- 输出 ---------- */
(async function main() {
  for (var i = 0; i < QUEUE.length; i++) {
    await executeCase(QUEUE[i].id, QUEUE[i].title, QUEUE[i].fn);
  }
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
  process.exit(pass === results.length && cases.length > 0 ? 0 : 1);
})();
