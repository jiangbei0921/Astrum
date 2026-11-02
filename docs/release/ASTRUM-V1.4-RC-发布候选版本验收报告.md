# ASTRUM V1.4 RC 发布候选版本验收报告

> 日期：2026-11-02
> 仓库：`jiangbei0921/Astrum`　分支：`main`　HEAD：`d1eb025`
> 候选名称：**ASTRUM V1.4 RC**（仅本地候选，未创建 Tag/Release，未部署）
> 最终状态：**ASTRUM V1.4 RC READY（本地候选就绪） / 正式发布 NOT READY（等待授权与远端验证）**

---

## 1. 结论摘要

| 维度 | 状态 | 依据 |
|---|---|---|
| 本地功能与回归 | PASS | Gate 1—Gate 5 全量测试通过 |
| 构建与部署产物 | PASS | 58 文件 / 1,661,340 B；密钥 0 / 绝对路径 0 |
| 子路径 `/Astrum/` | PASS | `v1-4-pages-test` 32/32 |
| 安全审计 | PASS | 无 Critical/High；2 项 Low |
| 缓存/资源/长跑 | PASS | 30m/60m/180m；LR-03 采样 178/180 |
| Git 可发布状态 | FAIL | 13 修改 + 116 未跟踪文件未提交；本地落后 origin/main 1 提交 |
| Pages 发布方式 | FAIL/BLOCKED | 仍为 legacy main/root；Actions 未接管 |
| 远端 CI/Pages/线上 | NOT_TESTED | 未提交、未推送、未部署 |
| 真实云端 Provider | NOT_TESTED | 无 API Key；不冒充已验证 |
| **V1.4 RC 本地候选** | **READY** | 上述本地项全部通过 |
| **V1.4 正式发布** | **NOT READY** | 需授权完成提交/推送/Pages 切换/远端验证 |

## 2. 审计范围与实测数据

| 项 | 实测 |
|---|---|
| 已跟踪修改 | 13 |
| 未跟踪条目（审计前，默认 status） | 106（104 文件 + 2 目录项） |
| 未跟踪真实文件（审计前展开） | 111 |
| 本次生成审计文档 | 5（`docs/release/`） |
| 审计后未跟踪真实文件 | 116（默认 status 条目 107） |
| 删除 | 0 |
| 冲突/合并中 | 0 |
| origin/main | `8e7e9b3`（领先本地 1 个 `data/daily.js` 提交） |

## 3. 构建与部署验证

```powershell
node tools/build-pages.js
node tools/build-standalone.js
node tools/v1-4-pages-test.js
```

实测：

| 检查 | 结果 |
|---|---|
| `_site` 文件数 | 58（core 45 / data 8 / assets 1 / 根 4） |
| `_site` 体积 | 1,661,340 B |
| 资源引用 | 54/54 存在且大小写一致 |
| 顶层白名单 | 通过（无 tools/docs/dev/worker/standalone） |
| 密钥/绝对路径扫描 | 0 / 0 |
| standalone | 53 内联脚本 / 1,597 KB |
| 子路径 HTTP + Chrome | 32/32；13 Agent、25 模块、CSP 无违规 |
| 版本元数据 | `releaseVersion=V1.4`、`featureVersion=V1.3`、`appVersion=4.8`、`commit=d1eb025`、`dirty=true` |

## 4. PDF / FITS 能力边界

| 类型 | 能力 | 发布说明 |
|---|---|---|
| FITS | 10/50/100/200 MB 解析通过；附件读取上限 8 MB | 可宣传“支持大文件头/采样解析”，不承诺全量像素 |
| PDF | 10 MB 解析通过；50/100/200 MB 返回 `pdf_too_large` | **只能宣传 12 MB 上限**，不得宣传支持 200 MB PDF |
| 超限行为 | 明确错误码/中文提示，不当作成功 | PASS |

## 5. 安全审计（详见独立报告）

| 项 | 状态 |
|---|---|
| 真实密钥/Token/私钥 | PASS（0） |
| 发布目录敏感信息 | PASS（0） |
| CSP | PASS（无 unsafe-eval/通配符） |
| DOM 注入 | PASS（研究内容转义 + 链接协议白名单 + 浏览器断言） |
| 外部 CDN/第三方依赖 | PASS（0） |
| 用户 API Key | Low（localStorage 明文，隐私页已披露） |
| `innerHTML` 残留 | Low（未统一 sanitizer，当前路径已转义） |
| 阻塞项 | **0 Critical / 0 High** |

## 6. 最终十问

1. **当前是否具备 V1.4 发布条件？**
   本地技术条件 PASS（RC READY）；正式发布 NOT READY：代码未提交、Pages 仍 legacy、远端 CI/部署/线上验证未执行。

2. **哪些文件必须进入正式部署？**
   `_site` 白名单 58 文件：`index.html`、`privacy.html`、`.nojekyll`、`version.json`、`assets/app.css`、`core/*.js`（45）、`data/*.js`（8）。完整清单见 `ASTRUM-V1.4-部署产物清单.md`。

3. **哪些文件只进入 Git 仓库？**
   `tools/*`（40）、`docs/*`（41 + 本次 5）、`.github/workflows/*`（4）、`README.md`、`worker/*`；以及 gitignore 的 `dev/`、`astrum-standalone.html`、`_site/` 不入库。

4. **哪些仅供内部留档？**
   `docs/logs/longrun-LR-01/02/03` 与 3 个 SMOKE 日志；大型测试数据 `tools/fixtures/p0-03-baseline.json`。

5. **是否存在安全风险？**
   无阻塞风险；Low：localStorage 明文密钥、`innerHTML` 未统一 sanitizer。Informational：内部文档绝对路径、`style-src unsafe-inline`。

6. **构建产物是否完整？**
   PASS：58/58 文件、54/54 引用、白名单隔离、CSP 兼容、子路径 32/32。

7. **子路径部署是否通过？**
   PASS：本地 `/Astrum/` 前缀 HTTP + Chrome 32/32；线上 Pages 未部署，NOT_TESTED。

8. **是否建议切换 Actions？**
   是。Legacy 根目录会公开 tools/docs/worker；Actions 白名单+测试门禁+版本元数据，且 URL 不变。

9. **发布前还缺少哪些工作？**
   - 整合 `origin/main` 的 `data/daily.js` 提交；
   - 提交 13 个修改 + 116 个未跟踪文件（`git status --untracked-files=all` 口径）；
   - 推送 main 并让远端 `test` 三层通过；
   - Settings → Pages 切换 GitHub Actions；
   - 触发 `pages` 部署并核对 `version.json`（commit 目标 SHA、`dirty=false`、`deployEnv=github-actions`）；
   - 线上 §G 功能验证与回滚演练；
   - 发布说明披露真实云端 Provider 未验证。

10. **正式发布需要用户授权哪些操作？**
   - `git add` / `git commit`（含合并 origin/main）；
   - `git push origin main`（普通推送，非强推）；
   - 仓库 Settings → Pages Source 改为 GitHub Actions；
   - 允许 `test` / `pages` workflow 运行与部署；
   - 如需版本标记，另行授权创建本地/远程 Tag 或 GitHub Release（本次未做）。

## 7. 授权后建议顺序

1. `git fetch origin`（只读）。
2. 将 `origin/main` 的 `8e7e9b3` 整合到本地（merge 或 rebase，需明确选择；不得 force push）。
3. 复审 `data/daily.js` 冲突（仅该文件）。
4. `git add` 指定 13 个修改 + 116 个未跟踪文件（以 `--untracked-files=all` 实际列表为准）。
5. `git commit`（建议 `release: ASTRUM V1.4 RC`）。
6. `git push origin main`。
7. 观察 `test` workflow；记录 Run ID/SHA/结果。
8. Settings → Pages → Source = GitHub Actions。
9. 等待 `pages` workflow；核对线上 `version.json` 与 URL。
10. 执行线上功能清单；更新线上验证报告。

## 8. 最终状态

```text
ASTRUM V1.4 RC: READY（本地候选，构建/安全/回归/子路径均通过）
ASTRUM V1.4 正式发布: NOT READY（等待 Git 写授权、Pages 切换与远端验证）
```

> 本次未执行任何 `git add/commit/push/merge/rebase/reset/clean`，未修改 Pages 设置，未创建 Tag/Release，未部署。所有文件保留在原工作区。
