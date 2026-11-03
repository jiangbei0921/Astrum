# ASTRUM 真实天文研究基准集与执行结果

> 日期：2026-11-03
> 环境：Windows / Node 24.19 / 本地离线 + 真实公开网络（OpenAlex / Semantic Scholar / arXiv / SIMBAD）
> 权威结果：`tools/fixtures/research-benchmark-results.json`（逐案例记录，随代码提交）
> 结论：46 案例 / 15 类；完整运行 46/46 PASS；外部限流单独标 `BLOCKED_EXTERNAL`，不写成 PASS。

---

## 1. 基准设计

### 1.1 约束

- 保留 13 个固定 Agent、Muse 控制器、Tool-Centric 架构、7 套输出模板（T-A—T-G）、MEMORY/Thread/TaskStore、旧接口、ADR-001 调用预算。
- 不新增 Agent、不改变模块职责、不启动 V1.6。
- 测试文件独立：`tools/v1-7-research-benchmark.js`；数据文件独立：`tools/fixtures/research-benchmark-results.json`。
- 每个案例记录：编号、用户问题、预期、实际、证据来源、Agent、工具、耗时、是否通过、失败原因。
- 不只检查答案是否生成：同时检查模板、章节、关键词、目标数、Agent、工具、研究证据引用可追溯、无数值伪影、论文标题/链接/年份、论文无重复。

### 1.2 15 类能力

| 类别 | 案例数 | 覆盖问题 |
|---|---:|---|
| 基础天文知识 | 5 | M42、黑洞、太阳系结构、超新星能量、太阳活动 |
| 名称与编号识别 | 4 | M42、NGC1976、猎户座大星云、M31/M33 |
| 天体参数 | 6 | M42/M31 距离、木星质量/直径、土星质量、太阳温度 |
| 多目标比较 | 4 | M42/M31、M31/M33、木星/土星、M4/M42 |
| 多轮上下文 | 2 | M42 是什么 → 它多远 |
| 复杂问题拆解 | 3 | 红色原因+怎么拍、比较+今晚建议、JWST 发现与争议 |
| 多 Agent 协作 | 3 | 今晚可见、80mm 能否拍、太阳活动影响 |
| 论文搜索 | 4 | M42 距离、系外行星大气、星系形成、JWST |
| 论文结果比较 | 2 | M42 距离是否一致、M31 测距方法 |
| PDF 解析 | 2 | 混合排版 PDF、扫描版 PDF 明确失败 |
| 器材规划 | 3 | 200mm 拍摄参数、80mm 能否拍、新手选购 |
| 地点与时间规划 | 3 | 北京/上海今晚、指定日期 |
| 研究结论生成 | 2 | M31/M33/M42 参数与难度、M42 距离论文一致性 |
| 搜索与 Provider 异常恢复 | 2 | 断网研究 M42、断网比较 M31/M33 |
| 长任务执行 | 1 | 四目标比较 |

### 1.3 完整研究任务（5 类）

1. `M31、M33、M42 的物理参数和观测难度比较` → T-D，3 目标，含距离/类型/星等/可见性。
2. `JWST 对早期宇宙星系的主要发现及争议` → T-F，真实论文与争议证据。
3. `不同论文对 M42 距离测量结果的比较` → T-E，真实距离论文与摘要数值。
4. `系外行星大气观测技术与代表性研究` → T-E，真实系外行星大气论文。
5. `今晚在北京用 200mm 望远镜拍摄 M42，应该怎么设置参数` → 拍摄方案（焦距/视场/采样/曝光/堆栈/跟踪）。

每个任务经过：问题理解 → 任务拆解 → Agent 调度 → 资料检索 → 证据收集 → 结果分析 → 最终报告。

---

## 2. 执行结果

### 2.1 分类结果

| 类别 | 案例 | PASS | FAIL | SKIP | 总耗时(ms) | 最大单例(ms) |
|---|---:|---:|---:|---:|---:|---:|
| 基础天文知识 | 5 | 5 | 0 | 0 | 48 | 37 |
| 名称与编号 | 4 | 4 | 0 | 0 | 73 | 41 |
| 天体参数 | 6 | 6 | 0 | 0 | 56 | 11 |
| 多目标比较 | 4 | 4 | 0 | 0 | 88 | 23 |
| 多轮上下文 | 2 | 2 | 0 | 0 | 22 | 11 |
| 复杂拆解 | 3 | 3 | 0 | 0 | 5201 | 5135 |
| 多 Agent 协作 | 3 | 3 | 0 | 0 | 462 | 456 |
| 论文搜索 | 4 | 4 | 0 | 0 | 40069 | 25062 |
| 论文比较 | 2 | 2 | 0 | 0 | 40645 | 20611 |
| PDF 解析 | 2 | 2 | 0 | 0 | 10 | 9 |
| 器材规划 | 3 | 3 | 0 | 0 | 10 | 8 |
| 地点与时间 | 3 | 3 | 0 | 0 | 1363 | 459 |
| 研究结论 | 2 | 2 | 0 | 0 | 25066 | 25039 |
| 异常恢复 | 2 | 2 | 0 | 0 | 30 | 19 |
| 长任务 | 1 | 1 | 0 | 0 | 34 | 34 |
| **合计** | **46** | **46** | **0** | **0** | — | — |

> 离线运行（`--offline`）：38 PASS / 8 SKIP；8 个网络研究案例明确标 `SKIPPED_OFFLINE`，不伪造论文。
> 网络复跑若遇 Provider 限流/冷却，无证据案例标 `BLOCKED_EXTERNAL`，不写成 PASS。

### 2.2 逐案例结果

| 编号 | 类别 | 问题 | 实际模板/路径 | 结果 |
|---|---|---|---|---|
| B01 | 基础知识 | M42 是什么？ | legacy | PASS |
| B02 | 基础知识 | 什么是黑洞？ | legacy | PASS |
| B03 | 基础知识 | 太阳系的结构是怎样的？ | legacy | PASS |
| B04 | 基础知识 | 超新星爆发能产生多大的能量？ | legacy | PASS |
| B05 | 基础知识 | 太阳活动对地球有什么影响？ | legacy | PASS |
| N01 | 名称编号 | M42 在哪？ | legacy | PASS |
| N02 | 名称编号 | NGC1976 是什么？ | legacy | PASS |
| N03 | 名称编号 | 猎户座大星云怎么找？ | legacy | PASS |
| N04 | 名称编号 | M31 和 M33 是哪个星系？ | control / compare | PASS |
| P01 | 天体参数 | M42 的距离是多少？ | legacy | PASS |
| P02 | 天体参数 | M31 的距离是多少？ | legacy | PASS |
| P03 | 天体参数 | 木星的质量是多少？ | legacy | PASS |
| P04 | 天体参数 | 太阳表面温度是多少？ | legacy | PASS |
| P05 | 天体参数 | 木星的直径是多少？ | legacy | PASS |
| P06 | 天体参数 | 土星的质量是多少？ | legacy | PASS |
| C01 | 多目标比较 | M42 和 M31 有什么区别？ | control / compare | PASS |
| C02 | 多目标比较 | 比较 M31 和 M33 的观测难度与距离测量 | control / T-D | PASS |
| C03 | 多目标比较 | 木星和土星哪个更适合观测？ | control / T-D | PASS |
| C04 | 多目标比较 | M4 和 M42 哪个更适合拍摄？ | control / T-D | PASS |
| M01 | 多轮上下文 | M42 是什么？ | legacy | PASS |
| M02 | 多轮上下文 | 它多远？ | legacy + memory | PASS |
| D01 | 复杂拆解 | M42 为什么是红色的，并且应该怎么拍？ | control | PASS |
| D02 | 复杂拆解 | 比较 M31 和 M33 并给出今晚的观测建议 | control / T-D | PASS |
| D03 | 复杂拆解 | JWST 对早期宇宙星系的主要发现及争议 | control / T-F | PASS |
| A01 | 多 Agent | 今晚在北京能看到什么？ | legacy | PASS |
| A02 | 多 Agent | M42 用 80mm 能拍吗？ | legacy | PASS |
| A03 | 多 Agent | 太阳活动对地球有什么影响？ | legacy | PASS |
| S01 | 论文搜索 | 不同论文对 M42 距离测量结果的比较 | control / T-E | PASS |
| S02 | 论文搜索 | 系外行星大气观测技术与代表性研究 | control / T-E | PASS |
| S03 | 论文搜索 | 星系形成的最新研究进展 | control / T-E | PASS |
| S04 | 论文搜索 | JWST 对早期宇宙星系的主要发现 | control / T-E | PASS |
| S05 | 论文比较 | M42 距离测量是否一致？ | control / T-E | PASS |
| S06 | 论文比较 | M31 距离测量方法比较 | control / T-E | PASS |
| F01 | PDF 解析 | 混合排版 fixture | pdf-text | PASS |
| F02 | PDF 解析 | 扫描版 fixture | `pdf_no_text` 明确失败 | PASS |
| G01 | 器材规划 | 200mm 拍摄 M42 参数 | legacy | PASS |
| G02 | 器材规划 | 80mm 能否拍 M42 | legacy | PASS |
| G03 | 器材规划 | 新手买什么望远镜 | legacy | PASS |
| T01 | 地点时间 | 今晚北京适合拍摄什么？ | legacy | PASS |
| T02 | 地点时间 | 上海今晚能看到什么？ | legacy | PASS |
| T03 | 地点时间 | 2026-12-31 北京能看到什么？ | legacy | PASS |
| R01 | 研究结论 | 比较 M31、M33 和 M42 的物理参数与观测难度 | control / T-D | PASS |
| R02 | 研究结论 | M42 距离 + 不同论文是否一致 | control / T-E | PASS |
| E01 | 异常恢复 | 断网研究 M42 距离 | control，无伪造论文 | PASS |
| E02 | 异常恢复 | 断网比较 M31 和 M33 | control / T-D | PASS |
| L01 | 长任务 | 比较 M42、M31、M33、M4 | control / T-D，4 目标 | PASS |

> Agent、工具、耗时、证据 ID、论文元数据、结论与 gaps 在 `research-benchmark-results.json` 中逐案例保存。

### 2.3 真实研究证据样例

| 案例 | 论文（标题 / 年份 / DOI） | 结论与边界 |
|---|---|---|
| S01/S05/R02 | The distance to the Orion Nebula（2007，10.1051/0004-6361:20078247）；The distance to the Orion Nebula cluster（2007，10.1111/j.1365-2966.2007.11471.x） | 第二篇摘要给出 440 ± 34 pc，剔除带盘恒星后 392 ± 32 pc；第一篇 OpenAlex 摘要缺少数值，明确写“不能据此引用具体数值”，不补造 414 pc |
| S06 | The distance to the Andromeda galaxy from eclipsing binaries（2010，10.1051/0004-6361/200913299）；First Determination of the Distance and Fundamental Properties of an Eclipsing Binary in the Andromeda Galaxy（2005，10.1086/499161） | 744 ± 33 kpc 与 772 ± 44 kpc；1σ 内相容，不标记冲突；超过 1σ 才进入“证据冲突” |
| S04 | The cosmic timeline implied by the JWST high-redshift galaxies（2023，10.1093/mnrasl/slad025）；JWST high-redshift galaxy constraints on warm and cold dark matter models（2023，10.1051/0004-6361/202345851）；JWST high redshift galaxy observations have a strong tension with Planck CMB measurements（2023，10.48550/arxiv.2301.00347） | 高红移星系与 ΛCDM/Planck 的张力；全部 `abstractOnly` |
| S02 | Rapid characterization of exoplanet atmospheres with ETSI（2024，10.1117/1.jatis.10.4.045005）；Effect of centrifugal force on transmission spectroscopy（2023，10.1093/mnrasl/slad058）；Ground-based Reconnaissance Observations of 21 Exoplanet Atmospheres（2025，10.3847/1538-3881/ada557） | 透射光谱技术、21 颗系外行星大气观测；摘要级证据 |
| S03 | Galaxy Formation and Evolution: Recent Progress（2001，10.48550/arxiv.astro-ph/0102056）；Recent progress in simulating galaxy formation（2018，10.1038/s41550-018-0427-y）；Advancement in space-based infrared telescopes…（2025，10.1360/csb-2025-0511） | 星系形成综述、模拟进展、2025 空间红外综述 |

### 2.4 性能实测

| 场景 | 实测 |
|---|---|
| 冷启动（Node 模块加载） | 84.54 ms |
| Router | avg 0.23 ms / p95 0.62 ms |
| Planner | avg 0.22 ms / p95 0.66 ms |
| 本地 Control | avg 10.11 ms / p95 7.47 ms |
| 报告生成（100 证据） | avg 3.33 ms / p95 4.88 ms |
| TaskStore 200 条 | 64.22 ms |
| 本地问答 | 1–600 ms |
| 主题研究（JWST/系外行星/星系形成） | 1.5–7.2 s |
| 目标+距离论文研究 | 20–25 s（受外部端点超时/限流影响） |
| 长任务 smoke | 3 分钟 / 997 任务 / 0 失败 / 页面错误 0 |
| 线上首屏可交互（GitHub Pages，本网络） | 3.07 s（53 个脚本 defer 并行；优化前同环境 >220 s） |
| 线上多目标对比 | 2 个目标卡，M31 与 M33 均在页面中渲染 |

### 2.5 线上验收（2026-11-03）

| 项 | 结果 |
|---|---|
| 功能提交 | `e0e7842ce288ad1231ccb57d970578ff61fec241` |
| test Run | `41571532062` success |
| pages Run | `41571802143` success |
| 线上 `version.json` | commit `e0e7842`、dirty=false、runId 41571802143 |
| 首页/核心资源 | `/` 200、`core/app.js` 200 |
| 开发文件隔离 | `tools/selftest.js` 404、`docs/architecture/00-README.md` 404 |
| 线上问答 | “木星的直径是多少？”返回 139,820 km |
| 线上对比 | “比较 M31 和 M33…”渲染 2 个目标卡，含距离/可见性 |
| 性能 | 首屏可交互 3.07 s；53 个外部脚本在 Pages 产物中 `defer` 并行下载，源码/CI 仍阻塞加载 |


---

## 3. 证据质量检查

| # | 检查项 | 结果 | 实际证据/处理 |
|---|---|---|---|
| 1 | 论文真实存在 | PASS | 保留论文均有 DOI/arXiv/OpenAlex 记录；无 DOI 记录在已有 2 篇可信论文时剔除 |
| 2 | 标题/作者/年份准确 | PASS | 标题来自 Provider 元数据；年份缺失的论文被移除或标“日期未知” |
| 3 | 链接指向正确资料 | PASS | DOI 链接 `https://doi.org/...`；arXiv `10.48550/arXiv...`；`/pdf` 与 DOI 合并 |
| 4 | 引用内容支持结论 | PASS | 每条结论带 `evidenceRefs`；基准检查全部可追溯 |
| 5 | 数值与原文一致 | PASS（有边界） | 440 ± 34 pc、744 ± 33 kpc、772 ± 44 kpc 均来自摘要；摘要缺数值时明确警告，不补造 |
| 6 | 不用搜索摘要冒充全文 | PASS | `abstractOnly=true`；报告 gap/limitation 写明“仅摘要，未获取全文” |
| 7 | 不同论文分歧准确呈现 | PASS | 定量 Claim 按 `实体|量纲` 分组；超过 1σ 才冲突；M31 两值 1σ 内不误报 |
| 8 | 无法获取全文时明确标注 | PASS | “2/3 篇论文仅获得摘要，未获取全文”写入 boundary |
| 9 | 无虚构论文/作者/数据 | PASS | 无数值伪影；无 DOI 记录不进入结论；不补造 414 pc |
| 10 | 来源与结论对应关系保留 | PASS | 结论 `evidenceRefs` + 论文表 + sources 三元对应 |

已知外部数据缺陷：

- OpenAlex 对 `10.1051/0004-6361:20078247` 的摘要本身缺少数值（`to be pc.`）；系统明确警告，不猜值。
- 本轮论文均为摘要级；出版社 PDF 403/反爬，未获得全文。
- Semantic Scholar 匿名调用 429 限流；OpenAlex 偶发冷却；基准标 `BLOCKED_EXTERNAL`。

---

## 4. 本轮发现并修复的缺陷

| # | 缺陷 | 根因 | 修复 | 测试 |
|---|---|---|---|---|
| 1 | 木星直径答成可见窗口 | `KW.knowledge` 缺少“直径/公转/自转/周期/卫星” | 扩展知识意图词 | P05 |
| 2 | 行星参数展开影响旧输出 | BODY_INFO 无条件展开 | 限定 knowledge/intro | P0-03 53/53 |
| 3 | JWST 争议答成议题索引 | 别名命中“哈勃与韦布的区别” + “争议”触发泛索引 | 早期宇宙别名 + 取消泛索引触发 | D03/S04 |
| 4 | 主题检索跑题 | 整句中文/逐词直译 | 主题检索式收敛 + tension | S01–S06 |
| 5 | 主题研究白等 SIMBAD | 无坐标仍执行可选步骤 | 跳过 t1，保留 t2/t3 | D03/S04 |
| 6 | 论文重复 | 跨 Provider evidenceId 不同 | 标题归一化去重 | S01/S06 |
| 7 | 无 DOI 非学术记录 | 只看 evidenceId | 可信论文 ≥2 时剔除无标识记录 | D03 |
| 8 | 摘要数值截断 | 600 字截断 + slice(0,320) | 1600 字 + 关键句 + 缺数值警告 | Q8 |
| 9 | M31 误报冲突 | 不确定性未换算单位 | value 与 uncertainty 同步换算 | Q9.4 |
| 10 | 主题词列表冒充摘要 | Provider concepts 进入 abstract | 无句号短词列表不生成结论 | Q8.4 |

修改文件：`core/agents.js`、`core/router.js`、`core/planner.js`、`core/claims.js`、`core/reducer.js`、`core/research.js`、`core/sources.js`、`core/compose-adapter.js`、`core/registry.js`、`data/bodies.js`、`data/knowledge.js`、`tools/v1-6-research-quality-test.js`、`tools/v1-4-ci-test.js`、`.github/workflows/test.yml`、新增 `tools/v1-7-research-benchmark.js`。

---

## 5. 复现方式

```powershell
# 离线子集（CI 使用）
node tools/v1-7-research-benchmark.js --offline

# 完整真实网络（结果写 JSON）
node tools/v1-7-research-benchmark.js --json

# 只跑指定案例（排障用）
node tools/v1-7-research-benchmark.js --only=S01,S04,S06
```

失败/跳过口径：

- `FAIL`：答案生成但研究过程/证据/模板不满足要求；
- `SKIP`：离线跳过，或外部限流/超时导致无证据，标 `BLOCKED_EXTERNAL`；
- 绝不把外部网络失败写成 PASS。

---

## 6. 结论

- 46 案例 / 15 类，完整运行 46/46 PASS；离线 38 PASS + 8 SKIP。
- 5 类完整研究任务均可完成：理解 → 拆解 → 调度 → 检索 → 证据 → 结论 → 报告。
- 研究证据可追溯到 DOI/arXiv 与原摘要；摘要缺数值、无全文、外部限流均明确标注。
- 多 Agent 协作有效：普通问答 1–2 个 Agent；比较/研究 4–6 个 Agent；无重复模板或无效 Agent。
- 本轮修复 10 类真实缺陷，均有对应测试；未新增 Agent、未改变 7 模板、未启动 V1.6。
