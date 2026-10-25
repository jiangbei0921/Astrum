/* ASTRUM 运行时契约层
 *
 * 对应 docs/CONTRACTS.md 的三个契约：
 *   一、四档应答 Tier —— classify()
 *   二、执行记录 Exec —— exec()
 *   三、数值表示 Qty  —— Qty() / qtyText()
 *
 * 这一层只放「格式与判定」，不放业务逻辑，供 agents / research / app 共用。
 */
(function (global) {
  'use strict';

  /* ============================================================
     契约一：四档应答
     ============================================================ */
  var TIER = {
    compute: { key: 'compute', label: '可算', hint: '本地计算，可复算' },
    fetch:   { key: 'fetch',   label: '可查', hint: '外部真实数据，附出处' },
    infer:   { key: 'infer',   label: '可释', hint: '基于知识库的解释' },
    unknown: { key: 'unknown', label: '未知', hint: '无可靠依据' },
    chat:    { key: 'chat',    label: '对话', hint: '无需检索' }
  };

  function tierOf(key) { return TIER[key] || TIER.unknown; }

  /* 判定依据是「答案怎么来的」：
   * 先看有没有外部数据，再看是不是本地算出来的，最后看有没有知识库依据。
   * 注意：计算型答案的章节形态是 rank / observe / visual / mapref，
   * 不一定有 evidence，所以不能只认 evidence。 */
  function classify(ans) {
    if (!ans || !ans.sections) return TIER.unknown;
    /* 生产者最清楚自己这条答案是怎么来的，显式声明优先 */
    if (ans.meta && ans.meta.tier && TIER[ans.meta.tier]) return TIER[ans.meta.tier];
    var hasEvidence = false, hasWeb = false, hasComputed = false;
    for (var i = 0; i < ans.sections.length; i++) {
      var s = ans.sections[i];
      if (s.kind === 'evidence' && s.items && s.items.length) hasEvidence = true;
      if ((s.kind === 'web' && s.items && s.items.length) ||
          (s.kind === 'synthesis' && s.groups && s.groups.length)) hasWeb = true;
      if ((s.kind === 'rank' || s.kind === 'observe' || s.kind === 'visual' || s.kind === 'mapref') &&
          (s.items && s.items.length || s.kind === 'visual' || s.kind === 'mapref')) hasComputed = true;
    }
    if (hasWeb) return TIER.fetch;
    if (hasComputed || (ans.meta && ans.meta.computed)) return TIER.compute;
    if (hasEvidence) return TIER.infer;
    return TIER.unknown;
  }

  /* ============================================================
     契约二：执行记录
     ============================================================ */
  function exec(spec) {
    spec = spec || {};
    return {
      agent: spec.agent || 'muse',
      action: spec.action || '',
      tool: spec.tool || '',
      params: spec.params || null,
      result: spec.result || '',
      ok: spec.ok !== false,
      check: spec.check || null,
      ms: spec.ms || 0
    };
  }

  /* 自检结果：passed 决定 trace 上的对勾还是叹号 */
  function check(name, passed, detail) {
    return { name: name, passed: !!passed, detail: detail || '' };
  }

  /* ============================================================
     契约三：数值表示
     ============================================================ */
  var UNIT_CN = {
    ly: '光年', pc: '秒差距', au: 'AU', km: 'km', m: 'm',
    mag: '等', deg: '°', arcmin: '′', arcsec: '″',
    h: '时', min: '分', s: '秒', yr: '年', K: 'K', '%': '%'
  };

  function Qty(value, unit, opts) {
    opts = opts || {};
    return {
      v: value,
      u: unit || '',
      err: (opts.err == null ? null : opts.err),
      src: opts.src || '',
      basis: opts.basis || ''
    };
  }

  function qtyText(q) {
    if (q == null) return '';
    if (typeof q === 'string' || typeof q === 'number') return String(q);
    var u = UNIT_CN[q.u] || q.u || '';
    var num = (typeof q.v === 'number') ? q.v : String(q.v);
    var s = num + (q.err != null ? ' ± ' + q.err : '') + (u ? ' ' + u : '');
    return s;
  }

  /* 是否有可复算的出处：src 为空视为违反契约 */
  function qtyAttributable(q) {
    return !!(q && typeof q === 'object' && q.src);
  }

  /* 时刻必须带时区 */
  function fmtClock(hourFloat, tz) {
    var h = Math.floor(hourFloat) % 24;
    var m = Math.round((hourFloat - Math.floor(hourFloat)) * 60);
    if (m === 60) { m = 0; h = (h + 1) % 24; }
    var hh = (h < 10 ? '0' : '') + h;
    var mm = (m < 10 ? '0' : '') + m;
    var off = (tz >= 0 ? '+' : '') + tz;
    return hh + ':' + mm + ' (UTC' + off + ')';
  }

  global.AstroRuntime = {
    TIER: TIER,
    tierOf: tierOf,
    classify: classify,
    exec: exec,
    check: check,
    Qty: Qty,
    qtyText: qtyText,
    qtyAttributable: qtyAttributable,
    fmtClock: fmtClock,
    UNIT_CN: UNIT_CN
  };
})(typeof window !== 'undefined' ? window : global);
