/* ASTRUM · P0 工具调用网关
 *
 * 唯一职责：把「解析工具 → 授权 → 校验参数 → 执行 → 审计」收口到一处。
 * 只接管 Registry 路径（目前所有数据/网络工具都在此）；legacy 直调路径
 * 由文档显式标注为不受保护，不能假装已覆盖。
 */
(function (root) {
  'use strict';

  var FORBIDDEN_ARGS = ['profileId', 'projectId', 'principal', 'sessionId', 'ownerProfileId'];

  function fail(reason, kind) {
    return { ok: false, reason: reason, kind: kind || 'auth', retriable: false };
  }

  function hasForbidden(args) {
    if (!args || typeof args !== 'object') return '';
    for (var i = 0; i < FORBIDDEN_ARGS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(args, FORBIDDEN_ARGS[i])) return FORBIDDEN_ARGS[i];
    }
    return '';
  }

  function auditCall(principal, toolId, decision, extra) {
    if (!root.AuditLog || !root.AuditLog.record) return;
    try {
      root.AuditLog.record({
        profileId: principal && principal.profileId,
        principalType: principal && principal.principalType,
        principalId: (principal && principal.agentId) || '',
        action: 'tool.call',
        resourceType: 'tool',
        resourceId: toolId,
        decision: decision.allowed ? 'allow' : 'deny',
        reason: decision.reason || '',
        detail: extra || null
      });
    } catch (e) { /* ignore */ }
  }

  function invoke(principal, toolId, args, opts) {
    opts = opts || {};
    var registry = opts.registry || null;
    var Security = root.Security;
    if (!registry || typeof registry.get !== 'function') return fail('RESOURCE_NOT_FOUND');
    var spec = registry.get(toolId);
    if (!spec) return fail('RESOURCE_NOT_FOUND');

    var badKey = hasForbidden(args);
    if (badKey) {
      auditCall(principal, toolId, { allowed: false, reason: 'POLICY_DENIED' }, { forbidden: badKey });
      return fail('POLICY_DENIED');
    }

    if (Security) {
      var capability = Security.TOOL_CAPABILITY ? Security.TOOL_CAPABILITY[toolId] : null;
      var d;
      if (capability) {
        d = Security.authorize({
          principal: principal,
          action: 'tool.call',
          resource: { resourceType: 'tool', resourceId: toolId },
          context: { capability: capability }
        });
      } else {
        d = Security.ensureSession(principal);
      }
      if (!d.allowed) {
        auditCall(principal, toolId, d);
        return fail(d.reason);
      }
    }

    var check = registry.validateArgs ? registry.validateArgs(toolId, args || {}) : { ok: true };
    if (!check.ok) {
      var reason = (check.errors || []).map(function (e) { return e.path + ' ' + e.reason; }).join('; ');
      auditCall(principal, toolId, { allowed: false, reason: 'POLICY_DENIED' }, { args: reason });
      return { ok: false, reason: 'args_invalid', detail: reason, kind: 'args_invalid', retriable: false };
    }

    var runtime = {
      signal: opts.signal || null,
      taskId: opts.taskId || null,
      attempt: opts.attempt || 1,
      principal: principal || null
    };

    var out;
    try {
      out = spec.run(args || {}, opts.ctx, spec, opts.cfg, opts.depResults, runtime);
    } catch (e) {
      out = { ok: false, reason: e && e.message ? e.message : String(e), kind: 'tool_error', retriable: false };
    }

    return Promise.resolve(out).then(function (r) {
      auditCall(principal, toolId, { allowed: true }, {
        ok: !(r && r.ok === false),
        reason: (r && (r.reason || r.kind)) || ''
      });
      return r;
    }, function (e) {
      auditCall(principal, toolId, { allowed: true }, { ok: false, reason: 'thrown' });
      return { ok: false, reason: e && e.message ? e.message : String(e), kind: 'tool_error', retriable: false };
    });
  }

  root.ToolGateway = {
    invoke: invoke,
    FORBIDDEN_ARGS: FORBIDDEN_ARGS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
