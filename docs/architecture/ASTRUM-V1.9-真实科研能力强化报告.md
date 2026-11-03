# ASTRUM V1.9 · 真实科研能力强化报告

> 日期：2026-11-03
> 范围：真实 Provider 接入验证、独立科研盲测、真实复杂 PDF、V1.8 反馈诊断闭环
> 分支：`main`
> 原则：13 Agent、Muse、Tool-Centric、7 模板、MEMORY/Thread/TaskStore、旧接口、ADR-001、纯静态部署均保留
> 结论：所有当前环境可执行项已完成并部署；真实 Provider 已用 DeepSeek `deepseek-chat` 完成真实外部调用（7 次成功 / 1 次故意坏 Key 鉴权失败），基础 Provider 标 PASS。

## 1. 执行摘要

| 任务 | 结果 |
|---|---|
| A 真实 Provider | **PASS**：DeepSeek `deepseek-chat`，8 次真实请求 / 7 成功 / 1 故意坏 Key；离线协议 20/20 |
| B 独立科研盲测 | **56/56 PASS**（15 类，21 个真实网络案例，59 篇论文） |
| C 真实复杂 PDF | **79/79 PASS**；6 个真实样本，5 解析成功，1 乱码拒绝 |
| D 反馈中心联动 | **149/149 + 49/49 + 27/27 + 31/31**；线上 27/27 |
| 全量回归 | 原有 Node/浏览器/静态套件全部通过；V1.7 真实基准 46/46 |
| 部署 | test `41603946113` success；Pages `41604395159` success |
| 线上 | commit `0640f6f`、dirty=false、runId `41604395159` |

## 2. 实际修改文件

| 文件 | 修改 |
|---|---|
| `core/sources.js` | 导出 `classifyError`；HTTP 状态/坏 JSON/空响应/超时结构化分类；新增 `usageOf` 返回 Prompt/Completion/Total；`enQueryFor` 星表优先修正 M13 英文名 |
| `core/control-bridge.js` | 使用 Sources 错误分类；返回 kind/status/retryable；透传服务商 `usage` |
| `core/planner.js` | 研究检索词排序：具体物理量（age/metallicity/uncertainty）优先于泛化 measurement |
| `core/request.js` | Control 路径复用 `resolveByMemory`，修复多轮追问检索目标丢失 |
| `core/agents.js` | 导出 `resolveByMemory`，与 legacy 路径共用同一指代消解 |
| `core/router.js` | 扩展研究词表；unknown + 研究信号不再强制 LEGACY |
| `core/agents.js` | 缺省 ctx bortle/lat/lon/tz 回填，消除 `Bortle undefined` |
| `core/pdf-text.js` | 页码映射、referencesStartPage、参考文献不进 chunks、标题识别、尾部垃圾容忍、乱码拒绝、24MB 上限、pdf_corrupt/ocr 细节 |
| `core/paper-fulltext.js` | 全文 Evidence ID 唯一；24MB 下载上限 |
| `core/feedback.js` | 诊断增加论文/证据/Claim/evidenceRefs/PDF/工具/Provider/gaps/limitations |
| `core/app.js` | 反馈上下文增加 Provider；诊断预览增加科研计数 |
| `core/i18n.en-settings.js` | 新增诊断摘要英文词条 |
| `data/knowledge.js` | 光谱类型/光谱型别名 |
| `.github/workflows/test.yml` | 新增 V1.9 Provider/反馈诊断/离线盲测步骤 |
| `.github/workflows/network.yml` | 新增真实 PDF 与 E2E 步骤 |
| `.gitignore` | 忽略本地真实 PDF 样本目录 |

## 3. 独立测试文件

| 文件 | 内容 | 结果 |
|---|---|---|
| `tools/v1-9-provider-test.js` | 协议、错误分类、Agent/预算边界；真实调用 4 场景 + 坏 Key | 26/26；REAL PASS；usage 3791/348/4139 |
| `tools/v1-9-real-provider-integration-test.js` | 真实 DeepSeek + M13 科研任务 + 模型表述 + 同 Thread 多轮 | 15/15；REAL PASS；usage 1167/291/1458 |
| `tools/v1-9-research-target-test.js` | M13/M31/M45/行星映射、检索式、MEMORY 指代 | 13/13 |
| `tools/v1-9-blind-research-benchmark.js` | 56 案例 / 15 类 / 10 维评分 | 56/56 |
| `tools/v1-9-real-pdf-test.js` | 6 个真实 arXiv PDF / 内容完整性 | 79/79 |
| `tools/v1-9-feedback-diagnostic-test.js` | 诊断科研字段、脱敏、上限 | 27/27 |
| `tools/v1-9-e2e-test.js` | PDF→Evidence→Claim→Report→反馈 | 31/31 |

结果文件：`tools/fixtures/v1-9-blind-research-results.json`、`v1-9-provider-results.json`、`v1-9-real-pdf-results.json`。PDF 本体不入库。

## 4. 真实缺陷与修复

本轮共记录 13 个可复现缺陷/质量缺口（P1 5 个、P2 6 个、P3 2 个）：

1. **P1** 全文 Evidence 同一章节多个块 ID 相同（`ev_f`），Claim 无法定位具体 chunk。
2. **P1** PDF 乱码（2208）被当成功返回。
3. **P1** PDF 压缩流尾部垃圾导致整篇解码失败。
4. **P1** 研究主题被 unknown/旧兜底吞掉（WASP-39b、21cm、FRB 宿主星系等）。
5. **P1** 长论文 14.3MB 被 12MB 上限拒绝。
6. **P2** 章节页码全部映射到最后一页，referencesStartPage 永远 null。
7. **P2** 参考文献进入全文 chunks/Claim。
8. **P2** 两栏粘行使 `References. | ...` 成为章节。
9. **P2** 标题识别成期刊页眉/LaTeX 行。
10. **P2** Provider 500/坏 JSON/空响应/404 分类错误。
11. **P2** 反馈诊断缺少科研定位字段。
12. **P3** 回答出现 `Bortle undefined`。
13. **P3** 光谱类型别名缺失，概念问题不命中知识库。

全部已在现有架构内修复；没有删测试、降断言或跳过失败项。

真实 Provider 验收阶段（同日）又修复 4 个可复现缺陷：

14. **P1** `enQueryFor('武仙座球状星团')` 先命中知识库别名 `Hercules Cluster`，OpenAlex 召回武仙座星系团而非 M13；改为星表优先，返回 `Hercules Globular Cluster`。
15. **P1** Control 路径未做 MEMORY 指代消解，多轮追问 `targets` 为空、检索式退化为 `age`；`request.js` 复用 `resolveByMemory`。
16. **P2** `RESEARCH_TERMS` 中 `measurement` 先于具体物理量，M13 年龄追问检索式被泛化；重排为 age/metallicity/uncertainty 优先。
17. **P2** 只返回 total token，无法报告 Prompt/Completion；新增 `usageOf` 并透传 `usage`。

## 5. 测试结果

### Node

| 套件 | 结果 |
|---|---|
| 原有离线核心（research/task/P0-03/control/B8/V1.1–V1.7 等） | 全部 PASS |
| v1-7 真实网络基准 | 46/46 PASS |
| v1-8 反馈核心 | 149/149 |
| v1-9 反馈诊断 | 27/27 |
| v1-9 独立盲测（offline） | 35 PASS / 21 SKIP（网络案例） |
| v1-9 独立盲测（真实网络） | 56/56 PASS |
| v1-9 真实 PDF | 79/79 |
| v1-9 E2E | 31/31 |
| v1-9 Provider（真实） | 26/26；REAL PASS；4 场景成功 + 1 故意坏 Key |
| v1-9 真实 Provider 集成 | 15/15；REAL PASS；3/3 调用成功 |
| v1-9 研究目标消歧/多轮 | 13/13 |

### 浏览器 / 静态

| 套件 | 结果 |
|---|---|
| selftest | 156/156 |
| v1-6 browser | 36/36 |
| v1-4 pages | 32/32 |
| v1-1 browser | 27/27 |
| settings / a11y / store / skill / consistency / ctx / IDB / resource / cache / rail | 全部 PASS |
| v1-8 feedback browser | 49/49 |
| v1-2 deploy / v1-4 CI / csptest | 20/20 / 22/22 / 6/6 |
| i18n-scan `--max=0` | 通过，界面残留 0 |

## 6. 构建与线上

| 项 | 值 |
|---|---|
| standalone | 54 脚本、CSS 131KB、1726KB |
| `_site` | 59 文件（core 46 / data 8）、1752KB |
| 安全扫描 | 密钥 0、本地绝对路径 0 |
| 功能提交 | `8b7b8aa` |
| 合并日常数据 | `0640f6f` |
| test Run | `41603946113` success（static/offline-core/offline-browser） |
| pages Run | `41604395159` success |
| 线上 version | app 4.8、commit `0640f6f`、dirty=false、runId `41604395159` |
| 线上验收 | 27/27（反馈三入口、路由、诊断、确认页、无 JS/CSP、无额外反馈外发） |

首屏性能：本轮代码只增加约 1.9% 体积、脚本数量保持 54；线上 DOMContentLoaded 实测 2.9–9.0 s（GitHub Pages 冷/CDN 波动），最佳 2.9s，与 V1.7 的 3.07s 基线同量级。未发现由本轮代码引入的结构性退化。

## 7. 外部条件与剩余问题

| 项 | 分类 | 需要什么 |
|---|---|---|
| 真实 Provider 调用 | **PASS** | 已用 DeepSeek `deepseek-chat` 完成；Key 未入库，验收后删除本机临时文件 |
| 真实 429/配额耗尽 | 未触发 | 需真实账户额度条件；不为验收刻意耗尽配额 |
| Provider 计划性故障演练 | 未执行 | 已自然观测 503 并验证重试/阻塞分类 |
| 浏览器“测试连接 + 真实科研问答” | 未执行 | 本轮真实链路为 Node；浏览器侧需填入 Key 后人工复验 |
| 真实扫描版 PDF | BLOCKED_SAMPLE | 合法公开的真实扫描样本 |
| 真实可正确解析的复杂 CID PDF | BLOCKED_SAMPLE | 带正确 ToUnicode 的真实 CID 样本 |
| OCR | 未实现 | 不引入大型依赖；仅分类 `pdf_ocr_required` |
| 真实邮件客户端/发送 | BLOCKED_MAIL_CLIENT / BLOCKED_USER_ACTION | 人工在邮件客户端确认发送 |
| network workflow V1.9 步骤 | 已配置、未本次触发 | 可手动 `gh workflow run network.yml` 验证外部环境 |

## 8. 结论

ASTRUM 在本轮通过了独立盲测、真实 PDF 内容验证、反馈诊断闭环与全量回归。最重要的变化不是增加测试数量，而是修复了会影响真实研究可信度的 5 个 P1：全文 Evidence 去重定位、乱码拒绝、PDF 尾部垃圾、研究主题路由、14MB 长论文支持。

真实 Provider 能力已验证：DeepSeek 官方端点、`deepseek-chat`、8 次真实外部请求（7 成功 / 1 故意坏 Key），服务商 usage 为 Prompt 3791 + 1167、Completion 348 + 291；M13 科研链路与同 Thread 追问均由真实模型参与完成。M13 消歧、多轮指代与检索词排序三个缺陷在验收中暴露并修复，另补 `resolveByMemory` 导出与 usage 透传。离线/Mock 结果没有冒充真实调用；未触发项（真实 429、计划性故障、浏览器真实 Key 全链路）已明确列出。
