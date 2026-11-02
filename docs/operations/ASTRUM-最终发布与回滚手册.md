# ASTRUM 最终发布与回滚手册

> 日期：2026-11-02
> 仓库：`jiangbei0921/Astrum`，分支 `main`
> 线上：`https://jiangbei0921.github.io/Astrum/`
> Pages Source：GitHub Actions（`build_type=workflow`）
> 原则：不强制推送、不 `reset --hard`、不 `clean -fd`、不覆盖他人提交、不擅自关闭正式服务

---

## 1. 当前发布信息（推送后回填）

| 项 | 值 |
|---|---|
| 最新功能提交 | 待回填 |
| test Workflow | 待回填 |
| pages Workflow | 待回填 |
| 线上 `version.json.commit` | 待回填 |
| 线上 `dirty` | 待回填 |
| Pages Source | `build_type=workflow` |
| 本地/远端 | 待回填（应一致） |

历史发布：`7e50227`（V1.4 首次 Actions 发布）、`5aa644a`（V1.5 浏览器/回滚补齐）。

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
</content>
