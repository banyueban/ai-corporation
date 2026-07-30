# M1-TU-03 原生 Workspace 选择与恢复 UI

| 属性           | 值                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------- |
| 任务单元 ID    | M1-TU-03                                                                                 |
| 状态           | 进行中                                                                                   |
| 所属 Milestone | Milestone 1：本地项目骨架                                                                |
| 主要结果       | 用户可通过原生目录选择器授权并查看 Workspace，Renderer 重载后仍能恢复和重新验证公开状态 |
| 基线提交       | `3ced71a5e3273fd9270193c7ed94309e8123e6b7`                                               |

## 1. 需求与设计引用

- [MVP Plan：Milestone 1](../MVP-Plan.md)；
- [PRD FR-001、跨平台和 Electron 安全要求](../../01-product/PRD.md)；
- [Workspace Protocol](../../04-protocols/Workspace-Protocol.md)；
- [Electron、TypeScript 与 Rust 工程架构](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [安全威胁模型 T-02、T-07](../Threat-Model.md)；
- [测试方案](../Testing-Strategy.md)；
- [UI/UX 总体规范](../../07-ui/UI-UX-Specification.md)；
- [信息架构：Dashboard](../../07-ui/Information-Architecture.md)；
- [核心用户流程：创建 Corporation 与 Goal Contract](../../07-ui/Core-User-Flows.md)；
- [低保真线框：UI-02、UI-03](../../07-ui/Wireframes.md)；
- [页面与交互状态矩阵](../../07-ui/Screen-State-Matrix.md)；
- [基础设计系统](../../07-ui/Design-System.md)；
- [UI 专项验收：UI-AC-02 的 Workspace 子流程](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

实施就绪条件：

- `M1-TU-01` 与 `M1-TU-02` 已完成，Workspace v1 公开/可信 DTO、Repository、重新验证和安全错误已冻结；
- 仓库 `banyueban/ai-corporation`、`main` 分支和 Windows x64/macOS Apple Silicon CI 可用；
- 基线提交已记录，工作区无未识别修改，共享 IPC、Renderer 和 `PROJECT_STATUS.md` 冲突区可串行修改；
- `workspace:select` 的无路径请求、取消语义、公开成功值、固定错误和重复选择语义已在 Workspace Protocol 定义；
- 本任务不依赖 Corporation、Goal 或 Provider 后端，可把 Workspace 选择作为 UI-AC-02 的独立前置切片验收。

验收环境条件：

- 每个测试使用带 `M1-TU-03` 和随机后缀的临时 user data directory、SQLite 文件与空 Workspace 根；
- Windows x64 与 macOS Apple Silicon 分别运行开发态和最终打包应用 E2E；
- E2E 使用只在显式测试环境变量存在时启用的一次性可信 Main 选择 fixture，覆盖 Renderer → Main → Rust → SQLite → Renderer 重载链路；
- 生产目录选择适配器必须另有测试证明调用 Electron 原生目录选择器且只允许单个目录，E2E fixture 不替代该适配器断言。

## 3. 包含范围

- Workspace Protocol：
  - 新增无参数 `workspace:select` allowlisted IPC；
  - 新增 strict 选择结果联合：已选择的 `WorkspacePublic` 或用户取消；
  - 新增固定安全错误 `SELECTION_UNAVAILABLE`；
- Electron Main：
  - 使用 Electron 原生目录选择器选择单个现有目录；
  - Renderer 不提供路径、权限、身份或 Workspace ID；
  - 将选择结果交给 Native Core canonicalize 和权限探针；
  - 在可信边界生成 UUID v7、保存授权并只返回公开投影；
  - 同一 canonical root 与身份重复选择时幂等返回已有记录，不创建重复授权；
  - canonical root 相同但身份变化时拒绝静默覆盖；
  - 支持显式 E2E 环境的一次性可信选择 fixture，生产默认路径不读取该 fixture；
- typed preload 与 Renderer：
  - 暴露 `workspace.select()`、`workspace.list()` 和 `workspace.revalidate()` 的 strict API；
  - Dashboard 实现 Workspace 首次加载、空、正常、错误和重新验证状态；
  - “创建第一个 Corporation”进入 UI-03 的 Workspace 选择切片；
  - 选择成功后只展示 `displayPath`、真实权限和访问状态；
  - 用户取消后保留可操作页面且不显示错误成功态；
  - Renderer 重载后从 SQLite 恢复列表，并重新验证每个 Workspace；
  - `MISSING`、`PERMISSION_DENIED`、`UNVERIFIED` 和验证服务不可用时显示准确影响和恢复动作；
- UI 与可访问性：
  - 遵循 UI-02/UI-03 低保真信息层级，不实现尚无后端的虚假 Corporation 状态；
  - 完整键盘操作、可见焦点、状态非纯颜色表达和 live region；
  - 1024 × 700、1440 × 900 与 200% 缩放下 Workspace 选择核心流程可完成；
- 组件、协议、Main/service、IPC、E2E、最终打包应用和安全回归测试。

本任务完成 Milestone 1 的 Workspace 选择、授权、展示与 Renderer 重载恢复用户切片。Corporation、Goal、Event、暂停/恢复和完整 Milestone 演示仍由后续任务完成，因此本任务不得关闭 Milestone 1。

## 4. 非范围

- Goal、约束、交付物、预算和停止条件的可提交表单；
- Corporation 创建、读取、更新、归档或删除；
- Goal Contract 手工/Mock 生成、版本化或计划生成；
- Provider Onboarding、模型设置或凭据存储；
- 修改、移除或扩权已有 Workspace；
- 自动接受 canonical root 相同但身份已经变化的新目录；
- 文件读取、搜索、写入、Change Set、命令执行和 Tool Approval；
- Corporation Workspace、Plan、Team、Artifact、Timeline 或 Recovery 页面；
- Storybook、完整组件库、高保真品牌视觉、安装/卸载和签名/notarization。

后续 `M1-TU-04` 及其他单元只能消费本任务冻结的公开 Workspace 选择结果，不能把路径判定、目录对话框或可信记录下放给 Renderer。

## 5. 依赖与接口

- `workspace:select` 不接受请求参数；额外参数、非授权窗口和未知 channel 必须拒绝；
- 选择成功值只能是 `{ status: "SELECTED", workspace: WorkspacePublic }`，取消只能是 `{ status: "CANCELLED" }`；
- Renderer 不得获得 `canonicalRootPath`、`pathIdentity`、原生句柄、SQLite/SQL、探针路径或用户文件内容；
- Electron 原生目录选择结果是唯一生产授权输入；手工输入框、URL、拖放和 Renderer 路径均不形成授权；
- Main 必须使用选择路径调用 `workspace.canonicalize` 的空候选，并要求结果包含 `permissionMode`；
- UUID v7 由可信 Main 使用操作系统随机源生成；
- 新授权以 `AVAILABLE` 和当前验证时间保存；取消不写数据库、不生成 Workspace ID；
- 重复选择同一 canonical root 且身份一致时原子更新权限/状态并返回原 Workspace ID；身份不一致时保持原可信记录并返回固定安全错误；
- 页面加载先 `workspace:list`，再对返回记录逐个 `workspace:revalidate`；单项失败不能清空其他成功记录；
- `displayPath` 只展示，不参与安全判断；非 `AVAILABLE` 状态下的 `permissionMode` 只标记为上次验证能力；
- 所有响应继续经过 preload 和 Renderer 侧 runtime Schema 验证。

## 6. 交付物与所有权

专属修改区：

- Workspace 原生目录选择适配器、授权 service 和相关测试；
- Dashboard/Create Workspace React 组件、状态模型、样式和组件测试；
- M1-TU-03 开发态、重载、尺寸、缩放及打包应用 E2E fixture；
- UUID v7 生成器及确定性结构测试。

共享冲突区：

- Workspace Protocol v1 和公共导出；
- Workspace Repository 与 application service；
- Electron Main/Preload 注册和 `DesktopApi`；
- Renderer 入口与全局样式；
- 打包应用验收脚本、CI artifact 路径；
- `PROJECT_STATUS.md`。

共享冲突区由本任务串行集成。协议保持 v1 向后兼容，只新增 channel、联合类型和错误枚举；不得改变 `workspace:list`、`workspace:revalidate` 或 M1-TU-02 已冻结语义。

## 7. 验收合同

- [ ] 原生选择：生产适配器只调用单目录 `openDirectory` 原生对话框；Renderer 请求不包含路径，取消后无持久化副作用；
- [ ] 授权正常：选择真实可写/只读空目录后，经 Main → Native Core 验证并持久化，UI 只显示公开路径、权限和 `AVAILABLE`；
- [ ] 重复与身份：重复选择同一身份幂等返回原 ID；相同 canonical root 的身份变化不覆盖原授权；
- [ ] 恢复：Renderer 重载后列表从 SQLite 恢复并重新验证，Workspace ID、显示路径和当前状态一致；
- [ ] 异常状态：缺失、权限拒绝、身份变化、Native Core/存储/选择不可用均显示准确影响与恢复动作，不显示成功或自动扩权；
- [ ] IPC 安全：非法来源、额外参数、伪造路径/权限/ID、未知 channel 和额外响应字段均被拒绝；
- [ ] 字段边界：Renderer、DOM、截图、错误和普通日志不包含 canonical root、路径身份、SQL、探针路径或用户文件内容；
- [ ] UI 状态：Dashboard/Create Workspace 的 Loading、Empty、Ready、Cancelled、Error、Refreshing/Degraded 状态可区分且由真实结果驱动；
- [ ] 可访问性：主流程可纯键盘完成，焦点可见且顺序正确，状态不只用颜色表达，错误与控件关联，自动扫描无适用严重违规；
- [ ] 桌面适配：1024 × 700、1440 × 900 和 200% 缩放下可完成选择并查看权限，内容不遮挡系统窗口控制区；
- [ ] E2E：开发态真实 Electron 窗口完成空状态 → 进入创建 → 选择 → 展示 → Renderer 重载 → 恢复，功能与 fixture 清理分别通过；
- [ ] 打包应用：Windows x64 与 macOS Apple Silicon 最终打包应用完成同一 Workspace 用户旅程、窗口截图和 Native Core health；
- [ ] 回归：M1-TU-01 路径攻击、M1-TU-02 Repository/权限/IPC、Milestone 0 health、迁移和全部工程检查继续通过；
- [ ] 跨平台：同一验收提交的 Windows x64 与 macOS Apple Silicon CI jobs 均完成工程检查、开发态 E2E、打包应用 E2E 和制品上传。

## 8. 隔离与干扰控制

- 数据库、user data directory、Workspace 根、截图和选择 fixture 均带 `M1-TU-03` 与随机标识；
- E2E fixture 只接受测试进程创建并验证存在的空目录，Main 消费一次后清除内存值，不允许 Renderer 设置或改变；
- 生产无测试环境变量时只能进入 Electron 原生目录选择器；
- 每个测试自行创建数据库和授权，不能读取开发者真实 Workspace 或其他任务应用数据；
- Renderer 重载复用当前测试窗口和专属数据库，不依赖前一个测试；
- 多 Workspace 重新验证使用独立结果，不因单项失败覆盖其他条目；
- Electron/Native Core 子进程必须等待退出；功能失败、截图失败和清理失败分别报告；
- Windows/macOS 的路径、原生窗口和打包应用证据分别记录，不能相互替代。

## 9. 证据计划

至少保存：

- Workspace 选择协议和 strict runtime Schema 测试摘要；
- 原生目录对话框调用、取消、重复选择、身份变化和安全错误的 Main/service 测试摘要；
- React 状态、键盘、焦点、错误和字段泄露测试摘要；
- 可访问性扫描结果；
- 开发态 Workspace 完整旅程、Renderer 重载、1024 × 700、1440 × 900 与 200% 缩放截图；
- Windows x64 与 macOS Apple Silicon 最终打包应用 Workspace 旅程和截图；
- `pnpm check`、`pnpm check:status`、`pnpm check:task-units` 和 `git diff --check`；
- 验收提交完整 SHA、GitHub Actions run/jobs 和 artifact。

组件渲染、单元测试、IPC 返回值、进程存活或旧的空列表 E2E 不能代替用户可见窗口、重载恢复、最终打包应用或另一平台结果。

## 10. 完成规则

仅当第 7 节全部适用条目通过、证据对应同一验收提交、P0/P1 为 0、临时目录/数据库/进程已清理、共享协议回归通过，且 `PROJECT_STATUS.md` 只记录本任务真实状态时，才可标记“完成”。

本任务完成只证明 Workspace 的原生选择、授权、展示、重新验证和 Renderer 重载恢复用户切片通过；不代表 Goal/Corporation 创建、应用重启后的 Corporation 恢复、Milestone 1、产品级 UI-AC-02 或发布候选完成。
