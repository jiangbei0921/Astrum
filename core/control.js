/* ASTRUM · 控制层入口（B1/B3/B4/B5 + C2/C4/C6）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §3/§4/§15.3
 *
 * 对外暴露 AstroControl；TaskState 由调用方持有，绝不挂载到 answer。
 * 第一阶段：prepare() 完成 Router + Planner + TaskState 初始化；
 * 第二阶段：run() 接入 Scheduler/Runner、取消、有限重规划、持久化。
 */
(function (root) {
  'use strict';

  /* 当前标签页内正在执行的任务 → AbortController。
   * 仅用于协作式中断；跨标签页暂停仍以 pausedAt 为安全边界。 */
  var activeRuns = Object.create(null);

  function makeRunController(taskId, external, state) {
    var ctl = null;
    if (typeof AbortController === 'function') {
      ctl = new AbortController();
      activeRuns[taskId] = { ctl: ctl, state: state || null };
      if (external) {
        if (external.aborted) {
          try { ctl.abort(external.reason || 'user'); } catch (e) { /* ignore */ }
        } else if (external.addEventListener) {
          external.addEventListener('abort', function () {
            try { ctl.abort(external.reason || 'user'); } catch (e) { /* ignore */ }
          });
        }
      }
    }
    return ctl;
  }

  function runSignalOf(ctl, opts) {
    return ctl ? ctl.signal : (opts && opts.signal ? opts.signal : null);
  }

  function releaseRun(taskId, ctl) {
    var entry = activeRuns[taskId];
    if (ctl && entry && entry.ctl === ctl) delete activeRuns[taskId];
  }

  function activeState(taskId) {
    var entry = activeRuns[taskId];
    return entry ? entry.state : null;
  }

  function abortActive(taskId, reason) {
    var entry = activeRuns[taskId];
    if (!entry || !entry.ctl || entry.ctl.signal.aborted) return false;
    try { entry.ctl.abort(reason || 'cancel'); } catch (e) { return false; }
    return true;
  }

  function contextOf(ctx) {
    ctx = ctx || {};
    return {
      place: { lat: ctx.lat, lon: ctx.lon, name: ctx.city || '' },
      time: { y: ctx.y, mo: ctx.mo, d: ctx.d, h: ctx.h, mi: ctx.mi, tz: ctx.tz },
      epoch: 'J2000',
      frame: 'topocentric'
    };
  }

  function trim(q) {
    return String(q == null ? '' : q).trim();
  }

  /* P0：身份只由可信上下文构造；无 Profile 的 Node 测试返回 null 并跳过校验。 */
  function principalOf(opts) {
    opts = opts || {};
    if (opts.principal) return opts.principal;
    if (root.Security && root.Security.makePrincipal) {
      return root.Security.makePrincipal({ agentId: opts.agentId || 'muse' });
    }
    return null;
  }

  function authorized(principal, action, task) {
    if (!principal || !root.Security) return { allowed: true };
    var projectId = task && task.projectId ? task.projectId : null;
    return root.Security.authorize({
      principal: principal,
      action: action,
      resource: {
        resourceType: 'task',
        resourceId: task && task.id ? task.id : '',
        ownerProfileId: task && task.ownerProfileId ? task.ownerProfileId : principal.profileId,
        projectId: projectId
      }
    });
  }

  function prepare(query, ctx, cfg, opts) {
    opts = opts || {};
    var AC = root.AgentCore;
    var T = root.AstroTask;
    var Router = root.AstroRouter;
    var Planner = root.AstroPlanner;
    if (!AC || !T || !Router || !Planner) throw new Error('AstroControl 依赖未加载');

    var q = trim(query);
    var pre = opts.routeData || null;
    var targets = pre && pre.targets ? pre.targets : AC.resolveTargets(q);
    var intent = pre && pre.intent ? pre.intent : AC.detectIntent(q, targets);
    var route = pre && pre.route ? pre.route
      : Router.route({ query: q, intent: intent, targets: targets, ctx: ctx, cfg: cfg });

    var state = T.create({
      question: q,
      mode: route.mode,
      level: route.level,
      projectId: opts.projectId || null,
      context: contextOf(ctx),
      budget: T.makeBudget(route.level)
    });
    /* P3：仅在显式启用时为 research/compare 建立目标，旧链路保持无 goal。 */
    if (opts.goalEnabled && root.AstroResearchGoal) {
      var goalRes = null;
      try {
        goalRes = root.AstroResearchGoal.fromRoute({
          query: q, intent: intent, route: route, targets: targets
        }, { projectId: state.projectId, query: q });
      } catch (e) { goalRes = null; }
      if (goalRes && goalRes.ok) state.goal = goalRes.goal;
    }
    state.intents = [{ kind: intent, confidence: 1, source: 'rule' }];
    state.entities = (route.targets || []).map(function (name, i) {
      return {
        id: 'e' + (i + 1),
        name: name,
        aliases: [],
        resolvedBy: 'rule'
      };
    });

    T.transition(state, 'UNDERSTAND');
    T.transition(state, 'ROUTE');

    var result = {
      query: q,
      ctx: ctx,
      cfg: cfg,
      intent: intent,
      targets: targets,
      route: route,
      state: state,
      plan: null,
      legacy: true,
      principal: opts.principal || null
    };

    if (route.legacy) {
      T.transition(state, 'LEGACY');
      T.transition(state, 'DONE');
      return result;
    }

    T.transition(state, 'PLAN');
    var plan = null;
    try {
      plan = Planner.plan({
        query: q,
        ctx: ctx,
        cfg: cfg,
        intent: intent,
        targets: targets,
        route: route,
        registry: opts.registry || null,
        capabilities: opts.capabilities || (opts.registry && opts.registry.list ? opts.registry.list() : null),
        budget: state.budget,
        forceCompare: !!opts.forceCompare
      });
    } catch (e) {
      plan = null;
    }

    if (!plan) {
      T.transition(state, 'LEGACY');
      T.transition(state, 'DONE');
      return result;
    }

    result.legacy = false;
    result.plan = plan;
    state.plan = plan;
    state.steps = plan.steps.map(T.makeStep);
    return result;
  }

  function makeRuntime(opts) {
    opts = opts || {};
    var AC = root.AgentCore;
    var adapter = opts.adapter || (root.AstroComposeAdapter
      ? root.AstroComposeAdapter.create({ agentCore: AC })
      : null);
    var registry = opts.registry || (root.AstroRegistry
      ? root.AstroRegistry.createDefault({ adapter: adapter, agentCore: AC, network: opts.network })
      : null);
    var store = opts.store || null;
    return { adapter: adapter, registry: registry, store: store, principal: opts.principal || null };
  }

  function successfulStepResults(state) {
    var out = {};
    (state.steps || []).forEach(function (s) {
      if (s.status === 'ok' && s.result) out[s.id] = s.result;
    });
    return out;
  }

  function emitNew(state, fromIndex, opts) {
    if (!opts || typeof opts.onEvent !== 'function') return;
    for (var i = fromIndex; i < state.events.length; i++) {
      try { opts.onEvent(JSON.parse(JSON.stringify(state.events[i]))); } catch (e) { /* 观察者异常不阻断任务 */ }
    }
  }

  function saveState(store, state, principal, opts) {
    opts = opts || {};
    if (!store || typeof store.save !== 'function') return Promise.resolve(null);
    if (principal && root.Security) {
      if (!root.Security.ensureSession(principal).allowed) return Promise.resolve(null);
      if (typeof store.ownerProfileId === 'function' && store.ownerProfileId() &&
        store.ownerProfileId() !== principal.profileId) {
        return Promise.resolve(null);
      }
    }
    var saveOpts = opts.expectedRevision != null ? { expectedRevision: opts.expectedRevision } : undefined;
    return Promise.resolve(store.save(state, saveOpts)).catch(function (e) {
      if (opts.rethrow) throw e;
      return null;
    });
  }

  /* P1：检查点写入失败不得影响任务执行（审计性数据，不阻断主链路）。 */
  function safeCheckpoint(state, meta) {
    if (!root.AstroTask || typeof root.AstroTask.addCheckpoint !== 'function') return null;
    try { return root.AstroTask.addCheckpoint(state, meta || {}); }
    catch (e) { return null; }
  }

  function checkpointCriticalSteps(state, written) {
    (state.steps || []).forEach(function (s) {
      if (s.status === 'ok' && s.critical && !written[s.id]) {
        written[s.id] = 1;
        safeCheckpoint(state, { stepId: s.id, taskStatus: state.phase });
      }
    });
  }

  function extractDelivery(state) {
    var delivery = null;
    for (var i = 0; i < state.steps.length; i++) {
      var sr = state.steps[i].result;
      if (sr && sr.delivery) delivery = sr.delivery;
    }
    return delivery;
  }

  function maxReplansOf(state, opts) {
    var budget = state.budget && state.budget.limit ? state.budget.limit.replans : 0;
    var requested = opts && typeof opts.maxReplans === 'number' ? opts.maxReplans
      : (typeof budget === 'number' ? budget : 1);
    /* ADR-001：L3/L4 允许 2 次，L2 为 1，L1 为 0；显式 opts 只能收紧。 */
    return Math.max(0, Math.min(2, requested, budget));
  }

  /* P3：执行摘要融入现有 answer（结构化字段 + 一个 execution section）。
   * 只在存在 goal 的任务上启用，避免改变旧答案结构。 */
  function attachExecution(answer, state, coverage) {
    if (!answer || typeof answer !== 'object' || !state || !state.goal) return answer;
    if (!root.AstroReport || typeof root.AstroReport.executionOf !== 'function') return answer;
    var ex = null;
    try { ex = root.AstroReport.executionOf({ state: state, goalCoverage: coverage || null }); } catch (e) { ex = null; }
    if (!ex) return answer;
    answer.execution = ex;
    if (Array.isArray(answer.sections) && !answer.sections.some(function (s) {
      return s && s.kind === 'execution';
    })) {
      var covered = ex.goal ? ex.goal.objectives.filter(function (o) { return o.covered; }).length : 0;
      var total = ex.goal ? ex.goal.objectives.length : 0;
      answer.sections.push({
        kind: 'execution',
        title: '执行摘要',
        items: [
          { label: '步骤', value: ex.counts.ok + '/' + ex.counts.total + ' 成功' },
          {
            label: '恢复',
            value: ex.paused.recoveries + (ex.paused.limit != null ? '/' + ex.paused.limit : '')
          },
          { label: '目标覆盖', value: ex.goal ? covered + '/' + total : '—' }
        ]
      });
    }
    return answer;
  }

  function resultOf(prepared, state, runner, answer, delivery, extra) {
    var out = {
      query: prepared.query, ctx: prepared.ctx, cfg: prepared.cfg,
      intent: prepared.intent, targets: prepared.targets,
      route: prepared.route, plan: state.plan || prepared.plan, state: state,
      runner: runner, answer: answer, legacy: false,
      delivery: delivery
    };
    Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
    return out;
  }

  async function run(query, ctx, cfg, opts) {
    opts = opts || {};
    var AC = root.AgentCore;
    var T = root.AstroTask;
    var O = root.AstroOrchestrator;
    if (!AC || !T || !O) throw new Error('AstroControl.run 依赖未加载');

    var principal = principalOf(opts);
    var rt = makeRuntime(Object.assign({}, opts, { principal: principal }));
    var prepared = prepare(query, ctx, cfg, {
      registry: rt.registry,
      capabilities: opts.capabilities,
      routeData: opts.routeData || null,
      forceCompare: !!opts.forceCompare,
      projectId: opts.projectId || null,
      principal: principal,
      goalEnabled: !!opts.goalEnabled
    });
    var state = prepared.state;
    var eventIndex = 0;
    var cpWritten = {};
    /* B4：本次运行的所有保存都携带同一个修订号，旧修订写入会被 STALE_WRITE 拒绝。 */
    var expectedRev = 0;
    var persist = function () {
      return saveState(rt.store, state, rt.principal, {
        expectedRevision: expectedRev, rethrow: true
      }).then(function (id) {
        if (id) expectedRev += 1;
        return id;
      });
    };
    /* P4：每个批次结束后落盘；critical 成功步骤同时生成检查点。 */
    var onBatchSettled = async function () {
      checkpointCriticalSteps(state, cpWritten);
      await persist();
    };

    /* P0：任务创建前置授权。无 Profile 的 Node 环境 principal=null，保持旧行为。 */
    var createDecision = principal ? authorized(principal, 'create', null) : { allowed: true };
    if (!createDecision.allowed) {
      T.transition(state, 'LEGACY');
      T.transition(state, 'DONE');
      var deniedAnswer = rt.adapter ? rt.adapter.deliver(prepared.query, ctx, cfg) : null;
      await saveState(rt.store, state, principal);
      return {
        query: prepared.query, ctx: ctx, cfg: cfg,
        intent: prepared.intent, targets: prepared.targets,
        route: prepared.route, plan: null, state: state,
        runner: null, answer: deniedAnswer, legacy: true,
        delivery: null, denied: createDecision.reason,
        verdict: 'PARTIAL'
      };
    }
    /* V1.2：FITS 附件 Evidence 注入 compose args；不新增任务模板。 */
    if (opts.attachmentsEvidence && opts.attachmentsEvidence.length) {
      state.evidence = opts.attachmentsEvidence.slice();
      if (prepared.plan && Array.isArray(prepared.plan.steps)) {
        prepared.plan.steps.forEach(function (s) {
          if (s.tool && s.tool.indexOf('compose.') === 0) {
            s.args = s.args || {};
            s.args.evidence = opts.attachmentsEvidence.slice();
          }
        });
        state.plan = prepared.plan;
      }
    }
    /* V1.3：研究任务可为 paper.search 打开全文获取；不改变模板与工具数量。 */
    if (opts.fulltext && prepared.plan && Array.isArray(prepared.plan.steps)) {
      prepared.plan.steps.forEach(function (s) {
        if (s.tool === 'paper.search') {
          s.args = s.args || {};
          s.args.fulltext = true;
          s.args.maxFulltext = 4;
          /* 最多尝试 3 篇：单篇出版社 403/反爬时继续下一篇，而不是只试第一本。 */
          s.args.fulltextItems = Math.max(1, Math.min(3, s.args.fulltextItems || 3));
        }
      });
      state.plan = prepared.plan;
    }
    await persist();
    if (!prepared.legacy) safeCheckpoint(state, { stepId: 'plan', taskStatus: 'PLAN' });

    if (prepared.legacy) {
      var legacyAnswer = rt.adapter.deliver(prepared.query, ctx, cfg);
      await persist();
      return {
        query: prepared.query, ctx: ctx, cfg: cfg,
        intent: prepared.intent, targets: prepared.targets,
        route: prepared.route, plan: null, state: state,
        runner: null, answer: legacyAnswer, legacy: true,
        delivery: null,
        verdict: legacyAnswer && legacyAnswer.meta && legacyAnswer.meta.review
          ? legacyAnswer.meta.review.verdict : 'PARTIAL'
      };
    }

    T.transition(state, 'EXECUTE');
    /* B2：本次运行持有可中止控制器，pause() 可立即中止在飞请求。
     * activeRuns / makeRunController / runSignalOf / releaseRun 均定义在本文件顶部。 */
    var runCtl = makeRunController(state.id, opts.signal || null, state);
    var runSignal = runSignalOf(runCtl, opts);
    var runner = await O.runPlan(prepared.plan, state, {
      registry: rt.registry, ctx: ctx, cfg: cfg, adapter: rt.adapter,
      signal: runSignal,
      principal: rt.principal,
      onBatchSettled: onBatchSettled
    });

    if (runner && runner.aborted) {
      releaseRun(state.id, runCtl);
      T.appendEvent(state, 'task.cancelled', { reason: 'user' });
      T.transition(state, 'ABORTED');
      emitNew(state, eventIndex, opts);
      var cancelPersist = { ok: true, error: null };
      try { await persist(); } catch (e) {
        cancelPersist = { ok: false, error: (e && e.code) || 'PERSIST_TX_FAILED' };
      }
      return resultOf(prepared, state, runner, null, null, {
        cancelled: true, verdict: 'ABORTED', legacy: false,
        persistFailed: !cancelPersist.ok, error: cancelPersist.error
      });
    }

    /* P3：暂停/待审批时不推进阶段，持久化后原样返回，等待用户恢复。
     * V2-B：暂停必须先确认持久化成功，再返回 PAUSED。 */
    if (runner && (runner.paused || runner.waitingApproval)) {
      releaseRun(state.id, runCtl);
      if (runner.paused) {
        var pauseFin = await confirmPauseWith(state, persist);
        emitNew(state, eventIndex, opts);
        if (!pauseFin.ok) {
          return resultOf(prepared, state, runner, null, null, {
            paused: false, pauseRequested: true, verdict: 'PAUSE_PERSIST_FAILED',
            error: pauseFin.error, resumable: true, legacy: false
          });
        }
        return resultOf(prepared, state, runner, null, null, {
          paused: true, verdict: 'PAUSED', resumable: true, legacy: false
        });
      }
      emitNew(state, eventIndex, opts);
      await persist();
      return resultOf(prepared, state, runner, null, null, {
        paused: false,
        waitingApproval: !!runner.waitingApproval,
        waitingStepId: runner.stepId || null,
        verdict: 'WAITING_APPROVAL',
        resumable: true,
        legacy: false
      });
    }

    /* C4：关键步骤失败且尚有预算 → 仅重组 compose 依赖，保留成功结果 */
    var replans = 0;
    var limit = maxReplansOf(state, opts);
    var currentPlan = prepared.plan;
    while (runner && runner.criticalFailed && replans < limit && !(runSignal && runSignal.aborted)) {
      var newPlan = null;
      try {
        newPlan = root.AstroPlanner.replan(currentPlan, state, 'critical_failed', {
          registry: rt.registry, budget: state.budget
        });
      } catch (e) { newPlan = null; }
      if (!newPlan) break;

      T.transition(state, 'PROGRESS');
      T.transition(state, 'PLAN');
      T.spend(state.budget, { replans: 1 });
      state.replans.push({
        at: T.PHASES ? new Date().toISOString() : new Date().toISOString(),
        reason: 'critical_failed',
        dropped: newPlan.dropped || [],
        plan: newPlan
      });
      T.appendEvent(state, 'task.replanned', { reason: 'critical_failed' });
      state.plan = newPlan;
      var existing = {};
      state.steps.forEach(function (s) { existing[s.id] = 1; });
      newPlan.steps.forEach(function (s) {
        if (!existing[s.id]) {
          state.steps.push(T.makeStep(s));
          existing[s.id] = 1;
        }
      });
      T.transition(state, 'EXECUTE');
      replans += 1;
      runner = await O.runPlan(newPlan, state, {
        registry: rt.registry, ctx: ctx, cfg: cfg, adapter: rt.adapter,
        signal: runSignal,
        onBatchSettled: onBatchSettled
      });
      currentPlan = newPlan;

      if (runner && runner.aborted) {
        releaseRun(state.id, runCtl);
        T.appendEvent(state, 'task.cancelled', { reason: 'user' });
        T.transition(state, 'ABORTED');
        emitNew(state, eventIndex, opts);
        var cancelPersistX = { ok: true, error: null };
        try { await persist(); } catch (e) {
          cancelPersistX = { ok: false, error: (e && e.code) || 'PERSIST_TX_FAILED' };
        }
        return resultOf(prepared, state, runner, null, null, {
          cancelled: true, verdict: 'ABORTED', legacy: false,
          persistFailed: !cancelPersistX.ok, error: cancelPersistX.error
        });
      }
      if (runner && runner.paused) {
        releaseRun(state.id, runCtl);
        var pauseFin2 = await confirmPauseWith(state, persist);
        emitNew(state, eventIndex, opts);
        if (!pauseFin2.ok) {
          return resultOf(prepared, state, runner, null, null, {
            paused: false, pauseRequested: true, verdict: 'PAUSE_PERSIST_FAILED',
            error: pauseFin2.error, resumable: true, legacy: false
          });
        }
        return resultOf(prepared, state, runner, null, null, {
          paused: true, verdict: 'PAUSED', resumable: true, legacy: false
        });
      }
    }

    checkpointCriticalSteps(state, cpWritten);

    /* V1.5：Research Loop。只在显式启用时运行，保持旧测试与旧调用默认行为不变。
     * 只追加 evidence.search，不改写已完成步骤；受 appends/searches 预算与 2 轮上限约束。 */
    var appendRounds = 0;
    var research = (runner && runner.answer && runner.answer.research) ? runner.answer.research : null;
    var freshAnswer = null;
    var lastCoverage = null;
    while (opts.researchLoop && appendRounds < 2 && root.AstroEvaluator &&
      root.AstroPlanner && currentPlan && !(opts.signal && opts.signal.aborted)) {
      var decision = null;
      try {
        decision = root.AstroEvaluator.decide({
          state: state, plan: currentPlan,
          research: research || null,
          opts: { query: prepared.query, signal: runSignal, maxAppends: 2 }
        });
      } catch (e) { decision = null; }
      if (!decision) break;
      if (decision.coverage) lastCoverage = decision.coverage;
      T.appendEvent(state, 'progress.decided', {
        action: decision.action, reason: String(decision.reason || '').slice(0, 80)
      });
      if (decision.action !== 'append') break;

      var expanded = null;
      try {
        expanded = root.AstroPlanner.expand(currentPlan, {
          gaps: decision.gaps || [],
          basis: decision.append ? [decision.append] : [],
          direction: decision.direction || 'positive',
          conflicts: [],
          conflictKeys: root.AstroEvaluator.conflictKeysFrom
            ? root.AstroEvaluator.conflictKeysFrom(decision) : []
        }, { registry: rt.registry, budget: state.budget, query: prepared.query });
      } catch (e) { expanded = null; }
      if (!expanded) break;
      /* ADR-001/预算：追加动作只扣 appends；searches 由 Runner 按实际工具成本扣减（避免双重扣减）。 */
      try { T.spend(state.budget, { appends: 1 }); }
      catch (e) { break; }

      var known = {};
      state.steps.forEach(function (s) { known[s.id] = 1; });
      expanded.steps.forEach(function (s) {
        if (!known[s.id]) { state.steps.push(T.makeStep(s)); known[s.id] = 1; }
      });
      state.plan = expanded;
      currentPlan = expanded;
      T.appendEvent(state, 'plan.expanded', {
        action: 'append', reason: String(decision.reason || '').slice(0, 80)
      });
      T.transition(state, 'PROGRESS');
      T.transition(state, 'PLAN');
      T.transition(state, 'EXECUTE');
      runner = await O.runPlan(expanded, state, {
        registry: rt.registry, ctx: ctx, cfg: cfg, adapter: rt.adapter,
        signal: runSignal,
        onBatchSettled: onBatchSettled
      });
      appendRounds += 1;
      checkpointCriticalSteps(state, cpWritten);
      if (runner && runner.aborted) {
        releaseRun(state.id, runCtl);
        T.appendEvent(state, 'task.cancelled', { reason: 'user' });
        T.transition(state, 'ABORTED');
        emitNew(state, eventIndex, opts);
        var cancelPersistX = { ok: true, error: null };
        try { await persist(); } catch (e) {
          cancelPersistX = { ok: false, error: (e && e.code) || 'PERSIST_TX_FAILED' };
        }
        return resultOf(prepared, state, runner, null, null, {
          cancelled: true, verdict: 'ABORTED', legacy: false,
          persistFailed: !cancelPersistX.ok, error: cancelPersistX.error
        });
      }
      if (runner && runner.paused) {
        releaseRun(state.id, runCtl);
        var pauseFin3 = await confirmPauseWith(state, persist);
        emitNew(state, eventIndex, opts);
        if (!pauseFin3.ok) {
          return resultOf(prepared, state, runner, null, null, {
            paused: false, pauseRequested: true, verdict: 'PAUSE_PERSIST_FAILED',
            error: pauseFin3.error, resumable: true, legacy: false
          });
        }
        return resultOf(prepared, state, runner, null, null, {
          paused: true, verdict: 'PAUSED', resumable: true, legacy: false
        });
      }

      /* 每轮用最新成功步骤重建 research，供下一轮判断；不改变旧 answer 契约。 */
      try {
        var fresh = rt.adapter.deliverWithDelivery(prepared.query, ctx, cfg, successfulStepResults(state),
          { compare: state.mode === 'compare' || !!opts.forceCompare });
        if (fresh && fresh.answer) {
          freshAnswer = fresh;
          if (fresh.answer.research) research = fresh.answer.research;
        }
      } catch (e) { /* 刷新失败不阻断；下一轮沿用已有 research */ }
    }

    releaseRun(state.id, runCtl);
    var answer = runner ? runner.answer : null;
    var delivery = extractDelivery(state);
    if (freshAnswer) { answer = freshAnswer.answer; delivery = freshAnswer.delivery; }
    if (!answer) {
      try {
        var fallback = rt.adapter.deliverWithDelivery(prepared.query, ctx, cfg, successfulStepResults(state),
          { compare: state.mode === 'compare' || !!opts.forceCompare });
        answer = fallback.answer;
        delivery = fallback.delivery;
      } catch (e) { answer = null; }
    }

    attachExecution(answer, state, lastCoverage);

    var progressed = state.phase === 'PROGRESS';
    if (progressed) T.transition(state, 'EXECUTE');
    T.transition(state, 'PROGRESS');
    safeCheckpoint(state, { taskStatus: 'PROGRESS' });
    var review = answer && answer.meta && answer.meta.review ? answer.meta.review : null;
    var rawVerdict = review && review.verdict ? review.verdict : (answer ? 'PARTIAL' : 'FAIL');
    T.appendEvent(state, 'verdict.issued', { verdict: rawVerdict });
    T.transition(state, 'JUDGE');

    if (!answer) {
      T.transition(state, 'FAILED');
      emitNew(state, eventIndex, opts);
      await persist();
      return resultOf(prepared, state, runner, null, null, {
        verdict: 'FAIL', legacy: false, delivery: null
      });
    }

    /* P0 阶段 legacy review 的 FAIL 不作为最终 FAILED：仍交付旧答案，
     * 状态收敛到 PARTIAL（FAILED 仅保留给无答案 / 不可恢复失败）。 */
    var finalVerdict = rawVerdict === 'PASS' ? 'PASS' : 'PARTIAL';
    T.transition(state, 'COMPOSE');
    T.transition(state, finalVerdict === 'PASS' ? 'DONE' : 'PARTIAL');
    emitNew(state, eventIndex, opts);
    await persist();

    return resultOf(prepared, state, runner, answer, delivery, {
      verdict: finalVerdict, legacy: false, replanned: replans > 0
    });
  }

  function defaultStore() {
    if (!root.AstroTaskStore) return null;
    return root.AstroTaskStore.create({});
  }

  async function load(taskId, opts) {
    opts = opts || {};
    var store = opts.store || defaultStore();
    if (!store || !taskId) return null;
    var rec = store.getRecord ? await store.getRecord(taskId) : null;
    var state = await store.get(taskId);
    if (!state) return null;
    var principal = principalOf(opts);
    if (principal) {
      var d = authorized(principal, 'read', {
        id: taskId,
        ownerProfileId: rec ? rec.ownerProfileId : (store.ownerProfileId ? store.ownerProfileId() : null),
        projectId: rec ? rec.projectId : null
      });
      if (!d.allowed) return null;
    }
    var resumable = store.isResumable ? store.isResumable(state) : false;
    return {
      state: state, resumable: resumable, viewOnly: !resumable,
      record: rec || null,
      revision: rec && typeof rec.revision === 'number' ? rec.revision : null,
      ownerProfileId: rec ? rec.ownerProfileId : null,
      projectId: rec ? rec.projectId : null,
      principal: principal
    };
  }

  function hasRunningStep(state) {
    return (state.steps || []).some(function (s) { return s && s.status === 'running'; });
  }

  /* V2-B：暂停确认。只有活动步骤全部进入安全状态且持久化成功后才写 pausedAt。
   * 持久化失败时回退为 PAUSE_REQUESTED，不伪造 PAUSED。 */
  async function confirmPause(state, store, principal, expectedRevision) {
    var T = root.AstroTask;
    var requestedAt = state.pauseRequestedAt || new Date().toISOString();
    state.pausedAt = new Date().toISOString();
    state.pauseRequestedAt = null;
    if (T) {
      T.appendEvent(state, 'task.paused', { reason: 'user' });
      safeCheckpoint(state, { taskStatus: 'PAUSED', paused: true });
    }
    try {
      if (store && typeof store.save === 'function') {
        await store.save(state, expectedRevision != null ? { expectedRevision: expectedRevision } : undefined);
      }
      return { ok: true, state: state };
    } catch (e) {
      state.pausedAt = null;
      state.pauseRequestedAt = requestedAt;
      try { if (T) T.appendEvent(state, 'task.persist_failed', { reason: 'pause' }); } catch (e2) { /* ignore */ }
      return { ok: false, error: (e && e.code) || 'PERSIST_TX_FAILED', state: state };
    }
  }

  /* 运行中确认暂停：持久化函数由 run/resume 提供，以便沿用其修订号。 */
  async function confirmPauseWith(state, persist) {
    var T = root.AstroTask;
    var requestedAt = state.pauseRequestedAt || new Date().toISOString();
    state.pausedAt = new Date().toISOString();
    state.pauseRequestedAt = null;
    if (T) {
      T.appendEvent(state, 'task.paused', { reason: 'user' });
      safeCheckpoint(state, { taskStatus: 'PAUSED', paused: true });
    }
    try {
      await persist();
      return { ok: true };
    } catch (e) {
      state.pausedAt = null;
      state.pauseRequestedAt = requestedAt;
      try { if (T) T.appendEvent(state, 'task.persist_failed', { reason: 'pause' }); } catch (e2) { /* ignore */ }
      return { ok: false, error: (e && e.code) || 'PERSIST_TX_FAILED' };
    }
  }

  /* P3/V2-B：暂停请求与暂停完成分离。
   * 1) 写入 pauseRequestedAt 并记录 task.pause_requested；
   * 2) 同标签页活跃运行立即 abort('pause')，在飞步骤回队；
   * 3) 所有活动步骤进入安全状态后由 confirmPause 持久化并写 pausedAt。 */
  async function pause(taskId, opts) {
    opts = opts || {};
    var T = root.AstroTask;
    var principal = principalOf(opts);
    var loaded = await load(taskId, Object.assign({}, opts, { principal: principal }));
    if (!loaded || !loaded.state) return null;
    var state = loaded.state;

    if (principal) {
      var d = authorized(principal, 'pause', {
        id: taskId, ownerProfileId: loaded.ownerProfileId, projectId: loaded.projectId
      });
      if (!d.allowed) {
        return { state: state, verdict: 'DENIED', error: d.reason, paused: false };
      }
      if (!root.Security.ensureSession(principal).allowed) {
        return { state: state, verdict: 'DENIED', error: 'SESSION_CHANGED', paused: false };
      }
    }
    if (T && T.isTerminal(state.phase)) {
      return { state: state, verdict: 'VIEW_ONLY', viewOnly: true, paused: false, error: 'TASK_TERMINAL' };
    }
    if (state.pausedAt) {
      return { state: state, verdict: 'PAUSED', paused: true, already: true };
    }
    /* 同标签页有活跃运行时，直接改其内存状态并由该运行统一落盘，
     * 避免 pause 的独立保存与 B4 的 expectedRevision 产生假冲突。 */
    var live = activeState(taskId);
    if (live) {
      if (live.pausedAt) {
        return { state: live, verdict: 'PAUSED', paused: true, already: true };
      }
      if (live.pauseRequestedAt) {
        return {
          state: live, verdict: 'PAUSE_REQUESTED', paused: false,
          pauseRequested: true, already: true
        };
      }
      live.pauseRequestedAt = new Date().toISOString();
      if (T) T.appendEvent(live, 'task.pause_requested', { reason: 'user' });
      var interruptedLive = abortActive(taskId, 'pause');
      if (root.AuditLog) {
        root.AuditLog.record({
          action: 'task.pause', resourceType: 'task', resourceId: taskId,
          projectId: live.projectId || null, decision: 'allow', reason: 'ALLOW'
        });
      }
      return {
        state: live, verdict: 'PAUSE_REQUESTED', paused: false, pauseRequested: true,
        interrupted: interruptedLive,
        message: interruptedLive
          ? '暂停请求已发出，等待当前步骤进入安全状态。'
          : '当前操作不支持立即中断，将在安全边界后暂停。'
      };
    }

    if (state.pauseRequestedAt) {
      /* 跨标签页：请求已存在。若无活动步骤则确认暂停，否则等待运行页收尾。 */
      if (!hasRunningStep(state)) {
        var storeAlready = opts.store || defaultStore();
        var confirmedAlready = await confirmPause(state, storeAlready, principal, loaded.revision);
        if (!confirmedAlready.ok) {
          return {
            state: state, verdict: 'PAUSE_PERSIST_FAILED', paused: false,
            pauseRequested: true, error: confirmedAlready.error
          };
        }
        return { state: state, verdict: 'PAUSED', paused: true, already: true };
      }
      return { state: state, verdict: 'PAUSE_REQUESTED', paused: false, pauseRequested: true, already: true };
    }

    state.pauseRequestedAt = new Date().toISOString();
    if (T) T.appendEvent(state, 'task.pause_requested', { reason: 'user' });

    /* 无活动步骤（空闲/其他标签页已停在边界）→ 立即确认暂停。 */
    if (!hasRunningStep(state)) {
      var storeIdle = opts.store || defaultStore();
      var confirmedIdle = await confirmPause(state, storeIdle, principal, loaded.revision);
      if (!confirmedIdle.ok) {
        return {
          state: state, verdict: 'PAUSE_PERSIST_FAILED', paused: false,
          pauseRequested: true, error: confirmedIdle.error
        };
      }
      if (root.AuditLog) {
        root.AuditLog.record({
          action: 'task.pause', resourceType: 'task', resourceId: taskId,
          projectId: state.projectId || null, decision: 'allow', reason: 'ALLOW'
        });
      }
      return { state: state, verdict: 'PAUSED', paused: true, interrupted: false };
    }

    /* 跨标签页运行中：只持久化暂停请求，不提前标记 PAUSED。 */
    var store = opts.store || defaultStore();
    try {
      await saveState(store, state, principal, { expectedRevision: loaded.revision, rethrow: true });
    } catch (e) {
      state.pauseRequestedAt = null;
      try { if (T) T.appendEvent(state, 'task.persist_failed', { reason: 'pause_request' }); } catch (e2) { /* ignore */ }
      return {
        state: state, verdict: 'PAUSE_PERSIST_FAILED', paused: false,
        pauseRequested: false, error: (e && e.code) || 'PERSIST_TX_FAILED'
      };
    }
    if (root.AuditLog) {
      root.AuditLog.record({
        action: 'task.pause', resourceType: 'task', resourceId: taskId,
        projectId: state.projectId || null, decision: 'allow', reason: 'ALLOW'
      });
    }
    return {
      state: state, verdict: 'PAUSE_REQUESTED', paused: false, pauseRequested: true,
      message: '当前操作不支持立即中断，将在安全边界后暂停。'
    };
  }

  async function resume(taskId, ctx, cfg, opts) {
    opts = opts || {};
    var T = root.AstroTask;
    var O = root.AstroOrchestrator;
    var principal = principalOf(opts);
    var loaded = await load(taskId, Object.assign({}, opts, { principal: principal }));
    if (!loaded) return null;
    if (!loaded.resumable) {
      return { state: loaded.state, answer: null, resumable: false, viewOnly: true, verdict: 'VIEW_ONLY' };
    }

    /* P0：恢复前重新校验所有权与操作能力，不依赖创建时的判断。 */
    if (principal) {
      var d = authorized(principal, 'resume', {
        id: taskId, ownerProfileId: loaded.ownerProfileId, projectId: loaded.projectId
      });
      if (!d.allowed) {
        return {
          state: loaded.state, answer: null, resumable: true, viewOnly: true,
          verdict: 'DENIED', error: d.reason
        };
      }
      if (!root.Security.ensureSession(principal).allowed) {
        return {
          state: loaded.state, answer: null, resumable: true, viewOnly: true,
          verdict: 'DENIED', error: 'SESSION_CHANGED'
        };
      }
    }

    /* P1：恢复前校验任务版本，避免加载不兼容状态。 */
    if (!loaded.state || loaded.state.schemaVersion !== 1) {
      return {
        state: loaded.state, answer: null, resumable: false, viewOnly: true,
        verdict: 'DENIED', error: 'SCHEMA_INCOMPATIBLE'
      };
    }

    /* P3：恢复次数受预算档位硬限制（P4/D-1：L1=0，L2/L3/L4=1）。 */
    var recLimit = loaded.state.budget && loaded.state.budget.limit
      ? loaded.state.budget.limit.recoveries : 0;
    var recUsed = loaded.state.budget && loaded.state.budget.used
      ? loaded.state.budget.used.recoveries : 0;
    if (typeof recLimit === 'number' && recUsed >= recLimit) {
      return {
        state: loaded.state, answer: null, resumable: true, viewOnly: true,
        verdict: 'DENIED', error: 'RECOVERY_LIMIT'
      };
    }

    var rt = makeRuntime(Object.assign({}, opts, { principal: principal }));
    var state = loaded.state;
    var eventIndex = 0;
    var cps = state.checkpoints || [];
    /* B4：恢复后的每次保存都基于恢复起点修订号递增。 */
    var expectedRev = loaded.revision || 1;
    var persist = function () {
      return saveState(rt.store, state, rt.principal, {
        expectedRevision: expectedRev, rethrow: true
      }).then(function (id) {
        if (id) expectedRev += 1;
        return id;
      });
    };

    /* P4：取最新检查点；旧任务无检查点时保持 P3 兼容（允许恢复）。 */
    var latestCp = null;
    if (opts.store && typeof opts.store.loadLatestCheckpoint === 'function') {
      try { latestCp = await opts.store.loadLatestCheckpoint(taskId); } catch (e) { latestCp = null; }
    }
    if (!latestCp && cps.length) latestCp = cps[cps.length - 1];

    /* P1：恢复前校验所属课题状态，避免恢复已归档/删除课题的任务。 */
    var proj = null;
    var projectLoaded = false;
    if (loaded.projectId && root.AstroResearchStore && principal) {
      try {
        var rs = root.AstroResearchStore.create({});
        proj = await rs.getProject(loaded.projectId, principal);
      } catch (e) { proj = null; }
      projectLoaded = true;
      if (!proj || proj.status === 'archived' || proj.status === 'deleted') {
        if (root.AuditLog) {
          root.AuditLog.record({
            action: 'task.resume', resourceType: 'task', resourceId: taskId,
            projectId: loaded.projectId, decision: 'deny',
            reason: proj ? 'PROJECT_NOT_ACTIVE' : 'PROJECT_NOT_FOUND'
          });
        }
        return {
          state: loaded.state, answer: null, resumable: true, viewOnly: true,
          verdict: 'DENIED', error: proj ? 'PROJECT_NOT_ACTIVE' : 'PROJECT_NOT_FOUND'
        };
      }
    }

    /* P4：17 项恢复校验；无检查点的历史任务跳过检查点完整性。 */
    var validation = { ok: true, errors: [] };
    if (root.AstroRecovery) {
      validation = root.AstroRecovery.validate({
        state: state,
        record: loaded.record || null,
        checkpoint: latestCp,
        principal: principal,
        enforcePrincipal: !!principal,
        project: projectLoaded ? proj : undefined,
        registry: rt.registry,
        authorized: principal ? authorized(principal, 'resume', {
          id: taskId, ownerProfileId: loaded.ownerProfileId, projectId: loaded.projectId
        }) : null,
        limit: recLimit
      });
    } else if (cps.length) {
      var fallbackCp = latestCp;
      if (!fallbackCp || typeof fallbackCp.stateHash !== 'string' || !fallbackCp.stateHash) {
        validation = { ok: false, errors: [{ code: 'CHECKPOINT_INVALID', detail: 'stateHash' }] };
      }
    }
    if (!validation.ok) {
      if (root.AuditLog) {
        root.AuditLog.record({
          action: 'task.resume', resourceType: 'task', resourceId: taskId,
          projectId: loaded.projectId || null, decision: 'deny',
          reason: validation.errors[0].code
        });
      }
      return {
        state: loaded.state, answer: null, resumable: true, viewOnly: true,
        verdict: 'DENIED', error: validation.errors[0].code,
        recovery: { attempt: recUsed, limit: recLimit, errors: validation.errors }
      };
    }

    if (root.AuditLog) {
      root.AuditLog.record({
        action: 'task.resume', resourceType: 'task', resourceId: taskId,
        projectId: loaded.projectId || null, decision: 'allow', reason: 'ALLOW'
      });
    }

    /* P3/P4：恢复计入预算；暂停标记清除后再继续。取消任务不可恢复（ABORTED 非 resumable）。 */
    state.pausedAt = null;
    state.pauseRequestedAt = null;
    state.recoveries = (state.recoveries || 0) + 1;
    try { T.spend(state.budget, { recoveries: 1 }); } catch (e) {
      state.recoveries -= 1;
      return {
        state: state, answer: null, resumable: true, viewOnly: true,
        verdict: 'DENIED', error: 'RECOVERY_LIMIT'
      };
    }

    /* P4/D-2：按工具幂等性决定复用或重跑。 */
    var strategies = { reuse: [], rerun: [], blocked: [], confirm: [] };
    if (root.AstroRecovery) {
      var applied = root.AstroRecovery.apply({
        state: state, checkpoint: latestCp, registry: rt.registry,
        /* ASTRUM-004：复用前校验参数、工具/Skill 版本、执行上下文、Profile、授权与持久化。 */
        profileId: principal && principal.profileId ? principal.profileId : null,
        contextHash: state.context ? T.computeInputHash(state.context) : null,
        authorized: principal ? authorized(principal, 'resume', {
          id: taskId, ownerProfileId: loaded.ownerProfileId, projectId: loaded.projectId
        }) : null,
        persisted: !!loaded.record,
        validateUnknown: opts.validateUnknownIdempotency !== false
      });
      strategies = applied.applied;
    } else {
      (state.steps || []).forEach(function (s) {
        if (s.status === 'running' || s.status === 'paused' || s.status === 'waiting_approval') {
          s.status = 'pending';
          s.error = null;
          s.cancelled = false;
        }
      });
    }
    T.appendEvent(state, 'task.recovered', { reason: 'resume' });
    safeCheckpoint(state, { taskStatus: 'RECOVERY', paused: false });

    /* P4：先持久化恢复起点，再执行；重复点击由 revision 拦截。 */
    try {
      await saveState(rt.store, state, rt.principal, {
        expectedRevision: loaded.revision, rethrow: true
      });
      expectedRev = (loaded.revision || 1) + 1;
    } catch (e) {
      if (e && e.code === 'STALE_WRITE') {
        return {
          state: state, answer: null, resumable: true, viewOnly: true,
          verdict: 'DENIED', error: 'STALE_WRITE',
          recovery: { attempt: state.recoveries, limit: recLimit, strategies: strategies }
        };
      }
      return {
        state: state, answer: null, resumable: true, viewOnly: true,
        verdict: 'DENIED', error: (e && e.code) || 'PERSIST_TX_FAILED',
        recovery: { attempt: state.recoveries, limit: recLimit, strategies: strategies }
      };
    }

    var cpWritten = {};
    var onBatchSettled = async function () {
      checkpointCriticalSteps(state, cpWritten);
      await persist();
    };
    var runCtl = makeRunController(state.id, opts.signal || null, state);
    var runSignal = runSignalOf(runCtl, opts);
    var runner = await O.runPlan(state.plan, state, {
      registry: rt.registry, ctx: ctx || {}, cfg: cfg, adapter: rt.adapter,
      signal: runSignal,
      principal: rt.principal,
      onBatchSettled: onBatchSettled
    });
    checkpointCriticalSteps(state, cpWritten);
    var recoveryInfo = { attempt: state.recoveries, limit: recLimit, strategies: strategies };
    if (runner && runner.aborted) {
      releaseRun(state.id, runCtl);
      T.appendEvent(state, 'task.cancelled', { reason: 'user' });
      T.transition(state, 'ABORTED');
      emitNew(state, eventIndex, opts);
      await persist();
      return {
        state: state, answer: null, runner: runner, cancelled: true,
        verdict: 'ABORTED', resumable: false, recovery: recoveryInfo
      };
    }
    if (runner && runner.paused) {
      releaseRun(state.id, runCtl);
      var pauseFinR = await confirmPauseWith(state, persist);
      emitNew(state, eventIndex, opts);
      if (!pauseFinR.ok) {
        return {
          state: state, answer: null, runner: runner, paused: false, pauseRequested: true,
          verdict: 'PAUSE_PERSIST_FAILED', error: pauseFinR.error,
          resumable: true, recovery: recoveryInfo
        };
      }
      return {
        state: state, answer: null, runner: runner, paused: true,
        verdict: 'PAUSED', resumable: true, recovery: recoveryInfo
      };
    }
    releaseRun(state.id, runCtl);

    var answer = runner ? runner.answer : null;
    var delivery = null;
    for (var i = 0; i < state.steps.length; i++) {
      var sr = state.steps[i].result;
      if (sr && sr.delivery) delivery = sr.delivery;
    }
    if (!answer) {
      try {
        var fb = rt.adapter.deliverWithDelivery(state.question, ctx, cfg, successfulStepResults(state),
          { compare: state.mode === 'compare' });
        answer = fb.answer;
        delivery = fb.delivery;
      } catch (e) { answer = null; }
    }
    attachExecution(answer, state, null);
    T.transition(state, 'PROGRESS');
    safeCheckpoint(state, { taskStatus: 'PROGRESS' });
    var review = answer && answer.meta && answer.meta.review ? answer.meta.review : null;
    var rawVerdict = review && review.verdict ? review.verdict : (answer ? 'PARTIAL' : 'FAIL');
    T.appendEvent(state, 'verdict.issued', { verdict: rawVerdict });
    T.transition(state, 'JUDGE');
    if (!answer) {
      T.transition(state, 'FAILED');
      emitNew(state, eventIndex, opts);
      await persist();
      return {
        state: state, answer: null, runner: runner, verdict: 'FAIL',
        resumable: false, error: 'NO_ANSWER', recovery: recoveryInfo
      };
    }
    var finalVerdict = rawVerdict === 'PASS' ? 'PASS' : 'PARTIAL';
    T.transition(state, 'COMPOSE');
    T.transition(state, finalVerdict === 'PASS' ? 'DONE' : 'PARTIAL');
    emitNew(state, eventIndex, opts);
    await persist();
    return {
      state: state, answer: answer, runner: runner, delivery: delivery,
      verdict: finalVerdict, resumed: true, resumable: false,
      error: null, recovery: recoveryInfo
    };
  }

  root.AstroControl = {
    prepare: prepare,
    run: run,
    load: load,
    pause: pause,
    resume: resume,
    contextOf: contextOf,
    successfulStepResults: successfulStepResults,
    maxReplansOf: maxReplansOf
  };
})(typeof window !== 'undefined' ? window : global);
