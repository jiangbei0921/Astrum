# ASTRUM V2-SKY · 阶段 2B 星表许可决策

- 文档版本：1.0.0
- 日期：2026-11-06
- 性质：**许可决策记录**（只读核查 + 结论），未修改任何业务代码、未下载任何数据
- 目标：解除 `docs/V2-SKY-阶段2A-执行报告.md` 中「BSC5P 正式导入 **BLOCKED**」的阻塞

---

## 1. 结论

| 项 | 结论 |
|---|---|
| L1 视觉亮星层 | **可采用**：BSC5P，来源固定为 **NASA HEASARC**，许可为**美国政府作品（公有领域）** |
| L2 深星视觉层 | **DEFERRED（不做）**：不引入 Hipparcos-2 / Tycho-2 / Gaia（均为 CC BY-NC 3.0 IGO） |
| 项目商用与否 | **不再构成阻塞**：本方案只使用公有领域数据，商用与非商用均合法 |
| 现有 132 条 `CAT.stars` | **保持不变**（业务身份表），视觉星表独立为 `data/sky-stars-l1.js` |
| 阻塞状态 | **解除**：BSC5P 的 `BLOCKED` 由本条证据关闭 |

---

## 2. 证据

### 2.1 决定性证据：data.gov DCAT 元数据（NASA HEASARC 登记）

来源：<https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw>

关键字段（原文）：

```json
"identifier": "ivo://nasa.heasarc/bsc5p",
"title": "Bright Star Catalog",
"accessLevel": "public",
"publisher": { "@type": "org:Organization", "name": "High Energy Astrophysics Science Archive Research Center" },
"bureauCode": ["026:00"],
"license": "https://www.usa.gov/government-works",
"modified": "2026-05-11",
"description": "The BSC5P database table contains data derived from the Bright Star Catalog, 5th Edition, preliminary ... This table was created by the HEASARC in 1995 ... A number of revisions have been made by the HEASARC to this original version ..."
```

- `license: https://www.usa.gov/government-works` 即美国联邦政府作品条款：**不受版权保护、可自由使用与再分发**（含商用）。
- 该记录由 NASA HEASARC 以机构身份登记，`accessLevel: public`，`bureauCode 026:00`（NASA）。
- `description` 明确：HEASARC 自 1995 年起对该表做过多次修订（含 2014-01 修正 HR 3671 赤纬符号、HR 2496/3515/6515 位置）。**因此「HEASARC 版本」是可主张权利的那一层**。

### 2.2 辅助证据：HEASARC 数据集页面

来源：<https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html>

- 字段确认：`HR / RA / Dec(J2000) / Vmag / BV_Color / Spect_Type / PMRA / PMDec / Parallax / GLon / GLat`
- 规模：约 9,110 条，`V ≤ 6.5` 为主
- 页面本身不写许可（这正是 2A 判定 BLOCKED 的原因），许可信息在 §2.1 的联邦数据目录登记中

### 2.3 为什么仍然不采用 Hipparcos / Tycho / Gaia

| 数据集 | 许可 | 结论 |
|---|---|---|
| Hipparcos-2（VizieR I/311） | CC BY-NC 3.0 IGO | 含「非商业」限制，一旦项目转商用即需替换，属于**技术债** |
| Tycho-2（I/259） | CC BY-NC 3.0 IGO | 同上 |
| Gaia DR3 | CC BY-NC 3.0 IGO | 同上；且 `phot_g_mean_mag` 为 G 波段，不等于 V 星等 |

另：VizieR/CDS 自身条款表述为「数据在科学用途语境下免费使用」（`cds.u-strasbg.fr/vizier-org/licences_vizier.html`），**并非**明确的商用再分发许可。因此正式数据来源固定为 HEASARC 版本，不使用 CDS 镜像作为主来源；CDS 仅用于比对与文献引用。

---

## 3. 决策内容

### 3.1 只做 L1，跳过 L2

理由（按权重排序）：

1. **合规最简**：全部数据来自公有领域，一次决策长期有效，不随「是否商用」反复变化。
2. **当前需求已满足**：界面最小视场被 `zoomViewer()` 夹在 **40°**（见 `core/app.js`），40° 视场内 BSC5P 已能提供数百颗量级（需实测确认，不作预先断言）。当前 `data/catalog.js` 仅 132 颗，30° 视场实测只有 **2 颗**（`V2-SKY-阶段2-专项审计.md` §78），这是最痛的观感缺口。
3. **体积与首屏**：BSC5P 量化后远低于 `≤250 KB` 预算（任务书 T2-02 要求 L1 ≈ 9,096 条）。
4. **字段齐全**：V 星等 + B-V + 光谱型 + 自行 + 视差，正好覆盖 `colorForBV` / 尺寸 / LOD 所需，不需要编造缺失字段。

### 3.2 L2 的触发条件（不是永久放弃）

出现以下任一情况时再单独决策，届时不需要推翻本方案：

- 视场下限下探到 30° 以下且需要保持星密度；
- 出现「深空巡天式」需求（例如按星等极限筛选到 V≈9–11）。

届时可选路径（均为非 NC）：
| 路径 | 许可依据 | 成本 |
|---|---|---|
| UCAC4（USNO） | 美国政府作品；但补充亮星来自 FK6/Hipparcos/Tycho，需法务确认叠加影响 | 高（900 分区二进制预处理 + 亮星来源过滤） |
| APASS DR10 | AAVSO/USNO 公开数据；条款需单独确认 | 中高（需与 BSC5P 交叉去重） |
| 非商用锁定 + Hipparcos-2 | CC BY-NC 3.0 IGO，界面与文档明示「非商业使用」 | 低，但会把项目锁进非商用 |

---

## 4. 合规落地要求（实施阶段必须做到）

1. **来源与许可展示**：「关于 / 数据来源」面板写明
   `恒星：Bright Star Catalogue 5th Rev. Ed. (Prelle & Warren 1991)，NASA HEASARC 修订版（美国政府作品，公有领域）`。
2. **生成文件头**：`data/sky-stars-l1.js` 顶部写 `source / version / license / generatedAt / count`，`license` 字段填 `U.S. Government Work (public domain)` 并附 data.gov 记录链接。
3. **不主张上游授权**：文档与页面**不得**表述为「Yale 大学授权」或「Hoffleit 授权」。正确表述是「NASA HEASARC 发布版本，按其登记的美国政府作品条款使用」。
4. **星等口径**：`Vmag` 按 V 波段使用；不得与 Gaia G 波段混称。
5. **原始文件不入库**：原始表放 `tools/fixtures/star-raw/`（gitignore），只提交生成后的 `data/sky-stars-l1.js`。
6. **不得弱化既有约束**：`CAT.stars` 132 条不动，命中区只由 L0 产生（`it.alt>0 && it.size>1.9*k`），L1 星不写 `_hits`。

---

## 5. 与既有文档的关系

| 文档 | 原有表述 | 本决策 |
|---|---|---|
| `docs/V2-SKY-阶段2A-执行报告.md` | 「BSC5P 正式导入 **BLOCKED**（许可未确认）」 | **本决策关闭该阻塞**；解除依据为 §2.1 |
| `docs/V2-SKY-阶段2-数据来源与许可.md` §2.4 | 「再分发 BLOCKED；确认前不得作为正式发布数据」 | 该条**已被取代**；BSC5P 依 §2.1 可用于发布 |
| `docs/V2-SKY-阶段2-任务清单.md` T2-02 | 「L2 ≈ 20,000–25,000 颗」 | L2 改为 **DEFERRED**；T2-02 只产出 L1 |

> 上述三份文档本次**未修改**（避免覆盖既有记录）。本文件作为新的许可基线文档，实施阶段引用本文件即可。

---

## 6. 对现有代码的影响

- **零改动**：本决策不触碰 `core/*`、`data/catalog.js`、`index.html`、测试断言。
- 实施（后续阶段，需单独授权）才会新增 `data/sky-stars-l1.js`、`core/sky-star-data.js`，并按任务书 T2-04/T2-05/T2-06 增量扩展 `sky-viewmodel.js` 与 `sky-renderer.js`。

---

## 7. 待确认项

| 编号 | 内容 | 需要谁确认 |
|---|---|---|
| C-1 | 是否接受「只做 L1（9,110 颗），L2 暂不做」 | 项目负责人 |
| C-2 | 是否需要在「关于」面板增加数据来源条目（会改动 UI 文案） | 项目负责人 |
| C-3 | 商用场景是否仍需法务复核（本决策已给出公有领域依据，但正式商用建议留档） | 项目负责人 |

---

## 8. 参考链接

- data.gov DCAT 记录（BSC5P）：<https://catalog.data.gov/harvest_record/0675b2e3-9533-4105-9e5a-a13cefd3765c/raw>
- 美国政府作品条款：<https://www.usa.gov/government-works>
- NASA HEASARC BSC5P 页面：<https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html>
- VizieR V/50（比对用）：<https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50>
- ESA Gaia 许可：<https://www.cosmos.esa.int/web/gaia-users/license>
