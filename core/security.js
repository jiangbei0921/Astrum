/* ASTRUM · P0 统一安全层
 *
 * 本文件承担三个职责（不拆文件，避免循环依赖）：
 *   1) Principal 工厂：身份只能由可信运行上下文构造
 *   2) CapabilityRegistry + RolePolicy：能力字典与角色默认策略
 *   3) AuthorizationService / PolicyEvaluator：authorize(principal, action, resource, context)
 *
 * 原则：默认拒绝、显式授权、最小权限、资源所有权检查、失败即拒绝。
 */
(function (root) {
  'use strict';

  var POLICY_VERSION = '1';

  /* ---------------- 能力字典：true=已实现，false=仅定义 ---------------- */
  var CAPABILITIES = {
    'project.read': true,
    'project.create': true,
    'project.update': true,
    'project.archive': true,

    'memory.read': true,
    'memory.propose': true,
    'memory.approve': true,
    'memory.update': true,

    'evidence.read': true,
    'evidence.create': false,
    'evidence.annotate': false,
    'evidence.delete': false,

    'claim.read': true,
    'claim.propose': false,
    'claim.evaluate': false,
    'claim.approve': false,

    'task.read': true,
    'task.create': true,
    'task.execute': true,
    'task.pause': false,
    'task.resume': true,
    'task.cancel': true,
    'task.delete': true,

    'skill.read': true,
    'skill.propose': true,
    'skill.create': true,
    'skill.test': true,
    'skill.evaluate': true,
    'skill.approve': true,
    'skill.publish': true,
    'skill.execute': true,
    'skill.rollback': true,

    'report.create': false,
    'report.evaluate': false,

    'tool.search': true,
    'tool.calculate': true,
    'tool.read_local': true,
    'tool.external_api': true,
    'tool.llm': true
  };

  /* ---------------- 角色策略：未列出 = 拒绝 ---------------- */
  var ROLE_POLICY = {
    muse: ['project.read', 'task.read', 'task.create', 'task.execute', 'task.resume', 'task.cancel',
      'evidence.read', 'claim.read', 'memory.read', 'memory.propose', 'tool.llm', 'tool.calculate',
      'skill.read', 'skill.propose', 'skill.create', 'skill.execute'],
    scholar: ['project.read', 'task.read', 'task.create', 'task.execute', 'task.resume', 'task.cancel',
      'evidence.read', 'claim.read', 'memory.read', 'memory.propose', 'tool.search', 'tool.external_api',
      'skill.read', 'skill.propose', 'skill.create', 'skill.execute'],
    critic: ['project.read', 'task.read', 'evidence.read', 'claim.read', 'memory.read', 'memory.propose',
      'tool.calculate', 'skill.read', 'skill.test', 'skill.evaluate', 'skill.execute'],
    curator: ['project.read', 'task.read', 'evidence.read', 'claim.read', 'memory.read', 'memory.propose',
      'tool.read_local', 'skill.read', 'skill.propose', 'skill.create', 'skill.execute'],
    vega: ['project.read', 'task.read', 'evidence.read', 'tool.read_local', 'tool.calculate'],
    kepler: ['tool.calculate'],
    horizon: ['tool.calculate', 'tool.read_local'],
    orion: ['tool.read_local'],
    cosmos: ['project.read', 'task.read', 'evidence.read', 'tool.calculate'],
    nova: ['project.read', 'task.read', 'evidence.read', 'tool.calculate'],
    helios: ['project.read', 'task.read', 'evidence.read', 'tool.calculate'],
    lyra: [],
    navigator: []
  };

  var USER_POLICY = [
    'project.read', 'project.create', 'project.update', 'project.archive',
    'memory.read', 'memory.propose', 'memory.approve', 'memory.update',
    'task.read', 'task.resume', 'task.cancel', 'task.delete',
    'skill.read', 'skill.propose', 'skill.create', 'skill.test', 'skill.evaluate',
    'skill.approve', 'skill.publish', 'skill.execute', 'skill.rollback'
  ];

  /* ---------------- 工具 → 能力 ---------------- */
  var TOOL_CAPABILITY = {
    'kepler.ephemeris': 'tool.calculate',
    'kepler.visibility': 'tool.calculate',
    'kb.lookup': 'tool.read_local',
    'fits.parse': 'tool.read_local',
    'compare.curate': 'tool.read_local',
    'evidence.search': 'tool.search',
    'paper.search': 'tool.search',
    'simbad.tap': 'tool.external_api',
    'llm.compose': 'tool.llm',
    'compose.target': null,
    'compose.domain': null,
    'compose.simple': null
  };

  var BUILTIN_ROLES = {};
  ['muse', 'vega', 'kepler', 'horizon', 'orion', 'cosmos', 'nova', 'helios',
    'lyra', 'scholar', 'critic', 'curator', 'navigator'].forEach(function (id) {
    BUILTIN_ROLES[id] = true;
  });

  function nowIso() { return new Date().toISOString(); }

  function has(list, v) { return !!(list && list.indexOf(v) >= 0); }

  function decision(allowed, reason) {
    return { allowed: !!allowed, reason: allowed ? 'ALLOW' : (reason || 'POLICY_DENIED'), policyVersion: POLICY_VERSION };
  }

  function audit(principal, action, resource, result, detail) {
    if (!root.AuditLog || !root.AuditLog.record) return;
    try {
      root.AuditLog.record({
        profileId: principal && principal.profileId,
        projectId: principal && principal.projectId,
        principalType: principal && principal.principalType,
        principalId: (principal && (principal.agentId || principal.profileId)) || '',
        action: action,
        resourceType: (resource && resource.resourceType) || '',
        resourceId: (resource && resource.resourceId) || '',
        decision: result.allowed ? 'allow' : 'deny',
        reason: result.reason,
        policyVersion: POLICY_VERSION,
        detail: detail || null
      });
    } catch (e) { /* 审计失败不得影响决策 */ }
  }

  /* ---------------- Agent 注册表只读解析 ---------------- */
  function agentById(agentId) {
    if (!agentId) return null;
    if (root.AgentCore && typeof root.AgentCore.agentById === 'function') {
      return root.AgentCore.agentById(agentId);
    }
    if (root.AgentCore && root.AgentCore.AGENT_BY_ID) return root.AgentCore.AGENT_BY_ID[agentId] || null;
    return null;
  }

  function resolveRole(agentId) {
    if (!agentId) return null;
    var a = agentById(agentId);
    if (!a) {
      /* 兼容尚未加载 AgentCore 的启动早期：仅识别内置 id，不信任自定义 */
      return BUILTIN_ROLES[agentId] ? { agentId: agentId, roleId: agentId } : null;
    }
    return { agentId: agentId, roleId: a.custom ? ('custom:' + agentId) : agentId };
  }

  /* ---------------- Principal ---------------- */
  function makePrincipal(opts) {
    opts = opts || {};
    var pc = root.ProfileContext && root.ProfileContext.current ? root.ProfileContext.current() : null;
    if (!pc) return null;
    var type = opts.principalType || 'agent';
    var agentId = type === 'user' ? '' : String(opts.agentId || '');
    var role = type === 'user' ? { roleId: 'user' } : resolveRole(agentId);
    return {
      principalType: type,
      profileId: pc.profileId,
      agentId: agentId,
      roleId: role ? role.roleId : '',
      projectId: opts.projectId || null,
      taskId: opts.taskId || null,
      sessionId: pc.sessionId,
      delegatedBy: opts.delegatedBy || null
    };
  }

  /* 仅供测试注入；生产代码不得调用 */
  function forTest(opts) {
    opts = opts || {};
    var pc = root.ProfileContext && root.ProfileContext.current ? root.ProfileContext.current() : null;
    var profileId = opts.profileId || (pc && pc.profileId) || 'test';
    var sessionId = opts.sessionId ||
      ((pc && pc.profileId === profileId) ? pc.sessionId : 'test-session');
    return {
      principalType: opts.principalType || 'agent',
      profileId: profileId,
      agentId: opts.agentId || 'muse',
      roleId: opts.roleId || opts.agentId || 'muse',
      projectId: opts.projectId || null,
      taskId: opts.taskId || null,
      sessionId: sessionId,
      delegatedBy: null
    };
  }

  function ensureSession(principal) {
    if (!principal) return decision(false, 'INVALID_CONTEXT');
    if (!principal.profileId || !principal.sessionId) return decision(false, 'INVALID_CONTEXT');
    if (root.ProfileContext && root.ProfileContext.sameSession &&
      !root.ProfileContext.sameSession(principal)) {
      return decision(false, 'SESSION_CHANGED');
    }
    return decision(true);
  }

  function capabilityFor(action, resource, context) {
    if (context && context.capability) return context.capability;
    if (action === 'tool.call') return null;
    var rt = (resource && resource.resourceType) || '';
    if (rt === 'task' && action === 'read') return 'project.read';
    if (rt === 'task') return 'task.' + action;
    if (rt === 'project') return 'project.' + action;
    if (rt === 'evidence' || rt === 'claim' || rt === 'memory' || rt === 'skill' || rt === 'report') {
      return rt + '.' + action;
    }
    return action;
  }

  /* 唯一授权契约 */
  function authorize(req) {
    req = req || {};
    var principal = req.principal || null;
    var action = req.action || '';
    var resource = req.resource || null;
    var context = req.context || null;
    var result;

    if (!principal || !principal.principalType || !principal.profileId || !principal.sessionId) {
      result = decision(false, 'INVALID_CONTEXT');
      audit(principal, action, resource, result);
      return result;
    }

    var session = ensureSession(principal);
    if (!session.allowed) {
      audit(principal, action, resource, session);
      return session;
    }

    if (principal.principalType !== 'user' && principal.principalType !== 'system') {
      if (!principal.agentId || !agentById(principal.agentId)) {
        result = decision(false, 'AGENT_NOT_REGISTERED');
        audit(principal, action, resource, result);
        return result;
      }
      if (!principal.roleId) {
        result = decision(false, 'ROLE_NOT_ALLOWED');
        audit(principal, action, resource, result);
        return result;
      }
    }

    var policy = principal.principalType === 'user'
      ? USER_POLICY
      : (principal.principalType === 'system' ? [] : ROLE_POLICY[principal.roleId]);

    if (!policy) {
      result = decision(false, principal.roleId && principal.roleId.indexOf('custom:') === 0
        ? 'CAPABILITY_NOT_GRANTED' : 'ROLE_NOT_ALLOWED');
      audit(principal, action, resource, result);
      return result;
    }

    var capability = capabilityFor(action, resource, context);
    if (capability) {
      /* 仅定义未实现的能力一律拒绝；即使角色策略表写了允许。 */
      if (CAPABILITIES[capability] !== true) {
        result = decision(false, 'CAPABILITY_NOT_IMPLEMENTED');
        audit(principal, action, resource, result);
        return result;
      }
      if (!has(policy, capability)) {
        result = decision(false, 'CAPABILITY_NOT_GRANTED');
        audit(principal, action, resource, result);
        return result;
      }
    }

    /* P2：技能审批/发布/回滚为人工动作，任何 Agent 一律拒绝（角色策略只是第二道）。 */
    if (resource && resource.resourceType === 'skill' &&
      ['approve', 'publish', 'rollback'].indexOf(action) >= 0 &&
      principal.principalType !== 'user') {
      result = decision(false, 'USER_ONLY');
      audit(principal, action, resource, result);
      return result;
    }

    if (resource && resource.ownerProfileId && resource.ownerProfileId !== principal.profileId) {
      result = decision(false, 'PROFILE_MISMATCH');
      audit(principal, action, resource, result);
      return result;
    }

    if (resource && resource.projectId) {
      if (!principal.projectId || principal.projectId !== resource.projectId) {
        result = decision(false, 'PROJECT_MISMATCH');
        audit(principal, action, resource, result);
        return result;
      }
    }

    result = decision(true);
    audit(principal, action, resource, result);
    return result;
  }

  /* 多 Agent 委托：只允许一级，能力由子角色策略决定，天然不扩权 */
  function delegate(parent, childAgentId, projectId) {
    if (!parent) return null;
    var pc = { profileId: parent.profileId, sessionId: parent.sessionId };
    if (!pc.profileId || !pc.sessionId) return null;
    var role = resolveRole(childAgentId);
    if (!role) return null;
    return {
      principalType: 'agent',
      profileId: parent.profileId,
      agentId: childAgentId,
      roleId: role.roleId,
      projectId: projectId || parent.projectId || null,
      taskId: parent.taskId || null,
      sessionId: parent.sessionId,
      delegatedBy: parent.agentId || ''
    };
  }

  function can(principal, capability) {
    var policy = principal && principal.principalType === 'user'
      ? USER_POLICY
      : ROLE_POLICY[principal && principal.roleId];
    return has(policy, capability) && CAPABILITIES[capability] === true;
  }

  root.Security = {
    POLICY_VERSION: POLICY_VERSION,
    CAPABILITIES: CAPABILITIES,
    ROLE_POLICY: ROLE_POLICY,
    USER_POLICY: USER_POLICY,
    TOOL_CAPABILITY: TOOL_CAPABILITY,
    makePrincipal: makePrincipal,
    forTest: forTest,
    resolveRole: resolveRole,
    authorize: authorize,
    delegate: delegate,
    ensureSession: ensureSession,
    can: can,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
