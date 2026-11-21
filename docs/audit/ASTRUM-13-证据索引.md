# ASTRUM-13 证据索引

## 1. 审计环境
| 项 | 值 |
|---|---|
| 仓库 | `D:\Projects\Astrum` |
| 分支 | `main` |
| HEAD | `bb2e497 feat(p4): TaskStore v2、事件/检查点持久化与按幂等性恢复` |
| 远程 | `git@github.com:zhangmuchangqing/Astrum.git` |
| 初始工作区 | 干净 |
| Node | v24.19.0 |
| 浏览器 | 本机 Chrome（headless），版本由 `p4-browser-test` 输出 DevTools 端点确认 |
| 审计日期 | 2026-11-21 |

## 2. 执行的命令与结果

### 2.1 P0–P4 套件（逐项）
```
p0-03-test.js                  RESULT 53/53
p0-migration-test.js           RESULT 10/10
p0-security-test.js            RESULT 38/38
p1-context-test.js             RESULT 51/51
p1-evidence-link-test.js       RESULT 33/33
p1-import-export-test.js       RESULT 46/46
p1-memory-test.js              RESULT 61/61
p1-project-test.js             RESULT 40/40
p1-resume-test.js              RESULT 42/42
p2-skill-approval-test.js      RESULT 46/46
p2-skill-contract-test.js      RESULT 81/81
p2-skill-orchestrator-test.js  RESULT 20/20
p2-skill-proposal-test.js      RESULT 56/56
p2-skill-scope-test.js         RESULT 40/40
p2-skill-usage-test.js         RESULT 39/39
p2-skill-validation-test.js    RESULT 54/54
p2-skill-version-test.js       RESULT 38/38
p3-capability-test.js          RESULT 14/14
p3-contract-test.js            RESULT 22/22
p3-executor-test.js            RESULT 10/10
p3-integration-test.js         RESULT 9/9
p3-planning-test.js            RESULT 28/28
p3-progress-test.js            RESULT 11/11
p3-resume-test.js              RESULT 9/9
p4-checkpoint-test.js          RESULT 23/23
p4-event-test.js               RESULT 20/20
p4-idempotency-test.js         RESULT 17/17
p4-lifecycle-test.js           RESULT 18/18
p4-migration-test.js           RESULT 19/19
p4-recovery-test.js            RESULT 28/28
p4-store-test.js               RESULT 34/34
p4-ui-test.js                  RESULT 19/19
p4-browser-test.js             RESULT 13/13
v1-5-idb-stress-test.js        RESULT 7/7
v1-5-perf-test.js              PERF_JSON（见 ASTRUM-09）
```

### 2.2 selftest
```
node tools/selftest.js
RESULT 153/156   exit=1

node tools/selftest.js "file://D:/Projects/Astrum/index.html"
RESULT 153/156   exit=1
FAIL | i18n: 静态界面跟着切换 | 科研技能
FAIL | research produces evidence | n=0
FAIL | synthesis counts evidence | n=0
```

## 3. 独立天文验证
脚本：临时工作区 `audit/astro-verify.js`（未进入仓库），`require('D:/Projects/Astrum/core/astro.js')` 后直接调用。
对照基准与结果见 `ASTRUM-04` 第 4 节。关键参考：
- Meeus, *Astronomical Algorithms*, 2nd ed., Example 12.a（GMST）、Example 47.a（月球）。
- 地球近日点 0.9833 AU / 远日点 1.0167 AU（公开天文常数）。
- 2024 春分时刻（公开历表）。

## 4. 关键代码证据

### 4.1 安全
| 主题 | 位置 |
|---|---|
| 唯一授权入口 | `core/security.js` `authorize()` |
| 能力表 | `core/security.js` `CAPABILITIES`（第 16 行起） |
| 身份构造 | `core/security.js` `makePrincipal()` |
| 上下文一致性 | `core/profile-context.js` `sameSession()` |
| 工具参数守卫 | `core/tool-gateway.js` `FORBIDDEN_ARGS` / `call()` |
| 分库命名空间 | `core/store.js` `Profile.ns('astrum')`（第 20–24 行） |
| Skill 执行校验 | `core/skill-runtime.js` `resolveScope()` / `execute()`（第 38–90、199–229 行） |
| Skill 静态校验 | `core/skill-validator.js`（第 99–152 行） |
| CSP | `index.html` 第 8 行 |
| CORS Worker | `worker/cors-proxy.js`（第 19–59 行） |
| 审计日志上限 | `core/audit-log.js` 第 12 行 `MAX = 1000` |

### 4.2 执行与恢复
| 主题 | 位置 |
|---|---|
| 计划模板 | `core/planner.js` `chooseTemplate()` / `BUILDERS`（第 190–311 行） |
| DAG 校验 | `core/dag-validator.js` `parallelConflicts()`（第 38–62 行） |
| 调度 | `core/orchestrator.js` `nextBatch()` / `executeOne()`（第 36–127、330–483 行） |
| 恢复决策 | `core/recovery.js` `decide()` / `plan()` / `apply()`（第 255–357 行） |
| 状态机/预算 | `core/task.js` `LEGAL_TRANSITIONS`（第 53 行）、`BUDGET_LIMITS`（第 43 行） |
| P4 存储 | `core/task-store.js`（save/load/list/events/checkpoints/revision/STALE_WRITE） |
| 控制 | `core/control.js` `run()` / `pause()` / `resume()` |
| 桥接 | `core/control-bridge.js` `runWithRoute()` / `resume()` |

### 4.3 天文
| 主题 | 位置 |
|---|---|
| 坐标/时间 | `core/astro.js`（`eclToEq` 46–62、`moon` 99–133、`lstHours`/`altAz` 227–242） |
| 银河/UV | `core/sky-viewmodel.js`（42–80、86–181） |
| 背景采样 | `core/sky-background.js`（108–153） |
| 银河构建 | `tools/build-milkyway-bg.js`（52–67、133–158） |
| 星表来源 | `data/sky-stars-l1.js`（1–22 行，count=9096） |
| 银河元数据 | `assets/sky/milkyway/metadata.json` |
| 行星纹理声明 | `core/planet-textures.js` 头部注释 |
| 星座连线声明 | `data/catalog.js` 头部（第 4 行） |

### 4.4 Agent / 科研
| 主题 | 位置 |
|---|---|
| Agent 定义 | `core/agents.js`（175–285 行，13 个 id） |
| 意图识别 | `core/agents.js` `detectIntent()`（457–480 行） |
| 检索授权 | `core/research.js` `run()`（602–621 行） |
| 证据收尾 | `core/research.js` `finish()` / `statusOf()`（772–806 行） |
| Claim 合成 | `core/claims.js` `buildClaimsFromEvidence`（约 700 行） |
| Claim 判定 | `core/claims.js` `judgeClaim`（四维） |
| 前端研究调用（传 principal） | `core/app.js` 第 4116–4121、4198–4201 行 |

### 4.5 测试失败用例
| 主题 | 位置 |
|---|---|
| research 用例未传 principal | `tools/selftest.js` 第 229–232 行 |
| i18n 侧栏断言 | `tools/selftest.js` 第 644–647 行 |
| CI selftest 步骤 | `.github/workflows/test.yml`（`node tools/selftest.js "file://$PWD/index.html"`） |

## 5. 数据与文件清点
- 受版本控制文件：458。
- `core/*.js`：76。
- `tools/*`：171（测试 + fixture + 构建/同步脚本）。
- `docs/`：185。
- `data/`：11。
- `index.html` 脚本标签：90（含 2 个内联脚本，CSP 以 sha256 放行）。

## 6. 未执行/待验证清单
1. 真实第三方 API 全量联调（无用户 Key）。
2. 真实 GitHub Actions 环境复跑（仅本地等价命令）。
3. 行星位置外部星历逐日对照（无 Horizons 数据）。
4. Firefox / Safari / 移动端兼容。
5. 低端设备性能。
6. 大规模附件/长任务资源上限。
7. 提示注入对抗测试。

## 7. 审计期间 Git 变化
- 开始：`git status --porcelain` 为空；HEAD `bb2e497`。
- 结束：仅新增 `docs/audit/` 下本组报告（未跟踪）；无源码/测试/配置改动；无 commit/push/分支/部署。
- 测试临时产物已由测试清理，未进入仓库。

## 8. 复现方式
```bash
cd D:/Projects/Astrum
node tools/selftest.js "file://$PWD/index.html"
node tools/p0-security-test.js
node tools/p4-browser-test.js
node tools/v1-5-perf-test.js
# 天文独立验证（脚本在临时工作区，不随仓库分发）
node audit/astro-verify.js
```
