/* ASTRUM · 线程模型
 *
 * 职责：把「一轮问答」组织成可持久化、可恢复的线程。
 * 不负责渲染，也不负责业务判断——渲染由 app.js 按 ans 重放。
 *
 * 关键约定：
 *   1) 每次只 append 单条消息，不做整线程覆盖写（避免大对象反复序列化）。
 *   2) bot 消息保存完整的 ans 对象，恢复时走同一条渲染路径。
 *   3) 附件只存缩略图与元信息，不存原文件。
 */
(function (root) {
  'use strict';

  var S = root.Store;
  var CUR_KEY = (typeof window !== 'undefined' && window.Profile) ? window.Profile.ns('astrum.thread.current') : 'astrum.thread.current';
  var SCHEMA = 1;

  var cur = null;        /* 当前线程对象 */

  function readCur() {
    try { return root.localStorage.getItem(CUR_KEY) || ''; } catch (e) { return ''; }
  }
  function writeCur(id) {
    try { root.localStorage.setItem(CUR_KEY, id); } catch (e) {}
  }

  function makeThread(title) {
    var t = {
      id: S.nowId(),
      title: title || '新对话',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schema: SCHEMA,
      count: 0
    };
    return t;
  }

  /* 标题取首条提问，截断到 18 字 */
  function titleFrom(text) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    return s.length > 18 ? s.slice(0, 18) + '…' : (s || '新对话');
  }

  function init() {
    return S.init().then(function () {
      var id = readCur();
      if (!id) return null;
      return S.getThread(id);
    }).then(function (t) {
      /* 不覆盖已存在的 cur：boot 的恢复是异步的，可能与首条提问并发。
       * 若无条件赋值，会把 appendUser 刚创建的线程冲掉，导致后续 appendBot
       * 找不到线程（表现为线程计数停在 1、bot 消息丢失）。 */
      if (!cur) cur = t || null;
      return { thread: cur, backend: S.backend() };
    });
  }

  function ensure(firstText) {
    if (cur) return Promise.resolve(cur);
    /* 必须等存储就绪：boot 的 init 是异步的，若此时用户已开口，
     * 直接写会得到「store not ready」。 */
    return S.init().then(function () {
      if (cur) return cur;
      cur = makeThread(titleFrom(firstText));
      writeCur(cur.id);
      return S.putThread(cur).then(function () { return cur; });
    });
  }

  function touch(patch) {
    if (!cur) return Promise.resolve();
    cur.updatedAt = Date.now();
    if (patch && patch.count != null) cur.count = patch.count;
    return S.putThread(cur);
  }

  function appendUser(text, atts) {
    return ensure(text).then(function () {
      if (cur.count === 0) { cur.title = titleFrom(text); }
      return S.appendMessage({
        threadId: cur.id, role: 'user', text: text,
        atts: (atts || []).map(function (a) {
          return { name: a.name, kind: a.kind, ext: a.ext, thumb: a.thumb || '' };
        })
      });
    }).then(function (m) {
      return touch({ count: (cur.count || 0) + 1 }).then(function () { return m; });
    });
  }

  function appendBot(ans) {
    if (!cur) return Promise.reject(new Error('no thread'));
    return S.appendMessage({
      threadId: cur.id, role: 'bot', text: ans && ans.query ? ans.query : '', ans: ans
    }).then(function (m) {
      return touch({ count: (cur.count || 0) + 1 }).then(function () { return m; });
    });
  }

  function loadMessages() {
    if (!cur) return Promise.resolve([]);
    return S.listMessages(cur.id);
  }

  function clearCurrent() {
    if (!cur) return Promise.resolve();
    var id = cur.id;
    cur = null;
    writeCur('');
    return S.removeThread(id);
  }

  function clearAll() {
    cur = null;
    writeCur('');
    return S.clearAll();
  }

  function list() { return S.listThreads(); }

  /* 切换到指定线程（侧栏点击）。找不到就当作新对话。 */
  function setCurrent(id) {
    if (!id) { cur = null; writeCur(''); return Promise.resolve(null); }
    return S.getThread(id).then(function (t) {
      cur = t || null;
      writeCur(cur ? cur.id : '');
      return cur;
    });
  }

  function rename(id, title) {
    return S.getThread(id).then(function (t) {
      if (!t) return null;
      t.title = String(title || '').slice(0, 40) || t.title;
      t.updatedAt = Date.now();
      return S.putThread(t).then(function () {
        if (cur && cur.id === t.id) cur.title = t.title;
        return t;
      });
    });
  }

  function remove(id) {
    return S.removeThread(id).then(function () {
      if (cur && cur.id === id) { cur = null; writeCur(''); }
    });
  }

  root.Thread = {
    init: init, ensure: ensure,
    appendUser: appendUser, appendBot: appendBot,
    loadMessages: loadMessages,
    list: list, setCurrent: setCurrent, rename: rename, remove: remove,
    clearCurrent: clearCurrent, clearAll: clearAll,
    current: function () { return cur; },
    backend: function () { return S.backend(); },
    titleFrom: titleFrom,
    SCHEMA: SCHEMA
  };
})(typeof window !== 'undefined' ? window : globalThis);
