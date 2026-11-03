/* ASTRUM · 统一请求入口（V1.1）
 *
 * 职责：只做一次 Router 识别，然后分流：
 *   L1 / unknown / smalltalk → 旧业务链路（由调用方执行 ask/buildAnswer）
 *   L2-L4 → AstroControl（通过 routeData 复用本次识别结果，避免重复路由）
 *
 * 不重写 ask/buildAnswer；不改变旧 answer/sections/trace/meta 契约。
 * UI 可用 classify() 先判断，再把 routeData 交给 Control.run。
 */
(function (root) {
  'use strict';

  function trim(q) {
    return String(q == null ? '' : q).trim();
  }

  function classify(query, ctx, cfg) {
    var AC = root.AgentCore;
    var R = root.AstroRouter;
    if (!AC || !R) throw new Error('AstroRequest 依赖 AgentCore/AstroRouter');
    var q = trim(query);
    var targets = AC.resolveTargets(q);
    /* Control 路径也必须做指代消解：上一轮的主体在 MEMORY 里，
     * 否则「上一条回答中那个星团…」会把 targets 留空，检索式退化成 "age"。
     * buildAnswer（legacy）已有同样的消解，这里复用同一个函数。 */
    if (typeof AC.resolveByMemory === 'function') {
      var mem = AC.resolveByMemory(q, targets);
      targets = mem.targets;
    }
    var intent = AC.detectIntent(q, targets);
    var route = R.route({ query: q, intent: intent, targets: targets, ctx: ctx, cfg: cfg });
    return {
      query: q,
      intent: intent,
      targets: targets,
      route: route,
      legacy: !!route.legacy,
      control: !route.legacy && typeof route.complexity === 'number' && route.complexity >= 2,
      /* Control.prepare 可直接复用，避免第二次 resolveTargets/detectIntent/route */
      routeData: { intent: intent, targets: targets, route: route }
    };
  }

  async function handle(query, ctx, cfg, opts) {
    opts = opts || {};
    var c = classify(query, ctx, cfg);
    if (c.legacy || opts.forceLegacy) {
      var legacyAnswer = null;
      if (typeof opts.legacyAnswer === 'function') {
        legacyAnswer = opts.legacyAnswer(c.query, ctx, cfg);
      } else if (root.AgentCore && root.AgentCore.buildAnswer) {
        legacyAnswer = root.AgentCore.buildAnswer(c.query, ctx, cfg || root.AgentCore.defaultConfig());
      }
      return {
        mode: 'legacy', route: c.route, intent: c.intent, targets: c.targets,
        answer: legacyAnswer, research: null, control: null
      };
    }

    if (!root.AstroControl || typeof root.AstroControl.run !== 'function') {
      var fallback = root.AgentCore.buildAnswer(c.query, ctx, cfg || root.AgentCore.defaultConfig());
      return {
        mode: 'legacy', route: c.route, intent: c.intent, targets: c.targets,
        answer: fallback, research: null, control: null, fallbackReason: 'control_missing'
      };
    }

    var controlOpts = {
      routeData: c.routeData,
      adapter: opts.adapter,
      registry: opts.registry,
      store: opts.store,
      signal: opts.signal,
      network: opts.network,
      maxReplans: opts.maxReplans,
      onEvent: opts.onEvent,
      capabilities: opts.capabilities,
      attachmentsEvidence: opts.attachmentsEvidence || null,
      fulltext: opts.fulltext,
      forceCompare: opts.forceCompare
    };
    var result = await root.AstroControl.run(c.query, ctx, cfg, controlOpts);
    return {
      mode: 'control', route: result.route || c.route,
      intent: c.intent, targets: c.targets,
      answer: result.answer,
      research: result.answer && result.answer.research ? result.answer.research : null,
      control: result,
      cancelled: !!result.cancelled,
      verdict: result.verdict
    };
  }

  root.AstroRequest = {
    classify: classify,
    handle: handle,
    version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : global);
