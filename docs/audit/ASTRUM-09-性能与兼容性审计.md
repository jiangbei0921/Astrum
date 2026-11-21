# ASTRUM-09 性能与兼容性审计

## 1. 实测性能（本机，Node 24.19 / headless Chrome）

来源：`node tools/v1-5-perf-test.js`（本次实跑）

| 指标 | 数值 |
|---|---|
| 冷启动 `coldLoadMs` | 215.5 ms |
| Router（n=60） | avg 0.62 / median 0.42 / p95 1.27 / max 7.42 ms |
| Planner（n=40） | avg 0.60 / median 0.41 / p95 1.05 / max 4.71 ms |
| Control 本地（n=5） | avg 28.35 / median 22.25 / p95 23.05 / max 56.12 ms |
| PDF 解析（n=20） | avg 0.48 / p95 0.94 ms |
| 100 条证据报告（n=20） | avg 8.89 / p95 10.94 ms |
| TaskStore 200 条 | 178.34 ms |
| heapUsed | 18.88 MB |
| RSS | 75.29 MB |

### IndexedDB 压力（headless Chrome）
- 1000 条写入：2273 ms（约 2.3 ms/条）。
- 500 条删除：1740 ms。
- 清理后为空，无重复。

## 2. 性能评估
- 交互路径（Router/Planner/报告）均在毫秒级，**体验良好**。
- 冷启动 215 ms 对纯静态多脚本应用可接受；主要体积来自 `app.js`(389 KB)、`agents.js`(144 KB)、`sources.js`(99 KB)。
- 内存占用低（<20 MB heap）。
- **瓶颈**：IndexedDB 大量逐条写入；低端设备/移动端可能明显卡顿（P3）。
- 未做：真实低端机、移动端、Safari/Firefox、离线弱网测试（**待验证**）。

## 3. 资源边界
| 资源 | 上限 | 评估 |
|---|---|---|
| AuditLog | 1000 条内存 | 有界 |
| 检查点 | 保留 20 | 有界 |
| 事件 | 随任务，嵌入状态 | 长任务需观察 |
| 附件 | 由 UI/解析层限制 | 未穷举验证 |
| 网络 | 首包/总超时、AbortController | 良好 |

## 4. 兼容性
- 目标：现代 Chromium（IndexedDB、Canvas 2D、ES5 兼容写法）。
- CI 使用 `google-chrome`；Safari/Firefox 未纳入。
- 无 polyfill、无构建；依赖浏览器原生能力。
- GitHub Pages 部署可行（`pages.yml`）。

## 5. 可访问性/国际化
- `a11y-test`、`rail-test`、`settings-test` 存在于 CI。
- i18n 存在 1 处静态词条缺失（ASTRUM-015）。
- 英文内容覆盖依赖 `i18n.en-*`，未做全量人工审校（待验证）。

## 6. 评分
- 运行时性能：88。
- 存储性能：72。
- 兼容性覆盖：74。
- **综合：86/100（按加权前维度），报告总表中取 86。**

## 7. 建议
1. TaskStore 批量写入/事务合并，降低大量任务保存延迟。
2. 对长任务事件做上限或归档，避免状态膨胀。
3. 增加 Firefox/Safari 冒烟测试。
4. 为性能设阈值门禁（如 p95 > 50 ms 报警）。
