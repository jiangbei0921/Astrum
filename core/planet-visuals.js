/* ASTRUM · 行星视觉可复用接口（V2-SKY 阶段 1）
 *
 * 目标：为后续星图行星升级固化一组稳定签名，先确认太阳系现有球体/环渲染
 * 能否被安全复用；本阶段**不**改变星图里行星的现有画法，也不改 solarsystem.js。
 *
 * 为什么现在不能直接复用（详见 docs/V2-SKY-阶段1-规格.md §7）：
 *   1. renderSphereSprite / drawSphereDetail / drawRings / buildTexture 都在
 *      solarsystem.js 的 IIFE 内部，SolarView 没有导出它们；
 *   2. drawRings 读模块级 canvas 尺寸与 st.phase，星图场景下 canvas 可能为 null；
 *   3. 这些函数需要三维相机基（pos/fwd/right/up/fov）、世界坐标 bpos 和
 *      lightDir，星图只有二维投影坐标，强行套用会改变现有外观。
 *
 * 因此本阶段只提供能力探测与安全降级。等阶段 5 获批并给出 primitives 导出后，
 * 同一组签名可以直接接上，调用方无需再改。
 */
(function (root) {
  'use strict';

  var REASONS = [
    'solarview-primitives-not-exported',
    'drawRings-depends-on-module-canvas',
    'sphere-renderer-requires-3d-camera-basis'
  ];

  function primitives() {
    var sv = root.SolarView;
    return (sv && sv.primitives) || null;
  }

  function capabilities() {
    var p = primitives();
    var hasSphere = !!(p && typeof p.sphereSprite === 'function');
    var hasRings = !!(p && typeof p.rings === 'function');
    var hasTexture = !!(p && typeof p.texture === 'function');
    return {
      detailedSphere: hasSphere,
      rings: hasRings,
      textures: hasTexture,
      source: (hasSphere || hasRings || hasTexture) ? 'solarview-primitives' : 'none',
      reasons: (hasSphere || hasRings || hasTexture) ? [] : REASONS.slice()
    };
  }

  function texture(key) {
    var p = primitives();
    if (!p || typeof p.texture !== 'function') return null;
    return p.texture(key) || null;
  }

  /* opts: { key, cx, cy, r, lightDir, camera, basis, phase } */
  function sphere(g, opts) {
    var p = primitives();
    if (!p || typeof p.sphereSprite !== 'function') return false;
    return p.sphereSprite(g, opts || {}) !== false;
  }

  function rings(g, opts, front) {
    var p = primitives();
    if (!p || typeof p.rings !== 'function') return false;
    return p.rings(g, opts || {}, !!front) !== false;
  }

  function summary() {
    var cap = capabilities();
    return {
      version: '1.1.0',
      source: cap.source,
      detailedSphere: cap.detailedSphere,
      rings: cap.rings,
      textures: cap.textures,
      reasons: cap.reasons,
      /* 阶段 5 的最小改动前提，供交付报告与后续规划引用 */
      requiredChanges: [
        'SolarView 增补 primitives 只读导出',
        'drawRings 显式接收画布宽高，去掉模块级 canvas 依赖',
        'planet-visuals 构造最小虚拟 basis 与 lightDir 后再接入星图'
      ]
    };
  }

  /* ============================================================
     阶段 4：相位角 / 照明比例 / 环倾角 / 磁盘纹理
     只使用 Astro 已导出的 helio / sun / planet，不改 astro.js。
     ============================================================ */

  /* 相位角（太阳-行星-地球夹角，度）。用余弦定理解算，避免 asin 的锐角歧义。
   * 与 Astro.planet() 内部同一公式；此处复算是因为该函数未把相位角导出。 */
  function phaseAngle(key, jd) {
    var A = root.Astro;
    if (!A || !A.helio || !A.sun) return null;
    if (!isFinite(jd)) return null;
    var p = A.helio(key, jd), e = A.helio('earth', jd), s = A.sun(jd);
    if (!p || !e || !s || !(p.r > 0)) return null;
    var dx = p.x - e.x, dy = p.y - e.y, dz = p.z - e.z;
    var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (!(dist > 0) || !(s.dist > 0)) return null;
    var cosI = (p.r * p.r + dist * dist - s.dist * s.dist) / (2 * p.r * dist);
    return Math.acos(Math.max(-1, Math.min(1, cosI))) * 180 / Math.PI;
  }

  /* 被照亮比例：(1 + cos i) / 2，0 = 新月，1 = 满相 */
  function illumFraction(iDeg) {
    if (iDeg == null || !isFinite(iDeg)) return 1;
    return (1 + Math.cos(iDeg * Math.PI / 180)) / 2;
  }

  /* 土星环倾角 B（度）：环平面法线取 J2000 极轴 RA 40.589° / Dec 83.537°，
   * 与「土星→地球」方向的夹角余角。忽略极轴长期进动，属示意级近似。 */
  function ringTilt(jd) {
    var A = root.Astro;
    if (!A || !A.planet || !isFinite(jd)) return null;
    var sp = A.planet('saturn', jd);
    if (!sp) return null;
    var ra = sp.ra * 15 * Math.PI / 180, dec = sp.dec * Math.PI / 180;
    /* 地球在土星方向的「反向」单位向量（土星指向地球） */
    var ux = -Math.cos(dec) * Math.cos(ra);
    var uy = -Math.cos(dec) * Math.sin(ra);
    var uz = -Math.sin(dec);
    var pr = 40.589 * Math.PI / 180, pd = 83.537 * Math.PI / 180;
    var px = Math.cos(pd) * Math.cos(pr), py = Math.cos(pd) * Math.sin(pr), pz = Math.sin(pd);
    var dot = ux * px + uy * py + uz * pz;
    return Math.asin(Math.max(-1, Math.min(1, dot))) * 180 / Math.PI;
  }

  /* 磁盘纹理：离屏 canvas 生成一次。无 document（Node 测试）时返回 null。 */
  var _texCache = {};
  function diskTexture(key) {
    if (typeof document === 'undefined') return null;
    if (_texCache[key]) return _texCache[key];
    var S = 96, cv = document.createElement('canvas');
    cv.width = S; cv.height = S;
    var c = cv.getContext('2d');
    if (!c) return null;
    var base = {
      mercury: '#9a9a96', venus: '#e8d9b0', mars: '#c1704a',
      jupiter: '#d9c3a0', saturn: '#e0d2a8', uranus: '#a8dbe0', neptune: '#7fa8dd'
    }[key];
    if (!base) return null;
    c.fillStyle = base;
    c.fillRect(0, 0, S, S);
    function bands(colors, widths) {
      var y = 0;
      for (var i = 0; i < colors.length; i++) {
        c.fillStyle = colors[i];
        c.fillRect(0, y, S, widths[i]);
        y += widths[i];
      }
    }
    if (key === 'jupiter') {
      bands(['#cdb693', '#e6d3b0', '#b99f7c', '#efe0c4', '#c9b08a', '#e8d8bb', '#bfa684'],
        [S * 0.12, S * 0.14, S * 0.12, S * 0.16, S * 0.12, S * 0.16, S * 0.18]);
      c.fillStyle = 'rgba(180,110,80,0.55)';
      c.beginPath(); c.ellipse(S * 0.66, S * 0.62, S * 0.1, S * 0.05, 0, 0, Math.PI * 2); c.fill();
    } else if (key === 'saturn') {
      bands(['#ded0a6', '#eadcb6', '#d8c79c', '#eadcb6', '#d3c095'],
        [S * 0.2, S * 0.2, S * 0.2, S * 0.2, S * 0.2]);
    } else if (key === 'mars') {
      c.fillStyle = '#b5643f';
      c.fillRect(0, 0, S, S);
      c.fillStyle = 'rgba(120,60,40,0.45)';
      c.beginPath(); c.ellipse(S * 0.42, S * 0.55, S * 0.18, S * 0.1, 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(240,236,230,0.85)';
      c.beginPath(); c.ellipse(S * 0.5, S * 0.06, S * 0.16, S * 0.05, 0, 0, Math.PI * 2); c.fill();
    } else if (key === 'venus') {
      c.fillStyle = 'rgba(255,248,225,0.55)';
      c.beginPath(); c.ellipse(S * 0.4, S * 0.42, S * 0.3, S * 0.08, -0.25, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(S * 0.6, S * 0.64, S * 0.26, S * 0.07, 0.2, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.16)';
      c.fillRect(0, S * 0.3, S, S * 0.06);
      c.fillRect(0, S * 0.62, S, S * 0.05);
    }
    _texCache[key] = cv;
    return cv;
  }

  root.PlanetVisuals = {
    version: '1.1.0',
    capabilities: capabilities,
    texture: texture,
    sphere: sphere,
    rings: rings,
    summary: summary,
    phaseAngle: phaseAngle,
    illumFraction: illumFraction,
    ringTilt: ringTilt,
    diskTexture: diskTexture
  };
})(typeof window !== 'undefined' ? window : globalThis);
