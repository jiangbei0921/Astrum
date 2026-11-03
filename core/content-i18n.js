/* ASTRUM · 动态科研内容国际化（V1.10）
 *
 * 只处理「展示层」：
 *   - 论文标题/摘要优先显示中文译文，同时保留英文原文；
 *   - 作者、DOI、arXiv ID、原始链接、Evidence ID、evidenceRefs 永不翻译；
 *   - 译文按「原文内容哈希 + 目标语言 + 类型 + 版本」缓存；
 *   - Provider 不可用、超时或数值校验失败时回退英文原文；
 *   - 不把译文写回论文/证据对象，不参与 Muse 推理。
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var CACHE_MAX = 240;
  var FAIL_TTL = 60000;
  var NS = 'astrum.content-i18n.v1';
  var memFail = {};
  var inflight = {};
  var stats = { calls: 0, hits: 0, failures: 0, numbersRejected: 0 };

  function cacheKeyOf(text, kind, targetLang) {
    var s = String(text || '');
    var h = 0;
    for (var i = 0; i < s.length; i++) {
      h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    }
    return [VERSION, targetLang || 'zh', kind || 'text', String(h >>> 0), s.length].join('|');
  }

  function readAll() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(NS);
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function writeAll(obj) {
    try {
      var keys = Object.keys(obj);
      if (keys.length > CACHE_MAX) {
        keys.slice(0, keys.length - CACHE_MAX).forEach(function (k) { delete obj[k]; });
      }
      if (root.localStorage) root.localStorage.setItem(NS, JSON.stringify(obj));
    } catch (e) { /* 配额或隐私模式：缓存失败不影响展示 */ }
  }

  function get(text, kind, targetLang) {
    if (!text) return null;
    var all = readAll();
    var k = cacheKeyOf(text, kind, targetLang);
    var hit = all[k];
    return hit && hit.text ? hit : null;
  }

  function put(text, kind, targetLang, translated, meta) {
    if (!text || !translated) return;
    var all = readAll();
    var k = cacheKeyOf(text, kind, targetLang);
    all[k] = {
      text: String(translated),
      at: new Date().toISOString(),
      kind: kind || 'text',
      lang: targetLang || 'zh',
      sourceLength: String(text).length,
      provider: meta && meta.provider || ''
    };
    writeAll(all);
  }

  function currentLang() {
    return root.I18N && root.I18N.current ? root.I18N.current() : 'zh';
  }

  function translatable(text) {
    return /[A-Za-z]/.test(String(text || '')) && !/[\u4e00-\u9fff]/.test(String(text || ''));
  }

  function numbersOf(text) {
    return (String(text || '').match(/\d+(?:[.,]\d+)?/g) || []).map(function (n) {
      return n.replace(/,/g, '');
    });
  }

  /* 只校验“测量数值”：带单位的数、以及带小数点的数。
   * M13 / NGC 6205 / arXiv 2611.03570 这类标识编号允许在译文中按语言习惯省略，
   * 不能把它们当成必须逐字保留的测量值。 */
  function keyNumbersOf(text) {
    var s = String(text || '');
    var out = [], seen = {};
    function add(n) {
      n = String(n).replace(/,/g, '');
      if (!seen[n]) { seen[n] = 1; out.push(n); }
    }
    var unitRe = /(\d+(?:[.,]\d+)?)\s*(Gyr|Myr|yr|pc|kpc|Mpc|ly|mag|mas|deg|K|%|km|AU|dex|σ|sigma|s)\b/gi, m;
    while ((m = unitRe.exec(s)) !== null) add(m[1]);
    var decRe = /\b(\d+\.\d+)\b/g;
    while ((m = decRe.exec(s)) !== null) add(m[1]);
    return out;
  }

  function cleanTranslation(text) {
    return String(text || '')
      .replace(/^```[\s\S]*?```$/g, '')
      .replace(/^(中文译文|译文|翻译|中文标题|中文摘要)\s*[：:]\s*/i, '')
      .replace(/^原文\s*[：:]\s*/i, '')
      .replace(/^["“”']|["“”']$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function providerId(opts) {
    opts = opts || {};
    if (opts.providerId) return opts.providerId;
    var S = root.Sources;
    if (!S || !S.list) return '';
    var list = S.list().filter(function (x) {
      return x && (x.type === 'cloud' || x.type === 'device') &&
        (x.type === 'device' || x.hasKey) && x.status && x.status.state === 'ready';
    });
    return list.length ? list[0].id : '';
  }

  function translate(text, kind, opts) {
    opts = opts || {};
    var targetLang = opts.targetLang || 'zh';
    var source = String(text || '');
    if (!source) return Promise.resolve({ ok: false, code: 'empty' });
    if (targetLang !== 'zh' || !translatable(source)) {
      return Promise.resolve({ ok: true, text: source, skipped: true, code: 'noop' });
    }
    var cached = get(source, kind, targetLang);
    if (cached) {
      stats.hits++;
      return Promise.resolve({ ok: true, text: cached.text, cached: true, code: 'cache' });
    }
    var failKey = cacheKeyOf(source, kind, targetLang);
    var failedAt = memFail[failKey];
    if (failedAt && Date.now() - failedAt < FAIL_TTL) {
      return Promise.resolve({ ok: false, code: 'cooldown', fallback: true });
    }
    if (inflight[failKey]) return inflight[failKey];

    var generate = opts.generate;
    var id = '';
    if (!generate) {
      id = providerId(opts);
      if (!id || !root.Sources || typeof root.Sources.generate !== 'function') {
        return Promise.resolve({ ok: false, code: 'provider_unavailable', fallback: true });
      }
      generate = function (payload) { return root.Sources.generate(id, payload); };
    }

    stats.calls++;
    var payload = {
      task: 'translate',
      text: source.slice(0, 1600),
      kind: kind === 'title' ? 'title' : 'abstract',
      tone: 'academic',
      maxChars: kind === 'title' ? 160 : 760,
      timeoutMs: opts.timeoutMs || 15000
    };
    var p = Promise.resolve(generate(payload)).then(function (r) {
      var out = cleanTranslation(r && r.text);
      if (!out) throw new Error('empty translation');
      var a = keyNumbersOf(source), b = keyNumbersOf(out);
      var missing = a.filter(function (n) { return b.indexOf(n) < 0; });
      if (missing.length) {
        var err = new Error('translation lost numbers: ' + missing.slice(0, 3).join(','));
        err.code = 'number_mismatch';
        throw err;
      }
      put(source, kind, targetLang, out, { provider: id || 'injected' });
      delete memFail[failKey];
      return { ok: true, text: out, cached: false, provider: id || 'injected' };
    }).catch(function (e) {
      stats.failures++;
      if (e && e.code === 'number_mismatch') stats.numbersRejected++;
      memFail[failKey] = Date.now();
      return { ok: false, code: e && e.code || 'translate_failed', reason: String(e && e.message || e).slice(0, 120), fallback: true };
    }).then(function (r) {
      delete inflight[failKey];
      return r;
    });
    inflight[failKey] = p;
    return p;
  }

  function originalTitleOf(p) {
    return String((p && (p.originalTitle || p.title)) || '');
  }
  function originalAbstractOf(p) {
    return String((p && (p.originalAbstract || p.excerpt || p.summary || p.abstract)) || '');
  }

  /* 展示决策：中文模式优先译文，英文模式只用原文；原文永远可恢复。 */
  function displayOf(p, targetLang) {
    var lang = targetLang || currentLang();
    var ot = originalTitleOf(p);
    var oa = originalAbstractOf(p);
    var tt = lang === 'zh' ? get(ot, 'title', 'zh') : null;
    var ta = lang === 'zh' ? get(oa, 'abstract', 'zh') : null;
    return {
      lang: lang,
      originalTitle: ot,
      originalAbstract: oa,
      title: tt ? tt.text : ot,
      abstract: ta ? ta.text : oa,
      hasTitleTranslation: !!tt,
      hasAbstractTranslation: !!ta,
      showOriginalTitle: lang === 'zh' && !!tt,
      showOriginalAbstract: lang === 'zh'
    };
  }

  function ensurePaper(p, opts, cb) {
    opts = opts || {};
    var lang = opts.targetLang || currentLang();
    if (lang !== 'zh') { if (cb) cb(displayOf(p, lang)); return Promise.resolve(displayOf(p, lang)); }
    var ot = originalTitleOf(p), oa = originalAbstractOf(p);
    var jobs = [translate(ot, 'title', opts)];
    if (!opts.titleOnly && oa) jobs.push(translate(oa, 'abstract', opts));
    return Promise.all(jobs).then(function (list) {
      var d = displayOf(p, lang);
      if (list[0] && list[0].ok && !list[0].skipped) { d.title = list[0].text; d.hasTitleTranslation = true; d.showOriginalTitle = true; }
      if (list[1] && list[1].ok && !list[1].skipped) { d.abstract = list[1].text; d.hasAbstractTranslation = true; }
      if (cb) cb(d);
      return d;
    });
  }

  function el(tag, cls, text) {
    var doc = root.document;
    var n = doc.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }
  function t(s) { return root.I18N && root.I18N.t ? root.I18N.t(s) : s; }
  function safeHttp(u) {
    var s = String(u == null ? '' : u).trim();
    return /^https?:\/\/[^\s<>"']+$/i.test(s) ? s : '';
  }

  /* 统一论文卡片：arXiv 列表、检索结果、研究论文、证据卡都走这里。 */
  function renderCard(p, opts) {
    opts = opts || {};
    var doc = root.document;
    if (!doc) return null;
    var d = displayOf(p, opts.targetLang);
    var card = el('div', 'paper-card' + (opts.variant === 'frontier' ? ' fr-item' : ''));
    var titleBox = el('div', 'paper-head');
    var href = safeHttp(p && (p.url || p.sourceUrl || p.uri));
    var title = href
      ? el('a', 'paper-title research-link', d.title)
      : el('span', 'paper-title', d.title);
    if (href) { title.href = href; title.target = '_blank'; title.rel = 'noopener noreferrer'; }
    titleBox.appendChild(title);
    var original = el('div', 'paper-original', d.showOriginalTitle ? '原文：' + d.originalTitle : '');
    if (!d.showOriginalTitle) original.style.display = 'none';
    titleBox.appendChild(original);
    card.appendChild(titleBox);

    var meta = el('div', 'paper-meta');
    var bits = [];
    if (p && (p.source || p.host || p.cat)) bits.push(p.source || p.host || p.cat);
    if (p && (p.date || p.published || p.publishedAt)) bits.push(String(p.date || p.published || p.publishedAt).slice(0, 10));
    if (p && p.version === 'preprint') bits.push(t('预印本'));
    if (p && p.fulltextAvailable) bits.push(t('全文') + (p.pageCount ? ' · ' + p.pageCount + t('页') : ''));
    else if (p && p.abstractOnly) bits.push(t('仅摘要'));
    (p && p.authors || []).slice(0, 3).forEach(function (a) { bits.push(a); });
    if (p && p.doi) bits.push('DOI ' + p.doi);
    if (p && p.arxivId) bits.push('arXiv ' + p.arxivId);
    meta.textContent = bits.filter(Boolean).join(' · ');
    if (bits.length) card.appendChild(meta);
    if (p && p.fulltextAvailable && Array.isArray(p.sections) && p.sections.length) {
      card.appendChild(el('div', 'paper-meta', t('全文范围') + '：' + p.sections.slice(0, 4).join('、')));
    }

    var abs = el('p', 'paper-abstract', d.abstract);
    card.appendChild(abs);

    var origAbs = el('details', 'paper-original-abstract');
    origAbs.appendChild(el('summary', '', t('查看英文原文摘要')));
    origAbs.appendChild(el('div', 'paper-original-text', d.originalAbstract));
    if (d.showOriginalAbstract && d.hasAbstractTranslation) card.appendChild(origAbs);
    else origAbs.style.display = 'none';

    var acts = el('div', 'paper-actions');
    if (href) {
      var open = el('a', 'paper-action', t('查看原文'));
      open.href = href; open.target = '_blank'; open.rel = 'noopener noreferrer';
      acts.appendChild(open);
    }
    if (opts.onAsk) {
      var ask = el('button', 'paper-action', t('围绕它提问'));
      ask.type = 'button';
      ask.onclick = function (e) {
        if (e && e.stopPropagation) e.stopPropagation();
        opts.onAsk(p);
      };
      acts.appendChild(ask);
    }
    if (acts.children.length) card.appendChild(acts);
    card.onclick = function (e) {
      if (e && e.stopPropagation) e.stopPropagation();
    };

    function apply(x) {
      title.textContent = x.title;
      if (x.showOriginalTitle) {
        original.textContent = '原文：' + x.originalTitle;
        original.style.display = '';
      } else {
        original.style.display = 'none';
      }
      if (x.hasTitleTranslation) title.classList.add('translated');
      abs.textContent = x.abstract;
      if (x.hasAbstractTranslation) {
        origAbs.style.display = '';
        origAbs.querySelector('.paper-original-text').textContent = x.originalAbstract;
      }
    }
    if (d.lang === 'zh' && (!d.hasTitleTranslation || !d.hasAbstractTranslation)) {
      var run = function () {
        ensurePaper(p, opts, function (x) { apply(x); }).catch(function () { /* 回退原文 */ });
      };
      if (opts.deferTranslation) card._astrumTranslate = run;
      else run();
    }
    return card;
  }

  function clearCache() {
    try { if (root.localStorage) root.localStorage.removeItem(NS); } catch (e) {}
    memFail = {};
  }

  function statsOf() {
    return {
      calls: stats.calls,
      cacheHits: stats.hits,
      failures: stats.failures,
      numbersRejected: stats.numbersRejected
    };
  }

  root.AstroContentI18n = {
    translate: translate,
    displayOf: displayOf,
    ensurePaper: ensurePaper,
    renderCard: renderCard,
    get: get,
    put: put,
    cacheKeyOf: cacheKeyOf,
    clearCache: clearCache,
    stats: statsOf,
    translatable: translatable,
    numbersOf: numbersOf,
    keyNumbersOf: keyNumbersOf,
    version: VERSION
  };
})(typeof window !== 'undefined' ? window : globalThis);
