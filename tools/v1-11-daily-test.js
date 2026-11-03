/* ASTRUM · V1.11 每日论文增量更新测试（离线）
 *
 * 覆盖：
 *   - 增量新增、旧数据保留、元数据更新
 *   - arXiv ID / DOI / 标题三种去重
 *   - firstSeen 与 published / fetchedAt 语义分离
 *   - 新闻 URL 去重与多来源合并
 *   - 单源失败保留历史、全失败不写、空数据校验失败
 *   - 无变化不写、原子写、坏文件不覆盖
 *   - render 输出可执行且不截断脚本
 *
 * 用法：node tools/v1-11-daily-test.js
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var S = require('./sync-daily.js');

var results = [];
function ok(name, cond, extra) {
  results.push({ name: name, pass: !!cond, extra: extra == null ? '' : String(extra) });
}

function paper(p) {
  return Object.assign({
    id: '', title: '', authors: ['A'], summary: '摘要', cat: 'astro-ph.GA',
    published: '2026-11-02', url: '', source: 'arXiv'
  }, p || {});
}

var NOW = new Date('2026-11-03T07:40:00Z');
var TODAY = '2026-11-03';

/* ---------------- 增量合并 ---------------- */

var old = {
  updated: '2026-11-02',
  generatedAt: '2026-11-02T07:40:00Z',
  papers: [
    paper({ id: '2610.00001', title: 'An Old Paper About Galaxy Clusters', url: 'https://arxiv.org/abs/2610.00001', published: '2026-10-20', firstSeen: '2026-10-20', fetchedAt: '2026-10-20T07:40:00Z' }),
    paper({ id: '2599.00009', title: 'A Very Old Paper That Should Expire', url: 'https://arxiv.org/abs/2599.00009', published: '2026-03-01', firstSeen: '2026-03-01' }),
    paper({ id: '2610.00003', title: 'A Paper With a DOI', doi: '10.1234/abc.2026.001', url: 'https://arxiv.org/abs/2610.00003', published: '2026-10-28', firstSeen: '2026-10-28' })
  ],
  news: [
    { title: 'Old news', url: 'https://example.org/news/1', source: 'ESA', date: '2026-10-30' }
  ],
  sync: { lastSuccessAt: '2026-11-02T07:40:00Z', newPapers: 3, newNews: 1, totalPapers: 3, totalNews: 1 }
};

var fresh = [
  /* 同一篇（带版本号），标题被修订 */
  paper({ id: '2610.00001v3', title: 'An Old Paper About Galaxy Clusters (Revised)', summary: '修订后的摘要', url: 'https://arxiv.org/abs/2610.00001', published: '2026-10-20' }),
  /* 真正的新论文 */
  paper({ id: '2611.00002', title: 'A Brand New Paper on Exoplanet Atmospheres', url: 'https://arxiv.org/abs/2611.00002', published: '2026-11-02' }),
  /* DOI 重复：第二条只给 DOI 的 URL，仍应并入同一实体 */
  paper({ id: '', doi: '10.1234/abc.2026.001', title: 'A Paper With a DOI (Conference Version)', url: 'https://doi.org/10.1234/abc.2026.001', published: '2026-11-01', source: 'OpenAlex' })
];

var merged = S.mergeDaily(old, {
  papers: fresh,
  news: [
    { title: 'Old news', url: 'https://example.org/news/1/', source: 'ScienceDaily', date: '2026-10-30' },
    { title: 'New news', url: 'https://example.org/news/2', source: 'ESA', date: '2026-11-02' }
  ]
}, NOW);

ok('D1 新论文被追加', merged.newPapers === 1, merged.newPapers);
ok('D2 旧论文不被清空', merged.papers.some(function (p) { return p.id === '2610.00001'; }));
ok('D3 版本号被归一', merged.papers.filter(function (p) { return p.id === '2610.00001'; }).length === 1);
ok('D4 同一篇元数据被更新', merged.papers.filter(function (p) { return p.id === '2610.00001'; })[0].title.indexOf('Revised') > 0);
ok('D5 firstSeen 保留首次抓取日', merged.papers.filter(function (p) { return p.id === '2610.00001'; })[0].firstSeen === '2026-10-20');
ok('D6 published 不被抓取日覆盖', merged.papers.filter(function (p) { return p.id === '2610.00001'; })[0].published === '2026-10-20');
ok('D7 fetchedAt 记录本次抓取', merged.papers.filter(function (p) { return p.id === '2610.00001'; })[0].fetchedAt === '2026-11-03T07:40:00.000Z');
ok('D8 DOI 重复合并为一个实体', merged.papers.filter(function (p) { return p.doi === '10.1234/abc.2026.001'; }).length === 1);
ok('D9 多来源保留来源清单', (merged.papers.filter(function (p) { return p.doi === '10.1234/abc.2026.001'; })[0].sources || []).indexOf('OpenAlex') >= 0,
  JSON.stringify(merged.papers.filter(function (p) { return p.doi === '10.1234/abc.2026.001'; })[0].sources));
ok('D10 90 天前的论文被裁剪', !merged.papers.some(function (p) { return p.id === '2599.00009'; }));
ok('D11 新论文 firstSeen 为今天', merged.papers.filter(function (p) { return p.id === '2611.00002'; })[0].firstSeen === TODAY);
ok('D12 新闻同一 URL 去重', merged.news.filter(function (n) { return /news\/1/.test(n.url); }).length === 1);
ok('D13 新闻多来源合并', (merged.news.filter(function (n) { return /news\/1/.test(n.url); })[0].sources || []).length === 2,
  JSON.stringify(merged.news.filter(function (n) { return /news\/1/.test(n.url); })[0].sources));
ok('D14 新报道计数', merged.newNews === 1, merged.newNews);
ok('D15 结果按发布时间倒序', merged.papers[0].published >= merged.papers[merged.papers.length - 1].published);

/* 标题去重（没有 ID/DOI 时） */
var titleOld = {
  papers: [paper({ id: '', title: 'A Long Enough Shared Paper Title', url: 'https://x/1', published: '2026-10-30' })]
};
var titleFresh = [paper({ id: '', title: 'A Long Enough Shared Paper Title!', url: 'https://x/2', published: '2026-11-01', summary: '新版摘要' })];
var titleMerged = S.mergeDaily(titleOld, { papers: titleFresh, news: [] }, NOW);
ok('D16 无 ID/DOI 时按归一化标题去重', titleMerged.papers.length === 1 && titleMerged.newPapers === 0,
  'n=' + titleMerged.papers.length + '/new=' + titleMerged.newPapers);
ok('D17 标题去重时保留旧 URL 不被空值覆盖', titleMerged.papers[0].url === 'https://x/1' || titleMerged.papers[0].url === 'https://x/2');

/* 数量上限 */
var many = [];
for (var i = 0; i < 10; i++) {
  many.push(paper({ id: '2611.0000' + i, title: 'Paper ' + i, url: 'https://arxiv.org/abs/2611.0000' + i, published: '2026-11-02' }));
}
var capped = S.mergeDaily(null, { papers: many, news: [] }, NOW, { maxPapers: 3 });
ok('D18 历史条数上限生效', capped.papers.length === 3, capped.papers.length);

/* ---------------- 状态 ---------------- */

var stOk = S.buildStatus(old, merged, {
  paperOk: true, newsOk: true, paperSources: ['arXiv(astro-ph.GA)'], newsSources: ['ESA(3)'], failures: []
}, NOW);
ok('S1 成功状态记录最后成功时间', stOk.lastSuccessAt === '2026-11-03T07:40:00.000Z' && stOk.status === 'ok',
  stOk.lastSuccessAt + '/' + stOk.status);
ok('S2 本次新增数写入状态', stOk.newPapers === merged.newPapers && stOk.newNews === merged.newNews);
ok('S3 来源与总数写入状态', stOk.sources.papers[0] === 'arXiv(astro-ph.GA)' && stOk.totalPapers === merged.papers.length);

var stPartial = S.buildStatus(old, merged, {
  paperOk: true, newsOk: false, paperSources: ['arXiv'], newsSources: [],
  failures: [{ source: 'ScienceDaily', msg: 'timeout' }]
}, NOW);
ok('S4 部分失败标记 partial 且保留最后成功时间', stPartial.status === 'partial' && stPartial.partial === true && stPartial.ok === true);
ok('S5 失败信息被记录', stPartial.failures.length === 1 && /timeout/.test(stPartial.failures[0].msg));

var stFail = S.buildStatus(old, merged, { paperOk: false, newsOk: false, failures: [{ source: 'arXiv', msg: '503' }] }, NOW);
ok('S6 全失败保留上一次成功时间', stFail.status === 'failed' && stFail.ok === false &&
  stFail.lastSuccessAt === '2026-11-02T07:40:00Z', stFail.lastSuccessAt);

/* ---------------- 校验 ---------------- */

var goodPayload = S.buildPayload({ items: merged.papers }, { items: merged.news }, NOW, old, stOk);
ok('V1 正常数据通过校验', S.validatePayload(goodPayload).ok === true,
  JSON.stringify(S.validatePayload(goodPayload).errors));

var badMissing = Object.assign({}, goodPayload, {
  papers: [Object.assign({}, merged.papers[0], { title: '' })]
});
ok('V2 缺标题被拒绝', S.validatePayload(badMissing).ok === false);

var badDup = Object.assign({}, goodPayload, {
  papers: [merged.papers[0], Object.assign({}, merged.papers[0])]
});
ok('V3 重复论文被拒绝', S.validatePayload(badDup).ok === false);

var emptyPayload = S.buildPayload({ items: [] }, { items: [] }, NOW, old, stOk);
ok('V4 空数据被拒绝', S.validatePayload(emptyPayload).ok === false && /空数据/.test(S.validatePayload(emptyPayload).errors.join('')));

/* ---------------- 读写与无变化 ---------------- */

var tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astrum-daily-'));
var tmpFile = path.join(tmpDir, 'daily.js');
var code = S.render(goodPayload);
fs.writeFileSync(tmpFile, code, 'utf8');

var read = S.readExisting(tmpFile);
ok('F1 可读回生成文件', read.ok === true && read.data && Array.isArray(read.data.papers), read.error || '');

var corrupt = path.join(tmpDir, 'corrupt.js');
fs.writeFileSync(corrupt, 'this is not valid javascript {{{', 'utf8');
var readBad = S.readExisting(corrupt);
ok('F2 坏文件不被当作空数据', readBad.ok === false && !!readBad.error, readBad.error);

ok('F3 缺失文件视为首次同步', S.readExisting(path.join(tmpDir, 'missing.js')).ok === true &&
  S.readExisting(path.join(tmpDir, 'missing.js')).data === null);

var atomic = path.join(tmpDir, 'atomic.js');
S.writeAtomic(atomic, 'window.X = 1;');
ok('F4 原子写入产生完整文件', fs.readFileSync(atomic, 'utf8') === 'window.X = 1;');

/* 同内容、仅时间戳不同 → 不写 */
var sameAgain = S.buildPayload({ items: merged.papers }, { items: merged.news }, new Date('2026-11-03T09:00:00Z'), old, {
  lastAttemptAt: '2026-11-03T09:00:00.000Z',
  lastSuccessAt: stOk.lastSuccessAt,
  newPapers: stOk.newPapers, updatedPapers: stOk.updatedPapers, newNews: stOk.newNews,
  totalPapers: stOk.totalPapers, totalNews: stOk.totalNews,
  sources: stOk.sources, failures: [], ok: true, partial: false, status: 'ok'
});
ok('F5 同日无新增不产生无意义写入', S.shouldWrite(goodPayload, sameAgain) === false);

var changed = S.mergeDaily(read.data, { papers: [paper({ id: '2611.00099', title: 'Another New Paper', url: 'https://arxiv.org/abs/2611.00099', published: '2026-11-03' })], news: [] }, NOW);
var changedPayload = S.buildPayload({ items: changed.papers }, { items: changed.news }, NOW, read.data, stOk);
ok('F6 有新论文时必须写入', S.shouldWrite(read.data, changedPayload) === true);
ok('F7 有失败状态时必须写入', S.shouldWrite(read.data, S.buildPayload({ items: merged.papers }, { items: merged.news }, NOW, read.data, stPartial)) === true);

/* ---------------- 渲染与前端契约 ---------------- */

var win = {};
new Function('window', code)(win);
var d = win.ASTRUM_DAILY;
ok('R1 渲染产物可执行', !!d && typeof d === 'object');
ok('R2 保留 sync 状态', !!d.sync && d.sync.lastSuccessAt === stOk.lastSuccessAt);
ok('R3 论文带 firstSeen/fetchedAt', d.papers.every(function (p) { return !!p.firstSeen; }) &&
  d.papers.some(function (p) { return !!p.fetchedAt; }));
ok('R4 旧字段保持兼容', typeof d.updated === 'string' && Array.isArray(d.news) && Array.isArray(d.community));
ok('R5 不输出字面 </script>', code.indexOf('</scr' + 'ipt') < 0);

var hostile = S.render(S.buildPayload({ items: [] }, {
  items: [{ title: 'T', url: 'https://e.com/1', date: '2026-11-02', summary: 'end </script> start', source: 'X' }]
}, NOW));
ok('R6 摘要中的 </script> 被转义', hostile.indexOf('</scr' + 'ipt') < 0);

fs.rmSync(tmpDir, { recursive: true, force: true });

var pass = results.filter(function (r) { return r.pass; }).length;
console.log('RESULT ' + pass + '/' + results.length);
results.forEach(function (r) {
  console.log((r.pass ? 'PASS' : 'FAIL') + ' | ' + r.name + (r.extra ? ' | ' + r.extra : ''));
});
process.exit(pass === results.length ? 0 : 1);
