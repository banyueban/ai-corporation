# AI Corporation Desktop v0.1 MVP 开发计划

## 1. 交付策略

按可运行的垂直切片开发，不先分别造完 UI、数据库、Rust 和 Agent 框架。每个里程碑都应产生可演示、可测试的用户价值。

自 2026-08-14 起，产品按[产品重启说明](../01-product/Product-Reboot.md)重新推进。Milestone 0～2 中已经验收通过的桌面工程、安装包、SQLite、工作区、Provider 和 API Key 管理继续复用。旧 Milestone 3 停止继续扩展，未通过人工验收的 M3-TU-04 保持未完成，不用旧任务状态冒充新路线进度。新的实施从 Milestone 7 开始，先证明一名 Pi 员工真的可用，再增加多员工和更多任务类型。

为加快阶段交付而主动省略、简化，但未来仍需补齐或丰富的内容，统一登记在[简化与后续增强清单](Deferred-Enhancements.md)。里程碑关闭不自动取消这些项目；拆分下一阶段任务前必须重新检查并安排。

建议周期：8–10 周，小团队 2–4 人；单人开发应按依赖顺序执行，不以日历承诺为准。

任何用户可见功能进入实现前，必须读取 [UI/UX 文档中心](../07-ui/README.md)。Milestone 0 的工程壳不要求达到产品高保真视觉，但从 Milestone 1 起的页面、交互和状态必须遵守 UI 基线与专项验收标准。

## 2. 实施与退出规则

通用 Definition of Done、缺陷门槛和证据要求只由[统一验收标准](Acceptance-Standard.md)定义。本文档只定义 Milestone 范围、交付物、演示和退出条件。

### 2.1 任务单元与阶段改进

- 每个 Milestone 开始实现前，按 [解耦任务单元规范](Task-Unit-Standard.md)拆分首个可独立验收的垂直切片；
- 每次只启动一个“就绪”任务单元，相邻能力进入后续任务合同；
- 每个任务单元必须定义包含/非范围、依赖、交付物所有权、共享冲突区、隔离方式和直接验收证据；
- 单元通过不自动代表功能或 Milestone 通过；
- Milestone 关闭后、下一 Milestone 首个实现任务开始前，必须检查过程问题，并把仍然有效的改进直接落到当前规范、自动检查或下一任务合同；不保留单独的历史复盘文档。

## 3. Milestone 0：工程基线

目标：建立可重复构建的空应用。

交付：

- pnpm/Cargo workspace；
- Electron Main、Preload、React Renderer；
- Rust Sidecar 握手；
- TypeScript strict、lint、format；
- Vitest、Rust test、Playwright；
- CI 的 Windows/macOS 构建；
- SQLite migration runner；
- 基础 CSP、contextIsolation、禁用 Node integration。

验收：

- 两个平台最终打包应用可启动；
- 最终打包应用的 Renderer 调用一个 typed IPC，再调用 Rust `health` RPC；
- CI 生成未签名开发安装包；
- 安全配置自动测试通过。

## 4. Milestone 1：本地项目骨架

目标：用户可创建并恢复 Corporation，不接真实模型。

交付：

- Workspace 选择、授权、权限重新验证和展示；
- Corporation 创建、读取、更新和归档，删除不在本 Milestone；
- Goal Contract 手工录入或 Mock 生成并版本化保存，不调用真实模型、不生成 Task Graph；
- 支持 Workspace、Corporation、Goal、Event 和恢复状态的 SQLite 核心表；
- 状态变化与 Domain Event 同事务写入，并提供最小时间线；
- 支持安全暂停、应用重启和恢复且不重复已提交副作用的基础状态机。

演示：

```text
选择工作区 → 创建 Corporation → 保存目标 → 重启应用 → 恢复
```

验收：

- 状态与事件事务一致；
- 工作区外路径被 Rust 拒绝；
- Renderer 重载和应用重启不丢失已持久化状态。

## 5. Milestone 2：Provider 与 Goal/Plan

目标：真实模型生成可编辑 Goal Contract 和 Task Graph。

交付：

- AI Corporation Desktop 应用自管 Key Vault；
- OpenAI 风格 Provider + Mock Provider；
- 连接测试、错误归一化和用量；
- Goal Engine；
- Planner 结构化输出；
- DAG/输入输出/验收验证；
- Plan 审阅 UI。

验收：

- Key 不以明文进入 SQLite 或日志；Renderer 可以录入并管理 Key，默认遮挡已存值，只有用户主动选择查看时才显示明文；
- 非法 JSON 自动修复最多一次；
- 循环依赖和无验收 Task 被拒绝；
- 用户可修改并批准计划。

Milestone 2 的 L3 演示与验收采用用户确认的证据汇总方式：不为关闭里程碑新增一条从 Key 设置到 Plan 批准的连续自动化流程；由 M2-TU-02 至 M2-TU-08 各自已完成的直接证据组成交付物与用户旅程矩阵，并在当前验收提交上重新执行 Windows/macOS 开发态真实窗口、最终包真实窗口、完整工程回归和制品上传。Windows 保留用户对最终安装包的人工验收结论，macOS 使用真实 macOS CI 窗口自动化证据。证据汇总不等同于声称存在一条未中断的端到端测试；任一当前必检项失败仍阻止 Milestone 2 关闭。

阶段边界：Planner 先生成并保存 `DRAFT/PENDING` 结构化草稿；独立的本地确定性验证器随后检查 1–20 个 Task 的 DAG、输入输出、逐 Task 验收、叶子输出、预算与权限描述，通过时原子创建正式 Task/依赖，失败时保存结构化问题且不调用模型、不自动修改计划；Plan Review 再负责编辑和批准。模型只生成语义内容与局部引用，正式 Plan/Task 身份由应用分配。每次规划前用户明确选择已验证 Provider/精确模型，Provider 输入不包含 Workspace 路径或文件内容。Milestone 2 只显示能力要求和建议角色并标注尚未组队，真实 Organization Engine 仍属于 Milestone 3。

## 6. Milestone 3：最小 Agent 闭环

目标：Planner → Executor → Artifact → Judge。

首个垂直切片的阶段边界：Plan 通过验证并由用户批准后，只出现“开始组队”入口；批准 Plan 本身不创建团队。用户明确点击后，应用使用内置且有版本号的 Planner、Executor、Judge 模板，按固定规则生成并保存团队草案，同时展示 Task 分工、职责分离和能力缺口。Executor 固定分为分析与文档、软件实现、质量验收三类，计划用到哪类才创建哪类；需要用户决定的 Task 直接标记由用户负责，不分配给 Executor。这个切片不调用模型、不选择精确 Provider 或模型、不创建 Agent Instance/Run、不激活团队、不开始执行，Corporation 继续保持 `DRAFT`。草案只记录模型策略；真正运行 Agent 时再由后续任务选择精确 Provider 和模型。

交付：

- Agent Definition/Instance/Run；
- Organization Engine 最小团队；
- Scheduler 基础硬约束与评分；
- Agent Runtime 非工具模型循环；
- Artifact 文本/JSON/文件版本；
- Evaluation 的 Schema、Content、LLM Judge；
- 修订一次。

演示：

```text
输入文档目标
→ 生成 3 个任务
→ Executor 创建候选 Markdown
→ Judge 指出缺失
→ 新版本修订通过
```

验收：

- Executor/Judge 实例分离；
- Artifact 旧版本保留；
- 每项评价有 Evidence；
- 达到修订上限后停止。

## 7. Milestone 4：受控工具与工作区交付

目标：Agent 在明确审批后修改工作区。

交付：

- Tool Registry；
- list/read/search/propose_write；
- Policy Engine；
- 审批 UI；
- Change Set、diff、哈希冲突与原子提交；
- Process Profile 和 project checks；
- Tool Invocation 幂等记录。

验收：

- 路径穿越、符号链接、盘符越界被拒绝；
- 写入前显示精确 diff；
- 外部修改触发冲突；
- 任意 shell 字符串不可执行；
- 删除默认必须审批。

## 8. Milestone 5：预算、恢复与可观察性

目标：长任务可控运行并从异常退出恢复。

交付：

- Token/费用/时间预算；
- 预算预留和账本；
- Provider 限流/熔断；
- Run/Tool 检查点；
- 租约与恢复扫描；
- 取消和正常退出；
- 时间线、成本、诊断包。

验收：

- 硬预算不超支；
- 中断后不重复文件提交；
- 未知命令副作用进入人工；
- 事件断线补发；
- 诊断包脱敏。

## 9. Milestone 6：内测发布

交付：

- Onboarding 与设置；
- 最终交付报告；
- 数据备份、迁移与删除；
- 应用菜单、更新检查；
- Windows/macOS 安装包；
- 20 次 dogfood；
- 已知限制与隐私说明。

产品指标见 PRD；完整发布总门槛只由[统一验收标准](Acceptance-Standard.md)定义。

## 10. 工作分解

### P0

- 状态机与恢复；
- IPC/RPC 安全；
- Workspace 边界；
- Provider 与密钥；
- Task/Agent/Artifact/Evaluation 闭环；
- 预算硬限制；
- Windows/macOS 构建。

### P1

- Plan 编辑体验；
- 调度解释；
- FTS Memory；
- 诊断包；
- 声明式插件；
- 自动更新。

### P2 / v0.2

- 浏览器工具；
- 更多原生 Provider；
- 本地模型管理；
- 复杂 DAG 编辑；
- 多 Corporation 并发；
- Agent 能力学习增强；
- 插件市场。

## 11. 推荐首个端到端验收项目

目标：

> 在空工作区生成一套包含 PRD、技术设计、开发计划的 Markdown 文档，并验证目录、必需章节和内部链接。

理由：

- 有多任务依赖；
- 有可见 Artifact；
- 能做确定性验证；
- 需要写文件审批；
- 失败可修订；
- 不依赖危险外部动作。

## 12. 风险燃尽顺序

1. 路径与命令安全；
2. 状态机/恢复；
3. 模型结构化输出；
4. Artifact 原子提交；
5. Judge 可靠性；
6. 调度优化；
7. 记忆与插件。

不要在 1–4 未稳定时投入复杂“AI 公司”视觉或能力市场。

## 13. 发布产物

- Windows 安装包；
- macOS Apple Silicon 安装包；
- 可选 macOS Intel 安装包；
- Schema/migration；
- 内置 Agent/Prompt/Tool manifest；
- 用户指南与已知限制；
- 版本化设计文档；
- 测试与安全报告。

## 14. Milestone 7：Pi 单员工可用闭环

目标：用户在 AI Corporation Desktop 中创建一名员工，为员工选择独立模型和技能，交给它一个真实任务，并实时看到模型与工具过程，最后人工验收结果。

交付：

- 接入 `@earendil-works/pi-ai` 和 `@earendil-works/pi-agent-core`；
- 一名可保存的员工，拥有自己的名称、模型、技能和工作上下文；
- 对话式任务入口；
- 模型流式输出、取消和清楚的失败说明；
- 默认简洁进度，以及可展开的完整模型输入、原始输出和工具过程；
- 员工自查后进入“等待用户验收”，用户确认后才完成；
- Windows 真实安装包人工验收。

首个任务单元只做不修改用户文件的安全演示工具，以证明 Pi 的完整工具循环和过程展示。通用文件工具、附件、多员工、图片、视频、文档和 PPT 专用能力由后续独立任务接入。

演示：

```text
打开员工页面
→ 创建一名员工并选择真实 Provider/model，按用户确认的方式配置一项技能
→ 输入一个需要安全演示工具的任务
→ 实时查看模型输出、完整模型输入和工具记录
→ 员工给出结果并等待验收
→ 用户确认完成
```

退出条件：

- 不使用旧 Goal/Plan/严格 JSON 流程也能完成上述演示；
- 模型输入、原始流式输出、工具输入/结果/错误均可查看，认证秘密不显示；
- 每名员工的模型和技能归员工自己保存，不修改 Provider 默认模型；
- 取消、模型失败、工具失败和应用重启后的状态真实，不把失败显示成成功；
- Windows 开发态真实窗口、最终安装包真实窗口、自动检查和用户人工验收通过；
- 单元测试、构建成功或进程存活不能代替上述真实窗口和人工验收。

Milestone 7 通过后仍不代表附件、通用文件修改、多员工协作或所有 AI 任务类型已经交付。
