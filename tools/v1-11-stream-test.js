/* ASTRUM · V1.11 流式 Provider 与 Bridge 测试（离线）
 *
 * 覆盖：
 *   - OpenAI / Anthropic / Gemini 三种真实 SSE 格式与分片边界
 *   - usage、[DONE]、非 SSE JSON 回退、stream_options 兼容重试
 *   - 401 / 429 / 500 / 空流 / 坏 SSE / 超时 / 用户中止（保留 partial）
 *   - Bridge 降级（本机模型/不支持流式的来源只回调一次完整文本）
 *   - 缺 Key 不发请求、请求次数上限
 *
 * 全部通过本地 mock 响应验证，标记 OFFLINE_PROTOCOL；
 * 真实 Provider 调用在无 Key 时由 v1-9-provider-test 标 BLOCKED_API_KEY。
 *
 * 用法：node tools/v1-11-stream-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

var store = {};
global.localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
  setItem: function (k, v) { store[k] = String(v); },
  removeItem: function (k) { delete store[k]; }
};

require(path.join(ROOT, 'core/sources.js'));
require(path.join(ROOT, 'core/control-bridge.js'));

var S = global.Sources;
var Bridge = global.AstroControlBridge;
var results = [];
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

var CALLS = [];
function setFetch(fn) {
  CALLS = [];
  global.fetch = function (url, opts) {
    var body = null;
    try { body = opts && opts.body ? JSON.parse(opts.body) : null; } catch (e) { body = null; }
    CALLS.push({ url: url, opts: opts, body: body });
    return fn(url, opts);
  };
}
function headers(h) {
  var lower = {};
  Object.keys(h || {}).forEach(function (k) { lower[k.toLowerCase()] = h[k]; });
  return { get: function (k) { return lower[String(k).toLowerCase()] || null; } };
}
function sseResponse(chunks, h) {
  var enc = new TextEncoder();
  var stream = new ReadableStream({
    start: function (controller) {
      chunks.forEach(function (c) { controller.enqueue(enc.encode(c)); });
      controller.close();
    }
  });
  return {
    ok: true, status: 200, headers: headers(h || { 'content-type': 'text/event-stream' }),
    body: stream,
    text: function () { return Promise.resolve(chunks.join('')); }
  };
}
function slowResponse(chunks, signal, gap) {
  var enc = new TextEncoder();
  var stream = new ReadableStream({
    start: function (controller) {
      var i = 0, closed = false;
      function next() {
        if (closed) return;
        if (signal && signal.aborted) {
          closed = true;
          try { controller.error(new DOMException('Aborted', 'AbortError')); } catch (e) { /* 忽略 */ }
          return;
        }
        if (i >= chunks.length) { closed = true; controller.close(); return; }
        controller.enqueue(enc.encode(chunks[i++]));
        setTimeout(next, gap || 20);
      }
      next();
    }
  });
  return {
    ok: true, status: 200, headers: headers({ 'content-type': 'text/event-stream' }),
    body: stream,
    text: function () { return Promise.resolve(chunks.join('')); }
  };
}
function jsonResponse(obj, h) {
  return {
    ok: true, status: 200, headers: headers(h || { 'content-type': 'application/json' }),
    json: function () { return Promise.resolve(obj); },
    text: function () { return Promise.resolve(JSON.stringify(obj)); }
  };
}
function errResponse(status, body, extraHeaders) {
  return {
    ok: false, status: status, headers: headers(extraHeaders || { 'content-type': 'application/json' }),
    text: function () { return Promise.resolve(body || JSON.stringify({ error: { message: 'HTTP ' + status } })); },
    json: function () { return Promise.resolve({ error: { message: 'HTTP ' + status } }); }
  };
}
function neverResponse() {
  return {
    ok: true, status: 200, headers: headers({ 'content-type': 'text/event-stream' }),
    body: new ReadableStream({ start: function () { /* 永不生产 */ } }),
    text: function () { return Promise.resolve(''); }
  };
}

function configure(id, patch) {
  S.setConfig(id, Object.assign({
    key: 'offline-key', endpoint: S.list().filter(function (x) { return x.id === id; })[0].endpoint,
    model: 'offline-model', temperature: 0.2, maxTokens: 40
  }, patch || {}));
}

var BASE_PAYLOAD = {
  question: 'M42 是什么？', facts: [{ label: '目标', value: 'M42' }], para: '', tone: 'warm'
};

(async function () {
  /* A. 能力判断 */
  ok('A1 OpenAI 支持流式', S.streamCapable('openai') === true);
  ok('A2 Anthropic 支持流式', S.streamCapable('anthropic') === true);
  ok('A3 Gemini 支持流式', S.streamCapable('gemini') === true);
  ok('A4 本机模型不伪造流式', S.streamCapable('chrome-ai') === false);
  ok('A5 本地来源不走网络流', S.streamCapable('local') === false);

  /* B. OpenAI SSE：分片跨 read 边界 + usage + [DONE] */
  configure('openai', { endpoint: 'https://offline.local/chat/completions' });
  var toks = [];
  var chunks = [
    'data: {"choices":[{"delta":{"con',
    'tent":"M"}}]}\n\ndata: {"choices":[{"delta":{"content":"4',
    '2"}}]}\n\ndata: {"choices":[{"delta":{"content":" 是猎户座"}}],"usage":{"prompt_tokens":5,"completion_tokens":4,"total_tokens":9}}\n\n',
    'data: [DONE]\n\n'
  ];
  setFetch(function () { return Promise.resolve(sseResponse(chunks)); });
  var r1 = await S.streamChat('openai', BASE_PAYLOAD, {
    onToken: function (d) { toks.push(d); }
  });
  ok('B1 分片正确拼接', toks.join('') === 'M42 是猎户座', JSON.stringify(toks));
  ok('B2 文本顺序完整', r1.text.indexOf('M42') === 0 && /猎户座/.test(r1.text), r1.text);
  ok('B3 记录真实 usage', r1.usage && r1.usage.total === 9 && r1.usage.prompt === 5 && r1.usage.completion === 4,
    JSON.stringify(r1.usage));
  ok('B4 首字时间可观测', r1.ttft >= 0 && r1.ttft <= r1.latency + 5, r1.ttft + '/' + r1.latency);
  ok('B5 请求体带 stream 与 stream_options', CALLS[0].body.stream === true &&
    CALLS[0].body.stream_options && CALLS[0].body.stream_options.include_usage === true,
    JSON.stringify(CALLS[0].body.stream_options));
  ok('B6 请求次数为 1', CALLS.length === 1, CALLS.length);

  /* C. stream_options 不被端点接受：去掉后重试一次，且只重试一次 */
  var bodies = [];
  setFetch(function (url, opts) {
    bodies.push(JSON.parse(opts.body));
    if (bodies.length === 1) return Promise.resolve(errResponse(400, 'Unrecognized request argument: stream_options'));
    return Promise.resolve(sseResponse(['data: {"choices":[{"delta":{"content":"OK"}}]}\n\ndata: [DONE]\n\n']));
  });
  var r2 = await S.streamChat('openai', BASE_PAYLOAD, {});
  ok('C1 兼容重试成功', r2.text === 'OK', r2.text);
  ok('C2 第二次请求去掉 stream_options', !bodies[1].stream_options, JSON.stringify(bodies[1]));
  ok('C3 总请求次数不超过 2', CALLS.length === 2, CALLS.length);

  /* D. Anthropic 事件流 */
  configure('anthropic', { endpoint: 'https://offline.local/messages' });
  var aChunks = [
    'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":8}}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"M13 "}}\n\n',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"是球状星团"}}\n\n',
    'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":6}}\n\n'
  ];
  setFetch(function () { return Promise.resolve(sseResponse(aChunks)); });
  var r3 = await S.streamChat('anthropic', BASE_PAYLOAD, {});
  ok('D1 Anthropic 文本拼接', /M13 是球状星团/.test(r3.text), r3.text);
  ok('D2 Anthropic usage 合并', r3.usage && r3.usage.prompt === 8 && r3.usage.completion === 6 && r3.usage.total === 14,
    JSON.stringify(r3.usage));
  ok('D3 Anthropic 请求带 stream', CALLS[0].body.stream === true);

  /* E. Gemini SSE */
  configure('gemini', { endpoint: 'https://offline.local/v1beta' });
  setFetch(function () {
    return Promise.resolve(sseResponse([
      'data: {"candidates":[{"content":{"parts":[{"text":"M31"}]} }],"usageMetadata":{"promptTokenCount":4,"candidatesTokenCount":3,"totalTokenCount":7}}\n\n',
      'data: {"candidates":[{"content":{"parts":[{"text":" 是仙女座星系"}]}}]}\n\n'
    ]));
  });
  var r4 = await S.streamChat('gemini', BASE_PAYLOAD, {});
  ok('E1 Gemini 文本拼接', /M31 是仙女座星系/.test(r4.text), r4.text);
  ok('E2 Gemini usage 记录', r4.usage && r4.usage.total === 7, JSON.stringify(r4.usage));
  ok('E3 Gemini 使用 streamGenerateContent', /streamGenerateContent/.test(CALLS[0].url) &&
    /alt=sse/.test(CALLS[0].url), CALLS[0].url);

  /* F. 服务端忽略 stream，直接返回 JSON：降级为一次性，不伪装逐字 */
  configure('openai', { endpoint: 'https://offline.local/chat/completions' });
  var fToks = [];
  setFetch(function () {
    return Promise.resolve(jsonResponse({
      choices: [{ message: { content: '完整回答' } }],
      usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 }
    }));
  });
  var r5 = await S.streamChat('openai', BASE_PAYLOAD, { onToken: function (d) { fToks.push(d); } });
  ok('F1 JSON 回退文本完整', r5.text === '完整回答', r5.text);
  ok('F2 JSON 回退只回调一次', fToks.length === 1, fToks.length);
  ok('F3 JSON 回退标记 jsonFallback', r5.jsonFallback === true && r5.stream === true, r5.jsonFallback);

  /* G. HTTP 错误分类 */
  configure('openai', { endpoint: 'https://offline.local/401' });
  setFetch(function (url) { return Promise.resolve(errResponse(401, '{"error":{"message":"invalid key"}}')); });
  var g401 = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { g401 = { code: e.code, status: e.status, kind: e.cls && e.cls.kind }; }
  ok('G1 401 分类 auth', g401 && g401.code === 'auth' && g401.status === 401 && g401.kind === 'auth',
    JSON.stringify(g401));

  configure('openai', { endpoint: 'https://offline.local/429' });
  setFetch(function () { return Promise.resolve(errResponse(429, '{"error":{"message":"rate limited"}}', {
    'content-type': 'application/json', 'retry-after': '2'
  })); });
  var g429 = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { g429 = { code: e.code, status: e.status, ra: e.retryAfter }; }
  ok('G2 429 分类 rate_limit 且保留 Retry-After', g429 && g429.code === 'rate_limit' && g429.ra === '2',
    JSON.stringify(g429));
  ok('G3 429 不无限重试', CALLS.length === 1, CALLS.length);

  configure('openai', { endpoint: 'https://offline.local/500' });
  setFetch(function () { return Promise.resolve(errResponse(500)); });
  var g500 = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { g500 = { code: e.code, retryable: e.cls && e.cls.retryable }; }
  ok('G4 500 分类 server 且可重试', g500 && g500.code === 'server' && g500.retryable === true,
    JSON.stringify(g500));

  /* H. 空流 / 坏 SSE */
  configure('openai', { endpoint: 'https://offline.local/chat/completions' });
  setFetch(function () { return Promise.resolve(sseResponse(['data: [DONE]\n\n'])); });
  var hEmpty = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { hEmpty = e.code; }
  ok('H1 空流明确失败', hEmpty === 'empty', hEmpty);

  setFetch(function () { return Promise.resolve(sseResponse(['data: not-json\n\n', 'data: still-not-json\n\n'])); });
  var hBad = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { hBad = e.code; }
  ok('H2 坏 SSE 分类 parse', hBad === 'parse', hBad);

  /* I. 首 token 超时 */
  configure('openai', { endpoint: 'https://offline.local/slow' });
  setFetch(function (url, opts) {
    return new Promise(function (res, rej) {
      if (opts.signal) {
        opts.signal.addEventListener('abort', function () {
          var e = new DOMException('Aborted', 'AbortError');
          rej(e);
        });
      }
    });
  });
  var iCode = null;
  try {
    await S.streamChat('openai', Object.assign({}, BASE_PAYLOAD, { firstTokenMs: 60, timeoutMs: 900 }), {});
  } catch (e) { iCode = e.code; }
  ok('I1 首 token 超时分类 timeout', iCode === 'timeout', iCode);

  /* J. 用户中止：保留已生成部分，不当作完成 */
  configure('openai', { endpoint: 'https://offline.local/stream' });
  var jToks = [];
  var jAc = new AbortController();
  setFetch(function (url, opts) {
    return Promise.resolve(slowResponse([
      'data: {"choices":[{"delta":{"content":"部分内容"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"不会到达"}}]}\n\n'
    ], opts.signal, 40));
  });
  var jP = S.streamChat('openai', Object.assign({}, BASE_PAYLOAD, { signal: jAc.signal }),
    { onToken: function (d) { jToks.push(d); } });
  setTimeout(function () { jAc.abort(); }, 30);
  var jR = await jP;
  ok('J1 中止保留 partial', jR.aborted === true && /部分内容/.test(jR.text) && jR.completed === false,
    JSON.stringify({ aborted: jR.aborted, text: jR.text, completed: jR.completed }));
  ok('J2 中止后不再追加', jToks.join('') === '部分内容', jToks.join(''));

  /* K. 缺 Key：不发请求 */
  S.setConfig('openai', { key: '', endpoint: 'https://offline.local/chat/completions', model: 'offline-model' });
  var kBefore = CALLS.length;
  var kErr = null;
  try { await S.streamChat('openai', BASE_PAYLOAD, {}); } catch (e) { kErr = e.message; }
  ok('K1 缺 Key 明确失败', /未配置密钥/.test(kErr || ''), kErr);
  ok('K2 缺 Key 不发请求', CALLS.length === kBefore, CALLS.length - kBefore);

  /* L. Bridge：不支持流式的本机模型降级为一次性完整文本 */
  var origGenerate = S.generate;
  S.generate = function () {
    return Promise.resolve({ text: '本机降级文本', latency: 12, tokens: 0, usage: null });
  };
  var lToks = [];
  var lR = await Bridge.modelStream('chrome-ai', BASE_PAYLOAD, { onToken: function (d) { lToks.push(d); } });
  S.generate = origGenerate;
  ok('L1 不支持流式时降级', lR.ok === true && lR.fallback === true && lR.stream === false,
    JSON.stringify({ ok: lR.ok, fallback: lR.fallback, stream: lR.stream }));
  ok('L2 降级只回调一次完整文本', lToks.length === 1 && lToks[0] === '本机降级文本', JSON.stringify(lToks));
  ok('L3 降级标记 ttft', typeof lR.ttft === 'number');

  /* M. Bridge：流式错误码与取消 */
  configure('openai', { endpoint: 'https://offline.local/401' });
  setFetch(function () { return Promise.resolve(errResponse(401)); });
  var mR = await Bridge.modelStream('openai', BASE_PAYLOAD, {});
  ok('M1 Bridge 401 映射 auth', mR.ok === false && mR.code === 'auth' && mR.status === 401,
    JSON.stringify({ code: mR.code, status: mR.status }));

  var mAc = new AbortController();
  mAc.abort();
  var mC = await Bridge.modelStream('openai', BASE_PAYLOAD, {}, { signal: mAc.signal });
  ok('M2 已取消不发请求', mC.ok === false && mC.code === 'cancelled', mC.code);

  /* 汇总 */
  var pass = results.filter(function (r) { return r.pass; }).length;
  console.log('RESULT ' + pass + '/' + results.length);
  results.forEach(function (r) {
    console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
  });
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('UNEXPECTED', e && e.stack || e);
  process.exit(1);
});
