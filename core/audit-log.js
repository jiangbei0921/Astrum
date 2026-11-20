/* ASTRUM · P0 权限审计日志
 *
 * 本地、按档案隔离的环形日志。用于追溯 allow/deny 与任务生命周期。
 * 明确边界：这是浏览器本地日志，不具备服务器级不可篡改性；
 * 任何写入失败都不得影响业务决策。
 */
(function (root) {
  'use strict';

  var DB_BASE = 'astrum.audit.v1';
  var STORE = 'events';
  var MAX = 1000;
  var SENSITIVE = /api[-_]?key|token|authorization|cookie|secret|password/i;

  var db = null;
  var backend = 'none';
  var initPromise = null;
  var memory = [];

  function dbName() {
    return (root.Profile && root.Profile.ns) ? root.Profile.ns(DB_BASE) : DB_BASE;
  }

  function init() {
    if (initPromise) return initPromise;
    initPromise = new Promise(function (resolve) {
      if (!root.indexedDB) { backend = 'memory'; resolve(backend); return; }
      var req;
      try { req = root.indexedDB.open(dbName(), 1); } catch (e) { backend = 'memory'; resolve(backend); return; }
      req.onupgradeneeded = function () {
        var d = req.result;
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = function () { db = req.result; backend = 'idb'; resolve(backend); };
      req.onerror = function () { backend = 'memory'; resolve(backend); };
      setTimeout(function () { if (!db && backend === 'none') { backend = 'memory'; resolve(backend); } }, 3000);
    });
    return initPromise;
  }

  function uid() {
    return 'aud_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function redact(value, depth) {
    if (depth > 3 || value == null) return value;
    if (typeof value === 'string') return value.slice(0, 200);
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.slice(0, 20).map(function (v) { return redact(v, depth + 1); });
    var out = {};
    Object.keys(value).forEach(function (k) {
      if (SENSITIVE.test(k)) return;
      out[k] = redact(value[k], depth + 1);
    });
    return out;
  }

  function normalize(event) {
    event = event || {};
    var pc = root.ProfileContext && root.ProfileContext.current ? root.ProfileContext.current() : null;
    return {
      id: uid(),
      profileId: event.profileId || (pc && pc.profileId) || '',
      projectId: event.projectId || null,
      principalType: event.principalType || '',
      principalId: String(event.principalId || '').slice(0, 80),
      action: event.action || '',
      resourceType: event.resourceType || '',
      resourceId: String(event.resourceId || '').slice(0, 120),
      decision: event.decision === 'allow' ? 'allow' : 'deny',
      reason: String(event.reason || '').slice(0, 60),
      policyVersion: event.policyVersion || '1',
      timestamp: new Date().toISOString(),
      detail: redact(event.detail || null, 0)
    };
  }

  function trimMemory() {
    if (memory.length > MAX) memory = memory.slice(memory.length - MAX);
  }

  function record(event) {
    var rec;
    try { rec = normalize(event); } catch (e) { return null; }
    try {
      init().then(function () {
        if (backend === 'idb' && db) {
          try {
            var tx = db.transaction([STORE], 'readwrite');
            tx.objectStore(STORE).put(rec);
          } catch (e) { memory.push(rec); trimMemory(); }
        } else {
          memory.push(rec);
          trimMemory();
        }
      });
    } catch (e) { /* 审计失败不得影响业务 */ }
    return rec;
  }

  function list(opts) {
    opts = opts || {};
    var limit = typeof opts.limit === 'number' ? opts.limit : 100;
    return init().then(function () {
      if (backend === 'idb' && db) {
        return new Promise(function (resolve) {
          try {
            var req = db.transaction([STORE], 'readonly').objectStore(STORE).getAll();
            req.onsuccess = function () {
              var arr = (req.result || []).sort(function (a, b) {
                return String(b.timestamp).localeCompare(String(a.timestamp));
              });
              resolve(arr.slice(0, limit));
            };
            req.onerror = function () { resolve(memory.slice(-limit)); };
          } catch (e) { resolve(memory.slice(-limit)); }
        });
      }
      return memory.slice(-limit);
    });
  }

  function clear() {
    memory = [];
    return init().then(function () {
      if (backend === 'idb' && db) {
        try {
          var tx = db.transaction([STORE], 'readwrite');
          tx.objectStore(STORE).clear();
        } catch (e) { /* ignore */ }
      }
      return true;
    });
  }

  root.AuditLog = {
    record: record,
    list: list,
    clear: clear,
    MAX: MAX,
    backend: function () { return backend; },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
