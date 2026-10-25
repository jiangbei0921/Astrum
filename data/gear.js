/* ASTRUM · 器材库
 *
 * 收录爱好者最常见、参数公开可查的器材档位。每一条的焦距、口径、焦比
 * 都是厂商标称值，用于视场与采样估算，不替代具体批次的实测参数。
 *
 * 约定：
 *   ap   口径 mm
 *   fl   焦距 mm（双筒为物镜焦距；肉眼为 0）
 *   f    焦比（fl / ap）
 *   kind naked | bino | scope | lens
 */
(function (root) {
  'use strict';

  var GEAR = [
    { id: 'naked', name: '肉眼', ap: 0, fl: 0, f: 0, kind: 'naked',
      note: '极限星等约 6.5（暗空），月亮与银河足够' },

    { id: 'bino750', name: '7×50 双筒', ap: 50, fl: 250, f: 5, kind: 'bino',
      note: '出瞳 7.1mm，暗适应后最亮，适合大面积扫视' },
    { id: 'bino1050', name: '10×50 双筒', ap: 50, fl: 250, f: 5, kind: 'bino',
      note: '出瞳 5mm，光害环境下对比度更好' },
    { id: 'bino1570', name: '15×70 双筒', ap: 70, fl: 280, f: 4, kind: 'bino',
      note: '需要三脚架，深空目标细节明显提升' },

    { id: 'ref80', name: '80mm f/7 折射', ap: 80, fl: 560, f: 7, kind: 'scope',
      note: '入门深空主力，轻便、易携带' },
    { id: 'ref102', name: '102mm f/7 折射', ap: 102, fl: 714, f: 7, kind: 'scope',
      note: '口径与便携的平衡点' },
    { id: 'new130', name: '130/650 牛顿 f/5', ap: 130, fl: 650, f: 5, kind: 'scope',
      note: '性价比高，需要偶尔调光轴' },
    { id: 'new150', name: '150/750 牛顿 f/5', ap: 150, fl: 750, f: 5, kind: 'scope',
      note: '深空与行星兼顾' },
    { id: 'new200', name: '200/1000 牛顿 f/5', ap: 200, fl: 1000, f: 5, kind: 'scope',
      note: '口径足够分解球状星团，对赤道仪要求高' },
    { id: 'new200f6', name: '200/1200 牛顿 f/6', ap: 200, fl: 1200, f: 6, kind: 'scope',
      note: '焦比更慢，行星成像更从容' },
    { id: 'sct8', name: 'C8 施卡 203/2032 f/10', ap: 203, fl: 2032, f: 10, kind: 'scope',
      note: '长焦行星利器，深空需减焦镜' },
    { id: 'mak90', name: '90mm 马卡 1250 f/13.9', ap: 90, fl: 1250, f: 14, kind: 'scope',
      note: '极便携，行星与双星为主' },

    { id: 'lens135', name: '135mm f/2 定焦', ap: 68, fl: 135, f: 2, kind: 'lens',
      note: '广域深空的经典焦段' },
    { id: 'lens200', name: '200mm f/2.8 定焦', ap: 71, fl: 200, f: 2.8, kind: 'lens',
      note: '适合大星云与银河局部' }
  ];

  var BY_ID = {};
  GEAR.forEach(function (g) { BY_ID[g.id] = g; });

  function byId(id) { return BY_ID[id] || BY_ID.new150; }

  /* 目视极限星等（粗略）：随口径增长，受光害压制 */
  function limitingMag(gear, bortle) {
    var sky = { 1: 7.6, 2: 7.1, 3: 6.5, 4: 6.0, 5: 5.6, 6: 5.1, 7: 4.6, 8: 4.1, 9: 3.5 };
    var nel = sky[bortle] || 4.6;
    if (gear.kind === 'naked') return nel;
    /* 口径增益：2.5·log10(口径/7mm 瞳孔) */
    var gain = 2.5 * Math.log10(Math.max(gear.ap, 7) / 7);
    return Math.round((nel + gain) * 10) / 10;
  }

  root.GEAR = { LIST: GEAR, BY_ID: BY_ID, byId: byId, limitingMag: limitingMag };
})(typeof window !== 'undefined' ? window : globalThis);
