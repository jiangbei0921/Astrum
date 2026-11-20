/* ASTRUM · P1 课题与记忆 UI
 *
 * 只调用 AstroResearchStore / AstroResearchContext，不直接读写 IndexedDB。
 * 无 DOM 环境（Node 测试）下所有方法安全返回。
 */
(function (root) {
  'use strict';

  var LS_KEY = 'astrum.project.current';
  var mounted = false;
  var currentId = null;
  var refs = {};

  function hasDom() { return typeof root.document !== 'undefined' && !!root.document.createElement; }

  function lsKey() {
    return (root.Profile && root.Profile.ns) ? root.Profile.ns(LS_KEY) : LS_KEY;
  }

  function storedId() {
    try { return root.localStorage.getItem(lsKey()) || null; } catch (e) { return null; }
  }

  function persistId(id) {
    try { root.localStorage.setItem(lsKey(), id || ''); } catch (e) { /* ignore */ }
  }

  function store() {
    return root.AstroResearchStore ? root.AstroResearchStore.create({}) : null;
  }

  function userPrincipal(projectId) {
    if (root.Security && root.Security.makePrincipal) {
      var p = root.Security.makePrincipal({ principalType: 'user', projectId: projectId || null });
      if (p) return p;
    }
    /* 无 ProfileContext 时退化为只读上下文；写操作会被 store 拒绝。 */
    if (root.Security && root.Security.forTest) {
      return root.Security.forTest({ principalType: 'user', profileId: 'ui', projectId: projectId || null });
    }
    return null;
  }

  function current() {
    if (!currentId) currentId = storedId();
    return currentId;
  }

  function el(tag, cls, text) {
    var n = root.document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = String(text);
    return n;
  }

  function note(text) {
    if (refs.note) refs.note.textContent = text || '';
  }

  function download(name, text) {
    try {
      var blob = new Blob([text], { type: 'application/json' });
      var a = root.document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      root.document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
    } catch (e) { note('导出失败：' + (e && e.message || e)); }
  }

  async function renderProjects() {
    if (!hasDom() || !refs.list) return;
    var s = store();
    var principal = userPrincipal(null);
    refs.list.textContent = '';
    if (!s || !principal) { refs.list.appendChild(el('div', 'hint', '课题功能不可用')); return; }
    var list = [];
    try { list = await s.listProjects(principal, { includeDeleted: false, limit: 50 }); }
    catch (e) { refs.list.appendChild(el('div', 'hint', '加载失败')); return; }
    if (!list.length) {
      refs.list.appendChild(el('div', 'hint', '还没有研究课题'));
      return;
    }
    list.forEach(function (p) {
      var row = el('div', 'proj-row');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0;';
      var name = el('button', 'btn-ghost', (p.status === 'active' ? '● ' : '○ ') + p.title);
      name.type = 'button';
      name.style.flex = '1';
      name.style.textAlign = 'left';
      name.addEventListener('click', function () {
        currentId = p.projectId;
        persistId(p.projectId);
        if (root.Thread && root.Thread.setProjectId) root.Thread.setProjectId(p.projectId);
        note('当前课题：' + p.title);
        renderAll();
      });
      row.appendChild(name);
      var more = el('button', 'btn-ghost', '⋯');
      more.type = 'button';
      more.addEventListener('click', function () { projectMenu(p); });
      row.appendChild(more);
      refs.list.appendChild(row);
    });
  }

  async function projectMenu(p) {
    var s = store();
    var principal = userPrincipal(p.projectId);
    if (!s || !principal) return;
    var action = root.prompt ? root.prompt('输入操作：pause / resume / archive / restore / delete / rename', '') : '';
    if (!action) return;
    try {
      if (action === 'pause') await s.setProjectStatus(p.projectId, 'paused', principal);
      else if (action === 'resume') await s.setProjectStatus(p.projectId, 'active', principal);
      else if (action === 'archive') await s.setProjectStatus(p.projectId, 'archived', principal);
      else if (action === 'restore') await s.setProjectStatus(p.projectId, 'paused', principal);
      else if (action === 'delete') {
        var title = root.prompt ? root.prompt('输入课题标题以确认软删除', '') : '';
        await s.setProjectStatus(p.projectId, 'deleted', principal, { confirmTitle: title });
        if (currentId === p.projectId) { currentId = null; persistId(''); }
      } else if (action === 'rename') {
        var nt = root.prompt ? root.prompt('新标题', p.title) : null;
        if (nt) await s.updateProject(p.projectId, { title: nt, version: p.version }, principal);
      }
      note('已更新课题');
      renderAll();
    } catch (e) { note('操作失败：' + (e && (e.code || e.message) || e)); }
  }

  async function createProject() {
    var s = store();
    var principal = userPrincipal(null);
    if (!s || !principal) return;
    var title = root.prompt ? root.prompt('课题标题', '') : '';
    if (!title) return;
    try {
      var p = await s.createProject({ title: title }, principal);
      currentId = p.projectId;
      persistId(p.projectId);
      if (root.Thread && root.Thread.setProjectId) root.Thread.setProjectId(p.projectId);
      note('已创建课题：' + p.title);
      renderAll();
    } catch (e) { note('创建失败：' + (e && (e.code || e.message) || e)); }
  }

  async function renderMemories() {
    if (!hasDom() || !refs.mem) return;
    refs.mem.textContent = '';
    var pid = current();
    if (!pid) { refs.mem.appendChild(el('div', 'hint', '先选择一个课题')); return; }
    var s = store();
    var principal = userPrincipal(pid);
    if (!s || !principal) return;
    var list = [];
    try { list = await s.listMemories(pid, principal, { status: ['proposed', 'under_review'], limit: 20 }); }
    catch (e) { refs.mem.appendChild(el('div', 'hint', '加载失败')); return; }
    if (!list.length) { refs.mem.appendChild(el('div', 'hint', '暂无待审核记忆')); return; }
    list.forEach(function (m) {
      var box = el('div', 'mem-row');
      box.style.cssText = 'border-top:1px solid var(--line,#333);padding:6px 0;';
      box.appendChild(el('div', '', '[' + m.type + '] ' + (m.summary || m.content.slice(0, 80))));
      var actions = el('div', '');
      var approve = el('button', 'btn-ghost', '通过');
      approve.type = 'button';
      approve.addEventListener('click', async function () {
        try {
          if (m.status === 'proposed') {
            m = await s.transitionMemory(m.memoryId, 'under_review', principal, { reason: 'ui-submit' });
          }
          await s.transitionMemory(m.memoryId, 'verified', principal, { reason: 'ui-approve' });
          note('已核实');
          renderAll();
        } catch (e) { note('核实失败：' + (e && (e.code || e.message) || e)); }
      });
      var reject = el('button', 'btn-ghost', '拒绝');
      reject.type = 'button';
      reject.addEventListener('click', async function () {
        try {
          await s.transitionMemory(m.memoryId, 'rejected', principal, { reason: 'ui-reject' });
          note('已拒绝');
          renderAll();
        } catch (e) { note('操作失败：' + (e && (e.code || e.message) || e)); }
      });
      actions.appendChild(approve);
      actions.appendChild(reject);
      box.appendChild(actions);
      refs.mem.appendChild(box);
    });
  }

  async function exportCurrent() {
    var pid = current();
    if (!pid) return note('先选择一个课题');
    var s = store();
    var principal = userPrincipal(pid);
    try {
      var bundle = await s.exportProject(pid, principal);
      download('astrum-project-' + pid + '.json', JSON.stringify(bundle, null, 2));
      note('已导出');
    } catch (e) { note('导出失败：' + (e && (e.code || e.message) || e)); }
  }

  function importFile() {
    if (!hasDom()) return;
    var input = root.document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', function () {
      var file = input.files && input.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = async function () {
        var bundle = null;
        try { bundle = JSON.parse(String(reader.result)); }
        catch (e) { note('文件不是合法 JSON'); return; }
        try {
          var s = store();
          var principal = userPrincipal(null);
          var r = await s.importProject(bundle, principal, {});
          currentId = r.projectId;
          persistId(r.projectId);
          if (root.Thread && root.Thread.setProjectId) root.Thread.setProjectId(r.projectId);
          note('导入完成：' + r.counts.memories + ' 条记忆（需重新审核）');
          renderAll();
        } catch (e2) { note('导入失败：' + (e2 && (e2.code || e2.message) || e2)); }
      };
      reader.readAsText(file);
    });
    input.click();
  }

  function renderAll() {
    renderProjects();
    renderMemories();
  }

  function mount() {
    if (!hasDom() || mounted) return false;
    var host = root.document.querySelector('.side-scroll');
    if (!host) return false;
    var section = el('section', 'side-block');
    section.id = 'projectBlock';
    var head = el('div', 'side-head');
    head.appendChild(el('h3', '', '研究课题'));
    var hint = el('span', 'side-hint', '隔离记忆');
    head.appendChild(hint);
    section.appendChild(head);

    refs.note = el('div', 'side-hint', '');
    section.appendChild(refs.note);

    var tools = el('div', '');
    tools.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;padding:4px 0;';
    var add = el('button', 'btn-ghost', '新建');
    add.type = 'button';
    add.addEventListener('click', createProject);
    var ex = el('button', 'btn-ghost', '导出');
    ex.type = 'button';
    ex.addEventListener('click', exportCurrent);
    var im = el('button', 'btn-ghost', '导入');
    im.type = 'button';
    im.addEventListener('click', importFile);
    tools.appendChild(add); tools.appendChild(ex); tools.appendChild(im);
    section.appendChild(tools);

    refs.list = el('div', 'proj-list');
    section.appendChild(refs.list);
    refs.mem = el('div', 'mem-list');
    section.appendChild(refs.mem);

    host.insertBefore(section, host.firstChild);
    mounted = true;
    renderAll();
    return true;
  }

  root.AstroProjectUI = {
    mount: mount,
    refresh: renderAll,
    current: current,
    setCurrent: function (id) {
      currentId = id || null;
      persistId(currentId);
      if (root.Thread && root.Thread.setProjectId) root.Thread.setProjectId(currentId);
      renderAll();
      return currentId;
    },
    version: '1.0.0'
  };
})(typeof window !== 'undefined' ? window : global);
