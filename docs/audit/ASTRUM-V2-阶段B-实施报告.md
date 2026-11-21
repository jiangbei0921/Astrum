# ASTRUM V2 阶段 B 实施报告

- 阶段：Stage B — Execution Reliability & State Consistency
- 分支：`main`
- 实施前 HEAD：`5dd6d64 Merge remote-tracking branch 'origin/main'`
- 阶段 A 基线提交：`e1e9797`（B0/B1–B4 初版实现）
- 实施日期：2026-11-21
- 范围：仅 ASTRUM-005 / 006 / 004 / 010，未新增第二套执行系统、服务端队列或 npm 依赖。

## 一、实施前安全核对

实施前后均执行了只读的 `git status --short`、`git branch --show-current`、`git log -1 --oneline`、`git diff --stat`。

- 分支为 `main`，HEAD 为 `5dd6d64`，与阶段 A 记录一致。
- 未执行 `git reset / checkout / clean / stash / commit / push / merge / rebase`，未部署。
- 工作区无用户未提交修改；本轮改动均属于阶段 B。
- 运行既有 provider/pdf 测试会重写 `tools/fixtures/*.json` 的时间与耗时字段；已按 HEAD 内容恢复，最终这些文件无内容差异（仅工作区换行缓存显示 M）。
- 未修改星图、银河纹理、天文计算和与本阶段无关的 UI。

## 二、根因与修改方案

### ASTRUM-005 超时不能真正中止下游请求

**根因**

- `withTimeout` 只停止等待 Promise，超时后没有把取消原因稳定传给下游。
- 任务级取消、步骤级超时、暂停请求、用户取消没有独立分类，无法判断“谁取消了谁”。
- 不支持 `AbortSignal` 的工具没有任何不可中断标记，容易被误认为已取消成功。

**实现**

1. `core/orchestrator.js:189` 重写 `withTimeout(fn, ms, signal, opts)`：
   - 超时先 abort 本次尝试的 `AbortController`，再返回；
   - 下游工具通过第四个运行参数 `rt.signal` 收到信号；
   - 已完成的操作不会被迟到定时器覆盖（`done` 单终态）；
   - 清理定时器与 `abort` 监听器；
   - 失败结果写入 `abortRequested / abortSupported / abortConfirmed`，并给出稳定 `abortCode`。
2. 不支持取消的工具（`spec.abortable === false`）：
   - 超时仍按硬边界返回，标记 `ABORT_UNSUPPORTED`，`abortConfirmed=false`；
   - 暂停/用户取消时继续等待其自然到达安全边界，不提前把任务标记为暂停或取消（`core/orchestrator.js:207-225`）。
3. 取消原因分类（`core/orchestrator.js`）：
   - `TIMEOUT`、`USER_CANCELLED`、`PAUSE_REQUESTED`、`UPSTREAM_ABORTED`、`TOOL_ABORTED`、`ABORT_UNSUPPORTED` 写入 `step.abort.code / step.error.abortCode`；
   - 既有 `errorName`（`TimeoutError / UserCancelled / PauseRequested / AbortError`）保持不变，避免破坏现有错误契约。
4. 执行器在失败/暂停时才写 `step.abort`，成功步骤保持 `abort=null`（`core/orchestrator.js:557` 附近）。

**接口变化**

- `TaskState.step` 新增可选字段 `abort`（`null` 或缺省），旧任务不受影响。
- 错误对象新增 `abortCode / abortRequested / abortSupported / abortConfirmed`，原有 `kind / errorName / retriable / reason` 不变。

### ASTRUM-006 暂停只能在步骤/批次边界生效

**根因**

- `pause()` 直接写 `pausedAt`，UI 立即看到 PAUSED，但在飞请求可能仍在执行。
- 持久化失败时运行循环可能吞错，存在“假暂停”风险。
- 无法区分“暂停请求”和“已经暂停”。

**实现**

1. 状态与事件：
   - `TaskState` 新增可选 `pauseRequestedAt`（`core/task.js:425`）；
   - 新增事件 `task.pause_requested`、`task.persist_failed`（`core/task.js:38`）。
2. `AstroControl.pause()`（`core/control.js:766`）改为两阶段：
   - 先写 `pauseRequestedAt` 和 `task.pause_requested`；
   - 同标签页活跃运行立即 `abortActive(taskId,'pause')`，在飞步骤回 `pending`；
   - 不支持中断的工具继续执行到安全边界；
   - 返回 `PAUSE_REQUESTED`，`paused=false`，并提示“将在安全边界后暂停”。
3. `runPlan` 在 `pausedAt || pauseRequestedAt` 时不再分发新步骤（`core/orchestrator.js:721`）。
4. 暂停确认：
   - `confirmPauseWith()`（`core/control.js:742`）在所有活动步骤进入安全状态后写 `pausedAt`、`task.paused`、检查点并持久化；
   - 只有持久化成功才返回 `PAUSED`；
   - 失败则回滚 `pausedAt`、保留 `pauseRequestedAt`，返回 `PAUSE_PERSIST_FAILED`，并记录 `task.persist_failed`。
5. 取消与暂停抢占：`AbortSignal.reason` 中 `pause` 优先于 `user`，重复取消不会翻转状态。
6. 任务摘要新增 `pauseRequested`，`paused` 仍只取决于已持久化的 `pausedAt`（`core/task-store.js:256`）。

**状态机变化**

- 不新增 Task 阶段枚举，仍使用 `EXECUTE`；暂停是任务内标记而不是新 phase。
- 逻辑生命周期变为 `EXECUTE + pauseRequestedAt → EXECUTE + pausedAt`，与建议的 `PAUSE_REQUESTED → PAUSED` 对应。
- 取消仍沿用既有 `ABORTED`，取消任务不满足 `isResumable`。

### ASTRUM-004 未知幂等性恢复策略不够安全

**根因**

- 未知幂等性只校验结果哈希与工具版本，未校验参数、Skill 版本、执行上下文、Profile、重新授权和持久化完整性。
- 非幂等工具默认直接重跑，可能重复外部副作用。
- “外部操作已发生但本地崩溃”没有明确处理。

**实现**

1. 工具注册新增显式元数据（`core/registry.js:54` 起）：
   - `abortable`：是否接收并响应 `AbortSignal`；
   - `sideEffect`：是否存在不可逆外部副作用。
   - 列表接口同步暴露这两个字段（`core/registry.js:550`）。
2. `core/recovery.js:269` 新增 `validateReuseContext()`，复用前校验：
   - 结果完整；
   - 工具版本；
   - Skill 版本；
   - 执行上下文哈希；
   - Profile；
   - Principal 重新授权；
   - 结果是否已持久化。
3. `core/recovery.js:299` 的 `validateFidelity()` 在上下文校验之外继续复算结果 SHA-256，失败一律不复用。
4. `decide()`（`core/recovery.js:322`）策略：
   - 明确幂等：全部上下文一致才 `reuse`，否则按原因 `rerun`；授权撤销/未持久化进入 `confirm`。
   - 明确非幂等：
     - `sideEffect === false`（只读/可重算）→ `rerun`；
     - `sideEffect === true` 或未声明 → `confirm`，不自动重跑。
   - UNKNOWN：`validate_then_reuse`；验证失败 → `confirm`。
   - 未完成但 `attempt > 0` 且可能有副作用 → `confirm(side_effect_state_unknown)`。
   - 已进入恢复确认的步骤保持确认态，重复恢复不会被翻回重跑。
5. `apply()` 将 `confirm` 步骤置为 `waiting_approval` 并写 `error.kind='recovery_confirmation_required'`，阻止任务被误判完成（`core/recovery.js` apply 段）。
6. `AstroControl.resume()` 把 `profileId / contextHash / authorized / persisted` 传入恢复决策（`core/control.js` resume 段）。
7. 外部调用追踪（本轮补齐 R-05/R-06 的核心缺口）：
   - 执行器为每次尝试生成唯一 `executionId`，并生成稳定 `idempotencyKey`（任务 + 步骤 + 工具 + 版本 + 输入哈希），通过 `rt.executionId / rt.idempotencyKey` 传给 ToolGateway 与工具（`core/orchestrator.js`、`core/tool-gateway.js`）。
   - 工具返回的 `receipt / externalState` 写入 `step.provenance`，与本地结果一起持久化。
   - 恢复时对 `sideEffect === true` 的步骤读取远端回执：
     - 非幂等 + 远端确认成功 → 复用，不重复副作用；
     - 远端明确失败 → 允许重跑；
     - 无回执/远端状态未知 → `confirm`，不再仅凭本地哈希复用；
     - 明确幂等但远端状态为失败 → 不复用。
   - 该校验位于 `decide()`，外部直接调用 `recovery.plan/apply/decide` 同样不能绕过（V2-EXT-11）。

**数据结构变化**

- 工具元数据 `abortable / sideEffect`（默认分别按“未声明视为可协作 / 有副作用风险”处理）。
- 步骤可进入 `waiting_approval`（该状态原本已存在，用于审批）。
- 恢复策略新增 `confirm` 分组；`plan()` 返回 `confirm` 列表。

### ASTRUM-010 多标签页并发写缺少冲突保护

**根因**

- 保存流程在事务外 `rawGet`，再开启写事务，存在 TOCTOU 丢更新。
- 主要依赖 `updatedAt` 字符串比较，不能保证原子冲突检测。

**实现**

1. `core/task-store.js:515` 新增 `txSaveGuarded()`：
   - 在同一个 `readwrite` 事务中 `get → 比较 revision → put`；
   - 冲突时 abort 事务并抛 `STALE_WRITE`；
   - 事件、检查点、meta 与任务记录同事务写入；
   - 事务中断统一映射为既有 `PERSIST_TX_FAILED`，配额为 `QUOTA_EXCEEDED`。
2. `prepareRecord()`（`core/task-store.js:461`）集中做 owner/project/`expectedRevision`/事件 seq 指纹校验。
3. `saveLocal()`（`core/task-store.js:563`）在 `init()` 后的同一同步段完成读-比较-写，避免 localStorage/memory 回退中出现 await 交错。
4. 保留旧调用方兼容：只有在未提供 `expectedRevision` 时才用 `updatedAt` 兜底；新调用方只信 revision。
5. 历史记录无 `revision` 时按 1 处理；旧格式状态缺少 `pauseRequestedAt / abort` 时可正常读写。
6. 未引入 BroadcastChannel 作为强依赖；一致性完全由 IndexedDB 事务保证。

## 三、修改文件

| 文件 | 内容 |
|---|---|
| `core/orchestrator.js` | withTimeout 真取消、abort 三字段、取消分类、不支持取消的安全边界、暂停请求不再分发、provenance 上下文/Profile、executionId/idempotencyKey/外部回执 |
| `core/control.js` | 暂停两阶段、持久化确认/回滚、取消落盘失败上报、恢复上下文传入、resume 清除暂停标记 |
| `core/recovery.js` | 复用上下文校验、UNKNOWN 验证失败转人工确认、非幂等副作用保护、外部回执校验、confirm 策略 |
| `core/tool-gateway.js` | 向工具透传 executionId/idempotencyKey |
| `core/task.js` | `pauseRequestedAt`、`step.abort`、新事件类型与校验 |
| `core/task-store.js` | 原子 compare-and-write、事务内派生写入、本地回退原子段、摘要 `pauseRequested` |
| `core/registry.js` | 工具 `abortable / sideEffect` 声明与列表暴露 |
| `tools/fake-idb.js` | 模拟真实 IndexedDB readwrite 串行隔离 |
| `tools/p4-idempotency-test.js` | 适配只读工具 `sideEffect:false`，未知凭证失败改为人工确认 |
| `tools/v2-recovery-idempotency-test.js` | 适配 confirm 语义并新增副作用用例 |
| `tools/v2-timeout-abort-test.js` | 新增：超时/取消/竞态/不可中断边界 |
| `tools/v2-task-pause-resume-test.js` | 新增：暂停两阶段/安全边界/持久化失败/刷新恢复 |
| `tools/v2-idempotency-recovery-test.js` | 新增：上下文、Profile、授权、副作用、崩溃场景 |
| `tools/v2-multi-tab-concurrency-test.js` | 新增：并发写、事件并写、事务中断、历史兼容 |
| `tools/v2-b-joint-test.js` | 新增：跨模块联合测试 |
| `tools/v2-external-call-recovery-test.js` | 新增：外部调用 executionId/idempotencyKey、回执持久化、远端成功/失败/未知恢复 |

## 四、接口与兼容性

- 不新增 Task phase，不改变合法迁移表。
- 新增字段全部为可选，旧任务可读、可写、可恢复。
- 错误对象仅新增字段，不改既有 `errorName` 含义。
- `save(state, {expectedRevision})` 保持原签名；不传时保留旧 `updatedAt` 兜底。
- 恢复策略新增 `confirm`，属于对旧 `block` 的收紧：未知凭证失败从“阻塞但不改步骤状态”改为“等待人工确认”，避免任务静默完成。
- 工具注册新增字段，不重构注册表；未声明工具按“不支持取消 + 有副作用风险”保守处理。
- 未修改 Security、Principal、Profile 分库和 ToolGateway 授权链。

## 五、风险与回滚

**已知风险**：见《ASTRUM-V2-阶段B-剩余风险清单.md》。重点包括：不接收 signal 的第三方工具仍可能继续执行到超时、localStorage 回退不具备跨标签页原子 CAS、恢复人工确认目前只有状态没有专门审批 UI/Action。

**回滚方案**

1. 本阶段未提交；回滚仅需按上表反向撤销本轮源码与测试改动。
2. 数据层新增字段均为可选：回滚代码后，旧代码读取含 `pauseRequestedAt / abort / pauseRequested` 的记录仍能工作（未知字段被忽略）。
3. 若已产生 `waiting_approval` 步骤，回滚后应按既有审批/人工流程处理，不要直接改回 `ok`。
4. `tools/fake-idb.js` 的串行隔离只影响测试；回滚后测试仍可运行，但并发测试将失去真实隔离语义。
5. 经用户批准后，可用一次正常提交 + `git revert` 回滚；本阶段未执行任何自动提交或部署。
