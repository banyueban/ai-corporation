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

## 5. 团队配置与激活

当前草案没有 `BLOCKING` 能力缺口时，Renderer 可提交命令 ID、Corporation ID、当前 organization ID/版本、三组角色的 Provider ID/版本和精确模型 ID，以及是否明确接受当前全部 `DEGRADED` 缺口。Renderer 不提交成员、Task 分工、Definition、工具、能力或快照内容；Main 从 SQLite 读取并验证当前草案和 Provider 事实。

- Planner、全部 Executor、Judge 分别使用一组配置；三组可相同，也可不同；
- Provider 必须为当前 `ENABLED`、Key 存在、连接测试对当前版本为 `VERIFIED`；模型必须来自该验证的模型列表；
- 角色选择不修改 Provider 默认模型，不要求生成测试，不调用 Provider；
- `BLOCKING` 缺口始终拒绝；存在 `DEGRADED` 缺口时必须显式接受，且接受内容绑定当前 organization version；
- 成功将当前 organization version 从 `DRAFT` 变为 `APPROVED`，保存三组模型路由快照并创建 Agent Instance；不创建 Agent Run，不开始 Task，Corporation 保持 `DRAFT`；
- 同一命令重试返回原结果；命令冲突、草案变化、Provider 版本变化或事务失败不得留下半激活团队；
- 激活后的 Provider 变化不改写历史快照，未来开始执行前必须重新校验；失效时拒绝执行并要求生成、配置和激活新版本。

固定错误在草案错误基础上增加：`ORGANIZATION_NOT_DRAFT`、`ORGANIZATION_CHANGED`、`BLOCKING_CAPABILITY_GAP`、`DEGRADED_GAP_ACCEPTANCE_REQUIRED`、`PROVIDER_NOT_READY`、`PROVIDER_CHANGED`、`MODEL_NOT_AVAILABLE`。
