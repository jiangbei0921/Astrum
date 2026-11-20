/* ASTRUM · P2 科研技能契约层
 *
 * 职责（纯函数，无存储、无 DOM、无权限决策）：
 *   1) 数据模型工厂：Proposal / Draft / Skill / Version
 *   2) 状态机：技能状态与版本状态的合法转移
 *   3) 内容规范化与 SHA-256 哈希（审批绑定 / 去重 / 审计）
 *   4) Schema 校验与差异计算（SemVer 分类）
 *
 * 边界：只描述「应该是什么样」，不决定「谁可以做什么」。
 * 权限与持久化分别由 security.js / skill-store.js 负责。
 */
(function (root) {
  'use strict';

  var SCHEMA_VERSION = 1;

  var STATUS = [
    'proposed', 'draft', 'validating', 'validation_failed', 'pending_approval',
    'approved', 'published', 'deprecated', 'archived', 'rejected'
  ];

  var VERSION_STATUS = [
    'draft', 'validating', 'failed', 'approved', 'published',
    'deprecated', 'superseded', 'rolled_back'
  ];

  var CATEGORIES = ['observation', 'data', 'evidence', 'calculation', 'report', 'workflow'];

  var CAPABILITY_MAP = {
    read: 'skill.read',
    propose: 'skill.propose',
    draft: 'skill.create',
    create: 'skill.create',
    test: 'skill.test',
    evaluate: 'skill.evaluate',
    approve: 'skill.approve',
    publish: 'skill.publish',
    execute: 'skill.execute',
    rollback: 'skill.rollback'
  };

  /* 技能状态机：from → to → { action, capability, actors } */
  var TRANSITIONS = {
    proposed: {
      draft: { action: 'draft', capability: 'skill.create', actors: ['agent', 'user'] },
      rejected: { action: 'approve', capability: 'skill.approve', actors: ['user'] }
    },
    draft: {
      validating: { action: 'test', capability: 'skill.test', actors: ['agent', 'user'] }
    },
    validating: {
      validation_failed: { action: 'validate', capability: '', actors: ['system'] },
      pending_approval: { action: 'validate', capability: '', actors: ['system'] }
    },
    validation_failed: {
      draft: { action: 'draft', capability: 'skill.create', actors: ['agent', 'user'] }
    },
    pending_approval: {
      approved: { action: 'approve', capability: 'skill.approve', actors: ['user'] },
      rejected: { action: 'approve', capability: 'skill.approve', actors: ['user'] }
    },
    approved: {
      published: { action: 'publish', capability: 'skill.publish', actors: ['user'] }
    },
    published: {
      deprecated: { action: 'publish', capability: 'skill.publish', actors: ['user'] }
    },
    deprecated: {
      archived: { action: 'publish', capability: 'skill.publish', actors: ['user'] }
    },
    rejected: {
      draft: { action: 'draft', capability: 'skill.create', actors: ['user'] }
    },
    archived: {}
  };

  var LIMITS = {
    candidateName: 60,
    name: 80,
    description: 1000,
    draftDescription: 2000,
    motivation: 1000,
    workflowSteps: 50,
    timeoutMs: 120000,
    retryMax: 2,
    feedbackComment: 500
  };

  /* 草稿中任何位置都不允许出现的可执行字段名 */
  var FORBIDDEN_KEYS = ['code', 'script', 'eval', 'exec', 'Function', 'sourceCode', 'newFunction'];

  function nowIso() { return new Date().toISOString(); }

  function err(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function str(v) { return String(v == null ? '' : v); }
  function trim(v) { return str(v).replace(/\s+/g, ' ').trim(); }

  function clone(v) {
    if (v == null) return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function newId(prefix) {
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /* 规范化 JSON：键排序、无空白，保证同内容哈希稳定 */
  function canonical(value) {
    if (value === null || typeof value === 'undefined') return 'null';
    if (typeof value === 'number') return isFinite(value) ? String(value) : 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return JSON.stringify(value);
    if (isArray(value)) {
      return '[' + value.map(canonical).join(',') + ']';
    }
    if (typeof value === 'object') {
      var keys = Object.keys(value).sort();
      var parts = [];
      for (var i = 0; i < keys.length; i++) {
        if (typeof value[keys[i]] === 'undefined') continue;
        parts.push(JSON.stringify(keys[i]) + ':' + canonical(value[keys[i]]));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  }

  function sha256Hex(text) {
    if (root.AstroTask && typeof root.AstroTask.sha256Hex === 'function') {
      return root.AstroTask.sha256Hex(text);
    }
    /* 测试替身缺失时的确定性回退：不伪装成 SHA-256 */
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return ('00000000' + h.toString(16)).slice(-8) + ':' + text.length;
  }

  var CONTENT_KEYS = [
    'purpose', 'useCases', 'nonUseCases', 'prerequisites', 'inputs', 'outputs',
    'workflow', 'constraints', 'errorHandling', 'allowedAgents', 'allowedTools',
    'requiredCapabilities', 'timeoutMs', 'retryPolicy'
  ];

  function normalizeContent(content) {
    content = content || {};
    var out = {};
    CONTENT_KEYS.forEach(function (k) {
      var v = content[k];
      if (typeof v === 'undefined') return;
      out[k] = clone(v);
    });
    return out;
  }

  function contentHash(content) {
    return 'sha256:' + sha256Hex(canonical(normalizeContent(content)));
  }

  /* ---------------- 状态机 ---------------- */

  function statusOf(entity) {
    if (!entity) return '';
    return typeof entity === 'string' ? entity : str(entity.status);
  }

  function transitionRule(from, to) {
    var m = TRANSITIONS[from];
    return m && m[to] ? m[to] : null;
  }

  function canTransition(entity, to) {
    var from = statusOf(entity);
    if (STATUS.indexOf(from) < 0) return false;
    if (STATUS.indexOf(to) < 0) return false;
    return !!transitionRule(from, to);
  }

  function canOperate(entity, to, principal) {
    var from = statusOf(entity);
    var rule = transitionRule(from, to);
    if (!rule) return false;
    var type = (principal && principal.principalType) || 'agent';
    return rule.actors.indexOf(type) >= 0;
  }

  function transition(entity, to, ctx) {
    ctx = ctx || {};
    var from = statusOf(entity);
    if (!canTransition(entity, to)) {
      var e = err('INVALID_TRANSITION', '非法技能状态转移 from=' + from + ' to=' + to);
      e.from = from;
      e.to = to;
      throw e;
    }
    if (ctx.principal && !canOperate(entity, to, ctx.principal)) {
      throw err('USER_ONLY', '该操作只允许用户执行：' + from + '→' + to);
    }
    var next = (isPlainObject(entity) ? clone(entity) : { status: from });
    next.status = to;
    next.updatedAt = ctx.at || nowIso();
    return next;
  }

  /* ---------------- Schema ---------------- */

  function assert(cond, code, message) {
    if (!cond) throw err(code, message);
  }

  function assertSafe(value, depth, path) {
    if (depth > 20 || value == null || typeof value !== 'object') return;
    if (isArray(value)) {
      for (var i = 0; i < value.length; i++) assertSafe(value[i], depth + 1, path + '[' + i + ']');
      return;
    }
    var keys = Object.keys(value);
    for (var k = 0; k < keys.length; k++) {
      var key = keys[k];
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        throw err('INVALID_BUNDLE', '包含危险字段：' + path + '.' + key);
      }
      if (FORBIDDEN_KEYS.indexOf(key) >= 0) {
        throw err('EXECUTABLE_FIELD', '禁止可执行字段：' + path + '.' + key);
      }
      assertSafe(value[key], depth + 1, path + '.' + key);
    }
  }

  function assertSemver(v) {
    var p = parseSemver(v);
    assert(p, 'E_SEMVER', '非法版本号：' + v);
    return p;
  }

  function validateProposal(p) {
    assert(isPlainObject(p), 'E_PROPOSAL_SHAPE', '提议必须是对象');
    assert(p.proposalId, 'E_PROPOSAL_ID', '缺少 proposalId');
    assert(p.profileId, 'E_PROPOSAL_PROFILE', '缺少 profileId');
    assert(trim(p.candidateName), 'E_PROPOSAL_NAME', '缺少候选名称');
    assert(str(p.candidateName).length <= LIMITS.candidateName, 'E_PROPOSAL_NAME', '候选名称过长');
    assert(str(p.description).length <= LIMITS.description, 'E_PROPOSAL_DESC', '描述过长');
    assert(str(p.motivation).length <= LIMITS.motivation, 'E_PROPOSAL_MOTIVATION', '动机过长');
    assert(['proposed', 'draft', 'rejected', 'converted'].indexOf(p.status) >= 0,
      'E_PROPOSAL_STATUS', '非法提议状态：' + p.status);
    assert(p.schemaVersion === SCHEMA_VERSION, 'E_SCHEMA_VERSION', 'schemaVersion 必须为 1');
    if (p.occurrence) {
      assert(typeof p.occurrence.runs === 'number' && p.occurrence.runs >= 0,
        'E_PROPOSAL_OCCURRENCE', 'occurrence.runs 非法');
    }
    return true;
  }

  function validateIoList(list, label) {
    assert(isArray(list), 'E_DRAFT_' + label, label + ' 必须是数组');
    list.forEach(function (item, i) {
      assert(isPlainObject(item), 'E_DRAFT_' + label, label + '[' + i + '] 必须是对象');
      assert(trim(item.name), 'E_DRAFT_' + label, label + '[' + i + '] 缺少 name');
      assert(trim(item.type), 'E_DRAFT_' + label, label + '[' + i + '] 缺少 type');
      assert(typeof item.required === 'boolean', 'E_DRAFT_' + label,
        label + '[' + i + '].required 必须是布尔');
    });
  }

  function validateDraft(d) {
    assert(isPlainObject(d), 'E_DRAFT_SHAPE', '草稿必须是对象');
    assert(d.draftId, 'E_DRAFT_ID', '缺少 draftId');
    assert(d.skillId, 'E_DRAFT_SKILL', '缺少 skillId');
    assert(trim(d.name), 'E_DRAFT_NAME', '缺少 name');
    assert(str(d.name).length <= LIMITS.name, 'E_DRAFT_NAME', '名称过长');
    assert(str(d.description).length <= LIMITS.draftDescription, 'E_DRAFT_DESC', '描述过长');
    assert(CATEGORIES.indexOf(d.category) >= 0, 'E_DRAFT_CATEGORY', '非法 category：' + d.category);
    assert(d.executionMode === 'declarative', 'E_DRAFT_MODE', 'executionMode 只允许 declarative');
    assert(d.schemaVersion === SCHEMA_VERSION, 'E_SCHEMA_VERSION', 'schemaVersion 必须为 1');

    assert(isArray(d.workflow) && d.workflow.length > 0, 'E_DRAFT_WORKFLOW', 'workflow 不能为空');
    assert(d.workflow.length <= LIMITS.workflowSteps, 'E_DRAFT_WORKFLOW', '步骤数超限');
    var seen = {};
    d.workflow.forEach(function (s, i) {
      assert(isPlainObject(s), 'E_DRAFT_WORKFLOW', 'workflow[' + i + '] 必须是对象');
      assert(trim(s.stepId), 'E_DRAFT_STEP_ID', 'workflow[' + i + '] 缺少 stepId');
      assert(!seen[s.stepId], 'E_DRAFT_STEP_ID', 'stepId 重复：' + s.stepId);
      seen[s.stepId] = 1;
      assert(trim(s.tool), 'E_DRAFT_TOOL', 'workflow[' + i + '] 缺少 tool');
      assert(['fail', 'skip', 'retry'].indexOf(s.onError || 'fail') >= 0,
        'E_DRAFT_ONERROR', 'onError 非法：' + s.onError);
      if (typeof s.timeoutMs !== 'undefined') {
        assert(typeof s.timeoutMs === 'number' && s.timeoutMs > 0 && s.timeoutMs <= LIMITS.timeoutMs,
          'E_DRAFT_TIMEOUT', '单步超时必须在 1..120000ms');
      }
    });

    assert(typeof d.timeoutMs === 'number' && d.timeoutMs > 0 && d.timeoutMs <= LIMITS.timeoutMs,
      'E_DRAFT_TIMEOUT', 'timeoutMs 必须在 1..120000ms');
    var retry = d.retryPolicy || { max: 0, backoffMs: 0 };
    assert(typeof retry.max === 'number' && retry.max >= 0 && retry.max <= LIMITS.retryMax,
      'E_DRAFT_RETRY', '重试次数不能超过 2');

    validateIoList(d.inputs || [], 'INPUTS');
    validateIoList(d.outputs || [], 'OUTPUTS');
    assert((d.inputs || []).length > 0, 'E_DRAFT_INPUTS', '缺少输入契约');
    assert((d.outputs || []).length > 0, 'E_DRAFT_OUTPUTS', '缺少输出契约');
    assert(isArray(d.allowedTools || []), 'E_DRAFT_TOOLS', 'allowedTools 必须是数组');
    assert(isArray(d.requiredCapabilities || []), 'E_DRAFT_CAPS', 'requiredCapabilities 必须是数组');
    assert(isArray(d.allowedAgents || []), 'E_DRAFT_AGENTS', 'allowedAgents 必须是数组');

    assertSafe(d, 0, 'draft');
    return true;
  }

  function validateSkill(s) {
    assert(isPlainObject(s), 'E_SKILL_SHAPE', 'Skill 必须是对象');
    assert(s.skillId, 'E_SKILL_ID', '缺少 skillId');
    assert(s.profileId, 'E_SKILL_PROFILE', '缺少 profileId');
    assert(STATUS.indexOf(s.status) >= 0, 'E_SKILL_STATUS', '非法技能状态：' + s.status);
    assert(s.scope === 'profile' || s.scope === 'project', 'E_SKILL_SCOPE', '非法作用域：' + s.scope);
    if (s.scope === 'project') assert(s.projectId, 'E_SKILL_SCOPE', 'project 级技能必须带 projectId');
    assert(trim(s.name), 'E_SKILL_NAME', '缺少名称');
    assert(s.schemaVersion === SCHEMA_VERSION, 'E_SCHEMA_VERSION', 'schemaVersion 必须为 1');
    return true;
  }

  function validateVersion(v) {
    assert(isPlainObject(v), 'E_VERSION_SHAPE', 'Version 必须是对象');
    assert(v.versionId, 'E_VERSION_ID', '缺少 versionId');
    assert(v.skillId, 'E_VERSION_SKILL', '缺少 skillId');
    assertSemver(v.version);
    assert(VERSION_STATUS.indexOf(v.status) >= 0, 'E_VERSION_STATUS', '非法版本状态：' + v.status);
    assert(v.contentHash, 'E_VERSION_HASH', '缺少 contentHash');
    assert(v.contentHash === contentHash(v.content), 'E_VERSION_HASH', 'contentHash 与内容不一致');
    assert(v.schemaVersion === SCHEMA_VERSION, 'E_SCHEMA_VERSION', 'schemaVersion 必须为 1');
    return true;
  }

  /* ---------------- SemVer ---------------- */

  function parseSemver(v) {
    var m = /^(\d+)\.(\d+)\.(\d+)$/.exec(str(v));
    if (!m) return null;
    return { major: parseInt(m[1], 10), minor: parseInt(m[2], 10), patch: parseInt(m[3], 10) };
  }

  function compareSemver(a, b) {
    var x = parseSemver(a), y = parseSemver(b);
    if (!x || !y) return 0;
    if (x.major !== y.major) return x.major > y.major ? 1 : -1;
    if (x.minor !== y.minor) return x.minor > y.minor ? 1 : -1;
    if (x.patch !== y.patch) return x.patch > y.patch ? 1 : -1;
    return 0;
  }

  function bumpSemver(label, kind) {
    var p = parseSemver(label) || { major: 1, minor: 0, patch: 0 };
    if (kind === 'major') return (p.major + 1) + '.0.0';
    if (kind === 'minor') return p.major + '.' + (p.minor + 1) + '.0';
    if (kind === 'patch') return p.major + '.' + p.minor + '.' + (p.patch + 1);
    return label;
  }

  function indexSteps(workflow) {
    var map = {};
    (isArray(workflow) ? workflow : []).forEach(function (s) {
      if (s && s.stepId) map[s.stepId] = s;
      else if (s && s.tool) map['tool:' + s.tool] = s;
    });
    return map;
  }

  function diffDraft(baseVersion, draft) {
    var base = baseVersion && baseVersion.content ? baseVersion.content : {};
    var next = draft && draft.content ? draft.content : (draft || {});
    var baseInputs = base.inputs || [];
    var nextInputs = next.inputs || [];
    var baseOutputs = base.outputs || [];
    var nextOutputs = next.outputs || [];
    var baseSteps = indexSteps(base.workflow);
    var nextSteps = indexSteps(next.workflow);
    var addedSteps = Object.keys(nextSteps).filter(function (k) { return !baseSteps[k]; });
    var removedSteps = Object.keys(baseSteps).filter(function (k) { return !nextSteps[k]; });
    var baseTools = base.allowedTools || [];
    var nextTools = next.allowedTools || [];
    var baseCaps = base.requiredCapabilities || [];
    var nextCaps = next.requiredCapabilities || [];
    var toolsAdded = nextTools.filter(function (t) { return baseTools.indexOf(t) < 0; });
    var toolsRemoved = baseTools.filter(function (t) { return nextTools.indexOf(t) < 0; });
    var capsAdded = nextCaps.filter(function (c) { return baseCaps.indexOf(c) < 0; });
    var capsRemoved = baseCaps.filter(function (c) { return nextCaps.indexOf(c) < 0; });
    var inputsChanged = canonical(baseInputs) !== canonical(nextInputs);
    var outputsChanged = canonical(baseOutputs) !== canonical(nextOutputs);
    var permissionsExpanded = toolsAdded.length > 0 || capsAdded.length > 0;
    return {
      inputsChanged: inputsChanged,
      outputsChanged: outputsChanged,
      addedSteps: addedSteps,
      removedSteps: removedSteps,
      inputChanges: {
        added: nextInputs.filter(function (n) {
          return !baseInputs.some(function (b) { return b.name === n.name; });
        }).map(function (x) { return x.name; }),
        removed: baseInputs.filter(function (b) {
          return !nextInputs.some(function (n) { return n.name === b.name; });
        }).map(function (x) { return x.name; })
      },
      outputChanges: {
        added: nextOutputs.filter(function (n) {
          return !baseOutputs.some(function (b) { return b.name === n.name; });
        }).map(function (x) { return x.name; }),
        removed: baseOutputs.filter(function (b) {
          return !nextOutputs.some(function (n) { return n.name === b.name; });
        }).map(function (x) { return x.name; })
      },
      toolsAdded: toolsAdded,
      toolsRemoved: toolsRemoved,
      capabilitiesAdded: capsAdded,
      capabilitiesRemoved: capsRemoved,
      permissionsExpanded: permissionsExpanded,
      permissionChanges: {
        expanded: permissionsExpanded,
        toolsAdded: toolsAdded,
        toolsRemoved: toolsRemoved,
        capabilitiesAdded: capsAdded,
        capabilitiesRemoved: capsRemoved
      },
      compatible: !(inputsChanged || outputsChanged || permissionsExpanded)
    };
  }

  function classify(baseVersion, next) {
    if (!baseVersion || !baseVersion.content) return 'major';
    var diff = diffDraft(baseVersion, next && next.content ? next : { content: next || {} });
    if (diff.inputsChanged || diff.outputsChanged || diff.permissionsExpanded) return 'major';
    if (diff.addedSteps.length || diff.removedSteps.length) return 'minor';
    return 'patch';
  }

  /* ---------------- 审批绑定 ---------------- */

  function verifySnapshot(approval, version, at) {
    if (!approval) return { ok: false, reason: 'APPROVAL_REQUIRED' };
    if (!version) return { ok: false, reason: 'VERSION_NOT_FOUND' };
    if (approval.versionId !== version.versionId) return { ok: false, reason: 'APPROVAL_MISMATCH' };
    if (approval.contentHash !== version.contentHash) return { ok: false, reason: 'APPROVAL_MISMATCH' };
    if (approval.decision !== 'approved' && approval.decision !== 'conditional') {
      return { ok: false, reason: 'APPROVAL_NOT_GRANTED' };
    }
    var now = at ? Date.parse(at) : Date.now();
    if (approval.expiresAt && Date.parse(approval.expiresAt) < now) {
      return { ok: false, reason: 'APPROVAL_EXPIRED' };
    }
    return { ok: true, reason: 'ALLOW' };
  }

  /* ---------------- 模型工厂 ---------------- */

  function makeProposal(input) {
    input = input || {};
    var p = {
      proposalId: input.proposalId || newId('skp_'),
      profileId: input.profileId || '',
      projectId: input.projectId || null,
      candidateName: trim(input.candidateName).slice(0, LIMITS.candidateName),
      description: str(input.description).slice(0, LIMITS.description),
      motivation: str(input.motivation).slice(0, LIMITS.motivation),
      workflowSummary: str(input.workflowSummary).slice(0, 500),
      signature: str(input.signature),
      supportingTaskIds: isArray(input.supportingTaskIds) ? input.supportingTaskIds.slice(0, 100) : [],
      supportingMemoryIds: isArray(input.supportingMemoryIds) ? input.supportingMemoryIds.slice(0, 100) : [],
      evidenceIds: isArray(input.evidenceIds) ? input.evidenceIds.slice(0, 100) : [],
      candidateSkillId: input.candidateSkillId || null,
      similarity: typeof input.similarity === 'number' ? input.similarity : 0,
      confidence: ['low', 'medium', 'high'].indexOf(input.confidence) >= 0 ? input.confidence : 'low',
      occurrence: input.occurrence || { runs: 0, success: 0, failure: 0, successRate: 0 },
      status: 'proposed',
      limits: { iterationDepth: (input.limits && input.limits.iterationDepth) || 1 },
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
      schemaVersion: SCHEMA_VERSION
    };
    validateProposal(p);
    return p;
  }

  function defaultWorkflow(list) {
    if (!isArray(list)) return [];
    return list.map(function (s, i) {
      s = s || {};
      return {
        stepId: str(s.stepId || ('s' + (i + 1))),
        tool: str(s.tool),
        argsTemplate: isPlainObject(s.argsTemplate) ? clone(s.argsTemplate) : {},
        purpose: str(s.purpose).slice(0, 200),
        onError: ['fail', 'skip', 'retry'].indexOf(s.onError) >= 0 ? s.onError : 'fail',
        timeoutMs: typeof s.timeoutMs === 'number' ? s.timeoutMs : 30000
      };
    });
  }

  function makeDraft(input) {
    input = input || {};
    var content = normalizeContent(input.content || input);
    var d = {
      draftId: input.draftId || newId('skd_'),
      proposalId: input.proposalId || null,
      skillId: input.skillId || '',
      baseVersionId: input.baseVersionId || null,
      name: trim(input.name).slice(0, LIMITS.name),
      description: str(input.description).slice(0, LIMITS.draftDescription),
      category: CATEGORIES.indexOf(input.category) >= 0 ? input.category : 'workflow',
      purpose: str(input.purpose || content.purpose || '').slice(0, 1000),
      useCases: isArray(input.useCases) ? input.useCases.map(trim).slice(0, 20) : (content.useCases || []),
      nonUseCases: isArray(input.nonUseCases) ? input.nonUseCases.map(trim).slice(0, 20) : (content.nonUseCases || []),
      prerequisites: isArray(input.prerequisites) ? input.prerequisites.slice(0, 20) : (content.prerequisites || []),
      inputs: isArray(input.inputs) ? clone(input.inputs) : (content.inputs || []),
      outputs: isArray(input.outputs) ? clone(input.outputs) : (content.outputs || []),
      workflow: defaultWorkflow(input.workflow || content.workflow),
      constraints: isArray(input.constraints) ? input.constraints.slice(0, 20) : (content.constraints || []),
      errorHandling: isArray(input.errorHandling) ? input.errorHandling.slice(0, 20) : (content.errorHandling || []),
      allowedAgents: isArray(input.allowedAgents) ? input.allowedAgents.slice(0, 20) : (content.allowedAgents || []),
      requiredCapabilities: isArray(input.requiredCapabilities)
        ? input.requiredCapabilities.slice(0, 20) : (content.requiredCapabilities || []),
      allowedTools: isArray(input.allowedTools) ? input.allowedTools.slice(0, 30) : (content.allowedTools || []),
      executionMode: 'declarative',
      timeoutMs: typeof input.timeoutMs === 'number' ? input.timeoutMs : (content.timeoutMs || 60000),
      retryPolicy: input.retryPolicy || content.retryPolicy || { max: 1, backoffMs: 200 },
      testCases: isArray(input.testCases) ? clone(input.testCases).slice(0, 20) : [],
      expectedOutputs: input.expectedOutputs || null,
      qualityCriteria: input.qualityCriteria || null,
      securityRequirements: isArray(input.securityRequirements) ? input.securityRequirements.slice(0, 20) : [],
      diff: input.diff || null,
      source: {
        proposalId: (input.source && input.source.proposalId) || input.proposalId || null,
        taskIds: (input.source && isArray(input.source.taskIds) ? input.source.taskIds : []).slice(0, 100),
        memoryIds: (input.source && isArray(input.source.memoryIds) ? input.source.memoryIds : []).slice(0, 100),
        evidenceIds: (input.source && isArray(input.source.evidenceIds) ? input.source.evidenceIds : []).slice(0, 100)
      },
      status: 'draft',
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
      schemaVersion: SCHEMA_VERSION
    };
    return d;
  }

  function makeSkill(input) {
    input = input || {};
    var scope = input.scope === 'project' ? 'project' : 'profile';
    var s = {
      skillId: input.skillId || newId('skl_'),
      profileId: input.profileId || '',
      projectId: input.projectId || null,
      scope: scope,
      name: trim(input.name).slice(0, LIMITS.name),
      description: str(input.description).slice(0, LIMITS.draftDescription),
      category: CATEGORIES.indexOf(input.category) >= 0 ? input.category : 'workflow',
      status: STATUS.indexOf(input.status) >= 0 ? input.status : 'proposed',
      currentVersionId: input.currentVersionId || null,
      latestVersionId: input.latestVersionId || null,
      allowedAgents: isArray(input.allowedAgents) ? input.allowedAgents.slice(0, 20) : [],
      allowedTools: isArray(input.allowedTools) ? input.allowedTools.slice(0, 30) : [],
      requiredCapabilities: isArray(input.requiredCapabilities) ? input.requiredCapabilities.slice(0, 20) : [],
      createdBy: input.createdBy || '',
      createdAt: input.createdAt || nowIso(),
      updatedAt: nowIso(),
      stats: input.stats || { uses: 0, success: 0, failure: 0, successRate: 0, avgDurationMs: 0, lastUsedAt: null },
      signature: str(input.signature),
      securityKnownIssues: isArray(input.securityKnownIssues) ? input.securityKnownIssues.slice(0, 20) : [],
      schemaVersion: SCHEMA_VERSION
    };
    validateSkill(s);
    return s;
  }

  function makeVersion(input) {
    input = input || {};
    var content = normalizeContent(input.content || {});
    var v = {
      versionId: input.versionId || newId('skv_'),
      skillId: input.skillId || '',
      version: str(input.version || '1.0.0'),
      parentVersionId: input.parentVersionId || null,
      changelog: str(input.changelog || ''),
      contentHash: input.contentHash || contentHash(content),
      content: content,
      validationId: input.validationId || null,
      approvalId: input.approvalId || null,
      publicationId: input.publicationId || null,
      status: VERSION_STATUS.indexOf(input.status) >= 0 ? input.status : 'draft',
      securityKnownIssues: isArray(input.securityKnownIssues) ? input.securityKnownIssues.slice(0, 20) : [],
      createdAt: input.createdAt || nowIso(),
      publishedAt: input.publishedAt || null,
      deprecatedAt: input.deprecatedAt || null,
      supersededBy: input.supersededBy || null,
      schemaVersion: SCHEMA_VERSION
    };
    return v;
  }

  root.AstroSkillContract = {
    SCHEMA_VERSION: SCHEMA_VERSION,
    STATUS: STATUS,
    VERSION_STATUS: VERSION_STATUS,
    CATEGORIES: CATEGORIES,
    CAPABILITY_MAP: CAPABILITY_MAP,
    TRANSITIONS: TRANSITIONS,
    LIMITS: LIMITS,
    FORBIDDEN_KEYS: FORBIDDEN_KEYS,
    makeProposal: makeProposal,
    makeDraft: makeDraft,
    makeSkill: makeSkill,
    makeVersion: makeVersion,
    validateProposal: validateProposal,
    validateDraft: validateDraft,
    validateSkill: validateSkill,
    validateVersion: validateVersion,
    canTransition: canTransition,
    canOperate: canOperate,
    transitionRule: transitionRule,
    transition: transition,
    normalizeContent: normalizeContent,
    canonical: canonical,
    contentHash: contentHash,
    diffDraft: diffDraft,
    verifySnapshot: verifySnapshot,
    semver: {
      parse: parseSemver,
      compare: compareSemver,
      bump: bumpSemver,
      classify: classify
    },
    newId: newId,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
