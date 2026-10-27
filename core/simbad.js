/* ASTRUM · SIMBAD 查询客户端
 *
 * 定位：**用户显式触发**的权威数据查询，不参与现有答案的推理。
 *
 * 为什么不接进 compose：
 *   现有每条证据都带固定的核验日期（verified）。SIMBAD 返回的是「此刻的值」，
 *   混进同一条证据链会让「可复算」这个承诺变得含糊——
 *   用户看到的数字，到底是可以复核的常数，还是刚才那一刻的快照？
 *   所以它单独成块，标注 realtime，与本地证据并列而不是混入。
 *
 * 隐私：只发送天体名称（如 M42），不发送位置、对话内容或任何本地数据。
 *
 * 实现：走 SIMBAD TAP（ADQL + JSON），比解析 ASCII 输出稳健得多。
 */
(function (root) {
  'use strict';

  var TAP = 'https://simbad.u-strasbg.fr/simbad/sim-tap/sync';
  var TIMEOUT = 8000;
  var CACHE_KEY = 'astrum.simbad.cache.v1';
  var CACHE_TTL = 24 * 3600 * 1000;
  var MAX_CACHE = 60;

  function readCache() {
    try { return JSON.parse(root.localStorage.getItem(CACHE_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function writeCache(c) {
    try {
      var keys = Object.keys(c);
      if (keys.length > MAX_CACHE) {
        keys.sort(function (a, b) { return (c[a].at || 0) - (c[b].at || 0); });
        keys.slice(0, keys.length - MAX_CACHE).forEach(function (k) { delete c[k]; });
      }
      root.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    } catch (e) {}
  }

  /* 名称规范化：去掉多余空格与中文标点，SIMBAD 对 'M 42' / 'M42' 都能识别，统一成后者 */
  function norm(name) {
    return String(name || '').trim().replace(/\s+/g, ' ').replace(/\s*(\d+)\s*$/, '$1');
  }

  function buildAdql(ident) {
    var safe = norm(ident).replace(/'/g, "''");
    /* 只取 basic 表里确实存在的列。实测 V 不在 basic 中（返回 400 unresolved identifier），
     * 取星等需要再 join allfluxes，为减少失败面先不做。 */
    return "SELECT TOP 1 main_id, ra, dec, otype, plx_value FROM basic " +
      "JOIN ident ON ident.oidref = basic.oid " +
      "WHERE ident.id = '" + safe + "'";
  }

  /* 解析 TAP 的 {metadata, data} 结构。单独导出便于离线测试。 */
  function parse(payload) {
    if (!payload || !Array.isArray(payload.metadata) || !Array.isArray(payload.data)) return null;
    if (!payload.data.length) return null;
    var cols = payload.metadata.map(function (m) { return m.name; });
    var row = payload.data[0];
    var o = {};
    cols.forEach(function (c, i) { o[c] = row[i]; });
    if (!o.main_id) return null;
    return {
      id: String(o.main_id).trim(),
      ra: num(o.ra),
      dec: num(o.dec),
      otype: o.otype || '',
      plx: num(o.plx_value),
      vmag: num(o.V)
    };
  }

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* 距离：优先用视差（mas）换算，秒差距 = 1000 / 视差 */
  function distanceLy(info) {
    if (!info || !info.plx || info.plx <= 0) return null;
    var pc = 1000 / info.plx;
    return Math.round(pc * 3.26156);
  }

  function cached(ident) {
    var c = readCache()[norm(ident).toLowerCase()];
    if (!c) return null;
    if (Date.now() - (c.at || 0) > CACHE_TTL) return null;
    return c.info || null;
  }

  function lookup(ident) {
    var key = norm(ident).toLowerCase();
    if (!key) return Promise.resolve({ ok: false, reason: 'empty' });

    var hit = cached(ident);
    if (hit) return Promise.resolve({ ok: true, info: hit, from: 'cache' });

    var url = TAP + '?request=doQuery&lang=adql&format=json&query=' +
      encodeURIComponent(buildAdql(ident));

    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);

    return fetch(url, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (payload) {
        var info = parse(payload);
        if (!info) return { ok: false, reason: 'not-found' };
        var c = readCache();
        c[key] = { at: Date.now(), info: info };
        writeCache(c);
        return { ok: true, info: info, from: 'network' };
      })
      .catch(function (e) {
        var msg = (e && e.name === 'AbortError') ? 'timeout' : String(e && e.message || e);
        return { ok: false, reason: msg };
      })
      .then(function (res) {
        clearTimeout(timer);
        return res;
      });
  }

  function clearCache() {
    try { root.localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  root.Simbad = {
    lookup: lookup, parse: parse, norm: norm,
    distanceLy: distanceLy, buildAdql: buildAdql,
    clearCache: clearCache, TIMEOUT: TIMEOUT
  };
})(typeof window !== 'undefined' ? window : globalThis);
