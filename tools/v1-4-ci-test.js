/* ASTRUM · V1.4 CI / Pages workflow 静态验收
 *
 * 不执行远端 workflow（无 GitHub 授权），只验证：
 *   - 所有真实存在的测试都被 test.yml 纳入；
 *   - 静态 / 离线核心 / 离线浏览器三层分工正确；
 *   - 真实网络测试独立在 network.yml；
 *   - Pages 由白名单 `_site` artifact 发布，且只在 test 成功后触发；
 *   - 发布 workflow 没有 Git 写操作、没有 continue-on-error 掩盖失败。
 *
 * 用法：node tools/v1-4-ci-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.resolve(__dirname, '..');
var WF = path.join(ROOT, '.github/workflows');
var TEST = fs.readFileSync(path.join(WF, 'test.yml'), 'utf8');
var NETWORK = fs.readFileSync(path.join(WF, 'network.yml'), 'utf8');
var PAGES = fs.readFileSync(path.join(WF, 'pages.yml'), 'utf8');
var DAILY = fs.readFileSync(path.join(WF, 'daily.yml'), 'utf8');
var IGNORE = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function caseRun(id, title, fn) {
  var before = results.length, bad = results.filter(function (r) { return !r.pass; }).length;
  try { fn(); } catch (e) { ok(id + ' 异常', false, String(e && e.message || e).slice(0, 180)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - bad });
}
function exists(rel) { return fs.existsSync(path.join(ROOT, rel)); }

var STATIC_TESTS = [
  'tools/daily-test.js', 'tools/v1-2-deploy-test.js', 'tools/csptest.js', 'tools/i18n-scan.js',
  'tools/v1-4-ci-test.js', 'tools/v1-4-pages-test.js'
];
var CORE_TESTS = [
  'tools/research-test.js', 'tools/task-test.js', 'tools/p0-03-test.js', 'tools/control-test.js',
  'tools/b8-test.js', 'tools/v1b-test.js', 'tools/v1c-test.js', 'tools/v1d-test.js',
  'tools/v1-e2e-test.js', 'tools/v1-1-routing-test.js', 'tools/v1-1-compat-test.js',
  'tools/v1-1-e2e-test.js', 'tools/v1-2-routing-test.js', 'tools/v1-2-attachment-test.js',
  'tools/v1-2-comparison-test.js', 'tools/v1-2-science-test.js', 'tools/v1-2-simbad-test.js',
  'tools/v1-3-routing-test.js', 'tools/v1-3-comparison-test.js', 'tools/v1-3-paper-fulltext-test.js',
  'tools/v1-3-paper-e2e-test.js', 'tools/v1-3-compatibility-test.js',
  'tools/v1-4-paper-attachment-test.js', 'tools/v1-4-cloud-control-test.js',
  'tools/v1-5-perf-test.js', 'tools/v1-5-concurrency-test.js', 'tools/v1-5-store-stress-test.js',
  'tools/v1-5-research-loop-test.js', 'tools/v1-6-legacy-test.js',
  'tools/v1-6-pdf-fixtures-test.js', 'tools/v1-6-research-quality-test.js',
  'tools/v1-6-provider-test.js'
];
var BROWSER_TESTS = [
  'tools/selftest.js', 'tools/store-test.js', 'tools/skill-test.js', 'tools/consistency-test.js',
  'tools/a11y-test.js', 'tools/rail-test.js', 'tools/settings-test.js', 'tools/ctx-isolation-test.js',
  'tools/v1-1-browser-test.js', 'tools/v1-4-pages-test.js', 'tools/v1-5-idb-stress-test.js',
  'tools/v1-5-resource-test.js', 'tools/v1-5-cache-test.js', 'tools/v1-6-browser-test.js'
];

caseRun('C1', '测试文件真实存在', function () {
  var all = STATIC_TESTS.concat(CORE_TESTS, BROWSER_TESTS).filter(function (f) { return f !== 'tools/v1-4-ci-test.js'; });
  var missing = all.filter(function (f) { return !exists(f); });
  ok('C1.1 所有被 CI 引用的测试存在', missing.length === 0, missing.join(',') || 'all');
  ok('C1.2 无历史名称误用', TEST.indexOf('v1-2-simbad-real-test') < 0 &&
    TEST.indexOf('v1-2-simbad-offline-test') < 0,
    '仅使用真实存在的 v1-2-simbad-test.js --offline');
});

caseRun('C2', 'test.yml 三层覆盖', function () {
  ok('C2.1 三个 job 齐全', /\bstatic:/m.test(TEST) && /\boffline-core:/m.test(TEST) && /\boffline-browser:/m.test(TEST));
  var missingStatic = STATIC_TESTS.filter(function (f) { return TEST.indexOf(f) < 0; });
  var missingCore = CORE_TESTS.filter(function (f) { return TEST.indexOf(f) < 0; });
  var missingBrowser = BROWSER_TESTS.filter(function (f) { return TEST.indexOf(f) < 0; });
  ok('C2.2 静态/构建测试已纳入', missingStatic.length === 0, missingStatic.join(',') || 'all');
  ok('C2.3 离线核心测试已纳入', missingCore.length === 0, missingCore.join(',') || 'all');
  ok('C2.4 浏览器测试已纳入', missingBrowser.length === 0, missingBrowser.join(',') || 'all');
  ok('C2.5 v1-e2e 离线已补齐', TEST.indexOf('node tools/v1-e2e-test.js --offline') >= 0);
  ok('C2.6 Node 版本统一 22', (TEST.match(/node-version: '22'/g) || []).length === 3 &&
    (DAILY.match(/node-version: '22'/g) || []).length === 1);
});

caseRun('C3', '网络测试独立', function () {
  ok('C3.1 network.yml 触发方式', /workflow_dispatch/.test(NETWORK) && /schedule/.test(NETWORK) &&
    !/push:/.test(NETWORK));
  ok('C3.2 使用分类运行器', /node tools\/v1-4-network-ci\.js/.test(NETWORK));
  ok('C3.3 网络测试未混入发布 CI',
    !/run: node tools\/v1-3-paper-fulltext-test\.js\s*$/m.test(TEST) &&
    TEST.indexOf('v1-3-paper-fulltext-test.js --offline') >= 0 &&
    TEST.indexOf('v1-4-network-ci.js') < 0);
  ok('C3.4 无 continue-on-error 掩盖', !/continue-on-error/.test(TEST) && !/continue-on-error/.test(NETWORK));
});

caseRun('C4', 'Pages 发布 workflow', function () {
  ok('C4.1 只在 test 成功后触发', /workflows: \[test\]/.test(PAGES) &&
    /github.event.workflow_run.conclusion == 'success'/.test(PAGES) && /branches: \[main\]/.test(PAGES));
  ok('C4.2 权限正确', /pages: write/.test(PAGES) && /id-token: write/.test(PAGES) && /contents: read/.test(PAGES));
  ok('C4.3 使用白名单发布目录', /node tools\/build-pages\.js/.test(PAGES) &&
    /path: _site/.test(PAGES) && /actions\/upload-pages-artifact@v3/.test(PAGES));
  ok('C4.4 使用官方 deploy-pages', /actions\/deploy-pages@v4/.test(PAGES) &&
    /environment:/.test(PAGES) && /github-pages/.test(PAGES));
  ok('C4.5 无 Git 写操作', !/git (add|commit|push|reset|checkout|clean)/.test(PAGES) &&
    !/git (add|commit|push|reset|checkout|clean)/.test(TEST));
});

caseRun('C5', '发布目录与忽略规则', function () {
  ok('C5.1 _site 已忽略', /_site\/?/.test(IGNORE));
  ok('C5.2 standalone 仍忽略', /astrum-standalone\.html/.test(IGNORE));
  ok('C5.3 Pages 不发布测试/文档', !/path: \./.test(PAGES) && !/docs\/|tools\/|dev\//.test(PAGES.split('upload-pages-artifact')[1] || ''));
  ok('C5.4 构建脚本无 npm 依赖', !/require\('(?!fs|path|child_process|crypto|http|https|os)/.test(
    fs.readFileSync(path.join(ROOT, 'tools/build-pages.js'), 'utf8')
  ));
  ok('C5.5 YAML 无制表符', !/\t/.test(TEST + NETWORK + PAGES + DAILY));
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
console.log('MODE STATIC_CONFIG（未执行远端 workflow）');
process.exit(pass === results.length ? 0 : 1);
