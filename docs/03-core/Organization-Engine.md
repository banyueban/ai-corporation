# Organization Engine 详细设计

## 1. 目标

Organization Engine 根据 Goal Contract 与 Task Graph 创建“足以完成目标的最小临时团队”。它不模拟固定公司层级，也不因为任务复杂就无限增加 Agent。

核心原则：

- 目标决定组织；
- 角色来自责任边界，不来自拟人化职位；
- 优先复用可兼任角色，关键制衡角色必须分离；
- Agent 是可配置执行单元，模型只是其资源；
- 团队在 Corporation 结束后归档，不保持活跃。

## 2. 输入与输出

输入：

```ts
type OrganizationRequest = {
  goalContract: GoalContract;
  taskPlan: TaskPlan;
  availableAgentDefinitions: AgentDefinition[];
  providerCapabilities: ProviderCapability[];
  toolCatalog: ToolDescriptor[];
  policy: CorporationPolicy;
  budget: CorporationBudget;
};
```

输出：

```ts
type OrganizationPlan = {
  schemaVersion: "1.0";
  corporationId: string;
  version: number;
  agents: ProposedAgentInstance[];
  responsibilityAssignments: ResponsibilityAssignment[];
  separationConstraints: SeparationConstraint[];
  capabilityGaps: CapabilityGap[];
  estimatedCost: CostEstimate;
  rationale: DecisionReason[];
};
```

## 3. v0.1 角色模型

### 3.1 Planner

- 将 Goal Contract 转换为 Task Graph；
- 明确依赖、交付物、能力和验收标准；
- 根据结构化失败提出重规划；
- 不执行高风险工具；
- 不能批准自己的计划风险豁免。

### 3.2 Executor

- 执行一个或多个能力相近的 Task；
- 通过 Artifact 提交结果；
- 只能使用被授权工具；
- 不可将“我认为完成”作为验收结论。

### 3.3 Judge

- 将成功标准映射到验证器；
- 审查证据并给出结构化结论；
- 不修改候选 Artifact；
- 对关键任务不得与 Executor 为同一 Agent Instance。

### 3.4 Specialist

当普通 Executor 缺少明确能力时创建，例如代码、研究或文档专家。Specialist 不自动获得更高权限。

### 3.5 Human

不是常驻 Agent。作为审批者、澄清者或最终决策者出现在任务图中。

## 4. 最小团队算法

### 4.1 责任集合

从 Task Graph 推导责任：

```text
PLAN
EXECUTE:<capability-cluster>
EVALUATE:<evaluation-family>
APPROVE:<risk-domain>
```

### 4.2 能力聚类

将任务按以下特征聚类：

- 所需能力路径；
- 工具集合；
- 数据边界；
- 风险等级；
- 上下文相似度；
- 是否可由同一模型策略执行。

v0.1 使用确定性加权相似度，不使用无监督学习：

```text
similarity =
0.40 × capability_overlap
+ 0.25 × tool_overlap
+ 0.20 × context_overlap
+ 0.15 × risk_compatibility
```

大于阈值的 Task 可由同一 Executor Agent Instance 承担。

### 4.3 角色合并

允许：

- 低风险项目中 Planner 兼任某些只读分析 Task 的 Executor；
- 同一 Executor 承担多个顺序任务；
- 同一 Judge 验收多个同类型 Artifact。

禁止：

- 关键 Task 的 Executor 成为唯一 Judge；
- 高风险工具申请者成为唯一审批者；
- Judge 直接修复被审 Artifact；
- Agent 同时持有互相冲突的策略配置。

### 4.4 规模上限

v0.1 默认：

- Planner：1；
- Executor/Specialist：1–3；
- Judge：1；
- 活跃 Agent Instance 总数：最多 5；
- 并行活跃 Run：最多 2。

超过上限进入能力缺口或请求用户确认，不静默扩大成本。

## 5. Agent Definition 选择

选择顺序：

1. 满足硬能力和工具要求；
2. 满足数据与 Provider 策略；
3. 满足职责分离；
4. 在合格候选中最小化预估成本；
5. 无合格定义时，基于受信模板创建临时 Definition；
6. 临时 Definition 不自动进入全局人才库。

Definition 来源：

- 内置、版本化模板；
- 用户显式安装的受信插件；
- 项目内临时定义。

模型生成的角色说明必须经过 Schema 验证和策略裁剪。

## 6. 能力缺口

```ts
type CapabilityGap = {
  taskIds: string[];
  capability: string;
  severity: "BLOCKING" | "DEGRADED";
  reason: string;
  alternatives: ("CHANGE_PLAN" | "ADD_PROVIDER" | "INSTALL_TOOL" | "ASK_HUMAN")[];
};
```

处理：

- `DEGRADED`：允许用户接受质量/成本权衡；
- `BLOCKING`：不得开始相关 Task；
- 不以虚构 Agent 或虚假能力评分掩盖缺口。

## 7. 组织版本与变更

组织变更触发：

- Task Plan 新版本；
- Provider 不可用；
- Agent 连续失败；
- 新的权限或能力需求；
- 用户替换模型/Agent。

每次变更生成新 `organizationVersion`。已运行的 Agent Run 保留原 Definition、模型和策略快照，确保审计可复现。

## 8. 决策解释

每个分配至少记录：

- 候选集合；
- 被排除候选及原因代码；
- 最终选择的能力匹配；
- 预估质量、成本、延迟；
- 适用的职责分离规则；
- 数据策略。

UI 只展示简洁说明，完整评分存 Decision Record。

## 9. 服务接口

```ts
interface OrganizationEngine {
  propose(request: OrganizationRequest): Promise<OrganizationPlan>;
  validate(plan: OrganizationPlan): Promise<OrganizationValidation>;
  activate(planId: string): Promise<Organization>;
  revise(input: OrganizationRevisionRequest): Promise<OrganizationPlan>;
  archive(corporationId: string): Promise<void>;
}
```

## 10. 测试重点

- 最小团队规模；
- 关键职责分离；
- 能力聚类稳定性；
- Provider/工具/数据策略过滤；
- 能力缺口不被虚构；
- 组织版本切换；
- 预算不足时拒绝扩张；
- 相同输入得到确定性结构（模型措辞差异除外）。

## 11. v0.1 模块验收断言

- 常规任务创建 Planner、1–3 个 Executor、Judge；
- 每个 Task 有且只有一个责任 Agent；
- 关键任务满足生产/验收分离；
- 能力缺口以结构化方式阻断或降级；
- 团队变更可版本化和追踪。
