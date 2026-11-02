# ASTRUM V1.4 部署产物清单

> 构建命令：`node tools/build-pages.js`
> 输出目录：`_site/`（已 gitignore，不进入仓库）
> 本次构建：58 个文件 / 1,661,340 B（约 1.59 MiB）
> 资源引用：54 个（53 个 JS + 1 个 CSS），全部存在且大小写一致
> 安全扫描：密钥 0 / 本地绝对路径 0
> 清单 SHA-256（按路径+文件哈希排序聚合）：`cda7f2916f61de56bee1d2f6b48659019166010d1ee81c9779386bbd27cc3f7a`
> 版本：`V1.4 / app 4.8 / commit d1eb025 / dirty=true`（本地候选标记；正式远端构建应为 `dirty=false`）

---

## 1. 部署目录结构

```
_site/
├── index.html
├── privacy.html
├── .nojekyll
├── version.json
├── assets/app.css
├── core/*.js        (45)
└── data/*.js        (8)
```

顶层白名单由 `tools/build-pages.js` 强制校验；`tools/`、`docs/`、`dev/`、`worker/`、`astrum-standalone.html` 出现即构建失败。

## 2. 根文件（4）

| 文件 | 字节 | 用途 | 必要性 | 风险 |
|---|---:|---|---|---|
| `index.html` | 31,295 | 应用入口/CSP/脚本顺序 | 必需 | CSP 已审计（Low） |
| `privacy.html` | 6,842 | 数据与隐私说明 | 必需 | 无 |
| `.nojekyll` | 0 | 关闭 Jekyll 处理 | 必需 | 无 |
| `version.json` | 454 | 版本/commit/dirty/构建环境 | 必需 | 本地候选 `dirty=true`，正式构建应清除 |

## 3. 样式（1）

| 文件 | 字节 | 用途 | 必要性 | 风险 |
|---|---:|---|---|---|
| `assets/app.css` | 137,811 | 全部界面样式 | 必需 | 无外部字体/图片 |

## 4. 运行时模块（45）

| 文件 | 字节 | 用途 | 依赖 | 风险 |
|---|---:|---|---|---|
| `core/astro.js` | 17,090 | 天文计算内核 | 无 | 无 |
| `core/runtime.js` | 5,628 | Qty/契约 | astro | 兼容字段已审计 |
| `core/task.js` | 30,209 | TaskState/Step/Event/Budget | runtime | 无 |
| `core/schema.js` | 6,494 | 参数/计划 Schema | task | 无 |
| `core/claims.js` | 33,155 | Claim/R1–R4 | task | 无 |
| `core/evidence.js` | 11,689 | Evidence 规范化/去重 | task | 无 |
| `core/fits.js` | 15,067 | FITS 零依赖解析 | — | 8 MB 附件读取上限 |
| `core/fit.js` | 5,159 | 器材匹配 | astro/runtime | 无 |
| `core/query.js` | 4,348 | 查询构造 | catalog | 无 |
| `core/agents.js` | 127,164 | 13 Agent/答案组装 | 多模块 | 旧契约保留 |
| `core/sources.js` | 66,896 | 多源检索/模型请求/缓存 | request | 外部 API 白名单 |
| `core/research.js` | 51,061 | 检索编排/证据融合 | sources | 网络失败降级 |
| `core/solarsystem.js` | 50,352 | 太阳系视图 | astro | 无 |
| `core/attachments.js` | 16,080 | 附件分类/解析 | fits/pdf | PDF 12 MB 上限 |
| `core/simbad.js` | 5,870 | SIMBAD TAP 客户端 | — | 多 host 回退 |
| `core/router.js` | 7,258 | 复杂度/模式路由 | agents | 无 |
| `core/evaluator.js` | 15,945 | Research Loop 规则 | claims/reducer | `research` 可选 |
| `core/planner.js` | 21,163 | 7 模板/重规划/expand | registry | 不新增第 8 模板 |
| `core/reducer.js` | 13,743 | 去重/冲突/报告上下文 | evidence | 无 |
| `core/report.js` | 13,248 | 研究报告结构 | claims/reducer | 摘要未读全文会标注 |
| `core/registry.js` | 23,504 | 12 工具注册表 | 工具模块 | 固定 12 工具 |
| `core/compose-adapter.js` | 13,450 | 旧 compose 兼容/研究注入 | agents | 旧 sections 不变 |
| `core/task-store.js` | 6,335 | IDB→LS→memory | task | 无 |
| `core/orchestrator.js` | 16,626 | Scheduler/Runner/取消 | registry | 预算预检 |
| `core/control.js` | 18,575 | 控制层/Research Loop | planner/evaluator | 双扣已修复 |
| `core/request.js` | 3,351 | 外部请求封装 | — | 超时/中止 |
| `core/control-bridge.js` | 4,917 | UI↔Control/模型桥 | control/sources | 云端失败分类 |
| `core/attachment-evidence.js` | 4,656 | 附件→Evidence | evidence | 失败不伪造 |
| `core/pdf-text.js` | 14,382 | PDF 文本提取 | — | 12 MB 上限 |
| `core/paper-fulltext.js` | 9,333 | arXiv 全文/分块 | request/pdf | 12 MB 上限 |
| `core/paper-attachment.js` | 4,380 | 本机 PDF→全文 Evidence | pdf-text | 12 MB 上限 |
| `core/research-ui.js` | 7,330 | 研究报告卡片 | i18n | 动态内容转义 |
| `core/adaptive.js` | 6,647 | 响应式布局 | — | 无 |
| `core/app.js` | 329,735 | UI/入口/任务恢复 | 全部运行时 | `innerHTML` 审计 Low |
| `core/profile.js` | 4,059 | 档案隔离 | — | localStorage |
| `core/i18n.js` | 14,653 | 国际化核心 | — | 英文 0 残留 |
| `core/i18n.en-answer.js` | 8,990 | 英文答案词条 | i18n | 无 |
| `core/i18n.en-content.js` | 15,020 | 英文内容词条 | i18n | 无 |
| `core/i18n.en-extra.js` | 17,407 | 英文扩展词条 | i18n | 无 |
| `core/i18n.en-settings.js` | 11,651 | 英文设置词条 | i18n | 无 |
| `core/store.js` | 12,528 | 对话线程存储 | profile | localStorage/IDB |
| `core/thread.js` | 5,210 | 线程/会话 | store | 无 |
| `core/topics.js` | 6,880 | 专题内容 | — | 无 |
| `core/geosearch.js` | 25,133 | 地理搜索 | request | 外部 API |
| `core/weather.js` | 6,396 | 天气缓存/判断 | request | 30 分钟 TTL |

> 校验：45 行，无重复；与 `_site/core` 实际文件数一致。

## 5. 数据模块（8）

| 文件 | 字节 | 用途 | 风险 |
|---|---:|---|---|
| `data/catalog.js` | 21,001 | 深空天体目录 | 无 |
| `data/knowledge.js` | 246,815 | 知识库 | 无 |
| `data/places.js` | 56,886 | 地点/时区 | 无 |
| `data/bodies.js` | 12,178 | 太阳系天体 | 无 |
| `data/solarsystem.js` | 12,601 | 太阳系数据 | 无 |
| `data/obsplan.js` | 3,648 | 观测计划模板 | 无 |
| `data/gear.js` | 3,222 | 器材库 | 无 |
| `data/daily.js` | 19,820 | 每日前沿（每日 CI 更新） | 本地版本落后 origin/main 1 次提交 |

## 6. 不进入部署、但应进入 Git 仓库

| 类别 | 内容 |
|---|---|
| 测试 | `tools/*.js`（40 个文件，含 fixture） |
| 文档 | `docs/*.md`、`docs/architecture/*.md`、`docs/release/*.md` |
| CI | `.github/workflows/test.yml`、`network.yml`、`pages.yml`、`daily.yml` |
| 开发辅助 | `dev/`（gitignore，本地调试，不入库） |
| 单文件版 | `astrum-standalone.html`（gitignore，不部署） |
| 可选代理 | `worker/cors-proxy.js`（不加载、不部署） |
| 根说明 | `README.md`（不部署） |

## 7. 部署产物验收

| 检查 | 结果 |
|---|---|
| `node tools/build-pages.js` | PASS，58 文件 / 1,661,340 B |
| 资源引用存在/大小写 | PASS，54/54 |
| 顶层白名单 | PASS |
| 不含 tools/docs/dev/worker/standalone | PASS |
| 密钥扫描 | 0 |
| 本地绝对路径扫描 | 0 |
| 子路径 `/Astrum/` HTTP + Chrome | `v1-4-pages-test` 32/32 |
| CSP 违规 | 0（selftest） |
| PDF 限制 | 12 MB；>12 MB 拒绝且不冒充成功 |
| 版本信息 | `releaseVersion=V1.4`、`featureVersion=V1.3`、`appVersion=4.8`、`dirty=true`（本地候选） |

## 8. 结论

部署清单完整、白名单隔离生效、无敏感信息。正式发布时必须由 GitHub Actions 在干净提交上重建 `_site`，使 `version.json` 的 `commit` 等于目标 SHA 且 `dirty=false`；当前本地 `_site` 仅作为 RC 候选产物，不得直接上传为正式站点。
