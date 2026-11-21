# ASTRUM-01 架构一致性审计

## 1. 清点结果

| 项 | 数值 |
|---|---|
| 受版本控制文件 | 458 |
| `core/` 模块 | 76 |
| `tools/` 脚本与 fixture | 171 |
| `docs/` 文档 | 185 |
| `data/` 数据文件 | 11 |
| `worker/` | 2（`cors-proxy.js`、`README.md`） |
| `.github/workflows/` | 4（test / pages / daily / network） |
| 构建系统 | 无（无 package.json、无打包器） |
| 后端 | 无 |
| 入口 | `index.html`，90 个 `<script>` 顺序加载，全部挂 `window` 全局 |

审计排除：`.git/`、不存在的 `node_modules/`、浏览器缓存。理由：非源码或自动生成。

## 2. 模块地图

### 2.1 加载层（index.html 顺序）
1. 静态数据：`data/catalog.js`、`knowledge.js`、`places.js`、`bodies.js`、`solarsystem.js`、`obsplan.js`、`gear.js`、`daily.js`
2. 基础：`astro` → `runtime` → `task` → `research-goal` → `dag-validator` → `capability-resolver` → `schema` → `claims` → `evidence` → `fits`/`fit` → `query` → `agents` → `sources`
3. 领域：`solarsystem` → `geosearch` → `research` → `attachments` → i18n 系列
4. 安全与存储：`profile` → `profile-context` → `audit-log` → `security` → `tool-gateway` → `store` → `thread` → `topics`
5. 决策与执行：`adaptive` → `router` → `evaluator` → `planner` → `reducer` → `report` → `answer-composer` → `registry` → `compose-adapter` → `task-store` → `orchestrator` → `recovery` → `control` → `request` → `control-bridge`
6. 产品层：`project`、`memory`、`research-store/context`、`project-ui`、Skill 五件套、附件/PDF/论文、`research-ui`、`content-i18n`、`knowledge-sources`、`feedback`
7. 天空渲染：`sky-stars-l1` → `sky-star-data` → `sky-layers` → `sky-viewmodel` → `planet-visuals` → 行星纹理 → 银河背景 → `sky-renderer` → `workspace` → `app`

依赖方向基本单向：`app` 依赖全部，核心层互不反向依赖 `app`。未发现循环加载导致的初始化崩溃（页面可启动，selftest 可运行）。

### 2.2 分层职责
- **契约层**：`schema.js`、`task.js`、`claims.js`、`evidence.js`、`skill-contract.js`、`dag-validator.js`、`capability-resolver.js`。
- **安全层**：`security.js`（唯一授权）、`tool-gateway.js`（唯一工具入口）、`profile-context.js`（不可写上下文）、`audit-log.js`。
- **执行层**：`planner`（模板计划）→ `orchestrator`（DAG 调度）→ `registry`/`compose-adapter`（工具）→ `recovery`（恢复）。
- **产品层**：`app.js`（389 KB，UI 与主流程）、`workspace.js`、`research-ui.js`、各 `*-ui.js`。

## 3. P0–P4 分层实现对照

| 阶段 | 目标 | 实现文件 | 状态 | 证据 |
|---|---|---|---|---|
| P0 | 身份/权限/Schema/Tool/存储/隔离 | security, tool-gateway, profile, store, schema | 完整 | p0-security 38/38、p0-03 53/53 |
| P1 | 项目/记忆/证据/上下文/导入导出 | project, memory, evidence, research-context | 完整 | 5 套 220/220 |
| P2 | Skill 提案→发布→执行→版本 | skill-store/proposal/validator/runtime/contract/ui | 完整 | 8 套 374/374 |
| P3 | 目标/Plan/DAG/执行/预算/恢复 | research-goal, planner, dag-validator, orchestrator, control | 基本完整 | 7 套 103/103 |
| P4 | 事件/检查点/幂等/生命周期 | task-store, recovery, task, control-bridge | 真实可用、语义有限 | p4-* 共 158/158 + browser 13/13 |

## 4. 契约一致性（docs/architecture/15）

### 4.1 一致的方面
- Principal / capability / `ownerProfileId` / `projectId` 模型与实现一致。
- Tool 调用统一经 `ToolGateway`，参数 Schema 校验存在。
- Task 状态机有合法迁移表；预算有唯一权威分档；`used ≤ limit`。
- Skill 发布态门槛、Agent 白名单、版本回滚与契约一致。
- Evidence/Claim 具备 `source` 枚举、`calc` 记录与四维核验结构。

### 4.2 偏离/未完全实现
1. **`claims.origin` 语义偏离（P2，ASTRUM-009）**：真实证据合成的 Claim 仍标 `p0-fixture`，未标 `p3-generated`。
2. **`source`/`entity` 维度为结构检查**：`judgeClaim` 只做存在性与结构判定，实际语义可信度在 P3 计算；若契约要求四维实质判定，则属部分实现。
3. **「多智能体协作」**：契约与 README 的角色描述暗示 Agent 间协作，实际为 `Router → Planner 固定模板 → Orchestrator`，Agent 是角色配置与文案层（ASTRUM-003）。
4. **恢复语义**：契约允许恢复，但实现是「刷新后手动恢复」，不是后台续跑；需在文档中明确。

## 5. 架构优点
- 无构建、无依赖、无后端，攻击面小，部署成本极低。
- 安全校验集中在两个入口（`Security.authorize`、`ToolGateway.call`），便于审计。
- 契约文件与测试套件同步演进，P0–P4 测试命名与阶段对应清晰。
- 存储按档案命名空间隔离，删除/迁移有测试。

## 6. 架构风险
| 编号 | 风险 | 等级 | 说明 |
|---|---|---|---|
| ASTRUM-003 | 「多智能体」表述与实现不符 | P2 | 角色化固定 Pipeline，无自主协商 |
| ASTRUM-007 | 档案隔离非安全边界 | P2 | 本地无认证，切换档案即可见数据 |
| ASTRUM-020 | 内存态与持久化态可能短暂不一致 | P3 | 事件先入内存，写库失败时 revision 不提升 |
| ASTRUM-021 | 无依赖清单/SBOM | P3 | 纯静态可接受，但供应链透明度依赖人工 |

## 7. 结论
架构**自洽、可维护、与 P0–P4 目标基本一致**；主要问题不是结构缺陷，而是**对外表述超出实现**与**参考系/测试门禁**两类一致性问题。架构维度评分 **84/100**。
