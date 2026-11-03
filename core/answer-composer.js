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

  var VERSION = '1.0.0';

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
    if (PARAM_TERMS.test(q) && /[0-9]/.test(q + ' ' + ((answer && answer.sections) || []).map(function (s) {
      return (s.items || []).map(function (it) { return it.value; }).join(' ');
    }).join(' '))) return 'C';
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
    var lead = '';
    if (summary && !/证据不足，未形成/i.test(summary)) lead = summary;
    else if (verified.length) lead = verified[0].text;
    if (lead) paras.push({ role: 'conclusion', text: '核心结论：' + ends(clip(lead, 240)) });
    else {
      paras.push({
        role: 'conclusion',
        text: '核心结论：现有证据不足以形成可验证的科研结论；本轮只给出可核对的事实、论文来源与仍缺失的信息。'
      });
    }

    var papers = rep.papers || [];
    if (papers.length) {
      var abs = papers.filter(function (p) { return p.abstractOnly; }).length;
      var full = papers.length - abs;
      var ptext = '本轮共获得 ' + papers.length + ' 篇相关论文';
      if (full > 0 && abs > 0) ptext += '（' + full + ' 篇有全文，' + abs + ' 篇仅摘要）';
      else if (abs > 0) ptext += '，均只获得摘要';
      else ptext += '，均含全文';
      var d = papers.slice(0, 3).map(function (p) { return p.doi ? 'DOI ' + p.doi : (p.arxivId ? 'arXiv ' + p.arxivId : ''); }).filter(Boolean);
      if (d.length) ptext += '；可核查编号为 ' + d.join('、');
      paras.push({ role: 'evidence', text: '在此基础上，' + ends(ptext) });
    } else {
      paras.push({ role: 'evidence', text: '在证据来源上，本轮未获得可核验的论文；结论只覆盖已有本地事实与计算。' });
    }

    var chosen = (verified.length ? verified : inferred).slice(0, 2);
    if (chosen.length) {
      var findings = chosen.map(function (c) { return clip(c.text, 140); }).join('；');
      var refs = chosen.map(function (c) { return (c.evidenceRefs || []).join('、'); }).filter(Boolean).join('；');
      paras.push({
        role: 'analysis',
        text: '与此相关，现有证据支持的要点是：' + ends(findings) +
          (refs ? '对应证据编号：' + refs + '。' : '')
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

    var limits = (rep.gaps || []).slice(0, 3).concat((rep.limitations || []).slice(0, 3));
    if (limits.length) {
      paras.push({
        role: 'limitation',
        text: '综合来看，本次回答的限制是：' + ends(uniq(limits).join('；'))
      });
    }
    if (!paras.length) {
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
    var unsupported = [];
    texts.forEach(function (t) {
      if (/doi|arxiv|证据编号|ev_/i.test(t)) return;
      numbersOf(t).forEach(function (n) {
        var v = parseFloat(n);
        if (v >= 1900 && v <= 2100) return;
        if ((v <= 24 && n.indexOf('.') < 0) || v === 60 || v === 100 || v === 360 || v === 365 || v === 1000) return;
        if (pool.indexOf(n) >= 0) return;
        if (unsupported.indexOf(n) < 0) unsupported.push(n);
      });
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
    if (rep && ((rep.gaps && rep.gaps.length) || (rep.limitations && rep.limitations.length)) && !hasBoundary) {
      answer.sections.push({
        kind: 'boundary', mode: 'uncertain',
        text: '限制与未完成项：' + uniq((rep.gaps || []).concat(rep.limitations || [])).slice(0, 4).join('；') +
          '。以上结论不把缺失数据当作事实。'
      });
      issues.push({ kind: 'missing-boundary', count: 1, detail: '已补充限制声明' });
    }

    var duplicate = (answer.sections || []).filter(function (s) { return s.kind === 'verdict'; }).length > 1;
    if (duplicate) issues.push({ kind: 'duplicate-verdict', count: 1, detail: '重复结论段' });

    return {
      refs: refs,
      badRefs: badRefs,
      unsupportedNumbers: unsupported,
      certainty: certainty,
      issues: issues,
      passed: badRefs.length === 0 && unsupported.length === 0 && certainty === 0 && !duplicate
    };
  }

  function finalize(answer, opts) {
    opts = opts || {};
    if (!answer || typeof answer !== 'object') return answer;
    if (answer._v110Finalized && !opts.modelText) return answer;
    var mode = modeFor(answer, opts);
    var dedupe = dedupeSections(answer);
    mergeEvidence(answer);

    if (hasResearch(answer) || opts.modelText) {
      var analysis = null;
      if (hasResearch(answer)) analysis = researchParagraphs(answer, mode);
      if (opts.modelText) {
        if (!analysis) analysis = { kind: 'analysis', title: '综合研判 · ' + MODE_LABEL[mode], mode: mode, paragraphs: [] };
        analysis.paragraphs = [{ role: 'model', text: String(opts.modelText) }].concat(analysis.paragraphs || []);
        analysis.source = opts.modelSource || null;
      }
      if (analysis) {
        answer.sections = (answer.sections || []).filter(function (s) { return s.kind !== 'analysis'; });
        answer.sections.push(analysis);
      }
      reorder(answer);
    }

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
    audit: audit,
    MODE_LABEL: MODE_LABEL,
    version: VERSION
  };
})(typeof window !== 'undefined' ? window : globalThis);
