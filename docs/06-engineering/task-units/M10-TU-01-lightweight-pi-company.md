# M10-TU-01 轻量公司统一 Pi 主流程

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M10-TU-01 |
| 状态 | 部分完成 |
| 所属 Milestone | Milestone 10：轻量公司统一入口 |
| 主要结果 | 用户从控制台进入长期轻量公司，管理可复用员工和常用工作区，在公司内发起并查看真实 Pi 任务；旧 Goal/Plan 公司只读保留。 |
| 基线提交 | `37ee112581aaaca339e3c65fa4fd7749313e0ab2` |

## 1. 需求与设计引用

- 用户确认采用 `1A + 2A + 3A`：新建与旧数据隔离的轻量公司；升级时自动建立“我的公司”接住已有 Pi 数据；员工和工作区可被多家公司复用，每项任务只属于一家公司；
- 用户确认旧 Goal/Plan 公司退出主流程，在“设置 → 旧版历史”只读保留；
- [产品重启说明](../../01-product/Product-Reboot.md)、[MVP Plan Milestone 10](../MVP-Plan.md#17-milestone-10轻量公司统一入口)、[领域模型](../../02-architecture/Domain-Model.md)、[Pi Company Protocol](../../04-protocols/Pi-Company-Protocol.md)、[数据模型](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[信息架构](../../07-ui/Information-Architecture.md)、[核心用户流程](../../07-ui/Core-User-Flows.md)和[UI 专项验收](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M9-TU-01 与 Milestone 9 已完成；单员工、Skill、Provider、工作区文本工具、编码命令和人工验收闭环可复用；
- 当前分支为 `codex/pi-reboot`，基线工作区没有未识别改动；
- 旧 `corporation`、Goal、Plan、Organization 和 Agent Run 数据保持原表与协议，不在本任务迁移或删除；
- 迁移编号 `0021` 尚未占用；协议和迁移由本任务串行修改。

## 3. 包含范围

- 新增独立 `PiCompany` 协议、Repository、Service、IPC 和 SQLite 表；创建只填写名称，支持改名；
- 新增公司—员工、公司—工作区多对多关系；添加/移出关系不删除员工、Workspace 授权或用户文件；
- 为 `PiTask` 增加不可变公司归属；新任务只允许使用当前公司的成员员工和当前可用、可写的常用工作区；
- 按公司列出任务历史，包括运行、等待验收、完成、失败、取消和中断状态；历史任务在成员或工作区移出后仍可查看；
- 升级已有 Pi 数据时只在存在 Pi 员工或任务时自动创建“我的公司”，接入全部现有员工、任务和任务使用过的工作区；
- 全新数据没有公司时显示创建入口；控制台创建公司只输入名称，进入公司后管理成员、工作区和任务；
- 同一员工可加入两家公司并复用原模型和 Skill 配置，不复制 Key；同一 Workspace 授权可加入两家公司；
- 主控制台不再展示或启动旧 Goal/Plan 公司；设置页提供旧公司名称、状态、工作区展示路径和目标摘要的只读历史；
- 保持旧数据、旧协议和兼容读取能力；保持 M7–M9 文本与编码任务的真实过程、权限和验收能力；
- 更新产品、领域、协议、数据、SQLite、UI、测试和项目状态的唯一权威文档。

## 4. 非范围

- 不做多员工自动组队、委派、调度或员工之间交接；
- 不恢复旧 Goal Contract、Plan、预算和固定 Planner/Executor/Judge 入口；
- 不把旧 Corporation、Goal、Plan 或 Agent Run 转成新 PiCompany/PiTask；
- 不删除旧数据，不提供旧流程继续执行、暂停、恢复或修改；
- 不做公司归档、彻底删除、导入导出、排序、搜索或复杂权限；
- 不做附件、图片、视频、音频、Word、PDF、Excel、PPT 或网络调研工具；
- 不改变现有命令授权、工作区文件安全和 API Key 存储边界。

## 5. 简化与后续增强

- 本任务使用 `DE-016` 记录首版不做公司归档、彻底删除、导入导出和旧历史迁移；
- `DE-011` 多员工协作、`DE-013` 附件和 `DE-014` 更多真实工具继续待后续任务，不能因公司容器完成而关闭；
- 旧 Goal/Plan 数据只读保留是用户确认的产品边界，不视为本任务未完成。

## 6. 依赖与接口

- `PiCompany` 与旧 `Corporation` 使用不同表、类型和 IPC channel；禁止通过名称相似进行 DTO 复用；
- `PiCompany` 名称为 1–120 字符；ID、成员 ID、Workspace ID 和 Task ID 均由可信边界校验；
- `PiTaskStartRequest` 增加 `companyId`；Main 在启动模型前同时验证公司、员工成员关系、工作区关系、工作区当前可写状态和员工 Provider/Skill 状态；
- `PiTask.companyId` 创建后不可更改；按公司查询必须由 Storage 条件限制，不能在 Renderer 收到全量后自行过滤；
- 迁移使用一个合法固定 UUID v7 作为升级默认公司 ID，只在存在旧 Pi 数据时插入；新建公司仍使用随机 UUID v7；
- 迁移保持原 `pi_task`、事件、写入、命令和授权引用有效，并以数据库约束阻止后续无公司任务；
- 旧版历史只调用只读 list/get；Renderer 不获得旧流程写入按钮或隐藏调用入口。

## 7. 交付物与所有权

专属修改区：Pi Company Protocol/Repository/Service/IPC/Preload、`0021_pi_company.sql`、公司控制台与公司工作区组件、公司迁移 fixture 和专项测试。

共享冲突区：Pi Employee/Pi Task Protocol、Storage 导出、Desktop Main/Preload、`App.tsx`、`EmployeesPage.tsx`、数据与 SQLite 文档、UI 文档、MVP Plan、Deferred Enhancements 和 `PROJECT_STATUS.md`。本任务串行修改这些文件。

## 8. 验收合同

- [x] 01 全新数据启动后显示清楚的空状态；用户只填写公司名称即可创建并进入公司，不出现 Goal、Plan、预算或组队步骤；
- [x] 02 升级已有 Pi 数据时自动创建可改名的“我的公司”，现有员工、任务和任务使用过的工作区全部接入且数量、ID、内容、状态、事件和时间不变；
- [x] 03 升级迁移不调用 Provider、模型、工具、命令或外部服务，重复启动和重复迁移不创建第二个默认公司或重复关系；
- [x] 04 控制台只列出轻量公司；旧 Goal/Plan 公司不再出现在主流程，也不能从主流程继续、暂停、恢复或修改；
- [x] 05 设置页“旧版历史”只读显示旧公司名称、状态、工作区展示路径和已有目标摘要；旧表、事件和关联记录保持不变；
- [ ] 06 用户可以修改轻量公司名称；名称校验、重复提交、错误和重启恢复真实可见；
- [ ] 07 同一员工可以加入两家公司，模型、Provider、Skill 和 Key 不复制；移出某公司不删除员工，也不影响其在另一公司或历史任务中的记录；
- [ ] 08 同一 Workspace 可以加入两家公司；移出某公司不撤销全局授权、不删除用户文件，也不影响另一公司或历史任务；
- [ ] 09 新任务只能选择当前公司的成员员工和当前可用、可写的常用工作区；伪造公司、员工或工作区关系在模型调用前固定拒绝；
- [ ] 10 每项新任务持久化唯一 `companyId` 且不可换公司；Main/Storage 按公司查询，跨公司不能查看、继续、取消、验收或退回该任务；
- [ ] 11 公司工作区显示本公司成员、常用工作区和各状态任务历史；历史任务在成员或工作区移出后仍可查看真实过程和结果；
- [x] 12 从公司内创建员工时只创建一份全局员工配置并自动加入当前公司；已有员工可以直接加入，不要求重复填写模型和 Skill；
- [x] 13 当前公司和最近任务在应用重启后恢复；已运行任务不因公司迁移、切换或重启被自动重放；
- [x] 14 文本任务和编码任务继续完成读取、修改、命令、实时过程、失败/取消和人工验收，不重新引入旧 Goal/Plan；
- [x] 15 Protocol strict Schema、IPC 授权、Repository、迁移、幂等、外键、关系移除和跨公司攻击测试通过；
- [ ] 16 空库、仅员工、员工加任务、含旧 Corporation、含已完成/运行中 PiTask 的升级矩阵通过，`foreign_key_check` 无错误；
- [ ] 17 开发态真实窗口完成“默认公司迁移 → 新建第二家公司 → 复用员工/工作区 → 发起并验收任务 → 跨公司隔离 → 旧历史只读”的连续旅程；
- [x] 18 公司控制台和公司工作区在 1024×700、1440×900 和 200% 缩放下无竖排、重叠、遮挡或关键操作不可达；
- [x] 19 当前提交 Windows/macOS CI、Secret scan、最终包真实窗口和安装包 artifact 通过；
- [ ] 20 用户使用当前 Windows 安装包完成上述主流程并确认人工验收后，本任务和 Milestone 10 才能关闭。

## 9. 隔离与干扰控制

- 自动测试使用 `M10-TU-01-<random>` 独立 userData、SQLite、Workspace、公司、员工、任务和端口；
- 升级 fixture 自建旧表数据并逐表核对，不读取或修改用户正式数据库；
- 两家公司使用不同 ID，攻击测试直接调用 Main IPC 验证，不能只依赖 UI 下拉框隐藏；
- 旧版历史测试只读取测试创建的旧 Corporation，不运行 Goal/Plan/Agent 服务；
- 真实 Provider 专项只使用应用本地已保存 Key，Key 不进入仓库、命令、日志、截图或测试产物；
- 测试结束只清理自己的临时目录、数据库和进程，不删除用户工作区或正式数据。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`pnpm test:e2e`、`git diff --check`；
- Protocol/IPC/Repository 单元测试和 SQLite 空库/升级/幂等/外键矩阵；
- 两家公司复用员工与工作区、跨公司任务拒绝、成员移出后历史保留的组件与 Main 集成测试；
- 开发态及最终包 1024×700、1440×900、200% 真实窗口旅程和截图人工检查；
- Windows/macOS GitHub Actions run/job、安装包 artifact、大小和哈希；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

用户已明确确认 `1A + 2A + 3A`，任务不存在待决策项，可以实施。只有 20 项验收断言全部具有当前提交直接证据、P0/P1 为 0、文档/协议/迁移/实现一致，并且用户完成 Windows 安装包人工验收，M10-TU-01 和 Milestone 10 才能标记“完成”。创建表、显示公司卡片、构建成功、进程存活或旧数据仍存在都不能单独证明迁移和完整主流程通过。
