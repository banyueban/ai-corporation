# 架构决策记录

本文件汇总 v0.1 已冻结决策。后续重大变化应拆分为单独 ADR，并保留历史状态。

## ADR-001：桌面应用而非 B/S 服务

- 状态：Accepted
- 决策：构建 Windows/macOS 本地桌面应用。
- 原因：需要本地文件、进程、长期任务和数据本地优先。
- 后果：必须处理安装、签名、平台路径、安全存储和恢复。

## ADR-002：Electron + React + TypeScript

- 状态：Accepted
- 决策：桌面外壳使用 Electron，UI 使用 React，编排使用 TypeScript。
- 原因：跨平台 UI 和 AI/SDK 生态成熟，可快速验证 MVP。
- 后果：需严格 Electron 安全基线和资源控制。

## ADR-003：Rust 作为窄系统能力 Sidecar

- 状态：Accepted
- 决策：Rust 负责路径、文件原子提交、进程和安全存储，不在 v0.1 全面承载业务编排。
- 原因：兼顾安全、跨平台、崩溃隔离和开发速度。
- 后果：存在双运行时和 RPC 合同成本。

## ADR-004：Local-first + SQLite

- 状态：Accepted
- 决策：业务状态存 SQLite，Artifact 内容存本地受管目录/工作区。
- 原因：单用户桌面、事务、部署简单。
- 后果：未来多人/云同步需新增同步层，而非直接共享数据库。

## ADR-005：DAG + 状态机，不采用自由 Multi-Agent Chat

- 状态：Accepted
- 决策：工作以 Task Contract、依赖和 Artifact 流转。
- 原因：可观察、可恢复、可验收、可控制成本。
- 后果：开放式协作能力受限，但符合 v0.1 目标。

## ADR-006：执行与验收分离

- 状态：Accepted
- 决策：关键 Task 的 Executor 不能成为唯一 Judge。
- 原因：降低自我确认偏差。
- 后果：增加调用成本，低风险任务可由确定性检查替代 LLM Judge。

## ADR-007：确定性验证优先

- 状态：Accepted
- 决策：Schema、文件、构建、测试等优先于 LLM Judge。
- 原因：更可靠、便宜、可解释。
- 后果：需要构建 Evaluator 体系。

## ADR-008：模型适配器而非单一兼容协议

- 状态：Accepted
- 决策：定义统一最小接口，允许原生 Provider Adapter。
- 原因：各厂商 Tool、Schema、usage、错误语义不同。
- 后果：适配器数量增加，但避免错误抽象。

## ADR-009：不引入独立向量数据库

- 状态：Accepted for v0.1
- 决策：SQLite FTS5 为基础，可选 embedding。
- 原因：减少安装、后台进程和跨平台负担。
- 后果：大规模语义检索能力有限。

## ADR-010：工具默认最小权限

- 状态：Accepted
- 决策：模型只提出调用；Policy + Native Core 执行；任意 shell 禁止。
- 原因：本地 Agent 的主要风险是副作用和越权。
- 后果：需要审批 UI 和 Process Profile。

## ADR-011：状态表 + append-only 事件，而非完整 Event Sourcing

- 状态：Accepted
- 决策：当前状态与审计事件并存，事务性写入。
- 原因：保留可观察性，降低全量重放复杂度。
- 后果：必须测试状态与事件一致。

## ADR-012：v0.1 自主性边界

- 状态：Accepted
- 决策：受预算、权限、重试、时间和人工审批限制；禁止自改制度、自增预算和自我复制。
- 原因：先验证可控闭环。
- 后果：不是完全无人监管的通用自治系统。

## ADR-013：插件以声明式贡献为主

- 状态：Accepted for v0.1
- 决策：不允许第三方任意原生代码。
- 原因：降低供应链与权限绕过风险。
- 后果：插件能力有限，后续需单独设计隔离运行时。

## ADR 变更规则

新 ADR 包含：

- 背景；
- 决策；
- 备选方案；
- 正反影响；
- 安全与迁移影响；
- 状态（Proposed/Accepted/Superseded/Rejected）；
- 日期与负责人。

已 Accepted 的决策不得静默修改。新决策通过 `Supersedes` 关联旧 ADR。

