# AI Corporation Desktop 项目进度

| 属性           | 当前值                             |
| -------------- | ---------------------------------- |
| 当前产品版本   | v0.1 MVP                           |
| 当前阶段       | Milestone 3 开发中                    |
| 当前 Milestone | Milestone 3：最小 Agent 闭环       |
| 当前任务单元   | M3-TU-01（进行中）                  |
| 总体状态       | Milestone 2 已完成，Milestone 3 首个任务进行中 |
| 最近更新       | 2026-08-12                         |
| 下一检查点     | 完成团队草案协议、存储、服务与中文 UI |

## 1. 当前结论

Milestone 0、Milestone 1 和 Milestone 2 已完成。Milestone 3 已进入 M3-TU-01：用户将能从已批准 Plan 明确点击“开始组队”，由应用按本地固定规则生成并保存团队草案；本任务不会激活团队、开始执行或调用模型。

M2-TU-09 已按用户选择的方案 B 完成 L3 汇总验收：M2-TU-02 至 M2-TU-08 的直接证据组成交付物和验收矩阵，当前提交的 Windows/macOS 完整工程检查、开发态真实窗口、最终包真实窗口与制品上传全部通过。该结论不声称存在一条未实际执行的连续端到端测试。

Milestone 2 阶段复盘已把有效改进直接落入现行规则和自动检查：纯收尾提交只有在直接父提交完整 CI 成功且文件范围仅包含当前状态、当前合同和验收证据时才能复用产品证据；夹带产品、测试、CI、依赖、协议、Schema、迁移、安全或设计变更会被拒绝。任务决策必须同时写出中文大白话行为，Milestone 最终验收必须预先明确演示方式和双平台/人工边界，CI 重跑与 artifact 前置条件也已固定。

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

M3-TU-01 只交付：

- 已批准 Plan 后的用户主动“开始组队”；
- 内置 Planner/Executor/Judge 模板与确定性最小团队草案；
- Task 分工、职责分离、能力缺口和模型策略展示；
- 草案持久化、幂等、安全 IPC 与重启恢复。

不包含团队激活、Agent Run、精确 Provider/model 选择、模型调用、Scheduler、Runtime、Artifact 或 Evaluation。

## 5. 活跃阻塞与外部条件

当前 P0/P1、P2/P3 均为 0，无实现阻塞。M3-TU-01 合同已建立并进入实现。`banyueban/ai-corporation` 为公开仓库；CI 上传范围仅包含安装包、blockmap 和验收截图。不清理其他仓库制品。

已知条件：系统 PATH 未提供 Node.js，工程验证使用 Codex bundled Node.js；正式 Key 仍只由应用自管 Key Vault 使用，未进入命令、脚本、环境变量、Git、日志或截图；费用无法从当前 Provider 响应可靠取得时保持 `UNKNOWN`。方案 B 使用分任务证据汇总，不声称存在单条未中断端到端测试。GitHub 提示两个 Action 的 Node.js 20 声明被 runner 强制切换到 Node.js 24；当前 CI 成功，该提示属于后续 CI 维护项，不是产品缺陷。

## 6. 当前验证摘要

- M3-TU-01 当前本地 `pnpm check` 完整通过：Protocol 49、Provider 28、Storage 90、Desktop 130，Native Core 7、Workspace Rust 7；status/task-unit、format、lint、typecheck、Rust fmt/clippy 和 secret scan 均成功；
- 团队草案固定分配器测试证明：用户决定 Task 归用户、三类 Executor 按需创建、Judge 与 Executor 分离、未知强制能力形成阻断缺口、草案不含精确 Provider/model，且相同输入得到相同业务结果；
- SQLite 迁移、幂等、递增版本、命令冲突、版本冲突、事务回滚、当前草案恢复和 Corporation 保持 `DRAFT` 的测试通过；未创建 `agent_instance` 或 `agent_run`；
- Windows 开发态真实 Electron 7 条旅程全部通过；M3-TU-01 直接覆盖批准 Plan 后明确点击“开始组队”、团队草案展示、Provider 调用次数不增加、页面重载恢复和 1440×900 截图；
- 当前仍缺当前候选提交的 Windows/macOS CI、最终包真实窗口和用户人工验收，因此 M3-TU-01 保持“进行中”，不得标记完成。

## 7. 下一步

按 M3-TU-01 合同实现团队草案协议、确定性分配、SQLite 持久化、安全 IPC 和中文 UI；完成自动检查与真实窗口验收后再请求用户人工验收。

## 8. 更新规则

- 只记录当前事实，不追加历史时间线；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在、代码生成、构建成功或进程存活均不能代替对应层级验收；
- 当前任务状态必须与任务合同一致，任务通过只关闭自身；
- 复合断言只有全部平台、状态和产物子项均有直接证据时才能勾选；
- 发现文档、设计、协议、Schema、安全、UI 或验收歧义时，先提交用户决策，不推测实施。
