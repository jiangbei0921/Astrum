/* ASTRUM · 档案命名空间
 *
 * 目的：让「同一个人」和「另一个人」在同一台设备上的数据互不可见。
 * 现状的隐患：localStorage / IndexedDB 按浏览器源存储，不按身份区分——
 * 共用电脑时，B 打开页面会看到 A 留下的全部对话。
 *
 * 关键设计：**默认档案沿用旧键名**（'astrum.v2' / 'astrum.thread.v1' / DB 'astrum'）。
 *   - 老用户升级后数据原地可用，**不需要任何迁移**
 *   - 迁移代码是最容易悄悄丢数据的地方，能不做就不做
 *   - 新建的档案才加 'p.<id>.' 前缀
 *
 * 代价：默认档案的 id 永远是 'default'，只能改显示名。这是有意为之。
 */
(function (root) {
  'use strict';

  var META_KEY = 'astrum.profiles';
  var CUR_KEY = 'astrum.profile.current';
  var DEF = 'default';

  var list = [];
  var curId = DEF;

  function readJSON(k, d) {
    try { var r = root.localStorage.getItem(k); return r ? JSON.parse(r) : d; } catch (e) { return d; }
  }
  function writeJSON(k, v) {
    try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {}
  }
  function uid() {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function init() {
    list = readJSON(META_KEY, null);
    if (!Array.isArray(list) || !list.length) {
      list = [{ id: DEF, name: '主档案', createdAt: Date.now() }];
      writeJSON(META_KEY, list);
    }
    var saved = '';
    try { saved = root.localStorage.getItem(CUR_KEY) || ''; } catch (e) {}
    curId = saved || DEF;
    if (!list.some(function (p) { return p.id === curId; })) {
      curId = DEF;
      try { root.localStorage.setItem(CUR_KEY, DEF); } catch (e) {}
    }
    return curId;
  }

  /* 命名空间的唯一入口：默认档案返回原键，其余加前缀 */
  function ns(base) {
    return curId === DEF ? base : 'p.' + curId + '.' + base;
  }

  function currentId() { return curId; }
  function current() {
    return list.filter(function (p) { return p.id === curId; })[0] || list[0];
  }
  function all() { return list.slice(); }

  function create(name) {
    var n = String(name || '').trim().slice(0, 20);
    if (!n) return null;
    var p = { id: uid(), name: n, createdAt: Date.now() };
    list.push(p);
    writeJSON(META_KEY, list);
    return p;
  }

  function rename(id, name) {
    var n = String(name || '').trim().slice(0, 20);
    if (!n) return false;
    var p = list.filter(function (x) { return x.id === id; })[0];
    if (!p) return false;
    p.name = n;
    writeJSON(META_KEY, list);
    return true;
  }

  function switchTo(id) {
    if (!list.some(function (p) { return p.id === id; })) return false;
    try { root.localStorage.setItem(CUR_KEY, id); } catch (e) { return false; }
    curId = id;
    return true;
  }

  /* 只允许删除非默认档案；对应数据由调用方按 ns() 自行清理 */
  function remove(id) {
    if (id === DEF) return false;
    var before = list.length;
    list = list.filter(function (p) { return p.id !== id; });
    if (list.length === before) return false;
    writeJSON(META_KEY, list);
    if (curId === id) switchTo(DEF);
    return true;
  }

  /* 清理某个档案的全部键（前缀匹配），仅删本档案，不碰默认档案的原键 */
  function purgeKeys(id) {
    if (!id || id === DEF) return 0;
    var pre = 'p.' + id + '.';
    var n = 0;
    try {
      for (var i = root.localStorage.length - 1; i >= 0; i--) {
        var k = root.localStorage.key(i);
        if (k && k.indexOf(pre) === 0) { root.localStorage.removeItem(k); n++; }
      }
    } catch (e) {}
    return n;
  }

  init();

  root.Profile = {
    init: init, ns: ns,
    currentId: currentId, current: current, list: all,
    create: create, rename: rename, switchTo: switchTo, remove: remove,
    purgeKeys: purgeKeys,
    DEFAULT: DEF
  };
})(typeof window !== 'undefined' ? window : globalThis);
