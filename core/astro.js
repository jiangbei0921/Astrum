/* ASTRUM · 星历计算引擎
 * 算法来源：
 *  - 太阳：Astronomical Almanac 低精度公式（精度约 0.01°）
 *  - 月球：Meeus《Astronomical Algorithms》第 47 章截断周期项（经度精度约 0.05°）
 *  - 行星：JPL "Approximate Positions of the Planets" 开普勒根数（1800–2050，精度约 0.1°）
 *  - 坐标：J2000 平赤道；未做周年光行差/章动修正（目视级别足够）
 * 免责：用于观测规划与科普展示，不用于精密定轨、掩星预报或航天导航。
 */
(function (root) {
  'use strict';
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;

  function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function norm180(x) { x = norm360(x); return x > 180 ? x - 360 : x; }
  function jdFromDate(d) { return d.getTime() / 86400000 + 2440587.5; }
  function dateFromJD(jd) { return new Date((jd - 2440587.5) * 86400000); }
  function T(jd) { return (jd - 2451545.0) / 36525; }
  function obliquity(jd) {
    var t = T(jd);
    return 23.439291 - 0.0130042 * t - 1.64e-7 * t * t + 5.04e-7 * t * t * t;
  }

  /* ---------- 本地时间 <-> JD ---------- */
  function fromLocal(y, mo, d, h, mi, tzHours) {
    var ms = Date.UTC(y, mo - 1, d, h, mi, 0);
    return (ms - tzHours * 3600000) / 86400000 + 2440587.5;
  }
  function partsFromJD(jd, tzHours) {
    var dt = new Date((jd - 2440587.5) * 86400000 + tzHours * 3600000);
    return {
      y: dt.getUTCFullYear(), mo: dt.getUTCMonth() + 1, d: dt.getUTCDate(),
      h: dt.getUTCHours(), mi: dt.getUTCMinutes(),
      dow: dt.getUTCDay()
    };
  }
  function fmtHM(jd, tz) {
    if (jd === null || jd === undefined || isNaN(jd)) return '—';
    var p = partsFromJD(jd, tz);
    return (p.h < 10 ? '0' : '') + p.h + ':' + (p.mi < 10 ? '0' : '') + p.mi;
  }
  function fmtDate(jd, tz) {
    var p = partsFromJD(jd, tz);
    return p.y + '-' + (p.mo < 10 ? '0' : '') + p.mo + '-' + (p.d < 10 ? '0' : '') + p.d;
  }

  /* ---------- 黄道 -> 赤道 ---------- */
  function eclToEq(lonDeg, latDeg, jd) {
    var e = obliquity(jd) * RAD, l = lonDeg * RAD, b = latDeg * RAD;
    var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
    return { ra: norm360(ra * DEG) / 15, dec: dec * DEG };
  }

  /* ---------- 太阳 ---------- */
  function sun(jd) {
    var n = jd - 2451545.0;
    var L = norm360(280.460 + 0.9856474 * n);
    var g = norm360(357.528 + 0.9856003 * n) * RAD;
    var lon = norm360(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g));
    var eq = eclToEq(lon, 0, jd);
    var dist = 1.00014 - 0.01671 * Math.cos(g) - 0.00014 * Math.cos(2 * g);
    return { lon: lon, ra: eq.ra, dec: eq.dec, dist: dist };
  }

  /* ---------- 月球（Meeus 47） ---------- */
  var LR = [
    [0,0,1,0,6288774,-20905355],[2,0,-1,0,1274027,-3699111],[2,0,0,0,658314,-2955968],
    [0,0,2,0,213618,-569925],[0,1,0,0,-185116,48888],[0,0,0,2,-114332,-3149],
    [2,0,-2,0,58793,246158],[2,-1,-1,0,57066,-152138],[2,0,1,0,53322,-170733],
    [2,-1,0,0,45758,-204586],[0,1,-1,0,-40923,-129620],[1,0,0,0,-34720,108743],
    [0,1,1,0,-30383,104755],[2,0,0,-2,15327,10321],[0,0,1,2,-12528,0],
    [0,0,1,-2,10980,79661],[4,0,-1,0,10675,-34782],[0,0,3,0,10034,-23210],
    [4,0,-2,0,8548,-21636],[2,1,-1,0,-7888,24208],[2,1,0,0,-6766,30824],
    [1,0,-1,0,-5163,-8379],[1,1,0,0,4987,-16675],[2,-1,1,0,4036,-12831],
    [2,0,2,0,3994,-10445],[4,0,0,0,3861,-11650],[2,0,-3,0,3665,14403],
    [0,1,-2,0,-2689,-7003],[2,0,-1,2,-2602,0],[2,-1,-2,0,2390,10056],
    [1,0,1,0,-2348,6322],[2,-2,0,0,2236,-9884],[0,1,2,0,-2120,5751],
    [0,2,0,0,-2069,0],[2,-2,-1,0,2048,-4950],[2,0,1,-2,-1773,4130],
    [2,0,0,2,-1595,0],[4,-1,-1,0,1215,-3958],[0,0,2,2,-1110,0],
    [3,0,-1,0,-892,3258],[2,1,1,0,-810,2616],[4,-1,-2,0,759,-1897],
    [0,2,-1,0,-713,-2117],[2,2,-1,0,-700,2354],[2,1,-2,0,691,0],
    [2,-1,0,-2,596,0],[4,0,1,0,549,-1423],[0,0,4,0,537,-1117],
    [4,-1,0,0,520,-1571],[1,0,-2,0,-487,-1739],[2,1,0,-2,-399,0],
    [0,0,2,-2,-381,-4421],[1,1,1,0,351,0],[3,0,-2,0,-340,0],
    [4,0,-3,0,330,0],[2,-1,2,0,327,0],[0,2,1,0,-323,1165],
    [1,1,-1,0,299,0],[2,0,3,0,294,0]
  ];
  var BT = [
    [0,0,0,1,5128122],[0,0,1,1,280602],[0,0,1,-1,277693],[2,0,0,-1,173237],
    [2,0,-1,1,55413],[2,0,-1,-1,46271],[2,0,0,1,32573],[0,0,2,1,17198],
    [2,0,1,-1,9266],[0,0,2,-1,8822],[2,-1,0,-1,8216],[2,0,-2,-1,4324],
    [2,0,1,1,4200],[2,1,0,-1,-3359],[2,-1,-1,1,2463],[2,-1,0,1,2211],
    [2,-1,-1,-1,2065],[0,1,-1,-1,-1870],[4,0,-1,-1,1828],[0,1,0,1,-1794],
    [0,0,0,3,-1749],[0,1,-1,1,-1565],[1,0,0,1,-1491],[0,1,1,1,-1475],
    [0,1,1,-1,-1410],[0,1,0,-1,-1344],[1,0,0,-1,-1335],[0,0,3,1,1107],
    [4,0,0,-1,1021],[4,0,-1,1,833]
  ];

  function moon(jd) {
    var t = T(jd), t2 = t * t, t3 = t2 * t, t4 = t3 * t;
    var Lp = 218.3164477 + 481267.88123421 * t - 0.0015786 * t2 + t3 / 538841 - t4 / 65194000;
    var D  = 297.8501921 + 445267.1114034 * t - 0.0018819 * t2 + t3 / 545868 - t4 / 113065000;
    var M  = 357.5291092 + 35999.0502909 * t - 0.0001536 * t2 + t3 / 24490000;
    var Mp = 134.9633964 + 477198.8675055 * t + 0.0087414 * t2 + t3 / 69699 - t4 / 14712000;
    var F  = 93.2720950 + 483202.0175233 * t - 0.0036539 * t2 - t3 / 3526000 + t4 / 863310000;
    var A1 = 119.75 + 131.849 * t, A2 = 53.09 + 479264.290 * t, A3 = 313.45 + 481266.484 * t;
    var E = 1 - 0.002516 * t - 0.0000074 * t2;

    var sl = 0, sr = 0, i, r, arg, coef;
    for (i = 0; i < LR.length; i++) {
      r = LR[i];
      arg = (r[0] * D + r[1] * M + r[2] * Mp + r[3] * F) * RAD;
      coef = r[4]; if (r[1] === 1 || r[1] === -1) coef *= E; else if (r[1] === 2) coef *= E * E;
      sl += coef * Math.sin(arg);
      sr += r[5] * Math.cos(arg);
    }
    var sb = 0;
    for (i = 0; i < BT.length; i++) {
      r = BT[i];
      arg = (r[0] * D + r[1] * M + r[2] * Mp + r[3] * F) * RAD;
      coef = r[4]; if (r[1] === 1 || r[1] === -1) coef *= E; else if (r[1] === 2) coef *= E * E;
      sb += coef * Math.sin(arg);
    }
    sl += 3958 * Math.sin(A1 * RAD) + 1962 * Math.sin((Lp - F) * RAD) + 318 * Math.sin(A2 * RAD);
    sb += -2235 * Math.sin(Lp * RAD) + 382 * Math.sin(A3 * RAD)
        + 175 * Math.sin((A1 - F) * RAD) + 175 * Math.sin((A1 + F) * RAD)
        + 127 * Math.sin((Lp - Mp) * RAD) - 115 * Math.sin((Lp + Mp) * RAD);

    var lon = norm360(Lp + sl / 1000000);
    var lat = sb / 1000000;
    var dist = 385000.56 + sr / 1000; /* km */
    var eq = eclToEq(lon, lat, jd);
    return { lon: lon, lat: lat, ra: eq.ra, dec: eq.dec, dist: dist, distAU: dist / 149597870.7 };
  }

  /* 月相：以日月黄经差计算 */
  var PHASES = [
    [0, '新月'], [1.84566, '蛾眉月'], [5.53699, '上弦月'], [9.22831, '盈凸月'],
    [12.91963, '满月'], [16.61096, '亏凸月'], [20.30228, '下弦月'], [23.99361, '残月'], [27.68493, '新月']
  ];
  function moonPhase(jd) {
    var m = moon(jd), s = sun(jd);
    var elong = norm360(m.lon - s.lon);
    var age = elong / 360 * 29.530588853;
    var illum = (1 - Math.cos(elong * RAD)) / 2;
    var name = '新月';
    for (var i = PHASES.length - 1; i >= 0; i--) { if (age >= PHASES[i][0]) { name = PHASES[i][1]; break; } }
    return {
      age: age, illum: illum, elong: elong, name: name,
      waxing: elong < 180, ra: m.ra, dec: m.dec, dist: m.dist
    };
  }

  /* ---------- 行星（JPL 近似根数） ---------- */
  var PL = {
    mercury: { cn: '水星', el: [0.38709927,0.00000037, 0.20563593,0.00001906, 7.00497902,-0.00594749, 252.25032350,149472.67411175, 77.45779628,0.16047689, 48.33076593,-0.12534081] },
    venus:   { cn: '金星', el: [0.72333566,0.00000390, 0.00677672,-0.00004107, 3.39467605,-0.00078890, 181.97909950,58517.81538729, 131.60246718,0.00268329, 76.67984255,-0.27769418] },
    earth:   { cn: '地球', el: [1.00000261,0.00000562, 0.01671123,-0.00004392, -0.00001531,-0.01294668, 100.46457166,35999.37244981, 102.93768193,0.32327364, 0,0] },
    mars:    { cn: '火星', el: [1.52371034,0.00001847, 0.09339410,0.00007882, 1.84969142,-0.00813131, -4.55343205,19140.30268499, -23.94362959,0.44441088, 49.55953891,-0.29257343] },
    jupiter: { cn: '木星', el: [5.20288700,-0.00011607, 0.04838624,-0.00013253, 1.30439695,-0.00183714, 34.39644051,3034.74612775, 14.72847983,0.21252668, 100.47390909,0.20469106] },
    saturn:  { cn: '土星', el: [9.53667594,-0.00125060, 0.05386179,-0.00050991, 2.48599187,0.00193609, 49.95424423,1222.49362201, 92.59887831,-0.41897216, 113.66242448,-0.28867794] },
    uranus:  { cn: '天王星', el: [19.18916464,-0.00196176, 0.04725744,-0.00004397, 0.77263783,-0.00242939, 313.23810451,428.48202785, 170.95427630,0.40805281, 74.01692503,0.04240589] },
    neptune: { cn: '海王星', el: [30.06992276,0.00026291, 0.00859048,0.00005105, 1.77004347,0.00035372, -55.12002969,218.45945325, 44.96476227,-0.32241464, 131.78422574,-0.00508664] }
  };

  function helio(key, jd) {
    if (!PL[key]) return { x: 0, y: 0, z: 0, r: 0 };
    var e0 = PL[key].el, t = T(jd);
    var a = e0[0] + e0[1] * t, e = e0[2] + e0[3] * t, I = e0[4] + e0[5] * t;
    var L = e0[6] + e0[7] * t, wb = e0[8] + e0[9] * t, Om = e0[10] + e0[11] * t;
    var w = wb - Om;
    var M = norm180(L - wb);
    var Mr = M * RAD;
    var E = Mr + e * Math.sin(Mr);
    for (var k = 0; k < 12; k++) {
      var dM = Mr - (E - e * Math.sin(E));
      E += dM / (1 - e * Math.cos(E));
    }
    var xv = a * (Math.cos(E) - e);
    var yv = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var cw = Math.cos(w * RAD), sw = Math.sin(w * RAD);
    var cO = Math.cos(Om * RAD), sO = Math.sin(Om * RAD);
    var cI = Math.cos(I * RAD), sI = Math.sin(I * RAD);
    var x = xv * (cw * cO - sw * sO * cI) + yv * (-sw * cO - cw * sO * cI);
    var y = xv * (cw * sO + sw * cO * cI) + yv * (-sw * sO + cw * cO * cI);
    var z = xv * (sw * sI) + yv * (cw * sI);
    return { x: x, y: y, z: z, r: Math.sqrt(x * x + y * y + z * z) };
  }

  function planet(key, jd) {
    var p = helio(key, jd), e = helio('earth', jd);
    var x = p.x - e.x, y = p.y - e.y, z = p.z - e.z;
    var dist = Math.sqrt(x * x + y * y + z * z);
    var lon = norm360(Math.atan2(y, x) * DEG);
    var lat = Math.asin(z / dist) * DEG;
    var eq = eclToEq(lon, lat, jd);
    var s = sun(jd);
    var elong = Math.acos(Math.max(-1, Math.min(1,
      Math.cos((lon - s.lon) * RAD) * Math.cos(lat * RAD))));
    /* 相位角用余弦定理解算，避免 asin 的锐角歧义（内行星接近下合时会取错分支） */
    var cosI = (p.r * p.r + dist * dist - s.dist * s.dist) / (2 * p.r * dist);
    var i = Math.acos(Math.max(-1, Math.min(1, cosI))) * DEG;
    /* 近似视星等（Astronomical Almanac / Harris 公式） */
    var V, base = 5 * Math.log10(p.r * dist);
    if (key === 'mercury') V = -0.42 + base + 0.0380 * i - 0.000273 * i * i + 0.000002 * i * i * i;
    else if (key === 'venus') V = -4.40 + base + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i;
    else if (key === 'mars') V = -1.52 + base + 0.016 * i;
    else if (key === 'jupiter') V = -9.40 + base + 0.005 * i;
    else if (key === 'saturn') V = -8.88 + base + 0.044 * i;
    else if (key === 'uranus') V = -7.19 + base;
    else V = -6.87 + base;
    return {
      key: key, cn: PL[key].cn, ra: eq.ra, dec: eq.dec, dist: dist,
      r: p.r, mag: Math.round(V * 10) / 10, elong: elong * DEG,
      eclLon: lon
    };
  }

  function planets(jd) {
    var out = [];
    ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'].forEach(function (k) {
      out.push(planet(k, jd));
    });
    return out;
  }

  /* ---------- 坐标与升落 ---------- */
  function lstHours(jd, lonDeg) {
    var d = jd - 2451545.0;
    var gmst = 280.46061837 + 360.98564736629 * d;
    return norm360(gmst + lonDeg) / 15;
  }

  function altAz(raH, decDeg, jd, lat, lon) {
    var ha = norm360((lstHours(jd, lon) - raH) * 15) * RAD;
    var d = decDeg * RAD, phi = lat * RAD;
    var sinAlt = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(ha);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
    var az = Math.atan2(-Math.sin(ha) * Math.cos(d),
      Math.sin(d) * Math.cos(phi) - Math.cos(d) * Math.sin(phi) * Math.cos(ha));
    return { alt: alt * DEG, az: norm360(az * DEG) };
  }

  function sep(ra1, dec1, ra2, dec2) {
    var a1 = ra1 * 15 * RAD, d1 = dec1 * RAD, a2 = ra2 * 15 * RAD, d2 = dec2 * RAD;
    var c = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(a1 - a2);
    return Math.acos(Math.max(-1, Math.min(1, c))) * DEG;
  }

  /* 在 [jdStart, jdStart+hours] 内采样高度角，求升落与中天 */
  function track(raH, decDeg, jdStart, lat, lon, h0, hours) {
    h0 = (h0 === undefined) ? -0.566 : h0;
    hours = hours || 24;
    var step = 5 / 1440, n = Math.round(hours / step);
    var prev = null, prevT = null, rise = null, set = null, maxAlt = -99, minAlt = 99, maxT = null;
    for (var i = 0; i <= n; i++) {
      var t = jdStart + i * step;
      var a = altAz(raH, decDeg, t, lat, lon).alt;
      if (a > maxAlt) { maxAlt = a; maxT = t; }
      if (a < minAlt) minAlt = a;
      var above = a - h0;
      if (prev !== null && prev * above < 0) {
        var cross = prevT + step * (prev / (prev - above));
        if (above > 0 && rise === null) rise = cross;
        if (above < 0 && rise !== null && set === null) set = cross;
        if (above < 0 && rise === null) { /* 已在空中，前一次落下 */ }
      }
      prev = above; prevT = t;
    }
    return {
      rise: rise, set: set, transit: maxT,
      maxAlt: maxAlt, minAlt: minAlt,
      alwaysUp: minAlt > h0, alwaysDown: maxAlt < h0
    };
  }

  /* 太阳升落与天文暗夜窗口（太阳高度 < -15°） */
  function sunTimes(jdMidnight, lat, lon) {
    var step = 5 / 1440, n = Math.round(25 / step);
    var rise = null, set = null, dusk = null, dawn = null;
    var prevA = null, prevT = null, prevD = null;
    for (var i = 0; i <= n; i++) {
      var t = jdMidnight + i * step;
      var a = altAz(sun(t).ra, sun(t).dec, t, lat, lon).alt;
      if (prevA !== null) {
        if (prevA < -0.833 && a >= -0.833 && rise === null) rise = prevT + step * ((-0.833 - prevA) / (a - prevA));
        if (prevA >= -0.833 && a < -0.833 && set === null) set = prevT + step * ((-0.833 - prevA) / (a - prevA));
        if (prevA >= -15 && a < -15 && dusk === null) dusk = prevT + step * ((-15 - prevA) / (a - prevA));
        if (prevA < -15 && a >= -15 && dusk !== null && dawn === null) dawn = prevT + step * ((-15 - prevA) / (a - prevA));
      }
      if (a < -15 && dusk === null) prevD = t;
      prevA = a; prevT = t;
    }
    if (dusk === null && prevD !== null) dusk = jdMidnight;      /* 极夜：全夜可观测 */
    if (dusk !== null && dawn === null) dawn = jdMidnight + 1;    /* 极夜结束边界 */
    return { rise: rise, set: set, dusk: dusk, dawn: dawn };
  }

  /* 观测评分：高度 + 亮度 + 月光干扰 */
  function scoreTarget(ev, mag, moonSep, moonIllum) {
    if (ev.maxAlt < 12) return 0;
    var s = Math.min(1, (ev.maxAlt - 10) / 60) * 0.55;
    var bright = Math.max(0, Math.min(1, (9 - Math.abs(mag)) / 9));
    s += bright * 0.3;
    var moonPenalty = Math.max(0, 1 - moonSep / 60) * moonIllum * 0.35;
    return Math.max(0, Math.min(1, s + 0.15 - moonPenalty));
  }

  function fmtDeg(d, axis) {
    if (d === null || d === undefined) return '—';
    if (axis === 'az') {
      var dirs = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
      var idx = Math.round(norm360(d) / 45) % 8;
      return dirs[idx] + '（' + Math.round(norm360(d)) + '°）';
    }
    return (d >= 0 ? '+' : '') + d.toFixed(1) + '°';
  }

  function fmtRA(raH) {
    var h = Math.floor(raH), m = Math.round((raH - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    return h + 'h' + (m < 10 ? '0' : '') + m + 'm';
  }
  function fmtDec(dec) {
    var s = dec < 0 ? '−' : '+', a = Math.abs(dec);
    var d = Math.floor(a), m = Math.round((a - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    return s + d + '°' + (m < 10 ? '0' : '') + m + '′';
  }

  root.Astro = {
    RAD: RAD, DEG: DEG, norm360: norm360, norm180: norm180,
    jdFromDate: jdFromDate, dateFromJD: dateFromJD, fromLocal: fromLocal,
    partsFromJD: partsFromJD, fmtHM: fmtHM, fmtDate: fmtDate,
    obliquity: obliquity, sun: sun, moon: moon, moonPhase: moonPhase,
    planet: planet, planets: planets, helio: helio, lstHours: lstHours, altAz: altAz,
    sep: sep, track: track, sunTimes: sunTimes, scoreTarget: scoreTarget,
    fmtDeg: fmtDeg, fmtRA: fmtRA, fmtDec: fmtDec,
    version: '0.9.3-local'
  };
})(typeof window !== 'undefined' ? window : globalThis);
