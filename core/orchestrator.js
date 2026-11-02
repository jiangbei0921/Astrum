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
      batch.push(ready[i]);
    }
    return { steps: batch, parallel: batch.length > 1 };
  }

  function nowIso() { return new Date().toISOString(); }

  function abortedResult() {
    return { ok: false, reason: 'cancelled', kind: 'cancelled', retriable: false, pendingAbort: true };
  }

  function withTimeout(fn, ms, signal) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = null;
      var onAbort = null;
      function finish(v) {
        if (done) return;
        done = true;
        if (timer) clearTimeout(timer);
        if (signal && onAbort) signal.removeEventListener('abort', onAbort);
        resolve(v);
      }
      if (signal && signal.aborted) { finish(abortedResult()); return; }
      if (signal && signal.addEventListener) {
        onAbort = function () { finish(abortedResult()); };
        signal.addEventListener('abort', onAbort);
      }
      timer = setTimeout(function () {
        finish({ ok: false, reason: 'timeout', kind: 'timeout', retriable: true });
      }, Math.max(1, ms || 500));
      var call;
      try { call = fn(); } catch (e) { call = Promise.reject(e); }
      Promise.resolve(call).then(function (r) {
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
        retriable: r.retriable !== false,
        pendingAbort: !!r.pendingAbort
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
    return { kind: kind, retriable: retriable, message: reason, pendingAbort: !!raw.pendingAbort };
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

  async function executeOne(planStep, state, opts) {
    var T = root.AstroTask;
    var step = stateStep(state, planStep.id);
    var spec = opts.registry ? opts.registry.get(planStep.tool) : null;
    var signal = opts.signal || null;

    if (signal && signal.aborted) {
      step.status = 'aborted';
      step.cancelled = true;
      step.endedAt = nowIso();
      step.error = { kind: 'cancelled', message: '任务已取消', retriable: false };
      T.appendEvent(state, 'step.cancelled', { reason: 'cancelled' }, planStep.id);
      return { ok: false, aborted: true, critical: !!planStep.critical, reason: 'cancelled' };
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

    while (attempts < maxAttempts) {
      attempts += 1;
      step.attempt += 1;
      if (signal && signal.aborted) {
        last = abortedResult();
        lastKind = 'cancelled';
        break;
      }
      if (!T.canAfford(state.budget, cost)) break;

      var raw = await withTimeout(function () {
        return spec.run(planStep.args || {}, opts.ctx, spec, opts.cfg, depResults, {
          signal: signal, taskId: state.id, attempt: attempts
        });
      }, spec.timeoutMs, signal);
      var normalized = normalizeResult(raw);
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
      step.provenance = (last.result && last.result.provenance) || {
        tool: spec.id, version: spec.version || '', at: step.endedAt
      };
      step.evidenceRefs = evRefs(last.result);
      T.appendEvent(state, 'step.ok', {}, planStep.id);
      return { ok: true, result: last.result, evidenceRefs: step.evidenceRefs };
    }

    if (lastKind === 'cancelled' || (last && last.pendingAbort)) {
      step.status = 'aborted';
      step.cancelled = true;
      step.error = { kind: 'cancelled', message: '任务已取消（在飞请求待完成）', retriable: false, pendingAbort: true };
      T.appendEvent(state, 'step.cancelled', { reason: 'cancelled' }, planStep.id);
      return { ok: false, aborted: true, critical: !!planStep.critical, reason: 'cancelled' };
    }

    step.status = 'failed';
    step.error = {
      kind: lastKind,
      message: last ? last.message || last.reason : 'unknown',
      retriable: !!(last && last.retriable)
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

    function cancelledRun() {
      abortPending(plan, state, T, '任务已取消');
      return {
        ok: false, aborted: true, criticalFailed: false, budgetStop: false,
        answer: null, state: state, completed: allSettled(plan, state)
      };
    }

    while (guard++ < 200) {
      if (signal && signal.aborted) return cancelledRun();

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

      if (signal && signal.aborted) return cancelledRun();
      var results = await runBatch(batch, state, opts);
      if (results.some(function (r) { return r && r.aborted; })) return cancelledRun();

      for (var i = 0; i < results.length; i++) {
        if (results[i].budget) budgetStop = true;
        if (results[i].ok && results[i].result && results[i].result.answer) {
          answer = results[i].result.answer;
        }
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

  root.AstroOrchestrator = {
    Scheduler: {
      readySteps: readySteps,
      blockedSteps: blockedSteps,
      nextBatch: nextBatch,
      criticalFailed: criticalFailed,
      allSettled: allSettled
    },
    Runner: {
      executeOne: executeOne,
      runPlan: runPlan,
      withTimeout: withTimeout,
      classifyFailure: classifyFailure,
      retryPolicy: retryPolicy
    },
    runPlan: runPlan
  };
})(typeof window !== 'undefined' ? window : global);
