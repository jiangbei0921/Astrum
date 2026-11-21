/* ASTRUM · P3 Research Goal Adapter
 *
 * 依据：docs/P3/P3-02-自主科研规划与DAG设计.md §2
 *
 * 只做「解析 + 校验」，不访问存储、不调 LLM、不执行工具。
 * 输入沿用 Router 的 route/targets/intent，不新增意图识别。
 */
(function (root) {
  'use strict';

  var MODES = ['single', 'compare', 'research'];
  var PRIORITIES = ['must', 'should', 'nice'];

  var CONSTRAINT_RULES = [
    { re: /只看\s*(\d{4})\s*年?(?:以后|之后|后)/, kind: 'time' },
    { re: /(20\d{2})\s*年?(?:以后|之后|后)/, kind: 'time' },
    { re: /只用\s*(JWST|哈勃|HST|ALMA|FAST|盖亚|Gaia)/i, kind: 'source' },
    { re: /只要\s*(JWST|哈勃|HST|ALMA|FAST|盖亚|Gaia)/i, kind: 'source' },
    { re: /不要(?:用)?模拟|排除模拟|仅实测/, kind: 'source' },
    { re: /预算|花费|成本不超过/, kind: 'budget' }
  ];

  var DOMAIN_BY_INTENT = {
    'cosmos': 'cosmology',
    'nova': 'stellar',
    'helios': 'solar',
    'observe-target': 'observation',
    'knowledge-target': 'knowledge',
    'photo-target': 'astrophotography',
    'tonight': 'observation-planning',
    'gear-fit': 'instrumentation',
    'system-view': 'solar-system'
  };

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function str(v) { return typeof v === 'string' ? v : ''; }

  function goalId() {
    return 'gol_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function constraintList(query) {
    var out = [], seen = {};
    var q = str(query);
    CONSTRAINT_RULES.forEach(function (r) {
      var m = q.match(r.re);
      if (!m) return;
      var text = m[0].trim();
      if (seen[text]) return;
      seen[text] = 1;
      out.push({ id: 'k' + (out.length + 1), kind: r.kind, text: text });
    });
    return out;
  }

  /* 研究目标拆分：仅基于提问结构与目标名，不做语义模型。 */
  function researchObjectives(query, targets) {
    var q = str(query);
    var out = [];
    (targets || []).slice(0, 2).forEach(function (name, i) {
      out.push({
        id: 'o' + (i + 1),
        text: '围绕 ' + name + ' 检索并核验相关研究证据',
        priority: i === 0 ? 'must' : 'should'
      });
    });
    if (!out.length) {
      out.push({
        id: 'o1',
        text: '围绕「' + q.slice(0, 60) + '」检索并核验相关研究证据',
        priority: 'must'
      });
    }
    if (/一致|分歧|争议|不同|tension|controvers/i.test(q)) {
      out.push({
        id: 'o' + (out.length + 1),
        text: '识别不同来源之间的数值分歧并判断是否构成冲突',
        priority: 'must'
      });
    }
    return out.slice(0, 3);
  }

  function compareObjectives(targets, query) {
    var names = (targets || []).slice(0, 2);
    var out = names.map(function (name, i) {
      return { id: 'o' + (i + 1), text: '获取 ' + name + ' 的可比参数', priority: 'must' };
    });
    out.push({
      id: 'o' + (out.length + 1),
      text: '给出 ' + (names.join(' 与 ') || '对比对象') + ' 的差异结论',
      priority: 'must'
    });
    if (/距离|大小|年龄|质量|亮度/.test(str(query))) {
      out.push({ id: 'o' + (out.length + 1), text: '按用户关心的维度对齐比较口径', priority: 'should' });
    }
    return out.slice(0, 3);
  }

  function requestedOutputs(query, mode) {
    var out = [];
    if (/综述|研究进展|最新进展/.test(str(query)) || mode === 'research') out.push('research-summary');
    if (/比较|对比|差异/.test(str(query)) || mode === 'compare') out.push('comparison');
    if (/报告/.test(str(query))) out.push('report');
    return out;
  }

  function fromRoute(routeData, opts) {
    opts = opts || {};
    var data = routeData || {};
    var route = data.route || {};
    var query = str(opts.query || data.query || '');
    var mode = MODES.indexOf(route.mode) >= 0 ? route.mode : 'single';
    var targets = isArray(route.targets) ? route.targets.slice()
      : (isArray(data.targets) ? data.targets.slice() : []);
    var complexity = typeof route.complexity === 'number' ? route.complexity : 0;

    /* single + 低复杂度：不创建 goal，保持 legacy。 */
    if (mode === 'single' && complexity <= 1) {
      return { ok: false, reason: 'legacy', missingInfo: [] };
    }
    if (!query) {
      return { ok: false, reason: 'empty_query', missingInfo: ['缺少问题文本'] };
    }

    var missingInfo = [];
    if (mode === 'compare' && targets.length < 2) missingInfo.push('对比对象不足两个');
    var topicKnown = /(JWST|韦伯|系外行星|星系|暗物质|暗能量|黑洞|宇宙|恒星)/i.test(query);
    if (mode === 'research' && !targets.length && !topicKnown) {
      missingInfo.push('研究对象或研究主题不明确');
    }

    var projectId = opts.projectId || data.projectId || route.projectId || null;
    if (opts.projectId && projectId && opts.projectId !== projectId) {
      return { ok: false, reason: 'project_mismatch', missingInfo: [] };
    }

    var goal = {
      goalId: opts.goalId || goalId(),
      projectId: projectId,
      title: str(opts.title) || query.slice(0, 120),
      description: query,
      objectives: mode === 'compare' ? compareObjectives(targets, query) : researchObjectives(query, targets),
      constraints: constraintList(query),
      context: {
        entities: targets.slice(0, 6),
        timeRange: null,
        domain: DOMAIN_BY_INTENT[data.intent || route.intent] || null,
        priorFindings: []
      },
      requestedOutputs: requestedOutputs(query, mode),
      missingInfo: missingInfo,
      sourceRefs: {
        query: query,
        intent: str(data.intent || route.intent),
        routeReason: str(route.reason)
      },
      createdAt: new Date().toISOString()
    };
    return { ok: true, goal: goal };
  }

  function validate(goal) {
    var errors = [];
    function err(path, reason) { errors.push({ path: path, reason: reason }); }
    if (!isPlainObject(goal)) return { ok: false, errors: [{ path: '$', reason: 'goal 必须是对象' }] };
    if (!str(goal.goalId)) err('$.goalId', 'goalId 必须是非空字符串');
    if (goal.projectId != null && !str(goal.projectId)) err('$.projectId', 'projectId 必须是字符串或 null');
    if (!str(goal.title) || goal.title.length > 120) err('$.title', 'title 必须非空且不超过 120 字');
    if (!str(goal.description)) err('$.description', 'description 必须是非空字符串');
    if (!isArray(goal.objectives) || !goal.objectives.length) err('$.objectives', 'objectives 必须是非空数组');
    (goal.objectives || []).forEach(function (o, i) {
      var p = '$.objectives[' + i + ']';
      if (!isPlainObject(o)) { err(p, 'objective 必须是对象'); return; }
      if (!str(o.id)) err(p + '.id', 'id 必须非空');
      if (!str(o.text)) err(p + '.text', 'text 必须非空');
      if (PRIORITIES.indexOf(o.priority) < 0) err(p + '.priority', 'priority 必须是 must/should/nice');
    });
    if (!isArray(goal.constraints)) err('$.constraints', 'constraints 必须是数组');
    if (!isPlainObject(goal.context)) err('$.context', 'context 必须是对象');
    if (!isArray(goal.requestedOutputs)) err('$.requestedOutputs', 'requestedOutputs 必须是数组');
    if (!isArray(goal.missingInfo)) err('$.missingInfo', 'missingInfo 必须是数组');
    if (!isPlainObject(goal.sourceRefs)) err('$.sourceRefs', 'sourceRefs 必须是对象');
    if (!str(goal.createdAt)) err('$.createdAt', 'createdAt 必须是非空字符串');
    return { ok: errors.length === 0, errors: errors };
  }

  root.AstroResearchGoal = {
    fromRoute: fromRoute,
    validate: validate,
    DOMAIN_BY_INTENT: DOMAIN_BY_INTENT,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
