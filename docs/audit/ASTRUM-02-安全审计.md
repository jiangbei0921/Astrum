# ASTRUM-02 安全审计

> 审计边界说明：ASTRUM 是纯静态浏览器应用，无服务端。本文区分「浏览器端真实风险」与「服务端概念（如 SSRF）」。所有结论标注证据强度。

## 1. 威胁模型
1. 恶意网页/第三方脚本通过 XSS 读取本地数据或 API Key。
2. 同一浏览器其他使用者切换档案读取数据。
3. 恶意 Skill 越权调用工具或执行代码。
4. 被篡改的检查点/任务记录绕过权限或造成错误恢复。
5. 部署侧：GitHub Actions 权限、CSP 缺口、CORS Worker 被滥用。
6. 外部内容（论文标题/摘要、网页、模型输出）注入恶意标记或提示。

## 2. 身份与隔离

### 2.1 已证实的防护
- `Security.makePrincipal()` 的 `profileId`/`sessionId` 来自 `ProfileContext.current()`，而非调用参数。
- `Security.authorize()` 统一校验：principal 完整性、`principal.profileId === sessionId 对应档案`、会话一致性、角色/用户策略、能力是否实现且授予、`ownerProfileId`、`projectId`。
- `ToolGateway` 拒绝参数中出现 `profileId/projectId/principal/sessionId/ownerProfileId`（`tool-gateway.js` 参数守卫），阻断「传参伪造身份」路径。
- `TaskStore` 以 `Profile.ns('astrum')` 分库，并在读取时按 `ownerProfileId` 过滤；恢复前 `Recovery.validate/apply` 重新校验 principal 与 Skill 版本。
- `SkillRuntime.resolveScope()` 校验 `skill.profileId === principal.profileId`，并校验项目、发布状态、Agent 白名单、所需能力与工具权限。

### 2.2 风险
| 编号 | 结论 | 等级 | 证据 |
|---|---|---|---|
| ASTRUM-007 | 档案隔离是数据分区，不是安全边界。无登录/口令；任何能操作该浏览器的人可切换档案查看数据。 | P2（已证实，属设计边界） | `profile.js`、`store.js`、`profile-context.js` |
| — | API Key 以明文存 localStorage。 | P3（已证实，已在隐私页披露） | `privacy.html` 第 84 行；`sources.js` 读取 |
| — | `AuditLog` 为本地 1000 条环形日志，无哈希链，可被同源脚本篡改/清空。 | P3（已证实） | `audit-log.js` MAX=1000，无 hash/prev 字段 |

> 结论：在「单用户本地应用」威胁模型下，上述不构成认证绕过；但**不能宣称多用户安全隔离**。

## 3. XSS 与渲染

### 3.1 检查方法
搜索全部 `innerHTML` / `outerHTML` / `insertAdjacentHTML` / `document.write` / `eval` / `new Function` / 内联事件属性，逐个追踪数据来源。

### 3.2 结果
- **未发现 `eval` / `new Function` / `document.write`。**
- `esc()` 覆盖 `& < > " '` 五类字符（`app.js` 内 `function esc`）。主要 `innerHTML` 拼接点（答案、证据、任务列表、Skill 列表、附件、报告）均使用 `esc()` 或 `textContent`。
- 抽查高风险点：搜索结果卡片、论文标题/摘要、模型输出、任务/事件列表、Skill 记录、附件缩略图，均未见未转义直插。
- 图片缩略图使用 `data:` URL 放入 `<img src>`，不会执行 SVG 内脚本（`<img>` 上下文）。
- **潜在风险（P3）**：若未来新增渲染路径遗漏 `esc()`，CSP `script-src 'self'` + hash 可阻止内联脚本执行，但 `img-src data: blob:` 与 `style-src 'unsafe-inline'` 仍允许数据外带与样式注入。

**结论：未发现可利用 XSS（已证实通过代码审查；未做模糊测试）。**

## 4. Skill 安全

### 4.1 已证实防护
- 仅执行 `published` 版本（`skill-runtime.js` `execute()` → `store.getPublished()`）。
- 校验档案、项目、Agent 白名单、`requiredCapabilities`、`requiredTools`。
- `skill-validator.js` 静态检测动态代码模式、禁止工具、越权字段、能力授予、提示注入与外部 URL。
- 步骤参数再次检查 `FORBIDDEN_ARGS`，防止 Skill 通过参数越权。
- 无 `eval`，Skill 不是可执行代码而是声明式步骤。

### 4.2 风险
- 校验器是**静态规则**，无法证明覆盖所有语义越权；若 Skill 组合合法工具产生非预期副作用，仍可能通过。等级 P3（潜在），需持续补充规则与对抗样例。
- 版本内容可被本地篡改（IndexedDB），但 `resolveScope` 会重新校验状态；篡改者已具备本机控制权，超出威胁模型。

## 5. 存储与恢复

### 5.1 已证实
- TaskStore 使用 IndexedDB 事务写入；`revision` 单调递增；`STALE_WRITE` 拒绝基于旧 `updatedAt` 的覆盖。
- 检查点保留最近 20 个；恢复次数在 `budget.used.recoveries` 与 `state.recoveries` 双重限制为 1。
- 配额错误映射为 `QUOTA` 并在 UI 降级。

### 5.2 风险
| 编号 | 结论 | 等级 |
|---|---|---|
| ASTRUM-010 | `STALE_WRITE` 仅比较 ISO 字符串时间；两个标签页同毫秒写入时可能丢失更新。 | P2（潜在，多标签页场景） |
| ASTRUM-020 | 事件先追加到内存再落库；落库失败时内存事件领先数据库，但 `revision` 不提升，刷新后事件可能丢失。 | P3（潜在） |
| ASTRUM-004 | 未知幂等性的工具在恢复时保守 `reuse`，可能跳过有副作用步骤。 | P2（高可信，已文档化取舍） |

## 6. 网络与供应链

### 6.1 CSP（index.html 第 8 行）
```
default-src 'self';
script-src 'self' 'sha256-8bmn...' 'sha256-Gdju...';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
connect-src 'self' http://localhost:* http://127.0.0.1:* https://localhost:* https://127.0.0.1:* <22 个 API 域名>;
object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```
- 优点：无 `unsafe-inline` 脚本、`object-src none`、禁止被框架嵌入、表单禁提交。
- **P3 缺口**：`style-src 'unsafe-inline'`；`connect-src` 放行 localhost 与较多域名；`img-src` 放行 `data:/blob:`；无 `worker-src`（依赖 default-src，可接受）。

### 6.2 CORS Worker（`worker/cors-proxy.js`）
- 优点：不持有 Key；仅 POST/OPTIONS；上游域名白名单 10 个。
- **P3 风险**：`Access-Control-Allow-Origin: *`；`?to=` 路径不受限（仅校验 host），可访问白名单主机上的任意路径；无请求/响应大小上限。属「有限开放代理」，不是 SSRF（浏览器端无内网访问能力），但可能被他人当作免费转发。

### 6.3 CI 供应链（`.github/workflows`）
| workflow | 权限 | 评估 |
|---|---|---|
| test.yml | `contents: read` | 最小权限，良好 |
| pages.yml | `contents: read`, `pages: write`, `id-token: write` | Pages 部署所需，可接受 |
| network.yml | `contents: read` | 良好 |
| daily.yml | `contents: write` | 需自动提交数据；风险集中于此，建议限制触发条件与审查提交内容 |

- Actions 使用 `@v4/@v5` 大版本标签而非 SHA 锁定（P3 供应链建议）。
- 无 `package.json`，无 npm 依赖，**无传统依赖供应链风险**；同时也无 SBOM/锁文件。

## 7. 隐私一致性
`privacy.html` 声明「无服务器、不收集、无埋点、无 cookie、无第三方脚本、Key 明文存 localStorage」；代码与之一致：
- 默认本地来源；仅用户主动配置云端 Key 后才外发对话。
- 无遥测、无第三方分析脚本。
- **结论：声明与实现一致（已证实）。**

## 8. 安全评分
- 授权模型：强（分层、单一入口、恢复重校验）。
- 浏览器暴露面：小（无 eval、CSP 严格、无第三方脚本）。
- 固有弱点：本地无认证、Key 明文、审计日志可篡改、CSP 样式放行。
- **安全维度评分：80/100。**

## 9. 安全建议优先级
1. 修复 CI 门禁（与安全间接相关，防止回归）。
2. 星表岁差（科学正确性，非安全）。
3. 收紧 `style-src`、移除不必要 localhost。
4. 为 `AuditLog` 增加链式哈希（可选）。
5. CORS Worker 增加路径白名单与响应大小上限。
6. 在 UI 明确「档案不是安全隔离」。
