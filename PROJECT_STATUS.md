# AI Corporation Desktop 项目进度

| 属性           | 当前值                                         |
| -------------- | ---------------------------------------------- |
| 当前产品版本   | v0.1 MVP                                       |
| 当前阶段       | M2-TU-08 Plan Review 验收中                   |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan             |
| 当前任务单元   | M2-TU-08（进行中）                             |
| 总体状态       | 等待 GitHub 制品额度重新计算                   |
| 最近更新       | 2026-08-11                                     |
| 下一检查点     | 额度更新后重跑 CI，再进行用户人工验收          |

## 1. 当前结论

Milestone 0、Milestone 1 和 M2-TU-02 至 M2-TU-06 已完成。M2-TU-06 已交付 Planner 结构化生成与首个 Plan 草稿持久化：用户从当前 APPROVED Goal 进入 Planner，明确选择已验证 Provider/精确模型，只发送批准 Goal 与内置 catalogs；模型输出只提供语义内容和局部引用，Main 分配 Plan/Task 可信身份；首次 JSON/Schema 非法时最多修复一次，结果只能保存为 `DRAFT/PENDING`，不创建团队、不允许执行。

当前任务为 M2-TU-08。有限编辑、不可变新版本、无效版本重启恢复、批准后冻结、删除引用处理和验收标准编辑已经实现；Protocol、Storage、Desktop、开发态真实窗口和最终 Windows 包真实窗口均已通过。当前尚缺当前提交的 Windows/macOS CI 和用户对本次安装包的人工验收，因此任务仍为“进行中”，Milestone 2 不得关闭。

M2-TU-07 已完成：Planner 保存后自动进行不调用 Provider 的本地确定性验证；1–20 个 Task、DAG、引用、输入输出、逐 Task 验收、叶子输出、milestone、Goal 硬预算和权限描述均由固定规则检查；验证通过时在同一事务物化正式 Task/依赖，失败时只保存受限报告；普通二进制输出映射为 `FILE`；中文 UI 明确区分验证中、失败和通过，并继续标注未批准、未组队、不可执行。失败、取消或中断后保留原因并提供明确重试入口，恢复页面不会自动请求 Provider。完整工程检查、Windows 开发态窗口、Windows/macOS CI、最终包窗口矩阵和 artifacts 已通过，用户于 2026-08-10 明确确认人工验收通过，19 项验收断言全部关闭，P0/P1 为 0。

## 2. 已完成基线

- Milestone 0：跨平台工程、Native Core health、SQLite migration runner、CI 和最终包 E2E；
- Milestone 1：Workspace、Corporation CRUD、Goal Contract、最小时间线、暂停/继续和应用重启恢复；
- M2-TU-02：AI Corporation Desktop 应用自管 Provider Key Vault；
- M2-TU-03：Provider 连接测试、错误归一化和精确模型列表；
- M2-TU-04：dialect-neutral 非流式生成、Chat Completions Adapter、usage、超时/取消与 Responses 前向兼容门禁；
- M2-TU-05：Goal Engine 真实生成、每周期 5 轮有界澄清、一次 JSON 修复和 APPROVED Goal 前置能力。
- M2-TU-06：Planner 结构化生成、最多一次 JSON 修复、草稿持久化和正式 Renderer 真实 Provider 验证；
- M2-TU-07：Plan DAG/引用/输入输出/验收/预算/权限描述本地验证与正式 Task 原子物化。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [x] Goal Engine；
- [x] Planner 结构化输出与最多一次 JSON 修复；
- [x] DAG、输入输出和验收验证；
- [ ] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

Planner 结构化生成基础已随 M2-TU-06 关闭，Task Graph 语义验证与正式 Task materialization 已随 M2-TU-07 关闭。Plan Review 编辑/批准、Organization 和执行仍未完成，Milestone 2 不得关闭。

## 4. 最近完成的任务边界

M2-TU-07 只交付：

- 本地确定性 Plan validation、固定问题/warning、自动触发与 PENDING 恢复；
- 1–20 个 Task 的 DAG、引用、输入输出、逐 Task 验收、叶子输出和 milestone 引用验证；
- Goal 费用/时长/修订硬预算与 capability/tool/path/profile 权限描述验证；
- `FILE` 产物类型、正式 Task/Input/Output/Acceptance 合同与 `0011_plan_validation.sql`；
- VALID 时原子创建正式 Task/依赖，INVALID 时只保存受限报告；
- Planner UI 的本地验证中、失败、已验证与 warning 中文状态。

不包含任何 Provider 修复/重规划、Plan 编辑/批准/开始执行、真实 Policy 授权、Artifact/Run/Agent/Organization、预算账本、Evaluation、Responses Adapter 或 streaming。

## 5. 活跃阻塞与外部条件

当前 P0/P1 为 0，无实现阻塞。M2-TU-08 基线为 `a1956e83d9d96f07ffeefd21be00332a92ad8d8a`。提交 `2323fd1d55192a046a357561be7873028c7db97c` 的 Windows/macOS 功能检查和最终包真实窗口已连续两次通过，但两个 job 都因 GitHub Actions 制品存储额度已满而在最后上传步骤失败。已按用户决策删除 137 个旧制品并释放约 47.69 GiB，保留最近一次成功 CI 的两个制品；GitHub 提示额度需要 6–12 小时重新计算。额度更新后需再次运行 CI，之后仍需用户人工验收。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。

## 6. 当前验证摘要

- `pnpm check` 完整通过：Protocol 47、Provider 28、Storage 88、Desktop 126，Native Core 7、workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy 和 secret scan 均成功；`git diff --check` 通过；
- Windows 开发态 Electron 真实窗口 7/7 通过。Plan Review 直接覆盖有限编辑、验收标准增删、无效版本重载恢复、全新 Plan/Task 身份、批准冻结、历史只读、删除输出消费者阻断和零次额外 Provider 调用；编辑与批准旅程在 1024×700、200% 缩放下完成，批准结果在 1440×900 检查；
- 当前源码重新生成的 Windows 最终包真实窗口矩阵通过。Plan Review 覆盖编辑、INVALID 持久化、应用进程重启恢复、本地修复、批准、历史只读和零次 Provider 调用；Renderer 外部请求为 0；截图为 `release/m2-tu08-packaged-win32-x64-approved.png`；
- 当前 Windows NSIS 安装包为 `release/AI Corporation Desktop Setup 0.1.0.exe`，大小 99,793,413 bytes，SHA-256 `A3D99F99CA1263CC40ECC44CABAB523783D0DE9FB140C6190D17E1BC1DADAF08`；
- 候选提交 `2323fd1d55192a046a357561be7873028c7db97c` 的 GitHub Actions run `31411278428` 中，首次 Windows job `93529680515` / macOS job `93529680608` 和清理后的第二次 Windows job `93677134481` / macOS job `93677134419` 均通过工程检查、开发态 Electron、最终包构建和最终包真实窗口；四个 job 都只在 `Upload installer` 因制品存储额度尚未重新计算而失败。GitHub 当前只保留 artifact `9040916792` 和 `9040902573`；第 19 项和 M2-TU-08 仍不得关闭。

## 7. 下一步

等待 GitHub 在删除旧制品后的 6–12 小时额度重新计算；额度可用后重跑 run `31411278428` 的失败 job。CI 完整通过后交付本次 Windows 安装包供用户人工验收。第 19 项通过前不得关闭 M2-TU-08，Milestone 2 仍未完成。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
