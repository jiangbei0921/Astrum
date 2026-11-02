# ASTRUM V1.4 线上正式发布验收报告

> 日期：2026-11-02
> 阶段：Gate 7
> 站点：`https://jiangbei0921.github.io/Astrum/`
> 结论：**PASS（ASTRUM V1.4 正式发布成功）**

---

## 1. 发布身份

| 项 | 值 |
|---|---|
| Git 提交 | `7e50227c97a76c41285bc2b902929bed26741487` |
| 分支 | `main` |
| test Run | `41398644528`（success） |
| pages Run | `41398780587`（success） |
| 部署环境 | `github-actions` |
| `dirty` | `false` |
| 站点 URL | https://jiangbei0921.github.io/Astrum/ |

## 2. HTTP 与资源

| 路径 | 状态 | 大小 |
|---|---|---:|
| `/Astrum/` | 200 | 30,752 B |
| `/Astrum/version.json` | 200 | 473 B |
| `/Astrum/assets/app.css` | 200 | 134,905 B |
| `/Astrum/core/app.js` | 200 | 322,661 B |
| `/Astrum/tools/task-test.js` | 404 | — |
| `/Astrum/docs/release/...md` | 404 | — |
| `/Astrum/dev/p0-browser-probe.js` | 404 | — |
| `/Astrum/worker/cors-proxy.js` | 404 | — |

> 开发文件已被 Actions 白名单隔离，未公开。

## 3. 真实浏览器验收

使用真实 Chrome（browser automation）访问线上 URL：

| 检查 | 结果 | 证据 |
|---|---|---|
| 首页打开 | PASS | 标题「ASTRUM · 天文多智能体工作台」 |
| 布局/样式 | PASS | 三栏布局、主视觉、导航完整 |
| CSS/JS 加载 | PASS | `app.css`、core/data 50+ 脚本全部成功，无 404 |
| 13 Agent | PASS | Muse、Vega、Cosmos、Kepler、Horizon、Orion、Lyra、Nova、Helios、Scholar、Critic、Curator、Navigator |
| 控制台错误 | PASS | `Console messages: (none)` |
| CSP 违规 | PASS | 无 securitypolicyviolation / 无控制台 CSP 消息 |
| 核心问答 | PASS | 输入「现在的 M42 是什么」→ 答案含「检索过程 · 7 步」「观测延伸」「可视化」「评审结论」 |
| XSS 文本化 | PASS | 输入 `<img src=x onerror=alert(1)>` → 页面按纯文本显示，未生成 img，未弹窗，无脚本执行 |
| 二次提问控制台 | PASS | 仍无错误 |

## 4. 线上运行时探针（Chrome CDP）

对线上页面执行只读探针：

| 项 | 结果 |
|---|---|
| AstroControl | loaded |
| AstroPlanner | loaded |
| AstroEvaluator | loaded |
| AstroReducer | loaded |
| AstroClaims | loaded |
| AstroRegistry | loaded |
| AstroTaskStore | loaded |
| AstroResearchUI | loaded |
| Registry SPECS | 12 |
| PDF 10 MB 解析 | `ok=true`，提取 200,000 字符（达到 `maxChars` 上限） |
| PDF 13 MB | `ok=false`，`pdf_too_large` |
| FITS 合成文件 | `ok=true`，1 HDU |

> 线上 PDF ≤12 MB 与 >12 MB 行为与本地测试一致；未宣传支持 200 MB PDF。
> `AgentCore.agentList()` 未导出，探针返回 -1；13 Agent 已由真实浏览器页面列表验证。

## 5. 安全验证

| 项 | 结果 |
|---|---|
| CSP meta 实际生效 | PASS（无违规） |
| API Key 进入日志/错误 | 未发现（Console 无输出） |
| 不可信 HTML 执行 | 未执行（纯文本） |
| 外部资源异常 | 无 |
| 敏感信息暴露 | `tools/docs/dev/worker` 404 |

## 6. 功能边界

| 项 | 线上结果 |
|---|---|
| L1/L2/L3/L4 控制链路 | 页面初始化与核心问答通过 |
| Research Loop / Claims / Reducer / Evaluator | 模块全部加载；本地 29/29 + 48/48 |
| IndexedDB/TaskStore | 模块加载；本地/浏览器 7/7、17/17 |
| FITS | 线上解析通过 |
| PDF | 10 MB 通过；>12 MB 拒绝 |
| 真实云端 Provider | **NOT_TESTED**（无 API Key，未冒充） |
| 30/60/180 长跑 | 本地离线证据；线上未重跑 |

## 7. 控制台/网络异常

- 控制台消息：无。
- 加载 404：无。
- CSP 违规：无。
- 未处理异常：未观察到。

## 8. 验收结论

| 条件 | 状态 |
|---|---|
| 正式 URL 可访问 | PASS |
| 子路径资源加载 | PASS |
| 13 Agent 渲染 | PASS |
| 核心问答 | PASS |
| 安全（CSP/XSS/隔离） | PASS |
| PDF/FITS 限制一致 | PASS |
| Actions 构建/部署 | PASS |
| 真实云端 Provider | NOT_TESTED（已披露） |

**Gate 7 结论：PASS（V1.4 正式发布线上验收通过）。**
