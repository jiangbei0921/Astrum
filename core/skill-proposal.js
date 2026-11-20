/* ASTRUM · P2 科研技能提议与草稿生成
 *
 * 输入是结构化 Task 记录（工具序列 + 成功/失败），不是自然语言。
 * 输出只有 Proposal 与 Draft，不生成正式版本、不发布、不改权限。
 *
 * 阈值（P2-04 / P2-03）：
 *   - 同类成功任务 ≥ 3 次
 *   - 成功率 ≥ 0.8
 *   - 相似度 ≥ 0.8 视为同类
 *   - 每 Project 最多 20 条待处理提议
 */
(function (root) {
  'use strict';

  var limits = {
    minRuns: 3,
    minSuccessRate: 0.8,
    similarityThreshold: 0.8,
    maxOpenProposals: 20,
    maxGrowthDepth: 2
  };

  var SUCCESS_STATUS = ['done', 'ok', 'completed', 'success'];

  function isArray(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function isPlainObject(v) { return v !== null && typeof v === 'object' && !isArray(v); }
  function trim(v) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim(); }

  function stepTool(step) {
    if (!step || typeof step !== 'object') return '';
    if (step.kind === 'skill') return step.skillId ? ('skill:' + step.skillId) : '';
    return trim(step.toolId || step.tool || '');
  }

  function stepsOf(task) {
    if (!task || typeof task !== 'object') return [];
    if (isArray(task.steps)) return task.steps;
    if (task.state && isArray(task.state.steps)) return task.state.steps;
    if (task.plan && isArray(task.plan.steps)) return task.plan.steps;
    return [];
  }

  function signatureOfSteps(steps) {
    var tools = (isArray(steps) ? steps : []).map(stepTool).filter(function (t) { return !!t; });
    return tools.join('|>');
  }

  function taskSucceeded(task) {
    if (!task || typeof task !== 'object') return false;
    if (typeof task.success === 'boolean') return task.success;
    var status = trim(task.status || task.phase || (task.state && (task.state.status || task.state.phase)) || '');
    if (status) return SUCCESS_STATUS.indexOf(status) >= 0;
    var steps = stepsOf(task);
    if (!steps.length) return false;
    return steps.every(function (s) { return s && s.status === 'ok'; });
  }

  function parseSignature(sig) {
    return String(sig || '').split('|>').filter(Boolean);
  }

  function similarity(a, b) {
    var x = parseSignature(a);
    var y = parseSignature(b);
    if (!x.length || !y.length) return x.length === y.length ? 1 : 0;
    if (x.join('|>') === y.join('|>')) return 1;
    var setX = {}, setY = {}, union = 0, inter = 0;
    x.forEach(function (t) { if (!setX[t]) { setX[t] = 1; union += 1; } });
    y.forEach(function (t) {
      if (!setY[t]) { setY[t] = 1; if (setX[t]) inter += 1; else union += 1; }
    });
    return union ? Math.round((inter / union) * 1000) / 1000 : 0;
  }

  function skillSignature(skill) {
    if (!skill) return '';
    if (skill.signature) return skill.signature;
    if (skill.content && isArray(skill.content.workflow)) return signatureOfSteps(skill.content.workflow);
    if (skill.workflow) return signatureOfSteps(skill.workflow);
    return '';
  }

  function dedupe(candidates, existingSkills, existingProposals) {
    var kept = [], dropped = [];
    var known = [];
    (isArray(existingSkills) ? existingSkills : []).forEach(function (s) {
      var sig = skillSignature(s);
      if (sig) known.push(sig);
    });
    (isArray(existingProposals) ? existingProposals : []).forEach(function (p) {
      if (!p || p.status === 'rejected') return;
      if (p.signature) known.push(p.signature);
    });

    (isArray(candidates) ? candidates : []).forEach(function (c) {
      var sig = c && c.signature ? c.signature : '';
      var hit = known.some(function (k) { return similarity(k, sig) >= limits.similarityThreshold; });
      if (hit) {
        dropped.push({ candidate: c, reason: 'DUPLICATE' });
      } else {
        kept.push(c);
        if (sig) known.push(sig);
      }
    });
    return { kept: kept, dropped: dropped };
  }

  function collectIds(tasks) {
    var taskIds = [], memoryIds = [], evidenceIds = [];
    (tasks || []).forEach(function (t) {
      if (t && t.id) taskIds.push(t.id);
      else if (t && t.taskId) taskIds.push(t.taskId);
      var mem = isArray(t && t.memoryIds) ? t.memoryIds
        : (t && t.state && isArray(t.state.memoryIds) ? t.state.memoryIds : []);
      mem.forEach(function (id) { if (id && memoryIds.indexOf(id) < 0) memoryIds.push(id); });
      stepsOf(t).forEach(function (s) {
        (isArray(s && s.evidenceRefs) ? s.evidenceRefs : []).forEach(function (id) {
          if (id && evidenceIds.indexOf(id) < 0) evidenceIds.push(id);
        });
      });
    });
    return { taskIds: taskIds, memoryIds: memoryIds, evidenceIds: evidenceIds };
  }

  function defaultName(group) {
    var quiz = trim(group.tasks[0] && (group.tasks[0].question || group.tasks[0].title) || '');
    if (quiz) return quiz.slice(0, 60);
    var tools = parseSignature(group.signature);
    return ('工作流：' + tools.slice(0, 3).join(' → ')).slice(0, 60);
  }

  function scan(store, researchStore, principal, opts) {
    opts = opts || {};
    var minRuns = typeof opts.minRuns === 'number' ? opts.minRuns : limits.minRuns;
    var minRate = typeof opts.minSuccessRate === 'number' ? opts.minSuccessRate : limits.minSuccessRate;
    var maxOpen = typeof opts.maxOpenProposals === 'number' ? opts.maxOpenProposals : limits.maxOpenProposals;

    function run(tasks, existingSkills, existingProposals) {
      var groups = {};
      var order = [];
      (isArray(tasks) ? tasks : []).forEach(function (t) {
        var sig = signatureOfSteps(stepsOf(t));
        if (!sig) return;
        var projectId = (t && (t.projectId || (t.state && t.state.projectId))) || null;
        var key = String(projectId || 'profile') + '::' + sig;
        if (!groups[key]) {
          groups[key] = { key: key, projectId: projectId, signature: sig, tasks: [] };
          order.push(key);
        }
        groups[key].tasks.push(t);
      });

      var proposals = [], skipped = [], reasons = {};
      function skip(sig, reason) {
        skipped.push({ signature: sig, reason: reason });
        reasons[reason] = (reasons[reason] || 0) + 1;
      }

      var chain = Promise.resolve();
      order.forEach(function (key) {
        chain = chain.then(function () {
          var group = groups[key];
          var success = group.tasks.filter(taskSucceeded).length;
          var runs = group.tasks.length;
          var rate = runs ? success / runs : 0;
          if (runs < minRuns) { skip(group.signature, 'INSUFFICIENT_RUNS'); return null; }
          if (success < 1) { skip(group.signature, 'NO_SUCCESS'); return null; }
          if (rate < minRate) { skip(group.signature, 'LOW_SUCCESS_RATE'); return null; }

          var existing = (existingSkills || []).filter(function (s) {
            if (!s) return false;
            if (group.projectId && s.projectId && s.projectId !== group.projectId) return false;
            return similarity(skillSignature(s), group.signature) >= limits.similarityThreshold;
          });
          if (existing.length) { skip(group.signature, 'DUPLICATE_SKILL'); return null; }

          var proposalsMatch = (existingProposals || []).filter(function (p) {
            if (!p || p.status === 'rejected') return false;
            if (String(p.projectId || '') !== String(group.projectId || '')) return false;
            return similarity(p.signature, group.signature) >= limits.similarityThreshold;
          });
          if (proposalsMatch.length) { skip(group.signature, 'DUPLICATE_PROPOSAL'); return null; }

          var open = (existingProposals || []).filter(function (p) {
            return p && p.status === 'proposed' && String(p.projectId || '') === String(group.projectId || '');
          });
          if (open.length >= maxOpen) { skip(group.signature, 'PROPOSAL_LIMIT'); return null; }

          var ids = collectIds(group.tasks);
          var input = {
            profileId: principal.profileId,
            projectId: group.projectId,
            candidateName: defaultName(group),
            description: '由 ' + runs + ' 次同类任务归纳的可复用工作流',
            motivation: '最近 ' + runs + ' 次执行中成功 ' + success + ' 次，成功率 ' +
              Math.round(rate * 100) + '%',
            workflowSummary: parseSignature(group.signature).join(' → '),
            signature: group.signature,
            supportingTaskIds: ids.taskIds,
            supportingMemoryIds: ids.memoryIds,
            evidenceIds: ids.evidenceIds,
            similarity: 1,
            confidence: rate >= 0.95 ? 'high' : (rate >= 0.85 ? 'medium' : 'low'),
            occurrence: { runs: runs, success: success, failure: runs - success, successRate: rate },
            limits: { iterationDepth: 1 }
          };
          return store.createProposal(input, principal).then(function (p) {
            if (p && p.duplicate) skip(group.signature, 'DUPLICATE_PROPOSAL');
            else proposals.push(p);
          });
        });
      });

      return chain.then(function () {
        return { proposals: proposals, skipped: skipped, reasons: reasons };
      });
    }

    var tasksGiven = isArray(opts.tasks) ? Promise.resolve(opts.tasks) : null;
    var existingSkillsGiven = isArray(opts.existingSkills) ? Promise.resolve(opts.existingSkills) : null;
    var existingProposalsGiven = isArray(opts.existingProposals) ? Promise.resolve(opts.existingProposals) : null;

    var tasksP = tasksGiven || (researchStore && researchStore.listTasks && principal.projectId
      ? researchStore.listTasks(principal.projectId, principal).catch(function () { return []; })
      : Promise.resolve([]));
    var skillsP = existingSkillsGiven || store.listSkills(principal, { limit: 500 });
    var proposalsP = existingProposalsGiven || store.listProposals(principal, { limit: 500 });

    return Promise.all([tasksP, skillsP, proposalsP]).then(function (res) {
      return run(res[0] || [], res[1] || [], res[2] || []);
    });
  }

  function pickCategory(tools) {
    if (!tools.length) return 'workflow';
    if (tools.every(function (t) { return t.indexOf('kepler.') === 0; })) return 'calculation';
    if (tools.some(function (t) { return t.indexOf('evidence.') === 0 || t.indexOf('paper.') === 0; })) return 'evidence';
    if (tools.some(function (t) { return t.indexOf('compose.') === 0; })) return 'report';
    return 'workflow';
  }

  function draftFromProposal(proposal, taskSamples, opts) {
    opts = opts || {};
    var C = root.AstroSkillContract;
    if (!proposal) {
      var e = new Error('缺少提议');
      e.code = 'PROPOSAL_REQUIRED';
      throw e;
    }
    var depth = (proposal.limits && proposal.limits.iterationDepth) || 1;
    if (depth > limits.maxGrowthDepth) {
      var g = new Error('递归成长超出上限');
      g.code = 'GROWTH_LIMIT';
      throw g;
    }

    var samples = isArray(taskSamples) ? taskSamples : [];
    var templateSteps = [];
    var seenTools = [];
    samples.forEach(function (task) {
      stepsOf(task).forEach(function (s) {
        var tool = stepTool(s);
        if (!tool || tool.indexOf('skill:') === 0) return;
        if (seenTools.indexOf(tool) >= 0) return;
        seenTools.push(tool);
        var spec = opts.registry && opts.registry.get ? opts.registry.get(tool) : null;
        templateSteps.push({
          stepId: 's' + (templateSteps.length + 1),
          tool: tool,
          argsTemplate: {},
          purpose: trim(s.purpose || '') || ('执行 ' + tool),
          onError: 'fail',
          timeoutMs: Math.min(120000, Math.max(1000, (spec && spec.timeoutMs) || 30000))
        });
      });
    });

    if (!templateSteps.length && proposal.signature) {
      parseSignature(proposal.signature).forEach(function (tool) {
        if (tool.indexOf('skill:') === 0) return;
        var spec = opts.registry && opts.registry.get ? opts.registry.get(tool) : null;
        templateSteps.push({
          stepId: 's' + (templateSteps.length + 1),
          tool: tool,
          argsTemplate: {},
          purpose: '执行 ' + tool,
          onError: 'fail',
          timeoutMs: Math.min(120000, Math.max(1000, (spec && spec.timeoutMs) || 30000))
        });
      });
    }
    if (!templateSteps.length) {
      var w = new Error('无法从任务样本中提取工具序列');
      w.code = 'NO_WORKFLOW';
      throw w;
    }

    var tools = templateSteps.map(function (s) { return s.tool; });
    var sampleQuestion = trim(samples[0] && (samples[0].question || samples[0].title) || '');
    var draft = C.makeDraft({
      proposalId: proposal.proposalId,
      skillId: proposal.candidateSkillId || opts.skillId || '',
      baseVersionId: opts.baseVersionId || null,
      name: opts.name || proposal.candidateName,
      description: opts.description || proposal.description,
      category: opts.category || pickCategory(tools),
      purpose: proposal.motivation || proposal.description,
      useCases: opts.useCases || [proposal.candidateName],
      nonUseCases: opts.nonUseCases || [],
      prerequisites: opts.prerequisites || [],
      inputs: opts.inputs || [{
        name: 'query',
        type: 'string',
        required: true,
        example: sampleQuestion.slice(0, 120)
      }],
      outputs: opts.outputs || [{ name: 'result', type: 'object', required: true }],
      workflow: templateSteps,
      constraints: opts.constraints || ['仅使用声明工具', '逐步经 ToolGateway 执行'],
      errorHandling: opts.errorHandling || ['失败按 onError 处理，最多重试 2 次'],
      allowedAgents: opts.allowedAgents || [],
      requiredCapabilities: opts.requiredCapabilities || [],
      allowedTools: opts.allowedTools || tools.slice(),
      executionMode: 'declarative',
      timeoutMs: opts.timeoutMs || 60000,
      retryPolicy: opts.retryPolicy || { max: 1, backoffMs: 200 },
      testCases: opts.testCases || [{
        caseId: 'case-1',
        input: { query: sampleQuestion.slice(0, 80) },
        expected: { steps: templateSteps.length }
      }],
      source: {
        proposalId: proposal.proposalId,
        taskIds: (proposal.supportingTaskIds || []).concat(collectIds(samples).taskIds).slice(0, 100),
        memoryIds: (proposal.supportingMemoryIds || []).slice(0, 100),
        evidenceIds: (proposal.evidenceIds || []).slice(0, 100)
      }
    });
    C.validateDraft(draft);
    return draft;
  }

  root.AstroSkillProposal = {
    limits: limits,
    scan: scan,
    signatureOfSteps: signatureOfSteps,
    taskSucceeded: taskSucceeded,
    similarity: similarity,
    dedupe: dedupe,
    draftFromProposal: draftFromProposal,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
