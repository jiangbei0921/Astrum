# ASTRUM-05 Agent 与科研能力真实性审计

## 1. 真实调用链（已证实）

```
用户输入
  → app.js 事件处理 / AstroRequest.handle
  → Query.parseIntent / AstroRouter.route            （意图与来源路由）
  → AstroAdaptive / Runtime.classify                 （上下文与缺口）
  → AstroControl.run
       ├─ 创建 Task（预算分档、状态机）
       ├─ AstroPlanner.plan → chooseTemplate / BUILDERS（T-A..T-G 固定模板）
       ├─ AstroDagValidator（依赖环、并行冲突）
       ├─ AstroOrchestrator.runPlan
       │     ├─ nextBatch / readySteps
       │     ├─ executeOne → AstroRegistry + ToolGateway
       │     ├─ evidence.search / paper.search / kepler.* / kb.lookup / compose.*
       │     └─ 事件、检查点、预算、重试
       ├─ AstroReducer / AnswerComposer / Report
       └─ 持久化 → TaskStore；可恢复 → Recovery
```

- **决策**：`Router` + `Planner` 模板选择。
- **执行**：`Orchestrator` + `Registry` + `ToolGateway`。
- **验证**：`DagValidator`（结构）、`Evidence/Claims`（证据）、`Critic`（评议维度）、`Evaluator`（目标覆盖）。
- **存储**：`TaskStore`；**恢复**：`Recovery` + `Control.resume`。

**未发现**第二套并行执行路径或绕过 `ToolGateway` 的工具调用。

## 2. Agent 真实性

`agents.js` 定义 13 个角色：Muse、Vega、Cosmos、Kepler、Horizon、Orion、Lyra、Nova、Helios、Scholar、Critic、Curator、Navigator。

| 类别 | Agent | 实质 |
|---|---|---|
| 意图/编排 | Muse | 路由与流程编排（函数） |
| 天文计算 | Kepler、Horizon、Helios、Orion、Lyra、Nova、Vega、Cosmos | 调用 `astro`/星表/观测计划的计算与展示角色 |
| 研究 | Scholar | 检索、摘要、证据组织（固定流程） |
| 评议 | Critic | 规则化四维检查与文案 |
| 编目/导航 | Curator、Navigator | 知识整理与 UI 导航角色 |

### 结论（ASTRUM-003，P2）
**不存在 Agent 间的自主协商、消息传递或动态角色分配**。系统是 **Intent Routing + 固定模板 Pipeline**，Agent 是职责标签、提示词片段与 UI 人格；模型只在「来源摘要/答案表述」层被调用。`agents.js` 中未发现模型调用或 `step()` 式自主循环。

> README 标题「天文多智能体工作台」会让人预期自主协作，属**表述超出实现**。建议改为「多角色 Agent Pipeline」并在关于页说明。

## 3. 模型调用
- `sources.js` 定义 10 家 provider（OpenAI/Anthropic/Gemini/DeepSeek/Moonshot/智谱/通义/Mistral/Groq/xAI），统一走 `streamChat`，带 `AbortController` 与首包/总超时（默认 90s）。
- API Key 存 localStorage，仅用户配置后启用；未配置时明确降级为本地表述并提示。
- **无模型时不伪造外部事实**：`app.js` 在无可用证据时跳过模型调用，避免「看起来像结论的表述」。
- **提示注入面**：论文/网页内容进入提示词，存在间接注入可能；当前有字数截断与系统约束，但未做对抗性过滤（P3 潜在）。

## 4. Evidence / Claim

### 已证实实现
- `Evidence` 有稳定 ID（`E1..En`）、来源类型、URL/日期、`reliability`、`status`（supported/pending）。
- `Claims` 由真实证据合成（`compose-adapter` 的 `buildClaimsFromEvidence`），具备 `source` 枚举与 `calc` 记录。
- `judgeClaim` 具备 numeric/entity/semantic/source 四维结构；`research.verifyCitations` 与 `detectConflicts` 提供引用核验与数值冲突检测。
- Critic 的否定结论会进入答案「边界/限制」，不会把 pending 说成 supported。

### 偏离与风险
| 编号 | 结论 | 等级 |
|---|---|---|
| ASTRUM-009 | 真实证据合成出的 Claim 仍标 `origin:'p0-fixture'`，与「P3 生成应为 p3-generated」契约语义不符 | P2（已证实） |
| — | `source`/`entity` 维度目前是结构检查，实质可信度在 P3 计算；若契约要求四维实质判定，则属部分实现 | P3（高可信） |
| — | 外部内容提示注入未做专门过滤 | P3（潜在） |

## 5. P3 能力真实性
| 能力 | 状态 | 证据 |
|---|---|---|
| Goal 解析 / 子问题拆分 | 已实现 | `research-goal.js`、`planner.js`；p3-planning 28/28 |
| DAG 环检测 / 非法依赖 | 已实现 | `dag-validator.js`；p3-contract 22/22 |
| 并行冲突限制 | 已实现 | `dag-validator.parallelConflicts`；p3-executor 10/10 |
| 预算（ms/LLM/搜索） | 已实现且可测 | `task.BUDGET_LIMITS`；p3-progress 11/11 |
| 重试 / replan 上限 | 已实现 | `orchestrator.executeOne`、`control.run` |
| 暂停 | 边界生效，不可中断运行中步骤 | ASTRUM-006 |
| 恢复 | 手动恢复，三策略 | p3-resume 9/9 |

## 6. P4 能力真实性
- **已证实**：事件流、检查点、幂等恢复、恢复次数=1、Skill 版本变化阻止恢复、UI 恢复入口。
- 浏览器实测（headless Chrome，P4B）：
  - 真实后端为 IndexedDB；
  - 刷新后任务仍在、标记可恢复、检查点可读、步骤状态保留；
  - 用户恢复后返回 `PARTIAL`，`recoveries=1`；
  - 幂等步骤不重跑。
- **边界**：不是「关闭页面后继续执行」。纯前端无后台线程/Service Worker 续跑；实际语义是「中断后可恢复」。

## 7. 科研真实性结论
- 能做：**基于本地知识 + 实时检索证据的可溯源回答**，带证据 ID、引用核验、数值冲突检测、边界说明。
- 不能做：自主提出研究假设、开放式科学发现、多 Agent 辩论、自动实验设计、精密星历计算。
- 当前最真实的科研能力是「**有证据约束的检索增强问答与报告生成**」。

## 8. 评分
- Agent 真实性：**62**（角色丰富，但非自主多智能体）
- 科研链路完整性：**74**（证据/核验/报告完整，验证维度部分形式化）
- 综合：**66/100。**

## 9. 建议
1. README/关于页改为「多角色 Agent Pipeline」。
2. 修复 `claims.origin`。
3. 把 `source/entity` 维度做成实质判定，或在契约中明确为结构检查。
4. 增加外部内容提示注入的对抗测试。
5. 明确 P4 为「手动恢复」而非「后台续跑」。
