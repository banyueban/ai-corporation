# M12-TU-01 标准 Skill 与资源使用

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M12-TU-01 |
| 状态 | 完成 |
| 所属 Milestone | Milestone 12：标准 Agent Skills 运行底座 |
| 主要结果 | 一名员工可以拥有多项标准 Skill；用户直接交代任务后，员工只加载简短目录，自动启用匹配 Skill，并按需读取参考资料或把资源复制成真实工作成果。 |
| 基线提交 | `ed9140f553f602495a27c401988791ece8b2d9b3` |

## 1. 需求与设计引用

- 用户确认 `1A + 2A + 3A + 4A`：一名员工可分配多项 Skill；员工按任务自动选择；提供启用、列出/读取参考资料、复制资源和运行脚本的专门工具；标准解析采用正式规范；
- 用户确认 `5C + 6A`：Milestone 12 现在实现独立环境管理工具，未来环境员工复用；自动安装优先进入项目或 Skill 独立环境，系统级安装必须再次确认。环境和脚本由 `M12-TU-02` 负责，不混进本任务；
- [产品重启说明](../../01-product/Product-Reboot.md#10-标准-agent-skills-路线)、[MVP Plan Milestone 12](../MVP-Plan.md#19-milestone-12标准-agent-skills-运行底座)、[Skill Runtime](../../03-core/Skill-Runtime.md)、[Agent Runtime](../../03-core/Agent-Runtime.md)、[Tool Runtime](../../05-infrastructure/Tool-Runtime.md)、[Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[Threat Model](../Threat-Model.md)、[核心用户流程](../../07-ui/Core-User-Flows.md#01-多-skill-与按需启用)和[UI 专项验收](../../07-ui/UI-Acceptance.md#ui-ac-08-多-skill-与资源使用)；
- 外部标准基线：[Agent Skills Specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx) 与 [Adding skills support to an agent](https://github.com/agentskills/agentskills/blob/main/docs/client-implementation/adding-skills-support.mdx)，于 2026-08-23 核对。

## 2. 前置条件

- M11-TU-01 和 Milestone 11 已完成；单员工模型循环、应用自管 Skill 副本、工作区文本/命令工具、真实成果区和人工验收闭环可复用；
- 当前分支为 `codex/pi-reboot`，远程仓库可推送，基线工作区修改已识别为本 Milestone 的权威文档准备；
- 当前发布库最后迁移为 `0022`，本任务独占 `0023_pi_employee_skill.sql`；
- 当前 Skill 导入只读保存完整目录，现有员工只有一个 `skillName`，现有 Task 启动时会直接加载完整 `SKILL.md`；这些均由本任务迁移或替换；
- 本任务不需要新增系统级软件、凭据或外部付费服务；标准 fixture 由仓库自行创建。

## 3. 包含范围

- 按正式 Agent Skills 规范解析 `SKILL.md` 的 `name`、`description`、`license`、`compatibility`、`metadata` 和 `allowed-tools`；严格检查名称、目录一致性、字段类型和长度，保留支持的可选字段；
- 一名员工选择一项或多项已导入 Skill；员工协议改为 `skillNames` 有序非空列表；UI 使用清楚的多选交互并显示名称和用途；
- 增加 `0023_pi_employee_skill.sql` 和事务化 Repository：旧 `skill_name` 原样迁移成位置 `0`；新关系表是权威列表，旧列镜像第一项；失败不得留下半套员工或 Skill 关系；
- 任务开始时只把当前员工所有已分配 Skill 的 `name + description` 目录送给模型，不提前加载完整说明、参考资料、资源或脚本；
- 新增 `skill.activate` / `skill_activate`：模型根据任务自动选择并启用匹配 Skill，成功后只向当前模型过程返回完整说明；
- 新增 `skill.list_resources` / `skill_list_resources`：只列出已启用 Skill 中 `references/`、`assets/` 和 `scripts/` 的受限相对路径、类型和大小；脚本在本任务中明确标记尚不可运行；
- 新增 `skill.read_resource` / `skill_read_resource`：只读取已启用 Skill 的 `references/` 普通 UTF-8 文本；
- 新增 `skill.copy_asset` / `skill_copy_asset`：只把已启用 Skill 的 `assets/` 普通文件复制到当前任务 Workspace；来源与目标分别重新验证，沿用并发保护和成果登记；
- Skill 启用、资源列出、参考资料读取、资源复制和拒绝结果都进入现有实时模型/工具过程；显示逻辑 Skill 名称和相对路径，不显示应用自管目录的绝对路径；
- 如果 `coding-task` 是员工技能列表中的任意一项，继续提供现有编码工具；本任务不改变任务级命令授权、高风险再确认和 API Key 边界；
- 更新协议、迁移、数据、Main、Preload、Renderer、Native 文件边界、测试和当前项目状态。

## 4. 非范围

- 不运行 `scripts/`，不检查或安装 Python、Node、包依赖或其他环境；这些由已确认的 `M12-TU-02` 独立交付；
- 不实现环境员工、多员工委派或员工间交接；未来环境员工由 `DE-018` 跟踪；
- 不宣称任意公开市场 Skill 已兼容；真实公开 Skill 的完整验收由 `DE-019` 和后续独立 Milestone 负责；
- 不自动扫描 `.agents/skills`、用户目录或项目目录；继续由用户明确导入并使用应用自管副本；
- 不允许 `allowed-tools` 自动开启工具，不把 Skill 内容当成审批；
- 不新增 Skill 在线市场、联网下载、软件内编辑、版本依赖求解或自动更新；
- 不新增附件、图片、视频、Office 专用处理、多员工、公司生命周期或全工作区变更扫描；
- 不借本任务调整既有 Provider、模型、命令风险等级、工作区授权或成果验收规则。

## 5. 简化与后续增强

- `DE-018` 记录“当前先实现确定性的环境管理工具，专门环境员工等多员工能力后复用”的阶段性方案；
- `DE-019` 记录“本任务用受控标准 fixture 验证底座，真实公开标准 Skill 另建 Milestone 验收”的边界；
- 脚本与环境能力不是被取消，而是由同一 Milestone 的 `M12-TU-02` 继续交付；本任务通过不代表 Milestone 12 完成。

## 6. 依赖与接口

- `PiEmployee` 和保存请求使用 `skillNames: string[]`，至少一项、去重、保持用户顺序；不继续把单个 `skillName` 暴露为公共协议；
- `pi_employee_skill` 使用 `employee_id + skill_name` 和 `employee_id + position` 双唯一约束；Repository 在一个事务中保存员工、第一项兼容镜像和完整关系；
- Skill 目录项只包含标准元数据和应用生成的可用状态，不包含来源目录、应用自管绝对路径或文件正文；
- `skill.activate` 只接受当前员工已分配名称；未分配、缺失、已损坏或导入后名称不一致返回固定安全错误；
- `skill.list_resources` 只操作已启用 Skill；目录遍历不跟随符号链接或 Windows junction，并设条目和总大小上限；
- `skill.read_resource` 只允许 `references/` 下相对路径和 UTF-8 文本，设单文件字节上限；
- `skill.copy_asset` 只允许 `assets/` 来源和当前任务 Workspace 目标；Native 侧重新验证来源自管根、目标 Workspace 根、链接、普通文件、大小、目标基线和取消状态；
- 复制成功沿用 `pi_task_deliverable` 登记；同一调用恢复时按目标哈希判断已提交、未提交或未知，不自动覆盖并发修改；
- `allowed-tools` 进入 Skill 元数据展示，但永远不进入 Tool 权限交集；既有编码能力只根据已分配列表中是否含内置 `coding-task` 保持原行为；
- Tool Registry 点号 ID 与 Pi 函数下划线名使用固定映射，不允许不同层临时改名。

## 7. 交付物与所有权

专属修改区：

- `packages/protocols/src/pi-employee.ts` 及新增 Skill Tool 协议；
- `packages/storage/migrations/0023_pi_employee_skill.sql`、员工 Repository 与迁移/Repository 测试；
- `apps/desktop/src/main/skill-library.ts`、员工服务、Pi Task 服务和新增 Skill Tool 服务；
- `apps/desktop/src/renderer/EmployeesPage.tsx` 及其样式和测试；
- 标准 Skill fixture、Native Skill 资源边界及专项 E2E。

共享冲突区：

- `apps/desktop/src/main/index.ts`、Preload、共享 Desktop API、Pi Task 事件与工具注册；
- Native RPC、Workspace 写入和成果登记；
- 协议导出、迁移清单、UI 文档、安全文档、`PROJECT_STATUS.md` 和 CI。

上述共享区由本任务串行修改；`M12-TU-02` 在本任务接口和迁移冻结前不实施。

## 8. 验收合同

- [x] 1. Given 合法标准 Skill 含必需和全部支持的可选字段，When 用户导入，Then 软件保存并重新加载同值元数据；文件夹名不匹配、字段错误或非法名称时整体拒绝且旧副本不变。Evidence：解析器/Skill Library 单元测试和导入服务测试。
- [x] 2. Given 至少三项已导入 Skill，When 用户创建或编辑员工并选择两项，Then 重启后顺序和用途保持；空列表、重复名或不存在 Skill 固定拒绝。Evidence：协议、Repository、服务和真实窗口测试。
- [x] 3. Given `0022` 旧库中员工只有 `skill_name`，When 升级到 `0023`，Then 每人得到唯一位置 `0` 关系，原任务/公司成员/员工 ID 不变且 foreign key check 通过；空库迁移也通过。Evidence：迁移矩阵测试和数据库断言。
- [x] 4. Given 同一员工加入两家公司，When 任一公司查看或编辑员工，Then 两处引用同一多 Skill 配置且任务和成果仍按公司隔离。Evidence：Repository 与公司窗口回归。
- [x] 5. Given 员工分配两个 fixture Skill，When 开始只匹配其中一个的任务，Then 首轮模型输入只含两项名称和用途，不含任一完整说明或资源正文。Evidence：受控 Provider 请求记录断言。
- [x] 6. Given 上述任务，When 模型调用匹配 Skill 的 `skill_activate`，Then 只返回该 Skill 完整说明并在过程区显示启用成功；另一项保持未启用。Evidence：Pi Task 集成测试和窗口过程断言。
- [x] 7. Given 模型请求未分配、缺失、损坏或未启用 Skill/资源，When 工具校验，Then 调用被固定拒绝，模型和 UI 得到准确原因，不泄漏绝对路径。Evidence：服务攻击测试和过程快照。
- [x] 8. Given 已启用 Skill 含 reference、asset 和 script fixture，When 列出资源，Then 只返回受限相对路径、类型和大小；script 明确为本任务不可运行。Evidence：资源枚举测试。
- [x] 9. Given 已启用 Skill 的合法 UTF-8 reference，When 员工读取，Then 返回受限正文并显示读取过程；绝对路径、`..`、链接、目录、assets 混读、二进制和超限文件均拒绝。Evidence：跨平台路径攻击集。
- [x] 10. Given 已启用 Skill 的合法 asset 和可写任务 Workspace，When 员工复制到新相对路径，Then 真实字节、哈希和目标一致，成果区登记该文件。Evidence：Native/Main 集成测试、真实文件断言和成果区窗口测试。
- [x] 11. Given 目标已存在、基线改变、来源或目标链接、越界、取消或超限，When 复制 asset，Then 不覆盖并发变化、不产生虚假成果，错误和恢复状态准确。Evidence：Native 攻击/并发/取消测试。
- [x] 12. Given Skill 的 `allowed-tools` 或正文声称已获权限，When 请求命令、未交付脚本或未分配工具，Then 原有 Policy 和审批仍生效，脚本不会运行。Evidence：权限回归和 Prompt 注入测试。
- [x] 13. Given `coding-task` 位于员工技能列表任意位置，When 执行现有编码任务，Then 原文件、命令和成果闭环继续工作；不含 `coding-task` 时不因其他 Skill 名称意外获得其专属映射。Evidence：Pi Task 回归测试和编码 E2E。
- [x] 14. Given Skill 启用、列出、读取、复制成功或失败，When 用户展开过程，Then 模型输入、原始输出、工具名称、逻辑 Skill 名称、相对路径、状态、耗时和错误按发生顺序可见，无应用自管绝对路径。Evidence：开发态真实窗口 E2E 与截图检查。
- [x] 15. Given Renderer 重载或应用在模型/只读工具/复制操作间中断，When 恢复，Then 已完成事实保持，进行中副作用不自动重放，同一资源不重复登记。Evidence：重载、进程重启和幂等测试。
- [x] 16. Given 1024×700、1440×900 和 200% 缩放，When 创建多 Skill 员工并查看长名称、长用途和工具过程，Then 无竖排、重叠、遮挡或关键操作不可见。Evidence：布局断言和开发态截图人工检查。
- [x] 17. Given Windows 开发态与最终打包程序，When 完成“多 Skill → 自动启用 → 读 reference → 复制 asset → 查看成果”连续旅程，Then 真实窗口可交互且结果与文件一致。Evidence：开发态和打包程序 Electron E2E。
- [x] 18. Given 当前验收候选提交，When Windows x64 与 macOS Apple Silicon CI 运行，Then 工程检查、真实窗口、应用构建、打包程序检查和 artifact 上传全部通过。Evidence：同一提交的 GitHub Actions jobs；平台证据不互相替代。

## 9. 隔离与干扰控制

- 自动测试使用 `M12-TU-01-<random>` 独立 userData、SQLite、Workspace、Skill 导入来源、自管副本、资源目标和进程标记；
- fixture 同时包含两个合法 Skill、一个含全部可选字段的 Skill、非法元数据、链接、二进制、超限 reference、asset 和 script；测试不读取用户正式 Skill 或正式数据库；
- 复制测试每例创建独立 Workspace 与目标，显式等待文件句柄和 Electron/子进程退出；清理失败单独报告，不把功能结果改写；
- 开发态与打包态使用不同 userData；Windows/macOS 分别运行自己的路径、链接和窗口断言；
- 真实 Provider 仅在连续窗口旅程确有必要时使用本机不入库配置；确定性 Skill 工具测试使用受控 Provider，不把 mock 结果当成真实公开 Skill 兼容证据。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`git diff --check`；
- `pnpm --filter @ai-corporation/protocols test`、`pnpm --filter @ai-corporation/storage test`、`pnpm --filter @ai-corporation/desktop test`、`pnpm test:rust`；
- `pnpm check`；
- `pnpm test:e2e` 和 M12 专项开发态真实窗口旅程；
- Windows 最终包构建、打包程序 M12 专项旅程及 1024×700、1440×900、200% 截图；
- 同一验收候选提交的 Windows/macOS GitHub Actions run、jobs 和 artifact；
- 验收矩阵记录每条断言、平台、产物、命令、结果和当前提交，不以模型自评、构建成功或进程存活代替窗口与文件事实。

## 11. 完成规则

只有 18 项验收断言全部取得当前提交直接证据、所有适用检查通过、P0/P1 为 0、P2/P3 已登记，文档、协议、迁移、实现、开发态窗口和最终打包程序一致，并且用户使用当前 Windows 安装包人工验收通过，M12-TU-01 才能标记“完成”。本任务完成只代表多 Skill、自动启用和资源闭环完成；脚本、环境管理、真实公开 Skill 验收和 Milestone 12 仍保持未完成。

## 12. 完成结论

- 验收候选提交为 `314d5efb1796eb7b6fd2ca786754a176e99cbcd6`；
- 本地 `pnpm check` 通过：Protocol 67、Provider 28、Storage 109、Desktop 176、Native Core 9、Workspace FS 11，并通过格式、类型、Clippy 和 Secret scan；
- Windows 开发态和最终打包程序完成多 Skill、自动启用、读取 reference、复制 asset、查看成果和重启不重放连续旅程，1024×700、1440×900 和 200% 布局通过；
- GitHub Actions run `32591896190` 对同一候选提交通过：Windows x64 6 分 23 秒，macOS Apple Silicon 4 分 8 秒，两边均完成工程检查、真实窗口、应用构建、打包程序检查和安装包上传；
- 用户于 2026-08-24 使用当前 Windows 安装包完成人工验收并确认通过；18 项断言全部关闭，P0/P1 为 0，没有已知 P2/P3；
- M12-TU-01 完成；`M12-TU-02` 的脚本运行、环境检查和隔离自动安装仍未开始，Milestone 12 不随本任务自动完成。
