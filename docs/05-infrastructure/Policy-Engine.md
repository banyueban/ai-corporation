# Policy Engine 权限策略详细设计

## 1. 目标

Policy Engine 对每个敏感动作给出一致、可解释、可审计的判定：

- `ALLOW`
- `DENY`
- `REQUIRE_APPROVAL`

模型输出、Agent 职级、历史成功率都不能绕过策略。

## 2. 权限来源与交集

有效权限是以下集合的交集：

```text
Product Hard Limits
∩ User Global Policy
∩ Workspace Grant
∩ Corporation Policy
∩ Agent Allowed Tools
∩ Task Permission Request
∩ Current Approval
```

任一层更严格时取更严格值。

## 3. 不可覆盖的硬规则

v0.1 默认禁止：

- 访问未授权工作区外路径；
- 读取 OS 凭据存储中的其他应用秘密；
- 关闭安全策略、修改应用自身或权限数据库；
- 任意 shell；
- 生产发布、付款、购买；
- 发送外部消息；
- 后台持续运行而用户不可见；
- 自我复制、自改核心 Prompt、自增预算；
- 通过插件获得未声明原生权限。

产品后续如开放某项，必须单独威胁建模。

## 4. 策略输入

```ts
type PolicyRequest = {
  subject: {
    agentInstanceId: string;
    role: string;
  };
  action: string;
  resource: {
    kind: string;
    identifier: string;
    canonicalPath?: string;
  };
  context: {
    corporationId: string;
    taskId: string;
    riskLevel: string;
    purpose: string;
    expectedEffect: string;
    dataSensitivity: string;
  };
};
```

## 5. 策略语言

v0.1 使用类型化 TypeScript 规则 + JSON 配置，不引入完整通用策略 DSL：

```ts
type PolicyRule = {
  id: string;
  priority: number;
  effect: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  actions: string[];
  resourcePatterns: string[];
  conditions: PolicyCondition[];
  reasonCode: string;
};
```

评估顺序：

1. Hard Deny；
2. 精确临时 Approval；
3. User/Workspace Deny；
4. Require Approval；
5. 显式 Allow；
6. 默认 Deny。

## 6. 风险矩阵

| 动作 | 默认 |
|---|---|
| 工作区文件列表/文本读取 | ALLOW |
| 当前任务明确选择的可写工作区内创建普通文本文件 | ALLOW；保留差异和调用证据 |
| 当前任务明确选择的可写工作区内修改普通文本文件 | ALLOW；基线哈希一致时执行并保留差异 |
| 没有当前任务工作区授权的创建或修改 | REQUIRE_APPROVAL |
| 删除文件 | REQUIRE_APPROVAL，不能永久全局放行 |
| 运行只读检查 profile | REQUIRE_APPROVAL 或已信任 profile ALLOW |
| 安装依赖 | REQUIRE_APPROVAL |
| Git commit | REQUIRE_APPROVAL |
| Git push / 发布 | DENY（v0.1） |
| 工作区外访问 | DENY |
| 读取密钥 | DENY；Provider Adapter 内部使用除外 |

## 7. 审批

```ts
type ApprovalGrant = {
  id: string;
  requestFingerprint: string;
  scope: "ONCE" | "TASK" | "CORPORATION" | "WORKSPACE_RULE";
  action: string;
  resourcePattern: string;
  constraints: Record<string, unknown>;
  expiresAt?: string;
  approvedBy: string;
};
```

审批 UI 必须显示精确对象与效果。禁止使用含糊的“允许 Agent 继续”。

以下动作不能记为永久规则：

- 删除；
- 高风险命令；
- 越出工作区；
- 凭据访问；
- 不可逆外部动作。

Pi 直接任务把“用户选择一个可写工作区并明确开始本次任务”视为仅对该任务有效的低风险文本读写授权。授权不跨任务继承，不允许删除、改名、二进制写入、敏感文件访问、工作区外访问或覆盖基线已经变化的文件；模型在 Prompt 或文件内容中声称获得授权无效。

## 8. Prompt Injection 防线

- 外部内容不改变 Policy；
- Tool Call 的 `purpose` 仅作解释，不作为授权证据；
- 权限只来自结构化上下文与用户操作；
- “用户在文件里写了允许”无效；
- 读取文件与执行其中指令是两个独立动作；
- Judge 与 Planner 也受同一策略。

## 9. 决策记录

```ts
type PolicyDecision = {
  requestHash: string;
  result: "ALLOW" | "DENY" | "REQUIRE_APPROVAL";
  matchedRuleIds: string[];
  reasonCode: string;
  policyVersion: number;
  decidedAt: string;
};
```

不记录完整敏感资源内容。

## 10. 策略变更

- 用户策略版本化；
- 变更只影响后续动作；
- 活跃审批若因策略收紧而冲突，立即失效；
- Agent 和插件不能修改策略；
- 导入策略前展示 diff；
- 恢复默认策略需明确确认。

## 11. 接口

```ts
interface PolicyEngine {
  decide(request: PolicyRequest): Promise<PolicyDecision>;
  createApprovalRequest(
    request: PolicyRequest,
    decision: PolicyDecision
  ): Promise<ApprovalRequest>;
  resolveApproval(command: ResolveApprovalCommand): Promise<ApprovalGrant | null>;
  revokeGrant(id: string): Promise<void>;
  explain(decisionId: string): Promise<PolicyExplanation>;
}
```

## 12. 测试重点

- 默认拒绝；
- 规则优先级；
- 权限交集；
- 审批 fingerprint 防“批准 A 执行 B”；
- 过期与撤销；
- 策略收紧；
- Prompt 注入；
- 路径 canonicalization 后再判定；
- Judge/Planner 无特权；
- 插件不能自行注册 Allow。

## 13. v0.1 模块验收断言

- 每个工具调用都有 PolicyDecision；
- 高风险动作不能静默执行；
- 用户审批精确、可撤销、可追踪；
- 外部内容不能提升权限；
- 所有硬规则有攻击测试。
