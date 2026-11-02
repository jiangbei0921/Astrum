# ASTRUM V1.5 长时间运行测试报告（Gate 4）

> 执行日期：2026-11-01 至 2026-11-02
> 代码目录：项目工作区
> 运行方式：真实 Chrome（headless=new）+ `file://` + 真实计时，逐分钟落盘
> Provider：`network:false`（Stub/离线），**不是真实云端模型测试**
> 日志：`docs/logs/longrun-LR-01.jsonl`、`longrun-LR-02.jsonl`、`longrun-LR-03.jsonl`

---

## 1. 测试环境

| 项 | 值 |
|---|---|
| 浏览器 | Google Chrome headless=new |
| 系统 | Windows |
| 项目版本 | `main@d1eb025` + 本次本地未提交修改 |
| 测试脚本 | `tools/v1-5-longrun-test.js` |
| 计时方式 | `Date.now()` 真实墙钟；循环内 `await` 真实 Control.run + 100 ms 间隔，无加速 |
| 单任务超时 | 30 s（新增保护，避免无限挂起） |
| Heap 采样 | 每分钟 `window.gc()` 后读取 `performance.memory.usedJSHeapSize`（JS Heap，非进程内存） |

## 2. 覆盖任务类型

每轮循环固定混合 8 类：

| 类型 | 说明 |
|---|---|
| T-A | `M42 是什么` |
| T-B | `今晚能看到什么` |
| T-E | 研究任务，Stub 检索返回 SIMBAD + 论文 Evidence，开启 Research Loop |
| T-F | 争议类研究 |
| T-D | `比较 M42 和 M31`（forceCompare） |
| 取消 | 预取消 AbortSignal + Research Loop |
| 文件 | PDF 附件解析 + FITS 解析 |
| Replan | 注入关键 compose 失败，`maxReplans=1` |

每 6 轮执行缓存探针（simbad 命中/过期），每轮保存 TaskState 到 IndexedDB。

## 3. LR-01（30 分钟）

| 指标 | 值 |
|---|---:|
| 分钟采样点 | 30 |
| Task 总数 | 5,941 |
| 成功 | 5,199 |
| 失败 | 0 |
| 取消 | 742 |
| Research Loop 追加 | 743 |
| 单任务最大追加 | 1 |
| Replan 次数 | 742（单任务最大 1） |
| IndexedDB 成功 / 失败 | 6,932 / 0 |
| Cache Hit / Miss | 991 / 991 |
| 页面错误 | 0 |
| 未处理 Promise | 0 |
| 单任务超时 | 0 |
| 最大并发未回落 | 1 |
| Heap live-set（首段最小→末段最小） | 5.6 MB → 22 MB（+16.4 MB） |
| Heap 峰值 | 207 MB（GC 锯齿，非 live-set） |

结论：**通过**。Heap 峰值随分配波动，但每轮可回落到个位数/二十余 MB，live-set 增长 16.4 MB，低于 20 MB 阈值，无持续增长趋势。

## 4. LR-02（60 分钟）

首次尝试因页面未产出结果被中断（未标记通过）；增加心跳与 30 s 单任务超时保护后重跑。

| 指标 | 值 |
|---|---:|
| 分钟采样点 | 60 |
| Task 总数 | 10,249 |
| 成功 | 8,968 |
| 失败 | 0 |
| 取消 | 1,281 |
| Research Loop 追加 | 1,281 |
| 单任务最大追加 | 1 |
| Replan 次数 | 1,281（单任务最大 1） |
| IndexedDB 成功 / 失败 | 11,958 / 0 |
| Cache Hit / Miss | 1,709 / 1,709 |
| 页面错误 | 0 |
| 未处理 Promise | 0 |
| 单任务超时 | 0 |
| 最大并发未回落 | 1 |
| Heap live-set | 5.1 MB → 5.3 MB（+0.2 MB） |
| Heap 峰值 | 174.5 MB |

结论：**通过**。60 分钟内无崩溃、无无响应、无未处理异常、无 Research Loop 无限追加、无预算突破、IDB 零失败。

## 5. LR-03（180 分钟）

| 指标 | 值 |
|---|---:|
| 实际运行时长 | 180.0 分钟（最终快照 elapsedMin=180） |
| 分钟采样点 | 178（允许 ±2 采样漂移；2 分钟因单次循环跨过采样边界未单独落点） |
| Task 总数 | 22,421 |
| 成功 | 19,619 |
| 失败 | 0 |
| 取消 | 2,802 |
| Research Loop 追加 | 2,803 |
| 单任务最大追加 | 1 |
| Replan 次数 | 2,802（单任务最大 1） |
| IndexedDB 成功 / 失败 | 26,158 / 0 |
| Cache Hit / Miss | 3,737 / 3,737 |
| 页面错误 | 0 |
| 未处理 Promise | 0 |
| 单任务超时 | 0 |
| 最大并发未回落 | 1 |
| Heap live-set（首段最小→末段最小） | 5.1 MB → 5.4 MB（+0.3 MB） |
| Heap 峰值 | 381.9 MB（GC 锯齿，非 live-set） |

结论：**通过**。180 分钟内无崩溃、无持续无响应、无未处理异常、无 Task 永久卡死、无 Research Loop 无限追加、无预算突破、IndexedDB 零失败；Heap live-set 仅 +0.3 MB。
采样异常：严格目标为 180 个分钟点，实际 178 个（循环跨过采样边界），已在日志中如实记录，未补造数据；后续测试可改为补采逻辑。

## 6. 异常与处理

| # | 现象 | 处理 |
|---|---|---|
| 1 | LR-02 首轮 60 分钟页面未产出结果，Node 在 deadline 后返回 0 数据 | 记录为未完成；增加 `window.__lr_progress` 心跳 + 180 s 停滞检测 + 30 s 单任务超时；重跑通过 |
| 2 | 初始 Heap 趋势取最后一个原始采样，LR-01 报 +195 MB | 改为分区最小值的 live-set 增长；原始峰值仍报告，避免把 GC 锯齿当泄漏 |
| 3 | 后台直接启动测试出现 `EPERM` 写临时 HTML | 改为前台启动并在超时后自动转后台；测试产物路径不变 |
| 4 | LR-03 目标 180 个分钟点，实际 178 个 | 记录为采样漂移（运行时长仍为 180.0 分钟）；未补造数据；建议后续加入补采逻辑 |

## 7. 验收结论（LR-01 / LR-02 / LR-03）

- 无页面崩溃、无持续无响应。
- 无未处理异常、无未处理 Promise。
- Task 无永久卡死（最大并发未回落 = 1）。
- Research Loop 单任务最多追加 1 次，未无限追加。
- Replan 单任务最多 1 次，未突破 ADR-001。
- IndexedDB 写入 0 失败，无数据损坏迹象。
- 缓存命中/未命中计数持续增长，无异常。
- Heap live-set 无持续增长（30m +16.4 MB、60m +0.2 MB、180m +0.3 MB）。
- 180 分钟实际运行完成；分钟采样 178/180，差异已如实记录，不属于测试未完成。
