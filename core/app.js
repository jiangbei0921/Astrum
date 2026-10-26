/* ASTRUM · 界面控制层 v1.3（多来源 + Daylight Paper） */
(function () {
  'use strict';
  var A = window.Astro, C = window.CATALOG, K = window.KNOWLEDGE, AC = window.AgentCore, S = window.Sources;
  var A_ATT = window.Attachments;

  /* ================= 存储 ================= */
  /* 键名按档案命名空间生成；切换档案会整页重载，因此加载期计算即可 */
  var KEY = window.Profile ? Profile.ns('astrum.v2') : 'astrum.v2';
  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; }
  }
  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify({
        settings: state.settings, custom: state.custom, cfg: cfg,
        skills: state.skills || []
      }));
    } catch (e) { /* 隐私模式降级 */ }
  }

  var DEFAULTS = {
    sourceId: 'local', mode: 'single',
    register: 'auto', depth: 'standard', skymap: 'labeled', precision: 'visual',
    showTrace: true, showConfidence: true, showJD: true, autoScroll: true,
    compact: false, largeText: false, city: '北京', gear: 'binocular',
    place: null, showObs: true, sidebarCollapsed: false
  };

  var store = load();
  var state = {
    ctx: null, busy: false, cacheKey: '', preview: null, counter: 0,
    settings: Object.assign({}, DEFAULTS, store.settings || {}),
    custom: Array.isArray(store.custom) ? store.custom : [],
    skills: Array.isArray(store.skills) ? store.skills : [],
    draft: null, editing: null, composerAt: 'hero', asked: false,
    attachments: [],  /* 待发送的附件：{id,name,sizeText,kind,status,text,thumb,fits} */
    memory: []   /* 跨轮记忆：{q, a, target, at} */
  };

  function mergeCfg(saved) {
    var d = AC.defaultConfig();
    if (saved) Object.keys(d).forEach(function (k) { if (saved[k]) Object.assign(d[k], saved[k]); });
    return d;
  }
  var cfg = mergeCfg(store.cfg);

  /* ================= 工具 ================= */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function hexA(hex, a) {
    var h = String(hex || '#3b3bd6').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return 'rgba(' + parseInt(h.substring(0, 2), 16) + ',' + parseInt(h.substring(2, 4), 16) + ',' + parseInt(h.substring(4, 6), 16) + ',' + a + ')';
  }
  function statusLabel(s) { return tn({ established: '已成共识', emerging: '前沿研究', speculative: '未定论' }[s] || '已成共识'); }
  function sourceById(id) {
    var all = S.list();
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return all[0];
  }
  function initials(src) {
    if (src.id === 'local') return '✦';
    var m = String(src.name).replace(/[^\u4e00-\u9fa5A-Za-z]/g, '');
    return (m.charAt(0) || 'A').toUpperCase();
  }
  function statusTone(st) {
    return { ready: 'ok', untested: 'warn', unconfigured: 'off', error: 'err', off: 'off' }[st.state] || 'off';
  }

  /* ================= 上下文 ================= */
  function cityByName(n) {
    for (var i = 0; i < AC.CITIES.length; i++) if (AC.CITIES[i].n === n) return AC.CITIES[i];
    return AC.CITIES[0];
  }
  /* ===== 地点：检索 + IP 定位 + 手动坐标 ===== */
  function normPlace(p) {
    return {
      n: p.n || p.en || '自定义地点', lat: +p.lat, lon: +p.lon,
      tzid: p.tzid || null, tz: typeof p.tz === 'number' ? p.tz : null,
      bortle: p.bortle || 6, cc: p.cc || ''
    };
  }
  function placeOffset(p) {
    var now = new Date();
    return AC.tzOf(p, now.getFullYear(), now.getMonth() + 1, now.getDate());
  }
  function setPlace(p, opts) {
    var np = normPlace(p);
    state.place = np;
    state.settings.place = np;
    state.settings.city = np.n;
    var off = placeOffset(np);
    if ($('#ctxPlace')) $('#ctxPlace').value = np.n;
    if ($('#ctxPlaceSub')) {
      $('#ctxPlaceSub').textContent =
        np.lat.toFixed(2) + '°, ' + np.lon.toFixed(2) + '° · UTC' + (off >= 0 ? '+' : '') + off +
        (np.cc ? ' · ' + np.cc : '') + (np.bortle <= 4 ? ' · 暗夜' : '');
    }
    persist();
    state.cacheKey = '';
    refreshPanels();
    if (opts && opts.toast) toast(opts.toast);
  }

  /* ============================================================
     全球地点检索：在线（Open-Meteo + Photon）为主，本地 809 城市兜底
     ============================================================ */
  var placeSearchState = {
    seq: 0,          /* 请求序号，丢弃过期响应 */
    items: [],
    active: -1,      /* 键盘高亮项 */
    timer: null,
    open: false
  };

  /* 本地城市匹配（离线兜底，在线不可用时用） */
  function localPlaceMatches(q, limit) {
    var k = String(q || '').trim().toLowerCase();
    if (!k) return [];
    var out = [];
    for (var i = 0; i < AC.CITIES.length; i++) {
      var c = AC.CITIES[i];
      var hay = (c.n + ' ' + (c.en || '') + ' ' + (c.cc || '')).toLowerCase();
      if (hay.indexOf(k) >= 0) {
        out.push({
          n: c.n, en: c.en || '', lat: c.lat, lon: c.lon,
          cc: c.cc || '', country: c.cc || '', admin1: '', admin2: '',
          tzid: c.tzid || null, pop: c.pop || 0, kind: '城市', src: 'local', el: 0
        });
      }
      if (out.length >= limit) break;
    }
    out.sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); });
    return out;
  }

  function placeLabel(p) {
    if (window.GeoSearch && GeoSearch.labelOf) return GeoSearch.labelOf(p);
    return p.n;
  }

  function renderPlacePanel(items, note) {
    var panel = $('#placePanel');
    if (!panel) return;
    placeSearchState.items = items || [];
    placeSearchState.active = items && items.length ? 0 : -1;
    panel.innerHTML = '';
    if (!items || !items.length) {
      var empty = el('div', 'pl-empty', note || '未找到匹配的地点，可直接输入经纬度');
      panel.appendChild(empty);
      panel.hidden = false;
      placeSearchState.open = true;
      syncPlaceAria();
      return;
    }
    for (var i = 0; i < items.length; i++) {
      var p = items[i];
      var row = el('div', 'pl-row' + (i === placeSearchState.active ? ' on' : ''));
      row.setAttribute('role', 'option');
      row.setAttribute('data-idx', String(i));
      var main = el('div', 'pl-main');
      main.appendChild(el('div', 'pl-name', p.n));
      var meta = [];
      if (p.admin1) meta.push(p.admin1);
      if (p.admin2 && p.admin2 !== p.admin1) meta.push(p.admin2);
      if (p.country) meta.push(p.country);
      if (meta.length) main.appendChild(el('div', 'pl-meta', meta.join(' · ')));
      row.appendChild(main);
      var right = el('div', 'pl-right');
      if (p.kind) right.appendChild(el('span', 'pl-kind', p.kind));
      right.appendChild(el('span', 'pl-coord', p.lat.toFixed(3) + '°, ' + p.lon.toFixed(3) + '°'));
      row.appendChild(right);
      (function (idx) {
        row.addEventListener('mousedown', function (e) {
          e.preventDefault();
          choosePlace(items[idx]);
        });
      })(i);
      panel.appendChild(row);
    }
    panel.hidden = false;
    placeSearchState.open = true;
    syncPlaceAria();
  }

  function syncPlaceAria() {
    var inp = $('#ctxPlace');
    if (inp) inp.setAttribute('aria-expanded', placeSearchState.open ? 'true' : 'false');
  }

  function hidePlacePanel() {
    var panel = $('#placePanel');
    if (panel) { panel.hidden = true; panel.innerHTML = ''; }
    placeSearchState.open = false;
    placeSearchState.items = [];
    placeSearchState.active = -1;
    syncPlaceAria();
  }

  function movePlaceActive(delta) {
    var items = placeSearchState.items;
    if (!items.length) return;
    var n = items.length;
    placeSearchState.active = ((placeSearchState.active + delta) % n + n) % n;
    var panel = $('#placePanel');
    if (!panel) return;
    var rows = panel.querySelectorAll('.pl-row');
    for (var i = 0; i < rows.length; i++) {
      if (i === placeSearchState.active) rows[i].classList.add('on');
      else rows[i].classList.remove('on');
    }
    var on = rows[placeSearchState.active];
    if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest' });
  }

  function choosePlace(p) {
    if (!p) return;
    var np = {
      n: p.n, lat: p.lat, lon: p.lon,
      tzid: p.tzid || null,
      tz: null,
      bortle: 6,
      cc: p.cc || ''
    };
    if (p.src === 'local') np.bortle = (AC.CITIES.filter(function (c) { return c.n === p.n; })[0] || {}).bortle || 6;
    setPlace(np, { toast: '已切换到 ' + p.n });
    hidePlacePanel();
  }

  /* 执行检索：在线优先，失败或无结果时用本地兜底 */
  function doPlaceSearch(q) {
    var seq = ++placeSearchState.seq;
    var local = localPlaceMatches(q, 8);
    if (!window.GeoSearch) {
      renderPlacePanel(local, '在线检索不可用（已用内置城市库）');
      return;
    }
    GeoSearch.search(q, 30).then(function (online) {
      if (seq !== placeSearchState.seq) return;   /* 丢弃过期响应 */
      var merged = online.slice();
      /* 合并本地结果并按坐标去重 */
      var seen = {};
      for (var i = 0; i < merged.length; i++) {
        seen[merged[i].lat.toFixed(3) + ',' + merged[i].lon.toFixed(3)] = 1;
      }
      for (var j = 0; j < local.length; j++) {
        var k = local[j].lat.toFixed(3) + ',' + local[j].lon.toFixed(3);
        if (!seen[k]) { merged.push(local[j]); seen[k] = 1; }
      }
      if (!merged.length) {
        renderPlacePanel([], '未找到「' + q + '」，可直接输入经纬度（例：39.9,116.4）');
      } else {
        renderPlacePanel(merged.slice(0, 30), '');
      }
    }).catch(function () {
      if (seq !== placeSearchState.seq) return;
      renderPlacePanel(local, '在线检索失败，已用内置城市库');
    });
  }

  function onPlaceInput() {
    var inp = $('#ctxPlace');
    if (!inp) return;
    var q = inp.value.trim();
    if (placeSearchState.timer) clearTimeout(placeSearchState.timer);
    if (!q) { hidePlacePanel(); return; }
    /* 输入即搜：本地匹配瞬间出结果，同时异步拉在线结果 */
    var local = localPlaceMatches(q, 8);
    renderPlacePanel(local, '正在检索全球地点…');
    placeSearchState.timer = setTimeout(function () { doPlaceSearch(q); }, 220);
  }

  function applyCoords(lat, lon, name, tzid, tzNum) {
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      toast('坐标无效：纬度需在 −90~90，经度需在 −180~180');
      return false;
    }
    var near = AC.nearestPlace(lat, lon);
    if (!tzid && !tzNum && near && near.km < 25) {
      setPlace(near.place, { toast: '已定位到 ' + near.place.n + '（距坐标 ' + near.km.toFixed(0) + ' 公里）' });
      return true;
    }
    var p = { n: name || (near && near.km < 60 ? near.place.n + ' 附近' : '自定义地点'),
      lat: lat, lon: lon, tzid: tzid || null,
      tz: typeof tzNum === 'number' ? tzNum : Math.round(lon / 15), bortle: 6, cc: '' };
    setPlace(p, { toast: '已切换到 ' + p.n + '（' + lat.toFixed(2) + ', ' + lon.toFixed(2) + '）' });
    return true;
  }

  function resolvePlaceInput(text) {
    var t = String(text || '').trim();
    if (!t) return false;
    var m = t.match(/^(-?\d+(?:\.\d+)?)\s*[,，]\s*(-?\d+(?:\.\d+)?)$/);
    if (m) return applyCoords(parseFloat(m[1]), parseFloat(m[2]));
    var hit = AC.findCity(t) || (AC.searchPlaces(t, 1)[0] || null);
    if (hit) { setPlace(hit, { toast: '已切换到 ' + hit.n }); return true; }
    /* 本地库没有 —— 走在线全球检索 */
    if (window.GeoSearch) {
      GeoSearch.search(t, 1).then(function (list) {
        if (list && list.length) {
          choosePlace(list[0]);
        } else {
          toast('未找到「' + t + '」，可直接输入经纬度（例：39.9,116.4）');
          if (state.place) $('#ctxPlace').value = state.place.n;
        }
      }).catch(function () {
        toast('未找到「' + t + '」，可直接输入经纬度（例：39.9,116.4）');
        if (state.place) $('#ctxPlace').value = state.place.n;
      });
      return true;
    }
    toast('未找到「' + t + '」，可从列表选择或点「坐标」手动输入');
    if (state.place) $('#ctxPlace').value = state.place.n;
    return false;
  }

  /* ============================================================
     IP 定位：多端点降级链
     背景：ipapi.co 已被 Cloudflare 人机校验拦截（403 Just a moment），
           单一端点会导致「IP 定位不可用」的误报。
     策略：ipwho.is → ipinfo.io → ipapi.co → ipapi.is 依次尝试，任一成功即返回；
           全部失败时按失败类型给出可执行的提示，而不是笼统报错。
     ============================================================ */
  var IP_ENDPOINTS = [
    {
      name: 'ipwho.is',
      url: 'https://ipwho.is/',
      parse: function (d) {
        if (!d || d.success === false) return null;
        var lat = Number(d.latitude), lon = Number(d.longitude);
        if (!isFinite(lat) || !isFinite(lon)) return null;
        return {
          lat: lat, lon: lon,
          city: d.city || '', region: d.region || '', cc: d.country_code || '',
          tzid: (d.timezone && d.timezone.id) || null
        };
      }
    },
    {
      name: 'ipinfo.io',
      url: 'https://ipinfo.io/json',
      parse: function (d) {
        if (!d || !d.loc) return null;
        var p = String(d.loc).split(',');
        var lat = Number(p[0]), lon = Number(p[1]);
        if (!isFinite(lat) || !isFinite(lon)) return null;
        return {
          lat: lat, lon: lon,
          city: d.city || '', region: d.region || '', cc: d.country || '',
          tzid: d.timezone || null
        };
      }
    },
    {
      name: 'ipapi.co',
      url: 'https://ipapi.co/json/',
      parse: function (d) {
        if (!d) return null;
        var lat = Number(d.latitude), lon = Number(d.longitude);
        if (!isFinite(lat) || !isFinite(lon)) return null;
        return {
          lat: lat, lon: lon,
          city: d.city || '', region: d.region || '', cc: d.country_code || '',
          tzid: d.timezone || null
        };
      }
    },
    {
      name: 'ipapi.is',
      url: 'https://api.ipapi.is/json/',
      parse: function (d) {
        if (!d) return null;
        var lat = Number(d.lat), lon = Number(d.lon);
        if (!isFinite(lat) || !isFinite(lon)) return null;
        return {
          lat: lat, lon: lon,
          city: d.city || '', region: d.region || '', cc: d.country || '',
          tzid: d.timezone || null
        };
      }
    }
  ];

  /* 单次请求带超时；返回 { ok, data, reason } */
  function fetchIPOnce(ep, ms) {
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) { ctrl = null; }
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms || 6000);

    var opt = { cache: 'no-store', headers: { Accept: 'application/json' } };
    if (ctrl) opt.signal = ctrl.signal;

    return fetch(ep.url, opt)
      .then(function (r) {
        if (!r.ok) {
          var e = new Error('HTTP ' + r.status);
          e.status = r.status;
          throw e;
        }
        return r.text();
      })
      .then(function (txt) {
        var d;
        try { d = JSON.parse(txt); }
        catch (e) {
          /* 有些端点被 Cloudflare 拦截时会返回 HTML 挑战页 */
          var err = new Error('返回内容不是 JSON');
          err.reason = /just a moment|challenge|captcha|<html/i.test(txt)
            ? 'blocked' : 'parse';
          throw err;
        }
        var p = ep.parse(d);
        if (!p) {
          var e2 = new Error('响应缺少有效坐标');
          e2.reason = 'parse';
          throw e2;
        }
        return p;
      })
      .catch(function (e) {
        var reason = e.reason || 'network';
        if (e && e.name === 'AbortError') reason = 'timeout';
        else if (e && e.status === 403 || e && e.status === 429) reason = 'blocked';
        else if (e && e.status >= 500) reason = 'server';
        else if (/Failed to fetch|NetworkError|Load failed/i.test(e && e.message || '')) reason = 'network';
        var err = new Error(e && e.message || '定位失败');
        err.reason = reason;
        throw err;
      })
      .then(function (v) { clearTimeout(timer); return v; },
        function (e) { clearTimeout(timer); throw e; });
  }

  /* 依次尝试各端点，返回第一个成功结果；全失败则抛带 reasons 的错误 */
  /* 顺序尝试各端点，返回第一个成功结果；全失败则抛带 reasons 的错误。
   * budgetMs 是整体时间预算 —— 4 个端点串行、每个 6s 最长要 24s，
   * 用户不能等那么久。剩余预算不足时直接放弃后续端点。 */
  function fetchIPChain(ms, budgetMs) {
    var reasons = [];
    var per = ms || 4000;
    var budget = budgetMs || 12000;
    var t0 = Date.now();
    function step(i) {
      if (i >= IP_ENDPOINTS.length) {
        var e = new Error('所有定位端点均不可用');
        e.reasons = reasons;
        e.allFailed = true;
        throw e;
      }
      /* 剩余预算不足一个端点的最短等待时，直接结束 */
      var left = budget - (Date.now() - t0);
      if (i > 0 && left < 1500) {
        var e2 = new Error('定位时间预算耗尽');
        e2.reasons = reasons;
        e2.allFailed = true;
        throw e2;
      }
      var ep = IP_ENDPOINTS[i];
      var slice = Math.min(per, Math.max(1200, budget - (Date.now() - t0)));
      return fetchIPOnce(ep, slice).catch(function (err) {
        reasons.push(ep.name + ':' + (err.reason || 'fail'));
        return step(i + 1);
      });
    }
    return step(0);
  }

  function locateByIP(silent) {
    var settled = false;
    var btn = $('#btnLocate');
    if (btn) btn.classList.add('busy');
    var timer = setTimeout(function () {
      if (settled) return;
      settled = true;
      if (btn) btn.classList.remove('busy');
      if (!silent) toast('定位超时，请手动选择地点');
    }, 15000);
    function finish(ok, msg) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (btn) btn.classList.remove('busy');
      if (!silent || !ok) toast(msg);
    }
    fetchIPChain(4000, 12000)
      .then(function (g) {
        /* 精度策略：IP 接口给的经纬度本身就是真实位置，优先直接采用；
           只有当本地城市库在 3 公里内命中时才吸附到城市（含波特尔等级等本地属性），
           否则保留真实坐标并用反查补充区域名。
           —— 旧逻辑一律吸附到 40km 内的城市中心，导致「定位到济南」但坐标是市中心。 */
        var near = AC.nearestPlace(g.lat, g.lon, 0);
        var name = g.city || g.region || '当前地点';
        var detail = '';
        var useCity = near && near.km < 3;

        /* 反查更细的区域名（Photon），失败不影响主流程 */
        return (window.GeoSearch ? GeoSearch.reverse(g.lat, g.lon).catch(function () { return null; })
          : Promise.resolve(null))
          .then(function (rev) {
            if (rev) {
              detail = rev.city && rev.city !== name ? rev.city
                : (rev.state && rev.state !== name ? rev.state : '');
              if (!g.city && rev.city) name = rev.city;
              else if (!g.city && rev.name) name = rev.name;
            }
            if (useCity) {
              setPlace(near.place);
              finish(true, '已按 IP 定位：' + near.place.n +
                (near.km < 1 ? '' : '（距 ' + near.km.toFixed(1) + ' km）'));
            } else {
              var p = { n: name, lat: g.lat, lon: g.lon, tzid: g.tzid,
                tz: Math.round(g.lon / 15), bortle: 6, cc: g.cc || '' };
              setPlace(p);
              finish(true, '已按 IP 定位：' + name +
                (detail ? '（' + detail + '）' : '') +
                ' ' + g.lat.toFixed(3) + '°, ' + g.lon.toFixed(3) + '°');
            }
          });
      })
      .catch(function (e) {
        /* 按失败原因给出可执行的下一步，而不是笼统的"不可用" */
        var reasons = (e && e.reasons) || [];
        var allTimeout = reasons.length && reasons.every(function (r) { return /timeout/.test(r); });
        var allBlocked = reasons.length && reasons.every(function (r) { return /blocked/.test(r); });
        var msg;
        if (allTimeout) msg = '定位服务超时，请手动选择地点';
        else if (allBlocked) msg = '定位服务被网络策略拦截，请手动选择地点';
        else msg = 'IP 定位不可用，请手动选择地点';

        /* 把焦点交给可直接输入的地点框，并说明可用的输入格式 */
        var inp = $('#ctxPlace');
        if (inp) {
          try {
            inp.focus();
            inp.select();
          } catch (e2) { /* 某些环境不支持 select，忽略 */ }
        }
        finish(false, msg);
      });
  }

  function openCoordSheet() {
    var p = state.place || cityByName(state.settings.city);
    $('#coordLat').value = p.lat.toFixed(4);
    $('#coordLon').value = p.lon.toFixed(4);
    $('#coordName').value = p.n === '北京' ? '' : p.n;
    var sel = $('#coordTz');
    if (!sel.options.length) {
      for (var h = -12; h <= 14; h++) {
        var o = document.createElement('option');
        o.value = String(h); o.textContent = 'UTC' + (h >= 0 ? '+' : '') + h;
        sel.appendChild(o);
      }
    }
    sel.value = String(Math.round(p.lon / 15));
    closeSheet('settings');
    openSheet('coord');
  }

  function initContext() {
    var now = new Date();
    $('#ctxDate').value = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    $('#ctxTime').value = '21:00';
    $('#ctxGear').value = state.settings.gear;

    ['ctxDate', 'ctxTime'].forEach(function (id) {
      $('#' + id).addEventListener('change', function () { state.cacheKey = ''; refreshPanels(); });
    });
    $('#ctxPlace').addEventListener('input', onPlaceInput);
    $('#ctxPlace').addEventListener('focus', function () {
      var v = this.value.trim();
      if (v) onPlaceInput();
    });
    $('#ctxPlace').addEventListener('change', function (e) { resolvePlaceInput(e.target.value); });
    $('#ctxPlace').addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); movePlaceActive(1); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); movePlaceActive(-1); return; }
      if (e.key === 'Escape') { hidePlacePanel(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        /* 面板有高亮项时优先选中它，否则走原有解析（坐标/城市名） */
        if (placeSearchState.open && placeSearchState.active >= 0 && placeSearchState.items[placeSearchState.active]) {
          choosePlace(placeSearchState.items[placeSearchState.active]);
        } else {
          resolvePlaceInput(e.target.value);
          hidePlacePanel();
        }
        e.target.blur();
      }
    });
    /* 点击面板外关闭 */
    document.addEventListener('mousedown', function (e) {
      if (!placeSearchState.open) return;
      var panel = $('#placePanel');
      if (panel && !panel.contains(e.target) && e.target !== $('#ctxPlace')) {
        hidePlacePanel();
      }
    });
    $('#btnLocate').addEventListener('click', function () { locateByIP(false); });
    $('#btnManualCoord').addEventListener('click', openCoordSheet);
    $('#coordClose').addEventListener('click', function () { closeSheet('coord'); });
    $('#coordCancel').addEventListener('click', function () { closeSheet('coord'); });
    $('#coordOk').addEventListener('click', function () {
      var lat = parseFloat($('#coordLat').value);
      var lon = parseFloat($('#coordLon').value);
      var tz = parseFloat($('#coordTz').value);
      var nm = $('#coordName').value.trim();
      if (applyCoords(lat, lon, nm || '自定义地点', null, tz)) closeSheet('coord');
    });
    $('#ctxGear').addEventListener('change', function (e) {
      state.settings.gear = e.target.value;
      cfg.horizon.gear = e.target.value;
      state.cacheKey = ''; persist(); refreshPanels();
    });

    /* 恢复上次地点，否则尝试按 IP 定位 */
    if (state.settings.place) {
      setPlace(state.settings.place);
    } else {
      setPlace(cityByName(state.settings.city));
      setTimeout(function () { locateByIP(true); }, 600);
    }
  }
  function detectCity(q) {
    for (var i = 0; i < AC.CITIES.length; i++) {
      var c = AC.CITIES[i];
      if (q.indexOf(c.n) >= 0) return c;
      var al = c.alias || [];
      for (var j = 0; j < al.length; j++) if (q.indexOf(al[j]) >= 0) return c;
    }
    return null;
  }
  function readCtx() {
    var d = $('#ctxDate').value || '2026-01-01';
    var t = $('#ctxTime').value || '21:00';
    var dm = d.split('-'), tm = t.split(':');
    var city = state.place || cityByName(state.settings.city);
    return {
      y: +dm[0], mo: +dm[1], d: +dm[2], h: +tm[0] || 0, mi: +tm[1] || 0,
      tz: AC.tzOf(city, +dm[0], +dm[1], +dm[2]),
      lat: city.lat, lon: city.lon, city: city.n, bortle: city.bortle,
      cityRef: city, equipment: $('#ctxGear').value, experience: '进阶'
    };
  }

  /* ================= 星图 / 月相 ================= */
  function proj(alt, az, cx, cy, R) {
    var r = R * (90 - alt) / 90, a = az * A.RAD;
    return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a), r: r };
  }

  /* ============================================================
     星图：地平视角（站在地面仰望）
     投影：方位线性、高度按 0.72 次幂压缩，地平线在下方
     ============================================================ */
  var _starIdx = null;
  function starByKey(k) {
    if (!_starIdx) { _starIdx = {}; C.stars.forEach(function (s) { _starIdx[s.k] = s; }); }
    return _starIdx[k];
  }

  /* 银道坐标 -> 赤道坐标（J2000） */
  function galToEq(l, b) {
    var D = A.RAD;
    var aG = 192.85948 * D, dG = 27.12825 * D, lN = 122.93192 * D;
    var lb = l * D, bb = b * D;
    var sinDec = Math.sin(dG) * Math.sin(bb) + Math.cos(dG) * Math.cos(bb) * Math.cos(lN - lb);
    var dec = Math.asin(Math.max(-1, Math.min(1, sinDec))) / D;
    var y = Math.cos(bb) * Math.sin(lN - lb);
    var x = Math.cos(dG) * Math.sin(bb) - Math.sin(dG) * Math.cos(bb) * Math.cos(lN - lb);
    var ra = (aG + Math.atan2(y, x)) / D;
    return { ra: A.norm360(ra) / 15, dec: dec };
  }

  /* ============================================================
     星图 v3：天球（球体）视图
     以观测者所在位置建立地平坐标系，正交投影一个完整球面；
     相机可绕球旋转，地平圈以下压暗，球面网格与天赤道一并绘出。
     ============================================================ */
  function vsub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function vcross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function vdot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function vnorm(a) { var l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

  /* 颜色工具 */
  function hexRGB(hex) {
    var h = String(hex).replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function mixColor(hex, target, t) {
    var a = hexRGB(hex), b = hexRGB(target);
    return 'rgb(' + Math.round(a[0] + (b[0] - a[0]) * t) + ',' +
      Math.round(a[1] + (b[1] - a[1]) * t) + ',' +
      Math.round(a[2] + (b[2] - a[2]) * t) + ')';
  }

  /* ============================================================
     实时星图 v4：站在地面的透视场景
     相机位于观测者位置，水平视场可调；天空为无限远方向投影，
     行星与月球按「球体」渲染（受太阳方向照明），可点击查看资料。
     ============================================================ */
  /* 当前时刻的太阳系天体清单（星图与「天体导航」共用同一份数据） */
  function bodyList(jd, mp) {
    var INFO = window.BODY_INFO || {};
    var out = [];
    A.planets(jd).forEach(function (pl) {
      out.push({
        key: pl.key, name: pl.cn, info: INFO[pl.key] || {},
        ra: pl.ra, dec: pl.dec, dist: pl.dist, mag: pl.mag, kind: 'planet', raw: pl
      });
    });
    mp = mp || A.moonPhase(jd);
    out.push({
      key: 'moon', name: '月球', info: INFO.moon || {},
      ra: mp.ra, dec: mp.dec, dist: mp.dist / 149597870.7, mag: -12.7,
      kind: 'moon', raw: mp, phase: mp
    });
    var sp = A.sun(jd);
    out.push({
      key: 'sun', name: '太阳', info: INFO.sun || {},
      ra: sp.ra, dec: sp.dec, dist: sp.dist, mag: -26.7, kind: 'sun', raw: sp
    });
    return out;
  }

  /* ---- 天象模型缓存 ----
   * alt/az 只依赖 (时刻, 地点)，与相机无关。
   * 把它们一次性算好缓存起来，拖动相机时只做投影，帧内不再调用三角函数。
   * 原来每帧 ~3300 次 altAz（含银河 540 + 背景星场 2400 + 恒星/深空/星座），
   * 现在只在时刻或地点变化时算一次。 */
  var SKY_CACHE = { key: '', model: null };

  function skyModel(jd, lat, lon) {
    var key = jd.toFixed(5) + '|' + lat.toFixed(4) + '|' + lon.toFixed(4);
    if (SKY_CACHE.key === key && SKY_CACHE.model) return SKY_CACHE.model;
    var t0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    var m = { milky: [[], [], []], dust: [], stars: [], dso: [], cons: [], planets: [], sun: null, built: Date.now() };

    /* 银河带 */
    for (var b = 0; b < 3; b++) {
      for (var l = 0; l <= 360; l += 2) {
        var eq = galToEq(l, 0);
        var aa = A.altAz(eq.ra, eq.dec, jd, lat, lon);
        m.milky[b].push(aa);
      }
    }
    /* 背景星场（示意密度，非实测星表） */
    var seed = 20261022;
    function rnd() {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    }
    for (var i = 0; i < 2400; i++) {
      var gl = rnd() * 360;
      var gb = (rnd() + rnd() + rnd() - 1.5) * 11;
      if (rnd() < 0.34) gb = (rnd() - 0.5) * 155;
      var geq = galToEq(gl, gb);
      var gaa = A.altAz(geq.ra, geq.dec, jd, lat, lon);
      if (gaa.alt < 0.5) continue;
      m.dust.push({ az: gaa.az, alt: gaa.alt, magF: 4.2 + rnd() * 2.8 });
    }
    /* 恒星 */
    C.stars.forEach(function (st) {
      var a = A.altAz(st.ra, st.dec, jd, lat, lon);
      if (a.alt < -1) return;
      m.stars.push({ st: st, az: a.az, alt: a.alt });
    });
    /* 深空天体 */
    C.dso.forEach(function (dd) {
      var a = A.altAz(dd.ra, dd.dec, jd, lat, lon);
      if (a.alt < 0) return;
      m.dso.push({ d: dd, az: a.az, alt: a.alt });
    });
    /* 星座连线 */
    C.constellations.forEach(function (c) {
      var segs = [];
      c.lines.forEach(function (seg) {
        var s1 = starByKey(seg[0]), s2 = starByKey(seg[1]);
        if (!s1 || !s2) return;
        var a1 = A.altAz(s1.ra, s1.dec, jd, lat, lon);
        var a2 = A.altAz(s2.ra, s2.dec, jd, lat, lon);
        if (a1.alt < -1 || a2.alt < -1) return;
        segs.push([a1.az, a1.alt, a2.az, a2.alt]);
      });
      if (segs.length) m.cons.push({ c: c, segs: segs });
    });
    /* 太阳 */
    var sp = A.sun(jd);
    var saa = A.altAz(sp.ra, sp.dec, jd, lat, lon);
    m.sun = { ra: sp.ra, dec: sp.dec, az: saa.az, alt: saa.alt, pos: sp };
    /* 行星 */
    A.planets(jd).forEach(function (pl) {
      var a = A.altAz(pl.ra, pl.dec, jd, lat, lon);
      m.planets.push({ pl: pl, az: a.az, alt: a.alt });
    });
    /* 月球 */
    var mp = A.moonPhase(jd);
    var maa = A.altAz(mp.ra, mp.dec, jd, lat, lon);
    m.moon = { ra: mp.ra, dec: mp.dec, dist: mp.dist, phase: mp, az: maa.az, alt: maa.alt };

    SKY_CACHE.key = key;
    SKY_CACHE.model = m;
    PERF.sky.modelBuild = Math.round((performance.now() - t0) * 100) / 100;
    return m;
  }

  /* ---- 渲染性能统计（可观测性：渲染耗时、帧率、模型命中率） ---- */
  var PERF = {
    sky: { calls: 0, last: 0, avg: 0, model: 0, modelMiss: 0 },
    solar: { calls: 0, last: 0, avg: 0, fps: 0 },
    errors: []
  };
  function perfPush(bucket, ms) {
    var b = PERF[bucket];
    b.calls++;
    b.last = ms;
    b.avg = b.avg ? b.avg * 0.85 + ms * 0.15 : ms;
  }

  function drawSky(canvas, p) {
    var perfT0 = (typeof performance !== 'undefined' ? performance.now() : 0);
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    g.clearRect(0, 0, W, H);

    var jd = p.jd, lat = p.lat, lon = p.lon;
    var model = skyModel(jd, lat, lon);   /* 位置一次算好，帧内只投影 */
    var style = p.style || 'labeled';
    var detail = !!p.detail || style === 'full';
    var compact = !!p.compact;
    var showLabels = style !== 'minimal';

    var yaw = p.yaw == null ? 180 : p.yaw;
    var pitch = Math.max(-6, Math.min(78, p.pitch == null ? 12 : p.pitch));
    var fov = Math.max(30, Math.min(178, p.fov || 145));
    var D = A.RAD;
    var cx = W / 2, cy = H / 2;
    var Rmax = Math.min(W, H) * 0.49;      /* 视场半径 */
    var halfFov = fov / 2 * D;
    var k = (Rmax / 450) * (100 / fov) * 1.45;   /* 字号与线宽随视场缩放 */

    var cp = Math.cos(pitch * D), sp = Math.sin(pitch * D);
    var fwd = [cp * Math.sin(yaw * D), cp * Math.cos(yaw * D), sp];
    /* 右手系：right 指向观测者右手侧（面南时西在右），up 指向天顶 */
    var right = vnorm(vcross(fwd, [0, 0, 1]));
    var upv = vcross(right, fwd);

    /* 等距鱼眼：与视线夹角线性映射到半径，广角时不失真、可容纳整个天穹 */
    function proj(az, alt) {
      var ca = Math.cos(alt * D);
      var v = [ca * Math.sin(az * D), ca * Math.cos(az * D), Math.sin(alt * D)];
      var cosA = Math.max(-1, Math.min(1, vdot(v, fwd)));
      var ang = Math.acos(cosA);
      if (ang > halfFov * 1.02) return null;
      var xr = vdot(v, right), yr = vdot(v, upv);
      var len = Math.hypot(xr, yr);
      var rr = ang / halfFov * Rmax;
      if (len < 1e-6) return { x: cx, y: cy, z: cosA, ang: ang };
      return { x: cx + xr / len * rr, y: cy - yr / len * rr, z: cosA, ang: ang };
    }

    /* ---- 天空 ---- */
    var sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#03050a');
    sky.addColorStop(0.45, '#071020');
    sky.addColorStop(0.72, '#122036');
    sky.addColorStop(1, '#1a2a42');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);

    /* ---- 银河 ---- */
    (function milky() {
      var bands = [[9, 'rgba(120,150,205,0.085)'], [5, 'rgba(160,185,230,0.095)'], [2.2, 'rgba(205,218,242,0.10)']];
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      bands.forEach(function (bd, bi) {
        g.lineWidth = bd[0] * k * 4;
        g.strokeStyle = bd[1];
        var drawing = false;
        g.beginPath();
        var pts = model.milky[bi];
        for (var i = 0; i < pts.length; i++) {
          var q = proj(pts[i].az, pts[i].alt);
          if (!q) { drawing = false; continue; }
          if (!drawing) { g.moveTo(q.x, q.y); drawing = true; } else g.lineTo(q.x, q.y);
        }
        g.stroke();
      });
      g.restore();
    })();

    /* ---- 背景星场（示意密度，非实测星表；沿银道面聚集） ----
     * 性能要点：逐点 fill 会产生上千次绘制调用，这里按亮度分桶合并成少量 Path2D，
     * 每桶一次 fill，绘制调用从 ~1200 次降到 ~6 次。 */
    (function dust() {
      var n = compact ? 700 : (p.interactive ? 600 : model.dust.length);
      var BUCKETS = 6;
      var hasP2D = (typeof Path2D !== 'undefined');
      var paths = [], i;
      for (i = 0; i < BUCKETS; i++) paths.push(hasP2D ? new Path2D() : null);
      var fallback = [];
      for (i = 0; i < n; i++) {
        var dp = model.dust[i];
        var q = proj(dp.az, dp.alt);
        if (!q || q.z < 0.04) continue;
        if (q.x < -20 || q.x > W + 20 || q.y < -20 || q.y > H + 20) continue;
        var al = (0.2 + ((dp.magF * 37) % 100) / 100 * 0.34) * Math.min(1, (dp.alt + 5) / 22) * (q.z * 0.5 + 0.5);
        var bi = Math.min(BUCKETS - 1, Math.max(0, Math.floor(al * BUCKETS)));
        var sz = Math.max(0.6, (5.9 - dp.magF) * 0.95 * k);
        if (hasP2D) {
          paths[bi].moveTo(q.x + sz, q.y);
          paths[bi].arc(q.x, q.y, sz, 0, Math.PI * 2);
        } else {
          fallback.push({ x: q.x, y: q.y, r: sz, b: bi });
        }
      }
      for (i = 0; i < BUCKETS; i++) {
        if (hasP2D) {
          if (!paths[i]) continue;
          g.fillStyle = 'rgba(207,221,245,' + (0.2 + (i + 0.5) / BUCKETS * 0.34).toFixed(3) + ')';
          g.fill(paths[i]);
        }
      }
      if (!hasP2D) {
        for (i = 0; i < fallback.length; i++) {
          var f = fallback[i];
          g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          g.fillStyle = 'rgba(207,221,245,' + (0.2 + (f.b + 0.5) / BUCKETS * 0.34).toFixed(3) + ')';
          g.fill();
        }
      }
    })();

    /* ---- 恒星（按亮度分桶批量绘制） ---- */
    var hits = [], starPts = [];
    (function stars() {
      var hasP2D = (typeof Path2D !== 'undefined');
      var BUCKETS = 5;
      var paths = [], i;
      for (i = 0; i < BUCKETS; i++) paths.push(hasP2D ? new Path2D() : null);
      var fb = [];
      model.stars.forEach(function (rec) {
        var st = rec.st, aa = { az: rec.az, alt: rec.alt };
        var q = proj(aa.az, aa.alt);
        if (!q) return;
        if (q.x < -60 || q.x > W + 60 || q.y < -60 || q.y > H + 60) return;
        var size = Math.max(1.0 * k, (4.9 - (st.mag + 1.5) * 0.56) * k);
        var alpha = (st.mag < 1 ? 1 : st.mag < 2 ? 0.9 : st.mag < 3 ? 0.68 : 0.42)
          * (aa.alt < 8 ? 0.6 + aa.alt / 16 : 1);
        var bi = Math.min(BUCKETS - 1, Math.max(0, Math.floor((1 - alpha) * BUCKETS)));
        if (hasP2D) {
          paths[bi].moveTo(q.x + size, q.y);
          paths[bi].arc(q.x, q.y, size, 0, Math.PI * 2);
        } else {
          fb.push({ x: q.x, y: q.y, r: size, b: bi });
        }
        starPts.push({ s: st, pt: q, alt: aa.alt });
        if (aa.alt > 0 && size > 1.9 * k) {
          hits.push({ x: q.x, y: q.y, r: Math.max(9 * k, size + 5 * k), obj: { type: 'star', data: st } });
        }
      });
      var alphas = [1, 0.9, 0.68, 0.42, 0.2];
      for (i = 0; i < BUCKETS; i++) {
        if (hasP2D) {
          if (!paths[i]) continue;
          g.fillStyle = 'rgba(226,234,248,' + alphas[i] + ')';
          g.fill(paths[i]);
        }
      }
      if (!hasP2D) {
        for (i = 0; i < fb.length; i++) {
          var f = fb[i];
          g.beginPath(); g.arc(f.x, f.y, f.r, 0, Math.PI * 2);
          g.fillStyle = 'rgba(226,234,248,' + alphas[f.b] + ')';
          g.fill();
        }
      }
    })();

    /* ---- 深空天体 ---- */
    var dsoPts = [];
    if (detail || style === 'deep') {
      model.dso.forEach(function (rec) {
        var dd = rec.d, aa = { az: rec.az, alt: rec.alt };
        var q = proj(aa.az, aa.alt);
        if (!q || q.x < -40 || q.x > W + 40 || q.y < -40 || q.y > H + 40) return;
        var r = Math.max(2.2, (dd.mag < 5 ? 4 : dd.mag < 8 ? 3.2 : 2.6) * k);
        g.beginPath();
        g.moveTo(q.x, q.y - r); g.lineTo(q.x + r, q.y);
        g.lineTo(q.x, q.y + r); g.lineTo(q.x - r, q.y); g.closePath();
        g.strokeStyle = 'rgba(186,166,232,0.8)'; g.lineWidth = Math.max(0.6, 0.9 * k); g.stroke();
        g.fillStyle = 'rgba(186,166,232,0.16)'; g.fill();
        dsoPts.push({ d: dd, pt: q });
        hits.push({ x: q.x, y: q.y, r: 11 * k, obj: { type: 'dso', data: dd } });
      });
    }

    /* ---- 星座连线 ---- */
    g.lineWidth = Math.max(0.6, (detail ? 1.1 : 0.9) * k);
    g.strokeStyle = 'rgba(140,170,235,' + (detail ? 0.26 : 0.18) + ')';
    model.cons.forEach(function (rec) {
      rec.segs.forEach(function (sg) {
        var p1 = proj(sg[0], sg[1]), p2 = proj(sg[2], sg[3]);
        if (!p1 || !p2) return;
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.stroke();
      });
    });

    /* ---- 太阳方向（用于照明） ---- */
    var sunPos = model.sun.pos;
    var sunAA = { az: model.sun.az, alt: model.sun.alt };
    var sunQ = proj(sunAA.az, sunAA.alt);

    /* ---- 天体：画成球体 ---- */
    var mp = p.phase || model.moon.phase;
    var INFO = window.BODY_INFO || {};
    var list = [];
    model.planets.forEach(function (rec) {
      list.push({
        kind: 'planet', key: rec.pl.key, name: rec.pl.cn, info: INFO[rec.pl.key] || {},
        ra: rec.pl.ra, dec: rec.pl.dec, dist: rec.pl.dist, mag: rec.pl.mag,
        az: rec.az, alt: rec.alt
      });
    });
    list.push({
      kind: 'moon', key: 'moon', name: '月球', info: INFO.moon || {},
      ra: model.moon.ra, dec: model.moon.dec, mag: -12.7, phase: mp,
      az: model.moon.az, alt: model.moon.alt
    });
    if (sunAA.alt > -3) {
      list.push({
        kind: 'sun', key: 'sun', name: '太阳', info: INFO.sun || {},
        ra: sunPos.ra, dec: sunPos.dec, mag: -26.7, az: sunAA.az, alt: sunAA.alt
      });
    }

    var drawn = [];
    list.forEach(function (b) {
      var aa = { az: b.az, alt: b.alt };
      var q = proj(aa.az, aa.alt);
      if (!q) return;
      if (q.x < -80 || q.x > W + 80) return;
      var scale = (b.info.scale || 0.4);
      var r = Math.max(3.2, 16 * scale * k * (b.kind === 'moon' || b.kind === 'sun' ? 1.55 : 1));
      var below = aa.alt < 0;
      var alpha = below ? 0.35 : 1;

      /* 光照方向：朝太阳 */
      var lx = -0.45, ly = -0.6;
      if (sunQ) {
        var dx = sunQ.x - q.x, dy = sunQ.y - q.y;
        var dl = Math.hypot(dx, dy) || 1;
        lx = dx / dl; ly = dy / dl;
      }

      g.save();
      g.globalAlpha = alpha;

      /* 光晕 */
      var halo = g.createRadialGradient(q.x, q.y, r * 0.8, q.x, q.y, r * 3.4);
      halo.addColorStop(0, hexA(b.info.glow || b.info.color || '#ffffff', 0.24));
      halo.addColorStop(1, hexA(b.info.glow || b.info.color || '#ffffff', 0));
      g.beginPath(); g.arc(q.x, q.y, r * 3.4, 0, Math.PI * 2);
      g.fillStyle = halo; g.fill();

      /* 土星环（后半） */
      if (b.info.ring) {
        g.save();
        g.translate(q.x, q.y); g.rotate(-0.38);
        g.strokeStyle = 'rgba(226,208,164,0.55)';
        g.lineWidth = Math.max(1, r * 0.26);
        g.beginPath(); g.ellipse(0, 0, r * 1.95, r * 0.62, 0, Math.PI, Math.PI * 2); g.stroke();
        g.restore();
      }

      if (b.kind === 'moon') {
        var ang = Math.atan2(ly, lx);
        g.save(); g.translate(q.x, q.y); g.rotate(ang);
        miniMoon(g, 0, 0, r, mp.illum, true);
        g.restore();
      } else {
        var base = b.info.color || '#cfcfcf';
        var sph = g.createRadialGradient(q.x + lx * r * 0.42, q.y + ly * r * 0.42, r * 0.08,
          q.x, q.y, r * 1.06);
        sph.addColorStop(0, mixColor(base, '#ffffff', b.kind === 'sun' ? 0.75 : 0.42));
        sph.addColorStop(0.55, base);
        sph.addColorStop(1, mixColor(base, '#05070d', 0.62));
        g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2);
        g.fillStyle = sph; g.fill();

        /* 木星条纹 */
        if (b.info.bands) {
          g.save();
          g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.clip();
          g.globalAlpha = alpha * 0.28;
          g.fillStyle = '#8f6b45';
          [[-0.42, 0.16], [0.05, 0.20], [0.48, 0.14]].forEach(function (bd) {
            g.fillRect(q.x - r, q.y + bd[0] * r, r * 2, bd[1] * r);
          });
          g.restore();
        }
        /* 地表纹理（火星/金星淡淡一条） */
        if (b.key === 'mars') {
          g.save();
          g.beginPath(); g.arc(q.x, q.y, r, 0, Math.PI * 2); g.clip();
          g.globalAlpha = alpha * 0.22;
          g.fillStyle = '#f2e3d2';
          g.beginPath(); g.ellipse(q.x, q.y - r * 0.75, r * 0.5, r * 0.22, 0, 0, Math.PI * 2); g.fill();
          g.restore();
        }
      }

      /* 土星环（前半） */
      if (b.info.ring) {
        g.save();
        g.translate(q.x, q.y); g.rotate(-0.38);
        g.strokeStyle = 'rgba(236,220,182,0.75)';
        g.lineWidth = Math.max(1, r * 0.26);
        g.beginPath(); g.ellipse(0, 0, r * 1.95, r * 0.62, 0, 0, Math.PI); g.stroke();
        g.restore();
      }

      /* 地平线以下：虚线环标记，仍可点开查看资料 */
      if (below) {
        g.save();
        g.setLineDash([3 * k, 3 * k]);
        g.strokeStyle = hexA(b.info.color || '#ffffff', 0.45);
        g.lineWidth = Math.max(0.8, 1 * k);
        g.beginPath(); g.arc(q.x, q.y, r * 1.34, 0, Math.PI * 2); g.stroke();
        g.restore();
      }

      g.restore();
      b.pt = { x: q.x, y: q.y };
      b.r = r; b.alt = aa.alt; b.az = aa.az; b.below = below;
      drawn.push(b);
      hits.push({ x: q.x, y: q.y, r: Math.max(r * 1.35, 14 * k), obj: { type: b.kind === 'moon' ? 'moon' : b.kind, data: b } });
    });

    /* ---- 地平线与地面 ---- */
    var hzPts = [];
    for (var haz = yaw - 88; haz <= yaw + 88; haz += 1.5) {
      var qh = proj(haz, 0);
      if (!qh) continue;
      hzPts.push(qh);
    }
    hzPts.sort(function (a, b) { return a.x - b.x; });
    if (hzPts.length > 1) {
      var hMin = Math.min.apply(null, hzPts.map(function (q) { return q.y; }));
      /* 只在天穹圆内绘制地面，圆外留黑，避免出现贯穿画面的假地平线 */
      g.save();
      g.beginPath(); g.arc(cx, cy, Rmax, 0, Math.PI * 2); g.clip();

      /* 地平光害：以地平线为中心的柔和带，两侧渐隐避免硬边 */
      var glowH = Math.max(80, H * 0.22);
      var gl = g.createLinearGradient(0, hMin - glowH, 0, hMin + glowH * 0.35);
      gl.addColorStop(0, 'rgba(198,152,98,0)');
      gl.addColorStop(0.62, 'rgba(198,152,98,0.10)');
      gl.addColorStop(0.82, 'rgba(206,160,104,0.20)');
      gl.addColorStop(1, 'rgba(206,160,104,0)');
      g.fillStyle = gl;
      g.fillRect(0, hMin - glowH, W, glowH * 1.35);

      /* 地面底色 */
      g.beginPath();
      g.moveTo(-10, H + 10);
      hzPts.forEach(function (q) { g.lineTo(q.x, q.y); });
      g.lineTo(W + 10, H + 10);
      g.closePath();
      var gnd = g.createLinearGradient(0, hMin, 0, H);
      gnd.addColorStop(0, '#0a1422');
      gnd.addColorStop(0.35, '#050a12');
      gnd.addColorStop(1, '#010204');
      g.fillStyle = gnd;
      g.fill();

      /* 地面方位辐线：从地平线向脚下收敛，给出「站在地表」的纵深 */
      g.strokeStyle = 'rgba(132,172,214,0.15)';
      g.lineWidth = Math.max(0.6, 0.85 * k);
      for (var sa = Math.ceil((yaw - 92) / 30) * 30; sa <= yaw + 92; sa += 30) {
        var sOn = false;
        g.beginPath();
        for (var sAlt = -2; sAlt >= -64; sAlt -= 2) {
          var qs = proj(sa, sAlt);
          if (!qs) { sOn = false; continue; }
          if (!sOn) { g.moveTo(qs.x, qs.y); sOn = true; } else g.lineTo(qs.x, qs.y);
        }
        g.stroke();
      }

      /* 负高度圈：地平面以下的刻度，读起来像脚下的球面 */
      g.strokeStyle = 'rgba(132,172,214,0.12)';
      [-15, -30, -45].forEach(function (altLv) {
        var on2 = false;
        g.beginPath();
        for (var az2 = yaw - 95; az2 <= yaw + 95; az2 += 2) {
          var qa2 = proj(az2, altLv);
          if (!qa2) { on2 = false; continue; }
          if (!on2) { g.moveTo(qa2.x, qa2.y); on2 = true; } else g.lineTo(qa2.x, qa2.y);
        }
        g.stroke();
        var qt = proj(yaw, altLv);
        if (qt && qt.x > 40 && qt.x < W - 40 && qt.y < H - 4) {
          g.textAlign = 'center';
          g.font = '400 ' + Math.max(9, 11 * k) + 'px "PingFang SC",sans-serif';
          g.fillStyle = 'rgba(150,178,210,0.40)';
          g.fillText('−' + Math.abs(altLv) + '°', qt.x, qt.y - 5);
          g.textAlign = 'left';
        }
      });

      /* 两层山脊：远山略亮、近山更暗，形成纵深 */
      function ridge(seed, amp, offset, fill) {
        g.beginPath();
        g.moveTo(-10, H + 10);
        hzPts.forEach(function (q) {
          var t = q.x / W;
          var hgt = offset + Math.sin(t * Math.PI * (2.2 + seed) + seed) * amp
            + Math.sin(t * Math.PI * (6.1 + seed) + seed * 2) * amp * 0.35;
          g.lineTo(q.x, q.y + hgt);
        });
        g.lineTo(W + 10, H + 10);
        g.closePath();
        g.fillStyle = fill;
        g.fill();
      }
      ridge(0.3, H * 0.016, H * 0.004, '#0c1522');
      ridge(1.7, H * 0.028, H * 0.026, '#05080f');

      /* 地平线 */
      g.beginPath();
      hzPts.forEach(function (q, i) { if (i === 0) g.moveTo(q.x, q.y); else g.lineTo(q.x, q.y); });
      g.strokeStyle = 'rgba(226,190,132,0.8)';
      g.lineWidth = Math.max(1.2, 1.4 * k);
      g.stroke();
      g.restore();
    }

    /* ---- 方位标注 ---- */
    g.textAlign = 'center';
    g.font = '500 ' + Math.max(11, 15 * k) + 'px "PingFang SC",sans-serif';
    [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]].forEach(function (dir) {
      var q = proj(dir[1], 0);
      if (!q || q.x < 10 || q.x > W - 10) return;
      g.fillStyle = 'rgba(216,226,244,0.55)';
      g.fillText(dir[0], q.x, q.y + 20 * k);
    });
    g.textAlign = 'left';

    /* ---- 标签（避让） ---- */
    var placed = [];
    function fits(x, y, w, h) {
      for (var i = 0; i < placed.length; i++) {
        var b2 = placed[i];
        if (x < b2.x + b2.w && x + w > b2.x && y < b2.y + b2.h && y + h > b2.y) return false;
      }
      return true;
    }
    function put(text, x, y, font, color, align) {
      g.font = font;
      var w = g.measureText(text).width;
      var bx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
      var hh = parseInt(font.match(/(\d+)px/)[1], 10) + 6;
      if (bx + w > W - 4) bx = W - 4 - w;
      if (bx < 4) bx = 4;
      if (!fits(bx - 4, y - hh + 4, w + 8, hh)) return false;
      placed.push({ x: bx - 4, y: y - hh + 4, w: w + 8, h: hh });
      g.shadowColor = 'rgba(4,7,12,0.95)'; g.shadowBlur = 6;
      g.fillStyle = color;
      g.fillText(text, bx, y);
      g.shadowBlur = 0;
      return true;
    }
    var FS = '500 ' + Math.max(11, 14 * k) + 'px "PingFang SC","Microsoft YaHei",sans-serif';
    var FSsm = '400 ' + Math.max(9.5, 12 * k) + 'px "PingFang SC","Microsoft YaHei",sans-serif';

    if (showLabels) {
      /* 行星名（优先占位） */
      drawn.forEach(function (b) {
        put((b.below ? '↓ ' : '') + b.name + (detail ? ' ' + Math.round(b.alt) + '°' : ''),
          b.pt.x, b.pt.y - b.r - 8 * k, FS,
          hexA(b.info.color || '#ffffff', b.below ? 0.55 : 0.95), 'center');
      });
      /* 高亮目标 */
      if (p.highlight) {
        var ha = A.altAz(p.highlight.ra, p.highlight.dec, jd, lat, lon);
        var hq = proj(ha.az, ha.alt);
        if (hq) {
          g.beginPath(); g.arc(hq.x, hq.y, 15 * k, 0, Math.PI * 2);
          g.strokeStyle = 'rgba(232,200,148,0.85)'; g.lineWidth = 2 * k; g.stroke();
          g.beginPath(); g.arc(hq.x, hq.y, 23 * k, 0, Math.PI * 2);
          g.strokeStyle = 'rgba(232,200,148,0.22)'; g.lineWidth = 1; g.stroke();
          put(p.highlight.label, hq.x, hq.y - 26 * k, FS, '#e8c894', 'center');
        }
      }
      if (detail) {
        dsoPts.sort(function (a, b) { return a.d.mag - b.d.mag; }).forEach(function (x) {
          put(x.d.id.replace('NGC ', 'N'), x.pt.x + 6 * k, x.pt.y + 4 * k, FSsm, 'rgba(198,182,232,0.78)');
        });
        starPts.sort(function (a, b) { return a.s.mag - b.s.mag; }).forEach(function (x) {
          if (x.s.mag < 3.6 && x.alt > 4) {
            put(x.s.cn || x.s.en, x.pt.x + 5 * k, x.pt.y + 4 * k, FSsm, 'rgba(222,229,242,0.6)');
          }
        });
        C.constellations.forEach(function (c) {
          var sx = 0, sy = 0, n = 0;
          c.lines.reduce(function (a, s2) { return a.concat(s2); }, []).forEach(function (kk) {
            var sp = starPts.filter(function (z) { return z.s.k === kk; })[0];
            if (!sp || sp.alt < 12) return;
            sx += sp.pt.x; sy += sp.pt.y; n++;
          });
          if (n >= 3) {
            put(c.cn.replace('（北斗七星）', '') + ' ' + c.abbr, sx / n, sy / n,
              'italic 400 ' + Math.max(11, 14 * k) + 'px Georgia,"Songti SC",serif',
              'rgba(152,176,222,0.32)', 'center');
          }
        });
      }
    }

    /* ---- 地球小窗 ---- */
    if (p.showGlobe) {
      var gr = Math.min(W, H) * 0.075;
      drawGlobe(g, W - gr - 14, gr + 14, gr, lat, lon, jd, Math.max(0.7, gr / 46), compact);
    }

    canvas._hits = hits;
    canvas._bodies = drawn;
    canvas._meta = { yaw: yaw, pitch: pitch, fov: fov, hz: (typeof hzPts !== 'undefined' ? hzPts.length : -1), hit: true };
    if (perfT0) perfPush('sky', performance.now() - perfT0);
  }

  /* 星图内的小月相 */
  function miniMoon(g, x, y, r, illum, waxing) {
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.fillStyle = '#eae5d7'; g.fill();
    g.clip();
    var c = (1 - 2 * illum) * r;
    g.fillStyle = 'rgba(5,8,14,0.95)';
    for (var dx = -r; dx <= r; dx += 0.8) {
      var chord = Math.sqrt(Math.max(0, r * r - dx * dx));
      var spans = [];
      if (Math.abs(c) < 0.5) { if (dx >= 0) spans.push([-chord, chord]); }
      else if (c > 0) {
        if (dx > 0) {
          var t1 = dx / c;
          if (t1 >= 1) spans.push([-chord, chord]);
          else { var y1 = r * Math.sqrt(1 - t1 * t1); spans.push([-chord, -y1], [y1, chord]); }
        }
      } else {
        if (dx >= 0) spans.push([-chord, chord]);
        else {
          var t2 = dx / c;
          if (t2 < 1) { var y2 = r * Math.sqrt(1 - t2 * t2); spans.push([-y2, y2]); }
        }
      }
      spans.forEach(function (sp) {
        if (sp[1] - sp[0] > 0.3) g.fillRect(x + dx, y + sp[0], 0.9, sp[1] - sp[0]);
      });
    }
    if (!waxing) { /* 已按 waxing 绘制，亏月时整体镜像 */ }
    g.restore();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(234,229,215,0.5)'; g.lineWidth = 0.8; g.stroke();
  }

  /* 地球小窗：以观测者为球心，含昼夜线与「你在这里」 */
  function drawGlobe(g, cx, cy, R, lat, lon, jd, k, compact) {
    var D = A.RAD;
    var sun = A.sun(jd);
    var gmst = A.lstHours(jd, 0) * 15;
    var subLon = A.norm180(sun.ra * 15 - gmst);
    var subLat = sun.dec;

    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();

    var sea = g.createRadialGradient(cx - R * 0.3, cy - R * 0.35, R * 0.2, cx, cy, R);
    sea.addColorStop(0, '#1c3b57');
    sea.addColorStop(1, '#0b1a2a');
    g.fillStyle = sea;
    g.fillRect(cx - R, cy - R, R * 2, R * 2);

    /* 经纬网 */
    function proj(latD, lonD) {
      var dL = (lonD - lon) * D, p1 = latD * D, p0 = lat * D;
      var x = Math.cos(p1) * Math.sin(dL);
      var y = Math.cos(p0) * Math.sin(p1) - Math.sin(p0) * Math.cos(p1) * Math.cos(dL);
      var z = Math.sin(p0) * Math.sin(p1) + Math.cos(p0) * Math.cos(p1) * Math.cos(dL);
      return { x: cx + x * R, y: cy - y * R, vis: z > 0 };
    }
    g.strokeStyle = 'rgba(160,200,235,0.18)';
    g.lineWidth = Math.max(0.5, 0.7 * k);
    for (var la = -60; la <= 60; la += 30) {
      g.beginPath();
      var started = false;
      for (var lo = -180; lo <= 180; lo += 6) {
        var q = proj(la, lo);
        if (!q.vis) { started = false; continue; }
        if (!started) { g.moveTo(q.x, q.y); started = true; } else g.lineTo(q.x, q.y);
      }
      g.stroke();
    }
    for (var lo2 = -180; lo2 < 180; lo2 += 30) {
      g.beginPath();
      var st2 = false;
      for (var la2 = -90; la2 <= 90; la2 += 6) {
        var q2 = proj(la2, lo2);
        if (!q2.vis) { st2 = false; continue; }
        if (!st2) { g.moveTo(q2.x, q2.y); st2 = true; } else g.lineTo(q2.x, q2.y);
      }
      g.stroke();
    }

    /* 昼夜：采样网格填充夜半球 */
    g.fillStyle = 'rgba(2,6,14,0.62)';
    var step = 5;
    for (var lt = -85; lt <= 85; lt += step) {
      for (var ln = -180; ln < 180; ln += step) {
        var sLat = lt * D, sLon = (ln - subLon) * D;
        var cosZ = Math.sin(lat * D) * Math.sin(sLat) +
          Math.cos(lat * D) * Math.cos(sLat) * Math.cos((ln - lon) * D);
        var sunElev = Math.sin(sLat) * Math.sin(subLat * D) +
          Math.cos(sLat) * Math.cos(subLat * D) * Math.cos(sLon);
        if (sunElev > 0) continue;
        var q3 = proj(lt, ln);
        if (!q3.vis) continue;
        var cell = R * step * D * 1.6;
        g.fillRect(q3.x - cell / 2, q3.y - cell / 2, cell * 1.15, cell * 1.15);
      }
    }

    /* 观测者（球心） */
    g.beginPath(); g.arc(cx, cy, Math.max(2, 2.2 * k), 0, Math.PI * 2);
    g.fillStyle = '#ffd79a'; g.fill();
    g.beginPath(); g.arc(cx, cy, Math.max(5, 6 * k), 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,215,154,0.5)'; g.lineWidth = 1; g.stroke();

    g.restore();

    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(180,205,235,0.35)'; g.lineWidth = Math.max(0.6, 0.8 * k); g.stroke();

    if (!compact) {
      g.font = '400 ' + (11 * k) + 'px "PingFang SC",sans-serif';
      g.fillStyle = 'rgba(196,210,230,0.6)';
      g.textAlign = 'center';
      g.fillText('你在这里', cx, cy + R + 14 * k);
      g.textAlign = 'left';
    }
  }

  function drawMoon(canvas, ph) {
    var g = canvas.getContext('2d');
    var W = canvas.width, H = canvas.height;
    var cx = W / 2, cy = H / 2, R = Math.min(W, H) * 0.40;
    g.clearRect(0, 0, W, H);

    var glow = g.createRadialGradient(cx, cy, R * 0.7, cx, cy, R * 1.75);
    glow.addColorStop(0, 'rgba(232,228,216,0.13)');
    glow.addColorStop(1, 'rgba(232,228,216,0)');
    g.beginPath(); g.arc(cx, cy, R * 1.75, 0, Math.PI * 2); g.fillStyle = glow; g.fill();

    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = '#12141b'; g.fill();

    var k = Math.max(0, Math.min(1, ph.illum));
    var c = (1 - 2 * k) * R;

    g.save();
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.clip();
    if (!ph.waxing) { g.translate(cx, cy); g.scale(-1, 1); g.translate(-cx, -cy); }
    g.fillStyle = '#e9e4d6';

    for (var x = -R; x <= R; x += 1) {
      var chord = Math.sqrt(Math.max(0, R * R - x * x));
      var spans = [];
      if (Math.abs(c) < 0.6) {
        if (x >= 0) spans.push([-chord, chord]);
      } else if (c > 0) {
        if (x > 0) {
          var t = x / c;
          if (t >= 1) spans.push([-chord, chord]);
          else {
            var y0 = R * Math.sqrt(1 - t * t);
            spans.push([-chord, -y0], [y0, chord]);
          }
        }
      } else {
        if (x >= 0) spans.push([-chord, chord]);
        else {
          var t2 = x / c;
          if (t2 < 1) {
            var y1 = R * Math.sqrt(1 - t2 * t2);
            spans.push([-y1, y1]);
          }
        }
      }
      for (var i = 0; i < spans.length; i++) {
        var s0 = spans[i];
        var hgt = s0[1] - s0[0];
        if (hgt <= 0.4) continue;
        g.fillRect(cx + x, cy + s0[0], 1.15, hgt);
      }
    }

    /* 月海纹理 */
    g.globalAlpha = 0.10;
    g.fillStyle = '#8d8779';
    [[-0.25, -0.15, 0.30], [0.12, 0.22, 0.22], [-0.05, 0.35, 0.14], [0.30, -0.25, 0.16]].forEach(function (m) {
      g.beginPath(); g.arc(cx + m[0] * R, cy + m[1] * R, m[2] * R, 0, Math.PI * 2); g.fill();
    });
    g.globalAlpha = 1;
    g.restore();

    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.stroke();
  }


  /* ================= 观测台 ================= */
  function refreshPanels() {
    state.ctx = readCtx();
    var key = [state.ctx.y, state.ctx.mo, state.ctx.d, state.ctx.h, state.ctx.mi, state.ctx.city].join('|');
    if (key !== state.cacheKey) { state.cacheKey = key; state.preview = AC.preview(state.ctx); }
    var pv = state.preview, ctx = state.ctx;
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var top = pv.list[0];

    drawSky($('#sky'), {
      jd: jd, lat: ctx.lat, lon: ctx.lon,
      highlight: top ? { ra: top.ra, dec: top.dec, label: top.name } : null,
      phase: pv.moon, style: state.settings.skymap,
      yaw: top ? A.altAz(top.ra, top.dec, jd, ctx.lat, ctx.lon).az : 180,
      pitch: 40, fov: 150, compact: true, showGlobe: true
    });
    $('#skyMeta').textContent = A.fmtHM(jd, ctx.tz) + ' · ' + ctx.city;
    $('#ctxBadge').textContent = state.settings.showJD ? 'JD ' + jd.toFixed(2) : '本地';

    var list = $('#tonightList');
    list.innerHTML = '';
    pv.list.forEach(function (it, i) {
      var row = el('div', 'mini-item');
      row.innerHTML = '<span class="r">' + pad(i + 1) + '</span><span class="n">' + esc(it.name) + '</span>' +
        '<span class="m">' + Math.round(it.maxAlt) + '° · ' + A.fmtHM(it.peak, ctx.tz) + '</span>';
      row.addEventListener('click', function () { ask('在' + ctx.city + '今晚怎么找' + it.name + '？'); });
      var add = el('button', 'mini-btn add-plan', '＋');
      add.title = '加入观测清单';
      add.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePlan({
          name: it.name, sub: '今晚推荐 · ' + ctx.city, mag: it.mag, alt: it.maxAlt,
          ra: it.ra, dec: it.dec
        });
      });
      row.appendChild(add);
      list.appendChild(row);
    });
    $('#tonightMeta').textContent = pv.list.length + ' 个目标';
    renderCatalog();
    renderPlan();

    var midnight = A.fromLocal(ctx.y, ctx.mo, ctx.d, 0, 0, ctx.tz);
    var mtr = A.track(pv.moon.ra, pv.moon.dec, midnight, ctx.lat, ctx.lon);
    drawMoon($('#moonCanvas'), pv.moon);
    $('#moonInfo').innerHTML =
      '<div class="row"><span>月相</span><b>' + pv.moon.name + '</b></div>' +
      '<div class="row"><span>照亮</span><b>' + Math.round(pv.moon.illum * 100) + '%</b></div>' +
      '<div class="row"><span>暗夜</span><b>' + A.fmtHM(pv.darkStart, ctx.tz) + '–' + A.fmtHM(pv.darkEnd, ctx.tz) + '</b></div>' +
      '<div class="row"><span>月升落</span><b>' + A.fmtHM(mtr.rise, ctx.tz) + ' / ' + A.fmtHM(mtr.set, ctx.tz) + '</b></div>';

    /* 全屏星图若开着，跟随时间/地点同步刷新 */
    if ($('#viewer').classList.contains('on')) {
      renderBodyRail();
      drawViewer();
    }
  }

  /* ================= 侧栏 ================= */
  function renderSources() {
    var box = $('#sideSources');
    box.innerHTML = '';
    S.list().slice(0, 5).forEach(function (src) {
      var b = el('button', 'src-item' + (src.id === state.settings.sourceId ? ' on' : ''));
      b.innerHTML =
        '<span class="dot ' + statusTone(src.status) + '" style="width:7px;height:7px"></span>' +
        '<span class="meta"><span class="nm">' + esc(src.name) + '</span>' +
        '<span class="sb">' + esc(src.type === 'local' ? '本地 · 离线' : src.status.msg) + '</span></span>' +
        '<span class="st">' + (src.type === 'local' ? '' : src.status.state === 'ready' ? '已连' : '未连') + '</span>';
      b.addEventListener('click', function () { selectSource(src.id); });
      box.appendChild(b);
    });
    var more = el('button', 'src-more', '查看全部 ' + S.list().length + ' 个来源与能力差异');
    more.addEventListener('click', function () { openPop($('#sourceChip')); });
    box.appendChild(more);

    var cur = sourceById(state.settings.sourceId);
    $('#chipName').textContent = cur.name;
    $('#chipTag').textContent = cur.type === 'local' ? '本地' : (cur.status.state === 'ready' ? '云端' : '未连');
    $('#chipDot').className = 'dot ' + statusTone(cur.status);
    $('#pillName').textContent = cur.name;
    $('#pillDot').className = 'dot ' + statusTone(cur.status);
    $('#compHint').textContent = state.settings.mode === 'compare'
      ? '并行对比 · 事实层统一'
      : cur.type === 'local' ? '事实层由本地核验'
        : cur.type === 'web' ? '检索结果并入答案' : '云端仅负责表述';

    var cmpBtn = $('#modeSeg button[data-mode="compare"]');
    if (cmpBtn) {
      cmpBtn.disabled = false;
      cmpBtn.title = '本地表述与联网检索、已连接模型并排对照';
    }
  }

  function selectSource(id) {
    state.settings.sourceId = id;
    persist();
    renderSources();
    var src = sourceById(id);
    if ((src.type === 'cloud' || src.type === 'device') && !src.hasKey) {
      toast('「' + src.name + '」尚未配置密钥，本次仍由本地内核生成');
    }
  }

  function renderAgents() {
    AC.setCustomAgents(state.custom);
    var box = $('#agentList');
    box.innerHTML = '';
    AC.AGENTS.filter(function (a) { return !a.custom; }).forEach(function (a) { box.appendChild(agentRow(a, false)); });
    state.custom.forEach(function (a) { box.appendChild(agentRow(a, true)); });
  }
  function agentRow(a, isCustom) {
    var b = el('button', 'agent' + (isCustom ? ' custom' : '') + (a.enabled === false ? ' off' : ''));
    b.dataset.id = a.id;
    b.innerHTML =
      '<span class="sg" style="color:' + esc(a.color) + '">' + esc(a.sigil) + '</span>' +
      '<span class="meta"><span class="nm">' + esc(a.name) + (a.cn ? ' · ' + esc(a.cn) : '') + '</span>' +
      '<span class="rl">' + esc(a.role || '') + '</span></span>';
    b.addEventListener('click', function () { openAgent(a.id); });
    return b;
  }

  /* ================= 输入框位置 ================= */
  function mountComposer(where) {
    var c = $('#composer');
    if (where === 'hero') {
      $('#heroSlot').appendChild(c);
      $('#dock').style.display = 'none';
      $('#hero').style.display = '';
    } else {
      $('#dock').insertBefore(c, $('#dock').querySelector('.dock-note'));
      $('#dock').style.display = '';
      $('#hero').style.display = 'none';
    }
    state.composerAt = where;
  }

  function newChat() {
    /* 必须重置当前线程：否则下一问会继续写进上一个会话 */
    if (window.Thread) window.Thread.setCurrent(null);
    $('#thread').innerHTML = '';
    state.asked = false;
    state.memory = [];
    AC.clearMemory();
    mountComposer('hero');
    $('#scroll').scrollTop = 0;
    $('#input').value = '';
    $('#input').focus();
    if (window.innerWidth <= 860) { $('#sidebar').classList.remove('on'); }
    renderThreadList();
  }

  /* ================= 来源浮层 ================= */
  function openPop(anchor) {
    var pop = $('#sourcePop');
    renderPopBody();
    pop.classList.add('on');
    pop.style.left = '0px';
    pop.style.top = '0px';
    var r = anchor.getBoundingClientRect();
    var w = pop.offsetWidth || 396, h = pop.offsetHeight || 420;
    var left = Math.min(Math.max(12, r.left), window.innerWidth - w - 12);
    var below = window.innerHeight - r.bottom - 16;
    var top = below >= Math.min(h, 320) ? r.bottom + 8 : Math.max(12, r.top - h - 8);
    pop.style.left = left + 'px';
    pop.style.top = top + 'px';
    $('#scrim').classList.add('on');
  }
  function closePop() {
    $('#sourcePop').classList.remove('on');
    if (!$('#drawer').classList.contains('on') && !$('#settings').classList.contains('on')
      && !$('#sidebar').classList.contains('on') && !$('#obsPanel').classList.contains('on')) {
      $('#scrim').classList.remove('on');
    }
  }

  function renderPopBody() {
    var body = $('#popBody');
    body.innerHTML = '';
    var all = S.list();
    [{ key: 'local', title: '本地策略 · 免配置 · 离线可用' },
    { key: 'device', title: '本机模型 · 免密钥 · 不出设备' },
    { key: 'cloud', title: '云端模型 · 需密钥 · 仅负责表述' }].forEach(function (g) {
      var items = all.filter(function (x) { return x.type === g.key; });
      if (!items.length) return;
      body.appendChild(el('div', 'pop-group', g.title));
      items.forEach(function (src) {
        var b = el('button', 'src-opt' + (src.id === state.settings.sourceId ? ' on' : ''));
        b.innerHTML =
          '<span class="av" style="background:' + esc(src.dot) + '">' + esc(initials(src)) + '</span>' +
          '<span class="body"><span class="line1"><span class="nm">' + esc(src.name) + '</span>' +
          '<span class="stt ' + statusTone(src.status) + '">' + esc(src.status.msg) + '</span></span>' +
          '<span class="vd">' + esc(src.vendor) + (src.model ? ' · ' + esc(src.model) : '') + '</span>' +
          '<span class="caps">' + src.caps.map(function (c) { return '<span class="cap">' + esc(c) + '</span>'; }).join('') + '</span>' +
          '<span class="desc">' + esc(src.desc) + '</span></span>';
        b.addEventListener('click', function () {
          selectSource(src.id);
          renderPopBody();
          closePop();
        });
        body.appendChild(b);
      });
    });
    $('#popHint').textContent = state.settings.mode === 'compare'
      ? '对比模式：本地与已连接云端并排'
      : '切换来源不会改变任何数值';
  }

  /* ================= 对话渲染 ================= */
  /* ============================================================
     术语双轨：科普模式用白话，专业模式保留研究术语。
     「可溯源 / 待核验」这套词不废弃 —— 研究模式下原样呈现，
     这是本项目「可追溯」契约的一部分。
     ============================================================ */
  var CURRENT_REG = 'pop';   /* 由 renderAnswer 设置，供各渲染函数取用 */
  var CURRENT_TIER = 'infer'; /* 同理：失败态与正常态用不同版式 */

  var TERM_PAIRS = [
    [/可溯源/g, '已核对'],
    [/待核验/g, '待复核'],
    [/俯仰/g, '检索'],
    [/子问题已覆盖/g, '已获得足够资料'],
    [/达到轮数上限/g, '检索轮数已达上限'],
    [/达到调用上限/g, '检索次数已达上限'],
    [/超出时间预算/g, '检索用时已达上限'],
    [/无新增结果/g, '没有新的结果'],
    [/无可提取锚点/g, '没有可用的关键词'],
    [/无待补子问题/g, '没有需要补充的方向'],
    [/无可用检索词/g, '没有可用的检索词'],
    [/证据架构/g, '如何核对'],
    [/证据规约/g, '核对方法'],
    [/证据摘要/g, '核对结果'],
    [/已成共识/g, '公认'],
    [/前沿研究/g, '有新证据'],
    [/未定论/g, '尚存争议'],
    [/严格证据门槛下/g, '按严格标准筛过后']
  ];

  /* 只用于「我们自己写的结构性文字」——
   * 原文引用、事实数值一律不经过这里，避免改写来源原话。 */
  function tn(s, reg) {
    var txt = String(s == null ? '' : s);
    if ((reg || CURRENT_REG) === 'pro') return txt;
    TERM_PAIRS.forEach(function (p) { txt = txt.replace(p[0], p[1]); });
    return txt;
  }

  /* 长引用拆句：不改编原文，只按句切分成要点行；超出的部分折叠，不丢内容 */
  function splitQuote(txt) {
    var s = String(txt || '').trim();
    if (!s) return { lines: [], rest: '' };
    var parts = s.split(/(?<=[。！？；])/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length <= 1 && s.length > 60) {
      parts = s.split(/[，,]/).map(function (x) { return x.trim(); }).filter(Boolean);
    }
    return { lines: parts.slice(0, 3), rest: parts.length > 3 ? parts.slice(3).join('') : '' };
  }

  function quoteBlock(txt) {
    var q = splitQuote(txt);
    if (!q.lines.length) return '';
    if (q.lines.length === 1 && !q.rest) {
      return '<div class="sp-quote">' + esc(q.lines[0]) + '</div>';
    }
    var html = '<ul class="sp-qs">';
    q.lines.forEach(function (l) { html += '<li>' + esc(l) + '</li>'; });
    html += '</ul>';
    if (q.rest) {
      html += '<details class="sp-rest"><summary>余下原文（' + q.rest.length + ' 字）</summary>' +
        '<div>' + esc(q.rest) + '</div></details>';
    }
    return html;
  }

  /* 复制文本。顺序刻意如此：
   * 1) 先试同步的 execCommand —— 不受安全上下文与用户激活限制，反馈是即时的
   * 2) 失败再走 clipboard API，并加 800ms 超时兜底（无用户激活时它可能永远不 settle）
   * 3) 都失败才提示手动选中
   * 按钮短暂改为「已复制」并禁用，避免连点。 */
  function copyText(txt, btn) {
    var settled = false;
    function done(ok) {
      if (settled) return;
      settled = true;
      if (!btn) return;
      var old = btn.textContent;
      btn.textContent = ok ? '已复制' : '请手动选中';
      btn.disabled = true;
      setTimeout(function () { btn.textContent = old; btn.disabled = false; }, 1400);
    }
    /* 1) 同步路径 */
    var ok = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = txt;
      ta.style.position = 'fixed';
      ta.style.top = '-1000px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      ok = document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (e) { ok = false; }
    if (ok) { done(true); return; }

    /* 2) 异步路径 + 超时兜底 */
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(
        function () { done(true); },
        function () { done(false); }
      );
      setTimeout(function () { done(false); }, 800);
    } else {
      done(false);
    }
  }

  /* 用户气泡的唯一构造入口：实时发送与历史恢复共用，避免两条路径长得不一样 */
  function userBubble(text, atts) {
    var u = el('div', 'msg user');
    var uWrap = el('div', 'u-wrap');
    var bubble = el('div', 'bubble', esc(text));
    uWrap.appendChild(bubble);
    if (atts && atts.length) {
      var strip = el('div', 'ubble-atts');
      atts.forEach(function (it) {
        var c = el('span', 'ubble-att');
        c.innerHTML = (it.kind === 'image' && it.thumb)
          ? '<img alt="" src="' + esc(it.thumb) + '">'
          : '<span class="at">' + esc((it.ext || it.kind || '').replace('.', '').slice(0, 4).toUpperCase()) + '</span>';
        c.appendChild(el('span', 'nmx', esc(it.name || '')));
        strip.appendChild(c);
      });
      uWrap.appendChild(strip);
    }
    uWrap.appendChild(userActions(text, u, bubble));
    u.appendChild(uWrap);
    return u;
  }
  /* 用户消息的操作条：复制 / 重新编辑 */
  function userActions(text, msgEl, bubbleEl) {
    var bar = el('div', 'u-acts');
    var cp = el('button', 'u-act', '复制');
    cp.type = 'button';
    cp.title = '复制这条提问';
    cp.addEventListener('click', function () { copyText(text, cp); });
    var ed = el('button', 'u-act', '重新编辑');
    ed.type = 'button';
    ed.title = '修改后重新发送';
    ed.addEventListener('click', function () { startEdit(text, msgEl, bubbleEl); });
    bar.appendChild(cp);
    bar.appendChild(ed);
    return bar;
  }

  /* 就地编辑：回车重发、Esc 取消。
   * 守卫：空内容 / 纯符号 / 超长 / 生成中 / 内容未变 —— 每种都给明确提示，不静默失败。 */
  function startEdit(text, msgEl, bubbleEl) {
    if (msgEl.querySelector('.u-edit')) return;      /* 已在编辑态，避免重复打开 */
    var box = el('div', 'u-edit');
    var ta = el('textarea', 'u-ta');
    ta.value = text;
    ta.rows = Math.min(7, Math.max(2, Math.ceil(text.length / 26)));
    box.appendChild(ta);

    var ops = el('div', 'u-edit-ops');
    var ok = el('button', 'u-btn primary', '重新发送');
    ok.type = 'button';
    var cancel = el('button', 'u-btn', '取消');
    cancel.type = 'button';
    var tip = el('span', 'u-tip', '');
    ops.appendChild(ok);
    ops.appendChild(cancel);
    ops.appendChild(tip);
    /* 原消息带附件时必须提醒：重发只发文字，附件不会跟着走 */
    if (msgEl.querySelector('.ubble-atts')) {
      ops.appendChild(el('span', 'u-tip note', '原附件不会随重发一起发送'));
    }
    box.appendChild(ops);

    bubbleEl.style.display = 'none';
    msgEl.querySelector('.u-wrap').appendChild(box);
    ta.focus();
    ta.select();

    function close() {
      box.remove();
      bubbleEl.style.display = '';
    }

    var fired = false;   /* 幂等：同一次编辑只提交一次，避免回车与点击叠加导致重复发送 */

    function submit() {
      if (fired) return;
      var norm = normalizeQuery(ta.value, { overflow: 'reject' });
      if (!norm.ok) { tip.textContent = norm.msg; return; }
      var v = norm.text;
      if (v === text) { tip.textContent = '内容没有变化'; return; }
      if (state.busy) { tip.textContent = '正在生成，请稍后再试'; return; }
      fired = true;
      msgEl.classList.add('edited');   /* 旧消息留痕：已重新编辑 */
      close();
      ask(v);                          /* 修改后直接重发 */
    }

    ok.addEventListener('click', submit);
    cancel.addEventListener('click', close);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    });
    ta.addEventListener('input', function () {
      if (tip.textContent) tip.textContent = '';
    });
  }

  function renderTrace(trace) {
    /* 检索过程属细节层：默认折叠，不占首屏 */
    var box = el('details', 'trace-fold');
    box.appendChild(el('summary', '', '检索过程 · ' + trace.length + ' 步'));
    var t = el('div', 'trace');
    trace.forEach(function (s, i) {
      var a = AC.AGENT_BY_ID[s.agent] || AC.AGENTS[0];
      var chip = el('span', 't');
      chip.style.animationDelay = (i * 0.05).toFixed(2) + 's';
      /* 契约二：执行结果必须可见，不允许静默降级 */
      var mark = '';
      if (s.ok === false) mark = '<span class="tmark bad">×</span>';
      else if (s.check && s.check.passed === false) mark = '<span class="tmark warn">!</span>';
      else if (s.check && s.check.passed === true) mark = '<span class="tmark ok">✓</span>';
      if (s.check && s.check.detail) chip.title = s.check.name + '：' + s.check.detail;
      chip.innerHTML = mark + '<span class="s" style="color:' + esc(a.color) + '">' + esc(a.sigil) + '</span>' +
        '<span class="a">' + esc(a.name) + '</span><span class="d">' + esc(tn(s.action)) + '</span>' +
        (s.tool ? '<span class="tool">' + esc(s.tool) + '</span>' : '');
      t.appendChild(chip);
    });
    box.appendChild(t);
    return box;
  }

  function answerHead(ans, info) {
    var head = el('div', 'answer-head');
    var src = sourceById(state.settings.sourceId);
    var mem = ans.meta && ans.meta.memory;
    /* 契约一：档位徽标让读者一眼知道「这个答案是算出来的、查来的、还是解释」 */
    var tierKey = (ans.meta && ans.meta.tier) || 'infer';
    var tier = window.AstroRuntime ? window.AstroRuntime.tierOf(tierKey) : { label: '', hint: '' };
    var factText = {
      compute: '本地计算 · 可复算',
      fetch: '外部数据 · 附出处',
      infer: '本地知识库 · 有出处',
      unknown: '无可靠依据',
      chat: '无需检索'
    }[tierKey] || '本地星历 + 知识库';
    head.innerHTML =
      '<span class="lbl">依据</span><span class="srcbadge t-' + esc(tierKey) + '" title="' + esc(tier.hint) + '">' +
      '<span class="dot ' + (tierKey === 'unknown' ? 'warn' : 'ok') + '"></span>' + esc(factText) + '</span>' +
      '<span class="lbl">表述</span><span class="srcbadge' + ((src.type === 'cloud' || src.type === 'device') ? ' model' : '') + '"><span class="dot ' +
      ((src.type === 'cloud' || src.type === 'device') ? 'accent' : 'ok') + '"></span>' +
      (state.settings.mode === 'compare' ? '并行对比' : esc(src.name)) + '</span>' +
      (mem && mem.resolved ? '<span class="srcbadge mem"><span class="dot accent"></span>承接上文：' + esc(mem.resolved) + '</span>' : '') +
      (info && info.latency ? '<span class="spacer"></span><span class="lat">' + info.latency + ' ms</span>' : '');
    return head;
  }

  function metaBar(ans) {
    var m = ans.meta || {};
    var bits = [];
    if (state.settings.showConfidence && m.confidence) {
      var conf = Math.round(m.confidence * 100);
      bits.push('<span class="conf">置信度 <span class="track"><span class="fill" style="width:' + conf +
        '%;background:' + (conf > 80 ? 'var(--green)' : conf > 60 ? 'var(--amber)' : 'var(--red)') + '"></span></span> ' +
        (conf / 100).toFixed(2) + '</span>');
    }
    if (m.status) bits.push('<span class="st st-' + m.status + '">' + statusLabel(m.status) + '</span>');
    if (m.freshness) bits.push('<span class="chip">' + ({ static: '长期稳定', annual: '年度表', ephemeris: '实时计算', realtime: '需在线' }[m.freshness] || '—') + '</span>');
    if (m.verified) bits.push('<span class="chip">核验 ' + esc(m.verified) + '</span>');
    if (m.agents && state.settings.showTrace) bits.push('<span class="chip">' + m.agents.length + ' agents</span>');
    var now = new Date();
    var bar = el('div', 'meta-bar');
    bar.innerHTML = bits.join('') + '<span class="spacer"></span><span>' + pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' · 本地引擎</span>';
    return bar;
  }

  function sectionNode(s) {
    var wrap = el('div', 'sec');
    if (s.kind === 'verdict') {
      wrap.className = 'sec sec-verdict' + (CURRENT_TIER === 'unknown' ? ' quiet' : '');
      wrap.innerHTML = '<p class="head">' + esc(s.head) + '</p>' + (s.sub ? '<p class="sub">' + esc(s.sub) + '</p>' : '');
    } else if (s.kind === 'evidence') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '依据') +
        (s.status ? '<span class="st st-' + s.status + '">' + statusLabel(s.status) + '</span>' : '') + '</div>';
      /* 数据分级：含数值的进「关键数据」表并突出显示，
       * 纯文字说明（类型、成因等）下沉为小字元信息，不再与数值争夺注意力。 */
      var dataItems = [], metaItems = [];
      (s.items || []).forEach(function (it) {
        (/[0-9]/.test(String(it.value)) ? dataItems : metaItems).push(it);
      });
      function fillKv(box, list) {
        list.forEach(function (it) {
          box.appendChild(el('div', 'k', esc(it.label)));
          box.appendChild(el('div', 'v', esc(it.value)));
        });
        return box;
      }
      if (dataItems.length) {
        wrap.appendChild(fillKv(el('div', 'kv kv-data'), dataItems.slice(0, 5)));
        if (dataItems.length > 5) {
          var moreD = el('details', 'kv-more');
          moreD.appendChild(el('summary', '', '另外 ' + (dataItems.length - 5) + ' 项数据'));
          moreD.appendChild(fillKv(el('div', 'kv kv-data'), dataItems.slice(5)));
          wrap.appendChild(moreD);
        }
      }
      if (metaItems.length) {
        wrap.appendChild(fillKv(el('div', 'kv kv-meta'), metaItems));
      }
      if (s.para) {
        var p = el('div', 'para');
        p.innerHTML = '<span class="tag">' + (s.register === 'pro' ? 'pro · 专业表述' : 'pop · 科普表述') + '</span>' + esc(s.para);
        wrap.appendChild(p);
      }
      if (s.sources && s.sources.length) {
        wrap.appendChild(el('div', 'sec-note', '来源：' + s.sources.map(function (x) { return esc(x.n); }).join(' · ')));
      }
    } else if (s.kind === 'gap') {
      /* 失败态专用：三行说明，不用标题、不用卡片、不用科普表述框。
       * 只为说清「缺什么 / 去哪拿 / 我能做」，排版越轻越好。 */
      wrap.className = 'sec sec-gap';
      var gbox = el('div', 'gap-list');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'gap-row');
        row.innerHTML = '<span class="gk">' + esc(it.k) + '</span>' +
          '<span class="gv">' + esc(it.v) + '</span>';
        gbox.appendChild(row);
      });
      wrap.appendChild(gbox);
    } else if (s.kind === 'gearfit') {
      /* 方案 A：器材匹配。四个可复算的量 + 逐项自检 */
      wrap.className = 'sec sec-gearfit';
      var f = s.fit;
      var tone = f.verdict ? f.verdict.tone : 'warn';
      wrap.innerHTML = '<div class="sec-title">器材匹配<span class="gf-st gf-' + tone + '">' +
        esc(f.verdict ? f.verdict.label : '仅参数') + '</span></div>';
      var rows = [['器材', f.gear.name]];
      if (f.fov) rows.push(['视场', f.fov.w + '° × ' + f.fov.h + '°']);
      if (f.targetSizeArcmin) rows.push(['目标角径', f.targetSizeArcmin + '′']);
      if (f.ratio != null) rows.push(['占视场', '长边 ' + f.ratio + '%' + (f.ratioShort != null ? ' · 短边 ' + f.ratioShort + '%' : '')]);
      if (f.pixelScale) rows.push(['像元比例', f.pixelScale + '″/px']);
      if (f.sampleIdeal && f.sampleVerdict) rows.push(['像元采样', f.sampleVerdict + ' · 建议 ' + f.sampleIdeal + '″/px']);
      rows.push(['极限星等', f.limitingMag + ' 等']);
      rows.push(['单张上限', f.exposure + ' 秒（Bortle ' + f.bortle + '）']);
      var gtab = el('div', 'gf-table');
      rows.forEach(function (r) {
        var row = el('div', 'gfr');
        row.innerHTML = '<span class="gk">' + esc(r[0]) + '</span><span class="gv">' + esc(String(r[1])) + '</span>';
        gtab.appendChild(row);
      });
      wrap.appendChild(gtab);
      (f.checks || []).forEach(function (c) {
        var line = el('div', 'gf-check' + (c.ok ? '' : ' bad'));
        line.innerHTML = '<span class="ic">' + (c.ok ? '✓' : '!') + '</span>' +
          '<span class="k">' + esc(c.name) + '</span><span class="v">' + esc(c.detail) + '</span>';
        wrap.appendChild(line);
      });
      /* 技能复用提示：让「这次沿用了上次的器材」可见，而不是偷偷用 */
      if (s.reused) {
        var rr = el('div', 'gf-check');
        rr.innerHTML = '<span class="ic">↺</span><span class="k">沿用</span><span class="v">上次用的 ' +
          esc(f.gear.name) + '（第 ' + s.reused.n + ' 次）</span>';
        wrap.appendChild(rr);
      }
    } else if (s.kind === 'query') {
      /* 方案 B：可复现查询。不联网执行，只交付可复制复跑的语句与直达链接 */
      wrap.className = 'sec sec-query';
      var q = s.query;
      wrap.innerHTML = '<div class="sec-title">可复现查询<span class="st st-established">' +
        esc(q.coord.epoch) + '</span></div>';
      wrap.appendChild(el('div', 'q-coord', 'RA ' + esc(q.coord.ra) + '　Dec ' + esc(q.coord.dec)));
      (q.queries || []).forEach(function (qq) {
        var d = el('details', 'q-block');
        d.appendChild(el('summary', '', esc(qq.title) + ' · ' + esc(qq.endpoint.name)));
        var pre = el('pre', 'q-sql');
        pre.textContent = qq.sql;
        d.appendChild(pre);
        var bar = el('div', 'q-bar');
        var btn = el('button', 'mini-btn', '复制查询');
        btn.addEventListener('click', function () {
          copyText(qq.sql, btn);
        });
        bar.appendChild(btn);
        var a = el('a', 'q-link', '打开 ' + esc(qq.endpoint.name) + ' ↗');
        a.href = qq.endpoint.url; a.target = '_blank'; a.rel = 'noopener';
        bar.appendChild(a);
        d.appendChild(bar);
        d.appendChild(el('div', 'q-hint', esc(qq.endpoint.hint)));
        wrap.appendChild(d);
      });
      var links = el('div', 'q-links');
      (q.links || []).forEach(function (l) {
        var a2 = el('a', 'q-link', esc(l.label) + ' ↗');
        a2.href = l.url; a2.target = '_blank'; a2.rel = 'noopener';
        links.appendChild(a2);
      });
      wrap.appendChild(links);
    } else if (s.kind === 'system') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '视图指令') +
        '<span class="st st-established">已解析</span></div>';
      var act = el('div', 'sys-act');
      act.innerHTML = '<span class="k">动作</span><span class="v">' + esc(s.verb || '') + '</span>' +
        '<span class="t">→ ' + esc(s.target || '') + '</span>';
      wrap.appendChild(act);
      var tbl = el('dl', 'kv');
      (s.fields || []).forEach(function (f) {
        tbl.appendChild(el('dt', '', esc(f.label)));
        tbl.appendChild(el('dd', '', esc(f.value)));
      });
      wrap.appendChild(tbl);
      if (s.done) wrap.appendChild(el('div', 'sec-note', esc(s.done)));
    } else if (s.kind === 'review') {
      /* 评审属流程元数据：默认折叠，只留「通过 / 有缺口」的结论 */
      wrap.innerHTML = '<details class="review-fold"><summary>' +
        esc(tn(s.title || '评审结论')) +
        '<span class="st ' + (s.passed ? 'st-established' : 'st-emerging') + '">' +
        (s.passed ? '证据自洽' : '存在缺口') + '</span></summary></details>';
      var rvd = wrap.querySelector('.review-fold');
      var rv = el('div', 'review');
      (s.checks || []).forEach(function (c) {
        var row = el('div', 'rv-row' + (c.ok ? '' : ' bad'));
        row.innerHTML = '<span class="ic">' + (c.ok ? '✓' : '!') + '</span><span class="k">' + esc(c.k) + '</span><span class="v">' + esc(c.v) + '</span>';
        rv.appendChild(row);
      });
      rvd.appendChild(rv);
      if (s.note) rvd.appendChild(el('div', 'sec-note', esc(tn(s.note))));
    } else if (s.kind === 'model') {
      var src = s.source;
      var card = el('div', 'model-note' + (s.fallback ? ' fallback' : ''));
      card.innerHTML =
        '<div class="who"><span class="av" style="background:' + esc(src.dot) + '">' + esc(src.sigil) + '</span>' +
        '<span class="nm2">' + esc(src.name) + '</span><span class="vd">' + esc(src.vendor) + '</span>' +
        (s.latency ? '<span class="lat">' + s.latency + ' ms</span>' : '') + '</div>' +
        '<div class="bd">' + esc(s.text) + '</div>';
      wrap.appendChild(card);
    } else if (s.kind === 'compare') {
      var grid = el('div', 'compare');
      (s.items || []).forEach(function (it) {
        var card = el('div', 'model-note' + (it.fallback ? ' fallback' : ''));
        card.innerHTML =
          '<div class="who"><span class="av" style="background:' + esc(it.dot) + '">' + esc(it.sigil) + '</span>' +
          '<span class="nm2">' + esc(it.name) + '</span>' +
          (it.latency ? '<span class="lat">' + it.latency + ' ms</span>' : '') + '</div>' +
          '<div class="bd">' + esc(it.text) + '</div>';
        grid.appendChild(card);
      });
      wrap.appendChild(grid);
    } else if (s.kind === 'consensus') {
      var c = el('div', 'consensus');
      c.setAttribute('data-level', s.level);
      c.innerHTML = '<div class="head"><span class="lbl">共识等级</span><span class="st st-' + s.level + '">' +
        statusLabel(s.level) + '</span><span class="lbl" style="margin-left:auto">核验 ' + esc(s.verified || '2026-10') + '</span></div>';
      if (s.evidence && s.evidence.length) {
        var ul = el('ul', 'evi');
        s.evidence.forEach(function (e) { ul.appendChild(el('li', '', esc(e))); });
        c.appendChild(ul);
      }
      if (s.open) c.appendChild(el('div', 'open', '<b>仍需回答的问题</b>' + esc(s.open)));
      wrap.appendChild(c);
    } else if (s.kind === 'observe') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '观测建议') + '</div>';
      var box = el('div', 'obs');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'obs-row');
        row.innerHTML = '<div class="k">' + esc(it.k) + '</div><div class="v">' + esc(it.v) + '</div>';
        box.appendChild(row);
      });
      wrap.appendChild(box);
      if (s.provider) {
        wrap.appendChild(el('div', 'sec-note', tn('来源：' + s.provider + ' · 耗时 ' + (s.ms || 0) + ' ms · 点击条目查看原文')));
      }
      if (s.note) wrap.appendChild(el('div', 'sec-note', esc(tn(s.note))));
    } else if (s.kind === 'rank') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '排序') + '</div>';
      var rk = el('div', 'rank');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'rank-row');
        row.innerHTML = '<span class="no">' + pad(it.rank) + '</span><span class="nm">' + esc(it.name) +
          '</span><span class="mt">' + esc(it.meta) + '</span>';
        rk.appendChild(row);
      });
      wrap.appendChild(rk);
    } else if (s.kind === 'list') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '') + '</div>';
      var rows = el('div', 'rows');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'row-item');
        row.innerHTML = '<div class="top"><span class="n">' + esc(it.name) + '</span><span class="mt">' +
          esc(it.meta || '') + '</span></div>' + (it.text ? '<div class="tx">' + esc(it.text) + '</div>' : '');
        rows.appendChild(row);
      });
      wrap.appendChild(rows);
      if (s.note) wrap.appendChild(el('div', 'sec-note', esc(tn(s.note))));
    } else if (s.kind === 'custom') {
      var cn = el('div', 'custom-note');
      cn.innerHTML = '<div class="who"><span class="sg" style="color:' + esc(s.agent.color) + '">' + esc(s.agent.sigil) +
        '</span><span class="nm2">' + esc(s.agent.name) + (s.agent.cn ? ' · ' + esc(s.agent.cn) : '') +
        '</span><span class="rl">' + esc(s.agent.role || '') + '</span></div><div class="bd">' + esc(s.text) + '</div>';
      wrap.appendChild(cn);
    } else if (s.kind === 'boundary') {
      wrap.innerHTML = '<div class="boundary"><span class="lbl">' +
        (s.mode === 'uncertain' ? 'boundary · 不确定声明' : 'boundary · 边界与时效') + '</span>' + esc(s.text) + '</div>';
    } else if (s.kind === 'visual') {
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '可视化') + '</div>';
      var viz = el('div', 'viz');
      var cv = document.createElement('canvas');
      cv.width = 760; cv.height = 470;
      viz.appendChild(cv);
      var cap = el('div', 'viz-cap');
      cap.innerHTML = '<span>' + esc(s.visual.payload.caption || '') + '</span><span>' +
        (s.visual.type === 'moon' ? '月相' : '方位等距投影') + '</span>';
      viz.appendChild(cap);
      wrap.appendChild(viz);
      wrap._canvas = { cv: cv, type: s.visual.type, payload: s.visual.payload };
    } else if (s.kind === 'mapref') {
      wrap.className = 'sec mapref';
      var mb = el('button', 'mapref-btn',
        '<span class="ic">◎</span><span>在实时星图中查看「' + esc(s.label) + '」</span><span class="ar">→</span>');
      mb.addEventListener('click', function () { openViewerAt(s.ra, s.dec, s.label); });
      wrap.appendChild(mb);
    } else if (s.kind === 'synthesis') {
      wrap.className = 'sec sec-synthesis';
      wrap.innerHTML = '<div class="sec-title">证据概览' +
        (s.available ? '<span class="st st-established">已组织</span>'
          : '<span class="st st-emerging">无证据</span>') + '</div>';
      wrap.appendChild(el('div', 'syn-lead', esc(tn(s.lead || ''))));

      /* 时间跨度：按发表/发布/编辑分别列出，不混为一谈 */
      if (s.timeSpan && s.timeSpan.kinds) {
        var tk = Object.keys(s.timeSpan.kinds);
        if (tk.length) {
          var parts = tk.map(function (k) {
            var v = s.timeSpan.kinds[k];
            var lab = (s.timeSpanLabels && s.timeSpanLabels[k]) || k;
            return lab + ' ' + v.oldest + ' ~ ' + v.newest + '（' + v.count + ' 条）';
          });
          wrap.appendChild(el('div', 'syn-time', '时间范围：' + parts.join('；')));
        }
      }

      /* 分方面要点：直接引用原文，不改写 */
      (s.groups || []).forEach(function (g) {
        var box = el('div', 'syn-group');
        box.appendChild(el('div', 'syn-ghead',
          tn(g.label + ' · ' + g.count + ' 条' + (g.supported ? ' · ' + g.supported + ' 条可溯源' : ''))));
        if (g.strictEmpty) {
          box.appendChild(el('div', 'syn-strict-empty',
            tn('严格证据门槛下，该方面只有待核验证据，未纳入关键摘录（可在「Scholar · 研读」中放宽门槛）。')));
        }
        (g.points || []).forEach(function (p) {
          var row = el('div', 'syn-point');
          var bits = [];
          if (p.sourceType) bits.push(SOURCE_TYPE_LABEL[p.sourceType] || p.sourceType);
          if (p.host) bits.push(p.host);
          if (p.date) bits.push((p.dateKind === 'released' ? '发布 ' : p.dateKind === 'edited' ? '编辑 ' : '发表 ') + String(p.date).slice(0, 10));
          if (p.version === 'preprint') bits.push('预印本');
          row.innerHTML =
            '<div class="sp-head"><span class="ev-id">' + esc(p.id) + '</span> ' +
            esc(String(p.title || '').slice(0, 90)) + '</div>' +
            (bits.length ? '<div class="sp-meta">' + esc(bits.join(' · ')) + '</div>' : '') +
            quoteBlock(p.quote) +
            (p.uncertainty ? '<div class="sp-unc">误差表述：' + esc(p.uncertainty) + '</div>' : '') +
            (p.status === 'pending' ? '<span class="ev-badge pending">' + esc(tn('待核验')) + '</span>' : '');
          if (p.url) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', function () { window.open(p.url, '_blank', 'noopener'); });
          }
          box.appendChild(row);
        });
        wrap.appendChild(box);
      });

      /* 未覆盖方面 */
      if (s.gaps && s.gaps.length) {
        wrap.appendChild(el('div', 'syn-gap', '本轮未检索到证据的方面：' + s.gaps.join('、')));
      }
      /* 限制说明 */
      if (s.limits && s.limits.length) {
        var ul = el('div', 'syn-limits');
        s.limits.forEach(function (t) { ul.appendChild(el('div', 'syn-limit', '· ' + tn(t))); });
        wrap.appendChild(ul);
      }
    } else if (s.kind === 'web') {
      wrap.className = 'sec sec-web';
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '检索证据') +
        (s.degraded ? '<span class="st st-emerging">本地索引</span>' : '<span class="st st-established">联网检索</span>') + '</div>';
      var metaBits = [];
      if (s.provider) metaBits.push(s.provider);
      if (s.research && s.research.calls) metaBits.push('调用 ' + s.research.calls + ' 次');
      if (s.research && s.research.rounds) metaBits.push(s.research.rounds + ' 轮');
      if (s.research && s.research.stopReason) metaBits.push('停止：' + stopReasonLabel(s.research.stopReason));
      if (s.ms) metaBits.push(s.ms + ' ms');
      if (metaBits.length) wrap.appendChild(el('div', 'sec-note', esc(tn(metaBits.join(' · ')))));
      if (s.note) wrap.appendChild(el('div', 'sec-note', esc(tn(s.note))));

      var list = el('div', 'web-list');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'web-item');
        /* 标题行：证据编号 + 标题 */
        var head = '<div class="wt">' + (it.id ? '<span class="ev-id">' + esc(it.id) + '</span> ' : '') +
          esc(it.title) + '</div>';
        /* 元信息：来源类型 · 机构 · 发表时间 · 状态 */
        var meta2 = [];
        if (it.sourceType) meta2.push(SOURCE_TYPE_LABEL[it.sourceType] || it.sourceType);
        if (it.host) meta2.push(it.host);
        if (it.date) meta2.push('发表 ' + String(it.date).slice(0, 10));
        var metaHtml = meta2.length ? '<div class="wm">' + esc(meta2.join(' · ')) + '</div>' : '';
        /* 状态徽标：待核验必须显式标出 */
        var badge = '';
        if (it.status === 'pending') badge = '<span class="ev-badge pending">' + esc(tn('待核验')) + '</span>';
        else if (it.status === 'supported') badge = '<span class="ev-badge ok">' + esc(tn('可溯源')) + '</span>';
        if (it.flags && it.flags.length) {
          var fmap = { 'no-url': '无链接', 'no-date': '无时间', 'abstract-only': '仅摘要' };
          var ftxt = it.flags.map(function (f) { return fmap[f] || f; }).join('/');
          badge += '<span class="ev-badge weak">' + esc(ftxt) + '</span>';
        }
        row.innerHTML = head + metaHtml +
          '<div class="ws">' + esc(it.excerpt || it.snippet || '') + '</div>' +
          '<div class="wh">' + esc(it.host || '') + (it.url ? ' · 原文链接' : ' · 无原文链接') + '</div>' + badge;
        if (it.url) {
          row.style.cursor = 'pointer';
          row.addEventListener('click', function () { window.open(it.url, '_blank', 'noopener'); });
        }
        list.appendChild(row);
      });
      wrap.appendChild(list);
    } else if (s.kind === 'conflict') {
      wrap.className = 'sec sec-conflict';
      wrap.innerHTML = '<div class="sec-title">' + esc(s.title || '来源之间的数值差异') +
        '<span class="st st-emerging">存在分歧</span></div>';
      if (s.note) wrap.appendChild(el('div', 'sec-note', esc(tn(s.note))));
      (s.items || []).forEach(function (c) {
        var box = el('div', 'conflict-box');
        box.appendChild(el('div', 'cf-head',
          esc(c.family) + ' · 最大差异 ' + c.spread + '%'));
        var ul = el('div', 'cf-vals');
        (c.values || []).forEach(function (v) {
          var li = el('div', 'cf-val');
          li.innerHTML = '<span class="cf-num">' + esc(v.raw) + '</span>' +
            '<span class="cf-src">' + esc((v.id ? v.id + ' ' : '') + (v.host || '')) + '</span>' +
            '<span class="cf-title">' + esc(String(v.title || '').slice(0, 60)) + '</span>';
          if (v.url) {
            li.style.cursor = 'pointer';
            li.addEventListener('click', function () { window.open(v.url, '_blank', 'noopener'); });
          }
          ul.appendChild(li);
        });
        box.appendChild(ul);
        wrap.appendChild(box);
      });
    } else if (s.kind === 'citation') {
      wrap.className = 'sec sec-citation';
      var vlabel = { 'verified': '可溯源', 'partially-verified': '部分待核验', 'no-source-url': '缺少原文链接', 'no-evidence': '无检索证据' };
      wrap.innerHTML = '<div class="sec-title">' + esc(tn(s.title || '引用核验')) +
        '<span class="st ' + (s.verdict === 'verified' ? 'st-established' : 'st-emerging') + '">' +
        esc(tn(vlabel[s.verdict] || s.verdict)) + '</span></div>';
      /* 明细属细节层：首屏只留一行结论，逐项数据折叠起来 */
      wrap.appendChild(el('div', 'cit-line',
        '共 ' + (s.total || 0) + ' 条证据 · ' + tn('可溯源') + ' ' + (s.supported || 0) +
        ' · ' + tn('待核验') + ' ' + (s.pending || 0)));
      var cdet = el('details', 'cit-det');
      cdet.appendChild(el('summary', '', '核验明细'));
      var grid = el('div', 'kv');
      [['证据总数', s.total], ['含原文链接', s.withUrl], ['含发表时间', s.withDate],
       ['可溯源', s.supported], ['待核验', s.pending]].forEach(function (p) {
        grid.appendChild(el('div', 'k', esc(tn(p[0]))));
        grid.appendChild(el('div', 'v', String(p[1] == null ? 0 : p[1])));
      });
      cdet.appendChild(grid);
      if (s.note) cdet.appendChild(el('div', 'sec-note', esc(tn(s.note))));
      if (s.unattested && s.unattested.length) {
        cdet.appendChild(el('div', 'sec-note',
          '本地知识库声明来源中，以下 ' + s.unattested.length + ' 项未在本轮检索出现（属正常：检索未覆盖不等于来源无效）：' +
          s.unattested.map(function (x) { return x.name; }).join('、')));
      }
      if (s.corroborated && s.corroborated.length) {
        cdet.appendChild(el('div', 'sec-note',
          '本轮检索印证了 ' + s.corroborated.length + ' 项本地来源：' +
          s.corroborated.map(function (x) { return x.name; }).join('、')));
      }
      wrap.appendChild(cdet);
    } else if (s.kind === 'attach') {
      wrap.className = 'sec sec-attach';
      wrap.innerHTML = '<div class="sec-title">附件<span class="st st-established">' +
        (s.items || []).length + ' 个</span></div>';
      if (s.note) wrap.appendChild(el('div', 'sec-note', esc(tn(s.note))));
      var alist = el('div', 'atch-list');
      (s.items || []).forEach(function (it) {
        var row = el('div', 'atch-row');
        var head = '<div class="ar-head">';
        if (it.kind === 'image' && it.thumb) {
          head += '<span class="ar-thumb"><img alt="" src="' + esc(it.thumb) + '"></span>';
        } else {
          head += '<span class="ar-ic">' + esc((it.kind === 'fits' ? 'FITS' : it.kindLabel)) + '</span>';
        }
        head += '<span class="ar-name">' + esc(it.name) + '</span>' +
          '<span class="ar-meta">' + esc(it.size) + ' · ' + esc(it.kindLabel) +
          (it.width ? ' · ' + it.width + '×' + it.height : '') +
          (it.chars ? ' · ' + it.chars + ' 字' : '') + '</span></div>';
        row.innerHTML = head;
        /* FITS 头信息逐条列出 */
        if (it.facts && it.facts.length) {
          var grid = el('div', 'kv ar-kv');
          it.facts.forEach(function (p) {
            grid.appendChild(el('div', 'k', esc(p[0])));
            grid.appendChild(el('div', 'v', esc(String(p[1]))));
          });
          row.appendChild(grid);
        }
        if (it.note) row.appendChild(el('div', 'ar-note', esc(it.note)));
        alist.appendChild(row);
      });
      wrap.appendChild(alist);
    } else if (s.kind === 'followup') {
      wrap.className = 'sec followup';
      (s.items || []).forEach(function (q) {
        var b = el('button', '', esc(q));
        b.addEventListener('click', function () { ask(q); });
        wrap.appendChild(b);
      });
    }
    return wrap;
  }

  /* ============================================================
     叙述层：把「结论 + 依据 + 边界」合成一段连贯的话，出处以脚注角标挂载。
     只处理以事实为主的本地答案；含结构化章节（rank/observe/visual…）
     或走检索的答案仍交给原渲染，避免把列表硬编成散文。
     ============================================================ */
  function renderNarrative(ans) {
    if (!ans.meta || ans.meta.tier === 'unknown' || ans.meta.tier === 'chat') return null;
    if (ans.intent === 'smalltalk') return null;

    var vIdx = -1, eIdx = -1, bIdx = -1, hasWeb = false;
    ans.sections.forEach(function (s, i) {
      if (s.kind === 'synthesis' || s.kind === 'web') hasWeb = true;
      if (vIdx < 0 && s.kind === 'verdict') vIdx = i;
      if (eIdx < 0 && s.kind === 'evidence' && (s.items || []).length) eIdx = i;
      if (bIdx < 0 && s.kind === 'boundary') bIdx = i;
    });
    /* 走检索的答案证据以引文为主，硬编成散文会丢原文，交给原渲染 */
    if (hasWeb) return null;
    if (vIdx < 0 || eIdx < 0) return null;

    /* 说明：观测建议 / 排序 / 星图这类结构化章节不参与叙述，仍各自成块——
     * 它们本身是表格或画布，硬编成句子只会更难读。
     * 叙述层只接管「结论 + 依据 + 边界」这部分散文。 */
    var v = ans.sections[vIdx], ev = ans.sections[eIdx];
    var bd = bIdx >= 0 ? ans.sections[bIdx] : null;
    var box = el('div', 'narr');

    /* 脚注池 */
    var notes = [];
    function addNote(label, detail, url) {
      notes.push({ i: notes.length + 1, label: label, detail: detail, url: url || '' });
      return notes.length;
    }
    var srcNote = 0;
    if (ev.sources && ev.sources.length) {
      srcNote = addNote(ev.sources[0].n, '本地知识库条目', ev.sources[0].u || '');
    }

    /* 第一句：结论 */
    box.appendChild(el('p', 'narr-lead', esc(v.head)));

    /* 数值句与属性句 */
    var dataItems = [], metaItems = [];
    (ev.items || []).forEach(function (it) {
      if (/[0-9]/.test(String(it.value))) dataItems.push(it); else metaItems.push(it);
    });
    if (dataItems.length) {
      var dh = dataItems.map(function (x) {
        return esc(x.label) + ' <b class="nv">' + esc(x.value) + '</b>';
      }).join('、') + '。';
      if (srcNote) dh += '<sup class="fn">' + srcNote + '</sup>';
      box.appendChild(el('p', 'narr-body', dh));
    }
    if (metaItems.length) {
      box.appendChild(el('p', 'narr-body', metaItems.map(function (x) {
        return esc(x.label) + '为 ' + esc(x.value);
      }).join('；') + '。'));
    }
    if (ev.para) {
      box.appendChild(el('p', 'narr-body', esc(ev.para) + (srcNote ? '<sup class="fn">' + srcNote + '</sup>' : '')));
    }
    if (bd && bd.text) {
      box.appendChild(el('p', 'narr-caveat', '⚠ ' + esc(tn(bd.text))));
    }

    /* 脚注行 */
    if (notes.length) {
      var fnBox = el('div', 'narr-fns');
      notes.forEach(function (n) {
        var line = el('div', 'narr-fn');
        line.innerHTML = '<span class="n">' + n.i + '</span>' +
          '<span class="lab">' + esc(n.label) + '</span>' +
          '<span class="det">' + esc(n.detail) + '</span>' +
          (n.url ? '<a href="' + esc(n.url) + '" target="_blank" rel="noopener">原文</a>' : '');
        fnBox.appendChild(line);
      });
      box.appendChild(fnBox);
    }

    return { el: box, consumed: [vIdx, eIdx].concat(bd ? [bIdx] : []) };
  }

  /* 核对层：证据概览 / 检索证据 / 引用核验 / 冲突 收进同一个折叠条 */
  var VERIFY_KINDS = { synthesis: 1, web: 1, citation: 1, conflict: 1 };
  function renderVerifyStrip(list) {
    /* 空章节不生成折叠条：失败态里出现一个光秃秃的「核对」只会添乱 */
    list = (list || []).filter(function (s) {
      if (s.kind === 'synthesis') return (s.groups || []).some(function (g) { return (g.points || []).length; });
      if (s.kind === 'web') return (s.items || []).length > 0;
      if (s.kind === 'citation') return (s.total || 0) > 0;
      if (s.kind === 'conflict') return (s.items || []).length > 0;
      return true;
    });
    if (!list.length) return null;
    var det = el('details', 'verify-fold');
    var n = 0;
    list.forEach(function (s) {
      if (s.kind === 'synthesis') {
        (s.groups || []).forEach(function (g) { n += (g.points || []).length; });
      } else if (s.kind === 'web' && s.items) {
        n += s.items.length;
      }
    });
    det.appendChild(el('summary', '', '核对' + (n ? ' · ' + n + ' 条证据' : '')));
    list.forEach(function (s) {
      var node = sectionNode(s);
      det.appendChild(node);
    });
    return det;
  }

  /* 方案 C · L3 技能沉淀。按「意图 + 目标」聚合，记录次数、时间、上次结论与器材。
   * 不做花哨的技能卡，只做真实的复用——它能证明系统在积累，而不是每次从零开始。
   * 注意：技能只「补空缺」，用户档案永远优先，避免换了器材还沿用旧参数。 */
  function skillKey(intent, target) { return intent + '|' + (target || ''); }

  function skillFor(intent, target) {
    var list = state.skills || [];
    var k = skillKey(intent, target);
    for (var i = 0; i < list.length; i++) { if (list[i].key === k) return list[i]; }
    return null;
  }

  function removeSkill(key) {
    if (!state.skills) return;
    var before = state.skills.length;
    state.skills = state.skills.filter(function (x) { return x.key !== key; });
    persist();
    if (state.skills.length < before) toast('已删除该条技能记录');
  }

  function clearSkills() {
    state.skills = [];
    persist();
    toast('已清空全部技能记录');
  }

  /* 意图的中文标签，仅供技能面板展示 */
  function intentCn(i) {
    var m = {
      'gear-fit': '器材匹配', 'tonight': '今晚规划', 'knowledge-target': '知识问答',
      'intro-target': '天体介绍', 'observe-target': '观测时机', 'cosmos': '宇宙学',
      'nova': '爆发天体', 'event': '天象事件', 'gear': '器材选型', 'chart': '星图',
      'photo-target': '拍摄方案', 'system-view': '太阳系', 'helios': '太阳活动'
    };
    return m[i] || i || '其他';
  }

  /* 技能管理面板：用户必须能看到系统记了什么，并能否定它 —— 否则记忆是黑箱 */
  function skillPanel() {
    var box = el('div', 'skill-panel');
    var list = (state.skills || []).slice().sort(function (a, b) { return (b.at || 0) - (a.at || 0); });

    var head = el('div', 'skill-head');
    head.innerHTML = '<span class="k">技能记录</span><span class="n">' + list.length + ' 条</span>';
    box.appendChild(head);

    if (!list.length) {
      box.appendChild(el('div', 'skill-empty', '多问几次同类问题后会自动积累，用于复用器材与承接结论。'));
      return box;
    }

    list.slice(0, 8).forEach(function (it) {
      var row = el('div', 'skill-item');
      var days = Math.max(0, Math.round((Date.now() - (it.at || Date.now())) / 86400000));
      var when = days === 0 ? '今天' : days === 1 ? '昨天' : days + ' 天前';
      row.innerHTML =
        '<span class="t" title="' + esc(it.key) + '">' + esc(it.target || '（通用）') + '</span>' +
        '<span class="i">' + esc(intentCn(it.intent)) + '</span>' +
        '<span class="cn">' + (it.n || 1) + ' 次</span>' +
        '<span class="w">' + when + '</span>';
      var del = el('button', 'skill-del', '删除');
      del.type = 'button';
      del.title = '删除这条记录';
      del.addEventListener('click', function () {
        removeSkill(it.key);
        renderSettings();
      });
      row.appendChild(del);
      box.appendChild(row);
    });

    if (list.length > 8) {
      box.appendChild(el('div', 'skill-more', '还有 ' + (list.length - 8) + ' 条未显示'));
    }

    var clear = el('button', 'skill-clear', '清空全部技能记录');
    clear.type = 'button';
    clear.addEventListener('click', function () {
      if (!window.confirm('确定清空全部技能记录？此操作不可撤销。')) return;
      clearSkills();
      renderSettings();
    });
    box.appendChild(clear);
    return box;
  }

  function recordSkill(ans) {
    if (!ans || !ans.intent || ans.intent === 'smalltalk') return;
    var target = (ans.meta && ans.meta.target) || '';
    var fit = null, head = '';
    ans.sections.forEach(function (x) {
      if (!fit && x.kind === 'gearfit') fit = x;
      if (!head && x.kind === 'verdict') head = x.head || '';
    });
    if (!state.skills) state.skills = [];
    var hit = skillFor(ans.intent, target);
    if (hit) {
      hit.n += 1;
      hit.at = Date.now();
      if (head) hit.last = String(head).slice(0, 60);
      if (fit) hit.gear = fit.fit.gear.id;
    } else {
      state.skills.push({
        key: skillKey(ans.intent, target), intent: ans.intent, target: target,
        n: 1, at: Date.now(),
        last: head ? String(head).slice(0, 60) : '',
        gear: fit ? fit.fit.gear.id : ''
      });
    }
    if (state.skills.length > 40) state.skills.splice(0, state.skills.length - 40);
    persist();
  }

  /* 承接提示：只说「问过、上次结论是什么、多久前」，不把旧结论当依据 */
  function recallLine(r) {
    var d = el('div', 'recall');
    var days = Math.max(0, Math.round((Date.now() - (r.at || Date.now())) / 86400000));
    var when = days === 0 ? '今天较早时候' : days === 1 ? '昨天' : days + ' 天前';
    d.innerHTML = '<span class="ic">↺</span>你' + when + '问过同类问题（共 ' + r.n +
      ' 次），上次结论：' + esc(r.last);
    return d;
  }

  function renderAnswer(ans, extra) {
    /* 术语双轨按「本条答案实际使用的语体」决定，而不是全局设置 */
    CURRENT_REG = (ans.meta && ans.meta.register === 'pro') ? 'pro' : 'pop';
    /* 契约一：档位由答案自身构成判定，渲染前统一标注 */
    if (window.AstroRuntime) {
      ans.meta = ans.meta || {};
      ans.meta.tier = window.AstroRuntime.classify(ans).key;
      CURRENT_TIER = ans.meta.tier;
    }
    var msg = el('div', 'msg bot');
    var card = el('div', 'answer');
    rememberTurn(ans);
    card.appendChild(answerHead(ans, extra));
    if (state.settings.showTrace && ans.trace && ans.trace.length && ans.intent !== 'smalltalk') {
      card.appendChild(renderTrace(ans.trace));
    }
    var pending = [];
    var consumed = {};
    /* 叙述层：能合成一段话的就合成，读者看到的是「一个回答」而不是一叠卡片 */
    var narr = renderNarrative(ans);
    if (narr) {
      card.appendChild(narr.el);
      narr.consumed.forEach(function (i) { consumed[i] = 1; });
    }
    var verifyList = [];
    ans.sections.forEach(function (s, i) {
      if (consumed[i]) return;
      /* 问候类输入没有事实可评审，跳过评审章节，避免出现「存在缺口」的噪音 */
      if ((ans.intent === 'smalltalk' || CURRENT_TIER === 'unknown') && s.kind === 'review') return;
      /* 核对类章节统一收进一个折叠条，不再各自占一块 */
      if (VERIFY_KINDS[s.kind]) { verifyList.push(s); return; }
      var n = sectionNode(s);
      if (n._canvas) pending.push(n._canvas);
      card.appendChild(n);
    });
    if (verifyList.length) {
      var vstrip = renderVerifyStrip(verifyList);
      if (vstrip) card.appendChild(vstrip);
    }
    if (ans.meta && ans.meta.styleSwitch) {
      var sw = el('div', 'recall');
      sw.innerHTML = '<span class="ic">↳</span>这题按「' + esc(ans.meta.styleSwitch.label) + '」风格回答（你的默认是「' + esc(PERSONAS[ans.meta.styleSwitch.from] ? PERSONAS[ans.meta.styleSwitch.from].label : '未设置') + '」）';
      card.appendChild(sw);
    }
    if (ans.meta && ans.meta.recall) card.appendChild(recallLine(ans.meta.recall));
    if (!(extra && extra.restore)) card.appendChild(answerActions(card, ans));
    card.appendChild(metaBar(ans));
    msg.appendChild(card);
    $('#thread').appendChild(msg);
    pending.forEach(function (pc) {
      try {
        if (pc.type === 'moon') drawMoon(pc.cv, pc.payload.phase || A.moonPhase(pc.payload.jd));
        else {
          var vp = pc.payload;
          var vYaw = vp.yaw;
          if (vYaw == null && vp.highlight) {
            vYaw = A.altAz(vp.highlight.ra, vp.highlight.dec, vp.jd, vp.lat, vp.lon).az;
          }
          drawSky(pc.cv, Object.assign({}, vp, {
            yaw: vYaw == null ? 180 : vYaw, pitch: 36, fov: 152,
            compact: true, showGlobe: false, detail: true, style: 'full'
          }));
        }
      } catch (e) { console.warn('viz failed', e); }
    });
    try { recordSkill(ans); } catch (e) { console.warn('skill record failed', e); }
    /* 持久化：恢复历史时不重复落库、不自动滚动、不播动画 */
    var isRestore = !!(extra && extra.restore);
    if (isRestore) {
      msg.classList.add('restored');
    } else if (window.Thread) {
      try {
        var pB = window.Thread.appendBot(ans);
        if (pB && pB.catch) pB.catch(onSaveFail);
      } catch (e) { onSaveFail(e); }
    }
    if (!isRestore) renderThreadList();
    if (!isRestore && state.settings.autoScroll) {
      var sc = $('#scroll');
      sc.scrollTo({ top: Math.max(0, msg.offsetTop - 12), behavior: 'smooth' });
    }
  }

  /* ================= 任务队列（长任务编排与可观测） =================
   * 检索、模型调用、Agent 编排都登记到这里，状态机：
   * queued → running → ok | error | cancelled；面板可看到最近任务与耗时。 */
  var TASKS = [];
  var TASK_SEQ = 0;
  function taskStart(type, label) {
    var t = {
      id: ++TASK_SEQ, type: type, label: label || type,
      state: 'running', startedAt: Date.now(), ms: 0, error: ''
    };
    TASKS.push(t);
    if (TASKS.length > 20) TASKS.shift();
    return t.id;
  }
  function taskEnd(id, err) {
    for (var i = TASKS.length - 1; i >= 0; i--) {
      if (TASKS[i].id !== id) continue;
      TASKS[i].state = err ? 'error' : 'ok';
      TASKS[i].ms = Date.now() - TASKS[i].startedAt;
      TASKS[i].error = err ? String(err.message || err).slice(0, 80) : '';
      return;
    }
  }
  function taskList() { return TASKS.slice(); }

  /* ================= 跨轮记忆 =================
   * 记录本轮的问题、结论要点与主体，供下一轮做指代消解与数值一致性参考。 */
  function rememberTurn(ans) {
    if (!ans || !ans.query) return;
    var head = '', para = '';
    ans.sections.forEach(function (s) {
      if (s.kind === 'verdict' && !head) head = s.head;
      if (s.kind === 'evidence' && !para) {
        (s.items || []).slice(0, 3).forEach(function (it) {
          para += (para ? '；' : '') + it.label + ' ' + it.value;
        });
        if (!para && s.para) para = s.para;
      }
    });
    var target = (ans.meta && ans.meta.target) || '';
    if (!target) {
      var t = (ans.targets || [])[0];
      if (t && t.item) {
        if (t.item.kind === 'kb' && t.item.entry) target = t.item.entry.cn;
        else target = t.item.cn || t.item.en || t.item.key || '';
      }
    }
    state.memory.push({
      q: String(ans.query).slice(0, 120),
      a: String(head || para).slice(0, 160),
      target: String(target).slice(0, 40),
      at: Date.now()
    });
    if (state.memory.length > 8) state.memory = state.memory.slice(-8);
    AC.setMemory(state.memory);
  }

  function memoryForPrompt() {
    return state.memory.slice(-3).map(function (m) {
      return { q: m.q, a: m.a };
    });
  }

  function step(agent, action, detail) {
    return { agent: agent, action: action, detail: detail || '' };
  }

  /* ---------- 执行太阳系视图指令（由 Navigator 生成的结构化动作） ---------- */
  function applySystemAction(action) {
    if (!action || !SV) return '';
    try {
      if (action.type === 'open') {
        openSolar({ key: action.target || solarKey, level: action.level || 'system' });
        return '已打开太阳系观测视图。';
      }
      if (action.type === 'focus' || action.type === 'level') {
        openSolar({ key: action.target || solarKey, level: action.level || 'planet' });
        selectSolar(action.target || solarKey);
        return '已切换到「' + (action.level === 'close' ? '特写' : action.level === 'planet' ? '近景' : '全系') + '」视角。';
      }
      if (action.type === 'reset') { SV.reset(); syncSolarTools(); return '视角已重置。'; }
      if (action.type === 'pause') {
        if (SV.state.paused !== !!action.value) SV.togglePause();
        syncSolarTools();
        return action.value ? '时间推进已暂停。' : '时间推进已恢复。';
      }
      if (action.type === 'toggle') {
        if (action.item === 'orbits') SV.setOrbits(!!action.value);
        if (action.item === 'labels') SV.setLabels(!!action.value);
        syncSolarTools();
        return (action.item === 'orbits' ? '轨道' : '标签') + (action.value ? '已显示。' : '已隐藏。');
      }
      if (action.type === 'boost') {
        SV.setBoost(SV.state.boost * action.value);
        syncSolarTools();
        return '天体统一放大系数已调整为 ×' + Math.round(SV.state.boost).toLocaleString() + '（直径比例不变）。';
      }
    } catch (e) {
      return '指令执行失败：' + e.message;
    }
    return '';
  }

  var TRACE_RANK = {
    muse: 1, vega: 2, cosmos: 3, nova: 4, helios: 5, kepler: 6,
    horizon: 7, orion: 8, lyra: 9, curator: 10, critic: 11
  };
  function sortTrace(trace) {
    trace.sort(function (x, y) {
      return (TRACE_RANK[x.agent] || 99) - (TRACE_RANK[y.agent] || 99);
    });
  }

  /* ================= 目标目录与观测清单 =================
   * 对应论坛高频诉求：按类别浏览目标、只看在当前条件下找得到的、攒一份可导出的当晚清单。 */
  var PLAN_KEY = window.Profile ? Profile.ns('astrum.plan.v1') : 'astrum.plan.v1';
  var plan = [];
  var catGroup = 'messier';

  function loadPlan() {
    try {
      var raw = JSON.parse(localStorage.getItem(PLAN_KEY) || '[]');
      plan = Array.isArray(raw) ? raw : [];
    } catch (e) { plan = []; }
  }
  function savePlan() {
    try { localStorage.setItem(PLAN_KEY, JSON.stringify(plan)); } catch (e) { }
  }
  function planHas(name) { return plan.some(function (p) { return p.name === name; }); }
  function togglePlan(item) {
    if (planHas(item.name)) {
      plan = plan.filter(function (p) { return p.name !== item.name; });
    } else {
      plan.push({ name: item.name, sub: item.sub, alt: item.alt, mag: item.mag, ra: item.ra, dec: item.dec, at: Date.now() });
    }
    savePlan();
    renderPlan();
    renderCatalog();
  }

  function catalogItems() {
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var out = [];
    C.dso.forEach(function (d) {
      var alt = A.altAz(d.ra, d.dec, jd, ctx.lat, ctx.lon).alt;
      out.push({
        g: /^M\d+$/.test(d.id) ? 'messier' : 'dso',
        name: d.cn, sub: d.id + ' · ' + d.type, mag: d.mag, alt: alt,
        ra: d.ra, dec: d.dec, desc: d.desc || ''
      });
    });
    C.constellations.forEach(function (c) {
      var members = c.lines.reduce(function (a, s) { return a.concat(s); }, [])
        .map(function (kk) { return C.stars.filter(function (s) { return s.k === kk; })[0]; })
        .filter(Boolean).sort(function (a, b) { return a.mag - b.mag; });
      if (!members.length) return;
      var s0 = members[0];
      var alt = A.altAz(s0.ra, s0.dec, jd, ctx.lat, ctx.lon).alt;
      out.push({
        g: 'con', name: c.cn, sub: c.en + ' · ' + c.season, mag: s0.mag, alt: alt,
        ra: s0.ra, dec: s0.dec, desc: '以最亮成员 ' + s0.cn + ' 定位'
      });
    });
    A.planets(jd).forEach(function (p) {
      var alt = A.altAz(p.ra, p.dec, jd, ctx.lat, ctx.lon).alt;
      out.push({
        g: 'planet', name: p.cn, sub: '行星 · 视星等 ' + p.mag, mag: p.mag, alt: alt,
        ra: p.ra, dec: p.dec, desc: '当前距地 ' + p.dist.toFixed(3) + ' AU'
      });
    });
    return out;
  }

  function renderCatalog() {
    var box = $('#catList');
    if (!box) return;
    var items = catalogItems().filter(function (x) { return x.g === catGroup; });
    items.sort(function (a, b) { return (b.alt - a.alt) || ((a.mag || 99) - (b.mag || 99)); });
    var vis = items.filter(function (x) { return x.alt > 0; }).length;
    var meta = $('#catMeta');
    if (meta) meta.textContent = items.length + ' 个 · 此刻可见 ' + vis;
    box.innerHTML = '';
    items.slice(0, 40).forEach(function (it) {
      var row = el('div', 'cat-row' + (planHas(it.name) ? ' picked' : ''));
      var up = it.alt > 0;
      row.innerHTML = '<span class="n">' + esc(it.name) + '</span>' +
        '<span class="m">' + (it.mag != null ? '★' + it.mag.toFixed(1) + ' · ' : '') +
        (up ? '高 ' + Math.round(it.alt) + '°' : '地平线下') + '</span>' +
        '<button class="mini-btn" title="加入观测清单">＋</button>';
      var add = row.querySelector('button');
      add.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePlan(it);
      });
      row.addEventListener('click', function () {
        openViewerAt(it.ra, it.dec, it.name);
      });
      box.appendChild(row);
    });
    if (!items.length) box.appendChild(el('div', 'mini-item', '该分类暂无条目'));
  }

  function renderPlan() {
    var box = $('#planList');
    if (!box) return;
    var meta = $('#planMeta');
    if (meta) meta.textContent = plan.length + ' 项';
    box.innerHTML = '';
    if (!plan.length) {
      box.appendChild(el('div', 'mini-item', '清单为空：在目标目录点「＋」，或在今晚优先里加入'));
      return;
    }
    plan.forEach(function (p, i) {
      var row = el('div', 'mini-item');
      row.innerHTML = '<span class="r">' + pad(i + 1) + '</span><span class="n">' + esc(p.name) + '</span>' +
        '<span class="m">' + (p.alt != null && p.alt > 0 ? '高 ' + Math.round(p.alt) + '°' : '待升') + '</span>';
      row.addEventListener('click', function () {
        if (p.ra != null) openViewerAt(p.ra, p.dec, p.name);
      });
      box.appendChild(row);
    });
  }

  function exportPlan() {
    if (!plan.length) { toast('观测清单为空'); return; }
    var ctx = state.ctx || readCtx();
    var lines = [
      '# 观测计划单 · ' + ctx.city + '（' + ctx.y + '-' + pad(ctx.mo) + '-' + pad(ctx.d) + ' ' + pad(ctx.h) + ':' + pad(ctx.mi) + '）',
      '',
      '地点：' + ctx.city + ' ' + ctx.lat.toFixed(3) + '°, ' + ctx.lon.toFixed(3) + '°（UTC' + (ctx.tz >= 0 ? '+' : '') + ctx.tz + '）',
      '器材：' + ({ naked: '肉眼', binocular: '双筒', telescope: '望远镜', photo: '摄影' }[ctx.gear] || ctx.gear),
      'Bortle：' + ctx.bortle,
      '',
      '| # | 目标 | 备注 | 视星等 | 当前高度 |',
      '| --- | --- | --- | --- | --- |'
    ];
    plan.forEach(function (p, i) {
      lines.push('| ' + (i + 1) + ' | ' + p.name + ' | ' + (p.sub || '') + ' | ' +
        (p.mag != null ? p.mag : '—') + ' | ' + (p.alt != null ? Math.round(p.alt) + '°' : '—') + ' |');
    });
    lines.push('', '由 ASTRUM 生成；数值来自本地星历复算，出发前请复核天气与月相。');
    var blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'astrum-observation-plan.md';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast('已导出 ' + plan.length + ' 项观测计划');
  }

  /* ================= 天象模型预热 =================
   * 首次构建模型时浏览器要做一次 JIT 预热（约 50ms），若发生在第一次拖拽上会顿一下。
   * 这里在空闲时先把模型建好，之后的拖拽全部命中缓存。 */
  function warmupSkyModel() {
    var run = function () {
      try {
        var ctx = state.ctx || readCtx();
        var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
        skyModel(jd, ctx.lat, ctx.lon);
      } catch (e) { /* 预热失败不影响功能 */ }
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 2500 });
    else setTimeout(run, 600);
  }

  /* ================= 视口自适应（预览/矮容器） =================
   * 容器高度不足时首屏会被裁掉，这里用 ResizeObserver 盯住可视区，
   * 自动切换紧凑模式，保证「标题 + 输入区」始终在首屏内。 */
  var compactState = false;
  function applyViewportMode() {
    var h = window.innerHeight || document.documentElement.clientHeight || 0;
    var w = window.innerWidth || document.documentElement.clientWidth || 0;
    var compact = h < 620 || w < 560;
    if (compact !== compactState) {
      compactState = compact;
      document.body.classList.toggle('viewport-compact', compact);
      if (SV) SV.sizeCanvas();
      if ($('#viewer').classList.contains('on')) sizeViewerCanvas();
    }
  }
  function watchViewport() {
    applyViewportMode();
    window.addEventListener('resize', applyViewportMode);
    window.addEventListener('orientationchange', function () { setTimeout(applyViewportMode, 120); });
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(function () { applyViewportMode(); });
        ro.observe(document.documentElement);
      } catch (e) { /* 不支持则退化为 resize 事件 */ }
    }
  }

  /* 全局错误捕获：把未处理异常记入运行状态面板，便于事后定位 */
  function watchErrors() {
    window.addEventListener('error', function (e) {
      PERF.errors.push({
        kind: 'runtime',
        msg: String((e && e.message) || '未知运行时错误').slice(0, 120),
        at: Date.now()
      });
      if (PERF.errors.length > 30) PERF.errors.shift();
    });
    window.addEventListener('unhandledrejection', function (e) {
      var r = e && e.reason;
      var msg = (r && r.message) || String(r || '未处理的 Promise 拒绝');
      PERF.errors.push({ kind: 'promise', msg: String(msg).slice(0, 120), at: Date.now() });
      if (PERF.errors.length > 30) PERF.errors.shift();
    });
  }

  /* ================= 多来源编排 ================= */
  function sourceCfgPatch(cfgObj, src) {
    if (!src || src.type !== 'local') return;
    var map = {
      'local-pro': { register: 'pro', depth: 'deep', tone: 'academic' },
      'local-pop': { register: 'pop', depth: 'brief', tone: 'warm' }
    };
    var p = map[src.id] || {};
    if (p.register) cfgObj.vega.scope = p.register;
    if (p.depth) cfgObj.muse.depth = p.depth;
    if (p.tone) cfgObj.lyra.tone = p.tone;
  }

  function factsFromAnswer(ans) {
    var facts = [], para = '', head = '';
    ans.sections.forEach(function (s) {
      if (s.kind === 'evidence') {
        (s.items || []).forEach(function (it) {
          if (facts.length < 6) facts.push({ label: it.label, value: it.value });
        });
        if (!para && s.para) para = s.para;
      }
      if (!head && s.kind === 'verdict') head = s.head;
    });
    return { facts: facts, para: para || head };
  }

  function noteFor(src, text, latency, fallback) {
    return {
      kind: 'model',
      source: { name: src.name, vendor: src.vendor, dot: src.dot, sigil: initials(src) },
      text: text, latency: latency || 0, fallback: !!fallback
    };
  }

  /* 引用编号核验：模型输出里出现的 [E1]/【E2】必须存在于本轮证据。
   * 只检查编号是否真实存在，不臆断编号与陈述的语义对应关系 ——
   * 后者无法自动判定，交给「引用核验」章节如实标注。 */
  function fakeCitations(text, evidence) {
    var ids = {};
    (evidence || []).forEach(function (e) { ids[e.id] = 1; });
    var found = String(text || '').match(/[\[【]\s*E\s*(\d+)\s*[\]】]/g) || [];
    var bad = [];
    found.forEach(function (m) {
      var n = m.match(/\d+/);
      var id = 'E' + (n ? n[0] : '');
      if (!ids[id] && bad.indexOf(id) < 0) bad.push(id);
    });
    return bad;
  }

  /* 数值一致性核验：模型输出中的数字必须能在事实层找到出处，否则标注出来 */
  function numericAudit(text, facts, para) {
    var src = [para || ''];
    (facts || []).forEach(function (f) { src.push(f.label + ' ' + f.value); });
    var pool = src.join(' ');
    var nums = String(text || '').match(/[0-9]+(?:\.[0-9]+)?/g) || [];
    var unverified = [], seen = {};
    nums.forEach(function (n) {
      if (seen[n]) return;
      seen[n] = 1;
      /* 允许小整数与常见单位换算（0-24、100、1000 等结构性数字） */
      var v = parseFloat(n);
      if (v <= 24 || v === 100 || v === 1000 || v === 60 || v === 360 || v === 24 || v === 365) return;
      if (pool.indexOf(n) >= 0) return;
      /* 允许年份出现在事实层（已由上面的 indexOf 覆盖） */
      unverified.push(n);
    });
    return unverified.slice(0, 5);
  }

  function busy(on, label) {
    state.busy = on;
    $('#send').disabled = on;
    if (label) {
      var t = $('#thread').querySelector('.thinking span');
      if (t) t.textContent = label;
    }
  }

  /* 本地索引：用别名表命中知识条目，作为联网失败时的兜底 */
  function localIndexItems(q) {
    var out = [];
    try {
      AC.resolveTargets(q).forEach(function (t) {
        if (t.item.kind !== 'kb') return;
        var e = t.item.entry;
        if (out.some(function (x) { return x.title === e.cn; })) return;
        out.push({ title: e.cn, snippet: e.summary, host: '本地知识库 · 核验 ' + (e.verified || '2026-10'), url: '' });
      });
    } catch (err) { /* 忽略 */ }
    return out.slice(0, 3);
  }

  /* 简单相关性过滤：标题或摘要需与查询有实质重合 */
  function filterRelevant(items, q) {
    var key = String(q || '').replace(/[，。？?！!\s]/g, '');
    if (key.length < 2) return items;
    var grams = [];
    for (var i = 0; i <= key.length - 2; i++) grams.push(key.slice(i, i + 2));
    var hit = items.filter(function (it) {
      var hay = (it.title || '') + (it.snippet || '');
      return grams.some(function (g) { return hay.indexOf(g) >= 0; });
    });
    return hit.length ? hit : items;
  }

  function sectionIndexAfterVerdict(ans) {
    for (var i = 0; i < ans.sections.length; i++) {
      if (ans.sections[i].kind === 'verdict') return i + 1;
    }
    return 0;
  }

  function sectionIndexAfterEvidence(ans) {
    for (var i = 0; i < ans.sections.length; i++) if (ans.sections[i].kind === 'evidence') return i + 1;
    for (var j = 0; j < ans.sections.length; j++) if (ans.sections[j].kind === 'verdict') return j + 1;
    return 0;
  }

  var MAX_Q = 200;   /* 单次提问长度上限 */

  /* 来源类型与停止原因的中文标签（渲染用） */
  var SOURCE_TYPE_LABEL = {
    paper: '论文', encyclopedia: '百科', image: '影像', database: '数据库'
  };
  var STOP_REASON_LABEL = {
    covered: '子问题已覆盖', maxRounds: '达到轮数上限', maxCalls: '达到调用上限',
    budget: '超出时间预算', noNew: '无新增结果', noAnchor: '无可提取锚点',
    noGap: '无待补子问题', noQuery: '无可用检索词', skip: '本地计算',
    empty: '无结果', done: '完成'
  };
  function stopReasonLabel(r) { return tn(STOP_REASON_LABEL[r] || r); }

  /* ============================================================
     检索结果 → 答案的组装（阶段 A2 / D）
     ============================================================ */

  /* 从答案里解析出用于检索的实体名与英文名
   * 英文名是论文类端点的前提；取不到时 Research 会降级为只查百科并标注。 */
  function entityForResearch(ans) {
    var name = '', en = '';
    if (ans.meta && ans.meta.target) name = String(ans.meta.target);
    if (!name && ans.targets && ans.targets.length) {
      var t = ans.targets[0].item;
      name = t.kind === 'kb' ? t.entry.cn : (t.name || t.cn || '');
      if (t.kind === 'kb' && t.entry.en) en = t.entry.en;
      else if (t.en) en = t.en;
    }
    /* 知识库条目里带 en 字段，用它比猜更可靠 */
    if (name && !en && window.KNOWLEDGE) {
      for (var i = 0; i < KNOWLEDGE.entries.length; i++) {
        var e = KNOWLEDGE.entries[i];
        if (e.cn === name) { en = e.en || ''; break; }
      }
    }
    if (name && !en && S.enQueryFor) {
      var x = S.enQueryFor(name);
      if (x && x !== name) en = x;
    }
    return { name: name, en: en };
  }

  /* 收集本地知识库声明的来源，供引用核验比对 */
  function localSourcesOf(ans) {
    var out = [];
    ans.sections.forEach(function (s) {
      if (s.kind === 'evidence' && s.sources) {
        s.sources.forEach(function (x) { out.push(x); });
      }
    });
    return out;
  }

  /* 把检索结果写回答案：证据章节 + 冲突 + 引用核验 + 元信息 */
  function applyResearch(ans, rec, question, runCfg) {
    /* 0) 本地知识库未覆盖、但检索到了资料时，改写结论 —— 这是原先最糟糕的
     *    体验：明明检索到了内容，却回答「不在可确证范围内」。
     *    注意 composeFallback 只生成 boundary，没有 verdict，因此这里要补一个。
     *    改写只陈述「资料覆盖了什么」与「本地未收录」，不替用户下科学结论，
     *    具体内容由下方证据章节按子问题给出并附出处。 */
    /* 检索结果的相关性门槛：只有存在「可溯源」证据才允许改口说有资料。
     * 否则会出现用户实测的矛盾——大标题声称「已检索到 4 条相关资料」，
     * 正文却说「跟天文无关，不能拿来当观测依据」。 */
    var dropResearch = false;
    if (ans.intent === 'unknown' && rec.evidence && rec.evidence.length) {
      var syn0 = Research.synthesize(rec);
      var usableN = syn0.counts.supported || 0;
      if (usableN > 0) {
        var headTxt = '本地知识库未收录这个问题；已检索到 ' + usableN + ' 条可用资料。';
        /* 统计与时间范围由「证据概览」统一呈现，结论副标题不再重复 */
        var subTxt = (syn0.gaps.length ? '未覆盖：' + syn0.gaps.join('、') + '。' : '') +
          '以下按方面列出原文摘录与出处，未作改写。';
        var v = ans.sections.filter(function (s) { return s.kind === 'verdict'; })[0];
        if (v) {
          v.head = headTxt;
          v.sub = subTxt;
        } else {
          ans.sections.unshift({ kind: 'verdict', head: headTxt, sub: subTxt, chips: [] });
        }
        /* 原先的「我可以回答的方向」边界声明与新结论重复，移除 */
        ans.sections = ans.sections.filter(function (s) {
          return !(s.kind === 'boundary' && /可确证的范围/.test(s.text || ''));
        });
        ans.meta.confidence = Math.min(0.55, 0.25 + usableN * 0.05);
        ans.meta.freshness = 'live';
        /* 已经查到可用资料，就不再是「未知」：
         * 清掉生产者预设的档位，让 classify 按实际内容重新判定（→ fetch）；
         * 同时撤掉「缺口」章节，否则结论说「查到 1 条」、下面却说「本地没有依据」。 */
        delete ans.meta.tier;
        ans.sections = ans.sections.filter(function (s) { return s.kind !== 'gap'; });
      } else {
        /* 检到了东西但一条都不可用：不改口、不堆砌。
         * 用一句小字挂在结论下面，不用大号 BOUNDARY 卡片——失败态不值得那么多版面。 */
        dropResearch = true;
        var vv = ans.sections.filter(function (s) { return s.kind === 'verdict'; })[0];
        var noteTxt = '已检索 ' + (syn0.counts.evidence || 0) + ' 条，均与问题无关，未采用。';
        if (vv) { vv.sub = vv.sub ? (vv.sub + ' ' + noteTxt) : noteTxt; }
        else { ans.sections.unshift({ kind: 'verdict', head: '本地没有这个问题的依据。', sub: noteTxt }); }
        ans.meta.freshness = 'static';
      }
    }

    /* 结论层骨架：结论 → 依据（关键数据）→ 证据 → 观测 → 边界。
     * 检索证据插在「依据」之后，而不是紧贴结论，避免细节层压住结论层。 */
    var at = sectionIndexAfterEvidence(ans);

    /* 1) 证据章节（综合 → 按子问题分组的原始证据 → 冲突） */
    /* Scholar 的证据门槛与深度在这里注入，让设置真的生效 */
    if (runCfg && runCfg.scholar) {
      rec.scholar = { evidence: runCfg.scholar.evidence, depth: runCfg.scholar.depth };
    }
    var secs = Research.toSections(rec);

    /* 1b) 去重：已被「证据概览」摘录过的条目，不再在下方列表里重复整段原文。
     *     概览里的要点本身带链接、可点开，因此丢弃重复项不会丢出处。 */
    var shownIds = {};
    secs.forEach(function (s) {
      if (s.kind === 'synthesis') {
        (s.groups || []).forEach(function (g) {
          (g.points || []).forEach(function (p) { if (p.id) shownIds[p.id] = 1; });
        });
      }
    });
    if (Object.keys(shownIds).length) {
      secs = secs.reduce(function (acc, s) {
        if (s.kind !== 'web' || !s.items || !s.items.length) { acc.push(s); return acc; }
        var rest = s.items.filter(function (it) { return !shownIds[it.id]; });
        if (rest.length === s.items.length) { acc.push(s); return acc; }
        /* 全部重复 → 该章节没有增量信息，整节去掉 */
        if (!rest.length) return acc;
        acc.push(Object.assign({}, s, { items: rest, note: (s.note ? s.note + ' · ' : '') + '其余条目已在上方摘录' }));
        return acc;
      }, []);
    }

    /* 2) 引用核验 */
    var verify = Research.verifyCitations(ans, rec.evidence || [], {
      localSources: localSourcesOf(ans)
    });
    rec.citations = verify;

    /* 3) 组装并插入：综合/证据 → 冲突 → 引用核验（结果全不可用时整体不插入） */
    var block = dropResearch ? [] : secs.slice();
    if (!dropResearch) block.push({
      kind: 'citation', title: '引用核验',
      verdict: verify.verdict,
      total: verify.total, withUrl: verify.withUrl, withDate: verify.withDate,
      supported: verify.supported, pending: verify.pending,
      corroborated: verify.corroborated, unattested: verify.unattested,
      note: verify.note
    });

    for (var i = block.length - 1; i >= 0; i--) {
      ans.sections.splice(at, 0, block[i]);
    }

    /* 4) 元信息与追踪 */
    ans.meta.research = {
      profile: rec.plan && rec.plan.profile,
      profileLabel: rec.plan && rec.plan.label,
      skip: !!(rec.plan && rec.plan.skip),
      skipReason: (rec.plan && rec.plan.skipReason) || '',
      rounds: (rec.rounds || []).length,
      queries: rec.rounds && rec.rounds[0] ? rec.rounds[0].queries : [],
      anchors: rec.anchors || [],
      calls: rec.calls || 0,
      stopReason: rec.stopReason,
      evidence: (rec.evidence || []).length,
      supported: (rec.evidence || []).filter(function (e) { return e.status === 'supported'; }).length,
      conflicts: (rec.conflicts || []).length,
      degraded: !!(rec.plan && rec.plan.degraded),
      degradedReason: (rec.plan && rec.plan.degradedReason) || '',
      ms: rec.ms || 0
    };

    ans.trace.push({
      agent: 'muse', action: '检索规划',
      detail: (rec.plan && rec.plan.label || '检索') + ' · ' +
        ((rec.plan && rec.plan.subs) || []).length + ' 个子问题 · ' +
        (rec.plan && rec.plan.types ? rec.plan.types.join('/') : '')
    });
    /* Scholar 只在真的拿到论文时出场，不空跑 */
    var papers = (rec.evidence || []).filter(function (e) { return e.sourceType === 'paper'; });
    if (papers.length) {
      var preprints = papers.filter(function (e) { return e.version === 'preprint'; }).length;
      var withDoi = papers.filter(function (e) { return e.doi; }).length;
      ans.trace.push({
        agent: 'scholar', action: '文献取证',
        detail: papers.length + ' 篇论文 · ' + withDoi + ' 篇有 DOI' +
          (preprints ? ' · ' + preprints + ' 篇预印本' : '') +
          ' · 可溯源 ' + papers.filter(function (e) { return e.status === 'supported'; }).length + ' 篇'
      });
    }
    if (rec.rounds && rec.rounds.length) {
      ans.trace.push({
        agent: 'vega', action: '多源检索',
        detail: rec.rounds.map(function (r) {
          return '第' + r.round + '轮 ' + r.queries.length + ' 词 → ' + r.raw + ' 条';
        }).join('；') + ' · 去重后 ' + (rec.evidence || []).length + ' 条 · 停止因 ' + rec.stopReason
      });
    }
    if (verify.verdict !== 'verified') {
      ans.trace.push({
        agent: 'critic', action: '引用核验',
        detail: verify.note
      });
    }
  }

  /* 供云端模型使用的证据摘要（只传结构化要点，不传整段 HTML） */
  function evidenceForPrompt(ans) {
    var out = [];
    ans.sections.forEach(function (s) {
      if (s.kind === 'web' && s.items) {
        s.items.forEach(function (it) {
          out.push({
            id: it.id, title: it.title, host: it.host, date: it.date || '',
            sourceType: it.sourceType || '', status: it.status || '',
            excerpt: String(it.excerpt || it.snippet || '').slice(0, 320),
            url: it.url || ''
          });
        });
      }
    });
    return out.slice(0, 8);
  }

  /* ============================================================
     附件：任意类型可添加，按类型如实解析（见 core/attachments.js）
     ============================================================ */
  var ATTACH_KIND_LABEL = { image: '图片', text: '文本', fits: 'FITS', other: '文件' };

  function bindAttachments() {
    var btn = $('#btnAttach');
    var inp = $('#fileInput');
    if (btn && inp) {
      btn.addEventListener('click', function () { inp.click(); });
      inp.addEventListener('change', function () {
        addFiles(inp.files);
        inp.value = '';          /* 允许重复选择同一文件 */
      });
    }

    /* 拖拽到输入区 */
    var comp = $('#composer');
    if (comp) {
      var over = function (e) { e.preventDefault(); comp.classList.add('dropping'); };
      var leave = function () { comp.classList.remove('dropping'); };
      comp.addEventListener('dragover', over);
      comp.addEventListener('dragenter', over);
      comp.addEventListener('dragleave', leave);
      comp.addEventListener('drop', function (e) {
        e.preventDefault();
        leave();
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
          addFiles(e.dataTransfer.files);
        }
      });
    }

    /* 粘贴图片或文件 */
    var ta = $('#input');
    if (ta) {
      ta.addEventListener('paste', function (e) {
        var items = (e.clipboardData && e.clipboardData.files) || null;
        if (items && items.length) {
          e.preventDefault();
          addFiles(items);
        }
      });
    }
  }

  function addFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    if (!files.length) return;
    var room = A_ATT.LIMITS.maxFiles - state.attachments.length;
    if (room <= 0) {
      toast('最多 ' + A_ATT.LIMITS.maxFiles + ' 个附件，请先移除');
      return;
    }
    if (files.length > room) {
      files = files.slice(0, room);
      toast('超出上限，只添加前 ' + room + ' 个');
    }
    var pending = files.map(function (f) {
      return A_ATT.process(f).catch(function (e) {
        return {
          id: 'F' + Math.random().toString(36).slice(2, 7),
          name: f.name || '未命名', size: f.size || 0, sizeText: A_ATT.fmtSize(f.size || 0),
          kind: 'other', status: 'error', note: '处理失败：' + (e && e.message || e),
          text: '', thumb: '', full: '', fits: null
        };
      });
    });
    return Promise.all(pending).then(function (list) {
      list.forEach(function (it) { state.attachments.push(it); });
      renderAttachTray();
      var bad = list.filter(function (x) { return x.status === 'error' || x.status === 'unparsed'; }).length;
      if (bad) toast('已添加 ' + list.length + ' 个附件，其中 ' + bad + ' 个未能解析（已标注原因）');
    });
  }

  function removeAttach(id) {
    state.attachments = state.attachments.filter(function (x) { return x.id !== id; });
    renderAttachTray();
  }

  function clearAttach() {
    state.attachments = [];
    renderAttachTray();
  }

  function renderAttachTray() {
    var tray = $('#attachTray');
    if (!tray) return;
    var list = state.attachments || [];
    if (!list.length) {
      tray.hidden = true;
      tray.innerHTML = '';
      return;
    }
    tray.hidden = false;
    tray.innerHTML = '';
    list.forEach(function (it) {
      var chip = el('div', 'atch atch-' + it.kind);
      var thumb = '';
      if (it.kind === 'image' && it.thumb) {
        thumb = '<span class="atch-thumb"><img alt="" src="' + esc(it.thumb) + '"></span>';
      } else {
        thumb = '<span class="atch-ic">' + esc((it.ext || '.' + it.kind).replace('.', '').slice(0, 4).toUpperCase()) + '</span>';
      }
      var meta = A_ATT.fmtSize(it.size) + ' · ' + (ATTACH_KIND_LABEL[it.kind] || '文件');
      if (it.kind === 'fits' && it.fits && it.fits.hasCoords) meta += ' · 含坐标';
      var warn = (it.status === 'error' || it.status === 'unparsed' || it.status === 'partial' || it.status === 'too-large')
        ? '<span class="atch-warn">' + esc(it.note || '') + '</span>' : '';
      chip.innerHTML = thumb +
        '<span class="atch-body"><span class="atch-name">' + esc(it.name) + '</span>' +
        '<span class="atch-meta">' + esc(meta) + '</span>' + warn + '</span>' +
        '<button class="atch-x" aria-label="移除">×</button>';
      chip.querySelector('.atch-x').addEventListener('click', function (e) {
        e.stopPropagation();
        removeAttach(it.id);
      });
      tray.appendChild(chip);
    });
  }

  /* 附件章节：在答案里如实列出每个附件被怎么处理了 */
  function attachSection(items) {
    if (!items || !items.length) return null;
    return {
      kind: 'attach', title: '附件',
      items: items.map(function (it) {
        var o = {
          id: it.id, name: it.name, kind: it.kind,
          kindLabel: ATTACH_KIND_LABEL[it.kind] || '文件',
          size: it.sizeText, status: it.status, note: it.note,
          thumb: it.thumb || '', width: it.width, height: it.height
        };
        if (it.kind === 'fits' && it.fits) {
          o.facts = it.fits.facts;
          o.hasCoords = it.fits.hasCoords;
          o.ra = it.fits.ra; o.dec = it.fits.dec;
        }
        if (it.kind === 'text') o.chars = (it.text || '').length;
        return o;
      })
    };
  }

  /* 从附件里提取可用于「定向」的线索。
   * 目的：用户问「这张图拍的是什么」时，答案应当围绕附件里的目标，而不是另起话题。
   * 只取强信号（FITS 的 OBJECT、文本里显式的 目标/对象 字段），避免把整段文本塞进查询污染意图判定。 */
  function attachHints(items) {
    var hints = [];
    (items || []).forEach(function (it) {
      if (it.kind === 'fits' && it.fits && it.fits.header && it.fits.header.OBJECT) {
        var obj = String(it.fits.header.OBJECT).trim();
        if (obj && obj.length <= 40) hints.push(obj);
      }
      if (it.kind === 'text' && it.text) {
        var m = it.text.match(/(?:^|\n)\s*(?:目标|对象|天体|object|target)\s*[:：]\s*([^\n，,；;]{1,40})/i);
        if (m && m[1]) hints.push(m[1].trim());
      }
    });
    /* 去重，最多两个，避免查询过长 */
    var seen = {}, out = [];
    hints.forEach(function (h) {
      var k = h.toLowerCase();
      if (seen[k]) return;
      seen[k] = 1;
      out.push(h);
    });
    return out.slice(0, 2);
  }

  /* 输入归一与校验的唯一入口。
   * 主输入框超长时截断并提示；编辑框超长时拒绝——用户应自己决定删哪句，
   * 静默截断会让人以为发出的是原文。两个入口共用同一套清理与「必须含文字/数字」规则。 */
  function normalizeQuery(raw, opt) {
    opt = opt || {};
    var max = opt.maxLen || MAX_Q;
    var s = String(raw == null ? '' : raw)
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!s) return { ok: false, code: 'empty', text: '', msg: '请输入包含文字或数字的内容' };
    if (!/[\w一-龥]/.test(s)) return { ok: false, code: 'symbol', text: s, msg: '请输入包含文字或数字的内容' };
    if (s.length > max) {
      return opt.overflow === 'truncate'
        ? { ok: true, code: 'truncated', text: s.slice(0, max), msg: '提问已截断到 ' + max + ' 字' }
        : { ok: false, code: 'toolong', text: s, msg: '超过 ' + max + ' 字，请缩短' };
    }
    return { ok: true, code: 'ok', text: s, msg: '' };
  }

  function ask(text) {
    /* 只有附件、没有文字时用中性默认问题，而不是直接拒绝 */
    var atts = (state.attachments || []).slice();
    var norm = normalizeQuery(text || $('#input').value, { overflow: 'truncate' });
    if (!norm.ok && !(atts.length && norm.code === 'empty')) {
      toast(norm.msg);
      return;
    }
    var q = norm.ok ? norm.text : '请根据我上传的附件给出说明';
    if (norm.code === 'truncated') toast(norm.msg);
    if (state.busy) return;
    $('#input').value = '';
    $('#input').style.height = 'auto';

    if (!state.asked) { state.asked = true; mountComposer('dock'); }

    var city = AC.findCity(q);
    if (city && (!state.place || state.place.n !== city.n)) {
      setPlace(city);
    }

    $('#thread').appendChild(userBubble(q, atts));
    if (window.Thread) {
      try {
        var pU = window.Thread.appendUser(q, atts);
        if (pU && pU.catch) pU.catch(onSaveFail);
      } catch (e) { onSaveFail(e); }
    }
    $('#scroll').scrollTop = $('#scroll').scrollHeight;
    /* 附件已随消息发出，清空待发送区 */
    if (atts.length) clearAttach();

    var src = sourceById(state.settings.sourceId);
    var think = el('div', 'thinking',
      '<span class="wave"><i></i><i></i><i></i></span><span>' +
      ((src.type === 'cloud' || src.type === 'device') ? '核验事实 · 调用 ' + esc(src.name) : 'Muse 解析意图 · 调度智能体') + '</span>');
    $('#thread').appendChild(think);
    $('#scroll').scrollTop = $('#scroll').scrollHeight;
    busy(true);

    setTimeout(function () {
      var ans, ctx;
      var tAgent = taskStart('agent', '编排 · ' + q.slice(0, 16));
      try {
        ctx = readCtx();
        var cfgRun = JSON.parse(JSON.stringify(cfg));
        sourceCfgPatch(cfgRun, src);
        AC.setMemory(state.memory);
        /* 附件里带目标线索时并入查询，让答案围绕附件目标展开；
           展示给用户的仍是原问题（q），只有解析用合并后的串 */
        var hints = attachHints(atts);
        var qForAns = hints.length ? (q + ' ' + hints.join(' ')) : q;
        AC.setGear(state.settings.gearId, state.settings.camId);
        /* 单题适配：只在问句明显偏向另一方向时换讲法，且仅影响这一条 */
        var styleSwitch = null;
        if (state.settings.autoStyle !== false) {
          var stDet = detectStyle(qForAns);
          var stBase = state.settings.persona;
          if (stDet && stBase && stBase !== 'none' && stDet !== stBase && PERSONAS[stDet]) {
            cfgRun.vega.scope = PERSONAS[stDet].register;
            cfgRun.muse.depth = PERSONAS[stDet].depth;
            styleSwitch = { from: stBase, to: stDet, label: PERSONAS[stDet].label };
          }
        }
        ans = AC.buildAnswer(qForAns, ctx, cfgRun);
        if (styleSwitch) ans.meta.styleSwitch = styleSwitch;
        bumpStat('ask', ans.intent);
        /* 承接历史：同意图同目标问过，就把上次结论挂上供渲染层提示（不作为依据） */
        var prevSkill = skillFor(ans.intent, (ans.meta && ans.meta.target) || '');
        if (prevSkill && prevSkill.n && prevSkill.last) {
          ans.meta.recall = { n: prevSkill.n, at: prevSkill.at, last: prevSkill.last };
        }
        ans.query = q;   /* 对外保持原问题 */
        taskEnd(tAgent);
      } catch (e) {
        taskEnd(tAgent, e);
        console.error(e);
        think.remove(); busy(false);
        renderAnswer({
          sections: [{ kind: 'boundary', mode: 'uncertain', text: '计算过程中出现异常：' + e.message + '。未给出答案，以免误导。' }],
          trace: [], meta: { confidence: 0, freshness: 'static', register: 'pop' }
        });
        return;
      }

      var payload = factsFromAnswer(ans);
      /* 视图指令：解析完成后立即执行，并把结果写回结构化章节 */
      if (ans.meta && ans.meta.systemAction) {
        var doneMsg = applySystemAction(ans.meta.systemAction);
        ans.sections.forEach(function (s) { if (s.kind === 'system') s.done = doneMsg; });
        if (doneMsg) toast(doneMsg);
      }
      var ctxLine = ctx.city + ' · ' + ctx.y + '-' + pad(ctx.mo) + '-' + pad(ctx.d) + ' ' + pad(ctx.h) + ':' + pad(ctx.mi);
      var idx = sectionIndexAfterEvidence(ans);

      /* 附件：任何来源都先处理，保证「上传了什么、被怎么处理」可见 */
      if (atts.length) {
        var attSec = attachSection(atts);
        /* 图片但当前来源不支持视觉时，明确告知未送给模型，避免用户误以为「AI 看过了」 */
        if (!src.vision && atts.some(function (it) { return it.kind === 'image'; })) {
          attSec.note = '当前来源「' + src.name + '」不支持图像输入，图片只在本机预览，未发送给模型。' +
            '如需让模型看图，请切换到 OpenAI / Anthropic / Gemini 或本机 Chrome 内置。';
        }
        ans.sections.splice(sectionIndexAfterVerdict(ans), 0, attSec);
        /* FITS 里解出坐标时，直接给一个星图定位入口 */
        var withCoords = atts.filter(function (it) {
          return it.kind === 'fits' && it.fits && it.fits.hasCoords;
        })[0];
        if (withCoords) {
          ans.sections.splice(sectionIndexAfterVerdict(ans) + 1, 0, {
            kind: 'mapref',
            ra: withCoords.fits.ra,
            dec: withCoords.fits.dec,
            label: String(withCoords.fits.header.OBJECT || withCoords.name)
          });
        }
        ans.meta.attachments = A_ATT.brief(atts);
        ans.trace.push({
          agent: 'muse', action: '解析附件',
          detail: atts.map(function (it) {
            return it.name + '（' + (ATTACH_KIND_LABEL[it.kind] || '文件') + '·' + it.status + '）';
          }).join('、')
        });
      }

      /* 问候类输入到此为止：不检索、不调模型，直接给短回答 */
      if (ans.intent === 'smalltalk') {
        think.remove(); busy(false); renderAnswer(ans, {});
        return;
      }

      if (src.type === 'web') {
        busy(true, '规划检索 · 多源取证');
        var tWeb = taskStart('search', '检索 · ' + q.slice(0, 18));
        var ent = entityForResearch(ans);

        Research.run(q, {
          intent: ans.intent,
          entityName: ent.name,
          entityEn: ent.en
        }).then(function (rec) {
          taskEnd(tWeb);
          applyResearch(ans, rec, q, cfgRun);
          think.remove(); busy(false); renderAnswer(ans, {});
        }).catch(function (err) {
          taskEnd(tWeb, err);
          /* 规划层自身异常：仍给出可读结论，并保留本地索引兜底 */
          var loc = localIndexItems(q);
          ans.sections.splice(sectionIndexAfterVerdict(ans), 0, {
            kind: 'web', title: '检索结果', degraded: true, items: loc,
            note: '检索链路异常：' + String(err && err.message || err).slice(0, 90) +
              '。以下为本地索引命中。'
          });
          ans.meta.research = { error: String(err && err.message || err) };
          think.remove(); busy(false); renderAnswer(ans, {});
        });
        return;
      }

      if (src.type === 'cloud' || src.type === 'device') {
        if (!src.hasKey) {
          ans.sections.splice(idx, 0, noteFor(src,
            '该来源尚未配置密钥，本次表述仍由本地内核生成。在「设置 → 来源与密钥」填入密钥后可切换为真实调用。', 0, true));
          think.remove(); busy(false); renderAnswer(ans, {});
          return;
        }
        busy(true, '检索取证 · 调用 ' + src.name);
        var tModel = taskStart('model', src.name + ' · ' + (src.model || ''));
        var ent2 = entityForResearch(ans);

        /* 先检索取证，再把证据交给模型 —— 模型只依据「本地事实 + 本轮证据」作答，
           避免它只复述本地知识库，也避免它自己编造外部资料。 */
        Research.run(q, {
          intent: ans.intent, entityName: ent2.name, entityEn: ent2.en
        }).then(function (rec) {
          applyResearch(ans, rec, q, cfgRun);
          /* 契约：没有任何可核实事实时不外发模型。
           * 模型手上只有「缺口说明」时，只会把它改写成一段貌似结论的话，
           * 于是大标题与正文互相矛盾（用户实测：标题说「检索到 4 条相关资料」，
           * 正文说「跟天文无关」）。 */
          if (window.AstroRuntime && window.AstroRuntime.classify(ans).key === 'unknown') {
            ans.sections.splice(sectionIndexAfterEvidence(ans), 0, noteFor(src,
              '本轮没有可核实的事实，未调用模型——避免它在无依据时生成看起来像结论的表述。', 0, true));
            think.remove(); busy(false); renderAnswer(ans, {});
            return;
          }
          var ev = evidenceForPrompt(ans);
          var pay2 = factsFromAnswer(ans);
          return S.generate(src.id, {
            question: q, facts: pay2.facts, para: pay2.para,
            evidence: ev,
            /* 附件：文本类作为参考材料；图片仅发给声明支持视觉的来源 */
            attachments: A_ATT.forPrompt(atts),
            images: src.vision ? A_ATT.imagesForPrompt(atts) : [],
            tone: state.settings.register === 'pro' ? 'academic' : 'warm', context: ctxLine,
            memory: memoryForPrompt()
          }).then(function (r) {
            taskEnd(tModel);
            var txt = r.text || '模型返回为空，已保留本地表述。';
            var extra = [];
            if (r.text) {
              /* 数值核验：事实层 + 本轮证据一起作为出处池 */
              var pool = pay2.facts.concat(ev.map(function (e) {
                return { label: e.title, value: e.excerpt };
              }));
              var bad = numericAudit(r.text, pool, pay2.para);
              if (bad.length) extra.push('输出中的数值 ' + bad.join('、') + ' 未能在事实层或本轮证据中找到出处，请以「依据」与「检索证据」章节为准。');
              /* 引用核验：文中若出现 [E#]，必须存在于本轮证据 */
              var fake = fakeCitations(r.text, rec.evidence || []);
              if (fake.length) extra.push('文中引用的 ' + fake.join('、') + ' 不在本轮检索结果中，已标为无效引用。');
            }
            var insertAt = sectionIndexAfterVerdict(ans);
            ans.sections.splice(insertAt, 0, noteFor(src, txt + (extra.length ? '\n（' + extra.join(' ') + '）' : ''), r.latency, !r.text));
            think.remove(); busy(false); renderAnswer(ans, { latency: r.latency });
          });
        }).catch(function (err) {
          taskEnd(tModel, err);
          ans.sections.splice(sectionIndexAfterVerdict(ans), 0, noteFor(src,
            '调用失败：' + err.message + '。已回退本地表述，数值未受影响。', 0, true));
          think.remove(); busy(false); renderAnswer(ans, {});
        });
        return;
      }

      if (state.settings.mode === 'compare') {
        var cols = [];
        /* 检索列：始终参与，失败则给出本地索引或失败说明 */
        var sqc = (ans.meta && ans.meta.target) ? ans.meta.target : q;
        cols.push(S.search(sqc).then(function (r) {
          return {
            name: '联网检索', dot: '#1a7d5b', sigil: '网',
            text: r.items.map(function (it) { return it.title + '：' + it.snippet; }).join('　｜　').slice(0, 260),
            latency: 0
          };
        }).catch(function (e) {
          var loc = localIndexItems(sqc);
          return {
            name: '联网检索', dot: '#1a7d5b', sigil: '网',
            text: loc.length ? '（联网不可用，改用本地索引）' + loc[0].snippet : '检索不可用：' + e.message,
            latency: 0, fallback: true
          };
        }));
        /* 云端列：已连接的模型最多一个，避免过宽 */
        S.list().filter(function (x) { return x.type === 'cloud' && x.status.state === 'ready'; })
          .slice(0, 1).forEach(function (c) {
            cols.push(S.generate(c.id, {
              question: q, facts: payload.facts, para: payload.para, tone: 'warm', context: ctxLine,
              memory: memoryForPrompt()
            }).then(function (r) {
              return { name: c.name, dot: c.dot, sigil: initials(c), text: r.text || '（空响应）', latency: r.latency };
            }).catch(function (e) {
              return { name: c.name, dot: c.dot, sigil: initials(c), text: '调用失败：' + e.message, latency: 0, fallback: true };
            }));
          });
        busy(true, '并行比对 ' + (cols.length + 1) + ' 个来源');
        Promise.all(cols).then(function (list) {
          list.unshift({
            name: '本地内核', dot: '#3b3bd6', sigil: '✦',
            text: payload.para || '（本地表述）', latency: 0
          });
          /* Curator：合并不同来源中重复的事实点，保留差异 */
          var merged = AC.curate(list.map(function (it) {
            return { title: it.name, text: it.text, name: it.name, dot: it.dot, sigil: it.sigil, latency: it.latency, fallback: it.fallback, _raw: it.text };
          }));
          var cols2 = merged.map(function (m) {
            var src = m._raw;
            var txt = src;
            if (m.merged && m.merged.length) {
              txt = src + '\n　（与「' + m.merged.map(function (x) { return x.name; }).join('、') + '」表述一致，已合并去重）';
            }
            return { name: m.name, dot: m.dot, sigil: m.sigil, text: txt, latency: m.latency, fallback: m.fallback };
          });
          ans.trace.push(step('curator', '多来源去重', merged.length + ' 列 · 合并 ' +
            (merged.filter(function (m) { return m.merged && m.merged.length; }).length) + ' 组重复表述'));
          sortTrace(ans.trace);
          ans.sections.splice(idx, 0, { kind: 'compare', items: cols2 });
          think.remove(); busy(false); renderAnswer(ans, {});
        });
        return;
      }

      think.remove(); busy(false); renderAnswer(ans, {});
    }, 520);
  }

  /* ================= 提示 ================= */
  var toastTimer = null;
  function toast(msg) {
    var t = $('#toast');
    if (!t) {
      t = el('div', 'toast');
      t.id = 'toast';
      /* 读屏播报：toast 是唯一的即时反馈通道，必须有 live region */
      t.setAttribute('role', 'status');
      t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2800);
  }

  /* ================= 观测台开关 ================= */
  function toggleObs(force) {
    var wide = window.innerWidth > 1120;
    if (wide) {
      state.settings.showObs = (force === undefined) ? !state.settings.showObs : !!force;
      document.body.classList.toggle('obs-collapsed', !state.settings.showObs);
      persist();
    } else {
      var on = (force === undefined) ? !$('#obsPanel').classList.contains('on') : !!force;
      $('#obsPanel').classList.toggle('on', on);
      $('#scrim').classList.toggle('on', on);
    }
  }

  /* ================= 全屏星图 ================= */
  var vw = { yaw: 180, pitch: 32, fov: 145, level: 'full', drag: null, focus: null, hover: null };

  function viewerPayload() {
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var top = (state.preview && state.preview.list[0]) || null;
    var hl = vw.focus || (top ? { ra: top.ra, dec: top.dec, label: top.name } : null);
    return {
      jd: jd, lat: ctx.lat, lon: ctx.lon,
      highlight: hl,
      phase: state.preview ? state.preview.moon : A.moonPhase(jd),
      style: vw.level === 'full' ? 'full' : 'labeled',
      detail: vw.level === 'full',
      yaw: vw.yaw, pitch: vw.pitch, fov: vw.fov, compact: false, showGlobe: true,
      interactive: vw.interactive === true
    };
  }

  /* 帧合并：把连续的重绘请求合并到下一帧，避免事件洪水时重复绘制 */
  var viewerRAF = 0;
  function drawViewer() {
    if (viewerRAF) return;
    viewerRAF = requestAnimationFrame(function () {
      viewerRAF = 0;
      var cv = $('#viewerCanvas');
      drawSky(cv, viewerPayload());
    });
  }
  /* 需要立刻拿到画面时用这个（同步绘制一次） */
  function drawViewerNow() {
    var cv = $('#viewerCanvas');
    drawSky(cv, viewerPayload());
  }

  function applyViewerTransform() {
    $('#vwVal').textContent = Math.round(vw.fov) + '°';
  }

  function aimAt(ra, dec) {
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var aa = A.altAz(ra, dec, jd, ctx.lat, ctx.lon);
    vw.yaw = aa.az;
    vw.pitch = Math.max(4, Math.min(72, aa.alt - 6));
  }

  function resetViewer() {
    if (vw.focus) {
      vw.fov = 72;
      aimAt(vw.focus.ra, vw.focus.dec);
    } else {
      vw.yaw = 180; vw.pitch = 32; vw.fov = 145;
    }
    drawViewer();
    applyViewerTransform();
  }

  function sizeViewerCanvas() {
    var stage = $('#viewerStage');
    var cw = stage.clientWidth || 1200, ch = stage.clientHeight || 700;
    var w = Math.min(cw * 0.99, ch * 16 / 10);
    var cv = $('#viewerCanvas');
    cv.style.width = w + 'px';
    cv.style.height = (w * 10 / 16) + 'px';
  }

  function openViewer(opts) {
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    opts = opts || {};
    if (opts.ra != null) {
      vw.focus = { ra: opts.ra, dec: opts.dec, label: opts.label || '' };
    } else {
      vw.focus = null;
    }
    vw.level = vw.level || 'labeled';
    $('#viewerMeta').textContent = ctx.city + ' · ' + ctx.y + '-' + pad(ctx.mo) + '-' + pad(ctx.d) +
      ' ' + pad(ctx.h) + ':' + pad(ctx.mi) + ' · ' + ctx.lat.toFixed(2) + '°, ' + ctx.lon.toFixed(2) + '°';
    $('#viewer').classList.add('on');
    $('#viewer').setAttribute('aria-hidden', 'false');
    sizeViewerCanvas();
    renderBodyRail();
    requestAnimationFrame(function () {
      sizeViewerCanvas();
      resetViewer();
    });
    resetViewer();
    hideObjInfo();
    $$('#viewerLabels button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lv === vw.level);
    });
  }

  /* 天体导航：九大天体常驻可见，点击即定位并展开资料卡 */
  function renderBodyRail() {
    var box = $('#bodyRail');
    if (!box) return;
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var list = bodyList(jd, state.preview ? state.preview.moon : A.moonPhase(jd));
    box.innerHTML = list.map(function (b, i) {
      var aa = A.altAz(b.ra, b.dec, jd, ctx.lat, ctx.lon);
      var up = aa.alt > 0;
      var col = (b.info && b.info.color) || '#cfd6e4';
      return '<button class="br-chip' + (up ? '' : ' down') + '" data-i="' + i + '">' +
        '<i style="background:' + col + '"></i><b>' + esc(b.name) + '</b>' +
        '<em>' + (up ? Math.round(aa.alt) + '°' : '地下') + '</em></button>';
    }).join('');
    box._list = list;
    $$('.br-chip', box).forEach(function (btn) {
      btn.addEventListener('click', function () {
        var b = box._list[+btn.dataset.i];
        var aa = A.altAz(b.ra, b.dec, jd, ctx.lat, ctx.lon);
        $$('.br-chip', box).forEach(function (x) { x.classList.toggle('on', x === btn); });
        if (aa.alt > -1) {
          vw.focus = { ra: b.ra, dec: b.dec, label: b.name };
          aimAt(b.ra, b.dec);
          vw.fov = 66;
          drawViewer();
          applyViewerTransform();
        } else {
          toast(b.name + ' 此刻在地平线以下（高度 ' + Math.round(aa.alt) + '°）');
        }
        describeObject({ type: b.kind, data: b });
      });
    });
  }

  function openViewerAt(ra, dec, label) { openViewer({ ra: ra, dec: dec, label: label }); }

  function showSkyTip(e, obj) {
    var tip = $('#skyTip');
    var name = '', sub = '';
    if (obj.type === 'planet' || obj.type === 'moon' || obj.type === 'sun') {
      var b = obj.data;
      name = b.name;
      sub = (b.info && b.info.type ? b.info.type : '天体') + ' · ' + Math.round(b.alt) + '° ' + A.fmtDeg(b.az, 'az').split('（')[0];
    } else if (obj.type === 'dso') {
      name = obj.data.cn; sub = obj.data.type + ' · ' + obj.data.id;
    } else {
      name = obj.data.cn || obj.data.en;
      sub = '恒星 · 视星等 ' + obj.data.mag;
    }
    tip.innerHTML = '<b>' + esc(name) + '</b><span>' + esc(sub) + '</span>';
    var rect = $('#viewerStage').getBoundingClientRect();
    tip.style.left = Math.min(e.clientX - rect.left + 14, rect.width - 170) + 'px';
    tip.style.top = Math.max(8, e.clientY - rect.top - 46) + 'px';
    tip.classList.add('on');
    $('#viewerCanvas').style.cursor = 'pointer';
  }

  function hideSkyTip() {
    var tip = $('#skyTip');
    if (tip) tip.classList.remove('on');
    var cv = $('#viewerCanvas');
    if (cv) cv.style.cursor = '';
  }

  function hideObjInfo() {
    var n = $('#viewerInfo');
    if (n) { n.classList.remove('on'); n.innerHTML = ''; }
  }

  function describeObject(obj) {
    var ctx = state.ctx || readCtx();
    var jd = A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz);
    var name = '', kind = '', mag = null, ra = null, dec = null, extra = '', summary = '';

    if (obj.type === 'planet' || obj.type === 'moon' || obj.type === 'sun') {
      var b = obj.data, inf = b.info || {};
      var aa0 = A.altAz(b.ra, b.dec, jd, ctx.lat, ctx.lon);
      var rows0 = [];
      rows0.push(['类型', inf.type || '天体']);
      if (inf.diameter) rows0.push(['直径', inf.diameter]);
      if (b.dist != null) rows0.push(['距地（此刻）', b.dist < 0.01
        ? (b.dist * 149597870.7).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' km'
        : b.dist.toFixed(3) + ' AU']);
      if (inf.distance) rows0.push(['轨道距离', inf.distance]);
      if (inf.period) rows0.push(['公转周期', inf.period]);
      if (inf.day) rows0.push(['自转周期', inf.day]);
      if (inf.moons) rows0.push(['卫星', inf.moons]);
      if (inf.temp) rows0.push(['温度', inf.temp]);
      rows0.push(['此刻位置', Math.round(aa0.alt) + '° · ' + A.fmtDeg(aa0.az, 'az')]);
      if (b.mag != null) rows0.push(['视星等', String(b.mag)]);
      rows0.push(['可见性', aa0.alt > 0 ? '已升起' : '在地平线以下']);

      var box0 = $('#viewerInfo');
      var obsHtml = '';
      if (inf.observed && inf.observed.length) {
        obsHtml = '<div class="oi-obs"><div class="oi-cap">实测面貌</div>' +
          inf.observed.map(function (o) {
            return '<div class="oi-obs-row"><b>' + esc(o[0]) + '</b><span>' + esc(o[1]) + '</span></div>';
          }).join('') + '</div>';
      }
      var misHtml = (inf.missions && inf.missions.length)
        ? '<div class="oi-cap">观测任务</div><div class="oi-missions">' +
          inf.missions.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>'
        : '';
      var srcHtml = (inf.sources && inf.sources.length)
        ? '<div class="oi-src">来源：' + inf.sources.map(function (x) {
            return '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>';
          }).join(' · ') + '</div>'
        : '';
      box0.innerHTML = '<div class="oi-head"><b>' + esc(b.name) + '</b><button class="mini-btn" id="oiClose">×</button></div>' +
        '<div class="oi-rows">' + rows0.map(function (r) {
          return '<div class="oi-row"><span>' + esc(r[0]) + '</span><em>' + esc(r[1]) + '</em></div>';
        }).join('') + '</div>' +
        '<p class="oi-sum">' + esc(inf.intro || '') + '</p>' +
        obsHtml + misHtml + srcHtml +
        '<div class="oi-acts"><button class="btn-tiny dark" id="oiAsk">追问这个天体</button>' +
        '<button class="btn-tiny" id="oiCenter">居中观看</button></div>';
      box0.classList.add('on');
      $('#oiClose').addEventListener('click', hideObjInfo);
      $('#oiAsk').addEventListener('click', function () {
        closeViewer();
        ask(b.name + (b.kind === 'planet' ? '现在在哪？' : '是什么？'));
      });
      $('#oiCenter').addEventListener('click', function () {
        vw.focus = { ra: b.ra, dec: b.dec, label: b.name };
        aimAt(b.ra, b.dec); vw.fov = 48;
        drawViewer(); applyViewerTransform();
      });
      return;
    }

    if (obj.type === 'star') {
      var st = obj.data;
      name = st.cn || st.en; kind = '恒星';
      mag = st.mag; ra = st.ra; dec = st.dec;
      var con = C.constellations.filter(function (c) { return c.abbr === st.con; })[0];
      extra = (st.bayer ? st.bayer + ' ' + st.con : st.con) + (con ? ' · ' + con.cn : '');
    } else if (obj.type === 'dso') {
      var d = obj.data;
      name = d.cn; kind = d.type + '（' + d.id + '）';
      mag = d.mag; ra = d.ra; dec = d.dec;
      summary = d.desc || '';
    } else if (obj.type === 'planet') {
      name = obj.data.name; kind = '行星';
      mag = obj.data.raw ? obj.data.raw.mag : null;
      ra = obj.data.ra; dec = obj.data.dec;
      summary = obj.data.note || '';
    } else if (obj.type === 'moon') {
      name = '月球'; kind = '天然卫星';
      ra = obj.data.ra; dec = obj.data.dec;
      summary = obj.data.note || '';
    }

    var kb = K.entries.filter(function (e) {
      return e.cn === name || (e.en && e.en === name) ||
        (e.aliases || []).some(function (a) { return a === name; });
    })[0];
    if (kb) summary = kb.summary;
    if (!summary) summary = '本地星表收录目标，暂无详解条目。';

    var aa = ra != null ? A.altAz(ra, dec, jd, ctx.lat, ctx.lon) : null;
    var rows = [];
    rows.push(['类型', kind]);
    if (mag != null) rows.push(['视星等', String(mag)]);
    if (ra != null) rows.push(['坐标', A.fmtRA(ra) + ' / ' + A.fmtDec(dec)]);
    if (aa) rows.push(['此刻', Math.round(aa.alt) + '° · ' + A.fmtDeg(aa.az, 'az')]);
    if (extra) rows.push(['标识', extra]);
    if (kb) rows.push(['共识', statusLabel(kb.status) + ' · 核验 ' + (kb.verified || '2026-10')]);

    var box = $('#viewerInfo');
    box.innerHTML = '<div class="oi-head"><b>' + esc(name) + '</b><button class="mini-btn" id="oiClose">×</button></div>' +
      '<div class="oi-rows">' + rows.map(function (r) {
        return '<div class="oi-row"><span>' + esc(r[0]) + '</span><em>' + esc(r[1]) + '</em></div>';
      }).join('') + '</div>' +
      '<p class="oi-sum">' + esc(summary) + '</p>' +
      '<div class="oi-acts"><button class="btn-tiny dark" id="oiAsk">追问这个目标</button>' +
      (kb ? '<button class="btn-tiny" id="oiMore">查看完整条目</button>' : '') + '</div>';
    box.classList.add('on');
    $('#oiClose').addEventListener('click', hideObjInfo);
    $('#oiAsk').addEventListener('click', function () {
      closeViewer();
      ask(kind.indexOf('行星') >= 0 ? name + '现在在哪？' : name + '是什么？');
    });
    if (kb && $('#oiMore')) {
      $('#oiMore').addEventListener('click', function () {
        closeViewer();
        ask(name + '距离我们多远？');
      });
    }
  }

  /* 深链定位：#viewer=1&target=土星 —— 打开星图、居中该天体并展开详情卡 */
  function focusObject(name) {
    openViewer();
    setTimeout(function () {
      var hits = ($('#viewerCanvas')._hits || []);
      var want = String(name).trim();
      var found = null;
      for (var i = 0; i < hits.length; i++) {
        var d = hits[i].obj.data || {};
        if (d.name === want || d.cn === want || d.en === want || d.id === want) { found = hits[i].obj; break; }
      }
      if (!found) return;
      aimAt(found.data.ra, found.data.dec);
      vw.fov = 72;
      drawViewer();
      applyViewerTransform();
      describeObject(found);
    }, 420);
  }

  function viewerHit(e) {
    var cv = $('#viewerCanvas');
    var hits = cv._hits || [];
    var rect = cv.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * cv.width;
    var y = (e.clientY - rect.top) / rect.height * cv.height;
    var best = null, bd = 1e9;
    hits.forEach(function (h) {
      var d = Math.hypot(h.x - x, h.y - y);
      if (d < h.r && d < bd) { bd = d; best = h; }
    });
    return best ? best.obj : null;
  }

  function panViewer(deltaAz) {
    vw.yaw = A.norm360(vw.yaw + deltaAz);
    drawViewer();
  }

  function closeViewer() {
    $('#viewer').classList.remove('on');
    $('#viewer').setAttribute('aria-hidden', 'true');
  }

  function zoomViewer(factor) {
    vw.fov = Math.max(40, Math.min(178, vw.fov / factor));
    drawViewer();
    applyViewerTransform();
  }

  /* ================= 太阳系观测视图 ================= */
  var SV = window.SolarView;
  var solarKey = 'earth';

  function fmtMass(kg) {
    var e = Math.floor(Math.log(kg) / Math.LN10);
    var m = kg / Math.pow(10, e);
    return m.toFixed(m >= 100 ? 0 : (m >= 10 ? 1 : 2)) + ' × 10^' + e + ' kg';
  }
  function fmtKm(km) {
    if (km >= 1e8) return (km / 1e8).toFixed(3) + ' 亿 km';
    if (km >= 1e4) return (km / 1e4).toFixed(2) + ' 万 km';
    return Math.round(km).toLocaleString() + ' km';
  }
  function fmtPeriod(d) {
    if (d == null) return '—';
    if (d < 1 / 24) return (d * 1440).toFixed(1) + ' 分钟';
    if (d < 2) return (d * 24).toFixed(2) + ' 小时';
    if (d < 700) return d.toFixed(2) + ' 天';
    return (d / 365.25).toFixed(2) + ' 年';
  }

  function openSolar(opts) {
    if (!SV) return;
    opts = opts || {};
    var box = $('#solar');
    box.classList.add('on');
    box.setAttribute('aria-hidden', 'false');
    solarKey = opts.key || solarKey;
    SV.open({ key: solarKey, level: opts.level || 'system' });
    var ld = $('#solarLoading');
    if (ld) { ld.classList.remove('off'); }
    setTimeout(function () {
      if (ld) ld.classList.add('off');
      SV.sizeCanvas();
      renderSolarRail();
      renderSolarInfo(solarKey);
      syncSolarTools();
    }, 120);
    document.addEventListener('keydown', solarKeys);
  }

  function closeSolar() {
    var box = $('#solar');
    if (!box.classList.contains('on')) return;
    box.classList.remove('on');
    box.setAttribute('aria-hidden', 'true');
    if (SV) SV.close();
    document.removeEventListener('keydown', solarKeys);
  }

  function solarKeys(e) {
    if (!$('#solar').classList.contains('on')) return;
    if (e.key === 'Escape') { closeSolar(); return; }
    if (e.key === '1') { SV.setLevel('system', solarKey); syncSolarTools(); return; }
    if (e.key === '2') { SV.setLevel('planet', solarKey); syncSolarTools(); return; }
    if (e.key === '3') { SV.setLevel('close', solarKey); syncSolarTools(); return; }
    if (e.key === 'l' || e.key === 'L') { SV.setLabels(!SV.state.labels); syncSolarTools(); return; }
    if (e.key === 'r' || e.key === 'R') { SV.reset(); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      var list = S_ALL_KEYS;
      var i = list.indexOf(solarKey);
      var n = e.shiftKey ? (i - 1 + list.length) % list.length : (i + 1) % list.length;
      selectSolar(list[n]);
      return;
    }
    if (e.key === 'ArrowLeft') { SV.zoom(1.12); return; }
    if (e.key === 'ArrowRight') { SV.zoom(0.89); return; }
  }

  var S_ALL_KEYS = [];

  function selectSolar(key) {
    solarKey = key;
    if (SV) SV.select(key);
    renderSolarInfo(key);
    renderSolarRail();
  }

  /* 天体导航条：太阳 → 八大行星 → 主要卫星 */
  function renderSolarRail() {
    var rail = $('#solarRail');
    if (!rail || !window.SOLAR) return;
    var S2 = window.SOLAR;
    S_ALL_KEYS = ['sun'].concat(S2.planets.map(function (p) { return p.key; }))
      .concat(S2.moons.map(function (m) { return m.key; }));
    var html = '';
    html += chip('sun', 'g');
    S2.planets.forEach(function (p) { html += chip(p.key, 'g'); });
    html += '<span class="sep"></span>';
    S2.moons.forEach(function (m) { html += chip(m.key, 'moon'); });
    rail.innerHTML = html;
    $$('.br-chip', rail).forEach(function (b) {
      b.addEventListener('click', function () { selectSolar(b.dataset.k); });
    });
    function chip(key, cls) {
      var bd = S2.byKey[key];
      if (!bd) return '';
      var on = key === solarKey ? ' on' : '';
      var aria = key === solarKey ? ' aria-selected="true"' : '';
      return '<button class="br-chip ' + cls + on + '" data-k="' + key + '" role="option"' + aria + '>' +
        '<i style="background:' + bd.color + '"></i><b>' + esc(bd.cn) + '</b></button>';
    }
  }

  function renderSolarInfo(key) {
    var box = $('#solarInfo');
    if (!box || !SV) return;
    var d = SV.info(key);
    if (!d) { box.classList.remove('on'); return; }
    var rows = [];
    rows.push(['类型', d.kind === 'star' ? '恒星' : d.kind === 'planet' ? '行星' : '卫星']);
    rows.push(['平均半径', d.radiusKm.toLocaleString() + ' km']);
    rows.push(['质量', fmtMass(d.massKg)]);
    if (d.kind === 'star') {
      rows.push(['日心距离', '0（系统中心）']);
      rows.push(['光谱型', 'G2V 主序星']);
    } else if (d.kind === 'planet') {
      rows.push(['日心距离', d.helioAu.toFixed(3) + ' AU（' + fmtKm(d.helioKm) + '）']);
      rows.push(['公转周期', fmtPeriod(d.periodD)]);
    } else {
      var parent = window.SOLAR.byKey[d.parent];
      rows.push(['母天体', parent ? parent.cn : d.parent]);
      rows.push(['轨道半径', fmtKm(d.orbitKm)]);
      rows.push(['公转周期', fmtPeriod(d.periodD) + (d.retrograde ? '（逆行）' : '')]);
    }
    rows.push(['自转周期', d.rotationH ? fmtPeriod(d.rotationD) + (d.retrograde ? '（逆行）' : '') : '—']);
    rows.push(['轴倾角', d.axialTilt != null ? d.axialTilt + '°' : '—']);
    if (d.albedo) rows.push(['几何反照率', d.albedo.toFixed(3)]);
    if (d.tempC) rows.push(['温度', d.tempC]);
    if (d.moons) rows.push(['卫星', d.moons + ' 颗' + (d.moonList.length ? '（' + d.moonList.slice(0, 4).join('、') + (d.moonList.length > 4 ? ' 等' : '') + '）' : '')]);
    rows.push(['距地球', fmtKm(d.earthDistKm) + ' · ' + d.earthDistAu.toFixed(3) + ' AU']);
    rows.push(['视直径', d.appDiamArcsec >= 1 ? d.appDiamArcsec.toFixed(1) + '″' : (d.appDiamArcsec * 3600).toFixed(1) + ' 毫角秒']);
    rows.push(['相位角', d.phaseDeg.toFixed(0) + '° · 照亮 ' + (d.illum * 100).toFixed(0) + '%']);

    var html = '<div class="oi-head"><b>' + esc(d.cn) + '</b><span style="font-size:10px;color:#7b869a">' + esc(d.en) + '</span>' +
      '<button class="mini-btn" id="siFold" aria-label="折叠信息面板" title="折叠/展开">▾</button>' +
      '<button class="mini-btn" id="siClose" aria-label="关闭">×</button></div>' +
      '<div class="oi-rows">' + rows.map(function (r) {
        return '<div class="oi-row"><span>' + esc(r[0]) + '</span><em>' + esc(r[1]) + '</em></div>';
      }).join('') + '</div>';

    if (d.observed && d.observed.length) {
      html += '<div class="oi-cap">实测面貌</div><div class="oi-obs">' +
        d.observed.map(function (o) {
          return '<div class="oi-obs-row"><b>' + esc(o[0]) + '</b><span>' + esc(o[1]) + '</span></div>';
        }).join('') + '</div>';
    }
    if (d.missions && d.missions.length) {
      html += '<div class="oi-cap">观测任务</div><div class="oi-missions">' +
        d.missions.map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>';
    }
    if (d.sources && d.sources.length) {
      html += '<div class="oi-src">来源：' + d.sources.map(function (x) {
        return '<a href="' + esc(x.u) + '" target="_blank" rel="noopener">' + esc(x.n) + '</a>';
      }).join(' · ') + '</div>';
    }
    html += '<div class="oi-acts"><button class="btn-tiny dark" id="siAsk">追问这个天体</button>' +
      '<button class="btn-tiny" id="siFocus">居中观看</button></div>';

    box.innerHTML = html;
    box.classList.add('on');
    var c = $('#siClose');
    if (c) c.addEventListener('click', function () { box.classList.remove('on'); });
    var fold = $('#siFold');
    if (fold) fold.addEventListener('click', function () {
      var on = box.classList.toggle('collapsed');
      fold.textContent = on ? '▴' : '▾';
    });
    var a = $('#siAsk');
    if (a) a.addEventListener('click', function () {
      closeSolar();
      ask(d.cn + '的半径、质量和公转周期分别是多少？');
    });
    var f = $('#siFocus');
    if (f) f.addEventListener('click', function () {
      SV.setLevel('planet', d.key);
      syncSolarTools();
    });
  }

  function syncSolarTools() {
    if (!SV) return;
    var stt = SV.state;
    $$('#solarLevels button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lv === stt.level);
    });
    var lb = $('#solarLabels');
    if (lb) { lb.setAttribute('aria-pressed', stt.labels ? 'true' : 'false'); }
    var ob = $('#solarOrbits');
    if (ob) { ob.setAttribute('aria-pressed', stt.orbits ? 'true' : 'false'); }
    var pb = $('#solarPause');
    if (pb) { pb.setAttribute('aria-pressed', stt.paused ? 'true' : 'false'); pb.textContent = stt.paused ? '继续' : '暂停'; }
    var d = SV.info(solarKey);
    var meta = $('#solarMeta');
    if (meta && d) {
      meta.textContent = d.cn + ' · 日心 ' + (d.kind === 'star' ? '0' : d.helioAu.toFixed(2) + ' AU') +
        ' · 距地 ' + d.earthDistAu.toFixed(3) + ' AU';
    }
    var sc = $('#solarScale');
    if (sc) {
      var layoutTxt = Math.abs(stt.distExp - 1) < 0.01
        ? '真实等比 r ∝ a(AU)'
        : '压缩布局 r ∝ a^' + stt.distExp.toFixed(2);
      sc.textContent = layoutTxt + ' · 天体统一放大 ×' +
        (stt.boost >= 1000 ? Math.round(stt.boost).toLocaleString() : stt.boost.toFixed(1)) +
        '（直径比例恒真）· 太阳按固定屏幕尺寸绘制';
    }
    var bs = $('#solarBoost');
    if (bs) {
      var want = Math.round(Math.log10(Math.max(stt.boost, 1)) / 4.3 * 100);
      if (Math.abs(want - +bs.value) > 1) bs.value = String(want);
    }
    var ly = $('#solarLayout');
    if (ly) {
      var isTrue = Math.abs(stt.distExp - 1) < 0.01;
      ly.setAttribute('aria-pressed', isTrue ? 'true' : 'false');
      ly.textContent = isTrue ? '压缩布局' : '真实等比';
    }
  }

  /* ================= 抽屉 / 设置 ================= */
  var sheetReturnFocus = null;
  function openSheet(id) {
    /* 记住触发点，关闭后把焦点还回去，否则键盘用户会掉到页面顶部 */
    sheetReturnFocus = document.activeElement;
    $('#' + id).classList.add('on');
    $('#scrim').classList.add('on');
    if (id === 'settings') renderSettings();
    setTimeout(function () {
      var box = $('#' + id);
      if (!box) return;
      var f = box.querySelector('button:not([disabled]), input, select, textarea, [href]');
      if (f) f.focus();
    }, 30);
  }
  function closeSheet(id) {
    $('#' + id).classList.remove('on');
    if (sheetReturnFocus && sheetReturnFocus.focus) {
      try { sheetReturnFocus.focus(); } catch (e) {}
      sheetReturnFocus = null;
    }
    if (!$('#drawer').classList.contains('on') && !$('#settings').classList.contains('on')
      && !$('#sidebar').classList.contains('on') && !$('#obsPanel').classList.contains('on')
      && !$('#sourcePop').classList.contains('on')) {
      $('#scrim').classList.remove('on');
    }
  }
  function closeAll() {
    closeViewer(); closeSolar();
    closeSheet('drawer'); closeSheet('settings'); closePop();
    $('#sidebar').classList.remove('on');
    $('#obsPanel').classList.remove('on');
    $('#scrim').classList.remove('on');
  }

  function selectRow(label, options, value, onPick, desc) {
    var wrap = el('div', 'set-row');
    wrap.innerHTML = '<div class="txt"><div class="t">' + esc(label) + '</div>' + (desc ? '<div class="d">' + esc(desc) + '</div>' : '') + '</div>';
    var ctl = el('div', 'ctl seg-mini');
    options.forEach(function (o) {
      var b = el('button', value === o[0] ? 'on' : '', o[1]);
      b.addEventListener('click', function () {
        $$('button', ctl).forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
        onPick(o[0]);
      });
      ctl.appendChild(b);
    });
    wrap.appendChild(ctl);
    return wrap;
  }
  function switchRow(label, desc, value, onChange) {
    var wrap = el('div', 'set-row');
    wrap.innerHTML = '<div class="txt"><div class="t">' + esc(label) + '</div>' + (desc ? '<div class="d">' + esc(desc) + '</div>' : '') + '</div>';
    var b = el('button', 'switch' + (value ? ' on' : ''));
    b.addEventListener('click', function () {
      var on = !b.classList.contains('on');
      b.classList.toggle('on', on);
      onChange(on);
    });
    var c = el('div', 'ctl'); c.appendChild(b);
    wrap.appendChild(c);
    return wrap;
  }

  /* ---------- 智能体编辑器 ---------- */
  function newAgent() {
    return {
      id: 'ca_' + Date.now().toString(36), name: 'Nova', cn: '新星', sigil: 'N', color: '#3b3bd6',
      role: '自定义智能体', enabled: true, intents: ['all'], weight: 50,
      attrs: { tone: 'warm', depth: 'standard', scope: 'pop', focus: 'balanced', creativity: 'balanced', precision: 'visual', gear: 'binocular', style: 'labeled' },
      sections: { evidence: true, observe: true, visual: true, boundary: true, rank: true, consensus: true },
      directive: ''
    };
  }
  function setSheetHead(sigil, name, role, color) {
    $('#dwSigil').textContent = sigil || 'A';
    $('#dwSigil').style.color = color || 'var(--accent)';
    $('#dwName').textContent = name;
    $('#dwRole').textContent = role || '';
  }
  function openAgent(id) {
    var custom = state.custom.filter(function (x) { return x.id === id; })[0] || null;
    var builtin = AC.AGENTS.filter(function (x) { return x.id === id && !x.custom; })[0] || null;
    var a = custom || builtin;
    if (!a) {
      state.editing = null; state.draft = newAgent();
      setSheetHead(state.draft.sigil, '新建智能体', '自定义', state.draft.color);
      renderEditor(null); openSheet('drawer'); return;
    }
    state.editing = id;
    state.draft = custom ? JSON.parse(JSON.stringify(custom)) : null;
    setSheetHead(a.sigil, a.name + (a.cn ? ' · ' + a.cn : ''), a.role, a.color);
    renderEditor(a);
    openSheet('drawer');
  }

  function renderEditor(a) {
    var body = $('#drawerBody');
    body.innerHTML = '';
    var isCustom = state.draft !== null;

    if (!isCustom) {
      body.appendChild(el('p', 'note-box', esc(a.desc || '')));
      /* 职责范围 / 使用场景 / 已知限制：内置智能体要写清边界，
         而不是只给一句简介让人猜它能干什么 */
      if (a.scope) {
        var sb = el('div', 'agent-scope');
        sb.innerHTML = '<div class="as-t">职责范围</div><div class="as-d">' + esc(a.scope) + '</div>';
        body.appendChild(sb);
      }
      if (a.useCases) {
        var ub = el('div', 'agent-scope');
        ub.innerHTML = '<div class="as-t">使用场景</div><div class="as-d">' + esc(a.useCases) + '</div>';
        body.appendChild(ub);
      }
      if (a.limits) {
        var lb = el('div', 'agent-scope');
        lb.innerHTML = '<div class="as-t">已知限制</div><div class="as-d">' + esc(a.limits) + '</div>';
        body.appendChild(lb);
      }
      var box = el('div', '');
      box.style.marginTop = '16px';
      a.attrs.forEach(function (key) {
        var def = AC.ATTRS[key];
        var f = el('div', 'ed-field');
        f.innerHTML = '<label>' + esc(def.label) + '</label>';
        var sel = document.createElement('select');
        def.options.forEach(function (o) {
          var op = document.createElement('option');
          op.value = o[0]; op.textContent = o[1];
          if (cfg[a.id][key] === o[0]) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener('change', function () {
          cfg[a.id][key] = sel.value;
          if (a.id === 'horizon') { state.settings.gear = sel.value; $('#ctxGear').value = sel.value; refreshPanels(); }
          persist();
        });
        f.appendChild(sel);
        box.appendChild(f);
      });
      body.appendChild(box);
      body.appendChild(el('div', 'ed-field', '<div class="hintline">这些参数只影响表达方式与侧重，不改变星历与知识库中的事实。</div>'));
      return;
    }

    var d = state.draft;
    function field(label, node, hint) {
      var f = el('div', 'ed-field');
      f.innerHTML = '<label>' + esc(label) + '</label>';
      f.appendChild(node);
      if (hint) f.appendChild(el('div', 'hintline', esc(hint)));
      return f;
    }

    var pair = el('div', 'ed-pair');
    var n1 = document.createElement('input'); n1.type = 'text'; n1.value = d.name; n1.maxLength = 24;
    n1.addEventListener('input', function () { d.name = n1.value; });
    var n2 = document.createElement('input'); n2.type = 'text'; n2.value = d.cn || ''; n2.maxLength = 12;
    n2.addEventListener('input', function () { d.cn = n2.value; });
    pair.appendChild(field('名称（英文/代号）', n1));
    pair.appendChild(field('中文名', n2));
    body.appendChild(pair);

    var sig = document.createElement('input'); sig.type = 'text'; sig.value = d.sigil; sig.maxLength = 1;
    sig.addEventListener('input', function () { d.sigil = sig.value.toUpperCase(); });
    body.appendChild(field('标识字符', sig, '显示在协作链路与注记中的单字符。'));

    var colorBox = el('div', 'swatches');
    ['#3b3bd6', '#1a7d5b', '#a86a15', '#b84339', '#5b4bd6', '#0f7490', '#7a4bb8', '#151512'].forEach(function (c) {
      var sw = el('div', 'swatch' + (d.color === c ? ' on' : ''));
      sw.style.background = c;
      sw.addEventListener('click', function () {
        d.color = c;
        $$('.swatch', colorBox).forEach(function (x) { x.classList.remove('on'); });
        sw.classList.add('on');
      });
      colorBox.appendChild(sw);
    });
    body.appendChild(field('主题色', colorBox));

    var role = document.createElement('input'); role.type = 'text'; role.value = d.role || ''; role.maxLength = 40;
    role.addEventListener('input', function () { d.role = role.value; });
    body.appendChild(field('职责（一行描述）', role));

    var intents = el('div', 'chip-select');
    [['all', '全部'], ['knowledge-target', '知识问答'], ['observe-target', '目标观测'],
    ['tonight', '今晚规划'], ['event', '天象'], ['cosmos', '宇宙学'], ['nova', '爆发天体'],
    ['helios', '太阳活动'], ['chart', '星图'], ['gear', '器材']].forEach(function (o) {
      var on = (d.intents || ['all']).indexOf(o[0]) >= 0;
      var b = el('button', on ? 'on' : '', o[1]);
      b.addEventListener('click', function () {
        var arr = d.intents || [];
        if (o[0] === 'all') d.intents = ['all'];
        else {
          arr = arr.filter(function (x) { return x !== 'all'; });
          var i = arr.indexOf(o[0]);
          if (i >= 0) arr.splice(i, 1); else arr.push(o[0]);
          d.intents = arr.length ? arr : ['all'];
        }
        renderEditor(a);
      });
      intents.appendChild(b);
    });
    body.appendChild(field('参与哪些问题', intents, '只有匹配的问题才会唤起这个智能体。'));

    var PRESETS = [
      { label: '儿童科普', name: 'Nova', attrs: { scope: 'pop', depth: 'brief', tone: 'warm' }, note: '用生活化类比解释，避免数字堆砌，最后留一个今晚就能抬头验证的小任务。' },
      { label: '严谨研究', name: 'Kepler Jr', attrs: { scope: 'pro', depth: 'deep', tone: 'academic' }, note: '先给结论与不确定性，再列证据与出处；遇到争议要明确说明分歧所在。' },
      { label: '天文摄影', name: 'Lens', attrs: { gear: 'photo', depth: 'standard', scope: 'pop', tone: 'warm' }, note: '优先给出可拍摄的时间窗口、方位与曝光思路，再补充构图建议。' }
    ];
    var presetBox = el('div', 'chip-select');
    PRESETS.forEach(function (p) {
      var b = el('button', '', p.label);
      b.addEventListener('click', function () {
        Object.assign(d.attrs, p.attrs);
        if (d.name === 'Nova') d.name = p.name;
        d.directive = p.note;
        renderEditor(a);
      });
      presetBox.appendChild(b);
    });
    body.appendChild(field('快速模板', presetBox, '一键套用常见人设，之后仍可逐项调整。'));

    var attrsBox = el('div', 'ed-pair');
    ['tone', 'depth', 'scope', 'focus', 'creativity', 'precision', 'gear', 'style', 'domain', 'evidence'].forEach(function (key) {
      var def = AC.ATTRS[key];
      var f = el('div', 'ed-field');
      f.innerHTML = '<label>' + esc(def.label) + '</label>';
      var sel = document.createElement('select');
      def.options.forEach(function (o) {
        var op = document.createElement('option');
        op.value = o[0]; op.textContent = o[1];
        if (d.attrs && d.attrs[key] === o[0]) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener('change', function () { d.attrs[key] = sel.value; });
      f.appendChild(sel);
      attrsBox.appendChild(f);
    });
    body.appendChild(field('行为参数', attrsBox, '参数决定语气、深度与侧重点；不会改变任何数值。'));

    var secBox = el('div', '');
    [['evidence', '依据与数据'], ['observe', '观测建议'], ['visual', '可视化'], ['boundary', '边界声明'], ['rank', '排序清单'], ['consensus', '共识等级']].forEach(function (o) {
      secBox.appendChild(switchRow(o[1], '', d.sections[o[0]] !== false, function (on) { d.sections[o[0]] = on; }));
    });
    body.appendChild(field('回答包含哪些部分', secBox));

    var ta = document.createElement('textarea');
    ta.value = d.directive || ''; ta.maxLength = 220;
    ta.placeholder = '例如：先给一个生活化类比，再给一个可以亲手做的小观察。';
    ta.addEventListener('input', function () { d.directive = ta.value; });
    body.appendChild(field('专家注记（附加在答案末尾）', ta, '注记以你的角色口吻呈现，不参与数值计算。'));

    body.appendChild(selectRow('优先级', [['30', '低'], ['50', '中'], ['80', '高']], String(d.weight || 50), function (v) { d.weight = +v; }));
    body.appendChild(switchRow('启用', '关闭后不参与任何回答', d.enabled !== false, function (on) { d.enabled = on; }));

    var acts = el('div', 'ed-actions');
    var save = el('button', 'btn-primary', '保存');
    save.addEventListener('click', function () {
      var list = state.custom.filter(function (x) { return x.id !== d.id; });
      list.push(JSON.parse(JSON.stringify(d)));
      state.custom = list;
      AC.setCustomAgents(state.custom); persist(); renderAgents(); closeSheet('drawer');
      toast('智能体已保存');
    });
    var dup = el('button', 'btn-ghost', '复制');
    dup.addEventListener('click', function () {
      var c = JSON.parse(JSON.stringify(d));
      c.id = 'ca_' + Date.now().toString(36);
      c.name = (d.name || 'Agent') + ' 副本';
      state.custom.push(c);
      AC.setCustomAgents(state.custom); persist(); renderAgents();
      openAgent(c.id);
    });
    var del = el('button', 'btn-danger', '删除');
    del.addEventListener('click', function () {
      state.custom = state.custom.filter(function (x) { return x.id !== d.id; });
      AC.setCustomAgents(state.custom); persist(); renderAgents(); closeSheet('drawer');
    });
    var cancel = el('button', 'btn-ghost', '取消');
    cancel.addEventListener('click', function () { closeSheet('drawer'); });
    if (state.custom.some(function (x) { return x.id === d.id; })) acts.appendChild(del);
    acts.appendChild(save); acts.appendChild(dup); acts.appendChild(cancel);
    body.appendChild(acts);
  }

  /* ---------- 设置 ---------- */
  var KEY_NOTE = '密钥仅保存在本机浏览器，不会上传。智谱、DeepSeek、Moonshot、通义等支持浏览器直连，可直接使用；' +
    'OpenAI 等不提供 CORS 的服务才需要自建代理地址。若提示「被当前页面的 CSP 拦截」，说明宿主限制了外连，请换独立浏览器标签打开本站。';

  var settingsTab = 'main';
  var modelProvider = null;   /* 统一配置面板当前选中的供应商 */

  function renderSettings(tab) {
    if (tab) settingsTab = tab;
    var body = $('#settingsBody');
    body.innerHTML = '';

    var tabs = el('div', 'set-tabs');
    [['main', '设置'], ['help', '帮助']].forEach(function (t) {
      var b = el('button', (settingsTab === t[0] ? 'on' : ''), t[1]);
      b.addEventListener('click', function () { renderSettings(t[0]); });
      tabs.appendChild(b);
    });
    body.appendChild(tabs);

    if (settingsTab === 'help') { renderHelp(body); return; }

    var s = state.settings;
    function group(title, rows, foot, note) {
      var g = el('div', 'group');
      g.appendChild(el('h4', '', title));
      rows.forEach(function (r) { g.appendChild(r); });
      if (note) g.appendChild(el('div', 'note-box', note));
      if (foot) g.appendChild(el('div', 'ed-field', '<div class="hintline">' + esc(foot) + '</div>'));
      body.appendChild(g);
    }

    /* 来源与密钥 */
    var srcGroup = el('div', 'group');
    srcGroup.appendChild(el('h4', '', '来源与密钥'));
    srcGroup.appendChild(el('div', 'note-box', KEY_NOTE));
    S.list().forEach(function (src) {
      if (src.type === 'local') {
        var row = el('div', 'provider-card');
        row.innerHTML = '<div class="pc-head"><span class="av" style="background:' + src.dot + '">' + esc(initials(src)) + '</span>' +
          '<span class="pc-name">' + esc(src.name) + '</span><span class="pc-model">离线内核</span></div>' +
          '<div class="pc-foot"><span class="pc-status ok">可用 · 无需配置</span>' +
          (src.id === 'local' ? '<button class="btn-tiny" data-use="' + src.id + '">设为默认</button>' : '') + '</div>';
        srcGroup.appendChild(row);
        return;
      }
      if (src.type === 'web') {
        var wrow = el('div', 'provider-card');
        wrow.innerHTML = '<div class="pc-head"><span class="av" style="background:' + src.dot + '">' + esc(initials(src)) + '</span>' +
          '<span class="pc-name">' + esc(src.name) + '</span><span class="pc-model">NASA / OpenAlex / Semantic Scholar / Wikimedia</span></div>' +
          '<div class="setup"><div class="cap">工作方式</div><ol>' +
          '<li>并行向 NASA 图库、OpenAlex、Semantic Scholar 与维基百科等开放接口检索与问题相关的条目，取标题与摘要</li>' +
          '<li>结果作为「检索结果」并入答案，附原文链接；谁先返回可用结果就用谁</li>' +
          '<li>不可达时自动回退本地索引，并在答案中标注「本地索引」</li>' +
          '<li>事实层（星历与知识库）不受检索影响</li>' +
          '<li>若全部端点失败，通常是当前网络无法访问这些境外接口——点「检测连通」可看到每个端点的失败原因</li>' +
          '<li>Semantic Scholar 匿名调用有共享限流，出现 HTTP 429 属正常现象，可稍后重试</li></ol></div>' +
          '<div class="diag"></div>' +
          '<div class="pc-foot"><span class="pc-status ' + statusTone(src.status) + '">' + esc(src.status.msg) + '</span>' +
          '<button class="btn-tiny" data-webcheck="1">检测连通</button>' +
          '<button class="btn-tiny dark" data-use="' + src.id + '">设为默认</button></div>';
        srcGroup.appendChild(wrow);
        return;
      }
    });
    body.appendChild(srcGroup);

    /* 云端模型 · 统一配置入口 */
    var cloud = S.cloudProviders();
    if (!modelProvider || !cloud.some(function (c) { return c.id === modelProvider; })) {
      modelProvider = (state.settings.sourceId && cloud.some(function (c) { return c.id === state.settings.sourceId; }))
        ? state.settings.sourceId : cloud[0].id;
    }
    var cur = cloud.filter(function (c) { return c.id === modelProvider; })[0];

    var modelGroup = el('div', 'group');
    modelGroup.appendChild(el('h4', '', '云端模型 · 统一配置'));
    modelGroup.appendChild(el('div', 'note-box', '先选供应商，再填该供应商需要的参数。所有密钥只保存在本机浏览器，切换供应商不会丢失已填配置。'));

    /* 供应商选择器 */
    var picker = el('div', 'mp-picker');
    var chips = el('div', 'mp-chips');
    cloud.forEach(function (p) {
      var st = p.status.state;
      var tone = st === 'ready' ? 'ok' : st === 'error' ? 'err' : (p.hasKey ? 'warn' : '');
      var b = el('button', 'mp-chip' + (p.id === modelProvider ? ' on' : ''));
      b.innerHTML = '<span class="mp-dot" style="background:' + p.dot + '"></span>' +
        '<b>' + esc(p.name) + '</b><span class="mp-state ' + tone + '">' + esc(p.status.msg) + '</span>';
      b.addEventListener('click', function () { modelProvider = p.id; renderSettings(); });
      chips.appendChild(b);
    });
    picker.appendChild(chips);
    modelGroup.appendChild(picker);

    /* 动态参数面板 */
    var conf = S.conf(cur.id);
    var fields = cur.fields || ['key', 'endpoint', 'model', 'temperature', 'maxTokens'];
    var panel = el('div', 'mp-panel');
    panel.innerHTML =
      '<div class="mp-head"><span class="av" style="background:' + cur.dot + '">' + esc(initials(cur)) + '</span>' +
      '<div><b>' + esc(cur.name) + '</b><span class="mp-vendor">' + esc(cur.vendor) + ' · ' + esc(cur.desc) + '</span></div>' +
      '<span class="pc-status ' + statusTone(cur.status) + '">' + esc(cur.status.msg) + '</span></div>' +
      '<div class="mp-caps">' + (cur.caps || []).map(function (c) { return '<span class="mp-cap">' + esc(c) + '</span>'; }).join('') + '</div>';

    /* 模型选择器 */
    if (fields.indexOf('model') >= 0) {
      var mrow = el('div', 'kvline');
      var models = cur.models || [];
      var isPreset = models.indexOf(conf.model) >= 0;
      mrow.innerHTML = '<span>模型版本</span>';
      var msel = el('select', 'mp-select');
      models.forEach(function (m) {
        var o = el('option', '', m);
        if (m === conf.model) o.selected = true;
        msel.appendChild(o);
      });
      var oCustom = el('option', '', '自定义模型名…');
      if (!isPreset && conf.model) oCustom.selected = true;
      else if (!models.length) oCustom.selected = true;
      msel.appendChild(oCustom);
      var minp = el('input', 'mp-custom');
      minp.type = 'text';
      minp.value = isPreset ? '' : (conf.model || '');
      minp.placeholder = '填写该服务商的模型 ID';
      minp.style.display = (isPreset && models.length) ? 'none' : '';
      msel.addEventListener('change', function () {
        if (msel.value === '自定义模型名…') {
          minp.style.display = '';
          minp.focus();
        } else {
          minp.style.display = 'none';
          minp.value = '';
          /* 就地保存，不重绘面板：重绘会换掉用户正要点的「测试连接」 */
          S.setConfig(cur.id, { model: msel.value });
        }
      });
      minp.addEventListener('change', function () {
        S.setConfig(cur.id, { model: minp.value.trim() });
      });
      mrow.appendChild(msel);
      mrow.appendChild(minp);
      panel.appendChild(mrow);
    }

    if (fields.indexOf('key') >= 0) {
      var krow = el('div', 'kvline');
      krow.innerHTML = '<span>API Key</span>';
      var kinp = el('input', 'mp-input');
      kinp.type = 'password';
      kinp.value = '';
      var kclr = el('button', 'mini-btn wide-btn', '清除');

      /* 只更新这一个小区域，不重绘整个面板 ——
       * 否则输入框失焦触发 change 时会把「测试连接」按钮换掉，
       * 用户紧接着的那次点击就落空了，表现为「密钥配不上」。 */
      function refreshKeyUI() {
        kinp.placeholder = conf.key
          ? ('已保存 ' + S.maskKey(cur.id) + '（留空则不改动）')
          : '粘贴密钥（仅存本机）';
        kclr.disabled = !conf.key;
        kclr.style.opacity = conf.key ? '' : '0.45';
      }
      kinp.addEventListener('change', function () {
        var v = kinp.value.trim();
        if (!v) return;
        S.setConfig(cur.id, { key: v });
        conf = S.conf(cur.id);
        kinp.value = '';
        refreshKeyUI();
        toast('密钥已保存到本机（显示时仅保留末 4 位）');
      });
      kclr.addEventListener('click', function () {
        S.setConfig(cur.id, { key: '' });
        conf = S.conf(cur.id);
        refreshKeyUI();
        toast('已清除该来源的密钥');
      });
      krow.appendChild(kinp);
      krow.appendChild(kclr);
      refreshKeyUI();
      panel.appendChild(krow);
    }

    if (fields.indexOf('endpoint') >= 0) {
      var erow = el('div', 'kvline');
      erow.innerHTML = '<span>Base URL</span>';
      var einp = el('input', 'mp-input');
      einp.type = 'text';
      einp.value = conf.endpoint;
      einp.placeholder = '接口地址（含 /chat/completions 或等价端点）';
      einp.addEventListener('change', function () {
        S.setConfig(cur.id, { endpoint: einp.value.trim() });
      });
      erow.appendChild(einp);
      panel.appendChild(erow);
    }

    if (fields.indexOf('temperature') >= 0) {
      var trow = el('div', 'kvline');
      trow.innerHTML = '<span>温度</span>';
      var twrap = el('div', 'mp-range');
      var trng = el('input', 'mp-range-input');
      trng.type = 'range'; trng.min = '0'; trng.max = '2'; trng.step = '0.1';
      trng.value = String(conf.temperature);
      var tval = el('span', 'mp-range-val', conf.temperature.toFixed(1));
      trng.addEventListener('input', function () {
        tval.textContent = (+trng.value).toFixed(1);
      });
      trng.addEventListener('change', function () {
        S.setConfig(cur.id, { temperature: +trng.value });
      });
      twrap.appendChild(trng); twrap.appendChild(tval);
      trow.appendChild(twrap);
      panel.appendChild(trow);
    }

    if (fields.indexOf('maxTokens') >= 0) {
      var grow = el('div', 'kvline');
      grow.innerHTML = '<span>最大输出</span>';
      var ginp = el('input', 'mp-input mp-narrow');
      ginp.type = 'number'; ginp.min = '32'; ginp.max = '4000'; ginp.step = '16';
      ginp.value = String(conf.maxTokens);
      ginp.addEventListener('change', function () {
        var v = Math.max(32, Math.min(4000, Math.round(+ginp.value || 400)));
        S.setConfig(cur.id, { maxTokens: v });
      });
      grow.appendChild(ginp);
      grow.appendChild(el('span', 'mp-unit', 'tokens · 输出段落长度上限'));
      panel.appendChild(grow);
    }

    if (cur.steps && cur.steps.length) {
      var det = el('details', 'mp-steps');
      det.innerHTML = '<summary>配置步骤</summary><ol>' +
        cur.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') +
        (cur.console ? '<li>密钥创建入口：<a href="' + esc(cur.console) + '" target="_blank" rel="noopener">' + esc(String(cur.console).replace('https://', '')) + '</a></li>' : '') +
        '</ol>';
      panel.appendChild(det);
    }

    var foot = el('div', 'pc-foot');
    foot.innerHTML = '<span class="pc-status ' + statusTone(cur.status) + '">' + esc(cur.status.msg) + '</span>';
    var btnTest = el('button', 'btn-tiny', '测试连接');
    btnTest.addEventListener('click', function () {
      btnTest.textContent = '测试中…'; btnTest.disabled = true;
      S.test(cur.id).then(function (r) {
        btnTest.textContent = '测试连接'; btnTest.disabled = false;
        renderSources(); renderSettings();
        toast((r.ok ? '连接成功：' : '连接失败：') + r.msg);
      });
    });
    var btnUse = el('button', 'btn-tiny dark', state.settings.sourceId === cur.id ? '当前默认' : '设为默认');
    if (state.settings.sourceId !== cur.id) {
      btnUse.addEventListener('click', function () {
        state.settings.sourceId = cur.id;
        persist(); renderSources(); renderSettings();
        toast('已切换默认来源：' + cur.name);
      });
    }
    foot.appendChild(btnTest);
    foot.appendChild(btnUse);
    panel.appendChild(foot);
    modelGroup.appendChild(panel);
    body.appendChild(modelGroup);

    /* 本地/检索卡片的事件 */
    $$('[data-use]', srcGroup).forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.settings.sourceId = btn.dataset.use;
        persist(); renderSources(); renderSettings(); toast('已切换默认来源');
      });
    });
    $$('[data-webcheck]', srcGroup).forEach(function (btn) {
      btn.addEventListener('click', function () {
        btn.textContent = '检测中…'; btn.disabled = true;
        var box = btn.closest('.provider-card').querySelector('.diag');
        S.diagnose().then(function (list) {
          btn.textContent = '检测连通'; btn.disabled = false;
          renderSources();
          if (box) {
            box.innerHTML = '<div class="cap">端点状态</div>' + list.map(function (d) {
              var tone = d.state === 'ok' ? 'ok' : (d.state === 'cooling' ? 'warn' : 'err');
              var mark = d.state === 'ok' ? '✓' : (d.state === 'cooling' ? '⏸' : '✕');
              return '<div class="diag-row"><span class="' + tone + '">' + mark + '</span>' +
                '<b>' + esc(d.name) + '</b><em>' + esc(d.msg) + ' · ' + d.ms + 'ms</em></div>';
            }).join('');
          }
          var okCount = list.filter(function (d) { return d.state === 'ok'; }).length;
          toast(okCount ? ('可用端点 ' + okCount + ' / ' + list.length) : '全部端点不可达，将使用本地索引');
        });
      });
    });

    group('我的器材', [
      selectRow('主镜', (window.GEAR ? window.GEAR.LIST : []).map(function (g) { return [g.id, g.name]; }),
        s.gearId || 'new150', function (v) { s.gearId = v; AC.setGear(v, s.camId); persist(); }),
      selectRow('相机', (window.OBSPLAN ? window.OBSPLAN.CAMERAS : []).map(function (c) { return [c.id, c.name]; }),
        s.camId || 'asi', function (v) { s.camId = v; AC.setGear(s.gearId, v); persist(); }),
      (function () { return skillPanel(); })()
    ]);

    group('档案', [
      (function () {
        var box = el('div', 'hist-panel');
        var P = window.Profile;
        if (!P) { box.appendChild(el('div', 'hist-meta', '档案未启用')); return box; }
        var cur = P.current();
        box.appendChild(el('div', 'hist-meta',
          '当前：' + cur.name + (cur.id === P.DEFAULT ? '（默认档案，沿用原有数据，无需迁移）' : '（独立数据，与他人互不可见）')));
        var bar = el('div', 'hist-bar');
        var b1 = el('button', 'hist-btn', '新建档案');
        b1.type = 'button';
        b1.addEventListener('click', function () {
          var n = window.prompt('档案名称', '');
          if (!n) return;
          var p = P.create(n);
          if (!p) { toast('名称无效'); return; }
          P.switchTo(p.id);
          location.reload();
        });
        bar.appendChild(b1);
        P.list().forEach(function (p) {
          if (p.id === P.currentId()) return;
          var sw = el('button', 'hist-btn', '切到 ' + p.name);
          sw.type = 'button';
          sw.addEventListener('click', function () { P.switchTo(p.id); location.reload(); });
          bar.appendChild(sw);
        });
        box.appendChild(bar);
        P.list().forEach(function (p) {
          if (p.id === P.DEFAULT || p.id === P.currentId()) return;
          var del = el('button', 'hist-btn danger', '删除档案 ' + p.name);
          del.type = 'button';
          del.addEventListener('click', function () {
            if (!window.confirm('删除档案「' + p.name + '」及其本机数据？此操作不可撤销。')) return;
            P.remove(p.id);
            P.purgeKeys(p.id);
            renderSettings();
            toast('已删除档案');
          });
          box.appendChild(del);
        });
        return box;
      })()
    ]);

    group('历史记录', [
      (function () {
        var box = el('div', 'hist-panel');
        var b = (window.Thread && window.Thread.backend && window.Thread.backend()) || '';
        var label = b === 'idb' ? 'IndexedDB' : b === 'ls' ? 'localStorage（降级）' : '不可用';
        var turns = document.querySelectorAll('.msg.user').length;
        box.appendChild(el('div', 'hist-meta',
          '本机已保存 ' + turns + ' 轮 · 存储：' + label));
        var b1 = el('button', 'hist-btn', '清空当前对话');
        b1.type = 'button';
        b1.addEventListener('click', function () {
          if (window.confirm('清空当前对话？此操作不可撤销。')) clearHistory('current');
        });
        var b2 = el('button', 'hist-btn danger', '清空全部历史');
        b2.type = 'button';
        b2.addEventListener('click', function () {
          if (window.confirm('清空全部历史对话？此操作不可撤销。')) clearHistory('all');
        });
        var bar = el('div', 'hist-bar');
        bar.appendChild(b1); bar.appendChild(b2);
        box.appendChild(bar);
        return box;
      })()
    ]);

    group('数据', [
      (function () {
        var box = el('div', 'hist-panel');
        var st = state.stats || { asks: 0, errors: 0 };
        var tips = topIntents(3).map(function (x) { return intentCn(x.k) + ' ' + x.n; }).join(' · ');
        box.appendChild(el('div', 'hist-meta', '本机统计：问过 ' + (st.asks || 0) + ' 次' + (st.errors ? (' · 失败 ' + st.errors + ' 次') : '') + (tips ? (' · ' + tips) : '') + '（仅存本地，不上传）'));
        box.appendChild(el('div', 'hist-meta', '导出为 JSON 备份，可在另一台设备导入还原。'));
        var bar = el('div', 'hist-bar');
        var b1 = el('button', 'hist-btn', '导出全部数据');
        b1.type = 'button';
        b1.addEventListener('click', exportData);
        var b2 = el('button', 'hist-btn', '导入备份');
        b2.type = 'button';
        b2.title = '导入会新增一个档案，不覆盖当前数据';
        b2.addEventListener('click', function () { if (fileInput) fileInput.click(); });
        bar.appendChild(b1);
        bar.appendChild(b2);
        box.appendChild(bar);
        return box;
      })()
    ]);

    group('对话与表述', [
      switchRow('按问题自动切换风格', '问句明显偏向另一方向时临时换讲法；只影响表达，数值不变',
        s.autoStyle !== false, function (v) { s.autoStyle = v; persist(); }),
      selectRow('使用身份', [['observer', '看星 / 拍摄'], ['researcher', '查数据 / 读论文'], ['learner', '了解天文']],
        (s.persona && s.persona !== 'none') ? s.persona : 'observer', function (v) { applyPersona(v); }),
      selectRow('默认语体', [['auto', '自适应'], ['pro', '专业'], ['pop', '科普']], s.register, function (v) {
        s.register = v; cfg.vega.scope = v; persist();
      }),
      selectRow('默认深度', [['brief', '精简'], ['standard', '标准'], ['deep', '详尽']], s.depth, function (v) {
        s.depth = v; cfg.muse.depth = v; persist();
      }),
      switchRow('显示协作链路', '在答案顶部展示参与的智能体', s.showTrace, function (v) { s.showTrace = v; persist(); }),
      switchRow('显示置信度', '', s.showConfidence, function (v) { s.showConfidence = v; persist(); }),
      switchRow('显示儒略日', '观测台中的 JD 时间戳', s.showJD, function (v) { s.showJD = v; persist(); refreshPanels(); }),
      switchRow('自动滚动到答案', '', s.autoScroll, function (v) { s.autoScroll = v; persist(); })
    ]);

    group('显示', [
      selectRow('星图标注', [['minimal', '极简'], ['labeled', '标注'], ['deep', '密集']], s.skymap, function (v) {
        s.skymap = v; cfg.orion.style = v; persist(); refreshPanels();
      }),
      switchRow('大字号', '适合投屏或视力不便时使用', s.largeText, function (v) {
        s.largeText = v; document.body.classList.toggle('large-text', v); persist();
      }),
      switchRow('紧凑模式', '减小行距与内边距', s.compact, function (v) {
        s.compact = v; document.body.classList.toggle('compact', v); persist();
      })
    ]);

    var gearSel = document.createElement('select');
    gearSel.className = 'mini-sel';
    [['naked', '肉眼'], ['binocular', '双筒'], ['telescope', '望远镜'], ['photo', '摄影']].forEach(function (o) {
      var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1];
      if (o[0] === s.gear) op.selected = true;
      gearSel.appendChild(op);
    });
    gearSel.addEventListener('change', function () {
      s.gear = gearSel.value; cfg.horizon.gear = s.gear; $('#ctxGear').value = s.gear; persist(); refreshPanels();
    });
    var r2 = el('div', 'set-row');
    r2.innerHTML = '<div class="txt"><div class="t">默认器材</div></div>';
    var c2 = el('div', 'ctl'); c2.appendChild(gearSel); r2.appendChild(c2);

    var placeRow = el('div', 'set-row');
    placeRow.innerHTML = '<div class="txt"><div class="t">观测地点</div><div class="d" id="setPlaceName">' +
      esc(state.place ? state.place.n : s.city) + '</div></div>';
    var pc = el('div', 'ctl');
    pc.style.display = 'flex'; pc.style.gap = '6px';
    var locBtn = el('button', 'btn-tiny', 'IP 定位');
    locBtn.addEventListener('click', function () { locateByIP(false); });
    var manBtn = el('button', 'btn-tiny', '坐标');
    manBtn.addEventListener('click', openCoordSheet);
    pc.appendChild(locBtn); pc.appendChild(manBtn);
    placeRow.appendChild(pc);

    group('默认观测条件', [
      placeRow, r2,
      selectRow('数值精度', [['visual', '目视级'], ['photo', '摄影级']], s.precision, function (v) {
        s.precision = v; cfg.kepler.precision = v; persist();
      })
    ], '地点支持全球检索（779 个城市与首都）、IP 自动定位与手动坐标；切换地点后星图与今晚清单立即重算。');

    var mgr = el('div', 'set-row');
    mgr.innerHTML = '<div class="txt"><div class="t">智能体</div><div class="d">内置 7 个 · 自定义 ' + state.custom.length + ' 个</div></div>';
    var mbtn = el('button', 'btn-tiny dark', '新建');
    mbtn.addEventListener('click', function () {
      closeSheet('settings');
      state.editing = null; state.draft = newAgent();
      setSheetHead(state.draft.sigil, '新建智能体', '自定义', state.draft.color);
      renderEditor(null); openSheet('drawer');
    });
    var mc = el('div', 'ctl'); mc.appendChild(mbtn); mgr.appendChild(mc);
    group('智能体', [mgr], '在左侧点击任一智能体即可调整参数；自定义智能体可设定参与的问题类型与专家注记。');

    var dataGroup = el('div', 'group');
    dataGroup.appendChild(el('h4', '', '数据与核验'));
    var stamp = el('div', 'set-row');
    stamp.innerHTML = '<div class="txt"><div class="t">核验日期</div><div class="d">数值来自论文或机构发布，未采用二手转述</div></div>' +
      '<div class="ctl"><span class="st st-established">2026-10</span></div>';
    dataGroup.appendChild(stamp);
    [['Planck Collaboration 2018, A&A 641, A6', '宇宙学参数'],
    ['GRAVITY Collaboration 2022, A&A 657, L12', '人马座 A* 质量'],
    ['EHT Collaboration 2019, ApJL 875, L1', 'M87* 阴影与质量'],
    ['DESI Collaboration 2025, PRD 112, 083515', '暗能量演化约束'],
    ['NASA Exoplanet Archive（2026-08-20）', '系外行星 6,354 颗'],
    ['GeoNames（2026-10-22）', '全球 779 个地点坐标与时区'],
    ['IMO / NASA Eclipse', '流星雨与日月食年度表']].forEach(function (x) {
      var row = el('div', 'row-item');
      row.innerHTML = '<div class="top"><span class="n" style="font-size:11.5px">' + esc(x[0]) + '</span></div><div class="tx">' + esc(x[1]) + '</div>';
      dataGroup.appendChild(row);
    });
    var tools = el('div', 'ed-actions');
    var exp = el('button', 'btn-ghost', '导出配置');
    exp.addEventListener('click', exportAll);
    var imp = el('button', 'btn-ghost', '导入配置');
    var file = document.createElement('input');
    file.type = 'file'; file.accept = '.json'; file.style.display = 'none';
    file.addEventListener('change', function () { if (file.files[0]) importAll(file.files[0]); });
    imp.addEventListener('click', function () { file.click(); });
    var reset = el('button', 'btn-danger', '恢复默认');
    reset.addEventListener('click', function () {
      state.settings = Object.assign({}, DEFAULTS);
      cfg = AC.defaultConfig(); AC.setCustomAgents(state.custom);
      applySettings(); renderSettings(); refreshPanels();
    });
    tools.appendChild(exp); tools.appendChild(imp); tools.appendChild(reset); tools.appendChild(file);
    dataGroup.appendChild(tools);
    body.appendChild(dataGroup);

    /* ---------- 运行状态（可观测性） ---------- */
    var runGroup = el('div', 'group');
    runGroup.appendChild(el('h4', '', '运行状态'));
    runGroup.appendChild(el('div', 'note-box', '本机实时统计：渲染耗时、端点健康度、智能体意图分布与错误记录。用于定位「卡」与「不可用」的根因，不上传任何数据。'));
    var perf = window.__astrum ? window.__astrum.perf() : { sky: {}, solar: {} };
    var ast = AC.stats();
    var rows = [
      ['2D 星图渲染', '调用 ' + (perf.sky.calls || 0) + ' 次 · 平均 ' + (perf.sky.avg || 0) + ' ms/帧 · 模型构建 ' + (perf.sky.modelBuild || 0) + ' ms'],
      ['太阳系 3D 视图', SV ? ('FPS ' + (SV.state.fps || '—') + ' · 帧耗时 ' + Math.round((SV.state.frameAvg || 0) * 100) / 100 + ' ms') : '未加载'],
      ['智能体编排', '共 ' + ast.total + ' 次 · 最近意图 ' + (ast.lastIntent || '—') + ' · 编排耗时 ' + ast.lastMs + ' ms'],
      ['联网检索', '端点健康度见下方；限流：' + (S.limits ? ('检索 ' + S.limits.searchPerMin + '/分钟，模型 ' + S.limits.cloudPerMin + '/分钟') : '—')]
    ];
    rows.forEach(function (x) {
      var r = el('div', 'set-row');
      r.innerHTML = '<div class="txt"><div class="t">' + esc(x[0]) + '</div><div class="d">' + esc(x[1]) + '</div></div>';
      runGroup.appendChild(r);
    });
    var health = S.health ? S.health() : [];
    if (health.length) {
      var hbox = el('div', 'diag');
      hbox.innerHTML = '<div class="cap">端点健康度</div>' + health.map(function (h) {
        var tone = h.ok > 0 && !h.cooling ? 'ok' : (h.cooling ? 'warn' : 'err');
        var mark = tone === 'ok' ? '✓' : (tone === 'warn' ? '⏸' : '✕');
        return '<div class="diag-row"><span class="' + tone + '">' + mark + '</span>' +
          '<b>' + esc(h.id) + '</b><em>' + (h.successRate == null ? '未使用' : '成功率 ' + h.successRate + '%') +
          (h.lastErr ? ' · ' + esc(h.lastErr) : '') + (h.cooling ? ' · 冷却 ' + h.cooldownLeft + 's' : '') + '</em></div>';
      }).join('');
      runGroup.appendChild(hbox);
    }
    var intents = Object.keys(ast.intents || {});
    if (intents.length) {
      var ibox = el('div', 'diag');
      ibox.innerHTML = '<div class="cap">意图分布</div>' + intents.map(function (k) {
        return '<div class="diag-row"><span class="ok">·</span><b>' + esc(k) + '</b><em>' + ast.intents[k] + ' 次</em></div>';
      }).join('');
      runGroup.appendChild(ibox);
    }
    var tasks = taskList().slice(-6).reverse();
    if (tasks.length) {
      var tbox = el('div', 'diag');
      tbox.innerHTML = '<div class="cap">最近任务</div>' + tasks.map(function (t) {
        var tone = t.state === 'ok' ? 'ok' : (t.state === 'error' ? 'err' : 'warn');
        var mark = t.state === 'ok' ? '✓' : (t.state === 'error' ? '✕' : '·');
        return '<div class="diag-row"><span class="' + tone + '">' + mark + '</span>' +
          '<b>' + esc(t.type) + ' · ' + esc(t.label) + '</b><em>' + t.ms + ' ms' +
          (t.error ? ' · ' + esc(t.error) : '') + '</em></div>';
      }).join('');
      runGroup.appendChild(tbox);
    }
    if (PERF.errors.length) {
      var ebox = el('div', 'diag');
      ebox.innerHTML = '<div class="cap">最近错误（' + PERF.errors.length + '）</div>' +
        PERF.errors.slice(-6).reverse().map(function (e) {
          return '<div class="diag-row"><span class="err">!</span><b>' + esc(e.kind || 'error') + '</b><em>' + esc(e.msg) + '</em></div>';
        }).join('');
      runGroup.appendChild(ebox);
    }
    body.appendChild(runGroup);

    group('关于', [
      (function () {
        var r = el('div', 'set-row');
        r.innerHTML = '<div class="txt"><div class="t">ASTRUM</div><div class="d">天文多智能体工作台 · v1.4 · 事实层全程本地，不经网络</div></div>';
        return r;
      })(),
      (function () {
        /* 知识库口径说明：不再对外展示条目数量。
         * 数量容易被当成能力背书，而真正决定可信度的是每条结论的来源与核验时间。 */
        var r = el('div', 'set-row');
        r.innerHTML = '<div class="txt"><div class="t">知识库口径</div>' +
          '<div class="d">不展示条目数量。条目多少不等于覆盖能力，判断依据是每条结论的来源、共识等级与核验日期 —— ' +
          '这些信息在答案的「依据」章节逐条标注。知识库未收录的问题，会转由联网检索取证，或明确告知无法确证。</div></div>';
        return r;
      })()
    ], '所有结论都附带依据与共识等级；未证实的部分会明确标注，不代替专业观测与研究结论。');
  }

  /* ---------- 帮助 ---------- */
  var HELP_CARDS = [
    ['01', '观测与星图', '方位、高度、升落与最佳窗口；星图可一键全屏放大，查看全部标注。'],
    ['02', '天体知识', '距离、性质、演化，附来源与时效标签；每条结论都标注出处与核验日期。'],
    ['03', '宇宙学与前沿', '黑洞、暗能量、哈勃张力，标注共识等级与仍需回答的问题。'],
    ['04', '自建智能体', '定义角色、参数与专家注记，可指定参与哪类问题。']
  ];

  function renderHelp(body) {
    var g1 = el('div', 'group');
    g1.appendChild(el('h4', '', '能帮你做什么'));
    var cards = el('div', 'help-cards');
    HELP_CARDS.forEach(function (c) {
      cards.appendChild(el('div', 'help-card',
        '<span class="n">' + c[0] + '</span><b>' + esc(c[1]) + '</b><p>' + esc(c[2]) + '</p>'));
    });
    g1.appendChild(cards);
    body.appendChild(g1);

    var g2 = el('div', 'group');
    g2.appendChild(el('h4', '', '使用技巧'));
    [
      ['先说地点，再问问题', '「今晚在拉萨能看到什么」会自动切换到拉萨并重算星图；也可以直接在观测台检索全球 779 个城市，或输入 39.9,116.4 这样的坐标。'],
      ['用「今晚优先」代替漫无目的', '观测台会按高度、亮度与月光干扰打分，列出当晚最值得看的 5 个目标，点任意一条即可追问怎么找。'],
      ['星图放大看细节', '点星图右上角的方框按钮进入全屏，滚轮缩放、拖拽平移；切到「全部标注」会显示恒星的中西名、深空天体编号与行星高度。'],
      ['换来源只换说法，不换数字', '顶栏或输入框里的来源按钮可切换表述层；事实层永远来自本地星历与知识库，切换后数字不会变。'],
      ['上下文会承接', '连续追问时可以直接说「它」「那个」，系统会用上一轮的主体继续作答，答案顶部会标注「承接上文」。'],
      ['每个答案都有评审', '答案末尾的「评审结论」列出证据条数、共识等级与边界声明的检查结果，标「!」的项表示存在缺口。'],
      ['不会答就说不会', '遇到未收录或时效性不足的问题，会返回边界声明并列出可回答的方向，而不是编一个答案。'],
      ['快捷键', '回车发送、Shift+回车换行、按 / 聚焦输入框、Esc 关闭所有浮层。']
    ].forEach(function (t) {
      var d = document.createElement('details');
      d.className = 'tip';
      d.innerHTML = '<summary>' + esc(t[0]) + '</summary><div class="body">' + esc(t[1]) + '</div>';
      g2.appendChild(d);
    });
    body.appendChild(g2);

    var g3 = el('div', 'group');
    g3.appendChild(el('h4', '', '配套教程'));
    [
      ['① 五分钟做一份今晚观测计划', [
        '在观测台把日期设为今晚、时刻设为 21:00，地点用 IP 定位或检索。',
        '切到「今晚优先」，看第一名目标的高度与峰值时刻。',
        '点该目标追问「怎么找」，答案会给定位路径、器材建议与月光干扰。',
        '需要更细的星图，点右上角方框进入全屏，切到「全部标注」。'
      ]],
      ['② 接入一个云端模型', [
        '打开设置 → 云端模型 · 统一配置，先在供应商选择器里挑一家（OpenAI / Anthropic / Google / Moonshot / 智谱 / 通义千问 / Mistral / Groq / xAI / 自定义）。',
        '面板会按所选供应商动态展开需要的参数：模型版本（可下拉选预设，也可填自定义 ID）、API Key、Base URL、温度、最大输出。',
        '展开「配置步骤」按提示创建密钥并粘贴，点「测试连接」，显示「已连通」后点「设为默认」。',
        '提示「被当前页面的 CSP 拦截」= 宿主限制了外连，换独立浏览器标签打开本站即可；' +
        '只有 OpenAI 这类不提供 CORS 的服务才需要把 Base URL 换成自建代理；「自定义」可接任何 OpenAI 兼容端点。'
      ]],
      ['③ 用自定义智能体讲给孩子听', [
        '左侧点「新建智能体」，点「儿童科普」快速模板。',
        '参与问题保持「全部」，把深度设为「精简」，语体设为「科普」。',
        '在专家注记里写明你要的表达方式，保存。',
        '之后每个答案末尾都会附上这个角色的补充。'
      ]]
    ].forEach(function (t) {
      var d = document.createElement('details');
      d.className = 'tip';
      d.open = false;
      d.innerHTML = '<summary>' + esc(t[0]) + '</summary><div class="body"><ol class="steps">' +
        t[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol></div>';
      g3.appendChild(d);
    });
    body.appendChild(g3);

    /* 智能体阵容：展示每个内置角色的职责与可调参数 */
    var gAgents = el('div', 'group');
    gAgents.appendChild(el('h4', '', '智能体阵容'));
    var roster = el('div', 'roster');
    AC.AGENTS.filter(function (a) { return !a.custom; }).forEach(function (a) {
      var row = el('div', 'roster-row');
      var attrs = (a.attrs || []).map(function (k) {
        var d = AC.ATTRS[k];
        return d ? d.label : k;
      }).join(' · ');
      row.innerHTML = '<span class="sg" style="color:' + esc(a.color) + '">' + esc(a.sigil) + '</span>' +
        '<div class="mt"><b>' + esc(a.name) + ' · ' + esc(a.cn) + '</b><em>' + esc(a.role) + '</em>' +
        '<p>' + esc(a.desc || '') + '</p>' +
        '<span class="at">可调参数：' + esc(attrs) + '</span></div>';
      roster.appendChild(row);
    });
    gAgents.appendChild(roster);
    gAgents.appendChild(el('div', 'note-box', '点左侧任意智能体可调整其语气、深度与侧重；Critic 的「证据门槛」设为严格时，证据不足的答案会被强制标注为线索而非定论。'));
    body.appendChild(gAgents);

    var g4 = el('div', 'group');
    g4.appendChild(el('h4', '', '数据与边界'));
    g4.appendChild(el('div', 'note-box',
      '星历由本地计算，知识条目均标注来源与核验日期；宇宙学条目区分「已成共识 / 前沿研究 / 未定论」。' +
      '产品不提供天气预报、实时极光、器材品牌推荐与占星内容。'));
    g4.appendChild(el('div', 'note-box',
      '国内数据引用国家天文科学数据中心（NADC / China-VO）已公开发布的数据集，逐条标注数据版本、DOI/CSTR 与获取方式；' +
      'FAST 科学数据等需申请获取的条目已单独标明，许可受限的数据集注明署名要求。'));
    g4.appendChild(el('div', 'note-box',
      '多智能体的评审—回流闭环、多来源去重合并与提示词透明化借鉴了开源项目 AstroAgents' +
      '（Saeedi 等，arXiv:2503.23170，ICLR 2025 Workshop，MIT License）。仅借鉴工程与流程范式，' +
      '未引入其 Python 依赖，领域提示词与评分维度均按天文学场景重写。'));
    body.appendChild(g4);
  }

  function exportAll() {
    /* 导出内容不含任何密钥：密钥单独存放在 astrum.sources.v1，不进入本对象 */
    var data = JSON.stringify({ settings: state.settings, custom: state.custom, cfg: cfg }, null, 2);
    if (/"key"\s*:/.test(data)) {
      toast('导出内容检测到密钥字段，已中止导出');
      return;
    }
    var blob = new Blob([data], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'astrum-config.json';
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
    toast('已导出配置（不含密钥）');
  }
  function importAll(f) {
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var d = JSON.parse(rd.result);
        if (d.settings) state.settings = Object.assign({}, DEFAULTS, d.settings);
        if (Array.isArray(d.custom)) state.custom = d.custom;
        if (d.cfg) cfg = mergeCfg(d.cfg);
        applySettings(); renderAgents(); renderSettings(); refreshPanels();
        toast('配置已导入');
      } catch (e) { toast('配置文件无法解析：' + e.message); }
    };
    rd.readAsText(f);
  }

  /* ================= 启动 ================= */
  function applySettings() {
    var s = state.settings;
    cfg.vega.scope = s.register;
    cfg.muse.depth = s.depth;
    cfg.kepler.precision = s.precision;
    cfg.orion.style = s.skymap;
    cfg.horizon.gear = s.gear;
    document.body.classList.toggle('compact', !!s.compact);
    document.body.classList.toggle('large-text', !!s.largeText);
    AC.setCustomAgents(state.custom);
    if ($('#ctxGear')) $('#ctxGear').value = s.gear;
    document.body.classList.toggle('obs-collapsed', !s.showObs);
    applySidebarCollapse(s.sidebarCollapsed);
    persist();
  }

  function applySidebarCollapse(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  }

  function toggleSidebarCollapse(force) {
    var next = force != null ? !!force : !state.settings.sidebarCollapsed;
    state.settings.sidebarCollapsed = next;
    applySidebarCollapse(next);
    persist();
  }

  /* 视觉上的 .on 与语义上的 aria-selected 必须同步，否则读屏用户不知道当前模式。
   * 定义在顶层：bind() 与 boot() 都要调用，放在 bind 内部会导致 boot 里取不到。 */
  function syncModeAria() {
    $('#modeSeg button').forEach(function (b) {
      b.setAttribute('aria-selected', b.classList.contains('on') ? 'true' : 'false');
    });
  }

  function bind() {
    $('#send').addEventListener('click', function () { ask(); });
    bindAttachments();
    $('#input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); }
    });
    $('#input').addEventListener('input', function (e) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 150) + 'px';
    });
    $$('#sceneList button').forEach(function (b) {
      b.addEventListener('click', function () { ask(b.dataset.q); });
    });
    $('#srcPill').addEventListener('click', function (e) { e.stopPropagation(); openPop($('#srcPill')); });
    $('#sourceChip').addEventListener('click', function (e) { e.stopPropagation(); openPop($('#sourceChip')); });
    $('#popClose').addEventListener('click', closePop);
    $('#popManage').addEventListener('click', function () { closePop(); openSheet('settings'); });
    $('#btnManageSources').addEventListener('click', function () { openSheet('settings'); });
    $('#btnSettings').addEventListener('click', function () { openSheet('settings'); });
    $('#settingsClose').addEventListener('click', function () { closeSheet('settings'); });
    $('#dwClose').addEventListener('click', function () { closeSheet('drawer'); });
    $('#btnNew').addEventListener('click', newChat);
    $('#btnAddAgent').addEventListener('click', function () {
      state.editing = null; state.draft = newAgent();
      setSheetHead(state.draft.sigil, '新建智能体', '自定义', state.draft.color);
      renderEditor(null); openSheet('drawer');
    });
    $$('#modeSeg button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.disabled) { toast('需要至少一个已连通的云端来源才能对比'); return; }
        $$('#modeSeg button').forEach(function (x) { x.classList.remove('on'); });
        b.classList.add('on');
            state.settings.mode = b.dataset.mode;
        persist(); renderSources();
      });
    });
    $('#btnSidebar').addEventListener('click', function () {
      $('#sidebar').classList.add('on'); $('#scrim').classList.add('on');
    });
    $('#btnCollapseSide').addEventListener('click', function () { toggleSidebarCollapse(true); });
    $('#btnExpandSide').addEventListener('click', function () { toggleSidebarCollapse(false); });
    $('#btnObs').addEventListener('click', function () { toggleObs(); });
    $('#btnObsClose').addEventListener('click', function () { toggleObs(false); });

    /* 全屏星图交互 */
    $('#skyExpand').addEventListener('click', function () { openViewer(); });
    $('#sky').addEventListener('click', function (e) {
      var obj = viewerHit(e);
      if (obj) {
        var d = obj.data;
        openViewer({ ra: d.ra, dec: d.dec, label: d.cn || d.name || '' });
      } else openViewer();
    });
    $('#sky').style.cursor = 'zoom-in';
    $('#vwClose').addEventListener('click', closeViewer);
    $('#vwIn').addEventListener('click', function () { zoomViewer(1.25); });
    $('#vwOut').addEventListener('click', function () { zoomViewer(0.8); });
    $('#vwReset').addEventListener('click', resetViewer);

    /* 太阳系观测视图 */
    $('#solarClose').addEventListener('click', closeSolar);
    $('#solarReset').addEventListener('click', function () { if (SV) { SV.reset(); syncSolarTools(); } });
    $('#solarLabels').addEventListener('click', function () {
      if (!SV) return;
      SV.setLabels(!SV.state.labels); syncSolarTools();
    });
    $('#solarOrbits').addEventListener('click', function () {
      if (!SV) return;
      SV.setOrbits(!SV.state.orbits); syncSolarTools();
    });
    $('#solarPause').addEventListener('click', function () {
      if (!SV) return;
      SV.togglePause(); syncSolarTools();
    });
    $('#solarLayout').addEventListener('click', function () {
      if (!SV) return;
      var cur = SV.state.distExp;
      SV.setLayout(Math.abs(cur - 1) < 0.01 ? 0.5 : 1);
      syncSolarTools();
    });
    $('#solarBoost').addEventListener('input', function (e) {
      if (!SV) return;
      var v = +e.target.value;
      /* 滑杆 0–100 → 对数映射 1×–20000× */
      SV.setBoost(Math.round(Math.pow(10, v / 100 * 4.3)));
      syncSolarTools();
    });
    $('#solarSpeed').addEventListener('change', function (e) {
      if (!SV) return;
      SV.setTimeScale(parseFloat(e.target.value) || 86400);
    });
    $$('#solarLevels button').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!SV) return;
        SV.setLevel(b.dataset.lv, solarKey);
        syncSolarTools();
      });
    });
    $('#btnSolar').addEventListener('click', function () { openSolar({ key: solarKey }); });
    $$('#catTabs button').forEach(function (b) {
      b.addEventListener('click', function () {
        catGroup = b.dataset.g;
        $$('#catTabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
        renderCatalog();
      });
    });
    $('#btnPlanExport').addEventListener('click', exportPlan);
    $('#btnPlanClear').addEventListener('click', function () {
      plan = []; savePlan(); renderPlan(); renderCatalog();
      toast('观测清单已清空');
    });
    if (SV) {
      SV.on('select', function (key) { solarKey = key; });
      SV.on('change', function () {
        if ($('#solar').classList.contains('on')) {
          renderSolarInfo(solarKey);
          syncSolarTools();
        }
      });
    }
    $$('#viewerLabels button').forEach(function (b) {
      b.addEventListener('click', function () {
        vw.level = b.dataset.lv;
        $$('#viewerLabels button').forEach(function (x) { x.classList.toggle('on', x === b); });
        drawViewer();
        resetViewer();
      });
    });
    var stage = $('#viewerStage');
    var pointers = {};      /* 多指手势：两点捏合缩放 */
    var pinchStart = null;
    stage.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoomViewer(e.deltaY < 0 ? 1.12 : 0.89);
    }, { passive: false });
    stage.addEventListener('pointerdown', function (e) {
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        /* 进入捏合：记录初始指距与视场 */
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinchStart = { dist: Math.hypot(a.x - b.x, a.y - b.y), fov: vw.fov };
        vw.drag = null;
        stage.classList.add('dragging');
        return;
      }
      vw.drag = { x: e.clientX, y: e.clientY, yaw: vw.yaw, pitch: vw.pitch, moved: 0 };
      vw.interactive = true;
      stage.classList.add('dragging');
      hideSkyTip();
      try { stage.setPointerCapture(e.pointerId); } catch (err) { }
    });
    stage.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
      /* 双指捏合缩放 */
      var ids = Object.keys(pointers);
      if (ids.length === 2 && pinchStart) {
        var pa = pointers[ids[0]], pb = pointers[ids[1]];
        var d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (pinchStart.dist > 8 && d > 8) {
          vw.fov = Math.max(20, Math.min(178, pinchStart.fov * (pinchStart.dist / d)));
          applyViewerTransform();
        }
        vw.interactive = true;
        drawViewer();
        return;
      }
      if (vw.drag) {
        var dx = e.clientX - vw.drag.x, dy = e.clientY - vw.drag.y;
        vw.drag.moved = Math.max(vw.drag.moved, Math.abs(dx) + Math.abs(dy));
        var sc = vw.fov / 145;
        vw.yaw = A.norm360(vw.drag.yaw - dx * 0.22 * sc);
        vw.pitch = Math.max(-5, Math.min(72, vw.drag.pitch + dy * 0.16 * sc));
        vw.interactive = true;
        drawViewer();
        return;
      }
      /* 悬停提示 */
      var obj = viewerHit(e);
      if (obj) showSkyTip(e, obj); else hideSkyTip();
    });
    function endPointer(e) {
      var moved = vw.drag ? vw.drag.moved : 0;
      delete pointers[e.pointerId];
      if (Object.keys(pointers).length < 2) pinchStart = null;
      if (!vw.drag) { stage.classList.remove('dragging'); return; }
      vw.drag = null;
      stage.classList.remove('dragging');
      try { stage.releasePointerCapture(e.pointerId); } catch (err) { }
      /* 松手后恢复完整细节 */
      vw.interactive = false;
      drawViewer();
      if (moved < 5) {
        var obj = viewerHit(e);
        if (obj) describeObject(obj); else hideObjInfo();
      }
    }
    stage.addEventListener('pointerup', endPointer);
    stage.addEventListener('pointercancel', endPointer);
    stage.addEventListener('pointerleave', function (e) {
      if (vw.drag) endPointer(e);
    });
    stage.addEventListener('dblclick', resetViewer);
    window.addEventListener('resize', function () {
      if ($('#viewer').classList.contains('on')) {
        sizeViewerCanvas();
        drawViewer();
        applyViewerTransform();
      }
    });
    $('#scrim').addEventListener('click', closeAll);
    document.addEventListener('click', function (e) {
      if (!e.target.closest('#sourcePop') && !e.target.closest('#srcPill') && !e.target.closest('#sourceChip')) {
        if ($('#sourcePop').classList.contains('on')) closePop();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if ($('#viewer').classList.contains('on')) { closeViewer(); return; }
        closeAll();
      }
      if (e.key === '/' && document.activeElement !== $('#input')) { e.preventDefault(); $('#input').focus(); }
    });
  }

  /* ================= 首访引导：三选一身份 =================
   * 身份只影响「默认语体 + 默认深度 + 推荐问题」，不参与事实判定。
   * 同一问题在任何身份下得到的数值必须一致——这是产品的底线。 */
  var PERSONAS = {
    observer:   { label: '看星 / 拍摄',   desc: '器材、视场、今晚窗口优先', register: 'pop', depth: 'standard' },
    researcher: { label: '查数据 / 读论文', desc: '数值、出处、可跑查询优先', register: 'pro', depth: 'deep' },
    learner:    { label: '了解天文',      desc: '概念、成因、通俗讲解优先', register: 'pop', depth: 'brief' }
  };

  function applyPersona(id) {
    var p = PERSONAS[id];
    if (!p) return false;
    var st = state.settings;
    st.persona = id;
    st.register = p.register;
    st.depth = p.depth;
    cfg.vega.scope = p.register;
    cfg.muse.depth = p.depth;
    persist();
    return true;
  }

  /* 单题风格：问句明显偏向另一个方向时，临时换一种讲法。
   * 只改表达参数（register / depth），绝不动事实层——数值必须跨风格一致。 */
  var STYLE_WORDS = {
    researcher: /视差|自行|光度|金属丰度|星表|DOI|ADQL|误差|置信区间|拟合|样本|红移|测距|谱线/,
    observer:   /能拍|拍得|视场|曝光|装得下|三脚架|赤道仪|目镜|倍率|出摊|今晚|高度角|口径/,
    learner:    /为什么|是什么|怎么形成|原理|区别|通俗|举个例子|是什么意思|怎么理解/
  };
  function detectStyle(q) {
    var s = String(q || '');
    if (STYLE_WORDS.researcher.test(s)) return 'researcher';
    if (STYLE_WORDS.observer.test(s)) return 'observer';
    if (STYLE_WORDS.learner.test(s)) return 'learner';
    return null;
  }

  function closePersona() {
    var c = document.getElementById('personaCard');
    if (c) c.remove();
  }

  function setPersona(id) {
    if (!applyPersona(id)) return;
    closePersona();
    toast('已切换为「' + PERSONAS[id].label + '」，可在设置里随时更改');
  }

  function maybeShowPersona() {
    if (state.settings.persona) return;
    if (document.querySelector('#thread .msg')) return;
    if (document.getElementById('personaCard')) return;
    var card = el('div', 'persona-card');
    card.id = 'personaCard';
    var html = '<div class="pc-title">先告诉我你主要想做什么</div>' +
      '<div class="pc-sub">只影响默认的讲解方式与推荐，随时可改，也不影响任何数值。</div>';
    card.innerHTML = html;
    Object.keys(PERSONAS).forEach(function (k) {
      var p = PERSONAS[k];
      var b = el('button', 'pc-item');
      b.type = 'button';
      b.innerHTML = '<span class="pc-l">' + esc(p.label) + '</span>' +
        '<span class="pc-d">' + esc(p.desc) + '</span>';
      b.addEventListener('click', function () { setPersona(k); });
      card.appendChild(b);
    });
    var skip = el('button', 'pc-skip', '先跳过');
    skip.type = 'button';
    skip.addEventListener('click', function () {
      state.settings.persona = 'none';
      persist();
      closePersona();
    });
    card.appendChild(skip);
    $('#thread').appendChild(card);
  }

  /* ================= 历史对话的恢复与清理 =================
   * 恢复走「重放 ans」而不是存 DOM：DOM 会随渲染逻辑变化而过期，ans 不会。
   * 恢复态强制关闭动画与自动滚动，避免刷新后整屏闪现。 */
  /* 失败只提醒一次：同一会话里反复弹窗会盖住答案 */
  var fileInput = null;
  var restoreFailedOnce = false;
  var saveFailedOnce = false;

  function onSaveFail(e) {
    console.warn('persist failed', e);
    if (saveFailedOnce) return;
    saveFailedOnce = true;
    toast('本机存储写入失败，刷新后这条对话可能丢失');
  }

  var restorePromise = null;
  /* 外部（含测试）可 await：恢复完成之前不要读写线程，否则会互相覆盖 */
  function ready() { return restorePromise || Promise.resolve(); }

  function restoreHistory() {
    if (!window.Thread) return Promise.resolve();
    var threadEl = $('#thread');
    /* 读取是异步的（IndexedDB），先给骨架，避免首屏空白一片、看不出在加载 */
    threadEl.innerHTML = '<div class="skel" id="restoreSkel">' +
      '<div class="sk w70"></div><div class="sk w40"></div><div class="sk w85"></div></div>';
    restorePromise = window.Thread.init().then(function () {
      return window.Thread.loadMessages();
    }).then(function (msgs) {
      /* 用户可能已经抢先提问：此时不能清空线程去还原历史，
       * 否则会把刚渲染的消息抹掉（表现为消息消失、测试取到 undefined）。 */
      if (document.querySelector('#thread .msg')) return;
      if (!msgs || !msgs.length) { threadEl.innerHTML = ''; return; }
      threadEl.innerHTML = '';
      state.asked = true;
      mountComposer('dock');
      renderMessages(msgs);
      var sc = $('#scroll');
      if (sc) sc.scrollTop = sc.scrollHeight;
    }).catch(function (e) {
      console.warn('history restore failed', e);
      threadEl.innerHTML = '';
      /* 恢复失败不能静默：用户会以为历史丢了 */
      if (!restoreFailedOnce) {
        restoreFailedOnce = true;
        toast('历史记录读取失败，本次以空白对话开始');
      }
    }).then(function () {
      var sk = document.getElementById('restoreSkel');
      if (sk) sk.remove();
      maybeShowPersona();
      renderThreadList();
      return true;
    });
    return restorePromise;
  }

  /* 消息重放：恢复历史与切换对话共用同一条路径 */
  function renderMessages(msgs) {
    var threadEl = $('#thread');
    msgs.forEach(function (m) {
      if (m.role === 'user') {
        threadEl.appendChild(userBubble(m.text, m.atts || []));
      } else if (m.ans) {
        try { renderAnswer(m.ans, { restore: true }); } catch (e) { console.warn('restore failed', e); }
      }
    });
  }

  /* 侧栏会话列表 */
  function renderThreadList() {
    if (!window.Thread) return;
    var box = $('#threadList');
    if (!box) return;
    window.Thread.list().then(function (list) {
      box.innerHTML = '';
      if (!list.length) { box.appendChild(el('div', 'th-empty', '还没有对话')); return; }
      var cur = window.Thread.current();
      list.slice(0, 12).forEach(function (t) {
        var row = el('div', 'th-item' + (cur && cur.id === t.id ? ' on' : ''));
        var name = el('span', 'th-t', esc(t.title || '未命名'));
        name.title = '双击重命名';
        name.addEventListener('dblclick', function (ev) {
          ev.stopPropagation();
          var v = window.prompt('重命名对话', t.title || '');
          if (v == null) return;
          window.Thread.rename(t.id, v).then(renderThreadList);
        });
        var cnt = el('span', 'th-n', String(t.count || 0));
        var del = el('button', 'th-del', '×');
        del.type = 'button';
        del.title = '删除这个对话';
        del.setAttribute('aria-label', '删除对话 ' + (t.title || '未命名'));
        del.addEventListener('click', function (ev) {
          ev.stopPropagation();
          if (!window.confirm('删除对话「' + (t.title || '未命名') + '」？')) return;
          window.Thread.remove(t.id).then(function () {
            renderThreadList();
            if (!window.Thread.current()) newChat();
          });
        });
        row.appendChild(name);
        row.appendChild(cnt);
        row.appendChild(del);
        row.addEventListener('click', function () { openThread(t.id); });
        box.appendChild(row);
      });
    });
  }

  function openThread(id) {
    if (!window.Thread) return;
    window.Thread.setCurrent(id).then(function () {
      return window.Thread.loadMessages();
    }).then(function (msgs) {
      $('#thread').innerHTML = '';
      state.asked = true;
      mountComposer('dock');
      renderMessages(msgs);
      var sc = $('#scroll');
      if (sc) sc.scrollTop = sc.scrollHeight;
      renderThreadList();
      if (window.innerWidth <= 860) $('#sidebar').classList.remove('on');
    }).catch(function (e) { toast('打开对话失败：' + String(e && e.message || e)); });
  }

  /* ================= 数据导入导出 =================
   * 目的：让「数据属于你」落到可操作层面，也是将来接云端时的迁移格式。
   * 只搬数据，不搬代码；导入前二次确认，导入后刷新以重建全部视图。 */
  function buildExportPayload() {
    var payload = {
      app: 'astrum', schema: 1, exportedAt: new Date().toISOString(),
      settings: state.settings, skills: (state.skills || []).slice(),
      threads: [], messages: []
    };
    return window.Thread.list().then(function (list) {
      payload.threads = list || [];
      return Promise.all(payload.threads.map(function (t) {
        return window.Store.listMessages(t.id);
      }));
    }).then(function (packs) {
      (packs || []).forEach(function (arr) {
        payload.messages = payload.messages.concat(arr || []);
      });
      return payload;
    });
  }

  /* 导入 = 新增一个档案。绝不覆盖当前数据：
   * 覆盖式恢复是最危险的语义（选错文件即毁全部），而多写一个档案的代价只是多一条记录。 */
  function importData(file) {
    if (!file || !window.Profile || !window.Store) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(String(reader.result)); } catch (e) { toast('文件不是合法 JSON'); return; }
      if (!data || data.app !== 'astrum' || !Array.isArray(data.threads)) { toast('这不是 ASTRUM 的备份文件'); return; }
      var stamp = String(data.exportedAt || '').slice(0, 10);
      var p = window.Profile.create('导入 ' + (stamp || new Date().toISOString().slice(0, 10)));
      if (!p) { toast('创建档案失败'); return; }
      try {
        localStorage.setItem('p.' + p.id + '.astrum.v2', JSON.stringify({
          settings: data.settings || {},
          custom: Array.isArray(data.custom) ? data.custom : [],
          cfg: data.cfg || {},
          skills: Array.isArray(data.skills) ? data.skills : []
        }));
      } catch (e) { toast('写入设置失败'); }
      window.Store.importInto(p.id, data.threads, data.messages || []).then(function () {
        window.Profile.switchTo(p.id);
        toast('已导入为档案「' + p.name + '」，正在切换');
        setTimeout(function () { location.reload(); }, 800);
      }).catch(function (e) {
        window.Profile.remove(p.id);
        window.Profile.purgeKeys(p.id);
        toast('导入失败：' + String(e && e.message || e));
      });
    };
    reader.readAsText(file);
  }
  function exportData() {
    if (!window.Thread || !window.Store) { toast('存储未就绪'); return; }
    buildExportPayload().then(function (payload) {
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = el('a', '', '');
      a.href = url;
      a.download = 'astrum-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      toast('已导出 ' + payload.threads.length + ' 个对话、' + payload.messages.length + ' 条消息');
    }).catch(function (e) { toast('导出失败：' + String(e && e.message || e)); });
  }

  /* ================= 版本 / 统计 / 答案操作 ================= */
  var APP_VERSION = '4.8';

  /* 更新提示：只在「之前来过且版本变了」时提示一次，首次访问不打扰 */
  function checkVersion() {
    var seen = '';
    try { seen = localStorage.getItem('astrum.version') || ''; } catch (e) {}
    if (seen && seen !== APP_VERSION) toast('已更新到 v' + APP_VERSION);
    try { localStorage.setItem('astrum.version', APP_VERSION); } catch (e) {}
  }

  function loadStats() {
    try {
      var raw = localStorage.getItem('astrum.stats');
      state.stats = raw ? JSON.parse(raw) : null;
    } catch (e) { state.stats = null; }
    if (!state.stats || typeof state.stats !== 'object') state.stats = { asks: 0, errors: 0, intents: {} };
    if (!state.stats.intents) state.stats.intents = {};
  }

  /* 只存本地，不上传——这点写死在实现里，不靠设置约束 */
  function bumpStat(kind, intent) {
    var s = state.stats || { asks: 0, errors: 0, intents: {} };
    if (kind === 'ask') {
      s.asks = (s.asks || 0) + 1;
      if (intent) s.intents[intent] = (s.intents[intent] || 0) + 1;
    } else if (kind === 'error') {
      s.errors = (s.errors || 0) + 1;
    }
    state.stats = s;
    try { localStorage.setItem('astrum.stats', JSON.stringify(s)); } catch (e) {}
  }

  function topIntents(n) {
    var list = (state.stats && state.stats.intents) || {};
    return Object.keys(list)
      .map(function (k) { return { k: k, n: list[k] }; })
      .sort(function (a, b) { return b.n - a.n; })
      .slice(0, n || 3);
  }

  /* 取答案正文：从已渲染的卡片里剥离元信息，保证与用户所见一致 */
  function answerText(card) {
    var clone = card.cloneNode(true);
    ['.meta-bar', '.ans-acts', '.recall', '.trace-fold', '.verify-fold', '.model-note'].forEach(function (sel) {
      clone.querySelectorAll(sel).forEach(function (x) { x.remove(); });
    });
    return (clone.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* 云量块：与 SIMBAD 并列，同样标注实时与来源 */
  function weatherBox(r) {
    var d = r.data || {};
    var v = window.Weather.verdict(d);
    var box = el('div', 'simbad-box wbox');
    var rows = [['地点', r.city || '']];
    if (d.cloud != null) rows.push(['云量', d.cloud + '%' + (d.cloudMax != null && d.cloudMax !== d.cloud ? '（峰值 ' + d.cloudMax + '%）' : '')]);
    if (d.temp != null) rows.push(['气温', d.temp + '°C']);
    if (d.wind != null) rows.push(['风速', d.wind + ' km/h']);
    if (d.precip != null) rows.push(['降水', d.precip + '%']);
    var html = '<div class="sb-head">天气 · 今晚' + (r.from === 'cache' ? '（30 分钟内缓存）' : '（实时）') + '</div>';
    rows.forEach(function (kv) {
      html += '<div class="sb-row"><span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + '</span></div>';
    });
    html += '<div class="wb-verdict v-' + v.level + '">' + esc(v.text) + '</div>';
    html += '<div class="sb-foot">来源 open-meteo.com · 只发送城市名与城市中心坐标 · 不参与推理</div>';
    box.innerHTML = html;
    return box;
  }

  /* 从问句里认出星表编号（M42 / NGC 7331 / IC 10）。认不出就不提供查询入口。 */
  function guessIdent(q) {
    var m = String(q || '').match(/\b(M|NGC|IC)\s?(\d{1,4})\b/i);
    return m ? (m[1].toUpperCase() + m[2]) : '';
  }

  /* SIMBAD 结果单独成块：标注 realtime 与查询时间，与本地证据并列而不混入 */
  function simbadBox(r, ident) {
    var info = r.info || {};
    var box = el('div', 'simbad-box');
    var rows = [];
    rows.push(['名称', info.id || ident]);
    if (info.otype) rows.push(['类型', info.otype]);
    if (info.ra != null && info.dec != null) {
      rows.push(['赤经', Number(info.ra).toFixed(4) + '°']);
      rows.push(['赤纬', Number(info.dec).toFixed(4) + '°']);
    }
    if (info.plx != null) {
      var ly = window.Simbad.distanceLy(info);
      rows.push(['视差', info.plx + ' mas' + (ly ? ' · 约 ' + ly + ' 光年' : '')]);
    }
    if (info.vmag != null) rows.push(['V 星等', String(info.vmag)]);
    var html = '<div class="sb-head">SIMBAD · 实时查询</div>';
    rows.forEach(function (kv) {
      html += '<div class="sb-row"><span class="k">' + esc(kv[0]) + '</span><span class="v">' + esc(kv[1]) + '</span></div>';
    });
    html += '<div class="sb-foot">' + (r.from === 'cache' ? '本机缓存（24h 内）' : '刚刚查询') +
      ' · 来源 simbad.u-strasbg.fr · 与本地证据并列，不参与推理</div>';
    box.innerHTML = html;
    return box;
  }

  function answerActions(card, ans) {
    var bar = el('div', 'ans-acts');

    var cp = el('button', 'ans-act', '复制');
    cp.type = 'button';
    cp.title = '复制这条答案的正文';
    cp.addEventListener('click', function () { copyText(answerText(card), cp); });

    var sh = el('button', 'ans-act', '分享');
    sh.type = 'button';
    sh.title = '复制为可粘贴分享的纯文本';
    sh.addEventListener('click', function () {
      var m = ans.meta || {};
      var head = 'ASTRUM · ' + (ans.query || '') + '\n' + '—'.repeat(24) + '\n';
      var tail = '\n\n（依据：' + (m.status ? statusLabel(m.status) : '本地核验') +
        (m.freshness ? ' · ' + ({ static: '长期稳定', annual: '年度表', ephemeris: '实时计算', realtime: '需在线' }[m.freshness] || '') : '') + '）';
      copyText(head + answerText(card) + tail, sh);
    });

    var fb = el('button', 'ans-act', '反馈');
    fb.type = 'button';
    fb.title = '把这条答案的问题与诊断信息打包复制，便于反馈';
    fb.addEventListener('click', function () {
      var m = ans.meta || {};
      var pack = [
        '# ASTRUM 反馈包',
        '版本: v' + APP_VERSION,
        '时间: ' + new Date().toISOString(),
        '提问: ' + (ans.query || ''),
        '意图: ' + (ans.intent || '-') + ' · 档位: ' + (m.tier || '-') + ' · 状态: ' + (m.status || '-'),
        '存储: ' + (window.Thread ? window.Thread.backend() : '-'),
        '--- 回答正文 ---',
        answerText(card)
      ].join('\n');
      copyText(pack, fb);
    });

    bar.appendChild(cp);
    bar.appendChild(sh);
    bar.appendChild(fb);
    /* 只有问句里出现星表编号时才提供 SIMBAD 查询：没有明确天体就不该发请求 */
    var ident = guessIdent(ans.query);
    if (ident && window.Simbad) {
      var sb = el('button', 'ans-act', 'SIMBAD');
      sb.type = 'button';
      sb.title = '向 SIMBAD 查询 ' + ident + ' 的权威数据（会发送该天体名称）';
      sb.addEventListener('click', function () {
        sb.disabled = true;
        sb.textContent = '查询中…';
        window.Simbad.lookup(ident).then(function (r) {
          sb.textContent = 'SIMBAD';
          sb.disabled = false;
          if (!r || !r.ok) {
            toast(r && r.reason === 'timeout' ? 'SIMBAD 超时，未取到实时值' : 'SIMBAD 未找到该天体');
            return;
          }
          card.insertBefore(simbadBox(r, ident), bar);
        }).catch(function () { sb.textContent = 'SIMBAD'; sb.disabled = false; });
      });
      bar.appendChild(sb);
    }

    /* 只在「观测类」答案上提供云量：其它问题加天气是噪音 */
    var obsLike = ans.meta && (ans.meta.freshness === 'ephemeris' ||
      /今晚|可见|出摊|拍摄|能看|窗口/.test(String(ans.query || '')));
    if (obsLike && window.Weather) {
      var wb = el('button', 'ans-act', '云量');
      wb.type = 'button';
      wb.title = '查询' + (state.settings.city || '北京') + '的云量（会发送城市名与城市中心坐标）';
      wb.addEventListener('click', function () {
        wb.disabled = true;
        wb.textContent = '查询中…';
        window.Weather.lookup(state.settings.city || '北京').then(function (r) {
          wb.textContent = '云量';
          wb.disabled = false;
          if (!r || !r.ok) {
            toast(r && r.reason === 'timeout' ? '天气服务超时' : '未取到' + (state.settings.city || '北京') + '的天气');
            return;
          }
          card.insertBefore(weatherBox(r), bar);
        }).catch(function () { wb.textContent = '云量'; wb.disabled = false; });
      });
      bar.appendChild(wb);
    }

    return bar;
  }

  function clearHistory(scope) {
    if (!window.Thread) return;
    var p = scope === 'all' ? window.Thread.clearAll() : window.Thread.clearCurrent();
    return p.then(function () {
      $('#thread').innerHTML = '';
      state.asked = false;
      state.memory = [];
      AC.setMemory([]);
      mountComposer('hero');
      toast(scope === 'all' ? '已清空全部历史对话' : '已清空当前对话');
      renderSettings();
    }).catch(function (e) { toast('清空失败：' + String(e && e.message || e)); });
  }
  function boot() {
    AC.setSkillResolver(skillFor);
    loadStats();
    checkVersion();
    initContext();
    applySettings();
    watchViewport();
    watchErrors();
    loadPlan();
    renderPlan();
    renderCatalog();
    warmupSkyModel();
    renderAgents();
    renderSources();
    bind();
    fileInput = el('input', 'hidden-file');
    fileInput.type = 'file';
    fileInput.accept = 'application/json,.json';
    fileInput.addEventListener('change', function () {
      var f = fileInput.files && fileInput.files[0];
      fileInput.value = '';
      if (f) importData(f);
    });
    document.body.appendChild(fileInput);

    restoreHistory();
    refreshPanels();
    mountComposer('hero');
    $$('#modeSeg button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.mode === state.settings.mode);
      b.setAttribute('aria-selected', b.classList.contains('on') ? 'true' : 'false');
    });
    $('#input').focus();

    window.__astrum = {
      ask: ask, selectSource: selectSource, openSheet: openSheet, openAgent: openAgent,
      restoreHistory: restoreHistory, clearHistory: clearHistory,
      setPersona: setPersona, applyPersona: applyPersona, PERSONAS: PERSONAS,
      detectStyle: detectStyle, newChat: newChat,
      buildExportPayload: buildExportPayload,
      ready: ready, version: APP_VERSION,
      /* 档案的程序化入口：与设置面板的 selectRow 等效。
       * 注意：ask() 每次都会用 state.settings 覆盖 AC.setGear，
       * 所以外部只调 AC.setGear 是无效的，必须改 state 再同步。 */
      setGearProfile: function (gearId, camId) {
        state.settings.gearId = gearId || '';
        if (camId) state.settings.camId = camId;
        AC.setGear(state.settings.gearId, state.settings.camId);
        persist();
      },
      /* 附件接口：供界面/测试调用 */
      addFiles: addFiles, removeAttach: removeAttach, clearAttach: clearAttach,
      attachments: function () { return (state.attachments || []).slice(); },
      refresh: refreshPanels, focusObject: focusObject,
      perf: function () {
        return {
          sky: { calls: PERF.sky.calls, last: Math.round(PERF.sky.last * 100) / 100, avg: Math.round(PERF.sky.avg * 100) / 100, modelBuild: PERF.sky.modelBuild },
          solar: { calls: PERF.solar.calls, last: Math.round(PERF.solar.last * 100) / 100, avg: Math.round(PERF.solar.avg * 100) / 100 },
          model: { key: SKY_CACHE.key, built: SKY_CACHE.model ? SKY_CACHE.model.built : 0, stars: SKY_CACHE.model ? SKY_CACHE.model.stars.length : 0, dust: SKY_CACHE.model ? SKY_CACHE.model.dust.length : 0 }
        };
      }
    };

    var params = {};
    location.hash.replace(/^#/, '').split('&').forEach(function (kv) {
      if (!kv) return;
      var i = kv.indexOf('=');
      if (i > 0) params[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
      else params[kv] = true;
    });
    if (params.q) setTimeout(function () { ask(params.q); }, 240);
    if (params.settings) setTimeout(function () {
      if (params.provider) modelProvider = params.provider;
      openSheet('settings');
      if (params.tab) renderSettings(params.tab);
    }, 220);
    if (params.source) setTimeout(function () { selectSource(params.source); }, 200);
    if (params.agent) setTimeout(function () { openAgent(params.agent); }, 220);
    if (params.obs === '0') setTimeout(function () { toggleObs(false); }, 200);
    else if (params.obs) setTimeout(function () { toggleObs(true); }, 200);
    if (params.target) setTimeout(function () { focusObject(params.target); }, 300);
    else if (params.viewer) setTimeout(openViewer, 320);
    if (params.solar) setTimeout(function () {
      var k = params.solar;
      if (window.SOLAR && window.SOLAR.byKey[k]) solarKey = k;
      else if (window.SOLAR) {
        var hit = window.SOLAR.all.filter(function (b) { return b.cn === k || b.en === k; })[0];
        if (hit) solarKey = hit.key;
      }
      openSolar({ key: solarKey, level: params.solarLevel || 'system' });
    }, 340);
    if (params.pop) setTimeout(function () { openPop($('#srcPill')); }, 300);

    if (params.sidebarCollapsed === '1' || params.sidebarCollapsed === '0') {
      state.settings.sidebarCollapsed = params.sidebarCollapsed === '1';
      applySidebarCollapse(state.settings.sidebarCollapsed);
      persist();
    }

    if (params.mode === 'compare') setTimeout(function () {
      state.settings.mode = 'compare'; persist(); renderSources();
      $$('#modeSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === 'compare'); });
    }, 180);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
