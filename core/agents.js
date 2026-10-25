/* ASTRUM · 多智能体编排层
 * 职责：意图解析 -> 实体识别 -> 任务分派 -> 星历计算 -> 观测评估 -> 答案组装 -> 边界核验
 * 设计原则：
 *  1) 任何数值结论都必须可追溯到星历计算或知识库条目
 *  2) 不确定时降级为「明确的不确定」，而不是生成貌似合理的答案
 *  3) 语体（专业/科普）与语气（学术/亲和/诗意）为两层独立参数
 */
(function (root) {
  'use strict';
  var A = root.Astro, CAT = root.CATALOG, KB = root.KNOWLEDGE, RT = root.AstroRuntime;

  /* ================= 城市与观测地 ================= */
  var CITIES = [
    { n: '北京', lat: 39.9042, lon: 116.4074, tz: 8, bortle: 7 },
    { n: '上海', lat: 31.2304, lon: 121.4737, tz: 8, bortle: 8 },
    { n: '广州', lat: 23.1291, lon: 113.2644, tz: 8, bortle: 8 },
    { n: '深圳', lat: 22.5431, lon: 114.0579, tz: 8, bortle: 8 },
    { n: '成都', lat: 30.5728, lon: 104.0668, tz: 8, bortle: 7 },
    { n: '重庆', lat: 29.5630, lon: 106.5516, tz: 8, bortle: 7 },
    { n: '西安', lat: 34.3416, lon: 108.9398, tz: 8, bortle: 7 },
    { n: '南京', lat: 32.0603, lon: 118.7969, tz: 8, bortle: 7 },
    { n: '杭州', lat: 30.2741, lon: 120.1551, tz: 8, bortle: 8 },
    { n: '武汉', lat: 30.5928, lon: 114.3055, tz: 8, bortle: 7 },
    { n: '昆明', lat: 25.0389, lon: 102.7183, tz: 8, bortle: 5 },
    { n: '丽江', lat: 26.8721, lon: 100.2299, tz: 8, bortle: 3 },
    { n: '拉萨', lat: 29.6520, lon: 91.1721, tz: 8, bortle: 4 },
    { n: '乌鲁木齐', lat: 43.8256, lon: 87.6168, tz: 8, bortle: 6 },
    { n: '哈尔滨', lat: 45.8038, lon: 126.5349, tz: 8, bortle: 6 },
    { n: '漠河', lat: 52.9722, lon: 122.5389, tz: 8, bortle: 3 },
    { n: '三亚', lat: 18.2528, lon: 109.5119, tz: 8, bortle: 5 },
    { n: '青岛', lat: 36.0671, lon: 120.3826, tz: 8, bortle: 6 },
    { n: '厦门', lat: 24.4798, lon: 118.0894, tz: 8, bortle: 7 },
    { n: '长沙', lat: 28.2282, lon: 112.9388, tz: 8, bortle: 7 },
    { n: '郑州', lat: 34.7466, lon: 113.6254, tz: 8, bortle: 7 },
    { n: '沈阳', lat: 41.8057, lon: 123.4315, tz: 8, bortle: 6 },
    { n: '呼和浩特', lat: 40.8414, lon: 111.7519, tz: 8, bortle: 6 },
    { n: '西宁', lat: 36.6171, lon: 101.7782, tz: 8, bortle: 5 },
    { n: '贵阳', lat: 26.6470, lon: 106.6302, tz: 8, bortle: 6 },
    { n: '福州', lat: 26.0745, lon: 119.2965, tz: 8, bortle: 7 },
    { n: '兰州', lat: 36.0611, lon: 103.8343, tz: 8, bortle: 6 },
    { n: '东京', lat: 35.6762, lon: 139.6503, tz: 9, bortle: 8, dst: 'none' },
    { n: '首尔', lat: 37.5665, lon: 126.9780, tz: 9, bortle: 8, dst: 'none' },
    { n: '新加坡', lat: 1.3521, lon: 103.8198, tz: 8, bortle: 8, dst: 'none' },
    { n: '悉尼', lat: -33.8688, lon: 151.2093, tz: 10, bortle: 7, dst: 'au' },
    { n: '奥克兰', lat: -36.8485, lon: 174.7633, tz: 12, bortle: 6, dst: 'au' },
    { n: '伦敦', lat: 51.5074, lon: -0.1278, tz: 0, bortle: 8, dst: 'eu' },
    { n: '纽约', lat: 40.7128, lon: -74.0060, tz: -5, bortle: 8, dst: 'us' },
    { n: '洛杉矶', lat: 34.0522, lon: -118.2437, tz: -8, bortle: 8, dst: 'us' },
    { n: '温哥华', lat: 49.2827, lon: -123.1207, tz: -8, bortle: 7, dst: 'us' },
    { n: '雷克雅未克', lat: 64.1466, lon: -21.9426, tz: 0, bortle: 4, dst: 'none', alias: ['冰岛'] },
    { n: '马德里', lat: 40.4168, lon: -3.7038, tz: 1, bortle: 7, dst: 'eu', alias: ['西班牙'] },
    { n: '开罗', lat: 30.0444, lon: 31.2357, tz: 2, bortle: 8, dst: 'none', alias: ['埃及'] },
    { n: '卢克索', lat: 25.6872, lon: 32.6396, tz: 2, bortle: 5, dst: 'none' },
    { n: '特内里费', lat: 28.2916, lon: -16.6291, tz: 0, bortle: 2, dst: 'eu' },
    { n: '阿塔卡马', lat: -24.6272, lon: -70.4042, tz: -4, bortle: 1, dst: 'none' },
    { n: '开普敦', lat: -33.9249, lon: 18.4241, tz: 2, bortle: 6, dst: 'none' }
  ];

  /* IANA 时区 → 当日 UTC 偏移（由浏览器 Intl 计算，含夏令时） */
  var _tzCache = {};
  function ianaOffset(tzid, y, mo, d) {
    var key = tzid + '|' + y + '-' + mo + '-' + d;
    if (_tzCache[key] !== undefined) return _tzCache[key];
    var off;
    try {
      var guess = Date.UTC(y, mo - 1, d, 12, 0, 0);
      var dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tzid, hour12: false, year: 'numeric', month: '2-digit',
        day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      var parts = {};
      dtf.formatToParts(new Date(guess)).forEach(function (x) { parts[x.type] = x.value; });
      var asUTC = Date.UTC(+parts.year, +parts.month - 1, +parts.day,
        (+parts.hour) % 24, +parts.minute, +parts.second);
      off = Math.round((asUTC - guess) / 3600000 * 4) / 4;
    } catch (e) {
      off = Math.round(-0);
    }
    _tzCache[key] = off;
    return off;
  }

  /* ===== 全球地点：合并 GeoNames 子集（首都 + 人口前 700） ===== */
  (function mergePlaces() {
    var G = (typeof root !== 'undefined' && root.PLACES) ? root.PLACES : null;
    if (!G) return;
    G.forEach(function (p) {
      for (var i = 0; i < CITIES.length; i++) {
        if (Math.abs(CITIES[i].lat - p.lat) < 0.12 && Math.abs(CITIES[i].lon - p.lon) < 0.12) {
          var c = CITIES[i];
          /* 保留人工核对的暗夜等级，补上英文名与 IANA 时区 */
          if (!c.en) c.en = p.en;
          if (!c.cc) c.cc = p.cc;
          if (!c.tzid) c.tzid = p.tzid;
          if (p.zh && p.zh !== c.n) c.alias = (c.alias || []).concat([p.zh]);
          return;
        }
      }
      CITIES.push({
        n: p.zh || p.en, en: p.en, lat: p.lat, lon: p.lon,
        tzid: p.tzid, cc: p.cc, bortle: 6, estimated: true
      });
    });
    CITIES.sort(function (a, b) { return (b.bortle ? 0 : 1) - (a.bortle ? 0 : 1); });
  })();

  function dstOffset(city, y, mo, d) {
    if (!city.dst || city.dst === 'none') return 0;
    if (city.dst === 'eu') {
      if (mo > 3 && mo < 10) return 1;
      if (mo === 3 && d >= 25) return 1;
      if (mo === 10 && d < 25) return 1;
      return 0;
    }
    if (city.dst === 'us') {
      if (mo > 3 && mo < 11) return 1;
      if (mo === 3 && d >= 8) return 1;
      if (mo === 11 && d <= 7) return 1;
      return 0;
    }
    if (city.dst === 'au') {
      if (mo > 10 || mo < 4) return 1;
      if (mo === 4 && d <= 7) return 1;
      if (mo === 10 && d >= 1) return 1;
      return 0;
    }
    return 0;
  }
  function tzOf(city, y, mo, d) {
    if (!city) city = CITIES[0];
    if (city.tzid && typeof Intl !== 'undefined') {
      var off = ianaOffset(city.tzid, y, mo, d);
      if (isFinite(off)) return off;
    }
    if (typeof city.tz !== 'number') return 8;
    return city.tz + dstOffset(city, y, mo, d);
  }

  /* ================= Agent 定义 ================= */
  var ATTRS = {
    tone: { label: '语气风格', options: [['academic', '学术'], ['warm', '亲和'], ['poetic', '诗意']] },
    depth: { label: '回答深度', options: [['brief', '精简'], ['standard', '标准'], ['deep', '详尽']] },
    scope: { label: '知识范围', options: [['auto', '自适应'], ['pro', '专业'], ['pop', '科普']] },
    focus: { label: '专业侧重', options: [['balanced', '均衡'], ['deepsky', '深空天体'], ['stellar', '恒星演化'], ['planets', '行星系统'], ['cosmology', '宇宙学'], ['history', '观测史']] },
    creativity: { label: '推断尺度', options: [['conservative', '保守'], ['balanced', '平衡'], ['speculative', '发散']] },
    precision: { label: '数值精度', options: [['visual', '目视级'], ['photo', '摄影级']] },
    gear: { label: '器材倾向', options: [['naked', '肉眼优先'], ['binocular', '双筒优先'], ['telescope', '望远镜优先'], ['photo', '摄影优先']] },
    style: { label: '星图风格', options: [['minimal', '极简'], ['labeled', '标注'], ['deep', '密集']] },
    domain: { label: '专业领域', options: [['general', '通用'], ['solar', '太阳系'], ['compact', '致密天体'], ['stellar', '恒星与星系'], ['deepsky', '深空观测']] },
    evidence: { label: '证据门槛', options: [['strict', '严格'], ['balanced', '均衡'], ['open', '开放']] }
  };

  var AGENTS = [
    {
      id: 'muse', name: 'Muse', cn: '缪斯', sigil: 'M',
      role: '总控 · 意图解析与协奏', color: '#d8b47a',
      desc: '把一句话拆成可执行的天文任务，决定谁上场、谁闭嘴，并守住能力边界。',
      attrs: ['tone', 'depth', 'scope', 'creativity'],
      defaults: { tone: 'academic', depth: 'standard', scope: 'auto', creativity: 'balanced' }
    },
    {
      id: 'vega', name: 'Vega', cn: '织女', sigil: 'V',
      role: '知识 · 事实与依据', color: '#9fb8ff',
      desc: '检索知识库与星表，只输出可追溯的事实；不确定时主动标注置信度。',
      attrs: ['scope', 'focus', 'depth'],
      defaults: { scope: 'auto', focus: 'balanced', depth: 'standard' }
    },
    {
      id: 'cosmos', name: 'Cosmos', cn: '宇宙', sigil: 'C',
      role: '宇宙学 · 尺度、起源与演化', color: '#8ab4f8',
      desc: '处理黑洞、大爆炸、暗物质、暗能量、引力波等大尺度问题；每个结论都标注共识等级与核验来源。',
      attrs: ['scope', 'focus', 'depth', 'creativity'],
      defaults: { scope: 'auto', focus: 'cosmology', depth: 'standard', creativity: 'conservative' }
    },
    {
      id: 'kepler', name: 'Kepler', cn: '开普勒', sigil: 'K',
      role: '星历 · 位置与时间', color: '#7fd1c0',
      desc: '计算天体坐标、升落、中天与可见窗口。所有数字都由它签字。',
      attrs: ['precision', 'depth'],
      defaults: { precision: 'visual', depth: 'standard' }
    },
    {
      id: 'horizon', name: 'Horizon', cn: '地平', sigil: 'H',
      role: '观测 · 条件与器材', color: '#f0a97c',
      desc: '评估暗夜窗口、月光干扰、光污染与器材匹配，给出可执行建议。',
      attrs: ['gear', 'depth', 'scope'],
      defaults: { gear: 'naked', depth: 'standard', scope: 'auto' }
    },
    {
      id: 'orion', name: 'Orion', cn: '猎户', sigil: 'O',
      role: '星图 · 空间定位', color: '#b39ddb',
      desc: '把坐标翻译成可看的星空：投影、连星、方位标注与定位路径。',
      attrs: ['style', 'depth'],
      defaults: { style: 'labeled', depth: 'standard' }
    },
    {
      id: 'lyra', name: 'Lyra', cn: '天琴', sigil: 'L',
      role: '表达 · 语体与叙事', color: '#f2c1b6',
      desc: '在专业表述与科普表述之间切换，让同一个事实找到合适的说法。',
      attrs: ['tone', 'scope', 'depth'],
      defaults: { tone: 'warm', scope: 'auto', depth: 'standard' }
    },
    {
      id: 'nova', name: 'Nova', cn: '新星', sigil: 'N',
      role: '爆发 · 变星、超新星与高能天体', color: '#ff8f6b',
      desc: '处理恒星爆发现象：变星、新星、超新星、伽马暴与中子星；区分「已观测到的」与「理论上应有的」。',
      attrs: ['domain', 'scope', 'depth'],
      defaults: { domain: 'compact', scope: 'auto', depth: 'standard' }
    },
    {
      id: 'helios', name: 'Helios', cn: '赫利俄斯', sigil: 'H',
      role: '太阳 · 日面活动与空间天气', color: '#f5c451',
      desc: '关注太阳活动、耀斑、日冕物质抛射与地球磁层效应，给出观测窗口与「能否看到极光」的判断链。',
      attrs: ['domain', 'gear', 'depth'],
      defaults: { domain: 'solar', gear: 'binocular', depth: 'standard' }
    },
    {
      id: 'scholar', name: 'Scholar', cn: '研读', sigil: 'S',
      role: '文献 · 论文检索与证据评估', color: '#8ea8d8',
      desc: '专门负责学术文献这一层：把中文问题转成可检索的英文术语，去 OpenAlex 与 Semantic Scholar 找原始论文，保留 DOI、作者、发表时间与预印本状态，并把证据按「支持 / 待核验」分开。',
      /* 职责范围与使用场景显式写出来，避免变成一个只有名字的花瓶角色 */
      scope: '职责范围：① 检索词构造与术语归一化（中文 → 英文规范名）；② 原始论文检索与去重，保留 DOI/作者/发表时间；③ 区分预印本与正式发表；④ 标注证据强弱（可溯源 / 待核验）与研究分歧；⑤ 定位某结论出自哪篇文献。',
      useCases: '适用：某机制的物理过程、某参数的最新测量值、某领域是否存在争议、想找原始论文而非二手介绍、「这个数字是哪篇论文测的」。不适用：今晚能否观测、器材选择、实时天象、星图定位 —— 这些交给 Kepler、Horizon 与 Orion；也不做无出处的推论。',
      limits: '只呈现检索到的文献内容，不替论文下判断；无法确认「某段证据是否足以支持某个结论」时标为待核验。',
      attrs: ['evidence', 'depth', 'creativity'],
      defaults: { evidence: 'strict', depth: 'standard', creativity: 'conservative' }
    },
    {
      id: 'critic', name: 'Critic', cn: '评议', sigil: 'X',
      role: '评审 · 证据强度与时效核验', color: '#c0a6d6',
      desc: '在答案给出前做最后一道检查：证据条数是否支撑结论、数值是否来自星历、共识等级与核验日期是否标注、是否越界。',
      attrs: ['evidence', 'scope', 'depth'],
      defaults: { evidence: 'balanced', scope: 'auto', depth: 'standard' }
    },
    {
      id: 'curator', name: 'Curator', cn: '编目', sigil: 'P',
      role: '编目 · 多来源去重与合并', color: '#8fc9b8',
      desc: '在并行对比中合并不同来源的重复事实点，保留差异与冲突，按可信度排序，不做静默合并。',
      attrs: ['evidence', 'depth'],
      defaults: { evidence: 'balanced', depth: 'standard' }
    },
    {
      id: 'navigator', name: 'Navigator', cn: '领航', sigil: 'N',
      role: '领航 · 太阳系视图与视角操作', color: '#7aa7ff',
      desc: '把「打开太阳系」「聚焦土星」「隐藏轨道」「放大天体」这类指令解析成结构化动作，交给视图层执行，并回报执行结果与当前状态。',
      attrs: ['scope', 'depth', 'evidence'],
      defaults: { scope: 'auto', depth: 'standard', evidence: 'balanced' }
    }
  ];
  var AGENT_BY_ID = {};
  AGENTS.forEach(function (a) { AGENT_BY_ID[a.id] = a; });

  function defaultConfig() {
    var c = {};
    AGENTS.forEach(function (a) { c[a.id] = JSON.parse(JSON.stringify(a.defaults)); });
    return c;
  }

  /* ================= 实体索引 ================= */
  var ALIAS = [], READY = false;

  function normKey(s) { return String(s).toLowerCase().replace(/[\s·\-_]/g, ''); }

  function buildAlias() {
    if (READY) return;
    ALIAS = [];
    function add(key, item) {
      var k = normKey(key);
      if (!k || k.length < 2) return;
      ALIAS.push({ k: k, item: item });
    }
    KB.entries.forEach(function (e) {
      add(e.id, { kind: 'kb', entry: e });
      add(e.cn, { kind: 'kb', entry: e });
      add(e.en, { kind: 'kb', entry: e });
      (e.aliases || []).forEach(function (a) { add(a, { kind: 'kb', entry: e }); });
    });
    CAT.stars.forEach(function (s) {
      var it = { kind: 'star', key: s.k, cn: s.cn || s.en, en: s.en, ra: s.ra, dec: s.dec, mag: s.mag, con: s.con };
      add(s.k, it); add(s.en, it); add(s.cn, it);
    });
    CAT.dso.forEach(function (d) {
      var it = { kind: 'dso', key: d.k, cn: d.cn, id: d.id, ra: d.ra, dec: d.dec, mag: d.mag, type: d.type, desc: d.desc };
      add(d.k, it); add(d.id, it); add(d.cn, it);
    });
    CAT.constellations.forEach(function (c) {
      var it = { kind: 'constellation', abbr: c.abbr, cn: c.cn, en: c.en, season: c.season };
      add(c.abbr, it); add(c.cn, it); add(c.en, it);
      if (c.cn.indexOf('座') > 0) add(c.cn.replace('座', ''), it);
    });
    ['水星', '金星', '火星', '木星', '土星', '天王星', '海王星'].forEach(function (n, i) {
      var keys = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
      add(n, { kind: 'planet', key: keys[i], cn: n });
    });
    add('月亮', { kind: 'moon' }); add('月球', { kind: 'moon' }); add('moon', { kind: 'moon' });
    add('太阳', { kind: 'sun' }); add('sun', { kind: 'sun' });
    ALIAS.sort(function (a, b) { return b.k.length - a.k.length; });
    READY = true;
  }

  function resolveTargets(text) {
    buildAlias();
    var q = normKey(text), hits = [], seen = {};
    for (var i = 0; i < ALIAS.length; i++) {
      var a = ALIAS[i];
      if (q.indexOf(a.k) >= 0) {
        var id = a.item.kind === 'kb' ? 'kb:' + a.item.entry.id
          : a.item.kind === 'star' ? 'star:' + a.item.key
          : a.item.kind === 'dso' ? 'dso:' + a.item.key
          : a.item.kind === 'constellation' ? 'con:' + a.item.abbr
          : a.item.kind + ':' + (a.item.key || '');
        if (!seen[id]) { seen[id] = 1; hits.push({ item: a.item, match: a.k }); }
      }
    }
    return hits;
  }

  function findCity(text) {
    var q = String(text || '');
    var lower = q.toLowerCase();
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      if (q.indexOf(c.n) >= 0) return c;
      var al = c.alias || [];
      for (var j = 0; j < al.length; j++) if (q.indexOf(al[j]) >= 0) return c;
      if (c.en && c.en.length >= 4) {
        var en = c.en.toLowerCase();
        if (lower.indexOf(en) >= 0) return c;
        var en2 = en.replace(/ city$/, '');
        if (en2.length >= 5 && en2 !== en && lower.indexOf(en2) >= 0) return c;
      }
    }
    return null;
  }

  /* 供界面检索：按中文名、英文名、国家码匹配 */
  function searchPlaces(keyword, limit) {
    var k = String(keyword || '').trim().toLowerCase();
    limit = limit || 40;
    if (!k) return CITIES.slice(0, limit);
    var hit = [];
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      var hay = (c.n + ' ' + (c.en || '') + ' ' + (c.cc || '')).toLowerCase();
      if (hay.indexOf(k) >= 0) hit.push(c);
      if (hit.length >= limit * 3) break;
    }
    hit.sort(function (a, b) { return (b.pop || 0) - (a.pop || 0); });
    return hit.slice(0, limit);
  }

  function nearestPlace(lat, lon, minPop) {
    var best = null, bd = 1e9;
    var bestBig = null, bdBig = 1e9;
    for (var i = 0; i < CITIES.length; i++) {
      var c = CITIES[i];
      var dLat = (c.lat - lat) * 111.32;
      var dLon = (c.lon - lon) * 111.32 * Math.cos(lat * Math.PI / 180);
      var d = Math.sqrt(dLat * dLat + dLon * dLon);
      if (d < bd) { bd = d; best = c; }
      if ((c.pop || 0) >= (minPop || 0) && d < bdBig) { bdBig = d; bestBig = c; }
    }
    if (!best) return null;
    /* 最近的可能是小村镇：若附近有大城市，优先给大城市 */
    if (minPop && bestBig && bdBig < 90 && (best.pop || 0) < minPop) {
      return { place: bestBig, km: bdBig };
    }
    return { place: best, km: bd };
  }

  function parseDate(text, ctx) {
    var m = text.match(/(20\d{2})[-\/年](\d{1,2})[-\/月](\d{1,2})/);
    if (m) return { y: +m[1], mo: +m[2], d: +m[3], src: 'explicit' };
    m = text.match(/(\d{1,2})月(\d{1,2})[日号]/);
    if (m) {
      var y = ctx.y;
      var cand = { y: y, mo: +m[1], d: +m[2] };
      if (cand.mo < ctx.mo - 1) cand.y = y + 1;
      return { y: cand.y, mo: cand.mo, d: cand.d, src: 'month-day' };
    }
    if (/后天/.test(text)) return shift(ctx, 2);
    if (/明天|明晚|明日/.test(text)) return shift(ctx, 1);
    if (/昨天|昨晚/.test(text)) return shift(ctx, -1);
    if (/今晚|今夜|今天晚上|现在|此刻|当前|today/.test(text)) return { y: ctx.y, mo: ctx.mo, d: ctx.d, src: 'today' };
    return null;
  }
  function shift(ctx, n) {
    var d = new Date(Date.UTC(ctx.y, ctx.mo - 1, ctx.d + n));
    return { y: d.getUTCFullYear(), mo: d.getUTCMonth() + 1, d: d.getUTCDate(), src: 'relative' };
  }

  /* ================= 意图识别 ================= */
  var KW = {
    observe: /怎么找|在哪|哪儿|能看到|看得到|几点|什么时候|何时|升起|落下|观测|拍摄|拍到|寻找|位置|今晚|方位|高度/,
    tonight: /今晚|今夜|现在|此刻|推荐|看什么|适合|有什么可看|值得看/,
    event: /流星雨|日食|月食|全食|环食|偏食|极光|合相|冲日|凌日|掩星|食甚|ZHR/,
    cosmos: /黑洞|大爆炸|宇宙|暗物质|暗能量|膨胀|红移|微波背景|CMB|暴胀|多重宇宙|平行宇宙|引力波|恒星演化|超新星|白矮星|中子星|宇宙年龄|奇点|视界|哈勃常数|哈勃张力|星系形成|宇宙黎明|时空|量子引力/,
    knowledge: /为什么|是什么|多远|多大|年龄|怎么形成|原理|区别|历史|发现|组成|温度|质量|距离/,
    chart: /星图|星座|连起来|长什么样|形状|认星|怎么认/,
    gear: /(买|选购|推荐|选型|入手|新手|入门)[^。]{0,8}(望远镜|双筒|天文|设备|相机)|器材|(望远镜|双筒)[^。]{0,6}(怎么选|如何选|哪个好|推荐)/,
    nova: /超新星|新星|爆发|伽马暴|耀斑|爆发态|超新星遗迹|中子星形成|光度极大|超新星前驱星|脉冲星|磁星|致密天体/,
    helios: /太阳|日冕|日珥|太阳风|磁暴|空间天气|太阳黑子|太阳活动|日面|米粒组织|日冕物质抛射|极光预报/,
    solar: /太阳系|行星视图|全系|天体导航|切换视角|聚焦|近景|特写|轨道布局|距离布局|放大天体|重置视角|太阳系视图|哪些行星|轨道标签|隐藏轨道|显示轨道|天体标签|暂停|继续/,
    photo: /拍摄参数|曝光时间|快门|焦距|像素比例|采样率|感光度|ISO|直焦率|怎么拍|如何拍|拍这张|能拍吗|参数怎么设|叠加|出图/
  };

  /* 问候 / 自我介绍 / 测试性输入：完全锚定，避免「你好，今晚能看什么」被误判 */
  var SMALLTALK = /^(你好|您好|hi|hello|嗨|哈喽|在吗|在不在|谢谢|多谢|感谢|再见|拜拜|早上好|晚上好|下午好|你是谁|你是什么|你能做什么|你会什么|怎么用|使用说明|你叫什么|介绍一下你自己|测试|test)$/i;

  function detectIntent(text, targets) {
    var hasTarget = targets.length > 0;
    /* 问候优先于一切天文判定：这类输入不该启动检索、也不该调模型。
     * 旧行为下「你好」会跑完 6 步检索、搜出无关文献、再让模型编一段话，
     * 结果大标题声称「已检索到相关资料」而正文说「跟天文无关」，自相矛盾。 */
    var plain = String(text || '').trim().replace(/[!！。.~～?？,，、\s]+$/g, '');
    if (SMALLTALK.test(plain)) return 'smalltalk';
    /* 太阳系视图指令：需要出现「太阳系」主题词，或明确的视角控制动词 */
    if (KW.solar.test(text) && (/太阳系|行星视图|天体导航/.test(text) ||
      /打开|进入|切换|聚焦|切到|全系|近景|特写|隐藏|显示|放大|缩小|重置|暂停|继续/.test(text))) {
      return 'system-view';
    }
    if (KW.event.test(text)) {
      var conceptHit = targets.some(function (t) {
        return t.item.kind === 'kb' && t.item.entry.type === 'concept';
      });
      if (conceptHit && /为什么|为何|怎么形成|原理|机制/.test(text)) return 'knowledge-target';
      return 'event';
    }
    /* 太阳与空间天气：优先于宇宙学与通用知识 */
    if (KW.helios.test(text) && !/太阳系全景|行星/.test(text)) return 'helios';
    if (KW.nova.test(text) && !/为什么.*(形成|原理|机制)|怎么形成/.test(text)) {
      /* 命中具体条目且问的是原理/历史时，仍走知识问答 */
      var novaTarget = targets.length ? targets[0].item : null;
      if (novaTarget && novaTarget.kind === 'kb' && /为什么|怎么形成|原理|机制|怎么被/.test(text)) {
        return 'knowledge-target';
      }
      return 'nova';
    }
    if (KW.cosmos.test(text) && !/怎么找|几点|升起|落下|方位|高度|能看到|看得到|在哪|哪儿/.test(text)) return 'cosmos';
    if (KW.tonight.test(text) && (!hasTarget || /看什么|推荐|有什么/.test(text))) return 'tonight';
    if (KW.gear.test(text)) return 'gear';
    if (KW.chart.test(text) && !hasTarget) return 'chart';
    if (KW.photo.test(text) && hasTarget) return 'photo-target';
    if (hasTarget) {
      if (KW.observe.test(text)) return 'observe-target';
      if (KW.knowledge.test(text)) return 'knowledge-target';
      return 'intro-target';
    }
    /* 兜底：没有实体时，只有明确在问「能看什么」才走 tonight。
     * 旧实现把 KW.observe（含「在哪」「观测」）也算进来，导致任何不认识的问题
     * 都被答成「今晚最值得看的是…」——这是「答非所问」的主要来源。 */
    if (/能看到|看得到|看什么|有什么可看|值得看|今晚|今夜/.test(text)) return 'tonight';
    return 'unknown';
  }

  /* ================= 观察计算 ================= */
  function jdOfCtx(ctx) { return A.fromLocal(ctx.y, ctx.mo, ctx.d, ctx.h, ctx.mi, ctx.tz); }

  function windowsWithin(ra, dec, t0, t1, lat, lon, minAlt) {
    var step = 5 / 1440, out = [], cur = null;
    for (var t = t0; t <= t1; t += step) {
      var alt = A.altAz(ra, dec, t, lat, lon).alt;
      if (alt >= minAlt) {
        if (!cur) cur = { start: t, end: t, maxAlt: alt, peak: t };
        else { cur.end = t; if (alt > cur.maxAlt) { cur.maxAlt = alt; cur.peak = t; } }
      } else if (cur) { out.push(cur); cur = null; }
    }
    if (cur) out.push(cur);
    return out;
  }

  function conTarget(abbr, label) {
    var conObj = CAT.constellations.filter(function (c) { return c.abbr === abbr; })[0];
    if (!conObj) return null;
    var member = conObj.lines.reduce(function (a, seg) { return a.concat(seg); }, [])
      .map(function (k) { return CAT.stars.filter(function (x) { return x.k === k; })[0]; })
      .filter(Boolean).sort(function (a, b) { return a.mag - b.mag; })[0];
    if (!member) return null;
    return { name: label || conObj.cn, ra: member.ra, dec: member.dec, mag: member.mag,
      type: 'constellation', con: abbr, key: member.k, anchor: member.cn };
  }

  function ephemFor(ra, dec, ctx) {
    var jd = jdOfCtx(ctx);
    var midnight = A.fromLocal(ctx.y, ctx.mo, ctx.d, 0, 0, ctx.tz);
    var st = A.sunTimes(midnight, ctx.lat, ctx.lon);
    var tr = A.track(ra, dec, midnight, ctx.lat, ctx.lon);
    var now = A.altAz(ra, dec, jd, ctx.lat, ctx.lon);
    var moonP = A.moonPhase(jd);
    var moonRA = moonP.ra, moonDec = moonP.dec;
    var moonSep = A.sep(ra, dec, moonRA, moonDec);
    var darkStart = st.dusk !== null ? st.dusk : midnight;
    var darkEnd = st.dawn !== null ? st.dawn : midnight + 1;
    var wins = windowsWithin(ra, dec, darkStart, darkEnd, ctx.lat, ctx.lon, 18);
    var best = null;
    wins.forEach(function (w) { if (!best || w.maxAlt > best.maxAlt) best = w; });
    var score = A.scoreTarget(tr, 4, moonSep, moonP.illum);
    return {
      jd: jd, midnight: midnight, sun: st, track: tr, now: now,
      moon: moonP, moonSep: moonSep, darkStart: darkStart, darkEnd: darkEnd,
      windows: wins, best: best, score: score
    };
  }

  /* ================= 语体与语气 ================= */
  function pickRegister(cfg, query, entry) {
    var s = cfg.vega.scope;
    if (s === 'pro') return 'pro';
    if (s === 'pop') return 'pop';
    if (!entry) return 'pop';
    return /为什么|原理|怎么形成|区别|物理|机制|光谱|演化/.test(query) ? 'pro' : 'pop';
  }

  var TONE = {
    academic: {
      open: '依据本地星历引擎与星表数据：',
      close: '上述结论可由星历复算，误差量级见页脚说明。',
      bridge: '需要指出的是，'
    },
    warm: {
      open: '',
      close: '如果今晚天气给面子，很值得抬头看一眼。',
      bridge: '另外提醒一句，'
    },
    poetic: {
      open: '',
      close: '剩下的，交给眼睛和一点点耐心。',
      bridge: '还有一件事值得知道——'
    }
  };

  function prec(cfg) { return cfg.kepler.precision === 'photo' ? 1 : 0; }
  function deg(x, cfg) { return x.toFixed(prec(cfg)) + '°'; }

  function altWord(alt) {
    if (alt > 60) return '接近天顶';
    if (alt > 35) return '高度理想';
    if (alt > 18) return '高度适中';
    if (alt > 5) return '位于低空';
    if (alt > -2) return '贴近地平线';
    return '在地平线以下';
  }

  function gearAdvice(cfg, mag, ctx, type) {
    var g = cfg.horizon.gear;
    var b = ctx.bortle;
    var base;
    if (g === 'naked') base = mag <= 4.5 ? '肉眼即可，先适应黑暗 20 分钟' : (mag <= 6.5 ? '肉眼勉强，建议借一副双筒' : '肉眼不可见，需要双筒或望远镜');
    else if (g === 'binocular') base = '7×50 或 10×50 双筒，低倍大视场最舒服';
    else if (g === 'telescope') base = mag <= 6 ? '80mm 口径起步即可，深空目标越大口径越好' : '建议 130mm 以上口径，配合中倍率';
    else base = '广角镜头 + 三脚架长曝光；深空目标需赤道仪跟踪';
    if (b >= 7 && mag > 5) base += '；当前城市光害较强，暗弱目标建议出城 30km 以上';
    if (type === 'planet') base += '；行星可提高倍率，视宁度好比口径更重要';
    return base;
  }

  /* 执行记录（契约二）。extra 可携带 tool / ok / check，
   * 让 trace 反映真实执行而非流程标签。旧的三参数调用保持兼容。 */
  function step(agent, action, detail, extra) {
    var r = { agent: agent, action: action, detail: detail || '' };
    if (extra) {
      if (extra.tool) r.tool = extra.tool;
      if (extra.ok === false) r.ok = false;
      if (extra.check) r.check = extra.check;
      if (extra.ms) r.ms = extra.ms;
    }
    return r;
  }

  function chipsFor(target, ctx, isConcept) {
    if (isConcept) {
      return ['这条结论有没有争议？', '还有哪些常见误解？', '用一句话讲给孩子听？'];
    }
    if (!target) return ['今晚在北京能看到什么？', '什么是「视星等」？', '英仙座流星雨什么时候看最好？'];
    var n = target.name;
    return [
      '在' + ctx.city + '今晚几点看' + n + '最好？',
      n + '用双筒望远镜能看到什么？',
      '它的光走了多久才到地球？'
    ];
  }

  /* ================= 历史记忆（跨轮一致性） ================= */
  var MEMORY = [];
  var MEM_MAX = 8;

  function setMemory(list) {
    MEMORY = Array.isArray(list) ? list.slice(-MEM_MAX).map(function (m) {
      return { q: String(m.q || ''), a: String(m.a || ''), target: m.target || '', at: m.at || 0 };
    }) : [];
  }
  function getMemory() { return MEMORY.slice(); }
  function clearMemory() { MEMORY = []; }

  var PRONOUN = /它|这个|那个|这颗|那颗|上面|刚才|前面|同一颗| thereof|前者/;

  /* 指代消解：把「它 / 那个」还原为上一轮的主体 */
  function resolveByMemory(q, targets) {
    if (targets.length || !MEMORY.length) return { targets: targets, ref: '' };
    if (!PRONOUN.test(q)) return { targets: targets, ref: '' };
    for (var i = MEMORY.length - 1; i >= 0; i--) {
      var name = MEMORY[i].target;
      if (!name) continue;
      var hit = resolveTargets(name);
      if (hit.length) return { targets: hit.concat(targets), ref: name };
    }
    return { targets: targets, ref: '' };
  }

  /* ================= 运行时统计（可观测性） ================= */
  var STATS = { total: 0, intents: {}, errors: 0, lastMs: 0, lastIntent: '' };
  function stats() {
    return {
      total: STATS.total, intents: STATS.intents, errors: STATS.errors,
      lastMs: Math.round(STATS.lastMs * 100) / 100, lastIntent: STATS.lastIntent
    };
  }

  /* ================= 答案组装 ================= */
  function buildAnswer(query, ctx, cfg) {
    var tStart = (typeof performance !== 'undefined' ? performance.now() : 0);
    buildAlias();
    cfg = JSON.parse(JSON.stringify(cfg));
    applyCustomConfig(cfg);
    var q = String(query || '').trim();
    var targets = resolveTargets(q);
    var mem = resolveByMemory(q, targets);
    targets = mem.targets;
    var when = parseDate(q, ctx);
    if (when) {
      ctx = Object.assign({}, ctx, { y: when.y, mo: when.mo, d: when.d, tz: tzOf(ctx.cityRef || CITIES[0], when.y, when.mo, when.d) });
    }
    var cityHit = findCity(q);
    var dateNote = null;
    if (cityHit) {
      ctx = Object.assign({}, ctx, {
        city: cityHit.n, lat: cityHit.lat, lon: cityHit.lon, bortle: cityHit.bortle,
        cityRef: cityHit, tz: tzOf(cityHit, ctx.y, ctx.mo, ctx.d)
      });
    } else if (when && (when.src === 'explicit' || when.src === 'month-day')) {
      dateNote = '未指定地点，按「' + ctx.city + '」（' + ctx.lat.toFixed(2) + '°, ' + ctx.lon.toFixed(2) + '°）计算。';
    }
    var intent = detectIntent(q, targets);
    var t0 = targets.length ? targets[0].item : null;
    var answer = { query: q, intent: intent, ctx: ctx, targets: targets, trace: [], sections: [], meta: {}, _dateNote: dateNote, _when: when };

    answer.trace.push(step('muse', '解析意图', intentLabel(intent) + (t0 ? ' · 实体「' + nameOf(t0) + '」' : '') + (mem.ref ? ' · 指代还原为「' + mem.ref + '」' : '')));

    var out;
    if (intent === 'smalltalk') out = composeSmalltalk(answer, ctx, cfg);
    else if (intent === 'tonight') out = composeTonight(answer, ctx, cfg);
    else if (intent === 'cosmos') out = composeCosmos(answer, ctx, cfg, t0, q);
    else if (intent === 'nova') out = composeNova(answer, ctx, cfg, t0, q);
    else if (intent === 'helios') out = composeHelios(answer, ctx, cfg, t0, q);
    else if (intent === 'event') out = composeEvent(answer, ctx, cfg, q, targets);
    else if (intent === 'system-view') out = composeSystemView(answer, ctx, cfg, t0, q);
    else if (intent === 'photo-target') out = composePhoto(answer, ctx, cfg, t0, q);
    else if (intent === 'gear') out = composeGear(answer, ctx, cfg);
    else if (intent === 'chart') out = composeChart(answer, ctx, cfg, t0);
    else if (intent === 'unknown') out = composeFallback(answer, ctx, cfg);
    else out = composeTarget(answer, ctx, cfg, t0, intent);
    out.meta.memory = mem.ref ? { resolved: mem.ref, turns: MEMORY.length } : { turns: MEMORY.length };
    STATS.total++;
    STATS.intents[intent] = (STATS.intents[intent] || 0) + 1;
    STATS.lastIntent = intent;
    STATS.lastMs = (typeof performance !== 'undefined' ? performance.now() : 0) - tStart;
    return applyCustom(criticReview(finalize(out), cfg), ctx);
  }

  /* 协作链路按固定工作流排序，保证呈现顺序符合真实分工 */
  var TRACE_ORDER = {
    muse: 1, vega: 2, scholar: 3, cosmos: 4, nova: 5, helios: 6, kepler: 7,
    horizon: 8, orion: 9, lyra: 10, curator: 11, critic: 12, navigator: 13
  };

  /* ================= Critic：答案交付前的证据复核 ================= */
  function criticReview(a, cfg) {
    var gate = (cfg && cfg.critic && cfg.critic.evidence) || 'balanced';
    var checks = [];
    var hasEvidence = a.sections.some(function (s) { return s.kind === 'evidence' && (s.items || []).length; });
    var hasBoundary = a.sections.some(function (s) { return s.kind === 'boundary'; });
    var hasConsensus = a.sections.some(function (s) { return s.kind === 'consensus'; });
    var evCount = 0;
    a.sections.forEach(function (s) { if (s.kind === 'evidence') evCount += (s.items || []).length; });
    var conf = (a.meta && a.meta.confidence) || 0;

    checks.push({ k: '证据条数', v: evCount ? evCount + ' 条' : '无', ok: evCount > 0 });
    checks.push({ k: '数值可复算', v: a.meta && a.meta.computed ? '是（本地星历）' : '否（引用型结论）', ok: true });
    checks.push({ k: '共识等级', v: a.meta && a.meta.status ? statusLabel(a.meta.status) + ' · 核验 ' + (a.meta.verified || '2026-10') : '未标注', ok: !!(a.meta && a.meta.status) });
    checks.push({ k: '边界声明', v: hasBoundary ? '已给出' : '缺失', ok: hasBoundary });
    checks.push({ k: '置信度', v: conf.toFixed(2), ok: conf >= 0.5 });

    var failed = checks.filter(function (c) { return !c.ok; });
    if (gate === 'strict' && (failed.length || !hasEvidence)) {
      a.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '严格证据门槛下，本次回答存在未达标项（' + failed.map(function (c) { return c.k; }).join('、') +
          '）。请把结论当作线索而非定论，并以所列来源复核。'
      });
    }
    a.trace.push(step('critic', '证据复核',
      checks.length + ' 项检查 · ' + (failed.length ? failed.length + ' 项未达标' : '全部通过') +
      ' · 门槛 ' + (gate === 'strict' ? '严格' : gate === 'open' ? '开放' : '均衡')));
    a.meta.review = { gate: gate, checks: checks, passed: failed.length === 0 };
    a.sections.push({
      kind: 'review', title: '评审结论', gate: gate, passed: failed.length === 0,
      checks: checks,
      note: gate === 'strict' ? '严格门槛：未达标项已在边界声明中标出。'
        : (gate === 'open' ? '开放门槛：允许在证据不足时给出线索，但已标注缺口。'
          : '均衡门槛：常规问答标准。')
    });
    return a;
  }

  /* ================= Curator：多来源去重与合并 ================= */
  function normKey2(s) {
    return String(s || '').toLowerCase().replace(/[\s，,。.、：:；;（）()「」【】\[\]"'·-]/g, '');
  }
  function curate(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (item) {
      var k = normKey2(item.title || item.name || item.text || '').slice(0, 24);
      if (!k) { out.push(item); return; }
      if (seen[k] === undefined) {
        seen[k] = out.length;
        out.push(item);
      } else {
        var keep = out[seen[k]];
        if (!keep.merged) keep.merged = [];
        keep.merged.push(item);
      }
    });
    return out;
  }
  var CUSTOM = [];
  function finalize(a) {
    a.trace.sort(function (x, y) {
      var ox = TRACE_ORDER[x.agent] || 8, oy = TRACE_ORDER[y.agent] || 8;
      return ox - oy;
    });
    return a;
  }

  /* ================= 自定义 Agent ================= */
  var ATTR_TARGET = {
    tone: [['lyra', 'tone']], depth: [['muse', 'depth']], scope: [['vega', 'scope']],
    focus: [['vega', 'focus']], creativity: [['muse', 'creativity']],
    precision: [['kepler', 'precision']], gear: [['horizon', 'gear']], style: [['orion', 'style']],
    domain: [['nova', 'domain'], ['helios', 'domain']],
    evidence: [['critic', 'evidence'], ['curator', 'evidence']]
  };

  function setCustomAgents(list) {
    CUSTOM = Array.isArray(list) ? list : [];
    CUSTOM.forEach(function (a) {
      AGENT_BY_ID[a.id] = {
        id: a.id, name: a.name, cn: a.cn, sigil: a.sigil || (a.name || 'A').slice(0, 1).toUpperCase(),
        role: a.role || '自定义智能体', color: a.color || '#d8b47a', desc: a.persona || '', custom: true
      };
    });
  }

  function matchCustom(intent) {
    return CUSTOM.filter(function (a) {
      if (a.enabled === false) return false;
      var list = a.intents || ['all'];
      return list.indexOf('all') >= 0 || list.indexOf(intent) >= 0;
    }).sort(function (a, b) { return (b.weight || 50) - (a.weight || 50); });
  }

  function applyCustom(a, ctx) {
    var hits = matchCustom(a.intent);
    if (!hits.length) return a;
    /* 章节裁剪：由权重最高的自定义 Agent 决定 */
    var filter = hits[0].sections;
    if (filter) {
      a.sections = a.sections.filter(function (sec) {
        if (sec.kind === 'verdict' || sec.kind === 'followup') return true;
        if (sec.kind === 'evidence') return filter.evidence !== false;
        if (sec.kind === 'observe') return filter.observe !== false;
        if (sec.kind === 'visual') return filter.visual !== false;
        if (sec.kind === 'boundary') return filter.boundary !== false;
        if (sec.kind === 'rank') return filter.rank !== false;
        if (sec.kind === 'consensus') return filter.consensus !== false;
        return true;
      });
    }
    if (filter && filter.visual === false) {
      a.trace = a.trace.filter(function (t) { return t.agent !== 'orion'; });
    }
    /* 专家注记：最多 3 条 */
    hits.slice(0, 3).forEach(function (ca) {
      if (!ca.directive) return;
      var note = {
        kind: 'custom',
        agent: { name: ca.name, cn: ca.cn, sigil: ca.sigil, color: ca.color, role: ca.role },
        text: ca.directive
      };
      var fi = -1;
      for (var i = 0; i < a.sections.length; i++) if (a.sections[i].kind === 'followup') { fi = i; break; }
      if (fi >= 0) a.sections.splice(fi, 0, note); else a.sections.push(note);
      a.trace.push(step(ca.id, '专家视角', ca.role || '自定义智能体'));
    });
    a.meta.custom = hits.map(function (x) { return x.name; });
    return finalize(a);
  }

  function applyCustomConfig(cfg) {
    var hits = CUSTOM.filter(function (a) { return a.enabled !== false; });
    hits.sort(function (a, b) { return (a.weight || 50) - (b.weight || 50); });
    hits.forEach(function (ca) {
      var at = ca.attrs || {};
      Object.keys(ATTR_TARGET).forEach(function (k) {
        if (!at[k]) return;
        var targets = ATTR_TARGET[k];
        targets.forEach(function (t) {
          if (cfg[t[0]]) cfg[t[0]][t[1]] = at[k];
        });
      });
    });
  }

  function nameOf(t) {
    if (!t) return '';
    if (t.kind === 'kb') return t.entry.cn;
    if (t.kind === 'constellation') return t.cn;
    return t.cn || t.en || t.key;
  }
  function intentLabel(i) {
    return {
      'tonight': '今晚观测规划', 'event': '天象事件咨询', 'gear': '器材选型',
      'chart': '星图与识别', 'observe-target': '目标定位与观测',
      'knowledge-target': '天体知识问答', 'intro-target': '天体综合介绍', 'cosmos': '宇宙学咨询',
      'nova': '爆发天体与高能天体', 'helios': '太阳活动与空间天气',
      'system-view': '太阳系视图与视角操作', 'unknown': '未归类问题'
    }[i] || i;
  }

  /* ---------- 目标类问答 ---------- */
  function composeTarget(answer, ctx, cfg, t, intent) {
    var tz = ctx.tz, P = prec(cfg);
    var entry = t && t.kind === 'kb' ? t.entry : null;
    var reg = pickRegister(cfg, answer.query, entry);
    var depth = cfg.muse.depth;
    var tone = TONE[cfg.lyra.tone] || TONE.warm;

    /* 解析目标的天球坐标 */
    var target = null;
    if (t && t.kind === 'kb') {
      if (entry.type === 'constellation' && entry.abbr) {
        target = conTarget(entry.abbr, entry.cn);
      } else if (entry.visual) {
        var vk = entry.visual;
        var dso = CAT.dso.filter(function (d) { return d.k === vk; })[0];
        if (dso) target = { name: entry.cn, ra: dso.ra, dec: dso.dec, mag: dso.mag, type: 'dso', key: vk };
        else if (vk === 'moon') { var mp0 = A.moonPhase(jdOfCtx(ctx)); target = { name: '月球', ra: mp0.ra, dec: mp0.dec, mag: -12.7, type: 'moon' }; }
        else target = conTarget(vk.toUpperCase().replace(/^./, function (c) { return c.toUpperCase(); }).slice(0, 3), entry.cn);
      }
      if (!target) {
        var st = CAT.stars.filter(function (s) { return s.cn === entry.cn; })[0];
        if (st) target = { name: entry.cn, ra: st.ra, dec: st.dec, mag: st.mag, type: 'star' };
      }
    } else if (t && (t.kind === 'star' || t.kind === 'dso')) {
      target = { name: nameOf(t), ra: t.ra, dec: t.dec, mag: t.mag, type: t.kind, kind: t.kind, key: t.key };
    } else if (t && t.kind === 'moon') {
      var mp = A.moonPhase(jdOfCtx(ctx));
      target = { name: '月球', ra: mp.ra, dec: mp.dec, mag: -12.7, type: 'moon', phase: mp };
    } else if (t && t.kind === 'planet') {
      var pl = A.planet(t.key, jdOfCtx(ctx));
      target = { name: pl.cn, ra: pl.ra, dec: pl.dec, mag: pl.mag, type: 'planet', key: t.key, planet: pl };
    } else if (t && t.kind === 'constellation') {
      target = conTarget(t.abbr, t.cn);
    } else if (t && t.kind === 'sun') {
      var s = A.sun(jdOfCtx(ctx));
      target = { name: '太阳', ra: s.ra, dec: s.dec, mag: -26.7, type: 'sun' };
    }

    var ep = target ? ephemFor(target.ra, target.dec, ctx) : null;
    if (target && ep) {
      answer.trace.push(step('kepler', '计算星历', '中天 ' + A.fmtHM(ep.track.transit, tz) + ' · 最大高度 ' + deg(ep.track.maxAlt, cfg)));
    }

    /* ---- verdict ---- */
    var facts = entry ? entry.facts : [];
    var head, sub = '';
    var posLine = '';
    if (ep && target) {
      var alt = ep.now.alt, az = ep.now.az;
      var whenTxt = ctx.h + ':' + (ctx.mi < 10 ? '0' : '') + ctx.mi;
      if (alt > 5) {
        posLine = '今晚 ' + whenTxt + '，' + target.name + '位于' + A.fmtDeg(az, 'az') + '方向、约 ' + deg(alt, cfg) + ' 高度，' + altWord(alt) + '。';
      } else if (ep.best) {
        posLine = '今晚 ' + whenTxt + '，' + target.name + '尚未升起；最佳观测窗口为 ' + A.fmtHM(ep.best.start, tz) + '–' + A.fmtHM(ep.best.end, tz) + '，最高约 ' + deg(ep.best.maxAlt, cfg) + '。';
      } else if (ep.track.alwaysDown) {
        posLine = target.name + '在当前纬度（' + ctx.lat.toFixed(1) + '°）全年不可见，最高高度仅 ' + deg(ep.track.maxAlt, cfg) + '。';
      } else {
        posLine = target.name + '今晚的可观测窗口不足，最高高度约 ' + deg(ep.track.maxAlt, cfg) + '。';
      }
    }

    if (intent === 'knowledge-target' && !entry) {
      head = '关于「' + (target ? target.name : answer.query) + '」的这一具体问题，本地知识库没有可引用的条目；我只列出可确证的观测事实，不做成因推测。';
      sub = posLine;
    } else if (entry && intent === 'intro-target' && /怎么|如何|怎样|指|辨认|认星/.test(answer.query)) {
      head = entry.summary;
      sub = posLine;
    } else if (entry && intent === 'knowledge-target') {
      head = entry.summary;
      sub = posLine;
    } else if (entry && entry.type === 'concept') {
      head = entry.summary;
      sub = posLine || clamp(entry.summary, 0);
    } else {
      head = posLine || (entry ? entry.summary : (target ? target.name : '该目标'));
      sub = entry ? clamp(entry.summary, 78) : '';
    }
    answer.sections.push({ kind: 'verdict', head: head, sub: sub, chips: [] });

    /* ---- 依据 ---- */
    var items = [];
    if (entry) {
      var limit = depth === 'brief' ? 2 : depth === 'deep' ? facts.length : 4;
      items = facts.slice(0, limit).map(function (f) { return { label: f[0], value: f[1] }; });
      answer.trace.push(step('vega', '检索知识库', '命中「' + entry.id + '」· 置信度 ' + entry.confidence.toFixed(2) + ' · ' + freshnessLabel(entry.freshness),
        { tool: 'kb-index', check: RT.check('知识库命中', true, entry.id + ' · ' + entry.facts.length + ' 条事实') }));
    } else if (target) {
      items = [
        { label: '坐标 (J2000)', value: 'RA ' + A.fmtRA(target.ra) + ' / Dec ' + A.fmtDec(target.dec) },
        { label: '视星等', value: String(target.mag) },
        { label: '类型', value: t.kind === 'star' ? '恒星' : t.kind === 'planet' ? '行星' : t.kind === 'moon' ? '天然卫星' : '深空天体' }
      ];
      answer.trace.push(step('vega', '星表查询', '未收录详解条目 · 降级为星表级事实',
        { tool: 'catalog', check: RT.check('详解条目', false, '只有星表级事实，无解释性内容') }));
    }
    if (ep && target && intent !== 'knowledge-target') {
      /* 时刻必须带时区，否则数值无法复算 */
      var tzLab = 'UTC' + (tz >= 0 ? '+' : '') + tz;
      items.push({ label: '升 / 落（' + tzLab + '）', value: A.fmtHM(ep.track.rise, tz) + ' / ' + A.fmtHM(ep.track.set, tz) + (ep.track.alwaysUp ? '（拱极，不落）' : '') });
      items.push({ label: '中天（' + tzLab + '）', value: A.fmtHM(ep.track.transit, tz) + ' · 高度 ' + deg(ep.track.maxAlt, cfg) });
    }
    if (target && target.type === 'moon' && ep) {
      items.push({ label: '月相', value: ep.moon.name + ' · 照亮 ' + (ep.moon.illum * 100).toFixed(0) + '% · 月龄 ' + ep.moon.age.toFixed(1) + ' 天' });
    }
    var para = '';
    if (entry) {
      para = reg === 'pro' ? entry.pro : entry.pop;
      if (reg === 'pop' && depth === 'deep') para += ' 专业表述：' + clamp(entry.pro, 120);
    }
    answer.sections.push({
      kind: 'evidence', title: '依据', items: items, para: para,
      sources: entry ? entry.sources : [{ n: '本地星表（J2000 快照）', u: '' }],
      register: reg
    });
    answer.trace.push(step('lyra', '组织表述', (reg === 'pro' ? '专业语体' : '科普语体') + ' · 语气 ' + toneLabel(cfg.lyra.tone)));

    /* ---- 太阳系天体的实测面貌（来自 NASA/ESA/JPL 已发布观测结果） ---- */
    var bodyKey = null;
    if (target && target.type === 'planet') bodyKey = target.key;
    else if (target && target.type === 'sun') bodyKey = 'sun';
    else if (target && target.type === 'moon') bodyKey = 'moon';
    if (bodyKey && depth !== 'brief') {
      var binfo = (root.BODY_INFO || {})[bodyKey];
      if (binfo && binfo.observed && binfo.observed.length) {
        answer.sections.push({
          kind: 'list', title: '实测面貌 · ' + binfo.cn + '（截至 ' + (binfo.updated || '2025-06') + '）',
          items: binfo.observed.slice(0, depth === 'deep' ? binfo.observed.length : 3).map(function (o) {
            return { name: o[0], meta: '实测', text: o[1] };
          }),
          note: (binfo.missions || []).join(' · ') + '｜来源：' + (binfo.sources || []).map(function (x) { return x.n; }).join(' · ')
        });
        answer.trace.push(step('vega', '补充实测资料', binfo.observed.length + ' 条观测结论 · ' + (binfo.missions || []).length + ' 个任务'));
      }
    }

    /* ---- 观测建议 ---- */
    if (ep && target && depth !== 'brief') {
      var obs = [];
      if (ep.best) obs.push({ k: '最佳窗口', v: A.fmtHM(ep.best.start, tz) + '–' + A.fmtHM(ep.best.end, tz) });
      obs.push({ k: '当前方位', v: A.fmtDeg(ep.now.az, 'az') + ' · 高度 ' + deg(ep.now.alt, cfg) });
      if (ep.best) obs.push({ k: '峰值时刻', v: A.fmtHM(ep.best.peak, tz) + ' · ' + deg(ep.best.maxAlt, cfg) });
      if (target.type !== 'moon') obs.push({ k: '月光干扰', v: moonInterference(ep, tz) });
      obs.push({ k: '器材', v: gearAdvice(cfg, target.mag, ctx, target.type) });
      if (cfg.horizon.depth !== 'brief' && target.type !== 'moon' && target.type !== 'sun') {
        var nb = nearestBrightStar(target.ra, target.dec, target.key);
        if (nb) obs.push({ k: '定位路径', v: '距「' + nb.s.cn + '」约 ' + nb.d.toFixed(0) + '°，在它的' + compassName(bearing(nb.s.ra, nb.s.dec, target.ra, target.dec)) + '方向' });
      }
      if (entry && entry.observe && cfg.horizon.depth !== 'brief') {
        obs.push({ k: '要点', v: entry.observe[0] });
        if (depth === 'deep' && entry.observe[1]) obs.push({ k: '进阶', v: entry.observe[1] });
      }
      answer.sections.push({ kind: 'observe', title: intent === 'knowledge-target' ? '观测延伸' : '观测建议', items: obs, note: '按 ' + ctx.city + '（Bortle ' + ctx.bortle + '）计算' });
      answer.trace.push(step('horizon', '评估观测条件', '暗夜窗口 ' + A.fmtHM(ep.darkStart, tz) + '–' + A.fmtHM(ep.darkEnd, tz) + ' · 月光 ' + (ep.moon.illum * 100).toFixed(0) + '%'));
    }

    /* ---- 可视化 ---- */
    if (depth !== 'brief' && target) {
      answer.sections.push({
        kind: 'visual', title: '可视化',
        visual: {
          type: target.type === 'moon' ? 'moon' : 'skymap',
          payload: {
            jd: ep ? ep.jd : jdOfCtx(ctx), lat: ctx.lat, lon: ctx.lon,
            highlight: { ra: target.ra, dec: target.dec, label: target.name },
            caption: target.name + ' · ' + ctx.city + ' · ' + ctx.y + '-' + pad(ctx.mo) + '-' + pad(ctx.d) + ' ' + pad(ctx.h) + ':' + pad(ctx.mi),
            phase: ep ? ep.moon : null, style: cfg.orion.style
          }
        }
      });
      answer.trace.push(step('orion', '生成星图', '方位等距投影 · ' + (target.type === 'moon' ? '月相视图' : '全天视图')));
    }

    /* 黑洞位置类问题：补一张银心星图 */
    if (entry && entry.id === 'blackhole' && !answer.sections.some(function (x) { return x.kind === 'visual'; })) {
      var jdb = jdOfCtx(ctx);
      answer.sections.push({
        kind: 'visual', title: '可视化',
        visual: {
          type: 'skymap',
          payload: {
            jd: jdb, lat: ctx.lat, lon: ctx.lon,
            highlight: { ra: 17.7611, dec: -29.0078, label: '银心 Sgr A*' },
            caption: '银心方向 · ' + ctx.city + ' · 人马座',
            phase: A.moonPhase(jdb), style: cfg.orion.style
          }
        }
      });
      answer.sections.push({ kind: 'mapref', ra: 17.7611, dec: -29.0078, label: '银心 Sgr A*' });
      answer.trace.push(step('orion', '定位银心', 'RA 17h45m40s / Dec −29°00′28″'));
    }

    /* ---- 边界 ---- */
    var boundary = boundaryFor(entry, target, ep, ctx, cfg, answer._dateNote);
    if (boundary) answer.sections.push({ kind: 'boundary', text: boundary });

    if (target && typeof target.ra === 'number') {
      answer.sections.push({ kind: 'mapref', ra: target.ra, dec: target.dec, label: target.name });
    }
    answer.sections.push({ kind: 'followup', items: chipsFor(target || (entry ? { name: entry.cn } : null), ctx, !!entry && entry.type === 'concept') });

    answer.meta = {
      agents: answer.trace.map(function (s) { return s.agent; }).filter(uniq),
      status: entry ? entry.status : 'established',
      verified: entry ? (entry.verified || '2026-10') : '2026-10',
      confidence: entry ? entry.confidence : (target ? 0.74 : 0.4),
      freshness: entry ? entry.freshness : 'ephemeris',
      register: reg,
      computed: !!ep,
      target: target ? target.name : (entry ? entry.cn : null),
      refs: entry ? entry.sources : []
    };
    return answer;
  }

  /* ---------- 今晚推荐 ---------- */
  function buildCandidates(jd) {
    var cands = [], mp = A.moonPhase(jd);
    cands.push({ name: '月球', type: 'moon', ra: mp.ra, dec: mp.dec, mag: -12.7, why: mp.name + ' · 照亮 ' + (mp.illum * 100).toFixed(0) + '%' });
    A.planets(jd).forEach(function (p) {
      if (p.elong > 12) cands.push({ name: p.cn, type: 'planet', ra: p.ra, dec: p.dec, mag: p.mag, why: '视星等 ' + p.mag + ' · 距角 ' + p.elong.toFixed(0) + '°' });
    });
    CAT.dso.slice().sort(function (a, b) { return a.mag - b.mag; }).slice(0, 30).forEach(function (d) {
      cands.push({ name: d.cn, type: 'dso', ra: d.ra, dec: d.dec, mag: d.mag, why: d.type + ' · ' + d.id });
    });
    CAT.constellations.forEach(function (c) {
      var mem = c.lines.reduce(function (a, s2) { return a.concat(s2); }, [])
        .map(function (k) { return CAT.stars.filter(function (x) { return x.k === k; })[0]; })
        .filter(Boolean).sort(function (a, b) { return a.mag - b.mag; })[0];
      if (mem) cands.push({ name: c.cn, type: 'constellation', ra: mem.ra, dec: mem.dec, mag: mem.mag, why: '标志星 ' + mem.cn });
    });
    return cands;
  }

  function tonightRanking(ctx) {
    var jd = jdOfCtx(ctx), mp = A.moonPhase(jd);
    var st = A.sunTimes(A.fromLocal(ctx.y, ctx.mo, ctx.d, 0, 0, ctx.tz), ctx.lat, ctx.lon);
    var darkStart = st.dusk !== null ? st.dusk : A.fromLocal(ctx.y, ctx.mo, ctx.d, 20, 0, ctx.tz);
    var darkEnd = st.dawn !== null ? st.dawn : A.fromLocal(ctx.y, ctx.mo, ctx.d, 23, 59, ctx.tz);
    var cands = buildCandidates(jd);
    var TYPE_W = { constellation: 0.82, planet: 1.05, moon: 0.9, dso: 1.0 };

    var scored = cands.map(function (c) {
      var ep = ephemFor(c.ra, c.dec, ctx);
      var sc = A.scoreTarget(ep.track, c.mag, ep.moonSep, mp.illum) * (TYPE_W[c.type] || 1);
      var wins = windowsWithin(c.ra, c.dec, darkStart, Math.max(darkEnd, darkStart + 0.1), ctx.lat, ctx.lon, 20);
      var best = null;
      wins.forEach(function (w) { if (!best || w.maxAlt > best.maxAlt) best = w; });
      return { c: c, sc: sc, ep: ep, best: best };
    }).filter(function (x) { return x.best && x.sc > 0.12; })
      .sort(function (a, b) { return b.sc - a.sc; });

    var seenType = {}, diverse = [];
    scored.forEach(function (x) {
      seenType[x.c.type] = (seenType[x.c.type] || 0) + 1;
      if (seenType[x.c.type] <= 2) diverse.push(x);
    });

    return { jd: jd, moon: mp, sun: st, darkStart: darkStart, darkEnd: darkEnd, ranked: diverse, candCount: cands.length };
  }

  function preview(ctx) {
    var r = tonightRanking(ctx);
    return {
      moon: r.moon, sun: r.sun, darkStart: r.darkStart, darkEnd: r.darkEnd,
      list: r.ranked.slice(0, 5).map(function (x) {
        return { name: x.c.name, type: x.c.type, ra: x.c.ra, dec: x.c.dec, score: x.sc, maxAlt: x.best.maxAlt, peak: x.best.peak };
      })
    };
  }

  function composeTonight(answer, ctx, cfg) {
    var tz = ctx.tz;
    var r = tonightRanking(ctx);
    var mp = r.moon, st = r.sun, scored = r.ranked.slice(0, 6);
    var darkStart = r.darkStart, darkEnd = r.darkEnd;

    answer.trace.push(step('kepler', '批量星历', '候选 ' + r.candCount + ' 个 · 暗夜窗口 ' + A.fmtHM(darkStart, tz) + '–' + A.fmtHM(darkEnd, tz)));
    answer.trace.push(step('horizon', '排序筛选', '按高度/亮度/月光干扰综合评分'));

    var top = scored[0];
    var head = top
      ? '今晚' + ctx.city + '最值得看的是' + top.c.name + '：' + A.fmtHM(top.best.start, tz) + '–' + A.fmtHM(top.best.end, tz) + ' 可观测，' + A.fmtHM(top.best.peak, tz) + ' 前后最高约 ' + deg(top.best.maxAlt, cfg) + '（' + top.c.why + '）。'
      : '今晚' + ctx.city + '的暗夜窗口内没有高置信度的推荐目标，可能受月光或纬度限制。';

    answer.sections.push({
      kind: 'verdict', head: head,
      sub: '暗夜窗口 ' + A.fmtHM(darkStart, tz) + '–' + A.fmtHM(darkEnd, tz) + ' · 月相 ' + mp.name + '（' + (mp.illum * 100).toFixed(0) + '%）· 日出 ' + A.fmtHM(st.rise, tz)
    });

    answer.sections.push({
      kind: 'rank', title: '优先目标',
      items: scored.map(function (x, i) {
        return {
          rank: i + 1, name: x.c.name, type: x.c.type,
          meta: '最高 ' + deg(x.best.maxAlt, cfg) + ' · ' + A.fmtHM(x.best.peak, tz) + ' · 视星等 ' + x.c.mag,
          score: x.sc, why: x.c.why
        };
      })
    });
    answer.trace.push(step('vega', '交叉核对', '目标属性与星表坐标一致性检查通过'));

    answer.sections.push({
      kind: 'observe', title: '今晚条件', items: [
        { k: '地点', v: ctx.city + '（' + ctx.lat.toFixed(2) + '°, ' + ctx.lon.toFixed(2) + '°）· Bortle ' + ctx.bortle },
        { k: '月光', v: mp.name + '，照亮 ' + (mp.illum * 100).toFixed(0) + '%，' + (mp.illum > 0.6 ? '强烈建议优先亮目标' : mp.illum > 0.3 ? '对暗弱深空有中度影响' : '影响较小') },
        { k: '建议', v: cfg.horizon.gear === 'naked' ? '肉眼 + 躺椅，等 20 分钟暗适应' : gearAdvice(cfg, top ? top.c.mag : 4, ctx, top ? top.c.type : 'dso') },
        { k: '提醒', v: '实际可见度受云量、透明度与局部光害影响，星历无法覆盖天气' }
      ]
    });

    answer.sections.push({
      kind: 'visual', title: '可视化',
      visual: {
        type: 'skymap',
        payload: {
          jd: r.jd, lat: ctx.lat, lon: ctx.lon,
          highlight: top ? { ra: top.c.ra, dec: top.c.dec, label: top.c.name } : null,
          caption: '今晚全天星图 · ' + ctx.city + ' · ' + A.fmtHM(r.jd, tz),
          phase: mp, style: cfg.orion.style
        }
      }
    });
    answer.trace.push(step('orion', '生成星图', '标注 ' + (top ? top.c.name : '无') + ' 方位'));
    answer.trace.push(step('lyra', '组织表述', toneLabel(cfg.lyra.tone) + ' · ' + (cfg.muse.depth === 'deep' ? '附完整评分依据' : '聚焦结论')));

    answer.sections.push({ kind: 'followup', items: [top ? '怎么在星图上找到' + top.c.name + '？' : '明晚呢？', '这周有流星雨吗？', '帮我列一个两小时观测清单'] });
    answer.meta = {
      agents: ['muse', 'kepler', 'horizon', 'vega', 'orion', 'lyra'],
      confidence: 0.86, freshness: 'ephemeris', register: 'pop', computed: true,
      target: top ? top.c.name : null, refs: [{ n: '本地星历引擎', u: '' }]
    };
    return answer;
  }

  /* ---------- 天象事件 ---------- */
  function composeEvent(answer, ctx, cfg, q, targets) {
    var tz = ctx.tz;
    var map = [
      [/流星雨|英仙|perseid/, 'perseids'], [/双子/, 'geminids'], [/象限/, 'quadrantids'],
      [/日食|日全食|日环食|日偏食|全食带/, 'solar-eclipse'], [/月食|红月|血月/, 'lunar-eclipse'],
      [/极光|北极光/, 'aurora'], [/合相|连珠|伴月/, 'conjunction']
    ];
    var entry = null;
    for (var i = 0; i < map.length; i++) if (map[i][0].test(q)) { entry = KB.byId[map[i][1]]; break; }
    /* 兜底：知识库里已有该现象条目时直接用它，
     * 否则像「火星冲日」「金星凌日」这类已收录的现象会被误判为「无法确定是哪类事件」。 */
    if (!entry && targets && targets.length) {
      var cand = targets[0].item;
      if (cand.kind === 'kb' && cand.entry.type === 'phenomenon') entry = cand.entry;
    }
    if (!entry) {
      answer.trace.push(step('vega', '检索事件库', '未命中具体事件条目'));
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '我能确认这是天象类问题，但无法从本地知识库中唯一确定你指的是哪一类事件（流星雨 / 日月食 / 极光 / 行星合相）。为避免给出错误日期，我不会猜测。'
      });
      answer.sections.push({ kind: 'followup', items: ['英仙座流星雨今年什么时候极大？', '下一次月全食是什么时候？', '北京今晚能看到极光吗？'] });
      answer.meta = { agents: ['muse', 'vega'], confidence: 0.35, freshness: 'annual', register: 'pop', computed: false };
      return answer;
    }

    var reg = pickRegister(cfg, q, entry);
    var mp = A.moonPhase(jdOfCtx(ctx));
    var head = entry.summary;
    var w = answer._when;
    var dateAligned = false;
    if (w && w.src === 'explicit' && (entry.id === 'solar-eclipse' || entry.id === 'lunar-eclipse')) {
      var ds = w.y + '-' + pad(w.mo) + '-' + pad(w.d);
      var hit = null;
      entry.facts.forEach(function (f) { if (f[0] === ds) hit = f; });
      if (hit) {
        dateAligned = true;
        head = ds + '：' + hit[1] + '。这是本地事件表记录的日期，食甚时刻与可见区域需按当地经纬度复核。';
      } else {
        head = '本地事件表没有记录 ' + ds + ' 的' + entry.cn + '。为避免给出错误日期，我不做推测——请以 NASA Eclipse 或 IMCCE 的发布为准。';
      }
    }
    var dateFact = entry.facts.filter(function (f) { return /^\d{4}-\d{2}-\d{2}$/.test(f[0]); })[0];

    if (entry.id === 'perseids' || entry.id === 'geminids' || entry.id === 'quadrantids') {
      var peak = entry.facts[0][1];
      head = entry.cn + '每年' + peak.replace('每年', '') + '达到极大，' + (entry.facts[1] ? 'ZHR 约 ' + entry.facts[1][1].replace(/[^\d]/g, '') : '') + '。极大当晚的实际可见数还取决于月相与辐射点高度。';
    }
    answer.trace.push(step('vega', '检索事件库', '命中「' + entry.id + '」· ' + freshnessLabel(entry.freshness)));

    answer.sections.push({ kind: 'verdict', head: head, sub: clamp(entry.summary, 80) });

    var items = entry.facts.slice(0, cfg.muse.depth === 'brief' ? 3 : entry.facts.length)
      .map(function (f) { return { label: f[0], value: f[1] }; });
    answer.sections.push({
      kind: 'evidence', title: '依据', items: items,
      para: reg === 'pro' ? entry.pro : entry.pop, sources: entry.sources, register: reg
    });
    answer.trace.push(step('lyra', '组织表述', (reg === 'pro' ? '专业语体' : '科普语体') + ' · ' + toneLabel(cfg.lyra.tone)));

    if (cfg.muse.depth !== 'brief') {
      var obs = entry.observe.map(function (o, i) { return { k: i === 0 ? '首要' : '要点 ' + i, v: o }; });
      obs.push({ k: '当前月相', v: mp.name + ' · 照亮 ' + (mp.illum * 100).toFixed(0) + '%（按 ' + ctx.city + ' 计算）' });
      answer.sections.push({ kind: 'observe', title: '观测建议', items: obs });
      answer.trace.push(step('horizon', '结合当地条件', ctx.city + ' · Bortle ' + ctx.bortle + ' · 月相 ' + mp.name));
    }

    if (dateFact && /日食|月食/.test(entry.cn)) {
      answer.sections.push({
        kind: 'visual', title: '可视化',
        visual: { type: 'moon', payload: { jd: jdOfCtx(ctx), lat: ctx.lat, lon: ctx.lon, phase: mp, highlight: null, caption: '当前月相 · ' + ctx.city, style: cfg.orion.style } }
      });
      answer.trace.push(step('orion', '生成月相视图', '照亮比例 ' + (mp.illum * 100).toFixed(0) + '%'));
    }

    var b = [];
    if (entry.caution) b.push(entry.caution);
    if (entry.freshness === 'annual' || entry.freshness === 'realtime') b.push('本地快照的年度事件表更新于 ' + entry.updated + '；具体时刻与可见区域请以 IMO / NASA Eclipse 官方发布为准。');
    if (/明年|后年|20[3-9]\d/.test(q)) b.push('你询问的年份超出本地年度表覆盖范围，我无法给出可靠日期。');
    if (b.length) answer.sections.push({ kind: 'boundary', text: b.join(' ') });

    answer.sections.push({ kind: 'followup', items: ['今年这次在中国能看到吗？', '需要什么观测设备？', '当晚月亮会影响观测吗？'] });
    answer.meta = {
      agents: answer.trace.map(function (s) { return s.agent; }).filter(uniq),
      confidence: entry.confidence, freshness: entry.freshness, register: reg,
      computed: false, target: entry.cn, refs: entry.sources
    };
    return answer;
  }

  /* ---------- 器材 ---------- */
  function composeGear(answer, ctx, cfg) {
    var e = KB.byId.equipment, reg = pickRegister(cfg, answer.query, e);
    answer.trace.push(step('vega', '检索器材条目', '命中 equipment · ' + freshnessLabel(e.freshness)));
    answer.sections.push({ kind: 'verdict', head: e.summary, sub: '按你的器材倾向：' + toneLabel(cfg.horizon.gear) });
    answer.sections.push({
      kind: 'evidence', title: '依据', register: reg,
      items: e.facts.map(function (f) { return { label: f[0], value: f[1] }; }),
      para: reg === 'pro' ? e.pro : e.pop, sources: e.sources
    });
    answer.sections.push({
      kind: 'observe', title: '选购顺序', items: e.observe.map(function (o, i) { return { k: '建议 ' + (i + 1), v: o }; })
    });
    answer.trace.push(step('horizon', '匹配使用场景', 'Bortle ' + ctx.bortle + ' · 经验：' + (ctx.experience || '入门')));
    answer.trace.push(step('lyra', '组织表述', toneLabel(cfg.lyra.tone)));
    answer.sections.push({ kind: 'boundary', text: '我不做具体品牌与型号推荐：价格、供货与个体品控差异无法从本地库确证，建议以实测评测与实体店体验为准。' });
    answer.sections.push({ kind: 'followup', items: ['双筒望远镜能看哪些天体？', '城市里能看到银河吗？', '第一次拍摄银河需要什么？'] });
    answer.meta = { agents: ['muse', 'vega', 'horizon', 'lyra'], confidence: 0.88, freshness: 'static', register: reg, computed: false, target: '器材' };
    return answer;
  }

  /* ---------- 星图/星座 ---------- */
  function composeChart(answer, ctx, cfg, t) {
    if (!t) {
      answer.trace.push(step('orion', '等待目标', '未指定星座或天体'));
      answer.sections.push({
        kind: 'verdict', head: '我可以把任意星座或目标画成全天星图，并标出它在你所在位置的方位与高度。',
        sub: '当前上下文：' + ctx.city + ' · ' + ctx.y + '-' + pad(ctx.mo) + '-' + pad(ctx.d) + ' ' + pad(ctx.h) + ':' + pad(ctx.mi)
      });
      answer.sections.push({ kind: 'visual', title: '可视化', visual: { type: 'skymap', payload: { jd: jdOfCtx(ctx), lat: ctx.lat, lon: ctx.lon, highlight: null, caption: '全天星图 · ' + ctx.city, phase: A.moonPhase(jdOfCtx(ctx)), style: cfg.orion.style } } });
      answer.sections.push({ kind: 'followup', items: ['猎户座现在在哪？', '北斗七星怎么找北极星？', '今晚能看到夏季大三角吗？'] });
      answer.meta = { agents: ['muse', 'orion'], confidence: 0.8, freshness: 'ephemeris', register: 'pop', computed: true };
      return answer;
    }
    return composeTarget(answer, ctx, cfg, t, 'observe-target');
  }


  /* ---------- 宇宙学 ---------- */
  function statusLabel(st) {
    return { established: '已成共识', emerging: '前沿研究', speculative: '未定论' }[st] || '已成共识';
  }
  function statusLine(entry) {
    var base = '共识等级：' + statusLabel(entry.status) + ' · 数据核验 ' + (entry.verified || '2026-10');
    if (entry.status === 'emerging') base += ' · 结论可能随新数据变化';
    if (entry.status === 'speculative') base += ' · 属推测性框架，不可作为事实引用';
    return base;
  }

  function composeCosmos(answer, ctx, cfg, t, q) {
    var entry = t && t.kind === 'kb' ? t.entry : null;
    var reg = pickRegister(cfg, q, entry);
    var wantIndex = !entry || /未解|哪些问题|前沿|争议|不确定|还没解决/.test(q);

    if (wantIndex) {
      var front = KB.entries.filter(function (e) { return e.tag === '宇宙' && e.status !== 'established'; });
      var core = KB.entries.filter(function (e) { return e.tag === '宇宙' && e.status === 'established'; }).slice(0, 4);
      answer.trace.push(step('cosmos', '列出议题', '未指定具体概念 · 输出宇宙学索引'));
      answer.sections.push({
        kind: 'verdict',
        head: '宇宙学里有「已经相当确定」的部分，也有「仍在争论」的部分。你可以指定其中一个，我再给出数据、证据链与共识等级。',
        sub: '数据核验：Planck 2018 · DESI DR2（2025）· EHT / GRAVITY · NASA Exoplanet Archive'
      });
      answer.sections.push({
        kind: 'list', title: '仍在探索中',
        items: front.map(function (e) { return { name: e.cn, meta: statusLabel(e.status), text: e.summary }; })
      });
      answer.sections.push({
        kind: 'list', title: '已成共识的基础',
        items: core.map(function (e) { return { name: e.cn, meta: '已成共识', text: e.summary }; })
      });
      answer.sections.push({ kind: 'followup', items: ['黑洞是怎么形成的？', '宇宙的年龄是怎么测出来的？', '暗能量到底是什么？', '哈勃张力为什么重要？'] });
      answer.meta = { agents: ['muse', 'cosmos'], confidence: 0.8, freshness: 'static', register: 'pop', computed: false, target: '宇宙学' };
      return answer;
    }

    answer.trace.push(step('cosmos', '建立共识框架', statusLabel(entry.status) + ' · 核验 ' + (entry.verified || '2026-10')));
    answer.trace.push(step('vega', '核对数据来源', entry.sources.length + ' 个权威来源 · 置信度 ' + entry.confidence.toFixed(2)));

    var limit = cfg.muse.depth === 'brief' ? 3 : entry.facts.length;
    var items = entry.facts.slice(0, limit).map(function (f) { return { label: f[0], value: f[1] }; });

    answer.sections.push({ kind: 'verdict', head: entry.summary, sub: statusLine(entry) });
    answer.sections.push({
      kind: 'evidence', title: '关键数据', items: items,
      para: reg === 'pro' ? entry.pro : entry.pop,
      sources: entry.sources, register: reg,
      status: entry.status, verified: entry.verified
    });
    answer.sections.push({
      kind: 'consensus', level: entry.status, verified: entry.verified,
      open: entry.openQuestion || '', evidence: entry.evidence || []
    });

    if (entry.observe && cfg.muse.depth !== 'brief') {
      answer.sections.push({
        kind: 'observe', title: '如何验证',
        items: entry.observe.map(function (o, i) { return { k: '途径 ' + (i + 1), v: o }; }),
        note: '宇宙学结论依赖卫星、巡天或干涉阵列，个人无法直接复现，只能通过公开数据与论文核验。'
      });
    }

    if (entry.id === 'blackhole') {
      var jd = jdOfCtx(ctx);
      answer.sections.push({
        kind: 'visual', title: '可视化',
        visual: {
          type: 'skymap',
          payload: {
            jd: jd, lat: ctx.lat, lon: ctx.lon,
            highlight: { ra: 17.7611, dec: -29.0078, label: '银心 Sgr A*' },
            caption: '银心方向 · ' + ctx.city + ' · 人马座',
            phase: A.moonPhase(jd), style: cfg.orion.style
          }
        }
      });
      answer.trace.push(step('orion', '定位银心', 'RA 17h45m40s / Dec −29°00′28″'));
    }

    answer.trace.push(step('lyra', '切换表述', reg === 'pro' ? '专业语体' : '科普语体'));

    var b = [];
    if (entry.status !== 'established') {
      b.push('本条为「' + statusLabel(entry.status) + '」：' + (entry.caution || '结论可能随新证据调整。'));
    }
    b.push('数据核验日期 ' + (entry.verified || '2026-10') + '，数值与结论均来自条目所列论文或机构发布；未采用二手科普转述。');
    answer.sections.push({ kind: 'boundary', text: b.join(' ') });
    answer.sections.push({ kind: 'followup', items: cosmosChips(entry) });

    answer.meta = {
      agents: entry.id === 'blackhole' ? ['muse', 'cosmos', 'vega', 'orion', 'lyra'] : ['muse', 'cosmos', 'vega', 'lyra'],
      confidence: entry.confidence, freshness: entry.freshness, register: reg,
      computed: entry.id === 'blackhole', target: entry.cn,
      status: entry.status, verified: entry.verified, refs: entry.sources
    };
    return answer;
  }

  /* ---------- 爆发天体（Nova） ---------- */
  var NOVA_IDS = ['supernova-1987a', 'crab-nebula-1054', 'neutron-star', 'magnetar', 'pulsar', 'fast-radio-bursts', 'stellardeath'];

  function composeNova(answer, ctx, cfg, t, q) {
    var reg = pickRegister(cfg, q, t && t.kind === 'kb' ? t.entry : null);
    var entry = (t && t.kind === 'kb') ? t.entry : null;
    var related = NOVA_IDS.map(function (id) { return KB.byId[id]; }).filter(Boolean);
    var mp = A.moonPhase(jdOfCtx(ctx));

    if (!entry) {
      answer.trace.push(step('nova', '梳理爆发天体谱系', '未指定具体天体 · 输出观测特征索引'));
      answer.sections.push({
        kind: 'verdict',
        head: '爆发类天体的共同点是「短时间内释放出远超稳态的能量」。区别在于机制：热核失控、吸积坍缩、磁层灾变，还是并合。',
        sub: '以下条目均来自已发布的观测任务与论文，标注了共识等级与核验日期。'
      });
      answer.sections.push({
        kind: 'list', title: '可确证的爆发天体',
        items: related.map(function (e) {
          return { name: e.cn, meta: statusLabel(e.status) + ' · ' + (e.verified || '2026-10'), text: e.summary };
        })
      });
      answer.sections.push({
        kind: 'observe', title: '业余能做什么',
        items: [
          { k: '肉眼', v: '只有足够近的爆发现象会亮到可见：2026 年 8 月中国天眼 PSP 公众科学平台就发现过两颗超新星' },
          { k: '双筒/小镜', v: '银河系内年爆发新星（亮度可达 3–6 等）可用 10×50 双筒逐夜搜索' },
          { k: '大设备', v: '超新星遗迹、脉冲星风星云需要中大口径望远镜与窄带滤镜' },
          { k: '当前月相', v: mp.name + ' · 照亮 ' + (mp.illum * 100).toFixed(0) + '%，影响低亮度目标的搜索' }
        ]
      });
      answer.trace.push(step('critic', '证据复核', '条目均带来源与共识等级'));
      answer.sections.push({ kind: 'followup', items: ['超新星 1987A 有什么特别？', '脉冲星是怎么被发现的？', '蟹状星云里有什么？'] });
      answer.meta = { agents: ['muse', 'nova', 'vega', 'critic'], confidence: 0.86, freshness: 'static', register: reg, computed: false, target: '爆发天体' };
      return answer;
    }

    answer.trace.push(step('nova', '建立观测事实链', statusLabel(entry.status) + ' · 核验 ' + (entry.verified || '2026-10')));
    answer.trace.push(step('vega', '核对来源', (entry.sources || []).length + ' 个来源 · 置信度 ' + (entry.confidence || 0.9).toFixed(2)));

    var limit = cfg.muse.depth === 'brief' ? 3 : entry.facts.length;
    answer.sections.push({ kind: 'verdict', head: entry.summary, sub: statusLine(entry) });
    answer.sections.push({
      kind: 'evidence', title: '观测事实', register: reg,
      items: entry.facts.slice(0, limit).map(function (f) { return { label: f[0], value: f[1] }; }),
      para: reg === 'pro' ? entry.pro : entry.pop,
      sources: entry.sources, status: entry.status, verified: entry.verified
    });
    if (entry.observe && cfg.muse.depth !== 'brief') {
      answer.sections.push({
        kind: 'observe', title: '如何观测',
        items: entry.observe.map(function (o, i) { return { k: '途径 ' + (i + 1), v: o }; }),
        note: '爆发类天体的亮度变化快，请以实时巡天数据为准；本条目为静态知识。'
      });
      answer.trace.push(step('horizon', '匹配观测条件', ctx.city + ' · Bortle ' + ctx.bortle + ' · ' + (cfg.horizon.gear === 'naked' ? '肉眼优先' : '器材优先')));
    }
    answer.trace.push(step('lyra', '组织表述', reg === 'pro' ? '专业语体' : '科普语体'));
    var b = [];
    if (entry.status !== 'established') b.push('本条为「' + statusLabel(entry.status) + '」：' + (entry.caution || '结论可能随新证据调整。'));
    b.push('数据核验 ' + (entry.verified || '2026-10') + '；爆发类天体的实时状态请以天文台当日发布为准。');
    answer.sections.push({ kind: 'boundary', text: b.join(' ') });
    answer.sections.push({ kind: 'followup', items: ['为什么会有超新星？', '脉冲星是怎么被发现的？', '这类事件会威胁地球吗？'] });
    answer.meta = {
      agents: ['muse', 'nova', 'vega', 'lyra'], confidence: entry.confidence, freshness: entry.freshness,
      register: reg, computed: false, target: entry.cn, status: entry.status, verified: entry.verified, refs: entry.sources
    };
    return answer;
  }

  /* ---------- 太阳与空间天气（Helios） ---------- */
  function composeHelios(answer, ctx, cfg, t, q) {
    var entry = (t && t.kind === 'kb') ? t.entry : null;
    var reg = pickRegister(cfg, q, entry);
    var sunEntry = KB.byId['sun-structure'];
    var mp = A.moonPhase(jdOfCtx(ctx));
    var jd = jdOfCtx(ctx);
    var sunPos = A.sun(jd);
    var sunAA = A.altAz(sunPos.ra, sunPos.dec, jd, ctx.lat, ctx.lon);

    if (!entry) {
      answer.trace.push(step('helios', '评估太阳状态', '目标：太阳活动与空间天气'));
      answer.sections.push({
        kind: 'verdict',
        head: '太阳活动分两层：日面层的黑子与耀斑周期（约 11 年），以及日冕抛出的高能粒子流。后者到达地球后会扰动磁层，' +
          '是极光与卫星异常的主要来源。',
        sub: '本地可复算的只有太阳位置（下面给出），活动强度与磁暴等级需要实时空间天气数据，我无法凭本地库给出。'
      });
      answer.sections.push({
        kind: 'evidence', title: '当前太阳位置（本地星历复算）', register: reg,
        items: [
          { label: '太阳高度角', value: Math.round(sunAA.alt) + '°' + (sunAA.alt > 0 ? '（在地平线以上）' : '（在地平线以下）') },
          { label: '方位角', value: A.fmtDeg(sunAA.az, 'az') },
          { label: '当前月相', value: mp.name + ' · 照亮 ' + (mp.illum * 100).toFixed(0) + '%' },
          { label: '白昼观测', value: sunAA.alt > 0 ? '太阳在白天可见，观测需专用滤镜' : '当前为夜间，是日冕与极光的观测窗口' }
        ],
        sources: [{ n: 'NASA/NOAA Space Weather', u: 'https://www.swpc.noaa.gov/' }],
        para: '太阳高度角由本地星历复算；活动等级、耀斑预警与地磁暴指数属于实时数据，需以 SWPC 或中国空间天气网发布为准。'
      });
      answer.sections.push({
        kind: 'observe', title: '观测与预报',
        items: [
          { k: '白昼', v: '太阳与日珥需巴德膜或专用太阳滤镜，普通太阳镜无效' },
          { k: '极光', v: '需要 Kp 指数达到 5 级以上且本地处于磁纬 60° 附近；北京通常看不到，北纬 60° 以上才有机会' },
          { k: '监测手段', v: '业余可用太阳黑子目视记录（需滤镜）与射电接收；专业预警看 SWPC 与中国空间天气网' },
          { k: '数据边界', v: '本地库不含实时太阳活动指数，我不会编造当天是否会有强耀斑' }
        ]
      });
      answer.trace.push(step('horizon', '结合观测条件', ctx.city + ' · 纬度 ' + ctx.lat.toFixed(2) + '° · 磁纬越高越可能见到极光'));
      answer.sections.push({
        kind: 'boundary',
        text: '太阳活动强度、耀斑级别与地磁暴等级是实时数据，本地知识库不含当天的活动指数；相关判断请以 NOAA SWPC、中国空间天气网与各国天文台发布为准。'
      });
      answer.sections.push({ kind: 'followup', items: ['太阳的结构是怎样的？', '极光为什么只在高纬度出现？', '什么是「太阳风」？'] });
      answer.meta = { agents: ['muse', 'helios', 'kepler', 'horizon'], confidence: 0.84, freshness: 'realtime', register: reg, computed: true, target: '太阳与空间天气' };
      return answer;
    }

    answer.trace.push(step('helios', '建立太阳活动框架', statusLabel(entry.status) + ' · 核验 ' + (entry.verified || '2026-10')));
    answer.sections.push({ kind: 'verdict', head: entry.summary, sub: statusLine(entry) });
    answer.sections.push({
      kind: 'evidence', title: '依据', register: reg,
      items: entry.facts.map(function (f) { return { label: f[0], value: f[1] }; }),
      para: reg === 'pro' ? entry.pro : entry.pop, sources: entry.sources,
      status: entry.status, verified: entry.verified
    });
    if (entry.observe) {
      answer.sections.push({
        kind: 'observe', title: '观测建议',
        items: entry.observe.map(function (o, i) { return { k: '要点 ' + (i + 1), v: o }; })
      });
      answer.trace.push(step('horizon', '结合观测条件', ctx.city + ' · Bortle ' + ctx.bortle));
    }
    answer.sections.push({
      kind: 'boundary',
      text: '活动强度与预警属于实时数据，超出本地库的覆盖范围；本条给出的是结构性知识与可复算的太阳位置。'
    });
    answer.sections.push({ kind: 'followup', items: ['今晚有极光吗？', '太阳黑子怎么数？', '太阳风会影响卫星吗？'] });
    answer.meta = {
      agents: ['muse', 'helios', 'vega', 'horizon', 'lyra'], confidence: entry.confidence, freshness: entry.freshness,
      register: reg, computed: true, target: entry.cn, status: entry.status, verified: entry.verified, refs: entry.sources
    };
    return answer;
  }

  function cosmosChips(entry) {    var map = {
      bigbang: ['宇宙的年龄是怎么测出来的？', '大爆炸之前有什么？', '暗能量到底是什么？'],
      cmb: ['微波背景为什么这么重要？', '宇宙的年龄是怎么测出来的？', '暗物质是什么？'],
      darkmatter: ['暗物质为什么看不见？', '暗能量和暗物质有什么区别？', '哈勃张力是什么？'],
      darkenergy: ['宇宙会一直膨胀下去吗？', '暗能量和暗物质有什么区别？', '哈勃张力是什么？'],
      'hubble-tension': ['为什么两个哈勃常数不一样？', '暗能量到底是什么？', '宇宙的年龄是怎么测出来的？'],
      inflation: ['大爆炸之前有什么？', '多重宇宙是真的吗？', '微波背景为什么这么重要？'],
      multiverse: ['暴胀是什么？', '多重宇宙有证据吗？', '黑洞是怎么形成的？'],
      blackhole: ['黑洞会蒸发吗？', '银河系中心的黑洞在哪？', '引力波是怎么被探测到的？'],
      stellardeath: ['太阳最后会变成什么？', '超新星为什么会爆炸？', '黑洞是怎么形成的？'],
      'gravitational-wave': ['引力波为什么这么难测？', '中子星并合会产生什么？', '黑洞是怎么形成的？'],
      'early-galaxies': ['韦布望远镜看到了什么？', '宇宙的年龄是怎么测出来的？', '暗物质是什么？']
    };
    return map[entry.id] || ['宇宙的年龄是怎么测出来的？', '暗能量到底是什么？', '黑洞是怎么形成的？'];
  }

  /* ---------- 兜底：不确定策略 ---------- */
  /* ---------- 拍摄参数建议（论坛高频诉求：器材能不能拍、怎么拍） ---------- */
  function shootingAdvice(target, ctx, cfg) {
    var P = root.OBSPLAN;
    if (!P) return null;
    var sizeArcmin = null, sizeNote = '';
    if (target && target.type === 'dso' && target.key) {
      var byId = target.dsoId ? P.SIZE[target.dsoId] : null;
      var byKey = P.SIZE[String(target.key).toUpperCase()];
      sizeArcmin = byId != null ? byId : (byKey != null ? byKey : null);
    } else if (target && target.type === 'planet' && target.key) {
      var ps = P.PSIZE[target.key];
      if (ps) { sizeArcmin = ps / 60; sizeNote = '（冲日附近）'; }
    }
    var cam = P.CAMERAS[0];
    var bortle = ctx.bortle || 7;
    var rows = [];
    rows.push({ k: '目标角径', v: sizeArcmin ? (sizeArcmin >= 60 ? (sizeArcmin / 60).toFixed(1) + '°' : (sizeArcmin).toFixed(1) + '′') + sizeNote : '需查星表' });
    var samp = P.samplingFor(sizeArcmin);
    rows.push({ k: '建议采样', v: samp + '″/px（宽视场取 2–3，小目标取 1–1.5）' });
    if (sizeArcmin) {
      var ideal = P.focalFor(sizeArcmin, cam.px, samp);
      rows.push({ k: '理论焦距', v: ideal > 2000 ? ('> ' + ideal + ' mm，实际改拍核心或拼接') : (ideal + ' mm 起') });
    }
    rows.push({ k: '视场（' + cam.name + '）', v: P.fovDeg(cam.w, cam.fl).toFixed(1) + '° × ' + P.fovDeg(cam.h, cam.fl).toFixed(1) + '°' });
    rows.push({ k: '像元比例', v: P.pixelScale(cam.px, cam.fl).toFixed(2) + '″/px' });
    rows.push({ k: '焦比', v: 'f/' + cam.f + (cam.f <= 2.5 ? '（大光圈，需注意场亮度不均）' : '（适合深空）') });
    var tExp = P.maxExposure(bortle);
    rows.push({ k: '单张曝光上限', v: tExp + ' s（由 Bortle ' + bortle + ' 的天光亮度决定）' });
    rows.push({ k: '建议堆栈', v: '30–60 张 × ' + Math.min(tExp, 300) + ' s（合计 ' + (30 * Math.min(tExp, 300) / 3600).toFixed(1) + '–' + (60 * Math.min(tExp, 300) / 3600).toFixed(1) + ' 小时）' });
    rows.push({ k: '跟踪', v: '需赤道仪 + 极轴校准；长焦需导星，误差控制在像元 1/3 以内' });
    return rows;
  }

  /* ---------- 拍摄参数建议 ---------- */
  function composePhoto(answer, ctx, cfg, t, q) {
    var entry = t && t.kind === 'kb' ? t.entry : null;
    var reg = pickRegister(cfg, q, entry);
    var target = null;
    if (t && (t.kind === 'dso' || t.kind === 'star')) {
      target = { name: nameOf(t), ra: t.ra, dec: t.dec, mag: t.mag, type: t.kind, kind: t.kind, key: t.key };
    } else if (t && t.kind === 'planet') {
      target = { name: nameOf(t), ra: t.ra, dec: t.dec, mag: t.mag, type: 'planet', kind: 'planet', key: t.key };
    } else if (entry) {
      var vk = entry.visual;
      var dso = vk ? CAT.dso.filter(function (d) { return d.k === vk; })[0] : null;
      if (dso) target = { name: dso.cn, ra: dso.ra, dec: dso.dec, mag: dso.mag, type: 'dso', kind: 'dso', key: dso.k, dsoId: dso.id };
    }
    answer.trace.push(step('muse', '解析意图', '拍摄参数咨询' + (target ? ' · ' + target.name : '')));
    var rows = shootingAdvice(target, ctx, cfg);
    if (!rows) {
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '当前构建未包含拍摄参数模块，无法给出具体参数建议。'
      });
      answer.meta = { agents: ['muse'], confidence: 0.2, freshness: 'static', register: 'pop', computed: false };
      return answer;
    }
    var ep = target ? ephemFor(target.ra, target.dec, ctx) : null;
    answer.trace.push(step('kepler', '核对可见窗口', ep ? ('最大高度 ' + deg(ep.track.maxAlt, cfg) + ' · 月光 ' + moonInterference(ep, ctx.tz)) : '无坐标'));
    answer.trace.push(step('horizon', '匹配器材与光害', 'Bortle ' + ctx.bortle + ' · 器材倾向 ' + toneLabel(cfg.horizon.gear)));

    answer.sections.push({
      kind: 'verdict',
      head: target
        ? (target.name + ' 可以按下面的参数起步：先保证跟踪稳定，再谈曝光长度。')
        : '下面是一套通用深空起步参数，具体数值随目标角径变化。',
      sub: target && ep
        ? ('当前最大高度 ' + deg(ep.track.maxAlt, cfg) + '，' + moonInterference(ep, ctx.tz))
        : ('地点 ' + ctx.city + ' · Bortle ' + ctx.bortle)
    });
    answer.sections.push({
      kind: 'evidence', title: '拍摄参数', register: reg,
      items: rows.map(function (r) { return { label: r.k, value: r.v }; }),
      para: '曝光上限由天光亮度决定而非器材：光害越大，单张越短、靠张数补总时长。采样率决定目标在画面里的大小，通常 1–2″/px 比较平衡。'
    });
    answer.sections.push({
      kind: 'observe', title: '执行建议',
      items: [
        { k: '对焦', v: '用 Bahtinov 掩模或亮星做精确对焦，锁定后别再动' },
        { k: '校准', v: '拍平场（同一目标翻转到不同角度）以消除暗角与视场倾斜' },
        { k: '降噪', v: '每目标至少 20 张暗场、30 张平场；同温同增益拍摄' },
        { k: '成片', v: '先出 10 张快速叠加验证构图与跟踪，再补足张数' }
      ],
      note: '参数为规划用近似值；实际还需按当夜透明度、月光与个人器材微调。'
    });
    var b = [];
    if (ctx.bortle >= 6) b.push('你在 Bortle ' + ctx.bortle + ' 的环境下，长曝光会迅速被光害吞掉，建议改到更暗的地点或改拍窄带/短焦目标。');
    if (ep && ep.track.maxAlt < 25) b.push('该目标在当前纬度最高只有 ' + deg(ep.track.maxAlt, cfg) + '，低空拍摄大气消光严重，建议换季或换目标。');
    if (b.length) answer.sections.push({ kind: 'boundary', text: b.join(' ') });
    answer.sections.push({ kind: 'followup', items: ['M42 用什么镜头拍？', '银河怎么拍才不糊？', '望远镜和相机怎么搭配？'] });
    answer.meta = {
      agents: ['muse', 'kepler', 'horizon', 'lyra'], confidence: 0.84, freshness: 'static',
      register: reg, computed: !!ep, target: target ? target.name : '深空目标'
    };
    return answer;
  }

  /* ---------- 太阳系视图指令（Navigator） ---------- */
  function solarBody(name) {
    var S2 = root.SOLAR;
    if (!S2) return null;
    var key = String(name || '').trim();
    if (S2.byKey[key]) return S2.byKey[key];
    var hit = S2.all.filter(function (b) {
      return b.cn === key || b.en === key || b.cn.indexOf(key) >= 0 || key.indexOf(b.cn) >= 0;
    })[0];
    return hit || null;
  }
  function solarCandidates(name) {
    var S2 = root.SOLAR;
    if (!S2) return [];
    var key = String(name || '').trim();
    return S2.all.filter(function (b) {
      return b.cn.indexOf(key) >= 0 || key.indexOf(b.cn) >= 0 || b.en.toLowerCase().indexOf(key.toLowerCase()) >= 0;
    }).slice(0, 5).map(function (b) { return b.cn; });
  }
  function solarFieldText(b, field) {
    if (!b) return '—';
    if (field === 'radius') return b.radiusKm.toLocaleString() + ' km';
    if (field === 'mass') {
      var e = Math.floor(Math.log(b.massKg) / Math.LN10);
      var m = b.massKg / Math.pow(10, e);
      return m.toFixed(m >= 100 ? 0 : 2) + ' × 10^' + e + ' kg';
    }
    if (field === 'period') {
      if (b.kind === 'planet') {
        var a = 0, r = 0;
        try { r = A.helio(b.key, 2451545.0).r; } catch (e2) { r = 0; }
        a = 365.256 * Math.pow(r, 1.5);
        return a > 700 ? (a / 365.25).toFixed(2) + ' 年' : a.toFixed(2) + ' 天';
      }
      if (b.kind === 'moon') return Math.abs(b.periodD).toFixed(3) + ' 天';
      return '—';
    }
    if (field === 'rotation') return b.rotationH ? (b.rotationH / 24).toFixed(2) + ' 小时' + (b.rotationH < 0 ? '（逆行）' : '') : '—';
    if (field === 'distance') {
      if (b.kind === 'planet') {
        var rr = 0;
        try { rr = A.helio(b.key, 2451545.0).r; } catch (e3) { rr = 0; }
        return rr.toFixed(3) + ' AU';
      }
      if (b.kind === 'moon') return b.orbitKm.toLocaleString() + ' km（绕 ' + (S2.byKey[b.parent] ? S2.byKey[b.parent].cn : b.parent) + '）';
      return '0（系统中心）';
    }
    if (field === 'tilt') return b.axialTilt != null ? b.axialTilt + '°' : '—';
    if (field === 'mass2') return b.massKg ? b.massKg.toExponential(3) + ' kg' : '—';
    return '—';
  }
  var SOLAR_FIELDS = [
    { id: 'radius', label: '平均半径' },
    { id: 'mass', label: '质量' },
    { id: 'distance', label: '日心距离' },
    { id: 'period', label: '公转周期' },
    { id: 'rotation', label: '自转周期' },
    { id: 'tilt', label: '轴倾角' }
  ];

  function composeSystemView(answer, ctx, cfg, t, q) {
    var S2 = root.SOLAR;
    answer.trace.push(step('navigator', '解析视图指令', '意图：太阳系观测视图'));
    if (!S2) {
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '当前构建未包含太阳系视图数据模块，无法执行该指令。'
      });
      answer.meta = { agents: ['muse', 'navigator'], confidence: 0.2, freshness: 'static', register: 'pop', computed: false };
      return answer;
    }

    /* ---- 1. 目标解析 ---- */
    var body = null;
    var m = q.match(/([一-龥A-Za-z0-9]{1,8}?)(?:现在|此刻|的)?(?:视图|近景|特写|轨道|资料|数据|信息)/);
    var named = /聚焦|切到|切换到|看看|查看|看|定位/.test(q);
    if (named) {
      var pool = S2.all.map(function (b) { return b.cn; });
      for (var i = 0; i < pool.length; i++) {
        if (q.indexOf(pool[i]) >= 0) { body = solarBody(pool[i]); break; }
      }
      if (!body) {
        var mm = q.match(/(?:聚焦|切到|切换到|看看|查看|看|定位)([一-龥A-Za-z0-9]{1,6})/);
        if (mm) body = solarBody(mm[1]);
      }
    }

    /* ---- 2. 指令类型 ---- */
    var action = { type: 'open', level: 'system', target: body ? body.key : '' };
    var verb = '打开视图';
    if (/重置/.test(q)) { action = { type: 'reset' }; verb = '重置视角'; }
    else if (/暂停/.test(q)) { action = { type: 'pause', value: true }; verb = '暂停时间推进'; }
    else if (/继续|恢复/.test(q)) { action = { type: 'pause', value: false }; verb = '恢复时间推进'; }
    else if (/隐藏.*轨道|关闭轨道|不显示轨道/.test(q)) { action = { type: 'toggle', item: 'orbits', value: false }; verb = '隐藏轨道'; }
    else if (/显示轨道|打开轨道/.test(q)) { action = { type: 'toggle', item: 'orbits', value: true }; verb = '显示轨道'; }
    else if (/隐藏.*标签|关闭标签|不显示标签/.test(q)) { action = { type: 'toggle', item: 'labels', value: false }; verb = '隐藏标签'; }
    else if (/显示标签|打开标签/.test(q)) { action = { type: 'toggle', item: 'labels', value: true }; verb = '显示标签'; }
    else if (/放大/.test(q)) { action = { type: 'boost', value: 1.6 }; verb = '放大天体'; }
    else if (/缩小/.test(q)) { action = { type: 'boost', value: 0.62 }; verb = '缩小天体'; }
    else if (/特写/.test(q)) { action = { type: 'level', level: 'close', target: body ? body.key : '' }; verb = '切到特写'; }
    else if (/近景/.test(q)) { action = { type: 'level', level: 'planet', target: body ? body.key : '' }; verb = '切到近景'; }
    else if (/全系|整个太阳系|全景/.test(q)) { action = { type: 'level', level: 'system', target: body ? body.key : '' }; verb = '切到全系视图'; }
    else if (named && body) { action = { type: 'focus', target: body.key, level: 'planet' }; verb = '聚焦 ' + body.cn; }

    /* ---- 3. 异常输入：指定了对象但找不到 ---- */
    if (named && !body) {
      var raw = (q.match(/(?:聚焦|切到|切换到|看看|查看|看|定位)([一-龥A-Za-z0-9]{1,6})/) || [])[1] || '';
      var cand = solarCandidates(raw);
      answer.trace.push(step('navigator', '目标校验', '未找到天体「' + raw + '」'));
      answer.sections.push({
        kind: 'verdict', head: '这个指令里的天体我无法确定，因此没有执行任何视角操作。',
        sub: '太阳系视图收录了太阳、八大行星与 ' + S2.moons.length + ' 颗主要卫星，可指定其中之一。'
      });
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '未找到名为「' + raw + '」的天体。' + (cand.length ? '最接近的是：' + cand.join('、') + '。' : '') +
          '我不会把名称相近的天体误当作目标，请给出确切的行星或卫星名。'
      });
      answer.sections.push({ kind: 'followup', items: ['打开太阳系视图', '聚焦土星', '聚焦木卫二'] });
      answer.meta = {
        agents: ['muse', 'navigator'], confidence: 0.4, freshness: 'static', register: 'pop',
        computed: false, systemAction: null
      };
      return answer;
    }

    /* ---- 4. 正常指令：输出结构化响应 ---- */
    var fields = [];
    if (body) {
      SOLAR_FIELDS.forEach(function (f) {
        fields.push({ label: f.label, value: solarFieldText(body, f.id) });
      });
    } else {
      fields.push({ label: '收录天体', value: '太阳 + 8 大行星 + ' + S2.moons.length + ' 颗主要卫星' });
      fields.push({ label: '距离布局', value: '真实等比 r ∝ a(AU) ／ 压缩 r ∝ a^0.5（可切换）' });
      fields.push({ label: '尺寸映射', value: '真实直径等比，统一放大系数作用于所有天体' });
    }
    answer.sections.push({
      kind: 'verdict',
      head: verb + (body ? '：' + body.cn : '') + '。',
      sub: body
        ? (body.cn + ' · ' + solarFieldText(body, 'radius') + ' 半径 · 日心 ' + solarFieldText(body, 'distance') +
          ' · 公转 ' + solarFieldText(body, 'period'))
        : '太阳系观测视图已就绪：可拖动旋转、滚轮缩放、点击天体查看资料。'
    });
    answer.sections.push({
      kind: 'system', title: '视图指令', action: action, verb: verb,
      target: body ? body.cn : '太阳系',
      fields: fields,
      state: { level: action.level || 'system', target: action.target || '' },
      next: ['打开太阳系视图', '聚焦木星', '隐藏轨道标签', '放大天体']
    });
    answer.trace.push(step('navigator', '生成结构化动作', verb + (body ? ' · ' + body.cn : '')));
    answer.trace.push(step('critic', '指令校验', action.type + ' · 目标' + (body ? body.key : '—')));
    answer.meta = {
      agents: ['muse', 'navigator', 'critic'], confidence: 0.9, freshness: 'static',
      register: 'pop', computed: true, target: body ? body.cn : '太阳系视图',
      systemAction: action
    };
    return answer;
  }

  /* 未知档：按问题线索给出「缺什么 / 去哪拿 / 次优方案」。
   * 契约要求不能只列「我能回答的方向」——那是把责任推回给用户。 */
  function gapFor(q) {
    var s = String(q || '');
    if (/论文|文献|研究|最新|测量|发现|期刊|doi/i.test(s)) {
      return {
        gap: '本地知识库只有 160 条通用条目，没有收录具体论文的最新测量值。',
        where: 'NASA ADS（ui.adsabs.harvard.edu）按关键词检索，或 arXiv astro-ph 预印本；拿到 DOI 后可回来核对数值与单位。',
        alt: '贴一段论文摘要或数据表给我，我可以按已有事实做比对，并标出与本地数据的差异。'
      };
    }
    if (/图像|照片|拍摄|观测数据|光谱|光变|拟合/i.test(s)) {
      return {
        gap: '本地没有原始观测数据，也不做图像处理与拟合。',
        where: 'MAST / IRSA / ZTF 归档按坐标检索；星表级别的问题走 SIMBAD 或 VizieR。',
        alt: '如果你有 FITS 文件，直接拖进来——我能读出目标、坐标、曝光与滤镜，并定位到星图。'
      };
    }
    if (/实时|云量|天气|seeing|Kp|极光|光污染/i.test(s)) {
      return {
        gap: '本地是离线快照，没有实时气象与空间天气数据。',
        where: '云量与 seeing 看 Open-Meteo 或天文台站预报；地磁活动看 NOAA SWPC 的 Kp 指数。',
        alt: '我可以先按你的地点和时间算出目标的可观测窗口与月亮干扰，天气那一项你对照一下即可。'
      };
    }
    if (/坐标|星表|自行|视差|光谱型|距离|星等/i.test(s)) {
      return {
        gap: '本地星表是 J2000 快照，未覆盖全部源，也没有测光与分光数据。',
        where: 'SIMBAD（名称解析）、VizieR（星表）、Gaia 归档（TAP/ADQL）都能按坐标或名称查到权威值。',
        alt: '把天体名或坐标给我，我先用本地星表给退化值，并明确标出哪些字段缺失。'
      };
    }
    return {
      gap: '本地知识库与星表都没有命中这个问法。',
      where: '换一个更具体的问法（给出天体名、时间、地点或坐标）通常就能命中；涉及专业结论时需要外部文献库。',
      alt: '告诉我你想解决的具体问题（比如「想拍什么」「想核对哪个数值」），我按可算/可查的路径拆一遍。'
    };
  }

  /* 问候 / 自我介绍：一句话回应 + 三个可点的起点。不检索、不调模型。 */
  function composeSmalltalk(answer, ctx, cfg) {
    var q = String(answer.query || '').trim();
    var head, sub;
    if (/谢谢|多谢|感谢/.test(q)) {
      head = '不客气。';
      sub = '还想看什么，随时说。';
    } else if (/再见|拜拜/.test(q)) {
      head = '回见。';
      sub = '今晚天气好的话，记得抬头。';
    } else if (/你是谁|你是什么|你能做什么|你会什么|怎么用|使用说明|你叫什么|介绍一下你自己/i.test(q)) {
      head = '我是 ASTRUM，一个天文方向的助手。';
      sub = '能算的直接算（星历、可见性），能查的给数据和出处，只能解释的会标清楚来源，真不知道就告诉你缺什么、去哪拿。';
    } else if (/测试|test/i.test(q)) {
      head = '收到，链路正常。';
      sub = '问一个具体的天文问题试试，比如「今晚能看到什么」。';
    } else {
      head = '你好。我是 ASTRUM，一个天文方向的助手。';
      sub = '告诉我你想看什么、想核对什么，我按可算或可查的路径拆给你。';
    }
    answer.trace.push(step('muse', '识别为问候', '不启动检索，也不调用模型', {
      tool: 'intent-router', check: RT.check('天文意图', false, '问候类输入，交由对话直接处理')
    }));
    answer.sections.push({ kind: 'verdict', head: head, sub: sub });
    answer.sections.push({
      kind: 'followup',
      items: ['今晚在北京能看到什么', '猎户座大星云适合用什么器材拍', '参宿四有多远，为什么各家测得不一样']
    });
    answer.meta = {
      agents: ['muse'], confidence: 1, freshness: 'static',
      register: 'pop', computed: false, tier: 'chat'
    };
    return answer;
  }

  function composeFallback(answer, ctx, cfg) {
    var g = gapFor(answer.query);
    answer.trace.push(step('muse', '边界判定', '无匹配实体 · 无匹配意图', {
      tool: 'intent-router', check: RT.check('知识库与星表命中', false, '零命中')
    }));
    answer.sections.push({
      kind: 'verdict',
      head: '这个问题我暂时给不出可靠答案。',
      sub: '下面写清楚缺什么、从哪里能拿到，以及我能先给的次优答案。'
    });
    answer.sections.push({
      kind: 'evidence', title: '缺口与获取路径', register: 'pop',
      items: [
        { label: '缺什么', value: g.gap },
        { label: '去哪拿', value: g.where },
        { label: '次优方案', value: g.alt }
      ],
      para: '我宁可把缺口说清楚，也不拼一个听起来合理、却无法核实来源的答案。'
    });
    answer.sections.push({ kind: 'followup', items: ['今晚适合看什么？', '猎户座大星云怎么找？', '为什么会有月相变化？'] });
    answer.meta = { agents: ['muse', 'vega'], confidence: 0.3, freshness: 'static', register: 'pop', computed: false, tier: 'unknown' };
    return answer;
  }

  /* ================= 辅助 ================= */
  function bearing(ra1, dec1, ra2, dec2) {
    var a1 = ra1 * 15 * A.RAD, d1 = dec1 * A.RAD, a2 = ra2 * 15 * A.RAD, d2 = dec2 * A.RAD;
    var y = Math.sin(a2 - a1) * Math.cos(d2);
    var x = Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(a2 - a1);
    return A.norm360(Math.atan2(y, x) * A.DEG);
  }
  function compassName(b) {
    var dirs = ['正北', '东北', '正东', '东南', '正南', '西南', '正西', '西北'];
    return dirs[Math.round(A.norm360(b) / 45) % 8];
  }
  function nearestBrightStar(ra, dec, excludeKey) {
    var best = null;
    CAT.stars.forEach(function (s) {
      if (s.k === excludeKey || s.mag > 2.6) return;
      var d = A.sep(ra, dec, s.ra, s.dec);
      if (d < 0.6) return;
      if (!best || d < best.d) best = { s: s, d: d };
    });
    return (best && best.d < 45) ? best : null;
  }
  function boundaryFor(entry, target, ep, ctx, cfg, dateNote) {
    var out = [];
    if (dateNote) out.push(dateNote);
    if (!entry && target) out.push('该目标未收录详解条目，以上仅包含星表级事实与实时星历；不做文学化或历史化延伸。');
    if (entry && (entry.freshness === 'annual' || entry.freshness === 'realtime')) {
      out.push('本条目的时效等级为「' + freshnessLabel(entry.freshness) + '」（更新于 ' + entry.updated + '），本地快照可能滞后，关键日期请以官方数据源复核。');
    }
    if (entry && entry.caution) out.push(entry.caution);
    if (entry && entry.status && entry.status !== 'established') {
      out.push('本条共识等级为「' + statusLabel(entry.status) + '」（核验 ' + (entry.verified || '2026-10') + '），请勿当作已确立结论引用。');
    }
    if (ep && ep.track.maxAlt < 12) out.push('该目标在当前纬度的最大高度仅 ' + deg(ep.track.maxAlt, cfg) + '，大气消光会显著削弱亮度，结论应下调。');
    if (ctx.bortle >= 7 && target && target.mag > 5) out.push('目标视星等 ' + target.mag + ' 暗于城市光害下的常见极限（约 4.5 等），在 ' + ctx.city + ' 市区大概率不可见，需转移至暗夜地点。');
    if (!out.length) return '';
    return out.join(' ');
  }

  function moonInterference(ep, tz) {
    var m = ep.moon;
    var level = m.illum > 0.75 ? '强' : m.illum > 0.45 ? '中' : m.illum > 0.15 ? '弱' : '几乎无';
    return level + '（' + m.name + ' ' + (m.illum * 100).toFixed(0) + '% · 角距 ' + ep.moonSep.toFixed(0) + '°）';
  }
  function freshnessLabel(f) {
    return { static: '长期稳定', annual: '年度表', ephemeris: '实时计算', realtime: '需在线更新' }[f] || f;
  }
  function toneLabel(t) {
    return { academic: '学术', warm: '亲和', poetic: '诗意', visual: '目视级', photo: '摄影级' }[t] || t;
  }
  function clamp(s, n) { return s && s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function uniq(v, i, a) { return a.indexOf(v) === i; }

  root.AgentCore = {
    AGENTS: AGENTS, ATTRS: ATTRS, CITIES: CITIES, AGENT_BY_ID: AGENT_BY_ID,
    defaultConfig: defaultConfig, buildAnswer: buildAnswer, resolveTargets: resolveTargets, preview: preview,
    setCustomAgents: setCustomAgents, ATTR_TARGET: ATTR_TARGET, statusLabel: statusLabel,
    findCity: findCity, searchPlaces: searchPlaces, nearestPlace: nearestPlace, ianaOffset: ianaOffset,
    /* 供检索规划层复用意图识别，避免两套判定逻辑分叉 */
    detectIntent: detectIntent, nameOf: nameOf, TRACE_ORDER: TRACE_ORDER,
    tzOf: tzOf, setMemory: setMemory, getMemory: getMemory, clearMemory: clearMemory, curate: curate,
    stats: stats,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
