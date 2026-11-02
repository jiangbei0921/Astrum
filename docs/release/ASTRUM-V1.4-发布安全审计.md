# ASTRUM V1.4 发布安全审计

> 审计日期：2026-11-02
> 范围：仓库源码、配置、测试、文档、构建产物 `_site/`
> 方法：静态模式扫描 + 上下文人工判断 + 浏览器 CSP/回归测试证据
> 结论：**未发现 Critical/High 阻塞项；存在 2 项 Low 风险与若干 Informational 记录。**

---

## 1. 敏感信息扫描

### 1.1 扫描规则

```text
sk-[A-Za-z0-9_-]{20,} / ghp_[A-Za-z0-9]{20,} / github_pat_[A-Za-z0-9_]{20,}
AIza[0-9A-Za-z_-]{30,} / AKIA[0-9A-Z]{16} / xox[baprs]-...
-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY
Bearer [A-Za-z0-9._-]{20,}
```

### 1.2 扫描结果

| 命中位置 | 内容 | 判定 |
|---|---|---|
| `tools/build-pages.js:30` | 扫描器自身的 `github_pat_` 正则 | 非密钥，Informational |
| `docs/architecture/V1.4-Pages部署规范.md:174` | 说明扫描规则 | 非密钥，Informational |
| `docs/architecture/V1.4-架构更新.md:73` | 说明扫描规则 | 非密钥，Informational |
| `core/`、`data/`、`index.html`、`privacy.html`、`assets/` | 0 命中 | PASS |
| `_site/` 构建产物 | 构建器扫描：**密钥 0，本地绝对路径 0** | PASS |

### 1.3 凭据处理方式

- 项目不内置任何厂商密钥。
- 用户自行填写的 API Key 存于浏览器 `localStorage`（`astrum.sources.v1`），不上传、不进入构建。
- `privacy.html` 已明确披露“密钥以明文形式存放于本地，请勿在公共设备填写”。
- GitHub Actions 未引用 `secrets.*`；`pages.yml` 仅使用官方要求的 `pages:write` 与 `id-token:write`。

风险等级：**Low（设计如此且有隐私披露，非发布阻塞）**。

## 2. 本地绝对路径

| 范围 | 结果 |
|---|---|
| `core/`、`data/`、`assets/`、`index.html`、`privacy.html` | 0 命中 |
| `_site/` 构建产物 | 0 命中（构建器强制校验） |
| `tools/` | 0 命中 |
| `docs/` | 历史文档中本地绝对路径已脱敏为“项目工作区”；不进入部署 |

风险等级：**Informational（仅内部文档，不公开部署）**。

## 3. CSP 检查

`index.html:8` 的 CSP：

- `default-src 'self'`
- `script-src 'self'` + 2 个内联脚本 SHA-256，无 `unsafe-inline`、无 `unsafe-eval`
- `style-src 'self' 'unsafe-inline'`（内联样式所需）
- `img-src 'self' data: blob:`
- `connect-src` 为显式主机白名单（模型厂商、NASA、OpenAlex、Semantic Scholar、Wikimedia、IP/地理/天气、SIMBAD、arXiv、Open-Meteo），无 `*`
- `object-src 'none'`、`base-uri 'self'`、`form-action 'none'`、`frame-ancestors 'none'`

实测：

- `selftest.js`：CSP 违规 **0**。
- `csptest.js`：6/6。
- `v1-4-pages-test.js` H1.14：控制台无加载/CSP 错误。

风险等级：**Low**（`style-src 'unsafe-inline'` 为样式需求；无脚本注入放宽）。

## 4. DOM 注入与外部内容

| 检查 | 结果 |
|---|---|
| `core/app.js` `innerHTML` 出现次数 | 124 处，绝大多数为本地静态模板 / 已转义内容 |
| `core/research-ui.js` | 3 处 `innerHTML`，动态内容全部经 `esc()`（`& < > " '`） |
| 外链协议 | `safeHttp()` 只允许 `http(s)`；`target=_blank` + `rel=noopener noreferrer` |
| 浏览器验证 | `v1-1-browser-test` U13–U16：仅 http(s)、noopener、外部 HTML 被转义、摘要仅标记 |
| `eval` / `new Function` / `document.write` | 0 命中 |

风险等级：**Low**。未引入正式 HTML sanitizer，属长期改进项；当前外部研究内容路径有转义与协议白名单，并有浏览器断言覆盖。

## 5. 外部资源与第三方依赖

| 项 | 结果 |
|---|---|
| 外部脚本 / CDN | 0；所有 `<script src>` 均为相对 `core/`、`data/` |
| 外部样式 / 字体 | 0；`assets/app.css` 本地，字体为系统字体 |
| 外部图片 | 无；favicon 为 data URI |
| npm / package.json | 不存在，零依赖 |
| Worker | `worker/cors-proxy.js` 为可选示例，不被 `index.html` 加载，不进入部署 |
| 外部 API | 绝对 https，按 CSP `connect-src` 白名单；断网时降级为本地/旧链路 |

风险等级：**Informational（零依赖、无 CDN 单点）**。

## 6. 用户输入与文件解析

| 面 | 检查结果 | 风险 |
|---|---|---|
| 问答输入 | `String` 归一、模板渲染转义；无 `eval` | Low |
| 附件类型 | 扩展名 + MIME 分类；未知类型不解析 | Low |
| FITS | 完整读取上限 8 MB；截断有警告；非法头明确失败；不抛未捕获异常 | Low |
| PDF | 上限 12 MB；`pdf_too_large` / `not_pdf` / `pdf_encrypted` / `pdf_empty` 分类；失败不生成全文证据 | Low |
| 大文件 | FITS 10/50/100/200 MB 通过；PDF 50/100/200 MB 按上限拒绝 | PASS |
| Blob URL | 3 处创建/3 处释放；研究面板路径 0 创建 | PASS |
| 本地存储 | 设置/对话/任务/缓存/密钥；隐私页披露删除方式；无服务端上传 | Low |

## 7. 发现的问题

| # | 问题 | 等级 | 是否阻塞发布 | 建议 |
|---|---|---|---|---|
| 1 | 用户 API Key 以明文存 localStorage | Low | 否 | 保持隐私披露；未来可评估 WebCrypto 封装 |
| 2 | `app.js` 大量 `innerHTML`，未统一 sanitizer | Low | 否 | 后续将动态片段统一走 `esc()`/DOM API |
| 3 | 文档含本地绝对路径 | Informational | 否 | 不部署 docs；无需处理 |
| 4 | `style-src 'unsafe-inline'` | Low | 否 | 现有内联样式需要；可后续提取 |
| 5 | 无真实云端 Provider 验证 | Informational | 否（V1.4 发布范围） | 发布说明披露；V1.6/后续单独验证 |

未发现：真实密钥、私钥、Token、Cookie、Authorization 硬编码、内部服务地址、测试账号、用户隐私数据外泄。

## 8. 安全结论

| 项 | 状态 |
|---|---|
| 敏感信息 | PASS（0 真实密钥） |
| 发布目录扫描 | PASS（密钥 0 / 绝对路径 0） |
| CSP | PASS |
| DOM 注入 | PASS（有转义与浏览器断言；Low 改进项） |
| 外部资源 | PASS（零 CDN） |
| 第三方依赖 | PASS（零依赖） |
| 文件解析 | PASS（上限/失败分类/大文件测试） |
| Critical/High 阻塞 | **0** |

**Gate 2 结论：PASS（无阻塞发布的安全问题）。**
