# Goal Engine Protocol v1.0

## 1. 目的与边界

本协议定义真实 Provider 将用户 Goal 输入分析为可编辑 Goal Contract 的有界、可取消、可恢复流程。Goal Engine 只生成并保存 `PROVIDER` 来源的 DRAFT Goal Contract；它不批准合同、不生成 Task Graph、不改变 Corporation 状态、不读取 Workspace 文件，也不启动规划或执行。

当前实现使用 Provider 非流式规范化生成协议。Chat Completions 原始 DTO 不得进入本协议；未来 Responses Adapter 可复用相同规范化输入输出。streaming 不属于本协议。

## 2. 用户输入与数据披露

开始分析前必须存在 DRAFT Corporation、已授权且当前可用的 Workspace，以及用户明确选择的 ENABLED、VERIFIED Provider 和精确模型。Renderer 只提交：

- `corporationId`、Corporation/Goal/Provider 期望版本；
- `providerId`；
- 必填 `originalGoal`；
- 可选的成功标准、交付物、约束和非目标提示。

Corporation 名称由 Main 从当前 Corporation 读取。Workspace 只作为授权和可用性门禁；`displayPath`、canonical path、路径身份、目录结构、文件名和文件内容都不得进入模型输入。UI 在调用前显示将接收数据的 Provider 名称和精确模型。

输入沿用 Goal Contract 的 NFC、控制字符、长度、列表数量和去重限制。模型系统指令由应用内版本化模板提供；Renderer 不能覆盖 system prompt、Endpoint、Key、Header、dialect、模型、temperature 或 token 上限。

## 3. 操作与公开状态

一个 Goal 分析操作由 UUID v7 `operationId` 标识，并绑定开始时的 Corporation、当前 Goal、Provider 配置和精确模型版本。公开状态为：

```ts
type GoalEngineStatus =
  | "GENERATING"
  | "CLARIFICATION_REQUIRED"
  | "EXTENSION_REQUIRED"
  | "GOAL_SAVED"
  | "FAILED"
  | "CANCELLED"
  | "INTERRUPTED";
```

- `GENERATING`：正在执行本阶段的生成或唯一一次 JSON 修复；
- `CLARIFICATION_REQUIRED`：当前周期尚未达到 5 轮，等待用户回答 1–5 个 HIGH-impact 问题；
- `EXTENSION_REQUIRED`：当前周期已完成 5 轮但仍有 HIGH-impact 缺口；必须停止 Provider 调用并等待用户决策；
- `GOAL_SAVED`：严格验证后的完整合同已作为新的 `PROVIDER` DRAFT 版本自动保存；
- `FAILED`：标准失败，未创建或覆盖 Goal 版本；
- `CANCELLED`：用户取消，未创建或覆盖 Goal 版本；
- `INTERRUPTED`：应用退出时仍在生成；重启后不自动重放，用户可显式重试。

公开投影包含 operation/corporation/provider/model 标识、绑定版本、状态、周期号、周期内轮次、当前问题、受限失败、聚合 usage、更新时间和可选已保存 Goal。它不包含 Key、Authorization、Workspace 路径、system prompt、原始请求/响应、无效 JSON、修复正文或远端 request ID。

## 4. 模型输出

每个生成阶段只接受严格 JSON 对象：

```ts
type GoalEngineModelOutput = {
  draft: {
    statement: string;
    successCriteria: string[];
    inScope: string[];
    outOfScope: string[];
    constraints: string[];
    assumptions: Array<{
      text: string;
      impact: "LOW" | "MEDIUM" | "HIGH";
      confirmed: false;
    }>;
    deliverables: string[];
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    budget: GoalBudget;
    stopConditions: string[];
  };
  unresolvedQuestions: Array<{
    text: string;
    impact: "HIGH";
  }>;
};
```

`draft` 始终必须完整且通过 Goal Contract Schema；`unresolvedQuestions` 为 0–5 个规范化、去重的 HIGH-impact 问题。Main 为问题分配本地 UUID v7，不信任模型标识。模型不得把问题静默改写成已确认事实；模型生成的 assumptions 固定 `confirmed:false`。

第一次输出不是严格、合法且大小受限的 JSON 时，同一生成阶段只允许一次修复调用。修复仍失败则操作进入 `FAILED`。修复调用只发送到相同 Provider/版本/模型；无效正文只在内存中短暂存在，不持久化、不记录日志、不进入 Renderer 或 artifact。

## 5. 澄清周期

首次分析后：

- 无 unresolved question：自动保存 Goal；
- 有问题：进入第一周期第一轮 `CLARIFICATION_REQUIRED`。

一轮是用户回答当前一组问题后执行的一次新生成阶段。每个周期最多 5 轮；每个生成阶段最多一次正常调用和一次 JSON 修复。首次周期包含初始分析，因此最坏为 12 次 Provider 调用；用户明确续期后，每个新增周期最坏增加 10 次。通常合法且充分的输出只需要 1 次调用。

周期内模型返回新问题时继续下一轮；在第 5 轮仍有问题时进入 `EXTENSION_REQUIRED`，此后不得调用 Provider，直到用户选择：

- `CONTINUE`：显式开启下一个 5 轮周期，保留当前问题和草稿；
- `SAVE_DRAFT`：把剩余问题转为去重的未确认 HIGH assumptions，严格验证后保存 `PROVIDER` DRAFT；
- `CANCEL`：取消操作，不创建或覆盖 Goal 版本。

每到新的周期上限都必须重新取得用户选择；续期不能被记住、自动执行或由模型决定。保存的未确认 HIGH assumptions 会继续触发 Goal Contract 的批准门禁，不能进入规划或执行。

## 6. IPC

Allowlist channels：

```text
goal-engine:start
goal-engine:answer
goal-engine:resolve-extension
goal-engine:cancel
goal-engine:get-current
```

所有请求固定 `schemaVersion:"1.0"` 并使用 strict runtime Schema：

- `start`：`operationId/corporationId/expectedCorporationVersion/expectedGoalVersion/providerId/expectedProviderVersion/input`；
- `answer`：`operationId`、当前问题对应的完整 `{ questionId, answer }[]` 和期望 operation version；
- `resolve-extension`：`operationId`、期望 operation version 和 `CONTINUE | SAVE_DRAFT | CANCEL`；
- `cancel`：`operationId`；
- `get-current`：`corporationId`，返回最新非终态或最近终态投影。

开始、回答、续期与保存均使用 operation 乐观版本；迟到结果、重复 request、过期问题、缺失/额外答案、错误 Corporation/Provider 版本和错误窗口固定拒绝。相同 operationId 与相同规范化开始请求返回已有操作；不同请求返回幂等冲突。

## 7. 持久化与事务

操作开始前短事务创建 `goal_generation_operation` 的 `GENERATING` 检查点和模型调用记录；网络调用在事务外。每次结果只在 operation/Corporation/Goal/Provider 版本仍匹配时条件写入。取消、配置变化、Goal 变化或迟到结果不得覆盖新事实。

澄清状态保存当前规范化输入、草稿、问题、答案、周期/轮次和聚合 usage，以支持 Renderer reload 和应用重启。不得保存原始 prompt、原始响应或非法 JSON。应用启动时遗留的 `GENERATING` 操作改为 `INTERRUPTED`，不自动重发。

最终 Goal 保存复用 Goal Contract 版本事务：旧当前 Goal 变为 `SUPERSEDED`，插入新的 `PROVIDER` DRAFT，推进 Corporation version/active pointer，并写入一个同版本 `goal.contract.drafted` 事件和命令回执。Goal 保存失败时操作不得显示 `GOAL_SAVED`。

## 8. 模型调用与 usage

所有 Provider 调用写入通用 `model_call` 记录：

- 必填 `corporationId`、`operationId`、`purpose`、Provider/版本/模型、attempt、状态和时间；
- `purpose` 当前为 `GOAL_ANALYSIS`，未来可增加 `PLAN_GENERATION | AGENT_RUN | JUDGE`；
- `taskId/runId` 只在执行阶段对应 purpose 时必填，规划前调用不得创建合成 Task/Run；
- 保存标准 token usage 和 UNKNOWN/可靠费用来源，不保存输入正文、输出正文或远端 request ID。

Goal operation 的公开 usage 是所有成功 Provider 响应的规范化 usage 聚合；缺失字段保持未知，不得猜测费用。JSON 修复和每轮澄清均单独计入调用记录。

## 9. 固定失败与安全

公开错误至少区分：请求非法、未授权、Corporation/Provider 不存在、Workspace 不可用、Provider disabled/unverified/缺 Key/模型过期、版本冲突、操作状态冲突、答案不完整、Provider 标准失败、JSON/Schema 失败、取消、Vault/Storage 不可用。固定消息不得包含用户输入、问题答案、模型正文、路径、Key、SQL 或堆栈。

同一 Corporation 同时只允许一个非终态 Goal operation。取消必须在 2 秒内进入取消流程；底层按能力终止。Renderer 无通用 Provider fetch、Key Vault、数据库、文件或 Native RPC。日志、错误、截图、trace、SQLite/WAL/SHM、诊断和 CI artifact 必须执行定向泄密扫描。

## 10. 非范围

Goal 批准、Task Graph、Planner、Organization、Corporation 状态迁移、streaming、Responses Adapter、Tool Call、Workspace 文件读取、自动 Provider 回退、价格估算、预算 reservation/ledger、无限自动澄清和执行均不在本协议。
