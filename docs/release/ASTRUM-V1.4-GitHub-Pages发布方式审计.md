# ASTRUM V1.4 GitHub Pages 发布方式审计

> 审计日期：2026-11-02
> 仓库：`jiangbei0921/Astrum`
> 方式：GitHub API 只读查询 + 本地 workflow 文件核对
> 未修改任何远端设置、未触发部署

---

## 1. 当前远端事实

`gh api repos/jiangbei0921/Astrum/pages` 实测：

```json
{
  "status": "built",
  "html_url": "https://jiangbei0921.github.io/Astrum/",
  "build_type": "legacy",
  "source": { "branch": "main", "path": "/" },
  "https_enforced": true,
  "public": true
}
```

| 项 | 实测 | 判定 |
|---|---|---|
| Pages 发布方式 | `legacy` | 非 Actions |
| 发布源 | `main` / `/`（仓库根目录） | 开发文件会公开 |
| 站点 | `https://jiangbei0921.github.io/Astrum/` | 子路径 |
| 自定义域名 | 无 | 不适用 |
| HTTPS | 强制 | PASS |
| `pages.yml` 远端状态 | 远端 workflow 列表只有 daily / test / `pages-build-deployment`，**没有自定义 pages workflow** | 文件仅本地未跟踪 |
| 远端 Pages 运行记录 | 无自定义 workflow Run（API 404） | 未部署 |
| 远端 test workflow | 存在（历史配置），不是本地新版三层结构 | 本地未推送 |

远端 workflow 列表（API 实测）：

```
daily-frontier        .github/workflows/daily.yml
test                  .github/workflows/test.yml
pages-build-deployment dynamic/pages/pages-build-deployment
```

> 结论：不能因为本地存在 `pages.yml` 就认为 Actions 已接管；实际仍是 legacy branch。

## 2. 两种方式比较

| 维度 | Legacy branch（现状） | GitHub Actions（本地已准备） |
|---|---|---|
| 部署目录控制 | 只能选择分支 + 目录（当前 `/` 根目录） | `_site/` 白名单，精确控制 |
| 文件隔离 | 差：`tools/`、`docs/`、`worker/`、`README.md` 等会随仓库公开 | 好：只上传 `_site/`，开发文件不公开 |
| 构建自动化 | 无（直接发布仓库内容） | `build-pages.js` 构建、扫描、写 `version.json` |
| 版本元数据 | 无 `version.json`（根目录没有该文件） | 每次生成 commit/dirty/buildTime/deployEnv |
| 测试门禁 | 无（legacy 发布不依赖 test） | `workflow_run` 仅在 test 成功后部署 |
| 安全性 | 低（测试脚本/内部文档/开发配置暴露） | 高（白名单 + 密钥/绝对路径扫描） |
| 回滚 | `git revert` 后自动重发 | 同样 `git revert`；或手动重跑 workflow |
| 维护成本 | 低但不可控 | 中：需维护 test/pages 两个 workflow |
| 子路径兼容 | 支持 | 支持（本地 `/Astrum/` 32/32 验证） |
| 当前项目适配性 | 不适配（仓库含大量开发资料） | 适配（`_site` 已稳定构建） |
| 权限要求 | 仓库写权限 | `pages:write` + `id-token:write` + Pages Source=Actions |
| 现有 URL 影响 | 不变 | 不变（同一 `github.io/Astrum/`） |

## 3. Legacy 暴露面评估

若直接把当前工作区提交并推送到 `main`，legacy 根目录发布会公开（取决于提交内容）：

| 内容 | 是否会被公开 | 风险 |
|---|---|---|
| `index.html`、`privacy.html`、`assets/`、`core/`、`data/` | 是 | 预期 |
| `tools/`（40 个测试/构建脚本） | 是 | 内部实现、测试数据、基线文件公开 |
| `docs/`（47 份架构/验收文档） | 是 | 内部路径、测试细节公开 |
| `worker/cors-proxy.js` | 是 | 可选代理示例公开 |
| `README.md` | 是 | 无敏感，但非站点内容 |
| `dev/` | 否（gitignore） | 不在仓库 |
| `astrum-standalone.html` | 否（gitignore） | 不公开 |
| `_site/` | 否（gitignore） | 不公开 |
| `.github/` | 通常不作为站点内容 | 低 |

## 4. Actions 方案评估

本地 `pages.yml` 已具备：

- `workflow_run` 依赖 `test` 成功，分支 `main`；
- 支持 `workflow_dispatch` 手动重发；
- `permissions: contents: read / pages: write / id-token: write`；
- `concurrency: pages`，不取消进行中的部署；
- `checkout` 使用 `workflow_run.head_sha`，保证与测试同一提交；
- `node tools/build-pages.js` 生成 `_site`；
- `actions/configure-pages@v5`（`enablement: true`）、`upload-pages-artifact@v3`、`deploy-pages@v4`；
- 站点 URL 不变。

本地等价验证：

- `node tools/build-pages.js`：58 文件 / 1,661,340 B，密钥 0，绝对路径 0；
- `node tools/v1-4-pages-test.js`：32/32（`/Astrum/` 子路径 HTTP + Chrome，13 Agent、25 模块、CSP 无错误）。

限制：`pages.yml` 目前未提交，远端不存在；Pages Source 仍为 legacy。必须获得授权后才能提交/推送并切换。

## 5. 建议

**推荐方式 B：GitHub Actions。** 理由：

1. 仓库包含 40 个测试脚本、47 份内部文档、可选 worker，legacy 根目录发布会全部公开。
2. Actions 已实现白名单、构建扫描、版本元数据与测试门禁，且本地 32/32 验证通过。
3. 站点 URL 不变，子路径兼容已验证。
4. 回滚仍可用 `git revert` + 自动重发，不增加运维后端。

不建议继续 legacy。

## 6. 授权后执行清单（本次不执行）

1. 获得 Git 写授权：提交 13 个修改 + 116 个未跟踪文件（含本次 5 份审计文档）。
2. 先整合 `origin/main` 的 `8e7e9b3`（daily 数据），避免发布旧 daily。
3. 推送 `main`，观察 `test` 三层 workflow，记录 Run ID / SHA / 结果。
4. 在仓库 Settings → Pages 将 Source 切为 **GitHub Actions**（需管理员权限）。
5. 等待 `pages` workflow，记录部署 Run 与 URL。
6. 核对线上 `version.json`：`commit`=目标 SHA、`dirty=false`、`deployEnv=github-actions`。
7. 按 V1.4 发布检查清单 §G 做线上功能验证。
8. 更新 `docs/architecture/V1.4-线上验证报告.md`。

## 7. Gate 4 结论

| 检查 | 状态 |
|---|---|
| Pages 当前方式已核实 | PASS（legacy main/root） |
| `pages.yml` 本地完整性 | PASS |
| 远端 Actions 已接管 | FAIL（未切换、workflow 未提交） |
| Legacy 暴露面可控 | FAIL（根目录发布） |
| Actions 子路径兼容 | PASS（本地 32/32） |
| 建议 | 切换 GitHub Actions；**BLOCKED 等待授权** |

**Gate 4 结论：PARTIAL / BLOCKED。** 审计完成，但不能在未授权下切换或部署。
