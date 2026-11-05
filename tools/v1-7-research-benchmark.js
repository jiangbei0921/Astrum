/* ASTRUM · 真实天文研究基准集（V1.7 能力验证）
 *
 * 46 个案例，覆盖 15 类能力；本地案例离线执行，复杂研究案例可选真实网络。
 * 每个案例记录：编号/问题/预期/实际/证据/Agent/工具/耗时/通过/失败原因。
 *
 * 用法：
 *   node tools/v1-7-research-benchmark.js            # 本地 + 真实网络研究
 *   node tools/v1-7-research-benchmark.js --offline  # 仅本地（网络研究标 SKIPPED）
 *   node tools/v1-7-research-benchmark.js --json     # 额外输出 JSON
 */
'use strict';

var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;
var JSON_OUT = process.argv.indexOf('--json') >= 0;
/* --only=S01,S05：只跑指定案例，便于针对真实网络问题迭代；不改变默认全量。 */
var ONLY = (function () {
  var a = process.argv.filter(function (x) { return /^--only=/.test(x); })[0];
  return a ? a.replace(/^--only=/, '').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean) : null;
})();

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};
global.sessionStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] || null; },
  setItem: function (k, v) { this._d[k] = v; },
  removeItem: function (k) { delete this._d[k]; }
};

[
  'data/catalog.js', 'data/knowledge.js', 'data/places.js', 'data/bodies.js',
  'data/solarsystem.js', 'data/obsplan.js', 'data/gear.js', 'data/daily.js',
  'core/astro.js', 'core/runtime.js', 'core/task.js', 'core/schema.js',
  'core/claims.js', 'core/evidence.js', 'core/fits.js', 'core/fit.js',
  'core/query.js', 'core/agents.js', 'core/sources.js', 'core/research.js',
  'core/solarsystem.js', 'core/attachments.js', 'core/simbad.js',
  'core/router.js', 'core/planner.js', 'core/reducer.js', 'core/report.js',
  'core/pdf-text.js', 'core/paper-fulltext.js', 'core/registry.js',
  'core/compose-adapter.js', 'core/task-store.js', 'core/orchestrator.js',
  'core/control.js', 'core/request.js', 'core/control-bridge.js', 'core/attachment-evidence.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var R = global.AstroRequest;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Pdf = global.AstroPdfText;
var FT = global.AstroPaperFulltext;

var CTX = { y: 2026, mo: 11, d: 2, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var CFG = AC.defaultConfig();

/* id / category / question / expected checks */
var CASES = [
  /* 1 基础天文知识 */
  { id: 'B01', cat: '基础天文知识', q: 'M42 是什么？', kinds: ['verdict', 'evidence'], all: ['猎户座'] },
  { id: 'B02', cat: '基础天文知识', q: '什么是黑洞？', kinds: ['verdict'], all: ['引力'] },
  { id: 'B03', cat: '基础天文知识', q: '太阳系的结构是怎样的？', kinds: ['verdict'], any: ['太阳', '行星'] },
  { id: 'B04', cat: '基础天文知识', q: '超新星爆发能产生多大的能量？', kinds: ['verdict'], any: ['能量', '10^', '超新星'] },
  { id: 'B05', cat: '基础天文知识', q: '太阳活动对地球有什么影响？', kinds: ['verdict'], any: ['磁暴', '极光', '电离层'] },

  /* 2 名称与编号识别 */
  { id: 'N01', cat: '名称编号', q: 'M42 在哪？', kinds: ['verdict'], any: ['猎户', '佩剑'] },
  { id: 'N02', cat: '名称编号', q: 'NGC1976 是什么？', kinds: ['verdict'], any: ['猎户', '星云'] },
  { id: 'N03', cat: '名称编号', q: '猎户座大星云怎么找？', kinds: ['verdict'], any: ['猎户', '参宿', '佩剑'] },
  { id: 'N04', cat: '名称编号', q: 'M31 和 M33 是哪个星系？', kinds: ['verdict', 'evidence'], any: ['仙女', '三角'] },

  /* 3 天体参数 */
  { id: 'P01', cat: '天体参数', q: 'M42 的距离是多少？', kinds: ['verdict', 'evidence'], all: ['1344'], any: ['光年'] },
  { id: 'P02', cat: '天体参数', q: 'M31 的距离是多少？', kinds: ['verdict'], any: ['254', '250', '万光年'] },
  { id: 'P03', cat: '天体参数', q: '木星的质量是多少？', kinds: ['verdict'], any: ['kg', '千克', '10^'] },
  { id: 'P04', cat: '天体参数', q: '太阳表面温度是多少？', kinds: ['verdict'], any: ['K', '开', '5500', '5778'] },
  { id: 'P05', cat: '天体参数', q: '木星的直径是多少？', kinds: ['verdict'], any: ['139,820', '139820', 'km'] },
  { id: 'P06', cat: '天体参数', q: '土星的质量是多少？', kinds: ['verdict'], any: ['kg', '千克', '10^'] },

  /* 4 多目标比较 */
  { id: 'C01', cat: '多目标比较', q: 'M42 和 M31 有什么区别？', kinds: ['verdict', 'evidence'], any: ['星云', '星系'] },
  { id: 'C02', cat: '多目标比较', q: '比较 M31 和 M33 的观测难度与距离测量', template: 'T-D', compare: 2, all: ['距离'], any: ['可见性'] },
  { id: 'C03', cat: '多目标比较', q: '木星和土星哪个更适合观测？', template: 'T-D', compare: 2, all: ['木星', '土星'] },
  { id: 'C04', cat: '多目标比较', q: 'M4 和 M42 哪个更适合拍摄？', template: 'T-D', compare: 2, all: ['M4', 'M42'] },

  /* 5 多轮上下文 */
  { id: 'M01', cat: '多轮上下文', q: 'M42 是什么？', kinds: ['verdict'], all: ['猎户座'] },
  { id: 'M02', cat: '多轮上下文', q: '它多远？', memory: true, kinds: ['verdict', 'evidence'], all: ['1344'], any: ['光年'] },

  /* 6 复杂问题拆解 */
  { id: 'D01', cat: '复杂拆解', q: 'M42 为什么是红色的，并且应该怎么拍？', any: ['红', '拍摄'], kinds: ['verdict'] },
  { id: 'D02', cat: '复杂拆解', q: '比较 M31 和 M33 并给出今晚的观测建议', template: 'T-D', compare: 2, any: ['观测', '建议'] },
  { id: 'D03', cat: '复杂拆解', q: 'JWST 对早期宇宙星系的主要发现及争议', research: true, network: true, any: ['JWST', '星系', '早期'] },

  /* 7 多 Agent 协作 */
  { id: 'A01', cat: '多Agent协作', q: '今晚在北京能看到什么？', kinds: ['verdict', 'rank'], agents: ['muse', 'vega', 'horizon'] },
  { id: 'A02', cat: '多Agent协作', q: 'M42 用 80mm 能拍吗？', kinds: ['verdict'], any: ['80', '视场', '能拍'] },
  { id: 'A03', cat: '多Agent协作', q: '太阳活动对地球有什么影响？', kinds: ['verdict'], any: ['太阳', '地球'] },

  /* 8 论文搜索 */
  { id: 'S01', cat: '论文搜索', q: '不同论文对 M42 距离测量结果的比较', research: true, network: true, all: ['Orion'], no: ['考古', '遗址', '墓葬'], conclusionNumbers: true },
  { id: 'S02', cat: '论文搜索', q: '系外行星大气观测技术与代表性研究', research: true, network: true, any: ['exoplanet', 'planet', 'atmosphere'] },
  { id: 'S03', cat: '论文搜索', q: '星系形成的最新研究进展', research: true, network: true, any: ['galaxy', 'galaxies', 'formation'] },
  { id: 'S04', cat: '论文搜索', q: 'JWST 对早期宇宙星系的主要发现', research: true, network: true, any: ['JWST', 'galaxy', 'early'] },

  /* 9 论文结果比较 */
  { id: 'S05', cat: '论文比较', q: 'M42 距离测量是否一致？', research: true, network: true, all: ['Orion'], no: ['考古', '遗址'], conclusionNumbers: true },
  { id: 'S06', cat: '论文比较', q: 'M31 距离测量方法比较', research: true, network: true, any: ['Andromeda', 'distance', 'parallax'], conclusionNumbers: true },

  /* 10 PDF 解析 */
  { id: 'F01', cat: 'PDF解析', special: 'pdf', pdf: 'mixed', kinds: ['pdf'] },
  { id: 'F02', cat: 'PDF解析', special: 'pdf', pdf: 'scanned', failCode: 'pdf_no_text', kinds: ['pdf'] },

  /* 11 器材规划 */
  { id: 'G01', cat: '器材规划', q: '今晚在北京用 200mm 望远镜拍摄 M42，应该怎么设置参数？', any: ['200', '259', '曝光'] },
  { id: 'G02', cat: '器材规划', q: 'M42 用 80mm 望远镜能拍吗？', kinds: ['verdict'], any: ['80', '能拍', '视场'] },
  { id: 'G03', cat: '器材规划', q: '新手买什么望远镜？', kinds: ['verdict'], any: ['口径', '望远镜', '推荐'] },

  /* 12 地点与时间规划 */
  { id: 'T01', cat: '地点时间', q: '今晚北京适合拍摄什么？', kinds: ['verdict', 'rank'], any: ['北京', '今晚'] },
  { id: 'T02', cat: '地点时间', q: '上海今晚能看到什么？', kinds: ['verdict', 'rank'], any: ['上海', '今晚'] },
  { id: 'T03', cat: '地点时间', q: '2026 年 12 月 31 日在北京能看到什么？', kinds: ['verdict', 'rank'], any: ['北京', '12'] },

  /* 13 研究结论生成 */
  { id: 'R01', cat: '研究结论', q: '比较 M31、M33 和 M42 的物理参数与观测难度', template: 'T-D', compare: 3, all: ['距离'], any: ['可见性'] },
  { id: 'R02', cat: '研究结论', q: 'M42 的距离是多少？不同论文的测量是否一致？', research: true, network: true, all: ['Orion'], no: ['考古', '遗址'] },

  /* 14 异常恢复 */
  { id: 'E01', cat: '异常恢复', q: '断网时研究 M42 距离', offline: true, noResearch: true, noFabrication: true, kinds: ['verdict'], all: ['1344'] },
  { id: 'E02', cat: '异常恢复', q: '断网时比较 M31 和 M33', template: 'T-D', compare: 2, offline: true },

  /* 15 长任务 */
  { id: 'L01', cat: '长任务', q: '比较 M42、M31、M33、M4 的观测难度与距离', template: 'T-D', compare: 4, all: ['距离'] }
];

function summarizeSections(answer) {
  return (answer && answer.sections || []).map(function (s) { return s.kind; });
}
function sectionText(answer) {
  try { return JSON.stringify(answer && answer.sections || []); } catch (e) { return ''; }
}
function toolsOf(control) {
  var steps = control && control.state && control.state.steps || [];
  return steps.map(function (s) { return s.tool + ':' + s.status; });
}
function agentList(answer) {
  return (answer && answer.meta && answer.meta.agents) ||
    (answer && answer.trace || []).map(function (t) { return t.agent; }).filter(Boolean);
}
function evidenceList(research) {
  return (research && research.evidence || []).map(function (e) {
    return { id: e.evidenceId, type: e.sourceType, title: e.title, uri: e.uri, abstractOnly: e.abstractOnly };
  });
}

async function runOne(c) {
  var start = Date.now();
  var row = {
    id: c.id, category: c.cat, question: c.q || ('PDF fixture: ' + c.pdf),
    expected: c.template || (c.research ? 'research' : c.kinds ? c.kinds.join('+') : 'answer'),
    actual: '', evidence: [], agents: [], tools: [], ms: 0, pass: true, reason: '',
    checked: []
  };
  function fail(msg) { row.pass = false; row.reason = row.reason ? row.reason + '；' + msg : msg; }
  function check(name, ok, detail) {
    row.checked.push({ name: name, ok: !!ok, detail: detail == null ? '' : String(detail) });
    if (!ok) fail(name + (detail ? '（' + detail + '）' : ''));
  }

  if (c.special === 'pdf') {
    var file = path.join(ROOT, 'tools', 'fixtures', 'pdf', c.pdf + '.pdf');
    if (!fs.existsSync(file)) { fail('缺少 fixture ' + c.pdf + '.pdf'); row.ms = Date.now() - start; return row; }
    var r = await Pdf.parse(new Uint8Array(fs.readFileSync(file)));
    row.actual = r.ok ? ('pages=' + r.pageCount + ' sections=' + r.sections.length + ' chunks=' + r.chunks.length)
      : (r.code + ':' + r.error);
    if (c.failCode) {
      check('明确失败 ' + c.failCode, r.ok === false && r.code === c.failCode, r.code);
      check('不伪造正文', !r.text || r.text.length === 0, r.text && r.text.length);
    } else {
      check('PDF 解析成功', r.ok === true, r.code);
      check('章节/分块', r.ok && r.sections.length >= 3 && r.chunks.length >= 2,
        r.ok ? r.sections.length + '/' + r.chunks.length : '');
    }
    row.ms = Date.now() - start;
    return row;
  }

  var adapter = Adapter.create({ agentCore: AC });
  var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: !OFFLINE && !!c.network });
  var opts = {
    adapter: adapter, registry: registry,
    network: !OFFLINE && !!c.network && !c.offline,
    fulltext: !!c.fulltext
  };
  if (c.memory) {
    AC.setMemory([{ q: 'M42 是什么？', a: '猎户座大星云', target: 'M42', at: Date.now() }]);
  } else {
    AC.clearMemory();
  }
  var r;
  try {
    r = await R.handle(c.q, CTX, CFG, opts);
  } catch (e) {
    row.ms = Date.now() - start;
    fail('执行异常 ' + (e && e.message || e));
    return row;
  }
  AC.clearMemory();
  row.ms = Date.now() - start;
  row.actual = (r.mode || '') + ' / ' + summarizeSections(r.answer).join('+');
  row.agents = agentList(r.answer);
  row.tools = toolsOf(r.control);
  row.search = ((r.control && r.control.state && r.control.state.steps) || [])
    .filter(function (s) { return /paper\.search|evidence\.search|simbad\.tap/.test(s.tool || ''); })
    .map(function (s) {
      var res = s.result || {};
      return {
        tool: s.tool, status: s.status, empty: res.empty === true,
        errors: (res.errors || []).map(function (e) { return { kind: e.kind || '', msg: e.msg || '' }; }),
        error: s.error ? { kind: s.error.kind || '', message: s.error.message || '' } : null
      };
    });
  var text = sectionText(r.answer) + ' ' + JSON.stringify(r.research || '');
  row.evidence = evidenceList(r.research);
  row.papers = (r.research && r.research.papers || []).map(function (p) {
    return {
      title: p.title, authors: p.authors, date: p.date, doi: p.doi,
      arxivId: p.arxivId, url: p.url, abstractOnly: p.abstractOnly,
      fulltextAvailable: p.fulltextAvailable
    };
  });
  row.researchMeta = r.research ? {
    conclusions: (r.research.conclusions || []).map(function (c) {
      return { text: c.text, level: c.level, evidenceRefs: c.evidenceRefs, scope: c.evidenceScope };
    }),
    gaps: r.research.gaps || [], limitations: r.research.limitations || [],
    paperStats: r.research.paperStats || null,
    conflicts: (r.research.conflicts || []).map(function (c) {
      return { family: c.family || c.property, spread: c.spread, values: c.values };
    })
  } : null;
  /* 外部限流/超时不是研究能力缺陷；明确记为 BLOCKED_EXTERNAL，绝不当作通过。 */
  var external = [];
  (row.search || []).forEach(function (s) {
    (s.errors || []).forEach(function (e) {
      if (/limit|rate|cool|timeout|network|fetch|429|503|频繁|限流|冷却|超时/i.test((e.kind || '') + ' ' + (e.msg || ''))) {
        external.push(e.kind || e.msg);
      }
    });
    if (s.error && /limit|rate|cool|timeout|network|fetch|429|503|频繁|限流|冷却|超时/i.test((s.error.kind || '') + ' ' + (s.error.message || ''))) {
      external.push(s.error.kind || s.error.message);
    }
  });
  if (c.research && opts.network && (!r.research || (r.research.papers || []).length === 0) && external.length) {
    row.pass = null;
    row.reason = 'BLOCKED_EXTERNAL:' + external.slice(0, 2).join('/');
    return row;
  }
  /* 只有题名/DOI、没有任何摘要正文时，不能要求结论里出现可核对数值；
   * 这是外部元数据缺失，不是研究能力通过。明确记为 BLOCKED_EXTERNAL。 */
  if (c.conclusionNumbers && r.research && external.length) {
    var hasAbstract = (r.research.evidence || []).some(function (e) {
      var x = String((e.content && (e.content.excerpt || e.content.snippet)) || '');
      return x.length > 100 && x.indexOf(String(e.title || '').slice(0, 30)) !== 0;
    });
    if (!hasAbstract) {
      row.pass = null;
      row.reason = 'BLOCKED_EXTERNAL:no-abstract';
      return row;
    }
  }

  if (!r.answer) { fail('没有 answer'); return row; }
  if (c.template) check('模板 ' + c.template, r.control && r.control.plan && r.control.plan.template === c.template,
    r.control && r.control.plan && r.control.plan.template);
  if (c.noFabrication) {
    check('离线不伪造论文', !r.research || (r.research.papers || []).length === 0,
      r.research ? (r.research.papers || []).length : 0);
  }
  if ((c.research || c.researchOffline) && !c.noResearch) {
    check('存在研究报告', !!r.research, r.mode);
    if (r.research) {
      var ids = {};
      (r.research.evidence || []).forEach(function (e) { ids[e.evidenceId] = 1; });
      var badRefs = [];
      (r.research.conclusions || []).forEach(function (cl) {
        (cl.evidenceRefs || []).forEach(function (id) { if (!ids[id]) badRefs.push(id); });
      });
      check('结论引用均可追溯', badRefs.length === 0, badRefs.join(','));
      if (c.conclusionNumbers) {
        var numeric = (r.research.conclusions || []).filter(function (cl) {
          return /\d/.test(cl.text || '') && /(?:\bpc\b|\bkpc\b|\bMpc\b|光年|light-year|±|%)/i.test(cl.text || '');
        });
        check('结论含可核对数值', numeric.length >= 1,
          (r.research.conclusions || []).map(function (cl) { return String(cl.text || '').slice(0, 60); }).join(' | '));
      }
      check('无数值伪影', !/NaN|undefined|Infinity/.test(JSON.stringify(r.research)), '');
      check('论文有标题与链接', (r.research.papers || []).every(function (p) { return p.title && p.url; }),
        (r.research.papers || []).length);
      var titles = {};
      (r.research.papers || []).forEach(function (p) {
        titles[String(p.title || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()] = 1;
      });
      check('论文无重复标题', Object.keys(titles).length === (r.research.papers || []).length,
        (r.research.papers || []).length + ' titles');
      check('论文含年份', (r.research.papers || []).every(function (p) { return !!p.date; }),
        (r.research.papers || []).map(function (p) { return p.date || '-'; }).join(','));
      check('论文链接为可追溯地址', (r.research.papers || []).every(function (p) {
        return /^https?:\/\//i.test(p.url || '');
      }), (r.research.papers || []).map(function (p) { return p.url || '-'; }).join(','));
      if (c.network && !OFFLINE) {
        check('至少一篇论文', (r.research.papers || []).length >= 1, (r.research.papers || []).length);
      }
      if (c.noFabrication) {
        check('离线不伪造论文', (r.research.papers || []).length === 0, (r.research.papers || []).length);
      }
    }
  }
  (c.kinds || []).forEach(function (k) { check('包含章节 ' + k, summarizeSections(r.answer).indexOf(k) >= 0, summarizeSections(r.answer).join(',')); });
  if (c.compare) {
    var cmp = (r.answer.sections || []).filter(function (s) { return s.kind === 'compare'; })[0];
    check('对比目标数 ' + c.compare, cmp && (cmp.items || []).length === c.compare, cmp && (cmp.items || []).length);
  }
  (c.all || []).forEach(function (k) { check('包含关键词 ' + k, text.indexOf(k) >= 0, ''); });
  if (c.any && c.any.length) {
    check('包含任一关键词 ' + c.any.join('/'), c.any.some(function (k) { return text.indexOf(k) >= 0; }), '');
  }
  (c.no || []).forEach(function (k) {
    if (text.indexOf(k) >= 0) { check('不应包含 ' + k, false, '出现 ' + k); }
  });
  if (c.agents) {
    c.agents.forEach(function (a) { check('Agent ' + a, row.agents.indexOf(a) >= 0, row.agents.join(',')); });
  }
  return row;
}

(async function main() {
  var rows = [];
  var cases = ONLY ? CASES.filter(function (c) { return ONLY.indexOf(c.id) >= 0; }) : CASES;
  for (var i = 0; i < cases.length; i++) {
    var row = await runOne(cases[i]);
    if (OFFLINE && cases[i].network) {
      row.pass = null; row.reason = 'SKIPPED_OFFLINE'; row.ms = 0;
    }
    rows.push(row);
    console.log((row.pass === null ? 'SKIP' : row.pass ? 'PASS' : 'FAIL') + ' | ' + row.id + ' ' + row.category +
      ' | ' + String(row.question || '(PDF fixture)').slice(0, 32) + ' | ' + row.actual + ' | ' + row.ms + 'ms' +
      (row.reason ? ' | ' + row.reason : ''));
  }
  var pass = rows.filter(function (r) { return r.pass === true; }).length;
  var fail = rows.filter(function (r) { return r.pass === false; }).length;
  var skip = rows.filter(function (r) { return r.pass === null; }).length;
  console.log('');
  console.log('BENCH ' + rows.length + ' cases | PASS ' + pass + ' | FAIL ' + fail + ' | SKIP ' + skip);
  if (JSON_OUT) {
    var out = { generatedAt: new Date().toISOString(), ctx: CTX, results: rows };
    var f = path.join(ROOT, 'tools', 'fixtures', 'research-benchmark-results.json');
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log('JSON ' + f);
  }
  process.exitCode = fail ? 1 : 0;
})();
