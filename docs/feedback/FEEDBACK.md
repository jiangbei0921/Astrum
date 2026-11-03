# ASTRUM 问题反馈功能说明

> 版本：V1.8（2026-11-03）
> 代码：`core/feedback.js` + `core/app.js` 三入口 UI
> 当前渠道：邮件（`mailto:`），收件人 `2185428966@qq.com`
> 原则：用户确认后才生成邮件草稿；ASTRUM 不会自动发送邮件，也不把「打开客户端」当作发送成功。

## 1. 模块架构

```text
core/feedback.js（纯逻辑，无 DOM、无网络）
├── CONFIG            统一配置：启用、邮箱、渠道、版本
├── TYPES             9 类反馈类型
├── classify()        错误六分类
├── analyze()         当前任务异常识别 + 主动提示判定
├── promptKey()       同 Task ID + 同错误类别去重
├── shouldPrompt() / markPrompted() / ignore()
├── buildDiagnostic() 最小诊断上下文
├── redact() / sanitizeValue()
├── buildDraft()      校验、反馈编号、上下文裁剪
├── subject() / body() / plainText() / mailtoUrl()
├── submitFeedback()  按 feedbackChannel 分发
├── openMailClient()  仅在用户确认后调用
└── registerChannel()  未来渠道扩展入口

core/app.js
├── 对话内主动提示（.fb-offer）
├── AI 回答操作条「反馈问题」
├── 设置 → 帮助 → 问题反馈
├── 表单 / 确认页 / 草稿恢复 / 下载
└── index.html #feedback 浮层（沿用 .sheet 样式）
```

不新增 Agent、后端、数据库或网络请求；不改变 Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口与 ADR-001。

## 2. 三种反馈入口

### 2.1 对话内主动提示

触发信号：

- Agent / 编排步骤失败（`compose.*`、调度异常、任务中断）；
- 论文检索、全文获取、PDF 解析失败；
- 外部服务超时 / 网络 / 限流 / HTTP 403、429、5xx；
- 模型表述调用失败；
- 研究检索零证据、检索降级；
- 用户明确表示「答错了 / 不准确 / 没证据」等。

提示为对话流中的轻量卡片 `.fb-offer`，提供「反馈问题」「暂时忽略」。同一 Task ID + 同一错误类别只提示一次；错误类别不同才允许再次提示。用户忽略后写入本机去重记录，不再反复打断。

用户指认错误时，不等新回答生成，直接把提示挂在刚才的提问后，并关联上一条 AI 回答。

### 2.2 AI 回答操作条

每条 AI 回答的 `.ans-acts` 增加「反馈问题」：

- 自动关联当前问题、回答摘录、消息 ID、Task ID、Thread ID、参与 Agent、工具与来源；
- 不附加整段历史对话或其他任务；
- 默认反馈类型为「研究结果不准确」，标题自动生成，描述由用户补充；
- 消息 ID 在首次渲染时写入 `ans.meta.messageId`，随 Thread 持久化。

### 2.3 设置 → 帮助 → 问题反馈

帮助页新增独立分类「问题反馈」，显示当前收件邮箱，并提供「打开问题反馈」按钮。表单包含：

| 字段 | 必填 | 限制 |
|---|---|---|
| 反馈类型 | 是 | 9 类 |
| 问题标题 | 是 | 80 字 |
| 详细描述 | 是 | 2000 字 |
| 复现步骤 | 否 | 1000 字 |
| 预期结果 | 否 | 800 字 |
| 实际结果 | 否 | 800 字 |
| 附带脱敏诊断 | 否 | 默认关闭 |
| 联系邮箱 | 否 | 120 字，填写时校验格式 |

提供「生成反馈邮件」「复制反馈内容」「下载诊断报告」「取消」。输入内容自动保存在本机草稿；关闭后再次打开可恢复。

## 3. 错误分类

| 类别 | 代码 | 示例 |
|---|---|---|
| `system` | `tool_missing/args_invalid/deps_missing/budget/internal` | 工具未注册、参数/依赖错误、预算耗尽、状态机异常 |
| `agent` | `tool_error/task_interrupted/dispatch` | Agent 编排中断、compose 内部异常 |
| `external` | `timeout/network/rate_limit/http_403/http_429` | 外网超时、CORS、SIMBAD/天气/检索端点失败、HTTP 403 |
| `config` | `missing_key/no_key/invalid_config` | API Key 缺失、配置无效、401 且无凭据 |
| `data_parse` | `pdf_no_text/pdf_encoding/parse` | PDF 无文本层、编码异常、格式不支持 |
| `research_quality` | `no_evidence/degraded_search/empty/user_reported` | 检索无结果、证据不足、搜索降级、用户指认错误 |

用户主动取消（`cancelled`）不触发提示。外部服务失败不会标注成 ASTRUM 代码 Bug。

## 4. 诊断数据结构

```json
{
  "schema": "astrum.feedback.diagnostic/1",
  "feedbackId": "FB-YYYYMMDD-HHMMSS-XXXX",
  "createdAt": "ISO",
  "astrumVersion": "4.8",
  "browser": { "userAgent": "...", "platform": "...", "language": "...", "viewport": "..." },
  "page": { "module": "chat|answer|settings|proactive", "threadId": "..." },
  "task": {
    "id": "...", "threadId": "...", "query": "当前问题", "intent": "...",
    "template": "...", "agent": "...",
    "steps": [{ "id":"s1", "tool":"paper.search", "status":"failed",
                "error": { "kind":"timeout", "code":"...", "message":"..." }, "durationMs": 20 }],
    "events": [{ "at":"ISO", "type":"step.failed", "stepId":"s1", "reason":"timeout" }]
  },
  "error": { "category":"external", "code":"timeout", "label":"外部服务错误", "summary":"..." },
  "context": { "messageId":"...", "answerExcerpt":"≤300 字", "tools":[], "agents":[], "sources":[] }
}
```

限制：步骤/事件各最多 30 条；单字符串最多 400 字；回答摘录最多 300 字；序列化总量最多 20000 字符。只收集当前任务，不包含历史对话、完整 MEMORY、其他线程/任务或附件全文。

## 5. 隐私与脱敏

脱敏在生成诊断之前执行，界面隐藏不承担安全职责。

- 键名黑名单：`api_key/apiKey/authorization/bearer/token/access_token/refresh_token/password/secret/cookie/session/credential` → `[REDACTED]`。
- 字符串模式：`sk-`、`ghp_`、`github_pat_`、`AIza`、`xox`、JWT、`Bearer`、`key=value`、`Cookie:` → `[REDACTED_TOKEN] / [REDACTED] / [REDACTED_COOKIE]`。
- 本地绝对路径：Windows `C:\...`、Unix `/home/...`、`/Users/...`、`file:///...` → `[LOCAL_PATH]`。
- 用户填写的标题/描述/步骤/预期/实际同样先脱敏再进入草稿。
- 默认不附加诊断；勾选后可在发送前查看完整 JSON。

## 6. 邮件机制

- 主题：`[ASTRUM Feedback][<反馈类型>] <问题标题>`。
- 正文：反馈编号、类型、标题、描述、复现步骤、预期结果、实际结果、ASTRUM 版本、发生时间、错误摘要、诊断说明、当前上下文、联系邮箱（若填写）。
- 固定结尾：「本邮件由 ASTRUM 生成草稿，需由用户在邮件客户端中确认并发送。」
- 生成流程：填写 → 校验 → 生成确认页 → 用户点「确认并打开邮件客户端」→ `openMailClient()`；否则不会唤起客户端。
- `mailto:` 长度上限 6000 字符（中文编码后约为原文 3 倍，1900 会让大多数中文反馈直接降级）。超限时不打开客户端，提示改用「复制反馈内容」或「下载诊断报告」。
- 诊断报告不会自动成为附件；需下载 `astrum-feedback-<编号>.json` 后在邮件客户端手动添加。
- 无邮件客户端时，复制内容与下载报告仍可用；页面不会显示「已发送」。

### 当前维护团队邮箱

`2185428966@qq.com`，只在 `core/feedback.js` 的 `CONFIG.feedbackEmail` 配置一次。其他页面与业务文件从 `AstroFeedback.config()` 读取。

## 7. 未来产品化扩展

当前 `submitFeedback(feedback)` 按 `feedbackChannel` 分发：

- `mailto`：已实现，返回主题/正文/mailto URL/超长标记；
- 未来渠道：GitHub Issues、产品反馈 API、工单系统、团队反馈平台；
- 通过 `registerChannel(name, handler)` 注册，无需重写分类、脱敏、草稿与三入口 UI；
- 更换邮箱或渠道只需覆盖 `window.ASTRUM_FEEDBACK_CONFIG` 的 `feedbackEmail/feedbackChannel`，或修改 `CONFIG`。

本轮未实现任何后端/工单系统。

## 8. 自动化测试

| 套件 | 命令 | 断言 |
|---|---|---:|
| 反馈核心 | `node tools/v1-8-feedback-test.js` | 149/149 |
| 反馈浏览器 | `node tools/v1-8-feedback-browser-test.js` | 49/49 |
| 线上反馈验收 | 临时 CDP 脚本（不入库） | 24/24 |

覆盖：配置唯一性、六类错误、误触发、去重/忽略、最小诊断、脱敏、草稿校验、邮件主题/正文/收件人/mailto 超长、回答上下文、三入口、390px 窄屏、无 JS/CSP 错误。

## 9. 关键文件

- `core/feedback.js`：反馈核心；
- `core/app.js`：三入口 UI、表单、确认页、主动提示、草稿；
- `index.html`：`#feedback` 浮层与脚本引入；
- `assets/app.css`：`.fb-*` 样式；
- `core/i18n.en-settings.js`：英文词条；
- `tools/v1-8-feedback-test.js`、`tools/v1-8-feedback-browser-test.js`；
- `.github/workflows/test.yml`：新增两个 CI 步骤。
