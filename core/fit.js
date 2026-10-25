/* ASTRUM · 器材匹配引擎
 *
 * 输入目标角径、星等、器材、相机与天空条件，输出「能不能拍到、占多大、会不会采样过度」
 * 四个可复算的量。所有公式都写明出处，便于读者自己核。
 *
 * 依赖：data/gear.js（器材档位）、data/obsplan.js（视场/采样/曝光数学）
 */
(function (root) {
  'use strict';

  var OB = root.OBSPLAN, G = root.GEAR;

  var VERDICT = {
    'ok':        { key: 'ok',        label: '合适',   tone: 'good' },
    'tight':     { key: 'tight',     label: '偏紧',   tone: 'warn' },
    'too-big':   { key: 'too-big',   label: '装不下', tone: 'bad' },
    'too-small': { key: 'too-small', label: '偏小',   tone: 'warn' },
    'naked-ok':  { key: 'naked-ok',  label: '肉眼可见', tone: 'good' },
    'invisible': { key: 'invisible', label: '看不到', tone: 'bad' }
  };

  function round(n, d) {
    var k = Math.pow(10, d == null ? 1 : d);
    return Math.round(n * k) / k;
  }

  /* 核心：给定目标与器材，算出四个量与一个结论 */
  function evaluate(opt) {
    opt = opt || {};
    var gear = typeof opt.gear === 'string' ? G.byId(opt.gear) : (opt.gear || G.byId('new150'));
    var cam = opt.camera || OB.CAMERAS[0];
    var bortle = opt.bortle || 6;
    var sizeArcmin = opt.sizeArcmin;          /* 目标较长边角分 */
    var mag = (opt.mag == null ? 6 : opt.mag);

    var limMag = G.limitingMag(gear, bortle);
    var checks = [];
    var out = {
      gear: gear, camera: cam, bortle: bortle,
      limitingMag: limMag,
      targetSizeArcmin: sizeArcmin,
      exposure: OB.maxExposure(bortle)
    };

    /* 肉眼 / 双筒：按极限星等与目标大小判断 */
    if (gear.kind === 'naked') {
      var visible = mag <= limMag;
      out.verdict = visible ? VERDICT['naked-ok'] : VERDICT['invisible'];
      out.reason = visible
        ? '极限星等约 ' + limMag + '，目标 ' + mag + ' 等，暗适应后可直接看到'
        : '极限星等约 ' + limMag + '，目标 ' + mag + ' 等，肉眼不可见';
      checks.push({ name: '极限星等', ok: visible, detail: '目标 ' + mag + ' 等 / 极限 ' + limMag + ' 等' });
      out.checks = checks;
      return out;
    }

    /* 光学器材：视场与采样 */
    if (!sizeArcmin) {
      /* 没有角径数据时只给视场与极限星等，不下结论 */
      var fw0 = OB.fovDeg(cam.w, gear.fl);
      out.fov = { w: round(fw0, 2), h: round(OB.fovDeg(cam.h, gear.fl), 2) };
      out.pixelScale = round(OB.pixelScale(cam.px, gear.fl), 2);
      out.verdict = null;
      out.reason = '缺少该目标的角径数据，只给出视场与采样参数';
      checks.push({ name: '角径数据', ok: false, detail: '未收录角径，无法判断装不装得下' });
      out.checks = checks;
      return out;
    }

    var fovW = OB.fovDeg(cam.w, gear.fl);
    var fovH = OB.fovDeg(cam.h, gear.fl);
    var targetDeg = sizeArcmin / 60;
    var ratioW = targetDeg / fovW;            /* 相对长边 */
    var ratioH = targetDeg / fovH;            /* 相对短边：>1 表示短边会裁 */

    out.fov = { w: round(fovW, 2), h: round(fovH, 2) };
    out.targetDeg = round(targetDeg, 3);
    out.ratio = round(ratioW * 100, 0);       /* 占长边百分比 */
    out.ratioShort = round(ratioH * 100, 0);  /* 占短边百分比 */

    var verdictKey;
    if (ratioW > 1) verdictKey = 'too-big';
    else if (ratioH > 0.95) verdictKey = 'tight';
    else if (ratioW >= 0.12) verdictKey = 'ok';
    else verdictKey = 'too-small';
    out.verdict = VERDICT[verdictKey];

    /* 采样率 */
    var ideal = OB.samplingFor(sizeArcmin);
    var ps = OB.pixelScale(cam.px, gear.fl);
    out.pixelScale = round(ps, 2);
    out.sampleIdeal = ideal;
    var sampleOk = ps <= ideal * 1.5 && ps >= ideal * 0.6;
    out.sampleVerdict = ps > ideal * 1.5 ? '欠采样（星点偏方）'
      : ps < ideal * 0.6 ? '过采样（无谓放大）' : '采样合适';

    /* 文字结论 */
    if (verdictKey === 'too-big') {
      out.reason = '目标角径 ' + sizeArcmin + '′，长边视场只有 ' + round(fovW * 60, 0) + '′，拍不全';
    } else if (verdictKey === 'tight') {
      out.reason = '长边占 ' + out.ratio + '%、短边占 ' + out.ratioShort + '%，短边接近填满，建议旋转构图或加减焦镜';
    } else if (verdictKey === 'too-small') {
      out.reason = '目标只占长边 ' + out.ratio + '%，细节会很少，建议更长焦距';
    } else {
      out.reason = '长边占 ' + out.ratio + '%、短边占 ' + out.ratioShort + '%，构图留有余量';
    }

    checks.push({ name: '视场容纳', ok: ratioW <= 1, detail: '长边占 ' + out.ratio + '%、短边占 ' + out.ratioShort + '%' });
    checks.push({ name: '采样率', ok: sampleOk, detail: out.pixelScale + '″/px（建议 ' + ideal + '″/px）' });

    out.checks = checks;
    return out;
  }

  root.FIT = { evaluate: evaluate, VERDICT: VERDICT, round: round };
})(typeof window !== 'undefined' ? window : globalThis);
