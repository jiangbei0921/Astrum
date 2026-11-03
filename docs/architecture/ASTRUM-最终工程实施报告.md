# ASTRUM 最终工程实施报告

> 日期：2026-11-02
> 范围：V1.4—V1.6 跨版本遗留收尾、复杂 PDF、附件安全、浏览器 UI、CI 与文档
> 原则：保留 13 Agent、Muse、Tool-Centric、7 模板、旧兼容接口、ADR-001 与纯静态架构
> 结论：本轮所有可在当前环境执行的工程项已实施并验证；真实 API Key、真实扫描/CID PDF 样本、正式线上下线授权仍为外部条件，未伪装为完成。

---

## 1. 本轮实际修改

### 1.1 PDF 解析器（`core/pdf-text.js`）

| 改动 | 原因 | 影响 |
|---|---|---|
| 修复文本字符串转义匹配 | 原正则要求两个反斜杠，标准 PDF 的 `\(` `\)` 无法识别，含括号的图注/正文会整行丢失 | 普通正文、图注、公式行不再丢字 |
| 修复 `T*` 换行 | 原 `\bT\*\b` 在 `*` 后不成立，多行被粘成一行，章节边界失效 | 章节/分块/行序恢复正确 |
| 章节标题识别增强 | `1. INTRODUCTION` 的裸句点不被旧正则接受；`1.1 Mly` 会被误判为标题 | 正确识别 `ABSTRACT`、`1. INTRODUCTION`、`2. RESULTS`，拒绝测量值行 |
| CID/Identity-H + ToUnicode | 现代 CJK/Type0 PDF 需要 CMap 才能还原 Unicode | 支持 `bfchar`/`bfrange`/`codespacerange`，按字体选择解码 |
| CID 无 ToUnicode 明确失败 | 直接按 Latin-1 输出会是乱码，不能当成功 | 新增 `pdf_cid_unsupported`，不返回正文 |
| 加密 PDF 全文件识别 | 原实现只看前 4KB，真加密字典通常在文件尾 | 新增全文件 `/Encrypt n 0 R` 检测，返回 `pdf_encrypted` |

兼容性：`AstroPdfText.parse` 返回值新增 `pdf_cid_unsupported` 错误码；成功结果结构不变；`_extractText(content)` 旧签名仍可用（fonts/stats 为可选参数）。

### 1.2 附件处理（`core/attachments.js`、`core/app.js`）

| 改动 | 原因 | 影响 |
|---|---|---|
| 扩展名与 MIME 双向校验 | 旧实现优先信任 MIME 或扩展名，`look.txt` 声明 `image/png`、`photo.png` 声明 `text/plain` 会走其中一条解析路径 | 新增 `mismatch` 分类，状态 `unparsed`，提示“扩展名与 MIME 类型不一致”，不读取正文、不做预览 |
| 文本二进制/编码异常检测 | 损坏或二进制内容伪装 `.txt` 会被当作正文 | 控制字符/替换字符比例 >15% 时 `error`，不进入 `forPrompt` |
| 类型标签 | 新分类需要在附件条上显示 | `ATTACH_KIND_LABEL` 增加“类型冲突” |

保留：FITS/PDF 容器仍以扩展名为准，并由字节头二次校验；单文件失败不影响其它附件；附件内容只作为“用户参考材料”，与本地事实冲突时以本地事实为准（`core/sources.js` 的 `attachLines` 边界声明）。

### 1.3 浏览器测试（`tools/v1-6-browser-test.js`）

从 12 项扩展到 33 项，新增：

- B17a 反向 MIME 冲突；
- B17b 二进制伪装文本；
- B17c 单附件失败不影响其它附件；
- B22 空/长文本报告与局限；
- B23–B25 真实 PDF 字节经 HTTP 下载、解析、全文 UI、章节/页码/chunk；
- B26 扫描件 `pdf_no_text` 且零证据；
- B27–B29 失败任务恢复与失败步骤状态/错误原因；
- B30 375px 窄屏无横向溢出。

同时新增 `Cdp.send`，支持 `Emulation.setDeviceMetricsOverride`；`findChrome` 增加 Linux 路径。

### 1.4 复杂 PDF 合成样本（`tools/v1-6-pdf-fixtures-test.js`）

39 项断言，覆盖 13 类样本：普通、双栏、扫描、CID+ToUnicode、CID 无映射、公式、表格、图注、罗马页码、物理/印刷页码偏移、混合、加密、截断/空/非 PDF/超限。样本由脚本确定性生成，无版权风险；`--write` 可落盘到 `tools/fixtures/pdf/` 供人工检查。

### 1.5 CI（`.github/workflows/test.yml`、`tools/v1-4-ci-test.js`）

- `offline-core` 增加 `v1-6-legacy`、`v1-6-pdf-fixtures`、Provider 配置检查（无 Key 时接受 exit 2）。
- `offline-browser` 增加 `v1-6-browser`。
- `v1-4-ci-test` 的测试清单同步，确保 CI 配置与真实文件一致。

### 1.6 测试稳定性修复（`tools/v1-3-paper-fulltext-test.js`）

`P2.1` 原实现即使 `--offline` 也访问 arXiv 验证大小限制，网络波动会导致离线 CI 失败。改为本地 mock 大响应，资源限制逻辑仍真实执行，网络依赖移除。

### 1.7 文档

新增 6 份最终交付文档，更新遗留清单、缺口分析、V1.3 全文规范、V1.4 CI/Pages、README 与架构索引。历史文档保留，新增内容明确标注“取代旧状态”。

## 2. 未修改的架构边界

- 13 个固定 Agent 与职责：未增删。
- Muse 控制器、Tool-Centric Registry：未改结构。
- 7 模板 T-A—T-G：未新增第 8 模板。
- `ask()`、`buildAnswer()`、`compose*()`、`toSections()`、`detectIntent()`：保留。
- ADR-001 预算：L1=0、L2=1、L3/L4=2，硬上限 2。
- 纯静态浏览器应用：未引入 FastAPI/Redis/MySQL/LangGraph/CrewAI/AutoGen。
- 未引入动态 Agent Marketplace、独立 Agent Registry、独立 Memory、MAST 下载、Hypothesis Tournament。

## 3. 兼容性与安全

- 旧返回字段保留：`evidenceScope`、`answer.research`、`TaskState.steps`、`version.json` 结构。
- 新错误码只增加分类，不改变成功路径。
- 附件不生成科学 Evidence（文本/图片仍为参考材料），不绕过 L1/Control 边界。
- `research-ui.js` 外部数据继续使用 `textContent`，无动态 innerHTML。
- 构建产物密钥 0、绝对路径 0；CSP 0 违规。

## 4. 验证摘要

| 项 | 结果 |
|---|---|
| Node 离线全量 | 全部通过（含 v1-6 legacy 23/23、PDF fixtures 39/39） |
| 真实 arXiv 全文 | 28/28（185,574 B，5 页，22 chunks） |
| Chrome 全量 | 全部通过（selftest 156/156、v1-6 browser 33/33 等） |
| 构建 | `_site` 58 文件 / 1,680,983 B；standalone 53 脚本 / 1,616 KB |
| 发布 | commit `47a3dee`；test `41425289027`、pages `41425684667` 均 success |
| Provider | 分类 4/4；`BLOCKED_API_KEY` |
| 外部网络 | 79/82；Wikipedia/Semantic 主机不可达，未伪造结果 |

详细命令与逐项证据见 `ASTRUM-全量测试与线上验收报告.md`。

## 5. 真实外部阻塞

1. `ASTRUM_LIVE_PROVIDER/BASE_URL/MODEL/API_KEY` 未提供：真实模型调用未执行；本地协议/分类/Schema 路径已就绪。
2. 真实扫描件、CID 字体、双栏出版社 PDF 样本未提供：合成样本已覆盖格式级行为，真实版面/OCR 仍待样本。
3. 正式线上回滚/紧急下线未获授权：隔离演练已完成，脚本/步骤已准备。
4. 外网 Wikipedia/Semantic 在当前网络不可达：已保留分类、重试、备用端点与降级，不伪造。

## 6. 结论

本轮不是“再审查一次”，而是完成了代码、测试、CI、文档的闭环。所有本地可验证项均有测试证据；未完成项均可指向具体外部输入或授权，不存在“只分析未实施”的工程任务。

---

## 7. 2026-11-02 第二轮：真实研究场景质量迭代

在最终验收后继续执行真实天文研究场景（M42 距离论文一致性、M31/M33 对比、200mm 拍摄参数、普通问答），发现并修复 7 类真实缺陷：

1. 中文整句直传 OpenAlex 导致 M42 检索返回考古论文 → Planner 构造“英文目标 + 主题词”检索式；
2. M42 误命中 M4、M33 误命中 M3 → 目录编号独立边界匹配 + 路由碰撞过滤；
3. “比较 M31 和 M33” 被 T-A 抢先 → 显式比较走 T-D；
4. T-D 对比只有坐标 → 增加距离/类型/星等/直径/可见性事实卡；
5. “200mm 望远镜怎么设置参数” 被当普通观测 → photo 意图关键词扩展 + 口径识别；
6. M42 理论焦距 93,258 mm → 修正为 259 mm（经用户授权更新 P0-03 第 11 问基线）；
7. 全文只试 1 篇、失败无具体原因 → 最多 3 篇 + 403/反爬/无文本分类进入 gaps/limitations。

新增 `tools/v1-6-research-quality-test.js`（22/22），浏览器测试 36/36，P0-03 53/53、B8 33/33、兼容性 20/20 与 25/25。详细见 `ASTRUM-研究质量与调度修复报告.md`。

## 8. 2026-11-02 第三轮：真实科研能力验证

在第二轮之后继续执行 46 个真实天文研究基准与 5 类完整研究任务，发现并修复 10 类真实缺陷：

1. `木星的直径是多少` 未进入知识问答 → 扩展 `KW.knowledge`；
2. BODY_INFO 物理参数无条件展开 → 只在知识/介绍意图展开，旧观测输出与 P0-03 基线不变；
3. JWST 问题命中“哈勃与韦布的区别”并落到议题索引 → `early-galaxies` 别名 + 取消“争议”触发泛索引；
4. 主题检索式过宽/过窄 → `JWST high-redshift galaxies`、`exoplanet atmosphere transmission spectroscopy`、`galaxy formation recent progress`；
5. 主题研究白等 SIMBAD → 无坐标目标跳过可选 t1；
6. 同一论文跨 Provider 重复 → 标题归一化去重，保留更完整摘要；
7. 无 DOI/arXiv 的非学术记录进入结论 → 已有 2 篇可信论文时剔除，figshare/zenodo/OSF 标预印本；
8. 摘要 600 字截断导致 `distance ... to be pc.` → 完整 1600 字 + 关键句选择 + 缺数值明确警告；
9. Reducer 未换算不确定性导致 M31 744±33 与 772±44 误报冲突 → 与 value 同步换算；
10. 主题词列表冒充摘要 → 无句号短词列表不生成结论。

新增 `tools/v1-7-research-benchmark.js`（46 案例 / 15 类，结果 JSON `tools/fixtures/research-benchmark-results.json`），并纳入 CI 离线层；`v1-6-research-quality-test` 从 22 项扩展到 30 项。真实 arXiv 全文 28/28，3 分钟长跑 997 任务 18/18，构建 `_site` 58 文件、密钥 0、绝对路径 0。详细见 `ASTRUM-真实天文研究基准集与执行结果.md`。

性能优化：线上首屏 53 个外部脚本原先串行阻塞，本网络实测 >220s；改为仅在 Pages 产物 `_site/index.html` 中加 `defer`，并行下载并保持执行顺序，源码 `index.html`、file://、CI selftest 仍阻塞。线上复测首屏可交互 3.07s，M31/M33 对比两目标均渲染。`build-pages.js`、`build-standalone.js`、`v1-2-deploy-test.js`、`v1-4-pages-test.js` 已兼容带属性 script 标签；`store-test`、`skill-test`、`v1-5-idb-stress-test`、`selftest` 增加启动就绪等待，避免 defer 与测试注入脚本竞态。

## 9. 2026-11-03：V1.8 问题反馈与反馈中心

### 9.1 实际新增

| 文件 | 内容 |
|---|---|
| `core/feedback.js` | 统一配置、9 类反馈类型、六类错误分类、主动提示去重、最小诊断、脱敏、草稿校验、mailto 生成、`submitFeedback` / `registerChannel` |
| `core/app.js` | 对话内主动提示 `.fb-offer`、回答操作条「反馈问题」、设置帮助入口、表单/确认页/草稿恢复/诊断下载、用户指认错误提示 |
| `index.html` | `core/feedback.js` 脚本与 `#feedback` 浮层 |
| `assets/app.css` | `.fb-*` 样式（桌面 + 390px 窄屏） |
| `core/i18n.en-settings.js` | 新增界面文案英文词条，i18n 门禁保持 0 |
| `tools/v1-8-feedback-test.js` | 149 条断言 |
| `tools/v1-8-feedback-browser-test.js` | 49 条断言 |
| `.github/workflows/test.yml` | offline-core / offline-browser 新增 V1.8 步骤 |
| `docs/feedback/FEEDBACK.md` | 反馈模块架构、三入口、诊断、隐私、邮件与扩展说明 |

### 9.2 关键设计

- 收件邮箱只在 `core/feedback.js` 配置一次：`2185428966@qq.com`；渠道 `mailto`，版本 1。
- 外部服务失败归 `external`，PDF/编码归 `data_parse`，缺密钥归 `config`，Agent 编排归 `agent`，研究零证据/用户指认归 `research_quality`，系统状态/参数错误归 `system`；用户主动取消不提示。
- 去重键为 Task ID + 错误类别；忽略后持久化，恢复历史不回放提示。
- 诊断只取当前任务；步骤/事件各 ≤30、单字符串 ≤400、总量 ≤20000；导出前递归脱敏密钥、Token、Cookie、Session、JWT 与本地绝对路径。
- 邮件仅在确认页点击「确认并打开邮件客户端」后唤起；超长时禁用打开并提示复制/下载；不显示发送成功。
- 不新增 Agent/模板/后端；13 Agent、Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口、ADR-001 全部保留。

### 9.3 上线结果

| 项 | 值 |
|---|---|
| 提交 | `55fe9dba161eba8da1ffa7dd43f17eea94d127dc` |
| test Run | `41588104481` success（static / offline-core / offline-browser） |
| pages Run | `41588501459` success |
| 线上 version | app 4.8、commit `55fe9db`、dirty=false、runId `41588501459` |
| 线上反馈验收 | 24/24（帮助入口、主动提示、回答入口、确认页、下载、无 JS/CSP 错误） |

详细见 `docs/feedback/FEEDBACK.md` 与 `ASTRUM-全量测试与线上验收报告.md` §10。

## 10. 2026-11-03：V1.9 真实科研能力强化

### 10.1 实际完成

- **Provider**：修复 HTTP 500/坏 JSON/空响应/404 分类；`v1-9-provider-test` 26/26；已用 DeepSeek `deepseek-chat` 完成 8 次真实请求（7 成功 / 1 故意坏 Key），基础 Provider **PASS**；服务商 usage 3791/348/4139。
- **独立盲测**：新增 56 题 / 15 类 / 10 维评分，真实网络 21 案例、59 篇论文，结果 56/56 PASS，0 坏引用/0 虚构/0 NaN。
- **真实 PDF**：6 个 arXiv 样本（29/11/6/9/28 页，含 14.3MB 长论文），5 解析成功、1 乱码明确拒绝；79/79 断言。
- **反馈诊断**：增加论文/证据/Claim/evidenceRefs/PDF 状态/工具状态/Provider/gaps/limitations；27/27 + E2E 31/31。
- **路由**：WASP-39b、21cm、FRB 宿主星系、星系团冲压剥离等研究主题从 legacy 修复为 T-E/T-F；unknown + 研究信号不再强制旧兜底。
- **回答质量**：修复 `Bortle undefined`；补光谱类型别名。

### 10.2 关键修复

1. PDF 页码按页面文本偏移映射，`referencesStartPage` 不再恒为 null；
2. 参考文献章节不进入全文 chunks/Claim；
3. 两栏粘行不再误判为章节标题；
4. 容忍 zlib 压缩流尾部垃圾；
5. 乱码不再当成功，返回 `pdf_unsupported_encoding`；
6. 解析/下载上限统一提升到 24MB；
7. 全文 Evidence ID 按 chunk 唯一，修复 `ev_f` 重复；
8. Provider 错误码细化 `server/parse/empty/notfound`；
9. 反馈诊断补齐科研定位字段；
10. 缺省 ctx 回填 bortle，消除 `Bortle undefined`；
11. `enQueryFor` 星表优先，M13 检索名从 `Hercules Cluster` 修正为 `Hercules Globular Cluster`；
12. Control 路径复用 `resolveByMemory`，同 Thread 追问不再丢失 M13 目标；
13. 研究检索词具体量优先，M13 年龄追问检索式为 `Hercules Globular Cluster age`；
14. `usageOf` 透传 Prompt/Completion/Total，报告不再只有 total token。

### 10.3 上线

| 项 | 值 |
|---|---|
| 功能提交 | `8b7b8aa` |
| 合并日常数据 | `0640f6f` |
| test Run | `41603946113` success |
| pages Run | `41604395159` success |
| 线上 version | app 4.8、commit `0640f6f`、dirty=false、runId `41604395159` |
| 线上验收 | 27/27 |

### 10.4 真实 Provider 验收（同日）

| 项 | 结果 |
|---|---|
| Provider / 模型 | DeepSeek 官方端点 / `deepseek-chat` |
| 基础场景 | 4/4 成功，平均 1270 ms，Prompt 3791 / Completion 348 / Total 4139 |
| 故意坏 Key | 401 → `auth`，未重试、未冒充成功 |
| 真实科研任务 | M13 真实检索 3 篇论文、3 条证据、`evidenceRefs` 可解析、坏引用 0 |
| 模型与证据结合 | 504 tokens，明确说明“仅摘要，无法判断一致性”，未补造数值 |
| 同 Thread 多轮 | `resolved=M13`；第二问仍命中 M13 论文，模型如实说明来源与不确定性缺失 |
| 集成测试 | 15/15；3/3 调用成功；usage 1167/291/1458 |
| 验收后处理 | 删除本机临时 Key 文件；仓库/产物/日志无 Key |

详细见 `ASTRUM-V1.9-Provider接入验证报告.md`。真实 429/配额耗尽、Provider 计划性故障演练与浏览器真实 Key 全链路未执行，已列入外部条件。

详细见四份 V1.9 专项报告与 `ASTRUM-全量测试与线上验收报告.md` §11。
