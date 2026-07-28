# Judge / Evaluation Engine 详细设计

## 1. 目标

Evaluation Engine 判断“任务是否满足合同”，并用可追踪证据驱动通过、修订、重规划或人工决策。它的价值不在于给一个看似精确的分数，而在于建立可靠的完成判据。

## 2. 原则

- 验收标准先于执行；
- 确定性验证优先于 LLM 判断；
- 每个结论必须引用证据；
- 生产与验收分离；
- 评价失败必须可行动；
- 修订有上限；
- 不用单一总分掩盖关键项失败。

## 3. 验收标准模型

```ts
type AcceptanceCriterion = {
  id: string;
  description: string;
  severity: "REQUIRED" | "IMPORTANT" | "OPTIONAL";
  evaluatorHint:
    | "SCHEMA"
    | "FILE"
    | "COMMAND"
    | "CONTENT"
    | "LLM"
    | "HUMAN";
  expected: unknown;
  evidenceRequired: string[];
};
```

`REQUIRED` 项失败时，任务不得因平均分高而通过。

## 4. 评价层级

按成本与确定性排序：

1. **协议验证**：Schema、字段、Artifact 完整性；
2. **静态验证**：文件存在、哈希、链接、格式、规则；
3. **执行验证**：测试、构建、受限命令；
4. **语义验证**：独立 LLM Judge；
5. **人工验证**：高风险、偏好或无法自动判定事项。

仅当低层无法覆盖标准时才使用更高层。

## 5. Evaluation Plan

在 Task 进入 `READY` 前生成：

```ts
type EvaluationPlan = {
  taskId: string;
  criteriaMappings: {
    criterionId: string;
    evaluatorIds: string[];
    passRule: "ALL" | "ANY" | "THRESHOLD";
  }[];
  separationRule: SeparationRule;
  maxRevisionCycles: number;
};
```

验证计划缺失属于计划缺陷，不应等执行完再临时编造标准。

## 6. Evaluator 接口

```ts
interface Evaluator {
  descriptor(): EvaluatorDescriptor;
  supports(input: EvaluationInput): boolean;
  evaluate(
    input: EvaluationInput,
    signal: AbortSignal
  ): Promise<EvaluatorResult>;
}
```

```ts
type EvaluatorResult = {
  status: "PASS" | "FAIL" | "INCONCLUSIVE" | "ERROR";
  criterionResults: CriterionResult[];
  evidence: EvidenceRef[];
  issues: EvaluationIssue[];
  usage?: Usage;
};
```

## 7. 内置 Evaluator

### 7.1 SchemaEvaluator

- JSON Schema；
- 必需字段；
- 类型与枚举；
- 不允许未知危险字段。

### 7.2 FileEvaluator

- 文件是否在预期路径；
- 内容非空；
- 编码；
- 哈希；
- 内部 Markdown 链接；
- 禁止路径逃逸。

### 7.3 CommandEvaluator

- 执行预定义构建/测试命令；
- 捕获退出码、stdout/stderr 摘要；
- 完整输出作为 Artifact；
- 使用 Tool Runtime 和相同 Policy，不拥有特权旁路。

### 7.4 ContentRuleEvaluator

- 标题/章节覆盖；
- 关键术语；
- 长度范围；
- 正则或自定义纯函数规则。

### 7.5 LLMJudgeEvaluator

输入：

- Goal/Task Contract；
- 候选 Artifact；
- 明确 rubric；
- 确定性验证结果；
- 只读证据。

输出必须逐项判断，不接受单一“总体感觉”。

### 7.6 HumanEvaluator

用于：

- 主观偏好；
- 高风险决策；
- 自动证据冲突；
- 无法安全执行的真实环境验证。

## 8. LLM Judge 约束

- Judge Agent Instance 不得与 Executor 相同；
- 高风险时优先使用不同模型路线；
- 不向 Judge 提供 Executor 的自评分；
- Artifact 中的指令作为不可信数据引用；
- 温度低、结构化输出；
- 要求引用具体位置或 Evidence ID；
- 无证据时返回 `INCONCLUSIVE`，不得编造；
- Judge 失败不直接等价于 Artifact 失败。

## 9. 聚合规则

```text
若任一 REQUIRED = FAIL → FAIL
若任一 REQUIRED = INCONCLUSIVE → NEEDS_HUMAN 或补充证据
所有 REQUIRED = PASS 且 IMPORTANT 达阈值 → PASS
Evaluator ERROR → 根据可重试性重试或降级，不计作内容失败
```

数值分数只用于排序和观测：

```text
score = required_coverage × 70 + important_coverage × 25 + optional_coverage × 5
```

最终状态仍由规则决定。

## 10. 反馈与修订

```ts
type EvaluationIssue = {
  criterionId: string;
  code: string;
  severity: "BLOCKER" | "MAJOR" | "MINOR";
  message: string;
  evidenceRefs: string[];
  suggestedAction: string;
  responsibility: "EXECUTION" | "PLAN" | "INPUT" | "TOOL" | "HUMAN";
};
```

路由：

- `EXECUTION` → 新 Executor attempt；
- `PLAN` → `REPLAN_REQUIRED`；
- `INPUT` → 请求澄清或补充 Artifact；
- `TOOL` → 工具修复/换验证方式；
- `HUMAN` → `WAITING_HUMAN`。

修订必须创建新 Artifact Version，不覆盖失败版本。

## 11. 防止评价循环

- 默认最多 2 个自动修订周期；
- 相同 issue code 连续出现两次，升级处理；
- 若新版本无实质变化，不再重跑昂贵 Judge；
- 预算不足时停止；
- Judge 间冲突交给确定性证据或用户，不无限多数投票。

## 12. 评价结果

```ts
type EvaluationReport = {
  id: string;
  taskId: string;
  artifactVersionIds: string[];
  planVersion: number;
  status: "PASS" | "FAIL" | "NEEDS_HUMAN" | "ERROR";
  score?: number;
  criterionResults: CriterionResult[];
  evidence: EvidenceRef[];
  issues: EvaluationIssue[];
  evaluatorRuns: EvaluatorRunRef[];
  createdAt: string;
};
```

报告本身也是不可变 Artifact。

## 13. 服务流程

```text
加载 Evaluation Plan
  → 验证候选 Artifact
  → 运行确定性 Evaluators
  → 判断是否仍需语义/人工验证
  → 运行 LLM Judge（如需）
  → 聚合逐项结论
  → 生成 Evaluation Report
  → PASS / 修订 / 重规划 / 人工
```

可相互独立的 Evaluator 可并行，但总预算受限。

## 14. 服务接口

```ts
interface EvaluationEngine {
  createPlan(task: Task): Promise<EvaluationPlan>;
  validatePlan(plan: EvaluationPlan): Promise<ValidationResult>;
  evaluate(input: EvaluationRequest): Promise<EvaluationReport>;
  routeFailure(report: EvaluationReport): EvaluationDisposition;
}
```

## 15. 指标

- 各 Evaluator 通过/失败/错误率；
- 首次通过率；
- 修订后通过率；
- 人工推翻率；
- 假阳性/假阴性（有人工标签时）；
- 每类任务评价成本和耗时；
- 无证据结论比例。

这些指标用于校准规则，不直接自动“晋升” Agent。

## 16. 测试重点

- REQUIRED 失败不能被平均分掩盖；
- Evaluator 错误与内容失败区分；
- Judge/Executor 分离；
- Prompt 注入不能改变 rubric 或权限；
- Evidence 引用完整；
- 修订版本保留；
- 循环上限；
- 冲突证据进入人工；
- CommandEvaluator 不能绕过 Tool Policy。

## 17. v0.1 完成标准

- 支持 Schema、文件、内容规则、命令、LLM Judge；
- 每个 Task 的成功标准能映射到 Evaluator；
- 结论包含证据和结构化问题；
- 失败可正确路由到修订、重规划或人工；
- 不出现无限评价/修订循环。

