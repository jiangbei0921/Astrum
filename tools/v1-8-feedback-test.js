/* ASTRUM · V1.8 反馈核心测试
 *
 * 覆盖：统一配置、错误六分类、主动触发/不误触发、去重与忽略、
 *       最小诊断上下文、脱敏、草稿校验、邮件主题/正文/mailto、超长降级、
 *       回答上下文关联与不串任务。
 *
 * 用法：node tools/v1-8-feedback-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] != null ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};

require(path.join(ROOT, 'core/feedback.js'));
var F = global.AstroFeedback;

var results = [];
var pass = 0;
function ok(name, cond, extra) {
  var p = !!cond;
  results.push({ name: name, pass: p, extra: extra == null ? '' : String(extra) });
  if (p) pass++;
}
function eq(name, actual, expected) { ok(name, actual === expected, 'actual=' + actual + ' expected=' + expected); }
function clean() {
  global.localStorage._d = {};
  F.clearPromptHistory();
}

function stateWith(steps, extra) {
  return Object.assign({
    id: 'task-feedback-1',
    question: 'M42 的距离是多少？',
    steps: steps || [],
    events: [],
    plan: { template: 'T-E' },
    budget: {}
  }, extra || {});
}
function failedStep(id, tool, kind, msg, more) {
  return Object.assign({
    id: id, tool: tool, status: 'failed',
    error: { kind: kind, message: msg || kind, retriable: false }
  }, more || {});
}

(async function main() {
  /* ---------------- 1. 配置 ---------------- */
  var cfg = F.config();
  eq('1.1 反馈默认启用', cfg.feedbackEnabled, true);
  eq('1.2 收件邮箱正确', cfg.feedbackEmail, '2185428966@qq.com');
  eq('1.3 当前渠道为 mailto', cfg.feedbackChannel, 'mailto');
  eq('1.4 配置版本为 1', cfg.feedbackVersion, 1);
  ok('1.5 配置返回冻结副本', Object.isFrozen(cfg));

  var fbSrc = fs.readFileSync(path.join(ROOT, 'core/feedback.js'), 'utf8');
  var appSrc = fs.readFileSync(path.join(ROOT, 'core/app.js'), 'utf8');
  var idxSrc = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var emailCount = (fbSrc.match(/2185428966@qq\.com/g) || []).length;
  eq('1.6 邮箱只在 feedback.js 配置一次', emailCount, 1);
  ok('1.7 app.js 不重复硬编码邮箱', !/2185428966@qq\.com/.test(appSrc));
  ok('1.8 index.html 不重复硬编码邮箱', !/2185428966@qq\.com/.test(idxSrc));
  ok('1.9 九个反馈类型', F.TYPES.length === 9, 'n=' + F.TYPES.length);
  var typeIds = F.TYPES.map(function (t) { return t.id; });
  ok('1.10 反馈类型 id 唯一', typeIds.filter(function (x, i) { return typeIds.indexOf(x) === i; }).length === 9);

  /* ---------------- 2. 错误分类 ---------------- */
  var c1 = F.classify({ kind: 'timeout', tool: 'paper.search', message: '请求超时' });
  eq('2.1 论文搜索超时归外部服务', c1.category, 'external');
  var c2 = F.classify({ kind: 'tool_error', tool: 'compose.domain', message: '编排异常' });
  eq('2.2 compose 内部失败归 Agent', c2.category, 'agent');
  var c3 = F.classify({ kind: 'network', tool: 'compose.domain', message: 'Failed to fetch' });
  eq('2.3 compose 网络失败仍归外部服务', c3.category, 'external');
  var c4 = F.classify({ kind: 'pdf_no_text', tool: 'paper.fulltext', message: 'PDF 无可提取文本' });
  eq('2.4 PDF 无文本归数据解析', c4.category, 'data_parse');
  var c5 = F.classify({ kind: 'no_key', tool: 'model.openai', message: 'API Key 未配置', status: 401 });
  eq('2.5 缺 Key 归用户配置', c5.category, 'config');
  var c6 = F.classify({ kind: 'timeout', tool: 'simbad.tap', message: 'HTTP 403' });
  eq('2.6 HTTP 403 归外部服务', c6.category, 'external');
  var c7 = F.classify({ kind: 'empty', tool: 'paper.search', message: '没有找到相关论文' });
  eq('2.7 检索无结果归研究质量', c7.category, 'research_quality');
  var c8 = F.classify({ kind: 'tool_missing', tool: 'compose.simple', message: 'tool missing' });
  eq('2.8 工具缺失归系统内部', c8.category, 'system');
  var c9 = F.classify({ kind: 'cancelled', tool: 'paper.search', message: '任务已取消' });
  eq('2.9 取消保留 Agent 类别', c9.category, 'agent');
  eq('2.10 取消错误代码', c9.code, 'cancelled');
  var c10 = F.classify({ kind: 'auth', tool: 'model.deepseek', message: '401 unauthorized', status: 401, hasKey: true });
  eq('2.11 已配置凭据的 401 不归用户配置', c10.category, 'external');
  var c11 = F.classify({ kind: 'schema', tool: 'kb.lookup', message: 'schema invalid' });
  eq('2.12 状态结构错误归系统', c11.category, 'system');
  var c13 = F.classify({ kind: 'rate_limit', tool: 'evidence.search', message: 'HTTP 429' });
  eq('2.13 限流归外部服务', c13.category, 'external');
  var c14 = F.classify({ kind: 'encoding', tool: 'paper.fulltext', message: '编码异常' });
  eq('2.14 编码异常归数据解析', c14.category, 'data_parse');
  var c15 = F.classify({ kind: 'unknown', tool: 'unknown.tool', message: '未处理异常' });
  eq('2.15 未知内部异常归系统', c15.category, 'system');

  /* ---------------- 3. 主动触发与不误触发 ---------------- */
  var a1 = F.analyze({
    state: stateWith([failedStep('s1', 'paper.search', 'timeout', '论文检索超时')]),
    query: 'M42 的距离'
  });
  ok('3.1 论文搜索失败触发提示', a1.needed && a1.primary.category === 'external', JSON.stringify(a1.primary));
  var a2 = F.analyze({
    state: stateWith([failedStep('s1', 'compose.domain', 'tool_error', 'Agent 执行中断')]),
    query: '比较 M31 与 M33'
  });
  ok('3.2 Agent 失败触发提示', a2.needed && a2.primary.category === 'agent', JSON.stringify(a2.primary));
  var a3 = F.analyze({
    state: stateWith([failedStep('s1', 'paper.fulltext', 'pdf_no_text', 'PDF 无文本')]),
    query: '解析论文 PDF'
  });
  ok('3.3 PDF 解析失败触发提示', a3.needed && a3.primary.category === 'data_parse', JSON.stringify(a3.primary));
  var a4 = F.analyze({
    state: stateWith([{ id: 's1', tool: 'kb.lookup', status: 'ok' }]),
    query: 'M42 是什么'
  });
  ok('3.4 成功任务不触发', a4.needed === false, JSON.stringify(a4.issues));
  var a5 = F.analyze({
    state: stateWith([{ id: 's1', tool: 'paper.search', status: 'aborted', cancelled: true, error: { kind: 'cancelled' } }]),
    query: '取消的任务'
  });
  ok('3.5 用户主动取消不触发', a5.needed === false, JSON.stringify(a5.issues));
  var a6 = F.analyze({
    state: stateWith([]),
    answer: { query: '研究 M42', cancelled: true, meta: {} }
  });
  ok('3.6 取消答案不触发', a6.needed === false);
  var a7 = F.analyze({
    state: stateWith([]),
    answer: { query: '研究 M42', meta: { cloudExpression: { code: 'exception', reason: 'provider down' } } }
  });
  ok('3.7 模型调用失败触发外部服务提示', a7.needed && a7.primary.category === 'external', JSON.stringify(a7.primary));
  var a8 = F.analyze({
    state: stateWith([]),
    answer: { query: 'M42 距离', meta: { research: { evidence: 0, stopReason: 'empty', skip: false } } }
  });
  ok('3.8 检索零证据触发研究质量提示', a8.needed && a8.primary.category === 'research_quality', JSON.stringify(a8.primary));
  eq('3.9 零证据错误码', a8.primary.code, 'no_evidence');
  var a9 = F.analyze({
    state: stateWith([]),
    answer: { query: '本地计算', meta: { research: { evidence: 0, skip: true } } }
  });
  ok('3.10 本地计算跳过检索不触发', a9.needed === false);
  var a10 = F.analyze({
    state: stateWith([]),
    answer: { query: '上一条答案', meta: {} },
    query: '你刚才答错了，没有证据',
    userComplaint: true
  });
  ok('3.11 用户指认错误触发提示', a10.needed && a10.primary.code === 'user_reported', JSON.stringify(a10.primary));
  var a11 = F.analyze({
    state: stateWith([
      failedStep('s1', 'paper.search', 'timeout', '外网超时'),
      failedStep('s2', 'registry', 'tool_missing', '工具未注册')
    ])
  });
  eq('3.12 多问题优先展示系统错误', a11.primary.category, 'system');
  ok('3.13 所有问题进入诊断', a11.issues.length >= 2, 'n=' + a11.issues.length);
  eq('3.14 返回当前 Task ID', a11.taskId, 'task-feedback-1');
  var a12 = F.analyze({ state: null, answer: null, query: '普通问题' });
  ok('3.15 无任务无答案不触发', a12.needed === false);

  /* ---------------- 4. 去重与忽略 ---------------- */
  clean();
  var k1 = F.promptKey('task-A', 'external');
  ok('4.1 首次允许提示', F.shouldPrompt(k1));
  F.markPrompted(k1);
  ok('4.2 同 Task 同类别不再提示', F.shouldPrompt(k1) === false);
  var k2 = F.promptKey('task-A', 'data_parse');
  ok('4.3 同 Task 不同类别仍可提示', F.shouldPrompt(k2));
  var k3 = F.promptKey('task-B', 'external');
  ok('4.4 不同 Task 同类别仍可提示', F.shouldPrompt(k3));
  var k4 = F.promptKey('task-A', 'research_quality', 'user');
  ok('4.5 用户指认使用独立去重键', F.shouldPrompt(k4));
  F.ignore(k4);
  ok('4.6 忽略后不再提示', F.shouldPrompt(k4) === false);
  ok('4.7 去重信息写入本机', !!global.localStorage.getItem('astrum.feedback.seen'));
  for (var d = 0; d < 205; d++) F.markPrompted(F.promptKey('bulk-' + d, 'system'));
  var seenObj = JSON.parse(global.localStorage.getItem('astrum.feedback.seen'));
  ok('4.8 去重记录最多保留 200 条', Object.keys(seenObj).length <= 200, 'n=' + Object.keys(seenObj).length);
  F.clearPromptHistory();
  ok('4.9 可清空去重记录', F.shouldPrompt(k1));

  /* ---------------- 5. 脱敏 ---------------- */
  var rawObj = {
    api_key: 'abc123',
    authorization: 'Bearer sk-live-abcdefghijklmnop',
    token: 'tok_123',
    password: 'p@ss',
    secret: 's3cr3t',
    cookie: 'sid=abc',
    session: 'sess-abc',
    nested: { access_token: 'abc', ok: 'normal text' }
  };
  var safeObj = F.sanitizeValue(rawObj);
  eq('5.1 api_key 被脱敏', safeObj.api_key, '[REDACTED]');
  eq('5.2 authorization 被脱敏', safeObj.authorization, '[REDACTED]');
  eq('5.3 token 被脱敏', safeObj.token, '[REDACTED]');
  eq('5.4 password 被脱敏', safeObj.password, '[REDACTED]');
  eq('5.5 secret 被脱敏', safeObj.secret, '[REDACTED]');
  eq('5.6 cookie 被脱敏', safeObj.cookie, '[REDACTED]');
  eq('5.7 session 被脱敏', safeObj.session, '[REDACTED]');
  eq('5.8 嵌套 token 被脱敏', safeObj.nested.access_token, '[REDACTED]');
  eq('5.9 普通文本保留', safeObj.nested.ok, 'normal text');

  var r1 = F.redact('Bearer abcdefghijklmnop');
  ok('5.10 Bearer 凭据被脱敏', !/abcdefghijklmnop/.test(r1), r1);
  var r2 = F.redact('api_key=abc123&x=1');
  ok('5.11 URL 参数密钥被脱敏', !/abc123/.test(r2), r2);
  var r3 = F.redact('Cookie: sid=abc; theme=dark');
  ok('5.12 Cookie 被脱敏', !/sid=abc/.test(r3), r3);
  var r4 = F.redact('session=abcd1234');
  ok('5.13 session 被脱敏', !/abcd1234/.test(r4), r4);
  var r5 = F.redact('sk-live-abcdefghijklmnopqrstuvwxyz');
  ok('5.14 sk- 密钥被脱敏', !/sk-live/.test(r5), r5);
  var r6 = F.redact('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ012345');
  ok('5.15 GitHub token 被脱敏', !/ghp_/.test(r6), r6);
  var r7 = F.redact('AIzaSyABCDEFGHIJKLMNOPQRSTUVWXYZ0123456');
  ok('5.16 Google key 被脱敏', !/AIza/.test(r7), r7);
  var r8 = F.redact('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop');
  ok('5.17 JWT 被脱敏', !/eyJhbGci/.test(r8), r8);
  var r9 = F.redact('C:\\Users\\ZBZ20\\Documents\\secret.txt');
  ok('5.18 Windows 绝对路径被脱敏', !/C:\\Users/.test(r9), r9);
  var r10 = F.redact('/home/zbz/private/notes.txt');
  ok('5.19 Unix 绝对路径被脱敏', !/\/home\/zbz/.test(r10), r10);
  var r11 = F.redact('file:///C:/Users/me/data.json');
  ok('5.20 file:// 路径被脱敏', !/file:\/\/\/C:/.test(r11), r11);
  var long = 'x'.repeat(600);
  ok('5.21 单字符串长度受限', F.sanitizeValue(long).length <= 401, F.sanitizeValue(long).length);
  var deep = { a: { b: { c: { d: { e: { f: 'deep' } } } } } };
  ok('5.22 过深对象被截断', JSON.stringify(F.sanitizeValue(deep)).indexOf('[TRUNCATED]') >= 0);

  /* ---------------- 6. 诊断最小上下文 ---------------- */
  var steps = [];
  for (var s = 0; s < 35; s++) {
    steps.push({
      id: 's' + s, tool: 'paper.search', status: 'failed',
      error: { kind: 'timeout', message: '请求超时 password=abc123' }, durationMs: s
    });
  }
  var diag = F.buildDiagnostic({
    feedbackId: 'FB-TEST-1',
    state: stateWith(steps, { id: 'task-current', question: '当前任务' }),
    context: {
      query: '当前问题', answerText: 'CURRENT_ANSWER ' + 'y'.repeat(600),
      threadId: 'thread-current', messageId: 'msg-current',
      agents: ['Muse', 'a', 'b', 'c', 'd', 'e'], tools: ['t1', 't2', 't3', 't4', 't5', 't6'],
      sources: ['s1', 's2', 's3', 's4', 's5', 's6'], history: 'OTHER_TASK_SECRET'
    },
    error: { category: 'external', code: 'timeout', summary: 'HTTP 403 token=abc123' },
    pageModule: 'chat', version: '4.8'
  });
  eq('6.1 诊断 schema 固定', diag.schema, 'astrum.feedback.diagnostic/1');
  eq('6.2 反馈编号写入诊断', diag.feedbackId, 'FB-TEST-1');
  eq('6.3 只记录当前 Task ID', diag.task.id, 'task-current');
  eq('6.4 只记录当前 Thread ID', diag.task.threadId, 'thread-current');
  eq('6.5 只记录当前消息 ID', diag.context.messageId, 'msg-current');
  ok('6.6 步骤数量受限 30', diag.task.steps.length <= 30, 'n=' + diag.task.steps.length);
  ok('6.7 Agent 列表最多 5 个', diag.context.agents.length <= 5, 'n=' + diag.context.agents.length);
  ok('6.8 工具列表最多 5 个', diag.context.tools.length <= 5, 'n=' + diag.context.tools.length);
  ok('6.9 来源列表最多 5 个', diag.context.sources.length <= 5, 'n=' + diag.context.sources.length);
  ok('6.10 诊断不含其他任务标记', JSON.stringify(diag).indexOf('OTHER_TASK_SECRET') < 0);
  ok('6.11 诊断中密码已脱敏', JSON.stringify(diag).indexOf('abc123') < 0);
  ok('6.12 回答摘录限制在 300 字', (diag.context.answerExcerpt || '').length <= 301, (diag.context.answerExcerpt || '').length);
  ok('6.13 诊断总长度不超过 20000', JSON.stringify(diag).length <= 20000, JSON.stringify(diag).length);
  eq('6.14 记录 ASTRUM 版本', diag.astrumVersion, '4.8');
  ok('6.15 记录浏览器信息', !!diag.browser.userAgent && !!diag.browser.platform);
  ok('6.16 记录页面模块', diag.page.module === 'chat', diag.page.module);

  var hugeState = stateWith([], { id: 'task-huge', question: '超长任务' });
  for (var h = 0; h < 40; h++) {
    hugeState.steps.push({ id: 'h' + h, tool: 'x'.repeat(300), status: 'failed', error: { kind: 'x', message: 'z'.repeat(500) } });
    hugeState.events.push({ at: '2026-01-01T00:00:00Z', type: 'step.failed', stepId: 'h' + h, payload: { reason: 'r'.repeat(300) } });
  }
  var hugeDiag = F.buildDiagnostic({ feedbackId: 'FB-HUGE', state: hugeState, context: { query: 'Q', answerText: 'A'.repeat(3000) }, version: '4.8' });
  ok('6.17 超大诊断仍不超过 20000', JSON.stringify(hugeDiag).length <= 20000, JSON.stringify(hugeDiag).length);
  ok('6.18 超大诊断步骤被裁剪', hugeDiag.task.steps.length <= 30, hugeDiag.task.steps.length);

  /* ---------------- 7. 草稿校验 ---------------- */
  var bad = F.buildDraft({});
  ok('7.1 空草稿校验失败', bad.ok === false);
  ok('7.2 空草稿给出三个必填错误', bad.errors && bad.errors.length === 3, bad.errors && bad.errors.map(function (e) { return e.field; }).join(','));
  var badTitle = F.buildDraft({ type: 'bug', title: 'x'.repeat(81), description: 'ok' });
  ok('7.3 标题超长被拒', badTitle.ok === false && badTitle.errors[0].field === 'title');
  var badDesc = F.buildDraft({ type: 'bug', title: 'ok', description: 'x'.repeat(2001) });
  ok('7.4 描述超长被拒', badDesc.ok === false && badDesc.errors[0].field === 'description');
  var badSteps = F.buildDraft({ type: 'bug', title: 'ok', description: 'ok', steps: 'x'.repeat(1001) });
  ok('7.5 复现步骤超长被拒', badSteps.ok === false && badSteps.errors[0].field === 'steps');
  var badEmail = F.buildDraft({ type: 'bug', title: 'ok', description: 'ok', contactEmail: 'not-an-email' });
  ok('7.6 联系邮箱格式错误被拒', badEmail.ok === false && badEmail.errors[0].field === 'contactEmail');
  var noEmail = F.buildDraft({ type: 'bug', title: '可反馈', description: '描述' });
  ok('7.7 联系邮箱选填仍可生成', noEmail.ok === true);
  eq('7.8 选填邮箱为空', noEmail.draft.contactEmail, '');
  var allTypes = 0;
  F.TYPES.forEach(function (t) {
    var r = F.buildDraft({ type: t.id, title: '类型 ' + t.id, description: '描述' });
    if (r.ok) allTypes++;
  });
  eq('7.9 九种反馈类型均可生成', allTypes, 9);
  var idOk = F.buildDraft({ type: 'bug', title: '编号', description: '描述' });
  ok('7.10 反馈编号格式统一', /^FB-\d{8}-\d{6}-[0-9A-F]{4}$/.test(idOk.draft.id), idOk.draft.id);
  var idFixed = F.buildDraft({ type: 'bug', title: '固定编号', description: '描述', id: 'FB-FIXED' });
  eq('7.11 可指定反馈编号', idFixed.draft.id, 'FB-FIXED');
  var noDiag = F.buildDraft({ type: 'bug', title: '不附加', description: '描述' });
  ok('7.12 默认不附加诊断', noDiag.draft.includeDiagnostics === false && noDiag.draft.diagnostic === null);
  var withDiag = F.buildDraft({
    type: 'bug', title: '附加诊断', description: '描述', includeDiagnostics: true,
    state: stateWith([failedStep('s1', 'paper.search', 'timeout', 'HTTP 403 token=abc')]),
    context: { query: 'Q', taskId: 'task-1', answerText: 'A' }
  });
  ok('7.13 勾选后生成诊断对象', withDiag.ok && !!withDiag.draft.diagnostic);
  ok('7.14 草稿内诊断已脱敏', JSON.stringify(withDiag.draft.diagnostic).indexOf('token=abc') < 0);
  var redTitle = F.buildDraft({ type: 'bug', title: '密钥 sk-live-abcdefghijklmnop', description: 'Bearer abcdefghijklmnop' });
  ok('7.15 标题中的密钥已脱敏', !/sk-live/.test(redTitle.draft.title), redTitle.draft.title);
  ok('7.16 描述中的 Bearer 已脱敏', !/abcdefghijklmnop/.test(redTitle.draft.description), redTitle.draft.description);
  var ctxDraft = F.buildDraft({
    type: 'agent_execution', title: '回答反馈', description: '描述',
    context: {
      query: 'M42 的距离？', answerText: '答'.repeat(600), messageId: 'msg-1', taskId: 'task-1', threadId: 'thread-1',
      agents: ['Muse', 'Scholar'], tools: ['paper.search', 'compose.domain'], sources: ['arxiv.org']
    }
  });
  eq('7.17 关联消息 ID', ctxDraft.draft.context.messageId, 'msg-1');
  eq('7.18 关联任务 ID', ctxDraft.draft.context.taskId, 'task-1');
  ok('7.19 回答摘录受限', ctxDraft.draft.context.answerExcerpt.length <= 501, ctxDraft.draft.context.answerExcerpt.length);
  eq('7.20 关联 Agent', ctxDraft.draft.context.agents.join(','), 'Muse,Scholar');
  eq('7.21 关联工具', ctxDraft.draft.context.tools.join(','), 'paper.search,compose.domain');
  ok('7.22 不串其他任务上下文', !/OTHER_TASK/.test(JSON.stringify(ctxDraft.draft.context)));
  var xss = F.buildDraft({ type: 'bug', title: '<img src=x onerror=1>', description: '描述' });
  eq('7.23 草稿保留原始文本由界面转义', xss.draft.title, '<img src=x onerror=1>');

  /* ---------------- 8. 邮件 ---------------- */
  var draft = F.buildDraft({
    type: 'research_result', title: 'M42 距离回答有误', description: '请核对引用。',
    steps: '打开 M42 问题', expected: '给出 1344 光年', actual: '给出了错误数值',
    contactEmail: 'user@example.com',
    includeDiagnostics: true,
    state: stateWith([failedStep('s1', 'paper.search', 'timeout', '论文检索超时')]),
    error: { category: 'external', code: 'timeout', summary: '论文检索超时' },
    context: { query: 'M42 的距离是多少？', answerText: '答案正文', messageId: 'msg-1', taskId: 'task-1' },
    version: '4.8'
  }).draft;
  eq('8.1 邮件主题格式正确', F.subject(draft),
    '[ASTRUM Feedback][研究结果不准确] M42 距离回答有误');
  var body = F.body(draft);
  ok('8.2 正文含反馈编号', body.indexOf(draft.id) >= 0);
  ok('8.3 正文含反馈类型', body.indexOf('研究结果不准确') >= 0);
  ok('8.4 正文含问题标题', body.indexOf('M42 距离回答有误') >= 0);
  ok('8.5 正文含用户描述', body.indexOf('请核对引用') >= 0);
  ok('8.6 正文含复现步骤', body.indexOf('打开 M42 问题') >= 0);
  ok('8.7 正文含预期结果', body.indexOf('1344 光年') >= 0);
  ok('8.8 正文含实际结果', body.indexOf('错误数值') >= 0);
  ok('8.9 正文含 ASTRUM 版本', body.indexOf('4.8') >= 0);
  ok('8.10 正文含发生时间', body.indexOf(draft.createdAt) >= 0);
  ok('8.11 正文含错误摘要', body.indexOf('论文检索超时') >= 0);
  ok('8.12 正文含诊断附件说明', body.indexOf('astrum-feedback-' + draft.id + '.json') >= 0);
  ok('8.13 正文承诺需用户主动发送', body.indexOf('需由用户在邮件客户端中确认并发送') >= 0);
  ok('8.14 正文只含当前上下文', body.indexOf('M42 的距离是多少') >= 0 && body.indexOf('OTHER_TASK') < 0);
  ok('8.15 正文含联系邮箱（用户主动填写）', body.indexOf('user@example.com') >= 0);
  var plain = F.plainText(draft);
  ok('8.16 复制文本含收件人', plain.indexOf('2185428966@qq.com') >= 0);
  ok('8.17 复制文本含主题', plain.indexOf('ASTRUM Feedback') >= 0);

  var m = F.mailtoUrl(draft);
  ok('8.18 mailto 收件人正确', m.url.indexOf('mailto:2185428966@qq.com') === 0, m.url.slice(0, 60));
  ok('8.19 mailto 主题编码正确', decodeURIComponent(m.url.split('subject=')[1].split('&')[0]) === F.subject(draft));
  ok('8.20 mailto 正文编码正确', decodeURIComponent(m.url.split('body=')[1]) === body);
  ok('8.21 中文已进行 URL 编码', !/M42 距离回答有误/.test(m.url));
  ok('8.22 常规中文反馈未超限', m.tooLong === false, 'len=' + m.length);

  var longDraft = F.buildDraft({
    type: 'bug', title: '超长反馈', description: '长'.repeat(2000),
    steps: '步'.repeat(1000), expected: '预'.repeat(800), actual: '实'.repeat(800),
    includeDiagnostics: true, version: '4.8'
  }).draft;
  var longMail = F.mailtoUrl(longDraft);
  ok('8.23 超长内容触发 tooLong', longMail.tooLong === true, 'len=' + longMail.length);
  var subLong = F.submitFeedback(longDraft);
  ok('8.24 超长提交仍返回复制/下载依据', subLong.ok === true && subLong.tooLong === true);
  ok('8.25 超长时正文与主题仍可复制', subLong.body.length > 0 && subLong.subject.length > 0);

  var sub = F.submitFeedback(draft);
  ok('8.26 submitFeedback 成功', sub.ok === true && sub.mode === 'mailto');
  eq('8.27 提交返回正确收件人', sub.recipient, '2185428966@qq.com');
  ok('8.28 提交不声明已发送', !Object.prototype.hasOwnProperty.call(sub, 'sent'));
  ok('8.29 提交只返回草稿不打开客户端', !Object.prototype.hasOwnProperty.call(sub, 'opened'));
  var noId = F.submitFeedback({});
  ok('8.30 无编号草稿被拒绝', noId.ok === false && noId.reason === 'invalid_draft');
  var opened = F.openMailClient(draft);
  ok('8.31 Node 环境不伪装打开客户端', opened.opened === false, opened.reason);
  ok('8.32 未确认前无任何发送接口副作用', F.version === '1.0.0');
  ok('8.33 可注册未来反馈渠道', F.registerChannel('mock-future', function () { return { ok: true }; }) === true);
  var diagJson = F.diagnosticJson(draft);
  eq('8.34 诊断 JSON 与草稿一致', diagJson, JSON.stringify(draft.diagnostic, null, 2));
  ok('8.35 诊断下载文件名正确', F.downloadName(draft).indexOf('astrum-feedback-' + draft.id) === 0);

  var noDiagBody = F.body(F.buildDraft({ type: 'suggestion', title: '建议', description: '想法' }).draft);
  ok('8.36 未附加诊断时正文明确说明', noDiagBody.indexOf('用户未选择附加诊断信息') >= 0);
  ok('8.37 无诊断 JSON', F.diagnosticJson(F.buildDraft({ type: 'suggestion', title: '建议', description: '想法' }).draft) === '');

  /* ---------------- 9. 汇总 ---------------- */
  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra));
  });
  console.log('\nRESULT ' + pass + '/' + results.length);
  process.exit(failed.length ? 1 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
