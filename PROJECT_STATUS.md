# AI Corporation Desktop 项目进度

| 属性           | 当前值                             |
| -------------- | ---------------------------------- |
| 当前产品版本   | v0.1 MVP                           |
| 当前阶段       | Milestone 2 已完成，等待阶段复盘   |
| 当前 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 当前任务单元   | M2-TU-09（完成）                   |
| 总体状态       | Milestone 2 已完成                 |
| 最近更新       | 2026-08-11                         |
| 下一检查点     | 完成阶段复盘并建立 Milestone 3 首个任务合同 |

## 1. 当前结论

Milestone 0、Milestone 1 和 Milestone 2 已完成。Milestone 2 已交付应用自管 Key Vault、OpenAI 风格 Provider、连接与非流式生成、Goal Engine、Planner、Plan Validation 和 Plan Review；用户可以保存并管理 Key，使用真实模型生成 Goal 与 Plan，本地拒绝非法任务图，有限编辑并批准有效计划，但尚未组队或开始执行。

M2-TU-09 已按用户选择的方案 B 完成 L3 汇总验收：M2-TU-02 至 M2-TU-08 的直接证据组成交付物和验收矩阵，当前提交的 Windows/macOS 完整工程检查、开发态真实窗口、最终包真实窗口与制品上传全部通过。该结论不声称存在一条未实际执行的连续端到端测试。

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
- M2-TU-09：Milestone 2 证据矩阵、双平台最终包回归与 L3 关闭验收。

## 3. Milestone 2 范围状态

- [x] AI Corporation Desktop 应用自管 Key Vault；
- [x] OpenAI 风格 Provider + 测试专用 Mock Provider；
- [x] 连接测试、错误归一化和用量；
- [x] Goal Engine；
- [x] Planner 结构化输出与最多一次 JSON 修复；
- [x] DAG、输入输出和验收验证；
- [x] Plan Review 编辑与批准 UI；
- [x] Windows/macOS Milestone 级真实窗口与最终包验收。

Milestone 2 的七项交付、四项验收、全部必需任务单元、Windows/macOS 回归、最终包真实窗口、制品上传和 Windows 人工验收均已通过，P0/P1 为 0。Milestone 2 已关闭；Organization 和执行属于 Milestone 3。

## 4. 当前任务边界

M2-TU-09 只交付：

- M2-TU-02 至 M2-TU-08 完成合同与 Milestone 交付物的证据矩阵；
- 当前提交的完整工程检查与 Windows/macOS 最终包复验；
- 跨平台 artifact、Windows 人工验收、缺陷和已知限制核对；
- 只在全部门禁通过后关闭 Milestone 2。

不包含新增连续 E2E、产品功能、协议、Schema、迁移、真实 Provider 调用或 Milestone 3 实现。

## 5. 活跃阻塞与外部条件

当前 P0/P1、P2/P3 和未执行必检项均为 0，无实现阻塞。M2-TU-09 基线为 `58451202f5d8c35fc0d2cf28377d75771cd846d9`。`banyueban/ai-corporation` 为公开仓库；CI 上传范围仅包含安装包、blockmap 和验收截图。不清理其他仓库制品。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。方案 B 使用分任务证据汇总，不声称存在单条未中断端到端测试。GitHub 提示两个 Action 的 Node.js 20 声明被 runner 强制切换到 Node.js 24；当前 CI 成功，该提示属于后续 CI 维护项，不是产品缺陷。

## 6. 当前验证摘要

- M2-TU-09 证据审计确认 M2-TU-02 至 M2-TU-08 共 123 项验收断言全部勾选，未完成项为 0；Milestone 2 七项交付与四项验收均已映射到直接来源合同；
- M2-TU-09 当前候选本地 `pnpm check` 完整通过：Protocol 47、Provider 28、Storage 88、Desktop 126，Native Core 7、Workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy、secret scan 与 `git diff --check` 均成功；
- 候选提交 `f945ee16af4a5c33211c229e74230529697401aa` 的 GitHub Actions run `31508191395` 成功；Windows job `93835030932` 与 macOS Apple Silicon job `93835031080` 均通过工程检查、开发态 Electron、最终包构建、最终包真实窗口和制品上传；
- Windows artifact `9108089616`（`ai-corporation-windows-x64`）大小 101,812,840 bytes；macOS artifact `9108062066`（`ai-corporation-macos-arm64`）大小 122,487,304 bytes；
- 双平台最终包真实窗口分别覆盖 Key Vault、Provider 连接与生成、Goal Engine、Planner、Plan Validation、Plan Review 及恢复/错误路径；Renderer 外部请求为 0，测试 Key 未进入持久化明文、日志、错误、截图或诊断；
- 用户已完成 Windows 最终安装包人工验收；该人工结论与当前 macOS 自动化证据分开记录，没有跨平台替代。

## 7. 下一步

按任务单元规范完成 Milestone 2 阶段复盘，把仍有效的改进直接落入现行规范、自动检查或 Milestone 3 首个任务合同；复盘完成前不开始 Milestone 3 实现。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
