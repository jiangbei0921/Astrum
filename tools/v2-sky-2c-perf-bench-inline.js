async function (WARMUP, SAMPLES) {
  'use strict';
  var A = window.Astro, VM = window.SkyVM, R = window.SkyRender, BG = window.SkyBackground;
  var D2R = Math.PI / 180;

  function now() { return performance.now(); }
  function q(a, p) {
    if (!a.length) return 0;
    var s = a.slice().sort(function (x, y) { return x - y; });
    var i = Math.ceil(p * s.length) - 1;
    if (i < 0) i = 0;
    if (i > s.length - 1) i = s.length - 1;
    return s[i];
  }
  function stat(arr, total) {
    var n = arr.length, sum = 0, mx = 0;
    for (var i = 0; i < n; i++) { sum += arr[i]; if (arr[i] > mx) mx = arr[i]; }
    return {
      n: n,
      avg: +((total != null ? total / n : sum / n)).toFixed(3),
      p50: +q(arr, 0.50).toFixed(3),
      p95: +q(arr, 0.95).toFixed(3),
      max: +mx.toFixed(3),
      min: +(q(arr, 0.005)).toFixed(3),
      sum: +sum.toFixed(2)
    };
  }
  function bgStats() { var s = BG.stats(); return s; }

  /* 基准参数：来自页面真实模型键（不伪造时间/地点） */
  var key = window.__astrum.perf().model.key || '';
  var parts = key.split('|');
  var JD = Number(parts[0]), LAT = Number(parts[1]), LON = Number(parts[2]);
  if (!isFinite(JD) || !isFinite(LAT) || !isFinite(LON)) {
    throw new Error('无法取得基准 jd/lat/lon: ' + key);
  }
  var NAV = performance.getEntriesByType('navigation')[0] || {};
  var LAYERS = window.SkyLayers.normalize(null);
  var env = {
    ua: navigator.userAgent, dpr: window.devicePixelRatio,
    innerW: innerWidth, innerH: innerHeight,
    cores: navigator.hardwareConcurrency,
    deviceMemory: navigator.deviceMemory || null,
    layers: LAYERS,
    canvas: '1600x1000',
    warmup: WARMUP, samples: SAMPLES,
    clockHint: 'performance.now() 真实时钟（无 virtual-time-budget）'
  };

  var out = { env: env, scenarios: {}, cache: {}, correctness: {}, notes: [] };

  /* ---------- A 冷启动：页面自身已发生的首帧（事实值，不做统计） ---------- */
  var s0 = bgStats();
  out.coldStart = {
    navigation: {
      domContentLoaded: +(NAV.domContentLoadedEventEnd || 0).toFixed(1),
      loadEventEnd: +(NAV.loadEventEnd || 0).toFixed(1),
      responseEnd: +(NAV.responseEnd || 0).toFixed(1)
    },
    textureDecodeMs: s0.decodeMs,
    firstSkyMs: s0.lastSkyMs,
    firstRasterMs: s0.lastRasterMs,
    skyBuildsAtReady: s0.skyBuilds,
    rasterBuildsAtReady: s0.rasterBuilds,
    rasterAtReady: s0.rasterW + 'x' + s0.rasterH,
    drawsAtReady: s0.draws,
    appPerf: window.__astrum.perf().sky
  };

  /* ---------- 画布 ---------- */
  var cvBig = document.createElement('canvas');
  cvBig.width = 1600; cvBig.height = 1000;
  var cvTyp = document.createElement('canvas');
  cvTyp.width = 760; cvTyp.height = 540;
  var ctxBig = cvBig.getContext('2d');

  function mk(cv, yaw, pitch, fov, jd, lat, lon, styleExtra) {
    var o = {
      width: cv.width, height: cv.height, yaw: yaw, pitch: pitch, fov: fov,
      style: 'full', detail: true, layers: LAYERS
    };
    if (styleExtra) { for (var k in styleExtra) o[k] = styleExtra[k]; }
    return VM.build(jd == null ? JD : jd, lat == null ? LAT : lat, lon == null ? LON : lon, o);
  }
  function draw(cv, vm) { return R.draw(cv, { showGlobe: false }, vm); }

  var baseVm = mk(cvBig, 180, 32, 145);

  /* ---------- A2 强制冷重建（每样本 invalidate，含天空纹理+栅格重建） ---------- */
  (function () {
    for (var w = 0; w < 2; w++) { BG.invalidate(); var vw = mk(cvBig, 180, 32, 145); draw(cvBig, vw); }
    var a = [], t0all = now();
    for (var i = 0; i < 10; i++) {
      BG.invalidate();
      var t0 = now();
      var vm = mk(cvBig, 180, 32, 145);
      draw(cvBig, vm);
      a.push(now() - t0);
    }
    out.scenarios['A2 冷重建(天空+栅格)'] = stat(a, now() - t0all);
  })();

  /* ---------- A3/A4 分解：纯天空纹理构建 / 纯屏幕栅格构建 ---------- */
  (function () {
    for (var w = 0; w < 2; w++) BG.__computeSky(JD, LAT, LON);
    var a = [];
    for (var i = 0; i < 10; i++) {
      var t0 = now();
      BG.__computeSky(JD + i / 1440, LAT, LON);
      a.push(now() - t0);
    }
    out.scenarios['A3 纯天空纹理构建(256x128)'] = stat(a);
  })();
  (function () {
    var a = [];
    for (var w = 0; w < 2; w++) { var v0 = mk(cvBig, 180, 32, 145); BG.__computeRaster(v0); }
    for (var i = 0; i < 10; i++) {
      var vm = mk(cvBig, 180 + i * 0.7, 32, 145);
      var t0 = now();
      BG.__computeRaster(vm);
      a.push(now() - t0);
    }
    out.scenarios['A4 纯屏幕栅格构建(160x160)'] = stat(a);
  })();

  /* ---------- B 缓存命中 ---------- */
  (function () {
    var vm = baseVm;
    for (var w = 0; w < WARMUP; w++) draw(cvBig, vm);

    var b0 = bgStats();
    var a = [], total0 = now();
    for (var i = 0; i < SAMPLES; i++) {
      var t0 = now();
      var v = mk(cvBig, 180, 32, 145);   /* 模型缓存命中 + 栅格缓存命中 */
      draw(cvBig, v);
      a.push(now() - t0);
    }
    out.scenarios['B1 缓存命中(整帧)'] = stat(a, now() - total0);
    var b1 = bgStats();
    out.cache.B1 = { skyBuilds: b1.skyBuilds - b0.skyBuilds, rasterBuilds: b1.rasterBuilds - b0.rasterBuilds, draws: b1.draws - b0.draws };

    var a2 = [];
    for (var j = 0; j < SAMPLES; j++) {
      var t1 = now();
      draw(cvBig, vm);
      a2.push(now() - t1);
    }
    out.scenarios['B2 仅绘制(预建 vm)'] = stat(a2);

    var a3 = [];
    for (var k = 0; k < SAMPLES; k++) {
      var t2 = now();
      BG.draw(ctxBig, vm);
      a3.push(now() - t2);
    }
    out.scenarios['B3 仅背景 drawImage'] = stat(a3);
  })();

  /* ---------- C 相机变化 ---------- */
  (function () {
    var b0 = bgStats();
    for (var w = 0; w < WARMUP; w++) {
      var vw = mk(cvBig, 180 + w * 0.7, 32, 60 + (w % 40));
      draw(cvBig, vw);
    }
    var b1 = bgStats();
    var a = [], t0 = now();
    for (var i = 0; i < SAMPLES; i++) {
      var t = now();
      var yaw = 180 + (i + WARMUP) * 0.7;
      var fov = 60 + ((i + WARMUP) % 40);
      var vm = mk(cvBig, yaw % 360, 32, fov);
      draw(cvBig, vm);
      a.push(now() - t);
    }
    var b2 = bgStats();
    out.scenarios['C 相机变化(栅格重建)'] = stat(a, now() - t0);
    out.cache.C = { skyBuilds: b2.skyBuilds - b1.skyBuilds, rasterBuilds: b2.rasterBuilds - b1.rasterBuilds, warmRasterBuilds: b1.rasterBuilds - b0.rasterBuilds };
  })();

  /* ---------- D 观测时间变化 ---------- */
  await (async function () {
    /* D1：100 次快速改时间（间隔远小于 150ms），验证去抖合并 */
    var b0 = bgStats();
    var a = [], t0 = now();
    var jd = JD;
    for (var i = 0; i < SAMPLES; i++) {
      jd += 2 / 1440;                  /* 每次 +2 分钟 */
      var t = now();
      var vm = mk(cvBig, 180, 32, 145, jd);
      draw(cvBig, vm);
      a.push(now() - t);
    }
    var b1 = bgStats();
    out.scenarios['D1 时间静默(去抖抑制)'] = stat(a, now() - t0);
    out.cache.D1 = { skyBuilds: b1.skyBuilds - b0.skyBuilds, rasterBuilds: b1.rasterBuilds - b0.rasterBuilds, drops: SAMPLES };

    /* D2：强制同步重建（每次 invalidate 后改时间），测量真实重建成本 */
    var a2 = [], b2 = bgStats(), lastJd = jd;
    for (var k = 0; k < 10; k++) {
      lastJd += 60 / 1440;             /* +1 小时 */
      BG.invalidate();
      var t2 = now();
      var v2 = mk(cvBig, 180, 32, 145, lastJd);
      draw(cvBig, v2);
      a2.push(now() - t2);
    }
    var b3 = bgStats();
    out.scenarios['D2 时间变化(强制同步重建)'] = stat(a2);
    out.cache.D2 = { skyBuilds: b3.skyBuilds - b2.skyBuilds, rasterBuilds: b3.rasterBuilds - b2.rasterBuilds };

    /* D3：去抖结束后天空键与目标时刻一致（缓存正确性） */
    var settle = new Promise(function (r) { setTimeout(r, 300); });
    await settle;
    BG.invalidate();
    var vmNow = mk(cvBig, 180, 32, 145, lastJd);
    draw(cvBig, vmNow);
    var expect = Math.floor(lastJd * 1440) + '|' + LAT.toFixed(4) + '|' + LON.toFixed(4);
    var sky = BG.__sky();
    out.correctness.timeKey = {
      expected: expect, actual: sky.key,
      match: sky.key === expect,
      skyBuildsAfterSettle: bgStats().skyBuilds
    };
  })();

  /* ---------- E 观测地点变化 ---------- */
  await (async function () {
    var b0 = bgStats();
    for (var w = 0; w < WARMUP; w++) {
      var vw = mk(cvBig, 180, 32, 145, null, LAT + w * 0.05, LON + w * 0.05);
      draw(cvBig, vw);
    }
    var b1 = bgStats();
    var a = [], t0 = now();
    for (var i = 0; i < SAMPLES; i++) {
      var lat = LAT + ((i + WARMUP) % 20) * 0.05 - 0.5;
      var lon = LON + ((i + WARMUP) % 20) * 0.05 - 0.5;
      var t = now();
      var vm = mk(cvBig, 180, 32, 145, null, lat, lon);
      draw(cvBig, vm);
      a.push(now() - t);
    }
    var b2 = bgStats();
    out.scenarios['E1 地点变化(快速序列)'] = stat(a, now() - t0);
    out.cache.E1 = { skyBuilds: b2.skyBuilds - b1.skyBuilds, rasterBuilds: b2.rasterBuilds - b1.rasterBuilds, warmSkyBuilds: b1.skyBuilds - b0.skyBuilds, warmRasterBuilds: b1.rasterBuilds - b0.rasterBuilds };

    /* E2：强制同步重建（每次 invalidate 后改地点），测量真实重投影成本 */
    var a2 = [], b3 = bgStats();
    for (var k = 0; k < 10; k++) {
      var lat2 = LAT + (k + 1) * 0.1;
      var lon2 = LON - (k + 1) * 0.1;
      BG.invalidate();
      var t2 = now();
      var v2 = mk(cvBig, 180, 32, 145, null, lat2, lon2);
      draw(cvBig, v2);
      a2.push(now() - t2);
    }
    var b4 = bgStats();
    out.scenarios['E2 地点变化(强制同步重建)'] = stat(a2);
    out.cache.E2 = { skyBuilds: b4.skyBuilds - b3.skyBuilds, rasterBuilds: b4.rasterBuilds - b3.rasterBuilds };
  })();

  /* ---------- F 高负载 ---------- */
  (function () {
    var b0 = bgStats();
    var vm = mk(cvBig, 180, 30, 178);
    for (var w = 0; w < WARMUP; w++) draw(cvBig, vm);
    var a = [], t0 = now();
    for (var i = 0; i < SAMPLES; i++) {
      var t = now();
      draw(cvBig, vm);
      a.push(now() - t);
    }
    out.scenarios['F1 高负载(缓存命中)'] = stat(a, now() - t0);

    var a2 = [];
    for (var k = 0; k < SAMPLES; k++) {
      var t2 = now();
      var v2 = mk(cvBig, (180 + (k + 1) * 0.7) % 360, 30, 178);
      draw(cvBig, v2);
      a2.push(now() - t2);
    }
    var b1 = bgStats();
    out.scenarios['F2 高负载(相机变化)'] = stat(a2);
    out.cache.F = { skyBuilds: b1.skyBuilds - b0.skyBuilds, rasterBuilds: b1.rasterBuilds - b0.rasterBuilds, rasterSize: b1.rasterW + 'x' + b1.rasterH };
    out.correctness.highLoadView = { stars: vm.counts.stars, dust: vm.counts.dust, milkyBands: vm.milky.length, fov: vm.view.fov, layers: vm.layers };
  })();

  /* ---------- H 典型查看器尺寸 ---------- */
  (function () {
    var vm = mk(cvTyp, 180, 32, 145);
    for (var w = 0; w < WARMUP; w++) draw(cvTyp, vm);
    var a = [], t0 = now();
    for (var i = 0; i < SAMPLES; i++) {
      var t = now();
      var v = mk(cvTyp, 180, 32, 145);
      draw(cvTyp, v);
      a.push(now() - t);
    }
    var b = bgStats();
    out.scenarios['H 典型尺寸760x540(缓存命中)'] = stat(a, now() - t0);
    out.cache.H = { rasterBuilds: b.rasterBuilds, rasterSize: b.rasterW + 'x' + b.rasterH };
  })();

  /* ---------- G 连续帧 rAF 间隔 ---------- */
  await (function () {
    return new Promise(function (resolve) {
      var deltas = [], last = now(), frames = 0, yaw = 180;
      function tick() {
        var t = now();
        deltas.push(t - last);
        if (frames > 0) {
          yaw = (yaw + 0.35) % 360;
          var vm = mk(cvBig, yaw, 32, 145);
          draw(cvBig, vm);
        }
        last = t;
        frames++;
        if (frames >= 121) {
          deltas.shift();   /* 丢弃第 0 帧（无绘制） */
          var over33 = 0, over50 = 0, over100 = 0;
          deltas.forEach(function (d) { if (d > 33.3) over33++; if (d > 50) over50++; if (d > 100) over100++; });
          out.scenarios['G1 rAF 帧间隔(相机漂移+重建)'] = stat(deltas);
          out.jank = { frames: deltas.length, over33ms: over33, over50ms: over50, over100ms: over100, max: Math.max.apply(null, deltas) };
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  })();

  /* ---------- G2 静态视图 rAF 间隔（缓存命中，隔离合成成本） ---------- */
  await (function () {
    return new Promise(function (resolve) {
      var vm = mk(cvBig, 180, 32, 145);
      for (var w = 0; w < WARMUP; w++) draw(cvBig, vm);
      var deltas = [], last = now(), frames = 0;
      function tick() {
        var t = now();
        deltas.push(t - last);
        if (frames > 0) draw(cvBig, vm);
        last = t;
        frames++;
        if (frames >= 121) {
          deltas.shift();
          var over33 = 0, over50 = 0;
          deltas.forEach(function (d) { if (d > 33.3) over33++; if (d > 50) over50++; });
          out.scenarios['G2 rAF 帧间隔(静态缓存命中)'] = stat(deltas);
          out.jankStatic = { frames: deltas.length, over33ms: over33, over50ms: over50, max: +Math.max.apply(null, deltas).toFixed(3) };
          resolve();
          return;
        }
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  })();

  /* ---------- 内存与最终缓存状态 ---------- */
  if (performance.memory) {
    out.memory = {
      usedJSHeapMB: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1),
      totalJSHeapMB: +(performance.memory.totalJSHeapSize / 1048576).toFixed(1),
      limitMB: +(performance.memory.jsHeapSizeLimit / 1048576).toFixed(1)
    };
  }
  out.cache.final = bgStats();
  out.correctness.layersAllTrue = Object.keys(LAYERS).every(function (k) { return LAYERS[k] !== false; });
  return out;
}
