/* ASTRUM · Control Bridge（V1.1）
 *
 * 把 AstroRequest 的分流结果交给 AstroControl，并转换为 UI 可消费的统一结果。
 * 只被 app.js 调用；Node 测试可直接调用以验证统一入口。
 */
(function (root) {
  'use strict';

  function classify(query, ctx, cfg) {
    if (!root.AstroRequest) throw new Error('AstroControlBridge 需要 AstroRequest');
    return root.AstroRequest.classify(query, ctx, cfg);
  }

  /* V1.4：Web/云端复杂研究、显式对比、已解析 FITS / 论文 PDF 附件进入 Control。
   * 图片/文本/未解析附件仍走旧链路；L1 永不接管。 */
  function allAttachmentsSupported(atts) {
    if (!atts || !atts.length) return true;
    return atts.every(function (a) {
      if (!a) return false;
      if (a.kind === 'fits') return !!(a.fits && Array.isArray(a.fits.hdus) && a.fits.hdus.length > 0);
      if (a.kind === 'paper') return !!(a.paper && a.paper.ok === true);
      return false;
    });
  }

  function canControl(info, scene) {
    scene = scene || {};
    if (!info || !info.control) return false;
    var atts = scene.attachments || [];
    var allSupported = allAttachmentsSupported(atts);
    if (scene.mode === 'compare') {
      return scene.forceCompare === true && scene.sourceType === 'local' && !atts.length;
    }
    if (scene.sourceType !== 'local') {
      return info.route.mode === 'research' && allSupported;
    }
    return allSupported;
  }

  /* V1.5：所有云端/本机模型表述统一经过 Control Bridge。
   * 只包装外部调用，不改变 Sources 的 provider 协议；错误分类与调用状态统一。 */
  async function modelGenerate(id, payload, opts) {
    opts = opts || {};
    if (opts.signal && opts.signal.aborted) {
      return { ok: false, code: 'cancelled', reason: '已取消', modelId: id };
    }
    var S = root.Sources;
    if (!S || typeof S.generate !== 'function') {
      return { ok: false, code: 'sources_missing', reason: '模型来源模块未加载', modelId: id };
    }
    var t0 = Date.now();
    try {
      var p = Object.assign({}, payload || {});
      if (opts.signal) p.signal = opts.signal;
      if (opts.timeoutMs) p.timeoutMs = opts.timeoutMs;
      var r = await S.generate(id, p);
      return {
        ok: true, code: 'ok', text: r && r.text || '',
        latency: r && r.latency != null ? r.latency : Date.now() - t0,
        tokens: r && r.tokens != null ? r.tokens : null,
        usage: r && r.usage ? r.usage : null,
        modelId: id, source: 'cloud'
      };
    } catch (e) {
      var msg = String(e && e.message || e);
      var cls = (S && typeof S.classifyError === 'function') ? S.classifyError(e) : null;
      var code = cls && cls.kind ? ({
        auth: 'auth',
        rate_limit: 'rate_limit',
        timeout: 'timeout',
        server: 'server',
        notfound: 'notfound',
        parse: 'parse',
        empty: 'empty',
        network: 'network',
        cors: 'network',
        csp: 'network'
      })[cls.kind] : null;
      /* 兼容旧调用方直接抛字符串：classifyError 得到 unknown 时沿用原有正则。 */
      if (!code || cls.kind === 'unknown') {
        code = /限流|429|rate/i.test(msg) ? 'rate_limit'
          : /超时|timeout|abort/i.test(msg) ? 'timeout'
            : /密钥|401|403|无权/i.test(msg) ? 'auth'
              : 'network';
      }
      if (opts.signal && opts.signal.aborted) code = 'cancelled';
      return {
        ok: false, code: code,
        kind: cls ? cls.kind || code : code,
        status: e && e.status ? e.status : null,
        retryable: !!(cls && cls.retryable),
        reason: msg.slice(0, 160),
        modelId: id, latency: Date.now() - t0
      };
    }
  }

  async function runWithRoute(info, queryForAnswer, ctx, cfg, opts) {
    opts = opts || {};
    if (!info || !info.control || !root.AstroControl) {
      return { mode: 'legacy', route: info && info.route || null, answer: null, control: null };
    }
    var store = opts.store != null ? opts.store : (root.AstroTaskStore ? root.AstroTaskStore.create({}) : null);
    var result = await root.AstroControl.run(queryForAnswer, ctx, cfg, {
      routeData: info.routeData,
      signal: opts.signal,
      store: store,
      network: opts.network == null ? true : !!opts.network,
      maxReplans: opts.maxReplans,
      onEvent: opts.onEvent,
      adapter: opts.adapter,
      registry: opts.registry,
      attachmentsEvidence: opts.attachmentsEvidence || null,
      fulltext: opts.fulltext,
      forceCompare: opts.forceCompare
    });
    return {
      mode: 'control',
      route: result.route || info.route,
      answer: result.answer,
      research: result.answer && result.answer.research ? result.answer.research : null,
      control: result,
      cancelled: !!result.cancelled,
      verdict: result.verdict,
      store: store
    };
  }

  function run(query, ctx, cfg, opts) {
    opts = opts || {};
    var info = classify(query, ctx, cfg);
    return runWithRoute(info, query, ctx, cfg, opts);
  }

  async function resume(taskId, ctx, cfg, opts) {
    opts = opts || {};
    if (!root.AstroControl) return null;
    var store = opts.store != null ? opts.store : (root.AstroTaskStore ? root.AstroTaskStore.create({}) : null);
    var r = await root.AstroControl.resume(taskId, ctx, cfg, {
      store: store, signal: opts.signal, signalOnly: opts.signalOnly
    });
    return r;
  }

  root.AstroControlBridge = {
    classify: classify,
    canControl: canControl,
    run: run,
    runWithRoute: runWithRoute,
    resume: resume,
    modelGenerate: modelGenerate,
    version: '1.5.0'
  };
})(typeof window !== 'undefined' ? window : global);
