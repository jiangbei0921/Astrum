# ASTRUM V1.9 · 真实复杂 PDF 验证报告

> 日期：2026-11-03
> 测试文件：`tools/v1-9-real-pdf-test.js`
> 结果：`tools/fixtures/v1-9-real-pdf-results.json`
> 原则：PDF 本体从 arXiv 下载到 gitignore 目录，不在仓库分发；不用合成 PDF 冒充真实样本。
> 结论：6 个真实样本，5 个解析成功，1 个乱码被明确拒绝；断言 **79/79 PASS**，**BLOCKED_SAMPLE 0**。

## 1. 样本清单

| 样本 | 来源 | 大小 | 页数 | 特征 | 结果 |
|---|---|---:|---:|---|---|
| 1106.4307v1 | arXiv astro-ph.GA | 1.63 MB | 29 | 长篇、双栏、表格、大量参考文献 | PASS，refs@p25 |
| 0901.4842v1 | arXiv astro-ph.SR | 177 KB | 11 | 会议论文集、公式、参考文献 | PASS，refs@p9 |
| 1512.06519v1 | arXiv astro-ph.HE | 47 KB | 6 | 多栏、公式、参考文献 | PASS，refs@p6 |
| 2302.11645v1 | arXiv astro-ph.HE | 776 KB | 9 | 公式、参考文献 | PASS，refs@p8 |
| 2206.14908v1 | arXiv astro-ph.GA | 14.3 MB | 28 | 大型调查论文、双栏、表格、参考文献 | PASS，refs@p25 |
| 2208.11692v1 | arXiv astro-ph.EP | 2.13 MB | 27 | 真实字体编码异常，提取为乱码 | **PASS_REJECTED**：`pdf_unsupported_encoding` |

所有样本均校验 SHA-256；缺样本时脚本返回 `BLOCKED_SAMPLE`，不伪造成功。

## 2. 本轮发现并修复的 PDF 缺陷

| 编号 | 问题 | 复现 | 修复前 | 根因 | 修改 | 修复后 |
|---|---|---|---|---|---|---|
| V19-P1 | 章节页码错误 | 29 页论文 | 第 15 块以后全部标 p29 | 按段落数猜页码，图表页文本少导致偏差 | 按页面文本累计偏移映射 | 页码单调、refs@p25 |
| V19-P2 | `referencesStartPage` 永远 null | 所有 PDF | null | 返回值硬编码 `null` | 识别 References 章节并记录 pageStart | 25/9/6/8 正确 |
| V19-P3 | 参考文献污染正文块 | 全文研究 | references 进入 chunks | 未区分参考文献章节 | 参考文献不进 chunks；保留章节标记 | 证据块页码 ≤ refs 起页 |
| V19-P4 | 两栏粘行被误判为章节 | 1106 | 出现 `References. \| Sources...` 标题 | 章节只按前缀匹配 | 标题必须短行、无 `\|`、无粘连句 | 无粘连参考标题 |
| V19-P5 | 压缩流尾部垃圾导致整篇失败 | 2208 | 每页 “Trailing junk” | DecompressionStream 严格拒绝尾部字节 | 逐块读取，仅对 trailing junk 停止 | 其余论文不再整篇失败 |
| V19-P6 | 乱码被当成功 | 2208 | `ok=true` + 77k 乱码 | 只检查文本长度，不检查可读性 | 字母/标点/常见词比例检测 → `pdf_unsupported_encoding` | 明确拒绝，不返回伪造全文 |
| V19-P7 | 14.3 MB 真实论文被拒 | 2206 | `pdf_too_large` | 默认 12 MB | 解析与下载上限统一提高到 24 MB | 28 页/14.3 MB 成功 |
| V19-P8 | 标题识别错误 | 0901/2206 | 期刊页眉、LaTeX 版式行 | 只信 `/Title` 或首行 | 过滤 arXiv/期刊/LaTeX/日期行，拼接小写续行 | 标题正确识别 |
| V19-P9 | 安全失败码不明确 | 扫描/损坏 | 只有 no_text/not_pdf | 未细分 | `pdf_corrupt`；`pdf_no_text` 附 `detailCode=pdf_ocr_required` | 可定位失败 |

## 3. 内容完整性抽查

| 检查 | 结果 |
|---|---|
| 正文丢行 | 5 个成功样本 `textLength` 与页数匹配，无空页整体丢失 |
| 章节标题 | 1106 识别 ABSTRACT/Introduction/Observations/CMDs/Previous studies/Discussion/Summary/References |
| 参考文献污染 | 所有 chunks 的 pageStart ≤ referencesStartPage |
| 页码/页眉污染 | 页码映射单调，页眉未形成孤立章节 |
| 乱码 | 2208 被拒绝，不进入 Evidence |
| 表格数值被拆散 | 1106/2206 的数值文本保留在正文块；未做结构表格重建（见局限） |
| 公式/上下标 | 公式文本可提取，但复杂公式可能丢上下标语义（见局限） |
| DOI/arXiv | 首页 arXiv 标识可提取；无首页 DOI 时留空，不拿参考文献 DOI 冒充 |
| 分块破坏结论 | 1400 字分块；真实 PDF 结论段可定位页码/章节 |

## 4. 真实 PDF → 研究链路

`tools/v1-9-e2e-test.js` 使用 1106.4307v1 真实 PDF：

- 解析 → chunks → 全文 Evidence；
- 每块 `evidenceId` 唯一（修复前同章节多块均为 `ev_f`）；
- 全文 Evidence 不含参考文献；
- Claims 生成并带 `support.eid`；
- Reducer/Report 生成；
- 结论 `evidenceRefs` 全部可追溯；
- 报告保留 gaps/limitations；
- 反馈诊断带 paper/evidence/claim/PDF 状态。

E2E 结果：**31/31 PASS**。

## 5. 失败分类

| 错误码 | 触发 | 是否伪造全文 |
|---|---|---|
| `pdf_encrypted` | `/Encrypt` | 否 |
| `pdf_no_text` | 可提取文本过短 | 否 |
| `pdf_cid_unsupported` | CID 无 ToUnicode | 否 |
| `pdf_corrupt` | 对象结构损坏/objectMap 抛错 | 否 |
| `pdf_unsupported_encoding` | 高符号/低字母比例，疑似编码错误 | 否 |
| `pdf_ocr_required`（detailCode） | 无文本且含图片对象 | 否 |
| `pdf_too_large` | 超过 24 MB | 否 |
| `pdf_extraction_failed` | 现有链路未单独抛出；由 corrupt/encoding 覆盖 | 否 |

## 6. 尚未取得的真实样本与限制

| 项 | 状态 | 说明 |
|---|---|---|
| 真实扫描版 PDF | BLOCKED_SAMPLE | 当前没有合法公开的真实扫描样本；合成扫描样本仅验证 `pdf_no_text`，未冒充真实 |
| OCR | 未实现 | 不引入大型新依赖；`pdf_ocr_required` 只是分类，不做 OCR |
| 真实复杂 CID 成功解析 | BLOCKED_SAMPLE | 2208 真实样本编码异常，本轮选择拒绝；未取得可正确 ToUnicode 的复杂 CID 成功样本 |
| 表格结构重建 | 未实现 | 文本可提取，但不还原单元格结构 |
| 复杂公式语义 | 局限 | 上下标/分式可能丢失；不做 MathML 重建 |
| 页眉/页脚去除 | 部分 | 页码映射与章节过滤已修；极端双栏版式仍可能有少量页眉文本 |
