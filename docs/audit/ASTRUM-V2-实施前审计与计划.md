# ASTRUM V2 实施前审计与计划

| 项 | 内容 |
|---|---|
| 阶段 | A（只读审计与完整实施计划） |
| 项目 | `D:\Projects\Astrum` |
| 分支 | `main` |
| 当前 HEAD | `bb8830a`（`docs(audit): 添加 ASTRUM 全项目独立审计报告`） |
| 任务书审计基线 | `bb2e497`（`feat(p4): ...`） |
| 审计日期 | 2026-11-21 |
| 本轮改动 | 仅新增本文件；未修改代码/测试/配置/既有文档；未执行任何 Git 写操作 |
| 结论 | 建议批准，但先修 **1 项新增 P1（CI 英文残留门禁）**，并按 B→C→D→E 分批实施 |

---

## 1. 结论摘要

1. **21 项复核结果**：1 项已修复（ASTRUM-005）、1 项不成立/误报（ASTRUM-016）、19 项仍存在（其中 ASTRUM-007 为设计边界，不是代码缺陷）。
2. **新增 1 项 P1**：`node tools/i18n-scan.js --quiet --max=0` 当前 **exit=1**（界面 30 / 内容 20 / 用户 1，共 51 条命中），CI 的「英文残留基线」步骤仍然红灯。这是当前唯一阻断 CI 全绿的问题。
3. **基线测试**：任务书列出的 10 个套件全部真实运行；除 i18n 门禁外全部通过（selftest 157/157、P0-03 53/53、P4 Browser 13/13、V2 Sky 52/31/24、Visual Stars 16/16、Quality 36/36）。
4. **仓库状态与任务书不一致**：任务书假设的「17 个已修改文件 + 未提交审计报告」已不存在。`bb2e497` 之上已有两个提交并推送，工作区干净。阶段 B 必须以 `bb8830a` 为基线，**不得尝试恢复或覆盖**已提交内容。
5. **建议实施顺序**：先恢复 CI（新增 P1），再做 B 阶段执行可靠性（005 复验/006/004/010），随后 C（008/009）、D（安全纵深）、E（质量与产品表述）。CSP 样式改造和 IndexedDB 迁移风险最高，放在各自阶段最后。
6. **不建议在阶段 B 重新实现 005**：超时 abort 已在 `0cf5cd4` 落地并有回归测试；剩余工作是补齐「暂停/取消/超时」三类原因区分、全工具故障注入与浏览器级验证。

---

## 2. 当前仓库状态

### 2.1 Git 实测

| 检查 | 结果 |
|---|---|
| `git status --short` | 空（本轮开始前工作区干净） |
| `git branch --show-current` | `main` |
| `git log -1 --oneline` | `bb8830a docs(audit): 添加 ASTRUM 全项目独立审计报告` |
| `git log -5 --oneline` | `bb8830a`、`0cf5cd4 fix(audit): 修复自测门禁、星表岁差与超时中止`、`bb2e497 feat(p4)...`、`ba95e6c`、`13b1460` |
| `git diff --stat` | 空 |
| 远端 | `origin/main = bb8830a`（已同步） |

### 2.2 与任务书假设的差异表

| 任务书假设 | 当前实际 | 处理 |
|---|---|---|
| 审计基线 `bb2e497` | `bb2e497` 之后已有 `0cf5cd4`、`bb8830a` | 以 `bb8830a` 为 V2 起点 |
| 17 个已修改文件 | 0 个未提交修改；修复已提交 | 不恢复、不覆盖；阶段 B 前再次 `git status` |
| `docs/audit/` 未跟踪 | 已随 `bb8830a` 提交 | 不重复提交 |
| ASTRUM-005 仍待修 | 已在 `0cf5cd4` 修复 | 阶段 B 只做复验与补测 |
| ASTRUM-001/002/015 已修 | 一致 | 不重复实施 |
| selftest 157/157 | 一致 | 保持 |
| 英文残留约 30 条 | 实测 51 条命中，`--max=0` exit 1 | 新增 P1，优先修复 |

> 说明：任务书要求「如果当前代码与审计报告不一致，必须建立差异表」。上表即差异表。任何「恢复 17 个文件」的操作都会破坏已推送提交，禁止执行。

### 2.3 文件与模块清点

| 项 | 实测 |
|---|---|
| `core/*.js` | 76 |
| `tools/*.js` | 138 |
| `docs/**/*.md` | 192 |
| `docs/audit/*.md` | 15（00–13 + 最终报告） |
| `index.html` script 标签 | 90（顺序加载，全局 window） |
| 构建系统 | 无 `package.json`、无打包器、无后端 |

审计报告完整；未发现缺页或空文件。

---

## 3. 当前测试基线（真实运行）

环境：Windows / PowerShell 5 / Node v24.19.0 / Chrome（本机）。运行时间：2026-11-21。

| 命令 | 结果 | 说明 |
|---|---|---|
| `node tools/selftest.js "file://D:/Projects/Astrum/index.html"` | **PASS 157/157**，exit 0 | 含 CSP 违规 0 |
| `node tools/p0-security-test.js` | **PASS 38/38** | |
| `node tools/p0-03-test.js` | **PASS 53/53** | |
| `node tools/p4-browser-test.js` | **PASS 13/13** | PowerShell 会把 Chrome stderr 显示为红色，但 `RESULT 13/13`、exit 0 |
| `node tools/v1-5-perf-test.js` | **PASS（JSON）** | 见下表 |
| `node tools/v2-sky-01-test.js` | **PASS 52/52** | |
| `node tools/v2-sky-2b-test.js` | **PASS 31/31** | |
| `node tools/v2-sky-2c-test.js` | **PASS 24/24** | |
| `node tools/visual-stars-test.js` | **PASS 16/16** | |
| `node tools/visual-stars-quality-test.js` | **PASS 36/36** | |
| `node tools/v1-5-idb-stress-test.js` | **PASS 7/7** | 1000 写 2195 ms；删 500 1887 ms |
| `node tools/i18n-scan.js --quiet --max=0` | **FAIL，exit 1** | 界面 30 / 内容 20 / 用户 1 |

性能实测（`v1-5-perf-test`）：

| 指标 | 数值 |
|---|---|
| 冷启动 | 206.99 ms |
| Router p95 | 1.11 ms |
| Planner p95 | 0.99 ms |
| Control 本地均值 | 24.65 ms |
| 100 条证据报告均值 | 8.98 ms |
| TaskStore 200 条 | 182.33 ms |
| heapUsed | 19.92 MB |

未运行（明确记录，不伪造）：Firefox / Safari / 移动端、真实第三方模型 API、真实 GitHub Actions 远端、JPL Horizons 在线查询、其它未列入的套件。阶段 B–E 每次改动后补跑全量。

---

## 4. 21 项复核总表

| 编号 | 等级 | 复核结论 | 是否需改代码 |
|---|---|---|---|
| ASTRUM-003 | P2 | 存在：README/标题仍称「多智能体」 | 文档/文案 |
| ASTRUM-004 | P2 | 存在：未知幂等性默认 `reuse` | 是 |
| ASTRUM-005 | P2 | **已修复**（`0cf5cd4`）；仍需补原因区分与全工具故障注入 | 补测/小改 |
| ASTRUM-006 | P2 | 存在：暂停仅批次/步骤边界 | 是 |
| ASTRUM-007 | P2 | 成立，但属设计边界；未发现数据越界证据 | 文档/测试为主 |
| ASTRUM-008 | P2 | 存在：无外部星历对照，现有测试只验证自洽 | 测试为主 |
| ASTRUM-009 | P2 | 存在：真实证据 Claim 硬编码 `p0-fixture` | 是 |
| ASTRUM-010 | P2 | 存在：仅恢复路径用 `expectedRevision`；仍以 `updatedAt` 兜底 | 是 |
| ASTRUM-011 | P3 | 存在：`style-src 'unsafe-inline'` + localhost 放行 | 是（高风险） |
| ASTRUM-012 | P3 | 存在：服务商配置（含 key 字段）随 `persist()` 入 localStorage | 是 |
| ASTRUM-013 | P3 | 存在：Worker 有域名白名单，但无大小/超时/Origin 限制 | 是 |
| ASTRUM-014 | P3 | 存在：AuditLog 无哈希链/序号校验 | 是 |
| ASTRUM-016 | P3 | **不成立（误报）**：实现按黄经差 45° 相位窗口，非等分时间 | 否（补边界测试） |
| ASTRUM-017 | P3 | 存在：`astro.js` 头注释仍写「J2000 平赤道」，与实际 of-date 行星并存不符 | 注释 |
| ASTRUM-018 | P3 | 部分存在：星场/星座连线有「示意」，行星纹理与银河素材缺统一声明 | 文档/UI |
| ASTRUM-019 | P3 | 存在：1000 条约 2.2 s；单事务但重复序列化 | 是（中风险） |
| ASTRUM-020 | P3 | 存在：`saveState` 默认吞掉持久化失败 | 是 |
| ASTRUM-021 | P3 | 存在：有零依赖说明，但无依赖/外部服务清单与 SBOM | 文档 |
| ASTRUM-022 | P3 | 存在：API 返回 `stopReason=denied` + 空 evidence；UI 无 denied 文案 | 是 |
| ASTRUM-023 | P3 | 存在：Actions 使用 `@v4/@v5` | 配置 |
| ASTRUM-024 | P3 | 存在：极区升落返回 null，UI 仅显示 `—`；`sunTimes` 极夜用假窗口兜底 | 是 |
| **ASTRUM-025（新增）** | **P1** | **CI 英文残留门禁失败（51 条命中，exit 1）** | 是 |

统计：已修复 1；不成立 1；需处理 19；另新增 1 项 P1。合计待办 **20 项**（P1 1 / P2 7 / P3 12）。

---

## 5. 逐项复核与修复方案

### 5.1 ASTRUM-003：产品表述超出实现

- **原问题**：对外称「多智能体」，实际是 Intent Routing + 固定模板 Pipeline + 角色化 Agent。
- **复核**：仍存在。`README.md` 标题、`index.html` 的 `<title>`、`og:title` 均为「天文多智能体工作台」；`HELP_CARDS` 称「自建智能体」。代码中 13 个角色是提示词/职责标签，不是自主协商。
- **根因**：历史定位文案未随 P3 架构收敛更新。
- **推荐修改**：统一改为「角色化天文工作流 / 多角色协作（非自主多智能体）」。保留 Muse、Vega、Kepler 等角色名与 UI，不删功能。
- **修改文件**：`README.md`、`index.html`（title/og/meta/关于/帮助）、`docs/DESIGN.md`、`docs/architecture/07`。
- **测试**：新增文案一致性脚本，grep 禁止「多智能体」出现在产品对外文案；允许在「非自主」限定语中出现。
- **验收**：README、首页、关于页、帮助页表述一致；无「自主协商」暗示。
- **风险**：低（纯文案）。

### 5.2 ASTRUM-004：未知幂等性恢复盲目复用

- **原问题**：恢复时对无幂等声明的成功步骤默认复用，可能跳过有副作用的操作。
- **复核**：仍存在。`core/recovery.js:276-283`：`idempotent === true → reuse`、`false → rerun`；其余在有 `outputHash + result` 时返回 `reuse`。
- **根因**：把「本地有结果」等同于「远端副作用已完成」；缺少执行凭证（executionId / idempotencyKey / 副作用校验）。
- **方案比较**：
  - A. 维持 reuse：最小改动，但违反可靠性目标。
  - B. 未知一律 rerun：安全但可能重复副作用。
  - C. `validate_then_reuse`：校验输入哈希、Skill 版本、principal、checkpoint、结果 Schema 后再决定；缺凭证则 rerun / 人工确认。**推荐 C**。
- **推荐修改**：
  1. 在 `decide()` 增加 `unknown` 分支：有完整凭证且结果可校验 → `validate_then_reuse`；否则 `rerun`。
  2. Skill 步骤默认 `rerun`（除非 Skill 显式声明 `idempotent:true`）。
  3. 结果记录增加 `executionId`/`idempotencyKey`（若工具已提供），不改变既有 Tool Schema。
  4. 明确文档：浏览器本地状态不能保证第三方 exactly-once。
- **修改文件**：`core/recovery.js`、`core/task.js`（结果凭证字段，可选）、`core/registry.js`（仅补元数据）、对应测试。
- **测试**：未知幂等性、非幂等、参数变化、Skill 版本变化、principal 变化、无凭证、历史数据。
- **验收**：未知幂等性不再直接 `reuse`；恢复决策可解释；不重复副作用；旧任务可读。
- **风险**：中（恢复策略变化，可能增加重跑）。

### 5.3 ASTRUM-005：超时不能中止底层请求（已修复）

- **原问题**：`withTimeout` 只忽略 Promise，底层请求继续跑。
- **复核**：**已修复**。`core/orchestrator.js:159-193` 创建每次尝试的 `AbortController`；超时/外部取消先 `abort()` 再返回；`ToolGateway.invoke` 与 `spec.run` 收到 `attemptSignal`。`core/skill-runtime.js` 同样处理。`tools/p3-executor-test.js` 新增 `P3-X4-01/02`，实测 12/12。
- **仍缺**：
  1. 原因仅区分 `timeout` / `cancelled`，尚未区分 `UserCancelled` / `PauseRequested`。
  2. 未覆盖所有工具（模型请求、论文全文、Worker）故障注入。
  3. 浏览器级「超时后请求确实终止」断言缺失。
- **推荐修改**：阶段 B 只补语义与测试，不重写实现：统一 `AbortReason` 枚举；把 `pendingAbort` 从「失败」改为「未完成/可恢复」；补故障注入。
- **修改文件**：`core/orchestrator.js`、`core/skill-runtime.js`、`core/control.js`、`tools/*`。
- **测试**：持续异步工具 + 超时；并发批次取消；暂停/取消竞争；刷新后不续跑；无未处理 rejection。
- **验收**：fetch 真 abort；不启动后续步骤；取消状态与事件/检查点一致。
- **风险**：低（已有基础）。

### 5.4 ASTRUM-006：暂停仅在边界生效

- **原问题**：UI 显示暂停，在飞请求仍继续。
- **复核**：仍存在。`core/control.js:597-599` 明确注释「暂停只写 pausedAt；不中断已在飞请求，执行循环在每个新批次前检查」。
- **根因**：`Control.run` 没有把可取消的 `AbortController` 暴露给 `pause()`；`pause` 只写存储。
- **方案比较**：
  - A. 维持边界语义 + UI 明示（最小，但未满足任务书）。
  - B. 协作式中断 + 步骤回队（推荐）。
  - C. 新增 `PAUSED` 正式状态（会改状态机契约，不建议）。
- **推荐修改**：
  1. `Control.run` 创建 `AbortController`，登记 `activeRuns[taskId]`；
  2. `pause()` 写 `pausedAt` 后调用 `controller.abort('pause')`；
  3. `withTimeout` 返回 `kind:'cancelled', reason:'pause'`；`executeOne` 遇 `pendingAbort` 时把步骤置回 `pending`（不记 failed），批次停止；
  4. 保存检查点后返回 `PAUSED`；`resume` 重建控制器；
  5. 不支持中断的工具：等待安全边界，UI 显示「当前操作无法立即中断，将在安全边界后暂停」；
  6. 跨标签页暂停：用 `BroadcastChannel` 通知，运行页收到后 abort；不作为一致性唯一保障。
- **修改文件**：`core/control.js`、`core/orchestrator.js`、`core/task.js`（若需 `cancelRequested`）、`core/app.js`、`tools/p3-*`。
- **测试**：空闲暂停、步骤中暂停、并行批次、暂停后刷新、恢复、暂停+取消竞争、暂停时工具报错、暂停时持久化失败。
- **验收**：暂停后不再启动新步骤；在飞可取消请求被中止；不可取消工具在边界暂停并明示；事件/检查点/状态一致。
- **风险**：中高（执行核心）。

### 5.5 ASTRUM-007：Profile 不是安全隔离

- **原问题**：本地档案切换无认证，只是数据分区。
- **复核**：成立，但属设计边界。`index.html` 仅有档案切换菜单，无「非安全边界」说明；`core/profile.js` 按命名空间分库；未发现跨档案读取证据。
- **根因**：产品未明确边界；浏览器本地存储无法提供服务器级认证。
- **推荐修改**：不增加伪登录。补充 UI/隐私说明；增加切换隔离测试（导入导出、缓存清理、异步写旧档案）；如测试发现越界再修代码。
- **修改文件**：`index.html`/`core/app.js`（说明）、`privacy.html`、`docs/architecture/15`、`tools/p0-*`。
- **测试**：A/B 档案切换后列表、任务、记忆、审计日志、缓存；异步任务写入归属；导入导出不串档案。
- **验收**：文档明确「非安全边界」；隔离测试全绿；无跨档案数据。
- **风险**：低（以文档/测试为主）。

### 5.6 ASTRUM-008：行星缺少外部星历对照

- **原问题**：行星位置无权威外部基准。
- **复核**：仍存在。`tools/v2-sky-01-test.js` 只比较 `Astro.altAz` 与 viewmodel 自洽（误差 <1e-9），不是外部真值；`core/astro.js:154-164` 使用 JPL 近似根数。
- **根因**：缺少离线参考数据集与误差统计。
- **推荐修改**：
  1. 用 JPL Horizons 生成**固定离线 fixture**（不接入生产链）：7 行星 + 太阳，覆盖不同年份、季节、顺逆行、近地平线；
  2. 明确参考系：地心视赤道 J2000 / of-date、UTC→TT、光行时、章动/光行差开关；
  3. 比较赤经、赤纬、球面角距、距离；输出每体误差分布；
  4. 阈值按模型真实能力设定（先测后定，不先放宽）。
- **修改文件**：`tools/fixtures/planets-horizons.json`、新增 `tools/v2-planet-horizons-test.js`；若超阈值再评估 VSOP87 截断。
- **测试**：离线回归；网络不可用不影响；来源/查询时间/参数/许可证记录在 fixture 头。
- **验收**：每个天体有误差统计；阈值有依据；不把自洽当外部验证。
- **风险**：中（若精度不达标需升级算法）。

### 5.7 ASTRUM-009：Claim origin 错误

- **原问题**：真实证据合成 Claim 仍标 `p0-fixture`。
- **复核**：仍存在且更明确。`core/claims.js` 的 `buildClaimsFromEvidence()` 对 SIMBAD、论文摘要、测量值等生成 Claim 时**硬编码** `origin: 'p0-fixture'`（约 737/750/763/790 等处）。
- **根因**：P3 生成路径复用了 fixture 字段默认值，未传 `p3-generated`。
- **推荐修改**：生成路径统一 `origin:'p3-generated'`；fixture 示例保持 `p0-fixture`；`makeClaim` 默认值改为必填或显式报错，避免再次静默回落；保留 `source` 枚举与 `calc` 字段不变。
- **修改文件**：`core/claims.js`、`tools/*claim*`、`core/report.js`（如需展示）。
- **测试**：fixture / catalog / external / 本地 calc / 多证据 / 无证据 / 引用缺失 / 历史数据迁移。
- **验收**：真实检索生成的 Claim 100% 为 `p3-generated`；fixture 仅测试数据；来源链可追溯。
- **风险**：低。

### 5.8 ASTRUM-010：多标签页并发写

- **原问题**：多标签页可能静默覆盖任务。
- **复核**：仍存在。`core/task-store.js:489-499` 同时支持 `expectedRevision` 与 `updatedAt` 比较；但 `core/control.js:186` 仅在调用方传入时使用 `expectedRevision`，普通执行保存未传；恢复路径才传（`:800-808`）。
- **根因**：乐观并发控制未贯穿所有写入；`updatedAt` 兜底受时钟/同毫秒影响。
- **推荐修改**：
  1. 加载任务时记录 `revision`，本次执行所有 `saveState` 强制 `expectedRevision`；
  2. 冲突返回 `STALE_WRITE`，不覆盖；UI 提供「重新加载 / 另存副本」；
  3. 有 `revision` 时移除 `updatedAt` 作为主判据（仅兼容无 revision 的旧记录）；
  4. `BroadcastChannel` 仅作刷新通知，不替代 IndexedDB 原子校验；
  5. 事件追加保持 seq 唯一与指纹校验。
- **修改文件**：`core/control.js`、`core/task-store.js`、`core/app.js`、`tools/p4-*`。
- **测试**：双标签同时读、A 写、B 旧版本写被拒、B 重读后成功、不同 Profile 隔离、事务中断。
- **验收**：旧版本写入 100% 拒绝；无静默覆盖；恢复仍可用。
- **风险**：中（需覆盖所有保存点）。

### 5.9 ASTRUM-011：CSP 样式放行

- **原问题**：`style-src 'self' 'unsafe-inline'`；`connect-src` 含 localhost。
- **复核**：仍存在。`index.html:8`。
- **根因**：大量静态 `<style>`、动态 `style="..."` 拼接与画布定位样式。
- **推荐修改（分两步）**：
  1. 低风险：生产 CSP 移除 localhost；提供独立 `index.dev.html`/构建参数给本地代理，避免生产放行；
  2. 高风险：盘点并迁移内联样式到 CSS class / CSS 变量；动态定位改用 `element.style.setProperty`（不受 `style-src` 限制）或 class 切换；最后移除 `'unsafe-inline'`。
- **修改文件**：`index.html`、`styles.css`（或现有样式文件）、`core/app.js`、`core/sky-*`、`tools/csptest.js`、`tools/build-standalone.js`（若有）。
- **测试**：`csptest` 违规 0；全量浏览器渲染回归；日/夜主题、星图、全屏、移动断点。
- **验收**：CSP 无 `unsafe-inline`（或给出逐条豁免理由）；localhost 仅开发产物；无视觉回归。
- **风险**：高（样式面大）。建议放 D 阶段最后，独立提交、可单独回滚。

### 5.10 ASTRUM-012：API Key 明文存储

- **原问题**：Key 明文 localStorage。
- **复核**：存在。`core/app.js:48-53` 的 `persist()` 把 `settings/custom/cfg` 写入 localStorage；`core/sources.js` 的服务商字段含 `key`。导出是否排除 Key 需在实施时逐项验证。
- **根因**：纯前端需要持久保存用户 Key；无服务器可代管。
- **推荐修改**：
  1. 默认隐藏 Key；增加「仅本次会话」选项（sessionStorage，不落盘）；
  2. 导出/备份默认排除 Key；提供「清除全部 Key」；
  3. 错误报告/日志继续脱敏（已有）；
  4. 隐私页明确：前端加密不能抵御已控制浏览器的攻击者；不宣传「加密安全」。
- **修改文件**：`core/app.js`、`core/sources.js`、`core/compose-adapter.js`、`privacy.html`、`tools/*key*`。
- **测试**：导出无 Key；清除生效；刷新后会话 Key 消失；错误信息不含 Key；多标签一致。
- **验收**：无明文 Key 进入导出/日志/错误；用户可控制持久化。
- **风险**：中（UI 与兼容）。

### 5.11 ASTRUM-013：Worker 限制不足

- **原问题**：CORS Worker 可能被当作开放代理。
- **复核**：部分存在。`worker/cors-proxy.js` 已有目标域名白名单、仅 POST/OPTIONS、不持有 Key；但 **无请求体大小上限、无超时、无 Origin 白名单、CORS 为 `*`**。
- **推荐修改**：`MAX_BODY`（如 1 MB）、`Content-Length` 校验、上游 `AbortSignal.timeout`、`ALLOWED_ORIGINS` 环境变量、回显受限 Origin、限制错误体长度、可选速率限制；路径白名单按厂商固定端点。明确 Worker 不是身份认证。
- **修改文件**：`worker/cors-proxy.js`、`worker/README.md`、新增 `tools/worker-test.js`。
- **测试**：超大 body 413、未知 Origin 403、未知 host 403、GET 405、超时 504、正常流式透传。
- **验收**：上述全部通过；文档明确安全边界。
- **风险**：低。

### 5.12 ASTRUM-014：AuditLog 完整性

- **原问题**：本地审计日志可修改。
- **复核**：仍存在。`core/audit-log.js:84-101` 仅 `put(rec)`，无 `prevHash/recordHash`，无校验。
- **推荐修改**：append-only API；每条记录加 `seq`、`prevHash`、`recordHash`（SHA-256）；`verify()` 重算；导出时校验；在 profile meta 存最新锚点。明确「防误改，不防本地管理员」。
- **修改文件**：`core/audit-log.js`、`core/task.js`（哈希工具复用）、`core/app.js`（状态展示）。
- **测试**：正常链、篡改中间记录、删除记录、导出校验、旧日志迁移。
- **验收**：篡改可检测；不影响业务；不宣称绝对防篡改。
- **风险**：低。

### 5.13 ASTRUM-016：月相「8 等分时间」——不成立

- **原问题**：报告称按月相时间 8 等分命名，边界误差约 1.8 天。
- **复核**：**不成立**。`core/astro.js:136-152` 先算 `elong = moon.lon - sun.lon`，再按黄经差映射到 8 个 45° 相位窗口（首尾各 22.5° 拼成新月窗口），不是时间等分。
- **独立验证**：对 J2000 起 40 天、0.01 天步长共 4001 个样本，按 `round(elong/45)%8` 比较，**0 处不一致**；边界 22.4°/22.6°、67.4°/67.6°、337.4°/337.6° 均正确切换。
- **结论**：无需改算法；补边界测试与报告更正。
- **修改文件**：新增 `tools/v2-moon-phase-boundary-test.js`；`docs/audit/ASTRUM-04` 更正。
- **验收**：边界测试锁定 8 个窗口；报告不再声称该缺陷。
- **风险**：无。

### 5.14 ASTRUM-017：坐标参考系注释不一致

- **原问题**：注释与实际参考系不符。
- **复核**：仍存在。`core/astro.js:1-7` 写「坐标：J2000 平赤道；未做周年光行差/章动」，但当前实现：星表经 `precess` 到观测历元，太阳/行星为 of-date，月球为 of-date。
- **推荐修改**：注释与文档统一为「星表输入 J2000；星图/恒星显示前岁差到观测历元；太阳/行星/月球为 of-date；不做章动/光行差」。补防二次岁差测试。
- **修改文件**：`core/astro.js`、`docs/architecture/*`、`docs/audit/ASTRUM-04`。
- **测试**：J2000→of-date 一次岁差；恒星与行星混用不二次岁差；极点/天顶。
- **验收**：注释、函数名、文档一致；数值回归不变。
- **风险**：低。

### 5.15 ASTRUM-018：模拟/示意资产声明

- **原问题**：部分视觉为模拟，但声明不完整。
- **复核**：部分存在。星图图例已标「银河星场（示意）」；`data/catalog.js` 注明星座连线为示意；但 README/关于页未统一说明行星纹理为程序化、银河素材为 NASA SVS、星场非实测星表。
- **推荐修改**：新增「视觉资产说明」区块，四类标注：真实星表 / 真实观测素材 / 近似计算 / 模拟或示意；UI 图例与 README 一致。
- **修改文件**：`README.md`、`index.html`（关于/图例）、`docs/DESIGN.md`。
- **测试**：文案 grep 一致性；无需数值测试。
- **验收**：不把程序化纹理描述为真实照片；用户可区分。
- **风险**：低。

### 5.16 ASTRUM-019：IndexedDB 性能

- **原问题**：大量写入慢。
- **复核**：仍存在。`v1-5-idb-stress` 实测 1000 条 **2195 ms**，删 500 条 **1887 ms**；`task-store.js:458-467` 已是单事务，但每次保存同时写 task 记录（内含完整 events）与 events store，存在重复序列化/写入。
- **推荐修改（先测后改）**：
  1. 基准 100/500/1000 条，记录事务数、put 数、序列化耗时、数据大小；
  2. task 记录不再内嵌全部 events（保留最近 N 条 + `eventsUpToSeq`），events store 为权威派生索引；`schemaVersion` 升级并迁移；
  3. 批次内合并保存/防抖（如 150 ms），检查点/暂停/终态强制 flush；
  4. 不改变事件顺序、检查点恢复、Profile 隔离与回滚语义。
- **修改文件**：`core/task-store.js`、`core/task.js`、`core/control.js`、`tools/v1-5-idb-stress-test.js`。
- **测试**：一致性、顺序、失败回滚、旧数据迁移、恢复。
- **验收**：1000 条写入显著下降（目标以实测为准，建议 <800 ms），功能全绿。
- **风险**：中高（存储迁移，需可回滚）。

### 5.17 ASTRUM-020：内存事件领先持久化

- **原问题**：事件先入内存，写库失败可能造成内存领先。
- **复核**：仍存在。`core/control.js:184-189` 的 `saveState` 默认吞掉存储错误（仅 `rethrow` 时抛出）；`T.appendEvent` 先改内存。
- **推荐修改**：`saveState` 返回明确失败；Control 记录 `lastPersistError` 并发出 `task.persist_failed`；UI 显示「未保存」；重试/降级；检查点不得领先于未提交事件。
- **修改文件**：`core/control.js`、`core/task-store.js`、`core/app.js`、`tools/p4-*`。
- **测试**：注入 Quota/事务失败；事件顺序；恢复不使用未提交数据；重试成功。
- **验收**：失败不伪装成功；可追踪；恢复一致。
- **风险**：中。

### 5.18 ASTRUM-021：依赖清单与 SBOM

- **原问题**：无依赖清单/SBOM。
- **复核**：存在。项目确实零 npm 运行时依赖，但外部服务、Actions、数据源未成清单。
- **推荐修改**：新增 `docs/security/DEPENDENCIES.md` 与 `docs/security/SBOM.md`（或 CycloneDX JSON），列出：GitHub Actions（SHA/版本）、模型 API、数据源（SIMBAD/OpenAlex/arXiv/Wikipedia/天气/地理）、Worker、字体/图片素材；不伪造不存在的 npm 依赖。
- **修改文件**：`docs/security/*`、`README.md`。
- **测试**：脚本校验 Actions 均固定 SHA、清单覆盖 workflow 中全部 `uses`。
- **验收**：清单可审计；SBOM 与仓库实际一致。
- **风险**：低。

### 5.19 ASTRUM-022：Research.run 错误语义

- **原问题**：缺 principal 时静默空证据。
- **复核**：部分存在。`core/research.js:604-620` 会返回 `stopReason:'denied'`、`error:auth.reason`、`evidence:[]`；但调用方/UI 未区分「权限不足」与「无结果」，`app.js` 的 `STOP_REASON_LABEL` 无 `denied`。
- **推荐修改**：统一返回 `{ok:false, denied:true, reason}`；UI 显示明确授权提示；保留 ToolGateway 授权逻辑；不泄露敏感信息。
- **修改文件**：`core/research.js`、`core/app.js`、`tools/selftest.js`（已有 principal 修复）、`tools/p0-*`。
- **测试**：无 principal、无能力、无结果、外部失败、参数错误。
- **验收**：四类错误可区分；不再显示「没有找到证据」。
- **风险**：低。

### 5.20 ASTRUM-023：Actions 固定 SHA

- **原问题**：使用大版本标签。
- **复核**：存在。`checkout@v4`、`setup-node@v4`、`upload-artifact@v4`、`configure-pages@v5`、`upload-pages-artifact@v3`、`deploy-pages@v4`。
- **推荐修改**：全部固定到完整 commit SHA，注释保留版本；收紧 `permissions`；新增配置检查脚本防回归。
- **修改文件**：`.github/workflows/*.yml`、`tools/check-actions-pinned.js`（新增）。
- **测试**：脚本扫描 `uses:` 必须含 40 位 SHA；workflow 语法检查。
- **验收**：无未固定 Action；CI 逻辑不变。
- **风险**：低。

### 5.21 ASTRUM-024：极区升落语义

- **原问题**：极昼/极夜缺少明确文案。
- **复核**：存在。`core/astro.js:311-331` 在无升落时返回 `rise/set=null`；极夜时用 `dusk=jdMidnight`、`dawn=+1` 兜底；`core/app.js:966` 直接 `fmtHM(mtr.rise/set)`，只显示 `—`，无「极昼/极夜/全天不可见」。
- **推荐修改**：`sunTimes`/`track` 返回 `polar:'always_up'|'always_down'|'normal'` 与原因；UI 按语义显示；区分「计算失败」与「极昼/极夜」；恒星 `alwaysUp/alwaysDown` 同样展示。
- **修改文件**：`core/astro.js`、`core/app.js`、`core/sky-viewmodel.js`、`tools/v2-sky-*`。
- **测试**：lat 78° 夏/冬、极圈临界、天体恒显/恒隐、数值边界。
- **验收**：极昼/极夜/全天不可见文案正确；不再把求解失败解释为极夜。
- **风险**：低。

### 5.22 ASTRUM-025（新增 P1）：CI 英文残留门禁失败

- **原问题**：CI 步骤 `node tools/i18n-scan.js --quiet --max=0` 失败。
- **复核**：**存在，P1**。实测 `RESULT 界面 30 条 / 内容 20 条 / 用户 1 条`，`× 英文界面残留 30 条，超过基线 0 条`，exit 1。
- **根因**：P2/P3 新增动态 UI 与观测计划/报告标签未全部接入 `data-i18n`/`L()`；扫描器把答案正文中的中文内容计入「内容」类，用户问题回显计入「用户」类，但阈值 0 不允许任何命中。
- **推荐修改**：
  1. 逐条修复 30 条界面文案（属性/动态 label/aria/title）；
  2. 20 条内容类区分「可翻译标签」与「答案正文」，前者补词条，后者按既定类别排除；
  3. 用户回显 1 条按规则排除（不伪造翻译）；
  4. 保持 `--max=0`，不放宽阈值。
- **修改文件**：`core/app.js`、`core/i18n*.js`、`core/content-i18n.js`、`tools/i18n-scan.js`、`index.html`。
- **测试**：`--quiet --max=0` exit 0；英文界面截图/浏览器检查；中文界面回归。
- **验收**：CI 该步骤绿；英文界面无中文残留（允许类别除外）。
- **风险**：低中（文案量大，易漏）。

---

## 6. 根因归纳

| 根因类别 | 涉及问题 | 说明 |
|---|---|---|
| 执行取消语义不完整 | 005、006 | 有超时 abort，但缺暂停/取消原因与在飞中断 |
| 恢复与并发的一致性模型不完整 | 004、010、020 | 复用判定、版本控制、持久化成功语义 |
| 科研可追溯性字段误用 | 009、017、018、022 | origin、参考系注释、模拟声明、错误语义 |
| 安全边界与默认加固不足 | 011、012、013、014、023 | CSP、Key、Worker、审计、供应链 |
| 性能与数据模型耦合 | 019 | task 记录重复内嵌 events |
| 产品表述/文案滞后 | 003、021、024、025、016 | 含 1 项误报与 1 项新增 CI 门禁 |

---

## 7. 五阶段实施计划

> 原则：每批只做一类改动；每批结束跑对应测试 + 全量回归；每批可独立回滚；不自动执行 Git 写操作。

### 阶段 A（本轮）
只读审计、测试、本计划。**已完成，等待批准。**

### 阶段 B：执行可靠性（P1 + P2）

| 批次 | 内容 | 关键文件 | 出口条件 |
|---|---|---|---|
| B0 | ASTRUM-025 CI 英文残留 | i18n/UI 文案、scanner | `i18n-scan --max=0` exit 0；CI 等价命令绿 |
| B1 | ASTRUM-005 复验与补测 | orchestrator/skill-runtime/tools | 全工具故障注入；原因区分；无未处理 rejection |
| B2 | ASTRUM-006 暂停/取消 | control/orchestrator/app | 暂停后不启动新步骤；可取消请求中止；8 类暂停测试 |
| B3 | ASTRUM-004 幂等恢复 | recovery/registry/task | 未知不再盲目 reuse；凭证校验；恢复测试 |
| B4 | ASTRUM-010 多标签并发 | control/task-store/app | 旧 revision 写入被拒；双标签测试 |

B 阶段完成后必须：selftest、P0–P4 全量、p4-browser、idb-stress、perf 全绿（除已知无关项）。

### 阶段 C：科研可信度

| 批次 | 内容 | 关键文件 | 出口条件 |
|---|---|---|---|
| C1 | ASTRUM-008 行星外部基准 | `tools/fixtures/planets-horizons.json`、新测试 | 误差分布与阈值有依据 |
| C2 | ASTRUM-009 Claim origin | claims.js、测试 | 真实 Claim 全部 `p3-generated` |

### 阶段 D：安全纵深

| 批次 | 内容 | 关键文件 | 出口条件 |
|---|---|---|---|
| D1 | ASTRUM-007 边界说明 + 隔离测试 | 文档/UI、p0 测试 | 无跨档案；文档明确 |
| D2 | ASTRUM-012 Key 控制 | app/sources/privacy | 导出无 Key；会话模式；清除 |
| D3 | ASTRUM-013 Worker 加固 | worker、worker-test | 大小/超时/Origin 全通过 |
| D4 | ASTRUM-014 审计哈希链 | audit-log | 篡改可检测 |
| D5 | ASTRUM-023 Actions SHA | workflows、检查脚本 | 全部固定 SHA |
| D6 | ASTRUM-011 CSP 收紧 | index/styles/app | 违规 0；无视觉回归；独立回滚 |

### 阶段 E：质量、性能与产品

| 批次 | 内容 | 关键文件 | 出口条件 |
|---|---|---|---|
| E1 | ASTRUM-017 参考系注释 | astro.js、文档 | 注释/实现/文档一致 |
| E2 | ASTRUM-003 产品表述 | README/index/关于 | 无「自主多智能体」暗示 |
| E3 | ASTRUM-018 视觉声明 | README/index/图例 | 四类资产标注一致 |
| E4 | ASTRUM-016 误报更正 + 边界测试 | 测试/审计文档 | 0 不一致；报告更正 |
| E5 | ASTRUM-024 极区语义 | astro/app/viewmodel | 极昼/极夜/不可见文案 |
| E6 | ASTRUM-022 错误语义 | research/app | 四类错误可区分 |
| E7 | ASTRUM-021 依赖/SBOM | docs/security | 清单可校验 |
| E8 | ASTRUM-019/020 存储 | task-store/control | 性能改善且一致性全绿 |

---

## 8. 测试体系

### 8.1 回归基线（每批必跑）
- `selftest`（157/157）
- `p0-security`、`p0-03`
- `p4-browser`、`p4-*`
- `p3-*`
- `v2-sky-01/2b/2c`、`visual-stars`、`visual-stars-quality`
- `v1-5-idb-stress`、`v1-5-perf`
- `i18n-scan --quiet --max=0`

### 8.2 新增测试（按批次）
- B：`v2-task-cancel-test`、`v2-pause-semantics-test`、`v2-recovery-idempotency-test`、`v2-multitab-test`
- C：`v2-planet-horizons-test`、`v2-claim-origin-test`
- D：`v2-worker-test`、`v2-audit-integrity-test`、`v2-csp-strict-test`、`v2-actions-pinned-test`
- E：`v2-moon-phase-boundary-test`、`v2-polar-test`、`v2-idb-perf-test`、`v2-i18n-gate-test`

### 8.3 测试真实性要求
- PASS/FAIL/BLOCKED/NOT RUN 分开记录；
- 不把静态检查写成运行测试；
- 不把 Chromium 结果写成 Firefox/Safari；
- 外部星历只作离线 fixture，网络不可用不冒充通过；
- 每份测试记录命令、环境、时间、数量、日志位置。

---

## 9. 兼容性与回滚

| 变更 | 兼容策略 | 回滚 |
|---|---|---|
| TaskStore schema 升级（019/020） | 版本号 + 只读旧数据 + 迁移开关 | 保留 v1 读路径；回滚提交即可 |
| 暂停语义（006） | 不新增正式 phase，沿用 `pausedAt` + controller | 关闭 controller 注册即回到边界语义 |
| 恢复策略（004） | 新策略仅对未知幂等性生效；旧记录可解释 | 回退 `decide()` 分支 |
| OCC（010） | `expectedRevision` 可选；旧记录 revision=1 | 移除强制参数 |
| CSP（011） | 独立提交；保留旧 CSP 备份 | 单独 revert |
| Worker（013） | 新增环境变量默认宽松/严格可配 | 回退单文件 |
| Claim origin（009） | 枚举已存在 `p3-generated`，无 schema 变更 | 回退赋值 |
| Actions SHA（023） | 行为不变，仅引用方式变化 | 回退 workflow |

禁止：破坏公开 API、改变 source/Claim/Evidence 既定语义、绕过 Security/ToolGateway、删除或降低既有测试。

---

## 10. 风险与需要人工决定的事项

1. **ASTRUM-011（CSP）**：彻底移除 `unsafe-inline` 需要较大样式改造，存在视觉回归风险。建议先做 localhost 环境隔离，再单独评估样式迁移；若无法保证无回归，保留并记录逐条理由。
2. **ASTRUM-019（IDB 迁移）**：涉及 TaskStore 数据结构与历史任务兼容，属不可逆风险。实施前需备份/迁移演练；若迁移失败必须停止并请求决定。
3. **ASTRUM-012（Key）**：前端无法防御已控制浏览器的攻击者；不提供「绝对安全」承诺。是否引入口令加密需产品决定（会增加解锁成本且无法根治）。
4. **ASTRUM-008（行星精度）**：若 fixture 显示误差超阈值，需要决定是否升级 VSOP87 截断模型；这会改变计算核心，需单独批准。
5. **ASTRUM-007**：不增加本地登录/伪认证；仅明确边界与测试隔离。
6. **ASTRUM-016**：判定为误报；若用户坚持修改，需要先确认目标相位边界定义（本报告建议不改算法）。
7. **ASTRUM-025**：修复英文残留需要大量文案，但不涉及架构；建议作为 B0 门禁优先完成。

---

## 11. 建议批准范围

建议批准 **阶段 B–E 全部范围**，但按以下门禁执行：

1. **B0 必须先合并**：CI `i18n-scan --max=0` 恢复绿灯，否则后续所有「CI 全绿」结论不成立。
2. B1 不重写 005，只补原因语义、全工具故障注入与浏览器验证。
3. B2（暂停）与 B4（多标签）涉及执行/存储核心，必须先写失败测试再改代码。
4. D6（CSP）与 E8（IDB）分别独立提交、独立回滚，不与其它批次混合。
5. 每批结束提交测试证据；不自动 `git add/commit/push`，需用户逐次批准。

**结论：建议批准实施。** 当前代码基线可支撑整改；主要风险集中在 CSP 样式迁移与 TaskStore 迁移，已给出隔离与回滚方案。

---

## 12. 本轮执行边界声明

- 本文件是阶段 A 唯一新增产物。
- 未修改任何业务代码、测试、配置、既有文档。
- 未执行 `git add/commit/push/checkout/reset/merge/rebase/stash`。
- 未部署。
- 测试产生的临时文件位于系统临时目录，未进入仓库。
- 当前 `git status` 预期仅显示本文件为未跟踪。

**阶段 A 结束，等待用户明确批准后再进入阶段 B。**
