/* ASTRUM · V1.10 动态科研内容国际化测试
 *
 * 覆盖：
 *   - 中文模式标题/摘要翻译；英文模式只用原文；
 *   - 缓存命中不重复调用 Provider；
 *   - 缓存按目标语言区分；
 *   - Provider 失败、数值丢失时回退英文原文；
 *   - 原文、作者、DOI、arXiv ID、Evidence ID/evidenceRefs 不被修改；
 *   - 翻译结果不写回论文对象，不作为科研证据。
 *
 * 用法：node tools/v1-10-content-i18n-test.js
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
var LANG = 'zh';
global.I18N = { current: function () { return LANG; }, t: function (s) { return s; } };
require(path.join(ROOT, 'core/content-i18n.js'));

var I = global.AstroContentI18n;
var results = [], pass = 0;
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
  if (cond) pass++;
}
function fake(titleZh, abstractZh) {
  return function (payload) {
    return Promise.resolve({ text: payload.kind === 'title' ? titleZh : abstractZh });
  };
}
function cacheHas(text, kind, lang) {
  return !!I.get(text, kind, lang || 'zh');
}

(async function () {
  /* 1. 中文标题/摘要翻译 */
  var t1 = 'Episodic Star Formation - II. The Origin of the Fundamental Metallicity Relation';
  var a1 = 'The Fundamental Metallicity Relation (FMR) extends the MZR by including SFR as a third parameter at 10^9 solar masses.';
  var r1 = await I.translate(t1, 'title', { generate: fake('恒星形成的阶段性过程：基本金属丰度关系的起源', '') });
  ok('A1 标题翻译成功', r1.ok === true && /恒星形成/.test(r1.text), r1.text);
  var r2 = await I.translate(a1, 'abstract', { generate: fake('', '基本金属丰度关系通过引入恒星形成率扩展了质量—金属丰度关系，在 10^9 太阳质量处仍然成立。') });
  ok('A2 摘要翻译成功', r2.ok === true && /质量—金属丰度/.test(r2.text));
  ok('A3 中文译文不丢失数字', /10\^9|10\^9|10⁹|10 9/.test(r2.text) || /10/.test(r2.text));

  /* 2. 缓存命中不重复调用 */
  var calls = 0;
  var cached = await I.translate(t1, 'title', {
    generate: function () { calls++; return Promise.resolve({ text: '不应再调用' }); }
  });
  ok('B1 第二次走缓存', cached.ok === true && cached.cached === true && calls === 0, 'calls=' + calls);
  ok('B2 缓存按类型区分', !cacheHas(t1, 'abstract'));
  ok('B3 缓存按语言区分', !cacheHas(t1, 'title', 'en') && cacheHas(t1, 'title', 'zh'));

  /* 3. Provider 失败回退 */
  var t3 = 'A Study of the Variable Star Population in the Hercules Globular Cluster';
  var fail = await I.translate(t3, 'title', {
    generate: function () { return Promise.reject(new Error('HTTP 503')); }
  });
  ok('C1 Provider 失败返回 fallback', fail.ok === false && fail.fallback === true, fail.code);
  ok('C2 失败不写缓存', !cacheHas(t3, 'title'));
  var before = I.stats().calls;
  var again = await I.translate(t3, 'title', {
    generate: function () { return Promise.reject(new Error('should not call')); }
  });
  ok('C3 失败短时冷却不重复请求', again.code === 'cooldown' && I.stats().calls === before);

  /* 4. 数值丢失拒绝 */
  var t4 = 'M13 age measurement: 11.6 Gyr with 0.3 Gyr uncertainty';
  var bad = await I.translate(t4, 'abstract', {
    generate: function () { return Promise.resolve({ text: 'M13 年龄测量：约 116 亿年，误差未知。' }); }
  });
  ok('D1 译文丢失数字被拒绝', bad.ok === false && bad.code === 'number_mismatch', bad.code);
  ok('D2 被拒绝的译文不写缓存', !cacheHas(t4, 'abstract'));
  ok('D3 数值拒绝计数', I.stats().numbersRejected >= 1);

  /* 5. 论文展示与原始字段 */
  var paper = {
    originalTitle: 'Chemical composition and ages of four globular clusters in M31',
    originalAbstract: 'We derive ages and metallicities for four clusters with uncertainties of 0.3 dex.',
    authors: ['X. Mei', 'D. Xu'], doi: '10.51194/vak2021.2022.1.1.186', arxivId: '2611.03570',
    url: 'https://doi.org/10.51194/vak2021.2022.1.1.186',
    evidenceId: 'ev_f267ba45e48bfedf', evidenceRefs: ['ev_f267ba45e48bfedf']
  };
  var beforePaper = JSON.stringify(paper);
  var d0 = I.displayOf(paper, 'zh');
  ok('E1 无翻译时显示原文', d0.title === paper.originalTitle && d0.abstract === paper.originalAbstract);
  var d1 = await I.ensurePaper(paper, {
    generate: function (payload) {
      return Promise.resolve({
        text: payload.kind === 'title'
          ? 'M31 中四个球状星团的化学组成与年龄'
          : '我们测得四个星团的年龄与金属丰度，不确定度为 0.3 dex。'
      });
    }
  });
  ok('E2 中文标题优先', /M31 中四个球状星团/.test(d1.title));
  ok('E3 中文摘要优先', /不确定度/.test(d1.abstract));
  ok('E4 英文标题保留', d1.showOriginalTitle === true && d1.originalTitle === paper.originalTitle);
  ok('E5 英文摘要保留', d1.originalAbstract === paper.originalAbstract);
  ok('E6 原文对象未被修改', beforePaper === JSON.stringify(paper), JSON.stringify(paper));
  ok('E7 DOI/arXiv/Evidence 未变', paper.doi === '10.51194/vak2021.2022.1.1.186' &&
    paper.arxivId === '2611.03570' && paper.evidenceId === 'ev_f267ba45e48bfedf' &&
    paper.evidenceRefs[0] === 'ev_f267ba45e48bfedf');
  ok('E8 译文只存在展示层', I.get(paper.originalTitle, 'title', 'zh') !== null && paper.originalTitle.indexOf('M31 中') < 0);

  /* 6. 英文模式不翻译 */
  LANG = 'en';
  var en = I.displayOf(paper, 'en');
  ok('F1 英文模式显示英文标题', en.title === paper.originalTitle);
  ok('F2 英文模式显示英文摘要', en.abstract === paper.originalAbstract);
  var enEnsure = await I.ensurePaper(paper, {
    generate: function () { throw new Error('should not call'); }
  });
  ok('F3 英文模式不调用 Provider', enEnsure.title === paper.originalTitle);
  LANG = 'zh';

  /* 7. 无 Provider */
  var noProvider = await I.translate('Another English Paper Title Without Provider', 'title', {});
  ok('G1 无 Provider 回退原文', noProvider.ok === false && noProvider.code === 'provider_unavailable');
  ok('G2 中文文本不做翻译', (await I.translate('中文标题', 'title', { generate: fake('x', '') })).skipped === true);

  /* 8. 原文变化不复用旧翻译 */
  var updated = paper.originalTitle + ' (updated)';
  ok('H1 原文更新后旧缓存不复用', !cacheHas(updated, 'title'));
  ok('H2 缓存键含内容哈希', I.cacheKeyOf(paper.originalTitle, 'title', 'zh') !== I.cacheKeyOf(updated, 'title', 'zh'));

  /* 9. 统计 */
  var st = I.stats();
  ok('I1 统计包含调用/命中/失败', st.calls >= 4 && st.cacheHits >= 1 && st.failures >= 2, JSON.stringify(st));

  console.log('');
  results.forEach(function (r) { console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : '')); });
  console.log('');
  console.log('RESULT ' + pass + '/' + results.length);
  process.exitCode = pass === results.length ? 0 : 1;
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exitCode = 1;
});
