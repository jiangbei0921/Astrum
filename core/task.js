/* ASTRUM · 任务契约层（P0-02）
 *
 * 对应冻结契约：
 *   docs/architecture/15-架构接口与数据契约统一规范.md §1.1/§1.2/§2
 *   docs/architecture/P0-01-目标架构总蓝图.md §3.4/§7.1/§8.6/§9.2
 *
 * 职责仅限「结构 + 校验 + 合法转移」：
 *   - TaskState 创建、序列化、不变量校验
 *   - Phase / Step 数据结构与状态机
 *   - Event 轻量记录（只追加，不驱动执行）
 *   - Budget 唯一权威分档与 used≤limit 约束
 *
 * 明确不做：事件总线、事件持久化、取消传播、任务恢复/重放、写盘。
 * TaskState 不挂载到 answer，也不进入 sections/trace/meta。
 */
(function (root) {
  'use strict';

  var PHASES = [
    'INIT', 'UNDERSTAND', 'ROUTE', 'LEGACY', 'PLAN', 'EXECUTE',
    'PROGRESS', 'JUDGE', 'COMPOSE', 'DONE', 'PARTIAL', 'FAILED', 'ABORTED'
  ];

  var TERMINAL_PHASES = ['DONE', 'PARTIAL', 'FAILED'];

  var STEP_STATUS = [
    'pending', 'ready', 'running', 'ok', 'failed', 'skipped', 'blocked', 'aborted'
  ];

  var EVENT_TYPES = [
    'phase.changed', 'step.started', 'step.ok', 'step.failed',
    'step.skipped', 'progress.decided', 'verdict.issued', 'task.aborted',
    'step.retry', 'step.cancelled', 'task.cancelled', 'task.replanned', 'task.recovered',
    'plan.expanded'
  ];

  /* P0-01 §7.1：payload 只存最小上下文 */
  var EVENT_PAYLOAD_KEYS = ['from', 'to', 'action', 'verdict', 'reason', 'attempt'];

  /* P0-01 §9.2 唯一预算表 */
  var BUDGET_LIMITS = {
    L1: { ms: 300, tokens: 0, llmCalls: 0, searches: 0, parallel: 1, replans: 0, appends: 0, retries: 0 },
    L2: { ms: 3000, tokens: 1200, llmCalls: 1, searches: 1, parallel: 2, replans: 1, appends: 1, retries: 1 },
    L3: { ms: 15000, tokens: 3000, llmCalls: 2, searches: 2, parallel: 4, replans: 2, appends: 3, retries: 1 },
    L4: { ms: 120000, tokens: 8000, llmCalls: 3, searches: 3, parallel: 4, replans: 2, appends: 3, retries: 1 }
  };

  var BUDGET_FIELDS = ['ms', 'tokens', 'llmCalls', 'searches', 'parallel', 'replans', 'appends', 'retries'];

  /* §3.4 合法转移唯一权威。JUDGE→EXECUTE 另受 retryHint/retries 约束。 */
  var LEGAL_TRANSITIONS = {
    INIT: ['UNDERSTAND', 'ABORTED'],
    UNDERSTAND: ['ROUTE'],
    ROUTE: ['LEGACY', 'PLAN'],
    LEGACY: ['DONE'],
    PLAN: ['EXECUTE', 'LEGACY', 'ABORTED'],
    EXECUTE: ['PROGRESS', 'ABORTED'],
    PROGRESS: ['EXECUTE', 'PLAN', 'JUDGE'],
    JUDGE: ['COMPOSE', 'EXECUTE', 'FAILED'],
    COMPOSE: ['DONE', 'PARTIAL'],
    ABORTED: ['COMPOSE'],
    DONE: [],
    PARTIAL: [],
    FAILED: []
  };

  var MODES = ['single', 'compare', 'research'];
  var CLAIM_TYPES = ['quantitative', 'qualitative', 'causal', 'existence'];
  var CLAIM_SOURCES = ['kepler', 'kb', 'web', 'llm'];
  var SUPPORT_STRENGTHS = ['strong', 'partial', 'weak'];
  var SUPPORT_BASES = ['numeric', 'semantic'];
  var UNCERTAINTY_KINDS = ['measurement', 'model', 'definition', 'temporal'];

  var idSeq = 0;

  var SHA256_K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  function nowIso() {
    return new Date().toISOString();
  }

  function nextId() {
    idSeq += 1;
    return 'tsk_' + Date.now().toString(36) + '_' + idSeq.toString(36);
  }

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

  /* 结构化错误：同时携带 code / path / from / to / reason，便于测试断言 */
  function TaskError(code, message, extra) {
    var err = new Error(message);
    err.name = 'AstroTaskError';
    err.code = code;
    extra = extra || {};
    if (extra.path) err.path = extra.path;
    if (extra.from) err.from = extra.from;
    if (extra.to) err.to = extra.to;
    if (extra.reason) err.reason = extra.reason;
    return err;
  }

  function fail(code, message, path) {
    throw TaskError(code, message, { path: path });
  }

  function cloneArray(v) {
    return isArray(v) ? v.slice() : [];
  }

  function canonicalJSON(value) {
    if (value === null || typeof value === 'undefined') return 'null';
    var t = typeof value;
    if (t === 'number') return isFinite(value) ? String(value) : 'null';
    if (t === 'boolean') return value ? 'true' : 'false';
    if (t === 'string') return JSON.stringify(value);
    if (t === 'function') return 'null';
    if (isArray(value)) {
      var arr = [], i;
      for (i = 0; i < value.length; i++) {
        arr.push(canonicalJSON(value[i]));
      }
      return '[' + arr.join(',') + ']';
    }
    if (isPlainObject(value)) {
      var keys = Object.keys(value).sort();
      var parts = [], k, v;
      for (k = 0; k < keys.length; k++) {
        v = value[keys[k]];
        if (typeof v === 'undefined' || typeof v === 'function') continue;
        parts.push(JSON.stringify(keys[k]) + ':' + canonicalJSON(v));
      }
      return '{' + parts.join(',') + '}';
    }
    return 'null';
  }

  function utf8Bytes(str) {
    var out = [], i, c, c2, cp;
    for (i = 0; i < str.length; i++) {
      c = str.charCodeAt(i);
      if (c < 0x80) {
        out.push(c);
      } else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        c2 = str.charCodeAt(i + 1);
        if (c2 >= 0xDC00 && c2 <= 0xDFFF) {
          cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
          out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
            0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
          i++;
        } else {
          out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
        }
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  function rotr(x, n) {
    return ((x >>> n) | (x << (32 - n))) >>> 0;
  }

  function sha256Hex(text) {
    var bytes = utf8Bytes(String(text));
    var len = bytes.length;
    var total = Math.floor((len + 9 + 63) / 64) * 64;
    var msg = new Array(total), i, off;
    for (i = 0; i < total; i++) msg[i] = 0;
    for (i = 0; i < len; i++) msg[i] = bytes[i];
    msg[len] = 0x80;

    var bitLen = len * 8;
    var hi = Math.floor(bitLen / 4294967296);
    var lo = bitLen - hi * 4294967296;
    msg[total - 8] = (hi >>> 24) & 0xFF;
    msg[total - 7] = (hi >>> 16) & 0xFF;
    msg[total - 6] = (hi >>> 8) & 0xFF;
    msg[total - 5] = hi & 0xFF;
    msg[total - 4] = (lo >>> 24) & 0xFF;
    msg[total - 3] = (lo >>> 16) & 0xFF;
    msg[total - 2] = (lo >>> 8) & 0xFF;
    msg[total - 1] = lo & 0xFF;

    var h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
    var h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

    for (off = 0; off < total; off += 64) {
      var w = new Array(64);
      for (i = 0; i < 16; i++) {
        w[i] = ((msg[off + i * 4] << 24) | (msg[off + i * 4 + 1] << 16) |
          (msg[off + i * 4 + 2] << 8) | msg[off + i * 4 + 3]) >>> 0;
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
        var s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
      }

      var a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
        var ch = (e & f) ^ ((~e) & g);
        var t1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
        var S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        h = g; g = f; f = e; e = (d + t1) >>> 0;
        d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0;
      h4 = (h4 + e) >>> 0; h5 = (h5 + f) >>> 0; h6 = (h6 + g) >>> 0; h7 = (h7 + h) >>> 0;
    }

    function hex(n) {
      var s = n.toString(16);
      while (s.length < 8) s = '0' + s;
      return s;
    }
    return hex(h0) + hex(h1) + hex(h2) + hex(h3) + hex(h4) + hex(h5) + hex(h6) + hex(h7);
  }

  function computeInputHash(args) {
    return sha256Hex(canonicalJSON(args == null ? {} : args));
  }

  /* ============================================================
     1. Phase / Step / Budget / Event 构造
     ============================================================ */

  function isTerminal(phase) {
    return includes(TERMINAL_PHASES, phase);
  }

  function makeBudget(level) {
    var key = includes(['L1', 'L2', 'L3', 'L4'], level) ? level : 'L1';
    var limit = BUDGET_LIMITS[key];
    var outLimit = {}, outUsed = {}, i;
    for (i = 0; i < BUDGET_FIELDS.length; i++) {
      outLimit[BUDGET_FIELDS[i]] = limit[BUDGET_FIELDS[i]];
      outUsed[BUDGET_FIELDS[i]] = 0;
    }
    return { level: key, limit: outLimit, used: outUsed };
  }

  function makeStep(input) {
    input = input || {};
    var args = input.args == null ? {} : input.args;
    return {
      id: input.id || '',
      tool: input.tool || '',
      toolId: input.toolId || input.tool || '',
      args: args,
      deps: cloneArray(input.deps),
      parallel: !!input.parallel,
      critical: !!input.critical,
      optional: !!input.optional,
      status: input.status || 'pending',
      attempt: isFiniteNumber(input.attempt) ? input.attempt : 0,
      inputHash: input.inputHash || computeInputHash(args),
      outputHash: input.outputHash == null ? null : input.outputHash,
      startedAt: input.startedAt == null ? null : input.startedAt,
      endedAt: input.endedAt == null ? null : input.endedAt,
      durationMs: isFiniteNumber(input.durationMs) ? input.durationMs : null,
      result: input.result == null ? null : input.result,
      error: input.error == null ? null : input.error,
      provenance: input.provenance == null ? null : input.provenance,
      evidenceRefs: cloneArray(input.evidenceRefs),
      cancelled: !!input.cancelled
    };
  }

  function validateCalcRecord(calc, path) {
    if (!isPlainObject(calc)) {
      fail('E_CLAIM_CALC_INVALID', path + ' 必须是 CalcRecord 对象', path);
    }
    if (!isFiniteNumber(calc.value)) {
      fail('E_CLAIM_CALC_INVALID', path + '.value 必须是有限数字', path + '.value');
    }
    var textFields = ['unit', 'epoch', 'frame', 'source', 'method', 'computedAt'];
    var i;
    for (i = 0; i < textFields.length; i++) {
      if (typeof calc[textFields[i]] !== 'string' || !calc[textFields[i]]) {
        fail('E_CLAIM_CALC_INVALID', path + '.' + textFields[i] + ' 必须是非空字符串', path + '.' + textFields[i]);
      }
    }
    if (!isPlainObject(calc.inputs)) {
      fail('E_CLAIM_CALC_INVALID', path + '.inputs 必须是对象', path + '.inputs');
    }
    if (calc.uncertainty != null && !isFiniteNumber(calc.uncertainty)) {
      fail('E_CLAIM_CALC_INVALID', path + '.uncertainty 必须是数字或 null', path + '.uncertainty');
    }
    return true;
  }

  function makeEvent(state, type, payload, stepId) {
    var seq = state.events.length ? state.events[state.events.length - 1].seq + 1 : 1;
    return {
      seq: seq,
      at: nowIso(),
      taskId: state.id,
      type: type,
      stepId: stepId == null ? null : stepId,
      payload: payload || {}
    };
  }

  /* ============================================================
     2. TaskState 创建 / 序列化
     ============================================================ */

  function makeContext(input) {
    input = input || {};
    var place = input.place || {};
    var time = input.time || {};
    return {
      place: {
        lat: place.lat == null ? null : place.lat,
        lon: place.lon == null ? null : place.lon,
        name: place.name || ''
      },
      time: {
        y: time.y == null ? null : time.y,
        mo: time.mo == null ? null : time.mo,
        d: time.d == null ? null : time.d,
        h: time.h == null ? null : time.h,
        mi: time.mi == null ? null : time.mi,
        tz: time.tz || ''
      },
      epoch: input.epoch || 'J2000',
      frame: input.frame || 'topocentric'
    };
  }

  function create(input) {
    input = input || {};
    var created = input.createdAt || nowIso();
    var steps = isArray(input.steps) ? input.steps.map(makeStep) : [];
    return {
      schemaVersion: 1,
      id: input.id || nextId(),
      question: typeof input.question === 'string' ? input.question : '',
      mode: input.mode || 'single',
      phase: input.phase || 'INIT',
      createdAt: created,
      updatedAt: input.updatedAt || created,
      phaseStartedAt: input.phaseStartedAt || created,
      intents: cloneArray(input.intents),
      entities: cloneArray(input.entities),
      context: makeContext(input.context),
      plan: input.plan == null ? null : input.plan,
      steps: steps,
      claims: cloneArray(input.claims),
      evidence: cloneArray(input.evidence),
      eval: input.eval == null ? null : input.eval,
      budget: input.budget || makeBudget(input.level || 'L1'),
      checkpoints: cloneArray(input.checkpoints),
      replans: cloneArray(input.replans),
      trace: cloneArray(input.trace),
      errors: cloneArray(input.errors),
      events: cloneArray(input.events)
    };
  }

  function toJSON(state) {
    /* 只保留可序列化数据；函数无法进入 JSON，循环引用会在此明确报错。 */
    return JSON.stringify(state);
  }

  function fromJSON(json) {
    var obj = json;
    if (typeof json === 'string') obj = JSON.parse(json);
    if (!isPlainObject(obj)) fail('E_STATE_SHAPE', 'TaskState 必须能反序列化为对象', '$');
    var state = create(obj);
    /* 反序列化只恢复数据，不做执行恢复；但必须过结构与不变量校验，
     * 避免把损坏/伪造的 TaskState 当作合法状态继续使用。 */
    validate(state);
    return state;
  }

  /* ============================================================
     3. 不变量与结构校验
     ============================================================ */

  function validate(state) {
    if (!isPlainObject(state)) fail('E_STATE_SHAPE', '$ 必须是 TaskState 对象', '$');
    if (state.schemaVersion !== 1) fail('E_STATE_SCHEMA', '$.schemaVersion 必须为 1', '$.schemaVersion');
    if (typeof state.id !== 'string' || !state.id) fail('E_STATE_ID', '$.id 必须是非空字符串', '$.id');
    if (typeof state.question !== 'string') fail('E_STATE_QUESTION', '$.question 必须是字符串', '$.question');
    if (!includes(MODES, state.mode)) fail('E_STATE_MODE', '$.mode 不在枚举范围', '$.mode');
    if (!includes(PHASES, state.phase)) fail('E_STATE_PHASE', '$.phase 不在枚举范围', '$.phase');
    if (typeof state.createdAt !== 'string' || !state.createdAt) fail('E_STATE_TIME', '$.createdAt 必须是非空字符串', '$.createdAt');
    if (typeof state.updatedAt !== 'string' || !state.updatedAt) fail('E_STATE_TIME', '$.updatedAt 必须是非空字符串', '$.updatedAt');
    if (state.phaseStartedAt != null && typeof state.phaseStartedAt !== 'string') {
      fail('E_STATE_TIME', '$.phaseStartedAt 必须是字符串', '$.phaseStartedAt');
    }
    if (!isArray(state.replans)) fail('E_STATE_SHAPE', '$.replans 必须是数组', '$.replans');

    var i, j, item, path;

    if (!isArray(state.intents)) fail('E_STATE_INTENTS', '$.intents 必须是数组', '$.intents');
    for (i = 0; i < state.intents.length; i++) {
      item = state.intents[i];
      path = '$.intents[' + i + ']';
      if (!isPlainObject(item)) fail('E_INTENT_SHAPE', path + ' 必须是对象', path);
      if (typeof item.kind !== 'string' || !item.kind) fail('E_INTENT_KIND', path + '.kind 必须是非空字符串', path + '.kind');
      if (!isFiniteNumber(item.confidence) || item.confidence < 0 || item.confidence > 1) {
        fail('E_INTENT_CONFIDENCE', path + '.confidence 必须是 0..1 的数字', path + '.confidence');
      }
      if (!includes(['rule', 'llm'], item.source)) fail('E_INTENT_SOURCE', path + '.source 不在枚举范围', path + '.source');
    }

    if (!isArray(state.entities)) fail('E_STATE_ENTITIES', '$.entities 必须是数组', '$.entities');
    if (!isPlainObject(state.context)) fail('E_STATE_CONTEXT', '$.context 必须是对象', '$.context');
    if (typeof state.context.epoch !== 'string' || !state.context.epoch) fail('E_CONTEXT_EPOCH', '$.context.epoch 必须是非空字符串', '$.context.epoch');
    if (typeof state.context.frame !== 'string' || !state.context.frame) fail('E_CONTEXT_FRAME', '$.context.frame 必须是非空字符串', '$.context.frame');

    if (!isArray(state.steps)) fail('E_STATE_STEPS', '$.steps 必须是数组', '$.steps');
    for (i = 0; i < state.steps.length; i++) {
      item = state.steps[i];
      path = '$.steps[' + i + ']';
      if (!isPlainObject(item)) fail('E_STEP_SHAPE', path + ' 必须是对象', path);
      if (typeof item.id !== 'string' || !item.id) fail('E_STEP_ID', path + '.id 必须是非空字符串', path + '.id');
      if (!includes(STEP_STATUS, item.status)) fail('E_STEP_STATUS', path + '.status 不在枚举范围', path + '.status');
      if (!isFiniteNumber(item.attempt) || item.attempt < 0) fail('E_STEP_ATTEMPT', path + '.attempt 必须是非负数字', path + '.attempt');
      if (!isArray(item.deps)) fail('E_STEP_DEPS', path + '.deps 必须是数组', path + '.deps');
      if (item.durationMs != null && !isFiniteNumber(item.durationMs)) fail('E_STEP_DURATION', path + '.durationMs 必须是数字或 null', path + '.durationMs');
      if (item.evidenceRefs != null && !isArray(item.evidenceRefs)) fail('E_STEP_REFS', path + '.evidenceRefs 必须是数组', path + '.evidenceRefs');
      if (item.provenance != null && !isPlainObject(item.provenance)) fail('E_STEP_PROVENANCE', path + '.provenance 必须是对象或 null', path + '.provenance');
      /* 不变量 1：ok ⇒ outputHash 必非空 */
      if (item.status === 'ok' && (typeof item.outputHash !== 'string' || !item.outputHash)) {
        fail('E_STEP_OUTPUT_HASH', path + '.outputHash 在 status=ok 时必须非空', path + '.outputHash');
      }
    }

    if (!isArray(state.claims)) fail('E_STATE_CLAIMS', '$.claims 必须是数组', '$.claims');
    for (i = 0; i < state.claims.length; i++) {
      item = state.claims[i];
      path = '$.claims[' + i + ']';
      if (!isPlainObject(item)) fail('E_CLAIM_SHAPE', path + ' 必须是对象', path);
      if (!includes(CLAIM_TYPES, item.type)) fail('E_CLAIM_TYPE', path + '.type 不在枚举范围', path + '.type');
      if (!includes(CLAIM_SOURCES, item.source)) fail('E_CLAIM_SOURCE', path + '.source 不在枚举范围', path + '.source');
      if (!isArray(item.support)) fail('E_CLAIM_SUPPORT', path + '.support 必须是数组', path + '.support');
      for (j = 0; j < item.support.length; j++) {
        var sup = item.support[j];
        var spath = path + '.support[' + j + ']';
        if (!isPlainObject(sup)) fail('E_CLAIM_SUPPORT', spath + ' 必须是对象', spath);
        if (!includes(SUPPORT_STRENGTHS, sup.strength)) fail('E_CLAIM_STRENGTH', spath + '.strength 不在枚举范围', spath + '.strength');
        if (!includes(SUPPORT_BASES, sup.basis)) fail('E_CLAIM_BASIS', spath + '.basis 不在枚举范围', spath + '.basis');
      }
      if (!isArray(item.contradict)) fail('E_CLAIM_CONTRADICT', path + '.contradict 必须是数组', path + '.contradict');
      if (item.uncertainty != null) {
        if (!isPlainObject(item.uncertainty) || !includes(UNCERTAINTY_KINDS, item.uncertainty.kind)) {
          fail('E_CLAIM_UNCERTAINTY', path + '.uncertainty.kind 不在枚举范围', path + '.uncertainty.kind');
        }
      }
      /* 不变量 2：kepler + quantitative ⇒ calc 非空且符合 CalcRecord */
      if (item.source === 'kepler' && item.type === 'quantitative') {
        if (!item.calc) {
          fail('E_CLAIM_CALC_REQUIRED', path + '.calc 在 source=kepler 且 type=quantitative 时不得为 null', path + '.calc');
        }
        validateCalcRecord(item.calc, path + '.calc');
      }
    }

    if (state.eval != null) {
      /* 不变量 4：eval ≠ null ⇒ 至少一条 required claim */
      var hasRequired = false;
      for (i = 0; i < state.claims.length; i++) {
        if (state.claims[i] && state.claims[i].required === true) hasRequired = true;
      }
      if (!hasRequired) {
        fail('E_EVAL_REQUIRES_REQUIRED_CLAIM', '$.eval 非 null 时 claims 至少需要一条 required:true', '$.claims');
      }
      /* 不变量 3：无 calc 的定量 claim，numeric 不得 PASS */
      if (state.eval.dimensions && state.eval.dimensions.numeric && state.eval.dimensions.numeric.status === 'PASS') {
        for (i = 0; i < state.claims.length; i++) {
          item = state.claims[i];
          if (item.type === 'quantitative' && !item.calc) {
            fail('E_NUMERIC_PASS_WITHOUT_CALC', '$.claims[' + i + '] 无 calc，numeric 维度不得 PASS', '$.claims[' + i + '].calc');
          }
        }
      }
    }

    validateBudget(state.budget);

    if (!isArray(state.events)) fail('E_STATE_EVENTS', '$.events 必须是数组', '$.events');
    for (i = 0; i < state.events.length; i++) {
      item = state.events[i];
      path = '$.events[' + i + ']';
      if (!isPlainObject(item)) fail('E_EVENT_SHAPE', path + ' 必须是对象', path);
      if (!isFiniteNumber(item.seq) || item.seq < 1) fail('E_EVENT_SEQ', path + '.seq 必须是正数', path + '.seq');
      if (i > 0 && item.seq <= state.events[i - 1].seq) fail('E_EVENT_SEQ', path + '.seq 必须单调递增', path + '.seq');
      if (!includes(EVENT_TYPES, item.type)) fail('E_EVENT_TYPE', path + '.type 不在枚举范围', path + '.type');
      if (item.taskId !== state.id) fail('E_EVENT_TASK', path + '.taskId 必须与 TaskState.id 一致', path + '.taskId');
      if (!isPlainObject(item.payload)) fail('E_EVENT_PAYLOAD', path + '.payload 必须是对象', path + '.payload');
      var keys = Object.keys(item.payload);
      for (j = 0; j < keys.length; j++) {
        if (!includes(EVENT_PAYLOAD_KEYS, keys[j])) {
          fail('E_EVENT_PAYLOAD', path + '.payload.' + keys[j] + ' 不在白名单内', path + '.payload.' + keys[j]);
        }
      }
    }

    if (!isArray(state.checkpoints)) fail('E_STATE_CHECKPOINTS', '$.checkpoints 必须是数组', '$.checkpoints');
    if (!isArray(state.trace)) fail('E_STATE_TRACE', '$.trace 必须是数组', '$.trace');
    if (!isArray(state.errors)) fail('E_STATE_ERRORS', '$.errors 必须是数组', '$.errors');
    if (state.plan != null && !isPlainObject(state.plan)) fail('E_STATE_PLAN', '$.plan 必须是对象或 null', '$.plan');
    return true;
  }

  function validateBudget(budget) {
    if (!isPlainObject(budget)) fail('E_BUDGET_SHAPE', '$.budget 必须是对象', '$.budget');
    if (!includes(['L1', 'L2', 'L3', 'L4'], budget.level)) fail('E_BUDGET_LEVEL', '$.budget.level 不在 L1..L4', '$.budget.level');
    var kinds = ['limit', 'used'];
    var k, i, field;
    for (k = 0; k < kinds.length; k++) {
      if (!isPlainObject(budget[kinds[k]])) fail('E_BUDGET_SHAPE', '$.budget.' + kinds[k] + ' 必须是对象', '$.budget.' + kinds[k]);
      for (i = 0; i < BUDGET_FIELDS.length; i++) {
        field = BUDGET_FIELDS[i];
        if (!isFiniteNumber(budget[kinds[k]][field]) || budget[kinds[k]][field] < 0) {
          fail('E_BUDGET_FIELD', '$.budget.' + kinds[k] + '.' + field + ' 必须是非负数字', '$.budget.' + kinds[k] + '.' + field);
        }
      }
    }
    /* 不变量 5：used ≤ limit 恒成立 */
    for (i = 0; i < BUDGET_FIELDS.length; i++) {
      field = BUDGET_FIELDS[i];
      if (budget.used[field] > budget.limit[field]) {
        fail('E_BUDGET_EXCEEDED', '$.budget.used.' + field + ' 超出 limit', '$.budget.used.' + field);
      }
    }
    return true;
  }

  /* ============================================================
     4. 状态机
     ============================================================ */

  function invalidTransition(from, to, reason) {
    throw TaskError(
      'E_INVALID_TRANSITION',
      '非法转移 from=' + from + ' to=' + to + ' reason=' + reason,
      { from: from, to: to, reason: reason }
    );
  }

  function assertValidTransition(from, to, ctx) {
    if (!includes(PHASES, from)) invalidTransition(from, to, '未知的 from 状态');
    if (!includes(PHASES, to)) invalidTransition(from, to, '未知的 to 状态');

    /* 1. 终态不可复活 */
    if (isTerminal(from)) invalidTransition(from, to, '终态不可复活');

    /* 2. LEGACY 不再进入编排 */
    if (from === 'LEGACY' && includes(['PLAN', 'EXECUTE', 'JUDGE'], to)) {
      invalidTransition(from, to, 'LEGACY 不再进入编排');
    }
    /* 3. PROGRESS 不得跳过评审 */
    if (from === 'PROGRESS' && to === 'COMPOSE') invalidTransition(from, to, '跳过评审');
    /* 4. 重规划必须经 EXECUTE */
    if (from === 'JUDGE' && to === 'PLAN') invalidTransition(from, to, '重规划必须经 EXECUTE');
    /* 5. 取消后不得重启执行 */
    if (from === 'ABORTED' && includes(['EXECUTE', 'PLAN'], to)) invalidTransition(from, to, '取消后不得重启执行');
    /* 6. 必须先 UNDERSTAND/ROUTE */
    if (from === 'INIT' && includes(['PLAN', 'EXECUTE'], to)) invalidTransition(from, to, '必须先 UNDERSTAND/ROUTE');
    /* 7. 不得跳过 PROGRESS/JUDGE */
    if (from === 'EXECUTE' && to === 'DONE') invalidTransition(from, to, '不得跳过 PROGRESS/JUDGE');

    /* 8. 补检只允许一次 */
    if (from === 'JUDGE' && to === 'EXECUTE') {
      ctx = ctx || {};
      if (ctx.retryHint !== true) invalidTransition(from, to, '缺少 retryHint');
      if (!isFiniteNumber(ctx.retries) || ctx.retries >= 1) invalidTransition(from, to, '补检只允许一次');
      return true;
    }

    if (!includes(LEGAL_TRANSITIONS[from], to)) invalidTransition(from, to, '不在合法转移表');
    return true;
  }

  function transition(state, to, ctx) {
    assertValidTransition(state.phase, to, ctx);
    var from = state.phase;
    state.phase = to;
    state.updatedAt = nowIso();
    state.phaseStartedAt = state.updatedAt;
    appendEvent(state, 'phase.changed', { from: from, to: to });
    return state;
  }

  function canTransition(from, to, ctx) {
    try {
      assertValidTransition(from, to, ctx);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ============================================================
     5. Event 追加（只追加、无总线）
     ============================================================ */

  function appendEvent(state, type, payload, stepId) {
    if (!isArray(state.events)) fail('E_STATE_EVENTS', '$.events 必须是数组', '$.events');
    if (!includes(EVENT_TYPES, type)) fail('E_EVENT_TYPE', '事件 type 不在枚举范围: ' + type, '$.events.type');
    payload = payload || {};
    if (!isPlainObject(payload)) fail('E_EVENT_PAYLOAD', '事件 payload 必须是对象', '$.events.payload');
    var keys = Object.keys(payload), i;
    for (i = 0; i < keys.length; i++) {
      if (!includes(EVENT_PAYLOAD_KEYS, keys[i])) {
        fail('E_EVENT_PAYLOAD', '事件 payload 键不在白名单: ' + keys[i], '$.events.payload.' + keys[i]);
      }
    }
    var evt = makeEvent(state, type, payload, stepId);
    evt.at = nowIso();
    state.events.push(evt);
    return evt;
  }

  /* ============================================================
     6. 预算辅助（只做结构约束，不实现调度）
     ============================================================ */

  function canAfford(budget, delta) {
    delta = delta || {};
    var k;
    for (k in delta) {
      if (Object.prototype.hasOwnProperty.call(delta, k) && includes(BUDGET_FIELDS, k)) {
        if (budget.used[k] + delta[k] > budget.limit[k]) return false;
      }
    }
    return true;
  }

  function spend(budget, delta) {
    delta = delta || {};
    var next = {}, k;
    for (k in delta) {
      if (Object.prototype.hasOwnProperty.call(delta, k) && includes(BUDGET_FIELDS, k)) {
        next[k] = delta[k];
      }
    }
    if (!canAfford(budget, next)) {
      fail('E_BUDGET_EXCEEDED', '预算不足，拒绝消耗', '$.budget.used');
    }
    for (k in next) {
      if (Object.prototype.hasOwnProperty.call(next, k)) budget.used[k] += next[k];
    }
    return budget;
  }

  root.AstroTask = {
    PHASES: PHASES,
    TERMINAL_PHASES: TERMINAL_PHASES,
    STEP_STATUS: STEP_STATUS,
    EVENT_TYPES: EVENT_TYPES,
    EVENT_PAYLOAD_KEYS: EVENT_PAYLOAD_KEYS,
    BUDGET_LIMITS: BUDGET_LIMITS,
    LEGAL_TRANSITIONS: LEGAL_TRANSITIONS,
    create: create,
    toJSON: toJSON,
    fromJSON: fromJSON,
    validate: validate,
    makeStep: makeStep,
    makeBudget: makeBudget,
    isTerminal: isTerminal,
    assertValidTransition: assertValidTransition,
    canTransition: canTransition,
    transition: transition,
    appendEvent: appendEvent,
    canAfford: canAfford,
    spend: spend,
    computeInputHash: computeInputHash,
    canonicalJSON: canonicalJSON,
    sha256Hex: sha256Hex,
    TaskError: TaskError
  };
})(typeof window !== 'undefined' ? window : global);
