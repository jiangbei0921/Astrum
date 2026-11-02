/* ASTRUM · Router（B1）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §3.1/§4.2
 *       docs/architecture/03-目标架构设计.md §3.2
 *       docs/architecture/05-动态任务编排机制.md §1
 *
 * 职责：把已有 detectIntent 结果转成 RouteDecision，决定 single/compare/research
 * 与是否走 LEGACY。纯规则、纯函数，不执行 Agent、不生成 Plan。
 */
(function (root) {
  'use strict';

  var OBSERVE_INTENTS = ['tonight', 'observe-target', 'photo-target', 'gear-fit', 'chart'];
  var RESEARCH_WORDS = /综述|研究|最新进展|争议|证据|论文/;
  var COMPARE_WORDS = /对比|比较|区别|哪个更|分别|同时|以及/;
  var WHY_WORDS = /为什么|机制|原理/;

  function includes(list, v) {
    return list.indexOf(v) >= 0;
  }

  function isCatalogAlias(k) {
    return /^[a-z0-9]+$/.test(k) && k.length >= 2;
  }

  function countOccurrences(hay, needle) {
    if (!needle) return 0;
    var n = 0, at = 0;
    while ((at = hay.indexOf(needle, at)) >= 0) { n++; at += needle.length; }
    return n;
  }

  /* 目录式编号存在前缀包含：M42 的别名表也会命中 M4。
   * 仅当短编号在查询中没有独立出现（全部落在长编号里）时才丢弃短命中；
   * 「M4 和 M42」这种显式双目标仍保留两个。 */
  function filterTargetCollisions(targets, query) {
    var q = String(query || '').toLowerCase();
    var list = (targets || []).slice();
    var out = [], i, j;
    for (i = 0; i < list.length; i++) {
      var t = list[i];
      var m = String((t && t.match) || '').toLowerCase();
      if (!m || !isCatalogAlias(m)) { out.push(t); continue; }
      var drop = false;
      for (j = 0; j < list.length; j++) {
        var o = list[j];
        var om = String((o && o.match) || '').toLowerCase();
        var sameItem = (t && t.item) === (o && o.item);
        if (j === i || sameItem || !isCatalogAlias(om) || om.length <= m.length) continue;
        if (om.indexOf(m) < 0) continue;
        /* 把长编号整体挖掉后，短编号是否还剩独立出现 */
        var rest = q.split(om).join('');
        if (countOccurrences(rest, m) === 0) { drop = true; break; }
      }
      if (!drop) out.push(t);
    }
    return out;
  }

  function namesOf(targets, query) {
    var filtered = query == null ? (targets || []) : filterTargetCollisions(targets, query);
    var out = [], seen = {}, i;
    for (i = 0; i < filtered.length; i++) {
      var t = filtered[i];
      var item = t && t.item ? t.item : t;
      if (!item) continue;
      var name = root.AgentCore && root.AgentCore.nameOf ? root.AgentCore.nameOf(item) : null;
      if (!name) name = item.cn || item.en || item.id || item.key || '';
      /* 同一个实体可能被多个别名条目命中；优先按命中的 query 片段去重，
       * 否则「M42」会被算成多个目标，误触发 compare/multi-target。 */
      var key = (t && t.match) ? t.match : name;
      if (name && !seen[key]) { seen[key] = 1; out.push(name); }
    }
    return out;
  }

  function hasObservationCalc(intent, targets) {
    if (includes(OBSERVE_INTENTS, intent)) return true;
    if (!targets || !targets.length) return false;
    /* 有可计算坐标的目标（star/dso）视为可触发「计算 + 解释」 */
    for (var i = 0; i < targets.length; i++) {
      var it = targets[i] && targets[i].item ? targets[i].item : targets[i];
      if (it && (it.kind === 'star' || it.kind === 'dso' || it.kind === 'planet' || it.kind === 'moon' || it.kind === 'sun')) return true;
    }
    return false;
  }

  /* 目标提及数：别名表会把 M42 同时命中 m4/m42，不能直接用 targets.length。
   * 以显式并列连词作为多目标信号；单个提及始终按 1 计。 */
  function mentionCount(query, targets) {
    if (!(targets || []).length) return 0;
    if (/和|与|、|以及|vs|versus/i.test(String(query || ''))) return 2;
    return 1;
  }

  /* 05 §1 的复杂度公式；当前 MuseResult 只有单 intent，故「意图数 > 1」计 0。 */
  function complexityOf(query, intent, targets) {
    var q = String(query || '');
    var count = mentionCount(q, targets);
    var score = 0;
    if (count > 1) score += 2;
    if (COMPARE_WORDS.test(q)) score += 1;
    if (WHY_WORDS.test(q) && hasObservationCalc(intent, targets)) score += 1;
    if (RESEARCH_WORDS.test(q)) score += 2;

    if (score >= 4) return { complexity: 4, level: 'L4' };
    if (score >= 2) return { complexity: 3, level: 'L3' };
    if (score === 1) return { complexity: 2, level: 'L2' };
    return { complexity: 1, level: 'L1' };
  }

  function modeOf(query, intent, targets, complexity) {
    var q = String(query || '');
    var count = mentionCount(q, targets);
    if (RESEARCH_WORDS.test(q) || complexity === 4) return 'research';
    if (COMPARE_WORDS.test(q) || count > 1) return 'compare';
    return 'single';
  }

  function branchesOf(mode, intent, names) {
    if (mode === 'compare') {
      return (names.length ? names : ['target']).map(function (n) {
        return { intent: intent, target: n };
      });
    }
    if (mode === 'research') return [{ intent: intent, topic: 'research' }];
    return [{ intent: intent, target: names[0] || null }];
  }

  function route(input) {
    input = input || {};
    var query = String(input.query || '');
    var intent = input.intent || 'unknown';
    var targets = input.targets || [];
    var filtered = filterTargetCollisions(targets, query);
    var names = namesOf(filtered, query);
    var c = complexityOf(query, intent, filtered);
    var mode = modeOf(query, intent, filtered, c.complexity);
    var signals = {
      mentions: mentionCount(query, filtered),
      compare: COMPARE_WORDS.test(query),
      why: WHY_WORDS.test(query),
      research: RESEARCH_WORDS.test(query)
    };

    /* unknown / smalltalk 无领域执行路径，始终 LEGACY */
    var forceLegacy = intent === 'unknown' || intent === 'smalltalk';
    var legacy = forceLegacy || (mode === 'single' && c.complexity === 1);
    var reason;
    if (forceLegacy) reason = 'intent=' + intent + ' 走旧兜底路径';
    else if (legacy) reason = 'single + L1，跳过 Planner';
    else reason = mode + ' / ' + c.level + '，进入 Planner';

    return {
      intent: intent,
      mode: mode,
      complexity: c.complexity,
      level: c.level,
      targets: names,
      branches: branchesOf(mode, intent, names),
      legacy: legacy,
      reason: reason,
      signals: signals
    };
  }

  /* 控制器入口：复用既有 resolveTargets + detectIntent，不复制识别逻辑 */
  function fromQuery(query, ctx, cfg) {
    var AC = root.AgentCore;
    if (!AC) throw new Error('AstroRouter.fromQuery 需要 AgentCore');
    var targets = AC.resolveTargets(query);
    var intent = AC.detectIntent(query, targets);
    return route({ query: query, intent: intent, targets: targets, ctx: ctx, cfg: cfg });
  }

  root.AstroRouter = {
    OBSERVE_INTENTS: OBSERVE_INTENTS,
    complexityOf: complexityOf,
    modeOf: modeOf,
    route: route,
    fromQuery: fromQuery,
    namesOf: namesOf,
    filterTargetCollisions: filterTargetCollisions
  };
})(typeof window !== 'undefined' ? window : global);
