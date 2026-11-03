# ASTRUM V1.9 · 真实 Provider 接入验证报告

> 日期：2026-11-03
> 环境：Windows / Node 24.19 / 本机回环 HTTP（仅用于离线协议对照）
> 结论：**真实 Provider 基础调用 PASS**。DeepSeek 官方端点、模型 `deepseek-chat`，至少 7 次真实外部模型请求成功（4 个基础场景 + 3 个科研/多轮场景），另 1 次为故意坏 Key 的鉴权失败验证。离线/本地回环结果单独标注，不用于冒充真实调用。

## 1. 现状检查

- Provider 配置入口：设置 → 来源与密钥；`Sources.setConfig(id, patch)`。
- 模型选择：内置模型列表 + 自定义模型 ID；`Sources.conf` 读取 endpoint/model/key/temperature/maxTokens。
- 密钥：浏览器存 `localStorage`；验收脚本只从本机环境变量或本地临时文件读取，**不打印、不写入仓库、不进入产物**。
- 请求构造：`buildRequest` 支持 OpenAI 兼容、Anthropic、Gemini 三种 shape。
- 响应解析：`parseResponse` 统一取文本；`clean` 清理 Markdown/编号并限制 360 字。
- 超时/重试：`withTimeout`（默认 20s）；Runner 只对幂等工具重试；模型表述不自动无限重试。
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
| 只记录 total token | `tokensOf` 丢弃 prompt/completion | 新增 `usageOf`，Bridge 透传 `usage` | 可报告 Prompt/Completion/Total |
| M13 英文检索名错误 | `enQueryFor` 先查知识库，命中口语别名 `Hercules Cluster` | 改为星表优先，返回 `Hercules Globular Cluster` | OpenAlex 不再召回武仙座星系团 |
| 追问检索式退化为 `age` | MEMORY 指代未参与 Control 路径 | `request.js` 调用 `AC.resolveByMemory`，`agents.js` 导出 | 第二问检索到 M13 相关论文 |
| 追问检索词被泛化词抢占 | `RESEARCH_TERMS` 中 `measurement` 先于具体物理量 | 具体量（age/metallicity/uncertainty）优先 | 检索式为 `… age` 而非 `… measurement` |

## 3. 离线协议验证（真实请求路径，本机回环）

`node tools/v1-9-provider-test.js` 在本机 HTTP 服务上走真实 `fetch`，验证请求构造、响应解析与错误分类；该部分标记 `OFFLINE_PROTOCOL`，**不计作真实 Provider PASS**。

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

## 4. 真实 Provider 配置与调用

| 项 | 值 |
|---|---|
| Provider | DeepSeek（`openai` shape，OpenAI 兼容） |
| Base URL | `https://api.deepseek.com/v1/chat/completions` |
| 模型 | `deepseek-chat` |
| 密钥状态 | 已配置（本机临时文件读取，长度 35，前缀 `sk-`；未输出内容） |
| 真实调用 | 8 次 |
| 成功 | 7 次 |
| 失败 | 1 次（故意使用无效 Key，验证 `auth` 分类） |
| Provider 侧阻塞 | 0（本轮最终执行） |
| Mock/本地回环冒充成功 | 0 |

### 4.1 基础 Provider 场景（`tools/v1-9-provider-test.js`）

`RESULT 26/26`；`REAL PROVIDER PASS`。

| 场景 | 耗时 | Token（usage） |
|---|---:|---:|
| 基础问答（M42） | 1076 ms | 计入总计 |
| 中文科研问题（M13 年龄/金属丰度差异） | 1725 ms | 计入总计 |
| 长文本输入（约 2 万字资料） | 1240 ms | 计入总计 |
| 多轮上下文（M13 → 与 M5 相比） | 1039 ms | 计入总计 |
| 坏 Key 鉴权 | 失败（未计平均） | — |
| **合计** | 平均 1270 ms | Prompt 3791 / Completion 348 / **Total 4139** |

> `calls=5 success=4 failed=1 blockedProvider=0`。失败项是预期结果：无效 Key 返回 401，被归类为 `auth`，证明真实鉴权路径生效。

### 4.2 真实 DeepSeek + ASTRUM 科研任务（`tools/v1-9-real-provider-integration-test.js`）

`RESULT 15/15`；`REAL PASS | calls=3 success=3 failed=0`。

| 场景 | 耗时 | Prompt | Completion | Total |
|---|---:|---:|---:|---:|
| 简单中文模型调用（M42 是什么） | 1864 ms | 265 | 68 | 333 |
| 科研任务后的真实模型表述 | 1257 ms | 418 | 86 | 504 |
| 同一 Thread 第二问（来源 + 不确定性） | 1650 ms | — | — | 计入合计 |
| **合计** | 平均 1590 ms | **1167** | **291** | **1458** |

模型返回为中文，且遵守“只使用给定事实”的约束：简单问答给出 M42 = 猎户座大星云；科研表述明确指出“现有事实不足以判断不同论文测量是否一致”，没有补造金属丰度或误差数值。

## 5. ASTRUM 真实科研链路结果

入口：`AstroRequest.handle('M13 的年龄和金属丰度测量在不同论文中是否一致？', { network: true })`。

| 项 | 结果 |
|---|---|
| 路由 | `control / research` |
| 模板 | `T-E` |
| 意图 | `knowledge-target` |
| Agent | `muse, kepler, vega, lyra, horizon, orion` |
| 工具 | `simbad.tap:failed`、`paper.search:ok`、`evidence.search:ok`、`compose.domain:ok` |
| 论文 | 3 篇真实来源 |
| 证据 | 3 条 |
| 结论 / Claim | 1 / 1 |
| evidenceRefs | `ev_f267ba45e48bfedf`（可在证据集中解析） |
| 坏引用 | 0 |
| gaps | 3 条（仅摘要、SIMBAD 不可达、无 FITS） |
| limitations | 3 条（摘要口径、参数缺失、无观测验证） |

论文来源：

| 标题 | 日期 | DOI | 全文状态 |
|---|---|---|---|
| A new study of the variable star population in the Hercules globular cluster (M13; NGC 6205)★ | 2019-03-05 | `10.1093/mnras/stz642` | 仅摘要 |
| Globular Star Clusters | 1888-08-01 | `10.1038/038365c0` | 仅摘要 |
| Chemical composition and ages of four globular clusters in M31 | 2022-02-22 | `10.51194/vak2021.2022.1.1.186` | 仅摘要 |

模型表述（1257 ms、504 tokens）把论文/证据事实与结论结合，并明确说明“两篇论文均仅有摘要，无法据此比较测量差异”，保持了证据边界。

## 6. 同一 Thread 多轮上下文

第一问结束后写入 MEMORY（`target: M13`），第二问：

> 上一条回答中那个星团的年龄数据来自哪篇论文？测量不确定性是多少？

| 项 | 结果 |
|---|---|
| MEMORY 解析 | `resolved = M13`，`memoryUsed = true` |
| 路由 | `control / research`，模板 `T-E` |
| 真实检索 | 仍命中 3 篇 M13 相关论文（含 `10.1093/mnras/stz642`） |
| evidenceRefs | `ev_f267ba45e48bfedf`，`badRefs = 0` |
| 模型回答 | 指出年龄约 116 亿年、仅列出 2019 年 MNRAS 论文及其 DOI，并明确“未标明该论文提供该年龄数据”“测量不确定性没有相关数据” |
| 指代失败/检索退化 | 0（修复前会退化为 `age` 且无目标） |

结论：同一 Thread 的上下文连续可用；模型没有把“检索到的论文”强行冒充为“该数值的出处”，不确定性缺失时如实说明信息不足。

## 7. 异常处理验证

| 场景 | 方式 | 结果 |
|---|---|---|
| 错误 Key | **真实请求** DeepSeek | 401 → `auth`，未重试、未冒充成功 |
| Provider 503 “Service is too busy” | **真实请求**（本轮早期多次遇到） | 归类 `server`；脚本对 busy 场景最多重试 3 次，单独计入 `blockedProvider`，不计为代码失败；最终服务恢复后 4/4 场景成功 |
| 429 限流 | 本地协议测试 | `rate_limit`，不可重试 |
| 超时 | 本地协议测试（80ms 客户端超时） | `timeout` |
| 坏 JSON | 本地协议测试 | `parse` |
| 空响应 | 本地协议测试 | `empty` |
| 模型不可用/404 | 本地协议测试 | `notfound` |
| 用户取消 | 本地协议测试 | `cancelled`，0 次请求 |
| 失败降级 | 本地协议测试 | 不挂载 TaskState、不消耗 ADR-001 预算 |

> 未为了“凑故障”对真实付费账户制造 429/配额耗尽；真实 401 与真实 503 已自然覆盖鉴权与服务端繁忙两类。其余分类由同一 `fetch` 路径的本地协议服务验证，报告中不把它们写成真实 Provider 故障。

## 8. 安全与密钥

- Key 只在 Node 进程内存中使用；命令行输出不含 Key。
- `tools/fixtures/*.json` 只记录 `key: "present"`，不记录内容。
- 构建与 `_site` 扫描：密钥 0、本地绝对路径 0。
- 验收结束后删除本机临时 Key 文件；仓库、Git 历史、日志、截图均无 Key。

## 9. 复现命令

```powershell
# 只用本机环境变量或临时文件，禁止粘贴到聊天/仓库
$env:ASTRUM_LIVE_KEY_FILE = "C:\path\to\provider-key.txt"   # 或 ASTRUM_LIVE_API_KEY
$env:ASTRUM_LIVE_PROVIDER  = "deepseek"
$env:ASTRUM_LIVE_BASE_URL  = "https://api.deepseek.com/v1/chat/completions"
$env:ASTRUM_LIVE_MODEL     = "deepseek-chat"
node tools/v1-9-provider-test.js
node tools/v1-9-real-provider-integration-test.js
node tools/v1-9-research-target-test.js
```

无 Key 时 `v1-9-provider-test.js` 返回 `BLOCKED_API_KEY` / exit 2，CI 只接受该状态，不据此标记 PASS。

## 10. 剩余项

| 项 | 状态 | 说明 |
|---|---|---|
| 真实 429/配额耗尽 | 未触发 | 需真实账户额度条件；不为验收刻意耗尽配额 |
| Provider 计划性故障演练 | 未执行 | 已自然观测 503 并验证重试/阻塞分类 |
| 浏览器设置页“测试连接”+ 真实科研问答全链路 | 未执行 | 本轮为 Node 真实链路；浏览器侧需在设置页填入 Key 后人工复验 |
| 流式输出 | 未实现 | 不属于本轮验收范围 |
| 论文全文 | 仅摘要 | 3 篇均未获取全文；gaps/limitations 已如实标注 |
| SIMBAD | 不可达 | `simbad.tap:failed`，未伪造天体参数 |

## 11. 结论

真实 Provider 基础调用 **PASS**：DeepSeek 官方端点、`deepseek-chat`、8 次真实请求（7 成功、1 次故意坏 Key 鉴权失败），Prompt/Completion/Total Token 均来自服务商 `usage`，未估算、未用 Mock。ASTRUM 的 Muse 路由、Agent/工具调用、真实论文检索、模型与证据结合、多轮指代与 evidenceRefs 链路在真实模型参与下跑通。未执行项与外部条件已逐项列明，不以离线或 Mock 结果冒充真实 Provider。
