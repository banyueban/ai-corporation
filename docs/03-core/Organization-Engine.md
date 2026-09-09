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

### 2.1 Milestone 3 首个切片的固定边界

用户已决定首个 Organization 切片按以下方式交付：

- 只有当前 Plan 为 `APPROVED/VALID` 时，界面才提供“开始组队”；用户必须明确点击，批准 Plan 不会自动组队；
- 点击后只生成、校验、保存并展示 `DRAFT` 团队草案，展示 Task 分工、职责分离和真实能力缺口；
- 使用应用内置且有版本号的 Planner、Executor、Judge 模板和确定性分配规则，不调用模型；
- 草案只记录模型策略，不绑定精确 Provider 或模型；真正运行 Agent 时再由后续任务选择；
- 本切片不创建 Agent Instance/Run，不激活团队、不开始 Task，也不改变 Corporation 的 `DRAFT` 状态。
- `HUMAN_DECISION` Task 的责任人标记为用户，不分配给 Executor，后续执行到该 Task 时必须等待用户本人决定；
- Executor 使用三类固定能力组：分析与文档、软件实现、质量验收。计划用到哪一类才创建哪一类，同类 Task 由同一个 Executor 负责，最多三个 Executor。

这些限制只约束首个垂直切片。后续新增激活、运行时选模或其他 API 方言时，应新增任务单元，不得把它们暗中并入草案生成。

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

Milestone 3 首个切片不使用尚未固定阈值的相似度计算。它按 Task 类型和必需能力路径映射到三个稳定能力组：

- 分析与文档：`ANALYSIS`、`GENERATION`、`TRANSFORMATION`，以及 `analysis.*`、`writing.*`；
- 软件实现：必需能力包含 `software.*` 的实现 Task；普通文档即使需要写入工作区，仍归分析与文档；
- 质量验收：`VALIDATION` 或 `quality.*`；
- `HUMAN_DECISION` 不进入任何 Executor 能力组，责任人固定为用户。

同一 Task 命中多个能力组时，优先级为软件实现、质量验收、分析与文档。无法映射或超出内置模板能力的强制要求形成结构化能力缺口，不静默创建第四类 Executor。

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
- Executor/Specialist：存在机器 Task 时 1–3，全部为 `HUMAN_DECISION` 时为 0；
- Judge：1；
- 活跃 Agent Instance 总数：最多 5；
- 并行活跃 Run：最多 2。

超过上限进入能力缺口或请求用户确认，不静默扩大成本。

## 5. Agent Definition 选择

Milestone 3 首个切片只使用应用内置且有版本号的 Planner、Executor、Judge 模板。插件定义、项目临时定义和模型生成角色说明不进入该切片；没有模板能够覆盖的能力必须如实记录为能力缺口，不能现场虚构角色。精确 Provider 和模型也不在组队草案阶段选择。

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

### 7.1 v0.1 团队激活边界

用户确认团队时，应用为 Planner、全部 Executor、Judge 分别保存三组运行模型配置；同组成员共用配置，三组可以选择不同的 Provider 和精确模型。每个选择都必须来自当前 `ENABLED`、Key 存在、连接测试仍与当前 Provider 版本一致且状态为 `VERIFIED` 的 Provider，模型必须仍在该次验证返回的模型列表中。角色选择不修改 Provider 设置中的默认模型，也不要求或发起生成测试。

确认成功只把当前 `DRAFT` organization version 激活并原子创建对应 Agent Instance；不创建 Agent Run、不调用 Provider、不开始 Task。Corporation 继续保持 `DRAFT`，界面显示“团队已激活，等待开始执行”。“开始执行”必须由后续独立用户动作和任务单元交付。

存在 `BLOCKING` 能力缺口时禁止激活。存在 `DEGRADED` 缺口时，用户必须在本次确认命令中明确接受当前草案列出的全部可降级缺口；应用不得默认接受。

激活时保存 Provider ID、Provider 版本、模型 ID、API dialect 和角色策略快照，但不复制 Key。激活后 Provider 被修改、禁用、删除 Key、失去有效连接验证或模型不再位于已验证列表时，已激活团队及快照仍保留且不可原地改写；后续“开始执行”必须拒绝，并要求用户重新配置后生成和激活新的 organization version。

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
- 每个非 `HUMAN_DECISION` Task 有且只有一个责任 Agent；`HUMAN_DECISION` Task 有且只有一个用户责任人；
- 关键任务满足生产/验收分离；
- 能力缺口以结构化方式阻断或降级；
- 团队变更可版本化和追踪。
