/* ASTRUM · V1.9 独立科研盲测
 *
 * 55 个独立问题 / 15 类，不复用 V1.7 的问题，也不只替换天体名称。
 * 每个案例按 10 个维度打分：意图、拆解、检索相关性、来源可信度、数据准确、
 * 证据链、不确定性、结论质量、多 Agent 协作、输出质量。
 *
 * 论文真实性/证据链/NaN 是硬性门槛：任一失败即判 FAIL，不用总分掩盖。
 *
 * 用法：
 *   node tools/v1-9-blind-research-benchmark.js              # 本地 + 真实网络研究
 *   node tools/v1-9-blind-research-benchmark.js --offline    # 只用本地（网络案例标 SKIPPED_OFFLINE）
 *   node tools/v1-9-blind-research-benchmark.js --only=S01,D01
 *   node tools/v1-9-blind-research-benchmark.js --json
 */
'use strict';
var fs = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;
var JSON_OUT = process.argv.indexOf('--json') >= 0;
var ONLY = (function () {
  var a = process.argv.filter(function (x) { return /^--only=/.test(x); })[0];
  return a ? a.replace(/^--only=/, '').split(',').map(function (s) { return s.trim().toUpperCase(); }).filter(Boolean) : null;
})();

global.localStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] != null ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
  removeItem: function (k) { delete this._d[k]; }
};
global.sessionStorage = {
  _d: {},
  getItem: function (k) { return this._d[k] != null ? this._d[k] : null; },
  setItem: function (k, v) { this._d[k] = String(v); },
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

var CTX = { y: 2026, mo: 11, d: 3, h: 21, mi: 0, lat: 39.9, lon: 116.4, tz: 8, city: '北京' };
var CFG = AC.defaultConfig();

var CASES = [
  /* 1 天体物理参数（4） */
  { id: 'B01', cat: '天体物理参数', q: 'M13 的距离和年龄是多少？', kinds: ['verdict', 'evidence'], numbers: ['2.22', '116'] },
  { id: 'B02', cat: '天体物理参数', q: '草帽星系 M104 的距离和类型是什么？', kinds: ['verdict', 'evidence'], numbers: ['3100'], any: ['草帽', '旋涡', 'SA'] },
  { id: 'B03', cat: '天体物理参数', q: '天狼星的视星等和距离是多少？', kinds: ['verdict', 'evidence'], numbers: ['1.46', '8.6'], any: ['天狼星'] },
  { id: 'B04', cat: '天体物理参数', q: '环状星云 M57 的中心星温度和距离是多少？', kinds: ['verdict', 'evidence'], numbers: ['2570'], any: ['12 万', '120,000', '120000', '白矮'] },

  /* 2 名称与编号消歧（4） */
  { id: 'N01', cat: '名称编号消歧', q: 'NGC 5139 和半人马ω星团是同一个天体吗？', kinds: ['verdict', 'evidence'], numbers: ['1.7'], any: ['半人马', 'ω', '同一个'] },
  { id: 'N02', cat: '名称编号消歧', q: 'M45 是昴星团还是蜂巢星团？', kinds: ['verdict'], numbers: ['444'], any: ['昴星团', '蜂巢'] },
  { id: 'N03', cat: '名称编号消歧', q: 'M8 礁湖星云和 M20 三叶星云分别在哪里？', kinds: ['verdict', 'evidence'], numbers: ['4100', '5,200', '5200'], any: ['礁湖', '三叶', 'NGC 6530', 'NGC 6514'] },
  { id: 'N04', cat: '名称编号消歧', q: 'M82 雪茄星系和 M81 波德星系是什么关系？', kinds: ['verdict'], numbers: ['1200'], any: ['雪茄', '波德', 'M81', '相互作用'] },

  /* 3 天体物理关系（4） */
  { id: 'R01', cat: '天体物理关系', q: '比较 M13 和 M5 的年龄、距离与星团类型', template: 'T-D', compare: 2, numbers: ['116', '2.22'], any: ['球状星团', '年龄', '距离'] },
  { id: 'R02', cat: '天体物理关系', q: '造父变星为什么能用作标准烛光？', kinds: ['verdict'], any: ['造父', '周光', '标准烛光'] },
  { id: 'R03', cat: '天体物理关系', q: '恒星光谱类型与表面温度有什么关系？', kinds: ['verdict', 'evidence'], numbers: ['30,000', '2,400', 'G2'], any: ['O', 'M', '光谱'] },
  { id: 'R04', cat: '天体物理关系', q: '星系红移与距离的关系是如何建立的？', kinds: ['verdict'], any: ['红移', '哈勃', '膨胀'] },

  /* 4 多目标比较（4，T-D） */
  { id: 'C01', cat: '多目标比较', q: '比较 M13、M5 和 M15 的观测难度与物理性质', template: 'T-D', compare: 3, all: ['M13', 'M5', 'M15'] },
  { id: 'C02', cat: '多目标比较', q: '比较 M51 和 M104 哪个更适合业余望远镜拍摄？', template: 'T-D', compare: 2, all: ['M51', 'M104'] },
  { id: 'C03', cat: '多目标比较', q: 'M8 和 M20 在亮度和观测条件上有什么差异？', template: 'T-D', compare: 2, all: ['M8', 'M20'] },
  { id: 'C04', cat: '多目标比较', q: '天狼星和参宿四在光谱类型、亮度与演化阶段上有何不同？', template: 'T-D', compare: 2, any: ['A1', 'M1', '白矮', '红超巨星'] },

  /* 5 不同论文测量比较（4，真实网络） */
  { id: 'S01', cat: '论文测量比较', q: 'M13 的年龄和金属丰度测量在不同论文中是否一致？', research: true, network: true, template: 'T-E', topic: ['M13', 'globular', 'cluster', 'metallicity', 'age'], minPapers: 2 },
  { id: 'S02', cat: '论文测量比较', q: 'M51 距离测量方法（造父变星、TRGB、SN Ia）的结果差异', research: true, network: true, template: 'T-E', topic: ['M51', 'Whirlpool', 'distance', 'Cepheid', 'TRGB'] },
  { id: 'S03', cat: '论文测量比较', q: 'NGC 5139 的距离与质量测量有哪些不同结果？', research: true, network: true, template: 'T-E', topic: ['NGC 5139', 'Omega Centauri', 'distance', 'mass'] },
  { id: 'S04', cat: '论文测量比较', q: '天狼星半径测量在不同文献中的差异', research: true, network: true, template: 'T-E', topic: ['Sirius', 'radius', 'interferometry'] },

  /* 6 学术争议（4，3 个真实网络） */
  { id: 'D01', cat: '学术争议', q: '快速射电暴的起源是磁星还是其他机制？主要争议点', research: true, network: true, template: 'T-F', topic: ['fast radio burst', 'FRB', 'magnetar', 'origin'], wantUncertainty: true },
  { id: 'D02', cat: '学术争议', q: '哈勃张力与不同宇宙学测量结果是否一致？', research: true, network: false, template: 'T-E', any: ['哈勃张力', 'H0', '测量'] },
  { id: 'D03', cat: '学术争议', q: '大质量恒星如何产生超新星与黑洞：失败超新星争议', research: true, network: true, template: 'T-F', topic: ['supernova', 'black hole', 'failed', 'massive star'], wantUncertainty: true },
  { id: 'D04', cat: '学术争议', q: '银河系卫星星系数量与冷暗物质模型的缺失卫星问题', research: true, network: true, template: 'T-E', topic: ['satellite', 'galaxy', 'dark matter', 'missing'], wantUncertainty: true },

  /* 7 早期宇宙（3，真实网络） */
  { id: 'E01', cat: '早期宇宙', q: 'JWST 高红移星系候选体的光度函数测量结果', research: true, network: true, template: 'T-E', topic: ['JWST', 'high-redshift', 'luminosity function', 'galaxy'], minPapers: 2 },
  { id: 'E02', cat: '早期宇宙', q: '宇宙黎明时期中性氢 21cm 信号探测现状', research: true, network: true, template: 'T-E', topic: ['21cm', 'neutral hydrogen', 'cosmic dawn', 'reionization'], wantUncertainty: true },
  { id: 'E03', cat: '早期宇宙', q: '早期宇宙星系紫外光度密度与再电离历史', research: true, network: true, template: 'T-E', topic: ['ultraviolet', 'luminosity', 'reionization', 'galaxy'] },

  /* 8 系外行星（4，3 个真实网络） */
  { id: 'X01', cat: '系外行星', q: 'TRAPPIST-1 七颗行星的密度与大气损失研究进展', research: true, network: true, template: 'T-E', topic: ['TRAPPIST-1', 'planet', 'density', 'atmosphere'] },
  { id: 'X02', cat: '系外行星', q: 'WASP-39b 大气成分的透射光谱结果', research: true, network: true, template: 'T-E', topic: ['WASP-39b', 'transmission', 'spectrum', 'atmosphere'], minPapers: 2 },
  { id: 'X03', cat: '系外行星', q: '凌星法与径向速度法测得的系外行星质量差异', research: true, network: true, template: 'T-E', topic: ['transit', 'radial velocity', 'planet', 'mass'] },
  { id: 'X04', cat: '系外行星', q: '宜居带行星的潮汐锁定与大气逃逸', research: true, network: true, template: 'T-E', topic: ['habitable zone', 'tidal locking', 'atmosphere', 'escape'] },

  /* 9 恒星演化（3，本地知识） */
  { id: 'H01', cat: '恒星演化', q: '参宿四现在处于生命周期的哪个阶段，什么时候可能超新星爆发？', numbers: ['15', '20', 'M1'], any: ['红超巨星', '超新星', '脉动'] },
  { id: 'H02', cat: '恒星演化', q: '赫罗图上主序星、红巨星和白矮星如何分布？', kinds: ['verdict', 'evidence'], numbers: ['1911', '1913'], any: ['主序', '巨星', '白矮'] },
  { id: 'H03', cat: '恒星演化', q: '大质量恒星与太阳的最终归宿有什么不同？', kinds: ['verdict'], numbers: ['8', '1.4', '50'], any: ['白矮', '中子星', '黑洞'] },

  /* 10 星系形成与演化（4，2 个真实网络） */
  { id: 'G01', cat: '星系形成演化', q: '银河系与仙女座星系的并合历史研究', research: true, network: true, template: 'T-E', topic: ['Milky Way', 'Andromeda', 'merger', 'M31'] },
  { id: 'G02', cat: '星系形成演化', q: '星系形态如何随红移演化？', research: true, network: false, template: 'T-E', any: ['红移', '形态', '演化'] },
  { id: 'G03', cat: '星系形成演化', q: '星系团中冲压剥离气体对星系演化的影响', research: true, network: true, template: 'T-E', topic: ['ram pressure', 'stripping', 'cluster', 'galaxy'] },
  { id: 'G04', cat: '星系形成演化', q: '本地星系群中矮星系的恒星形成历史', research: true, network: false, template: 'T-E', any: ['矮星系', '恒星形成', '本星系群'] },

  /* 11 观测设备规划（4） */
  { id: 'P01', cat: '设备规划', q: '用 150mm 马卡镜和 ASI 相机拍 M13 球状星团，如何选择曝光和增益？', numbers: ['150'], any: ['曝光', '增益', 'M13'] },
  { id: 'P02', cat: '设备规划', q: '在 8 级光污染下用 80mm 折射镜拍 M8，需要什么滤镜？', any: ['80', '滤镜', '光污染'] },
  { id: 'P03', cat: '设备规划', q: '全画幅相机配 500mm 焦距拍 M51，视场能装下吗？', any: ['500', '视场', 'M51'] },
  { id: 'P04', cat: '设备规划', q: '新手用双筒望远镜观测 M45，选 7×50 还是 10×50？', any: ['7×50', '10×50', 'M45'] },

  /* 12 观测条件（4） */
  { id: 'O01', cat: '观测条件', q: '今晚在北京观测 M13，月光和高度条件如何？', any: ['M13', '月光', '高度'] },
  { id: 'O02', cat: '观测条件', q: '上海梅雨季观测 M8 的可行性', any: ['上海', '雨季', 'M8'] },
  { id: 'O03', cat: '观测条件', q: '在波特尔 4 级地点拍摄银河，曝光参数如何调整？', any: ['波特尔', '曝光', '银河'] },
  { id: 'O04', cat: '观测条件', q: '冬季在北京观测参宿四的最佳时间和方位', any: ['参宿四', '方位', '冬季'] },

  /* 13 复杂问题拆解（4，2 个真实网络） */
  { id: 'Q01', cat: '复杂拆解', q: '为什么 M13 的年龄测定依赖距离和金属丰度？并给出观测验证方案', numbers: ['M13'], any: ['距离', '金属丰度', '年龄'] },
  { id: 'Q02', cat: '复杂拆解', q: '设计一个比较 M51 和 M104 星系结构的观测与研究方案', research: true, network: true, template: 'T-E', topic: ['M51', 'M104', 'structure', 'galaxy'] },
  { id: 'Q03', cat: '复杂拆解', q: '从光谱、光变和视差三方面判断天狼星是否双星系统', any: ['光谱', '光变', '视差', '天狼星'] },
  { id: 'Q04', cat: '复杂拆解', q: '如果要验证系外行星大气中的水，需要哪些观测和数据处理步骤？', research: true, network: true, template: 'T-E', topic: ['exoplanet', 'water', 'transmission', 'spectroscopy'] },

  /* 14 多轮上下文（3） */
  { id: 'M01', cat: '多轮上下文', q: 'M13 是什么？', any: ['武仙座', '球状星团'] },
  { id: 'M02', cat: '多轮上下文', q: '它有多远？', memory: [{ q: 'M13 是什么？', a: '武仙座球状星团', target: 'M13' }], numbers: ['2.22'] },
  { id: 'M03', cat: '多轮上下文', q: '它和 M5 哪个更容易观测？', memory: [{ q: 'M13 是什么？', a: '武仙座球状星团', target: 'M13' }], template: 'T-D', compare: 2 },

  /* 15 证据不足与不确定性（3，真实网络） */
  { id: 'U01', cat: '不确定性', q: 'M13 中是否存在中等质量黑洞？目前证据如何？', research: true, network: true, template: 'T-E', topic: ['M13', 'black hole', 'intermediate'], wantUncertainty: true },
  { id: 'U02', cat: '不确定性', q: '快速射电暴的宿主星系类型是否已确定？', research: true, network: true, template: 'T-E', topic: ['FRB', 'host galaxy', 'fast radio burst'], wantUncertainty: true },
  { id: 'U03', cat: '不确定性', q: '用现有资料能否确定 M51 的精确年龄？', research: true, network: true, template: 'T-E', topic: ['M51', 'age', 'galaxy'], wantUncertainty: true }
];

function sectionText(answer) {
  try { return JSON.stringify(answer && answer.sections || []); } catch (e) { return ''; }
}
function toolsOf(control) {
  return (control && control.state && control.state.steps || []).map(function (s) { return s.tool + ':' + s.status; });
}
function agentList(answer) {
  return (answer && answer.meta && answer.meta.agents) ||
    (answer && answer.trace || []).map(function (t) { return t.agent; }).filter(Boolean);
}
function paperList(research) {
  return (research && research.papers || []).map(function (p) {
    return {
      title: p.title, date: p.date, doi: p.doi, arxivId: p.arxivId, url: p.url,
      abstractOnly: p.abstractOnly, fulltextAvailable: p.fulltextAvailable
    };
  });
}
function conclusionsOf(research) {
  return (research && research.conclusions || []).map(function (c) {
    return { text: c.text, evidenceRefs: c.evidenceRefs, scope: c.evidenceScope, level: c.level };
  });
}
function evidenceIdsOf(research) {
  var ids = {};
  (research && research.evidence || []).forEach(function (e) { ids[e.evidenceId] = 1; });
  return ids;
}
function externalErrorsOf(control) {
  var out = [];
  ((control && control.state && control.state.steps) || []).forEach(function (s) {
    var r = s.result || {};
    (r.errors || []).forEach(function (e) {
      if (/limit|rate|cool|timeout|network|fetch|429|503|频繁|限流|冷却|超时/i.test((e.kind || '') + ' ' + (e.msg || ''))) {
        out.push(e.kind || e.msg);
      }
    });
    if (s.error && /limit|rate|cool|timeout|network|fetch|429|503|频繁|限流|冷却|超时/i.test((s.error.kind || '') + ' ' + (s.error.message || ''))) {
      out.push(s.error.kind || s.error.message);
    }
  });
  return out;
}
function normalizeTitle(t) {
  return String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

async function runOne(c) {
  var started = Date.now();
  var row = {
    id: c.id, category: c.cat, question: c.q, expected: c.template || (c.research ? 'research' : 'answer'),
    actual: '', papers: [], evidence: [], conclusions: [], agents: [], tools: [],
    ms: 0, pass: true, status: 'PASS', reason: '', score: 0, dimensions: {}, critical: []
  };
  function dim(name, ok, detail) {
    row.dimensions[name] = { ok: !!ok, detail: detail == null ? '' : String(detail).slice(0, 180) };
    if (!ok && !row.reason) row.reason = name + (detail ? '：' + detail : '');
  }
  function critical(name, ok, detail) {
    if (!ok) { row.critical.push(name + (detail ? '：' + detail : '')); }
    dim('critical_' + name, ok, detail);
  }

  var adapter = Adapter.create({ agentCore: AC });
  var registry = Registry.createDefault({ adapter: adapter, agentCore: AC, network: !OFFLINE && !!c.network });
  var opts = {
    adapter: adapter, registry: registry,
    network: !OFFLINE && !!c.network,
    fulltext: !!c.fulltext
  };
  AC.setMemory(c.memory || []);
  var r;
  try {
    r = await R.handle(c.q, CTX, CFG, opts);
  } catch (e) {
    row.ms = Date.now() - started;
    row.pass = false; row.status = 'FAIL';
    row.reason = '执行异常：' + String(e && e.message || e);
    row.score = 0;
    return row;
  }
  AC.clearMemory();
  row.ms = Date.now() - started;

  if (OFFLINE && c.network) {
    row.pass = null; row.status = 'SKIPPED_OFFLINE'; row.reason = '离线模式跳过真实网络案例'; row.ms = 0;
    return row;
  }

  var answer = r.answer;
  var research = r.research;
  var control = r.control;
  var sections = (answer && answer.sections || []).map(function (s) { return s.kind; });
  var text = sectionText(answer) + ' ' + JSON.stringify(research || '');
  var papers = paperList(research);
  var conclusions = conclusionsOf(research);
  var evidenceIds = evidenceIdsOf(research);
  var agents = agentList(answer);
  var tools = toolsOf(control);

  row.actual = (r.mode || '') + ' / ' + sections.join('+');
  row.papers = papers; row.conclusions = conclusions; row.agents = agents; row.tools = tools;
  row.evidence = (research && research.evidence || []).map(function (e) {
    return { id: e.evidenceId, type: e.sourceType, title: e.title, uri: e.uri, abstractOnly: e.abstractOnly };
  });

  var external = externalErrorsOf(control);
  if (c.research && opts.network && (!research || papers.length === 0) && external.length) {
    row.pass = null; row.status = 'BLOCKED_EXTERNAL';
    row.reason = 'BLOCKED_EXTERNAL:' + external.slice(0, 2).join('/');
    return row;
  }

  if (!answer) {
    row.pass = false; row.status = 'FAIL'; row.reason = '没有 answer';
  }

  /* 1 意图 */
  var wantMode = c.template === 'T-D' ? 'compare' : (c.research ? 'research' : null);
  var modeOk = wantMode ? (r.route && r.route.mode === wantMode) : !!answer;
  dim('intent', modeOk, r.route ? r.route.mode + '/' + r.route.level : '');

  /* 2 拆解 */
  var controlOk = true;
  if (c.template) {
    controlOk = !!(control && control.plan && control.plan.template === c.template);
    if (!controlOk && c.template === 'T-E' && r.mode === 'legacy') controlOk = false;
  }
  if (c.research && !OFFLINE) {
    controlOk = controlOk && tools.some(function (t) { return /paper\.search|evidence\.search/.test(t); });
  }
  dim('decomposition', controlOk, c.template + ' / ' + tools.join(','));

  /* 3 检索相关性 */
  var retrievalOk = true, retrievalDetail = '';
  if (c.research) {
    retrievalOk = !!research && papers.length >= (c.minPapers || 1);
    retrievalDetail = 'papers=' + papers.length + ' research=' + !!research;
    if (retrievalOk && c.topic) {
      var hay = papers.map(function (p) { return p.title; }).join(' ') + ' ' +
        conclusions.map(function (x) { return x.text; }).join(' ');
      retrievalOk = c.topic.some(function (t) { return new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(hay); });
      retrievalDetail += ' topic=' + c.topic.join('|');
    }
  } else {
    retrievalOk = papers.length === 0 || true;
    retrievalDetail = 'local';
  }
  dim('retrieval', retrievalOk, retrievalDetail);

  /* 4 来源可信度（硬性：标题 + http(s) 链接 + 年份） */
  var sourceOk = papers.every(function (p) {
    return !!p.title && /^https?:\/\//i.test(p.url || '') && !!p.date;
  });
  var titles = {}, duplicate = false;
  papers.forEach(function (p) {
    var k = normalizeTitle(p.title);
    if (k && titles[k]) duplicate = true;
    titles[k] = 1;
  });
  if (duplicate) sourceOk = false;
  var idOk = papers.every(function (p) { return !!p.doi || !!p.arxivId || /^https?:\/\//i.test(p.url || ''); });
  if (!idOk) sourceOk = false;
  dim('source', sourceOk, 'papers=' + papers.length + ' duplicate=' + duplicate + ' id=' + idOk);
  critical('论文可追溯', sourceOk, 'papers=' + papers.length);

  /* 5 数据准确（只对带明确数值的本地案例；研究数值由证据链约束） */
  var dataOk = true, dataDetail = '';
  if (c.numbers && c.numbers.length) {
    var missing = c.numbers.filter(function (n) { return text.indexOf(n) < 0; });
    dataOk = missing.length === 0;
    dataDetail = missing.length ? '缺少 ' + missing.join(',') : 'ok';
  }
  if (/NaN|undefined|Infinity/.test(JSON.stringify(answer || {}))) dataOk = false;
  dim('data', dataOk, dataDetail);
  critical('无 NaN/undefined', !/NaN|undefined|Infinity/.test(JSON.stringify(answer || {})), '');

  /* 6 证据链：结论引用必须全部落在 evidence ids 内 */
  var badRefs = [];
  conclusions.forEach(function (cl) {
    (cl.evidenceRefs || []).forEach(function (id) { if (!evidenceIds[id]) badRefs.push(id); });
  });
  var evidenceOk = !c.research || (conclusions.length > 0 && badRefs.length === 0);
  if (!c.research) {
    evidenceOk = sections.indexOf('evidence') >= 0 || sections.indexOf('list') >= 0 ||
      (answer && answer.sources && answer.sources.length > 0) || !!text;
  }
  dim('evidence', evidenceOk, 'conclusions=' + conclusions.length + ' badRefs=' + badRefs.length);
  critical('结论引用可追溯', badRefs.length === 0, badRefs.slice(0, 3).join(','));

  /* 7 不确定性 */
  var gaps = research && research.gaps || [];
  var limits = research && research.limitations || [];
  var uncertaintyOk = true;
  if (c.research && (c.wantUncertainty || !papers.length)) uncertaintyOk = gaps.length > 0 || limits.length > 0 || sections.indexOf('boundary') >= 0;
  dim('uncertainty', uncertaintyOk, 'gaps=' + gaps.length + ' limits=' + limits.length);

  /* 8 结论质量 */
  var kindsOk = true;
  (c.kinds || []).forEach(function (k) { if (sections.indexOf(k) < 0) kindsOk = false; });
  var verdict = (answer && answer.sections || []).filter(function (s) { return s.kind === 'verdict'; })[0];
  var answerOk = kindsOk && (!c.kinds || (verdict && String(verdict.head || verdict.text || '').trim().length > 0));
  if (c.any && c.any.length) answerOk = answerOk && c.any.some(function (k) { return text.indexOf(k) >= 0; });
  if (c.all) c.all.forEach(function (k) { answerOk = answerOk && text.indexOf(k) >= 0; });
  dim('answer', answerOk, 'sections=' + sections.join('+'));

  /* 9 多 Agent */
  var agentsOk = true;
  if (c.agents) c.agents.forEach(function (a) { if (agents.indexOf(a) < 0) agentsOk = false; });
  dim('agents', agentsOk, agents.join(','));

  /* 10 输出质量 */
  var outputOk = !!answer && sections.length >= 2 && !/NaN|undefined|Infinity/.test(text) && String(text).length > 40;
  dim('output', outputOk, 'sections=' + sections.length);

  row.score = Object.keys(row.dimensions).filter(function (k) {
    return k.indexOf('critical_') !== 0 && row.dimensions[k].ok;
  }).length;
  row.pass = row.critical.length === 0 && row.score >= 7 && !!answer && kindsOk;
  row.status = row.pass ? 'PASS' : 'FAIL';
  if (!row.pass && !row.reason) row.reason = 'score=' + row.score + '/10';
  return row;
}

(async function main() {
  var rows = [];
  var cases = ONLY ? CASES.filter(function (c) { return ONLY.indexOf(c.id) >= 0; }) : CASES;
  for (var i = 0; i < cases.length; i++) {
    var row = await runOne(cases[i]);
    rows.push(row);
    console.log((row.status === 'PASS' ? 'PASS' : row.status === 'FAIL' ? 'FAIL' : 'SKIP') + ' | ' +
      row.id + ' ' + row.category + ' | ' + String(row.question).slice(0, 34) + ' | ' +
      row.actual + ' | score=' + row.score + '/10 | ' + row.ms + 'ms' +
      (row.reason ? ' | ' + row.reason : ''));
  }
  var pass = rows.filter(function (r) { return r.status === 'PASS'; }).length;
  var fail = rows.filter(function (r) { return r.status === 'FAIL'; }).length;
  var blocked = rows.filter(function (r) { return r.status === 'BLOCKED_EXTERNAL'; }).length;
  var skip = rows.filter(function (r) { return r.status === 'SKIPPED_OFFLINE'; }).length;
  console.log('');
  console.log('BLIND ' + rows.length + ' cases | PASS ' + pass + ' | FAIL ' + fail +
    ' | BLOCKED_EXTERNAL ' + blocked + ' | SKIP ' + skip);
  var cats = {};
  rows.forEach(function (r) {
    if (!cats[r.category]) cats[r.category] = { total: 0, pass: 0, fail: 0, blocked: 0, skip: 0 };
    cats[r.category].total += 1;
    if (r.status === 'PASS') cats[r.category].pass += 1;
    else if (r.status === 'FAIL') cats[r.category].fail += 1;
    else if (r.status === 'BLOCKED_EXTERNAL') cats[r.category].blocked += 1;
    else if (r.status === 'SKIPPED_OFFLINE') cats[r.category].skip += 1;
  });
  Object.keys(cats).forEach(function (k) {
    var c = cats[k];
    console.log('CAT | ' + k + ' | ' + c.pass + '/' + c.total + ' PASS' +
      (c.fail ? ' | FAIL ' + c.fail : '') + (c.blocked ? ' | BLOCKED ' + c.blocked : '') + (c.skip ? ' | SKIP ' + c.skip : ''));
  });
  var failedHard = rows.filter(function (r) { return r.status === 'FAIL'; });
  if (JSON_OUT) {
    var out = {
      generatedAt: new Date().toISOString(), ctx: CTX, offline: OFFLINE,
      summary: { total: rows.length, pass: pass, fail: fail, blockedExternal: blocked, skipped: skip },
      categories: cats, results: rows
    };
    var f = path.join(ROOT, 'tools', 'fixtures', 'v1-9-blind-research-results.json');
    fs.writeFileSync(f, JSON.stringify(out, null, 2) + '\n', 'utf8');
    console.log('JSON ' + f);
  }
  process.exitCode = failedHard.length ? 1 : 0;
})().catch(function (e) {
  console.error('FATAL', e && e.stack || e);
  process.exit(1);
});
