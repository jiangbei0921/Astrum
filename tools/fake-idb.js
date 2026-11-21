/* ASTRUM P4 · 零依赖内存 IndexedDB 垫片（仅测试用）
 *
 * 只实现 task-store 需要的子集：
 *   open/onupgradeneeded/createObjectStore/createIndex、db.transaction、
 *   objectStore.put/get/getAll/delete/clear、请求回调、事务 complete/abort。
 *
 * 用法：
 *   var fake = require('./fake-idb').install();
 *   fake.failNextPut('QuotaExceededError');
 *   fake.abortNextTransaction();
 *   fake.reset();
 */
'use strict';

function clone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

function keyOf(keyPath, obj) {
  if (Array.isArray(keyPath)) {
    return keyPath.map(function (k) { return obj[k]; });
  }
  return obj[keyPath];
}

function keyId(key) {
  return JSON.stringify(key);
}

function DbError(name, message, code) {
  var e = new Error(message || name);
  e.name = name;
  if (code != null) e.code = code;
  return e;
}

function Request() {
  this.result = undefined;
  this.error = null;
  this.onsuccess = null;
  this.onerror = null;
  this._done = null;
}

function makeStore(meta) {
  return {
    keyPath: meta.keyPath,
    _meta: meta,
    createIndex: function (name, keyPath) {
      meta.indexes[name] = { name: name, keyPath: keyPath };
      return { name: name };
    }
  };
}

function StoreHandle(tx, name) {
  this.tx = tx;
  this.name = name;
  var meta = tx.db._stores[name];
  if (!meta) throw DbError('NotFoundError', 'store not found: ' + name);
  this.meta = meta;
}

StoreHandle.prototype._request = function (fn) {
  var req = new Request();
  var tx = this.tx;
  tx._ops.push(function () {
    if (tx._aborted) { req._finishError(DbError('AbortError', 'transaction aborted')); return; }
    try {
      var out = fn();
      req.result = out;
      if (typeof req.onsuccess === 'function') req.onsuccess();
      if (req._done) req._done();
    } catch (e) {
      tx._aborted = true;
      if (!tx.error) tx.error = e;
      req._finishError(e);
    }
  });
  return req;
};

Request.prototype._finishError = function (err) {
  this.error = err;
  if (typeof this.onerror === 'function') this.onerror();
  if (this._done) this._done();
};

StoreHandle.prototype.put = function (value) {
  var self = this;
  return this._request(function () {
    var tx = self.tx;
    if (tx._fake.failPut) {
      var err = tx._fake.failPut;
      tx._fake.failPut = null;
      tx._aborted = true;
      throw DbError(err.name || 'UnknownError', 'injected put failure', err.code);
    }
    var key = keyOf(self.meta.keyPath, value);
    if (key === undefined) throw DbError('DataError', 'keyPath missing');
    var stored = clone(value);
    self.meta.data[keyId(key)] = stored;
    return key;
  });
};

StoreHandle.prototype.get = function (key) {
  var self = this;
  return this._request(function () {
    return clone(self.meta.data[keyId(key)]);
  });
};

StoreHandle.prototype.getAll = function () {
  var self = this;
  return this._request(function () {
    return Object.keys(self.meta.data).map(function (k) {
      return clone(self.meta.data[k]);
    });
  });
};

StoreHandle.prototype.delete = function (key) {
  var self = this;
  return this._request(function () {
    delete self.meta.data[keyId(key)];
    return undefined;
  });
};

StoreHandle.prototype.clear = function () {
  var self = this;
  return this._request(function () {
    self.meta.data = {};
    return undefined;
  });
};

function Transaction(db, names, mode, fake) {
  this.db = db;
  this.names = names;
  this.mode = mode;
  this._fake = fake;
  this._ops = [];
  this._done = false;
  this._aborted = false;
  this._started = false;
  this.error = null;
  this.oncomplete = null;
  this.onerror = null;
  this.onabort = null;
  this._schedule();
}

Transaction.prototype.objectStore = function (name) {
  if (this.names.indexOf(name) < 0) {
    throw DbError('NotFoundError', 'store not in transaction: ' + name);
  }
  return new StoreHandle(this, name);
};

Transaction.prototype.abort = function () {
  if (this._done) return;
  this._aborted = true;
  this._finishAbort(DbError('AbortError', 'transaction aborted'));
};

Transaction.prototype._schedule = function () {
  var self = this;
  setTimeout(function () { self._drain(); }, 0);
};

Transaction.prototype._drain = function () {
  var self = this;
  if (this._done) return;
  if (this._aborted) {
    this._finishAbort(this.error || DbError('AbortError', 'transaction aborted'));
    return;
  }
  if (this._ops.length) {
    var op = this._ops.shift();
    var wrapped = function () {
      if (self._aborted) {
        self._finishAbort(self.error || DbError('AbortError', 'transaction aborted'));
        return;
      }
      op();
      self._drain();
    };
    wrapped();
    return;
  }
  setTimeout(function () {
    if (self._done) return;
    if (self._aborted) { self._finishAbort(self.error); return; }
    if (self._ops.length) { self._drain(); return; }
    self._done = true;
    if (typeof self.oncomplete === 'function') self.oncomplete();
  }, 0);
};

Transaction.prototype._finishAbort = function (err) {
  if (this._done) return;
  this._done = true;
  this.error = err;
  if (typeof this.onabort === 'function') this.onabort();
  if (typeof this.onerror === 'function') this.onerror();
};

function Database(name, version, stores, fake) {
  this.name = name;
  this.version = version;
  this._stores = stores;
  this._fake = fake;
  this.objectStoreNames = {
    contains: function (n) { return !!this._names[n]; },
    _names: Object.keys(stores).reduce(function (acc, k) { acc[k] = 1; return acc; }, {})
  };
}

Database.prototype.createObjectStore = function (name, opts) {
  opts = opts || {};
  if (this._stores[name]) throw DbError('ConstraintError', 'store exists: ' + name);
  this._stores[name] = { name: name, keyPath: opts.keyPath || 'id', data: {}, indexes: {} };
  this.objectStoreNames._names[name] = 1;
  return makeStore(this._stores[name]);
};

Database.prototype.transaction = function (names, mode) {
  var list = Array.isArray(names) ? names : [names];
  var self = this;
  list.forEach(function (n) {
    if (!self._stores[n]) throw DbError('NotFoundError', 'store not found: ' + n);
  });
  if (mode === 'readwrite' && this._fake.abortNext) {
    this._fake.abortNext = false;
    var tx0 = new Transaction(this, list, mode, this._fake);
    tx0._aborted = true;
    tx0.error = DbError('AbortError', 'injected abort');
    return tx0;
  }
  return new Transaction(this, list, mode, this._fake);
};

Database.prototype.close = function () { /* no-op */ };

function FakeIndexedDB() {
  this._dbs = {};
  this.failPut = null;
  this.abortNext = false;
}

FakeIndexedDB.prototype.open = function (name, version) {
  var self = this;
  var req = new Request();
  if (this.failOpen) {
    var failure = this.failOpen;
    this.failOpen = null;
    setTimeout(function () {
      req.error = failure;
      if (typeof req.onerror === 'function') req.onerror();
    }, 0);
    return req;
  }
  setTimeout(function () {
    var existing = self._dbs[name];
    var target = version == null ? (existing ? existing.version : 1) : version;
    if (existing && target < existing.version) {
      req.error = DbError('VersionError', 'requested version below current');
      if (typeof req.onerror === 'function') req.onerror();
      return;
    }
    var needUpgrade = !existing || target > existing.version;
    var db;
    if (!existing) {
      db = new Database(name, 0, {}, self);
      self._dbs[name] = db;
    } else {
      db = existing;
    }
    if (needUpgrade) {
      db.version = target;
      req.result = db;
      if (typeof req.onupgradeneeded === 'function') req.onupgradeneeded({ oldVersion: existing ? existing.version : 0 });
      req.result = db;
    }
    db.version = target;
    req.result = db;
    if (typeof req.onsuccess === 'function') req.onsuccess();
  }, 0);
  return req;
};

FakeIndexedDB.prototype.deleteDatabase = function (name) {
  var self = this;
  var req = new Request();
  setTimeout(function () {
    delete self._dbs[name];
    if (typeof req.onsuccess === 'function') req.onsuccess();
  }, 0);
  return req;
};

function install(target) {
  var fake = new FakeIndexedDB();
  var host = target || (typeof global !== 'undefined' ? global : this);
  host.indexedDB = fake;
  return {
    indexedDB: fake,
    reset: function () { fake._dbs = {}; fake.failPut = null; fake.abortNext = false; },
    failNextPut: function (name, code) {
      fake.failPut = { name: name || 'QuotaExceededError', code: code == null ? 22 : code };
    },
    abortNextTransaction: function () { fake.abortNext = true; },
    failNextOpen: function (err) { fake.failOpen = err || DbError('InvalidStateError', 'injected open failure'); },
    names: function () { return Object.keys(fake._dbs); },
    db: function (name) { return fake._dbs[name]; },
    dump: function (name, store) {
      var db = fake._dbs[name];
      if (!db || !db._stores[store]) return null;
      return db._stores[store].data;
    }
  };
}

module.exports = { install: install, FakeIndexedDB: FakeIndexedDB };
