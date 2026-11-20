# ASTRUM V2-SKY · 阶段 1 交付报告

- 基线：`main / 53f3403`
- 范围：星图视图模型与渲染架构拆分（不含阶段 2–6 视觉功能）
- 状态：实现完成，等待用户确认后再进入阶段 2
- 未执行任何 Git 写操作

## 1. 实际检查的文件与调用链

| 文件 | 检查内容 |
| --- | --- |
| `core/app.js` | `skyModel()` L853-L925、`drawSky()` L940-L1452、`proj()` L969-L980、`SKY_CACHE` L851、`PERF` L927-L938、`miniMoon` L1455、`drawGlobe` L1490、`drawMoon` L1576 |
| `core/app.js` 调用链 | 小星图 `refreshPanels` L1653；答案内星图 L3144；预热 L3437；全屏 `drawViewer/drawViewerNow` L5024/L5030；命中消费 L5288/L5306；`describeObject()` L5162 |
| `core/app.js` 写回 | `canvas._hits/_bodies/_meta` L1448-L1450，键为 `{yaw,pitch,fov,hz,hit}` |
| `core/solarsystem.js` | 导出 `root.SolarView` L1224-L1233；`buildTexture` L212、`drawSphereDetail` L450、`renderSphereSprite` L468、`drawRings` L604；`drawRings` 依赖模块级 `canvas`（L621）与 `st.phase`（L607） |
| `data/catalog.js` | 132 恒星 / 54 DSO / 22 星座；仅 `k,en,cn,bayer,con,ra,dec,mag`，无 B-V / 光谱 / 自行 |
| `data/bodies.js` | `BODY_INFO` 9 项；行星尺寸依赖 `scale`，非真实角直径 |
| `index.html` | 脚本顺序 L468-L528；CSP L8；启动守卫 L531 |
| `tools/build-pages.js` | `core/`、`data/` 全目录复制；脚本路径白名单 `^(core|data)/*.js` |
| `tools/csptest.js`、`tools/v1-4-pages-test.js` | 脚本引用/MIME/子路径/CSP 断言 |

与阶段 0 审计的差异：阶段 0 未明确指出太阳系球体/环函数**未导出**且依赖三维相机基；本次以当前代码为准，并在 `planet-visuals` 中记录为不可安全复用。

## 2. 最终模块依赖图（无环）

```
data/catalog.js   data/bodies.js   core/astro.js
        \              |              /
         \             |             /  只读全局：CATALOG / BODY_INFO / Astro
          ▼            ▼            ▼
   core/sky-layers.js        零依赖，纯状态
          ▲
          │ 图层开关
   core/sky-viewmodel.js     Astro + CATALOG；独占 SKY_CACHE
          ▲
          │ 视图模型
   core/sky-renderer.js      SkyVM + SkyLayers + CATALOG(星座名) + Astro(地球小窗)
          ▲                     └─可选─▶ core/planet-visuals.js（SolarView 缺失时降级）
          │ drawSky 兼容包装
   core/app.js               交互、命中消费、PERF
```

加载顺序：`core/astro.js`（L476）→ `core/solarsystem.js`（L487）→ `sky-layers.js` → `sky-viewmodel.js` → `planet-visuals.js` → `sky-renderer.js` → `app.js`。

## 3. 新增与修改文件

新增：

| 文件 | 行数级别 | 说明 |
| --- | --- | --- |
| `core/sky-layers.js` | 约 100 | 7 图层状态接口 |
| `core/sky-viewmodel.js` | 约 430 | 模型缓存 + 投影 + 视图模型 |
| `core/sky-renderer.js` | 约 610 | 11 段绘制 + 命中区 |
| `core/planet-visuals.js` | 约 100 | 行星视觉能力探测与接口 |
| `tools/v2-sky-01-test.js` | 约 340 | L1–L9 离线测试 |
| `tools/v2-sky-01-browser-test.js` | 约 230 | B1–B7 浏览器测试 |
| `docs/V2-SKY-阶段1-规格.md` / `-任务.md` / `-交付报告.md` | — | 规格、任务、报告 |

修改：

- `core/app.js`：删除旧星图实现（`SKY_CACHE`、`skyModel` 主体、`drawSky` 主体、`miniMoon`、`drawGlobe`、`starByKey`、`galToEq`、`hexRGB`、`mixColor`、`hexA`）；保留 `skyModel`/`drawSky` 兼容包装；`perf().model` 改读 `SkyVM.cache()`；`__astrum` 增加只读 `skyLayers()`、`skyModules()`。
- `index.html`：插入 4 个脚本（+4 行），CSP 哈希未变（内联脚本未改）。

未修改：`core/solarsystem.js`、`data/*`、`core/astro.js`、`core/agents.js`、`core/research.js`、`core/answer-composer.js`、`ask()/buildAnswer()/toSections()`、CI 配置。

## 4. 模块职责与接口

### `SkyLayers`
`DEFAULTS`（7 键全 `true`）、`ORDER`、`normalize(state)`、`create(initial)` → `all/isOn/set/toggle/reset/onChange`。
不持久化、无 DOM、不接触天文数据。

### `SkyVM`
`model(jd,lat,lon)`（旧 `skyModel` 等价，单条缓存，键 `jd.toFixed(5)|lat.toFixed(4)|lon.toFixed(4)`）、`projector(opts)`、`build(jd,lat,lon,opts)`、`starVisual`、`bodyVisual`、`starByKey`、`galToEq`、`cache()`、`clear()`。

`build()` 输出：`meta / view / layers / counts / milky / dust / stars / dso / constellations / bodies / sun / moon / highlight / horizon`。
- alt/az 全部取自缓存；`build()` 内不调用 `A.altAz`（`highlight` 例外，沿用旧实现一次调用）。
- 星表字段缺失时不生成 `bv/spectral/distPc/pmRA/pmDec`。
- 视图对象全部新建，`raw` 仅持有只读引用。

### `SkyRender`
`draw(canvas, p, viewModel)` → `{hits, bodies, meta}`。
绘制段：`skyBackground → milkyWay → starField → stars → deepSky → constellationLines → bodies → horizonAndGround → directionLabels → labels → globe`。
命中区唯一生产者；阈值与旧版一致（星 `max(9k,size+5k)`、DSO `11k`、天体 `max(r*1.35,14k)`）；`save/restore` 全配对。

### `PlanetVisuals`
`capabilities()`、`texture()`、`sphere()`、`rings()`、`summary()`。
当前 `source:'none'`，`sphere/rings` 返回 `false`，`texture` 返回 `null`；不接入星图行星绘制。

## 5. `drawSky()` 兼容情况

- 签名与参数语义不变：`drawSky(canvas, {jd, lat, lon, yaw, pitch, fov, compact, detail, style, interactive, phase, highlight, showGlobe})`。
- 默认值不变：yaw 180 / pitch 12 / fov 145 / `Rmax = min(W,H)*0.49` / `k = (Rmax/450)*(100/fov)*1.45`。
- `canvas._hits`、`canvas._bodies`、`canvas._meta` 结构不变，`_meta` 仍恰为 `{yaw,pitch,fov,hz,hit}`。
- 四个旧调用点未改一行：L1653、L3144、L5024、L5030。
- `skyModel(jd,lat,lon)` 保留为 `SkyVM.model()` 包装，预热与诊断照旧。
- 时区/地点/时间变化仍经 `refreshPanels()` 重绘；`viewerRAF` 合并逻辑未动。

## 6. 天文数据一致性

离线测试 L2（同一时刻与地点：2026-11-05 21:00 UTC+8，上海 31.23/121.47）：

| 对象 | 视图模型 | 独立 oracle | 误差 |
| --- | --- | --- | --- |
| 恒星（alt ≥ −1°） | 65 | 65 | 0 |
| DSO（alt ≥ 0°） | 22 | 22 | 0 |
| 行星 | 7 | 7 | 0 |
| 星座（含可用连线） | 13 | 13 | 0 |
| 太阳 / 月球 | — | — | < 1e-9 |

补充：`build` 前后 `JSON.stringify(CATALOG)` 完全一致；视图对象无 `bv/spectral` 字段。
浏览器同页对照：HEAD 与当前版本小星图 `_hits` 均为 56，命中数量一致。

## 7. 原有测试结果（PASS / FAIL / SKIP）

| 套件 | 结果 |
| --- | --- |
| `node --check` core/data/tools | PASS 151/151 文件 |
| `selftest`（单文件版，156 断言） | PASS 156/156，CSP 违规 0 |
| `task-test` / `p0-03-test` / `control-test` / `b8-test` | PASS 73/73、53/53、86/86、33/33 |
| `v1b` / `v1c` / `v1d --offline` / `v1-e2e --offline` | PASS 25/25、30/30、31/31、10/10 |
| `v1-1-routing/compat/e2e` | PASS 22/22、20/20、16/16 |
| `v1-2-routing/attachment/comparison/science/simbad` | PASS 24/24、20/20、15/15、19/19、2/2 |
| `v1-3-routing/comparison/paper-fulltext/paper-e2e/compatibility` | PASS 20/20、17/17、22/22、5/5、25/25 |
| `v1-4-paper-attachment` / `v1-4-cloud-control` | PASS 16/16、12/12 |
| `v1-5-perf` | PASS（冷加载 172ms） |
| `v1-5-concurrency/research-loop/research-loop-claims` | PASS 17/17、29/29、48/48 |
| `v1-6-legacy/pdf-fixtures/research-quality` | PASS 23/23、40/40、30/30 |
| `v1-7-research-benchmark --offline` | BENCH 46：PASS 38 / FAIL 0 / SKIP 8 |
| `v1-8-feedback` | PASS 149/149 |
| `v1-9-feedback-diagnostic / blind --offline / research-target` | PASS 29/29；离线子集 SKIP 3；13/13 |
| `v1-10-answer-composer/knowledge-sources/content-i18n/integration` | PASS 29/29、33/33、28/28、27/27 |
| `v1-11-stream/answer-quality/daily` | PASS |
| `v1-13-answer-quality` / `v1-14-output-quality` / `v1-15-regression` | PASS |
| `v1-9-provider-test` / `v1-6-provider-test` | exit 2 `BLOCKED_API_KEY`（与 CI 约定一致） |
| `daily-test` / `v1-2-deploy-test` / `v1-4-ci-test` / `csptest` | PASS 21/21、配置检查通过、6/6 |
| `i18n-scan --max=0` | PASS（界面 0 条） |
| `store-test` / `skill-test` / `consistency-test` / `a11y-test` | PASS |
| `rail-test` / `settings-test` / `ctx-isolation-test` | PASS |
| `v1-1-browser-test` / `v1-4-pages-test` | PASS（本地 `/Astrum/` 子路径等价） |
| `v1-5-idb-stress/resource/cache` | PASS |
| `v1-6-browser-test` | PASS |
| `v1-8-feedback-browser-test` | PASS 49/49 |
| `v1-11-stream/provider/daily-browser-test` | PASS |
| `v1-12-answer-ui-test` | PASS |
| `v1-13-stream-browser-test` / `v1-14-stream-browser-test` | PASS |

FAIL / SKIP：无新增 FAIL；`v1-7` 的 8 个 SKIP 为离线子集既有设计；`v1-9` 离线盲测 3 个 SKIP 为网络案例。

## 8. 浏览器实测

新增 `tools/v2-sky-01-browser-test.js`（Chrome + `file://`，注入断言，CSP 违规 0）：

| 编号 | 结果 |
| --- | --- |
| B1 小星图 760×540、命中 56、天体 3、meta 合法 | PASS |
| B2 图层 7 键默认全开；小星图 fov=150 / pitch=40 | PASS |
| B3 全屏打开；命中 29 > 20；meta 合法；无脚本错误 | PASS |
| B4 滚轮缩放：缩放值 145°→129°；拖动 yaw 180→168.2 | PASS |
| B5 点击行星命中区：详情卡打开，标题“土星” | PASS |
| B6 `refresh()` 重绘：命中 56、无异常 | PASS |
| B7 深链 `#viewer=1&target=土星`：定位 + 详情卡 | PASS |

合计 21/21。答案内星图由 `selftest` 的 20 问渲染链路覆盖（PASS 156/156）。

## 9. 性能与兼容性

- 视图模型（Node，真实时钟，1600×900 full detail）：冷启动 `model` 9.94 ms；`build` 平均 0.43 ms，p50 0.38 ms，p95 0.70 ms（400 次）。拖动时只做投影与对象组装，模型命中缓存。
- 浏览器 `perf().sky.avg` 在 `--virtual-time-budget` 下时钟被冻结（读数为 0），不能作为可靠对比；改为同页命中区一致性对照（HEAD 56 = 当前 56）。
- 渲染器绘制代码为旧实现的逐段迁移，未新增 Path2D/画布缓存；行星精灵/纹理缓存仍归 `solarsystem.js`。
- `file://`：selftest 与新增浏览器测试均通过。
- `/Astrum/` 子路径：`v1-4-pages-test` 通过；发布目录 66 文件（core 53 / data 8），引用 62 个全部 200，大小写一致，0 密钥 / 0 绝对路径。
- CSP：未新增内联脚本；`sync-csp-hash` 报告 2 个哈希已最新；Chromium 日志 CSP 违规 0。
- 无新增运行时依赖。

## 10. 尚未解决的问题与阶段 2 风险

1. **行星视觉复用未接通**：`SolarView` 未导出 `renderSphereSprite/drawSphereDetail/drawRings/buildTexture`，且 `drawRings` 依赖模块级 `canvas` 与 `st.phase`。阶段 5 需要的最小改动（须另行批准）：
   - 增补 `SolarView.primitives` 只读导出；
   - `drawRings` 显式接收画布宽高；
   - 由 `planet-visuals` 构造最小虚拟 `basis/lightDir` 后再接入星图。
2. **图层状态未持久化、无 UI**：按阶段 1 约束只提供接口，默认全开。
3. **启动守卫未纳入新模块**：为避免改动内联脚本与 CSP 哈希，`MISSING` 列表保持原样；模块缺失时会表现为星图不绘制，后续可随其他内联脚本一起更新。
4. **无头浏览器 rAF 时序**：缩放后 `_meta` 可能滞后一帧（缩放值同步更新）；这是既有 `viewerRAF` 行为，非本阶段回归。
5. **星表物理字段仍缺**：B-V、光谱、自行、距离均不存在；阶段 2 扩展星表前，视图模型保持不生成这些字段。
6. **工作区既有改动**：`docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json` 在本次测试运行中可能被测试脚本刷新；未删除、未回退用户改动。

## 阶段 1 停止点

本阶段已完成，不进入阶段 2。等待用户确认后再开始恒星数据、银河纹理、行星材质、地平线升级与专业工作空间。
