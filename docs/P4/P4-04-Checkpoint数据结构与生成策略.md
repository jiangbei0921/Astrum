# P4-04 Checkpoint 数据结构与生成策略

## 1. 权威契约

`15` §4.2 定义最小检查点：

```js
Checkpoint = {
  at, phase, stepId, inputHash, stateHash, budgetUsed
}
```

P3 已扩展（全部可选，向后兼容）：

```js
checkpointId, taskStatus, projectId, version,
memoryIds, evidenceIds, claimIds,
planId, planVersion, currentStepId,
completedStepIds, pendingStepIds, inputs, outputs,
paused, recoveries
```

实现位置：`core/task.js:700-770`（`addCheckpoint`）。

## 2. P4 目标结构

在不删除 P3 字段的前提下，P4 逻辑检查点增加：

| 字段 | 类型 | 用途 | 来源 |
| --- | --- | --- | --- |
| `checkpointId` | string | 主键 | 已有 |
| `taskId` | string | 关联任务 | 保存时注入 |
| `ownerProfileId` | string | 身份作用域 | 记录级注入 |
| `projectId` | string | 项目作用域 | 已有 |
| `schemaVersion` | 1 | 任务契约版本 | 保存时注入 |
| `planVersion` | number | 计划版本 | 已有 |
| `phase` | Phase | 恢复起点 | 已有 |
| `stateHash` | string | 状态完整性 | 已有 |
| `inputHash` | string | 当前步骤输入 | 已有 |
| `completedStepIds` | string[] | 完成节点 | 已有 |
| `pendingStepIds` | string[] | 待执行节点 | 已有 |
| `outputs[]` | `{stepId, outputHash, toolId, toolVersion, skillVersionId}` | 幂等复用依据 | 已有 |
| `paused` / `recoveries` | boolean / number | 暂停与恢复计数 | 已有 |
| `eventsUpToSeq` | number | 事件位点 | 新增 |
| `integrity` | `{stateHashOk, depsOk, stepsOk, versionsOk}` | 校验结果 | 新增（不写入 TaskState，只写存储记录） |

`eventsUpToSeq` 与存储记录放在 `checkpoints` store，不进入 `TaskState.checkpoints`，避免扩大契约。

## 3. 生成时机

| 时机 | 是否创建 | 是否立即持久化 |
| --- | --- | --- |
| 任务创建 | ❌ | — |
| PLAN 完成 | ✅ | ✅ |
| 每个 critical 步骤完成 | ✅ | ✅（同事务） |
| 每个非 critical 步骤 | ❌ | 合并到下次 |
| PROGRESS 决策后 | ✅ | ✅ |
| pause | ✅ | ✅ |
| cancel | ✅（标记不可恢复） | ✅ |
| 完成 | ✅（最终检查点） | ✅ |
| 失败 | ✅（保留原因） | ✅ |
| beforeunload | ❌ | — |

## 4. 完整性校验

恢复前对最新检查点执行：

1. `checkpointId/taskId/ownerProfileId/projectId` 与任务记录一致；
2. `stateHash` 可重新计算并与记录一致；
3. `completedStepIds ∪ pendingStepIds` 覆盖计划全部节点，且无交集；
4. `completedStepIds` 中每个步骤在 TaskState 中 `status==='ok'` 且 `outputHash` 非空；
5. 依赖关系无环、无缺失、无自依赖；
6. `planId/planVersion` 与当前 `state.plan` 一致（若计划被替换则拒绝自动恢复）；
7. `outputs[].skillVersionId` 对应 Skill 仍为 published；
8. `outputs[].toolId` 在当前 Registry 中存在；
9. `eventsUpToSeq ≤ state.events` 最大 seq，且无断号；
10. `recoveries < 契约上限`。

任一失败 → `CHECKPOINT_INVALID:<code>`，不自动恢复，保留原数据并提示用户重新提问。

## 5. 存储与清理

- `checkpoints` store 以 `checkpointId` 为主键，`byTask` 索引支持按任务读取。
- 每个任务默认保留最近 20 个检查点；最终检查点永久保留直到任务删除。
- 删除任务时级联删除其检查点与事件索引。
- 不允许“删除检查点但保留可恢复任务记录”；清理顺序必须先使任务不可恢复，再删检查点。
- 清理失败不得导致任务记录不可读。

## 6. 与 Event 的关系

- 检查点记录 `eventsUpToSeq`，用于对齐事件位点。
- 恢复时允许在检查点之后重放**只读事件展示**，但不得用事件重建 TaskState（事件不驱动状态）。
- 事件与检查点在同一事务写入，避免位点指向不存在的事件。

## 7. 测试

- 正常生成：PLAN、critical、PROGRESS、pause、完成。
- 重复生成：同一 `checkpointId` 幂等。
- 读取：按任务取最新、按 ID 取单个。
- 损坏：改 `stateHash`、删 `completedStepIds`、构造依赖缺失。
- 版本：planVersion 不匹配、skill 撤销、tool 缺失。
- 清理：保留最近 N 个；删除任务级联；清理不影响不可恢复终态。
