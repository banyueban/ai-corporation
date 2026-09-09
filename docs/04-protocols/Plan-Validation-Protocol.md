# Plan Validation Protocol v1.0

## 1. 目的与边界

Plan Validation Protocol 定义 AI Corporation Desktop 如何把 `DRAFT/PENDING` Planner 草稿确定性验证为 `VALIDATED/VALID` 或 `DRAFT/INVALID`，并在通过时原子创建正式 Task 与依赖。验证完全在本地执行，不调用 Provider、不修改模型语义、不消耗 Planner 的一次 JSON/Schema 修复额度。

本协议只关闭 DAG、局部引用、输入输出、验收、预算、权限描述和单 Run 可行性验证。计划编辑、模型修复、重新规划、用户批准、启动执行、Organization、Agent、Artifact 实例和真实权限授予不在范围内。

## 2. 状态与公开结果

```ts
type PlanValidationStatus = "PENDING" | "VALID" | "INVALID";
type TaskPlanStatus = "DRAFT" | "VALIDATED" | "APPROVED" | "SUPERSEDED";

type PlanValidationIssueCode =
  | "TASK_COUNT_EXCEEDED"
  | "DUPLICATE_TASK_LOCAL_ID"
  | "DUPLICATE_ACCEPTANCE_LOCAL_ID"
  | "ACCEPTANCE_EVIDENCE_MISSING"
  | "DUPLICATE_OUTPUT_LOGICAL_NAME"
  | "UNKNOWN_TASK_REFERENCE"
  | "SELF_DEPENDENCY"
  | "DUPLICATE_DEPENDENCY"
  | "CYCLE_DETECTED"
  | "UNKNOWN_MILESTONE_TASK"
  | "DUPLICATE_MILESTONE_TASK"
  | "TASK_MISSING_REQUIRED_ACCEPTANCE"
  | "LEAF_MISSING_REQUIRED_OUTPUT"
  | "TASK_OUTPUT_NOT_FOUND"
  | "TASK_OUTPUT_NOT_UPSTREAM"
  | "TASK_OUTPUT_MEDIA_TYPE_MISMATCH"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "BUDGET_LIMIT_MISSING"
  | "BUDGET_COST_EXCEEDED"
  | "BUDGET_DURATION_EXCEEDED"
  | "BUDGET_REVISIONS_EXCEEDED"
  | "UNKNOWN_CAPABILITY"
  | "UNKNOWN_TOOL"
  | "UNSAFE_WORKSPACE_PATH"
  | "FORBIDDEN_PROCESS_PROFILE";

type PlanValidationWarningCode = "SINGLE_RUN_SIZE_WARNING";

type PlanValidationFinding = {
  code: PlanValidationIssueCode | PlanValidationWarningCode;
  path: string;
  taskId?: string;
  relatedTaskId?: string;
  logicalName?: string;
  actual?: number | string;
  limit?: number | string;
};

type PlanValidationReport = {
  schemaVersion: "1.0";
  validatorVersion: "1.0";
  planId: string;
  planVersion: number;
  status: "VALID" | "INVALID";
  issues: PlanValidationFinding[];
  warnings: PlanValidationFinding[];
  validatedAt: string;
};
```

公开 finding 只包含固定 code、受限 Schema 路径、可信 Task ID、受限 logical name 和数值，不包含模型正文、Goal 正文、Workspace 绝对路径、SQL、堆栈或自由文本远端错误。中文说明由 Renderer 根据固定 code 映射。

状态组合固定为：

- 尚未验证：`DRAFT/PENDING`，没有 report；
- 验证失败：`DRAFT/INVALID`，report 至少有一个 issue，不创建正式 Task；
- 验证通过：`VALIDATED/VALID`，report 没有 issue，可有 warning，并已经原子创建正式 Task 与依赖；
- `APPROVED` 只能保持 `VALID`；`SUPERSEDED` 保留最后一次验证事实。

## 3. 自动触发、恢复与幂等

- Planner 成功保存首个 `DRAFT/PENDING` 后立即调用本地验证器；
- 应用启动时扫描遗留 `DRAFT/PENDING` 并自动验证，不调用 Provider，不需要用户批准；
- 同一 `planId + planVersion + validatorVersion + draft hash` 重复验证逐字段得到相同业务结果；`validatedAt` 只在首次成功提交结果时写入；
- 已为 `VALID` 或 `INVALID` 的相同草稿重复请求只返回已保存报告，不重复创建 Task、依赖或事件；
- 后续 Plan Review 保存编辑版本后复用同一验证器，但编辑、版本创建和重新验证命令由后续协议定义；
- 验证器崩溃前没有提交时保持 `PENDING`，下次启动安全重试；事务已提交时不重复物化。

## 4. 验证顺序与规则

验证器按下列顺序收集结构化问题，单个草稿最多返回 200 个 issue 和 100 个 warning；达到上限停止追加并以固定数量边界失败，不输出原文：

1. 重新用当前 Planner strict Schema 读取持久化草稿；
2. 任务数必须为 1–20；Planner Schema 的 21–50 只允许作为待验证输入，验证时固定失败，不自动压缩；
3. Task `localId` 全局唯一；每个 Task 内 acceptance `localId` 唯一；
4. 依赖和 milestone 引用必须存在，依赖不得自指或重复；同一 Task 在 milestones 中最多出现一次；
5. 依赖图必须无环；非空有限 DAG 自然至少有一个入口和一个叶子，单 Task 同时是入口与叶子；
6. 每个 Task 至少有一条 `REQUIRED` acceptance criterion；每个叶子 Task 至少有一个 `required: true` 输出；
7. `TASK_OUTPUT` 输入引用的上游 Task 和 logical output 必须存在；若输入声明 media type，必须与输出一致；生产 Task 必须通过依赖路径先于消费 Task；
8. 输出 media type 必须位于第 5 节固定映射；
9. 预算按第 6 节验证；
10. capability、tool、Workspace 相对路径和 process profile 按第 7 节验证；
11. 单 Run 大小只产生第 8 节 warning，不把不可证明的估计伪装成硬失败。

`GOAL_CONTRACT` 输入固定绑定当前 Plan 的 `goalVersion`，不创建 Artifact。`evidenceRequired` 是 1–500 code point 的去重证据标签，不强制等于输出 logical name；本阶段不猜测 evaluator、expected value 或评价结论。

## 5. 产物类型映射

固定映射为：

| media type                 | ArtifactType |
| -------------------------- | ------------ |
| `text/plain`               | `TEXT`       |
| `text/markdown`            | `DOCUMENT`   |
| `application/json`         | `JSON`       |
| `application/octet-stream` | `FILE`       |

未知 media type 固定失败。`FILE` 表示普通文件或无法进一步细分的二进制成果，不表示其已存在、已获批准或可安全执行。

## 6. 预算

- Goal 未设置某项上限时，不因对应 Task 预算为空而失败；
- Goal 设置 `costLimitMicros` 时，每个 Task 必须设置 `maxCostMicros`，十进制整数求和不得超过 Goal 上限；
- Goal 设置 `durationLimitMinutes` 时，每个 Task 必须设置 `maxDurationMs`，按 DAG 最长依赖路径求和，不得超过 Goal 分钟换算后的毫秒上限；
- Goal 设置 `maxRevisions` 时，每个 Task 必须设置 `maxEvaluationRevisions`，全图求和不得超过 Goal 上限；
- Token 没有 Goal 级上限，本阶段只验证每个 Task 已有 Schema 边界，不伪造聚合硬限制；
- 金额使用十进制字符串或安全整数转换，不使用二进制浮点；求和溢出固定失败。

## 7. 能力、工具与权限描述

- capability 和 tool 必须来自 Planner 生成时使用的同版本内置 catalog；
- `workspaceWrite` 只接受规范化的工作区相对路径，拒绝空值、绝对路径、盘符、UNC、`.`/`..` 段、NUL、反斜杠混淆和越界表达；
- process profile 必须来自内置 allowlist；明确禁止的 profile 固定失败；
- 通过只表示“权限描述结构安全且未超过当前硬限制”，不表示用户已授权，也不创建 PolicyDecision、Approval 或工具调用；
- Renderer 必须继续显示权限只是计划要求，执行前仍需真实 Policy 与用户审批。

## 8. 单 Run 可行性 warning

v0.1 不调用模型评判“能否一次完成”。满足任一固定条件时产生 `SINGLE_RUN_SIZE_WARNING`，但不阻止验证通过：单 Task 输入、输出或验收条目达到各自 Schema 上限的 80%，或同时请求 10 个以上能力、工具、输入、输出或验收条目。warning 必须在 Plan Review 可见，不能显示成已证明可一次完成。

## 9. 正式 Task 转换与原子持久化

验证通过时，应用使用 M2-TU-06 已分配的可信 Task UUID，按 [Task Protocol](Task-Protocol.md) 转换候选并在一个 `BEGIN IMMEDIATE` 短事务内：

1. 条件确认 Plan 仍为同一 `DRAFT/PENDING`、Goal version 和 draft hash；
2. 写入每个正式 `task`，初始状态固定为 `DRAFT`；
3. 把 local dependency 映射为可信 Task UUID 并写入 `task_dependency`；
4. 保存 validation report；
5. 把 Plan 改为 `VALIDATED/VALID`；
6. 提交。

任一步失败全部回滚，Plan 保持 `DRAFT/PENDING`。验证失败只原子保存 report 并改为 `DRAFT/INVALID`，不得留下任何正式 Task 或依赖。M2-TU-07 不创建 Artifact、Run、Agent、Organization、Approval、预算账本或执行事件。

## 10. 安全与验收

- 循环、自依赖、重复边、未知引用、跨 Plan/Corporation 引用和路径攻击被拒绝；
- 1 个 Task 有效，21–50 个 Task 固定无效且不自动删减；
- 每个 Task 必须可验收，叶子必须有必需输出；
- 预算缺口和超限不被当作零或警告放行；
- invalid 不产生正式 Task，valid 的 Plan/Task/依赖/report 原子一致；
- Renderer reload、应用重启和 SQLite 重开恢复同一验证结果，不调用 Provider、不重复物化；
- UI 清楚区分尚未验证、验证失败、已验证和 warning，并继续标注尚未组队、未批准、不可执行。
