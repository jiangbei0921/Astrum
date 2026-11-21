# P3-02 · 自主科研规划与 DAG 设计

- 目标：把科研目标转化为**可解释、可校验、可执行**的结构化计划与任务 DAG
- 原则：复用 `AstroTask` / `AstroPlanner` / `AstroOrchestrator.Scheduler`，不新建两套状态体系
- 本文件为设计，不含代码变更

---

## 1. 现状约束（必须先遵守）

| 约束 | 来源 | 设计含义 |
|---|---|---|
| `TaskState.create` 是**字段白名单**，未知字段在反序列化时被丢弃 | [task.js](file:///D:/Projects/Astrum/core/task.js#L360-L389) | 新增 `goal` 字段必须同时加入 `create()`，否则刷新后丢失 |
| `schemaVersion` 固定为 `1` | [task.js](file:///D:/Projects/Astrum/core/task.js#L413) | 新增字段一律**可选**，不升版本 |
| 计划上限 8 步、模板限定工具集合 | [planner.js](file:///D:/Projects/Astrum/core/planner.js#L380-L396) | P3 计划不能突破 8 步；模板仍是合法 step 来源 |
| 事件 payload 白名单 6 键 | [task.js](file:///D:/Projects/Astrum/core/task.js#L38) | 新事件只能用 `reason/action/...` 传语义，不塞长文本 |
| step status 枚举 8 值 | [task.js](file:///D:/Projects/Astrum/core/task.js#L26-L28) | 新增状态需同步 `validate` 与测试 |

---

## 2. ResearchGoal

### 2.1 定位

`ResearchGoal` 是**输入侧**实体，不进入执行状态机，只作为 `TaskState` 的可选附属字段持久化：

```
state.goal = ResearchGoal | null
```

### 2.2 结构

```js
ResearchGoal = {
  goalId: string,          // 'gol_' + ts + rand
  projectId: string|null,  // 必填于浏览器路径；与 TaskState.projectId 一致
  title: string,           // ≤120
  description: string,     // 用户原始表达，不改写
  objectives: [{ id, text, priority: 'must'|'should'|'nice' }],
  constraints: [{ id, kind: 'time'|'scope'|'source'|'budget'|'other', text }],
  context: {
    entities: string[],    // 来自 route.targets，不新造实体识别
    timeRange: { from, to } | null,
    domain: string | null, // 来自 intent 映射，如 'cosmology'
    priorFindings: string[] // 只放 project 记忆 ID，不放正文
  },
  requestedOutputs: string[],
  missingInfo: string[],   // 关键条件缺失项（含问题文本）
  sourceRefs: { query: string, intent: string, routeReason: string },
  createdAt: string
}
```

### 2.3 生成规则（Goal Adapter）

| 输入 | 处理 |
|---|---|
| `route.mode === 'single'` 且 `complexity <= 1` | **不创建** goal，走 legacy |
| `route.mode === 'compare'` | 创建 goal，objectives = 两个对比对象 + 对比维度 |
| `route.mode === 'research'` | 创建 goal，objectives 从提问中的「研究对象 + 研究关系 + 目标产出」拆 1–3 条 |
| 用户显式约束（「只看 2020 年后」「只要 JWST」「不要用模拟数据」） | 逐条进入 `constraints`，原文保留 |
| 缺少关键条件（无对象 / 无时间范围且问题涉及时效） | 写入 `missingInfo`，**不自动补全**，返回澄清请求 |

**复用约束：** 不新增意图识别。`entities` 直接取 `route.targets`；`domain` 由 `intent` 的静态映射表得到；`priorFindings` 只存记忆 ID，正文由 `research-context.recall` 在执行前提供。

**隔离约束：** goal 必须带 `projectId`；无 `projectId` 时不写入项目记忆，只作为临时任务执行。

---

## 3. ResearchPlan

### 3.1 结构（在现有 plan 上**增量**扩展）

```js
// state.plan
{
  // —— 现有字段，保持不变 ——
  template: 'T-A'..'T-G' | 'P3-DAG',
  steps: Step[],
  reason: string,
  postCritic: boolean,
  estimate: { ms, tokens, searches, parallel },
  explanation: { steps: [...] },

  // —— P3 新增（全部可选，缺省视为 1.0）——
  planId: string,               // 'pln_' + ts + rand
  goalId: string | null,
  version: number,              // 从 1 开始；重规划 +1
  objective: string,            // 一句话目标（来自 goal.title）
  completionCriteria: [{
    id, kind: 'task'|'evidence'|'claim'|'conflict'|'calculation',
    target: string,             // stepId / claimType / 主题键
    required: boolean,
    description: string
  }],
  assumptions: string[],
  unresolvedQuestions: string[],
  parentVersion: number | null, // 重规划来源
  changeReason: string | null,  // 重规划原因（受 80 字限制）
  createdAt: string
}
```

### 3.2 ResearchStep

现有 `makeStep` 字段已覆盖大部分需求，P3 只做**语义补齐**（不改结构）：

| 需求字段 | 映射到现有字段 | 说明 |
|---|---|---|
| id | `id` | 必填，唯一 |
| title / description | **新增可选** `title`/`desc` | 目前只有 tool，人类不可读 |
| kind | **新增可选** `kind: 'tool'|'skill'` | 已有 skill 分支依赖此字段 |
| deps | `deps[]` | 已支持 |
| assignedAgent | 由 `TOOL_AGENT` 推导；可选 `agentId` | 不新增调度语义 |
| assignedSkill | `skillId` | 已有 |
| assignedTool | `tool` | 已有 |
| input | `args` | 已有 |
| expectedOutput | **新增可选** `expected` | Schema 名或字段列表，用于输出校验 |
| permissions | 由能力推导，**不新增字段** | 避免出现两套权限声明 |
| budget | 由 `registry.cost` 推导，**不新增字段** | 避免与 budget 双记账 |
| status | `status` | 已支持 |
| critical / optional | `critical`/`optional` | 已支持 |
| retryPolicy | 由 `registry.retry` + `idempotent` 推导 | 已有 |
| completionCriteria | **新增可选** `criteria[]` | 与 plan 级 criteria 可互相引用 |

> 上述新增字段均为可选；`TaskState.validate` 不拒绝未知 step 字段，但 `makeStep` 需显式透传，否则 `state.steps` 重建时丢失。

---

## 4. DAG 结构

### 4.1 图模型

```
G = (V, E)
V = plan.steps
E = { (dep, step) | dep ∈ step.deps }
```

- 节点状态由 `state.steps[i].status` 提供，图本身是**静态拓扑**。
- 计划版本变化时生成新图；旧图保留在 `state.replans[]`。

### 4.2 与现有调度器的关系

调度器已经实现「就绪 / 阻塞 / 下一批」：

- [readySteps](file:///D:/Projects/Astrum/core/orchestrator.js#L36-L55)：依赖全部 `ok`（optional 依赖失败放行）
- [blockedSteps](file:///D:/Projects/Astrum/core/orchestrator.js#L57-L74)：依赖 failed/blocked/aborted/skipped
- [nextBatch](file:///D:/Projects/Astrum/core/orchestrator.js#L94-L110)：compose 串行，其余按 `parallel` 且并发 ≤ min(4, budget.parallel)

P3 **不重写**这三者，只在其前面加一层 `DagValidator`，在其并行判定中补副作用过滤。

---

## 5. DAG 校验设计

### 5.1 校验项与实现方式

| 编号 | 校验 | 方法 | 失败处理 |
|---|---|---|---|
| D-1 | 计划非空、steps 为数组 | 结构检查 | `E_PLAN_EMPTY` |
| D-2 | 步骤数 ≤ 8 | `steps.length` | `E_PLAN_TOO_LARGE` |
| D-3 | step.id 非空且唯一 | Set 去重 | `E_STEP_ID_DUP` |
| D-4 | deps 引用的 id 必须存在 | 先建 id 集合再检查 | `E_DEP_MISSING` |
| D-5 | 不允许自依赖 | `deps.includes(id)` | `E_DEP_SELF` |
| D-6 | 不允许环 | 三色 DFS（复用 planner 的实现） | `E_DEP_CYCLE` |
| D-7 | 必须至少一个 critical | 统计 | `E_NO_CRITICAL` |
| D-8 | 每个非汇点必须可达汇点 | 反向可达性（从出度为 0 的节点反向 BFS） | `E_UNREACHABLE` |
| D-9 | 不允许孤立节点 | 除唯一入口外，每个节点必须有前驱或后继；无条件限制的单步计划除外 | `E_ORPHAN` |
| D-10 | 每个步骤必须有工具或 Skill | `tool || skillId` | `E_NO_CAPABILITY` |
| D-11 | 工具/Skill 必须存在且已发布 | `registry.get` / `skillStore.getPublished` | `E_CAPABILITY_MISSING` |
| D-12 | 参数必须通过 Schema | `registry.validateArgs` | `E_ARGS_INVALID` |
| D-13 | 预算估算不超限 | `plan.estimate` vs `state.budget.limit` | `E_BUDGET_PLAN` |
| D-14 | compose 步骤不得并行 | 现有规则 | `E_COMPOSE_PARALLEL` |
| D-15 | 并行步骤不得有副作用冲突 | 见 §6 | `E_PARALLEL_CONFLICT` |

### 5.2 拓扑排序

```
Kahn 算法：
  indegree[v] = deps.length
  queue = 所有 indegree=0 的节点（按 steps 原顺序，保证稳定）
  while queue:
      v = queue.shift(); order.push(v)
      for each w where v ∈ w.deps: indegree[w]--; if 0 → queue.push(w)
  若 order.length < |V| → 有环（与 D-6 互相印证）
```

输出 `{ order: string[], levels: string[][] }`，`levels` 为可并行层，供报告展示与调试；**执行仍以 `nextBatch` 为准**，避免出现第二套调度。

### 5.3 校验失败处理

1. 不进入执行器；
2. 返回结构化错误 `{ ok:false, errors:[{path, code, reason}] }`；
3. 写入 `state.errors` 与审计（`action='plan.validate'`, `decision='deny'`）；
4. 允许**一次**安全重生成（只允许删减/重排，不允许新增超出模板的工具）；
5. 连续失败 2 次 → 任务停在 `PLAN` 并请求用户处理，不自动循环。

---

## 6. 并行规则

### 6.1 允许并行的必要条件（全部满足）

1. 无依赖关系（`readySteps` 同时就绪）；
2. 两步均 `parallel === true`；
3. 工具 `idempotent === true` **或** `permissions.localOnly === true`；
4. 不写共享输出对象（compose 一律串行）；
5. 不写同一存储域：
   - `paper.search` / `evidence.search` 都写 `state.evidence` → **不并行**；
   - `compare.curate` 读本地、不写库 → 可与 `kepler.*` 并行；
6. 并发数 `≤ min(4, budget.limit.parallel)`；
7. 剩余预算能覆盖**整批**成本之和（当前实现是逐个扣减，P3 改为批前预检）。

### 6.2 副作用分级

| 级别 | 工具示例 | 并行 |
|---|---|---|
| 只读本地计算 | `kepler.ephemeris`、`kepler.visibility`、`kb.lookup`、`fits.parse` | 允许 |
| 只读外部 | `simbad.tap`（idempotent） | 允许（受 searches 预算） |
| 写入共享证据 | `evidence.search`、`paper.search` | 禁止 |
| 输出合成 | `compose.*`、`compare.curate` | 禁止（compose 强制串行） |
| Skill 步骤 | 任意 | 默认禁止并行；仅当 Skill 全部步骤工具均只读且 `idempotent` 才允许 |

### 6.3 不做的事

- 不引入 `Promise.all` 全量并发；
- 不对无 `parallel` 声明的步骤做「优化并行」；
- 不因为「没有依赖」就默认并行。

---

## 7. 计划规模与硬上限

沿用并显式化现有预算（不放大）：

| 限制 | 值 | 来源 |
|---|---|---|
| 单计划最大步骤 | 8 | `planner.validate` line 380 |
| 单批最大并发 | 4 | `nextBatch` line 103 |
| 最大重规划次数 | L1:0 / L2:1 / L3:2 / L4:2 | `BUDGET_LIMITS` |
| 最大追加轮次 | 3（实现上限 2） | `BUDGET_LIMITS.appends` + `researchLoop appendRounds < 2` |
| 最大执行时间 | L1 300ms / L2 3s / L3 15s / L4 120s | `BUDGET_LIMITS.ms` |
| 最大 LLM 调用 | 0/1/2/3 | `BUDGET_LIMITS.llmCalls`（当前未扣减，见 G-07） |
| 最大搜索 | 0/1/2/3 | `BUDGET_LIMITS.searches` |
| 最大重试 | 每步 ≤1（仅幂等 + 可恢复类） | `orchestrator.retryPolicy` |
| 最大恢复次数（P3 新增） | 3 | 新增 `budget.limit.recoveries`（见 P3-05） |
| 调度循环上限 | 200 | `runPlan` guard |

---

## 8. 计划版本与重规划

### 8.1 版本规则

- 首次计划 `version = 1`；
- 每次重规划生成**新计划对象**（不原地改），`version += 1`，`parentVersion` 指向上版；
- 旧计划完整保留在 `state.replans[]`（现有结构已有 `{at, reason, dropped, plan}`）；
- `state.plan` 始终指向当前版本；
- 检查点记录 `planId + planVersion`（新增，见 P3-05）。

### 8.2 重规划触发（只允许三类）

| 触发 | 允许动作 | 上限 |
|---|---|---|
| critical 步骤失败 | 仅重组聚合步骤依赖，复用已成功结果 | `budget.replans` |
| 证据缺口（appendable 类） | 追加 1 条定向检索 | `budget.appends`，≤2 轮 |
| 用户手动调整 | 生成新版本，需重新校验 | 每次用户确认计 1 次 |

### 8.3 重规划禁止项

- 不新增未注册工具；
- 不把已失败步骤改成成功；
- 不清空已成功结果；
- 不扩大预算；
- 不突破 8 步上限（删除 + 新增必须净增 ≤ 0）；
- 超过 `replans` 上限 → 停止并请求用户，不自行继续。

### 8.4 现有 `replan` 的复用边界

[planner.replan](file:///D:/Projects/Astrum/core/planner.js#L492-L540) 只修复 compose/curate 的依赖集合，不生成新模板。P3 第一阶段**沿用**该实现；只有「追加检索」走 `planner.expand`。若后续需要真正的新 DAG 重生成，须作为 P3-08 的待确认项单独立项。

---

## 9. 数据流

```
query ──► Router(route) ──► GoalAdapter ──► goal
                                            │
                     project context (P1 recall) ──► goal.context.priorFindings
                                            │
                                            ▼
                                     Planner(plan v1)
                                            │
                                     DagValidator
                                       ok ──┴── errors ──► 重生成(≤2) ──► 交用户
                                        │
                                        ▼
                                  state.plan / state.steps
                                        │
                                        ▼
                                   Scheduler(Executor)
```

---

## 10. 验收要点（设计层）

1. 无依赖、单步计划：合法且可执行；
2. 线性/多分支/多独立任务：拓扑排序稳定；
3. 缺失依赖、自依赖、环、孤立、不可达、超 8 步：**全部拒绝且给出原因**；
4. 非法并行（compose 并行、两个检索并行）：拒绝或降级串行；
5. 计划版本：重规划后旧计划仍可查，`version` 单调递增；
6. 所有新增字段为可选，旧任务（无 goal/planId）仍能加载与续跑。
