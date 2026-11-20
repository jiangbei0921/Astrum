# ASTRUM V2-SKY · 阶段 1 任务清单

> 规格：[V2-SKY-阶段1-规格.md](./V2-SKY-阶段1-规格.md)
> 基线：`main / 53f3403`；完成后停止，不进入阶段 2。

## T0 基线快照与性能基线（只读）

- [x] 记录 `git status`（保留 `docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json`）。
- [x] 用 Chrome 跑一次 `file://index.html`，记录 `__astrum.perf()`、`#sky._hits.length`、`#viewerCanvas._hits.length` 作为对照基线。

验收：基线数值写入交付报告。

## T1 图层状态接口 `core/sky-layers.js`

- [x] 实现 `DEFAULTS / ORDER / create / normalize`（7 键全开）。
- [x] 实现 `all/isOn/set/toggle/reset/onChange`；`all()` 返回副本。
- [x] 无 DOM、无 `Astro`/`CATALOG` 依赖。

验收：离线断言 L1 通过；默认状态与旧星图一致。

## T2 视图模型 `core/sky-viewmodel.js`

- [x] 迁移 `skyModel`（L853-L925）等价实现，`SKY_CACHE` 键格式不变。
- [x] 迁移 `galToEq`、`starByKey`、`proj` 数学，逐字保持。
- [x] 实现 `build()`：产出 §3.2 结构；不重算位置、不写 `CATALOG`、不伪造 B-V。
- [x] 实现 `starVisual/bodyVisual/cache/clear`。

验收：L2–L5 通过；132/54/22 与坐标 1e-9 等价。

## T3 渲染器 `core/sky-renderer.js`

- [x] 按 §3.3 拆分 11 个绘制段，顺序与旧代码一致。
- [x] 迁移 `miniMoon`、`drawGlobe`；颜色工具在模块内私有实现。
- [x] 命中区唯一由 renderer 创建；`save/restore` 全部配对。
- [x] 图层开关门控：`stars` 同时控制星场与恒星；`labels` 只控制文字。

验收：L6–L8 通过；绘制顺序与命中结构与旧版一致。

## T4 行星视觉接口 `core/planet-visuals.js`

- [x] 实现 `capabilities/texture/sphere/rings/summary`。
- [x] 探测 `SolarView.primitives`；缺失时安全降级。
- [x] 不改 `core/solarsystem.js`；不接入星图行星绘制。

验收：L9 通过；诊断输出说明 `source:'none'` 与阶段 5 最小调整方案。

## T5 `app.js` 兼容包装

- [x] `skyModel()` 改为 `SkyVM.model()` 包装。
- [x] `drawSky()` 改为 `SkyVM.build()` + `SkyRender.draw()` 包装，仍写 `_hits/_bodies/_meta`、仍统计 `PERF.sky`。
- [x] 删除仅被旧实现使用的 `starByKey/galToEq/hexRGB/mixColor/hexA/miniMoon/drawGlobe`。
- [x] `__astrum.perf().model` 改读 `SkyVM.cache()`；新增只读 `skyLayers()/skyModules()`。
- [x] 4 个旧调用点零改动。

验收：`node --check core/app.js`；旧调用点 diff 为空。

## T6 脚本加载顺序与构建

- [x] `index.html` 在 `core/app.js` 前插入：`sky-layers.js`、`sky-viewmodel.js`、`planet-visuals.js`、`sky-renderer.js`。
- [x] `node tools/build-pages.js` 通过；`node tools/build-standalone.js` 通过；`node tools/sync-csp-hash.js` 无额外改动。
- [x] 不新增 CSP 内联脚本、不新增第三方依赖。

验收：`_site` 构建成功，引用数 ≥ 50，全部 200。

## T7 新增测试

- [x] `tools/v2-sky-01-test.js`：L1–L9 全绿。
- [x] `tools/v2-sky-01-browser-test.js`：B1–B7 全绿。

验收：两份测试可独立运行，退出码 0。

## T8 旧测试全量与浏览器实测

- [x] static：`node --check`（core/data/tools）、`sync-csp-hash`、`build-standalone`、`build-pages`、`daily-test`、`v1-2-deploy-test`、`v1-4-ci-test`、`csptest`、`i18n-scan`。
- [x] offline-core：`research-test`、`task-test`、`p0-03-test`、`control-test`、`b8-test`、`v1b/v1c/v1d/v1-e2e`、`v1-1-*`、`v1-2-*`、`v1-3-*`、`v1-4-*`、`v1-5-*`、`v1-6-*`、`v1-7`、`v1-8`、`v1-9`、`v1-10`、`v1-11`、`v1-13`、`v1-14`、`v1-15`。
- [x] offline-browser：`selftest`、`store-test`、`skill-test`、`consistency-test`、`a11y-test`、`rail-test`、`settings-test`、`ctx-isolation-test`、`v1-1-browser`、`v1-4-pages`、`v1-5-*`、`v1-6-browser`、`v1-8`、`v1-11-*`、`v1-12`、`v1-13`、`v1-14`。
- [x] 记录 PASS / FAIL / SKIP 明细；回归优先修复本阶段引入的问题。

验收：无新增 FAIL；无删除或弱化断言。

## T9 交付报告与停止点

- [x] 生成 `docs/V2-SKY-阶段1-交付报告.md`，覆盖规格 §9–§10 的 10 项交付内容。
- [x] 明确列出剩余问题与阶段 5 复用前置条件。
- [x] 停止，不进入阶段 2；不执行任何 Git 写操作。
