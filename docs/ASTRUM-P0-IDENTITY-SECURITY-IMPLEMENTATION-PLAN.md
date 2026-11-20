# ASTRUM P0 身份权限体系与 Profile 数据隔离 · 完整实施计划

> 阶段：P0 阶段 A 交付物（**未获批准前不执行**）
> 基线：`main@5c0f9c7`，工作区干净
> 依据：`docs/ASTRUM-P0-CURRENT-ARCHITECTURE-AUDIT.md`（本文所有结论的证据）
> 状态：**已获批准并于 2026-11-20 完成阶段 B 实施**；结果与偏差见 `docs/ASTRUM-P0-IMPLEMENTATION-REPORT.md`。
> 约束：不引入后端、不引入依赖、不改部署方式、不实现 ResearchProject 管理/P1-P4 能力。

---

## 1. 产品目标

P0 只解决一个问题：**任何用户、Agent 或任务，只能访问和操作当前明确授权的资源。**

不在 P0 范围内：长期科研记忆、科研 Skill 成长、自主研究、自我评估、完整课题管理系统、Prompt 重构、UI 重设计。

---

## 2. 当前架构与目标架构差异

| 维度 | 当前（审计结论） | 目标（P0） | 差异性质 |
|---|---|---|---|
| 身份来源 | 无 Principal；Profile 仅是存储前缀 | `ProfileContext` 提供可信 `profileId/sessionId`；运行时组装 `Principal` | 新增 |
| 角色 | `role` 是中文描述 | `roleId` 由 `AgentRegistry` 解析，未知角色拒绝 | 新增映射 |
| 能力 | 工具 `permissions` 仅标记 | `CapabilityRegistry` 显式声明「已实现/仅定义」 | 新增 |
| 授权 | 无 | `authorize(principal, action, resource, context)`，默认拒绝 | 新增 |
| 任务归属 | 无 owner 字段，全局库 | 存储记录带 `ownerProfileId/projectId`，按档案分库 | 改造 |
| 查询 | `getAll()` 全库 | 只查当前档案库 + owner 二次校验 | 改造 |
| 恢复/执行 | 仅凭 ID | 恢复前、每批执行前、保存前三次重校验 | 改造 |
| 工具调用 | `spec.run` 直调 | `ToolGateway.invoke` 统一收口（Registry 路径） | 改造 |
| 审计 | 无 | 本地 `AuditLog` 记录 allow/deny 与任务生命周期 | 新增 |
| 历史任务 | 归属不明 | 隔离区 `pending_migration`，不默认归属 | 新增 |

---

## 3. 目标权限模型

### 3.1 权限链路

```
ProfileContext（可信 profileId + sessionId）
  → Principal（principalType, profileId, agentId, roleId, projectId, taskId, sessionId）
    → Action（read/create/update/delete/execute/resume/…）
      → Resource（task/project/evidence/claim/memory/tool，含 ownerProfileId/projectId）
        → Decision（allowed / reason / policyVersion）
```

### 3.2 Principal 契约

```js
// 由运行时构造，禁止业务调用方整体传入
{
  principalType: 'user' | 'agent' | 'system',
  profileId: 'default' | 'p...',   // 仅 ProfileContext 可写
  agentId: 'muse' | 'scholar' | ... | '', // 仅 AgentRuntime 可写
  roleId: 'muse' | 'scholar' | ... | 'custom:<id>' | '',
  projectId: null | 'prj_...',     // 仅从任务记录/项目记录读取
  taskId: null | 'tsk_...',        // 仅从当前任务读取
  sessionId: 's...'                // ProfileContext.capture() 生成，页面级
}
```

**可信规则**：
- `profileId` 只能来自 `ProfileContext.current()`（内部调用 `Profile.currentId()`）。
- `agentId/roleId` 只能来自 `AgentRegistry.resolve(agentId)`；Agent 的自然语言输出不参与。
- `projectId/taskId` 只能来自已通过 owner 校验的资源记录，不能来自工具参数。
- 任何 `args.profileId` / `args.projectId` / `body.principal` 一律忽略并记录审计拒绝。

### 3.3 Action 枚举

`read, create, propose, update, approve, delete, execute, pause, resume, cancel, publish, rollback, tool.call`

P0 实现：`read, create, update, delete, execute, pause, resume, cancel, tool.call`
P0 仅定义（调用返回 `CAPABILITY_NOT_IMPLEMENTED`）：`propose, approve, publish, rollback`

### 3.4 资源描述符

```js
{
  resourceType: 'task' | 'project' | 'evidence' | 'claim' | 'memory' | 'tool',
  resourceId: string,
  ownerProfileId: string,
  projectId: string | null,
  taskId: string | null
}
```

### 3.5 决策输出

```js
{ allowed: boolean, reason: string, policyVersion: '1' }
```

错误码（统一，前端与测试共用）：

| 错误码 | 含义 |
|---|---|
| `PROFILE_MISMATCH` | 资源 owner 与当前 profile 不一致 |
| `PROJECT_MISMATCH` | 资源 project 与 principal.projectId 不一致 |
| `AGENT_NOT_REGISTERED` | agentId 不在注册表 |
| `ROLE_NOT_ALLOWED` | roleId 未知或无该动作策略 |
| `CAPABILITY_NOT_GRANTED` | 角色策略未授予该能力 |
| `CAPABILITY_NOT_IMPLEMENTED` | 能力仅定义未实现 |
| `RESOURCE_NOT_FOUND` | 资源不存在或不属于当前档案（对外统一为不存在，避免枚举） |
| `INVALID_CONTEXT` | 缺少 profileId/sessionId |
| `SESSION_CHANGED` | 页面会话已变化（异步任务场景） |
| `POLICY_DENIED` | 其余拒绝 |

---

## 4. 目标模块设计

### 4.1 新增模块（4 个文件，避免过度拆分）

| 模块 | 文件 | 职责 | 依赖 |
|---|---|---|---|
| ProfileContext | `core/profile-context.js` | 可信 profile/session 快照；只读冻结 | `profile.js` |
| Security | `core/security.js` | Principal 工厂、CapabilityRegistry、RolePolicy、`authorize()`、`delegate()` | `profile-context.js`、`agents.js`（只读注册表） |
| AuditLog | `core/audit-log.js` | 本地权限决策与任务生命周期日志 | `profile.js` |
| ToolGateway | `core/tool-gateway.js` | 工具调用的唯一授权+执行入口 | `security.js`、`audit-log.js`、`registry.js` |

> 不新建 `CapabilityRegistry.js` / `AuthorizationService.js` / `PolicyEvaluator.js` 三个独立文件：它们职责高度耦合且代码量小，拆成三个文件会增加循环依赖与加载顺序负担。**职责仍完整存在，只是合并在 `security.js` 内**，并在文件头注释中标注三段边界。

### 4.2 扩展现有模块

| 模块 | 扩展内容 |
|---|---|
| `core/task-store.js` | 命名空间、`ownerProfileId/projectId`、owner 二次校验、`getRecord()`、隔离区 API |
| `core/control.js` | `prepare/run/resume` 注入 principal；加载/恢复/保存前重校验 |
| `core/control-bridge.js` | 构造 principal 并透传；不再允许调用方覆盖 |
| `core/orchestrator.js` | `executeOne` 改走 `ToolGateway`；每批执行前 `ensureSession` |
| `core/agents.js` | 自定义 Agent 保留 id 校验；`resolveRole(agentId)` 只读导出 |
| `core/app.js` | 恢复入口使用当前档案 store；启动时触发一次迁移扫描 |
| `core/research.js` | `run()` 入口增加 `principal` 与 `tool.search` 校验 |
| `index.html` | 追加 4 个新脚本标签（顺序见 §8） |

### 4.3 明确不修改

`profile.js`、`store.js`、`thread.js`、`planner.js`、`router.js`、`request.js`、`sources.js`、`claims.js`、`evidence.js`、`reducer.js`、`report.js`、`evaluator.js`、`feedback.js`、`task.js`（TaskState 契约保持不变）。

> 不修改 `task.js` 的原因：73 项 task 测试直接依赖其字段与不变量；把 owner 放在存储信封层可零破坏达成同样安全目标。

---

## 5. ProfileContext 设计

```js
// core/profile-context.js
var SESSION_ID = 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function currentProfileId() {
  return (root.Profile && root.Profile.currentId) ? root.Profile.currentId() : null;
}

function capture() {
  var pid = currentProfileId();
  if (!pid) return null;
  return Object.freeze({ profileId: pid, sessionId: SESSION_ID, capturedAt: Date.now() });
}

function current() {            // 惰性，不缓存旧 profile
  return capture();
}

function sameSession(snapshot) {
  return !!(snapshot && snapshot.sessionId === SESSION_ID &&
            snapshot.profileId === currentProfileId());
}
```

规则：
1. `capture()` 在每次任务创建/恢复时调用，不缓存跨页结果。
2. 页面重载后 `SESSION_ID` 变化 ⇒ 旧异步任务 `sameSession` 为 false。
3. 不提供 `setProfileId()`；任何模块都无法写入 profileId。

---

## 6. AgentRegistry / CapabilityRegistry 设计

### 6.1 AgentRegistry（扩展现有 `AGENTS` / `AGENT_BY_ID`）

```js
// core/security.js 只读使用
function resolveRole(agentId) {
  var a = root.AgentCore && root.AgentCore.agentById ? root.AgentCore.agentById(agentId) : null;
  if (!a) return null;
  return { agentId: agentId, roleId: a.custom ? ('custom:' + agentId) : agentId };
}
```

- 未知 agentId → `AGENT_NOT_REGISTERED`。
- 自定义 Agent 一律 `custom:<id>`，**不继承任何内置角色能力**。
- 不修改 13 个内置 Agent 的职责描述。

### 6.2 CapabilityRegistry

| 能力 | P0 状态 | 说明 |
|---|---|---|
| `project.read` | 已实现 | 仅能读当前 Profile 的任务信封（尚无 Project 实体） |
| `project.create/update/archive` | 仅定义 | 返回 `CAPABILITY_NOT_IMPLEMENTED` |
| `memory.read` | 已实现 | 仅当前 Thread 短期记忆 |
| `memory.propose/approve/update` | 仅定义 | 禁止把 MEMORY 升级为科研记忆 |
| `evidence.read` | 已实现 | 只读当前任务内 Evidence |
| `evidence.create/annotate/delete` | 仅定义 | 拒绝持久化写入 |
| `claim.read` | 已实现 | 只读当前任务内 Claims |
| `claim.propose/evaluate/approve` | 仅定义 | 拒绝 |
| `task.create` | 已实现 | |
| `task.execute` | 已实现 | |
| `task.pause/cancel` | 已实现 | P0 仅暴露 cancel（取消按钮已有） |
| `task.resume` | 已实现 | |
| `skill.propose/create/test/evaluate/publish/rollback` | 仅定义 | 全部拒绝 |
| `report.create/evaluate` | 仅定义 | 拒绝 |
| `tool.search` | 已实现 | `evidence.search` / `paper.search` / `simbad.tap` |
| `tool.calculate` | 已实现 | `kepler.*` |
| `tool.read_local` | 已实现 | `kb.lookup` / `fits.parse` |
| `tool.external_api` | 已实现 | `simbad.tap` / `paper.search` / `evidence.search` |
| `tool.llm` | 已实现 | `llm.compose` / `Sources.generate` |

**硬约束**：`IMPLEMENTED=false` 的能力在 `authorize` 中一律 `CAPABILITY_NOT_IMPLEMENTED`，即使角色策略表写了允许。

### 6.3 角色策略表（默认拒绝）

| Role | 允许能力（P0 已实现范围内） |
|---|---|
| `muse` | `task.create/execute/resume/cancel`, `project.read`, `evidence.read`, `claim.read`, `tool.llm`, `tool.calculate` |
| `scholar` | `task.create/execute/resume/cancel`, `project.read`, `evidence.read`, `claim.read`, `memory.read`, `tool.search`, `tool.external_api` |
| `critic` | `project.read`, `evidence.read`, `claim.read`, `tool.calculate` |
| `curator` | `project.read`, `evidence.read`, `claim.read`, `tool.read_local` |
| `vega` | `project.read`, `evidence.read`, `tool.read_local`, `tool.calculate` |
| `kepler` | `tool.calculate` |
| `horizon` | `tool.calculate`, `tool.read_local` |
| `orion` | `tool.read_local` |
| `cosmos` / `nova` / `helios` | `project.read`, `evidence.read`, `tool.calculate` |
| `lyra` | 无（仅文本表达，不进入授权资源） |
| `navigator` | 无（视图操作不走数据工具） |
| `custom:*` | 无 |
| 未知 | 无（`ROLE_NOT_ALLOWED`） |

> 表中未列出的能力 = 拒绝。`task.pause` P0 无 UI，不授予任何角色。

---

## 7. AuthorizationService / PolicyEvaluator 设计

### 7.1 唯一契约

```js
authorize({ principal, action, resource, context })
  → { allowed, reason, policyVersion: '1' }
```

### 7.2 判定顺序（短路）

```
1. principal 完整？profileId、sessionId、principalType 缺失 → INVALID_CONTEXT
2. session 仍有效？→ SESSION_CHANGED
3. agentId 已注册？→ AGENT_NOT_REGISTERED
4. action 在枚举内？→ POLICY_DENIED
5. resource.ownerProfileId === principal.profileId？→ PROFILE_MISMATCH
6. resource.projectId 非空？必须等于 principal.projectId → PROJECT_MISMATCH
7. 角色策略含该能力？→ CAPABILITY_NOT_GRANTED
8. 能力已实现？→ CAPABILITY_NOT_IMPLEMENTED
9. 资源存在且属于当前 profile？→ RESOURCE_NOT_FOUND
10. 其他细粒度条件（如 resume 要求 phase=EXECUTE）→ POLICY_DENIED
11. 允许
```

每次判定（允许与拒绝）都调用 `AuditLog.record()`；**审计失败不影响决策**。

### 7.3 委托（多 Agent）

```js
delegate(parentPrincipal, childAgentId, projectId)
  → 新 principal，能力取交集：rolePolicy(child) ∩ rolePolicy(parent)
```

- 委托不能扩权；父无 `task.execute`，子也不会有。
- 委托记录 `delegatedBy` 写入审计。
- `Plan.step.agentId` 可选；P0 的 7 个模板不产生 agentId，全部走 Muse 主体，因此该能力「已实现但当前无调用方」——必须在实施报告中标注。

---

## 8. ToolGateway 设计

### 8.1 接口

```js
ToolGateway.invoke(principal, toolId, args, {
  ctx, cfg, depResults, registry, signal, taskId
}) → tool result
```

### 8.2 流程

```
1. registry.get(toolId) → 不存在：RESOURCE_NOT_FOUND（不执行）
2. 工具能力映射 TOOL_CAPABILITY[toolId]
3. authorize({principal, action:'tool.call', resource:{type:'tool',id:toolId}})
4. 校验 args schema（沿用 registry.validateArgs）
5. 剥离并拒绝 args.profileId / args.projectId（若出现：POLICY_DENIED + 审计）
6. 执行 spec.run(args, ctx, cfg, depResults, runtime+principal)
7. AuditLog 记录 tool.call 结果（success/failure/cancelled）
8. 返回原结果，不改契约
```

### 8.3 工具→能力映射

| Tool | Capability |
|---|---|
| `kepler.ephemeris` / `kepler.visibility` | `tool.calculate` |
| `kb.lookup` / `fits.parse` / `compare.curate` | `tool.read_local` |
| `evidence.search` / `paper.search` | `tool.search` |
| `simbad.tap` | `tool.external_api` |
| `llm.compose` | `tool.llm` |
| `compose.*` | 无（内部组装，不访问外部资源，直接放行但记审计） |

### 8.4 拦截点（必须是真实调用路径）

| 路径 | 拦截方式 |
|---|---|
| `orchestrator.executeOne` | 用 `ToolGateway.invoke` 替换 `spec.run`（`orchestrator.js:302-306`） |
| `research.js` `run()` | 入口 `authorize(tool.search)`；`principal` 由 Control 传入 |
| legacy `AC.buildAnswer` | **不拦截**，在报告中标注「不受保护路径」；它不访问任务/课题/外部检索（L1） |
| `Sources.generate/streamChat` | 由 `ToolGateway` 的 `llm.compose` 覆盖 Control 路径；legacy 流式表述为「不受保护」，仅用当前答案事实，不读资源 |
| UI 视图指令 | 非数据资源，不做授权 |

**验收要求**：新增 `P0-TOOL-*` 测试必须通过 `executeOne` 路径验证拒绝；只测 `ToolGateway` 单元不算通过。

---

## 9. TaskStore 隔离方案（最高优先级）

### 9.1 命名空间

```js
// 惰性求值，避免脚本加载顺序问题
function baseName() { return 'astrum.tasks.v1'; }
function storeName() {
  var pid = ownerProfileId();
  if (!pid) return baseName();
  return pid === 'default' ? baseName() : ('p.' + pid + '.astrum.tasks.v1');
}
function lsKey() { return storeName(); }   // 与 DB 同名，便于排查
```

- 默认档案沿用 `astrum.tasks.v1`（老用户升级后自己的任务仍可见，无需迁移自己的数据）。
- 其他档案 `p.<id>.astrum.tasks.v1`，物理隔离。
- **不接受调用方传入 profileId**：`create()` 中若浏览器存在 `Profile`，忽略 `options.ownerProfileId`；仅当无 `Profile`（Node 测试）时才允许显式 owner。

### 9.2 记录信封

```js
{
  id,
  question,
  phase,
  createdAt,
  updatedAt,
  template,
  ownerProfileId,     // 新增
  projectId,          // 新增，可 null
  state
}
```

**TaskState 本身不改**。

### 9.3 API 语义

| API | 新语义 |
|---|---|
| `save(state, opts)` | 写入前 `rec.ownerProfileId = owner`；若已存在且 owner 不同 → 拒绝（正常不可能，防御同库脏数据） |
| `get(id)` | 读取后校验 owner，不匹配返回 `null` 并审计 `PROFILE_MISMATCH` |
| `getRecord(id)` | 新增：返回信封（含 owner/project），仅供已授权调用方 |
| `list(opts)` | 只读当前库；仍按 owner 过滤（防御） |
| `remove(id)` | 先 `getRecord` 校验 owner；不匹配拒绝 |
| `clear()` | 只清当前档案库 |
| `migrateLegacy()` | 见 §10 |

### 9.4 调用方改造

- `app.js:3807` / `8344`：创建 store 时无参数，自动绑定当前档案。
- `control-bridge.js:189/224`：同上，不接受 `opts.store` 覆盖 owner；若传入 store，校验其 `ownerProfileId === principal.profileId`，否则 `PROFILE_MISMATCH`。
- `control.js:416-419`：`defaultStore()` 绑定 principal（新增必填参数）。
- `control.js:421-429` `load`：校验 owner + 返回 `projectId`。
- `control.js:431-498` `resume`：进入前、每批执行前、`saveState` 前三次 `ensureAccess`。

### 9.5 拒绝时的行为

- 统一返回 `null` / `{allowed:false}`，UI 显示「任务不存在或不属于当前档案」，**不泄露任务是否存在**。
- 不删除、不修改被拒绝的任务。
- 审计记录真实原因（仅本地，不含任务正文）。

---

## 10. 历史数据迁移方案

### 10.1 目标

旧任务（无 `ownerProfileId`）**不得默认归当前 Profile**。P0 只做「隔离 + 待确认」，不做自动归属。

### 10.2 隔离区

- 新库：设备级 `astrum.tasks.quarantine.v1`（不按 Profile 分区，因为归属未知）。
- 记录：

```js
{
  id: 'legacy:<原id>',
  legacyId: '<原id>',
  question, phase, updatedAt,
  state,                     // 原样保留，不执行
  migrationState: 'pending_migration',  // pending_migration | needs_owner_confirmation | claimed | rejected
  source: 'idb:astrum.tasks.v1' | 'ls:astrum.tasks.v1',
  quarantinedAt,
  candidateProfileId: null   // 永不自动填
}
```

### 10.3 流程

```
1. 读取旧 IndexedDB（只读打开 astrum.tasks.v1）→ getAll
2. 读取旧 localStorage key（若存在，合并去重 by id）
3. 逐条 put 到隔离区；id 固定为 'legacy:<id>' ⇒ 幂等
4. 写迁移标记 localStorage['astrum.tasks.migration.v1'] =
   { version:1, scannedAt, total, quarantined, failed }
5. 不删除旧数据（P0 不做破坏性迁移）
6. 若标记已存在且 version=1 ⇒ 跳过（?migrate=force 仅调试用，需确认）
```

### 10.4 一致性

| 风险 | 方案 |
|---|---|
| 迁移中断 | 逐条独立事务；下次只补缺失 id |
| 重复迁移 | 固定 quarantine id + `put` 覆盖 |
| 重复任务 ID | 原 id 保留在 `legacyId`，隔离区主键加前缀 |
| 部分成功 | 计数 `quarantined/failed`；失败不影响已成功项 |
| 写入失败 | 保留旧库；不标记完成；下次重试 |
| IDB 版本升级 | 新库均 version 1；不改旧库 schema |
| 旧版本应用兼容 | 旧代码仍读旧库；新任务在旧代码中不可见（数据不丢，仅不可见） |
| 迁移后校验 | 重新统计隔离区条数与 `getAll` 数一致；抽样 `AstroTask.fromJSON` 校验 |

### 10.5 用户可见入口

P0 仅提供只读提示：「发现 N 个旧版本任务，归属待确认；为避免串档案，已隔离保存。」不做「一键归入当前档案」。归属确认 UI 留待 P1。

---

## 11. AuditLog 方案

### 11.1 存储

- 库：`Profile.ns('astrum.audit.v1')`（按档案隔离）。
- 上限：1000 条或 512KB，超出淘汰最旧；不阻塞主流程。
- 浏览器本地日志，**不是**服务器级不可篡改审计，UI 与文档必须如此表述。

### 11.2 字段

`id, profileId, projectId, principalType, principalId, action, resourceType, resourceId, decision, reason, policyVersion, timestamp`

### 11.3 记录点

- 权限允许/拒绝（`authorize` 每次调用）
- 任务创建/恢复/执行批次/取消/完成
- 工具调用开始/结束
- 迁移扫描结果
- 权限相关配置变更（P0 无 UI 配置，预留）

### 11.4 脱敏

- 禁止写入：`apiKey, token, authorization, cookie, secret, password` 字段。
- `resourceId` 只存 id，不存任务正文、问题全文（问题截断到 40 字，且仅任务生命周期事件可带）。
- `reason` 只存错误码，不存自由文本。

---

## 12. 异步任务安全方案

| 场景 | 机制 |
|---|---|
| 任务创建 | `ProfileContext.capture()` → 信封 `ownerProfileId` |
| 执行中切换 Profile（正常 UI） | `location.reload()` 终止页面；旧 Promise 随页面销毁 |
| 执行中切换 Profile（直接 API） | `ensureSession()` 在每批执行前与保存前检测 `sessionId/profileId`，变化即 `SESSION_CHANGED`，转 `ABORTED` |
| 页面刷新 | sessionId 变化；旧任务不再自动执行；由用户从列表恢复 |
| 恢复 | `load` 校验 owner → `resume` 前校验 → 每批前校验 → 保存前校验（四次） |
| 权限撤销 | 每批重新 `authorize`；撤销后剩余步骤 `step.failed(POLICY_DENIED)`，任务 `PARTIAL` |
| 结果写入 | `TaskStore.save` 校验 owner；不匹配丢弃并审计 |
| 并发写 | 以 `updatedAt` 做乐观锁：`save` 时若库内 `updatedAt` 更新则拒绝覆盖（`POLICY_DENIED`） |

---

## 13. 多 Agent 委托授权方案

1. `Principal` 增加可选 `delegatedBy`（仅审计用）。
2. `Authz.delegate(parent, childAgentId, projectId)`：能力取交集，不扩权。
3. `Plan.step.agentId` 可选；`executeOne` 若存在，解析子 principal；无则用主体。
4. 子 Agent 不得调用 `delegate` 再委托（P0 只允许一级）。
5. 工具调用始终携带**实际执行主体**的 principal，不携带父 principal。
6. 同课题不同角色能力不同：由角色策略表保证，不因同 Project 自动同权。

---

## 14. 兼容性设计

| 兼容项 | 方案 |
|---|---|
| 默认档案旧任务 | 库名不变，原地可见 |
| 旧线程/设置/缓存 | 不动，已有命名空间 |
| TaskState schemaVersion=1 | 不变；owner 在信封 |
| 导出格式 schema:1 | 不变；P0 不导出任务 |
| 336 项回归测试 | `create({})` 在无 Profile 环境保持旧行为；有 Profile 时自动绑定 |
| 自定义 Agent | 仅增加保留 id 校验；其余不变 |
| 静态部署 | 纯前端，无构建步骤 |
| 旧版本回退 | 新任务在旧代码不可见；数据不删除 |

---

## 15. 回滚设计

| 层级 | 回滚方式 |
|---|---|
| 代码 | 回退到 `5c0f9c7`；命名空间库与隔离区保留，不丢数据 |
| 任务读取 | 回滚后旧代码读旧库；默认档案任务仍在旧库，非默认档案任务暂不可见 |
| 数据 | 迁移为只读扫描 + 复制，不删除旧库；回滚无数据损失 |
| 功能开关 | 新增 `window.ASTRUM_P0_ENFORCE`（默认 true）；仅用于紧急诊断，**不能作为常规绕过**，并在审计中记录关闭事件 |
| 测试 | 新测试独立文件，不影响旧测试 |

> 回滚不需要数据库降级脚本；这是选择「只复制不删除」的直接收益。

---

## 16. 文件级修改清单

| 文件路径 | 当前职责 | 当前问题 | 建议修改 | 修改原因 | 风险 | 依赖 |
|---|---|---|---|---|---|---|
| `core/profile-context.js` | 不存在 | 无可信身份快照 | 新增 capture/current/sameSession | 提供唯一可信 profileId/sessionId 来源 | 低 | `profile.js` |
| `core/security.js` | 不存在 | 无角色/能力/授权 | 新增 Principal 工厂、CapabilityRegistry、RolePolicy、authorize、delegate | 统一默认拒绝的授权决策 | 中 | `profile-context.js`、`agents.js` |
| `core/audit-log.js` | 不存在 | 无权限日志 | 新增按档案隔离的环形日志 | 可追溯 allow/deny 与任务生命周期 | 低 | `profile.js` |
| `core/tool-gateway.js` | 不存在 | 工具直调 | 新增 invoke：授权→校验→执行→审计 | 唯一工具拦截入口 | 中 | `security.js`、`audit-log.js`、`registry.js` |
| `core/task-store.js` | 全局任务存储 | 库名固定，无 owner | 命名空间、owner 字段、owner 校验、`getRecord`、`migrateLegacy` | 修复 P0-2 根因 | **高** | `profile-context.js` |
| `core/control.js` | 任务准备/执行/恢复 | 恢复不校验归属 | `prepare` 注入 principal；`load/resume/save` 重校验 | 任务执行层安全 | 高 | `task-store.js`、`security.js` |
| `core/control-bridge.js` | 任务桥接 | 创建 store 无身份 | 构造 principal 并透传；拒绝 store 覆盖 | 保证身份从入口开始可信 | 中 | `control.js` |
| `core/orchestrator.js` | 工具执行 | `spec.run` 直调 | 改走 `ToolGateway.invoke`；批次前 `ensureSession` | 工具权限与异步安全 | 高 | `tool-gateway.js` |
| `core/agents.js` | Agent 注册与答案 | 自定义可覆盖内置 id | `setCustomAgents` 拒绝保留 id；导出只读 `agentById` | 防身份标签覆盖 | 低 | — |
| `core/app.js` | UI 与入口 | 恢复用全局库 | store 自动绑定当前档案；启动触发迁移提示 | 入口层不传错档案 | 中 | `task-store.js` |
| `core/research.js` | 多轮检索 | 直接 `Sources.searchMany` | `run()` 入口校验 `tool.search` | 覆盖检索旁路 | 中 | `security.js` |
| `index.html` | 脚本清单 | 未加载新模块 | 在 `profile.js` 后、`task-store.js` 前插入新脚本 | 保证加载顺序 | 低 | 新模块 |
| `tools/p0-security-test.js` | 不存在 | 无安全测试 | 新增跨 Profile/Agent/工具/异步测试 | P0 验收 | 低 | 全部 |
| `tools/p0-migration-test.js` | 不存在 | 无迁移测试 | 新增迁移幂等/隔离测试 | 验收 | 低 | `task-store.js` |

**不修改**：`core/task.js`、`core/profile.js`、`core/store.js`、`core/thread.js`、`core/sources.js`、`core/claims.js`、`core/evidence.js`、`core/reducer.js`、`core/report.js`、`core/evaluator.js`、`core/planner.js`、`core/router.js`、`core/request.js`、`core/schema.js`。

---

## 17. 权限矩阵

| Agent Role | Resource | Action | Default | Approval Required | Scope |
|---|---|---|---|---|---|
| scholar | project/task | read | ✅（本档案） | 否 | 当前 Profile |
| scholar | evidence/claim | read | ✅ | 否 | 当前 Task |
| scholar | task | create/execute/resume/cancel | ✅ | 否 | 当前 Profile |
| scholar | evidence/claim | create/annotate/delete | ❌ | — | 仅定义，P0 拒绝 |
| scholar | skill/report | propose/create/publish | ❌ | 是（P1） | 仅定义 |
| critic | evidence/claim | read | ✅ | 否 | 当前 Task |
| critic | claim | evaluate/approve | ❌ | 是（P1） | 仅定义 |
| curator | evidence | read | ✅ | 否 | 当前 Task |
| curator | evidence | annotate/create | ❌ | 是（P1） | 仅定义 |
| muse | project/task | read | ✅ | 否 | 当前 Profile |
| muse | task | create/execute/resume/cancel | ✅ | 否 | 当前 Profile |
| muse | tool | llm/calculate | ✅ | 否 | 当前 Task |
| muse | evidence/claim | create/approve | ❌ | — | 禁止 |
| vega | evidence | read | ✅ | 否 | 当前 Task |
| vega | tool | read_local/calculate | ✅ | 否 | 当前 Task |
| kepler/horizon/orion | tool | calculate/read_local | ✅ | 否 | 当前 Task |
| cosmos/nova/helios | evidence | read | ✅ | 否 | 当前 Task |
| lyra | 任何受保护资源 | read/create/update/delete | ❌ | — | 无科研权限 |
| navigator | 任何受保护资源 | 任何 | ❌ | — | 视图操作不走数据工具 |
| custom:* | 任何受保护资源 | 任何 | ❌ | — | 默认无权限 |
| 未知 role | 任何 | 任何 | ❌ | — | `ROLE_NOT_ALLOWED` |
| 用户（UI 入口） | task | read/resume/cancel | ✅ | 否 | 当前 Profile |

> 「Approval Required」为 P1+ 的提案/批准分离预留；P0 中对应能力未实现，一律拒绝，不存在「自动批准」。

---

## 18. 安全威胁模型

| # | 威胁 | 攻击方式 | 受影响资源 | 当前防护 | 风险 | 建议措施 | 测试 |
|---|---|---|---|---|---|---|---|
| T1 | 跨 Profile 访问 | 切档案后读任务列表/按 ID 读 | Task | 无 | 严重 | 命名空间 + owner 校验 | P0-PROFILE-001~009 |
| T2 | 跨 Project 访问 | 传 projectId 参数 | Project 预留 | 无 Project 实体 | 中 | projectId 只来自记录；参数忽略 | P0-PROJECT-001~005 |
| T3 | Agent 身份伪造 | 自定义同名/id | Agent 标签 | 无 | 中 | 保留 id + 注册表解析 | P0-AGENT-001~003 |
| T4 | Role 伪造 | 传 roleId 参数 | 授权 | 无 | 高 | roleId 仅注册表解析 | P0-AUTH-001~004 |
| T5 | Capability 伪造 | 直接调高权工具 | 工具 | 无 | 高 | ToolGateway 统一授权 | P0-TOOL-001~006 |
| T6 | Task ID 猜测 | 枚举 `tsk_<时间戳>_<序号>` | Task | 无 | 高 | 命名空间内 ID 不再是跨档案凭证 | P0-TASK-001~004 |
| T7 | Task 参数篡改 | 改 state.plan/tool args | Task | 仅结构校验 | 中 | 执行前 owner + schema 校验 | P0-TASK-005 |
| T8 | Prompt Injection | 文档/网页中出现指令 | 工具参数 | 提示词声明 | 中 | 工具参数只来自 Plan；Gateway 拒绝身份字段 | P0-TOOL-007 |
| T9 | 工具调用绕过 | 直调 `Sources.*` / `Research.run` | 外部资源 | 无 | 中 | Registry 路径收口 + Research 入口校验；legacy 标注不受保护 | P0-TOOL-008 |
| T10 | 异步上下文污染 | 切档案后旧任务继续/写回 | Task | 重载终止 | 高 | session + 每批重校验 + 保存校验 | P0-ASYNC-001~005 |
| T11 | 迁移错误 | 旧任务默认归属 | Task | 无 | 高 | 隔离区 + 不自动归属 | P0-MIGRATION-001~006 |
| T12 | 缓存污染 | 搜索/全文缓存跨档案 | 缓存 | 已按档案命名空间 | 低 | 保持不变，回归验证 | P0-PROFILE-010 |
| T13 | 存储命名空间错误 | 回退 localStorage 时键名错误 | Task | 无 | 高 | 同一 `storeName()` 供 IDB/LS 使用 | P0-TASK-006 |
| T14 | 撤销后继续执行 | 移除能力后旧任务继续 | 工具/资源 | 无 | 高 | 每批 `authorize` | P0-ASYNC-006 |
| T15 | 本机直接改存储 | 用户用 DevTools 改 localStorage | 全部 | 无（浏览器边界） | 接受 | 明确列为非目标威胁 | — |

---

## 19. 实施任务分解（含前置依赖）

| ID | 任务 | 前置 | 产出 | 验证 |
|---|---|---|---|---|
| P0-01 | 新增 `profile-context.js` | 无 | 可信 profile/session 快照 | 单元：capture 不可变、切档案后 profileId 变化 |
| P0-02 | 新增 `security.js`（Principal+Capability+Role+authorize） | P0-01 | 授权契约 | 单元：默认拒绝、错误码 |
| P0-03 | 新增 `audit-log.js` | P0-01 | 日志模块 | 单元：字段/上限/脱敏 |
| P0-04 | `agents.js` 增加只读 `agentById` 与保留 id 校验 | P0-02 | 角色解析 | 单元：未知/自定义 |
| P0-05 | 新增 `tool-gateway.js` | P0-02,03 | 工具网关 | 单元：拒绝不执行 |
| P0-06 | `task-store.js` 命名空间 + owner 信封 + `getRecord` | P0-01,02 | 存储隔离 | 跨档案不可见 |
| P0-07 | `control.js` principal 注入 + load/resume/save 重校验 | P0-06 | 执行层安全 | 跨档案恢复拒绝 |
| P0-08 | `control-bridge.js` 透传 principal，拒绝 store 覆盖 | P0-07 | 入口安全 | 覆盖 store 被拒 |
| P0-09 | `orchestrator.js` 改走 Gateway + 批次 session 校验 | P0-05,07 | 工具/异步安全 | 拒绝路径测试 |
| P0-10 | `app.js` 恢复入口绑定当前档案 + 迁移提示 | P0-06 | UI 入口安全 | 多档案手工验证 |
| P0-11 | `research.js` 检索入口授权 | P0-02 | 旁路收口 | 未授权拒绝 |
| P0-12 | `task-store.migrateLegacy()` 隔离区 | P0-06 | 迁移能力 | 幂等/中断测试 |
| P0-13 | `index.html` 脚本加载顺序 | P0-01~05 | 可启动 | 浏览器启动 |
| P0-14 | 新增 `tools/p0-security-test.js` | P0-06~12 | 安全测试集 | 全部通过 |
| P0-15 | 新增 `tools/p0-migration-test.js` | P0-12 | 迁移测试集 | 全部通过 |
| P0-16 | 回归执行 336 项 | P0-06~13 | 回归结果 | 336/336 |
| P0-17 | 手工多档案验证（浏览器，隔离 Profile） | P0-10,13 | 验收记录 | 场景 A-F |
| P0-18 | 文档与实施报告 | P0-16,17 | 阶段 B 报告 | 对照验收 |
| P0-19 | 回滚演练（代码回退 + 数据完整性） | P0-18 | 回滚记录 | 数据不丢 |

---

## 20. 阶段验收标准（阶段 B 完成后）

1. Profile 隔离生效：A 的任务在 B 的列表/查询中不可见。
2. TaskStore 查询/修改/删除/恢复/执行隔离全部生效。
3. 工具调用权限门在 `executeOne` 真实路径生效。
4. 未注册 Agent / 未知 Role / 未授权 Capability 默认拒绝。
5. 异步任务跨 Profile 不污染、不写回。
6. 历史任务全部进入隔离区，0 条自动归属。
7. 权限日志可按档案查询，含 allow/deny 与拒绝原因。
8. 新增安全测试全部通过；336 项回归保持通过。
9. 静态部署无新增依赖、无构建步骤。
10. 所有修改均在 §16 清单内；无计划外文件。

---

## 21. 需要用户决定的决策（不默默替用户决定）

| ID | 决策 | 可选方案 | 推荐 | 理由 |
|---|---|---|---|---|
| D-01 | 历史任务归属 | (a) 全部隔离待确认 (b) 首次启动询问归属 (c) 默认归当前档案 | **(a)** | 任务书明确禁止默认归属；(b) 需要额外 UI 与误操作风险 |
| D-02 | legacy L1 路径是否改造 | (a) 不改造，标注「不受保护」 (b) 全面接入 Gateway | **(a)** | legacy 不访问任务/课题资源；全面改造属架构重写，超出 P0 |
| D-03 | 新模块拆分粒度 | (a) 4 文件 (b) 8 独立文件 | **(a)** | 避免循环依赖与加载顺序复杂度；职责仍有明确注释边界 |
| D-04 | 审计日志上限 | (a) 1000 条 (b) 5000 条 (c) 不限制 | **(a)** | 浏览器存储有限；1000 条足以覆盖近期诊断 |
| D-05 | 是否在信封增加 `projectId` | (a) 现在加可空字段 (b) P1 再加 | **(a)** | 零成本预留，避免 P1 再改存储结构 |
| D-06 | 自定义 Agent 与内置 id 冲突 | (a) 拒绝创建/导入 (b) 允许覆盖 | **(a)** | 防止身份标签伪造 |
| D-07 | 旧版本回退后的新任务 | (a) 暂不可见但保留 (b) 回滚时导出 | **(a)** | 无数据损失；导出可作为运维选项 |
| D-08 | 是否修改 TaskState 契约加 profileId | (a) 不改，owner 放信封 (b) 改 TaskState | **(a)** | 保护 73 项 task 测试与 schemaVersion=1 契约 |

---

## 22. 阶段 A 自检

| 验收项 | 状态 |
|---|---|
| 已形成统一权限模型 | ✅ §3 |
| 已形成 Agent 角色权限矩阵 | ✅ §17 |
| 已形成 TaskStore 隔离方案 | ✅ §9 |
| 已形成历史数据迁移方案 | ✅ §10 |
| 已形成工具调用权限方案 | ✅ §8 |
| 已形成异步任务安全方案 | ✅ §12 |
| 已形成多 Agent 协作授权方案 | ✅ §13 |
| 已形成兼容性方案 | ✅ §14 |
| 已形成回滚方案 | ✅ §15 |
| 已形成文件级修改清单 | ✅ §16 |
| 已形成威胁模型 | ✅ §18 |
| 已形成实施顺序与依赖 | ✅ §19 |
| 未修改业务/测试/配置代码 | ✅ |
| 未执行 Git 写操作 | ✅ |
| 未修改用户数据 | ✅ |

**本计划为阶段 A 交付，未获明确批准前不进入阶段 B。**
