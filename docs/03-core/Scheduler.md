# Scheduler 调度系统详细设计

## 1. 定位

Scheduler 回答三个问题：

1. 下一个执行哪个 Task；
2. 由哪个 Agent/Worker 执行；
3. 通过哪个模型路由和资源配额执行。

Scheduler 不负责拆任务、执行任务或评价产物。

## 2. 调度输入

```ts
type SchedulingRequest = {
  corporation: CorporationSnapshot;
  readyTasks: Task[];
  agentInstances: AgentInstance[];
  modelRoutes: ModelRoute[];
  toolAvailability: ToolAvailability[];
  providerHealth: ProviderHealth[];
  budgetRemaining: BudgetSnapshot;
  concurrency: ConcurrencySnapshot;
  policy: CorporationPolicy;
};
```

## 3. 硬约束与软目标

### 3.1 硬约束

不满足即淘汰候选：

- 必需能力；
- 必需工具；
- Agent 状态可用；
- 数据地域/本地策略；
- 风险等级与权限；
- 模型上下文和 Tool Calling 能力；
- 剩余预算；
- 职责分离；
- 并发限制；
- 用户固定选择。

### 3.2 软目标

- 预计质量；
- 历史可靠性；
- 成本；
- 延迟；
- 当前负载；
- 上下文复用；
- Provider 健康度。

## 4. 候选评分

所有指标归一化到 0–1：

```text
score =
0.35 × capability_match
+ 0.25 × reliability
+ 0.15 × quality_estimate
+ 0.10 × cost_efficiency
+ 0.08 × latency_efficiency
+ 0.05 × context_affinity
+ 0.02 × provider_health
- penalties
```

这不是永久真理。权重属于版本化 `SchedulingPolicy`，更改需 Decision Record。

### 4.1 冷启动

历史样本不足时：

- 使用 Provider/模型声明能力；
- 使用内置基准先验；
- 降低置信度；
- 不把 1–2 次成功放大成稳定能力；
- 默认选择成本可控的平衡路线。

### 4.2 可靠性

使用 Beta 先验平滑：

```text
reliability = (successes + α) / (attempts + α + β)
```

v0.1 可取 `α=2, β=1`，并按任务能力域分别统计。样本量和置信度必须一同展示。

### 4.3 成本效率

成本是约束与优化目标，不简单地“越便宜越好”：

```text
expected_total_cost =
single_attempt_cost / max(expected_pass_rate, floor)
```

低价但高重试率的候选可能更贵。

## 5. Task 优先级

Ready Task 排序：

```text
task_priority =
user_priority
+ critical_path_bonus
+ unblock_count_bonus
+ aging_bonus
- risk_wait_penalty
```

- 关键路径优先；
- 能解锁更多下游的任务优先；
- 长时间等待获得 aging，避免饥饿；
- 高风险任务若缺审批，不占执行槽位。

## 6. 调度流程

```text
读取 Ready Tasks
  → 按任务优先级排序
  → 生成 Agent 候选
  → 过滤硬约束
  → 为每个 Agent 生成 Model Route 候选
  → 评分
  → 预算预留
  → 原子领取 Task
  → 创建 Agent Run
```

若领取失败，说明并发状态已变化，重新读取，不直接覆盖。

## 7. 模型路由

Model Route 表示 Provider、模型和参数策略的组合：

```ts
type ModelRoute = {
  id: string;
  providerId: string;
  modelId: string;
  capabilities: string[];
  qualityTier: "FAST" | "BALANCED" | "HIGH";
  dataPolicy: "REMOTE_ALLOWED" | "LOCAL_ONLY";
  maxContextTokens: number;
  supportsJsonSchema: boolean;
  supportsTools: boolean;
  estimatedInputCostMicrosPerM: string;
  estimatedOutputCostMicrosPerM: string;
};
```

默认策略：

- Planner：平衡或高质量；
- Executor：按任务能力与成本；
- Judge：高可靠，必要时与 Executor 不同路线；
- 格式修复、摘要等低风险步骤：快速低成本路线。

## 8. 预算预留与结算

在运行前预留最坏可接受成本，避免并行任务共同超支：

1. 估算本次调用上限；
2. 在 Budget Ledger 创建 reservation；
3. 成功领取 Task 后生效；
4. 完成时按实际结算并释放差额；
5. 失败或取消释放未用部分；
6. 预算到达硬上限时不再调度。

金额使用整数微单位。

## 9. Provider 健康与熔断

状态：

- `HEALTHY`
- `DEGRADED`
- `OPEN`
- `HALF_OPEN`

规则：

- 连续瞬时错误达到阈值后短暂熔断；
- 认证、配额耗尽等确定性错误立即 `OPEN`；
- 半开只允许一个探测请求；
- 熔断状态持久化短期信息，重启后不过度重试；
- 回退必须符合数据策略和预算。

## 10. 并发与公平

默认限制：

- 应用级活跃 Corporation：1；
- Corporation 活跃 Task：2；
- Agent Instance 活跃 Run：1；
- Provider 并发：按配置；
- 高成本模型并发：1。

未来多 Corporation 时使用加权公平队列。v0.1 先保留接口，不实现复杂抢占。

## 11. 重新调度

触发：

- Provider 熔断；
- Run 在开始前失败；
- Agent 不可用；
- 超时；
- 能力不匹配由 Evaluation 证实；
- 用户更改模型策略。

正在发生不可逆工具副作用时不得抢占或迁移。只有到达安全检查点后才重新调度。

## 12. 决策记录

```ts
type SchedulingDecision = {
  taskId: string;
  selectedAgentId?: string;
  selectedModelRouteId?: string;
  candidateScores: CandidateScore[];
  exclusions: CandidateExclusion[];
  policyVersion: number;
  budgetReservationId?: string;
  decidedAt: string;
};
```

记录用于调试、复盘和后续能力学习，不保存明文密钥或完整 Prompt。

## 13. 服务接口

```ts
interface Scheduler {
  schedule(corporationId: string): Promise<ScheduleBatch>;
  rankTask(task: Task, context: SchedulingContext): number;
  rankCandidate(input: CandidateInput): CandidateScore;
  reserveBudget(input: ReservationRequest): Promise<Reservation>;
  releaseReservation(id: string): Promise<void>;
  reportOutcome(outcome: RunOutcome): Promise<void>;
}
```

## 14. 测试重点

- 硬约束过滤；
- 冷启动评分；
- 评分确定性；
- 并发预算预留；
- 原子 Task 领取；
- Provider 熔断与半开；
- 关键路径优先与 aging；
- 数据策略阻止错误回退；
- 失败结果更新按能力域统计。

## 15. v0.1 完成标准

- 在多个 Ready Task 中稳定选择下一任务；
- 在多个 Agent/模型候选中输出可解释决策；
- 并发运行不突破预算与槽位；
- Provider 故障能安全回退或暂停；
- 调度结果可由事件和 Decision Record 完整追踪。

