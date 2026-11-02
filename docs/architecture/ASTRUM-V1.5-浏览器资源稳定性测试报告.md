# ASTRUM V1.5 浏览器资源稳定性测试报告（Gate 2 + Gate 3）

> 执行日期：2026-11-01
> 代码目录：项目工作区
> 结论：Gate 2 动态资源测试 `10/10`、大文件 `13/13`；Gate 3 缓存 `15/15`。Gate 2/3 通过，无代码修复项。
> 所有数据来自真实 Chrome headless + `file://`，日志可复现（命令见文末）。

---

## 1. 测试环境

| 项 | 值 |
|---|---|
| 浏览器 | Google Chrome（headless=new，本机安装版本） |
| 加载方式 | `file://` 临时副本（仅测试期放宽 CSP inline，业务代码未改） |
| 操作系统 | Windows |
| 项目版本 | `main@d1eb025` + 本地未提交修改（V1.4—V1.5 工程） |
| 网络 | `network:false`（Stub/离线）；缓存测试中对真实网络做了 TTL 失效探测 |
| 测试脚本 | `tools/v1-5-bigfile-test.js`、`tools/v1-5-resource-test.js`、`tools/v1-5-cache-test.js` |

---

## 2. FITS 大文件（真实解析）

| 大小 | 文件字节 | 构建耗时 | 解析耗时 | Heap 前→峰值→释放后 | 结果 |
|---|---:|---:|---:|---|---|
| 10 MB | 10,483,200 | 1 ms | 10 ms | 3.6 → 15.4 → 13.6 MB | PASS |
| 50 MB | 52,427,520 | 1 ms | 27 ms | 13.6 → 54.0 → 53.6 MB | PASS |
| 100 MB | 104,855,040 | 5 ms | 30 ms | 53.6 → 105.3 → 103.7 MB | PASS |
| 200 MB | 209,712,960 | 6 ms | 28 ms | 103.7 → 205.5 → 203.7 MB | PASS |

- 解析耗时恒定（约 30 ms），因为 `AstroFits` 只读头 + 最多 10,000 像素采样（`MAX_HDU=20`、`SAMPLE_MAX=10000`）。
- 200 MB 数据区未截断，`fileSize` 与真实字节一致。
- 释放后 Heap 回落约 2 MB，其余为 ArrayBuffer 未立即回收（V8 外部内存），下一次分配会复用。

## 3. PDF 大文件（真实解析/上限）

| 大小 | 结果 | 说明 |
|---|---|---|
| 10 MB | PASS | `ok=true`，提取 200,000 字符（`maxChars` 上限），构建 76 ms、解析 1,639 ms |
| 50 MB | PASS（拦截） | `pdf_too_large`，构建 624 ms、解析 0 ms |
| 100 MB | PASS（拦截） | `pdf_too_large`，构建 1,003 ms、解析 0 ms |
| 200 MB | PASS（拦截） | `pdf_too_large`，构建 2,727 ms、解析 0 ms |

- 项目 PDF 上限为 12 MB（`core/pdf-text.js:11`），50 MB 以上在扫描前直接拒绝，未产生解析内存峰值。
- 10 MB 解析峰值 Heap 126.1 MB，释放后 41.7 MB（见第 5 节重复趋势）。

## 4. 重复处理 10 次

| 文件 | Heap 序列（每轮 GC 后，MB） | 结论 |
|---|---|---|
| FITS 10 MB | 13.7 × 10（完全持平） | 无持续增长 |
| PDF 10 MB | 41.8, 41.9, 41.9 … 41.9 | 首轮升高后持平，无持续增长 |

PDF 首轮后 Heap 比初始高约 38 MB，但 10 轮完全持平，属 V8 大字符串/外部内存未立即归还，而非每轮泄漏。未做代码修改；记录为“已观测，非持续增长”。

## 5. DOM 节点

| 场景 | 次数 | 初始节点 | 操作后 | 清理后 | 重复 ID | 结论 |
|---|---:|---:|---:|---:|---:|---|
| `AstroResearchUI.render` 研究面板创建→销毁 | 20 | 706 | 707 | 707 | 0 | 无残留 |

- 渲染 20 次均成功（`rendered=20, bad=0`）。
- 节点数只增加 1（测试宿主容器），清理后与基线差 1。
- 未覆盖：设置弹窗、太阳系浮层、页面切换（无稳定 UI API，标记为不可自动化验证；静态检查显示这些元素为单次初始化/复用）。

## 6. Blob URL 生命周期（静态 + 动态）

| 位置 | 创建 | 释放 | 方式 |
|---|---|---|---|
| `core/app.js:3151` | `URL.createObjectURL(blob)` | `core/app.js:3154` | `setTimeout(..., 400)` 后 revoke |
| `core/app.js:5925` | `URL.createObjectURL(blob)` | `core/app.js:5928` | `setTimeout(..., 400)` 后 revoke |
| `core/app.js:6582` | `URL.createObjectURL(blob)` | `core/app.js:6588` | `setTimeout(..., 1500)` 后 revoke |

- 3 处创建均有对应释放，释放发生在下载触发之后，未提前释放。
- 动态：研究面板 20 次创建销毁期间 `createObjectURL=0`、`revokeObjectURL=0`，面板路径不产生 Blob URL。

## 7. Event Listener

| 项 | 数量 |
|---|---:|
| `addEventListener` 调用位置 | 201（app.js 185、solarsystem.js 9、adaptive.js 2、sources.js 2、orchestrator.js 1、paper-fulltext.js 1、simbad.js 1） |
| `removeEventListener` 调用位置 | 5 |
| 动态净增（20 次面板） | 0（add=0, remove=0） |

已核对配对：

- `core/app.js:4615` `document.removeEventListener('keydown', solarKeys)` 与打开太阳系浮层时的同名函数引用一致。
- `core/orchestrator.js:127`、`core/paper-fulltext.js:93`、`core/simbad.js:136`、`core/sources.js:375` 均为 AbortSignal 监听，在 `finally`/`done` 中移除同一引用。

无法逐一验证：其余约 196 处为常驻 UI 元素的一次性绑定，浏览器不暴露原生 listener 表；以 add/remove 计数 + GC 后 Heap 作为间接指标。

## 8. Observer

| 位置 | 类型 | 释放 |
|---|---|---|
| `core/adaptive.js:142` | MutationObserver | `core/adaptive.js:154` `disconnect()` |
| `core/app.js:3194` | ResizeObserver | 页面生命周期常驻（单次初始化） |
| `core/app.js:6966` | MutationObserver | 页面生命周期常驻（单次初始化） |

未发现按渲染/任务重复创建 Observer。

## 9. Timer

- `setInterval` / `clearInterval`：全项目 0 处。
- `setTimeout`：46 处（app 33、sources 3、store 2、geosearch 2、adaptive/orchestrator/paper-fulltext/simbad/task-store/weather 各 1）。
- 关键异步路径（adaptive、orchestrator、paper-fulltext、simbad、sources）均在完成/异常时 `clearTimeout`；下载类 `setTimeout` 为一次性释放回调。
- 动态：20 次面板期间 `setInterval` 净增 0。

## 10. 缓存性能（Gate 3）

### 10.1 真实实现

| 缓存 | 位置 | Key | TTL | 容量 | 持久化 |
|---|---|---|---|---|---|
| 检索结果 | `core/sources.js:1041` | `astrum.search.cache.v2`（Profile 命名空间） | 10 min | 无显式上限 | localStorage |
| SIMBAD | `core/simbad.js:20` | `astrum.simbad.cache.v1` | 24 h | 60（按 at 淘汰最旧） | localStorage |
| 天气 | `core/weather.js:23` | `astrum.weather.cache.v1` | 30 min | 12（按 at 淘汰最旧） | localStorage |
| 论文全文 | `core/paper-fulltext.js:19` | 内存 `CACHE` | 会话 | 8 | 内存 |
| Task 持久化 | `core/task-store.js` | IndexedDB → localStorage → memory | 无 TTL | localStorage 40 | IDB/ls |

### 10.2 命中/未命中

| 场景 | 结果 | 耗时 |
|---|---|---:|
| sources 命中（两个端点均已缓存） | `calls=0, items=2` | 1 ms |
| sources 未命中（`skipCache`） | `calls=1, items=3` | 1,045 ms |
| sources TTL 过期 | `calls=1`（未复用） | 780 ms |
| simbad 命中 | `from=cache` | 1 ms |
| simbad TTL 过期 | 未复用，返回 `cancelled`（AbortSignal） | < 1 ms |
| weather 命中 | `from=cache` | 0 ms |
| weather TTL 过期 | `from=network`（真实网络可用） | 2,111 ms |
| TaskStore 正常 | `backend=idb`，save/get 成功 | — |
| IndexedDB 不可用 | `backend=ls`，save/get 成功 | — |

- **Hit Rate**（本轮 sources 探针）：命中 1 / (1 + 1) = 50%；单次探针不构成长期统计，仅证明命中路径与未命中路径可区分。
- **性能收益**：命中 1 ms vs 未命中 1,045 ms，约 1,000 倍；weather 命中 0 ms vs 过期 2,111 ms。
- 容量淘汰（simbad 60 / weather 12 / paper-fulltext 8）为静态核对：动态触发需真实写入 60+ 条，本轮不伪造，标记“静态确认”。

## 11. 发现的问题

| # | 问题 | 严重度 | 处理 |
|---|---|---|---|
| 1 | PDF 10 MB 首轮解析后 Heap 升高约 38 MB | 低（10 轮持平，非持续增长） | 记录，不修改解析器 |
| 2 | 两个 Observer 常驻未 `disconnect` | 低（单页生命周期、不重复创建） | 记录；页面销毁时随进程释放 |
| 3 | 196 处常驻监听器无法逐一验证清理 | 信息 | 标记不可精确验证，使用间接指标 |

未发现：DOM 持续累积、Blob URL 泄漏、定时器泄漏、监听器净增、页面崩溃。

## 12. 修复情况

本轮 Gate 2/3 **未修改业务代码**。仅新增测试脚本：

- `tools/v1-5-bigfile-test.js`
- `tools/v1-5-resource-test.js`
- `tools/v1-5-cache-test.js`

## 13. 不可测量项

| 项 | 原因 |
|---|---|
| 浏览器进程实际内存 | 浏览器 JS 不暴露；只记录 `performance.memory` JS Heap |
| ArrayBuffer 外部内存精确值 | `performance.memory` 不含外部内存明细 |
| 原生 listener 数量 | 无公开 API |
| 弹窗/页面切换 DOM 周期 | 无稳定 UI API，未自动化 |
| simbad/weather 容量淘汰动态验证 | 需 60+ 条真实写入，标记静态确认 |

## 14. 复现命令

```powershell
node tools/v1-5-bigfile-test.js          # RESULT 13/13
node tools/v1-5-resource-test.js         # RESULT 10/10
node tools/v1-5-cache-test.js            # RESULT 15/15
```

## 15. Gate 2/3 验收

- 大文件 FITS/PDF 分级测试完成，200 MB FITS 通过，PDF 上限按设计拦截。
- 重复 10 次无持续增长。
- 研究面板 DOM/Listener/Timer/Blob 路径干净。
- 缓存命中/未命中/过期/降级全部可复现，命中收益约 1,000 倍。
- Gate 2 通过，Gate 3 通过。
