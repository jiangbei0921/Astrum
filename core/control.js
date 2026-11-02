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
      context: contextOf(ctx),
      budget: T.makeBudget(route.level)
    });
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
      legacy: true
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
    return { adapter: adapter, registry: registry, store: store };
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

  function saveState(store, state) {
    if (!store || typeof store.save !== 'function') return Promise.resolve(null);
    return Promise.resolve(store.save(state)).catch(function () { return null; });
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

    var rt = makeRuntime(opts);
    var prepared = prepare(query, ctx, cfg, {
      registry: rt.registry,
      capabilities: opts.capabilities,
      routeData: opts.routeData || null,
      forceCompare: !!opts.forceCompare
    });
    var state = prepared.state;
    var eventIndex = 0;
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
        }
      });
      state.plan = prepared.plan;
    }
    await saveState(rt.store, state);

    if (prepared.legacy) {
      var legacyAnswer = rt.adapter.deliver(prepared.query, ctx, cfg);
      await saveState(rt.store, state);
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
    var runner = await O.runPlan(prepared.plan, state, {
      registry: rt.registry, ctx: ctx, cfg: cfg, adapter: rt.adapter,
      signal: opts.signal || null
    });

    if (runner && runner.aborted) {
      T.appendEvent(state, 'task.cancelled', { reason: 'user' });
      T.transition(state, 'ABORTED');
      emitNew(state, eventIndex, opts);
      await saveState(rt.store, state);
      return resultOf(prepared, state, runner, null, null, {
        cancelled: true, verdict: 'ABORTED', legacy: false
      });
    }

    /* C4：关键步骤失败且尚有预算 → 仅重组 compose 依赖，保留成功结果 */
    var replans = 0;
    var limit = maxReplansOf(state, opts);
    var currentPlan = prepared.plan;
    while (runner && runner.criticalFailed && replans < limit && !(opts.signal && opts.signal.aborted)) {
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
        signal: opts.signal || null
      });
      currentPlan = newPlan;

      if (runner && runner.aborted) {
        T.appendEvent(state, 'task.cancelled', { reason: 'user' });
        T.transition(state, 'ABORTED');
        emitNew(state, eventIndex, opts);
        await saveState(rt.store, state);
        return resultOf(prepared, state, runner, null, null, {
          cancelled: true, verdict: 'ABORTED', legacy: false
        });
      }
    }

    /* V1.5：Research Loop。只在显式启用时运行，保持旧测试与旧调用默认行为不变。
     * 只追加 evidence.search，不改写已完成步骤；受 appends/searches 预算与 2 轮上限约束。 */
    var appendRounds = 0;
    var research = (runner && runner.answer && runner.answer.research) ? runner.answer.research : null;
    var freshAnswer = null;
    while (opts.researchLoop && appendRounds < 2 && root.AstroEvaluator &&
      root.AstroPlanner && currentPlan && !(opts.signal && opts.signal.aborted)) {
      var decision = null;
      try {
        decision = root.AstroEvaluator.decide({
          state: state, plan: currentPlan,
          research: research || null,
          opts: { query: prepared.query, signal: opts.signal, maxAppends: 2 }
        });
      } catch (e) { decision = null; }
      if (!decision) break;
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
        signal: opts.signal || null
      });
      appendRounds += 1;
      if (runner && runner.aborted) {
        T.appendEvent(state, 'task.cancelled', { reason: 'user' });
        T.transition(state, 'ABORTED');
        emitNew(state, eventIndex, opts);
        await saveState(rt.store, state);
        return resultOf(prepared, state, runner, null, null, {
          cancelled: true, verdict: 'ABORTED', legacy: false
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

    var progressed = state.phase === 'PROGRESS';
    if (progressed) T.transition(state, 'EXECUTE');
    T.transition(state, 'PROGRESS');
    var review = answer && answer.meta && answer.meta.review ? answer.meta.review : null;
    var rawVerdict = review && review.verdict ? review.verdict : (answer ? 'PARTIAL' : 'FAIL');
    T.appendEvent(state, 'verdict.issued', { verdict: rawVerdict });
    T.transition(state, 'JUDGE');

    if (!answer) {
      T.transition(state, 'FAILED');
      emitNew(state, eventIndex, opts);
      await saveState(rt.store, state);
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
    await saveState(rt.store, state);

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
    var state = await store.get(taskId);
    if (!state) return null;
    var resumable = store.isResumable ? store.isResumable(state) : false;
    return { state: state, resumable: resumable, viewOnly: !resumable };
  }

  async function resume(taskId, ctx, cfg, opts) {
    opts = opts || {};
    var T = root.AstroTask;
    var O = root.AstroOrchestrator;
    var loaded = await load(taskId, opts);
    if (!loaded) return null;
    if (!loaded.resumable) {
      return { state: loaded.state, answer: null, resumable: false, viewOnly: true, verdict: 'VIEW_ONLY' };
    }

    var rt = makeRuntime(opts);
    var state = loaded.state;
    var eventIndex = 0;
    (state.steps || []).forEach(function (s) {
      if (s.status === 'running') {
        s.status = 'pending';
        s.error = null;
        s.cancelled = false;
      }
    });
    T.appendEvent(state, 'task.recovered', { reason: 'resume' });
    var runner = await O.runPlan(state.plan, state, {
      registry: rt.registry, ctx: ctx || {}, cfg: cfg, adapter: rt.adapter,
      signal: opts.signal || null
    });
    if (runner && runner.aborted) {
      T.appendEvent(state, 'task.cancelled', { reason: 'user' });
      T.transition(state, 'ABORTED');
      emitNew(state, eventIndex, opts);
      await saveState(rt.store, state);
      return { state: state, answer: null, runner: runner, cancelled: true, verdict: 'ABORTED', resumable: false };
    }

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
    T.transition(state, 'PROGRESS');
    var review = answer && answer.meta && answer.meta.review ? answer.meta.review : null;
    var rawVerdict = review && review.verdict ? review.verdict : (answer ? 'PARTIAL' : 'FAIL');
    T.appendEvent(state, 'verdict.issued', { verdict: rawVerdict });
    T.transition(state, 'JUDGE');
    if (!answer) {
      T.transition(state, 'FAILED');
      emitNew(state, eventIndex, opts);
      await saveState(rt.store, state);
      return { state: state, answer: null, runner: runner, verdict: 'FAIL', resumable: false };
    }
    var finalVerdict = rawVerdict === 'PASS' ? 'PASS' : 'PARTIAL';
    T.transition(state, 'COMPOSE');
    T.transition(state, finalVerdict === 'PASS' ? 'DONE' : 'PARTIAL');
    emitNew(state, eventIndex, opts);
    await saveState(rt.store, state);
    return {
      state: state, answer: answer, runner: runner, delivery: delivery,
      verdict: finalVerdict, resumed: true, resumable: false
    };
  }

  root.AstroControl = {
    prepare: prepare,
    run: run,
    load: load,
    resume: resume,
    contextOf: contextOf,
    successfulStepResults: successfulStepResults,
    maxReplansOf: maxReplansOf
  };
})(typeof window !== 'undefined' ? window : global);
