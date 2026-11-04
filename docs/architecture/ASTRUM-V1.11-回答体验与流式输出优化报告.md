# ASTRUM V1.11 · 科研回答体验、流式输出与每日论文更新报告

- 版本：V1.11
- 应用版本：5.0
- 功能版本：V1.11
- 功能提交：`d682233`（feat: stream answers, merge daily papers and finish V1.11 acceptance）
- 文档提交：本报告所在提交（`git log` 可查）
- 线上地址：https://jiangbei0921.github.io/Astrum/
- 线上 Commit：`d682233cffbb5a52d615b4ecb33f803a78ef2f73`
- 线上状态：`dirty=false`，appVersion 5.0，featureVersion V1.11
- CI：test run `41660081180` success
- Pages：run `41660853804` success

---

## 1. 本次完成情况

### 1.1 最终回答简化
- 统一由 `core/answer-composer.js` 在渲染前整合：verdict 唯一、evidence 合并去重、A–E 复杂度结构、质量审计。
- 模型正文只进入 `analysis` 段落，不再生成逐个 Agent 的输出卡片；最终答案不包含工具调用、任务分配、检索词生成、执行步骤等内部日志。
- 修正模式判定：`M31 距离地球多远？` 这类单一事实问题回到 A 类；只有明确问年龄/质量/测量结果/误差等参数时才进入 C 类，避免简单问题被复杂模板包装。
- 保留证据、差异、限制与可追溯来源；简单问题不强行增加研究背景。
- 执行链路仍保留在默认折叠的「检索过程」details 和折叠步骤面板中，与最终正文分离。

### 1.2 真正的流式输出
新增三层链路，未重建 Provider 架构：

```
用户提问
  → 证据收集（Control / Research，保持现状）
  → AstroControlBridge.modelStream()
      → Sources.streamChat()
          → fetch(stream:true) → ReadableStream → SSE 增量解析
              → onToken / onUsage / onDone / onError / onAbort
  → 前端临时流式卡逐段追加
  → 完成后 AnswerComposer.finalize → renderAnswer 结构化终稿
```

- `core/sources.js`：新增 `streamCapable`、`buildStreamRequest`、`streamChat`。
  - OpenAI 兼容：`stream:true`；OpenAI / DeepSeek 请求 `stream_options.include_usage`，若端点 400 不识别该字段，去掉后**只重试一次**。
  - Anthropic：`stream:true`，解析 `content_block_delta` / `message_delta` usage。
  - Gemini：`:streamGenerateContent?alt=sse`，解析 `candidates[].content.parts` 与 `usageMetadata`。
  - 非 SSE 的 JSON 响应：按一次性结果处理，不伪装逐字输出。
  - 首 token 超时 25s、整体 90s；错误分类沿用现有 401/403/404/429/5xx/timeout/parse/empty/CSP/network。
- `core/control-bridge.js`：新增 `modelStream`，错误码与 `modelGenerate` 一致；本机模型/不支持流式的来源降级为一次性完整文本，并标记 `fallback=true`。
- `core/app.js`：新增 `streamCard`、`streamAnswer`、滚动跟随与停止按钮。
  - 首段到达即显示；rAF 合并写入，不整页重绘。
  - 用户上滚超过 80px 时停止自动跟随，回到底部恢复。
  - 停止：中止可取消请求，保留已生成内容，写入 `meta.stream.aborted=true`，文案明确「已由用户停止」，不标记系统故障。
  - 部分中断：保留已生成部分，不重复生成。
  - 零 token 且流式解析不可用：只降级一次非流式；401/429/超时/网络不重试。
  - 完成后临时卡移除，结构化答案接管，Thread 只保存一条最终回答。
- 流式阶段不解析未完成 Markdown，只按文本渲染，避免结构闪烁与 HTML 注入；完成后由 `Sources.clean` + `AnswerComposer` 统一为产品既有纯文本段落风格。

### 1.3 Muse 统一整合
- 继续使用既有 `AstroComposeAdapter → AnswerComposer`，不新增 Agent、不新增 Agent Registry。
- 重复信息合并、冲突保留、证据不足时明确说明；不把某个 Agent 的输出单独放大。
- 模型只是表述层，不新增 Evidence/Claim；质量审计会标记无来源数字与无证据确定性措辞。

### 1.4 每日论文更新机制审查与修复

**实际运行记录（GitHub Actions `daily-frontier`）：**

| 日期（UTC） | Run ID | 结论 |
|---|---|---|
| 2026-11-03 | 41597787512 | success，提交 `fb58d43` |
| 2026-11-02 | 41406002394 | success |
| 2026-11-01 | 41283831075 | success |
| 2026-10-31 | 41177757062 | success |
| 2026-10-30 | 41016596576 | success |
| 2026-10-29 | 40831465139 | success |
| 2026-10-28 | 40645352809 | success |

**发现的真实问题：**
- 旧脚本每天用本次抓取结果**覆盖整个 `data/daily.js`**（11-03 提交 188 insertions / 189 deletions），没有历史保留。
- 没有 `firstSeen` 与 `published` 的区分；没有 DOI；没有更新状态；前端只显示 `updated`，无法判断「今天是否成功」「新增多少」。
- 没有原子写入，没有结构校验，没有「无变化跳过」。

**V1.11 修复：**
- 新增 `mergeDaily`：按 arXiv ID → DOI → 归一化标题去重；旧论文保留，同实体更新元数据并保留 `firstSeen`；新论文写 `firstSeen` 与 `fetchedAt`。
- 论文保留 90 天 / 最多 900 条；新闻保留 30 天 / 最多 80 条；多来源同一实体保留 `sources` 清单。
- 新增 `sync` 状态：`lastAttemptAt`、`lastSuccessAt`、`newPapers`、`newNews`、`totalPapers`、`sources`、`failures`、`ok/partial/status`。
- 单源失败：保留历史数据、记录失败、`partial=true`；全部失败：不写文件、exit 1。
- `validatePayload` 校验结构、日期、重复与空数据；`writeAtomic` 临时文件 + rename；`shouldWrite` 忽略每次都会变的抓取时间，避免无意义提交。
- 本地真实运行一次（2026-11-03T14:25Z）：抓取论文 20 条、报道 12 条；新增论文 0、更新已有 20、新增报道 3；保留 20 篇论文 / 15 条报道。数据文件 27,339 字节。
- 前端每日前沿：显示最后成功、本次新增、来源、失败；新增「今日 / 近 7 天 / 近 30 天」筛选，默认近 7 天；论文卡继续复用 `AstroContentI18n.renderCard`（中文优先 + 英文原文）。

### 1.5 V1.10 遗留事项
- **Provider 真实连接**：历史真实 DeepSeek 记录保留在 `tools/fixtures/v1-9-provider-results.json`（5 次调用、4 成功、1 次 auth 分类、平均 1,270ms、4,139 tokens、PASS）。本次无 Key，新真实调用为 `BLOCKED_API_KEY`。
- **429 / 故障**：使用本地 mock 验证 401/403/429/500/空流/坏 SSE/超时/用户中止；标记 `SIMULATED`，未冒充真实 429。
- **PDF / OCR**：真实 arXiv PDF 79/79；合成 PDF 40/40。扫描件返回 `pdf_no_text` 且标记 `ocrRequired/detailCode=pdf_ocr_required`，附件提示明确「本项目不提供 OCR」；未宣称支持扫描件。
- **反馈中心**：收件邮箱为 `2185428966@qq.com`，唯一配置入口，仅生成 `mailto` 草稿，需用户确认后由邮件客户端发送；诊断新增流式字段（requested/fallback/code/ttft/latency/tokens/aborted/completed/partial），不含 Key/Authorization/提示词正文。
- **浏览器设置页**：真实 Chrome 中完成 Key 输入保存、测试连接、真实 SSE 问答、刷新恢复、Key 掩码、Provider 切换（OpenAI → DeepSeek）。Provider 为本地 mock，标记 SIMULATED。
- **论文国际化 / 来源路由**：V1.10 四套测试全绿；每日前沿与研究报告继续共用同一套动态论文展示规则。

---

## 2. 修改文件

| 文件 | 内容 |
|---|---|
| `core/sources.js` | `streamChat`、SSE 解析、首字/整体超时、usage、stream_options 兼容 |
| `core/control-bridge.js` | `modelStream`、降级与错误码映射，版本 1.6.0 |
| `core/app.js` | 流式卡、增量渲染、滚动跟随、停止、收尾、每日筛选、版本 5.0 |
| `core/answer-composer.js` | A/C 模式判定修正（单一事实不套参数模板） |
| `core/feedback.js` | 诊断流式字段 |
| `core/attachments.js` / `core/paper-attachment.js` | OCR 能力边界提示 |
| `core/i18n.js` | 流式与每日新增文案 |
| `assets/app.css` | 流式卡与每日筛选样式 |
| `tools/sync-daily.js` | 增量合并、状态、校验、原子写、无变化跳过 |
| `data/daily.js` | 重新生成，加入 `sync`、`firstSeen`、`fetchedAt`、`sources` |
| `tools/research-test.js` | 查询词传播断言改为真正离线 mock |
| `tools/v1-6-pdf-fixtures-test.js` | 增加 OCR 需求断言 |
| `tools/v1-9-feedback-diagnostic-test.js` | 增加流式诊断断言 |
| `tools/v1-11-*.js` | 5 套新增测试 |
| `.github/workflows/test.yml` | 接入 V1.11 三套离线 + 两套浏览器测试 |
| `tools/build-pages.js` | featureVersion V1.11，features 追加 V1.11 |

**架构影响：** 未新增 Agent、后端、数据库或翻译 Agent；未改变 `ask()/buildAnswer()/compose*()/toSections()/detectIntent()` 外部契约；13 Agent、Muse、Tool-Centric、MEMORY/Thread/TaskStore、7 模板、Provider 体系、反馈中心、论文检索均保留；ADR-001 预算未变。

---

## 3. 测试结果

> 类别之间有交叉（同一断言可能同时属于回归与功能类），不是简单相加。

| 测试类别 | 通过 | 失败 | 跳过/阻塞 |
|---|---:|---:|---:|
| 原有回归测试（V1–V1.10 已执行套件） | 1,716 | 0 | 0 |
| 流式输出测试（协议 39 + 浏览器 19） | 58 | 0 | 0 |
| 答案质量测试 | 38 | 0 | 0 |
| 每日论文更新测试（增量 41 + 既有抓取器 31） | 72 | 0 | 0 |
| Provider 测试 | 离线协议全部通过 | 0 | 1 项 BLOCKED_API_KEY |
| PDF/OCR 测试（合成 40 + 真实 79） | 119 | 0 | OCR 扫描样本 BLOCKED_SAMPLE |
| 反馈中心测试（核心 149 + 浏览器 49 + 诊断 29） | 227 | 0 | 0 |
| 浏览器测试（selftest 156、设置/布局/无障碍/反馈等） | 全部套件通过 | 0 | 0 |
| 线上验收 | 17 | 0 | 云模型流式 BLOCKED_API_KEY |

### 3.1 关键套件明细
- `v1-11-stream-test` 39/39
- `v1-11-stream-browser-test` 19/19
- `v1-11-answer-quality-test` 38/38
- `v1-11-daily-test` 41/41
- `v1-11-provider-browser-test` 14/14（SIMULATED Provider）
- V1.10：answer-composer 29/29、knowledge-sources 33/33、content-i18n 28/28、integration 27/27
- `daily-test` 31/31、`p0-03-test` 53/53、`research-test` 77/77
- `v1-7-research-benchmark --offline`：46 cases，PASS 38 / FAIL 0 / SKIP 8
- `v1-9-real-pdf-test` 79/79
- `v1-9-provider-test` / `v1-6-provider-test`：BLOCKED_API_KEY（exit 2，符合预期）
- `selftest` 156/156，CSP 违规 0
- `i18n-scan --max=0`：界面残留 0
- `csptest` 6/6
- 性能基线：coldLoad 113.57ms；Control local p95 15.07ms；heapUsed 17.25MB；TaskStore 200 条 118.18ms

### 3.2 CI / Pages
- test run 41660081180：static、offline-core、offline-browser 全部 success；V1.11 五套新增测试步骤均 success。
- pages run 41660853804：build 与 deploy 全部 success。
- 线上 `version.json`：appVersion 5.0、featureVersion V1.11、commit d682233、dirty=false。

### 3.3 线上真实浏览器验收（17/17）
- 页面启动、版本 5.0、Bridge 1.6.0。
- 每日前沿：真实 sync 状态（最后成功 2026-11-03、新增 0 篇 / 3 条报道、来源清单）；今日/7 天/30 天筛选；近 30 天 35 张论文卡。
- 中文/英文切换（按真实路径 reload）：英文界面无中文状态词；切回中文正常。
- 线上真实问答（本地来源）完成；无 Key 时保持 local，不伪装云模型。
- 无未捕获 JS 异常。

---

## 4. 未完成事项与 BLOCKED

1. **BLOCKED_API_KEY**：本机无有效 Provider Key（`provider-key.txt` 不存在）。V1.11 的真实流式、真实 401/429、线上云模型流式问答未执行；仅完成本地 mock 与协议级验证。历史 DeepSeek 真实非流式验收记录保留。
2. **SIMULATED**：429/额度/故障/SSE 均通过本地 mock 验证，明确标记为模拟，不冒充真实 Provider 429。
3. **BLOCKED_SAMPLE**：无扫描型 PDF OCR 样本，且项目不引入 OCR 依赖；扫描件只返回明确失败与「不支持 OCR」提示，不宣称可识别。
4. **未验证**：线上云端流式输出（无 Key）；真实 Provider 的 Retry-After 行为（仅 mock 验证解析）。
5. **本地测试快照**：测试运行会重写 `docs/logs/longrun-LR-SMOKE.jsonl` 与 `tools/fixtures/v1-9-provider-results.json`。为保留原有真实 Provider / 长跑记录，这两个文件未纳入本次功能提交，工作区中仍显示为已修改。

---

## 5. V1.11 补充：每日前沿更新机制彻底修复（2026-11-04）

### 5.1 问题根因

1. **定时运行未创建**：截至 2026-11-04 09:28（北京时间），GitHub 还没有创建当天的 `daily-frontier` 定时运行；最近一次仍是 11-03。GitHub 的 `schedule` 在高负载时会延迟甚至丢弃事件，仅保留 cron 不能保证每天执行。
2. **每日提交不触发 Pages**：GitHub 默认 `GITHUB_TOKEN` 推送的提交不会触发 `test`/`pages` workflow。每日任务即使提交了 `data/daily.js`，线上也不会自动重建，页面会继续显示旧数据。
3. **页面缓存刷新是死代码**：`refreshFrontier` 用 `lastIndexOf('}')` 截取 JSON，实际截到了 IIFE 的 `})(window);` 右括号，`JSON.parse` 永远失败，刷新逻辑被静默跳过。GitHub Pages 的 10 分钟缓存因此无法被绕过。
4. **全失败不写状态**：旧逻辑在所有来源失败时直接 `exit 1`，不写 `sync.status=failed`；页面只能看到上一次成功，无法区分“今天失败了”。
5. **空结果被当成成功**：arXiv 分类或 RSS 返回 0 条时仍计入 `okCats/okFeeds`，可能把空页当成功更新。
6. **日期只按浏览器本地日期**：此前“今日”用 `new Date()` 本地日期和 `published` 日期比较，未处理 arXiv UTC 时间与北京时间的边界，也丢失了完整发布时间。
7. **状态语义混淆**：页面只显示新增数量，没有区分 `newPapers / updatedPapers / newNews`，也没有“成功但无新论文”“部分失败”“全部失败”“running”状态。

### 5.2 修复内容

- `tools/sync-daily.js`
  - 保留完整 `publishedAt / updatedAt` UTC 时间；`published` 仍为兼容日期。
  - arXiv 分类 / RSS 返回 0 条记为失败，不再计入成功来源。
  - 新增 `--mark-running`：抓取前写入 `sync.status=running`。
  - 新增 `--check-today`：当天已 `ok` 则输出单行 `SKIP`，供备用定时器防重复。
  - 全失败时保留旧论文/报道，写入 `status=failed` 与失败原因，再以非零退出。
  - `shouldWrite` 忽略每次都会变的 `fetchedAt`，避免无意义提交。
- `.github/workflows/daily.yml`
  - 保留 `0 1 * * *`，新增 `0 4 * * *` 备用触发；`--check-today` 保证每天实际只更新一次。
  - 抓取前提交 running 状态；抓取失败用 `continue-on-error` 保留失败状态提交，最后把运行标红。
  - 数据提交后显式 `gh workflow run pages.yml`，解决 `GITHUB_TOKEN` 不触发 Pages 的问题。
  - 重新构建并上传 `astrum-standalone.html` 产物（最新数据）。
- `core/app.js`
  - 修复 `dailyObjectSlice`：按引号/转义/花括号配对截取对象，缓存刷新真正生效。
  - 打开每日前沿时 `fetch('data/daily.js?t=...')` 强制 `no-store`，成功后替换内存数据并重绘。
  - 状态区分：尚未执行 / running / 成功但无新论文 / 成功有新增 / 部分失败 / 全部失败。
  - `newPapers`、`updatedPapers`、`newNews` 分开展示；来源条数标明“响应条数”。
  - “今日 / 近 7 天 / 近 30 天”按北京时间（UTC+8）和完整 `publishedAt` 筛选；今日为空显示明确文案并提供近 30 天入口。
  - 在 GitHub Pages 域名下查询 GitHub Actions 公开 API，显示真实的“已排队 / 正在更新 / 最近一次失败”。
- `core/i18n.js` / `assets/app.css` / `index.html`：新增中英文案、样式与 `api.github.com` CSP 白名单。

### 5.3 实际运行记录（真实网络）

- 手动触发：`workflow_dispatch` run **41757387563**，2026-11-04 09:56（北京时间，01:56 UTC），耗时 25s，结论 success。
- 抓取结果：
  - arXiv：`astro-ph.GA(8)`、`astro-ph.CO(8)`、`astro-ph.EP(8)`、`astro-ph.HE(8)`、`astro-ph.SR(8)`，共 20 条（去重后）。
  - ESA：8 条。
  - ScienceDaily：8 条。
- 增量结果：`newPapers=0`、`updatedPapers=20`、`newNews=0`；保留论文 20 篇、报道 15 条。
  - 本次确实没有新论文：arXiv 返回的最新论文仍是 2026-11-02 发布；页面明确显示“本次同步成功，未发现新论文”，没有把抓取数量冒充新增。
- 数据文件：`data/daily.js` 29,179 字节，`updated=2026-11-04`，`lastSuccessAt=2026-11-04T01:56:28.827Z`，`status=ok`。
- 提交：running 标记 `b91a40b`；同步结果 `d3eaaa6`（`chore: 每日前沿同步 2026-11-04`）。
- 单文件版：`astrum-standalone.html` 596,857 字节，artifact ID 13289275114。
- 备用 gate 验证：再次手动触发 run **41759758125**，`--check-today` 输出 `SKIP`，所有抓取/提交步骤均 skipped，未产生重复提交。
- 修复过程中一次 gate 输出多行导致 run **41759564822** 失败；已修为单行 `SKIP/RUN`，run 41759758125 通过。

### 5.4 Pages 与线上一致性

- Pages 部署 run **41758302247**（67cae85）success；后续 gate 修复 run **41759488978** / **41760196242** success。
- 线上 `version.json`：commit `3f24123`、appVersion 5.0、featureVersion V1.11、dirty=false。
- 线上 `data/daily.js` 与 GitHub main SHA256 完全一致：
  - 两边均为 `b43d0df2517cac01a749321e04b141155f34718d97be01727337b57162cf7bf9`，28,651 字节。
  - `updated=2026-11-04`、`status=ok`、`newPapers=0`、`updatedPapers=20`、`lastSuccessAt=2026-11-04T01:56:28.827Z`。
- 线上浏览器验收 12/12：状态文案、五个 arXiv + 两个 RSS 来源、四个筛选按钮、北京时间说明、今日空态、近 30 天 20 篇论文、缓存刷新后仍为最新数据、无未捕获异常。

### 5.5 测试

- `v1-11-daily-test` 59/59
- `v1-11-daily-browser-test` 19/19
- `daily-test` 31/31
- `v1-4-pages-test` 32/32
- CI：run 41757812220（67cae85）success；run 41759066564（8d2c373）success；run 41759737749（3f24123）success。
- 线上每日验收：12/12。

### 5.6 仍未完成/外部限制

- 2026-11-04 的 GitHub `schedule` 事件在检查时仍未创建；本次通过手动触发完成真实更新，并新增 04:00 UTC 备用触发与幂等 gate。GitHub 调度延迟本身无法由仓库代码完全消除。
- arXiv 当前最新论文仍为 2026-11-02 发布，因此新增论文为 0；这是数据事实，不是更新失败。

## 6. 最终结论

V1.11 已完成科研回答简化、真实流式链路、停止与降级、每日论文增量更新与真实状态、知识来源路由与动态国际化的一致性，并通过本地回归、真实浏览器、GitHub Actions 与 Pages 部署验证。除缺少真实 Provider Key 与 OCR 样本导致的外部阻塞项外，交付标准已满足。
