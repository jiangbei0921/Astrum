# P3-03 · Agent / Skill / Tool 调度与权限设计

- 目标：为每个任务步骤选定**唯一合法执行体**，并在执行前完成权限、作用域、版本与副作用校验
- 原则：声明 ≠ 授权；所有执行只经 `ToolGateway`；P3 不新增 Agent

---

## 1. 能力发现（Capability Resolver）

### 1.1 解析顺序（固定）

```
Step.requiredCapability
   │
   ├─ 1. 确定性工具：registry.get(toolId) 命中且参数 Schema 可满足
   ├─ 2. 已发布 Skill：skillStore.listPublishedByCapability()
   ├─ 3. 已授权 Agent：TOOL_AGENT 域映射 / agentById 职责匹配
   └─ 4. 无可用能力 → 记录 gap，暂停该步骤（不创建临时 Skill）
```

### 1.2 输入信号

| 信号 | 来源 | 用途 |
|---|---|---|
| `step.kind` | 计划 | `tool` / `skill` |
| `step.tool` | 计划 | 工具 id |
| `step.skillId` | 计划 | Skill id |
| `step.requiredCaps` | 新增可选 | 能力标签（`search`/`compute`/`llm`/`local`） |
| `registry` 条目 | `registry.get` | `caps/argsSchema/returns/timeoutMs/cost/permissions/idempotent/retry/deps` |
| `skillStore.getPublished` | P2 | 已发布技能 + 当前版本 |
| `principal` | P0 | Profile / Project / Role / 会话 |

### 1.3 匹配规则

- **工具优先**：同一能力既有工具又有 Skill 时，优先工具（确定性、可测试、成本低）。
- **Skill 次之**：仅当工具无法覆盖（需要多步组合、项目特有流程）才选 Skill。
- **Agent 不作为独立执行入口**：Agent 是「角色」，实际执行仍落到其被允许的工具；P3 不新增「Agent 直接调用」路径。
- **不自动创建 Skill**：缺失能力只记录 `gap: { code:'capability_missing', capability, stepId }`。

---

## 2. Agent 分配

### 2.1 现有名册（只读）

`AGENT_BY_ID` 共 13 个内置：muse / vega / kepler / horizon / orion / cosmos / nova / helios / lyra / scholar / critic / curator / navigator（[agents.js](file:///D:/Projects/Astrum/core/agents.js#L191-L286)）。

### 2.2 分配方式

沿用 [TOOL_AGENT](file:///D:/Projects/Astrum/core/orchestrator.js#L113-L126) 静态域映射：

| 工具域 | 执行角色 |
|---|---|
| `kepler.*` | kepler |
| `kb.*` / `fits.*` / `compare.*` | curator |
| `evidence.*` / `paper.*` / `simbad.*` | scholar |
| `llm.*` / `compose.*` | muse |

执行时由 `Security.delegate(muse, 专业角色, projectId)` 生成子 principal（一级委托、独立策略、不扩权）。

### 2.3 约束

- 不新增 Agent，不把确定性函数包装成 LLM Agent；
- 不允许两个 Agent 执行同一份工作（同一 step 只有一个 `execPrincipal`）；
- Agent 不能自行获得额外能力（`delegate` 后按子角色策略判定）；
- 自定义 Agent 仅在 `AgentCore` 注册且 `security.resolveRole` 可解析时可用。

---

## 3. Skill 分配

### 3.1 硬性准入（全部满足）

| 条件 | 校验点 |
|---|---|
| 状态 `published` | `getPublished` 只返回 `currentVersionId` 指向的 `published` 版本 |
| 版本当前有效 | `version.status === 'published'` |
| Profile 匹配 | `skill.profileId === principal.profileId` |
| Project 匹配 | `skill.projectId` 为空或等于 `principal.projectId` |
| Agent 允许 | `allowedAgents` 为空或不排除当前 Agent |
| 能力允许 | `requiredCapabilities` 每项 `Security.can` |
| 工具可用 | `allowedTools` 全部在 registry |
| 工具权限 | 每个工具能力 `Security.can` |
| 审批未失效 | 审批记录 `versionId + contentHash` 一致 |

以上由 [skill-runtime.resolveScope](file:///D:/Projects/Astrum/core/skill-runtime.js#L41-L91) 在**执行时**重新计算，P3 在**计划时**按同一规则预检，二者不得分叉。

### 3.2 禁止调用

草稿、验证失败、待审批、已撤销、已废弃、被回滚、跨作用域、版本非当前 —— 一律 `NOT_PUBLISHED` / `PROJECT_MISMATCH` / `CAPABILITY_NOT_GRANTED`，不降级为草稿执行。

### 3.3 结果回写

- `step.result = exec`（含 `executionId/versionId/outputHash`）；
- `step.toolId = 'skill:' + skillId`（保持现状）；
- **新增** `step.skillVersionId`，供报告展示版本；
- Skill 执行记录由 `AstroSkillStore.recordExecution` 写入（已有）。

---

## 4. Tool 分配

### 4.1 选取依据

任务类型 → 所需能力 → registry 条目（`caps`）→ 参数 Schema 可满足 → 权限允许 → 预算可承受。

### 4.2 执行网关（唯一出口）

```js
ToolGateway.invoke(principal, toolId, args, {
  registry, ctx, cfg, depResults, signal, taskId, attempt
})
```

网关负责（[tool-gateway.js](file:///D:/Projects/Astrum/core/tool-gateway.js#L41-L105)）：

1. 工具存在性；
2. 禁止参数（`profileId/projectId/principal/sessionId/ownerProfileId`）；
3. 能力授权 `Security.authorize({action:'tool.call'})`；
4. 参数 Schema；
5. 执行 + `tool.call` 审计（allow/deny 都记）。

**P3 新增约束：** 所有新执行入口必须通过 `TaskExecutor` 门面，门面内部只调 `executeOne`，禁止直接 `spec.run(...)`。当前 `executeOne` 在无 `principal` 时存在 Node 直调路径（为兼容旧测试），P3 的浏览器路径必须始终有 principal。

---

## 5. 权限检查矩阵

| 动作 | 能力 | 用户 | muse | scholar | critic | curator | system |
|---|---|---|---|---|---|---|---|
| 创建/执行任务 | `task.create` / `task.execute` | ✓（经 create） | ✓ | ✓ | — | — | — |
| 暂停任务（新增） | `task.pause` | ✓ | ✓ | ✓ | — | — | — |
| 恢复任务 | `task.resume` | ✓ | ✓ | ✓ | — | — | — |
| 取消任务 | `task.cancel` | ✓ | ✓ | ✓ | — | — | — |
| 读项目/记忆 | `project.read` / `memory.read` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Skill 读取/执行 | `skill.read` / `skill.execute` | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Skill 审批/发布/回滚 | `skill.approve/publish/rollback` | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| 生成报告（新增） | `report.create` | ✓ | ✓ | — | ✓ | — | — |
| 工具调用 | 由 `TOOL_CAPABILITY` 决定 | 按能力 | 按能力 | 按能力 | 按能力 | 按能力 | ✗ |

**必须修改的三项（阶段 B 前置）：**

1. `CAPABILITIES['task.pause'] = true`，`USER_POLICY` 增加 `task.pause`，`ROLE_POLICY` 的 muse/scholar 增加 `task.pause`。
2. `CAPABILITIES['report.create'] = true`，用户策略增加；`report.evaluate` 保持 false（P3 不重做评审体系）。
3. `security.authorize` 对 `task` 资源的 `pause/resume/cancel` 已有能力映射（`task.' + action`），无需改代码。

---

## 6. 作用域检查

| 维度 | 规则 | 失败 |
|---|---|---|
| Profile | task/skill/plan 的 `profileId` 必须等于 principal | `PROFILE_MISMATCH` |
| Project | 有 `projectId` 的资源必须与 principal 一致 | `PROJECT_MISMATCH` |
| Agent | Skill 的 `allowedAgents` | `AGENT_NOT_ALLOWED` |
| Tool | Skill 的 `allowedTools` + 角色工具能力 | `TOOL_NOT_ALLOWED` |
| Session | 每批执行前 `ensureSession` | `SESSION_CHANGED` |
| Task | `principal.taskId` 与执行任务一致（可选强化） | `TASK_MISMATCH` |

**跨项目规则：** 项目切换后，旧任务的 `store` 实例仍绑定旧 `projectId`；`save` 会抛 `PROJECT_MISMATCH`，`runPlan` 每批 `ensureSession` 会阻断。P3 不得复用旧 store 执行新项目任务。

---

## 7. 副作用与幂等

### 7.1 副作用等级（用于并行与恢复）

| 等级 | 判定 | 并行 | 恢复复用 |
|---|---|---|---|
| S0 只读本地 | `permissions.localOnly` 或 `idempotent` 且无网络 | 允许 | 可复用 |
| S1 只读外部 | `idempotent && cost.searches > 0` | 允许（受 searches 预算） | 可复用（有 TTL） |
| S2 写共享状态 | `evidence.search` / `paper.search`（写 `state.evidence`） | 禁止 | 不复用，重跑 |
| S3 输出合成 | `compose.*` / `compare.curate` | 禁止 | 不复用，重跑 |
| S4 外部副作用 | 当前无此类工具 | 禁止 | 永不自动重放 |

### 7.2 幂等策略三分类

1. **可安全复用**：S0/S1 且 `outputHash` 存在且输入哈希未变；
2. **必须重新执行**：S2/S3 或 `idempotent === false`；
3. **校验后决定**：S1 且超过 `ttlMs`，或 Skill 版本变化。

### 7.3 重试策略

沿用 [retryPolicy](file:///D:/Projects/Astrum/core/orchestrator.js#L200-L206)：仅 `idempotent && retry.allowed` 且失败类别 ∈ {timeout, network, rate_limit}，最多 1 次。P3 不提高重试次数。

---

## 8. 执行网关（统一门面）

新增逻辑模块 `TaskExecutor`（可放在 `core/task-executor.js`，也可作为 `orchestrator` 内部导出，阶段 B 决定）：

```
TaskExecutor.execute(step, state, opts)
  1. 依赖完成检查（scheduler 已保证，门面再断言）
  2. 状态检查（pending/ready）
  3. 权限检查（principal + 能力 + 作用域）
  4. 预算检查（整批预检 + 单步）
  5. 能力有效性（工具存在 / Skill published）
  6. 输入准备（depResults + 上下文）
  7. 委派执行（executeOne：tool 或 skill）
  8. 输出校验（expected/returns Schema）
  9. 记录结果（step.result/outputHash/evidenceRefs/provenance）
 10. 更新状态 + 事件 + trace
```

**约束：** 门面不实现调度（不在门面内循环），不实现重试（复用 Runner），不绕过 `ToolGateway`。

---

## 9. 权限拒绝与审计

| 场景 | 返回 | 审计 |
|---|---|---|
| 无 principal | `INVALID_CONTEXT` | 不写（无身份） |
| 会话变化 | `SESSION_CHANGED` | `task.execute` deny |
| 能力未实现 | `CAPABILITY_NOT_IMPLEMENTED` | allow/deny 记 deny |
| 角色不允许 | `CAPABILITY_NOT_GRANTED` | deny |
| 跨 Profile | `PROFILE_MISMATCH` | deny |
| 跨 Project | `PROJECT_MISMATCH` | deny |
| Skill 未发布 | `NOT_PUBLISHED` | deny |
| 工具不存在 | `RESOURCE_NOT_FOUND` | deny |

拒绝后步骤状态为 `failed`（`error.kind='permission'`），**不重试**（`retriable=false`）。
