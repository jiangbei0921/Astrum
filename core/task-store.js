/* ASTRUM · TaskState 持久化（C6 / P4 v2）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §9
 *       docs/architecture/ASTRUM-P0-IDENTITY-SECURITY-IMPLEMENTATION-PLAN.md §9/§10
 *       docs/P4/P4-02 ~ P4-04、P4-07、P4-08
 *
 * IndexedDB 优先，localStorage 回退，最后内存回退。
 * 只存可序列化 TaskState（Plan/Step/Event/Result），不存运行对象。
 * 读取时用 AstroTask.fromJSON 校验 schemaVersion 与不变量。
 *
 * P4：数据库 v2 新增 events / checkpoints / meta 三个 store。
 *   - tasks 记录增加 revision（并发/陈旧写检测）与 eventsUpToSeq（派生索引位点）。
 *   - 保存使用单事务写 tasks + 新增 events + checkpoints + meta。
 *   - events 只是 TaskState.events 的派生索引，权威仍在内嵌副本。
 *   - 不新增事件总线，不改变 TaskState 契约。
 *
 * 无 Profile 的 Node 环境保持旧行为（owner=null，不做归属过滤），
 * 以兼容既有测试；浏览器中 owner 始终来自 Profile.currentId()。
 */
(function (root) {
  'use strict';

  var BASE_DB = 'astrum.tasks.v1';
  var DB_VER = 2;
  var STORE = 'tasks';
  var EVENTS = 'events';
  var CHECKPOINTS = 'checkpoints';
  var META = 'meta';
  var BASE_LS = 'astrum.tasks.v1';
  var LS_MAX = 40;
  var CP_KEEP = 20;

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

  function storeError(code, message) {
    var e = new Error(message || code);
    e.code = code;
    return e;
  }

  function isQuota(err) {
    if (!err) return false;
    return err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22;
  }

  function mapTxError(err) {
    if (err && err.code && String(err.code).indexOf('_') >= 0) return err;
    if (isQuota(err)) return storeError('QUOTA_EXCEEDED', 'storage quota exceeded');
    return storeError('PERSIST_TX_FAILED', (err && err.message) || 'transaction failed');
  }

  /* ---------------- IndexedDB 基础 ---------------- */

  function ensureStores(db) {
    if (!db.objectStoreNames.contains(STORE)) {
      db.createObjectStore(STORE, { keyPath: 'id' });
    }
    if (!db.objectStoreNames.contains(EVENTS)) {
      db.createObjectStore(EVENTS, { keyPath: ['taskId', 'seq'] });
    }
    if (!db.objectStoreNames.contains(CHECKPOINTS)) {
      var cps = db.createObjectStore(CHECKPOINTS, { keyPath: 'checkpointId' });
      if (typeof cps.createIndex === 'function') {
        try { cps.createIndex('byTask', 'taskId'); } catch (e) { /* 索引失败不阻断 */ }
      }
    }
    if (!db.objectStoreNames.contains(META)) {
      db.createObjectStore(META, { keyPath: 'key' });
    }
  }

  function openMainDB(name) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(storeError('DB_UPGRADE_FAILED', 'no indexedDB')); return; }
      var req = null;
      try { req = root.indexedDB.open(name, DB_VER); } catch (e) {
        reject(storeError('DB_UPGRADE_FAILED', e && e.message));
        return;
      }
      var settled = false;
      req.onupgradeneeded = function () { ensureStores(req.result); };
      req.onblocked = function () {
        if (settled) return;
        settled = true;
        reject(storeError('DB_UPGRADE_FAILED', 'database upgrade blocked'));
      };
      req.onerror = function () {
        if (settled) return;
        settled = true;
        reject(storeError('DB_UPGRADE_FAILED', (req.error && req.error.message) || 'open failed'));
      };
      req.onsuccess = function () {
        if (settled) { try { req.result.close(); } catch (e) { /* ignore */ } return; }
        settled = true;
        var db = req.result;
        try {
          db.onversionchange = function () { try { db.close(); } catch (e) { /* ignore */ } };
        } catch (e2) { /* ignore */ }
        resolve(db);
      };
    });
  }

  /* 隔离库只用一个 store，保持 v1 行为。 */
  function openIDB(name, storeName) {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = null;
      try { req = root.indexedDB.open(name, 1); } catch (e) { reject(e); return; }
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
      var tx;
      try { tx = db.transaction([storeName], mode); } catch (e) { reject(e); return; }
      var os = tx.objectStore(storeName);
      var req = fn(os);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function txRun(db, storeNames, mode, work) {
    return new Promise(function (resolve, reject) {
      var tx;
      try { tx = db.transaction(storeNames, mode); } catch (e) { reject(mapTxError(e)); return; }
      var done = false;
      function fail(err) {
        if (done) return;
        done = true;
        reject(mapTxError(err || tx.error));
      }
      tx.oncomplete = function () {
        if (done) return;
        done = true;
        resolve();
      };
      tx.onerror = function () { /* 由 onabort 统一收口 */ };
      tx.onabort = function () { fail(tx.error); };
      try {
        work(tx);
      } catch (e) {
        try { tx.abort(); } catch (e2) { /* ignore */ }
        fail(e);
      }
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

  function maxSeqOf(events) {
    var max = 0;
    (events || []).forEach(function (e) { if (e && e.seq > max) max = e.seq; });
    return max;
  }

  function eventRecordOf(e, rec) {
    return {
      taskId: rec.id,
      seq: e.seq,
      eventId: rec.id + ':' + e.seq,
      ownerProfileId: rec.ownerProfileId,
      projectId: rec.projectId,
      at: e.at,
      type: e.type,
      stepId: e.stepId == null ? null : e.stepId,
      payload: e.payload || {}
    };
  }

  function checkpointRecordOf(cp, rec) {
    var out = {};
    Object.keys(cp || {}).forEach(function (k) { out[k] = cp[k]; });
    out.taskId = rec.id;
    out.ownerProfileId = rec.ownerProfileId;
    out.schemaVersion = 1;
    out.projectId = cp.projectId || rec.projectId;
    out.eventsUpToSeq = rec.eventsUpToSeq;
    out.summary = {
      phase: cp.phase,
      taskStatus: cp.taskStatus,
      completed: (cp.completedStepIds || []).length,
      pending: (cp.pendingStepIds || []).length
    };
    return out;
  }

  function eventFingerprint(e) {
    return JSON.stringify([e.seq, e.type, e.stepId == null ? null : e.stepId, e.at, e.payload || {}]);
  }

  function parseEventsOf(json) {
    try {
      var obj = typeof json === 'string' ? JSON.parse(json) : json;
      return obj && obj.events ? obj.events : [];
    } catch (e) { return []; }
  }

  function summarize(rec) {
    var T = root.AstroTask;
    var state = null, stale = false, lastError = null;
    try { state = T.fromJSON(rec.state); } catch (e) {
      state = null;
      stale = true;
      lastError = e && e.code ? e.code : (e && e.message) || 'STATE_CORRUPT';
    }
    var template = state && state.plan ? state.plan.template : '';
    var steps = state ? (state.steps || []) : [];
    return {
      id: rec.id,
      question: rec.question || '',
      phase: state ? state.phase : rec.phase || '',
      template: template,
      createdAt: rec.createdAt || '',
      updatedAt: rec.updatedAt || '',
      resumable: state ? isResumable(state) : false,
      viewOnly: !(state && isResumable(state)),
      paused: !!(state && state.pausedAt),
      waitingApproval: steps.some(function (s) { return s && s.status === 'waiting_approval'; }),
      recoveries: state && typeof state.recoveries === 'number' ? state.recoveries : 0,
      revision: rec.revision || 1,
      stale: stale,
      lastError: lastError
    };
  }

  function isResumable(state) {
    if (!state || state.phase !== 'EXECUTE') return false;
    return (state.steps || []).some(function (s) {
      return s.status === 'pending' || s.status === 'running' ||
        s.status === 'paused' || s.status === 'waiting_approval';
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
      var db = await openMainDB(BASE_DB);
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
    var health = { lastError: null, lastSaveAt: null, lastMigration: null };

    function init() {
      if (initPromise) return initPromise;
      initPromise = openMainDB(dbName).then(function (d) {
        db = d; backend = 'idb'; health.lastError = null; return backend;
      }).catch(function (err) {
        health.lastError = err && err.code ? err.code : 'DB_UPGRADE_FAILED';
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

    function makeRecord(state, prev) {
      var T = root.AstroTask;
      T.validate(state);
      var seq = Math.max(maxSeqOf(state.events), prev ? (prev.eventsUpToSeq || 0) : 0);
      return {
        id: state.id,
        question: state.question,
        phase: state.phase,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt || nowIso(),
        template: state.plan ? state.plan.template : '',
        ownerProfileId: owner,
        projectId: state.projectId || projectId,
        revision: prev ? (prev.revision || 1) + 1 : 1,
        eventsUpToSeq: seq,
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

    function txSave(rec, state, prevMax) {
      return txRun(db, [STORE, EVENTS, CHECKPOINTS, META], 'readwrite', function (tx) {
        tx.objectStore(STORE).put(rec);
        var evStore = tx.objectStore(EVENTS);
        (state.events || []).forEach(function (e) {
          if (e.seq > prevMax) evStore.put(eventRecordOf(e, rec));
        });
        var cpStore = tx.objectStore(CHECKPOINTS);
        (state.checkpoints || []).forEach(function (cp) {
          cpStore.put(checkpointRecordOf(cp, rec));
        });
        var meta = tx.objectStore(META);
        meta.put({ key: 'schemaVersion', value: DB_VER, updatedAt: nowIso() });
        meta.put({
          key: 'lastSave',
          value: { taskId: rec.id, revision: rec.revision, at: rec.updatedAt },
          updatedAt: nowIso()
        });
      });
    }

    async function save(state, opts) {
      opts = opts || {};
      await init();
      if (projectId && state.projectId && state.projectId !== projectId) {
        throw storeError('PROJECT_MISMATCH', 'task project mismatch');
      }
      var prev = await rawGet(state.id);
      if (enforce && prev && prev.ownerProfileId && prev.ownerProfileId !== owner) {
        throw storeError('PROFILE_MISMATCH', 'task owner mismatch');
      }
      if (opts.expectedRevision != null) {
        var curRev = prev ? (prev.revision || 1) : 0;
        if (curRev !== opts.expectedRevision) {
          throw storeError('STALE_WRITE', 'task revision changed');
        }
      }
      var rec = makeRecord(state, prev);
      if (enforce && prev && prev.updatedAt && rec.updatedAt &&
        String(prev.updatedAt) > String(rec.updatedAt)) {
        throw storeError('STALE_WRITE', 'stale task write');
      }
      /* 派生事件只追加：历史 seq 内容必须一致，否则拒绝覆盖权威记录。 */
      var prevMax = prev ? (prev.eventsUpToSeq || 0) : 0;
      if (prevMax > 0) {
        var oldEvents = parseEventsOf(prev.state);
        var oldBySeq = {};
        oldEvents.forEach(function (e) { oldBySeq[e.seq] = e; });
        (state.events || []).forEach(function (e) {
          if (e.seq > prevMax) return;
          var old = oldBySeq[e.seq];
          if (old && eventFingerprint(old) !== eventFingerprint(e)) {
            throw storeError('EVENT_CONFLICT', 'event seq ' + e.seq + ' changed');
          }
        });
      }
      if (backend === 'idb') {
        await txSave(rec, state, prevMax);
        /* P4-04：每个任务默认保留最近 20 个检查点，避免派生记录无限增长。 */
        await pruneCheckpoints(state.id, CP_KEEP).catch(function () { return 0; });
      } else if (backend === 'ls' || backend === 'memory') await rawPut(rec);
      health.lastSaveAt = rec.updatedAt;
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

    async function readAll(storeName) {
      if (backend !== 'idb') return [];
      try {
        return await idbReq(db, storeName, 'readonly', function (os) { return os.getAll(); });
      } catch (e) {
        health.lastError = e && e.name;
        return [];
      }
    }

    async function list(opts) {
      opts = opts || {};
      await init();
      var recs = [];
      if (backend === 'idb') recs = await idbReq(db, STORE, 'readonly', function (os) { return os.getAll(); });
      else if (backend === 'ls') {
        var map = lsRead(lsKey);
        recs = Object.keys(map).map(function (k) { return map[k]; });
      } else recs = Object.keys(memory).map(function (k) { return memory[k]; });
      if (enforce) {
        recs = recs.filter(function (r) { return r && r.ownerProfileId === owner; });
      }
      recs.sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      var limit = typeof opts.limit === 'number' ? opts.limit : 20;
      return recs.slice(0, limit).map(summarize);
    }

    async function listResumable(opts) {
      opts = opts || {};
      var limit = typeof opts.limit === 'number' ? opts.limit : 20;
      var all = await list({ limit: Math.max(limit * 4, 200) });
      return all.filter(function (x) { return x.resumable && !x.stale; }).slice(0, limit);
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

    async function loadCheckpoint(taskId, checkpointId) {
      await init();
      var rec = await rawGet(taskId);
      if (!owned(rec, taskId)) return null;
      var rows = [];
      if (backend === 'idb') {
        rows = (await readAll(CHECKPOINTS)).filter(function (r) { return r && r.taskId === taskId; });
      }
      if (!rows.length) {
        var st = null;
        try { st = root.AstroTask.fromJSON(rec.state); } catch (e) { st = null; }
        rows = ((st && st.checkpoints) || []).map(function (cp) { return checkpointRecordOf(cp, rec); });
      }
      if (checkpointId) {
        for (var i = 0; i < rows.length; i++) {
          if (rows[i].checkpointId === checkpointId) return rows[i];
        }
        return null;
      }
      rows.sort(function (a, b) {
        var av = typeof a.version === 'number' ? a.version : 0;
        var bv = typeof b.version === 'number' ? b.version : 0;
        if (av !== bv) return av - bv;
        return String(a.at || '').localeCompare(String(b.at || ''));
      });
      return rows.length ? rows[rows.length - 1] : null;
    }

    async function loadLatestCheckpoint(taskId) {
      return loadCheckpoint(taskId, null);
    }

    async function listEvents(taskId, opts) {
      opts = opts || {};
      await init();
      var rec = await rawGet(taskId);
      if (!owned(rec, taskId)) return [];
      var st = null;
      try { st = root.AstroTask.fromJSON(rec.state); } catch (e) { return []; }
      var embedded = (st.events || []).map(function (e) { return eventRecordOf(e, rec); });
      if (backend === 'idb') {
        var rows = (await readAll(EVENTS)).filter(function (r) { return r && r.taskId === taskId; });
        if (rows.length < embedded.length) {
          var have = {};
          rows.forEach(function (r) { have[r.seq] = 1; });
          var missing = embedded.filter(function (e) { return !have[e.seq]; });
          if (missing.length) {
            var copy = missing;
            await txRun(db, [EVENTS], 'readwrite', function (tx) {
              var os = tx.objectStore(EVENTS);
              copy.forEach(function (e) { os.put(e); });
            }).catch(function () { /* 重建失败不阻断读取 */ });
          }
        }
      }
      embedded.sort(function (a, b) { return a.seq - b.seq; });
      var after = typeof opts.afterSeq === 'number' ? opts.afterSeq : 0;
      embedded = embedded.filter(function (e) { return e.seq > after; });
      if (typeof opts.limit === 'number') embedded = embedded.slice(0, opts.limit);
      return embedded;
    }

    async function pruneCheckpoints(taskId, keep) {
      await init();
      var rec = await rawGet(taskId);
      if (!owned(rec, taskId)) return 0;
      var keepN = typeof keep === 'number' && keep > 0 ? keep : CP_KEEP;
      if (backend !== 'idb') return 0;
      var rows = (await readAll(CHECKPOINTS)).filter(function (r) { return r && r.taskId === taskId; });
      if (rows.length <= keepN) return 0;
      rows.sort(function (a, b) {
        var av = typeof a.version === 'number' ? a.version : 0;
        var bv = typeof b.version === 'number' ? b.version : 0;
        if (av !== bv) return av - bv;
        return String(a.at || '').localeCompare(String(b.at || ''));
      });
      var drop = rows.slice(0, rows.length - keepN);
      await txRun(db, [CHECKPOINTS], 'readwrite', function (tx) {
        var os = tx.objectStore(CHECKPOINTS);
        drop.forEach(function (r) { os.delete(r.checkpointId); });
      });
      return drop.length;
    }

    function txRemove(id) {
      return txRun(db, [STORE, EVENTS, CHECKPOINTS], 'readwrite', function (tx) {
        tx.objectStore(STORE).delete(id);
        var evStore = tx.objectStore(EVENTS);
        var evReq = evStore.getAll();
        evReq.onsuccess = function () {
          (evReq.result || []).forEach(function (r) {
            if (r && r.taskId === id) evStore.delete([r.taskId, r.seq]);
          });
        };
        var cpStore = tx.objectStore(CHECKPOINTS);
        var cpReq = cpStore.getAll();
        cpReq.onsuccess = function () {
          (cpReq.result || []).forEach(function (r) {
            if (r && r.taskId === id) cpStore.delete(r.checkpointId);
          });
        };
      });
    }

    async function remove(id) {
      await init();
      var rec = await rawGet(id);
      if (!owned(rec, id)) return false;
      if (backend === 'idb') await txRemove(id);
      else if (backend === 'ls') { var map = lsRead(lsKey); delete map[id]; lsWrite(lsKey, map); }
      else delete memory[id];
      return true;
    }

    async function clear() {
      await init();
      if (backend === 'idb') {
        await txRun(db, [STORE, EVENTS, CHECKPOINTS, META], 'readwrite', function (tx) {
          tx.objectStore(STORE).clear();
          tx.objectStore(EVENTS).clear();
          tx.objectStore(CHECKPOINTS).clear();
          tx.objectStore(META).clear();
        });
      } else if (backend === 'ls') lsWrite(lsKey, {});
      else memory = {};
      return true;
    }

    function getHealth() {
      return {
        backend: backend,
        dbVersion: backend === 'idb' ? DB_VER : null,
        lastError: health.lastError,
        lastSaveAt: health.lastSaveAt
      };
    }

    return {
      init: init,
      save: save,
      get: get,
      getRecord: getRecord,
      list: list,
      listResumable: listResumable,
      listByProject: listByProject,
      loadLatestCheckpoint: loadLatestCheckpoint,
      loadCheckpoint: loadCheckpoint,
      listEvents: listEvents,
      pruneCheckpoints: pruneCheckpoints,
      remove: remove,
      clear: clear,
      summarize: summarize,
      isResumable: isResumable,
      getHealth: getHealth,
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
    DB_VER: DB_VER,
    version: '2.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
