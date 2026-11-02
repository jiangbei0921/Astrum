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
