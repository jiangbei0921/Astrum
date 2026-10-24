/* ASTRUM · 检索规划与证据管理 v1.0
 *
 * 职责（对应审计文档 P0/P1/P2 各项）：
 *   1. 按问题类型生成检索计划，避免「所有问题用同一套检索」
 *   2. 多轮逐步深入：首轮结果 → 提取锚点 → 生成更具体的二轮检索词
 *   3. 结果去重、结构化排序、来源类型识别
 *   4. 证据编号与「子问题 → 证据」映射，供答案引用与校验
 *   5. 跨源数值冲突检测
 *   6. 引用可核验性与待核验标记
 *   7. 结构化检索日志（复用 answer.trace 的语义，独立成 researchLog）
 *
 * 设计原则：
 *   - 纯静态、零依赖，不引入向量检索或新服务
 *   - 简单问题不强行多轮（观测/器材/星图类完全不检索）
 *   - 拿不到英文检索词时如实降级为只查百科，不假装查过论文
 *   - 所有失败都记录原因，不静默吞掉
 */
(function (root) {
  'use strict';

  /* ============================================================
     常量
     ============================================================ */

  /* 天文任务与仪器名：用于从首轮结果里提取「更具体的锚点」 */
  var INSTRUMENTS = [
    'JWST', 'James Webb', 'Hubble', 'HST', 'EHT', 'Event Horizon Telescope',
    'ALMA', 'VLA', 'Chandra', 'XMM-Newton', 'Fermi', 'Gaia', 'Kepler', 'TESS',
    'LIGO', 'Virgo', 'KAGRA', 'VLT', 'Keck', 'Subaru', 'Gemini', 'FAST', 'SKA',
    'Planck', 'WMAP', 'COBE', 'Voyager', 'Cassini', 'Juno', 'Perseverance',
    'Curiosity', 'New Horizons', 'Rosetta', 'Hayabusa', 'Chang\'e', 'Tianwen',
    'SOHO', 'SDO', 'Parker Solar Probe', 'Solar Orbiter', 'IceCube',
    'DES', 'DESI', 'SDSS', '2MASS', 'WISE', 'Spitzer', 'Herschel', 'NuSTAR',
    'Swift', 'INTEGRAL', 'MeerKAT', 'LOFAR', 'Hinode', 'IRIS', 'InSight'
  ];

  /* 问题画像：不同类型问题用不同检索策略与子问题模板
   *   types      需要的来源类型
   *   subs       子问题模板（id / label / 英文检索后缀）
   *   maxRounds  最大轮数
   */
  var PROFILES = {
    /* 机制 / 原理：需要证据链 + 替代解释 */
    mechanism: {
      label: '机制与原理', types: ['encyclopedia', 'paper'], maxRounds: 2,
      subs: [
        { id: 'q1', label: '定义与基本性质', suffix: '' },
        { id: 'q2', label: '观测证据', suffix: 'observation evidence' },
        { id: 'q3', label: '物理机制', suffix: 'mechanism' },
        { id: 'q4', label: '替代解释与争议', suffix: 'alternative interpretation' }
      ]
    },
    /* 具体天体介绍 */
    object: {
      label: '天体资料', types: ['encyclopedia', 'paper', 'image'], maxRounds: 2,
      subs: [
        { id: 'q1', label: '基本资料', suffix: '' },
        { id: 'q2', label: '观测与测量', suffix: 'observation measurement' }
      ]
    },
    /* 天体参数（质量/距离/温度/年龄） */
    parameter: {
      label: '参数查询', types: ['paper', 'encyclopedia'], maxRounds: 2,
      subs: [
        { id: 'q1', label: '参数测量', suffix: 'mass distance measurement' },
        { id: 'q2', label: '测量方法与误差', suffix: 'measurement uncertainty method' }
      ]
    },
    /* 最新发现 / 时效性 */
    latest: {
      label: '最新进展', types: ['paper', 'encyclopedia'], maxRounds: 1, byDate: true,
      subs: [
        { id: 'q1', label: '最新结果', suffix: 'latest result' }
      ]
    },
    /* 天象事件 */
    event: {
      label: '天象事件', types: ['encyclopedia'], maxRounds: 1,
      subs: [{ id: 'q1', label: '成因与观测', suffix: '' }]
    },
    /* 无法归类：只做一轮，能查到就用，查不到就如实说 */
    generic: {
      label: '通用检索', types: ['encyclopedia', 'paper'], maxRounds: 1,
      subs: [{ id: 'q1', label: '相关资料', suffix: '' }]
    },
    /* 纯本地方案，不检索 */
    localOnly: { label: '本地计算', types: [], maxRounds: 0, subs: [] }
  };

  /* 意图 → 画像。观测/器材/星图/今晚看什么属于本地计算，不走检索。 */
  var INTENT_PROFILE = {
    'cosmos': 'mechanism',
    'knowledge-target': 'mechanism',
    'intro-target': 'object',
    'photo-target': 'object',
    'event': 'event',
    'nova': 'latest',
    'target': 'object',
    /* 以下为纯本地：星历可精算，检索既不必要也不更准 */
    'tonight': 'localOnly',
    'observe-target': 'localOnly',
    'gear': 'localOnly',
    'chart': 'localOnly',
    'system-view': 'localOnly',
    'unknown': 'generic'
  };

  /* 数值冲突检测：单位族与换算到基准单位的系数 */
  var UNIT_FAMILY = [
    /* mass → 以太阳质量为准 */
    { family: 'mass', base: 'Msun', pats: [
      /* 6.5e9 / 6.5E9 solar masses —— 论文摘要里最常见的写法 */
      { re: /(\d+(?:\.\d+)?)\s*[eE]\s*\+?(\d+)\s*(?:solar\s*mass(?:es)?|M\s*[☉⊙]|M_sun|太阳质量)/i, exp: true },
      { re: /(\d[\d.,]*)\s*(?:×|x|\*)\s*10\s*\^?\s*([0-9]+)\s*(?:solar\s*mass(?:es)?|M\s*[☉⊙]|M_sun|太阳质量)/i, exp: true },
      { re: /(\d[\d.,]*)\s*(?:billion|million|thousand)\s*(?:solar\s*mass(?:es)?|太阳质量)/i, word: true },
      { re: /(\d[\d.,]*)\s*(?:solar\s*mass(?:es)?|M\s*[☉⊙]|M_sun|太阳质量)/i, mul: 1 }
    ] },
    /* distance → 以秒差距为准 */
    { family: 'distance', base: 'pc', pats: [
      { re: /(\d+(?:\.\d+)?)\s*[eE]\s*\+?(\d+)\s*(kpc|Mpc|Gpc|pc)\b/, expDist: true },
      { re: /(\d[\d.,]*)\s*(kpc|Mpc|Gpc|pc|parsecs?|秒差距)/i, dist: true },
      { re: /(\d[\d.,]*)\s*(light[\s-]?years?|ly|光年)/i, ly: true }
    ] },
    /* age → 以年为准 */
    { family: 'age', base: 'yr', pats: [
      { re: /(\d+(?:\.\d+)?)\s*[eE]\s*\+?(\d+)\s*(Gyr|Myr|yr)\b/, expAge: true },
      { re: /(\d[\d.,]*)\s*(Gyr|Myr|kyr|years?|yrs?|亿年|万年|年)/i, age: true }
    ] },
    /* temperature → 以开尔文为准 */
    { family: 'temperature', base: 'K', pats: [
      { re: /(\d+(?:\.\d+)?)\s*[eE]\s*\+?(\d+)\s*K\b/, expTemp: true },
      { re: /(\d[\d.,]*)\s*(K|kelvin|开尔文|开)\b/i, temp: true }
    ] }
  ];

  /* ============================================================
     工具
     ============================================================ */
  function num(s) {
    var v = parseFloat(String(s).replace(/,/g, ''));
    return isFinite(v) ? v : null;
  }
  function isAscii(s) {
    return /^[\x00-\x7F]+$/.test(String(s || ''));
  }
  function normTitle(s) {
    return String(s || '').toLowerCase()
      .replace(/[\s\-_·:：，,。.、；;（）()「」【】\[\]"'’“”]/g, '')
      .slice(0, 40);
  }
  function normDoi(s) {
    return String(s || '').toLowerCase()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//, '')
      .replace(/^doi:\s*/, '').trim();
  }
  function trimSlash(u) {
    return String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
  function uniq(arr) {
    var s = {}, out = [];
    for (var i = 0; i < arr.length; i++) {
      var v = arr[i];
      if (v == null || v === '') continue;
      if (s[v]) continue;
      s[v] = 1;
      out.push(v);
    }
    return out;
  }
  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  /* 领域相关性信号。
   * 为什么需要：搜「Black hole」时维基百科会返回同名歌曲（Black Holes and Revelations
   * 专辑里的一首），词项覆盖率是 100%，靠覆盖率无法剔除。
   * 这里用内容信号（而不是域名权威分）判断：命中天文术语加分，
   * 命中「歌曲/专辑/电影/游戏」等非天体信号减分。 */
  var ASTRO_RE = /black\s*hole|galax|galaxies|stellar|\bstar\b|\bstars\b|nebula|quasar|pulsar|supernova|neutron\s*star|cosmolog|universe|telescope|observatory|observ|redshift|accretion|event\s*horizon|relativity|spectroscop|spectrum|magnitude|parsec|light[\s-]?year|exoplanet|asteroid|comet|meteor|天文|黑洞|星系|恒星|星云|类星体|脉冲星|超新星|中子星|宇宙|望远镜|观测|红移|吸积|视界|相对论|光谱|星等|秒差距|光年|系外行星|小行星|彗星|流星/i;
  var OFFTOPIC_RE = /歌曲|歌詞|歌词|專輯|专辑|電影|电影|遊戲|游戏|小說|小说|樂隊|乐队|電視劇|电视剧|動畫|动画|唱片|單曲|单曲|\bsong\b|\balbum\b|\bfilm\b|\bmovie\b|\bvideo\s*game\b|\bnovel\b|\bband\b|\bsingle\b|discography|\bcompany\b|\bcorporation\b|軟件|软件|应用商店/i;

  /* 返回 -2（明显非天文）/ -1（可能非天文）/ +1（天文）/ 0（无法判断，不惩罚） */
  function astroSignal(it) {
    var title = String(it.title || '');
    var body = String(it.excerpt || it.snippet || '').slice(0, 300);

    /* 情形一：标题带消歧义后缀，如「巨大黑洞（嘶欧歌曲）」「The Black Hole (film)」。
     * 这类条目虽然标题含天体名，但讲的是同名歌曲/电影，必须剔除。 */
    var disambig = /[（(][^）)]{0,24}(歌曲|專輯|专辑|電影|电影|遊戲|游戏|小說|小说|樂隊|乐队|單曲|单曲|唱片|劇集|剧集|song|album|film|movie|game|novel|band|single)[^）)]{0,24}[）)]/i;
    if (disambig.test(title)) return -2;

    var tOff = OFFTOPIC_RE.test(title);
    var bOffHits = (body.match(new RegExp(OFFTOPIC_RE.source, 'gi')) || []).length;
    var bAstroHits = (body.match(new RegExp(ASTRO_RE.source, 'gi')) || []).length;

    /* 情形二：标题像词条名，但正文全是音乐/影视语汇且无天文内容 */
    if (tOff && bAstroHits === 0) return -2;
    if (bOffHits > bAstroHits && bOffHits >= 2) return -1;

    /* 正文出现天文术语 → 相关 */
    if (bAstroHits > 0) return 1;
    /* 标题含天文词但正文没证据 → 不奖不罚，交给其他信号 */
    if (ASTRO_RE.test(title)) return 0;
    return 0;
  }

  /* 词项覆盖率：问题里的实词有多少出现在证据文本中
   * 用来替代原来「任一 2-gram 命中即通过」的过宽判定 */
  var STOP_WORDS = {
    '什么': 1, '为什么': 1, '怎么': 1, '如何': 1, '哪些': 1, '是否': 1, '可以': 1,
    '一个': 1, '这个': 1, '那个': 1, '我们': 1, '他们': 1, '以及': 1, '就是': 1,
    '的': 1, '了': 1, '吗': 1, '呢': 1, '是': 1, '在': 1, '有': 1, '和': 1, '与': 1,
    'the': 1, 'a': 1, 'an': 1, 'of': 1, 'is': 1, 'are': 1, 'what': 1, 'why': 1,
    'how': 1, 'does': 1, 'do': 1, 'and': 1, 'in': 1, 'on': 1, 'for': 1, 'to': 1
  };

  function termsOf(text) {
    var t = String(text || '').toLowerCase();
    var out = [];
    /* 中文按 2 字切片，英文按单词 */
    var cn = t.match(/[\u4e00-\u9fa5]{2,}/g) || [];
    cn.forEach(function (seg) {
      for (var i = 0; i + 2 <= seg.length; i++) {
        var g = seg.slice(i, i + 2);
        if (!STOP_WORDS[g]) out.push(g);
      }
    });
    var en = t.match(/[a-z][a-z0-9\-]{2,}/g) || [];
    en.forEach(function (w) { if (!STOP_WORDS[w]) out.push(w); });
    return uniq(out);
  }

  /* 问题词项：中文问题 + 英文实体名一起取。
   * 关键：检索结果多为英文，只用中文 2-gram 去算覆盖率会全部为 0，
   * 排序退化成「谁先返回谁在前」。把英文实体名并入词项才能跨语言匹配。 */
  function questionTerms(question, entityEn, entityCn) {
    var parts = [question];
    if (entityEn) parts.push(entityEn);
    if (entityCn && entityCn !== question) parts.push(entityCn);
    var t = uniq(termsOf(parts.join(' ')));
    /* 英文实体名拆词后单独加入（black hole → black, hole） */
    if (entityEn && isAscii(entityEn)) {
      termsOf(entityEn).forEach(function (w) { if (t.indexOf(w) < 0) t.push(w); });
    }
    return t;
  }

  function coverage(terms, text) {
    if (!terms.length) return 0;
    var hay = String(text || '').toLowerCase();
    var hit = 0;
    terms.forEach(function (t) { if (hay.indexOf(t) >= 0) hit++; });
    return hit / terms.length;
  }

  /* ============================================================
     1. 去重（三层：URL → DOI → 标题指纹）
     ============================================================ */
  function dedupe(items) {
    var byUrl = {}, byDoi = {}, byTitle = {}, out = [];
    (items || []).forEach(function (it) {
      var u = trimSlash(it.url);
      var d = normDoi(it.doi);
      var t = normTitle(it.title);
      var exist = null;
      if (u && byUrl[u]) exist = byUrl[u];
      else if (d && byDoi[d]) exist = byDoi[d];
      else if (t && byTitle[t]) exist = byTitle[t];

      if (exist) {
        /* 合并：保留信息更全的一条，来源计数 +1 */
        mergeInto(exist, it);
        return;
      }
      var rec = cloneItem(it);
      rec.sources = [it.endpoint || it.host || 'unknown'];
      out.push(rec);
      if (u) byUrl[u] = rec;
      if (d) byDoi[d] = rec;
      if (t) byTitle[t] = rec;
    });
    return out;
  }

  function cloneItem(it) {
    var o = {};
    for (var k in it) if (Object.prototype.hasOwnProperty.call(it, k)) o[k] = it[k];
    return o;
  }

  function mergeInto(keep, add) {
    if (!keep.sources) keep.sources = [keep.endpoint || keep.host || 'unknown'];
    var src = add.endpoint || add.host || 'unknown';
    if (keep.sources.indexOf(src) < 0) keep.sources.push(src);
    /* 文本更长的更可能完整 */
    if ((add.excerpt || '').length > (keep.excerpt || '').length) {
      keep.excerpt = add.excerpt;
      keep.snippet = add.snippet || keep.snippet;
      /* excerpt 换了来源，其 uncertainty 也要跟着走 */
      if (add.uncertainty) keep.uncertainty = add.uncertainty;
    }
    /* date 与 dateKind 必须一起拷贝：只拷 date 会让时间语义丢失，
     * 把「词条最后编辑」误标成「论文发表」。 */
    if (!keep.date && add.date) {
      keep.date = add.date;
      keep.dateKind = add.dateKind || null;
    }
    if (!keep.doi && add.doi) keep.doi = add.doi;
    if (!keep.version && add.version) keep.version = add.version;
    if (!keep.uncertainty && add.uncertainty) keep.uncertainty = add.uncertainty;
    if ((!keep.authors || !keep.authors.length) && add.authors) keep.authors = add.authors;
    /* 记录每个子问题都命中过 */
    if (add.subQuestion && add.subQuestion !== keep.subQuestion) {
      keep.crossSub = keep.crossSub || [];
      if (keep.crossSub.indexOf(add.subQuestion) < 0) keep.crossSub.push(add.subQuestion);
    }
  }

  /* ============================================================
     2. 排序
     不用单一「域名权威分」：由 类型匹配 + 时间完整 + 词项覆盖 + 多源印证 共同决定，
     并把各项写进 reliability 供展示。
     ============================================================ */
  var TYPE_WEIGHT = { encyclopedia: 3, paper: 3, database: 3, image: 1 };
  var TYPE_RANK = { encyclopedia: 2, paper: 2, database: 2, image: 1 };

  function scoreOf(it, wantTypes, terms) {
    var typeMatch = wantTypes && wantTypes.indexOf(it.sourceType) >= 0 ? 1 : 0;
    var hasDate = it.date ? 1 : 0;
    var hasUrl = it.url ? 1 : 0;
    var cov = coverage(terms, (it.title || '') + ' ' + (it.excerpt || '') + ' ' + (it.snippet || ''));
    var multi = (it.sources && it.sources.length > 1) ? 1 : 0;
    var astro = astroSignal(it);
    var score = typeMatch * 3 + hasDate * 1 + hasUrl * 0.5 + cov * 4 + multi * 1.5 + astro * 2.5;
    return {
      score: score,
      astro: astro,
      reliability: {
        typeMatch: !!typeMatch,
        hasDate: !!hasDate,
        hasUrl: !!hasUrl,
        termCoverage: Math.round(cov * 100) / 100,
        sourceCount: (it.sources && it.sources.length) || 1,
        astroFit: astro > 0 ? 'related' : (astro < 0 ? 'off-topic' : 'unknown')
      }
    };
  }

  function rank(items, opts) {
    opts = opts || {};
    var wantTypes = opts.types || null;
    var terms = opts.terms || [];
    var byDate = !!opts.byDate;
    items.forEach(function (it) {
      var r = scoreOf(it, wantTypes, terms);
      it.reliability = r.reliability;
      it._score = r.score;
      /* 标记证据质量缺陷，不隐藏 */
      it.flags = [];
      if (!it.url) it.flags.push('no-url');
      if (!it.date) it.flags.push('no-date');
      if (it.sourceType === 'paper' && (it.excerpt || '').length < 80) it.flags.push('abstract-only');
    });
    items.sort(function (a, b) {
      if (byDate) {
        /* 最新进展：先按时间倒序，无日期的排后面 */
        var ta = a.date ? Date.parse(a.date) : NaN;
        var tb = b.date ? Date.parse(b.date) : NaN;
        if (isFinite(ta) && isFinite(tb) && ta !== tb) return tb - ta;
        if (isFinite(ta) !== isFinite(tb)) return isFinite(ta) ? -1 : 1;
      }
      return b._score - a._score;
    });
    /* 相关性不足的直接剔除，而不是「没命中就全放行」。
     * 只按词项覆盖率判定：类型匹配不能单独作为保留理由，
     * 否则任何一篇论文都能混进来（审计里 P1-6 的根因）。
     * 另外剔除明显的非天文条目（同名歌曲/电影等）。 */
    var minCov = opts.minCoverage == null ? 0.18 : opts.minCoverage;
    var kept = items.filter(function (it) {
      /* 领域明显不符：标题就是歌曲/专辑/电影且无天文信号 */
      if (it.reliability && it.reliability.astroFit === 'off-topic') {
        it.flags = (it.flags || []).concat(['off-topic']);
        return false;
      }
      if (!terms.length) return true;
      return it.reliability.termCoverage >= minCov;
    });
    /* 全军覆没时保留前 2 条，避免「有结果却一条不显示」；
     * 这两条会被标为待核验，不会当作已证实证据。 */
    return kept.length ? kept : items.slice(0, 2);
  }

  /* ============================================================
     3. 问题分类与检索计划
     ============================================================ */
  function profileOf(intent, question) {
    var p = INTENT_PROFILE[intent] || 'generic';
    /* 关键词微调：即使意图是 cosmos，问到「最新/最近发现」也走 latest */
    if (/最新|最近|新发现|刚刚|今年|2025|2026|latest|recent/i.test(question) && p !== 'localOnly') {
      return 'latest';
    }
    /* 问到具体参数时走 parameter */
    if (/质量|半径|距离|温度|年龄|密度|亮度|多重|mass|radius|distance|temperature|age/i.test(question)
      && (p === 'mechanism' || p === 'object')) {
      return 'parameter';
    }
    return p;
  }

  /* 生成一个子问题的检索词。
   * 关键：论文类端点只认英文，拿不到英文词时不能硬查，否则会返回无关结果。 */
  function buildQuery(sub, baseEn, baseCn, types) {
    var suffix = sub.suffix || '';
    var wantsPaper = types.indexOf('paper') >= 0;
    if (isAscii(baseEn) && baseEn) {
      return (baseEn + (suffix ? ' ' + suffix : '')).trim();
    }
    /* 没有英文词：中文只能查百科 */
    if (!wantsPaper || types.indexOf('encyclopedia') >= 0) {
      return (baseCn + (suffix ? ' ' + suffix : '')).trim();
    }
    return '';
  }

  function plan(question, opts) {
    opts = opts || {};
    var q = String(question || '').trim();
    var intent = opts.intent || 'unknown';
    var profileKey = profileOf(intent, q);
    var profile = PROFILES[profileKey] || PROFILES.generic;
    var entityName = opts.entityName || '';
    var baseCn = entityName || q;
    var baseEn = opts.entityEn || '';

    /* 纯本地问题：明确不检索 */
    if (profileKey === 'localOnly') {
      return {
        profile: profileKey, label: profile.label, types: [], subs: [], queries: [],
        skip: true, skipReason: '该问题由本地星历精算，检索既不必要也不更准',
        byDate: false, maxRounds: 0
      };
    }

    var subs = profile.subs.map(function (s) {
      var qy = buildQuery(s, baseEn, baseCn, profile.types);
      return { id: s.id, label: s.label, query: qy, types: profile.types };
    }).filter(function (s) { return s.query; });

    return {
      profile: profileKey,
      label: profile.label,
      types: profile.types,
      baseCn: baseCn,
      baseEn: baseEn,
      byDate: !!profile.byDate,
      maxRounds: profile.maxRounds || 1,
      subs: subs,
      queries: uniq(subs.map(function (s) { return s.query; })),
      skip: false,
      /* 记录降级：没有英文词时论文端点查不了 */
      degraded: profile.types.indexOf('paper') >= 0 && !isAscii(baseEn),
      degradedReason: (profile.types.indexOf('paper') >= 0 && !isAscii(baseEn))
        ? '未取到英文检索词，本轮只检索百科' : ''
    };
  }

  /* ============================================================
     4. 锚点提取（驱动第二轮）
     ============================================================ */
  function extractAnchors(items, plan1) {
    var anchors = [];
    var text = items.map(function (it) { return (it.title || '') + ' ' + (it.excerpt || ''); }).join(' ');

    /* 已知任务/仪器 */
    INSTRUMENTS.forEach(function (ins) {
      var re = new RegExp('\\b' + ins.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
      if (re.test(text)) anchors.push(ins);
    });
    /* 年份 */
    var years = text.match(/\b(19|20)\d{2}\b/g) || [];
    years.slice(0, 3).forEach(function (y) { anchors.push(y); });
    /* 作者（来自 structured 字段，比从标题里猜更可靠） */
    var authors = [];
    items.forEach(function (it) { (it.authors || []).forEach(function (a) { authors.push(a); }); });
    var authorCount = {};
    authors.forEach(function (a) { authorCount[a] = (authorCount[a] || 0) + 1; });
    Object.keys(authorCount).sort(function (a, b) { return authorCount[b] - authorCount[a]; })
      .slice(0, 2).forEach(function (a) {
        /* 只取姓氏，避免把全名拼进检索词 */
        var surname = String(a).split(/[\s,]+/).pop();
        if (surname && surname.length > 2) anchors.push(surname);
      });

    return uniq(anchors).slice(0, 4);
  }

  function buildRound2Queries(plan1, anchors, covered) {
    if (!anchors.length) return [];
    var base = plan1.baseEn && isAscii(plan1.baseEn) ? plan1.baseEn : '';
    if (!base) return [];
    /* 只为尚未覆盖的子问题生成更具体的检索词 */
    var gaps = plan1.subs.filter(function (s) { return !covered[s.id]; });
    return gaps.slice(0, 2).map(function (s) {
      var anchor = anchors[0];
      return (base + ' ' + anchor + (s.suffix ? ' ' + s.suffix : '')).trim();
    }).filter(Boolean);
  }

  /* ============================================================
     5. 多轮执行
     ============================================================ */
  var LOG = [];          /* 最近若干次检索记录，供 __astrum.researchLog() 查看 */
  var LOG_MAX = 10;

  function defaultSearchFn(queries, opts) {
    if (!root.Sources || !root.Sources.searchMany) {
      return Promise.resolve({ items: [], calls: 0, errors: [{ name: 'sources', msg: '检索模块不可用' }], truncated: false });
    }
    return root.Sources.searchMany(queries, opts);
  }

  /* run(question, opts) → Promise<result>
   * opts:
   *   intent       问题意图（来自 agents.detectIntent）
   *   entityName   实体中文名
   *   entityEn     实体英文名
   *   searchFn     注入检索函数（测试用）
   *   maxRounds / maxCalls / budgetMs   覆盖默认预算
   */
  function run(question, opts) {
    opts = opts || {};
    var budget = {
      maxRounds: opts.maxRounds != null ? opts.maxRounds : 2,
      maxCalls: opts.maxCalls != null ? opts.maxCalls : 6,
      budgetMs: opts.budgetMs != null ? opts.budgetMs : 12000
    };
    var searchFn = opts.searchFn || defaultSearchFn;
    var t0 = nowMs();

    var p = plan(question, opts);
    var TERMS = questionTerms(String(question || ''), opts.entityEn || '', opts.entityName || '');
    var rounds = [];
    var allItems = [];
    var errors = [];
    var stopReason = '';
    var covered = {};

    var rec = {
      question: String(question || ''),
      intent: opts.intent || 'unknown',
      plan: p,
      rounds: rounds,
      budget: budget,
      stopReason: '',
      evidence: [],
      conflicts: [],
      citations: null,
      terms: TERMS,
      /* Scholar 智能体的配置：证据门槛与展示深度，由 synthesize/toSections 消费 */
      scholar: opts.scholar || null,
      ms: 0
    };

    if (p.skip) {
      rec.stopReason = 'skip';
      rec.ms = Math.round(nowMs() - t0);
      pushLog(rec);
      return Promise.resolve(finish(rec));
    }
    if (!p.queries.length) {
      rec.stopReason = 'noQuery';
      rec.ms = Math.round(nowMs() - t0);
      pushLog(rec);
      return Promise.resolve(finish(rec));
    }

    var callsUsed = 0;

    function doRound(roundNo, queries, subMap) {
      if (roundNo > Math.min(budget.maxRounds, p.maxRounds)) {
        stopReason = 'maxRounds';
        return Promise.resolve();
      }
      var left = budget.maxCalls - callsUsed;
      if (left <= 0) { stopReason = 'maxCalls'; return Promise.resolve(); }
      if (nowMs() - t0 > budget.budgetMs) { stopReason = 'budget'; return Promise.resolve(); }

      var qs = queries.slice(0, Math.min(left, 4));
      var r0 = nowMs();
      return searchFn(qs, {
        types: p.types,
        budgetMs: Math.max(1500, budget.budgetMs - (nowMs() - t0)),
        maxCalls: left
      }).then(function (res) {
        callsUsed += (res.calls || 0);
        (res.errors || []).forEach(function (e) { errors.push(e); });
        var got = res.items || [];

        /* 打上子问题标记：按查询词反查它属于哪个子问题 */
        got.forEach(function (it) {
          var owner = subMap[it.query] || (p.subs[0] && p.subs[0].id) || 'q1';
          it.subQuestion = owner;
        });
        allItems = allItems.concat(got);

        /* 本轮统计 */
        var before = allItems.length;
        var dd = dedupe(allItems);
        var added = dd.length;             /* 去重后总量 */
        rounds.push({
          round: roundNo,
          queries: qs,
          raw: got.length,
          calls: res.calls || 0,
          errors: (res.errors || []).length,
          truncated: !!res.truncated,
          ms: Math.round(nowMs() - r0)
        });

        /* 覆盖度：哪些子问题已有证据 */
        var ranked = rank(dd, { types: p.types, terms: TERMS, byDate: p.byDate });
        ranked.forEach(function (it) {
          var ok = it.reliability && (
            it.reliability.termCoverage >= 0.2 ||
            (it.reliability.typeMatch && it.reliability.termCoverage >= 0.12)
          );
          if (ok && it.subQuestion) covered[it.subQuestion] = true;
        });

        /* 停止条件 */
        var allCovered = p.subs.every(function (s) { return covered[s.id]; });
        if (allCovered) { stopReason = 'covered'; return; }

        /* 本轮几乎没有新增有效内容 → 不再继续 */
        var prevCount = rounds.length > 1 ? rounds[rounds.length - 2].raw : 0;
        if (roundNo >= 1 && got.length <= 1 && added <= (prevCount || 1)) {
          stopReason = 'noNew';
          return;
        }

        if (roundNo >= Math.min(budget.maxRounds, p.maxRounds)) {
          stopReason = 'maxRounds';
          return;
        }
        if (callsUsed >= budget.maxCalls) { stopReason = 'maxCalls'; return; }
        if (nowMs() - t0 > budget.budgetMs) { stopReason = 'budget'; return; }

        /* 第二轮：用锚点生成更具体的检索词 */
        var anchors = extractAnchors(got, p);
        var q2 = buildRound2Queries(p, anchors, covered);
        if (!q2.length) {
          stopReason = anchors.length ? 'noGap' : 'noAnchor';
          return;
        }
        rec.anchors = anchors;
        var subMap2 = {};
        p.subs.forEach(function (s) { if (!covered[s.id]) subMap2[q2[0]] = s.id; });
        q2.forEach(function (qq, i) {
          var gapSub = p.subs.filter(function (s) { return !covered[s.id]; })[i];
          if (gapSub) subMap2[qq] = gapSub.id;
        });
        return doRound(roundNo + 1, q2, subMap2);
      });
    }

    var subMap1 = {};
    p.subs.forEach(function (s) { subMap1[s.query] = s.id; });

    return doRound(1, p.queries, subMap1).then(function () {
      rec.stopReason = stopReason || (allItems.length ? 'done' : 'empty');
      rec.ms = Math.round(nowMs() - t0);
      rec.calls = callsUsed;
      rec.errors = errors;
      rec._items = allItems;          /* 交给 finish 做去重与编号 */
      pushLog(rec);
      return finish(rec);
    });
  }

  /* 收尾：去重、排序、编号、冲突检测、引用核验数据 */
  function finish(rec) {
    var raw = rec._items || [];
    var ranked = rec.plan.skip ? [] : rank(dedupe(raw), {
      types: rec.plan.types,
      terms: rec.terms || termsOf(rec.question),
      byDate: rec.plan.byDate
    });
    /* 编号 */
    ranked.forEach(function (it, i) {
      it.id = 'E' + (i + 1);
      it.status = statusOf(it);
    });
    rec.evidence = ranked;
    rec.conflicts = detectConflicts(ranked);
    /* 覆盖度总结 */
    var cov = {};
    rec.plan.subs.forEach(function (s) {
      cov[s.id] = { label: s.label, count: ranked.filter(function (e) { return e.subQuestion === s.id; }).length };
    });
    rec.coverage = cov;
    delete rec._items;               /* 不留在返回值里，避免循环引用 */
    return rec;
  }

  /* 证据质量判定：只有「有 URL + 有日期 + 词项相关」才视为可支持；
   * 其余标为 pending（待核验），不假装已证实。 */
  function statusOf(it) {
    var r = it.reliability || {};
    if (it.flags && it.flags.indexOf('no-url') >= 0) return 'pending';
    if (r.termCoverage != null && r.termCoverage < 0.12) return 'pending';
    if (r.sourceCount > 1) return 'supported';
    if (r.typeMatch && r.hasDate) return 'supported';
    if (r.typeMatch) return 'supported';
    return 'pending';
  }

  /* ============================================================
     6. 数值冲突检测
     ============================================================ */
  /* 从文本中抽取「数值 + 物理量」。
   * 必须按位置去重：同一条 "6.5e9 solar masses" 会被「科学计数法」和
   * 「数字+单位」两个模式各匹配一次（后者会错误地抓到 "9 solar masses"），
   * 若不去重就会把 6.5e9 和 9 当成两个冲突值。 */
  function parseNumbers(text) {
    var t = String(text || '');
    var hits = [];
    UNIT_FAMILY.forEach(function (fam) {
      fam.pats.forEach(function (p) {
        var re = new RegExp(p.re.source, 'gi');
        var m;
        while ((m = re.exec(t)) !== null) {
          var v = num(m[1]);
          if (v == null) continue;
          var val = v;
          if (p.exp && m[2]) val = v * Math.pow(10, parseInt(m[2], 10));
          if (p.expDist || p.expAge || p.expTemp) {
            val = v * Math.pow(10, parseInt(m[2], 10));
            var eu = String(m[3] || '').toLowerCase();
            if (p.expDist) {
              if (eu === 'kpc') val = val * 1e3;
              else if (eu === 'mpc') val = val * 1e6;
              else if (eu === 'gpc') val = val * 1e9;
            } else if (p.expAge) {
              if (eu === 'gyr') val = val * 1e9;
              else if (eu === 'myr') val = val * 1e6;
            }
          }
          if (p.word) {
            var w = /billion/i.test(m[0]) ? 1e9 : /million/i.test(m[0]) ? 1e6 : 1e3;
            val = v * w;
          }
          if (p.dist) {
            var u = String(m[2]).toLowerCase();
            if (u === 'kpc') val = v * 1e3;
            else if (u === 'mpc') val = v * 1e6;
            else if (u === 'gpc') val = v * 1e9;
          }
          if (p.ly) val = v * 0.306601;                 /* 光年 → 秒差距 */
          if (p.age) {
            var au = String(m[2]).toLowerCase();
            if (au === 'gyr') val = v * 1e9;
            else if (au === 'myr') val = v * 1e6;
            else if (au === 'kyr') val = v * 1e3;
            else if (/亿年/.test(m[2])) val = v * 1e8;
            else if (/万年/.test(m[2])) val = v * 1e4;
          }
          if (!(val > 0) || !isFinite(val)) continue;
          hits.push({
            start: m.index, end: m.index + m[0].length,
            family: fam.family, value: val, raw: m[0].trim()
          });
        }
      });
    });
    /* 按匹配长度倒序（更具体的模式优先），再按位置去重 */
    hits.sort(function (a, b) { return (b.end - b.start) - (a.end - a.start); });
    var taken = [];
    var out = [];
    hits.forEach(function (h) {
      var overlap = taken.some(function (r) { return h.start < r.end && h.end > r.start; });
      if (overlap) return;
      taken.push(h);
      out.push({ family: h.family, value: h.value, raw: h.raw });
    });
    return out;
  }

  function detectConflicts(evidence) {
    var out = [];
    var bySub = {};
    evidence.forEach(function (it) {
      var k = it.subQuestion || 'q1';
      bySub[k] = bySub[k] || [];
      bySub[k].push(it);
    });
    Object.keys(bySub).forEach(function (k) {
      var group = bySub[k];
      if (group.length < 2) return;
      var famVals = {};
      group.forEach(function (it) {
        var nums = parseNumbers((it.title || '') + ' ' + (it.excerpt || ''));
        nums.forEach(function (n) {
          famVals[n.family] = famVals[n.family] || [];
          famVals[n.family].push({ value: n.value, raw: n.raw, id: it.id, title: it.title, host: it.host, url: it.url });
        });
      });
      Object.keys(famVals).forEach(function (fam) {
        var arr = famVals[fam];
        if (arr.length < 2) return;
        var vals = arr.map(function (x) { return x.value; });
        var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
        if (min <= 0) return;
        var rel = (max - min) / min;
        if (rel <= 0.1) return;    /* 差异 ≤10% 视为一致 */
        /* 同一版本重复不算冲突：按 id 去重 */
        var ids = {};
        arr.forEach(function (x) { ids[x.id] = 1; });
        if (Object.keys(ids).length < 2) return;
        out.push({
          subQuestion: k, family: fam,
          spread: Math.round(rel * 100),
          values: arr.slice(0, 4)
        });
      });
    });
    return out;
  }

  /* ============================================================
     7. 引用核验
     ============================================================ */
  /* 核验内容：
   *   ① 本轮证据里有多少条真正有出处（URL/DOI）
   *   ② 答案引用的本地知识库来源，是否能在本轮检索中找到印证
   *   ③ 哪些结论只能算「待核验」
   */
  function verifyCitations(answer, evidence, opts) {
    opts = opts || {};
    var ev = evidence || [];
    var withUrl = ev.filter(function (e) { return e.url; });
    var withDate = ev.filter(function (e) { return e.date; });
    var supported = ev.filter(function (e) { return e.status === 'supported'; });
    var pending = ev.filter(function (e) { return e.status === 'pending'; });

    /* 本地知识库声明来源 vs 本轮证据 */
    var localSources = opts.localSources || [];
    var corroborated = [], unattested = [];
    localSources.forEach(function (s) {
      var name = (s && s.n) || '';
      var host = '';
      try { host = s.u ? new URL(s.u).hostname.replace(/^www\./, '') : ''; } catch (e) { host = ''; }
      var hit = ev.some(function (e) {
        var eh = String(e.host || '').replace(/^www\./, '');
        if (host && eh && (eh === host || eh.indexOf(host) >= 0 || host.indexOf(eh) >= 0)) return true;
        if (name && (String(e.title || '').indexOf(name) >= 0)) return true;
        return false;
      });
      (hit ? corroborated : unattested).push({ name: name, url: (s && s.u) || '' });
    });

    var ok = ev.length > 0 && withUrl.length > 0;
    return {
      total: ev.length,
      withUrl: withUrl.length,
      withDate: withDate.length,
      supported: supported.length,
      pending: pending.length,
      corroborated: corroborated,
      unattested: unattested,
      verdict: !ev.length ? 'no-evidence'
        : (!withUrl.length ? 'no-source-url'
          : (pending.length ? 'partially-verified' : 'verified')),
      note: !ev.length
        ? '本轮未取得可用检索证据，结论只依据本地知识库。'
        : (pending.length
          ? '有 ' + pending.length + ' 条证据缺少出处或与问题重合度不足，已标为待核验。'
          : '本轮证据均带出处，可追溯到原始链接。')
    };
  }

  /* ============================================================
     8. 转为答案章节（供 app.js 直接插入）
     ============================================================ */
  /* ============================================================
     8. 证据综合（把证据组织成「回答」而不是「链接列表」）
     ============================================================ */

  /* 设计取舍（重要）：
   * 离线环境下没有可信的自然语言生成能力，硬拼句子就等于编造。
   * 因此这里只做「可被证据直接支持的组织」：
   *   - 覆盖情况：哪些子问题有证据、哪些没有
   *   - 关键摘录：直接引用原文（不改写），带编号
   *   - 时间跨度：区分发表/发布/编辑三种时间语义
   *   - 分歧与缺口：冲突项、待核验项、未覆盖项
   * 需要成段的自然语言综合时，走云端模型（见 app.js 的 cloud 分支），
   * 并且只允许它使用本轮证据编号。
   */
  function synthesize(rec, opts) {
    opts = opts || {};
    var ev = (rec && rec.evidence) || [];
    var subs = (rec && rec.plan && rec.plan.subs) || [];
    if (!ev.length) {
      return {
        available: false,
        lead: '本轮未取得可用检索证据，以下结论不由检索资料支持。',
        groups: [],
        gaps: subs.map(function (s) { return s.label; }),
        timeSpan: null,
        limits: ['本轮未取得可用检索证据'],
        counts: { evidence: 0, supported: 0, pending: 0, conflicts: 0 }
      };
    }

    /* Scholar 的配置在这里生效，否则这个智能体就只是挂个名字：
     *   evidence=strict    只采纳「可溯源」证据进关键摘录，其余留待核验
     *   evidence=balanced  可溯源优先，待核验也列出并标注
     *   evidence=open      全部列出
     *   depth=brief/deep   每组展示 1 / 4 条（默认 2 条） */
    var sc = (rec && rec.scholar) || {};
    var perGroup = sc.depth === 'brief' ? 1 : sc.depth === 'deep' ? 4 : 2;
    var strictGate = sc.evidence === 'strict';

    /* 按子问题分组，每组取前 N 条作为「关键摘录」 */
    var groups = [];
    subs.forEach(function (s) {
      var list = ev.filter(function (e) { return e.subQuestion === s.id; });
      if (!list.length) return;
      var pool = strictGate
        ? list.filter(function (e) { return e.status === 'supported'; })
        : list;
      var pts = pool.slice(0, perGroup);
      groups.push({
        id: s.id,
        label: s.label,
        count: list.length,
        supported: list.filter(function (e) { return e.status === 'supported'; }).length,
        /* 严格门槛下一条都不采纳时，要明确说出来，而不是静默省略 */
        strictEmpty: strictGate && pts.length === 0,
        points: pts.map(function (e) {
          return {
            id: e.id,
            /* 摘录不改写：直接取原文，避免引入不存在的事实 */
            quote: String(e.excerpt || e.snippet || e.title || '').replace(/\s+/g, ' ').slice(0, 220),
            title: e.title,
            host: e.host,
            date: e.date,
            dateKind: e.dateKind || null,
            sourceType: e.sourceType,
            version: e.version || '',
            uncertainty: e.uncertainty || '',
            status: e.status,
            url: e.url
          };
        })
      });
    });

    /* 未覆盖的子问题 */
    var gaps = subs.filter(function (s) {
      return !ev.some(function (e) { return e.subQuestion === s.id; });
    }).map(function (s) { return s.label; });

    /* 时间跨度：按 dateKind 分别统计，不混为一谈 */
    var byKind = { published: [], released: [], edited: [] };
    ev.forEach(function (e) {
      var k = e.dateKind;
      if (k && byKind[k] && e.date) {
        var t = Date.parse(e.date);
        if (isFinite(t)) byKind[k].push(t);
      }
    });
    var timeSpan = null;
    var kinds = Object.keys(byKind).filter(function (k) { return byKind[k].length; });
    if (kinds.length) {
      timeSpan = { newest: null, oldest: null, kinds: {} };
      kinds.forEach(function (k) {
        var arr = byKind[k].sort(function (a, b) { return a - b; });
        timeSpan.kinds[k] = {
          count: arr.length,
          oldest: new Date(arr[0]).toISOString().slice(0, 10),
          newest: new Date(arr[arr.length - 1]).toISOString().slice(0, 10)
        };
      });
      var all = kinds.reduce(function (acc, k) { return acc.concat(byKind[k]); }, []);
      if (all.length) {
        all.sort(function (a, b) { return a - b; });
        timeSpan.oldest = new Date(all[0]).toISOString().slice(0, 10);
        timeSpan.newest = new Date(all[all.length - 1]).toISOString().slice(0, 10);
      }
    }

    var supported = ev.filter(function (e) { return e.status === 'supported'; }).length;
    var pending = ev.length - supported;
    var conflicts = (rec.conflicts || []).length;

    /* 限制说明：只描述证据集合本身的性质，不下结论 */
    var limits = [];
    if (pending) limits.push(pending + ' 条证据缺少出处或与问题重合度不足，已标为待核验');
    if (conflicts) limits.push(conflicts + ' 组数值在不同来源间存在分歧，未作取舍');
    if (gaps.length) limits.push('以下方面本轮未检索到证据：' + gaps.join('、'));
    var preprints = ev.filter(function (e) { return e.version === 'preprint'; }).length;
    if (preprints) limits.push(preprints + ' 条为预印本，尚未经同行评议正式发表');
    if (timeSpan && timeSpan.newest) {
      var yrs = new Date(timeSpan.newest).getFullYear();
      if (yrs < 2024) limits.push('最新一条证据为 ' + timeSpan.newest.slice(0, 4) + ' 年，可能不是该问题的最新进展');
    }

    /* lead：一句陈述「这批证据能覆盖到什么程度」，不替用户下科学结论 */
    var coveredCount = groups.length;
    var lead = '本轮检索得到 ' + ev.length + ' 条证据，覆盖 ' + coveredCount + '/' + subs.length +
      ' 个方面' + (supported ? '，其中 ' + supported + ' 条可溯源' : '') +
      (conflicts ? '，有 ' + conflicts + ' 组数值存在分歧' : '') + '。';

    return {
      available: true,
      lead: lead,
      groups: groups,
      gaps: gaps,
      timeSpan: timeSpan,
      limits: limits,
      counts: { evidence: ev.length, supported: supported, pending: pending, conflicts: conflicts }
    };
  }

  var DATE_KIND_LABEL = { published: '论文发表', released: '机构发布', edited: '词条编辑' };

  /* 综合结果 → 章节 */
  function synthesisSection(rec) {
    var s = synthesize(rec);
    if (!s.available) {
      return {
        kind: 'synthesis', available: false,
        lead: '本轮未取得可用检索证据，以下内容不由检索资料支持。',
        groups: [], gaps: s.gaps, limits: s.limits, timeSpan: null, counts: s.counts
      };
    }
    return {
      kind: 'synthesis', available: true,
      lead: s.lead,
      groups: s.groups,
      gaps: s.gaps,
      timeSpan: s.timeSpan,
      timeSpanLabels: DATE_KIND_LABEL,
      limits: s.limits,
      counts: s.counts
    };
  }

  function toSections(rec, opts) {
    opts = opts || {};
    var secs = [];
    if (!rec) return secs;

    if (rec.plan && rec.plan.skip) {
      return secs;   /* 本地计算类问题不展示检索章节 */
    }

    /* 综合层先出现：先讲清「证据覆盖了什么、缺什么」，再列原始证据 */
    secs.push(synthesisSection(rec));

    var ev = rec.evidence || [];
    if (!ev.length) {
      secs.push({
        kind: 'web', title: '检索结果',
        degraded: true, items: [],
        note: rec.errors && rec.errors.length
          ? '未取得可用结果：' + summarizeErrors(rec.errors)
          : '本轮未检索到相关资料。结论仅依据本地知识库与星历。',
        research: { stopReason: rec.stopReason, calls: rec.calls || 0 }
      });
      return secs;
    }

    /* 按子问题分组，让读者看到证据链对应关系 */
    var groups = [];
    var bySub = {};
    ev.forEach(function (it) {
      var k = it.subQuestion || 'q1';
      if (!bySub[k]) {
        var sub = (rec.plan.subs || []).filter(function (s) { return s.id === k; })[0];
        bySub[k] = { id: k, label: sub ? sub.label : '相关资料', items: [] };
        groups.push(bySub[k]);
      }
      bySub[k].items.push(it);
    });

    groups.forEach(function (g) {
      secs.push({
        kind: 'web',
        title: '检索证据 · ' + g.label,
        provider: providerLine(rec),
        ms: rec.ms,
        items: g.items.map(toViewItem),
        research: {
          subQuestion: g.id,
          stopReason: rec.stopReason,
          calls: rec.calls || 0,
          rounds: (rec.rounds || []).length
        }
      });
    });

    /* 冲突提示 */
    if (rec.conflicts && rec.conflicts.length) {
      secs.push({
        kind: 'conflict', title: '来源之间的数值差异', items: rec.conflicts.map(function (c) {
          return {
            family: familyLabel(c.family),
            spread: c.spread,
            values: c.values.map(function (v) {
              return { raw: v.raw, title: v.title, host: v.host, url: v.url, id: v.id };
            })
          };
        }),
        note: '这些数值来自不同来源，差异超过 10%。此处并列呈现，不擅自选取其一；请按原始链接核对测量方法与样本。'
      });
    }

    return secs;
  }

  function familyLabel(f) {
    return ({ mass: '质量', distance: '距离', age: '年龄', temperature: '温度' })[f] || f;
  }

  function toViewItem(it) {
    return {
      id: it.id,
      title: it.title,
      snippet: it.snippet,
      excerpt: it.excerpt || it.snippet,
      url: it.url,
      host: it.host,
      date: it.date || '',
      dateKind: it.dateKind || null,
      dateKindLabel: DATE_KIND_LABEL[it.dateKind] || '',
      sourceType: it.sourceType || '',
      authors: it.authors || [],
      doi: it.doi || '',
      version: it.version || '',
      uncertainty: it.uncertainty || '',
      subQuestion: it.subQuestion,
      status: it.status,
      flags: it.flags || [],
      reliability: it.reliability || {},
      extra: it.extra || {}
    };
  }

  function providerLine(rec) {
    var eps = {};
    (rec.evidence || []).forEach(function (e) { (e.sources || []).forEach(function (s) { eps[s] = 1; }); });
    var names = Object.keys(eps).map(function (id) {
      var ep = (root.Sources && root.Sources.endpointById) ? root.Sources.endpointById(id) : null;
      return ep ? ep.name : id;
    });
    return names.length ? names.join(' + ') : '';
  }

  function summarizeErrors(errors) {
    var kinds = {};
    (errors || []).forEach(function (e) {
      var k = e.kind || e.msg || 'unknown';
      kinds[k] = (kinds[k] || 0) + 1;
    });
    return Object.keys(kinds).map(function (k) { return k + '×' + kinds[k]; }).join('、');
  }

  /* ============================================================
     9. 日志
     ============================================================ */
  function pushLog(rec) {
    LOG.push({
      question: rec.question,
      intent: rec.intent,
      profile: rec.plan && rec.plan.profile,
      skip: !!(rec.plan && rec.plan.skip),
      skipReason: (rec.plan && rec.plan.skipReason) || '',
      rounds: (rec.rounds || []).map(function (r) {
        return { round: r.round, queries: r.queries, raw: r.raw, calls: r.calls, errors: r.errors, ms: r.ms };
      }),
      anchors: rec.anchors || [],
      stopReason: rec.stopReason,
      calls: rec.calls || 0,
      evidence: (rec.evidence || []).length,
      supported: (rec.evidence || []).filter(function (e) { return e.status === 'supported'; }).length,
      conflicts: (rec.conflicts || []).length,
      errors: rec.errors || [],
      ms: rec.ms || 0
    });
    if (LOG.length > LOG_MAX) LOG.shift();
    /* 控制台也留一份（开发者可直接看） */
    try {
      if (root.__ASTRUM_RESEARCH_DEBUG && typeof console !== 'undefined' && console.debug) {
        console.debug('[research]', LOG[LOG.length - 1]);
      }
    } catch (e) { /* 忽略 */ }
  }

  function log() {
    return LOG.slice();
  }

  /* ============================================================
     10. 导出
     ============================================================ */
  root.Research = {
    plan: plan,
    run: run,
    dedupe: dedupe,
    rank: rank,
    termsOf: termsOf,
    questionTerms: questionTerms,
    coverage: coverage,
    detectConflicts: detectConflicts,
    parseNumbers: parseNumbers,
    verifyCitations: verifyCitations,
    synthesize: synthesize,
    synthesisSection: synthesisSection,
    DATE_KIND_LABEL: DATE_KIND_LABEL,
    toSections: toSections,
    extractAnchors: extractAnchors,
    profileOf: profileOf,
    log: log,
    clearLog: function () { LOG.length = 0; },
    PROFILES: PROFILES,
    INSTRUMENTS: INSTRUMENTS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
