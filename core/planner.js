/* ASTRUM · Planner（B2）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §4.1/§4.2/§8.7
 *       docs/architecture/05-动态任务编排机制.md §2
 *       docs/architecture/03-目标架构设计.md §3.3
 *
 * 权限收窄（三不许）：只用 7 个模板、不删核心步骤、不设预算/不决定停止。
 * 只生成 Plan，不执行任何 Agent 或工具。
 */
(function (root) {
  'use strict';

  var TEMPLATES = {
    'T-A': {
      label: 'target + knowledge',
      tools: ['kb.lookup', 'kepler.ephemeris', 'compose.target'],
      compose: true
    },
    'T-B': {
      label: 'tonight',
      tools: ['kepler.visibility', 'compose.simple'],
      compose: true
    },
    'T-C': {
      label: 'observe/photo + why',
      tools: ['kepler.ephemeris', 'kb.lookup', 'compose.target', 'compose.domain'],
      compose: true
    },
    'T-D': {
      label: 'compare multi-target',
      tools: ['kepler.ephemeris', 'compare.curate'],
      compose: false
    },
    'T-E': {
      label: 'paper / latest research',
      tools: ['simbad.tap', 'paper.search', 'evidence.search', 'compose.domain'],
      compose: true
    },
    'T-F': {
      label: 'controversy',
      tools: ['simbad.tap', 'evidence.search', 'kepler.ephemeris'],
      compose: false,
      postCritic: true
    },
    'T-G': {
      label: 'system-view',
      tools: ['compose.simple', 'compose.target', 'compose.domain'],
      compose: true
    }
  };

  var TARGET_INTENTS = ['observe-target', 'knowledge-target', 'intro-target'];

  function PlannerError(code, message, path) {
    var e = new Error(message);
    e.name = 'AstroPlannerError';
    e.code = code;
    if (path) e.path = path;
    return e;
  }

  function includes(list, v) { return list.indexOf(v) >= 0; }

  function composeForIntent(intent) {
    if (includes(['observe-target', 'knowledge-target', 'intro-target'], intent)) return 'compose.target';
    if (includes(['cosmos', 'nova', 'helios', 'photo-target', 'gear-fit'], intent)) return 'compose.domain';
    return 'compose.simple';
  }

  function namesOf(targets) {
    if (root.AstroRouter && root.AstroRouter.namesOf) return root.AstroRouter.namesOf(targets);
    var out = [];
    (targets || []).forEach(function (t) {
      var it = t && t.item ? t.item : t;
      if (!it) return;
      var n = root.AgentCore && root.AgentCore.nameOf ? root.AgentCore.nameOf(it) : (it.cn || it.en || it.id || it.key);
      if (n) out.push(n);
    });
    return out;
  }

  /* 研究检索不能把整句中文问题直接丢给 OpenAlex/Semantic Scholar：
   * “M42 的距离是多少？不同论文的测量是否一致？” 会被当成普通中文短语，
   * 返回大量无关的中文论文。这里用“英文目标名 + 1–2 个主题词”构造检索式，
   * 目标名仍由既有实体索引给出，不引入新的模型或外部服务。 */
  var RESEARCH_TERMS = [
    { re: /距离|distance|parallax|视差/i, terms: ['distance'] },
    { re: /测量|测距|measurement|measure/i, terms: ['measurement'] },
    { re: /一致|分歧|比较|差异|不同|controvers|disagree|tension/i, terms: ['comparison'] },
    { re: /年龄|age/i, terms: ['age'] },
    { re: /质量|mass/i, terms: ['mass'] },
    { re: /半径|大小|size|radius/i, terms: ['radius'] },
    { re: /温度|temperature/i, terms: ['temperature'] },
    { re: /金属|化学成分|abundance|metallicity/i, terms: ['metallicity'] },
    { re: /形成|演化|formation|evolution/i, terms: ['formation'] },
    { re: /光谱|spectroscopy|spectra/i, terms: ['spectroscopy'] },
    { re: /自转|rotation/i, terms: ['rotation'] },
    { re: /磁场|magnetic/i, terms: ['magnetic field'] },
    { re: /观测|拍摄|imaging|observation/i, terms: ['observation'] }
  ];

  function researchQueryOf(b) {
    var target = b.names[0] || '';
    var en = target;
    if (target && root.Sources && typeof root.Sources.enQueryFor === 'function') {
      try { en = root.Sources.enQueryFor(target) || target; } catch (e) { en = target; }
    }
    var terms = [], seen = {};
    RESEARCH_TERMS.forEach(function (p) {
      if (terms.length >= 2 || !p.re.test(b.query)) return;
      p.terms.forEach(function (t) {
        if (terms.length >= 2 || seen[t]) return;
        seen[t] = 1;
        terms.push(t);
      });
    });
    var q = [en || target].concat(terms).join(' ').replace(/\s+/g, ' ').trim();
    return q || b.query;
  }

  function jdOf(ctx) {
    if (root.Astro && root.Astro.fromLocal) {
      return root.Astro.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    }
    return 0;
  }

  function chooseTemplate(input) {
    var route = input.route || {};
    var q = String(input.query || '');
    var intent = input.intent || route.intent;
    var targets = input.targets || [];

    if (route.legacy) return null;
    if (input.forceCompare) return 'T-D';
    /* 研究类问题优先于目标模板：D7 需要 T-E/T-F 进入真实论文/证据流水线 */
    if (route.mode === 'research' || /论文|最新进展|研究|综述/.test(q)) {
      if (/争议|分歧|不同观点/.test(q)) return 'T-F';
      return 'T-E';
    }
    /* compare 必须排在 TARGET_INTENTS 之前：
     * “比较 M31 和 M33”同时是 observe-target，旧顺序会错选 T-A 单目标模板。 */
    if (route.mode === 'compare') return 'T-D';
    if (includes(TARGET_INTENTS, intent)) return 'T-A';
    if (intent === 'tonight') return 'T-B';
    if ((intent === 'observe-target' || intent === 'photo-target') && /为什么|机制|原理/.test(q)) return 'T-C';
    if (intent === 'system-view') return 'T-G';
    return null;   /* 无匹配 → LEGACY，不创造第 8 个模板 */
  }

  function base(input) {
    var ctx = input.ctx || {};
    var route = input.route || {};
    var routeNames = Array.isArray(route.targets) ? route.targets : [];
    return {
      query: String(input.query || ''),
      intent: input.intent || route.intent || 'unknown',
      names: routeNames.length ? routeNames.slice() : namesOf(input.targets || [], input.query),
      jd: jdOf(ctx),
      place: { lat: ctx.lat, lon: ctx.lon }
    };
  }

  function hasCoordTarget(targets) {
    return (targets || []).some(function (t) {
      var it = t && t.item ? t.item : t;
      return it && (it.kind === 'star' || it.kind === 'dso' || it.kind === 'planet' || it.kind === 'moon' || it.kind === 'sun');
    });
  }

  function makeStep(id, tool, args, deps, parallel, critical, optional) {
    return {
      id: id,
      tool: tool,
      args: args,
      deps: deps || [],
      parallel: !!parallel,
      critical: !!critical,
      optional: !!optional
    };
  }

  var BUILDERS = {
    'T-A': function (input, b) {
      var name = b.names[0] || b.query;
      return [
        makeStep('t1', 'kb.lookup', { query: b.query, targets: b.names }, [], true, false),
        makeStep('t2', 'kepler.ephemeris', { target: name, jd: b.jd, place: b.place }, [], true, false),
        makeStep('t3', 'compose.target', { query: b.query, intent: b.intent, from: ['t1', 't2'] }, ['t1', 't2'], false, true)
      ];
    },
    'T-B': function (input, b) {
      return [
        makeStep('t1', 'kepler.visibility', { targets: b.names, jd: b.jd, place: b.place }, [], false, true),
        makeStep('t2', 'compose.simple', { query: b.query, intent: b.intent, from: ['t1'] }, ['t1'], false, true)
      ];
    },
    'T-C': function (input, b) {
      var compose = composeForIntent(b.intent);
      return [
        makeStep('t1', 'kepler.ephemeris', { target: b.names[0] || b.query, jd: b.jd, place: b.place }, [], true, false),
        makeStep('t2', 'kb.lookup', { query: b.query, targets: b.names }, [], true, false),
        makeStep('t3', compose, { query: b.query, intent: b.intent, from: ['t1', 't2'] }, ['t1', 't2'], false, true)
      ];
    },
    'T-D': function (input, b) {
      var steps = [], names = b.names.length ? b.names : [b.query], i;
      for (i = 0; i < names.length; i++) {
        steps.push(makeStep('t' + (i + 1), 'kepler.ephemeris',
          { target: names[i], jd: b.jd, place: b.place }, [], true, false));
      }
      var deps = steps.map(function (s) { return s.id; });
      steps.push(makeStep('t' + (steps.length + 1), 'compare.curate',
        { query: b.query, items: deps }, deps, false, true));
      return steps;
    },
    'T-E': function (input, b) {
      var first = b.names[0] || b.query;
      var search = researchQueryOf(b);
      return [
        makeStep('t1', 'simbad.tap', { query: first }, [], true, false, true),
        makeStep('t2', 'paper.search', { query: search }, [], true, true, false),
        makeStep('t3', 'evidence.search', { query: search, direction: 'counter' }, [], false, true, false),
        makeStep('t4', 'compose.domain', { query: b.query, intent: b.intent, from: ['t1', 't2', 't3'] }, ['t1', 't2', 't3'], false, true, false)
      ];
    },
    'T-F': function (input, b) {
      var search = researchQueryOf(b);
      var steps = [
        makeStep('t1', 'simbad.tap', { query: b.names[0] || b.query }, [], true, false, true),
        makeStep('t2', 'evidence.search', { query: search, direction: 'positive' }, [], true, true, false),
        makeStep('t3', 'evidence.search', { query: search, direction: 'negative' }, [], true, true, false)
      ];
      if (hasCoordTarget(input.targets || [])) {
        steps.push(makeStep('t4', 'kepler.ephemeris',
          { target: b.names[0] || b.query, jd: b.jd, place: b.place }, [], false, false, true));
      }
      return steps;
    },
    'T-G': function (input, b) {
      return [
        makeStep('t1', 'compose.simple', { query: b.query, intent: b.intent, from: [] }, [], false, true)
      ];
    }
  };

  function estimatePlan(plan, registry) {
    var out = { ms: 0, tokens: 0, searches: 0, parallel: 0, steps: 0 };
    if (!plan || !Array.isArray(plan.steps)) return out;
    out.steps = plan.steps.length;
    plan.steps.forEach(function (s) {
      var spec = registry && registry.get ? registry.get(s.tool) : null;
      var cost = (spec && spec.cost) || {};
      out.ms += cost.ms || 0;
      out.tokens += cost.tokens || 0;
      out.searches += cost.searches || 0;
      if (s.parallel === true) out.parallel += 1;
    });
    return out;
  }

  function explainPlan(plan, template) {
    var tpl = TEMPLATES[template] || {};
    var explanation = {
      template: template,
      label: tpl.label || '',
      why: '按模板 ' + template + ' 组装固定步骤，避免无限制动态生成',
      steps: []
    };
    (plan.steps || []).forEach(function (s) {
      var why = s.tool.indexOf('compose.') === 0
        ? '汇总前序取数结果，串行生成最终回答'
        : (s.deps && s.deps.length ? '依赖 ' + s.deps.join(',') + ' 的结果' : '独立取数/计算，可与同批步骤并行');
      explanation.steps.push({ id: s.id, tool: s.tool, why: why, deps: (s.deps || []).slice() });
    });
    return explanation;
  }

  function buildPlan(input) {
    var template = chooseTemplate(input);
    if (!template) return null;
    var b = base(input);
    var steps = BUILDERS[template](input, b);
    var plan = {
      template: template,
      steps: steps,
      reason: (input.route && input.route.reason ? input.route.reason : '') + ' → ' + template,
      postCritic: !!(TEMPLATES[template].postCritic)
    };
    plan.estimate = estimatePlan(plan, input.registry);
    plan.explanation = explainPlan(plan, template);
    return plan;
  }

  function toolIdOf(spec) {
    return typeof spec === 'string' ? spec : (spec && spec.id);
  }

  function validate(plan, opts) {
    opts = opts || {};
    var errors = [];
    function err(path, reason) { errors.push({ path: path, reason: reason }); }

    if (!plan || typeof plan !== 'object') {
      return { ok: false, errors: [{ path: '$', reason: 'Plan 必须是对象' }] };
    }
    var tpl = TEMPLATES[plan.template];
    if (!tpl) err('$.template', '模板 id 不在 T-A..T-G');
    if (!Array.isArray(plan.steps) || !plan.steps.length) {
      err('$.steps', 'steps 必须是非空数组');
      return { ok: false, errors: errors };
    }
    if (plan.steps.length > 8) err('$.steps', '步骤数超过上限 8');

    var ids = {}, i, j;
    for (i = 0; i < plan.steps.length; i++) {
      var s = plan.steps[i], p = '$.steps[' + i + ']';
      if (!s || typeof s !== 'object') { err(p, '步骤必须是对象'); continue; }
      if (typeof s.id !== 'string' || !s.id) err(p + '.id', 'stepId 必须非空');
      else if (Object.prototype.hasOwnProperty.call(ids, s.id)) err(p + '.id', 'stepId 重复: ' + s.id);
      else ids[s.id] = i;
      if (typeof s.tool !== 'string' || !s.tool) err(p + '.tool', 'tool 必须非空');
      if (!Array.isArray(s.deps)) err(p + '.deps', 'deps 必须是数组');
      if (s.parallel === true && typeof s.tool === 'string' && s.tool.indexOf('compose.') === 0) {
        err(p + '.parallel', 'compose 步骤不得并行');
      }
      if (tpl && s.tool && !includes(tpl.tools, s.tool)) {
        err(p + '.tool', '工具不在模板 ' + plan.template + ' 定义内');
      }
      if (s.deps && s.deps.length) {
        for (j = 0; j < s.deps.length; j++) {
          if (!Object.prototype.hasOwnProperty.call(ids, s.deps[j])) {
            err(p + '.deps[' + j + ']', '依赖不存在或尚未定义: ' + s.deps[j]);
          }
        }
      }
    }

    /* 依赖无环（DFS） */
    var mark = {};
    function dfs(id) {
      if (mark[id] === 1) return false;
      if (mark[id] === 2) return true;
      mark[id] = 1;
      var step = plan.steps[ids[id]];
      var deps = (step && step.deps) || [];
      for (var k = 0; k < deps.length; k++) {
        if (ids[deps[k]] !== undefined && !dfs(deps[k])) return false;
      }
      mark[id] = 2;
      return true;
    }
    Object.keys(ids).forEach(function (id) { if (!dfs(id)) err('$.steps', '依赖存在环'); });

    /* 模板必需能力 */
    if (tpl && tpl.compose) {
      var hasCompose = plan.steps.some(function (s) { return typeof s.tool === 'string' && s.tool.indexOf('compose.') === 0; });
      if (!hasCompose) err('$.steps', '模板 ' + plan.template + ' 缺少 compose 步骤');
    }
    var hasCritical = plan.steps.some(function (s) { return s && s.critical === true; });
    if (!hasCritical) err('$.steps', '至少需要一个 critical 步骤');

    /* 工具存在 + 参数 Schema */
    if (opts.registry && tpl) {
      for (i = 0; i < plan.steps.length; i++) {
        s = plan.steps[i];
        var spec = opts.registry.get ? opts.registry.get(s.tool) : null;
        if (!spec) {
          err('$.steps[' + i + '].tool', '工具未注册: ' + s.tool);
          continue;
        }
        if (opts.registry.validateArgs) {
          var vr = opts.registry.validateArgs(s.tool, s.args || {});
          if (!vr.ok) {
            vr.errors.forEach(function (e) {
              err('$.steps[' + i + '].args' + (e.path === '$' ? '' : e.path.slice(1)), e.reason);
            });
          }
        }
        if (opts.registry.checkDeps) {
          var dr = opts.registry.checkDeps(s.tool);
          if (!dr.ok) err('$.steps[' + i + '].tool', dr.reason);
        }
      }
    } else if (opts.capabilities) {
      var caps = opts.capabilities.map(toolIdOf);
      for (i = 0; i < plan.steps.length; i++) {
        if (!includes(caps, plan.steps[i].tool)) err('$.steps[' + i + '].tool', '能力表无此工具');
      }
    }

    /* 预算：只校验已知成本字段，不改变旧调用（未传 budget 时跳过） */
    if (opts.budget && opts.budget.limit) {
      var est = plan.estimate || estimatePlan(plan, opts.registry);
      ['ms', 'searches', 'parallel'].forEach(function (f) {
        var lim = opts.budget.limit[f];
        if (typeof lim === 'number' && est[f] > lim) {
          err('$.budget', f + ' 估算 ' + est[f] + ' 超出 limit ' + lim);
        }
      });
    }

    return { ok: errors.length === 0, errors: errors };
  }

  function assertValid(plan, opts) {
    var r = validate(plan, opts);
    if (!r.ok) {
      throw PlannerError('E_PLAN_INVALID',
        'Plan 校验失败: ' + r.errors.map(function (e) { return e.path + ' ' + e.reason; }).join('; '),
        r.errors[0] && r.errors[0].path);
    }
    return true;
  }

  function plan(input) {
    var p = buildPlan(input || {});
    if (!p) return null;
    assertValid(p, input || {});
    return p;
  }

  /* C4：有限重规划。只修复“汇总步骤”的依赖集合，不生成新模板、不重跑已成功步骤。
   * 返回 null 表示无法安全重规划（交由 Control 走失败路径）。 */
  function replan(plan, state, reason, opts) {
    opts = opts || {};
    if (!plan || !state || !Array.isArray(plan.steps)) return null;
    var settledBad = ['failed', 'blocked', 'aborted', 'skipped'];
    var okIds = [], badIds = [];
    (state.steps || []).forEach(function (s) {
      if (s.status === 'ok' && s.result) okIds.push(s.id);
      if (settledBad.indexOf(s.status) >= 0) badIds.push(s.id);
    });
    if (!badIds.length) return null;

    var step = null, depSteps = [];
    var byId = {};
    plan.steps.forEach(function (s) { byId[s.id] = s; });
    var compose = plan.steps.filter(function (s) { return s.tool && s.tool.indexOf('compose.') === 0; })[0];
    var curate = plan.steps.filter(function (s) { return s.tool === 'compare.curate'; })[0];

    if (compose) {
      var cdeps = (compose.deps || []).filter(function (id) { return okIds.indexOf(id) >= 0; });
      if (!cdeps.length) return null;
      var cargs = {};
      Object.keys(compose.args || {}).forEach(function (k) { cargs[k] = compose.args[k]; });
      cargs.from = cdeps.slice();
      step = makeStep(compose.id + 'r', compose.tool, cargs, cdeps, false, true, false);
      depSteps = cdeps.map(function (id) { return byId[id]; }).filter(Boolean);
    } else if (curate) {
      var tdeps = (curate.deps || []).filter(function (id) { return okIds.indexOf(id) >= 0; });
      if (!tdeps.length) return null;
      step = makeStep(curate.id + 'r', 'compare.curate',
        { query: (curate.args && curate.args.query) || '', items: tdeps.slice() }, tdeps, false, true, false);
      depSteps = tdeps.map(function (id) { return byId[id]; }).filter(Boolean);
    } else {
      return null;
    }

    var out = {
      template: plan.template,
      steps: depSteps.concat([step]),
      reason: (reason ? reason + ' → ' : '') + '有限重规划：仅重组可用依赖',
      postCritic: !!plan.postCritic,
      replanned: true,
      dropped: badIds.slice()
    };
    out.estimate = estimatePlan(out, opts.registry);
    out.explanation = explainPlan(out, plan.template);
    assertValid(out, opts);
    return out;
  }

  /* V1.5：Research Loop 的追加步骤。只追加、不改写已完成步骤；只允许研究模板。 */
  function expandQuery(plan, findings, opts, id) {
    var base = String(opts.query || plan.query || '');
    var b = findings && findings.basis && findings.basis[0];
    if (!b) return base + ' 定向补充 ' + (id !== 'x1' ? String(id.slice(1)) : '');
    if (b.code === 'critical_conflict') {
      var ent = String(b.family || '').replace(/\s*\([^)]*\)$/, '');
      var unit = String(b.unit || '');
      var q = (ent ? ent + ' ' : '') + (unit ? unit + ' ' : '') + '测量差异 反证';
      return q.trim() || base + ' 反证 争议';
    }
    if (b.code === 'critical_claim_single_source' && b.text) return b.text + ' 独立验证';
    if ((b.code === 'critical_claim_without_support' || b.code === 'critical_claim_weak_support') && b.text) {
      return b.text + ' 证据补充';
    }
    return base + ' 定向补充 ' + (id !== 'x1' ? String(id.slice(1)) : '');
  }

  function expand(plan, findings, opts) {
    opts = opts || {};
    if (!plan || !Array.isArray(plan.steps)) return null;
    if (plan.template !== 'T-E' && plan.template !== 'T-F') return null;
    var query = String(opts.query || plan.query || '');
    if (!query) return null;

    var basis = (findings && findings.basis) || [];
    var prev = plan.expansion || {};
    var prevKeys = Array.isArray(prev.appendedKeys) ? prev.appendedKeys : [];
    /* 同一缺口键不得重复追加（不同缺口仍可独立追加）。 */
    for (var b = 0; b < basis.length; b++) {
      if (basis[b] && basis[b].key && prevKeys.indexOf(basis[b].key) >= 0) return null;
    }

    var existing = {};
    plan.steps.forEach(function (s) {
      existing[s.id] = 1;
      /* 只对“已追加”的 x 步骤去重；初始计划中的 evidence.search 是基线，可追加定向补充。 */
      if (/^x/.test(String(s.id || '')) && s.tool === 'evidence.search') {
        var q = String((s.args && s.args.query) || '').replace(/\s+/g, '').toLowerCase();
        if (q && q === query.replace(/\s+/g, '').toLowerCase()) existing.sameQuery = 1;
      }
    });
    if (existing.sameQuery) return null;

    var n = 1;
    while (existing['x' + n]) n++;
    var id = 'x' + n;
    var direction = (findings && findings.direction) ? findings.direction
      : ((findings && findings.conflicts && findings.conflicts.length) ? 'counter' : 'positive');
    var finalQuery = expandQuery(plan, findings, opts, id);
    var norm = String(finalQuery).replace(/\s+/g, '').toLowerCase();
    var duplicate = plan.steps.some(function (s) {
      if (!/^x/.test(String(s.id || '')) || s.tool !== 'evidence.search') return false;
      return String((s.args && s.args.query) || '').replace(/\s+/g, '').toLowerCase() === norm;
    });
    if (duplicate) return null;

    var step = makeStep(id, 'evidence.search', {
      query: finalQuery,
      direction: direction
    }, [], true, false, true);

    var out = {
      template: plan.template,
      steps: plan.steps.concat([step]),
      reason: 'Research Loop：基于 findings 追加定向检索',
      postCritic: !!plan.postCritic,
      expanded: true,
      appendReason: (findings && findings.gaps || []).join(',') || 'evidence_gap'
    };
    var keys = basis.map(function (x) { return x && x.key; }).filter(Boolean);
    out.expansion = {
      rounds: (typeof prev.rounds === 'number' ? prev.rounds : 0) + 1,
      appendedKeys: prevKeys.concat(keys),
      basis: (Array.isArray(prev.basis) ? prev.basis : []).concat(basis.map(function (x) {
        return {
          code: x.code || '', key: x.key || '', claimId: x.claimId || null,
          conflictKey: x.conflictKey || null, stepId: id, query: finalQuery
        };
      })),
      conflictKeys: (findings && Array.isArray(findings.conflictKeys))
        ? findings.conflictKeys.slice()
        : (Array.isArray(prev.conflictKeys) ? prev.conflictKeys.slice() : [])
    };
    out.estimate = estimatePlan(out, opts.registry);
    out.explanation = explainPlan(out, plan.template);
    assertValid(out, opts);
    return out;
  }

  root.AstroPlanner = {
    TEMPLATES: TEMPLATES,
    composeForIntent: composeForIntent,
    chooseTemplate: chooseTemplate,
    buildPlan: buildPlan,
    plan: plan,
    validate: validate,
    assertValid: assertValid,
    replan: replan,
    expand: expand,
    estimatePlan: estimatePlan,
    PlannerError: PlannerError
  };
})(typeof window !== 'undefined' ? window : global);
