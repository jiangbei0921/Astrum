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
  function decisionOptions(state, opts) {
    opts = opts || {};
    return {
      profileId: opts.profileId || null,
      contextHash: opts.contextHash || null,
      authorized: opts.authorized || null,
      persisted: opts.persisted,
      skillVersionId: opts.skillVersionId || null
    };
  }

  /* 复用前的上下文校验：参数、工具版本、Skill 版本、执行上下文、Profile、
   * Principal 重新授权、结果持久化。缺省输入（旧任务）不误报。 */
  function validateReuseContext(step, spec, opts) {
    opts = opts || {};
    if (!step || step.result == null || step.result.ok === false) {
      return { ok: false, reason: 'result_incomplete' };
    }
    var prov = step.provenance || {};
    if (spec && spec.version && prov.version && prov.version !== spec.version) {
      return { ok: false, reason: 'tool_version_changed' };
    }
    if (opts.skillVersionId && step.skillVersionId &&
      opts.skillVersionId !== step.skillVersionId) {
      return { ok: false, reason: 'skill_version_changed' };
    }
    if (opts.profileId && prov.profileId && opts.profileId !== prov.profileId) {
      return { ok: false, reason: 'profile_changed' };
    }
    if (opts.contextHash && prov.contextHash && opts.contextHash !== prov.contextHash) {
      return { ok: false, reason: 'context_changed' };
    }
    if (opts.authorized && opts.authorized.allowed === false) {
      return { ok: false, reason: 'authorization_revoked' };
    }
    if (opts.persisted === false) {
      return { ok: false, reason: 'result_not_persisted' };
    }
    return { ok: true };
  }

  /* 未知幂等性的凭证校验：结果哈希、工具/Skill 版本、上下文、Profile、授权、持久化。
   * 只有 64 位 SHA-256 记录才复算哈希，避免把历史短哈希记录误判为篡改。 */
  function validateFidelity(step, spec, opts) {
    var T = root.AstroTask;
    opts = opts || {};
    var ctx = validateReuseContext(step, spec, opts);
    if (!ctx.ok) {
      return { ok: false, reason: 'unknown_idempotency_' + ctx.reason };
    }
    if (typeof step.outputHash !== 'string' || !step.outputHash) {
      return { ok: false, reason: 'unknown_idempotency_unverified' };
    }
    var recomputed = null;
    try { recomputed = T.sha256Hex(T.canonicalJSON(step.result)); } catch (e) { recomputed = null; }
    if (!recomputed || recomputed !== step.outputHash) {
      return { ok: false, reason: 'unknown_idempotency_hash_mismatch' };
    }
    return { ok: true };
  }

  /* ASTRUM-004：非幂等且可能有外部副作用时，不自动重跑，进入人工确认。 */
  function confirmDecision(reason) {
    return { strategy: 'confirm', reason: reason, requiresConfirmation: true };
  }

  /* 外部调用回执：工具可在结果中返回 receipt / externalState，
   * 执行器写入 step.provenance；恢复时据此判断远端操作是否真的完成。 */
  function externalEvidence(step) {
    var prov = (step && step.provenance) || {};
    var result = (step && step.result) || {};
    var state = prov.externalState != null ? prov.externalState
      : (result.externalState != null ? result.externalState : result.remoteState);
    var receipt = prov.receipt != null ? prov.receipt
      : (result.receipt != null ? result.receipt : null);
    var normalized = typeof state === 'string' ? state.toLowerCase() : '';
    return {
      state: state == null ? null : state,
      receipt: receipt,
      confirmed: normalized === 'succeeded' || normalized === 'confirmed' || normalized === 'ok',
      failed: normalized === 'failed' || normalized === 'cancelled' || normalized === 'rejected'
    };
  }

  function decide(state, step, registry, now, opts) {
    opts = opts || {};
    var T = root.AstroTask;
    var ps = planStepById(state, step.id);
    var status = step.status;
    var cOpts = decisionOptions(state, opts);

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
          if (!(isFinite(stamp) && (now - stamp) <= spec.ttlMs)) {
            return { strategy: 'rerun', reason: 'ttl_expired' };
          }
        }
        if (spec.idempotent === true) {
          var idemCtx = validateReuseContext(step, spec, cOpts);
          if (idemCtx.ok) {
            if (spec.sideEffect === true && externalEvidence(step).failed) {
              return confirmDecision('external_failed_unverified');
            }
            return { strategy: 'reuse', reason: num(spec.ttlMs) && spec.ttlMs > 0 ? 'ttl_fresh' : 'idempotent' };
          }
          /* 明确幂等但上下文已变化：参数/版本/上下文变化可安全重跑；
           * 授权撤销或未持久化必须进入人工确认，不能悄悄复用。 */
          if (idemCtx.reason === 'authorization_revoked' || idemCtx.reason === 'result_not_persisted') {
            return confirmDecision(idemCtx.reason);
          }
          return { strategy: 'rerun', reason: idemCtx.reason };
        }
        if (spec.idempotent === false) {
          /* sideEffect=false 的只读/可重算工具允许重跑；有副作用或未声明时必须确认。 */
          if (spec.sideEffect === false) return { strategy: 'rerun', reason: 'non_idempotent' };
          var ext = externalEvidence(step);
          /* 远端已明确成功且本地上下文一致：复用结果，避免重复副作用。
           * 远端明确失败：允许重跑。其余未知：人工确认。 */
          if (ext.confirmed) {
            var extCtx = validateReuseContext(step, spec, cOpts);
            if (extCtx.ok) return { strategy: 'reuse', reason: 'external_confirmed' };
            return confirmDecision('external_' + extCtx.reason);
          }
          if (ext.failed) return { strategy: 'rerun', reason: 'external_failed' };
          return confirmDecision('non_idempotent_requires_confirmation');
        }
      }
      /* 无幂等声明：必须先校验执行凭证，再决定复用。
       * 校验放在 decide() 内，确保外部直接调用也不会盲目复用。 */
      var fidelity = validateFidelity(step, spec, cOpts);
      if (fidelity.ok) {
        if (spec && spec.sideEffect === true) {
          var unknownExt = externalEvidence(step);
          if (unknownExt.failed) return confirmDecision('external_failed_unverified');
          if (!unknownExt.confirmed && unknownExt.receipt == null) {
            return confirmDecision('external_receipt_unverified');
          }
        }
        return { strategy: 'reuse', reason: 'unknown_idempotent_verified' };
      }
      return confirmDecision(fidelity.reason);
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

    /* 已进入恢复人工确认的步骤必须保持确认态，不能因重复恢复被翻回重跑。 */
    if (status === 'waiting_approval' && step.error &&
      step.error.kind === 'recovery_confirmation_required') {
      return confirmDecision(step.error.message || 'recovery_confirmation_required');
    }

    if (status === 'running' || status === 'paused' || status === 'waiting_approval' ||
      status === 'pending' || status === 'ready') {
      /* 外部副作用步骤已开始但本地无结果：可能已发生，必须人工核验。
       * 明确幂等且无副作用声明的工具可安全重跑。 */
      var spec3 = specOf(registry, step, ps);
      var maybeSideEffect = spec3 && (spec3.sideEffect === true ||
        (spec3.sideEffect !== false && spec3.idempotent !== true));
      if (maybeSideEffect && step.attempt > 0) {
        return confirmDecision('side_effect_state_unknown');
      }
      return { strategy: 'rerun', reason: 'unfinished' };
    }

    return { strategy: 'block', reason: 'settled_' + status };
  }

  function plan(input) {
    input = input || {};
    var state = input.state;
    var registry = input.registry || null;
    var now = num(input.now) ? input.now : Date.now();
    var out = { steps: [], reusable: [], rerun: [], blocked: [], confirm: [] };
    stepsOf(state).forEach(function (s) {
      var d = decide(state, s, registry, now, input);
      out.steps.push({ id: s.id, strategy: d.strategy, reason: d.reason });
      if (d.strategy === 'reuse') out.reusable.push(s.id);
      else if (d.strategy === 'rerun') out.rerun.push(s.id);
      else if (d.strategy === 'confirm') out.confirm.push(s.id);
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
    var out = { state: state, applied: { reuse: [], rerun: [], blocked: [], confirm: [] } };
    stepsOf(state).forEach(function (s) {
      var d = decide(state, s, registry, now, input);
      if (d.strategy === 'reuse') {
        out.applied.reuse.push(s.id);
      } else if (d.strategy === 'rerun') {
        resetForRerun(s);
        out.applied.rerun.push(s.id);
      } else if (d.strategy === 'confirm') {
        /* 不重跑、不复用：进入等待人工确认状态，阻止任务被误判为完成。 */
        s.status = 'waiting_approval';
        s.error = {
          kind: 'recovery_confirmation_required',
          message: d.reason,
          retriable: false
        };
        out.applied.confirm.push(s.id);
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
    /* 供 Resume 显式 opt-in：默认未知幂等性阻塞。 */
    canReuseUnknown: function (input) {
      return !!(input && input.reuseUnknown === true);
    },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
