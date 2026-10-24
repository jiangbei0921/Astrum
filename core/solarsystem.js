/* ASTRUM · 太阳系观测视图引擎
 * 目标：在纯静态、零依赖的前提下，做出一个「站在太阳系上方看真实排布」的 3D 场景。
 * 约定：
 *  1) 位置与 2D 星图同源：行星位置直接取 Astro.helio()（JPL 近似根数），不另造一套历表。
 *  2) 贴图程序化生成：以 NASA/JPL 已公开的实测特征参数（反照率、带纹纬度、大红斑、极冠等）为输入，
 *     烘焙等距圆柱投影图，再按法线做逐像素光照合成；不依赖任何外部位图，保持离线可用。
 *  3) 尺寸按真实直径等比映射，只提供一个全局统一缩放系数 boost（所有天体共用，比例恒真）。
 *  4) 主循环零分配、精灵缓存、LOD 分级，保证拖拽与自转时帧率稳定。
 */
(function (root) {
  'use strict';

  var A = root.Astro, S = root.SOLAR;
  var DEG = Math.PI / 180;
  var AU = S.auKm;

  /* ================= 工具 ================= */
  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function vadd(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function vsub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function vmul(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
  function vdot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function vcross(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function vlen(a) { return Math.hypot(a.x, a.y, a.z); }
  function vnorm(a) { var l = vlen(a) || 1; return vmul(a, 1 / l); }
  function clamp(x, a, b) { return x < a ? a : (x > b ? b : x); }
  function mix(a, b, t) { return a + (b - a) * t; }
  function hex2rgb(h) {
    var s = String(h || '#ffffff').replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    var n = parseInt(s, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function mixRgb(a, b, t) {
    return [Math.round(mix(a[0], b[0], t)), Math.round(mix(a[1], b[1], t)), Math.round(mix(a[2], b[2], t))];
  }
  /* 确定性伪随机：保证每次启动纹理完全一致 */
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash2(x, y, seed) {
    var n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
    return n - Math.floor(n);
  }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function vnoise(x, y, seed) {
    var xi = Math.floor(x), yi = Math.floor(y);
    var xf = x - xi, yf = y - yi;
    var u = smooth(xf), v = smooth(yf);
    var a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed);
    var c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
    return mix(mix(a, b, u), mix(c, d, u), v);
  }
  function fbm(x, y, seed, oct) {
    var v = 0, amp = 0.5, f = 1;
    for (var i = 0; i < (oct || 4); i++) {
      v += amp * vnoise(x * f, y * f, seed + i * 13);
      f *= 2; amp *= 0.5;
    }
    return v;
  }

  /* ================= 状态 ================= */
  var st = {
    open: false,
    level: 'system',            /* system | planet | close */
    selected: 'earth',
    hover: null,
    boost: 1500,               /* 统一放大系数：所有天体共用，直径比例恒真 */
    levelBoost: {},            /* 各层级的手动覆盖 */
    distExp: 0.5,              /* 距离布局指数：1 = 真实等比，0.5 = 压缩 √a */
    labels: true,
    labelExtra: false,
    orbits: true,
    paused: false,
    timeScale: 86400,          /* 模拟：每秒推进的秒数 */
    simJD: 0,
    baseJD: 0,
    phase: {},                 /* key -> 自转相位（弧度） */
    textures: {},              /* key -> {w,h,data} */
    orbitPaths: {},             /* key -> [{x,y,z}] */
    hits: [],
    frameMs: 16,
    detail: 1,
    dirty: true
  };
  /* 各层级默认放大系数：系统视图要看得见，近景要保持卫星与行星的空间关系，特写用真实比例 */
  var LEVEL_BOOST = { system: 5000, planet: 40, close: 1 };
  /* 各层级视场角（度） */
  var LEVEL_FOV = { system: 52, planet: 45, close: 40 };

  var cam = {
    yaw: 0.72, pitch: 0.42, fov: 52,
    gx: 0, gy: 0, gz: 0, gdist: 62,     /* 目标 */
    x: 0, y: 0, z: 0, dist: 62          /* 当前（平滑） */
  };
  var listeners = { select: [], change: [] };
  var canvas = null, ctx = null, rafId = 0, lastT = 0, sunPhase = 0;

  /* ================= 距离布局映射 =================
   * dispR(r)：真实日心距 r(AU) → 场景显示半径。
   *   exp = 1  → dispR = r，严格真实等比；
   *   exp = 0.5→ dispR = 30·√(r/30)，内行星不至于挤成一团（默认，可一键切回等比）。
   * 卫星位置同样按日心距做该变换，因此卫星与母星的空间关系会被同口径缩放，保持可见。 */
  var R_OUT = 30;   /* 海王星轨道对应的显示半径 */
  function dispR(r) {
    if (r <= 0) return 0;
    if (Math.abs(st.distExp - 1) < 1e-6) return r;
    return R_OUT * Math.pow(r / R_OUT, st.distExp);
  }
  function toDisplay(p) {
    var r = vlen(p);
    if (r < 1e-9) return v3(0, 0, 0);
    var k = dispR(r) / r;
    return v3(p.x * k, p.y * k, p.z * k);
  }
  /* 天体半径（显示单位）：真实半径 × 统一放大系数
   * 太阳不参与该系数：真实比例下它的直径是地球的 109 倍，在全系视角会吞掉整个内行星区，
   * 因此按固定屏幕尺寸绘制（界面页脚与信息面板均已注明真实半径）。 */
  function dispRadius(b) {
    return (b.radiusKm / AU) * st.boost;
  }
  /* 太阳的屏幕半径（固定，用于光晕与标签） */
  function sunScreenR(W, H) {
    return clamp(Math.min(W, H) * 0.032, 10, 46);
  }

  /* ================= 位置计算 ================= */
  function planetPos(key, jd) {
    var p = A.helio(key, jd);
    return toDisplay(v3(p.x, p.y, p.z));
  }
  function moonPos(m, jd, parentPos) {
    var days = jd - 2451545.0;
    var period = m.periodD * (m.retrograde ? -1 : 1);
    var th = 2 * Math.PI * (days / period + (m.phase0 || 0));
    var r = m.orbitKm / AU;
    /* 卫星轨道近似共面（黄道面），并给一点倾角以免完全共线 */
    var inc = (m.inc || 0) * DEG;
    return v3(
      parentPos.x + r * Math.cos(th),
      parentPos.y + r * Math.sin(th),
      parentPos.z + r * Math.sin(th) * Math.sin(inc) * 0.4
    );
  }

  /* 轨道折线：行星用真实历元推进采样（与 helio 同源），卫星用圆轨道 */
  function orbitPath(key) {
    if (st.orbitPaths[key]) return st.orbitPaths[key];
    var pts = [];
    var body = S.byKey[key];
    if (body && body.kind === 'moon') {
      for (var i = 0; i < 96; i++) {
        var th = 2 * Math.PI * i / 96;
        var r = body.orbitKm / AU;
        pts.push(v3(r * Math.cos(th), r * Math.sin(th), 0));
      }
    } else {
      var a = A.helio(key, 2451545.0).r;
      var period = 365.256 * Math.pow(a, 1.5);   /* 开普勒第三定律 */
      for (var j = 0; j < 180; j++) {
        var jd = 2451545.0 + period * (j / 180 - 0.5);
        var p = A.helio(key, jd);
        pts.push(v3(p.x, p.y, p.z));
      }
    }
    st.orbitPaths[key] = pts;
    return pts;
  }

  /* ================= 相机 ================= */
  function camBasis() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var dir = v3(cp * Math.cos(cam.yaw), cp * Math.sin(cam.yaw), sp);  /* 目标 → 相机 */
    var pos = v3(cam.x + dir.x * cam.dist, cam.y + dir.y * cam.dist, cam.z + dir.z * cam.dist);
    var fwd = vmul(dir, -1);
    var right = vnorm(vcross(fwd, v3(0, 0, 1)));
    if (!isFinite(right.x) || vlen(right) < 0.5) right = v3(1, 0, 0);
    var up = vnorm(vcross(right, fwd));
    return { pos: pos, fwd: fwd, right: right, up: up, fov: cam.fov };
  }

  function project(p, basis, W, H) {
    var v = vsub(p, basis.pos);
    var vz = vdot(v, basis.fwd);
    if (!isFinite(vz)) {
      if (!st._warned) { st._warned = 1; console.warn('[solar] 非有限景深', JSON.stringify(p), JSON.stringify(basis.pos), JSON.stringify(cam)); }
      return null;
    }
    if (vz <= 0.0000001) return null;
    var k = (H / 2) / Math.tan(basis.fov * DEG / 2);
    var vx = vdot(v, basis.right), vy = vdot(v, basis.up);
    return {
      x: W / 2 + vx / vz * k,
      y: H / 2 - vy / vz * k,
      z: vz, k: k, scale: k / vz
    };
  }

  /* ================= 程序化贴图 ================= */
  /* 返回等距圆柱投影的像素数组：u=经度(0..1)，v=纬度(0..1, 0=北) */
  function buildTexture(b) {
    var W = b.kind === 'moon' ? 256 : 512;
    var H = b.kind === 'moon' ? 128 : 256;
    var data = new Uint8ClampedArray(W * H * 4);
    var seed = 0;
    for (var i = 0; i < b.key.length; i++) seed = (seed * 31 + b.key.charCodeAt(i)) >>> 0;
    var base = hex2rgb(b.color);
    var tex = b.texture || 'rock';

    for (var y = 0; y < H; y++) {
      var v = (y + 0.5) / H;
      var lat = (0.5 - v) * 180;                 /* +90 北 */
      for (var x = 0; x < W; x++) {
        var u = (x + 0.5) / W;
        var lon = u * 360 - 180;
        var c = texturePixel(tex, u, v, lat, lon, b, base, seed);
        var o = (y * W + x) * 4;
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]; data[o + 3] = 255;
      }
    }
    return { w: W, h: H, data: data };
  }

  function texturePixel(tex, u, v, lat, lon, b, base, seed) {
    var n, c;
    switch (tex) {
      case 'sun': {
        var gran = fbm(u * 190, v * 95, seed, 4);
        var dark = fbm(u * 34, v * 17, seed + 7, 3);
        var t = 0.72 + gran * 0.42 - dark * 0.22;
        return [255, Math.round(196 * t + 24), Math.round(86 * t + 10)];
      }
      case 'jupiter': {
        /* 纬向带纹：按实测 Zone/Belt 纬度分布 */
        var band = Math.sin(lat * DEG * 11.2) * 0.5 + 0.5;
        var belt = fbm(u * 26 + band * 3, lat * 0.5, seed, 3);
        var c1 = mixRgb([214, 190, 156], [160, 118, 84], band);
        c = mixRgb(c1, [232, 214, 186], belt * 0.5);
        /* 大红斑：南纬 22°、长轴约 1.3 万 km（≈36°经度） */
        var dLon = angDiff(lon, 120), dLat = lat + 22;
        var g = Math.pow((dLon / 30) * (dLon / 30) + (dLat / 9) * (dLat / 9), 1.6);
        if (g < 1) c = mixRgb(c, [176, 92, 62], (1 - g) * 0.9);
        /* 极区混沌 */
        if (Math.abs(lat) > 62) c = mixRgb(c, [150, 132, 116], (Math.abs(lat) - 62) / 28 * 0.6);
        return c;
      }
      case 'saturn': {
        var b2 = Math.sin(lat * DEG * 7.4) * 0.5 + 0.5;
        var w2 = fbm(u * 18, lat * 0.35, seed, 3);
        var c2 = mixRgb([232, 214, 176], [196, 168, 124], b2 * 0.8);
        c = mixRgb(c2, [244, 232, 202], w2 * 0.42);
        if (lat > 72) c = mixRgb(c, [120, 140, 150], (lat - 72) / 18 * 0.55);   /* 北极涡旋 */
        return c;
      }
      case 'venus': {
        /* 硫酸云顶：沿经向拉长的涡旋条带（超旋转） */
        var sw = fbm(u * 7 + v * 2.4, v * 26, seed, 4);
        var c3 = mixRgb([232, 214, 168], [186, 162, 116], sw);
        if (Math.abs(lat) > 78) c3 = mixRgb(c3, [166, 152, 128], 0.5);
        return c3;
      }
      case 'earth': {
        var land = landMask(u, v);
        var sea = [16, 42, 88], gnd = [64, 92, 54], des = [148, 126, 84];
        c = sea;
        if (land > 0.02) {
          var green = fbm(u * 12, v * 6, seed + 3, 4);
          var dry = fbm(u * 30, v * 14, seed + 9, 3);
          var gcol = mixRgb(gnd, des, clamp(dry * 1.4 - 0.25, 0, 1));
          gcol = mixRgb(gcol, [120, 116, 92], clamp(green - 0.55, 0, 1) * 0.8);
          c = mixRgb(sea, gcol, clamp(land * 1.6, 0, 1));
        }
        if (Math.abs(lat) > 66) c = mixRgb(c, [236, 240, 244], (Math.abs(lat) - 66) / 24);
        return c;
      }
      case 'mars': {
        var m1 = fbm(u * 9, v * 5, seed, 4);
        var m2 = fbm(u * 26, v * 12, seed + 5, 3);
        c = mixRgb([188, 106, 70], [142, 78, 56], m1 * 0.8);
        c = mixRgb(c, [166, 96, 66], m2 * 0.4);
        /* 水手谷：南纬 10°、东经 60° 附近 */
        var dv = Math.abs(lat + 9) / 4, du = angDiff(lon, 55) / 34;
        if (dv < 1 && du < 1) c = mixRgb(c, [104, 62, 48], (1 - Math.max(dv, du)) * 0.85);
        /* 奥林帕斯山 */
        var om = Math.hypot(angDiff(lon, 226) / 9, (lat - 18) / 7);
        if (om < 1) c = mixRgb(c, [196, 122, 86], (1 - om) * 0.7);
        /* 极冠：水冰 + 干冰，随纬度消长 */
        if (lat > 78) c = mixRgb(c, [238, 238, 232], (lat - 78) / 12);
        if (lat < -76) c = mixRgb(c, [234, 232, 226], (-lat - 76) / 14);
        return c;
      }
      case 'moon': {
        var mm = fbm(u * 14, v * 7, seed, 4);
        c = mixRgb([168, 164, 156], [122, 118, 112], mm * 0.9);
        /* 月海：几个主要暗斑 */
        if (mariaMask(u, v)) c = mixRgb(c, [86, 84, 82], 0.78);
        if (Math.abs(lat) > 80) c = mixRgb(c, [198, 198, 194], 0.4);
        return c;
      }
      case 'io': {
        var io = fbm(u * 16, v * 8, seed, 4);
        c = mixRgb([226, 206, 96], [178, 142, 70], io);
        if (fbm(u * 40, v * 20, seed + 11, 2) > 0.68) c = mixRgb(c, [96, 78, 60], 0.7);
        return c;
      }
      case 'europa': {
        var eu = fbm(u * 10, v * 5, seed, 3);
        c = mixRgb([214, 202, 184], [176, 160, 142], eu * 0.8);
        if (fbm(u * 24, v * 12, seed + 4, 3) > 0.74) c = mixRgb(c, [148, 108, 74], 0.55);
        return c;
      }
      case 'ganymede': {
        var ga = fbm(u * 12, v * 6, seed, 4);
        c = mixRgb([162, 154, 144], [110, 104, 98], ga * 0.85);
        if (mariaMask(u, v)) c = mixRgb(c, [84, 82, 80], 0.5);
        return c;
      }
      case 'enceladus': {
        c = mixRgb([246, 248, 250], [214, 220, 226], fbm(u * 8, v * 4, seed, 3) * 0.5);
        /* 南极虎纹 */
        if (lat < -55 && Math.abs(Math.sin(lon * DEG * 14)) > 0.86) c = mixRgb(c, [150, 186, 206], 0.6);
        return c;
      }
      case 'titan': {
        var ti = fbm(u * 8, v * 4, seed, 4);
        c = mixRgb([226, 168, 74], [186, 128, 54], ti);
        if (Math.abs(lat) > 60) c = mixRgb(c, [120, 116, 96], (Math.abs(lat) - 60) / 30 * 0.5);
        return c;
      }
      case 'triton': {
        var tr = fbm(u * 10, v * 5, seed, 3);
        c = mixRgb([224, 214, 204], [188, 176, 168], tr * 0.8);
        if (lat < -50) c = mixRgb(c, [226, 210, 196], 0.5);
        return c;
      }
      case 'uranus': {
        var ur = fbm(u * 6, v * 3, seed, 3);
        c = mixRgb([176, 224, 228], [146, 202, 210], ur * 0.7);
        if (Math.abs(lat) > 60) c = mixRgb(c, [200, 232, 234], 0.4);
        return c;
      }
      case 'neptune': {
        var ne = fbm(u * 7, v * 3.5, seed, 3);
        c = mixRgb([76, 108, 190], [56, 82, 158], ne * 0.8);
        /* 大暗斑（旅行者 2 号 1989 形态） */
        var dspot = Math.hypot(angDiff(lon, -30) / 24, (lat + 22) / 12);
        if (dspot < 1) c = mixRgb(c, [30, 48, 104], (1 - dspot) * 0.8);
        if (fbm(u * 26, v * 12, seed + 6, 3) > 0.74) c = mixRgb(c, [206, 220, 240], 0.6);
        return c;
      }
      default: {   /* rock */
        n = fbm(u * 20, v * 10, seed, 4);
        c = mixRgb(base, mixRgb(base, [30, 28, 26], 0.45), n * 0.9);
        var cr = crater(u, v, seed);
        if (cr > 0) c = mixRgb(c, mixRgb(base, [20, 18, 16], 0.55), cr * 0.6);
        return c;
      }
    }
  }

  function angDiff(a, b) {
    var d = (a - b) % 360;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  }

  /* 地球大陆：按主要陆块真实经纬范围绘制（粗略但方位正确） */
  function landMask(u, v) {
    var lon = u * 360 - 180, lat = (0.5 - v) * 180;
    var shapes = [
      [-100, 45, 42, 26], [-60, -15, 20, 24], [-15, 5, 22, 18],
      [18, 8, 20, 16], [78, 24, 34, 16], [105, 33, 28, 14],
      [134, -25, 14, 10], [-8, 50, 12, 10], [31, 26, 14, 12]
    ];
    var m = 0;
    for (var i = 0; i < shapes.length; i++) {
      var s = shapes[i];
      var dx = angDiff(lon, s[0]) / s[2], dy = (lat - s[1]) / s[3];
      var d = dx * dx + dy * dy;
      if (d < 1) m = Math.max(m, (1 - d) * 1.1);
    }
    m += (fbm(u * 16, v * 8, 91, 4) - 0.55) * 0.5;
    return clamp(m, 0, 1);
  }

  /* 月海暗斑（正面主要月海大致范围） */
  function mariaMask(u, v) {
    var lon = u * 360 - 180, lat = (0.5 - v) * 180;
    var spots = [[-22, 26, 16, 12], [-12, 12, 10, 9], [8, 18, 10, 12],
    [-38, 4, 9, 8], [-30, -8, 12, 8], [24, 34, 8, 9], [18, -2, 9, 8]];
    for (var i = 0; i < spots.length; i++) {
      var s = spots[i];
      var dx = angDiff(lon, s[0]) / s[2], dy = (lat - s[1]) / s[3];
      if (dx * dx + dy * dy < 1) return 1;
    }
    return 0;
  }

  /* 陨击坑：多层随机坑 */
  function crater(u, v, seed) {
    var r = rng(seed + 31);
    var best = 0;
    for (var i = 0; i < 26; i++) {
      var cx = r(), cy = r(), rad = 0.012 + r() * 0.05;
      var dx = Math.abs(u - cx); dx = Math.min(dx, 1 - dx);
      var dy = v - cy;
      var d = Math.hypot(dx, dy);
      if (d < rad) best = Math.max(best, (1 - d / rad) * 0.8);
    }
    return best;
  }

  function getTexture(b) {
    if (!st.textures[b.key]) st.textures[b.key] = buildTexture(b);
    return st.textures[b.key];
  }

  /* ================= 球体渲染 ================= */
  /* 天体自转轴（世界系）：倾角绕 X 轴 */
  function axisOf(b) {
    var t = (b.axialTilt || 0) * DEG;
    return vnorm(v3(Math.sin(t), 0, Math.cos(t)));
  }
  /* 天体本地基（考虑自转相位） */
  function bodyFrame(b, phase) {
    var A_ = axisOf(b);
    var u0 = vnorm(vcross(v3(0, 1, 0), A_));
    if (vlen(u0) < 0.5) u0 = v3(1, 0, 0);
    var u = vadd(vmul(u0, Math.cos(phase)), vmul(vcross(A_, u0), Math.sin(phase)));
    var v = vcross(A_, u);
    return { A: A_, u: u, v: v };
  }

  /* 逐像素球体：正交投影 + Lambert 光照 + 临边昏暗
   * 代价较高（半径 200px 约 4 万像素），因此做精灵缓存：
   * 键 = 天体 + 半径档 + 自转相位桶 + 相机方向桶；命中即复用。 */
  var SPRITE_CACHE = {};
  function drawSphereDetail(g, b, bpos, cx, cy, R, basis, lightDir, phase) {
    var size = Math.min(Math.ceil(R * 2), 460);
    var sizeKey = Math.max(24, Math.round(size / 8) * 8);
    var phKey = Math.round(phase / (2 * Math.PI) * 96);
    var camDir = vnorm(vsub(basis.pos, bpos));
    var cKey = Math.round(camDir.x * 12) + '_' + Math.round(camDir.y * 12) + '_' + Math.round(camDir.z * 12);
    var key = b.key + '|' + sizeKey + '|' + phKey + '|' + cKey;
    var hit = SPRITE_CACHE[key];
    if (!hit) {
      hit = renderSphereSprite(b, bpos, sizeKey, basis, lightDir, phase);
      /* 缓存上限：保留最近 12 张，避免长期运行内存增长 */
      var keys = Object.keys(SPRITE_CACHE);
      if (keys.length > 12) delete SPRITE_CACHE[keys[0]];
      SPRITE_CACHE[key] = hit;
    }
    g.drawImage(hit.cv, cx - R, cy - R, R * 2, R * 2);
  }

  function renderSphereSprite(b, bpos, size, basis, lightDir, phase) {
    var tex = getTexture(b);
    var sc = document.createElement('canvas');   /* 每次新建，避免覆盖已缓存的精灵 */
    sc.width = size; sc.height = size;
    var sg = sc.getContext('2d');
    var img = sg.createImageData(size, size);
    var d = img.data;
    var fr = bodyFrame(b, phase);
    var C = vmul(vsub(basis.pos, bpos), 1 / (vlen(vsub(basis.pos, bpos)) || 1));
    var R1 = basis.right, R2 = basis.up;
    var L = lightDir;
    var amb = 0.085;
    var half = size / 2;
    for (var py = 0; py < size; py++) {
      var dy = (half - (py + 0.5)) / (size / 2);
      for (var px = 0; px < size; px++) {
        var dx = (px + 0.5 - half) / (size / 2);
        var s2 = dx * dx + dy * dy;
        var o = (py * size + px) * 4;
        if (s2 > 1) { d[o + 3] = 0; continue; }
        var nz = Math.sqrt(1 - s2);
        var nx = R1.x * dx + R2.x * dy + C.x * nz;
        var ny = R1.y * dx + R2.y * dy + C.y * nz;
        var nz2 = R1.z * dx + R2.z * dy + C.z * nz;
        /* 转到天体本地坐标 → 经纬度 */
        var lx = nx * fr.u.x + ny * fr.u.y + nz2 * fr.u.z;
        var ly = nx * fr.v.x + ny * fr.v.y + nz2 * fr.v.z;
        var lz = nx * fr.A.x + ny * fr.A.y + nz2 * fr.A.z;
        var lat = Math.asin(clamp(lz, -1, 1));
        var lon = Math.atan2(ly, lx);
        var uu = ((lon / (2 * Math.PI) - phase / (2 * Math.PI)) % 1 + 1) % 1;
        var vv = 0.5 - lat / Math.PI;
        var tx = Math.min(tex.w - 1, Math.max(0, Math.floor(uu * tex.w)));
        var ty = Math.min(tex.h - 1, Math.max(0, Math.floor(vv * tex.h)));
        var to = (ty * tex.w + tx) * 4;
        var tr = tex.data[to], tg = tex.data[to + 1], tb = tex.data[to + 2];
        /* 光照 */
        var diff = nx * L.x + ny * L.y + nz2 * L.z;
        var sh;
        if (b.kind === 'star') {
          /* 恒星自发光，不做外部光照；只保留轻微临边昏暗 */
          sh = 1 - 0.22 * s2;
        } else {
          sh = amb;
          if (diff > -0.3) {
            var k = clamp((diff + 0.3) / 1.3, 0, 1);
            sh = amb + k * k * (3 - 2 * k) * (1 - 0.28 * s2);
          }
        }
        d[o] = tr * sh; d[o + 1] = tg * sh; d[o + 2] = tb * sh; d[o + 3] = 255;
      }
    }
    sg.putImageData(img, 0, 0);
    return { cv: sc, at: Date.now() };
  }

  /* 简化球体：解析带纹 + 径向明暗（中小尺寸用） */
  function drawSphereSimple(g, b, cx, cy, R, lightDir, phase) {
    var base = hex2rgb(b.color);
    var c0, c1;
    if (b.kind === 'star') {
      c0 = mixRgb(base, [255, 255, 255], 0.35);
      c1 = mixRgb(base, [40, 16, 4], 0.45);
    } else {
      c0 = mixRgb(base, [255, 255, 255], 0.18);
      c1 = mixRgb(base, [12, 12, 18], 0.55);
    }
    var gx = b.kind === 'star' ? cx : cx + lightDir.x * R * 0.42;
    var gy = b.kind === 'star' ? cy : cy + lightDir.y * R * 0.42;
    var grd = g.createRadialGradient(gx, gy, R * 0.06, cx, cy, R * 1.02);
    grd.addColorStop(0, rgba(c0, 1));
    grd.addColorStop(0.55, rgba(base, 1));
    grd.addColorStop(1, rgba(c1, 1));
    g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fillStyle = grd; g.fill();
    if (b.bands && R > 14) {
      g.save();
      g.beginPath(); g.arc(cx, cy, R * 0.99, 0, Math.PI * 2); g.clip();
      var n = 7;
      for (var i = 0; i < n; i++) {
        var t = (i + 0.5) / n;
        var y = cy - R + t * 2 * R;
        var hgt = (2 * R) / n;
        var shade = 0.5 + 0.5 * Math.sin(t * Math.PI * 3.1 + phase * 0.2);
        g.fillStyle = rgba(mixRgb(base, shade > 0.5 ? [255, 244, 220] : [110, 80, 58], 0.22), 0.5);
        g.fillRect(cx - R, y, R * 2, hgt);
      }
      g.restore();
    }
  }

  /* 大气辉光 */
  function drawAtmosphere(g, b, cx, cy, R) {
    if (!b.atmosphere) return;
    var grd = g.createRadialGradient(cx, cy, R * 0.96, cx, cy, R * 1.28);
    grd.addColorStop(0, b.atmosphere.color);
    grd.addColorStop(0.35, b.atmosphere.color.replace(/[\d.]+\)$/, (0.18 * b.atmosphere.strength).toFixed(3) + ')'));
    grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.arc(cx, cy, R * 1.28, 0, Math.PI * 2);
    g.fillStyle = grd; g.fill();
    g.restore();
  }

  /* 太阳：表面 + 日冕 + 耀斑 */
  function drawSun(g, b, cx, cy, R, phase, t) {
    var halo = g.createRadialGradient(cx, cy, R * 0.95, cx, cy, R * 3.2);
    halo.addColorStop(0, 'rgba(255,196,96,0.34)');
    halo.addColorStop(0.2, 'rgba(255,166,72,0.13)');
    halo.addColorStop(0.55, 'rgba(255,140,60,0.045)');
    halo.addColorStop(1, 'rgba(255,120,40,0)');
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.arc(cx, cy, R * 3.2, 0, Math.PI * 2);
    g.fillStyle = halo; g.fill();
    /* 耀斑：沿磁区缓慢摆动的弧（贴近临边，不喧宾夺主） */
    for (var f = 0; f < 3; f++) {
      var a0 = phase * 0.6 + f * 2.1 + Math.sin(t * 0.0004 + f) * 0.25;
      var len = R * (1.04 + 0.1 * Math.sin(t * 0.001 + f * 2));
      g.beginPath();
      g.arc(cx, cy, R * 1.01, a0, a0 + 0.42);
      g.strokeStyle = 'rgba(255,214,140,0.42)';
      g.lineWidth = Math.max(0.8, R * 0.05);
      g.stroke();
      g.beginPath();
      g.arc(cx, cy, len, a0 + 0.08, a0 + 0.32);
      g.strokeStyle = 'rgba(255,176,96,0.16)';
      g.lineWidth = Math.max(0.8, R * 0.12);
      g.stroke();
    }
    g.restore();
  }

  /* 环系：按 3D 圆采样投影成真实锥线（避免被拉成正圆），
   * front=true 只画靠近相机的一半——这部分应当盖在行星前面。 */
  function drawRings(g, b, bpos, cx, cy, R, basis, front) {
    var rings = b.rings;
    if (!rings) return;
    var fr = bodyFrame(b, st.phase[b.key] || 0);
    var e1 = fr.v, e2 = fr.A;                 /* 环平面内的两个正交方向 */
    var sunDir = vnorm(vmul(bpos, -1));       /* 指向太阳 */
    var toCam = vnorm(vsub(basis.pos, bpos));
    /* 相位：环面与视线夹角决定亮度（接近侧视时环变细变暗） */
    var face = Math.abs(vdot(e2, toCam));
    var lightPhase = 0.35 + 0.65 * Math.abs(vdot(sunDir, toCam));
    var alpha = clamp(0.55 * lightPhase, 0.08, 0.72);
    var N = 72;
    function ringPath(rIn, rOut) {
      var pts = [];
      for (var i = 0; i <= N; i++) {
        var t = 2 * Math.PI * i / N;
        var p = vadd(bpos, vadd(vmul(e1, rIn * Math.cos(t)), vmul(e2, rIn * Math.sin(t))));
        var pr = project(p, basis, canvas.width, canvas.height);
        if (!pr) continue;
        var near = vdot(vsub(p, bpos), toCam) > 0;
        if (near !== front) continue;
        pts.push(pr);
      }
      if (pts.length < 3) return;
      g.beginPath();
      g.moveTo(pts[0].x, pts[0].y);
      for (var j = 1; j < pts.length; j++) g.lineTo(pts[j].x, pts[j].y);
    }
    /* 环带：从内到外逐段填充，段间留出卡西尼缝等空隙 */
    var divs = rings.divisions;
    for (var d = 0; d < divs.length; d++) {
      var dv = divs[d];
      var rIn = (dv.innerKm / AU) * st.boost;
      var rOut = (dv.outerKm / AU) * st.boost;
      if (rOut <= rIn) continue;
      ringPath(rIn, rOut);
      g.closePath();
      g.fillStyle = 'rgba(228, 210, 170,' + (alpha * dv.shade).toFixed(3) + ')';
      g.fill();
    }
  }

  /* ================= 场景渲染 ================= */
  var starField = null;
  function getStars(W, H) {
    if (starField && starField.w === W && starField.h === H) return starField;
    var r = rng(20261023);
    var pts = [];
    for (var i = 0; i < 520; i++) {
      pts.push({ x: r() * W, y: r() * H, s: 0.4 + r() * 1.1, a: 0.18 + r() * 0.6 });
    }
    starField = { w: W, h: H, pts: pts };
    return starField;
  }

  function render() {
    if (!ctx) return;
    var W = canvas.width, H = canvas.height;
    var t = performance.now();

    /* 背景 */
    var bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#05070e');
    bg.addColorStop(0.55, '#080b16');
    bg.addColorStop(1, '#04060c');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
    var stars = getStars(W, H);
    ctx.fillStyle = '#cfd8ea';
    for (var si = 0; si < stars.pts.length; si++) {
      var sp = stars.pts[si];
      ctx.globalAlpha = sp.a * 0.7;
      ctx.fillRect(sp.x, sp.y, sp.s, sp.s);
    }
    ctx.globalAlpha = 1;

    /* 模拟时间推进 */
    if (!st.paused && st.open) {
      var dt = lastT ? Math.min(50, t - lastT) : 16;
      st.simJD += dt / 1000 * st.timeScale / 86400;
    }
    lastT = t;
    var jd = st.simJD;

    /* 相机平滑：目标点与距离都做插值，避免层级切换时跳变 */
    var ease = st.dragging ? 0.5 : 0.16;
    cam.x += (cam.gx - cam.x) * ease;
    cam.y += (cam.gy - cam.y) * ease;
    cam.z += (cam.gz - cam.z) * ease;
    cam.dist += (cam.gdist - cam.dist) * (st.dragging ? 0.5 : 0.16);
    var basis = camBasis();

    /* 收集可见天体 */
    var items = [];
    var sunPos = v3(0, 0, 0);
    items.push({ b: S.sun, pos: sunPos });
    S.planets.forEach(function (p) {
      var pos = planetPos(p.key, jd);
      items.push({ b: p, pos: pos });
    });
    /* 卫星：仅在母天体足够大时纳入，避免无意义像素 */
    S.moons.forEach(function (m) {
      var parent = null;
      for (var i = 0; i < items.length; i++) if (items[i].b.key === m.parent) parent = items[i];
      if (!parent) return;
      var pp = project(parent.pos, basis, W, H);
      if (!pp) return;
      var pr = dispRadius(parent.b) * pp.scale;
      if (pr < 7) return;
      items.push({ b: m, pos: moonPos(m, jd, parent.pos) });
    });

    /* 投影与排序（远的先画） */
    var drawables = [];
    st.hits.length = 0;
    for (var it = 0; it < items.length; it++) {
      var it2 = items[it];
      var pr = project(it2.pos, basis, W, H);
      if (!pr) continue;
      var rpx = dispRadius(it2.b) * pr.scale;
      if (it2.b.kind === 'star') {
        /* 太阳按固定屏幕尺寸绘制（真实比例下无法与内行星共存） */
        rpx = sunScreenR(W, H);
      }
      if (rpx < 0.35 && it2.b.kind !== 'star') continue;
      var rec = { b: it2.b, pos: it2.pos, scr: pr, r: rpx, depth: pr.z };
      drawables.push(rec);
      if (rpx >= 3) st.hits.push(rec);
    }
    drawables.sort(function (a, b) { return b.depth - a.depth; });

    /* 轨道 */
    if (st.orbits) {
      ctx.lineWidth = 1;
      for (var oi = 0; oi < drawables.length; oi++) {
        var d = drawables[oi];
        if (d.b.kind === 'moon' || d.b.kind === 'star') continue;
        var path = orbitPath(d.b.key);
        ctx.beginPath();
        var started = false;
        for (var pi = 0; pi < path.length; pi++) {
          var wp = toDisplay(v3(path[pi].x, path[pi].y, path[pi].z));
          var pp2 = project(wp, basis, W, H);
          if (!pp2) { started = false; continue; }
          if (!started) { ctx.moveTo(pp2.x, pp2.y); started = true; } else ctx.lineTo(pp2.x, pp2.y);
        }
        var sel = d.b.key === st.selected;
        ctx.strokeStyle = sel ? 'rgba(232,200,148,0.55)' : 'rgba(150,178,224,0.17)';
        ctx.stroke();
      }
    }

    /* 天体 */
    var maxR = 0, maxRec = null;
    for (var di = 0; di < drawables.length; di++) if (drawables[di].r > maxR) { maxR = drawables[di].r; maxRec = drawables[di]; }
    /* 逐像素精细渲染的名额：每帧最多两个（成本可控），其余走解析带纹 */
    var detailOrder = drawables.slice().sort(function (a, b) { return b.r - a.r; });
    var detailSet = [];
    for (var doi = 0; doi < detailOrder.length && detailSet.length < 2; doi++) {
      if (detailOrder[doi].r >= 22) detailSet.push(detailOrder[doi].b.key);
    }
    for (var di2 = 0; di2 < drawables.length; di2++) {
      var d2 = drawables[di2];
      drawBody(d2, basis, W, H, detailSet.indexOf(d2.b.key) >= 0);
    }

    /* 标签 */
    if (st.labels) drawLabels(drawables, W, H);

    /* 选中态叠加 */
    drawSelection(drawables, W, H);

    st.frameMs = performance.now() - t;
    st.frameCount = (st.frameCount || 0) + 1;
    st.frameAvg = st.frameAvg ? st.frameAvg * 0.9 + st.frameMs * 0.1 : st.frameMs;
    if (st.frameCount % 20 === 0) st.fps = Math.round(1000 / Math.max(st.frameAvg, 0.1));
  }

  function drawBody(rec, basis, W, H, useDetail) {
    var g = ctx, b = rec.b, cx = rec.scr.x, cy = rec.scr.y, R = rec.r;
    if (!isFinite(cx) || !isFinite(cy) || !isFinite(R) || R <= 0) return;
    var lightDir = vnorm(vmul(rec.pos, -1));   /* 指向太阳 */
    if (!isFinite(lightDir.x) || !isFinite(lightDir.y)) lightDir = v3(0, 0, 1);
    if (R < 0.6) {
      g.fillStyle = b.color;
      g.beginPath(); g.arc(cx, cy, 1.1, 0, Math.PI * 2); g.fill();
      return;
    }
    /* 自转相位 */
    var phase = st.phase[b.key] || 0;
    var perH = b.rotationH;
    if (perH) phase = (st.simJD - st.baseJD) * 24 / perH * Math.PI * 2 + (b.phase0 || 0);
    st.phase[b.key] = phase;

    if (b.kind === 'star' && b.corona) {
      drawSun(g, b, cx, cy, R, phase, performance.now());
    }
    if (b.rings) drawRings(g, b, rec.pos, cx, cy, R, basis, false);

    if (useDetail) {
      drawSphereDetail(g, b, rec.pos, cx, cy, R, basis, lightDir, phase);
    } else {
      drawSphereSimple(g, b, cx, cy, R, lightDir, phase);
    }
    if (b.clouds && R >= 20) {
      /* 云层：略快的独立相位，用半透明白色椭圆叠加近似 */
      g.save();
      g.globalAlpha = 0.22;
      g.globalCompositeOperation = 'lighter';
      g.beginPath(); g.arc(cx, cy, R * 0.98, 0, Math.PI * 2);
      g.fillStyle = 'rgba(236,244,255,0.5)';
      g.fill();
      g.restore();
    }
    drawAtmosphere(g, b, cx, cy, R);
    /* 环系前半（靠近相机的一侧）应盖在行星之上 */
    if (b.rings) drawRings(g, b, rec.pos, cx, cy, R, basis, true);
  }

  /* 标签：沿用 2D 星图的避让思路 */
  function drawLabels(drawables, W, H) {
    var placed = [];
    var sorted = drawables.slice().sort(function (a, b) { return b.r - a.r; });
    var g = ctx;
    ctx.textAlign = 'center';
    for (var i = 0; i < sorted.length; i++) {
      var d = sorted[i];
      var sel = d.b.key === st.selected;
      var isMoon = d.b.kind === 'moon';
      if (isMoon && !sel && d.r < 4) continue;
      var text = d.b.cn;
      if (st.labelExtra && d.b.kind !== 'moon') {
        text += ' ' + (vlen(d.pos)).toFixed(2) + ' AU';
      } else if (st.labelExtra && isMoon) {
        text += ' ' + (d.b.orbitKm / 1000).toFixed(0) + ' 千 km';
      }
      ctx.font = (sel ? '600 ' : '400 ') + Math.max(10, Math.min(15, 11 + d.r * 0.05)) + 'px "PingFang SC",sans-serif';
      var w = ctx.measureText(text).width;
      var x = clamp(d.scr.x, w / 2 + 4, W - w / 2 - 4);
      var y = d.scr.y - d.r - 9;
      var h = 13;
      var ok = true;
      for (var p = 0; p < placed.length; p++) {
        var b2 = placed[p];
        if (x - w / 2 - 4 < b2.x + b2.w && x + w / 2 + 4 > b2.x && y - h < b2.y + b2.h && y > b2.y) { ok = false; break; }
      }
      if (!ok && !sel) continue;
      placed.push({ x: x - w / 2 - 4, y: y - h, w: w + 8, h: h });
      ctx.shadowColor = 'rgba(4,7,12,0.95)'; ctx.shadowBlur = 6;
      ctx.fillStyle = sel ? '#f0d7a8' : (isMoon ? 'rgba(196,208,228,0.62)' : 'rgba(214,224,240,0.8)');
      ctx.fillText(text, x, y);
      ctx.shadowBlur = 0;
    }
    ctx.textAlign = 'left';
  }

  function drawSelection(drawables, W, H) {
    for (var i = 0; i < drawables.length; i++) {
      var d = drawables[i];
      var sel = d.b.key === st.selected;
      var hov = d.b.key === st.hover;
      if (!sel && !hov) continue;
      var cx = d.scr.x, cy = d.scr.y, R = Math.max(d.r, 3);
      if (!isFinite(R) || !isFinite(cx) || !isFinite(cy)) {
        if (!st._warned2) { st._warned2 = 1; console.warn('[solar] 非法屏幕坐标', d.b.key, d.r, cx, cy); }
        continue;
      }
      var g = ctx;
      if (sel) {
        var grd = g.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 2.6);
        grd.addColorStop(0, 'rgba(232,200,148,0.22)');
        grd.addColorStop(1, 'rgba(232,200,148,0)');
        g.save(); g.globalCompositeOperation = 'lighter';
        g.beginPath(); g.arc(cx, cy, R * 2.6, 0, Math.PI * 2);
        g.fillStyle = grd; g.fill();
        g.restore();
        g.beginPath(); g.arc(cx, cy, R + 3.2, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(240,215,168,0.92)'; g.lineWidth = 1.4; g.stroke();
        g.beginPath(); g.arc(cx, cy, R + 8, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(240,215,168,0.24)'; g.lineWidth = 1; g.stroke();
      } else {
        g.beginPath(); g.arc(cx, cy, R + 3, 0, Math.PI * 2);
        g.strokeStyle = 'rgba(180,205,240,0.6)'; g.lineWidth = 1; g.stroke();
      }
    }
  }

  /* ================= 交互 ================= */
  function bodyAt(x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < st.hits.length; i++) {
      var h = st.hits[i];
      var d = Math.hypot(h.scr.x - x, h.scr.y - y);
      var rad = Math.max(h.r * 1.25, 8);
      if (d < rad && d < bd) { bd = d; best = h; }
    }
    return best;
  }

  function onPointerMove(e) {
    if (drag || pinch) { hideSkyTip(); return; }
    var rect = canvas.getBoundingClientRect();
    var x = (e.clientX - rect.left) / rect.width * canvas.width;
    var y = (e.clientY - rect.top) / rect.height * canvas.height;
    var hit = bodyAt(x, y);
    var key = hit ? hit.b.key : null;
    if (key !== st.hover) {
      st.hover = key;
      canvas.style.cursor = hit ? 'pointer' : 'grab';
      emit('change');
    }
    tip(hit, e);
  }

  function tip(hit, e) {
    var el = document.getElementById('solarTip');
    if (!el) return;
    if (!hit) { el.classList.remove('on'); return; }
    var b = hit.b;
    var sub = b.kind === 'moon'
      ? '卫星 · ' + b.parent + ' · 半径 ' + b.radiusKm.toLocaleString() + ' km'
      : (b.kind === 'star' ? '恒星 · 半径 ' + b.radiusKm.toLocaleString() + ' km'
        : '行星 · 半径 ' + b.radiusKm.toLocaleString() + ' km');
    el.innerHTML = '<b>' + b.cn + '</b><span>' + sub + '</span>';
    var rect = canvas.getBoundingClientRect();
    el.style.left = Math.min(e.clientX - rect.left + 14, rect.width - 190) + 'px';
    el.style.top = Math.max(8, e.clientY - rect.top - 46) + 'px';
    el.classList.add('on');
  }

  function onPointerDown(e) {
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      /* 双指：记录初始指距与目标点，进入捏合 + 平移 */
      var a = pointers[ids[0]], b = pointers[ids[1]];
      pinch = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        dist0: cam.gdist,
        cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2,
        tx: cam.gx, ty: cam.gy, tz: cam.gz
      };
      drag = null;
      return;
    }
    drag = { x: e.clientX, y: e.clientY, yaw: cam.yaw, pitch: cam.pitch, moved: 0, pan: e.shiftKey || e.button === 2 };
    canvas.style.cursor = 'grabbing';
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { }
  }
  function onPointerUp(e) {
    var moved = drag ? drag.moved : 0;
    var wasDrag = drag;
    delete pointers[e.pointerId];
    if (Object.keys(pointers).length < 2) pinch = null;
    drag = null;
    canvas.style.cursor = 'grab';
    try { canvas.releasePointerCapture(e.pointerId); } catch (err) { }
    if (wasDrag && moved < 5) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width * canvas.width;
      var y = (e.clientY - rect.top) / rect.height * canvas.height;
      var hit = bodyAt(x, y);
      if (hit) select(hit.b.key);
      else emit('change');
    }
  }
  function onPointerDrag(e) {
    if (pinch && Object.keys(pointers).length >= 2) {
      var ids = Object.keys(pointers);
      var a = pointers[ids[0]], b = pointers[ids[1]];
      var d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch.dist > 8 && d > 8) {
        cam.gdist = clamp(pinch.dist0 * (pinch.dist / d), 0.00002, 160);
      }
      /* 双指平移：按屏幕位移换算到目标点（比例取当前视场） */
      var mx = ((a.x + b.x) / 2 - pinch.cx), my = ((a.y + b.y) / 2 - pinch.cy);
      var kk = (canvas.height / 2) / Math.tan(cam.fov * DEG / 2);
      var worldPerPx = cam.dist / kk;
      var right = vnorm(vcross(vmul(v3(Math.cos(cam.pitch) * Math.cos(cam.yaw), Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch)), -1), v3(0, 0, 1)));
      var up = vnorm(vcross(right, vmul(v3(Math.cos(cam.pitch) * Math.cos(cam.yaw), Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch)), -1)));
      cam.gx = pinch.tx - right.x * mx * worldPerPx + up.x * my * worldPerPx;
      cam.gy = pinch.ty - right.y * mx * worldPerPx + up.y * my * worldPerPx;
      cam.gz = pinch.tz - right.z * mx * worldPerPx + up.z * my * worldPerPx;
      st.dirty = true;
      return;
    }
    if (!drag) return;
    var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
    if (drag.pan) {
      /* 平移：沿相机右/上方向移动目标点 */
      var k2 = (canvas.height / 2) / Math.tan(cam.fov * DEG / 2);
      var worldPerPx2 = cam.dist / k2;
      var fwd2 = vmul(v3(Math.cos(cam.pitch) * Math.cos(cam.yaw), Math.cos(cam.pitch) * Math.sin(cam.yaw), Math.sin(cam.pitch)), -1);
      var right2 = vnorm(vcross(fwd2, v3(0, 0, 1)));
      var up2 = vnorm(vcross(right2, fwd2));
      cam.gx -= right2.x * dx * worldPerPx2 - up2.x * dy * worldPerPx2;
      cam.gy -= right2.y * dx * worldPerPx2 - up2.y * dy * worldPerPx2;
      cam.gz -= right2.z * dx * worldPerPx2 - up2.z * dy * worldPerPx2;
    } else {
      var sc = cam.dist > 1 ? 0.004 : 0.00012;
      cam.yaw = drag.yaw - dx * sc;
      cam.pitch = clamp(drag.pitch + dy * sc * 0.8, -1.55, 1.55);
    }
    st.dirty = true;
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.shiftKey) {
      setBoost(st.boost * (e.deltaY < 0 ? 1.15 : 0.87));
      return;
    }
    zoom(e.deltaY < 0 ? 0.86 : 1.16);
  }
  function zoom(f) {
    cam.dist = clamp(cam.dist * f, 0.00002, 160);
    st.dirty = true;
    emit('change');
  }
  var drag = null;
  var pointers = {};
  var pinch = null;

  function select(key) {
    if (!S.byKey[key]) return false;
    st.selected = key;
    emit('select', key);
    emit('change');
    return true;
  }

  /* ================= 层级 ================= */
  function setLevel(level, key) {
    st.level = level;
    if (key) st.selected = key;
    var b = S.byKey[st.selected] || S.sun;
    /* 每层默认放大系数：系统视图要看得见，近景要保持卫星与行星的空间关系，特写用真实比例 */
    st.boost = st.levelBoost[level] || LEVEL_BOOST[level] || 5000;
    cam.fov = LEVEL_FOV[level] || 45;
    var p = currentPos(b);
    if (level === 'system') {
      cam.gx = 0; cam.gy = 0; cam.gz = 0;
      cam.gdist = 62; cam.pitch = 0.42;
    } else if (level === 'planet') {
      cam.gx = p.x; cam.gy = p.y; cam.gz = p.z;
      cam.gdist = Math.max(dispRadius(b) * 14, 0.02);
      cam.pitch = 0.30;
    } else {
      cam.gx = p.x; cam.gy = p.y; cam.gz = p.z;
      cam.gdist = dispRadius(b) * 5;
      cam.pitch = 0.16;
    }
    st.dirty = true;
    emit('change');
  }
  function currentPos(b) {
    if (b.kind === 'sun') return v3(0, 0, 0);
    if (b.kind === 'moon') {
      var parent = S.byKey[b.parent];
      var pp = parent && parent.kind === 'moon' ? currentPos(parent) : planetPos(parent.key, st.simJD);
      return moonPos(b, st.simJD, pp);
    }
    return planetPos(b.key, st.simJD);
  }
  function reset() {
    cam.yaw = 0.72; cam.pitch = 0.42;
    setLevel(st.level, st.selected);
  }
  function setBoost(v) {
    st.boost = clamp(v, 1, 40000);
    st.levelBoost[st.level] = st.boost;
    st.dirty = true;
    emit('change');
  }
  function setLayout(exp) {
    st.distExp = clamp(exp, 0.3, 1);
    st.orbitPaths = {};
    st.dirty = true;
    emit('change');
  }
  function setLabels(v) { st.labels = !!v; emit('change'); }
  function setOrbits(v) { st.orbits = !!v; emit('change'); }
  function setTimeScale(v) { st.timeScale = v; emit('change'); }
  function togglePause() { st.paused = !st.paused; emit('change'); }

  /* ================= 生命周期 ================= */
  function loop() {
    rafId = requestAnimationFrame(loop);
    if (!st.open) return;
    render();
  }

  function sizeCanvas() {
    if (!canvas) return;
    var stage = canvas.parentNode;
    var cw = stage.clientWidth || 1200, ch = stage.clientHeight || 700;
    var w = Math.min(cw * 0.995, ch * 16 / 9.4);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var nw = Math.max(640, Math.round(w * dpr));
    var nh = Math.max(360, Math.round(w * 9.4 / 16 * dpr));
    if (canvas.width !== nw || canvas.height !== nh) {
      canvas.width = nw; canvas.height = nh;
      canvas.style.width = w + 'px';
      canvas.style.height = (w * 9.4 / 16) + 'px';
      starField = null;
    }
  }

  function open(opts) {
    opts = opts || {};
    if (!canvas) {
      canvas = document.getElementById('solarCanvas');
      if (!canvas) return false;
      ctx = canvas.getContext('2d');
      bind();
    }
    st.open = true;
    st.baseJD = st.baseJD || A.jdFromDate(new Date());
    if (!st.simJD) st.simJD = st.baseJD;
    sizeCanvas();
    if (opts.key && S.byKey[opts.key]) st.selected = opts.key;
    if (opts.level) setLevel(opts.level, st.selected);
    else setLevel(st.level, st.selected);
    emit('select', st.selected);
    emit('change');
    if (!rafId) { lastT = 0; rafId = requestAnimationFrame(loop); }
    return true;
  }
  function close() {
    st.open = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    lastT = 0;
  }

  function bind() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', function (e) {
      onPointerMove(e);
      onPointerDrag(e);
    });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    canvas.addEventListener('pointerleave', function () {
      st.hover = null;
      var el = document.getElementById('solarTip');
      if (el) el.classList.remove('on');
    });
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('dblclick', function (e) {
      var rect = canvas.getBoundingClientRect();
      var x = (e.clientX - rect.left) / rect.width * canvas.width;
      var y = (e.clientY - rect.top) / rect.height * canvas.height;
      var hit = bodyAt(x, y);
      if (hit) setLevel('planet', hit.b.key);
    });
    window.addEventListener('resize', function () { if (st.open) { sizeCanvas(); } });
  }

  function emit(type, payload) {
    (listeners[type] || []).forEach(function (fn) {
      try { fn(payload); } catch (e) { console.warn(e); }
    });
  }

  /* ================= 天体实时信息（供信息面板与 Agent 结构化响应） ================= */
  function info(key) {
    var b = S.byKey[key];
    if (!b) return null;
    var jd = st.simJD;
    /* 显示坐标用于渲染，真实日心距用于数据面板 */
    var pos = currentPos(b);
    var truePos = v3(0, 0, 0);
    if (b.kind === 'planet') {
      var hp = A.helio(b.key, jd);
      truePos = v3(hp.x, hp.y, hp.z);
    } else if (b.kind === 'moon') {
      var par = S.byKey[b.parent];
      var parTrue = (par && par.kind === 'planet') ? A.helio(par.key, jd) : null;
      if (parTrue) {
        var th = 2 * Math.PI * ((jd - 2451545.0) / (b.periodD * (b.retrograde ? -1 : 1)));
        var rr = b.orbitKm / AU;
        truePos = v3(parTrue.x + rr * Math.cos(th), parTrue.y + rr * Math.sin(th), parTrue.z);
      }
    }
    var rHelio = vlen(truePos);
    var earthTrue = A.helio('earth', jd);
    var earth = v3(earthTrue.x, earthTrue.y, earthTrue.z);
    var dEarthAu = vlen(vsub(truePos, earth));
    var dEarthKm = dEarthAu * AU;
    /* 相位角：天体—太阳—地球夹角 */
    var toSun = vnorm(vmul(truePos, -1));
    var toEarth = vnorm(vsub(earth, truePos));
    var phase = Math.acos(clamp(vdot(toSun, toEarth), -1, 1)) / DEG;
    var illum = (1 + Math.cos(phase * DEG)) / 2;
    var appDiam = 2 * Math.atan(b.radiusKm / Math.max(dEarthKm, 1)) / DEG * 3600;
    var periodD = null;
    if (b.kind === 'planet') {
      var a = A.helio(key, jd).r;
      periodD = 365.256 * Math.pow(a, 1.5);
    } else if (b.kind === 'moon') {
      periodD = b.periodD;
    }
    var rotD = b.rotationH ? b.rotationH / 24 : null;
    return {
      key: b.key, cn: b.cn, en: b.en, kind: b.kind, parent: b.parent,
      radiusKm: b.radiusKm, massKg: b.massKg,
      helioAu: rHelio, helioKm: rHelio * AU,
      earthDistKm: dEarthKm, earthDistAu: dEarthAu,
      phaseDeg: phase, illum: illum, appDiamArcsec: appDiam,
      periodD: periodD, rotationH: b.rotationH, rotationD: rotD,
      axialTilt: b.axialTilt, albedo: b.albedo, tempC: b.tempC,
      moons: b.kind === 'planet' ? S.moonsOf(b.key).length : 0,
      moonList: b.kind === 'planet' ? S.moonsOf(b.key).map(function (m) { return m.cn; }) : [],
      orbitKm: b.kind === 'moon' ? b.orbitKm : null,
      retrograde: b.kind === 'moon' ? !!b.retrograde : (b.rotationH < 0),
      missions: b.missions || [], sources: b.sources || [],
      observed: (root.BODY_INFO && root.BODY_INFO[b.key] && root.BODY_INFO[b.key].observed) || []
    };
  }

  root.SolarView = {
    open: open, close: close, isOpen: function () { return st.open; },
    select: select, setLevel: setLevel, setBoost: setBoost, setLabels: setLabels,
    setOrbits: setOrbits, setTimeScale: setTimeScale, togglePause: togglePause, reset: reset,
    setLayout: setLayout, zoom: zoom, sizeCanvas: sizeCanvas, info: info,
    levelBoost: LEVEL_BOOST,
    state: st,
    on: function (type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : globalThis);
