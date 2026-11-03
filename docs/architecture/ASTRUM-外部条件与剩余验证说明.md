# ASTRUM 外部条件与剩余验证说明

> 日期：2026-11-02
> 原则：仅记录真正依赖外部输入/授权的事项；本地可执行项已在本轮完成。
> 禁止：把 API Key 粘贴到聊天、代码、日志、截图或 Git；使用本地环境变量或系统密钥管理。

---

## 1. 真实 Cloud Provider

### 1.1 当前状态

- 代码路径：`core/control-bridge.js` → `core/sources.js` → Provider 请求；JSON 输出、Schema 校验、错误分类、重试/降级入口已实现。
- 本地验证：`v1-6-provider-test.js` 分类 4/4（auth / rate_limit / timeout / network）。
- **真实验证（2026-11-03）**：DeepSeek 官方端点 / `deepseek-chat`，8 次真实请求（7 成功 / 1 故意坏 Key）；基础场景 4/4、科研集成 3/3；usage 3791/348/4139 与 1167/291/1458。真实基础 Provider **PASS**。
- 未执行：真实 429/配额耗尽、Provider 计划性故障演练、浏览器真实 Key 全链路。未伪造任何真实返回。

### 1.2 所需环境变量（只在本地 shell 设置，不写入仓库）

```powershell
$env:ASTRUM_LIVE_PROVIDER = "openai-compatible"   # 或 gemini / anthropic
$env:ASTRUM_LIVE_BASE_URL = "https://api.openai.com/v1"
$env:ASTRUM_LIVE_MODEL    = "gpt-4o-mini"
$env:ASTRUM_LIVE_API_KEY  = "<在本地安全输入，不要发到聊天>"
```

> `ASTRUM_LIVE_BASE_URL` 必须与 Provider 形状匹配；不要把它写进 `.env` 后提交。仓库没有 `.env` 加载器。

### 1.3 运行命令

```powershell
node tools/v1-6-provider-test.js
```

预期：

- 无 Key：`RESULT BLOCKED_API_KEY`，exit 2（CI 使用该状态，不视为 PASS）。
- 有 Key：使用 `ASTRUM_LIVE_KEY_FILE` 指向本机临时文件，或 `ASTRUM_LIVE_API_KEY`；运行 `v1-9-provider-test.js` 与 `v1-9-real-provider-integration-test.js`，Key 不出现在命令/日志/仓库。

### 1.4 验收标准

| 项 | 通过条件 |
|---|---|
| auth | 401/403 → `auth`，不重试 |
| rate_limit | 429 → `rate_limit`，保留降级 |
| timeout | 超时 → `timeout`，可重试但不无限 |
| server/network | 5xx/断网 → `server`/`network`，保留本地确定性结果 |
| schema | 非 JSON/字段缺失 → `schema`，不写入答案 |
| 空值/截断 | 明确失败或降级，不伪造数字 |
| 多模型路由 | 仍按原架构评分/回退，不新增模型注册中心 |
| 旧模型命名 | 旧名迁移兼容测试通过 |

## 2. 真实复杂 PDF 样本

### 2.1 当前状态

- 已建立合成样本集：`tools/v1-6-pdf-fixtures-test.js`，39/39。
- 覆盖：普通、双栏、扫描、CID+ToUnicode、CID 无映射、公式、表格、图注、罗马页码、物理/印刷页码偏移、混合、加密、截断。
- 未覆盖：真实出版社 PDF 的复杂版面、真实扫描件 OCR、真实 CID 字体子集、真实双栏阅读顺序。

### 2.2 需要的样本（合法公开许可）

| 类型 | 要求 | 验收 |
|---|---|---|
| 扫描版 | 无文本层，公开许可 | `pdf_no_text`，不生成证据 |
| CID 字体 | Type0/Identity-H，最好含 ToUnicode | 有 ToUnicode → 正确 Unicode；无 → `pdf_cid_unsupported` |
| 双栏 | 真实期刊/会议排版 | 阅读顺序、章节边界正确；错序时明确报告 |
| 公式/表格/图注 | 含数学符号、表格、Figure caption | 文本/公式/表格单元/图注可追溯 |
| 罗马页码 | 前言用 i/ii/iii | 物理页码与印刷页码分别记录，不混淆 |
| 页码偏移 | 印刷页码 ≠ 物理页码 | 报告明确映射限制 |
| 混合复杂 | 文本+公式+表格+图注 | 不把错误提取当成功 |

### 2.3 放置与运行

将合法样本放到仓库外的本地目录（例如 `D:\astrum-pdf-samples\`），不要提交受限版权 PDF。用临时脚本或测试读取：

```powershell
node tools/v1-6-pdf-fixtures-test.js --write   # 生成合成样本到 tools/fixtures/pdf/
```

真实样本验证时，把 `AstroPdfText.parse` 的输出与人工核对表逐项比对；失败类型必须记录为 `pdf_no_text` / `pdf_cid_unsupported` / `pdf_encrypted` 等，不得改写为成功。

## 3. 正式线上回滚与紧急下线

### 3.1 当前状态

- 隔离演练已完成：目标 `7e50227`，构建 58 文件，首页/version/app/css 200，停服 DOWN，重启恢复 200。
- 正式 Pages 未被关闭、未删除资源、未执行不可逆操作。
- 脚本/步骤见 `docs/operations/ASTRUM-最终发布与回滚手册.md`。

### 3.2 需要的授权

| 操作 | 授权要求 |
|---|---|
| 正式回滚到旧 commit | 明确目标 commit、影响范围、时间窗口 |
| 紧急下线 | 明确是关闭 Pages、切回旧源还是撤下 artifact |
| 强制重发 Pages | 明确 workflow_dispatch 的提交 |

### 3.3 验收标准

- 回滚后 `version.json.commit` 等于目标 commit；
- 首页/核心资源 200；
- 13 Agent、核心问答、Research、全文页面可用；
- 浏览器无严重 console/CSP 错误；
- 缓存/Service Worker 不导致新旧版本混用（当前无 SW；Pages 缓存由 `Cache-Control` 与版本文件校验）。

## 4. 外部搜索/网络

### 4.1 当前观测

- `v1-4-network-ci.js`：79/82；SUITES 6/7。
- 不可达：Wikipedia、Semantic Scholar（当前网络）。
- 可用：arXiv、SIMBAD、OpenAlex、export.arxiv.org。

### 4.2 已实现的降级

- 端点链与备用来源；
- 超时/重试/退避；
- 429 限流识别；
- 搜索缓存（TTL/主动清理）；
- 部分成功保留有效结果；
- 失败原因呈现，不标记为成功。

### 4.3 复验命令

```powershell
node tools/v1-4-network-ci.js
```

验收：可达主机返回结果、保留原始链接、不出现无关结果；不可达主机必须标记为外部不可用，不得伪造条目。

## 5. 长时运行

- 上一轮已完成 30/60/180 分钟（LR-01/02/03，180 分钟采样 178/180）。
- 本轮补 1 分钟 smoke；未重跑 3 小时。
- 复验：

```powershell
node tools/v1-5-longrun-test.js --minutes=30 --label=LR-01 --out=lr-01.log
node tools/v1-5-longrun-test.js --minutes=60 --label=LR-02 --out=lr-02.log
node tools/v1-5-longrun-test.js --minutes=180 --label=LR-03 --out=lr-03.log
```

验收：无持续内存增长、无任务串扰、无预算越界、取消/恢复可用。

## 6. 外部条件汇总

| 项 | 状态 | 最后一步 |
|---|---|---|
| 真实 Provider Key | **PASS**（2026-11-03） | 已用 DeepSeek `deepseek-chat` 完成；细节见 §9。浏览器侧仍需在设置页填入 Key 后人工复验“测试连接 + 科研问答” |
| 真实复杂 PDF | BLOCKED_SAMPLE | 提供合法公开样本到仓库外目录，按 §2.3 验证 |
| 正式回滚/下线 | BLOCKED_AUTHORIZATION | 明确目标 commit/影响范围后执行手册步骤 |
| Wikipedia/Semantic | ENV_LIMITATION | 换网络或代理后重跑 network CI；不伪造结果 |
| 180 分钟长跑 | 已完成（历史） | 需要新一轮时按 §5 重跑 |

## 7. V1.7 真实科研验证新增外部条件

| 项 | 状态 | 实际观测与处理 |
|---|---|---|
| OpenAlex / Semantic Scholar 限流 | ENV_LIMITATION | 连续研究请求会出现 `rate_limit` / `cooling`；基准把无结果且仅有此类错误的案例标 `BLOCKED_EXTERNAL`，不写成 PASS；等待冷却后单独复跑可通过 |
| 摘要缺失测量数值 | SOURCE_LIMITATION | OpenAlex 对 10.1051/0004-6361:20078247 的摘要本身缺少数值（`to be pc.`）；系统明确输出“摘要缺少测量数值，未获取全文，不能据此引用具体数值”，不补造 414 pc |
| 仅摘要、无全文 | SOURCE_LIMITATION | 本轮 6 个论文研究案例均为 `abstractOnly=true`；报告 gap/limitation 明确写明，不声称已读全文 |
| arXiv PDF 首次超时 | ENV_LIMITATION | `v1-3-paper-fulltext-test` 首次 P1 超时（`REAL: undefined`），复跑成功（185,574 B / 5 页 / 22 chunks）；超时被归类，不伪造全文 |
| SIMBAD 超时 | ENV_LIMITATION | M42/M31 研究中的 `simbad.tap` 偶发 timeout；不影响本地知识库与论文证据，报告明确写“未获得 SIMBAD 天体参数” |
| 主题研究无坐标目标 | 设计处理 | T-E/T-F 对 JWST/系外行星/星系形成等主题跳过可选 SIMBAD，避免无意义 10s 等待 |
| 真实 Provider Key | BLOCKED_API_KEY | 未执行真实模型调用；配置路径与错误分类已验证 |
| 180 分钟长跑 | 历史完成 | 本轮执行 3 分钟 / 997 任务 smoke（18/18）；未重跑 180 分钟 |

## 8. V1.8 问题反馈新增外部条件（2026-11-03）

| 项 | 状态 | 实际观测与处理 |
|---|---|---|
| 真实邮件客户端唤起 | BLOCKED_MAIL_CLIENT | 自动化可验证确认前不打开、`mailto:` 主题/收件人/正文正确、超长降级；无法在无邮件客户端的 headless 环境确认真实客户端弹出。需在配置了 Thunderbird/Outlook/系统邮件应用的设备上人工点一次「确认并打开邮件客户端」 |
| 真实邮件发送 | BLOCKED_USER_ACTION | 按设计不自动发送，也不读取发送结果；邮件内容与附件由用户在客户端确认后发送 |
| 诊断报告落盘 | BROWSER_DOWNLOAD_LIMITATION | 浏览器测试验证点击后 toast「诊断报告已下载（已脱敏）」与 Blob 生成；headless 未配置文件保存目录，无法检查磁盘文件。Node 测试验证 JSON 内容、脱敏与长度 |
| 联系邮箱真实可达性 | EXTERNAL_UNKNOWN | 用户选填邮箱只进入邮件正文，不做验证码或送达校验；维护团队回信依赖该邮箱真实有效 |
| 反馈渠道扩展 | NOT_IMPLEMENTED_BY_DESIGN | 本轮只实现 `mailto`；GitHub Issues / 产品 API / 工单系统需未来配置与后端条件，未伪装为已完成 |
| 线上主动异常注入 | TEST_INJECTION | 线上 24/24 通过 `__astrum.renderAnswer` 注入失败 TaskState 验证提示；真实外部服务故障需自然发生或由 network CI 产生，不能人为伪造为线上故障 |
| 真实 Provider Key | BLOCKED_API_KEY | 本轮不涉及模型调用；反馈中的模型失败分类以现有错误码验证，未写入任何密钥 |

## 9. V1.9 真实科研强化新增外部条件（2026-11-03）

| 项 | 状态 | 实际观测与处理 |
|---|---|---|
| 真实 Provider Key | **PASS** | 已用 DeepSeek 官方端点 / `deepseek-chat` 完成 8 次真实请求（7 成功 / 1 故意坏 Key）；基础场景 4/4、科研集成 3/3；usage 3791/348/4139 与 1167/291/1458；Key 未入库，验收后删除本机临时文件 |
| 真实 Provider 429/配额 | 未触发 | 账户有额度，未为验收刻意耗尽配额；429 分类由本地协议路径验证 |
| Provider 服务不可用 | 已自然观测 | 本轮早期多次真实 503 “Service is too busy”，归类 `server` 并重试，单独计 `blockedProvider`；最终恢复后 4/4 成功。未做计划性故障演练 |
| 浏览器“测试连接 + 真实科研问答” | 未执行 | 本轮真实链路为 Node；浏览器侧需在设置页填入 Key 后人工复验 |
| 真实扫描版 PDF | BLOCKED_SAMPLE | 当前没有合法公开的真实扫描样本；合成扫描件只验证 `pdf_no_text`，不冒充真实 |
| 真实 CID 成功解析 | BLOCKED_SAMPLE | 2208 真实样本编码异常，本轮正确拒绝 `pdf_unsupported_encoding`；未取得可正确 ToUnicode 的真实 CID 成功样本 |
| OCR | 未实现 | 不引入大型依赖；仅分类 `pdf_ocr_required` |
| 真实邮件客户端/发送 | BLOCKED_MAIL_CLIENT / BLOCKED_USER_ACTION | mailto 草稿与降级已验证；真实客户端弹出/发送需人工 |
| 21 个真实网络研究案例 | 本轮可达 | OpenAlex/arXiv 正常，SIMBAD 偶发不可达；本轮 56/56 PASS，未来可能变化 |
| `network.yml` V1.9 步骤 | 已配置未触发 | 可手动运行 `gh workflow run network.yml` 验证真实 PDF + E2E |
| 首屏 CDN 波动 | ENV_LIMITATION | 本轮 2.9–9.0s；脚本数 54、体积 +1.9%，最佳 2.9s 与 V1.7 3.07s 同量级 |
