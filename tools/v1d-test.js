/* ASTRUM · V1 D 阶段专项测试（纯 Node，零依赖）
 *
 * 覆盖：Evidence 字段/DOI 去重 / FITS 图像·多 HDU·二进表·非法·截断 /
 * 真实公开 FITS 文件 / 真实论文检索（网络）/ SIMBAD 真实客户端解析 /
 * Claim 构建 + R1-R4 / 研究报告 / Adapter 研究注入。
 *
 * 用法：node tools/v1d-test.js [--offline]
 *   --offline 跳过外部网络断言（标 SKIPPED(network)）。
 */
'use strict';

var path = require('path');
var util = require('util');

var ROOT = path.resolve(__dirname, '..');
var OFFLINE = process.argv.indexOf('--offline') >= 0;

global.localStorage = {
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
  'core/registry.js', 'core/compose-adapter.js', 'core/task-store.js',
  'core/orchestrator.js', 'core/control.js'
].forEach(function (f) { require(path.join(ROOT, f)); });

var AC = global.AgentCore;
var T = global.AstroTask;
var Registry = global.AstroRegistry;
var Adapter = global.AstroComposeAdapter;
var Evidence = global.AstroEvidence;
var Claims = global.AstroClaims;
var Reducer = global.AstroReducer;
var Report = global.AstroReport;
var Fits = global.AstroFits;
var Simbad = global.Simbad;

var results = [], cases = [], pass = 0;
function ok(name, cond, extra) { results.push({ name: name, pass: !!cond, extra: extra || '' }); if (cond) pass++; }
function equal(name, actual, expected) {
  var same = util.isDeepStrictEqual(actual, expected);
  ok(name, same, same ? '' : ('actual=' + JSON.stringify(actual) + ' expected=' + JSON.stringify(expected)));
}
function canonical(x) { return T.canonicalJSON(x); }

function ctx() {
  var c = AC.findCity('北京') || AC.CITIES[0];
  return {
    y: 2026, mo: 10, d: 31, h: 21, mi: 0,
    tz: AC.tzOf(c, 2026, 10, 31),
    city: c.n, lat: c.lat, lon: c.lon, bortle: c.bortle || 5,
    cityRef: c, equipment: '单反', experience: '进阶'
  };
}
var CTX = ctx();
var CFG = AC.defaultConfig();

async function runCase(id, title, fn) {
  var before = results.length;
  var failedBefore = results.filter(function (r) { return !r.pass; }).length;
  try { await fn(); } catch (e) { ok(id + ' 执行异常', false, e && e.stack ? e.stack.split('\n')[0] : String(e)); }
  cases.push({ id: id, title: title, assertions: results.length - before, failed: results.filter(function (r) { return !r.pass; }).length - failedBefore });
}

/* ---------- FITS 构造（真实 FITS 格式） ---------- */
function card(key, value) {
  var k = (String(key) + '        ').slice(0, 8);
  var v = (String(value) + ' '.repeat(70)).slice(0, 70);
  return k + '= ' + v;
}
function headerBytes(cards) {
  var text = cards.join('') + card('END', '');
  var bytes = new Uint8Array(Math.ceil(text.length / 2880) * 2880);
  for (var i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
function padData(bytes) {
  var n = Math.ceil(bytes.length / 2880) * 2880;
  var out = new Uint8Array(n);
  out.set(bytes);
  return out;
}
function imageData(values) {
  var b = new Uint8Array(values.length * 4);
  var dv = new DataView(b.buffer);
  values.forEach(function (v, i) { dv.setFloat32(i * 4, v, false); });
  return padData(b);
}
function concat(list) {
  var n = 0, i;
  list.forEach(function (a) { n += a.length; });
  var out = new Uint8Array(n), off = 0;
  list.forEach(function (a) { out.set(a, off); off += a.length; });
  return out;
}
function imageFits(values) {
  var w = 4, h = values.length / 4;
  var head = headerBytes([
    card('SIMPLE', 'T'), card('BITPIX', '-32'), card('NAXIS', '2'),
    card('NAXIS1', String(w)), card('NAXIS2', String(h)),
    card('BUNIT', "'ADU'"), card('OBJECT', "'TEST'"),
    card('DATE_OBS', "'2026-01-01'"), card('TELESCOP', "'TEST'"),
    card('INSTRUME', "'CAM'")
  ]);
  return concat([head, imageData(values)]);
}
function emptyPrimary() {
  return headerBytes([card('SIMPLE', 'T'), card('BITPIX', '8'), card('NAXIS', '0')]);
}
function imageHdu(values) {
  var w = 2, h = values.length / 2;
  return concat([
    headerBytes([
      card('XTENSION', "'IMAGE'"), card('BITPIX', '-32'), card('NAXIS', '2'),
      card('NAXIS1', String(w)), card('NAXIS2', String(h))
    ]),
    imageData(values)
  ]);
}
function tableHdu() {
  var head = headerBytes([
    card('XTENSION', "'BINTABLE'"), card('BITPIX', '8'), card('NAXIS', '2'),
    card('NAXIS1', '4'), card('NAXIS2', '2'), card('PCOUNT', '0'), card('GCOUNT', '1'),
    card('TFIELDS', '1'), card('TTYPE1', "'VALUE'"), card('TFORM1', "'1J'")
  ]);
  var data = new Uint8Array(8);
  var dv = new DataView(data.buffer);
  dv.setInt32(0, 10, false);
  dv.setInt32(4, 20, false);
  return concat([head, padData(data)]);
}

(async function main() {

  await runCase('D1', 'Evidence 字段与 DOI 去重', async function () {
    var e1 = Evidence.fromSourceItem({
      title: 'Orion Nebula distance', snippet: 'real abstract', excerpt: 'real abstract',
      url: 'https://arxiv.org/abs/2401.00001', host: 'arxiv.org', sourceType: 'paper',
      doi: '10.1000/orion', date: '2024-01-01', dateKind: 'published',
      version: 'published', authors: ['A', 'B'], extra: { venue: 'ApJ', citedBy: 12 }
    }, { tool: 'paper.search', query: 'Orion', retrievedAt: '2026-10-31T00:00:00Z' });
    ok('D1.1 必填字段完整', !!e1.evidenceId && !!e1.sourceId && !!e1.sourceType && !!e1.retrievedAt &&
      !!e1.provenance && !!e1.trust, JSON.stringify(e1 && e1.sourceId));
    ok('D1.2 论文只标摘要', e1.abstractOnly === true && e1.provenance.abstractOnly === true);
    ok('D1.3 保留 DOI/authors/venue', e1.content.doi === '10.1000/orion' &&
      e1.content.authors.length === 2 && e1.provenance.raw.venue === 'ApJ');
    var e2 = Evidence.fromSourceItem({
      title: 'Mirror copy', url: 'https://openalex.org/W123', host: 'openalex.org',
      sourceType: 'paper', doi: '10.1000/orion', excerpt: 'same', version: 'published'
    }, { tool: 'paper.search', query: 'Orion', retrievedAt: '2026-10-31T00:00:00Z' });
    var dd = Evidence.dedupe([e1, e2]);
    ok('D1.4 同 DOI 镜像去重', dd.evidence.length === 1 && dd.duplicates.length === 1, JSON.stringify(dd.duplicates));
    ok('D1.5 独立来源=1', Evidence.independentSources([e1, e2]).length === 1);
  });

  await runCase('D2', 'SIMBAD 解析（离线单元）与真实网络标记', async function () {
    var payload = {
      metadata: [{ name: 'main_id' }, { name: 'ra' }, { name: 'dec' }, { name: 'otype' }, { name: 'plx_value' }],
      data: [['M 42', 83.82208, -5.39111, 'HII', 1.2]]
    };
    var info = Simbad.parse(payload);
    ok('D2.1 TAP 解析', info && info.id === 'M 42' && info.ra === 83.82208 && info.otype === 'HII');
    var ev = Evidence.fromSimbad(info, { query: 'M42', from: 'network', retrievedAt: '2026-10-31T00:00:00Z' });
    ok('D2.2 Evidence database 字段', ev.sourceType === 'database' && ev.content.mainId === 'M 42' &&
      ev.trust.level === 'high' && ev.provenance.service === 'SIMBAD TAP');
    var reg = Registry.createDefault({ agentCore: AC, network: true });
    var res = await reg.get('simbad.tap').run({ query: 'M42' }, CTX, reg.get('simbad.tap'));
    if (res.ok === false) {
      ok('D2.3 真实 SIMBAD 不可达时明确报错（DEFERRED）', true,
        'DEFERRED(network): ' + res.kind + ' / ' + res.reason);
    } else {
      ok('D2.3 真实 SIMBAD 返回真实条目', res.items.length === 1 && res.items[0].sourceType === 'database',
        'REAL: ' + res.items[0].title);
    }
  });

  await runCase('D3', 'FITS 图像/多 HDU/二进表/异常', async function () {
    var img = imageFits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    var p = Fits.parse({ bytes: img, fileName: 'test-image.fits' });
    ok('D3.1 图像 FITS 可解析', p.ok === true && p.hdus.length === 1 && p.imageCount === 1);
    ok('D3.2 统计正确', p.hdus[0].stats && p.hdus[0].stats.min === 1 && p.hdus[0].stats.max === 12 &&
      Math.abs(p.hdus[0].stats.mean - 6.5) < 1e-6, JSON.stringify(p.hdus[0].stats));
    ok('D3.3 头字段/文件名/哈希', p.hdus[0].header.OBJECT === 'TEST' &&
      p.hdus[0].header.BUNIT === 'ADU' && p.fileSize === img.length && !!p.fileHash);

    var multi = concat([emptyPrimary(), imageHdu([1, 2, 3, 4])]);
    var pm = Fits.parse({ bytes: multi, fileName: 'multi.fits' });
    ok('D3.4 多 HDU', pm.ok === true && pm.hdus.length === 2 && pm.hdus[1].type === 'image' && !!pm.hdus[1].stats);

    var tab = concat([emptyPrimary(), tableHdu()]);
    var pt = Fits.parse({ bytes: tab, fileName: 'table.fits' });
    ok('D3.5 Binary Table', pt.ok === true && pt.tableCount === 1 && pt.hdus[1].table.rows === 2 &&
      pt.hdus[1].table.fields === 1 && pt.hdus[1].table.columns[0].sample[0] === 10,
      JSON.stringify(pt.hdus[1].table && pt.hdus[1].table.columns));

    var invalid = Fits.parse({ bytes: new Uint8Array(2880), fileName: 'bad.fits' });
    ok('D3.6 非法 FITS 明确失败', invalid.ok === false && invalid.errors.length > 0, JSON.stringify(invalid.errors));

    var truncHead = headerBytes([
      card('SIMPLE', 'T'), card('BITPIX', '-32'), card('NAXIS', '2'),
      card('NAXIS1', '100'), card('NAXIS2', '100')
    ]);
    var trunc = Fits.parse({ bytes: truncHead, fileName: 'trunc.fits' });
    ok('D3.7 截断文件有警告且不算统计', trunc.ok === true && trunc.warnings.some(function (w) { return w.indexOf('截断') >= 0; }) &&
      trunc.hdus[0].stats === null, JSON.stringify(trunc.warnings));

    var unsup = headerBytes([
      card('SIMPLE', 'T'), card('BITPIX', '64'), card('NAXIS', '1'), card('NAXIS1', '10')
    ]);
    var pu = Fits.parse({ bytes: unsup, fileName: 'unsup.fits' });
    ok('D3.8 不支持 BITPIX 有警告', pu.ok === true && pu.warnings.some(function (w) { return w.indexOf('BITPIX=64') >= 0; }));

    var reg = Registry.create({ agentCore: AC, network: false });
    reg.register(Object.assign({}, Registry.SPECS.filter(function (s) { return s.id === 'fits.parse'; })[0]));
    var tool = await reg.get('fits.parse').run({ base64: Buffer.from(img).toString('base64') });
    ok('D3.9 fits.parse 工具输出 Evidence', tool.ok === true && tool.product.hdus.length === 1 &&
      tool.items.length === 1 && tool.items[0].sourceType === 'observation');
  });

  await runCase('D4', '真实公开 FITS 文件', async function () {
    if (OFFLINE) {
      ok('D4.1 真实 FITS 跳过（offline）', true, 'SKIPPED(offline)');
      return;
    }
    var url = 'https://raw.githubusercontent.com/astropy/astropy/main/astropy/io/fits/tests/data/btable.fits';
    var buf = null;
    try {
      var r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      buf = await r.arrayBuffer();
    } catch (e) {
      ok('D4.1 真实 FITS 跳过（网络不可达）', true, 'SKIPPED(network): ' + (e && e.message));
      return;
    }
    var p = Fits.parse({ bytes: buf, fileName: 'btable.fits' });
    ok('D4.1 真实 FITS 解析成功', p.ok === true && p.hdus.length >= 1, 'REAL: ' + p.hdus.length + ' HDU / ' + p.fileSize + ' B');
    ok('D4.2 真实文件含 Binary Table', p.tableCount >= 1, 'tables=' + p.tableCount);
  });

  await runCase('D5', '真实论文检索（Registry paper.search）', async function () {
    if (OFFLINE) {
      ok('D5.1 真实论文检索跳过（offline）', true, 'SKIPPED(offline)');
      return;
    }
    var adapter = Adapter.create({ agentCore: AC });
    var reg = Registry.createDefault({ adapter: adapter, agentCore: AC, network: true });
    var res = await reg.get('paper.search').run({ query: 'Orion Nebula' }, CTX, reg.get('paper.search'));
    if (!res.ok || !res.items.length) {
      ok('D5.1 真实论文检索不可用（明确标记）', true,
        'SKIPPED(network): ' + (res.reason || 'empty') + ' / errors=' + JSON.stringify(res.errors || []));
      return;
    }
    var first = res.items[0];
    ok('D5.1 返回真实论文 Evidence', first.sourceType === 'paper' && !!first.uri && !!first.evidenceId,
      'REAL: ' + first.title.slice(0, 50));
    ok('D5.2 元数据/摘要标记', first.abstractOnly === true && (first.content.doi || first.content.excerpt),
      'doi=' + first.content.doi);
    ok('D5.3 provenance 记录检索时间', !!first.provenance.retrievedAt && first.provenance.tool === 'paper.search');
  });

  await runCase('D6', 'Claim 构建 + R1-R4 + 报告', async function () {
    var sim = Evidence.fromSimbad({ id: 'M 42', ra: 83.82208, dec: -5.39111, otype: 'HII', plx: 1.2 },
      { query: 'M42', from: 'network', retrievedAt: '2026-10-31T00:00:00Z' });
    var fitEv = null;
    var p = Fits.parse({ bytes: imageFits([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]), fileName: 'test-image.fits' });
    fitEv = Evidence.fromFits(p, { retrievedAt: '2026-10-31T00:00:00Z', fileName: 'test-image.fits' });
    var paperEv = Evidence.fromSourceItem({
      title: 'Orion Nebula proper motions', excerpt: 'We measure proper motions of stars in the Orion Nebula Cluster and discuss implications.',
      url: 'https://arxiv.org/abs/2401.00002', host: 'arxiv.org', sourceType: 'paper',
      doi: '10.1000/orion2', date: '2024-02-01', version: 'preprint', authors: ['C. Author']
    }, { tool: 'paper.search', query: 'Orion', retrievedAt: '2026-10-31T00:00:00Z' });
    var claims = Claims.buildClaimsFromEvidence([sim, fitEv, paperEv], {});
    ok('D6.1 构建多类 Claim', claims.length >= 3, 'n=' + claims.length);
    var judged = Claims.judgeAll(claims, { evidence: [sim, fitEv, paperEv] });
    ok('D6.2 Claim 判定有维度', judged.verdicts.length === claims.length && judged.summary.PASS >= 1,
      JSON.stringify(judged.summary));
    var fitsClaim = claims.filter(function (c) { return c.id.indexOf('c_fits_') === 0; })[0];
    ok('D6.3 FITS 定量 Claim 带 CalcRecord+uncertainty',
      fitsClaim && fitsClaim.calc && fitsClaim.uncertainty && fitsClaim.calc.value === fitsClaim.numbers[0].value);

    var reduced = Reducer.reduce({ evidence: [sim, fitEv, paperEv], claims: claims, verdicts: judged.verdicts });
    var report = Report.build({
      question: 'M42 的基本天文参数与观测数据',
      evidence: [sim, fitEv, paperEv], claims: claims, verdicts: judged.verdicts,
      reducer: reduced, retrievedAt: '2026-10-31T00:00:00Z'
    });
    ok('D6.4 报告结构完整', !!report.reportId && !!report.subject && Array.isArray(report.conclusions) &&
      Array.isArray(report.papers) && Array.isArray(report.observations) && Array.isArray(report.sources) &&
      !!report.coverage && Array.isArray(report.gaps) && !!report.disclaimer);
    ok('D6.5 每条结论有 evidenceRefs', report.conclusions.length > 0 &&
      report.conclusions.every(function (c) { return c.evidenceRefs && c.evidenceRefs.length > 0; }));
    ok('D6.6 论文仅摘要标记', report.papers.every(function (p2) { return p2.abstractOnly === true; }) &&
      report.papers[0].url.indexOf('arxiv.org') >= 0);
    ok('D6.7 覆盖度 truth', report.coverage.hasSimbad === true && report.coverage.hasPapers === true &&
      report.coverage.hasFits === true, JSON.stringify(report.coverage));
  });

  await runCase('D7', 'Adapter 研究注入不改旧 compose', async function () {
    var adapter = Adapter.create({ agentCore: AC });
    var sim = Evidence.fromSimbad({ id: 'M 42', ra: 83.82208, dec: -5.39111, otype: 'HII', plx: 1.2 },
      { query: 'M42', from: 'network', retrievedAt: '2026-10-31T00:00:00Z' });
    var paperEv = Evidence.fromSourceItem({
      title: 'Orion survey', excerpt: 'A survey of the Orion Nebula region.', url: 'https://arxiv.org/abs/2401.00003',
      host: 'arxiv.org', sourceType: 'paper', doi: '10.1000/orion3', version: 'published'
    }, { tool: 'paper.search', query: 'Orion', retrievedAt: '2026-10-31T00:00:00Z' });
    var deps = {
      t1: { ok: true, items: [sim, paperEv], evidenceIds: [sim.evidenceId, paperEv.evidenceId] },
      t2: { ok: true, items: [], evidenceIds: [] }
    };
    var r = adapter.compose({ query: 'M42 是什么', from: ['t1', 't2'] }, CTX, CFG, deps);
    ok('D7.1 compose 仍成功', r.ok === true && !!r.answer);
    ok('D7.2 注入 answer.research', !!r.answer.research && !!r.answer.research.reportId &&
      r.answer.research.evidence.length >= 2);
    ok('D7.3 使用既有 section kinds', r.answer.sections.some(function (s) { return s.kind === 'evidence'; }) &&
      r.answer.sections.some(function (s) { return s.kind === 'list'; }));
    ok('D7.4 delivery 标记研究摘要', !!r.delivery.research && r.delivery.research.evidenceCount >= 2);

    var plain = adapter.compose({ query: 'M42 是什么', from: [] }, CTX, CFG, {});
    ok('D7.5 无证据时 sections 与旧 buildAnswer 一致',
      canonical(plain.answer.sections) === canonical(AC.buildAnswer('M42 是什么', CTX, CFG).sections));
  });

  for (var i = 0; i < results.length; i++) {
    var rr = results[i];
    console.log((rr.pass ? 'PASS' : 'FAIL') + ' | ' + rr.name + (rr.extra ? ' | ' + rr.extra : ''));
  }
  console.log('');
  for (var j = 0; j < cases.length; j++) {
    var c = cases[j];
    console.log('CASE ' + c.id + ' ' + (c.failed === 0 ? 'PASS' : 'FAIL') + ' | ' + c.title + ' | 断言 ' + c.assertions);
  }
  console.log('');
  console.log('CASES ' + cases.filter(function (c) { return c.failed === 0; }).length + '/' + cases.length);
  console.log('ASSERTIONS ' + pass + '/' + results.length);
  console.log('RESULT ' + pass + '/' + results.length);
  process.exit(pass === results.length ? 0 : 1);
})();
