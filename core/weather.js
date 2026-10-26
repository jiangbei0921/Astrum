/* ASTRUM · 天气（现在时）
 *
 * 定位与 SIMBAD 一致：**用户显式触发**的辅助判断，不参与答案推理。
 *
 * 隐私：只发送**城市名**与经纬度（城市中心，小数点后 2 位），
 *       不读定位、不读 GPS、不发送任何对话内容。
 *       城市来自设置里已有的 settings.city（默认「北京」），由用户自己选定。
 *
 * 数据：Open-Meteo（免费、无需 key）。
 *   - 地理编码：geocoding-api.open-meteo.com
 *   - 逐时预报：api.open-meteo.com
 *
 * 为什么不做 seeing：
 *   常用的 seeing 数据源（7timer）不放行浏览器跨域，要取得它必须自建代理。
 *   为一个次要指标引入一个长期运维点，不划算——云量才是决定能不能出摊的主因。
 */
(function (root) {
  'use strict';

  var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
  var FC = 'https://api.open-meteo.com/v1/forecast';
  var TIMEOUT = 3500;
  var CACHE_KEY = 'astrum.weather.cache.v1';
  var CACHE_TTL = 30 * 60 * 1000;   /* 30 分钟：天气半小时内不会有意义的变化 */
  var MAX_CACHE = 12;

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

  function num(v) {
    if (v == null || v === '') return null;
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  /* 把逐时数据收敛成「今晚」的几个关键值。
   * hours 取未来 12 小时内最暗的那几小时——白天查天气没有意义。 */
  function summarize(payload) {
    if (!payload || !payload.hourly || !Array.isArray(payload.hourly.time)) return null;
    var t = payload.hourly.time;
    var cloud = payload.hourly.cloud_cover || [];
    var temp = payload.hourly.temperature_2m || [];
    var wind = payload.hourly.wind_speed_10m || [];
    var precip = payload.hourly.precipitation_probability || [];

    var now = Date.now();
    var pick = [];
    for (var i = 0; i < t.length; i++) {
      var ts = Date.parse(t[i]);
      if (!isFinite(ts) || ts < now - 3600e3) continue;
      /* 只取当地 19:00–05:00 的时段 */
      var h = new Date(ts).getHours();
      if (h >= 19 || h <= 5) pick.push(i);
      if (pick.length >= 12) break;
    }
    if (!pick.length) {
      for (var j = 0; j < t.length && pick.length < 8; j++) pick.push(j);
    }

    function avg(arr) {
      var vs = pick.map(function (i) { return num(arr[i]); })
        .filter(function (v) { return v != null; });
      if (!vs.length) return null;
      return Math.round(vs.reduce(function (a, b) { return a + b; }, 0) / vs.length);
    }
    function max(arr) {
      var vs = pick.map(function (i) { return num(arr[i]); })
        .filter(function (v) { return v != null; });
      return vs.length ? Math.round(Math.max.apply(null, vs)) : null;
    }

    return {
      cloud: avg(cloud),
      cloudMax: max(cloud),
      temp: avg(temp),
      wind: avg(wind),
      precip: max(precip),
      hours: pick.length
    };
  }

  /* 出摊判断：只给一句话，不给分数——分数会让人以为它很精确 */
  function verdict(w) {
    if (!w || w.cloud == null) return { level: 'unknown', text: '无云量数据' };
    if (w.cloud <= 30) return { level: 'good', text: '云量低，适合出摊' };
    if (w.cloud <= 70) return { level: 'fair', text: '有云，需碰运气或挑时段' };
    return { level: 'bad', text: '云量高，不建议专门出摊' };
  }

  function request(url) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, TIMEOUT);
    return fetch(url, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (j) { clearTimeout(timer); return j; },
            function (e) { clearTimeout(timer); throw e; });
  }

  function lookup(city) {
    var name = String(city || '').trim();
    if (!name) return Promise.resolve({ ok: false, reason: 'no-city' });

    var hit = readCache()[name.toLowerCase()];
    if (hit && Date.now() - (hit.at || 0) < CACHE_TTL) {
      return Promise.resolve({ ok: true, data: hit.data, city: hit.city, from: 'cache' });
    }

    return request(GEO + '?name=' + encodeURIComponent(name) + '&count=1&language=zh&format=json')
      .then(function (g) {
        var r = g && g.results && g.results[0];
        if (!r) return { ok: false, reason: 'city-not-found' };
        var lat = Math.round(r.latitude * 100) / 100;
        var lon = Math.round(r.longitude * 100) / 100;
        var label = (r.name || name) + (r.admin1 ? '·' + r.admin1 : '');
        return request(FC + '?latitude=' + lat + '&longitude=' + lon +
          '&hourly=cloud_cover,temperature_2m,wind_speed_10m,precipitation_probability' +
          '&forecast_days=2&timezone=auto')
          .then(function (f) {
            var sum = summarize(f);
            if (!sum) return { ok: false, reason: 'no-data' };
            var data = Object.assign({}, sum, { lat: lat, lon: lon });
            var c = readCache();
            c[name.toLowerCase()] = { at: Date.now(), data: data, city: label };
            writeCache(c);
            return { ok: true, data: data, city: label, from: 'network' };
          });
      })
      .catch(function (e) {
        var msg = (e && e.name === 'AbortError') ? 'timeout' : String(e && e.message || e);
        return { ok: false, reason: msg };
      });
  }

  function clearCache() {
    try { root.localStorage.removeItem(CACHE_KEY); } catch (e) {}
  }

  root.Weather = {
    lookup: lookup, summarize: summarize, verdict: verdict,
    clearCache: clearCache, TIMEOUT: TIMEOUT
  };
})(typeof window !== 'undefined' ? window : globalThis);
