/* ASTRUM · TaskState 持久化（C6）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §9
 *
 * IndexedDB 优先，localStorage 回退，最后内存回退。
 * 只存可序列化 TaskState（Plan/Step/Event/Result），不存运行对象。
 * 读取时用 AstroTask.fromJSON 校验 schemaVersion 与不变量。
 */
(function (root) {
  'use strict';

  var DB_NAME = 'astrum.tasks.v1';
  var DB_VER = 1;
  var STORE = 'tasks';
  var LS_KEY = 'astrum.tasks.v1';
  var LS_MAX = 40;

  function nowIso() { return new Date().toISOString(); }

  function openIDB() {
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req = null;
      try { req = root.indexedDB.open(DB_NAME, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      setTimeout(function () { reject(new Error('idb open timeout')); }, 30000);
    });
  }

  function idbReq(db, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = db.transaction([STORE], mode);
      var os = tx.objectStore(STORE);
      var req = fn(os);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function lsRead() {
    try { return JSON.parse(root.localStorage.getItem(LS_KEY) || '{}') || {}; } catch (e) { return {}; }
  }

  function lsWrite(map) {
    var keys = Object.keys(map);
    if (keys.length > LS_MAX) {
      keys.sort(function (a, b) { return (map[a].updatedAt || 0) - (map[b].updatedAt || 0); });
      keys.slice(0, keys.length - LS_MAX).forEach(function (k) { delete map[k]; });
    }
    root.localStorage.setItem(LS_KEY, JSON.stringify(map));
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

  function create(options) {
    options = options || {};
    var db = null;
    var backend = 'memory';
    var memory = {};
    var initPromise = null;

    function init() {
      if (initPromise) return initPromise;
      initPromise = openIDB().then(function (d) {
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
        state: T.toJSON(state)
      };
    }

    async function save(state) {
      await init();
      var rec = makeRecord(state);
      if (backend === 'idb') {
        await idbReq(db, 'readwrite', function (os) { return os.put(rec); });
        return rec.id;
      }
      if (backend === 'ls') {
        var map = lsRead();
        map[rec.id] = rec;
        lsWrite(map);
        return rec.id;
      }
      memory[rec.id] = rec;
      return rec.id;
    }

    async function get(id) {
      await init();
      var rec = null;
      if (backend === 'idb') rec = await idbReq(db, 'readonly', function (os) { return os.get(id); });
      else if (backend === 'ls') rec = lsRead()[id] || null;
      else rec = memory[id] || null;
      if (!rec) return null;
      try { return root.AstroTask.fromJSON(rec.state); } catch (e) { return null; }
    }

    async function list(opts) {
      opts = opts || {};
      await init();
      var recs = [];
      if (backend === 'idb') recs = await idbReq(db, 'readonly', function (os) { return os.getAll(); });
      else if (backend === 'ls') recs = Object.keys(lsRead()).map(function (k) { return lsRead()[k]; });
      else recs = Object.keys(memory).map(function (k) { return memory[k]; });
      recs.sort(function (a, b) {
        return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
      });
      var limit = typeof opts.limit === 'number' ? opts.limit : 20;
      return recs.slice(0, limit).map(summarize);
    }

    async function remove(id) {
      await init();
      if (backend === 'idb') await idbReq(db, 'readwrite', function (os) { return os.delete(id); });
      else if (backend === 'ls') { var map = lsRead(); delete map[id]; lsWrite(map); }
      else delete memory[id];
      return true;
    }

    async function clear() {
      await init();
      if (backend === 'idb') await idbReq(db, 'readwrite', function (os) { return os.clear(); });
      else if (backend === 'ls') lsWrite({});
      else memory = {};
      return true;
    }

    return {
      init: init,
      save: save,
      get: get,
      list: list,
      remove: remove,
      clear: clear,
      summarize: summarize,
      isResumable: isResumable,
      backend: function () { return backend; }
    };
  }

  root.AstroTaskStore = {
    create: create,
    isResumable: isResumable,
    summarize: summarize,
    DB_NAME: DB_NAME,
    LS_KEY: LS_KEY,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
