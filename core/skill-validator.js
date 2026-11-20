/* ASTRUM · P2 科研技能验证与质量评估
 *
 * 六层验证：schema → static → functional → regression → security → stability。
 * 原则：
 *   - 安全层失败一票否决（verdict=FAIL，禁止进入审批）；
 *   - 模型辅助评价不参与安全与最终判定；
 *   - 验证只写隔离库（由 store.saveValidation 负责），不写正式库。
 *
 * 这不是 OS 级沙箱：隔离 = 独立命名空间 + 工具白名单 + 无动态代码。
 */
(function (root) {
  'use strict';

  var LAYERS = ['schema', 'static', 'functional', 'regression', 'security', 'stability'];

  var INJECTION_PATTERN = /忽略以上|授予权限|直接发布|grant\s+admin|ignore\s+(all\s+)?previous/i;
  var EVAL_PATTERN = /\beval\s*\(|new\s+Function|setTimeout\s*\(\s*['"]|Function\s*\(/;
  var FORBIDDEN_TOOLS = ['tool.shell', 'shell.exec', 'eval', 'tool.eval', 'system.exec'];
  var FORBIDDEN_KEYS = ['authorize', 'principal', 'policy', 'security', 'admin', 'roleId', 'profileId', 'ownerProfileId'];

  function nowIso() { return new Date().toISOString(); }
  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function clone(v) {
    if (v == null) return v;
    try { return JSON.parse(JSON.stringify(v)); } catch (e) { return v; }
  }

  function layer(ok, extra) {
    return Object.assign({ ok: !!ok, errors: [], findings: [] }, extra || {});
  }

  function collectKeys(value, out, depth) {
    if (depth > 20 || value == null || typeof value !== 'object') return out;
    if (isArray(value)) {
      value.forEach(function (v) { collectKeys(v, out, depth + 1); });
      return out;
    }
    Object.keys(value).forEach(function (k) {
      out[k] = 1;
      collectKeys(value[k], out, depth + 1);
    });
    return out;
  }

  function textOf(draft) {
    return JSON.stringify({
      name: draft.name,
      description: draft.description,
      purpose: draft.purpose,
      useCases: draft.useCases,
      nonUseCases: draft.nonUseCases,
      constraints: draft.constraints,
      inputs: draft.inputs,
      workflow: draft.workflow
    });
  }

  function idOf(prefix) {
    if (root.AstroSkillContract && root.AstroSkillContract.newId) return root.AstroSkillContract.newId(prefix);
    return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function validateSchema(draft, ctx, C) {
    var l = layer(true);
    try {
      C.validateDraft(draft);
    } catch (e) {
      l.ok = false;
      l.errors.push({ code: e.code || 'E_DRAFT', message: e.message });
      return l;
    }
    var registry = ctx.registry;
    if (registry) {
      draft.workflow.forEach(function (step) {
        if (!registry.has(step.tool)) {
          l.ok = false;
          l.errors.push({ code: 'UNKNOWN_TOOL', message: '工具未注册：' + step.tool });
        }
      });
      (draft.allowedTools || []).forEach(function (t) {
        if (!registry.has(t)) {
          l.ok = false;
          l.errors.push({ code: 'UNKNOWN_TOOL', message: '白名单工具未注册：' + t });
        }
      });
    }
    if (!isArray(draft.inputs) || !draft.inputs.length) {
      l.ok = false;
      l.errors.push({ code: 'INPUT_CONTRACT_MISSING', message: '缺少输入契约' });
    }
    if (!isArray(draft.outputs) || !draft.outputs.length) {
      l.ok = false;
      l.errors.push({ code: 'OUTPUT_CONTRACT_MISSING', message: '缺少输出契约' });
    }
    return l;
  }

  function validateStatic(draft, ctx, C) {
    var l = layer(true);
    var text = textOf(draft);
    if (EVAL_PATTERN.test(text)) {
      l.ok = false;
      l.findings.push({ code: 'EXECUTABLE_TEXT', severity: 'fail', message: '包含动态代码模式' });
    }
    var keys = collectKeys(draft, {}, 0);
    FORBIDDEN_KEYS.forEach(function (k) {
      if (keys[k] && k !== 'profileId') {
        l.ok = false;
        l.findings.push({ code: 'PRIVILEGE_FIELD', severity: 'fail', message: '声明了越权字段：' + k });
      }
    });
    (draft.allowedTools || []).forEach(function (t) {
      if (FORBIDDEN_TOOLS.indexOf(t) >= 0) {
        l.ok = false;
        l.findings.push({ code: 'FORBIDDEN_TOOL', severity: 'fail', message: '禁止工具：' + t });
      }
    });
    draft.workflow.forEach(function (s) {
      if (FORBIDDEN_TOOLS.indexOf(s.tool) >= 0) {
        l.ok = false;
        l.findings.push({ code: 'FORBIDDEN_TOOL', severity: 'fail', message: '步骤包含禁止工具：' + s.tool });
      }
    });
    if (draft.retryPolicy && draft.retryPolicy.max > 2) {
      l.ok = false;
      l.findings.push({ code: 'UNBOUNDED_RETRY', severity: 'fail', message: '重试次数超过 2' });
    }
    if (draft.timeoutMs > 120000) {
      l.ok = false;
      l.findings.push({ code: 'UNBOUNDED_TIMEOUT', severity: 'fail', message: '超时超过 120s' });
    }
    if (ctx.principal && root.Security && C) {
      (draft.requiredCapabilities || []).forEach(function (cap) {
        if (!root.Security.can(ctx.principal, cap)) {
          l.ok = false;
          l.findings.push({ code: 'CAPABILITY_NOT_GRANTED', severity: 'fail', message: '能力超出执行者：' + cap });
        }
      });
    }
    if (INJECTION_PATTERN.test(text)) {
      l.findings.push({ code: 'INJECTION_SUSPECTED', severity: 'warn', message: '检测到疑似提示注入文本' });
    }
    if (/https?:\/\//.test(text)) {
      l.findings.push({ code: 'EXTERNAL_URL', severity: 'warn', message: '内容包含外部 URL，仅作为数据参数' });
    }
    var leak = (draft.outputs || []).some(function (o) {
      var s = JSON.stringify(o.schema || {});
      return /profileId|ownerProfileId|\\\\|[A-Za-z]:\\\\/.test(s);
    });
    if (leak) l.findings.push({ code: 'OUTPUT_LEAK_RISK', severity: 'warn', message: '输出契约可能泄露档案字段' });
    return l;
  }

  function fixtureFor(fixtures, tool) {
    if (!fixtures) return null;
    if (isPlainObject(fixtures[tool])) return fixtures[tool];
    if (isPlainObject(fixtures.steps) && isPlainObject(fixtures.steps[tool])) return fixtures.steps[tool];
    return null;
  }

  function finalPayload(value) {
    if (value && typeof value === 'object' && value.result && typeof value.result === 'object') return value.result;
    return value;
  }

  function checkOutputs(outputs, value) {
    var missing = [];
    var payload = finalPayload(value);
    (outputs || []).forEach(function (o) {
      if (!o || !o.name) return;
      if (payload == null || typeof payload !== 'object' || !(o.name in payload)) {
        missing.push(o.name);
      }
    });
    return missing;
  }

  function validateFunctional(draft, ctx) {
    var cases = [];
    var fixtureCases = ctx.fixtures && isArray(ctx.fixtures.cases) ? ctx.fixtures.cases : null;
    var list = fixtureCases || draft.testCases || [];
    if (!list.length) {
      return layer(false, { cases: [], errors: [{ code: 'NO_TEST_CASES', message: '没有可执行测试用例' }] });
    }
    var ok = true;
    list.forEach(function (tc) {
      var caseId = (tc && tc.caseId) || ('case-' + (cases.length + 1));
      var record = { caseId: caseId, ok: true, steps: [], errors: [] };
      var last = null;
      draft.workflow.forEach(function (step) {
        var fx = fixtureFor(ctx.fixtures, step.tool);
        if (fx == null) {
          record.ok = false;
          record.errors.push({ code: 'FIXTURE_MISSING', tool: step.tool });
          return;
        }
        record.steps.push({ stepId: step.stepId, tool: step.tool, status: 'ok' });
        last = fx;
      });
      if (record.ok) {
        var missing = checkOutputs(draft.outputs, last);
        if (missing.length) {
          record.ok = false;
          record.errors.push({ code: 'OUTPUT_CONTRACT_MISMATCH', missing: missing });
        }
      }
      if (!record.ok) ok = false;
      cases.push(record);
    });
    return layer(ok, { cases: cases, errors: ok ? [] : [{ code: 'FUNCTIONAL_FAILED', message: '功能验证未通过' }] });
  }

  function validateRegression(draft, ctx) {
    var list = isArray(ctx.regressionCases) ? ctx.regressionCases : [];
    if (!list.length) {
      return layer(true, { cases: [], na: true, findings: [{ code: 'NOT_APPLICABLE', severity: 'warn', message: '缺少历史回归案例，整体最高 CONDITIONAL_PASS' }] });
    }
    var ok = true;
    var cases = list.map(function (c) {
      var r = { caseId: c && c.caseId || '', ok: !(c && c.ok === false) };
      if (!r.ok) ok = false;
      return r;
    });
    return layer(ok, { cases: cases, na: false });
  }

  function validateSecurity(draft, ctx, C) {
    var l = layer(true);
    if (ctx.securityCases) {
      (isArray(ctx.securityCases) ? ctx.securityCases : []).forEach(function (c) {
        var f = { id: (c && c.id) || '', ok: !(c && c.ok === false), message: (c && c.message) || '' };
        l.findings.push(f);
        if (!f.ok) l.ok = false;
      });
    }
    if (ctx.writeTarget && ctx.writeTarget !== 'validation') {
      l.ok = false;
      l.findings.push({ id: 'SEC-WRITE', ok: false, message: '验证环境不得写正式库' });
    }
    (draft.allowedTools || []).forEach(function (t) {
      if (FORBIDDEN_TOOLS.indexOf(t) >= 0) {
        l.ok = false;
        l.findings.push({ id: 'SEC-TOOL', ok: false, message: '禁止工具：' + t });
      }
    });
    draft.workflow.forEach(function (s) {
      if (s.argsTemplate && typeof s.argsTemplate === 'object' &&
        ('profileId' in s.argsTemplate || 'projectId' in s.argsTemplate || 'principal' in s.argsTemplate)) {
        l.ok = false;
        l.findings.push({ id: 'SEC-SCOPE', ok: false, message: '步骤参数不得携带身份字段' });
      }
    });
    if (ctx.principal && root.Security && C) {
      (draft.requiredCapabilities || []).forEach(function (cap) {
        if (!root.Security.can(ctx.principal, cap)) {
          l.ok = false;
          l.findings.push({ id: 'SEC-CAP', ok: false, message: '能力越界：' + cap });
        }
      });
    }
    if (INJECTION_PATTERN.test(textOf(draft))) {
      l.findings.push({ id: 'SEC-INJECTION', ok: true, message: '检测到注入文本，权限与状态保持不变' });
    }
    if (!l.findings.length) l.findings.push({ id: 'SEC-BASE', ok: true, message: '基础安全检查通过' });
    return l;
  }

  function validateStability(draft, ctx) {
    var l = layer(true);
    var st = ctx.stability || {};
    if (st.timeout) {
      l.ok = false;
      l.findings.push({ code: 'TIMEOUT', message: '执行超时' });
    }
    if (st.crashes) {
      l.ok = false;
      l.findings.push({ code: 'CRASH', message: '执行崩溃 ' + st.crashes + ' 次' });
    }
    if (draft.retryPolicy && draft.retryPolicy.max > 2) {
      l.ok = false;
      l.findings.push({ code: 'RETRY_LIMIT', message: '重试次数超限' });
    }
    draft.workflow.forEach(function (s) {
      if (!(s.timeoutMs > 0) || s.timeoutMs > 120000) {
        l.ok = false;
        l.findings.push({ code: 'STEP_TIMEOUT', message: '步骤超时非法：' + s.stepId });
      }
    });
    return l;
  }

  function validate(draft, ctx) {
    ctx = ctx || {};
    var C = root.AstroSkillContract;
    var startedAt = nowIso();
    if (!C) throw new Error('AstroSkillContract 未加载');
    if (!draft) throw new Error('缺少草稿');

    var layers = {};
    layers.schema = validateSchema(draft, ctx, C);
    layers.static = validateStatic(draft, ctx, C);
    layers.functional = validateFunctional(draft, ctx);
    layers.regression = validateRegression(draft, ctx);
    layers.security = validateSecurity(draft, ctx, C);
    layers.stability = validateStability(draft, ctx);

    var failureReasons = [];
    LAYERS.forEach(function (name) {
      var l = layers[name];
      if (!l.ok) failureReasons.push(name.toUpperCase() + '_FAILED');
    });

    var verdict = 'PASS';
    if (!layers.schema.ok || !layers.static.ok || !layers.functional.ok ||
      !layers.security.ok || !layers.stability.ok || !layers.regression.ok) {
      verdict = 'FAIL';
    } else if (layers.regression.na) {
      verdict = 'CONDITIONAL_PASS';
      failureReasons.push('REGRESSION_NOT_APPLICABLE');
    }

    var completedAt = nowIso();
    var validation = {
      validationId: idOf('skval_'),
      skillId: draft.skillId,
      versionId: draft.versionId || null,
      draftId: draft.draftId,
      testSuiteVersion: ctx.suiteVersion || 'p2-1',
      environment: 'isolated',
      layers: layers,
      verdict: verdict,
      failureReasons: failureReasons,
      startedAt: startedAt,
      completedAt: completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
      artifacts: {
        logsHash: C.contentHash({ layers: layers, verdict: verdict }),
        fixturesHash: C.contentHash(ctx.fixtures || {})
      },
      schemaVersion: 1
    };
    return validation;
  }

  function ratio(list, fn) {
    if (!isArray(list) || !list.length) return null;
    var hit = list.filter(fn).length;
    return Math.round((hit / list.length) * 1000) / 1000;
  }

  function evaluate(validation, ctx) {
    ctx = ctx || {};
    var C = root.AstroSkillContract;
    var draft = ctx.draft || {};
    var layers = validation.layers || {};
    var functional = layers.functional || { cases: [] };
    var correctness = ratio(functional.cases, function (c) { return c.ok; });
    var securityOk = !!(layers.security && layers.security.ok);
    var refs = 0;
    if (draft.source) {
      refs = (draft.source.taskIds || []).length + (draft.source.memoryIds || []).length +
        (draft.source.evidenceIds || []).length;
    }
    var steps = isArray(draft.workflow) ? draft.workflow.length : 0;
    var inputs = isArray(draft.inputs) ? draft.inputs.length : 0;
    var traceability = refs > 0 ? Math.min(1, Math.round((0.5 + 0.1 * refs) * 100) / 100) : 0;
    var dimensions = {
      correctness: correctness,
      reliability: layers.stability && layers.stability.ok ? 0.9 : 0,
      security: securityOk ? 1 : 0,
      reusability: inputs ? Math.min(1, Math.round((0.5 + 0.1 * inputs) * 100) / 100) : 0.3,
      scope: isArray(draft.nonUseCases) && draft.nonUseCases.length ? 0.9 : 0.5,
      maintainability: steps && steps <= 15 ? 0.8 : 0.5,
      efficiency: draft.timeoutMs && draft.timeoutMs <= 30000 ? 0.8 : 0.6,
      traceability: traceability
    };
    var notes = [];
    if (!securityOk) notes.push('安全层失败：一票否决');
    if (!refs) notes.push('缺少 Task/Memory/Evidence 来源');
    return {
      evaluationId: idOf('skev_'),
      validationId: validation.validationId,
      skillId: validation.skillId,
      versionId: validation.versionId,
      dimensions: dimensions,
      sources: { rules: true, automatedTests: true, runtime: false, modelAssist: false, human: false },
      blocking: {
        security: !securityOk,
        missingEvidence: traceability === 0,
        contractIncomplete: !(layers.schema && layers.schema.ok)
      },
      notes: notes,
      schemaVersion: 1
    };
  }

  function blockingRules(validation) {
    var reasons = [];
    var layers = (validation && validation.layers) || {};
    if (!layers.schema || !layers.static || !layers.security) reasons.push('MISSING_REQUIRED_LAYER');
    if (layers.schema && !layers.schema.ok) reasons.push('SCHEMA_FAILED');
    if (layers.static && !layers.static.ok) reasons.push('STATIC_FAILED');
    if (layers.security && !layers.security.ok) reasons.push('SECURITY_FAILED');
    if (layers.functional && !layers.functional.ok) reasons.push('FUNCTIONAL_FAILED');
    if (layers.stability && !layers.stability.ok) reasons.push('STABILITY_FAILED');
    if (validation && validation.verdict === 'FAIL') reasons.push('VERDICT_FAIL');
    return { blocked: reasons.length > 0, reasons: reasons };
  }

  function verdictOf(validation, evaluation) {
    if (evaluation && evaluation.blocking && evaluation.blocking.security) return 'FAIL';
    if (!validation) return 'FAIL';
    if (validation.verdict === 'FAIL') return 'FAIL';
    if (evaluation && evaluation.blocking && evaluation.blocking.missingEvidence) return 'FAIL';
    if (evaluation && evaluation.blocking && evaluation.blocking.contractIncomplete) return 'FAIL';
    return validation.verdict;
  }

  root.AstroSkillValidator = {
    layers: LAYERS,
    validate: validate,
    evaluate: evaluate,
    blockingRules: blockingRules,
    verdictOf: verdictOf,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
