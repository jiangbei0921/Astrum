# ASTRUM 研究质量与调度修复报告

> 日期：2026-11-02（第二轮质量迭代）
> 触发方式：真实天文研究场景执行，不是静态审查
> 范围：Router 目标识别、Planner 研究检索、T-D 对比、拍摄参数、全文失败提示、基线更新
> 结论：本轮发现并修复 7 类真实缺陷；所有相关测试与全量回归通过；剩余为外部网络/出版社/Key 条件。

---

## 1. 真实场景发现的问题

### 场景 A：`M42 的距离是多少？不同论文的测量是否一致？`

**修复前**：返回 3 篇“申明铺遗址/白杨河墓地/沟湾遗址”考古论文，与 M42 完全无关。
**根因**：Planner 把整句中文问题直接传给 OpenAlex/Semantic Scholar；`enQueryFor` 只做精确匹配，整句不翻译，端点按中文短语检索到无关中文论文。
**修复**：
- `core/planner.js` 新增 `researchQueryOf`：英文目标名 + 最多 2 个主题词；
- 该场景检索式变为 `Orion Nebula distance measurement`；
- T-E 的 `paper.search` 与 `evidence.search` 共用该检索式；`compose.domain` 仍保留原始问题。

**修复后**：返回 `The distance to the Orion Nebula`、`Irradiated and Bent Jets in the Orion Nebula`、`The structure of the Orion nebula`，均为 M42 相关论文。

### 场景 B：`比较 M31 和 M33 的观测难度与距离测量`

**修复前**：进入 T-A 单目标模板，最终 verdict/evidence/observe 仅覆盖 M31；compare 只给坐标。
**根因**：
1. `chooseTemplate` 先判断 `TARGET_INTENTS`，compare 模式被 T-A 抢先；
2. `compareSectionOf` 只输出 RA/Dec/alt/az，没有距离/类型/星等/可见性。
**修复**：
- `chooseTemplate` 在目标模板前判断 compare（显式比较问题走 T-D）；
- `compareSectionOf` 从本地知识库按“距离、类型、视星等、直径、质量”取同口径事实，并加入 `ephem.score` 的可见性标签；
- 浏览器 B31–B33 验证真实页面出现两个目标卡，含距离/类型/可见性。

**修复后**：M31 与 M33 均显示距离、类型、直径/星等、可见性、坐标与高度。

### 场景 C：`M42` 误命中 `M4`，`M33` 误命中 `M3`

**根因**：`resolveTargets` 用纯子串匹配，`m42` 中包含 `m4`，`m33` 中包含 `m3`。
**修复**：
- `core/agents.js` 对纯字母数字目录编号增加独立边界检查：前后不能是字母/数字；
- `core/router.js` 的碰撞过滤改为一次性挖掉所有更长编号，避免 `m33` 替换后仍残留 `m3`。
**测试**：`M42`/`M33` 不再带出 `M4`/`M3`；`M4 和 M42` 仍保留两个目标。

### 场景 D：`今晚在北京用 200mm 望远镜拍摄 M42，应该怎么设置参数？`

**修复前**：识别为 observe-target，回答“肉眼即可，先适应黑暗 20 分钟”，完全忽略 200mm 望远镜和拍摄参数。
**根因**：`KW.photo` 只匹配“拍摄参数/参数怎么设”等固定词序，用户说“怎么设置参数”未命中。
**修复**：
- 扩展 photo 意图关键词：拍摄设置、相机设置、曝光、赤道仪、导星、怎么设置参数等；
- `composePhoto` 识别 `200mm` 口径并在拍摄参数中显示“你的口径 200 mm”，同时提示视场/曝光取决于实际焦距/焦比。

**修复后**：返回完整拍摄参数（目标角径、采样、理论焦距、视场、像元比例、焦比、单张曝光上限、堆栈、跟踪、对焦/校准/降噪）。

### 场景 E：`M42 怎么拍？` 显示荒谬焦距 `93,258 mm`

**根因**：`data/obsplan.js` 的 `focalFor` 把目标角径乘进了焦距公式；采样率只取决于像元大小与焦距，目标角径只决定目标占多少像素。
**修复**：`focalFor = 206.265 × pixelUm / arcsecPerPx`；M42 85′ / 3.76µm / 3″px → 259 mm。
**基线**：P0-03 第 11 问的旧哈希固化了 93,258 mm；经用户明确授权，更新该问基线，其余 19 问哈希不变。旧→新：`d0a94d…/2289 B` → `c71400…/2259 B`。

### 场景 F：全文失败只报“失败”，且只尝试第一篇

**根因**：
1. `Control` 打开 fulltext 时只设 `maxFulltext=4`，未设 `fulltextItems`，默认只试 1 篇；
2. `Report` 只写“N 篇论文全文获取/解析失败”，没有具体 403/反爬/无文本原因。
**修复**：
- `Control` 设 `fulltextItems = 3`，依次尝试最多 3 篇；
- `Report` 增加“全文失败原因：network（HTTP 403）；pdf_no_text（…）；html_error_page（…）”；
- `limitations` 明确“部分论文全文被出版社拒绝或无法解析，结论仅基于摘要”。

### 场景 G：`有什么区别/哪个更适合` 的 20 问基线

**冲突**：真实修复把显式 compare 路由到 T-D，新增 `compare` 章节；P0-03/兼容性基线锁定旧 T-A。
**处理**：经用户明确授权更新验收基线：
- P0-03 第 11 问哈希/字节数更新；
- v1-1/v1-3 兼容性对 T-D 问题校验“原有 sections 逐字节一致 + compare 必须含两个目标”，不是简单删除断言；
- B8 改用显式 L2/T-A 测试数据流，T-D 对比由 quality/browser 覆盖。

## 2. 修改文件

| 文件 | 修改 |
|---|---|
| `core/agents.js` | 目录编号边界匹配；photo 意图关键词；200mm 口径识别 |
| `core/planner.js` | `researchQueryOf`；T-E/T-F 聚焦检索式；compare 模板顺序 |
| `core/router.js` | 多长编号碰撞过滤修复 |
| `core/compose-adapter.js` | 对比事实卡（距离/类型/星等/直径/可见性） |
| `core/report.js` | 全文失败原因与局限说明 |
| `core/control.js` | fulltextItems=3 |
| `data/obsplan.js` | 焦距公式修正 |
| `tools/v1-6-research-quality-test.js` | 新增 22 项研究质量回归 |
| `tools/v1-6-browser-test.js` | 33 → 36 项，新增对比 UI B31–B33 |
| `tools/p0-03-test.js`、`tools/fixtures/p0-03-baseline.json` | 用户授权更新第 11 问基线 |
| `tools/v1-1-routing-test.js`、`v1-1-compat-test.js`、`v1-3-compatibility-test.js`、`b8-test.js` | T-D/基线适配，保留原 sections 校验 |
| `.github/workflows/test.yml`、`tools/v1-4-ci-test.js` | 纳入 research-quality 测试 |

## 3. 测试结果

| 套件 | 结果 |
|---|---:|
| `v1-6-research-quality-test` | 22/22 |
| `v1-6-browser-test` | 36/36（新增 B31–B33） |
| `p0-03-test` | 53/53（第 11 问授权更新） |
| `v1-1-routing-test` | 22/22 |
| `v1-1-compat-test` | 20/20 |
| `v1-3-compatibility-test` | 25/25 |
| `b8-test` | 33/33 |
| `selftest` | 156/156 |
| 全量 Node | 所有套件通过 |
| 构建 | `_site` 58 文件，密钥 0 / 绝对路径 0 |

## 4. 真实场景修复后证据

- 论文检索：`Orion Nebula distance measurement` → 3 篇 Orion 论文，不再是考古论文。
- 全文尝试：3 篇，失败原因分别记录 `network（HTTP 403）`、`pdf_no_text`、`html_error_page`，未伪造全文。
- 对比：M31/M33 两个目标卡，含距离、类型、星等/直径、可见性。
- 拍摄：200mm 口径被识别，理论焦距 259mm，给出采样/视场/曝光/堆栈/跟踪。
- 目标识别：M42 不再带出 M4，M33 不再带出 M3。

## 5. 剩余外部条件

| 项 | 状态 | 说明 |
|---|---|---|
| SIMBAD 当前网络 | 超时 | 本地知识库仍提供 M42 参数；不伪造 SIMBAD 结果 |
| 出版社 403/反爬 | 外部 | A&A/IOP PDF 被拒；最多尝试 3 篇，失败原因可见 |
| 真实 HTML 全文 | 部分成功 | 出版社 HTML 有时被识别为错误页；不冒充全文 |
| 真实 Provider Key | BLOCKED_API_KEY | 未执行真实模型调用 |
| 真实扫描/CID 样本 | BLOCKED_SAMPLE | 合成 13 类已通过 |

## 6. 发布与线上验收

| 项 | 结果 |
|---|---|
| 代码提交 | `1b1be97`（修复）+ `fffc128`（文档/基线） |
| test Run | `41443340306` success |
| pages Run | `41443735631` success |
| 线上 `version.json` | commit `fffc128`、dirty=false |
| 线上对比 UI | “比较 M31 和 M33”两个目标卡，含距离/类型/可见性 |
| 线上拍摄参数 | 200mm 口径、259mm 理论焦距、38s 曝光上限、赤道仪/导星 |
| 线上 console | 无消息，无 CSP 违规 |

## 7. 结论

本轮不是“发现后写报告”，而是完成了真实场景 → 根因 → 代码修改 → 测试 → 基线授权更新 → 回归的闭环。所有修改均有对应测试；旧接口/13 Agent/Tool-Centric/ADR-001 预算未改变。
