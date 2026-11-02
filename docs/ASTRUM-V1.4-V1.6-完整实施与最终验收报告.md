# ASTRUM V1.4—V1.6 完整实施与最终验收报告

> 日期：2026-11-01
> 范围：V1.4 架构收口、V1.5 性能/并发/稳定性、V1.6 可选优化评估
> 最终状态：**ASTRUM_V1.4_V1.6_INCOMPLETE**
> Git：未执行 add / commit / push / merge / rebase / reset / clean，未修改远端 Pages 设置

---

## 1. 版本完成情况

### 1.1 V1.4（架构与发布准备）

来源：V1-00、V1.1-V1.4 架构更新、V1 遗留清单。

| 状态 | 数量 |
|---|---:|
| COMPLETE | 20 |
| PARTIAL | 2（真实云模型凭据、复杂/扫描 PDF） |
| DEFERRED | 3（逐步骤进度、远端发布、V1.5 长时） |
| NOT_REQUIRED | 3（Agent Registry、独立 Memory、MAST 下载） |
| 合计 | 28 |

V1.4 本地架构与核心链路完成；远端 Pages 仍为旧版、未部署 V1.4，属于外部阻塞。

### 1.2 V1.5（性能、并发、稳定性）

| 任务 | 状态 | 证据 |
|---|---|---|
| 性能基线 | COMPLETE | v1-5-perf |
| 并发 1/2/4/8/16 | COMPLETE | v1-5-concurrency 17/17 |
| 资源/内存 | PARTIAL | 1 分钟冒烟 + GC；30m/1h/3h DEFERRED |
| 稳定性/异常恢复 | COMPLETE | v1c/v1d/v1-4 tests |
| TaskStore 压力 | COMPLETE | Node 1000 + 真实浏览器 IDB 1000（7/7，616 ms） |
| Progress Evaluator / Research Loop | COMPLETE（基础规则） | v1-5-research-loop 26/26；冲突/Claims 注入 PARTIAL |
| 逐步骤实时进度 | DEFERRED | 原计划后续项 |

### 1.3 V1.6（可选优化）

原计划明确 V1.6 只在 V1.4 线上验收、V1.5 稳定性验收、明确实际问题与指标全部满足时启动。

当前 gate 未满足：

- V1.4 未线上部署；
- V1.5 30m/1h/3h 未跑；
- 无可验证的实际问题/指标。

结论：**V1.6 NOT STARTED（DEFERRED）**，输出 `docs/architecture/V1.6-可选优化评估报告.md`，未新增 V1.6 代码。

---

## 2. 架构变化

### 2.1 本轮新增（V1.4 收口）

| 模块 | 变化 |
|---|---|
| `core/paper-attachment.js` | 本机 PDF → pdf-text → 章节/分块 → fulltext Evidence |
| `core/attachments.js` | 新增 `paper` 类型、12 MB 限制、页数/章节状态 |
| `core/attachment-evidence.js` | `fromPaperItem`、`allSupported` |
| `core/control-bridge.js` | 论文附件接管；`modelGenerate` 统一模型入口；v1.5.0 |
| `core/sources.js` | 模型超时支持外部 AbortSignal |
| `core/app.js` | PDF 展示；模型调用经 Bridge；研究任务云端表述段 |
| `core/evaluator.js` | Progress Evaluator：continue/append/replan/stop 纯规则 |
| `core/planner.js` | `expand()`：Research Loop 只追加研究步骤 |
| `core/control.js` | Research Loop 集成、`progress.decided`/`plan.expanded`、Replan 2 上限 |
| `core/task.js` | 新增 `plan.expanded` 事件类型 |
| `index.html` | 加载 paper-attachment / evaluator |

### 2.2 未新增（原设计边界）

- 不新增第 8 个任务模板；
- 不新增第 13 个工具；
- 不重构 13 Agent；
- 不新增 Agent Registry / 独立 Memory / MAST 下载；
- 不引入后端、数据库、事件总线、LangChain 等。

### 2.3 调用链

```text
附件 PDF
 → Attachments.kindOf/process
 → AstroPaperAttachment.parseBytes
 → PdfText / PaperFulltext.buildChunks/buildEvidence
 → AttachmentEvidence
 → ControlBridge.canControl / Control.run
 → Compose Adapter → Reducer → Report → Research UI

模型表述
 → app.modelGenerate
 → ControlBridge.modelGenerate
 → Sources.generate（超时/AbortSignal）
 → 成功/限流/超时/鉴权/取消分类
 → 研究答案追加表述段，科学结论不变
```

---

## 3. 性能与稳定性

### 3.1 性能基线（Node 本地）

| 指标 | avg | p95 | max |
|---|---:|---:|---:|
| Router.route | 0.30 ms | 0.50 ms | 6.44 ms |
| Planner.plan | 0.31 ms | 0.66 ms | 2.25 ms |
| Control 本地任务 | 18.85 ms | 14.67 ms | 39.88 ms |
| 本机 PDF 解析 | 0.35 ms | 0.65 ms | 3.86 ms |
| 100 Evidence + Claim + Report | 5.56 ms | 6.33 ms | 15.19 ms |
| TaskStore 200 次 | — | — | 116.37 ms |
| 冷加载 | — | — | 153.71 ms |

浏览器：

- 首屏脚本就绪 **770 ms**；
- 答案渲染 **600 ms**；
- Pages 子路径初始化 **1948 ms**。

### 3.2 并发

- Scheduler 实际上限 **4**；
- 1/2/4/8/16 设定下实测最大并发 1/2/4/4/4；
- 依赖顺序、失败隔离、取消、任务状态隔离全部通过（17/17）。

### 3.3 长时与内存

1 分钟冒烟：

- 16,884 次循环，0 失败；
- 1,689 次 Control；
- 清理前 heap 93.74 MB；
- 清理 + GC 后 heap **9.88 MB**；
- 峰值 heap 154.49 MB，RSS 231.31 MB。

30m/1h/3h：**DEFERRED**；browser IDB 1000 条压测：**DEFERRED**。

---

## 4. 测试报告

| 测试 | 结果 |
|---|---|
| V1.4 论文 PDF 附件 | 16/16 |
| V1.4 云端 Control | 12/12 |
| V1.5 性能基线 | 完成，真实测量 |
| V1.5 并发 | 17/17 |
| V1.5 TaskStore 压力 | 6/6 |
| V1.5 真实浏览器 IDB 1000 | 7/7（写入 616 ms） |
| V1.5 Progress Evaluator / Research Loop | 26/26 |
| V1.5 1 分钟长跑 | 0 失败 |
| 全量离线核心命令 | 全部 exit 0 |
| 全量浏览器套件 | 全部 exit 0 |
| selftest | 156/156，CSP 0 |
| v1-1 browser | 27/27 |
| Pages | 32/32 |
| p0-03 / 20 问 | 53/53，diffBytes=0 |
| 真实网络 | 7/7 套件 PASS |
| i18n | 0 条残留 |
| CI 配置 | 22/22 |

真实网络：SIMBAD 9/9、v1d 33/33、v1-e2e 25/25、v1-1-e2e 19/19、paper-fulltext 18/18、paper-e2e 9/9、research-online 82/82。Semantic 429、Wikipedia 超时按真实状态跳过。

构建：

- standalone：53 内联脚本 / 1,583 KB；
- `_site`：58 文件（core 45 / data 8）/ 1,647,340 B；
- 资源引用 54 个，密钥 0、绝对路径 0。

---

## 5. 遗留问题

| 问题 | 状态 | 原因 |
|---|---|---|
| 真实云端模型 Provider | EXTERNAL_BLOCKED | 无用户 API Key，仅 stub 验证 |
| 复杂/扫描 PDF | PARTIAL | 零依赖解析限制；无 OCR |
| V1.5 30m/1h/3h | DEFERRED | 未执行无人值守长时 |
| 浏览器 IDB 1000 条 | DONE | v1-5-idb-stress 7/7 |
| 逐步骤实时进度 | DEFERRED | 原计划后续项 |
| V1.4 线上 Pages | EXTERNAL_BLOCKED | Pages 为 legacy branch，未部署 |
| V1.6 | DEFERRED | 原计划 gate 未满足 |
| MAST / Agent Registry / 独立 Memory | NOT_REQUIRED | 原蓝图职责边界 |

---

## 6. Git 变更清单（待授权）

当前：

- 分支 `main`，本地 HEAD `d1eb02504df1c9795f4a81d486a9a65ec90396a9`；
- `origin/main` 已 fetch 为 `8e7e9b3f81af93177c4ef1c4098378217c3dbe03`（每日数据提交）；
- 工作区 dirty：13 个已修改、91 个未跟踪、0 删除；
- 未 commit、未 rebase、未 push。

主要新增：

```text
core/paper-attachment.js
core/evaluator.js
tools/v1-5-research-loop-test.js
tools/v1-5-idb-stress-test.js
docs/architecture/ASTRUM-全项目架构追踪与缺口分析.md
docs/architecture/ASTRUM-核心架构决策报告.md
docs/architecture/ADR-001-replan-budget.md
tools/v1-4-paper-attachment-test.js
tools/v1-4-cloud-control-test.js
tools/v1-5-perf-test.js
tools/v1-5-concurrency-test.js
tools/v1-5-longrun-test.js
tools/v1-5-store-stress-test.js
docs/V1.5-架构更新实施报告.md
docs/V1.5-性能与稳定性报告.md
docs/architecture/V1.6-可选优化评估报告.md
docs/ASTRUM-V1.4-V1.6-完整实施与最终验收报告.md
```

修改：

```text
index.html
core/app.js
core/attachments.js
core/attachment-evidence.js
core/control-bridge.js
core/sources.js
.github/workflows/test.yml
```

不应提交：

```text
_site/
astrum-standalone.html
dev/
临时文件/缓存
```

发布前必须：

1. 用户明确授权 Git 写操作；
2. fetch 后确认 `origin/main` 仍为 `8e7e9`；
3. 处理远端每日数据提交（rebase/merge，不覆盖）；
4. 将 Pages Source 切换为 GitHub Actions（当前 legacy branch；否则 push 会公开 tools/docs）；
5. 统一 commit + push，观察 test/network/pages；
6. 真实线上验收。

---

## 7. 最终状态

**ASTRUM_V1.4_V1.6_INCOMPLETE**

原因：

- V1.4 本地架构与核心链路完成，但远端 Pages 未部署/未线上验收；
- V1.5 性能/并发/稳定性基线完成，但 30m/1h/3h 长时与浏览器 IDB 1000 条压测未执行；
- V1.6 按原计划 gate 未满足，未启动，不属于擅自遗漏；
- 真实云模型 Provider 因无密钥未验证。

本地代码、测试与文档已完成；剩余均为外部/长时/授权项，未用 Mock 或本地结果冒充线上/真实结果。
