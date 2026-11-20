/* ASTRUM · L1 视觉亮星表离线构建（V2-SKY 阶段 2B）
 *
 * 输入：NASA HEASARC BSC5P 的 TDAT 导出（gzip）。
 *   https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz
 *   许可：美国政府作品（公有领域），见 data.gov 记录
 *   https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw
 *
 * 输出：data/sky-stars-l1.js（window.SKY_STARS_L1），7 字节/星的紧凑二进制 + base64。
 *   每条记录：ra(2B) dec(2B) vmag(1B) bv(1B) cls(1B)
 *
 * 只读原始文件；--check 模式只校验不写文件。
 * 位置为 J2000 几何位置，不施加自行（见 meta.pm）。
 *
 * 用法：
 *   node tools/build-star-data.js --input <path.tdat.gz>
 *   node tools/build-star-data.js --input <path.tdat.gz> --check
 *   node tools/build-star-data.js --input <path.tdat.gz> --no-records --license-evidence <URL>
 *     （--no-records：省略完整 records 字段，保持与现有生产文件同量级体积）
 */
'use strict';

var fs = require('fs');
var zlib = require('zlib');
var crypto = require('crypto');
var path = require('path');

/* 编码参数（改动必须同步 core/sky-star-data.js 的常量） */
var SCALE = {
  ra: 360 / 65536,        /* 0.005493° = 19.8″ */
  dec: 180 / 65535,       /* 0.002747° = 9.9″  */
  magMin: -2.0,
  magMax: 8.0,
  bvMin: -0.5,
  bvMax: 5.8
};
var MAG_STEP = (SCALE.magMax - SCALE.magMin) / 255;
var BV_STEP = (SCALE.bvMax - SCALE.bvMin) / 255;

/* 光谱型首字母 → 1 字节代码；0 = 无 */
var CLS = { O: 1, B: 2, A: 3, F: 4, G: 5, K: 6, M: 7, W: 8, S: 9, C: 10, D: 11, N: 12, R: 13, T: 14, Y: 15 };

var WANT = ['name', 'alt_name', 'hr', 'ra', 'dec', 'vmag', 'bv_color', 'spect_type'];

/* HEASARC BSC5P 说明中明确列为“获得 HR 编号的非恒星对象”的 14 个 HR。
 * 只有当这些 HR 同时缺失 V 星等时，才作为“非恒星对象”显式排除并单独记账；
 * 若它们带有星等，说明输入与官方说明不一致，必须拒绝并要求人工审查。
 * 来源：https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw */
var NONSTELLAR_HR = [92, 95, 182, 1057, 1841, 2472, 2496, 3515, 3671, 6309, 6515, 7189, 7539, 8296];

function readAny(p) {
  var buf = fs.readFileSync(p);
  /* gzip magic 1f 8b */
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
  return buf;
}

function parseHeaderFieldLines(text) {
  var lines = text.split('\n');
  var names = [], meta = {};
  for (var i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '<DATA>') break;
    var m = /^field\[([a-z0-9_]+)\]\s*=\s*/i.exec(lines[i].trim());
    if (m) names.push(m[1].toLowerCase());
    var mm = /^([a-z_]+)\s*=\s*(.*)$/i.exec(lines[i].trim());
    if (mm) meta[mm[1].toLowerCase()] = mm[2].trim();
  }
  return { names: names, meta: meta };
}

function parseRows(text, fieldCount) {
  var lines = text.split('\n');
  var rows = [], inData = false, started = false, ended = false, nonDataRows = 0;
  var structureErrors = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].replace(/\r$/, ''), t = l.trim();
    if (t === '<DATA>') {
      if (started) structureErrors.push({ line: i + 1, reason: 'duplicate DATA marker' });
      started = true; inData = true; nonDataRows++; continue;
    }
    if (t === '<END>') {
      if (!inData) structureErrors.push({ line: i + 1, reason: 'unexpected END marker' });
      ended = true; inData = false; nonDataRows++; continue;
    }
    if (!inData) {
      if (ended && t && t.charAt(0) !== '#') structureErrors.push({ line: i + 1, reason: 'content after END marker' });
      nonDataRows++; continue;
    }
    if (!t || t.charAt(0) === '#') { nonDataRows++; continue; }
    var fields = l.split('|');
    /* TDAT 使用可选的行尾分隔符；只移除声明字段数以外的一个空项。 */
    if (fields.length === fieldCount + 1 && fields[fields.length - 1].trim() === '') fields.pop();
    rows.push({ fields: fields, line: i + 1 });
  }
  if (!started) structureErrors.push({ line: null, reason: 'missing DATA marker' });
  if (!ended) structureErrors.push({ line: null, reason: 'missing END marker' });
  return { rows: rows, totalLines: lines.length, nonDataRows: nonDataRows, structureErrors: structureErrors };
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

function num(v) {
  var s = v == null ? '' : String(v).trim();
  if (!s) return { value: null, reason: 'missing' };
  if (/^[+-]?(?:Infinity|NaN)$/i.test(s)) return { value: null, reason: 'non_finite' };
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s)) return { value: null, reason: 'invalid' };
  var x = Number(s);
  return isFinite(x) ? { value: x, reason: null } : { value: null, reason: 'non_finite' };
}

function buildRec(out, o, star) {
  var ra = clamp(Math.round(star.ra / SCALE.ra), 0, 65535);
  var dec = clamp(Math.round((star.dec + 90) / SCALE.dec), 0, 65535);
  out[o] = ra & 0xff; out[o + 1] = (ra >> 8) & 0xff;
  out[o + 2] = dec & 0xff; out[o + 3] = (dec >> 8) & 0xff;
  var m = clamp(Math.round((star.mag - SCALE.magMin) / MAG_STEP), 0, 255);
  out[o + 4] = m;
  var bv = star.bv == null ? 255 : clamp(Math.round((star.bv - SCALE.bvMin) / BV_STEP), 0, 254);
  out[o + 5] = bv;
  out[o + 6] = star.cls || 0;
}

function main() {
  var argv = process.argv.slice(2);
  var input = null, check = false, output = null, licenseEvidence = null, noRecords = false;
  for (var i = 0; i < argv.length; i++) {
    if (argv[i] === '--input') input = argv[++i];
    else if (argv[i] === '--check') check = true;
    else if (argv[i] === '--output') output = argv[++i];
    else if (argv[i] === '--license-evidence') licenseEvidence = argv[++i];
    else if (argv[i] === '--no-records') noRecords = true;
  }
  if (!input) input = path.join(__dirname, 'fixtures', 'star-raw', 'heasarc_bsc5p.tdat.gz');
  if (!fs.existsSync(input)) {
    console.error('FAIL 找不到输入文件：' + input);
    console.error('下载：https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz');
    process.exit(2);
  }

  var raw = readAny(input);
  var text = raw.toString('latin1');
  var h = parseHeaderFieldLines(text);
  var names = h.names;
  var idx = {};
  names.forEach(function (n, i) { idx[n] = i; });
  WANT.forEach(function (k) {
    if (idx[k] === undefined) { console.error('FAIL 缺少字段：' + k); process.exit(3); }
  });

  var parsed = parseRows(text, names.length), rows = parsed.rows;
  var stars = [], skipped = 0, rejected = [], excluded = [], seenHr = {};
  var stats = { count: 0, noBV: 0, noSpect: 0, magMin: 99, magMax: -99 };
  var diagnostics = {
    totalLines: parsed.totalLines, nonDataRows: parsed.nonDataRows, dataRows: rows.length,
    accepted: 0, rejected: 0, excluded: 0,
    legalMissing: { bv_color: 0, spect_type: 0 },
    reasonCounts: {}, structureErrors: parsed.structureErrors
  };
  rows.forEach(function (row) {
    var v = row.fields, reasons = [];
    function issue(field, reason, value) {
      reasons.push({ field: field, reason: reason, value: value == null ? null : String(value) });
      diagnostics.reasonCounts[reason] = (diagnostics.reasonCounts[reason] || 0) + 1;
    }
    function numberField(field, optional) {
      var n = num(v[idx[field]]);
      if (n.reason) {
        if (optional && n.reason === 'missing' && idx[field] < v.length) diagnostics.legalMissing[field]++;
        else issue(field, n.reason, v[idx[field]]);
      }
      return n.value;
    }
    if (v.length !== names.length) issue('*', 'field_count', v.length + ' (expected ' + names.length + ')');
    var ra = numberField('ra'), dec = numberField('dec'), mag = numberField('vmag');
    var hr = numberField('hr'), bv = numberField('bv_color', true);
    if (hr != null && (hr <= 0 || !Number.isSafeInteger(hr))) issue('hr', 'invalid_integer', v[idx.hr]);
    if (ra != null && (ra < 0 || ra >= 360)) issue('ra', 'out_of_range', v[idx.ra]);
    if (dec != null && (dec < -90 || dec > 90)) issue('dec', 'out_of_range', v[idx.dec]);
    if (mag != null && (mag < SCALE.magMin || mag > SCALE.magMax)) issue('vmag', 'out_of_range', v[idx.vmag]);
    if (bv != null && (bv < SCALE.bvMin || bv > SCALE.bvMin + 254 * BV_STEP)) issue('bv_color', 'out_of_range', v[idx.bv_color]);
    if (hr != null && hr > 0 && Number.isSafeInteger(hr)) {
      if (seenHr[hr]) issue('hr', 'duplicate', v[idx.hr]);
      seenHr[hr] = true;
    }
    var sp = String(v[idx.spect_type] || '').trim();
    if (!sp && idx.spect_type < v.length) diagnostics.legalMissing.spect_type++;
    if (NONSTELLAR_HR.indexOf(hr) !== -1) {
      if (mag != null) {
        /* 官方列为非恒星却带星等：输入与政策冲突，必须人工审查。 */
        issue('hr', 'listed_nonstellar_has_magnitude', v[idx.hr]);
      } else if (reasons.length === 1 && reasons[0].field === 'vmag' && reasons[0].reason === 'missing') {
        excluded.push({ line: row.line, hr: hr, name: String(v[idx.name] || '').trim(),
          altName: String(v[idx.alt_name] || '').trim(), reason: 'nonstellar_no_vmag' });
        return;
      }
    }
    if (reasons.length) { skipped++; rejected.push({ line: row.line, hr: hr, reasons: reasons }); return; }
    var cls = CLS[sp.toUpperCase().charAt(0)] || 0;
    if (!sp) stats.noSpect++;
    if (bv == null) stats.noBV++;
    if (mag < stats.magMin) stats.magMin = mag;
    if (mag > stats.magMax) stats.magMax = mag;
    stars.push({ name: String(v[idx.name] || '').trim(), alt: String(v[idx.alt_name] || '').trim(), hr: hr,
      ra: ra, dec: dec, mag: mag, bv: bv, cls: cls, spect: sp });
  });
  stats.count = stars.length;
  diagnostics.accepted = stars.length;
  diagnostics.rejected = rejected.length;
  diagnostics.excluded = excluded.length;
  if (!rows.length) diagnostics.structureErrors.push({ line: null, reason: 'empty DATA section' });
  console.log('INPUT_DIAGNOSTICS ' + JSON.stringify(diagnostics));
  if (excluded.length) console.log('EXCLUDED_ROWS ' + JSON.stringify(excluded));

  var buf = new Uint8Array(stars.length * 7);
  for (var j = 0; j < stars.length; j++) buildRec(buf, j * 7, stars[j]);
  var b64 = Buffer.from(buf).toString('base64');

  /* 可点击亮星的名称表：只收 V≤5.0 且带名称的记录（约千余条）。
   * 其余数千颗只绘制、不产生命中，避免误点与详情信息不全。
   * 格式：[记录索引, 拜耳/弗兰斯蒂德名, HR 名]，索引与 7 字节记录次序一致。 */
  var nameTable = [];
  for (var nk = 0; nk < stars.length; nk++) {
    var sn = stars[nk];
    if (sn.mag > 5.0) continue;
    var alt = String(sn.alt || '').replace(/\s+/g, ' ').trim();
    var nm = String(sn.name || '').replace(/\s+/g, ' ').trim();
    if (!alt && !nm) continue;
    nameTable.push([nk, alt, nm]);
  }
  console.log('INFO 可点击亮星（V≤5.0 且有名称）=' + nameTable.length);

  var inputSha = crypto.createHash('sha256').update(fs.readFileSync(input)).digest('hex');

  console.log('INFO 字段数=' + names.length + ' 原始行=' + rows.length);
  console.log('INFO 有效=' + stats.count + ' 跳过=' + skipped + ' 排除非恒星=' + excluded.length +
    ' 无B-V=' + stats.noBV + ' 无光谱=' + stats.noSpect +
    ' 星等=' + stats.magMin + '..' + stats.magMax);
  console.log('INFO 二进制=' + buf.length + 'B base64=' + b64.length + 'chars');

  /* 自检：解码回读误差 */
  var maxErr = { ra: 0, dec: 0, mag: 0, bv: 0 };
  for (var k = 0; k < stars.length; k++) {
    var o = k * 7;
    var ra2 = (buf[o] | (buf[o + 1] << 8)) * SCALE.ra;
    var dec2 = (buf[o + 2] | (buf[o + 3] << 8)) * SCALE.dec - 90;
    var mag2 = buf[o + 4] * MAG_STEP + SCALE.magMin;
    var e1 = Math.abs(ra2 - stars[k].ra); if (e1 > maxErr.ra) maxErr.ra = e1;
    var e2 = Math.abs(dec2 - stars[k].dec); if (e2 > maxErr.dec) maxErr.dec = e2;
    var e3 = Math.abs(mag2 - stars[k].mag); if (e3 > maxErr.mag) maxErr.mag = e3;
    if (buf[o + 5] !== 255 && stars[k].bv != null) {
      var bv2 = buf[o + 5] * BV_STEP + SCALE.bvMin;
      var e4 = Math.abs(bv2 - stars[k].bv); if (e4 > maxErr.bv) maxErr.bv = e4;
    }
  }
  console.log('INFO 量化误差 ra=' + maxErr.ra.toFixed(6) + '° dec=' + maxErr.dec.toFixed(6) +
    '° mag=' + maxErr.mag.toFixed(4) + ' bv=' + maxErr.bv.toFixed(4));

  if (maxErr.ra > SCALE.ra + 1e-9 || maxErr.dec > SCALE.dec + 1e-9) {
    console.error('FAIL 位置量化误差超界'); process.exit(4);
  }

  if (rejected.length || diagnostics.structureErrors.length) {
    console.error('REJECTED_ROWS ' + JSON.stringify(rejected));
    console.error('FAIL 原始异常记录需要审查；禁止静默删除后生成正式数据');
    process.exit(7);
  }
  if (check) { console.log('CHECK OK（未写文件；兼容校验模式）'); return; }

  /* 参数仅校验来源声明URL；此处不联网，不代表已核验许可内容。 */
  if (licenseEvidence !== 'https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw') {
    console.error('FAIL 正式写入必须提供 --license-evidence <官方许可/记录URL>（仅来源声明门禁）'); process.exit(5);
  }
  var outPath = output ? path.resolve(output) : path.join(__dirname, '..', 'data', 'sky-stars-l1.js');
  if (fs.existsSync(outPath)) { console.error('FAIL 输出已存在，拒绝覆盖：' + outPath + '（请指定新的 --output）'); process.exit(6); }
  var fullRecords = noRecords ? [] : stars.map(function (s) { return { sourceId: 'HR ' + s.hr, hr: s.hr, name: s.name, altName: s.alt, spectType: s.spect, bv: s.bv, ra: s.ra, dec: s.dec, vmag: s.mag }; });

  var header = '/* ASTRUM · L1 视觉亮星表（自动生成，勿手改）\n' +
    ' * 来源：Bright Star Catalogue 5th Rev. Ed. (Hoffleit & Warren 1991)，NASA HEASARC 修订版\n' +
    ' * 许可：美国政府作品（公有领域）https://www.usa.gov/government-works\n' +
    ' * 记录：https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw\n' +
    ' * 生成工具：tools/build-star-data.js\n' +
    ' * 位置：J2000 几何位置；未施加自行\n' +
    ' */\n';
  var meta = {
    version: '1.0.0',
    source: 'Bright Star Catalogue 5th Revised Ed. (Hoffleit & Warren 1991), NASA HEASARC revision',
    license: 'U.S. Government Work (public domain)',
    licenseUrl: 'https://www.usa.gov/government-works',
    recordUrl: 'https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw',
    downloadUrl: 'https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz',
    generatedAt: new Date().toISOString(),
    inputSha256: inputSha,
    count: stats.count,
    skipped: skipped,
    excludedNonstellar: excluded.length,
    excludedNonstellarRows: excluded,
    noBV: stats.noBV,
    noSpect: stats.noSpect,
    nameCount: nameTable.length,
    names: nameTable,
    rejectedRows: rejected,
    epoch: 'J2000',
    epochField: 'J2000 geometric coordinates as supplied; no proper-motion propagation',
    physicalFields: { properMotion: null, parallax: null, units: { ra: 'degree', dec: 'degree', vmag: 'mag', bv: 'mag' } },
    pm: 'not applied',
    recordBytes: 7,
    fields: ['ra', 'dec', 'vmag', 'bv', 'cls'],
    scale: SCALE,
    magStep: MAG_STEP,
    bvStep: BV_STEP,
    note: 'bv=255 表示缺失；cls 为光谱型首字母代码（0=无）'
  };
  if (!noRecords) meta.records = fullRecords;
  var js = header +
    '(function(root){\n' +
    "  'use strict';\n" +
    '  root.SKY_STARS_L1 = ' + JSON.stringify(meta, null, 2) + ';\n' +
    "  root.SKY_STARS_L1.data = '" + b64 + "';\n" +
    '})(typeof window !== ' + "'undefined' ? window : globalThis);\n";
  fs.writeFileSync(outPath, js, 'utf8');
  console.log('WRITE ' + outPath + ' (' + Math.round(js.length / 1024) + ' KB)');
}

main();
