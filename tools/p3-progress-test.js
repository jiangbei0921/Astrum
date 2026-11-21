/**
 * ASTRUM P3 B6 · 目标覆盖度与执行摘要测试
 * 用法：node tools/p3-progress-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/task.js'));
require(path.join(ROOT, 'core/evaluator.js'));
require(path.join(ROOT, 'core/report.js'));

var T = global.AstroTask;
var E = global.AstroEvaluator;
var Report = global.AstroReport;
var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('PASS | ' + name); }
  else { fail++; console.log('FAIL | ' + name + ' | ' + (extra == null ? '' : extra)); }
}

function baseState(goal) {
  var st = T.create({
    question: 'JWST 系外行星大气',
    level: 'L3',
    goal: goal,
    steps: [{ id: 't1', tool: 'evidence.search', deps: [], args: { query: 'x' } }]
  });
  st.steps[0].status = 'ok';
  st.plan = { planId: 'p1', version: 2, template: 'T-E', steps: [{ id: 't1', tool: 'evidence.search', deps: [] }] };
  return st;
}

/* E1 无 goal：不改变旧行为 */
var legacy = baseState(null);
var d0 = E.decide({ state: legacy, research: { evidence: [], claims: [], reducer: {} } });
ok('P3-P1-01 无 goal 时 coverage 为 null', d0.coverage === null);

/* E2 有 goal 且未覆盖 */
var goal = {
  goalId: 'g1', title: 'JWST 大气研究',
  objectives: [
    { id: 'o1', text: '获取 WASP-39b 的大气成分证据', priority: 'must' },
    { id: 'o2', text: '给出与 HD 209458b 的差异结论', priority: 'should' }
  ],
  constraints: [], context: { entities: [] }, requestedOutputs: [], missingInfo: [],
  sourceRefs: {}, createdAt: new Date().toISOString()
};
var st = baseState(goal);
var research = {
  evidence: [{ evidenceId: 'e1', sourceId: 's1', title: 'Unrelated stellar rotation', content: {} }],
  claims: [{ id: 'c1', text: '恒星自转周期约 10 天' }],
  reducer: { evidence: [], conflicts: [], differences: [], sources: [] }
};
var d1 = E.decide({ state: st, research: research });
ok('P3-P2-01 覆盖度对象存在', !!d1.coverage && d1.coverage.mustTotal === 1);
ok('P3-P2-02 未覆盖 must 进入缺口', d1.coverage.uncoveredMust.indexOf('o1') >= 0 &&
  d1.gaps.indexOf('goal_objective_uncovered') >= 0, JSON.stringify(d1.gaps));

/* E3 有 goal 且覆盖 */
var research2 = {
  evidence: [{ evidenceId: 'e2', sourceId: 's2', title: 'WASP-39b atmospheric composition from JWST', content: { excerpt: '大气成分' } }],
  claims: [{ id: 'c1', text: 'WASP-39b 大气含二氧化碳' }],
  reducer: { evidence: [], conflicts: [], differences: [], sources: [] }
};
var d2 = E.decide({ state: baseState(goal), research: research2 });
ok('P3-P3-01 目标被证据覆盖', d2.coverage.mustCovered === 1 && d2.coverage.uncoveredMust.length === 0);
ok('P3-P3-02 不产生目标缺口', d2.gaps.indexOf('goal_objective_uncovered') < 0);

/* R 执行摘要 */
var st3 = baseState(goal);
st3.recoveries = 1;
st3.budget.used.recoveries = 1;
st3.pausedAt = null;
var rep = Report.build({
  question: st3.question, evidence: [], claims: [], verdicts: [],
  state: st3, goalCoverage: d2.coverage
});
ok('P3-P4-01 报告含 execution', !!rep.execution);
ok('P3-P4-02 执行摘要统计', rep.execution.counts.total === 1 && rep.execution.counts.ok === 1);
ok('P3-P4-03 恢复次数透出', rep.execution.paused.recoveries === 1 && rep.execution.paused.limit === 3);
ok('P3-P4-04 goal 覆盖透出', rep.execution.goal.objectives[0].covered === true);
ok('P3-P4-05 plan 元信息', rep.execution.planId === 'p1' && rep.execution.planVersion === 2 && rep.execution.template === 'T-E');

/* 无 state 时不新增 execution，旧报告结构不变 */
var rep2 = Report.build({ question: 'q', evidence: [], claims: [], verdicts: [] });
ok('P3-P5-01 无 state 不新增 execution', rep2.execution === undefined);

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
