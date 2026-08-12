# Organization Proposal Protocol v1.0

## 1. 用户动作

只有当前 Plan 为 `APPROVED/VALID` 时，Renderer 才可提交：

```ts
type CreateOrganizationProposal = {
  schemaVersion: "1.0";
  commandId: UUIDv7;
  corporationId: UUIDv7;
  planId: UUIDv7;
  expectedPlanVersion: number;
};
```

Renderer 不提交 Task 内容、角色、模板、能力、工具、Provider 或模型。Main 必须从可信 SQLite 读取当前批准 Plan。

## 2. 草案结果

草案包含版本、固定模板成员、每个 Task 的唯一责任人、Executor/Judge 分离、能力缺口和模型策略。`HUMAN_DECISION` 的责任人固定为 `human.user`；其他 Task 只能分给本次草案中的 Executor。

草案禁止包含精确 Provider/model。创建过程不得调用 Provider，不创建 Agent Instance/Run，不激活团队、不开始 Task，也不改变 Corporation 的 `DRAFT` 状态。

## 3. 固定成员与分配

- Planner：固定 1 个；
- Executor：分析与文档、软件实现、质量验收三类，按实际机器 Task 创建 0–3 个；
- Judge：固定 1 个，且与所有 Executor 身份分离；
- 全部为 `HUMAN_DECISION` 时不创建空闲 Executor。

同一业务输入必须得到相同模板、分组、分工、职责分离和能力缺口。草案 UUID、命令 UUID、时间和版本号属于审计信息，不参与确定性比较。

## 4. 错误与恢复

固定错误：`VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`PLAN_NOT_APPROVED`、`CURRENT_PLAN_CHANGED`、`COMMAND_CONFLICT`、`ORGANIZATION_NOT_FOUND`、`STORAGE_FAILURE`。

同一命令和相同内容重试返回原结果；同一命令用于不同内容时拒绝。失败不自动重试，事务失败不得留下半条草案。界面重载和应用重启从当前 `DRAFT` 快照恢复。
