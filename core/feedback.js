/* ASTRUM · 问题反馈核心
 *
 * 职责：错误分类、主动提示去重、最小诊断上下文、脱敏、反馈草稿与邮件生成。
 * 不负责渲染，也不直接发送邮件；界面层拿到草稿后必须由用户确认才会打开邮件客户端。
 *
 * 关键约束：
 *   1) 收件邮箱只在这里配置一次，其他文件不得重复硬编码。
 *   2) 诊断信息只取当前任务，绝不打包历史对话、MEMORY 或其他任务。
 *   3) 脱敏在生成草稿之前完成，界面隐藏不承担安全职责。
 *   4) 外部服务失败按「外部服务」归类，不冒充 ASTRUM 代码 Bug。
 */
(function (root) {
  'use strict';

  /* ================= 配置 ================= */
  var CONFIG = {
    feedbackEnabled: true,
    feedbackEmail: '2185428966@qq.com',
    feedbackChannel: 'mailto',
    feedbackVersion: 1
  };

  /* 启动前可用 window.ASTRUM_FEEDBACK_CONFIG 覆盖，便于未来产品化换邮箱/渠道。
   * 只允许覆盖已知键，避免拼写错误悄悄生效。 */
  (function mergeUserConfig() {
    var extra = root.ASTRUM_FEEDBACK_CONFIG;
    if (!extra || typeof extra !== 'object') return;
    Object.keys(CONFIG).forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(extra, k)) CONFIG[k] = extra[k];
    });
  })();

  var TYPES = [
    { id: 'bug', label: 'Bug / 功能异常' },
    { id: 'research_result', label: '研究结果不准确' },
    { id: 'astro_data', label: '天体数据或参数错误' },
    { id: 'search_paper', label: '搜索或论文检索问题' },
    { id: 'pdf_parse', label: 'PDF 文献解析问题' },
    { id: 'agent_execution', label: 'Agent 执行问题' },
    { id: 'ui_ux', label: '界面与交互问题' },
    { id: 'suggestion', label: '功能建议' },
    { id: 'other', label: '其他问题' }
  ];

  var CATEGORY_LABELS = {
    system: '系统内部错误',
    agent: 'Agent 执行错误',
    external: '外部服务错误',
    config: '用户配置错误',
    data_parse: '数据解析错误',
    research_quality: '研究质量问题'
  };

  var PRIORITY = { system: 0, agent: 1, data_parse: 2, external: 3, config: 4, research_quality: 5 };

  var MAX_TITLE = 80;
  var MAX_DESC = 2000;
  var MAX_STEPS = 1000;
  var MAX_EXPECTED = 800;
  var MAX_ACTUAL = 800;
  var MAX_EMAIL = 120;
  /* 中文经 encodeURIComponent 后约为原长的 3 倍。1900 会让绝大多数中文反馈
   * 一生成就落入降级分支，因此按常见邮件客户端可接受的上限取 6000；
   * 超过时仍会明确提示改用复制/下载，不假装能打开客户端。 */
  var MAILTO_LIMIT = 6000;

  function nowIso() { return new Date().toISOString(); }
  function lower(s) { return String(s == null ? '' : s).toLowerCase(); }
  function clip(s, n) {
    var v = String(s == null ? '' : s);
    return v.length > n ? v.slice(0, n) + '…' : v;
  }
  function trim(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function config() {
    var out = {};
    Object.keys(CONFIG).forEach(function (k) { out[k] = CONFIG[k]; });
    return Object.freeze(out);
  }

  function typeById(id) {
    for (var i = 0; i < TYPES.length; i++) if (TYPES[i].id === id) return TYPES[i];
    return null;
  }

  /* ================= 错误分类 ================= */
  function classify(input) {
    input = input || {};
    var kind = lower(input.kind);
    var code = lower(input.code);
    var tool = lower(input.tool || input.toolId);
    var msg = String(input.message == null ? '' : input.message);
    var status = Number(input.status || 0);
    var hasKey = input.hasKey;
    var rawCode = code || kind || 'tool_error';

    function make(category, outCode) {
      return {
        category: category,
        code: outCode || rawCode,
        label: CATEGORY_LABELS[category] || category,
        summary: clip(trim(msg) || rawCode || '未提供错误摘要', 240)
      };
    }

    /* 用户主动取消不是异常，不进入主动提示（分类仍保留给诊断使用） */
    if (kind === 'cancelled' || code === 'cancelled') return make('agent', 'cancelled');

    /* 数据解析：PDF / 编码 / 格式 */
    if (/pdf|no_text|no-text|text_layer|scanned|encoding|corrupt|unsupported_format|file_format/.test(rawCode) ||
      /pdf|fulltext/.test(tool) && /parse|encoding|corrupt|no_text/.test(kind + ' ' + code + ' ' + msg) ||
      kind === 'parse') {
      return make('data_parse', rawCode);
    }

    /* 用户配置：缺 Key / 无效配置 / 401 且无凭据。
     * 已配置凭据仍 401，说明是服务侧拒绝（外部服务），不是用户没配。 */
    if (/missing_key|no_key|nokey|invalid_key|invalid_config|config_invalid|not_configured|credential/.test(rawCode) ||
      kind === 'config' || (kind === 'auth' && hasKey !== true) ||
      (status === 401 && hasKey !== true)) {
      return make('config', rawCode);
    }

    /* 系统内部：工具缺失、参数/依赖错误、预算、状态机 */
    if (/tool_missing|args_invalid|deps_missing|dependency|budget|internal|state_|schema|unknown_tool/.test(rawCode)) {
      return make('system', rawCode);
    }

    /* 外部服务：超时、网络、限流、HTTP 403/429/5xx。
     * 必须排在 Agent 之前：compose 步骤因网络失败属于外部服务，不是 ASTRUM 代码 Bug。 */
    if (/timeout|network|rate_limit|rate-limit|cors|fetch/.test(kind + ' ' + code) ||
      status === 403 || status === 429 || status >= 500 ||
      /http\s*(403|429|5\d\d)|timeout|超时|限流|cors|failed to fetch|networkerror|不可达|网络/.test(msg)) {
      return make('external', rawCode);
    }

    /* Agent / 编排：compose 失败或编排中断 */
    if (tool.indexOf('compose.') === 0 || /agent_|dispatch|orchestrat|task_interrupted|interrupted/.test(rawCode)) {
      return make('agent', rawCode);
    }

    /* 研究质量：无结果、证据不足、结果不相关 */
    if (/empty|no_evidence|no-result|no_result|insufficient|irrelevant|not_relevant|unrelated/.test(rawCode) ||
      kind === 'empty') {
      return make('research_quality', rawCode);
    }

    /* 兜底：按工具来源判断，而不是一律算系统 Bug */
    if (/paper|arxiv|openalex|semantic|simbad|weather|sources|search|model/.test(tool)) return make('external', rawCode);
    if (tool.indexOf('compose') === 0) return make('agent', rawCode);
    return make('system', rawCode);
  }

  /* ================= 主动提示判定 ================= */
  function analyze(input) {
    input = input || {};
    var state = input.state || null;
    var answer = input.answer || null;
    var query = String(input.query || (answer && answer.query) || (state && state.question) || '');
    var context = input.context || {};
    var issues = [];
    var seen = {};

    function add(issue) {
      if (!issue || !issue.category) return;
      var key = issue.category + '|' + issue.code + '|' + String(issue.stepId || '');
      if (seen[key]) return;
      seen[key] = 1;
      issues.push(issue);
    }

    if (state && !state.cancelled && Array.isArray(state.steps)) {
      state.steps.forEach(function (s) {
        if (!s || s.cancelled) return;
        if (s.status !== 'failed' && s.status !== 'blocked' && s.status !== 'aborted') return;
        var err = s.error || {};
        var c = classify({
          kind: err.kind, code: err.code, tool: s.tool || s.toolId,
          message: err.message, status: err.status, hasKey: input.hasKey
        });
        add({
          category: c.category, code: c.code, label: c.label, summary: c.summary,
          tool: String(s.tool || s.toolId || ''), stepId: String(s.id || ''),
          agent: String(s.agent || context.agent || '')
        });
      });
    }

    if (state && (state.budgetStop || state.budgetExhausted)) {
      add({
        category: 'system', code: 'budget', label: CATEGORY_LABELS.system,
        summary: '任务预算耗尽，部分步骤未执行', tool: '', stepId: '', agent: ''
      });
    }

    var meta = (answer && answer.meta) || {};
    if (meta.cloudExpression && meta.cloudExpression.code &&
      meta.cloudExpression.code !== 'ok' && meta.cloudExpression.code !== 'cancelled') {
      add({
        category: 'external', code: 'model_' + meta.cloudExpression.code,
        label: CATEGORY_LABELS.external,
        summary: '模型表述调用失败：' + String(meta.cloudExpression.reason || meta.cloudExpression.code),
        tool: 'model.' + String(meta.cloudExpression.sourceId || ''), stepId: '', agent: ''
      });
    }

    var rm = meta.research || {};
    if (answer && rm && !rm.skip) {
      if (rm.evidence === 0 || rm.stopReason === 'empty') {
        add({
          category: 'research_quality', code: 'no_evidence',
          label: CATEGORY_LABELS.research_quality,
          summary: '本轮检索未取得可用证据' + (rm.stopReason ? '（' + rm.stopReason + '）' : ''),
          tool: 'research', stepId: '', agent: ''
        });
      }
      if (rm.degraded && rm.degradedReason) {
        add({
          category: 'research_quality', code: 'degraded_search',
          label: CATEGORY_LABELS.research_quality,
          summary: String(rm.degradedReason),
          tool: 'research', stepId: '', agent: ''
        });
      }
    }

    if (input.userComplaint) {
      add({
        category: 'research_quality', code: 'user_reported',
        label: CATEGORY_LABELS.research_quality,
        summary: '用户指出上一条回答存在问题：' + clip(trim(query), 160),
        tool: '', stepId: '', agent: ''
      });
    }

    issues.sort(function (a, b) {
      return (PRIORITY[a.category] == null ? 9 : PRIORITY[a.category]) -
        (PRIORITY[b.category] == null ? 9 : PRIORITY[b.category]);
    });

    var cancelled = !!(input.cancelled || (answer && answer.cancelled) || (state && state.cancelled));
    return {
      needed: !!issues.length && !cancelled,
      issues: issues,
      primary: issues[0] || null,
      taskId: String((state && state.id) || context.taskId || (answer && answer.meta && answer.meta.taskId) || ''),
      query: query
    };
  }

  /* ================= 提示去重 ================= */
  function seenKey() {
    return root.Profile && root.Profile.ns ? root.Profile.ns('astrum.feedback.seen') : 'astrum.feedback.seen';
  }

  function readSeen() {
    try {
      var raw = root.localStorage.getItem(seenKey());
      var obj = raw ? JSON.parse(raw) : {};
      return obj && typeof obj === 'object' ? obj : {};
    } catch (e) { return {}; }
  }

  function writeSeen(obj) {
    try {
      var keys = Object.keys(obj);
      if (keys.length > 200) {
        keys.sort(function (a, b) { return (obj[a] && obj[a].at || 0) - (obj[b] && obj[b].at || 0); });
        keys.slice(0, keys.length - 200).forEach(function (k) { delete obj[k]; });
      }
      root.localStorage.setItem(seenKey(), JSON.stringify(obj));
    } catch (e) { /* 隐私模式降级：本次会话仍可提示，只是不持久 */ }
  }

  function promptKey(taskId, category, suffix) {
    return String(taskId || 'local') + '::' + String(category || 'unknown') +
      (suffix ? '::' + String(suffix) : '');
  }

  function shouldPrompt(key) {
    return !readSeen()[key];
  }

  function markPrompted(key) {
    var obj = readSeen();
    obj[key] = { at: Date.now(), ignored: false };
    writeSeen(obj);
    return key;
  }

  function ignore(key) {
    var obj = readSeen();
    obj[key] = { at: Date.now(), ignored: true };
    writeSeen(obj);
    return key;
  }

  function clearPromptHistory() {
    try { root.localStorage.removeItem(seenKey()); } catch (e) {}
  }

  /* ================= 脱敏 ================= */
  var SENSITIVE_KEY = /^(api[_-]?key|apikey|authorization|auth|bearer|token|access[_-]?token|refresh[_-]?token|password|passwd|secret|client[_-]?secret|cookie|set-cookie|session|sessionid|credential|credentials)$/i;

  function redact(input) {
    var s = String(input == null ? '' : input);
    return s
      .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, '[REDACTED_KEY]')
      .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, '[REDACTED_TOKEN]')
      .replace(/\b(sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AIza[0-9A-Za-z_-]{30,}|xox[baprs]-[A-Za-z0-9-]{10,})\b/g,
        '[REDACTED_TOKEN]')
      .replace(/(Bearer)\s+[A-Za-z0-9._~+\/-]+=*/gi, '$1 [REDACTED]')
      .replace(/(Cookie|Set-Cookie)\s*:.*/gi, '$1: [REDACTED_COOKIE]')
      .replace(/["']?(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|authorization|token|password|passwd|secret|sessionid|session|cookie)["']?(\s*[:=]\s*)(["']?)([^&;\s"',}]+)\3/gi,
        function (m, k, sep, q) { return k + sep + (q || '') + '[REDACTED]' + (q || ''); })
      .replace(/file:\/\/\/[^\s"')]+/gi, '[LOCAL_PATH]')
      .replace(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\r\n]*/g, '[LOCAL_PATH]')
      .replace(/(?:\/home\/|\/Users\/)[^\s"')]+/g, '[LOCAL_PATH]');
  }

  function sanitizeValue(value, depth) {
    depth = depth || 0;
    if (depth > 5) return '[TRUNCATED]';
    if (value == null) return value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'string') return clip(redact(value), 400);
    if (Array.isArray(value)) {
      return value.slice(0, 30).map(function (v) { return sanitizeValue(v, depth + 1); });
    }
    if (typeof value === 'object') {
      var out = {};
      Object.keys(value).slice(0, 40).forEach(function (k) {
        if (SENSITIVE_KEY.test(k)) out[k] = '[REDACTED]';
        else out[k] = sanitizeValue(value[k], depth + 1);
      });
      return out;
    }
    return clip(redact(String(value)), 400);
  }

  /* ================= 诊断 ================= */
  function uniqueList(list, max, n) {
    var out = [], seen = {};
    (Array.isArray(list) ? list : []).forEach(function (x) {
      var v = String(sanitizeValue(x == null ? '' : x));
      if (!v || seen[v]) return;
      seen[v] = 1;
      out.push(clip(v, n || 80));
    });
    return out.slice(0, max || 5);
  }

  function browserInfo() {
    var nav = root.navigator || {};
    return {
      userAgent: clip(String(nav.userAgent || 'unknown'), 240),
      platform: clip(String(nav.platform || 'unknown'), 80),
      language: clip(String(nav.language || 'unknown'), 40),
      viewport: (root.innerWidth || 0) + 'x' + (root.innerHeight || 0)
    };
  }

  function buildDiagnostic(input) {
    input = input || {};
    var state = input.state || null;
    var answer = input.answer || null;
    var context = input.context || {};
    var err = input.error || input.primary || null;
    var version = String(input.version || (root.__astrum && root.__astrum.version) || 'unknown');

    var steps = [];
    if (state && Array.isArray(state.steps)) {
      steps = state.steps.slice(-30).map(function (s) {
        s = s || {};
        var e = s.error || null;
        return {
          id: String(s.id || ''),
          tool: String(s.tool || s.toolId || ''),
          status: String(s.status || ''),
          error: e ? { kind: String(e.kind || ''), code: String(e.code || ''), message: clip(String(e.message || ''), 240) } : null,
          durationMs: typeof s.durationMs === 'number' ? s.durationMs : null
        };
      });
    }

    var events = [];
    if (state && Array.isArray(state.events)) {
      events = state.events.slice(-30).map(function (e) {
        e = e || {};
        return {
          at: String(e.at || ''),
          type: String(e.type || ''),
          stepId: String(e.stepId || ''),
          reason: clip(String(e.payload && e.payload.reason || ''), 120)
        };
      });
    }

    var diag = {
      schema: 'astrum.feedback.diagnostic/1',
      feedbackId: String(input.feedbackId || ''),
      createdAt: nowIso(),
      astrumVersion: version,
      browser: browserInfo(),
      page: {
        module: String(input.pageModule || context.source || 'chat'),
        threadId: String(context.threadId || '')
      },
      task: {
        id: String((state && state.id) || context.taskId || ''),
        threadId: String(context.threadId || ''),
        query: clip(String(context.query || (answer && answer.query) || (state && state.question) || ''), 500),
        intent: String(context.intent || (answer && answer.intent) || ''),
        template: String((state && state.plan && state.plan.template) || context.template || ''),
        agent: String(context.agent || (context.agents || [])[0] || ''),
        steps: steps,
        events: events
      },
      error: err ? {
        category: String(err.category || ''),
        code: String(err.code || ''),
        label: String(err.label || CATEGORY_LABELS[err.category] || ''),
        summary: clip(String(err.summary || err.message || ''), 300)
      } : null,
      context: {
        messageId: String(context.messageId || ''),
        answerExcerpt: clip(String(context.answerText || ''), 300),
        tools: uniqueList(context.tools, 5, 80),
        agents: uniqueList(context.agents, 5, 80),
        sources: uniqueList(context.sources, 5, 120)
      }
    };

    diag = sanitizeValue(diag);
    enforceSize(diag);
    return diag;
  }

  function jsonLength(x) {
    try { return JSON.stringify(x).length; } catch (e) { return 0; }
  }

  function enforceSize(diag) {
    var guard = 0;
    while (guard++ < 40 && jsonLength(diag) > 20000) {
      if (diag.task.events.length > 3) diag.task.events.shift();
      else if (diag.task.steps.length > 3) diag.task.steps.shift();
      else if (diag.context.answerExcerpt.length > 80) diag.context.answerExcerpt = diag.context.answerExcerpt.slice(0, 80) + '…';
      else if (diag.context.tools.length) diag.context.tools.pop();
      else if (diag.context.agents.length) diag.context.agents.pop();
      else if (diag.context.sources.length) diag.context.sources.pop();
      else if (diag.task.query.length > 80) diag.task.query = diag.task.query.slice(0, 80) + '…';
      else break;
    }
    return diag;
  }

  /* ================= 反馈编号 / 草稿 ================= */
  function feedbackId(now) {
    var d = now || new Date();
    function p(n) { return n < 10 ? '0' + n : String(n); }
    var date = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
    var time = p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
    var rnd = '';
    try {
      var buf = new Uint8Array(2);
      if (root.crypto && root.crypto.getRandomValues) root.crypto.getRandomValues(buf);
      else { buf[0] = Math.floor(Math.random() * 256); buf[1] = Math.floor(Math.random() * 256); }
      rnd = ('0' + buf[0].toString(16)).slice(-2) + ('0' + buf[1].toString(16)).slice(-2);
    } catch (e) { rnd = ('0000' + Math.floor(Math.random() * 65536).toString(16)).slice(-4); }
    return 'FB-' + date + '-' + time + '-' + rnd.toUpperCase();
  }

  function sanitizeContext(ctx) {
    ctx = ctx || {};
    var out = {
      query: clip(String(sanitizeValue(ctx.query || '')), 400),
      answerExcerpt: clip(String(sanitizeValue(ctx.answerText || ctx.answerExcerpt || '')), 500),
      messageId: clip(String(ctx.messageId || ''), 120),
      taskId: clip(String(ctx.taskId || ''), 120),
      threadId: clip(String(ctx.threadId || ''), 120),
      intent: clip(String(ctx.intent || ''), 60),
      template: clip(String(ctx.template || ''), 40),
      agent: clip(String(ctx.agent || ''), 80),
      agents: uniqueList(ctx.agents, 5, 80),
      tools: uniqueList(ctx.tools, 5, 80),
      sources: uniqueList(ctx.sources, 5, 120)
    };
    return out;
  }

  function buildDraft(input) {
    input = input || {};
    var errors = [];
    var type = typeById(input.type);
    if (!type) errors.push({ field: 'type', message: '请选择反馈类型' });

    /* 用户可能把密钥粘进描述里；草稿阶段先脱敏，再校验长度。 */
    var title = redact(trim(input.title));
    if (!title) errors.push({ field: 'title', message: '请填写问题标题' });
    else if (title.length > MAX_TITLE) errors.push({ field: 'title', message: '问题标题不能超过 ' + MAX_TITLE + ' 字' });

    var description = redact(String(input.description == null ? '' : input.description).trim());
    if (!description) errors.push({ field: 'description', message: '请填写详细描述' });
    else if (description.length > MAX_DESC) errors.push({ field: 'description', message: '详细描述不能超过 ' + MAX_DESC + ' 字' });

    var steps = redact(String(input.steps == null ? '' : input.steps).trim());
    if (steps.length > MAX_STEPS) errors.push({ field: 'steps', message: '复现步骤不能超过 ' + MAX_STEPS + ' 字' });

    var expected = redact(String(input.expected == null ? '' : input.expected).trim());
    if (expected.length > MAX_EXPECTED) errors.push({ field: 'expected', message: '预期结果不能超过 ' + MAX_EXPECTED + ' 字' });

    var actual = redact(String(input.actual == null ? '' : input.actual).trim());
    if (actual.length > MAX_ACTUAL) errors.push({ field: 'actual', message: '实际结果不能超过 ' + MAX_ACTUAL + ' 字' });

    var contactEmail = trim(input.contactEmail);
    if (contactEmail && (contactEmail.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
      errors.push({ field: 'contactEmail', message: '联系邮箱格式不正确' });
    }

    if (errors.length) return { ok: false, errors: errors };

    var id = String(input.id || feedbackId());
    var ctx = sanitizeContext(input.context);
    var error = input.error || input.primary || null;
    if (error) {
      error = sanitizeValue({
        category: String(error.category || ''),
        code: String(error.code || ''),
        label: String(error.label || ''),
        summary: clip(String(error.summary || ''), 300)
      });
    }

    var diagnostic = null;
    if (input.includeDiagnostics === true) {
      diagnostic = input.diagnostic || buildDiagnostic({
        state: input.state, answer: input.answer, context: input.context,
        error: error, feedbackId: id, pageModule: input.pageModule, version: input.version
      });
      diagnostic = sanitizeValue(diagnostic);
    }

    return {
      ok: true,
      draft: {
        id: id,
        type: type.id,
        typeLabel: type.label,
        title: title,
        description: description,
        steps: steps,
        expected: expected,
        actual: actual,
        contactEmail: contactEmail,
        includeDiagnostics: input.includeDiagnostics === true,
        diagnostic: diagnostic,
        context: ctx,
        error: error,
        source: String(input.source || 'settings'),
        createdAt: nowIso(),
        version: String(input.version || (root.__astrum && root.__astrum.version) || 'unknown')
      }
    };
  }

  /* ================= 邮件 ================= */
  function subject(draft) {
    return '[ASTRUM Feedback][' + String(draft.typeLabel || '其他问题') + '] ' + trim(draft.title);
  }

  function body(draft) {
    var lines = [];
    function kv(k, v) { lines.push(k + ': ' + (v == null || v === '' ? '（未填写）' : String(v))); }

    lines.push('ASTRUM 问题反馈');
    lines.push('====================');
    kv('反馈编号', draft.id);
    kv('反馈类型', draft.typeLabel);
    kv('问题标题', draft.title);
    lines.push('');
    lines.push('用户描述:');
    lines.push(String(draft.description || '（未填写）'));
    lines.push('');
    lines.push('复现步骤:');
    lines.push(String(draft.steps || '（未填写）'));
    lines.push('');
    lines.push('预期结果:');
    lines.push(String(draft.expected || '（未填写）'));
    lines.push('');
    lines.push('实际结果:');
    lines.push(String(draft.actual || '（未填写）'));
    lines.push('');
    kv('ASTRUM 版本', draft.version);
    kv('发生时间', draft.createdAt);

    if (draft.error) {
      lines.push('相关错误摘要: [' + String(draft.error.category || 'unknown') + '] ' +
        String(draft.error.code || '') + ' · ' + String(draft.error.summary || ''));
    } else {
      lines.push('相关错误摘要: 用户未关联错误记录');
    }

    if (draft.includeDiagnostics) {
      lines.push('诊断报告: 已生成脱敏诊断文件 astrum-feedback-' + String(draft.id) + '.json；' +
        '邮件客户端不会自动添加本地附件，请在发送前手动添加。');
    } else {
      lines.push('诊断报告: 用户未选择附加诊断信息。');
    }

    var ctx = draft.context || {};
    if (ctx.query || ctx.answerExcerpt || ctx.messageId || ctx.taskId) {
      lines.push('');
      lines.push('当前上下文（仅当前问题，不含历史对话）:');
      kv('当前问题', ctx.query);
      if (ctx.answerExcerpt) {
        lines.push('回答摘录:');
        lines.push(ctx.answerExcerpt);
      }
      kv('消息 ID', ctx.messageId);
      kv('任务 ID', ctx.taskId);
      if (ctx.agents && ctx.agents.length) kv('相关 Agent', ctx.agents.join(', '));
      if (ctx.tools && ctx.tools.length) kv('相关工具', ctx.tools.join(', '));
      if (ctx.sources && ctx.sources.length) kv('相关来源', ctx.sources.join(', '));
    }

    if (draft.contactEmail) {
      lines.push('');
      kv('联系邮箱', draft.contactEmail);
    }

    lines.push('');
    lines.push('本邮件由 ASTRUM 生成草稿，需由用户在邮件客户端中确认并发送。');
    return lines.join('\n');
  }

  function plainText(draft) {
    return '收件人: ' + CONFIG.feedbackEmail + '\n主题: ' + subject(draft) + '\n\n' + body(draft);
  }

  function mailtoUrl(draft) {
    var url = 'mailto:' + CONFIG.feedbackEmail +
      '?subject=' + encodeURIComponent(subject(draft)) +
      '&body=' + encodeURIComponent(body(draft));
    return { url: url, tooLong: url.length > MAILTO_LIMIT, length: url.length };
  }

  function diagnosticJson(draft) {
    if (!draft || !draft.diagnostic) return '';
    return JSON.stringify(draft.diagnostic, null, 2);
  }

  function downloadName(draft) {
    return 'astrum-feedback-' + String((draft && draft.id) || 'report') + '.json';
  }

  function submitFeedback(draft) {
    if (!CONFIG.feedbackEnabled) return { ok: false, reason: 'disabled' };
    if (!draft || !draft.id) return { ok: false, reason: 'invalid_draft' };
    var handler = CHANNELS[CONFIG.feedbackChannel];
    if (!handler) return { ok: false, reason: 'unsupported_channel', channel: CONFIG.feedbackChannel };
    var out = handler(draft);
    out.channel = CONFIG.feedbackChannel;
    out.version = CONFIG.feedbackVersion;
    return out;
  }

  var CHANNELS = {
    mailto: function (draft) {
      var m = mailtoUrl(draft);
      return {
        ok: true,
        mode: 'mailto',
        recipient: CONFIG.feedbackEmail,
        subject: subject(draft),
        body: body(draft),
        mailto: m.url,
        tooLong: m.tooLong,
        length: m.length
      };
    }
  };

  function registerChannel(name, handler) {
    if (!name || typeof handler !== 'function') return false;
    CHANNELS[String(name)] = handler;
    return true;
  }

  /* 只有用户点「确认并打开邮件客户端」才会走到这里。
   * 返回 opened 只代表尝试唤起客户端，不代表邮件已发送。 */
  function openMailClient(draft) {
    var m = mailtoUrl(draft);
    if (m.tooLong) return { opened: false, reason: 'too_long', url: m.url, length: m.length };
    if (!root.document || !root.document.createElement) return { opened: false, reason: 'no_client', url: m.url };
    try {
      var a = root.document.createElement('a');
      a.href = m.url;
      a.style.display = 'none';
      a.setAttribute('aria-hidden', 'true');
      root.document.body.appendChild(a);
      a.click();
      setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 0);
      return { opened: true, url: m.url };
    } catch (e) {
      return { opened: false, reason: 'exception', url: m.url };
    }
  }

  root.AstroFeedback = {
    config: config,
    TYPES: TYPES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    classify: classify,
    analyze: analyze,
    promptKey: promptKey,
    shouldPrompt: shouldPrompt,
    markPrompted: markPrompted,
    ignore: ignore,
    clearPromptHistory: clearPromptHistory,
    redact: redact,
    sanitizeValue: sanitizeValue,
    buildDiagnostic: buildDiagnostic,
    feedbackId: feedbackId,
    buildDraft: buildDraft,
    subject: subject,
    body: body,
    plainText: plainText,
    mailtoUrl: mailtoUrl,
    diagnosticJson: diagnosticJson,
    downloadName: downloadName,
    submitFeedback: submitFeedback,
    registerChannel: registerChannel,
    openMailClient: openMailClient,
    MAILTO_LIMIT: MAILTO_LIMIT,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
