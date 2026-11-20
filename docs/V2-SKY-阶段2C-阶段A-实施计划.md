# ASTRUM V2-SKY · 子阶段 2C 阶段 A：实施前计划

- 状态：仅审计与计划；**未下载资源、未修改业务代码、未执行 Git 写操作**
- 依据：2A 执行报告、阶段 2 技术规格、阶段 1 现有代码
- 结论：方案可行；推荐“NASA SVS 图像 → 离线打包 RGB565 纹理 → 运行时反投影采样”，不改 `build-standalone.js`

## 1. 当前银河背景实现分析（问题 1–5）

### 1.1 绘制函数与 pass

| 环节 | 位置 | 说明 |
| --- | --- | --- |
| 数据生成（银河带） | `core/sky-viewmodel.js#L65-L72` | 3 条 `b=0` 的银道折线，`l=0..360` 步长 2°，每条 181 点 |
| 数据生成（程序化星场） | `core/sky-viewmodel.js#L73-L87` | 2400 个随机点，银纬集中 ±11°，34% 扩散；`alt>=0.5` |
| 投影 | `core/sky-viewmodel.js#L204-L260` | `SkyVM.build` 把 az/alt 投到屏幕；银河保留 `null` 断点 |
| 银河绘制 | `core/sky-renderer.js#L50-L69` | 3 条 `lighter` 描边 |
| 星场绘制 | `core/sky-renderer.js#L73-L100` | 6 个亮度桶 Path2D |
| 渲染顺序 | `core/sky-renderer.js#L609-L634` | `skyBackground → milkyWay → starField → stars → deepSky → constellationLines → bodies → horizon → labels → globe` |
| 图层门控 | `core/sky-renderer.js#L621-L624` | `layers.milkyWay` 控制银河；`layers.stars` 同时控制星场与恒星 |

结论：当前银河在第 2 个 pass（天空底色之后、恒星之前）绘制，顺序正确，但内容为几何示意。

### 1.2 当前坐标系

- 银河带与星场都是 **银道坐标 (l,b)** → `galToEq()`（`sky-viewmodel.js#L42-L54`）→ `A.altAz(ra,dec,jd,lat,lon)` → `(az,alt)` → 投影。
- 因此银河随时间/地点正确变化，不是屏幕固定贴图。
- 图层关闭时确实停止绘制；银河/星场不产生任何 hit。

### 1.3 当前投影算法

`SkyVM.projector`（`sky-viewmodel.js#L137-L183`）：

- 等距鱼眼：视线夹角 `ang = acos(dot(v,fwd))`，半径 `rr = ang/halfFov * Rmax`。
- 默认 `Rmax = min(W,H)*0.49`，`fov` 限制在 30–178°，`pitch` 限制在 −6–78°。
- 不可见（`ang > halfFov*1.02`）返回 `null`。

### 1.4 屏幕 → 赤道坐标（问题 5）

当前**没有**逆变换；`core/astro.js` 只有 `altAz()`（`#L234-L242`）。

反投影链路：

```
屏幕 (x,y)
  → dx=(x-cx)/Rmax, dy=(cy-y)/Rmax, rho=hypot(dx,dy)
  → ang=rho*halfFov
  → v = fwd*cos(ang) + (right*dx - up*dy)/rho * sin(ang)
  → alt = asin(vz), az = atan2(vx, vy)
  → altAzToEq(alt, az, jd, lat, lon)
```

`altAzToEq` 数学（计划新增在 `sky-viewmodel.js`，不改 `astro.js`）：

```
sinDec = sin(alt)sin(lat) + cos(alt)cos(lat)cos(az)
H      = atan2(-sin(az)cos(alt), sin(alt)cos(lat) - cos(alt)sin(lat)cos(az))
ra     = lstHours(jd, lon) - H/DEG/15
```

边界处理：`dec` 夹到 ±90°；`ra` 对 24 取模；`rho≈0` 时取视线中心方向；`rho>1` 不采样。

### 1.5 NASA SVS 图像如何映射（问题 6）

已确认（NASA SVS 官方文字）：

- 赤道版 Plate Carrée：中心 RA 0h，RA 向左递增。
- 银道版：中心 l=0°，l 向左递增。
- 本阶段使用**赤道版**，避免多一次银道变换。

初始映射：

```
u = (0.5 - raHours/24) mod 1
v = 0.5 - decDeg/180
```

**待验证**：像素中心约定（0.5 像素偏移）、图像上下边界是否为 ±90°、是否存在留白。阶段 B 下载后用参考点亮度与元数据核对，不凭宽高猜测。

## 2. NASA SVS 资源核查结果（问题 6、问题 9）

| 项 | 结果 | 状态 |
| --- | --- | --- |
| 官方页面 | <https://svs.gsfc.nasa.gov/4851/>（Deep Star Maps 2020） | 已确认 |
| 目标产品 | `milkyway_2020_4k_print.jpg`（1024×512，69.6 KB）；同组另有 4k/8k/16k EXR | 已确认（页面列出） |
| 产品含义 | “Milky Way background in celestial coordinates… omits the bright (Hipparcos and Tycho) stars” | 已确认 |
| 投影 | Plate Carrée；中心 RA 0h；RA 向左递增 | 已确认 |
| 许可 | SVS Help：内容公有领域（除非注明例外）；可自由下载、使用、再分发 | 已确认 |
| 署名 | 建议 “NASA/Goddard Space Flight Center Scientific Visualization Studio；Ernie Wright” | 已确认 |
| 原始文件未下载 | 阶段 A 不下载；阶段 B 仅取官方 print JPEG | 待执行 |
| 图像边界/像素中心 | 需下载后用参考点采样验证 | 待验证 |

体积结论：使用 1024×512 print JPEG 作为源，无需 EXR 解码，避免 HDR tone-mapping 风险。

## 3. 资源下载与预处理方案

### 3.1 为什么不直接把 JPEG 作为运行时图片

`file://` 下 Chrome 将本地图片视为跨源，`drawImage` 后调用 `getImageData` 可能抛出 `SecurityError`（canvas 被污染）。星图必须逐像素反投影采样，因此运行时依赖 Image + 像素读回不可靠。

### 3.2 推荐流程（离线打包纹理）

```
NASA SVS print JPEG（官方，1024×512）
  → tools/build-milkyway-bg.js
  → 解码、缩放到 512×256、RGB565、base64
  → data/milkyway-bg.js（window.MILKYWAY_BG = {meta, data}）
```

- 运行时**不使用 Image**，直接 base64 → `Uint8Array` → RGB565 解码，无异步、无 canvas 污染、无 CSP 图片权限依赖。
- standalone 自动随脚本内联，**无需修改 `tools/build-standalone.js`**。
- 原始 JPEG 保存在 `tools/fixtures/milkyway-raw/`（不入发布包）；发布包只含 `data/milkyway-bg.js` + `assets/sky/milkyway/metadata.json`。

### 3.3 离线解码工具

不新增运行时依赖；预处理脚本可用现有 Chrome headless（项目测试已依赖）把 JPEG 作为 data URI 载入临时页面，`canvas.getImageData` 导出像素，再写 JS。也可用本机 Python/Pillow（若已安装）。阶段 B 先检查可用工具，优先零新增依赖方案。

### 3.4 预处理参数（初值，阶段 B 以实测调整）

| 参数 | 初值 | 说明 |
| --- | --- | --- |
| 输出尺寸 | 512×256 | 背景低频，足够；比 1024×512 省内存与采样成本 |
| 格式 | RGB565 | 2 B/px；512×256=262 KB → base64 ≈ 341 KB |
| 亮度 | 保留原图，不额外提亮 | 运行时再乘全局 alpha（≤0.55） |
| 对比度 | 不调整 | 避免破坏尘埃带 |
| 裁剪 | 不裁剪（待验证边界） | 若发现留白，阶段 B 记录后再裁 |
| 色带 | 不做锐化 | 防止 JPEG 伪影被放大 |

备选：若 341 KB 超预算，降至 256×128（≈87 KB base64）。

## 4. 坐标映射方案（问题 4–6）

### 4.1 两级采样（关键设计）

直接对每帧屏幕像素做“反鱼眼 + 赤道逆变换 + 双线性”实测约 **40 ms**（320×180，Node），太慢。改为两级：

1. **天空纹理（alt/az）**：`256×128`，按 `(jd 分钟桶, lat/lon 4 位)` 构建；每格用 `altAzToEq` 反查 NASA 纹理。实测约 **10.9 ms**（Node），只在时间/地点变化时重建。
2. **屏幕栅格**：`240×135`（低端 160×90），按相机 `(yaw,pitch,fov,W,H)` 构建；每格只做反鱼眼 → alt/az → 查天空纹理。实测约 **4.0 ms**（240×135）/ **2.6 ms**（160×90）。
3. 栅格写入离屏 canvas，按 `Rmax*2` 放大绘制，圆形裁剪。

拖动/缩放：相机变化即重建屏幕栅格；若帧预算不足，降为 160×90 或隔帧重建；天空纹理复用。

### 4.2 参考点验证（必须做）

| 参考 | 输入 | 预期 UV（赤道版） | 验证 |
| --- | --- | --- | --- |
| 银北极 l=0,b=90 | RA 12.85730h / Dec +27.12825° | u=0.9643, v=0.3493 | 该处应暗 |
| 银南极 l=0,b=-90 | RA 00.85730h / Dec −27.12825° | u=0.0357, v=0.6507 | 该处应暗 |
| 银心方向 l=0,b=0 | RA 17.76033h / Dec −28.9362° | u=0.7600, v=0.6608 | 亮度显著高于反银心 |
| 反银心 l=180,b=0 | RA 05.76033h / Dec +28.9362° | u=0.2600, v=0.3392 | 较暗 |

补充：`altAzToEq` 与 `A.altAz` 做 1000 组随机往返，误差 ≤1e-9；RA 0/24 环绕单测。

说明：银心方向 ≠ Sgr A*（差约 0.07°），测试文案必须写明。

## 5. 模块设计（问题 7）

### 5.1 新增 `core/sky-background.js`

职责：

- 解码 `window.MILKYWAY_BG`（一次性，同步）；
- 构建 alt/az 天空纹理（按时间/地点缓存 1 份）；
- 构建屏幕栅格（按相机参数缓存 1 份）；
- 提供 `draw(g, vm)` → `boolean`；
- `ready()`、`stats()`、`dispose()`、`__setMode()`（仅供测试的强制失败钩子）。

不依赖 `app.js`，不读写恒星/行星数据，不创建 hit。

接口草案：

```js
SkyBackground = {
  version: '1.0.0',
  ready(): boolean,
  load(): boolean,                 // 幂等；模块加载时已调用
  draw(g, vm): boolean,            // 成功绘制返回 true，否则 false（调用方回退）
  invalidate(): void,              // 时间/地点变化时由 renderer 调用
  stats(): { ready, textureSize, skyTexBuildMs, rasterBuildMs, rasterSize, lastError },
  dispose(): void,
  __setMode(mode)                  // 'auto' | 'missing' | 'corrupt'，测试用
}
```

### 5.2 其他模块变更

| 文件 | 修改 | 目的 |
| --- | --- | --- |
| `core/sky-viewmodel.js` | 新增 `altAzToEq(alt,az,jd,lat,lon)` 并导出 | 银河反投影；不改 `astro.js` |
| `core/sky-renderer.js` | `milkyWay()` 保留为 fallback；新增 `milkyWayLayer()` 调 `SkyBackground.draw` | 真实背景 + 降级 |
| `core/sky-renderer.js` | 合成星场仅在没有真实背景时绘制 | 避免与真实银河重复 |
| `index.html` | `data/milkyway-bg.js` + `core/sky-background.js` 插到 viewmodel 之后、renderer 之前 | 加载顺序 |
| `core/sky-layers.js` | **不修改** | 复用现有 `milkyWay` 键，默认 true |
| `tools/build-standalone.js` | **不修改**（推荐方案） | 纹理已随 JS 内联 |
| `core/app.js` | **不修改** | 继续调用 `drawSky` |
| `core/astro.js` / `core/solarsystem.js` / `data/catalog.js` | **不修改** | 边界 |

### 5.3 渲染顺序

保持现有顺序，仅把第 2 段替换：

```
天空底色
→ 银河背景（SkyBackground.draw 或旧 milkyWay + 星场 fallback）
→ 恒星
→ DSO
→ 星座线
→ 天体
→ 地平线
→ 标签
→ 地球小窗
```

旧代码中星场在恒星之前；新方案在真实背景模式下跳过星场，fallback 模式下保留。

### 5.4 图层

- 复用 `SkyLayers.milkyWay`，不新增 ID，不改持久化。
- `milkyWay:false` 时**不调用** `SkyBackground.draw`，不重建缓存。
- `stars:false` 仍关闭恒星；fallback 星场归入银河层（行为差异见 §9）。

### 5.5 降级

| 条件 | 行为 |
| --- | --- |
| `window.MILKYWAY_BG` 缺失/解码失败 | `draw` 返回 false → 旧 `milkyWay()` + 星场 |
| 纹理尺寸异常 | 同上，`stats().lastError` 记录 |
| `Canvas` 创建失败 | 同上，不抛出 |
| 图层关闭 | 完全不绘制、不采样 |
| 首次构建尚未完成 | 本帧 fallback，下一帧重试 |

## 6. 需要修改的文件清单（问题 8、问题 9）

### 新增

| 文件 | 说明 |
| --- | --- |
| `core/sky-background.js` | 背景模块 |
| `data/milkyway-bg.js` | 生成纹理（512×256 RGB565 base64，≈341 KB） |
| `assets/sky/milkyway/metadata.json` | 来源、许可、尺寸、哈希、处理参数 |
| `tools/build-milkyway-bg.js` | 离线预处理 |
| `tools/v2-sky-2c-test.js` | 离线测试 |
| `tools/v2-sky-2c-browser-test.js` | 浏览器测试 |
| `docs/V2-SKY-阶段2C-交付报告.md` | 阶段 B 完成后生成 |

### 修改

| 文件 | 关键修改 |
| --- | --- |
| `core/sky-viewmodel.js` | 新增 `altAzToEq` 并导出；其余不动 |
| `core/sky-renderer.js` | 背景层接入 + fallback + 星场条件 |
| `index.html` | +2 个脚本引用 |

### 不需要修改

`core/app.js`、`core/astro.js`、`core/solarsystem.js`、`core/sky-layers.js`、`data/catalog.js`、`tools/build-standalone.js`、`tools/build-pages.js`、CSP、CI 配置。

体积：`data/milkyway-bg.js` ≈ 341 KB → standalone 约 1956 KB → **≈ 2.3 MB**，低于 4 MB 预算；Pages 发布包同样 +341 KB。

## 7. standalone 资源处理方案

- 纹理以 JS 数据文件存在，`build-standalone.js` 的现有脚本内联逻辑自动包含它（`#L61-L76`），无需改构建脚本。
- CSP：不新增图片权限；`script-src` 会因内联脚本文本变化自动重算 hash（`#L79-L96`）。
- `file://`：脚本同源加载，无 canvas 污染。
- 若未来改用图片资产，再评估 Data URL 内联；当前不作为主方案。

## 8. 测试方案

### 8.1 离线 `tools/v2-sky-2c-test.js`

| 组 | 断言 |
| --- | --- |
| R1 资源 | `data/milkyway-bg.js` 存在；`meta` 字段完整；尺寸 512×256；哈希可复算 |
| R2 坐标 | 4 组参考点 UV；GC 亮度 > 反银心；NGP/NGS 低亮度 |
| R3 逆变换 | 1000 组 `A.altAz → altAzToEq` 往返 ≤1e-9；RA 0/24 环绕；极区 |
| R4 降级 | `__setMode('missing'/'corrupt')` 时 `draw` 返回 false 且无异常 |
| R5 命中 | 背景不产生 hit；`_hits` 数量与阶段 1 相同（同时间/地点/相机） |
| R6 图层 | `milkyWay:false` 时 `draw` 未被调用（用计数器） |

### 8.2 浏览器 `tools/v2-sky-2c-browser-test.js`

- `file://` 打开：小星图/全屏/答案星图无错误；`_hits` 结构不变。
- 背景可见：在银心方向采样画布亮度高于反银心（阈值容差需实测）。
- 图层开关：关闭后该区域亮度回到天空底色，其他图层不受影响。
- fallback：测试钩子强制 missing，页面无未捕获异常。
- 时间/地点改变后背景位置变化（比较两次绘制像素）。
- 缩放/拖动无闪烁、无重复绘制。
- standalone 与 `/Astrum/` 子路径各跑一次。

### 8.3 回归

全部旧测试保留；新增测试加入 CI 清单（需批准修改 `.github/workflows/test.yml`？阶段 B 若不允许改 CI，则先本地执行并记录，不伪造 CI 结果）。

## 9. 性能风险（实测估算）

| 场景 | 实测/估算 | 说明 |
| --- | --- | --- |
| 旧背景绘制 | 未单独测；3 条 stroke + 6 桶 fill | 阶段 B 记录基线 |
| 直接单级反投影 320×180 | **42.5 ms** | 不可用 |
| 两级：天空纹理 256×128 | **10.9 ms** | 仅时间/地点变化 |
| 两级：屏幕栅格 240×135 | **4.0 ms** | 每相机变化 |
| 两级：屏幕栅格 160×90 | **2.6 ms** | 低端 |
| 纹理解码 | 约 1–2 ms（341 KB base64） | 仅首次 |
| 内存 | 纹理 RGB888 393 KB + alt/az 98 KB + 栅格 130 KB + base64 341 KB | 峰值 <1 MB |

风险：时间连续变化时每 60 s 桶重建 10.9 ms，可能造成拖动时间滑块卡顿；计划在时间变化后 150 ms 去抖，并记录 p95。

## 10. 许可与兼容性风险

| 风险 | 等级 | 处理 |
| --- | --- | --- |
| 图像取向/边界判断错误 | 中 | 参考点验证；失败则不启用 |
| file:// canvas 污染 | 高 | 采用打包纹理，不用 Image 读回 |
| 纹理过大 | 低 | 512×256 341 KB；超预算降 256×128 |
| 背景压过恒星 | 中 | 全局 alpha ≤0.55，阶段 B 截图调参 |
| 时间变化卡顿 | 中 | 去抖 + p95 测量 |
| 旧测试按图层语义断言 | 中 | 星场从 `stars` 移到 `milkyWay` fallback，需核对 L7 但不弱化 |
| 许可署名遗漏 | 中 | metadata + 关于页/图例署名 NASA/Goddard |
| 未批准修改 CI | 低 | 先本地执行，报告中标注未入 CI |

## 11. 预计实施顺序（阶段 B）

1. 下载官方 print JPEG，校验尺寸/哈希/许可记录。
2. `tools/build-milkyway-bg.js`：解码 → 512×256 → RGB565 → `data/milkyway-bg.js` + metadata。
3. `core/sky-viewmodel.js`：新增 `altAzToEq` + 单测。
4. `core/sky-background.js`：解码、天空纹理、屏幕栅格、缓存、降级钩子。
5. `core/sky-renderer.js`：接入背景 + fallback + 星场条件。
6. `index.html`：脚本顺序。
7. `tools/v2-sky-2c-test.js` → 通过。
8. `tools/v2-sky-2c-browser-test.js` → 通过。
9. 全量旧测试 + standalone/Pages/file:// 验证。
10. 性能测量（p50/p95）与交付报告。

## 12. 状态标记汇总

| 项 | 状态 |
| --- | --- |
| 当前背景实现与坐标链 | **已确认** |
| 投影与反投影数学 | **已确认**（逆变换待实现） |
| NASA SVS 许可/产品/投影说明 | **已确认** |
| 图像像素中心与边界 | **待验证** |
| 反投影两级采样性能 | **已实测估算**（Node） |
| 浏览器实际性能 | **待验证** |
| file:// canvas 污染风险 | **存在风险**（已用打包纹理规避） |
| 是否需要新模块 | **已确认：是** |
| 是否需要改 build-standalone | **不需要修改（推荐方案）** |
| 是否需要改 SkyLayers | **不需要修改** |
| 是否需要改 app/astro/solarsystem | **不需要修改** |
| standalone 体积影响 | **已估算：+≈341 KB** |
| 测试方案 | **已设计** |
| 正式资源下载/编码 | **待批准** |

**阶段 A 计划完成，未修改任何业务代码、未下载资源、未执行 Git 写操作。等待用户批准后进入阶段 B。**
