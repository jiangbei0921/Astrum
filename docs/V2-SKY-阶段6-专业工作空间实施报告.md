# ASTRUM V2-SKY · 阶段 6 专业工作空间实施报告

- 文档版本：1.0.0
- 日期：2026-11-06
- 依据：`docs/V2-SKY-阶段4-6-任务与规格.md` 阶段 6
- 改动范围：新增 `core/workspace.js`；`core/app.js`、`index.html` 增量；新增 `tools/v2-sky-06-test.js`
- 未改动：`Profile` 语义、`data/catalog.js`、星图渲染链、冻结视觉参数
- Git 写操作：**无**

---

## 1. 结论

阶段 6 完成。四项规格全部落地，纯逻辑与 UI 分离，逻辑层可离线测试。

| 规格项 | 状态 | 说明 |
|---|---|---|
| 多套观测配置 | **完成** | 观测台新增「配置」下拉 + 保存/删除；保存「地点 + 时区 + 器材 + 视场/方位/俯仰」；上限 12 套 |
| 清单可复现 | **完成** | 加入清单时记录 `jd/lat/lon/tz/city/gear/fov/yaw/pitch`；清单行出现 `↺` 按钮回到当时视角 |
| 计划单 CSV | **完成** | 10 列表头、RFC4180 转义、带 BOM 便于 Excel 直接打开 |
| 导出入口合并 | **完成** | 设置 → 数据与核验 内并列「导出配置」「导出观测计划（CSV）」「导入配置」 |

---

## 2. 实现细节

### 2.1 新增 `core/workspace.js`（1.0.0）

纯函数，不接触 DOM 与 localStorage：

```js
normalize(raw)          // 字段规范与边界夹紧，非法坐标返回 null
list(raw)               // 去重（按 id）、过滤非法、上限 12
upsert(arr, item)       // 同 id 覆盖并置顶
remove(arr, id)
snapshot(item, ctx, view)  // 清单项快照
planCsv(rows, opts)     // 10 列 CSV，转义逗号/引号/换行
```

边界：纬度 ±90、经度 ±180、时区 −12~+14（缺省按经度/15）、视场 30–178、俯仰 −6~78、方位归一到 0–360。

### 2.2 `index.html`

- 观测台「观测上下文」新增配置行：`#wsSelect` / `#wsSave` / `#wsDel` / `#wsHint`；
- 加载 `core/workspace.js`（位于 `sky-renderer.js` 与 `app.js` 之间）。

### 2.3 `core/app.js`

- `loadWorkspaces/saveWorkspaces/renderWorkspaces/applyWorkspace/saveCurrentWorkspace/deleteCurrentWorkspace`；
- 应用配置：切换地点（复用 `setPlace`）、器材下拉、`vw` 视角；全屏星图开启时立即重绘；
- `togglePlan()` 改为写入 `Workspace.snapshot(...)`，保留旧字段兼容（老清单无 `fov` 时不显示 `↺`）；
- `renderPlan()` 为含视角快照的条目增加 `↺` 按钮（150ms 后套用，避开 `openViewer` 的复位）；
- 新增 `exportPlanCsv()`，并在设置「数据与核验」中加入按钮。

### 2.4 存储

| 键 | 内容 |
|---|---|
| `astrum.workspaces.v1` | 观测配置数组（本机，不随配置导出） |
| `astrum.plan.v1` | 观测清单（结构向后兼容，新增快照字段） |

未改动 `astrum.*` 既有键；旧备份导入路径不受影响。

---

## 3. 测试

### 3.1 新增 `tools/v2-sky-06-test.js`（24/24）

| 组 | 覆盖 | 结果 |
|---|---|---|
| W1 | 非法坐标拒绝、缺省填充、越界夹紧、时区按经度估算 | PASS |
| W2 | 去重、过滤、上限 12、非数组输入 | PASS |
| W3 | 新增置顶、同 id 覆盖、删除 | PASS |
| W4 | 目标字段、观测上下文、视角、时间戳入档 | PASS |
| W5 | CSV 表头 10 列、行数、引号转义、空值、J2000 提示、赤经格式化 | PASS |

### 3.2 注入式 UI 验证（10/10）

| 编号 | 断言 | 结果 |
|---|---|---|
| S1–S3 | 保存后下拉出现配置、提示「已存 1 套」、写入 localStorage | PASS |
| S4 | 选择配置后地点栏更新为对应坐标 | PASS（35.69°, 139.69° · UTC+9） |
| S5–S7 | 目标目录可加入、清单项含 `jd` 与 `fov/yaw` 快照 | PASS |
| S8 | 清单行出现 `↺` 按钮 | PASS |
| S9 | 设置内含「导出观测计划（CSV）」 | PASS |
| S10 | 无未捕获错误 | PASS |

### 3.3 回归

| 套件 | 结果 |
|---|---|
| `v2-sky-04-test`（阶段4） | 20/20 |
| `v2-sky-05-test`（阶段5） | 12/12 |
| `v2-sky-2b-test` | 31/31 |
| `v2-sky-01-test` | 52/52 |
| `v2-sky-2c-test` | 24/24 |
| `v2-sky-p0-p1-test` | 23/23 |
| `v2-sky-01-browser-test` | 21/21 |
| `v2-sky-2c-browser-test` | 20/20（B4.2 `on=18.7 / off=10.8`） |
| `v2-sky-p0-p1-browser-test` | 15/15 |
| `selftest` | 通过，CSP 违规 **0** |
| `v1-4-pages-test` / `csptest` | 32/32 / 6/6 |
| `build-standalone` | 已重建 |

---

## 4. 已知限制

| 编号 | 限制 | 说明 |
|---|---|---|
| P6-L1 | 配置名用 `window.prompt` | 与项目既有交互一致，未新增自定义弹窗组件 |
| P6-L2 | 配置不随「导出配置」备份 | 仅本机 `localStorage`；跨设备需手动重建 |
| P6-L3 | 旧清单项无视角快照 | 不显示 `↺`，点击仍按目标坐标打开 |
| P6-L4 | CSV 高度为加入清单时的瞬时值 | 表头已注明，不作为当前时刻高度 |
| P6-L5 | 未做云端同步与多人协作 | 规格明确不做 |

---

## 5. 阶段 4–6 总览

| 阶段 | 状态 | 新增测试 |
|---|---|---|
| 4 行星视觉增强 | 完成 | `v2-sky-04-test.js` 20/20 |
| 5 地平线升级 | 完成 | `v2-sky-05-test.js` 12/12 |
| 6 专业工作空间 | 完成 | `v2-sky-06-test.js` 24/24 + UI 10/10 |

三阶段均未改动冻结视觉基线（F/G/ALPHA/512×256/最近邻/光晕/B4.2），全部回归通过。
