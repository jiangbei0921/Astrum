/* ASTRUM · TaskState 持久化（C6）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §9
 *       docs/ASTRUM-P0-IDENTITY-SECURITY-IMPLEMENTATION-PLAN.md §9/§10
 *
 * IndexedDB 优先，localStorage 回退，最后内存回退。
 * 只存可序列化 TaskState（Plan/Step/Event/Result），不存运行对象。
 * 读取时用 AstroTask.fromJSON 校验 schemaVersion 与不变量。
 *
 * P0：按 Profile 命名空间分库；记录附带 ownerProfileId/projectId。
 * 无 Profile 的 Node 环境保持旧行为（owner=null，不做归属过滤），
 * 以兼容既有 336 项测试；浏览器中 owner 始终来自 Profile.currentId()，
 * 调用方传入的 ownerProfileId 会被忽略。
 */
(function (root) {
  'use strict';

  var BASE_DB = 'astrum.tasks.v1';
  var DB_VER = 1;
  var STORE = 'tasks';
  var BASE_LS = 'astrum.tasks.v1';
  var LS_MAX = 40;

  var QUARANTINE_DB = 'astrum.tasks.quarantine.v1';
  var QUARANTINE_STORE = 'tasks';
  var MIGRATION_KEY = 'astrum.tasks.migration.v1';
  var MIGRATION_VERSION = 1;

  function nowIso() { return new Date().toISOString(); }

  function ownerOf(options) {
    if (root.Profile && root.Profile.currentId) return root.Profile.currentId();
    return (options && options.ownerProfileId) ? String(options.ownerProfileId) : null;
  }

  function nsName(base, owner) {
    if (!owner) return base;
    return owner === 'default' ? base : ('p.' + owner + '.' + base);
  }

  function openIDB(name, storeName) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = null;
      try { req = root.indexedDB.open(name, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      setTimeout(function () { reject(new Error('idb open timeout')); }, 30000);
    });
  }

  function idbReq(db, storeName, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction([storeName], mode);
      var os = tx.objectStore(storeName);
      var req = fn(os);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function lsRead(key) {
    try { return JSON.parse(root.localStorage.getItem(key) || '{}') || {}; } catch (e) { return {}; }
  }

  function lsWrite(key, map) {
    var keys = Object.keys(map);
    if (keys.length > LS_MAX) {
      keys.sort(function (a, b) { return (map[a].updatedAt || 0) - (map[b].updatedAt || 0); });
      keys.slice(0, keys.length - LS_MAX).forEach(function (k) { delete map[k]; });
    }
    root.localStorage.setItem(key, JSON.stringify(map));
  }

  function summarize(rec) {
    var T = root.AstroTask;
    var state = null;
    try { state = T.fromJSON(rec.state); } catch (e) { state = null; }
    var template = state && state.plan ? state.plan.template : '';
    return {
      id: rec.id,
      question: rec.question || '',
      phase: state ? state.phase : rec.phase || '',
      template: template,
      createdAt: rec.createdAt || '',
      updatedAt: rec.updatedAt || '',
      resumable: state ? isResumable(state) : false,
      viewOnly: !(state && isResumable(state))
    };
  }

  function isResumable(state) {
    if (!state || state.phase !== 'EXECUTE') return false;
    return (state.steps || []).some(function (s) {
      return s.status === 'pending' || s.status === 'running';
    });
  }

  function deny(reason, action, resourceId) {
    if (!root.AuditLog) return;
    try {
      root.AuditLog.record({
        action: action || 'read',
        resourceType: 'task',
        resourceId: resourceId || '',
        decision: 'deny',
        reason: reason
      });
    } catch (e) { /* ignore */ }
  }

  function storeError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function readMigrationFlag() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(MIGRATION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function writeMigrationFlag(v) {
    try { root.localStorage.setItem(MIGRATION_KEY, JSON.stringify(v)); } catch (e) { /* ignore */ }
  }

  /* ---------------- 历史任务隔离（只复制，不删除） ---------------- */
  async function collectLegacy() {
    var out = [];
    var seen = {};
    function add(rec, source) {
      if (!rec || !rec.id || seen[rec.id]) return;
      /* 已带 owner 的记录属于新格式，不是历史任务。 */
      if (rec.ownerProfileId) return;
      seen[rec.id] = 1;
      out.push({ rec: rec, source: source });
    }
    try {
      var db = await openIDB(BASE_DB, STORE);
      try {
        var recs = await idbReq(db, STORE, 'readonly', function (os) { return os.getAll(); });
        (recs || []).forEach(function (r) { add(r, 'idb:' + BASE_DB); });
      } catch (e) { /* store 可能不存在 */ }
      try { db.close(); } catch (e2) { /* ignore */ }
    } catch (e) { /* 无旧库 */ }
    try {
      var map = lsRead(BASE_LS);
      Object.keys(map).forEach(function (k) { add(map[k], 'ls:' + BASE_LS); });
    } catch (e) { /* ignore */ }
    return out;
  }

  async function migrateLegacy(options) {
    options = options || {};
    var force = options.force === true;
    var flag = readMigrationFlag();
    if (!force && flag && flag.version === MIGRATION_VERSION && flag.done) return flag;

    var legacy = await collectLegacy();
    var stats = {
      version: MIGRATION_VERSION,
      scannedAt: nowIso(),
      total: legacy.length,
      quarantined: 0,
      failed: 0,
      done: true
    };

    var db = null;
    try { db = await openIDB(QUARANTINE_DB, QUARANTINE_STORE); } catch (e) { db = null; }
    var lsMap = null;
    if (!db) {
      /* 隐私模式/file:// 下 IndexedDB 不可用：退化为独立 localStorage 键。 */
      try { lsMap = lsRead(QUARANTINE_DB); } catch (e) { lsMap = {}; }
    }

    for (var i = 0; i < legacy.length; i++) {
      var item = legacy[i];
      var rec = item.rec;
      try {
        var q = {
          id: 'legacy:' + rec.id,
          legacyId: rec.id,
          question: rec.question || '',
          phase: rec.phase || '',
          createdAt: rec.createdAt || '',
          updatedAt: rec.updatedAt || '',
          state: rec.state,
          migrationState: 'pending_migration',
          source: item.source,
          quarantinedAt: nowIso(),
          candidateProfileId: null
        };
        if (db) await idbReq(db, QUARANTINE_STORE, 'readwrite', function (os) { return os.put(q); });
        else lsMap[q.id] = q;
        stats.quarantined += 1;
      } catch (e) { stats.failed += 1; }
    }
    try { if (db) db.close(); } catch (e2) { /* ignore */ }
    if (!db) {
      try { root.localStorage.setItem(QUARANTINE_DB, JSON.stringify(lsMap)); } catch (e3) {
        stats.done = false;
      }
    }
    if (stats.failed > 0) stats.done = false;
    writeMigrationFlag(stats);
    return stats;
  }

  function create(options) {
    options = options || {};
    var owner = ownerOf(options);
    var enforce = !!owner;
    var dbName = nsName(BASE_DB, owner);
    var lsKey = nsName(BASE_LS, owner);
    var projectId = options.projectId || null;

    var db = null;
    var backend = 'memory';
    var memory = {};
    var initPromise = null;

    function init() {
      if (initPromise) return initPromise;
      initPromise = openIDB(dbName, STORE).then(function (d) {
        db = d; backend = 'idb'; return backend;
      }).catch(function () {
        try {
          root.localStorage.setItem('astrum.tasks.probe', '1');
          root.localStorage.removeItem('astrum.tasks.probe');
          backend = 'ls';
          return backend;
        } catch (e) {
          backend = 'memory';
          return backend;
        }
      });
      return initPromise;
    }

    function makeRecord(state) {
      var T = root.AstroTask;
      T.validate(state);
      return {
        id: state.id,
        question: state.question,
        phase: state.phase,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt || nowIso(),
        template: state.plan ? state.plan.template : '',
        ownerProfileId: owner,
        projectId: state.projectId || projectId,
        state: T.toJSON(state)
      };
    }

    function rawGet(id) {
      if (backend === 'idb') return idbReq(db, STORE, 'readonly', function (os) { return os.get(id); });
      if (backend === 'ls') return Promise.resolve(lsRead(lsKey)[id] || null);
      return Promise.resolve(memory[id] || null);
    }

    function rawPut(rec) {
      if (backend === 'idb') return idbReq(db, STORE, 'readwrite', function (os) { return os.put(rec); });
      if (backend === 'ls') {
        var map = lsRead(lsKey);
        map[rec.id] = rec;
        lsWrite(lsKey, map);
        return Promise.resolve(rec.id);
      }
      memory[rec.id] = rec;
      return Promise.resolve(rec.id);
    }

    function owned(rec, id) {
      if (!rec) return false;
      if (!enforce) return true;
      if (!rec.ownerProfileId || rec.ownerProfileId !== owner) {
        deny('PROFILE_MISMATCH', 'read', id);
        return false;
      }
      return true;
    }

    async function save(state) {
      await init();
      if (projectId && state.projectId && state.projectId !== projectId) {
        throw storeError('PROJECT_MISMATCH', 'task project mismatch');
      }
      var rec = makeRecord(state);
      if (enforce) {
        var prev = await rawGet(rec.id);
        if (prev && prev.ownerProfileId && prev.ownerProfileId !== owner) {
          throw storeError('PROFILE_MISMATCH', 'task owner mismatch');
        }
        if (prev && prev.updatedAt && rec.updatedAt &&
          String(prev.updatedAt) > String(rec.updatedAt)) {
          throw storeError('POLICY_DENIED', 'stale task write');
        }
      }
      await rawPut(rec);
      return rec.id;
    }

    async function get(id) {
      await init();
      var rec = await rawGet(id);
      if (!owned(rec, id)) return null;
      try { return root.AstroTask.fromJSON(rec.state); } catch (e) { return null; }
    }

    async function getRecord(id) {
      await init();
      var rec = await rawGet(id);
      if (!owned(rec, id)) return null;
      return rec;
    }

    async function list(opts) {
      opts = opts || {};
      await init();
      var recs = [];
      if (backend === 'idb') recs = await idbReq(db, STORE, 'readonly', function (os) { return os.getAll(); });
      else if (backend === 'ls') recs = Object.keys(lsRead(lsKey)).map(function (k) { return lsRead(lsKey)[k]; });
      else recs = Object.keys(memory).map(function (k) { return memory[k]; });
      if (enforce) {
        recs = recs.filter(function (r) { return r && r.ownerProfileId === owner; });
      }
      recs.sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      var limit = typeof opts.limit === 'number' ? opts.limit : 20;
      return recs.slice(0, limit).map(summarize);
    }

    async function listByProject(pid, opts) {
      opts = opts || {};
      await init();
      var recs = [];
      if (backend === 'idb') recs = await idbReq(db, STORE, 'readonly', function (os) { return os.getAll(); });
      else if (backend === 'ls') {
        var map = lsRead(lsKey);
        recs = Object.keys(map).map(function (k) { return map[k]; });
      } else recs = Object.keys(memory).map(function (k) { return memory[k]; });
      recs = recs.filter(function (r) {
        if (!r || r.projectId !== pid) return false;
        if (enforce && r.ownerProfileId !== owner) return false;
        return true;
      });
      recs.sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      var limit = typeof opts.limit === 'number' ? opts.limit : 50;
      recs = recs.slice(0, limit);
      if (opts.raw) {
        return recs.map(function (r) {
          return { id: r.id, projectId: r.projectId, ownerProfileId: r.ownerProfileId, state: r.state };
        });
      }
      return recs.map(function (r) {
        var s = summarize(r);
        s.projectId = r.projectId;
        s.ownerProfileId = r.ownerProfileId;
        return s;
      });
    }

    async function remove(id) {
      await init();
      var rec = await rawGet(id);
      if (!owned(rec, id)) return false;
      if (backend === 'idb') await idbReq(db, STORE, 'readwrite', function (os) { return os.delete(id); });
      else if (backend === 'ls') { var map = lsRead(lsKey); delete map[id]; lsWrite(lsKey, map); }
      else delete memory[id];
      return true;
    }

    async function clear() {
      await init();
      if (backend === 'idb') await idbReq(db, STORE, 'readwrite', function (os) { return os.clear(); });
      else if (backend === 'ls') lsWrite(lsKey, {});
      else memory = {};
      return true;
    }

    return {
      init: init,
      save: save,
      get: get,
      getRecord: getRecord,
      list: list,
      listByProject: listByProject,
      remove: remove,
      clear: clear,
      summarize: summarize,
      isResumable: isResumable,
      backend: function () { return backend; },
      ownerProfileId: function () { return owner; },
      dbName: function () { return dbName; }
    };
  }

  root.AstroTaskStore = {
    create: create,
    isResumable: isResumable,
    summarize: summarize,
    migrateLegacy: migrateLegacy,
    DB_NAME: BASE_DB,
    LS_KEY: BASE_LS,
    QUARANTINE_DB: QUARANTINE_DB,
    MIGRATION_KEY: MIGRATION_KEY,
    version: '1.1.0'
  };
})(typeof window !== 'undefined' ? window : global);
