/* ASTRUM · P1 ResearchProject 纯模型
 *
 * 职责仅限「结构 + 校验 + 合法转移」：
 *   - 字段默认值、长度约束、状态枚举
 *   - 状态机（active/paused/archived/deleted）
 *   - 版本号与时间戳维护
 *
 * 不做：存储、DOM、权限判断（分别由 research-store.js / project-ui.js / security.js 负责）。
 */
(function (root) {
  'use strict';

  var STATUS = ['active', 'paused', 'archived', 'deleted'];

  var LEGAL_TRANSITIONS = {
    active: ['paused', 'archived', 'deleted'],
    paused: ['active', 'archived', 'deleted'],
    archived: ['paused', 'deleted'],
    /* 软删除可恢复；恢复后回到 active，需用户明确操作。 */
    deleted: ['active']
  };

  var LIMITS = { title: 80, description: 2000, researchGoal: 1000 };

  var QUESTION_STATUS = ['open', 'investigating', 'answered', 'dropped'];
  var HYPOTHESIS_STATUS = ['proposed', 'testing', 'supported', 'refuted'];

  var seq = 0;

  function nowIso() { return new Date().toISOString(); }

  /* 纯模型层不使用时间做唯一性保证，时间戳只用于可读性。 */
  function nextId() {
    seq += 1;
    return 'prj_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  function err(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }

  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function normalizeQuestions(list) {
    if (!isArray(list)) return [];
    return list.slice(0, 50).map(function (q, i) {
      if (typeof q === 'string') return { id: 'q' + (i + 1), text: trim(q), status: 'open' };
      q = isPlainObject(q) ? q : {};
      var status = QUESTION_STATUS.indexOf(q.status) >= 0 ? q.status : 'open';
      return { id: String(q.id || ('q' + (i + 1))), text: trim(q.text), status: status };
    });
  }

  function normalizeHypotheses(list) {
    if (!isArray(list)) return [];
    return list.slice(0, 30).map(function (h, i) {
      if (typeof h === 'string') return { id: 'h' + (i + 1), text: trim(h), status: 'proposed' };
      h = isPlainObject(h) ? h : {};
      var status = HYPOTHESIS_STATUS.indexOf(h.status) >= 0 ? h.status : 'proposed';
      return { id: String(h.id || ('h' + (i + 1))), text: trim(h.text), status: status };
    });
  }

  function make(input) {
    input = input || {};
    var now = nowIso();
    return {
      projectId: input.projectId || nextId(),
      profileId: input.profileId || null,
      title: trim(input.title),
      description: String(input.description == null ? '' : input.description),
      researchGoal: String(input.researchGoal == null ? '' : input.researchGoal),
      researchQuestions: normalizeQuestions(input.researchQuestions),
      hypotheses: normalizeHypotheses(input.hypotheses),
      status: 'active',
      createdAt: input.createdAt || now,
      updatedAt: input.updatedAt || now,
      archivedAt: null,
      deletedAt: null,
      version: 1,
      schemaVersion: 1,
      metadata: {
        tags: isArray(input.metadata && input.metadata.tags) ? input.metadata.tags.slice(0, 20) : [],
        lastThreadId: input.metadata && input.metadata.lastThreadId || null,
        lastTaskId: input.metadata && input.metadata.lastTaskId || null,
        memoryCount: 0,
        lastActivityAt: null
      }
    };
  }

  function validate(p) {
    if (!isPlainObject(p)) throw err('E_PROJECT_SHAPE', 'ResearchProject 必须是对象');
    if (typeof p.projectId !== 'string' || !p.projectId) throw err('E_PROJECT_ID', '$.projectId 必须是非空字符串');
    if (typeof p.profileId !== 'string' || !p.profileId) throw err('E_PROJECT_OWNER', '$.profileId 必须是非空字符串');
    if (typeof p.title !== 'string' || !p.title) throw err('E_PROJECT_TITLE', '$.title 不能为空');
    if (p.title.length > LIMITS.title) throw err('E_PROJECT_TITLE', '$.title 超过 ' + LIMITS.title + ' 字');
    if (typeof p.description !== 'string' || p.description.length > LIMITS.description) {
      throw err('E_PROJECT_DESC', '$.description 必须是字符串且不超过 ' + LIMITS.description + ' 字');
    }
    if (typeof p.researchGoal !== 'string' || p.researchGoal.length > LIMITS.researchGoal) {
      throw err('E_PROJECT_GOAL', '$.researchGoal 必须是字符串且不超过 ' + LIMITS.researchGoal + ' 字');
    }
    if (STATUS.indexOf(p.status) < 0) throw err('E_PROJECT_STATUS', '$.status 不在枚举范围');
    if (!isArray(p.researchQuestions) || !isArray(p.hypotheses)) {
      throw err('E_PROJECT_LISTS', '$.researchQuestions/$.hypotheses 必须是数组');
    }
    if (typeof p.version !== 'number' || !isFinite(p.version) || p.version < 1) {
      throw err('E_PROJECT_VERSION', '$.version 必须是 >=1 的数字');
    }
    if (p.schemaVersion !== 1) throw err('E_PROJECT_SCHEMA', '$.schemaVersion 必须为 1');
    if (typeof p.createdAt !== 'string' || !p.createdAt) throw err('E_PROJECT_TIME', '$.createdAt 必须是非空字符串');
    if (typeof p.updatedAt !== 'string' || !p.updatedAt) throw err('E_PROJECT_TIME', '$.updatedAt 必须是非空字符串');
    if (!isPlainObject(p.metadata)) throw err('E_PROJECT_META', '$.metadata 必须是对象');
    return true;
  }

  function canTransition(from, to) {
    return !!(LEGAL_TRANSITIONS[from] && LEGAL_TRANSITIONS[from].indexOf(to) >= 0);
  }

  function transition(p, to, ctx) {
    ctx = ctx || {};
    var from = p && p.status;
    if (!canTransition(from, to)) {
      var e = err('INVALID_TRANSITION', '非法课题状态转移 from=' + from + ' to=' + to);
      e.from = from; e.to = to;
      throw e;
    }
    if (to === 'deleted' && ctx.confirmTitle !== p.title) {
      throw err('CONFIRM_REQUIRED', '删除课题需要二次确认标题');
    }
    var now = nowIso();
    p.status = to;
    p.updatedAt = now;
    p.version = (p.version || 1) + 1;
    if (to === 'archived') p.archivedAt = now;
    if (to === 'deleted') p.deletedAt = now;
    if (to === 'active') { p.archivedAt = null; p.deletedAt = null; }
    if (to === 'paused') p.deletedAt = null;
    return p;
  }

  /* 编辑：只允许内容字段，不允许通过 touch 改状态。 */
  function touch(p, patch) {
    patch = patch || {};
    var editable = ['title', 'description', 'researchGoal', 'researchQuestions', 'hypotheses'];
    editable.forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(patch, k)) {
        if (k === 'researchQuestions') p[k] = normalizeQuestions(patch[k]);
        else if (k === 'hypotheses') p[k] = normalizeHypotheses(patch[k]);
        else if (k === 'title') p[k] = trim(patch[k]);
        else p[k] = String(patch[k] == null ? '' : patch[k]);
      }
    });
    if (isPlainObject(patch.metadata)) {
      Object.keys(patch.metadata).forEach(function (k) {
        if (k === 'tags' || k === 'lastThreadId' || k === 'lastTaskId' ||
          k === 'memoryCount' || k === 'lastActivityAt') {
          p.metadata[k] = patch.metadata[k];
        }
      });
    }
    validate(p);
    p.version = (p.version || 1) + 1;
    p.updatedAt = nowIso();
    return p;
  }

  function isWritable(p) {
    return !!p && (p.status === 'active' || p.status === 'paused');
  }

  root.AstroProject = {
    STATUS: STATUS,
    LEGAL_TRANSITIONS: LEGAL_TRANSITIONS,
    LIMITS: LIMITS,
    QUESTION_STATUS: QUESTION_STATUS,
    HYPOTHESIS_STATUS: HYPOTHESIS_STATUS,
    make: make,
    validate: validate,
    canTransition: canTransition,
    transition: transition,
    touch: touch,
    isWritable: isWritable,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
