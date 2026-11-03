/* ASTRUM · Reducer（C5）
 *
 * 依据：docs/architecture/P0-01-目标架构总蓝图.md §8.6
 *       docs/architecture/06-科学证据与验证机制.md §4.0
 *
 * 职责：收集成功步骤结果，去重 Evidence，识别冲突，保留来源，
 * 区分事实/推断/假设，输出供 Critic / Compose / Report 使用的统一上下文。
 * 不修改原始 Evidence，不合并不同来源为同一独立证据。
 */
(function (root) {
  'use strict';

  function clone(x) {
    if (x == null) return x;
    try { return JSON.parse(JSON.stringify(x)); } catch (e) { return x; }
  }

  function normUri(u) {
    var s = String(u == null ? '' : u).trim().toLowerCase();
    if (!s) return '';
    s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
    s = s.replace(/[?#].*$/, '').replace(/\/+$/, '');
    s = s.replace(/^doi\.org\//, '');
    return s;
  }

  function normDoi(d) {
    return String(d == null ? '' : d).trim().toLowerCase()
      .replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:/, '');
  }

  function hostOf(uri) {
    var s = String(uri || '');
    var m = s.match(/^(?:https?:\/\/)?(?:www\.)?([^\/]+)/i);
    return m ? m[1].toLowerCase() : '';
  }

  function hashOf(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value));
    return String(value == null ? '' : value).length.toString(36);
  }

  function evidenceKey(ev) {
    if (!ev) return '';
    if (root.AstroEvidence && root.AstroEvidence.evidenceKey) {
      return root.AstroEvidence.evidenceKey(ev);
    }
    var doi = normDoi(ev.doi || (ev.content && ev.content.doi) || (ev.provenance && ev.provenance.doi) || '');
    if (doi) return 'doi:' + doi;
    var uri = normUri(ev.uri);
    if (uri) return 'uri:' + uri;
    return 'id:' + (ev.sourceId || '') + '|' + hashOf(ev.content || ev.title || '');
  }

  function fingerprint(ev) {
    if (!ev) return '';
    return evidenceKey(ev) + '|' + (ev.sourceId || '') + '|' + hashOf(ev.content || ev.title || '');
  }

  function sourceKeyOf(ev) {
    if (!ev) return '';
    if (ev.sourceId) return ev.sourceId;
    if (ev.uri) return 'src_' + hostOf(ev.uri);
    return 'src_unknown';
  }

  function dedupe(list) {
    var out = [], duplicates = [], seen = {}, i;
    for (i = 0; i < (list || []).length; i++) {
      var ev = list[i];
      if (!ev) continue;
      var key = evidenceKey(ev);
      if (seen[key]) {
        duplicates.push({
          evidenceId: ev.evidenceId || '',
          kept: seen[key],
          key: key,
          reason: 'same DOI/URI/content'
        });
        continue;
      }
      seen[key] = ev.evidenceId || key;
      out.push(ev);
    }
    return { evidence: out, duplicates: duplicates };
  }

  function sourceList(evidence) {
    var map = {}, out = [];
    (evidence || []).forEach(function (ev) {
      var id = sourceKeyOf(ev);
      if (!id) return;
      if (!map[id]) {
        map[id] = {
          sourceId: id,
          name: (ev.provenance && ev.provenance.service) || hostOf(ev.uri) || ev.title || id,
          uri: ev.uri || '',
          sourceType: ev.sourceType || '',
          trust: ev.trust || null,
          count: 0
        };
        out.push(map[id]);
      }
      map[id].count += 1;
    });
    return out;
  }

  function unitOf(claim) {
    var n = (claim && claim.numbers && claim.numbers[0]) || null;
    return n && n.unit ? String(n.unit) : '';
  }

  function entityOf(claim) {
    return (claim && claim.entities && claim.entities[0]) || '';
  }

  var UNIT_INFO = {
    ly: { dim: 'length', factor: 1, canon: 'ly' },
    pc: { dim: 'length', factor: 3.26156, canon: 'ly' },
    kpc: { dim: 'length', factor: 3261.56, canon: 'ly' },
    mpc: { dim: 'length', factor: 3261560, canon: 'ly' },
    au: { dim: 'length', factor: 1.58125e-5, canon: 'ly' },
    km: { dim: 'length', factor: 1.057e-13, canon: 'ly' },
    deg: { dim: 'angle', factor: 1, canon: 'deg' },
    arcmin: { dim: 'angle', factor: 1 / 60, canon: 'deg' },
    arcsec: { dim: 'angle', factor: 1 / 3600, canon: 'deg' },
    mas: { dim: 'angle', factor: 1 / 3600000, canon: 'deg' },
    rad: { dim: 'angle', factor: 57.2957795, canon: 'deg' },
    k: { dim: 'temperature', factor: 1, canon: 'K' },
    kk: { dim: 'temperature', factor: 1000, canon: 'K' },
    yr: { dim: 'time', factor: 1, canon: 'yr' },
    kyr: { dim: 'time', factor: 1000, canon: 'yr' },
    myr: { dim: 'time', factor: 1e6, canon: 'yr' },
    gyr: { dim: 'time', factor: 1e9, canon: 'yr' }
  };

  function unitInfo(unit) {
    var key = String(unit == null ? '' : unit).trim().toLowerCase().replace(/\s+/g, '');
    return UNIT_INFO[key] || { dim: 'unit:' + key, factor: 1, canon: key || 'unitless' };
  }

  function convertValue(value, from, to) {
    var a = unitInfo(from), b = unitInfo(to);
    if (a.dim !== b.dim) return null;
    return value * a.factor / b.factor;
  }

  function claimUncertainty(c) {
    if (c && c.uncertainty && typeof c.uncertainty.value === 'number' && isFinite(c.uncertainty.value)) {
      return Math.abs(c.uncertainty.value);
    }
    if (c && c.calc && typeof c.calc.uncertainty === 'number' && isFinite(c.calc.uncertainty)) {
      return Math.abs(c.calc.uncertainty);
    }
    return null;
  }

  function claimFrame(c) {
    if (c && c.calc && c.calc.frame) return String(c.calc.frame);
    return '';
  }

  function claimEpoch(c) {
    if (c && c.calc && c.calc.epoch) return String(c.calc.epoch);
    return '';
  }

  function compareClaims(claims, evidenceById) {
    var groups = {}, out = [], differences = [];
    (claims || []).forEach(function (c) {
      (c.numbers || []).forEach(function (n) {
        if (!n || typeof n.value !== 'number' || !isFinite(n.value)) return;
        var u = unitInfo(n.unit || '');
        var key = entityOf(c).toLowerCase() + '|' + u.dim;
        if (!groups[key]) {
          groups[key] = {
            family: (entityOf(c) || '数值') + (u.canon ? ' (' + u.canon + ')' : ''),
            unit: u.canon,
            dim: u.dim,
            items: []
          };
        }
        var ev = null;
        if (c.support && c.support.length) {
          ev = evidenceById[c.support[0].eid] || null;
        }
        /* 不确定性必须和 value 一起换算到同一单位；
         * 否则 744 ± 33 kpc 与 772 ± 44 kpc 会被误判成 >1σ 冲突。 */
        var unc = claimUncertainty(c);
        groups[key].items.push({
          raw: String(n.value) + (n.unit ? ' ' + n.unit : ''),
          value: n.value * u.factor,
          sourceValue: n.value,
          unit: n.unit || '',
          uncertainty: typeof unc === 'number' ? unc * u.factor : unc,
          frame: claimFrame(c),
          epoch: claimEpoch(c),
          id: c.id,
          host: ev ? hostOf(ev.uri) : '',
          title: ev ? ev.title : String(c.text || '').slice(0, 60),
          url: ev ? ev.uri : ''
        });
      });
    });
    Object.keys(groups).forEach(function (key) {
      var g = groups[key];
      if (g.items.length < 2) return;
      var vals = g.items.map(function (x) { return x.value; });
      var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
      var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      var spread = mean ? ((max - min) / Math.abs(mean)) * 100 : 0;
      var frames = g.items.map(function (x) { return x.frame; }).filter(Boolean);
      var epochs = g.items.map(function (x) { return x.epoch; }).filter(Boolean);
      var frameDiff = (frames.length >= 2 && frames.some(function (f) { return f !== frames[0]; })) ||
        (epochs.length >= 2 && epochs.some(function (e) { return e !== epochs[0]; }));
      var uncs = g.items.map(function (x) { return x.uncertainty; });
      var hasUnc = uncs.every(function (u) { return typeof u === 'number' && isFinite(u); });
      var significant = false;
      if (!frameDiff && hasUnc) {
        for (var i = 0; i < g.items.length && !significant; i++) {
          for (var j = i + 1; j < g.items.length; j++) {
            var d = Math.abs(g.items[i].value - g.items[j].value);
            var combined = Math.sqrt(uncs[i] * uncs[i] + uncs[j] * uncs[j]);
            if (d > combined) { significant = true; break; }
          }
        }
      }
      var entry = {
        family: g.family,
        unit: g.unit,
        spread: Math.round(spread * 10) / 10,
        values: g.items.map(function (x) {
          return { raw: x.raw, value: x.value, id: x.id, host: x.host, title: x.title, url: x.url };
        })
      };
      if (frameDiff) {
        entry.status = 'insufficient_information';
        entry.reason = '参考系/历元不同';
        differences.push(entry);
      } else if (significant) {
        entry.status = 'significant';
        entry.reason = '差异超过 1σ 合成不确定性';
        out.push(entry);
      } else if (!hasUnc && spread > 5) {
        entry.status = 'insufficient_information';
        entry.reason = '缺少测量不确定性，不能判定为冲突';
        differences.push(entry);
      }
    });
    return { conflicts: out, differences: differences };
  }

  function conflictsOf(claims, evidenceById) {
    return compareClaims(claims, evidenceById).conflicts;
  }

  function differencesOf(claims, evidenceById) {
    return compareClaims(claims, evidenceById).differences;
  }

  function verdictMap(verdicts) {
    var map = {};
    (verdicts || []).forEach(function (v) {
      if (!v) return;
      if (v.claimId) map[v.claimId] = v;
      else if (v.id) map[v.id] = v;
    });
    return map;
  }

  function reduce(input) {
    input = input || {};
    var state = input.state || null;
    var steps = input.stepResults || {};
    var okSteps = [], failedSteps = [], usedStepIds = [];

    if (state) {
      (state.steps || []).forEach(function (s) {
        var item = {
          stepId: s.id, toolId: s.toolId || s.tool, status: s.status,
          attempt: s.attempt, durationMs: s.durationMs,
          evidenceRefs: (s.evidenceRefs || []).slice()
        };
        if (s.status === 'ok') {
          okSteps.push(item);
          usedStepIds.push(s.id);
          if (s.result) steps[s.id] = s.result;
        } else if (s.status === 'failed' || s.status === 'blocked' || s.status === 'aborted' || s.status === 'skipped') {
          failedSteps.push(item);
        }
      });
    } else {
      Object.keys(steps).forEach(function (id) {
        var r = steps[id];
        if (!r || r.ok === false) { failedSteps.push({ stepId: id, status: 'failed' }); return; }
        okSteps.push({
          stepId: id,
          toolId: (r.provenance && r.provenance.tool) || '',
          status: 'ok',
          evidenceRefs: Array.isArray(r.evidenceIds) ? r.evidenceIds.slice() : []
        });
        usedStepIds.push(id);
      });
    }

    var evidence = [], explicit = [];
    if (Array.isArray(input.evidence)) explicit = input.evidence.slice();
    if (state && Array.isArray(state.evidence)) explicit = explicit.concat(state.evidence);
    Object.keys(steps).forEach(function (id) {
      var r = steps[id];
      if (!r || r.ok === false) return;
      if (Array.isArray(r.items)) {
        r.items.forEach(function (it) { if (it && it.evidenceId) evidence.push(it); });
      }
    });
    evidence = explicit.concat(evidence);
    evidence = evidence.map(function (e) { return clone(e); });

    var dd = dedupe(evidence);
    var evidenceById = {};
    dd.evidence.forEach(function (ev) { evidenceById[ev.evidenceId] = ev; });

    var claims = clone(input.claims || (state && state.claims) || []);
    var verdicts = clone(input.verdicts || (state && state.eval && state.eval.claimVerdicts) || []);
    var vmap = verdictMap(verdicts);
    var facts = [], inferences = [], hypotheses = [], unknowns = [];

    dd.evidence.forEach(function (ev) {
      if (ev.sourceType === 'database' || ev.sourceType === 'observation') {
        facts.push({ evidenceId: ev.evidenceId, title: ev.title, sourceId: ev.sourceId, sourceType: ev.sourceType });
      }
    });

    claims.forEach(function (c) {
      var v = vmap[c.id] || null;
      var item = {
        claimId: c.id, text: c.text, type: c.type,
        verdict: v ? v.verdict : null,
        rule: v ? v.rule : null,
        evidenceRefs: (c.support || []).map(function (x) { return x.eid; })
      };
      if (v && v.verdict === 'PASS') facts.push(item);
      else if (v && v.verdict === 'PARTIAL') inferences.push(item);
      else if (v && v.verdict === 'FAIL') hypotheses.push(item);
      else if (!c.support || !c.support.length) hypotheses.push(item);
      else inferences.push(item);
      if ((!v || v.verdict === 'FAIL') && c.required !== false) unknowns.push(item);
    });

    var sources = sourceList(dd.evidence);
    var cmp = compareClaims(claims, evidenceById);
    var conflicts = cmp.conflicts;
    var differences = cmp.differences;

    return {
      okSteps: okSteps,
      failedSteps: failedSteps,
      evidence: dd.evidence,
      duplicates: dd.duplicates,
      claims: claims,
      verdicts: verdicts,
      facts: facts,
      inferences: inferences,
      hypotheses: hypotheses,
      unknowns: unknowns,
      conflicts: conflicts,
      differences: differences,
      sources: sources,
      usedStepIds: usedStepIds,
      provenance: {
        reducedAt: new Date().toISOString(),
        inputEvidence: explicit.length + Object.keys(steps).length,
        independentSources: sources.length
      }
    };
  }

  root.AstroReducer = {
    reduce: reduce,
    dedupe: dedupe,
    evidenceKey: evidenceKey,
    fingerprint: fingerprint,
    sourceKeyOf: sourceKeyOf,
    conflictsOf: conflictsOf,
    differencesOf: differencesOf,
    compareClaims: compareClaims,
    unitInfo: unitInfo,
    convertValue: convertValue,
    normalizeUri: normUri,
    normDoi: normDoi,
    version: '1.2.0'
  };
})(typeof window !== 'undefined' ? window : global);
