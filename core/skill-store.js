/* ASTRUM · P2 科研技能持久化
 *
 * 数据库：Profile.ns('astrum.skills.v1')，版本 1。
 * 验证隔离库：Profile.ns('astrum.skills.validation.v1')，只存验证运行，不写正式库。
 * 回退：IndexedDB → localStorage → 内存（与 P1 ResearchStore 语义一致）。
 *
 * 安全边界（双层校验）：
 *   1) 调用方必须提供可信 principal；
 *   2) Security.authorize 判能力与角色；
 *   3) 存储层再校验 profileId / projectId / 记录归属。
 *
 * 状态机由 AstroSkillContract 统一裁决，store 不允许绕过。
 */
(function (root) {
  'use strict';

  var BASE_DB = 'astrum.skills.v1';
  var BASE_LS = 'astrum.skills.v1';
  var VALIDATION_DB = 'astrum.skills.validation.v1';
  var DB_VER = 1;
  var MAX_OPEN_PROPOSALS = 20;

  var STORES = {
    proposals: {
      key: 'proposalId',
      indexes: [['profileId', 'profileId'], ['projectId', 'projectId'], ['status', 'status'],
        ['signature', 'signature'], ['updatedAt', 'updatedAt']]
    },
    drafts: { key: 'draftId', indexes: [['proposalId', 'proposalId'], ['skillId', 'skillId'], ['status', 'status']] },
    skills: {
      key: 'skillId',
      indexes: [['profileId', 'profileId'], ['projectId', 'projectId'], ['scope', 'scope'],
        ['status', 'status'], ['name', 'name']]
    },
    versions: {
      key: 'versionId',
      indexes: [['skillId', 'skillId'], ['status', 'status'], ['version', 'version'],
        ['contentHash', 'contentHash']]
    },
    evaluations: { key: 'evaluationId', indexes: [['skillId', 'skillId'], ['versionId', 'versionId']] },
    approvals: {
      key: 'approvalId',
      indexes: [['skillId', 'skillId'], ['versionId', 'versionId'], ['decision', 'decision']]
    },
    publications: {
      key: 'publicationId',
      indexes: [['skillId', 'skillId'], ['versionId', 'versionId'], ['action', 'action']]
    },
    executions: {
      key: 'executionId',
      indexes: [['skillId', 'skillId'], ['versionId', 'versionId'], ['profileId', 'profileId'],
        ['projectId', 'projectId'], ['status', 'status'], ['startedAt', 'startedAt']]
    },
    feedback: { key: 'feedbackId', indexes: [['skillId', 'skillId'], ['executionId', 'executionId']] },
    events: { key: 'eventId', indexes: [['skillId', 'skillId'], ['versionId', 'versionId'], ['timestamp', 'timestamp']] }
  };

  var VALIDATION_STORES = {
    validations: {
      key: 'validationId',
      indexes: [['skillId', 'skillId'], ['versionId', 'versionId'], ['verdict', 'verdict'],
        ['profileId', 'profileId']]
    },
    fixtures: { key: 'fixtureId', indexes: [['validationId', 'validationId']] }
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

  function openIDB(name, defs) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req;
      try { req = root.indexedDB.open(name, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        Object.keys(defs).forEach(function (storeName) {
          if (!db.objectStoreNames.contains(storeName)) {
            var os = db.createObjectStore(storeName, { keyPath: defs[storeName].key });
            (defs[storeName].indexes || []).forEach(function (idx) {
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

  function makeBackend(defs, dbName, lsKey) {
    var db = null;
    var kind = 'memory';
    var memory = {};
    var initPromise = null;
    Object.keys(defs).forEach(function (s) { memory[s] = {}; });

    function init() {
      if (initPromise) return initPromise;
      initPromise = openIDB(dbName, defs).then(function (d) {
        db = d; kind = 'idb'; return kind;
      }).catch(function () {
        try {
          root.localStorage.setItem('astrum.skills.probe', '1');
          root.localStorage.removeItem('astrum.skills.probe');
          kind = 'ls';
          return kind;
        } catch (e) {
          kind = 'memory';
          return kind;
        }
      });
      return initPromise;
    }

    function lsRead() {
      try {
        var obj = JSON.parse(root.localStorage.getItem(lsKey) || '{}') || {};
        Object.keys(defs).forEach(function (s) { if (!isPlainObject(obj[s])) obj[s] = {}; });
        return obj;
      } catch (e) {
        var empty = {};
        Object.keys(defs).forEach(function (s) { empty[s] = {}; });
        return empty;
      }
    }

    function lsWrite(data) {
      try { root.localStorage.setItem(lsKey, JSON.stringify(data)); } catch (e) { /* 配额失败按内存处理 */ }
    }

    function get(name, id) {
      if (kind === 'idb') return idbReq(db, name, 'readonly', function (os) { return os.get(id); });
      if (kind === 'ls') return Promise.resolve(lsRead()[name][id] || null);
      return Promise.resolve(memory[name][id] || null);
    }

    function put(name, rec) {
      if (kind === 'idb') return idbReq(db, name, 'readwrite', function (os) { return os.put(rec); });
      if (kind === 'ls') {
        var data = lsRead();
        data[name][rec[defs[name].key]] = rec;
        lsWrite(data);
        return Promise.resolve(rec);
      }
      memory[name][rec[defs[name].key]] = rec;
      return Promise.resolve(rec);
    }

    async function all(name) {
      if (kind === 'idb') return (await idbReq(db, name, 'readonly', function (os) { return os.getAll(); })) || [];
      if (kind === 'ls') {
        var data = lsRead()[name];
        return Object.keys(data).map(function (k) { return data[k]; });
      }
      return Object.keys(memory[name]).map(function (k) { return memory[name][k]; });
    }

    return {
      init: init,
      get: get,
      put: put,
      all: all,
      backend: function () { return kind; },
      dbName: function () { return dbName; }
    };
  }

  function create(options) {
    options = options || {};
    var owner = ownerOf(options);
    var enforce = !!owner;
    var formal = makeBackend(STORES, nsName(BASE_DB, owner), nsName(BASE_LS, owner));
    var isolated = makeBackend(VALIDATION_STORES, nsName(VALIDATION_DB, owner), nsName(VALIDATION_DB, owner));
    var registry = options.registry || null;

    function init() { return formal.init().then(function (b) { return isolated.init().then(function () { return b; }); }); }

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

    function log(action, resourceId, projectId, reason, detail) {
      audit({
        action: action, resourceType: 'skill', resourceId: resourceId || '',
        projectId: projectId || null, decision: 'allow', reason: reason || 'ALLOW',
        detail: detail || null
      });
    }

    function bindProject(principal, projectId) {
      if (!principal) return principal;
      if (!projectId || principal.projectId) return principal;
      return Object.assign({}, principal, { projectId: projectId });
    }

    function requireAuth(principal, action, resourceId, ownerProfileId, projectId) {
      if (!principal || !principal.profileId) throw storeError('INVALID_CONTEXT', '缺少可信档案上下文');
      if (enforce && principal.profileId !== owner) {
        deny('skill.' + action, 'skill', resourceId, 'PROFILE_MISMATCH', projectId);
        throw storeError('PROFILE_MISMATCH', '不存在或不属于当前档案');
      }
      if (!root.Security || typeof root.Security.authorize !== 'function') {
        throw storeError('MODULE_MISSING', 'Security 未加载');
      }
      var d = root.Security.authorize({
        principal: bindProject(principal, projectId),
        action: action,
        resource: {
          resourceType: 'skill',
          resourceId: resourceId || '',
          ownerProfileId: ownerProfileId || principal.profileId,
          projectId: projectId || null
        }
      });
      if (!d.allowed) {
        deny('skill.' + action, 'skill', resourceId, d.reason, projectId);
        throw storeError(d.reason, '操作被安全策略拒绝');
      }
      return d;
    }

    function assertUser(principal, action) {
      if (!principal || principal.principalType !== 'user') {
        throw storeError('USER_ONLY', '该操作只允许用户执行：' + action);
      }
    }

    function owned(rec, principal) {
      if (!rec) return false;
      if (!principal || !principal.profileId) return false;
      if (rec.profileId !== principal.profileId) return false;
      if (enforce && rec.profileId !== owner) return false;
      return true;
    }

    function writeEvent(skillId, versionId, previousStatus, nextStatus, action, principal, extra) {
      extra = extra || {};
      var event = {
        eventId: root.AstroSkillContract.newId('ske_'),
        skillId: skillId,
        versionId: versionId || null,
        profileId: principal && principal.profileId,
        previousStatus: previousStatus || null,
        nextStatus: nextStatus || null,
        actor: {
          principalType: principal && principal.principalType,
          profileId: principal && principal.profileId,
          agentId: (principal && principal.agentId) || ''
        },
        action: action,
        reason: String(extra.reason || '').slice(0, 200),
        timestamp: nowIso(),
        approvalId: extra.approvalId || null,
        traceId: extra.traceId || null
      };
      return formal.put('events', event).then(function () { return event; });
    }

    /* ---------------- Proposal ---------------- */

    async function createProposal(input, principal) {
      input = input || {};
      requireAuth(principal, 'propose', input.proposalId || '', principal.profileId, input.projectId || null);
      var C = root.AstroSkillContract;
      var p = C.makeProposal(Object.assign({}, input, { profileId: principal.profileId }));
      await init();

      var existing = await formal.get('proposals', p.proposalId);
      if (existing) throw storeError('PROPOSAL_EXISTS', '提议已存在');

      var all = await formal.all('proposals');
      var open = all.filter(function (x) {
        return x && x.profileId === p.profileId && x.projectId === p.projectId && x.status === 'proposed';
      });
      if (p.signature) {
        for (var i = 0; i < open.length; i++) {
          if (open[i].signature && open[i].signature === p.signature) {
            log('skill.propose', open[i].proposalId, p.projectId, 'DUPLICATE');
            return Object.assign({}, open[i], { duplicate: true });
          }
        }
      }
      if (open.length >= MAX_OPEN_PROPOSALS) {
        throw storeError('PROPOSAL_LIMIT', '待处理提议已达上限 ' + MAX_OPEN_PROPOSALS);
      }
      await formal.put('proposals', p);
      await writeEvent(null, null, null, 'proposed', 'propose', principal, { reason: p.candidateName });
      log('skill.propose', p.proposalId, p.projectId, 'ALLOW', { signature: p.signature });
      return p;
    }

    async function getProposal(proposalId, principal) {
      await init();
      var p = await formal.get('proposals', proposalId);
      if (!owned(p, principal)) {
        deny('skill.read', 'skill', proposalId, 'NOT_FOUND', p && p.projectId);
        return null;
      }
      if (principal.projectId && p.projectId && principal.projectId !== p.projectId) {
        deny('skill.read', 'skill', proposalId, 'PROJECT_MISMATCH', p.projectId);
        return null;
      }
      return p;
    }

    async function listProposals(principal, opts) {
      opts = opts || {};
      if (!principal || !principal.profileId) return [];
      await init();
      var all = await formal.all('proposals');
      var out = all.filter(function (p) {
        if (!owned(p, principal)) return false;
        if (opts.projectId && p.projectId !== opts.projectId) return false;
        if (principal.projectId && p.projectId && principal.projectId !== p.projectId) return false;
        if (opts.status && p.status !== opts.status) return false;
        return true;
      });
      out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
      return out.slice(0, typeof opts.limit === 'number' ? opts.limit : 100);
    }

    async function markProposal(proposalId, status, principal) {
      var p = await getProposal(proposalId, principal);
      if (!p) throw storeError('NOT_FOUND', '提议不存在');
      p.status = status;
      p.updatedAt = nowIso();
      await formal.put('proposals', p);
      return p;
    }

    /* ---------------- Draft / Version ---------------- */

    function draftContent(d) {
      return {
        purpose: d.purpose,
        useCases: d.useCases,
        nonUseCases: d.nonUseCases,
        prerequisites: d.prerequisites,
        inputs: d.inputs,
        outputs: d.outputs,
        workflow: d.workflow,
        constraints: d.constraints,
        errorHandling: d.errorHandling,
        allowedAgents: d.allowedAgents,
        allowedTools: d.allowedTools,
        requiredCapabilities: d.requiredCapabilities,
        timeoutMs: d.timeoutMs,
        retryPolicy: d.retryPolicy
      };
    }

    async function versionsOf(skillId) {
      var all = await formal.all('versions');
      return all.filter(function (v) { return v && v.skillId === skillId; });
    }

    async function requireSkill(skillId, principal, action) {
      await init();
      var skill = await formal.get('skills', skillId);
      if (!owned(skill, principal)) {
        deny('skill.' + (action || 'read'), 'skill', skillId, 'NOT_FOUND', skill && skill.projectId);
        throw storeError('NOT_FOUND', '技能不存在或不属于当前档案');
      }
      if (principal.projectId && skill.projectId && principal.projectId !== skill.projectId) {
        deny('skill.' + (action || 'read'), 'skill', skillId, 'PROJECT_MISMATCH', skill.projectId);
        throw storeError('PROJECT_MISMATCH', '技能不属于当前课题');
      }
      return skill;
    }

    async function createDraft(input, principal) {
      input = input || {};
      requireAuth(principal, 'create', input.skillId || '', principal.profileId, input.projectId || null);
      await init();
      var C = root.AstroSkillContract;
      var skill = null;

      if (input.skillId) {
        skill = await requireSkill(input.skillId, principal, 'create');
      } else if (input.proposalId) {
        var proposal = await getProposal(input.proposalId, principal);
        if (!proposal) throw storeError('NOT_FOUND', '提议不存在');
        if (proposal.status === 'rejected') throw storeError('PROPOSAL_REJECTED', '已拒绝的提议不能生成草稿');
        if (proposal.candidateSkillId) {
          skill = await formal.get('skills', proposal.candidateSkillId);
        }
        if (!skill) {
          skill = C.makeSkill({
            profileId: principal.profileId,
            projectId: proposal.projectId,
            scope: proposal.projectId ? 'project' : 'profile',
            name: proposal.candidateName,
            description: proposal.description,
            status: 'proposed',
            createdBy: (principal.agentId || principal.profileId),
            signature: proposal.signature
          });
          await formal.put('skills', skill);
          await writeEvent(skill.skillId, null, null, 'proposed', 'propose', principal, { reason: 'from-proposal' });
          proposal.candidateSkillId = skill.skillId;
          proposal.status = 'draft';
          proposal.updatedAt = nowIso();
          await formal.put('proposals', proposal);
        }
      } else {
        /* 直接起草：先创建技能身份（仍为 proposed），再落草稿。 */
        skill = C.makeSkill({
          profileId: principal.profileId,
          projectId: input.projectId || null,
          scope: input.projectId ? 'project' : 'profile',
          name: input.name || '未命名技能',
          description: input.description || '',
          category: input.category,
          status: 'proposed',
          createdBy: (principal.agentId || principal.profileId),
          signature: input.signature || ''
        });
        await formal.put('skills', skill);
        await writeEvent(skill.skillId, null, null, 'proposed', 'propose', principal, { reason: 'direct-draft' });
      }

      if (skill.status === 'published') {
        /* 已发布技能只能通过新版本草稿改进，不允许原地改正式内容 */
        if (!input.baseVersionId) input.baseVersionId = skill.currentVersionId;
      }

      var base = null;
      if (input.baseVersionId) {
        base = await formal.get('versions', input.baseVersionId);
        if (!base || base.skillId !== skill.skillId) throw storeError('NOT_FOUND', '基线版本不存在');
      }

      var draftInput = Object.assign({}, input, {
        skillId: skill.skillId,
        baseVersionId: base ? base.versionId : null
      });
      if (!isArray(draftInput.allowedTools)) draftInput.allowedTools = [];
      var draft = C.makeDraft(draftInput);

      /* 工作流里出现的工具必须显式声明在 allowedTools，避免隐式扩权 */
      draft.workflow.forEach(function (step) {
        if (draft.allowedTools.indexOf(step.tool) < 0) draft.allowedTools.push(step.tool);
      });
      C.validateDraft(draft);

      if (registry) {
        draft.workflow.forEach(function (step) {
          if (!registry.has(step.tool)) {
            throw storeError('UNKNOWN_TOOL', '工具未注册：' + step.tool);
          }
        });
        draft.allowedTools.forEach(function (t) {
          if (!registry.has(t)) throw storeError('UNKNOWN_TOOL', '工具未注册：' + t);
        });
      }

      if (base) {
        draft.diff = C.diffDraft(base, draft);
      } else if (skill.currentVersionId) {
        var current = await formal.get('versions', skill.currentVersionId);
        if (current) draft.diff = C.diffDraft(current, draft);
      }

      var label = String(input.version || '');
      if (!label) {
        if (base) label = C.semver.bump(base.version, C.semver.classify(base, draft));
        else label = '1.0.0';
      }
      var siblings = await versionsOf(skill.skillId);
      if (siblings.some(function (v) { return v.version === label; })) {
        throw storeError('VERSION_CONFLICT', '版本号已存在：' + label);
      }

      var version = C.makeVersion({
        skillId: skill.skillId,
        version: label,
        parentVersionId: base ? base.versionId : (skill.currentVersionId || null),
        content: draftContent(draft),
        status: 'draft',
        changelog: input.changelog || '',
        securityKnownIssues: isArray(input.securityKnownIssues) ? input.securityKnownIssues.slice(0, 20) : []
      });
      C.validateVersion(version);

      var previousStatus = skill.status;
      if (skill.status === 'proposed' || skill.status === 'validation_failed' || skill.status === 'rejected') {
        if (C.canTransition(skill, 'draft') && C.canOperate(skill, 'draft', principal)) {
          skill.status = 'draft';
        }
      }
      skill.latestVersionId = version.versionId;
      skill.updatedAt = nowIso();
      draft.versionId = version.versionId;
      version.draftId = draft.draftId;
      draft.profileId = principal.profileId;
      version.profileId = principal.profileId;

      await formal.put('drafts', draft);
      await formal.put('versions', version);
      await formal.put('skills', skill);
      await writeEvent(skill.skillId, version.versionId, previousStatus, skill.status, 'draft', principal, {
        reason: draft.name
      });
      log('skill.draft', draft.draftId, skill.projectId, 'ALLOW', { version: label });
      return Object.assign({}, draft, { version: version });
    }

    async function updateDraft(draftId, patch, principal) {
      await init();
      var C = root.AstroSkillContract;
      var draft = await formal.get('drafts', draftId);
      if (!owned(draft, principal)) throw storeError('NOT_FOUND', '草稿不存在');
      if (draft.status !== 'draft') throw storeError('DRAFT_LOCKED', '仅草稿状态可编辑');
      requireAuth(principal, 'create', draft.skillId, draft.profileId, null);

      var next = Object.assign({}, draft, patch || {});
      if (patch && patch.workflow) next.workflow = C.makeDraft(next).workflow;
      C.validateDraft(next);

      var skill = await requireSkill(draft.skillId, principal, 'create');
      var version = draft.versionId ? await formal.get('versions', draft.versionId) : null;
      if (version && version.status !== 'draft') throw storeError('DRAFT_LOCKED', '版本已进入验证/审批，不能修改');

      next.updatedAt = nowIso();
      if (version) {
        version.content = C.normalizeContent(draftContent(next));
        version.contentHash = C.contentHash(version.content);
        await formal.put('versions', version);
      }
      await formal.put('drafts', next);
      log('skill.draft', next.draftId, skill.projectId, 'ALLOW', { updated: true });
      return next;
    }

    async function getDraft(draftId, principal) {
      await init();
      var d = await formal.get('drafts', draftId);
      if (!owned(d, principal)) return null;
      return d;
    }

    /* ---------------- Validation / Evaluation ---------------- */

    async function saveValidation(record, principal) {
      if (!record || !record.validationId) throw storeError('INVALID_VALIDATION', '缺少 validationId');
      requireAuth(principal, 'test', record.skillId || '', principal.profileId, null);
      await init();
      var rec = Object.assign({}, record, {
        profileId: principal.profileId,
        storedAt: nowIso()
      });
      await isolated.put('validations', rec);
      log('skill.validate', record.skillId, null, record.verdict || 'UNKNOWN', {
        validationId: record.validationId, verdict: record.verdict
      });
      return rec;
    }

    async function getValidation(validationId, principal) {
      await init();
      var v = await isolated.get('validations', validationId);
      if (!v || !owned(v, principal)) return null;
      return v;
    }

    async function latestValidation(versionId) {
      var all = await isolated.all('validations');
      var mine = all.filter(function (v) { return v && v.versionId === versionId; });
      mine.sort(function (a, b) { return String(b.completedAt || b.storedAt || '').localeCompare(String(a.completedAt || a.storedAt || '')); });
      return mine[0] || null;
    }

    async function listValidations(skillId, principal) {
      await init();
      var all = await isolated.all('validations');
      return all.filter(function (v) { return v && v.skillId === skillId && owned(v, principal); });
    }

    async function saveEvaluation(record, principal) {
      if (!record || !record.evaluationId) throw storeError('INVALID_EVALUATION', '缺少 evaluationId');
      requireAuth(principal, 'evaluate', record.skillId || '', principal.profileId, null);
      await init();
      await formal.put('evaluations', Object.assign({}, record, { profileId: principal.profileId }));
      log('skill.evaluate', record.skillId, null, 'ALLOW', { evaluationId: record.evaluationId });
      return record;
    }

    /* ---------------- 生命周期 ---------------- */

    async function transitionSkill(skillId, to, principal, detail) {
      detail = detail || {};
      var C = root.AstroSkillContract;
      await init();
      var skill = await requireSkill(skillId, principal, 'read');

      /* 改进循环：已发布技能通过「新版本草稿」推进验证，不改写正式指针与技能状态。 */
      var candidateVersionId = detail.versionId || skill.latestVersionId;
      var candidate = candidateVersionId ? await formal.get('versions', candidateVersionId) : null;
      var improving = skill.status === 'published' && candidate &&
        candidate.versionId !== skill.currentVersionId &&
        ['validating', 'pending_approval', 'validation_failed'].indexOf(to) >= 0;

      if (!improving && !C.canTransition(skill, to)) {
        var te = storeError('INVALID_TRANSITION', '非法技能状态转移 from=' + skill.status + ' to=' + to);
        te.from = skill.status; te.to = to;
        throw te;
      }
      var rule = C.transitionRule(skill.status, to) ||
        { action: to === 'validation_failed' ? 'validate' : 'test', capability: 'skill.test', actors: ['system'] };
      /* 验证结论由 validator 产出；提交验证结果的动作由可信调用方（user/agent）执行，
       * 真正的门禁是库中的 Validation 记录，而不是调用方身份。 */
      if (to === 'pending_approval' || to === 'validation_failed') {
        rule = { action: 'test', capability: 'skill.test', actors: ['system', 'user', 'agent'] };
      } else if (improving) {
        /* 改进循环只推进候选版本，不改写已发布版本与技能状态。 */
        rule = { action: 'test', capability: 'skill.test', actors: ['system', 'user', 'agent'] };
      }
      if (rule.capability) requireAuth(principal, rule.action, skillId, skill.profileId, skill.projectId);
      if (rule.actors.indexOf(principal.principalType) < 0) {
        throw storeError('USER_ONLY', '该状态转移只允许 ' + rule.actors.join('/') + ' 执行');
      }
      if ((to === 'approved' || to === 'rejected') && principal.principalType !== 'user') {
        throw storeError('USER_ONLY', '审批只允许用户执行');
      }

      var versionId = detail.versionId || skill.latestVersionId;
      var version = versionId ? await formal.get('versions', versionId) : null;

      if (to === 'validating') {
        if (!version) throw storeError('VERSION_REQUIRED', '缺少待验证版本');
        if (version.skillId !== skill.skillId) throw storeError('VERSION_MISMATCH', '版本不属于该技能');
        if (version.status !== 'draft' && version.status !== 'failed') {
          throw storeError('INVALID_VERSION_STATE', '版本状态不可进入验证：' + version.status);
        }
        version.status = 'validating';
        await formal.put('versions', version);
      }

      if (to === 'pending_approval' || to === 'validation_failed') {
        if (!version) throw storeError('VERSION_REQUIRED', '缺少验证版本');
        var validation = detail.validationId
          ? await isolated.get('validations', detail.validationId)
          : await latestValidation(version.versionId);
        if (!validation) throw storeError('VALIDATION_REQUIRED', '缺少验证记录');
        if (!owned(validation, principal)) throw storeError('PROFILE_MISMATCH', '验证记录不属于当前档案');
        if (to === 'pending_approval') {
          if (validation.verdict === 'FAIL') throw storeError('VALIDATION_FAILED', '验证未通过');
          if (validation.layers && validation.layers.security && validation.layers.security.ok === false) {
            throw storeError('SECURITY_BLOCKED', '安全层失败，禁止进入审批');
          }
          version.status = 'validating';
          version.validationId = validation.validationId;
        } else {
          version.status = 'failed';
          version.validationId = validation.validationId;
        }
        await formal.put('versions', version);
      }

      if (to === 'approved') {
        if (!version) throw storeError('VERSION_REQUIRED', '缺少待审批版本');
        version.status = 'approved';
        await formal.put('versions', version);
      }
      if (to === 'rejected') {
        if (version) {
          version.status = 'failed';
          await formal.put('versions', version);
        }
      }

      var previous = skill.status;
      if (!improving) {
        skill.status = to;
        skill.updatedAt = nowIso();
        if (version) skill.latestVersionId = version.versionId;
        await formal.put('skills', skill);
      } else if (version) {
        skill.latestVersionId = version.versionId;
        skill.updatedAt = nowIso();
        await formal.put('skills', skill);
      }
      await writeEvent(skill.skillId, version ? version.versionId : null, previous,
        improving ? skill.status : to, rule.action, principal, {
          reason: detail.reason,
          approvalId: detail.approvalId
        });
      log('skill.' + rule.action, skill.skillId, skill.projectId, 'ALLOW', { to: to });
      return { skill: skill, version: version };
    }

    /* ---------------- 审批 ---------------- */

    async function requestApproval(skillId, versionId, principal, snapshot) {
      var C = root.AstroSkillContract;
      await init();
      var skill = await requireSkill(skillId, principal, 'test');
      requireAuth(principal, 'test', skillId, skill.profileId, skill.projectId);
      var version = await formal.get('versions', versionId || skill.latestVersionId);
      if (!version || version.skillId !== skillId) throw storeError('VERSION_NOT_FOUND', '版本不存在');

      var validation = version.validationId
        ? await isolated.get('validations', version.validationId)
        : await latestValidation(version.versionId);
      if (!validation) throw storeError('VALIDATION_REQUIRED', '缺少验证记录，不能发起审批');
      if (validation.verdict === 'FAIL') throw storeError('VALIDATION_FAILED', '验证未通过，不能发起审批');
      if (validation.layers && validation.layers.security && validation.layers.security.ok === false) {
        throw storeError('SECURITY_BLOCKED', '安全层失败，不能发起审批');
      }

      var improving = skill.status === 'published' && version.versionId !== skill.currentVersionId;
      if (improving) {
        if (version.status !== 'validating' && version.status !== 'draft') {
          throw storeError('INVALID_VERSION_STATE', '候选版本状态不可发起审批：' + version.status);
        }
        version.status = 'validating';
        await formal.put('versions', version);
      } else if (skill.status === 'validating' || skill.status === 'draft') {
        var previous = skill.status;
        skill.status = 'pending_approval';
        skill.updatedAt = nowIso();
        await formal.put('skills', skill);
        await writeEvent(skillId, version.versionId, previous, 'pending_approval', 'validate', principal, {
          reason: 'validation-passed'
        });
      } else if (skill.status !== 'pending_approval' && skill.status !== 'approved') {
        throw storeError('INVALID_TRANSITION', '当前状态不能发起审批：' + skill.status);
      }

      var draft = version.draftId ? await formal.get('drafts', version.draftId) : null;
      var base = version.parentVersionId ? await formal.get('versions', version.parentVersionId) : null;
      var snap = Object.assign({
        name: skill.name,
        description: skill.description,
        useCases: version.content.useCases || [],
        nonUseCases: version.content.nonUseCases || [],
        inputs: version.content.inputs || [],
        outputs: version.content.outputs || [],
        workflow: version.content.workflow || [],
        allowedTools: version.content.allowedTools || [],
        requiredCapabilities: version.content.requiredCapabilities || [],
        validationVerdict: validation.verdict,
        securityFindings: (validation.layers && validation.layers.security && validation.layers.security.findings) || [],
        diff: (draft && draft.diff) || (base ? C.diffDraft(base, { content: version.content }) : null),
        risks: [],
        provenance: (draft && draft.source) || null,
        contentHash: version.contentHash,
        versionId: version.versionId,
        expiresAt: null
      }, snapshot || {});
      /* 只读副本：审批后草稿变更不得影响快照 */
      snap = clone(snap);
      snap.contentHash = version.contentHash;
      snap.versionId = version.versionId;

      var approval = {
        approvalId: C.newId('ska_'),
        skillId: skillId,
        versionId: version.versionId,
        contentHash: version.contentHash,
        requestedBy: (principal.agentId || principal.profileId),
        requestedAt: nowIso(),
        decidedBy: null,
        decidedAt: null,
        decision: 'pending',
        conditions: [],
        reason: '',
        snapshot: snap,
        expiresAt: snapshot && snapshot.expiresAt ? snapshot.expiresAt : null,
        validationId: validation.validationId,
        profileId: principal.profileId,
        schemaVersion: 1
      };
      version.approvalId = approval.approvalId;
      await formal.put('approvals', approval);
      await formal.put('versions', version);
      log('skill.approve', skillId, skill.projectId, 'PENDING', { approvalId: approval.approvalId });
      return approval;
    }

    async function decideApproval(approvalId, decision, principal, opts) {
      opts = opts || {};
      assertUser(principal, 'approve');
      await init();
      var approval = await formal.get('approvals', approvalId);
      if (!approval || !owned(approval, principal)) throw storeError('NOT_FOUND', '审批不存在');
      requireAuth(principal, 'approve', approval.skillId, approval.profileId, null);
      if (['approved', 'rejected', 'conditional'].indexOf(decision) < 0) {
        throw storeError('INVALID_DECISION', '非法审批结论：' + decision);
      }
      var skill = await requireSkill(approval.skillId, principal, 'approve');
      var version = await formal.get('versions', approval.versionId);
      if (!version) throw storeError('VERSION_NOT_FOUND', '版本不存在');

      if (approval.decision !== 'pending' && approval.decision === decision) {
        return approval; /* 幂等 */
      }
      if (decision !== 'rejected') {
        var check = root.AstroSkillContract.verifySnapshot(
          Object.assign({}, approval, { decision: decision === 'conditional' ? 'conditional' : 'approved' }), version);
        if (!check.ok) throw storeError(check.reason, '审批与版本内容绑定校验失败');
        var validation = approval.validationId
          ? await isolated.get('validations', approval.validationId)
          : await latestValidation(version.versionId);
        if (!validation) throw storeError('VALIDATION_REQUIRED', '缺少验证记录');
        if (validation.verdict === 'FAIL') throw storeError('VALIDATION_FAILED', '验证未通过');
        if (validation.layers && validation.layers.security && validation.layers.security.ok === false) {
          throw storeError('SECURITY_BLOCKED', '安全层失败，不能批准');
        }
      }

      approval.decision = decision;
      approval.decidedBy = principal.agentId || principal.profileId;
      approval.decidedAt = nowIso();
      approval.reason = String(opts.reason || '').slice(0, 500);
      approval.conditions = isArray(opts.conditions) ? opts.conditions.slice(0, 20) : [];
      if (decision === 'conditional') approval.decision = 'conditional';
      await formal.put('approvals', approval);

      var improving = skill.status === 'published' && version.versionId !== skill.currentVersionId;
      if (decision === 'rejected') {
        version.status = 'failed';
        if (!improving) skill.status = 'rejected';
      } else {
        version.status = 'approved';
        if (!improving) skill.status = 'approved';
      }
      skill.updatedAt = nowIso();
      await formal.put('versions', version);
      await formal.put('skills', skill);
      await writeEvent(skill.skillId, version.versionId, improving ? 'published' : 'pending_approval',
        improving ? 'published' : skill.status,
        decision === 'rejected' ? 'reject' : 'approve', principal, {
          reason: approval.reason, approvalId: approval.approvalId
        });
      log('skill.' + (decision === 'rejected' ? 'reject' : 'approve'),
        skill.skillId, skill.projectId, 'ALLOW', { approvalId: approval.approvalId, decision: decision });
      return approval;
    }

    /* ---------------- 发布 / 废弃 / 归档 / 回滚 ---------------- */

    async function publish(skillId, versionId, approvalId, principal) {
      var C = root.AstroSkillContract;
      assertUser(principal, 'publish');
      await init();
      var skill = await requireSkill(skillId, principal, 'publish');
      requireAuth(principal, 'publish', skillId, skill.profileId, skill.projectId);
      var version = await formal.get('versions', versionId || skill.latestVersionId);
      if (!version || version.skillId !== skillId) throw storeError('VERSION_NOT_FOUND', '版本不存在');
      C.validateVersion(version);

      if (version.status === 'published' && skill.currentVersionId === version.versionId) {
        return { ok: true, publicationId: version.publicationId, previousVersionId: null, idempotent: true };
      }
      if (registry) {
        (version.content.allowedTools || []).forEach(function (t) {
          if (!registry.has(t)) throw storeError('UNKNOWN_TOOL', '发布版本包含未注册工具：' + t);
        });
      }

      var approval = approvalId ? await formal.get('approvals', approvalId)
        : (version.approvalId ? await formal.get('approvals', version.approvalId) : null);
      if (!approval) throw storeError('APPROVAL_REQUIRED', '缺少审批记录，不能发布');
      if (approval.skillId !== skillId) throw storeError('APPROVAL_MISMATCH', '审批不属于该技能');
      var check = C.verifySnapshot(approval, version);
      if (!check.ok) throw storeError(check.reason, '审批无效或已过期');

      var validation = approval.validationId
        ? await isolated.get('validations', approval.validationId)
        : await latestValidation(version.versionId);
      if (!validation) throw storeError('VALIDATION_REQUIRED', '缺少验证记录，不能发布');
      if (validation.verdict === 'FAIL') throw storeError('VALIDATION_FAILED', '验证未通过，不能发布');
      if (validation.layers && validation.layers.security && validation.layers.security.ok === false) {
        throw storeError('SECURITY_BLOCKED', '安全层失败，不能发布');
      }
      if (validation.verdict === 'CONDITIONAL_PASS' && approval.decision !== 'conditional') {
        throw storeError('APPROVAL_CONDITION_REQUIRED', '条件通过必须由审批者接受条件后才能发布');
      }

      var previousVersionId = skill.currentVersionId;
      if (previousVersionId && previousVersionId !== version.versionId) {
        var prev = await formal.get('versions', previousVersionId);
        if (prev) {
          prev.status = 'superseded';
          prev.supersededBy = version.versionId;
          await formal.put('versions', prev);
        }
      }

      version.status = 'published';
      version.publishedAt = nowIso();
      version.approvalId = approval.approvalId;
      skill.currentVersionId = version.versionId;
      skill.latestVersionId = version.versionId;
      skill.status = 'published';
      skill.updatedAt = nowIso();

      var publication = {
        publicationId: C.newId('skp_'),
        skillId: skillId,
        versionId: version.versionId,
        approvalId: approval.approvalId,
        contentHash: version.contentHash,
        publishedBy: principal.agentId || principal.profileId,
        publishedAt: version.publishedAt,
        previousVersionId: previousVersionId || null,
        action: 'publish',
        reason: '',
        result: 'ok',
        profileId: principal.profileId,
        schemaVersion: 1
      };
      version.publicationId = publication.publicationId;
      await formal.put('publications', publication);
      await formal.put('versions', version);
      await formal.put('skills', skill);
      await writeEvent(skillId, version.versionId, 'approved', 'published', 'publish', principal, {
        approvalId: approval.approvalId
      });
      log('skill.publish', skillId, skill.projectId, 'ALLOW', {
        publicationId: publication.publicationId, previousVersionId: previousVersionId
      });
      return { ok: true, publicationId: publication.publicationId, previousVersionId: previousVersionId };
    }

    async function deprecate(skillId, principal) {
      assertUser(principal, 'publish');
      await init();
      var skill = await requireSkill(skillId, principal, 'publish');
      requireAuth(principal, 'publish', skillId, skill.profileId, skill.projectId);
      if (skill.status !== 'published') throw storeError('INVALID_TRANSITION', '仅已发布技能可废弃');
      var version = skill.currentVersionId ? await formal.get('versions', skill.currentVersionId) : null;
      var previous = skill.status;
      skill.status = 'deprecated';
      skill.updatedAt = nowIso();
      if (version) {
        version.status = 'deprecated';
        version.deprecatedAt = nowIso();
        await formal.put('versions', version);
      }
      await formal.put('skills', skill);
      await writeEvent(skillId, version ? version.versionId : null, previous, 'deprecated', 'publish', principal, {});
      log('skill.deprecate', skillId, skill.projectId, 'ALLOW');
      return { ok: true, status: 'deprecated' };
    }

    async function archive(skillId, principal) {
      assertUser(principal, 'publish');
      await init();
      var skill = await requireSkill(skillId, principal, 'publish');
      requireAuth(principal, 'publish', skillId, skill.profileId, skill.projectId);
      if (skill.status !== 'deprecated') throw storeError('INVALID_TRANSITION', '仅已废弃技能可归档');
      var previous = skill.status;
      skill.status = 'archived';
      skill.updatedAt = nowIso();
      await formal.put('skills', skill);
      await writeEvent(skillId, skill.currentVersionId, previous, 'archived', 'publish', principal, {});
      log('skill.archive', skillId, skill.projectId, 'ALLOW');
      return { ok: true, status: 'archived' };
    }

    async function rollback(skillId, targetVersionId, principal, reason) {
      assertUser(principal, 'rollback');
      await init();
      var C = root.AstroSkillContract;
      var skill = await requireSkill(skillId, principal, 'rollback');
      requireAuth(principal, 'rollback', skillId, skill.profileId, skill.projectId);
      var target = await formal.get('versions', targetVersionId);
      if (!target || target.skillId !== skillId) throw storeError('VERSION_NOT_FOUND', '目标版本不存在');
      if (!target.publishedAt && target.status !== 'published') {
        throw storeError('NOT_PUBLISHED', '目标版本从未发布，不能回滚');
      }
      if ((target.securityKnownIssues || []).length) {
        throw storeError('KNOWN_VULNERABILITY', '目标版本存在已知安全问题，需要额外审批');
      }
      C.validateVersion(target);
      if (registry) {
        (target.content.allowedTools || []).forEach(function (t) {
          if (!registry.has(t)) throw storeError('UNKNOWN_TOOL', '目标版本包含未注册工具：' + t);
        });
      }

      var previousVersionId = skill.currentVersionId;
      if (previousVersionId === targetVersionId && target.status === 'published') {
        return { ok: true, publicationId: target.publicationId, previousVersionId: null, idempotent: true };
      }
      if (previousVersionId) {
        var current = await formal.get('versions', previousVersionId);
        if (current) {
          current.status = 'rolled_back';
          await formal.put('versions', current);
        }
      }

      target.status = 'published';
      skill.currentVersionId = target.versionId;
      skill.status = 'published';
      skill.updatedAt = nowIso();
      var publication = {
        publicationId: C.newId('skp_'),
        skillId: skillId,
        versionId: target.versionId,
        approvalId: target.approvalId || null,
        contentHash: target.contentHash,
        publishedBy: principal.agentId || principal.profileId,
        publishedAt: nowIso(),
        previousVersionId: previousVersionId || null,
        action: 'rollback',
        reason: String(reason || '').slice(0, 500),
        result: 'ok',
        profileId: principal.profileId,
        schemaVersion: 1
      };
      await formal.put('publications', publication);
      await formal.put('versions', target);
      await formal.put('skills', skill);
      await writeEvent(skillId, target.versionId, 'published', 'published', 'rollback', principal, {
        reason: publication.reason
      });
      log('skill.rollback', skillId, skill.projectId, 'ALLOW', {
        publicationId: publication.publicationId, previousVersionId: previousVersionId
      });
      return { ok: true, publicationId: publication.publicationId, previousVersionId: previousVersionId };
    }

    /* ---------------- 读取 ---------------- */

    async function getSkill(skillId, principal) {
      await init();
      var skill = await formal.get('skills', skillId);
      if (!owned(skill, principal)) return null;
      return skill;
    }

    async function listSkills(principal, opts) {
      opts = opts || {};
      if (!principal || !principal.profileId) return [];
      await init();
      var all = await formal.all('skills');
      var out = all.filter(function (s) {
        if (!owned(s, principal)) return false;
        if (principal.projectId && s.projectId && principal.projectId !== s.projectId) return false;
        if (opts.projectId && s.projectId !== opts.projectId) return false;
        if (opts.scope && s.scope !== opts.scope) return false;
        if (opts.status && s.status !== opts.status) return false;
        return true;
      });
      out.sort(function (a, b) { return String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')); });
      return out.slice(0, typeof opts.limit === 'number' ? opts.limit : 100);
    }

    async function getVersion(versionId, principal) {
      await init();
      var v = await formal.get('versions', versionId);
      if (!owned(v, principal)) return null;
      return v;
    }

    async function listVersions(skillId, principal) {
      await init();
      var skill = await formal.get('skills', skillId);
      if (!owned(skill, principal)) return [];
      var all = await versionsOf(skillId);
      all.sort(function (a, b) {
        return root.AstroSkillContract.semver.compare(b.version, a.version);
      });
      return all;
    }

    async function getPublished(skillId, principal) {
      await init();
      var skill = await formal.get('skills', skillId);
      if (!owned(skill, principal)) return null;
      if (!skill.currentVersionId) return null;
      var version = await formal.get('versions', skill.currentVersionId);
      if (!version || version.status !== 'published') return null;
      return { skill: skill, version: version };
    }

    /* ---------------- 执行记录 / 反馈 / 统计 ---------------- */

    async function recordExecution(record, principal) {
      if (!record || !record.executionId) throw storeError('INVALID_EXECUTION', '缺少 executionId');
      await init();
      requireAuth(principal, 'read', record.skillId || '', principal.profileId, record.projectId || null);
      var skill = await formal.get('skills', record.skillId);
      if (!owned(skill, principal)) throw storeError('NOT_FOUND', '技能不存在');
      var rec = Object.assign({}, record, { profileId: principal.profileId });
      await formal.put('executions', rec);

      var stats = skill.stats || { uses: 0, success: 0, failure: 0, successRate: 0, avgDurationMs: 0, lastUsedAt: null };
      stats.uses += 1;
      if (rec.status === 'ok') stats.success += 1;
      else if (rec.status === 'running') { /* 运行中不计失败 */ }
      else stats.failure += 1;
      var total = stats.success + stats.failure;
      stats.successRate = total ? Math.round((stats.success / total) * 1000) / 1000 : 0;
      var dur = typeof rec.durationMs === 'number' ? rec.durationMs : 0;
      stats.avgDurationMs = stats.uses
        ? Math.round(((stats.avgDurationMs || 0) * (stats.uses - 1) + dur) / stats.uses) : dur;
      stats.lastUsedAt = rec.completedAt || rec.startedAt || nowIso();
      skill.stats = stats;
      skill.updatedAt = nowIso();
      await formal.put('skills', skill);

      log(rec.status === 'ok' ? 'skill.execute' : 'skill.fail', rec.skillId, rec.projectId,
        rec.status === 'ok' ? 'ALLOW' : (rec.failureCategory || 'FAILED'), {
          executionId: rec.executionId, versionId: rec.versionId
        });
      return rec;
    }

    async function listExecutions(skillId, principal, opts) {
      opts = opts || {};
      await init();
      var all = await formal.all('executions');
      var out = all.filter(function (e) {
        if (!owned(e, principal)) return false;
        if (skillId && e.skillId !== skillId) return false;
        if (opts.versionId && e.versionId !== opts.versionId) return false;
        if (opts.status && e.status !== opts.status) return false;
        if (principal.projectId && e.projectId && principal.projectId !== e.projectId) return false;
        return true;
      });
      out.sort(function (a, b) { return String(b.startedAt || '').localeCompare(String(a.startedAt || '')); });
      return out.slice(0, typeof opts.limit === 'number' ? opts.limit : 100);
    }

    async function recordFeedback(record, principal) {
      if (!record || !record.feedbackId) throw storeError('INVALID_FEEDBACK', '缺少 feedbackId');
      await init();
      requireAuth(principal, 'execute', record.skillId || '', principal.profileId, null);
      var rec = Object.assign({}, record, {
        profileId: principal.profileId,
        comment: String(record.comment || '').slice(0, 500),
        createdAt: record.createdAt || nowIso()
      });
      await formal.put('feedback', rec);
      log('skill.feedback', rec.skillId, null, 'ALLOW', { feedbackId: rec.feedbackId });
      return rec;
    }

    async function stats(skillId, principal) {
      var skill = await getSkill(skillId, principal);
      if (!skill) return null;
      var list = await listExecutions(skillId, principal, { limit: 1000 });
      var success = list.filter(function (e) { return e.status === 'ok'; }).length;
      var failure = list.filter(function (e) { return e.status !== 'ok' && e.status !== 'running'; }).length;
      var total = success + failure;
      return {
        uses: list.length,
        success: success,
        failure: failure,
        successRate: total ? Math.round((success / total) * 1000) / 1000 : 0,
        avgDurationMs: skill.stats ? skill.stats.avgDurationMs : 0,
        lastUsedAt: skill.stats ? skill.stats.lastUsedAt : null
      };
    }

    async function listFeedback(skillId, principal) {
      await init();
      var all = await formal.all('feedback');
      return all.filter(function (f) { return f && f.skillId === skillId && owned(f, principal); });
    }

    async function listApprovals(skillId, principal) {
      await init();
      var all = await formal.all('approvals');
      return all.filter(function (a) { return a && a.skillId === skillId && owned(a, principal); });
    }

    async function listPublications(skillId, principal) {
      await init();
      var all = await formal.all('publications');
      return all.filter(function (p) { return p && p.skillId === skillId && owned(p, principal); });
    }

    async function listEvents(skillId, principal) {
      await init();
      var all = await formal.all('events');
      return all.filter(function (e) { return e && e.skillId === skillId && owned(e, principal); });
    }

    return {
      init: init,
      createProposal: createProposal,
      getProposal: getProposal,
      listProposals: listProposals,
      markProposal: markProposal,
      createDraft: createDraft,
      updateDraft: updateDraft,
      getDraft: getDraft,
      saveValidation: saveValidation,
      getValidation: getValidation,
      listValidations: listValidations,
      latestValidation: latestValidation,
      saveEvaluation: saveEvaluation,
      transitionSkill: transitionSkill,
      requestApproval: requestApproval,
      decideApproval: decideApproval,
      publish: publish,
      deprecate: deprecate,
      archive: archive,
      rollback: rollback,
      getSkill: getSkill,
      listSkills: listSkills,
      getVersion: getVersion,
      listVersions: listVersions,
      getPublished: getPublished,
      listApprovals: listApprovals,
      listPublications: listPublications,
      listEvents: listEvents,
      recordExecution: recordExecution,
      listExecutions: listExecutions,
      recordFeedback: recordFeedback,
      listFeedback: listFeedback,
      stats: stats,
      backend: function () { return formal.backend(); },
      validationBackend: function () { return isolated.backend(); },
      ownerProfileId: function () { return owner; },
      dbName: function () { return formal.dbName(); },
      validationDbName: function () { return isolated.dbName(); }
    };
  }

  root.AstroSkillStore = {
    create: create,
    DB_NAME: BASE_DB,
    VALIDATION_DB: VALIDATION_DB,
    STORES: STORES,
    VALIDATION_STORES: VALIDATION_STORES,
    MAX_OPEN_PROPOSALS: MAX_OPEN_PROPOSALS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
