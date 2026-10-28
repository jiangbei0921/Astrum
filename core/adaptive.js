/* ASTRUM · 运行期自适应布局
 *
 * 原则（按需求约定）：
 *   1. **初始化阶段一律用固定预设结构**——首屏渲染只依赖 CSS 定值，
 *      本模块在 boot 完成后才挂监听，且首次计算必须由真实信号（输入、数据、窗口变化）触发。
 *   2. 只调整「密度与显隐」，不改变事实、顺序、数值与可访问性属性。
 *   3. 每条规则都有回退阈值（迟滞），避免在临界点反复抖动。
 *
 * 为什么用 html 上的 data-* 属性而不是直接改 style：
 *   属性 + CSS 的组合让「预设」和「适配」两套样式能共存、可整体摘除，
 *   回退就是删一个属性，不会留下半截内联样式。
 */
(function (root) {
  'use strict';

  /* 进入 / 退出阈值分开：同一个数字当双向边界，结果一定是抖动 */
  var T = {
    wide: 980,          // ≥ 此宽度算宽屏
    mid: 660,           // ≥ 此宽度算中屏，以下算窄屏
    heroCompactAt: 2,   // 消息数 ≥ 2 → 首屏卡片压缩
    /* 退出阈值必须比进入阈值低至少 1 格，否则迟滞带宽为 0，1↔2 会立刻反复。
     * 取 0：只要有 1 条消息仍保持压缩，彻底清空才回预设。 */
    heroRestoreAt: 0,   // 消息数 = 0 → 恢复
    listDenseAt: 9,     // 会话 ≥ 9 → 列表紧凑
    listRestoreAt: 6,   // 会话 ≤ 6 → 恢复
    composeAt: 2,       // 输入超过 1 行 → 输入区展开
    resizeDebounce: 160
  };

  var st = {
    active: false,
    disabled: false,
    errors: 0,
    reason: '',
    mode: null,
    signals: { width: 0, messages: 0, threads: 0, composeLines: 1, attachments: 0 }
  };

  /* ---------- 纯函数：给定信号与上一状态，算出应有形态 ---------- */
  function decide(sig, prev) {
    var p = prev || {};
    var width = sig.width || 0;
    var w = width >= T.wide ? 'wide' : (width >= T.mid ? 'mid' : 'narrow');

    /* 迟滞：已经在 compact 就一直保持，直到回落到 heroRestoreAt 以下 */
    var hero = p.hero === 'compact'
      ? ((sig.messages || 0) <= T.heroRestoreAt ? 'full' : 'compact')
      : ((sig.messages || 0) >= T.heroCompactAt ? 'compact' : 'full');

    var list = p.list === 'dense'
      ? ((sig.threads || 0) <= T.listRestoreAt ? 'normal' : 'dense')
      : ((sig.threads || 0) >= T.listDenseAt ? 'dense' : 'normal');

    var compose = ((sig.composeLines || 1) >= T.composeAt || (sig.attachments || 0) > 0)
      ? 'expanded' : 'idle';

    return { w: w, hero: hero, list: list, compose: compose };
  }

  /* ---------- 应用 / 回退 ---------- */
  var ATTRS = ['data-adapt', 'data-w', 'data-hero', 'data-list', 'data-compose'];

  function clear() {
    var el = document.documentElement;
    ATTRS.forEach(function (a) { el.removeAttribute(a); });
    st.mode = null;
  }

  function apply() {
    if (!st.active || st.disabled) return;
    try {
      var next = decide(st.signals, st.mode);
      var el = document.documentElement;
      el.setAttribute('data-adapt', 'on');
      el.setAttribute('data-w', next.w);
      el.setAttribute('data-hero', next.hero);
      el.setAttribute('data-list', next.list);
      el.setAttribute('data-compose', next.compose);
      st.mode = next;
    } catch (e) {
      /* 熔断：同一处反复出错就不再逞强，整体回到预设，比半适配可信 */
      st.errors += 1;
      if (st.errors >= 3) {
        st.disabled = true;
        st.reason = 'error';
        clear();
      }
    }
  }

  /* ---------- 信号采集 ---------- */
  function readSignals() {
    st.signals.width = (document.querySelector('.main') || document.body).clientWidth || root.innerWidth || 0;

    var thread = document.getElementById('thread');
    st.signals.messages = thread ? thread.querySelectorAll('.msg').length : 0;

    var list = document.getElementById('threadList');
    st.signals.threads = list ? list.querySelectorAll('.th-item').length : 0;

    var ta = document.getElementById('input');
    if (ta) {
      var lh = parseFloat(getComputedStyle(ta).lineHeight) || 20;
      st.signals.composeLines = Math.max(1, Math.round(ta.scrollHeight / lh));
    }

    var tray = document.getElementById('attachTray');
    st.signals.attachments = (tray && !tray.hidden) ? tray.querySelectorAll('*').length : 0;
  }

  function tick() {
    if (!st.active || st.disabled) return;
    readSignals();
    apply();
  }

  var timer = null;
  function tickSoon() {
    if (timer) clearTimeout(timer);
    timer = setTimeout(tick, T.resizeDebounce);
  }

  /* ---------- 生命周期 ---------- */
  var observers = [];

  function start() {
    if (st.active || st.disabled) return st.active;
    st.active = true;
    /* 注意：这里**不调用 tick()**。初始化阶段保持预设，
     * 第一次适配必须由真实信号触发——这是本次需求的核心约束。 */
    root.addEventListener('resize', tickSoon);

    var ta = document.getElementById('input');
    if (ta && root.MutationObserver) {
      ta.addEventListener('input', tickSoon);
    }

    if (root.MutationObserver) {
      [['thread', '.msg'], ['threadList', '.th-item'], ['attachTray', '*']].forEach(function (pair) {
        var box = document.getElementById(pair[0]);
        if (!box) return;
        var mo = new MutationObserver(tickSoon);
        mo.observe(box, { childList: true, subtree: true });
        observers.push(mo);
      });
    }
    return true;
  }

  function stop(disabled) {
    st.active = false;
    if (disabled) { st.disabled = true; st.reason = st.reason || 'user'; }
    if (timer) { clearTimeout(timer); timer = null; }
    observers.forEach(function (mo) { mo.disconnect(); });
    observers = [];
    clear();
  }

  function setEnabled(on) {
    if (on) {
      st.disabled = false;
      st.errors = 0;
      st.reason = '';
      start();
    } else {
      stop(true);
    }
  }

  /* 由外部（设置/URL/熔断）强制回到预设 */
  function reset(reason) {
    if (reason) st.reason = reason;
    clear();
    if (st.mode) st.mode = null;
  }

  root.Adaptive = {
    T: T,
    decide: decide,
    start: start,
    stop: stop,
    setEnabled: setEnabled,
    reset: reset,
    tick: tick,
    state: function () { return { active: st.active, disabled: st.disabled, errors: st.errors, reason: st.reason, mode: st.mode, signals: st.signals }; }
  };
})(typeof window !== 'undefined' ? window : this);
