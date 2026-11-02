# ASTRUM 最终架构更新与全量验收报告

> 日期：2026-11-02
> 代码提交：`5aa644a150448de9da1685862aec3fc47f0ef6b9`
> 线上目标：`https://jiangbei0921.github.io/Astrum/`
> 结论：**V1.4 / V1.5 已验收；可执行遗留已关闭；真实 Key、真实复杂 PDF 样本、正式下线仍为外部阻塞；V1.6 不启动。**

---

## 1. 基线核对

| 项 | 结果 |
|---|---|
| 起始 HEAD | `16111fe`，与远端一致 |
| 工作区 | clean |
| test Run | `41407085237` success（8e9c242） |
| pages Run | `41407223033` success（8e9c242） |
| 线上 version.json | commit `8e9c242`、dirty false、deployEnv github-actions |
| 旧遗留测试 | `v1-6-legacy` 23/23 |
| 新浏览器测试 | 已存在并执行 |

## 2. 遗留任务最终状态

### 2.1 工程遗留

| # | 任务 | 最终状态 | 证据 |
|---:|---|---|---|
| 1 | T-B/T-D 结果复用 | PASS | L03 used=t1/t1+t2，fallback=false |
| 2 | evidence.search 独立 | PASS | L12 deps=[] |
| 3 | 统一入口边界 | PASS | L16.1–L16.5 |
| 4 | 实时进度 L17/L23 | **PASS** | 浏览器 B5/B6：步骤面板 2/2；Node L17 事件带 stepId |
| 5 | 多任务逐个恢复 L18 | **PASS** | 浏览器 B2/B4/B7：2 任务、单恢复、剩 1 |
| 6 | 标准误语义 L20 | PASS | L20.1–L20.3 |
| 7 | evidenceScope 细分 L29 | PASS | supportGranularity=fulltext_chunk |
| 8 | Claim chunk 粒度 L35 | PASS | sourceChunks 含 chunkId/section/page |
| 9 | Research UI 真实验证 L22 | PARTIAL | 非 fixture 字段级快照仍不足 |
| 10 | 全文 UI 真实验证 L36 | PARTIAL | 解析 Node 真实；UI 未用真实浏览器快照 |
| 11 | HTML 全文 L25 | PASS | P6.1–P6.4 |
| 12 | 图片/文本附件 L27 | PARTIAL | TXT/BOM/空文件/PNG/不支持类型 PASS；JPG/WebP/超大未测 |
| 13 | 复杂 PDF L31 | BLOCKED_SAMPLE | 无扫描件/CID/双栏真实样本 |
| 14 | PDF 页码 L34 | BLOCKED_SAMPLE | 无印刷页码/罗马页码/偏移样本 |
| 15 | 全文缓存 L37 | PASS | P5.1–P5.6 |
| 16 | 真实 Provider L26/L33 | BLOCKED_API_KEY | 分类 4/4；真实调用未执行 |

### 2.2 浏览器验证（`v1-6-browser-test.js`）

```text
RESULT 12/12
B1 任务种入
B2 刷新后 2 个可恢复任务
B3 问题文本独立
B4 单独恢复第一个
B5 步骤面板 2/2
B6 非固定百分比
B7 只移除对应任务
B8 UTF-8 BOM 文本
B9 空文本失败
B10 PNG 预览
B11 不支持类型
B12 文本进入上下文
```

真实 Chrome，临时 profile，本地 HTTP；结束后删除 profile。

### 2.3 外部/可选/已接受

| 类别 | 条目 | 状态 |
|---|---|---|
| ENV_LIMITATION | L09/L10/L32/L41 | 外部限制，保留分类与降级 |
| BLOCKED_API_KEY | L26/L33 | 无 Key；未伪造 |
| BLOCKED_SAMPLE | L31/L34 | 缺真实 PDF 样本 |
| OPTIONAL_DEFERRED | L14/L28 | 无生产问题，不扩大配置 |
| ACCEPTED_DESIGN | L08/L15/L19 | MAST/standalone/本地密钥 |
| BLOCKED_AUTHORIZATION | 正式回滚/下线 | 隔离演练 PASS；正式操作需授权 |
| NOT_STARTED | V1.6 12 项 | 条件 2/5 |

## 3. 回滚演练

- 目标版本：`7e50227`；构建 58 文件 / 1,669,660 B / commit 7e50227 / dirty=false。
- 健康检查：首页 200、version.json 200、core/app.js 200、app.css 200。
- 故障模拟：停止服务 → DOWN。
- 恢复：重启 → 200，版本仍 7e50227。
- 未触碰正式 Pages；正式回滚/下线需单独授权。

详见 `docs/operations/ASTRUM-回滚与紧急下线演练报告.md`。

## 4. 测试与构建

| 项 | 结果 |
|---|---|
| Node 全量 | research 77、task 73、p0-03 53、control 86、b8 33、v1b 25、v1c 30、v1d 31、research-loop 29、claims 48、V1.1–V1.4 全通过 |
| v1-6 legacy | 23/23 |
| v1-6 browser | 12/12 |
| v1-3 fulltext | 22/22 |
| Chrome 可信套件 | selftest 156/156（CSP 0）、v1-1-browser 27/27、resource 13/13、cache 15/15、IDB 7/7、pages 32/32 |
| Provider | 分类 4/4；`RESULT BLOCKED_API_KEY`（exit 2） |
| 构建 | `_site` 58 文件 / 1,672,319 B；standalone 1,608 KB |
| 安全 | 密钥 0 / 绝对路径 0；CSP 0 违规 |
| 20 问 | diffBytes=0 |

## 5. 文档

已更新/新增：

1. `V1-遗留问题清单.md`
2. `ASTRUM-全项目架构追踪与缺口分析.md`
3. `V1.6-可选优化评估报告.md`
4. `V1.4-发布检查清单.md`
5. `V1.4-线上验证报告.md`
6. `ASTRUM-V1.4-V1.6-阶段验收与剩余工作报告.md`
7. `ASTRUM-跨版本遗留任务补齐与验收报告.md`
8. `ASTRUM-回滚与紧急下线演练报告.md`

## 6. V1.6 判断

| 条件 | 状态 |
|---|---|
| 明确实际生产问题 | 未满足 |
| 具体改进目标 | 未满足 |
| 量化验收指标 | 未满足 |

结论：**不启动 V1.6**；12 个子项仅分类管理。

## 7. 最终结论

1. V1.4：**完整验收**（线上 + Actions + 版本元数据）。
2. V1.5：**完整验收**（30/60/180 分钟、IDB、大文件、缓存）。
3. 跨版本遗留：可执行项已关闭；4 类外部阻塞如实保留。
4. 仍受限：真实 Key（L26/L33）、真实复杂 PDF（L31/L34）、正式回滚/下线授权、Research UI/全文 UI 真实快照。
5. 已有代码但缺验证：L22/L36/L27 部分场景。
6. V1.6：不启动（2/5）。
7. 架构稳定：13 Agent、Muse、Tool-Centric、7 模板、ADR-001 未改变。
8. 必须修改的架构缺陷：无；剩余为验证/环境/样本问题。
9. 可进入下一阶段：**可以进行真实样本与 Key 验证，不应启动 V1.6 开发。**

## 8. 需要用户提供

| 类型 | 具体要求 |
|---|---|
| API Key | OpenAI-compatible / Gemini / Anthropic 任一；设置 `ASTRUM_LIVE_PROVIDER`、`ASTRUM_LIVE_BASE_URL`、`ASTRUM_LIVE_MODEL`、`ASTRUM_LIVE_API_KEY`；不得在聊天/仓库中粘贴 |
| PDF 样本 | 扫描件、CID 字体、双栏、含公式/表格/图注、罗马页码、物理/印刷页码不一致；公开许可 PDF |
| 正式下线授权 | 需明确确认影响范围后才执行 |

## 9. GitHub

| 项 | 值 |
|---|---|
| 代码提交 | `5aa644a150448de9da1685862aec3fc47f0ef6b9` |
| commit message | `test: verify browser recovery, attachments and rollback drill` |
| push | 正常 push，无 force |
| 本地/远端 | 一致 `5aa644a` |
| Actions test | Run `41411083290` success（5aa644a） |
| Actions pages | Run `41411228469` success（5aa644a） |
| 线上 version.json | commit `5aa644a`、dirty=false、runId 41411228469 |
| 线上浏览器验证 | 首页/13 Agent/核心问答/无 console/CSP/404 全 PASS |
| 线上开发文件隔离 | tools/docs 均 404 |
