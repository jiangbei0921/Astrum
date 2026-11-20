# P2-02 Skill 安全与权限设计

> 前提：P0 身份/权限/审计不可绕过；P1 双层校验保持
> 核心原则：Skill 的声明权限是「需求」，不是「授权」；实际权限 = 执行者权限 ∩ Skill 声明 ∩ 作用域

---

## 1. 身份与 Principal

- 所有 Skill 操作必须携带可信 `principal`（`security.makePrincipal` 生成）。
- `profileId` 只来自 `profile-context`，禁止从 Skill 内容、表单或模型输出读取。
- Skill 不能写 Principal、Profile、Security Policy、角色策略。
- 存储层再次校验 `record.profileId === principal.profileId`，不依赖调用方。

---

## 2. 能力扩展

在 `security.js` 现有能力字典上扩展（`skill.*` 已存在 6 项占位）：

| 能力 | 当前 | P2 | 说明 |
|---|---|---|---|
| `skill.read` | 无 | true | 查看 skill/version/usage |
| `skill.propose` | false | true | 创建提议 |
| `skill.create` | false | true | 生成草稿 |
| `skill.test` | false | true | 启动验证 |
| `skill.evaluate` | false | true | 写入评估 |
| `skill.approve` | 无 | true | 人工审批（仅 user） |
| `skill.publish` | false | true | 发布/废弃/归档（仅 user） |
| `skill.execute` | 无 | true | 调用已发布 Skill |
| `skill.rollback` | false | true | 回滚（仅 user） |

### 2.1 角色矩阵

| 角色 | read | propose | create | test | evaluate | approve | publish | execute | rollback |
|---|---|---|---|---|---|---|---|---|---|
| user | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| muse | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| scholar | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| critic | ✅ | ❌ | ❌ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| curator | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| 其他 Agent | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

约束：
- `approve/publish/rollback` 在 `security.authorize` 内额外要求 `principalType==='user'`，角色策略只是第二道。
- 新增角色必须显式配置；默认拒绝。

---

## 3. 作用域（Skill Scope）

| 维度 | 默认 | 规则 |
|---|---|---|
| Profile | 必填 | `profileId` 必须等于 principal；禁止跨 Profile |
| Project | 可选 | 若设置，执行 principal 的 projectId 必须相等；`projectId:null` 表示用户级 |
| Agent | 白名单 | `allowedAgents=[]` 表示不限制 Agent 身份，但仍受角色能力限制；非空时必须包含执行 Agent |
| Tool | 白名单 | 只能使用 Registry 中已注册工具；执行时逐个经 ToolGateway |
| 全局 | **不支持** | P2 不建立跨 Profile 公共库（Q5） |

提升路径：`project` 级 → `profile` 级必须新建版本并重新审批；不允许原地改 `scope`。

### 3.1 执行时的权限求交

```
可执行工具 = Registry 工具
          ∩ Skill.allowedTools
          ∩ ROLE_POLICY(principal.roleId) 可调用工具
          ∩ TOOL_CAPABILITY 允许
若 allowedTools 含未授权项 → 执行前直接 DENY（不静默跳过）
```

`requiredCapabilities` 必须全部属于 principal 的能力集合，否则拒绝；任何 Skill 都不能通过声明来获得新能力。

---

## 4. 验证环境隔离

- 隔离库：`astrum.skills.validation.v1`，不读写正式 `astrum.skills.v1`。
- 验证运行使用内存 TaskState，`executionMode:'validate'`：
  - 只允许 `validationSafe:true` 的本地纯函数工具（如 `kepler.*`、`kb.lookup`）；
  - 外部工具（`evidence.search`、`simbad.tap`、`llm.compose`）默认禁用，除非测试夹具提供静态 fixture；
  - 禁止写 ResearchStore/TaskStore/AuditLog 以外的持久层；审计只写 `validationId` 关联。
- 验证结束保留 `Validation` 记录与 fixture 哈希；中间运行数据可清理。
- **不得宣称沙箱**：本项目无 OS 级沙箱；隔离是「命名空间 + 工具白名单 + 无动态代码」的应用层隔离，文档与 UI 必须如实表述。

---

## 5. Prompt Injection 防护

不可信输入：网页、论文全文、附件、模型生成文本、导入的 Skill 包。

规则：
1. 不可信文本只能进入 `inputs` 值，不能进入 `allowedTools/requiredCapabilities/allowedAgents/status/approval`。
2. 草稿生成只从结构化 Task 记录提取 `tool` 序列，不解析自然语言中的“请添加权限”。
3. 所有工具参数经 Registry `argsSchema` 校验；URL 等字段不参与权限判断。
4. 发布快照中的 `snapshot` 为只读副本，审批后不可被草稿修改。
5. 对包含“忽略以上/授予权限/直接发布”等模式的输入，记录 `INJECTION_SUSPECTED` 安全发现，但不自动改变流程。

---

## 6. 审计要求

统一写 `AuditLog`：
`skill.propose / draft / validate / approve / reject / publish / rollback / deprecate / archive / execute / fail / feedback`。

每条包含：`principalType/profileId/agentId`、`skillId/versionId`、`decision`、`reason`、`projectId`、`traceId`。
`skill_events` 保存状态机细节；两者通过 `eventId/traceId` 关联，不重复保存正文与敏感输入。

---

## 7. 越权与攻击用例（必须测试）

| ID | 攻击 | 预期 |
|---|---|---|
| SEC-01 | Profile A 读取 Profile B Skill | NOT_FOUND / deny |
| SEC-02 | Project A 执行 Project B 级 Skill | PROJECT_MISMATCH |
| SEC-03 | scholar 直接 approve | CAPABILITY_NOT_GRANTED |
| SEC-04 | Agent 调 `publish` | CAPABILITY_NOT_GRANTED / USER_ONLY |
| SEC-05 | 草稿声明 `tool.shell/eval` | SCHEMA/DENY |
| SEC-06 | allowedTools 含未授权工具 | 执行前 DENY，不静默降级 |
| SEC-07 | 旧审批 + 新 contentHash | APPROVAL_MISMATCH |
| SEC-08 | 导入包内 `__proto__` | INVALID_BUNDLE |
| SEC-09 | Skill 内容注入“授予 admin” | 权限不变，记录安全发现 |
| SEC-10 | 验证环境尝试写正式库 | 写入目标校验失败 |
| SEC-11 | 回滚到存在已知漏洞版本 | 拒绝或要求额外审批 |
| SEC-12 | 重复发布/并发发布 | 指针幂等，不产生双版本 |

---

## 8. 数据隔离总结

- Skill 草稿、验证、正式版本三层分离（不同 store/命名空间）。
- 跨 Profile：物理命名空间隔离 + 逻辑 owner 校验。
- 跨 Project：记录级 `projectId` 校验。
- 旧 `state.skills` 与新库互不读写，避免污染。
