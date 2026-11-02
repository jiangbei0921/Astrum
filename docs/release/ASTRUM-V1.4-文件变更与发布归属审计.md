# ASTRUM V1.4 文件变更与发布归属审计

> 审计日期：2026-11-02
> 审计范围：项目工作区
> 原则：只读审计，不删除、不移动、不提交、不推送任何文件
> 状态口径：PASS / PARTIAL / FAIL / BLOCKED / NOT_TESTED / NOT_APPLICABLE

---

## 1. Gate 0 工作区基线（实测）

| 项 | 实测值 | 判定 |
|---|---|---|
| 当前分支 | `main` | PASS |
| 本地 HEAD | `d1eb02504df1c9795f4a81d486a9a65ec90396a9` | PASS |
| origin/main | `8e7e9b3f81af93177c4ef1c4098378217c3dbe03` | PASS（已读取） |
| 本地与远程差异 | origin/main 领先 1 个提交（`8e7e9b3 chore: 每日前沿同步 2026-11-01`，仅 `data/daily.js`）；本地领先 0 | **BLOCKED（发布前需整合）** |
| 已跟踪修改 | 13 个 | PASS（与上轮一致） |
| 未跟踪条目 | 106 个（104 个文件 + `docs/logs/`、`tools/fixtures/` 2 个目录项） | PASS（与上轮一致） |
| 展开后的未跟踪真实文件 | 111 个（新增 6 个日志文件 + 1 个 fixture，扣除 2 个目录项） | PASS |
| 删除文件 | 0 | PASS |
| 冲突文件 | 0 | PASS |
| 合并/变基状态 | 无 `MERGE_HEAD` / `rebase-merge` / `rebase-apply` | PASS |

> 本次生成 5 份 `docs/release/` 审计文档后，默认 `git status` 的未跟踪条目会从 106 变为 107（`docs/release/` 折叠为 1 个目录项），展开后的真实未跟踪文件从 111 增至 116；这是审计产物的增量，不是原有文件被改动。

---

## 2. 已跟踪修改文件（13 个）

| # | 文件 | 用途 | 本次修改摘要 | 兼容/风险 | 入仓库 | 入部署 | 结论 |
|---|---|---|---|---|---|---|---|
| 1 | `.github/workflows/daily.yml` | 每日前沿抓取 | Node 20 → 22 | 仅 CI；不影响运行时 | 是 | 否 | PASS |
| 2 | `.github/workflows/test.yml` | CI 测试 | 拆为 static / offline-core / offline-browser；新增 V1.4/V1.5 测试步骤；Node 统一 22 | 仅 CI；远端尚未运行 | 是 | 否 | PASS（本地等价通过，远端 NOT_TESTED） |
| 3 | `.gitignore` | 忽略规则 | 新增 `_site/` | 防止发布暂存目录入库 | 是 | 否 | PASS |
| 4 | `README.md` | 项目说明 | 更新为 GitHub Actions 发布说明 | 文档；legacy 发布时会公开 | 是 | 否 | PASS |
| 5 | `assets/app.css` | 样式 | 新增 Research Report 卡片样式（约 43 行） | 复用既有变量；无新框架 | 是 | 是 | PASS |
| 6 | `core/agents.js` | 13 Agent 与答案组装 | `buildAnswer` 支持 preloaded；`meta.review` 增加兼容维度；导出 `ephemFor` | 旧 5 项 checks 与 sections 不变；p0-03 diffBytes=0 | 是 | 是 | PASS |
| 7 | `core/app.js` | UI 与运行入口 | 接入 Control/ResearchUI/TaskStore 恢复、附件与云端表达；错误路径 `console.warn` | 新增 UI 路径；无 TODO/debugger；浏览器测试通过 | 是 | 是 | PASS（`innerHTML` 列为安全审计项） |
| 8 | `core/attachments.js` | 附件处理 | FITS 完整解析（8 MB 上限）；PDF 分类与 12 MB 上限 | 旧字段保留；FITS/PDF 测试通过 | 是 | 是 | PASS |
| 9 | `core/i18n.js` | 国际化 | 新增研究报告/任务恢复词条 | 英文界面 0 残留 | 是 | 是 | PASS |
| 10 | `core/runtime.js` | Qty 契约 | 追加 `epoch/frame/inputs/uncertainty` 与 `legacy` | 旧 `v/u/err/src/basis` 不变；task-test 24/24 | 是 | 是 | PASS |
| 11 | `core/simbad.js` | SIMBAD 客户端 | 多 host 回退、外部 AbortSignal、缓存不变 | 旧 `lookup(ident)` 仍可用；测试通过 | 是 | 是 | PASS |
| 12 | `core/sources.js` | 多源检索/模型请求 | 中止传播、arXiv/OpenAlex/S2 PDF 元数据 | 旧参数兼容；i18n/selftest 通过 | 是 | 是 | PASS |
| 13 | `index.html` | 页面入口 | CSP 增补 SIMBAD/arXiv 域名；新增 23 个核心脚本标签 | 加载顺序经 selftest/pages 验证；CSP 违规 0 | 是 | 是 | PASS |

### 2.1 Research Loop 修复真实性复核（代码级）

| 项 | 证据 | 判定 |
|---|---|---|
| Claims 接入 | `core/evaluator.js` `normResearch` 读取 `answer.research.claims/verdicts`；`core/control.js` 传入 `research` | PASS |
| Reducer 冲突接入 | `conflictGaps()` 读取 `reducer.conflicts`，以 `values[].id → Claim.required` 判关键性 | PASS |
| searches 双扣修复 | `core/control.js` 追加仅 `T.spend({appends:1})`；Runner 执行时扣 `searches:1` | PASS（`x1.ok`、`used.searches=3`） |
| 追加去重 | `plan.expansion.appendedKeys` + `Planner.expand` 拒绝重复 key | PASS（E6.5/E6.7/E9） |
| appendedKeys 持久化 | `AstroTask.create` 保留 `plan` 整对象；`store.get` 后仍存在 | PASS（E9.1/E9.2） |
| 旧接口兼容 | `researchLoop` 默认关闭；无 `research` 时走旧逻辑；旧 20 问 diffBytes=0 | PASS |

### 2.2 调试/未完成代码检查

- 13 个修改文件中未发现 `debugger`、`TODO`、`FIXME`、`HACK`。
- `core/app.js` 的 `console.warn` 只出现在 `catch` 错误路径（研究渲染/控制失败/路由失败/任务恢复失败），属可观测性日志，不是遗留调试输出。
- 未发现被注释掉的入口或半成品分支。

---

## 3. 未跟踪文件：Production（正式运行必需，22 个）

全部被 `index.html` 引用、全部进入 `_site`、全部不含本地绝对路径。

| 文件 | 字节 | 用途 | 入仓库 | 入部署 | 结论 |
|---|---:|---|---|---|---|
| `core/task.js` | 30,209 | TaskState/Step/Event/Budget | 是 | 是 | PASS |
| `core/schema.js` | 6,494 | 计划/参数 Schema | 是 | 是 | PASS |
| `core/claims.js` | 33,155 | Claim 结构与 R1–R4 | 是 | 是 | PASS |
| `core/evidence.js` | 11,689 | Evidence 规范化/去重 | 是 | 是 | PASS |
| `core/router.js` | 7,258 | 复杂度/模式路由 | 是 | 是 | PASS |
| `core/evaluator.js` | 15,945 | Progress Evaluator | 是 | 是 | PASS |
| `core/planner.js` | 21,163 | 7 模板/重规划/expand | 是 | 是 | PASS |
| `core/reducer.js` | 13,743 | 去重/冲突/报告上下文 | 是 | 是 | PASS |
| `core/report.js` | 13,248 | 研究报告 | 是 | 是 | PASS |
| `core/registry.js` | 23,504 | 12 工具注册表 | 是 | 是 | PASS |
| `core/orchestrator.js` | 16,626 | Scheduler/Runner/取消/重试 | 是 | 是 | PASS |
| `core/task-store.js` | 6,335 | IndexedDB→localStorage→memory | 是 | 是 | PASS |
| `core/control.js` | 18,575 | 控制层/Research Loop/重规划 | 是 | 是 | PASS |
| `core/control-bridge.js` | 4,917 | UI 与 Control/模型桥接 | 是 | 是 | PASS |
| `core/request.js` | 3,351 | 外部请求封装 | 是 | 是 | PASS |
| `core/compose-adapter.js` | 13,450 | 旧 compose 兼容 + research 注入 | 是 | 是 | PASS |
| `core/research-ui.js` | 7,330 | 研究报告 DOM 渲染 | 是 | 是 | PASS |
| `core/attachment-evidence.js` | 4,656 | 附件 → Evidence | 是 | 是 | PASS |
| `core/fits.js` | 15,067 | FITS 零依赖解析 | 是 | 是 | PASS |
| `core/pdf-text.js` | 14,382 | PDF 文本提取（12 MB 上限） | 是 | 是 | PASS |
| `core/paper-fulltext.js` | 9,333 | arXiv 全文下载/分块 | 是 | 是 | PASS |
| `core/paper-attachment.js` | 4,380 | 本机 PDF → 全文 Evidence | 是 | 是 | PASS |

## 4. 未跟踪文件：Test（40 个）

| 文件 | 用途 | 入仓库 | 入部署 | 结论 |
|---|---|---|---|---|
| `tools/task-test.js` | TaskState 契约 | 是 | 否 | PASS |
| `tools/p0-03-test.js` | 20 问逐字节基线 | 是 | 否 | PASS |
| `tools/control-test.js` | Router/Planner/Control | 是 | 否 | PASS |
| `tools/b8-test.js` | 数据闭环 | 是 | 否 | PASS |
| `tools/v1b-test.js` | V1 B 阶段 | 是 | 否 | PASS |
| `tools/v1c-test.js` | V1 C 阶段/恢复/重规划 | 是 | 否 | PASS |
| `tools/v1d-test.js` | Evidence/FITS/报告 | 是 | 否 | PASS |
| `tools/v1-e2e-test.js` | V1 端到端 | 是 | 否 | PASS |
| `tools/v1-1-routing-test.js` | V1.1 分流 | 是 | 否 | PASS |
| `tools/v1-1-compat-test.js` | V1.1 兼容 | 是 | 否 | PASS |
| `tools/v1-1-e2e-test.js` | V1.1 端到端 | 是 | 否 | PASS |
| `tools/v1-1-browser-test.js` | V1.1 真实 Chrome | 是 | 否 | PASS |
| `tools/v1-2-routing-test.js` | V1.2 分流 | 是 | 否 | PASS |
| `tools/v1-2-attachment-test.js` | V1.2 附件 | 是 | 否 | PASS |
| `tools/v1-2-comparison-test.js` | V1.2 对比 | 是 | 否 | PASS |
| `tools/v1-2-science-test.js` | V1.2 科学规则 | 是 | 否 | PASS |
| `tools/v1-2-simbad-test.js` | SIMBAD 边界 | 是 | 否 | PASS |
| `tools/v1-2-deploy-test.js` | 部署静态检查 | 是 | 否 | PASS |
| `tools/v1-3-routing-test.js` | V1.3 分流 | 是 | 否 | PASS |
| `tools/v1-3-comparison-test.js` | V1.3 对比 | 是 | 否 | PASS |
| `tools/v1-3-paper-fulltext-test.js` | V1.3 全文 | 是 | 否 | PASS |
| `tools/v1-3-paper-e2e-test.js` | V1.3 论文 E2E | 是 | 否 | PASS |
| `tools/v1-3-compatibility-test.js` | V1.3 兼容 | 是 | 否 | PASS |
| `tools/v1-4-ci-test.js` | CI/Pages 配置检查 | 是 | 否 | PASS |
| `tools/v1-4-cloud-control-test.js` | 云端 Control 桥接 | 是 | 否 | PASS |
| `tools/v1-4-network-ci.js` | 网络测试运行器 | 是 | 否 | PASS |
| `tools/v1-4-pages-test.js` | 发布目录/子路径 | 是 | 否 | PASS |
| `tools/v1-4-paper-attachment-test.js` | PDF 附件 | 是 | 否 | PASS |
| `tools/v1-5-perf-test.js` | 性能基线 | 是 | 否 | PASS |
| `tools/v1-5-concurrency-test.js` | 并发/取消 | 是 | 否 | PASS |
| `tools/v1-5-store-stress-test.js` | TaskStore 压力 | 是 | 否 | PASS |
| `tools/v1-5-research-loop-test.js` | Research Loop | 是 | 否 | PASS |
| `tools/v1-5-research-loop-claims-test.js` | Claims/Reducer 集成 | 是 | 否 | PASS |
| `tools/v1-5-idb-stress-test.js` | 真实 IDB 1000 条 | 是 | 否 | PASS |
| `tools/v1-5-bigfile-test.js` | FITS/PDF 大文件 | 是 | 否 | PASS |
| `tools/v1-5-resource-test.js` | DOM/Blob/Listener/Timer | 是 | 否 | PASS |
| `tools/v1-5-cache-test.js` | 缓存命中/降级 | 是 | 否 | PASS |
| `tools/v1-5-longrun-test.js` | 30/60/180 分钟真实长跑 | 是 | 否 | PASS |
| `tools/build-pages.js` | `_site` 白名单构建 | 是 | 否 | PASS |
| `tools/fixtures/p0-03-baseline.json` | 20 问基线数据 | 是 | 否 | PASS |

## 5. 未跟踪文件：Docs（41 个）

全部只进入仓库，不进入部署产物。

| 文件 | 内容类别 | 入仓库 | 入部署 |
|---|---|---|---|
| `docs/ASTRUM-V1.4-V1.6-完整实施与最终验收报告.md` | 总体验收 | 是 | 否 |
| `docs/P0-04-最终工程收尾验收.md` | P0 验收 | 是 | 否 |
| `docs/P0-05-B阶段定向架构验收.md` | P0 验收 | 是 | 否 |
| `docs/P0-06-B阶段数据闭环验收.md` | P0 验收 | 是 | 否 |
| `docs/V1-最终验收报告.md` | V1 验收 | 是 | 否 |
| `docs/V1.1-实施报告.md` | V1.1 | 是 | 否 |
| `docs/V1.2-实施报告.md` | V1.2 | 是 | 否 |
| `docs/V1.3-实施报告.md` | V1.3 | 是 | 否 |
| `docs/V1.4-实施报告.md` | V1.4 | 是 | 否 |
| `docs/V1.4-现状审查报告.md` | V1.4 | 是 | 否 |
| `docs/V1.4-远端同步前置审查报告.md` | V1.4 | 是 | 否 |
| `docs/V1.5-性能与稳定性报告.md` | V1.5 | 是 | 否 |
| `docs/V1.5-架构更新实施报告.md` | V1.5 | 是 | 否 |
| `docs/architecture/ADR-001-replan-budget.md` | 架构决策 | 是 | 否 |
| `docs/architecture/ASTRUM-Research-Loop-证据质量评估修复报告.md` | Gate 1 报告 | 是 | 否 |
| `docs/architecture/ASTRUM-V1.4-V1.6-阶段验收与剩余工作报告.md` | 阶段验收 | 是 | 否 |
| `docs/architecture/ASTRUM-V1.5-浏览器资源稳定性测试报告.md` | Gate 2/3 | 是 | 否 |
| `docs/architecture/ASTRUM-V1.5-长时间运行测试报告.md` | Gate 4 | 是 | 否 |
| `docs/architecture/ASTRUM-全项目架构追踪与缺口分析.md` | 架构追踪 | 是 | 否 |
| `docs/architecture/ASTRUM-核心架构决策报告.md` | 架构决策 | 是 | 否 |
| `docs/architecture/P0-00-现有架构设计整合与差距分析.md` | P0 | 是 | 否 |
| `docs/architecture/P0-00.1-关键架构决策裁定.md` | P0 | 是 | 否 |
| `docs/architecture/P0-01-目标架构总蓝图.md` | P0 | 是 | 否 |
| `docs/architecture/P0-01.1-设计冻结检查.md` | P0 | 是 | 否 |
| `docs/architecture/V1-00-核心能力建设总蓝图.md` | V1 | 是 | 否 |
| `docs/architecture/V1-遗留问题清单.md` | 遗留清单 | 是 | 否 |
| `docs/architecture/V1.1-架构更新.md` | V1.1 | 是 | 否 |
| `docs/architecture/V1.2-场景覆盖矩阵.md` | V1.2 | 是 | 否 |
| `docs/architecture/V1.2-架构更新.md` | V1.2 | 是 | 否 |
| `docs/architecture/V1.2-科学证据规则.md` | V1.2 | 是 | 否 |
| `docs/architecture/V1.3-场景覆盖矩阵.md` | V1.3 | 是 | 否 |
| `docs/architecture/V1.3-架构更新.md` | V1.3 | 是 | 否 |
| `docs/architecture/V1.3-科学证据更新.md` | V1.3 | 是 | 否 |
| `docs/architecture/V1.3-论文全文处理规范.md` | V1.3 | 是 | 否 |
| `docs/architecture/V1.4-CI设计与验收.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.4-Pages部署规范.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.4-发布检查清单.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.4-待提交清单.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.4-架构更新.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.4-线上验证报告.md` | V1.4 | 是 | 否 |
| `docs/architecture/V1.6-可选优化评估报告.md` | V1.6 评估 | 是 | 否 |

## 6. 未跟踪文件：Logs（6 个）

| 文件 | 字节量级 | 用途 | 入仓库 | 入部署 |
|---|---|---|---|---|
| `docs/logs/longrun-LR-01.jsonl` | 30 行分钟采样 | 30 分钟真实运行证据 | 建议入库/留档 | 否 |
| `docs/logs/longrun-LR-02.jsonl` | 60 行 | 60 分钟证据 | 建议入库/留档 | 否 |
| `docs/logs/longrun-LR-03.jsonl` | 178 行 | 180 分钟证据（采样 178/180） | 建议入库/留档 | 否 |
| `docs/logs/longrun-LR-SMOKE.jsonl` | 1 行 | 1 分钟冒烟 | 可留档 | 否 |
| `docs/logs/longrun-LR-SMOKE2.jsonl` | 1 行 | 1 分钟冒烟 | 可留档 | 否 |
| `docs/logs/longrun-LR-SMOKE3.jsonl` | 2 行 | 2 分钟冒烟 | 可留档 | 否 |

## 7. 未跟踪文件：Build（2 个）

| 文件 | 用途 | 入仓库 | 入部署 |
|---|---|---|---|
| `.github/workflows/network.yml` | 网络测试独立 workflow | 是 | 否 |
| `.github/workflows/pages.yml` | Pages Actions 发布 workflow | 是 | 否 |

## 8. 本次审计新增 Docs（5 个）

`docs/release/` 下 5 份审计文档只入仓库、不入部署；生成后默认 `git status` 的未跟踪条目会从 106 变为 107（`docs/release/` 折叠为 1 个目录项），展开后的真实未跟踪文件从 111 变为 116。未修改任何原文件。

## 9. 汇总

| 类别 | 数量 | 入仓库 | 入部署 |
|---|---:|---|---|
| 已跟踪修改 | 13 | 是 | 仅 9 个运行文件（CSS/agents/app/attachments/i18n/runtime/simbad/sources/index） |
| Production | 22 | 是 | 是 |
| Test | 40 | 是 | 否 |
| Docs | 41（+本次 5） | 是 | 否 |
| Logs | 6 | 建议留档 | 否 |
| Build | 2 | 是 | 否 |
| **未跟踪真实文件合计** | **111（本次后 116）** | — | — |

结论：未跟踪文件中 22 个是正式运行必需；其余 89 个（本次后 94 个）应进入仓库但不得进入公开站点。没有发现应删除的垃圾文件；`dev/` 为既有 gitignore 本地调试目录，不在 106 条目内，也不得部署。
