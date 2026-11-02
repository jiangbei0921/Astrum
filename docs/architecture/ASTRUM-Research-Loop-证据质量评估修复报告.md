# ASTRUM Research Loop 证据质量评估修复报告（Gate 1）

> 执行日期：2026-11-01
> 代码目录：项目工作区
> 结论：Gate 1 通过（`RESULT 29/29` + `RESULT 48/48`，回归 73/86/33/53 全通过，构建通过）

---

## 1. 原有问题

1. Evaluator 只判断 Evidence 是否存在，`opts.conflicts` 在 Control 中写死为 `[]`（`core/control.js:317`），Claims/Reducer 结果从未进入判断。
2. searches 双重扣减：Control 追加时 `T.spend({appends:1, searches:1})`，Runner 执行 `x1` 时再按 `spec.cost` 扣 `searches:1`（`core/orchestrator.js:308`、`core/registry.js:94`），导致 `x1` 因预算被 skipped，追加搜索实际未执行。
3. E3 只断言“追加步骤存在、appends 被消耗”，未断言步骤成功，属假通过。
4. Planner.expand 无触发依据，同一个缺口可能反复追加。
5. L3 初始 T-E 的 `paper.search + evidence.search` 已用尽 `searches=2`，Research Loop 无法追加；原始计划未规定预留额度，本轮保持预算并记录 `budget_exhausted`。

## 2. 原有数据流

```
Control.run → Orchestrator.runPlan → compose.domain
              └─ ComposeAdapter: researchOf → Claims.judgeAll → Reducer.reduce → Report
                 → answer.research = {claims, verdicts, reducer, report}
Control Research Loop → Evaluator.decide（只有 state 原始结果 + opts.conflicts=[]）
```

## 3. 修改后的数据流

```
Control.run
  └─ research = runner.answer.research（Compose Adapter 已构建）
       ├─ Evaluator.decide({state, plan, research, opts})
       │     ├─ Claims 支持缺口 / 独立性 / Reducer 关键冲突 / 冲突消失
       │     └─ append{code,key,claimId/conflictKey,text}
       ├─ Planner.expand(plan, {basis, direction, conflictKeys})
       │     └─ plan.expansion{rounds,basis,appendedKeys,conflictKeys}
       ├─ T.spend({appends:1})   （searches 仅由 Runner 扣）
       └─ runPlan(expanded)
             └─ deliverWithDelivery → 刷新 answer.research（供下一轮）
```

## 4. Evaluator 新输入结构

```js
{ state, plan,
  opts: { query, signal, cancelled, maxAppends },
  research: { evidence, claims, verdicts,
              reducer: { conflicts, differences, duplicates, sources } } }
```

- `research` 缺省时完全走旧逻辑（旧测试零差异）。
- 不构建新 Claims/Evidence，只消费 `answer.research` 与 `Reducer` 现有输出。

## 5. 8 个 gapCode

| gapCode | 判定依据 | 允许追加 |
|---|---|---|
| `no_evidence` | `research.evidence.length === 0` | 是 |
| `critical_claim_without_support` | `required===true && support.length===0` | 是 |
| `critical_claim_weak_support` | required 且全部 support 为 `weak`/`basis:numeric` | 是 |
| `critical_claim_single_source` | required 且 support 映射到 distinct `Evidence.sourceId` = 1 | 是 |
| `critical_claim_not_verified` | required 且 verdict `FAIL` 且 `rule==='R3'` | 是 |
| `critical_conflict` | `conflict.values[].id` 命中 required Claim | 是 |
| `noncritical_conflict` | 冲突未命中 required Claim | 否 |
| `insufficient_information` | 无 `differences` 可判定 / Evidence 映射缺失 | 否 |

说明：R2/R4/numeric 类 FAIL 属措辞或计算完整性，不视为搜索可解决；同一 Claim 只产生一个 gapCode（优先级 without_support > not_verified > single_source > weak_support）。

## 6. Claims 数据接入

- 关键性只用现有 `required`，未新增字段、未按文本猜测。
- 独立性使用 `Claim.support[].eid → Evidence.sourceId` 去重；同一 DOI/站点镜像不会被当成两个来源；映射缺失记 `insufficient_information`。
- `answer.research.claims` 与 `verdicts` 由现有 `judgeAll` 产出，原样传递。

## 7. Reducer 冲突接入

- 冲突关键性：`values[].id → Claim.required`（Reducer 无 `severity/affectsCritical`）。
- 冲突消失：`plan.expansion.conflictKeys` 保存上一轮 `family|unit` 键；本轮键消失且同实体同量纲仍被 Claims 覆盖 → `resolved`；范围消失 → 不判定为已解决。
- 非关键冲突只记录，不触发追加。

## 8. 追加步骤追溯

`plan.expansion = { rounds, basis:[{code,key,claimId,conflictKey,stepId,query}], appendedKeys, conflictKeys }`

- 步骤本身仍为 `x1/x2`，工具仍为 `evidence.search`，不修改原步骤 ID 语义。
- 同一 `key` 已在 `appendedKeys` → 拒绝追加；不同缺口可独立追加。
- 未新增事件 payload 键，`progress.decided`/`plan.expanded` 仍只带 `action/reason`。

## 9. searches 双重扣减修复

- Control 只扣 `appends:1`；`searches` 由 Runner 在工具实际执行时扣减。
- 效果：L4 T-E 初始 2 次 + 追加 1 次 = `used.searches=3`（不是 4），`x1.status='ok'`。
- 预算不足时 `x1` 被 Runner 标记 `skipped`，Evaluator 下一轮按 `budget_exhausted` 停止，不绕过 Runner。

## 10. 预算行为

| 级别 | Replan | appends | searches | 实际 Research Loop |
|---|---|---|---|---|
| L1 | 0 | 0 | 0 | 不进入 |
| L2 | 1 | 1 | 1 | 初始 T-E 已用尽搜索预算 |
| L3 | 2 | 3 | 2 | 初始 T-E 用尽 2 次 → `budget_exhausted`，0 轮追加 |
| L4 | 2 | 3 | 3 | 初始 2 次，可追加 1 轮 |

未修改 ADR-001，未提高任何预算。

## 11. 新增测试

`tools/v1-5-research-loop-claims-test.js`：E5 Claims(7)、E6 Reducer(7)、E7 Evidence(5)、E8 真实集成(9)、E8b T-F/非研究/取消(3)、E8c Stub 检索→Claims(5)、E9 持久化/事件(7)、E10 预算(5)。

原有 `tools/v1-5-research-loop-test.js` 由 26 项增至 29 项（新增 E3.7 真实执行、E3.8 单次扣减、E3.9 追溯），未删除任何旧断言。

## 12. 测试结果（真实执行）

| 命令 | 结果 |
|---|---|
| `node tools/v1-5-research-loop-test.js` | 29/29 |
| `node tools/v1-5-research-loop-claims-test.js` | 48/48 |
| `node tools/task-test.js` | 73/73 |
| `node tools/control-test.js` | 86/86 |
| `node tools/b8-test.js` | 33/33 |
| `node tools/p0-03-test.js` | 53/53，20 问 diffBytes=0 |
| `node tools/build-standalone.js` | 通过，53 脚本，1597 KB |
| `node tools/i18n-scan.js --quiet --max=0` | 界面 0 条 |

## 13. 遗留问题

1. 真实网络检索下的 Claims 接入仅由 Stub 覆盖；本机 `network:false` 无法验证真实来源。
2. L3 无追加轮次是预算事实，不是 bug；若未来需要 L3 追加，必须先修订原始计划/ADR，本轮不做。
3. Evaluator 对 R2/R4/numeric 类 FAIL 不追加，属设计选择，已在 gapCode 定义中记录。
4. `plan.expansion` 为新增可选字段，旧调用不读取，兼容。
