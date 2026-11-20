/* ASTRUM · 星图图层状态（V2-SKY 阶段 1）
 *
 * 只负责「画不画」的开关，不接触天文数据、不接触画布、不做 UI。
 * 默认全部开启：改造前的星图没有任何图层开关，因此默认值必须与旧表现一致，
 * 不能因为新增状态而让银河、星座线或标签默认消失。
 *
 * 阶段 1 不提供完整图层控制面板；外部可先通过 set/toggle 做程序化控制与测试。
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    stars: true,
    constellations: true,
    milkyWay: true,
    deepSkyObjects: true,
    planets: true,
    horizon: true,
    labels: true
  };

  /* 绘制顺序只作为对外语义声明；真正的顺序仍由 sky-renderer 保证。 */
  var ORDER = ['milkyWay', 'stars', 'deepSkyObjects', 'constellations', 'planets', 'horizon', 'labels'];

  function isKey(k) {
    return ORDER.indexOf(k) >= 0 && Object.prototype.hasOwnProperty.call(DEFAULTS, k);
  }

  function normalize(state) {
    var out = {};
    ORDER.forEach(function (k) { out[k] = DEFAULTS[k]; });
    if (state) {
      ORDER.forEach(function (k) {
        if (typeof state[k] === 'boolean') out[k] = state[k];
      });
    }
    return out;
  }

  function create(initial) {
    var s = normalize(initial);
    var listeners = [];

    function all() { return normalize(s); }
    function emit() {
      var snap = all();
      listeners.slice().forEach(function (fn) {
        try { fn(snap); } catch (e) { /* 订阅方异常不影响图层状态 */ }
      });
    }
    function set(k, on) {
      if (!isKey(k)) return false;
      var next = !!on;
      if (s[k] === next) return true;
      s[k] = next;
      emit();
      return true;
    }
    function toggle(k) {
      if (!isKey(k)) return false;
      return set(k, !s[k]);
    }
    function reset() {
      s = normalize(null);
      emit();
    }
    function onChange(fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    }

    return {
      all: all,
      isOn: function (k) { return !!s[k]; },
      set: set,
      toggle: toggle,
      reset: reset,
      onChange: onChange
    };
  }

  root.SkyLayers = {
    version: '1.0.0',
    DEFAULTS: normalize(null),
    ORDER: ORDER.slice(),
    normalize: normalize,
    create: create
  };
})(typeof window !== 'undefined' ? window : globalThis);
