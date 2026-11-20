# ASTRUM P0 当前架构审计报告

> 阶段：P0 阶段 A（只读审计）
> 审计对象：`D:\Projects\Astrum` 当前工作区
> 审计日期：2026-11-20
> 审计方式：静态代码审计 + 只读测试执行；**未修改任何业务代码、测试代码、配置、数据，未执行 Git 写操作**
> 关联文档：`docs/ASTRUM-IDENTITY-ARCHITECTURE-AUDIT.md`（既有审计，未修改）、`docs/ASTRUM-P0-IDENTITY-SECURITY-IMPLEMENTATION-PLAN.md`、`docs/ASTRUM-P0-SECURITY-TEST-PLAN.md`

---

## 0. 结论摘要

| 编号 | 结论 | 等级 | 关键证据 |
|---|---|---|---|
| C-01 | 系统不存在统一的「Principal → Action → Resource」授权层；所有权限语义仅为描述性字符串与工具能力标记 | P0 | `registry.js:51,68,80,95,104,121,130,146,155,164,173,182`；`agents.js:189-285` |
| C-02 | TaskStore 未按 Profile 命名空间隔离，库名/键名为模块级常量，跨档案共用同一 IndexedDB 库与 localStorage 键 | **P0（最高）** | `task-store.js:12-16`；`task-store.js:140-178` |
| C-03 | TaskState 无 `profileId` / `projectId` 字段，任务所有权在数据层不可表达，也无法校验 | **P0** | `task.js:360-388` |
| C-04 | 任务查询、恢复、执行、保存四个入口均不校验 Profile 归属；任务 ID 可直接驱动恢复 | **P0** | `app.js:8344-8370`；`control.js:421-498`；`control-bridge.js:221-229` |
| C-05 | 工具执行唯一收口在 `Orchestrator.executeOne`，但存在多条绕过 Registry 的直接模块调用路径 | P1 | `orchestrator.js:220-355`；`app.js:4022`；`research.js`；`sources.js` |
| C-06 | Agent 是「注册配置 + 叙事标签」，不是权限主体；`role` 仅为中文描述字符串，无 roleId | P0（设计前提） | `agents.js:189-285`、`agents.js:286-287` |
| C-07 | MEMORY 为页面级模块变量，不持久化、不按 Thread/Profile/Agent 分片；`openThread` 不清理 | P1 | `agents.js:667-676`；`app.js:2496-2503`；`app.js:6761-6775` |
| C-08 | 自定义 Agent 可直接写入 `AGENT_BY_ID`，未检测与内置 id 冲突，存在身份标签覆盖风险 | P1 | `agents.js:939-947` |
| C-09 | 现有 336 项只读测试重新执行全部通过，但**没有一项覆盖跨 Profile 的任务查询/恢复/执行** | P1（测试缺口） | 见 §7 |
| C-10 | Profile 切换以整页重载实现，可自然清空内存态；但「直接调用 `Profile.switchTo` 不重载」的路径没有防护 | P1 | `app.js:6661-6666`；`profile.js:80-85` |

一句话结论：**ASTRUM 目前具备「档案级存储命名空间」这一半隔离基座，但任务域完全裸露在该基座之外；系统没有任何可执行的身份权限判定，Agent 与工具都没有真实安全边界。**

---

## 1. 项目状态基线（A1）

| 项目 | 实测值 | 证据 |
|---|---|---|
| 当前分支 | `main` | `git rev-parse --abbrev-ref HEAD` |
| 当前 HEAD | `5c0f9c7`（`feat: V2 sky chart core, quality hardening, and MIT license`） | `git log -1 --oneline` |
| 工作区状态 | 干净（`git status --short` 无输出） | 实测 |
| 未提交修改 | 无 | 实测 |
| 测试入口 | 无 `package.json`；测试为独立 Node 脚本，逐个执行 `node tools/<name>-test.js` | 全仓库 Glob 无 package.json |
| Node 版本 | `v24.19.0` | `node --version` |
| 历史审计文档 | `docs/ASTRUM-IDENTITY-ARCHITECTURE-AUDIT.md`（493 行） | 已读取 |
| 架构文档 | `docs/architecture/00-README.md` … `16-最终实施前检查清单.md` | 已列目录 |

> 基线判断：仓库处于可审计的干净状态，适合作为 P0 改造起点。本轮未做任何清理或写操作。

---

## 2. Profile 真实实现审计（A2）

### 2.1 数据结构与存储

| 维度 | 实现 | 证据 |
|---|---|---|
| 档案元数据 | `localStorage['astrum.profiles']` → `[{id,name,createdAt}]` | `profile.js:17,34-39` |
| 当前档案 | `localStorage['astrum.profile.current']` | `profile.js:18,40-47` |
| 默认档案 id | 固定 `'default'`，不可删除 | `profile.js:19,88-96` |
| 新档案 id | `'p' + Date.now().toString(36) + random(4)` | `profile.js:30-32` |
| 命名空间函数 | 默认档案返回原键名；其他档案返回 `'p.<id>.<base>'` | `profile.js:51-53` |
| 档案列表 API | `init/ns/currentId/current/list/create/rename/switchTo/remove/purgeKeys` | `profile.js:114-120` |

### 2.2 已接入命名空间的模块

| 模块 | 键/库 | 是否走 `Profile.ns` | 证据 |
|---|---|---|---|
| 应用设置/技能 | `astrum.v2` | ✅ | `app.js:41` |
| 观测计划 | `astrum.plan.v1` | ✅ | `app.js:2565` |
| 反馈草稿 | `astrum.feedback.draft` | ✅ | `app.js:7128` |
| 反馈已读 | `astrum.feedback.seen` | ✅ | `feedback.js:253` |
| Sources 配置 | `astrum.sources.v1` | ✅ | `sources.js:11` |
| 搜索缓存 | `astrum.search.cache.v2` | ✅ | `sources.js:1766` |
| 线程数据库 | IndexedDB `astrum` | ✅ | `store.js:21` |
| 线程 localStorage 回退 | `astrum.thread.v1` | ✅ | `store.js:23` |
| 当前线程 | `astrum.thread.current` | ✅ | `thread.js:15` |
| **任务数据库** | IndexedDB `astrum.tasks.v1` | ❌ **固定常量** | `task-store.js:12-13` |
| **任务 localStorage 回退** | `astrum.tasks.v1` | ❌ **固定常量** | `task-store.js:15` |

### 2.3 关键问题回答

| 问题 | 答案 | 证据 |
|---|---|---|
| Profile ID 从哪来 | 浏览器 `localStorage['astrum.profile.current']`，启动时读取 | `profile.js:40-47` |
| 哪个模块能确定当前 Profile | 仅 `Profile.currentId()`；`Profile.init()` 在脚本加载时执行 | `profile.js:55,112` |
| 哪些模块能直接访问 Profile ID | 任何持有 `window.Profile` 的模块，无访问控制 | 全局对象导出 `profile.js:114-120` |
| 切换 Profile 后哪些状态销毁 | 因 `location.reload()`，全部内存态销毁；持久化数据按新命名空间重新加载 | `app.js:6661-6666` |
| Profile 切换时是否存在数据清理 | 不清理旧档案数据，只切换命名空间（设计如此） | `profile.js:80-85` |
| 是否存在旧 Profile 数据被新 Profile 读取 | **任务域存在**：任务库不随命名空间变化 | `task-store.js:12-15` |
| 是否存在多个 Profile 共用同一全局 Store | **存在**：`AstroTaskStore` 全局单例工厂，所有档案共用一个库 | `task-store.js:193-200` |
| 异步任务是否会持有旧上下文 | **存在**：任务恢复时使用恢复现场的 `readCtx()`，不校验任务原归属 | `app.js:8368-8370` |
| Profile ID 是否可被调用方伪造 | 应用内 Agent 无该参数；但任意代码可调用 `Profile.switchTo(id)` 或直接读写 localStorage | `profile.js:80-85` |

### 2.4 信任边界说明

浏览器静态应用没有服务端可信身份。P0 能建立的是**应用内调用链可信**：`profileId` 只能由 `ProfileContext` 从 `Profile.currentId()` 读取，绝不接受业务参数传入。对于「用户本机直接改 localStorage」这类场景，浏览器端无法防御，必须在文档中明确为**非目标威胁**（见实施计划 §17）。

---

## 3. TaskStore 真实实现审计（A3，最高优先级）

### 3.1 真实数据结构

```
IndexedDB: astrum.tasks.v1 (version 1)
  objectStore: tasks, keyPath: 'id'
  record: {
    id, question, phase, createdAt, updatedAt, template,
    state: <AstroTask.toJSON(TaskState)>
  }
localStorage 回退: astrum.tasks.v1 = { [id]: record }
内存回退: {}
```

证据：`task-store.js:12-16`（常量）、`109-121`（`makeRecord`）、`123-138`（`save`）。

**TaskState 字段全集**（`task.js:360-388`）：`schemaVersion, id, question, mode, phase, createdAt, updatedAt, phaseStartedAt, intents, entities, context, plan, steps, claims, evidence, eval, budget, checkpoints, replans, trace, errors, events`。

> 结论：**没有 `profileId`、没有 `projectId`、没有 `createdBy`、没有 `updatedBy`。** 任务归属在数据层不存在。

### 3.2 ID 生成

```js
// task.js:91-94
function nextId() {
  idSeq += 1;
  return 'tsk_' + Date.now().toString(36) + '_' + idSeq.toString(36);
}
```

任务 ID 可预测（时间戳 + 进程内自增序号），且不含任何归属信息。ID 本身不构成访问凭证，但当前实现中 ID 是**唯一**的访问条件。

### 3.3 全部访问入口清单

| # | 入口 | 文件:行 | 调用方 | 数据来源 | 校验 Profile | 校验所有权 | 校验 Agent 权限 | 旁路 | 风险 |
|---|---|---|---|---|---|---|---|---|---|
| T-01 | `AstroTaskStore.create({})` | `app.js:3807` | `controlAnswer` | 全局工厂 | ❌ | ❌ | ❌ | — | 高 |
| T-02 | `store.list({limit:10})` | `app.js:8345` | `offerResumeTask` | 全局库 `getAll` | ❌ | ❌ | ❌ | — | **严重** |
| T-03 | `store.get(id)` | `app.js:8349` | `offerResumeTask` | 任意 id | ❌ | ❌ | ❌ | — | **严重** |
| T-04 | `AstroControlBridge.resume(id,…)` | `app.js:8370` | 「继续任务」按钮 | 任意 id | ❌ | ❌ | ❌ | — | **严重** |
| T-05 | `AstroTaskStore.create({})` | `control-bridge.js:189` | `runWithRoute` | 全局工厂 | ❌ | ❌ | ❌ | — | 高 |
| T-06 | `AstroTaskStore.create({})` | `control-bridge.js:224` | `resume` | 全局工厂 | ❌ | ❌ | ❌ | — | **严重** |
| T-07 | `defaultStore()` | `control.js:416-419` | `load/resume` | 全局工厂 | ❌ | ❌ | ❌ | — | 高 |
| T-08 | `store.get(taskId)` | `control.js:421-429` | `AstroControl.load` | 任意 id | ❌ | ❌ | ❌ | — | **严重** |
| T-09 | `AstroControl.resume` | `control.js:431-498` | Bridge / 测试 | 任意 id | ❌ | ❌ | ❌ | — | **严重** |
| T-10 | `saveState(store,state)` | `control.js:139-142` | `run` / `resume` | 当前 store | ❌ | ❌ | ❌ | — | 高 |
| T-11 | `store.save(state)` | `task-store.js:123-138` | 执行器 | 调用方传入 | ❌ | ❌ | ❌ | — | 高 |
| T-12 | `store.remove(id)` | `task-store.js:164-170` | **当前 UI 无调用方**，仅测试 | 任意 id | ❌ | ❌ | ❌ | API 暴露 | 中 |
| T-13 | `store.clear()` | `task-store.js:172-178` | **当前 UI 无调用方**，仅测试 | 全库 | ❌ | ❌ | ❌ | API 暴露 | 中 |
| T-14 | 直接 `indexedDB.open('astrum.tasks.v1')` | 同源任意脚本 | 无 | 全库 | ❌ | ❌ | ❌ | **存在** | 中（浏览器边界内） |
| T-15 | 直接读 `localStorage['astrum.tasks.v1']` | 同源任意脚本 | 无 | 全库 | ❌ | ❌ | ❌ | **存在** | 中 |
| T-16 | 测试直接建 store | `tools/v1-1-*`、`v1-5-*`、`v1-6-*`、`v1c-test.js` | 测试 | 全局库 | ❌ | ❌ | ❌ | — | 低（测试） |

### 3.4 真实调用链

```
用户点击「继续任务」
  → app.js offerResumeTask (8341)
    → AstroTaskStore.create({}) (8344)            // 无 profile 参数
    → store.list({limit:10}) (8345)               // getAll：全库
    → filter(resumable) (8346)
    → store.get(id) (8349)                        // 任意 id
  → 用户点击行内按钮 (8365)
    → AstroControlBridge.resume(id, readCtx(), cfg, {store}) (8370)
      → AstroControl.resume (control.js:431)
        → load(id) (421) → store.get(id)          // 二次读取，仍无归属校验
        → O.runPlan(state.plan, state, {registry, ctx, cfg, adapter, signal}) (452)
          → executeOne(...) (orchestrator.js:220)
            → spec.run(args, ctx, cfg, depResults, runtime) (302-306)
      → saveState(store, state) (493)             // 写回同一全局库
```

关键事实：
1. 恢复使用**当前页面**的 `readCtx()`（`app.js:8368`）与当前 `cfg`，而任务原本的 `state.context` 只作为历史字段存在，不参与校验或恢复。
2. `AstroControl.resume` 不比较 `state.context` 与 `ctx`，也不询问「这个任务属于谁」。
3. `saveState` 直接覆盖原记录，无版本号/ETag/归属校验。

### 3.5 六类攻击场景实测判定（静态推演，均为只读）

| 场景 | 判定 | 推演依据 |
|---|---|---|
| **A 跨 Profile 查询** | **确认可利用** | A 创建任务写入 `astrum.tasks.v1`；切到 B 后 `store.list()` 仍 `getAll()` 读同一库（`task-store.js:154`），列表直接展示 A 的 `question` 与步骤数（`app.js:8361-8362`） |
| **B 跨 Profile 恢复** | **确认可利用** | B 档案中 `store.get(Task-A)` 命中同一库；`resume` 无归属检查（`control.js:431-498`）；只要任务 `phase==='EXECUTE'` 且有 pending/running 步骤即 `resumable`（`task-store.js:77-82`） |
| **C 跨 Profile 执行** | **确认可利用** | 执行器只凭 `state.plan` 与传入 `ctx`；`executeOne` 无 profile/task 归属判断（`orchestrator.js:220-355`）；工具调用不携带任何身份（`registry.js`） |
| **D 切换期间异步任务** | **部分存在** | 正常 UI 切换走 `location.reload()`（`app.js:6664-6665`），页面卸载会中止在飞请求；但若通过 `Profile.switchTo()` 直接切换（API 可用），正在运行的 Promise 会继续并把结果写回同一全局库；刷新后新 Profile 也能「继续」旧任务（同 B） |
| **E 伪造任务归属** | **无法区分伪造** | 任务对象无 `profileId` 字段，故无「伪造」可言——任何持有 ID 的调用方都等价于所有者；`AstroTask.validate` 只校验结构，不校验归属（`task.js:410-536`） |
| **F 历史任务** | **全部归属不明** | 现有库中所有记录均无 `profileId`；无法从命名空间反推（库名固定），也无法从 Profile 元数据反推；按任务书要求不得默认归当前 Profile，必须隔离 |

### 3.6 P0-2 根因

**根因不是遗漏了某个 `if`，而是 TaskStore 被设计成与 Profile 无关的全局单例。** 对比 `store.js:21-23` 是有命名空间的，`task-store.js:12-15` 是在模块加载时求值的字面量常量，没有引用 `Profile.ns()`。由于 TaskStore 在 `profile.js` 之前或同时加载，也不存在运行期重新计算的机会（且页面重载后仍是常量）。

因此最小修复必须是**存储层命名空间**，而不是在 UI 层加过滤：
- UI 过滤只能挡住 `offerResumeTask` 一个入口，挡不住 `store.get(id)` / `resume(id)` / 测试/控制台直调。
- 只有在 `openIDB()` 与 `LS_KEY` 上按 `Profile.ns()` 分库，才能从物理上让 A 的 `getAll` 看不到 B 的记录。

### 3.7 最小修改建议（摘要，详见实施计划）

1. `task-store.js`：库名/键名改为 `Profile.ns('astrum.tasks.v1')`，并在 `create()` 内固定 `ownerProfileId`（创建时快照），所有 `save/get/list/remove/clear` 校验 `rec.ownerProfileId === owner`。
2. `TaskState`：新增可选 `profileId`、`projectId`（`null` 允许），由 `AstroControl.prepare` 从 `ProfileContext` 注入，不从查询参数注入。
3. `AstroControl.resume/load`：新增 `assertTaskAccess(state, principal)`；不匹配返回 `PROFILE_MISMATCH`，不执行。
4. `orchestrator.executeOne`：执行前用 `opts.principal` 重新校验任务归属与工具能力。
5. 历史任务：一次性迁移到 `astrum.tasks.v1.migration` 隔离区，状态 `pending_migration`，不自动归属。

---

## 4. Agent 身份与上下文审计（A4）

### 4.1 注册表事实

| 事实 | 证据 |
|---|---|
| 内置 Agent 13 个 | `agents.js:189-285` |
| 按 id 建索引 | `agents.js:286-287` |
| 每 Agent 一个配置命名空间 `cfg.<id>` | `agents.js:289-293` |
| **无 systemPrompt / prompt 字段** | `agents.js:189-285` 键集合 |
| `role` 是中文描述字符串（如「总控 · 意图解析与协奏」），**不是角色 ID** | `agents.js:189-285` |
| 全局仅两套 System Prompt | `sources.js:320-351`（Muse 综合）、`sources.js:420-464`（表述层） |
| 提示词不含 agent/persona 字段 | `sources.js:494-620` |
| 意图识别不接收身份 | `agents.js:475` |
| 用户人格仅改表达 | `app.js:6502-6519`、`app.js:6528-6534` |

### 4.2 共享状态实测

| 共享项 | 是否共享 | 证据 |
|---|---|---|
| `ctx` | 是，单次 ask 内创建并传给所有 compose | `app.js:3983`；`agents.js:725` |
| `cfg` | 是，深拷贝后整轮共享 | `app.js:3984` |
| `MEMORY` | 是，模块级单例 | `agents.js:667-676` |
| `skills` | 是，`state.skills` 全局数组 | `app.js:2141-2166` |
| `answer` | 是，同一对象被各 compose 追加 sections/trace | `agents.js:725`、`agents.js:810-813` |
| Agent 实例边界 | **不存在** | 无构造/实例化代码，全部为函数调用 |

### 4.3 身份可伪造性

| 攻击 | 是否可行 | 说明 |
|---|---|---|
| 通过查询参数伪造 Agent ID | 否 | 运行时无接收 agentId 的入口 |
| 通过自定义 Agent 覆盖内置 id | **是（仅标签层）** | `setCustomAgents` 直接 `AGENT_BY_ID[a.id] = {...}`，未检查 `AGENTS` 已占用 id（`agents.js:939-947`） |
| 通过 Prompt 注入修改权限参数 | 当前无权限参数可改；但 `cfg` 可由自定义 Agent 的 `attrs` 覆盖（`agents.js:994-1007`），属表达层污染 |
| 通过 Agent 名称获得更高权限 | 当前无权限层，故不成立；改造后必须禁止按名称判权 |

### 4.4 结论

**ASTRUM 的 Agent 身份是「注册配置 + 参数命名空间 + 溯源标签」，不是执行主体，也不是权限主体。** 因此 P0 不能假设「给 Agent 加 roleId」就等于隔离；必须显式建立 `Principal` 包装层，由运行时注入，Agent 自身不能自证身份。

---

## 5. 工具调用入口审计（A5）

### 5.1 Registry 内 12 个工具

| Tool ID | 模块 | 能力 caps | 现有权限字段 | 外部影响 | 风险 | 建议 |
|---|---|---|---|---|---|---|
| `kepler.ephemeris` | `registry.js:38-54` | compute | `canProduceNumbers` | 无 | 低 | 纳入 Gateway，要求 `tool.calculate` |
| `kepler.visibility` | `registry.js:55-71` | compute | `canProduceNumbers` | 无 | 低 | 同上 |
| `kb.lookup` | `registry.js:72-83` | local | — | 无 | 低 | 要求 `tool.read_local` |
| `evidence.search` | `registry.js:84-98` | search | — | 有（网络） | 中 | 要求 `tool.search` |
| `simbad.tap` | `registry.js:99-107` | search | `canProduceIdentifiers` | 有 | 中 | 要求 `tool.external_api` |
| `paper.search` | `registry.js:108-124` | search | — | 有 | 中 | 要求 `tool.search` |
| `llm.compose` | `registry.js:125-133` | llm | — | 有（模型） | 中 | 要求 `tool.llm` |
| `fits.parse` | `registry.js:134-149` | local | `localOnly` | 无 | 低 | 要求 `tool.read_local` |
| `compare.curate` | `registry.js:150-158` | local | — | 无 | 低 | 无外部副作用 |
| `compose.target` | `registry.js:159-167` | compose | — | 无 | 低 | 无 |
| `compose.domain` | `registry.js:168-176` | compose | — | 无 | 低 | 无 |
| `compose.simple` | `registry.js:177-185` | compose | — | 无 | 低 | 无 |

> `permissions` 是**能力标记**（能否产出数字/标识符、是否仅本地），不是「谁可以调用」。校验逻辑中从未读取这些字段做拦截（`registry.js:502-570` 全文）。

### 5.2 真实执行收口与旁路

| 路径 | 是否经过 Registry | 证据 | 风险 |
|---|---|---|---|
| 复杂任务（L2-L4） | ✅ 经 `Orchestrator.executeOne → spec.run` | `orchestrator.js:302-306` | 可在 `executeOne` 前插入唯一网关 |
| 简单问答（L1/legacy） | ❌ 直接 `AC.buildAnswer` | `app.js:4022` | 无法用 Registry 拦截 |
| 研究多轮检索 | ❌ `Research.run` 直接调 `Sources.searchMany` | `research.js:602-647`；`registry.js:386-430` 只是包装 | 存在两条检索路径 |
| SIMBAD | 既经 Registry 也有模块直调 | `registry.js:338-384` | 需统一到 Gateway |
| 论文全文 | `AstroPaperFulltext.get` 可被 Registry 调用 | `registry.js:397-425` | 需能力校验 |
| 附件解析 | `Attachments` / `AstroFits` 直调 | `registry.js:456-484` | 本地低风险 |
| 模型调用 | `Sources.generate/streamChat` 直调 | `control-bridge.js:42-182` | 需 `tool.llm` 能力 |
| UI 直接触发 | 星图/太阳系视图（`applySystemAction`） | `app.js:2517-2534` | 非数据工具，低风险 |

**结论**：不存在「一个全局 Gateway 就能拦住所有工具」的前提。P0 必须先拦截 Registry 路径（真实数据/网络工具都在此），再对 legacy 直调路径做「显式降级 + 不引入受保护资源」的处理，不能假装已全覆盖。

### 5.3 工具调用时携带的身份信息

`spec.run(args, ctx, cfg, depResults, runtime)`（`orchestrator.js:303`）中：
- `args` 来自 Plan，可由问题文本间接影响；
- `ctx` 是时间/地点/器材；
- `cfg` 是表达参数；
- `runtime` 只有 `{signal, taskId, attempt}`。

**没有任何 principal/profile/project/agent 字段。** 工具无法知道自己正被谁调用，也就无法做资源级授权。

---

## 6. MEMORY 与 Thread 边界审计（A6）

### 6.1 MEMORY

| 维度 | 事实 | 证据 |
|---|---|---|
| 定义 | 模块级 `var MEMORY = []`，上限 8 | `agents.js:667-668` |
| 写入 | `setMemory(list)` 全量覆盖并截断 | `agents.js:670-674` |
| 读取 | `resolveByMemory` 从后向前找目标 | `agents.js:684-713` |
| 清理 | `clearMemory()` 仅在 `newChat` 调用 | `app.js:1064` |
| 持久化 | **不持久化**；`persist()` 只写 settings/custom/cfg/skills | `app.js:48-54` |
| 注入位置 | `request.classify` 与 `buildAnswer` | `request.js:26-29`；`app.js:3985` |
| Thread 切换 | **不清理**，仅重绘消息 | `app.js:6761-6775` |
| Profile 切换 | 整页重载，内存变量自然清空 | `app.js:6664-6665` |

### 6.2 Thread

| 维度 | 事实 | 证据 |
|---|---|---|
| 当前线程键 | 按 Profile 命名空间 | `thread.js:15` |
| 线程元数据 | `{id,title,createdAt,updatedAt,schema,count}` | `thread.js:27-36` |
| 消息存储 | 按 `threadId` 索引；写后回读校验 | `store.js:157-200` |
| 是否含 projectId | 否 | `store.js` 消息结构 |
| 是否含 agent/persona 身份 | 否；`appendBot` 只存 `ans` | `thread.js:92-99` |

### 6.3 四类信息必须分开（当前状态）

| 类型 | 当前承载 | 是否持久 | 是否可跨线程 | P0 处理 |
|---|---|---|---|---|
| 用户偏好 | `state.settings`（`astrum.v2`） | ✅ | ✅（档案级） | 保持现状，不算权限资源 |
| Thread 短期上下文 | `MEMORY`（页面级） | ❌ | ❌（但会跨线程串） | 绑定 `threadId`，切换时重建；不升级为长期记忆 |
| Profile 级长期信息 | 暂无 | — | — | P0 不新增 |
| Project 级科研记忆 | 暂无 | — | — | 仅预留 `projectId` 字段与能力字典，不实现存储 |

**P0 边界**：不得把 `MEMORY` 直接当作科研记忆或权限来源；它只能作为指代消解的短期缓存。

---

## 7. 测试体系审计（A7）

### 7.1 现状

| 项目 | 事实 |
|---|---|
| package.json | 不存在 |
| CI 工作流 | `.github` 存在；本轮未修改、未运行 |
| 测试目录 | `tools/`（约 100 个脚本） |
| 测试入口 | `node tools/<name>-test.js` |
| 浏览器测试 | 依赖 Chrome/CDP 的 `*-browser-test.js`，本轮未运行（会写入浏览器存储） |
| 数据迁移测试 | **未发现** |
| 跨 Profile 任务测试 | **未发现** |
| 工具权限测试 | **未发现**（无权限层） |
| 异步任务切换测试 | **未发现** |

### 7.2 本轮重新执行结果（只读，无持久化）

| 测试 | 结果 | 覆盖 | 是否覆盖隔离 |
|---|---|---|---|
| `tools/ctx-isolation-test.js` | **PASS 14/14** | ctx 不被分支修改、城市表不污染 | 仅进程内 ctx |
| `tools/task-test.js` | **PASS 73/73** | TaskState 不变量/序列化 | 否 |
| `tools/control-test.js` | **PASS 86/86** | Router/Planner/Orchestrator 集成 | 否 |
| `tools/research-test.js` | **PASS 77/77**（离线 mock） | 检索规划/去重/冲突 | 否 |
| `tools/p0-03-test.js` | **PASS 53/53** | Claim/Evidence 契约 | 否 |
| `tools/b8-test.js` | **PASS 33/33** | 依赖结果注入与回退 | 否 |
| **合计** | **336/336 PASS** | — | **0 项跨 Profile/权限** |

### 7.3 未执行/未验证

| 项目 | 状态 | 原因 |
|---|---|---|
| `tools/*-browser-test.js` | **NOT VERIFIED** | 会写入浏览器 IndexedDB/localStorage，可能污染真实用户数据 |
| `tools/v1-5-idb-stress-test.js` | **NOT VERIFIED** | 同上（明确会 `store.clear()`） |
| CI 工作流 | **NOT VERIFIED** | 本轮不执行外部 CI |
| 线上 Pages | **NOT VERIFIED** | 不涉及 |

### 7.4 测试体系结论

1. 历史 336 项基线**当前仍成立**，可作为回归基线复用。
2. 这些测试验证的是任务状态机、编排、检索与证据契约，**不是安全隔离**。
3. 存在假阳性风险：`v1-1-routing-test.js:155` 等直接 `AstroTaskStore.create({})` 并断言恢复成功，恰好证明「任何 store 都能恢复任何任务」；改造后这些测试要么需要显式提供 owner，要么应改为跨 Profile 拒绝断言。
4. P0 必须新增独立安全测试集，不能把 336/336 当作 P0 验收。

---

## 8. 当前权限机制总览

| 权限维度 | 是否存在 | 真实实现 | 结论 | 证据 |
|---|---|---|---|---|
| 用户级身份认证 | ❌ | 无登录 | 静态本地应用，无认证 | — |
| Profile 数据隔离 | ⚠️ 部分 | 命名空间 | 线程/设置/缓存有效；**任务无效** | `store.js:21-23` vs `task-store.js:12-15` |
| Agent 注册校验 | ⚠️ 名义 | `AGENT_BY_ID` 存在 | 仅用于配置与展示，不用于判权 | `agents.js:286-287` |
| Role 权限 | ❌ | `role` 是描述文本 | 无 roleId、无策略表 | `agents.js:189-285` |
| Capability 权限 | ❌ | `permissions` 是能力标记 | 从不参与拦截 | `registry.js:502-570` |
| 资源所有权 | ❌ | 无 owner 字段 | TaskState 无 profileId | `task.js:360-388` |
| 默认拒绝 | ❌ | 无授权层 | 一切默认可执行 | — |
| 审计日志 | ❌ | 无 | 无权限决策记录 | — |
| 异步任务重校验 | ❌ | 无 | 恢复直接用当前上下文 | `control.js:431-498` |

---

## 9. 关键问题与风险分级

### P0（必须在 P0 阶段解决）

| 编号 | 问题 | 影响 | 证据 |
|---|---|---|---|
| P0-SEC-01 | TaskStore 跨 Profile 共用库 | 查询/恢复/执行/覆盖他人任务 | `task-store.js:12-16` |
| P0-SEC-02 | TaskState 无 owner 字段 | 无法表达与校验归属 | `task.js:360-388` |
| P0-SEC-03 | 无统一授权层 | 无法限制 Agent/工具/资源组合 | 全仓库无 `authorize`/`principal` |
| P0-SEC-04 | 工具执行无身份上下文 | 无法做工具级最小授权 | `orchestrator.js:302-306` |
| P0-SEC-05 | 任务恢复/执行不重校验 | 权限撤销后仍可继续 | `control.js:431-498` |
| P0-SEC-06 | 历史任务归属不可判定 | 不能默认归当前 Profile | §3.5-F |

### P1（与 P0 边界相关，最小修复）

| 编号 | 问题 | 建议 |
|---|---|---|
| P1-MEM-01 | MEMORY 跨 Thread 泄漏 | 绑定 threadId，`openThread` 重建 |
| P1-AGT-01 | 自定义 Agent 可覆盖内置 id | 注册时拒绝保留 id |
| P1-TOOL-01 | legacy 路径绕过 Registry | 显式标注「不受保护」，禁止访问受保护资源；后续收口 |

### P2（记录，不在本轮实现）

- `astrum.stats` / `astrum.version` 为设备级全局键（不含任务/科研数据），P0 不处理。
- 自定义 Agent 注记混入事实区（产品设计问题）。
- `docs/architecture/04-Agent职责与协作规范.md` 与实现不一致。

---

## 10. 代码证据索引

| # | 结论 | 文件 | 符号 | 行号 |
|---|---|---|---|---|
| 1 | 任务库固定常量 | `core/task-store.js` | `DB_NAME/LS_KEY` | 12-15 |
| 2 | 任务记录结构 | `core/task-store.js` | `makeRecord` | 109-121 |
| 3 | 任务保存无归属校验 | `core/task-store.js` | `save` | 123-138 |
| 4 | 任务读取无归属校验 | `core/task-store.js` | `get` | 140-148 |
| 5 | 任务列表全库查询 | `core/task-store.js` | `list` | 150-162 |
| 6 | 任务删除/清空 | `core/task-store.js` | `remove/clear` | 164-178 |
| 7 | TaskState 无 profileId | `core/task.js` | `create` | 360-388 |
| 8 | Task ID 生成 | `core/task.js` | `nextId` | 91-94 |
| 9 | 任务恢复入口 | `core/app.js` | `offerResumeTask` | 8341-8393 |
| 10 | 恢复按钮调用 | `core/app.js` | `resume` | 8370 |
| 11 | 任务执行入口 | `core/control.js` | `run` | 173-199 |
| 12 | 任务加载 | `core/control.js` | `load` | 421-429 |
| 13 | 任务恢复 | `core/control.js` | `resume` | 431-498 |
| 14 | 默认 store 工厂 | `core/control.js` | `defaultStore` | 416-419 |
| 15 | Bridge 创建 store | `core/control-bridge.js` | `runWithRoute/resume` | 189,224 |
| 16 | 工具执行收口 | `core/orchestrator.js` | `executeOne` | 220-355 |
| 17 | 工具调用参数 | `core/orchestrator.js` | `spec.run` | 302-306 |
| 18 | 12 工具定义 | `core/registry.js` | `SPECS` | 37-186 |
| 19 | 工具权限字段 | `core/registry.js` | `permissions` | 51,68,80,95,104,121,130,146,155,164,173,182 |
| 20 | Registry 无判权 | `core/registry.js` | `create/register` | 498-570 |
| 21 | Profile 命名空间 | `core/profile.js` | `ns` | 51-53 |
| 22 | Profile 切换 | `core/profile.js` | `switchTo` | 80-85 |
| 23 | 档案切换重载 | `core/app.js` | `renderProfileSwitch` | 6661-6666 |
| 24 | 线程库按档案命名 | `core/store.js` | `DB_NAME/LS_KEY` | 21-23 |
| 25 | MEMORY 单例 | `core/agents.js` | `MEMORY/setMemory` | 667-676 |
| 26 | 指代消解 | `core/agents.js` | `resolveByMemory` | 684-713 |
| 27 | 记忆写入 | `core/app.js` | `rememberAnswer` 片段 | 2496-2503 |
| 28 | 新对话清记忆 | `core/app.js` | `newChat` | 1058-1065 |
| 29 | 切线程不清记忆 | `core/app.js` | `openThread` | 6761-6775 |
| 30 | 13 Agent 名册 | `core/agents.js` | `AGENTS` | 189-285 |
| 31 | Agent 索引 | `core/agents.js` | `AGENT_BY_ID` | 286-287 |
| 32 | 仅两套系统提示词 | `core/sources.js` | `museSysPrompt/sysPrompt` | 320-351,420-464 |
| 33 | 自定义 Agent 注册 | `core/agents.js` | `setCustomAgents` | 939-947 |
| 34 | 自定义 Agent 参数覆盖 | `core/agents.js` | `applyCustomConfig` | 994-1007 |
| 35 | 统一分流 | `core/request.js` | `classify` | 17-42 |
| 36 | 控制闸门 | `core/control-bridge.js` | `canControl` | 26-38 |
| 37 | 7 个计划模板 | `core/planner.js` | `TEMPLATES` | 13-50 |
| 38 | 设置键命名空间 | `core/app.js` | `KEY` | 41 |
| 39 | 设置持久化字段 | `core/app.js` | `persist` | 48-54 |
| 40 | 测试基线 | `tools/*-test.js` | — | 本轮 336/336 |

---

## 11. 审计自检（对照任务书第十章）

| 验收项 | 状态 | 说明 |
|---|---|---|
| 已审计 Profile 真实实现 | ✅ | §2 |
| 已审计 Agent 真实身份机制 | ✅ | §4 |
| 已审计 Agent 上下文共享机制 | ✅ | §4.2 |
| 已审计所有主要工具调用入口 | ✅ | §5（含绕过路径） |
| 已审计 TaskStore 所有访问入口 | ✅ | §3.3（16 项） |
| 已审计任务恢复与执行入口 | ✅ | §3.4 |
| 已审计 MEMORY 和 Thread 边界 | ✅ | §6 |
| 已审计当前测试体系 | ✅ | §7 |
| P0-1 根因确认 | ✅ | §8、§9 |
| P0-2 根因确认 | ✅ | §3.6 |
| 已区分真实问题与历史遗留 | ✅ | §9 P0/P1/P2 分级；历史文档仅作参考，结论均以当前代码复核 |
| 已识别旁路访问 | ✅ | §3.3 T-14/15、§5.2 |
| 未修改业务/测试/配置代码 | ✅ | 工作区仍干净（仅新增本文档） |
| 未执行 Git 写操作 | ✅ | 仅 `git status/log/rev-parse` |
| 未修改用户数据 | ✅ | 未运行浏览器写入型测试 |
