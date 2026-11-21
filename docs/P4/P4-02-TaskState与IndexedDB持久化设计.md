# P4-02 TaskState 与 IndexedDB 持久化设计

## 1. 现状核验

| 能力 | 现状 | 代码 |
| --- | --- | --- |
| TaskState 结构 | 已实现，`schemaVersion=1` | `core/task.js:390-423` |
| 序列化 | `toJSON/fromJSON` + `validate` | `core/task.js:425-450` |
| 存储 | IndexedDB → localStorage → memory | `core/task-store.js:218-409` |
| 命名空间 | 按 Profile 分库 `p.<profile>.astrum.tasks.v1` | `core/task-store.js:18,36-39` |
| 记录结构 | `{id,question,phase,createdAt,updatedAt,template,ownerProfileId,projectId,state}` | `core/task-store.js:249-263` |
| 并发保护 | 比较 `updatedAt` 拒绝陈旧写 | `core/task-store.js:304-307` |
| 事务 | 单 object store 单请求 | `core/task-store.js:58-66` |
| 配额/升级失败 | 未处理 | — |

## 2. 唯一权威状态源

- 运行期：`AstroControl` 持有的 TaskState 实例是唯一可写权威源。
- 持久层：IndexedDB 中的 `tasks.state`（JSON 字符串）是权威副本。
- UI：只接收 `result.state` 的只读视图，不得回写；`answer` 不包含 `TaskState`。
- 约束：同一时刻只允许 `AstroControl` 写任务；Store 只做持久化，不解释业务状态。

## 3. 数据库设计

### 3.1 数据库标识

| 项 | 值 |
| --- | --- |
| 数据库名 | 保持 `astrum.tasks.v1`（按 Profile 命名空间） |
| P4 版本 | `DB_VER = 2` |
| v2 新增 store | `events`、`checkpoints`、`meta` |
| 迁移 | 仅新增 store，不重建 `tasks`，旧记录原样保留 |

### 3.2 Object Store

```text
tasks        keyPath: id
  { id, question, phase, template, createdAt, updatedAt,
    ownerProfileId, projectId, revision, state }

events       keyPath: [taskId, seq]
  { taskId, seq, ownerProfileId, projectId, at, type, stepId, payload }

checkpoints  keyPath: checkpointId
  index: byTask (taskId), byTaskAt ([taskId, at])
  { checkpointId, taskId, ownerProfileId, projectId, version,
    at, phase, stateHash, summary }

meta         keyPath: key
  { key: 'schemaVersion', value: 2, updatedAt }
  { key: 'lastMigration', value: {...} }
```

### 3.3 记录扩展（不改 TaskState 契约）

`tasks` 记录新增 `revision`（整数，每次写 +1），仅用于并发与陈旧写检测，**不进入 TaskState**，避免修改 `15` §1.1。

### 3.4 写入事务

正常保存任务时，一个 `readwrite` 事务覆盖 3 个 store：

1. `tasks.put(record)`
2. `events.put(...)`（仅 `state.events` 中尚未写入的 seq）
3. `checkpoints.put(...)`（仅新增检查点）
4. 事务 `oncomplete` 后才向调用方返回成功

任一 store 写入失败 → 整个事务回滚，内存状态保留，调用方收到 `PERSIST_TX_FAILED`。不允许出现“任务已保存但事件缺失”的半状态。

### 3.5 降级

| 环境 | 行为 |
| --- | --- |
| IndexedDB 可用 | 正常 |
| IndexedDB 不可用，localStorage 可用 | 单键保存任务与事件，检查点合并进记录；UI 标注“本机存储受限” |
| 两者均不可用 | 仅内存；任务不得标记为“可恢复”；UI 明确提示 |

## 4. 存储接口（目标）

在现有 `AstroTaskStore.create()` 上扩展，不新建重复仓储：

```js
store.init() -> 'idb' | 'ls' | 'memory'
store.save(state) -> {id, revision}
store.get(id) -> TaskState | null
store.getRecord(id) -> record | null
store.list({limit}) -> TaskSummary[]
store.listByProject(projectId, {limit, raw})
store.listResumable({limit}) -> TaskSummary[]
store.loadCheckpoint(taskId, checkpointId?) -> checkpoint | null
store.listEvents(taskId, {afterSeq, limit}) -> Event[]
store.remove(id, {cascade:true}) -> boolean
store.getHealth() -> {backend, dbVersion, lastError, quota}
```

`TaskSummary` 增加：`paused`, `waitingApproval`, `recoveries`, `stale`, `lastError`。

## 5. 写入时机

| 时机 | 是否保存 | 说明 |
| --- | --- | --- |
| PLAN 完成 | ✅ | 现有 |
| 每个 critical 步骤结束 | ✅ 新增 | 先写 TaskState，再写检查点，同事务 |
| 每个非 critical 步骤 | ⚠️ 合并 | 与下一次 critical 或阶段结束合并 |
| PROGRESS 决策后 | ✅ | 现有 |
| pause | ✅ 新增 | 写 `pausedAt` + 检查点 |
| cancel / fail | ✅ | 现有 |
| 完成 | ✅ | 保留最终检查点 |
| beforeunload | ❌ | 不作为可靠性依据 |
| running 中间态 | ❌ | 无意义 |

## 6. 失败处理

| 故障 | 检测 | 处理 |
| --- | --- | --- |
| `QuotaExceededError` | 事务 error.name | 返回 `QUOTA_EXCEEDED`；提示清理旧任务；不删除当前任务 |
| 事务 abort | `tx.onabort` | 回滚；内存状态不变；返回 `PERSIST_TX_FAILED` |
| 记录损坏 | `fromJSON` 抛错/null | `list` 标 `stale`；恢复前拒绝；原记录保留 |
| 数据库升级失败 | `onblocked` / `onerror` | 关闭连接、保留 v1、返回 `DB_UPGRADE_FAILED` |
| 多标签页写冲突 | `revision` 落后 | 返回 `STALE_WRITE`，提示刷新后重试 |
| IndexedDB 被清除 | open 后 store 为空 | 视为无任务；不伪造恢复 |

## 7. 测试对应

- `p4-store-test`：初始化、保存/读取/更新/删除、revision、降级、配额模拟、事务回滚、损坏读取。
- `p4-migration-test`：v1→v2、重复初始化、升级失败。
- 既有 `p1-import-export-test`、`p0-migration-test` 必须继续通过。
