/* ASTRUM · 每日前沿抓取器离线测试（零依赖）
 *
 * 为什么需要它：tools/sync-daily.js 是整条链路里唯一没有离线测试的部分。
 * 它每天由 GitHub Actions 跑一次，出问题时只表现为「今天条数变少了」，
 * 没人会去看那行 warning。这里的样本是照着三类真实源的格式抄的：
 *   - arXiv Atom：标题带换行、id 带版本号、作者多、primary_category 覆盖请求分类
 *   - ESA RSS：链接写在 <link><![CDATA[…]]></link> 里
 *   - 部分 RSS：没有 <link>，链接在 <guid isPermaLink="true">
 *
 * 只测纯函数（clean / parseArxiv / parseRss / buildPayload / render），不联网。
 * 样本里刻意保留了几种会导致「静默解析出 0 条」的真实写法，见各断言备注。
 *
 * 用法：node tools/daily-test.js
 */
'use strict';

var S = require('./sync-daily.js');

var R = [];
function ok(name, pass, extra) {
  R.push({ n: name, p: !!pass, x: extra === undefined ? '' : String(extra) });
}

/* ---------------- 样本 ---------------- */

var ARXIV_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<feed xmlns="http://www.w3.org/2005/Atom">',
  '<entry>',
  '  <id>http://arxiv.org/abs/2410.12345v2</id>',
  '  <published>2026-10-27T17:59:59Z</published>',
  '  <title>  A   Very',
  'Long  Title  </title>',
  '  <summary>We measure the  Hubble   constant &amp; compare.</summary>',
  '  <author><name>Alice A</name></author>',
  '  <author><name>Bob B</name></author>',
  '  <author><name>Cy C</name></author>',
  '  <author><name>Di D</name></author>',
  '  <arxiv:primary_category term="astro-ph.CO" scheme="http://arxiv.org/schemas/atom"/>',
  '</entry>',
  '<entry>',
  '  <id>http://arxiv.org/abs/2410.99999v1</id>',
  '  <published>2026-10-26T08:00:00Z</published>',
  '  <title>No primary category here</title>',
  '  <summary>Short.</summary>',
  '</entry>',
  '<entry>',
  '  <id>http://arxiv.org/abs/2410.00001v1</id>',
  '  <published>2026-10-25T08:00:00Z</published>',
  '  <title>   </title>',
  '  <summary>Missing title, must be dropped.</summary>',
  '</entry>',
  '</feed>'
].join('\n');

var RSS_XML = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<rss version="2.0"><channel>',
  '<item>',
  '  <title><![CDATA[Soyuz launch &amp; more]]></title>',
  '  <link><![CDATA[https://www.esa.int/Science/Space?x=1]]></link>',
  '  <pubDate>Mon, 27 Oct 2026 10:00:00 GMT</pubDate>',
  '  <description><![CDATA[<p>Body <b>text</b></p>]]></description>',
  '</item>',
  '<item>',
  '  <title>Guid only</title>',
  '  <guid isPermaLink="true">https://example.org/g</guid>',
  '  <pubDate>not a date</pubDate>',
  '</item>',
  '<item>',
  '  <title>No link at all</title>',
  '  <pubDate>Mon, 27 Oct 2026 10:00:00 GMT</pubDate>',
  '</item>',
  '</channel></rss>'
].join('\n');

/* ---------------- clean() ---------------- */

var cdata = S.clean('<![CDATA[https://www.esa.int/Science/Space?a=1&b=2]]>');
/* 先删标签再解 CDATA 会把它整段吃掉 → 链接变空串 → 该源"静默 0 条" */
ok('clean: CDATA 链接不被标签规则吃掉', cdata === 'https://www.esa.int/Science/Space?a=1&b=2', cdata);

var ent = S.clean('A &amp; B &#8217;s &quot;q&quot; &lt;tag&gt;');
/* &lt;tag&gt; 在删标签之后才还原，所以尖括号会留下——这是已知行为，不是 bug：
 * 摘要只作文本渲染，不会再进一次 HTML 解析。这里固定住它，防止以后被"顺手改坏"。 */
ok('clean: 实体解码', ent === 'A & B \u2019s "q" <tag>', ent);

var spaced = S.clean('<p>a</p><p>b</p>');
/* 删标签必须换成空格，直接删会让 a 和 b 粘成 ab */
ok('clean: 删标签不粘连文本', spaced === 'a b', spaced);

var cut = S.clean('aaa, bbbb', 4);
/* 截断后要吃掉尾随标点，否则会出现「…」前面挂一个逗号 */
ok('clean: 截断加省略号且不留尾随标点', cut === 'aaa\u2026', cut);

/* ---------------- parseArxiv() ---------------- */

var papers = S.parseArxiv(ARXIV_XML, 'astro-ph.GA');
ok('arxiv: 丢弃无标题条目', papers.length === 2, 'n=' + papers.length);

var p0 = papers[0] || {};
ok('arxiv: 剥掉版本号', p0.id === '2410.12345', p0.id);
ok('arxiv: url 指向不带版本号的 abs 页',
  p0.url === 'https://arxiv.org/abs/2410.12345', p0.url);
ok('arxiv: 标题换行与多空格压平', p0.title === 'A Very Long Title', p0.title);
ok('arxiv: 作者最多取 3 位', (p0.authors || []).length === 3 &&
  p0.authors[0] === 'Alice A', (p0.authors || []).join(' / '));
/* clean 的截断会补省略号，日期若复用它就会变成 "2026-10-27…" */
ok('arxiv: 日期为 10 位且不加省略号',
  p0.published === '2026-10-27' && String(p0.published).length === 10, p0.published);
ok('arxiv: primary_category 覆盖请求分类', p0.cat === 'astro-ph.CO', p0.cat);

var p1 = papers[1] || {};
ok('arxiv: 无 primary_category 时回落到请求分类', p1.cat === 'astro-ph.GA', p1.cat);

var empty = S.parseArxiv('<feed></feed>', 'astro-ph.GA');
ok('arxiv: 空文档返回空数组而非抛错', Array.isArray(empty) && empty.length === 0);

/* ---------------- parseRss() ---------------- */

var news = S.parseRss(RSS_XML, 'ESA');
ok('rss: 丢弃既无 link 也无 guid 的条目', news.length === 2, 'n=' + news.length);

var n0 = news[0] || {};
ok('rss: CDATA 链接可用', n0.url === 'https://www.esa.int/Science/Space?x=1', n0.url);
ok('rss: CDATA 标题里的实体被解码', n0.title === 'Soyuz launch & more', n0.title);
ok('rss: description 去标签并压空白', n0.summary === 'Body text', n0.summary);
ok('rss: pubDate 归一为 YYYY-MM-DD', n0.date === '2026-10-27', n0.date);
ok('rss: source 透传', n0.source === 'ESA', n0.source);

var n1 = news[1] || {};
ok('rss: 无 link 时回退 guid', n1.url === 'https://example.org/g', n1.url);
ok('rss: 非法日期留空不编造', n1.date === '', JSON.stringify(n1.date));

var many = [];
for (var i = 0; i < 10; i++) {
  many.push('<item><title>T' + i + '</title><link>https://e.com/' + i +
    '</link><pubDate>Mon, 27 Oct 2026 10:00:00 GMT</pubDate></item>');
}
var capped = S.parseRss('<rss><channel>' + many.join('') + '</channel></rss>', 'X');
ok('rss: 单源最多 8 条', capped.length === 8, 'n=' + capped.length);

/* ---------------- buildPayload() ---------------- */

var payload = S.buildPayload(
  { items: papers },
  { items: news },
  new Date('2026-10-28T01:00:00Z')
);
ok('payload: updated 为 YYYY-MM-DD',
  payload.updated === '2026-10-28' && String(payload.updated).length === 10, payload.updated);
ok('payload: 顶层字段齐全',
  Array.isArray(payload.papers) && Array.isArray(payload.news) &&
  Array.isArray(payload.community) && typeof payload.note === 'string');
ok('payload: community 入口字段齐全',
  payload.community.length > 0 && payload.community.every(function (c) {
    return c.name && c.url && c.kind && c.note;
  }));

/* ---------------- render() 与前端契约 ---------------- */

function execDaily(code) {
  var win = {};
  /* render 产出的是 IIFE：root.ASTRUM_DAILY = {...}；给形参 window 即有 window 的环境 */
  new Function('window', code)(win);
  return win.ASTRUM_DAILY;
}

var daily = execDaily(S.render(payload));
ok('render: 产物可直接执行并挂到 window', !!daily && typeof daily === 'object');
ok('render: 论文条目可被 frPaper 渲染',
  daily.papers.every(function (p) { return p.title && p.url; }));
ok('render: 报道条目可被 frNews 渲染',
  daily.news.every(function (n) { return n.title && n.url && n.source !== undefined && n.date !== undefined; }));

/* 摘要里出现 </script> 时，data/daily.js 作为外部文件没问题，
 * 但 build-standalone 会把它内联进 <script>，浏览器会在那里提前闭合脚本，
 * 后面的代码全变成文本 —— 页面白屏，且控制台只报一个莫名其妙的语法错。
 *
 * 这条必须走完整链路才有意义：RSS 原文写的是 &lt;/script&gt;，
 * clean()（先删标签、再解实体）会把它还原成字面 </script>，然后才轮到 render 兜底。 */
var hostileXml = '<rss><channel><item><title>T</title>' +
  '<link>https://e.com/1</link>' +
  '<pubDate>Mon, 27 Oct 2026 10:00:00 GMT</pubDate>' +
  '<description>end &lt;/script&gt; start</description></item></channel></rss>';
var hostileNews = S.parseRss(hostileXml, 'X');
ok('rss: 实体形式的 </script> 会在 clean 后还原成字面',
  (hostileNews[0] || {}).summary === 'end </script> start',
  JSON.stringify((hostileNews[0] || {}).summary));

var hostile = S.render(S.buildPayload({ items: [] }, { items: hostileNews },
  new Date('2026-10-28T01:00:00Z')));
ok('render: 不输出字面 </script>（否则单文件版会被截断）',
  hostile.indexOf('</scr' + 'ipt') < 0);

var hostileDaily = execDaily(hostile);
ok('render: 转义后语义不变（摘要仍是原文）',
  hostileDaily.news[0].summary === 'end </script> start',
  JSON.stringify(hostileDaily.news[0].summary));

/* ---------------- 汇总 ---------------- */

var pass = R.filter(function (r) { return r.p; }).length;
console.log('RESULT ' + pass + '/' + R.length);
R.forEach(function (r) {
  console.log((r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? ' | ' + r.x : ''));
});
process.exit(pass === R.length ? 0 : 1);
