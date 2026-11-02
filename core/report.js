/* ASTRUM · 研究报告（D8）
 *
 * 依据：D8 研究报告输出要求
 *
 * 输出统一结构：问题 / 对象 / 结论 / 参数 / 论文 / 观测 / 计算 /
 * 证据 / 冲突 / 不确定性 / 来源 / 检索时间 / 覆盖度 / 缺口。
 * 每条结论必须带 evidenceRefs；abstractOnly 明确标注；不把无来源内容写成结论。
 */
(function (root) {
  'use strict';

  function hashShort(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value)).slice(0, 16);
    return String(value == null ? '' : value).length.toString(36);
  }

  function unique(list) {
    var seen = {}, out = [];
    (list || []).forEach(function (x) {
      if (!x || seen[x]) return;
      seen[x] = 1;
      out.push(x);
    });
    return out;
  }

  function hostOf(uri) {
    var m = String(uri || '').match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function verdictIndex(verdicts) {
    var map = {};
    (verdicts || []).forEach(function (v) {
      if (!v) return;
      var id = v.claimId || v.id;
      if (id) map[id] = v;
    });
    return map;
  }

  function levelOf(verdict) {
    if (!verdict) return 'unknown';
    if (verdict.verdict === 'PASS') return 'verified';
    if (verdict.verdict === 'PARTIAL') return 'inferred';
    return 'unknown';
  }

  function scopeOfRefs(refs, byId) {
    var types = {}, abstractOnly = false, fulltext = false;
    (refs || []).forEach(function (id) {
      var ev = byId[id];
      if (!ev) return;
      types[ev.sourceType] = 1;
      if (ev.abstractOnly) abstractOnly = true;
      if (ev.contentLevel === 'fulltext' || (ev.content && ev.content.contentLevel === 'fulltext')) fulltext = true;
    });
    if (abstractOnly) return 'abstract-only';
    if (fulltext) return 'fulltext';
    if (types.observation) return 'observation';
    if (types.calculation) return 'calculated';
    if (types.database) return 'catalog';
    if (types.paper) return 'paper-metadata';
    if (types.encyclopedia) return 'encyclopedia';
    return 'unknown';
  }

  function build(input) {
    input = input || {};
    var evidence = input.evidence || [];
    var claims = input.claims || [];
    var verdicts = input.verdicts || [];
    var vmap = verdictIndex(verdicts);
    var reducer = input.reducer || null;
    var retrievedAt = input.retrievedAt || new Date().toISOString();

    var papers = [], observations = [], calculations = [], parameters = [], evidenceList = [];
    var paperMap = {};
    var uncertainties = [];

    evidence.forEach(function (ev) {
      var c = ev.content || {};
      evidenceList.push({
        evidenceId: ev.evidenceId,
        sourceId: ev.sourceId,
        sourceType: ev.sourceType,
        title: ev.title,
        uri: ev.uri,
        retrievedAt: ev.retrievedAt,
        publishedAt: ev.publishedAt,
        abstractOnly: !!ev.abstractOnly,
        trust: ev.trust || null
      });
      if (ev.sourceType === 'paper') {
        var doiNorm = (c.doi || '').toLowerCase().replace(/^https?:\/\/doi\.org\//, '');
        var pid = c.paperId || (doiNorm ? 'doi:' + doiNorm : '') || ('title:' + String(ev.title || '').toLowerCase());
        if (!paperMap[pid]) {
          paperMap[pid] = {
            paperId: pid,
            title: ev.title,
            authors: (c.authors || []).slice(0, 6),
            doi: c.doi || '',
            arxivId: c.arxivId || '',
            date: ev.publishedAt,
            url: ev.uri,
            version: c.version || '',
            abstractOnly: true,
            fulltextAvailable: false,
            fulltextChunks: 0,
            abstractEvidence: 0,
            fulltextEvidence: 0,
            sections: [],
            pageCount: null,
            pageStart: null,
            pageEnd: null,
            excerpt: '',
            evidenceIds: [],
            retrievedAt: ev.retrievedAt
          };
        }
        var pp = paperMap[pid];
        if (c.contentLevel === 'fulltext') {
          pp.fulltextAvailable = true;
          pp.abstractOnly = false;
          pp.fulltextChunks += 1;
          pp.fulltextEvidence += 1;
          if (c.section && pp.sections.indexOf(c.section) < 0) pp.sections.push(c.section);
          if (c.pageStart != null) {
            pp.pageStart = pp.pageStart == null ? c.pageStart : Math.min(pp.pageStart, c.pageStart);
            pp.pageEnd = pp.pageEnd == null ? c.pageStart : Math.max(pp.pageEnd, c.pageEnd == null ? c.pageStart : c.pageEnd);
          }
          if (ev.provenance && ev.provenance.pageCount) pp.pageCount = ev.provenance.pageCount;
          if (c.doi) pp.doi = pp.doi || c.doi;
          if (ev.uri) pp.url = ev.uri;
          if (!pp.excerpt && c.excerpt) pp.excerpt = String(c.excerpt).slice(0, 220);
        } else {
          pp.abstractEvidence += 1;
          if (c.version) pp.version = pp.version || c.version;
          if (c.arxivId) pp.arxivId = pp.arxivId || c.arxivId;
          if (c.excerpt || c.snippet) pp.excerpt = String(c.excerpt || c.snippet).slice(0, 220);
        }
        pp.evidenceIds.push(ev.evidenceId);
      } else if (ev.sourceType === 'observation') {
        observations.push({
          fileName: c.fileName || ev.title,
          hduCount: c.hduCount || 0,
          imageHdus: c.imageHdus || 0,
          tableHdus: c.tableHdus || 0,
          object: c.object || '',
          telescope: c.telescope || '',
          instrument: c.instrument || '',
          stats: c.stats || null,
          summary: c.stats
            ? ('mean ' + c.stats.mean + ' / min ' + c.stats.min + ' / max ' + c.stats.max)
            : (c.hduCount + ' HDU'),
          warnings: (ev.provenance && ev.provenance.warnings) || [],
          evidenceId: ev.evidenceId,
          uri: ev.uri
        });
      } else if (ev.sourceType === 'calculation') {
        calculations.push({
          target: c.target,
          value: c.value,
          unit: c.unit,
          epoch: c.epoch,
          frame: c.frame,
          method: c.method,
          evidenceId: ev.evidenceId
        });
      } else if (ev.sourceType === 'database') {
        if (c.ra != null || c.dec != null || c.plx != null || c.otype) {
          parameters.push({
            label: c.mainId || ev.title,
            value: [c.otype || '', c.ra != null ? 'RA ' + c.ra : '', c.dec != null ? 'Dec ' + c.dec : '']
              .filter(Boolean).join(' · '),
            plx: c.plx,
            distanceLy: c.distanceLy,
            evidenceRefs: [ev.evidenceId],
            sourceId: ev.sourceId,
            uri: ev.uri
          });
        }
      }
      if (c.uncertainty) {
        uncertainties.push({ claimId: null, text: String(c.uncertainty), evidenceRef: ev.evidenceId });
      }
    });

    var evidenceById = {};
    evidence.forEach(function (ev) { evidenceById[ev.evidenceId] = ev; });
    papers = Object.keys(paperMap).map(function (k) { return paperMap[k]; });

    var conclusions = claims.map(function (c) {
      var v = vmap[c.id] || null;
      var refs = (c.support || []).map(function (s) { return s.eid; });
      if (!refs.length) return null;
      if (c.uncertainty) {
        uncertainties.push({
          claimId: c.id,
          text: c.uncertainty.kind + (c.uncertainty.value != null ? ' ± ' + c.uncertainty.value : ''),
          claimRef: c.id
        });
      }
      var chunks = refs.map(function (eid) {
        var ev = evidenceById[eid];
        if (!ev || !ev.content || !ev.content.chunkId) return null;
        return {
          evidenceId: eid,
          chunkId: ev.content.chunkId,
          section: ev.content.section || '',
          pageStart: ev.content.pageStart == null ? null : ev.content.pageStart,
          pageEnd: ev.content.pageEnd == null ? null : ev.content.pageEnd
        };
      }).filter(Boolean);
      return {
        claimId: c.id,
        text: c.text,
        type: c.type,
        level: levelOf(v),
        verdict: v ? v.verdict : null,
        rule: v ? v.rule : null,
        evidenceRefs: refs,
        evidenceScope: scopeOfRefs(refs, evidenceById),
        supportGranularity: chunks.length ? 'fulltext_chunk'
          : (refs.some(function (eid) {
            var ev = evidenceById[eid];
            return ev && ev.sourceType === 'paper' && ev.abstractOnly;
          }) ? 'abstract_sentence' : 'evidence_item'),
        sourceChunks: chunks,
        required: c.required === true
      };
    }).filter(Boolean);

    var subjectNames = unique(claims.map(function (c) {
      return (c.entities && c.entities[0]) || '';
    }).filter(Boolean));
    if (!subjectNames.length) {
      subjectNames = unique(evidence.map(function (e) { return e.title; })).slice(0, 3);
    }

    var conflicts = (reducer && reducer.conflicts) || [];
    var differences = (reducer && reducer.differences) || [];
    var paperStats = {
      searched: papers.length,
      fulltext: papers.filter(function (p) { return p.fulltextAvailable; }).length,
      abstractOnly: papers.filter(function (p) { return !p.fulltextAvailable; }).length,
      failed: (input.fulltextFailures || (reducer && reducer.fulltextFailures) || []).length,
      fulltextEvidence: evidence.filter(function (e) {
        return e.sourceType === 'paper' && (e.contentLevel === 'fulltext' || (e.content && e.content.contentLevel === 'fulltext'));
      }).length,
      abstractEvidence: evidence.filter(function (e) {
        return e.sourceType === 'paper' && !(e.contentLevel === 'fulltext' || (e.content && e.content.contentLevel === 'fulltext'));
      }).length
    };
    var gaps = [];
    if (!papers.length) gaps.push('未获得论文元数据');
    if (paperStats.abstractOnly) gaps.push(paperStats.abstractOnly + ' 篇论文仅获得摘要，未获取全文');
    if (paperStats.failed) gaps.push(paperStats.failed + ' 篇论文全文获取/解析失败');
    var ftFails = (input.fulltextFailures || (reducer && reducer.fulltextFailures) || []);
    if (ftFails.length) {
      var reasons = unique(ftFails.map(function (f) {
        var code = String(f && f.code || 'fulltext_failed');
        var reason = String(f && f.reason || '').replace(/\s+/g, ' ').slice(0, 48);
        return code + (reason ? '（' + reason + '）' : '');
      })).slice(0, 3);
      gaps.push('全文失败原因：' + reasons.join('；'));
    }
    var hasSimbad = evidence.some(function (e) {
      return e.sourceId === 'src_simbad' ||
        (e.provenance && e.provenance.service === 'SIMBAD TAP');
    });
    if (!hasSimbad) gaps.push('未获得 SIMBAD 天体参数（本机网络不可达或查询无结果）');
    if (!observations.length) gaps.push('未提供 FITS 观测文件');
    (reducer && reducer.unknowns || []).forEach(function (u) {
      if (u.claimId) gaps.push('证据不足或未通过验证：' + String(u.text || u.claimId).slice(0, 80));
    });
    differences.forEach(function (d) {
      gaps.push('数值差异无法判定为冲突：' + d.family + ' · ' + (d.reason || '信息不足'));
    });
    gaps = unique(gaps).slice(0, 8);
    var limitations = [];
    if (conclusions.some(function (c) { return c.evidenceScope === 'abstract-only'; })) {
      limitations.push('部分结论仅基于论文摘要，未阅读全文。');
    }
    if (!hasSimbad) limitations.push('SIMBAD 数据缺失，天体参数可能不完整。');
    if (!observations.length) limitations.push('没有 FITS 观测数据，缺少独立观测验证。');
    if (ftFails.length) limitations.push('部分论文全文被出版社拒绝或无法解析，结论仅基于摘要。');
    if (differences.length) limitations.push('存在无法判定的数值差异，已保留原始值。');
    limitations = unique(limitations);

    var sources = (reducer && reducer.sources) || [];
    if (!sources.length) {
      sources = unique(evidence.map(function (e) {
        return {
          sourceId: e.sourceId,
          name: hostOf(e.uri) || e.title,
          uri: e.uri,
          sourceType: e.sourceType,
          count: 1
        };
      }));
    }

    var summary = {
      verified: conclusions.filter(function (c) { return c.level === 'verified'; }).length,
      inferred: conclusions.filter(function (c) { return c.level === 'inferred'; }).length,
      unknown: conclusions.filter(function (c) { return c.level === 'unknown'; }).length,
      PASS: verdicts.filter(function (v) { return v.verdict === 'PASS'; }).length,
      PARTIAL: verdicts.filter(function (v) { return v.verdict === 'PARTIAL'; }).length,
      FAIL: verdicts.filter(function (v) { return v.verdict === 'FAIL'; }).length
    };

    var core = conclusions.filter(function (c) { return c.level === 'verified'; }).slice(0, 3)
      .map(function (c) { return c.text; }).join('；');

    return {
      reportId: 'rep_' + hashShort({
        q: input.question || '',
        evidence: evidenceList.map(function (e) { return e.evidenceId; })
      }),
      question: input.question || '',
      subject: {
        names: subjectNames,
        resolvedBy: input.subject && input.subject.resolvedBy ? input.subject.resolvedBy : 'plan',
        retrievalAt: retrievedAt
      },
      summary: core || '当前证据不足，未形成可验证的核心结论。',
      conclusions: conclusions,
      parameters: parameters,
      papers: papers,
      paperStats: paperStats,
      observations: observations,
      calculations: calculations,
      evidence: evidenceList,
      evidenceScope: {
        abstractOnly: conclusions.some(function (c) { return c.evidenceScope === 'abstract-only'; }),
        hasObservation: observations.length > 0,
        hasCalculation: calculations.length > 0,
        hasCatalog: hasSimbad
      },
      conflicts: conflicts,
      differences: differences,
      limitations: limitations,
      uncertainties: unique(uncertainties.map(function (u) { return JSON.stringify(u); }))
        .map(function (s) { return JSON.parse(s); }),
      sources: sources,
      retrievedAt: retrievedAt,
      coverage: {
        hasSimbad: hasSimbad,
        hasPapers: papers.length > 0,
        hasFulltext: paperStats.fulltext > 0,
        hasFits: observations.length > 0,
        hasCalculations: calculations.length > 0,
        independentSources: sources.length
      },
      gaps: gaps,
      disclaimer: '以上结论均基于列出的检索/观测/计算结果；摘要类论文未读全文；缺失数据不编造。'
    };
  }

  root.AstroReport = {
    build: build,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
