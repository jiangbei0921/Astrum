/* ASTRUM · P1 ResearchMemory 纯模型
 *
 * 职责：10 类记忆的字段校验、状态机、fingerprint、取代链防环、可验证条件。
 * 不做存储与权限；verified 的「仅 user」判定在模型层与存储层各校验一次。
 */
(function (root) {
  'use strict';

  var TYPES = [
    'fact', 'paper_opinion', 'calculation', 'hypothesis', 'experience',
    'research_question', 'conclusion', 'decision', 'progress', 'pending'
  ];

  var STATUS = ['draft', 'proposed', 'under_review', 'verified', 'rejected', 'superseded', 'archived'];

  var LEGAL_TRANSITIONS = {
    draft: ['proposed', 'rejected'],
    proposed: ['under_review', 'rejected', 'draft'],
    under_review: ['verified', 'rejected'],
    verified: ['under_review', 'archived', 'superseded'],
    rejected: ['draft'],
    archived: ['proposed'],
    superseded: []
  };

  var SOURCE_KINDS = ['thread', 'task', 'paper', 'calculation', 'user', 'import'];
  var CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

  /* 需要完整来源链的类型：没有 refs/证据/主张不得 verified。 */
  var EVIDENCE_REQUIRED = ['fact', 'paper_opinion', 'calculation', 'conclusion'];

  var seq = 0;

  function nowIso() { return new Date().toISOString(); }

  function nextId() {
    seq += 1;
    return 'mem_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function err(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  /* 归一化：去空白、统一大小写；中文按字符保留。 */
  function normalizeContent(text) {
    return String(text == null ? '' : text)
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function fingerprint(text) {
    var norm = normalizeContent(text);
    if (root.AstroTask && typeof root.AstroTask.sha256Hex === 'function') {
      return root.AstroTask.sha256Hex(norm);
    }
    /* 极端回退：FNV-1a，仅用于无 AstroTask 的纯模型测试。 */
    var h = 0x811c9dc5;
    for (var i = 0; i < norm.length; i++) {
      h ^= norm.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + norm.length;
  }

  function normalizeRefs(refs) {
    if (!isArray(refs)) return [];
    return refs.slice(0, 20).map(function (r) {
      r = isPlainObject(r) ? r : {};
      var kind = SOURCE_KINDS.indexOf(r.kind) >= 0 ? r.kind : 'user';
      return {
        kind: kind,
        id: r.id == null ? '' : String(r.id),
        uri: r.uri == null ? '' : String(r.uri)
      };
    });
  }

  function normalizeIds(list) {
    if (!isArray(list)) return [];
    var out = [], seen = {};
    list.forEach(function (v) {
      var s = String(v == null ? '' : v);
      if (s && !seen[s]) { seen[s] = 1; out.push(s); }
    });
    return out;
  }

  function make(input) {
    input = input || {};
    var content = String(input.content == null ? '' : input.content);
    return {
      memoryId: input.memoryId || nextId(),
      profileId: input.profileId || null,
      projectId: input.projectId || null,
      type: input.type || 'fact',
      content: content,
      summary: String(input.summary == null ? content.slice(0, 200) : input.summary),
      source: {
        kind: input.source && SOURCE_KINDS.indexOf(input.source.kind) >= 0 ? input.source.kind : 'user',
        refs: normalizeRefs(input.source && input.source.refs)
      },
      sourceThreadId: input.sourceThreadId || null,
      sourceTaskId: input.sourceTaskId || null,
      evidenceIds: normalizeIds(input.evidenceIds),
      claimIds: normalizeIds(input.claimIds),
      confidence: {
        level: input.confidence && CONFIDENCE_LEVELS.indexOf(input.confidence.level) >= 0
          ? input.confidence.level : 'medium',
        basis: String(input.confidence && input.confidence.basis || '')
      },
      status: 'draft',
      createdAt: input.createdAt || nowIso(),
      updatedAt: input.updatedAt || nowIso(),
      verifiedAt: null,
      verifiedBy: null,
      version: 1,
      supersedes: input.supersedes || null,
      supersededBy: null,
      fingerprint: input.fingerprint || fingerprint(content),
      metadata: {
        tags: isArray(input.metadata && input.metadata.tags) ? input.metadata.tags.slice(0, 20) : [],
        originAgent: input.metadata && input.metadata.originAgent || null
      }
    };
  }

  /* 候选：模型/规则只能产出 draft；任何 Agent 不得直接生成正式记忆。 */
  function makeCandidate(input) {
    var m = make(input);
    m.status = 'draft';
    return m;
  }

  function validate(m) {
    if (!isPlainObject(m)) throw err('E_MEMORY_SHAPE', 'ResearchMemory 必须是对象');
    if (typeof m.memoryId !== 'string' || !m.memoryId) throw err('E_MEMORY_ID', '$.memoryId 必须是非空字符串');
    if (typeof m.profileId !== 'string' || !m.profileId) throw err('E_MEMORY_OWNER', '$.profileId 必须是非空字符串');
    if (typeof m.projectId !== 'string' || !m.projectId) throw err('E_MEMORY_PROJECT', '$.projectId 必须是非空字符串');
    if (TYPES.indexOf(m.type) < 0) throw err('E_MEMORY_TYPE', '$.type 不在枚举范围');
    if (typeof m.content !== 'string' || !m.content.trim() || m.content.length > 4000) {
      throw err('E_MEMORY_CONTENT', '$.content 必须是 1..4000 字字符串');
    }
    if (typeof m.summary !== 'string' || m.summary.length > 200) {
      throw err('E_MEMORY_SUMMARY', '$.summary 必须是字符串且不超过 200 字');
    }
    if (!isPlainObject(m.source) || SOURCE_KINDS.indexOf(m.source.kind) < 0 || !isArray(m.source.refs)) {
      throw err('E_MEMORY_SOURCE', '$.source 结构非法');
    }
    var i;
    for (i = 0; i < m.source.refs.length; i++) {
      var r = m.source.refs[i];
      if (!isPlainObject(r) || SOURCE_KINDS.indexOf(r.kind) < 0) {
        throw err('E_MEMORY_SOURCE', '$.source.refs[' + i + '] 结构非法');
      }
    }
    if (!isArray(m.evidenceIds) || !isArray(m.claimIds)) {
      throw err('E_MEMORY_REFS', '$.evidenceIds/$.claimIds 必须是数组');
    }
    if (!isPlainObject(m.confidence) || CONFIDENCE_LEVELS.indexOf(m.confidence.level) < 0) {
      throw err('E_MEMORY_CONFIDENCE', '$.confidence.level 不在枚举范围');
    }
    if (STATUS.indexOf(m.status) < 0) throw err('E_MEMORY_STATUS', '$.status 不在枚举范围');
    if (typeof m.version !== 'number' || !isFinite(m.version) || m.version < 1) {
      throw err('E_MEMORY_VERSION', '$.version 必须是 >=1 的数字');
    }
    if (typeof m.fingerprint !== 'string' || !m.fingerprint) {
      throw err('E_MEMORY_FINGERPRINT', '$.fingerprint 必须是非空字符串');
    }
    return true;
  }

  function canTransition(from, to) {
    return !!(LEGAL_TRANSITIONS[from] && LEGAL_TRANSITIONS[from].indexOf(to) >= 0);
  }

  /* 可验证条件：由存储层传入可解析的证据/主张集合。
   * ctx = { evidenceIds: [resolvable...], claims: { id: claim } } */
  function canVerify(m, ctx) {
    ctx = ctx || {};
    var evAll = ctx.evidenceIds || null;
    var claimMap = ctx.claims || null;
    var missingEv = [], missingCl = [];

    if (evAll) {
      m.evidenceIds.forEach(function (id) { if (evAll.indexOf(id) < 0) missingEv.push(id); });
    }
    if (claimMap) {
      m.claimIds.forEach(function (id) { if (!claimMap[id]) missingCl.push(id); });
    }
    if (missingEv.length) return { ok: false, reason: 'DANGLING_EVIDENCE', detail: missingEv };
    if (missingCl.length) return { ok: false, reason: 'DANGLING_CLAIM', detail: missingCl };

    /* 证据本身被判定无效时，引用它的记忆不得核实。 */
    if (isPlainObject(ctx.evidence)) {
      var invalid = m.evidenceIds.filter(function (id) {
        var rec = ctx.evidence[id];
        return !!(rec && rec.verification && rec.verification.state === 'invalid');
      });
      if (invalid.length) return { ok: false, reason: 'EVIDENCE_INVALID', detail: invalid };
      if (EVIDENCE_REQUIRED.indexOf(m.type) >= 0) {
        var noSource = m.evidenceIds.filter(function (id) {
          var rec = ctx.evidence[id];
          return !!(rec && !rec.uri && !rec.sourceId);
        });
        if (noSource.length) return { ok: false, reason: 'EVIDENCE_SOURCE_MISSING', detail: noSource };
      }
    }

    var hasRefs = !!(m.source && m.source.refs && m.source.refs.length);

    if (EVIDENCE_REQUIRED.indexOf(m.type) >= 0 && !hasRefs) {
      return { ok: false, reason: 'MISSING_SOURCE' };
    }

    if (m.type === 'fact' && !m.evidenceIds.length) return { ok: false, reason: 'EVIDENCE_REQUIRED' };
    if (m.type === 'paper_opinion') {
      if (!m.evidenceIds.length || !m.claimIds.length) {
        return { ok: false, reason: 'EVIDENCE_AND_CLAIM_REQUIRED' };
      }
    }
    if (m.type === 'calculation') {
      if (!m.claimIds.length) return { ok: false, reason: 'CLAIM_REQUIRED' };
      if (claimMap) {
        var calcOk = m.claimIds.every(function (id) { return !!(claimMap[id] && claimMap[id].calc); });
        if (!calcOk) return { ok: false, reason: 'CALC_CLAIM_REQUIRED' };
      }
    }
    if (m.type === 'conclusion') {
      if (!m.claimIds.length) return { ok: false, reason: 'CLAIM_REQUIRED' };
      if (claimMap) {
        var supOk = m.claimIds.every(function (id) {
          var c = claimMap[id];
          return !!(c && isArray(c.support) && c.support.length);
        });
        if (!supOk) return { ok: false, reason: 'SUPPORT_REQUIRED' };
      }
    }
    return { ok: true };
  }

  function transition(m, to, ctx) {
    ctx = ctx || {};
    var from = m.status;
    if (!canTransition(from, to)) {
      var e = err('INVALID_TRANSITION', '非法记忆状态转移 from=' + from + ' to=' + to);
      e.from = from; e.to = to;
      throw e;
    }
    if (to === 'verified') {
      if (ctx.actorType !== 'user') throw err('APPROVER_NOT_USER', '只有用户可以把记忆标记为已核实');
      if (ctx.ready === false) throw err(ctx.reason || 'NOT_READY', '记忆未满足核实条件');
      m.verifiedAt = nowIso();
      m.verifiedBy = 'user';
    }
    if (to === 'superseded') {
      if (!ctx.supersededBy) throw err('SUPERSEDE_TARGET_REQUIRED', '取代需要新的已核实记忆');
      m.supersededBy = String(ctx.supersededBy);
    }
    if (to !== 'verified' && to !== 'superseded') {
      m.verifiedAt = null;
      m.verifiedBy = null;
    }
    m.status = to;
    m.updatedAt = nowIso();
    m.version = (m.version || 1) + 1;
    return m;
  }

  /* 取代链防环：fromId 取代 toId 后，沿 supersedes 向上不得回到 fromId。 */
  function assertNoCycle(byId, fromId, toId) {
    var seen = {}, cur = toId, guard = 0;
    while (cur && guard++ < 100) {
      if (cur === fromId) throw err('SUPERSEDE_CYCLE', '取代链存在环');
      if (seen[cur]) throw err('SUPERSEDE_CYCLE', '取代链存在环');
      seen[cur] = 1;
      var rec = byId && byId[cur];
      cur = rec && rec.supersedes ? rec.supersedes : null;
    }
    return true;
  }

  root.AstroMemory = {
    TYPES: TYPES,
    STATUS: STATUS,
    LEGAL_TRANSITIONS: LEGAL_TRANSITIONS,
    SOURCE_KINDS: SOURCE_KINDS,
    EVIDENCE_REQUIRED: EVIDENCE_REQUIRED,
    make: make,
    makeCandidate: makeCandidate,
    validate: validate,
    canTransition: canTransition,
    canVerify: canVerify,
    transition: transition,
    assertNoCycle: assertNoCycle,
    fingerprint: fingerprint,
    normalizeContent: normalizeContent,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
