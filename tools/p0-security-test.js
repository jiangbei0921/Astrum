/* ASTRUM P0 安全测试（阶段 B）
 *
 * 覆盖：权限契约、Profile 任务隔离、Agent 角色、工具网关、异步会话。
 * 用法：node tools/p0-security-test.js
 *
 * 说明：Node 环境无 IndexedDB，TaskStore 自动退化到 localStorage；
 * 这不影响「命名空间 + owner 校验」的验证。
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] == null ? null : this._d[k]; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; },
  clear: function () { this._d = {}; }
};

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/fit.js', 'core/agents.js',
  'core/profile.js', 'core/profile-context.js', 'core/audit-log.js',
  'core/security.js', 'core/tool-gateway.js', 'core/task.js',
  'core/schema.js', 'core/claims.js', 'core/evidence.js', 'core/fits.js',
  'core/query.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js', 'core/request.js',
  'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var P = global.Profile;
var PC = global.ProfileContext;
var Sec = global.Security;
var GW = global.ToolGateway;
var T = global.AstroTask;
var Store = global.AstroTaskStore;
var Control = global.AstroControl;
var Registry = global.AstroRegistry;

var results = [];
var pass = 0;
var fail = 0;

function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra || '' });
  if (cond) pass++; else fail++;
}

function equal(name, a, b) {
  ok(name, JSON.stringify(a) === JSON.stringify(b),
    JSON.stringify(a) + ' === ' + JSON.stringify(b));
}

function state(question) {
  return T.create({
    question: question || 'P0 安全测试任务',
    mode: 'single',
    level: 'L3',
    phase: 'EXECUTE',
    plan: { template: 'test', steps: [] },
    steps: [{ id: 's1', tool: 'kb.lookup', status: 'pending', args: { q: 'x' } }]
  });
}

async function main() {
  var A = P.currentId();
  var storeA = Store.create({});
  var sA = state('A 档案任务');

  /* ---------- 1. TaskStore owner 与跨档案隔离 ---------- */
  await storeA.save(sA);
  var recA = await storeA.getRecord(sA.id);
  ok('P0-TASK-001 新任务绑定 owner', recA && recA.ownerProfileId === A,
    recA && recA.ownerProfileId);

  var bProf = P.create('档案 B');
  P.switchTo(bProf.id);
  var B = P.currentId();
  var storeB = Store.create({});

  var listB = await storeB.list();
  ok('P0-PROFILE-001 B 列表不含 A 任务',
    !listB.some(function (x) { return x.id === sA.id; }), JSON.stringify(listB.map(function (x) { return x.id; })));

  var gotB = await storeB.get(sA.id);
  ok('P0-PROFILE-002 B 按 ID 读取返回 null', gotB === null, String(gotB));

  var removed = await storeB.remove(sA.id);
  ok('P0-PROFILE-004 B 删除被拒', removed === false, String(removed));
  ok('P0-PROFILE-004b A 任务仍存在', !!(await storeA.get(sA.id)));

  var loadedB = await Control.load(sA.id, { store: storeB, principal: Sec.makePrincipal({ agentId: 'muse' }) });
  ok('P0-PROFILE-005 B 加载/恢复被拒', loadedB === null, String(loadedB));

  var resumedB = await Control.resume(sA.id, {}, {}, {
    store: storeB, principal: Sec.makePrincipal({ agentId: 'muse' })
  });
  ok('P0-PROFILE-006 B 恢复入口返回 null', resumedB === null, String(resumedB));

  /* 跨档案写入：B 只能在自己的命名空间生成记录，A 的原记录必须保持不变。 */
  await storeB.save(sA);
  var recA2 = await storeA.getRecord(sA.id);
  var recB2 = await storeB.getRecord(sA.id);
  ok('P0-PROFILE-003 跨档案写入不修改 A 记录',
    recA2 && recA2.ownerProfileId === A && recA2.updatedAt === recA.updatedAt);
  ok('P0-PROFILE-003b B 记录归属 B', recB2 && recB2.ownerProfileId === B);

  /* ---------- 2. 会话变化 ---------- */
  var pB = Sec.makePrincipal({ agentId: 'scholar' });
  P.switchTo(A);
  ok('P0-ASYNC-001 切换档案后旧 principal 会话失效',
    Sec.ensureSession(pB).allowed === false &&
    Sec.ensureSession(pB).reason === 'SESSION_CHANGED');

  /* ---------- 3. 权限契约 ---------- */
  var scholar = Sec.makePrincipal({ agentId: 'scholar' });
  var lyra = Sec.makePrincipal({ agentId: 'lyra' });
  var ghost = Sec.makePrincipal({ agentId: 'ghost' });
  var taskRes = { resourceType: 'task', resourceId: sA.id, ownerProfileId: A, projectId: null };

  equal('P0-AUTH-001 scholar 读任务允许',
    Sec.authorize({ principal: scholar, action: 'read', resource: taskRes }).allowed, true);
  equal('P0-AUTH-003 未注册 Agent 拒绝',
    Sec.authorize({ principal: ghost, action: 'read', resource: taskRes }).reason, 'AGENT_NOT_REGISTERED');
  equal('P0-AUTH-004 Lyra 执行任务拒绝',
    Sec.authorize({ principal: lyra, action: 'execute', resource: taskRes }).reason, 'CAPABILITY_NOT_GRANTED');
  equal('P0-AUTH-005 仅定义能力拒绝',
    Sec.authorize({ principal: scholar, action: 'create', resource: { resourceType: 'evidence', ownerProfileId: A } }).reason,
    'CAPABILITY_NOT_IMPLEMENTED');
  equal('P0-AUTH-006 缺失身份拒绝',
    Sec.authorize({ principal: null, action: 'read', resource: taskRes }).reason, 'INVALID_CONTEXT');

  var wrongOwner = { resourceType: 'task', resourceId: 'x', ownerProfileId: B, projectId: null };
  equal('P0-AUTH-007 资源 owner 不匹配拒绝',
    Sec.authorize({ principal: scholar, action: 'read', resource: wrongOwner }).reason, 'PROFILE_MISMATCH');

  var user = Sec.makePrincipal({ principalType: 'user' });
  equal('P0-AUTH-008 用户可恢复本档案任务',
    Sec.authorize({ principal: user, action: 'resume', resource: taskRes }).allowed, true);

  /* P3 B0：暂停与报告能力置真（G-01/G-02），仍有角色边界。 */
  var muse = Sec.makePrincipal({ agentId: 'muse' });
  var reportRes = { resourceType: 'report', resourceId: 'r1', ownerProfileId: A, projectId: null };
  equal('P0-AUTH-009 用户可暂停任务',
    Sec.authorize({ principal: user, action: 'pause', resource: taskRes }).allowed, true);
  equal('P0-AUTH-010 scholar 可暂停任务',
    Sec.authorize({ principal: scholar, action: 'pause', resource: taskRes }).allowed, true);
  equal('P0-AUTH-011 muse 可生成报告',
    Sec.authorize({ principal: muse, action: 'create', resource: reportRes }).allowed, true);
  equal('P0-AUTH-012 critic 可生成报告',
    Sec.authorize({ principal: Sec.makePrincipal({ agentId: 'critic' }), action: 'create', resource: reportRes }).allowed, true);
  equal('P0-AUTH-013 scholar 不得生成报告',
    Sec.authorize({ principal: scholar, action: 'create', resource: reportRes }).reason, 'CAPABILITY_NOT_GRANTED');
  equal('P0-AUTH-014 report.evaluate 仍未实现',
    Sec.authorize({ principal: user, action: 'evaluate', resource: reportRes }).reason, 'CAPABILITY_NOT_IMPLEMENTED');

  /* ---------- 4. 自定义 Agent ---------- */
  global.AgentCore.setCustomAgents([{ id: 'mybot', name: '自定义', attrs: {} }]);
  var custom = Sec.makePrincipal({ agentId: 'mybot' });
  equal('P0-AGENT-001 自定义角色解析', custom.roleId, 'custom:mybot');
  equal('P0-AGENT-002 自定义 Agent 无科研权限',
    Sec.authorize({ principal: custom, action: 'read', resource: taskRes }).reason, 'CAPABILITY_NOT_GRANTED');

  global.AgentCore.setCustomAgents([{ id: 'muse', name: '伪装', attrs: {} }]);
  equal('P0-AGENT-003 自定义 Agent 不得覆盖内置 id',
    global.AgentCore.agentById('muse').custom === true, false);
  global.AgentCore.setCustomAgents([]);

  /* ---------- 5. 工具网关 ---------- */
  var reg = Registry.createDefault({ agentCore: global.AgentCore, adapter: null, network: false });
  var called = 0;
  var spec = reg.get('paper.search');
  var originalRun = spec.run;
  spec.run = function () { called += 1; return { ok: true, items: [] }; };

  var denied = await GW.invoke(lyra, 'paper.search', { query: 'M42' }, { registry: reg, ctx: {} });
  ok('P0-TOOL-001 未授权工具不执行', denied && denied.ok === false && called === 0,
    JSON.stringify(denied));

  var allowed = await GW.invoke(scholar, 'paper.search', { query: 'M42' }, { registry: reg, ctx: {} });
  ok('P0-TOOL-002 授权工具正常执行', allowed && allowed.ok === true && called === 1,
    JSON.stringify(allowed));

  var forged = await GW.invoke(scholar, 'paper.search', { query: 'M42', profileId: 'pB' }, { registry: reg, ctx: {} });
  ok('P0-TOOL-003 伪造 profileId 被拒', forged.ok === false && forged.reason === 'POLICY_DENIED' && called === 1);

  var unknown = await GW.invoke(scholar, 'no.such.tool', {}, { registry: reg, ctx: {} });
  ok('P0-TOOL-004 未知工具拒绝', unknown.ok === false && unknown.reason === 'RESOURCE_NOT_FOUND');

  /* 编排主体按域委托：Muse 本身无检索权，委托给 Scholar 后可用。 */
  var muse = Sec.makePrincipal({ agentId: 'muse' });
  called = 0;
  var museDirect = await GW.invoke(muse, 'paper.search', { query: 'M42' }, { registry: reg, ctx: {} });
  ok('P0-TOOL-005 Muse 直接检索被拒', museDirect.ok === false && called === 0,
    JSON.stringify(museDirect));

  var child = Sec.delegate(muse, 'scholar');
  var childRes = await GW.invoke(child, 'paper.search', { query: 'M42' }, { registry: reg, ctx: {} });
  ok('P0-TOOL-006 委托 Scholar 后检索可用', childRes.ok === true && called === 1,
    JSON.stringify(childRes));

  var curator = Sec.delegate(muse, 'curator');
  ok('P0-TOOL-007 委托角色按最小能力解析',
    Sec.authorize({ principal: curator, action: 'tool.call', resource: { resourceType: 'tool', resourceId: 'kb.lookup' }, context: { capability: 'tool.read_local' } }).allowed === true &&
    Sec.authorize({ principal: curator, action: 'tool.call', resource: { resourceType: 'tool', resourceId: 'paper.search' }, context: { capability: 'tool.search' } }).allowed === false);

  spec.run = originalRun;

  /* ---------- 6. 迁移隔离 ---------- */
  var legacyState = state('旧版本任务');
  global.localStorage.setItem('astrum.tasks.v1', JSON.stringify({
    'tsk_legacy_1': {
      id: 'tsk_legacy_1', question: '旧版本任务', phase: 'EXECUTE',
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
      state: T.toJSON(legacyState)
    }
  }));
  var m = await Store.migrateLegacy({ force: true });
  ok('P0-MIGRATION-001 旧任务进入隔离区', m.quarantined >= 1, JSON.stringify(m));
  var q = JSON.parse(global.localStorage.getItem(Store.QUARANTINE_DB) || '{}');
  ok('P0-MIGRATION-002 隔离记录不归属任何档案',
    q['legacy:tsk_legacy_1'] && q['legacy:tsk_legacy_1'].candidateProfileId === null);
  ok('P0-MIGRATION-003 旧数据未被删除',
    !!global.localStorage.getItem('astrum.tasks.v1'));

  var m2 = await Store.migrateLegacy({ force: true });
  ok('P0-MIGRATION-004 迁移幂等', m2.quarantined === m.quarantined, JSON.stringify(m2));

  var storeA2 = Store.create({});
  var listA2 = await storeA2.list();
  ok('P0-MIGRATION-005 旧任务未归入当前档案',
    !listA2.some(function (x) { return x.id === 'tsk_legacy_1'; }));

  console.log('');
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra));
  });
  console.log('');
  console.log('RESULT ' + pass + '/' + (pass + fail));
  process.exit(fail ? 1 : 0);
}

main().catch(function (e) {
  console.error('FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
