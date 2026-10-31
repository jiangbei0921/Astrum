# Agent 职责与协作规范

> 本文定义"谁能做什么、谁能叫谁、冲突谁说了算"。
> 现有 13 个 Agent 的角色**逐一对照 `core/agents.js:189-287` 的名册**，不做增删。

---

## 1. 三类角色（按实际能力划分，不按名册顺序）

### 1.1 决策型（4 个）

| Agent | 决策对象 | 决策依据 | 输出 |
|---|---|---|---|
| **Muse** | 意图、实体、时空条件 | 规则（`agents.js:446`）+ 可选 LLM | `intent` 标签 |
| **Kepler** | 数值（唯一权威） | `astro.js` 确定性计算 | `Qty` 数值 + 计算参数 |
| **Critic** | 能否交付、门槛判定 | 结构检查（`agents.js:716`）+ 扩展后的证据关系 | `gate` + `checks` |
| **Curator** | 多来源如何合并 | 去重键 + 保留差异（`research.js:758`） | 合并后的列表 |

### 1.2 领域计算型（6 个）—— 无自主决策

| Agent | 实际职责 | 代码位置 | 是否可并行 |
|---|---|---|---|
| Vega | 知识库条目匹配 | `resolveTargets` → `composeTarget` | 是（纯本地） |
| Cosmos | 宇宙学条目的共识分级与解释组织 | `composeCosmos:1384` | 是 |
| Nova | 爆发天体的时标与能量量级 | `composeNova:1476` | 是 |
| Helios | 太阳活动与空间天气判断链 | `composeHelios:1543` | 是 |
| Horizon | 观测条件打分、器材匹配 | `composeTarget` 内 `scoreTarget` | 是 |
| Scholar | 文献展示与引用格式 | `toSections:1049` | 是 |

### 1.3 展示型（3 个）—— 只影响排版，不影响结论

| Agent | 作用 | 约束 |
|---|---|---|
| Orion | 星图渲染参数（style/投影） | 不得改变坐标数值 |
| Lyra | 语体选择（专业/科普） | 不得改变事实陈述 |
| Navigator | 定位引导文案 | 不得注入新主张 |

> **规范**：展示型 Agent 的产物**必须**可被判定为"非事实内容"，在 trace 中标记 `role:'presentational'`，不参与 Critic 的证据统计。

---

## 2. 层级与调用边

```
L0  应用层        ask()  ← 唯一入口
L1  控制层        Muse → Router → Planner → Orchestrator
                                      ↕            ↓
L2  执行层        Tool Registry ←── Kepler / Evidence / KB / LLM Adapter
L3  评审层        Progress Evaluator → Scientific Critic
L4  输出层        Output Composer
```

**允许的调用边**（白名单，代码级校验）：

| 从 | 可调用 |
|---|---|
| 应用层 | 控制层 |
| Muse | LLM Adapter（意图）、Schema 校验 |
| Router | 无 |
| Planner | Tool Registry（**只读能力清单**） |
| Orchestrator | 执行层全部、TaskState |
| Progress Evaluator | 无（只读 TaskState） |
| Scientific Critic | Evidence Store（只读）、Kepler（只读复算） |
| Output Composer | 无（只读 TaskState） |

**禁止的调用边**：

- 执行层 → 控制层（领域模块不能反向调 Planner）
- 执行层 → 执行层横向调用（Vega 不能直接调 Nova；需由 Orchestrator 编排）
- 评审层 → 执行层写操作（Critic 不能改数据，只能要求重算）
- 任何 → LLM 的"自由生成事实"通道

---

## 3. 协作协议

### 3.1 委派（Delegation）

Orchestrator 向执行层派发的最小单元：

```js
Task = {
  id: 't2',
  tool: 'kepler.visibility',       // 必须在 Tool Registry 注册
  args: { target:'M42', place:{lat,lon}, night:'2026-10-30' },
  deps: ['t1'],                    // 依赖的 step id，空数组=可立即执行
  parallel: true,                  // 是否允许与同层其他 step 并行
  critical: true,                  // 失败是否中止整个任务
  budget: { ms: 3000, tokens: 0 }  // 本步预算
}
```

### 3.2 回传（Result）

```js
StepResult = {
  id: 't2', ok: true,
  tier: 'compute',                 // 复用 runtime.TIER（runtime.js:16）
  calc: CalcRecord | null,         // 仅 Kepler 产出
  evidence: EvidenceItem[] | null, // 仅 Evidence 产出
  sections: Section[],             // 可直接进入输出契约
  error: null | { kind, message, retriable },
  ms: 42, tokens: 0
}
```

**规则**：
- `ok:false` 时 `error.retriable` 决定是否由 Orchestrator 重试（上限 1 次）
- `calc` 与 `evidence` **互斥语义**：一个是"我算的"，一个是"别人说的"，渲染时不得混用同一措辞

### 3.3 协助请求（Help）

现有架构**不建议**开放 Agent 间自由求助（会引入不可控链）。替代方案：

- 领域模块需要额外信息 → **不自己去找**，而是在 `sections` 中留 `gap: { need:'search', query:'...' }`
- Orchestrator 收集所有 gap → 交给 Progress Evaluator 统一判断是否追加 Evidence 步骤

这样"求助"被收敛为**一次集中的追加决策**，而不是 N 次分散调用。

### 3.4 冲突处理（三方冲突，裁决权明确）

| 冲突类型 | 实例 | 裁决规则 | 裁决者 |
|---|---|---|---|
| **数值冲突** | Kepler 算 92.3°，网页说 91.8° | **Kepler 胜**；网页值仅作为"其他来源"并列展示，并标注偏差 | 权限矩阵（硬编码） |
| **来源冲突** | 两个数据库的年质不同 | **都保留**，标注 `conflictsWith`，交给 Critic 判 PARTIAL | Curator 记录，Critic 判定 |
| **结论冲突** | 知识库说"已成共识"，论文说"仍有争议" | **取更保守的表述**，并列出双方 | Critic |
| **意图冲突** | 规则判 tonight，LLM 判 target | **规则优先**（规则误判率低于小模型幻觉），但记录分歧用于日志 | Router |

---

## 4. 每个 Agent 的失败语义

| Agent | 失败表现 | 处理 | 用户可见后果 |
|---|---|---|---|
| Muse | LLM 超时/Schema 不符 | 回退规则 `detectIntent` | 无感（可能略微答偏） |
| Kepler | 计算异常（如坐标越界） | 该 step `ok:false`，不中止 | 缺该数值，其余正常 |
| Evidence | 全部源超时 | 整体降级本地索引 | 标"联网不可用" |
| LLM Adapter | 401/限流 | 回落本地表述（现有行为 `app.js:3938`） | 标"已回退本地表述" |
| Critic | 规则未通过 | 追加 boundary，verdict=PARTIAL | 显示评审缺口 |
| Curator | 输入为空 | 返回单列 | 不显示对比 |
| Custom Agent | 配置非法 | 跳过，记 warning | 使用默认章节集 |

---

## 5. 成本与配额（每个 Agent 的硬上限）

| 资源 | 上限 | 作用范围 |
|---|---|---|
| 单次 ask 的 LLM 调用 | 3 次（意图 1 + 表述 1 + 评审 0~1） | 全局 |
| 单次 ask 的检索轮次 | 3 轮（round1 + round2 + 反证 1） | Evidence |
| 单次 ask 的并行步数 | 4 | Orchestrator |
| 单次 ask 的总超时 | 45s（research 模式 120s） | Orchestrator |
| 重规划次数 | 2 | Planner |
| 追加检索次数 | 3 | Progress Evaluator |
| 单步重试 | 1 | Orchestrator |

超限行为：**停止并输出已有结果 + 缺口说明**，不静默继续。

---

## 6. 控制层组件不是 Agent（命名规范）

为避免名册膨胀，以下组件**不进 AGENTS 名册**，不显示头像，不参与 `trace` 的 agent 字段：

| 组件 | 在 trace 中的表示 |
|---|---|
| Router | 合并进 muse 的 step（`action:'路由'`） |
| Planner | `agent:'muse', action:'规划'` |
| Orchestrator | 不产生 trace（它是调用者） |
| Progress Evaluator | `agent:'critic', action:'进度评估'` |
| Tool Registry | 不产生 trace |

> 理由：`TRACE_ORDER`（`agents.js:710`）是用户可见的叙事顺序，加入控制层会打乱"谁在干什么"的直觉。控制层信息写入 `TaskState`，仅在调试面板可见。

---

## 7. 与现有实现的接缝

| 现有机制 | 在新架构中的位置 | 是否改动 |
|---|---|---|
| `step(agent, action, detail)` | 仍是唯一 trace 生产者 | 不改 |
| `TRACE_ORDER` | 决定展示顺序 | 不改，新 step 复用已有 agent id |
| `applyCustom` 权重机制 | 在 Output Composer 之后执行 | 不改 |
| `MEMORY` 环形 | Conversation Memory 层 | 不改 |
| `resolveByMemory` | Muse 内部指代消解 | 不改 |
| `criticReview` | Scientific Critic 的规则子集 | 扩展，不替换 |
