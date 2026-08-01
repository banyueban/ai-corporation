# AI Corporation Desktop v0.1 MVP 开发计划

## 1. 交付策略

按可运行的垂直切片开发，不先分别造完 UI、数据库、Rust 和 Agent 框架。每个里程碑都应产生可演示、可测试的用户价值。

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

## 6. Milestone 3：最小 Agent 闭环

目标：Planner → Executor → Artifact → Judge。

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
