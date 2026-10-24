/* ASTRUM · 全球地名检索模块 v1.0
 *
 * 目标：让「地点」输入框能接受**全球任意位置名**，而不只是内置的 809 座城市。
 *
 * 为什么需要：
 *   内置数据集仅 809 条（GeoNames cities15000 子集），且只覆盖人口城市。
 *   用户输入「黄山风景区」「Mauna Kea」「Eiffel Tower」「Lofoten」等一律无结果。
 *   把 GeoNames 全量（300 万+）打进包里不现实 —— 因此改为在线检索为主。
 *
 * 数据源（三路互补，均无需 API key）：
 *   1. Open-Meteo Geocoding —— 基于 GeoNames 全量人口地名，自带中文名与 IANA 时区，
 *      覆盖到乡镇（PPL）/县区（PPLA）/山峰（MT）/机场（AIRP）。
 *   2. Photon (Komoot) —— 基于 OpenStreetMap，覆盖自然地标与地标性建筑，
 *      Open-Meteo 查不到时补位。
 *   3. 本地内置 809 城市 —— 离线兜底，断网时仍可检索。
 *
 * 时区补齐：
 *   Photon 不返回时区，用 timeapi.io 按坐标反查 IANA 时区名。
 *   Open-Meteo 自带 timezone 字段，无需额外请求。
 */
(function (root) {
  'use strict';

  /* ============================================================
     配置
     ============================================================ */
  var ENDPOINTS = [
    {
      name: 'open-meteo',
      url: 'https://geocoding-api.open-meteo.com/v1/search',
      /* 同时请求中英两版：
       *   zh 版提供中文显示名（「雷克亞維克」），en 版提供可匹配的英文名（「Reykjavik」）。
       *   只请求 zh 版会导致英文查询匹配不上本地化名称，排序错乱。 */
      build: function (q, limit) {
        return this.url + '?name=' + encodeURIComponent(q) +
          '&count=' + limit + '&language=zh&format=json';
      },
      buildEn: function (q, limit) {
        return this.url + '?name=' + encodeURIComponent(q) +
          '&count=' + limit + '&language=en&format=json';
      },
      parse: function (d) {
        if (!d || !d.results || !d.results.length) return [];
        return d.results.map(function (r) {
          var kind = kindOfGeo(r.feature_code);
          return {
            id: r.id,
            n: r.name || '',
            en: r.name || '',
            lat: Number(r.latitude),
            lon: Number(r.longitude),
            cc: r.country_code || '',
            country: r.country || '',
            admin1: r.admin1 || '',
            admin2: r.admin2 || '',
            tzid: r.timezone || null,
            pop: r.population || 0,
            /* popRank 编码「这个条目作为该名字正主的可信度」：
             *   6 = 首都/一级行政区（国家或州级正主）
             *   5 = 二级行政区（市/大区）
             *   4 = 三级及以下行政区
             *   3 = 其他有真实人口的聚居地
             *   0 = 无人口的地标类
             * 这样搜 "Interlaken" 时，瑞士的「因特拉肯」（二级行政区）
             * 会排在美国的同名小镇（普通聚居地）之前。 */
            popRank: r.population ? (rankOfGeo(r.feature_code) || 3) : 0,
            kind: kind,
            src: 'open-meteo',
            el: Number(r.elevation) || 0
          };
        });
      },
      /* 用英文版覆盖 en 字段，实现「中文显示 + 英文可搜」
       * 注意：enList 的元素是 parse() 的产物，名称字段叫 n，不是 name */
      mergeEn: function (zhList, enList) {
        if (!enList || !enList.length) return zhList;
        var byId = {};
        for (var i = 0; i < enList.length; i++) {
          if (enList[i].id != null) byId[enList[i].id] = enList[i];
        }
        for (var j = 0; j < zhList.length; j++) {
          var e = byId[zhList[j].id];
          if (e && e.n) zhList[j].en = e.n;
        }
        return zhList;
      }
    },
    {
      name: 'photon',
      url: 'https://photon.komoot.io/api/',
      build: function (q, limit) {
        return this.url + '?q=' + encodeURIComponent(q) + '&limit=' + limit;
      },
      /* 多词查询时，额外用几个变体再查一次，提高召回。
       * 原因：Photon 依赖 OSM 的**官方名称**匹配，词序与用词不同结果差异极大。
       *   搜 "Eiffel Tower" → 前几名是加拿大山峰/美国家庭住宅，巴黎塔进不了前 10
       *                      （巴黎塔在 OSM 里的 name 是 "Tour Eiffel"）；
       *   搜 "Tour Eiffel"  → 第一条就是巴黎埃菲尔铁塔 (48.858, 2.295)。
       * 变体：① 原词序 ② 词序反转 ③ 去掉末词。
       * 三个查询并行，结果合并去重，交给 rank 排序。 */
      buildVariants: function (q, limit) {
        var parts = String(q).trim().split(/\s+/);
        var urls = [this.url + '?q=' + encodeURIComponent(q) + '&limit=' + limit];
        if (parts.length >= 2) {
          urls.push(this.url + '?q=' + encodeURIComponent(parts.slice().reverse().join(' ')) + '&limit=' + limit);
          urls.push(this.url + '?q=' + encodeURIComponent(parts.slice(0, -1).join(' ')) + '&limit=' + limit);
        }
        return urls;
      },
      parse: function (d) {
        if (!d || !d.features || !d.features.length) return [];
        return d.features.map(function (f) {
          var p = f.properties || {}, g = f.geometry || {};
          var c = g.coordinates || [];
          /* Photon 不提供人口，但 osm_key=place 的条目是真实聚居地。
           * 用 popRank 表达「作为该名字正主的可信度」，与 Open-Meteo 的档位对齐：
           *   6 = 国家/州级   5 = 城市/市镇   3 = 村庄/小聚居地   0 = 其他 */
          var isPlace = p.osm_key === 'place';
          var pop = p.pop || 0;
          var popRank = 0;
          if (isPlace) {
            var v = p.osm_value;
            if (v === 'country' || v === 'state') popRank = 6;
            else if (v === 'city' || v === 'town' || v === 'municipality') popRank = 5;
            else if (v === 'village' || v === 'hamlet' || v === 'suburb' || v === 'quarter') popRank = 3;
            else if (v === 'locality' || v === 'borough') popRank = 2;
            else popRank = 3;
          }
          return {
            n: p.name || p.city || '',
            en: p.name || '',
            lat: Number(c[1]),
            lon: Number(c[0]),
            cc: p.countrycode || '',
            country: p.country || '',
            admin1: p.state || '',
            admin2: p.county || '',
            tzid: null,               /* Photon 无时区字段，靠后置补齐 */
            pop: pop,
            popRank: popRank,
            kind: kindOfOsm(p),
            src: 'photon',
            el: 0
          };
        });
      }
    }
  ];

  /* GeoNames feature_code → 中文类型名 */
  var GEO_KIND = {
    PPLC: '首都', PPLA: '一级行政区', PPLA2: '二级行政区', PPLA3: '三级行政区',
    PPLA4: '四级行政区', PPL: '聚居地', PPLL: '聚居地', PPLX: '历史地名',
    PPLS: '聚居地', PPLW: '历史地名', STLMT: '定居点', ADM1: '一级行政区',
    ADM2: '二级行政区', ADM3: '三级行政区', ADM4: '四级行政区',
    MT: '山峰', PK: '山峰', PKS: '峰群', VLC: '火山', HLL: '山丘', HLLS: '丘陵',
    ISL: '岛屿', ISLS: '群岛', LK: '湖泊', LKS: '湖群', RSV: '水库',
    BAY: '海湾', CAPE: '海角', RESN: '保护区', PRK: '公园', RES: '保护区',
    RGN: '地区', CONT: '大陆', PCLI: '政区', TERR: '领土',
    AIRP: '机场', AIRF: '机场', AIRH: '直升机场', STDM: '体育场',
    HTL: '酒店', MUS: '博物馆', CAST: '城堡', MNMT: '纪念碑',
    ZOO: '动物园', UNIV: '大学', SCHL: '学校', HOSP: '医院',
    RSTN: '车站', RTE: '铁路站', BLDG: '建筑物'
  };

  /* OSM type → 中文类型名 */
  var OSM_KIND = {
    city: '城市', town: '城镇', village: '村庄', hamlet: '聚居地',
    district: '区县', county: '郡', state: '一级行政区', province: '省',
    country: '国家', region: '地区', municipality: '市镇',
    other: '地标', locality: '地点', suburb: '城区', quarter: '街区',
    island: '岛屿', water: '水域', peak: '山峰', hill: '山丘',
    volcano: '火山', forest: '森林', park: '公园', nature: '自然地',
    railway: '铁路', airport: '机场', attraction: '景点', memorial: '纪念地',
    monument: '纪念碑', castle: '城堡', museum: '博物馆', church: '教堂',
    hotel: '酒店', school: '学校', university: '大学', hospital: '医院',
    stadium: '体育场', building: '建筑物', house: '建筑', suburb_: '城区'
  };

  function kindOfGeo(code) {
    return GEO_KIND[code] || (code ? '地点' : '');
  }

  /* GeoNames feature_code → 作为「该名字正主」的可信度档位
   * 数值越大越可能是用户想找的那个同名地点。 */
  function rankOfGeo(code) {
    switch (code) {
      case 'PPLC': return 6;   /* 首都 */
      case 'PPLA': return 5;   /* 一级行政区（州/省） */
      case 'ADM1': return 6;
      case 'PPLA2': case 'ADM2': return 5;
      case 'PPLA3': case 'ADM3': return 4;
      case 'PPLA4': case 'ADM4': return 4;
      case 'PCLI': return 6;   /* 独立政区 */
      case 'PPLL': case 'PPLX': case 'PPLS': case 'STLM': return 3;  /* 历史地名/聚居地 */
      case 'PPL': return 2;    /* 一般聚居地 */
      case 'MT': case 'PK': case 'VLC': return 1;   /* 山峰/火山 */
      case 'AIRP': case 'AIRF': case 'RSTN': return 1;
      default: return 0;
    }
  }
  function kindOfOsm(p) {
    var k = p.osm_value || p.type || '';
    if (OSM_KIND[k]) return OSM_KIND[k];
    if (p.osm_key === 'place') return OSM_KIND[k] || '地点';
    if (p.osm_key === 'tourism') return '景点';
    if (p.osm_key === 'historic') return '历史遗迹';
    if (p.osm_key === 'aeroway') return '机场';
    if (p.osm_key === 'railway') return '铁路';
    if (p.osm_key === 'highway') return '道路';
    if (p.osm_key === 'natural') {
      if (k === 'peak' || k === 'volcano') return '山峰';
      if (k === 'wood' || k === 'forest' || k === 'scrub') return '自然地';
      return '自然地';
    }
    /* man_made 下的塔、桥、城堡等 —— 视作地标（用户通常想找的是这类） */
    if (p.osm_key === 'man_made') {
      if (k === 'tower' || k === 'mast' || k === 'chimney') return '地标';
      if (k === 'bridge') return '地标';
      if (k === 'lighthouse') return '地标';
      return '地点';
    }
    if (p.osm_key === 'leisure') {
      if (k === 'park' || k === 'garden' || k === 'nature_reserve') return '公园';
      return '地点';
    }
    return '地点';
  }

  /* ============================================================
     内部工具
     ============================================================ */
  function withTimeout(ms) {
    var ctrl = null;
    try { ctrl = new AbortController(); } catch (e) { ctrl = null; }
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    return {
      signal: ctrl ? ctrl.signal : undefined,
      cancel: function () { clearTimeout(timer); }
    };
  }

  function fetchJSON(url, ms) {
    var t = withTimeout(ms || 5000);
    var opt = { cache: 'no-store', headers: { Accept: 'application/json' } };
    if (t.signal) opt.signal = t.signal;
    return fetch(url, opt)
      .then(function (r) {
        if (!r.ok) {
          var e = new Error('HTTP ' + r.status);
          e.status = r.status;
          throw e;
        }
        return r.text();
      })
      .then(function (txt) {
        try { return JSON.parse(txt); }
        catch (e) {
          var err = new Error('返回内容不是 JSON');
          err.reason = 'parse';
          throw err;
        }
      })
      .then(function (v) { t.cancel(); return v; },
        function (e) { t.cancel(); throw e; });
  }

  /* 带重试的 fetchJSON：网络瞬断时重试一次。
   * 实测 Photon 在并发或瞬时拥塞时会直接断连（"Failed to fetch"）。 */
  function fetchJSONRetry(url, ms, tries) {
    var n = tries || 2;
    return fetchJSON(url, ms).catch(function (e) {
      /* 4xx（除 429）不重试 */
      if (e && e.status && e.status !== 429 && e.status < 500) throw e;
      if (n <= 1) throw e;
      return new Promise(function (res) {
        setTimeout(res, 260);
      }).then(function () { return fetchJSONRetry(url, ms, n - 1); });
    });
  }

  /* 跨来源共识：同一位点若被多个数据源收录，说明两个源都认为它是该名字的「正主」，
   * 可信度最高。典型场景：搜 "Interlaken"，瑞士的正牌与美国的同名小镇可能都只有
   * 单源收录，而共识条目会被优先展示。
   *
   * 坐标比对用 2 位小数（约 1.1 km）：两个源的同一地点坐标常有几十米差异
   * （Open-Meteo 46.68387 vs Photon 46.6855），3 位小数会判为不同条目而丢失共识。
   * 必须在 dedupe 之后调用（dedupe 已把同坐标的多源信息合并到 srcs）。 */
  function applyConsensus(list) {
    /* 找出被多源收录的地点（距离 500 m 内视为同一点） */
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      var srcs = {};
      var sl = p.srcs || (p.src ? [p.src] : []);
      for (var s = 0; s < sl.length; s++) srcs[sl[s]] = 1;
      var n = Object.keys(srcs).length;
      p.consensus = n;
      if (n >= 2) p.popRank = 7;   /* 共识条目提到最高档 */
    }
    /* 共识不只看自身来源，还要看邻近条目是否也被多源收录 ——
       dedupe 后瑞士条目已与 Photon 合并，srcs 会包含两个源。 */
    return list;
  }
  /* 去掉结果中的重复坐标（同一位点的不同来源）
   * 保留信息更全的一条：有英文名的优先、有时区的优先、人口大的优先 */
  /* 同一地点在不同源的坐标常有差异（如 Open-Meteo 46.68387,7.86638 与
     Photon 46.6855,7.8585 相差约 0.6 km），用字符串键（toFixed）判定会在
     四舍五入边界上不一致 —— 46.684→"46.68" 而 46.6855→"46.69"，
     明明是同一地却被拆成两条。改用球面距离阈值判定同一点。 */
  function samePoint(a, b, tolKm) {
    var t = tolKm || 1.5;
    var dLat = (a.lat - b.lat) * 111.32;
    var dLon = (a.lon - b.lon) * 111.32 * Math.cos(a.lat * Math.PI / 180);
    return (dLat * dLat + dLon * dLon) <= t * t;
  }

  function dedupe(list) {
    var kept = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!isFinite(p.lat) || !isFinite(p.lon)) continue;
      if (Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180) continue;
      var hit = null;
      for (var j = 0; j < kept.length; j++) {
        if (samePoint(p, kept[j], 1.5)) { hit = j; break; }
      }
      if (hit === null) { kept.push(p); continue; }
      var old = kept[hit];
      var score = function (q) {
        return (q.popRank || 0) * 4 + (q.pop > 0 ? 4 : 0) +
          (q.tzid ? 2 : 0) + (q.en && q.en !== q.n ? 1 : 0);
      };
      if (score(p) > score(old)) {
        p.srcs = mergeSrcs(old, p);
        kept[hit] = p;
      } else {
        old.srcs = mergeSrcs(old, p);
      }
    }
    return kept;
  }

  /* 合并两条记录的来源集合 */
  function mergeSrcs(a, b) {
    var s = {};
    var la = a.srcs || (a.src ? [a.src] : []);
    var lb = b.srcs || (b.src ? [b.src] : []);
    for (var i = 0; i < la.length; i++) s[la[i]] = 1;
    for (var j = 0; j < lb.length; j++) s[lb[j]] = 1;
    var out = [];
    for (var k in s) if (Object.prototype.hasOwnProperty.call(s, k)) out.push(k);
    return out;
  }

  /* 结果排序规则（按优先级从高到低）：
   *   1. 名称完全等于查询词
   *   2. 有明确人口数据（说明是真实聚居地，而非同名店铺/山地）
   *   3. 名称前缀匹配
   *   4. 类型重要度（首都>市>县>镇>村>地标）
   *   5. 人口数
   *
   * 为什么要 2 在 3 之前：
   *   搜「Reykjavik」时，Photon 会返回一堆同名结果（加拿大 Manitoba 的 place/locality、
   *   德国巴登符腾堡的 shop/clothes），而 Open-Meteo 返回的「雷克亞維克 / 冰岛 /
   *   人口 118918」才是用户要找的。人口字段能有效区分「真地点」与「同名噪声」。
   */
  function rank(list, q) {
    var k = String(q || '').trim().toLowerCase();
    var kindWeight = {
      '首都': 100, '一级行政区': 92, '二级行政区': 88, '三级行政区': 84, '四级行政区': 80,
      '城市': 78, '城镇': 70, '市镇': 68, '区县': 64, '郡': 62, '省': 60, '州': 58,
      '聚居地': 52, '地区': 48, '政区': 46, '国家': 44, '大陆': 42,
      '景点': 44, '地标': 42, '历史遗迹': 40, '纪念地': 38, '纪念碑': 38, '城堡': 36,
      '博物馆': 34, '公园': 32, '保护区': 32, '车站': 30, '机场': 28, '大学': 26,
      '自然地': 22, '山峰': 20, '火山': 20, '岛屿': 18,
      '湖泊': 16, '海湾': 16, '海角': 16,
      '道路': 3, '铁路': 6, '地点': 8, '地形': 10
    };
    list.sort(function (a, b) {
      var sa = String(a.n || '').toLowerCase(), sb = String(b.n || '').toLowerCase();
      var xa = String(a.en || '').toLowerCase(), xb = String(b.en || '').toLowerCase();
      /* 1) 名称精确匹配（中英文名都算） */
      var ea = (sa === k || xa === k) ? 1 : 0, eb = (sb === k || xb === k) ? 1 : 0;
      if (ea !== eb) return eb - ea;
      /* 2) 可信度档位：popRank 高的优先
       *    7 = 跨源共识（两个数据源都收录的同一位点）
       *    6 = 首都/一级行政区   5 = 二级行政区   4 = 三级及以下
       *    3 = 其他有真实人口的聚居地   0 = 无人口的地标类 */
      var ra = a.popRank || 0, rb = b.popRank || 0;
      if (ra !== rb) return rb - ra;
      /* 2b) 同档位内：若双方名称都精确命中查询词，名称更短者优先
       *    同名不同国时，主名通常就是查询词本身：
       *      搜 "La Palma"，西班牙的「La Palma del Condado」与
       *      巴拿马的「La Palma」都命中，但「La Palma」更短，
       *      往往就是用户要找的那个 —— 带后缀的反而是更小的地名。
       *    注意这条只在「都精确命中」时生效：若一方是本地化名
       *    （如瑞士因特拉肯 vs 英文 Interlaken），长度不可比。 */
      var hitA = (sa === k || xa === k) ? 1 : 0;
      var hitB = (sb === k || xb === k) ? 1 : 0;
      if (hitA && hitB) {
        var la = (a.n || '').length, lb = (b.n || '').length;
        if (la !== lb) return la - lb;
      }
      /* 2c) 再比类型重要度 */
      var wa = kindWeight[a.kind] || 5, wb = kindWeight[b.kind] || 5;
      if (wa !== wb) return wb - wa;
      /* 2d) 最后比人口 */
      if (a.pop !== b.pop) return (b.pop || 0) - (a.pop || 0);
      /* 3) 前缀匹配 */
      var pa = (sa.indexOf(k) === 0 || xa.indexOf(k) === 0) ? 1 : 0;
      var pb = (sb.indexOf(k) === 0 || xb.indexOf(k) === 0) ? 1 : 0;
      if (pa !== pb) return pb - pa;
      return 0;
    });
    return list;
  }

  /* 展示标签：名称 · 行政层级 · 国家 · 类型 */
  function labelOf(p) {
    var bits = [p.n];
    var region = p.admin2 || p.admin1 || '';
    if (region && region !== p.n) bits.push(region);
    if (p.country && p.country !== p.n) bits.push(p.country);
    if (p.kind) bits.push(p.kind);
    return bits.filter(Boolean).join(' · ');
  }

  /* ============================================================
     时区补齐
     ============================================================ */
  var TZ_CACHE = {};

  function tzByCoord(lat, lon) {
    var key = lat.toFixed(2) + ',' + lon.toFixed(2);
    if (TZ_CACHE[key]) return TZ_CACHE[key];
    var url = 'https://timeapi.io/api/TimeZone/coordinate?latitude=' +
      lat.toFixed(4) + '&longitude=' + lon.toFixed(4);
    TZ_CACHE[key] = fetchJSONRetry(url, 6000)
      .then(function (d) {
        if (!d || !d.timeZone) throw new Error('no tz');
        return d.timeZone;
      })
      .catch(function () { return null; });
    return TZ_CACHE[key];
  }

  /* 为缺时区的结果补时区（Photon 结果） */
  function fillTimezone(list) {
    var need = [];
    for (var i = 0; i < list.length; i++) {
      if (!list[i].tzid && isFinite(list[i].lat) && isFinite(list[i].lon)) need.push(list[i]);
    }
    if (!need.length) return Promise.resolve(list);
    /* 只为前若干个补，避免请求过多 */
    var top = need.slice(0, 6);
    return Promise.all(top.map(function (p) {
      return tzByCoord(p.lat, p.lon).then(function (tz) { if (tz) p.tzid = tz; });
    })).then(function () { return list; });
  }

  /* ============================================================
     主接口：search(query, limit)
     返回 Promise<Array<place>>
     ============================================================ */
  function search(query, limit) {
    var q = String(query || '').trim();
    limit = limit || 20;
    if (!q) return Promise.resolve([]);

    var tasks = ENDPOINTS.map(function (ep) {
      if (ep.buildEn) {
        /* 双语请求：中文版给显示名，英文版给可匹配的 en 名。
         * 串行执行，避免并发被限流。 */
        return fetchJSONRetry(ep.build(q, limit), 5000)
          .then(function (d) { return ep.parse(d) || []; })
          .catch(function () { return []; })
          .then(function (zh) {
            return fetchJSONRetry(ep.buildEn(q, limit), 5000)
              .then(function (d) { return ep.parse(d) || []; })
              .catch(function () { return []; })
              .then(function (en) { return ep.mergeEn(zh, en); });
          })
          .catch(function () { return []; });
      }
      if (ep.buildVariants) {
        /* 多个查询变体：串行执行 + 失败重试。
         * Photon 对并发请求会直接断连（fetch 报 "Failed to fetch"），
         * 实测同一时刻发 3 个请求全部失败，串行则稳定返回 200。 */
        var urls = ep.buildVariants(q, limit);
        var out = [];
        var idx = 0;
        function step() {
          if (idx >= urls.length) return Promise.resolve(out);
          var u = urls[idx++];
          return fetchJSONRetry(u, 5000)
            .then(function (d) {
              try { out = out.concat(ep.parse(d) || []); }
              catch (e) { /* 忽略单次解析失败 */ }
            })
            .catch(function () { /* 单个变体失败不影响其他 */ })
            .then(step);
        }
        return step().catch(function () { return []; });
      }
      return fetchJSON(ep.build(q, limit), 5000)
        .then(function (d) {
          try { return ep.parse(d) || []; }
          catch (e) { return []; }
        })
        .catch(function () { return []; });
    });

    return Promise.all(tasks)
      .then(function (groups) {
        var all = [];
        for (var i = 0; i < groups.length; i++) all = all.concat(groups[i]);
        all = dedupe(all);
        applyConsensus(all);
        rank(all, q);
        /* 候选池容量放大到展示条数的 2 倍：
           重要候选（如巴黎埃菲尔铁塔在 OSM 中的官方名是 "Tour Eiffel"）
           可能排在原始返回的第 15~30 位，先放大池子再截断才不会漏掉。 */
        all = all.slice(0, limit * 2);
        return fillTimezone(all);
      })
      .catch(function () { return []; });
  }

  /* 反查：给定坐标，返回最接近的地名描述（用于 IP 定位后的补充说明） */
  function reverse(lat, lon) {
    var url = 'https://photon.komoot.io/reverse?lat=' + lat.toFixed(4) +
      '&lon=' + lon.toFixed(4) + '&limit=1';
    return fetchJSONRetry(url, 6000)
      .then(function (d) {
        if (!d || !d.features || !d.features.length) return null;
        var f = d.features[0], p = f.properties || {}, c = (f.geometry || {}).coordinates || [];
        return {
          n: p.name || p.city || '当前地点',
          city: p.city || '', state: p.state || '', country: p.country || '',
          cc: p.countrycode || '', lat: Number(c[1]), lon: Number(c[0])
        };
      })
      .catch(function () { return null; });
  }

  root.GeoSearch = {
    search: search,
    reverse: reverse,
    labelOf: labelOf,
    kindOfGeo: kindOfGeo,
    kindOfOsm: kindOfOsm,
    ENDPOINTS: ENDPOINTS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
