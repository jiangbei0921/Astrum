/* ASTRUM · P2 科研技能执行器
 *
 * 唯一执行出口：
 *   读取已发布版本 → 作用域求交 → 逐步骤经 ToolGateway → 输出契约 → 写 Execution。
 *
 * 无动态代码：workflow 只是「工具 + 参数模板」的声明式序列。
 * 实际权限 = 执行者权限 ∩ Skill 声明 ∩ 作用域；任何一项不满足即拒绝，不静默跳过。
 * 失败最多重试 2 次；单步超时上限 120s。
 */
(function (root) {
  'use strict';

  var MAX_TIMEOUT = 120000;
  var MAX_RETRY = 2;
  var FORBIDDEN_ARGS = ['profileId', 'projectId', 'principal', 'sessionId', 'ownerProfileId'];

  function nowIso() { return new Date().toISOString(); }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }

  function newId(prefix) {
    if (root.AstroSkillContract && root.AstroSkillContract.newId) return root.AstroSkillContract.newId(prefix);
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function denied(reason) {
    return { ok: false, reason: reason, tools: [] };
  }

  function hasForbidden(args) {
    if (!args || typeof args !== 'object') return '';
    for (var i = 0; i < FORBIDDEN_ARGS.length; i++) {
      if (Object.prototype.hasOwnProperty.call(args, FORBIDDEN_ARGS[i])) return FORBIDDEN_ARGS[i];
    }
    return '';
  }

  function resolveScope(skill, version, principal, opts) {
    opts = opts || {};
    var registry = opts.registry || null;
    if (!skill || !version) return denied('NOT_FOUND');
    if (!principal || !principal.profileId) return denied('INVALID_CONTEXT');
    if (skill.profileId !== principal.profileId) return denied('PROFILE_MISMATCH');
    if (skill.projectId) {
      if (!principal.projectId || principal.projectId !== skill.projectId) return denied('PROJECT_MISMATCH');
    }
    if (version.status !== 'published') return denied('NOT_PUBLISHED');
    var allowedAgents = (version.content && isArray(version.content.allowedAgents) && version.content.allowedAgents.length)
      ? version.content.allowedAgents : skill.allowedAgents;
    if (principal.principalType === 'agent' &&
      isArray(allowedAgents) && allowedAgents.length &&
      allowedAgents.indexOf(principal.agentId) < 0) {
      return denied('AGENT_NOT_ALLOWED');
    }

    var Security = root.Security;
    if (Security && typeof Security.authorize === 'function') {
      var d = Security.authorize({
        principal: principal,
        action: 'execute',
        resource: {
          resourceType: 'skill',
          resourceId: skill.skillId,
          ownerProfileId: skill.profileId,
          projectId: skill.projectId || null
        }
      });
      if (!d.allowed) return denied(d.reason);
    }

    var caps = version.content.requiredCapabilities || skill.requiredCapabilities || [];
    for (var c = 0; c < caps.length; c++) {
      if (Security && typeof Security.can === 'function' && !Security.can(principal, caps[c])) {
        return denied('CAPABILITY_NOT_GRANTED');
      }
    }

    var tools = (version.content.allowedTools || []).slice();
    (version.content.workflow || []).forEach(function (s) {
      if (s && s.tool && tools.indexOf(s.tool) < 0) tools.push(s.tool);
    });
    for (var i = 0; i < tools.length; i++) {
      var tool = tools[i];
      if (registry && !registry.has(tool)) return denied('TOOL_UNAVAILABLE');
      var cap = Security && Security.TOOL_CAPABILITY ? Security.TOOL_CAPABILITY[tool] : null;
      if (cap && Security && typeof Security.can === 'function' && !Security.can(principal, cap)) {
        return denied('TOOL_NOT_ALLOWED');
      }
    }
    return { ok: true, reason: 'ALLOW', tools: tools };
  }

  function failureCategoryOf(err) {
    var code = String((err && (err.code || err.reason || err.kind)) || err || '');
    if (/input|args_invalid|E_DRAFT_INPUT|E_DRAFT_OUTPUT/i.test(code)) return 'input';
    if (/NOT_FOUND|NOT_PUBLISHED|VERSION|PRECONDITION|REQUIRED/i.test(code)) return 'precondition';
    if (/tool_unavailable|RESOURCE_NOT_FOUND|UNKNOWN_TOOL|MODULE_MISSING/i.test(code)) return 'tool_unavailable';
    if (/POLICY_DENIED|CAPABILITY_NOT_GRANTED|PROJECT_MISMATCH|PROFILE_MISMATCH|USER_ONLY|AGENT_NOT_ALLOWED|TOOL_NOT_ALLOWED|SESSION_CHANGED/i.test(code)) return 'permission';
    if (/contract|OUTPUT_CONTRACT/i.test(code)) return 'contract';
    if (/evidence|EVIDENCE/i.test(code)) return 'evidence';
    if (/design|INVALID_TRANSITION/i.test(code)) return 'design';
    if (/external|network|rate_limit|timeout|empty/i.test(code)) return 'external';
    return 'exception';
  }

  function withTimeout(fn, ms) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = null;
      function finish(v) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        resolve(v);
      }
      timer = setTimeout(function () {
        finish({ ok: false, reason: 'timeout', kind: 'timeout', retriable: false });
      }, Math.max(1, Math.min(MAX_TIMEOUT, ms || MAX_TIMEOUT)));
      var call;
      try { call = fn(); } catch (e) { call = Promise.reject(e); }
      Promise.resolve(call).then(finish, function (e) {
        finish({ ok: false, reason: e && e.message ? e.message : String(e), kind: 'tool_error', retriable: false });
      });
    });
  }

  function sanitize(input) {
    var out = {};
    if (!isPlainObject(input)) return out;
    var src = isPlainObject(input.args) ? input.args : input;
    Object.keys(src).forEach(function (k) {
      if (FORBIDDEN_ARGS.indexOf(k) >= 0) return;
      if (k === 'args') return;
      out[k] = src[k];
    });
    return out;
  }

  function payloadOf(value) {
    if (value && typeof value === 'object' && value.result && typeof value.result === 'object') return value.result;
    return value;
  }

  function checkOutputs(outputs, value) {
    var missing = [];
    var payload = payloadOf(value);
    (outputs || []).forEach(function (o) {
      if (!o || !o.name) return;
      if (payload == null || typeof payload !== 'object' || !(o.name in payload)) {
        missing.push(o.name);
      }
    });
    return missing;
  }

  function baseExecution(skillId, versionId, principal, opts) {
    return {
      executionId: newId('ske_'),
      skillId: skillId,
      versionId: versionId || null,
      profileId: principal && principal.profileId,
      projectId: (opts && opts.projectId) || (principal && principal.projectId) || null,
      threadId: (opts && opts.threadId) || null,
      taskId: (opts && opts.taskId) || null,
      agentId: (principal && principal.agentId) || '',
      attempt: 1,
      startedAt: nowIso(),
      completedAt: null,
      durationMs: 0,
      status: 'running',
      failureCategory: null,
      failureReason: '',
      stepResults: [],
      traceId: (opts && opts.traceId) || newId('trc_'),
      schemaVersion: 1
    };
  }

  function finish(exec, status, category, reason) {
    exec.status = status;
    exec.failureCategory = category || null;
    exec.failureReason = String(reason || '').slice(0, 300);
    exec.completedAt = nowIso();
    exec.durationMs = Math.max(0, Date.parse(exec.completedAt) - Date.parse(exec.startedAt));
    return exec;
  }

  async function persist(exec, store, principal) {
    if (!store || typeof store.recordExecution !== 'function') return exec;
    try {
      await store.recordExecution(exec, principal);
      exec.recorded = true;
    } catch (e) {
      exec.recordError = e && e.code ? e.code : 'RECORD_FAILED';
    }
    return exec;
  }

  async function execute(skillId, input, opts) {
    opts = opts || {};
    var store = opts.store;
    var principal = opts.principal;
    var registry = opts.registry || null;
    var exec = baseExecution(skillId, opts.versionId || null, principal, opts);

    if (!store || !principal) {
      return finish(exec, 'failed', 'precondition', '缺少 store 或 principal');
    }
    if (opts.signal && opts.signal.aborted) {
      return persist(finish(exec, 'cancelled', 'external', 'cancelled'), store, principal);
    }
    if (!registry) {
      return persist(finish(exec, 'failed', 'precondition', '缺少 registry'), store, principal);
    }
    var pub = null;
    try {
      pub = await store.getPublished(skillId, principal);
    } catch (e) {
      return finish(exec, 'failed', failureCategoryOf(e), e && e.code);
    }
    if (!pub || !pub.version) {
      return persist(finish(exec, 'failed', 'precondition', '技能未发布或不可见'), store, principal);
    }
    exec.versionId = pub.version.versionId;
    if (!exec.projectId) exec.projectId = pub.skill.projectId || exec.projectId;

    var scope = resolveScope(pub.skill, pub.version, principal, { registry: registry });
    if (!scope.ok) {
      return persist(finish(exec, 'failed', failureCategoryOf(scope.reason), scope.reason), store, principal);
    }

    var content = pub.version.content || {};
    var steps = isArray(content.workflow) ? content.workflow : [];
    var baseArgs = sanitize(input);
    var retryMax = Math.min(MAX_RETRY, (content.retryPolicy && content.retryPolicy.max) || 0);
    var lastResult = null;
    var failed = false;

    for (var i = 0; i < steps.length; i++) {
      if (opts.signal && opts.signal.aborted) {
        failed = true;
        finish(exec, 'cancelled', 'external', 'cancelled');
        break;
      }
      var step = steps[i];
      var startedAt = nowIso();
      var stepArgs = Object.assign({}, isPlainObject(step.argsTemplate) ? step.argsTemplate : {}, baseArgs);
      var badKey = hasForbidden(stepArgs);
      if (badKey) {
        exec.stepResults.push({
          stepId: step.stepId, tool: step.tool, status: 'failed', durationMs: 0, reason: 'FORBIDDEN_ARG'
        });
        failed = true;
        finish(exec, 'failed', 'permission', '步骤参数包含身份字段：' + badKey);
        break;
      }

      if (opts.dryRun) {
        exec.stepResults.push({ stepId: step.stepId, tool: step.tool, status: 'planned', durationMs: 0 });
        continue;
      }

      var attempt = 0;
      var out = null;
      while (attempt <= retryMax) {
        attempt += 1;
        var fx = opts.fixtures && isPlainObject(opts.fixtures) ? opts.fixtures[step.tool] : null;
        if (fx != null) {
          out = isPlainObject(fx) && typeof fx.ok === 'boolean' ? fx : { ok: true, result: fx };
        } else {
          out = await withTimeout(function () {
            /* 唯一出口：所有工具调用都经 ToolGateway（授权、参数校验、审计） */
            if (!root.ToolGateway || typeof root.ToolGateway.invoke !== 'function') {
              return { ok: false, reason: 'GATEWAY_MISSING', kind: 'tool_unavailable', retriable: false };
            }
            return root.ToolGateway.invoke(principal, step.tool, stepArgs, {
              registry: registry,
              signal: opts.signal || null,
              taskId: opts.taskId || null,
              attempt: attempt
            });
          }, Math.min(MAX_TIMEOUT, step.timeoutMs || content.timeoutMs || 60000));
        }
        if (out && out.ok !== false) break;
        var retriable = !!(out && out.retriable);
        if (step.onError === 'skip') break;
        if (!retriable || attempt > retryMax || step.onError === 'fail') break;
      }

      var durationMs = Math.max(0, Date.parse(nowIso()) - Date.parse(startedAt));
      if (out && out.ok !== false) {
        exec.stepResults.push({ stepId: step.stepId, tool: step.tool, status: 'ok', durationMs: durationMs });
        lastResult = out;
        continue;
      }

      var reason = (out && (out.reason || out.kind)) || 'tool_failed';
      var status = reason === 'timeout' ? 'timeout' : 'failed';
      if (step.onError === 'skip') {
        exec.stepResults.push({
          stepId: step.stepId, tool: step.tool, status: 'skipped', durationMs: durationMs, reason: reason
        });
        continue;
      }
      exec.stepResults.push({
        stepId: step.stepId, tool: step.tool, status: status, durationMs: durationMs, reason: reason
      });
      failed = true;
      finish(exec, status === 'timeout' ? 'timeout' : 'failed',
        status === 'timeout' ? 'external' : failureCategoryOf(reason), reason);
      break;
    }

    if (!failed && !opts.dryRun) {
      var missing = checkOutputs(content.outputs, lastResult);
      if (missing.length) {
        finish(exec, 'failed', 'contract', '输出契约缺失：' + missing.join(','));
      } else {
        finish(exec, 'ok', null, '');
        if (lastResult && typeof lastResult === 'object') {
          exec.outputHash = root.AstroTask && root.AstroTask.sha256Hex
            ? root.AstroTask.sha256Hex(root.AstroTask.canonicalJSON(lastResult))
            : null;
        }
      }
    } else if (!failed && opts.dryRun) {
      finish(exec, 'ok', null, '');
    }
    if (opts.signal && opts.signal.aborted && exec.status !== 'ok') {
      finish(exec, 'cancelled', 'external', 'cancelled');
    }
    return persist(exec, store, principal);
  }

  async function recordUsage(execution, store) {
    if (!execution || execution.recorded || !store || typeof store.recordExecution !== 'function') {
      return execution;
    }
    return store.recordExecution(execution, {
      principalType: execution.profileId ? 'user' : 'system',
      profileId: execution.profileId,
      agentId: execution.agentId || '',
      projectId: execution.projectId || null,
      sessionId: 'usage'
    });
  }

  root.AstroSkillRuntime = {
    MAX_TIMEOUT: MAX_TIMEOUT,
    MAX_RETRY: MAX_RETRY,
    resolveScope: resolveScope,
    execute: execute,
    recordUsage: recordUsage,
    failureCategoryOf: failureCategoryOf,
    checkOutputs: checkOutputs,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
