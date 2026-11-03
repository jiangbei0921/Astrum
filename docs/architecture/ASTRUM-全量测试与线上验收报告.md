# ASTRUM 全量测试与线上验收报告

> 日期：2026-11-02
> 环境：Windows / Node 24.19 / Chrome headless / 本地 HTTP + file://
> 口径：命令实际执行；通过/失败数量来自脚本输出；外部不可达单独标注，不并入 PASS

## 1. Node 离线全量

| 套件 | 命令 | 结果 |
|---|---|---:|
| 检索 research | `node tools/research-test.js` | 77/77 |
| 任务契约 task | `node tools/task-test.js` | 73/73 |
| 固定基线 p0-03 | `node tools/p0-03-test.js` | 53/53 |
| 控制层 control | `node tools/control-test.js` | 86/86 |
| 数据闭环 b8 | `node tools/b8-test.js` | 33/33 |
| V1 B/C/D | `v1b-test` / `v1c-test` / `v1d-test --offline` | 25/25、30/30、31/31 |
| V1 e2e | `v1-e2e-test --offline` | 10/10 |
| V1.1 | routing / compat / e2e | 21/21、20/20、16/16 |
| V1.2 | routing / attachment / comparison / science / simbad | 24/24、20/20、15/15、19/19、2/2 |
| V1.3 | routing / comparison / paper-fulltext / paper-e2e / compatibility | 20/20、17/17、22/22、5/5、25/25 |
| V1.4 | paper-attachment / cloud-control | 16/16、12/12 |
| V1.5 | perf / concurrency / research-loop / claims | 指标输出、17/17、29/29、48/48 |
| V1.6 legacy | `node tools/v1-6-legacy-test.js` | 23/23 |
| V1.6 PDF fixtures | `node tools/v1-6-pdf-fixtures-test.js` | 39/39 |
| V1.6 研究质量 | `node tools/v1-6-research-quality-test.js` | 22/22 |
| 长跑 smoke | `node tools/v1-5-longrun-test.js --minutes=1 --label=LR-FINAL-SMOKE` | 18/18 |
| 抓取器 / 部署 / CSP / CI | daily / deploy / csptest / v1-4-ci | 31/31、20/20、6/6、22/22 |

## 2. 真实网络（可选）

| 项 | 命令 | 结果 |
|---|---|---:|
| arXiv 全文 | `node tools/v1-3-paper-fulltext-test.js` | 28/28（185,574 B / 5 页 / 22 chunks） |
| 外部端点汇总 | `node tools/v1-4-network-ci.js` | 79/82；SUITES 6/7 |
| Provider 配置 | `node tools/v1-6-provider-test.js` | 分类 4/4；`RESULT BLOCKED_API_KEY`（exit 2） |

`v1-4-network-ci` 失败原因：Wikipedia、Semantic Scholar 主机在当前网络不可达；arXiv、SIMBAD、OpenAlex、export 可用。该失败为外部网络条件，代码未伪造结果；端点链、重试、缓存、降级与错误分类仍在。

## 3. Chrome 浏览器

| 套件 | 结果 |
|---|---:|
| selftest（20 问、13 Agent、CSP 0） | 156/156 |
| store-test | 17/17 |
| skill-test | 10/10 |
| consistency-test | 7/7 |
| a11y-test | 13/13 |
| rail-test | 17/17 |
| settings-test | 18/18 |
| ctx-isolation-test | 14/14 |
| v1-1-browser | 27/27 |
| v1-4-pages（本地 `/Astrum/` 子路径） | 32/32 |
| v1-5-idb-stress | 7/7 |
| v1-5-resource | 13/13 |
| v1-5-cache | 15/15 |
| v1-5-bigfile | 13/13（FITS 200MB、PDF 10MB、重复 10 次） |
| v1-6-browser | 36/36（新增对比 UI B31–B33） |

`v1-6-browser` 覆盖：任务种入/刷新列表/逐个恢复/步骤面板/失败步骤；TXT/BOM/空/二进制伪装/PNG/JPG/WebP/超大/MIME 冲突/多附件隔离；真实 PDF 字节 HTTP 下载/解析/全文 UI/章节/页码/chunk；扫描件失败；375px 窄屏无横向溢出；M31/M33 对比 UI 两个目标与距离/类型/可见性。

本轮研究质量修复另见 `ASTRUM-研究质量与调度修复报告.md`：M42 论文检索从无关考古论文修正为 Orion 论文；M42/M33 目标碰撞修复；显式比较走 T-D；200mm 拍摄参数与焦距公式修正；全文失败原因分类。

## 4. 20 问兼容

selftest 内置 20 问回归：`diffBytes=0`，13 Agent 名称/职责未变；普通问答、天文知识、天体位置、多目标比较、Research Loop、论文搜索、全文解析、Claim/Evidence、历史恢复、导出、页面渲染均通过。

## 5. 构建与安全

| 项 | 结果 |
|---|---|
| 语法检查 | `core/*.js`、`data/*.js`、`tools/*.js` 全部通过 |
| standalone | 53 内联脚本 / 126 KB CSS / 1,616 KB |
| `_site` | 58 文件 / 1,680,983 B（core 45 / data 8） |
| 资源引用 | 54 个全部存在且大小写一致 |
| 安全扫描 | 密钥 0、绝对路径 0 |
| 开发文件隔离 | `_site` 无 tools/docs/dev/worker/standalone |
| CSP | selftest / pages 控制台 0 违规 |
| 版本元数据 | `version.json` 含 app 4.8 / release V1.4 / feature V1.3 / commit / dirty / deployEnv |

> 本地构建时工作区未提交，`dirty=true` 是如实记录；正式 Pages 构建由 CI 在干净检出上生成，`dirty=false`。

## 6. GitHub Actions 与线上

| 项 | 值 |
|---|---|
| 功能提交 | `fffc12847552fb18a7461af95d3c28676d1c731f` |
| test Run | `41443340306` success（static / offline-core / offline-browser） |
| pages Run | `41443735631` success（build 6s / deploy 20s） |
| 线上 URL | `https://jiangbei0921.github.io/Astrum/` |
| 首页 HTTP | 200 |
| `version.json` commit | `fffc128`、dirty=false、runId 41443735631 |
| 核心资源 | `core/app.js` 200、`assets/app.css` 200、`privacy.html` 200 |
| 开发文件隔离 | `tools/selftest.js` 404、`docs/architecture/00-README.md` 404 |
| 线上 13 Agent | PASS（Muse—Navigator 全部可见） |
| 线上核心问答 | PASS（“M42 是什么”返回距离/直径/视星等答案） |
| 线上对比 UI | PASS（“比较 M31 和 M33” 两个目标、距离/类型/可见性） |
| 线上拍摄参数 | PASS（200mm 口径、259mm 理论焦距、曝光/跟踪） |
| 线上 CSP/console | PASS（console 无消息；无 CSP 违规） |

本地等价验收：`v1-4-pages` 32/32、`v1-6-browser` 36/36、`selftest` 156/156。

## 7. 未执行与外部条件

| 项 | 状态 |
|---|---|
| 30/60/180 分钟长跑 | 上一轮 LR-01/02/03 已完成（180 分钟采样 178/180）；本轮补 1 分钟 smoke，未重跑 3 小时 |
| 真实 Provider | BLOCKED_API_KEY |
| 真实扫描/CID/出版社 PDF | BLOCKED_SAMPLE（合成 13 类已 PASS） |
| 正式线上回滚/下线 | BLOCKED_AUTHORIZATION（隔离演练 PASS） |
| Wikipedia/Semantic | 当前网络不可达，未计入 PASS |

## 8. 结论

除外部条件外，本地 Node、Chrome、构建、安全、CSP、20 问兼容全部通过；未发现“测试通过但真实功能不成立”的项。线上验收在推送后按第 6 节回填，不以本地结果代替线上结果。

## 9. 第三轮（V1.7）：真实科研能力验证

> 日期：2026-11-02
> 新增：46 案例真实天文研究基准、摘要定量 Claim、跨 Provider 去重、摘要数值保真

### 9.1 新增基准与执行

| 项 | 结果 |
|---|---|
| `tools/v1-7-research-benchmark.js` | 46 案例 / 15 类；记录编号、问题、预期、实际、证据、Agent、工具、耗时、通过、失败原因 |
| 真实网络完整运行 | 46/46 PASS（干净全量；JSON `tools/fixtures/research-benchmark-results.json`） |
| 离线运行 | 38 PASS / 8 SKIP（网络研究案例标 SKIPPED_OFFLINE） |
| 外部限流复跑 | S04 标 `BLOCKED_EXTERNAL:cooling/rate_limit`；同一代码路径单独复跑 PASS，不把外部失败写成 PASS |
| 研究任务耗时 | 本地 1–600ms；主题研究 2.9–13.4s；目标+距离论文研究 20–25s |

### 9.2 新增/更新的测试

| 套件 | 结果 |
|---|---:|
| `v1-6-research-quality-test` | 30/30（新增 Q8 摘要数值、Q9 定量 Claim/1σ 冲突） |
| `v1-7-research-benchmark --offline` | 38 PASS / 8 SKIP |
| `v1-7-research-benchmark`（真实网络） | 46/46 PASS |
| `v1-3-paper-fulltext-test`（真实 arXiv） | 28/28（185,574 B / 5 页 / 22 chunks） |
| `v1-5-longrun-test --minutes=3` | 18/18（997 任务 / 0 失败 / 0 页面错误 / Heap 5.5→5.7MB） |
| `v1-5-bigfile-test` | 13/13（FITS 200MB / PDF 10MB / 重复 10 次） |
| `p0-03-test` | 53/53（20 问逐字节 0 差异） |
| Node 全量套件 | 全部 exit=0（`research-test` 单独复跑 77/77） |
| Chrome 全量套件 | 全部 exit=0（selftest 156/156、v1-6-browser 36/36 等） |
| Provider 配置 | `BLOCKED_API_KEY`（exit 2，未执行真实模型调用） |

### 9.3 构建与安全

| 项 | 结果 |
|---|---|
| 构建 | `_site` 58 文件 / 1,662 KB / core 45 + data 8 |
| 资源引用 | 54 个全部存在且大小写一致 |
| 安全 | 密钥 0 / 本地绝对路径 0 |
| 静态检查 | daily 20/20、deploy 20/20、CSP 6/6、CI 22/22、i18n 0 残留 |

### 9.4 本轮新增缺陷

10 类，详见 `ASTRUM-研究质量与调度修复报告.md` §8：行星直径意图、BODY_INFO 作用域、JWST 实体/索引、主题检索式、SIMBAD 空等、跨 Provider 去重、无 DOI 论文、摘要数值截断、Reducer 单位不确定性、主题词列表冒充摘要。

### 9.5 部署与线上验收

| 项 | 结果 |
|---|---|
| 功能提交 | `e0e7842ce288ad1231ccb57d970578ff61fec241` |
| test Run | `41571532062` success（static / offline-core / offline-browser） |
| pages Run | `41571802143` success |
| 线上 `version.json` | commit `e0e7842`、dirty=false、runId 41571802143 |
| 首页 / 核心资源 | 200 / `core/app.js` 200 |
| 工具/文档隔离 | `tools/selftest.js` 404、`docs/architecture/00-README.md` 404 |
| 线上问答 | “木星的直径是多少？”返回 139,820 km |
| 线上对比 | “比较 M31 和 M33…”2 个目标卡，M31/M33 均渲染 |
| 首屏性能 | 3.07 s（本网络）；53 个外部脚本在 Pages 产物中 `defer` 并行下载，源码/CI 保持阻塞加载 |

> `defer` 只写入 Pages 产物 `_site/index.html`；源码 `index.html`、file://、standalone 与 CI selftest 仍按阻塞脚本顺序执行。`build-standalone.js`、`build-pages.js`、`v1-2-deploy-test`、`v1-4-pages-test` 已兼容带属性的 script 标签。

## 10. V1.8 问题反馈：全量测试与线上验收（2026-11-03）

### 10.1 新增测试

| 套件 | 命令 | 结果 |
|---|---|---:|
| 反馈核心 | `node tools/v1-8-feedback-test.js` | 149/149 |
| 反馈浏览器 | `node tools/v1-8-feedback-browser-test.js` | 49/49 |
| 线上反馈验收 | 临时 CDP 脚本（未入库） | 24/24 |

反馈核心覆盖：配置唯一邮箱、九类类型、六类错误分类、成功任务不误触发、取消不触发、同 Task+类别去重、忽略、诊断最小上下文/截断、脱敏（api_key/authorization/bearer/token/password/secret/cookie/session/JWT/绝对路径）、草稿校验、邮件主题/正文/收件人、中文编码、超长降级、`submitFeedback` 无发送副作用。

反馈浏览器覆盖：失败任务主动提示、文案/两按钮、打开弹窗预填、任务上下文、草稿恢复、忽略、去重、成功任务不触发、回答操作条入口与消息 ID/Task ID、必填校验、诊断预览脱敏、确认页主题/收件人/不自动发送、下载反馈、帮助入口、390px 窄屏、无 JS/CSP 错误。

### 10.2 全量回归（本轮实际执行）

| 层 | 套件数 | 断言/结果 |
|---|---:|---:|
| Node 离线（含 V1.8） | 34 | 1046/1046 通过；v1-7 基准 PASS 38 / FAIL 0 / SKIP 8（SKIP 为真实网络外部条件） |
| Chrome 浏览器（含 selftest、V1.8） | 15 | 431/431 通过 |
| 静态/构建 | 5 | v1-2-deploy 20/20、v1-4-ci 22/22、csptest 6/6、i18n-scan 0 残留、standalone/Pages 构建成功 |
| 线上验收 | 1 | 24/24 |

关键原套件结果：selftest 156/156、v1-6-browser 36/36、v1-4-pages 32/32、P0-03 53/53、B8 33/33、v1-1-browser 27/27、settings 18/18、a11y 13/13、store 17/17、v1-5 IDB/resource/cache 7/7、13/13、15/15。

没有删除测试、降低断言或跳过失败用例；`i18n-scan --max=0` 通过；`v1-5-perf`、`v1-5-store-stress` 退出码 0。

### 10.3 构建与安全检查

| 项 | 结果 |
|---|---|
| CSP 同步 | 2 个内联哈希已最新 |
| standalone | 54 个内联脚本、CSS 131 KB、1710 KB |
| Pages 产物 | 59 文件（core 46 / data 8）、1737 KB、资源引用 55 个全部存在 |
| 敏感扫描 | 密钥 0、本地绝对路径 0 |
| 反馈模块打包 | `_site/core/feedback.js` 200，含统一邮箱 |
| 邮箱唯一性 | `core/feedback.js` 1 处；`core/app.js`、`index.html` 0 处 |

### 10.4 部署与线上验收

| 项 | 值 |
|---|---|
| 功能提交 | `55fe9dba161eba8da1ffa7dd43f17eea94d127dc` |
| test Run | `41588104481` success（static / offline-core / offline-browser） |
| pages Run | `41588501459` success |
| 线上 `version.json` | app 4.8、commit `55fe9db`、dirty=false、runId `41588501459` |
| 线上帮助入口 | 设置 → 帮助 → 问题反馈可打开，邮箱 `2185428966@qq.com` |
| 线上主动提示 | 注入失败任务后出现 `.fb-offer`，两按钮、上下文 `task-online-err`、类型 `search_paper` |
| 线上回答入口 | 回答操作条「反馈问题」可打开，关联 `task-online-ok` 与 `m-` 消息 ID |
| 线上邮件确认页 | 主题 `[ASTRUM Feedback][搜索或论文检索问题] 线上验收反馈`、收件人正确、不自动发送 |
| 线上复制/下载 | 复制入口存在；下载触发“诊断报告已下载（已脱敏）” |
| 控制台/网络 | 无 JS 错误、无 CSP 违规、无额外外发资源 |

> 线上 24/24 使用工作区临时 CDP 脚本 `online-feedback-check.js`，未提交到仓库。`mailto` 的真实客户端唤起需人工在配置邮件客户端的设备上完成，自动化只能验证不自动发送与降级路径。

## 11. V1.9 真实科研强化：全量测试与线上验收（2026-11-03）

### 11.1 新增测试

| 套件 | 命令 | 结果 |
|---|---|---:|
| Provider 协议/分类（真实） | `node tools/v1-9-provider-test.js` | 26/26；REAL PASS；4 场景成功 + 1 故意坏 Key |
| 真实 Provider 集成 | `node tools/v1-9-real-provider-integration-test.js` | 15/15；3/3 调用成功 |
| 研究目标消歧/多轮 | `node tools/v1-9-research-target-test.js` | 13/13 |
| 独立盲测（真实网络） | `node tools/v1-9-blind-research-benchmark.js --json` | 56/56 PASS |
| 真实 PDF | `node tools/v1-9-real-pdf-test.js` | 79/79 |
| 反馈诊断联动 | `node tools/v1-9-feedback-diagnostic-test.js` | 27/27 |
| 跨任务 E2E | `node tools/v1-9-e2e-test.js` | 31/31 |
| 线上验收 | 临时 CDP 脚本 | 27/27 |

独立盲测：15 类 56 题，21 个真实网络案例，59 篇论文；PASS 56 / FAIL 0 / BLOCKED_EXTERNAL 0 / SKIP 0；关键失败（虚构论文、坏引用、NaN）0。基线结果生成于 `2026-11-03T08:21:30Z`；随后复核时 OpenAlex 进入 cooling，15 个网络案例返回 `BLOCKED_EXTERNAL`（41 PASS / 0 FAIL），未写成失败，也未用残缺结果覆盖已完成基线。冷却后应按 `network.yml` 单独复跑。

真实 PDF：6 个 arXiv 样本，5 成功，1 乱码明确拒绝；页数 29/11/6/9/28；参考文献起始页 25/9/6/8/25；不存在参考文献污染正文块。

### 11.2 原套件回归

| 层 | 结果 |
|---|---|
| V1.7 真实基准 | 46/46 PASS |
| V1.8 反馈核心 | 149/149 |
| V1.8 反馈浏览器 | 49/49 |
| selftest | 156/156，CSP 违规 0 |
| v1-6 browser | 36/36 |
| v1-4 pages | 32/32 |
| 其余 Node/Chrome/静态 | 全部 PASS |
| i18n-scan `--max=0` | 通过，界面残留 0 |
| v1-2-deploy / v1-4-ci / csptest | 20/20 / 22/22 / 6/6 |

### 11.3 构建与线上

| 项 | 结果 |
|---|---|
| standalone | 54 脚本、131KB CSS、1726KB |
| Pages 产物 | 59 文件（core 46 / data 8）、1752KB |
| 安全扫描 | 密钥 0、绝对路径 0 |
| 功能提交 | `9e6d99b` |
| 合并日常数据 | `0640f6f` |
| test Run | `41626577600` success |
| pages Run | `41627103167` success |
| 线上 `version.json` | app 4.8、commit `9e6d99b`、dirty=false、runId `41627103167` |
| 线上反馈/路由/诊断 | 27/27 PASS |
| 首屏性能 | DOMContentLoaded 2.9–9.0s（Pages CDN 冷启动波动），最佳 2.9s；脚本数仍 54，体积 +1.9% |

> 性能差异主要来自 GitHub Pages 冷连接与 54 个独立脚本的 6 连接并发上限，不是本轮新增代码导致的结构性退化。V1.7 的 3.07s 仍在实测范围内（本轮最佳 2.9s）。

### 11.4 线上验收明细

- 设置 → 帮助 → 问题反馈：入口、邮箱 `2185428966@qq.com`、表单、确认页正常。
- 回答操作条「反馈问题」：关联任务与 `m-` 消息 ID。
- 主动异常提示：注入失败 TaskState 后可触发、可忽略、同 Task+类别去重。
- 诊断：新增论文/证据/Claim/PDF/Provider 字段，脱敏后导出。
- 路由：WASP-39b 透射光谱问题线上为 `research / T-E`。
- 控制台：无 JS 错误、无 CSP 违规；除既有 `ipwho.is` IP 定位外无额外外发资源。
- `mailto`：确认前不打开；真实客户端/发送仍需人工验收。

### 11.5 真实 Provider 验收（同日）

| 项 | 结果 |
|---|---|
| Provider / Base URL / 模型 | DeepSeek / `https://api.deepseek.com/v1/chat/completions` / `deepseek-chat` |
| 基础 Provider 测试 | 26/26；`calls=5 success=4 failed=1`（故意坏 Key）；`blockedProvider=0` |
| 基础场景耗时 | 1076 / 1725 / 1240 / 1039 ms，平均 1270 ms |
| 基础场景 usage | Prompt 3791 / Completion 348 / **Total 4139** |
| 真实科研集成 | 15/15；`calls=3 success=3`；1864 / 1257 / 1650 ms；usage 1167/291/1458 |
| M13 科研结果 | 3 篇真实论文、3 条证据、`evidenceRefs` 可解析、坏引用 0；仅摘要 gap 如实保留 |
| 同 Thread 多轮 | `resolved=M13`；第二问仍检索 M13 论文，模型指出 DOI 并说明不确定性缺失 |
| 故意坏 Key | 真实 401 → `auth`，未重试、未冒充成功 |
| 真实 503 | 本轮早期自然出现 “Service is too busy”，归类 `server`、重试后恢复；未计为代码失败 |
| 未执行 | 真实 429/配额耗尽、计划性故障演练、浏览器真实 Key 全链路 |

详细见 `ASTRUM-V1.9-Provider接入验证报告.md`。
