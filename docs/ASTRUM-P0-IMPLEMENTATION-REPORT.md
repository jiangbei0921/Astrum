# ASTRUM P0 实施报告

> 阶段：P0 阶段 B（实施）
> 基线：`main@5c0f9c7`
> 依据：`docs/ASTRUM-P0-IDENTITY-SECURITY-IMPLEMENTATION-PLAN.md`
> 日期：2026-11-20
> 状态：已实施，待用户验收与提交

---

## 1. 实施结果摘要

P0 目标已落地：当前档案 `profileId` 成为唯一可信身份来源；任务存储按档案物理隔离；任务查询/恢复/执行/保存均校验归属；Registry 工具调用统一经过授权网关；历史任务进入隔离区且不自动归属。

| 验收项 | 结果 |
|---|---|
| Profile 任务隔离 | ✅ 分库/分键 + owner 校验 |
| TaskStore 查询/更新/删除/恢复隔离 | ✅ |
| 工具调用权限门 | ✅ `executeOne` 真实路径 |
| 未注册 Agent / 未知 Role 默认拒绝 | ✅ |
| 仅定义能力拒绝 | ✅ `CAPABILITY_NOT_IMPLEMENTED` |
| 异步任务跨档案防护 | ✅ session + 每批重校验 + 保存校验 |
| 历史任务不自动归属 | ✅ 隔离区 `pending_migration` |
| 权限审计日志 | ✅ 按档案隔离、脱敏、环形上限 |
| 336 项回归 | ✅ 336/336 |
| P0 新增测试 | ✅ 32 + 10 = 42/42 |
| 静态部署启动 | ✅ 本地 HTTP 冒烟通过，无相关控制台异常 |
| 无新依赖/无构建步骤 | ✅ |

---

## 2. 新增模块

| 文件 | 内容 |
|---|---|
| `core/profile-context.js` | `capture/current/sameSession`；页面级 `sessionId`；无 setter |
| `core/security.js` | Principal 工厂、能力字典、角色策略、`authorize()`、`delegate()` |
| `core/audit-log.js` | 按档案隔离的权限日志，IndexedDB + localStorage/内存回退，1000 条上限，字段脱敏 |
| `core/tool-gateway.js` | 工具解析 → 授权 → 参数校验 → 执行 → 审计；拒绝身份字段注入 |

---

## 3. 修改模块

| 文件 | 修改要点 |
|---|---|
| `core/task-store.js` | 库名/键名按 `Profile.ns` 惰性求值；记录增加 `ownerProfileId/projectId`；`get/getRecord/list/remove/clear` owner 校验；新增 `migrateLegacy()` 隔离迁移；无 Profile 的 Node 环境保持旧行为 |
| `core/control.js` | `principalOf` 注入；创建前授权；`load` 校验 owner 并返回 project；`resume` 前/保存前重校验；`saveState` 会话与 owner 双重检查 |
| `core/control-bridge.js` | 构造 Muse principal 并透传；拒绝 owner 不匹配的外部 store；恢复透传 principal |
| `core/orchestrator.js` | `executeOne` 走 `ToolGateway`；每批执行前 `ensureSession`；按工具域委托专业角色（kepler/scholar/curator/muse），不扩权 |
| `core/agents.js` | 导出只读 `agentById`；自定义 Agent 不得覆盖内置 id |
| `core/app.js` | 恢复入口触发一次历史任务迁移并提示；两处 `Research.run` 传入 Scholar principal |
| `core/research.js` | 浏览器中检索入口校验 `tool.search`；缺身份返回 `denied` 空结果 |
| `index.html` | 在 `profile.js` 后加载 4 个新模块 |

---

## 4. 关键行为变化

1. **默认档案旧任务**：升级后不自动归属，进入隔离区 `astrum.tasks.quarantine.v1`（或同名 localStorage 键）；默认档案列表不再显示无 owner 的旧记录。这是任务书「不得默认归属当前 Profile」的直接结果。
2. **Muse 的检索权**：Muse 本身没有 `tool.search`。编排器按工具域委托 Scholar/Curator/Kepler 后执行，保持最小权限；直接以 Muse 调用检索会被拒绝。
3. **工具参数中的身份字段**：`profileId/projectId/principal/sessionId/ownerProfileId` 出现在工具参数中一律 `POLICY_DENIED`，不静默剥离。
4. **旧版本回退**：新档案任务在旧代码中不可见，但数据保留；迁移只复制不删除。

---

## 5. 测试证据

### 5.1 回归（全部通过）

| 测试 | 结果 |
|---|---|
| `tools/ctx-isolation-test.js` | 14/14 PASS |
| `tools/task-test.js` | 73/73 PASS |
| `tools/control-test.js` | 86/86 PASS |
| `tools/research-test.js` | 77/77 PASS（离线 mock） |
| `tools/p0-03-test.js` | 53/53 PASS |
| `tools/b8-test.js` | 33/33 PASS |
| **合计** | **336/336 PASS** |

### 5.2 新增 P0 测试

| 测试 | 结果 | 覆盖 |
|---|---|---|
| `tools/p0-security-test.js` | **32/32 PASS** | owner 绑定、跨档案列表/读取/删除/写入、跨档案加载/恢复、会话失效、权限契约 8 项、自定义 Agent、工具拒绝/放行/伪造参数/委托、迁移 5 项 |
| `tools/p0-migration-test.js` | **10/10 PASS** | 扫描、隔离、损坏记录、旧数据保留、幂等、标记、新格式不重复迁移、当前档案不可见 |
| **合计** | **42/42 PASS** | — |

### 5.3 浏览器冒烟

本地 `python -m http.server` + Chrome 打开 `index.html`：
- 页面标题与主输入区正常渲染；
- 全部脚本（含 4 个新模块）HTTP 200；
- 控制台无涉及 `ProfileContext / Security / ToolGateway / AstroTaskStore` 的未捕获异常。

### 5.4 未验证（明确记录）

| 项目 | 状态 | 原因 |
|---|---|---|
| 真实 IndexedDB 下两个档案的跨库手工验证 | NOT VERIFIED | 本轮 Node 测试走 localStorage 回退；需在浏览器分别建 A/B 档案手工确认 |
| 在线外部数据测试 | NOT VERIFIED | 需要网络与外部服务 |
| 浏览器写入型旧测试（`*-browser-test.js`） | SKIPPED | 会污染真实用户存储 |
| GitHub Pages 线上验收 | NOT VERIFIED | 未部署 |

---

## 6. 与实施计划的偏差

| 项 | 计划 | 实际 | 原因 |
|---|---|---|---|
| 审计日志存储 | 仅 IndexedDB | IndexedDB + localStorage/内存回退 | 隐私模式/`file://` 下 IDB 可能不可用；语义不变 |
| 迁移隔离存储 | IndexedDB | IndexedDB + localStorage 回退 | 同上；保证 Node 测试与隐私模式可验证 |
| 工具执行身份 | 计划未细化子角色 | 编排器按工具域委托 | 若直接用 Muse，研究链路会因缺少 `tool.search` 全部被拒；委托方案符合 §13 且不扩权 |
| `forTest` | 计划未提 | 新增测试专用 Principal 工厂 | 仅测试使用；生产代码不调用 |

---

## 7. 已知限制

1. 浏览器本地无法防御用户通过 DevTools 直接改 localStorage/IndexedDB；列为非目标威胁。
2. 隔离区 P0 只保存与提示，不提供归属确认 UI（计划中为 P1）。
3. legacy L1 直调路径（`buildAnswer`、`Sources.*` 表述流）未接入网关，已标注为不受保护；它们不访问任务/课题资源。
4. 审计日志是本地日志，不具备服务器级不可篡改性。

---

## 8. 回滚

- 代码回退到 `5c0f9c7` 即可；新模块不被加载，旧逻辑恢复。
- 新档案任务在旧代码中不可见，但数据保留在 `p.<id>.astrum.tasks.v1`，不会丢失。
- 迁移未删除旧库；回滚后旧任务仍可被旧代码读取。
