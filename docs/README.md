# AI Corporation Desktop v0.1 文档中心

## 1. 文档目标

本目录将产品概念转化为可实现、可测试、可验收的工程约束。发生冲突时，按以下优先级处理：

1. 产品范围与验收标准；
2. 安全边界与人工审批要求；
3. 核心领域模型与协议；
4. 模块内部实现建议。

## 2. 文档状态

本文档清单同时是交付检查表。只有文件实际存在并完成基本一致性检查后，状态才标记为“完成”。

### 2.1 产品与总体架构

| 文档 | 状态 | 对应原对话交付项 |
|---|---|---|
| [产品需求文档](01-product/PRD.md) | 完成 | AI Corporation Desktop v0.1 产品需求文档 |
| [总体技术设计](02-architecture/Technical-Design.md) | 完成 | AI Corporation Desktop v0.1 技术设计文档 |
| [领域模型与术语](02-architecture/Domain-Model.md) | 完成 | 数据模型设计的上位领域定义 |

### 2.2 核心引擎

| 文档 | 状态 | 对应原对话交付项 |
|---|---|---|
| [Agent Runtime](03-core/Agent-Runtime.md) | 完成 | Agent Runtime 详细设计 |
| [Task Engine](03-core/Task-Engine.md) | 完成 | Task Engine 详细设计 |
| [Organization Engine](03-core/Organization-Engine.md) | 完成 | Organization Engine 详细设计 |
| [Scheduler](03-core/Scheduler.md) | 完成 | Scheduler 调度系统详细设计 |
| [Evaluation Engine](03-core/Evaluation-Engine.md) | 完成 | Judge Evaluation Engine 详细设计 |
| [Artifact System](03-core/Artifact-System.md) | 完成 | Artifact System 设计 |
| [Memory System](03-core/Memory-System.md) | 完成 | Memory System 设计 |

### 2.3 协议

| 文档 | 状态 | 对应原对话交付项 |
|---|---|---|
| [Agent Protocol](04-protocols/Agent-Protocol.md) | 完成 | Agent Protocol 协议设计 |
| [Task Protocol](04-protocols/Task-Protocol.md) | 完成 | Task Protocol 协议设计 |
| [Artifact Protocol](04-protocols/Artifact-Protocol.md) | 完成 | Artifact Protocol 协议设计 |
| [Event Protocol](04-protocols/Event-Protocol.md) | 完成 | 对原计划中 Event Bus 的工程化补充 |

### 2.4 数据与基础设施

| 文档 | 状态 | 对应原对话交付项 |
|---|---|---|
| [数据模型设计](05-infrastructure/Data-Model.md) | 完成 | 数据模型设计 |
| [SQLite Schema](05-infrastructure/SQLite-Schema.md) | 完成 | SQLite Schema 设计 |
| [Tool Runtime](05-infrastructure/Tool-Runtime.md) | 完成 | Tool Runtime 设计 |
| [Policy Engine](05-infrastructure/Policy-Engine.md) | 完成 | Policy Engine 权限策略设计 |
| [Model Provider](05-infrastructure/Model-Provider.md) | 完成 | 多模型接入与路由补充 |
| [Desktop 与 Rust 架构](05-infrastructure/Desktop-and-Rust-Architecture.md) | 完成 | Electron + Rust 工程架构 |
| [Plugin System](05-infrastructure/Plugin-System.md) | 完成 | 原总体设计中的插件扩展机制 |
| [Observability](05-infrastructure/Observability.md) | 完成 | 日志、Trace、成本与质量观测 |

### 2.5 工程实施

| 文档 | 状态 | 对应原对话交付项 |
|---|---|---|
| [统一验收标准](06-engineering/Acceptance-Standard.md) | 完成 | 项目唯一验收入口 |
| [MVP 开发计划](06-engineering/MVP-Plan.md) | 完成 | MVP 开发计划 |
| [工程与编码规范](06-engineering/Engineering-Standards.md) | 完成 | Coding 规范 |
| [测试方案](06-engineering/Testing-Strategy.md) | 完成 | 测试方案 |
| [安全威胁模型](06-engineering/Threat-Model.md) | 完成 | 桌面 Agent 沙箱的必要工程补充 |
| [决策记录](06-engineering/Decision-Records.md) | 完成 | 关键架构取舍及后续变更规则 |

### 2.6 UI/UX 设计

| 文档 | 状态 | 用途 |
|---|---|---|
| [UI/UX 文档中心](07-ui/README.md) | 完成 | UI 实现入口与设计完成定义 |
| [UI/UX 总体规范](07-ui/UI-UX-Specification.md) | 完成 | 体验原则、窗口、导航、状态语言与文案 |
| [信息架构](07-ui/Information-Architecture.md) | 完成 | 页面层级、路由、详情层和领域映射 |
| [核心用户流程](07-ui/Core-User-Flows.md) | 完成 | 设置、创建、执行、审批、恢复和交付流程 |
| [低保真页面线框](07-ui/Wireframes.md) | 完成 | 11 个关键屏幕的信息优先级与布局 |
| [页面与交互状态矩阵](07-ui/Screen-State-Matrix.md) | 完成 | 页面、领域对象和异常状态行为 |
| [基础设计系统](07-ui/Design-System.md) | 完成 | Token、组件、可访问性和平台适配 |
| [UI 专项验收标准](07-ui/UI-Acceptance.md) | 完成 | UI Definition of Done 与 UI-AC-01 至 UI-AC-07 |

### 2.7 项目工作入口

| 文档 | 位置 | 用途 |
|---|---|---|
| Codex 工作规则 | [`AGENTS.md`](../AGENTS.md) | Codex 自动读取的唯一仓库工作入口 |
| 项目进度 | [`PROJECT_STATUS.md`](../PROJECT_STATUS.md) | 当前阶段、已完成内容、下一步和验证记录 |

## 3. 推荐阅读顺序

1. PRD；
2. 总体技术设计；
3. 领域模型；
4. Task Engine 与 Agent Runtime；
5. Organization、Scheduler、Evaluation；
6. Artifact、Memory 和三份协议；
7. 数据、Tool、Policy、Provider、桌面/Rust、Plugin、Observability；
8. UI/UX 文档中心、低保真线框、状态矩阵和 UI 专项验收标准；
9. 统一验收标准、MVP 计划、工程规范、测试方案和威胁模型。

## 4. v0.1 冻结决策

| 决策 | v0.1 结论 |
|---|---|
| 产品形态 | Windows/macOS 桌面应用 |
| 数据策略 | Local-first，项目数据默认不上传 |
| 核心组织 | Planner、Executor、Judge 职责分离 |
| 执行模型 | 有向无环任务图（DAG）+ 持久化状态机 |
| 通信方式 | 结构化事件与 Artifact，不依赖 Agent 自由聊天 |
| UI/编排 | Electron + React + TypeScript |
| 系统能力 | Rust helper/core，使用窄接口暴露 |
| 本地存储 | SQLite；v0.1 不引入独立向量数据库进程 |
| 模型接入 | 适配器模式，不把 OpenAI Compatible 误认为所有厂商的完整标准 |
| 破坏性操作 | 默认禁止或必须明确审批 |
| 自主性 | 有预算、有权限、有停止条件的受控自主 |
| 自我修改 | v0.1 禁止修改应用、制度、权限和自身核心 Prompt |

## 5. MVP 成功定义

在一台干净的 Windows 或 macOS 机器上，用户能够：

1. 配置一个模型提供商；
2. 选择一个本地工作区并创建 Corporation；
3. 输入一个可在本地文件范围内完成的知识工作目标；
4. 查看系统生成的目标合同、任务图与临时团队；
5. 让至少三个任务经过规划、执行和独立验收；
6. 在写文件或执行高风险工具前收到明确审批；
7. 关闭并重新打开应用后恢复任务；
8. 获得可追踪到任务、Agent、工具调用和评价记录的最终交付物。
