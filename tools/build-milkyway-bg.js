/* ASTRUM · NASA SVS 银河纹理离线预处理（V2-SKY 子阶段 2C）
 *
 * 输入：tools/fixtures/milkyway-raw/milkyway_2020_4k_print.jpg
 * 输出：
 *   data/milkyway-bg.js                     运行时纹理（RGB565 + base64）
 *   assets/sky/milkyway/metadata.json       来源、许可、尺寸、哈希
 *   tools/fixtures/milkyway-raw/report.json 本次处理校验报告
 *
 * 为什么不用运行时 JPEG：file:// 下 Chrome 会把本地图片污染 Canvas，
 * getImageData 可能抛 SecurityError；同时图片解码异步，首帧会缺背景。
 *
 * 依赖：本机 Python + Pillow 仅用于离线解码/缩放；运行时不依赖任何第三方库。
 * 若 Pillow 不可用，脚本会明确失败，不会生成未经验证的数据。
 *
 * 用法：node tools/build-milkyway-bg.js [--check]
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var crypto = require('crypto');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');
var INPUT = path.join(ROOT, 'tools/fixtures/milkyway-raw/milkyway_2020_4k_print.jpg');
var OUT_JS = path.join(ROOT, 'data/milkyway-bg.js');
var OUT_META = path.join(ROOT, 'assets/sky/milkyway/metadata.json');
var OUT_REPORT = path.join(ROOT, 'tools/fixtures/milkyway-raw/report.json');

var TEX_W = 512;
var TEX_H = 256;
var TOOL_VERSION = '1.0.0';

var PY = [
  'import sys, json, base64',
  'from PIL import Image',
  'src, out, tw, th = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])',
  'im = Image.open(src).convert("RGB")',
  'srcw, srch = im.size',
  'im2 = im.resize((tw, th), Image.LANCZOS)',
  'px = im2.load()',
  'buf = bytearray(tw * th * 2)',
  'i = 0',
  'for y in range(th):',
  '    for x in range(tw):',
  '        r, g, b = px[x, y]',
  '        v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)',
  '        buf[i] = v & 255      # little-endian low byte',
  '        buf[i + 1] = v >> 8   # high byte',
  '        i += 2',
  'refs = [("NGP", 12.85730, 27.12825), ("SGP", 0.85730, -27.12825),',
  '        ("GC", 17.76033, -28.9362), ("ANTI", 5.76033, 28.9362)]',
  'def sample(ra, dec, rad=6):',
  '    u = (0.5 - ra / 24.0) % 1.0',
  '    v = 0.5 - dec / 180.0',
  '    cx = int(u * tw); cy = int(v * th)',
  '    tot = 0; n = 0',
  '    for yy in range(max(0, cy - rad), min(th, cy + rad + 1)):',
  '        for xx in range(max(0, cx - rad), min(tw, cx + rad + 1)):',
  '            r, g, b = px[xx, yy]',
  '            tot += (r + g + b) / 3.0; n += 1',
  '    return tot / n if n else 0.0',
  'refvals = {name: round(sample(ra, dec), 2) for name, ra, dec in refs}',
  'json.dump({"srcW": srcw, "srcH": srch, "outW": tw, "outH": th,',
  '           "b64": base64.b64encode(bytes(buf)).decode("ascii"),',
  '           "bytes": len(buf), "refs": refvals}, open(out, "w"))',
  'print("ok")'
].join('\n');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function jpegSize(buf) {
  var i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xFF) { i++; continue; }
    var marker = buf[i + 1];
    var len = buf.readUInt16BE(i + 2);
    if (marker >= 0xC0 && marker <= 0xCF && marker !== 0xC4 && marker !== 0xC8 && marker !== 0xCC) {
      return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

function main() {
  if (!fs.existsSync(INPUT)) {
    console.error('[milkyway] 缺少原始资源: ' + INPUT);
    console.error('[milkyway] 请先下载 NASA SVS 官方 milkyway_2020_4k_print.jpg');
    process.exit(2);
  }
  var raw = fs.readFileSync(INPUT);
  var hash = sha256(raw);
  var dim = jpegSize(raw);
  console.log('[milkyway] 原始文件: ' + (raw.length / 1024).toFixed(1) + ' KB');
  console.log('[milkyway] JPEG 尺寸: ' + (dim ? dim.w + 'x' + dim.h : '未知'));
  console.log('[milkyway] SHA-256: ' + hash);

  var tmp = path.join(os.tmpdir(), 'astrum-milkyway-' + Date.now() + '.json');
  try {
    cp.execFileSync('python', ['-c', PY, INPUT, tmp, String(TEX_W), String(TEX_H)], {
      stdio: ['ignore', 'ignore', 'pipe'], timeout: 120000
    });
  } catch (e) {
    console.error('[milkyway] 解码失败：需要本机 Python + Pillow。' + (e && e.message || ''));
    try { fs.unlinkSync(tmp); } catch (x) {}
    process.exit(3);
  }

  var decoded = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);

  if (decoded.bytes !== TEX_W * TEX_H * 2) {
    console.error('[milkyway] 纹理字节数异常: ' + decoded.bytes);
    process.exit(4);
  }
  if (!decoded.b64 || decoded.b64.length < decoded.bytes * 1.3) {
    console.error('[milkyway] base64 长度异常');
    process.exit(4);
  }

  if (process.argv.indexOf('--check') >= 0 && fs.existsSync(OUT_JS)) {
    var prev = fs.readFileSync(OUT_JS, 'utf8');
    var m = prev.match(/data:'([^']+)'/);
    var same = m && m[1] === decoded.b64;
    console.log(same ? '[milkyway] --check 一致' : '[milkyway] --check 不一致（需要重新生成）');
    process.exit(same ? 0 : 5);
  }

  var meta = {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    tool: 'tools/build-milkyway-bg.js',
    toolVersion: TOOL_VERSION,
    source: {
      name: 'NASA SVS Deep Star Maps 2020 — milkyway_2020_4k_print.jpg',
      page: 'https://svs.gsfc.nasa.gov/4851/',
      download: 'https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_print.jpg',
      license: 'Public domain (NASA SVS Help: https://svs.gsfc.nasa.gov/help/)',
      credit: 'NASA/Goddard Space Flight Center Scientific Visualization Studio; Ernie Wright',
      file: 'milkyway_2020_4k_print.jpg',
      sha256: hash,
      width: dim ? dim.w : decoded.srcW,
      height: dim ? dim.h : decoded.srcH,
      bytes: raw.length
    },
    texture: {
      width: TEX_W, height: TEX_H, format: 'rgb565',
      byteOrder: 'little-endian',
      encoding: 'base64',
      bytes: decoded.bytes,
      base64Bytes: decoded.b64.length,
      projection: 'equatorial plate carree, center RA 0h, RA increases left',
      uv: 'u = (0.5 - raHours/24) mod 1; v = 0.5 - decDeg/180'
    },
    processing: {
      resize: decoded.srcW + 'x' + decoded.srcH + ' -> ' + TEX_W + 'x' + TEX_H + ' (Lanczos)',
      color: 'RGB -> RGB565 little-endian',
      brightness: 'none',
      crop: 'none'
    },
    reference: decoded.refs
  };

  var js = '/* ASTRUM · NASA SVS 银河纹理（自动生成，请勿手改）\n' +
    ' * 来源: NASA SVS Deep Star Maps 2020 milkyway_2020_4k_print.jpg\n' +
    ' * 许可: Public domain (NASA SVS Help)\n' +
    ' * 纹理: ' + TEX_W + 'x' + TEX_H + ' RGB565 little-endian, base64\n' +
    ' * 坐标: 赤道 Plate Carree, 中心 RA 0h, RA 向左增大\n' +
    ' * u=(0.5-ra/24)%1, v=0.5-dec/180\n' +
    ' */\n' +
    'window.MILKYWAY_BG = {\n' +
    '  version: \'1.0.0\',\n' +
    '  meta: ' + JSON.stringify(meta) + ',\n' +
    '  data: \'' + decoded.b64 + '\'\n' +
    '};\n';

  fs.mkdirSync(path.dirname(OUT_META), { recursive: true });
  fs.writeFileSync(OUT_JS, js, 'utf8');
  fs.writeFileSync(OUT_META, JSON.stringify(meta, null, 2) + '\n', 'utf8');
  fs.writeFileSync(OUT_REPORT, JSON.stringify({
    original: meta.source, texture: meta.texture,
    base64Length: decoded.b64.length, refs: decoded.refs
  }, null, 2) + '\n', 'utf8');

  console.log('[milkyway] 纹理: ' + TEX_W + 'x' + TEX_H + ' RGB565, ' +
    (decoded.bytes / 1024).toFixed(0) + ' KB, base64 ' + (decoded.b64.length / 1024).toFixed(0) + ' KB');
  console.log('[milkyway] 输出: data/milkyway-bg.js, assets/sky/milkyway/metadata.json');
  console.log('[milkyway] 参考亮度: ' + JSON.stringify(decoded.refs));
}

main();
