/* ASTRUM · L1 视觉亮星表适配（V2-SKY 阶段 2B）
 *
 * 职责：把 data/sky-stars-l1.js 里的紧凑二进制解码成 TypedArray 并缓存。
 * 不接触绘制、不接触命中、不修改 CATALOG（业务星表仍只由 data/catalog.js 提供）。
 *
 * 数据：Bright Star Catalogue 5th Rev. Ed. (Hoffleit & Warren 1991)，NASA HEASARC 修订版。
 * 许可：美国政府作品（公有领域）。
 * 位置：J2000 几何位置，未施加自行。
 *
 * 坐标：ra ∈ [0,360) 度；dec ∈ [-90,90] 度；parallax 不提供。
 */
(function (root) {
  'use strict';

  var VERSION = '1.0.0';
  var REC_BYTES = 7;
  var CLS_LETTERS = ['', 'O', 'B', 'A', 'F', 'G', 'K', 'M', 'W', 'S', 'C', 'D', 'N', 'R', 'T', 'Y'];

  var CACHE = null;
  var NAME = null;
  var STATE = { error: null, missing: false };

  function b64ToBytes(b64) {
    var bin = root.atob(b64);
    var n = bin.length;
    var out = new Uint8Array(n);
    for (var i = 0; i < n; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function load() {
    if (CACHE) return CACHE;
    if (STATE.missing) return null;
    var src = root.SKY_STARS_L1;
    if (!src || typeof src.data !== 'string' || !src.count) {
      STATE.error = 'SKY_STARS_L1 缺失';
      return null;
    }
    try {
      var n = src.count;
      var bytes = b64ToBytes(src.data);
      if (bytes.length !== n * REC_BYTES) {
        STATE.error = '字节数不匹配：' + bytes.length + ' != ' + (n * REC_BYTES);
        return null;
      }
      var sc = src.scale || {};
      var raStep = sc.ra, decStep = sc.dec;
      var magMin = sc.magMin, magStep = src.magStep;
      var bvMin = sc.bvMin, bvStep = src.bvStep;

      var ra = new Float32Array(n);
      var dec = new Float32Array(n);
      var mag = new Float32Array(n);
      var bv = new Float32Array(n);
      var cls = new Uint8Array(n);

      for (var i = 0; i < n; i++) {
        var o = i * REC_BYTES;
        ra[i] = (bytes[o] | (bytes[o + 1] << 8)) * raStep;
        dec[i] = (bytes[o + 2] | (bytes[o + 3] << 8)) * decStep - 90;
        mag[i] = bytes[o + 4] * magStep + magMin;
        var b = bytes[o + 5];
        bv[i] = b === 255 ? NaN : (b * bvStep + bvMin);
        cls[i] = bytes[o + 6];
      }

      CACHE = {
        n: n,
        ra: ra, dec: dec, mag: mag, bv: bv, cls: cls,
        meta: src
      };
      /* 名称表（仅 V≤5.0）：索引 → { alt, name }，供命中与详情卡使用。
       * 缺失时保持 null，L1 仍可绘制只是不可点击。 */
      NAME = null;
      var nt = src.names;
      if (nt && nt.length) {
        NAME = {};
        for (var t = 0; t < nt.length; t++) {
          var row = nt[t];
          if (!row) continue;
          NAME[row[0]] = { alt: row[1] || '', name: row[2] || '' };
        }
      }
      return CACHE;
    } catch (e) {
      STATE.error = String((e && e.message) || e);
      return null;
    }
  }

  function stats() {
    var d = load();
    if (!d) return { ready: false, error: STATE.error, count: 0 };
    var bins = { le2_5: 0, le6_5: 0, gt6_5: 0 };
    var noBV = 0, noCls = 0;
    for (var i = 0; i < d.n; i++) {
      var m = d.mag[i];
      if (m <= 2.5) bins.le2_5++;
      if (m <= 6.5) bins.le6_5++; else bins.gt6_5++;
      if (!isFinite(d.bv[i])) noBV++;
      if (!d.cls[i]) noCls++;
    }
    return {
      ready: true, count: d.n, bins: bins, noBV: noBV, noCls: noCls,
      meta: {
        version: d.meta.version, source: d.meta.source, license: d.meta.license,
        epoch: d.meta.epoch, pm: d.meta.pm, generatedAt: d.meta.generatedAt,
        inputSha256: d.meta.inputSha256
      }
    };
  }

  root.SkyStarData = {
    version: VERSION,
    recordBytes: REC_BYTES,
    load: load,
    records: function () { return load(); },
    count: function () { var d = load(); return d ? d.n : 0; },
    meta: function () { var d = load(); return d ? d.meta : null; },
    /* 名称查询：仅 V≤5.0 的星有条目；其余返回 null（不可点击） */
    nameAt: function (i) {
      if (!load() || !NAME) return null;
      return NAME[i] || null;
    },
    sourceIdAt: function (i) {
      var d = load();
      var records = d && d.meta && d.meta.records;
      return records && records[i] && records[i].sourceId != null ? records[i].sourceId : null;
    },
    recordAt: function (i) {
      var d = load();
      if (!d || i < 0 || i >= d.n || i !== Math.floor(i)) return null;
      var metaRecord = d.meta.records && d.meta.records[i];
      var named = NAME && NAME[i];
      return {
        ra: d.ra[i], dec: d.dec[i], vmag: d.mag[i], bv: isFinite(d.bv[i]) ? d.bv[i] : null,
        cls: d.cls[i], sourceId: metaRecord && metaRecord.sourceId != null ? metaRecord.sourceId : null,
        hr: metaRecord && metaRecord.hr != null ? metaRecord.hr : null,
        name: metaRecord ? (metaRecord.name || '') : (named ? named.name : ''),
        altName: metaRecord ? (metaRecord.altName || '') : (named ? named.alt : ''),
        spectType: metaRecord && metaRecord.spectType != null ? metaRecord.spectType : null,
        parallax: null, pmra: null, pmdec: null,
        units: { ra: 'deg', dec: 'deg', vmag: 'Johnson V magnitude', bv: 'B-V magnitude', parallax: 'mas', pmra: 'mas/yr (mu_alpha*cos(dec))', pmdec: 'mas/yr' },
        epoch: d.meta.epoch, source: d.meta.source, l0Key: null
      };
    },
    namedCount: function () { load(); return NAME ? Object.keys(NAME).length : 0; },
    stats: stats,
    clsLetter: function (code) { return CLS_LETTERS[code] || ''; },
    __setMissing: function (on) {
      /* 仅供测试：模拟数据文件缺失 */
      STATE.missing = !!on;
      if (on) { CACHE = null; STATE.error = 'SKY_STARS_L1 缺失'; }
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
