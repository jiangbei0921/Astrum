/* ASTRUM · P3 Capability Resolver
 *
 * 依据：docs/P3/P3-03-Agent-Skill-Tool调度与权限设计.md §4
 *
 * 统一把步骤解析为「执行主体 + 版本」：
 *   tool  -> ToolRegistry 规格 + 负责 Agent
 *   skill -> 当前 published 版本 + 负责 Agent
 * 只读、无副作用；Skill 已发布查询可注入（浏览器端异步，需用 resolveAsync）。
 */
(function (root) {
  'use strict';

  var TOOL_AGENT = {
    'evidence.search': 'scholar',
    'paper.search': 'scholar',
    'astro.lookup': 'muse',
    'astro.calc': 'muse',
    'compare.curate': 'critic',
    'compose.brief': 'muse',
    'compose.research': 'muse',
    'compose.compare': 'muse'
  };

  function miss(capability, reason) {
    return { ok: false, code: 'capability_missing', capability: capability || '', reason: reason || '能力不可用' };
  }

  function isSkillStep(step) {
    return !!step && (step.kind === 'skill' || (!!step.skillId && !step.tool));
  }

  function syncLookup(step, ctx) {
    if (ctx && typeof ctx.skillLookup === 'function') return ctx.skillLookup(step.skillId);
    return null;
  }

  function buildSkillResult(step, published) {
    var version = published && (published.version || published);
    return {
      ok: true,
      kind: 'skill',
      capability: 'skill:' + step.skillId,
      skillId: step.skillId,
      versionId: (version && (version.versionId || version.id)) || null,
      agentId: step.agentId || 'muse'
    };
  }

  function buildToolResult(step, spec) {
    return {
      ok: true,
      kind: 'tool',
      capability: step.tool,
      toolId: step.tool,
      toolVersion: spec && spec.toolVersion ? spec.toolVersion : (spec && spec.version) || null,
      agentId: step.agentId || TOOL_AGENT[step.tool] || 'muse'
    };
  }

  function resolve(step, ctx) {
    ctx = ctx || {};
    if (!step || typeof step !== 'object') return miss('', 'step 非法');

    if (isSkillStep(step)) {
      if (typeof step.skillId !== 'string' || !step.skillId) return miss('skill', '缺少 skillId');
      var published = syncLookup(step, ctx);
      if (!published) return miss('skill:' + step.skillId, 'Skill 未发布或不存在');
      return buildSkillResult(step, published);
    }

    var toolId = step.tool;
    if (typeof toolId !== 'string' || !toolId) return miss('', '步骤未指定工具或 Skill');
    var spec = ctx.registry && ctx.registry.get ? ctx.registry.get(toolId) : null;
    if (!spec) return miss(toolId, '工具未注册');
    return buildToolResult(step, spec);
  }

  /* 浏览器内 SkillStore 为异步；调用方 await 后再决定是否阻塞执行。 */
  function resolveAsync(step, ctx) {
    ctx = ctx || {};
    var direct = resolve(step, ctx);
    if (direct.ok || !isSkillStep(step)) return Promise.resolve(direct);
    var store = ctx.skillStore || (root.AstroSkillStore);
    if (!store || typeof store.getPublished !== 'function' || !ctx.principal) {
      return Promise.resolve(direct);
    }
    return Promise.resolve(store.getPublished(step.skillId, ctx.principal))
      .then(function (published) {
        if (!published) return miss('skill:' + step.skillId, 'Skill 未发布或不存在');
        return buildSkillResult(step, published);
      })
      .catch(function () { return miss('skill:' + step.skillId, 'Skill 查询失败'); });
  }

  root.AstroCapabilityResolver = {
    resolve: resolve,
    resolveAsync: resolveAsync,
    isSkillStep: isSkillStep,
    TOOL_AGENT: TOOL_AGENT,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
