# P4-03 Event 持久化与一致性设计

## 1. 现状

| 项 | 现状 | 代码 |
| --- | --- | --- |
| Event 结构 | `seq, at, taskId, type, stepId, payload` | `core/task.js:356-366` |
| 事件类型白名单 | 15 类（P3 新增 paused/waiting_approval） | `core/task.js` `EVENT_TYPES` |
| 事件保存 | 内嵌于 `TaskState.events`，随任务整体 JSON 落盘 | `core/task-store.js:261` |
| 顺序 | `seq` 从 1 递增，`validate` 强制单调 | `core/task.js:573-574` |
| 独立事件存储 | 明确不做（P0 蓝图 §491） | — |
| Event ID | 无独立字段 | — |

## 2. 设计原则

1. **不做 Event Bus**：事件只由 `AstroTask.appendEvent` 追加，不驱动流程。
2. **内嵌副本是权威**：`TaskState.events` 仍是完整事件序列；独立 `events` store 只是派生索引，可随时从任务记录重建。
3. **同一事务写入**：派生索引与任务记录同事务，避免半状态。
4. **只追加**：不提供更新/删除单个事件的接口；清理仅随任务删除或保留策略级联。
5. **稳定 ID**：定义 `eventId = taskId + ':' + seq`，不修改既有事件必填字段。

## 3. 数据结构

```js
Event = {
  seq: number,             // 任务内单调递增，从 1 开始
  at: ISO8601,
  taskId: 'tsk_*',
  type: EventType,
  stepId: string | null,
  payload: object
}
// 派生记录
EventRecord = {
  taskId, seq, ownerProfileId, projectId,
  eventId: taskId + ':' + seq,
  at, type, stepId, payload
}
```

作用域字段来自所属任务记录，不接受事件自身声明。

## 4. 一致性策略

| 场景 | 策略 |
| --- | --- |
| 正常保存 | 一个事务写 `tasks` + 新增 `events` + 新增 `checkpoints` |
| 事件索引写失败 | 整个事务回滚，任务保持上一版本，用户看到保存失败 |
| 索引缺失但任务记录有事件 | 启动或读取时按 `state.events` 重建缺失索引（幂等） |
| 索引多于任务记录 | 视为陈旧派生数据，删除多余 seq；不改任务记录 |
| 事件顺序断裂 | 完整性检查报 `EVENT_SEQ_GAP`，拒绝自动恢复 |
| 重复 seq | `put` 幂等覆盖同内容；内容不同则报 `EVENT_CONFLICT` 并保留任务记录版本 |
| 跨用户读取 | 以任务 owner 过滤；无 owner 的旧记录走隔离区 |

## 5. 写入算法

```text
save(state):
  tx = db.transaction(['tasks','events','checkpoints'], 'readwrite')
  rec = makeRecord(state)            // revision = prev.revision + 1
  tx.tasks.put(rec)
  for e of state.events where e.seq > persistedMaxSeq:
      tx.events.put(toEventRecord(e, rec))
  for cp of state.checkpoints where checkpointId not persisted:
      tx.checkpoints.put(toCheckpointRecord(cp, rec))
  await tx.complete
```

`persistedMaxSeq` 从 `events` store 的 `[taskId, -∞]` 游标取最后一条；localStorage 降级时从任务记录的 `events` 直接比较，不额外维护游标。

## 6. 读取与权限

- `listEvents(taskId, {afterSeq, limit})` 先 `getRecord(taskId)` 校验 owner 与项目，再从 `events` store 读取；索引缺失时回退到 `state.events`。
- 事件不含凭据、Token 或完整正文；`payload` 只允许白名单键（现有 `EVENT_PAYLOAD_KEYS`）。
- 事件不对最终 `answer` 暴露。

## 7. 故障与测试

| 故障 | 用户可见结果 | 测试 |
| --- | --- | --- |
| 事件索引写失败 | “任务保存失败，进度未更新” | `p4-event-test` 写失败注入 |
| 索引缺失 | 无感，自动重建 | 删除索引后读取 |
| 顺序断裂 | 恢复被拒绝，提示任务数据损坏 | 构造 gap |
| 重复事件 | 幂等，不重复展示 | 重复保存 |
| 跨用户读取 | 返回 null | 双 Profile |

## 8. 与 P0 蓝图的关系

P0 蓝图明确“不做独立事件存储”指**不新增事件驱动的第二状态源**。本设计的 `events` store 是任务记录的派生索引，不具备独立写入入口、不参与调度；如用户认为仍越界，可退回“仅内嵌事件”方案（B3 工作量减少，事件查询能力受限）。
