# ASTRUM-03 代码健壮性审计

## 1. 输入校验
| 检查项 | 结果 | 证据 |
|---|---|---|
| 工具参数 Schema | 有 | `registry.js` 每工具 `argsSchema`；`ToolGateway` 调用前校验 |
| 身份类参数注入 | 阻断 | `ToolGateway` / `SkillRuntime` 的 `FORBIDDEN_ARGS` |
| Skill 输入输出 | 有 | `skill-contract.js` + `skill-validator.js` |
| 用户自由文本 | 渲染前 `esc()`；进入检索前做查询构造 | `app.js`、`research.js` |
| 外部 URL | CSP `connect-src` 白名单 | `index.html` |
| 数值输入（计算器/坐标） | 需逐项验证 | **部分待验证**：未见统一的 NaN/范围守卫层 |

**结论**：边界层校验较完整；纯前端数值输入的极端值处理未做穷举验证，标「待验证」。

## 2. 异步与并发
| 编号 | 问题 | 等级 | 说明 |
|---|---|---|---|
| ASTRUM-005 | `withTimeout` 超时后仅忽略结果，不 abort 下游请求 | P2 | `orchestrator.js` 包装层；`sources.js` 自身有 AbortController，但工具执行层超时后底层 Promise 继续 |
| ASTRUM-006 | 暂停仅在步骤/批次边界生效 | P2 | `control.pause` 设置 `pausedAt`，运行中的步骤需完成；副作用不能即时停止 |
| ASTRUM-010 | 多标签页并发写缺少版本冲突保护 | P2 | `STALE_WRITE` 仅比较 ISO 时间字符串 |
| — | 批内并行步骤共享 `state` 写事件 | 可接受 | JS 单线程 + 同步 `appendEvent`，未观察到重复 seq |

**影响**：超时/暂停不会造成数据损坏，但可能出现「界面已显示超时，后台仍完成一次工具调用」；对幂等工具无影响，对写操作需注意。

## 3. 异常处理
- `Control.run` 捕获 planner/orchestrator 异常，降级为 legacy 答案并记录 `error`，不白屏。
- `Research.run` 在无 principal 时返回 `stopReason:'denied'`，不抛异常（可能导致静默空结果，见 ASTRUM-022）。
- `TaskStore` 将 `QuotaExceededError` 映射为 `QUOTA`，`VersionError` 映射 `STALE_WRITE`。
- UI 主流程有 `try/catch` 与 `finish` 兜底；`busy(false)` 在 `then/catch` 两路均调用。
- **潜在问题**：`Research.run` 的 denied 分支返回「正常对象」，调用方若不检查 `stopReason` 会把空证据当成功；当前 `app.js` 通过 principal 避免，但测试/未来调用方易踩坑。

## 4. 状态机
`task.js` 定义 `LEGAL_TRANSITIONS` 与预算分档：
- 非法迁移抛错；预算 `used ≤ limit`；`recoveries` 默认上限 1。
- `control.run` 的 `PLAN → EXECUTE → PROGRESS → JUDGE → DONE` 与 replan 循环有上限。
- `recovery.decide` 对 `failed` 步骤受 `maxAttempts` 限制，避免无限重试。
- **边界待验证**：若步骤状态为 `paused` 但无 `pausedAt`，`nextBatch` 可能返回空批次并使 `runPlan` 提前结束（未见触发路径，标待验证）。

## 5. 资源与性能
- IndexedDB 1000 条写入 2273 ms、删除 500 条 1740 ms（浏览器实测，headless Chrome）。
- TaskStore 200 条读写约 178 ms。
- 事件内存上限、检查点保留 20、AuditLog 上限 1000，均有界。
- 纯静态数据文件较大（`agents.js` 144 KB、`app.js` 389 KB、`sources.js` 99 KB），首次加载 215.5 ms（本地）。
- **P3**：无批量写入优化；低端设备上大量任务保存可能卡顿。

## 6. 兼容性
- 目标为现代 Chrome/Edge（使用 IndexedDB、Canvas、ES5+ 语法）。
- 无 `package.json`/polyfill；`fake-indexeddb` 仅在 Node 测试使用。
- 浏览器测试依赖本机 Chrome，CI 使用 `google-chrome`；Safari/Firefox 未测试（**待验证**）。

## 7. 健壮性评分
- 优点：异常兜底充分、状态机与预算有约束、资源有界、测试覆盖广。
- 扣分：超时不中断、暂停不即时、并发写保护弱、数值输入未穷举。
- **评分：76/100。**

## 8. 建议
1. 将 `withTimeout` 与 `AbortController` 打通，或在文档声明「超时仅放弃等待」。
2. 暂停时向工具传 `signal` 并支持协作式中断；UI 明确当前步骤完成后暂停。
3. TaskStore 增加 `revision` 条件写（compare-and-set），替代时间字符串。
4. 为计算器/坐标输入增加统一数值守卫与边界测试。
