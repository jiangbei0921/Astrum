/* ASTRUM · Compose Adapter（B7 + B8 数据闭环 + D 研究报告注入）
 *
 * 依据：docs/architecture/12-执行安全性审计.md §5
 *       docs/architecture/P0-01-目标架构总蓝图.md §2
 *
 * B8：接收 Runner 的依赖 StepResult，构建 preloaded 交给旧 buildAnswer；
 * 只复用成功且形状兼容的结果（targets / ephem）。缺失或失败一律回退旧计算，
 * 并在 delivery 中标记 fallback/missing，不把失败结果当事实。
 *
 * D：若依赖里存在 Evidence（真实检索/FITS），在 Adapter 层调用
 * Reducer → Claims → Report，追加研究报告 sections 与 answer.research。
 * 不修改 compose*，不修改 toSections，不改变旧 answer/sections/trace/meta 契约
 * （只有存在真实研究证据时才追加，旧 ask() 路径完全不经过这里）。
 */
(function (root) {
  'use strict';

  /* 对比回答需要每个目标的同口径事实：距离/类型/星等来自本地知识库，
   * 高度/方位/可见性来自同一次星历计算。只读取既有字段，不新增数据源。 */
  function knowledgeFactsOf(name) {
    var K = root.KNOWLEDGE;
    if (!K || !Array.isArray(K.entries) || !name) return [];
    var key = String(name).toLowerCase();
    for (var i = 0; i < K.entries.length; i++) {
      var e = K.entries[i];
      if (!e) continue;
      var aliases = (e.aliases || []).map(function (a) { return String(a).toLowerCase(); });
      if (String(e.cn) === name || String(e.en) === name || String(e.id) === name ||
        aliases.indexOf(key) >= 0) {
        var facts = (e.facts || []).filter(function (f) { return f && f[0] && f[1]; });
        /* 对比优先展示可横向比较的字段；知识库条目顺序不一致，不能简单取前三条。 */
        var wanted = ['距离', '类型', '视星等', '直径', '质量'];
        var out = [], used = {};
        wanted.forEach(function (label) {
          for (var j = 0; j < facts.length; j++) {
            if (String(facts[j][0]) === label && !used[j]) {
              used[j] = 1;
              out.push(String(facts[j][0]) + ' ' + String(facts[j][1]));
              break;
            }
          }
        });
        for (var k = 0; k < facts.length && out.length < 3; k++) {
          if (!used[k]) out.push(String(facts[k][0]) + ' ' + String(facts[k][1]));
        }
        return out.slice(0, 4);
      }
    }
    return [];
  }

  function visibilityLabel(score) {
    if (score == null || !isFinite(score)) return '';
    if (score >= 0.75) return '可见性 较易';
    if (score >= 0.5) return '可见性 中等';
    return '可见性 较难';
  }

  function create(options) {
    options = options || {};
    var AC = options.agentCore || root.AgentCore;

    function build(query, ctx, cfg, preloaded) {
      if (!AC || !AC.buildAnswer) throw new Error('ComposeAdapter 需要 AgentCore.buildAnswer');
      return AC.buildAnswer(String(query == null ? '' : query), ctx, cfg || AC.defaultConfig(), preloaded);
    }

    function buildPreloaded(depResults, fromIds) {
      var pre = {
        targets: null,
        ephem: {},
        steps: {},
        usedStepIds: [],
        missing: []
      };
      var deps = depResults || {};
      var ids = Array.isArray(fromIds) && fromIds.length ? fromIds : Object.keys(deps);

      ids.forEach(function (id) {
        var r = deps[id];
        if (!r || r.ok === false) {
          pre.missing.push(id);
          return;
        }
        pre.steps[id] = r;
        var used = false;
        if (Array.isArray(r.targets) && r.targets.length && !pre.targets) {
          pre.targets = r.targets;
          used = true;
        }
        if (Array.isArray(r.records)) {
          r.records.forEach(function (rec) {
            if (rec && rec.target && rec.ephem && rec.ephem.now) {
              pre.ephem[rec.target] = rec.ephem;
              used = true;
            }
          });
        }
        if (used) pre.usedStepIds.push(id);
      });

      return pre;
    }

    /* 跨工具（paper.search / evidence.search）去重：同一篇论文在不同 Provider
     * 常以 DOI URL、OpenAlex ID 或 /pdf 直链返回，evidenceId 不同但内容相同。
     * 摘要级论文按归一化标题合并；全文分块保留 chunkId，不能误删。 */
    function paperKeyOf(it) {
      var c = (it && it.content) || {};
      if (c.chunkId) return 'chunk:' + it.evidenceId;
      var title = String((it && it.title) || '').toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
      /* 论文优先按标题归一化：同一篇论文在不同 Provider 会给出 DOI、/pdf 直链
       * 或 OpenAlex ID，DOI 字段本身也可能缺失；标题是最稳定的同一性线索。 */
      if ((it && it.sourceType === 'paper') && title.length >= 12) return 'title:' + title;
      var doi = String(c.doi || '').toLowerCase()
        .replace(/^https?:\/\/(dx\.)?doi\.org\//, '').replace(/^doi:\s*/, '')
        .replace(/\/pdf\/?$/, '').trim();
      if (doi) return 'doi:' + doi;
      return 'id:' + (it && it.evidenceId);
    }

    function hasPaperId(it) {
      var c = (it && it.content) || {};
      return !!(c.doi || c.arxivId || /^10\.\d{4,9}\//.test(String(it && it.uri || '').replace(/^https?:\/\/(dx\.)?doi\.org\//, '')));
    }

    function collectEvidence(args, depResults, ids) {
      var deps = depResults || {};
      var evidence = [], steps = {}, seen = {}, fulltextFailures = [];
      var byPaper = {};
      function push(it) {
        if (!it || !it.evidenceId || seen[it.evidenceId]) return;
        seen[it.evidenceId] = 1;
        var key = paperKeyOf(it);
        if (byPaper[key] != null) {
          var idx = byPaper[key];
          var old = evidence[idx];
          /* 已有的条目缺 DOI/arXiv、后来的条目有，则用后者替换；
           * 两者都可信时保留摘要更完整的一条（OpenAlex 有时会丢公式/数值）。 */
          var oldLen = ((old.content || {}).excerpt || '').length;
          var newLen = ((it.content || {}).excerpt || '').length;
          if (!hasPaperId(old) && hasPaperId(it)) evidence[idx] = it;
          else if (newLen > oldLen && (hasPaperId(it) || !hasPaperId(old))) evidence[idx] = it;
          return;
        }
        byPaper[key] = evidence.length;
        evidence.push(it);
      }
      /* V1.2：附件 Evidence 由 Control 注入 compose args，优先进入报告 */
      var injected = args && Array.isArray(args.evidence) ? args.evidence : [];
      injected.forEach(push);
      ids.forEach(function (id) {
        var r = deps[id];
        if (!r || r.ok === false) return;
        steps[id] = {
          stepId: id,
          toolId: r.provenance && r.provenance.tool ? r.provenance.tool : (r.tool || ''),
          status: 'ok',
          evidenceRefs: Array.isArray(r.evidenceIds) ? r.evidenceIds.slice() : []
        };
        if (Array.isArray(r.fulltexts)) {
          r.fulltexts.forEach(function (ft) {
            (ft.evidence || []).forEach(push);
          });
        }
        if (Array.isArray(r.fulltextErrors)) {
          r.fulltextErrors.forEach(function (e) { fulltextFailures.push(e); });
        }
        if (!Array.isArray(r.items)) return;
        r.items.forEach(push);
      });
      /* 若已有 2 篇带 DOI/arXiv 的论文，则不再把无法核验作者/年份的
       * 元数据条目当作研究证据（T-F 直连链路不经过 research.rank）。 */
      var cred = evidence.filter(function (it) { return it.sourceType === 'paper' && hasPaperId(it); }).length;
      if (cred >= 2) {
        evidence = evidence.filter(function (it) {
          return !(it.sourceType === 'paper' && !hasPaperId(it));
        });
      }
      /* V1.13：进入报告前统一核验；没有原始来源/标识不一致的证据不得标为已核验。 */
      if (root.AstroEvidence && typeof root.AstroEvidence.verifyAll === 'function') {
        try { root.AstroEvidence.verifyAll(evidence, null); } catch (e) { /* 核验失败不阻断交付 */ }
      }
      return { evidence: evidence, steps: steps, fulltextFailures: fulltextFailures };
    }

    function researchOf(args, depResults, ids) {
      var got = collectEvidence(args, depResults, ids);
      if (!got.evidence.length) return null;
      var C = root.AstroClaims;
      var claims = C && C.buildClaimsFromEvidence ? C.buildClaimsFromEvidence(got.evidence, { query: args.query }) : [];
      var judged = C && C.judgeAll ? C.judgeAll(claims, { evidence: got.evidence }) : { claims: claims, verdicts: [] };
      var R = root.AstroReducer;
      var reduced = R && R.reduce ? R.reduce({
        evidence: got.evidence, claims: judged.claims, stepResults: got.steps
      }) : null;
      var Report = root.AstroReport;
      var report = Report && Report.build ? Report.build({
        question: args.query,
        subject: { names: [], resolvedBy: 'plan' },
        evidence: got.evidence,
        claims: judged.claims,
        verdicts: judged.verdicts,
        reducer: reduced,
        fulltextFailures: got.fulltextFailures,
        retrievedAt: new Date().toISOString()
      }) : null;
      return {
        evidence: got.evidence,
        claims: judged.claims,
        verdicts: judged.verdicts,
        verdictSummary: judged.summary || null,
        reducer: reduced,
        report: report,
        steps: got.steps,
        fulltextFailures: got.fulltextFailures
      };
    }

    function compareSectionOf(depResults, ids) {
      var deps = depResults || {};
      var records = [];
      (ids || Object.keys(deps)).forEach(function (id) {
        var r = deps[id];
        if (!r || r.ok === false || !Array.isArray(r.records)) return;
        r.records.forEach(function (rec) {
          if (rec && rec.target) records.push(rec);
        });
      });
      if (records.length < 2) return null;
      var colors = ['#3b3bd6', '#1a7d5b', '#b45309', '#7c3aed', '#be123c'];
      return {
        kind: 'compare',
        title: '多目标对比',
        items: records.map(function (rec, i) {
          var facts = knowledgeFactsOf(rec.target);
          var score = rec.ephem && rec.ephem.score != null ? rec.ephem.score : null;
          return {
            name: rec.target,
            dot: colors[i % colors.length],
            sigil: String(i + 1),
            text: facts.concat([
              visibilityLabel(score),
              rec.ra != null ? 'RA ' + rec.ra.toFixed(4) : '',
              rec.dec != null ? 'Dec ' + rec.dec.toFixed(4) : '',
              rec.alt != null ? '高度 ' + rec.alt.toFixed(1) + '°' : '',
              rec.az != null ? '方位 ' + rec.az.toFixed(1) + '°' : ''
            ]).filter(Boolean).join(' · ') || '仅有目标名称，缺少可比参数',
            latency: 0
          };
        })
      };
    }

    function insertBeforeFollowup(answer, section) {
      if (!answer || !Array.isArray(answer.sections)) return;
      var fi = -1;
      for (var i = 0; i < answer.sections.length; i++) {
        if (answer.sections[i] && answer.sections[i].kind === 'followup') { fi = i; break; }
      }
      if (fi >= 0) answer.sections.splice(fi, 0, section);
      else answer.sections.push(section);
    }

    function sectionsOfResearch(research, answer) {
      var rep = research.report || {};
      /* 研究型问题若落到「宇宙学议题索引」或通用兜底，结论会答非所问。
       * 在这里把首条 verdict 改成研究口径的摘要，详细结论仍由下方分级列表给出。 */
      var verdict = (answer.sections || []).filter(function (s) { return s.kind === 'verdict'; })[0];
      if (verdict && /宇宙学里有|尚未指定具体概念|你可以指定其中一个/.test(String(verdict.head || ''))) {
        var ps = (rep.papers || []).length;
        var abs = (rep.papers || []).filter(function (p) { return p.abstractOnly; }).length;
        verdict.head = '已检索到 ' + ps + ' 篇相关论文' +
          (abs ? '（其中 ' + abs + ' 篇仅获得摘要）' : '') +
          '，以下按证据强度列出结论；未获取全文时不把摘要当作已证实结论。';
        verdict.sub = '研究问题：' + String(rep.question || answer.query || '').slice(0, 120);
      }
      var evidenceItems = [];
      var verifyLabel = root.AstroEvidence && root.AstroEvidence.verificationLabel
        ? root.AstroEvidence.verificationLabel : null;
      function paperStateOf(p) {
        if (p && p.verification && p.verification.state) return p.verification.state;
        var ev = null;
        (rep.evidence || []).forEach(function (e) {
          if (ev || !e || e.sourceType !== 'paper') return;
          var d1 = String(p.doi || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
          var d2 = String((e.content && e.content.doi) || '').toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
          if ((d1 && d2 && d1 === d2) || (String(e.title || '') === String(p.title || ''))) ev = e;
        });
        return ev && ev.verification ? ev.verification.state : '';
      }
      (rep.papers || []).slice(0, 3).forEach(function (p) {
        var stateCode = paperStateOf(p);
        var state = stateCode ? (verifyLabel ? verifyLabel(stateCode) : stateCode) : '';
        evidenceItems.push({
          label: '论文 · ' + (p.title || ''),
          value: [p.date || '日期未知', p.doi ? 'DOI ' + p.doi : (p.arxivId ? 'arXiv ' + p.arxivId : ''),
            p.abstractOnly ? '仅摘要' : '', state].filter(Boolean).join(' · ')
        });
      });
      (rep.parameters || []).slice(0, 4).forEach(function (p) {
        evidenceItems.push({ label: p.label || p.name || '参数', value: String(p.value) });
      });
      (rep.observations || []).slice(0, 2).forEach(function (o) {
        evidenceItems.push({
          label: '观测 · ' + (o.fileName || 'FITS'),
          value: (o.summary || (o.hduCount + ' HDU')) + (o.warnings && o.warnings.length ? '（有警告）' : '')
        });
      });
      if (evidenceItems.length) {
        insertBeforeFollowup(answer, {
          kind: 'evidence',
          title: '研究证据 · 真实来源',
          items: evidenceItems.slice(0, 8),
          sources: (rep.sources || []).map(function (s) { return { n: s.name || s.uri || s.sourceId, u: s.uri || '' }; })
        });
      }

      var listItems = (rep.conclusions || []).slice(0, 6).map(function (c) {
        return {
          name: c.text,
          meta: (c.level === 'verified' ? '已验证' : c.level === 'inferred' ? '推断' : '未证实') +
            (c.rule && c.rule !== 'NONE' ? ' · ' + c.rule : ''),
          text: (c.evidenceRefs || []).join('、')
        };
      });
      if (listItems.length) {
        insertBeforeFollowup(answer, { kind: 'list', title: '科学结论（按证据强度分级）', items: listItems });
      }

      var conflicts = rep.conflicts || [];
      if (conflicts.length) {
        insertBeforeFollowup(answer, {
          kind: 'conflict',
          title: '证据冲突',
          note: '同一物理量在不同来源存在数值差异；未强行合并。',
          items: conflicts.map(function (c) {
            return {
              family: c.family || c.property || '数值',
              spread: c.spread == null ? '—' : c.spread,
              values: (c.values || []).map(function (v) {
                return { raw: v.raw, id: v.id || '', host: v.host || '', title: v.title || '', url: v.url || '' };
              })
            };
          })
        });
      }

      var gaps = rep.gaps || [];
      /* 工具失败/网络错误等执行状态留在科研详情；正文边界只保留科研限制。 */
      var sciGaps = root.AstroAnswerComposer && typeof root.AstroAnswerComposer.scientificLimits === 'function'
        ? root.AstroAnswerComposer.scientificLimits({ research: rep }) : gaps;
      if (sciGaps.length) {
        insertBeforeFollowup(answer, {
          kind: 'boundary', mode: 'uncertain',
          text: '未完成/不确定：' + sciGaps.join('；') + '。以上结论均保留原始来源，不把缺失数据当作事实。'
        });
      }
    }

    function augment(answer, args, depResults, ids) {
      var research = researchOf(args, depResults, ids);
      if (!research || !research.report) return null;
      if (!answer.research) {
        sectionsOfResearch(research, answer);
        answer.research = research.report;
        answer.research.claims = research.claims;
        answer.research.verdicts = research.verdicts;
        answer.research.verdictSummary = research.verdictSummary;
        answer.research.reducer = research.reducer;
      }
      return research;
    }

    function deliveryOf(pre, ids, research, deps) {
      var ephemTargets = Object.keys(pre.ephem);
      var steps = [];
      (ids || []).forEach(function (id) {
        var r = (deps || {})[id];
        if (!r || r.ok === false) return;
        steps.push({
          stepId: id,
          toolId: (r.provenance && r.provenance.tool) || r.tool || '',
          status: 'ok',
          evidenceRefs: Array.isArray(r.evidenceIds) ? r.evidenceIds.slice() : []
        });
      });
      return {
        usedStepIds: pre.usedStepIds.slice(),
        ephemTargets: ephemTargets,
        targetsFromSteps: !!pre.targets,
        fallback: pre.usedStepIds.length === 0,
        missing: pre.missing.slice(),
        dependencyIds: (ids || []).slice(),
        unifiedSteps: steps,
        research: research && research.report ? {
          reportId: research.report.reportId,
          evidenceCount: research.evidence.length,
          claimCount: research.claims.length,
          conflicts: (research.report.conflicts || []).length,
          gaps: (research.report.gaps || []).length,
          verified: research.verdictSummary ? research.verdictSummary.PASS || 0 : 0,
          partial: research.verdictSummary ? research.verdictSummary.PARTIAL || 0 : 0,
          failed: research.verdictSummary ? research.verdictSummary.FAIL || 0 : 0
        } : null
      };
    }

    function finalizeAnswer(answer, question, research) {
      if (!answer) return answer;
      if (root.AstroAnswerComposer && typeof root.AstroAnswerComposer.finalize === 'function') {
        try { root.AstroAnswerComposer.finalize(answer, { question: question || argsQuestion(answer) }); } catch (e) { /* 质量整理失败不阻断交付 */ }
      }
      if (root.AstroKnowledgeSources && typeof root.AstroKnowledgeSources.attach === 'function') {
        try {
          var ext = research && root.AstroKnowledgeSources.externalFromResearch
            ? root.AstroKnowledgeSources.externalFromResearch({ evidence: research.evidence })
            : { status: 'skipped', attempted: false, ok: 0, failed: 0, tools: [], failures: [] };
          root.AstroKnowledgeSources.attach(answer, {
            plan: root.AstroKnowledgeSources.decide({
              query: question || answer.query || '',
              intent: answer.intent,
              targets: answer.targets || []
            }),
            external: ext
          });
        } catch (e) { /* 来源状态失败不影响答案 */ }
      }
      return answer;
    }
    function argsQuestion(answer) { return (answer && answer.query) || ''; }

    function compose(args, ctx, cfg, depResults) {
      args = args || {};
      try {
        var ids = Array.isArray(args.from) ? args.from : Object.keys(depResults || {});
        var pre = buildPreloaded(depResults, ids);
        var answer = build(args.query, ctx, cfg, pre);
        var research = augment(answer, args, depResults, ids);
        finalizeAnswer(answer, args.query, research);
        return {
          ok: true, answer: answer,
          delivery: deliveryOf(pre, ids, research, depResults),
          evidenceIds: research ? research.evidence.map(function (e) { return e.evidenceId; }) : []
        };
      } catch (e) {
        return { ok: false, reason: e && e.message ? e.message : String(e), retriable: true };
      }
    }

    function deliver(query, ctx, cfg, depResults) {
      return build(query, ctx, cfg, buildPreloaded(depResults, null));
    }

    function deliverWithDelivery(query, ctx, cfg, depResults, opts) {
      var deps = depResults || {};
      var ids = Object.keys(deps);
      var pre = buildPreloaded(deps, ids);
      var answer = build(query, ctx, cfg, pre);
      var research = augment(answer, { query: query }, deps, ids);
      if (opts && opts.compare) {
        var cs = compareSectionOf(deps, ids);
        if (cs) {
          insertBeforeFollowup(answer, cs);
          answer.compare = cs.items;
        }
      }
      finalizeAnswer(answer, query, research);
      return {
        answer: answer,
        delivery: deliveryOf(pre, ids, research, deps)
      };
    }

    function view(answer) {
      return {
        sections: answer ? answer.sections : [],
        trace: answer ? answer.trace : [],
        meta: answer ? answer.meta : {}
      };
    }

    return {
      compose: compose,
      deliver: deliver,
      deliverWithDelivery: deliverWithDelivery,
      buildPreloaded: buildPreloaded,
      view: view
    };
  }

  root.AstroComposeAdapter = {
    create: create
  };
})(typeof window !== 'undefined' ? window : global);
