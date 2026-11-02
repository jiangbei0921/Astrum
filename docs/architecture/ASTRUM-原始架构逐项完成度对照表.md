# ASTRUM 原始架构逐项完成度对照表

> 日期：2026-11-02（最终版）
> 依据：`ASTRUM-全项目架构追踪与缺口分析.md` 的 ARCH-01—ARCH-30 原始矩阵；`V1-00-核心能力建设总蓝图.md`、ADR-001、V1.6 评估报告
> 方法：先完成工程实施与测试，最后逐项比对；保留原编号、原要求、原任务数，不删除、不降级、不把外部阻塞写成 PASS
> 状态口径：PASS / PARTIAL / BLOCKED_EXTERNAL / NOT_REQUIRED_BY_ORIGINAL / FAILED

## 1. 统计

| 状态 | 数量 |
|---|---:|
| PASS / COMPLETE | 24 |
| PARTIAL | 1（ARCH-27，真实 Provider Key） |
| BLOCKED_EXTERNAL / DEFERRED | 1（ARCH-30，V1.6 门槛未满足） |
| OPTIONAL（原始非必需，未实施） | 2（ARCH-10、ARCH-11） |
| NOT_REQUIRED_BY_ORIGINAL | 2（ARCH-12、ARCH-13） |
| FAILED | 0 |
| **合计** | **30** |

> 说明：ARCH-27 的代码/协议/Schema/错误分类已 PASS，仅真实模型调用因无 Key 为 PARTIAL；ARCH-30 是 V1.6 阶段整体，原始门槛 2/5，未启动开发，不是“遗漏”。

## 2. 逐项矩阵

| 原始编号 | 原始要求 | 当前实现位置 | 本次实施/验证 | 测试证据 | 最终状态 |
|---|---|---|---|---|---|
| ARCH-01 | Progress Evaluator 四决策 | `core/evaluator.js` | 复核 continue/append/replan/stop 规则 | `v1-5-research-loop` 29/29；E1/E5–E8c | PASS |
| ARCH-02 | Research Loop 与 replan 分离、只追加 | `core/planner.js` `expand`、`core/control.js` | 复核只追加、不重排既有步骤 | E2/E3/E9 | PASS |
| ARCH-03 | Replan L3/L4=2、L2=1、L1=0 | `core/control.js` `maxReplansOf`、ADR-001 | 复核预算与硬上限 | E4；ADR-001 | PASS |
| ARCH-04 | `progress.decided` 真实事件 | `core/task.js`、`core/control.js` | 复核事件类型与 payload 白名单 | E3.1/E9.5 | PASS |
| ARCH-05 | `appends/searches` 预算真实消耗 | Control/Evaluator | 修复 double-spend 后复核 | E3.4/E8.4/E8.5 | PASS |
| ARCH-06 | `plan.expanded` 事件 | `core/task.js`、`core/control.js` | 复核追加事件 | E3.2/E9.4 | PASS |
| ARCH-07 | 逐步骤实时进度 | `control-bridge` → `app.onEvent` → `.run-progress` / `.step-panel` | 新增真实事件驱动进度条与步骤面板 | 浏览器 B5/B6、B29；Node L17 | PASS |
| ARCH-08 | 三层 Memory 复用 | MEMORY/Thread/TaskStore/Evidence | 复核持久化与隔离 | selftest 156/156；v1c 30/30 | PASS |
| ARCH-09 | 固定 13 Agent、Tool-Centric | `core/agents.js`、Registry | 复核名册与工具边界 | 浏览器 13 Agent；线上 13 Agent | PASS |
| ARCH-10 | Controlled Delegation | 不存在 | 原计划 P2.5 可选，当前无生产问题 | 原始计划标注可选 | OPTIONAL（未实施，非遗漏） |
| ARCH-11 | search-pipeline 独立模块 | 不存在 | 原计划 P2+ 可选，当前端点链已满足 | 原始计划标注可选 | OPTIONAL（未实施，非遗漏） |
| ARCH-12 | Hypothesis Tournament | 未实现 | 原文档暂缓，不引入竞争式推理 | 原文“暂缓/不实施” | NOT_REQUIRED_BY_ORIGINAL |
| ARCH-13 | MAST 仅记录、不下载 | 未接入下载 | V1-00 §5 明确不下载 | V1-00 §5 | NOT_REQUIRED_BY_ORIGINAL |
| ARCH-14 | Evidence 缺口驱动追加 | Evaluator + Planner | 复核 gapCode 8 类驱动 | E5/E7/E8 | PASS |
| ARCH-15 | 冲突触发反证检索 | Evaluator + Planner | 复核 1σ 冲突与反证 | E6/E8c | PASS |
| ARCH-16 | Loop 最多 2 轮 | Control | 复核硬上限 | E3 | PASS |
| ARCH-17 | Loop 去重 | `plan.expansion.appendedKeys` | 复核同键不重复追加 | E6.5/E6.7/E9 | PASS |
| ARCH-18 | 取消不新增工作 | Control/Orchestrator | 复核取消路径 | E8b.3；v1c 30/30 | PASS |
| ARCH-19 | 有限重规划只重组 compose 依赖 | Planner.replan | 复核 | v1c 30/30 | PASS |
| ARCH-20 | TaskState 不挂 answer | Control/Adapter | 复核状态纯净 | control 86/86 | PASS |
| ARCH-21 | Claims R1–R4 | `core/claims.js`、`core/report.js` | 复核判定与路径分离 | v1-2 science 19/19；claims 48/48 | PASS |
| ARCH-22 | 旧 Critic 五项不变 | `core/agents.js` | 复核 | p0-03 53/53 | PASS |
| ARCH-23 | 13 Agent 名册 | `core/agents.js` | 复核 | selftest；线上 13 Agent | PASS |
| ARCH-24 | 7 模板、不新增第 8 | `core/planner.js` | 复核 T-A—T-G | control 86/86 | PASS |
| ARCH-25 | 12 Tool Registry | `core/registry.js` | 复核基线工具数 | G1；v1-4-ci 22/22 | PASS |
| ARCH-26 | 论文全文 Evidence | `core/paper-fulltext.js`、`core/pdf-text.js` | 新增 CID/ToUnicode、加密识别、HTML、会话缓存；合成样本 13 类 | 真实 arXiv 28/28；PDF fixtures 39/39；P5/P6 | PASS |
| ARCH-27 | 云端模型 Control Bridge | `core/control-bridge.js` `modelGenerate` | 协议/JSON/Schema/错误分类/重试入口完成；真实 Key 未提供 | v1-4-cloud 12/12；provider 4/4；`BLOCKED_API_KEY` | PARTIAL（仅真实 Key） |
| ARCH-28 | Pages 发布 | `.github/workflows/pages.yml`、`tools/build-pages.js` | 复核 Actions 部署、白名单、版本元数据 | Run 41411228469；线上 version.json；本地上线后复核 | PASS |
| ARCH-29 | 长时/IDB 压力 | `v1-5-longrun`、`v1-5-idb-stress`、`v1-5-bigfile` | 复核 30/60/180 分钟与 IDB/大文件 | LR-01/02/03；IDB 7/7；bigfile 13/13 | PASS |
| ARCH-30 | V1.6 云协议/OCR/多模型 | — | 复核五项启动条件：V1.4/V1.5 满足，生产问题/目标/指标未满足；不启动 | `V1.6-可选优化评估报告` §6 | BLOCKED_EXTERNAL（NOT_STARTED，门槛 2/5） |

## 3. 最终比对结论

- 原始矩阵 **30 项**：24 PASS、1 PARTIAL（ARCH-27 真实 Key）、1 BLOCKED_EXTERNAL/DEFERRED（ARCH-30 V1.6 门槛）、2 OPTIONAL、2 NOT_REQUIRED。无 FAILED。
- **未删除任何原始任务**；ARCH-10/11 仍保留为 OPTIONAL，ARCH-12/13 的“不实施”来自原始文档。
- **未降低验收标准**：ARCH-27 不写成 PASS；ARCH-30 不写成 PASS；真实样本缺失的扫描/CID 真实版面仍标为外部条件。
- **代码与文档一致性**：ARCH-07 从旧 DEFERRED 修正为 PASS（有 B5/B6/B29）；ARCH-28 从旧 EXTERNAL_BLOCKED 修正为 PASS（有线上 Run/version.json）；ARCH-26 增加 CID/加密/HTML/缓存证据。
- **测试通过但真实功能不成立**：未发现。扫描件明确失败、CID 无映射明确拒绝、MIME 冲突拒绝解析，均以“不产出错误结果”为验收。
- **破坏架构边界**：未发现。13 Agent、Muse、Tool-Centric、7 模板、旧兼容接口、ADR-001、纯静态架构均保留。
- **当前是否达到原始最终验收条件**：V1.4/V1.5 已验收；V1.6 按原始门槛不启动；真实 Key/真实复杂 PDF/正式下线授权为明确外部条件。按原始计划“门槛内可完成项”判定为完成。

## 4. 原始 10 问回答

| # | 问题 | 回答 |
|---|---|---|
| 1 | 原始架构计划一共多少项任务？ | 30 项 ARCH 矩阵（另有 V1.6 的 12 个候选项单独管理）。 |
| 2 | 多少项已完成？ | 24 项 PASS。 |
| 3 | 多少项需要外部条件？ | 1 项 PARTIAL（ARCH-27 真实 Key）+ 1 项 DEFERRED（ARCH-30 V1.6 门槛）；另有真实 PDF 样本/正式下线授权两项外部条件。 |
| 4 | 多少项属于原始设计明确不实施？ | 2 项 NOT_REQUIRED（ARCH-12/13）；2 项 OPTIONAL（ARCH-10/11）未实施但非遗漏。 |
| 5 | 是否存在原始任务被遗漏？ | 未发现。 |
| 6 | 是否存在代码与架构文档不一致？ | 旧文档中的 ARCH-07/28 已修正；其余以最终架构文档为准。 |
| 7 | 是否存在测试通过但真实功能不成立？ | 未发现；失败路径均明确分类且不产出伪造结果。 |
| 8 | 是否存在为通过验收而降低标准？ | 未发现；真实 Key、真实样本、正式下线均保留阻塞状态。 |
| 9 | 是否存在新增功能破坏原架构边界？ | 未发现。 |
| 10 | 是否达到原始架构计划的最终验收条件？ | V1.4/V1.5 达到；V1.6 按门槛不启动；剩余为真实外部输入。 |

## 5. 证据索引

- 实施：`ASTRUM-最终工程实施报告.md`
- 测试：`ASTRUM-全量测试与线上验收报告.md`
- 架构：`ASTRUM-最终架构文档.md`
- 外部条件：`ASTRUM-外部条件与剩余验证说明.md`
- 发布回滚：`docs/operations/ASTRUM-最终发布与回滚手册.md`
</content>
