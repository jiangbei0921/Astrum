# ADR-001：Replan 预算上限统一

> 日期：2026-11-01
> 状态：Accepted
> 影响版本：V1.5 架构修复
> 相关文档：`05-动态任务编排机制.md`、`P0-01-目标架构总蓝图.md`、`V1-00-核心能力建设总蓝图.md`

---

## 1. 背景

原始设计（`05`、`P0-01`）规定 `MAX_REPLAN=2`，预算表中：

- L1：replans 0
- L2：replans 1
- L3 / L4：replans 2

V1 代码在 `core/control.js` 的 `maxReplansOf` 中写死：

```js
Math.min(1, requested, budget)
```

实际最多 1 次；V1c 测试也显式传 `maxReplans:1`，因此测试通过但没有覆盖 2 次。

这是设计、代码、测试三者口径不一致，不是单纯数字问题。

---

## 2. 决策

最终采用**按任务级别差异化上限**：

| 级别 | 上限 |
|---|---:|
| L1 | 0 |
| L2 | 1 |
| L3 | 2 |
| L4 | 2 |

规则：

1. 默认取 `state.budget.limit.replans`；
2. 显式 `opts.maxReplans` 可以收紧，但不得超过预算；
3. 绝对值仍硬上限 **2**，防止未来预算表误配置导致无限重规划；
4. 每次重规划必须消耗 `budget.used.replans`；
5. Research Loop 的 `append` 与 `replan` **分开计数**，不共享次数。

`core/control.js` 已改为：

```js
Math.max(0, Math.min(2, requested, budget))
```

---

## 3. 为什么不是继续保留 1

- `05` 与 `P0-01` 是最终架构蓝图，明确 2 次；
- 预算表 L3/L4 已为 2 次预留；
- 1 次无法覆盖“第一次重组后仍失败、但仍有第二次可安全重组”的场景；
- 保留 1 会让文档持续误导，且 `budget.limit.replans` 字段永远用不满。

---

## 4. 为什么不是无上限

- 重规划会重新执行 compose 依赖，存在重复计算与外部请求风险；
- `05` 明确防死循环四道闸：`MAX_REPLAN=2`、`append≤3`、`retries≤1`、单调性；
- 第二次仍失败后应停止，输出 PARTIAL + 缺口，而不是继续循环。

---

## 5. 对测试的影响

- 既有 `v1c` 测试显式传 `maxReplans:1`，保持通过（属于“收紧”，不违反 ADR）；
- 新增测试需覆盖：
  - L2 默认最多 1 次；
  - L3/L4 默认最多 2 次；
  - 第 3 次被拒绝；
  - 预算耗尽后停止；
  - 显式 `maxReplans:0` 时完全不重规划；
  - Research Loop 的 append 不计入 replan。
- 未修改旧测试预期值；新增测试只补覆盖。

---

## 6. 兼容性

- L1 不进入重规划；
- L2 保持 1 次，与原行为一致；
- L3/L4 从 1 提到 2，仅在真正发生第二次关键失败时改变执行深度；
- 不改变 `ask/buildAnswer/compose*` 输出结构；
- 不影响 Research Loop 的 append 预算。

---

## 7. 验收条件

1. `core/control.js` 不再出现 `Math.min(1, requested, budget)`；
2. L3/L4 预算 `replans=2`；
3. 新测试覆盖 2 次成功、第 3 次拒绝、预算耗尽；
4. `v1c`、`control-test`、`v1b` 全部通过；
5. `V1-00` 与 `05` 的说明一致。
