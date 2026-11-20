# P2-01 Skill 生命周期与数据契约

> 依据：P2-00 审计结论（CONDITIONAL PASS）
> 原则：声明式、无任意代码执行；新建 `ResearchSkill` 命名空间，不复用旧 `state.skills`

---

## 1. 命名与边界

| 概念 | 定义 | 存储 |
|---|---|---|
| 旧 Skill（legacy） | `app.js` 中 `intent\|target` 问答沉淀 | localStorage（不改） |
| **ResearchSkill** | 可验证、可审批、可执行、可回滚的科研工作流资产 | `astrum.skills.v1` |
| ResearchMemory | 研究知识/经验/结论 | `astrum.research.v1`（P1） |
| Task | 一次研究执行 | `astrum.tasks.v1`（P0/P1） |

ResearchSkill 与 ResearchMemory 只建立**引用关系**（`sourceMemoryIds`），不合并数据结构。

---

## 2. 总体状态机

```
proposed ──draft──> draft ──submit──> validating
                       ↑                  │
                       │        ┌─────────┴──────────┐
                       │        ▼                    ▼
                 validation_failed            pending_approval
                       │                            │
                       └──revise──────────┐   ┌─────┴─────┐
                                          │   ▼           ▼
                                       rejected       approved
                                          │              │
                                          │           publish
                                          │              ▼
                                          │          published ──deprecate──> deprecated ──archive──> archived
                                          │              │
                                          └──reopen──────┘（仅 draft 层）
```

- 状态集合：`proposed / draft / validating / validation_failed / pending_approval / approved / published / deprecated / archived / rejected`。
- **版本状态**独立于 Skill 状态：`draft / validating / failed / approved / published / deprecated / superseded / rolled_back`。
- `skills` 记录保存 `currentVersionId`（正式指针）与 `latestVersionId`（最新草稿/版本）。

### 2.1 允许转换与操作者

| from → to | 操作 | 允许操作者 | 能力 |
|---|---|---|---|
| proposed → draft | 生成草稿 | Agent / user | `skill.draft` |
| proposed → rejected | 拒绝提议 | user | `skill.approve` |
| draft → validating | 启动验证 | Agent / user | `skill.test` |
| validating → validation_failed | 验证失败 | system（validator） | — |
| validating → pending_approval | 验证通过 | system（validator） | — |
| validation_failed → draft | 修订 | Agent / user | `skill.draft` |
| pending_approval → approved | 人工批准 | **user only** | `skill.approve` |
| pending_approval → rejected | 人工拒绝 | **user only** | `skill.approve` |
| approved → published | 发布 | **user only** | `skill.publish` |
| published → deprecated | 废弃 | user | `skill.publish` |
| deprecated → archived | 归档 | user | `skill.publish` |
| rejected → draft | 重开 | user | `skill.draft` |

禁止：任何 Agent 执行 `approve/publish/rollback`；任何状态跳级（如 `draft → approved`）；`published` 直接回到 `draft`（必须走新版本草稿）。

### 2.2 转换记录

每次转换写 `events`（skill 事件）：

```js
{ eventId:'ske_...', skillId, versionId, previousStatus, nextStatus,
  actor:{principalType, profileId, agentId}, action, reason,
  timestamp, approvalId, traceId }
```

审计同时写入 `AuditLog`（`action:'skill.<action>'`, `resourceType:'skill'`），字段复用 P0 审计契约，不新建日志系统。

---

## 3. 数据模型

### 3.1 SkillProposal

```js
{ proposalId:'skp_<base36>_<rand>', profileId, projectId,
  candidateName(1..60), description(≤1000), motivation(≤1000),
  workflowSummary, signature,                    // 工具序列哈希，去重用
  supportingTaskIds[], supportingMemoryIds[], evidenceIds[],
  candidateSkillId:null, similarity:0..1, confidence:'low|medium|high',
  occurrence:{runs,success,failure,successRate},
  status:'proposed|draft|rejected|converted',
  limits:{iterationDepth}, createdAt, updatedAt, schemaVersion:1 }
```

### 3.2 SkillDraft

```js
{ draftId:'skd_...', proposalId, skillId, baseVersionId:null,
  name, description, category:'observation|data|evidence|calculation|report|workflow',
  purpose, useCases[], nonUseCases[], prerequisites[],
  inputs:[{name,type,required,example}],
  outputs:[{name,type,required,schema}],
  workflow:[{stepId,tool,argsTemplate,purpose,onError:'fail|skip|retry',timeoutMs}],
  constraints[], errorHandling[],
  allowedAgents[], requiredCapabilities[], allowedTools[],
  executionMode:'declarative', timeoutMs, retryPolicy:{max,backoffMs},
  testCases:[{caseId,input,expected}], expectedOutputs, qualityCriteria,
  securityRequirements[], diff:{addedSteps,removedSteps,inputChanges,outputChanges,permissionChanges,compatible},
  source:{proposalId, taskIds[], memoryIds[], evidenceIds[]},
  status:'draft|validating|failed|approved', createdAt, updatedAt, schemaVersion:1 }
```

硬约束：`executionMode` 只允许 `declarative`；`workflow[].tool` 必须存在于 Registry；`allowedTools ⊆ 执行 Agent 能力可达工具`；草稿不得携带可执行脚本字段（`code/script/eval/source` 一律拒绝）。

### 3.3 Skill（身份聚合）

```js
{ skillId:'skl_...', profileId, projectId:null|id, scope:'profile|project',
  name, description, category,
  status, currentVersionId:null, latestVersionId:null,
  allowedAgents[], allowedTools[], requiredCapabilities[],
  createdBy, createdAt, updatedAt,
  stats:{uses,success,failure,successRate,avgDurationMs,lastUsedAt},
  schemaVersion:1 }
```

### 3.4 SkillVersion

```js
{ versionId:'skv_...', skillId, version:'1.0.0', parentVersionId:null,
  schemaVersion:1, changelog,
  contentHash,                       // 规范化内容的 sha256
  content:{purpose,useCases,nonUseCases,prerequisites,inputs,outputs,workflow,
           constraints,errorHandling,allowedAgents,allowedTools,requiredCapabilities,
           timeoutMs,retryPolicy},
  validationId, approvalId, publicationId,
  status, createdAt, publishedAt, deprecatedAt, supersededBy, schemaVersion:1 }
```

版本规则：SemVer `MAJOR.MINOR.PATCH`；`MAJOR` = 输入/输出契约或权限变化；`MINOR` = 新增步骤/工具（不扩大权限）；`PATCH` = 文案/超时等。版本不可覆盖，只能新建。

### 3.5 Validation

```js
{ validationId:'skval_...', skillId, versionId, draftId,
  testSuiteVersion:'p2-1', environment:'isolated',
  layers:{schema:{ok,errors[]},static:{ok,findings[]},functional:{ok,cases[]},
          regression:{ok,cases[]},security:{ok,findings[]},stability:{ok,findings[]}},
  verdict:'PASS|CONDITIONAL_PASS|FAIL', failureReasons[],
  startedAt, completedAt, durationMs, artifacts:{logsHash,fixturesHash}, schemaVersion:1 }
```

### 3.6 Evaluation

```js
{ evaluationId:'skev_...', validationId, skillId, versionId,
  dimensions:{correctness,reliability,security,reusability,scope,maintainability,efficiency,traceability}, // 0..1 或 null
  sources:{rules,automatedTests,runtime,modelAssist,human},
  blocking:{security:true|false,missingEvidence:true|false,contractIncomplete:true|false},
  notes[], schemaVersion:1 }
```

### 3.7 Approval

```js
{ approvalId:'ska_...', skillId, versionId, contentHash,
  requestedBy, requestedAt, decidedBy:null, decidedAt:null,
  decision:'pending|approved|rejected|conditional',
  conditions[], reason, snapshot:{name,description,useCases,nonUseCases,inputs,outputs,
  workflow,allowedTools,requiredCapabilities,validationVerdict,securityFindings,
  diff,risks,provenance}, expiresAt:null, schemaVersion:1 }
```

### 3.8 Publication

```js
{ publicationId:'skp_...', skillId, versionId, approvalId, contentHash,
  publishedBy, publishedAt, previousVersionId:null,
  action:'publish|rollback', reason, result:'ok|failed', schemaVersion:1 }
```

### 3.9 Execution

```js
{ executionId:'ske_...', skillId, versionId, profileId, projectId, threadId, taskId,
  agentId, attempt, startedAt, completedAt, status:'running|ok|failed|timeout|cancelled',
  failureCategory:'input|precondition|tool_unavailable|permission|exception|contract|evidence|design|external',
  failureReason, stepResults:[{stepId,tool,status,durationMs}], traceId, schemaVersion:1 }
```

### 3.10 Feedback / Improvement

```js
{ feedbackId:'skf_...', executionId, skillId, versionId, rating:1..5|null,
  category, comment(≤500), createdBy, createdAt,
  improvementProposalId:null, schemaVersion:1 }
```

---

## 4. 关系

```
SkillProposal → SkillDraft → SkillVersion → Validation → Evaluation
                                    ↓
                                  Approval → Publication
                                    ↓
                                 Execution → Feedback → (新 Proposal)
```

- 外键全部使用 ID，禁止用名称关联。
- `SkillProposal` 通过 `supportingTaskIds/supportingMemoryIds/evidenceIds` 关联 P0/P1 资产。
- `Execution` 关联 `taskId`，但不复制任务正文。

---

## 5. 存储设计

数据库：`Profile.ns('astrum.skills.v1')`，版本 1；回退 localStorage → 内存。

| store | 主键 | 索引 |
|---|---|---|
| proposals | proposalId | profileId, projectId, status, signature, updatedAt |
| drafts | draftId | proposalId, skillId, status |
| skills | skillId | profileId, projectId, scope, status, name |
| versions | versionId | skillId, status, version, contentHash |
| validations | validationId | skillId, versionId, verdict |
| evaluations | evaluationId | skillId, versionId |
| approvals | approvalId | skillId, versionId, decision |
| publications | publicationId | skillId, versionId, action |
| executions | executionId | skillId, versionId, profileId, projectId, status, startedAt |
| feedback | feedbackId | skillId, executionId |
| events | eventId | skillId, versionId, timestamp |

验证隔离库：`Profile.ns('astrum.skills.validation.v1')`，仅存验证运行与 fixtures 引用；验证结束可清理，不写正式库。

---

## 6. 版本兼容

- 所有记录带 `schemaVersion:1`；未知版本拒绝读取。
- `skills` 存储不覆盖历史版本；发布只更新 `currentVersionId` 指针。
- 旧 `state.skills` 不迁移、不读取、不写入新库（Q3）。
- P1/P0 数据结构不变；新库独立升级，失败不影响既有档案。

---

## 7. 不变量（必须由 store 与 validator 双重保证）

1. 同一 `skillId + version` 只能有一个版本记录。
2. `contentHash` 必须与 `content` 规范化结果一致。
3. `approved` 审批必须绑定 `versionId + contentHash`；任一变化即失效。
4. `published` 版本的 `allowedTools` 必须全部在 Registry 中且被当前 principal 角色允许。
5. 任一 `security` 检查失败 → `verdict=FAIL`，不得进入 `pending_approval`。
6. 删除/废弃不删除历史；`archived` 仍可审计读取。
