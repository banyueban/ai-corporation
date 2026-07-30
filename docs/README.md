# AI Corporation Desktop v0.1 文档中心

## 1. 使用原则

本目录只保留当前正式可用的产品、设计、计划、合同和验收文档，不保存已失效版本或过程性历史文档。历史变化由 Git 记录。

文档角色只描述用途和约束力，不表示对应功能已经实现。功能与 Milestone 的真实进度只看 [`PROJECT_STATUS.md`](../PROJECT_STATUS.md)，具体任务状态只看当前任务合同。

发生冲突时统一按以下顺序处理：

1. 安全硬限制；
2. 已确认的用户目标和 PRD 产品范围；
3. 领域不变量、跨模块协议和数据约束；
4. 统一验收、缺陷与证据规则；
5. 模块内部设计和 UI 展示建议。

低优先级文档不得降低高优先级约束；无法消解时停止相关交付并请求决策。

## 2. 文档角色

| 角色                          | 含义                                                             |
| ----------------------------- | ---------------------------------------------------------------- |
| **规范性（Normative）**       | 实现必须遵守；偏离时先更新设计并获得确认                         |
| **参考性（Reference）**       | 提供导航、解释或示例，不单独形成验收要求                         |
| **计划（Planning）**          | 定义未来范围、顺序和 Milestone 退出条件                          |
| **当前状态（Current State）** | 只描述此刻真实进度、阻塞和下一步                                 |
| **任务合同（Contract）**      | 约束一个具体任务单元的范围、接口、所有权和验收                   |
| **验收证据（Evidence）**      | 证明某个提交、交付物或发布候选满足断言；默认保存在 CI/测试产物中 |

项目不维护文档有效状态。“完成”只用于功能、任务或 Milestone 已通过全部适用验收的情况，不用于表示文档已经写完。

## 3. 权威来源

| 事实                                 | 唯一权威来源                                                     |
| ------------------------------------ | ---------------------------------------------------------------- |
| 产品范围、用户场景和产品验收条件     | [PRD](01-product/PRD.md)                                         |
| 总体架构和进程信任边界               | [总体技术设计](02-architecture/Technical-Design.md)              |
| 术语、领域实体和领域生命周期         | [领域模型](02-architecture/Domain-Model.md)                      |
| 跨模块 DTO、Schema、枚举和协议错误   | [协议目录](04-protocols/)中对应协议                              |
| 模块行为、算法、恢复和状态迁移       | [核心引擎目录](03-core/)中对应模块                               |
| 逻辑持久化实体及其物理映射           | [数据模型](05-infrastructure/Data-Model.md)                      |
| SQLite 表、列、约束和索引            | [SQLite Schema](05-infrastructure/SQLite-Schema.md)              |
| 安全硬限制和人工审批边界             | [安全威胁模型](06-engineering/Threat-Model.md)                   |
| 通用 DoD、缺陷等级、证据和发布总门槛 | [统一验收标准](06-engineering/Acceptance-Standard.md)            |
| 测试层级、测试方法和测试环境         | [测试方案](06-engineering/Testing-Strategy.md)                   |
| UI 信息架构、流程、状态和视觉约束    | [UI/UX 文档中心](07-ui/README.md)及其路由                        |
| Milestone 范围和退出条件             | [MVP 开发计划](06-engineering/MVP-Plan.md)                       |
| 当前项目进度和当前任务               | [`PROJECT_STATUS.md`](../PROJECT_STATUS.md)                      |
| 当前任务的实施与验收边界             | `PROJECT_STATUS.md` 指向的[任务合同](06-engineering/task-units/) |

协议文档只定义跨模块数据合同；Core 文档不得另建不兼容副本。Core 文档只定义行为。数据模型只定义逻辑映射；SQLite Schema 只定义物理结构。

## 4. 按任务阅读

所有任务先读：

1. [`AGENTS.md`](../AGENTS.md)；
2. [`PROJECT_STATUS.md`](../PROJECT_STATUS.md)；
3. 当前任务合同；
4. [统一验收标准](06-engineering/Acceptance-Standard.md)中适用部分。

然后只补充与任务直接相关的文档：

| 任务类型               | 追加阅读                                                  |
| ---------------------- | --------------------------------------------------------- |
| 产品范围或用户场景     | PRD、MVP Plan                                             |
| 领域状态或业务规则     | Domain Model、对应 Core、对应 Protocol                    |
| IPC/RPC/事件/Schema    | 对应 Protocol、Desktop and Rust Architecture              |
| 数据库或迁移           | Data Model、SQLite Schema、对应领域/协议                  |
| 文件、进程、权限或审批 | Threat Model、Tool Runtime、Policy Engine                 |
| 模型接入或调度         | Model Provider、Scheduler、Agent Protocol                 |
| 用户界面或交互         | UI 文档中心路由的相关页面、流程、状态和 UI Acceptance     |
| 测试、Milestone 或发布 | Testing Strategy、Acceptance Standard、对应 MVP Plan 章节 |

禁止把本文档中心当成每个任务都要全文读取的线性清单。

## 5. 文档目录

| 分组           | 角色     | 文档                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 产品与架构     | 规范性   | [PRD](01-product/PRD.md)、[Technical Design](02-architecture/Technical-Design.md)、[Domain Model](02-architecture/Domain-Model.md)                                                                                                                                                                                                                                                                           |
| 核心引擎       | 规范性   | [Agent Runtime](03-core/Agent-Runtime.md)、[Task Engine](03-core/Task-Engine.md)、[Organization](03-core/Organization-Engine.md)、[Scheduler](03-core/Scheduler.md)、[Evaluation](03-core/Evaluation-Engine.md)、[Artifact](03-core/Artifact-System.md)、[Memory](03-core/Memory-System.md)                                                                                                                  |
| 协议           | 规范性   | [Agent](04-protocols/Agent-Protocol.md)、[Task](04-protocols/Task-Protocol.md)、[Artifact](04-protocols/Artifact-Protocol.md)、[Corporation](04-protocols/Corporation-Protocol.md)、[Goal Contract](04-protocols/Goal-Contract-Protocol.md)、[Event](04-protocols/Event-Protocol.md)、[Workspace](04-protocols/Workspace-Protocol.md)、[Native Health](04-protocols/Native-Health-RPC.md)                                              |
| 基础设施       | 规范性   | [Data Model](05-infrastructure/Data-Model.md)、[SQLite](05-infrastructure/SQLite-Schema.md)、[Tool](05-infrastructure/Tool-Runtime.md)、[Policy](05-infrastructure/Policy-Engine.md)、[Provider](05-infrastructure/Model-Provider.md)、[Desktop/Rust](05-infrastructure/Desktop-and-Rust-Architecture.md)、[Plugin](05-infrastructure/Plugin-System.md)、[Observability](05-infrastructure/Observability.md) |
| 工程治理       | 规范性   | [Acceptance](06-engineering/Acceptance-Standard.md)、[Engineering Standards](06-engineering/Engineering-Standards.md)、[Testing](06-engineering/Testing-Strategy.md)、[Threat Model](06-engineering/Threat-Model.md)、[Decision Records](06-engineering/Decision-Records.md)、[Task Unit Standard](06-engineering/Task-Unit-Standard.md)                                                                     |
| 开发路线       | 计划     | [MVP Plan](06-engineering/MVP-Plan.md)                                                                                                                                                                                                                                                                                                                                                                       |
| UI/UX          | 规范性   | [UI/UX 文档中心](07-ui/README.md)                                                                                                                                                                                                                                                                                                                                                                            |
| 项目进度       | 当前状态 | [`PROJECT_STATUS.md`](../PROJECT_STATUS.md)                                                                                                                                                                                                                                                                                                                                                                  |
| 当前实施       | 任务合同 | [Task Units](06-engineering/task-units/)                                                                                                                                                                                                                                                                                                                                                                     |
| Codex 工作入口 | 规范性   | [`AGENTS.md`](../AGENTS.md)                                                                                                                                                                                                                                                                                                                                                                                  |
| 仓库与文档导航 | 参考性   | [`README.md`](../README.md)、本文档                                                                                                                                                                                                                                                                                                                                                                          |
