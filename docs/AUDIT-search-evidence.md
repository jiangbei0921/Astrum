# ASTRUM 检索与答案链路审计（第一阶段：问题定位）

版本 1.0 · 2026-10-23
审计范围：`core/sources.js`、`core/app.js`、`core/agents.js`、`data/catalog.js`
方法：**先读代码，再用可复现的实测验证**。每条结论都附代码位置与实测证据。

复现工具：`node tools/diag.js`（拦截 fetch，打印实际请求 URL 与返回结果）

---

## 零、结论摘要

沿「用户提问 → 意图解析 → 生成检索词 → 调用检索 → 结果整理 → 送入模型 → 输出答案」追踪，发现**联网检索功能当前实质失效**，且**检索结果从不参与答案生成**。

| 级别 | 问题 | 影响 |
| --- | --- | --- |
| **P0** | 检索查询词在调用链中丢失，所有查询实际都在搜同一个词 `Naos` | 检索结果与问题完全无关 |
| **P0** | 检索结果只作为链接列表挂在答案下方，从不进入答案正文或模型输入 | 答案 100% 来自本地 133 条知识库 |
| **P0** | 单轮单查询，无规划、无拆解、无迭代 | 复杂问题无法覆盖 |
| **P1** | 单端点「首个成功即返回」，无多源聚合 | 科普问题只能拿到论文，无法交叉验证 |
| **P1** | 结果字段残缺（无时间/来源类型/作者），摘要固定截断 180 字 | 证据不可追溯，关键内容被截 |
| **P1** | 相关性过滤形同虚设（2-gram 任一命中即通过，无命中则全放行） | 无关结果照样展示 |
| **P2** | 无去重、无排序、无跨源验证；「共识」字段是知识库硬编码 | 无法发现来源冲突 |
| **P2** | 引用不可验证；`numericAudit` 只比对本地事实池 | 无法证明答案依据检索资料 |
| **P2** | 检索链路无结构化日志 | 故障长期未被发现 |
| **P3** | 缓存 key 仅查询串；限流失败直接抛错不走降级 | 连续追问易失败 |

---

## 一、P0-1：检索查询词从未传递（最严重）

### 代码位置

```js
// core/sources.js:759  —— search() 内部调用端点
return withRetry(ep.fn, 2).then(function (r) {

// core/sources.js:714  —— withRetry 内部执行
return fn().then(function (items) {
```

`withRetry(ep.fn, 2)` 只传了函数本身，**没有把 `search(query)` 收到的 `q` 传给端点函数**，`fn()` 以 `undefined` 作为查询词执行。

### 连锁成因

1. `openAlex(undefined)` → `enQueryFor(undefined)`
2. `enQueryFor`（`core/sources.js:517`）执行 `String(q || '').trim()` → `''`
3. 随后遍历星表：`if (C.stars[j].cn === s2) return C.stars[j].en;`
4. `data/catalog.js:70` 有一颗恒星 `cn` 为空字符串：
   ```js
   ['naos','Naos','','ζ','Pup',8.05974,-40.0031,2.21],
   ```
5. `'' === ''` 成立 → 返回 `'Naos'`
6. 最终请求：`https://api.openalex.org/works?search=Naos&per-page=3`

### 实测证据

```
问题：什么是黑洞？
→ 送给 Sources.search 的关键词："黑洞"
→ 实际发出的请求：api.openalex.org/works?search=Naos
→ 返回：
   · The NAO Troposphere–Stratosphere Connection      ← 大气科学
   · Mechatronic design of NAO humanoid               ← 机器人
   · NAOS, the first AO system of the VLT             ← 望远镜自适应光学
```

对照实验 —— 用同一 URL 直接 fetch（不经过 `withRetry`）：

```
search=Black%20Hole → · Black holes
                      · Black Holes and Entropy
                      · Quintessence and black holes     ← 正确
```

### 为什么长期没被发现

`diagnose()`（`core/sources.js:813`）走的是另一条路径，**它传了参数**：

```js
return pv.fn('猎户座').then(function (items) {
```

实测对比：

```
diagnose() 期间请求：search=Orion          ← 正确
search('什么是黑洞') 请求：search=Naos      ← 错误
```

因此界面上的「检测连通」显示各端点可用，而实际检索返回的全是无关内容。**连通性正常与检索正确是两件事**。

### 影响

联网检索的产出在任何查询下都是同一批无关论文，用户看到的「检索结果」章节实质是噪声。

---

## 二、P0-2：检索结果从不进入答案

### 代码位置

```js
// core/app.js:2475-2500（web 来源分支）
ans = AC.buildAnswer(q, ctx, cfgRun);          // ← 答案在此已完整生成（纯本地知识库）
...
var sq = (ans.meta && ans.meta.target) ? ans.meta.target : q;
S.search(sq).then(function (r) {
  ans.sections.splice(sectionIndexAfterVerdict(ans), 0,
    { kind: 'web', title: '检索结果 · ' + sq, items: items, provider: r.provider, ms: r.ms });
  renderAnswer(ans, {});                        // ← 结果只是被插入为展示章节
});
```

`renderAnswer` 对 `kind === 'web'` 的处理（`core/app.js:1928`）只渲染 `title` / `snippet` / `host`，**不参与任何文本生成**。

### 送模型的内容也不含检索结果

```js
// core/app.js:2320
function factsFromAnswer(ans) {
  ans.sections.forEach(function (s) {
    if (s.kind === 'evidence') { ... }          // ← 只取本地知识库的 evidence
  });
}
```

`S.generate()`（cloud 分支）收到的 payload 只有 `facts` / `para` / `memory`，没有检索条目。

### 实测证据

```
→ 答案正文是否引用检索标题：否 — 检索结果未进入答案
```

### 影响

- 选择「联网检索」来源时，答案仍是本地知识库的表述，检索只提供了几条链接
- 选择云端模型时，模型看不到任何检索资料，只在复述本地事实
- 本地知识库未覆盖的问题走 `composeFallback`（`core/agents.js:1781`），直接回答「不在可确证范围内」，**而此时下方可能挂着检索结果**——明知有资料却答不知道

---

## 三、P0-3：单轮单查询，无规划

### 代码位置

`core/app.js:2482-2484`：整个 `ask()` 中只有**一次** `S.search(sq)` 调用。

查询词的来源是知识库条目标题，而非用户问法：

```js
var sq = (ans.meta && ans.meta.target) ? ans.meta.target : q;
```

### 实测证据

| 用户问题 | 实际检索词 | 丢失的限定 |
| --- | --- | --- |
| 为什么超新星爆发能产生那么大的能量？ | `恒星演化与超新星` | 「能量」「产生机制」 |
| M87 黑洞的质量是多少？ | `人类首张黑洞照片` | 「质量」 |

检索词变成条目名后，问题中的关键限定词（质量、能量、机制、与其他解释的对比）全部丢失。

### 影响

- 无法拆解复合问题（如「为什么产生巨大能量」需拆成：类型与形成条件 / 观测证据 / 物理机制 / 替代解释）
- 无法根据首轮结果发现更具体的锚点（如论文里的作者、任务名、仪器名）
- 无轮数上限、无预算控制（因为根本没有多轮）

---

## 四、P1-4：单端点「首个成功即返回」，无多源聚合

### 代码位置

```js
// core/sources.js:702-708
var ENDPOINT_CHAIN = [
  { id: 'openalex',        name: 'OpenAlex',            fn: openAlex,        kind: '学术文献' },
  { id: 'nasa',            name: 'NASA 图库',            fn: nasaSearch,      kind: '天文影像' },
  { id: 'wikimedia',       name: '维基百科',              fn: wikiCore,        kind: '百科条目' },
  { id: 'semanticscholar', name: 'Semantic Scholar',    fn: semanticScholar, kind: '学术文献' },
  { id: 'wiki-action',     name: '维基百科（备用）',       fn: wikiAction,      kind: '百科条目' }
];

// core/sources.js:766-769 —— 第一个非空即返回
healthOk(ep.id, r.ms);
cachePut(q, r.items, ep.name);
return { ok: true, items: r.items, provider: ep.name, ms: r.ms, cached: false };
```

### 影响

1. **源类型与问题类型不匹配**：链首是论文库，「什么是黑洞」这类基础科普拿到的是论文摘要；百科（更适合科普）永远不会被调用
2. **无法交叉验证**：只拿到一个源，不存在「多源比对」的前提
3. `kind` 字段（学术文献/天文影像/百科条目）已定义但**从未被用于选择**，是死数据

---

## 五、P1-5：结果字段残缺

### 现状

统一结果结构只有 4 个字段：

```js
{ title, snippet, url, host }
```

### 各端点丢弃的可用字段（实测接口确有返回）

| 端点 | 接口已返回但未采集 |
| --- | --- |
| `nasaSearch`（sources.js:538） | `date_created`、`center`、`photographer` |
| `openAlex`（sources.js:558） | `publication_date`、`publication_year`、`authorships`、`cited_by_count` |
| `semanticScholar`（sources.js:574） | `year` 被拼进 title 字符串（`title + '（year）'`），非独立字段 |

NASA 实测返回：

```
可采集字段: center, date_created, description, keywords, location, media_type, nasa_id, photographer, title
date_created = 2016-09-20T00:00:00Z
center = KSC
```

### 摘要被硬截断

`shortText(t, 180)` 对所有来源统一截 180 字，证据片段经常在关键处断掉。

### 无「来源类型」字段

论文 / 百科 / 机构影像 / 数据库无法区分，下游无法按证据强度排序。

---

## 六、P1-6：相关性过滤形同虚设

### 代码位置

```js
// core/app.js:2386
function filterRelevant(items, q) {
  var key = String(q || '').replace(/[，。？?！!\s]/g, '');
  var grams = [];
  for (var i = 0; i <= key.length - 2; i++) grams.push(key.slice(i, i + 2));   // 2-gram
  var hit = items.filter(function (it) {
    return grams.some(function (g) { return hay.indexOf(g) >= 0; });          // 任一命中即通过
  });
  return hit.length ? hit : items;                                            // 无命中则全放行
}
```

两个问题：
1. `grams.some(...)` —— 只要有**任意一个** 2 字片段重合就算相关，过于宽松
2. `hit.length ? hit : items` —— 一个都没命中时返回**全部**，等于不过滤

实测「什么是黑洞」的 2-gram 无法匹配 NAO 论文，但仍全部展示。

---

## 七、P2-7：无去重、无排序、无跨源验证

- `S.search` 返回的就是单端点原始顺序，没有去重与排序步骤
- `curate()`（`core/agents.js:697`）存在且实现了按标题前 24 字去重，但**只用于本地知识库证据**，从未作用于联网结果
- 「共识等级」章节读的是知识库条目字段：

```js
kind: 'consensus', level: entry.status, verified: entry.verified,
open: entry.openQuestion || '', evidence: entry.evidence || []
```

`status` / `verified` 都是 `data/knowledge.js` 里**人工写死的静态值**，不是跨源检索比对的结果。界面上呈现的「共识等级」因此与本次检索无关。

---

## 八、P2-8：引用不可验证

- 答案引用的 `entry.sources`（`[{n, u}]`，来自知识库硬编码）与本次检索结果**没有任何关联**
- 代码中不存在「断言 → 证据编号」的映射，也不存在「引用是否存在于本轮检索结果」的校验
- `numericAudit`（`core/app.js:2343`）只做一件事：模型输出里的数字是否出现在**本地事实池**，与检索来源无关

因此当前无法回答「这句话的依据是哪条检索结果」，也无法发现「引用了不存在的来源」。

---

## 九、P2-9：检索链路无结构化日志

### 现有能力（应复用，不重建）

| 机制 | 位置 | 记录内容 |
| --- | --- | --- |
| `answer.trace` | `core/agents.js`（`step()`） | 意图解析、知识命中、表述语体 |
| `TASKS` | `core/app.js`（`taskStart`/`taskEnd`） | type / label / state / ms / error |
| `HEALTH` | `core/sources.js:644` | 每端点成功失败数、熔断状态 |
| `STATS` | `core/agents.js` | 总次数、意图分布 |

### 缺口

- 不记录：本轮检索词、实际端点、原始结果数、去重后结果数、继续/停止原因
- `taskStart('search', '联网检索 · ' + sq)` 只记了 label，没有结果统计
- 正因为没有这些日志，P0-1 这种「查询词丢失」的故障才长期不可见

---

## 十、P3-10 / P3-11：加固不足

1. **限流失败不走降级**（`sources.js:740`）：`allow('search')` 不通过时直接 `reject`，既不用缓存也不降级。实测连续追问题会出现「检索过于频繁，请 1 秒后再试」
2. **缓存 key 仅查询串**（`sources.js:657`）：不区分端点与参数，一旦增加多源，会互相污染
3. **空查询无入口防御**：`enQueryFor('')` 命中空 `cn` 的恒星，是 P0-1 的放大器。应在入口直接拒绝空查询

---

## 十一、测试现状

`tools/selftest.js`（27 项断言）与 `tools/geotest.js`（16 项）均**没有覆盖 `Sources.search`**：

```
grep -c "Sources\.\|S\.search" tools/selftest.js tools/geotest.js
→ 0 / 0
```

这是 P0-1 能长期存在的直接原因：检索链路完全没有回归测试。

---

## 十二、与要求的对照

| 要求 | 现状 |
| --- | --- |
| 是否只执行一次搜索 / 关键词是否恒定 | **是**。单次调用，且因 P0-1 恒定为 `Naos` |
| 能否根据首轮结果发现更具体锚点 | 不能，无多轮 |
| 能否拆解复杂问题 | 不能，无规划层 |
| 不同类型问题是否用合适数据源 | 不能，固定链首论文库 |
| 结果是否重复/无关/过时 | 无关（P0-1）；无时间去重字段；无去重逻辑 |
| 标题/URL/时间/来源类型/正文是否保留 | 仅 title/url/host；时间与类型丢失；正文截 180 字 |
| 多源去重/排序/交叉验证 | 全部缺失（且根本没有多源） |
| 答案是否真正依据检索资料 | **否**，完全依据本地知识库 |
| 关键事实能否对应检索来源 | 否，无映射与校验机制 |
| 失败/超时/冲突/数据不完整处理 | 超时与失败有分类与降级；冲突与不完整无处理 |

---

## 十三、结论

当前项目的**本地事实层（星历复算 + 133 条带出处知识库）是可靠的**，问题全部集中在「联网检索 → 证据 → 答案」这一段：

1. 检索因参数丢失而失效（P0-1）
2. 检索结果与答案生成完全脱节（P0-2）
3. 没有规划与多轮机制（P0-3）

因此优化重点**不是加大模型或增加数据源，而是把已经存在但断掉的链路接上，并补上证据管理与引用校验**。这不需要引入新依赖，也符合项目「纯静态、零依赖、可离线」的定位。
