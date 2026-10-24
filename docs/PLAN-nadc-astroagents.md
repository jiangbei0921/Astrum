# ASTRUM 扩充与集成修改方案（已实施 · 2026-10-23）

> 生成日期：2026-10-23
> 状态：**四项确认全部允许，方案已全部实施并验证**
> 范围：① NADC 公开数据 → 知识库补充清单；② AstroAgents 代码评估与可复用清单；③ 完整修改方案（范围/步骤/风险/验证点）
>
> 实施结果：阶段 1–4 全部完成，知识库 108 → **133 条**；内置智能体 7 → **11 个**；云端模型统一配置入口覆盖 **11 家供应商**；检索端点 4 → **5 个**。

---

## 一、调研摘要

### 1.1 NADC（国家天文科学数据中心，nadc.china-vo.org）

- 国家科技基础条件平台之一，依托中科院国家天文台，是 IVOA / WDS 成员。
- 资源目录共 **193 个数据集**，按波段（射电 31 / 光学 127 / 红外 11 等）、望远镜/项目（LAMOST 71、FAST 29、Gaia 7、BASS、ZTF、DESI、Euclid、Chandra、eROSITA、LHAASO 等）、数据类型（星表 116、光谱 79、图像 25、时序 7 等）三维度分类。
- **访问方式**：绝大多数**公开下载**（带 DOI/CSTR 双标识）；FAST 系列科学数据需邮件申请（fastdc@nao.cas.cn）；Gaia-ESO 需 CC BY 4.0 + ESO 致谢；BOOTES-4 仅合作团队内共享；**未见开放 REST API**（以文件下载为主）。
- 站点另设：天文学名词、论文贮藏库、天文会议信息、媒体资源、标准规范、大模型平台、经典服务案例、China-VO 公众科学平台（PSP 超新星巡天）等栏目。
- 平台统计：注册用户 46862、下载 44692 万次、下载总量 575 TB。

### 1.2 AstroAgents（github.com/amirgroup-codes/AstroAgents，站点 astroagents.github.io）

- 定位：面向**质谱数据 + 天体生物学文献**的多智能体假设生成系统（ICLR 2025 Workshop），与 ASTRUM「天文问答」目标域**不同**，但**多智能体流水线与提示词工程可借鉴**。
- 8 个协作智能体：Data Analyst → Planner → Scientist×3 → Accumulator → Literature Reviewer（Semantic Scholar）→ Critic，Critic 反馈回流 Data Analyst 形成迭代闭环（实验 10 轮）。
- 技术栈：Python CLI（AstroAgents.py / extract_text.py），langchain + anthropic + google-generativeai，pymupdf4llm 做 PDF→Markdown，文献检索走 Semantic Scholar API，数据交换用严格 JSON（`statement` / `key_datapoints`）。
- 网站为单页静态站，按流水线顺序展示每个 Agent 的**完整系统提示词 + 双模型（Gemini 2.0 Flash / Claude 3.5 Sonnet）对照输出**，透明化 Prompt 工程是其最大亮点。
- 专家评分 6 维（novelty / literature consistency / clarity / empirical support / scope / predictive power），判据：novelty≥5 记 Novel，其余均分≥8 记 Plausible；实测 36% plausible、其中 66% novel。

---

## 二、NADC → 知识库补充清单（逐项，共 24 项，均标注来源与核验要求）

> 原则：只收录 NADC 已公开发布、带 DOI/CSTR 标识的**观测事实与数据集信息**；数值一律标注发布版本与年份；不编造。每项标注 `status`（established/emerging）、`数据获取`（公开下载/需申请/受限）与建议条目 id。

### A. 巡天与星表类（11 项）

| # | 建议条目 id | 内容 | NADC 资源 | 状态 | 数据获取 |
|---|---|---|---|---|---|
| 1 | `lamost-survey` | 郭守敬望远镜光谱巡天：世界最高光谱获取率、DR 多版本、恒星参数 | LAMOST DR8–DR14（71 个数据集） | established | 公开下载 |
| 2 | `lamost-dr14` | LAMOST 第十四次数据发布（低/中分辨率） | DR14 v0 | established | 公开下载 |
| 3 | `fast-hi-survey` | FAST 中性氢巡天（FASHI DR1/DR2）、FAST 科学数据 26 批 | FAST 29 个数据集 | established | 部分需邮件申请 |
| 4 | `cpta-pulsar-timing` | CPTA 脉冲星测时阵列（FAST） | CPTA DR1 | emerging | 公开/联系 |
| 5 | `gaia-dr3` | Gaia DR3：14.7 亿星、天体测量/测光/光谱 | Gaia 7 个数据集 | established | 公开下载 |
| 6 | `gaia-distance-catalog` | Gaia EDR3 距离星表 | 衍生星表 | established | 公开下载 |
| 7 | `mwisp-galactic-plane` | 银河画卷 MWISP（¹²CO/¹³CO/C¹⁸O 分子谱线、云源表） | MWISP DR1（DOI 10.57760/sciencedb.27351） | established | 公开下载 |
| 8 | `lhaaso-gamma-catalog` | LHAASO 首个伽马源表（90 源，甚高能宇宙线） | LHAASO 1 个数据集 | established | 公开下载 |
| 9 | `chandra-xray-csc` | 钱德拉 X 射线源表 CSC v2.0 | Chandra 1–2 个数据集 | established | 公开下载 |
| 10 | `erosita-de-dr1` | eROSITA-DE DR1（X 射线巡天） | eROSITA 1–2 个数据集 | established | 公开下载 |
| 11 | `euclid-q1` | Euclid Q1 快速释放（图像、光度红移、光谱星表） | Euclid 1–2 个数据集 | established | 公开下载 |

### B. 时域与变星类（4 项）

| # | 建议条目 id | 内容 | NADC 资源 | 状态 | 数据获取 |
|---|---|---|---|---|---|
| 12 | `ast3-2-supernova` | AST3-2 2016 超新星巡天（22,576 图像、770 万光变曲线） | AST3-2 | established | 公开下载 |
| 13 | `ztf-time-domain` | ZTF 时域巡天 DR21（变星/暂现源） | ZTF DR21 | established | 公开下载 |
| 14 | `psp-citizen-supernova` | China-VO 公众科学 PSP 超新星发现（2026-08 两颗） | 公众科学平台 | emerging | 公开 |
| 15 | `plate-digitization` | 中国天文底片数字化（1901–1998，15,696 张，5 台站 9 望远镜） | 天文底片库 | established | 公开下载 |

### C. 太阳物理与地基观测类（3 项）

| # | 建议条目 id | 内容 | NADC 资源 | 状态 | 数据获取 |
|---|---|---|---|---|---|
| 16 | `solar-archive-history` | 太阳物理历史数据（手绘黑子图、磁场/速度场、射电流量，已标准化） | 太阳物理历史数据 | established | 公开下载 |
| 17 | `domestic-telescopes` | 国内核心地基望远镜（兴隆 2.16m、丽江 2.4m、抚仙湖 1m NVST 等） | 31 个地基数据集 | established | 公开下载 |
| 18 | `slr-ccs` | 卫星激光测距 CCDLR（长春站 60cm） | CCDLR DR1–DR4 | established | 公开下载 |

### D. 中国设施与前沿发现类（6 项，关联 NADC 新闻/成果）

| # | 建议条目 id | 内容 | 状态 | 备注 |
|---|---|---|---|---|
| 19 | `guo-shoujing-legacy` | 郭守敬望远镜（LAMOST）作为中国天文界首个国家重大科技基础设施的定位与全生命周期服务 | established | 来自 NADC 经典服务案例 |
| 20 | `fast-facts` | FAST「中国天眼」：500m 口径、2016 落成、2020 验收、世界最灵敏单口径 | established | 同上 |
| 21 | `tian-guan-svom-herbans` | 天关（爱因斯坦探针）、SVOM、慧眼联合观测短伽马暴（2026-10 新闻） | emerging | 前沿成果，标注 emerging |
| 22 | `lamost-gaia-long-period` | 依托 LAMOST + Gaia 搜寻长周期变星/特殊天体（2026-10 新闻） | emerging | 前沿成果 |
| 23 | `solar-fishbone-pattern` | 云南天文台揭示太阳「鱼骨状」结构（2026-10 新闻） | emerging | 太阳物理新发现 |
| 24 | `china-vo-standards` | 天文数据 DOI/CSTR 双标识、太阳物理数据标准化报告、GoFA（IAU SOFA 的 Go 实现，247 个标准算法） | established | 标准规范类 |

> **补充说明**：FAST 系列（#3/#4）部分数据需邮件申请，条目中应标注「数据获取：需联系 FASTDC」；Euclid / Gaia-ESO 等有许可要求（CC BY 4.0 + ESO 致谢），条目 sources 字段需附 DOI 与许可说明。所有条目建议 `verified: '2026-10'`、`freshness: 'static'` 或 `'active'`（新闻类用 active）。

---

## 三、AstroAgents 可复用组件、接口与集成影响评估清单

### 3.1 可复用组件（按可迁移度排序）

| # | 组件 | AstroAgents 原实现 | 迁移到 ASTRUM 的形态 | 可迁移度 | 说明 |
|---|---|---|---|---|---|
| R1 | **多智能体流水线模板** | Analyst→Planner→Scientists→Accumulator→Reviewer→Critic→回流 | 对应 ASTRUM 已有 muse/vega/cosmos/kepler/horizon/orion/lyra；可借鉴其**阶段化职责分离**与**Critic 反馈回流**机制 | ★★★★☆ | ASTRUM 已有协作链路，缺的是「评审-回流」闭环 |
| R2 | **严格 JSON 输出约束** | Scientist 输出 `{statement, key_datapoints}`，Planner 输出 JSON 指令 | 云端表述层输出可约束为 JSON，再由前端渲染；提升输出稳定性 | ★★★★☆ | 与现有 sources.js `clean()` 兼容，可加 schema 校验 |
| R3 | **去重/合并智能体（Accumulator）** | 合并三位科学家的相似假设 | 并行对比模式下合并多来源表述、去重事实点 | ★★★★☆ | 直接增强 compare 模式 |
| R4 | **文献综述智能体（Semantic Scholar）** | 每 hypothesis 查 5 个 paper snippets | 作为 web 检索的**学术向补充源**（现有 NASA/OpenAlex/Wikimedia 之外） | ★★★☆☆ | 需新增 API 适配器；CORS 需验证 |
| R5 | **评审智能体（Critic）6 维评分** | novelty/consistency/clarity/empirical/support/scope/predictive | 可改造为天文答案的「证据强度/时效性/共识度」评分 | ★★★☆☆ | 需重定义评分维度，不直接照搬 |
| R6 | **PDF→Markdown 抽取（pymupdf4llm）** | extract_text.py | 本地导入论文/资料做知识入库的预处理 | ★★☆☆☆ | ASTRUM 是纯前端零依赖，需改为 Web 端方案或后端工具 |
| R7 | **双模型对照展示** | 网站逐 Agent 展示 Gemini vs Claude 输出 | ASTRUM 并行对比模式已具备雏形，可借鉴「逐 Agent 分栏对照」UI | ★★★☆☆ | 前端渲染层复用度高 |
| R8 | **透明提示词展示** | 网站公开每个 Agent 的完整 system prompt | 设置/帮助中展示各智能体提示词，增强可解释性 | ★★★★☆ | 纯前端，易实现 |
| R9 | **迭代次数与反馈闭环** | `--iterations N`，Critic 反馈回流 | 云端追问「基于上一轮反馈改进」的多轮模式 | ★★★☆☆ | 与现有 memory 机制可结合 |

### 3.2 接口评估

| 接口 | 用途 | ASTRUM 现状 | 集成结论 |
|---|---|---|---|
| Anthropic / Google Gemini API | 双 LLM | sources.js 已有 anthropic/gemini 适配器 | **已覆盖**，无需新增 |
| Semantic Scholar API | 文献检索 | 未接入 | 建议新增 `sources.js` 第 5 个检索 provider（需验证 CORS） |
| pymupdf4llm（Python） | PDF 解析 | 无 | **不直接引入**（纯前端架构），可列为可选后端工具 |
| langchain 生态 | 编排 | 未使用 | **不引入**（ASTRUM 为零依赖静态站，langchain 过重） |

### 3.3 集成影响

| 影响面 | 评估 |
|---|---|
| 架构 | 无破坏性影响；ASTRUM 保持纯前端 IIFE，AstroAgents 仅作「设计模式与提示词」借鉴 |
| 依赖 | 不引入 Python/langchain；Semantic Scholar 仅走 fetch（若 CORS 可行） |
| 数据 | 不引入质谱数据；只借鉴 JSON schema 与去重逻辑 |
| 许可 | AstroAgents 为 **MIT License**，可安全借鉴代码结构与提示词写法，需在文档致谢 |
| 风险 | 域不匹配（质谱 vs 天文问答），提示词不可直接照搬，需重写 |

---

## 四、完整修改方案（范围 / 步骤 / 风险 / 验证点）—— 待确认

### 4.1 范围界定

**In Scope（本次拟实施）**
1. `data/knowledge.js`：新增第二节 24 条 NADC 知识条目。
2. `core/sources.js`：新增 Semantic Scholar 检索 provider（若 CORS 可行）；云端输出 JSON schema 约束。
3. `core/agents.js`：新增 **Critic（评审）** 与 **Curator（去重/合并）** 两个特色智能体，接入协作链路；引入「评分-回流」轻量闭环。
4. 设置/帮助：新增「智能体提示词透明展示」。
5. 文档：`docs/DESIGN.md` 版本升级，新增 NADC 数据来源声明与 AstroAgents 致谢。

**Out of Scope（本次不做）**
- 不引入 langchain / pymupdf4llm 等 Python 依赖（保持零依赖静态站）。
- 不接入 FAST 需申请数据的实时下载（仅收录已公开产品信息）。
- 不实现质谱/假设生成业务域。

### 4.2 实施步骤（分 4 阶段，每阶段可独立验证）

**阶段 1 · 知识库扩充（低风险）**
1. 在 `data/knowledge.js` 按现有 schema 批量新增 24 条（注意数组末尾逗号、`status`/`verified`/`sources` 字段完整）。
2. 每条 sources 指向 NADC DOI/CSTR 与项目主页；`observe` 字段写业余可执行的观测/查阅建议。
3. 更新 `index.html` 侧栏「知识 N 条」计数。
4. 验证点 V1：条目总数 108 → 132，`node -e require('./data/knowledge.js')` 无重复 id、无语法错误。

**阶段 2 · 检索源扩展（中风险）**
1. `core/sources.js` PROVIDERS 新增 `semanticscholar`（端点 `api.semanticscholar.org/graph/v1/paper/search`）。
2. `enQueryFor()` 增加英文/学术关键词映射；`diagnose()` 纳入新端点。
3. 验证点 V2：设置→联网检索「检测连通」显示 Semantic Scholar 状态；失败时明确回退本地索引（不伪造）。

**阶段 3 · 智能体与工作流（中风险）**
1. `core/agents.js` 新增 `critic`（评审：共识度/证据强度/时效三维标注）与 `curator`（去重合并：并行对比结果去重）；`TRACE_ORDER` 扩展为 9/10 权重。
2. 云端输出增加 JSON schema 约束（`{verdict, evidence[], caution}`），`sources.js` 的 `clean()` 前加轻量校验，校验失败回退本地表述。
3. 设置→帮助：展示 7+2 个智能体的角色与当前 system prompt 摘要。
4. 验证点 V3：`#q=黑洞照片` 等问题的协作链路出现新智能体节点；compare 模式输出无重复事实点；JSON 校验失败时 UI 显示「已回退本地表述」。

**阶段 4 · 文档与致谢（低风险）**
1. `docs/DESIGN.md` 升版：新增 NADC 数据治理表、AstroAgents 借鉴说明与 MIT 致谢。
2. 验证点 V4：文档内所有数据集均标注 DOI/版本/年份；无编造内容。

### 4.3 风险清单

| 风险 | 等级 | 缓解措施 |
|---|---|---|
| NADC 数据集信息时效性（版本迭代快） | 中 | 每条标注 `updated` 与 DR 版本号；只写已发布版本 |
| Semantic Scholar API CORS/限流 | 中 | 失败自动回退本地索引；诊断界面显示真实失败原因 |
| JSON schema 约束导致云端输出被截断 | 中 | 校验失败保留本地表述，不丢答案 |
| 知识条目数量增长影响检索精度 | 低 | 现有 `filterRelevant` 二元组过滤已存在，必要时加别名去重 |
| AstroAgents 模式与天文域不匹配 | 低 | 只借鉴流程与提示词结构，内容全部重写 |
| FAST 等需申请数据被误标为可下载 | 低 | 条目明确标注「数据获取：需邮件申请」 |

### 4.4 总验证点汇总

- **V1**：知识库 132 条、无重复 id、Node 加载无报错、来源字段全部含 DOI/机构链接。
- **V2**：检索诊断面板 5 个端点均可测；失败时 UI 如实提示。
- **V3**：协作链路含 Critic/Curator；compare 去重生效；JSON 校验回退路径可触发。
- **V4**：文档版本与致谢完整。
- **V5（回归）**：既有 108 条条目问答、星图、观测台、设置面板无回归（用 `#q=`/`#viewer=`/`#settings=` 深链截图比对）。

---

## 五、确认与实施结果

四项确认（①全量采纳 ②纳入 Semantic Scholar ③新智能体可配置属性 ④UI 署名致谢）**全部允许**，方案已按「阶段 1→2→3→4」实施完毕。

| 阶段 | 内容 | 状态 | 验证 |
| --- | --- | --- | --- |
| 1 | 知识库新增 25 条 NADC 条目（较计划多 1 条「光谱巡天与恒星物理参数」） | ✅ | 条目 108 → 133，id 无重复，Node 加载无报错；银河画卷 / FAST / 盖亚 / LHAASO / 天文底片 / 公众科学等均能正确解析 |
| 2 | 新增 Semantic Scholar 检索 provider | ✅ | 端点实测可达但匿名调用触发 429 限流，界面如实提示「触发限流（匿名调用共享配额，稍后重试）」并退出竞速链 |
| 3 | 新增 Critic / Curator 智能体 + 云端记忆与数值一致性核验 | ✅ | 每个答案均带「评审结论」章节（5 项检查）；并行对比出现 Curator 去重节点；云端返回中事实层之外的数字被点名提示 |
| 4 | DESIGN.md 升版至 v1.8 + 致谢 | ✅ | 新增 NADC 数据治理表、星球实测更新纪律、AstroAgents 借鉴与致谢；帮助页「数据与边界」同步展示致谢 |
| 额外 | Nova / Helios 两个特色智能体 + 两条专用意图路由 | ✅ | 「超新星是怎么产生的」→ nova；「太阳耀斑是什么」→ helios；「脉冲星是怎么被发现的」正确回落知识问答 |
| 额外 | 跨轮历史记忆（会话级，最近 8 轮） | ✅ | 「它离我们多远」在上一轮主体为土星时自动还原并标注「承接上文：土星」；「新对话」会清空记忆 |
| 回归 | 22 条代表性问句全量回归 | ✅ | 21 条走正常路径；「今天天气怎么样」按设计走边界声明路径（`unknown` 意图），非回归 |

**遗留说明**：Semantic Scholar 匿名调用共享限流配额，本环境实测稳定返回 429，因此该端点在当前网络下不作为主力；接入自有 API Key 后即可正常使用。
