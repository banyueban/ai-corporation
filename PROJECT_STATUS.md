# AI Corporation Desktop 项目进度

| 属性           | 当前值                             |
| -------------- | ---------------------------------- |
| 当前产品版本   | v0.1 MVP                           |
| 当前阶段       | Milestone 2 最终验收准备           |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元   | M2-TU-08（完成）                   |
| 总体状态       | M2-TU-08 已完成，Milestone 2 未关闭 |
| 最近更新       | 2026-08-11                         |
| 下一检查点     | 建立并执行 Milestone 2 最终验收任务合同 |

## 1. 当前结论

Milestone 0、Milestone 1 和 M2-TU-02 至 M2-TU-06 已完成。M2-TU-06 已交付 Planner 结构化生成与首个 Plan 草稿持久化：用户从当前 APPROVED Goal 进入 Planner，明确选择已验证 Provider/精确模型，只发送批准 Goal 与内置 catalogs；模型输出只提供语义内容和局部引用，Main 分配 Plan/Task 可信身份；首次 JSON/Schema 非法时最多修复一次，结果只能保存为 `DRAFT/PENDING`，不创建团队、不允许执行。

M2-TU-08 已完成。有限编辑、不可变新版本、无效版本重启恢复、批准后冻结、删除引用处理和验收标准编辑已经实现；Protocol、Storage、Desktop、开发态真实窗口、Windows/macOS 最终包真实窗口、跨平台制品上传和用户人工验收均已通过。该结论只关闭 M2-TU-08；Milestone 2 仍需单独的里程碑级最终验收，不得提前关闭。

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
- M2-TU-08：Plan Review 有限编辑、不可变版本、无效恢复、批准冻结和历史只读。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [x] Goal Engine；
- [x] Planner 结构化输出与最多一次 JSON 修复；
- [x] DAG、输入输出和验收验证；
- [x] Plan Review 编辑与批准 UI；
- [ ] Windows/macOS Milestone 级真实窗口与最终包验收。

Planner 结构化生成基础已随 M2-TU-06 关闭，Task Graph 语义验证与正式 Task 物化已随 M2-TU-07 关闭，Plan Review 编辑与批准已随 M2-TU-08 关闭。Organization 和执行属于后续 Milestone；当前仅剩 Milestone 2 级真实窗口与最终包验收，Milestone 2 不得提前关闭。

## 4. 最近完成的任务边界

M2-TU-08 只交付：

- 当前 Plan 与历史版本读取，以及标题、目标、说明、优先级、验收标准和依赖的有限编辑；
- 保存时创建不可变新 Plan/Task 版本并自动执行本地验证；
- 无效版本持久化、重载与应用重启恢复；
- 仅允许有效版本批准，批准后冻结，历史版本只读；
- 中文 Plan Review 的编辑、验证、错误、历史和批准状态。

不包含新增 Task、Provider 重规划、Organization、Agent、Scheduler、执行、Artifact、预算账本、真实权限授予、Responses Adapter 或 streaming。

## 5. 活跃阻塞与外部条件

当前 P0/P1 为 0，无实现阻塞。M2-TU-08 基线为 `a1956e83d9d96f07ffeefd21be00332a92ad8d8a`。`banyueban/ai-corporation` 已确认为公开仓库；CI 上传范围仅包含安装包、blockmap 和验收截图。Windows 与 macOS 制品均已成功上传，不清理其他仓库制品。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。

## 6. 当前验证摘要

- `pnpm check` 完整通过：Protocol 47、Provider 28、Storage 88、Desktop 126，Native Core 7、workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy 和 secret scan 均成功；`git diff --check` 通过；
- Windows 开发态 Electron 真实窗口 7/7 通过。Plan Review 直接覆盖有限编辑、验收标准增删、无效版本重载恢复、全新 Plan/Task 身份、批准冻结、历史只读、删除输出消费者阻断和零次额外 Provider 调用；编辑与批准旅程在 1024×700、200% 缩放下完成，批准结果在 1440×900 检查；
- 当前源码重新生成的 Windows 最终包真实窗口矩阵通过。Plan Review 覆盖编辑、INVALID 持久化、应用进程重启恢复、本地修复、批准、历史只读和零次 Provider 调用；Renderer 外部请求为 0；截图为 `release/m2-tu08-packaged-win32-x64-approved.png`；
- 当前 Windows NSIS 安装包为 `release/AI Corporation Desktop Setup 0.1.0.exe`，大小 99,793,413 bytes，SHA-256 `A3D99F99CA1263CC40ECC44CABAB523783D0DE9FB140C6190D17E1BC1DADAF08`；
- 提交 `decf852b5c67460175b1c4c0c0bd0ed4f91e6f60` 的 GitHub Actions run `31504130151` 最终成功：Windows job `93825349596` 与 macOS job `93825350359` 均通过工程检查、开发态 Electron、最终包构建、最终包真实窗口和制品上传；
- Windows artifact `9106938748`（`ai-corporation-windows-x64`）大小 101,812,119 bytes；macOS artifact `9106423939`（`ai-corporation-macos-arm64`）大小 122,490,544 bytes；
- 用户于 2026-08-11 按安装包人工验收清单完成有限编辑、无效版本恢复、再次验证、批准冻结和历史只读检查，并明确确认验收通过；该结论只关闭人工验收子项，不替代跨平台 CI 与制品上传。

## 7. 下一步

为 Milestone 2 级 Windows/macOS 真实窗口与最终包验收建立边界清晰的任务合同；合同达到“就绪”后再执行。M2-TU-08 完成不自动关闭 Milestone 2。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
