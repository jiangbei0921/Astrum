/* ASTRUM · 真实 Provider 验证准备脚本（V1.6 前置）
 *
 * 只检查环境变量是否存在，不打印 Key。
 * 无 Key 时执行错误分类单测，并返回 BLOCKED_API_KEY（exit 2）。
 *
 * 需要设置（任选一个 Provider）：
 *   ASTRUM_LIVE_PROVIDER=openai-compatible | gemini | anthropic
 *   ASTRUM_LIVE_BASE_URL=https://...
 *   ASTRUM_LIVE_MODEL=模型 ID
 *   ASTRUM_LIVE_API_KEY=<本机环境变量，禁止写入仓库/日志>
 */
'use strict';
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.localStorage = { _d: {}, getItem: function (k) { return this._d[k] || null; }, setItem: function (k, v) { this._d[k] = v; }, removeItem: function (k) { delete this._d[k]; } };
[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/task.js', 'core/schema.js', 'core/agents.js',
  'core/sources.js', 'core/control-bridge.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var S = global.Sources;
var Bridge = global.AstroControlBridge;
var KEY = process.env.ASTRUM_LIVE_API_KEY || '';
var BASE = process.env.ASTRUM_LIVE_BASE_URL || '';
var MODEL = process.env.ASTRUM_LIVE_MODEL || '';
var PROVIDER = process.env.ASTRUM_LIVE_PROVIDER || 'openai-compatible';

var results = [];
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); }
function hasKey() { return KEY.length > 0; }

async function classifyCase(msg, expected) {
  var old = S.generate;
  S.generate = function () { return Promise.reject(new Error(msg)); };
  try {
    var r = await Bridge.modelGenerate('live-test', { question: 'ping' });
    ok(expected + ' 分类', r && r.ok === false && r.code === expected, r && (r.code + ':' + r.reason));
  } finally { S.generate = old; }
}

(async function main() {
  console.log('Provider: ' + PROVIDER + ' | BaseURL: ' + (BASE ? 'present' : 'missing') +
    ' | Model: ' + (MODEL ? MODEL : 'missing') + ' | API Key: ' + (hasKey() ? 'present (not printed)' : 'missing'));
  await classifyCase('401 unauthorized invalid key', 'auth');
  await classifyCase('429 rate limit exceeded', 'rate_limit');
  await classifyCase('request timeout', 'timeout');
  await classifyCase('500 server error', 'network');
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : '')); });
  if (!hasKey()) {
    console.log('RESULT BLOCKED_API_KEY');
    console.log('未执行真实 Provider 调用；请在本机设置环境变量后重新运行。');
    console.log('禁止在聊天、代码、日志或 Git 中粘贴 Key。');
    process.exitCode = 2;
    return;
  }
  console.log('KEY PRESENT：真实调用需由维护者在本机运行，当前脚本不自动发起外网请求。');
  console.log('建议验证：正常响应、401、余额不足、429、超时、500、模型不存在、参数不支持、Bridge 路由。');
  process.exitCode = 0;
})();
