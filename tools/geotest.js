/* ASTRUM · 全球地点检索回归测试（Node 直接运行，零依赖）
 *
 * 为什么要单独一套：headless Chrome 跑多请求联网测试时容易因
 * 虚拟时间预算耗尽而挂起，而 Node 22 自带 fetch / AbortController，
 * 可以直接加载 core/geosearch.js 跑真实请求，结果稳定可复现。
 *
 * 用法：node tools/geotest.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

global.window = global;
require(path.resolve(__dirname, '..', 'core', 'geosearch.js'));

var GeoSearch = global.GeoSearch;

/* 期望：查询词 → { 国家码, 时区 } */
var CASES = [
  /* 中国 */
  { q: '济南',       cc: 'CN', tz: 'Asia/Shanghai' },
  { q: '北京',       cc: 'CN', tz: 'Asia/Shanghai' },
  { q: '库尔勒',     cc: 'CN', tz: 'Asia/Urumqi' },
  { q: '黄山',       cc: 'CN', tz: 'Asia/Shanghai' },
  { q: '喀什',       cc: 'CN', tz: 'Asia/Urumqi' },   /* 新疆用东六区 */
  /* 欧洲 */
  { q: 'Reykjavik',  cc: 'IS', tz: 'Atlantic/Reykjavik' },
  { q: 'Interlaken', cc: 'CH', tz: 'Europe/Zurich' },
  { q: 'Zürich',     cc: 'CH', tz: 'Europe/Zurich' },
  { q: 'Krakow',     cc: 'PL', tz: 'Europe/Warsaw' },
  { q: 'Tromsø',     cc: 'NO', tz: 'Europe/Oslo' },
  /* 非洲 / 南美 / 大洋洲 */
  { q: 'Cape Town',  cc: 'ZA', tz: 'Africa/Johannesburg' },
  { q: 'Atacama',    cc: 'BO', tz: null },
  { q: 'Alice Springs', cc: 'AU', tz: 'Australia/Darwin' },
  /* 北美 / 天文观测点 */
  { q: 'Mauna Kea',  cc: 'US', tz: 'Pacific/Honolulu' },
  { q: 'Kitt Peak',  cc: 'US', tz: 'America/Phoenix' },
  { q: 'La Palma',   cc: 'ES', tz: 'Atlantic/Canary' }
];

/* 允许「多国同名」的选择：只需命中期望集合之一 */
var ALT = {
  'La Palma': [
    { cc: 'ES', tz: 'Atlantic/Canary' },
    { cc: 'PA', tz: 'America/Panama' }
  ]
};

function check(c) {
  return GeoSearch.search(c.q, 30).then(function (list) {
    if (!list.length) return { ok: false, msg: '无结果' };
    var t = list[0];
    var alts = ALT[c.q] || [c];
    var hit = alts.some(function (a) {
      return (!a.cc || t.cc === a.cc) && (!a.tz || t.tzid === a.tz);
    });
    return {
      ok: hit,
      msg: t.n + ' | ' + t.kind + ' | cc=' + (t.cc || '-') + ' | tz=' + (t.tzid || 'null') +
        ' | ' + t.lat.toFixed(3) + ',' + t.lon.toFixed(3) + ' | 共' + list.length + '条' +
        (hit ? '' : '  [期望 ' + alts.map(function (a) { return (a.cc || '-') + '/' + (a.tz || '-'); }).join(' 或 ') + ']')
    };
  }).catch(function (e) {
    return { ok: false, msg: 'ERR ' + e.message };
  });
}

function main() {
  var pass = 0, total = CASES.length;
  var chain = Promise.resolve();
  CASES.forEach(function (c) {
    chain = chain.then(function () {
      return check(c).then(function (r) {
        if (r.ok) pass++;
        console.log((r.ok ? 'PASS' : 'FAIL') + ' | ' + c.q.padEnd(12) + ' -> ' + r.msg);
      });
    });
  });
  chain.then(function () {
    console.log('RESULT ' + pass + '/' + total);
    process.exit(pass === total ? 0 : 1);
  });
}

main();
