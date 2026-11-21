/* ASTRUM · 恢复校验与策略（P4 B5）
 *
 * 依据：docs/P4/P4-04、P4-05、P4-08
 *
 * 纯函数：不读写 IndexedDB、不调用 LLM、不执行工具。
 * validate：恢复前 17 项校验（无对应输入时跳过，不误报）。
 * plan/apply：按工具 idempotent/ttlMs 推导 reuse / rerun / validate_then_reuse / block。
 */
(function (root) {
  'use strict';

  var BUDGET_FIELDS = ['ms', 'tokens', 'llmCalls', 'searches', 'parallel', 'replans', 'appends', 'retries', 'recoveries'];

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isObj(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  function stepsOf(state) { return (state && isArray(state.steps)) ? state.steps : []; }
  function planStepsOf(state) {
    return (state && state.plan && isArray(state.plan.steps)) ? state.plan.steps : [];
  }
  function stepById(state, id) {
    var list = stepsOf(state);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function planStepById(state, id) {
    var list = planStepsOf(state);
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function specOf(registry, step, planStep) {
    if (!registry || typeof registry.get !== 'function') return null;
    var tool = (step && (step.toolId || step.tool)) || (planStep && planStep.tool) || '';
    if (!tool) return null;
    try { return registry.get(tool); } catch (e) { return null; }
  }

  function skillInfo(skillLookup, step) {
    if (!skillLookup) return undefined;
    var id = (step && (step.skillId || step.skillVersionId)) || null;
    if (!id) return undefined;
    try {
      return typeof skillLookup === 'function' ? skillLookup(id, step.skillVersionId) : skillLookup[id];
    } catch (e) { return null; }
  }

  /* ---------------- 依赖校验 ---------------- */
  function checkDeps(state, add) {
    var plan = planStepsOf(state);
    if (!plan.length) return;
    var ids = {};
    plan.forEach(function (s) { ids[s.id] = 1; });
    var bad = false;
    plan.forEach(function (s) {
      (s.deps || []).forEach(function (d) {
        if (d === s.id) { bad = true; add('DEP_INVALID', '自依赖 ' + s.id); }
        else if (!ids[d]) { bad = true; add('DEP_INVALID', '缺失依赖 ' + s.id + '->' + d); }
      });
    });
    /* 三色 DFS 检测环 */
    var color = {};
    function visit(id) {
      if (color[id] === 1) { bad = true; add('DEP_INVALID', '依赖成环 ' + id); return; }
      if (color[id] === 2) return;
      color[id] = 1;
      var ps = planStepById(state, id);
      (ps && ps.deps || []).forEach(visit);
      color[id] = 2;
    }
    plan.forEach(function (s) { visit(s.id); });
    return !bad;
  }

  function checkEvents(state, cp, add) {
    var events = isArray(state.events) ? state.events : [];
    var max = 0;
    for (var i = 0; i < events.length; i++) {
      var e = events[i];
      if (i === 0 && e.seq !== 1) { add('EVENT_SEQ_GAP', '起始 seq=' + e.seq); break; }
      if (i > 0 && e.seq !== events[i - 1].seq + 1) {
        add('EVENT_SEQ_GAP', 'seq 断裂 ' + events[i - 1].seq + '->' + e.seq);
        break;
      }
      max = e.seq;
    }
    if (cp && num(cp.eventsUpToSeq) && cp.eventsUpToSeq > max) {
      add('CHECKPOINT_INVALID', 'eventsUpToSeq 超出事件范围');
    }
  }

  function checkCheckpoint(input, add) {
    var cp = input.checkpoint;
    var state = input.state;
    var record = input.record;
    var T = root.AstroTask;
    if (!cp) {
      /* 无检查点的历史任务仍允许恢复；由 control 决定兼容策略。 */
      return;
    }
    if (!isObj(cp)) { add('CHECKPOINT_INVALID', '检查点不是对象'); return; }
    if (typeof cp.checkpointId !== 'string' || !cp.checkpointId) add('CHECKPOINT_INVALID', '缺少 checkpointId');
    if (cp.taskId && record && cp.taskId !== record.id) add('CHECKPOINT_INVALID', 'taskId 不一致');
    if (cp.ownerProfileId && record && record.ownerProfileId && cp.ownerProfileId !== record.ownerProfileId) {
      add('CHECKPOINT_INVALID', 'ownerProfileId 不一致');
    }
    if (cp.projectId && state.projectId && cp.projectId !== state.projectId) {
      add('CHECKPOINT_INVALID', 'projectId 不一致');
    }
    if (typeof cp.stateHash !== 'string' || !cp.stateHash) add('CHECKPOINT_INVALID', '缺少 stateHash');
    else if (cp.snapshot && T && T.sha256Hex && T.canonicalJSON) {
      if (cp.stateHash !== T.sha256Hex(T.canonicalJSON(cp.snapshot))) {
        add('CHECKPOINT_INVALID', 'stateHash 复算不一致');
      }
    }
    var plan = planStepsOf(state);
    var planIds = plan.map(function (s) { return s.id; });
    var done = isArray(cp.completedStepIds) ? cp.completedStepIds : null;
    var pend = isArray(cp.pendingStepIds) ? cp.pendingStepIds : null;
    if (done && pend) {
      var overlap = done.filter(function (id) { return pend.indexOf(id) >= 0; });
      if (overlap.length) add('CHECKPOINT_INVALID', '完成/待办节点交集: ' + overlap.join(','));
      if (planIds.length) {
        var union = done.concat(pend);
        var missing = planIds.filter(function (id) { return union.indexOf(id) < 0; });
        if (missing.length) add('CHECKPOINT_INVALID', '计划节点未覆盖: ' + missing.join(','));
      }
    }
    (done || []).forEach(function (id) {
      var s = stepById(state, id);
      if (!s || s.status !== 'ok' || !s.outputHash) {
        add('CHECKPOINT_INVALID', '完成节点状态无效: ' + id);
      }
    });
    if (cp.planId && state.plan && state.plan.planId && cp.planId !== state.plan.planId) {
      add('PLAN_VERSION_MISMATCH', 'planId ' + cp.planId + ' != ' + state.plan.planId);
    }
    if (num(cp.planVersion) && state.plan && num(state.plan.version) &&
      cp.planVersion !== state.plan.version) {
      add('PLAN_VERSION_MISMATCH', 'planVersion ' + cp.planVersion + ' != ' + state.plan.version);
    }
  }

  function checkTools(input, add) {
    var state = input.state;
    var registry = input.registry;
    if (!registry || typeof registry.get !== 'function') return;
    planStepsOf(state).forEach(function (ps) {
      if (ps.kind === 'skill') return;
      if (!ps.tool) return;
      var spec = null;
      try { spec = registry.get(ps.tool); } catch (e) { spec = null; }
      if (!spec) add('TOOL_MISSING', ps.tool);
    });
  }

  function checkSkills(input, add) {
    if (!input.skillLookup) return;
    stepsOf(input.state).forEach(function (s) {
      if (!s.skillId && !s.skillVersionId) return;
      var info = skillInfo(input.skillLookup, s);
      if (info === undefined) return;
      if (!info || !info.published) { add('SKILL_REVOKED', s.skillId || s.skillVersionId); return; }
      if (s.skillVersionId && info.versionId && s.skillVersionId !== info.versionId) {
        add('SKILL_VERSION_MISMATCH', s.skillId + ' ' + s.skillVersionId);
      }
    });
  }

  /* ---------------- 17 项校验（按可用输入执行） ---------------- */
  function validate(input) {
    input = input || {};
    var T = root.AstroTask;
    var state = input.state;
    var record = input.record || null;
    var errors = [];
    function add(code, detail) { errors.push({ code: code, detail: detail || '' }); }

    if (!state || state.schemaVersion !== 1) {
      add('SCHEMA_INCOMPATIBLE', 'schemaVersion');
      return { ok: false, errors: errors };
    }

    /* 1-4 身份与能力 */
    if (input.enforcePrincipal) {
      var principal = input.principal;
      if (!principal) add('NO_PRINCIPAL', '缺少 principal');
      else if (record && record.ownerProfileId && principal.profileId &&
        principal.profileId !== record.ownerProfileId) {
        add('PROFILE_MISMATCH', 'profileId');
      }
      if (principal && root.Security && typeof root.Security.ensureSession === 'function') {
        try {
          if (!root.Security.ensureSession(principal).allowed) add('SESSION_CHANGED', 'session');
        } catch (e) { add('SESSION_CHANGED', 'session'); }
      }
      if (input.authorized && input.authorized.allowed === false) {
        add(input.authorized.reason || 'CAPABILITY_DENIED', 'resume');
      }
    }

    /* 5-6 项目 */
    if (input.project !== undefined) {
      var proj = input.project;
      if (!proj || proj.status === 'archived' || proj.status === 'deleted') {
        add('PROJECT_NOT_ACTIVE', proj ? proj.status : 'missing');
      }
    }
    if (record && record.projectId && state.projectId && record.projectId !== state.projectId) {
      add('PROJECT_MISMATCH', 'projectId');
    }

    /* 8 检查点完整性 */
    checkCheckpoint(input, add);

    /* 9-10 计划版本与依赖 */
    checkDeps(state, add);

    /* 11-13 Skill / Tool */
    checkSkills(input, add);
    checkTools(input, add);

    /* 9b 事件位点 */
    checkEvents(state, input.checkpoint, add);

    /* 15 终态只读 */
    if (T && T.isTerminal && T.isTerminal(state.phase)) add('VIEW_ONLY', state.phase);

    /* 16 恢复次数 */
    var limit = num(input.limit) ? input.limit
      : (state.budget && state.budget.limit && num(state.budget.limit.recoveries)
        ? state.budget.limit.recoveries : 0);
    var used = num(state.recoveries) ? state.recoveries
      : (state.budget && state.budget.used && num(state.budget.used.recoveries)
        ? state.budget.used.recoveries : 0);
    if (used >= limit) add('RECOVERY_LIMIT', used + '/' + limit);

    /* 17 预算是否还能推进至少一个待办步骤 */
    var pending = stepsOf(state).filter(function (s) {
      return s.status === 'pending' || s.status === 'running' ||
        s.status === 'paused' || s.status === 'waiting_approval';
    });
    if (pending.length && state.budget && state.budget.limit && state.budget.used) {
      var msLimit = state.budget.limit.ms;
      var msUsed = state.budget.used.ms;
      if (num(msLimit) && msLimit > 0 && num(msUsed) && msUsed >= msLimit) {
        add('BUDGET_EXHAUSTED', 'ms');
      }
    }

    return { ok: errors.length === 0, errors: errors };
  }

  /* ---------------- 策略推导 ---------------- */
  function decide(state, step, registry, now) {
    var T = root.AstroTask;
    var ps = planStepById(state, step.id);
    var status = step.status;

    if (status === 'ok') {
      var want = ps ? T.computeInputHash(ps.args || {}) : null;
      if (want && step.inputHash && want !== step.inputHash) {
        return { strategy: 'rerun', reason: 'input_changed' };
      }
      var spec = specOf(registry, step, ps);
      if (spec) {
        if (num(spec.ttlMs) && spec.ttlMs > 0) {
          var at = (step.provenance && step.provenance.at) || step.endedAt;
          var stamp = at ? Date.parse(at) : NaN;
          if (isFinite(stamp) && (now - stamp) <= spec.ttlMs) {
            return { strategy: 'reuse', reason: 'ttl_fresh' };
          }
          return { strategy: 'rerun', reason: 'ttl_expired' };
        }
        if (spec.idempotent === true) return { strategy: 'reuse', reason: 'idempotent' };
        if (spec.idempotent === false) return { strategy: 'rerun', reason: 'non_idempotent' };
      }
      /* 无幂等声明：不重跑已成功且输入未变的步骤，避免未知副作用。 */
      if (step.outputHash && step.result != null) {
        return { strategy: 'reuse', reason: 'unknown_idempotent_conservative_reuse' };
      }
      return { strategy: 'block', reason: 'unknown_idempotency' };
    }

    if (status === 'failed') {
      var err = step.error || {};
      var spec2 = specOf(registry, step, ps);
      var max = spec2 && spec2.retry && spec2.retry.allowed ? (spec2.retry.max || 0) : 0;
      if (err.retriable && step.attempt < max + 1) {
        return { strategy: 'rerun', reason: 'retriable' };
      }
      return { strategy: 'block', reason: 'not_retriable' };
    }

    if (status === 'running' || status === 'paused' || status === 'waiting_approval' ||
      status === 'pending' || status === 'ready') {
      return { strategy: 'rerun', reason: 'unfinished' };
    }

    return { strategy: 'block', reason: 'settled_' + status };
  }

  function plan(input) {
    input = input || {};
    var state = input.state;
    var registry = input.registry || null;
    var now = num(input.now) ? input.now : Date.now();
    var out = { steps: [], reusable: [], rerun: [], blocked: [] };
    stepsOf(state).forEach(function (s) {
      var d = decide(state, s, registry, now);
      out.steps.push({ id: s.id, strategy: d.strategy, reason: d.reason });
      if (d.strategy === 'reuse') out.reusable.push(s.id);
      else if (d.strategy === 'rerun') out.rerun.push(s.id);
      else out.blocked.push(s.id);
    });
    return out;
  }

  function resetForRerun(step) {
    step.status = 'pending';
    step.result = null;
    step.outputHash = null;
    step.error = null;
    step.cancelled = false;
    step.startedAt = null;
    step.endedAt = null;
    step.durationMs = null;
  }

  function apply(input) {
    input = input || {};
    var state = input.state;
    var registry = input.registry || null;
    var now = num(input.now) ? input.now : Date.now();
    var out = { state: state, applied: { reuse: [], rerun: [], blocked: [] } };
    stepsOf(state).forEach(function (s) {
      var d = decide(state, s, registry, now);
      if (d.strategy === 'reuse') {
        out.applied.reuse.push(s.id);
      } else if (d.strategy === 'rerun') {
        resetForRerun(s);
        out.applied.rerun.push(s.id);
      } else {
        out.applied.blocked.push(s.id);
      }
    });
    return out;
  }

  root.AstroRecovery = {
    validate: validate,
    plan: plan,
    apply: apply,
    decide: decide,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
