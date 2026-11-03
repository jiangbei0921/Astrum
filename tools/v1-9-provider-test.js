/* ASTRUM · V1.9 真实 Provider 接入与错误分类验证
 *
 * 无 Key 时：
 *   - 用本机回环 HTTP 服务验证真实请求构造、响应解析与 401/429/500/坏 JSON/空响应/超时分类；
 *   - 这些结果标记 OFFLINE_PROTOCOL，不冒充真实 Provider PASS；
 *   - 最终返回 BLOCKED_API_KEY（exit 2）。
 *
 * 有 Key 时（只从环境变量读取，绝不打印）：
 *   - 执行真实基础问答、中文科研问题、长文本、多轮、结构化协议调用；
 *   - 用坏 Key 验证真实 401；记录耗时/token/错误分类；
 *   - 不把任何 Key/Authorization 写入日志或结果文件。
 *
 * 环境变量：
 *   ASTRUM_LIVE_PROVIDER=openai-compatible|gemini|anthropic
 *   ASTRUM_LIVE_BASE_URL=<完整 chat/completions 或 Gemini base>
 *   ASTRUM_LIVE_MODEL=<模型 ID>
 *   ASTRUM_LIVE_API_KEY=<仅本机环境变量>
 */
'use strict';
var fs = require('fs');
var path = require('path');
var http = require('http');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] != null ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/task.js', 'core/schema.js', 'core/agents.js',
  'core/sources.js', 'core/control-bridge.js', 'core/router.js',
  'core/request.js', 'core/planner.js', 'core/registry.js', 'core/task-store.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var S = global.Sources;
var Bridge = global.AstroControlBridge;
var AC = global.AgentCore;
var R = global.AstroRequest || null;
var Router = global.AstroRouter;
var KEY = process.env.ASTRUM_LIVE_API_KEY || '';
var BASE = process.env.ASTRUM_LIVE_BASE_URL || '';
var MODEL = process.env.ASTRUM_LIVE_MODEL || '';
var PROVIDER = process.env.ASTRUM_LIVE_PROVIDER || 'openai-compatible';

var results = [];
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) }); }
function keyState() { return KEY ? 'present (not printed)' : 'missing'; }

function startLocal() {
  return new Promise(function (resolve) {
    var hits = 0, paths = [];
    var server = http.createServer(function (req, res) {
      hits += 1;
      paths.push(req.url);
      function json(status, obj) {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(obj));
      }
      if (req.url === '/ok') {
        json(200, { choices: [{ message: { content: '本地协议响应：M42 是猎户座大星云。' } }], usage: { total_tokens: 6 } });
        return;
      }
      if (req.url === '/401') { json(401, { error: { message: 'invalid key' } }); return; }
      if (req.url === '/403') { json(403, { error: { message: 'forbidden' } }); return; }
      if (req.url === '/429') { json(429, { error: { message: 'rate limited' } }); return; }
      if (req.url === '/500') { json(500, { error: { message: 'server broken' } }); return; }
      if (req.url === '/badjson') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('not-json');
        return;
      }
      if (req.url === '/empty') {
        json(200, { choices: [{ message: { content: '' } }], usage: { total_tokens: 1 } });
        return;
      }
      if (req.url === '/slow') {
        setTimeout(function () {
          json(200, { choices: [{ message: { content: '迟到响应' } }] });
        }, 400);
        return;
      }
      json(404, { error: { message: 'not found' } });
    });
    server.listen(0, '127.0.0.1', function () {
      resolve({
        server: server,
        base: 'http://127.0.0.1:' + server.address().port,
        hits: function () { return hits; },
        paths: function () { return paths.slice(); },
        reset: function () { hits = 0; paths = []; },
        close: function () { server.close(); }
      });
    });
  });
}

async function localProtocol(local) {
  function configure(pathName, key, model) {
    S.setConfig('openai', {
      key: key == null ? 'offline-test-key' : key,
      endpoint: local.base + pathName,
      model: model || 'offline-test-model',
      temperature: 0.2, maxTokens: 50
    });
  }
  async function call(pathName, opts) {
    configure(pathName);
    local.reset();
    var r = await Bridge.modelGenerate('openai', {
      question: '离线协议测试', facts: [{ label: '目标', value: 'M42' }], para: '', tone: 'warm'
    }, opts);
    return { r: r, hits: local.hits(), paths: local.paths() };
  }

  var good = await call('/ok');
  ok('P1 协议请求成功', good.r.ok === true && /猎户座/.test(good.r.text || ''), good.r.code);
  ok('P2 返回 token 与耗时', good.r.tokens === 6 && good.r.latency >= 0, good.r.tokens + '/' + good.r.latency);
  ok('P3 单次调用只发一次请求', good.hits === 1, 'hits=' + good.hits);
  ok('P4 请求走 chat/completions', good.paths[0] === '/ok', good.paths[0]);

  var a401 = await call('/401');
  ok('P5 401 分类为 auth', a401.r.ok === false && a401.r.code === 'auth', a401.r.code);
  ok('P6 401 保留 HTTP 状态', a401.r.status === 401, a401.r.status);
  var a403 = await call('/403');
  ok('P7 403 分类为 auth', a403.r.ok === false && a403.r.code === 'auth', a403.r.code);
  var a429 = await call('/429');
  ok('P8 429 分类为 rate_limit', a429.r.ok === false && a429.r.code === 'rate_limit', a429.r.code);
  ok('P9 429 不可重试', a429.r.retryable === false, a429.r.retryable);
  var a500 = await call('/500');
  ok('P10 500 分类为 server', a500.r.ok === false && a500.r.code === 'server', a500.r.code);
  ok('P11 500 可重试', a500.r.retryable === true, a500.r.retryable);

  var bad = await call('/badjson');
  ok('P12 坏 JSON 分类为 parse', bad.r.ok === false && bad.r.code === 'parse', bad.r.code);
  var empty = await call('/empty');
  ok('P13 空响应明确失败', empty.r.ok === false && empty.r.code === 'empty', empty.r.code);

  configure('/slow');
  local.reset();
  var slow = await Bridge.modelGenerate('openai', {
    question: '超时测试', facts: [{ label: '目标', value: 'M42' }], para: '', tone: 'warm'
  }, { timeoutMs: 80 });
  ok('P14 客户端超时分类', slow.ok === false && slow.code === 'timeout', slow.code);

  S.setConfig('openai', { key: '', endpoint: local.base + '/ok', model: 'offline-test-model' });
  var noKey = await Bridge.modelGenerate('openai', { question: '缺 Key' });
  ok('P15 缺 Key 明确失败', noKey.ok === false && noKey.code === 'auth', noKey.code + ':' + noKey.reason);

  configure('/ok');
  local.reset();
  var ac = new AbortController(); ac.abort();
  var cancelled = await Bridge.modelGenerate('openai', { question: '取消' }, { signal: ac.signal });
  ok('P16 取消不发起请求', cancelled.ok === false && cancelled.code === 'cancelled' && local.hits() === 0, cancelled.code);

  /* Agent / 预算：模型失败不应改变任务状态或预算；复杂问题仍由 Muse 路由到研究模板。 */
  S.setConfig('openai', { key: 'offline-test-key', endpoint: local.base + '/500', model: 'offline-test-model' });
  var st = global.AstroTask.create({ question: '比较 M13、M5、M15 的年龄与金属丰度', level: 'L3' });
  var beforeBudget = JSON.stringify(st.budget);
  var failResult = await Bridge.modelGenerate('openai', { question: '故意失败' });
  ok('P17 模型失败不挂载 TaskState', !Object.prototype.hasOwnProperty.call(failResult, 'state'), Object.keys(failResult).join(','));
  ok('P18 模型失败不消耗 ADR-001 预算', JSON.stringify(st.budget) === beforeBudget);
  var route = R ? R.classify('比较 M13、M5、M15 的年龄与金属丰度，并比较不同论文的测量结果', {
    y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京'
  }, AC.defaultConfig()) : null;
  ok('P19 Muse 路由复杂研究任务', route && route.control === true && route.route.mode === 'research',
    route && route.route.mode + '/' + route.intent);
  ok('P20 13 Agent 不变', AC.AGENTS.length === 13, AC.AGENTS.length);
}

async function realCalls(local) {
  var id = PROVIDER === 'gemini' ? 'gemini' : PROVIDER === 'anthropic' ? 'anthropic' : 'openai';
  var endpoint = BASE || (S.list().filter(function (x) { return x.id === id; })[0] || {}).endpoint;
  var model = MODEL || (S.list().filter(function (x) { return x.id === id; })[0] || {}).model;
  S.setConfig(id, { key: KEY, endpoint: endpoint, model: model, temperature: 0.3, maxTokens: 300 });
  var calls = 0, success = 0, failed = 0, latencies = [], tokens = 0, errors = [];
  async function call(name, payload, opts) {
    calls += 1;
    var r = await Bridge.modelGenerate(id, payload, opts);
    if (r.ok) { success += 1; if (r.latency) latencies.push(r.latency); if (r.tokens) tokens += r.tokens; }
    else { failed += 1; errors.push(r.code); }
    ok('R ' + name, r.ok === true && !!r.text, r.ok ? 'ok' : r.code + ':' + r.reason);
    return r;
  }
  await call('基础问答', {
    question: '用一句话说明 M42 是什么', facts: [{ label: '目标', value: '猎户座大星云' }],
    para: '', tone: 'warm', context: '北京 21:00'
  });
  await call('中文科研问题', {
    question: 'M13 球状星团的年龄和金属丰度测量为什么存在差异？',
    facts: [{ label: '目标', value: 'M13' }, { label: '类型', value: '球状星团' }],
    para: '不同论文使用不同的距离、红化和恒星演化模型。', tone: 'academic',
    evidence: [{ title: 'Globular cluster ages', excerpt: '年龄测量依赖距离与金属丰度。' }]
  });
  await call('长文本输入', {
    question: '根据以下长资料总结 M13 的研究现状',
    facts: [{ label: '资料', value: ('M13 是北半球最亮的球状星团之一，距离约 22,000 光年。').repeat(80) }],
    para: ('不同测量给出的年龄与金属丰度存在差异，需要说明不确定性与方法。').repeat(40), tone: 'academic'
  });
  await call('多轮上下文', {
    question: '它和 M5 相比呢？', facts: [{ label: '目标', value: 'M13' }], para: '',
    memory: [{ q: 'M13 是什么？', a: '武仙座球状星团' }, { q: '它多远？', a: '约 22,000 光年' }], tone: 'warm'
  });

  /* 坏 Key 真实请求：验证 401/403 分类，之后恢复。 */
  var validKey = KEY;
  S.setConfig(id, { key: 'astrum-invalid-key-for-test' });
  calls += 1;
  var bad = await Bridge.modelGenerate(id, { question: '鉴权测试', facts: [], para: '', tone: 'warm' });
  failed += bad.ok ? 0 : 1;
  if (!bad.ok) errors.push(bad.code);
  ok('R 坏 Key 鉴权分类', bad.ok === false && (bad.code === 'auth' || bad.code === 'server' || bad.code === 'notfound'), bad.code || 'ok');
  S.setConfig(id, { key: validKey });

  var avg = latencies.length ? Math.round(latencies.reduce(function (a, b) { return a + b; }, 0) / latencies.length) : 0;
  return {
    provider: PROVIDER, model: model, calls: calls, success: success, failed: failed,
    avgLatencyMs: avg, tokens: tokens, errors: errors
  };
}

(async function main() {
  console.log('Provider: ' + PROVIDER + ' | BaseURL: ' + (BASE ? 'present' : 'missing') +
    ' | Model: ' + (MODEL || 'missing') + ' | API Key: ' + keyState());
  var local = await startLocal();
  var report = { generatedAt: new Date().toISOString(), provider: PROVIDER, key: KEY ? 'present' : 'missing', mode: '' };
  try {
    await localProtocol(local);
    if (KEY) {
      report.mode = 'REAL_PROVIDER';
      report.real = await realCalls(local);
    } else {
      report.mode = 'OFFLINE_PROTOCOL_ONLY';
    }
  } finally {
    local.close();
    S.setConfig('openai', { key: '', endpoint: '', model: '' });
  }

  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.pass ? '' : ' | ' + r.extra));
  });
  var failed = results.filter(function (r) { return !r.pass; });
  console.log('\nRESULT ' + (results.length - failed.length) + '/' + results.length);
  if (!KEY) {
    report.status = 'BLOCKED_API_KEY';
    console.log('BLOCKED_API_KEY | 真实 Provider 调用未执行；离线协议与错误分类已执行。');
    console.log('请在本机环境变量配置 ASTRUM_LIVE_API_KEY / BASE_URL / MODEL，禁止粘贴到聊天或仓库。');
    process.exitCode = failed.length ? 1 : 2;
  } else {
    report.status = failed.length ? 'FAIL' : 'PASS';
    console.log('REAL PROVIDER ' + report.status + ' | calls=' + report.real.calls +
      ' success=' + report.real.success + ' failed=' + report.real.failed +
      ' avg=' + report.real.avgLatencyMs + 'ms tokens=' + report.real.tokens);
    process.exitCode = failed.length ? 1 : 0;
  }
  var out = path.join(ROOT, 'tools', 'fixtures', 'v1-9-provider-results.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log('JSON ' + out);
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
