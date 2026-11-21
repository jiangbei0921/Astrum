# ASTRUM V2 阶段 B 剩余风险清单

本清单保留所有未彻底解决的问题，不因验收而删除。

## R-01 不接收 AbortSignal 的工具仍可能在超时后继续执行

- 事实：`evidence.search`、`paper.search`、`llm.compose`、`kepler.*`、`kb.lookup`、`fits.parse`、`compare.curate`、`compose.*` 均为 `abortable:false`。
- 影响：超时/取消只能停止等待，底层同步计算或未接收 signal 的检索可能继续，直到自然结束或由浏览器/网络层终止；可能继续消耗配额。
- 已做：记录 `ABORT_UNSUPPORTED`，`abortConfirmed=false`；暂停时等待安全边界；依赖步骤不启动。
- 未做：给 `Sources.searchMany`、compose adapter、paper 全文链路补齐 signal 贯穿。
- 责任边界：这是工具契约限制，不是编排层可伪造解决的问题。

## R-02 暂停不可中断工具可能长时间等待

- 事实：`abortable:false` 工具在暂停时不会立即回队，`runPlan` 会等待其自然完成。
- 影响：用户看到 `PAUSE_REQUESTED` 后，可能长时间不进入 `PAUSED`；若工具永不返回，只能等 `timeoutMs` 硬超时。
- 已做：UI 返回明确提示“将在安全边界后暂停”；不提前写 `pausedAt`。
- 未做：无强制终止同步计算/第三方请求的能力。

## R-03 恢复人工确认只有状态，没有完整审批动作

- 事实：`confirm` 将步骤置为 `waiting_approval` 并写 `error.kind='recovery_confirmation_required'`，`resume` 会保持该状态。
- 影响：系统不会自动重跑或复用，但当前没有专门的“确认已核验 / 授权重跑 / 放弃”入口来清除该状态；用户可能只能通过既有审批或人工处理。
- 已做：阻止任务静默完成，错误语义可追踪。
- 未做：新增恢复确认 API/UI 会扩大本阶段范围，未实施。

## R-04 localStorage/memory 回退不具备跨标签页原子 CAS

- 事实：IDB 不可用时回退 localStorage/memory。同一标签页内读-比较-写是同步原子段，但两个标签页各有独立 JS 上下文，无法在 localStorage 上实现真正的 compare-and-swap。
- 影响：极端降级环境下仍可能出现丢更新。
- 已做：记录健康信息；IDB 为默认后端；回退路径保持可读可写。
- 未做：未引入 Web Locks 或额外存储方案（会增加依赖/兼容性复杂度）。

## R-05 非幂等/外部副作用的判定仍依赖工具声明

- 事实：`sideEffect` 由注册表声明；未声明按“有副作用风险”保守处理。
- 影响：若新工具错误声明 `sideEffect:false`，恢复时会被允许重跑；运行时无法自动推断第三方写操作是否真正幂等。
- 已做：未声明默认进入人工确认；只读现有工具显式声明 false；外部调用新增 `executionId / idempotencyKey / receipt / externalState` 追踪（`v2-external-call-recovery-test` 12/12）。
- 剩余：声明正确性仍由工具作者负责，需要后续注册表评审/契约测试。

## R-06 远端 exactly-once 仍无法保证

- 事实：当前仓库没有 HTTP POST/外部写工具；`idempotencyKey` 是传递契约，第三方服务不一定识别。
- 影响：未来接入外部写工具时，最多只能声明 at-least-once 或 at-most-once；远端没有回执时只能进入人工确认。
- 已做：本地已建立稳定幂等键、唯一执行 ID、回执/远端状态持久化；非幂等外部调用在远端确认成功时复用、明确失败时重跑、未知时确认。
- 剩余：未与具体第三方 API 协商幂等键语义，也没有远端查询/对账接口。

## R-06b 外部回执是工具自报，缺少独立核验

- 事实：`receipt / externalState` 由工具结果写入 `provenance`，恢复层无法独立访问第三方系统。
- 影响：工具若错误上报 `succeeded`，恢复会复用；若错误上报 `failed`，恢复会重跑。
- 已做：回执与结果一并持久化，校验位于 `decide()`，直接调用无法绕过。
- 剩余：后续需要为具体外部系统增加独立的状态查询/签名回执校验。

## R-07 阶段 B 暂停流程未做浏览器端到端点击验收

- 事实：当前 UI 没有把暂停控件接到 `AstroControl.pause()`；本阶段未修改无关 UI。
- 影响：`PAUSE_REQUESTED → PAUSED` 的 UI 呈现只通过状态字段与单元/联合测试验证，未做真实浏览器点击。
- 已做：`task-store.summarize()` 暴露 `paused / pauseRequested / waitingApproval`，与真实状态同源；`p4-browser-test.js` 覆盖刷新/恢复。
- 未做：新增暂停按钮和浏览器 E2E；会超出“不修改无关 UI”的约束。

## R-08 跨标签页暂停请求的收尾依赖运行页

- 事实：其他标签页运行中时，`pause()` 只持久化 `pauseRequestedAt`，由持有活跃运行的标签页在批次边界确认 `pausedAt`。
- 影响：若运行页在确认前崩溃/关闭，任务会停留在 `pauseRequestedAt` 状态；`resume` 会清除该请求并继续。
- 已做：请求态与完成态可区分；恢复不会重复执行已完成步骤。
- 未做：没有 BroadcastChannel 级联唤醒/超时收尾机制。

## R-09 检查点裁剪在事务提交后执行

- 事实：任务/事件/检查点同事务写入，`pruneCheckpoints` 在提交后单独执行。
- 影响：裁剪前崩溃会留下多余检查点，不影响权威任务记录与恢复正确性。
- 已做：歧义只存在于派生数据数量，不影响一致性。

## R-10 旧调用方仍可使用 updatedAt 兜底

- 事实：未传 `expectedRevision` 的旧调用方保留 `updatedAt` 字符串比较。
- 影响：时钟回拨或同毫秒写入仍可能漏检；新链路（Control/run/resume）全部使用 `expectedRevision`。
- 已做：旧接口兼容，P4S-10 保留；P4S-09 验证 revision 主路径。
- 未做：强制所有外部调用方升级会破坏兼容性。

## R-11 恢复确认状态使用既有 `waiting_approval`

- 事实：没有新增步骤状态，复用既有审批状态并增加 `error.kind` 区分。
- 影响：既有审批 UI 可能把恢复确认当作普通审批展示；语义靠 `error.kind` 区分。
- 已做：错误码稳定，任务不会被误判完成。
- 未做：新增独立状态需要迁移分析与 UI 改造，本阶段未做。

## R-12 历史任务的无哈希/短哈希结果不会复用

- 事实：UNKNOWN 步骤必须复算 SHA-256；旧记录若没有完整哈希会进入人工确认。
- 影响：旧任务恢复时可能需要人工确认，而不是静默复用；这是安全性收紧。
- 已做：明确错误原因 `unknown_idempotency_*`。
- 未做：不做“猜测式”迁移哈希，避免把不可信结果标记为已验证。
