/* ASTRUM · 持久化存储层
 *
 * 职责：只负责「存什么、怎么存、存不下怎么办」，不关心业务语义。
 *
 * 为什么双后端：
 *   IndexedDB 在 file:// 与某些隐私模式下可能不可用，而本项目既要能双击打开、
 *   又要在 file:// 下跑测试。所以优先 IndexedDB（容量大、异步、不阻塞），
 *   失败则自动降级 localStorage（容量小但到处都能用），并对容量做淘汰。
 *
 * 数据结构（两个后端一致）：
 *   threads  : { id, title, createdAt, updatedAt, schema, count }
 *   messages : { id, threadId, role, at, text, ans? }
 *
 * 写入后回读校验：配额溢出时 IndexedDB 可能静默失败，
 * 表现为「聊着聊着历史没了」——这比不存更糟，所以必须验。
 */
(function (root) {
  'use strict';

  /* 每个档案一个独立数据库：隔离由「连哪个库」保证，不靠查询过滤 */
  var DB_NAME = (typeof window !== 'undefined' && window.Profile) ? window.Profile.ns('astrum') : 'astrum';
  var DB_VER = 1;
  var LS_KEY = (typeof window !== 'undefined' && window.Profile) ? window.Profile.ns('astrum.thread.v1') : 'astrum.thread.v1';
  var LS_LIMIT = 2 * 1024 * 1024;   /* localStorage 兜底时的自限容量 */

  var backend = 'none';
  var db = null;
  var ls = null;                    /* { threads: [], messages: [] } */
  var seq = 1;
  var initPromise = null;           /* 单例：并发调用必须共享同一次初始化 */

  function nowId() { return Date.now().toString(36) + '-' + (seq++).toString(36); }

  /* ---------- IndexedDB 后端 ---------- */
  function openIDB(name) {
    var nm = name || DB_NAME;
    return new Promise(function (resolve, reject) {
      if (!root.indexedDB) { reject(new Error('no indexedDB')); return; }
      var req;
      try { req = root.indexedDB.open(nm, DB_VER); } catch (e) { reject(e); return; }
      req.onupgradeneeded = function (ev) {
        var d = ev.target.result;
        if (!d.objectStoreNames.contains('threads')) {
          var t = d.createObjectStore('threads', { keyPath: 'id' });
          t.createIndex('updatedAt', 'updatedAt');
        }
        if (!d.objectStoreNames.contains('messages')) {
          var m = d.createObjectStore('messages', { keyPath: 'id' });
          m.createIndex('threadId', 'threadId');
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error || new Error('idb open failed')); };
      /* 某些环境会长时间不回调，5 秒后放弃并降级 */
      /* 30s：虚拟时间下短超时会瞬间触发，把正常打开误判为失败并降级 */
      setTimeout(function () { reject(new Error('idb open timeout')); }, 30000);
    });
  }

  function idbTx(stores, mode) {
    return db.transaction(stores, mode);
  }

  function idbReq(store, mode, fn) {
    return new Promise(function (resolve, reject) {
      var tx = idbTx([store], mode);
      var os = tx.objectStore(store);
      var req = fn(os);
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  /* ---------- localStorage 后端 ---------- */
  function lsLoad() {
    try {
      var raw = root.localStorage.getItem(LS_KEY);
      ls = raw ? JSON.parse(raw) : { threads: [], messages: [] };
      if (!ls.threads) ls.threads = [];
      if (!ls.messages) ls.messages = [];
    } catch (e) {
      ls = { threads: [], messages: [] };
    }
  }

  function lsSave() {
    var raw = JSON.stringify(ls);
    if (raw.length > LS_LIMIT) {
      /* 超限时按时间淘汰最旧的消息，直到降回阈值下 */
      ls.messages.sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      while (JSON.stringify(ls).length > LS_LIMIT * 0.8 && ls.messages.length) {
        ls.messages.shift();
      }
    }
    try {
      root.localStorage.setItem(LS_KEY, JSON.stringify(ls));
      return true;
    } catch (e) {
      return false;   /* QuotaExceededError */
    }
  }

  /* ---------- 统一接口 ---------- */
  function init() {
    if (backend !== 'none') return Promise.resolve(backend);
    /* 必须单例。boot 的 restoreHistory 与首次 ask 会并发调用 init，
     * 若各自 open 一次，可能出现「一个超时降级为 ls、另一个随后成功设为 idb」，
     * 导致 backend 与 db 不一致（db 为 null 却以为在走 idb），后续调用永久挂起。
     * 这正是 store-test 偶发「无结果」的根因。 */
    if (initPromise) return initPromise;
    initPromise = openIDB().then(function (d) {
      db = d;
      backend = 'idb';
      return backend;
    }).catch(function () {
      try {
        lsLoad();
        root.localStorage.setItem('astrum.probe', '1');
        root.localStorage.removeItem('astrum.probe');
        backend = 'ls';
      } catch (e) {
        backend = 'none';
      }
      return backend;
    });
    return initPromise;
  }

  function putThread(t) {
    if (backend === 'idb') return idbReq('threads', 'readwrite', function (os) { return os.put(t); });
    if (backend === 'ls') {
      var i = ls.threads.findIndex(function (x) { return x.id === t.id; });
      if (i >= 0) ls.threads[i] = t; else ls.threads.push(t);
      lsSave();
      return Promise.resolve(t.id);
    }
    return Promise.reject(new Error('store not ready'));
  }

  function getThread(id) {
    if (backend === 'idb') return idbReq('threads', 'readonly', function (os) { return os.get(id); });
    if (backend === 'ls') return Promise.resolve(ls.threads.filter(function (x) { return x.id === id; })[0] || null);
    return Promise.resolve(null);
  }

  function listThreads() {
    if (backend === 'idb') {
      return idbReq('threads', 'readonly', function (os) { return os.getAll(); })
        .then(function (arr) { return (arr || []).sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }); });
    }
    if (backend === 'ls') {
      return Promise.resolve(ls.threads.slice().sort(function (a, b) { return (b.updatedAt || 0) - (a.updatedAt || 0); }));
    }
    return Promise.resolve([]);
  }

  function appendMessage(msg) {
    var m = {
      id: msg.id || nowId(),
      threadId: msg.threadId,
      role: msg.role,
      at: msg.at || Date.now(),
      text: msg.text || '',
      ans: msg.ans || null,
      atts: msg.atts || null
    };
    if (backend === 'idb') {
      return idbReq('messages', 'readwrite', function (os) { return os.put(m); })
        .then(function (id) {
          /* 回读校验：配额问题会让写入静默失败 */
          return idbReq('messages', 'readonly', function (os) { return os.get(id); })
            .then(function (back) {
              if (!back) throw new Error('write verify failed');
              return m;
            });
        });
    }
    if (backend === 'ls') {
      ls.messages.push(m);
      var ok = lsSave();
      if (!ok) throw new Error('localStorage quota exceeded');
      return Promise.resolve(m);
    }
    return Promise.reject(new Error('store not ready'));
  }

  function listMessages(threadId) {
    if (backend === 'idb') {
      return idbReq('messages', 'readonly', function (os) {
        return os.index('threadId').getAll(threadId);
      }).then(function (arr) {
        return (arr || []).sort(function (a, b) { return (a.at || 0) - (b.at || 0); });
      });
    }
    if (backend === 'ls') {
      return Promise.resolve(ls.messages.filter(function (m) { return m.threadId === threadId; })
        .sort(function (a, b) { return (a.at || 0) - (b.at || 0); }));
    }
    return Promise.resolve([]);
  }

  function removeMessage(id) {
    if (backend === 'idb') return idbReq('messages', 'readwrite', function (os) { return os.delete(id); });
    if (backend === 'ls') {
      ls.messages = ls.messages.filter(function (m) { return m.id !== id; });
      lsSave();
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function removeThread(id) {
    if (backend === 'idb') {
      return idbReq('messages', 'readonly', function (os) { return os.index('threadId').getAllKeys(id); })
        .then(function (keys) {
          return Promise.all((keys || []).map(function (k) {
            return idbReq('messages', 'readwrite', function (os) { return os.delete(k); });
          }));
        })
        .then(function () { return idbReq('threads', 'readwrite', function (os) { return os.delete(id); }); });
    }
    if (backend === 'ls') {
      ls.messages = ls.messages.filter(function (m) { return m.threadId !== id; });
      ls.threads = ls.threads.filter(function (t) { return t.id !== id; });
      lsSave();
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  function clearAll() {
    if (backend === 'idb') {
      return Promise.all([
        idbReq('messages', 'readwrite', function (os) { return os.clear(); }),
        idbReq('threads', 'readwrite', function (os) { return os.clear(); })
      ]);
    }
    if (backend === 'ls') {
      ls = { threads: [], messages: [] };
      try { root.localStorage.removeItem(LS_KEY); } catch (e) {}
      return Promise.resolve();
    }
    return Promise.resolve();
  }

  /* 粗略占用估算，用于容量提示。
   * navigator.storage.estimate() 在部分环境（headless、file://）会永不 resolve，
   * 因此加 800ms 超时兜底，避免调用方被拖住。 */
  function usage() {
    if (backend === 'ls') {
      var raw = '';
      try { raw = root.localStorage.getItem(LS_KEY) || ''; } catch (e) {}
      return Promise.resolve({ backend: 'ls', bytes: raw.length, limit: LS_LIMIT });
    }
    if (backend === 'idb') {
      return new Promise(function (resolve) {
        var settled = false;
        function done(v) { if (!settled) { settled = true; resolve(v); } }
        var est = root.navigator && root.navigator.storage && root.navigator.storage.estimate;
        if (est) {
          try {
            root.navigator.storage.estimate().then(function (e) {
              done({ backend: 'idb', bytes: (e && e.usage) || 0, limit: (e && e.quota) || 0 });
            }, function () { done({ backend: 'idb', bytes: 0, limit: 0 }); });
          } catch (e) { done({ backend: 'idb', bytes: 0, limit: 0 }); }
        } else {
          done({ backend: 'idb', bytes: 0, limit: 0 });
        }
        setTimeout(function () { done({ backend: 'idb', bytes: 0, limit: 0 }); }, 800);
      });
    }
    return Promise.resolve({ backend: backend, bytes: 0, limit: 0 });
  }

  /* 往「指定档案」的库写数据，用于导入。
   * 不切当前档案、不碰当前数据——导入的语义是「新增一个档案」，
   * 而不是「覆盖我正在用的这份」。 */
  function importInto(profileId, threads, messages) {
    var def = (root.Profile && root.Profile.DEFAULT) || 'default';
    var nm = (profileId === def) ? 'astrum' : ('p.' + profileId + '.astrum');
    return openIDB(nm).then(function (d) {
      return new Promise(function (resolve, reject) {
        var tx;
        try {
          tx = d.transaction(['threads', 'messages'], 'readwrite');
        } catch (e) { try { d.close(); } catch (e2) {} reject(e); return; }
        var ts = tx.objectStore('threads');
        var ms = tx.objectStore('messages');
        (threads || []).forEach(function (t) { if (t && t.id) ts.put(t); });
        (messages || []).forEach(function (m) { if (m && m.id) ms.put(m); });
        tx.oncomplete = function () { try { d.close(); } catch (e) {} resolve(true); };
        tx.onerror = function () { try { d.close(); } catch (e) {} reject(tx.error); };
        tx.onabort = function () { try { d.close(); } catch (e) {} reject(tx.error || new Error('aborted')); };
      });
    });
  }

  root.Store = {
    init: init, backend: function () { return backend; },
    putThread: putThread, getThread: getThread, listThreads: listThreads,
    appendMessage: appendMessage, listMessages: listMessages,
    removeMessage: removeMessage, removeThread: removeThread, clearAll: clearAll,
    importInto: importInto,
    usage: usage, nowId: nowId
  };
})(typeof window !== 'undefined' ? window : globalThis);
