/* ASTRUM · V1.5 Research Loop Claims / Reducer 集成测试（Gate 1）
 *
 * 覆盖：8 个 gapCode、Claims 支持缺口、来源独立性、Reducer 关键冲突、
 *       冲突消失/未知、重复缺口、追加步骤真实执行、预算单次扣减、
 *       取消/恢复、持久化与事件契约。
 *
 * 用法：node tools/v1-5-research-loop-claims-test.js
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
  'core/router.js', 'core/evaluator.js', 'core/planner.js',
  'core/reducer.js', 'core/report.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var T = global.AstroTask;
var E = global.AstroEvidence;
var C = global.AstroClaims;
var R = global.AstroReducer;
var Ev = global.AstroEvaluator;
var Planner = global.AstroPlanner;
var Control = global.AstroControl;
var AC = global.AgentCore;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : extra }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 300)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

var CTX = { y: 2026, mo: 11, d: 1, h: 21, mi: 0, tz: 8, city: '北京', lat: 39.9, lon: 116.4, bortle: 5 };
var CFG = AC.defaultConfig();

function tePlan() {
  return { template: 'T-E', steps: [
    { id: 't1', tool: 'simbad.tap', args: { query: 'M42' }, deps: [], parallel: false, critical: true, optional: false },
    { id: 't2', tool: 'paper.search', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
    { id: 't3', tool: 'evidence.search', args: { query: 'M42' }, deps: [], parallel: true, critical: false, optional: false },
    { id: 'c1', tool: 'compose.domain', args: { query: 'M42', from: ['t1', 't2', 't3'] }, deps: ['t1', 't2', 't3'], parallel: false, critical: true, optional: false }
  ] };
}
function tfPlan() {
  return { template: 'T-F', steps: [
    { id: 't1', tool: 'simbad.tap', args: { query: 'M42' }, deps: [], parallel: false, critical: true, optional: false },
    { id: 't2', tool: 'evidence.search', args: { query: 'M42', direction: 'positive' }, deps: [], parallel: true, critical: false, optional: false },
    { id: 't3', tool: 'evidence.search', args: { query: 'M42', direction: 'negative' }, deps: [], parallel: true, critical: false, optional: false }
  ] };
}
function stateFor(plan, used, limit) {
  var s = T.create({ question: 'research loop claims', level: 'L4' });
  s.plan = plan;
  s.steps = plan.steps.map(T.makeStep);
  s.steps.forEach(function (x) { x.status = 'ok'; });
  if (used) Object.keys(used).forEach(function (k) { s.budget.used[k] = used[k]; });
  if (limit) Object.keys(limit).forEach(function (k) { s.budget.limit[k] = limit[k]; });
  return s;
}
function evidence(id, sourceId, opts) {
  return E.make({
    evidenceId: id, sourceId: sourceId, sourceType: (opts && opts.type) || 'database',
    title: id, uri: 'https://' + sourceId + '/' + id,
    content: {}, trust: { level: 'high', score: 0.9, basis: 'test' }, provenance: {}
  });
}
function claim(id, eids, opts) {
  opts = opts || {};
  return C.makeClaim({
    id: id,
    text: opts.text || ('M42 距离测量 ' + id),
    type: opts.type || 'qualitative',
    entities: opts.entities || ['M42'],
    numbers: opts.numbers || [],
    premises: [],
    support: (eids || []).map(function (eid) {
      return { eid: eid, strength: opts.strength || 'strong', basis: opts.basis || 'semantic' };
    }),
    contradict: opts.contradict || [],
    uncertainty: opts.uncertainty || null,
    source: 'kb',
    calc: null,
    required: opts.required !== false
  });
}
function researchOf(evidenceList, claims) {
  var judged = C.judgeAll(claims || [], { evidence: evidenceList || [] });
  var reduced = R.reduce({ evidence: evidenceList || [], claims: judged.claims, verdicts: judged.verdicts });
  return { evidence: reduced.evidence, claims: reduced.claims, verdicts: judged.verdicts, reducer: reduced };
}
function decide(state, plan, research) {
  return Ev.decide({ state: state, plan: plan, research: research || null, opts: { query: 'M42', maxAppends: 2 } });
}
function hasGap(d, code) { return (d.gaps || []).indexOf(code) >= 0; }
function freshPlan() { return JSON.parse(JSON.stringify(tePlan())); }
function values(a, b) {
  return [
    claim('c_a', ['e1', 'e2'], { type: 'quantitative', numbers: [{ value: a, unit: 'ly' }], uncertainty: { kind: 'measurement', value: 40, basis: 'x' } }),
    claim('c_b', ['e1', 'e2'], { type: 'quantitative', numbers: [{ value: b, unit: 'ly' }], uncertainty: { kind: 'measurement', value: 60, basis: 'y' } })
  ];
}

(async function main() {
  /* ---------------- E5 Claims ---------------- */
  await runCase('E5', 'Claims 缺口', async function () {
    var evs = [evidence('e1', 'src_a'), evidence('e2', 'src_b')];
    var d1 = decide(stateFor(tePlan()), freshPlan(), researchOf(evs, []));
    ok('E5.1 有 Evidence 无 Claims → 不追加', d1.action === 'stop' && d1.gaps.length === 0, d1.action + '/' + d1.reason);

    var d2 = decide(stateFor(tePlan()), freshPlan(), researchOf(evs, [claim('c1', [])]));
    ok('E5.2 关键 Claim 无支持 → append', d2.action === 'append' && hasGap(d2, 'critical_claim_without_support'), d2.reason);

    var same = [evidence('e1', 'src_same'), evidence('e2', 'src_same')];
    var d3 = decide(stateFor(tePlan()), freshPlan(), researchOf(same, [claim('c2', ['e1', 'e2'])]));
    ok('E5.3 同一 sourceId 两条 → 单一来源', d3.action === 'append' && hasGap(d3, 'critical_claim_single_source'), d3.reason);

    var indep = [evidence('e1', 'src_a'), evidence('e2', 'src_b')];
    var d4 = decide(stateFor(tePlan()), freshPlan(), researchOf(indep, [claim('c3', ['e1', 'e2'])]));
    ok('E5.4 两个独立来源 → 不追加', d4.action === 'stop' && d4.gaps.length === 0, d4.action + '/' + d4.reason);

    var d5 = decide(stateFor(tePlan()), freshPlan(), researchOf(indep, [claim('c4', [], { required: false })]));
    ok('E5.5 非关键 Claim 缺口 → 不追加', d5.action === 'stop' && !hasGap(d5, 'critical_claim_without_support'), d5.action);

    var weak = decide(stateFor(tePlan()), freshPlan(), researchOf(indep, [claim('c5', ['e1', 'e2'], { strength: 'weak' })]));
    ok('E5.6 关键 Claim 支持较弱 → append', weak.action === 'append' && hasGap(weak, 'critical_claim_weak_support'), weak.reason);

    var one = [evidence('e1', 'src_a')];
    var first = decide(stateFor(tePlan()), freshPlan(), researchOf(one, [claim('c6', ['e1'])]));
    var second = decide(stateFor(tePlan()), freshPlan(), researchOf(indep, [claim('c7', ['e1', 'e2'])]));
    ok('E5.7 新 Evidence 到达后缺口消失', first.action === 'append' && second.action === 'stop',
      first.action + '→' + second.action);
  });

  /* ---------------- E6 Reducer 冲突 ---------------- */
  await runCase('E6', 'Reducer 冲突', async function () {
    var evs = [evidence('e1', 'src_a'), evidence('e2', 'src_b')];
    var noConflict = researchOf(evs, values(1344, 1344));
    var d1 = decide(stateFor(tePlan()), freshPlan(), noConflict);
    ok('E6.1 无冲突 → 不追加', d1.action === 'stop' && d1.counts.conflicts === 0, d1.action + '/' + d1.reason);

    var nonCrit = researchOf(evs, [
      claim('c_low_a', ['e1', 'e2'], { required: false, type: 'quantitative', numbers: [{ value: 10, unit: 'ly' }], uncertainty: { kind: 'measurement', value: 1, basis: 'x' } }),
      claim('c_low_b', ['e1', 'e2'], { required: false, type: 'quantitative', numbers: [{ value: 20, unit: 'ly' }], uncertainty: { kind: 'measurement', value: 1, basis: 'y' } })
    ]);
    var d2 = decide(stateFor(tePlan()), freshPlan(), nonCrit);
    ok('E6.2 非关键冲突 → 记录但不追加', d2.action === 'stop' && hasGap(d2, 'noncritical_conflict'), d2.action + '/' + d2.gaps.join(','));

    var crit = researchOf(evs, values(1344, 1600));
    var d3 = decide(stateFor(tePlan()), freshPlan(), crit);
    ok('E6.3 关键冲突 → append', d3.action === 'append' && hasGap(d3, 'critical_conflict'),
      d3.reason + ' conflicts=' + d3.counts.conflicts);

    var p4 = freshPlan();
    p4.expansion = { conflictKeys: ['conflict:M42 (ly)|ly'], appendedKeys: [], basis: [], rounds: 1 };
    var resolvedResearch = researchOf(evs, [claim('c_only', ['e1', 'e2'], {
      type: 'quantitative', numbers: [{ value: 1344, unit: 'ly' }],
      uncertainty: { kind: 'measurement', value: 40, basis: 'x' }
    })]);
    var d4 = decide(stateFor(tePlan()), p4, resolvedResearch);
    ok('E6.4 冲突消失且范围可比 → resolved', d4.action === 'stop' &&
      (d4.resolved || []).indexOf('conflict:M42 (ly)|ly') >= 0, d4.action + '/' + (d4.resolved || []).join(','));

    var p5 = freshPlan();
    p5.expansion = { appendedKeys: ['conflict:M42 (ly)|ly'], conflictKeys: ['conflict:M42 (ly)|ly'], basis: [], rounds: 1 };
    var d5 = decide(stateFor(tePlan()), p5, crit);
    ok('E6.5 冲突仍在但已追加过 → 不重复', d5.action === 'stop' && d5.reason === 'duplicate_search', d5.action + '/' + d5.reason);

    var p6 = freshPlan();
    p6.expansion = { conflictKeys: [], appendedKeys: [], basis: [], rounds: 0 };
    var ex = Planner.expand(p6, {
      gaps: d3.gaps, basis: [d3.append], direction: d3.direction,
      conflictKeys: Ev.conflictKeysFrom(d3)
    }, { registry: global.AstroRegistry.createDefault({ agentCore: AC, network: false }), budget: stateFor(tePlan()).budget, query: 'M42' });
    ok('E6.6 冲突追加可追溯', !!ex && ex.expansion.basis[0].code === 'critical_conflict' &&
      ex.expansion.appendedKeys.indexOf(d3.append.key) >= 0,
      ex ? ex.expansion.appendedKeys.join(',') : 'null');
    var d6 = decide(stateFor(ex), ex, crit);
    ok('E6.7 同一冲突第二轮不重复追加', d6.action === 'stop', d6.action + '/' + d6.reason);
  });

  /* ---------------- E7 Evidence 独立性 ---------------- */
  await runCase('E7', 'Evidence 独立性', async function () {
    var d1 = decide(stateFor(tePlan()), freshPlan(), researchOf([], []));
    ok('E7.1 Evidence 缺失 → append', d1.action === 'append' && hasGap(d1, 'no_evidence'), d1.reason);

    var dup = researchOf([evidence('e1', 'src_same'), evidence('e2', 'src_same')], [claim('c1', ['e1', 'e2'])]);
    ok('E7.2 重复来源不算独立', dup.reducer.sources.length === 1, String(dup.reducer.sources.length));

    var indep = researchOf([evidence('e1', 'src_a'), evidence('e2', 'src_b')], [claim('c2', ['e1', 'e2'])]);
    ok('E7.3 独立来源被识别', indep.reducer.sources.length === 2, String(indep.reducer.sources.length));

    var d4 = decide(stateFor(tePlan()), freshPlan(), indep);
    ok('E7.4 已覆盖研究问题 → 不追加', d4.action === 'stop' && d4.counts.independentSources === 2,
      d4.action + '/' + d4.counts.independentSources);

    var d5 = decide(stateFor(tePlan()), freshPlan(), researchOf([evidence('e1', 'src_a')], [claim('c3', ['e1'])]));
    ok('E7.5 单一来源触发缺口', d5.action === 'append' && hasGap(d5, 'critical_claim_single_source'), d5.reason);
  });

  /* ---------------- E8 Control 真实集成 ---------------- */
  await runCase('E8', 'Control 真实追加与执行', async function () {
    var store = global.AstroTaskStore.create({});
    var r = await Control.run('研究 M42 的距离测量、近五年论文与观测数据', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0, store: store
    });
    var xSteps = r.state.steps.filter(function (s) { return /^x/.test(s.id); });
    ok('E8.1 追加步骤进入真实 Runner', xSteps.length >= 1, 'n=' + xSteps.length);
    ok('E8.2 追加搜索真实执行 ok', xSteps.length >= 1 && xSteps[0].status === 'ok', xSteps.length ? xSteps[0].status : 'none');
    ok('E8.3 搜索结果进入 StepResult', xSteps.length >= 1 && xSteps[0].result &&
      Array.isArray(xSteps[0].result.items) && Array.isArray(xSteps[0].result.evidenceIds),
      xSteps.length ? JSON.stringify({ items: (xSteps[0].result || {}).items && xSteps[0].result.items.length, ids: (xSteps[0].result || {}).evidenceIds && xSteps[0].result.evidenceIds.length }) : 'none');
    ok('E8.4 searches 只扣一次（2+1=3）', r.state.budget.used.searches === 3, String(r.state.budget.used.searches));
    ok('E8.5 appends 只扣一次', r.state.budget.used.appends === 1, String(r.state.budget.used.appends));
    var ids = {};
    ok('E8.6 旧步骤保留且唯一', r.state.steps.every(function (s) { var dup = !!ids[s.id]; ids[s.id] = 1; return !dup; }),
      'n=' + r.state.steps.length);
    ok('E8.7 追加依据可追溯', r.plan.expansion && Array.isArray(r.plan.expansion.basis) &&
      r.plan.expansion.basis.length >= 1 && r.plan.expansion.basis[0].code,
      r.plan.expansion ? r.plan.expansion.basis.map(function (b) { return b.code; }).join(',') : 'none');
    ok('E8.8 同一缺口不重复追加', r.plan.expansion && r.plan.expansion.appendedKeys.length === 1 &&
      xSteps.length === 1, r.plan.expansion ? r.plan.expansion.appendedKeys.length + '/' + xSteps.length : 'none');
    ok('E8.9 停止后进入正常结果流程', r.answer != null && (r.verdict === 'PASS' || r.verdict === 'PARTIAL'), r.verdict);
  });

  await runCase('E8b', 'T-F / 非研究模板 / 取消', async function () {
    var r = await Control.run('关于 M42 距离测量存在争议的不同观点', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0
    });
    var xs = r.state.steps.filter(function (s) { return /^x/.test(s.id); });
    ok('E8b.1 T-F 可进入且无异常', r.plan && r.plan.template === 'T-F' &&
      xs.every(function (s) { return s.status === 'ok' || s.status === 'skipped'; }) &&
      T.validate(r.state) === true, r.plan && r.plan.template);

    var a = await Control.run('M42 是什么', CTX, CFG, { network: false, researchLoop: true, maxReplans: 0 });
    var evs = (a.state.events || []).filter(function (e) { return e.type === 'plan.expanded'; });
    ok('E8b.2 非研究模板不追加', evs.length === 0, 'expanded=' + evs.length);

    var ac = new AbortController();
    ac.abort();
    var c = await Control.run('研究 M42 的最新论文', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0, signal: ac.signal
    });
    var ce = (c.state.events || []).filter(function (e) { return e.type === 'plan.expanded'; });
    ok('E8b.3 取消后不追加', c.cancelled === true && ce.length === 0, c.verdict + '/expanded=' + ce.length);
  });

  await runCase('E8c', 'Stub 检索 → 真实 Claims 接入', async function () {
    var sim = E.fromSimbad({ id: 'M42', ra: 83.82208, dec: -5.39111, otype: 'Cl*,OpC', plx: 1.2 }, { query: 'M42' });
    var paper = E.fromSourceItem({
      url: 'https://arxiv.org/abs/2401.00001', title: 'M42 distance measurement',
      sourceType: 'paper', excerpt: 'We measure the distance to M42 with Gaia parallaxes.', doi: '10.48550/arXiv.2401.00001'
    }, { tool: 'paper.search', query: 'M42' });
    var base = global.AstroRegistry.createDefault({
      agentCore: AC, network: false,
      adapter: global.AstroComposeAdapter.create({ agentCore: AC })
    });
    function stubRun(items) {
      return function () {
        return Promise.resolve({
          ok: true, items: items.slice(), evidenceIds: items.map(function (x) { return x.evidenceId; }),
          provenance: { tool: 'stub', retrievedAt: new Date().toISOString() }
        });
      };
    }
    var reg = {
      register: base.register, has: base.has, list: base.list,
      validateArgs: base.validateArgs, checkDeps: base.checkDeps, setRuntime: base.setRuntime,
      get: function (id) {
        var spec = base.get(id);
        if (!spec) return null;
        if (id === 'simbad.tap') return Object.assign({}, spec, { run: stubRun([sim]) });
        if (id === 'paper.search') return Object.assign({}, spec, { run: stubRun([paper]) });
        if (id === 'evidence.search') return Object.assign({}, spec, { run: stubRun([paper]) });
        return spec;
      }
    };
    var r = await Control.run('研究 M42 的距离测量、近五年论文与观测数据', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0, registry: reg
    });
    var xs = r.state.steps.filter(function (s) { return /^x/.test(s.id); });
    ok('E8c.1 Control 挂载 answer.research', !!r.answer && !!r.answer.research &&
      Array.isArray(r.answer.research.claims), r.answer && r.answer.research ? r.answer.research.claims.length : 'none');
    ok('E8c.2 追加依据来自关键 Claim 单一来源', r.plan.expansion && r.plan.expansion.basis.length >= 1 &&
      r.plan.expansion.basis[0].code === 'critical_claim_single_source',
      (r.plan.expansion ? r.plan.expansion.basis.map(function (b) { return b.code; }).join(',') : 'none') +
      ' | decided=' + r.state.events.filter(function (e) { return e.type === 'progress.decided'; })
        .map(function (e) { return e.payload.reason; }).join(';') +
      ' | used=' + JSON.stringify(r.state.budget.used) + '/' + JSON.stringify(r.state.budget.limit));
    ok('E8c.3 追加步骤真实执行', xs.length === 1 && xs[0].status === 'ok', xs.length ? xs[0].status : 'none');
    ok('E8c.4 追加检索式针对该 Claim', xs.length === 1 && /独立验证/.test(String(xs[0].args && xs[0].args.query || '')),
      xs.length ? xs[0].args.query : 'none');
    ok('E8c.5 Claims 覆盖删除了旧答案契约差异', r.answer && Array.isArray(r.answer.sections), 'sections');
  });

  /* ---------------- E9 持久化 / 事件 ---------------- */
  await runCase('E9', '持久化与事件契约', async function () {
    var store = global.AstroTaskStore.create({});
    var r = await Control.run('研究 M42 的距离测量、近五年论文与观测数据', CTX, CFG, {
      network: false, researchLoop: true, maxReplans: 0, store: store
    });
    var saved = await store.get(r.state.id);
    ok('E9.1 appendedKeys 随 plan 持久化', !!saved && saved.plan && saved.plan.expansion &&
      Array.isArray(saved.plan.expansion.appendedKeys) && saved.plan.expansion.appendedKeys.length >= 1,
      saved && saved.plan && saved.plan.expansion ? saved.plan.expansion.appendedKeys.length : 'none');

    var loaded = await Control.load(r.state.id, { store: store });
    ok('E9.2 读取后 Task 可校验', !!loaded && T.validate(loaded.state) === true, loaded ? loaded.resumable : 'none');

    var resumed = await Control.resume(r.state.id, CTX, CFG, { network: false, store: store });
    var xs = resumed.state ? resumed.state.steps.filter(function (s) { return /^x/.test(s.id); }) : [];
    ok('E9.3 恢复后不重复创建追加步骤', resumed != null && xs.length === 1, resumed ? xs.length : 'none');

    var events = r.state.events || [];
    var decided = events.filter(function (e) { return e.type === 'progress.decided'; });
    var expanded = events.filter(function (e) { return e.type === 'plan.expanded'; });
    ok('E9.4 事件产生且只追加一次', decided.length >= 1 && expanded.length === 1,
      'decided=' + decided.length + '/expanded=' + expanded.length);
    var di = events.indexOf(decided[0]), ei = events.indexOf(expanded[0]);
    ok('E9.5 decided 先于 expanded', di >= 0 && ei > di, di + '>' + ei);
    var allowed = T.EVENT_PAYLOAD_KEYS;
    var bad = events.filter(function (e) {
      return Object.keys(e.payload || {}).some(function (k) { return allowed.indexOf(k) < 0; });
    });
    ok('E9.6 payload 键不越界', bad.length === 0, bad.map(function (e) { return e.type; }).join(','));
    ok('E9.7 事件后 Task 状态合法', T.validate(r.state) === true);
  });

  /* ---------------- E10 预算 ---------------- */
  await runCase('E10', '预算边界', async function () {
    var s = T.create({ question: 'budget', level: 'L3' });
    ok('E10.1 L3 预算为 2', s.budget.limit.replans === 2 && s.budget.limit.searches === 2,
      s.budget.limit.replans + '/' + s.budget.limit.searches);
    var l1 = T.create({ question: 'budget', level: 'L1' });
    ok('E10.2 L1 不允许追加/重规划', Control.maxReplansOf(l1, {}) === 0 && l1.budget.limit.appends === 0);

    var st = stateFor(tePlan(), { searches: 2 }, { searches: 2 });
    var d = decide(st, freshPlan(), researchOf([evidence('e1', 'src_a')], [claim('c1', ['e1'])]));
    ok('E10.3 L3 搜索预算耗尽 → budget_exhausted', d.action === 'stop' && d.reason === 'budget_exhausted', d.reason);

    var st4 = stateFor(tePlan(), { searches: 2 }, { searches: 3 });
    var d4 = decide(st4, freshPlan(), researchOf([evidence('e1', 'src_a')], [claim('c1', ['e1'])]));
    ok('E10.4 L4 剩 1 次搜索 → append', d4.action === 'append', d4.action);

    var st5 = stateFor(tePlan(), { appends: 2 }, { appends: 2, searches: 9 });
    var d5 = decide(st5, freshPlan(), researchOf([evidence('e1', 'src_a')], [claim('c1', ['e1'])]));
    ok('E10.5 appends 用满 → 不追加', d5.action === 'stop' && d5.reason === 'append_budget_exhausted', d5.reason);
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' +
      cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-5-research-loop-claims] ' + (e && e.stack || e));
  process.exit(1);
});
