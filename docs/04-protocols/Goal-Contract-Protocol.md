# Goal Contract Protocol v1.0

## 1. 目的与边界

本协议定义 Milestone 1 的 Goal Contract 手工录入、确定性 Mock 生成、版本化保存、确认和最小事件时间线。它不调用 Provider，不生成 Task Graph，不启动 Corporation，不执行状态机迁移。

Renderer 只获得公开 DTO。SQL、命令 hash、内部回执、Workspace canonical root、路径身份、完整内部事件 payload 和分发字段不得进入公开 API。

## 2. 公开模型

```ts
type GoalContractStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";
type GoalContractSource = "MANUAL" | "MOCK";
type GoalAssumption = {
  id: string;
  text: string;
  impact: "LOW" | "MEDIUM" | "HIGH";
  confirmed: boolean;
};
type GoalBudget = {
  costLimitMicros?: number;
  durationLimitMinutes?: number;
  maxRevisions?: number;
};
type GoalContractPublic = {
  schemaVersion: "1.0";
  corporationId: string;
  version: number;
  status: GoalContractStatus;
  source: GoalContractSource;
  originalGoal: string;
  statement: string;
  successCriteria: string[];
  inScope: string[];
  outOfScope: string[];
  constraints: string[];
  assumptions: GoalAssumption[];
  deliverables: string[];
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  budget: GoalBudget;
  stopConditions: string[];
  createdAt: string;
  approvedAt?: string;
};
```

所有字符串执行 NFC、首尾裁剪和控制字符拒绝；原始目标与陈述为 1–4,000 code point，列表项为 1–500 code point，单个列表最多 50 项。成功标准至少一项；数组保持用户顺序且拒绝规范化后的重复项。预算整数不得为负，空预算对象表示未设任务级覆盖值。

`approvedAt` 只在 `APPROVED` 时存在。`SUPERSEDED` 版本的确认事实由事件保留，不公开 `approvedAt`。

## 3. 命令、查询与 IPC

Allowlist channels：

```text
goal-contract:save-draft
goal-contract:get-current
goal-contract:list-versions
goal-contract:approve
timeline:list
```

所有请求固定包含 `schemaVersion: "1.0"`；命令使用 UUID v7 `commandId`。

- `save-draft`：`commandId`、`corporationId`、`expectedCorporationVersion`、`expectedGoalVersion`（首次为 `0`）、`source` 和完整合同内容；
- `get-current`：`corporationId`；
- `list-versions`：`corporationId`；
- `approve`：`commandId`、`corporationId`、`expectedCorporationVersion`、`goalVersion`；
- `timeline:list`：`corporationId`、可选 `afterCursor` 和 `limit`（1–100，默认 50）。

命令成功返回严格 `GoalContractPublic`；版本列表按 `version DESC`。最小时间线按 `(occurredAt, eventId)` 升序返回公开事件和 `nextCursor`，只包含目标 Corporation 的：

- `corporation.created`、`corporation.name.updated`、`corporation.archived`；
- `goal.contract.drafted`、`goal.contract.approved`。

公开时间线事件只包含 `eventId`、`eventType`、`corporationId`、`aggregateVersion`、`occurredAt` 和固定安全 `summary`，不返回 actor、correlationId 或 payload。

## 4. 版本、确认与事务

- 首次保存创建版本 1；后续保存创建新版本，旧 DRAFT 变为 `SUPERSEDED`；
- 内容列插入后不可更新；只允许 DRAFT → APPROVED 或 DRAFT → SUPERSEDED 的元数据变化；
- 只有 DRAFT Corporation 可保存或确认 Goal；其他状态返回状态冲突；
- 保存必须匹配 Corporation version 与当前 Goal version；确认必须匹配 Corporation version 且目标为当前 DRAFT；
- 保存新版本时 Corporation `version` 加 1 并设置 `active_goal_version`；确认时 Corporation `version` 再加 1，但保持 DRAFT，Milestone 1 不伪造 PLANNING；
- 所有 HIGH impact assumptions 确认后才可 approve；
- 状态、Goal version、一个同版本 Domain Event 和命令回执在同一个 `BEGIN IMMEDIATE` 短事务中提交；
- 同 command 同规范化请求返回首次结果；同 command 不同请求返回命令冲突；
- 事务内禁止 Native、文件、模型、工具或网络调用。

Mock 是本地确定性转换：原始目标成为 statement；用户输入的成功标准、范围、约束和交付物原样规范化；不猜测隐藏事实、不生成 Task、不制造“AI 已分析”状态。相同输入产生相同合同内容，ID、版本和时间仍由可信 Main 生成。

## 5. 固定错误

| code | message |
|---|---|
| `VALIDATION_FAILED` | `Goal Contract request is invalid.` |
| `UNAUTHORIZED_CALLER` | `Goal Contract request is not allowed.` |
| `CORPORATION_NOT_FOUND` | `Corporation was not found.` |
| `VERSION_CONFLICT` | `Goal Contract changed. Reload and retry.` |
| `STATE_CONFLICT` | `Corporation state does not allow this Goal Contract action.` |
| `ASSUMPTION_CONFIRMATION_REQUIRED` | `High-impact assumptions must be confirmed.` |
| `COMMAND_CONFLICT` | `Goal Contract command conflicts with an earlier request.` |
| `STORAGE_UNAVAILABLE` | `Goal Contract storage is unavailable.` |

错误不得包含 Goal 内容、SQL、数据库/Workspace 路径、命令 hash、回执、事件 payload 或堆栈。

## 6. UI 语义

- Create 页面明确标注 Mock 是本地确定性草稿，不调用模型；
- 保存中禁用重复提交；失败保留输入并说明影响与恢复动作；
- Review 逐块展示合同，高影响假设不折叠；
- approve 只表示“确认目标合同”，不显示“已规划”或“开始执行”；
- 版本和最小时间线由真实持久化数据驱动；
- 离开 dirty draft 必须保护，迟到响应不得覆盖更新后的本地输入。

## 7. 非范围

Provider、真实模型、澄清循环、Task Graph、Plan/Organization、Corporation 状态机、启动执行、预算账本、事件订阅/实时推送、完整诊断时间线、Goal 删除、跨设备同步和工作区文件操作均不在范围内。
