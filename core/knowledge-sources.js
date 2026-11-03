/* ASTRUM · 知识来源分类与检索路由（V1.10）
 *
 * 四类来源必须明确区分：
 *   user     用户主动上传/导入的资料（没有上传就不能声称存在）
 *   system   ASTRUM 自带的系统内置知识（data/knowledge.js、星表、本地规则）
 *   external 真实调用的外部科研来源（OpenAlex/arXiv/SIMBAD 等）
 *   model    Provider 模型基于预训练知识生成的内容
 *
 * 本模块只做分类、路由建议、真实执行状态汇总与用户文案，不执行工具、
 * 不生成证据、不修改 Claim/evidenceRefs。
 */
(function (root) {
  'use strict';

  var USER = 'user', SYSTEM = 'system', EXTERNAL = 'external', MODEL = 'model';
  var LABEL = {
    user: '用户上传资料',
    system: '系统内置知识',
    external: '外部科研资料',
    model: '模型已有知识'
  };
  var STATUS_LABEL = {
    used: '已读取',
    hit: '有命中',
    miss: '未命中',
    ok: '已获取',
    partial: '部分失败',
    failed: '不可用',
    skipped: '未调用',
    none: '无用户资料',
    'not-used': '未使用'
  };

  var RESEARCH_TERMS = /论文|文献|研究|测量|观测|证据|争议|一致性|不同结果|最新|进展|JWST|韦伯|arXiv|DOI/i;
  var LATEST_TERMS = /最新|最近|进展|新发现|202[0-9]|JWST|韦伯|发现/i;
  var COMPARE_TERMS = /对比|比较|不同论文|不同研究|是否一致|一致性|差异|争议|冲突/;
  var PARAM_TERMS = /距离|质量|年龄|温度|半径|直径|金属丰度|视差|自行|光度|不确定|误差|测量值/;
  var CONCEPT_TERMS = /什么是|是什么|原理|为什么|为何|机制|意味着|含义|怎么形成|如何形成/;

  var EXTERNAL_TOOLS = /^(paper\.search|evidence\.search|simbad\.tap|web\.search|wiki\.search|crossref|openalex|arxiv|ads|vizier|semantic)/i;

  function trim(s) { return String(s == null ? '' : s).trim(); }
  function uniq(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) {
      if (!x || seen[x]) return;
      seen[x] = 1;
      out.push(x);
    });
    return out;
  }

  function hasTargetKind(targets, kind) {
    return (targets || []).some(function (t) {
      var it = t && t.item ? t.item : t;
      return it && it.kind === kind;
    });
  }

  /* 问题需要哪类来源。只做规则判断，不臆测工具是否已执行。 */
  function decide(input) {
    input = input || {};
    var q = trim(input.query);
    var intent = input.intent || '';
    var targets = input.targets || [];
    var attachments = input.attachments || [];
    var hasKb = hasTargetKind(targets, 'kb');
    var hasBody = hasTargetKind(targets, 'planet') || hasTargetKind(targets, 'sun') || hasTargetKind(targets, 'moon');
    var research = RESEARCH_TERMS.test(q);
    var latest = LATEST_TERMS.test(q);
    var compare = COMPARE_TERMS.test(q);
    var param = PARAM_TERMS.test(q);
    var concept = CONCEPT_TERMS.test(q);
    var user = attachments.length > 0;
    var targetParam = param && !hasKb && !hasBody && targets.length > 0;
    var externalRequired = !!(latest || compare || targetParam ||
      (research && !hasKb) || intent === 'unknown');
    var modelAllowed = !!(concept || !externalRequired);
    var reasons = [];
    if (user) reasons.push('存在用户上传资料，优先读取用户资料');
    if (hasKb && !latest && !compare) reasons.push('系统内置知识命中目标，可作为基础事实');
    if (latest) reasons.push('问题涉及最新进展，必须查询外部科研来源');
    if (compare) reasons.push('多论文比较需要外部论文检索');
    if (targetParam) reasons.push('目标缺少内置条目，参数问题应优先查专业数据库/论文');
    if (concept && !externalRequired) reasons.push('基础概念可先用模型解释，必要时再检索');
    if (!user && !attachments.length) reasons.push('本次没有用户上传资料，不声称用户知识库');
    return {
      user: user,
      userFirst: user,
      systemAllowed: true,
      systemFirst: !user && !externalRequired,
      externalRequired: externalRequired,
      modelAllowed: modelAllowed,
      latest: latest,
      compare: compare,
      targetParam: targetParam,
      research: research,
      concept: concept,
      reasons: reasons
    };
  }

  function externalStatus(steps) {
    var seen = {}, ok = 0, failed = 0, tools = [], failures = [];
    (steps || []).forEach(function (s) {
      var tool = String((s && (s.tool || (s.result && s.result.tool) ||
        (s.result && s.result.provenance && s.result.provenance.tool))) || '');
      if (!EXTERNAL_TOOLS.test(tool)) return;
      var status = s.status || 'ok';
      if (seen[tool]) return;
      seen[tool] = 1;
      tools.push(tool);
      if (status === 'ok' || status === 'skipped') {
        if (status === 'ok') ok++;
      } else {
        failed++;
        failures.push(tool + (s.error ? '（' + String(s.error).slice(0, 40) + '）' : ''));
      }
    });
    if (!tools.length) return { status: 'skipped', attempted: false, ok: 0, failed: 0, tools: [], failures: [] };
    if (!failed) return { status: 'ok', attempted: true, ok: ok, failed: 0, tools: tools, failures: [] };
    if (!ok) return { status: 'failed', attempted: true, ok: 0, failed: failed, tools: tools, failures: failures };
    return { status: 'partial', attempted: true, ok: ok, failed: failed, tools: tools, failures: failures };
  }

  function externalFromResearch(rec) {
    if (!rec) return { status: 'skipped', attempted: false, ok: 0, failed: 0, tools: [], failures: [] };
    var ev = (rec.evidence || []).length;
    var errors = rec.errors || [];
    var tools = uniq((rec.rounds || []).map(function (r) {
      return (r.queries || []).length + ' 轮查询';
    }));
    if (ev > 0 && errors.length) return { status: 'partial', attempted: true, ok: ev, failed: errors.length, tools: tools, failures: [] };
    if (ev > 0) return { status: 'ok', attempted: true, ok: ev, failed: 0, tools: tools, failures: [] };
    if (errors.length) return { status: 'failed', attempted: true, ok: 0, failed: errors.length, tools: tools, failures: [] };
    return { status: 'skipped', attempted: false, ok: 0, failed: 0, tools: [], failures: [] };
  }

  function systemHitOf(answer, opts) {
    if (opts && opts.systemHit != null) return !!opts.systemHit;
    var targets = (answer && answer.targets) || [];
    if (hasTargetKind(targets, 'kb')) return true;
    if (answer && answer.meta && answer.meta.target) return true;
    if (answer && answer.meta && answer.meta.computed) return true;
    return (answer && answer.sections || []).some(function (s) {
      return s.kind === 'evidence' && /依据|系统内置|本地知识/.test(String(s.title || '')) &&
        (s.items || []).length > 0;
    });
  }

  function modelStatusOf(answer, opts) {
    var m = (opts && opts.model) || (answer && answer.meta && answer.meta.cloudExpression) || null;
    if (!m) return { status: 'not-used', ok: false };
    if (m.code === 'ok' || m.ok === true) return { status: 'ok', ok: true };
    if (m.code === 'cancelled') return { status: 'not-used', ok: false };
    return { status: 'failed', ok: false };
  }

  function message(kind, status) {
    if (kind === SYSTEM && status === 'miss') {
      return '系统内置知识中暂未找到相关内容，尚未完成外部科研资料核验。';
    }
    if (kind === EXTERNAL && status === 'failed') {
      return '部分科研数据源暂时不可用，本次结果可能不完整。';
    }
    if (kind === EXTERNAL && status === 'skipped') {
      return '本次未调用外部科研来源，仅依据系统内置知识与模型解释。';
    }
    if (kind === EXTERNAL && status === 'ok') {
      return '已查询当前可用的外部科研来源。';
    }
    if (kind === MODEL && status === 'ok') {
      return '模型表述仅用于组织与解释已有材料，不构成新的科研证据。';
    }
    if (kind === MODEL && status === 'failed') {
      return '模型表述不可用，已保留证据链结论。';
    }
    if (kind === USER && status === 'none') {
      return '本次没有用户上传资料；系统不会把内置知识称为用户知识库。';
    }
    return '';
  }

  function rowsOf(answer, opts) {
    opts = opts || {};
    var plan = opts.plan || decide({
      query: (answer && answer.query) || '',
      intent: opts.intent || (answer && answer.intent),
      targets: (answer && answer.targets) || opts.targets || [],
      attachments: opts.attachments || []
    });
    var userStatus = opts.attachments && opts.attachments.length ? 'used' : 'none';
    var sysHit = systemHitOf(answer, opts);
    var ext = opts.external || externalStatus(opts.steps);
    var model = modelStatusOf(answer, opts);
    return [
      {
        key: USER, label: LABEL[USER], status: userStatus,
        detail: userStatus === 'used'
          ? '已读取 ' + opts.attachments.length + ' 个用户附件；只代表用户上传内容'
          : '本次没有用户上传资料'
      },
      {
        key: SYSTEM, label: LABEL[SYSTEM], status: sysHit ? 'hit' : 'miss',
        detail: sysHit ? '本地知识库/星表命中，作为基础事实' : message(SYSTEM, 'miss')
      },
      {
        key: EXTERNAL, label: LABEL[EXTERNAL], status: ext.status,
        detail: ext.attempted
          ? (ext.status === 'ok'
            ? '已调用：' + (ext.tools.length ? ext.tools.join('、') : '外部科研来源')
            : ext.status === 'partial'
              ? '部分来源失败：' + (ext.failures.length ? ext.failures.join('、') : ext.failed + ' 项失败')
              : '外部来源不可用：' + (ext.failures.length ? ext.failures.join('、') : '全部失败'))
          : message(EXTERNAL, 'skipped')
      },
      {
        key: MODEL, label: LABEL[MODEL], status: model.status,
        detail: message(MODEL, model.status)
      }
    ];
  }

  function attach(answer, opts) {
    opts = opts || {};
    if (!answer || typeof answer !== 'object') return answer;
    var plan = opts.plan || decide({
      query: (answer && answer.query) || '',
      intent: opts.intent || (answer && answer.intent),
      targets: (answer && answer.targets) || opts.targets || [],
      attachments: opts.attachments || []
    });
    var rows = rowsOf(answer, Object.assign({}, opts, { plan: plan }));
    answer.meta = answer.meta || {};
    answer.meta.sourcePlan = {
      rows: rows,
      classes: rows.map(function (r) { return r.key; }),
      externalRequired: !!plan.externalRequired,
      reasons: plan.reasons || []
    };
    answer.sections = (answer.sections || []).filter(function (s) { return s.kind !== 'sources'; });
    var sec = { kind: 'sources', title: '知识来源与执行状态', items: rows };
    var at = (answer.sections || []).length;
    for (var i = 0; i < answer.sections.length; i++) {
      if (answer.sections[i].kind === 'followup') { at = i; break; }
    }
    answer.sections.splice(at, 0, sec);
    return answer;
  }

  root.AstroKnowledgeSources = {
    USER: USER, SYSTEM: SYSTEM, EXTERNAL: EXTERNAL, MODEL: MODEL,
    LABEL: LABEL, STATUS_LABEL: STATUS_LABEL,
    decide: decide,
    externalStatus: externalStatus,
    externalFromResearch: externalFromResearch,
    systemHitOf: systemHitOf,
    modelStatusOf: modelStatusOf,
    message: message,
    rowsOf: rowsOf,
    attach: attach,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
