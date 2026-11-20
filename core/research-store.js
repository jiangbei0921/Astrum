/* ASTRUM · P1 课题与记忆持久化
 *
 * 数据库：Profile.ns('astrum.research.v1')，版本 1。
 * objectStore：projects / memories / memory_events / evidence / claims。
 * 回退：IndexedDB → localStorage → 内存（语义与 TaskStore 一致）。
 *
 * 安全边界：
 *   1) 所有写操作必须有 principal；
 *   2) Security.authorize 判角色与能力；
 *   3) 存储层再校验记录 profileId/projectId（双层校验，任一层失败即拒绝）。
 */
(function (root) {
  'use strict';

  var BASE_DB = 'astrum.research.v1';
  var BASE_LS = 'astrum.research.v1';
  var DB_VER = 1;
  var MAX_BUNDLE_BYTES = 10 * 1024 * 1024;

  var STORES = {
    projects: { key: 'projectId', indexes: [['status', 'status'], ['updatedAt', 'updatedAt']] },
    memories: {
      key: 'memoryId',
      indexes: [
        ['projectId', 'projectId'],
        ['projectId_status', ['projectId', 'status']],
        ['type', 'type'],
        ['updatedAt', 'updatedAt'],
        ['supersedes', 'supersedes']
      ]
    },
    events: { key: 'eventId', indexes: [['projectId', 'projectId'], ['memoryId', 'memoryId']] },
    evidence: { key: 'evidenceId', indexes: [['projectId', 'projectId']] },
    claims: { key: 'id', indexes: [['projectId', 'projectId']] }
  };

  function nowIso() { return new Date().toISOString(); }

  function ownerOf(options) {
    if (root.Profile && root.Profile.currentId) return root.Profile.currentId();
    return (options && options.ownerProfileId) ? String(options.ownerProfileId) : null;
  }

  function nsName(base, owner) {
    if (!owner) return base;
    return owner === 'default' ? base : ('p.' + owner + '.' + base);
  }

  function storeError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }

  function clone(v) {
    if (v == null) return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function checksumOf(payload) {
    var text = JSON.stringify(payload);
    if (root.AstroTask && typeof root.AstroTask.sha256Hex === 'function') {
      return root.AstroTask.sha256Hex(text);
    }
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8) + ':' + text.length;
  }

  function openIDB(name) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req;
      try { req = root.indexedDB.open(name, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        Object.keys(STORES).forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) {
            var os = db.createObjectStore(name, { keyPath: STORES[name].key });
            (STORES[name].indexes || []).forEach(function (idx) {
              os.createIndex(idx[0], idx[1], { unique: false });
            });
          }
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      setTimeout(function () { reject(new Error('idb open timeout')); }, 30000);
    });
  }

  function idbReq(db, name, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction([name], mode);
      var os = tx.objectStore(name);
      var req = fn(os);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function lsRead(key) {
    try {
      var raw = root.localStorage.getItem(key) || '{}';
      var obj = JSON.parse(raw) || {};
      Object.keys(STORES).forEach(function (s) { if (!isPlainObject(obj[s])) obj[s] = {}; });
      return obj;
    } catch (e) {
      var empty = {};
      Object.keys(STORES).forEach(function (s) { empty[s] = {}; });
      return empty;
    }
  }

  function lsWrite(key, data) {
    try { root.localStorage.setItem(key, JSON.stringify(data)); } catch (e) { /* 配额失败按内存处理 */ }
  }

  function create(options) {
    options = options || {};
    var owner = ownerOf(options);
    var enforce = !!owner;
    var dbName = nsName(BASE_DB, owner);
    var lsKey = nsName(BASE_LS, owner);

    var db = null;
    var backend = 'memory';
    var memory = {};
    var initPromise = null;

    Object.keys(STORES).forEach(function (s) { memory[s] = {}; });

    function init() {
      if (initPromise) return initPromise;
      initPromise = openIDB(dbName).then(function (d) {
        db = d; backend = 'idb'; return backend;
      }).catch(function () {
        try {
          root.localStorage.setItem('astrum.research.probe', '1');
          root.localStorage.removeItem('astrum.research.probe');
          backend = 'ls';
          return backend;
        } catch (e) {
          backend = 'memory';
          return backend;
        }
      });
      return initPromise;
    }

    function rawGet(name, id) {
      if (backend === 'idb') return idbReq(db, name, 'readonly', function (os) { return os.get(id); });
      if (backend === 'ls') return Promise.resolve(lsRead(lsKey)[name][id] || null);
      return Promise.resolve(memory[name][id] || null);
    }

    function rawPut(name, rec) {
      if (backend === 'idb') return idbReq(db, name, 'readwrite', function (os) { return os.put(rec); });
      if (backend === 'ls') {
        var data = lsRead(lsKey);
        data[name][rec[STORES[name].key]] = rec;
        lsWrite(lsKey, data);
        return Promise.resolve(rec);
      }
      memory[name][rec[STORES[name].key]] = rec;
      return Promise.resolve(rec);
    }

    function rawDelete(name, id) {
      if (backend === 'idb') return idbReq(db, name, 'readwrite', function (os) { return os.delete(id); });
      if (backend === 'ls') {
        var data = lsRead(lsKey);
        delete data[name][id];
        lsWrite(lsKey, data);
        return Promise.resolve(true);
      }
      delete memory[name][id];
      return Promise.resolve(true);
    }

    async function rawAll(name) {
      if (backend === 'idb') return (await idbReq(db, name, 'readonly', function (os) { return os.getAll(); })) || [];
      if (backend === 'ls') {
        var data = lsRead(lsKey)[name];
        return Object.keys(data).map(function (k) { return data[k]; });
      }
      return Object.keys(memory[name]).map(function (k) { return memory[name][k]; });
    }

    function audit(event) {
      if (!root.AuditLog || typeof root.AuditLog.record !== 'function') return;
      try { root.AuditLog.record(event); } catch (e) { /* 审计失败不影响业务 */ }
    }

    function deny(action, resourceType, resourceId, reason, projectId) {
      audit({
        action: action, resourceType: resourceType, resourceId: resourceId || '',
        projectId: projectId || null, decision: 'deny', reason: reason
      });
    }

    function bindProject(principal, projectId) {
      if (!principal) return principal;
      if (!projectId || principal.projectId) return principal;
      return Object.assign({}, principal, { projectId: projectId });
    }

    function requireAuth(principal, action, resourceType, resourceId, ownerProfileId, projectId) {
      if (!principal || !principal.profileId) {
        throw storeError('INVALID_CONTEXT', '缺少可信档案上下文');
      }
      if (enforce && principal.profileId !== owner) {
        deny(action, resourceType, resourceId, 'PROFILE_MISMATCH', projectId);
        throw storeError('PROFILE_MISMATCH', '不存在或不属于当前档案');
      }
      if (!root.Security || typeof root.Security.authorize !== 'function') return { allowed: true };
      var d = root.Security.authorize({
        principal: bindProject(principal, projectId),
        action: action,
        resource: {
          resourceType: resourceType,
          resourceId: resourceId || '',
          ownerProfileId: ownerProfileId || principal.profileId,
          projectId: projectId || null
        }
      });
      if (!d.allowed) {
        throw storeError(d.reason, '不存在或不属于当前档案');
      }
      return d;
    }

    async function requireProject(projectId, principal, action) {
      var p = await rawGet('projects', projectId);
      if (!p || !principal || p.profileId !== principal.profileId) {
        deny(action || 'read', 'project', projectId, 'NOT_FOUND', projectId);
        return null;
      }
      requireAuth(principal, action || 'read', 'project', projectId, p.profileId, projectId);
      return p;
    }

    async function requireActiveProject(projectId, principal, action) {
      /* 课题层只判读权；具体写能力（memory.propose/update）由调用方另行授权。 */
      var p = await requireProject(projectId, principal, 'read');
      if (!p) return null;
      if (p.status === 'deleted' || p.status === 'archived') {
        deny(action, 'project', projectId, 'PROJECT_NOT_ACTIVE', projectId);
        throw storeError('PROJECT_NOT_ACTIVE', '课题已归档或删除，不能写入');
      }
      if (p.status === 'paused') {
        deny(action, 'project', projectId, 'PROJECT_PAUSED', projectId);
        throw storeError('PROJECT_PAUSED', '课题已暂停，不能新增记忆');
      }
      return p;
    }

    /* ---------------- Project ---------------- */

    async function createProject(input, principal) {
      input = input || {};
      requireAuth(principal, 'create', 'project', '', principal && principal.profileId, null);
      var P = root.AstroProject;
      if (!P) throw storeError('MODULE_MISSING', 'AstroProject 未加载');
      var project = P.make({
        title: input.title,
        description: input.description,
        researchGoal: input.researchGoal,
        researchQuestions: input.researchQuestions,
        hypotheses: input.hypotheses,
        profileId: principal.profileId
      });
      P.validate(project);
      await init();
      await rawPut('projects', project);
      audit({
        action: 'project.create', resourceType: 'project', resourceId: project.projectId,
        projectId: project.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { title: project.title }
      });
      return project;
    }

    async function getProject(projectId, principal) {
      if (!principal || !principal.profileId) return null;
      await init();
      var p = await rawGet('projects', projectId);
      if (!p || p.profileId !== principal.profileId) {
        deny('read', 'project', projectId, 'NOT_FOUND', projectId);
        return null;
      }
      return p;
    }

    async function listProjects(principal, opts) {
      opts = opts || {};
      if (!principal || !principal.profileId) return [];
      await init();
      var all = await rawAll('projects');
      var out = all.filter(function (p) {
        if (!p || p.profileId !== principal.profileId) return false;
        if (!opts.includeDeleted && p.status === 'deleted') return false;
        if (opts.status && p.status !== opts.status) return false;
        return true;
      });
      out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
      var limit = typeof opts.limit === 'number' ? opts.limit : 100;
      return out.slice(0, limit);
    }

    async function updateProject(projectId, patch, principal) {
      patch = patch || {};
      var P = root.AstroProject;
      var p = await requireProject(projectId, principal, 'update');
      if (!p) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      if (p.status === 'deleted') throw storeError('PROJECT_DELETED', '已删除课题不能编辑');
      if (patch.version != null && patch.version !== p.version) {
        throw storeError('VERSION_CONFLICT', '课题已被修改，请刷新后重试');
      }
      P.touch(p, patch);
      await rawPut('projects', p);
      audit({
        action: 'project.update', resourceType: 'project', resourceId: p.projectId,
        projectId: p.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { version: p.version }
      });
      return p;
    }

    async function setProjectStatus(projectId, status, principal, opts) {
      opts = opts || {};
      var action = (status === 'archived' || status === 'deleted') ? 'archive' : 'update';
      var p = await requireProject(projectId, principal, action);
      if (!p) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      var P = root.AstroProject;
      P.transition(p, status, { confirmTitle: opts.confirmTitle });
      await rawPut('projects', p);
      audit({
        action: 'project.' + action, resourceType: 'project', resourceId: p.projectId,
        projectId: p.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { status: p.status }
      });
      return p;
    }

    /* ---------------- Memory ---------------- */

    function clampMemory(m) {
      if (typeof m.content === 'string' && m.content.length > 4000) m.content = m.content.slice(0, 4000);
      if (typeof m.summary === 'string' && m.summary.length > 200) m.summary = m.summary.slice(0, 200);
      return m;
    }

    async function putMemory(memoryInput, principal) {
      var M = root.AstroMemory;
      if (!M) throw storeError('MODULE_MISSING', 'AstroMemory 未加载');
      var m = M.make(memoryInput || {});
      m.profileId = principal && principal.profileId;
      if (!m.projectId) throw storeError('PROJECT_REQUIRED', '记忆必须属于某个课题');
      await init();
      var project = await requireActiveProject(m.projectId, principal, 'propose');
      if (!project) throw storeError('NOT_FOUND', '不存在或不属于当前档案');

      if (m.status === 'verified') throw storeError('APPROVER_NOT_USER', 'Agent 不能直接写入已核实记忆');
      if (m.status !== 'draft' && m.status !== 'proposed') {
        throw storeError('INVALID_STATUS', '仅允许写入 draft/proposed 候选');
      }

      var existing = await rawGet('memories', m.memoryId);
      var action = existing ? 'update' : 'propose';
      requireAuth(principal, action, 'memory', m.memoryId,
        existing ? existing.profileId : m.profileId, m.projectId);

      clampMemory(m);
      M.validate(m);

      /* fingerprint 去重：同课题内非 rejected/superseded 的重复候选不重复落库。 */
      var all = await rawAll('memories');
      for (var i = 0; i < all.length; i++) {
        var other = all[i];
        if (!other || other.projectId !== m.projectId) continue;
        if (other.memoryId === m.memoryId) continue;
        if (other.fingerprint !== m.fingerprint) continue;
        if (other.status === 'rejected' || other.status === 'superseded') continue;
        audit({
          action: 'memory.dedupe', resourceType: 'memory', resourceId: other.memoryId,
          projectId: m.projectId, decision: 'allow', reason: 'DUPLICATE',
          detail: { fingerprint: m.fingerprint }
        });
        return Object.assign({}, other, { duplicate: true });
      }

      if (existing) {
        m.version = (existing.version || 1) + 1;
        m.createdAt = existing.createdAt || m.createdAt;
        if (existing.supersedes && !m.supersedes) m.supersedes = existing.supersedes;
      }
      await rawPut('memories', m);
      project.metadata.memoryCount = (project.metadata.memoryCount || 0) + (existing ? 0 : 1);
      project.metadata.lastActivityAt = nowIso();
      project.updatedAt = nowIso();
      await rawPut('projects', project);
      audit({
        action: 'memory.' + action, resourceType: 'memory', resourceId: m.memoryId,
        projectId: m.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { type: m.type, status: m.status }
      });
      return m;
    }

    async function getMemory(memoryId, principal) {
      if (!principal || !principal.profileId) return null;
      await init();
      var m = await rawGet('memories', memoryId);
      if (!m || m.profileId !== principal.profileId) {
        deny('read', 'memory', memoryId, 'NOT_FOUND', m && m.projectId);
        return null;
      }
      if (principal.projectId && principal.projectId !== m.projectId) {
        deny('read', 'memory', memoryId, 'PROJECT_MISMATCH', m.projectId);
        return null;
      }
      return m;
    }

    async function listMemories(projectId, principal, opts) {
      opts = opts || {};
      if (!principal || !principal.profileId) return [];
      await init();
      var project = await rawGet('projects', projectId);
      if (!project || project.profileId !== principal.profileId) {
        deny('read', 'memory', projectId, 'NOT_FOUND', projectId);
        return [];
      }
      if (principal.projectId && principal.projectId !== projectId) {
        deny('read', 'memory', projectId, 'PROJECT_MISMATCH', projectId);
        return [];
      }
      var all = await rawAll('memories');
      var statuses = opts.status ? (isArray(opts.status) ? opts.status : [opts.status]) : null;
      var out = all.filter(function (m) {
        if (!m || m.projectId !== projectId) return false;
        if (statuses && statuses.indexOf(m.status) < 0) return false;
        if (!statuses && m.status === 'superseded') return false;
        if (opts.type && m.type !== opts.type) return false;
        return true;
      });
      out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
      var limit = typeof opts.limit === 'number' ? opts.limit : 100;
      return out.slice(0, limit);
    }

    async function resolveEvidenceMap(projectId) {
      var all = await rawAll('evidence');
      var map = {};
      all.forEach(function (e) { if (e && e.projectId === projectId) map[e.evidenceId] = e; });
      return map;
    }

    async function resolveClaimMap(projectId) {
      var all = await rawAll('claims');
      var map = {};
      all.forEach(function (c) { if (c && c.projectId === projectId) map[c.id] = c; });
      return map;
    }

    async function transitionMemory(memoryId, to, principal, detail) {
      detail = detail || {};
      var M = root.AstroMemory;
      await init();
      var m = await rawGet('memories', memoryId);
      if (!m || !principal || m.profileId !== principal.profileId) {
        deny('update', 'memory', memoryId, 'NOT_FOUND', m && m.projectId);
        throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      }
      if (principal.projectId && principal.projectId !== m.projectId) {
        deny('update', 'memory', memoryId, 'PROJECT_MISMATCH', m.projectId);
        throw storeError('PROJECT_MISMATCH', '不存在或不属于当前档案');
      }
      var action = to === 'verified' ? 'approve' : 'update';
      requireAuth(principal, action, 'memory', memoryId, m.profileId, m.projectId);

      /* 先判状态机合法性，再判证据条件，避免把越级转移误报为证据缺失。 */
      if (!M.canTransition(m.status, to)) {
        var te = storeError('INVALID_TRANSITION', '非法记忆状态转移 from=' + m.status + ' to=' + to);
        te.from = m.status; te.to = to;
        throw te;
      }

      if (to === 'verified') {
        if (principal.principalType !== 'user') {
          throw storeError('APPROVER_NOT_USER', '只有用户可以审核通过记忆');
        }
        var evMap = await resolveEvidenceMap(m.projectId);
        var clMap = await resolveClaimMap(m.projectId);
        var ready = M.canVerify(m, {
          evidenceIds: Object.keys(evMap),
          evidence: evMap,
          claims: clMap
        });
        if (!ready.ok) {
          // 允许证据在任务状态中尚未同步到研究库：仅当显式传入 detail.evidenceIds 时放行解析
          if (detail && isArray(detail.evidenceIds)) {
            ready = M.canVerify(m, { evidenceIds: detail.evidenceIds, claims: clMap });
          }
        }
        if (!ready.ok) throw storeError(ready.reason || 'NOT_READY', '记忆未满足核实条件');
      }

      if (to === 'superseded') {
        var targetId = detail.supersededBy;
        var target = targetId ? await rawGet('memories', targetId) : null;
        if (!target || target.status !== 'verified') {
          throw storeError('SUPERSEDE_TARGET_REQUIRED', '取代目标必须是已核实记忆');
        }
        var all = await rawAll('memories');
        var byId = {};
        all.forEach(function (x) { byId[x.memoryId] = x; });
        M.assertNoCycle(byId, targetId, m.memoryId);
        m.supersededBy = targetId;
        target.supersedes = m.memoryId;
        target.version = (target.version || 1) + 1;
        target.updatedAt = nowIso();
        await rawPut('memories', target);
      }

      M.transition(m, to, {
        actorType: principal.principalType,
        ready: true,
        reason: detail.reason,
        supersededBy: detail.supersededBy
      });
      await rawPut('memories', m);
      await rawPut('events', {
        eventId: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
        memoryId: m.memoryId,
        projectId: m.projectId,
        profileId: m.profileId,
        from: detail.from || '',
        to: to,
        actorType: principal.principalType,
        actorId: principal.agentId || '',
        reason: String(detail.reason || '').slice(0, 200),
        at: nowIso()
      });
      audit({
        action: 'memory.transition', resourceType: 'memory', resourceId: m.memoryId,
        projectId: m.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { to: to, actorType: principal.principalType }
      });
      return m;
    }

    async function linkMemory(memoryId, refs, principal) {
      refs = refs || {};
      var M = root.AstroMemory;
      await init();
      var m = await rawGet('memories', memoryId);
      if (!m || !principal || m.profileId !== principal.profileId) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      requireAuth(principal, 'update', 'memory', memoryId, m.profileId, m.projectId);
      var evMap = await resolveEvidenceMap(m.projectId);
      var clMap = await resolveClaimMap(m.projectId);
      var evIds = isArray(refs.evidenceIds) ? refs.evidenceIds : m.evidenceIds;
      var clIds = isArray(refs.claimIds) ? refs.claimIds : m.claimIds;
      var missingEv = evIds.filter(function (id) { return !evMap[id]; });
      if (missingEv.length) throw storeError('DANGLING_EVIDENCE', '证据无法解析：' + missingEv.join(','));
      var missingCl = clIds.filter(function (id) { return !clMap[id]; });
      if (missingCl.length) throw storeError('DANGLING_CLAIM', '主张无法解析：' + missingCl.join(','));
      m.evidenceIds = evIds.slice();
      m.claimIds = clIds.slice();
      m.version = (m.version || 1) + 1;
      m.updatedAt = nowIso();
      M.validate(m);
      await rawPut('memories', m);
      audit({
        action: 'memory.link', resourceType: 'memory', resourceId: m.memoryId,
        projectId: m.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { claimIds: m.claimIds, evidenceIds: m.evidenceIds }
      });
      return m;
    }

    /* ---------------- Evidence / Claims 索引 ---------------- */

    /* 证据更新后，引用它的 verified 记忆降级复审（来源链变化必须重新人工确认）。 */
    async function demoteForEvidence(evidenceId, projectId) {
      var all = await rawAll('memories');
      for (var i = 0; i < all.length; i++) {
        var m = all[i];
        if (!m || m.projectId !== projectId) continue;
        if (m.status !== 'verified') continue;
        if ((m.evidenceIds || []).indexOf(evidenceId) < 0) continue;
        delete m._from;
        m.status = 'under_review';
        m.verifiedAt = null;
        m.verifiedBy = null;
        m.version = (m.version || 1) + 1;
        m.updatedAt = nowIso();
        await rawPut('memories', m);
        await rawPut('events', {
          eventId: 'evt_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8),
          memoryId: m.memoryId, projectId: projectId, profileId: m.profileId,
          from: 'verified', to: 'under_review', actorType: 'system', actorId: '',
          reason: 'evidence-updated', at: nowIso()
        });
      }
    }

    async function putEvidenceBundle(items, projectId, principal) {
      if (!principal || !principal.profileId) throw storeError('INVALID_CONTEXT', '缺少可信档案上下文');
      await init();
      var project = await rawGet('projects', projectId);
      if (!project || project.profileId !== principal.profileId) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      var n = 0;
      for (var i = 0; i < (isArray(items) ? items.length : 0); i++) {
        var item = items[i];
        if (!isPlainObject(item) || !item.evidenceId) continue;
        var prev = await rawGet('evidence', item.evidenceId);
        var rec = Object.assign({}, item, { projectId: projectId, profileId: principal.profileId });
        var changed = !!(prev && (
          String(prev.uri || '') !== String(rec.uri || '') ||
          String(prev.sourceId || '') !== String(rec.sourceId || '') ||
          String(prev.contentHash || '') !== String(rec.contentHash || '') ||
          (prev.verification && prev.verification.state) !== (rec.verification && rec.verification.state)
        ));
        await rawPut('evidence', rec);
        n += 1;
        if (changed) await demoteForEvidence(rec.evidenceId, projectId);
      }
      return n;
    }

    async function putClaimBundle(items, projectId, principal) {
      if (!principal || !principal.profileId) throw storeError('INVALID_CONTEXT', '缺少可信档案上下文');
      await init();
      var project = await rawGet('projects', projectId);
      if (!project || project.profileId !== principal.profileId) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      var n = 0;
      for (var i = 0; i < (isArray(items) ? items.length : 0); i++) {
        var item = items[i];
        if (!isPlainObject(item) || !item.id) continue;
        var rec = Object.assign({}, item, { projectId: projectId, profileId: principal.profileId });
        await rawPut('claims', rec);
        n += 1;
      }
      return n;
    }

    async function listEvidence(projectId, principal) {
      if (!principal || !principal.profileId) return [];
      await init();
      var project = await rawGet('projects', projectId);
      if (!project || project.profileId !== principal.profileId) return [];
      var all = await rawAll('evidence');
      return all.filter(function (e) { return e && e.projectId === projectId; });
    }

    async function listClaims(projectId, principal) {
      if (!principal || !principal.profileId) return [];
      await init();
      var project = await rawGet('projects', projectId);
      if (!project || project.profileId !== principal.profileId) return [];
      var all = await rawAll('claims');
      return all.filter(function (c) { return c && c.projectId === projectId; });
    }

    /* ---------------- 关联查询 ---------------- */

    async function listTasks(projectId, principal) {
      if (!principal || !root.AstroTaskStore) return [];
      try {
        var ts = root.AstroTaskStore.create({ ownerProfileId: owner, projectId: projectId });
        if (typeof ts.listByProject !== 'function') return [];
        return await ts.listByProject(projectId, { limit: 100 });
      } catch (e) { return []; }
    }

    async function listThreads(projectId, principal) {
      if (!principal || !root.Thread || typeof root.Thread.list !== 'function') return [];
      try {
        var list = await root.Thread.list();
        return (list || []).filter(function (t) { return t && t.projectId === projectId; })
          .map(function (t) { return { id: t.id, title: t.title, createdAt: t.createdAt, updatedAt: t.updatedAt }; });
      } catch (e) { return []; }
    }

    async function verifyProject(projectId, principal) {
      var errors = [], warnings = [];
      var p = await getProject(projectId, principal);
      if (!p) {
        return { ok: false, errors: [{ code: 'PROJECT_NOT_FOUND', message: '课题不存在或不属于当前档案' }], warnings: [] };
      }
      var memories = await rawAll('memories');
      var evMap = await resolveEvidenceMap(projectId);
      var clMap = await resolveClaimMap(projectId);
      var mine = memories.filter(function (m) { return m && m.projectId === projectId; });
      var byId = {};
      mine.forEach(function (m) { byId[m.memoryId] = m; });
      var fpSeen = {};

      mine.forEach(function (m) {
        if (m.profileId !== p.profileId) {
          errors.push({ code: 'MEMORY_PROFILE_MISMATCH', memoryId: m.memoryId });
        }
        var missingEv = (m.evidenceIds || []).filter(function (id) { return !evMap[id]; });
        if (missingEv.length) errors.push({ code: 'DANGLING_EVIDENCE', memoryId: m.memoryId, detail: missingEv });
        var missingCl = (m.claimIds || []).filter(function (id) { return !clMap[id]; });
        if (missingCl.length) errors.push({ code: 'DANGLING_CLAIM', memoryId: m.memoryId, detail: missingCl });
        if (m.supersedes && !byId[m.supersedes]) {
          errors.push({ code: 'DANGLING_SUPERSEDE', memoryId: m.memoryId });
        }
        if (m.supersededBy && !byId[m.supersededBy]) {
          errors.push({ code: 'DANGLING_SUPERSEDED_BY', memoryId: m.memoryId });
        }
        if (m.status === 'verified') {
          var ready = root.AstroMemory.canVerify(m, { evidenceIds: Object.keys(evMap), claims: clMap });
          if (!ready.ok) errors.push({ code: 'VERIFIED_NOT_READY', memoryId: m.memoryId, reason: ready.reason });
          if (fpSeen[m.fingerprint]) {
            errors.push({ code: 'DUPLICATE_VERIFIED', memoryId: m.memoryId });
          }
          fpSeen[m.fingerprint] = 1;
        }
      });

      /* 取代链无环：只沿自身的 supersedes 向上检查。 */
      mine.forEach(function (m) {
        if (!m.supersedes) return;
        try {
          root.AstroMemory.assertNoCycle(byId, m.memoryId, m.supersedes);
        } catch (e) {
          errors.push({ code: 'SUPERSEDE_CYCLE', memoryId: m.memoryId });
        }
      });

      try {
        var ts = root.AstroTaskStore ? root.AstroTaskStore.create({ ownerProfileId: owner, projectId: projectId }) : null;
        var recs = ts && ts.listByProject ? await ts.listByProject(projectId, { raw: true, limit: 200 }) : [];
        (recs || []).forEach(function (r) {
          if (r.projectId && r.projectId !== projectId) {
            warnings.push({ code: 'TASK_PROJECT_MISMATCH', taskId: r.id });
          }
        });
      } catch (e) { /* 任务库不可用只记录警告 */ }

      return { ok: errors.length === 0, errors: errors, warnings: warnings };
    }

    /* ---------------- 导入导出 ---------------- */

    async function exportProject(projectId, principal) {
      var p = await requireProject(projectId, principal, 'read');
      if (!p) throw storeError('NOT_FOUND', '不存在或不属于当前档案');
      var memories = await listMemories(projectId, principal, { status: null, limit: 100000 });
      // 排除 superseded 默认过滤：导出需要全量
      var allM = (await rawAll('memories')).filter(function (m) { return m && m.projectId === projectId; });
      var evidence = (await rawAll('evidence')).filter(function (e) { return e && e.projectId === projectId; });
      var claims = (await rawAll('claims')).filter(function (c) { return c && c.projectId === projectId; });
      var events = (await rawAll('events')).filter(function (e) { return e && e.projectId === projectId; });
      var threads = await listThreads(projectId, principal);
      var checkpoints = [];
      try {
        var ts = root.AstroTaskStore ? root.AstroTaskStore.create({ ownerProfileId: owner, projectId: projectId }) : null;
        var recs = ts && ts.listByProject ? await ts.listByProject(projectId, { raw: true, limit: 200 }) : [];
        (recs || []).forEach(function (r) {
          var st = null;
          try { st = r.state ? root.AstroTask.fromJSON(r.state) : null; } catch (e) { st = null; }
          (st && st.checkpoints ? st.checkpoints : []).forEach(function (c) { checkpoints.push(c); });
        });
      } catch (e) { /* ignore */ }

      var payload = {
        schema: 'astrum.project/1',
        exportedAt: nowIso(),
        project: clone(p),
        memories: allM.map(clone),
        evidence: evidence.map(clone),
        claims: claims.map(clone),
        memoryEvents: events.map(clone),
        threads: threads,
        checkpoints: checkpoints
      };
      payload.manifest = {
        counts: {
          memories: payload.memories.length,
          evidence: payload.evidence.length,
          claims: payload.claims.length,
          threads: payload.threads.length,
          checkpoints: payload.checkpoints.length
        },
        checksum: checksumOf(payload)
      };
      audit({
        action: 'project.export', resourceType: 'project', resourceId: projectId,
        projectId: projectId, decision: 'allow', reason: 'ALLOW',
        detail: { counts: payload.manifest.counts }
      });
      return payload;
    }

    function assertSafeObject(value, depth) {
      if (depth > 20 || value == null || typeof value !== 'object') return;
      if (isArray(value)) {
        value.forEach(function (v) { assertSafeObject(v, depth + 1); });
        return;
      }
      Object.keys(value).forEach(function (k) {
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
          throw storeError('INVALID_BUNDLE', '导入包含危险字段');
        }
        assertSafeObject(value[k], depth + 1);
      });
    }

    function newId(prefix) {
      return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
    }

    async function importProject(bundle, principal, opts) {
      opts = opts || {};
      requireAuth(principal, 'create', 'project', '', principal && principal.profileId, null);
      if (!isPlainObject(bundle)) throw storeError('INVALID_BUNDLE', '导入包必须是对象');
      try {
        if (JSON.stringify(bundle).length > MAX_BUNDLE_BYTES) {
          throw storeError('BUNDLE_TOO_LARGE', '导入包超过 10MB');
        }
      } catch (e) {
        if (e && e.code) throw e;
        throw storeError('INVALID_BUNDLE', '导入包无法序列化');
      }
      assertSafeObject(bundle, 0);
      if (bundle.schema !== 'astrum.project/1') throw storeError('INVALID_BUNDLE', '导入包 schema 不匹配');
      if (!isPlainObject(bundle.project) || !bundle.project.title) {
        throw storeError('INVALID_BUNDLE', '导入包缺少 project.title');
      }
      var evidenceIn = isArray(bundle.evidence) ? bundle.evidence : [];
      var claimsIn = isArray(bundle.claims) ? bundle.claims : [];
      var memoriesIn = isArray(bundle.memories) ? bundle.memories : [];

      var evIds = {};
      evidenceIn.forEach(function (e) {
        if (!isPlainObject(e) || !e.evidenceId) throw storeError('INVALID_BUNDLE', '证据缺少 evidenceId');
        evIds[e.evidenceId] = 1;
      });
      var clIds = {};
      claimsIn.forEach(function (c) {
        if (!isPlainObject(c) || !c.id) throw storeError('INVALID_BUNDLE', '主张缺少 id');
        clIds[c.id] = 1;
      });
      var memIds = {};
      memoriesIn.forEach(function (m) {
        if (!isPlainObject(m) || !m.memoryId) throw storeError('INVALID_BUNDLE', '记忆缺少 memoryId');
        memIds[m.memoryId] = 1;
      });
      /* 关联预校验：任一条不可解析即整体拒绝，不写入任何数据。 */
      memoriesIn.forEach(function (m) {
        (m.evidenceIds || []).forEach(function (id) {
          if (!evIds[id]) throw storeError('DANGLING_EVIDENCE', '导入包证据引用缺失：' + id);
        });
        (m.claimIds || []).forEach(function (id) {
          if (!clIds[id]) throw storeError('DANGLING_CLAIM', '导入包主张引用缺失：' + id);
        });
        if (m.supersedes && !memIds[m.supersedes]) {
          throw storeError('DANGLING_SUPERSEDE', '导入包取代引用缺失');
        }
        if (root.AstroMemory.TYPES.indexOf(m.type) < 0) {
          throw storeError('INVALID_BUNDLE', '记忆类型非法：' + m.type);
        }
      });
      claimsIn.forEach(function (c) {
        (c.support || []).concat(c.contradict || []).forEach(function (s) {
          if (s && s.eid && !evIds[s.eid]) {
            throw storeError('DANGLING_EVIDENCE', '导入包主张引用了缺失证据：' + s.eid);
          }
        });
      });

      await init();
      var P = root.AstroProject;
      var project = P.make({
        title: bundle.project.title,
        description: bundle.project.description,
        researchGoal: bundle.project.researchGoal,
        researchQuestions: bundle.project.researchQuestions,
        hypotheses: bundle.hypotheses,
        profileId: principal.profileId
      });
      P.validate(project);

      var evMap = {}, clMap = {}, memMap = {};
      evidenceIn.forEach(function (e) { evMap[e.evidenceId] = newId('ev_'); });
      claimsIn.forEach(function (c) { clMap[c.id] = newId('clm_'); });
      memoriesIn.forEach(function (m) { memMap[m.memoryId] = newId('mem_'); });

      var written = [];  /* {name,id} */
      try {
        await rawPut('projects', project);
        written.push({ name: 'projects', id: project.projectId });

        for (var i = 0; i < evidenceIn.length; i++) {
          var e = evidenceIn[i];
          var evRec = Object.assign({}, e, {
            evidenceId: evMap[e.evidenceId],
            projectId: project.projectId,
            profileId: principal.profileId,
            importedFrom: e.evidenceId
          });
          await rawPut('evidence', evRec);
          written.push({ name: 'evidence', id: evRec.evidenceId });
        }
        for (var j = 0; j < claimsIn.length; j++) {
          var c = claimsIn[j];
          var remapSup = function (arr) {
            return (isArray(arr) ? arr : []).map(function (s) {
              if (!s || !s.eid) return s;
              return Object.assign({}, s, { eid: evMap[s.eid] || s.eid });
            });
          };
          var clRec = Object.assign({}, c, {
            id: clMap[c.id],
            projectId: project.projectId,
            profileId: principal.profileId,
            support: remapSup(c.support),
            contradict: remapSup(c.contradict),
            importedFrom: c.id
          });
          await rawPut('claims', clRec);
          written.push({ name: 'claims', id: clRec.id });
        }
        for (var k = 0; k < memoriesIn.length; k++) {
          var m = memoriesIn[k];
          var status = m.status;
          if (status === 'verified' || status === 'archived' || status === 'superseded') status = 'proposed';
          if (status !== 'draft' && status !== 'proposed' && status !== 'rejected') status = 'proposed';
          var srcRefs = (m.source && isArray(m.source.refs) ? m.source.refs : []).map(function (r) {
            if (!r || !r.id) return r;
            return Object.assign({}, r, { id: evMap[r.id] || r.id });
          });
          var memRec = {
            memoryId: memMap[m.memoryId],
            profileId: principal.profileId,
            projectId: project.projectId,
            type: m.type,
            content: String(m.content || ''),
            summary: String(m.summary || ''),
            source: m.source ? { kind: m.source.kind, refs: srcRefs } : { kind: 'import', refs: [] },
            sourceThreadId: null,
            sourceTaskId: null,
            evidenceIds: (m.evidenceIds || []).map(function (id) { return evMap[id]; }).filter(Boolean),
            claimIds: (m.claimIds || []).map(function (id) { return clMap[id]; }).filter(Boolean),
            confidence: m.confidence || { level: 'low', basis: 'imported' },
            status: status,
            createdAt: nowIso(),
            updatedAt: nowIso(),
            verifiedAt: null,
            verifiedBy: null,
            version: 1,
            supersedes: m.supersedes ? memMap[m.supersedes] : null,
            supersededBy: null,
            fingerprint: m.fingerprint || root.AstroMemory.fingerprint(String(m.content || '')),
            metadata: m.metadata || { tags: [], originAgent: 'import' }
          };
          var target = null;
          (m.supersedes ? memoriesIn : []).forEach(function (x) {
            if (x.memoryId === m.supersedes) target = memMap[m.supersedes];
          });
          root.AstroMemory.validate(memRec);
          await rawPut('memories', memRec);
          written.push({ name: 'memories', id: memRec.memoryId });
          if (memRec.supersedes) {
            var old = await rawGet('memories', memRec.supersedes);
            if (old) {
              /* 导入只记录链关系，不把旧记忆标记 superseded：
               * 导入的一律是待审核候选，避免绕过人工审核。 */
              old.supersededBy = memRec.memoryId;
              old.version = (old.version || 1) + 1;
              old.updatedAt = nowIso();
              await rawPut('memories', old);
            }
          }
        }
        project.metadata.memoryCount = memoriesIn.length;
        project.metadata.lastActivityAt = nowIso();
        await rawPut('projects', project);
      } catch (err) {
        /* 回滚：删除本批已写入记录（project 在最后清理，避免悬挂）。 */
        for (var w = written.length - 1; w >= 0; w--) {
          try { await rawDelete(written[w].name, written[w].id); } catch (e2) { /* ignore */ }
        }
        throw err;
      }

      audit({
        action: 'project.import', resourceType: 'project', resourceId: project.projectId,
        projectId: project.projectId, decision: 'allow', reason: 'ALLOW',
        detail: { counts: { memories: memoriesIn.length, evidence: evidenceIn.length, claims: claimsIn.length } }
      });
      return {
        ok: true,
        projectId: project.projectId,
        counts: {
          memories: memoriesIn.length,
          evidence: evidenceIn.length,
          claims: claimsIn.length
        },
        idMap: { project: project.projectId, evidence: evMap, claims: clMap, memories: memMap }
      };
    }

    return {
      init: init,
      createProject: createProject,
      getProject: getProject,
      listProjects: listProjects,
      updateProject: updateProject,
      setProjectStatus: setProjectStatus,
      putMemory: putMemory,
      getMemory: getMemory,
      listMemories: listMemories,
      transitionMemory: transitionMemory,
      linkMemory: linkMemory,
      putEvidenceBundle: putEvidenceBundle,
      putClaimBundle: putClaimBundle,
      listEvidence: listEvidence,
      listClaims: listClaims,
      listTasks: listTasks,
      listThreads: listThreads,
      verifyProject: verifyProject,
      exportProject: exportProject,
      importProject: importProject,
      backend: function () { return backend; },
      ownerProfileId: function () { return owner; },
      dbName: function () { return dbName; }
    };
  }

  root.AstroResearchStore = {
    create: create,
    DB_NAME: BASE_DB,
    LS_KEY: BASE_LS,
    STORES: STORES,
    MAX_BUNDLE_BYTES: MAX_BUNDLE_BYTES,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
