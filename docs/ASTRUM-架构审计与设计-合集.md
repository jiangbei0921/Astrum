# ASTRUM 架构审计与升级设计（合集）

> 生成日期：2026-10-30（第一轮）／2026-10-31（第二至四轮增补）  
> 来源：`docs/architecture/`（17 份独立文档合并）  
> 状态：**待审阅，未实施**。各轮均只做审计与设计，未修改任何业务代码、未新增依赖、未改动配置。

**结构说明**：00 README 作为前言；01–10 第一轮：审计与设计；11–13 第二轮：评审 / 执行安全性审计 / 修订记录；14–16 第三轮：一致性审查 / 契约规范 / 检查清单；第四轮：小范围补充修订 R4-01…R4-05（散见 05/06/09/12/14/15/16）。为保持层级正确，各篇原一级标题在本合集中降为二级。

---

## 目录

0. 文档索引
1. 现有架构审计
2. 现有架构问题诊断
3. 目标架构设计
4. Agent 职责与协作规范
5. 动态任务编排机制
6. 科学证据与验证机制
7. 技术选型与接口规范
8. 新旧架构映射
9. 分阶段迁移实施计划
10. 测试与验收标准
11. 第二轮架构评审报告
12. 执行安全性审计
13. 架构设计修订记录
14. 第三轮架构一致性审查报告
15. 架构接口与数据契约统一规范
16. 最终实施前检查清单

---

## 0. 文档索引

生成时间：2026-10-30 ｜ 状态：**待审阅，未实施**
约束：本轮仅生成文档，未修改任何业务代码、未新增依赖、未改动配置。

---

### 阅读顺序

| # | 文档 | 回答什么问题 |
|---|---|---|
| 01 | [现有架构审计](01-现有架构审计.md) | 现在有什么、怎么跑的、代码在哪 |
| 02 | [问题诊断](02-现有架构问题诊断.md) | 哪些是真问题、哪些是误判、哪些不用管 |
| 03 | [目标架构设计](03-目标架构设计.md) | 11 个模块的职责/输入输出/权限/失败处理 |
| 04 | [Agent 职责与协作规范](04-Agent职责与协作规范.md) | 谁能叫谁、冲突谁说了算、成本上限 |
| 05 | [动态任务编排机制](05-动态任务编排机制.md) | 复杂度分级、模板拆解、状态机、预算 |
| 06 | [科学证据与验证机制](06-科学证据与验证机制.md) | Claim/Evidence 结构、7 项检查、容差 |
| 07 | [技术选型与接口规范](07-技术选型与接口规范.md) | 哪些框架不引入、为什么、内部契约 |
| 08 | [新旧架构映射](08-新旧架构映射.md) | 保留/升级/新增/拆分/合并/淘汰逐项 |
| 09 | [分阶段迁移实施计划](09-分阶段迁移实施计划.md) | P0–P4 每阶段改什么、怎么验收、怎么回滚 |
| 10 | [测试与验收标准](10-测试与验收标准.md) | 10 类用例、误差、成本记录、放行门槛 |

#### 第二轮评审（2026-10-31 追加）

| # | 文档 | 回答什么问题 |
|---|---|---|
| 11 | [第二轮架构评审报告](11-第二轮架构评审报告.md) | 九个特别检查的判定、七项新机制、成本与待验证项 |
| 12 | [执行安全性审计](12-执行安全性审计.md) | 13 个 compose 的副作用矩阵、并行/重试/中断安全性、Adapter 可行性 |
| 13 | [架构设计修订记录](13-架构设计修订记录.md) | 每处修改的原因与前后差异 |

#### 第三轮一致性审查（2026-10-31 追加）

| # | 文档 | 回答什么问题 |
|---|---|---|
| 14 | [第三轮架构一致性审查报告](14-第三轮架构一致性审查报告.md) | 11 处内部矛盾的原文、裁定与处置 |
| 15 | [架构接口与数据契约统一规范](15-架构接口与数据契约统一规范.md) | **唯一权威契约**：实体字段、生命周期、恢复协议、Reducer、Token |
| 16 | [最终实施前检查清单](16-最终实施前检查清单.md) | 10 项放行判定的逐条结论 + 阻塞项 |

> **冲突处理**：01–13 与 `15` 不一致时，一律以 `15` 为准。

---

### 三条核心结论

1. **不需要重建**。计算（`astro.js`）、检索（`research.js` 已有两轮+分级+冲突检测）、契约（TIER/Qty/exec）、模式（single/compare）都在，缺的是**调度骨架**。

2. **最要紧的是三件事**（按影响排序）：
   - 没有任务状态 → 一次 ask 原子化，无法多步研究、无法续跑
   - Critic 只查结构 → "评审通过"不等于"结论正确"
   - 意图单分支 → 复合问题只能答一半

3. **实施顺序由依赖决定**：先有 TaskState 与三态评审（P0），才谈得上规划（P2）；先有 Claim 粒度（P3），Critic 才可能判真伪。

---

### 与任务书的两处重要偏差（以实际代码为准）

| 任务书假设 | 实际情况 | 影响 |
|---|---|---|
| Python 后端（FastAPI/Pydantic/Redis/MySQL/asyncio） | 纯静态浏览器应用，零依赖、无服务端 | 第七阶段的技术选型**大部分不适用**，详见 07 |
| 需要评估 8 种架构思想并尽量引入 | Tool-Centric 已是现状；Hypothesis Tournament 缺前置条件 | 03 明确了"引入/暂缓/不做"的取舍 |

---

### 明确不做

- 引入 LangGraph / CrewAI / AutoGen（成本远超收益）
- 把 13 个 Agent 扩成"更自主"的多 Agent（与可复算冲突）
- 物理拆分 `agents.js` / `app.js`（任务书禁止移动文件）
- 删除任何现有模块（含已成死代码的 `adaptive` hero 维度）

---

### 待用户决策的事项

1. 是否批准 P0（行为零变化，2–3 天）
2. 是否需要服务端（仅在接入 ADS/MAST 时才有必要）
3. `docs/DESIGN.md` 存在与本轮无关的既存差异（36 增 10 删，含表格与行尾格式），建议自行确认后决定是否保留

---

## 1. 现有架构审计

> 审计对象：`D:/AI/workbuddy_cunchu/2026-10-22-18-29-15/Astrum`
> 审计方式：静态阅读源码 + 符号提取，未执行构建、未修改任何业务代码。
> 行号基于审计时点的文件状态，后续改动可能偏移，引用时请以函数名为准。

---

### 0. 与任务书描述的差异（必须先说明）

任务书假设了一个 **Python 后端项目**（FastAPI / Pydantic / Redis / MySQL / asyncio）。实际代码与此不符：

| 任务书假设 | 实际情况 |
|---|---|
| Python 后端 | **纯静态前端**：原生 JavaScript（ES5 风格），无 Node 运行时依赖 |
| 有服务端 | **无后端**。`index.html` + `assets/app.css` + `core/*.js`，可直接 file:// 打开 |
| 框架（LangGraph 等） | 零框架、零依赖、零构建（`tools/build-standalone.js` 只做内联打包） |
| 数据库 | IndexedDB 主 + localStorage 兜底（`core/store.js:24`），无服务端库 |
| asyncio 并行 | `Promise.all`（`core/app.js:3975`） |

**这意味着**：任务书中关于 Python 技术栈的选型建议（第七阶段）大部分不适用，详见《技术选型与接口规范.md》。本审计全部结论以实际代码为准。

---

### 1. 项目结构

```
Astrum/
├─ index.html              单页入口（31 个 <script>，无模块系统，全局命名空间）
├─ privacy.html            隐私说明
├─ assets/app.css          唯一样式表（~2.5k 行，含浅色/深色两套令牌）
├─ core/                   23 个模块
├─ data/                   8 个静态数据集
├─ worker/cors-proxy.js    Cloudflare Worker（可选，绕过 CORS）
├─ tools/                  16 个脚本（11 测试 + 4 构建/诊断）
└─ docs/                   DESIGN.md（74 节设计记录）
```

#### 1.1 脚本加载顺序（`index.html:457-487`，即依赖顺序）

```
data/{catalog,knowledge,places,bodies,solarsystem,obsplan,gear,daily}
→ core/astro → core/runtime → core/fit → core/query
→ core/agents → core/sources → core/solarsystem → core/geosearch
→ core/research → core/attachments
→ core/i18n.en-{extra,settings,content,answer} → core/i18n
→ core/profile → core/simbad → core/weather
→ core/store → core/thread → core/topics → core/adaptive
→ core/app
```

**关键依赖事实**：`agents.js` 只依赖 `astro` 与 `runtime`；`research.js` 只依赖 `sources`。这两个模块可以单独在 Node 中 require 测试，是重构时最低风险的部分。

---

### 2. Agent 定义与调用关系

#### 2.1 名册（`core/agents.js:189-287`）

共 **13 个** Agent 条目：

| id | 名称 | role | 是否有独立决策能力 |
|---|---|---|---|
| muse | 缪斯 | 总控 · 意图解析与协奏 | 有（路由） |
| vega | 织女 | 知识 · 事实与依据 | **无**（只提供 kb 条目） |
| cosmos | 宇宙 | 宇宙学 | 部分（阈值与共识标签） |
| kepler | 开普勒 | 星历 · 位置与时间 | **有**（数值权威） |
| horizon | 地平 | 观测条件与器材 | 部分（打分规则） |
| orion | 猎户 | 星图与空间定位 | **无**（渲染参数） |
| lyra | 天琴 | 表达 · 语体与叙事 | 部分（语体选择） |
| nova | 新星 | 爆发天体 | 部分 |
| helios | 赫利俄斯 | 太阳与空间天气 | 部分 |
| scholar | 研读 | 论文与文献 | **无**（仅展示规则） |
| critic | 评议 | 质量检查 | 有（门槛判定） |
| curator | 编目 | 多来源去重合并 | 有（compare 专用） |
| navigator | 领航 | 定位与引导 | **无**（提示文案） |

> **审计结论**：13 个 Agent 中，真正具备"根据输入做决策"的只有 muse / kepler / critic / curator 四个。其余 8 个是**同一流水线内的领域计算函数 + 展示标签**，不具备独立决策或自主调用能力。这不一定是缺陷（符合 Tool-Centric 思路），但必须承认：**当前不是多智能体系统，是单链路管线 + 角色化输出**。

#### 2.2 调用关系（实测）

```
app.ask()  [app.js:3721]
  └→ AC.buildAnswer()  [agents.js:658]
       ├→ buildAlias()            [agents.js:300]
       ├→ resolveTargets()        [agents.js:337]
       ├→ resolveByMemory()       [agents.js:636]
       ├→ parseDate() / findCity() [agents.js:407 / 354]
       ├→ detectIntent()          [agents.js:446]
       ├→ composeXxx()            [agents.js:896 ~ 2165]（13 个）
       ├→ finalize()              [agents.js:775]
       ├→ criticReview()          [agents.js:716]
       └→ applyCustom()           [agents.js:810]
```

**Agent 之间不存在互相调用**。所有协作都是 `buildAnswer` 内部按顺序调用函数，通过共享的 `answer` 对象传递数据。没有消息总线、没有回调、没有 Agent 间协议。

#### 2.3 数据传递方式

唯一载体是 `answer` 对象（`agents.js:683`）：

```js
answer = {
  query, intent, ctx, targets,
  trace: [],           // 协作链路，元素由 step(agent, action, detail, extra) 生成
  sections: [],        // 结构化输出，kind 字段决定渲染器
  meta: {},            // confidence / status / verified / computed / review / recall
  _dateNote, _when     // 内部备注
}
```

- `sections[].kind` 的取值集合：`verdict / evidence / observe / visual / rank / mapref / boundary / consensus / review / system / web / synthesis / followup`（由 `compose*` 与 `criticReview` 产生，`app.js` 渲染器消费）。
- `trace[]` 元素结构：`{agent, action, detail, ms?}`，展示前按 `TRACE_ORDER`（`agents.js:710`）排序。

---

### 3. Muse：意图识别与分派

#### 3.1 机制：纯规则优先级链

`detectIntent(text, targets)`（`agents.js:446-492`）是 **if-else 优先级链**，依赖 11 条正则（`KW`，`agents.js:429-444`）：

```
observe / tonight / event / cosmos / knowledge / chart / gear
/ nova / helios / solar / photo
```

优先级（从高到低）：smalltalk → system-view → event(+concept 判定) → helios → nova(+原理回退) → cosmos → tonight → gear → gear-fit → chart → photo → 有实体时 observe/knowledge/intro → 无实体兜底 tonight → unknown。

#### 3.2 产出标签：15 个，映射 13 个 compose

| intent 标签 | 分派到 |
|---|---|
| smalltalk | composeSmalltalk (2131) |
| tonight | composeTonight (1180) |
| cosmos | composeCosmos (1384) |
| nova | composeNova (1476) |
| helios | composeHelios (1543) |
| event | composeEvent (1245) |
| system-view | composeSystemView (1791) |
| photo-target | composePhoto (1668) |
| gear | composeGear (1336) |
| gear-fit | composeGearFit (2063) |
| chart | composeChart (1357) |
| observe-target / knowledge-target / intro-target | **composeTarget**（默认分支，896） |
| unknown | composeFallback (2165) |

> **重要事实**：`buildAnswer` 的分派是 `if/else if` 硬编码（`agents.js:687-700`），**一个 intent 只进一个 compose**。除 compare 模式的"多来源"外，不存在"一个问题调多个领域模块"的路径。

---

### 4. 专业 Agent 的实现形态

领域的"专业 Agent"不是独立模块，而是 `compose*` 函数内部对工具函数的调用。以 Kepler 为例：

- 能力载体：`core/astro.js`（不是 agents.js）
  - `jdFromDate` (15) / `T(jd)` (17) / `obliquity` (18) / `fromLocal` (24)
  - `sun(jd)` (55) / `moon(jd)` (99) / `moonPhase` (141) / `planet(key,jd)` (190)
  - `lstHours` (228) / `altAz` (234) / `sep` (244) / `track` (251) / `sunTimes` (278)
  - `scoreTarget` (300) —— 观测价值打分
- 调用点：`composeTarget` / `composeTonight` 等内部直接调 `A.*`
- 数值封装：`core/runtime.js:80 Qty(value, unit, opts)`，`qtyAttributable` (101) 判断可归因

> **结论**：天文计算能力扎实（自研星历，非星表插值），但它是**库函数**，不是可被 Planner 编排的"工具对象"。没有 Tool Registry。

---

### 5. finalize / Critic / 自定义 Agent

#### 5.1 finalize（`agents.js:775`）
统一章节骨架、置信度、时效标签、`meta.status`。对已生成的 sections 做规范化，不改变事实内容。

#### 5.2 Critic（`agents.js:716-752`）—— 严格说是"格式 + 元数据检查"

5 项检查（`checks` 数组）：

| 检查项 | 实现方式 | 是否判断内容正确性 |
|---|---|---|
| 证据条数 | 数 `sections[].kind==='evidence'` 的 items | ❌ 只数数量 |
| 数值可复算 | 读 `meta.computed` 布尔 | ❌ 信任生产者自报 |
| 共识等级 | 读 `meta.status` 是否有值 | ❌ 只看有没有标 |
| 边界声明 | 查是否存在 `kind==='boundary'` | ❌ 只看有没有 |
| 置信度 | 读 `meta.confidence >= 0.5` | ❌ 阈值判断 |

门槛三档 `strict / balanced / open`（`cfg.critic.evidence`），strict 时会把未达标项写进 `boundary` 章节。

**审计结论：Critic 不验证"证据是否支持结论"，只验证"结构是否齐全"。** 这是与研究型 Agent 的核心差距。

#### 5.3 自定义 Agent（`agents.js:802-846`）
- `matchCustom(intent)`：按 `intents` 匹配 + `weight` 降序
- `applyCustom(a, ctx)`：**权重最高者**决定章节裁剪（evidence/observe/visual/boundary/rank/consensus 各可否）；最多 3 条 `directive` 注记
- 只能影响**展示**，不能改变数值或证据

---

### 6. 运行模式

`state.settings.mode`，取值 `single | compare`（`DEFAULTS`，`app.js:57`）。

#### single（默认）
```
buildAnswer（本地计算/知识） → payload = factsFromAnswer()
  → [若来源为云模型] Sources.generate({facts, para, tone, context, memory})
    → 模型只改写表述；sysPrompt/userPrompt 明确禁止改数值（sources.js:287-339）
```
事实（`payload.facts`）由本地产出，模型拿到的只是文本素材。

#### compare
`app.js:3944-3990`：
```js
cols = [ 检索列(S.search), 最多 1 个云模型列(S.generate) ]
busy('并行比对 ' + (cols.length + 1) + ' 个来源')
Promise.all(cols) → unshift(本地内核列) → AC.curate(...)（去重，保留差异）
```
并行是**来源维度**的，不是子任务维度。

---

### 7. 搜索、数据获取与外部工具

#### 7.1 检索（`core/research.js`）
- `plan(question, opts)` (425)：按 intent 选 profile（`PROFILES:42`，`INTENT_PROFILE:91`）、生成 round1 查询
- 默认搜索实现 `defaultSearchFn` (515)：委托 `core/sources.js` 的 `search`
- 两轮：`extractAnchors` (470) → `buildRound2Queries` (497) —— 定向补充检索
- 分级：`TYPE_WEIGHT = {encyclopedia:3, paper:3, database:3, image:1}` (324)
- 去重/排序：`dedupe` (259) / `rank` (349) / `scoreOf` (327)
- 冲突：`detectConflicts` (788)（数值 + 单位族 `UNIT_FAMILY:109`）
- 引用核验：`verifyCitations` (837)
- 综合：`synthesize` (898) → `toSections` (1049)
- 追踪：`LOG` (512)，容量 10，可通过 `__astrum.researchLog()` 查看

#### 7.2 外部数据源（实测存在）
| 源 | 文件 | 方式 |
|---|---|---|
| SIMBAD | `core/simbad.js` | TAP ADQL 同步查询（`TAP:18`）+ 本地缓存 `astrum.simbad.cache.v1` |
| 地点检索 | `core/geosearch.js` | Photon / IP 定位 |
| 天气 | `core/weather.js` | Open-Meteo |
| 论文/百科 | `core/sources.js` | OpenAlex / Semantic Scholar / Wikipedia / NASA Images |
| 云模型 | `core/sources.js` | 11 家 provider，`buildRequest` (382) |
| FITS 解析 | `core/attachments.js` | `parseFitsHeader` (60)，2880 字节块 / 80 字符卡片 |

> **审计结论**：已有专业数据源接入能力（SIMBAD 是真正的天文数据库），但**未接入** JPL Horizons / NASA ADS / MAST / MPC。当前"论文检索"依赖通用学术搜索，不是 ADS。

---

### 8. Memory / 缓存 / 上下文

| 机制 | 位置 | 范围与生命周期 |
|---|---|---|
| `MEMORY` 环形缓冲 | `agents.js:625-648` | 进程内，`setMemory/getMemory/clearMemory`；`resolveByMemory` (636) 做指代还原 |
| 会话消息 | `core/thread.js` + `core/store.js` | IndexedDB 持久化，`appendUser/appendBot`，线程级 |
| 技能记录 | `agents.js` `skillFor` + `state.skills` | 按 `intent + target` 记忆上次结论，仅用于提示 `meta.recall` |
| SIMBAD 缓存 | `simbad.js:20` | localStorage，带版本号 |
| 检索日志 | `research.js:512` | 内存，容量 10 |
| 设置/配置 | `localStorage`（`astrum.v2`，档案命名空间） | 按 profile 隔离 |

**缺口**：没有"任务状态"持久化。一次 ask 的中间结果（plan/results/eval）全部是**局部变量**，ask 返回后即销毁，刷新即失。

---

### 9. 异常、超时、重试、并行、终止

| 机制 | 状态 | 位置 |
|---|---|---|
| 超时 | ✅ 有（AbortController） | `sources.js:363 withTimeout(ms)` |
| 重试 | ❌ 无 | — |
| 单步失败降级 | ⚠️ 粗粒度：整体转 boundary 声明 | `app.js:3794-3802` |
| 部分失败 | ⚠️ 仅 compare 列级 catch | `app.js:3954-3960` |
| 并行 | ✅ 仅 compare（`Promise.all`） | `app.js:3975` |
| 终止条件 | ❌ 无（无预算、无 max steps） | — |
| 任务恢复 | ❌ 无 | — |
| 预算控制 | ❌ 无 token/调用次数上限 | — |

---

### 10. 日志、Trace、测试、配置、权限

#### 10.1 Trace
- `runtime.js:52 exec(spec)` → `{agent, action, tool, params, result, ok, check, ms}`（结构完备，但**未全链路强制写入**）
- `agents.js:597 step(agent, action, detail, extra)` → trace 展示项
- `TRACE_ORDER`（710）固定展示顺序

#### 10.2 运行统计
`app.js:2888 taskStart(type,label) / taskEnd(id,err)` → `PERF.tasks/errors`，驱动"运行状态"面板。**这是可观测性机制，不是调度器**。

#### 10.3 测试（`tools/`，11 套件 352 断言）
| 套件 | 断言数 | 覆盖 |
|---|---|---|
| selftest | 156 | 端到端：意图、答案结构、配置流、历史恢复 |
| research-test | 77 | 检索链路（离线 mock） |
| daily-test | 31 | 每日前沿 |
| settings-test | 18 | 设置两级导航 |
| store-test | 17 | 存储与档案 |
| rail-test | 17 | 布局宽度分配 |
| a11y-test | 13 | 可访问名称 + 双主题对比度 |
| skill-test | 10 | 技能复用 |
| consistency-test | 7 | 文案一致性 |
| csptest | 6 | CSP 与内联脚本 |
| geotest | — | 地理检索 |

#### 10.4 权限控制
- CSP（`index.html`）：`script-src 'self' + 1 hash`；`connect-src` 白名单约 25 个域
- 密钥：仅存本机 `localStorage`，明文（设计取舍，README 已声明）
- 数值权限：**靠 prompt 约束**（`sources.js:287-339`），无代码级硬校验

---

### 11. 前后端交互

**不存在后端**。所有"交互"是：

```
浏览器 DOM 事件 → app.js 处理 → 本地模块（同步计算）
                              ↘ 可选：fetch 第三方 API / 云模型（CORS 受限，可用 worker 代理）
→ 结果写回 DOM + IndexedDB
```

云模型调用是**浏览器直连 provider**（`sources.js:382 buildRequest`），因此受 CORS 与 CSP 双重限制，这也是 `worker/cors-proxy.js` 存在的原因。

---

### 12. 无法确认的部分（明确标注）

| 项 | 原因 |
|---|---|
| 各 `compose*` 内部完整逻辑 | 仅抽样阅读（composeTarget/Tonight/Cosmos 片段），未逐行审计 13 个函数 |
| `data/knowledge.js` 条目总数 | 只有 141 条匹配 `type:` 关键字的条目，其余结构未逐一统计 |
| `data/catalog.js` 目标数 | 字段名与本审计所用正则不匹配，未确认 |
| `core/adaptive.js` / `core/topics.js` 行为 | 判定为 UI 层，未深入（对架构升级影响低） |
| worker 实际部署状态 | 仅见源码与 README |

---

## 2. 现有架构问题诊断

> 依据《01-现有架构审计》的事实。每条结论标注证据位置。
> 分类：**P（已存在）** 确实存在、可复现；**R（潜在风险）** 当前未爆但条件成立会出问题；**N（暂不必解决）** 判断为当前阶段投入产出比低。

---

### 1. 硬编码路由

#### P1 意图识别是纯正则优先级链
`detectIntent`（`agents.js:446-492`）15 个返回标签全部由 11 条正则 + if-else 顺序决定。

**已观测的后果**：代码注释本身就记录了一次踩坑（`agents.js:487-489`）——旧实现把 `KW.observe` 里的「在哪」算进 tonight，导致任何未识别问句都被答成"今晚最值得看的是…"。这说明规则链的误判是**结构性**的，靠打补丁收敛。

**量化风险**：只要问句不含任一正则命中词，就落 `unknown` → `composeFallback`。对"帮我看看 M31 和 M33 哪个更适合 80mm 拍"这类**复合问句**，正则最多命中一个分支，无法并行。

#### P2 分派是 if/else 硬编码
`buildAnswer`（`agents.js:687-700`）13 个分支。新增能力必须改这个函数，没有注册表，也没有"多分支组合"表达方式。

#### N1 不是所有意图都该上模型
`smalltalk`、`chart`、`gear-fit` 这类确定性任务，规则比模型又快又稳。**不建议**把它们改成 LLM 分类。

---

### 2. 「角色包装」的 Agent

#### P3 名册 13 个，具备决策能力的只有 4 个
依据审计表：muse（路由）、kepler（数值）、critic（门槛）、curator（合并）有决策；其余 9 个是计算/展示函数。

具体证据：
- `vega` 无独立函数，知识检索由 `resolveTargets` + `composeTarget` 内联完成
- `orion` 决定 `visual` 章节的渲染参数（`style`），不参与推理
- `scholar` 仅在 `toSections` 里挂文献展示规则
- `navigator` 提供定位引导文案

**这不是缺陷**，符合 Tool-Centric 原则。但必须纠正表述：**不能把它当作"已达成的多 Agent 系统"**，否则后续会为"让 Agent 更像 Agent"而引入无价值的 LLM 调用。

#### R1 职责重叠
`cosmos`（宇宙学）与 `nova`（爆发天体）在"超新星"上重叠；`vega`（知识）与 `scholar`（文献）在"论文结论"上重叠。当前靠正则优先级消歧（`agents.js:467-475`），属于隐式规则，缺文档化的边界。

---

### 3. 并行与依赖

#### P4 只有 compare 并行，且是来源维度
`app.js:3975 Promise.all(cols)` 并的是"本地/检索/云模型"三列输出，**不是子任务**。

#### P5 真正可并行的任务没有被并行
以"今晚木星怎么拍 + 为什么有大红斑"为例，当前只会命中一个 intent。它天然包含两条独立子任务：
- 观测计算（Kepler：位置/窗口/器材）—— 纯本地、毫秒级
- 机制解释（知识库 + 可选检索）—— 需要检索

两者**无数据依赖**，可并行。当前架构无此能力。

#### P6 存在严格依赖的链条（不可并行）
- `resolveTargets` → `detectIntent` → `composeXxx`（意图依赖实体解析）
- `composeXxx` → `finalize` → `criticReview` → `applyCustom`（后者依赖前者产物）
- 检索：`plan` → round1 → `extractAnchors` → round2（第二轮锚点来自第一轮结果）

---

### 4. 重复调用

#### R2 同一问题的双路径重复
`buildAnswer`（本地）与 `Research.run`（检索）在 `app.js` 中是**先后串行**执行的。若某 intent 在 compose 内部已做了知识库检索，外层又跑一轮 web 检索，会重复消耗。

现状：是否重复取决于 intent，代码里没有"已覆盖"标记传递给检索层。

#### R3 模型调用无去重
`compare` 模式下每次 ask 都会对同一 payload 调一次云模型；无请求级缓存（只有 SIMBAD 有缓存）。

#### N2 重复计算可以接受
本地星历计算是毫秒级纯函数，缓存收益低、失效逻辑复杂。**不建议**为计算加缓存。

---

### 5. 权限与循环

#### P7 无循环调用风险（好）
所有 Agent 是函数，`buildAnswer` 单向调用，没有 Agent → Agent 的调用边，结构上不可能递归。**这是优点，升级时必须保住**。

#### P8 数值权限靠 prompt，不靠代码
`sources.js:287-339` 用 system prompt 要求"不得修改数值"。代码层面**没有**校验模型输出中的数字是否与 `payload.facts` 一致。

**这是当前最实质的安全缺口**：模型若忽略指令改了数字，系统不会拦截。

---

### 6. Critic 是否验证证据

#### P9 Critic 只查结构，不查关系
`criticReview`（`agents.js:716-752`）5 项检查：
- 3 项判"章节在不在"（证据/边界/共识）
- 1 项读生产者自报的 `meta.computed` 布尔
- 1 项阈值判置信度

**没有任何一项**核对"证据文本是否支持 verdict 中的主张"。例如：证据链全是"木星亮度 -2.7 等"，而结论写"土星今晚最亮"，Critic 会 PASS。

#### R4 strict 门槛会制造虚假安全感
strict 模式下若某检查不通过，会追加 boundary 声明——但**通过的检查也可能是错的**（因为它只查存在性）。用户看到"评审通过"会以为内容被验证过。

---

### 7. Memory 能否支撑长研究

#### P10 不能
- `MEMORY` 是进程内环形缓冲（`agents.js:625`），刷新即失
- 会话消息持久化在 IndexedDB，但那是**对话记录**，不是**研究状态**
- 没有"任务进行中"的概念：一次 ask 是原子的，不能中断、不能续跑
- 没有区分"用户观点"与"科学事实"：MEMORY 里只存 `{ref, intent}` 之类的指代锚点

**多轮研究任务的典型需求**（"先查这个天体，再比三个来源的年质，最后给结论"）在当前架构下**无法承接**——每一步都重新开始。

---

### 8. 能否执行中改计划

#### P11 不能
`buildAnswer` 是同步函数，执行路径在进入时已确定。唯一的"动态"是 `criticReview` 追加一个 boundary 章节，**不改变执行**。

`research.js` 有两轮检索，第二轮由 `buildRound2Queries` 根据第一轮锚点生成——**这是全项目唯一一处"根据结果调整后续动作"**，但它被封闭在检索模块内部，不能反向影响 intent 或 compose 分支。

**这恰恰是升级的最佳切入点**：已有"结果驱动下一步"的先例，可以沿此扩展，而不是从零引入规划器。

---

### 9. 成本、停止、恢复

#### P12 三者全缺
| 机制 | 现状 |
|---|---|
| Token 预算 | 无。`compare` 会调用模型，但无上限 |
| 搜索次数上限 | 隐式（round1 + round2 = 2 轮），但没有统一配额 |
| 最大步数 | 无（没有步的概念） |
| 超时 | 仅 HTTP 层（`sources.js:363`），无任务级超时 |
| 停止条件 | 无。长任务无法中止 |
| 失败恢复 | 无。单步异常 → 整答降级 |

#### R5 成本不可观测
`taskStart/taskEnd` 记录了耗时（`app.js:2888`），但没有 token 计数、没有模型调用次数、没有检索次数。用户无法知道一次提问花了多少。

---

### 10. 最影响研究能力的三个问题（排序）

| 排序 | 问题 | 影响 | 证据 |
|---|---|---|---|
| **1** | 无任务状态，一次 ask 原子化 | 无法做多步研究；无法断点续跑；无法在结果之间建立依赖 | 全流程局部变量，无持久化 |
| **2** | Critic 只查结构 | "评审通过"≠"结论正确"，研究型输出不可信 | `agents.js:716-752` |
| **3** | 意图单分支，无法组合 | 复合问句只能答一半；无法并行取证 | `agents.js:687-700` |

其余（重试、预算、恢复）都是这三个的下游：有了 TaskState，重试与恢复才有载体；有了 Evaluator，才知道什么时候该重试。

---

### 11. 暂时不必解决的问题

| 项 | 理由 |
|---|---|
| N1 把 smalltalk/chart 改成 LLM 分类 | 规则更快更稳，改是倒退 |
| N2 计算缓存 | 毫秒级纯函数，缓存收益低于失效成本 |
| N3 引入向量数据库做语义检索 | 知识库 141 条，正则 + 别名表够用；向量化收益不抵成本 |
| N4 拆分为微服务 | 纯静态单页是核心优势（离线可用、零部署），拆服务直接摧毁它 |
| N5 补齐 13 个 Agent 的"自主性" | 与 Tool-Centric 原则冲突，属形式主义 |

---

### 12. 结论

现有系统的问题是**"能力齐备但缺调度骨架"**，不是"能力不足"：

- 计算、检索、分级、冲突检测、引用核验都已实现，且质量不低
- 缺的是把它们**组织成可中断、可回退、可验证的流程**
- 因此升级方向应是**在现有函数之上加一层状态机与评审器**，而非重写领域逻辑

---

## 3. 目标架构设计

> 原则：**能力不变，只加调度骨架**。所有新模块都是控制层，不替换领域计算。
> 每条设计都对应现有代码的复用点，不引入新框架（理由见《07-技术选型与接口规范》）。

---

### 1. 八种架构思想的适用性判断

| 思想 | 是否引入 | 判断依据 |
|---|---|---|
| **Tool-Centric** | ✅ **作为基石** | 现状已是此形态：13 个"Agent"里 9 个实为函数。顺此方向把能力显式注册成工具，比包装成 Agent 更省成本、更好测试 |
| **Plan-and-Execute** | ✅ 引入（限复杂任务） | 现状 `research.plan`（`research.js:425`）已有雏形，可外扩为任务级 plan |
| **Dynamic Orchestration** | ✅ 引入 | 2–4 个无依赖子任务可并行，是当前最大性能与完整性缺口 |
| **Evaluator-Optimizer** | ✅ 引入（分级） | Critic 只查结构（`agents.js:716`），必须先变成能判真伪的 Evaluator，否则 Optimizer 无反馈信号 |
| **Event-Driven State Graph** | ✅ 引入（**轻量实现**） | 需要可中断/可恢复就必须有显式状态；但不引入 LangGraph 运行时，用 200 行 JS 状态机足够 |
| **Progress-Guided** | ⚠️ 有条件引入 | 只允许基于**可度量的信号**（证据缺口数、冲突数、预算余量）调整，禁止 LLM 自由决定"再搜一次" |
| **Hierarchical Multi-Agent** | ⚠️ 仅两层 | Muse(主控) → Executor(执行) ，Planner/Evaluator 是阶段而非层级。**不再加第三层**，否则调用链不可调试 |
| **Hypothesis Tournament** | ⏸ **暂缓** | 仅对"科学争议"有价值（如哈勃张力、暗能量演化）。当前无争议判定能力，且成本是普通问的 3–5 倍。留接口，不实装 |

---

### 2. 组件图

```
                        ┌──────────────────────────────┐
                        │  TaskState（持久化，可恢复）  │
                        └──────────────┬───────────────┘
                                       │ 读/写
 用户输入                              ▼
   │        ┌─────────┐    ┌──────────┐    ┌────────────┐
   └───────▶│  Muse   │───▶│  Router  │───▶│  Planner   │
            │(规则+LLM)│    │(模式+分支)│    │(仅复杂任务) │
            └─────────┘    └──────────┘    └─────┬──────┘
                                                  ▼
            ┌─────────────────── Orchestrator（调度/并行/超时）──────────────┐
            │                                                                 │
     ┌──────┴──────┬──────────────┬───────────────┬──────────────┐
     ▼             ▼              ▼               ▼              ▼
  Tool Registry  Kepler        Evidence      Knowledge        LLM Adapter
  (能力注册表)   (数值权威)   Orchestrator     (本地 141 条)    (表述/意图)
                                   │
                                   ▼
                            Evidence Store（证据与关系）
     └──────┬──────────────────────────────────────────────────────┘
            ▼
     Progress Evaluator ──(缺口/冲突/预算)──▶ 回到 Planner 或 Evidence（有上限）
            │
            ▼
    Scientific Critic ──(PASS/PARTIAL/FAIL)──▶ 回退或通过
            │
            ▼
      Output Composer（章节骨架，复用小 finalize）
            │
            ▼
        渲染 / 持久化
```

---

### 3. 模块规格（11 个）

#### 3.1 Muse（主控）

| 项 | 内容 |
|---|---|
| 核心职责 | 语义理解：实体、上下文指代、时空条件、任务类型、复杂度、是否需要检索/计算/论文 |
| 输入 | `{question, attachments, ctx(place/time), memory}` |
| 输出 | `MuseResult{ entities[], context, tasks[{kind, confidence, source:'rule'\|'llm'}], complexity:1..5, needs{search,compute,paper} }` |
| 可调用 | LLM Adapter（仅意图结构化）、Schema 校验器 |
| 被调用 | Router |
| 是否用 LLM | **双层**：规则前置（快路径），LLM 仅处理规则未命中或复杂度判定；LLM 失败自动降级规则 |
| 长期记忆 | 否（只用会话级 MEMORY） |
| 可独立运行 | 是（纯函数 + 可注入 LLM） |
| 失败处理 | LLM 超时/Schema 不符 → 回退 `detectIntent`（`agents.js:446`） |

> **复用**：`detectIntent`、`resolveTargets`、`resolveByMemory`、`parseDate`、`findCity` 全部保留，作为规则层。

#### 3.2 Router

| 项 | 内容 |
|---|---|
| 核心职责 | 决定**运行模式**（single/compare/research）与**执行分支集合** |
| 输入 | `MuseResult` + 用户模式偏好 |
| 输出 | `RouteDecision{ mode, branches[], reason }` |
| 可调用 | 无（纯决策） |
| 被调用 | Muse |
| 是否用 LLM | **否**（规则表驱动，可测试） |
| 长期记忆 | 否 |
| 可独立运行 | 是（纯函数） |
| 失败处理 | 无匹配 → single + 单分支（现状行为） |

> **关键约束**：分支是现有 13 个 `compose*` 的组合，不新增领域实现。

#### 3.3 Planner

| 项 | 内容 |
|---|---|
| 核心职责 | 拆解子任务、声明依赖、标注可并行、生成执行计划 |
| 输入 | `MuseResult` + `RouteDecision` + Tool Registry 能力清单 |
| 输出 | `Plan{ steps:[{id, tool, args, deps[], parallel, critical, budget}], reason }` |
| 可调用 | **只读** Tool Registry（能力描述） |
| 被调用 | Orchestrator（重规划时） |
| 是否用 LLM | 复杂任务用；`complexity<=2` **不触发**（直接单步执行） |
| 长期记忆 | 否 |
| 可独立运行 | 是（LLM 可注入，mock 可测） |
| 失败处理 | 计划非法（环、越权、超预算）→ 降级单步；连续失败 2 次 → 放弃规划，回退 single |

**【第二轮修订 R2-03】权限收窄：三不许**（原文"可拆解子任务"表述过宽，容易被实现成自由编排）：

| 权限 | 是否允许 | 约束 |
|---|---|---|
| 发明新流程 | ❌ | 只能从 7 个模板（T-A~T-G）中选择 |
| 删除核心步骤 | ❌ | 仅 `optional:true` 的步骤可省 |
| 设定预算 | ❌ | 只能申请，由 Orchestrator 按剩余预算批准 |
| 决定停止 | ❌ | 属 Progress Evaluator |
| 选择工具 | ✅ | 仅限 `caps` 匹配且已注册 |
| 用 LLM 生成计划 | ✅ | 输出必须过 Schema，且只能填模板槽位 |

新增 `Plan.validate(plan)`：模板 id 合法、步骤 ⊆ 模板定义、依赖无环、预算不超总预算；不通过直接降级单步。

#### 3.4 Orchestrator

| 项 | 内容 |
|---|---|
| 核心职责 | 按计划调度、并行执行、超时、局部失败隔离、结果汇总、写 TaskState |
| 输入 | `Plan` + `TaskState` |
| 输出 | 更新后的 `TaskState.results` |
| 可调用 | Tool Registry 中注册的任何工具、Kepler、Evidence Orchestrator |
| 被调用 | 应用层（`ask`） |
| 是否用 LLM | **否** |
| 长期记忆 | 否（状态写入 Store） |
| 可独立运行 | 是（可注入工具表做单元测试） |
| 失败处理 | 单步失败：标记 `results[step].error`，继续无依赖分支；关键步骤失败 → 中止并标 PARTIAL |

**【第二轮修订 R2-05】拆为三件套**（原设计把 5 件事塞进一个模块，单点复杂度过高、只能集成测试）：

| 子模块 | 职责 | 规模 | 可单测性 |
|---|---|---|---|
| **Scheduler** | 拓扑排序、并行批次划分、依赖就绪判定 | ~90 行 | 纯图算法，可直接测 |
| **Runner** | 单步执行、超时、重试、分片隔离、失败回滚 | ~110 行 | 注入假工具即可测 |
| **Reducer** | 分片合并（sections 排序 / meta 保守合并 / systemAction 去重） | ~70 行 | 纯函数 |

对外仍只暴露 `Orchestrator.ask()`，但内部三块各自可测。
**并行只发生在 Scheduler 划出的"取数批次"内**，compose 一律串行（依据 `12-执行安全性审计.md` §4.4）。

#### 3.5 Progress Evaluator

| 项 | 内容 |
|---|---|
| 核心职责 | 评估完成度、证据缺口、追加任务价值、剩余预算 → 决定继续/追加/重规划/停止 |
| 输入 | `TaskState`（含 results + 预算消耗） |
| 输出 | `ProgressDecision{ action:'continue'\|'append'\|'replan'\|'stop', gaps[], reason }` |
| 可调用 | 无（纯函数，读状态） |
| 被调用 | Orchestrator（每步之后） |
| 是否用 LLM | **否**（阈值规则：缺口数、冲突数、预算余量） |
| 长期记忆 | 否 |
| 可独立运行 | 是（纯函数，最易测） |
| 失败处理 | 判定异常 → 保守 stop（宁可少搜，不可无限循环） |

> **关键约束**：`replan` 次数上限 2，`append` 上限 3，超限强制 stop。这是防"无限追求证据"的闸门。

#### 3.6 专业领域模块（保持现状形态）

| 项 | 内容 |
|---|---|
| 核心职责 | 各自领域的确定性计算与结构化输出 |
| 输入 | `(answer, ctx, cfg, target, question)` |
| 输出 | 写 `answer.sections / trace / meta` |
| 可调用 | `astro.js` 等纯函数库 |
| 被调用 | Orchestrator |
| 是否用 LLM | **否** |
| 长期记忆 | 否 |
| 可独立运行 | 是 |
| 失败处理 | 抛错由 Orchestrator 捕获为 step error |

> **改造点**：`compose*` 函数签名与实现**不改**，只在外层包一层 `tool adapter`，使其可被计划调度。

#### 3.7 Tool Registry

| 项 | 内容 |
|---|---|
| 核心职责 | 注册/查询工具的能力、入参 Schema、成本、超时、权限标签 |
| 输入 | 注册调用 |
| 输出 | `ToolSpec{ id, name, argsSchema, returns, cost, timeoutMs, caps:['compute'\|'search'\|'llm'] }` |
| 可调用 | 无 |
| 被调用 | Planner（只读）、Orchestrator（执行） |
| 是否用 LLM | **否** |
| 长期记忆 | 否 |
| 可独立运行 | 是 |
| 失败处理 | 未注册工具 → 计划校验直接拒绝 |

**初始注册清单**（全部来自现有能力）：

| tool id | 映射 | caps | 估算耗时 |
|---|---|---|---|
| `kepler.ephemeris` | `astro.*` + composeTarget 计算段 | compute | <10ms |
| `kepler.visibility` | `windowsWithin` / `track` / `sunTimes` | compute | <50ms |
| `kb.lookup` | `resolveTargets` + knowledge.js | local | <5ms |
| `evidence.search` | `Research.run` | search | 2–8s |
| `simbad.tap` | `simbad.lookup` | search | 1–3s |
| `paper.search` | `sources.search`(OpenAlex/S2) | search | 2–6s |
| `llm.compose` | `Sources.generate` | llm | 2–15s |
| `fits.parse` | `attachments.parseFitsHeader` | local | <50ms |
| `compare.curate` | `AC.curate` | local | <20ms |

**【第三轮修订 R3-06】上表缺 compose 类工具**（05 的模板把 `compose` 当步骤用，清单里却没有 → 编排无法执行）。补 3 项，共 12：

| tool id | 映射 | caps | idempotent | 备注 |
|---|---|---|---|---|
| `compose.target` | `composeTarget`（observe/intro/knowledge 三 intent 共用） | compose | ✅ | 主分支 |
| `compose.domain` | `composeCosmos/Nova/Helios/Photo/GearFit` | compose | ✅ | 领域分支 |
| `compose.simple` | `composeTonight/Event/Gear/Chart/SystemView/Smalltalk/Fallback` | compose | ✅ | 轻分支 |

**命名与调度约束**：`caps:'compose'` 的步骤**不得与任何步骤同批并行**（Scheduler 强制校验）。
原因见 `12` §4.4：它们原地写共享 `answer`，并行必冲突。完整字段（含 `idempotent`/`ttl`）以 `15` §7.1 为准。

对应地，`05` §2 模板里的 `compose` 一律指上述三个工具之一，不是"编排动作"。

#### 3.8 Evidence Store

| 项 | 内容 |
|---|---|
| 核心职责 | 保存来源、摘录、检索时间、分级、交叉验证与反证关系、与主张的映射 |
| 输入 | 检索结果、核验结果 |
| 输出 | `EvidenceItem{ id, uri, tier, excerpt, publishedAt, retrievedAt, lang, supports[], contradicts[] }` |
| 可调用 | 无 |
| 被调用 | Evidence Orchestrator、Scientific Critic、Output Composer |
| 是否用 LLM | **否** |
| 长期记忆 | **是**（可持久化到 IndexedDB，研究中跨轮复用） |
| 可独立运行 | 是 |
| 失败处理 | 落盘失败 → 内存态继续，标注"本轮未持久化" |

> **复用**：结构与 `research.js` 现有 item（`dedupe:259`、`rank:349`、`mergeInto:291`）对齐，扩展字段而非重定义。

#### 3.9 Scientific Critic

| 项 | 内容 |
|---|---|
| 核心职责 | 判定主张是否被证据支持；来源真实性、独立性、时效、数值一致性、推理边界 |
| 输入 | `TaskState`（claims + evidence + calc） |
| 输出 | `EvalResult{ verdict:'PASS'\|'PARTIAL'\|'FAIL', checks[], gaps[], retryHint }` |
| 可调用 | Evidence Store（只读）、Kepler（只读复算） |
| 被调用 | Orchestrator（终局评审） |
| 是否用 LLM | **混合**：规则检查必做（可复算/时效/来源域）；"推理合理性"可选 LLM 辅助，且**不得否决规则结论** |
| 长期记忆 | 否 |
| 可独立运行 | 是 |
| 失败处理 | LLM 不可用 → 只跑规则检查，verdict 上限为 PARTIAL |

> **兼容**：保留现有 `criticReview` 的 5 项结构与 `gate` 语义，作为 `checks` 的子集。

#### 3.10 Memory（三层）

| 层 | 内容 | 生命周期 | 复用点 |
|---|---|---|---|
| Conversation Memory | 指代锚点、最近轮次 | 会话 | 现有 `MEMORY`（`agents.js:625`） |
| Task State | 进行中/已完成的研究任务 | 可恢复 | **新建**，落 `store.js` |
| Knowledge Cache | 实体+类型+历元+数据版本为键的科学结论 | 长（带版本失效） | 扩 `simbad.js` 缓存模式 |

| 项 | 内容 |
|---|---|
| 是否用 LLM | 否 |
| 可独立运行 | 是 |
| 失败处理 | Cache miss → 视为新查；写入失败 → 不影响主流程 |

**硬约束**：用户观点永不写入 Knowledge Cache（只有带来源的科学结论可入）。

#### 3.11 Output Composer

| 项 | 内容 |
|---|---|
| 核心职责 | 把 results + evidence + eval 组织为章节骨架（复用现有 sections 契约） |
| 输入 | `TaskState` |
| 输出 | `answer{sections[], trace[], meta{}}` |
| 可调用 | 无（模板 + 排序） |
| 被调用 | 应用层 |
| 是否用 LLM | 否（可选手写段落由 `lyra` 语体层润色，但不改数据） |
| 长期记忆 | 否 |
| 可独立运行 | 是 |
| 失败处理 | 缺章节 → 输出 partial 标记，由前端显示"部分结果" |

---

### 4. 权限矩阵（硬编码进断言）

| 能力 | Kepler | Evidence | LLM | Critic | Planner |
|---|---|---|---|---|---|
| 产出数值 | ✅ 唯一 | ❌ 只引用 | ❌ | ❌ | ❌ |
| 修改数值 | — | ❌ | ❌ **代码级拦截** | ❌ | ❌ |
| 判定 PASS/FAIL | — | 供证 | ❌ | ✅ | ❌ |
| 决定继续/停止 | — | — | ❌ | 建议 | ✅（受预算约束） |
| 选择工具 | — | — | — | — | ✅（限注册表） |

---

### 5. 与现有实现的兼容策略

1. **不删任何现有函数**：`detectIntent`、`compose*`、`finalize`、`criticReview`、`applyCustom`、`Research.run` 全部保留
2. **新层可选启用**：`settings.orchestration = 'legacy' | 'hybrid'`，默认 legacy，灰度切换
3. **数据结构附加**：`TaskState` 挂在 `answer.meta.task`，旧渲染器忽略未知字段
4. **渲染不变**：Output Composer 产出的仍是现有 `sections` 契约，`app.js` 渲染器零改动
5. **测试不变**：352 条断言针对旧路径，legacy 模式下必须全绿

---

### 6. 明确不做的事

| 不做 | 原因 |
|---|---|
| 引入 Agent 间自由对话 | 科学场景需要确定性，对话式协商不可复现 |
| 让 LLM 决定数值 | 与可复算原则冲突 |
| 为每个领域加独立 LLM Agent | 13 个 Agent 已是上限，再加只增成本 |
| 实装 Hypothesis Tournament | 无争议判定前置条件，成本 3–5 倍 |
| 引入图数据库 | 证据关系规模在千级内，JSON + 索引足够 |

---

## 4. Agent 职责与协作规范

> 本文定义"谁能做什么、谁能叫谁、冲突谁说了算"。
> 现有 13 个 Agent 的角色**逐一对照 `core/agents.js:189-287` 的名册**，不做增删。

---

### 1. 三类角色（按实际能力划分，不按名册顺序）

#### 1.1 决策型（4 个）

| Agent | 决策对象 | 决策依据 | 输出 |
|---|---|---|---|
| **Muse** | 意图、实体、时空条件 | 规则（`agents.js:446`）+ 可选 LLM | `intent` 标签 |
| **Kepler** | 数值（唯一权威） | `astro.js` 确定性计算 | `Qty` 数值 + 计算参数 |
| **Critic** | 能否交付、门槛判定 | 结构检查（`agents.js:716`）+ 扩展后的证据关系 | `gate` + `checks` |
| **Curator** | 多来源如何合并 | 去重键 + 保留差异（`research.js:758`） | 合并后的列表 |

#### 1.2 领域计算型（6 个）—— 无自主决策

| Agent | 实际职责 | 代码位置 | 是否可并行 |
|---|---|---|---|
| Vega | 知识库条目匹配 | `resolveTargets` → `composeTarget` | 是（纯本地） |
| Cosmos | 宇宙学条目的共识分级与解释组织 | `composeCosmos:1384` | 是 |
| Nova | 爆发天体的时标与能量量级 | `composeNova:1476` | 是 |
| Helios | 太阳活动与空间天气判断链 | `composeHelios:1543` | 是 |
| Horizon | 观测条件打分、器材匹配 | `composeTarget` 内 `scoreTarget` | 是 |
| Scholar | 文献展示与引用格式 | `toSections:1049` | 是 |

#### 1.3 展示型（3 个）—— 只影响排版，不影响结论

| Agent | 作用 | 约束 |
|---|---|---|
| Orion | 星图渲染参数（style/投影） | 不得改变坐标数值 |
| Lyra | 语体选择（专业/科普） | 不得改变事实陈述 |
| Navigator | 定位引导文案 | 不得注入新主张 |

> **规范**：展示型 Agent 的产物**必须**可被判定为"非事实内容"，在 trace 中标记 `role:'presentational'`，不参与 Critic 的证据统计。

---

### 2. 层级与调用边

```
L0  应用层        ask()  ← 唯一入口
L1  控制层        Muse → Router → Planner → Orchestrator
                                      ↕            ↓
L2  执行层        Tool Registry ←── Kepler / Evidence / KB / LLM Adapter
L3  评审层        Progress Evaluator → Scientific Critic
L4  输出层        Output Composer
```

**允许的调用边**（白名单，代码级校验）：

| 从 | 可调用 |
|---|---|
| 应用层 | 控制层 |
| Muse | LLM Adapter（意图）、Schema 校验 |
| Router | 无 |
| Planner | Tool Registry（**只读能力清单**） |
| Orchestrator | 执行层全部、TaskState |
| Progress Evaluator | 无（只读 TaskState） |
| Scientific Critic | Evidence Store（只读）、Kepler（只读复算） |
| Output Composer | 无（只读 TaskState） |

**禁止的调用边**：

- 执行层 → 控制层（领域模块不能反向调 Planner）
- 执行层 → 执行层横向调用（Vega 不能直接调 Nova；需由 Orchestrator 编排）
- 评审层 → 执行层写操作（Critic 不能改数据，只能要求重算）
- 任何 → LLM 的"自由生成事实"通道

---

### 3. 协作协议

#### 3.1 委派（Delegation）

Orchestrator 向执行层派发的最小单元：

```js
Task = {
  id: 't2',
  tool: 'kepler.visibility',       // 必须在 Tool Registry 注册
  args: { target:'M42', place:{lat,lon}, night:'2026-10-30' },
  deps: ['t1'],                    // 依赖的 step id，空数组=可立即执行
  parallel: true,                  // 是否允许与同层其他 step 并行
  critical: true,                  // 失败是否中止整个任务
  budget: { ms: 3000, tokens: 0 }  // 本步预算
}
```

#### 3.2 回传（Result）

```js
StepResult = {
  id: 't2', ok: true,
  tier: 'compute',                 // 复用 runtime.TIER（runtime.js:16）
  calc: CalcRecord | null,         // 仅 Kepler 产出
  evidence: EvidenceItem[] | null, // 仅 Evidence 产出
  sections: Section[],             // 可直接进入输出契约
  error: null | { kind, message, retriable },
  ms: 42, tokens: 0
}
```

**规则**：
- `ok:false` 时 `error.retriable` 决定是否由 Orchestrator 重试（上限 1 次）
- `calc` 与 `evidence` **互斥语义**：一个是"我算的"，一个是"别人说的"，渲染时不得混用同一措辞

#### 3.3 协助请求（Help）

现有架构**不建议**开放 Agent 间自由求助（会引入不可控链）。替代方案：

- 领域模块需要额外信息 → **不自己去找**，而是在 `sections` 中留 `gap: { need:'search', query:'...' }`
- Orchestrator 收集所有 gap → 交给 Progress Evaluator 统一判断是否追加 Evidence 步骤

这样"求助"被收敛为**一次集中的追加决策**，而不是 N 次分散调用。

#### 3.4 冲突处理（三方冲突，裁决权明确）

| 冲突类型 | 实例 | 裁决规则 | 裁决者 |
|---|---|---|---|
| **数值冲突** | Kepler 算 92.3°，网页说 91.8° | **Kepler 胜**；网页值仅作为"其他来源"并列展示，并标注偏差 | 权限矩阵（硬编码） |
| **来源冲突** | 两个数据库的年质不同 | **都保留**，标注 `conflictsWith`，交给 Critic 判 PARTIAL | Curator 记录，Critic 判定 |
| **结论冲突** | 知识库说"已成共识"，论文说"仍有争议" | **取更保守的表述**，并列出双方 | Critic |
| **意图冲突** | 规则判 tonight，LLM 判 target | **规则优先**（规则误判率低于小模型幻觉），但记录分歧用于日志 | Router |

---

### 4. 每个 Agent 的失败语义

| Agent | 失败表现 | 处理 | 用户可见后果 |
|---|---|---|---|
| Muse | LLM 超时/Schema 不符 | 回退规则 `detectIntent` | 无感（可能略微答偏） |
| Kepler | 计算异常（如坐标越界） | 该 step `ok:false`，不中止 | 缺该数值，其余正常 |
| Evidence | 全部源超时 | 整体降级本地索引 | 标"联网不可用" |
| LLM Adapter | 401/限流 | 回落本地表述（现有行为 `app.js:3938`） | 标"已回退本地表述" |
| Critic | 规则未通过 | 追加 boundary，verdict=PARTIAL | 显示评审缺口 |
| Curator | 输入为空 | 返回单列 | 不显示对比 |
| Custom Agent | 配置非法 | 跳过，记 warning | 使用默认章节集 |

---

### 5. 成本与配额（每个 Agent 的硬上限）

| 资源 | 上限 | 作用范围 |
|---|---|---|
| 单次 ask 的 LLM 调用 | 3 次（意图 1 + 表述 1 + 评审 0~1） | 全局 |
| 单次 ask 的检索轮次 | 3 轮（round1 + round2 + 反证 1） | Evidence |
| 单次 ask 的并行步数 | 4 | Orchestrator |
| 单次 ask 的总超时 | 45s（research 模式 120s） | Orchestrator |
| 重规划次数 | 2 | Planner |
| 追加检索次数 | 3 | Progress Evaluator |
| 单步重试 | 1 | Orchestrator |

超限行为：**停止并输出已有结果 + 缺口说明**，不静默继续。

---

### 6. 控制层组件不是 Agent（命名规范）

为避免名册膨胀，以下组件**不进 AGENTS 名册**，不显示头像，不参与 `trace` 的 agent 字段：

| 组件 | 在 trace 中的表示 |
|---|---|
| Router | 合并进 muse 的 step（`action:'路由'`） |
| Planner | `agent:'muse', action:'规划'` |
| Orchestrator | 不产生 trace（它是调用者） |
| Progress Evaluator | `agent:'critic', action:'进度评估'` |
| Tool Registry | 不产生 trace |

> 理由：`TRACE_ORDER`（`agents.js:710`）是用户可见的叙事顺序，加入控制层会打乱"谁在干什么"的直觉。控制层信息写入 `TaskState`，仅在调试面板可见。

---

### 7. 与现有实现的接缝

| 现有机制 | 在新架构中的位置 | 是否改动 |
|---|---|---|
| `step(agent, action, detail)` | 仍是唯一 trace 生产者 | 不改 |
| `TRACE_ORDER` | 决定展示顺序 | 不改，新 step 复用已有 agent id |
| `applyCustom` 权重机制 | 在 Output Composer 之后执行 | 不改 |
| `MEMORY` 环形 | Conversation Memory 层 | 不改 |
| `resolveByMemory` | Muse 内部指代消解 | 不改 |
| `criticReview` | Scientific Critic 的规则子集 | 扩展，不替换 |

---

## 5. 动态任务编排机制

> 目标：让系统按问题复杂度选择策略，而不是所有问题走同一条链。
> 核心约束：**简单问题不得因编排而变慢**；**任何循环必须有硬上限**。

---

### 1. 复杂度分级（决定是否启动编排）

| 级别 | 判定信号（全部为规则，可测） | 策略 | 目标延迟 |
|---|---|---|---|
| **L1 简单** | 单一实体 + 单一意图；`detectIntent` 命中且无复合连词 | 直接单步（= 现状 `buildAnswer`） | < 300ms |
| **L2 中等** | 2 个无依赖子任务，或"计算 + 解释"混合 | 2 步并行 | < 3s |
| **L3 复杂** | ≥3 子任务，或含"对比/综合/为什么+怎么" | Planner 拆解 + 并行 | < 15s |
| **L4 研究** | 显式要求研究/综述，或触发争议判定 | research 模式 + 证据链 + 评审回退 | < 120s |

**判定实现**（新增 `complexityOf(museResult)`，纯规则）：

```
score = 0
score += 实体数 > 1 ? 2 : 0
score += 意图数 > 1 ? 2 : 0
score += /对比|比较|区别|哪个更|分别|同时|以及/ ? 1 : 0
score += /为什么|机制|原理/ 且 有观测计算 ? 1 : 0
score += /综述|研究|最新进展|争议|证据/ ? 2 : 0
score >= 4 → L4 ；>=2 → L3 ；==1 → L2 ；否则 L1
```

> **关键**：L1 完全跳过 Planner，**不产生任何额外模型调用**。这是"简单问题快速执行"的落地保证。

---

### 2. 任务拆解规则（Planner 的输入约束）

Planner **不自由生成**任务，而是从**预定义的拆解模板**中选择并填充。模板由意图组合决定：

| 意图组合 | 模板 | 步骤 | 依赖 |
|---|---|---|---|
| target + knowledge | T-A | `kb.lookup` → `kepler.ephemeris` → `compose` | 无（可并行取数） |
| tonight | T-B | `kepler.visibility`（多目标） → `compose` | 串行（打分依赖位置） |
| observe + why | T-C | ∥`kepler.ephemeris` + ∥`kb.lookup` → `compose` | 并行 |
| compare 多目标 | T-D | ∥`kepler.ephemeris`×N → `compare.curate` | 并行后汇合 |
| 论文/最新进展 | T-E | `paper.search` → `evidence.search`（反证） → `compose` | 串行（反证依赖正证锚点） |
| 争议问题 | T-F | `evidence.search`（正/反各 1） → `kepler`（若有数值） → `critic` | 部分并行 |
| system-view | T-G | `compose`（无外部调用） | 无 |

**Planner 的自由度仅限于**：在一个模板内增删可选步骤（如是否需要 `paper.search`）。不允许发明模板外的新流程。

```js
Plan = {
  template: 'T-C',
  steps: [
    { id:'t1', tool:'kepler.ephemeris', args:{...}, deps:[],  parallel:true,  critical:true },
    { id:'t2', tool:'kb.lookup',        args:{...}, deps:[],  parallel:true,  critical:false },
    { id:'t3', tool:'compose.merge',    args:{from:['t1','t2']}, deps:['t1','t2'], parallel:false, critical:true }
  ],
  budget: { ms: 8000, tokens: 1200, searches: 0 }
}
```

---

### 3. 并行判定（只有三个条件全部满足才并行）

1. **无数据依赖**：`deps` 为空，或依赖的 step 已完成
2. **无共享可变状态**：不写同一 `TaskState.results[k]`、不写同一缓存键
3. **预算允许**：并行后剩余预算仍 ≥ 单步最大预算

**天然可并行**：Kepler 各目标计算、KB 查询、多个独立检索查询
**天然串行**：`resolveTargets → detectIntent`、检索 round1 → round2、compose → critic

并发上限：`min(4, 剩余预算 / 单步预算)`。

---

#### 3.1 【第二轮修订 R2-01】为什么 compose 不能并行，以及并行结果怎么合并

> 修订原因：原文只说了"天然可并行的有哪些"，**没有论证 compose 为什么不行**，也没给合并规则。实现时极易把 compose 顺手塞进 `Promise.all`。
> 依据：`12-执行安全性审计.md` §1、§4.4。

**实测事实**（`core/agents.js`）：

| 事实 | 证据 | 后果 |
|---|---|---|
| 对 `answer` 有 155 处原地写 | `answer.sections.push` / `answer.trace.push` / `answer.meta =` | 并行时 sections 交错、顺序不确定 |
| `meta` 被整体替换 | `composeSmalltalk:2158` `answer.meta = {...}` | 后完成者覆盖前者，字段丢失 |
| 后处理阶段仍改 `answer` | `app.js:2804/3387/3461` 写 `ans.meta.*` | answer 不是"构建完即冻结" |
| trace 有 `TRACE_ORDER` 保护 | `agents.js:710` | **唯一**被排序保护的项 |

**结论**：并行只允许出现在**取数层**（`kepler.*` / `kb.lookup` / `evidence.search`，均为纯函数或独立 IO）；
**所有 `compose*` 必须串行**，或运行在隔离分片上。

**隔离分片（新增）**：

```js
function newShard(base) {
  return {
    query: base.query, intent: base.intent,
    /* 【R4-02】ctx 必须双层拷贝。
     * ctx 是扁平结构（city/lat/lon/bortle/y/mo/d/h/mi/tz），
     * 唯一嵌套引用是 cityRef（指向全局 CITIES 元素）。
     * 实测（tools/ctx-isolation-test.js）：
     *   A1 浅拷贝后改 shard.cityRef.n → 源 CITIES 被改（污染）
     *   A2 连 cityRef 一起拷贝 → 不污染
     * 所以只做 Object.assign({}, ctx) 是不够的。 */
    ctx: Object.freeze(Object.assign({}, base.ctx, {
      cityRef: Object.freeze(Object.assign({}, base.ctx.cityRef || {}))
    })),
    targets: base.targets,              // 只读共享（compose 只读不写，测试 C 已证）
    trace: [], sections: [], meta: {}   // 各分支独立
  };
}
```

**分片隔离契约（R4-02 新增）**：

| 字段 | 策略 | 依据 |
|---|---|---|
| `ctx` | 双层拷贝 + 双层冻结 | 测试 A1/B1：浅层方案会污染 |
| `ctx.cityRef` | 单独拷一层 | 它是唯一的对象引用 |
| `targets` | 只读共享（不拷贝） | 现有 compose 只读；测试 C2 证明 CITIES 未被改动 |
| `sections/trace/meta` | 每分片新建 | 原地写冲突的根源 |

**不做的事**：不使用 `JSON.parse(JSON.stringify(ctx))`——ctx 含对象引用与潜在 undefined，序列化会改变语义且无必要（结构已知只有两层）。

**Reducer 合并规则（新增，必须显式实现）**：

| 字段 | 合并方式 | 理由 |
|---|---|---|
| `sections` | 按 `TRACE_ORDER` 中对应 agent 排序后拼接 | 不用完成顺序，保证输出稳定 |
| `trace` | 合并后统一排序（现有机制天然支持） | 避免时序抖动 |
| `meta.confidence` | **取最小值**；缺失分片按 0.5 中性值参与，不得视为 1 | 保守：任一分支不确定则整体不确定 |
| `meta.computed` | ❌ **废止单布尔**，改用 `meta.calcCoverage = { computed:n, total:m }` | 逻辑或会让"分支 A 有数值、分支 B 只有文本"的整体被标成可算，用户误以为全部可复算 |
| `meta` 其余字段 | `Object.assign` 浅合并 | 禁止整体替换 |
| `meta.systemAction` | **只保留一个**并去重执行 | 防止视图被反复重置 |

**重试回滚（新增）**：compose 抛错时按长度快照截断，避免半成品残留。

```js
const mark = { s: answer.sections.length, t: answer.trace.length, meta: { ...answer.meta } };
try { fn(answer, ...); }
catch (e) { answer.sections.length = mark.s; answer.trace.length = mark.t; answer.meta = mark.meta; }
```

---

### 4. 执行循环（伪代码，可直接对照实现）

```js
async function execute(task) {
  let state = TaskState.create(task);
  state = UNDERSTAND(state);              // Muse
  state = ROUTE(state);                   // Router
  if (state.route.mode === 'single' && state.complexity <= 1) {
    return LEGACY_PATH(state);            // 直接走现有 buildAnswer，零开销
  }
  state = PLAN(state);                    // Planner（模板化）

  for (let round = 0; round <= MAX_REPLAN; round++) {
    state = await RUN_PLAN(state);        // Orchestrator：并行/串行/超时/重试
    const progress = EVALUATE_PROGRESS(state);   // 纯规则
    if (progress.action === 'stop') break;
    if (progress.action === 'append') {
      state = APPEND_STEPS(state, progress.gaps); // ≤3 次
      continue;
    }
    if (progress.action === 'replan') {
      state = REPLAN(state, progress.reason);     // ≤2 次
      continue;
    }
  }

  const verdict = CRITIC(state);          // Scientific Critic
  if (verdict.verdict === 'FAIL' && verdict.retryHint && state.eval.retries < 1) {
    state.eval.retries++;
    state = APPEND_STEPS(state, verdict.retryHint);  // 定向补检/重算，只回退一次
    return execute(state);                // 递归深度受 retries 限制
  }
  return COMPOSE(state);
}
```

**防死循环三重保险**：`MAX_REPLAN=2`、`append≤3`、`retries≤1`，且每次循环必须消耗预算（无进展的循环会被 Progress Evaluator 判 stop）。

---

### 5. 进度感知（Progress Evaluator 的判定表）

输入：`TaskState`，输出：`{action, gaps[], reason}`

| 信号 | 计算方式 | 阈值 | 决策 |
|---|---|---|---|
| 完成度 | 已完成 critical 步 / 总 critical 步 | < 1 且有可执行步 | `continue` |
| 证据缺口 | `claims` 中无 evidence 支撑的条数 | ≥1 且 `searches < 3` | `append`（定向检索该 claim） |
| 来源单一 | 同一 claim 的证据全部来自同一域 | true 且 `searches < 3` | `append`（要求第二来源） |
| 冲突未解 | `conflicts.length > 0` 且未标 PARTIAL | true | `append`（反证检索）或 `stop`（标记冲突） |
| 预算余量 | 剩余 ms/tokens | < 20% | `stop` |
| 信息增益 | 本轮新增 evidence 条数 / 消耗预算 | 连续 2 轮为 0 | `stop`（无效检索） |
| 失败累积 | 非 retriable 失败数 | ≥2 | `stop` + PARTIAL |

> **禁止**：任何由 LLM 直接决定的"再搜一次"。所有 `append` 必须能对应到上表某一行的具体触发。

---

#### 5.1 【第二轮修订 R2-02】Research Loop（动态研究循环）

> 修订原因：原文只有 replan（修复计划），缺少"执行成功但发现新线索时主动深入"的机制。
> 两者概念不同，不能混为一个。

| | Replan | Research Loop |
|---|---|---|
| 触发 | 计划**不可执行**（工具失败、依赖断裂） | 执行**成功**但产生新发现（新实体 / 争议 / 未验证前提） |
| 本质 | 修复 | 扩展 |
| 上限 | 2 次 | 2 轮 |
| 预算 | 不额外批 | 每轮申请，总量 ≤ 初始预算的 50% |

**只有三类发现能触发 Loop**（其余一律忽略，防止发散）：

| 发现类型 | 判定 | 生成的子任务 |
|---|---|---|
| 新实体 | 检索/知识中出现 `entities` 之外的具名天体 | `kb.lookup` + 可选 `kepler.ephemeris` |
| 一手源争议 | `conflicts` 中双方 `tier==='primary'` | 反证检索（`evidence.search`，否定式查询） |
| 前提未验证 | Claim 的 `premises` 指向的 claim 无 support | 针对该前提的定向检索 |

**硬约束**：Loop 追加的步骤**不得修改已有结论**，只能新增证据或标注矛盾。
若某轮 Loop 没有产生新的 evidence 或 claim → 立即停止，不再进入下一轮。

**单调性要求（R2-04，防空转）**：每次 replan 或 Loop 必须至少满足一项，否则强制 `stop`：
新增已完成步骤 ≥1 / 新增 evidence ≥1 / 消除 conflict ≥1 / 缩小 gap 集合。
连续 2 次无改善 → `stop` + PARTIAL + "已尝试 N 次无进展"。

---

### 6. 成本模型与停止条件

```js
Budget = {
  ms:       8000,      // L2；L3 15000；L4 120000
  tokens:   1200,      // L2；L3 3000；L4 8000
  llmCalls: 3,
  searches: 3,
  parallel: 4,
  replans:  2
}
```

每一步执行前 `reserve(step)`，执行后 `settle(actual)`。超预算的 step **不启动**，直接标 `skipped:budget`。

停止条件（任一成立即停）：

1. 所有 critical 步完成 且 Progress 判 `stop`
2. 预算耗尽
3. `MAX_REPLAN` 用尽
4. 用户主动中止（新增：`AbortController` 贯穿，复用 `sources.js:363` 的模式）
5. 连续 2 轮无信息增益

**停止后的输出**：`verdict=PARTIAL` + 已完成章节 + `gaps` 列表（"还缺什么、为什么没查"）。绝不静默返回半成品。

---

### 7. 状态图（轻量实现，不用图框架）

```
INIT ──▶ UNDERSTAND ──▶ ROUTE ──┬─(L1)─▶ LEGACY ──▶ DONE
                                └─(L2+)─▶ PLAN ──▶ EXECUTE
                                                    │
                        ┌───────────────────────────┤
                        ▼                           ▼
                    EVALUATE ◀────────────────── 每步之后
                        │
        ┌───────────────┼───────────────┬──────────────┐
        ▼               ▼               ▼              ▼
     CONTINUE        APPEND           REPLAN          STOP
        │               │               │              │
        └──▶ EXECUTE ◀──┘               └──▶ PLAN      ▼
                                                      CRITIC
                                                        │
                              ┌─────────────────────────┤
                              ▼                         ▼
                        FAIL+retryHint              PASS/PARTIAL
                              │                         │
                              └──▶ APPEND ──▶ EXECUTE    ▼
                                                      COMPOSE ──▶ DONE
```

**实现形态**：一个 `switch(state.phase)` 的循环函数（约 150 行），状态存 `TaskState.phase`。
不引入 XState / LangGraph —— 理由是状态数 < 10、转移固定、无需可视化调试器。

**可恢复性**：`TaskState` 全字段可 JSON 序列化，每步之后写入 `store.js`（新增 `putTask`）。恢复时从 `phase` + `results` 继续，已完成的 step 不重跑。

> **【第三轮修订 R3-01】上面这句只在 P4 成立。**
> 阶段分工（以 `15` §2 为准）：**P0** 只有结构 + 序列化能力，**不写盘**；**P2** 只在内存中存活于单次 ask，**不写盘**；**P4** 才接 `store.putTask` 与检查点恢复。
> 且"恢复"≠"后台继续执行"：页面关闭后没有进程在跑，恢复是重新打开后从检查点续跑剩余步骤（`15` §4.3）。

---

### 8. 与现有代码的接缝

| 现有能力 | 编排中的角色 | 改动 |
|---|---|---|
| `detectIntent` | L1 直接使用；L2+ 作为 Muse 的规则层 | 不改 |
| `buildAnswer` | L1 的完整路径（legacy） | 不改 |
| `compose*` | 包装成 `compose.*` 工具 | 只加 adapter |
| `Research.run` | `evidence.search` 工具实现 | 不改 |
| `criticReview` | Critic 的规则子集 | 扩展 |
| `runtime.exec` | StepResult 的 trace 载体 | 复用 |
| `taskStart/taskEnd` | 可映射为 step 级计时 | 复用 |
| `store.putThread` | 参照实现 `putTask` | 新增方法 |

---

## 6. 科学证据与验证机制

> 目标：让"结论可追溯、可复算、可反驳"，而不是"看起来有引用"。
> 复用重点：`core/research.js`（已有分级、冲突检测、引用核验）与 `core/runtime.js`（TIER、Qty）。

---

### 1. 现状盘点（先说已有什么）

| 能力 | 现有实现 | 成熟度 |
|---|---|---|
| 检索计划 | `plan()` `research.js:425`，按 intent 选 `PROFILES:42` | ✅ 可用 |
| 两轮检索 | round1 → `extractAnchors:470` → `buildRound2Queries:497` | ✅ 可用 |
| 来源分级 | `TYPE_WEIGHT = {encyclopedia:3, paper:3, database:3, image:1}` `:324` | ⚠️ 只按类型，不按权威性 |
| 去重合并 | `dedupe:259` / `mergeInto:291` | ✅ 可用 |
| 冲突检测 | `detectConflicts:788`（数值 + `UNIT_FAMILY:109`） | ✅ 可用 |
| 引用核验 | `verifyCitations:837`（URL/DOI 解析） | ✅ 可用 |
| 状态标注 | `statusOf:707` | ✅ 可用 |
| 数值解析 | `parseNumbers:724` | ✅ 可用 |
| 反证检索 | **无** | ❌ |
| 时间线 | **无** | ❌ |
| 主张-证据映射 | **无**（只有整段 evidence 列表） | ❌ 关键缺口 |

> **判断**：不缺"搜"，缺"证据与主张的对应关系"。这是 Scientific Critic 无法工作的根因——没有 claim 粒度，就只能数条数。

---

### 2. 数据结构

#### 2.1 Claim（新增，核心）

```js
Claim = {
  id: 'c1',
  text: 'M42 今晚在北京 23:16 达到最高点 43°',
  type: 'quantitative' | 'qualitative' | 'causal' | 'existence',
  entities: ['M42', '北京'],
  numbers: [{ value: 43, unit: 'deg', norm: 43 }, ...],   // 复用 parseNumbers

  /* 【第二轮修订 R2-06】以下四项为新增：把"结论如何成立"变成显式结构 */
  premises: ['c0'],               // derivedFrom：本结论依赖的前提 claim
  support: [{ eid: 'e3', strength: 'strong' | 'partial' | 'weak' }],
  contradict: [{ eid: 'e9', strength: 'strong' | 'partial' | 'weak' }],
  uncertainty: {                   // 定量结论必填
    kind: 'measurement' | 'model' | 'definition' | 'temporal',
    value: 0.5, basis: '星历精度 ±0.5°'
  },

  source: 'kepler' | 'kb' | 'web' | 'llm',   // 信息来源，不含计算状态
  calc: CalcRecord | null,                    // 【R4-01】计算记录；无计算为 null
  origin: 'p0-fixture' | 'p3-generated',      // 【R4-01】P0 只产 fixture，P3 才真实生成
  confidence: 0.94,
  required: true                  // 是核心主张还是补充说明
}
```

> **【第三轮补充修订 R4-01】** 本节结构以 `15` §1.3 为准，与之保持同构。
> 原结构缺 `calc` 与 `origin`。`calc` 用于区分"这句话是算出来的"与"这句话来自知识库/网页/模型"，
> 不得把 `'calc'` 塞进 `source` 枚举（会与 `EvalResult.checks[].source` 的同名字段混淆）。

**为什么加这四项**：原设计只有 `support: [id]`，无法表达"证据强弱""结论依赖哪个前提""误差从哪来"。
Critic 因此只能数条数，无法判断"证据是否支持结论"。这四项是把判断变成可能的**最小结构**。

**生成时机**：由 `Output Composer` 在组章节时同步产出（不是事后 NLP 抽取）。每个 `sections[]` 中的可验证陈述对应一条 Claim。这让映射精确、零额外模型调用。

#### 2.2 EvidenceItem（扩展现有 item）

```js
EvidenceItem = {
  id: 'e3',
  uri: 'https://simbad.u-strasbg.fr/...',      // 必须可访问
  domain: 'simbad.u-strasbg.fr',               // 用于独立性判定
  tier: 'primary' | 'secondary' | 'tertiary',  // 一手/二手/三手
  kind: 'database' | 'paper' | 'encyclopedia' | 'news' | 'image',
  title, excerpt,                              // excerpt ≤ 400 字，用于支持关系判断
  publishedAt, retrievedAt,                    // 时间线 + 时效
  lang: 'en' | 'zh',
  independentOf: ['e1'],                       // 与谁同源（如同一论文的不同转载）
  conflictsWith: ['e9'],
  supports: ['c1']
}
```

**分级标准（替代现有 TYPE_WEIGHT 的粗粒度）**：

| tier | 判定 | 例 |
|---|---|---|
| primary | 原始数据 / 官方星表 / 原始论文 | SIMBAD TAP、JPL Horizons、ADS 原文、MAST |
| secondary | 综述、机构发布、百科 | NASA 新闻稿、维基百科（带引用） |
| tertiary | 聚合站、二手转述、无署名内容 | 内容农场、转载博客 |

评分公式（扩展 `scoreOf:327`）：
`score = tierWeight*3 + kindWeight*2 + recency*1 + coverage*2 − penalty`
其中 `penalty` 来自：无日期、无作者、域名不在白名单、与更高 tier 冲突。

---

### 3. 证据编排（Evidence Orchestrator）

#### 3.1 流程

```
问题
 └─ 拆解为 N 个检索锚点（复用 extractAnchors，扩展到 claim 粒度）
     ├─ 对每个锚点：多语言查询（中/英）+ 多渠道（数据库/论文/百科）
     ├─ 一手优先：先查 primary 源（SIMBAD/ADS/MAST/JPL），再查通用搜索
     ├─ 交叉验证：同一 claim 需 ≥2 个 independentOf 不同的 EvidenceItem
     └─ 反证检索：对每个 critical claim，追加一次"否定式"查询
```

#### 3.2 反证检索策略（新增）

对 `type !== 'existence'` 的 critical claim，生成一条反向查询：

| claim 形态 | 反证查询模板 |
|---|---|
| "X 是 Y" | `X 不是 Y` / `X 与 Y 不符` / `X 的 Y 存在争议` |
| 数值型 | `X 实测值 与 理论值 偏差` / `X 测量 不一致` |
| 机制型 | `X 的形成机制 争议` / `X 的替代解释` |
| 时效型 | `X 最新观测 与 此前 不同` |

命中反证 → 写入 `conflictsWith`，Critic 必判 PARTIAL 并展示双方。

**成本控制**：只对 `critical && type!=='existence'` 的 claim 做，且总数 ≤2 条/任务。

#### 3.3 时间线

按 `publishedAt` 排序输出"该结论的认知演变"：

```
2019  EHT 首次给出 M87* 阴影（primary）
2021  后续独立观测确认（primary）
2024  偏振测量更新（primary）
—— 若最新一条 > 3 年，标注"结论可能已过时"
```

时效阈值：天文常青结论（距离、质量）5 年；动态事件（亮度、活动）30 天；任务状态 7 天。

---

### 4. Scientific Critic（7 项检查）

> **阅读顺序说明**：本文件的小节编号为 4.0 → 4.1 → 4.2 → 4.3。其中 4.0 与 4.3 是第二、三轮追加的，
> 编号保留小值以免破坏其他文档的交叉引用。**实际判定逻辑以 §4.3 的四维模型为准**，§4 的 7 项是其原始清单。

| # | 检查项 | 判定方法 | 数据依赖 |
|---|---|---|---|
| 1 | 来源真实性 | URI 可解析（HEAD 200）或域名在白名单；DOI 格式校验 | `verifyCitations:837` 扩展 |

> **【第三轮修订 R3-03】上表第 1 项的 "HEAD 200" 不可行，已废止。**
> 受 CSP `connect-src` 与 CORS 限制，浏览器无法对任意 URI 做可达性探测。离线可做的只有：域名白名单 + DOI/URL 格式校验 + `tier`。
> 因此该维度最高结论只能是"来源可信（**未能验证可达**）"，措辞不得写"已验证来源"。
> 另：本表的 7 项检查已被重构为**四维**（数值 / 实体 / 语义 / 来源），见 `15` §5 与本文 §4.0 之后的 §4.2。
| 2 | 证据支持关系 | claim.numbers 与 evidence.excerpt 中的数值一致（容差见 §5） | `parseNumbers` |
| 3 | 来源独立性 | `support` 中 `independentOf` 两两不同域 | EvidenceItem.domain |
| 4 | 数据时效 | `retrievedAt − publishedAt` 与结论类型阈值比较 | 时间线 |
| 5 | 数值可复算 | 有 `CalcRecord` 且用同参数重算，误差在容差内 | Kepler 只读复算 |
| 6 | 反例与矛盾 | `conflictsWith` 非空 → 必须展示或标 PARTIAL | `detectConflicts` |
| 7 | 结论边界 | 主张强度 ≤ 证据强度（如证据为"候选"，结论不得写"已证实"） | 规则表 |

#### 4.1 判定聚合

```
FAIL    : 任一 critical claim 的 support 为空                 （无据）
        或 数值复算偏差超容差                                （算错）
        或 来源真实性检查失败                                 （假源）
PARTIAL : 有 support 但独立性不足 / 存在未解冲突 / 已过时     （有据但不充分）
PASS    : 全部 critical claim 通过 7 项
```

规则与 LLM 的关系：**规则永远参与，且拥有一票否决权**（FAIL 不可被 LLM 翻案）；LLM 只能把 PASS 下调为 PARTIAL（发现规则没覆盖的推理问题），不能上调。

#### 4.0 【第二轮修订 R2-07】Claim 关系判定规则（4 条）

> 修订原因：原文 7 项检查是"检查清单"，但没有说明**如何用 Claim 结构推出结论**。补 4 条可执行规则。
> 前置：每条检查结果必须带 `source: 'rule' | 'llm' | 'calc'`；`verdict` 只读 `rule`/`calc`，`llm` 仅作 `note`。

| 规则 | 条件 | 判定 |
|---|---|---|
| **R1 前提断裂** | 任一 `premises` 中的 claim 未通过检查 | 本 claim 最高 **PARTIAL**（不得 PASS） |
| **R2 强度不匹配** | `support` 全为 `weak`，而 claim 措辞含"确定/已证实/证明" | **FAIL** |
| **R3 矛盾未处理** | `contradict` 非空，且 `uncertainty.kind !== 'model'` | 必须 **PARTIAL** 并展示双方 |
| **R4 不确定性缺失** | `type==='quantitative'` 但无 `uncertainty` | **FAIL**（数值必须有误差） |

**聚合**：任一 critical claim 命中 R2/R4 → 整体 FAIL；仅命中 R1/R3 → PARTIAL。
**LLM 的边界**：可以说"我怀疑这个推理有问题"，但不能改变 verdict；结论写入 `meta.review.llmNote` 单独展示。

#### 4.2 回退路由

| verdict | 回退目标 | 追加动作 | 上限 |
|---|---|---|---|
| FAIL（无据） | Evidence Orchestrator | 针对该 claim 定向检索 | 1 次 |
| FAIL（算错） | Kepler | 重算（同参数），若仍不一致 → 标"计算存疑" | 1 次 |
| PARTIAL（单源） | Evidence Orchestrator | 要求第二独立来源 | 1 次 |
| PARTIAL（冲突未解） | — | 不重试，直接展示双方 + 说明 | — |

回退后仍不满足 → 输出 PARTIAL，并在边界声明中写明"已尝试 N 次，仍缺 X"。

#### 4.3 【第三轮修订 R3-04】四维分离：7 项清单的重构

> 修订原因：原 7 项把"有没有来源""数字对不对""结论是否被支持"混在一个清单里，
> 导致"数值匹配"被当成"证据支持"。第三轮拆成四个互不替代的维度，**判定以本节为准**。
> 完整字段定义见 `15` §5。

| 维度 | 回答什么问题 | 由原 7 项中的哪些演化 | 关键修正 |
|---|---|---|---|
| **numeric 数值一致性** | 数**算得对不对** | 检查 5（可复算） | 新增单位/历元/坐标系/不确定性四项必查 |
| **entity 实体一致性** | 说的是**同一个对象**吗 | ⚠️ 原 7 项**没有** | 新增：防止"木星数据用在土星结论上" |
| **semantic 语义支持** | 证据是否**真的支持**这个结论 | 检查 2（证据支持） | 数字匹配降级为 `basis:'numeric'` 的**弱**支持，不得单独构成 strong |
| **source 来源可信度** | 来源**可不可信** | 检查 1、3、4 | 去掉不可行的 HEAD 探测，改为白名单+格式+层级 |

**两条硬规则**（第三轮新增，直接回应"不得把数字匹配或域名白名单等同于科学验证"）：

1. **数字匹配 ≠ 证据支持**：`basis:'numeric'` 只能是 `strength:'weak'`。要升为 `strong`，必须同时满足文字断言匹配 + 上下文窗口命中（数字前后 20 字符出现单位或谓词）。
2. **域名白名单 ≠ 来源已验证**：白名单只是加分项；`source` 维度最高只能给出"来源可信（未能验证可达）"。

**聚合**：`numeric` 或 `entity` 出现 FAIL → 整体 FAIL；证据只有数值匹配 / 同域 / 超时效 / 未解冲突 → PARTIAL；
四维全过且 required claim 均有 `strong` 支持 → PASS。LLM 结论只进 `llmNote`，不参与任何维度判定。

---

### 5. 数值一致性与容差

| 量类型 | 容差 | 依据 |
|---|---|---|
| 角度（方位/高度） | ±0.5° | 自研星历精度上限 |
| 时间（升落/中天） | ±2 min | 同上 |
| 星等 | ±0.1 mag | 目录差异 |
| 距离（光年） | ±2% | 测量方法差异 |
| 年质/半径（天体） | ±1% | 文献常见分歧 |
| 计数类（如卫星数） | 精确匹配 | 离散量 |

超容差即触发 check#2/#5 失败。容差表写入 `CALC_TOLERANCE` 常量，**不允许 LLM 参与判断**。

#### 5.1 CalcRecord（数值唯一凭据）

```js
CalcRecord = {
  value: 43.2, unit: 'deg',
  epoch: 'J2000', frame: 'topocentric',        // 强制字段
  source: 'astro.local',                        // 计算来源，非模型
  method: 'altAz(lst,dec,jd,lat,lon)',          // 可复算函数名
  inputs: { ra: 5.588, dec: -5.391, jd: 2461342.5, lat: 39.9, lon: 116.4 },
  uncertainty: 0.3,                             // 单位同 value
  computedAt: '2026-10-30T11:20:00Z'
}
```

**规则**：缺 `epoch` / `frame` / `inputs` 任一项 → Critic check#5 直接 FAIL。这是把"可复算"从口号变成校验项的最小手段。

---

### 6. 可追溯性（用户可见）

答案中每条数值/结论旁标注来源标记，点击展开：

```
43°（Kepler 计算 · J2000 · 容差 ±0.5° · 复算）
「M42 是恒星形成区」（SIMBAD 2024 · primary · 交叉验证 2 源）
```

trace 中记录完整链路：

```
muse 解析意图 → kepler 计算位置（12ms）→ evidence 检索（3 源，1 冲突）
→ critic 评审（7 项，2 项未达标）→ 输出 PARTIAL
```

---

### 7. 与现有代码的接缝

| 新机制 | 复用/改造 | 说明 |
|---|---|---|
| Claim 生成 | `toSections:1049` 内联产出 | 不新增 NLP 抽取 |
| EvidenceItem | 扩 `cloneItem:285` 的字段 | 向后兼容（新字段可选） |
| 分级 | 替换 `TYPE_WEIGHT:324` 的权重表 | 保留字段名，改取值 |
| 冲突检测 | 直接用 `detectConflicts:788` | 不改 |
| 引用核验 | 扩 `verifyCitations:837` 增加 HEAD 探测 | 需 CSP 允许（同域限制下改用域名白名单） |
| 时间线 | 新增 `buildTimeline(evidence)` | 纯函数 |
| 反证 | 新增 `counterQueries(claims)` | 复用 `buildQuery:412` |
| CalcRecord | 扩 `Qty`（`runtime.js:80`） | 加 epoch/frame/inputs 三字段 |
| Critic | 扩 `criticReview:716` | 保留 5 项为子集，新增 2 项 |

> **注意**：check#1 的 URI 探测受 CSP `connect-src` 与 CORS 限制。可行方案是**域名白名单 + 格式校验**（离线可用），而非真实 HEAD 请求。这一点必须写进实现约束，避免设计出做不到的检查。

---

## 7. 技术选型与接口规范

> 前提校正：本项目是**纯静态浏览器应用**（无 Node 运行时、无服务端、零第三方依赖）。
> 任务书列出的技术多为 Python 生态，逐项评估时必须考虑"引入即破坏离线可用"这一硬约束。

---

### 1. 选型总原则

1. **能用现有代码实现的不引入新依赖**（零依赖是当前部署的最大优势）
2. **能离线完成的不放到服务端**
3. **引入任何运行时都要先证明它解决的是现有代码解决不了的问题**
4. 新增代码规模上限：控制层合计 ≤ 1500 行（否则维护成本超过收益）

---

### 2. 逐项评估

| 技术 | 必要性 | 解决什么 | 成本 | 结论 |
|---|---|---|---|---|
| **LangGraph** | 低 | 图状态机、断点恢复、可视化调试 | 需 Python 服务端 + 依赖链；与纯静态部署冲突；状态图仅 <10 节点 | ❌ **不引入**。用 ~150 行 `switch(phase)` 实现同等能力 |
| **LangChain** | 极低 | 链式编排、工具抽象、记忆封装 | 抽象层厚重，调试困难；本项目工具是纯函数，无需 chain | ❌ 不引入 |
| **CrewAI** | 极低 | 角色化多 Agent 协作 | 自由对话式协作，不可复现；与科学可复算原则冲突 | ❌ 不引入 |
| **AutoGen** | 极低 | 多 Agent 对话 | 同上，且需服务端 | ❌ 不引入 |
| **OpenAI Agents SDK** | 低 | 托管式 Agent 运行时 | 绑定单一厂商；本项目已支持 11 家 provider，不能锁定 | ❌ 不引入 |
| **Python asyncio** | — | 并发 | 浏览器已有 `Promise.all`（`app.js:3975` 已在用） | ❌ 不适用 |
| **FastAPI** | **条件性** | 服务端 API、跨域代理、批量抓取 | 需部署运维；破坏"file:// 可打开" | ⏸ **暂不引入**。仅当出现"必须服务端"的需求时启用（见 §3） |
| **Pydantic** | 低 | 数据校验 | 等价能力用 JSON Schema + 30 行校验函数足够 | ❌ 不引入。改用轻量 Schema 校验器 |
| **Redis** | 低 | 缓存/队列 | 当前缓存规模：SIMBAD 缓存 < 100 条、证据 < 千条 | ❌ 不引入。用 IndexedDB（已有 `store.js`） |
| **MySQL / SQLite** | 低 | 结构化存储 | 数据量级：知识库 141 条、会话数千条 | ❌ 不引入。IndexedDB 足够 |

#### 2.1 为什么不用 LangGraph（最需要论证的一项）

LangGraph 的核心价值是：显式状态、持久化 checkpoint、条件边、可视化。

| 能力 | 本项目需求 | 现有替代 |
|---|---|---|
| 状态机 | 9 个状态、转移固定 | `switch(state.phase)` |
| 持久化 | 每步写一次 | `store.js` 新增 `putTask`（复用 IDB） |
| 条件边 | 3 条（continue/append/replan） | `ProgressDecision.action` |
| 可视化 | 调试期需要 | 调试面板输出 `TaskState` JSON |

**结论**：需求规模远小于框架能力，引入框架等于用 100 倍的代码量换 10% 的便利，还要额外背一个 Python 服务端。**明确不引入**。

---

### 3. 什么时候才需要服务端

以下三类需求无法在纯前端完成，届时用 FastAPI 包一层（**仅这三类**）：

| 需求 | 为什么前端做不到 | 最小方案 |
|---|---|---|
| 批量论文抓取（>50 篇/次） | CORS + 速率限制 + 无重试队列 | FastAPI + 定时任务，只做"抓取→结构化"，不含推理 |
| 跨会话共享证据库 | 无服务端存储 | FastAPI + SQLite（只存 EvidenceItem） |
| ADS/MAST 的 API Key 保护 | 前端暴露 key | FastAPI 代理，key 留服务端 |

**触发条件**：当 P3 阶段实际接入 ADS/MAST 时再评估。**当前不建**。

---

### 4. 内部接口规范（不引入框架，但要有契约）

#### 4.1 模块暴露方式（沿用现有 IIFE + 全局对象）

```js
(function (root) {
  'use strict';
  // ... 实现
  root.TaskState = { create, load, save, ... };   // 单一全局出口
})(typeof window !== 'undefined' ? window : globalThis);
```

**约束**：
- 每个新模块只暴露一个全局对象（与 `window.AgentCore` / `window.Research` 一致）
- 不新增 `<script>` 以外的加载机制（保持 `index.html:457-487` 的顺序可读）
- 新模块必须能在 Node 中 `require` 以便单元测试（现有 `research-test.js` 已用此模式）

#### 4.2 工具接口规范（Tool Registry）

```js
// 注册
Registry.register({
  id: 'kepler.ephemeris',
  version: '1.0.0',
  caps: ['compute'],                    // compute | search | llm | local
  argsSchema: {                         // 轻量 JSON Schema 子集
    type: 'object',
    required: ['target', 'jd', 'place'],
    properties: {
      target: { type: 'string' },
      jd: { type: 'number', min: 2000000, max: 3000000 },
      place: { type: 'object', required: ['lat', 'lon'] }
    }
  },
  returns: 'CalcRecord[]',
  timeoutMs: 500,
  cost: { ms: 10, tokens: 0, searches: 0 },
  permissions: { canProduceNumbers: true },   // 权限标签，运行时校验
  run: async (args, ctx) => { /* ... */ }
});
```

**校验函数**（约 40 行，替代 Pydantic）：

```js
function validate(value, schema, path) → { ok, errors[] }
// 支持 type / required / properties / items / enum / min / max
```

#### 4.3 LLM 输出 Schema 校验（Muse 结构化意图）

```js
const INTENT_SCHEMA = {
  type: 'object',
  required: ['tasks', 'entities', 'complexity'],
  properties: {
    tasks: { type: 'array', items: {
      type: 'object', required: ['kind', 'confidence'],
      properties: {
        kind: { type: 'string', enum: [
          'tonight','target','event','cosmos','nova','helios',
          'photo','gear','gear-fit','chart','system-view','research'
        ]},
        confidence: { type: 'number', min: 0, max: 1 }
      }
    }},
    entities: { type: 'array', items: { type: 'string' } },
    complexity: { type: 'integer', min: 1, max: 4 }
  }
};
```

**失败处理**：校验不通过 → 丢弃 LLM 结果 → 回退 `detectIntent`（`agents.js:446`）→ trace 记 `intentSource:'rule-fallback'`。

#### 4.4 外部 API 适配器规范

所有外部数据源统一形状（现有 `sources.js` 已是此形态）：

```js
Adapter = {
  id, kind: 'search'|'database'|'model',
  caps, rateLimit: { perMin: number },
  call(params, { signal, timeoutMs }) → Promise<RawResult[]>,
  normalize(raw) → EvidenceItem[]
}
```

**必须有**：`AbortController` 支持（复用 `sources.js:363` 的 `withTimeout` 模式）、降级返回（失败不抛到上层，返回 `{ ok:false, reason }`）。

#### 4.5 状态与存储接口

```js
Store.putTask(taskId, taskState)      // 新增，复用 store.js 的 IDB 通道
Store.getTask(taskId)
Store.listTasks({ status, limit })
Store.pruneTasks({ olderThanDays: 7 })  // 防止无限增长
```

**容量约束**：`TaskState` ≤ 200KB/条，最多保留 50 条（超出按 LRU 淘汰）。

---

### 5. 兼容性与迁移接口

```js
// 开关：默认 legacy，保证 352 条断言不受影响
settings.orchestration = 'legacy' | 'hybrid' | 'full'

ask():
  if (orchestration === 'legacy') return legacyAsk();     // 现有路径
  return orchestrator.ask();                              // 新路径
```

`hybrid` = L1 走 legacy、L2+ 走新编排。这是灰度期的默认值。

---

### 6. 依赖清单（引入后）

| 运行时依赖 | 数量 |
|---|---|
| 第三方 JS 库 | **0** |
| 构建工具 | 0（`build-standalone.js` 是自写内联脚本） |
| 服务端 | 0 |
| 新增自研模块 | 6（`task.js` / `registry.js` / `planner.js` / `orchestrator.js` / `evaluator.js` / `schema.js`） |

预计新增代码：**1100–1500 行**（不含测试）。

---

### 7. 明确拒绝的诱惑

| 诱惑 | 拒绝理由 |
|---|---|
| "用了 LangGraph 才显得专业" | 架构质量由可验证性决定，不由框架名决定 |
| "上服务端才能做真研究" | 当前离线可用的特性是产品差异点；研究能力靠证据链而非算力 |
| "用向量库做语义检索" | 141 条知识 + 别名表已够；向量化的失效模式更难调试 |
| "多 Agent 对话更智能" | 不可复现，与科学场景的审计要求冲突 |

---

## 8. 新旧架构映射

> 分类定义：
> **保留** = 实现合理，原样使用；**升级** = 保留模块，改内部机制；**新增** = 当前缺失；
> **拆分** = 一个模块承担过多职责；**合并** = 多处重复；**淘汰** = 无保留价值。
> 原则：不为了新架构而删除可用实现。

---

### 1. 保留（原样使用，不动一行）

| 资产 | 位置 | 理由 |
|---|---|---|
| 星历计算全套 | `core/astro.js` `jdFromDate`(15) / `sun`(55) / `moon`(99) / `planet`(190) / `altAz`(234) / `track`(251) / `sunTimes`(278) / `scoreTarget`(300) | 纯函数、无副作用、可复算，是数值权威的物理基础 |
| TIER 四档 | `core/runtime.js:16` `classify`(30) | 答案分级契约已合理，用户可见且被测试覆盖 |
| `exec` 记录 | `core/runtime.js:52` | 结构完备，直接作为 StepResult 的 trace 载体 |
| 检索两轮机制 | `research.js` `plan`(425) / `extractAnchors`(470) / `buildRound2Queries`(497) | 已是"结果驱动下一步"的正确先例，保留 |
| 冲突与引用核验 | `research.js` `detectConflicts`(788) / `verifyCitations`(837) | 逻辑正确，Critic 可直接复用 |
| 去重合并 | `research.js` `dedupe`(259) / `mergeInto`(291) | compare 模式依赖，语义正确（去重事实点、保留差异） |
| 档案隔离 | `core/profile.js` | 多用户数据隔离已实现，新 TaskState 沿用同一命名空间 |
| 存储双后端 | `core/store.js`（IDB + LS 兜底，`:24`） | 健壮，新增 `putTask` 直接复用通道 |
| 会话模型 | `core/thread.js` | 对话持久化与研究发现任务无关，不改 |
| FITS 解析 | `core/attachments.js` `parseFitsHeader`(60) | 真实 SciOps 能力，注册为工具即可 |
| SIMBAD TAP | `core/simbad.js` `lookup`(91) + 缓存 | 唯一真正的一手天文数据源，P3 的核心资产 |
| CSP 与内联脚本哈希 | `index.html` + `tools/sync-csp-hash.js` | 安全边界，不碰 |
| 13 个 Agent 名册 | `agents.js:189-287` | 叙事资产（用户可见角色），不增不减 |

---

### 2. 升级（保留模块，改内部机制）

| 资产 | 位置 | 升级内容 | 兼容方式 |
|---|---|---|---|
| **Muse 意图识别** | `agents.js:446 detectIntent` | 规则保留为快路径；新增 LLM 结构化层（Schema 校验 + 失败降级） | 函数签名不变，内部加分支；`intentSource` 写入 trace |
| **分派逻辑** | `agents.js:687-700` | 从 if/else 改为 Router 决策表，支持多分支 | 单分支时行为完全等价 |
| **Critic** | `agents.js:716 criticReview` | 5 项结构检查 → 7 项 + 三态 verdict；保留原 5 项为子集 | `meta.review` 字段向后兼容，新增 `verdict` |
| **`Qty` 数值对象** | `runtime.js:80` | 增加 `epoch` / `frame` / `inputs` / `uncertainty` 强制字段 | 旧调用不传则标 `legacy:true`，报告期内不阻断 |
| **来源分级** | `research.js:324 TYPE_WEIGHT` | 类型权重 → 一手/二手/三手 tier 体系 | 保留常量名，扩展取值 |
| **`applyCustom`** | `agents.js:810` | 位置从 buildAnswer 尾部移到 Composer 之后 | 效果等价（仍是最后一步裁剪） |
| **`ask` 入口** | `app.js:3721` | 增加模式分派（legacy/hybrid/full），主体逻辑提取为 `legacyAsk` | 默认 legacy，零行为变化 |
| **检索日志** | `research.js:512 LOG` | 容量 10 → 结构化 + 可导出 | 不影响现有调试接口 |

---

### 3. 新增（当前缺失）

| 模块 | 文件 | 职责 | 规模估算 |
|---|---|---|---|
| TaskState | `core/task.js` | 任务状态定义、序列化、生命周期 | ~180 行 |
| Tool Registry | `core/registry.js` | 工具注册、Schema 校验、能力查询 | ~150 行 |
| Schema 校验器 | `core/schema.js` | 轻量 JSON Schema 子集校验 | ~60 行 |
| Planner | `core/planner.js` | 模板化拆解、依赖图、预算分配 | ~220 行 |
| Orchestrator | `core/orchestrator.js` | 调度循环、并行、超时、重试、状态机 | ~260 行 |
| Progress Evaluator | `core/evaluator.js` | 进度判定（纯规则） | ~120 行 |
| Claim 层 | `core/claims.js` | 主张抽取（从 sections 产出）、证据映射 | ~140 行 |

**【第二轮修订 R2-08】追加 4 项**（评审后新增，均为控制层）：

| 模块 | 文件 | 职责 | 规模 |
|---|---|---|---|
| Reducer | `core/reducer.js` | 分片合并、sections 排序、meta 保守合并、systemAction 去重 | ~70 行 |
| Delegation | `core/delegation.js` | 委派请求构造 + 6 项校验（目标/能力/深度/数量/预算/成环） | ~80 行 |
| Search 五段胶水 | `core/search-pipeline.js` | 串联 plan→execute→extract→link→assess，不重写各段 | ~60 行 |
| Research Loop | 并入 `planner.js` | `expand(plan, findings)`，只追加不改写 | +60 行 |

合计约 **1400 行**（接近 1500 上限，后续若再加模块需先合并或删减）。

---

### 4. 拆分（一个模块承担过多职责）

| 现状 | 问题 | 拆法 |
|---|---|---|
| `agents.js` 2165+ 行，含名册 + 解析 + 路由 + 13 个 compose + 评审 + 自定义 | 单文件过大，改一处需读全文 | 逻辑上拆为 `muse`（解析路由）/ `compose`（领域）/ `critic`（评审），**但物理上保持单文件分节**，避免新增 script 打乱加载顺序 |
| `app.js` ~7.1k 行，含 UI + 编排调用 + 面板 + 事件 | 编排逻辑与渲染耦合 | 只把 `ask` 中的编排部分（`app.js:3763-3940`）抽为 `orchestrator.ask`，渲染不动 |

> **注意**：拆分是"逻辑分层"，不是"文件搬家"。任务书禁止移动/重命名文件，此项在获批前不动物理结构。

---

### 5. 合并（存在重复）

| 重复项 | 位置 | 合并方案 |
|---|---|---|
| 标题/实体名归一 | `agents.js normKey`(298) 与 `research.js normTitle`(146) / `normDoi`(151) | 保留各自（用途不同：前者用于别名匹配，后者用于去重键），**不合并**，仅加注释说明差异 |
| 数值解析 | `research.js parseNumbers`(724) 与 compose 内部的 `toFixed` 格式化 | 前者用于冲突检测，后者用于展示；不合并 |
| 时间格式化 | `astro.fmtHM`(36) / `fmtDate`(41) 与 `runtime.fmtClock`(106) | 确认是否重复 → 若重复则统一到 `astro`，`runtime` 内改为委托 |

> **审计说明**：未发现真正的"功能重复实现"。多数"看起来重复"是不同用途的同名工具。合并需逐个确认，不能批量改。

---

### 6. 淘汰（无保留价值）

**结论：当前没有必须淘汰的模块。**

逐项检查过 13 个 Agent、23 个 core 模块、8 个 data 文件，均在使用中。唯一接近"可退役"的是：

| 候选项 | 状态 | 处理 |
|---|---|---|
| `core/adaptive.js` 的 hero 维度 | 因设置面板改两级导航后，对话态 hero 整体 `display:none`，该维度已成死代码 | **不删**（`selftest` 有 6 条断言依赖 `data-hero`），仅在注释标注"待清理"，留待专门任务 |
| `worker/cors-proxy.js` | 使用频率低但解决真实 CORS 问题 | 保留 |

> 任务书要求"不允许未经验证就删除"。据此，本设计**不包含任何删除动作**。

---

### 7. 映射总览（按目标模块对照）

| 目标模块 | 来自 | 类型 |
|---|---|---|
| Muse | `detectIntent` + `resolveTargets` + `resolveByMemory` + 新增 LLM 层 | 升级 |
| Router | `buildAnswer` 分派段（`agents.js:687`） | 升级 |
| Planner | — | 新增（模板来自现有 intent 组合） |
| Orchestrator | `app.js:3763-3940` 的串行编排 | 升级（抽离 + 并行化） |
| Progress Evaluator | — | 新增 |
| 专业 Agent | 13 个 `compose*` | 保留 + 包 adapter |
| Tool Registry | — | 新增 |
| Evidence Store | `research.js` item + `LOG` | 升级（加 claim 映射） |
| Scientific Critic | `criticReview` + `detectConflicts` + `verifyCitations` | 升级 |
| Memory（三层） | `MEMORY`(agents.js:625) + `thread.js` + `simbad` 缓存 | 升级 + 新增 TaskState |
| Output Composer | `finalize`(775) + `applyCustom`(810) + `renderAnswer`(app.js) | 升级 |

---

### 8. 破坏风险评估

| 改动 | 影响面 | 风险 | 缓解 |
|---|---|---|---|
| `ask` 加分派 | 全部入口 | 中 | `orchestration='legacy'` 默认，断言保护 |
| `Qty` 加字段 | 所有数值产出 | 低 | 新字段可选，缺失不阻断 |
| Critic 三态 | 答案渲染（评审块） | 中 | `meta.review` 保留旧字段，渲染器兼容 |
| `compose*` 包 adapter | 13 个函数 | 低 | adapter 只做参数转发，不改函数体 |
| 新增 6 个 script | 加载顺序 | 低 | 追加在 `app.js` 之前，依赖单向 |
| TaskState 落 IDB | 存储配额 | 中 | 200KB/条 + 50 条上限 + 7 天清理 |

---

## 9. 分阶段迁移实施计划

> 总原则：**行为零变化优先于功能新增**。每阶段独立可发布、独立可回滚。
> 全部阶段完成后，`orchestration='legacy'` 仍必须可用（长期保留的逃生门）。

---

### 【第二轮修订 R2-09】阶段范围调整

评审后有 3 处变化，其余不变：

| 阶段 | 变化 | 原因 |
|---|---|---|
| **P0** | 范围扩大：新增 Claim 结构（含 premises/strength/uncertainty）与 4 条判定规则 | 三态评审若没有 Claim 关系模型，`PARTIAL` 只能是恒定值，等于假的 |
| **P2** | 新增 `reducer.js`（分片合并） | 并行必须在分片上，没有 Reducer 就不能开并行 |
| **P0** | 明确不做：Reducer、并行、Research Loop | 它们依赖 P2 的调度骨架，提前做只会空转 |

**新增阶段 P2.5（可选，独立评估）**：Controlled Delegation。放在 P2 之后、P3 之前，因为它依赖 Registry 与预算机制，但不阻塞证据专业化。

| 阶段 | 目标 | 新增/改动 | 断言基线 | 风险 | 预计工作量 |
|---|---|---|---|---|---|
| P0 | 契约层 + Claim 关系模型 | `task.js` `schema.js` `claims.js` + 扩 `criticReview`/`Qty` | 352 + ~20 | 低 | 3–4 天 |
| P1 | Muse 结构化意图 | 扩 `detectIntent` 外层 | 352 + ~10 | 中 | 2–3 天 |
| P2 | Planner + 三件套 + Reducer | `planner` `registry` `scheduler` `runner` `reducer` | 352 + ~26 | 中高 | 6–8 天 |
| P2.5 | Controlled Delegation（可选） | `delegation.js` | 352 + ~10 | 中 | 2 天 |
| P3 | 证据专业化 | 扩 `research.js` + 五段胶水 | 352 + research 110 | 高 | 7–10 天 |
| P4 | research 模式 + Research Loop + 恢复 | `orchestrator` 状态机 + `store.putTask` | 全绿 + ~30 | 中 | 5–7 天 |

---

### 阶段总览（第一轮原表 · 已被 R2-09 与 R3-02 取代）

> ⚠️ **此表已失效，仅保留修订轨迹，不要按它排期。**
> 有效版本见本文件开头的「【第二轮修订 R2-09】阶段范围调整」与「【第三轮修订 R3-02】阶段表统一」。
> 差异：P0 断言 15→20、工时 2–3→3–4 天；P2 断言 20→26、工时 5–7→6–8 天；P2.5 为新增阶段。

| 阶段 | 目标 | 新增/改动 | 断言基线 | 风险 | 预计工作量 |
|---|---|---|---|---|---|
| **P0** | 落地数据结构与三态评审 | `task.js` `schema.js` + 扩 `criticReview`/`Qty` | 352 全绿 + 新增 ~15 | 低 | 2–3 天 |
| **P1** | Muse 结构化意图（LLM 可选） | 扩 `detectIntent` 外层 | 352 全绿 + 新增 ~10 | 中 | 2–3 天 |
| **P2** | Planner + Router 多分支 | `planner.js` `registry.js` `orchestrator.js` | 352 全绿 + 新增 ~20 | 中高 | 5–7 天 |
| **P3** | 证据专业化（ADS/MAST/反证/时间线） | 扩 `research.js` + 适配器 | 352 全绿 + research-test 扩至 ~110 | 高 | 7–10 天 |
| **P4** | research 模式 + 恢复与预算 | `orchestrator` 补状态机 + `store.putTask` | 全绿 + 新增 ~25 | 中 | 4–6 天 |

---

### P0 · 契约层落地（行为零变化）

**目标**：让后续阶段有载体，但不改变任何用户可见行为。

#### 步骤
1. 新建 `core/task.js`：`TaskState.create/load/save`，纯数据结构，暂不接入流程
2. 新建 `core/schema.js`：`validate(value, schema)`，约 60 行
3. 扩 `runtime.js` 的 `Qty`：增加 `epoch`/`frame`/`inputs`/`uncertainty`，缺失时标 `legacy:true`（不报错）
4. 扩 `agents.js:716 criticReview`：
   - 保留原 5 项 `checks`
   - 新增 `verdict: 'PASS'|'PARTIAL'|'FAIL'`（当前逻辑下 PARTIAL 恒定，因为缺 claim 层）
   - 新增 `gaps[]`（从失败的 checks 派生）
   - `meta.review` 保留旧字段，新增 `verdict`
5. 全链路写 `exec()`：在 `compose*` 的关键分支补 `runtime.exec` 记录（不改逻辑）
6. 新增 `tools/task-test.js`（~12 条）：结构完整性、序列化往返、Qty 校验
7. **【R4-04 补入】新增 `core/claims.js`：Claim 数据结构 + 4 条判定规则 + 手写 fixture**
   - 结构含 `premises` / `support[].strength` / `contradict` / `uncertainty` / `calc` / `origin`，与 `15` §1.3 同构
   - fixture 中的定量 claim 带示例 `CalcRecord`，用于验证不变量「`source='kepler'` 且 quantitative ⇒ `calc` 非空」
   - **不接 `sections`、不改 `toSections`**；真实生成归 P3（见本文件 P3 步骤 7）

> 说明：`claims.js` 此前只出现在 P3 步骤里，与 R2-09「P0 加 Claim 结构与规则」冲突。
> 现按职责拆分：P0 建结构+规则+fixture，P3 接真实生成。P0 步骤数由 6 变为 7。

#### 验收
- 352 条断言全绿（**硬性**）
- 新增 12 条结构断言通过
- 手动对比：同一问题在 P0 前后的 `answer.sections` 完全一致（逐字节 diff）
- `meta.review` 新增 `verdict` 但渲染不变（前端忽略未知字段）

#### 回滚
删除 2 个新文件 + `git revert` 3 处扩展，回到原状。

---

### P1 · Muse 结构化意图

**目标**：罕见表述不再落 `unknown`；简单问题**不增加**模型调用。

#### 步骤
1. 定 `INTENT_SCHEMA`（见《07-技术选型》§4.3）
2. 在 `detectIntent` **之外**包一层 `understand(q, ctx)`：
   - 先跑规则：命中且 `confidence>=0.8` → 直接用（**零模型调用**）
   - 未命中或低置信 → 调 LLM（复用 `sources.generate`，新增 `task:'intent'` 参数）
   - Schema 不通过 → 回退规则结果
3. `settings.orchestration.intentLLM = true|false`，默认 false（灰度开关）
4. 记录 `intentSource: 'rule' | 'rule-fallback' | 'llm'` 到 trace
5. 新增 `tools/intent-test.js`（~10 条）：规则快路径不调模型、LLM 结果校验、降级路径

#### 验收
- 简单问（"M42 在哪"）延迟不增加（规则命中，无 LLM）
- 罕见问（"帮我看看那个猎户座大星云值不值得跑一趟"）从 `unknown` 变为 `observe-target`
- LLM 不可用时行为与 P0 完全一致
- 352 全绿

#### 风险
模型延迟（2–15s）会拖慢罕见问。缓解：LLM 调用设 3s 超时，超时即降级。

---

### P2 · Planner 与多分支

**目标**：复合问题能拆成 2–4 步并并行；简单问题仍走 legacy。

#### 步骤
1. 新建 `core/registry.js`：注册 9 个工具（见《03-目标架构》§3.7），含 `argsSchema`、`cost`、`permissions`
2. 新建 `core/planner.js`：
   - `complexityOf(museResult)` 纯规则打分
   - `planFromTemplate(combination)`：7 个模板（T-A~T-G）
   - **不调用 LLM**（模板足够；LLM 规划留到 P4 评估）
3. 新建 `core/orchestrator.js`：
   - `runPlan(state)`：拓扑排序 + 并行（`Promise.all`）+ 单步超时 + 单步重试 1 次
   - 关键步失败 → 中止并标 PARTIAL；非关键失败 → 继续
4. `app.js ask` 增加分派：`complexity<=1 → legacyAsk()`；否则 `orchestrator.ask()`
5. 新增 `tools/plan-test.js`（~14 条）：复杂度打分、模板选择、依赖排序、并行正确性、预算拒绝

#### 验收
- L1 问题走 legacy，延迟不变（对比 P0 基线）
- "M42 今晚怎么看 + 为什么是红色" → 2 步并行，总耗时 < 串行 60%
- 计划非法（环/越权/超预算）→ 降级单步，不崩
- 352 全绿

#### 风险
并行写状态竞争。缓解：`StepResult` 按 id 写入，不共享可变对象；工具禁止写全局。

---

### P3 · 证据专业化

**目标**：从"搜到就行"升级为"一手优先 + 可反证 + 有时间线"。

#### 步骤
1. `research.js` 扩展 `EvidenceItem`：加 `tier`/`domain`/`independentOf`/`supports`/`contradicts`/`lang`
2. 分级替换：`TYPE_WEIGHT`(324) → `TIER_WEIGHT`（primary/secondary/tertiary）
3. 新增 `counterQueries(claims)`：按《06-科学证据》§3.2 模板生成反证查询（≤2 条）
4. 新增 `buildTimeline(evidence)`：按 `publishedAt` 排序 + 时效标注
5. **一手源适配器**（按优先级）：
   - SIMBAD（已实现，`simbad.js:91`）→ 直接接入
   - ADS：需 API token，评估是否走 worker 代理
   - MAST / JPL Horizons：CORS 与格式评估后决定（**先做可行性验证，不达标就放弃**）
6. `criticReview` 加 check#2（证据支持关系）与 check#6（反例矛盾），依赖 claim 层
7. **【R4-04 改写】在 `toSections:1049` 旁挂 `extractClaims()`**：从真实 `sections` 产出 Claim 并建立 Evidence 映射。
   结构与规则已在 P0 完成（`core/claims.js`），此处只做**生成接入**，不重复定义契约（见 `15` §3）。
   产出的 claim 标 `origin:'p3-generated'`；P0 阶段的 `'p0-fixture'` 断言不应在 P3 出现。
8. `tools/research-test.js` 从 77 条扩至 ~110 条（反证、时间线、分级、claim 映射）

#### 验收
- 每个 critical claim 有 ≥1 条可访问 URI 的 evidence
- 反证检索命中时，答案必显示冲突双方
- 缺失一手源时降级为 secondary，并标注"未取得一手数据"
- 352 全绿 + research-test 新断言全绿

#### 风险（最高）
- ADS/MAST/JPL 的 CORS 与鉴权可能根本不可行。**必须先做 2 小时可行性验证**，不达标立即放弃该项，不强行实现。
- 反证检索增加成本。缓解：限 2 条/任务、仅 critical claim。

---

### P4 · research 模式与可恢复执行

**目标**：显式研究模式；任务可中断、可续跑；预算可控。

#### 步骤
1. `settings.mode` 增加 `'research'`（UI 分段三选）
2. `store.js` 新增 `putTask/getTask/listTasks/pruneTasks`，复用 IDB 通道
3. `orchestrator` 每步之后 `TaskState.save()`；启动时检测未完成任务 → 询问是否继续（或自动续跑）
4. 预算模型完整接入（《05-编排机制》§6）：`reserve/settle`、超预算 step 标 `skipped`
5. Progress Evaluator 接入循环（现有 P2 只有单轮 plan）
6. 全局 `AbortController`：用户点"停止"→ 中断所有在途请求
7. 新增 `tools/eval-test.js`（~18 条）：七类进度判定、预算耗尽、重规划上限、恢复续跑

#### 验收
- 单步失败不毁整答（其余步骤结果保留）
- 刷新页面后能续跑未完成任务（已完成的 step 不重跑）
- 预算耗尽时输出 PARTIAL + 缺口清单，不静默
- 352 全绿

#### 风险
IDB 写入频率（每步一次）。缓解：仅 critical 完成后写，非关键步批量合并。

---

### 全局保护措施

| 措施 | 内容 |
|---|---|
| 基线快照 | P0 开始前跑全套并记录结果，作为每阶段回归对照 |
| 开关矩阵 | `orchestration`（legacy/hybrid/full）× `intentLLM`（on/off） |
| 每阶段独立提交 | 一个阶段一个 PR，可单独 revert |
| 断言只增不减 | 现有 352 条不得修改预期值（若必须改，需单独说明理由） |
| 行为对比脚本 | 每阶段跑固定 20 问，diff `sections` 结构，人工确认差异合理 |

---

### 不在本计划内的事

| 项 | 原因 |
|---|---|
| Hypothesis Tournament | 需先有争议判定能力，成本 3–5 倍，留待 P5+ 评估 |
| 服务端化 | 与离线可用冲突，仅在三类必要需求出现时启用 |
| 物理拆分 `agents.js` / `app.js` | 任务书禁止移动文件；逻辑分层已足够 |
| 淘汰 `adaptive` 死代码 | 有测试依赖，需专门任务 |

---

## 10. 测试与验收标准

> 定位：既有 352 条断言是**回归网**（保行为不变），本文新增的是**能力验收**（判升级是否成功）。
> 所有用例必须可在无网络环境下用 mock 跑通，联网用例单独标记 `@online`。

---

### 1. 断言分层

| 层 | 目的 | 形式 | 现有对应 |
|---|---|---|---|
| L0 契约 | 数据结构合法 | 纯函数断言 | 新增 `task-test` |
| L1 结构 | 答案章节齐备 | DOM/对象断言 | `selftest` 156 条 |
| L2 行为 | 链路正确（调了谁、顺序对） | trace 断言 | `research-test` 77 条 |
| L3 科学 | 结论与证据一致 | claim/evidence 断言 | 新增 `eval-test` |
| L4 性能/成本 | 延迟、调用次数、预算 | 计时 + 计数 | 新增 `perf-test` |

---

### 2. 十类验收用例

#### T1 简单知识问答

| 项 | 内容 |
|---|---|
| 用例 | "M42 是什么" |
| 预期链路 | `muse`（规则命中）→ `kb.lookup` → `composeTarget`；**不调 LLM、不检索** |
| 证据要求 | 知识库条目 ≥1，带核验日期 |
| 误差 | 无数值 |
| 成功标准 | ①`intent==='knowledge-target'` ②`intentSource==='rule'` ③`llmCalls===0` ④`searches===0` ⑤延迟 < 300ms |
| 失败标准 | 触发模型调用 / 触发检索 / 延迟 > 800ms |
| 成本记录 | `task.budget: {ms, tokens:0, llmCalls:0, searches:0}` |

#### T2 天体实时位置

| 项 | 内容 |
|---|---|
| 用例 | "M42 今晚在北京几点最高" |
| 预期链路 | `kepler.ephemeris` + `kepler.visibility` → `composeTarget` |
| 计算要求 | 必须产出 `CalcRecord`，含 `J2000`/`topocentric`/`inputs` |
| 误差 | 高度 ±0.5°；时间 ±2 min |
| 成功标准 | ①有 CalcRecord ②`method` 可复算且复算偏差在容差内 ③`meta.tier==='compute'` |
| 失败标准 | 缺历元/坐标系 / 无 inputs / 复算偏差超容差 |
| 成本记录 | `llmCalls:0`（此类任务不允许调模型算数） |

#### T3 轨道 / 星历计算

| 项 | 内容 |
|---|---|
| 用例 | "木星现在离地球多远" |
| 预期链路 | `kepler.ephemeris`（`planet('jupiter', jd)`） |
| 误差 | 距离 ±2% |
| 成功标准 | ①单位明确（AU/km）②标注"本地计算"③与公开星历对比在容差内 |
| 失败标准 | 只给"约多少"不给数 / 单位歧义 |

#### T4 新闻与论文检索

| 项 | 内容 |
|---|---|
| 用例 | "2026 年暗能量研究有什么新进展" `@online` |
| 预期链路 | `paper.search` → `evidence.search`（反证）→ `compose` |
| 证据要求 | ≥2 条 primary（论文原文或机构发布）；带 `publishedAt` |
| 时效 | ≤30 天（"新进展"类） |
| 成功标准 | ①每条结论有 URI ②时间线单调 ③若仅 secondary → verdict=PARTIAL |
| 失败标准 | 只给聚合站摘要 / 无日期 / 编造论文标题 |

#### T5 多天体参数比较

| 项 | 内容 |
|---|---|
| 用例 | "M31 和 M33 哪个更适合 80mm 拍" |
| 预期链路 | `kepler.ephemeris` ×2（并行）→ `compare.curate` → `compose` |
| 计算要求 | 两个目标各有 CalcRecord（视场匹配 + 高度） |
| 成功标准 | ①两列结果都在 ②耗时 < 单列 × 1.5（证明确实并行）③给出明确取舍理由 |
| 失败标准 | 只答一个 / 并行未生效（耗时 ≈ 串行） |

#### T6 形成机制分析

| 项 | 内容 |
|---|---|
| 用例 | "猎户座大星云为什么是红色的" |
| 预期链路 | `kb.lookup` + 可选 `evidence.search` → `composeCosmos`（或 composeTarget 的知识分支） |
| 证据要求 | 机制类结论需 ≥1 条 secondary 以上来源 |
| 成功标准 | ①区分"观测事实"与"理论解释"②标注共识等级 |
| 失败标准 | 把推演说成观测 / 无来源 |

#### T7 争议性科学问题

| 项 | 内容 |
|---|---|
| 用例 | "哈勃张力解决了吗" |
| 预期链路 | `evidence.search`（正/反各一）→ `critic` |
| 证据要求 | 必须同时呈现支持与反对证据；`conflictsWith` 非空 |
| 成功标准 | ①verdict=PARTIAL ②明确写"尚未解决"③列出双方代表文献 |
| 失败标准 | 单方面结论 / 声称"已解决" / 无冲突记录 |

#### T8 多源数据冲突

| 项 | 内容 |
|---|---|
| 用例 | mock 两个源给出不同年质（1.989e30 vs 1.981e30） |
| 预期链路 | `detectConflicts` 命中 → Critic check#6 |
| 成功标准 | ①冲突被检测 ②两个值都展示 ③标注偏差 ④不擅自选一个当定论 |
| 失败标准 | 静默取其一 / 取平均而不说明 |

#### T9 搜索失败与超时

| 项 | 内容 |
|---|---|
| 用例 | mock 所有检索源超时（模拟离线） |
| 预期链路 | `evidence.search` 全失败 → 降级本地索引 |
| 成功标准 | ①不抛未捕获异常 ②输出"联网不可用，改用本地索引" ③本地结论仍标注来源 ④verdict ≤ PARTIAL |
| 失败标准 | 白屏 / 空答案 / 谎称"已检索" |

#### T10 复杂研究任务的动态规划

| 项 | 内容 |
|---|---|
| 用例 | "帮我研究 M87 黑洞质量测量的方法差异，并说明哪种更可靠" |
| 预期链路 | Muse(LLM 或规则) → Planner(L4) → 并行 `paper.search`×2 → `claims` → `critic` → 可能 1 次 replan |
| 预期步骤 | ≥4 步，含 ≥1 次并行，≥1 次证据缺口判定 |
| 成功标准 | ①`complexity>=3` ②`steps.length>=4` ③至少一次 `progress.action!=='continue'` ④最终 verdict ∈ {PASS, PARTIAL} 且 gaps 为空或已说明 ⑤总耗时 < 120s |
| 失败标准 | 只走单步 / 无规划 / 超时未中止 / 无限循环（replan > 2） |
| 成本记录 | 完整 `Budget` 消耗 + 每步 `ms/tokens/searches` |

---

### 3. 记录格式（每个用例必须输出）

```js
RunRecord = {
  case: 'T2', mode: 'single', complexity: 1,
  steps: [{ id, tool, ms, ok, tokens }],
  budget: { msUsed, tokensUsed, llmCalls, searches, replans },
  verdict: 'PASS',
  checks: [...],
  gaps: [],
  assertions: { total, passed, failed: [] }
}
```

落盘为 `dev/test-runs/<timestamp>-<case>.json`（`dev/` 已在 `.gitignore`），便于跨版本对比。

---

### 4. 性能与成本基线

| 指标 | L1 | L2 | L3 | L4 |
|---|---|---|---|---|
| 延迟 P50 | < 300ms | < 3s | < 15s | < 120s |
| LLM 调用 | 0 | ≤1 | ≤2 | ≤3 |
| 检索轮次 | 0 | 0–1 | 1–2 | 2–3 |
| 并行度 | 1 | 2 | ≤4 | ≤4 |

**回归判定**：任一 L1 用例延迟超过基线 20% → 视为回归，阻断发布。

---

### 5. 现有 352 条断言的处置

| 处置 | 说明 |
|---|---|
| 不得修改预期值 | 它们锁定的是现有正确行为 |
| 可以新增 | 每阶段新增断言，只增不减 |
| 允许的例外 | 若某断言依赖"P0 前的字段缺失"（如 `Qty` 无 epoch），需单独标注理由并记录在阶段的验收说明中 |

**基线核对**：每阶段开始与结束时各跑一次全套，结果写入该阶段报告。

---

### 6. CI 集成

现有 `.github/workflows/test.yml` 按顺序跑 10 个套件。新增：

| 套件 | 触发 | 说明 |
|---|---|---|
| `task-test` | 每次 push | 数据结构，< 2s |
| `intent-test` | 每次 push | 规则快路径 + mock LLM，< 5s |
| `plan-test` | 每次 push | 模板与依赖，< 3s |
| `eval-test` | 每次 push | 进度判定，< 3s |
| `perf-test` | 仅 PR 到 main | 延迟基线对比，< 60s |
| `@online` 用例 | 手动 / 定时 | 需要网络的 T4 等，不阻塞 PR |

---

### 7. 验收门槛（阶段放行条件）

一个阶段算完成，必须同时满足：

1. 现有 352 条断言全绿
2. 本阶段新增断言全绿
3. 该阶段对应的验收用例通过（P0: T1/T2；P2: T5/T10 部分；P3: T4/T7/T8；P4: T10 完整）
4. 性能基线无回归（L1 延迟增幅 < 20%）
5. 无未捕获异常（`PERF.errors` 为空）
6. 手动抽查 5 个真实天文问题，答案结构合理

---

### 8. 明确不测的东西

| 不测 | 原因 |
|---|---|
| 模型输出文本质量（用词、风格） | 不可稳定断言，靠人工抽查 |
| 星历绝对精度（对比 JPL） | 自研算法有系统偏差，测"是否可复算"而非"是否绝对准" |
| 多浏览器渲染差异 | 由 `rail-test` / `a11y-test` 覆盖布局与对比度，不做像素级 |
| 第三方 API 可用性 | 外部依赖，用 mock 替代；`@online` 仅做烟雾测试 |

---

## 11. 第二轮架构评审报告

> 评审对象：`docs/architecture/01–10`（第一轮产出）
> 依据：`core/agents.js` / `core/app.js` / `core/research.js` / `core/runtime.js` 的实际代码
> 本轮**只评审与修订设计**，未改业务代码。

---

### 1. 总体结论

| 评价 | 内容 |
|---|---|
| **站得住的设计** | 三态评审、Claim/Evidence 结构、预算与停止条件、权限矩阵、模板化 Planning、渐进式开关、「并行只发生在取数层」这一方向 |
| **必须修订的设计** | ①并行边界未论证（未说明 compose 为何不可并行、合并规则缺失）②Orchestrator 单体职责过重 ③Planner 权限表述过宽 ④Critic 缺少 Claim↔Evidence 关系模型 ⑤TaskState 缺检查点语义 |
| **设计缺口（本轮新增）** | Research Loop、Controlled Delegation、搜索五段分层、A/B 对比实验 |
| **明确不改** | Kepler 数值权威、现有 compose 实现、渲染契约、13 个 Agent 名册 |

#### 1.1 关于并行的一处事实更正（评审者自纠）

初稿曾写"第一轮 05 文档主张并行调用 compose"，**核实原文后确认此说不成立**：

- `05` §2 的模板里，`compose` 始终位于并行取数**之后**（如 T-C：`∥kepler + ∥kb → compose`）
- `05` §3 列出的"天然可并行"只有 `Kepler 各目标计算、KB 查询、多个独立检索查询`

所以第一轮的方向是**正确**的。真正的缺口是：**没有论证"为什么 compose 不能并行"，也没有给合并规则**——缺少这两点，实现时极易顺手把 compose 塞进 `Promise.all`。

本轮的价值因此是「补实证 + 补规则」，不是「纠错」：

| 缺口 | 本轮补充 |
|---|---|
| 为何 compose 不可并行 | 155 处原地写、`meta` 整体替换、`app.js` 后处理仍改 `ans.meta`（`12` §1） |
| 并行后如何合并 | 分片 + Reducer：sections 按 TRACE_ORDER 拼、meta 用 assign 且 confidence 取最小（`12` §4.4） |
| 重试如何回滚 | 长度快照 + 截断（`12` §4.5） |

---

### 2. 九个特别检查（逐项判定）

#### 检查 1：Planner 是否拥有过多权限？

**判定：是，第一轮表述过宽。** 修订：收窄为"三不许"。

| 权限 | 第一轮 | 修订后 |
|---|---|---|
| 发明新流程 | 未明确禁止 | ❌ 禁止。只能从 7 个模板（T-A~T-G）中选 |
| 增删步骤 | 允许"在模板内增删可选步骤" | ✅ 仅可选步骤（`optional:true`），核心步骤不可删 |
| 选择工具 | 只读 Tool Registry | ✅ 但仅限 `caps` 匹配当前阶段 |
| 设定预算 | 未明确 | ❌ 只能申请，由 Orchestrator 按剩余预算批准 |
| 决定停止 | 未明确 | ❌ 无此权限（属 Progress Evaluator） |
| 调用 LLM 自由生成计划 | 复杂任务可用 | ✅ 但输出必须过 Schema 校验，且只能填模板槽位 |

**新增机制**：`Plan.validate(plan)` 在 Orchestrator 执行前强制校验（模板 id 合法、步骤 ⊆ 模板定义、依赖无环、预算不超总预算），不通过直接降级单步。

---

#### 检查 2：Orchestrator 是否单点复杂度过高？

**判定：是。第一轮把 5 件事塞进一个模块。** 修订：拆为三个小模块。

| 新模块 | 职责 | 规模 |
|---|---|---|
| **Scheduler** | 拓扑排序、并行批次、依赖就绪判断 | ~90 行 |
| **Runner** | 单步执行、超时、重试、快照/回滚（§4.5 审计） | ~110 行 |
| **Reducer** | 分片结果合并（sections 排序、trace 排序、meta 保守合并） | ~70 行 |

三者组合成 `Orchestrator`，对外只暴露 `ask()`。
**好处**：Runner 可单测（注入假工具）；Reducer 可单测（纯函数）；Scheduler 可单测（纯图算法）。单体则只能集成测。

---

#### 检查 3：Agent 是否有必要进行有限的横向协作？

**判定：有必要，但必须受控。** 第一轮采用"gap 上报 + 集中决策"，过于保守——它无法表达"我需要另一个 Agent 的中间结果"。

**修订：引入 Controlled Delegation（受控委派）**，规则见 §3.2。

关键限制：
- Agent **不能直接调用**另一个 Agent，只能**提交委派请求**
- 请求由 Orchestrator 校验（目标是否注册、是否越权、是否超预算、是否成环）
- 单次任务委派深度 ≤ 2，总数 ≤ 3

---

#### 检查 4：动态重规划是否会产生无限循环？

**判定：第一轮的三重上限（replan≤2 / append≤3 / retries≤1）能防死循环，但缺少"进展度量"，可能出现"空转 2 次"的浪费。**

**修订：增加单调性要求**——每次重规划必须满足其一，否则禁止：
- 新增 ≥1 个已完成步骤
- 新增 ≥1 条 evidence
- 消除了 ≥1 个 conflict
- 缩小了 gap 集合

连续 2 次重规划无任何一项改善 → 强制 `stop`，输出 PARTIAL + "已尝试 N 次无进展"。

---

#### 检查 5：Evidence Store 是否存在重复数据或错误关联？

**判定：重复风险高，关联风险中。**

| 风险 | 具体表现 | 修订 |
|---|---|---|
| 重复 evidence | 同一 DOI 的不同 URL（`doi.org/x` 与 `dx.doi.org/x`） | 幂等键：`normDoi(uri) \|\| normTitle(title)`，复用 `research.js:146-155` |
| 重复 claim | 同一结论在多个 compose 分支各自生成 | claim 键：`hash(entities + numbers + type)`，命中即复用 |
| 错误关联 | 摘录中含相同数字但语境不同（如"43°"既可能是高度也可能是纬度） | 关联必须带**上下文窗口**：匹配时要求数字前后 20 字符内出现单位或关键词 |
| 跨轮污染 | Knowledge Cache 复用了旧历元结论 | 缓存键必须含 `epoch` 与 `dataVersion`（第一轮已提，本轮明确字段） |

**新增**：`EvidenceStore.link(claimId, evidenceId, {relation:'supports'|'contradicts', strength, context})`，关联本身也是实体，可审计、可撤销。

---

#### 检查 6：Critic 是否会把模型判断误当成科学事实？

**判定：存在真实风险。** 第一轮的"规则有否决权、LLM 只能降级"方向正确，但缺少**数据层面的区分**。

**修订**：三条硬规则 + 数据标记。

1. 每个检查项的结论必须带 `source: 'rule' | 'llm' | 'calc'`
2. `verdict` 的计算**只读 `source==='rule'||'calc'` 的结果**；`llm` 结果只能附加 `note`，不参与判定
3. `verdict=PASS` 的必要条件：所有 critical claim 的 support 均来自 `source!=='llm'` 的检查

**这意味着**：LLM 可以说"我怀疑这个推理有问题"，但不能让 verdict 变成 FAIL；反之亦然。
用户可见层面：`meta.review.llmNote` 单独展示，与"通过/未通过"分开。

---

#### 检查 7：TaskState 能否应对页面刷新与任务中断？

**判定：结构上可以（全 JSON 可序列化），但第一轮缺少"何时写、写到什么粒度、恢复后怎么续"的具体语义。** 修订见 §3.4。

关键点：**只有"幂等步骤"允许重放**。Kepler 计算幂等 ✅；检索不幂等（每次结果可能不同）→ 恢复时检索步骤标记为"需重跑"而非"复用旧结果"。

---

#### 检查 8：并行执行是否可能修改同一个 answer 对象？

**判定：会，实测确认。** 证据见 `12-执行安全性审计.md`：

- 155 处原地写
- `answer.meta = {...}` 整体替换（`agents.js:2158`）
- `app.js` 后处理阶段仍写 `ans.meta`

**修订**：并行只允许在**分片**上进行（`12` §4.4），合并由 Reducer 负责。这是本轮对 05 文档最重要的修订。

---

#### 检查 9：现有 compose 函数能否直接作为 Tool Adapter？

**判定：不能直接，但可低成本包装（约 25 行/个，可工厂化）。** 依据 `12` §5：

- 签名依赖 `answer` 而非 `args`
- 原地写共享对象
- 返回 `answer` 而非结果
- 依赖前置 resolver

**修订**：`makeComposeTool(id, fn)` 工厂统一生成，内部建分片、调函数、取结果。

---

### 3. 七项重点机制设计

#### 3.1 Research Loop（动态研究循环）

**解决的问题**：第一轮只有"单轮 plan + 最多 2 次 replan"，无法表达"搜到新线索后主动深入"。

**与 replan 的区别**（关键，避免概念重复）：

| | Replan | Research Loop |
|---|---|---|
| 触发 | 计划本身不可执行（工具失败、依赖断裂） | 执行**成功**但发现新问题（新实体、新争议、证据指向新方向） |
| 本质 | 修复 | 扩展 |
| 上限 | 2 次 | 2 轮 |
| 预算 | 不额外批 | 每轮需申请，且总预算不超过初次的 50% |

**执行过程**：

```
执行完成 → Progress Evaluator 扫描 results
  ├─ 发现新实体（未在初始 entities 中）→ 生成 follow-up 子任务
  ├─ 发现争议（conflicts 且双方都是 primary）→ 生成反证子任务
  └─ 发现"结论依赖未验证前提" → 生成前提验证子任务
→ Planner.expand(plan, newTasks)  ← 只能追加，不能改已完成的
→ Orchestrator 执行增量
→ 再次评估（最多 2 轮）
```

**输入**：`{taskState, newFindings[]}`
**输出**：`{appendedSteps[], budgetRequest}`
**成本**：每轮最多 +2 步、+1 次检索；总预算增加 ≤ 50%
**强制约束**：Loop 产生的步骤**不得修改已有结论**，只能新增证据或标注矛盾。

---

#### 3.2 Controlled Delegation（受控委派）

**解决的问题**：Agent 之间需要传递中间需求，但不能自由调用。

**协议**：

```js
DelegationRequest = {
  from: 'horizon',              // 发起方（必须在 AGENTS 名册内）
  to: 'kepler',                 // 目标（必须已注册为工具）
  need: 'compute',              // compute | evidence | kb
  args: { ... },
  reason: '需要 21:00 的地平高度以判断是否被遮挡',
  ttl: 1                        // 允许的委派链深度
}
```

**Orchestrator 校验清单**（任一不通过即拒绝并记录）：

1. `from` 与 `to` 均在白名单
2. `to` 的工具 `caps` 覆盖 `need`
3. 当前深度 < 2
4. 本任务累计委派 ≤ 3
5. 预算允许
6. 不成环（`to` 未在本链上游出现过）

**执行**：作为**子步骤**插入当前计划的下一批，结果回传给发起方（写进其分片 `meta.delegated`）。
**成本**：每次委派 = 1 次工具调用，计入总步数。
**禁止**：发起方等待期间不得阻塞其他分支（Delegation 是异步追加，不是同步调用）。

---

#### 3.3 Scientific Critic 的数据关系模型

**解决的问题**：第一轮只说"7 项检查"，没定义 Claim / Evidence / Reasoning / Uncertainty 之间的关系，导致实现时无从下手。

**关系模型（实体 + 边）**：

```
Claim ──supports──▶ Evidence      (strength: strong | partial | weak)
Claim ──contradicts─▶ Evidence    (strength 同上)
Claim ──derivedFrom─▶ Claim       (推理链：前提 → 结论)
Claim ──hasUncertainty──▶ Uncertainty
Evidence ──independentOf──▶ Evidence
Evidence ──derivedFrom──▶ Evidence   (同一论文的不同转载)
```

**Reasoning 的表达**：不引入自然语言推理链，而是**显式的 Claim 依赖图**：

```js
Claim {
  id, text, type,
  premises: ['c1','c2'],        // derivedFrom：本结论依赖哪些前提
  support: [{eid, strength}],
  contradict: [{eid, strength}],
  uncertainty: { kind:'measurement'|'model'|'definition'|'temporal',
                 value: 0.3, basis:'±0.5° 来自星历精度' }
}
```

**评审如何用这张图**（4 条可执行规则）：

| 规则 | 判定 |
|---|---|
| R1 前提断裂 | 任一 `premises` 中的 claim 未通过检查 → 本 claim 最高 PARTIAL |
| R2 强度不匹配 | `support` 全部为 `weak` 而 claim 用了"确定/已证实"措辞 → FAIL |
| R3 矛盾未处理 | `contradict` 非空且 `uncertainty.kind!=='model'` → 必须 PARTIAL 并展示 |
| R4 不确定性缺失 | `type==='quantitative'` 但无 `uncertainty` → FAIL（数值必须有误差） |

**成本**：Claim 生成在 `toSections` 同批完成（零额外模型调用）；关系边由规则填充。

---

#### 3.4 TaskState 完善（阶段 / 步骤状态 / 检查点 / 恢复）

**阶段枚举**（与 05 的状态图对齐）：

```
INIT → UNDERSTAND → ROUTE → PLAN → EXECUTE → PROGRESS → (REPLAN|EXPAND|JUDGE) → COMPOSE → DONE
                                                        ↘ ABORTED / PARTIAL
```

**步骤状态机**（第一轮缺失，本轮补）：

```
pending → ready → running → (ok | failed | skipped | blocked)
failed → retrying → (ok | failed_permanent)
blocked（依赖失败且非 optional）
```

**检查点语义**：

| 时机 | 写什么 | 为什么 |
|---|---|---|
| PLAN 完成 | `plan` + `budget` | 刷新后不必重新规划 |
| 每个 critical step 完成 | `results[stepId]` | 避免重跑昂贵计算 |
| 每次 PROGRESS 决策后 | `progress` + `budgetUsed` | 恢复后续跑不会重复决策 |
| 不写 | 中间状态（running） | 无意义，恢复时按 `pending` 重跑 |

**恢复规则**：

1. 读 `phase`，从对应阶段继续
2. `ok` 的步骤**不重跑**（幂等前提见下）
3. `running` 的步骤视为 `pending`
4. 幂等性分级：Kepler 计算 ✅ 可复用；检索 ❌ 必须重跑（结果随时间变）；LLM 表述 ✅ 可复用（同一 facts 同一输出，但可选刷新）
5. 恢复次数上限 1 次（防止"刷新→续跑→再刷新"死循环）

---

#### 3.5 搜索架构五段分离

**解决的问题**：现有 `Research.run` 把"计划→执行→提取→映射→评估"揉在一个函数（约 500 行），无法单独测试某一段。

| 段 | 职责 | 复用 | 输出 |
|---|---|---|---|
| **S1 计划** | 生成查询（含语言/渠道/优先级） | `plan`(425) / `buildQuery`(412) | `SearchPlan{queries[]}` |
| **S2 执行** | 调 provider、超时、重试、降级 | `defaultSearchFn`(515) | `RawHit[]` |
| **S3 提取** | 去重、分级、抽摘录 | `dedupe`(259) / `rank`(349) | `EvidenceItem[]` |
| **S4 映射** | 关联到 Claim | **新增** `EvidenceStore.link` | 关系边 |
| **S5 评估** | 冲突、独立性、时效 | `detectConflicts`(788) / `verifyCitations`(837) | `EvidenceReport` |

**关键收益**：S3 可离线单测（喂假 RawHit）；S4 可幂等重跑（只改关系不改数据）；S5 可独立回归。
**成本**：多一层对象传递，约 +60 行胶水代码；现有函数不改，只在外层串联。

---

#### 3.6 架构对比实验（A/B）

**目的**：证明升级确实更好，而不是"感觉更专业"。

| 维度 | 指标 | 采集方式 |
|---|---|---|
| 准确性 | 关键数值与权威源偏差（见容差表） | 自动比对 |
| 证据覆盖率 | 有 URI 支撑的 critical claim / 总 critical claim | TaskState 统计 |
| 成本 | LLM 调用数、检索次数、token | `Budget` 计数 |
| 延迟 | P50 / P95 | 计时 |
| 稳定性 | 同一问题重复 5 次的输出结构一致率 | 结构 diff |

**实验设计**：固定 20 题（含 10 类用例各 2 题），在 `orchestration=legacy` 与 `=full` 下各跑 5 次，输出对照表。

**预期**（不作为验收标准，仅作方向判断）：

| 维度 | 旧 | 新（预期） |
|---|---|---|
| 简单题延迟 | 基线 | 持平（±10%） |
| 复合题证据覆盖率 | 低（单分支） | 显著提升 |
| 简单题成本 | 0 LLM | 0（必须保持） |
| 复杂题成本 | 低 | 增加 1–2 次调用 |

**若新架构在简单题上变慢或变贵 → 视为设计失败，回退。**

---

#### 3.7 执行安全性

见 `12-执行安全性审计.md`，本轮结论已并入 §2 检查 8/9 与 §3.4 幂等分级。

---

### 4. 新增机制的成本汇总

| 机制 | 解决什么 | 额外成本 | 是否阻塞 P0 |
|---|---|---|---|
| Research Loop | 无法深入追线索 | +2 步、+1 检索、预算 +50% 上限 | 否（P4） |
| Controlled Delegation | 横向需求无处表达 | +1 工具调用/次，≤3 次/任务 | 否（P2 后） |
| Claim 关系模型 | Critic 无从判断 | 无额外模型调用（随 sections 生成） | **是（P0）** |
| TaskState 检查点 | 刷新即失 | 每 critical step 一次 IDB 写 | **是（P0）** |
| 搜索五段分离 | 无法单测某段 | +60 行胶水 | 否（P3） |
| A/B 实验 | 无法证明收益 | 20 题 × 5 次 × 2 模式 | 否（P4 收尾） |
| 委派校验 | 权限失控 | +1 校验函数（~40 行） | 否（P2） |

---

### 5. 待验证项

| 项 | 原因 | 验证方式 |
|---|---|---|
| compose 是否修改 `ctx` | 未逐行确认 | 传 `Object.freeze(ctx)` |
| 多目标 composetTonight 耗时 | 未压测 | 20 目标压测 P95 |
| 现有答案的 `meta` 字段完整率 | 未抽样 | 20 条样本统计 |
| ADS/MAST 是否支持浏览器直连 | 可行性未验证 | 2 小时接口验证（详见 09 的 P3） |
| Claim 生成对现有渲染的影响 | 未验证 | 在 `toSections` 旁挂产出，不改渲染 |

---

### 6. 需要用户决策

1. 是否接受"并行只能在分片上进行"（意味着并行度的实际收益小于第一轮预期）
2. Research Loop 的预算上限（50%）是否合适
3. Controlled Delegation 是否值得引入（P2 之后评估，也可永久不做）
4. P0 是否立即启动（本轮修订已明确 P0 的边界：Claim 关系模型 + TaskState 检查点）

---

## 12. 执行安全性审计

> 审计对象：`core/agents.js` 的 13 个 `compose*` 函数及其调用环境
> 方法：静态符号检查 + 抽样逐行阅读。**未执行代码，未修改代码。**
> 标注约定：`[实测]` = 有明确代码证据；`[推定]` = 按统一模式推断，未逐行确认。

---

### 1. 事实基线

| 事实 | 证据 | 影响 |
|---|---|---|
| `agents.js` **无 DOM 操作** | 全文件未出现 `document.` / `window.`（除 IIFE 根对象）`[实测]` | 可在非浏览器环境测试 |
| **无异步** | 未出现 `Promise` / `async` / `await` / `setTimeout` | 全部同步，无并发时序问题 |
| **无随机** | 未出现 `Math.random` `[实测]` | 输出确定 |
| **无当前时间读取** | 仅 `new Date(...)`（`agents.js:108` 时区、`:424` 日期加减），均以入参为基准 `[实测]` | 相同 ctx + cfg → 相同输出，**可复算** |
| 对 `answer` 的原地写 | 155 处 `answer.*.push` / `answer.* =` `[实测]` | 共享对象，并行会互相破坏 |
| `answer.meta` 整体替换 | `composeSmalltalk` 末尾 `answer.meta = {…}`（`agents.js:2158`）`[实测]` | 并行时后写覆盖先写 |
| `step()` 是纯函数 | 只构造对象并 `return`，不 push（`agents.js:597-607`）`[实测]` | 写 trace 的是调用方，可精确控制 |
| 后处理阶段仍改 `answer` | `app.js` 写 `ans.meta.tier/confidence/freshness/research/styleSwitch`（`2804/3387/3402/3461/3785`）`[实测]` | answer 不是"构建完即冻结" |

**结论 A**：`compose*` 是**同步、确定、无外部副作用，但会原地修改共享 `answer`** 的函数。

---

### 2. 13 个 compose 的副作用矩阵

统一调用形态：

```js
function composeXxx(answer, ctx, cfg [, target] [, question]) {
  // 读：answer.query / answer.targets / answer.intent，ctx，cfg
  // 写：answer.trace.push(...)   answer.sections.push(...)   answer.meta = {...}
  // 返回：answer
}
```

| # | 函数 | 写 trace | 写 sections | 改 meta | 外部依赖 | 可并行 | 备注 |
|---|---|---|---|---|---|---|---|
| 1 | composeTarget (896) | ✅ | ✅ | ✅ | `astro` / `CAT` | ❌ | 主体分支，含 3 种 intent 共用 |
| 2 | composeTonight (1180) | ✅ | ✅ | ✅ | `astro`（多目标循环） | ❌ | 打分循环，CPU 较高 |
| 3 | composeEvent (1245) | ✅ | ✅ | ✅ | `astro` / KB | ❌ | |
| 4 | composeGear (1336) | ✅ | ✅ | ✅ | `data/gear.js` | ❌ | |
| 5 | composeChart (1357) | ✅ | ✅ | ✅ | `CAT.constellations` | ❌ | |
| 6 | composeCosmos (1384) | ✅ | ✅ | ✅ | KB | ❌ | |
| 7 | composeNova (1476) | ✅ | ✅ | ✅ | KB | ❌ | |
| 8 | composeHelios (1543) | ✅ | ✅ | ✅ | KB / `astro` | ❌ | |
| 9 | composePhoto (1668) | ✅ | ✅ | ✅ | KB / `astro` | ❌ | |
| 10 | composeSystemView (1791) | ✅ | ✅ | ✅ | `data/solarsystem` | ❌ | 会触发视图指令（`meta.systemAction`） |
| 11 | composeGearFit (2063) | ✅ | ✅ | ✅ | `data/gear` / `astro` | ❌ | |
| 12 | composeSmalltalk (2131) | ✅ | ✅ | ✅ **整体替换** | 无 | ❌ | 已逐行确认 `[实测]` |
| 13 | composeFallback (2165) | ✅ | ✅ | ✅ | `gapFor` | ❌ | |

> 第 1–11、13 项按统一模式 `[推定]`（抽样读了 composeTarget / composeTonight 片段），第 12 项 `[实测]`。

#### 2.1 唯一的"外部副作用"

`composeSystemView` 会在 `meta.systemAction` 里写入视图指令，由 `app.js:3807 applySystemAction` 真正操作 3D 视图。

**这意味**：compose 本身无副作用，但**其产物会间接触发 DOM/渲染副作用**。并行或重试时，`systemAction` 必须只执行一次（否则视图会被反复重置）。

#### 2.2 逐项审计要求（第三轮新增 R3-10）

上表 13 项中，**只有 `composeSmalltalk` 是逐行实测**，其余 12 项按统一模式推定。
为避免实施时把推定当结论，要求 P2 启动前补齐下表**每一项 × 6 个维度**：

| 维度 | 检查方法 | 判定标准 |
|---|---|---|
| 副作用 | 全文搜索 `document.` / `window.` / `localStorage` / fetch | 出现即记为有副作用 |
| 共享状态 | 搜索对 `STATS`/`MEMORY`/`CUSTOM`/`ALIAS` 的写 | 出现即需隔离 |
| 数据依赖 | 静态读：读了 `answer.*` / `ctx.*` 的哪些字段 | 记录为只读依赖清单 |
| 并行安全 | 该函数是否写 `answer.sections/meta` | 写则**不可并行** |
| 重试安全 | 连续调用两次，比较两次写入的 sections 是否相同 | 不同则不可直接重试 |
| 中断安全 | 估算最坏循环次数（如 `windowsWithin` 288 次） | >1e5 次需可中断 |

**推荐验证手段**（均不需改业务代码）：

```js
// 1) 是否修改 ctx：传冻结对象，抛错即证明有写
const frozen = Object.freeze(Object.assign({}, ctx));
composeXxx(shard, frozen, cfg, target, q);

// 2) 重试安全性：同一输入跑两次，比对 sections 深比较
const a1 = runInShard(fn, input), a2 = runInShard(fn, input);
assert(deepEqual(a1.sections, a2.sections));

// 3) 并行安全性：两个分片并发执行，断言互不污染
```

**当前进度**：1/13 实测。未完成前，`[推定]` 结论**不得**用于"合并规则已确定"之类的判断。

##### 【第四轮补充 R4-05】逐 intent 覆盖测试的结果

`tools/ctx-isolation-test.js` 已跑通 15 个 intent（覆盖 13 个 compose 分支），结论：

| 检查 | 结果 |
|---|---|
| ctx 是否被修改 | ❌ 未修改（15 个分支全部） |
| CITIES 是否被污染 | ❌ 未污染 |
| 是否有异常 | 无 |
| 重复执行是否一致 | 一致 |

**同时暴露的依赖事实**（读代码看不出来，跑测试才暴露）：

| compose | 隐含依赖 | 缺了会怎样 |
|---|---|---|
| `composeGearFit` | `data/gear.js`（GEAR） | `GEAR is not defined` |
| `composeGearFit` | `core/fit.js`（FIT）+ `data/obsplan.js`（OBSPLAN） | `reading 'evaluate' of undefined` |
| `composeSystemView` | `data/solarsystem.js` | 未单独验证 |

→ **13 个 compose 的依赖不止 `astro/KB/CAT`**。P2 把 compose 包成工具时，Tool Registry 的 `deps` 字段需按此登记，否则按需加载会漏。

---

### 3. 共享可变状态清单

| 状态 | 位置 | 写入时机 | 并发风险 | 处置 |
|---|---|---|---|---|
| `answer` | `buildAnswer:683` 创建，传入每个 compose | 每次 push/赋值 | **高**：并行必冲突 | 并行前隔离 |
| `AGENT_BY_ID` | `agents.js:286` | 启动时构建 + `setCustomAgents` | 低（只读为主） | 保持不变 |
| `ALIAS` | `agents.js:296` | 惰性一次构建：`buildAlias()` 有 `if (READY) return`（`:301`），末尾 `READY = true`（`:334`） | **低**：JS 单线程 + 构建无 await，不存在并发打断 | 保持不变，注明为模块级只读 |

> **【第三轮补充修订 R4-03】纠正**：本表原写「`buildAlias()` 每次 `buildAnswer` 重建，并发时互相清空」——**该结论错误**。
> 源码有 `READY` 守卫，只构建一次（测试 E 已验证行为稳定）。
> 真实风险不在并发，而在"别名表构建后是否随知识库/自定义 Agent 变更失效"——属功能问题，非并发问题，本轮不处理。
| `MEMORY` | `agents.js:622` | 外部 `setMemory` 调用 | 低（buildAnswer 内不写） | 不变 |
| `STATS` | `agents.js:649` | `buildAnswer` 尾部（`:702-705`） | 低（计数丢失可接受） | 不变 |
| `CUSTOM` | `agents.js:774` | `setCustomAgents` | 低 | 不变 |
| `LOG` | `research.js:512` | `finish()` 内 push/shift（`:1173`） | 低（日志） | 不变 |
| SIMBAD 缓存 | `simbad.js:20` localStorage | 查询后写 | 中：并发写可能互相覆盖 | 加时间戳合并 |

**结论 B**：真正危险的只有 `answer` 与 `ALIAS`。

---

### 4. 六个维度的判定

#### 4.1 副作用（Side Effects）

| 项 | 判定 |
|---|---|
| 写全局变量 | ❌ 无（除 `STATS`，且在 buildAnswer 而非 compose 内） |
| 网络请求 | ❌ 无 |
| DOM 操作 | ❌ 无（`systemAction` 由 app.js 执行） |
| 文件/存储 | ❌ 无 |
| 修改入参 `cfg` | ⚠️ **有**：`buildAnswer:661` 先 `JSON.parse(JSON.stringify(cfg))` 深拷贝 → compose 改的是副本 `[实测]` |
| 修改入参 `ctx` | ⚠️ 有：`buildAnswer:669/674` 用 `Object.assign({}, ctx, …)` 生成新对象；但 compose 内部是否再改 ctx 未逐行确认 `[待验证]` |

**结论**：compose 对 `answer` 之外的入参基本安全（cfg 已深拷贝）。

#### 4.2 共享状态

见 §3。核心风险是 `answer`。

#### 4.3 数据依赖

```
resolveTargets → detectIntent → compose*（依赖 answer.intent / answer.targets）
```
compose 之间**无相互依赖**，但都依赖同一个 `answer` 的**前置字段**（intent/targets/ctx）。
→ 若并行，必须先把前置字段冻结（浅拷贝出一份只读快照）。

#### 4.4 并行安全性

**直接并行：不安全 ❌**

三个具体冲突点：
1. `answer.sections.push` → 交错写入，顺序不确定（渲染顺序依赖于此）
2. `answer.meta = {...}` → 整体替换，后完成者覆盖前者
3. `answer.trace.push` → trace 有 `TRACE_ORDER` 排序，**这是唯一被保护的项**

**安全的并行方式**：为每个并行分支创建独立的 `answer` 分片：

```js
function runComposeIsolated(fn, base) {
  const shard = {
    query: base.query, intent: base.intent, ctx: base.ctx,
    targets: base.targets,          // 只读共享
    trace: [], sections: [], meta: {}
  };
  fn(shard, shard.ctx, base.cfg, ...);   // 在分片内写
  return shard;                          // 由 Reducer 合并
}
```

合并规则（必须显式定义，否则等于没解决）：
- `sections`：按 `TRACE_ORDER` 中对应 agent 的顺序拼接，而非完成顺序
- `trace`：合并后统一排序（现有机制，天然支持）
- `meta`：**禁止并行分支各自整体替换**；改为 `Object.assign` 合并，且 `confidence` 取**最小值**（保守，缺失按 0.5）；
  `computed` **不再用逻辑或**——改为 `calcCoverage:{computed,total}`，原因见 `15` §6.2 与 `05` §3.1

#### 4.5 重试安全性

| 条件 | 是否满足 |
|---|---|
| 幂等（同输入同输出） | ✅ 无随机、无 `Date.now` |
| 无外部副作用 | ✅ 无网络/存储 |
| 可回滚（重试前清理上次写入） | ❌ **不满足**：写入直接进 `answer`，无标记 |
| 可判失败 | ✅ 异常可捕获 |

**结论**：可重试，但**重试前必须能丢弃上次的部分写入**。做法：每次 compose 调用前记录 `sections.length` / `trace.length` 快照，失败时截断回快照：

```js
const mark = { s: answer.sections.length, t: answer.trace.length, meta: {...answer.meta} };
try { fn(answer, ...); }
catch (e) {
  answer.sections.length = mark.s;      // 截断
  answer.trace.length = mark.t;
  answer.meta = mark.meta;              // 恢复
}
```

这是**当前代码做不到、但可以在编排层 30 行实现**的补救，无需改 compose。

#### 4.6 中断安全性

| 项 | 判定 |
|---|---|
| 有网络请求可中断吗 | compose 内无网络 → 无中断点 |
| 有长循环吗 | ✅ `windowsWithin`（`agents.js:497`）以 5 分钟步进扫全天 ≈ 288 次；`composeTonight` 对多目标重复调用 |
| 单次耗时 | 实测级：单目标 < 10ms，多目标 < 100ms `[推定，未压测]` |
| 中断需求 | **低**：短同步计算，中断收益 < 实现成本 |

**结论**：compose 层**不需要**中断机制。中断需求应只作用于**检索与模型调用**（已有 `withTimeout` + `AbortController`）。

---

### 5. 「compose 能否直接作为 Tool Adapter」

**不能直接，但可以低成本包装。**

| 障碍 | 说明 | 包装方案 |
|---|---|---|
| 签名依赖 `answer` | `(answer, ctx, cfg, target, question)` 而非 `(args)` | adapter 内建临时 answer |
| 原地写共享对象 | 见 §4.4 | 用分片（§4.4 代码） |
| 返回 `answer` 不是结果 | 调用方要的是 sections | adapter 返回 `{sections, trace, meta}` |
| 依赖前置 resolver | `resolveTargets` / `detectIntent` 在 buildAnswer 内 | adapter 前置调用，或由 Muse 统一完成 |

推荐 adapter 形态（约 25 行/个，可用工厂统一生成）：

```js
function makeComposeTool(id, fn) {
  return {
    id, caps: ['compose'], timeoutMs: 200,
    run(args, ctx) {
      /* 【R4-02】newShard 内部对 ctx 做双层拷贝 + 冻结：
       * 浅拷贝会让 base.ctx.cityRef 在各分片间共享（测试 A1 已证会污染源对象） */
      const shard = newShard(args);
      const out = fn(shard, shard.ctx, ctx.cfg, args.target, args.question);
      return { sections: out.sections, trace: out.trace, meta: out.meta };
    }
  };
}
```

**代价**：每个工具多一次浅拷贝（微秒级），换来并行安全与可重试。

---

### 6. 风险清单

| # | 风险 | 等级 | 触发条件 | 缓解 |
|---|---|---|---|---|
| 1 | 并行写 `answer` 导致 sections 交错 / meta 覆盖 | **高** | 启用并行 compose | 分片 + Reducer 合并（§4.4） |
| 2 | 重试后残留半成品 sections | 高 | 任一 compose 抛错后重试 | 长度快照 + 截断（§4.5） |
| 3 | ~~`buildAlias()` 每次重建 ALIAS，并发时互相清空~~ | ~~中~~ → **已排除** | — | 见 R4-03：有 `READY` 守卫，只构建一次；单线程无并发 |
| 4 | `systemAction` 被执行多次 | 中 | 重试 composeSystemView | 在 Orchestrator 层去重执行 |
| 5 | `meta` 整体替换丢字段 | 中 | 任意 compose 的 `meta = {...}` | Reducer 用 `Object.assign` 合并 |
| 6 | `composeTonight` 多目标循环耗时线性增长 | 低 | 大量目标 | 单元测试加超时断言 |
| 7 | SIMBAD 缓存并发写覆盖 | 低 | 并发查询同一天体 | 写入前比对 `retrievedAt` |
| 8 | `ctx` 被 compose 内部修改污染后续 | 低 | 未确认，需实测 `[待验证]` | 传 `Object.freeze(ctx)` 暴露问题 |

---

### 7. 待验证项（无法从静态阅读确认）

| 项 | 建议验证方式 |
|---|---|
| compose 内部是否修改 `ctx` | 在测试里传 `Object.freeze` 的 ctx，抛错即证明有写；或断言 ctx 前后深比较 |
| 多目标场景的实际耗时 | 用 `composeTonight` 对 20 个目标压测，记录 P95 |
| `meta` 字段在真实答案中的完整性 | 抽样 20 条答案，检查 `meta` 是否都含 `confidence/freshness/register` |
| `answer` 在后处理阶段被写后，是否被再次传给 compose | 追踪 `app.js:3784` 之后的调用链（本轮未完整追踪） |

---

### 8. 审计结论（供评审报告引用）

1. **compose 层是"纯计算 + 原地写共享对象"**，这是当前架构最关键的实现事实
2. 因此：**并行只能在隔离分片上进行**，原设计（05 文档）"多个 compose 并行"的说法**必须修订**
3. **重试可行**，但需要编排层的快照/截断，compose 本身不用改
4. **中断不必做**在 compose 层，做在网络层已足够
5. **Tool Adapter 可行**，代价是每个函数包一层分片构造（约 25 行，可工厂化）
6. 唯一需要修改现有代码的地方是 `buildAlias` 的重复重建（风险 3），但**本轮不改**，仅登记

---

## 13. 架构设计修订记录

> 记录第二轮评审对第一轮文档（01–10）的全部修改。
> 每条含：位置、修改前、修改后、原因、依据。
> 业务代码未改动。

---

### 修订概览

| 编号 | 文档 · 章节 | 类型 | 一句话原因 |
|---|---|---|---|
| R2-01 | 05 §3.1（新增） | 补强 | 原文说了"哪里能并行"，没说"compose 为何不能"及合并规则 |
| R2-02 | 05 §5.1（新增） | 新增 | 缺少"执行成功后主动深入"的机制 |
| R2-03 | 03 §3.3 | 收窄 | Planner 权限表述过宽，易被实现成自由编排 |
| R2-04 | 05 §5.1 | 新增 | 三重上限能防死循环，但防不了"空转" |
| R2-05 | 03 §3.4 | 拆分 | Orchestrator 单体职责过多，不可单测 |
| R2-06 | 06 §2.1 | 扩展 | Claim 缺 premises/strength/uncertainty，无法判"证据是否支持" |
| R2-07 | 06 §4.0（新增） | 新增 | 7 项检查是清单，缺"如何推出结论"的规则 |
| R2-08 | 08 §3 | 追加 | 新增 4 个控制层模块需入映射表 |
| R2-09 | 09 开头 | 调整 | P0/P2 范围变化，新增 P2.5 |
| R2-10 | 11 §1.1（新增） | 自纠 | 初稿错误指控第一轮"主张 compose 并行"，核实后撤回 |

---

### R2-01 并行边界与合并规则

**位置**：`05-动态任务编排机制.md` §3.1（新增小节）

**修改前**：
> 只列出"天然可并行：Kepler 各目标计算、KB 查询、多个独立检索查询"与"天然串行：…compose → critic"，未解释原因，也未给合并规则。

**修改后**：
新增三块内容——
1. 实测事实表（155 处原地写 / `meta` 整体替换 / 后处理仍改 `ans.meta`）
2. 隔离分片 `newShard(base)`
3. Reducer 合并规则表（sections 按 TRACE_ORDER、confidence 取最小、systemAction 去重）
4. 重试回滚（长度快照 + 截断）

**原因**：方向对了但没给"为什么"，实现者极易把 compose 塞进 `Promise.all`；且并行后如何合并完全空白。

**依据**：`12-执行安全性审计.md` §1、§4.4、§4.5（`agents.js:2158`、`app.js:2804/3387/3461`）

---

### R2-02 Research Loop

**位置**：`05` §5.1（新增小节）

**修改前**：只有 replan（修复不可执行的计划），最多 2 次。

**修改后**：新增 Research Loop，与 replan 明确区分——

| | Replan | Research Loop |
|---|---|---|
| 触发 | 计划不可执行 | 执行成功但发现新线索 |
| 上限 | 2 次 | 2 轮 |
| 预算 | 不额外批 | ≤ 初始预算 50% |

并限定只有三类发现可触发（新实体 / 一手源争议 / 前提未验证），且 Loop 不得修改已有结论。

**原因**：真实研究场景中，"搜到了但出现新问题"比"计划失败"更常见。缺这一层，系统会停在第一轮结果。

**成本**：每轮 +2 步、+1 检索，预算上限 +50%。

---

### R2-03 Planner 权限收窄

**位置**：`03-目标架构设计.md` §3.3

**修改前**：
> "Planner 的自由度仅限于：在一个模板内增删可选步骤，不允许发明模板外的新流程。"

**修改后**：改为显式「三不许」表格 + `Plan.validate()` 校验：

| 权限 | 修改前表述 | 修改后 |
|---|---|---|
| 发明流程 | "不允许"（文字约束） | ❌ 代码校验（模板 id 白名单） |
| 删核心步骤 | 未明确 | ❌ 仅 `optional:true` 可省 |
| 设预算 | 未明确 | ❌ 只能申请，Orchestrator 批准 |
| 决定停止 | 未明确 | ❌ 属 Progress Evaluator |
| LLM 生成计划 | "复杂任务用" | ✅ 但只能填模板槽位 + 过 Schema |

**原因**：文字约束无法防止实现漂移；必须落到 `Plan.validate()` 的校验项里。

**依据**：`11` §2 检查 1。

---

### R2-04 进展单调性（防空转）

**位置**：`05` §5.1 末尾

**修改前**：三重上限（replan≤2 / append≤3 / retries≤1）保证不死循环，但没有"是否真的前进了"的判断。

**修改后**：每次 replan / Loop 必须至少满足一项，否则强制 stop：
- 新增已完成步骤 ≥1
- 新增 evidence ≥1
- 消除 conflict ≥1
- 缩小 gap 集合

连续 2 次无改善 → `stop` + PARTIAL + "已尝试 N 次无进展"。

**原因**：上限只能限制"次数"，不能保证"进展"。2 次空转同样是浪费，且会拖长延迟。

---

### R2-05 Orchestrator 拆三件套

**位置**：`03` §3.4

**修改前**：单一模块，承担调度 + 执行 + 超时 + 重试 + 结果汇总。

**修改后**：

| 子模块 | 职责 | 规模 | 可测性 |
|---|---|---|---|
| Scheduler | 拓扑、并行批次、就绪判定 | ~90 行 | 纯图算法 |
| Runner | 执行、超时、重试、分片、回滚 | ~110 行 | 注入假工具 |
| Reducer | 分片合并、排序、meta 保守合并 | ~70 行 | 纯函数 |

对外仍只有 `Orchestrator.ask()`。

**原因**：单体只能集成测试，任何一个 bug 都要跑全链路；拆分后三者可独立单测，且 Reducer 的合并规则本身需要被测试保护。

**依据**：`11` §2 检查 2。

---

### R2-06 Claim 结构扩展

**位置**：`06-科学证据与验证机制.md` §2.1

**修改前**：
```js
Claim { id, text, type, entities, numbers, support:['e3','e7'], contradict:['e9'],
        source, confidence, required }
```

**修改后**：新增四项
```js
premises: ['c0'],                                    // 推理依赖
support: [{ eid:'e3', strength:'strong' }],          // 证据强度
contradict: [{ eid:'e9', strength:'partial' }],
uncertainty: { kind:'measurement', value:0.5, basis:'星历精度 ±0.5°' }
```

**原因**：原结构只有 id 列表，Critic 只能数条数，无法判断"弱证据支撑强结论"或"前提未验证"。

**成本**：Claim 生成与 `toSections` 同批（零额外模型调用）。

---

### R2-07 Claim 关系判定规则

**位置**：`06` §4.0（新增小节）

**修改前**：只有 7 项检查清单（来源真实性、支持关系、独立性…），没有"如何用 Claim 结构推出 verdict"。

**修改后**：新增 4 条可执行规则 + source 标记约束：

| 规则 | 条件 | 判定 |
|---|---|---|
| R1 前提断裂 | `premises` 未通过 | 最高 PARTIAL |
| R2 强度不匹配 | support 全 weak 但措辞"已证实" | FAIL |
| R3 矛盾未处理 | `contradict` 非空且非 model 类 | PARTIAL + 展示双方 |
| R4 不确定性缺失 | 定量结论无 `uncertainty` | FAIL |

并明确：**verdict 只读 `source==='rule'|'calc'` 的结果**；LLM 结论只进 `meta.review.llmNote`，不参与判定。

**原因**：这是"Critic 会不会把模型判断当科学事实"的根治手段——不是靠提示词，而是靠数据结构的 source 字段 + 判定时的过滤。

**依据**：`11` §2 检查 6。

---

### R2-08 映射表追加

**位置**：`08-新旧架构映射.md` §3

**修改前**：7 个新增模块，合计约 1130 行。

**修改后**：追加 4 项，合计约 **1400 行**（接近 1500 上限）：

| 模块 | 文件 | 规模 |
|---|---|---|
| Reducer | `core/reducer.js` | ~70 行 |
| Delegation | `core/delegation.js` | ~80 行 |
| Search 五段胶水 | `core/search-pipeline.js` | ~60 行 |
| Research Loop | 并入 `planner.js` | +60 行 |

**原因**：拆分与新增机制必须落到文件与行数，否则"渐进升级"无从评估。

**风险提示**：已接近自定的 1500 行上限，后续再加模块需先合并或删减。

---

### R2-09 阶段调整

**位置**：`09-分阶段迁移实施计划.md` 开头（新增小节）

**修改前**：P0 = 数据结构 + 三态评审（2–3 天）。

**修改后**：

| 阶段 | 变化 |
|---|---|
| P0 | 范围扩大：加 Claim 结构 + 4 条规则（3–4 天） |
| P2 | 加 `reducer.js`（并行前置） |
| P2.5 | 新增可选阶段：Controlled Delegation |

**原因**：三态评审若无 Claim 关系模型，`PARTIAL` 恒为定值，等于假评审——P0 必须把结构做进去，否则后续全部悬空。

---

### R2-10 评审者自纠（重要）

**位置**：`11` §1.1

**修改前**：初稿写"第一轮最严重的一处错误：05 文档主张并行调用 compose"。

**修改后**：撤回该指控，改为事实陈述——

- 核实 `05` 原文：模板中 `compose` 始终在并行取数**之后**；"天然可并行"只列了 Kepler/KB/检索
- 结论：第一轮方向正确，真实缺口是"未论证为何 compose 不可并行 + 未给合并规则"

**原因**：评审同样必须以源码和原文为依据。凭空指责自己的文档与"凭设想改结论"是同一类错误。

---

### 未修改的部分（明确保留）

| 内容 | 原因 |
|---|---|
| Kepler 数值权威、`CalcRecord` 强制字段 | 核心原则，评审未发现逻辑缺陷 |
| 权限矩阵 | 与 R2-03/R2-07 一致，无需改 |
| 7 个拆解模板（T-A~T-G） | 与实现兼容，未发现矛盾 |
| 预算模型与停止条件 | 检查 4 只补充了单调性，阈值不变 |
| 13 个 Agent 名册 | 维持不增不减 |
| 渲染契约（sections/trace/meta） | 兼容性基础，不动 |
| 搜索五段分层 | 只补了胶水模块，分段职责不变 |

---

### 待验证项（本轮无法确认）

| 项 | 影响的设计 | 验证方式 |
|---|---|---|
| compose 是否修改 `ctx` | 分片共享 safely | 传 `Object.freeze(ctx)` 跑测试 |
| composeTonight 多目标 P95 | 单步超时阈值 | 20 目标压测 |
| 现有答案 `meta` 字段完整率 | meta 合并规则 | 抽样 20 条 |
| ADS/MAST 浏览器直连可行性 | P3 是否可做 | 2 小时接口验证 |
| Claim 生成对渲染的影响 | P0 零行为变化承诺 | 旁挂产出，不改渲染 |

---

### 文档变更清单

| 文件 | 变更 |
|---|---|
| `00-README.md` | 索引追加 11/12/13 |
| `03-目标架构设计.md` | R2-03、R2-05 |
| `05-动态任务编排机制.md` | R2-01、R2-02、R2-04 |
| `06-科学证据与验证机制.md` | R2-06、R2-07 |
| `08-新旧架构映射.md` | R2-08 |
| `09-分阶段迁移实施计划.md` | R2-09 |
| `11-第二轮架构评审报告.md` | **新增**（含 R2-10 自纠） |
| `12-执行安全性审计.md` | **新增** |
| `13-架构设计修订记录.md` | **新增**（本文） |
| `01/02/04/07/10` | 无改动（评审未发现需修订项） |

---

## 14. 第三轮架构一致性审查报告

> 审查对象：`docs/architecture/` 全 14 份（00–13）
> 审查目标：第二轮修订后是否仍存在**阶段职责冲突、模块边界不清、数据契约缺口、规则无法落地**
> 方法：交叉比对 + 源码复核。**只改设计文档，未动业务代码。**
> 日期：2026-10-31

---

### 1. 结论先行

**审查结论：附条件通过（Conditional Pass）。**

- 架构主干（三态评审、四维证据、分片并行、预算停止）站得住
- 但发现 **11 处内部矛盾**，其中 3 处会直接导致实施出错（C1 Claim 时机、C3 工具清单缺 compose、C10 阶段表并存）
- 已全部处置：新增 `15` 作为唯一权威契约，并对 5 份文档打修订补丁
- **未通过的原因不是设计错，而是有 5 项"待验证"未清**（见 §6）；其中 ADS/MAST 可行性直接决定 P3 是否成立

---

### 2. 十项审查重点的结论

| # | 审查项 | 结论 | 处置 |
|---|---|---|---|
| 1 | P0/P3 的 Claim 边界 | ❌ **矛盾**：09 让 P0 从 sections 生成 Claim（属 P3，且侵入业务代码） | R3-09 改正 + `15` §3 定义 `origin` 字段 |
| 2 | TaskState 生命周期 | ❌ **矛盾**：05 说"每步写 store"，09 把持久化放 P4 | R3-01 + `15` §2 三阶段分工表 |
| 3 | Critic 四维分离 | ⚠️ **不足**：7 项清单混装，数字匹配被当证据支持 | R3-03/R3-04：四维模型（numeric/entity/semantic/source） |
| 4 | 步骤恢复协议 | ❌ **缺失**：无 reuse/rerun/validate_then_reuse，无 hash/attempt/checkpoint | `15` §4 完整定义 |
| 5 | Reducer 合并规则 | ❌ **错误**：`computed` 取逻辑或，不能代表整体可算 | R3-05：改 `calcCoverage{computed,total}` |
| 6 | Registry 与 Adapter 职责 | ❌ **矛盾**：05 模板用 compose，03 清单无此工具 | R3-06：补 3 个 compose 工具 + 调度约束 |
| 7 | 13 个 compose 逐项审计 | ⚠️ **仅 1 个实测**，其余推定 | 保留 `[推定]` 标记 + 补逐项审计要求（`12` §2.2 新增） |
| 8 | IDB 恢复 vs 后台执行 | ⚠️ **表述含糊**，易被读成"后台继续跑" | `15` §4.3 明确"页面关闭无进程" |
| 9 | Token 统计三情况 | ❌ **缺失**：预算有字段无采集 | `15` §8 定义 api/estimate/none |
| 10 | 文档一致性 | ❌ **冲突**：09 两张阶段表并存（数字不同）+ 06 小节乱序 | R3-02 + R3-08 |

---

### 3. 矛盾清单（11 处，含原文与裁定）

#### C1 Claim 生成时机冲突【严重】

| | 内容 |
|---|---|
| **原文 A** | `09` P0 步骤 7：「新增 `core/claims.js`：从 `sections` 产出 Claim（与 `toSections:1049` 同批生成）」 |
| **原文 B** | `09` P0 验收：「352 条断言全绿 + **行为零变化**」；`10` T1 要求 `llmCalls===0 && searches===0` |
| **冲突** | `toSections` 在 `research.js`（P3 范围）。P0 若接入，必须改业务代码 → 违反"行为零变化" |
| **裁定** | 拆两段：**P0 = 结构 + 规则 + fixture**；**P3 = 真实生成 + Evidence 映射** |
| **落地** | `15` §3 的 `origin:'p0-fixture'\|'p3-generated'`；`09` 步骤 7 已改 |

#### C2 Critic 两套判定并存【严重】

| | 内容 |
|---|---|
| **原文** | `06` §4 有 7 项检查；§4.0（R2-07）有 4 条规则（R1–R4）；§4.1 聚合写「通过 7 项」 |
| **冲突** | 两套清单未映射。R2/R4 判 FAIL 与"通过 7 项判 PASS"可能矛盾（如 7 项全过但 R4 触发） |
| **裁定** | 7 项保留为**原始清单**；判定以**四维**为准（numeric/entity/semantic/source），7 项按维度归位 |
| **落地** | `06` §4.3 新增映射表 + 两条硬规则；`15` §5 权威定义 |

#### C3 工具清单缺 compose【严重】

| | 内容 |
|---|---|
| **原文 A** | `05` §2 模板：`kb.lookup → kepler.ephemeris → compose` |
| **原文 B** | `03` §3.7 注册清单 9 项，**无任何 compose 类工具** |
| **冲突** | 模板引用了未注册的工具 → 计划校验必然拒绝 → 编排跑不起来 |
| **裁定** | 补 3 个：`compose.target` / `compose.domain` / `compose.simple`，共 12 个 |
| **落地** | `03` §3.7 补表 + 约束「caps:compose 不得与任何步骤同批并行」 |

#### C4 Reducer 用布尔 OR 代表整体【严重】

| | 内容 |
|---|---|
| **原文** | `05` §3.1：「`meta.computed` 逻辑或——只要有一条是算出来的即为真」；`12` §4.4 同义 |
| **冲突** | 分支 A 有数值、分支 B 只有文本 → OR 后整体标"可算"，用户误以为全部可复算 |
| **裁定** | 废止单布尔，改 `calcCoverage:{computed,total}`；渲染层兼容期可回退读旧字段 |
| **落地** | `05` §3.1 与 `12` §4.4 已改；`15` §6.2 定义 |

#### C5 持久化时机冲突

| | 内容 |
|---|---|
| **原文 A** | `05` §7：「每步之后写入 `store.js`（新增 `putTask`）」 |
| **原文 B** | `09`：`putTask` 在 **P4** |
| **裁定** | P0 定义+序列化（不写盘）／P2 内存态（不写盘）／P4 才落盘+恢复 |
| **落地** | `05` R3-01 标注；`15` §2 分工表 |

#### C6 恢复协议缺字段

| | 内容 |
|---|---|
| **现状** | 只有"幂等分级"一句话（`12` 结论、`13`），无策略名、无 hash、无 attempt/checkpoint |
| **裁定** | 定义三策略 + 五字段，且策略由工具的 `idempotent`/`ttl` 推导，不允许运行时猜 |
| **落地** | `15` §4 |

#### C7 IDB 恢复被误读为后台执行

| | 内容 |
|---|---|
| **原文** | `03` §3.10 表格写「可恢复」 |
| **风险** | 被实现成"页面关闭后任务继续"，而纯静态页面无 Service Worker/常驻 Worker，做不到 |
| **裁定** | 改为"状态已保存，重新打开后续跑剩余步骤"；禁止使用"后台继续"措辞 |
| **落地** | `15` §4.3 对照表 |

#### C8 Token 统计缺失

| | 内容 |
|---|---|
| **原文** | `05` 预算模型有 `tokens` 字段，全文档未说明如何获得 |
| **裁定** | 三种情况显式区分：api（读 usage）／estimate（字符/3.2）／none（纯本地记 0），并要求 `meta.usage.tokensSource` |
| **落地** | `15` §8 |

#### C9 13 个 compose 审计标记不足

| | 内容 |
|---|---|
| **现状** | `12` §2 表格：仅 `composeSmalltalk` 逐行实测，其余 12 个标 `[推定]` |
| **风险** | 后续实施时把推定当结论（尤其"是否修改 ctx"未验证） |
| **裁定** | 保留 `[推定]`；新增逐项审计清单（13 项 × 6 维度），P2 前必须补齐 |
| **落地** | `12` §2.2（本轮新增） |

#### C10 阶段表并存冲突

| | 内容 |
|---|---|
| **原文** | `09` 同时存在两张表：R2-09 新表（P0 20 条/3–4 天）与第一轮原表（P0 15 条/2–3 天） |
| **冲突** | 数字不一致，排期无法依据 |
| **裁定** | 原表标记为**已废止**，仅保留轨迹；有效值以新表为准 |
| **落地** | `09` 原表标题已加 ⚠️ 说明 |

#### C11 06 小节编号乱序

| | 内容 |
|---|---|
| **现状** | 顺序为 4.1 → 4.0 → 4.2（第二轮追加时插错位置） |
| **裁定** | 不重编号（避免破坏 `13` 等处对"§4.0"的交叉引用），加阅读顺序说明 |
| **落地** | `06` §4 开头说明块 |

---

### 3.1 第四轮小范围补充修订（2026-10-31，进入 P0 前收尾）

本轮只处理两个遗留问题，不扩展架构。

#### C12 Claim 的 source 与 calc 契约冲突【严重，已修】

| | 内容 |
|---|---|
| **原文** | `15` §1.1 不变量 2：「`claims[].source === 'calc'` 时，必有一条 `calc` 字段」；而 §1.3 的 `source` 枚举只有 `kepler\|kb\|web\|llm` |
| **冲突** | 引用了枚举中不存在的值；实现时无论按哪边写都会与另一边不一致 |
| **裁定** | 采用方案 A：`source` 只表信息来源（4 值不变），新增独立字段 `calc: CalcRecord\|null`；不变量改为「`source='kepler'` 且 quantitative ⇒ `calc` 非空」 |
| **不改的** | `EvalResult.checks[].source='rule'\|'calc'\|'llm'` 是**评估结论的产生方式**，与 Claim 信息来源不是同一概念，**保持原样**（用户明确要求不得强行统一） |
| **落地** | `15` §1.1 不变量 2/3、§1.3 结构；`06` §2.1 同步；`09` P0 步骤 7 / P3 步骤 7；`16` Q6 |

#### C13 P2 深层上下文隔离未验证【严重，已用测试解除】

| | 内容 |
|---|---|
| **原文** | `05` §3.1 的 `newShard` 直接 `ctx: base.ctx`；`12` §5 提到 `Object.freeze(Object.assign({}, ctx))` |
| **冲突** | 两者都只做浅层处理；`ctx.cityRef` 指向全局 `CITIES` 元素，浅拷贝会让分片共享同一对象 |
| **裁定** | 用 `tools/ctx-isolation-test.js`（14 条断言）实测，再据结果修设计 |
| **实测结论** | ①现有 13 个 compose **零写 ctx**（15 个 intent 覆盖，CITIES 快照不变）②但**浅拷贝确实会污染**（A1: leaked=true）③**双层拷贝 + 双层冻结有效**（A2/B2）④重复执行一致（D1/D2）⑤`ALIAS` 有 `READY` 守卫，无并发问题（E1） |
| **落地** | `05` §3.1 的 `newShard` 改为双层拷贝+冻结（R4-02）；`12` §5 同步；`12` §3 纠正 ALIAS 错误结论（R4-03）；`16` Q4/Q10 更新 |

#### C14 ALIAS 风险结论错误【中，已纠正】

| | 内容 |
|---|---|
| **原文** | `12` §3 表格：「`buildAlias()` 每次 `buildAnswer` 重建，并发时互相清空｜中」 |
| **事实** | 源码 `agents.js:301` 有 `if (READY) return;`，`:334` 置 `READY = true` —— **只构建一次** |
| **裁定** | 撤回该风险；真实风险改为"别名表构建后是否随知识库变更失效"，属功能问题，本轮不处理 |
| **落地** | `12` §3 与 §6 风险清单第 3 条均标注已排除 |

#### C15 阶段职责错位：claims.js 只写在 P3【严重，已修】

| | 内容 |
|---|---|
| **原文** | `09` P0 步骤列表只有 6 步（无 claims.js），但 R2-09 声称 P0 要加 Claim 结构；claims.js 只出现在 P3 步骤 7 |
| **冲突** | 若按步骤列表执行，P0 不会产出 Claim 结构，而 P3 又假设它已存在 |
| **裁定** | P0 增第 7 步（结构+规则+fixture）；P3 步骤 7 改为"接入生成"（`extractClaims`） |
| **落地** | `09` P0 步骤 7（新增）、P3 步骤 7（改写） |

---

### 4. 本轮对所有文档的修订（R3-01 ~ R3-09）

| 编号 | 文档 | 修改 | 原因 |
|---|---|---|---|
| R3-01 | `05` §7 | "每步写入 store" 加限定：仅 P4 成立 | C5 |
| R3-02 | `09` 原阶段表 | 标题标注"已废止" | C10 |
| R3-03 | `06` §4 检查 1 | 废止 HEAD 200，改白名单+格式；指向四维 | C2 |
| R3-04 | `06` §4.3（新增） | 四维分离 + 两条硬规则 | C2 |
| R3-05 | `05` §3.1、`12` §4.4 | `computed` 改 `calcCoverage`；confidence 缺失按 0.5 | C4 |
| R3-06 | `03` §3.7 | 补 3 个 compose 工具 + 调度约束 | C3 |
| R3-07 | `15`（新建） | 唯一权威契约 | C1/C5/C6/C7/C8 |
| R3-08 | `06` §4 开头 | 小节顺序说明 | C11 |
| R3-09 | `09` P0 步骤 7 | 改为"结构+规则+fixture"，真实生成归 P3 | C1 |

**原则遵守**：全部为**追加说明或标注**，未删除任何原有设计内容。

---

### 5. 新增文档

| 文件 | 作用 |
|---|---|
| `15-架构接口与数据契约统一规范.md` | 实体字段、生命周期、恢复协议、Reducer 规则、工具职责、Token 统计的**唯一权威** |
| `16-最终实施前检查清单.md` | 10 项放行问题 + 逐项判定 + 阻塞项 |

---

### 6. 未解决项（5 个待验证，均为阻塞或半阻塞）

| # | 待验证 | 影响 | 阻塞级别 |
|---|---|---|---|
| V1 | ADS/MAST/JPL Horizons 能否浏览器直连 | **决定 P3 是否成立**：若不可行，P3 的"一手源"退化为仅 SIMBAD | **阻塞 P3** |
| V2 | 13 个 compose 的逐项副作用（尤其是否改 `ctx`） | 决定分片是否可安全共享 ctx | 半阻塞 P2 |
| V3 | 真实答案的 Claim 覆盖率（P3 验收指标） | 若 <80%，P3 的评审仍会大量 PARTIAL | 半阻塞 P3 |
| V4 | `composeTonight` 多目标 P95 耗时 | 决定单步超时阈值（现设 200ms 是估算） | 不阻塞 |
| V5 | 现有答案 `meta` 字段完整率 | 影响 Reducer 缺失默认值的设定 | 不阻塞 |

**这 5 项都不需要改业务代码即可验证**（写测试/压测/接口探测），但需要用户授权执行。

---

### 7. 与"设计 vs 实现"的边界声明

本轮所有内容均为**设计**，未实现。文档中以下措辞严格区分：

| 措辞 | 含义 |
|---|---|
| "将新增/设计为" | 计划，代码不存在 |
| "已实测" | 有源码证据（仅 `composeSmalltalk` 的 meta 整体替换、155 处 answer 写、无 DOM/随机等） |
| "推定" | 按模式推断，未逐行确认 |
| "待验证" | 完全未确认，不得作为实施依据 |

**未使用**"已实现""已完成"等表述描述任何未落地的能力。

---

### 8. 审查结论

**附条件通过**，条件为：

1. **P0 可立即启动**（不依赖任何待验证项）
2. **P2 启动前**必须完成 V2（compose 副作用逐项验证），否则分片共享 `ctx` 有风险
3. **P3 启动前**必须完成 V1（ADS/MAST 可行性探测）；若不通过，P3 范围需缩减为"SIMBAD + 反证检索 + 时间线"
4. 所有阶段以 `15` 为准；01–13 中与之冲突处一律以 `15` 覆盖
5. 严格禁止在 P0 阶段触碰 `compose*` / `toSections` / `criticReview` 以外的业务函数

**不通过的理由**：不存在（无逻辑死结），但存在 1 项硬阻塞（V1 影响 P3）。

---

## 15. 架构接口与数据契约统一规范

> **权威声明**：本文件是数据契约与接口的**唯一权威**。01–12 中如有冲突，以本文件为准。
> 生成于第三轮一致性审查（2026-10-31）。业务代码未改动。

---

### 0. 为什么需要这份文件

前两轮的契约散落在 03（模块）、05（编排）、06（证据）、09（阶段）、12（审计）五处，出现三类问题：

| 问题 | 实例 |
|---|---|
| 同一实体多处定义且不同步 | Claim 在 06 §2.1 定义，09 P0 又说"与 toSections 同批生成"（那是 P3） |
| 阶段职责打架 | 05 §7 说"每步写入 store"，09 却把持久化放在 P4 |
| 接口缺字段 | TaskState 无 `inputHash/attempt/checkpoint`，恢复协议无从实现 |

本文件统一它们。

---

### 1. 实体契约

#### 1.1 TaskState（唯一任务状态载体）

```js
TaskState = {
  schemaVersion: 1,
  id: 'tsk_<base36>',
  question: string,
  mode: 'single' | 'compare' | 'research',
  phase: Phase,                          // 见 §2
  createdAt, updatedAt: ISO8601,

  intents: [{ kind, confidence, source: 'rule'|'llm' }],
  entities: [{ id, name, aliases[], resolvedBy }],
  context: { place:{lat,lon,name}, time:{y,mo,d,h,mi,tz}, epoch:'J2000', frame:'topocentric' },

  plan: Plan | null,
  steps: Step[],                         // 见 §1.2
  claims: Claim[],                       // 见 §1.3
  evidence: EvidenceItem[],              // 见 §1.4
  eval: EvalResult | null,               // 见 §1.5

  budget: Budget,                        // 见 §6
  checkpoints: Checkpoint[],             // 见 §4
  trace: TraceItem[],
  errors: [{ stepId, kind, message, at, retriable }]
}
```

**不变量**（写入时必须满足，测试需覆盖）：

1. `steps[].status` 为 `ok` 时，`outputHash` 必非空
2. **（第三轮补充修订 R4-01）** `claims[].source === 'kepler'` 且 `type === 'quantitative'` 时，`calc` 必须非 null 且符合 CalcRecord 契约；其余 source 的 `calc` 允许为 null
3. 无 `calc` 的定量 claim，Critic 的 `numeric` 维度不得给出 PASS（与 §5.1 一致）
4. `eval !== null` 时，`claims` 中至少有一条 `required:true`
5. `budget.used.* ≤ budget.limit.*` 恒成立（超限即停机，不允许负余量）

> **R4-01 修订说明**：原文第 2 条写作「`claims[].source === 'calc'` 时必有一条 `calc` 字段」，
> 但 `Claim.source` 的枚举只有 `kepler|kb|web|llm`，不存在 `'calc'`——契约自相矛盾。
> 修订方案：**`source` 只表信息来源，不表计算状态**；是否计算由独立字段 `calc` 表达。
> 这样「Kepler 算出的」与「Kepler 知识库里的」仍可区分，也不会与 `EvalResult.checks[].source='calc'` 混淆（后者表示评估结论的产生方式，语义不同，保持不动）。

#### 1.2 Step（步骤）

```js
Step = {
  id: 't1',
  tool: 'kepler.ephemeris',
  args: object,
  deps: string[],
  parallel: boolean,
  critical: boolean,
  optional: boolean,

  status: 'pending'|'ready'|'running'|'ok'|'failed'|'skipped'|'blocked',
  attempt: number,                       // 已尝试次数，0 起
  inputHash: string,                     // sha256(canonicalJSON(args))
  outputHash: string | null,             // 成功时写入
  startedAt, endedAt: ISO8601 | null,
  result: StepResult | null,
  error: { kind, message, retriable } | null
}
```

#### 1.3 Claim

```js
Claim = {
  id: 'c1',
  text: string,
  type: 'quantitative'|'qualitative'|'causal'|'existence',
  entities: string[],
  numbers: [{ value, unit, norm }],
  premises: string[],                    // 依赖的其他 claim id
  support: [{ eid, strength:'strong'|'partial'|'weak', basis:'numeric'|'semantic' }],
  contradict: [{ eid, strength, basis }],
  uncertainty: { kind:'measurement'|'model'|'definition'|'temporal', value, basis } | null,
  source: 'kepler'|'kb'|'web'|'llm',      // 信息来源（不含"是否计算过"这层语义）
  calc: CalcRecord | null,                 // 计算记录；R4-01 新增。无计算则为 null
  required: boolean,
  origin: 'p0-fixture'|'p3-generated'      // 见 §3：P0 只有 fixture，P3 才有真实生成
}
```

**`basis` 字段是第三轮新增**，用来区分"数值匹配"与"语义支持"——见 §5.3。

#### 1.4 EvidenceItem

```js
EvidenceItem = {
  id: 'e3', uri: string, domain: string,
  tier: 'primary'|'secondary'|'tertiary',
  kind: 'database'|'paper'|'encyclopedia'|'news'|'image',
  title, excerpt,                        // excerpt ≤ 400 字
  publishedAt, retrievedAt: ISO8601 | null,
  lang: 'en'|'zh'|'other',
  independentOf: string[],               // 同源的 evidence id
  conflictsWith: string[],
  trust: {                               // 第三轮新增：来源可信度的可计算依据
    whitelisted: boolean,                // 域名是否在已知权威列表
    hasAuthor: boolean, hasDate: boolean,
    doiValid: boolean | null,
    score: number                        // 0..1，由下述字段按 §5.4 计算
  }
}
```

#### 1.5 EvalResult

```js
EvalResult = {
  verdict: 'PASS'|'PARTIAL'|'FAIL',
  dimensions: {                          // 第三轮新增：四维显式分离，见 §5
    numeric:   { status, checks[] },
    entity:    { status, checks[] },
    semantic:  { status, checks[] },
    source:    { status, checks[] }
  },
  checks: [{ name, ok, source:'rule'|'calc'|'llm', detail }],  // 扁平汇总（兼容旧渲染）
  gaps: [{ claimId, kind, hint }],
  retryHint: { strategy, steps[] } | null,
  llmNote: string | null                // 不参与 verdict 计算
}
```

---

### 2. 生命周期：TaskState 在三个阶段的分工

这是第三轮要解决的核心冲突。**同一结构，三种能力，分阶段启用**：

| 阶段 | 能力 | 存储 | 恢复 | 说明 |
|---|---|---|---|---|
| **P0** | 定义 + 序列化 + 校验 | 无（纯内存对象） | ❌ | `create/validate/toJSON/fromJSON`，不写盘 |
| **P2** | 内存态执行 | 内存（单次 ask 生命周期） | ❌ | Orchestrator 持有，ask 结束即丢弃 |
| **P4** | 持久化 + 恢复 | IndexedDB（`putTask`） | ✅ | 检查点 + 三策略恢复 |

**明确纠正**：05 §7 曾写"每步之后写入 store.js"——**该描述在 P2 不成立**，P2 不落盘。已在 05 加修订标记。

#### 2.1 阶段（Phase）枚举

```
INIT → UNDERSTAND → ROUTE → PLAN → EXECUTE → PROGRESS → (REPLAN|EXPAND|JUDGE) → COMPOSE → DONE
                                                          ↘ ABORTED | PARTIAL
```

P0 只定义枚举与合法转移表（状态机校验），不驱动执行。

---

### 3. Claim 的 P0 / P3 边界（消除矛盾）

**矛盾原文**：
- 09 P0 步骤 7："新增 `core/claims.js`：从 `sections` 产出 Claim（与 `toSections:1049` 同批生成）"
- 但 `toSections` 属 `research.js`（P3 范围），且 P0 承诺"行为零变化"

**裁定**：拆成两件事，各归其位。

| | P0（本阶段做） | P3（后续做） |
|---|---|---|
| 内容 | Claim **数据结构** + **4 条判定规则** + **fixture**（手写样例） | 从真实 `sections` **生成** Claim + Evidence 映射 |
| 代码 | `claims.js` 只导出 `makeClaim()` / `judgeClaim()` / `FIXTURE` | 在 `toSections` 旁挂 `extractClaims()` |
| 是否改业务代码 | ❌ 否（新文件 + 纯函数） | ✅ 是（接入 research.js） |
| 可测性 | 用 fixture 单测规则 | 用真实答案集成测 |
| 验收 | 4 条规则对 fixture 判定正确 | 真实答案的 critical claim 覆盖率 ≥ 80% |

**`origin` 字段**（§1.3）就是为这条边界服务的：P0 产出的都是 `'p0-fixture'`，可断言"P0 阶段不得出现 p3-generated"。

---

### 4. 恢复协议（第三轮新增）

#### 4.1 三种恢复策略

| 策略 | 适用 | 判定条件 | 动作 |
|---|---|---|---|
| **reuse** | 纯函数、确定性输出 | `step.status==='ok'` 且 `inputHash` 未变 且工具标 `idempotent:true` | 直接复用 `result`，不重跑 |
| **rerun** | 非幂等（检索、模型） | `inputHash` 相同但工具 `idempotent:false` | 重跑，`attempt++` |
| **validate_then_reuse** | 半幂等（缓存类、含时效） | `inputHash` 相同但 `result.retrievedAt` 超过 TTL | 先验证新鲜度，通过则复用，否则重跑 |

**工具必须声明** `idempotent` 与 `ttlMs`（见 §5.5），恢复策略由这两项 + 时间推导，**不允许运行时猜**。

#### 4.2 检查点

```js
Checkpoint = {
  at: ISO8601,
  phase: Phase,
  stepId: string | null,        // 哪个步骤完成后写的
  inputHash: string,
  stateHash: string,            // sha256(canonicalJSON(去掉 trace/checkpoints 后的 state))
  budgetUsed: { ms, tokens, llmCalls, searches }
}
```

**写入时机**（仅 P4）：

| 时机 | 是否写 |
|---|---|
| PLAN 完成 | ✅ |
| 每个 `critical` 步骤完成 | ✅ |
| 每个 PROGRESS 决策后 | ✅ |
| 非 critical 步骤 | ❌（合并到下次检查点） |
| `running` 中间态 | ❌（无意义） |

**恢复流程**：

```
load(taskId) → 取最后一个 checkpoint
  → 对每个 step：
      ok + 幂等 + hash 未变        → reuse
      ok + 非幂等                  → rerun
      ok + 半幂等且 TTL 未过       → reuse，否则 rerun
      running                      → 视为 pending（rerun）
      failed + retriable + attempt<2 → rerun
      failed + 不可重试            → blocked
  → 从 phase 续跑
```

**上限**：同一任务恢复次数 ≤ 1（防"刷新→续跑→再刷新"循环）。超限则提示用户"该任务无法自动续跑，请重新提问"。

#### 4.3 IndexedDB 恢复 ≠ 浏览器后台执行（第三轮新增，防误解）

| 能力 | 是否存在 |
|---|---|
| 页面关闭后任务继续执行 | ❌ **不存在**。纯静态页面，无 Service Worker / 常驻 Worker |
| 刷新后从检查点继续 | ✅ 存在（P4）：重新执行未完成步骤，不是"接管一个仍在跑的进程" |
| 关闭浏览器后自动恢复 | ⚠️ 需用户下次打开页面并主动选择"继续" |

**必须避免的措辞**：不能说"任务在后台继续跑"。准确说法是"任务状态已保存，重新打开后可继续执行剩余步骤"。

---

### 5. Scientific Critic：四维分离（第三轮核心修订）

**问题**：原 7 项检查把"证据是否有来源"与"结论是否正确"混在一个清单里；且"数字匹配"被当成"证据支持"。

**修订：四个维度，分别定义、分别判定，最后聚合。**

#### 5.1 数值一致性（numeric）

| 检查 | 方法 | 不通过 |
|---|---|---|
| 计算可复算 | 用 `CalcRecord.inputs` 重算，偏差 ≤ 容差 | FAIL |
| 单位一致 | 声明单位与 `CalcRecord.unit` 一致 | FAIL |
| 历元/坐标系齐全 | `epoch/frame` 非空 | FAIL |
| 不确定性存在 | 定量 claim 有 `uncertainty` | FAIL |

**只判断"数算得对不对"，不判断"这个数是否支持结论"。**

#### 5.2 实体一致性（entity）

| 检查 | 方法 | 不通过 |
|---|---|---|
| 实体指代一致 | claim.entities 与 evidence 中出现的天体在别名表内可对齐 | PARTIAL |
| 时空条件一致 | claim 的地点/时间与 `ctx` 一致 | FAIL（张冠李戴比数值错更严重） |
| 对象未混淆 | 同名词条（如 M42 与 NGC1976）指向同一实体 | PARTIAL |

**这一维专门防"数值对但对象错"**——例如"木星的数据用在土星结论上"。

#### 5.3 语义支持关系（semantic）

| 检查 | 方法 | 不通过 |
|---|---|---|
| 数值匹配 | claim.numbers ⊂ evidence.excerpt 数值（容差） | **仅记为 `basis:'numeric'` 的弱支持** |
| 文字断言匹配 | excerpt 中出现 claim 的核心谓词（是/不是/高于/低于） | `basis:'semantic'` 的中等支持 |
| 反向蕴含检查 | excerpt 是否含否定词（不/未/尚无）且指向同一对象 | 命中则转为 contradicts |

**必须明确**：**数值匹配 ≠ 证据支持**。同一个数字可能出现在不同语境（"43°"既可能是高度也可能是纬度）。
因此 `basis:'numeric'` 只能给 `strength:'weak'`；要升级为 `strong` 必须同时通过文字断言匹配 + 上下文窗口（数字前后 20 字符内出现单位或谓词）。

#### 5.4 来源可信度（source）

| 检查 | 方法 | 说明 |
|---|---|---|
| 域名白名单 | 命中已知权威域（simbad/jpl/nasa/ads/arxiv/mast） | **只是加分项，不是通过条件** |
| 一手性 | `tier==='primary'` | |
| 独立性 | `support` 中两两 `domain` 不同 | |
| 时效 | `retrievedAt - publishedAt` ≤ 结论类型阈值 | |
| 可追溯 | `uri` 格式合法 + DOI 校验（离线可做） | |

**明确纠正**：06 §4 检查 1 曾写"URI 可解析（HEAD 200）或域名在白名单"。由于 CSP + CORS 限制，**HEAD 探测不可行**，第三轮裁定为：

- **离线可做**：域名白名单 + DOI/URL 格式校验 + `tier`
- **不可做**：真实可达性探测、内容哈希比对
- 因此 `source` 维度的最高结论是 **"来源可信（未能验证可达）"**，措辞不得写"已验证来源"。

#### 5.5 四维 → verdict 聚合

```
FAIL    : numeric 有 FAIL
          或 entity 有 FAIL
          或 任一 required claim 的 support 为空
PARTIAL : 无 FAIL，但存在
          - support 全部 basis='numeric'（仅有数值匹配）
          - 独立性不足（同域）
          - 存在未解 contradict
          - 超时效
PASS    : 四维全过
```

**LLM 的位置**：只写入 `llmNote`，**不参与任何维度判定**。
`verdict` 只读 `source==='rule'|'calc'` 的检查结果。

---

### 6. Reducer 契约（第三轮修订）

#### 6.1 为什么不能直接用布尔 OR

12 §4.4 曾写 `meta.computed` 取逻辑或。问题：分支 A 算出数值、分支 B 只有知识库文本，OR 之后整体被标为"可算"，用户会以为所有结论都可复算。

#### 6.2 合并规则（修订版）

| 字段 | 规则 | 理由 |
|---|---|---|
| `sections` | 按 `TRACE_ORDER` 中对应 agent 排序拼接，同 agent 保持分片内顺序 | 输出稳定、可 diff |
| `trace` | 合并后统一排序 | 现有机制 |
| `meta.executionTier` | **取最弱**（`chat` < `infer` < `fetch` < `compute` 之外的保守序：取表示"确定性最低"的那个） | 整体可信度由最弱环节决定 |
| `meta.computed` | 改为 `meta.calcCoverage = { computed: n, total: m }`，**不再用单布尔** | 保留比例，渲染层自行决定措辞 |
| `meta.confidence` | 取**最小**；若某分片无 confidence，视为 0.5（中性默认）而非 1 | 缺失不得被当成满分 |
| `meta.systemAction` | 只保留一个，且只执行一次 | 防视图反复重置 |
| `meta.review` | 按 `dimensions` 合并：每个维度取最差状态 | 与四维聚合一致 |

**`calcCoverage` 是替代 `computed` 的新字段**，渲染层在旧字段缺失时可回退读取 `computed`（兼容期 1 个版本）。

#### 6.3 确定性要求

Reducer 必须是**纯函数**，且满足：

1. 相同输入集合 → 相同输出（与分片完成顺序无关）
2. 不读时间、不读随机、不读全局状态
3. 合并结果可通过 `stateHash` 复现

**测试**：把同一组分片按 3 种不同顺序打乱输入，输出必须逐字节相同。

---

### 7. Tool Registry 与 Compose Adapter 的职责（消除矛盾）

**矛盾原文**：05 模板把 `compose` 当步骤，03 §3.7 的工具清单里没有它。

**裁定：三层职责，互不越界。**

| 层 | 负责 | 不负责 |
|---|---|---|
| **Registry** | 注册与能力声明（`id/caps/argsSchema/cost/timeout/idempotent/permissions`），供 Planner 查询 | 执行、合并 |
| **Adapter** | 把领域函数包装成统一签名：`run(args, ctx) → {sections, trace, meta}`；内部建分片 | 决定何时调用 |
| **Orchestrator** | 调度、并行、超时、重试、恢复 | 改结果内容 |
| **Reducer** | 合并分片 | 执行 |

#### 7.1 工具清单（补齐 compose 类）

03 §3.7 的 9 项**不含 compose**，第三轮补 3 项，共 12：

| id | 映射 | caps | idempotent | ttl |
|---|---|---|---|---|
| `kepler.ephemeris` | `astro.*` | compute | ✅ | ∞ |
| `kepler.visibility` | `windowsWithin/track/sunTimes` | compute | ✅ | ∞ |
| `kb.lookup` | `resolveTargets` + knowledge.js | local | ✅ | ∞ |
| `evidence.search` | `Research.run` | search | ❌ | 0 |
| `simbad.tap` | `simbad.lookup` | search | ✅（有缓存） | 7d |
| `paper.search` | `sources.search` | search | ❌ | 0 |
| `llm.compose` | `Sources.generate` | llm | ❌ | 0 |
| `fits.parse` | `attachments.parseFitsHeader` | local | ✅ | ∞ |
| `compare.curate` | `AC.curate` | local | ✅ | ∞ |
| **`compose.target`** | `composeTarget`（含 observe/intro/knowledge 三 intent） | compose | ✅ | ∞ |
| **`compose.domain`** | `composeCosmos/Nova/Helios/Photo/GearFit` | compose | ✅ | ∞ |
| **`compose.simple`** | `composeTonight/Event/Gear/Chart/SystemView/Smalltalk/Fallback` | compose | ✅ | ∞ |

**命名规则**：`compose.*` 的 `caps` 为 `compose`，Planner **只能把它们放在并行批次之后**（Scheduler 强制校验：`compose` 类步骤不得与任何步骤同批并行）。

---

### 8. Token 统计的三种情况（第三轮新增）

05 预算模型有 `tokens` 字段，但未说明怎么得到。第三轮明确：

| 情况 | 判定 | 采集方式 | 标记 |
|---|---|---|---|
| **精确** | provider 响应含 `usage`（OpenAI/Anthropic/Gemini 等） | 读 `usage.total_tokens` | `tokensSource:'api'` |
| **估算** | 无 `usage` 但走了模型（自定义端点、代理） | `ceil(字符数 / 3.2)`（中英混合经验值）| `tokensSource:'estimate'` |
| **无法统计** | 纯本地计算/知识库（无模型调用） | 记 0 | `tokensSource:'none'` |

**约束**：
1. 预算判断用**同一来源**的数字，不得混用 api 与 estimate 比较
2. 答案的 `meta.usage` 必须带 `tokensSource`，否则视为未统计
3. 估算值不得用于"精确成本"展示，UI 措辞为"约 N tokens"

---

### 9. 文档优先级与冲突处理

```
15（本文件） > 03/05/06（领域设计） > 08/09（映射与计划） > 11/12/14（评审与审计）
```

遇到冲突：**以 15 为准**，并在 14 中登记该冲突及处置。
修改历史文档时**不删除原文**，采用"【第 N 轮修订 Rx-xx】"追加块 + 划除说明。

---

### 10. 已知的不确定性（不得当成能力）

| 项 | 状态 |
|---|---|
| 13 个 compose 的逐项副作用 | 仅 `composeSmalltalk` 逐行实测，其余按模式推定 → **待验证** |
| compose 是否修改 `ctx` | 未验证 → **待验证** |
| ADS/MAST/JPL 浏览器直连 | 未验证 → **待验证**（决定 P3 是否成立） |
| 真实答案的 Claim 覆盖率 | 未测量 → **待验证**（P3 验收指标） |
| `composeTonight` 多目标 P95 | 未压测 → **待验证** |

---

## 16. 最终实施前检查清单

> 用途：P0 启动前的放行条件核对。每项结论都必须能追溯到 `15`（权威契约）或源码事实。
> 结论标记：✅ 满足 ／ ⚠️ 有条件满足 ／ ❌ 不满足
> 日期：2026-10-31

---

### 总览

| # | 检查项 | 结论 | 阻塞级别 |
|---|---|---|---|
| 1 | P0 是否可独立实施 | ✅ | — |
| 2 | P0 完成后是否可独立测试 | ✅ | — |
| 3 | P2 是否不改 compose 内部即可运行 | ✅ | — |
| 4 | 并行是否完全隔离共享可变状态 | ⚠️ | 半阻塞（依赖 V2） |
| 5 | Reducer 是否确定 | ✅ | — |
| 6 | Critic 能否区分四类判断 | ⚠️ | 语义维度受规则能力限制 |
| 7 | 刷新后能否正确恢复 | ⚠️ | P4 才有，且语义受限 |
| 8 | 旧架构能否随时回滚 | ✅ | — |
| 9 | 每阶段是否有独立测试与验收 | ✅ | — |
| 10 | 是否存在架构阻塞项 | ⚠️ **1 个硬阻塞** | 阻塞 P3 |

---

### 1. P0 是否可以独立实施？

**✅ 可以。**

| 依据 | 说明 |
|---|---|
| 无外部依赖 | 只新增 `task.js` / `schema.js` / `claims.js`，均为纯函数模块 |
| 不依赖待验证项 | V1–V5 全部与 P0 无关 |
| 不触碰编排 | P0 不引入 Orchestrator，`ask()` 保持原路径 |
| 唯一改动的既有文件 | `agents.js` 的 `criticReview`（加 `verdict`/`dimensions` 字段）、`runtime.js` 的 `Qty`（加可选字段） |

**前提条件**（必须同时满足）：

1. `criticReview` 改动只**新增字段**，不改变既有 5 项检查的判定与输出顺序
2. `Qty` 新字段缺失时标 `legacy:true`，不抛错
3. 不接 `toSections`、不改任何 `compose*`（依据 `15` §3）

---

### 2. P0 完成后是否能够独立测试？

**✅ 能。** P0 的产物全是纯函数，可脱离浏览器执行。

| 测试对象 | 方式 | 断言 |
|---|---|---|
| `TaskState` 结构 | `create → validate → toJSON → fromJSON` 往返 | 往返后深比较相等；不变量 4 条全部通过 |
| `Claim` 规则 | 喂 `FIXTURE`（手写样例） | R1–R4 判定与预期一致；`origin` 恒为 `p0-fixture` |
| `Qty` | 构造缺 `epoch` 的对象 | 标 `legacy:true`，不抛错 |
| `criticReview` | 用既有答案对象跑 | 旧 5 项输出不变；新增 `verdict` 存在 |

**验收**：352 条既有断言全绿 + 新增 ~20 条结构断言全绿；对同一问题跑 P0 前后，`answer.sections` 逐字节一致。

---

### 3. P2 是否能在不修改 compose 内部逻辑的前提下运行？

**✅ 能。**

依据 `12` §5：`makeComposeTool(id, fn)` 只做四件事——
1. 建分片（拷贝 `query/intent/ctx/targets`）
2. 调原函数
3. 取 `{sections, trace, meta}`
4. 返回给 Reducer

`compose*` 本体**一行不改**。代价：每个工具多一次浅拷贝（微秒级）。

**约束**：`compose*` 的签名 `(answer, ctx, cfg, target, question)` 不变，adapter 负责适配为 `run(args, ctx)`。

---

### 4. 并行是否完全隔离共享可变状态？

**⚠️ 有条件满足。**

| 已隔离 | 方式 |
|---|---|
| `answer.sections / trace / meta` | 每分支独立分片（`15` §1.1、`05` §3.1） |
| `meta` 覆盖 | Reducer 用 assign，禁止整体替换 |
| `systemAction` 重复执行 | Reducer 去重 |

| **未隔离** | 风险 | 状态 |
|---|---|---|
| `ctx` | 若某 compose 修改 `ctx`，同批并行会互相污染 | **已证（R4-05）**：15 个 intent / 13 个分支跑完，`ctx` 与 `CITIES` 均未被修改；但**浅拷贝会共享 `cityRef`**（测试 A1），故 `newShard` 必须双层拷贝 |
| `ALIAS`（`agents.js:296`） | `buildAlias()` 每次重建，并发时互相清空 | 已知风险，P2 前需改为惰性构建 |

**放行条件**：P2 启动前完成 V2——
1. 用 `Object.freeze(ctx)` 对 13 个 compose 各跑一次，确认无写
2. 若发现写，则 adapter 内对每个分片传 `Object.assign({}, ctx)` 副本

---

### 5. Reducer 是否具有确定性？

**✅ 是**（设计上保证，需测试锁定）。

| 保证 | 机制 |
|---|---|
| 不读时间/随机/全局 | 纯函数约束 |
| 与分片完成顺序无关 | sections 按 `TRACE_ORDER` 排序，不按完成顺序 |
| 可复现 | 相同输入集合 → `stateHash` 相同 |

**测试要求**（`15` §6.3）：把同一组分片按 **3 种不同顺序**打乱输入，输出必须逐字节相同。

**注意**：`confidence` 取最小、缺失按 0.5——这是确定性规则，不是"随机取一个"。

---

### 6. Critic 能否区分数值正确、证据支持和语义推理？

**⚠️ 前两者能，后者只能做到"规则级"区分。**

| 维度 | 能否判 | 判据 | 局限 |
|---|---|---|---|
| 数值正确 | ✅ 能 | 用 `CalcRecord.inputs` 重算 + 容差；**无 `calc` 的定量 claim 直接判 PARTIAL，不得 PASS**（`15` §1.1 不变量 3） | 仅对有 `CalcRecord` 的结论可判"正确"，对其余只能判"缺凭证" |
| 实体一致 | ✅ 能 | 别名表对齐 + `ctx` 比对 | 依赖别名表覆盖度 |
| 证据支持 | ⚠️ **部分** | 数值匹配→弱；文字谓词匹配→中；两者+上下文→强 | **规则无法真正理解语义**，只能做谓词与数字的表面匹配 |
| 语义推理 | ❌ **不能** | — | 规则引擎无法判断"这个解释在物理上是否成立" |

**必须写明的限制**：Critic 是**规则校验器**，不是科学审稿人。
它能挡住"无据""算错""张冠李戴""单源""过时"，**挡不住"论证看似合理但物理上错误"**。
因此所有答案的措辞必须保留"依据 + 边界"，不能因为 `verdict=PASS` 就宣称结论正确。

**已消除的误用**（`15` §5.3/§5.4）：
- 数字匹配不再等同于证据支持（只能给 `weak`）
- 域名白名单不再等同于"来源已验证"（只能给"可信·未能验证可达"）

---

### 7. 页面刷新后是否能够正确恢复任务？

**⚠️ P4 才有，且语义受限。**

| 能力 | 状态 |
|---|---|
| 刷新后从检查点续跑 | ✅ P4 提供（`15` §4） |
| 已完成步骤不重跑 | ✅ 但仅对幂等工具（Kepler/知识库） |
| 检索步骤复用旧结果 | ❌ **不允许**（非幂等，必须重跑） |
| 页面关闭后任务继续执行 | ❌ **不存在**，纯静态页面无后台进程 |
| 自动恢复次数 | ≤1 次，超限提示用户重新提问 |

**必须避免的产品措辞**："任务在后台继续跑"——事实是"状态已保存，重新打开后可继续"。

---

### 8. 旧架构是否可以随时回滚？

**✅ 可以，三层保障。**

| 层 | 机制 |
|---|---|
| 运行开关 | `settings.orchestration = 'legacy' \| 'hybrid' \| 'full'`，默认 legacy |
| 代码隔离 | 新模块独立文件，不与 `compose*` 耦合；删除即回退 |
| 提交粒度 | 每阶段一个 commit，可单独 revert |

**唯一需要注意**：P0 会修改 `criticReview` 与 `Qty`（加字段）。
回滚时这两个文件需 `git revert`，但因为是**纯追加字段**，即使不回滚也不影响旧路径。

---

### 9. 每个阶段是否都有独立的测试与验收条件？

**✅ 是**（`09` 每阶段均有验收段落，`10` 定义 10 类用例）。

| 阶段 | 独立测试 | 验收门槛 |
|---|---|---|
| P0 | `task-test`（结构/往返/规则） | 352 + ~20 全绿；sections 逐字节一致 |
| P1 | `intent-test`（规则快路径/mock LLM/降级） | 简单问零模型调用；罕见问命中率提升 |
| P2 | `plan-test`（模板/依赖/并行/预算） | L1 延迟不回归；复合问并行生效 |
| P2.5 | `delegation-test`（六项校验） | 越权/成环被拒 |
| P3 | `research-test` 扩至 ~110 | 每条 critical claim 有 URI；冲突必展示 |
| P4 | `eval-test`（进度/预算/恢复） | 单步失败不毁整答；可续跑 |

**共同门槛**：352 条既有断言不得修改预期值（`10` §5）。

---

### 10. 是否还存在必须解决的架构阻塞项？

**⚠️ 有 1 个硬阻塞 + 1 个半阻塞。**

| # | 阻塞项 | 影响 | 解除方式 | 阻塞谁 |
|---|---|---|---|---|
| **B1** | ADS/MAST/JPL Horizons 能否浏览器直连未验证 | 若不可行，P3 的"一手源"只剩 SIMBAD，"论文与最新进展"类需求无法满足 | 2 小时接口探测（CORS/鉴权/格式），**不需改业务代码** | **P3** |
| **B2** | ~~13 个 compose 的逐项副作用仅 1 个实测~~ → **已解除（R4-05）** | 已用 `tools/ctx-isolation-test.js` 覆盖 15 个 intent / 13 个分支：`ctx` 与 `CITIES` 未被污染、无异常、重复执行一致；静态检查已排除 DOM/存储/Promise | 已执行，见测试 F1–F5 | **P2（已解除）** |

**不阻塞但需在对应阶段前完成**：
- V3 Claim 覆盖率（P3 验收指标）
- V4 `composeTonight` P95（决定超时阈值）
- V5 `meta` 字段完整率（决定 Reducer 默认值）

---

### 放行矩阵

| 阶段 | 是否可启动 | 条件 |
|---|---|---|
| **P0** | ✅ **立即可启动** | 无 |
| P1 | ✅ 可启动 | 建议 P0 完成后 |
| P2 | ✅ **可启动**（B2 已解除） | `newShard` 必须按 `05` §3.1 做双层拷贝 + 双层冻结 |
| P2.5 | ⚠️ 需 P2 完成 | 可选，可跳过 |
| P3 | ⚠️ 需先解 B1 | ADS/MAST 可行性；不通过则缩范围为"SIMBAD + 反证 + 时间线" |
| P4 | ✅ 需 P2 完成 | 与 B1 无关 |

---

### 最终审查结论

#### 通过 / 附条件通过 / 不通过

**附条件通过（Conditional Pass）**

| 判定依据 | 说明 |
|---|---|
| 架构主干 | 三态评审、四维证据、分片并行、预算停止、权限矩阵 —— 逻辑闭合，无死结 |
| 已有矛盾 | 11 处已在第三轮全部处置（`14` §3），其中 C1/C3/C10 是会直接导致实施出错的严重项 |
| 契约缺口 | 已由 `15` 补齐（生命周期、恢复协议、Reducer、Token、工具职责） |
| 阻塞项 | **1 硬（B1→P3）**；原半阻塞 B2（compose 副作用）已于 R4-05 用测试解除 |
| 未解决风险 | Critic 无法判断"语义推理是否成立"——这是规则系统的能力边界，不随实现改善 |

**放行建议**：

1. **P0 立即启动**（3–4 天，352 断言作安全网，行为零变化）
2. 并行推进 B1 探测（2 小时，决定 P3 边界）
3. B2 已完成（`tools/ctx-isolation-test.js`，14 条断言）；P2 只需按 `05` §3.1 实现双层拷贝
4. 任何阶段发现问题，以 `15` 为准修订设计，**不得直接改业务代码绕过**

**不通过的情形**（供触发判断）：

- 若 B1 无法在 P3 前解除 → P3 缩范围为「SIMBAD + 反证检索 + 时间线」，取消 ADS/MAST 接入
- 若 P0 无法做到"行为零变化"（sections 出现 diff）→ 停止，回到设计阶段

---

### 签署区（待用户确认）

| 项 | 状态 |
|---|---|
| 第三轮审查结论 | 附条件通过 |
| P0 是否批准启动 | ⬜ 待批准 |
| B1 探测是否授权执行 | ⬜ 待授权 |
| 是否接受"Critic 不能判断语义推理"这一能力边界 | ⬜ 待确认 |

---
