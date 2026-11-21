# ASTRUM-08 测试与质量审计

## 1. 测试体系
- 171 个 `tools/` 文件，其中测试脚本约 60+，fixture 约 30+。
- 测试方式：
  - Node 直接加载 IIFE 模块（`globalThis` 全局）。
  - 浏览器测试：headless Chrome + 临时 HTML 注入。
  - 部分测试依赖 `fake-indexeddb`（Node）。
- `selftest.js`：端到端浏览器回归，覆盖 20 问、13 Agent、CSP 违规计数、i18n、研究流程等。

## 2. 本次真实重跑结果

### 2.1 P0–P4（全部通过）
| 套件 | 结果 |
|---|---|
| p0-security | 38/38 |
| p0-03 | 53/53 |
| p0-migration | 10/10 |
| p1-context / evidence-link / import-export / memory / project / resume | 51/51、33/33、46/46、61/61、40/40、42/42 |
| p2-skill-approval / contract / orchestrator / proposal / scope / usage / validation / version | 46/46、81/81、20/20、56/56、40/40、39/39、54/54、38/38 |
| p3-capability / contract / executor / integration / planning / progress / resume | 14/14、22/22、10/10、9/9、28/28、11/11、9/9 |
| p4-store / migration / event / checkpoint / recovery / idempotency / lifecycle / ui | 34/34、19/19、20/20、23/23、28/28、17/17、18/18、19/19 |
| p4-browser | 13/13（IndexedDB、刷新、检查点、恢复、幂等） |
| v1-5-idb-stress | 7/7（1000 写 2273 ms、500 删 1740 ms） |

> `p4-browser` 与 `v1-5-idb-stress` 在批处理脚本中曾显示 exit=1，原因是 PowerShell 将 Chrome 的 stderr（`DevTools listening...`）视为 NativeCommandError；单独查看输出均为 **RESULT 13/13** 与 **7/7**，测试本身通过。

### 2.2 selftest（失败）
- 无参数：**RESULT 153/156，exit=1**。
- CI 等价 `file://` 模式：**RESULT 153/156，exit=1**。
- 失败项：
  1. `i18n: 静态界面跟着切换` — 期望侧栏标题 `Chats`，实际 `科研技能`（缺英文条目）。
  2. `research produces evidence` — `rec.evidence.length = 0`。
  3. `synthesis counts evidence` — 同上，证据数为 0。

### 2.3 失败根因（已定位）
- `selftest.js` 第 229 行调用 `Research.run(...)` 时**未传 `principal`**。P0 安全改造后，`research.js` 第 605–621 行在浏览器环境要求 principal；缺失即返回 `stopReason:'denied', evidence:[]`。真实产品路径 `app.js` 第 4116/4198 行均传了 `principal`，因此**产品功能未坏，是测试用例陈旧**。
- i18n 是静态文案缺词条，属真实小缺陷。

## 3. 覆盖矩阵（摘要）
| 领域 | 覆盖 | 缺口 |
|---|---|---|
| 安全/权限 | 高 | 多标签页并发、审计日志篡改 |
| 存储/迁移 | 高 | 配额耗尽 UI 路径 |
| Skill | 高 | 语义越权对抗样例 |
| 编排/预算 | 中高 | 超时后下游继续执行的断言 |
| 恢复 | 高 | 关闭页面后「不续跑」的显式断言 |
| 天文数值 | 中 | 无岁差/行星外部星历回归 |
| UI/浏览器 | 中高 | Firefox/Safari 未覆盖 |
| 性能 | 中 | 低端设备/大数据量 |

## 4. CI 门禁
`.github/workflows/test.yml` 直接执行 `node tools/selftest.js "file://$PWD/index.html"`，**没有 `continue-on-error`**。按本次本地等价复现，该步骤会因 3 项失败而失败，说明 **main 分支当前无法通过自身 CI**（ASTRUM-001，P1）。

> 说明：未在真实 GitHub Actions 环境复跑；结论基于相同命令与相同 Chrome 行为，证据强度「高可信」。

## 5. 测试质量评价
优点：
- 阶段化命名清晰，P0–P4 与能力一一对应。
- 断言多为具体值，不是「跑通即可」。
- 浏览器测试覆盖 IndexedDB 与刷新恢复，含真实恢复语义。
- 安全测试覆盖身份注入、权限、红队场景。

不足：
- 测试与实现演进不同步（selftest research 用例）。
- 部分测试依赖本机 Chrome，环境差异大。
- 缺少天文外部基准与性能阈值门禁。
- `selftest` 输出为文本，CI 无结构化报告。

## 6. 质量评分
- 覆盖广度：优。
- 断言强度：良。
- 门禁可靠性：**差（红灯）**。
- **评分：74/100。**

## 7. 建议
1. 修复 3 项失败，恢复 CI 绿灯（P1）。
2. selftest 的 research 用例补 `principal`，并断言 `stopReason !== 'denied'`。
3. 增加「无 principal 必须 denied」的显式安全测试。
4. 增加岁差与行星外部星历基准测试。
5. 为性能设阈值并在 CI 报告数值。
