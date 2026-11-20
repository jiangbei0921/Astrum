# ASTRUM V2-SKY · 子阶段 2A 执行报告

- 执行范围：Git 核查、阶段 1 接口复核、BSC5P 许可核查、NASA SVS 许可核查、数据格式与预处理方案
- 执行原则：只读；**未修改任何业务代码**；**未下载任何外部数据**
- 结论：**BSC5P 正式导入 BLOCKED（许可未确认）；NASA SVS 银河资源许可 DONE；其余数据方案待决策**

## 1. Git 状态核查

```
分支：main
HEAD：53f3403d6e26e8947e330a58f923d07e9607b4d3
提交：53f3403 docs: add V1.15 real-environment acceptance report
```

工作区（阶段 1 改动 + 用户既有修改）：

| 状态 | 文件 |
| --- | --- |
| M | `core/app.js`、`index.html`（阶段 1） |
| M | `docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json`（用户既有，保留） |
| ?? | `core/sky-viewmodel.js`、`core/sky-renderer.js`、`core/sky-layers.js`、`core/planet-visuals.js` |
| ?? | `tools/v2-sky-01-test.js`、`tools/v2-sky-01-browser-test.js` |
| ?? | 阶段 1/2 设计文档 7 份 |

未执行任何 Git 写操作；未触碰用户既有修改。

## 2. 阶段 1 代码与接口复核

| 接口 | 位置 | 结论 |
| --- | --- | --- |
| `drawSky(canvas, p)` 兼容入口 | `core/app.js#L823` | 存在，签名未变 |
| `skyModel(jd,lat,lon)` 包装 | `core/app.js#L799` | 存在，转调 `SkyVM.model` |
| `SkyVM` 导出 | `core/sky-viewmodel.js#L396` | 存在 |
| `SkyRender` 导出 | `core/sky-renderer.js#L643` | 存在 |
| `SkyLayers` 导出 | `core/sky-layers.js#L86` | 存在 |
| `PlanetVisuals` 导出 | `core/planet-visuals.js#L81` | 存在 |
| 脚本顺序 | `index.html#L524-L528` | layers → viewmodel → planet-visuals → renderer → app |
| `_hits/_bodies/_meta` | `core/sky-renderer.js#L609-L641` | 结构未变 |

阶段 2 可继续在这些接口上增量扩展，不需要重做阶段 1。

## 3. 数据许可核查结果

### 3.1 BSC5P（Bright Star Catalogue 5th Ed.）

| 项 | 结果 |
| --- | --- |
| 官方页面 | NASA/HEASARC BSC5P：<https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html> |
| 原始版本 | CDS/VizieR `V/50`：<https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50>；Hoffleit & Warren 1991 |
| 页面是否声明许可 | **否**。HEASARC 页面只说明由 ADC/CDS 文件创建及字段含义 |
| HEASARC 通用条款 | FAQ 仅说明图片版权按 NASA 政策、有版权标识需联系版权方；**未给出数据表单的明确再分发许可** |
| CDS/VizieR 条款页 | 实际抓取未返回内容（`ReadMe`、`terms` 均为空）；**无法确认 CDS 侧再分发条件** |
| 第三方说法 | 有第三方项目标注“Public domain”，但非官方，不可作为依据 |
| 结论 | **BLOCKED**：原始许可未确认，按任务书要求停止正式数据导入 |

**影响**：L1 不能以 BSC5P 作为正式发布数据源。不能以“NASA 页面可访问”推定可再分发。

### 3.2 Hipparcos / Hipparcos-2 / Tycho-2 / Gaia

| 数据集 | 官方许可 | 结论 |
| --- | --- | --- |
| Hipparcos / Tycho（ESA） | **CC BY-NC 3.0 IGO**（<https://www.cosmos.esa.int/web/Hipparcos/catalogues>） | 默认不纳入正式发布 |
| Gaia DR3 / EDR3 | **CC BY-NC 3.0 IGO**（<https://www.cosmos.esa.int/web/gaia-users/license>） | 默认不纳入正式发布 |

任务书要求“默认不纳入正式发布数据，除非确认项目用途与许可完全兼容”。当前未确认项目用途，因此这些数据均不进入 2A 正式导入。

### 3.3 UCAC4（替代方案，需进一步法务确认）

| 项 | 结果 |
| --- | --- |
| 官方说明 | USNO UCAC4 ReadMe：数据“available free of charge”，通过天文数据中心分发；包含 APASS B/V 五波段测光（5000 万+ 星）、自行、J2000 位置 |
| 数据.gov 记录 | `license: https://www.usa.gov/government-works`（美国政府作品） |
| 规模 | 约 1.137 亿条；单条二进制 78 B |
| 亮星来源 | 亮星由 FK6/Hipparcos/Tycho-2 补充（source flag 6/7），存在上游 NC 数据混入 |
| 结论 | **候选**，但需法务确认“编译目录整体按政府作品”是否覆盖补充星；预处理成本高（900 个分区二进制文件） |

### 3.4 NASA SVS Deep Star Maps 2020

| 项 | 结果 |
| --- | --- |
| 官方页面 | <https://svs.gsfc.nasa.gov/4851/> |
| 许可声明 | SVS Help 明确：“All of our content is in the public domain (unless otherwise noted)… free to download, use, and redistribute for whatever purposes” <https://svs.gsfc.nasa.gov/help/> |
| 银河产品 | `milkyway_2020_*`，明确“omits the bright (Hipparcos and Tycho) stars”，适合作为纯背景 |
| 投影 | plate carrée；赤道版中心 RA 0h、RA 向左增大；银道版中心 l=0°、l 向左增大（官方文字） |
| 上游数据 | Gaia DR2、Hipparcos-2、Tycho-2、Yale BSC、UCAC3、XHIP；SVS 声明产物公有领域 |
| 结论 | **DONE（许可）**；资源获取与预处理 **DEFERRED**（等待 2C 批准） |

### 3.5 ESO/S. Brunier 全景（备选）

ESO 公共图片默认 **CC BY 4.0**（<https://www.eso.org/public/copyright/>）；`eso0932a` 6000×3000，需署名 “ESO/S. Brunier” 并标注修改；精确坐标取向待核实。列为银河备选，不进入 2A 主路径。

## 4. 数据方案裁决

### 4.1 恒星数据（2A 结论）

| 方案 | 数据 | 许可 | 状态 | 说明 |
| --- | --- | --- | --- | --- |
| A | BSC5P | 未确认 | **BLOCKED** | 不得正式导入 |
| B | Hipparcos-2 | CC BY-NC | **DEFERRED** | 仅当确认项目非商用 |
| C | UCAC4 | 美国政府作品（待法务） | **候选** | 可商用方向，预处理成本高 |
| D | 不扩充恒星数据 | — | **备选** | 仅升级银河背景；恒星升级 PARTIAL/DEFERRED |

**建议**：在许可明确前，2B 不得以 BSC5P 为正式数据源。请负责人在以下三种路径中选择一种：

1. **非商用确认** → 采用 Hipparcos-2（V≤7.5，约 2 万颗），署名 ESA，界面标注非商业；
2. **商用需求** → 先法务确认 UCAC4 条款，再建立 UCAC4 管线（周期更长）；
3. **暂不扩充恒星** → 只做银河背景（NASA SVS 公有领域），恒星视觉升级延期。

### 4.2 银河资源（2A 结论）

NASA SVS 为公有领域，可直接作为阶段 2 银河底图来源。需在 2C 执行：

- 下载 `milkyway_2020_4k`（或从 4k EXR 离线转 2048×1024 JPEG）；
- 校验赤道版取向（RA 0h 中心、RA 向左增大）；
- 记录署名与处理步骤；
- 打包 ≤300 KB；
- 失败降级到阶段 1 程序化背景。

## 5. 恒星字段规范与预处理方案（待数据源确定后执行）

### 5.1 字段（以 BSC5P 为例，UCAC4/Hipparcos 映射见括号）

| 项目 | BSC5P 字段 | 说明 |
| --- | --- | --- |
| id | `HR` | 唯一；UCAC4 用 `UCAC4-zzz-nnnnnn`，Hipparcos 用 `HIP` |
| ra | `RA` | 小时；J2000 |
| dec | `Dec` | 度；J2000 |
| vmag | `Vmag` | V 星等 |
| bv | `BV_Color` | 缺失标记需统一为 `null` |
| sp | `Spect_Type` | MK 光谱型；UCAC4 无此字段 |
| pmra | `PMRA` | mas/yr；需确认是否含 cosδ（BSC5P 为 RA 方向角秒/年，转换时明确） |
| pmdec | `PMDec` | mas/yr |
| plx | `Parallax` | mas |
| l0Key | 位置匹配 | 与 `CAT.stars` 2″ 内匹配，保留原 `k` |

### 5.2 预处理流程（`tools/build-star-data.js`）

1. 读取本地导出文件（FITS/CSV；原始文件不入库）；
2. 字段校验：`HR` 唯一、`0≤ra<24`、`−90≤dec≤90`、`−2≤vmag≤8`；
3. 缺失值规范：空串/`-999`/`*` → `null`；
4. 与 L0 做球面距离匹配（≤2″），记录 `l0Key` 与匹配报告；
5. 截断：L1 `V≤6.5`；L2 由数据源决定；
6. 量化打包（ra uint32 1e-5h、dec int32 1e-4°、vmag int16 1e-2、bv int16 1e-3、pm int16、plx int16、sp uint8、l0Key uint16）；
7. 输出 `data/sky-stars-l1.js`，头部写入 `source/version/license/generatedAt/count/fields`；
8. 输出校验报告：总数、截断数、缺失 B-V/光谱数、L0 匹配数、哈希。

### 5.3 验收（2A 阶段只定义，不执行）

- 生成脚本可重复，哈希稳定；
- 字段完整率与缺失率报告可核对；
- 不修改 `CAT.stars`；
- 输出文件 ≤ 250 KB（L1）；
- 若许可未确认，脚本拒绝写出正式文件（只允许 `--check` 干跑）。

## 6. 子阶段 2A 状态汇总

| 项目 | 状态 |
| --- | --- |
| Git 状态核查 | **DONE** |
| 阶段 1 接口复核 | **DONE** |
| BSC5P 许可核查 | **BLOCKED**（无法确认） |
| NASA SVS 许可核查 | **DONE**（公有领域） |
| Hipparcos/Tycho/Gaia 许可核查 | **DONE**（CC BY-NC，默认排除） |
| UCAC4 作为替代 | **PARTIAL**（许可线索明确，需法务与预处理评估） |
| 数据字段规范 | **DONE** |
| 预处理方案 | **DONE**（设计） |
| 数据下载/生成文件 | **DEFERRED**（等待批准） |
| 银河资源下载/预处理 | **DEFERRED**（2C） |

## 7. 风险清单

| 风险 | 级别 | 说明 | 处理 |
| --- | --- | --- | --- |
| BSC5P 许可不明 | 高 | 不能正式导入 | 停止导入，等待负责人选择替代 |
| 以 NASA 页面可访问推定可再分发 | 高 | 不合规 | 明确禁止 |
| Hipparcos/Tycho/Gaia NC | 高 | 商用不可用 | 仅在非商用确认后启用 |
| UCAC4 补充星来源 | 中 | 含 Hipparcos/Tycho 数据 | 法务确认；或只取 UCAC 观测星 |
| UCAC4 体量 | 中 | 1.13 亿条、900 分区 | 离线截断，预处理复杂 |
| NASA SVS 上游数据 NC | 低-中 | 产物公有领域，但上游为 NC | 文档披露，保留法律意见 |
| 银河取向判断错误 | 中 | 整夜错位 | 参考点验证 + 官方投影说明 |
| 新增资源破坏 standalone | 中 | 单文件缺图 | 2D 阶段扩展构建脚本并测试 |

## 8. 下一步实施计划（需批准）

1. **负责人决策**（本节四项）：
   - 项目商用/非商用；
   - 恒星数据路径（Hipparcos-2 / UCAC4 / 暂不扩充）；
   - 银河底图确认使用 NASA SVS；
   - 是否允许 2C 下载并预处理底图、扩展 standalone。
2. 批准后进入 **子阶段 2B 前置**：仅当恒星数据源许可明确，才执行 `build-star-data.js` 与 L1/L2 生成；否则 2B 改为“等待数据源”，先做银河（2C）。
3. 银河资源可在 2C 独立推进（与恒星数据源解耦）。

## 9. 未执行事项声明

- 未修改任何 JS/HTML/CSS/构建脚本；
- 未下载 BSC5P、UCAC4、Hipparcos、Gaia 或 NASA SVS 数据；
- 未生成 `data/sky-stars-l1.js` / `l2.js`；
- 未修改 `tools/build-standalone.js`；
- 未执行 Git 写操作；
- 未进入子阶段 2B。

**子阶段 2A 已完成审计与许可核查，因 BSC5P 许可无法确认而阻塞正式数据导入；等待负责人决策后再继续。**
