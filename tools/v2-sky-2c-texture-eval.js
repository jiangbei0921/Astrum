/* ASTRUM · V2-SKY 子阶段 2C 纹理分辨率评估（512×256 vs 1024×512）
 *
 * 原则：
 *   - 只评估，不升级。绝不写入 data/milkyway-bg.js。
 *   - 原始 NASA 图片就是 1024×512；1024×512 运行时纹理不产生超出源图的信息。
 *   - 所有中间产物写入系统临时目录。
 *
 * 测量项：
 *   1) 纹理字节 / base64 长度 / JS 模块体积（离线计算）
 *   2) standalone 与 Pages 体积增量（基于当前实际产物，只读）
 *   3) 浏览器真实解码耗时（atob + 字节循环，按长度实测）
 *   4) 浏览器采样耗时（同样的 32768 次采样，512 宽 vs 1024 宽缓冲）
 *   5) 内存占用（字节数 + JS 字符串长度 + 堆增量）
 *   6) 采样空间分辨率（纹理 / 天空纹理 / 屏幕栅格）
 *
 * 用法：node tools/v2-sky-2c-texture-eval.js
 */
'use strict';

var fs = require('fs');
var os = require('os');
var path = require('path');
var cp = require('child_process');
var crypto = require('crypto');
var net = require('net');

var ROOT = path.resolve(__dirname, '..');
var SRC = path.join(ROOT, 'tools/fixtures/milkyway-raw/milkyway_2020_4k_print.jpg');
var CUR_JS = path.join(ROOT, 'data/milkyway-bg.js');
var STANDALONE = path.join(ROOT, 'astrum-standalone.html');
var SITE = path.join(ROOT, '_site');

var PY = [
  'import sys, json, base64',
  'from PIL import Image',
  'src, out = sys.argv[1], sys.argv[2]',
  'im = Image.open(src).convert("RGB")',
  'sw, sh = im.size',
  'def pack(tw, th):',
  '    im2 = im.resize((tw, th), Image.LANCZOS)',
  '    px = im2.load()',
  '    buf = bytearray(tw * th * 2)',
  '    i = 0',
  '    for y in range(th):',
  '        for x in range(tw):',
  '            r, g, b = px[x, y]',
  '            v = ((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3)',
  '            buf[i] = v & 255',
  '            buf[i + 1] = v >> 8',
  '            i += 2',
  '    return bytes(buf), tw, th',
  'def sample(px, tw, th, ra, dec, rad=6):',
  '    u = (0.5 - ra / 24.0) % 1.0',
  '    v = 0.5 - dec / 180.0',
  '    cx = int(u * tw); cy = int(v * th)',
  '    tot = 0.0; n = 0',
  '    for yy in range(max(0, cy - rad), min(th, cy + rad + 1)):',
  '        for xx in range(max(0, cx - rad), min(tw, cx + rad + 1)):',
  '            r, g, b = px[xx, yy]',
  '            tot += (r + g + b) / 3.0; n += 1',
  '    return tot / n if n else 0.0',
  'refs = [("NGP", 12.85730, 27.12825), ("SGP", 0.85730, -27.12825),',
  '        ("GC", 17.76033, -28.9362), ("ANTI", 5.76033, 28.9362)]',
  'res = {"srcW": sw, "srcH": sh, "variants": {}}',
  'for (tw, th) in [(512, 256), (1024, 512)]:',
  '    buf, _, _ = pack(tw, th)',
  '    im2 = im.resize((tw, th), Image.LANCZOS); px = im2.load()',
  '    res["variants"][str(tw) + "x" + str(th)] = {',
  '        "w": tw, "h": th, "bytes": len(buf),',
  '        "b64": base64.b64encode(buf).decode("ascii"),',
  '        "refs": {name: round(sample(px, tw, th, ra, dec), 2) for name, ra, dec in refs}}',
  'json.dump(res, open(out, "w"))',
  'print("ok")'
].join('\n');

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function findChrome() {
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ];
  for (var i = 0; i < c.length; i++) if (fs.existsSync(c[i])) return c[i];
  return 'chrome';
}

function freePort() {
  return new Promise(function (res, rej) {
    var srv = net.createServer();
    srv.on('error', rej);
    srv.listen(0, '127.0.0.1', function () {
      var p = srv.address().port;
      srv.close(function () { res(p); });
    });
  });
}
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* 页面内测量：解码 + 采样 + 内存 */
var BENCH = [
  'async function (len1024, b64real) {',
  '  function now(){return performance.now();}',
  '  function atobLoop(b64){var bin=atob(b64);var n=bin.length;var out=new Uint8Array(n);for(var i=0;i<n;i++)out[i]=bin.charCodeAt(i);return out;}',
  '  function q(a,p){a=a.slice().sort(function(x,y){return x-y;});var i=Math.ceil(p*a.length)-1;if(i<0)i=0;if(i>a.length-1)i=a.length-1;return a[i];}',
  '  function st(a){var n=a.length,s=0,mx=0;for(var i=0;i<n;i++){s+=a[i];if(a[i]>mx)mx=a[i];}return{n:n,avg:+(s/n).toFixed(3),p50:+q(a,0.5).toFixed(3),p95:+q(a,0.95).toFixed(3),max:+mx.toFixed(3)};}',
  '  var out={};',
  '  var mem0=performance.memory?performance.memory.usedJSHeapSize:0;',
  '  /* 1024 等长合成串：内容不同、长度一致，仅用于测量解码成本。',
  '     先剥离尾部 "=" 填充，避免拼接后中间出现非法填充符 */',
  '  var core=b64real.replace(/=/g,"");',
  '  var synth="";',
  '  while(synth.length<len1024) synth+=core;',
  '  synth=synth.slice(0,len1024);',
  '  if(synth.length%4!==0){synth=synth.slice(0,synth.length-(synth.length%4));}',
  '  var a1=[],a2=[];',
  '  for(var i=0;i<3;i++){atobLoop(b64real);atobLoop(synth);}',
  '  for(var j=0;j<10;j++){var t0=now();atobLoop(b64real);a1.push(now()-t0);}',
  '  for(var k=0;k<10;k++){var t1=now();atobLoop(synth);a2.push(now()-t1);}',
  '  out.decode512=st(a1);out.decode1024=st(a2);',
  '  out.len={b64_512:b64real.length,b64_1024:synth.length};',
  '  /* 采样微基准：同样 32768 次取样，512 宽 vs 1024 宽缓冲（1024 由 512 最近邻放大） */',
  '  var buf512=atobLoop(b64real);',
  '  var buf1024=new Uint8Array(1024*512*2);',
  '  for(var y=0;y<512;y++){for(var x=0;x<1024;x++){var sx=Math.floor(x/2),sy=Math.floor(y/2);var so=(sy*512+sx)*2,do_=(y*1024+x)*2;buf1024[do_]=buf512[so];buf1024[do_+1]=buf512[so+1];}}',
  '  var N=256*128;var us=new Float64Array(N),vs=new Float64Array(N);var seed=12345;',
  '  function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff;}',
  '  for(var n2=0;n2<N;n2++){us[n2]=rnd();vs[n2]=rnd();}',
  '  function samplePass(buf,W,H){',
  '    var acc=0;',
  '    for(var m=0;m<N;m++){',
  '      var xx=Math.min(W-1,Math.floor(us[m]*W)),yy=Math.min(H-1,Math.floor(vs[m]*H));',
  '      var o=(yy*W+xx)*2;acc+=(buf[o]|(buf[o+1]<<8));',
  '    }',
  '    return acc;',
  '  }',
  '  samplePass(buf512,512,256);samplePass(buf1024,1024,512);',
  '  var s1=[],s2=[];',
  '  for(var p=0;p<10;p++){var q0=now();samplePass(buf512,512,256);s1.push(now()-q0);}',
  '  for(var r=0;r<10;r++){var q1=now();samplePass(buf1024,1024,512);s2.push(now()-q1);}',
  '  out.sample512=st(s1);out.sample1024=st(s2);',
  '  if(performance.memory){',
  '    out.heap={beforeMB:+(mem0/1048576).toFixed(1),afterMB:+(performance.memory.usedJSHeapSize/1048576).toFixed(1)};',
  '  }',
  '  out.texture=window.SkyBackground&&window.SkyBackground.ready?window.SkyBackground.stats():null;',
  '  return out;',
  '}'
].join('\n');

async function browserMeasure(b64_512_len, b64_1024_len, b64real) {
  var port = await freePort();
  var profile = path.join(os.tmpdir(), 'astrum-texeval-' + Date.now());
  var proc = cp.spawn(findChrome(), [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--no-default-browser-check', '--window-size=1200,800',
    '--remote-debugging-port=' + port, '--user-data-dir=' + profile, 'about:blank'
  ], { stdio: 'ignore' });
  var ver = null;
  for (var i = 0; i < 80; i++) {
    try {
      var r = await fetch('http://127.0.0.1:' + port + '/json/version');
      if (r.ok) { ver = await r.json(); break; }
    } catch (e) { }
    await sleep(250);
  }
  if (!ver) { proc.kill(); throw new Error('CDP 不可用'); }
  var list = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
  var target = list.filter(function (t) { return t.type === 'page'; })[0];
  var ws = new WebSocket(target.webSocketDebuggerUrl);
  var seq = 0, pending = {};
  await new Promise(function (res, rej) { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = function (ev) {
    var m = JSON.parse(ev.data);
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  };
  function send(method, params) {
    seq++;
    var myId = seq;
    return new Promise(function (res) {
      pending[myId] = res;
      ws.send(JSON.stringify({ id: myId, method: method, params: params || {} }));
    });
  }
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: 'file:///' + path.join(ROOT, 'index.html').replace(/\\/g, '/') });
  var ready = false;
  for (var t = 0; t < 160; t++) {
    var ev = await send('Runtime.evaluate', {
      expression: '!!(window.SkyBackground && window.MILKYWAY_BG)',
      returnByValue: true
    });
    if (ev.result && ev.result.result && ev.result.result.value === true) { ready = true; break; }
    await sleep(200);
  }
  if (!ready) { ws.close(); proc.kill(); throw new Error('页面未就绪'); }

  /* 真实 512 base64 从页面读取，避免 Node 侧拼接导致长度不一致 */
  var real = await send('Runtime.evaluate', {
    expression: 'window.MILKYWAY_BG.data.length',
    returnByValue: true
  });
  var realLen = real.result.result.value;
  var expr = '(' + BENCH + ')(' + b64_1024_len + ', window.MILKYWAY_BG.data)';
  var out = await send('Runtime.evaluate', {
    expression: expr, awaitPromise: true, returnByValue: true, timeout: 120000
  });
  var val = out.result && out.result.result && out.result.result.value;
  if (!val) {
    console.error('[texeval] 原始返回: ' + JSON.stringify(out).slice(0, 1500));
  } else if (!val.decode512) {
    console.error('[texeval] 返回缺少 decode512，原始: ' + JSON.stringify(out).slice(0, 1500));
  }
  ws.close();
  proc.kill();
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) { }
  if (!val) throw new Error('测量未返回');
  val.realB64Len = realLen;
  val.browser = ver['Browser'];
  return val;
}

function dirBytes(dir) {
  var total = 0, files = 0;
  if (!fs.existsSync(dir)) return { bytes: 0, files: 0, exists: false };
  (function walk(d) {
    fs.readdirSync(d, { withFileTypes: true }).forEach(function (e) {
      var p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else { total += fs.statSync(p).size; files++; }
    });
  })(dir);
  return { bytes: total, files: files, exists: true };
}

async function main() {
  if (!fs.existsSync(SRC)) { console.error('[texeval] 缺少源图'); process.exit(2); }
  var raw = fs.readFileSync(SRC);
  var srcHash = sha256(raw);
  var curHash = fs.existsSync(CUR_JS) ? sha256(fs.readFileSync(CUR_JS)) : null;
  var curSize = fs.existsSync(CUR_JS) ? fs.statSync(CUR_JS).size : 0;

  var tmp = path.join(os.tmpdir(), 'astrum-texeval-' + Date.now() + '.json');
  cp.execFileSync('python', ['-c', PY, SRC, tmp], { stdio: ['ignore', 'ignore', 'pipe'], timeout: 180000 });
  var dec = JSON.parse(fs.readFileSync(tmp, 'utf8'));
  fs.unlinkSync(tmp);

  var v512 = dec.variants['512x256'], v1024 = dec.variants['1024x512'];
  var metaOverhead = curSize - v512.b64.length;      /* 当前 JS 中除 base64 外的固定开销近似 */
  var js512 = v512.b64.length + metaOverhead;
  var js1024 = v1024.b64.length + metaOverhead;
  var sa = fs.existsSync(STANDALONE) ? fs.statSync(STANDALONE).size : 0;
  var site = dirBytes(SITE);

  var bm = await browserMeasure(v512.b64.length, v1024.b64.length, null);

  var texAng512 = 360 / 512;
  var texAng1024 = 360 / 1024;
  var skyAng = 360 / 256;            /* 天空纹理 256×128 覆盖 360°/180° */
  var rasterAng = { fov70: 70 / 160, fov145: 145 / 160, fov178: 178 / 160 };
  var screenAngRmax = { fov70: 35 / 490, fov145: 72.5 / 490, fov178: 89 / 490 };

  var res = {
    source: {
      file: 'milkyway_2020_4k_print.jpg', width: dec.srcW, height: dec.srcH,
      bytes: raw.length, sha256: srcHash
    },
    currentModule: { path: 'data/milkyway-bg.js', bytes: curSize, sha256: curHash },
    variants: {
      'A 512x256': {
        bytes: v512.bytes, base64Len: v512.b64.length, jsModuleBytes: js512,
        refs: v512.refs
      },
      'B 1024x512': {
        bytes: v1024.bytes, base64Len: v1024.b64.length, jsModuleBytes: js1024,
        refs: v1024.refs
      }
    },
    delta: {
      textureBytes: v1024.bytes - v512.bytes,
      base64Chars: v1024.b64.length - v512.b64.length,
      jsModuleBytes: js1024 - js512,
      standaloneBefore: sa,
      standaloneAfter: sa + (js1024 - js512),
      sitesBefore: site.bytes,
      sitesAfter: site.bytes + (js1024 - js512)
    },
    browser: bm,
    angular: {
      textureDegPerPx: { '512x256': +texAng512.toFixed(4), '1024x512': +texAng1024.toFixed(4) },
      skyTextureDegPerPx: +skyAng.toFixed(4),
      rasterTexelDeg: { fov70: +rasterAng.fov70.toFixed(4), fov145: +rasterAng.fov145.toFixed(4), fov178: +rasterAng.fov178.toFixed(4) },
      screenPixelDegAtRmax490: { fov70: +screenAngRmax.fov70.toFixed(4), fov145: +screenAngRmax.fov145.toFixed(4), fov178: +screenAngRmax.fov178.toFixed(4) },
      note: '屏幕栅格 160 覆盖整个鱼眼直径（2×Rmax=980 px 显示 / 160 texel）'
    },
    skyBuildReference: { nodeA3ms: null, note: '整幅天空纹理构建耗时见性能补测报告 A3' }
  };

  /* 回归校验：本次评估未改动运行时纹理 */
  res.currentModule.unchangedAfterEval = fs.existsSync(CUR_JS) && sha256(fs.readFileSync(CUR_JS)) === curHash;

  fs.writeFileSync(path.join(os.tmpdir(), 'astrum-texeval-result.json'), JSON.stringify(res, null, 2));
  console.log(JSON.stringify(res, null, 2));
}

main().catch(function (e) { console.error('[texeval] 异常: ' + (e && e.stack || e)); process.exit(1); });
