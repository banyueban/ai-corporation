# M12-TU-02 标准 Skill 脚本与独立环境

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M12-TU-02 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 12：标准 Agent Skills 运行底座 |
| 主要结果 | 员工可以按标准 Skill 说明运行 JavaScript、Python 和当前平台原生脚本；缺少运行程序或依赖时，软件给出清楚方案并在用户批准后装入独立环境，复检通过后继续原任务。 |
| 基线提交 | `b297a8d5da6598cf2a01023b5e3a9c7707ea7ab2` |

## 1. 需求与设计引用

- 用户确认 `1A + 2A + 3A + 4A`：支持 JavaScript、Python 和当前平台原生脚本；自动识别 PEP 723、`requirements.txt`、`package.json`，并接受模型提交的结构化包名与版本；默认使用每项 Skill 独立且可复用的环境；系统级安装只允许受限 `winget` 或 Homebrew 方案并再次确认；
- 用户此前确认 `5C + 6A`：当前使用确定性的环境管理工具，后续环境员工复用同一工具；好用是第一原则，审批只拦截真实安装和脚本执行，不给只读检查增加手续；
- [产品重启说明](../../01-product/Product-Reboot.md#10-标准-agent-skills-路线)、[MVP Plan Milestone 12](../MVP-Plan.md#19-milestone-12标准-agent-skills-运行底座)、[Skill Runtime](../../03-core/Skill-Runtime.md)、[Tool Runtime](../../05-infrastructure/Tool-Runtime.md)、[Data Model](../../05-infrastructure/Data-Model.md)、[SQLite Schema](../../05-infrastructure/SQLite-Schema.md)、[Threat Model](../Threat-Model.md)、[核心用户流程](../../07-ui/Core-User-Flows.md#02-skill-脚本与环境准备)和[UI 专项验收](../../07-ui/UI-Acceptance.md#ui-ac-09-skill-脚本与环境准备)；
- 外部标准基线：[Agent Skills Specification](https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx) 与 [Using scripts in skills](https://github.com/agentskills/agentskills/blob/main/docs/skill-creation/using-scripts.mdx)，于 2026-08-24 核对；Python 私有运行环境使用固定版本的 [uv](https://docs.astral.sh/uv/guides/install-python/) 和其应用自管安装目录能力。

## 2. 前置条件

- M12-TU-01 已完成，多 Skill、按需启用、资源读取/复制、任务过程、成果登记和用户人工验收闭环可复用；
- 当前分支为 `codex/pi-reboot`，基线提交为 `b297a8d5da6598cf2a01023b5e3a9c7707ea7ab2`；
- 当前 SQLite 最后迁移为 `0023`。本任务不新增业务迁移：脚本和安装进程复用现有 `pi_command_call` 启动日志与任务事件，独立环境状态使用应用自管目录中的原子清单；
- JavaScript 使用应用随包提供的 Node 运行能力和 npm，不要求用户另装 Node；Python 由应用随包提供的固定 uv 管理，缺少解释器时只下载到应用自管目录；
- Windows 在本机开发态和最终安装包验证，macOS Apple Silicon 由 CI 补充；测试安装只写独立临时目录，不修改用户正式环境。

## 3. 包含范围

- 新增 `environment.prepare` / `environment_prepare`。它核对已启用 Skill、脚本类型、运行程序和依赖，直接返回“已就绪”，或生成用户可读的安装计划并等待决定；
- 新增可运行的 `skill.run_script` / `skill_run_script`。模型只提交逻辑 Skill 名称、`scripts/` 下的相对路径、参数和可选结构化依赖，不提交 shell 命令、应用内部路径或真实 Workspace 根；
- 支持 `.js`、`.mjs`、`.cjs`、`.py`，Windows 支持 `.ps1`，macOS 支持 `.sh`；其他扩展名和平台不匹配时显示准确的不支持原因；
- JavaScript 脚本使用应用自身 Node 运行能力；Python 脚本默认使用应用自管 CPython 3.12，在 PEP 723 明确提出受支持版本约束时选择满足约束的 CPython 3.10–3.14；Windows PowerShell 和 macOS `/bin/sh` 使用系统原生程序；
- 从 PEP 723、Skill 根目录 `requirements.txt` 和 `package.json` 自动提取依赖。Skill 文字只描述依赖时，模型可以提交包名与版本组成的结构化列表；不接受原始安装命令、URL、Git 地址、本地路径、重定向或包管理器参数；
- 默认以 Skill 当前内容摘要、平台、架构、运行程序和依赖摘要建立应用自管独立环境，同一 Skill 可跨任务、跨公司复用；Skill 更新或依赖变化后重新核对并使用新环境；
- 只有 Skill 明确要求项目环境时才使用 `PROJECT` 范围，并在当前 Workspace 内建立清楚标识的项目环境；默认始终为 `SKILL` 范围；
- 缺少 Python、Python/JavaScript 包或其他可在独立环境解决的内容时，显示名称、用途、来源、网络、目标范围、安装位置类型、精确命令和包安装脚本风险，提供“自动安装”和“暂不安装”；
- 缺少系统程序时，只允许结构化的 `winget install --id <ID> --exact` 或 `brew install <formula>` 计划。必须再次展示软件、系统位置、联网、精确命令和影响并单独批准；管理器不存在时只给人工办法；
- 安装成功后重新检查；只有运行程序与全部依赖真实可用，原工具调用才继续。跳过、失败、取消、超时、结果未知或复检失败均不运行脚本、不显示成功；
- 脚本从该 Skill 的运行副本根目录启动，保持标准 Skill 的相对路径语义；逻辑 Workspace 位置由 Main 内部转换，模型、Renderer 和过程记录不出现应用自管 Skill/环境绝对路径；
- 脚本沿用现有“每项任务一次”的命令执行授权；依赖安装使用独立安装批准，系统级安装再使用第二次明确批准。Skill 文字、`allowed-tools` 和脚本不能创建任何批准；
- stdout、stderr、退出码、耗时、截断、取消、超时和整个进程树终止进入现有实时过程；API Key、Key Vault、应用认证秘密不进入脚本或安装进程环境；
- 脚本生成的 Workspace 文件只有经可信边界核对并调用现有成果登记后才进入成果区；模型文字、stdout 或零退出码不能冒充成果；
- 更新协议、Main、打包资源、Renderer 过程与批准卡、测试、文档和项目状态，并完成 Milestone 12 连续旅程。

## 4. 非范围

- 不支持 TypeScript、Deno、Bun、Ruby、Go、Java、编译型工具链、容器、虚拟机、远程环境或任意自定义脚本解释器；
- 不接受模型给出的任意 shell 安装命令，不执行 `package.json` 的任意用户脚本入口，不允许 URL、Git、本地路径或私有源凭据作为自动依赖；
- 不承诺包安装或 Skill 脚本被 OS 级沙箱限制；它们以用户当前账户运行，安装包的构建脚本可能执行代码，批准卡必须说清楚；
- 不自动修改系统 PATH、Shell 配置、Windows 注册表或用户全局 Python/Node；不使用系统 Python 作为默认可复用环境；
- 不实现环境员工、多员工委派、在线 Skill 市场、Skill 自动更新或真实公开 Skill 的完整兼容声明；
- 不扫描整个 Workspace 猜测脚本产物，不改变现有成果登记边界；
- 不新增附件、图片、视频、Office/PDF 专用工具，也不借本任务修改 Provider、Key、公司或旧 Goal/Plan 数据。

## 5. 简化与后续增强

- `DE-018` 保留“当前由确定性环境管理工具处理，后续环境员工复用”的阶段边界；
- `DE-019` 保留真实公开标准 Skill 的独立端到端兼容验收，当前 fixture 不能冒充市场兼容已经完成；
- `DE-020` 记录除 JavaScript、Python、Windows PowerShell 和 macOS Shell 外的更多运行程序、复杂私有依赖源、锁文件和环境清理策略；这些扩展不阻塞当前常用脚本闭环。

## 6. 依赖与接口

- `environment.prepare` 输入固定包含 Skill 名称、脚本相对路径、范围 `SKILL | PROJECT` 和可选结构化依赖；`PROJECT` 还必须包含可显示的明确原因。输出固定包含运行程序、依赖、环境摘要、状态和可选安装计划；
- `skill.run_script` 输入固定包含 Skill 名称、脚本相对路径、字符串参数数组、可选结构化依赖和可选预期 Workspace 成果相对路径；不接受 `cwd`、绝对路径、环境变量、shell 命令或任意可执行程序；
- 结构化依赖包含生态 `PYTHON | JAVASCRIPT | SYSTEM`、名称和可选版本；名称、版本、winget ID 和 Homebrew formula 使用严格字符白名单，拒绝命令字符、协议头、路径和参数前缀；
- Main 每次调用都重新核对公司、任务、员工分配、Skill 已启用状态、脚本位于 `scripts/`、无链接且摘要未变化；准备环境和实际启动前各核对一次；
- 环境键由 Skill 内容摘要、平台、架构、运行程序、依赖摘要和范围组成。`SKILL` 环境位于应用自管数据目录；`PROJECT` 环境位于当前 Workspace 的明确子目录；清单只在临时安装完整并复检后原子写为 `READY`；
- 应用随包提供固定版本 uv 和 npm。uv 下载来源、版本和 SHA-256 在构建脚本中固定；Python 下载由 uv 定向到应用自管目录，不写系统 PATH；
- JavaScript 通过 Electron 的 Node 模式以“程序 + 参数”启动；Python 通过独立环境解释器启动；PowerShell 使用 `-NoProfile -NonInteractive -File`，macOS 使用 `/bin/sh`。所有调用都使用无 shell 的结构化启动；
- 用户看到的命令使用逻辑 Skill/环境/Workspace 表示，审批前同时给出将运行的真实程序与参数，但不显示应用自管绝对路径；执行目标只能由同一计划在 Main 内重新求值；
- 每个脚本或安装操作在启动进程前复用 `pi_command_call` 写入 `STARTING`，终态写入 `SUCCEEDED | FAILED | CANCELLED | TIMED_OUT | UNKNOWN`；应用启动把遗留 `STARTING` 标为 `UNKNOWN`，绝不自动重放；
- 环境安装批准与任务脚本授权相互独立；系统安装批准绑定规范化的管理器、包 ID/formula 和精确参数指纹，批准 A 不能安装 B；
- API Key 和应用秘密继续由安全环境过滤；脚本只获得最低必要的运行环境和用于定位当前 Workspace 的内部变量，工具结果返回逻辑路径而不是内部绝对路径；
- 成果登记继续复用 `workspace.register_deliverable` 的真实文件验证，不因为脚本来源而放宽路径、链接、敏感文件、大小或公司/任务归属检查。

## 7. 交付物与所有权

专属修改区：Skill 脚本/环境协议、环境计划与清单服务、结构化进程 Runner、应用随包运行资源、脚本与依赖 fixture、专项测试。

共享冲突区：`apps/desktop/src/main/pi-task-service.ts`、`skill-library.ts`、命令 Runner、Pi Task 协议/事件、Preload/Desktop API、员工任务 Renderer、批准卡、打包脚本、第三方声明、权威文档、`PROJECT_STATUS.md` 和 CI。上述共享区由本任务串行修改。

## 8. 验收合同

- [x] 01 合法 `.js/.mjs/.cjs` 脚本在不安装系统 Node 的机器语义下使用应用运行能力执行；参数、stdout、stderr、退出码和耗时与真实进程一致。
- [x] 02 合法 `.py` 脚本在无系统 Python 的受控环境中展示并批准私有 Python 安装，安装只进入应用自管目录，复检后脚本成功执行。
- [x] 03 Windows `.ps1` 和 macOS `.sh` 分别使用当前平台原生程序执行；平台不匹配和其他扩展名准确显示不支持且没有进程启动。
- [x] 04 脚本从运行副本的 Skill 根启动，相对读取 reference/asset 符合标准；模型、Renderer、事件、日志、截图和错误不包含应用自管 Skill/环境绝对路径。
- [x] 05 绝对路径、`..`、链接、目录、非 `scripts/` 路径、未启用/未分配/已变化 Skill、非法参数和调用时并发更新均固定拒绝。
- [x] 06 PEP 723、`requirements.txt` 和 `package.json` 的普通公开依赖被准确识别；结构化补充依赖可合并去重；原始命令、URL、Git、本地路径、参数注入和错误生态被拒绝。
- [x] 07 默认 `SKILL` 环境按内容和依赖摘要跨任务、跨公司复用，不重复安装；Skill 或依赖变化后重新检查并使用新环境，不把旧环境冒充可用。
- [x] 08 只有明确请求并说明原因时使用 `PROJECT` 环境；它只写当前 Workspace 的明确子目录，不串工作区、不登记成任务成果、不修改全局 PATH。
- [x] 09 缺失独立环境内容时，批准卡完整显示名称、用途、来源、联网、目标范围、位置类型、精确命令和包安装脚本风险，并提供“自动安装”“暂不安装”。
- [x] 10 依赖安装批准不等同于脚本执行授权；拒绝、取消、失败、超时或复检失败都不运行脚本，批准后安装完成必须复检再继续同一工具调用。
- [x] 11 系统程序只生成受限 winget/Homebrew 计划；系统安装使用第二次明确批准并绑定精确指纹；管理器缺失时显示人工办法，命令注入和其他包管理器被拒绝。
- [x] 12 同一任务脚本执行只需现有一次任务级授权；新任务重新授权；Skill 文字、`allowed-tools`、模型输出和脚本输出都不能创建或扩大授权。
- [x] 13 JavaScript/Python 包安装脚本可能执行代码、脚本以用户账户运行且没有 OS 级强沙箱的事实在批准前可见；API Key 和应用认证秘密不进入安装或脚本进程。
- [x] 14 stdout/stderr 实时可见且有明确截断；超时、用户取消、任务终止和应用退出会终止整个进程树，迟到输出不能覆盖终态。
- [x] 15 脚本或安装进程在应用退出时仍运行，重启后显示 `UNKNOWN` 和不重放说明；未完成环境没有 `READY` 清单，下次必须重新检查。
- [x] 16 脚本真实生成的 Workspace 文件经可信边界核对后可登记并展示成果；不存在、越界、链接、敏感或未登记文件不进入成果区，零退出码不代替成果证据。
- [x] 17 多 Skill 连续旅程完成“简短目录 → 自动启用 → 读 reference → 复制 asset → 环境计划 → 自动安装 → 复检 → 运行脚本 → 登记成果”，未匹配 Skill 不被加载或执行。
- [x] 18 现有文本员工、编码员工、命令授权、多 Skill 资源、成果预览/打开/所在位置、取消和退回修改全部回归通过。
- [x] 19 1024×700、1440×900 和 200% 缩放下，环境计划、两级批准、长包名、长输出和失败说明无竖排、重叠、遮挡或关键按钮不可见，键盘可以完成批准或拒绝。
- [x] 20 Windows 开发态和最终打包程序使用真实进程完成 JavaScript、Python 私有环境和成果连续旅程；最终包确实包含固定 uv/npm 运行资源，不能只验证构建成功或进程存活。
- [ ] 21 当前验收候选提交的 Windows x64 与 macOS Apple Silicon CI 均通过工程检查、真实窗口、应用构建、打包程序专项旅程和安装包上传；两平台证据不互相替代。当前修复候选尚未取得新 CI 证据。
- [ ] 22 用户使用当前 Windows 安装包完成环境计划、自动安装、脚本运行、过程和真实成果人工验收；22 项全部关闭且 P0/P1 为 0 后，M12-TU-02 与 Milestone 12 才能完成。

## 9. 隔离与干扰控制

- 自动测试使用 `M12-TU-02-<random>` 独立 userData、SQLite、Workspace、Skill 来源、自管副本、环境根、下载缓存、进程标记和成果路径；
- 测试 fixture 分别覆盖无依赖 JS/Python、PEP 723、requirements、package.json、PowerShell/Shell、错误扩展、链接、注入、长输出、超时和部分环境；
- Python/包安装测试默认使用可控本地下载源或注入的确定性安装 Runner；至少一条 Windows 最终包旅程使用固定官方运行资源和真实隔离环境，不把纯 mock 当成可用证据；
- winget/Homebrew 自动测试只验证结构化计划、批准、指纹、Runner 参数和复检，不真实修改 CI 或开发机系统；真实系统安装不是人工验收必需动作；
- 每例环境和 Workspace 相互独立；只按已解析的精确临时路径清理，不按进程名或宽泛目录结束/删除其他任务；
- 本机 DeepSeek Provider 继续只保存在应用本地；环境和脚本 fixture 不需要真实 Key，Secret scan 覆盖环境、事件、日志、截图和打包内容。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`git diff --check`、协议/Storage/Desktop/Native 对应测试和 `pnpm check`；
- 环境解析与计划测试：PEP 723、requirements、package.json、结构化补充依赖、环境键、更新失效、SKILL/PROJECT 范围、注入拒绝；
- 结构化真实进程测试：应用 Node、私有 Python、PowerShell/Shell、stdout/stderr、退出码、长输出、超时、取消、进程树和秘密环境；
- 安装与恢复测试：独立安装批准、系统二次批准、拒绝/失败/复检、原子 `READY` 清单、复用、崩溃 `UNKNOWN` 和不重放；
- Pi 受控 Provider 连续旅程、现有文本/编码/资源/成果回归、开发态真实窗口和最终打包程序专项 E2E；
- 1024×700、1440×900、200% 布局断言与截图人工检查；
- 同一候选提交的 Windows/macOS GitHub Actions run、jobs、安装包 artifact、大小与 SHA-256；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

用户已明确确认 `1A + 2A + 3A + 4A`，任务不存在未解决的产品决策，可以实施。只有 22 项验收断言都取得当前提交的直接证据、所有适用检查通过、P0/P1 为 0、P2/P3 已登记，文档、协议、运行资源、实现、开发态窗口和最终打包程序一致，并且用户使用当前 Windows 安装包人工验收通过，M12-TU-02 和 Milestone 12 才能标记“完成”。模型声称运行成功、依赖目录存在、零退出码、构建成功或进程存活都不能单独证明脚本成果或 Milestone 完成。
