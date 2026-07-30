# Goal Contract Protocol v1.0

## 1. 目的与边界

本协议定义 Milestone 1 的 Goal Contract 手工录入、确定性 Mock 生成、版本化保存、确认和最小事件时间线。它不调用 Provider，不生成 Task Graph，不启动 Corporation，不执行状态机迁移。

Renderer 只获得公开 DTO。SQL、命令 hash、内部回执、Workspace canonical root、路径身份、完整内部事件 payload 和分发字段不得进入公开 API。

## 2. 公开模型

```ts
type GoalContractStatus = "DRAFT" | "APPROVED" | "SUPERSEDED";
type GoalContractSource = "MANUAL" | "MOCK";
type GoalAssumption = {
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

所有字符串执行 NFC、首尾裁剪和控制字符拒绝；原始目标与陈述为 1–4,000 code point，列表项和 assumption text 为 1–500 code point，单个列表最多 50 项。成功标准至少一项；数组保持用户顺序且拒绝规范化后的重复项，assumption 以规范化后的 `(text, impact)` 判重。预算整数不得为负且不得超过 JavaScript 安全整数，空预算对象表示未设任务级覆盖值。

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

请求：

```ts
type GoalContractContentInput = {
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
};

type GoalContractSaveDraftRequest = {
  schemaVersion: "1.0";
  commandId: string;
  corporationId: string;
  expectedCorporationVersion: number;
  expectedGoalVersion: number;
  content: GoalContractContentInput;
};

type GoalContractGetCurrentRequest = {
  schemaVersion: "1.0";
  corporationId: string;
};

type GoalContractListVersionsRequest = {
  schemaVersion: "1.0";
  corporationId: string;
};

type GoalContractApproveRequest = {
  schemaVersion: "1.0";
  commandId: string;
  corporationId: string;
  expectedCorporationVersion: number;
  goalVersion: number;
};

type TimelineListRequest = {
  schemaVersion: "1.0";
  corporationId: string;
  afterCursor?: string;
  limit?: number;
};
```

`expectedCorporationVersion`、`goalVersion` 必须为正整数；`expectedGoalVersion` 首次保存固定为 `0`，后续必须为当前 active Goal version。`limit` 为 1–100 的整数，省略时为 50。所有请求使用 strict runtime Schema，额外字段、未知枚举、非 UUID v7 标识和错误 optional 形状一律返回 `VALIDATION_FAILED`。

成功值：

```ts
type GoalContractItemResult = {
  ok: true;
  value: GoalContractPublic;
};

type GoalContractNullableItemResult = {
  ok: true;
  value: GoalContractPublic | null;
};

type GoalContractListResult = {
  ok: true;
  value: GoalContractPublic[];
};

type TimelineEventPublic = {
  schemaVersion: "1.0";
  eventId: string;
  eventType:
    | "corporation.created"
    | "corporation.name.updated"
    | "corporation.archived"
    | "corporation.paused"
    | "corporation.resumed"
    | "goal.contract.drafted"
    | "goal.contract.approved";
  corporationId: string;
  aggregateVersion: number;
  occurredAt: string;
  summary: string;
};

type TimelinePagePublic = {
  schemaVersion: "1.0";
  items: TimelineEventPublic[];
  nextCursor?: string;
};

type TimelineListResult = {
  ok: true;
  value: TimelinePagePublic;
};
```

`save-draft` 与 `approve` 返回 `GoalContractItemResult`；`get-current` 在 Corporation 存在但尚无 Goal 时返回 `GoalContractNullableItemResult` 的 `null`；`list-versions` 返回 `GoalContractListResult` 并按 `version DESC` 排序。所有命令和查询共用第 5 节的严格失败值。

最小时间线按 `(occurredAt, eventId)` 升序返回目标 Corporation 的 allowlist 事件：

- `corporation.created`、`corporation.name.updated`、`corporation.archived`、`corporation.paused`、`corporation.resumed`；
- `goal.contract.drafted`、`goal.contract.approved`。

固定安全摘要为：

| eventType | summary |
|---|---|
| `corporation.created` | `Corporation created.` |
| `corporation.name.updated` | `Corporation name updated.` |
| `corporation.archived` | `Corporation archived.` |
| `corporation.paused` | `Corporation paused.` |
| `corporation.resumed` | `Corporation resumed.` |
| `goal.contract.drafted` | `Goal Contract draft saved.` |
| `goal.contract.approved` | `Goal Contract approved.` |

公开时间线不返回 actor、correlationId、causationId、sensitivity 或 payload。游标是 UTF-8 JSON `{"occurredAt":"<UTC>","eventId":"<UUIDv7>"}` 的无 padding base64url，键顺序固定如示例；Main 必须 strict 解码、验证字段并要求重新编码结果与输入逐字节相同。`afterCursor` 必须标识当前 Corporation 的一条 allowlist 事件，表示排除该事件并读取严格大于其 `(occurredAt, eventId)` 的下一页；只有仍存在后续记录时才返回由本页最后一项生成的 `nextCursor`。非法、非 canonical、不存在或属于其他 Corporation 的游标返回 `VALIDATION_FAILED`。

## 4. 版本、确认与事务

- 首次保存创建版本 1；后续保存创建新版本，旧的当前 DRAFT 或 APPROVED 变为 `SUPERSEDED`；
- 内容列插入后不可更新；只允许 DRAFT → APPROVED、DRAFT → SUPERSEDED 或 APPROVED → SUPERSEDED 的元数据变化；
- 只有 DRAFT Corporation 可保存或确认 Goal；其他状态返回状态冲突；
- 保存必须匹配 Corporation version 与当前 Goal version；确认必须匹配 Corporation version 且目标为当前 DRAFT；
- 保存新版本时 Corporation `version` 加 1 并设置 `active_goal_version`；确认时 Corporation `version` 再加 1，但保持 DRAFT，Milestone 1 不伪造 PLANNING；
- 所有 HIGH impact assumptions 确认后才可 approve；
- 状态、Goal version、一个同 Corporation version Domain Event 和命令回执在同一个 `BEGIN IMMEDIATE` 短事务中提交；Goal 事件的 `aggregateType` 和 `aggregateId` 仍使用 `CORPORATION` 与 Corporation ID；
- 同 command 同规范化请求返回首次结果；同 command 不同请求返回命令冲突；
- 事务内禁止 Native、文件、模型、工具或网络调用。

命令回执只保存命令类型、规范化请求 SHA-256、严格公开结果、结果版本和时间。规范化请求 hash 使用 strict Schema 解析后的对象：所有字符串先按第 2 节规范化，数组保持输入顺序，object 字段按本节请求类型的声明顺序序列化为无空白 UTF-8 JSON，再计算小写十六进制 SHA-256。命令类型单独存储并参与冲突比较；未知或额外字段在计算 hash 前已被拒绝。

Mock 是本地确定性模板，不是模型推理：当 `source === "MOCK"` 时，`statement` 必须等于规范化后的 `originalGoal`，其他字段只复制并规范化用户明确输入的值；Main 不补全成功标准、范围、约束、假设、交付物、风险、预算或停止条件。`MANUAL` 允许 `statement` 与 `originalGoal` 不同。相同规范化输入产生逐字段相同的合同内容，Corporation ID、版本和时间仍由可信 Main 生成。

Create UI 的 Corporation 创建与 Goal 保存是两个已定义命令，不是伪造的跨服务原子事务。Corporation create 成功而 Goal save 失败时，已创建的 DRAFT Corporation 保留；UI 必须明确显示部分结果、保留 Goal 输入并允许基于重新读取的版本重试，不得声称整个创建旅程成功，也不得静默创建第二个 Corporation。

## 5. 固定错误

```ts
type GoalContractErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED_CALLER"
  | "CORPORATION_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "STATE_CONFLICT"
  | "ASSUMPTION_CONFIRMATION_REQUIRED"
  | "COMMAND_CONFLICT"
  | "STORAGE_UNAVAILABLE";

type GoalContractFailure = {
  ok: false;
  error: {
    code: GoalContractErrorCode;
    message: string;
  };
};
```

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
