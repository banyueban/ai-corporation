# Corporation Protocol v1.0

## 1. 目的与边界

本协议定义 Corporation 的公开 DTO、命令、查询、事件事实和固定错误。Corporation 是一次用户目标的自治执行实例；本协议不定义 Goal Contract、Task Graph、运行状态机、预算、删除或 UI。

Renderer 只通过 typed preload 调用本协议。数据库行、SQL、Workspace canonical root、路径身份、内部事件投递字段和命令回执不得进入公开响应。

## 2. 标识、名称与状态

- Corporation、Workspace、命令和事件 ID 均为 UUID v7 字符串；
- 时间使用带 `Z` 的 UTC ISO-8601 字符串；
- 名称在可信边界执行 Unicode NFC、首尾空白裁剪和控制字符拒绝，长度为 1–120 个 Unicode code point；
- 同一 Workspace 允许同名 Corporation；名称不是身份或权限边界；
- `version` 从 1 开始，每次成功变更递增 1。

```ts
type CorporationStatus =
  | "DRAFT"
  | "PLANNING"
  | "ORGANIZING"
  | "EXECUTING"
  | "VERIFYING"
  | "WAITING_HUMAN"
  | "PAUSED"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED"
  | "ARCHIVED";
```

本任务只创建 `DRAFT`，只执行名称更新和终态归档。其他状态迁移由后续状态机协议定义，不得通过通用更新接口伪造。

## 3. 公开 DTO

```ts
type CorporationPublic = {
  schemaVersion: "1.0";
  id: string;
  workspaceId: string;
  name: string;
  status: CorporationStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  archivedAt?: string;
};
```

约束：

- `archivedAt` 仅在 `status === "ARCHIVED"` 时存在；
- 公开 DTO 不包含 active Goal/Plan/Organization、Policy 内部值、路径或事件 payload；
- 所有查询和命令响应都必须经过 strict runtime Schema，拒绝额外字段。

## 4. IPC 与命令

Allowlist channels：

```text
corporation:create
corporation:get
corporation:list
corporation:update-name
corporation:archive
```

请求：

```ts
type CorporationCreateRequest = {
  schemaVersion: "1.0";
  commandId: string;
  workspaceId: string;
  name: string;
};

type CorporationGetRequest = {
  schemaVersion: "1.0";
  corporationId: string;
};

type CorporationListRequest = {
  schemaVersion: "1.0";
  workspaceId: string;
  includeArchived?: boolean;
};

type CorporationUpdateNameRequest = {
  schemaVersion: "1.0";
  commandId: string;
  corporationId: string;
  expectedVersion: number;
  name: string;
};

type CorporationArchiveRequest = {
  schemaVersion: "1.0";
  commandId: string;
  corporationId: string;
  expectedVersion: number;
};
```

成功值：

```ts
type CorporationItemResult = {
  ok: true;
  value: CorporationPublic;
};

type CorporationListResult = {
  ok: true;
  value: CorporationPublic[];
};
```

失败值：

```ts
type CorporationErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED_CALLER"
  | "WORKSPACE_UNAVAILABLE"
  | "NOT_FOUND"
  | "VERSION_CONFLICT"
  | "STATE_CONFLICT"
  | "COMMAND_CONFLICT"
  | "STORAGE_UNAVAILABLE";

type CorporationFailure = {
  ok: false;
  error: {
    code: CorporationErrorCode;
    message: string;
  };
};
```

错误消息使用下表固定安全文案，不包含 SQL、数据库文件、Workspace 路径、事件 payload、命令 hash 或堆栈：

| code                    | message                                                      |
| ----------------------- | ------------------------------------------------------------ |
| `VALIDATION_FAILED`     | `Corporation request is invalid.`                            |
| `UNAUTHORIZED_CALLER`   | `Corporation request is not allowed.`                        |
| `WORKSPACE_UNAVAILABLE` | `Workspace is unavailable.`                                  |
| `NOT_FOUND`             | `Corporation was not found.`                                 |
| `VERSION_CONFLICT`      | `Corporation changed. Reload and retry.`                     |
| `STATE_CONFLICT`        | `Corporation state does not allow this action.`              |
| `COMMAND_CONFLICT`      | `Corporation command conflicts with an earlier request.`     |
| `STORAGE_UNAVAILABLE`   | `Corporation storage is unavailable.`                        |

## 5. 命令与幂等语义

- `create`、`update-name` 和 `archive` 必须携带 `commandId`；
- `commandId` 是幂等标识而非授权能力；Renderer 可生成，但 Main 必须按 UUID v7 Schema 验证且不能据此扩大权限；
- 首次命令在同一 SQLite 事务中写入状态、Domain Event 和命令回执；
- 同一 `commandId` 与同一规范化请求重复提交时返回首次提交的严格公开结果，不重复状态变化或事件；
- 同一 `commandId` 配合不同请求时返回 `COMMAND_CONFLICT`，不修改任何记录；
- `expectedVersion` 不等于当前版本时返回 `VERSION_CONFLICT`，不写事件或命令回执；
- `get` 和 `list` 是无副作用查询；列表按 `updatedAt DESC, id ASC` 稳定排序；
- `includeArchived` 默认 `false`。

命令回执是内部恢复数据，只保存命令类型、规范化请求 SHA-256、严格公开结果、结果版本和时间。Renderer 不可读取回执。

规范化请求 hash 使用 strict Schema 解析后的对象：名称先执行本协议规定的 NFC 与裁剪，字段按协议声明顺序序列化为无空白 UTF-8 JSON，再计算小写十六进制 SHA-256。命令类型单独存储并参与冲突比较；未知或额外字段在计算 hash 前已被拒绝。

## 6. Workspace 与归档规则

- 创建前必须通过可信 Workspace service 重新验证目标 Workspace；
- Workspace 不存在、身份变化、不可访问或验证服务不可用时返回 `WORKSPACE_UNAVAILABLE`；
- `READ_ONLY` 与 `READ_WRITE` 的 `AVAILABLE` Workspace 都允许创建 DRAFT；实际文件写入仍由后续 Tool/Policy 边界决定；
- Corporation 创建后不能更换 `workspaceId`；
- 名称更新允许所有非 `ARCHIVED` 状态；
- 只有 `COMPLETED`、`FAILED` 或 `CANCELLED` 可迁移为 `ARCHIVED`；
- `ARCHIVED` 为只读状态；重复归档使用新 command 时返回 `STATE_CONFLICT`，重复同一 command 则返回首次结果；
- 删除不属于 Milestone 1，不提供 delete channel。

## 7. Domain Event

每个成功命令恰好写入一个最小事实事件：

| 命令          | eventType                  | payload                                                    |
| ------------- | -------------------------- | ---------------------------------------------------------- |
| create        | `corporation.created`      | `workspaceId`、`name`、`status: "DRAFT"`                  |
| update-name   | `corporation.name.updated` | `previousName`、`name`                                     |
| archive       | `corporation.archived`     | `previousStatus`、`archivedAt`                             |

共同约束：

- `aggregateType === "CORPORATION"`；
- `aggregateId` 与 `corporationId` 均为目标 Corporation ID；
- `aggregateVersion` 等于同事务提交后的 Corporation `version`；
- `correlationId` 使用命令 ID，actor 固定为 `{ kind: "USER", id: "local-user" }`；v0.1 无账户系统，Renderer 不得提供 actor；
- 事件 ID 由可信 Main 使用操作系统随机源生成 UUID v7；
- payload 不包含 Workspace 路径、Goal 内容或数据库内部字段；
- `domain_event` append-only，业务 API 不提供更新或删除。

## 8. 事务与并发

```text
BEGIN IMMEDIATE
→ 检查命令回执 / 当前版本 / 状态
→ 写 Corporation
→ 写 Domain Event
→ 写命令回执
→ COMMIT
```

任一步失败必须回滚三者。事务内不得调用 Native Core、文件系统、模型、工具或网络；Workspace 重新验证在事务前完成。

## 9. 兼容与非范围

- v1 minor 版本只允许新增可选字段、错误或 channel，不改变已有语义；
- 未知 major、未知枚举和额外字段必须拒绝；
- Goal Contract、Task、预算、Policy 编辑、暂停/恢复/取消状态迁移、事件订阅、时间线 UI、Corporation 删除和跨设备同步均不在本协议当前任务范围。

## 10. 验收

- runtime Schema 拒绝额外字段、非法 UUID v7、非法名称、非法状态和错误归档形状；
- 状态、事件和命令回执只允许全部提交或全部回滚；
- 同命令重放不产生重复 Corporation、版本或事件；
- 并发旧版本写入被拒绝且当前记录不变；
- 归档状态规则与领域模型一致；
- 公开 DTO、错误和日志不泄露可信 Workspace 或数据库内部字段。
