/* 诊断：追踪一次完整请求，观察搜索结果是否进入答案
 * 用法：node tools/diag.js
 */
'use strict';
var fs = require('fs');
var path = require('path');

global.window = global;
global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

var ROOT = path.resolve(__dirname, '..');
['data/catalog.js', 'data/knowledge.js', 'data/bodies.js', 'data/places.js',
 'core/astro.js', 'core/agents.js', 'core/sources.js'].forEach(function (f) {
  require(path.join(ROOT, f));
});

var AC = global.AgentCore, S = global.Sources;

var city = AC.findCity('北京') || AC.CITIES[0];
var ctx = {
  y: 2026, mo: 10, d: 23, h: 21, mi: 0,
  tz: AC.tzOf(city, 2026, 10, 23),
  lat: city.lat, lon: city.lon, city: city.n, bortle: city.bortle,
  cityRef: city, equipment: '单反', experience: '进阶'
};

var QS = [
  '什么是黑洞？',
  '为什么超新星爆发能产生那么大的能量？',
  'M87 黑洞的质量是多少？'
];

function line() { console.log(Array(70).join('-')); }

function runOne(q) {
  return new Promise(function (resolve) {
    line();
    console.log('问题：' + q);
    var ans = AC.buildAnswer(q, ctx, AC.defaultConfig());
    console.log('intent = ' + ans.intent);
    console.log('sections = ' + ans.sections.map(function (s) { return s.kind; }).join(' → '));

    /* 答案正文（不含检索章节） */
    var body = ans.sections.filter(function (s) { return s.kind === 'verdict' || s.kind === 'evidence'; })
      .map(function (s) { return (s.head || '') + ' ' + (s.sub || '') + ' ' + (s.para || ''); }).join(' ');

    /* 实际送进检索的关键词 */
    var sq = (ans.meta && ans.meta.target) ? ans.meta.target : q;
    console.log('→ 送给 Sources.search 的关键词：' + JSON.stringify(sq));

    /* 本地事实（送模型的也只有这些） */
    var facts = [];
    ans.sections.forEach(function (s) {
      if (s.kind === 'evidence') (s.items || []).forEach(function (it) { facts.push(it.label + '=' + it.value); });
    });
    console.log('→ 本地事实条数：' + facts.length + (facts.length ? '：' + facts.slice(0, 3).join(' | ') : ''));

    return S.search(sq).then(function (r) {
      console.log('→ 检索来源：' + r.provider + ' · ' + r.items.length + ' 条 · ' + r.ms + 'ms');
      r.items.forEach(function (it, i) {
        console.log('   [' + (i + 1) + '] ' + it.title.slice(0, 46));
        console.log('       host=' + it.host + ' url=' + String(it.url || '(空)').slice(0, 60));
        console.log('       snippet(' + String(it.snippet || '').length + '字)=' + String(it.snippet || '').slice(0, 70));
      });

      /* 关键检验：答案正文里是否出现了检索内容 */
      var overlap = 0;
      r.items.forEach(function (it) {
        var t = String(it.title || '').slice(0, 12);
        if (t && body.indexOf(t) >= 0) overlap++;
      });
      console.log('→ 答案正文是否引用检索标题：' + (overlap ? '是（' + overlap + ' 条）' : '否 — 检索结果未进入答案'));
      resolve();
    }).catch(function (e) {
      console.log('→ 检索失败：' + String(e.message).slice(0, 120));
      resolve();
    });
  });
}

var i = 0;
function next() {
  if (i >= QS.length) { line(); console.log('诊断结束'); return; }
  runOne(QS[i++]).then(next);
}
next();
