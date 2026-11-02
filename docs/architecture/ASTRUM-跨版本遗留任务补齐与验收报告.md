# ASTRUM 跨版本遗留任务补齐与验收报告

> 日期：2026-11-02
> 基线提交：`8e9c242`（合并 `7e56ac4` + 远端 daily `bc87e52`）
> 范围：6 份文档更新、16 条工程遗留、真实 API Key 阶段、外部限制、回滚、V1.6 管理
> 结论：**本轮安全可执行项已完成并推送；2 项需真实 Key、7 项 PARTIAL、V1.6 未启动。**

---

## A. 任务总览

| 类别 | 总数 | 已完成 | 部分完成 | 阻塞/外部/可选 |
|---|---:|---:|---:|---:|
| 6 份文档 | 6 | 6 | 0 | 0 |
| 16 条工程遗留 | 16 | 8 | 7 | 1（Key 行，L26/L33 另计 2） |
| 真实 API Key | 2 | 0 | 0 | 2（BLOCKED_API_KEY） |
| 外部限制 | 4 | 0 | 0 | 4（ENV_LIMITATION） |
| 可选配置 | 2 | 0 | 0 | 2（OPTIONAL_DEFERRED） |
| 已接受设计 | 3 | 0 | 0 | 3（ACCEPTED_DESIGN） |
| 回滚演练 | 1 | 0 | 1 | 0 |
| V1.6 候选 | 12 | 0 | 0 | 12（NOT_STARTED） |

说明：16 行中第 16 行为 L26/L33 的真实 Key 验收（官方计数为独立 2 项）；L17/L23 合并为“实时进度”一项验收，计数仍按两条。通过 8 行、PARTIAL 7 行、BLOCKED 1 行。

## B. 工程遗留明细

| # | 任务 | 编号 | 修改文件 | 测试 | 结果 | 状态 |
|---:|---|---|---|---|---|---|
| 1 | T-B/T-D 模板级结果复用 | L03 | 无（验证现有 preloaded 链路） | `v1-6-legacy` L03.1–L03.3 | T-B used=t1、T-D used=t1/t2、fallback=false | PASS |
| 2 | 解除 evidence.search 对 paper.search 依赖 | L12 | `core/planner.js`（t3.deps=[]） | L12.1/L12.2 | deps=[]；注册依赖 research,sources | PASS |
| 3 | 统一入口边界 | L16 | 无（补边界测试） | L16.1–L16.5 | 文本/图片/未解析 PDF 保留旧链路，L1 不接管 | PASS |
| 4 | 逐步骤实时进度 | L17/L23 | `core/app.js`、`assets/app.css` | `v1-6-legacy` L17；浏览器脚本未执行 | 真实 step 事件 + post-run 步骤面板 | PARTIAL |
| 5 | 多任务列表逐个恢复 | L18 | `core/app.js`、`assets/app.css` | L18.1–L18.3；浏览器脚本未执行 | 2 任务独立列出/读取/状态隔离 | PARTIAL |
| 6 | std/sqrt(n) 标准误语义 | L20 | `core/claims.js` | L20.1–L20.3 | uncertainty=0.2（std=2,n=100）；basis 明确 SEM | PASS |
| 7 | evidenceScope 细分 | L29 | `core/report.js` | L29.1–L29.3 | `supportGranularity=fulltext_chunk`，原 scope 兼容 | PASS |
| 8 | 全文 Claim chunk 粒度 | L35 | `core/report.js` | L29.2 | sourceChunks 含 chunkId/section/page | PASS |
| 9 | Research UI 真实浏览器逐字段 | L22 | 无 | 现有 `v1-1-browser` U10–U18 | 仍以 fixture 为主 | PARTIAL |
| 10 | 全文 UI 真实快照 | L36 | 无 | `v1-3-paper-fulltext` + `v1-1-browser` | 真实解析 + fixture UI | PARTIAL |
| 11 | 论文全文 HTML 处理 | L25 | `core/paper-fulltext.js` | P6.1–P6.4 | HTML 正文提取；反爬页 `html_error_page` | PASS |
| 12 | 图片/文本附件 | L27 | 无（保留旧链路） | L16.2/L16.3 | 作为参考材料，不生成科学证据 | PARTIAL |
| 13 | 复杂 PDF（扫描/CID/双栏） | L31 | 无 | 既有 pdf-text 测试 | 仅失败分类，未增强解析 | PARTIAL |
| 14 | PDF 页码准确性 | L34 | 无 | 既有 P1/P5 | 物理页可用；印刷页/偏移未解决 | PARTIAL |
| 15 | 全文缓存持久化 | L37 | `core/paper-fulltext.js`（sessionStorage） | P5.1–P5.6 | 刷新命中、过期重下、主动清理 | PASS |
| 16 | 真实 Provider（L26/L33） | L26/L33 | 无 | 需 Key | 未执行 | BLOCKED_API_KEY |

### 关键实现说明

- **L12**：T-E `t3` 不再依赖 `t2`；`paper.search` 失败时反证检索仍可独立进入 Runner。
- **L17/L18**：`app.js` 已接入 `onEvent` 实时步骤条；`renderAnswer` 追加真实 `TaskState.steps` 面板；恢复列表由首条改为最多 5 条独立行，逐条恢复。新浏览器脚本 `tools/v1-6-browser-test.js` 已创建，但受执行策略限制未运行。
- **L20**：FITS 均值不确定度明确为均值标准误 SEM，不描述为像素离散度。
- **L29/L35**：结论新增 `supportGranularity/sourceChunks`，保留 `evidenceScope` 旧字段。
- **L25**：HTML 响应按标题/正文/章节提取；错误页/验证码页明确失败，不冒充全文。
- **L37**：使用 `sessionStorage`（刷新有效、关闭标签页清除），7 天 TTL、最多 8 篇、2MB 上限；不跨会话长期保存全文。

## C. 阻塞、外部限制与可选

| 类别 | 条目 | 原因 |
|---|---|---|
| `BLOCKED_API_KEY` | L26、L33 | 无真实 Provider Key；未伪造真实调用 |
| `ENV_LIMITATION` | L09、L10、L32、L41 | FITS 下载断连、端点限流、出版社反爬、外部不可用 |
| `OPTIONAL_DEFERRED` | L14、L28 | 无明确生产问题与量化收益，不扩大配置系统 |
| `ACCEPTED_DESIGN` | L08、L15、L19 | MAST 不下载、standalone 不入库、本地密钥已披露 |
| `PARTIAL` | L17/L18、L22/L36、L27、L31/L34、L43 | UI 浏览器脚本未执行；复杂 PDF/附件未完全补齐；未做破坏性回滚演练 |
| `NOT_STARTED` | V1.6 12 子项 | 启动条件 2/5 满足，缺实际生产问题、目标、指标 |

## D. 测试报告

### Node

| 套件 | 结果 |
|---|---|
| `v1-6-legacy-test` | 23/23 |
| `v1-3-paper-fulltext-test --offline` | 22/22（P5 缓存、P6 HTML） |
| research / task / p0-03 | 77/77、73/73、53/53（20 问 diffBytes=0） |
| control / b8 / v1b / v1c / v1d | 86/86、33/33、25/25、30/30、31/31 |
| research-loop / claims / concurrency / store | 29/29、48/48、17/17、6/6 |
| V1.1–V1.4 系列 | 全部通过（20/20、20/20、16/16、24/24、19/19、2/2、20/20、17/17、12/12、5/5、25/25、16/16、12/12） |

### Chrome

| 套件 | 结果 |
|---|---|
| selftest（CSP 0） | 156/156 |
| v1-1-browser | 27/27 |
| v1-5-resource | 13/13 |
| v1-5-cache | 15/15 |
| v1-5-idb-stress | 7/7 |
| v1-4-pages | 32/32 |
| v1-6-browser（新） | **未执行（策略限制）** |

### PDF / 缓存 / 构建 / 安全

| 项 | 结果 |
|---|---|
| PDF 10MB / 13MB | 10MB 成功；13MB `pdf_too_large` |
| HTML 全文 | 成功；反爬页 `html_error_page` |
| 缓存命中/过期/清理 | 命中 fetch=0；过期 fetch=1；清理成功 |
| 构建 | `_site` 58 文件 / 1,672,319 B；standalone 53 脚本 / 1,608 KB |
| 安全扫描 | 密钥 0 / 绝对路径 0 |

## E. GitHub 提交信息

| 项 | 值 |
|---|---|
| 功能提交 | `7e56ac4fcd70b166db0c9f4653985347a3c0e0d0` |
| 合并提交（当前 main） | `8e9c2426a46e0fa0eb813d754b26c787d34c9128` |
| commit message | `feat: complete ASTRUM legacy tasks with HTML/cache/progress fixes` |
| push | 普通 push；远端已有新 daily 提交时先 fetch+merge，无 force |
| 本地/远端 HEAD | 一致 `8e9c242` |
| 新 test/pages Run | 见 Actions 记录（推送后触发） |

## F. V1.6 启动建议

| 条件 | 状态 |
|---|---|
| 明确实际生产问题 | 未满足（无生产错误样本集） |
| 明确具体改进目标 | 未满足 |
| 明确量化验收指标 | 未满足 |

结论：**不建议启动 V1.6**；12 个子项仅分类管理。

## 附：未完成/后续

1. 运行新浏览器测试 `tools/v1-6-browser-test.js` 以关闭 L17/L18 的 PARTIAL（需命令级批准）。
2. 使用真实 Key 执行 L26/L33，分类 auth/余额/限流/超时/模型不存在。
3. 复杂 PDF（扫描/CID/双栏）与页码偏移需真实样本集。
4. 回滚演练需单独授权，避免影响线上。
5. V1.6 等待真实问题与指标。

---

## G. 2026-11-02 最终复核更新（覆盖上文旧状态）

> 上文 B 表是本轮中段状态，已被本节取代；历史记录保留。

| # | 任务 | 最终状态 | 证据 |
|---:|---|---|---|
| 4 | 逐步骤实时进度 | **DONE** | B5/B6 步骤面板；B29 失败步骤状态+错误原因 |
| 5 | 多任务逐个恢复 | **DONE** | B2/B4/B7；B28 失败任务单独恢复 |
| 9 | Research UI 逐字段 | **DONE** | B18–B22；B27–B29 |
| 10 | 全文 UI 真实快照 | **DONE** | B23–B26 真实 PDF 字节经 HTTP |
| 12 | 图片/文本附件 | **DONE** | B8–B17c；MIME 冲突、二进制伪装、多附件隔离 |
| 13 | 复杂 PDF | **PARTIAL（合成 PASS / 真实样本 BLOCKED）** | 39/39 合成；真实扫描/CID/出版社样本缺 |
| 14 | PDF 页码 | **PARTIAL（合成 PASS / 真实样本 BLOCKED）** | 罗马/偏移样本物理页正确；真实映射仍缺 |
| 16 | 真实 Provider | **BLOCKED_API_KEY** | 分类 4/4；未伪造 |

新增测试：`v1-6-legacy` 23/23、`v1-6-pdf-fixtures` 39/39、`v1-6-browser` 33/33；CI 已纳入。

最终结论见 `ASTRUM-最终工程实施报告.md`、`ASTRUM-原始架构逐项完成度对照表.md`。
