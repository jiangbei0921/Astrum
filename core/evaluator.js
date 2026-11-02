/* ASTRUM · Progress Evaluator（V1.5 架构修复）
 *
 * 依据：docs/architecture/03-目标架构设计.md §3.5
 *       docs/architecture/05-动态任务编排机制.md §5
 *       docs/architecture/P0-01-目标架构总蓝图.md §4
 *
 * 纯规则，不调 LLM、不构建 Evidence/Claims/Reducer；只返回：
 *   continue / append / replan / stop
 *
 * V1.5：新增可选 research 输入（来自 answer.research.reducer/claims/verdicts），
 * 用于判断 Claims 支持缺口、来源独立性、Reducer 关键冲突与冲突是否消失。
 * research 缺省时保持旧逻辑，旧调用与旧测试不受影响。
 *
 * 设计约束：只有研究模板（T-E/T-F）允许 append；必须消耗 appends/searches
 * 预算；不得与 replan 混为一个循环；不得无限追加；不得新造 Claim/冲突字段。
 */
(function (root) {
  'use strict';

  var RESEARCH_TEMPLATES = ['T-E', 'T-F'];
  var MAX_APPEND_ROUNDS = 2;

  /* 仅这些 gapCode 允许触发追加；其余只记录。 */
  var APPENDABLE = [
    'no_evidence',
    'critical_claim_without_support',
    'critical_claim_weak_support',
    'critical_claim_single_source',
    'critical_claim_not_verified',
    'critical_conflict'
  ];

  /* 单轮只选一个缺口，按优先级从高到低。 */
  var PRIORITY = {
    'no_evidence': 0,
    'critical_claim_without_support': 1,
    'critical_claim_not_verified': 2,
    'critical_conflict': 3,
    'critical_claim_single_source': 4,
    'critical_claim_weak_support': 5,
    'noncritical_conflict': 90,
    'insufficient_information': 99
  };

  function isResearch(plan) {
    return !!(plan && RESEARCH_TEMPLATES.indexOf(plan.template) >= 0);
  }

  function collectEvidence(state) {
    var out = [];
    (state && state.steps || []).forEach(function (s) {
      var r = s && s.result;
      if (!r) return;
      if (Array.isArray(r.items)) out = out.concat(r.items);
      if (Array.isArray(r.evidence)) out = out.concat(r.evidence);
      if (Array.isArray(r.fulltexts)) {
        r.fulltexts.forEach(function (f) {
          if (f && Array.isArray(f.evidence)) out = out.concat(f.evidence);
        });
      }
    });
    return out;
  }

  function collectClaims(opts) {
    if (opts && Array.isArray(opts.claims)) return opts.claims;
    return [];
  }

  function supportOf(claim) {
    if (!claim) return [];
    if (Array.isArray(claim.support)) return claim.support;
    if (Array.isArray(claim.evidenceRefs)) return claim.evidenceRefs;
    return [];
  }

  function appendCount(state) {
    var n = 0;
    (state && state.plan && state.plan.steps || []).forEach(function (s) {
      if (/^x/.test(String(s.id || ''))) n++;
    });
    return n;
  }

  function hasEquivalentSearch(state, query) {
    var q = String(query || '').replace(/\s+/g, '').toLowerCase();
    if (!q) return true;
    return (state && state.plan && state.plan.steps || []).some(function (s) {
      /* 只把“已追加”的检索步骤视为重复；初始计划里的 evidence.search 是基线。 */
      if (!s || !/^x/.test(String(s.id || '')) || s.tool !== 'evidence.search') return false;
      var a = String(s.args && s.args.query || '').replace(/\s+/g, '').toLowerCase();
      /* 只有完全相同的检索式才算重复；目标名包含在完整问题中不是重复。 */
      return a && a === q;
    });
  }

  /* ============================================================
     research 归一化：全部来自现有 answer.research / Reducer 输出
     ============================================================ */

  function normResearch(input) {
    if (!input || !input.research) return null;
    var r = input.research || {};
    var red = r.reducer || {};
    return {
      /* reducer.evidence 是 Reducer 去重后的 canonical Evidence；优先使用，避免报告视图字段混入。 */
      evidence: Array.isArray(red.evidence) ? red.evidence
        : (Array.isArray(r.evidence) ? r.evidence : []),
      claims: Array.isArray(r.claims) ? r.claims
        : (Array.isArray(red.claims) ? red.claims : []),
      verdicts: Array.isArray(r.verdicts) ? r.verdicts
        : (Array.isArray(red.verdicts) ? red.verdicts : []),
      conflicts: Array.isArray(red.conflicts) ? red.conflicts : [],
      differences: Array.isArray(red.differences) ? red.differences : [],
      duplicates: Array.isArray(red.duplicates) ? red.duplicates : [],
      sources: Array.isArray(red.sources) ? red.sources : []
    };
  }

  function evidenceById(evidence) {
    var map = {};
    (evidence || []).forEach(function (ev) {
      if (ev && ev.evidenceId) map[ev.evidenceId] = ev;
    });
    return map;
  }

  function verdictMap(verdicts) {
    var map = {};
    (verdicts || []).forEach(function (v) {
      if (!v) return;
      if (v.claimId) map[v.claimId] = v;
      else if (v.id) map[v.id] = v;
    });
    return map;
  }

  function distinctSources(eids, byId) {
    var sources = [], unknown = false;
    (eids || []).forEach(function (eid) {
      var ev = byId[eid];
      if (!ev || !ev.sourceId) { unknown = true; return; }
      if (sources.indexOf(ev.sourceId) < 0) sources.push(ev.sourceId);
    });
    return { sources: sources, unknown: unknown };
  }

  /* 单个 Claim 的缺口；同一 Claim 只产生一个（避免等价 gapCode 重复）。 */
  function claimGap(claim, byId, vmap) {
    if (!claim || claim.required !== true) return null;
    var support = supportOf(claim);
    var id = String(claim.id || '');
    var text = String(claim.text || '').slice(0, 60);
    function gap(code, suffix, extra) {
      var out = { code: code, key: 'claim:' + id + ':' + suffix, claimId: id, text: text };
      Object.keys(extra || {}).forEach(function (k) { out[k] = extra[k]; });
      return out;
    }
    if (!support.length) return gap('critical_claim_without_support', 'without_support');
    var v = vmap[id] || null;
    /* 只有 R3（存在未处理矛盾）属于可通过补充搜索推进的“未验证”；
     * R2/R4/numeric 属措辞或计算完整性，不是搜索能解决的。 */
    if (v && v.verdict === 'FAIL' && v.rule === 'R3') return gap('critical_claim_not_verified', 'not_verified');
    var got = distinctSources(support.map(function (s) { return s.eid; }), byId);
    if (got.unknown) return gap('insufficient_information', 'unknown_source');
    if (got.sources.length === 1) return gap('critical_claim_single_source', 'single_source');
    var weak = support.every(function (s) {
      return s && (s.strength === 'weak' || s.basis === 'numeric');
    });
    if (weak) return gap('critical_claim_weak_support', 'weak_support');
    return null;
  }

  function conflictKeyOf(cf) {
    return 'conflict:' + String(cf && cf.family || '') + '|' + String(cf && cf.unit || '');
  }

  /* 由“实体|单位”判断上一轮冲突所在的数据范围本轮是否仍被覆盖。
   * 范围消失 ≠ 冲突已解决；只有范围仍可比且本轮无冲突才记为 resolved。 */
  function familyCovered(cf, claims) {
    var R = root.AstroReducer;
    var ent = String(cf && cf.family || '').replace(/\s*\([^)]*\)$/, '').toLowerCase();
    var unit = String(cf && cf.unit || '');
    return (claims || []).some(function (c) {
      return (c.numbers || []).some(function (n) {
        var canon = R && R.unitInfo ? R.unitInfo(n.unit || '').canon : String(n.unit || '');
        return String((c.entities && c.entities[0]) || '').toLowerCase() === ent && (!unit || canon === unit);
      });
    });
  }

  function previousConflictKeys(plan) {
    var keys = plan && plan.expansion && plan.expansion.conflictKeys;
    if (Array.isArray(keys)) return keys.slice();
    return [];
  }

  function conflictGaps(conflicts, claims, plan) {
    var requiredIds = {};
    (claims || []).forEach(function (c) { if (c && c.required === true) requiredIds[c.id] = 1; });
    var details = [], curKeys = [];
    (conflicts || []).forEach(function (cf) {
      var key = conflictKeyOf(cf);
      curKeys.push(key);
      var critical = (cf.values || []).some(function (v) {
        return v && Object.prototype.hasOwnProperty.call(requiredIds, v.id);
      });
      details.push({
        code: critical ? 'critical_conflict' : 'noncritical_conflict',
        key: key,
        conflictKey: key,
        family: cf.family,
        unit: cf.unit
      });
    });
    var prev = previousConflictKeys(plan);
    var resolved = [], unknown = [];
    prev.forEach(function (k) {
      if (curKeys.indexOf(k) >= 0) return;
      var body = k.replace(/^conflict:/, '');
      var cut = body.lastIndexOf('|');
      var cf = { family: body.slice(0, cut), unit: body.slice(cut + 1) };
      if (familyCovered(cf, claims)) resolved.push(k);
      else unknown.push(k);
    });
    return { details: details, currentKeys: curKeys, resolved: resolved, unknown: unknown };
  }

  function sortDetails(list) {
    return list.slice().sort(function (a, b) {
      var pa = PRIORITY[a.code] == null ? 98 : PRIORITY[a.code];
      var pb = PRIORITY[b.code] == null ? 98 : PRIORITY[b.code];
      if (pa !== pb) return pa - pb;
      return String(a.key).localeCompare(String(b.key));
    });
  }

  /* ============================================================
     主决策
     ============================================================ */

  function decide(input) {
    input = input || {};
    var state = input.state || {};
    var plan = input.plan || state.plan || {};
    var opts = input.opts || {};
    var budget = state.budget || { limit: {}, used: {} };
    var limit = budget.limit || {};
    var used = budget.used || {};
    var searchesUsed = used.searches || 0;
    var appendsUsed = used.appends || 0;
    var maxAppends = Math.max(0, Math.min(
      typeof opts.maxAppends === 'number' ? opts.maxAppends : MAX_APPEND_ROUNDS,
      typeof limit.appends === 'number' ? limit.appends : 3
    ));
    var research = normResearch(input);
    var evidence = research ? research.evidence : collectEvidence(state);
    var claims = research ? research.claims : collectClaims(opts);

    if (opts.cancelled || (opts.signal && opts.signal.aborted)) {
      return { action: 'stop', reason: 'cancelled', gaps: [], details: [], evidence: evidence.length };
    }

    var pending = (state.steps || []).some(function (s) {
      return s && (s.status === 'pending' || s.status === 'ready' || s.status === 'running');
    });
    if (pending) {
      return { action: 'continue', reason: 'pending_steps', gaps: [], details: [], evidence: evidence.length };
    }

    if ((used.ms || 0) >= (limit.ms || Infinity) || (used.searches || 0) >= (limit.searches || Infinity)) {
      return { action: 'stop', reason: 'budget_exhausted', gaps: [], details: [], evidence: evidence.length };
    }

    if (state.criticalFailed === true) {
      if ((used.replans || 0) < (limit.replans || 0)) {
        return { action: 'replan', reason: 'critical_failed', gaps: [], details: [], evidence: evidence.length };
      }
      return { action: 'stop', reason: 'replan_exhausted', gaps: [], details: [], evidence: evidence.length };
    }

    if (!isResearch(plan)) {
      return { action: 'stop', reason: 'not_research', gaps: [], details: [], evidence: evidence.length };
    }

    var details = [];
    var resolved = [];
    var counts = {
      evidence: evidence.length,
      independentSources: 0,
      claims: claims.length,
      conflicts: 0
    };

    if (research) {
      var byId = evidenceById(research.evidence);
      var vmap = verdictMap(research.verdicts);
      var seenSource = {};
      research.evidence.forEach(function (ev) {
        if (ev && ev.sourceId && !seenSource[ev.sourceId]) seenSource[ev.sourceId] = 1;
      });
      counts.independentSources = Object.keys(seenSource).length;
      counts.conflicts = research.conflicts.length;

      if (!research.evidence.length) {
        details.push({ code: 'no_evidence', key: 'no_evidence' });
      }
      research.claims.forEach(function (c) {
        var g = claimGap(c, byId, vmap);
        if (g) details.push(g);
      });
      var cg = conflictGaps(research.conflicts, research.claims, plan);
      cg.details.forEach(function (d) { details.push(d); });
      resolved = cg.resolved;
      research.differences.forEach(function (d) {
        details.push({
          code: 'insufficient_information',
          key: 'difference:' + String(d && d.family || '') + '|' + String(d && d.unit || '')
        });
      });
    } else {
      /* 旧路径：不引入新语义，保持原有判定与 reason。 */
      if (!evidence.length) details.push({ code: 'no_evidence', key: 'no_evidence' });
      claims.forEach(function (c) {
        if (!supportOf(c).length) {
          details.push({
            code: 'critical_claim_without_support',
            key: 'claim:' + String(c && c.id || '') + ':without_support',
            claimId: c && c.id
          });
        }
      });
      if (opts.conflicts && opts.conflicts.length) details.push({ code: 'critical_conflict', key: 'conflicts' });
    }

    details = sortDetails(details);
    var gaps = details.map(function (d) { return d.code; });

    var appendedKeys = (plan && plan.expansion && Array.isArray(plan.expansion.appendedKeys))
      ? plan.expansion.appendedKeys.slice() : [];
    var eligible = details.filter(function (d) {
      return APPENDABLE.indexOf(d.code) >= 0 && appendedKeys.indexOf(d.key) < 0;
    });
    var deduped = details.filter(function (d) {
      return APPENDABLE.indexOf(d.code) >= 0 && appendedKeys.indexOf(d.key) >= 0;
    });

    var canAppend = eligible.length > 0 && appendsUsed < maxAppends &&
      searchesUsed < (limit.searches == null ? 3 : limit.searches) &&
      !hasEquivalentSearch(state, opts.query);

    if (canAppend) {
      var pick = eligible[0];
      var direction = (pick.code === 'critical_conflict' || pick.code === 'critical_claim_not_verified')
        ? 'counter' : 'positive';
      return {
        action: 'append',
        reason: gaps.join(',').slice(0, 80),
        gaps: gaps,
        details: details,
        resolved: resolved,
        counts: counts,
        query: opts.query || '',
        direction: direction,
        append: {
          code: pick.code,
          key: pick.key,
          claimId: pick.claimId || null,
          conflictKey: pick.conflictKey || null,
          family: pick.family || null,
          unit: pick.unit || null,
          text: pick.text || null
        },
        evidence: evidence.length,
        appendsUsed: appendsUsed,
        searchesUsed: searchesUsed
      };
    }

    var stopReason = 'criteria_met';
    if (details.length) {
      if (deduped.length && !eligible.length) stopReason = 'duplicate_search';
      else if (eligible.length && appendsUsed >= maxAppends) stopReason = 'append_budget_exhausted';
      else if (eligible.length) stopReason = 'append_budget_or_gap_exhausted';
      else if (gaps.every(function (g) { return APPENDABLE.indexOf(g) < 0; })) stopReason = 'noncritical_only';
      else stopReason = 'append_budget_or_gap_exhausted';
    }

    return {
      action: 'stop',
      reason: stopReason,
      gaps: gaps,
      details: details,
      resolved: resolved,
      counts: counts,
      evidence: evidence.length
    };
  }

  /* 供 Control 记录本轮冲突键（供下一轮判断消失/未知）。 */
  function conflictKeysFrom(decision) {
    if (!decision || !Array.isArray(decision.details)) return [];
    return decision.details.filter(function (d) {
      return d && d.conflictKey;
    }).map(function (d) { return d.conflictKey; });
  }

  root.AstroEvaluator = {
    decide: decide,
    collectEvidence: collectEvidence,
    conflictKeysFrom: conflictKeysFrom,
    MAX_APPEND_ROUNDS: MAX_APPEND_ROUNDS,
    APPENDABLE_GAPS: APPENDABLE,
    version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : global);
