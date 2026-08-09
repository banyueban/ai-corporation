# AI Corporation Desktop 项目进度

| 属性           | 当前值                                         |
| -------------- | ---------------------------------------------- |
| 当前产品版本   | v0.1 MVP                                       |
| 当前阶段       | M2-TU-07 本地计划验证与正式 Task 物化实施中    |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan             |
| 当前任务单元   | M2-TU-07（进行中）                             |
| 总体状态       | 进行中                                         |
| 最近更新       | 2026-08-10                                     |
| 下一检查点     | 生成修复后的 Windows 候选并完成人工 UI 复验    |

## 1. 当前结论

Milestone 0、Milestone 1 和 M2-TU-02 至 M2-TU-06 已完成。M2-TU-06 已交付 Planner 结构化生成与首个 Plan 草稿持久化：用户从当前 APPROVED Goal 进入 Planner，明确选择已验证 Provider/精确模型，只发送批准 Goal 与内置 catalogs；模型输出只提供语义内容和局部引用，Main 分配 Plan/Task 可信身份；首次 JSON/Schema 非法时最多修复一次，结果只能保存为 `DRAFT/PENDING`，不创建团队、不允许执行。

当前中文界面候选的完整 `pnpm check`、Windows 开发态 Electron E2E 7/7、Windows 最终包完整真实窗口矩阵、截图检查、Windows/macOS CI 和正式 Renderer 真实 Provider 复验均已通过。用户于 2026-08-09 确认人工 UI 验收通过，M2-TU-06 的 19 项验收断言全部关闭，P0/P1 为 0。该结论只关闭 M2-TU-06 和 Planner 结构化输出，不代表 DAG 验证、Plan Review、Organization、执行或整个 Milestone 2 完成。

M2-TU-07 已形成实施候选：Planner 保存后自动进行不调用 Provider 的本地确定性验证；1–20 个 Task、DAG、引用、输入输出、逐 Task 验收、叶子输出、milestone、Goal 硬预算和权限描述均由固定规则检查；验证通过时在同一事务物化正式 Task/依赖，失败时只保存受限报告；普通二进制输出映射为 `FILE`；中文 UI 明确区分验证中、失败和通过，并继续标注未批准、未组队、不可执行。该任务尚未完成跨平台 CI、最新 Windows 包和用户人工验收，DAG 项继续保持未完成。

用户人工复验发现：恢复一个生成失败的 Planner 操作时，页面保留失败原因却隐藏了模型选择和明确重试入口，导致用户无法从软件内继续。当前源码候选已重新显示模型服务商/模型选择和“重新生成并验证计划”，恢复页面不会自动调用 Provider；开发态真实窗口已覆盖失败恢复、点击前零新增请求及明确重试成功。修复后的最终 Windows 包和用户人工复验尚未完成，因此该问题仍作为当前 P1，M2-TU-07 不得完成。

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
- [x] Planner 结构化输出与最多一次 JSON 修复；
- [ ] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

Planner 结构化生成基础已随 M2-TU-06 关闭。Task Graph 语义验证、正式 Task materialization、Plan Review、Organization 和执行仍未完成，Milestone 2 不得关闭。

## 4. 当前任务边界

M2-TU-07 只交付：

- 本地确定性 Plan validation、固定问题/warning、自动触发与 PENDING 恢复；
- 1–20 个 Task 的 DAG、引用、输入输出、逐 Task 验收、叶子输出和 milestone 引用验证；
- Goal 费用/时长/修订硬预算与 capability/tool/path/profile 权限描述验证；
- `FILE` 产物类型、正式 Task/Input/Output/Acceptance 合同与 `0011_plan_validation.sql`；
- VALID 时原子创建正式 Task/依赖，INVALID 时只保存受限报告；
- Planner UI 的本地验证中、失败、已验证与 warning 中文状态。

不包含任何 Provider 修复/重规划、Plan 编辑/批准/开始执行、真实 Policy 授权、Artifact/Run/Agent/Organization、预算账本、Evaluation、Responses Adapter 或 streaming。

## 5. 活跃阻塞与外部条件

当前 P0 为 0，P1 为 1：失败 Planner 恢复入口的源码修复与开发态窗口验收已通过，但修复后的最终 Windows 包及用户人工复验未完成。提交 `faceeb24d860371c157d190e77b32ca8cd34a833` 的 Windows/macOS CI 已完成当时源码的工程检查、开发态窗口、最终包构建、最终包窗口矩阵和 artifact 上传，但该候选包含上述问题，不能再作为最终候选。本机 `electron-builder` 在启动阶段无日志卡住；换新输出目录、绕过 pnpm 和目录包模式仍可复现，超时后已清理确认属于本仓库的残留构建进程，未关闭用户已安装并正在运行的软件。修复提交需要重新通过 Windows/macOS CI、最终包矩阵、artifact 下载和用户人工 UI 复验。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。

## 6. 当前验证摘要

- Planner 失败恢复修复的完整 `pnpm check` 通过：Protocol 44、Provider 28、Storage 85、Desktop 120，Native Core 7、workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy、secret scan 均成功；Windows 开发态 Electron 真实窗口 7/7 通过，明确断言恢复失败页不会自动新增 Provider 请求、必须重新选择模型、明确点击重试后保存 `VALID` Plan；最终包测试已加入同一断言，但修复后的最终包尚未生成和执行；
- M2-TU-07 当前实现的 `pnpm check` 完整通过：Protocol 44、Provider 28、Storage 85、Desktop 120，Native Core 7、workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy、secret scan 和 `git diff --check` 均成功；状态提示修复后受影响的 Goal/Planner Electron E2E 3/3 通过；
- 本地验证器专项 11/11 通过，覆盖 1/20/21 Task、合法与错误图、milestone、验收/叶子、四种媒体映射、输入输出闭合、费用/最长路径时长/修订预算、目录和路径攻击、单次运行 warning 与稳定 draft hash；Protocol strict 测试覆盖正式 Task/report 的额外字段、身份、状态、code、path、数量和去重；Storage 85/85 覆盖 `0011`、VALID 原子物化/幂等与 INVALID 不创建 Task；
- Windows 开发态真实窗口完整矩阵曾 7/7 通过；状态提示修复后 Planner 相关 3/3 再次通过，并明确断言验证通过时不再出现旧“等待验证”提示、不合格计划只调用 Provider 一次、显示固定中文问题、刷新恢复 `DRAFT/INVALID`；
- 较早 Windows M2-TU-07 候选的最终包真实窗口矩阵通过并生成截图，但该截图发现蓝色旧等待提示与绿色验证通过卡片冲突；源码与开发态 E2E 已修复并通过，最新源码的 Windows 包因本机 builder 卡住尚未生成，故不得把较早包算作最终候选通过；
- 最新候选提交 `faceeb24d860371c157d190e77b32ca8cd34a833` 的 GitHub Actions run `31320916354` 通过：macOS job `93263647751`（3m45s）和 Windows job `93263647770`（5m32s）均完成工程检查、开发态 Electron、最终包构建、最终包真实窗口矩阵和上传；Windows artifact `9040204322`，大小 249,512,906 bytes，digest `sha256:86ecae522e24e46f6c5bf69bca1fb053a17fb960ba6aa2db04ca62ddc0a3fa27`；macOS artifact `9040180967`，大小 490,877,476 bytes，digest `sha256:5cf1da01fbb6545d65783e7c40470b3e78f64a671a0c861c1ea074017e54c749`；只有 Node.js 20 action runtime 弃用提醒，无失败或产品 P0/P1；

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

当前中文界面候选新增证据：Desktop 单元测试 108/108 通过；Windows 开发态 Electron E2E 7/7 通过；Windows 最终包真实窗口完整覆盖启动、Workspace、Goal、Goal Engine、Planner、暂停/恢复、Provider Key Vault、连接/生成异常矩阵和外部请求隔离；自动生成的 1024×700、1440×900、200% 和最终包截图已检查，200% 下中文侧栏首次发现截断后已修复并复验；当前提交 Windows/macOS CI 和真实 Provider 复验全部通过；用户于 2026-08-09 确认人工 UI 验收通过。CI 仅有 GitHub Actions 使用 Node.js 20 action runtime 的弃用提醒，无失败或产品 P0/P1。

## 7. 下一步

提交 Planner 失败恢复修复，等待同一提交的 Windows/macOS CI 和最终包真实窗口矩阵通过，下载新的 Windows artifact 后请求用户人工复验；人工复验通过前当前 P1、M2-TU-07、DAG 项和 Milestone 2 均保持未完成。Plan Review 编辑/批准仍属于后续任务。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
