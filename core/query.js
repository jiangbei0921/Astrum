/* ASTRUM · 可复现查询生成器
 *
 * 目的：让每一条外部数据结论都能被读者「自己再查一遍」。
 * 即使当前环境不允许直连 TAP（浏览器 CORS 限制），也把**可复制运行的查询**交出去，
 * 读者丢进 SIMBAD / Gaia 的 TAP 界面即可复跑，结果与本文一致。
 *
 * 不联网、不执行，只生成语句与直达链接。
 */
(function (root) {
  'use strict';

  function fmtRa(raDeg) {
    var h = raDeg / 15;
    var hh = Math.floor(h);
    var mmf = (h - hh) * 60;
    var mi = Math.floor(mmf);
    var ss = (mmf - mi) * 60;
    return hh + 'h' + (mi < 10 ? '0' : '') + mi + 'm' + (ss < 10 ? '0' : '') + ss.toFixed(1) + 's';
  }

  function fmtDec(decDeg) {
    var sign = decDeg < 0 ? '-' : '+';
    var a = Math.abs(decDeg);
    var d = Math.floor(a);
    var mf = (a - d) * 60;
    var m = Math.floor(mf);
    var s = (mf - m) * 60;
    return sign + d + '°' + (m < 10 ? '0' : '') + m + '′' + (s < 10 ? '0' : '') + s.toFixed(0) + '″';
  }

  /* SIMBAD TAP：按坐标锥形检索附近的已收录天体 */
  function simbadAdql(ra, dec, radiusArcmin) {
    var r = (radiusArcmin || 2) / 60;
    return [
      'SELECT TOP 20 main_id, ra, dec, otype_txt, V, plx_value, otype',
      'FROM basic',
      "WHERE 1=CONTAINS(POINT('ICRS', ra, dec),",
      "                 CIRCLE('ICRS', " + ra.toFixed(5) + ', ' + dec.toFixed(5) + ', ' + r.toFixed(4) + '))',
      'ORDER BY V ASC'
    ].join('\n');
  }

  /* Gaia DR3：附近恒星的位置、视差与自行（可自行换算距离） */
  function gaiaAdql(ra, dec, radiusArcmin) {
    var r = (radiusArcmin || 2) / 60;
    return [
      'SELECT TOP 50 source_id, ra, dec, parallax, parallax_error,',
      '       pmra, pmdec, phot_g_mean_mag',
      'FROM gaiadr3.gaia_source',
      "WHERE 1=CONTAINS(POINT('ICRS', ra, dec),",
      "                 CIRCLE('ICRS', " + ra.toFixed(5) + ', ' + dec.toFixed(5) + ', ' + r.toFixed(4) + '))',
      '  AND parallax > 0',
      'ORDER BY phot_g_mean_mag ASC'
    ].join('\n');
  }

  var ENDPOINTS = {
    simbad: {
      name: 'SIMBAD TAP',
      url: 'https://simbad.u-strasbg.fr/simbad/sim-tap',
      hint: '打开后切到「TAP / ADQL」标签，粘贴查询即可'
    },
    gaia: {
      name: 'Gaia Archive TAP',
      url: 'https://gea.esac.esa.int/tap-server/tap',
      hint: '打开后在「Advanced ADQL」里粘贴执行'
    }
  };

  /* 直达链接：不用写查询也能看结果 */
  function linksFor(name, ra, dec) {
    var raS = ra.toFixed(4), decS = dec.toFixed(4);
    var out = [
      { label: 'SIMBAD 坐标检索', url: 'https://simbad.u-strasbg.fr/simbad/sim-coo?Coord=' +
        raS + '%20' + decS + '&CooFrame=ICRS&CooEpoch=2000&Radius=2&Radius.unit=arcmin' },
      { label: 'VizieR 星表', url: 'https://vizier.cds.unistra.fr/viz-bin/VizieR?-c=' + raS + '%20' + decS + '&-c.rs=2' },
      { label: 'SkyView 影像', url: 'https://skyview.gsfc.nasa.gov/current/cgi/query.pl?Position=' +
        raS + ',' + decS + '&Survey=DSS2+Red&Return=GIF' }
    ];
    if (name) {
      out.push({ label: 'ADS 文献', url: 'https://ui.adsabs.harvard.edu/search/q=' + encodeURIComponent('"' + name + '"') });
    }
    return out;
  }

  /* 一次给全：坐标写法 + 两条可复跑查询 + 四个直达链接 */
  function forTarget(opt) {
    opt = opt || {};
    var ra = opt.ra, dec = opt.dec;
    if (ra == null || dec == null) return null;
    var rad = opt.radiusArcmin || 2;
    return {
      name: opt.name || '',
      coord: { ra: fmtRa(ra), dec: fmtDec(dec), raDeg: ra, decDeg: dec, epoch: 'J2000' },
      radiusArcmin: rad,
      queries: [
        { target: 'simbad', title: '附近已收录天体（SIMBAD）', sql: simbadAdql(ra, dec, rad), endpoint: ENDPOINTS.simbad },
        { target: 'gaia', title: '附近恒星与视差（Gaia DR3）', sql: gaiaAdql(ra, dec, rad), endpoint: ENDPOINTS.gaia }
      ],
      links: linksFor(opt.name, ra, dec)
    };
  }

  root.QUERY = {
    forTarget: forTarget,
    simbadAdql: simbadAdql,
    gaiaAdql: gaiaAdql,
    linksFor: linksFor,
    fmtRa: fmtRa,
    fmtDec: fmtDec,
    ENDPOINTS: ENDPOINTS
  };
})(typeof window !== 'undefined' ? window : globalThis);
