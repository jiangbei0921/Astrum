# ASTRUM V1.4 正式发布总结

> 日期：2026-11-02
> 最终状态：**ASTRUM V1.4：RELEASED**
> 发布提交：`7e50227c97a76c41285bc2b902929bed26741487`
> 站点：https://jiangbei0921.github.io/Astrum/

---

## 1. 发布结果

| 项 | 结果 |
|---|---|
| Git main 与远端同步 | PASS（本地/远端均为 `7e50227`，0/0） |
| 普通推送 | PASS（`git push` 返回 `Everything up-to-date`；未 force push） |
| test workflow | PASS（Run `41398644528`，static/offline-core/offline-browser 全成功） |
| pages workflow | PASS（Run `41398780587`，build/deploy 全成功） |
| Pages Source | **GitHub Actions**（`build_type=workflow`） |
| 线上 `version.json` | `commit=7e50227`、`dirty=false`、`deployEnv=github-actions` |
| 线上 URL | 可访问，子路径资源正常 |
| 安全 | 无 Critical/High；1 项 innerHTML 加固 |

## 2. 发布内容

- 包含：V1–V1.4 架构、V1.5 Research Loop/Claims/Reducer 稳定性修复、资源/缓存/长跑测试、部署与 CI 配置、发布文档。
- 部署产物：58 文件 / 约 1.66 MB；仅 `index.html`、`privacy.html`、`.nojekyll`、`version.json`、`assets/`、`core/`、`data/`。
- 不部署：`tools/`、`docs/`、`dev/`、`worker/`、`astrum-standalone.html`、`_site/`。
- 线上已验证 `tools/docs/dev/worker` 均 404。

## 3. 验收矩阵

| 项 | 状态 |
|---|---|
| 本地审计 | PASS |
| 安全审计与修复 | PASS |
| 远端整合 | PASS |
| Node 全量回归 | PASS |
| Chrome 全量回归 | PASS |
| 构建 | PASS |
| 子路径 | PASS |
| 部署产物安全扫描 | PASS |
| Actions 构建 | PASS |
| Actions 部署 | PASS |
| 线上首页/13 Agent | PASS |
| 线上核心问答 | PASS |
| 线上 XSS 文本化 | PASS |
| 线上 PDF ≤12 MB / >12 MB | PASS |
| 线上 FITS | PASS |
| 真实云端 Provider | NOT_TESTED（已披露，不冒充） |
| 线上 30/60/180 长跑 | NOT_TESTED（本地证据） |

## 4. 最终 13 条成功标准

1. 本地/远端整合：PASS
2. 必要修改已提交：PASS
3. main 推送：PASS
4. 无敏感文件进入远端：PASS（密钥 0，文档路径已脱敏）
5. Pages 切换 Actions：PASS
6. Actions 构建：PASS
7. Actions 部署：PASS
8. 正式 URL：PASS
9. 子路径资源：PASS
10. 核心功能线上验收：PASS
11. 无 Critical/High：PASS
12. PDF/FITS 限制一致：PASS
13. 最终报告完整：PASS（本目录 7 份）

## 5. 剩余风险与限制

| # | 项 | 等级 | 说明 |
|---|---|---|---|
| 1 | 用户 API Key 明文存 localStorage | Low | 隐私页披露、可清除、导出排除；纯静态无法防御同源 XSS |
| 2 | `app.js` 静态/转义 `innerHTML` 未全量重构 | Low | 外部研究内容已走 `textContent`；建议后续统一 |
| 3 | 真实云端 Provider 未验证 | 信息 | 无 API Key；V1.4 发布不依赖；V1.6/后续验证 |
| 4 | 线上长跑未重跑 | 信息 | 本地 30/60/180 完成；线上仅功能验收 |
| 5 | 推送后 legacy workflow 曾短暂部署根目录 | 信息 | 推送后旧 legacy workflow 先运行，随后 Actions 接管；线上开发文件已 404，无真实密钥 |

## 6. 发布后操作

- 回滚：`git revert 7e50227`（或指定提交）→ push → test 通过后 pages 自动重发；不使用 force push。
- 监控：Actions `test` / `pages` 两个 workflow；`version.json` 核对 commit/dirty/runId。
- 后续验证：真实云端 Provider、线上长跑、195+ 常驻监听器精确计数。

## 7. 最终状态

```text
ASTRUM V1.4：RELEASED
Commit: 7e50227c97a76c41285bc2b902929bed26741487
Test Run: 41398644528
Pages Run: 41398780587
URL: https://jiangbei0921.github.io/Astrum/
```
