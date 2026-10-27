/* ASTRUM · 每日前沿同步（零依赖，Node 内置模块）
 *
 * 作用：抓取「最新论文」与「机构报道」，生成 data/daily.js 供页面读取。
 *
 * 为什么生成 .js 而不是 .json：
 *   本项目支持双击 index.html 直接打开（file://）。file:// 下 fetch 本地 JSON
 *   会被浏览器拦截，而 <script src> 可以。data/*.js 全部以 window.X = ... 形式挂载，
 *   单文件构建也会把它内联进去，两条路径都能用。
 *
 * 为什么它不参与答案推理：
 *   知识库条目的每个事实都带固定核验日期。预印本标题与机构新闻摘要是「尚未核验的
 *   二手内容」，混进证据链会让「可复算」这个承诺失效。所以它只作阅读入口与提问引子。
 *
 * 用法：
 *   node tools/sync-daily.js            抓取并写入 data/daily.js
 *   node tools/sync-daily.js --dry-run  只打印统计，不写文件
 *
 * 失败策略：任一来源失败不影响其它来源；**全部失败时不覆盖旧文件并以 1 退出**，
 *   否则会用一个空文件把昨天的数据抹掉。
 */
'use strict';

var fs = require('fs');
var path = require('path');
var https = require('https');

var ROOT = path.resolve(__dirname, '..');
var OUT = path.join(ROOT, 'data', 'daily.js');

var MAX_PAPERS = 20;
var MAX_NEWS = 12;
var SUMMARY_CHARS = 220;

/* 预印本分类：银河/宇宙学/行星/高能/恒星。
 * 不用 cat:astro-ph.* 通配（arXiv API 的 OR 语法更可靠），也不取 gr-qc 等相邻领域——
 * 与本产品「观测 + 天体」的定位不符，混进来会稀释相关性。 */
var ARXIV_CATS = ['astro-ph.GA', 'astro-ph.CO', 'astro-ph.EP', 'astro-ph.HE', 'astro-ph.SR'];

/* 报道来源：ESA 与 ScienceDaily 的公开 RSS。
 * 选这两个是因为它们长期存在、无 key、只发机构口径的成果报道；
 * 聚合站的标题常带夸大措辞，与「事实优先」的调性冲突。 */
var NEWS_FEEDS = [
  { name: 'ESA', url: 'https://www.esa.int/rssfeed/Our_Activities/Space_Science' },
  { name: 'ScienceDaily', url: 'https://www.sciencedaily.com/rss/space_time.xml' }
];

/* 人工筛选的长期阵地。不做抓取：
 *   论坛正文抓取涉及 robots 协议、版权与噪音过滤，而且质量参差；
 *   给出入口让用户自己去看，比替他抓一堆半相关内容更诚实。
 * URL 均为站点首页或固定栏目页，不随单篇文章失效。 */
var COMMUNITY = [
  { name: 'AstroBites', url: 'https://astrobites.org/', kind: 'blog', note: '研究生撰写的最新论文解读' },
  { name: 'AAS Nova', url: 'https://aasnova.org/', kind: 'blog', note: '美国天文学会精选研究亮点' },
  { name: 'arXiv astro-ph', url: 'https://arxiv.org/list/astro-ph/recent', kind: 'papers', note: '预印本每日列表（未经同行评审）' },
  { name: 'Sky & Telescope', url: 'https://skyandtelescope.org/', kind: 'magazine', note: '观测指南与新闻' },
  { name: 'CloudyNights', url: 'https://www.cloudynights.com/', kind: 'forum', note: '器材与观测的爱好者论坛' },
  { name: 'AstroBin', url: 'https://www.astrobin.com/', kind: 'community', note: '天文摄影作品与拍摄参数' },
  { name: 'Stargazers Lounge', url: 'https://stargazerslounge.com/', kind: 'forum', note: '英文爱好者社区' },
  { name: 'r/astronomy', url: 'https://www.reddit.com/r/astronomy/', kind: 'community', note: '综合讨论，噪音较多' }
];

/* ---------------- 基础工具 ---------------- */

function get(url, redirects) {
  return new Promise(function (resolve, reject) {
    var hops = redirects || 0;
    var req = https.get(url, {
      headers: {
        /* arXiv 与部分机构站对无 UA 的请求会返回 403 或限速 */
        'user-agent': 'ASTRUM-daily-sync/1.0 (astronomy reading list; contact via repo)',
        accept: 'application/atom+xml, application/rss+xml, application/xml, text/xml, */*'
      },
      timeout: 20000
    }, function (res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops < 3) {
        res.resume();
        var next = res.headers.location.indexOf('http') === 0
          ? res.headers.location
          : new URL(res.headers.location, url).toString();
        resolve(get(next, hops + 1));
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error('HTTP ' + res.statusCode + ' ' + url));
        return;
      }
      var buf = [];
      res.on('data', function (c) { buf.push(c); });
      res.on('end', function () { resolve(Buffer.concat(buf).toString('utf8')); });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout ' + url)); });
    req.on('error', reject);
  });
}

function unescapeXml(s) {
  return String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#(\d+);/g, function (m, d) { return String.fromCharCode(Number(d)); })
    .replace(/&#x([0-9a-f]+);/gi, function (m, h) { return String.fromCharCode(parseInt(h, 16)); })
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

/* 去标签 + 压缩空白 + 截断。摘要是给人读的，不保留 HTML。
 *
 * 顺序很关键：**先解包 CDATA，再删标签**。
 * ESA 的 RSS 把链接写成 <link><![CDATA[https://…]]></link>，
 * 若先执行 /<[^>]+>/ 删除标签，`<![CDATA[…]]>` 会因为以 `<` 开头、以 `]]>` 结尾
 * 而被整段吃掉，链接变成空串 —— 表现为「该源解析出 0 条」且不报错。
 */
function clean(s, max) {
  var raw = String(s == null ? '' : s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  var t = unescapeXml(raw.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  if (max && t.length > max) {
    t = t.slice(0, max).replace(/[\s,;:，；：]+$/, '') + '…';
  }
  return t;
}

function tag(block, name) {
  var m = block.match(new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + name + '>', 'i'));
  return m ? m[1] : '';
}

/* ---------------- 论文 ---------------- */

function parseArxiv(xml, cat) {
  var out = [];
  var entries = String(xml).match(/<entry>[\s\S]*?<\/entry>/g) || [];
  entries.forEach(function (e) {
    var rawId = clean(tag(e, 'id'), 0);
    var idMatch = rawId.match(/abs\/([^v]+)(?:v\d+)?$/);
    var id = idMatch ? idMatch[1] : '';
    var title = clean(tag(e, 'title'), 0);
    if (!id || !title) return;

    var authors = [];
    var aRe = /<author>[\s\S]*?<name>([\s\S]*?)<\/name>[\s\S]*?<\/author>/g;
    var am;
    while ((am = aRe.exec(e)) !== null) {
      authors.push(clean(am[1], 0));
      if (authors.length >= 3) break;
    }

    /* 日期只取 YYYY-MM-DD：clean 的截断会加省略号，这里不能复用它 */
    var pub = clean(tag(e, 'published'), 0).slice(0, 10);
    var catTerm = '';
    var cm = e.match(/<arxiv:primary_category[^>]*term="([^"]+)"/);
    if (cm) catTerm = cm[1];

    out.push({
      id: id,
      title: title,
      authors: authors,
      summary: clean(tag(e, 'summary'), SUMMARY_CHARS),
      cat: catTerm || cat,
      published: pub,
      url: 'https://arxiv.org/abs/' + id
    });
  });
  return out;
}

async function fetchPapers() {
  var all = [];
  var okCats = [];
  for (var i = 0; i < ARXIV_CATS.length; i++) {
    var cat = ARXIV_CATS[i];
    var url = 'https://export.arxiv.org/api/query?search_query=' + encodeURIComponent('cat:' + cat) +
      '&sortBy=submittedDate&sortOrder=descending&max_results=8';
    try {
      var xml = await get(url);
      var rows = parseArxiv(xml, cat);
      all = all.concat(rows);
      okCats.push(cat + '(' + rows.length + ')');
      /* arXiv 对连续请求有速率限制（建议 3 秒间隔）。5 个分类必须留间隔，
       * 否则后续请求会返回 503 且内容为空——这是它最容易踩的坑。 */
      await new Promise(function (r) { setTimeout(r, 3200); });
    } catch (e) {
      console.warn('  ! arXiv ' + cat + ' 失败：' + e.message);
    }
  }

  /* 去重（同一论文可能同时挂多个分类）+ 按提交日期倒序 */
  var seen = {};
  var uniq = all.filter(function (p) {
    if (seen[p.id]) return false;
    seen[p.id] = 1;
    return true;
  });
  uniq.sort(function (a, b) { return String(b.published).localeCompare(String(a.published)); });

  return { items: uniq.slice(0, MAX_PAPERS), total: uniq.length, okCats: okCats };
}

/* ---------------- 报道 ---------------- */

function parseRss(xml, source) {
  var out = [];
  var items = String(xml).match(/<item[\s>][\s\S]*?<\/item>/g) || [];
  items.forEach(function (it) {
    var title = clean(tag(it, 'title'), 0);
    var link = clean(tag(it, 'link'), 0);
    /* 部分 RSS 把链接写在 <guid isPermaLink="true"> 里 */
    if (!link || link.indexOf('http') !== 0) {
      var g = tag(it, 'guid');
      if (/^https?:/.test(clean(g, 0))) link = clean(g, 0);
    }
    if (!title || !link) return;

    var date = new Date(clean(tag(it, 'pubDate'), 0));
    out.push({
      title: title,
      summary: clean(tag(it, 'description'), 160),
      source: source,
      date: isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10),
      url: link
    });
  });
  return out.slice(0, 8);
}

async function fetchNews() {
  var all = [];
  var okFeeds = [];
  for (var i = 0; i < NEWS_FEEDS.length; i++) {
    var f = NEWS_FEEDS[i];
    try {
      var xml = await get(f.url);
      var rows = parseRss(xml, f.name);
      all = all.concat(rows);
      okFeeds.push(f.name + '(' + rows.length + ')');
    } catch (e) {
      console.warn('  ! ' + f.name + ' 失败：' + e.message);
    }
  }
  all.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return { items: all.slice(0, MAX_NEWS), total: all.length, okFeeds: okFeeds };
}

/* ---------------- 输出 ---------------- */

function render(data) {
  return [
    '/* ASTRUM · 每日前沿（自动生成，请勿手工编辑）',
    ' *',
    ' * 由 tools/sync-daily.js 生成，GitHub Actions 每天 01:00 UTC 运行一次。',
    ' * 要改来源清单或条数上限，改那个脚本，不要改本文件。',
    ' *',
    ' * 内容性质：预印本与机构报道的标题/摘要，**未经本项目核验**，',
    ' * 因此不参与答案推理，只作为阅读入口与提问引子。',
    ' */',
    '(function (root) {',
    "  'use strict';",
    '',
    '  root.ASTRUM_DAILY = ' + JSON.stringify(data, null, 2).replace(/\n/g, '\n  ') + ';',
    '})(typeof window !== \'undefined\' ? window : this);',
    ''
  ].join('\n');
}

async function main() {
  var dry = process.argv.indexOf('--dry-run') >= 0;
  console.log('ASTRUM 每日前沿同步 ' + new Date().toISOString());

  console.log('- 抓取预印本（arXiv）…');
  var papers = await fetchPapers();
  console.log('- 抓取机构报道（RSS）…');
  var news = await fetchNews();

  var now = new Date();
  var payload = {
    updated: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    note: '每日自动同步一次（UTC 01:00）。内容未经本项目核验，不参与答案推理。',
    papers: papers.items,
    news: news.items,
    community: COMMUNITY
  };

  console.log('');
  console.log('  论文 ' + papers.items.length + ' 条' + (papers.okCats.length ? '（' + papers.okCats.join(' ') + '）' : ''));
  console.log('  报道 ' + news.items.length + ' 条' + (news.okFeeds.length ? '（' + news.okFeeds.join(' ') + '）' : ''));
  console.log('  社区 ' + COMMUNITY.length + ' 个入口');

  /* 一条都没抓到：不写文件，用非零退出让 Action 报红。
   * 若此时覆盖，等于用空数据抹掉昨天仍然有效的内容。 */
  if (!papers.items.length && !news.items.length) {
    console.error('\n× 所有来源均失败，保留现有 data/daily.js 不变');
    process.exit(1);
  }

  var code = render(payload);
  if (dry) {
    console.log('\n--dry-run：未写入，预计 ' + Buffer.byteLength(code, 'utf8') + ' 字节');
    return;
  }
  fs.writeFileSync(OUT, code, 'utf8');
  console.log('\n已写入 data/daily.js（' + Buffer.byteLength(code, 'utf8') + ' 字节）');
}

/* 供测试与调试复用：解析函数是纯函数，应当能被单独验证 */
module.exports = {
  parseArxiv: parseArxiv,
  parseRss: parseRss,
  clean: clean,
  render: render,
  COMMUNITY: COMMUNITY,
  ARXIV_CATS: ARXIV_CATS,
  MAX_PAPERS: MAX_PAPERS,
  MAX_NEWS: MAX_NEWS
};

if (require.main === module) {
  main().catch(function (e) {
    console.error('同步失败：' + (e && e.stack || e));
    process.exit(1);
  });
}
