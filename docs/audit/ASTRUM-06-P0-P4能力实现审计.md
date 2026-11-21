# ASTRUM-06 P0–P4 能力实现审计

## 1. 总览
| 阶段 | 宣称目标 | 实现结论 | 测试证据（本次实跑） |
|---|---|---|---|
| P0 | 身份、权限、Schema、Tool、存储、隔离 | 基本完整 | p0-security 38/38、p0-03 53/53、p0-migration 10/10 |
| P1 | 项目、记忆、证据、上下文、导入导出 | 完整 | 5 套 220/220 |
| P2 | Skill 生命周期 | 完整 | 8 套 374/374 |
| P3 | 目标、Plan、DAG、执行、预算、恢复 | 基本完整 | 7 套 103/103 |
| P4 | 事件、检查点、幂等恢复、生命周期 | 真实可用、语义有限 | 8 套 139/139 + browser 13/13 |

## 2. P0 明细
| 能力 | 实现 | 结论 |
|---|---|---|
| Principal 构造 | `Security.makePrincipal`，来源 `ProfileContext` | 已证实 |
| 授权 | `Security.authorize`，能力/owner/project/会话 | 已证实 |
| 工具入口 | `ToolGateway.call`，Schema + 禁止身份参数 | 已证实 |
| 存储隔离 | `Profile.ns` 分库 + owner 过滤 | 已证实（非安全边界） |
| 上下文隔离 | `ProfileContext.sameSession` | 已证实 |
| 导入导出 | `p1-import-export` | 已证实 |
| 迁移 | `p0-migration`、`p4-migration` | 已证实 |

**遗留**：档案切换无认证（ASTRUM-007）；API Key 明文（P3）。

## 3. P1 明细
- 项目 CRUD/归档、记忆提案-审批、证据 ID、研究上下文、导入导出均有实现与测试。
- 证据链与 Claim 结构存在；`origin` 语义有偏差（ASTRUM-009）。

## 4. P2 明细
- 提案 → 校验 → 审批 → 发布 → 执行 → 版本 → 回滚闭环完整。
- 执行前校验发布态、档案、项目、Agent 白名单、能力/工具；参数禁止身份字段。
- 静态校验禁止动态代码；未发现 `eval`。
- **遗留**：静态规则无法穷举语义越权（P3 潜在）。

## 5. P3 明细
| 能力 | 状态 | 说明 |
|---|---|---|
| 意图/目标解析 | 已实现 | `research-goal.js` |
| 模板 Plan | 已实现 | T-A..T-G |
| DAG 校验 | 已实现 | 环、非法依赖、并行冲突 |
| 编排执行 | 已实现 | 批次调度、依赖、可选依赖 |
| 预算 | 已实现 | ms/tokens/llmCalls/searches/replans/recoveries |
| 重试 | 已实现 | `maxAttempts` |
| 暂停 | 边界生效 | ASTRUM-006 |
| 恢复 | 三策略 | reuse / rerun / validate_then_reuse |
| 结果复用 | 幂等声明 + 输入 hash + TTL | 已实现 |

**关键取舍**：未知幂等性工具保守 `reuse`（ASTRUM-004），可能导致有副作用步骤被跳过。

## 6. P4 明细
| 能力 | 状态 | 证据 |
|---|---|---|
| TaskStore v2 | 已实现 | 任务 + 事件 + 检查点 + meta，revision |
| 事务/配额/陈旧写 | 已实现 | QUOTA / STALE_WRITE；字符串时间比较（ASTRUM-010） |
| 事件流 | 已实现 | 嵌入状态 + 派生索引 |
| 检查点 | 已实现 | 自动保留 20 |
| 恢复三策略 | 已实现 | `recovery.decide/plan/apply` |
| 恢复次数 ≤1 | 已实现 | `state.recoveries` + `budget.used.recoveries` |
| 恢复前重校验 | 已实现 | profile、Skill 版本、principal |
| 刷新后恢复 | 已实现 | P4B 浏览器 13/13 |
| 后台继续执行 | **未实现** | 纯前端，无后台线程 |

## 7. 阶段间一致性
- `Control` 统一编排，未发现绕过 P0 安全层直接执行工具的路径。
- `Recovery` 复用 P3 的幂等声明与 P0 的授权；恢复后事件与检查点有测试。
- `SkillRuntime` 在 P4 恢复时重新取 `published` 版本，防止旧版本执行。

## 8. 结论
- P0/P1/P2 达到「可交付」；P3/P4 达到「可用但有明确边界」。
- 主要缺口不是功能缺失，而是 **P1 参考系错误**、**CI 红灯**、**表述超范围**。
- P0–P4 整体实现度：**约 88%**（按宣称能力逐项计，不含「后台执行」「自主多智能体」等超范围预期）。
