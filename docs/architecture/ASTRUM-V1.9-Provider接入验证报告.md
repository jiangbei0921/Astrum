# ASTRUM V1.9 · 真实 Provider 接入验证报告

> 日期：2026-11-03
> 环境：Windows / Node 24.19 / 本机回环 HTTP
> 结论：真实 Provider 调用 **BLOCKED_API_KEY**；离线协议、错误分类、Bridge 包装与 Agent/预算边界已执行并通过。未用 Mock 冒充真实 Provider PASS。

## 1. 现状检查

- Provider 配置入口：设置 → 来源与密钥；`Sources.setConfig(id, patch)`。
- 模型选择：内置模型列表 + 自定义模型 ID；`Sources.conf` 读取 endpoint/model/key/temperature/maxTokens。
- 密钥：`localStorage` 本机保存；测试只读环境变量，不写入仓库/日志。
- 请求构造：`buildRequest` 支持 OpenAI 兼容、Anthropic、Gemini 三种 shape。
- 响应解析：`parseResponse` 统一取文本；`clean` 清理 Markdown/编号并限制 360 字。
- 超时/重试：`withTimeout`（默认 20s）；Runner 只对幂等工具重试，模型表述不自动无限重试。
- 流式输出：当前未实现，本轮未新增。
- Agent 调度：Muse/Router/Planner 与模型表述解耦；模型失败只影响表述段，不覆盖研究结论。
- 降级：模型失败保留证据链结论，并标注“云端表述失败”。

## 2. 本轮代码修复

| 问题 | 根因 | 修改 | 结果 |
|---|---|---|---|
| HTTP 500 被 Bridge 归为 `network` | Bridge 仅用 message 正则 | `Sources.generate` 抛带 `status/cls` 的 `httpError`；Bridge 使用 `Sources.classifyError` | 500 → `server`，可重试 |
| 坏 JSON 被归为 `network` | `r.json()` SyntaxError 未分类 | 保存 `cls=parse` 并透传 | 坏响应 → `parse` |
| 空响应被当成功 | `clean('')` 返回空串仍 `ok=true` | 文本为空时抛 `empty` | 明确失败 |
| 404/模型名错误不明确 | 只映射 401/429 | 增加 `notfound` | 模型名/地址错误可定位 |
| 401/403 分类混杂 | 无结构化错误 | `classifyError` 统一 status | 401/403 → `auth` |
| 未配置密钥分类不稳定 | Bridge 正则依赖“密钥”字样 | `classifyError` + fallback | 稳定 `auth` |
| 无统一错误详情 | 只返回 code/reason | 返回 `kind/status/retryable` | 诊断更完整 |

## 3. 离线协议验证（真实请求路径，本机回环）

`node tools/v1-9-provider-test.js` 使用真实 `fetch` 请求本机 HTTP 服务，验证请求构造、响应解析与错误分类。该结果标记 `OFFLINE_PROTOCOL`，**不计作真实 Provider PASS**。

结果：**20/20 PASS**。

| 场景 | 结果 |
|---|---|
| 正常 OpenAI 兼容响应 | PASS，文本/token/耗时正确 |
| 单次调用只发一次请求 | PASS |
| 401 | `auth`，保留 status=401 |
| 403 | `auth` |
| 429 | `rate_limit`，不可重试 |
| 500 | `server`，可重试 |
| 坏 JSON | `parse` |
| 空 choices | `empty` |
| 客户端 80ms 超时 | `timeout` |
| 缺 Key | `auth`，不发起请求 |
| 取消 | `cancelled`，0 次请求 |
| 模型失败不挂载 TaskState | PASS |
| 模型失败不消耗 ADR-001 预算 | PASS |
| Muse 复杂研究路由 | `control / research` |
| 13 Agent | 13，不变 |

## 4. 真实调用状态

环境变量检查结果：

| 变量 | 状态 |
|---|---|
| `ASTRUM_LIVE_API_KEY` | missing |
| `ASTRUM_LIVE_BASE_URL` | missing |
| `ASTRUM_LIVE_MODEL` | missing |
| `ASTRUM_LIVE_PROVIDER` | 默认 openai-compatible |

因此：

- Provider 名称：未确认（未提供真实 Key）。
- 模型名称：未确认。
- 真实调用次数：0。
- 成功次数：0。
- 失败次数：0。
- 平均耗时/Token：N/A。
- 真实 401/429/500、超时、无效响应、模型不可用：未执行。

状态：**BLOCKED_API_KEY**。不得写成 PASS。

## 5. 安全配置方法

只在本地 shell 设置，禁止粘贴到聊天、代码、Git 或截图：

```powershell
$env:ASTRUM_LIVE_PROVIDER = "openai-compatible"   # 或 gemini / anthropic
$env:ASTRUM_LIVE_BASE_URL = "https://api.example.com/v1/chat/completions"
$env:ASTRUM_LIVE_MODEL = "your-model-id"
$env:ASTRUM_LIVE_API_KEY = "<本机环境变量>"
node tools/v1-9-provider-test.js
```

有 Key 时脚本执行：基础问答、中文科研问题、长文本、多轮、真实坏 Key 鉴权测试，记录耗时/Token/错误分类；不会打印 Key。

## 6. 未完成项

| 项 | 状态 | 条件 |
|---|---|---|
| 真实 Provider 正常调用 | BLOCKED_API_KEY | 提供有效的 `ASTRUM_LIVE_*` 环境变量 |
| 真实 429/配额 | BLOCKED_QUOTA（未触发） | 需要真实账户额度条件 |
| 真实 Provider 不可用 | BLOCKED_PROVIDER（未触发） | 需要 Provider 侧故障或可复现的不可达条件 |
| 模型与 Agent UI 全链路 | 待真实 Key | 浏览器中选云端模型并在设置中测试连接后再问研究问题 |
