/* ASTRUM · Claim / Evidence 契约层（P0-02）
 *
 * 对应冻结契约：
 *   docs/architecture/15-架构接口与数据契约统一规范.md §1.3/§1.4/§1.5/§5
 *   docs/architecture/06-科学证据与验证机制.md §4.0（R1–R4）、§5.1（CalcRecord）
 *
 * 边界（15 §3）：P0 只做数据结构 + 4 条判定规则 + 手写 fixture；
 * 不生成真实 Claim，不接 toSections，不实现新的科学判断流程。
 *
 * 关键约束：
 *   - Claim 不含 confidence
 *   - support/contradict 必带 basis: numeric|semantic
 *   - EvidenceItem 必带 trust
 *   - basis:'numeric' 只能给 strength:'weak'
 */
(function (root) {
  'use strict';

  var CLAIM_TYPES = ['quantitative', 'qualitative', 'causal', 'existence'];
  var CLAIM_SOURCES = ['kepler', 'kb', 'web', 'llm'];
  var SUPPORT_STRENGTHS = ['strong', 'partial', 'weak'];
  var SUPPORT_BASES = ['numeric', 'semantic'];
  var UNCERTAINTY_KINDS = ['measurement', 'model', 'definition', 'temporal'];
  var EVIDENCE_TIERS = ['primary', 'secondary', 'tertiary'];
  var EVIDENCE_KINDS = ['database', 'paper', 'encyclopedia', 'news', 'image'];
  var EVIDENCE_LANGS = ['en', 'zh', 'other'];
  var CLAIM_ORIGINS = ['p0-fixture', 'p3-generated'];

  var R2_WORDS = /已证实|已被证实|确定|证明/;

  function isArray(v) {
    return Object.prototype.toString.call(v) === '[object Array]';
  }

  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !isArray(v);
  }

  function isFiniteNumber(v) {
    return typeof v === 'number' && isFinite(v);
  }

  function includes(list, v) {
    return list.indexOf(v) >= 0;
  }

  function ClaimError(code, message, path) {
    var err = new Error(message);
    err.name = 'AstroClaimError';
    err.code = code;
    if (path) err.path = path;
    return err;
  }

  function fail(code, message, path) {
    throw ClaimError(code, message, path);
  }

  function stringArray(v) {
    if (!isArray(v)) return [];
    var out = [], i;
    for (i = 0; i < v.length; i++) {
      if (typeof v[i] === 'string') out.push(v[i]);
    }
    return out;
  }

  /* ============================================================
     1. CalcRecord（06 §5.1）
     ============================================================ */

  function makeCalcRecord(input) {
    if (!isPlainObject(input)) fail('E_CALC_SHAPE', 'CalcRecord 必须是对象', 'calc');
    if (!isFiniteNumber(input.value)) fail('E_CALC_INVALID', 'calc.value 必须是有限数字', 'calc.value');
    var textFields = ['unit', 'epoch', 'frame', 'source', 'method', 'computedAt'];
    var i;
    for (i = 0; i < textFields.length; i++) {
      if (typeof input[textFields[i]] !== 'string' || !input[textFields[i]]) {
        fail('E_CALC_INCOMPLETE', 'calc.' + textFields[i] + ' 必须是非空字符串', 'calc.' + textFields[i]);
      }
    }
    if (!isPlainObject(input.inputs)) fail('E_CALC_INCOMPLETE', 'calc.inputs 必须是对象', 'calc.inputs');
    if (input.uncertainty != null) {
      if (!isFiniteNumber(input.uncertainty) || input.uncertainty < 0) {
        fail('E_CALC_INVALID', 'calc.uncertainty 必须是非负数字或 null', 'calc.uncertainty');
      }
    }
    return {
      value: input.value,
      unit: input.unit,
      epoch: input.epoch,
      frame: input.frame,
      source: input.source,
      method: input.method,
      inputs: input.inputs,
      uncertainty: input.uncertainty == null ? null : input.uncertainty,
      computedAt: input.computedAt
    };
  }

  /* ============================================================
     2. EvidenceItem（15 §1.4）
     ============================================================ */

  function makeEvidence(input) {
    input = input || {};
    if (typeof input.id !== 'string' || !input.id) fail('E_EVIDENCE_ID', 'evidence.id 必须是非空字符串', 'evidence.id');
    if (!includes(EVIDENCE_TIERS, input.tier)) fail('E_EVIDENCE_TIER', 'evidence.tier 不在枚举范围', 'evidence.tier');
    if (!includes(EVIDENCE_KINDS, input.kind)) fail('E_EVIDENCE_KIND', 'evidence.kind 不在枚举范围', 'evidence.kind');
    if (!includes(EVIDENCE_LANGS, input.lang || 'en')) fail('E_EVIDENCE_LANG', 'evidence.lang 不在枚举范围', 'evidence.lang');
    var excerpt = typeof input.excerpt === 'string' ? input.excerpt : '';
    if (excerpt.length > 400) fail('E_EVIDENCE_EXCERPT', 'evidence.excerpt 不得超过 400 字', 'evidence.excerpt');

    var trustIn = input.trust || {};
    var doiValid = trustIn.doiValid == null ? null : !!trustIn.doiValid;
    var score = isFiniteNumber(trustIn.score) ? trustIn.score : 0;
    if (score < 0 || score > 1) fail('E_EVIDENCE_TRUST', 'evidence.trust.score 必须在 0..1', 'evidence.trust.score');

    return {
      id: input.id,
      uri: typeof input.uri === 'string' ? input.uri : '',
      domain: typeof input.domain === 'string' ? input.domain : '',
      tier: input.tier,
      kind: input.kind,
      title: typeof input.title === 'string' ? input.title : '',
      excerpt: excerpt,
      publishedAt: input.publishedAt == null ? null : input.publishedAt,
      retrievedAt: input.retrievedAt == null ? null : input.retrievedAt,
      lang: input.lang || 'en',
      independentOf: stringArray(input.independentOf),
      conflictsWith: stringArray(input.conflictsWith),
      trust: {
        whitelisted: !!trustIn.whitelisted,
        hasAuthor: !!trustIn.hasAuthor,
        hasDate: !!trustIn.hasDate,
        doiValid: doiValid,
        score: score
      }
    };
  }

  /* ============================================================
     3. Claim（15 §1.3）
     ============================================================ */

  function normalizeLink(item, path) {
    if (!isPlainObject(item)) fail('E_CLAIM_SUPPORT', path + ' 必须是对象', path);
    if (typeof item.eid !== 'string' || !item.eid) fail('E_CLAIM_SUPPORT', path + '.eid 必须是非空字符串', path + '.eid');
    if (!includes(SUPPORT_STRENGTHS, item.strength)) fail('E_CLAIM_SUPPORT', path + '.strength 不在枚举范围', path + '.strength');
    if (!includes(SUPPORT_BASES, item.basis)) fail('E_CLAIM_SUPPORT', path + '.basis 不在枚举范围', path + '.basis');
    /* 15 §5 硬规则：数值匹配 ≠ 证据支持 */
    if (item.basis === 'numeric' && item.strength !== 'weak') {
      fail('E_CLAIM_NUMERIC_STRENGTH', path + ' 的 basis=numeric 只能配 strength=weak', path + '.strength');
    }
    return { eid: item.eid, strength: item.strength, basis: item.basis };
  }

  function makeClaim(input) {
    input = input || {};
    if (typeof input.id !== 'string' || !input.id) fail('E_CLAIM_ID', 'claim.id 必须是非空字符串', 'claim.id');
    if (typeof input.text !== 'string') fail('E_CLAIM_TEXT', 'claim.text 必须是字符串', 'claim.text');
    if (!includes(CLAIM_TYPES, input.type)) fail('E_CLAIM_TYPE', 'claim.type 不在枚举范围', 'claim.type');
    if (!includes(CLAIM_SOURCES, input.source)) fail('E_CLAIM_SOURCE', 'claim.source 不在枚举范围', 'claim.source');

    var numbers = [], i;
    if (isArray(input.numbers)) {
      for (i = 0; i < input.numbers.length; i++) {
        var n = input.numbers[i];
        if (!isPlainObject(n) || !isFiniteNumber(n.value)) {
          fail('E_CLAIM_NUMBER', 'claim.numbers[' + i + '] 必须是 {value:number,...}', 'claim.numbers[' + i + ']');
        }
        numbers.push({
          value: n.value,
          unit: typeof n.unit === 'string' ? n.unit : '',
          norm: n.norm == null ? null : n.norm
        });
      }
    }

    var support = [], contradict = [];
    if (isArray(input.support)) {
      for (i = 0; i < input.support.length; i++) support.push(normalizeLink(input.support[i], 'claim.support[' + i + ']'));
    }
    if (isArray(input.contradict)) {
      for (i = 0; i < input.contradict.length; i++) contradict.push(normalizeLink(input.contradict[i], 'claim.contradict[' + i + ']'));
    }

    var uncertainty = null;
    if (input.uncertainty != null) {
      if (!isPlainObject(input.uncertainty) || !includes(UNCERTAINTY_KINDS, input.uncertainty.kind)) {
        fail('E_CLAIM_UNCERTAINTY', 'claim.uncertainty.kind 不在枚举范围', 'claim.uncertainty.kind');
      }
      uncertainty = {
        kind: input.uncertainty.kind,
        value: input.uncertainty.value == null ? null : input.uncertainty.value,
        basis: typeof input.uncertainty.basis === 'string' ? input.uncertainty.basis : ''
      };
    }

    var origin = includes(CLAIM_ORIGINS, input.origin) ? input.origin : 'p0-fixture';

    /* 显式白名单构造：confidence 永远不会进入 Claim */
    return {
      id: input.id,
      text: input.text,
      type: input.type,
      entities: stringArray(input.entities),
      numbers: numbers,
      premises: stringArray(input.premises),
      support: support,
      contradict: contradict,
      uncertainty: uncertainty,
      source: input.source,
      calc: input.calc == null ? null : makeCalcRecord(input.calc),
      required: input.required === true,
      origin: origin
    };
  }

  /* ---------- Claim 与 Evidence 关联 ---------- */

  function evidenceId(evidence) {
    if (typeof evidence === 'string') return evidence;
    if (isPlainObject(evidence) && typeof evidence.id === 'string' && evidence.id) return evidence.id;
    fail('E_CLAIM_SUPPORT', '关联的 Evidence 缺少 id', 'claim.support.eid');
    return '';
  }

  function linkSupport(claim, evidence, strength, basis) {
    if (!claim || !isArray(claim.support)) fail('E_CLAIM_SUPPORT', 'claim.support 必须是数组', 'claim.support');
    claim.support.push(normalizeLink({ eid: evidenceId(evidence), strength: strength, basis: basis }, 'claim.support'));
    return claim;
  }

  function linkContradict(claim, evidence, strength, basis) {
    if (!claim || !isArray(claim.contradict)) fail('E_CLAIM_CONTRADICT', 'claim.contradict 必须是数组', 'claim.contradict');
    claim.contradict.push(normalizeLink({ eid: evidenceId(evidence), strength: strength, basis: basis }, 'claim.contradict'));
    return claim;
  }

  /* ============================================================
     4. 四维判定（P0 只实现 Claim 级规则，不接真实生成）
     ============================================================ */

  function dim(status, checks) {
    return { status: status, checks: checks || [] };
  }

  function check(name, ok, detail) {
    return { name: name, ok: !!ok, source: 'rule', detail: detail || '' };
  }

  function premiseFailed(id, ctx) {
    if (!ctx) return true;
    if (ctx.premiseVerdicts && Object.prototype.hasOwnProperty.call(ctx.premiseVerdicts, id)) {
      return ctx.premiseVerdicts[id] !== 'PASS';
    }
    var list = ctx.claims || [];
    var found = null, i;
    for (i = 0; i < list.length; i++) {
      if (list[i] && list[i].id === id) { found = list[i]; break; }
    }
    if (!found) return true;                    /* 前提缺失 = 断裂 */
    if (!ctx._stack) ctx._stack = [];
    if (ctx._stack.indexOf(id) >= 0) return true; /* 循环依赖按断裂处理 */
    ctx._stack.push(id);
    var result = judgeClaim(found, ctx);
    ctx._stack.pop();
    return result.verdict !== 'PASS';
  }

  function judgeClaim(claim, ctx) {
    ctx = ctx || {};
    var support = isArray(claim.support) ? claim.support : [];
    var contradict = isArray(claim.contradict) ? claim.contradict : [];
    var i;
    var allWeak = support.length > 0;
    var allNumeric = support.length > 0;
    var hasStrongSemantic = false;
    var hasPartialSemantic = false;

    for (i = 0; i < support.length; i++) {
      var s = support[i];
      if (s.strength !== 'weak') allWeak = false;
      if (s.basis !== 'numeric') allNumeric = false;
      if (s.basis === 'semantic' && s.strength === 'strong') hasStrongSemantic = true;
      if (s.basis === 'semantic' && s.strength === 'partial') hasPartialSemantic = true;
    }

    /* -------- numeric -------- */
    var numericChecks = [];
    var numericStatus = 'PASS';
    if (claim.type === 'quantitative') {
      if (!claim.calc) {
        numericStatus = 'PARTIAL';
        numericChecks.push(check('calc.present', false, '定量 claim 缺少 CalcRecord'));
      } else {
        var calcOk = true;
        if (!claim.calc.epoch || !claim.calc.frame || !claim.calc.inputs) calcOk = false;
        numericChecks.push(check('calc.recomputable', calcOk, 'epoch/frame/inputs 齐全'));
        if (claim.uncertainty == null) {
          numericStatus = 'FAIL';
          numericChecks.push(check('uncertainty.present', false, '定量 claim 缺少 uncertainty'));
        } else {
          numericChecks.push(check('uncertainty.present', true, '存在误差范围'));
        }
        if (!calcOk) numericStatus = 'FAIL';
      }
    } else {
      numericChecks.push(check('numeric.not-applicable', true, '非定量 claim，无数值一致性要求'));
    }

    /* -------- entity（P0 只做结构基线） -------- */
    var entityChecks = [check('entity.structural', true, '实体字段结构合法；别名校验在 P3')];

    /* -------- semantic -------- */
    var semanticStatus = 'PASS';
    var semanticChecks = [];
    if (!support.length) {
      semanticStatus = 'FAIL';
      semanticChecks.push(check('support.present', false, 'required claim 缺少 evidence support'));
    } else if (allNumeric) {
      semanticStatus = 'PARTIAL';
      semanticChecks.push(check('support.semantic', false, '仅有数值匹配，不等于证据支持'));
    } else if (hasStrongSemantic) {
      semanticChecks.push(check('support.semantic', true, '存在 strong semantic support'));
    } else if (hasPartialSemantic) {
      semanticStatus = 'PARTIAL';
      semanticChecks.push(check('support.semantic', false, '仅有 partial semantic support'));
    } else {
      semanticStatus = 'PARTIAL';
      semanticChecks.push(check('support.semantic', false, '仅有 weak support'));
    }

    /* -------- source（P0 不计算可信度） -------- */
    var sourceChecks = [check('source.structural', true, '来源字段结构合法；可信度在 P3 计算')];

    var verdict = 'PASS';
    var rule = 'NONE';

    /* R4 优先：定量但无 uncertainty → FAIL */
    if (claim.type === 'quantitative' && claim.uncertainty == null) {
      verdict = 'FAIL';
      rule = 'R4';
      numericStatus = 'FAIL';
    } else if (allWeak && R2_WORDS.test(claim.text)) {
      /* R2：全 weak 却写「已证实/确定/证明」 → FAIL */
      verdict = 'FAIL';
      rule = 'R2';
      semanticStatus = 'FAIL';
      semanticChecks.push(check('r2.strength-match', false, '措辞强度高于证据强度'));
    } else {
      if (!support.length) {
        verdict = 'FAIL';
        rule = 'SUPPORT_EMPTY';
      }

      /* R1：任一 premise 未通过 → 最高 PARTIAL */
      var premises = isArray(claim.premises) ? claim.premises : [];
      var broken = false;
      for (i = 0; i < premises.length; i++) {
        if (premiseFailed(premises[i], ctx)) broken = true;
      }
      if (broken && verdict !== 'FAIL') {
        verdict = 'PARTIAL';
        rule = 'R1';
      }

      /* R3：矛盾未处理 → PARTIAL */
      if (contradict.length && !(claim.uncertainty && claim.uncertainty.kind === 'model')) {
        if (verdict !== 'FAIL') {
          verdict = 'PARTIAL';
          if (rule === 'NONE' || rule === 'NUMERIC_ONLY') rule = 'R3';
        }
      }

      /* 仅有数值匹配 → 最高 PARTIAL */
      if (allNumeric && verdict === 'PASS') {
        verdict = 'PARTIAL';
        rule = 'NUMERIC_ONLY';
      }

      /* numeric 未通过时不得 PASS */
      if (numericStatus === 'FAIL' && verdict !== 'FAIL') {
        verdict = 'FAIL';
        rule = 'NUMERIC_FAIL';
      } else if (numericStatus === 'PARTIAL' && verdict === 'PASS') {
        verdict = 'PARTIAL';
        rule = 'NUMERIC_PARTIAL';
      }

      if (semanticStatus === 'PARTIAL' && verdict === 'PASS') {
        verdict = 'PARTIAL';
        rule = 'SEMANTIC_PARTIAL';
      }
    }

    return {
      verdict: verdict,
      rule: rule,
      dimensions: {
        numeric: dim(numericStatus, numericChecks),
        entity: dim('PASS', entityChecks),
        semantic: dim(semanticStatus, semanticChecks),
        source: dim('PASS', sourceChecks)
      }
    };
  }

  /* ============================================================
     5. 6 条 fixture（字段值固定；测试只断言 verdict/rule）
     ============================================================ */

  function makeCalc(overrides) {
    var base = {
      value: 43.2,
      unit: 'deg',
      epoch: 'J2000',
      frame: 'topocentric',
      source: 'astro.local',
      method: 'altAz(lst,dec,jd,lat,lon)',
      inputs: { ra: 5.588, dec: -5.391, jd: 2461342.5, lat: 39.9, lon: 116.4 },
      uncertainty: 0.3,
      computedAt: '2026-10-30T11:20:00Z'
    };
    var key;
    for (key in overrides || {}) {
      if (Object.prototype.hasOwnProperty.call(overrides, key)) base[key] = overrides[key];
    }
    return base;
  }

  function makeTrust(score) {
    return { whitelisted: true, hasAuthor: true, hasDate: true, doiValid: true, score: score };
  }

  var C1 = {
    id: 'C1',
    claim: makeClaim({
      id: 'c1',
      text: 'M42 的视高度为 43.2°',
      type: 'quantitative',
      entities: ['M42'],
      numbers: [{ value: 43.2, unit: 'deg', norm: '43.2 deg' }],
      premises: [],
      support: [{ eid: 'e1', strength: 'strong', basis: 'semantic' }],
      contradict: [],
      uncertainty: { kind: 'measurement', value: 0.3, basis: '星历精度 ±0.5°' },
      source: 'kepler',
      calc: makeCalc(),
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [makeEvidence({
      id: 'e1', uri: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=M42',
      domain: 'simbad.u-strasbg.fr', tier: 'primary', kind: 'database',
      title: 'M42 星表条目', excerpt: 'M42 位于猎户座，视高度随观测地与时刻变化。',
      publishedAt: '2024-01-01', retrievedAt: '2026-10-30', lang: 'en',
      independentOf: [], conflictsWith: [], trust: makeTrust(0.9)
    })],
    expected: { verdict: 'PASS', rule: 'NONE' }
  };

  var C2 = {
    id: 'C2',
    claim: makeClaim({
      id: 'c2',
      text: 'M42 是恒星形成区',
      type: 'qualitative',
      entities: ['M42'],
      numbers: [],
      premises: [],
      support: [{ eid: 'e2', strength: 'strong', basis: 'semantic' }],
      contradict: [],
      uncertainty: null,
      source: 'kb',
      calc: null,
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [makeEvidence({
      id: 'e2', uri: 'https://en.wikipedia.org/wiki/Orion_Nebula',
      domain: 'en.wikipedia.org', tier: 'secondary', kind: 'encyclopedia',
      title: 'Orion Nebula', excerpt: 'The Orion Nebula is a star-forming region in the Milky Way.',
      publishedAt: '2026-01-01', retrievedAt: '2026-10-30', lang: 'en',
      independentOf: [], conflictsWith: [], trust: makeTrust(0.8)
    })],
    expected: { verdict: 'PASS', rule: 'NONE' }
  };

  var C3 = {
    id: 'C3',
    claim: makeClaim({
      id: 'c3',
      text: 'M42 的视高度为 43.2°',
      type: 'quantitative',
      entities: ['M42'],
      numbers: [{ value: 43.2, unit: 'deg', norm: '43.2 deg' }],
      premises: [],
      support: [{ eid: 'e3', strength: 'weak', basis: 'numeric' }],
      contradict: [],
      uncertainty: { kind: 'measurement', value: 0.3, basis: '星历精度 ±0.5°' },
      source: 'kepler',
      calc: makeCalc(),
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [makeEvidence({
      id: 'e3', uri: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=M42',
      domain: 'simbad.u-strasbg.fr', tier: 'primary', kind: 'database',
      title: 'M42 星表条目', excerpt: 'M42 43.2 deg 2026-10-30',
      publishedAt: '2024-01-01', retrievedAt: '2026-10-30', lang: 'en',
      independentOf: [], conflictsWith: [], trust: makeTrust(0.9)
    })],
    expected: { verdict: 'PARTIAL', rule: 'NUMERIC_ONLY' }
  };

  var C4 = {
    id: 'C4',
    claim: makeClaim({
      id: 'c4',
      text: 'M42 的视高度为 43.2°',
      type: 'quantitative',
      entities: ['M42'],
      numbers: [{ value: 43.2, unit: 'deg', norm: '43.2 deg' }],
      premises: [],
      support: [{ eid: 'e4', strength: 'strong', basis: 'semantic' }],
      contradict: [],
      uncertainty: null,
      source: 'kepler',
      calc: makeCalc({ uncertainty: null }),
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [makeEvidence({
      id: 'e4', uri: 'https://simbad.u-strasbg.fr/simbad/sim-id?Ident=M42',
      domain: 'simbad.u-strasbg.fr', tier: 'primary', kind: 'database',
      title: 'M42 星表条目', excerpt: 'M42 位于猎户座。',
      publishedAt: '2024-01-01', retrievedAt: '2026-10-30', lang: 'en',
      independentOf: [], conflictsWith: [], trust: makeTrust(0.9)
    })],
    expected: { verdict: 'FAIL', rule: 'R4' }
  };

  var C5 = {
    id: 'C5',
    claim: makeClaim({
      id: 'c5',
      text: 'M42 的距离存在两种测量口径',
      type: 'qualitative',
      entities: ['M42'],
      numbers: [],
      premises: [],
      support: [{ eid: 'e5a', strength: 'strong', basis: 'semantic' }],
      contradict: [{ eid: 'e5b', strength: 'strong', basis: 'semantic' }],
      uncertainty: { kind: 'definition', value: null, basis: '测量口径差异' },
      source: 'kb',
      calc: null,
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [
      makeEvidence({
        id: 'e5a', uri: 'https://arxiv.org/abs/2401.00001', domain: 'arxiv.org',
        tier: 'primary', kind: 'paper', title: 'Distance to M42 (A)',
        excerpt: 'M42 的距离测量值为 1344 光年。', publishedAt: '2024-01-01',
        retrievedAt: '2026-10-30', lang: 'en', independentOf: [], conflictsWith: ['e5b'],
        trust: makeTrust(0.85)
      }),
      makeEvidence({
        id: 'e5b', uri: 'https://arxiv.org/abs/2401.00002', domain: 'arxiv.org',
        tier: 'primary', kind: 'paper', title: 'Distance to M42 (B)',
        excerpt: '另一项测量给出不同的距离口径。', publishedAt: '2024-02-01',
        retrievedAt: '2026-10-30', lang: 'en', independentOf: [], conflictsWith: ['e5a'],
        trust: makeTrust(0.8)
      })
    ],
    expected: { verdict: 'PARTIAL', rule: 'R3' }
  };

  var C6 = {
    id: 'C6',
    claim: makeClaim({
      id: 'c6',
      text: 'M42 已被证实是恒星形成区',
      type: 'qualitative',
      entities: ['M42'],
      numbers: [],
      premises: [],
      support: [{ eid: 'e6', strength: 'weak', basis: 'semantic' }],
      contradict: [],
      uncertainty: null,
      source: 'web',
      calc: null,
      required: true,
      origin: 'p0-fixture'
    }),
    evidence: [makeEvidence({
      id: 'e6', uri: 'https://example.org/m42', domain: 'example.org',
      tier: 'tertiary', kind: 'news', title: 'M42 转载',
      excerpt: 'M42 可能是恒星形成区。', publishedAt: '2026-01-01',
      retrievedAt: '2026-10-30', lang: 'en', independentOf: [], conflictsWith: [],
      trust: { whitelisted: false, hasAuthor: false, hasDate: true, doiValid: null, score: 0.2 }
    })],
    expected: { verdict: 'FAIL', rule: 'R2' }
  };

  var FIXTURE = { C1: C1, C2: C2, C3: C3, C4: C4, C5: C5, C6: C6 };

  /* R1 派生用例：取 C2 副本，让 premises 指向一条判定失败的 claim。
   * 不新增第 7 条 fixture，保持 fixture 总数为 6。 */
  var r1Raw = JSON.parse(JSON.stringify(C2.claim));
  r1Raw.id = 'c2-r1';
  r1Raw.premises = ['c_bad'];
  var R1_DERIVED = {
    id: 'R1',
    claim: makeClaim(r1Raw),
    evidence: C2.evidence.slice(),
    claims: [makeClaim({
      id: 'c_bad',
      text: '缺失证据的前提',
      type: 'qualitative',
      entities: [],
      numbers: [],
      premises: [],
      support: [],
      contradict: [],
      uncertainty: null,
      source: 'llm',
      calc: null,
      required: false,
      origin: 'p0-fixture'
    })],
    expected: { verdict: 'PARTIAL', rule: 'R1' }
  };

  /* ============================================================
     6. Qty 兼容（P0 不改 runtime.js；P0-03 再接入）
     ============================================================ */

  function qtyCompat(input) {
    input = input || {};
    var out = {}, key;
    for (key in input) {
      if (Object.prototype.hasOwnProperty.call(input, key)) out[key] = input[key];
    }
    if (!Object.prototype.hasOwnProperty.call(out, 'value') && Object.prototype.hasOwnProperty.call(input, 'v')) {
      out.value = input.v;
    }
    if (!Object.prototype.hasOwnProperty.call(out, 'unit') && Object.prototype.hasOwnProperty.call(input, 'u')) {
      out.unit = input.u;
    }
    var hasNew = input.epoch != null && input.frame != null && input.inputs != null && input.uncertainty != null;
    if (!hasNew) out.legacy = true;
    return out;
  }

  /* ============================================================
     7. D5：真实 Evidence → Claim 构建（不修改 judgeClaim）
     ============================================================ */

  function hashShort(value) {
    var T = root.AstroTask;
    if (T && T.sha256Hex) return T.sha256Hex(T.canonicalJSON(value)).slice(0, 12);
    return String(value == null ? '' : value).length.toString(36);
  }

  function numText(n, unit) {
    if (!isFiniteNumber(n)) return '—';
    return (Math.round(n * 1000) / 1000) + (unit ? ' ' + unit : '');
  }

  /* 论文摘要在前 320 字里经常还在讲背景，真正的测量值（如 414 ± 7 pc）
   * 往往出现在后面的结果句。旧实现直接 slice(0, 320)，会把数字截掉，
   * 造成「distance ... to be pc.」这类不能核对的结论。
   * 这里按「含数值/单位/标题词」给句子打分，选出最能支撑结论的句子。 */
  function keyExcerpt(text, title) {
    var src = String(text || '')
      .replace(/^\s*(ABSTRACT|Abstract)\s*[:：.]?\s*/, '')
      .replace(/\b(Context|Aims|Methods|Results|Conclusions)\.\s*/g, '')
      .replace(/\s+/g, ' ').trim();
    if (!src) return '';
    var sents = src.split(/[.!?]\s+/).map(function (s) { return s.trim(); }).filter(function (s) { return s.length > 20; });
    if (!sents.length) return src.slice(0, 320);
    var tw = String(title || '').toLowerCase().split(/[^a-z0-9]+/).filter(function (w) {
      return w.length > 3;
    });
    /* 摘要里出现单位却缺少数值（如 "to be pc."），通常是 OpenAlex 摘要重建
     * 丢失公式/排版，或原文只给了图表。不能把它当成测量结果。 */
    function hasUnitGap(s) {
      return !/\d/.test(s) && /(?:to be|is|are|of|at|≈|=)\s*(?:pc|kpc|Mpc|ly|light-year|km\/s|K|mag|AU|arcsec)\b/i.test(s);
    }
    function score(s) {
      var low = s.toLowerCase();
      var n = (s.match(/\d+(?:[.,]\d+)?|±/g) || []).length;
      var u = (/pc|kpc|mpc|light-year|ly\b|km\/s|redshift|z\s*[=~∼]|solar mass|m☉|parallax|arcsec|mag\b|au\b/i.test(s)) ? 1 : 0;
      var t = 0;
      tw.forEach(function (w) { if (low.indexOf(w) >= 0) t++; });
      return n * 2 + u + t - (hasUnitGap(s) ? 6 : 0);
    }
    var idx = 0, best = -1, gap = false, gapText = '';
    sents.forEach(function (s, i) {
      var sc = score(s);
      if (hasUnitGap(s)) { gap = true; gapText = gapText || s; }
      if (sc > best) { best = sc; idx = i; }
    });
    var hasNumeric = sents.some(function (s) {
      return /\d/.test(s) && /pc|kpc|mpc|light-year|ly\b|km\/s|redshift|z\s*[=~∼]|solar mass|m☉|parallax|arcsec|mag\b|au\b/i.test(s);
    });
    if (gap && !hasNumeric) {
      return '摘要缺少测量数值（检索到的摘要为「' + gapText +
        '」）；未获取全文，不能据此引用具体数值。';
    }
    var out = sents[idx];
    if (out.length < 100 && sents[idx + 1]) out += '. ' + sents[idx + 1];
    return out.slice(0, 320);
  }

  function buildClaimsFromEvidence(evidence, opts) {
    opts = opts || {};
    var out = [], seen = {};
    (evidence || []).forEach(function (ev) {
      if (!ev || !ev.evidenceId) return;
      var c = null;
      var content = ev.content || {};
      if (ev.sourceType === 'database' && ev.provenance && ev.provenance.service === 'SIMBAD TAP') {
        var ident = content.mainId || ev.title;
        var otype = content.otype ? ('，类型 ' + content.otype) : '';
        c = makeClaim({
          id: 'c_simbad_' + hashShort({ id: ev.evidenceId, q: 'ident' }),
          text: 'SIMBAD 将「' + (ev.provenance.query || ident) + '」解析为「' + ident + '」' + otype,
          type: 'existence',
          source: 'web',
          entities: [ident],
          support: [{ eid: ev.evidenceId, strength: 'strong', basis: 'semantic' }],
          required: true,
          origin: 'p0-fixture'
        });
        out.push(c);
        if (isFiniteNumber(content.ra) && isFiniteNumber(content.dec)) {
          out.push(makeClaim({
            id: 'c_simbad_' + hashShort({ id: ev.evidenceId, q: 'coord' }),
            text: ident + ' 的坐标（SIMBAD basic 表）为 RA ' + numText(content.ra, 'deg') +
              ' / Dec ' + numText(content.dec, 'deg'),
            type: 'qualitative',
            source: 'web',
            entities: [ident],
            support: [{ eid: ev.evidenceId, strength: 'strong', basis: 'semantic' }],
            required: false,
            origin: 'p0-fixture'
          }));
        }
        if (isFiniteNumber(content.plx) && content.plx > 0) {
          out.push(makeClaim({
            id: 'c_simbad_' + hashShort({ id: ev.evidenceId, q: 'plx' }),
            text: ident + ' 的视差为 ' + numText(content.plx, 'mas') +
              (isFiniteNumber(content.distanceLy) ? '，换算距离约 ' + content.distanceLy + ' 光年' : ''),
            type: 'qualitative',
            source: 'web',
            entities: [ident],
            support: [{ eid: ev.evidenceId, strength: 'strong', basis: 'semantic' }],
            required: false,
            origin: 'p0-fixture'
          }));
        }
      } else if (ev.sourceType === 'paper') {
        /* 论文结论只能来自摘要正文；没有摘要时不要拿 snippet（可能是标题或
         * OpenAlex 主题词列表）冒充摘要。 */
        var excerpt = String(content.excerpt || '').trim();
        if (!excerpt) return;
        /* 有些 Provider 把主题词列表塞进 abstract 字段（用「、」分隔、没有句号）。
         * 这类内容不是摘要，不能生成结论。 */
        if (!/[.!?。！？]/.test(excerpt)) {
          var kw = excerpt.split(/[、,，;；]/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
          if (kw.length >= 4 && kw.every(function (x) { return x.length <= 30; })) return;
        }
        var fulltext = content.contentLevel === 'fulltext' || content.fulltext === true;
        c = makeClaim({
          id: 'c_paper_' + hashShort({ id: ev.evidenceId, q: 'abstract' }),
          text: keyExcerpt(excerpt, ev.title),
          type: 'qualitative',
          source: 'web',
          entities: [ev.title || ''],
          support: [{
            eid: ev.evidenceId,
            strength: fulltext ? 'partial' : (excerpt.length >= 120 ? 'partial' : 'weak'),
            basis: 'semantic'
          }],
          required: false,
          origin: 'p0-fixture'
        });
        out.push(c);
        /* 从摘要里抽取带单位的测量值，交给 Reducer 按「实体|量纲」比较。
         * 只在问距离/测距时抽取：JWST 发现类摘要里的 "1 Mpc" 往往是尺度，
         * 不是该论文的测量结果，抽出来会伪造一个距离值。 */
        var wantsDistance = /距离|测距|distance|parallax/i.test(String(opts.query || ''));
        var mm = wantsDistance && excerpt.match(/(\d+(?:[.,]\d+)?)\s*(?:±\s*(\d+(?:[.,]\d+)?))?\s*(kpc|Mpc|pc|ly|light[- ]year(?:s)?)\b/i);
        if (mm) {
          var val = Number(mm[1].replace(/,/g, ''));
          var unc = mm[2] ? Number(mm[2].replace(/,/g, '')) : null;
          var unit = /light/i.test(mm[3]) ? 'ly' : mm[3].toLowerCase();
          var ent = (ev.provenance && ev.provenance.query) || ev.title || '';
          if (isFinite(val) && val > 0) {
            out.push(makeClaim({
              id: 'c_paper_qty_' + hashShort({ id: ev.evidenceId, q: 'qty' }),
              text: '摘要测量值：' + val + (unc != null ? ' ± ' + unc : '') + ' ' + unit +
                '（' + (ev.title || '') + '）',
              type: 'quantitative',
              source: 'web',
              entities: [ent],
              numbers: [{ value: val, unit: unit }],
              uncertainty: unc != null ? {
                kind: 'measurement', value: unc, basis: '论文摘要给出的 ± 误差'
              } : null,
              support: [{ eid: ev.evidenceId, strength: 'weak', basis: 'numeric' }],
              required: false,
              origin: 'p0-fixture'
            }));
          }
        }
      } else if (ev.sourceType === 'observation' && content.stats) {
        var st = content.stats;
        if (!isFiniteNumber(st.mean) || !isFiniteNumber(st.count) || !st.count) return;
        var unit = content.bunit || (content.primary && content.primary.bunit) || 'ADU';
        var std = isFiniteNumber(st.std) ? st.std : 0;
        var uncertainty = {
          kind: 'measurement',
          value: std / Math.sqrt(Math.max(1, st.count)),
          basis: '样本均值的标准误（SEM）= 样本标准差 / sqrt(n)；不是原始像素的离散程度'
        };
        c = makeClaim({
          id: 'c_fits_' + hashShort({ id: ev.evidenceId, q: 'mean' }),
          text: (ev.title || 'FITS') + ' 主 HDU 采样像素平均值 ' + numText(st.mean, unit) +
            '（样本 ' + st.count + '，min ' + numText(st.min, unit) + '，max ' + numText(st.max, unit) + '）',
          type: 'quantitative',
          source: 'kb',
          entities: [content.object || ev.title || ''],
          numbers: [{ value: st.mean, unit: unit }],
          support: [{ eid: ev.evidenceId, strength: 'strong', basis: 'semantic' }],
          uncertainty: uncertainty,
          calc: {
            value: st.mean,
            unit: unit,
            epoch: 'J2000',
            frame: 'image',
            source: 'fits.parse',
            method: 'sample-pixel-stats',
            inputs: {
              file: ev.title,
              fileHash: ev.provenance && ev.provenance.fileHash,
              bitpix: content.primary && content.primary.bitpix,
              sampleCount: st.count
            },
            computedAt: ev.provenance && ev.provenance.parsedAt,
            uncertainty: uncertainty.value
          },
          required: true,
          origin: 'p0-fixture'
        });
        out.push(c);
      } else if (ev.sourceType === 'calculation' && isFiniteNumber(content.value)) {
        c = makeClaim({
          id: 'c_calc_' + hashShort({ id: ev.evidenceId, q: 'value' }),
          text: (content.target || ev.title || '目标') + ' 的 ' + (content.method || '本地计算') +
            ' 结果为 ' + numText(content.value, content.unit),
          type: 'quantitative',
          source: 'kepler',
          entities: [content.target || ''],
          numbers: [{ value: content.value, unit: content.unit || '' }],
          support: [{ eid: ev.evidenceId, strength: 'strong', basis: 'semantic' }],
          uncertainty: { kind: 'model', value: null, basis: '本地模型计算，误差量级见页脚' },
          calc: {
            value: content.value,
            unit: content.unit || 'deg',
            epoch: content.epoch || 'J2000',
            frame: content.frame || 'topocentric',
            source: 'kepler',
            method: content.method || 'kepler',
            inputs: content.inputs || {},
            computedAt: ev.retrievedAt
          },
          required: false,
          origin: 'p0-fixture'
        });
        out.push(c);
      }
      if (c) {
        var key = c.id;
        if (seen[key]) return;
        seen[key] = 1;
      }
    });
    return out;
  }

  function judgeAll(claims, ctx) {
    ctx = ctx || {};
    var list = Array.isArray(claims) ? claims : [];
    var verdicts = list.map(function (c) {
      var r = judgeClaim(c, ctx);
      return {
        claimId: c.id,
        id: c.id,
        verdict: r.verdict,
        rule: r.rule,
        dimensions: r.dimensions || null,
        required: c.required === true
      };
    });
    var summary = { PASS: 0, PARTIAL: 0, FAIL: 0, UNKNOWN: 0 };
    verdicts.forEach(function (v) {
      if (summary[v.verdict] == null) summary.UNKNOWN += 1;
      else summary[v.verdict] += 1;
    });
    var overall = 'PASS';
    if (verdicts.some(function (v) { return v.verdict === 'FAIL' && v.required; })) overall = 'FAIL';
    else if (verdicts.some(function (v) { return v.verdict !== 'PASS'; })) overall = 'PARTIAL';
    if (!verdicts.length) overall = 'PARTIAL';
    return { claims: list, verdicts: verdicts, summary: summary, overall: overall };
  }

  root.AstroClaims = {
    CLAIM_TYPES: CLAIM_TYPES,
    CLAIM_SOURCES: CLAIM_SOURCES,
    SUPPORT_STRENGTHS: SUPPORT_STRENGTHS,
    SUPPORT_BASES: SUPPORT_BASES,
    UNCERTAINTY_KINDS: UNCERTAINTY_KINDS,
    makeClaim: makeClaim,
    makeEvidence: makeEvidence,
    makeCalcRecord: makeCalcRecord,
    linkSupport: linkSupport,
    linkContradict: linkContradict,
    judgeClaim: judgeClaim,
    buildClaimsFromEvidence: buildClaimsFromEvidence,
    judgeAll: judgeAll,
    FIXTURE: FIXTURE,
    R1_DERIVED: R1_DERIVED,
    qtyCompat: qtyCompat,
    ClaimError: ClaimError
  };
})(typeof window !== 'undefined' ? window : global);
