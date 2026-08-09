# M2-TU-06 Planner 结构化生成与草稿持久化垂直切片

| 属性           | 值                                                                                                                           |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 任务单元 ID    | M2-TU-06                                                                                                                     |
| 状态           | 完成                                                                                                                         |
| 所属 Milestone | Milestone 2：Provider 与 Goal/Plan                                                                                           |
| 主要结果       | 用户可从已批准 Goal 明确选择已验证 Provider/精确模型，生成严格结构化且尚待图验证的 Plan DRAFT；非法 JSON/Schema 最多修复一次 |
| 基线提交       | `9d619eefffc8fb97ad5cb1296c2231d59b21b542`                                                                                   |

## 1. 需求与设计引用

- 用户决策：`1A + 2A + 3A + 4A + 5A + 6A`；
- 用户界面语言决策：软件自行定义的按钮、标题、提示和状态尽量使用中文；`API Key`、`URL`、Provider 名称、模型 ID 等外部标准称呼或外部数据保持原样；
- [MVP Plan：Milestone 2](../MVP-Plan.md)、[PRD 规划与组队](../../01-product/PRD.md)；
- [Planner Protocol](../../04-protocols/Planner-Protocol.md)、[Task Protocol](../../04-protocols/Task-Protocol.md)、[Goal Contract Protocol](../../04-protocols/Goal-Contract-Protocol.md)、[Provider Generation Protocol](../../04-protocols/Provider-Generation-Protocol.md)；
- [Task Engine](../../03-core/Task-Engine.md)、[Technical Design](../../02-architecture/Technical-Design.md)；
- [Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[Model Provider](../../05-infrastructure/Model-Provider.md)；
- [Threat Model T-04/T-07/T-09/T-13](../Threat-Model.md)、[Testing Strategy](../Testing-Strategy.md)；
- [Core User Flow 03](../../07-ui/Core-User-Flows.md)、[Screen State Matrix Plan](../../07-ui/Screen-State-Matrix.md)、[UI Acceptance UI-AC-02](../../07-ui/UI-Acceptance.md)。

## 2. 前置条件

- M2-TU-02 至 M2-TU-05 已完成；应用自管 Key Vault、显式 Provider/精确模型、dialect-neutral 非流式生成、Goal 批准和当前 Goal 查询可用；
- 开始实施时 `main` 基线为 `9d619eefffc8fb97ad5cb1296c2231d59b21b542`，工作区无已有修改；
- `0001`–`0009` 不可修改，本任务独占 `0010_planner_generation.sql`；
- 自动测试使用随机假 Key、动态 loopback Provider、独立 SQLite/userData 和合成 Goal；
- 本机真实 Provider 只由正式 Renderer 通过应用 Key Vault 使用，Key 不进入命令、脚本、环境变量、fixture、日志、截图、Git 或 CI。

## 3. 包含范围

- Planner v1 start/cancel/get-current strict Schema、typed IPC 和公开投影；
- 只接受当前 Corporation 的当前 `APPROVED` Goal version；
- 每次规划前用户明确选择 ENABLED、VERIFIED 且模型仍存在的 Provider/精确模型；
- Provider 输入仅含已批准 Goal 公开内容和内置版本化能力/工具/媒体类型白名单，不含任何 Workspace 路径或文件；
- 固定版本化 system prompt、非流式 `JSON_OBJECT`、严格单对象 `PlannerDraftCandidate`；
- 模型只生成语义内容/局部引用；Main 生成 Plan ID/version 和稳定 Task UUID；
- 首次 JSON/Schema 非法时最多一次同 Provider/version/model 修复；再次失败不保存计划；
- schema-valid 结果原子保存为 `task_plan DRAFT` 和 `validationStatus=PENDING`；
- operation/model_call 检查点、usage、幂等、单活跃、取消、版本/迟到保护和启动中断恢复；
- 只创建首个活动 Plan DRAFT；已有非 SUPERSEDED Plan 时拒绝再次生成，计划改版与 supersede 留给后续任务；
- Goal Review 后的 Planner 生成入口、显式 Provider/模型与字段披露、生成/取消、只读草稿摘要/Task/能力/建议角色、失败与恢复 UI；软件自行定义的界面文字使用中文，外部标准称呼和外部数据保持原样；
- Windows/macOS 开发态和最终包 loopback 窗口矩阵，以及 Windows 正式 Renderer 真实 Provider 低风险 smoke。

本任务只关闭 Planner 结构化生成基础，不关闭 Task Graph 语义验证、Plan Review 完整编辑/批准、Organization 或 Milestone 2。

## 4. 非范围

- DAG/引用、入口终点、输入输出闭合、叶子验收、预算、权限、任务数和单 Run 可完成性验证；
- 创建正式 `TaskContract`、可执行 `task`/`task_dependency` 或改变 Corporation 状态；
- 计划编辑、重新规划、批准或开始执行；
- Agent Definition/Instance、Organization Engine、真实团队或默认 Planner 路由；
- 自动沿用 Goal Provider、自动 Provider/模型回退；
- Workspace 路径/目录/文件、RAG、附件、Tool Call、Responses Adapter 或任何 streaming；
- 保存完整 prompt/response、非法 JSON、隐藏推理、远端正文/request ID、Key 或 Authorization。

## 5. 依赖与接口

- 跨进程唯一合同为 Planner/Task/Goal Contract/Provider Generation Protocol 与 `packages/protocols` Schema，Renderer 不复制 DTO；
- Planner 只通过 dialect-neutral `ModelProvider.generate` 和 Adapter registry 调用；Chat 私有 DTO 不得进入 Service/Repository/Renderer；
- start 绑定 Corporation version、当前 APPROVED Goal version、Provider version 和精确模型；
- `PlannerDraftCandidate.localId` 只供未验证引用，正式 Task UUID 由 Main 生成并稳定持久化；
- 后续 M2-TU-07 拥有语义验证和正式 Task materialization，本任务不得提前写入已验证或可执行状态；
- 网络调用在事务外；正常与修复调用分别记录 PLAN_GENERATION model_call，task/run 为空。

## 6. 交付物与所有权

- 专属修改区：Planner Protocol/Schema/prompt/parser/service/repository/IPC、`0010_planner_generation.sql`、M2-TU-06 fixture/tests/E2E；
- 共享冲突区：protocol/storage exports、Provider service、migration tests、Main/Preload/DesktopApi、Goal Review/Planner UI、Data/SQLite/Threat/UI 文档、CI/打包脚本和 `PROJECT_STATUS.md`；
- `0001`–`0009`、已完成任务合同、Goal Engine 状态机和 Provider Adapter 远端协议不得破坏；
- 本任务串行拥有 Planner/Plan Draft/Goal Review 入口共享边界，相邻 DAG/Plan Review/Organization 任务不得并行修改。

## 7. 验收合同

- [x] 协议：三个 Planner v1 channel strict Schema 拒绝额外字段、错误版本/UUID/版本、非法模型和未授权调用；
- [x] 上游门禁：只有当前 APPROVED Goal 可规划；DRAFT/SUPERSEDED、Corporation/Goal/Provider 版本冲突均在调用前拒绝；
- [x] Provider 门禁：只有显式选择的 ENABLED、已保存 Key、VERIFIED 且精确模型仍存在的 Provider 可调用；无自动沿用、默认路由或回退；
- [x] 输入披露：Renderer 明确显示 Provider/模型与发送字段；发网请求不含 Workspace 路径/身份/目录/文件、Key、Header、未批准 Goal 或其他版本；
- [x] 输出 Schema：单个受限 JSON 对象严格映射完整 Planner candidate；额外字段、缺字段、非法枚举/数字/字符串/数组、Markdown fence、多对象、超限和非法 UTF-8 安全失败；
- [x] 可信身份：模型输出不能指定 Corporation/Plan/正式 Task 身份；Main 生成 Plan ID/version/Task UUID，同一已保存草稿重读保持稳定；
- [x] JSON 修复：首次非法只调用同 Provider/version/model 一次修复；修复失败停止且无 task_plan；正常成功不修复；修复数据保持 USER 不可信边界；
- [x] 草稿语义：schema-valid 结果保存为 DRAFT/PENDING，UI 明确显示“尚未验证”；不得显示 Validated/Ready/Approved 或允许执行；
- [x] 迁移：空库与 `0001`–`0009` 升级 `0010` 成功；STRICT/CHECK/FK/JSON/唯一活动索引、foreign key check 和权威 SQLite Schema 一致；
- [x] 原子持久化：Plan 草稿、ID 映射、operation、usage、model_call 与安全事件一致提交；失败注入不留下伪成功或半份计划；
- [x] 审计与 usage：正常/修复分别记录 PLAN_GENERATION，关联 corporation/operation/provider/model 且 task/run 为空；usage 聚合准确，费用未知不猜测；
- [x] 并发/取消/迟到：同 Corporation 单活跃；operation 幂等/冲突正确；取消 2 秒内传播；Goal/Provider/Corporation/operation 变化后的迟到结果不覆盖；
- [x] 恢复：Renderer reload/SQLite 重开恢复已保存 DRAFT；应用启动把遗留 GENERATING 转 INTERRUPTED，不自动重发；可显式重试或取消；
- [x] 安全：prompt/response/非法 JSON/隐藏推理/路径/Key/Authorization/SQL/堆栈不进入 SQLite、错误、日志、trace、截图或诊断；
- [x] UI：从已批准 Goal 进入 Planner，明确选择 Provider/模型、查看披露、生成/取消并只读查看摘要、任务、能力要求与建议角色；明确标注尚未组队；软件自行定义的文字使用中文，外部标准称呼和外部数据保持原样；
- [x] UI 状态与适配：生成中、草稿待验证、失败、已取消、已中断由真实后端事实驱动；键盘、焦点、实时提示、1024×700、1440×900 和 200% 可完成，窄窗口或高缩放下中文菜单不截断；
- [x] 自动真实窗口：Windows/macOS 同提交开发态与最终包 loopback 覆盖成功、一次修复、修复失败、取消、中断/重启、版本冲突和既有回归；功能与清理独立通过；
- [x] 本机真实 Provider：正式 Windows Renderer 使用应用 Key Vault 中已保存资源完成非敏感最小 Planner 生成；只记录脱敏状态、plan/version/usage/时间和泄密扫描；
- [x] 治理：协议/设计/Schema/迁移/实现/测试一致；适用工程检查、secret scan、Windows/macOS CI 最终包与 artifacts 成功；P0/P1 和未执行必检项为 0。

## 8. 隔离与干扰控制

- 每例使用 `M2-TU-06-<random>` userData/SQLite、Corporation/Goal/operation/plan/task ID、随机假 Key、动态 loopback 端口和自有 AbortController；
- fixture 自行创建 Workspace、Corporation、APPROVED Goal 和 Provider 前置事实，不读取正式 userData 或其他任务残留；
- fixture 验证请求结构与敏感字段缺失，只保存哈希/固定诊断，不输出正文或 Key；
- Renderer reload、应用重启、SQLite 重开、开发态/最终包、Windows/macOS 与真实 Provider 分别形成证据；
- 清理只删除已解析并验证位于任务临时根内的资源；正式 Provider/Key/Goal 不属于自动清理目标。

## 9. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`pnpm check`、Electron E2E、packaged E2E、`git diff --check`、Rust fmt/clippy 和 secret scan；
- Protocol strict/攻击集、candidate parser、可信 ID、prompt disclosure、repair call-count 和 usage 单元测试；
- `0010` 空库/升级/约束/中断，Repository 原子性/幂等/单活跃/版本/迟到/model_call 测试；
- Main/Preload typed IPC、Renderer component/keyboard/axe/尺寸/缩放及开发态/最终包窗口矩阵；
- 正式应用真实 Provider smoke 的脱敏 plan/usage/时间、数据库/日志泄密扫描；
- 同一候选提交 Windows/macOS GitHub Actions run/job、最终包 artifact ID/digest。

## 10. 完成规则

只有 19 项验收断言逐项获得当前提交直接证据，真实 Provider smoke 和凭据边界通过，资源清理通过，P0/P1 与未执行必检项为 0，才可标记完成。本任务通过不代表 DAG 验证、正式 Task、Plan Review、Organization、执行或 Milestone 2 完成。
