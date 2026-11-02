# ASTRUM V1.4 GitHub Actions 部署报告

> 日期：2026-11-02
> 阶段：Gate 6
> 结论：PASS。Pages Source 已切换为 GitHub Actions，构建与部署均成功。

---

## 1. Pages Source 切换

切换前（API 实测）：

```json
{ "build_type": "legacy", "source": { "branch": "main", "path": "/" }, "status": "built" }
```

执行：

```bash
gh api -X PUT repos/jiangbei0921/Astrum/pages -f build_type=workflow
```

切换后：

```json
{ "build_type": "workflow", "status": "built", "html_url": "https://jiangbei0921.github.io/Astrum/" }
```

未修改仓库其他设置，未强制推送。

> 说明：推送后 GitHub 先触发了旧的 legacy `pages build and deployment`，随后自定义 `pages` workflow 接管并完成部署。线上已验证 `tools/docs/dev/worker` 均 404。

## 2. Workflow 配置

```yaml
name: pages
on:
  workflow_run:
    workflows: [test]
    types: [completed]
    branches: [main]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: false
```

- 只部署 `main` 且 `test` 成功的提交。
- `checkout` 使用 `workflow_run.head_sha`。
- 构建命令 `node tools/build-pages.js`，上传 `_site`。
- `configure-pages@v5`、`upload-pages-artifact@v3`、`deploy-pages@v4`。
- 最小权限，无仓库写权限、无密钥。

## 3. Actions 运行记录

### 3.1 test

| 项 | 值 |
|---|---|
| Run ID | `41398644528` |
| 事件 | `push` |
| 提交 | `7e50227c97a76c41285bc2b902929bed26741487` |
| 开始 | 2026-11-02T06:14:16Z |
| 完成 | 2026-11-02T06:15:29Z |
| 结论 | **success** |
| URL | https://github.com/jiangbei0921/Astrum/actions/runs/41398644528 |

Jobs：

| Job | 结果 | 时间 |
|---|---|---|
| static | success | 06:14:19 → 06:14:45 |
| offline-core | success | 06:14:19 → 06:14:35 |
| offline-browser | success | 06:14:19 → 06:15:29 |

### 3.2 pages

| 项 | 值 |
|---|---|
| Run ID | `41398780587` |
| 事件 | `workflow_run` |
| 提交 | `7e50227c97a76c41285bc2b902929bed26741487` |
| 开始 | 2026-11-02T06:15:32Z |
| 完成 | 2026-11-02T06:16:01Z |
| 结论 | **success** |
| URL | https://github.com/jiangbei0921/Astrum/actions/runs/41398780587 |

Jobs：

| Job | 结果 | 时间 |
|---|---|---|
| build | success | 06:15:35 → 06:15:45 |
| deploy | success | 06:15:49 → 06:16:00 |

## 4. 部署产物元数据（线上）

`https://jiangbei0921.github.io/Astrum/version.json` 实测：

```json
{
  "appVersion": "4.8",
  "releaseVersion": "V1.4",
  "featureVersion": "V1.3",
  "buildMode": "static-pages",
  "deployEnv": "github-actions",
  "commit": "7e50227c97a76c41285bc2b902929bed26741487",
  "dirty": false,
  "branch": "main",
  "runId": "41398780587"
}
```

| 核对项 | 结果 |
|---|---|
| commit = 发布提交 | PASS |
| dirty = false | PASS |
| deployEnv = github-actions | PASS |
| runId = pages Run | PASS |
| 站点 URL 不变 | PASS |

## 5. 失败处理

本次无失败。若未来失败：

- 读取 Run 的 build/deploy 日志；
- 不跳过测试、不降低验收标准；
- 修复代码后重新 push，由 `test` → `pages` 自动重发；
- 回滚使用 `git revert`，不使用 force push。

## 6. 结论

Pages 已由 GitHub Actions 管理，测试门禁生效，构建与部署均成功，版本元数据与发布提交一致。

**Gate 6 结论：PASS。**
