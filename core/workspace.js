/* ASTRUM · 观测工作空间与计划单（V2-SKY 阶段 6）
 *
 * 纯数据结构与导出格式，不接触 DOM、不读写 localStorage、不做天文计算。
 * 目的：让「多套观测配置」「清单快照」「CSV 导出」可被离线测试覆盖，
 * app.js 只负责 UI 与存储读写。
 */
(function (root) {
  'use strict';

  var KEY = 'astrum.workspaces.v1';
  var MAX = 12;

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function str(v, max) {
    if (v == null) return '';
    var s = String(v).trim();
    return max ? s.slice(0, max) : s;
  }

  /* 单条规范：字段缺省安全，非法条目返回 null（由 list 过滤） */
  function normalize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var lat = num(raw.lat), lon = num(raw.lon);
    if (lat == null || lon == null) return null;
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    var id = str(raw.id, 40) || ('ws_' + Math.abs(Math.round(lat * 1000)) + '_' + Math.abs(Math.round(lon * 1000)));
    return {
      id: id,
      name: str(raw.name, 24) || (lat.toFixed(2) + '°, ' + lon.toFixed(2) + '°'),
      lat: lat, lon: lon,
      tz: num(raw.tz) == null ? Math.round(lon / 15) : Math.max(-12, Math.min(14, Math.round(num(raw.tz)))),
      city: str(raw.city, 40),
      gear: ['naked', 'binocular', 'telescope', 'photo'].indexOf(raw.gear) >= 0 ? raw.gear : 'naked',
      fov: num(raw.fov) == null ? 145 : Math.max(30, Math.min(178, raw.fov)),
      yaw: num(raw.yaw) == null ? 180 : ((raw.yaw % 360) + 360) % 360,
      pitch: num(raw.pitch) == null ? 32 : Math.max(-6, Math.min(78, raw.pitch)),
      dateOffset: num(raw.dateOffset) == null ? 0 : Math.round(raw.dateOffset)
    };
  }

  function list(raw) {
    var arr = Array.isArray(raw) ? raw : [];
    var out = [], seen = {};
    for (var i = 0; i < arr.length && out.length < MAX; i++) {
      var n = normalize(arr[i]);
      if (!n || seen[n.id]) continue;
      seen[n.id] = 1;
      out.push(n);
    }
    return out;
  }

  /* 按 id 覆盖写入；超过上限丢掉最旧的一条 */
  function upsert(arr, item) {
    var n = normalize(item);
    if (!n) return list(arr);
    var out = list(arr).filter(function (x) { return x.id !== n.id; });
    out.unshift(n);
    return out.slice(0, MAX);
  }

  function remove(arr, id) {
    return list(arr).filter(function (x) { return x.id !== id; });
  }

  /* 清单项快照：加入清单时记录当时的位置与视角，便于复现 */
  function snapshot(item, ctx, view) {
    view = view || {};
    return {
      name: item.name,
      sub: item.sub || '',
      mag: num(item.mag),
      ra: num(item.ra), dec: num(item.dec),
      alt: num(item.alt),
      at: Date.now(),
      jd: num(ctx && ctx.jd),
      lat: num(ctx && ctx.lat), lon: num(ctx && ctx.lon),
      tz: num(ctx && ctx.tz),
      city: str(ctx && ctx.city, 40),
      gear: ctx && ctx.gear ? ctx.gear : '',
      fov: num(view.fov), yaw: num(view.yaw), pitch: num(view.pitch)
    };
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  var CSV_HEAD = ['序号', '目标', '备注', '视星等', '赤经', '赤纬', '加入时高度', '加入时地点', '器材', '加入时间(UTC+0)'];

  function planCsv(rows, opts) {
    opts = opts || {};
    var A = root.Astro;
    var lines = [CSV_HEAD.map(csvCell).join(',')];
    (Array.isArray(rows) ? rows : []).forEach(function (p, i) {
      var raTxt = '', decTxt = '';
      if (A && p.ra != null && A.fmtRA) { raTxt = A.fmtRA(p.ra); decTxt = A.fmtDec(p.dec); }
      var when = '';
      if (p.at) {
        try { when = new Date(p.at).toISOString().replace('T', ' ').slice(0, 19); } catch (e) { when = ''; }
      }
      lines.push([
        i + 1, p.name, p.sub, p.mag, raTxt, decTxt,
        p.alt == null ? '' : Math.round(p.alt) + '°',
        p.city || '', p.gear || '', when
      ].map(csvCell).join(','));
    });
    if (opts.note !== false) {
      lines.push('');
      lines.push(csvCell('由 ASTRUM 生成；坐标为 J2000，高度为加入清单时的瞬时值，出发前请复核天气与月相。'));
    }
    return lines.join('\r\n');
  }

  root.Workspace = {
    version: '1.0.0',
    KEY: KEY,
    MAX: MAX,
    normalize: normalize,
    list: list,
    upsert: upsert,
    remove: remove,
    snapshot: snapshot,
    planCsv: planCsv
  };
})(typeof window !== 'undefined' ? window : globalThis);
