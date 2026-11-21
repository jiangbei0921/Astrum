/* ASTRUM · P2 科研技能面板
 *
 * 只做展示与触发：所有读写都走 AstroSkillStore，不直接改数据。
 * 不宣称沙箱：验证是「隔离命名空间 + 工具白名单 + 无动态代码」的应用层隔离。
 */
(function (root) {
  'use strict';

  var mounted = false;
  var refs = {};
  var store = null;

  function hasDom() {
    return typeof root.document !== 'undefined' && root.document && root.document.createElement;
  }

  function el(tag, cls, text) {
    var node = root.document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function principal() {
    if (!root.Security || !root.Security.makePrincipal) return null;
    var projectId = root.AstroProjectUI && root.AstroProjectUI.current
      ? root.AstroProjectUI.current() : null;
    return root.Security.makePrincipal({ principalType: 'user', projectId: projectId });
  }

  function ensureStore() {
    if (store) return store;
    if (!root.AstroSkillStore) return null;
    store = root.AstroSkillStore.create({});
    return store;
  }

  function setStatus(text) {
    if (refs.note) refs.note.textContent = text || '';
  }

  function guard(fn) {
    return function () {
      var p = principal();
      var s = ensureStore();
      if (!p || !s) { setStatus('安全层或存储未就绪'); return; }
      Promise.resolve(fn(s, p)).catch(function (e) {
        setStatus((e && e.code ? e.code + '：' : '') + (e && e.message ? e.message : '操作失败'));
        refresh();
      });
    };
  }

  function renderProposals(proposals) {
    refs.proposals.innerHTML = '';
    if (!proposals.length) {
      refs.proposals.appendChild(el('div', 'side-hint', '暂无技能提议'));
      return;
    }
    proposals.slice(0, 8).forEach(function (p) {
      var row = el('div', 'skill-row');
      var title = el('div', 'skill-title', p.candidateName + ' · ' + p.status);
      row.appendChild(title);
      var meta = el('div', 'side-hint',
        '运行 ' + ((p.occurrence && p.occurrence.runs) || 0) +
        ' 次 · 成功率 ' + Math.round(((p.occurrence && p.occurrence.successRate) || 0) * 100) + '%');
      row.appendChild(meta);
      if (p.status === 'proposed') {
        var btn = el('button', 'btn-ghost', '生成草稿');
        btn.type = 'button';
        btn.addEventListener('click', guard(async function (s, pr) {
          var draft = root.AstroSkillProposal.draftFromProposal(p, [{ steps: [] }], {
            registry: root.AstroRegistry ? root.AstroRegistry.createDefault() : null
          });
          await s.createDraft({
            proposalId: p.proposalId,
            name: draft.name,
            description: draft.description,
            category: draft.category,
            workflow: draft.workflow,
            inputs: draft.inputs,
            outputs: draft.outputs,
            allowedTools: draft.allowedTools,
            source: draft.source
          }, pr);
          setStatus('已生成草稿（待验证）');
          refresh();
        }));
        row.appendChild(btn);
      }
      refs.proposals.appendChild(row);
    });
  }

  function renderSkills(skills) {
    refs.skills.innerHTML = '';
    if (!skills.length) {
      refs.skills.appendChild(el('div', 'side-hint', '暂无科研技能'));
      return;
    }
    skills.slice(0, 10).forEach(function (skill) {
      var row = el('div', 'skill-row');
      row.appendChild(el('div', 'skill-title', skill.name + ' · ' + skill.status));
      row.appendChild(el('div', 'side-hint',
        '使用 ' + ((skill.stats && skill.stats.uses) || 0) +
        ' 次 · 成功率 ' + Math.round(((skill.stats && skill.stats.successRate) || 0) * 100) + '%'));

      if (skill.status === 'pending_approval') {
        var approve = el('button', 'btn-ghost', '审批通过');
        approve.type = 'button';
        approve.addEventListener('click', guard(async function (s, pr) {
          var list = await s.listApprovals(skill.skillId, pr);
          var pending = list.filter(function (a) { return a.decision === 'pending'; })[0];
          if (!pending) throw new Error('没有待审批记录');
          await s.decideApproval(pending.approvalId, 'approved', pr, { reason: 'ui' });
          setStatus('已批准，等待发布');
          refresh();
        }));
        row.appendChild(approve);
        var reject = el('button', 'btn-ghost', '拒绝');
        reject.type = 'button';
        reject.addEventListener('click', guard(async function (s, pr) {
          var list = await s.listApprovals(skill.skillId, pr);
          var pending = list.filter(function (a) { return a.decision === 'pending'; })[0];
          if (!pending) throw new Error('没有待审批记录');
          await s.decideApproval(pending.approvalId, 'rejected', pr, { reason: 'ui' });
          setStatus('已拒绝');
          refresh();
        }));
        row.appendChild(reject);
      }

      if (skill.status === 'approved') {
        var pub = el('button', 'btn-ghost', '发布');
        pub.type = 'button';
        pub.addEventListener('click', guard(async function (s, pr) {
          await s.publish(skill.skillId, skill.latestVersionId, null, pr);
          setStatus('已发布');
          refresh();
        }));
        row.appendChild(pub);
      }

      if (skill.status === 'published') {
        var rb = el('button', 'btn-ghost', '回滚上一版');
        rb.type = 'button';
        rb.addEventListener('click', guard(async function (s, pr) {
          var versions = await s.listVersions(skill.skillId, pr);
          var target = versions.filter(function (v) {
            return v.versionId !== skill.currentVersionId && v.publishedAt;
          })[0];
          if (!target) throw new Error('没有可回滚的历史版本');
          await s.rollback(skill.skillId, target.versionId, pr, 'ui');
          setStatus('已回滚到 ' + target.version);
          refresh();
        }));
        row.appendChild(rb);
      }
      refs.skills.appendChild(row);
    });
  }

  async function refresh() {
    if (!hasDom() || !refs.skills) return;
    var p = principal();
    var s = ensureStore();
    if (!p || !s) { setStatus('安全层或存储未就绪'); return; }
    try {
      var res = await Promise.all([
        s.listProposals(p, { limit: 50 }),
        s.listSkills(p, { limit: 50 })
      ]);
      renderProposals(res[0] || []);
      renderSkills(res[1] || []);
      setStatus('技能 ' + (res[1] || []).length + ' 个 · 提议 ' + (res[0] || []).length + ' 条');
    } catch (e) {
      setStatus(e && e.code ? e.code : '读取失败');
    }
  }

  function mount() {
    if (!hasDom() || mounted) return false;
    var host = root.document.querySelector('.side-scroll');
    if (!host) return false;
    var section = el('section', 'side-block');
    section.id = 'skillBlock';
    var head = el('div', 'side-head');
    var skillTitle = el('h3', '', root.I18N ? root.I18N.t('科研技能') : '科研技能');
    skillTitle.setAttribute('data-i18n', '科研技能');
    head.appendChild(skillTitle);
    head.appendChild(el('span', 'side-hint', '人工审批'));
    section.appendChild(head);

    refs.note = el('div', 'side-hint', '');
    section.appendChild(refs.note);

    var tools = el('div', '');
    tools.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;';
    var scan = el('button', 'btn-ghost', '扫描提议');
    scan.type = 'button';
    scan.addEventListener('click', guard(async function (s, pr) {
      var tasks = [];
      try {
        var pid = root.AstroProjectUI && root.AstroProjectUI.current ? root.AstroProjectUI.current() : null;
        var ts = root.AstroTaskStore && pid ? root.AstroTaskStore.create({ projectId: pid }) : null;
        if (ts && ts.listByProject) {
          var recs = await ts.listByProject(pid, { raw: true, limit: 100 });
          tasks = (recs || []).map(function (r) {
            var state = null;
            try { state = r.state ? root.AstroTask.fromJSON(r.state) : null; } catch (e) { state = null; }
            return { id: r.id, projectId: r.projectId, question: r.question, state: state };
          });
        }
      } catch (e) { tasks = []; }
      var out = await root.AstroSkillProposal.scan(s, null, pr, { tasks: tasks });
      setStatus('新增提议 ' + out.proposals.length + ' 条');
      refresh();
    }));
    var reload = el('button', 'btn-ghost', '刷新');
    reload.type = 'button';
    reload.addEventListener('click', function () { refresh(); });
    tools.appendChild(scan);
    tools.appendChild(reload);
    section.appendChild(tools);

    refs.proposals = el('div', 'skill-list');
    refs.skills = el('div', 'skill-list');
    section.appendChild(el('div', 'side-hint', '待处理提议'));
    section.appendChild(refs.proposals);
    section.appendChild(el('div', 'side-hint', '技能库'));
    section.appendChild(refs.skills);

    host.insertBefore(section, host.firstChild);
    mounted = true;
    refresh();
    return true;
  }

  root.AstroSkillUI = {
    mount: mount,
    refresh: refresh,
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
