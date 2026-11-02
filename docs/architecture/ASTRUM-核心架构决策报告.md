# ASTRUM 核心架构决策报告

> 日期：2026-11-01
> 依据：`ASTRUM-全项目架构追踪与缺口分析.md`、ADR-001
> 结论：Progress Evaluator / Research Loop / Replan 属于本轮架构修复范围；实时进度仍 DEFERRED；可选功能不实现。

---

## 决策 1：Progress Evaluator 属于当前架构修复

- 依据：03 §3.5、05 §5、P0-01 §4 都把它列为执行闭环的一部分；
- 实现：`core/evaluator.js`，纯规则，不调 LLM；
- 输入：state/plan/Evidence/Claims（可选）/预算/取消；
- 输出：`continue/append/replan/stop`；
- 事件：`progress.decided{action,reason}`；
- 预算：`appends` 与 `searches` 真实消耗；
- 不改变旧接口。

## 决策 2：Research Loop 与 Replan 分离

- Replan：关键步骤失败、计划不可执行、仅重组 compose 依赖；
- Research Loop：执行成功后基于 Findings/Evidence 缺口追加定向检索；
- 只追加不改写；只允许 T-E/T-F；只追加 `evidence.search`；
- 最多 2 轮，受 `appends`/`searches` 预算限制；
- 事件：`plan.expanded{action,reason}`；
- 不新增第 8 模板、不新增工具、不动 13 Agent。

兼容策略：

- `opts.researchLoop` 默认 false；
- 仅浏览器研究入口显式开启；
- 旧测试、旧调用、Control 默认路径行为不变；
- 追加后若原 compose 不重跑，由 Adapter fallback 用全部成功步骤重建答案，避免新证据被丢弃。

## 决策 3：Replan 上限采用 L1=0 / L2=1 / L3-L4=2

详见 `ADR-001-replan-budget.md`。

- 不再 `Math.min(1,...)`；
- 显式 `opts.maxReplans` 只能收紧；
- 硬上限 2；
- Research Loop append 与 replan 分开计数。

## 决策 4：实时进度保持 DEFERRED

- `emitNew` 仍集中回调，`app.js` 未接 onEvent；
- 原 L17/L23 已列后续；本轮不扩大到 30+ 事件类型和 UI；
- 后续如实现，必须复用 TaskState/Control 事件，不得用定时器伪造。

## 决策 5：Critic 与 Claims 边界

- 旧 Critic 五项 checks 保留，不删除；
- 科学研究由 Research Report 的 Claims/R1-R4 负责；
- 旧 `dimensions` 不得被解释为完整科学验证；
- 本轮不改变路由；高风险研究是否必须走 Research Report 列入后续。

## 决策 6：可选功能不实现

- Controlled Delegation、search-pipeline、动态 Agent Registry、独立 Memory、MAST、Hypothesis Tournament 均按原计划 OPTIONAL/NOT_REQUIRED；
- 不因 P0 蓝图列出文件名就扩大当前版本。

---

## 验收结果

- v1-5-research-loop：**26/26**；
- control 86/86、v1b 25/25、v1c 30/30、p0-03 53/53；
- 20 问 diffBytes=0；
- 旧调用默认不受 Research Loop 影响。
