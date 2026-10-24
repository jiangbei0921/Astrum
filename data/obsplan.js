/* ASTRUM · 观测与拍摄参数数据
 * 角径：梅西耶与明亮深空天体的典型视直径（角分，' 为角秒），取自公开星表的中位值；
 * 天空背景亮度：波特尔等级 → 每平方角秒天光亮度（mag/arcsec²）；
 * 相机预设：常见 APS-C / 全画幅 / M43 / 手机传感器与像素尺寸，用于视场与采样率估算。
 * 说明：这些是规划用的近似值，不替代具体器材的实测参数。
 */
(function (root) {
  'use strict';

  /* 角径（角分） */
  var SIZE = {
    M1: 6, M2: 16, M8: 90, M13: 20, M15: 18, M16: 35, M17: 46, M20: 16, M22: 32,
    M27: 8, M31: 190, M33: 70, M35: 28, M38: 21, M39: 32, M41: 38, M42: 85, M44: 95,
    M45: 110, M46: 30, M47: 30, M51: 11, M57: 1.4, M63: 12.6, M64: 9.3, M65: 8,
    M78: 8, M81: 27, M82: 11, M83: 11, M92: 14, M97: 7, M101: 28, M104: 9, M106: 18,
    M108: 8, M109: 8, M110: 21, NGC224: 190, NGC253: 27, NGC7000: 120, NGC6960: 70,
    IC434: 60, IC1396: 170, IC5070: 25, NGC2244: 60, NGC7635: 15, NGC891: 13
  };

  /* 波特尔等级 → 天光亮度（mag/arcsec²）与目视极限 */
  var SKY = {
    1: { s: 21.9, nel: 7.6 }, 2: { s: 21.7, nel: 7.1 }, 3: { s: 21.5, nel: 6.5 },
    4: { s: 20.8, nel: 6.0 }, 5: { s: 20.3, nel: 5.6 }, 6: { s: 19.4, nel: 5.1 },
    7: { s: 18.7, nel: 4.6 }, 8: { s: 18.0, nel: 4.1 }, 9: { s: 17.5, nel: 3.5 }
  };

  /* 相机预设：传感器尺寸 mm、像元 µm、焦距 mm、焦比 f/ */
  var CAMERAS = [
    { id: 'asi', name: 'APS-C 单反（如 2600/533）', w: 23.5, h: 15.6, px: 3.76, fl: 400, f: 5 },
    { id: 'ff', name: '全画幅单反（如 6D/5D）', w: 36, h: 24, px: 6.55, fl: 400, f: 5 },
    { id: 'm43', name: 'M43 微单', w: 17.3, h: 13, px: 3.3, fl: 400, f: 5 },
    { id: 'wide', name: '广角 + 改机（135mm f/2）', w: 23.5, h: 15.6, px: 3.76, fl: 135, f: 2 },
    { id: 'lens', name: '手机长焦（约 135mm 等效）', w: 6.2, h: 4.6, px: 1.55, fl: 135, f: 2.8 },
    { id: 'scope', name: '长焦镜筒（1000mm f/5）', w: 23.5, h: 15.6, px: 3.76, fl: 1000, f: 5 }
  ];

  /* 采样率经验值：宽视场 2–3″/px，小目标 1–2″/px，行星 < 0.5″/px */
  function samplingFor(sizeArcmin) {
    if (sizeArcmin == null) return 2;
    if (sizeArcmin >= 60) return 3;
    if (sizeArcmin >= 20) return 2;
    if (sizeArcmin >= 8) return 1.5;
    return 1;
  }
  /* 由目标角径与采样率反推焦距（mm） */
  function focalFor(sizeArcmin, pixelUm, arcsecPerPx) {
    if (!sizeArcmin) return null;
    return Math.round(sizeArcmin * 60 * 206.265 / (pixelUm * arcsecPerPx));
  }
  /* 视场（度） */
  function fovDeg(sensorMm, fl) {
    return 2 * Math.atan(sensorMm / 2 / fl) * 180 / Math.PI;
  }
  /* 像元比例（角秒/像素） */
  function pixelScale(pixelUm, fl) {
    return 206.265 * pixelUm / fl;
  }
  /* 天光限制的单张曝光（秒） */
  function maxExposure(bortle) {
    var s = (SKY[bortle] || SKY[7]).s;
    return Math.max(2, Math.round(600 * Math.pow(2, 1.25 * (s - 21.9))));
  }

  /* 行星与卫星的视直径（角秒，典型冲日/近地值） */
  var PSIZE = {
    sun: 1900, moon: 31, mercury: 12, venus: 25, mars: 18,
    jupiter: 140, saturn: 44, uranus: 20, neptune: 19,
    io: 42, europa: 22, ganymede: 40, callisto: 36, titan: 20, triton: 13
  };

  root.OBSPLAN = {
    SIZE: SIZE, PSIZE: PSIZE, SKY: SKY, CAMERAS: CAMERAS,
    samplingFor: samplingFor, focalFor: focalFor,
    fovDeg: fovDeg, pixelScale: pixelScale, maxExposure: maxExposure
  };
})(typeof window !== 'undefined' ? window : globalThis);
