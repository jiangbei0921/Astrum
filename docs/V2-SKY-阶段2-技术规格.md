# ASTRUM V2-SKY · 阶段 2 技术规格

- 基线：`main / 53f3403` + 阶段 1 工作区改动
- 状态：设计完成，等待批准后编码
- 关联：`V2-SKY-阶段2-专项审计.md`、`V2-SKY-阶段2-任务清单.md`、`V2-SKY-阶段2-数据来源与许可.md`

## 1. 总体决策

| 决策项 | 结论 |
| --- | --- |
| 是否扩充 `CAT.stars` | **否**。保持 132 条业务身份表不变 |
| 视觉星表 | 新建 `data/sky-stars-l1.js`（亮星）+ `data/sky-stars-l2.js`（深星，可选加载） |
| 亮度体系 | 统一使用 **V 星等**；L1 来自 BSC5P，L2 来自 Hipparcos-2 / Tycho-2 |
| 颜色体系 | 有 B-V 用 B-V；无 B-V 有光谱型用光谱型近似；两者都无则中性白并标记 `colorSource:'none'` |
| 银河背景 | 推荐**方案 C 混合**：NASA SVS 公有领域银河底图（低对比） + 同一底图离线采样的密度点场（调制），程序化版本作为最终降级 |
| 是否修改业务模块 | 否。`ask()/buildAnswer()/toSections()/Agent/Research/Evidence/Claims/Report` 均不动 |
| 是否修改 `core/astro.js` | 否。逆变换放在视图模型内，并做往返测试 |
| 是否修改 `core/solarsystem.js` | 否 |

## 2. 恒星数据方案

### 2.1 分层

| 层 | 内容 | 规模（设计目标） | 用途 |
| --- | --- | --- | --- |
| L0 | `CAT.stars` 132 条 | 132 | 搜索、详情、命中、星座连线、业务定位 |
| L1 | BSC5P（V ≤ 6.5） | ≈ 9,096 | 大视场星场主体 |
| L2 | Hipparcos-2（V ≤ 7.5）或 Tycho-2 子集 | ≈ 20,000–25,000 | 中/小视场加密 |

- L0 与 L1/L2 用 `HR / HIP / source_id` 做交叉匹配；L0 的 `k` 是唯一业务键，视觉层只引用 `l0Key`（可空）。
- 视觉星表**不写回** `CATALOG.stars`；`SkyVM` 在 `model()` 中合并读取。
- 额外恒星**不创建命中区**（`hit:false`），保持 `_hits` 语义与详情卡行为不变。

### 2.2 字段规范

每颗视觉恒星：

| 字段 | 单位 | 类型 | 可空 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | — | string | 否 | 数据源主键（`HR1234` / `HIP12345` / `Gaia DR3 123…`） |
| `src` | — | enum | 否 | `bsc5p` / `hip2` / `tycho2` |
| `ra` | 小时 | float | 否 | J2000.0 赤经 |
| `dec` | 度 | float | 否 | J2000.0 赤纬 |
| `vmag` | 星等 | float | 否 | V 波段视星等 |
| `bv` | 星等 | float | **是** | B-V 色指数；缺失为 `null` |
| `sp` | — | string | **是** | MK 光谱型；缺失为 `null` |
| `pmra` | mas/yr | float | 是 | 赤经方向自行（含 `cosδ` 约定需在生成脚本中统一） |
| `pmdec` | mas/yr | float | 是 | 赤纬方向自行 |
| `plx` | mas | float | 是 | 视差 |
| `l0Key` | — | string | 是 | 对应 `CAT.stars.k` |
| `epoch` | — | number | 否 | `2000.0` |

**禁止**：用 B-V 猜测光谱型、用光谱型猜测精确 B-V、用星等猜测距离。缺失字段一律 `null` 并在界面标注“数据缺失”。

### 2.3 文件格式

为避免 `file://` 下 `fetch()` 被 CORS 拦截，数据必须是 `<script>` 可加载的 JS：

```js
/* 自动生成，请勿手改 */
window.SKY_STARS_L1 = {
  meta: {
    source: 'BSC5P / HEASARC',
    version: 'V/50 (1991)',
    license: 'NASA/HEASARC；原始 BSC5 条款待确认',
    epoch: 2000.0,
    generatedAt: '2026-11-05',
    count: 9096,
    fields: ['ra','dec','vmag','bv','sp','pmra','pmdec','plx','l0Key']
  },
  data: '<base64 打包的量化数组>'
};
```

量化建议（生成脚本负责）：

- `ra`：uint32，单位 1e-5 h（0…240000）
- `dec`：int32，单位 1e-4 °（±900000）
- `vmag`：int16，单位 1e-2 等（−400…+2000）
- `bv`：int16，单位 1e-3（−400…+2000）；`-32768` 表示缺失
- `pmra/pmdec`：int16，mas/yr，饱和到 ±32767
- `plx`：int16，mas，饱和
- `sp`：uint8 索引 → 生成脚本内置的 32 项光谱型前缀表
- `l0Key`：uint16 索引 → L0 132 条的顺序表

估算（L1 9,096 颗）：约 18 B/颗 → 164 KB 原始，base64 约 219 KB。
L2 20,000 颗：约 360 KB 原始，base64 约 480 KB。均低于阶段 2 预算（新增 ≤ 800 KB）。

## 3. 恒星视觉映射

### 3.1 颜色（B-V → sRGB）

1. **B-V → 有效温度**（Ballesteros 2012 公式，NASA SVS 同款）：

```
T = 4600 * ( 1/(0.92*BV + 1.42) + 1/(0.92*BV + 0.18) )   [K]
```

`BV` 先夹到 `[-0.40, 2.00]`；超出范围说明数据异常，保留原值用于显示但颜色按边界处理。

2. **T → 色度**：离线用 Planck 黑体谱 + CIE 1931 2° 观察者 + sRGB 原色计算，生成 33 档查表（1000 K–40000 K，对数间隔），运行时线性插值。产物是常量表，不含第三方依赖。

3. **光谱型降级**（无 B-V 时）：

| 光谱前缀 | 近似 B-V 区间 | 用途 |
| --- | --- | --- |
| O / B | −0.33 … 0.00 | 蓝白 |
| A | −0.02 … 0.30 | 白 |
| F | 0.30 … 0.58 | 黄白 |
| G | 0.58 … 0.81 | 黄 |
| K | 0.81 … 1.40 | 橙 |
| M | 1.40 … 2.00 | 红 |

取区间中点作为 `bvApprox`，`colorSource:'spectral-approx'`；**不写回 `bv` 字段**。

4. 无 B-V 且无光谱型：`colorSource:'none'`，使用中性白 `rgb(226,234,248)`，与阶段 1 一致。

5. 重要声明（写进帮助/来源面板）：屏幕颜色是科学数据驱动的**近似视觉表现**，不等于肉眼颜色。

### 3.2 亮度（V 星等 → 尺寸/透明度）

以 Vega（V=0）为参考流量：

```
f(mag) = 10^(-0.4 * mag)
size   = clamp(0.70*k, 6.0*k, 3.5*k * f^(1/4))
alpha  = mag<=1 ? 1.00 : mag<=2 ? 0.92 : mag<=3 ? 0.78 : mag<=4 ? 0.62 : mag<=5 ? 0.48 : 0.34
```

- `f^(1/4)` 近似“面积换亮度”，避免线性映射导致暗星全部消失。
- `k` 沿用阶段 1 的视场缩放系数（`core/sky-viewmodel.js#L137-L183`）。
- `mag < 1.0` 的恒星额外绘制一层径向光晕（半径 ≤ 3.2×size，alpha ≤ 0.16），数量按亮度上限 ≤ 20 颗/帧。
- 低空衰减沿用 `alt<8 → 0.6+alt/16`，但上限 1.0。
- 颜色/透明度分桶：7 个颜色桶 × 5 个 alpha 桶 = 35 个 Path2D；尺寸逐星 `arc()`。
- 硬上限：每帧最多绘制 **12,000** 颗（按 `vmag` 升序截断），超出部分不进入 Path2D。

### 3.3 视场分级（LOD）

| 视场 `fov` | 星等极限 | 数据集 | 每帧上限 |
| --- | --- | --- | --- |
| ≥ 120° | V ≤ 6.0 | L1 | 8,000 |
| 60–120° | V ≤ 7.5 | L1 + L2 | 10,000 |
| 30–60° | V ≤ 9.0 | L1 + L2 | 12,000 |
| < 30° | V ≤ 11.0（若 L2 覆盖）；否则 V ≤ 7.5 | L2 优先 | 12,000 |

- 极限与上限为**设计初值**，编码阶段必须在同机浏览器实测后调整（验收要求记录调整依据）。
- 视场锥裁剪：`model()` 为每颗星预存 `ux=cos(alt)sin(az)`、`uy=cos(alt)cos(az)`、`uz=sin(alt)`；`build()` 先做 `dot(star, viewDir) >= cos(fov/2*1.02)` 的点积筛选，再调用 `proj()`。这样 20k 星的窄视场只投影约 3–5%。
- 星等筛选在锥裁剪之前执行，避免把暗星带入投影。

### 3.4 标签策略

- L0 恒星沿用当前 `mag<3.6 && alt>4`。
- L1/L2 恒星不显示名字（无中文名），只在 `detail` 模式下对 `vmag<1.5` 的 L1 星显示 `en`（若存在）。
- 星座名、DSO、行星标签逻辑不变。

## 4. 银河背景方案

### 4.1 推荐方案：C（真实底图 + 数据密度调制）

- **底图**：NASA SVS `Deep Star Maps 2020` 的 `milkyway_2020` 产品（已剔除亮星，避免与前景恒星重复），公有领域，见数据来源文档。
- **坐标系**：优先使用 **赤道坐标版**（plate carrée，中心 RA 0h，RA 向左增大）。映射：
  - `u = 0.5 - raHours/24`（对 1 取模）
  - `v = 0.5 - decDeg/180`（上边 +90°）
- **备选**：银河坐标版（中心 l=0°，l 向左增大）：`u = 0.5 - l/360`，`v = 0.5 - b/180`。
- **调制层**：同一底图离线采样为 12,000 个 `(ra, dec, intensity, size)` 点，运行时按恒星同一投影绘制，用来补足低分辨率底图的亮度层次；这些点**不是随机粒子**，每个点都来自底图像素。
- **视觉约束**：底图 `globalAlpha ≤ 0.55`，且整体亮度峰值不超过最暗恒星通道；不遮挡星座线与标签；不使用紫色霓虹。

### 4.2 屏幕反投影采样

对屏幕低分辨率栅格（默认 320×180，低端 160×90）逐格：

1. 归一化屏幕坐标：`dx=(x-cx)/Rmax`、`dy=(y-cy)/Rmax`，`rho=hypot(dx,dy)`；`rho>1` 跳过（天穹外）。
2. 角距 `ang = rho * halfFov`。
3. 方向：`v = fwd*cos(ang) + (right*dx - up*dy)/rho * sin(ang)`（屏幕 y 向下，故 `up` 取负）。
4. `alt = asin(v.z)`，`az = atan2(v.x, v.y)`。
5. `alt/az → ra/dec`（新增逆变换，见 4.3）。
6. `ra/dec → (u,v)` 采样底图（双线性）；写入离屏 `ImageData`。
7. 将离屏画布按 `Rmax*2` 尺寸 `drawImage` 放大绘制，边缘按圆裁剪。

**缓存键**：`jd`（按 60 s 取整）`|lat,lon`（4 位小数）`|yaw,pitch,fov`（各 0.5° 取整）`|W,H`（每档 64 px）`|textureVersion`。
缓存上限 2 张；关闭全屏星图或切换地点时释放最旧一张。

**拖动/缩放策略**：拖动中复用上一张栅格（星点仍实时重绘），停止 80–120 ms 后用 rAF 重建一次；缩放同理。这样银河始终跟手，又不会每帧做 5 万次三角运算。

### 4.3 逆变换（新增在 `sky-viewmodel.js`）

```
sinDec = sin(alt)sin(lat) + cos(alt)cos(lat)cos(az)
H      = atan2(-sin(az)cos(alt), sin(alt)cos(lat) - cos(alt)sin(lat)cos(az))
ra     = lstHours(jd, lon) - H/15      （小时，norm360）
```

验收：对 1,000 组随机 `(ra,dec)` 做 `altAz → 逆变换 → 原值 ≤ 1e-9`；另测已知参考点（见 §5）。
该函数只做坐标变换，不修改 `Astro.altAz`，也**不重新计算天体位置**。

### 4.4 参考点与容差

| 参考 | 预期（当前常数下计算值） | 容差 |
| --- | --- | --- |
| 银北极 `l=0,b=+90` | RA 12.85730h / Dec +27.12825° | 0.01° |
| 银南极 `l=0,b=−90` | RA 00.85730h / Dec −27.12825° | 0.01° |
| 银心方向 `l=0,b=0` | RA 17.76033h / Dec −28.9362° | 0.02° |
| 反银心 `l=180,b=0` | RA 05.76033h / Dec +28.9362° | 0.02° |
| `l=90,b=0` | RA 21.20029h / Dec +48.3296° | 0.02° |

说明：`l=0,b=0` 是 IAU 1958 银心**方向**，不等于 Sgr A*（相差约 0.07°）；测试断言必须写明。

### 4.5 降级链

1. 底图已加载且 `Canvas 2D` 可用 → 底图 + 密度点场。
2. 底图加载失败/超时（> 5 s）→ 只画密度点场。
3. 数据点场也缺失 → 保留阶段 1 的 3 条光带 + 程序化星场（代码不删）。
4. 低性能模式（画布高度 < 500 或用户开启“减少动态效果”）→ 160×90 栅格 + 关闭密度点场。

任何降级都必须保持坐标正确；只降低视觉密度，不改投影。

## 5. 模块与接口设计

### 5.1 新增文件

| 文件 | 职责 | 依赖 |
| --- | --- | --- |
| `data/sky-stars-l1.js` | 生成的 L1 视觉星表（只读） | 无 |
| `data/sky-stars-l2.js` | 生成的 L2 视觉星表（按需加载） | 无 |
| `core/sky-star-data.js` | 解码、字段标准化、索引、数据级别管理 | 上面两个数据文件 |
| `core/sky-background.js` | 银河底图加载、反投影栅格、缓存与释放 | `Astro`（只读）、`SkyVM`（逆变换） |
| `tools/build-star-data.js` | 离线生成脚本（读取本地原始星表 → 输出 JS） | 无运行时依赖 |
| `tools/build-milkyway-bg.js` | 离线把 SVS EXR/JPEG 转为项目底图 | 离线工具，不进发布包 |

不得让上述模块反向依赖 `app.js`，也不得声明新的全局可变状态（除 `window.SkyStarData` / `window.SkyBackground`）。

### 5.2 `SkyStarData` 接口

```js
{
  version: '1.0.0',
  meta(level) -> { source, version, license, epoch, count, fields },
  level(name) -> 'l1' | 'l2' | null,
  records(name) -> [Record],        // 已标准化，带 null 字段
  get(name, id) -> Record | null,
  matchL0(key) -> Record | null,
  loadL2() -> Promise<boolean>,     // 动态注入 data/sky-stars-l2.js
  stats() -> { l1: n, l2: n, missingBv: n, missingSp: n }
}
```

`Record` 字段见 §2.2；`records()` 返回的数据**只读**，调用方不得修改。

### 5.3 `SkyVM` 变更（保持旧签名）

```js
starVisual(mag, alt, k, extra?) -> { size, alpha, bucket }   // 前 3 参不变
colorForBV(bv) -> { r, g, b, source }
colorForSpectral(sp) -> { r, g, b, source } | null
altAzToEq(alt, az, jd, lat, lon) -> { ra, dec }
build(jd, lat, lon, opts) -> viewModel
```

`build()` 的 `vm.stars` 元素新增：

```js
{ key, cn, en, bayer, con, ra, dec, az, alt, mag, x, y,
  size, alpha, bucket, color:[r,g,b], colorSource:'bv'|'spectral-approx'|'none',
  level:'l0'|'l1'|'l2', hit:boolean, raw }
```

约束：

- L0 的 `hit:true`、`raw` 为原始 `CAT.stars` 元素；L1/L2 的 `hit:false`、`raw` 为标准化 Record。
- `vm.background` 新增 `{ texture, points, ready, source }`，由 `SkyBackground` 填充；不得把纹理对象塞进 `vm.stars`。
- `model()` 的缓存键新增数据版本：`...|stars:l1v1+l2v1`，防止热更新后拿到旧模型。

### 5.4 `SkyRender` 变更

```js
draw(canvas, p, vm) -> { hits, bodies, meta }   // 不变
```

内部：

- `starField()` 改为绘制 L1/L2 恒星（不再用随机星场）；随机星场仅在 `vm.background.source==='procedural'` 时作为降级。
- `stars()` 改为 35 桶 + 亮星光晕；只有 `hit:true` 的星进入 `_hits`。
- 新增 `milkyWayImage(g, vm)`：有缓存栅格则 `drawImage`，否则调用 `milkyWay()` 旧实现。
- 绘制顺序保持：背景 → 银河 → 恒星 → DSO → 星座线 → 天体 → 地平线 → 标签。

### 5.5 `SkyLayers`

不改键集合。语义补充：

- `stars:false` 同时关闭 L1/L2 恒星与降级随机星场。
- `milkyWay:false` 同时关闭底图与密度点场。
- 不新增 UI；保持阶段 1 默认全开。

### 5.6 `app.js` / `index.html`

- `app.js`：`drawSky()` 包装无需改；仅可加只读诊断 `__astrum.skyStarStats()`（可选）。
- `index.html`：在 `sky-viewmodel.js` 之前插入：
  - `data/sky-stars-l1.js`
  - `data/sky-stars-l2.js`（可延迟，见下）
  - `core/sky-star-data.js`
  - `core/sky-background.js`
- L2 若采用动态加载，则不在 `index.html` 中静态引入，改由 `SkyStarData.loadL2()` 注入 `<script>`；静态引入更简单但首屏多 ~480 KB，需实测决定。

## 6. 性能与资源

| 项 | 设计 |
| --- | --- |
| 数据加载 | L1 静态；L2 默认延迟到首次打开全屏星图或 `fov<60°` 时加载，失败则只用 L1 |
| 解析 | base64 → `Uint8Array` 一次；记录按需构造，避免全部对象化 |
| altAz | 只在 `(jd,lat,lon)` 变化时算；40k 约 8.35 ms（Node 实测），放 `requestIdleCallback` 或分片 |
| 每帧 | 星等筛选 → 锥裁剪 → 投影；窄视场只投影 3–5% |
| 绘制 | 35 个 Path2D + ≤20 颗亮星光晕；硬上限 12,000 |
| 银河栅格 | 320×180（低端 160×90），缓存 2 张，拖动复用 |
| 内存 | 记录 ≤ 30k；栅格 ≤ 2×320×180×4 ≈ 460 KB；关闭全屏时释放栅格 |
| 降级 | L2 失败→L1；底图失败→密度点；全部失败→阶段 1 程序化 |

阶段 2 验收基线必须重测：冷加载、数据解析、`model()`、`build()`、首帧、拖动 FPS、缩放 FPS、内存。阶段 1 数字只作参考，不作达标线。

## 7. 兼容性

必须保持不变：

- `drawSky(canvas, options)` 签名与默认值。
- `_hits/_bodies/_meta` 结构与语义；额外恒星不进入 `_hits`。
- L0 恒星的点击、详情、搜索、星座锚点。
- 小星图 / 全屏 / 答案内星图 / 预热 / 时间地点联动 / 缩放拖动。
- `file://`、`/Astrum/` 子路径、CSP、standalone、Pages 构建。
- 不新增第三方运行时依赖。

新增风险与对策见审计文档 §6；关键一条：`build-standalone.js` 必须扩展图片内联，否则单文件版银河缺图，任务清单 T2-12 单列。

## 8. 验收标准（设计级）

1. L1/L2 字段完整率、`id` 唯一性、`ra/dec` 合法性 100% 通过。
2. L0 132 颗坐标与阶段 1 完全一致（≤ 1e-9）。
3. 1,000 组随机坐标逆变换往返 ≤ 1e-9；参考点见 §4.4。
4. 30° 视场可见恒星 ≥ 300 颗（晴天、无月夜、上海纬度）；145° 视场 ≤ 12,000 颗绘制上限。
5. 颜色缺失时 `colorSource` 正确且无伪造 B-V。
6. 银河在银心/反银心/银北极/银南极方向与参考坐标对齐（≤ 0.02°）。
7. 图层开关对底图、密度点、L1/L2 均有效。
8. 底图缺失自动降级且无脚本错误。
9. `_hits` 只含 L0/DSO/天体；点击与详情回归通过。
10. 所有旧测试通过；新增测试覆盖 §9 全部条目。
