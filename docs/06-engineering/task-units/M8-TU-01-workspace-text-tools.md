# M8-TU-01 工作区文本工具真实闭环

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M8-TU-01 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 8：单员工真实工作区文本任务 |
| 主要结果 | 用户为一次 Pi 员工任务选择已授权工作区，员工自动查看目录、读取文本并创建或修改普通文本文件，用户可以核对真实文件和完整工具过程。 |
| 基线提交 | `4a9758cce0048719a6bb470fe29b1bea17b771ca` |

## 1. 需求与设计引用

- 用户确认采用方案 A：每次任务选择工作区；普通文本读取、创建和修改自动执行并显示差异；删除、改名、二进制、敏感文件、越界路径和并发覆盖不自动执行；
- [产品重启说明](../../01-product/Product-Reboot.md)；
- [MVP Plan Milestone 8](../MVP-Plan.md#15-milestone-8单员工真实工作区文本任务)；
- [Workspace Protocol](../../04-protocols/Workspace-Protocol.md)、[Tool Runtime](../../05-infrastructure/Tool-Runtime.md)、[Policy Engine](../../05-infrastructure/Policy-Engine.md)、[Artifact System](../../03-core/Artifact-System.md)和[Threat Model](../Threat-Model.md)；
- [统一验收标准](../Acceptance-Standard.md)和[UI 专项验收](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M7-TU-01 和 Milestone 7 已完成；
- Pi 员工、流式模型、工具事件、取消、失败、恢复和用户验收闭环可复用；
- Workspace 已通过用户原生目录选择、Native Core canonicalization、身份和读写权限验证；
- 本机真实 DeepSeek Provider 继续只保存在应用本地，不进入 Git、命令、环境变量、日志或截图；
- Windows 在本机验证，macOS 由 CI 补充；自动模型测试使用隔离临时工作区和受控 Provider。

## 3. 包含范围

- 在每次任务开始前选择一名员工和一个已保存、当前 `AVAILABLE + READ_WRITE` 的 Workspace；
- Pi Task 保存 `workspaceId`，旧任务允许没有 Workspace，但不能被误当成本任务的新写入任务；
- `workspace.list`：列举任务工作区内普通文件和目录，限制深度、条数和输出大小，忽略 `.git` 内部、依赖缓存和敏感文件；
- `workspace.read_text`：读取不超过 1 MiB 的合法 UTF-8 普通文件，返回相对路径、内容、字节数和 SHA-256；
- `workspace.write_text`：创建或修改不超过 1 MiB 的普通 UTF-8 文本；创建要求目标仍不存在，修改要求携带最近读取得到的基线 SHA-256；
- 每次文件操作前由 Native Core 使用可信 Workspace root 重新 canonicalize；Renderer 和模型只使用相对路径，不获得可信绝对路径或路径身份；
- 写入使用同目录临时文件和原子替换；写前检查基线哈希，冲突时不覆盖；
- 普通文本创建和基线未变化的修改使用本次任务级授权自动执行，不逐次询问；
- 写入过程保存工具调用 ID、相对路径、基线哈希、目标哈希、状态和可读 diff；用户可以在现有完整过程区域查看；
- `.git` 内部、`.env`、`.env.*`、常见私钥/凭据文件、二进制、超限文件、越界路径、链接逃逸、删除、改名和命令固定拒绝；
- 取消后不开始新的工具调用；已开始的写入只允许原子地“未发生”或“完整发生”，迟到结果不能把任务标成成功；
- 应用重启不自动重放模型或写入；未完成调用根据目标哈希恢复为已提交、未提交或未知，并向用户显示真实状态；
- 员工交付后仍等待用户验收，用户确认后任务才完成。

## 4. 非范围

- 删除、改名、移动、复制、目录创建和任意二进制写入；
- 任意命令、shell、代码检查、依赖安装、Git commit/push 或发布；
- 图片、视频、音频、Office、PDF、压缩包和其他专用内容工具；
- 附件上传、多模态输入、多员工、自动组队和员工间委派；
- 工作区外文件、应用自身目录、Key Vault、Provider Key 或 OS 凭据；
- 旧 Goal/Plan/M3 Agent Runtime 的恢复、迁移或删除；
- 通用 Artifact 浏览器和复杂版本管理 UI。

## 5. 简化与后续增强

- 本任务认领 `DE-012` 的首个真实工作工具闭环；只有本任务全部验收通过后才能把 `DE-012` 标记“已补齐”；
- `DE-011` 多员工协作和 `DE-013` 附件/多模态仍待安排；
- `DE-014` 记录删除、改名、命令、代码检查和各种专用内容工具仍未提供。

## 6. 依赖与接口

- `PiTaskStartRequest` 新增必填 `workspaceId`；持久化的 `PiTask.workspaceId` 为可选，以兼容 M7 已保存任务；
- Workspace 文本工具使用独立版本化 Schema，不复用模型供应商 DTO；
- Electron Main 根据 `workspaceId` 读取可信 root；Renderer、模型和 Pi Tool input 不得提交绝对 root；
- Native Core 新增目录列举、文本读取和文本原子写入 RPC；路径校验、链接逃逸、UTF-8、大小、基线哈希和原子替换在原生边界执行；
- Pi 工具调用只能使用当前任务绑定的 Workspace，不能从模型输入切换 Workspace；
- 工具结果经过大小限制后进入 Pi 上下文；完整可见事件保存时不得包含可信绝对路径、认证秘密或敏感文件内容；
- 写入调用记录先于副作用落库，工具调用 ID 唯一；恢复不重放写入。

## 7. 交付物与所有权

专属修改区：Workspace 文本工具协议、Native Core 文件 RPC、Pi Workspace Tool Service、写入调用记录、员工任务工作区 UI、对应迁移和专项测试。

共享冲突区：Workspace Protocol、Pi Task Protocol、Preload API、Desktop Main 注册、SQLite migration、Tool/Policy/Artifact/Threat Model、MVP Plan、设计系统、安装包和 `PROJECT_STATUS.md`。本任务串行修改这些文件。

## 8. 验收合同

- [x] 01 用户开始任务前必须明确选择一名员工和一个已授权、当前可写的工作区；任务重载后仍显示同一工作区；
- [x] 02 员工通过 `workspace.list` 看到受限目录结果，`.git` 内部、依赖缓存和敏感文件不进入结果；
- [x] 03 员工通过 `workspace.read_text` 读取合法 UTF-8 文本并获得真实字节数和 SHA-256；
- [x] 04 员工通过 `workspace.write_text` 自动创建一个新文本文件，真实文件内容与工具结果一致，无逐次审批；
- [x] 05 员工读取已有文本后可按基线哈希自动修改，UI 显示相对路径、修改前后哈希和可读差异；
- [x] 06 目标已存在时不能用“创建”覆盖；基线哈希变化时不能用“修改”覆盖，文件保持外部新内容；
- [x] 07 `..`、绝对路径、盘符/UNC、大小写混淆和越界 symlink/junction 全部被 Native Core 拒绝且错误不泄露可信绝对路径；
- [x] 08 `.git` 内部、`.env`、`.env.*`、常见私钥/凭据、二进制和超过 1 MiB 的文件不会被读取、发送给模型或写入；
- [x] 09 Renderer 和模型只接触 Workspace ID、展示路径和相对路径，不获得 canonical root 或路径身份；
- [x] 10 写入使用同目录临时文件和原子替换，失败不留下部分目标内容或可预测临时文件；
- [x] 11 每个写入调用先记录唯一工具调用 ID、目标相对路径、基线哈希和目标哈希；同一调用不会重复产生副作用；
- [x] 12 用户取消后不开始新调用，迟到结果不把任务标成成功；应用重启不自动重放模型或文件写入；
- [x] 13 未完成写入在恢复时准确显示已提交、未提交或未知；未知状态不得显示成功或自动重试；
- [x] 14 模型输入、原始输出、工具输入/结果/错误、耗时和写入差异实时可见，API Key 和可信绝对路径不可见；
- [x] 15 员工完成真实文件任务并自查后等待用户验收，只有用户确认后任务完成；退回修改可以继续使用同一工作区且保留旧过程；
- [x] 16 Protocol、Rust、Storage、Main/Preload、组件和攻击测试覆盖正常、冲突、越界、敏感文件、二进制、取消、失败和恢复；
- [x] 17 Windows 开发态真实窗口在隔离临时工作区完成创建、修改、冲突、取消和重启旅程，并检查 1024×700、1440×900、200% 布局宽度与截图；
- [ ] 18 当前提交 Windows/macOS CI、Secret scan、最终包真实窗口和安装包 artifact 通过；
- [x] 19 本机正式 Renderer 使用已保存真实 DeepSeek Provider 完成一个不含秘密的真实文本文件任务；
- [ ] 20 用户使用当前 Windows 安装包核对真实工作区文件和完整过程并确认人工验收后，本任务和 Milestone 8 才能关闭。

## 9. 隔离与干扰控制

- 自动测试使用 `M8-TU-01-<random>` 临时 userData、SQLite、Workspace、目录、端口、员工和任务；
- 每个测试只在自己的临时工作区写入，断言目标、临时文件和数据库记录后完整清理；
- 路径攻击使用测试自己创建的外部目录和链接，不接触用户真实文件；
- 自动模型测试使用假 Key 和本地受控 Provider；真实 Provider 只在正式应用本地专项测试中使用；
- 工作区内容、可信绝对路径和真实 Key 不进入 Git、普通日志、错误、截图或 CI artifact；
- M8 migration 使用下一未占用编号，开始实施前再次核对。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`pnpm test:e2e`、`git diff --check`；
- Rust 真实文件系统测试：列举、读取、创建、修改、原子性、哈希冲突、大小、UTF-8、敏感文件、路径越界和链接攻击；
- Protocol strict Schema、SQLite migration、写入记录幂等和恢复矩阵测试；
- Pi 受控 Provider 工具循环：list → read → write → final，取消、失败、冲突和迟到事件；
- 开发态与最终包的 1024×700、1440×900、200% 布局断言和人工截图检查；
- 本机正式应用使用已保存 DeepSeek Provider 的脱敏真实文件任务证据；
- 当前提交 Windows/macOS GitHub Actions run/job、安装包 artifact、大小和哈希；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

方案 A 已由用户明确确认，任务不存在待决策项，可以开始实施。只有 20 项验收断言全部具有当前提交的直接证据、P0/P1 为 0、必检项没有遗漏、文档与实现一致，并且用户完成 Windows 安装包人工验收，M8-TU-01 和 Milestone 8 才能标记“完成”。模型声称写入、工具返回成功、文件存在、构建成功或进程存活都不能单独证明任务完成。
