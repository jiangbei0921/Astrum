# ASTRUM 最终架构文档

> 版本：V1.4 / V1.5 已完成；V1.6 未启动（门槛 2/5）
> 日期：2026-11-02
> 适用代码：`main` 分支当前实现
> 历史依据：`P0-01-目标架构总蓝图.md`、`V1-00-核心能力建设总蓝图.md`、`ADR-001`、各 V1.x 架构更新
> 本文档是当前实现与原始架构的对照基准；旧文档中已被取代的状态以本文和 `ASTRUM-原始架构逐项完成度对照表.md` 为准。

---

## 1. 架构边界（不可擅自改变）

| 边界 | 当前状态 |
|---|---|
| 13 个固定 Agent | Muse、Vega、Cosmos、Kepler、Horizon、Orion、Lyra、Nova、Helios、Scholar、Critic、Curator、Navigator |
| Muse 控制器 | 保留，负责意图/风格/编排上下文 |
| Tool-Centric | Registry 统一工具元数据、权限、预算、超时、重试 |
| 7 模板 | T-A—T-G；不新增第 8 模板 |
| 旧兼容接口 | `ask()`、`buildAnswer()`、`compose*()`、`toSections()`、`detectIntent()` |
| 预算 | ADR-001：L1=0、L2=1、L3/L4=2，硬上限 2 |
| 运行形态 | 纯静态 JavaScript、零 npm 依赖、Chrome/file://、GitHub Pages |
| 不引入 | FastAPI、Redis、MySQL、LangGraph、CrewAI、AutoGen、动态 Agent Marketplace、独立 Agent Registry/Memory、MAST 下载、Hypothesis Tournament |

## 2. 模块地图

### 2.1 入口与控制

```text
index.html
  → core/app.js（UI、统一入口、附件、渲染）
  → core/request.js（Request.handle，统一入口）
  → core/router.js（Router，L1—L4 / 场景）
  → core/planner.js（Planner，7 模板 + expand/replan）
  → core/task.js（TaskState、事件白名单）
  → core/orchestrator.js（Runner，依赖/并行/失败隔离/取消）
  → core/registry.js（12 工具基线）
  → core/compose-adapter.js（Compose Adapter → answer.research）
  → core/control.js（AstroControl，Loop/预算/恢复）
  → core/control-bridge.js（Control Bridge，统一 UI 入口）
```

### 2.2 证据与科学规则

- `core/evidence.js`：Evidence 规范、去重、独立来源。
- `core/claims.js`：Claim 构建、R1–R4 判定、FITS 定量 Claim、SEM。
- `core/reducer.js`：按 `实体|量纲` 分组，1σ 合成判 significant conflict。
- `core/report.js`：结论、论文统计、`evidenceScope`、`supportGranularity/sourceChunks`。
- `core/research-ui.js`：`answer.research` 的只读渲染，外部数据 `textContent`。

### 2.3 论文全文

- `core/paper-fulltext.js`：PDF/HTML 获取、大小/超时/取消、会话缓存、Evidence。
- `core/pdf-text.js`：PDF 文本提取、章节、页码、chunks、CID+ToUnicode、加密识别。
- `core/paper-attachment.js`：本机 PDF 附件解析。
- `core/attachment-evidence.js`：FITS/PDF 附件 → Evidence；文本/图片不生成科学证据。

### 2.4 数据与模型

- `core/sources.js`：搜索端点链、缓存、重试/退避、429/超时/网络分类、云端模型请求。
- `core/agents.js`：13 Agent 与本地答案生成。
- `core/astro.js`、`core/solarsystem.js`、`core/fits.js`、`core/fit.js`、`core/simbad.js`、`core/weather.js`。
- `data/*.js`：目录、知识、地点、天体、观测计划、器材、每日前沿。

### 2.5 持久化与 UI

- `core/task-store.js`：IndexedDB 优先，localStorage 回退（40 条）。
- `core/store.js`、`core/thread.js`：对话/线程。
- `assets/app.css`：布局、步骤面板、恢复列表、研究面板。
- `core/research-ui.js`：研究执行报告。

## 3. 关键流程

### 3.1 普通问答

```text
用户问题 → Router L1/L2 → 模板/旧 ask 分支 → 本地答案 → 渲染
```

### 3.2 Research Loop

```text
Router L3/L4 → Planner(T-A/T-C/T-E) → Runner
  → Evaluator: continue/append/replan/stop
  → 追加定向检索（只追加，不重排）
  → Claims/Reducer → Report → answer.research
```

约束：最多 2 轮；`appends/searches` 真实消耗；`progress.decided`/`plan.expanded` 事件；取消不新增工作。

### 3.3 论文全文

```text
paper metadata → 公开 PDF/HTML URL
  → fetchPdf（大小/超时/取消/类型）
  → pdf-text（文本/章节/页码/chunks/CID/加密）
  → fulltext Evidence
  → Claims/Report
```

失败分类：`pdf_too_large`、`not_pdf`、`pdf_empty`、`pdf_no_text`、`pdf_cid_unsupported`、`pdf_encrypted`、`html_error_page`、`html_no_text`、`timeout`、`network`、`cancelled`。

### 3.4 附件

```text
File → kindOf（扩展名 + MIME 双向校验）
  → image / text / fits / paper / other / mismatch
  → 单个文件独立结果
  → FITS/PDF 可生成 Evidence；文本/图片只作为参考材料
```

安全边界：MIME/扩展名冲突 → `unparsed`；二进制伪装文本 → `error`；附件不进入 Control 科学证据；模型提示中明确“用户提供，冲突时以本地事实为准”。

## 4. 数据契约

### 4.1 TaskState / 事件

- `EVENT_TYPES` 含 `progress.decided`、`plan.expanded`、`task.recovered`、`step.*`。
- payload 白名单 `['from','to','action','verdict','reason','attempt']`；不加入 `claimId/conflictId`。
- 步骤状态：`pending/ready/running/ok/failed/skipped/blocked/aborted`。

### 4.2 Evidence / Claim / Report

- Evidence：`evidenceId/sourceId/sourceType/title/uri/contentLevel/trust/provenance/abstractOnly`。
- Claim：`required/support[{eid,strength,basis}]/contradict/uncertainty/calc`。
- Report：`conclusions/evidence/papers/parameters/observations/conflicts/gaps/limitations/uncertainties/paperStats`。
- 结论兼容字段：`evidenceScope`；新增 `supportGranularity`（`fulltext_chunk` / `abstract_sentence` / `evidence_item`）与 `sourceChunks`。

### 4.3 全文缓存

- `sessionStorage` key：`astrum.fulltext.cache.v1`。
- TTL 7 天；最多 8 篇；序列化上限 2MB。
- 刷新同标签页有效；关闭标签页清除；不跨会话长期保存全文。

### 4.4 版本元数据

`_site/version.json`：`app/appVersion/releaseVersion/featureVersion/buildTime/buildMode/deployEnv/commit/dirty/runId`。

## 5. 错误与降级

| 层 | 策略 |
|---|---|
| 外部搜索 | 端点链、超时、重试/退避、429 识别、缓存、部分成功保留、失败原因呈现 |
| PDF/HTML | 类型/大小/加密/CID/扫描/反爬分类；失败不生成全文 Evidence |
| 模型 | auth/rate_limit/timeout/network/server/schema 分类；失败不使用模型输出替代研究结论 |
| 任务 | 取消、失败隔离、非关键步骤失败继续、可恢复任务逐个恢复 |
| 附件 | 单文件失败不影响其它；冲突/二进制/超大明确提示 |

## 6. 安全与隐私

- 构建白名单：`index.html`、`privacy.html`、`.nojekyll`、`version.json`、`assets/app.css`、`core/*.js`、`data/*.js`。
- 构建扫描：密钥 0、绝对本地路径 0；CSP 哈希同步；外部数据 `textContent`。
- API Key 存 localStorage 明文（已披露）；导出排除 Key；日志/截图/文档不记录 Key。
- 不绕过付费墙/登录；只处理公开 PDF/HTML。

## 7. V1.6 状态

| 启动条件 | 状态 |
|---|---|
| V1.4 线上验收 | 满足 |
| V1.5 稳定性/长跑 | 满足 |
| 明确实际生产问题 | 未满足 |
| 具体改进目标 | 未满足 |
| 量化验收指标 | 未满足 |

结论：V1.6 不启动；12 个候选项仅分类管理。CID/ToUnicode 与加密识别属于 V1.4/V1.5 全文能力补强，不等于启动 V1.6 云协议/OCR/多模型。

## 8. 文档索引

- 原始矩阵：`ASTRUM-原始架构逐项完成度对照表.md`
- 实施：`ASTRUM-最终工程实施报告.md`
- 测试：`ASTRUM-全量测试与线上验收报告.md`
- 研究基准：`ASTRUM-真实天文研究基准集与执行结果.md`
- 外部条件：`ASTRUM-外部条件与剩余验证说明.md`
- 发布回滚：`docs/operations/ASTRUM-最终发布与回滚手册.md`
- 历史：`ASTRUM-全项目架构追踪与缺口分析.md`、`V1-00-核心能力建设总蓝图.md`、`ADR-001-replan-budget.md`

## 9. V1.7 真实科研能力（2026-11-02）

- 架构边界不变：13 Agent、Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口、ADR-001 均保留。
- 新增能力只在既有模块内增强：
  - Planner：主题型研究检索式收敛、无坐标目标跳过可选 SIMBAD；
  - Sources：完整摘要（1600 字）、figshare/zenodo/OSF 预印本识别；
  - Claims：关键句选择、摘要缺数值警告、距离测量值结构化 Claim；
  - Reducer：数值与不确定性同单位换算，1σ 内不虚构冲突；
  - Compose Adapter：跨 Provider 标题去重、可信论文门槛、研究口径 verdict。
- 新增 `tools/v1-7-research-benchmark.js`（46 案例 / 15 类），不改变生产模块职责。

## 10. V1.8 问题反馈（2026-11-03）

### 10.1 模块边界

- 新增 `core/feedback.js`：纯逻辑，无 DOM、无网络；负责配置、错误分类、主动提示去重、诊断、脱敏、草稿与邮件。
- UI 仍在 `core/app.js`：三入口共用 `#feedback` 浮层（`.sheet wide`），不新增后端或独立页面。
- 不新增 Agent、模板、数据库；13 Agent、Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口、ADR-001 不变。

### 10.2 数据流

```text
TaskState / answer.meta / 用户输入
        ↓
AstroFeedback.analyze()
        ↓  needed + primary
maybeOfferFeedback() → .fb-offer（同 Task+类别去重）
        ↓ 用户点「反馈问题」
openFeedback() → 表单（当前问题/回答最小上下文）
        ↓ 生成
buildDraft() → 脱敏 → subject/body/mailto
        ↓ 用户确认
openMailClient()（只尝试唤起，不代表发送成功）
```

### 10.3 隐私边界

- 诊断只取当前任务与当前回答；不取历史对话、完整 MEMORY、其他任务。
- 导出前执行键名黑名单与字符串模式脱敏；绝对路径替换为 `[LOCAL_PATH]`。
- 默认不附加诊断；用户必须主动勾选并在确认页查看。
- `mailto` 仅生成草稿；不自动发送，不读取发送结果。

### 10.4 扩展点

`submitFeedback(feedback)` 按 `CONFIG.feedbackChannel` 分发，`registerChannel(name, handler)` 可注册未来 GitHub Issues / 产品 API / 工单渠道；更换邮箱或渠道只需改配置，不改三入口 UI 与诊断逻辑。

详细说明见 `docs/feedback/FEEDBACK.md`。

## 11. V1.9 真实科研强化（2026-11-03）

### 11.1 架构边界

- 13 Agent、Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口、ADR-001、静态部署全部保留。
- 未新增 Agent、后端、数据库、模型框架；Provider 仍走 `Sources` + `ControlBridge`。
- 反馈模块仍是 `core/feedback.js` + 三入口，不重写。

### 11.2 能力增强

| 模块 | 变化 |
|---|---|
| Router | 研究词表扩展；unknown 但有研究信号不再强制 LEGACY |
| Agents | 缺省 ctx 回填 bortle/lat/lon/tz；知识别名补光谱类型 |
| Sources / Bridge | 结构化 Provider 错误：auth/rate_limit/timeout/server/notfound/parse/empty/network |
| PDF | 页码映射、refsStartPage、参考文献不进入 evidence chunks、乱码拒绝、24MB、尾部垃圾容忍 |
| Paper Fulltext | 全文 Evidence ID 按 chunk 唯一 |
| Feedback | 诊断增加论文/证据/Claim/evidenceRefs/PDF/工具/Provider/gaps/limitations |

### 11.3 数据流

```text
用户问题 → Router（研究/比较/单目标） → Planner（T-E/T-F/T-D）
  → Registry/Runner（paper.search / evidence.search / fulltext）
  → Evidence（含全文 chunk/page）→ Claims（support.eid）
  → Reducer/Report → Compose → Answer
  → 反馈：Analyze → Diagnostic → 用户确认 → mailto
```

### 11.4 测试与线上

- 独立盲测 56/56；真实 PDF 79/79；反馈诊断 27/27；E2E 31/31；V1.7 基准 46/46。
- 功能提交 `8b7b8aa`；线上 commit `0640f6f`；test `41603946113` / pages `41604395159` success。
- 剩余外部条件：真实 Provider Key、真实扫描/CID PDF、真实邮件客户端发送。
