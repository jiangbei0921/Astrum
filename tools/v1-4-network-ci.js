/* ASTRUM · V1.4 真实网络套件运行器（CI 用）
 *
 * 目的：把真实网络测试与离线确定性测试分开，并且明确区分：
 *   PASS               测试通过
 *   NETWORK_UNAVAILABLE 外部主机不可达/限流/超时，不是代码失败
 *   FAIL               可达网络下仍有断言失败，是代码失败
 *
 * 判断方式：先探测每个套件依赖的外部主机；若主机不可达，则该套件失败记为
 * NETWORK_UNAVAILABLE，并以 0 退出，避免把外部故障误报成代码回归。
 *
 * 用法：node tools/v1-4-network-ci.js
 */
'use strict';

var path = require('path');
var fs = require('fs');
var https = require('https');
var cp = require('child_process');

var ROOT = path.resolve(__dirname, '..');
var PROBE_TIMEOUT = 12000;

var HOSTS = {
  arxiv: 'https://arxiv.org/abs/astro-ph/9901001',
  export: 'https://export.arxiv.org/api/query?search_query=all:orion&max_results=1',
  openalex: 'https://api.openalex.org/works?search=orion&per-page=1',
  semantic: 'https://api.semanticscholar.org/graph/v1/paper/search?query=orion&limit=1',
  simbad: 'https://simbad.harvard.edu/simbad/sim-tap/sync?request=doQuery&lang=adql&format=json&query=SELECT%20TOP%201%20main_id%20FROM%20basic',
  raw: 'https://raw.githubusercontent.com/astropy/astropy/main/astropy/io/fits/tests/data/test0.fits',
  wikipedia: 'https://zh.wikipedia.org/w/api.php?action=query&format=json&titles=%E7%8C%9F%E6%88%B8%E5%BA%A7'
};

var SUITES = [
 { id: 'simbad', file: 'tools/v1-2-simbad-test.js', hosts: ['simbad'], timeout: 120000 },
 { id: 'v1d', file: 'tools/v1d-test.js', hosts: ['openalex', 'semantic', 'raw', 'simbad'], timeout: 180000 },
 { id: 'v1-e2e', file: 'tools/v1-e2e-test.js', hosts: ['openalex', 'semantic', 'raw', 'simbad'], timeout: 180000 },
 { id: 'v1-1-e2e', file: 'tools/v1-1-e2e-test.js', hosts: ['openalex', 'semantic', 'raw', 'simbad'], timeout: 180000 },
 { id: 'paper-fulltext', file: 'tools/v1-3-paper-fulltext-test.js', hosts: ['arxiv', 'export'], timeout: 180000 },
 { id: 'paper-e2e', file: 'tools/v1-3-paper-e2e-test.js', hosts: ['arxiv', 'openalex', 'semantic'], timeout: 180000 },
 { id: 'research-online', file: 'tools/research-test.js', args: ['--online'], hosts: ['wikipedia', 'openalex', 'semantic'], timeout: 240000 }
];

function probe(url) {
  return new Promise(function (resolve) {
    var req = https.get(url, {
      headers: { 'User-Agent': 'Astrum-CI/1.4', 'Accept': '*/*' },
      timeout: PROBE_TIMEOUT
    }, function (res) {
      res.resume();
      res.on('end', function () { resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, status: res.statusCode }); });
      res.on('error', function (e) { resolve({ ok: false, status: 0, error: e.code || e.message }); });
    });
    req.on('timeout', function () { req.destroy(); resolve({ ok: false, status: 0, error: 'timeout' }); });
    req.on('error', function (e) { resolve({ ok: false, status: 0, error: e.code || e.message }); });
  });
}

function runSuite(s, hosts) {
  var args = [s.file].concat(s.args || []);
  var t0 = Date.now();
  var r = cp.spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8', timeout: s.timeout, maxBuffer: 32 * 1024 * 1024 });
  var out = ((r.stdout || '') + (r.stderr || '')).trim();
  var ms = Date.now() - t0;
  var status, reason = '';
  if (r.status === 0) {
    status = 'PASS';
  } else {
    var down = s.hosts.filter(function (h) { return !hosts[h].ok; });
    /* 只有该套件依赖的主机“全部”不可达才判网络不可用；
       部分主机异常时仍按 FAIL，避免把真实断言失败藏进网络故障。 */
    if (down.length === s.hosts.length) {
      status = 'NETWORK_UNAVAILABLE';
      reason = '全部依赖主机不可达: ' + down.join(',');
    } else {
      status = 'FAIL';
      reason = (r.error && r.error.message) || ('exit ' + r.status) +
        (down.length ? '（部分主机不可达: ' + down.join(',') + '）' : '');
    }
  }
  return { suite: s, status: status, reason: reason, ms: ms, output: out };
}

(async function main() {
  var hostNames = Object.keys(HOSTS);
  var probes = {};
  var resultsHosts = await Promise.all(hostNames.map(function (h) { return probe(HOSTS[h]); }));
  hostNames.forEach(function (h, i) { probes[h] = resultsHosts[i]; });

  console.log('=== 外部主机探测（REAL）===');
  hostNames.forEach(function (h) {
    console.log((probes[h].ok ? 'REACHABLE' : 'UNAVAILABLE') + ' | ' + h +
      ' | status=' + probes[h].status + (probes[h].error ? ' | ' + probes[h].error : ''));
  });
  console.log('');

  var rows = [];
  SUITES.forEach(function (s) {
    console.log('=== ' + s.id + ' | ' + s.file + (s.args ? ' ' + s.args.join(' ') : '') + ' ===');
    var r = runSuite(s, probes);
    console.log(r.output || '(无输出)');
    console.log('');
    console.log('[NETWORK-CI] ' + r.suite.id + ' => ' + r.status + (r.reason ? ' (' + r.reason + ')' : '') + ' | ' + r.ms + ' ms');
    console.log('');
    rows.push(r);
  });

  console.log('=== 汇总 ===');
  var fails = 0, unavailable = 0;
  rows.forEach(function (r) {
    if (r.status === 'FAIL') fails++;
    if (r.status === 'NETWORK_UNAVAILABLE') unavailable++;
    console.log(r.status + ' | ' + r.suite.id + ' | ' + r.ms + ' ms' + (r.reason ? ' | ' + r.reason : ''));
  });
  console.log('SUITES ' + rows.length + ' / PASS ' + (rows.length - fails - unavailable) +
    ' / NETWORK_UNAVAILABLE ' + unavailable + ' / FAIL ' + fails);

  if (process.env.GITHUB_STEP_SUMMARY) {
    var md = ['## V1.4 真实网络套件', '', '| 套件 | 结果 | 耗时 | 说明 |', '|---|---|---|---|'];
    rows.forEach(function (r) {
      md.push('| ' + r.suite.id + ' | ' + r.status + ' | ' + (r.ms / 1000).toFixed(1) + 's | ' + (r.reason || '') + ' |');
    });
    md.push('', '外部主机：' + hostNames.map(function (h) { return h + '=' + (probes[h].ok ? 'REACHABLE' : 'UNAVAILABLE'); }).join('，'));
    md.push('', '> NETWORK_UNAVAILABLE 表示外部数据源不可达/限流，不代表代码失败；未使用 Mock 冒充。');
    try { fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md.join('\n') + '\n'); } catch (e) {}
  }

  process.exit(fails ? 1 : 0);
})().catch(function (e) {
  console.error('[network-ci] 未捕获异常: ' + (e && e.stack || e));
  process.exit(1);
});
