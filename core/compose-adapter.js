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

    function collectEvidence(args, depResults, ids) {
      var deps = depResults || {};
      var evidence = [], steps = {}, seen = {}, fulltextFailures = [];
      /* V1.2：附件 Evidence 由 Control 注入 compose args，优先进入报告 */
      var injected = args && Array.isArray(args.evidence) ? args.evidence : [];
      injected.forEach(function (it) {
        if (!it || !it.evidenceId || seen[it.evidenceId]) return;
        seen[it.evidenceId] = 1;
        evidence.push(it);
      });
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
            (ft.evidence || []).forEach(function (it) {
              if (!it || !it.evidenceId || seen[it.evidenceId]) return;
              seen[it.evidenceId] = 1;
              evidence.push(it);
            });
          });
        }
        if (Array.isArray(r.fulltextErrors)) {
          r.fulltextErrors.forEach(function (e) { fulltextFailures.push(e); });
        }
        if (!Array.isArray(r.items)) return;
        r.items.forEach(function (it) {
          if (!it || !it.evidenceId) return;
          if (seen[it.evidenceId]) return;
          seen[it.evidenceId] = 1;
          evidence.push(it);
        });
      });
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
          return {
            name: rec.target,
            dot: colors[i % colors.length],
            sigil: String(i + 1),
            text: [
              rec.ra != null ? 'RA ' + rec.ra.toFixed(4) : '',
              rec.dec != null ? 'Dec ' + rec.dec.toFixed(4) : '',
              rec.alt != null ? '高度 ' + rec.alt.toFixed(1) + '°' : '',
              rec.az != null ? '方位 ' + rec.az.toFixed(1) + '°' : ''
            ].filter(Boolean).join(' · ') || '仅有目标名称，缺少可比参数',
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
      var evidenceItems = [];
      (rep.papers || []).slice(0, 3).forEach(function (p) {
        evidenceItems.push({
          label: '论文 · ' + (p.title || ''),
          value: [p.date || '日期未知', p.doi ? 'DOI ' + p.doi : (p.arxivId ? 'arXiv ' + p.arxivId : ''),
            p.abstractOnly ? '仅摘要' : ''].filter(Boolean).join(' · ')
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
      if (gaps.length) {
        insertBeforeFollowup(answer, {
          kind: 'boundary', mode: 'uncertain',
          text: '未完成/不确定：' + gaps.join('；') + '。以上结论均保留原始来源，不把缺失数据当作事实。'
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

    function compose(args, ctx, cfg, depResults) {
      args = args || {};
      try {
        var ids = Array.isArray(args.from) ? args.from : Object.keys(depResults || {});
        var pre = buildPreloaded(depResults, ids);
        var answer = build(args.query, ctx, cfg, pre);
        var research = augment(answer, args, depResults, ids);
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
