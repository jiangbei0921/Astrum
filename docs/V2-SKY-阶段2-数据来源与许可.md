# ASTRUM V2-SKY · 阶段 2 数据来源与许可

- 结论先行：**本阶段尚未下载或引入任何外部数据**，以下均为官方来源调研结果。
- **2A 核查更新（2026-11-05）**：BSC5P 许可无法确认，正式导入 **BLOCKED**；NASA SVS 公有领域确认 **DONE**；详见 `V2-SKY-阶段2A-执行报告.md`。
- 任何“待确认”项在编码前必须有明确答复；不得默认可以商用或再分发。
- 所有链接均为官方或官方数据档案页面，非第三方转载。

## 1. 推荐组合（设计与许可视角）

| 用途 | 推荐数据集 | 许可 | 结论 |
| --- | --- | --- | --- |
| L0 业务身份表 | 现有 `data/catalog.js`（132 条） | 项目内已有 | 保持不变；逐星来源待补 |
| L1 亮星视觉层 | BSC5P（NASA/HEASARC 版本） | NASA 条款；原始 BSC5 条款待确认 | **BLOCKED**：2A 核查未能确认再分发条款 |
| L2 深星视觉层 | Hipparcos-2（I/311）或 Tycho-2（I/259） | **CC BY-NC 3.0 IGO** | 仅非商业可用；商用需换源 |
| 商用替代 | UCAC4（USNO） | 美国政府作品（data.gov） | 候选，需法务确认补充星来源 |
| 银河底图 | NASA SVS `milkyway_2020` | 公有领域（SVS 声明） | **推荐**，署名 NASA/Goddard |
| 银河底图备选 | ESO/S. Brunier `eso0932a` | CC BY 4.0 | 可商用，需署名与标注修改 |

## 2. 数据集明细

### 2.1 Gaia DR3

| 项 | 内容 |
| --- | --- |
| 官方来源 | ESA Gaia Archive：<https://gea.esac.esa.int/archive/> |
| 发布说明 | <https://www.cosmos.esa.int/web/gaia/data-release-3>（2022-06-13） |
| 数据文档 | <https://gea.esac.esa.int/archive/documentation/GDR3/> |
| 规模 | 约 18 亿源（DR3 概览） |
| 主要字段 | `source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax, pmra, pmdec, teff_gspphot`（部分子集） |
| 坐标系统 | ICRS / J2000（`ra` 度、`dec` 度） |
| 许可 | **CC BY-NC 3.0 IGO**（官方 License 页：<https://www.cosmos.esa.int/web/gaia-users/license>） |
| 署名 | 按 Gaia DR3 Credit and Citation 指令：<https://gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/> |
| 再分发 | 非商业可再分发，需署名与许可声明；商用需联系 ESA 取得条件 |
| 本站用途 | **不推荐作为主数据集**：G 波段不等于 V 波段；且 NC 限制 |

**关键警告**：`phot_g_mean_mag` 是 Gaia G 波段，不能直接当作 V 星等。若使用，必须明确标注“G 波段”，或只用于相对亮度，不得与 L0 的 V 星等混为一谈。

### 2.2 Hipparcos / Hipparcos-2

| 项 | 内容 |
| --- | --- |
| 官方来源 | ESA Hipparcos：<https://www.cosmos.esa.int/web/Hipparcos/catalogues> |
| 数据档案 | VizieR `I/239`（1997 原始）：<https://cdsarc.cds.unistra.fr/viz-bin/cat/I/239>；`I/311`（van Leeuwen 2007 新约化）：<https://cdsarc.cds.unistra.fr/viz-bin/cat/I/311> |
| 规模 | 约 118,000 颗 |
| 字段 | `HIP, RAdeg, DEdeg, Vmag, B-V, SpType, pmRA, pmDE, Plx` |
| 坐标 | ICRS/J2000（`I/311`） |
| 许可 | **CC BY-NC 3.0 IGO**；ESA 要求 “Credit: ESA”（官方页面明示） |
| 再分发 | 非商业；需署名 ESA 与许可声明 |
| 本站用途 | L2 候选；仅在确认非商用后使用 |

### 2.3 Tycho-2

| 项 | 内容 |
| --- | --- |
| 官方来源 | VizieR `I/259`：<https://cdsarc.cds.unistra.fr/viz-bin/cat/I/259> |
| 文献 | Høg et al. 2000, A&A 355, L27 |
| 规模 | 约 250 万颗（V ≈ 11.5 极限） |
| 字段 | `TYC, RAdeg, DEdeg, Vmag, B-V, pmRA, pmDE`（无光谱型） |
| 坐标 | ICRS/J2000 |
| 许可 | **CC BY-NC 3.0 IGO**（与 Hipparcos 同一 ESA 条款） |
| 再分发 | 非商业；需署名 ESA |
| 本站用途 | L2 候选；数据量大，需离线截断（V ≤ 7.5 / 9.0） |

### 2.4 Bright Star Catalogue 5th Edition（BSC5 / BSC5P）

| 项 | 内容 |
| --- | --- |
| 官方来源（NASA 版本） | HEASARC BSC5P：<https://heasarc.gsfc.nasa.gov/W3Browse/star-catalog/bsc5p.html> |
| 官方来源（CDS 版本） | VizieR `V/50`：<https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50> |
| 文献 | Hoffleit & Warren 1991, “The Bright Star Catalog, 5th Revised Edition (Preliminary Version)” |
| 规模 | 约 9,110 条（V ≤ 6.5 为主） |
| 字段 | `HR, RA, Dec, Vmag, BV_Color, Spect_Type, PMRA, PMDec, Parallax`（J2000 位置） |
| 坐标 | J2000（HEASARC 表另有 B1900/B1950 列，不使用） |
| 许可 | **2A 核查未确认**：HEASARC 页面未声明数据许可；CDS `V/50` ReadMe/条款页抓取为空；第三方“public domain”说法非官方 |
| 再分发 | **BLOCKED**：确认前不得对外宣称可再分发，也不得作为正式发布数据 |
| 本站用途 | L1 候选但 **停止导入**，等待负责人选择替代方案 |

### 2.4B UCAC4（商用替代候选）

| 项 | 内容 |
| --- | --- |
| 官方来源 | USNO UCAC4 ReadMe：<https://gpp-irsa.noirlab.edu/data/USNO/UCAC4/readme_u4.txt> |
| 数据入口 | IRSA：<https://irsa.ipac.caltech.edu/>；NASA data.gov 记录（`license: https://www.usa.gov/government-works`） |
| 规模 | 约 1.137 亿条；900 个赤纬分区，单条 78 B 二进制 |
| 字段 | J2000 RA/Dec、UCAC 模型/孔径星等、APASS `B,V,g,r,i`（5000 万+ 星）、2MASS JHK、自行、视差（Hipparcos 关联文件） |
| 坐标 | ICRS/J2000 |
| 许可 | 美国政府作品（data.gov 标注）；**补充亮星来自 FK6/Hipparcos/Tycho-2，需法务确认是否影响整体许可** |
| 再分发 | 候选可用；确认前不对外宣称 |
| 本站用途 | 商用方向候选；预处理成本高（分区二进制 + 亮星来源过滤） |

### 2.5 NASA SVS Deep Star Maps 2020（银河底图）

| 项 | 内容 |
| --- | --- |
| 官方来源 | NASA Scientific Visualization Studio：<https://svs.gsfc.nasa.gov/4851/> |
| 产品 | `milkyway_2020_*`（剔除亮星的银河背景）；`starmap_2020_*`（含亮星）；`starmap_2020_*_gal`（银道坐标） |
| 分辨率 | 4k/8k/16k/32k/64k EXR；另有 1024×512 JPG 预览 |
| 坐标 | 赤道版：plate carrée，中心 RA 0h，RA 向左增大；银道版：中心 l=0°，l 向左增大（官方说明） |
| 许可 | NASA SVS Help 明示“所有内容均为公有领域，除非另有说明”：<https://svs.gsfc.nasa.gov/help/>；NASA 媒体条款：<https://www.nasa.gov/nasa-brand-center/images-and-media/> |
| 署名 | 建议 “NASA/Goddard Space Flight Center Scientific Visualization Studio；Ernie Wright” |
| 再分发 | 允许（公有领域），建议署名 |
| 本站用途 | **推荐银河底图**：已剔除亮星，避免与前景恒星重复；坐标取向有官方文字说明 |

注意：该产品由 Gaia DR2 / Hipparcos / Tycho 等星表渲染而来。SVS 声明产物为公有领域，但上游星表的 NC 条款仍建议在来源文档中披露。

### 2.6 ESO/S. Brunier Milky Way panorama（备选）

| 项 | 内容 |
| --- | --- |
| 官方来源 | <https://www.eso.org/public/images/eso0932a/> |
| 规格 | 6000×3000，1800 万像素；800 亿像素原图需向作者申请 |
| 坐标 | 官方描述为 360° 全景、银道面水平；**精确中心与取向待核实**（需用参考星/银心验证） |
| 许可 | ESO 公共网站图片默认 **CC BY 4.0**：<https://www.eso.org/public/copyright/> |
| 署名 | “ESO/S. Brunier”；修改需说明 |
| 再分发 | 允许（含商用），需可见署名 |
| 本站用途 | 备选：视觉更“ photographic”，但坐标取向需额外验证 |

### 2.7 Gaia sky map（图像，备选）

| 项 | 内容 |
| --- | --- |
| 官方来源 | ESA Gaia sky map / EDR3 density map：<https://sci.esa.int/web/gaia/-/the-density-of-stars-from-gaia-s-early-data-release-3> |
| 许可 | **CC BY-SA 3.0 IGO**（ESA 页面明示） |
| 再分发 | 允许，但衍生作品需相同许可（share-alike）；不适合作为项目核心资产 |
| 本站用途 | 不建议；仅作对比参考 |

## 3. 存储与转换

| 数据集 | 本地存储 | 处理方式 | 发布包 |
| --- | --- | --- | --- |
| BSC5P | `tools/fixtures/star-raw/`（不入库） | 离线脚本筛选/量化 → `data/sky-stars-l1.js` | 是（生成文件） |
| Hipparcos-2 / Tycho-2 | `tools/fixtures/star-raw/`（不入库） | 离线截断 V ≤ 7.5 → `data/sky-stars-l2.js` | 是 |
| NASA SVS 银河 | `tools/fixtures/milkyway-raw/` | EXR/大图 → 2048×1024 JPEG，质量 78–85 | 是（`assets/`） |
| ESO 全景 | 同上 | 同上，另需坐标取向验证 | 备选 |

- 原始大文件不进 Git，不随 Pages 发布。
- 生成文件头部必须写 `source / version / license / generatedAt / count`。
- 数据更新方式：重新运行离线脚本；脚本输出哈希写入报告，便于审计。

## 4. 许可风险清单

| 风险 | 级别 | 处理 |
| --- | --- | --- |
| Hipparcos/Tycho/Gaia 为 NC，商用不可用 | 高 | T2-00 决策门；商用则 L2 换源或推迟 |
| BSC5 原始 ADC 条款不明确 | 中 | 编码前向 ADC/CDS 条款确认；未确认前不宣称可自由再分发 |
| NASA SVS 产物含上游 NC 数据 | 中 | 文档披露；署名 NASA/Goddard；如需商用法律意见 |
| ESO 图片取向未核实 | 中 | 参考点验证失败则改用 NASA SVS |
| 图片内联改变 standalone 体积/许可展示 | 中 | 构建任务 + 体积检查 + 来源面板展示署名 |

## 5. 署名与界面展示要求（编码时必须落实）

- “关于/数据来源”面板列出：BSC5P、Hipparcos-2/Tycho-2（如启用）、NASA SVS、ESA Gaia（如引用）。
- 星图图层控制或图例处显示“银河背景：NASA/Goddard SVS（公有领域）”。
- 恒星颜色说明：“由 B-V / 光谱型近似计算，非肉眼实景颜色”。
- 若使用 CC BY-NC 数据，界面与文档必须写明“非商业使用”。

## 6. 待核实清单

1. ADC/CDS 对 BSC5（V/50）的再分发条款。
2. 现有 132 条 `CAT.stars` 的逐星来源与版本。
3. ESO `eso0932a` 的精确坐标中心与取向。
4. 项目是否商用（决定 L2 是否可用）。
5. NASA SVS 产物在商用场景下的合规意见（建议保留法律审核）。
