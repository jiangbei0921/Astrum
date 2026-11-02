# ASTRUM V1.4 最终构建与部署产物报告

> 日期：2026-11-02
> 阶段：Gate 4 / Gate 5
> 结论：PASS。本地与 Actions 构建均成功，部署目录与白名单一致。

---

## 1. 本地最终构建

```powershell
node tools/build-standalone.js
node tools/build-pages.js
node tools/v1-4-pages-test.js
```

| 项 | 结果 |
|---|---|
| standalone | 53 个内联脚本 / CSS 124 KB / 1,597 KB |
| `_site` 文件 | 58（core 45 / data 8 / assets 1 / root 4） |
| `_site` 体积 | 1,661,670 B |
| 资源引用 | 54（53 JS + 1 CSS），全部存在且大小写一致 |
| 顶层白名单 | PASS |
| 不含 tools/docs/dev/worker/standalone | PASS |
| 密钥扫描 | 0 |
| 本地绝对路径扫描 | 0 |
| 子路径 `/Astrum/` | `v1-4-pages-test` 32/32 |
| 清单 SHA-256 | `e23befa82b5c0322e194ccf3192e1866841d8707846b5e56111e5df893b898a4` |

本地 `version.json`（候选）：

```json
{ "releaseVersion":"V1.4", "featureVersion":"V1.3", "appVersion":"4.8",
  "commit":"8e7e9b3", "dirty":true, "deployEnv":"local" }
```

> 本地 dirty 是工作区未提交状态；正式发布由 Actions 在干净提交上重建。

## 2. Actions 正式构建产物

| 项 | 值 |
|---|---|
| 提交 | `7e50227c97a76c41285bc2b902929bed26741487` |
| 构建模式 | `static-pages` |
| 部署环境 | `github-actions` |
| `dirty` | `false` |
| 文件数 | 58 |
| 体积 | 约 1.66 MB（与本地同代码构建基本一致；`version.json` 增加 `runId` 字段，字节数略有差异） |
| 资源引用 | 54/54 |
| 安全扫描 | 密钥 0 / 绝对路径 0 |

## 3. 部署目录清单

```
index.html
privacy.html
.nojekyll
version.json
assets/app.css
core/*.js   (45)
data/*.js   (8)
```

完整逐文件清单见 `ASTRUM-V1.4-部署产物清单.md`。

## 4. 子路径兼容

| 检查 | 结果 |
|---|---|
| `/Astrum/` 首页 | 200 |
| `assets/app.css` | 200，MIME 正确 |
| `core/*.js` | 全部 200 |
| `privacy.html` | 200 |
| `.nojekyll` / `version.json` | 200 |
| `/tools/`、`/docs/`、`/dev/`、`/worker/` | 404 |
| Chrome 子路径模块加载 | 25/25 |
| 13 Agent 渲染 | PASS |
| 控制台加载/CSP 错误 | 0 |

## 5. PDF / FITS 能力边界

| 类型 | 结果 | 发布口径 |
|---|---|---|
| FITS 10/50/100/200 MB | 本地解析通过 | 支持大文件头/采样解析，不承诺全量像素 |
| PDF 10 MB | 本地与线上解析通过（200,000 字符上限） | 支持 ≤12 MB |
| PDF 50/100/200 MB | `pdf_too_large` | **不得宣传支持 200 MB PDF** |
| 超限行为 | 明确错误、不冒充成功、不崩溃 | PASS |

## 6. 结论

构建产物完整、白名单隔离生效、子路径兼容、安全扫描通过；Actions 重建的 `version.json` 为 `dirty=false` 且 commit 与发布提交一致。

**Gate 4 / Gate 5 构建部分：PASS。**
