# ASTRUM 全项目独立技术审计 · 最终报告

| 项 | 内容 |
|---|---|
| 审计对象 | `D:\Projects\Astrum` |
| 审计分支 / 基线 | `main` / `bb2e497`（`feat(p4): TaskStore v2、事件/检查点持久化与按幂等性恢复`） |
| 审计日期 | 2026-11-21 |
| 复审日期 | 2026-11-21（完成 selftest 与星表岁差修复后） |
| 审计性质 | 独立、只读审计；后续修复经用户明确授权 |
| 远程 | `git@github.com:zhangmuchangqing/Astrum.git` |
| 报告体系 | 本报告为最终汇总；分项证据见 `docs/audit/ASTRUM-00` ～ `ASTRUM-13` |
| 结论口径 | 已证实 / 高可信 / 潜在 / 待验证 / 已验证能力；未运行项不写 PASS |

---

## 1. 执行摘要

ASTRUM 是一个**工程完成度较高、隐私边界诚实、测试覆盖较广的纯静态浏览器天文工作台**。它具备可用的星图、太阳系展示、离线问答、检索取证、报告与任务恢复能力；但它**不是精密星历软件，也不是真正的多智能体自主系统**。

审计共发现 **24 项问题**：P0 **0**、P1 **2**、P2 **8**、P3 **14**。审计后已按用户授权修复 2 项 P1 与 2 项 P2/P3：

1. **CI 自测门禁失败**：`selftest` 由 `153/156, exit=1` 修复为 **`157/157, exit=0`**。
2. **星表岁差/参考系混用**：实现 J2000→观测历元的岁差，星图、天体列表/详情、Agent 星历统一到同一参考系。
3. **超时不中断下游**：`withTimeout` 超时/取消时通过 `AbortController` 中止本次工具请求。
4. **i18n 静态标题**：补动态标题的 `data-i18n` 与英文词条。

修复后复审综合评分 **80/100**（修复前 77）。仍建议**有条件公开部署**：可作为个人/教育静态站点发布，但不应以「精密定位」「多智能体自主科研」「后台常驻执行」宣传。

---

## 2. 项目画像

| 项 | 数值 / 结论 |
|---|---|
| 受版本控制文件 | 458 |
| `core/` 模块 | 76 |
| `tools/` 脚本与 fixture | 171 |
| `docs/` 文档 | 185 |
| `data/` 数据文件 | 11 |
| `worker/` | 2（CORS 代理与说明） |
| CI workflows | 4（test / pages / daily / network） |
| 构建系统 | 无（无 package.json、无打包器） |
| 后端 | 无 |
| 入口 | `index.html`，90 个 `<script>` 顺序加载，全部挂 `window` 全局 |
| 持久化 | IndexedDB（按档案分库）+ localStorage（设置、API Key） |
| 模型 | 可选，用户自备 Key；无 Key 明确降级 |

### 2.1 分层模块地图

1. **数据层**：`data/catalog.js`、`knowledge.js`、`places.js`、`bodies.js`、`solarsystem.js`、`obsplan.js`、`gear.js`、`daily.js`、`sky-stars-l1.js`。
2. **基础层**：`astro`、`runtime`、`task`、`research-goal`、`dag-validator`、`capability-resolver`、`schema`、`claims`、`evidence`、`fits`/`fit`。
3. **领域层**：`query`、`router`、`adaptive`、`agents`、`sources`、`solarsystem`、`geosearch`、`research`、`attachments`、i18n。
4. **安全与存储层**：`profile`、`profile-context`、`audit-log`、`security`、`tool-gateway`、`store`、`thread`、`topics`。
5. **决策与执行层**：`evaluator`、`planner`、`reducer`、`report`、`answer-composer`、`registry`、`compose-adapter`、`task-store`、`orchestrator`、`recovery`、`control`、`request`、`control-bridge`。
6. **产品层**：`project`、`memory`、`research-store/context`、`project-ui`、Skill 五件套、附件/PDF/论文、`research-ui`、`content-i18n`、`knowledge-sources`、`feedback`。
7. **渲染层**：`sky-stars-l1` → `sky-star-data` → `sky-layers` → `sky-viewmodel` → `planet-visuals` → 行星纹理 → 银河背景 → `sky-renderer` → `workspace` → `app`。

依赖方向基本单向，核心层不反向依赖 `app`；未发现循环加载导致的启动失败。

### 2.2 真实调用链（已证实）

```
用户输入
  → app.js / AstroRequest.handle
  → Query.parseIntent / AstroRouter.route
  → AstroAdaptive / Runtime.classify
  → AstroControl.run
       ├─ 创建 Task（预算分档、状态机）
       ├─ AstroPlanner.plan（T-A..T-G 固定模板）
       ├─ AstroDagValidator（依赖环、并行冲突）
       ├─ AstroOrchestrator.runPlan
       │     ├─ nextBatch / readySteps
       │     ├─ executeOne → AstroRegistry + ToolGateway
       │     └─ 事件、检查点、预算、重试
       ├─ AstroReducer / AnswerComposer / Report
       └─ TaskStore 持久化；Recovery 恢复
```

不存在第二套并行执行路径，也未发现绕过 `ToolGateway` 的工具调用。

---

## 3. 审计范围与方法

### 3.1 覆盖范围
- 环境与仓库状态、文件清点、模块地图、架构契约一致性。
- 身份/权限、XSS、Tool/Skill 安全、存储与恢复、CSP 与供应链。
- 输入校验、异步/并发、异常处理、状态机、资源边界。
- 坐标/时间/天体位置/星表/银河纹理/行星视觉与独立数值验证。
- Agent 真实性、Prompt/模型调用、Evidence/Claim、P3 规划执行、P4 持久化恢复。
- 功能分级、测试覆盖矩阵、真实基线重跑、性能与兼容性。

### 3.2 方法
- 静态阅读 + 定向数据流追踪 + 真实执行测试 + 独立数值脚本。
- 独立脚本位于临时工作区（`audit/`），**不进入仓库**。
- 未做：真实第三方 API 全量联调（无用户 Key）、真实 GitHub Actions 环境复跑（本地等价命令复现）、行星外部星历逐日对照。

### 3.3 排除项
`.git/`、不存在的 `node_modules/`、浏览器缓存、测试临时 profile。理由：非源码或自动生成。

---

## 4. 架构一致性

### 4.1 契约符合项
- Principal / capability / `ownerProfileId` / `projectId` 模型与 `docs/architecture/15` 一致。
- 工具统一经 `ToolGateway`，有参数 Schema 与身份参数守卫。
- Task 有合法迁移表与唯一预算权威；`used ≤ limit`。
- Skill 发布态门槛、Agent 白名单、版本回滚与契约一致。
- Evidence/Claim 具备 `source` 枚举、`calc` 记录与四维核验结构。

### 4.2 偏离项
| 编号 | 结论 | 等级 | 状态 |
|---|---|---|---|
| ASTRUM-003 | 「多智能体」表述超出实现：实际为角色化固定 Pipeline | P2 | 未修 |
| ASTRUM-009 | 真实证据合成的 Claim 仍标 `p0-fixture`，应为 `p3-generated` | P2 | 未修 |
| — | `source`/`entity` 维度为结构检查，实质可信度在 P3 计算 | P3 | 未修 |
| — | P4 恢复是「刷新后手动恢复」，不是后台续跑 | 边界 | 文档需明确 |

**架构评分：84/100。**

---

## 5. 安全审计

### 5.1 已证实的防护
1. **单一授权入口** `Security.authorize`：校验 principal 完整性、会话一致性、角色/用户策略、能力是否实现且授予、`ownerProfileId`、`projectId`。
2. **身份来源不可伪造**：`makePrincipal` 的 `profileId`/`sessionId` 来自 `ProfileContext.current()`，而非调用参数。
3. **工具入口守卫**：`ToolGateway` 拒绝 `profileId/projectId/principal/sessionId/ownerProfileId` 参数，并做 Schema 校验。
4. **存储隔离**：TaskStore 按 `Profile.ns('astrum')` 分库，读取按 `ownerProfileId` 过滤。
5. **恢复重校验**：恢复前重新授权、校验 Skill 版本与 principal。
6. **Skill 安全**：仅执行 `published` 版本；校验档案、项目、Agent 白名单、能力/工具；静态禁止动态代码与越权字段。
7. **无动态代码执行**：未发现 `eval` / `new Function` / `document.write`。
8. **XSS**：主要 `innerHTML` 拼接均使用 `esc()` 或 `textContent`；未发现可利用的未转义注入路径。
9. **CSP**：`default-src 'self'`、`script-src 'self'` + 2 个内联 hash、`object-src 'none'`、`frame-ancestors 'none'`、`form-action 'none'`。
10. **隐私一致**：无服务器、无埋点、无第三方脚本；Key 明文存 localStorage 已在隐私页披露。

### 5.2 风险清单
| 编号 | 风险 | 等级 | 状态 |
|---|---|---|---|
| ASTRUM-007 | 本地档案切换无认证，属数据分区而非安全边界 | P2 | 设计边界，需 UI 说明 |
| ASTRUM-010 | 多标签页并发写仅比较 ISO 时间，可能丢失更新 | P2 | 未修 |
| ASTRUM-011 | CSP `style-src 'unsafe-inline'`、`connect-src` 含 localhost | P3 | 未修 |
| ASTRUM-012 | API Key 明文 localStorage | P3 | 已披露 |
| ASTRUM-013 | CORS Worker 路径/大小限制不足，`ACAO: *` | P3 | 未修 |
| ASTRUM-014 | AuditLog 可篡改、无完整性链 | P3 | 未修 |
| ASTRUM-023 | Actions 使用大版本标签而非 SHA 锁定 | P3 | 未修 |

**安全评分：80/100。**

---

## 6. 代码健壮性

| 编号 | 问题 | 等级 | 状态 |
|---|---|---|---|
| ASTRUM-004 | 未声明幂等性的工具恢复时保守 `reuse`，可能跳过有副作用步骤 | P2 | 未修（已文档化取舍） |
| ASTRUM-005 | `withTimeout` 超时后不 abort 下游请求，仅忽略结果 | P2 | **已修复** |
| ASTRUM-006 | 暂停仅在步骤/批次边界生效，运行中副作用不可即时停止 | P2 | 未修 |
| ASTRUM-010 | 并发写缺版本冲突保护 | P2 | 未修 |
| ASTRUM-019 | IndexedDB 逐条写，1000 条约 2.3 s | P3 | 未修 |
| ASTRUM-020 | 事件先入内存后落库，写库失败时内存态短暂领先 | P3 | 潜在 |
| ASTRUM-024 | 极区太阳升落返回 null，缺「极昼/极夜」文案 | P3 | 待验证 |

其他结论：
- 异常兜底充分：`Control.run` 捕获 planner/orchestrator 异常并降级；配额错误映射为 `QUOTA`。
- 非法状态迁移抛错；预算、重试、replan、恢复次数均有上限。
- 资源有界：事件/检查点/AuditLog 均有上限。

**健壮性评分：78/100（修复后）。**

---

## 7. 天文计算与数据

### 7.1 实现与模型
| 项目 | 实现 | 评估 |
|---|---|---|
| 黄道→赤道 | `eclToEq`，当日黄赤交角 | 正确 |
| 赤道→地平 | `altAz`，方位北起、向东为正 | 正确；极区/天顶无 NaN |
| 恒星时 | `lstHours`，GMST 多项式 | 与 Meeus 例 12.a 一致 |
| 银道→赤道 | `galToEq`，J2000 银极 | IAU 标准参数 |
| 太阳 | 低精度平黄经 + 中心差 | 适合教学/显示 |
| 月球 | Meeus 47 章截断项 | 实测 0.03° 内 |
| 行星 | JPL 近似轨道根数 | 量级正确，未外部对照 |
| 星表 | BSC5，9096 颗，J2000，未施加自行 | 来源真实 |
| 银河背景 | NASA SVS 公有领域 | 真实来源、视觉素材 |
| 行星纹理 | 程序化 Canvas | 明确为模拟 |

### 7.2 独立数值验证（真实运行）

| # | 检查 | 参考 | 结果 |
|---|---|---|---|
| 1 | GMST 1987-04-10 19:21 UTC | 8h34m57.0896s | 偏差 <0.0005 h，PASS |
| 2 | GMST J2000.0 | 18.697374558 h | 偏差 <0.0005 h，PASS |
| 3 | 月球黄经（Meeus 47.a） | 133.162655° | 偏差 <0.03°，PASS |
| 4 | 月球黄纬 | -3.229126° | 偏差 <0.03°，PASS |
| 5 | 月球距离 | 368409.7 km | 偏差 <30 km，PASS |
| 6 | 太阳春分赤纬 | 0° | 偏差 <0.05°，PASS |
| 7 | 太阳春分赤经 | 0 h | 偏差 <0.003 h，PASS |
| 8 | 地球近日点距离 | 0.9833 AU | 偏差 <0.0007 AU，PASS |
| 9 | 地球远日点距离 | 1.0167 AU | 偏差 <0.0007 AU，PASS |
| 10 | 极点 alt=dec | 60° | 偏差 <0.01°，PASS |
| 11 | 子午圈方位 | 180°（南） | 偏差 <0.01°，PASS |
| 12 | RA 0h 与 24h 等价 | 相同 | 1e-9，PASS |
| 13 | 极区 lat=89.9 | 非 NaN | PASS |
| 14 | M42 升落 | 各一次 | PASS |

> 说明：行星位置未取得外部星历逐日对照，相关精度标「待验证」，未伪造对照。

### 7.3 已修复的 P1：星表岁差/参考系混用
- **问题**：星表为 J2000 且未施加自行，却直接与「当日恒星时/当日黄赤交角」混合；太阳/行星反而是 of-date。2026 年恒星位置系统性偏移约 **0.2°–0.36°（随天区）**。
- **修复**：
  - `Astro.precess(ra, dec, fromJd, toJd)`：IAU 1976 / Meeus 21.5。
  - `Astro.altAzJ2000(...)`：先岁差再转地平。
  - 星图（恒星、L1、DSO、星座、银河带、尘埃带）、天体列表/详情、Agent 恒星/DSO 星历统一使用 J2000 入口。
  - 银河纹理反投影 `altAzToEq` 岁差回 J2000，纹理与恒星对齐。
  - 太阳/行星/月球保持 of-date，避免二次岁差。
- **验证**：`p0-03` 涉及位置/时刻的 8 问基线按新契约更新，其余问题哈希不变；`v2-sky` 全部通过；`visual-stars` 16/16、`visual-stars-quality` 36/36。

### 7.4 其他天文问题
| 编号 | 结论 | 等级 | 状态 |
|---|---|---|---|
| ASTRUM-008 | 行星位置缺乏外部星历对照 | P2 | 待验证 |
| ASTRUM-016 | 月相按 8 等分时间段命名，边界最多偏差约 1.8 天 | P3 | 未修 |
| ASTRUM-017 | `astro.js` 头注释称 J2000，实际太阳/行星为 of-date | P3 | 未修 |
| ASTRUM-018 | 行星纹理/银河/星座连线为模拟或示意 | P3 | 应显式声明 |

**天文评分：88/100（修复后；行星待验证项扣分）。**

---

## 8. Agent 与科研真实性

### 8.1 结论
- 系统是 **Intent Routing + 固定模板 Pipeline**，不是自主多智能体协商。
- `agents.js` 定义 13 个角色（Muse、Vega、Cosmos、Kepler、Horizon、Orion、Lyra、Nova、Helios、Scholar、Critic、Curator、Navigator），本质是职责标签、提示词片段与 UI 人格。
- 模型只在来源摘要/答案表述层调用；无模型时明确降级，不伪造外部事实。
- Evidence/Claim 有稳定 ID、来源枚举、`calc`、引用核验与数值冲突检测；Critic 否定会进入边界说明。
- P3 能力（目标解析、模板 Plan、DAG 环检测、并行冲突、预算、重试、replan、暂停、恢复）均有实现与测试。
- P4 能力（事件、检查点、幂等恢复、恢复次数=1、版本变化阻止恢复）真实可用；浏览器实测刷新后可恢复，但**不是关闭页面后继续执行**。

### 8.2 问题
| 编号 | 结论 | 等级 | 状态 |
|---|---|---|---|
| ASTRUM-003 | 「多智能体」表述超出实现 | P2 | 未修 |
| ASTRUM-009 | Claim `origin` 统一 `p0-fixture` | P2 | 未修 |
| — | `source/entity` 维度为结构检查 | P3 | 未修 |
| — | 外部内容提示注入未做专门过滤 | P3 | 潜在 |

**Agent/科研真实性评分：66/100。**

---

## 9. P0–P4 实现审计

| 阶段 | 目标 | 结论 | 测试证据 |
|---|---|---|---|
| P0 | 身份/权限/Schema/Tool/存储/隔离 | 基本完整 | p0-security 38/38、p0-03 53/53、p0-migration 10/10 |
| P1 | 项目/记忆/证据/上下文/导入导出 | 完整 | 5 套 220/220 |
| P2 | Skill 提案→发布→执行→版本 | 完整 | 8 套 374/374 |
| P3 | 目标/Plan/DAG/执行/预算/恢复 | 基本完整 | 7 套 103/103 |
| P4 | 事件/检查点/幂等/生命周期 | 真实可用、语义有限 | 8 套 139/139 + browser 13/13 |

整体实现度约 **88%**（按宣称能力逐项计，不含「后台执行」「自主多智能体」等超范围预期）。

---

## 10. 测试与质量

### 10.1 修复前基线
- P0–P4 共 33 个套件全部 PASS；`p4-browser 13/13`、`v1-5-idb-stress 7/7`。
- `selftest`：**153/156，exit=1**。
- 失败项：i18n 静态侧栏、research produces evidence（n=0）、synthesis counts evidence（n=0）。

### 10.2 失败根因
1. `selftest` 调用 `Research.run` 未传 `principal`；P0 授权后返回 `denied` 且空证据。
2. P2 的「科研技能」块被插入侧栏首位，`#sidebar h3` 不再指向「对话」。
3. 两个动态标题缺少 `data-i18n` 与英文词条。

### 10.3 修复与复审
- `selftest`：**157/157，exit=0**（新增 `research authorized` 断言）。
- `p0-03`：**53/53**。
- `v2-sky` 全部通过（含浏览器 01/2c）。
- `visual-stars` 16/16；`visual-stars-quality` 36/36。
- 全部非浏览器套件重跑：相关套件通过；`v1-2-deploy`、`v1-4-pages` 偶发端口/构建波动，复跑分别 21/21、32/32。
- `i18n-scan --max=0` 仍有 30 条**既有**英文界面残留（与本次改动无关；本次新增标题已补英文）。

### 10.4 覆盖缺口
- 多标签页并发、超时后下游继续执行、关闭页面后「不续跑」缺少显式断言。
- 无岁差/行星外部星历回归（岁差已补，行星仍缺）。
- Firefox/Safari、移动端、低端设备未覆盖。
- 提示注入对抗测试缺失。

**工程质量与测试评分：82/100。**

---

## 11. 性能与兼容性

多次实跑范围：

| 指标 | 数值 |
|---|---|
| 冷启动 | 130–216 ms |
| Router p95 | 0.9–1.3 ms |
| Planner p95 | 1.0–1.5 ms |
| Control 本地均值 | 28–33 ms |
| 100 条证据报告均值 | 8.9–10.0 ms |
| TaskStore 200 条 | 178–209 ms |
| heapUsed | 18.9–20.0 MB |
| IDB 1000 写 / 500 删 | 2273 ms / 1740 ms |

评估：交互路径毫秒级，内存低；瓶颈是 IndexedDB 逐条写。兼容性仅验证 Chromium；Firefox/Safari/移动端**待验证**。

**性能评分：86/100。**

---

## 12. 功能边界与能力分级

分级：**A 完整可用 / B 基本可用 / C 有限/有条件 / D 演示 / E 未实现**。

- **A（12 项）**：离线问答、意图路由、模板回答、证据编号、报告、777星图、观测计划、项目/记忆、导入导出、Skill 全生命周期、任务持久化、P4 恢复。
- **B（16 项）**：多源检索、引用核验、Claim、附件、太阳/月亮位置、行星位置（近似）、太阳系展示、天气、地理位置、计算器、Agent 角色、Goal 解析、DAG 计划、国际化和可访问性。
- **C（12 项）**：云端模型（需 Key）、实时检索、天气、论文全文、SIMBAD、行星精度、暂停语义、Skill 语义越权防护、Key 管理、CI、浏览器兼容、极区文案。
- **D（2 项）**：行星程序化纹理、星座示意连线。
- **E（1 项）**：后台继续执行。

**明确不具备**：精密星历、自主多智能体协商、望远镜控制、多用户安全隔离、协作权限、自动科学发现。

**产品完整度评分：82/100。**

---

## 13. 问题总表（最终状态）

| 编号 | 等级 | 标题 | 状态 |
|---|---|---|---|
| ASTRUM-001 | P1 | CI 自测门禁失败（153/156） | **已修复（157/157）** |
| ASTRUM-002 | P1 | J2000 星表与 of-date 恒星时混用 | **已修复** |
| ASTRUM-003 | P2 | 「多智能体」表述超出实现 | 未修 |
| ASTRUM-004 | P2 | 未知幂等性恢复保守 reuse | 未修 |
| ASTRUM-005 | P2 | 超时不中断底层请求 | **已修复** |
| ASTRUM-006 | P2 | 暂停仅在步骤边界生效 | 未修 |
| ASTRUM-007 | P2 | 档案隔离非安全边界 | 设计边界 |
| ASTRUM-008 | P2 | 行星位置缺外部星历对照 | 待验证 |
| ASTRUM-009 | P2 | Claim origin 标为 p0-fixture | 未修 |
| ASTRUM-010 | P2 | 多标签页并发写缺冲突保护 | 未修 |
| ASTRUM-011 | P3 | CSP style-src unsafe-inline | 未修 |
| ASTRUM-012 | P3 | API Key 明文 localStorage | 已披露 |
| ASTRUM-013 | P3 | CORS Worker 路径/大小限制不足 | 未修 |
| ASTRUM-014 | P3 | AuditLog 可篡改 | 未修 |
| ASTRUM-015 | P3 | 静态 i18n 缺条目 | **已修复** |
| ASTRUM-016 | P3 | 月相按 8 等分命名 | 未修 |
| ASTRUM-017 | P3 | astro.js 注释与实现不一致 | 未修 |
| ASTRUM-018 | P3 | 视觉资产为模拟/示意 | 应声明 |
| ASTRUM-019 | P3 | IDB 大量写入较慢 | 未修 |
| ASTRUM-020 | P3 | 事件内存态可能领先持久化态 | 潜在 |
| ASTRUM-021 | P3 | 无依赖清单/SBOM | 可接受 |
| ASTRUM-022 | P3 | Research.run 缺 principal 时静默空证据 | 测试已修正，API 仍可改进 |
| ASTRUM-023 | P3 | Actions 未按 SHA 锁定 | 未修 |
| ASTRUM-024 | P3 | 极区升落缺文案 | 待验证 |

统计：发现 **24** 项；已修复 **2** 项 P1、**1** 项 P2、**1** 项 P3；剩余 **20** 项（P2 7、P3 13），其中待验证 3 项。

---

## 14. 本次修复记录

### 14.1 selftest
- 修改 `tools/selftest.js`：
  - `Research.run` 传 `scholar` principal；
  - 新增 `research authorized` 断言；
  - i18n 选择器改为 `#sidebar h3[data-i18n='对话']`。
- 修改 `core/skill-ui.js`、`core/project-ui.js`：动态标题补 `data-i18n` 与当前语言文本。
- 修改 `core/i18n.js`：新增 `科研技能 → Research skills`、`研究课题 → Research topics`。

### 14.2 岁差
- `core/astro.js`：新增 `precess`、`altAzJ2000`，版本 `0.9.4-local`。
- `core/sky-viewmodel.js`：恒星/L1/DSO/星座/银河/尘埃统一 `altAzJ2000`；`altAzToEq` 反解回 J2000；版本 `1.2.0`。
- `core/app.js`：天体列表、星座可见性、星体详情使用 `altAzJ2000`。
- `core/agents.js`：`ephemFor`/`windowsWithin` 支持 J2000 标记；`isCatalogCoord` 判定星表目标。
- `core/registry.js`：`calcFor` 对 star/dso/kb 传 J2000 标记。

### 14.3 测试基线
- `tools/p0-03-test.js` + `tools/fixtures/p0-03-baseline.json`：位置相关 8 问基线更新。
- `tools/v2-sky-01/2b/2c/2c-browser-test.js`：参照改为 `altAzJ2000`。
- `tools/visual-stars-test.js`、`visual-stars-quality-test.js`：参照改为 `altAzJ2000`；Q07 合成行反算 J2000。

### 14.4 超时中止下游（ASTRUM-005）
- `core/orchestrator.js`：
  - `withTimeout(fn, ms, signal)` 创建每次尝试的 `AbortController`；
  - 超时或外部取消时先 `abort()`，再返回 `timeout`/`cancelled`；
  - `ToolGateway.invoke` 与 `spec.run` 收到 `attemptSignal`，使 `sources`/`simbad`/`paper-fulltext` 等 `fetch` 真正中止。
- `core/skill-runtime.js`：同样为每个 Skill 工具步骤创建受超时控制的信号。
- `tools/p3-executor-test.js`：新增 `P3-X4-01/02`，验证超时时下游收到 `abort` 且结果为 `timeout`。

### 14.5 复审结果
- `selftest` 157/157，exit 0。
- `p3-executor` 12/12；P3/P4、Skill、b8 等相关套件全部通过。
- 测试产生的临时 fixture 副作用已还原，未提交 Git。

---

## 15. 综合评分

| 维度 | 修复前 | 修复后 |
|---|---|---|
| 架构一致性 | 84 | 84 |
| 安全 | 80 | 80 |
| 健壮性 | 76 | 80 |
| 天文准确性 | 77 | 88 |
| Agent/科研真实性 | 66 | 66 |
| 工程质量与测试 | 74 | 82 |
| 性能 | 86 | 86 |
| 文档一致性 | 78 | 80 |
| 产品完整度 | 82 | 82 |
| **加权总分** | **77** | **80** |

> 权重：架构/安全/健壮性/天文/Agent 各 15%，测试 10%，性能/文档/产品各 5%。

---

## 16. 最终结论（11 项）

### 1. 文档路径
本报告：`docs/audit/ASTRUM-最终审计报告.md`。
分项报告：`ASTRUM-00`～`ASTRUM-13`（总报告、架构、安全、健壮性、天文、Agent、P0–P4、功能边界、测试、性能、问题清单、修复路线、功能分级、证据索引）。

### 2. P0–P4 实现
P0/P1/P2 可交付；P3 基本完整；P4 真实可用但仅支持「刷新后手动恢复」，不支持后台续跑。整体实现度约 88%。

### 3. 问题数量
发现 24 项：P0 0、P1 2、P2 8、P3 14。已修复 2 项 P1、1 项 P2、1 项 P3；剩余 20 项。

### 4. 安全清单
已证实：单一授权入口、身份不可伪造、工具参数守卫、按档案分库、Skill 发布态/白名单/能力校验、恢复重授权、CSP 严格、无 `eval`、无未转义 XSS 路径、隐私声明一致。
风险：本地档案非安全边界、Key 明文、CSP 样式放行、CORS Worker 限制不足、审计日志可篡改（均 P2/P3）。

### 5. 天文结论
GMST、月球、太阳、地球近日/远日点、Alt/Az 约定与极区边界均通过独立对照。星表岁差已修复，恒星/银河纹理与 of-date 天球一致；行星位置仍缺外部星历对照（待验证）。

### 6. 功能边界
可用：离线问答、星图、太阳系、观测计划、检索取证、报告、附件、项目/记忆、Skill、任务恢复。
不具备：后台执行、自主多智能体、精密星历、望远镜控制、多用户安全隔离。
演示/模拟：行星纹理、随机星场、星座连线、银河视觉素材。

### 7. 真实测试结果
P0–P4 全绿；`selftest` 修复后 **157/157，exit=0**；`p0-03` 53/53；`v2-sky` 全部通过；`visual-stars` 16/16；`visual-stars-quality` 36/36；`p4-browser` 13/13。
既有 `i18n-scan --max=0` 仍有 30 条历史残留（非本次引入）。

### 8. 综合评分
**80/100**（修复前 77）。

### 9. 是否建议公开部署
**有条件建议**。作为个人/教育静态站点可以发布；须在 README/关于页明确「非精密星历、非自主多智能体、非后台执行」。不建议用于专业定轨、精密指向或多用户安全场景。

### 10. 最优先十项（剩余）
1. 暂停支持协作式中断或明确「当前步骤后暂停」。
2. 未知幂等性改为 `validate_then_reuse`/`rerun`。
3. 补行星外部星历回归测试。
4. 纠正 README「多智能体」表述。
5. 修正 Claim `origin` 契约。
6. 多标签页写入增加版本冲突检测。
7. 收紧 CSP `style-src` 与 localhost 放行。
8. CORS Worker 增加路径白名单与大小上限。
9. 清理 `i18n-scan` 既有 30 条残留并恢复 CI 全绿。
10. 增加「关闭页面后不续跑」与「超时后下游确实中止」的浏览器级断言。

### 11. 审计期间 Git 变化
- 起始：工作区干净，HEAD `bb2e497`。
- 审计阶段：仅新增 `docs/audit/` 报告，未改源码。
- 修复阶段（用户授权）：修改 20 个源码/测试/基线文件；测试产生的临时 fixture 已还原；未 commit、未 push、未切分支、未部署。
- 当前 `git status`：20 个 `M` 文件 + `?? docs/audit/`。

---

## 17. 附录：复现命令

```bash
cd D:/Projects/Astrum

# 全量自测（CI 等价）
node tools/selftest.js "file://$PWD/index.html"

# 分阶段测试
node tools/p0-security-test.js
node tools/p0-03-test.js
node tools/p4-browser-test.js
node tools/v1-5-perf-test.js

# 天空与星表
node tools/v2-sky-01-test.js
node tools/v2-sky-2b-test.js
node tools/v2-sky-2c-test.js
node tools/visual-stars-test.js
node tools/visual-stars-quality-test.js
```

独立天文验证脚本位于临时工作区 `audit/astro-verify.js`，不随仓库分发。

---

**报告结束。**
