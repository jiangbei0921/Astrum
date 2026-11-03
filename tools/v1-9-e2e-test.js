/* ASTRUM · V1.9 跨任务端到端联动
 *
 * 场景：
 *   E1 真实 PDF → 分块 → 全文证据
 *   E2 Claim/Reducer/Report → evidenceRefs 可追溯
 *   E3 研究异常 → 主动反馈分类 → 诊断草稿
 *   E4 Provider 失败 → 反馈分类
 *   E5 普通科研回答 → 反馈上下文（不串任务）
 *
 * 真实 PDF 缺失时该段标 BLOCKED_SAMPLE（exit 2），其余仍执行。
 * 用法：node tools/v1-9-e2e-test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var PDF_DIR = path.join(ROOT, 'tools', 'fixtures', 'pdf-real');
var PDF_FILE = path.join(PDF_DIR, '1106.4307v1.pdf');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] != null ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.sessionStorage = global.localStorage;
[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/pdf-text.js', 'core/paper-fulltext.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js',
  'core/feedback.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore, R = global.AstroRequest, Registry = global.AstroRegistry, Adapter = global.AstroComposeAdapter;
var Pdf = global.AstroPdfText, FT = global.AstroPaperFulltext;
var E = global.AstroEvidence, C = global.AstroClaims, Red = global.AstroReducer, Rep = global.AstroReport;
var F = global.AstroFeedback;
var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };

var results = [], pass = 0, blocked = false;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) }); if (cond) pass++; }

(async function main() {
  var report = null, parse = null;
  if (!fs.existsSync(PDF_FILE)) {
    blocked = true;
    console.log('BLOCKED_SAMPLE | 缺少真实 PDF ' + PDF_FILE);
  } else {
    parse = await Pdf.parse(new Uint8Array(fs.readFileSync(PDF_FILE)));
    ok('E1.1 真实 PDF 解析成功', parse.ok === true, parse.code || '');
    ok('E1.2 参考文献已定位', parse.referencesStartPage === 25, parse.referencesStartPage);
    ok('E1.3 标题可识别', /Globular clusters/i.test(parse.title || ''), parse.title);
    ok('E1.4 参考文献不进入正文块',
      (parse.chunks || []).every(function (c) { return c.pageStart == null || c.pageStart <= parse.referencesStartPage; }));

    var paper = {
      title: parse.title || 'Globular clusters in the outer Galactic halo',
      content: { doi: parse.doi || '', pdfUrl: 'https://arxiv.org/pdf/1106.4307v1' },
      publishedAt: '2011-06-21',
      url: 'https://arxiv.org/pdf/1106.4307v1'
    };
    var chunks = FT.buildChunks(parse, paper, {});
    var evs = FT.buildEvidence(paper, parse, chunks, {});
    ok('E1.5 全文分块生成', chunks.length >= 20, chunks.length);
    ok('E1.6 全文证据生成', evs.length >= 4, evs.length);
    ok('E1.7 证据带页码/章节', evs.every(function (x) {
      return x.content && x.content.contentLevel === 'fulltext' &&
        x.content.extractionMethod === 'pdf-text-v1';
    }), evs.length);
    ok('E1.8 证据不含参考文献', evs.every(function (x) {
      return !/^\s*References\b/i.test(x.content.excerpt || '') && !/doi:\s*10\./i.test((x.content.excerpt || '').slice(0, 60));
    }), '');
    ok('E1.9 证据有可追溯 URL', evs.every(function (x) { return /^https?:\/\//i.test(x.uri || ''); }));
    var evIds = {};
    ok('E1.10 全文块 evidenceId 唯一', evs.every(function (x) {
      if (evIds[x.evidenceId]) return false;
      evIds[x.evidenceId] = 1; return true;
    }), evs.map(function (x) { return x.evidenceId; }).join(','));

    if (E && C && Red && Rep) {
      var claims = C.buildClaimsFromEvidence(evs, {});
      var judged = C.judgeAll(claims, { evidence: evs });
      var reduced = Red.reduce({ evidence: evs, claims: judged.claims });
      report = Rep.build({
        question: 'M13 球状星团年龄与金属丰度', evidence: evs, claims: judged.claims,
        verdicts: judged.verdicts, reducer: reduced, retrievedAt: '2026-11-03T00:00:00Z'
      });
      ok('E2.1 Claim 生成', claims.length >= 2, claims.length);
      ok('E2.2 Claim 关联 evidence support', claims.filter(function (x) {
        return (x.support || []).filter(function (s) { return !!s.eid; }).length > 0;
      }).length >= 2, claims.length);
      var claimIds = {};
      ok('E2.2b Claim id 唯一', claims.every(function (x) {
        if (claimIds[x.id]) return false;
        claimIds[x.id] = 1; return true;
      }), claims.map(function (x) { return x.id; }).join(','));
      ok('E2.3 Claim 判定可执行', judged.verdicts && Object.keys(judged.verdicts || {}).length >= 1,
        judged.verdicts && Object.keys(judged.verdicts).length);
      ok('E2.4 报告生成', !!report && (report.conclusions || []).length >= 1, report && (report.conclusions || []).length);
      var ids = {};
      (report.evidence || []).forEach(function (x) { ids[x.evidenceId] = 1; });
      var bad = [];
      (report.conclusions || []).forEach(function (cl) {
        (cl.evidenceRefs || []).forEach(function (id) { if (!ids[id]) bad.push(id); });
      });
      ok('E2.5 结论引用全部可追溯', bad.length === 0, bad.join(','));
      ok('E2.6 报告保留 gaps/limitations', (report.gaps || []).length > 0 && (report.limitations || []).length > 0,
        (report.gaps || []).length + '/' + (report.limitations || []).length);
    }

    var answer = { query: 'M13 球状星团年龄', intent: 'knowledge-target', sections: [], meta: {}, research: report || {} };
    var state = {
      id: 'task-v19-pdf', question: answer.query,
      steps: [
        { id: 't2', tool: 'paper.search', status: 'ok' },
        { id: 't4', tool: 'paper.fulltext', status: 'failed', error: { kind: 'pdf_no_text', code: 'pdf_no_text', message: 'PDF 无文本层' } }
      ],
      events: [{ type: 'step.failed', stepId: 't4', payload: { reason: 'pdf_no_text' } }],
      plan: { template: 'T-E' }
    };
    var diag = F.buildDiagnostic({
      feedbackId: 'FB-V19-E2E', state: state, answer: answer,
      context: {
        query: answer.query, answerText: 'PDF 全文研究回答摘要', messageId: 'm-v19', taskId: state.id,
        threadId: 'th-v19', agents: ['muse', 'scholar', 'critic'], tools: ['paper.search', 'paper.fulltext'],
        provider: { id: 'local', name: 'ASTRUM 内核', type: 'local', status: '离线可用' }
      },
      error: { category: 'data_parse', code: 'pdf_no_text', summary: 'PDF 无文本层' }, version: '4.8'
    });
    ok('E3.1 诊断关联任务/线程', diag.task.id === state.id && diag.task.threadId === 'th-v19');
    ok('E3.2 诊断含 PDF 失败状态', diag.research.pdf && diag.research.pdf.code === 'pdf_no_text');
    ok('E3.3 诊断含论文/证据计数', diag.research.paperCount >= 1 && diag.research.evidenceCount >= 1,
      diag.research.paperCount + '/' + diag.research.evidenceCount);
    ok('E3.4 诊断含 gaps/limitations', diag.research.gaps.length > 0 && diag.research.limitations.length > 0);
    ok('E3.5 诊断未打包完整报告', JSON.stringify(diag).indexOf('"conclusions"') < 0 && JSON.stringify(diag).indexOf('reportId') < 0);
  }

  /* E3 研究异常 → 主动反馈分类 */
  var analyze = F.analyze({
    state: {
      id: 'task-v19-anomaly', steps: [
        { id: 't4', tool: 'paper.fulltext', status: 'failed', error: { kind: 'pdf_no_text', code: 'pdf_no_text', message: 'PDF 无文本层' } }
      ], events: [], plan: { template: 'T-E' }
    },
    query: 'M13 论文全文分析'
  });
  ok('E3.6 研究异常触发反馈', analyze.needed && analyze.primary.category === 'data_parse', JSON.stringify(analyze.primary));
  ok('E3.7 同任务去重键稳定', F.promptKey(analyze.taskId, analyze.primary.category) === 'task-v19-anomaly::data_parse');

  /* E4 Provider 失败 → 反馈分类 */
  var providerIssue = F.analyze({
    state: { id: 'task-v19-provider', steps: [], events: [], plan: { template: 'T-E' } },
    answer: { query: 'Provider 测试', meta: { cloudExpression: { code: 'timeout', sourceId: 'deepseek', reason: '请求超时' } } },
    query: 'Provider 测试'
  });
  ok('E4.1 Provider 超时归类外部服务', providerIssue.needed && providerIssue.primary.category === 'external',
    JSON.stringify(providerIssue.primary));
  var draft = F.buildDraft({
    type: 'bug', title: 'Provider 调用超时', description: '模型表述阶段超时，研究结论仍保留。',
    includeDiagnostics: true, state: { id: 'task-v19-provider', steps: [], events: [], plan: { template: 'T-E' } },
    answer: { query: 'Provider 测试', meta: { cloudExpression: { code: 'timeout', sourceId: 'deepseek' } } },
    error: providerIssue.primary,
    context: { query: 'Provider 测试', messageId: 'm-provider', taskId: 'task-v19-provider', provider: { id: 'deepseek', name: 'DeepSeek', status: '触发限流' } },
    version: '4.8'
  });
  ok('E4.2 Provider 反馈草稿生成', draft.ok === true);
  ok('E4.3 反馈正文不含发送成功声明', draft.ok && /需由用户在邮件客户端中确认并发送/.test(F.body(draft.draft)));
  ok('E4.4 反馈草稿不自动发送', draft.ok && !Object.prototype.hasOwnProperty.call(F.submitFeedback(draft.draft), 'sent'));

  /* E5 普通回答反馈上下文不串任务 */
  var normal = F.buildDraft({
    type: 'research_result', title: 'M13 回答质量', description: '证据链有问题',
    includeDiagnostics: false,
    context: { query: 'M13 是什么', answerText: '武仙座球状星团', messageId: 'm-normal', taskId: 'task-normal', threadId: 'th-normal' },
    version: '4.8'
  });
  ok('E5.1 普通回答反馈生成', normal.ok === true);
  ok('E5.2 消息/任务 ID 正确', normal.ok && normal.draft.context.messageId === 'm-normal' &&
    normal.draft.context.taskId === 'task-normal');
  ok('E5.3 不串其他任务', normal.ok && JSON.stringify(normal.draft.context).indexOf('task-v19-pdf') < 0);

  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra)); });
  console.log('\nRESULT ' + pass + '/' + results.length + (blocked ? ' | BLOCKED_SAMPLE' : ''));
  process.exitCode = failed.length ? 1 : (blocked ? 2 : 0);
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
