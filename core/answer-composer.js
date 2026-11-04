/* ASTRUM · 最终回答整合（V1.10）
 *
 * 目标：把任务结果、Agent 输出、证据与限制条件组织成一份可阅读的最终回答，
 * 而不是把各段输出直接拼接。
 *
 * 边界：
 *   - 不改 ask()/buildAnswer()/toSections() 的既有输出契约；
 *   - 不新增 Agent、不改 Evidence/Claim/evidenceRefs 数据关系；
 *   - 只整理已有 sections，并生成回答结构、质量检查与限制声明；
 *   - 任何内容都必须来自已有事实/证据，不补造科研结论。
 */
(function (root) {
  'use strict';

  var VERSION = '1.1.0';

  var MODE_LABEL = {
    A: '简单事实回答',
    B: '原理解释',
    C: '科研数据回答',
    D: '多论文对比',
    E: '综合科研回答'
  };

  var RESEARCH_TERMS = /论文|文献|研究|测量|观测|证据|争议|一致性|不同结果|最新|进展|JWST|韦伯|arXiv|DOI/i;
  var COMPARE_TERMS = /对比|比较|不同论文|不同研究|是否一致|一致性|差异|争议|冲突|分别/;
  var PARAM_TERMS = /距离|质量|年龄|温度|半径|直径|金属丰度|视差|自行|光度|不确定|误差|测量值/;
  var WHY_TERMS = /为什么|为何|原理|机制|意味着|含义|怎么形成|如何形成/;

  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '')
      .trim();
  }
  function clip(s, n) {
    s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n) + '…' : s;
  }
  function ends(s) {
    s = String(s || '').trim();
    if (!s) return '';
    return /[。！？.!?]$/.test(s) ? s : s + '。';
  }
  function uniq(list, keyFn) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) {
      var k = keyFn ? keyFn(x) : String(x);
      if (!k || seen[k]) return;
      seen[k] = 1;
      out.push(x);
    });
    return out;
  }

  /* V1.13：模型答案是最终答案本身，不再被模板段落包住。
   * 只在明显是自然段时才切分；单个段落原样保留。 */
  function textParagraphs(text) {
    var s = String(text == null ? '' : text).replace(/\r\n/g, '\n').trim();
    if (!s) return [];
    var blocks = s.split(/\n\s*\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (blocks.length > 1) return blocks;
    var lines = s.split(/\n+/).map(function (x) { return x.trim(); }).filter(Boolean);
    return lines.length ? lines : [s];
  }

  /* 文本重叠度：用于判断旧 verdict 是否已经在模型首段里完整说过。
   * 不参与科研判断，只用于避免页面重复。 */
  function overlap(a, b) {
    var x = norm(a), y = norm(b);
    if (!x || !y) return 0;
    if (x === y) return 1;
    var short = x.length <= y.length ? x : y;
    var long = x.length <= y.length ? y : x;
    var best = 0;
    for (var i = 0; i < short.length; i++) {
      for (var j = i + best + 1; j <= short.length; j++) {
        var sub = short.slice(i, j);
        if (long.indexOf(sub) >= 0) best = j - i;
        else break;
      }
    }
    return best / Math.max(1, short.length);
  }

  function paperKeyOf(p) {
    var doi = String((p && (p.doi || (p.content && p.content.doi))) || '').toLowerCase()
      .replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '').trim();
    if (doi) return 'doi:' + doi;
    var arx = String((p && (p.arxivId || (p.content && p.content.arxivId))) || '')
      .toLowerCase().replace(/^arxiv:\s*/, '').replace(/\.pdf$/, '').trim();
    if (arx) return 'arxiv:' + arx;
    var title = String((p && p.title) || '').toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
    return title ? 'title:' + title : '';
  }

  function verificationOf(ev) {
    if (!ev) return null;
    if (ev.verification && ev.verification.state) return ev.verification;
    if (root.AstroEvidence && typeof root.AstroEvidence.verify === 'function') {
      try { return root.AstroEvidence.verify(ev, null); } catch (e) { return null; }
    }
    return null;
  }

  function paperVerificationOf(p, evidence) {
    if (p && p.verification && p.verification.state) return p.verification;
    var key = paperKeyOf(p);
    var hit = null;
    (evidence || []).forEach(function (ev) {
      if (hit || !ev || ev.sourceType !== 'paper') return;
      if (paperKeyOf({ title: ev.title, doi: ev.content && ev.content.doi, arxivId: ev.content && ev.content.arxivId }) === key) hit = ev;
    });
    return hit ? verificationOf(hit) : null;
  }

  /* 结构化综合 brief：Muse 唯一输入。
   * 只整理已有 Evidence/Claim/Report，不补造结论；同一论文只算一个来源。 */
  function brief(answer, opts) {
    opts = opts || {};
    var rep = (answer && answer.research) || {};
    var rawEvidence = Array.isArray(rep.evidence) ? rep.evidence.slice() : [];
    var deduped = rawEvidence;
    var duplicates = 0;
    if (root.AstroEvidence && typeof root.AstroEvidence.dedupe === 'function') {
      try {
        var dd = root.AstroEvidence.dedupe(rawEvidence);
        deduped = dd.evidence || rawEvidence;
        duplicates = (dd.duplicates || []).length;
      } catch (e) { /* 去重失败不阻断综合 */ }
    }
    var papers = [];
    var seenPaper = {};
    (rep.papers || []).forEach(function (p) {
      if (!p) return;
      var k = paperKeyOf(p);
      if (!k || seenPaper[k]) return;
      seenPaper[k] = 1;
      papers.push({
        key: k,
        title: p.title || '',
        authors: (p.authors || []).slice(0, 6),
        date: p.date || '',
        doi: p.doi || '',
        arxivId: p.arxivId || '',
        url: p.url || '',
        venue: p.venue || '',
        abstractOnly: p.abstractOnly !== false,
        fulltextAvailable: !!p.fulltextAvailable,
        excerpt: String(p.excerpt || '').slice(0, 320),
        verification: paperVerificationOf(p, deduped),
        evidenceIds: (p.evidenceIds || []).slice()
      });
    });
    /* 提示词证据池：论文优先（含 DOI/arXiv/作者/摘要），其他来源补在后面。
     * 编号 E1..En 与最终引用审计使用同一份清单。 */
    var promptEvidence = [];
    var seenEv = {};
    function pushPrompt(item) {
      if (!item) return;
      var key = item.key || paperKeyOf(item) || String(item.title || '');
      if (!key || seenEv[key]) return;
      seenEv[key] = 1;
      promptEvidence.push({
        id: 'E' + (promptEvidence.length + 1),
        evidenceId: item.evidenceId || '',
        title: item.title || '',
        authors: item.authors || [],
        host: item.host || '',
        date: item.date || '',
        sourceType: item.sourceType || 'paper',
        abstractOnly: !!item.abstractOnly,
        status: item.abstractOnly ? 'abstract-only' : 'supported',
        excerpt: String(item.excerpt || '').slice(0, 300),
        doi: item.doi || '',
        arxivId: item.arxivId || '',
        url: item.url || '',
        verification: item.verification || null
      });
    }
    papers.forEach(function (p) {
      pushPrompt({
        key: p.key, evidenceId: p.evidenceIds[0] || '', title: p.title,
        host: p.doi ? 'DOI' : (p.arxivId ? 'arXiv' : ''),
        date: p.date, sourceType: 'paper', abstractOnly: p.abstractOnly,
        excerpt: p.excerpt, doi: p.doi, arxivId: p.arxivId, url: p.url,
        verification: p.verification
      });
    });
    deduped.forEach(function (ev) {
      if (!ev || ev.sourceType === 'paper') return;
      pushPrompt({
        evidenceId: ev.evidenceId, title: ev.title, host: ev.provenance && ev.provenance.host || '',
        date: ev.publishedAt || '', sourceType: ev.sourceType || '',
        abstractOnly: !!ev.abstractOnly,
        excerpt: (ev.content && (ev.content.excerpt || ev.content.snippet)) || '',
        url: ev.uri || '', verification: verificationOf(ev)
      });
    });
    var idMap = {};
    promptEvidence.forEach(function (e) {
      if (e.evidenceId) idMap[e.evidenceId] = e.id;
    });
    var conclusions = (rep.conclusions || []).slice(0, 8).map(function (c) {
      return {
        claimId: c.claimId, text: c.text, level: c.level, verdict: c.verdict,
        rule: c.rule || null,
        /* 只把内部 evidenceId 映射成用户可见的 [E#]；不把内部编号写进答案。 */
        evidenceRefs: (c.evidenceRefs || []).slice(0, 6).map(function (ref) { return idMap[ref] || ''; }).filter(Boolean),
        evidenceScope: c.evidenceScope || ''
      };
    });
    var conflicts = (rep.conflicts || []).map(function (c) {
      return {
        family: c.family || '', unit: c.unit || '', spread: c.spread,
        values: (c.values || []).map(function (v) {
          return { raw: v.raw, title: v.title || '', host: v.host || '', url: v.url || '' };
        })
      };
    });
    var differences = (rep.differences || []).slice(0, 6).map(function (d) {
      return { family: d.family || '', spread: d.spread, reason: d.reason || '' };
    });
    var gaps = uniq((rep.gaps || []).concat(rep.limitations || [])).slice(0, 8);
    var mode = modeFor(answer, opts);
    return {
      question: String(opts.question || (answer && answer.query) || ''),
      mode: mode,
      modeLabel: MODE_LABEL[mode],
      evidence: promptEvidence,
      evidenceBefore: rawEvidence.length,
      evidenceAfter: deduped.length,
      duplicates: duplicates,
      papers: papers,
      conclusions: conclusions,
      conflicts: conflicts,
      differences: differences,
      gaps: gaps,
      limitations: (rep.limitations || []).slice(0, 6),
      coverage: rep.coverage || null,
      paperStats: rep.paperStats || null,
      failures: (rep.gaps || []).filter(function (g) {
        return /失败|不可用|未获得|缺失|未提供|仅获得摘要/.test(String(g || ''));
      }).slice(0, 5),
      sources: (rep.sources || []).slice(0, 8),
      verified: promptEvidence.filter(function (e) { return e.verification && e.verification.state === 'verified'; }).length,
      unverified: promptEvidence.filter(function (e) { return !e.verification || e.verification.state !== 'verified'; }).length
    };
  }

  var SIMPLE_INTENT_KEEP = {
    'observe-target': 1, 'photo-target': 1, tonight: 1, event: 1,
    'system-view': 1, gear: 1, 'gear-fit': 1, chart: 1
  };

  /* 简单问题只留答案与必要证据：不主动扩展观测建议、追问和背景清单。
   * 只删除既有章节，不改写内容，也不隐藏证据。 */
  function trimSimple(answer, mode) {
    if (!answer || (mode !== 'A' && mode !== 'B')) return { removed: 0 };
    var intent = String(answer.intent || '');
    if (SIMPLE_INTENT_KEEP[intent]) return { removed: 0 };
    var before = (answer.sections || []).length;
    answer.sections = (answer.sections || []).filter(function (s) {
      if (!s) return false;
      if (s.kind === 'observe' || s.kind === 'followup') return false;
      if (s.kind === 'visual' || s.kind === 'mapref') return false;
      if (mode === 'A' && s.kind === 'list' &&
        /knowledge-target|intro-target|unknown|cosmos|nova|helios/.test(intent)) return false;
      return true;
    });
    return { removed: before - answer.sections.length };
  }

  function limitItemsOf(answer) {
    return scientificLimits(answer);
  }

  function mentionsLimit(text) {
    return /限制|未获取|仅摘要|无法|不确定|尚缺|未完成|不足|尚未/.test(String(text || ''));
  }

  /* 检索/工具的执行状态不属于答案正文；科研限制只保留与结论范围有关的部分。 */
  var OPERATIONAL_GAP = /未获得 SIMBAD|未提供 FITS|全文失败原因|fulltext_unavailable|未获得论文元数据|SIMBAD 数据缺失|外部搜索|网络|HTTP|timeout|超时|不可达|未提供 FITS 观测|获取\/解析失败/;
  function scientificLimits(answer) {
    var rep = (answer && answer.research) || {};
    return uniq((rep.gaps || []).concat(rep.limitations || [])).filter(function (s) {
      return !OPERATIONAL_GAP.test(String(s || ''));
    }).slice(0, 3);
  }

  function hasResearch(answer) {
    var rep = answer && answer.research;
    return !!(rep && (rep.reportId || (rep.papers && rep.papers.length) ||
      (rep.conclusions && rep.conclusions.length) || (rep.evidence && rep.evidence.length)));
  }

  function modeFor(answer, opts) {
    opts = opts || {};
    var q = String((opts.question || (answer && answer.query) || ''));
    var rep = answer && answer.research;
    var papers = rep && rep.papers ? rep.papers.length : 0;
    if (opts.mode && MODE_LABEL[opts.mode]) return opts.mode;
    if (COMPARE_TERMS.test(q) && papers > 1) return 'D';
    if (hasResearch(answer) || RESEARCH_TERMS.test(q) || (rep && rep.conclusions && rep.conclusions.length)) {
      if (papers > 1 && COMPARE_TERMS.test(q)) return 'D';
      if (papers > 0 || (rep && rep.evidence && rep.evidence.length)) return 'E';
    }
    /* 数据/参数问题：问的是测量值本身或不确定度。
     * 普通“M31 距离地球多远”仍按简单事实（A）回答，避免把单一结论包装成参数报告；
     * 只有明确问测量结果、误差或多组数值时才进入 C。 */
    /* 单个已知参数（如“太阳的质量是多少”）仍按简单事实回答；
     * 只有明确问测量结果、误差或多组数值时才进入 C。 */
    if (/年龄|金属丰度|视差|自行|光度|测量结果|测量值|不同测量|误差|不确定|测量方法|参数/.test(q)) return 'C';
    if (WHY_TERMS.test(q)) return 'B';
    return 'A';
  }

  function evidenceIdsOf(answer) {
    var ids = {};
    var rep = answer && answer.research;
    (rep && rep.evidence || []).forEach(function (e) {
      if (e && e.evidenceId) ids[e.evidenceId] = e;
    });
    return ids;
  }

  /* ---------- 去重 ---------- */
  function dedupeSections(answer) {
    var removed = 0;
    var before = (answer.sections || []).length;
    var seenVerdict = false;
    answer.sections = (answer.sections || []).filter(function (s) {
      if (!s) { removed++; return false; }
      if (s.kind === 'verdict') {
        if (seenVerdict) { removed++; return false; }
        seenVerdict = true;
      }
      return true;
    });
    answer.sections.forEach(function (s) {
      if (s && Array.isArray(s.items) && s.kind !== 'followup') {
        var b = s.items.length;
        s.items = uniq(s.items, function (it) {
          var k = norm((it && (it.label || it.name || it.title || it.k || it.text || it.value) || '') + '|' +
            norm(it && (it.value || it.text || it.meta) || ''));
          return k;
        });
        removed += b - s.items.length;
      }
      if (s && s.kind === 'followup' && Array.isArray(s.items)) {
        var fb = s.items.length;
        s.items = uniq(s.items, function (x) { return norm(x); });
        removed += fb - s.items.length;
      }
    });
    return { removed: removed, before: before, after: (answer.sections || []).length };
  }

  /* ---------- 证据合并 ---------- */
  function mergeEvidence(answer) {
    var sections = (answer.sections || []);
    var group = null;
    var out = [];
    sections.forEach(function (s) {
      if (!s) return;
      if (s.kind !== 'evidence') { out.push(s); return; }
      if (!group) {
        group = {
          kind: 'evidence', title: s.title || '依据', items: [], sources: [],
          para: '', status: s.status, register: s.register, _seen: {}, _srcSeen: {}
        };
        out.push(group);
      }
      if (!group.title && s.title) group.title = s.title;
      (s.items || []).forEach(function (it) {
        var k = norm((it && (it.label || '')) + '|' + (it && (it.value || '')));
        if (!k || group._seen[k]) return;
        group._seen[k] = 1;
        group.items.push(it);
      });
      if (s.para && !group.para) group.para = s.para;
      (s.sources || []).forEach(function (src) {
        if (!src) return;
        var sk = norm(src.n || src.u || '');
        if (!sk || group._srcSeen[sk]) return;
        group._srcSeen[sk] = 1;
        group.sources.push(src);
      });
    });
    answer.sections = out.map(function (s) {
      if (s && s._seen) delete s._seen;
      if (s && s._srcSeen) delete s._srcSeen;
      return s;
    });
  }

  /* ---------- 科研叙述 ---------- */
  function researchParagraphs(answer, mode) {
    var rep = answer.research || {};
    var paras = [];
    var verified = (rep.conclusions || []).filter(function (c) { return c && c.level === 'verified'; });
    var inferred = (rep.conclusions || []).filter(function (c) { return c && c.level === 'inferred'; });
    var summary = String(rep.summary || '');
    var lead = '', leadFromAbstract = false;
    if (summary && !/证据不足，未形成/i.test(summary)) lead = summary;
    else if (verified.length) lead = verified[0].text;
    else if (inferred.length) { lead = inferred[0].text; leadFromAbstract = true; }
    if (lead) {
      paras.push({
        role: 'conclusion',
        text: (leadFromAbstract ? '论文摘要提示（摘要级，未读全文）：' : '核心结论：') + ends(clip(lead, 240))
      });
    } else {
      paras.push({
        role: 'conclusion',
        text: '核心结论：现有证据不足以形成可验证的科研结论；本轮只给出可核对的事实、论文来源与仍缺失的信息。'
      });
    }

    var papers = rep.papers || [];
    if (papers.length) {
      var abs = papers.filter(function (p) { return p.abstractOnly; }).length;
      paras.push({
        role: 'evidence',
        text: abs
          ? '现有证据以论文摘要为主；摘要级结果只作有限判断，不当作已证实结论。'
          : '现有证据包含论文全文片段；结论仍按原始来源限定适用范围。'
      });
    } else {
      paras.push({ role: 'evidence', text: '在证据来源上，本轮未获得可核验的论文；结论只覆盖已有本地事实与计算。' });
    }

    var chosen = (verified.length ? verified : inferred).slice(0, 2);
    if (chosen.length) {
      var findings = chosen.map(function (c) { return clip(c.text, 140); }).join('；');
      paras.push({
        role: 'analysis',
        text: (verified.length ? '现有证据支持的要点是：' : '论文摘要报告（摘要级，未读全文）：') + ends(findings)
      });
    }

    var conflicts = rep.conflicts || [];
    var differences = rep.differences || [];
    if (conflicts.length) {
      paras.push({
        role: 'conflict',
        text: '需要注意的是，不同来源在同一物理量上存在数值差异（' +
          conflicts.slice(0, 3).map(function (c) { return (c.family || '数值') + (c.spread == null ? '' : ' ' + c.spread + '%'); }).join('、') +
          '）。这些差异未强行合并，需按原始论文核对测量方法与样本。'
      });
    } else if (differences.length) {
      paras.push({
        role: 'conflict',
        text: '需要注意的是，部分数值存在差异但不足以判定为冲突（' +
          differences.slice(0, 3).map(function (c) { return c.family || '数值'; }).join('、') + '），已保留原始值。'
      });
    }

    var limits = scientificLimits(answer);
    if (limits.length) {
      paras.push({
        role: 'limitation',
        text: '综合来看，本次回答的限制是：' + ends(limits.join('；'))
      });
    } else if (!papers.length) {
      paras.push({ role: 'limitation', text: '综合来看，当前证据不足，尚不能形成可核验的科研结论。' });
    }
    return { kind: 'analysis', title: '综合研判 · ' + MODE_LABEL[mode], mode: mode, paragraphs: paras };
  }

  /* ---------- 结构整理 ---------- */
  var ORDER = {
    verdict: 1, analysis: 2, evidence: 3, list: 4, synthesis: 5, web: 6, citation: 7,
    conflict: 8, compare: 9, boundary: 10, gap: 11, sources: 12, review: 13, followup: 20
  };

  function reorder(answer) {
    var sections = (answer.sections || []).slice();
    var ordered = [];
    var rest = [];
    sections.forEach(function (s) {
      if (!s) return;
      if (ORDER[s.kind]) ordered.push(s);
      else rest.push(s);
    });
    ordered.sort(function (a, b) { return (ORDER[a.kind] || 99) - (ORDER[b.kind] || 99); });
    var follow = ordered.filter(function (s) { return s.kind === 'followup'; });
    var noFollow = ordered.filter(function (s) { return s.kind !== 'followup'; });
    answer.sections = noFollow.concat(rest).concat(follow);
  }

  /* ---------- 质量检查 ---------- */
  function numbersOf(text) {
    return String(text || '').match(/[0-9]+(?:\.[0-9]+)?/g) || [];
  }
  function poolText(answer, extra) {
    var rep = answer.research || {};
    var bits = [extra || ''];
    (answer.sections || []).forEach(function (s) {
      if (s.kind === 'evidence') {
        (s.items || []).forEach(function (it) { bits.push((it.label || '') + ' ' + (it.value || '')); });
      }
      if (s.kind === 'web') {
        (s.items || []).forEach(function (it) { bits.push((it.title || '') + ' ' + (it.excerpt || it.snippet || '') + ' ' + (it.doi || '')); });
      }
    });
    (rep.parameters || []).forEach(function (p) { bits.push((p.label || '') + ' ' + (p.value || '')); });
    (rep.conclusions || []).forEach(function (c) { bits.push(c.text || ''); });
    (rep.evidence || []).forEach(function (e) {
      var c = e.content || {};
      bits.push((e.title || '') + ' ' + (c.excerpt || e.excerpt || c.snippet || e.snippet || '') + ' ' + (c.uncertainty || ''));
    });
    return bits.join(' ');
  }

  function citationPoolOf(answer) {
    var meta = (answer && answer.meta) || {};
    if (Array.isArray(meta.promptEvidence) && meta.promptEvidence.length) return meta.promptEvidence;
    var rep = (answer && answer.research) || {};
    var pool = (rep.evidence || []).slice();
    (rep.papers || []).forEach(function (p) {
      pool.push({
        id: 'paper:' + String(p.title || ''),
        title: p.title, uri: p.url, sourceType: 'paper',
        content: { doi: p.doi, arxivId: p.arxivId, authors: p.authors },
        publishedAt: p.date, verification: p.verification || null
      });
    });
    return pool;
  }

  function audit(answer, opts) {
    opts = opts || {};
    var issues = [];
    var rep = answer.research || null;
    var ids = evidenceIdsOf(answer);
    var refs = 0, badRefs = [];

    (rep && rep.conclusions || []).forEach(function (c) {
      (c.evidenceRefs || []).forEach(function (eid) {
        refs++;
        if (!ids[eid]) badRefs.push(eid);
      });
    });
    if (badRefs.length) {
      issues.push({ kind: 'bad-ref', count: badRefs.length, detail: badRefs.slice(0, 5).join('、') });
    }

    var pool = poolText(answer, '');
    var texts = [];
    (answer.sections || []).forEach(function (s) {
      if (s.kind === 'analysis') (s.paragraphs || []).forEach(function (p) { texts.push(p.text || ''); });
      if (s.kind === 'model') texts.push(s.text || '');
    });
    if (opts.modelText) texts.push(opts.modelText);

    /* V1.13：编号、DOI、arXiv、URL 与本轮证据交叉核对。
     * 模型生成了一个 DOI 不等于该引用真实存在。 */
    var citationAudit = null;
    if (root.AstroEvidence && typeof root.AstroEvidence.auditCitations === 'function') {
      try {
        citationAudit = root.AstroEvidence.auditCitations(texts.join('\n'), citationPoolOf(answer));
      } catch (e) { citationAudit = null; }
    }
    if (citationAudit) {
      answer.meta = answer.meta || {};
      answer.meta.citationAudit = citationAudit;
      if (citationAudit.unknownRefs.length) {
        issues.push({
          kind: 'citation-unknown', count: citationAudit.unknownRefs.length,
          detail: citationAudit.unknownRefs.slice(0, 5).join('、')
        });
      }
      if (citationAudit.unmatchedDois.length) {
        issues.push({
          kind: 'citation-doi', count: citationAudit.unmatchedDois.length,
          detail: citationAudit.unmatchedDois.slice(0, 3).join('、')
        });
      }
      if (citationAudit.unmatchedArxivIds.length) {
        issues.push({
          kind: 'citation-arxiv', count: citationAudit.unmatchedArxivIds.length,
          detail: citationAudit.unmatchedArxivIds.slice(0, 3).join('、')
        });
      }
      if (citationAudit.unmatchedUrls.length) {
        issues.push({
          kind: 'citation-url', count: citationAudit.unmatchedUrls.length,
          detail: citationAudit.unmatchedUrls.slice(0, 3).join('、')
        });
      }
    }

    var unsupported = [];
    texts.forEach(function (t) {
      if (/doi|arxiv|证据编号|ev_/i.test(t)) return;
      var re = /[0-9]+(?:\.[0-9]+)?/g, m;
      while ((m = re.exec(String(t || ''))) !== null) {
        var n = m[0];
        if (unsupported.indexOf(n) >= 0) continue;
        /* 编号不是测量值：M31、NGC 224、DESI DR2、2MASS 等 */
        var before = String(t).slice(Math.max(0, m.index - 2), m.index);
        var after = String(t).slice(m.index + n.length, m.index + n.length + 2);
        if (/[A-Za-z]$/.test(before) || /^[A-Za-z]/.test(after)) continue;
        var v = parseFloat(n);
        if (v >= 1900 && v <= 2100) continue;
        if ((v <= 24 && n.indexOf('.') < 0) || v === 60 || v === 100 || v === 360 || v === 365 || v === 1000) continue;
        if (pool.indexOf(n) >= 0) continue;
        unsupported.push(n);
      }
    });
    if (unsupported.length) {
      issues.push({ kind: 'unsupported-number', count: unsupported.length, detail: unsupported.slice(0, 5).join('、') });
    }

    var certainty = 0;
    texts.forEach(function (t) {
      if (/一定|必然|毫无疑问|完全证实|已经证明|确凿无疑/.test(t)) certainty++;
    });
    if (certainty) issues.push({ kind: 'certainty-without-evidence', count: certainty, detail: '出现无证据支持的确定性措辞' });

    var hasBoundary = (answer.sections || []).some(function (s) { return s.kind === 'boundary' || s.kind === 'gap'; });
    var boundaryLimits = scientificLimits(answer);
    if (boundaryLimits.length && !hasBoundary) {
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '限制与未完成项：' + boundaryLimits.join('；') +
          '。以上结论不把缺失数据当作事实。'
      });
      issues.push({ kind: 'missing-boundary', count: 1, detail: '已补充限制声明' });
    }

    var duplicate = (answer.sections || []).filter(function (s) { return s.kind === 'verdict'; }).length > 1;
    if (duplicate) issues.push({ kind: 'duplicate-verdict', count: 1, detail: '重复结论段' });

    var citationOk = !citationAudit || (!citationAudit.unknownRefs.length &&
      !citationAudit.unmatchedDois.length && !citationAudit.unmatchedArxivIds.length);
    return {
      refs: refs,
      badRefs: badRefs,
      unsupportedNumbers: unsupported,
      certainty: certainty,
      citationAudit: citationAudit,
      issues: issues,
      passed: badRefs.length === 0 && unsupported.length === 0 && certainty === 0 && !duplicate && citationOk
    };
  }

  function finalize(answer, opts) {
    opts = opts || {};
    if (!answer || typeof answer !== 'object') return answer;
    if (answer._v110Finalized && !opts.modelText) return answer;
    var mode = modeFor(answer, opts);
    var dedupe = dedupeSections(answer);
    mergeEvidence(answer);
    /* 已有真实论文证据时，不能再把“系统内置知识未收录”当作结论首句；
     * 以免同一答案同时出现“没有依据”和论文结论。 */
    var repPre = answer.research || {};
    if ((repPre.papers || []).length) {
      answer.sections = (answer.sections || []).filter(function (s) {
        return !(s && s.kind === 'verdict' &&
          /系统内置知识.{0,8}(未|没有|暂未)|尚未完成外部科研资料核验/.test(String(s.head || '')));
      });
    }

    var modelParas = opts.modelText ? textParagraphs(opts.modelText) : [];
    if (hasResearch(answer) || modelParas.length) {
      var analysis = null;
      if (modelParas.length) {
        analysis = {
          kind: 'analysis', title: '综合研判 · ' + MODE_LABEL[mode], mode: mode,
          paragraphs: modelParas.map(function (p) { return { role: 'model', text: p }; })
        };
        if (hasResearch(answer)) {
          var limits = limitItemsOf(answer);
          if (limits.length && !mentionsLimit(opts.modelText)) {
            analysis.paragraphs.push({
              role: 'limitation',
              text: '限制与未完成项：' + limits.join('；') + '。以上判断不把缺失数据当作事实。'
            });
          }
        }
        analysis.source = opts.modelSource || null;

        /* 模型答案负责完整论述；本地 verdict 只在不重复时才保留。
         * A/B 直接以模型文本为答案；C–E 仅在 verdict 简短且不与首段重复时作轻量结论区。 */
        if (mode === 'A' || mode === 'B') {
          answer.sections = (answer.sections || []).filter(function (s) { return s && s.kind !== 'verdict'; });
        } else {
          var lead = String(modelParas[0] || '');
          answer.sections = (answer.sections || []).filter(function (s) {
            if (!s || s.kind !== 'verdict') return true;
            var h = String(s.head || '');
            return !(h.length > 120 || overlap(h, lead) >= 0.65);
          });
        }
      } else if (hasResearch(answer)) {
        analysis = researchParagraphs(answer, mode);
      }
      if (analysis) {
        answer.sections = (answer.sections || []).filter(function (s) { return s.kind !== 'analysis'; });
        answer.sections.push(analysis);
      }
      reorder(answer);
    }

    var trimmed = trimSimple(answer, mode);
    answer.meta = answer.meta || {};
    var repNow = answer.research || {};
    answer.meta.muse = {
      mode: mode,
      model: !!modelParas.length,
      paragraphs: modelParas.length,
      papers: (repNow.papers || []).length,
      evidence: (repNow.evidence || []).length,
      conflicts: (repNow.conflicts || []).length,
      gaps: (repNow.gaps || []).length,
      trimmedSimple: trimmed.removed
    };

    var auditResult = audit(answer, opts);
    answer.meta = answer.meta || {};
    answer.meta.quality = {
      mode: mode,
      modeLabel: MODE_LABEL[mode],
      duplicatesRemoved: dedupe.removed,
      refs: auditResult.refs,
      badRefs: auditResult.badRefs,
      unsupportedNumbers: auditResult.unsupportedNumbers,
      issues: auditResult.issues,
      passed: auditResult.passed
    };
    answer._v110Finalized = true;
    return answer;
  }

  root.AstroAnswerComposer = {
    finalize: finalize,
    modeFor: modeFor,
    brief: brief,
    trimSimple: trimSimple,
    textParagraphs: textParagraphs,
    audit: audit,
    MODE_LABEL: MODE_LABEL,
    version: VERSION
  };
})(typeof window !== 'undefined' ? window : globalThis);
