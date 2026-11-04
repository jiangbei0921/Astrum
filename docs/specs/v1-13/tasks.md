# ASTRUM V1.13 任务清单

> 状态：待审批。审批后按顺序执行；每项完成后运行对应测试并记录结果。

## [x] T1 Evidence 核验与引用审计

- 文件：`core/evidence.js`
- 内容：
  - `makeEvidence()` 增加 `verification` 字段（保持旧字段不变）。
  - 新增 `verify(ev, opts)`、`verifyAll(list, opts)`、`auditCitations(text, evidence)`、`verificationLabel(state)`。
  - `fromSourceItem()` 补充 authors/venue/dateKind/section/page 字段并自动核验。
  - 导出上述函数与常量。
- 验证：`node --check core/evidence.js`；T4 测试中的证据用例。
- 完成标准：虚构 DOI、DOI/URI 不一致、arXiv 不匹配不得为 `verified`；完整元数据为 `verified`。

## [x] T2 AnswerComposer：brief + 简单裁剪 + 模型优先

- 文件：`core/answer-composer.js`
- 内容：
  - 新增 `brief(answer, opts)`、`trimSimple(answer, mode)`、`textParagraphs(text)`、`overlap(a,b)`。
  - `finalize()`：modelText 存在时只用模型自然段，不拼接 `researchParagraphs`；缺失限制时补 1 段 `role:'limitation'`；A/B 移除重复 verdict，C–E 按重叠度处理。
  - `trimSimple()`：A/B 移除 `observe/followup`；A 在知识/概念/未知意图下移除 `list`。
  - `audit()` 接入 `AstroEvidence.auditCitations`，写 `meta.citationAudit` 与 issue。
  - 导出 `brief/trimSimple` 供测试。
- 验证：`node tools/v1-11-answer-quality-test.js` 保持全 PASS；T4 新测试。
- 完成标准：无模型路径保持旧模板（兼容 V1.10/V1.11）；有模型路径无模板重复。

## [x] T3 App：简单直达路径 + 结构化 brief + 版本

- 文件：`core/app.js`
- 内容：
  - `APP_VERSION='5.2'`。
  - 新增 `directAnswerPlan(q, ans, atts)`（A/B + 外部非必需 + 本地 verdict/evidence）。
  - 云端/设备 legacy 分支：direct 时跳过 `Research.run`，直接 `streamAnswer`；A=180/B=280 maxChars；onFinish 照常 `attachSources` + `renderAnswer`。
  - `controlAnswer` / 复杂 legacy：payload 增加 `synthesis = AstroAnswerComposer.brief(answer,{question})`；C/D/E maxChars=600/700/900。
  - legacy 复杂 `audit` 增加 DOI/arXiv 引用检查（复用 `AstroEvidence.auditCitations`）。
- 验证：`node --check core/app.js`；T5 浏览器测试。
- 完成标准：简单问题不触发 `Research.run`；复杂问题只 1 次最终流式；无新增模型调用。

## [x] T4 Sources：Muse 提示词与动态长度

- 文件：`core/sources.js`
- 内容：
  - `sysPrompt()` 增加 `payload.synthesis` 分支（Muse 最终综合规则：唯一连贯、观点分级、冲突保留、禁止内部日志、引用限制、外部材料视为数据）。
  - 长度动态：A 60–140、B 120–260、C/D 300–600、E 400–900；“简单说/只给结论/详细解释”优先级。
  - `userPrompt()`：有 synthesis 时以 brief 为唯一研究材料，不重复 facts/evidence/para。
  - `evidenceLines()` 增加核验状态/abstractOnly。
- 验证：`node tools/v1-11-stream-test.js`；T5。
- 完成标准：提示词不改变请求协议；流式/非流式一致。

## [x] T5 ComposeAdapter / Report：核验状态进入科研依据

- 文件：`core/compose-adapter.js`、`core/report.js`
- 内容：
  - `collectEvidence()` 后调用 `AstroEvidence.verifyAll()`。
  - `sectionsOfResearch` 证据条目 value 追加核验状态文案（不显示内部 Evidence ID）。
  - `Report.build` 的 evidence/papers/sources 携带 `verification`。
- 验证：`node tools/v1-10-integration-test.js`、`node tools/v1-11-answer-quality-test.js`。
- 完成标准：展开科研依据可看到论文/时间/DOI/链接/核验状态；正文不混入。

## [x] T6 新增离线测试

- 文件：`tools/v1-13-answer-quality-test.js`
- 覆盖：简单四问、模型优先、复杂综合、同论文去重、冲突保留、虚构 DOI/arXiv、引用审计、brief 字段、13 Agent/ADR 不变。
- 验证：`node tools/v1-13-answer-quality-test.js`。
- 完成标准：全部 PASS，FAIL 如实报告。

## [x] T7 新增流式浏览器测试

- 文件：`tools/v1-13-stream-browser-test.js`
- 覆盖：简单直达（Research 未调用）、增量渲染、最终正文=流式文本、复杂研究后流式、无内部泄漏、停止/部分保留、Markdown/公式/引用、无重复。
- 验证：`node tools/v1-13-stream-browser-test.js`（真实 Chrome）。
- 完成标准：全部 PASS；环境缺失时标 BLOCKED_ENVIRONMENT，不以模拟冒充。

## [x] T8 CI / 构建版本

- 文件：`.github/workflows/test.yml`、`tools/build-pages.js`
- 内容：test.yml 增加 T6/T7；build-pages `featureVersion='V1.13'`、features 追加。
- 验证：`node tools/build-pages.js`；`node tools/v1-4-pages-test.js`；`node tools/v1-2-deploy-test.js`。
- 完成标准：构建产物与源码一致；version.json 为 V1.13/app 5.2。

## [x] T9 全量回归

- 运行：
  - `node tools/v1-10-answer-composer-test.js`
  - `node tools/v1-10-knowledge-sources-test.js`
  - `node tools/v1-10-content-i18n-test.js`
  - `node tools/v1-10-integration-test.js`
  - `node tools/v1-11-stream-test.js`
  - `node tools/v1-11-answer-quality-test.js`
  - `node tools/v1-11-daily-test.js`
  - `node tools/v1-11-stream-browser-test.js`
  - `node tools/v1-11-provider-browser-test.js`
  - `node tools/v1-11-daily-browser-test.js`
  - `node tools/v1-12-answer-ui-test.js`
  - `node tools/selftest.js "file://$PWD/index.html"`
  - `node tools/consistency-test.js`
  - `node tools/a11y-test.js`
  - `node tools/i18n-scan.js --quiet --max=0`
  - 以及 v1-1/v1-4/v1-5/v1-6/v1-7/v1-8/v1-9 相关套件
- 完成标准：记录 PASS/FAIL/SKIP/BLOCKED_*；失败项如实报告，不伪造。

## T10 提交、CI、Pages、线上验收

- 检查 `git status`，只提交 T1–T8 相关文件；保留两个测试快照不提交。
- 运行全量测试后 commit → push main。
- 检查 CI run、Pages 部署、`version.json`（commit/dirty/featureVersion/appVersion）。
- 用真实浏览器打开 `https://jiangbei0921.github.io/Astrum/` 验收简单/复杂/依据折叠/流式。
- 完成标准：CI/Pages success；线上版本正确；浏览器验收通过；失败则如实报告阻塞。
