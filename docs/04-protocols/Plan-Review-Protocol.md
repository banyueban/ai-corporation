# Plan Review Protocol v1.0

## 1. 目的与阶段边界

本协议定义用户如何审阅、有限编辑、版本化保存并批准已经由本地验证器处理的 Plan。M2-TU-08 只完成 Plan Review，不启动执行、不创建团队，也不改变 Corporation 状态。

## 2. 计划版本与状态

- 当前可编辑版本只能是 `VALIDATED/VALID` 或 `DRAFT/INVALID`；`DRAFT/PENDING` 等待本地验证完成；
- 每次保存都创建新的 Plan UUID、递增的 Plan version 和一套全新的 Task UUID；
- 新版本通过 `supersedesPlanId` 指向上一版本，上一版本原子转为 `SUPERSEDED` 并永久只读；
- 新版本先保存为 `DRAFT/PENDING`，随后自动执行既有本地确定性验证；验证成功为 `VALIDATED/VALID`，失败为可恢复的 `DRAFT/INVALID`；
- 只有 `VALIDATED/VALID` 可以批准；批准后为 `APPROVED/VALID` 并记录 `approvedAt`；
- `APPROVED` 版本冻结，本任务不允许继续修改。未来重新规划必须用新增任务产生新版本；
- `SUPERSEDED` 保留最后一次验证事实，不能批准、修改或恢复为当前版本。

## 3. 有限编辑范围

用户可以：

- 修改 Task 标题、目标、说明和优先级；
- 新增、修改和删除 Task 的验收标准；
- 调整现有 Task 之间的明确依赖；
- 删除尚未执行的 Task。

用户不能：

- 新增 Task；
- 修改 Plan 摘要、Task 类型、风险级别、能力、工具、输入、输出、预算、重试、权限提示、假设、非目标、建议角色、里程碑标题或风险；
- 请求 Provider 重新规划；
- 修改预算、创建团队或开始执行。

删除 Task 时，软件自动清除指向该 Task 的普通依赖和里程碑成员关系。如果任何保留 Task 的 `TASK_OUTPUT` 输入仍引用被删除 Task，则保存前拒绝删除，并返回受影响的可信 Task ID；不得生成一个用户无法在本界面修复的新版本。

## 4. IPC 合同

Allowlist IPC：

```text
plan-review:get-current
plan-review:list-versions
plan-review:save-version
plan-review:approve
```

所有请求使用 strict runtime Schema 并拒绝未知字段。保存请求包含 UUID v7 `commandId`、`corporationId`、当前 `sourcePlanId`、`expectedPlanVersion`、保留 Task 的有限编辑内容和依赖。省略的源 Task 表示删除；不得提交来源 Plan 中不存在的 Task。

批准请求包含 UUID v7 `commandId`、`corporationId`、`planId` 和 `expectedPlanVersion`。同一 `commandId` 与相同规范化请求幂等，不同请求固定冲突。迟到请求不能覆盖新的当前版本。

固定错误类别：`VALIDATION_FAILED`、`UNAUTHORIZED_CALLER`、`NOT_FOUND`、`VERSION_CONFLICT`、`STATE_CONFLICT`、`DELETE_BLOCKED`、`STORAGE_UNAVAILABLE`。只有 `DELETE_BLOCKED` 可以附带去重后的可信 `blockingTaskIds`，不得返回标题、正文、路径、SQL 或堆栈。

## 5. 事务、恢复与安全

- 保存新 Plan、生成新 Task UUID、写入草稿、记录取代关系和把旧 Plan 标记为 `SUPERSEDED` 必须在一个短事务中完成；
- 保存后验证沿用 Plan Validation Protocol；应用中断留下的 `DRAFT/PENDING` 由既有启动恢复扫描继续验证，不调用 Provider；
- 验证成功时为新版本物化新的正式 Task/依赖；旧版本 Task 保留且只读；
- 批准只原子更新当前 Plan 状态和批准时间，不修改 Corporation、Task 状态、Organization、Agent 或 Run；
- Renderer 只能提交允许编辑的字段；Main 从当前源 Plan 复制其他字段并分配全部新身份；
- 计划正文、Workspace 路径、Key、SQL 和堆栈不得进入错误、日志或事件。

## 6. UI 行为

- 当前版本展示 Task、依赖、能力要求、建议角色、预算、风险、验证问题和 warning，并始终说明“尚未组队、未开始执行”；
- 编辑模式只显示允许字段；保存按钮文案为“保存新版本”；
- 无效版本可在重载或重启后继续编辑，再次保存会产生下一个版本；
- 历史版本只读，可返回当前版本；
- `VALIDATED/VALID` 的唯一主操作是“批准计划”；批准过程中禁止重复点击；
- 批准完成后显示版本和批准时间，并明确说明没有开始执行、没有创建团队；
- `DRAFT/PENDING`、`DRAFT/INVALID`、`SUPERSEDED` 和 `APPROVED` 不显示可用的批准按钮。

## 7. 非范围

- 新增 Task、通用 DAG 画布、输入/输出/里程碑编辑、预算编辑；
- Provider 重新规划或任何新的模型调用；
- 修改已批准 Plan；
- Organization、Agent、Scheduler、Run、Artifact、开始执行或 Corporation 状态迁移；
- Responses Adapter、streaming、预算账本或真实权限授予。
