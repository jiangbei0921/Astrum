# ASTRUM 回滚与紧急下线演练报告

> 日期：2026-11-02
> 线上版本：`8e9c242`（Pages Actions，Run 41407223033）
> 回滚目标：`7e50227`（V1.4 正式发布提交）
> 演练类型：隔离 worktree + 本地 HTTP；未触碰正式 Pages

---

## 1. 回滚准备

| 项 | 实际 |
|---|---|
| 线上部署方式 | GitHub Actions `pages` workflow，上传 `_site` artifact |
| 最近稳定版本 | `7e50227`（V1.4 正式发布，test/pages 均成功） |
| 当前版本 | `8e9c242`（合并 daily + 遗留补齐） |
| 构建产物 | `_site`：58 文件 / 1,669,660 B（`7e50227` 回滚构建） |
| 资源引用 | 54/54 存在，大小写一致 |
| 密钥/绝对路径 | 0 / 0 |
| 回滚方式 | 以 `7e50227` 重建并部署；或 `git revert` 后由 test→pages 自动重发 |

## 2. 隔离演练结果

| 步骤 | 操作 | 结果 |
|---|---|---|
| 1 | `git worktree add --detach <temp> 7e50227` | PASS |
| 2 | 在 worktree 执行 `node tools/build-pages.js` | PASS：58 文件 / 1,669,660 B / commit 7e50227 / dirty=false |
| 3 | 本地 8099 启动静态服务，访问 `/` | PASS：HTTP 200 |
| 4 | 读取 `version.json` | PASS：commit `7e50227c97a76c41285bc2b902929bed26741487` |
| 5 | 读取 `core/app.js`、`assets/app.css` | PASS：HTTP 200 |
| 6 | 停止服务模拟部署失败 | PASS：请求失败（DOWN） |
| 7 | 重新启动同一构建 | PASS：HTTP 200，版本仍 7e50227 |
| 8 | 删除临时 worktree | 完成；未影响主工作区 |

补充：13 Agent 名册不变由 `v1-1-browser` 27/27 与发布期线上浏览器验证覆盖；隔离静态服务未另起浏览器。

## 3. 正式回滚流程（需授权）

1. 确认目标提交与当前线上 `version.json`。
2. 在本地 `git revert <变更提交>`（不使用 force push）。
3. push `main`；等待 `test` 成功。
4. 等待 `pages` 成功，核对 `version.json` 的 commit/dirty/runId。
5. 访问首页、13 Agent、核心问答、CSS/JS、`version.json`。
6. 记录 Run ID、commit、时间与结果。
7. 若回滚失败，重复第 2–6 步；不得强推。

## 4. 紧急下线手册

| 项 | 内容 |
|---|---|
| 触发条件 | 严重安全漏洞、部署产物污染、关键功能不可用、错误版本公开 |
| 操作权限 | 仓库 admin / Pages 管理权限 |
| 首选步骤 | Settings → Pages → 取消当前部署或临时禁用 Pages；或 revert 后停止 pages workflow |
| 影响范围 | 公网站点不可访问；GitHub 仓库与源码不受影响 |
| 恢复方法 | 修复后重新启用 Pages / 重跑 `pages` workflow；核对 `version.json` |
| 验收 | 首页 200、13 Agent、核心问答、资源 200、开发文件 404 |

## 5. 结论

- 隔离回滚：**PASS**（旧版本可构建、可访问、停服后可恢复）。
- 正式线上回滚/下线：**BLOCKED_AUTHORIZATION**（会产生服务中断，需单独确认）。
- 本演练未修改正式 GitHub Pages、未修改远端分支。
