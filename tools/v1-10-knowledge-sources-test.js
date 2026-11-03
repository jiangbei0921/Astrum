/* ASTRUM · V1.10 知识来源分类与检索路由测试
 *
 * 覆盖：
 *   - 四类来源（用户资料 / 系统内置 / 外部科研 / 模型知识）
 *   - 基础概念、目标参数、最新进展、多论文比较、用户资料的路由
 *   - 本地未命中不再写成“没有依据”
 *   - 外部工具真实状态（未调用 / 成功 / 部分失败 / 全部失败）
 *   - 不把未执行工具写成已执行
 *   - 来源章节与 meta.sourcePlan
 *
 * 用法：node tools/v1-10-knowledge-sources-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');
require(path.join(ROOT, 'core/knowledge-sources.js'));

var K = global.AstroKnowledgeSources;
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}
function decide(q, opts) {
  return K.decide(Object.assign({ query: q }, opts || {}));
}
function steps(list) {
  return list.map(function (x) {
    return { tool: x[0], status: x[1], error: x[2] || '' };
  });
}

/* 1. 路由决策 */
(function () {
  var d1 = decide('什么是光年？');
  ok('A1 基础概念不强制外部检索', d1.externalRequired === false, d1.externalRequired);
  ok('A2 基础概念允许模型解释', d1.modelAllowed === true);
  var d2 = decide('JWST 最近发现了什么早期宇宙星系？');
  ok('A3 最新进展必须外部检索', d2.externalRequired === true);
  var d3 = decide('不同论文对 M13 年龄的测量是否一致？', { targets: [{ item: { kind: 'kb' } }] });
  ok('A4 多论文比较必须外部检索', d3.externalRequired === true);
  ok('A5 有内置条目仍允许本地基础事实', d3.systemAllowed === true);
  var d4 = decide('NGC 7000 的距离是多少？', { targets: [{ item: { kind: 'dso' } }] });
  ok('A6 无内置条目的定量参数转外部', d4.externalRequired === true && d4.targetParam === true);
  var d5 = decide('M31 的质量是多少？', { targets: [{ item: { kind: 'kb' } }] });
  ok('A7 有内置条目的参数不强制外部', d5.targetParam === false, d5.targetParam);
  var d6 = decide('分析我上传的论文', { attachments: [{ name: 'a.pdf' }] });
  ok('A8 用户资料优先', d6.user === true && d6.userFirst === true);
  var d7 = decide('M13 是什么？');
  ok('A9 无附件时不声称用户资料', d7.user === false);
})();

/* 2. 外部状态 */
(function () {
  var s1 = K.externalStatus(steps([['paper.search', 'ok'], ['evidence.search', 'ok'], ['compose.domain', 'ok']]));
  ok('B1 成功状态', s1.status === 'ok' && s1.attempted === true, s1.status);
  ok('B2 只统计外部工具', s1.tools.indexOf('paper.search') >= 0 && s1.tools.indexOf('compose.domain') < 0, s1.tools.join(','));
  var s2 = K.externalStatus(steps([['paper.search', 'ok'], ['simbad.tap', 'failed', 'timeout']]));
  ok('B3 部分失败', s2.status === 'partial' && s2.failed === 1, s2.status);
  var s3 = K.externalStatus(steps([['paper.search', 'failed', 'HTTP 500'], ['simbad.tap', 'failed', 'timeout']]));
  ok('B4 全部失败', s3.status === 'failed' && s3.ok === 0, s3.status);
  var s4 = K.externalStatus([]);
  ok('B5 未调用不冒充已执行', s4.status === 'skipped' && s4.attempted === false);
  ok('B6 失败原因保留', s3.failures.length === 2 && /timeout/.test(s3.failures.join(' ')));
})();

/* 3. 文案 */
(function () {
  ok('C1 系统未命中文案不再说没有依据',
    /系统内置知识中暂未找到/.test(K.message('system', 'miss')) &&
    !/没有可靠依据/.test(K.message('system', 'miss')));
  ok('C2 外部不可用文案', /部分科研数据源暂时不可用/.test(K.message('external', 'failed')));
  ok('C3 外部未调用文案', /未调用外部科研来源/.test(K.message('external', 'skipped')));
  ok('C4 模型解释不当证据', /不构成新的科研证据/.test(K.message('model', 'ok')));
  var u = K.message('user', 'none');
  ok('C5 不虚构用户知识库', /没有用户上传资料/.test(u) && !/用户知识库没有依据/.test(u));
})();

/* 4. 来源章节 */
(function () {
  var a = {
    query: 'M13 的年龄和金属丰度测量在不同论文中是否一致？',
    intent: 'knowledge-target',
    targets: [{ item: { kind: 'kb' } }],
    sections: [
      { kind: 'verdict', head: 'M13 是球状星团。' },
      { kind: 'evidence', title: '研究证据 · 真实来源', items: [{ label: '论文', value: 'DOI 10.1093/mnras/stz642' }] },
      { kind: 'followup', items: ['继续问'] }
    ],
    meta: {}
  };
  K.attach(a, {
    attachments: [],
    external: K.externalStatus(steps([['paper.search', 'ok'], ['simbad.tap', 'failed', 'timeout']])),
    model: { code: 'ok', ok: true }
  });
  var sec = a.sections.filter(function (s) { return s.kind === 'sources'; })[0];
  ok('D1 生成来源章节', !!sec && sec.items.length === 4, sec && sec.items.length);
  ok('D2 四类来源齐全', sec.items.map(function (r) { return r.key; }).join(',') === 'user,system,external,model');
  ok('D3 用户资料为无', sec.items[0].status === 'none');
  ok('D4 外部为部分失败', sec.items[2].status === 'partial', sec.items[2].status);
  ok('D5 模型为已使用', sec.items[3].status === 'ok');
  ok('D6 来源章节在追问之前', a.sections.indexOf(sec) < a.sections.findIndex(function (s) { return s.kind === 'followup'; }));
  ok('D7 meta.sourcePlan 记录四类', a.meta.sourcePlan.classes.join(',') === 'user,system,external,model');
  ok('D8 未调用工具不写成已执行', !/未调用/.test(sec.items[2].detail) || sec.items[2].status === 'partial');
  K.attach(a, { attachments: [], external: K.externalStatus([]), model: { code: 'not-used', ok: false } });
  ok('D9 重复 attach 不叠加', a.sections.filter(function (s) { return s.kind === 'sources'; }).length === 1);
})();

/* 5. 用户资料状态 */
(function () {
  var a = { query: '分析我上传的论文', sections: [], meta: {} };
  K.attach(a, { attachments: [{ name: 'paper.pdf' }], external: K.externalStatus([]) });
  var sec = a.sections.filter(function (s) { return s.kind === 'sources'; })[0];
  ok('E1 有附件时用户资料为已读取', sec.items[0].status === 'used');
  ok('E2 用户资料文案不冒充外部检索', /用户上传/.test(sec.items[0].detail));
})();

/* 6. 外部未调用时不伪造来源名 */
(function () {
  var a = { query: '什么是红移？', sections: [], meta: {} };
  K.attach(a, { attachments: [], external: K.externalStatus([]) });
  var sec = a.sections.filter(function (s) { return s.kind === 'sources'; })[0];
  ok('F1 未调用外部时为 skipped', sec.items[2].status === 'skipped');
  ok('F2 不列出 arXiv/OpenAlex 等未调用来源', !/arXiv|OpenAlex|SIMBAD/.test(sec.items[2].detail), sec.items[2].detail);
})();

console.log('');
results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : '')); });
console.log('');
console.log('RESULT ' + pass + '/' + results.length);
process.exitCode = pass === results.length ? 0 : 1;
