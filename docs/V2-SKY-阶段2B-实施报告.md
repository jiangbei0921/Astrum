# ASTRUM V2-SKY · 阶段 2B 实施报告（L1 真实亮星表）

- 文档版本：1.0.0
- 日期：2026-11-06
- 前置决策：`docs/V2-SKY-阶段2B-星表许可决策.md`（BSC5P 美国政府作品，L2 DEFERRED）
- 范围：**仅 L1**（9,096 颗），不做 L2，不改冻结视觉参数（F/G/ALPHA/纹理/光晕/B4.2）
- Git 写操作：**无**（未 add / commit / push / reset / checkout）

---

## 1. 结论

L1 真实亮星表已接入并通过全部离线与浏览器回归：**实现完成**。

- 星场数量：132 → **9,096**（可见部分随视场变化，145° 视场约 1,900–2,300 颗）
- L0 业务星表 `CAT.stars` 未变（仍 132 条），命中数量与条件不变；**L1 中 V≤5.0 的 1,630 颗带名称者可点击**
- 数据体积：`data/sky-stars-l1.js` **175 KB**（含名称表；预算 ≤250 KB）
- 性能：模型构建 +L1 约 **7–9 ms**，相机重建 **3 ms**，整帧绘制 **2.4 ms**（Node 单次，非浏览器帧率）

---

## 2. 数据来源与许可

| 项 | 值 |
|---|---|
| 数据集 | Bright Star Catalogue 5th Rev. Ed.（Hoffleit & Warren 1991），NASA HEASARC 修订版 |
| 下载 | `https://heasarc.gsfc.nasa.gov/FTP/heasarc/dbase/tdat_files/heasarc_bsc5p.tdat.gz` |
| 许可 | 美国政府作品（公有领域），`https://www.usa.gov/government-works` |
| 许可登记 | data.gov `ivo://nasa.heasarc/bsc5p`（publisher: NASA HEASARC，accessLevel: public） |
| 输入 SHA256 | 见生成文件 `meta.inputSha256` |
| 原始文件 | 未入库；构建时通过 `--input` 指向临时目录，仓库内只保留生成物 |

合规表述固定为：**「Bright Star Catalogue 5th Rev. Ed.，NASA HEASARC 修订版（美国政府作品，公有领域）」**，不得写成「Yale 授权」。

---

## 3. 数据格式

- 7 字节/星：`ra(2B) dec(2B) vmag(1B) bv(1B) cls(1B)`，整表 base64。
- 另附名称表 `meta.names`：`[记录索引, 拜耳/弗兰斯蒂德名, HR 名]`，只含 V≤5.0 且有名称的 **1,630** 条，用于命中与详情卡。
- 量化参数：
  - ra：`360/65536` ≈ 0.00549°（19.8″），误差 ≤ 0.00275°
  - dec：`180/65535` ≈ 0.00275°（9.9″），误差 ≤ 0.00137°
  - vmag：`-2.0 … 8.0`，步长 0.0392，误差 ≤ 0.0196
  - bv：`-0.5 … 5.8`，步长 0.0247，误差 ≤ 0.0124；`255` 表示缺失（310 颗）
  - cls：光谱型首字母代码（0=无），仅用于无 B-V 时的颜色兜底
- **位置为 J2000 几何位置，未施加自行**（HEASARC 的 pm 字段单位虽为 arcsec/yr，但 µα 的 cosδ 约定存在歧义，为避免引入科学错误本版不应用）。

---

## 4. 代码改动

### 4.1 新增

| 文件 | 作用 |
|---|---|
| `tools/build-star-data.js` | 离线构建：解析 HEASARC TDAT → 校验 → 量化 → 写 `data/sky-stars-l1.js`；支持 `--check` 只校验 |
| `data/sky-stars-l1.js` | 自动生成，84 KB，头部含来源/许可/生成时间/输入 SHA256 |
| `core/sky-star-data.js` | 解码与缓存：`load / records / count / meta / stats / clsLetter`；缺失时返回 null |
| `tools/v2-sky-2b-test.js` | 离线测试 26 条（N1–N10） |

### 4.2 修改

| 文件 | 改动 | 影响面 |
|---|---|---|
| `index.html` | 新增 2 个 `<script src>`（数据 + 适配模块），位于 `sky-layers.js` 之前 | 仅加载顺序；CSP `script-src 'self'` 无需改 |
| `core/sky-viewmodel.js` | `model()` 增加 L1 的 az/alt 预计算（Float32Array）；`build()` 增加 `vm.field`，只投影可见部分 | **不动 `vm.stars`**，不动命中，不动标签 |
| `core/sky-renderer.js` | 新增 `fieldStars()`：15 个 Path2D（5 亮度桶 × 3 色温组），绘制顺序插在 `starField` 之后、`starGlow` 之前 | 不产生 hit，不参与标签 |

### 4.3 关键隔离设计

- L1 全部走 `vm.field`，与 `vm.stars`（L0）**完全分离**；
- 命中区仍只由渲染器 `stars()` 内的条件 `alt>0 && size>1.9*k` 产生，且只遍历 L0；
- 标签只遍历 `vm.stars`，因此不会出现 9,096 个候选标签；
- `layers.stars === false` 时 `vm.field` 为空，行为与阶段 1 一致；
- 数据缺失（`SkyStarData` 未加载/解码失败）时 `m.l1 = null`，画面退化为阶段 1 表现，不报错。

---

## 5. 测试结果

| 套件 | 结果 | 说明 |
|---|---|---|
| `tools/v2-sky-2b-test.js`（新） | **31/31** | 数据元信息、解码完整性、天狼星量化误差、**投影小时口径（N3.4/N3.5）**、缺失降级、`vm.stars` 仍为 L0、L0 命中不变 + L1 命中可用、图层门控、绘制顺序、性能 |
| `tools/v2-sky-01-test.js` | **52/52** | 阶段 1 架构回归（未加载 L1 时行为不变） |
| `tools/v2-sky-2c-test.js` | **24/24** | 银河纹理与背景模块回归 |
| `tools/v2-sky-p0-p1-test.js` | **23/23** | P0 方位 / P1 亮度回归 |
| `tools/v2-sky-01-browser-test.js` | **21/21** | 真实 Chrome |
| `tools/v2-sky-2c-browser-test.js` | **20/20** | 含 **B4.2：on=18.7 / off=10.8（余量 7.9）**，较此前 6.2 更宽裕 |
| `tools/v2-sky-p0-p1-browser-test.js` | **15/15** | 含 V4.1 光晕、V5.1 暗星无光晕、V6.1 亮星核心 |
| `tools/selftest.js` | 通过，CSP 违规 **0** | 全项目自检 |
| `tools/v1-4-pages-test.js` | **32/32** | `LOCAL_HTTP_SUBPATH` |
| `tools/csptest.js` | **6/6** | 正常环境不误报 |
| `tools/build-standalone.js` | 成功，**2407 KB**，内联 65 脚本 | 单文件版已重建，含 L1 |

### 5.1 性能实测（Node 单次，仅供量级参考，不代表浏览器帧率）

```
model(含L1)=8ms  build=2.5ms  draw(含L1)=2.2ms  field=2311（fov145 / pitch32）
```

---

## 6. 已知限制（明确记录，不当作缺陷）

| 编号 | 限制 | 说明 |
|---|---|---|
| L-01 | 未施加自行 | 位置为 J2000；已核实 HEASARC `pmra` 为 **µα·cosδ**（天狼 −0.553″/yr、61 Cyg 4.136″/yr，与标准值一致）。**但 L0 `data/catalog.js` 不含自行字段**，若只对 L1 施加 25 年自行，同一颗亮星会在 L0 与 L1 中出现约 0.07° 的位置差（40° 视场约 3–4 px，肉眼可见双点）。因此结论是：**要么两侧同时施加，要么都不施加**；本轮选择都不施加，保持两侧一致的 J2000 几何位置。 |
| L-02 | 无 L2（V>6.5 只到 7.96） | 当前视场下限 40°，L1 已足够；需要更深时按决策文档 §3.2 走 UCAC4/APASS |
| L-03 | ~~L1 星不可点击~~ | **已改为可点击（V≤5.0）**：构建脚本额外输出 1,630 条名称表；渲染器只为带名称的亮星产生命中，其余数千颗仍只绘制。L0 132 条命中数量与条件完全不变 |
| L-04 | 标签仍只覆盖 L0 | 9,096 颗全标注会糊屏 |
| L-05 | 星等口径为 V 波段 | 未与 Gaia G 混用 |
| L-06 | 颜色为 B-V 近似 | 非肉眼实景颜色，需在关于面板说明 |

---

## 7. 未做 / 待办

1. **实机视觉确认**：真实观感（40° 视场下的密度、颜色、点击体验）需你在 Chrome 中刷新页面后观察。
2. **阶段 3A 实机验收**：`docs/V2-SKY-阶段3A-*` 的 A–G 矩阵仍需执行。

### 7.1 本轮额外修复的两个缺陷（由注入式浏览器验证发现）

| 编号 | 问题 | 修复 |
|---|---|---|
| F-1 | `data/sky-stars-l1.js` 的 RA 以**度**存储，而 `Astro.altAz(raH,…)` 收**小时**，直接传入导致 L1 星位置错约 15 倍 | `model()` 中 `l1d.ra / 15`；新增 N3.4 用天狼星冬季高度角复核（vm=39.99 vs 参考 39.99） |
| F-2 | 详情卡星等显示 Float32 原值（如 `-0.7058823704719543`） | 存入 `entry.mag` 时保留两位小数 |

---

## 8. 变更声明

| 项 | 状态 |
|---|---|
| 修改业务代码 | 是（`index.html` 加载顺序、`sky-viewmodel.js`、`sky-renderer.js`） |
| 新增业务模块 | 是（`core/sky-star-data.js`、`data/sky-stars-l1.js`） |
| 修改冻结视觉参数 | **否**（F/G/ALPHA/纹理/采样/光晕/B4.2 全部未动） |
| 修改 L0 星表与命中逻辑 | **否**（132 条与 `alt>0 && size>1.9*k` 原样） |
| 修改既有测试断言 | **否**（仅新增 2B 测试） |
| Git 写操作 | **无** |
| 构建产物 | `astrum-standalone.html` 已重建（gitignored） |
