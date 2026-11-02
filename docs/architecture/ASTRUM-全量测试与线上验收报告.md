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
| v1-6-browser | 33/33 |

`v1-6-browser` 覆盖：任务种入/刷新列表/逐个恢复/步骤面板/失败步骤；TXT/BOM/空/二进制伪装/PNG/JPG/WebP/超大/MIME 冲突/多附件隔离；真实 PDF 字节 HTTP 下载/解析/全文 UI/章节/页码/chunk；扫描件失败；375px 窄屏无横向溢出。

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
| 功能提交 | `47a3dee04a07a609cdc55f66963658ae7520790a` |
| test Run | `41425289027` success（static / offline-core / offline-browser） |
| pages Run | `41425684667` success（build 28s / deploy 10s） |
| 线上 URL | `https://jiangbei0921.github.io/Astrum/` |
| 首页 HTTP | 200 |
| `version.json` commit | `47a3dee`、dirty=false、runId 41425684667 |
| 核心资源 | `core/app.js` 200、`assets/app.css` 200、`privacy.html` 200 |
| 开发文件隔离 | `tools/selftest.js` 404、`docs/architecture/00-README.md` 404 |
| 线上 13 Agent | PASS（Muse—Navigator 全部可见） |
| 线上核心问答 | PASS（“M42 是什么”返回距离/直径/视星等答案） |
| 线上 CSP/console | PASS（console 无消息；57 个请求无失败） |

本地等价验收：`v1-4-pages` 32/32、`v1-6-browser` 33/33、`selftest` 156/156。

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
</content>
