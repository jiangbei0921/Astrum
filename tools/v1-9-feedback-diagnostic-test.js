/* ASTRUM · V1.9 反馈诊断与科研问题联动
 *
 * 验证新增诊断字段：论文/证据/Claim/evidenceRefs/PDF 状态/工具状态/
 * Provider 状态/gaps/limitations；同时确保脱敏、长度上限和“不打包完整报告”。
 *
 * 用法：node tools/v1-9-feedback-diagnostic-test.js
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

var results = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) }); if (cond) pass++; }

function makeAnswer() {
  return {
    query: 'M13 的年龄和金属丰度测量是否一致？',
    intent: 'knowledge-target',
    research: {
      papers: [
        { title: 'A new age for M13', date: '2020-01-01', doi: '10.1234/m13a', url: 'https://doi.org/10.1234/m13a', abstractOnly: false, fulltextAvailable: true },
        { title: 'Metallicity of M13', date: '2018-01-01', doi: '10.1234/m13b', url: 'https://doi.org/10.1234/m13b', abstractOnly: true, fulltextAvailable: false }
      ],
      evidence: [{ evidenceId: 'ev_1' }, { evidenceId: 'ev_2' }],
      claims: [{ id: 'c1', evidenceRefs: ['ev_1'] }, { id: 'c2', evidenceRefs: ['ev_2'] }],
      conclusions: [{ text: '年龄约 116 亿年', evidenceRefs: ['ev_1', 'ev_2'] }],
      gaps: ['仅一篇获得全文；另一篇仅摘要', '不同论文的金属丰度标尺需统一'],
      limitations: ['未获得独立观测验证', '摘要未给出误差'],
      reportId: 'rep_1'
    },
    meta: {
      research: { profile: 'papers', stopReason: 'done', evidence: 2, conflicts: 0 },
      cloudExpression: { sourceId: 'deepseek', code: 'ok', latency: 320 }
    }
  };
}
function makeState() {
  return {
    id: 'task-m13-feedback',
    question: 'M13 年龄与金属丰度',
    steps: [
      { id: 't2', tool: 'paper.search', status: 'ok', durationMs: 1200 },
      { id: 't3', tool: 'evidence.search', status: 'ok', durationMs: 800 },
      { id: 't4', tool: 'paper.fulltext', status: 'failed', error: { kind: 'pdf_no_text', code: 'pdf_no_text', message: 'PDF 无文本层' }, durationMs: 3000 },
      { id: 't5', tool: 'compose.domain', status: 'ok', durationMs: 500 }
    ],
    events: [{ at: '2026-11-03T00:00:00Z', type: 'step.failed', stepId: 't4', payload: { reason: 'pdf_no_text' } }],
    plan: { template: 'T-E' }
  };
}

(function main() {
  var answer = makeAnswer();
  var state = makeState();
  var diag = F.buildDiagnostic({
    feedbackId: 'FB-V19-1', state: state, answer: answer,
    context: {
      query: answer.query, answerText: 'ANSWER_SHOULD_BE_TRIMMED', messageId: 'm-1', taskId: 'task-m13-feedback',
      threadId: 'thread-1', agents: ['muse', 'scholar', 'critic'], tools: ['paper.search', 'paper.fulltext'],
      sources: ['doi.org'], provider: { id: 'deepseek', name: 'DeepSeek', type: 'cloud', status: '已连通' }
    },
    error: { category: 'data_parse', code: 'pdf_no_text', summary: 'PDF 无文本层' },
    version: '4.8'
  });

  ok('D1 任务 ID', diag.task.id === 'task-m13-feedback', diag.task.id);
  ok('D2 Thread ID', diag.task.threadId === 'thread-1', diag.task.threadId);
  ok('D3 模板', diag.task.template === 'T-E', diag.task.template);
  ok('D4 论文数量', diag.research.paperCount === 2, diag.research.paperCount);
  ok('D5 证据数量', diag.research.evidenceCount === 2, diag.research.evidenceCount);
  ok('D6 Claim 数量', diag.research.claimCount === 2, diag.research.claimCount);
  ok('D7 evidenceRefs 数量', diag.research.evidenceRefCount === 2, diag.research.evidenceRefCount);
  ok('D8 摘要/全文计数', diag.research.abstractOnlyCount === 1 && diag.research.fulltextCount === 1,
    diag.research.abstractOnlyCount + '/' + diag.research.fulltextCount);
  ok('D9 gaps 进入诊断', diag.research.gaps.length === 2, diag.research.gaps.length);
  ok('D10 limitations 进入诊断', diag.research.limitations.length === 2, diag.research.limitations.length);
  ok('D11 PDF 失败状态', diag.research.pdf && diag.research.pdf.tool === 'paper.fulltext' &&
    diag.research.pdf.code === 'pdf_no_text', JSON.stringify(diag.research.pdf));
  ok('D12 工具状态摘要', diag.research.toolStatus.indexOf('paper.search:ok') >= 0 &&
    diag.research.toolStatus.indexOf('paper.fulltext:failed') >= 0, diag.research.toolStatus.join(','));
  ok('D13 Provider 状态', diag.research.provider && diag.research.provider.id === 'deepseek' &&
    diag.research.provider.status === '已连通', JSON.stringify(diag.research.provider));
  ok('D14 研究元信息', diag.research.metadata && diag.research.metadata.stopReason === 'done', JSON.stringify(diag.research.metadata));
  ok('D15 错误类别/代码', diag.error.category === 'data_parse' && diag.error.code === 'pdf_no_text', JSON.stringify(diag.error));
  ok('D16 不打包完整报告', JSON.stringify(diag).indexOf('reportId') < 0 &&
    JSON.stringify(diag).indexOf('fulltextAvailable') < 0 &&
    JSON.stringify(diag).indexOf('A new age for M13') < 0, '');
  ok('D17 回答摘录受限在 300 字内', (diag.context.answerExcerpt || '').length <= 300 &&
    (diag.context.answerExcerpt || '').indexOf('ANSWER_SHOULD_BE_TRIMMED') >= 0, diag.context.answerExcerpt);

  /* 脱敏：gaps/limitations/provider 中的密钥也必须过滤 */
  var dirty = makeAnswer();
  dirty.research.gaps = ['排查时发现 api_key=sk-live-abcdefghijklmnop', '详见 C:\\Users\\me\\logs\\run.txt'];
  dirty.research.limitations = ['Authorization: Bearer abcdefghijklmnopqrstuvwxyz'];
  dirty.meta.cloudExpression = { sourceId: 'openai', code: 'exception', reason: 'token=abc123' };
  var d2 = F.buildDiagnostic({
    feedbackId: 'FB-V19-2', state: makeState(), answer: dirty,
    context: {
      query: '诊断脱敏', answerText: 'sk-live-abcdefghijklmnop',
      agents: ['muse'], provider: { id: 'openai', name: 'OpenAI', status: 'session=abc' }
    },
    version: '4.8'
  });
  var raw2 = JSON.stringify(d2);
  ok('D18 gaps 密钥脱敏', !/sk-live/.test(raw2) && !/abc123/.test(raw2), raw2.slice(0, 120));
  ok('D19 Authorization 脱敏', !/abcdefghijklmnopqrstuvwxyz/.test(raw2), '');
  ok('D20 本地路径脱敏', !/C:\\Users/.test(raw2), '');
  ok('D21 Provider session 脱敏', !/session=abc/.test(raw2), JSON.stringify(d2.research.provider));

  /* 超大研究报告：只保留计数与有限 gap，不因报告变大而突破上限 */
  var huge = makeAnswer();
  huge.research.gaps = new Array(200).fill('超长缺口描述 '.repeat(40));
  huge.research.limitations = new Array(200).fill('超长限制描述 '.repeat(40));
  huge.research.papers = new Array(200).fill({ title: 'paper '.repeat(50), url: 'https://example.org/x', date: '2020-01-01' });
  huge.research.evidence = new Array(200).fill({ evidenceId: 'ev' });
  huge.research.claims = new Array(200).fill({ id: 'c', evidenceRefs: ['ev'] });
  var d3 = F.buildDiagnostic({ feedbackId: 'FB-V19-3', state: makeState(), answer: huge, context: { query: '大报告' }, version: '4.8' });
  ok('D22 大报告总量仍受限', JSON.stringify(d3).length <= 20000, JSON.stringify(d3).length);
  ok('D23 大报告计数准确', d3.research.paperCount === 200 && d3.research.claimCount === 200,
    d3.research.paperCount + '/' + d3.research.claimCount);
  ok('D24 大报告 gaps 数量受限', d3.research.gaps.length <= 5, d3.research.gaps.length);

  /* 反馈草稿仍只带最小上下文 */
  var draft = F.buildDraft({
    type: 'research_result', title: 'M13 研究反馈', description: '证据链有问题',
    includeDiagnostics: true, state: state, answer: answer,
    context: { query: answer.query, answerText: 'answer', messageId: 'm-1', taskId: 'task-m13-feedback' },
    error: { category: 'data_parse', code: 'pdf_no_text', summary: 'PDF 无文本层' }, version: '4.8'
  });
  ok('D25 草稿生成成功', draft.ok === true);
  ok('D26 草稿诊断含科研字段', draft.ok && draft.draft.diagnostic.research.paperCount === 2);
  ok('D27 草稿正文不含完整报告', draft.ok && F.body(draft.draft).indexOf('reportId') < 0);

  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra)); });
  console.log('\nRESULT ' + pass + '/' + results.length);
  process.exitCode = failed.length ? 1 : 0;
})();
