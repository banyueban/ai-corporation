# Corporation State Protocol v1.0

## 1. 目的与边界

本协议定义 Milestone 1 的持久化 pause/resume 基础状态机。它只控制 Corporation 当前状态，不创建 Plan、Task、Run、Tool 或外部副作用，也不定义后续里程碑的检查点与未知副作用恢复。

## 2. 状态转换

```text
DRAFT / PLANNING / ORGANIZING / EXECUTING / VERIFYING / WAITING_HUMAN
  → PAUSED
  → 精确返回暂停前状态
```

- `PAUSING` 只表示 Renderer 等待 Main 确认，不是领域或 SQLite 状态；
- `COMPLETED`、`FAILED`、`CANCELLED`、`ARCHIVED` 和已 `PAUSED` 不可再次用新命令 pause；
- 非 `PAUSED` 不可 resume；
- PAUSED Corporation 持久化 `pausedFrom` 与 `pausedAt`；两者必须同时存在且只在 `PAUSED` 时公开；
- resume 目标只取持久化 `pausedFrom`，Renderer 不得指定目标。

## 3. IPC 与 DTO

Allowlist：

```text
corporation:pause
corporation:resume
```

两个命令使用相同 strict 请求形状：

```ts
type CorporationStateRequest = {
  schemaVersion: "1.0";
  commandId: UUIDv7;
  corporationId: UUIDv7;
  expectedVersion: positiveInteger;
};
```

成功返回 `CorporationItemResult`。失败沿用 Corporation Protocol 的固定 `VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`WORKSPACE_UNAVAILABLE`、`NOT_FOUND`、`VERSION_CONFLICT`、`STATE_CONFLICT`、`COMMAND_CONFLICT` 和 `STORAGE_UNAVAILABLE`。

Renderer 不得提供 actor、原因、时间、来源状态或目标状态。Main 使用可信 UTC、UUID v7、`local-user` 和固定原因 `USER`。

## 4. 事务、幂等与 Workspace

```text
BEGIN IMMEDIATE
→ 读取状态命令回执
→ 检查 Corporation version / 状态 / AVAILABLE Workspace
→ 更新状态、暂停元数据和 version
→ 写一个同 version Domain Event
→ 写状态命令回执
→ COMMIT
```

- pause/resume 使用独立 `corporation_state_command`，不改变既有 CRUD 回执语义；
- 同 command 与相同规范化请求重放返回首次严格公开结果，不重复状态、事件或回执；
- 同 command 配合不同请求返回 `COMMAND_CONFLICT`；
- 旧 version、不可用 Workspace 或非法状态无部分写入；
- 事务内不得调用 Native Core、文件系统、Provider、模型、工具或网络。

## 5. 事件

| eventType | payload |
|---|---|
| `corporation.paused` | `previousStatus`、`reason: "USER"` |
| `corporation.resumed` | `previousStatus: "PAUSED"`、`targetStatus` |

事件遵守 Event Protocol 的 append-only、同聚合版本、可信 correlation/actor 和脱敏规则。公开时间线只投影固定摘要，不返回 payload、actor、correlation 或暂停回执。

## 6. 重启恢复

应用启动、Renderer reload 和 SQLite 重开只读取已提交状态：

- `PAUSED` 保持 PAUSED 并显示来源与暂停时间；
- 其他状态保持原值；
- 启动不得自动 resume、生成事件、写回执或重放命令；
- Milestone 1 没有 Task/Run/Tool，故本协议不声称解决未知外部副作用；该能力属于后续恢复协议。
