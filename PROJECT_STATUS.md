# AI Corporation Desktop 项目进度

| 属性           | 当前值                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| 当前产品版本   | v0.1 MVP                                                                    |
| 当前阶段       | M2-TU-06 中文界面候选跨平台与真实 Provider 验收已通过，等待用户人工 UI 验收 |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan                                          |
| 当前任务单元   | M2-TU-06（进行中）                                                          |
| 总体状态       | 进行中                                                                      |
| 最近更新       | 2026-08-09                                                                  |
| 下一检查点     | 用户安装当前 Windows 包并完成人工 UI 验收                                   |

## 1. 当前结论

Milestone 0、Milestone 1 和 M2-TU-02 至 M2-TU-05 已完成。M2-TU-06 已实现 Planner 结构化生成与首个 Plan 草稿持久化：用户从当前 APPROVED Goal 进入 Planner，明确选择已验证 Provider/精确模型，只发送批准 Goal 与内置 catalogs；模型输出只提供语义内容和局部引用，Main 分配 Plan/Task 可信身份；首次 JSON/Schema 非法时最多修复一次，结果只能保存为 `DRAFT/PENDING`，不创建团队、不允许执行。

上一版候选的本地工程检查、Windows 开发态真实窗口、Windows 最终包完整 loopback 矩阵、正式 Renderer 真实 Provider smoke，以及 Windows/macOS 同提交 CI 均已通过。用户随后明确要求把软件自行定义的界面文字改为中文，同时保留 `API Key`、`URL`、Provider 名称、模型 ID 等外部标准称呼或外部数据。当前中文界面候选的完整 `pnpm check`、Windows 开发态 Electron E2E 7/7、Windows 最终包完整真实窗口矩阵、截图检查、Windows/macOS CI 和正式 Renderer 真实 Provider 复验均已通过；用户人工 UI 验收尚未取得。任务仍为“进行中”。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M2-TU-02：AI Corporation Desktop 应用自管 Provider Key Vault；
- M2-TU-03：Provider 连接测试、错误归一化和精确模型列表；
- M2-TU-04：dialect-neutral 非流式生成、Chat Completions Adapter、usage、超时/取消与 Responses 前向兼容门禁；
- M2-TU-05：Goal Engine 真实生成、每周期 5 轮有界澄清、一次 JSON 修复和 APPROVED Goal 前置能力。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [x] Goal Engine；
- [ ] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

Planner 项保持未完成，直到 M2-TU-06 的跨平台、最终包复合矩阵和人工 UI 验收全部关闭。Task Graph 语义验证、正式 Task materialization、Plan Review、Organization 和执行不属于 M2-TU-06。

## 4. 当前任务边界

M2-TU-06 只交付：

- Planner v1 strict protocol、typed IPC、操作状态与安全错误；
- 当前 APPROVED Goal、Corporation/Goal/Provider 版本和精确模型门禁；
- dialect-neutral `JSON_OBJECT` 非流式生成，以及带脱敏 Schema 路径/合法枚举提示的唯一一次修复；
- `0010_planner_generation.sql`、operation/model_call 审计、usage、取消/迟到/中断与原子 Plan DRAFT；
- Planner 入口、发送字段披露、生成/取消、尚未验证草案、能力与 suggested role 展示，并明确“尚未组队”和“不可执行”。

不包含 DAG/引用/输入输出闭合验证、Plan 编辑/批准/重规划、正式 Task、Organization、Agent 实例、Responses Adapter 或 streaming。

## 5. 活跃阻塞与外部条件

当前没有代码阻塞，P0/P1 为 0。当前中文界面候选只剩用户人工 UI 验收；该未完成项仍是任务门禁。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。

## 6. 当前验证摘要

- 当前中文候选 `pnpm check` 完整通过：Protocol 41、Provider 28、Storage 83、Desktop 108、Native Core 7、workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy 和 secret scan 均成功；
- Windows 开发态 Electron E2E 7/7 通过。Planner 直接覆盖成功、一次修复、修复再次失败且无 Plan、2 秒内取消、Corporation 版本冲突、Renderer 重载稳定 Plan ID、进程重启转 `INTERRUPTED` 且不重发；既有 Workspace、Provider、Key Vault 和 Goal 回归同时通过；
- Windows 最终包真实窗口通过 Native Core、Workspace、Goal、Goal Engine、Provider/Key Vault 与外部请求隔离；Planner 覆盖成功生成与 `DRAFT/PENDING`、重载稳定 Plan ID、唯一一次修复成功、再次非法安全失败且无 Plan、2 秒内取消、Corporation 版本冲突拒绝落库、进程重启转 `INTERRUPTED` 且不重发；
- 正式 Windows 最终包从 Renderer 使用应用 Key Vault 中已保存的 `deepseek-v4-flash` 完成非敏感 Planner smoke：`PLAN_SAVED`、Plan v1、`PENDING`、1 个 Task，usage 为 input 816、output 2,640、cached input 768、reasoning 2,102、cost `UNKNOWN`，完成时间 `2026-08-09T10:53:13.012Z`；重载恢复同一 Plan ID，SQLite/WAL/SHM 与进程诊断未发现符合真实 Key 长度的明文模式；
- 真实 Provider 首次暴露的私有枚举输出没有被放宽接受；唯一修复请求改为提供安全 Schema 路径和权威合法值，回归测试证明仍只接受 `GOAL_CONTRACT | TASK_OUTPUT` 与 `ON_SUCCESS`；
- 当前中文候选 Windows NSIS 安装包为 `release/AI Corporation Desktop Setup 0.1.0.exe`，大小 99,777,938 bytes，SHA-256 `DFDD937AFB7DEA9E3E7F618DDC3912861C94DA4C30910391B550D6421268EA21`；`git diff --check` 通过；
- 中文候选提交 `14ad8d0b8bd226f6451804541389482414e8b555` 的 GitHub Actions run `31314821064` 通过：Windows job `93248262816`（4m55s）、macOS job `93248262763`（3m43s）均完成工程检查、开发态 Electron、最终包构建、最终包复合矩阵和上传；Windows artifact `9038473228`，digest `sha256:cbd88072e11e9ac9b6edd8f098a53551aaf492ec55a41adee35aea9db286b216`；macOS artifact `9038459212`，digest `sha256:e2f41ef96add7751ae7001428433e030598aeed8f717961043e23af18d090462`；
- 当前中文 Windows 最终包经用户明确授权，从正式 Renderer 使用应用 Key Vault 中已保存的真实 Provider 完成非敏感 Planner 复验：`PLAN_SAVED`、Plan v1、`PENDING`、1 个 Task，usage 为 input 816、output 1,739、cached input 0、reasoning 1,320、cost `UNKNOWN`，完成时间 `2026-08-09T13:29:32.784Z`；重载恢复同一 Plan ID，SQLite/WAL/SHM 与进程诊断未发现明文 Key 模式；
- 最终候选提交 `0c0f1ee18581be2a2fca234540917091f2c5e7f9` 的 GitHub Actions run `31310400204` 通过：Windows job `93237236122`（5m0s）、macOS job `93237236153`（3m46s）均完成工程检查、开发态 Electron、最终包构建、最终包复合矩阵和上传；Windows artifact `9037261510`，digest `sha256:65f8d6ea4d62500b5dcc249a8a9d17455972739f61a3905f6dd941f16b632b4d`；macOS artifact `9037247450`，digest `sha256:00eec8f2f5186bf2f014a0d9b17b4f83c576903daf79c467a48dccf74e32885e`；
- 当前提交 Windows artifact 已下载到 `release/ci-0c0f1ee-windows/AI Corporation Desktop Setup 0.1.0.exe`，大小 99,776,910 bytes，SHA-256 `A760C753A684D277A70EFA3874308A5047EDBA923555AC629588863B182A4CDA`。

当前中文界面候选新增证据：Desktop 单元测试 108/108 通过；Windows 开发态 Electron E2E 7/7 通过；Windows 最终包真实窗口完整覆盖启动、Workspace、Goal、Goal Engine、Planner、暂停/恢复、Provider Key Vault、连接/生成异常矩阵和外部请求隔离；自动生成的 1024×700、1440×900、200% 和最终包截图已检查，200% 下中文侧栏首次发现截断后已修复并复验；当前提交 Windows/macOS CI 和真实 Provider 复验全部通过。尚未取得用户人工 UI 验收；该未完成项保持为任务门禁，不计为通过。CI 仅有 GitHub Actions 使用 Node.js 20 action runtime 的弃用提醒，无失败或产品 P0/P1。

## 7. 下一步

由用户安装当前 Windows 包，验收从已批准目标进入规划、明确选择 Provider/模型与查看披露、生成/取消、只读计划内容、尚未验证/尚未组队提示，以及失败/取消/中断状态、中文文字和键盘/缩放可用性。人工验收通过后，才把 M2-TU-06 和 Milestone 2 的 Planner 项标记完成；随后才建立 DAG/Plan Review 的下一个任务合同。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
