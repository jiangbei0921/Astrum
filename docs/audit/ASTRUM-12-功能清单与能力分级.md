# ASTRUM-12 功能清单与能力分级

分级：**A 完整可用 / B 基本可用 / C 有限/有条件 / D 演示 / E 未实现 / F 无法验证**

## 1. 核心问答与知识
| 功能 | 级别 | 说明 | 主要文件 | 证据 |
|---|---|---|---|---|
| 离线知识问答（20 问） | A | 本地知识库，无网可用 | `data/knowledge.js`、`runtime.js`、`app.js` | selftest、v1-15 |
| 意图识别与路由 | A | 关键词/规则路由 | `query.js`、`router.js`、`adaptive.js` | v1-1/v1-2 routing |
| 本地模板回答 | A | 确定性表述 | `answer-composer.js` | v1-10/v1-13/v1-14 |
| 云端模型回答 | C | 需自备 Key；无 Key 明确降级 | `sources.js`、`app.js` | v1-11 stream |
| 多来源并行对比 | B | 本地对比；外部取决于网络 | `app.js`、`answer-composer` | v1-2 comparison |

## 2. 星图与太阳系
| 功能 | 级别 | 说明 | 主要文件 | 证据 |
|---|---|---|---|---|
| 星图（9096 亮星） | A | BSC5 真实星表；J2000 未岁差 | `data/sky-stars-l1.js`、`sky-viewmodel.js`、`sky-renderer.js` | v2-sky 套件 |
| DSO / Messier | B | 离线快照；未逐条核验坐标 | `data/catalog.js` | v2 |
| 星座连线 | D | 示意 stick figure，非 IAU 边界 | `data/catalog.js` | — |
| 银河背景 | B | NASA SVS 公有领域纹理，视觉素材 | `data/milkyway-bg.js`、`sky-background.js` | metadata |
| 太阳/月亮位置 | B | 低精度/ Meeus 截断；实测吻合参考 | `astro.js` | 本审计独立验证 |
| 行星位置 | C | JPL 近似；未外部对照（待验证） | `astro.js` | 量级验证 |
| 行星视觉 | D | 程序化纹理 + 光照/相位 | `planet-textures.js`、`planet-visuals.js` | v2 |
| 太阳系 3D/近景 | B | 数据驱动展示 | `solarsystem.js`、`data/solarsystem.js` | v2 |

## 3. 观测与工具
| 功能 | 级别 | 说明 | 主要文件 |
|---|---|---|---|
| 观测计划 | B | 本地数据 + 可选天气 | `data/obsplan.js`、`weather.js` |
| 地理位置 | B | 内置 places + geosearch | `geosearch.js`、`data/places.js` |
| 天气 | C | open-meteo，需网络 | `weather.js` |
| 天文计算器 | B | 本地公式；极端输入未穷举 | `app.js`、`astro.js` |
| 每日内容 | B | 每日数据同步 | `data/daily.js`、`tools/sync-daily.js` |

## 4. 检索与科研
| 功能 | 级别 | 说明 | 主要文件 | 证据 |
|---|---|---|---|---|
| 多源检索 | B | 网络可达时可用 | `research.js`、`sources.js` | v1-5 research loop |
| 证据编号/状态 | A | E1..En、supported/pending | `research.js`、`evidence.js` | p1-evidence-link |
| 引用核验 | B | 结构与数值冲突检测 | `research.js` | v1-5 claims |
| Claim 生成 | B | 真实证据合成；origin 有偏差 | `claims.js`、`compose-adapter.js` | 本审计 |
| 报告生成 | A | 本地 | `report.js` | perf/测试 |
| PDF/FITS/图片附件 | B | 本地解析 | `pdf-text.js`、`fits.js`、`attachments.js` | v1-6 |
| 论文全文/DOI | C | 取决于网络与来源 | `paper-fulltext.js`、`simbad.js` | v1-3/v1-4 |
| SIMBAD | C | 需网络 | `simbad.js` | v1-2 simbad |

## 5. Agent / 任务 / Skill
| 功能 | 级别 | 说明 | 主要文件 | 证据 |
|---|---|---|---|---|
| 13 角色 Agent | B | 角色化 Pipeline，非自主协商 | `agents.js` | selftest 13 agent |
| Goal 解析/子问题 | B | 规则化 | `research-goal.js` | p3-planning |
| DAG 计划 | A | 依赖/环/并行冲突 | `planner.js`、`dag-validator.js` | p3-contract |
| 任务执行/预算/重试 | A | 预算唯一权威 | `orchestrator.js`、`task.js` | p3-* |
| 暂停 | C | 边界生效 | `control.js` | p3-progress |
| 持久化/检查点 | A | IndexedDB，保留 20 | `task-store.js` | p4-* |
| 恢复 | A（语义有限） | 手动恢复，次数=1，幂等 | `recovery.js`、`control.js` | p4-browser 13/13 |
| 后台继续执行 | E | 未实现 | — | — |
| Skill 提案/校验/审批/发布 | A | 完整生命周期 | `skill-*.js` | p2 8 套 |
| Skill 执行 | A | 仅 published，权限校验 | `skill-runtime.js` | p2 |
| Skill 语义越权防护 | C | 静态规则，无法穷举 | `skill-validator.js` | 潜在 |

## 6. 数据与隐私
| 功能 | 级别 | 说明 |
|---|---|---|
| 项目/记忆 | A | IndexedDB，提案-审批 |
| 导入/导出 | A | 测试覆盖 |
| 档案隔离 | B | 逻辑隔离，非安全边界 |
| 隐私（无服务器/无埋点） | A | 与声明一致 |
| API Key 管理 | C | 明文 localStorage，已披露 |

## 7. 工程
| 功能 | 级别 | 说明 |
|---|---|---|
| 无构建/无依赖部署 | A | GitHub Pages 可用 |
| 测试套件 | A（有红灯） | P0–P4 全绿；selftest 153/156 |
| CI | C | 存在但当前预计红 |
| 国际化 | B | 有 1 处静态缺失 |
| 可访问性 | B | 有 a11y 测试，未人工审校 |
| 浏览器兼容 | C | 仅 Chromium 验证 |

## 8. 统计
- A：12 项
- B：16 项
- C：12 项
- D：2 项
- E：1 项（后台执行）
- F：0 项（未验证项已并入 C/说明）

## 9. 结论
A/B 级构成产品主体，C 级集中在网络与高精度场景，D 级为视觉模拟，E 级为「后台执行」。功能宣称与实际基本匹配，**除「多智能体自主协作」与「精密星历」两类表述需要纠偏**。
