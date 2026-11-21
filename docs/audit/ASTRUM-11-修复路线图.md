# ASTRUM-11 修复路线图

> 本报告仅提出建议，未实施任何修改。

## 阶段 1：恢复可信门禁（最高优先）
| 顺序 | 编号 | 动作 | 验收标准 |
|---|---|---|---|
| 1 | ASTRUM-001 | selftest 的 research 用例补 `principal`；补 i18n 词条 | `node tools/selftest.js "file://$PWD/index.html"` = 156/156，exit 0 |
| 2 | ASTRUM-001 | CI 将 selftest 设为硬门禁，保留 `continue-on-error: false` | main 绿灯 |
| 3 | ASTRUM-022 | `Research.run` 缺 principal 时抛错或返回显式 `error` 状态，禁止静默空成功 | 新增测试覆盖 |

## 阶段 2：科学正确性
| 顺序 | 编号 | 动作 | 验收标准 |
|---|---|---|---|
| 4 | ASTRUM-002 | 在 `altAz` 前对 J2000 星表坐标施加岁差（可选自行）到观测历元；统一太阳/行星参考系 | 与 JPL Horizons/Stellarium 对照，恒星偏差 < 0.02°（2026） |
| 5 | ASTRUM-008 | 建立行星位置外部基准测试（至少 10 个日期 × 8 行星） | 角误差 < 0.1°（内行星）/ < 0.5°（外行星） |
| 6 | ASTRUM-017 | 修正 `astro.js` 头注释 | 注释与实现一致 |
| 7 | ASTRUM-016 | 月相按黄经差分段或标注「近似」 | 边界日标签与天文事实一致 |

## 阶段 3：执行语义
| 顺序 | 编号 | 动作 | 验收标准 |
|---|---|---|---|
| 8 | ASTRUM-004 | 未声明幂等性默认 `validate_then_reuse` 或 `rerun` | 恢复测试覆盖副作用步骤 |
| 9 | ASTRUM-005 | `withTimeout` 与 `AbortController` 打通 | 超时后下游请求被 abort |
| 10 | ASTRUM-006 | 暂停支持协作式中断；UI 明确「当前步骤后暂停」 | 测试断言暂停延迟上界 |
| 11 | ASTRUM-010 | TaskStore 用 `revision` 做 CAS | 双标签页并发测试无丢失 |

## 阶段 4：表述与合规
| 顺序 | 编号 | 动作 | 验收标准 |
|---|---|---|---|
| 12 | ASTRUM-003 | README/关于页改为「多角色 Agent Pipeline」 | 文案无「自主多智能体」暗示 |
| 13 | ASTRUM-018 | 明确纹理/银河/星座为模拟或示意 | 关于页/图例可见声明 |
| 14 | ASTRUM-007 | UI 提示「档案不是安全隔离」 | 设置页可见 |
| 15 | ASTRUM-009 | `claims.origin` 修正为 `p3-generated` | 契约测试覆盖 |

## 阶段 5：加固（可选）
| 编号 | 动作 |
|---|---|
| ASTRUM-011 | 收紧 CSP `style-src`，移除不必要的 localhost |
| ASTRUM-012 | 评估 WebCrypto 加密 Key 或强化风险提示 |
| ASTRUM-013 | CORS Worker 增加路径白名单与响应大小上限 |
| ASTRUM-014 | AuditLog 增加链式哈希 |
| ASTRUM-019 | TaskStore 批量写 |
| ASTRUM-023 | Actions 按 SHA 锁定 |

## 建议发布门槛
**必须完成**：1、2、4。
**强烈建议**：3、5、8、9、12。
完成上述后，可将综合评分从 77 提升至约 85–88，并具备公开部署条件。
