# ASTRUM P4 阶段 B 任务清单（tasks）

> 依赖：`docs/P4/spec.md` 获批。每批完成并自测通过后再进入下一批。

- [x] **B1 存储 v2**
  - [x] `core/task-store.js`：`DB_VER=2`，新增 `events/checkpoints/meta`，升级仅建 store
  - [x] `save` 事务写任务+事件+检查点+meta；`revision`、`eventsUpToSeq`、`STALE_WRITE`、`QUOTA_EXCEEDED`、`PERSIST_TX_FAILED`
  - [x] 新增 `listResumable/loadLatestCheckpoint/loadCheckpoint/listEvents/pruneCheckpoints/getHealth`
  - [x] `remove` 级联删除；`summarize` 增 `paused/waitingApproval/recoveries/stale/lastError`
  - [x] `tools/fake-idb.js` + `tools/p4-store-test.js` 全绿

- [x] **B2 迁移与派生补齐**
  - [x] v1→v2 保留旧记录；重复初始化幂等；升级失败降级
  - [x] `listEvents` 索引缺失自动重建；`checkpoints` 派生读取
  - [x] `tools/p4-migration-test.js` 全绿

- [x] **B3 事件持久化**
  - [x] 事件顺序、重复幂等、内容冲突 `EVENT_CONFLICT`、作用域过滤
  - [x] `tools/p4-event-test.js` 全绿

- [x] **B4 检查点**
  - [x] `addCheckpoint` 增加 `snapshot`；保留最近 20；版本基于上一检查点
  - [x] PLAN/critical/PROGRESS/pause/DONE 生成点；`eventsUpToSeq` 写入记录
  - [x] `tools/p4-checkpoint-test.js` 全绿

- [x] **B5 恢复**
  - [x] 新增 `core/recovery.js`：17 项校验 + `plan/apply` 三策略
  - [x] `BUDGET_LIMITS` L2/L3/L4 recoveries=1
  - [x] `control.resume` 接入校验/策略/先保存后执行；返回 `recovery`
  - [x] `control.pause` 写检查点；`run/resume` 传 `onBatchSettled`；`orchestrator` 增钩子
  - [x] 修正 `p3-contract-test`（3 处）、`p3-progress-test`（1 处）、`p1-resume-test`（P1-RSM-007）
  - [x] `tools/p4-recovery-test.js`、`tools/p4-idempotency-test.js` 全绿

- [x] **B6 生命周期与故障**
  - [x] 保留策略、级联删除、配额、多标签页双写
  - [x] `tools/p4-lifecycle-test.js` 全绿

- [x] **B7 UI**
  - [x] `index.html` 加载 `core/recovery.js`
  - [x] `app.js` 恢复卡片信息与失败原因
  - [x] `tools/p4-ui-test.js` 全绿

- [x] **B8 回归与验收**
  - [x] 运行 spec §4.3 全部命令
  - [x] `tools/p4-browser-test.js` 真实 Chrome（不可用则记录未运行）
  - [x] 新增 `docs/P4/P4-11-最终实施与验收报告.md`
  - [x] 汇报结果，等待用户决定提交/推送
