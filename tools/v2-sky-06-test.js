/* ASTRUM · V2-SKY 阶段 6 离线测试（纯 Node，零依赖）
 *
 * 覆盖 core/workspace.js：
 *   W1 规范与边界（经纬度、时区、视场、俯仰）
 *   W2 列表去重与上限
 *   W3 写入/覆盖/删除
 *   W4 清单快照字段
 *   W5 CSV 表头、转义与行数
 *
 * 用法：node tools/v2-sky-06-test.js
 */
'use strict';

var path = require('path');
var ROOT = path.resolve(__dirname, '..');

['core/astro.js', 'core/workspace.js'].forEach(function (f) { require(path.join(ROOT, f)); });

var W = global.Workspace;
var A = global.Astro;

var pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) pass++; else fail++;
  console.log((cond ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
}

/* ---------- W1 规范 ---------- */
(function () {
  ok('W1.1 非法纬度被拒', W.normalize({ lat: 91, lon: 0 }) === null);
  ok('W1.2 非法经度被拒', W.normalize({ lat: 0, lon: 181 }) === null);
  ok('W1.3 缺坐标被拒', W.normalize({ name: 'x' }) === null);
  var n = W.normalize({ lat: -33.87, lon: 151.21 });
  ok('W1.4 缺省值填充', n && n.fov === 145 && n.pitch === 32 && n.yaw === 180 && n.gear === 'naked',
    JSON.stringify({ fov: n && n.fov, pitch: n && n.pitch, yaw: n && n.yaw, gear: n && n.gear }));
  var c = W.normalize({ lat: 0, lon: 0, fov: 5, pitch: 99, tz: 40, yaw: -30, gear: 'bad' });
  ok('W1.5 越界被夹紧', c.fov === 30 && c.pitch === 78 && c.tz === 14 && c.yaw === 330 && c.gear === 'naked',
    JSON.stringify({ fov: c.fov, pitch: c.pitch, tz: c.tz, yaw: c.yaw, gear: c.gear }));
  ok('W1.6 时区按经度估算', W.normalize({ lat: 39.9, lon: 116.4 }).tz === 8);
})();

/* ---------- W2 列表 ---------- */
(function () {
  var l = W.list([
    { id: 'a', lat: 30, lon: 120 },
    { id: 'a', lat: 31, lon: 121 },
    { id: 'b', lat: 0, lon: 0 },
    { lat: 999, lon: 0 }
  ]);
  ok('W2.1 去重且过滤非法', l.length === 2 && l[0].id === 'a' && l[1].id === 'b', 'n=' + l.length);
  var many = [];
  for (var i = 0; i < 30; i++) many.push({ id: 'i' + i, lat: i, lon: 0 });
  ok('W2.2 上限 ' + W.MAX, W.list(many).length === W.MAX, 'n=' + W.list(many).length);
  ok('W2.3 非数组输入返回空', W.list(null).length === 0 && W.list('x').length === 0);
})();

/* ---------- W3 写入/删除 ---------- */
(function () {
  var l = W.upsert([], { id: 'x', name: 'A', lat: 10, lon: 20, fov: 70 });
  ok('W3.1 新增置顶', l.length === 1 && l[0].id === 'x');
  l = W.upsert(l, { id: 'x', name: 'B', lat: 11, lon: 21, fov: 50 });
  ok('W3.2 同 id 覆盖而非重复', l.length === 1 && l[0].name === 'B' && l[0].fov === 50);
  l = W.upsert(l, { id: 'y', lat: 0, lon: 0 });
  ok('W3.3 新条目排在最前', l[0].id === 'y');
  ok('W3.4 删除生效', W.remove(l, 'y').length === 1 && W.remove(l, 'y')[0].id === 'x');
})();

/* ---------- W4 快照 ---------- */
(function () {
  var s = W.snapshot(
    { name: 'M31', sub: 'M31 · 星系', mag: 3.4, ra: 0.712, dec: 41.27, alt: 55.2 },
    { jd: 2461000.5, lat: 39.9, lon: 116.4, tz: 8, city: '北京', gear: 'binocular' },
    { fov: 70, yaw: 120, pitch: 40 }
  );
  ok('W4.1 目标字段完整', s.name === 'M31' && s.ra === 0.712 && s.mag === 3.4);
  ok('W4.2 观测上下文入档', s.jd === 2461000.5 && s.city === '北京' && s.gear === 'binocular');
  ok('W4.3 视角入档', s.fov === 70 && s.yaw === 120 && s.pitch === 40);
  ok('W4.4 时间为正数', typeof s.at === 'number' && s.at > 0);
})();

/* ---------- W5 CSV ---------- */
(function () {
  var rows = [
    { name: 'M31', sub: 'M31 · 星系', mag: 3.4, ra: 0.712, dec: 41.27, alt: 55.2, city: '北京', gear: 'binocular', at: 1762300000000 },
    { name: '带,逗号"引号', sub: 'x', mag: null, ra: 5, dec: -10, alt: null, city: 'A,B', gear: '', at: null }
  ];
  var csv = W.planCsv(rows);
  var lines = csv.split('\r\n');
  ok('W5.1 表头 10 列', lines[0].split(',').length === 10, lines[0]);
  ok('W5.2 表头 + 2 行 + 空行 + 说明', lines.length === 5, 'lines=' + lines.length);
  ok('W5.3 逗号被引号包裹', csv.indexOf('"带,逗号""引号"') >= 0);
  ok('W5.4 空值不写成 undefined/null', csv.indexOf('undefined') < 0 && csv.indexOf('null') < 0);
  ok('W5.5 含 J2000 与复核提示', /J2000/.test(csv) && /复核/.test(csv));
  ok('W5.6 赤经按小时格式化', A.fmtRA(0.712).length > 0 && csv.indexOf(A.fmtRA(0.712)) >= 0, A.fmtRA(0.712));
  ok('W5.7 空清单只有表头与说明', W.planCsv([]).split('\r\n').length === 3);
})();

console.log('\nRESULT ' + pass + '/' + (pass + fail));
process.exit(fail ? 1 : 0);
