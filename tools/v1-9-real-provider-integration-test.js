/* ASTRUM · V1.9 真实 DeepSeek Provider + 科研任务 + 多轮验证
 *
 * 读取本机临时 Key 文件（ASTRUM_LIVE_KEY_FILE）或 ASTRUM_LIVE_API_KEY，
 * 不打印 Key；真实请求 DeepSeek 官方端点。
 *
 * 验证：
 *   1. 简单中文模型调用、耗时、usage（prompt/completion/total）
 *   2. ASTRUM 真实论文研究任务（Router → Planner → paper.search → Evidence → Report）
 *   3. 模型表述与检索证据结合
 *   4. 同 Thread 多轮上下文（memory）与第二次追问
 *   5. evidenceRefs / 论文来源 / gaps / limitations
 *
 * 用法：
 *   $env:ASTRUM_LIVE_KEY_FILE='C:\...\provider-key.txt'
 *   $env:ASTRUM_LIVE_MODEL='deepseek-chat'
 *   node tools/v1-9-real-provider-integration-test.js
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var KEY = process.env.ASTRUM_LIVE_API_KEY || '';
(function () {
  var file = process.env.ASTRUM_LIVE_KEY_FILE || '';
  if (!KEY && file && fs.existsSync(file)) {
    try {
      var lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).map(function (x) { return x.trim(); })
        .filter(function (x) { return x && x.charAt(0) !== '#'; });
      KEY = (lines[0] || '').replace(/^['"]|['"]$/g, '');
    } catch (e) { KEY = ''; }
  }
})();
var MODEL = process.env.ASTRUM_LIVE_MODEL || 'deepseek-chat';
var BASE = process.env.ASTRUM_LIVE_BASE_URL || 'https://api.deepseek.com/v1/chat/completions';

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
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore, R = global.AstroRequest, Registry = global.AstroRegistry, Adapter = global.AstroComposeAdapter;
var S = global.Sources, Bridge = global.AstroControlBridge;
var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var CFG = AC.defaultConfig();

var results = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) }); if (cond) pass++; }
function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
function factsOf(ans) {
  var facts = [], para = '', head = '';
  (ans.sections || []).forEach(function (s) {
    if (s.kind === 'evidence') {
      (s.items || []).forEach(function (it) { if (facts.length < 6) facts.push({ label: it.label, value: it.value }); });
      if (!para && s.para) para = s.para;
    }
    if (!head && s.kind === 'verdict') head = s.head;
  });
  return { facts: facts, para: para || head, head: head };
}
function evidenceOf(ans) {
  var out = [];
  (ans.sections || []).forEach(function (s) {
    if (s.kind === 'web' && s.items) {
      s.items.forEach(function (it) {
        out.push({
          id: it.id, title: it.title, host: it.host, date: it.date || '',
          excerpt: String(it.excerpt || it.snippet || '').slice(0, 320), url: it.url || ''
        });
      });
    }
  });
  return out.slice(0, 8);
}
function researchSummary(r) {
  if (!r) return null;
  return {
    paperCount: (r.papers || []).length,
    evidenceCount: (r.evidence || []).length,
    conclusionCount: (r.conclusions || []).length,
    claimCount: (r.claims || []).length,
    gaps: (r.gaps || []).slice(0, 4),
    limitations: (r.limitations || []).slice(0, 4),
    papers: (r.papers || []).slice(0, 4).map(function (p) {
      return { title: p.title, date: p.date, doi: p.doi, url: p.url, abstractOnly: p.abstractOnly };
    }),
    conclusions: (r.conclusions || []).slice(0, 3).map(function (c) {
      return { text: clip(c.text, 180), evidenceRefs: c.evidenceRefs || [], scope: c.evidenceScope };
    })
  };
}
function badRefsOf(r) {
  var ids = {};
  (r.evidence || []).forEach(function (e) { ids[e.evidenceId] = 1; });
  var bad = [];
  (r.conclusions || []).forEach(function (c) {
    (c.evidenceRefs || []).forEach(function (id) { if (!ids[id] && bad.indexOf(id) < 0) bad.push(id); });
  });
  return bad;
}
function numsIn(text) {
  return (String(text || '').match(/[0-9]+(?:\.[0-9]+)?/g) || []);
}

(async function main() {
  console.log('Provider: DeepSeek | Base: ' + BASE + ' | Model: ' + MODEL + ' | Key: ' + (KEY ? 'present (not printed)' : 'missing'));
  if (!KEY) {
    console.log('RESULT BLOCKED_API_KEY');
    process.exitCode = 2;
    return;
  }
  S.setConfig('deepseek', { key: KEY, endpoint: BASE, model: MODEL, temperature: 0.3, maxTokens: 500 });

  var report = {
    generatedAt: new Date().toISOString(),
    provider: 'DeepSeek',
    baseUrl: BASE,
    model: MODEL,
    calls: 0, success: 0, failed: 0, latencies: [], usage: { prompt: 0, completion: 0, total: 0 },
    simple: null, research: null, modelExpression: null, multiTurn: null, errors: []
  };
  function addUsage(u) {
    if (!u) return;
    if (typeof u.prompt === 'number') report.usage.prompt += u.prompt;
    if (typeof u.completion === 'number') report.usage.completion += u.completion;
    if (typeof u.total === 'number') report.usage.total += u.total;
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function isProviderBusy(r) {
    return !!(r && !r.ok && (r.code === 'server' || r.code === 'rate_limit') &&
      /too busy|busy|503|限流|rate limit/i.test(r.reason || ''));
  }
  async function model(name, payload) {
    var r = null, attempts = 0, busyAttempts = 0;
    for (var attempt = 0; attempt < 3; attempt++) {
      attempts += 1;
      report.calls += 1;
      r = await Bridge.modelGenerate('deepseek', payload);
      if (r.ok) break;
      if (isProviderBusy(r)) { busyAttempts += 1; if (attempt < 2) { await sleep(2500 * (attempt + 1)); continue; } }
      break;
    }
    if (r && r.ok) {
      report.success += 1;
      if (r.latency) report.latencies.push(r.latency);
      addUsage(r.usage);
      ok('M ' + name, true, 'ok ' + r.latency + 'ms attempts=' + attempts);
    } else {
      report.failed += 1;
      report.errors.push(name + ':' + (r && r.code) + ':' + (r && r.reason));
      if (isProviderBusy(r)) {
        report.blockedProvider = (report.blockedProvider || 0) + 1;
        console.log('BLOCKED_PROVIDER | ' + name + ' | ' + (r && r.code) + ' | busyAttempts=' + busyAttempts);
      }
      ok('M ' + name, false, (r && r.code) + ':' + (r && r.reason));
    }
    return r;
  }

  /* 1 简单中文 */
  var simple = await model('简单中文', {
    question: '请用一句话解释 M42 是什么', facts: [{ label: '目标', value: '猎户座大星云' }],
    para: '', tone: 'warm', context: '北京 2026-11-03 21:00'
  });
  if (simple.ok) {
    report.simple = {
      text: clip(simple.text, 220), latency: simple.latency, tokens: simple.tokens,
      usage: simple.usage, hasOrion: /猎户|M42|星云/.test(simple.text || '')
    };
    ok('S1 简单回答包含目标', report.simple.hasOrion, report.simple.text);
    ok('S2 返回 usage', simple.usage && typeof simple.usage.total === 'number', JSON.stringify(simple.usage));
  }

  /* 2 真实科研任务 */
  var adapter = Adapter.create({ agentCore: AC });
  var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: true });
  var q1 = 'M13 的年龄和金属丰度测量在不同论文中是否一致？';
  var r1;
  try {
    r1 = await R.handle(q1, CTX, CFG, { adapter: adapter, registry: registry, network: true });
  } catch (e) {
    report.errors.push('research:' + String(e && e.message || e).slice(0, 160));
    ok('R1 科研任务执行', false, String(e && e.message || e));
  }
  if (r1) {
    var res1 = r1.research;
    var bad1 = res1 ? badRefsOf(res1) : ['no-research'];
    report.research = {
      mode: r1.mode, template: r1.control && r1.control.plan && r1.control.plan.template,
      intent: r1.intent, agents: (r1.answer && r1.answer.meta && r1.answer.meta.agents) || [],
      tools: ((r1.control && r1.control.state && r1.control.state.steps) || []).map(function (s) { return s.tool + ':' + s.status; }),
      summary: researchSummary(res1), badRefs: bad1,
      question: q1, answerHead: clip(factsOf(r1.answer).head, 220)
    };
    ok('R1 Muse 路由', r1.mode === 'control' && r1.control && r1.control.plan && /T-E|T-F/.test(r1.control.plan.template),
      r1.mode + '/' + (r1.control && r1.control.plan && r1.control.plan.template));
    ok('R2 真实论文检索', !!res1 && (res1.papers || []).length >= 1, res1 && (res1.papers || []).length);
    ok('R3 evidenceRefs 可追溯', bad1.length === 0, bad1.join(','));
    ok('R4 论文有真实链接', !!res1 && (res1.papers || []).every(function (p) { return !!p.title && /^https?:\/\//i.test(p.url || ''); }),
      res1 && (res1.papers || []).map(function (p) { return p.url; }).join(','));
    ok('R5 保留不确定性', !!res1 && ((res1.gaps || []).length > 0 || (res1.limitations || []).length > 0),
      res1 && ((res1.gaps || []).length + '/' + (res1.limitations || []).length));
    var facts1 = factsOf(r1.answer);
    var ev1 = evidenceOf(r1.answer);
    var model1 = await model('科研表述', {
      question: q1, facts: facts1.facts, para: facts1.para, evidence: ev1, tone: 'academic',
      context: '北京 2026-11-03 21:00', memory: []
    });
    if (model1.ok) {
      report.modelExpression = {
        text: clip(model1.text, 260), latency: model1.latency, tokens: model1.tokens, usage: model1.usage,
        factCount: facts1.facts.length, evidenceCount: ev1.length,
        hasKnownNumber: (function () {
          var pool = facts1.facts.map(function (f) { return f.value; }).join(' ') + ' ' + facts1.para + ' ' + ev1.map(function (e) { return e.excerpt; }).join(' ');
          return numsIn(model1.text).some(function (n) { return pool.indexOf(n) >= 0; });
        })()
      };
      ok('R6 模型结合证据', model1.text.length > 10 && report.modelExpression.hasKnownNumber, report.modelExpression.text);
    }
  }

  /* 3 多轮上下文 */
  if (r1 && r1.answer) {
    var facts1b = factsOf(r1.answer);
    AC.setMemory([{ q: q1, a: facts1b.head || r1.answer.query, target: 'M13', at: Date.now() }]);
    var q2 = '上一条回答中那个星团的年龄数据来自哪篇论文？测量不确定性是多少？';
    var r2;
    try {
      r2 = await R.handle(q2, CTX, CFG, { adapter: adapter, registry: registry, network: true });
    } catch (e) {
      report.errors.push('multi-turn:' + String(e && e.message || e).slice(0, 160));
      ok('T1 多轮任务执行', false, String(e && e.message || e));
    }
    if (r2) {
      var res2 = r2.research;
      var metaMem = r2.answer && r2.answer.meta && r2.answer.meta.memory;
      var bad2 = res2 ? badRefsOf(res2) : ['no-research'];
      report.multiTurn = {
        mode: r2.mode, intent: r2.intent, template: r2.control && r2.control.plan && r2.control.plan.template,
        resolved: metaMem && metaMem.resolved || '',
        memoryUsed: !!(metaMem && metaMem.resolved),
        summary: researchSummary(res2), badRefs: bad2,
        answerHead: clip(factsOf(r2.answer).head, 220)
      };
      ok('T1 同一 Thread 上下文承接', !!(metaMem && metaMem.resolved), JSON.stringify(metaMem || {}));
      ok('T2 第二次仍执行真实检索', !!res2 && (res2.papers || []).length >= 1, res2 && (res2.papers || []).length);
      ok('T3 第二次 evidenceRefs 可追溯', bad2.length === 0, bad2.join(','));
      var facts2 = factsOf(r2.answer);
      var ev2 = evidenceOf(r2.answer);
      var model2 = await model('多轮表述', {
        question: q2, facts: facts2.facts, para: facts2.para, evidence: ev2, tone: 'academic',
        context: '北京 2026-11-03 21:00',
        memory: [{ q: q1, a: facts1b.head || '', target: 'M13' }]
      });
      if (model2.ok) {
        report.multiTurn.modelText = clip(model2.text, 260);
        ok('T4 多轮模型回答提及 M13/论文/不确定性',
          /M13|论文|不确定性|误差|±/.test(model2.text || ''), report.multiTurn.modelText);
      }
    }
    AC.clearMemory();
  }

  var failed = results.filter(function (r) { return !r.pass; });
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra)); });
  console.log('\nRESULT ' + pass + '/' + results.length);
  console.log('REAL ' + (failed.length ? (report.success ? 'PARTIAL' : 'FAIL') : 'PASS') + ' | calls=' + report.calls +
    ' success=' + report.success + ' failed=' + report.failed + ' blockedProvider=' + (report.blockedProvider || 0) +
    ' avg=' + (report.latencies.length ? Math.round(report.latencies.reduce(function (a, b) { return a + b; }, 0) / report.latencies.length) : 'N/A') +
    'ms usage=' + JSON.stringify(report.usage));
  fs.writeFileSync(path.join(ROOT, 'tools', 'fixtures', 'v1-9-real-provider-integration-results.json'),
    JSON.stringify(report, null, 2) + '\n', 'utf8');
  /* Provider busy 是外部条件，不等于代码 FAIL；但至少要有一次真实成功。 */
  process.exitCode = (!report.success || failed.length > (report.blockedProvider || 0)) ? 1 : 0;
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
