# M1-TU-01 Workspace 选择与路径边界

| 属性           | 内容                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| 任务单元 ID    | M1-TU-01                                                                            |
| 状态           | 就绪                                                                                |
| 所属 Milestone | Milestone 1：本地项目骨架                                                           |
| 主要结果       | 用户可选择一个本地目录作为 Workspace，应用保存授权元数据，Rust 拒绝所有工作区外路径 |
| 基线提交       | `8217b75`                                                                           |
| 计划平台       | Windows x64、macOS Apple Silicon                                                    |

## 1. 需求与设计引用

- 用户要求：Milestone 0 经验必须进入下一个任务，并以边界清晰、可独立验收的任务单元执行；
- [MVP 开发计划：Milestone 1](../MVP-Plan.md)；
- [PRD FR-001 工作区管理](../../01-product/PRD.md)；
- [总体技术设计](../../02-architecture/Technical-Design.md)；
- [数据模型](../../05-infrastructure/Data-Model.md)；
- [SQLite Schema](../../05-infrastructure/SQLite-Schema.md)；
- [Electron、TypeScript 与 Rust 工程架构](../../05-infrastructure/Desktop-and-Rust-Architecture.md)；
- [UI Flow 02](../../07-ui/Core-User-Flows.md)与 [UI-03 线框](../../07-ui/Wireframes.md)；
- [页面与交互状态矩阵](../../07-ui/Screen-State-Matrix.md)；
- [安全威胁模型](../Threat-Model.md)。

## 2. 前置条件

- GitHub 仓库 `banyueban/ai-corporation`、`main` 分支和推送权限已确认；
- 基线提交的 Windows/macOS CI 均通过；
- Electron Renderer → Preload → Main → Rust typed health 链路已存在；
- SQLite migration runner 已存在；
- 应用自身 Chromium sandbox、context isolation 和 Node integration 安全设置保持不变；
- 实施前重新检查工作区是否存在用户或其他任务的未提交改动。

## 3. 包含范围

- 原生目录选择入口及取消行为；
- Workspace DTO、运行时 Schema 和 typed IPC/RPC 合同；
- canonical path 解析和平台路径标识；
- Workspace 授权根目录及权限状态的 SQLite 持久化；
- Rust 对工作区内/外路径的边界判定；
- 工作区不存在、权限变化和只读状态的结构化错误；
- 最小 UI 状态：未选择、选择中、已授权、取消、无权限、路径失效；
- Windows/macOS 对应的单元、集成、安全和 Electron E2E。

## 4. 非范围

- Corporation CRUD；
- Goal Contract 录入或 Mock 生成；
- Domain Event 时间线；
- Corporation 暂停/恢复状态机；
- `workspace.list`、`read_text`、`search`、写入或 Change Set 的完整实现；
- Provider、模型调用、Tool Runtime 和 Policy Engine；
- 最近工作区列表、收藏、云同步或多 Workspace 并发；
- 安装包签名与 macOS notarization。

发现上述需求时，新建后续任务单元，不扩张本单元。

## 5. 依赖与接口

- Renderer 只获得脱敏 Workspace DTO，不获得任意 Node 文件系统能力；
- Preload 只暴露白名单方法，输入输出经过运行时 Schema；
- Electron Main 负责原生目录选择和 IPC 编排；
- Rust 负责 canonical path 与边界判定，不承载 Corporation 业务；
- SQLite 保存授权元数据，不把原始数据库行暴露给 Renderer；
- 路径错误使用结构化错误码，不依赖平台错误字符串；
- 后续 Corporation 单元只依赖本单元冻结的 Workspace ID、授权状态和 canonical root。

## 6. 交付物与所有权

专属修改区：

- Workspace 领域类型、Repository 和相关测试；
- Workspace IPC/RPC Schema 与兼容测试；
- Rust workspace path boundary 模块与安全测试；
- Workspace 选择 UI 组件及状态测试；
- 本任务专属 E2E fixture。

共享冲突区：

- SQLite migration 编号；
- Preload 公共 API；
- Rust RPC envelope；
- Electron Main 启动和窗口配置；
- `PROJECT_STATUS.md`；
- CI workflow。

共享冲突区由本任务串行修改；若其他任务需要同时修改，必须先冻结接口或暂停其中一个任务。

## 7. 验收合同

- [ ] 正常：用户选择可读写目录后，UI 显示 canonical Workspace 信息和真实权限；
- [ ] 取消：用户取消选择时不创建数据库记录，不改变已有 Workspace；
- [ ] 持久化：应用或 Renderer 重载后可恢复同一 Workspace 授权元数据；
- [ ] 边界：工作区内规范化路径被允许；
- [ ] 越界：`..`、绝对外部路径、盘符/卷越界被 Rust 拒绝；
- [ ] 链接：指向工作区外的符号链接或 Windows 重解析点被拒绝；
- [ ] 权限：目录消失、权限被撤销或只读时返回结构化状态且 UI 不宣称可写；
- [ ] IPC：非白名单调用和无效 Schema 被拒绝；
- [ ] 安全：Renderer 仍无 Node、任意文件和原始绝对路径泄漏能力；
- [ ] 隔离：测试不依赖执行顺序、用户真实目录或其他任务数据库；
- [ ] 跨平台：Windows x64 与 macOS Apple Silicon 的适用路径边界和 Electron E2E 均通过；
- [ ] 回归：Milestone 0 health、Electron 安全检查和打包产物启动测试继续通过。

## 8. 隔离与干扰控制

- 每个测试创建带 `M1-TU-01` 前缀和随机后缀的临时根目录；
- 工作区内、工作区外和链接目标使用同一 fixture 显式构造；
- SQLite 使用任务专属临时数据库，不读取开发者现有应用数据；
- E2E 使用独立 Electron user data directory；
- 端口动态分配，不复用固定调试端口；
- 子进程退出后等待完成，再清理目录；功能失败与清理失败分别报告；
- Windows 与 macOS 证据分别记录；
- 测试结束检查无残留进程、数据库锁和临时权限更改。

## 9. 证据计划

- `pnpm check`：工程回归；
- Workspace Schema/Repository/路径边界单元与集成测试报告；
- Electron E2E：目录选择取消、授权成功、重载恢复和权限失败；
- 安全攻击集：路径穿越、绝对外部路径、盘符/卷越界、符号链接/重解析点；
- Windows/macOS CI job 及对应 commit；
- 必要的 UI 截图，显示真实权限和错误状态；
- 最终打包应用回归 E2E。

## 10. 完成规则

仅当第 7 节全部适用条目通过、证据对应同一验收提交、P0/P1 为 0、共享接口回归通过且 `PROJECT_STATUS.md` 只更新本任务真实状态时，才可将本任务标记为“完成”。

本任务完成不代表 Corporation CRUD、Milestone 1 或任何后续任务完成。
