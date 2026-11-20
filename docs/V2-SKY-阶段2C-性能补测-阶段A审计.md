# V2-SKY 子阶段 2C · 性能补测 · 阶段A 审计报告

- 审计日期：2026-11-05
- 审计性质：**只读**。未修改业务代码、测试代码、配置文件；未下载资源；未执行任何 Git 写操作。
- 说明：用户已明确要求「自动执行到底、不要中途停下」，因此阶段A报告完成后直接进入阶段B，未再等待批准；本报告中所有结论均可在后续阶段复核。

---

## 1. 真实 Git 状态

| 项 | 值 |
|---|---|
| 当前分支 | `main` |
| HEAD | `53f3403d6e26e8947e330a58f923d07e9607b4d3`（`docs: add V1.15 real-environment acceptance report`） |
| 上游 | `origin/main`，`git status -b` 显示 `## main...origin/main`，无 ahead/behind |
| 远程 | `https://github.com/jiangbei0921/Astrum.git` |

### 1.1 已跟踪文件的修改（3 项 + 1 项日志）

| 文件 | 状态 | 归属 |
|---|---|---|
| `core/app.js` | M（-795 / +11 行，阶段1 兼容包装） | 阶段1 已完成改造，未提交 |
| `index.html` | M（+6 行，新增 4 个 sky 脚本标签） | 阶段1 / 2C，未提交 |
| `docs/logs/longrun-LR-SMOKE.jsonl` | M | **用户原有修改**，本次不触碰 |
| `tools/fixtures/v1-9-provider-results.json` | M | **用户原有修改**，本次不触碰 |

`git diff --stat`：4 files changed, 55 insertions(+), 795 deletions(-)。

> 换行提示：Git 报 `LF will be replaced by CRLF`，仅属性警告，不代表内容差异。

### 1.2 未跟踪文件（本阶段前已存在）

- `core/sky-layers.js`、`core/sky-viewmodel.js`、`core/sky-renderer.js`、`core/sky-background.js`、`core/planet-visuals.js`
- `data/milkyway-bg.js`（351,028 B）
- `assets/sky/`（`metadata.json`）
- `tools/build-milkyway-bg.js`、`tools/v2-sky-01-test.js`、`tools/v2-sky-01-browser-test.js`、`tools/v2-sky-2c-test.js`、`tools/v2-sky-2c-browser-test.js`
- `tools/fixtures/milkyway-raw/`（原始 JPEG + report.json）
- `docs/V2-SKY-*.md` 共 9 份

**结论**：工作区脏。用户原有 4 项修改完整保留；本阶段不覆盖、不还原、不提交。

---

## 2. 测试环境

| 项 | 值 |
|---|---|
| OS | Windows 11 家庭版 中文版 |
| CPU | AMD Ryzen 5 5625U with Radeon Graphics（6 核 / 12 逻辑核） |
| 内存 | 16,483,872,768 B（约 15.36 GiB） |
| Node | v24.19.0 |
| npm | 11.17.0 |
| Chrome | 156.0.8078.80（`C:\Program Files\Google\Chrome\Application\chrome.exe`） |
| Node 内置 WebSocket | 可用（`typeof WebSocket === 'function'`） |
| Puppeteer / Playwright | **未安装**（本项目零依赖原则，不新增） |

---

## 3. 现有浏览器测试的启动方式（审计结论）

`tools/v2-sky-2c-browser-test.js` 的做法：

1. 读取 `index.html`，把 CSP 的 `script-src` 放宽为 `'self' 'unsafe-inline'`；
2. 在 `</body>` 前注入内联断言脚本，写到 `__v2sky2c_tmp.html`；
3. `spawnSync` 启动 Chrome：

```
--headless=new --disable-gpu --no-sandbox
--enable-logging=stderr --window-size=1440,900
--virtual-time-budget=45000 --dump-dom file:///.../__v2sky2c_tmp.html
```

4. 从 stdout 里正则提取 `<pre id="__v2sky2c_result">` 文本，统计 CSP 违规条数。

**关键缺陷（重复确认）**：`--virtual-time-budget` 会把页面时钟推进为虚拟时间，`performance.now()` 不再反映真实耗时。因此该脚本中的 B9「连续绘制耗时」无法作为真实性能证据，上一阶段将其标记为 DEFERRED 是正确的。本阶段必须另建真实时钟测量路径。

---

## 4. CDP 可行性（已实测，非推测）

一次性探测脚本（写在 `%TEMP%`，不入库）结果：

```
BROWSER=Chrome/156.0.8078.80
WS=function
PAGE_READY=true
CLOCK_ADVANCE_MS=505.1  (Node sleep 500 ms；虚拟时钟会接近 0)
ENV={"dpr":1,"w":1418,"h":746,
     "ua":"... HeadlessChrome/156.0.0.0 ...","cores":12,"mem":16}
MODULES={"bg":"1.0.0","r":"1.1.0","vm":"1.1.0",
  "stats":{"ready":true,"mode":"auto","texture":{"w":512,"h":256,"bytes":262144},
  "decodeMs":4.2,"skyBuilds":1,"rasterBuilds":1,"cacheHits":2,
  "lastSkyMs":23.9,"lastRasterMs":7.3,"rasterW":128,"rasterH":128,"draws":2,"fallbacks":0}}
```

结论：

- `--headless=new --remote-debugging-port=<port>` 可启动并被 `/json/version` 发现；
- Node 24 内置 `WebSocket` 可直接连接目标页，无需第三方库；
- `Runtime.evaluate` 不受页面 CSP 限制，可直接在真实页面里跑基准（不需要放宽 CSP、不需要注入 `<script>`）；
- 真实时钟成立：Node 侧 500 ms 睡眠，页面 `performance.now()` 前进 505.1 ms；
- 页面启动后 `SkyBackground` 已完成 1 次天空纹理构建（23.9 ms）、1 次栅格构建（7.3 ms），纹理为 512×256。

**判定：阶段B 真实浏览器性能补测可执行，无需 BLOCKED。**

---

## 5. 当前星图真实渲染调用链（代码核实）

```
app.js drawSky(canvas, p)
  └─ SkyVM.build(jd, lat, lon, {width,height,yaw,pitch,fov,layers,...})   // 投影 + 视觉参数
  └─ SkyRender.draw(canvas, p, vm)
       └─ paint():
            clearRect
            skyBackground(g, vm)                 // 静态渐变，始终绘制
            if layers.milkyWay:
                 SkyBackground.draw(g, vm)
                   ├─ ensureSky(jd, lat, lon)     // 256×128 alt/az 天空纹理
                   ├─ ensureRaster(vm)            // 160×160 / 128×128 屏幕栅格
                   └─ drawImage(raster, cx-rmax, cy-rmax, 2rmax, 2rmax)
                 (失败时) milkyWay(g, vm)         // 程序化三条带 fallback
            if layers.stars: (!realBg) starField(); stars()
            deepSky / constellationLines / bodyLayer / horizon / labels / globe
       └─ return {hits, bodies, meta}
  └─ canvas._hits/_bodies/_meta 写回（语义与旧实现一致）
```

`SkyBackground.draw` 返回 `true` 才抑制 `starField` 与程序化 `milkyWay`；`stars` 图层归属未迁移，L7 未被削弱。

去抖重建后的自恢复重绘：`SkyRender` 注册 `SkyBackground.onDirty`，用 `lastPaint` 重绘一次，且校验 `canvas.width === vm.view.w`。

---

## 6. 缓存与去抖语义（代码核实，供阶段B断言语义使用）

| 项 | 实现 |
|---|---|
| `skyKey` | `floor(jd*1440) + '|' + lat.toFixed(4) + '|' + lon.toFixed(4)`（时间精度 1 分钟） |
| `rasterKey` | `yaw/pitch/fov` 各保留 2 位小数 + `w + h + skyKey` |
| `ensureSky` 命中 | 同键 → `cacheHits++`，直接返回 |
| 去抖 | 已有纹理且距上次构建 <150 ms → 复用旧纹理，`setTimeout(150)` 后重建一次并触发 `onDirty` |
| 去抖期间并发 | `PENDING` 非空时直接返回旧纹理，不累加定时器 |
| 强制重建 | `>150 ms` 间隔的调用同步 `buildSky` |
| 栅格命中 | 同 `rasterKey` → 复用 offscreen canvas，零重建 |
| 失效 | `invalidate()` 清空 SKY / RASTER / PENDING（不清 TEX 解码结果） |

`SkyVM.model` 另有一层缓存，键为 `jd.toFixed(5)|lat|lon`，因此「时间变化」成本 = 模型重建 + 天空纹理重建 + 栅格重建。

---

## 7. 阶段B 性能测试方案

### 7.1 环境口径

- 真实 Chrome（`--headless=new`，`--disable-gpu` 软件光栅，与现有测试一致），CDP 驱动；
- 画布 1600×1000（满足 `RASTER_HI` 阈值 w≥1200 且 h≥700）；
- 关闭虚拟时钟；全部测量在页面内用 `performance.now()` 完成，Node 侧只搬运聚合结果；
- 记录 `userAgent`、DPR、视口、核数、`deviceMemory`、`performance.memory`。

### 7.2 场景与统计

| 场景 | 内容 | 采样 |
|---|---|---|
| A 冷启动 | 首帧 decode / sky / raster / 首帧 drawSky（取自页面实测 stats 与 app PERF） | 单次事实值（不伪造 p95） |
| B 缓存命中 | 同 vm（同 yaw/pitch/fov/尺寸/时间地点）连续绘制 | 预热 10 + 采样 100 |
| C 相机变化 | 每次改 yaw（+0.7°）与 fov，强制 `rasterKey` 变化 | 预热 10 + 采样 100 |
| D 观测时间变化 | ① 100 次快速改时间（间隔 <150 ms，验证去抖合并）② 单次 >150 ms 间隔重建 | 100 次序列 + 10 次独立重建 |
| E 观测地点变化 | 每次 lat/lon 变化，强制 `skyKey` 变化 | 预热 10 + 采样 100 |
| F 高负载 | fov=178（上限）、全图层开启、`style=full`、`detail=true`、1600×1000 | 预热 10 + 采样 100 |
| G 连续帧 | 120 帧 rAF，每帧相机微动并绘制，统计帧间隔 >33.3 ms / >50 ms 次数与 max | 120 帧 |

统计量：`avg`、`p50`、`p95`、`max`（nearest-rank），并同时记录 `skyBuilds / rasterBuilds / cacheHits` 差值，证明缓存语义生效。

### 7.3 参考目标（不降低标准）

| 指标 | 目标 |
|---|---|
| 缓存命中背景处理 | 尽量 < 2 ms |
| 完整绘制 p50 | 尽量 < 16.7 ms |
| 完整绘制 p95 | 尽量 < 33.3 ms |
| 连续帧卡顿 | 不频繁 |

若未达标，只报实测与瓶颈分析，不调整阈值。

---

## 8. 阶段C 纹理分辨率评估方案（只评估，不升级）

- 用同一原始 JPEG（1024×512，SHA-256 `1ebe95804f…ee2df0`）离线生成 512×256 与 1024×512 两种 RGB565 纹理，**仅写入 `%TEMP%`**，绝不覆盖 `data/milkyway-bg.js`；
- 对比：JS 模块体积、standalone 增量、Pages 增量、base64 长度、解码耗时（浏览器内 `atob` + 字节循环，按长度实测）、内存占用、天空纹理/栅格构建的规模无关性、采样空间分辨率；
- 关键量化：当前 `SKY` 为 256×128，覆盖 360°/180°，即 **1.406°/px**；512×256 运行时纹理为 **0.703°/px**；栅格 160 对应 `fov/160`（fov=70° 时 0.4375°/px，fov=178° 时 1.11°/px）。据此判断 1024×512 是否为有效提升；
- 最终只给三种建议之一：保持 512×256 / 建议升级 1024×512 / 证据不足暂不升级。

---

## 9. 预计新增与修改文件

### 新增（本阶段）

| 文件 | 用途 | 是否触碰业务 |
|---|---|---|
| `tools/v2-sky-2c-perf-cdp.js` | CDP 真实浏览器整帧性能补测（独立脚本，零依赖） | 否 |
| `tools/v2-sky-2c-perf-bench-inline.js` | 页面内基准函数源码，由 CDP `Runtime.evaluate` 注入执行（不受页面 CSP 限制） | 否 |
| `tools/v2-sky-2c-texture-eval.js` | 512×256 vs 1024×512 资源/性能评估（只读源图、只写临时目录） | 否 |
| `docs/V2-SKY-阶段2C-性能补测-阶段A审计.md` | 本报告 | 否 |
| `docs/V2-SKY-阶段2C-性能补测报告.md` | 阶段B 结果 | 否 |
| `docs/V2-SKY-阶段2C-纹理分辨率评估.md` | 阶段C 结果 | 否 |
| `docs/V2-SKY-阶段2C-最终验收报告.md` | 阶段E 汇总 | 否 |

### 修改

**零修改**。以下文件全部不动：`core/app.js`、`core/astro.js`、`core/sky-layers.js`、`core/sky-viewmodel.js`、`core/sky-background.js`、`core/sky-renderer.js`、`core/solarsystem.js`、`data/catalog.js`、`data/milkyway-bg.js`、`index.html`、`tools/build-standalone.js`、CSP 配置、CI 工作流。

`tools/v2-sky-2c-perf-cdp.js` 需要启动 Chrome 并访问 `127.0.0.1` 调试端口，仅本机回环，属独立测试脚本。

---

## 10. 技术风险

| 风险 | 影响 | 处置 |
|---|---|---|
| headless 软件光栅与用户实机 GPU 合成不同 | 数值不可直接外推为用户实机帧率 | 报告中明确口径；只做同环境相对比较与瓶颈定位 |
| 100 次采样的系统抖动 | p95 可能受偶发调度影响 | 使用 nearest-rank p50/p95 + max，并给出预热与样本数 |
| 时间/地点场景真实触发 14–24 ms 纹理重建 | 可能出现长帧 | 这是真实成本，如实记录，不通过降低分辨率掩盖 |
| 第一阶段浏览器测试脚本的虚拟时钟 | 无法复用其计时结论 | 新建 CDP 路径，旧脚本保持原样用于功能回归 |
| 端口 9333 被占用 | CDP 连接失败 | 脚本探测空闲端口 / 读取 `DevToolsActivePort` |
| 1024 纹理评估误改运行时资源 | 越权升级 | 评估脚本只写 `%TEMP%`，并对 `data/milkyway-bg.js` 计算哈希前后比对 |
| 阶段D 回归期间 `__v2sky2c_tmp.html` 残留 | 工作区污染 | 脚本自清理；结束时再次核查工作区 |

---

## 11. 实施步骤

1. 输出本审计报告（完成）。
2. 编写 `tools/v2-sky-2c-perf-cdp.js`，跑场景 A–G，采集真实时钟数据。
3. 编写 `tools/v2-sky-2c-texture-eval.js`，生成两种纹理的资源对比与浏览器解码实测，给出单一建议。
4. 阶段D：依次运行 2C 离线/浏览器、阶段1 离线/浏览器、selftest、v1-4-pages、csptest 及相关回归；记录 file:// / Pages 子路径 / HTTP / standalone / CSP / 小星图 / 全屏 / 答案内星图 / 图层开关 / fallback / hit 与旧接口。
5. 阶段E：汇总三份交付报告，标注 PASS / PARTIAL / BLOCKED / FAIL，并复核 Git 状态与用户原有修改完整性。
6. 全程不做 Git 写操作。
