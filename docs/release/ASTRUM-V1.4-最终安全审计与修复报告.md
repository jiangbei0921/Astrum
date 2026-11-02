# ASTRUM V1.4 最终安全审计与修复报告

> 日期：2026-11-02
> 阶段：Gate 2
> 结论：**无 Critical/High 阻塞项；完成 1 项实际代码加固；2 项 Low 风险保留并披露。**

---

## 1. API Key 全链路审计

```text
设置界面输入（type=password）
  → Sources.conf(id).key
  → localStorage `astrum.sources.v1`（仅本机）
  → 请求头 x-api-key / x-goog-api-key / Authorization: Bearer
  → 目标 Provider 官方域名（CSP connect-src 显式白名单）
```

| 问题 | 实测 | 判定 |
|---|---|---|
| 保存位置 | `localStorage['astrum.sources.v1'].config[id].key` | 已知设计 |
| 是否明文 | 是 | Low（隐私页已披露） |
| 是否重复写 IndexedDB | 否；IDB 仅 TaskState/Thread | PASS |
| 是否进入 URL | 否；请求 URL 不含 key | PASS |
| 是否进入日志 | 否；控制台无 key 输出 | PASS |
| 是否进入错误信息 | 否；只输出错误分类/厂商消息 | PASS |
| 是否被导出 | 否；导出配置显式排除密钥，检测到 key 字段会中止 | PASS |
| 是否发送非预期域名 | 否；按 Provider 端点发送，CSP 限制 | PASS |
| 删除后副本 | UI“清除”删除 config.key；localStorage 单副本 | PASS |
| 必要传递 | 仅请求头；无查询参数/无跨模块冗余传递 | PASS |

结论：浏览器端加密无法抵御同源 XSS，项目未虚假宣传“加密存储”；当前采用“仅本机 + 明示风险 + 可清除 + 导出排除”的最小方案。风险等级 **Low**，不阻塞发布。

## 2. innerHTML / XSS 全链路审计与修复

### 2.1 修复前

`core/research-ui.js` 对外部数据使用 2 处动态 `innerHTML`：

- 论文/观测/结论行：拼接 `esc(name/meta/text)`
- 报告摘要：拼接 `esc(L(...))`

虽然 `esc()` 覆盖 `& < > " '`，但属于字符串拼接 HTML，缺少结构化保证。

### 2.2 修复内容

`core/research-ui.js`：

- 新增 `textNode(tag, cls, text)`，使用 DOM `textContent`。
- `rows()` 改为 `createElement + textContent`，论文标题/摘要/结论不再进入 `innerHTML`。
- 报告摘要改为三个 `span` 文本节点。
- 外链继续 `safeHttp()` 协议白名单 + `rel=noopener noreferrer`。

修复后该文件仅剩 `node(tag, cls, html)` 对**本地静态/已转义片段**使用 `innerHTML`；外部数据路径为 0 处。

### 2.3 新增测试

`tools/v1-5-resource-test.js` 报告 fixture 注入：

```html
<img src=x onerror="window.__v15xss=1">
<svg onload="window.__v15xss=2"></svg>
javascript:alert(1)
```

断言：

| 断言 | 结果 |
|---|---|
| 恶意 HTML 不生成 img/script/svg/iframe 节点 | PASS（injected=0） |
| 恶意 onerror/onload 不执行 | PASS（xss=0） |
| 不可信内容按纯文本呈现 | PASS（literal=20/20） |
| DOM/Listener/Blob/Timer 仍无泄漏 | PASS |

测试结果：`RESULT 13/13`。

### 2.4 剩余范围

- `core/app.js` 仍有 124 处 `innerHTML`，绝大多数为本地静态模板/已转义片段；本轮未做全量重构，避免发布前大规模改动。
- 风险等级 **Low**；已有浏览器断言覆盖研究报告外部内容与 XSS 字符串。
- 建议后续将动态片段统一迁移到 `textContent`/DOM API。

## 3. 组合攻击链判断

```text
不可信外部内容 → 动态 HTML → XSS → 读取 localStorage → API Key
```

- 修复前：Research UI 外部内容已 `esc()`，但依赖字符串拼接正确性。
- 修复后：外部内容走 `textContent`，该路径不成立。
- `app.js` 其他 `innerHTML` 若未来接入不可信外部字符串，仍可能形成组合风险；当前外部内容入口已收敛。
- **未宣称曾发生密钥泄漏。**

## 4. CSP / 外部资源 / 依赖

| 项 | 结果 |
|---|---|
| `script-src` | `'self'` + 2 个 SHA-256，无 `unsafe-inline`、无 `unsafe-eval` |
| `object-src` | `none` |
| `frame-ancestors` | `none` |
| `connect-src` | 显式主机白名单，无通配符 |
| 外部脚本/CDN | 0 |
| npm 依赖 | 0 |
| Worker | 可选示例，不加载、不部署 |
| Blob URL | 3 创建 / 3 释放；面板路径 0 |
| Timer | 全项目 0 个 `setInterval`；关键异步路径 `clearTimeout` |

## 5. 文件解析安全

| 面 | 结果 |
|---|---|
| FITS | 附件读取上限 8 MB；非法/截断明确失败；大文件 10–200 MB 本地通过 |
| PDF | 12 MB 上限；`pdf_too_large` / `not_pdf` / `pdf_encrypted` / `pdf_empty`；超限不伪造成功 |
| 线上 PDF | 10 MB 解析成功（200,000 字符）；13 MB 返回 `pdf_too_large` |
| 线上 FITS | 合成 FITS 解析成功（1 HDU） |

## 6. Git 历史密钥扫描

- 历史提交 108 个。
- 扫描 `sk-`、`ghp_`、`github_pat_`、`AIza`、`AKIA`、Slack、私钥块。
- 命中仅为：扫描器正则本身、安全文档中的规则说明、历史 base64 图片数据中的偶然字符串。
- 未发现真实 API Key / Token / 私钥进入历史。
- 暂存内容复扫：无真实密钥、无本地绝对路径（文档内路径已脱敏）。

## 7. 结论

| 等级 | 数量 | 事项 |
|---|---:|---|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 2 | localStorage 明文密钥（设计+披露）、app.js 静态/转义 innerHTML 未全量重构 |
| Informational | 3 | 文档路径已脱敏、style-src inline、真实云端 Provider 未验证 |

**Gate 2 结论：PASS（无阻塞发布的安全问题；1 项代码加固已测试通过）。**
