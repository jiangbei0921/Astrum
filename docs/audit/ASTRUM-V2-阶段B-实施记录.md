# ASTRUM V2 阶段 B 实施记录

| 项 | 内容 |
|---|---|
| 阶段 | B（执行可靠性） |
| 基线 | `bb8830a` |
| 完成日期 | 2026-11-21 |
| 范围 | ASTRUM-025（CI 英文残留）、ASTRUM-005、ASTRUM-006、ASTRUM-004、ASTRUM-010 |
| Git | 未提交；9 个修改文件 + 4 个新增文件（含本记录与 3 个测试） |
| 结论 | 全部批次完成；非浏览器套件与 P4 Browser 全绿；等待阶段 C 批准 |

---

## 1. 变更文件

| 文件 | 变更 |
|---|---|
| `core/app.js` | 语言切换/刷新时重算配置下拉与「已存 N 套」 |
| `core/i18n.en-extra.js` | 补 30 条界面英文词条及数据核验说明 |
| `core/project-ui.js` | 动态节点创建时取译，避免重建后回退中文 |
| `core/orchestrator.js` | 取消原因语义、暂停回队、暂停批次返回、TimeoutError |
| `core/skill-runtime.js` | Skill 步骤取消原因映射；暂停按 cancelled 收尾 |
| `core/control.js` | 运行期 AbortController、pause 立即中止、全保存携带 expectedRevision |
| `core/recovery.js` | 未知幂等性复用前的凭证校验（哈希/版本） |
| `core/task.js` | 事件白名单新增 `step.paused` |
| `tools/p3-executor-test.js` | 新增 TimeoutError/UserCancelled/PauseRequested 断言 |
| `tools/p4-idempotency-test.js` | 未知幂等契约更新为「凭证有效才复用」 |
| `tools/v2-pause-test.js`（新） | 14 条暂停/取消断言 |
| `tools/v2-recovery-idempotency-test.js`（新） | 10 条幂等恢复断言 |
| `tools/v2-occ-test.js`（新） | 8 条并发写断言 |

---

## 2. 逐项实施

### 2.1 ASTRUM-025（新增 P1）：CI 英文残留

- 将 30 条界面文案补入 `core/i18n.en-extra.js`（技能库、研究课题、星图图层、数据核验、导出计划等）。
- `core/project-ui.js` 的动态提示改为创建时 `I18N.t()`。
- `core/app.js` 的 `refreshPanels()` 重新渲染配置下拉与「已存 N 套」，修复运行中切换语言不刷新的问题。
- 结果：`node tools/i18n-scan.js --quiet --max=0` → **界面 0 条 / 内容 20 / 用户 1，exit 0**。
- 未放宽阈值；内容与用户两类按扫描器既有分类不参与门禁。

### 2.2 ASTRUM-005：超时/取消/暂停原因

- `withTimeout` 超时返回 `errorName:'TimeoutError'`；外部取消按 `signal.reason` 映射：
  - `pause` → `PauseRequested`
  - `user`/`cancel` → `UserCancelled`
  - 其它 → `AbortError`
- `pendingAbort` 贯通 `normalizeResult` → `classifyFailure` → `step.error`。
- `step.error` 增加 `errorName`、`reason`；超时步骤可被 UI/测试区分。
- 保留 `0cf5cd4` 的 AbortController 实现，不重写。
- 新增 `P3-X4-02b`、`P3-X4-03/04/05/06`。

### 2.3 ASTRUM-006：协作式暂停

- `Control` 增加进程内 `activeRuns` 注册表：
  - `run` / `resume` 创建 `AbortController` 并传入 `runPlan`；
  - `pause()` 在写入 `pausedAt` 后调用 `abortActive(taskId,'pause')`。
- `orchestrator`：
  - 暂停命中在飞步骤时，步骤回到 `pending`，清空 `startedAt/endedAt/error`，记录 `step.paused`；
  - 批次出现暂停结果时，先调用 `onBatchSettled` 落盘检查点，再返回 `PAUSED`；
  - 暂停判断优先于 `signal.aborted`，避免被当作取消。
- `skill-runtime`：暂停以 `cancelled` 收尾，由编排层回队。
- `Control` 在 `PAUSED` 返回路径释放控制器；恢复路径同样注册控制器，恢复中可再次暂停。
- `pause()` 检测到同标签页活跃运行时，直接修改该运行的内存状态并交由它统一落盘，避免 B4 的 `expectedRevision` 与独立暂停保存产生假冲突。
- 跨标签页暂停仍以 `pausedAt` 为安全边界（无共享控制器），UI 行为与文档一致。

### 2.4 ASTRUM-004：未知幂等性

- 凭证校验下沉到 `decide()`，`plan()`、`apply()` 与任何外部直接调用都走同一策略：
  - 重算 `outputHash`，必须与记录一致；
  - `provenance.version` 与当前工具版本一致；
  - 一致 → `reuse`（reason `unknown_idempotent_verified`）；
  - 不一致/缺失 → `block`，不 reset、不重跑。
- 移除 `apply()` 的 `validateUnknown` opt-in 分支，避免外部调用绕过校验。
- `p4-idempotency` 的「未知工具保守复用」契约同步更新为「凭证有效才复用」。
- 新增/更新 10 条测试：一致复用、哈希不符阻塞、版本变化阻塞、显式幂等复用、显式非幂等重跑、无哈希阻塞、直接 `decide()` 校验、plan 视图。

### 2.5 ASTRUM-010：多标签页并发

- `Control.run`：`expectedRev` 从 0 开始，所有保存携带 `expectedRevision` 并递增。
- `Control.resume`：`expectedRev = loaded.revision`，初始保存成功后递增，后续批次保存继续携带。
- 任何旧修订保存抛出 `STALE_WRITE`，不会覆盖最新记录。
- 未传 `expectedRevision` 的旧调用方仍走兼容路径（保留 `updatedAt` 兜底）。
- 新增 8 条测试：首存、同修订成功、旧修订拒绝、内容未被覆盖、刷新后可写、重复恢复仅一次成功、旧调用兼容。

---

## 3. 测试结果

### 3.1 新增测试

| 套件 | 结果 |
|---|---|
| `tools/v2-pause-test.js` | **14/14** |
| `tools/v2-recovery-idempotency-test.js` | **10/10** |
| `tools/v2-occ-test.js` | **8/8** |
| `tools/p3-executor-test.js` | **17/17** |

### 3.2 全量非浏览器回归

P0–P4、V1、V2、Control、B8、Visual 共 **94 个套件全部通过**，关键结果：

- `selftest` 157/157
- `p0-security` 38/38；`p0-03` 53/53；`p0-migration` 10/10
- `p1-*` 51/33/46/61/40/42
- `p2-*` 46/81/20/56/40/39/54/38
- `p3-*` 14/22/17/9/28/11/9
- `p4-*` 23/20/18/18/19/28/34/19
- `v2-sky` 52/31/24/20/12/24/23
- `visual-stars` 16/16；`quality` 36/36
- `i18n-scan --quiet --max=0` exit 0

### 3.3 浏览器与压力

| 套件 | 结果 |
|---|---|
| `p4-browser-test.js` | **13/13** |
| `v1-5-idb-stress-test.js` | **7/7**；1000 写 2110 ms，删 500 1688 ms |
| `v1-5-perf-test.js` | PASS（冷启动 206.99 ms，heap 19.92 MB） |

### 3.4 环境性失败复核

并行运行时以下套件曾失败，单独重跑全部通过，判定为网络/Chrome 并发干扰：

- `v1-2-deploy` 21/21
- `v1-3-paper-fulltext` 28/28
- `v1-4-pages` 32/32
- `v1-5-idb-stress` 7/7

`v1-6-provider`、`v1-9-real-provider` 为预期的 `BLOCKED_API_KEY`；`v1-9-real-pdf` 为 `BLOCKED_SAMPLE 0`，均非回归。

---

## 4. 验收对照

| 任务书验收项 | 结果 |
|---|---|
| 超时/取消可区分 TimeoutError、AbortError、UserCancelled、PauseRequested | 通过 |
| 超时后 fetch 确实 abort、不启动后续步骤 | 通过（P3-X4-01/03） |
| 暂停后不再启动新步骤、在飞可取消并回队 | 通过（V2-PAUSE-03~08） |
| 暂停/取消/超时状态与事件、检查点一致 | 通过 |
| 未知幂等不盲目复用 | 通过（V2-IDEM-02/04） |
| 旧修订不覆盖新状态 | 通过（V2-OCC-03/04/07） |
| CI 英文残留门禁恢复 | 通过 |

---

## 5. 剩余风险与说明

1. **ASTRUM-004 外部调用已收敛**：凭证校验在 `decide()` 内，外部直接调用不再绕过；无凭证的未知幂等步骤会 `block`，需要调用方处理该策略。
2. **跨标签页暂停**：无共享 AbortController，仍在批次边界暂停；同标签页已立即中止。
3. **`updatedAt` 兜底保留**：仅为未传 `expectedRevision` 的旧调用方兼容；Control 全路径已使用 revision。
4. **新增事件 `step.paused`**：已加入白名单；旧数据读取不受影响。
5. **CI 英文内容类 20 条**：不参与当前门禁，但英文报告中仍可能出现中文正文/标签；后续 E 阶段统一处理。

---

## 6. Git 状态

- 未执行 `git add/commit/push`。
- `git diff --stat`：10 个修改文件，+380/−60。
- 新增未跟踪：本记录、`v2-pause-test.js`、`v2-recovery-idempotency-test.js`、`v2-occ-test.js`。
- 阶段 A 计划文档保持未跟踪。

**阶段 B 结束，等待批准后再进入阶段 C（行星外部基准、Claim origin）。**
