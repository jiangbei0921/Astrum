/* ASTRUM · P3 DAG Validator
 *
 * 依据：docs/P3/P3-02-自主科研规划与DAG设计.md §5/§6
 *
 * 纯函数：不读写存储、不调 LLM、不执行工具。
 * 工具/Skill 存在性通过 opts.registry / opts.skillLookup 注入，便于测试。
 */
(function (root) {
  'use strict';

  var MAX_STEPS = 8;
  var SHARED_WRITE_TOOLS = ['evidence.search', 'paper.search'];

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function includes(list, v) { return list.indexOf(v) >= 0; }

  function isCompose(step) {
    return typeof step.tool === 'string' && step.tool.indexOf('compose.') === 0;
  }

  function isSharedWrite(step) {
    return includes(SHARED_WRITE_TOOLS, String(step.tool || ''));
  }

  function isSynthesis(step) {
    return isCompose(step) || step.tool === 'compare.curate';
  }

  /* S0 只读本地 / S1 只读外部 / S2 写共享证据 / S3 输出合成 / S4 外部副作用（当前无） */
  function sideEffectOf(step) {
    if (!step) return 'S0';
    if (step.kind === 'skill') return 'S3';
    if (isSynthesis(step)) return 'S3';
    if (isSharedWrite(step)) return 'S2';
    return 'S1';
  }

  function parallelConflicts(batch, registry) {
    var steps = isArray(batch) ? batch : ((batch && batch.steps) || []);
    var out = [];
    for (var i = 0; i < steps.length; i++) {
      for (var j = i + 1; j < steps.length; j++) {
        var a = steps[i], b = steps[j];
        if (!a || !b) continue;
        if (isSynthesis(a) || isSynthesis(b)) {
          out.push({ a: a.id, b: b.id, reason: '输出合成步骤不得并行' });
          continue;
        }
        var sa = sideEffectOf(a), sb = sideEffectOf(b);
        if (sa === 'S2' && sb === 'S2') {
          out.push({ a: a.id, b: b.id, reason: '两个检索步骤写共享证据' });
          continue;
        }
        var specA = registry && registry.get ? registry.get(a.tool) : null;
        var specB = registry && registry.get ? registry.get(b.tool) : null;
        if ((specA && specA.idempotent === false) || (specB && specB.idempotent === false)) {
          out.push({ a: a.id, b: b.id, reason: '非幂等工具不得并行' });
        }
      }
    }
    return out;
  }

  function topo(plan) {
    var steps = plan.steps || [];
    var indeg = {}, outs = {}, ids = [];
    steps.forEach(function (s) {
      indeg[s.id] = 0;
      outs[s.id] = [];
      ids.push(s.id);
    });
    steps.forEach(function (s) {
      (s.deps || []).forEach(function (d) {
        if (indeg[d] != null) {
          indeg[s.id] += 1;
          outs[d].push(s.id);
        }
      });
    });
    var queue = ids.filter(function (id) { return indeg[id] === 0; });
    var order = [], level = {};
    queue.forEach(function (id) { level[id] = 0; });
    var guard = 0;
    while (queue.length && guard++ < 1000) {
      var id = queue.shift();
      order.push(id);
      outs[id].forEach(function (w) {
        indeg[w] -= 1;
        level[w] = Math.max(level[w] == null ? 0 : level[w], (level[id] || 0) + 1);
        if (indeg[w] === 0) queue.push(w);
      });
    }
    var levels = [];
    order.forEach(function (id) {
      var lv = level[id] || 0;
      while (levels.length <= lv) levels.push([]);
      levels[lv].push(id);
    });
    return { order: order, levels: levels, complete: order.length === ids.length };
  }

  function validate(plan, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    function err(path, code, reason) { errors.push({ path: path, code: code, reason: reason }); }
    function warn(path, code, reason) { warnings.push({ path: path, code: code, reason: reason }); }

    if (!plan || typeof plan !== 'object') {
      return { ok: false, errors: [{ path: '$', code: 'E_PLAN_INVALID', reason: 'Plan 必须是对象' }], warnings: [], order: [], levels: [] };
    }
    var steps = plan.steps;
    if (!isArray(steps) || !steps.length) {
      return { ok: false, errors: [{ path: '$.steps', code: 'E_PLAN_EMPTY', reason: 'steps 必须是非空数组' }], warnings: [], order: [], levels: [] };
    }
    if (steps.length > MAX_STEPS) err('$.steps', 'E_PLAN_TOO_LARGE', '步骤数超过上限 ' + MAX_STEPS);

    var ids = {}, i, j;
    var hasCritical = false;
    for (i = 0; i < steps.length; i++) {
      var s = steps[i] || {};
      var p = '$.steps[' + i + ']';
      if (typeof s.id !== 'string' || !s.id) err(p + '.id', 'E_STEP_ID', 'stepId 必须非空');
      else if (Object.prototype.hasOwnProperty.call(ids, s.id)) err(p + '.id', 'E_STEP_ID_DUP', 'stepId 重复: ' + s.id);
      else ids[s.id] = i;

      if (!isArray(s.deps)) err(p + '.deps', 'E_DEP_SHAPE', 'deps 必须是数组');
      else if (s.deps.indexOf(s.id) >= 0) err(p + '.deps', 'E_DEP_SELF', '步骤不得依赖自身');
      if (s.critical === true) hasCritical = true;

      var skill = s.kind === 'skill' || (!!s.skillId && !s.tool);
      if (!skill && (typeof s.tool !== 'string' || !s.tool)) {
        err(p + '.tool', 'E_NO_CAPABILITY', '步骤必须指定工具或 Skill');
      }
      if (skill && !s.skillId) err(p + '.skillId', 'E_NO_CAPABILITY', 'Skill 步骤必须指定 skillId');
      if (isCompose(s) && s.parallel === true) {
        err(p + '.parallel', 'E_COMPOSE_PARALLEL', 'compose 步骤不得并行');
      }
    }

    if (!hasCritical) err('$.steps', 'E_NO_CRITICAL', '至少需要一个 critical 步骤');

    for (i = 0; i < steps.length; i++) {
      var st = steps[i] || {};
      var pth = '$.steps[' + i + ']';
      (isArray(st.deps) ? st.deps : []).forEach(function (d, k) {
        if (!Object.prototype.hasOwnProperty.call(ids, d)) {
          err(pth + '.deps[' + k + ']', 'E_DEP_MISSING', '依赖不存在: ' + d);
        }
      });
    }

    var t = topo(plan);
    if (!t.complete) err('$.steps', 'E_DEP_CYCLE', '依赖存在环');

    /* 可达性：所有非汇点必须能到达某个汇点；孤立节点拒绝。 */
    if (t.complete) {
      var successors = {}, preds = {};
      steps.forEach(function (s) { successors[s.id] = []; preds[s.id] = []; });
      steps.forEach(function (s) {
        (s.deps || []).forEach(function (d) {
          if (successors[d]) successors[d].push(s.id);
          if (preds[s.id]) preds[s.id].push(d);
        });
      });
      var sinks = steps.filter(function (s) { return !successors[s.id].length; }).map(function (s) { return s.id; });
      var reach = {};
      var queue = sinks.slice();
      while (queue.length) {
        var id = queue.shift();
        if (reach[id]) continue;
        reach[id] = 1;
        (preds[id] || []).forEach(function (q) { if (!reach[q]) queue.push(q); });
      }
      if (steps.length > 1) {
        steps.forEach(function (s, idx) {
          if (!reach[s.id]) err('$.steps[' + idx + ']', 'E_UNREACHABLE', '节点无法到达任何汇点');
          if (!successors[s.id].length && !preds[s.id].length) {
            err('$.steps[' + idx + ']', 'E_ORPHAN', '孤立节点：既无前驱也无后继');
          }
        });
      }
    }

    /* 能力存在性（注入式，便于测试与浏览器离线）。 */
    for (i = 0; i < steps.length; i++) {
      var step = steps[i] || {};
      var where = '$.steps[' + i + ']';
      var isSkill = step.kind === 'skill' || (!!step.skillId && !step.tool);
      if (isSkill) {
        if (opts.skillLookup) {
          var found = null;
          try { found = opts.skillLookup(step.skillId); } catch (e) { found = null; }
          if (!found) err(where + '.skillId', 'E_CAPABILITY_MISSING', 'Skill 未发布或不存在: ' + step.skillId);
        }
        continue;
      }
      if (opts.registry && opts.registry.get) {
        var spec = opts.registry.get(step.tool);
        if (!spec) {
          err(where + '.tool', 'E_CAPABILITY_MISSING', '工具未注册: ' + step.tool);
          continue;
        }
        if (opts.registry.validateArgs) {
          var vr = opts.registry.validateArgs(step.tool, step.args || {});
          if (!vr.ok) {
            vr.errors.forEach(function (e) {
              err(where + '.args' + (e.path === '$' ? '' : e.path.slice(1)), 'E_ARGS_INVALID', e.reason);
            });
          }
        }
      }
    }

    /* 计划成本 vs 预算（未传预算时跳过）。 */
    if (opts.budget && opts.budget.limit) {
      var est = plan.estimate || {};
      ['ms', 'searches', 'parallel'].forEach(function (f) {
        var lim = opts.budget.limit[f];
        if (typeof lim === 'number' && typeof est[f] === 'number' && est[f] > lim) {
          err('$.budget', 'E_BUDGET_PLAN', f + ' 估算 ' + est[f] + ' 超出 limit ' + lim);
        }
      });
    }

    /* 并行副作用：默认降级为警告（保持现有模板兼容），严格模式升级为错误。 */
    var parallel = steps.filter(function (s) { return s && s.parallel === true; });
    var conflicts = [];
    for (i = 0; i < parallel.length; i++) {
      for (j = i + 1; j < parallel.length; j++) {
        var c = parallelConflicts([parallel[i], parallel[j]], opts.registry);
        conflicts = conflicts.concat(c);
      }
    }
    conflicts.forEach(function (cf) {
      var path = '$.steps';
      if (opts.strictParallel) err(path, 'E_PARALLEL_CONFLICT', cf.a + ' 与 ' + cf.b + '：' + cf.reason);
      else warn(path, 'W_PARALLEL_CONFLICT', cf.a + ' 与 ' + cf.b + '：' + cf.reason);
    });

    return {
      ok: errors.length === 0,
      errors: errors,
      warnings: warnings,
      order: t.order,
      levels: t.levels
    };
  }

  root.AstroDagValidator = {
    validate: validate,
    parallelConflicts: parallelConflicts,
    sideEffectOf: sideEffectOf,
    topo: topo,
    MAX_STEPS: MAX_STEPS,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
