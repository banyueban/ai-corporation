# Task Engine 详细设计

## 1. 职责

Task Engine 将 Goal Contract 转换为可执行 DAG，并负责整个任务生命周期。

负责：

- 计划生成、验证和版本管理；
- 依赖满足计算；
- 状态迁移；
- 任务租约与并发；
- 失败分类、重试与重规划；
- 暂停、恢复、取消；
- 汇总 Corporation 进度。

不负责：

- 直接调用模型或工具；
- 决定具体模型厂商；
- 执行验收逻辑；
- 绕过 Policy Engine。

## 2. Task 合同与运行记录

```ts
type TaskRuntimeRecord = {
  id: string;
  corporationId: string;
  planVersion: number;
  contract: TaskContract;
  status: TaskStatus;
  attempt: number;
  assignedAgentId?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  createdAt: string;
  updatedAt: string;
};
```

不可变的目标、能力、工具、输入、输出、验收、预算、重试、权限、假设和非目标只由 [Task Protocol 的 `TaskContract`](../04-protocols/Task-Protocol.md)定义，并以 `task.contract_json` 保存版本化快照。Task Engine 不复制合同字段；`TaskRuntimeRecord` 只附加状态、分配、尝试次数和租约等运行事实。

依赖边独立存储：

```ts
type TaskDependency = {
  upstreamTaskId: string;
  downstreamTaskId: string;
  condition: "ON_SUCCESS" | "ON_COMPLETION";
  requiredArtifactTypes?: string[];
};
```

v0.1 UI 只允许 `ON_SUCCESS`，内部保留 `ON_COMPLETION` 供清理或复盘任务使用。

## 3. 任务粒度规则

一个 Task 应满足：

1. 单一主目标；
2. 一个 Agent Run 能在预算内完成；
3. 输入可通过 Artifact 引用表达；
4. 输出有明确类型；
5. 能由一个或多个验收器判定；
6. 失败可局部重试，不必重做整个项目。

拆分信号：

- 预计需要不同能力；
- 产生可复用中间产物；
- 存在可并行分支；
- 某部分风险或权限明显更高；
- 验收方法不同；
- 单次上下文预计超过模型预算。

不拆分信号：

- 子步骤没有独立产物；
- 拆分只会增加 Agent 传递损耗；
- 所谓子任务只是同一推理链的内部步骤。

## 4. 状态机

```text
DRAFT
  → BLOCKED        依赖未满足
  → READY          依赖满足且合同完整
  → RUNNING        已获取租约
  → VERIFYING      已产生候选 Artifact
  → COMPLETED      验收通过

RUNNING / VERIFYING
  → WAITING_HUMAN  需要审批或决策
  → RETRY_PENDING  可恢复失败
  → REPLAN_REQUIRED 计划缺陷或能力缺口
  → FAILED         不可恢复或超过限制

非终态
  → PAUSED
  → CANCELLED
```

### 4.1 合法迁移

| From | To | 条件 |
|---|---|---|
| DRAFT | BLOCKED | 合同有效但存在未完成依赖 |
| DRAFT/BLOCKED | READY | 所有依赖满足、输入可用、验收完整 |
| READY | RUNNING | Scheduler 成功领取租约 |
| RUNNING | VERIFYING | Run 成功提交候选 Artifact |
| VERIFYING | COMPLETED | 必需验收全部 PASS |
| VERIFYING | RETRY_PENDING | 可修订问题且未达上限 |
| 任意非终态 | WAITING_HUMAN | 缺权限、歧义或高风险决策 |
| RETRY_PENDING | READY | 已生成新尝试上下文 |
| 任意非终态 | REPLAN_REQUIRED | 任务合同本身不可执行 |
| REPLAN_REQUIRED | DRAFT | 新计划版本接受该任务 |
| 任意非终态 | FAILED | 不可恢复或资源上限达到 |
| 任意非终态 | PAUSED | 用户或系统暂停 |
| PAUSED | BLOCKED/READY | 根据依赖重新计算 |

状态迁移必须通过 `TaskStateMachine.transition`，禁止直接更新字段。

## 5. 计划生成

### 5.1 Planner 输出

Planner 必须返回符合 `TaskPlanDraft` Schema 的 JSON：

```json
{
  "summary": "生成项目设计文档并验证一致性",
  "tasks": [],
  "dependencies": [],
  "milestones": [],
  "assumptions": [],
  "risks": []
}
```

### 5.2 计划验证器

按顺序检查：

1. Schema；
2. ID 唯一性；
3. DAG 无环；
4. 至少一个入口和一个终点；
5. 所有输入引用存在或由上游输出；
6. 每个叶子 Task 有验收标准；
7. 预算合计不超过 Corporation 预算；
8. 权限需求未超过全局硬限制；
9. 任务数处于 2–20；超出需压缩或用户确认；
10. 每个 Task 预估可由单个 Run 完成。

### 5.3 计划修复

- 纯格式问题：本地修复或一次 Schema Repair；
- DAG/引用问题：返回 Planner 结构化错误重新生成；
- Goal Contract 歧义：进入 `WAITING_HUMAN`；
- 最多自动修复 2 次。

## 6. Ready 计算

当以下条件全部满足，Task 可进入 `READY`：

- Corporation 为 `EXECUTING`；
- Task 未暂停/取消；
- 所有 `ON_SUCCESS` 上游为 `COMPLETED`；
- 所需 Artifact Version 存在且未被撤销；
- 合同完整；
- 有剩余预算；
- 至少存在一个合格 Worker 候选；
- 没有待处理的阻断审批。

依赖或 Artifact 变化后由事件触发重算，不使用高频轮询。

## 7. 调度与租约

Scheduler 调用：

```ts
claimReadyTask(input: {
  taskId: string;
  workerId: string;
  leaseDurationMs: number;
}): Promise<ClaimResult>;
```

规则：

- 领取必须为条件更新；
- 租约定期续期；
- 应用休眠导致租约过期时，恢复服务先判定 Run 状态；
- 同一 Task 不允许两个 Run 同时提交最终 Artifact；
- 并行候选评审需显式创建多个 child Task，不复用租约机制。

## 8. 失败分类与处理

| 类别 | 示例 | 默认处理 |
|---|---|---|
| TRANSIENT_PROVIDER | 限流、网络超时 | 退避重试 |
| INVALID_MODEL_OUTPUT | JSON 不合法 | 修复一次，再换模型/失败 |
| TOOL_FAILURE | 命令退出码非零 | 将证据交给 Agent 修订 |
| POLICY_DENIED | 越权访问 | 不重试，重规划或用户审批 |
| ACCEPTANCE_FAILED | 缺章节、测试失败 | 带反馈修订 |
| PLAN_DEFECT | 输入不存在、依赖错误 | `REPLAN_REQUIRED` |
| CAPABILITY_GAP | 候选均不胜任 | 换 Worker 或请求用户 |
| BUDGET_EXHAUSTED | Token/费用达上限 | 暂停并请求追加预算 |
| CANCELLED | 用户取消 | 终止，不重试 |
| UNKNOWN_SIDE_EFFECT | 工具结果不确定 | `WAITING_HUMAN` |

自动尝试总数默认 3，其中验收修订最多 2 次。重试必须改变至少一个因素：上下文、Prompt、Worker、工具策略或计划；完全相同的盲重试被禁止。

## 9. 重规划

触发条件：

- 原任务合同不可执行；
- 必需能力或工具不存在；
- 上游 Artifact 与预期不匹配；
- Goal Contract 发生重大变更；
- 连续修订未通过且 Judge 指向计划缺陷。

重规划原则：

- 创建新 `planVersion`；
- 已完成且仍有效的 Task 不重复执行；
- 通过 Artifact 哈希和合同兼容性判断复用；
- 旧计划只读保留；
- 高影响重规划需用户确认。

## 10. 暂停、取消和关机

- 暂停：不启动新 Task，尝试让当前步骤到达检查点；
- 立即取消：发送取消令牌，未提交 Artifact 不成为正式版本；
- 正常退出：等待最多配置的宽限时间，随后保存恢复记录；
- 强制退出：由启动恢复扫描处理。

## 11. 进度计算

不以 Agent 文本声明计算进度。v0.1 使用加权任务状态：

```text
progress =
Σ(task_weight × state_factor) / Σ(task_weight)
```

状态系数：

- DRAFT/BLOCKED/READY：0
- RUNNING：0.25
- VERIFYING：0.75
- COMPLETED：1
- CANCELLED：从分母排除或按计划版本重新计算

`task_weight` 默认由预估复杂度 1–5 决定。UI 明确标注进度为估算。

## 12. 服务接口

```ts
interface TaskEngine {
  createPlan(goal: GoalContract): Promise<TaskPlan>;
  validatePlan(plan: TaskPlanDraft): Promise<PlanValidationResult>;
  approvePlan(planId: string): Promise<void>;
  listReadyTasks(corporationId: string): Promise<Task[]>;
  claimTask(command: ClaimTaskCommand): Promise<ClaimResult>;
  transition(command: TransitionTaskCommand): Promise<Task>;
  pause(taskId: string): Promise<void>;
  resume(taskId: string): Promise<void>;
  cancel(taskId: string): Promise<void>;
  requestReplan(input: ReplanRequest): Promise<TaskPlan>;
  recover(corporationId: string): Promise<RecoveryReport>;
}
```

## 13. 事件

- `plan.draft.created`
- `plan.validation.failed`
- `plan.approved`
- `task.created`
- `task.ready`
- `task.claimed`
- `task.state.changed`
- `task.retry.scheduled`
- `task.replan.requested`
- `task.completed`
- `task.failed`
- `task.cancelled`

事件必须包含旧状态、新状态、原因代码和关联 ID。

## 14. 测试重点

- 所有合法/非法状态迁移；
- 环检测；
- Artifact 输入闭合；
- 并发领取仅一方成功；
- 租约过期恢复；
- 暂停/取消竞态；
- 预算耗尽；
- 失败分类与重试上限；
- 重规划复用已完成任务；
- 事务回滚后状态与事件一致。

## 15. v0.1 模块验收断言

- 可从 Goal Contract 生成 2–20 个任务的有效 DAG；
- 支持顺序和最多两个并行任务；
- 状态机、租约、暂停、恢复、取消可运行；
- 验收失败可触发带反馈修订；
- 应用异常退出后不会重复提交已确认的文件变更。
