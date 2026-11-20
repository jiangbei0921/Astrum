# ASTRUM V2-SKY · 阶段 1 规格（星图视图模型与渲染架构拆分）

- 基线：`main / 53f3403`
- 仓库：`D:\Projects\Astrum`
- 本规格只覆盖阶段 1；不进入阶段 2–6。
- 状态：待用户批准后执行。

## 1. 基线核验结果（与阶段 0 报告的差异）

| 项 | 当前事实 | 与阶段 0 报告 |
| --- | --- | --- |
| 分支 / HEAD | `main` / `53f3403d6e26e8947e330a58f923d07e9607b4d3` | 一致 |
| 工作区 | 存在 2 处用户既有修改：`docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json` | 报告未记录；本阶段不触碰 |
| `skyModel()` | [app.js](../../core/app.js) L851-L925，`SKY_CACHE` 单条缓存 | 一致 |
| `drawSky()` | [app.js](../../core/app.js) L940-L1452 | 一致 |
| 调用点 | L1653 观测台小星图、L3144 答案内星图、L3437 预热、L5024/L5030 全屏星图 | 一致 |
| 命中消费 | L5288 深链定位、L5306 点击命中 | 一致 |
| 命中/天体写回 | L1448-L1450 写 `_hits/_bodies/_meta` | 一致 |
| 星表 | `CAT.stars` 132、`CAT.dso` 54、`CAT.constellations` 22；无 B-V / 光谱 / 自行字段 | 一致；视图模型必须允许字段缺省 |
| 太阳系导出 | [solarsystem.js](../../core/solarsystem.js) L1224-L1233 只导出交互接口，**不导出** `renderSphereSprite` / `drawSphereDetail` / `drawRings` / `buildTexture` | 报告未明确指出，本阶段记录为差异 |
| 太阳系复用风险 | `drawRings` 依赖模块级 `canvas`（L621）、`st.phase`（L607）、`basis/bpos` 三维相机参数 | 本阶段不改 `solarsystem.js`，原因见 §7 |

## 2. 模块依赖图（无环）

```
data/catalog.js   data/bodies.js   core/astro.js
        \              |              /
         \             |             /   只读全局：CATALOG / BODY_INFO / Astro
          ▼            ▼            ▼
   core/sky-layers.js       （零依赖，纯状态）
          ▲
          │ 读取图层开关
   core/sky-viewmodel.js    （依赖 Astro + CATALOG；独占 SKY_CACHE）
          ▲
          │ 视图模型
   core/sky-renderer.js     （依赖 SkyVM + SkyLayers + BODY_INFO + CATALOG(星座名)）
          ▲                     └─可选─▶ core/planet-visuals.js（依赖 SolarView，缺失时降级）
          │ 兼容入口
   core/app.js              （drawSky 包装、交互、命中消费、PERF）
```

- 依赖方向单向：`layers → viewmodel → renderer → app`。
- `planet-visuals` 不依赖 viewmodel/renderer/app，只被 renderer 查询能力，不反向依赖。
- 加载顺序（`index.html`）：`data/*` → `core/astro.js` → `core/solarsystem.js` → `sky-layers.js` → `sky-viewmodel.js` → `planet-visuals.js` → `sky-renderer.js` → `app.js`。

## 3. 接口契约

### 3.1 `core/sky-layers.js` → `window.SkyLayers`

```js
{
  DEFAULTS: { stars:true, constellations:true, milkyWay:true,
              deepSkyObjects:true, planets:true, horizon:true, labels:true },
  ORDER: ['milkyWay','stars','deepSkyObjects','constellations','planets','horizon','labels'],
  create(initial?) -> {
    all() -> {…7 个布尔值…},        // 返回副本，调用方不可改内部状态
    isOn(key) -> boolean,
    set(key, on) -> boolean,       // 未知 key 返回 false，不改状态
    toggle(key) -> boolean,
    reset() -> void,
    onChange(fn) -> function 取消订阅
  },
  normalize(state?) -> 完整 7 键对象
}
```
- 不持久化、不做 UI、不接触 `CATALOG` / `Astro`。
- 默认全开，保证旧星图外观零变化。

### 3.2 `core/sky-viewmodel.js` → `window.SkyVM`

```js
{
  version: '1.0.0',
  model(jd, lat, lon)                 // 旧 skyModel 的等价实现，带单条缓存
  projector({width,height,yaw,pitch,fov}) -> { proj(az,alt)->{x,y,z,ang}|null,
                                                geom:{W,H,cx,cy,Rmax,k,yaw,pitch,fov,halfFov} }
  build(jd, lat, lon, opts) -> viewModel
  starVisual(mag, alt, k) -> { size, alpha, bucket }
  bodyVisual(info, kind, k) -> { r }
  cache() -> { key, model }           // 只读诊断
  clear() -> void                     // 测试用
  starByKey(k) -> 原始星表对象 | undefined
  galToEq(l, b) -> { ra, dec }        // 纯坐标变换，原样迁移
}
```

`opts`：`{ width, height, yaw, pitch, fov, compact, detail, style, interactive, layers, phase, highlight }`。

`viewModel` 结构：

```js
{
  meta: { jd, lat, lon, built, key },
  view: { w, h, cx, cy, rmax, k, yaw, pitch, fov, detail, style, compact, showLabels },
  layers: { …7 键… },
  counts: { stars, dso, constellations, dust },
  milky: [{ index, width, points:[{x,y}] }],          // 3 条，宽度 9/5/2.2
  dust: { total, points:[{x,y,r,alpha}] },
  stars: [{ key,cn,en,bayer,con,ra,dec,az,alt,mag,
            x,y,size,alpha,bucket }],
  dso:   [{ id,cn,en,ra,dec,az,alt,mag,type,x,y,r }],
  constellations: [{ key,cn,abbr, segs:[{ax,ay,bx,by}] }],
  bodies: [{ kind,key,name,info,ra,dec,az,alt,mag,phase?,x,y,r,below }],
  sun:  { x, y, visible, az, alt },
  moon: { x, y, visible, az, alt, ra, dec, phase },
  highlight: { x, y, visible, label } | null,
  horizon: { points:[{x,y}], hMin, visible }
}
```
约束：
- 所有 alt/az 只取自 `SkyVM.model()`，`build()` 内**不调用** `A.altAz`（`highlight` 例外，沿用旧代码一次 `A.altAz`）。
- `bodies` 的字段与旧 `drawSky` 组装的 `list` 完全一致（含 `info`、`phase`）。
- 不修改 `CATALOG` 中任何对象；视图对象全部新建。
- 缺 B-V / 光谱时**不生成** `bv`、`spectral` 字段。

### 3.3 `core/sky-renderer.js` → `window.SkyRender`

```js
{
  version: '1.0.0',
  draw(canvas, p, viewModel) -> { hits:[{x,y,r,obj:{type,data}}],
                                  bodies:[旧 drawn 结构],
                                  meta:{yaw,pitch,fov,hz,hit:true} }
}
```
内部绘制函数（按调用顺序）：
`skyBackground` → `milkyWay` → `starField` → `stars` → `deepSky` → `constellationLines` → `bodies` → `horizonAndGround` → `directionLabels` → `labels` → `globe`。
- 每个函数接收 `(g, vm, ctx)`；`ctx` 为本次绘制的几何/开关快照，不含天文计算。
- `hits` 由 renderer 独占创建，结构与阈值逐字保留：星 `max(9k,size+5k)`、DSO `11k`、天体 `max(r*1.35,14k)`。
- `bodies` 元素保留 `pt/r/alt/az/below/info/name/kind/key/ra/dec/mag`。
- 不新增全局画布缓存；Path2D 仍按帧创建（与旧行为一致）。
- 每个绘制段内部 `save()/restore()` 配对，异常路径不泄漏 Canvas 状态。

### 3.4 `core/planet-visuals.js` → `window.PlanetVisuals`

```js
{
  version: '1.0.0',
  capabilities() ->  { detailedSphere:boolean, rings:boolean, textures:boolean,
                       source:'solarview-primitives'|'none', reasons:[string] },
  texture(key) -> { w, h, data } | null,
  sphere(g, opts) -> boolean,     // opts:{key,cx,cy,r,lightDir,camera,basis,phase}
  rings(g, opts, front) -> boolean,
  summary() -> 可序列化诊断对象
}
```
- 只通过 `window.SolarView.primitives` 调用；不存在时全部返回 `false` / `null`。
- 本阶段不改变星图行星现有绘制；renderer 的 `bodies` 段继续使用旧 2D 球体画法。
- `solarsystem.js` 本阶段不修改。

## 4. 旧接口兼容方案

`app.js` 保留：

```js
function skyModel(jd, lat, lon) { return window.SkyVM.model(jd, lat, lon); }

function drawSky(canvas, p) {
  var t0 = performance.now();
  var vm = window.SkyVM.build(p.jd, p.lat, p.lon, {
    width: canvas.width, height: canvas.height,
    yaw: p.yaw, pitch: p.pitch, fov: p.fov,
    compact: p.compact, detail: p.detail, style: p.style,
    interactive: p.interactive, phase: p.phase, highlight: p.highlight,
    layers: p.layers || skyLayers.all()
  });
  var out = window.SkyRender.draw(canvas, p, vm);
  canvas._hits = out.hits;
  canvas._bodies = out.bodies;
  canvas._meta = out.meta;
  perfPush('sky', performance.now() - t0);
}
```

- 所有旧调用方（L1653 / L3144 / L5024 / L5030）**零改动**。
- `p` 的字段语义、默认值（yaw 180 / pitch 12 / fov 145 / Rmax 0.49）保持不变。
- `_hits` / `_bodies` / `_meta` 键集合与语义不变，不新增字段。
- `PERF.sky` 仍由 `app.js` 统计；诊断接口 `__astrum.perf().model` 改读 `SkyVM.cache()`。
- `__astrum` 新增只读诊断入口 `skyLayers()`、`skyModules()`，供测试使用，不影响旧调用。

## 5. 缓存归属

| 缓存 | 归属 | 键 | 释放 |
| --- | --- | --- | --- |
| 星图 alt/az 模型 | `SkyVM`（单条） | `jd.toFixed(5)|lat.toFixed(4)|lon.toFixed(4)` | 新键覆盖旧值；`clear()` 供测试 |
| Path2D 星点路径 | 每帧局部（不变） | — | 帧结束由 GC 回收 |
| 行星精灵 / 纹理 | `solarsystem.js`（不变） | 天体+尺寸档+相位桶+相机桶 | 上限 12，LRU 式删除（不变） |
| 视图模型 | 每次 `build` 新建 | — | 调用返回后不再持有 |

不新增第二份星表缓存，不新增画布缓存，不引入释放缺口。

## 6. 命中测试兼容方案

- 命中区唯一生产者：`SkyRender.draw`。
- `app.js` 只做写入与消费，消费点 L5288 / L5306 / `describeObject()` 不改。
- `obj.data` 形状：恒星为原始 `CAT.stars` 元素；DSO 为原始 `CAT.dso` 元素；天体为 `bodies` 元素（含 `info`）。
- 回归断言：
  - `_hits.length === 恒星命中数 + DSO 命中数 + bodies 数`；
  - 每个 hit 满足 `x/y/r` 为有限数、`r>0`、`obj.type` 属于 `star|dso|planet|moon|sun`；
  - 土星在 `_bodies` 中存在且 `hit.obj.data.name === '土星'`；
  - `_meta` 键集合恰为 `{yaw,pitch,fov,hz,hit}`。

## 7. 行星视觉复用结论（planet-visuals）

现有函数**不能安全独立复用**，原因：

1. 未导出：四个函数都在 IIFE 内部，`SolarView` 只暴露交互接口。
2. 隐式模块状态：`drawRings` 读模块级 `canvas.width/height`、`st.phase[b.key]`；在星图调用时 `canvas` 可能为 `null`。
3. 三维相机参数：`drawSphereDetail` / `drawRings` 需要 `bpos`（太阳系场景坐标）、`basis`（`pos/fwd/right/up/fov`）与 `lightDir`（三维向量）；星图只有二维投影坐标，强行套用会改变现有外观。

本阶段处理：
- 新建 `planet-visuals.js`，固化上述签名与能力探测；当前 `capabilities().source === 'none'`，`sphere/rings` 返回 `false`。
- `solarsystem.js` 不做任何修改。
- 阶段 5 的最小调整方案（需另行批准）：
  1. 在 `SolarView` 中增补 `primitives` 只读导出；
  2. `drawRings(g,b,bpos,cx,cy,R,basis,front,W,H)` 显式接收画布尺寸，去掉模块级 `canvas` 依赖；
  3. 由 `planet-visuals` 构造最小虚拟 `basis`（`pos/fwd/right/up`）与 `lightDir`，再接入星图。

## 8. 文件改动清单（预计）

新增：
- `core/sky-layers.js`
- `core/sky-viewmodel.js`
- `core/sky-renderer.js`
- `core/planet-visuals.js`
- `tools/v2-sky-01-test.js`
- `tools/v2-sky-01-browser-test.js`
- `docs/V2-SKY-阶段1-交付报告.md`（实现完成后生成）

修改：
- `core/app.js`：删除 `SKY_CACHE/skyModel/drawSky` 旧实现与仅被它们使用的 `starByKey/galToEq/hexRGB/mixColor/hexA/miniMoon/drawGlobe`；替换为兼容包装；诊断改读 `SkyVM.cache()`；`__astrum` 增加只读诊断入口。
- `index.html`：在 `core/app.js` 之前插入 4 个脚本。
- `tools/build-pages.js`：无需改（`core/` 全目录复制，引用白名单已覆盖）。

不改：`core/solarsystem.js`、`data/*`、`core/astro.js`、`core/agents.js`、`core/research.js`、`core/answer-composer.js`、`ask()/buildAnswer()/toSections()`、CI 配置。

## 9. 测试计划

### 新增离线测试 `tools/v2-sky-01-test.js`（Node，无浏览器）

| 编号 | 断言 |
| --- | --- |
| L1 | `SkyLayers` 7 键默认全开；`set/toggle/reset/normalize` 正确；未知键无副作用 |
| L2 | `SkyVM.model` 与独立 oracle（直接 `Astro.altAz` 逐条重算）在 1e-9 内一致：132 星、54 DSO、22 星座、行星/月/日 |
| L3 | 缓存：同参数返回同一对象；新 `jd` 重建；`clear()` 后重建；`cache().key` 与旧键格式一致 |
| L4 | `build` 不修改 `CATALOG`（深比较快照）；不产生 `bv/spectral` 字段 |
| L5 | 投影一致性：`proj(az,alt)` 与旧公式在关键方位（0/90/180/270）等价；可见数量随 fov 变化单调 |
| L6 | 用记录型 2D context 跑 `SkyRender.draw`：绘制调用顺序 = 背景→银河→星场→恒星→DSO→星座线→天体→地平线→方位→标签→地球窗 |
| L7 | 图层关闭：`stars:false` 时不出现恒星/星场 fill；`horizon:false` 时无地平线 stroke；其余段仍执行 |
| L8 | `hits/bodies/meta` 结构契约（见 §6），`bodies.length ≥ 1`，土星可检索 |
| L9 | `PlanetVisuals.capabilities()` 在缺少 `SolarView.primitives` 时为 `source:'none'`，`sphere/rings` 返回 `false` |

### 新增浏览器测试 `tools/v2-sky-01-browser-test.js`（Chrome + file://）

| 编号 | 场景 |
| --- | --- |
| B1 | 4 个模块存在，`#sky` 760×540 有 `_hits>10`、`_bodies≥1`、`_meta` 合法 |
| B2 | `__astrum.skyLayers()` 全开；小星图 `_meta.fov=150`、`pitch=40` |
| B3 | 全屏星图 `#viewer=1`：`#viewerCanvas._hits` 大于小星图、无控制台错误、可关闭 |
| B4 | 滚轮缩放后 `_meta.fov` 变化；拖动后 `_meta.yaw` 变化 |
| B5 | 点击行星命中区后 `#objInfo` 打开且标题匹配 |
| B6 | `__astrum.refresh()` 后重新绘制，`_meta` 刷新、无异常 |
| B7 | 深链 `#viewer=1&target=土星` 能定位并打开详情 |

### 旧测试全量

至少执行 CI 的 static、offline-core、offline-browser 全部条目；记录 PASS / FAIL / SKIP，不允许删除或弱化断言。

## 10. 性能与兼容验收

- `App.perf().sky.avg` 改动前后同机对比，允许 ±15%（首帧 JIT 除外）。
- `SkyVM.build` 只在时刻/地点/相机参数变化时执行；拖动时纯投影，帧内无三角函数以外的重算。
- `file://` 直接打开可用；`/Astrum/` 子路径 200；CSP 无新增内联脚本；无新增运行时依赖。
- `canvas._hits` / `_bodies` / `_meta` 结构不变；旧调用方零改动。

## 11. 执行边界

- 不实现阶段 2–6 的任何视觉功能。
- 不修改天文计算、业务链路、Agent/Research/Evidence/Claims/Report。
- 不执行 Git commit / push / reset / clean / 发布。
- 保留工作区已有的 2 处未提交修改。
- 完成后停下，等待用户确认再进入阶段 2。
