# ASTRUM 最终发布与回滚手册

> 日期：2026-11-02
> 仓库：`jiangbei0921/Astrum`，分支 `main`
> 线上：`https://jiangbei0921.github.io/Astrum/`
> Pages Source：GitHub Actions（`build_type=workflow`）
> 原则：不强制推送、不 `reset --hard`、不 `clean -fd`、不覆盖他人提交、不擅自关闭正式服务

---

## 1. 当前发布信息

| 项 | 值 |
|---|---|
| 最新功能提交 | `0640f6f6b0afb796df19951ecbea25a4f3ca87bc`（V1.9 科研强化 + 日常数据合并） |
| test Workflow | `41603946113` success |
| pages Workflow | `41604395159` success |
| 线上 `version.json.commit` | `0640f6f` |
| 线上 `dirty` | false |
| Pages Source | `build_type=workflow` |
| 本地/远端 | 一致 `0640f6f` |
| 线上验收 | 帮助页反馈、主动提示、回答反馈、诊断科研字段、路由修复、console/CSP 全 PASS（27/27） |

历史发布：`7e50227`（V1.4 首次 Actions 发布）、`5aa644a`（V1.5 浏览器/回滚补齐）、`9eb0439`（V1.7 研究质量/基准）、`66bfdb6`（defer 并行加载）、`e0e7842`（Pages-only defer 与 CI 等待修复）。

## 2. 发布流程（正常）

### 2.1 发布前

```powershell
git status --short
git diff --stat
git log --oneline -3
```

确认：

- 无未提交的无关文件；
- 无 Key/绝对路径/样本版权文件；
- `node tools/v1-4-ci-test.js` 通过；
- 本地全量测试通过（见 `ASTRUM-全量测试与线上验收报告.md`）。

### 2.2 构建与安全检查

```powershell
node tools/sync-csp-hash.js
node tools/build-standalone.js
node tools/build-pages.js
node tools/v1-4-pages-test.js
```

`build-pages` 必须输出：文件白名单、密钥 0、绝对路径 0、版本元数据。

### 2.3 提交与推送

```powershell
git add <明确文件列表>
git commit -m "feat: ..."
git fetch git@github.com:jiangbei0921/Astrum.git main
git merge --no-edit git@github.com:jiangbei0921/Astrum.git/main   # 如远端有新提交
git push git@github.com:jiangbei0921/Astrum.git main
```

禁止 `git push --force`。若远端有新提交，先 fetch + merge，不覆盖。

### 2.4 Actions

- `test` workflow：static → offline-core → offline-browser 全部成功。
- `pages` workflow：只在 test 成功后触发，从同一 commit 构建 `_site` 并部署。
- 记录 Run ID、commit、耗时。

### 2.5 线上验收

```powershell
curl.exe -I https://jiangbei0921.github.io/Astrum/
curl.exe -s https://jiangbei0921.github.io/Astrum/version.json
```

浏览器验证：

- 首页 200、13 Agent 渲染；
- 核心问答、Research、论文全文、附件上传；
- console 无严重错误、CSP 0 违规；
- `tools/`、`docs/` 404；
- `version.json.commit` 等于部署 commit，`dirty=false`；
- 不是旧缓存版本（硬刷新/无痕窗口复核）。

## 3. 回滚流程

### 3.1 回滚到上一个成功 commit（推荐）

1. 确定目标 commit：上一个 `version.json.commit` 或已知成功发布提交。
2. 确认目标 commit 在 `main` 历史中，且 `test`/`pages` 曾成功。
3. 在本地干净工作区构建目标版本（隔离 worktree，避免动当前工作区）：

```powershell
git worktree add ..\astrum-rollback <目标commit>
Push-Location ..\astrum-rollback
node tools/build-pages.js
Pop-Location
```

4. 方案 A（Git 回滚提交，可追溯）：

```powershell
git revert --no-commit <目标commit>..HEAD
git commit -m "revert: rollback to <目标commit>"
git push git@github.com:jiangbei0921/Astrum.git main
```

> 不使用 `reset --hard`；`revert` 保留历史，CI 重新构建并部署。

5. 方案 B（紧急重发历史 artifact）：在 GitHub Actions 选择 `pages` workflow 的 `workflow_dispatch`，指定目标 commit（需仓库权限与 Pages 环境授权）。

6. 回滚后验收：同 §2.5，且 `version.json.commit` 等于目标 commit。

### 3.2 回滚到最近一次成功 Pages artifact

- GitHub → Actions → `pages` → 选择成功 Run → Re-run all jobs（从同一 commit 重建）。
- 适用于构建脚本/依赖临时故障，不改变源码历史。

### 3.3 回滚失败处理

- 检查 `pages` workflow 日志：构建、`configure-pages`、`upload-pages-artifact`、`deploy-pages`。
- 检查 Pages Source 是否仍为 GitHub Actions。
- 检查 artifact 是否包含 `index.html`、`version.json`、`core/*.js`。
- 若 Pages 平台故障，保留仓库源码与 artifact，不删除历史；在状态说明中标记 `BLOCKED_PLATFORM`。

## 4. 紧急下线

> 正式下线属于不可逆/影响线上用户的操作，必须获得单独授权。以下为已准备步骤，未在本轮执行。

### 4.1 立即停止对外服务

1. GitHub → Settings → Pages → Source：
   - 切回 `Deploy from a branch` 并选择一个空分支/占位目录，或
   - 在组织允许时禁用 Pages。
2. 或在仓库根添加占位 `index.html`（仅维护页），通过正常提交发布，覆盖旧入口。
3. 保留 `version.json` 与发布 artifact，便于恢复。

### 4.2 恢复

1. Pages Source 切回 GitHub Actions。
2. 重新运行最近一次成功的 `pages` workflow（或 `workflow_dispatch` 指定 commit）。
3. 按 §2.5 验证；确认 `version.json.commit` 与目标一致。

### 4.3 缓存与 Service Worker

- 当前应用**没有注册 Service Worker**；不存在 SW 缓存新旧混用。
- Pages 静态资源由浏览器 HTTP 缓存控制；`version.json` 用于校验版本。
- 回滚后建议用户硬刷新（Ctrl+F5）或无痕窗口验证；CDN 边缘缓存通常在分钟级收敛。
- 不在本仓库引入 SW；如下一轮需要离线能力，必须先做版本失效/回滚设计。

## 5. 隔离演练记录

见 `docs/operations/ASTRUM-回滚与紧急下线演练报告.md`：

- 目标版本 `7e50227`；
- 隔离 worktree 构建 58 文件 / 1,669,660 B；
- 首页/version/app/css 200；
- 停服 DOWN；
- 重启恢复 200；
- 正式回滚/下线 `BLOCKED_AUTHORIZATION`。

## 6. 发布检查清单

- [ ] 工作区干净，无未提交无关文件
- [ ] 无 Key/凭据/绝对路径
- [ ] Node/Chrome 全量通过
- [ ] `_site` 白名单 58 文件
- [ ] `version.json` commit/dirty 正确
- [ ] test/pages Workflow 成功
- [ ] 线上首页 200
- [ ] `version.json.commit` 等于部署 commit
- [ ] 13 Agent/核心问答/Research/全文/附件可用
- [ ] console 无严重错误，CSP 0 违规
- [ ] tools/docs 404
- [ ] 回滚目标 commit 已记录

## 7. V1.7 真实科研能力发布（2026-11-02）

### 7.1 发布前新增命令

```powershell
node tools/v1-7-research-benchmark.js --offline
node tools/v1-7-research-benchmark.js --json
node tools/v1-3-paper-fulltext-test.js
node tools/v1-5-longrun-test.js --minutes=3 --label=LR-V17
node tools/v1-5-bigfile-test.js
```

基准结果写入 `tools/fixtures/research-benchmark-results.json`，随代码提交；不要把运行时缓存、临时 HTML 或调试脚本提交。

### 7.2 发布记录（推送后回填）

| 项 | 值 |
|---|---|
| 功能提交 | `e0e7842ce288ad1231ccb57d970578ff61fec241` |
| test Workflow | `41571532062` |
| pages Workflow | `41571802143` |
| 线上 `version.json.commit` | `e0e7842` |
| 线上 `dirty` | false |
| 线上验收 | 首页 200、13 Agent、木星直径 139,820 km、M31/M33 对比两目标、首屏 3.07s、console/CSP、tools/docs 404 |

### 7.3 回滚

V1.7 仍使用 §3.1 的标准回滚：回滚到上一个成功 Pages 的 commit，重新触发 test/pages；不使用 `reset --hard`、不 force push。回滚前记录目标 commit 与本次 Run ID。

### 7.4 V1.8 发布记录（2026-11-03）

| 项 | 值 |
|---|---|
| 功能提交 | `55fe9dba161eba8da1ffa7dd43f17eea94d127dc` |
| test Workflow | `41588104481` success（static / offline-core / offline-browser） |
| pages Workflow | `41588501459` success |
| 线上 `version.json.commit` | `55fe9db` |
| 线上 `dirty` | false |
| 线上 `runId` | `41588501459` |
| 新增 CI 步骤 | `V1.8 反馈核心 v1-8-feedback-test`、`V1.8 反馈浏览器 v1-8-feedback-browser-test` |
| 线上验收 | 24/24；帮助入口、主动提示、回答入口、确认页、复制/下载、无 JS/CSP 错误 |
| 回滚 | 若反馈模块导致线上异常，回滚到 `0110626`（V1.7 文档提交，功能等价 `e0e7842`），重新触发 test/pages；不使用 force push / reset --hard |

发布前检查（V1.8 增补）：

1. `node tools/v1-8-feedback-test.js` 149/149；
2. `node tools/v1-8-feedback-browser-test.js` 49/49；
3. `node tools/i18n-scan.js --quiet --max=0`；
4. `node tools/v1-2-deploy-test.js`、`v1-4-ci-test.js`、`csptest.js`；
5. `sync-csp-hash` / `build-standalone` / `build-pages`，确认 `_site/core/feedback.js` 存在、密钥 0、绝对路径 0；
6. 线上确认 `version.json.commit` 为本次提交，三入口与“不自动发送”提示可见。

### 7.5 V1.9 发布记录（2026-11-03）

| 项 | 值 |
|---|---|
| 功能提交 | `9e6d99b`（真实 Provider 验收 + M13/多轮修复） |
| 合并日常数据 | `0640f6f` |
| test Workflow | `41626577600` success（static / offline-core / offline-browser） |
| pages Workflow | `41627103167` success |
| 线上 `version.json.commit` | `9e6d99b` |
| 线上 `dirty` | false |
| 新增 CI 步骤 | V1.9 反馈诊断、独立盲测离线、Provider 验证（CI 无 Key 接受 exit 2）、研究目标消歧 |
| 线上验收 | 27/27；反馈三入口、研究路由、诊断科研字段、console/CSP |
| 回滚 | 若 V1.9 出问题，回滚到 `0d0d444`（V1.8 文档提交）或 `55fe9db`；正常提交 + 重新触发 test/pages，不使用 force push / reset --hard |

V1.9 发布前检查：

1. `node tools/v1-9-provider-test.js`（CI 无 Key 时 exit 2，不得当 PASS；真实验收用本机 `ASTRUM_LIVE_KEY_FILE` 临时文件，禁止把 Key 写入命令、日志或仓库）；
2. `node tools/v1-9-real-provider-integration-test.js`（需真实 Key；验证 M13 科研链路与同 Thread 多轮）；
3. `node tools/v1-9-research-target-test.js`（离线，M13 消歧 + 多轮指代）；
4. `node tools/v1-9-blind-research-benchmark.js --offline`；有网络时执行全量；
5. `node tools/v1-9-real-pdf-test.js`（样本缺失时 BLOCKED_SAMPLE）；
6. `node tools/v1-9-e2e-test.js`；
7. `node tools/v1-9-feedback-diagnostic-test.js`；
8. 全量 Node/Chrome/静态/i18n；
9. `build-pages` 安全扫描密钥 0、绝对路径 0。

### 7.6 V1.10 发布记录（2026-11-03）

| 项 | 值 |
|---|---|
| 功能提交 | `2aef15d`（回答整合/来源路由/动态国际化） |
| 兼容性修复 | `323f934`（研究面板兼容 + 监听器泄漏修复） |
| test Workflow | `41642206695` success |
| pages Workflow | `41642780392` success |
| 线上 `version.json` | app 4.9、feature V1.10、commit `323f934`、dirty=false、runId `41642780392` |
| 新增 CI 步骤 | V1.10 回答整合、来源路由、动态国际化、集成 |
| 线上验收 | 中英文论文卡片/来源/分析 17/17；反馈与诊断 27/27 |
| 回滚 | 若 V1.10 出问题，回滚到 `04a37df`（V1.9 文档提交）；正常提交 + 重新触发 test/pages，不使用 force push / reset --hard |

V1.10 发布前检查：

1. `node tools/v1-10-answer-composer-test.js`；
2. `node tools/v1-10-knowledge-sources-test.js`；
3. `node tools/v1-10-content-i18n-test.js`；
4. `node tools/v1-10-integration-test.js`；
5. 原有 V1.7–V1.9 测试与浏览器/静态/i18n；
6. 真实 Provider 可用时，在设置页配置后验证中文论文卡片与缓存，再复跑真实科研表述；
7. `build-pages` 安全扫描密钥 0、绝对路径 0。
