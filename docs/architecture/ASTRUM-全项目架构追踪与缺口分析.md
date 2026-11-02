# ASTRUM 全项目架构追踪与缺口分析

> 日期：2026-11-01
> 依据：02/03/04/05/08/09/15/16、P0-01、V1-00、V1-遗留清单、V1.5/V1.6 报告
> 方法：文档要求 ↔ 真实代码 ↔ 测试三者逐项核对
> 代码修改：本轮已修复 Progress Evaluator / Research Loop / Replan；其余只读

---

## 1. 架构追踪矩阵

| ID | 原始文档/章节 | 设计要求 | 目标模块 | 当前实现 | 测试 | 状态 |
|---|---|---|---|---|---|---|
| ARCH-01 | 03 §3.5 / 05 §5 | Progress Evaluator 输出 continue/append/replan/stop | `core/evaluator.js` | **已新增**纯规则模块 | v1-5-research-loop E1 | COMPLETE |
| ARCH-02 | 05 §5.1 / 08 | Research Loop 与 replan 分离，追加不改写 | `planner.expand` | **已新增** `expand()` | v1-5-research-loop E2/E3 | COMPLETE |
| ARCH-03 | 05 §4 / P0-01 | Replan 上限 L3/L4=2、L2=1 | `control.maxReplansOf` | **已统一为 2/1，ADR-001** | E4；v1c 收紧 1 通过 | COMPLETE |
| ARCH-04 | 05 §5 | `progress.decided` 真实发生 | `task.js` / `control.js` | **已发出**，payload action/reason | E3.1 | COMPLETE |
| ARCH-05 | 05 §4 | `appends` 预算真实消耗 | Control + evaluator | **已消耗** appends/search | E3.4 | COMPLETE |
| ARCH-06 | P0-01 §7 | `plan.expanded` 事件 | `task.js` / `control.js` | **已加入** EVENT_TYPES 并发出 | E3.2 | COMPLETE |
| ARCH-07 | L17/L23 | 逐步骤实时进度 | Control/UI | `emitNew` 仍集中回调；app 未传 onEvent | 无 | DEFERRED |
| ARCH-08 | 03 §3.10 / 04 | 三层 Memory | MEMORY/Thread/TaskStore/Evidence | 复用现有，未新增独立模块 | selftest/v1c | COMPLETE（复用） |
| ARCH-09 | 02/04 | 固定 13 Agent、Tool-Centric | AgentCore | 13 Agent 不变 | 旧套件 | COMPLETE |
| ARCH-10 | P0-01/09 | Controlled Delegation | `delegation.js` | 不存在 | 无 | OPTIONAL（P2.5） |
| ARCH-11 | P0-01/09 | search-pipeline | `search-pipeline.js` | 不存在 | 无 | OPTIONAL（P2+） |
| ARCH-12 | 03/09 | Hypothesis Tournament | — | 不存在 | 无 | NOT_REQUIRED（暂缓） |
| ARCH-13 | V1-00 §5 | MAST 仅记录、不下载 | — | 未接入 | v1-2-simbad offline | NOT_REQUIRED |
| ARCH-14 | 03/05 | Evidence 缺口驱动追加 | evaluator+planner | **已实现 no_evidence + Claims 支持/独立性缺口** | E5/E7/E8 | COMPLETE |
| ARCH-15 | 03/05 | 冲突触发反证检索 | evaluator/planner | **已从 Reducer 注入 conflicts；关键冲突才追加** | E6/E8c | COMPLETE |
| ARCH-16 | 05 §5.1 | Loop 最多 2 轮 | Control | 硬上限 2 | E3 | COMPLETE |
| ARCH-17 | 05 §5.1 | Loop 去重 | planner/evaluator | **plan.expansion.appendedKeys 按缺口键去重** | E6.5/E6.7/E9 | COMPLETE |
| ARCH-18 | V1-00 | 取消不新增工作 | Control/Orchestrator | 取消检查在 loop 每轮 | v1c/v1b | COMPLETE |
| ARCH-19 | V1-00 | 有限重规划只重组 compose 依赖 | Planner.replan | 未改 | v1c 30/30 | COMPLETE |
| ARCH-20 | P0-01 | TaskState 不挂 answer | Control/Adapter | 保持 | control-test | COMPLETE |
| ARCH-21 | 03/06 | Claims R1-R4 | claims/report | 研究路径已用；旧 Critic 仍 5 项 | v1-2 science | COMPLETE（路径分离） |
| ARCH-22 | 02 | 旧 Critic 五项不变 | agents.js | 兼容映射，注释明确 | p0-03 | COMPLETE（兼容） |
| ARCH-23 | V1-00 | 13 Agent 名册 | agents | 13 | selftest | COMPLETE |
| ARCH-24 | V1-00 | 7 模板 | planner | 7；未新增第 8 | control-test | COMPLETE |
| ARCH-25 | V1-00 | 12 Tool Registry | registry | 12；MAST 未新增 | control-test G1 | COMPLETE |
| ARCH-26 | V1.3 | 论文全文 Evidence | paper-fulltext | 远程+本机 PDF | v1-3/v1-4 | COMPLETE |
| ARCH-27 | V1.4 | 云端模型 Control | control-bridge modelGenerate | 统一入口；真实 key 未测 | v1-4-cloud 12/12 | PARTIAL（EXTERNAL） |
| ARCH-28 | V1.4 | Pages 发布 | pages.yml/_site | 配置完成；远端 legacy branch | v1-4-pages 32/32 | EXTERNAL_BLOCKED |
| ARCH-29 | V1.5 | 长时/IDB 压力 | tests | **30m/60m/180m 真实浏览器完成；IDB 1000 条已跑**（180m 采样 178/180，如实记录） | v1-5-longrun LR-01/02/03；v1-5-idb-stress | COMPLETE |
| ARCH-30 | V1.6 | 云输出协议/OCR/多模型 | — | gate 未满足 | 无 | DEFERRED |

---

## 2. 已确认的核心缺口

### 2.1 Progress Evaluator / Research Loop（本轮已修复）

修复内容：

- 新增 `core/evaluator.js`：纯规则，不调 LLM；
- 新增 `Planner.expand()`：仅 T-E/T-F，只追加 x 步骤，不改写原计划；
- Control 增加 `opts.researchLoop` 分支：每次决策发 `progress.decided`，追加发 `plan.expanded`，消耗 appends/searches，最多 2 轮；
- 默认关闭 `researchLoop`，只有浏览器研究请求显式开启，保护旧测试和旧调用；
- 新增 26 条测试。

仍存部分：

- 冲突反证：当前 Control 传入 `conflicts: []`，未把 Reducer 冲突注入 evaluator；
- Claims 缺口：Control 未构建 Claims 后回灌 evaluator，当前只按 Evidence 空缺判断；
- 追加后 Compose 由 Adapter fallback 重建，不是计划内二次 compose；
- 这些属于 PARTIAL，不是假 COMPLETE。

### 2.2 Replan 上限（本轮已按 ADR 统一）

- 决策：L1=0、L2=1、L3/L4=2；显式只能收紧；硬上限 2；
- 代码不再 `Math.min(1,...)`；
- `v1c` 显式 `maxReplans:1` 仍通过；
- 新增 E4 覆盖 L1-L4/收紧/硬上限。

### 2.3 实时进度（DEFERRED）

- `emitNew` 仍只在结束阶段批量回调；
- `controlAnswer` 未传 `onEvent`；
- 原文档 L17/L23 已列后续，不在本轮擅自实现。

### 2.4 Critic 与科学验证边界

- 旧 Critic 保持五项 checks（兼容）；
- 研究路径的 Claims/R1-R4 只在 research report 链路；
- 高风险研究若走 L1/旧路径不会经过 R1-R4；当前路由约束未显式拒绝该情况；
- 需要后续路由/兼容说明，未在本轮扩大。

---

## 3. 设计冲突

| 冲突 | 现状 | 处理 |
|---|---|---|
| Replan 1 vs 2 | 文档 2、代码 1、测试 1 | ADR-001 统一为 2/1，代码已改 |
| Progress Evaluator 是否当前必需 | P0-01/03/05 要求；V1-00 未单列 | 本轮按最终蓝图补齐，默认开关保护兼容 |
| Research Loop 轮数 | 文档 2 轮；searches 预算 L3=2 可能只允许 1 次追加 | 硬上限 2；实际由 appends/searches 预算联合限制 |
| MAST 是否必须 | V1-00 说仅记录；任务书说必须 | 以 V1-00 为准 NOT_REQUIRED |

---

## 4. 依赖关系

```text
Router → Planner → TaskState → Orchestrator → Runner → Tools
                     ↑                              ↓
                Evaluator ← Findings/Evidence/Claims
                     ↓ append
              Planner.expand → new steps → Runner
                     ↓
             Reducer → Report → UI
```

- Evaluator 只读状态，不执行工具；
- Planner.expand 只生成步骤；
- Control 负责预算、事件、循环上限；
- TaskStore 保存状态；
- UI 仍走既有 answer/research 渲染。

---

## 5. 修复优先级

| 优先级 | 项 | 状态 |
|---|---|---|
| P1 | Replan 上限统一 | 已修 |
| P1 | Progress Evaluator / Research Loop | 已修，PARTIAL 冲突/Claims 注入 |
| P2 | 实时进度 | DEFERRED |
| P2 | 冲突/Claims 注入 evaluator | 待补 |
| P3 | 长时/IDB/大文件/DOM 泄漏 | 待测 |
| P4 | V1.4 线上发布 | 需授权 |
| P5 | V1.6 候选 | gate 未满足 |

---

## 6. 验收标准

- E1-E4 26/26；
- control/v1b/v1c/p0-03 全绿；
- 20 问 diffBytes=0；
- 事件 payload 只含 action/reason；
- 不新增第 8 模板、不新增工具、不改变 13 Agent；
- 默认旧调用不受 researchLoop 影响；
- Replan 2 次可执行、第 3 次拒绝（由 ADR 与预算覆盖）。
