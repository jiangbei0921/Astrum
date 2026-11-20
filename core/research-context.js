/* ASTRUM · P1 跨 Thread 召回
 *
 * 唯一入口：recall(request)。
 * 顺序固定：身份/会话 → 课题归属 → 角色授权 → verified 过滤 → 打分 → 去重 → 预算截断 → 审计。
 * 失败返回空结果 + denied 原因，不抛异常、不回退「全库召回」。
 */
(function (root) {
  'use strict';

  var DEFAULTS = { maxItems: 6, maxChars: 2000, maxEvidence: 8 };

  var currentBundle = null;
  var pendingRecall = null;

  function nowMs() { return Date.now(); }

  function tokensOf(query) {
    return String(query || '').toLowerCase()
      .split(/[^\w\u4e00-\u9fff]+/)
      .filter(function (w) { return w && w.length >= 1; })
      .slice(0, 40);
  }

  var TYPE_WEIGHT = {
    fact: 1, conclusion: 1, calculation: 0.9, paper_opinion: 0.85,
    decision: 0.75, progress: 0.7, hypothesis: 0.65, experience: 0.6,
    research_question: 0.6, pending: 0.5
  };

  function scoreOf(memory, tokens, now) {
    var text = String((memory.summary || '') + ' ' + (memory.content || '')).toLowerCase();
    var hits = 0;
    tokens.forEach(function (t) { if (text.indexOf(t) >= 0) hits += 1; });
    var entity = tokens.length ? Math.min(1, hits / tokens.length) : 0;
    var type = TYPE_WEIGHT[memory.type] || 0.5;
    var ts = Date.parse(memory.updatedAt || memory.createdAt || '');
    var ageDays = isFinite(ts) ? Math.max(0, (now - ts) / 86400000) : 365;
    var recency = 1 - Math.min(1, ageDays / 365);
    var trust = 0.5;
    if (memory.confidence && memory.confidence.level === 'high') trust = 0.8;
    else if (memory.confidence && memory.confidence.level === 'low') trust = 0.3;
    return entity * 0.4 + type * 0.25 + recency * 0.2 + trust * 0.15;
  }

  function denied(reason, projectId) {
    return { ok: false, denied: reason, projectId: projectId || null, memories: [], evidence: [], count: 0 };
  }

  async function recall(request) {
    request = request || {};
    var principal = request.principal || null;
    var projectId = request.projectId || null;
    var budget = Object.assign({}, DEFAULTS, request.budget || {});

    if (!principal || !principal.profileId) return denied('INVALID_CONTEXT', projectId);
    if (!projectId) return denied('PROJECT_REQUIRED', null);
    if (root.Security && root.Security.ensureSession &&
      !root.Security.ensureSession(principal).allowed) {
      return denied('SESSION_CHANGED', projectId);
    }
    var store = request.store || (root.AstroResearchStore ? root.AstroResearchStore.create({}) : null);
    if (!store) return denied('STORE_UNAVAILABLE', projectId);

    var scoped = principal.projectId ? principal : Object.assign({}, principal, { projectId: projectId });
    if (principal.projectId && principal.projectId !== projectId) {
      if (root.AuditLog) {
        root.AuditLog.record({
          action: 'memory.recall', resourceType: 'memory', projectId: projectId,
          decision: 'deny', reason: 'PROJECT_MISMATCH'
        });
      }
      return denied('PROJECT_MISMATCH', projectId);
    }

    var project = null;
    try { project = await store.getProject(projectId, scoped); } catch (e) { project = null; }
    if (!project || project.profileId !== principal.profileId) return denied('NOT_FOUND', projectId);
    if (project.status === 'deleted' || project.status === 'archived') {
      return denied('PROJECT_NOT_ACTIVE', projectId);
    }

    if (root.Security) {
      var d = root.Security.authorize({
        principal: scoped, action: 'read',
        resource: {
          resourceType: 'memory', resourceId: '',
          ownerProfileId: project.profileId, projectId: projectId
        }
      });
      if (!d.allowed) return denied(d.reason, projectId);
    }

    var memories = [];
    try {
      memories = await store.listMemories(projectId, scoped, { status: 'verified', limit: 200 });
    } catch (e) { memories = []; }

    var threadId = request.threadId || null;
    var types = request.types || null;
    var tokens = tokensOf(request.query);
    var now = nowMs();
    var scored = [];

    memories.forEach(function (m) {
      if (!m || m.status !== 'verified') return;
      if (threadId && m.sourceThreadId && m.sourceThreadId === threadId) return;
      if (types && types.indexOf(m.type) < 0) return;
      scored.push({ memory: m, score: scoreOf(m, tokens, now) });
    });
    scored.sort(function (a, b) { return b.score - a.score; });

    /* 去重：fingerprint 相同或 claimIds 有重叠时只保留分数更高的一条。 */
    var picked = [], seenFp = {}, seenClaims = {};
    scored.forEach(function (item) {
      var m = item.memory;
      if (seenFp[m.fingerprint]) return;
      var claimKey = (m.claimIds || []).filter(function (id) { return seenClaims[id]; });
      if (claimKey.length) return;
      seenFp[m.fingerprint] = 1;
      (m.claimIds || []).forEach(function (id) { seenClaims[id] = 1; });
      picked.push(item);
    });

    /* 预算：先条数，再字符数（按 summary 计）。 */
    var selected = [], chars = 0;
    for (var i = 0; i < picked.length && selected.length < budget.maxItems; i++) {
      var s = String(picked[i].memory.summary || '');
      if (selected.length > 0 && chars + s.length > budget.maxChars) break;
      chars += s.length;
      selected.push(picked[i]);
    }

    var evMap = {};
    try {
      var evidence = await store.listEvidence(projectId, scoped);
      evidence.forEach(function (e) { if (e && e.evidenceId) evMap[e.evidenceId] = e; });
    } catch (e) { /* 证据缺失不影响记忆召回，会在结果中体现为空 */ }

    var evidenceOut = [], evSeen = {};
    selected.forEach(function (item) {
      (item.memory.evidenceIds || []).forEach(function (id) {
        if (evSeen[id] || evidenceOut.length >= budget.maxEvidence) return;
        var ev = evMap[id];
        if (!ev) return;
        evSeen[id] = 1;
        evidenceOut.push({
          evidenceId: ev.evidenceId, sourceId: ev.sourceId || '', sourceType: ev.sourceType || '',
          title: ev.title || '', uri: ev.uri || '',
          trust: ev.trust || null, verification: ev.verification || null
        });
      });
    });

    var out = selected.map(function (item) {
      var m = item.memory;
      return {
        memoryId: m.memoryId,
        type: m.type,
        summary: m.summary,
        content: m.content,
        confidence: m.confidence,
        claimIds: (m.claimIds || []).slice(),
        evidenceIds: (m.evidenceIds || []).slice(),
        sourceThreadId: m.sourceThreadId || null,
        score: Number(item.score.toFixed(4))
      };
    });

    var bundle = {
      ok: true,
      projectId: projectId,
      query: String(request.query || ''),
      memories: out,
      evidence: evidenceOut,
      count: out.length,
      truncated: picked.length > out.length,
      budget: { maxItems: budget.maxItems, maxChars: budget.maxChars, maxEvidence: budget.maxEvidence }
    };

    if (root.AuditLog) {
      root.AuditLog.record({
        action: 'memory.recall', resourceType: 'memory', projectId: projectId,
        principalType: principal.principalType, principalId: principal.agentId || principal.profileId,
        decision: 'allow', reason: 'ALLOW',
        detail: { count: out.length, ids: out.map(function (m) { return m.memoryId; }) }
      });
    }
    return bundle;
  }

  function setCurrent(bundle) {
    currentBundle = bundle || null;
    return currentBundle;
  }

  function current() { return currentBundle; }

  /* UI 发起任务前注册召回 Promise；编排器执行 compose 前最多等待 3 秒。
   * 任何异常或超时都返回 null，绝不阻塞研究链路。 */
  function setPending(p) { pendingRecall = p || null; return pendingRecall; }

  function wait(ms) {
    if (!pendingRecall) return Promise.resolve(null);
    var limit = typeof ms === 'number' ? ms : 3000;
    return Promise.race([
      Promise.resolve(pendingRecall).catch(function () { return null; }),
      new Promise(function (resolve) { setTimeout(function () { resolve(null); }, limit); })
    ]);
  }

  root.AstroResearchContext = {
    recall: recall,
    setCurrent: setCurrent,
    current: current,
    setPending: setPending,
    wait: wait,
    DEFAULTS: DEFAULTS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
