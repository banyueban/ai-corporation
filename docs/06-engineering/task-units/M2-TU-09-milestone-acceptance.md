# M2-TU-09 Milestone 2 证据汇总与最终验收

| 属性 | 值 |
|---|---|
| 任务单元 ID | M2-TU-09 |
| 状态 | 完成 |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan |
| 主要结果 | 以已完成任务的直接证据矩阵和当前提交的双平台最终包回归，判定 Milestone 2 是否满足关闭条件。 |
| 基线提交 | `58451202f5d8c35fc0d2cf28377d75771cd846d9` |

## 1. 需求与设计引用

- 用户决策：选择方案 B；不新增从 Key 设置到 Plan 批准的单条连续自动化流程，汇总 M2-TU-02 至 M2-TU-08 直接证据并重新执行当前提交的 Windows/macOS 最终包检查；
- [MVP Plan：Milestone 2](../MVP-Plan.md#5-milestone-2provider-与-goalplan)；
- [统一验收标准：Milestone 门槛](../Acceptance-Standard.md#71-milestone)与[测试方案](../Testing-Strategy.md)；
- [UI 专项验收：首次设置与创建计划](../../07-ui/UI-Acceptance.md#4-核心-ui-验收场景)；
- M2-TU-02 至 M2-TU-08 已完成任务合同及其 Git、测试、CI、artifact 和人工验收证据。

## 2. 前置条件

- `codex/chinese-ui` 工作区干净，基线提交已推送；
- M2-TU-02 至 M2-TU-08 均为“完成”，各合同验收清单无未完成项；
- Windows 可本地核对安装包和人工验收证据；macOS Apple Silicon 由 GitHub Actions 真实 macOS runner 验证；
- 仓库为公开仓库，可上传 Windows/macOS 验收制品；
- 本任务不需要真实 Provider Key，不读取、导出或上传本机 Key Vault 内容。

## 3. 包含范围

- 把用户选择的 Milestone 2 证据汇总方式写入 MVP Plan；
- 审计 M2-TU-02 至 M2-TU-08 的状态、未完成项和对应 Milestone 交付物；
- 建立 Key Vault、Provider、Goal Engine、Planner、Plan Validation、Plan Review 与四项 Milestone 验收条件的证据矩阵；
- 在当前验收提交上执行完整工程检查、Windows/macOS 开发态 Electron、最终包构建、最终包真实窗口和制品上传；
- 核对 P0/P1、未执行必检项、已知限制和项目状态；
- 全部通过时关闭 M2-TU-09 和 Milestone 2。

本任务只完成 Milestone 2 的 L3 汇总验收，不增加产品能力。

## 4. 非范围

- 新增一条贯穿全部 M2 功能的连续 E2E；
- 修改 Renderer、Main、Preload、Native Core、协议、Schema、迁移或产品状态机；
- 重新调用真实 Provider、把真实 Key 放入环境变量、命令、fixture、CI、日志、截图或 Git；
- Organization、Agent、Scheduler、执行、Artifact、Evaluation、预算账本、Responses Adapter 或 streaming；
- Milestone 3 的阶段复盘或首个实现任务。

若汇总或回归发现产品缺陷，本任务记录失败证据并停止关闭 Milestone；修复必须另建边界清晰的任务合同。

## 5. 依赖与接口

- 输入是 M2-TU-02 至 M2-TU-08 的只读完成合同、当前仓库测试、GitHub Actions job 和 artifact；
- 输出是本合同的证据矩阵、`PROJECT_STATUS.md` 的当前结论和 Milestone 2 状态；
- 不改变任何生产接口、数据格式、加密方式、API dialect 或持久化结构；
- 旧任务证据只证明其原提交；当前提交仍由完整回归和双平台最终包检查覆盖，不以旧 CI 冒充当前 CI。

## 6. 交付物与所有权

专属修改区：本任务合同。

共享冲突区：[MVP Plan](../MVP-Plan.md)、`PROJECT_STATUS.md` 和 CI 证据。本任务只串行更新验收方式与当前状态，不修改其他已完成任务合同的历史结论。

## 7. 验收合同

### 7.1 证据矩阵

| Milestone 2 交付物或验收结果 | 直接来源 | 已核对的目标证据 |
|---|---|---|
| 应用自管 Key Vault | [M2-TU-02](M2-TU-02-application-key-vault.md) | 密文存储、Renderer 录入与主动查看、默认遮挡、重载/重启重新遮挡、替换、删除和泄密扫描 |
| OpenAI 风格 Provider、Mock Provider、连接测试、错误和模型列表 | [M2-TU-03](M2-TU-03-provider-connection-test.md) | Endpoint 安全、固定错误、取消/超时/恢复、精确模型、Key 不泄漏和双平台最终包 |
| 非流式生成与 usage | [M2-TU-04](M2-TU-04-provider-generation-usage.md) | 精确模型、Chat Completions Adapter、通用协议、usage、真实 Provider smoke 与 Responses 前向兼容门禁 |
| Goal Engine | [M2-TU-05](M2-TU-05-goal-engine-generation.md) | 真实生成、每周期 5 轮澄清、最多一次 JSON 修复、取消/恢复和批准门禁 |
| Planner 结构化输出 | [M2-TU-06](M2-TU-06-planner-structured-generation.md) | 可信身份、结构化草稿、最多一次修复、并发/迟到保护、恢复和真实 Provider smoke |
| DAG、输入输出与验收验证 | [M2-TU-07](M2-TU-07-plan-graph-validation.md) | 1–20 个 Task、环与引用、逐 Task 验收、叶子输出、预算/权限描述和原子物化 |
| Plan Review | [M2-TU-08](M2-TU-08-plan-review-edit-approval.md) | 有限编辑、不可变版本、无效恢复、历史只读、批准冻结和人工验收 |
| Key 不进入 SQLite 明文或日志 | M2-TU-02、M2-TU-03、M2-TU-04 | SQLite/WAL/SHM、普通 DTO、日志、错误、截图、trace 与诊断泄密检查 |
| 非法 JSON 最多修复一次 | M2-TU-05、M2-TU-06 | 首次非法只修复一次；二次非法停止且不伪造 Goal/Plan |
| 循环依赖和无验收 Task 被拒绝 | M2-TU-07 | 多种环、自依赖和缺少 REQUIRED 验收均得到确定性 INVALID 且不物化 Task |
| 用户可修改并批准计划 | M2-TU-08 | 有限编辑保存新版本，仅有效版本可批准，批准后冻结且不开始执行 |

M2-TU-02 至 M2-TU-08 共 123 项验收断言均已勾选，未勾选项为 0。以上来源证明各自原提交；当前提交的共同回归仍由本合同 10–12 项单独验证。

### 7.2 关闭断言

- [x] 01 用户选择的方案 B 已写入 MVP Plan，明确证据汇总不声称存在单条未中断端到端测试；
- [x] 02 M2-TU-02 至 M2-TU-08 均为“完成”，不存在未勾选验收断言，且没有用相邻任务替代自身验收；
- [x] 03 Key Vault 交付与验收证据完整：应用自管密文存储、Renderer 录入/主动查看、默认遮挡、重载/重启重新遮挡、删除和泄密扫描通过；
- [x] 04 Provider 交付与验收证据完整：OpenAI 风格连接、精确模型、非流式生成、固定错误、取消/恢复、usage 和 Responses 前向兼容门禁通过；
- [x] 05 Goal Engine 证据完整：真实 Provider 能力、最多一次 JSON 修复、有界澄清、草稿恢复和批准门禁通过；
- [x] 06 Planner 证据完整：结构化生成、可信身份、最多一次修复、取消/中断/迟到保护和草稿恢复通过；
- [x] 07 Plan Validation 证据完整：1–20 个 Task、DAG、输入输出、逐 Task 验收、叶子输出、预算/权限描述和原子物化通过；
- [x] 08 Plan Review 证据完整：有限编辑、不可变新版本、无效恢复、历史只读、有效版本批准与批准后冻结通过；
- [x] 09 MVP Plan 四项验收均有直接映射：Key 不进入 SQLite 明文或日志、非法 JSON 最多修复一次、循环依赖与无验收 Task 被拒绝、用户可修改并批准计划；
- [x] 10 当前提交 `pnpm check`、`pnpm check:status`、`pnpm check:task-units` 和 `git diff --check` 通过；
- [x] 11 当前提交 Windows/macOS 开发态真实窗口、最终包构建、最终包真实窗口和制品上传均成功，job、提交 SHA 与 artifact 可追踪；
- [x] 12 Windows 最终包人工验收结论有效；macOS 原生窗口行为由当前提交真实 macOS CI 验证，未把 Windows 证据冒充 macOS 证据；
- [x] 13 P0/P1 为 0，P2/P3、未执行验证和已知限制均已登记；
- [x] 14 `PROJECT_STATUS.md` 与证据一致，只在 01–13 全部通过后关闭 M2-TU-09 和 Milestone 2。

## 8. 隔离与干扰控制

- 不创建共享业务数据；自动测试沿用各任务自建的随机临时 userData、Workspace、SQLite、端口和 Provider fixture；
- Windows/macOS job 独立构建、运行和上传，不共享进程、数据库或制品目录；
- 真实 Key 和本机真实 Provider 配置不参与本任务，不复制到新位置；
- 每项证据记录来源任务、当前提交、平台和产物，旧任务证据与当前回归证据分栏核对；
- 任一测试、制品上传或清理失败单独记录，不以其他成功项覆盖。

## 9. 证据计划

- 合同审计：M2-TU-02 至 M2-TU-08 状态、验收勾选和非范围；
- 本地门禁：`pnpm check:status`、`pnpm check:task-units`、`pnpm check`、`git diff --check`；
- 当前提交 GitHub Actions：Windows x64 与 macOS Apple Silicon 的 engineering checks、Electron E2E、unsigned installer、packaged application E2E 和 upload artifact；
- artifact：Windows `.exe`/blockmap/截图与 macOS `.dmg`/blockmap/截图；
- 人工证据：用户已经确认的 Windows 最终安装包验收结论；
- 结论矩阵：本合同第 7 节逐项勾选，并在 `PROJECT_STATUS.md` 保存当前有效摘要。

当前验收证据：

- 候选提交 `f945ee16af4a5c33211c229e74230529697401aa`；
- GitHub Actions run `31508191395` 结论为 success；Windows job `93835030932` 与 macOS Apple Silicon job `93835031080` 的工程检查、开发态 Electron、最终包构建、最终包真实窗口和制品上传全部成功；
- Windows artifact `9108089616`（`ai-corporation-windows-x64`）大小 101,812,840 bytes；
- macOS artifact `9108062066`（`ai-corporation-macos-arm64`）大小 122,487,304 bytes；
- 本地完整 `pnpm check` 通过；M2-TU-02 至 M2-TU-08 共 123 项断言完成且未完成项为 0；
- 用户已完成 Windows 最终安装包人工验收；P0/P1、P2/P3 和未执行必检项均为 0；
- GitHub 提示 `pnpm/action-setup@v4` 与 `actions/upload-artifact@v4` 的 Node.js 20 声明已被 runner 强制切换到 Node.js 24；本次 job 成功，该提示登记为后续 CI 维护项，不属于产品缺陷。

## 10. 完成规则

只有 14 项断言全部具备可追踪证据，当前提交的 Windows/macOS CI 和最终包真实窗口通过，Windows 人工验收结论有效，P0/P1 与未执行必检项为 0，文档和项目状态一致，M2-TU-09 才可标记“完成”并关闭 Milestone 2。方案 B 不要求新增单条连续自动化流程，也不得把证据汇总描述成一条未实际执行的连续旅程。
