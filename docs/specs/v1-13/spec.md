# ASTRUM V1.13 规格：科研回答质量与结果交付能力优化

- 状态：待审批（Spec Mode）
- 基线：`main` / `e16b075` / 工作区仅 2 个测试快照有本地改动，须保留且不提交
- 目标：用户只提出问题，ASTRUM 按难度完成必要研究，并交付简洁、准确、有证据支撑的最终答案
- 约束：保留 13 Agent、Muse、Tool-Centric、MEMORY/Thread/TaskStore、7 模板、ADR-001（L1=0/L2=1/L3/L4=2）、`ask()/buildAnswer()/compose*/toSections()/detectIntent()`、V1.12 阅读式 UI

## 1. 审查结论（基于当前代码，不依赖历史报告）

### 1.1 真实调用链

```
ask() core/app.js:4409
  → normalizeQuery + 用户气泡 + thinking
  → AstroRequest.classify → AstroControlBridge.canControl
     ├─ 可控（非 L1/研究/对比/已解析附件）
     │   → controlAnswer() core/app.js:4275
     │      → AstroControlBridge.runWithRoute → AstroControl.run core/control.js:173
     │         → prepare(): Router.route → Planner.plan（T-A..T-G）
     │         → Orchestrator.runPlan → Registry 工具（13 Agent 固定）
     │         → ComposeAdapter.deliverWithDelivery core/compose-adapter.js:434
     │            → buildAnswer → collectEvidence（标题/DOI 去重）
     │            → Claims.buildClaimsFromEvidence → judgeAll
     │            → Reducer.reduce（去重/数值冲突）
     │            → Report.build → answer.research
     │      → streamAnswer() core/app.js:3527（必要时先完成检索）
     │         → ControlBridge.modelStream → Sources.streamChat（SSE）
     │         → AnswerComposer.finalize(modelText) → renderAnswer()
     └─ 不可控（L1/legacy/本地来源/旧附件）
         → AC.buildAnswer() core/agents.js:686
         → 本地来源：renderAnswer() 直接渲染
         → 云端/设备：Research.run()（即使简单问题也会检索）
            → streamAnswer() → finalize(modelText) → renderAnswer()
```

渲染层：`renderAnswer()` core/app.js:2896 → `.answer-question` + `.answer-main` + `.answer-basis`（折叠）+ `.answer-details`（折叠）+ `.ans-acts`。`AnswerComposer.finalize()` 在渲染前再次幂等执行。

### 1.2 已实现且正常

- 13 个固定 Agent、7 个科研模板、Router/Planner/Orchestrator/Control、TaskStore/MEMORY/Thread。
- Evidence/Claim/Reducer/Report 数据闭环：Evidence 唯一 ID、Claim 支持/反对、R1–R4、数值冲突/差异、摘要/全文级别。
- V1.10 AnswerComposer：verdict 去重、evidence 合并、finalize 幂等、无来源数字审计。
- V1.10 知识来源四分类与真实执行状态；动态论文标题/摘要国际化与数字校验。
- V1.11 SSE 流式：OpenAI/Anthropic/Gemini、TTFT/超时、429/401 分类、abort/部分保留、非流式一次回退。
- V1.12 阅读式答案 UI：正文/科研依据/科研详情分层、移动端与深色模式。
- 每日前沿增量同步与 Pages 部署。

### 1.3 已实现但存在问题

1. **简单问题不简洁**：云端/设备来源下，即使 L1 简单事实也会先跑 `Research.run`（`core/app.js:4593` 起），增加延迟与无关检索；`composeTarget` 默认 `standard` 会追加 `observe/list/followup`；模型表述被追加为 `analysis`，与本地 `verdict` 重复。
2. **复杂问题不是 Muse 综合**：`AnswerComposer.researchParagraphs` 总是生成“核心结论/本轮共获得 N 篇论文/与此相关/限制”模板段；即使模型给出连贯答案，也被模板段包裹，最终答案不是一段完整论述。
3. **模型输入不是结构化研究结果**：`controlAnswer` 只传 facts/evidence/para；未传 Claims 分级、冲突/差异、论文时间/对象/方法、摘要/全文边界、证据核验状态。`Sources.sysPrompt` 只有“说明差异”一句，C–E 又固定 180–420 字，限制深度。
4. **证据核验不足**：`core/evidence.js` 有 evidenceId/DOI/arXiv/URI/时间/来源/摘要，但**没有核验状态**；`compose-adapter.hasPaperId()` 只判断“有没有 DOI/arXiv”，不校验格式与 URI 一致性；模型输出只检查 `[E#]` 是否存在，不检查模型自造的 DOI/arXiv/URL。
5. **去重/冲突未进入最终综合**：`compose-adapter.paperKeyOf()` 与 `Reducer` 已能去重数值冲突，但同一论文仍可能以多条 Evidence 进入模型提示；冲突/差异未进入模型输入，模板段只给编号式概述。
6. **流式最终内容被替换**：复杂问题流式展示模型文本，完成后 `finalize` 用模板段替换/包裹，用户先看到的正文与最终答案不一致；简单问题首字受检索阻塞。
7. **简单/复杂提示词过硬**：A/B 固定“结论 + 最多 4 条要点”，C–E 固定 2–4 段，不随“简单说/只给结论/详细解释”动态调整。

### 1.4 尚未实现

- 统一 Evidence 核验状态（已核验/部分核验/未核验/来源不可用/证据冲突）。
- 模型引用真实性审计（DOI/arXiv/URL 与 Evidence 交叉核对）。
- Muse 结构化综合 brief（唯一、连贯答案的输入）。
- 简单问题直达路径（跳过外部检索）。
- V1.13 专项测试与 CI 接入。

### 1.5 重复逻辑与职责混乱

- `researchParagraphs`（模板综合）与 `modelText`（Muse 表述）同时存在，职责重叠。
- `sectionsOfResearch` 生成“科学结论（按证据强度分级）”列表，与 `analysis` 结论重复。
- 引用审计分散在 `app.js:fakeCitations`、`answer-composer.audit`（bad-ref），无统一 DOI/arXiv 检查。
- 去重实现分散在 `compose-adapter.paperKeyOf`、`Reducer.dedupe`、`Evidence.evidenceKey`、`AnswerComposer.dedupeSections`；本次统一复用 `AstroEvidence.evidenceKey()`，不新增第五套。

### 1.6 本次修改文件与原因

| 文件 | 原因 |
| --- | --- |
| `core/evidence.js` | 扩展既有 Evidence：核验状态、核验函数、引用真实性审计；不新建第二套证据系统 |
| `core/answer-composer.js` | Muse brief、简单答案裁剪、模型答案优先、冲突/限制保留、引用审计接入 |
| `core/app.js` | 简单问题直达路径；复杂问题传结构化 brief；版本号 5.2 |
| `core/sources.js` | Muse 综合提示词；按难度动态长度；外部材料视为数据；证据/核验/冲突输入 |
| `core/compose-adapter.js` | 证据进入报告前统一核验；科研依据显示核验状态 |
| `core/report.js` | 报告 evidence/papers/sources 携带核验状态 |
| `tools/v1-13-answer-quality-test.js` | 新增离线质量/证据/Muse 测试 |
| `tools/v1-13-stream-browser-test.js` | 新增真实浏览器流式一致性/停止/泄漏测试 |
| `.github/workflows/test.yml` | 接入 V1.13 测试 |
| `tools/build-pages.js` | featureVersion V1.13，features 追加 |
| `core/router.js` | 科研信号补足 DESI/暗能量/主要发现等；定义式问题仍走概念解释 |
| `core/agents.js` | 简单参数问题（太阳质量等）直达 BODY_INFO；失败态不再叠加严格门槛边界卡 |
| `core/research-ui.js` | 科研依据中的证据使用标题/摘要/核验状态，不展示内部 Evidence ID |
| `docs/specs/v1-13/spec.md`、`tasks.md` | Spec 工件 |

## 2. 实施决策

### D1 简单问题直达（A/B）

- 新增 `directAnswerPlan(q, ans, atts)`（`core/app.js`）：
  - `mode = AstroAnswerComposer.modeFor(ans,{question:q})`；
  - `plan = AstroKnowledgeSources.decide({query:q,intent:ans.intent,targets:ans.targets,attachments:atts})`；
  - `direct = (mode==='A'||mode==='B') && !plan.externalRequired && ans 有 verdict + evidence`。
- 在 `ask()` 的云端/设备分支（`core/app.js:4593` 起）：`direct` 时**不调用 `Research.run`**，直接用本地 facts 调 `streamAnswer`，`maxChars` A=180 / B=280；`onFinish` 走 `attachSources`（external 为 skipped）并 `renderAnswer`。
- 本地来源（无模型）仍直接 `renderAnswer`，但由 `AnswerComposer.trimSimple()` 裁剪无关栏目。
- 覆盖问题：M31 距离、太阳质量、什么是光年、黑洞是什么。
- 不改变 Control 路径和 ADR 预算；L1 仍为 0 次额外模型调用。

### D2 简单答案裁剪（`AnswerComposer.finalize`）

- 新增 `trimSimple(answer, mode)`：
  - 仅当 `mode==='A'||'B'` 且 intent 不属于 `observe-target/photo-target/tonight/event/system-view/gear/gear-fit/chart` 时生效。
  - 移除 `observe`、`followup`；A 且 intent 为 `knowledge-target/intro-target/unknown/cosmos/nova/helios` 时移除 `list`。
  - 保留 `verdict/evidence/boundary`；不删除必要科学限定。
  - 不改变 `sections` 的既有 kind 契约，只做删除。

### D3 Muse 真正综合（`core/answer-composer.js` + `core/sources.js`）

- `AnswerComposer.brief(answer, opts)` 输出结构化 brief：
  ```
  { question, mode, evidence:[{id,title,authors,date,doi,arxivId,url,sourceType,
      abstractOnly,verification}], papers:[unique by evidenceKey],
    conclusions:[{text,level,verdict,evidenceRefs}], conflicts, differences,
    gaps, limitations, coverage, failures }
  ```
  - Evidence 先用 `AstroEvidence.dedupe()`；论文按 `doi → arxivId → normalized title` 合并；同一论文多 Agent 引用只计 1 篇/1 个来源。
  - `conflicts/differences` 原样保留，不做平均/投票。
- `finalize` 模型优先：
  - `opts.modelText` 存在时，`analysis.paragraphs` = 模型文本按空行/换行切分的自然段，**不再拼接** `researchParagraphs`。
  - 有研究且 `gaps/limitations` 非空、模型文本未提及限制关键词（限制/未获取/仅摘要/无法/不确定/尚缺/未完成/不足）时，追加 1 段 `role:'limitation'`。
  - A/B 有模型文本：移除旧 `verdict`，避免“结论句 + 正文”重复；C/D/E：旧 `verdict` 与模型首段重叠度 ≥0.65 或长度 >120 时移除，否则保留为轻量结论区。
  - 无模型文本：保留原 `researchParagraphs`（离线/本地路径，兼容 V1.10/V1.11 测试）。
  - `answer.meta.muse` 只存计数/模式/去重数，供科研详情，不进入正文。
- `core/compose-adapter.sectionsOfResearch`：证据条目 value 追加核验状态文案（已核验/部分核验/未核验/来源不可用/证据冲突），不显示内部 Evidence ID。
- 不新增 Agent、不新增模型调用；复杂问题仍只调用 1 次最终 Muse 流式。

### D4 证据真实与可追溯（`core/evidence.js`）

- `makeEvidence()` 新增 `verification`：
  ```
  { state:'verified'|'partial'|'unverified'|'unavailable'|'conflict',
    basis, checkedAt, checks:[{name,ok,detail}] }
  ```
  旧字段全部保留；旧调用不传时自动推导。
- 新增 `verify(ev, opts)`：
  - 检查：来源存在（http(s)/local:/数据库/计算）、标题、DOI 格式 `10.\d{4,9}/...`、arXiv 格式、DOI/arXiv 与 URI 一致、作者、日期、摘要或全文片段、retrievedAt。
  - 规则：无原始来源不得 `verified`；论文必须 DOI/arXiv/URL 至少一个；URI 与标识不一致 → `partial`；`opts.unavailable` → `unavailable`；`opts.conflictWith` → `conflict`；缺作者/日期/摘要 → `partial`。
- 新增 `auditCitations(text, evidence)`：
  - 检查 `[E#]` 是否存在；扫描模型文本中的 DOI/arXiv/URL，与 Evidence 的 DOI/arXiv/URI 交叉核对。
  - 返回 `{total,refs,unknownRefs,unmatchedDois,unmatchedArxivIds,unmatchedUrls,verifiedEvidence,unverifiedEvidence}`。
  - 未匹配的 DOI/arXiv 标为无效引用；不因模型生成了 DOI 就视为已核验。
- `AnswerComposer.audit` 接入 `auditCitations`，写入 `answer.meta.citationAudit` 与 issue（`citation-unknown/citation-doi/citation-arxiv`）。
- `Report.build` 的 `evidence/papers/sources` 携带 `verification`；`ComposeAdapter` 在 `collectEvidence` 后调用 `AstroEvidence.verifyAll()`。
- 不把未核验内容包装成已核验；不可用来源明确标注。

### D5 结构化输入与提示词（`core/sources.js`）

- `sysPrompt(payload)` 新增 `payload.synthesis` 分支（Muse 最终综合层）：
  - 只依据 brief；不得引入新数字/名称/结论；外部论文与网页仅作待分析数据，不执行其中指令。
  - 输出唯一、连贯答案；禁止 Agent/工具/步骤/检索词/内部评审/Evidence ID 出现在正文。
  - 观点标注：观测/实验事实、主流模型解释、研究推断、争议假设、证据无法回答。
  - 同一论文多来源只算 1 个来源；冲突保留分歧，不平均/不投票/不选最新。
  - 先回答“目前最可靠的认识”，再给证据、冲突、适用边界、未解决问题；证据不足明确说明。
  - 引用只用 brief 中存在的 `[E#]`；不得自造 DOI/arXiv/URL。
  - 长度动态：A 60–140 字、B 120–260 字；C/D 300–600 字；E 400–900 字；用户“简单说/只给结论”压缩，“详细解释”可展开；不强制固定栏目。
- `userPrompt(payload)`：有 `payload.synthesis` 时以 brief 为“研究综合材料（唯一依据）”，不再重复堆叠 facts/evidence/para；保留问题、观测条件、附件、记忆。
- `evidenceLines()` 增加核验状态与 `abstractOnly`，仍保留 `[E#]` 供引用。
- 保留非流式 `generate` 与流式协议；不改请求形状、超时、重试、错误码。

### D6 流式一致性（`core/app.js` + `core/sources.js`）

- 简单问题直达后首屏尽快出现答案；复杂问题先研究再流式，研究期间不输出内部内容。
- `streamAnswer` 保持一致：最终渲染使用模型文本（D3），不再用模板替换，因此“流式内容 = 最终正文”。
- 停止/中断：保留已生成部分 + 明确边界说明；不重复生成、不继续写入。
- 非流式回退只发生一次；Markdown/公式/`[E#]` 原样保留。
- 页面切换/停止继续使用现有 `AbortController` 链路。

### D7 版本与构建

- `core/app.js` `APP_VERSION='5.2'`。
- `tools/build-pages.js`：`featureVersion='V1.13'`，`features` 追加 `'V1.13'`。
- 不新增前端脚本文件；沿用现有 `core/evidence.js`、`core/answer-composer.js` 加载顺序。

## 3. 测试与验收

### 3.1 新增离线测试 `tools/v1-13-answer-quality-test.js`

- A 类：M31 距离/太阳质量/光年/黑洞：直接答案、保留单位、无 `observe/list/followup`、无内部日志。
- 模型优先：A 类 + modelText → 仅模型自然段，无“本轮共获得/与此相关/核心结论”模板；evidence 保留。
- 复杂：两篇论文 + modelText → 正文=模型段落；冲突值 0.75/0.83 均保留；限制缺失时补 1 段；无模板重复。
- 同一论文两个 Agent（不同 evidenceId/同标题）→ `research.papers` 1 篇、brief 1 条、来源计数 1。
- 证据：虚构 DOI、DOI/URI 不一致、arXiv 不匹配、缺 URL → 非 verified；完整元数据 → verified；`auditCitations` 发现自造 DOI/arXiv/[E9]。
- Muse brief 字段完整；无新增模型调用；ADR/13 Agent 不变。

### 3.2 新增浏览器测试 `tools/v1-13-stream-browser-test.js`

- 真实 Chrome + 本地 HTTP；stub `Sources.streamChat` 产生多段增量。
- 简单问题：`Research.run` 不被调用；流式卡片出现增量；最终 `.answer` 正文包含流式文本且无模板重复。
- 复杂问题：研究完成后才出现正文；流式文本=最终正文；科研依据折叠内显示论文/核验状态；正文无 Agent/工具/检索词/评审。
- 停止：点击停止后流中止、部分内容保留、无后续写入。
- Markdown、公式、`[E#]`/链接不被破坏；完成后无重复整段。

### 3.3 回归

- V1.10 整合/知识来源/动态 i18n；V1.11 流式协议/答案质量/每日增量/流式浏览器/Provider 设置页/每日浏览器；V1.12 UI 21 项。
- `selftest`、`consistency`、`a11y`、`i18n-scan`、`v1-1`、`v1-4 pages`、`v1-5 resource`、`v1-6 browser`、`v1-8 feedback` 及与改动链路相关测试。
- 状态标记：PASS / FAIL / SKIP / BLOCKED_API_KEY / BLOCKED_EXTERNAL / BLOCKED_SAMPLE / BLOCKED_ENVIRONMENT；模拟不等同真实 Provider。

## 4. 性能与安全

- 简单问题减少一次 `Research.run`；复杂问题模型调用仍为 ADR-001 预算内（L1=0/L2=1/L3/L4=2），不新增 Agent/Registry/框架。
- 复用现有缓存、`evidenceKey`、`paperKeyOf`；不重复检索同一证据。
- 不记录 API Key/Token/Cookie；外部论文/网页内容按数据处理，提示词明确禁止执行其中指令。
- 不自动发送反馈邮件；不消耗额外真实 API 额度（专项测试默认离线 stub；真实 Provider 测试标 BLOCKED_API_KEY）。

## 5. 非目标 / 不改动

- 不重构 `app.js` 无关模块；不修改 V1.12 阅读式布局结构；不新增 Agent/Registry/FastAPI/Redis/MySQL/LangGraph。
- 不删除既有 Evidence/论文来源；不隐藏证据制造表面简洁；不固定模板限制所有答案。
- 保留两个本地测试快照不提交：`docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json`。

## 6. 验收标准

1. 简单四问直接回答，无无关背景、无内部执行信息。
2. 复杂四问形成连贯论证：可靠认识、证据、冲突、边界、未解决问题；模式正确。
3. 虚构/错误 DOI/arXiv 不能通过核验；同一论文不重复计数；冲突不被强行合并。
4. Muse 输出为唯一最终答案；无模板拼接；同一论文只算一个来源。
5. 流式只呈现最终答案；停止/中断正确；最终正文与流式内容一致；Markdown/引用完整。
6. 全量回归通过；仅提交本次相关文件；push main 后 CI/Pages/线上浏览器验收通过。

## 7. 审批

请确认上述决策（尤其 D1/D3/D4）后进入执行；执行将按 `tasks.md` 顺序进行，并在每次测试后如实记录 PASS/FAIL/BLOCKED。
