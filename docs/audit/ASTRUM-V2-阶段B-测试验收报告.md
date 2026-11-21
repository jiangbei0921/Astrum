# ASTRUM V2 阶段 B 测试验收报告

## 一、测试环境

- 操作系统：Windows
- Node.js：v24.19.0
- 浏览器实测：本机 Chrome（`tools/p4-browser-test.js` 自动探测）
- 仓库：`D:\Projects\Astrum`
- 分支/HEAD：`main` / `5dd6d64`
- 存储后端：IndexedDB（fake-idb 单元测试 + 真实 Chrome 刷新测试）；localStorage/memory 回退由 P4S-31/32/33 覆盖
- 网络：未配置 `ASTRUM_LIVE_API_KEY`，真实 Provider 用例按设计标记 `BLOCKED_API_KEY`

## 二、测试命令与结果

### 2.1 阶段 A 基线回放

| 命令 | 结果 | 说明 |
|---|---|---|
| `node tools/selftest.js` | **157/157 PASS** | CSP 违规 0 |
| `node tools/p0-security-test.js` | **38/38 PASS** | 授权、Profile 隔离、ToolGateway |
| `node tools/p0-03-test.js` | **53/53 PASS** | 旧 checks/sections 契约 |
| `node tools/p4-browser-test.js` | **13/13 PASS** | 真实 Chrome 刷新恢复，IndexedDB 后端 |
| `node tools/v1-5-perf-test.js` | 基线输出 | 无 PASS/FAIL 门槛，记录性能 |
| `node tools/v2-sky-01-test.js` | **52/52 PASS** | 星图图层/模型 |
| `node tools/v2-sky-2b-test.js` | **31/31 PASS** | L1 星场 |
| `node tools/v2-sky-2c-test.js` | **24/24 PASS** | 银河背景 |
| `node tools/visual-stars-test.js` | **16/16 PASS** | 恒星视觉参数 |
| `node tools/visual-stars-quality-test.js` | **36/36 PASS** | 星表质量与真实数据 |

性能基线（本地 Node，非验收门槛）：

- cold load 113.12 ms
- router p95 1.09 ms
- planner p95 0.98 ms
- controlLocal avg 27.02 ms
- taskStore200 156.56 ms
- heapUsed 15.38 MB

### 2.2 全量非浏览器套件

对 `tools/*test*.js` 中除 `*browser*`、`v1-5-longrun-test.js`、`v1-5-perf-test.js` 外的套件逐一执行：

- 套件总数：**117**
- PASS：**114**
- FAIL：**0**
- BLOCKED：**3**（均为缺少真实 Provider Key，非代码回归）
  - `v1-6-provider-test.js` → `BLOCKED_API_KEY`
  - `v1-9-provider-test.js` → `RESULT 21/21`，真实调用 `BLOCKED_API_KEY`
  - `v1-9-real-provider-integration-test.js` → `BLOCKED_API_KEY`
- NOT RUN：0

### 2.3 新增独立测试集合

| 测试文件 | 覆盖 | 结果 |
|---|---|---|
| `tools/v2-timeout-abort-test.js` | 正常完成、超时 abort、完成不误判、用户取消、超时后不启动下一步、并行取消、重复取消、已完成不误标、不可中断边界、完成/超时竞态、取消/超时竞态、上游取消+下游错误、无未处理 rejection | **17/17 PASS** |
| `tools/v2-task-pause-resume-test.js` | 空闲暂停、在飞暂停、不可中断步骤安全边界、并行暂停、暂停请求不分发新步骤、持久化失败不伪造 PAUSED、刷新后恢复、不重跑已完成、取消后不可恢复、暂停/取消抢占、重复暂停 | **21/21 PASS** |
| `tools/v2-idempotency-recovery-test.js` | 上下文一致复用、参数/工具版本/Skill 版本/Profile/上下文变化不复用、授权撤销、未持久化、哈希不符、有副作用不自动重跑、崩溃后外部状态未知、未开始可重跑、重复恢复稳定、结果不完整、plan/apply 一致 | **16/16 PASS** |
| `tools/v2-multi-tab-concurrency-test.js` | 单写、并发同修订恰一成功、首次并发、并发事件追加、冲突后重读重放、不同任务并发、不同 Profile 隔离、事务中断无部分写、DB 版本、历史无 revision、导入旧格式、updatedAt 兜底 | **17/17 PASS** |
| `tools/v2-b-joint-test.js` | 超时+暂停、暂停+多标签、恢复+幂等、取消+持久化失败、运行中暂停两阶段 | **12/12 PASS** |
| `tools/v2-external-call-recovery-test.js` | executionId 唯一、idempotencyKey 跨重试稳定、回执持久化、非幂等外部调用成功复用/失败重跑/未知确认、UNKNOWN 外部回执校验、直接 decide 不绕过 | **12/12 PASS** |

新增合计：**95/95 PASS**。

### 2.4 既有 V2/P3/P4 专项套件

| 命令 | 结果 |
|---|---|
| `node tools/p3-executor-test.js` | **17/17 PASS** |
| `node tools/v2-pause-test.js` | **14/14 PASS** |
| `node tools/p4-idempotency-test.js` | **18/18 PASS** |
| `node tools/v2-recovery-idempotency-test.js` | **11/11 PASS** |
| `node tools/v2-occ-test.js` | **8/8 PASS** |
| `node tools/p4-store-test.js` | **34/34 PASS** |

## 三、故障注入结果

- 超时：可控慢工具记录到 `AbortSignal`，收到 abort 后执行清理并返回可识别终止结果（V2-ABORT-03）。
- 不可中断工具：`abortable:false`，超时记录 `ABORT_UNSUPPORTED`、`abortConfirmed=false`（V2-ABORT-13）。
- 暂停：不接收 signal 的工具继续执行到安全边界，完成后才允许 PAUSED（V2-PR-08/09）。
- 持久化失败：`store.save` 注入 `PERSIST_TX_FAILED`，暂停返回 `PAUSE_PERSIST_FAILED`，内存不保留 `pausedAt`（V2-PR-15/16）；取消路径返回 `persistFailed=true` 且不伪造已落盘（V2-JOINT-08/09）。
- 事务中断：`abortNextTransaction()` 注入，revision 不变、无部分写入（V2-MT-10/11）。
- 配额：沿用 P4S-20/21，`QUOTA_EXCEEDED` 且不删除当前任务。
- 外部调用：注入 `receipt / externalState`，验证成功复用、失败重跑、无回执确认；并验证重试复用同一 `idempotencyKey`、`executionId` 每次唯一（V2-EXT-01~12）。

## 四、并发测试结果

- 两个标签页同时基于 revision 1 保存：恰一个成功，另一个 `STALE_WRITE`，最终 revision 只 +1（V2-MT-02/03/04）。
- 首次并发保存（expectedRevision 0）：仅一个成功（V2-MT-05）。
- 并发追加事件：单写成功；失败方重读后重放成功，seq 单调（V2-MT-06/07）。
- 不同 Task、不同 Profile 并发：均成功且相互隔离（V2-MT-08/09）。
- 暂停与恢复跨标签：旧修订恢复被拒绝，重读后仅一个终态（V2-JOINT-03/04）。
- 页面关闭等价注入：事务中断无部分写入（V2-MT-10/11）。

## 五、浏览器实测结果

`node tools/p4-browser-test.js` 使用真实 Chrome + `file://`：

- 真实后端为 IndexedDB
- 刷新后任务仍在列表、可恢复、检查点可读
- 恢复入口出现，恢复后幂等步骤不重跑，待办步骤执行
- 恢复后进入终态，不再可恢复，恢复事件已记录

13/13 PASS。

**未覆盖**：阶段 B 新增的暂停按钮端到端 UI 点击流程。原因：当前 UI 没有把暂停控件接到 `AstroControl.pause()`；本阶段未修改无关 UI。UI 显示一致性通过 `task-store.summarize()` 的 `paused / pauseRequested / waitingApproval` 字段与真实状态同源来保证，未做浏览器点击验收。

## 六、原有回归与解释

- 原有测试未删除、未降低断言。
- `p4-idempotency-test.js` 与 `v2-recovery-idempotency-test.js` 的预期由“未知凭证失败 → block”收紧为“→ confirm/等待人工确认”，属于安全性提升，非放宽。
- 3 个 Provider 套件因缺少本机 Key 标记 BLOCKED，与阶段 B 改动无关。
- `i18n-scan.js --max=0`：UI 0 条，基线检查通过（exit 0）。

## 七、统计汇总

| 类别 | PASS | FAIL | BLOCKED | NOT RUN |
|---|---:|---:|---:|---:|
| 阶段 A 必跑基线 | 157 + 38 + 53 + 13 + 52 + 31 + 24 + 16 + 36 | 0 | 0 | 0 |
| 全量非浏览器套件 | 114 个套件 | 0 | 3 | 0 |
| 新增独立测试 | 95 | 0 | 0 | 0 |
| 既有 V2/P3/P4 专项 | 102 | 0 | 0 | 0 |

> 注：不同套件断言数不可简单相加；“既有专项 102”为 17+14+18+11+8+34。
