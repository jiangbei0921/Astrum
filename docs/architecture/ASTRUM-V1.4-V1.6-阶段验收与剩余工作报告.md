# ASTRUM V1.4—V1.6 阶段验收与剩余工作报告

> 日期：2026-11-02
> 代码目录：项目工作区
> 范围：Gate 1 Research Loop 修复、Gate 2 大文件/资源、Gate 3 缓存、Gate 4 长跑、Gate 5 回归
> 说明：V1.4 正式发布、V1.5 稳定性验收、V1.6 开发条件是三个独立状态；本报告不因局部通过而合并。

---

## 1. 实际修改的代码文件

| 文件 | 修改内容 | 原因 | 接口影响 |
|---|---|---|---|
| `core/evaluator.js` | 新增可选 `research` 输入；8 个 gapCode；Claims 支持/独立性、Reducer 关键冲突、冲突消失、`plan.expansion.appendedKeys` 去重；版本 1.1.0 | Gate 1：Research Loop 不能只看 Evidence 数量；searches 双扣需配合 | 旧字段与旧行为保留；无 `research` 时走旧逻辑 |
| `core/planner.js` | `expand` 接受 `basis/direction/conflictKeys`；按 gapCode 生成检索式；写入 `plan.expansion` 追溯 | Gate 1：追加可追溯、缺口不重复 | 步骤结构不变；plan 新增可选 `expansion` |
| `core/control.js` | 传入 `answer.research`；追加只扣 `appends`；每轮用 `deliverWithDelivery` 刷新 research | Gate 1：Claims/Reducer 接入 + 修复双扣 + 下一轮看到新证据 | 旧 opts 全部保留；`researchLoop` 默认关闭 |
| `tools/v1-5-research-loop-test.js` | E3 增加真实执行/单次扣减/追溯断言（26→29） | Gate 1：修复原假通过 | 旧断言未删除 |
| `tools/v1-5-research-loop-claims-test.js` | 新增 E5—E10（48 断言） | Gate 1：Claims/Reducer/持久化/事件/预算 | 新文件 |
| `tools/v1-5-bigfile-test.js` | 新增真实浏览器 FITS/PDF 大文件测试 | Gate 2 | 新文件 |
| `tools/v1-5-resource-test.js` | 新增 DOM/Blob/Listener/Timer 测试 | Gate 2 | 新文件 |
| `tools/v1-5-cache-test.js` | 新增缓存命中/TTL/降级测试 | Gate 3 | 新文件 |
| `tools/v1-5-longrun-test.js` | 重写为真实浏览器 + 真实计时 + 逐分钟日志 + 心跳/超时保护 | Gate 4 | 保留 `--minutes` 参数 |
| `.github/workflows/test.yml` | 增加 claims 测试、resource 测试、cache 测试步骤 | Gate 5 CI 等价 | 未删除/降低旧步骤 |
| `docs/architecture/ASTRUM-Research-Loop-证据质量评估修复报告.md` | 新增 Gate 1 报告 | 交付 | — |
| `docs/architecture/ASTRUM-V1.5-浏览器资源稳定性测试报告.md` | 新增 Gate 2/3 报告 | 交付 | — |
| `docs/architecture/ASTRUM-V1.5-长时间运行测试报告.md` | 新增 Gate 4 报告 | 交付 | — |
| `docs/architecture/ASTRUM-全项目架构追踪与缺口分析.md` | ARCH-14/15/17 更新 | 状态同步 | — |
| `docs/architecture/V1-遗留问题清单.md` | V1-L46 → DONE | 状态同步 | — |

未修改：`ask()`、`buildAnswer()`、`compose*()`、`toSections()`、`detectIntent()`、Claims/Reducer/Evidence 结构、13 Agent、7 模板、12 工具、ADR-001 预算值。

## 2. 新增测试文件与覆盖

| 文件 | 覆盖 |
|---|---|
| `tools/v1-5-research-loop-claims-test.js` | Claims 6 态、Reducer 冲突 7 态、独立性、T-E/T-F、取消、持久化、事件、预算 |
| `tools/v1-5-bigfile-test.js` | FITS 10/50/100/200 MB、PDF 10 MB + 上限、重复 10 次、Heap |
| `tools/v1-5-resource-test.js` | 研究面板 20 次创建销毁、DOM/ID/Blob/Listener/Timer |
| `tools/v1-5-cache-test.js` | sources/simbad/weather/paper-fulltext、TTL、清理、IDB 降级 |
| `tools/v1-5-longrun-test.js` | 30/60/180 分钟真实运行，8 类任务混合，逐分钟 17 项指标 |

## 3. 测试执行结果

### Gate 1

| 命令 | 结果 |
|---|---|
| `node tools/v1-5-research-loop-test.js` | 29/29 |
| `node tools/v1-5-research-loop-claims-test.js` | 48/48 |
| `node tools/task-test.js` | 73/73 |
| `node tools/control-test.js` | 86/86 |
| `node tools/b8-test.js` | 33/33 |
| `node tools/p0-03-test.js` | 53/53，20 问 diffBytes=0 |

关键断言：`x1.status=ok`、`used.searches=3`（2+1，只扣一次）、`used.appends=1`、`plan.expansion.basis[0].code` 可追溯、冲突/单一来源追加不重复。

### Gate 2 / Gate 3

| 命令 | 结果 |
|---|---|
| `node tools/v1-5-bigfile-test.js` | 13/13 |
| `node tools/v1-5-resource-test.js` | 10/10 |
| `node tools/v1-5-cache-test.js` | 15/15 |

### Gate 4

| 编号 | 时长 | 结果 | Task / 追加 / Replan | IDB 成功/失败 | 页面错误 | Heap live-set |
|---|---:|---|---|---|---|---|
| LR-01 | 30 min | PASS | 5,941 / 743 / 742 | 6,932 / 0 | 0 | 5.6→22 MB（+16.4） |
| LR-02 | 60 min | PASS | 10,249 / 1,281 / 1,281 | 11,958 / 0 | 0 | 5.1→5.3 MB（+0.2） |
| LR-03 | 180 min | PASS（采样 178/180） | 22,421 / 2,803 / 2,802 | 26,158 / 0 | 0 | 5.1→5.4 MB（+0.3） |

### Gate 5

| 命令 | 结果 |
|---|---|
| `node tools/research-test.js` | 77/77 |
| `node tools/v1b-test.js` | 25/25 |
| `node tools/v1c-test.js` | 30/30 |
| `node tools/v1d-test.js --offline` | 31/31 |
| `node tools/v1-e2e-test.js --offline` | 10/10 |
| `node tools/v1-1-routing-test.js` / `v1-1-compat` / `v1-1-e2e --offline` | 20/20 / 20/20 / 16/16 |
| `node tools/v1-2-*` | 24/24、20/20、15/15、19/19 |
| `node tools/v1-3-*` | 20/20、17/17、25/25、12/12（重跑后）、2/2 |
| `node tools/v1-4-paper-attachment` / `v1-4-cloud-control` | 16/16 / 12/12 |
| `node tools/v1-5-perf-test.js` | 基线输出（control 中位 14.78 ms） |
| `node tools/v1-5-concurrency-test.js` | 17/17 |
| `node --expose-gc tools/v1-5-store-stress-test.js` | 6/6 |
| `node tools/selftest.js file:///.../index.html` | 156/156，CSP 违规 0 |
| `store-test` / `skill-test` / `consistency-test` | 17/17 / 10/10 / 7/7 |
| `a11y-test` / `rail-test` / `settings-test` / `ctx-isolation-test` | 13/13 / 17/17 / 18/18 / 14/14 |
| `v1-1-browser-test` / `v1-4-pages-test` / `v1-5-idb-stress-test` | 27/27 / 32/32 / 7/7 |
| `node tools/daily-test.js` | 31/31 |
| `node tools/v1-2-deploy-test.js` | 20/20 |
| `node tools/v1-4-ci-test.js` | 22/22 |
| `node tools/csptest.js` | 6/6 |
| `node tools/i18n-scan.js --quiet --max=0` | 界面 0 条 |
| `node tools/build-standalone.js` | 通过，53 脚本，1597 KB |
| `tools/build-pages.js`（v1-4-pages S0） | 通过，`_site` 1,661,340 B |

说明：`v1-3-paper-fulltext-test.js --offline` 首次 P2.1 因真实网络瞬时失败返回 `network`，立即重跑 `12/12`，属网络波动，非代码回归。

## 4. 未完成事项与分类

| 分类 | 事项 |
|---|---|
| 已完成 | Gate 1 Claims/Reducer/追加/双扣/预算/持久化；Gate 2 大文件与资源；Gate 3 缓存；Gate 4 30/60/180 分钟；Gate 5 Node/Chrome 回归与构建 |
| 部分完成 | LR-03 分钟采样 178/180（运行时长 180.0 分钟）；196 处常驻监听器仅间接验证；缓存容量淘汰仅静态确认 |
| 未完成 | 无（本次 Gate 1—5 范围内）；V1.4 正式发布属“等待授权”，V1.6 属“条件未满足” |
| 环境阻塞 | 无 |
| 需要真实 API Key | 真实云端模型 Provider 未测试（Stub/离线结果不冒充真实） |
| 无法测量 | 浏览器进程实际内存、ArrayBuffer 外部内存精确值、原生 listener 数量 |
| 等待授权 | Git commit/push、Pages Source 切换、正式发布 |

## 5. 当前架构状态（19 问）

1. Claims 缺口接入 Evaluator：**是**（`research.claims/verdicts`）。
2. Reducer 关键冲突接入：**是**（`reducer.conflicts` + `values[].id→required`）。
3. 8 个 gapCode 正常工作：**是**（E5—E10）。
4. 避免重复追加：**是**（`plan.expansion.appendedKeys`）。
5. 追加步骤真正执行：**是**（`x1.status=ok`，Runner 真实扣 searches）。
6. searches 双扣已修复：**是**（Control 只扣 appends）。
7. Replan Budget 符合 ADR-001：**是**（L1=0/L2=1/L3=2/L4=2，硬上限 2）。
8. Task 恢复后追加状态：**是**（plan 持久化；resume 不重复创建）。
9. FITS/PDF 大文件：**是**（FITS 至 200 MB；PDF 10 MB，>12 MB 按设计拦截）。
10. DOM/Blob/Listener 泄漏：**未发现**（面板路径 20 次干净；常驻监听器不可逐一验证）。
11. 缓存性能收益：**是**（命中 1 ms vs 未命中 1,045 ms）。
12. IndexedDB 降级：**是**（idb → ls 通过）。
13. 30 分钟测试：**通过**。
14. 60 分钟测试：**通过**。
15. 180 分钟测试：**通过**（180.0 分钟；分钟采样 178/180，2 个点因采样漂移缺失，未补造）。
16. 全量回归：**通过**（上述所有套件）。
17. V1.5 稳定性验收：**通过**（9.6 稳定性条款全部满足；存在 2 分钟采样漂移的测试仪表限制，非稳定性故障）。
18. V1.4 正式上线：**否**（未 commit/push；Pages 仍为 legacy branch）。
19. V1.6 开发门槛：**未满足**（依赖 V1.4 线上 + V1.5 稳定 + 真实问题输入）。

## 6. 版本状态矩阵

| 项目 | 状态 |
|---|---|
| 架构追踪 | 已完成 |
| 基础架构修复 | 已完成 |
| Claims 缺口接入 | 已完成 |
| Reducer 冲突接入 | 已完成 |
| Research Loop 测试 | 已完成 |
| FITS/PDF 大文件测试 | 已完成 |
| 资源泄漏测试 | 已完成（部分项不可精确测量） |
| 缓存性能测试 | 已完成 |
| 30 分钟测试 | 已完成 |
| 1 小时测试 | 已完成 |
| 3 小时测试 | 已完成（采样 178/180） |
| V1.4 正式发布 | 未完成（等待授权） |
| V1.5 稳定性验收 | 已通过 |
| V1.6 开发条件 | 未满足 |

## 7. Git 状态

| 项 | 值 |
|---|---|
| 当前分支 | `main` |
| HEAD | `d1eb025 fix(i18n): route toast messages through i18n; restore i18n-scan --quiet` |
| 工作区状态条目 | 119（13 个已跟踪修改 + 106 个未跟踪） |
| 意外删除 | 0 |
| 远程操作 | 未执行 `git add/commit/push/merge/rebase/reset/clean`；未修改 Pages Source/Actions |
| 未提交成果 | 全部保留在工作区 |

说明：GitHub Pages 仍为 legacy branch，V1.4 未正式上线；本次工作只做本地代码、测试与文档。

## 2026-11-02 发布后状态修正

| 项 | 最新状态 |
|---|---|
| V1.4 正式发布 | **RELEASED**：commit `7e50227`，test 41398644528，pages 41398780587 |
| GitHub Pages | **GitHub Actions**（build_type=workflow） |
| 线上 URL | https://jiangbei0921.github.io/Astrum/ |
| V1.5 稳定性 | PASS（30/60/180 分钟；180m 采样 178/180） |
| V1.6 | NOT STARTED；启动条件 2/5 满足，仍不启动 |
| 跨版本补齐 | T-B/T-D、搜索依赖、边界、SEM、HTML 全文、chunk 粒度、会话缓存已补；复杂 PDF/附件/浏览器 UI 仍 PARTIAL |
| 真实云端 | BLOCKED_API_KEY |

旧表 §5 第 18 项与 §6 “V1.4 未完成”已被本节覆盖。
