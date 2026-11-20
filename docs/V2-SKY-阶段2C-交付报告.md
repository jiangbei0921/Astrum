# ASTRUM V2-SKY · 子阶段 2C 交付报告

- 执行范围：NASA SVS 银河底图下载、离线纹理打包、反投影、渲染接入、缓存、fallback、测试
- 结论：**PARTIAL**（功能完成；浏览器整帧性能因虚拟时钟无法测量，坐标量化精度未达 0.02° 目标）
- 未修改禁止文件；未执行 Git 写操作；未新增运行时依赖

## 1. 实施结果

### DONE

- NASA SVS 官方 `milkyway_2020_4k_print.jpg` 下载与校验（1024×512，71,247 B）。
- `tools/build-milkyway-bg.js`：PIL 解码 → 512×256 Lanczos → RGB565 小端 → base64 → `data/milkyway-bg.js`。
- `core/sky-viewmodel.js` 新增 `altAzToEq()` 与 `eqToUv()`（未改 `astro.js`）。
- `core/sky-background.js`：同步解码、天空纹理 256×128、屏幕栅格 160×160（低端 128×128）、150 ms 去抖、缓存、fallback。
- `core/sky-renderer.js`：真实背景接入、程序化 fallback、去抖后的自恢复重绘。
- `index.html`：纹理脚本先于背景模块，背景模块先于渲染器。
- 资源元数据 `assets/sky/milkyway/metadata.json`。
- 新增离线/浏览器测试并全部通过；旧测试全量回归通过。

### DEFERRED

- 浏览器整帧耗时（p50/p95）：`--virtual-time-budget` 下 `performance.now()` 冻结，无法得到可信数值。模块级耗时已在 Node 实测（见 §6）。

### PARTIAL

- 坐标量化精度：映射数学精确（往返 ∼1e-14），但纹理 512×256 对应 **0.703°/像素**，最近邻采样半像素误差约 **0.35°**；源图 1024×512 也有 0.352°/px。阶段 A 的 0.02° 目标在该纹理分辨率下不可达。

### 与原计划的差异

| 项 | 计划 | 实际 | 原因 |
| --- | --- | --- | --- |
| 屏幕栅格 | 240×135 | **160×160** | 栅格覆盖鱼眼圆，必须为正方形；160² 实测 5.21 ms，240² 约 7 ms |
| 银南极 UV 预期 | 0.0357 | **0.46429** | 原计划笔误；RA 0.857h 在中心左侧，不是环绕点 |
| 纹理来源 | 4k EXR 可选 | 官方 print JPEG | 已 tone-map，避免 EXR/HDR 处理，体积仅 69.6 KB |

## 2. 文件变更

### 新增

| 文件 | 职责 |
| --- | --- |
| `data/milkyway-bg.js` | 运行时纹理，351,028 B（base64 349,528 B） |
| `core/sky-background.js` | 解码/天空纹理/屏幕栅格/缓存/降级 |
| `assets/sky/milkyway/metadata.json` | 来源、许可、SHA-256、处理参数 |
| `tools/build-milkyway-bg.js` | 离线预处理（PIL） |
| `tools/v2-sky-2c-test.js` | 离线测试 24 项 |
| `tools/v2-sky-2c-browser-test.js` | 浏览器测试 20 项 |
| `tools/fixtures/milkyway-raw/milkyway_2020_4k_print.jpg` | 原始资源（71,247 B） |
| `tools/fixtures/milkyway-raw/report.json` | 处理校验报告 |

### 修改

| 文件 | 关键修改 |
| --- | --- |
| `core/sky-viewmodel.js` | `altAzToEq`、`eqToUv` 导出；版本 1.1.0 |
| `core/sky-renderer.js` | `paint()` 拆出；真实背景 + fallback；自恢复重绘；版本 1.1.0 |
| `index.html` | + `data/milkyway-bg.js`、`core/sky-background.js` |

### 明确未修改

`core/app.js`、`core/astro.js`、`core/solarsystem.js`、`core/sky-layers.js`、`data/catalog.js`、`tools/build-standalone.js`、CSP、CI。

## 3. NASA 资源

| 项 | 值 |
| --- | --- |
| 资源页面 | <https://svs.gsfc.nasa.gov/4851/> |
| 下载地址 | <https://svs.gsfc.nasa.gov/vis/a000000/a004800/a004851/milkyway_2020_4k_print.jpg> |
| 文件 | `milkyway_2020_4k_print.jpg` |
| 尺寸 | 1024×512 |
| 大小 | 71,247 B（69.6 KB） |
| SHA-256 | `1ebe95804f5f0e6e23f77488aaa33fdb4aaef3fd336821fb41b261ddeaee2df0` |
| 许可 | 公有领域（NASA SVS Help） |
| 署名 | NASA/Goddard Space Flight Center Scientific Visualization Studio；Ernie Wright |
| 纹理 | 512×256 RGB565 小端，262,144 B，base64 349,528 B |
| 处理 | Lanczos 缩放；无裁剪、无亮度/对比度调整 |
| 参考亮度 | NGP 11.08、SGP 12.30、GC 117.11、ANTI 55.86 |

## 4. 坐标精度

| 参考 | UV（u,v） | 验证结果 |
| --- | --- | --- |
| 银北极 12.85730h / +27.12825° | 0.96428, 0.34929 | 通过；方向暗（均值 9.1） |
| 银南极 00.85730h / −27.12825° | 0.46428, 0.65071 | 通过；方向暗（均值 9.3） |
| 银心方向 17.76033h / −28.9362° | 0.75999, 0.66076 | 通过；亮度 83.8 |
| 反银心 05.76033h / +28.9362° | 0.25999, 0.33924 | 通过；亮度 55.6（比值 1.51） |

- `altAzToEq` 往返：1000 组随机坐标最大误差 **4.12e-13**（RA/Dec），极区 ±89.9° 通过。
- 映射数学：UV 公式精确；图像方向（RA 向左、Dec 向上）经参考亮度验证。
- **量化限制**：512×256 纹理 0.703°/px，最近邻采样最大半像素 0.35°；源图 0.352°/px。未达 0.02°，未放宽测试阈值。

## 5. 测试结果

| 套件 | 结果 |
| --- | --- |
| `v2-sky-2c-test.js` | 24/24 PASS |
| `v2-sky-2c-browser-test.js` | 20/20 PASS，CSP 0 |
| `v2-sky-01-test.js` | 52/52 PASS |
| `v2-sky-01-browser-test.js` | 21/21 PASS |
| `selftest` | 156/156 PASS，CSP 0 |
| `v1-4-pages-test` | 32/32 PASS |
| `csptest` | 6/6 PASS |
| `i18n-scan --max=0` | 界面 0 条 |
| 旧离线套件（research/task/p0-03/control/b8/v1b/v1c/v1d/v1-e2e、v1-1~v1-15） | 全部 exit 0 |
| `v1-9-provider-test` / `v1-6-provider-test` | exit 2 `BLOCKED_API_KEY`（预期） |
| 旧浏览器套件（store/skill/consistency/a11y/rail/settings/ctx/v1-1/v1-5×3/v1-6/v1-8/v1-11×3/v1-12/v1-13/v1-14） | 全部 exit 0 |

无删除、跳过或弱化旧断言。

## 6. 性能结果

Node 实测（同机，多次）：

| 项 | 次数 | avg | p50 | p95 | max |
| --- | --- | --- | --- | --- | --- |
| 纹理解码 | 1 | 2.49 ms | — | — | — |
| 天空纹理 256×128 | 8 | 13.21 ms | 13.32 ms | 14.03 ms | 14.03 ms |
| 屏幕栅格 160×160 | 12 | 5.21 ms | 4.93 ms | 9.23 ms | 9.23 ms |
| 缓存命中绘制 | — | 仅 `drawImage`（约 0.1–0.3 ms，浏览器未测得） | — | — | — |

- 天空纹理仅在时间/地点变化后构建，150 ms 去抖；屏幕栅格仅在相机/画布变化时构建。
- 纹理 262 KB（RGB565）；天空纹理 98 KB；栅格 102 KB；base64 341 KB；峰值 < 1 MB。
- standalone：1956 KB → **2312 KB（+356 KB）**；Pages 发布包 2340 KB。
- 浏览器整帧 p95：**DEFERRED**（虚拟时钟冻结）。未用估算值冒充实测。

## 7. 兼容性

| 环境 | 结果 |
| --- | --- |
| `file://` | PASS（2C 浏览器测试、phase 1 浏览器测试） |
| GitHub Pages 子路径 | PASS（`v1-4-pages-test` 32/32） |
| 普通 HTTP | PASS（Pages 本地等价服务） |
| standalone | PASS（`selftest` 156/156，纹理随脚本内联） |
| CSP | PASS，违规 0；未修改 CSP |
| 小星图 | PASS（命中 56，meta 不变） |
| 全屏星图 | PASS（缩放/拖动/详情回归） |
| 答案内星图 | PASS（selftest 20 问渲染链路） |
| 图层开关 | PASS（关闭后不采样、不绘制；恒星仍在） |
| fallback | PASS（缺失模式无异常，程序化背景生效） |

## 8. Git 状态

- 分支：`main`
- HEAD：`53f3403d6e26e8947e330a58f923d07e9607b4d3`
- 工作区：阶段 1 改动 + 2C 新增文件 + 用户既有两处修改（`docs/logs/longrun-LR-SMOKE.jsonl`、`tools/fixtures/v1-9-provider-results.json`）均保留。
- **未执行** `add/commit/push/reset/checkout/clean/rebase/merge`。
- `astrum-standalone.html` 为 gitignore 产物，未纳入工作区管理。

## 9. 最终验收

**PARTIAL**

- 功能、渲染、缓存、fallback、图层、命中、file://、Pages、standalone、CSP：PASS。
- 未完成：
  1. 浏览器整帧 p50/p95（虚拟时钟限制，DEFERRED）。
  2. 0.02° 坐标精度目标在 512×256 纹理下不可达（实际半像素约 0.35°；映射数学精确）。
- 未修改禁止文件；未新增外部运行时依赖；无遗留许可风险（NASA SVS 公有领域，已署名）。

## 遗留风险与下一阶段建议

1. 若阶段 3 需要更高银河细节，可评估 1024×512 纹理（+1.4 MB base64），但 standalone 将接近 4 MB 预算。
2. 时间/地点连续变化时天空纹理 14 ms 重建；已去抖，若后续出现卡顿可降至 192×96 或放入空闲回调。
3. 浏览器真实帧率建议在非虚拟时钟的 CDP/人工验收中补测，再决定是否上调栅格分辨率。
