/* ASTRUM · 布局宽度分配测试（零依赖）
 *
 * 守的是三件事：
 *   1) 四栏组合的宽度分配正确——左收 / 右收 / 双收 / 全开
 *   2) 主区 + 两侧栏之和等于容器的可用宽度（不许出现空白条）
 *   3) 状态往返稳定（收起再展开必须回到原宽）
 *
 * 第 3 条是回归保护：曾经用 grid-template-columns + var() 做过渡，
 * 左侧收起来一次之后就再也展不回去，而当时的断言只测了「收起后」，
 * 所以一路绿着。这里把往返也钉住。
 *
 * 用法：node tools/rail-test.js
 */
'use strict';

var fs = require('fs');
var path = require('path');
var cp = require('child_process');
var os = require('os');

var ROOT = path.resolve(__dirname, '..');

function findChrome() {
  var c = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ];
  for (var i = 0; i < c.length; i++) { if (fs.existsSync(c[i])) return c[i]; }
  return 'chrome';
}

var SCRIPT = `
(function () {
  var R = [];
  var done = false;
  function ok(n, p, x) { if (done) return; R.push({ n: n, p: !!p, x: x === undefined ? '' : String(x) }); }
  function finish() {
    if (done) return; done = true;
    var pass = R.filter(function (r) { return r.p; }).length;
    var el = document.createElement('pre');
    el.id = '__st_result';
    el.textContent = 'RESULT ' + pass + '/' + R.length + '\\n' +
      R.map(function (r) { return (r.p ? 'PASS' : 'FAIL') + ' | ' + r.n + (r.x ? (' | ' + r.x) : ''); }).join('\\n');
    document.body.appendChild(el);
  }
  setTimeout(function () { ok('看门狗：流程未在 20s 内完成', false, ''); finish(); }, 20000);

  var b = document.body;

  function box(sel) {
    var el = document.querySelector(sel);
    return el ? el.getBoundingClientRect().width : -1;
  }
  function snapshot() {
    var ws = document.querySelector('.workspace');
    return {
      main: box('.main'),
      side: box('.sidebar'),
      obs: box('.obspanel'),
      ws: ws ? ws.clientWidth : 0,
      contentMax: parseFloat(getComputedStyle(document.querySelector('.main')).getPropertyValue('--content-max')) || 0
    };
  }
  function set(left, right) {
    b.classList.toggle('sidebar-collapsed', !!left);
    b.classList.toggle('obs-collapsed', !!right);
  }
  /* 两次采样之间必须等布局稳定：宽度是瞬时切换的，
   * 但侧栏的 flex-basis 与内容重排仍在同一帧完成，留 60ms 足够 */
  function after(fn) { setTimeout(fn, 80); }

  setTimeout(function () {
    var W = document.documentElement.clientWidth;
    var wide = W >= 1121;
    if (!wide) { ok('需要桌面宽度（≥1121）才能测四栏组合', false, 'W=' + W); finish(); return; }

    /* ① 全开 */
    set(false, false);
    after(function () {
      var s = snapshot();
      ok('全开：主区 + 两侧栏 = 容器宽（无空白条）',
        Math.abs((s.main + s.side + s.obs) - s.ws) <= 1,
        [s.main, s.side, s.obs, s.ws].join(' / '));
      ok('全开：两侧栏都在', s.side > 200 && s.obs > 200, 'side=' + Math.round(s.side) + ' obs=' + Math.round(s.obs));

      /* ② 仅左收 */
      set(true, false);
      after(function () {
        var a = snapshot();
        ok('仅左收：左栏让出（≤2px）', a.side <= 2, 'side=' + Math.round(a.side));
        ok('仅左收：右侧栏仍在', a.obs > 200, 'obs=' + Math.round(a.obs));
        ok('仅左收：主区变宽且无空白条',
          a.main > s.main && Math.abs((a.main + a.side + a.obs) - a.ws) <= 1,
          Math.round(a.main) + ' vs ' + Math.round(s.main));

        /* ③ 仅右收 */
        set(false, true);
        after(function () {
          var c = snapshot();
          ok('仅右收：右栏让出（0px）', c.obs <= 1, 'obs=' + Math.round(c.obs));
          ok('仅右收：左侧栏仍在', c.side > 200, 'side=' + Math.round(c.side));
          ok('仅右收：主区变宽且无空白条',
            c.main > s.main && Math.abs((c.main + c.side + c.obs) - c.ws) <= 1,
            Math.round(c.main) + ' vs ' + Math.round(s.main));

          /* ④ 双收：旧写法漏掉的那个组合，会留下 268px 空白条 */
          set(true, true);
          after(function () {
            var d = snapshot();
            ok('双收：两侧都让出', d.side <= 2 && d.obs <= 1,
              'side=' + Math.round(d.side) + ' obs=' + Math.round(d.obs));
            ok('双收：主区占满（无残留空白条）',
              Math.abs((d.main + d.side + d.obs) - d.ws) <= 1,
              [d.main, d.side, d.obs, d.ws].join(' / '));
            ok('双收：主区最宽', d.main > a.main && d.main > c.main,
              Math.round(d.main) + ' > ' + Math.round(a.main) + '/' + Math.round(c.main));

            /* ⑤ 往返：收起再展开必须回到原宽（曾被布局过渡卡死在这里） */
            set(false, false);
            after(function () {
              var e = snapshot();
              ok('往返：回到全开时主区宽度一致',
                Math.abs(e.main - s.main) <= 1, Math.round(e.main) + ' vs ' + Math.round(s.main));
              ok('往返：左侧栏恢复', e.side > 200, 'side=' + Math.round(e.side));
              ok('往返：右侧栏恢复', e.obs > 200, 'obs=' + Math.round(e.obs));

              /* ⑥ 正文列宽随可用宽度分档，但有上限（不无限拉长行） */
              ok('正文列宽：全开时较窄', s.contentMax > 0 && s.contentMax <= 900, 'contentMax=' + s.contentMax);
              ok('正文列宽：双收时放宽', d.contentMax > s.contentMax, d.contentMax + ' > ' + s.contentMax);
              ok('正文列宽：双收时仍有上限', d.contentMax <= 1200, 'contentMax=' + d.contentMax);
              finish();
            });
          });
        });
      });
    });
  }, 900);
})();
`;

function main() {
  var html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  html = html.replace(
    /(<meta http-equiv="Content-Security-Policy" content="[^"]*?script-src\s+)([^;]*?)(;)/,
    function (m, a, b, c) { return a + "'self' 'unsafe-inline'" + c; }
  );
  var idx = html.lastIndexOf('</body>');
  html = html.slice(0, idx) + '<script>' + SCRIPT + '</script>' + html.slice(idx);

  var tmp = path.join(ROOT, '__rail_test.html');
  fs.writeFileSync(tmp, html, 'utf8');
  var profile = path.join(os.tmpdir(), '__rail_profile_' + process.pid + '_' + Date.now());

  var out;
  try {
    out = cp.execFileSync(findChrome(), [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--user-data-dir=' + profile,
      /* 视口必须够宽：这组断言只对桌面四栏布局有意义 */
      '--window-size=1440,900',
      '--virtual-time-budget=25000',
      '--dump-dom',
      'file:///' + tmp.replace(/\\/g, '/')
    ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    out = String((e && e.stdout) || '') + String((e && e.stderr) || '');
  }
  try { fs.unlinkSync(tmp); } catch (e) {}
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch (e) {}

  var m = out.match(/<pre id="__st_result">([\s\S]*?)<\/pre>/);
  if (!m) {
    console.error('[rail-test] 未取得结果。输出片段：');
    console.error(out.slice(-1500));
    process.exit(1);
  }
  var text = m[1]
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  console.log(text);

  var head = (text.split('\n')[0] || '').trim();
  var mm = head.match(/^RESULT (\d+)\/(\d+)$/);
  process.exit(mm && mm[1] === mm[2] ? 0 : 1);
}

main();
