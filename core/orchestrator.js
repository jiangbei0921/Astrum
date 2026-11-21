/* ASTRUM · Scheduler + Runner（B4/B5 + C1/C2/C3）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §4.3/§6
 *       docs/architecture/03-目标架构设计.md §3.4（R2-05 三件套）
 *
 * Scheduler：拓扑分批、就绪/阻塞判定、compose 串行约束、取消停止。
 * Runner：单步执行、超时、错误分类、幂等工具最多重试 1 次、统一 StepResult、
 *         取消传播、TaskState 更新、失败隔离。
 * 不实现 Reducer，不实现事件总线。
 */
(function (root) {
  'use strict';

  function findStep(plan, id) {
    for (var i = 0; i < plan.steps.length; i++) {
      if (plan.steps[i].id === id) return plan.steps[i];
    }
    return null;
  }

  function stateStep(state, id) {
    for (var i = 0; i < state.steps.length; i++) {
      if (state.steps[i].id === id) return state.steps[i];
    }
    return null;
  }

  function isCompose(step) {
    return typeof step.tool === 'string' && step.tool.indexOf('compose.') === 0;
  }

  function isSettled(status) {
    return ['ok', 'failed', 'skipped', 'blocked', 'aborted'].indexOf(status) >= 0;
  }

  function readySteps(plan, state) {
    var out = [], i, j;
    for (i = 0; i < plan.steps.length; i++) {
      var ps = plan.steps[i];
      var ss = stateStep(state, ps.id);
      if (!ss || ss.status !== 'pending') continue;
      var ready = true;
      for (j = 0; j < (ps.deps || []).length; j++) {
        var dep = stateStep(state, ps.deps[j]);
        if (dep && dep.status === 'ok') continue;
        /* optional 依赖失败不阻塞下游；缺失依赖仍视为未就绪 */
        var dp = findStep(plan, ps.deps[j]);
        if (dp && dp.optional === true && dep && isSettled(dep.status)) continue;
        ready = false;
        break;
      }
      if (ready) out.push(ps);
    }
    return out;
  }

  function blockedSteps(plan, state) {
    var out = [], i, j;
    var bad = ['failed', 'blocked', 'aborted', 'skipped'];
    for (i = 0; i < plan.steps.length; i++) {
      var ps = plan.steps[i];
      var ss = stateStep(state, ps.id);
      if (!ss || ss.status !== 'pending') continue;
      for (j = 0; j < (ps.deps || []).length; j++) {
        var dep = stateStep(state, ps.deps[j]);
        if (!dep || bad.indexOf(dep.status) < 0) continue;
        var dp = findStep(plan, ps.deps[j]);
        if (dp && dp.optional === true) continue;
        out.push(ps);
        break;
      }
    }
    return out;
  }

  function criticalFailed(plan, state) {
    for (var i = 0; i < plan.steps.length; i++) {
      var ps = plan.steps[i];
      var ss = stateStep(state, ps.id);
      if (ps.critical && ss && ss.status === 'failed') return true;
    }
    return false;
  }

  function allSettled(plan, state) {
    for (var i = 0; i < plan.steps.length; i++) {
      var ss = stateStep(state, plan.steps[i].id);
      if (!ss || !isSettled(ss.status)) return false;
    }
    return true;
  }

  /* 下一批：compose 与串行步骤单独成批；仅取数层 parallel 步骤可同批。 */
  function nextBatch(plan, state, limitParallel) {
    var ready = readySteps(plan, state);
    if (!ready.length) return null;

    var first = ready[0];
    if (isCompose(first) || first.parallel !== true) {
      return { steps: [first], parallel: false };
    }

    var max = Math.max(1, Math.min(4, limitParallel || 4));
    var batch = [];
    for (var i = 0; i < ready.length && batch.length < max; i++) {
      if (isCompose(ready[i]) || ready[i].parallel !== true) continue;
      /* P3：并行副作用过滤——写共享证据/输出合成与非幂等工具不得同批。 */
      if (hasBatchConflict(batch, ready[i])) continue;
      batch.push(ready[i]);
    }
    return { steps: batch, parallel: batch.length > 1 };
  }

  function hasBatchConflict(batch, candidate) {
    if (!batch || !batch.length) return false;
    var V = root.AstroDagValidator;
    if (V && typeof V.parallelConflicts === 'function') {
      return V.parallelConflicts(batch.concat([candidate]), null).length > 0;
    }
    /* 兜底：输出合成步骤本身已串行（isCompose），此处只拦同批重复写证据。 */
    var write = function (s) {
      return s && (s.tool === 'evidence.search' || s.tool === 'paper.search');
    };
    if (!write(candidate)) return false;
    for (var i = 0; i < batch.length; i++) if (write(batch[i])) return true;
    return false;
  }

  function waitingApprovalStep(plan, state) {
    for (var i = 0; i < plan.steps.length; i++) {
      var ss = stateStep(state, plan.steps[i].id);
      if (ss && ss.status === 'waiting_approval') return plan.steps[i].id;
    }
    return null;
  }

  /* 工具域 → 专业执行角色（P0：编排主体按域委托，不直接把全部工具权授予 Muse） */
  var TOOL_AGENT = {
    'kepler.ephemeris': 'kepler',
    'kepler.visibility': 'kepler',
    'kb.lookup': 'curator',
    'fits.parse': 'curator',
    'compare.curate': 'curator',
    'evidence.search': 'scholar',
    'paper.search': 'scholar',
    'simbad.tap': 'scholar',
    'llm.compose': 'muse',
    'compose.target': 'muse',
    'compose.domain': 'muse',
    'compose.simple': 'muse'
  };

  function nowIso() { return new Date().toISOString(); }

  /* 取消原因必须可区分：超时、浏览器/网络 AbortError、用户取消、暂停请求、上游取消。
   * signal.reason 由调用方 abort(reason) 传入；旧调用方不传时退化为 upstream。 */
  function abortReason(signal) {
    var r = signal && signal.reason;
    if (r === 'pause' || (r && r.code === 'PAUSE_REQUESTED')) return 'pause';
    if (r === 'user' || r === 'cancel' || (r && r.code === 'USER_CANCELLED')) return 'user_cancelled';
    if (r && r.code === 'UPSTREAM_ABORTED') return 'upstream_aborted';
    if (r && r.code === 'TOOL_ABORTED') return 'tool_aborted';
    return 'upstream_aborted';
  }

  function cancelledResult(signal) {
    var reason = abortReason(signal);
    var pause = reason === 'pause';
    return {
      ok: false,
      reason: reason,
      kind: pause ? 'pause' : (reason === 'user_cancelled' ? 'user_cancelled' : 'cancelled'),
      errorName: pause ? 'PauseRequested' : (reason === 'user_cancelled' ? 'UserCancelled' : 'AbortError'),
      /* 稳定分类码，供 UI/测试区分取消来源；errorName 保持既有契约。 */
      abortCode: pause ? 'PAUSE_REQUESTED'
        : (reason === 'user_cancelled' ? 'USER_CANCELLED'
          : (reason === 'tool_aborted' ? 'TOOL_ABORTED' : 'UPSTREAM_ABORTED')),
      retriable: false,
      pendingAbort: true,
      pause: pause
    };
  }

  /* V2-B：withTimeout 不只返回错误，还记录三件事：
   *   abort_requested  是否请求了取消
   *   abort_supported  该工具是否声明支持 AbortSignal
   *   abort_confirmed  本次尝试的控制器是否真的进入 aborted
   * 不支持取消的工具不得伪造 confirmed=true。 */
  function withTimeout(fn, ms, signal, opts) {
    opts = opts || {};
    var abortable = opts.abortable !== false;
    return new Promise(function (resolve) {
      var done = false;
      var timer = null;
      var onAbort = null;
      var ctl = typeof AbortController === 'function' ? new AbortController() : null;
      var attemptSignal = ctl ? ctl.signal : signal;
      function finish(v) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        resolve(v);
      }
      /* 超时/取消时先 abort 本次尝试的下游请求，再返回结果；
       * 不能只忽略 Promise —— 否则工具仍会继续消耗配额或产生副作用。 */
      var deferredAbort = null;
      function abortNow(v, waitForSettle) {
        var confirmed = false;
        if (ctl && !ctl.signal.aborted) {
          try { ctl.abort(); confirmed = !!ctl.signal.aborted; } catch (e) { /* ignore */ }
        } else if (ctl && ctl.signal.aborted) {
          confirmed = true;
        }
        v.abortRequested = true;
        v.abortSupported = abortable;
        v.abortConfirmed = abortable && confirmed;
        /* 不支持取消的工具：暂停/用户取消时继续等待其自然到达安全边界，
         * 不提前把任务标记为已暂停/已取消。超时仍按硬边界返回。 */
        if (!abortable && waitForSettle && v.kind !== 'timeout') {
          deferredAbort = v;
          return;
        }
        finish(v);
      }
      if (signal && signal.aborted) {
        var early = cancelledResult(signal);
        early.abortRequested = true;
        early.abortSupported = abortable;
        early.abortConfirmed = false;
        finish(early);
        return;
      }
      if (signal && signal.addEventListener) {
        onAbort = function () { abortNow(cancelledResult(signal), true); };
        signal.addEventListener('abort', onAbort);
      }
      timer = setTimeout(function () {
        abortNow({
          ok: false, reason: 'timeout', kind: 'timeout',
          errorName: 'TimeoutError',
          abortCode: abortable ? 'TIMEOUT' : 'ABORT_UNSUPPORTED',
          retriable: true
        });
      }, Math.max(1, ms || 500));
      var call;
      try { call = fn(attemptSignal); } catch (e) { call = Promise.reject(e); }
      Promise.resolve(call).then(function (r) {
        if (deferredAbort && r && r.ok === false) {
          r.abortRequested = true;
          r.abortSupported = false;
          r.abortConfirmed = false;
        }
        finish(r);
      }, function (e) {
        finish({
          ok: false,
          reason: e && e.message ? e.message : String(e),
          retriable: true
        });
      });
    });
  }

  function normalizeResult(r) {
    if (r && typeof r === 'object' && r.ok === false) {
      return {
        ok: false,
        reason: r.reason || r.message || 'tool_failed',
        kind: r.kind || r.errorKind || null,
        errorName: r.errorName || null,
        retriable: r.retriable !== false,
        pendingAbort: !!r.pendingAbort,
        pause: !!r.pause,
        abortCode: r.abortCode || null,
        abortRequested: !!r.abortRequested,
        abortSupported: r.abortSupported !== false,
        abortConfirmed: !!r.abortConfirmed
      };
    }
    return { ok: true, result: r };
  }

  /* C3：错误分类。未知错误按 tool_error 处理，只有明确可恢复类才允许重试。 */
  function classifyFailure(raw) {
    if (!raw) return { kind: 'tool_error', retriable: false, message: 'unknown' };
    var reason = String(raw.reason || raw.message || 'unknown');
    var kind = raw.kind || null;
    if (!kind) {
      if (reason === 'timeout') kind = 'timeout';
      else if (reason === 'cancelled') kind = 'cancelled';
      else if (reason === 'rate_limit' || /429|限流/.test(reason)) kind = 'rate_limit';
      else if (/network|cors|csp|fetch|networkerror/i.test(reason)) kind = 'network';
      else if (/parse|json|unexpected token/i.test(reason)) kind = 'parse';
      else if (/not-found|empty|no result/i.test(reason)) kind = 'empty';
      else kind = 'tool_error';
    }
    var retriableKinds = ['timeout', 'network', 'rate_limit'];
    var retriable = raw.retriable !== false && retriableKinds.indexOf(kind) >= 0;
    return {
      kind: kind, retriable: retriable, message: reason,
      pendingAbort: !!raw.pendingAbort, errorName: raw.errorName || null,
      pause: !!raw.pause, reason: raw.reason || reason,
      abortCode: raw.abortCode || null,
      abortRequested: !!raw.abortRequested,
      abortSupported: raw.abortSupported !== false,
      abortConfirmed: !!raw.abortConfirmed
    };
  }

  function retryPolicy(spec) {
    var r = spec && spec.retry ? spec.retry : null;
    var idempotent = !!(spec && spec.idempotent === true);
    if (!idempotent || (r && r.allowed === false)) return { allowed: false, max: 0 };
    var max = r && typeof r.max === 'number' ? r.max : 1;
    return { allowed: true, max: Math.min(1, Math.max(0, max)) };
  }

  function costOf(spec) {
    var c = spec && spec.cost ? spec.cost : {};
    return {
      ms: typeof c.ms === 'number' ? c.ms : 0,
      tokens: typeof c.tokens === 'number' ? c.tokens : 0,
      searches: typeof c.searches === 'number' ? c.searches : 0
    };
  }

  function evRefs(result) {
    if (!result) return [];
    if (Array.isArray(result.evidenceIds)) return result.evidenceIds.slice();
    if (Array.isArray(result.items)) {
      return result.items.map(function (x) { return x && x.evidenceId; }).filter(Boolean);
    }
    return [];
  }

  function durationOf(startedAt, endedAt) {
    var a = Date.parse(startedAt), b = Date.parse(endedAt);
    return (isFinite(a) && isFinite(b)) ? Math.max(0, b - a) : 0;
  }

  function setFailure(step, kind, message, retriable) {
    step.status = 'failed';
    step.error = { kind: kind, message: message, retriable: !!retriable };
  }

  /* P2：kind='skill' 步骤走 SkillRuntime；既有工具步骤路径完全不变。 */
  async function executeSkillStep(planStep, state, opts, step, T) {
    var signal = opts.signal || null;
    if (signal && signal.aborted && abortReason(signal) === 'pause') {
      T.appendEvent(state, 'step.paused', { reason: 'pause' }, planStep.id);
      return { ok: false, paused: true, pause: true, critical: !!planStep.critical, reason: 'pause', kind: 'pause' };
    }
    if (signal && signal.aborted) {
      step.status = 'aborted';
      step.cancelled = true;
      step.endedAt = nowIso();
      step.error = { kind: 'cancelled', message: '任务已取消', retriable: false };
      T.appendEvent(state, 'step.cancelled', { reason: 'cancelled' }, planStep.id);
      return { ok: false, aborted: true, critical: !!planStep.critical, reason: 'cancelled' };
    }
    step.status = 'running';
    step.toolId = 'skill:' + planStep.skillId;
    step.startedAt = nowIso();
    step.endedAt = null;
    step.durationMs = null;
    T.appendEvent(state, 'step.started', {}, planStep.id);

    var rt = root.AstroSkillRuntime;
    var store = opts.skillStore || null;
    if (!store && root.AstroSkillStore) {
      try { store = root.AstroSkillStore.create({ projectId: state.projectId || null }); } catch (e) { store = null; }
    }
    if (!rt || !store) {
      step.endedAt = nowIso();
      step.durationMs = durationOf(step.startedAt, step.endedAt);
      setFailure(step, 'skill_module_missing', 'SkillRuntime/Store 未加载', false);
      T.appendEvent(state, 'step.failed', { reason: 'skill_module_missing' }, planStep.id);
      return { ok: false, critical: !!planStep.critical, reason: 'skill_module_missing' };
    }

    var exec = await rt.execute(planStep.skillId, planStep.args || {}, {
      store: store,
      principal: opts.principal || null,
      projectId: state.projectId || null,
      taskId: state.id,
      registry: opts.registry,
      signal: signal,
      fixtures: opts.fixtures || null,
      traceId: state.id
    });

    step.endedAt = nowIso();
    step.durationMs = durationOf(step.startedAt, step.endedAt);
    if (exec.status === 'ok') {
      step.status = 'ok';
      step.result = exec;
      step.outputHash = exec.outputHash || null;
      step.provenance = {
        tool: 'skill:' + planStep.skillId,
        version: 'skill',
        at: step.endedAt,
        executionId: exec.executionId || null,
        idempotencyKey: T.sha256Hex([
          state.id, planStep.id, 'skill', planStep.skillId || '',
          exec.versionId || planStep.skillVersionId || '', step.inputHash || ''
        ].join('|')),
        skillId: planStep.skillId || null,
        skillVersionId: exec.versionId || planStep.skillVersionId || null,
        profileId: exec.profileId || (opts.principal && opts.principal.profileId) || null,
        contextHash: state.context ? T.computeInputHash(state.context) : null
      };
      if (exec.receipt != null) step.provenance.receipt = exec.receipt;
      if (exec.externalState != null) step.provenance.externalState = exec.externalState;
      step.evidenceRefs = [];
      T.appendEvent(state, 'step.ok', { reason: 'skill' }, planStep.id);
      return { ok: true, result: exec, evidenceRefs: [] };
    }
    if (exec.status === 'cancelled') {
      if (signal && abortReason(signal) === 'pause') {
        step.status = 'pending';
        step.error = null;
        step.cancelled = false;
        T.appendEvent(state, 'step.paused', { reason: 'pause' }, planStep.id);
        return { ok: false, paused: true, pause: true, critical: !!planStep.critical, reason: 'pause', kind: 'pause' };
      }
      step.status = 'aborted';
      step.cancelled = true;
      step.error = { kind: 'cancelled', message: '任务已取消', retriable: false };
      T.appendEvent(state, 'step.cancelled', { reason: 'cancelled' }, planStep.id);
      return { ok: false, aborted: true, critical: !!planStep.critical, reason: 'cancelled' };
    }
    step.status = 'failed';
    step.error = {
      kind: exec.failureCategory || 'skill_failed',
      message: exec.failureReason || 'skill failed',
      retriable: false
    };
    T.appendEvent(state, 'step.failed', { reason: step.error.kind }, planStep.id);
    return { ok: false, critical: !!planStep.critical, reason: step.error.message, kind: step.error.kind };
  }

  async function executeOne(planStep, state, opts) {
    var T = root.AstroTask;
    var step = stateStep(state, planStep.id);
    if (planStep && planStep.kind === 'skill') {
      return executeSkillStep(planStep, state, opts, step, T);
    }
    var spec = opts.registry ? opts.registry.get(planStep.tool) : null;
    var signal = opts.signal || null;

    if (signal && signal.aborted && abortReason(signal) === 'pause') {
      step.abort = { requested: true, supported: true, confirmed: false, code: 'PAUSE_REQUESTED' };
      T.appendEvent(state, 'step.paused', { reason: 'pause' }, planStep.id);
      return { ok: false, paused: true, critical: !!planStep.critical, reason: 'pause', kind: 'pause' };
    }
    if (signal && signal.aborted) {
      var earlyTool = cancelledResult(signal);
      step.abort = {
        requested: true, supported: true, confirmed: false,
        code: earlyTool.abortCode, reason: earlyTool.reason
      };
      step.status = 'aborted';
      step.cancelled = true;
      step.endedAt = nowIso();
      step.error = {
        kind: earlyTool.kind, message: '任务已取消', retriable: false,
        errorName: earlyTool.errorName, reason: earlyTool.reason, pendingAbort: true,
        abortCode: earlyTool.abortCode
      };
      T.appendEvent(state, 'step.cancelled', { reason: earlyTool.reason }, planStep.id);
      return { ok: false, aborted: true, critical: !!planStep.critical, reason: earlyTool.reason, kind: earlyTool.kind };
    }

    step.status = 'running';
    step.toolId = planStep.tool;
    step.startedAt = nowIso();
    step.endedAt = null;
    step.durationMs = null;
    T.appendEvent(state, 'step.started', {}, planStep.id);

    if (!spec) {
      step.endedAt = nowIso();
      step.durationMs = durationOf(step.startedAt, step.endedAt);
      setFailure(step, 'tool_missing', planStep.tool, false);
      T.appendEvent(state, 'step.failed', { reason: 'tool_missing' }, planStep.id);
      return { ok: false, critical: !!planStep.critical, reason: 'tool_missing' };
    }

    var argsCheck = opts.registry.validateArgs ? opts.registry.validateArgs(planStep.tool, planStep.args || {}) : { ok: true };
    if (!argsCheck.ok) {
      step.endedAt = nowIso();
      step.durationMs = durationOf(step.startedAt, step.endedAt);
      setFailure(step, 'args_invalid',
        argsCheck.errors.map(function (e) { return e.path + ' ' + e.reason; }).join('; '), false);
      T.appendEvent(state, 'step.failed', { reason: 'args_invalid' }, planStep.id);
      return { ok: false, critical: !!planStep.critical, reason: 'args_invalid' };
    }

    var depCheck = opts.registry.checkDeps ? opts.registry.checkDeps(planStep.tool) : { ok: true };
    if (!depCheck.ok) {
      step.endedAt = nowIso();
      step.durationMs = durationOf(step.startedAt, step.endedAt);
      setFailure(step, 'deps_missing', depCheck.reason, false);
      T.appendEvent(state, 'step.failed', { reason: 'deps_missing' }, planStep.id);
      return { ok: false, critical: !!planStep.critical, reason: 'deps_missing' };
    }

    var cost = costOf(spec);
    if (!T.canAfford(state.budget, cost)) {
      step.status = 'skipped';
      step.endedAt = nowIso();
      step.durationMs = durationOf(step.startedAt, step.endedAt);
      step.error = { kind: 'budget', message: 'budget exhausted', retriable: false };
      T.appendEvent(state, 'step.skipped', { reason: 'budget' }, planStep.id);
      return { ok: false, budget: true, critical: !!planStep.critical, reason: 'budget' };
    }

    /* B8：只传递依赖中已成功的 StepResult，失败/缺失结果不进入下游。 */
    var depResults = {};
    (planStep.deps || []).forEach(function (id) {
      var dep = stateStep(state, id);
      if (dep && dep.status === 'ok' && dep.result) depResults[id] = dep.result;
    });

    var policy = retryPolicy(spec);
    var maxAttempts = 1 + (policy.allowed ? policy.max : 0);
    var attempts = 0;
    var last = null;
    var lastKind = 'tool_error';
    /* ASTRUM-004：外部副作用调用必须可追踪且可跨重试复用。
     * idempotencyKey 只由任务/步骤/工具/版本/输入决定，重试与恢复保持不变；
     * executionId 每次尝试唯一，用于审计与外部回执关联。 */
    var idempotencyKey = T.sha256Hex([
      state.id, planStep.id, spec.id, spec.version || '', step.inputHash || ''
    ].join('|'));
    var lastExecutionId = null;

    while (attempts < maxAttempts) {
      attempts += 1;
      step.attempt += 1;
      var executionId = state.id + ':' + planStep.id + ':' + attempts + ':' +
        (step.startedAt || '') + ':' + idempotencyKey.slice(0, 12);
      lastExecutionId = executionId;
      if (signal && signal.aborted) {
        last = cancelledResult(signal);
        lastKind = last.kind;
        break;
      }
      if (!T.canAfford(state.budget, cost)) break;

      var raw = await withTimeout(function (attemptSignal) {
        /* attemptSignal 同时受任务外部 signal 与本次尝试超时控制。 */
        /* P0：有可信身份时统一走 ToolGateway；Node 旧测试无 principal，保持原路径。
         * 编排主体（Muse）按工具域委托给专业角色，能力不扩权。 */
        if (root.ToolGateway && opts.principal) {
          var execPrincipal = opts.principal;
          if (root.Security && root.Security.delegate) {
            var specialist = TOOL_AGENT[planStep.tool];
            if (specialist) {
              execPrincipal = root.Security.delegate(opts.principal, specialist,
                opts.principal.projectId) || opts.principal;
            }
          }
          return root.ToolGateway.invoke(execPrincipal, planStep.tool, planStep.args || {}, {
            registry: opts.registry, ctx: opts.ctx, cfg: opts.cfg,
            depResults: depResults, signal: attemptSignal || signal, taskId: state.id, attempt: attempts,
            executionId: executionId, idempotencyKey: idempotencyKey
          });
        }
        return spec.run(planStep.args || {}, opts.ctx, spec, opts.cfg, depResults, {
          signal: attemptSignal || signal, taskId: state.id, attempt: attempts,
          executionId: executionId, idempotencyKey: idempotencyKey
        });
      }, spec.timeoutMs, signal, { abortable: spec.abortable !== false });
      var normalized = normalizeResult(raw);
      /* 仅失败/中止的尝试写入 abort 记录；成功步骤不被误标记为取消。 */
      if (raw && raw.ok === false && raw.abortRequested) {
        step.abort = {
          requested: !!raw.abortRequested,
          supported: raw.abortSupported !== false,
          confirmed: !!raw.abortConfirmed,
          code: raw.abortCode || null,
          reason: raw.reason || null
        };
      }
      T.spend(state.budget, cost);

      if (normalized.ok) {
        last = normalized;
        break;
      }
      var cls = classifyFailure(normalized);
      last = cls;
      lastKind = cls.kind;
      if (cls.pendingAbort || cls.kind === 'cancelled') break;
      if (!policy.allowed || !cls.retriable || attempts >= maxAttempts) break;

      T.appendEvent(state, 'step.retry', { reason: cls.kind, attempt: attempts + 1 }, planStep.id);
      state.trace.push({ agent: 'runner', action: 'retry', detail: planStep.tool, ms: 0 });
    }

    step.endedAt = nowIso();
    step.durationMs = durationOf(step.startedAt, step.endedAt);

    if (last && last.ok) {
      step.status = 'ok';
      step.outputHash = T.sha256Hex(T.canonicalJSON(last.result));
      step.result = last.result;
      step.provenance = Object.assign({}, (last.result && last.result.provenance) || {});
      if (!step.provenance.tool) step.provenance.tool = spec.id;
      if (!step.provenance.version) step.provenance.version = spec.version || '';
      if (!step.provenance.at) step.provenance.at = step.endedAt;
      /* V2-B：恢复时校验执行上下文与 Profile；缺失时保持旧记录可读。 */
      if (opts.principal && opts.principal.profileId) {
        step.provenance.profileId = opts.principal.profileId;
      }
      if (state.context) {
        step.provenance.contextHash = T.computeInputHash(state.context);
      }
      /* ASTRUM-004：持久化外部调用追踪信息与工具回执，恢复时不得仅凭本地成功复用。 */
      step.provenance.executionId = lastExecutionId;
      step.provenance.idempotencyKey = idempotencyKey;
      var resultMeta = last.result || {};
      if (resultMeta.receipt != null) step.provenance.receipt = resultMeta.receipt;
      if (resultMeta.externalState != null) step.provenance.externalState = resultMeta.externalState;
      if (resultMeta.remoteState != null && step.provenance.externalState == null) {
        step.provenance.externalState = resultMeta.remoteState;
      }
      step.evidenceRefs = evRefs(last.result);
      T.appendEvent(state, 'step.ok', {}, planStep.id);
      return { ok: true, result: last.result, evidenceRefs: step.evidenceRefs };
    }

    /* B2：暂停不是失败。在飞步骤回到 pending，恢复时重新调度。 */
    if (last && last.pause) {
      step.status = 'pending';
      step.startedAt = null;
      step.endedAt = null;
      step.error = null;
      step.cancelled = false;
      step.abort = {
        requested: true, supported: last.abortSupported !== false,
        confirmed: !!last.abortConfirmed, code: 'PAUSE_REQUESTED', reason: 'pause'
      };
      T.appendEvent(state, 'step.paused', { reason: 'pause' }, planStep.id);
      return { ok: false, paused: true, pause: true, critical: !!planStep.critical, reason: 'pause', kind: 'pause' };
    }
    if (lastKind === 'cancelled' || lastKind === 'user_cancelled' ||
      (last && last.pendingAbort)) {
      var why = (last && last.reason) || 'cancelled';
      var isPause = !!(last && last.pause);
      step.status = 'aborted';
      step.cancelled = true;
      step.error = {
        kind: (last && last.kind) || 'cancelled',
        message: isPause ? '任务已暂停（在飞请求已中止）' : '任务已取消（在飞请求已中止）',
        retriable: false,
        pendingAbort: true,
        errorName: (last && last.errorName) || 'AbortError',
        abortCode: (last && last.abortCode) || (isPause ? 'PAUSE_REQUESTED' : 'TOOL_ABORTED'),
        reason: why
      };
      T.appendEvent(state, 'step.cancelled', { reason: why }, planStep.id);
      return {
        ok: false, aborted: true, critical: !!planStep.critical,
        reason: why, kind: step.error.kind, pause: isPause
      };
    }

    step.status = 'failed';
    step.error = {
      kind: lastKind,
      message: last ? last.message || last.reason : 'unknown',
      retriable: !!(last && last.retriable),
      errorName: (last && last.errorName) || null,
      abortCode: (last && last.abortCode) || null,
      reason: (last && last.reason) || null
    };
    T.appendEvent(state, 'step.failed', { reason: step.error.kind }, planStep.id);
    return { ok: false, critical: !!planStep.critical, reason: step.error.message, kind: step.error.kind };
  }

  async function runBatch(batch, state, opts) {
    var results;
    if (batch.parallel) {
      results = await Promise.all(batch.steps.map(function (s) { return executeOne(s, state, opts); }));
    } else {
      results = [await executeOne(batch.steps[0], state, opts)];
    }
    return results;
  }

  function abortPending(plan, state, T, reason) {
    var count = 0;
    (plan.steps || []).forEach(function (ps) {
      var ss = stateStep(state, ps.id);
      if (ss && ss.status === 'pending') {
        ss.status = 'aborted';
        ss.cancelled = true;
        ss.endedAt = nowIso();
        ss.error = { kind: 'cancelled', message: reason || '任务已取消', retriable: false };
        T.appendEvent(state, 'step.cancelled', { reason: 'cancelled' }, ps.id);
        count += 1;
      }
    });
    return count;
  }

  async function runPlan(plan, state, opts) {
    opts = opts || {};
    var T = root.AstroTask;
    var signal = opts.signal || null;
    var guard = 0;
    var answer = null;
    var budgetStop = false;

    /* P1：若 UI 注册了召回 Promise，先等它落定（最多 3 秒）再读取 current()。
     * wait 内部自带超时与异常兜底，不会阻塞执行。 */
    if (root.AstroResearchContext && typeof root.AstroResearchContext.wait === 'function') {
      try { await root.AstroResearchContext.wait(3000); } catch (e) { /* 召回失败不阻断 */ }
    }
    /* P1：跨 Thread 召回结果只注入 compose 步骤，不影响调度与工具选择。 */
    var bundle = opts.contextBundle ||
      (root.AstroResearchContext && typeof root.AstroResearchContext.current === 'function'
        ? root.AstroResearchContext.current() : null);
    if (bundle && plan && Array.isArray(plan.steps)) {
      plan.steps.forEach(function (s) {
        if (s && typeof s.tool === 'string' && s.tool.indexOf('compose.') === 0) {
          s.args = s.args || {};
          if (!s.args.contextBundle) s.args.contextBundle = bundle;
        }
      });
    }

    function cancelledRun() {
      abortPending(plan, state, T, '任务已取消');
      return {
        ok: false, aborted: true, criticalFailed: false, budgetStop: false,
        answer: null, state: state, completed: allSettled(plan, state), reason: 'CANCELLED'
      };
    }

    while (guard++ < 200) {
      /* B2：先判暂停，pause() 会先写 pauseRequestedAt 再 abort，避免被误判为取消。
       * 两阶段：PAUSE_REQUESTED 之后不再分发新步骤；PAUSED 由 Control 在
       * 所有活动步骤进入安全状态且持久化成功后确认。 */
      if (state.pausedAt || state.pauseRequestedAt) {
        return {
          ok: false, paused: true, aborted: false, criticalFailed: false, budgetStop: false,
          answer: answer, state: state, completed: false,
          pauseRequested: !state.pausedAt && !!state.pauseRequestedAt,
          reason: state.pausedAt ? 'PAUSED' : 'PAUSE_REQUESTED'
        };
      }
      if (signal && signal.aborted) return cancelledRun();
      var waitingStep = waitingApprovalStep(plan, state);
      if (waitingStep) {
        return {
          ok: false, waitingApproval: true, stepId: waitingStep, aborted: false,
          criticalFailed: false, budgetStop: false, answer: answer, state: state,
          completed: false, reason: 'WAITING_APPROVAL'
        };
      }

      /* 失败依赖传播：pending → blocked */
      var blocked = blockedSteps(plan, state);
      for (var b = 0; b < blocked.length; b++) {
        var bs = stateStep(state, blocked[b].id);
        bs.status = 'blocked';
        bs.endedAt = nowIso();
        bs.error = { kind: 'dependency', message: '依赖失败', retriable: false };
        T.appendEvent(state, 'step.skipped', { reason: 'dependency' }, blocked[b].id);
      }

      if (criticalFailed(plan, state)) {
        return { ok: false, criticalFailed: true, budgetStop: false, answer: answer, state: state };
      }
      if (allSettled(plan, state)) break;

      var batch = nextBatch(plan, state, state.budget.limit.parallel);
      if (!batch) break;

      /* P0：每批执行前重新验证页面会话，防止切换档案后旧任务继续写结果。 */
      if (opts.principal && root.Security &&
        !root.Security.ensureSession(opts.principal).allowed) {
        abortPending(plan, state, T, '会话已变化');
        return {
          ok: false, aborted: true, criticalFailed: false, budgetStop: false,
          answer: null, state: state, completed: false, reason: 'SESSION_CHANGED'
        };
      }

      if (signal && signal.aborted) return cancelledRun();
      var results = await runBatch(batch, state, opts);
      /* B2：暂停请求命中在飞步骤时，先落盘检查点，再以 PAUSED 返回。 */
      if (results.some(function (r) { return r && r.paused; })) {
        if (typeof opts.onBatchSettled === 'function') {
          try { await opts.onBatchSettled(state, results, batch); } catch (e) { /* ignore */ }
        }
        return {
          ok: false, paused: true, aborted: false, criticalFailed: false, budgetStop: false,
          answer: answer, state: state, completed: false,
          pauseRequested: !state.pausedAt, reason: 'PAUSED'
        };
      }
      if (results.some(function (r) { return r && r.aborted; })) return cancelledRun();

      for (var i = 0; i < results.length; i++) {
        if (results[i].budget) budgetStop = true;
        if (results[i].ok && results[i].result && results[i].result.answer) {
          answer = results[i].result.answer;
        }
      }
      /* P4：批次落盘钩子；持久化失败不影响调度语义。 */
      if (typeof opts.onBatchSettled === 'function') {
        try { await opts.onBatchSettled(state, results, batch); } catch (e) { /* ignore */ }
      }
      if (budgetStop && batch.steps.some(function (s) { return s.critical; })) break;
    }

    return {
      ok: !criticalFailed(plan, state) && !!answer,
      criticalFailed: criticalFailed(plan, state),
      budgetStop: budgetStop,
      answer: answer,
      state: state,
      completed: allSettled(plan, state)
    };
  }

  /* P3 TaskExecutor 门面：统一入口，负责暂停/审批/结果复用与状态前置检查。
   * 实际执行仍复用 executeOne，不另建第二套执行逻辑。 */
  async function execute(planStep, state, opts) {
    opts = opts || {};
    var st = stateStep(state, planStep && planStep.id);
    if (!st) return { ok: false, reason: 'step_missing', critical: !!(planStep && planStep.critical) };
    if (state.pausedAt) return { ok: false, paused: true, reason: 'paused' };
    if (st.status === 'waiting_approval') {
      return { ok: false, waitingApproval: true, reason: 'waiting_approval' };
    }
    if (st.status === 'ok') {
      return { ok: true, reused: true, critical: !!planStep.critical, result: { ok: true, reused: true } };
    }
    if (st.status !== 'pending' && st.status !== 'ready') {
      return { ok: false, reason: 'invalid_state', status: st.status, critical: !!planStep.critical };
    }
    return executeOne(planStep, state, opts);
  }

  root.AstroOrchestrator = {
    Scheduler: {
      readySteps: readySteps,
      blockedSteps: blockedSteps,
      nextBatch: nextBatch,
      hasBatchConflict: hasBatchConflict,
      waitingApprovalStep: waitingApprovalStep,
      criticalFailed: criticalFailed,
      allSettled: allSettled
    },
    Runner: {
      executeOne: executeOne,
      execute: execute,
      runPlan: runPlan,
      withTimeout: withTimeout,
      classifyFailure: classifyFailure,
      retryPolicy: retryPolicy
    },
    TaskExecutor: { execute: execute },
    runPlan: runPlan
  };
})(typeof window !== 'undefined' ? window : global);
