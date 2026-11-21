# ASTRUM-10 问题清单

等级定义：P0 阻断/可远程利用；P1 严重（核心能力或科学正确性受损）；P2 中等（真实风险或明显一致性缺陷）；P3 轻微（改进项）。
证据强度：已证实 / 高可信 / 潜在 / 待验证。

| 编号 | 等级 | 标题 | 文件/函数 | 触发条件 | 根因 | 影响 | 强度 | 测试覆盖 |
|---|---|---|---|---|---|---|---|---|
| ASTRUM-001 | P1 | CI 自测门禁失败（153/156, exit=1） | `.github/workflows/test.yml` selftest 步骤；`tools/selftest.js:229,644`；`core/research.js:605-621` | CI 或本地运行 selftest | ① research 用例未传 principal，被 P0 授权拒绝返回空证据；② 侧栏静态 i18n 缺英文词条 | main 分支无法通过自身 CI；回归门禁失效 | 已证实（本地等价复现） | selftest |
| ASTRUM-002 | P1 | J2000 星表与 of-date 恒星时混用，约 0.36° 系统偏差 | `core/astro.js:227-242`（lstHours/altAz）；`data/sky-stars-l1.js:6`；`core/sky-viewmodel.js:86-181` | 任意星图/地平坐标计算 | 星表为 J2000 且未岁差；地平计算用当日 GMST/黄赤交角 | 恒星与银河纹理相对真实天球偏移约 0.36°（2026），寻星/指向不准 | 已证实（代码+数据+推导） | 无岁差测试 |
| ASTRUM-003 | P2 | 「多智能体」表述超出实现 | `core/agents.js:175-285`；`core/planner.js:190-311` | 用户阅读 README/关于页 | 实现为 Intent Routing + 固定模板 Pipeline，Agent 是角色标签 | 用户预期落空，可信度受损 | 已证实 | — |
| ASTRUM-004 | P2 | 未知幂等性工具恢复时保守 reuse | `core/recovery.js:255-357` | 恢复含未声明幂等性步骤的任务 | 保守策略默认「可复用」 | 可能跳过有副作用步骤，结果不完整 | 高可信（已文档化取舍） | p4-recovery 28/28（未覆盖该语义） |
| ASTRUM-005 | P2 | 超时后不中断底层请求 | `core/orchestrator.js` withTimeout；`core/sources.js:539-550` | 工具执行超时 | 包装层仅忽略 Promise，未 abort | 界面已超时但下游仍完成，可能重复副作用/浪费配额 | 高可信 | 无 |
| ASTRUM-006 | P2 | 暂停仅在步骤/批次边界生效 | `core/control.js` pause/loop | 运行中点击暂停 | 只在批次间检查 `pausedAt` | 当前步骤副作用不可即时停止 | 已证实 | p3/p4 未断言即时性 |
| ASTRUM-007 | P2 | 档案隔离非安全边界 | `core/profile.js`；`core/store.js:20-24` | 同一浏览器切换档案 | 本地无认证，profileId 仅命名空间 | 共用设备者可见他人档案数据 | 已证实（设计边界） | p1-context 51/51（逻辑隔离） |
| ASTRUM-008 | P2 | 行星位置缺乏外部星历对照 | `core/astro.js` planet/helio | 需要行星精度时 | 仅有 JPL 近似根数，无 Horizons 基准测试 | 精度未知，不能宣称高精度 | 待验证 | 无 |
| ASTRUM-009 | P2 | 真实 Claim 标为 p0-fixture | `core/claims.js` buildClaimsFromEvidence | P3 用真实证据生成 Claim | 合成函数未设置 origin | 契约语义错误，下游可能误判来源 | 已证实 | p3/p4 未断言 origin |
| ASTRUM-010 | P2 | 多标签页并发写缺版本冲突保护 | `core/task-store.js` STALE_WRITE | 两个标签页同毫秒保存同一任务 | 仅比较 ISO 字符串时间 | 可能丢失更新 | 潜在 | 无 |
| ASTRUM-011 | P3 | CSP `style-src 'unsafe-inline'` | `index.html:8` | 存在 HTML 注入时 | 样式放行 | 允许样式注入/数据外带辅助 | 已证实 | csptest |
| ASTRUM-012 | P3 | API Key 明文 localStorage | `core/sources.js`；`privacy.html:84` | 同源脚本读取 | 未加密 | XSS 可窃取 Key（已披露） | 已证实 | — |
| ASTRUM-013 | P3 | CORS Worker 路径/大小限制不足 | `worker/cors-proxy.js:32-59` | 他人调用部署的 Worker | 仅校验 host；ACAO `*`；无大小上限 | 可作有限开放代理；白名单主机任意路径 | 潜在 | 无 |
| ASTRUM-014 | P3 | AuditLog 可篡改、无完整性链 | `core/audit-log.js:12,84-101` | 恶意脚本/用户 | 本地环形日志，无 hash 链 | 审计不可作取证 | 已证实 | 无 |
| ASTRUM-015 | P3 | 静态 i18n 缺条目 | i18n 资源；`tools/selftest.js:644` | 切换英文 | 「科研技能」未翻译 | 英文界面混入中文 | 已证实 | selftest 失败项 |
| ASTRUM-016 | P3 | 月相按 8 等分时间段命名 | `core/astro.js` moonPhase | 月相边界日 | 非按黄经差 45° 判定 | 边界标签最多偏差约 1.8 天 | 高可信 | 无 |
| ASTRUM-017 | P3 | astro.js 注释称 J2000，实际 of-date | `core/astro.js:2-7` | 维护者阅读 | 注释未随实现更新 | 误导后续开发，放大 ASTRUM-002 | 已证实 | — |
| ASTRUM-018 | P3 | 行星纹理/银河/星座连线为模拟 | `core/planet-textures.js` 头；`data/catalog.js:4`；milkyway metadata | 用户以为实测 | 视觉素材 | 科学展示可能被误解 | 已证实 | — |
| ASTRUM-019 | P3 | IDB 大量写入较慢 | `core/task-store.js`；idb-stress | 1000 条写入 | 逐条写，无批量 | 低端设备卡顿（2.27 s/1000） | 已证实 | v1-5-idb-stress 7/7 |
| ASTRUM-020 | P3 | 事件内存态可能领先持久化态 | `core/task-store.js` save/appendEvent | 写库失败 | 先入内存后落库，revision 不提升 | 刷新后事件短暂丢失 | 潜在 | 无 |
| ASTRUM-021 | P3 | 无 package.json/依赖锁定/SBOM | 仓库根 | 供应链审查 | 纯静态无依赖 | 透明度依赖人工，无自动扫描 | 已证实 | — |
| ASTRUM-022 | P3 | `Research.run` 无 principal 时静默返回空证据 | `core/research.js:605-621` | 浏览器调用未传 principal | 返回正常对象而非抛错 | 调用方易把 denied 当成功（selftest 即中招） | 已证实 | selftest |
| ASTRUM-023 | P3 | GitHub Actions 未按 SHA 锁定 | `.github/workflows/*.yml` | 供应链攻击 | 使用 `@v4/@v5` 标签 | 上游标签被篡改可执行恶意代码 | 潜在 | — |
| ASTRUM-024 | P3 | 极区太阳升落返回 null，缺 UI 文案 | `core/astro.js` sunTimes | 极昼/极夜 | 数学上无升落 | 用户看到空白而非「极昼/极夜」 | 待验证 | 无 |

## 统计
- P0：0
- P1：2
- P2：8
- P3：14
- 合计：24

## 已确认无问题的关键项
- 未发现可利用 XSS / eval / new Function。
- 未发现认证绕过导致跨档案读取的可利用路径（在本地威胁模型内）。
- 未发现工具调用绕过 ToolGateway。
- CSP 基本策略、隐私声明与实现一致。
