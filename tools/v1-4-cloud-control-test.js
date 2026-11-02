/* ASTRUM · V1.5 云端模型 Control 接入与附件边界测试
 *
 * 不真实调用任何模型 API；用受控 stub 验证：
 *   - 模型调用统一经过 AstroControlBridge.modelGenerate；
 *   - 成功/限流/超时/鉴权/取消分类；
 *   - 论文 PDF 附件可接管，未解析附件仍不接管。
 *
 * 用法：node tools/v1-4-cloud-control-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

global.AstroRequest = {
  classify: function () { return { control: true, route: { mode: 'research' } }; }
};
require(path.join(ROOT, 'core/control-bridge.js'));
var Bridge = global.AstroControlBridge;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
async function runCase(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.stack || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}

(async function main() {
  await runCase('C1', '模型调用成功与统一返回', async function () {
    global.Sources = { generate: async function (id, payload) {
      if (payload.question === 'fail-429') throw new Error('触发限流 429');
      if (payload.question === 'fail-timeout') throw new Error('连接超时');
      if (payload.question === 'fail-auth') throw new Error('密钥无效 401');
      return { text: '模型表述', latency: 12, tokens: 34 };
    } };
    var r = await Bridge.modelGenerate('cloud-x', { question: 'ok' });
    ok('C1.1 成功返回标准化', r.ok === true && r.text === '模型表述' && r.modelId === 'cloud-x', r.code);
    ok('C1.2 保留耗时/Token', r.latency === 12 && r.tokens === 34);
    var rl = await Bridge.modelGenerate('cloud-x', { question: 'fail-429' });
    ok('C1.3 限流分类', rl.ok === false && rl.code === 'rate_limit', rl.code);
    var to = await Bridge.modelGenerate('cloud-x', { question: 'fail-timeout' });
    ok('C1.4 超时分类', to.ok === false && to.code === 'timeout', to.code);
    var au = await Bridge.modelGenerate('cloud-x', { question: 'fail-auth' });
    ok('C1.5 鉴权分类', au.ok === false && au.code === 'auth', au.code);
  });

  await runCase('C2', '取消与缺失模块', async function () {
    var ac = new AbortController(); ac.abort();
    var c = await Bridge.modelGenerate('cloud-x', { question: 'ok' }, { signal: ac.signal });
    ok('C2.1 取消不调用模型', c.ok === false && c.code === 'cancelled', c.code);
    global.Sources = null;
    var m = await Bridge.modelGenerate('cloud-x', { question: 'ok' });
    ok('C2.2 缺少 Sources 明确失败', m.ok === false && m.code === 'sources_missing', m.code);
  });

  await runCase('C3', '论文 PDF 附件边界', async function () {
    var info = { control: true, route: { mode: 'research' } };
    var paper = { kind: 'paper', paper: { ok: true, evidence: [{}] } };
    ok('C3.1 已解析 PDF 接管', Bridge.canControl(info, { sourceType: 'local', attachments: [paper] }) === true);
    ok('C3.2 未解析 PDF 不接管', Bridge.canControl(info, { sourceType: 'local', attachments: [{ kind: 'paper', paper: { ok: false } }] }) === false);
    ok('C3.3 旧 other 附件仍不接管', Bridge.canControl(info, { sourceType: 'local', attachments: [{ kind: 'other', name: 'paper.pdf' }] }) === false);
    ok('C3.4 FITS + PDF 混合接管', Bridge.canControl(info, { sourceType: 'local', attachments: [
      { kind: 'fits', fits: { hdus: [{}] } }, paper
    ] }) === true);
    ok('C3.5 L1 永不接管', Bridge.canControl({ control: false }, { sourceType: 'local', attachments: [paper] }) === false);
  });

  for (var i = 0; i < results.length; i++) {
    console.log((results[i].pass ? 'PASS' : 'FAIL') + ' | ' + results[i].name + (results[i].extra ? ' | ' + results[i].extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    console.log('CASE ' + cases[j].id + ' ' + (cases[j].failed === 0 ? 'PASS' : 'FAIL') + ' | ' +
      cases[j].title + ' | 断言 ' + cases[j].assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})().catch(function (e) {
  console.error('[v1-4-cloud-control] ' + (e && e.stack || e));
  process.exit(1);
});
