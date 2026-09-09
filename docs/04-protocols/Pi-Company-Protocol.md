# Pi Company Protocol

## 1. 目的

本协议定义 Pi 路线轻量公司在 Renderer、Electron Main 和 Storage 之间的数据合同。它不复用旧 Corporation/Goal/Plan DTO。

## 2. 核心对象

`PiCompany`：

- `schemaVersion: 1`；
- `id: UUID v7`；
- `name: 1–120 字符`；
- `createdAt`、`updatedAt`: 带时区 ISO-8601。

公司详情由以下可信引用组成：

- `employeeIds`：已加入公司的全局 Pi 员工 ID；
- `workspaceIds`：公司常用的已授权 Workspace ID；
- 任务通过 `PiTask.companyId` 固定归属公司。

## 3. 操作

- `pi-company:list`：列出轻量公司；
- `pi-company:create`：只接收名称和幂等 `commandId`；
- `pi-company:update-name`：按公司 ID 改名；
- `pi-company:add-employee` / `remove-employee`：只改变成员关系，不删除员工；
- `pi-company:add-workspace` / `remove-workspace`：只改变常用关系，不撤销 Workspace 授权或修改用户文件；
- `pi-task:list`：按可信 `companyId` 列出该公司任务；
- `pi-task:start`：同时接收 `companyId`、成员员工 ID、公司常用 Workspace ID 和任务内容。
- `pi-task:start-collaboration`：接收 `companyId`、用户选择的最终负责人 ID、公司常用 Workspace ID、任务内容和可选附件；协助员工由最终负责人通过受控委派工具从当前公司成员中选择；
- `pi-task:continue-collaboration`：只处理处于“需要用户决定”的协作任务，动作限定为使用现有结果继续或重新安排失败工作；停止继续使用 `pi-task:cancel`。

所有请求使用 strict Schema。Renderer 不能提供绝对可信根、伪造成员关系或绕过 Workspace 当前可用/可写检查。

## 4. 不变量

- 新旧公司 ID 空间和表分离；
- 一个员工和工作区可以加入多家公司；
- 一项任务只能属于一家公司，创建后不可换公司；
- 公司协作任务的最终负责人由用户确定，模型不能替换；协助员工必须是当前公司其他成员；
- 协作任务与普通单员工任务使用同一个 Workspace，首版不创建 worktree、分支或副本；
- 一个文件只由一名员工负责；M15-TU-01 中只有最终负责人获得文件写入能力，协助员工只能读取必要内容并交回应用内结果；
- 协助员工失败不自动重试；继续、重新安排或停止必须形成可见事实；
- 移出成员或工作区不改写历史任务；历史任务仍可查看，但新任务只能选择当前成员和常用工作区；
- 重复加入保持幂等；删除不存在的关系返回当前真实结果，不删除底层对象；
- 升级迁移不调用模型、工具、命令或外部服务。

## 5. 错误

统一错误包括：`INVALID_REQUEST`、`UNAUTHORIZED_CALLER`、`NOT_FOUND`、`NAME_CONFLICT`、`EMPLOYEE_NOT_FOUND`、`WORKSPACE_NOT_READY`、`NOT_A_MEMBER`、`STORAGE_UNAVAILABLE` 和 `INTERNAL`。

错误正文只返回稳定中文摘要，不包含 Key、工作区可信绝对根、SQL 或用户文件内容。

## 6. 旧数据兼容

旧 `Corporation` 协议和数据保持原样，但当前界面不提供入口。Pi Company 协议不得启动旧 Goal、Plan、Organization 或 Agent Run，也不得把旧状态映射成新公司的成功状态。
