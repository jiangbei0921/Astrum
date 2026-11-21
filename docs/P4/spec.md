# ASTRUM P4 阶段 B 实施规格（spec）

> 状态：待批准。依据 `docs/P4/P4-00 ~ P4-10` 与用户裁定 D-1/D-2。
> 本规格只覆盖阶段 B（持久化/恢复实施），不新增依赖、不新增后端、不做 Event Bus。

## 1. 已核实现状（结论）

| 模块 | 现状 | 关键位置 |
| --- | --- | --- |
| `core/task.js` | `schemaVersion=1`；`BUDGET_LIMITS` L2=1、L3/L4=3；`addCheckpoint` 无 snapshot、无修剪 | `core/task.js:43-48,705-768` |
| `core/task-store.js` | `DB_VER=1` 仅 `tasks`；无 revision/事件/检查点/meta；`save` 返回 id；陈旧写报 `POLICY_DENIED` | `core/task-store.js:18-26,265-311` |
| `core/control.js` | `resume` 只按 `inputHash` 复用；恢复前仅校验 stateHash 非空；pause 不写检查点；中途不落盘 | `core/control.js:176-202,584-794` |
| `core/orchestrator.js` | `runPlan` 无按批持久化钩子 | `core/orchestrator.js:512-614` |
| `core/registry.js` | 已声明 `idempotent/ttlMs/retry` | `core/registry.js:52-183` |
| `core/app.js` | 已有恢复卡片（题面/步数/阶段）与“继续任务” | `core/app.js:8381-8428` |
| `index.html` | 已加载 task/registry/task-store/orchestrator/control/control-bridge | `index.html:499-543` |
| 测试基线 | Node 套件全绿；`p3-contract-test` 断言 L3=3；`p3-progress-test` 断言 limit=3；`p1-resume-test` P1-RSM-007 断言所有 ok 步骤都不重跑 | 见 §5 |

## 2. 已裁定决策

- **D-1**：恢复次数全局每任务 ≤1。`L1=0`，`L2/L3/L4=1`。计数落在 `state.recoveries` 与 `budget.used.recoveries`。
- **D-2**：恢复复用按契约三策略执行：
  - `reuse`：`ok` ∧ `inputHash` 未变 ∧ 工具 `idempotent===true`；
  - `rerun`：`ok` ∧ `idempotent===false`；
  - `validate_then_reuse`：`ttlMs>0` 且 `now - endedAt/provenance.at ≤ ttlMs`；
  - 无幂等声明：若 `inputHash` 未变且 `outputHash/result` 存在则保守 `reuse`，否则 `block`；
  - 非幂等步骤即使本地 `ok` 也重跑，`attempt` 由执行器自增。
  - 允许修正 `p1-resume-test` P1-RSM-007 与 `v1-1-e2e` E5.3 的语义断言（仅限“按工具幂等性区分”）。

## 3. 设计落点

### 3.1 数据库 v2（`core/task-store.js`）

- `DB_VER = 2`；数据库名与命名空间不变。
- store：
  - `tasks` keyPath `id`，记录新增 `revision`、`eventsUpToSeq`；
  - `events` keyPath `['taskId','seq']`；
  - `checkpoints` keyPath `checkpointId`，索引 `byTask`；
  - `meta` keyPath `key`（`schemaVersion=2`、`lastMigration`、`lastSave`）。
- 升级：仅 `createObjectStore`，不重建 `tasks`；失败/`onblocked` → `DB_UPGRADE_FAILED` 并降级，旧 v1 记录保留。
- `save(state, {expectedRevision})`：
  1. 校验项目一致；
  2. 读旧记录，`revision = prev ? (prev.revision||1)+1 : 1`；
  3. `expectedRevision` 不符 → `STALE_WRITE`；有 owner 时 `updatedAt` 回退 → `STALE_WRITE`；
  4. 单 `readwrite` 事务写 `tasks + 新增 events + 全部 checkpoints + meta`；
  5. `oncomplete` 才返回 `rec.id`（保持旧返回类型，兼容 `v1c-test C2.1`）；
  6. `QuotaExceededError` → `QUOTA_EXCEEDED`；其他 abort → `PERSIST_TX_FAILED`。
- 事件冲突：`seq ≤ prev.eventsUpToSeq` 且内容不同 → `EVENT_CONFLICT`。
- 新增接口：`listResumable`、`loadLatestCheckpoint`、`loadCheckpoint`、`listEvents`、`pruneCheckpoints`、`getHealth`。
- `remove(id)` 级联删除事件与检查点（同一事务）。
- 降级：IDB 不可用 → localStorage（事件/检查点回退读 `state`）；两者都不可用 → memory，`getHealth().backend='memory'`。
- `summarize` 增加 `paused`、`waitingApproval`、`recoveries`、`stale`、`lastError`。

### 3.2 TaskState（`core/task.js`）

- `BUDGET_LIMITS.L2/L3/L4.recoveries = 1`（L1 仍 0）。
- `addCheckpoint` 增加 `snapshot` 字段（保存 stateHash 原像），便于完整性复算；旧检查点无 `snapshot` 时跳过复算。
- `addCheckpoint` 每任务最多保留最近 20 个，`version` 改为“上一个检查点 version+1”，避免修剪后版本重置。
- 不改 `schemaVersion`、事件白名单、转移表。

### 3.3 新模块 `core/recovery.js`（纯函数，不读写 DB/不调 LLM/不执行工具）

```js
AstroRecovery.validate({ state, record, checkpoint, principal, project,
  registry, skillLookup, enforcePrincipal, authorized, limit })
  -> { ok, errors: [{ code, detail }] }

AstroRecovery.plan({ state, checkpoint, registry, now })
  -> { steps: [{ id, strategy, reason }], reusable, rerun, blocked }

AstroRecovery.apply({ state, checkpoint, registry, now })
  -> { state, applied: { reuse, rerun, blocked } }
```

校验覆盖 P4-05 的 17 项（无输入时跳过对应项，不误报）：
`NO_PRINCIPAL / PROFILE_MISMATCH / SESSION_CHANGED / CAPABILITY_DENIED /
PROJECT_NOT_ACTIVE / PROJECT_MISMATCH / SCHEMA_INCOMPATIBLE / CHECKPOINT_INVALID /
PLAN_VERSION_MISMATCH / DEP_INVALID / SKILL_REVOKED / SKILL_VERSION_MISMATCH /
TOOL_MISSING / VIEW_ONLY / RECOVERY_LIMIT / BUDGET_EXHAUSTED`。
检查点完整性：ID/作用域一致、`stateHash` 可复算、完成/待办节点不交集、
完成节点在 state 中 `ok` 且 `outputHash` 非空、计划依赖无环/无缺失/无自依赖、
`planId/planVersion` 一致、工具存在、Skill 仍发布、事件位点无越界与断号。

### 3.4 恢复流程（`core/control.js`）

- `load()` 返回 `record`/`revision`（向后兼容，仅增字段）。
- `resume`：
  1. 保留现有授权/会话/项目/终态检查；
  2. 取 `store.loadLatestCheckpoint`（缺失时回退 `state.checkpoints` 末项）；
  3. `AstroRecovery.validate`，失败 → `{verdict:'DENIED', error: errors[0].code, recovery:{errors}}`，不改 state；
  4. `pausedAt=null`，`recoveries+1`，`budget.used.recoveries+1`；
  5. `AstroRecovery.plan/apply` 重置步骤；
  6. 追加 `task.recovered`，写“恢复起点”检查点；
  7. 先保存（带 `expectedRevision`，只消费一次），再 `runPlan`；
  8. 返回增加 `recovery:{attempt,limit,strategies}`，旧字段不变。
- 兼容：无任何检查点的旧任务仍允许恢复（保留 `v1-1-e2e` E5.2）；有检查点则必须通过完整性校验。
- `pause` 成功后写入 `taskStatus:'PAUSED', paused:true` 检查点。
- `run` 与 `resume` 给 `runPlan` 传 `onBatchSettled`：每批结束对 critical 成功步骤写检查点并保存，实现“critical 步后落盘”。

### 3.5 调度钩子（`core/orchestrator.js`）

- `runPlan` 每批 `runBatch` 完成后可选 `await opts.onBatchSettled(state, results, batch)`；异常吞掉，不改调度语义。
- 不修改暂停/审批/取消/重规划行为。

### 3.6 UI 接入

- `index.html` 在 `control.js` 前加载 `core/recovery.js`。
- `core/app.js` 恢复卡片增加：暂停/待审批标记、恢复次数、最后保存时间；恢复失败按 `r.error` 显示具体原因（如 `RECOVERY_LIMIT`、`CHECKPOINT_INVALID`、`TOOL_MISSING`），不再统一“恢复失败”。

## 4. 测试与验收

### 4.1 新增测试（全部 `node tools/<file>.js`，末尾 `RESULT n/n`）

| 文件 | 覆盖 |
| --- | --- |
| `tools/fake-idb.js` | 零依赖内存 IndexedDB 垫片（open/upgrade/tx/put/get/getAll/delete/clear、配额与 abort 注入） |
| `tools/p4-store-test.js` | 初始化、v2 store、读写更新删除、revision、陈旧写、事务回滚、配额、损坏读取、健康信息 |
| `tools/p4-migration-test.js` | v1→v2 保留旧记录、重复初始化、升级失败、派生补齐 |
| `tools/p4-event-test.js` | 事件持久化、顺序/断号、重复幂等、冲突、作用域、索引缺失重建 |
| `tools/p4-checkpoint-test.js` | 生成时机、读取、stateHash 复算、节点/依赖/版本拒绝、清理 |
| `tools/p4-recovery-test.js` | 17 项校验分支、三策略、次数上限、失败保留原因 |
| `tools/p4-idempotency-test.js` | 幂等/非幂等/TTL/缺失声明矩阵 |
| `tools/p4-lifecycle-test.js` | 保留策略、级联删除、配额、多标签页双写 |
| `tools/p4-ui-test.js` | 摘要字段、恢复卡片信息、失败文案映射（Node 静态 + 纯函数校验） |
| `tools/p4-browser-test.js` | 真实 Chrome 刷新恢复、已完成幂等步骤不重跑、无后台执行文案；未运行不计通过 |

### 4.2 既有测试调整（仅语义修正）

- `tools/p3-contract-test.js`：L3 recoveries 3→1；`P3-T3-05`/`P3-T4-02` 期望 1。
- `tools/p3-progress-test.js`：`P3-P4-03` limit 3→1。
- `tools/p1-resume-test.js`：`P1-RSM-007` 改为“幂等步骤 attempt 不变，非幂等步骤 rerun（attempt 增加）”。
- `tools/v1-1-e2e-test.js`：E5.3 使用的 `kb.lookup` 为幂等，保持原断言即可；若失败改为显式按策略断言。

### 4.3 验证命令

```bash
node tools/p4-store-test.js
node tools/p4-migration-test.js
node tools/p4-event-test.js
node tools/p4-checkpoint-test.js
node tools/p4-recovery-test.js
node tools/p4-idempotency-test.js
node tools/p4-lifecycle-test.js
node tools/p4-ui-test.js
node tools/task-test.js
node tools/control-test.js
node tools/p1-resume-test.js
node tools/p3-contract-test.js
node tools/p3-progress-test.js
node tools/p3-resume-test.js
node tools/p3-executor-test.js
node tools/p3-integration-test.js
node tools/v1-1-e2e-test.js --offline
```

## 5. 边界与风险

- 不改 `docs/architecture/15`；`schemaVersion` 仍为 1；事件仍内嵌权威、`events` 只是派生索引。
- 不删除/弱化旧测试；只按 D-1/D-2 修正 3 处数值与 1 处策略语义。
- 无检查点的历史任务允许恢复（兼容 E5.2），有检查点必须通过完整性校验。
- `p4-browser-test.js` 需真实 Chrome；若环境不可用，报告中明确“未运行”，不标记通过。
- 所有 Git 写操作等用户另行指示。

## 6. 需批准项

1. 按 §3 修改 `core/task-store.js`、`core/task.js`、`core/control.js`、`core/orchestrator.js`、`core/app.js`、`index.html`。
2. 新增 `core/recovery.js`、`tools/fake-idb.js` 与 §4.1 的 9 个测试文件。
3. 按 §4.2 修正 4 个既有测试文件中的 4 处断言/语义。
4. 完成后新增 `docs/P4/P4-11-最终实施与验收报告.md`。
