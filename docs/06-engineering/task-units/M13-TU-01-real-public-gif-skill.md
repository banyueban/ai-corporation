# M13-TU-01 真实公开 GIF Skill 兼容闭环

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M13-TU-01 |
| 状态 | 进行中 |
| 所属 Milestone | Milestone 13：真实公开 Skill 兼容验收 |
| 主要结果 | 用户把未修改的公开 `slack-gif-creator` Skill 分配给员工后，可以直接交代 GIF 任务；员工自动准备独立 Python 环境、使用 Skill 自带工具生成真实 GIF，并在成果区预览动画。 |
| 基线提交 | `9d0ca301409dc5203d716c619542dd6bd1247408c` |

## 1. 需求与设计引用

- 用户已选择 A 方案：首个真实公开 Skill 使用 Anthropic 的 `slack-gif-creator`，不修改原 Skill，完整验证导入、分配、自动启用、环境安装、脚本运行、真实 GIF、成果预览和人工验收；
- 用户此前明确要求“好用是第一原则”，普通任务不得被与真实风险无关的手续阻碍；
- [产品重启说明](../../01-product/Product-Reboot.md#11-首个真实公开-skill)、[MVP Plan Milestone 13](../MVP-Plan.md#20-milestone-13真实公开-skill-兼容验收)、[Skill Runtime](../../03-core/Skill-Runtime.md#56-skillrun_workspace_script)、[核心用户流程](../../07-ui/Core-User-Flows.md#03-真实公开-gif-skill)和[UI 专项验收](../../07-ui/UI-Acceptance.md#ui-ac-10-真实公开-gif-skill)；
- 外部 Skill 固定为 [anthropics/skills](https://github.com/anthropics/skills) 提交 `3b3fad96af16a10759d930941b4520ba0c40edae` 下的 `skills/slack-gif-creator/`；保留原 `LICENSE.txt`，许可证为 Apache License 2.0；
- 外部 Skill 原始内容包含 `SKILL.md`、`requirements.txt` 和 `core/` 下四个 Python 工具文件，没有 `scripts/` 目录。现有内部 fixture 不能代替这一事实。

## 2. 前置条件

- Milestone 12 已完成，标准 Skill 导入、多 Skill 分配、自动启用、独立环境、依赖安装、命令授权、成果登记和人工验收闭环可复用；
- 当前分支为 `codex/pi-reboot`，开始基线为 `9d0ca301409dc5203d716c619542dd6bd1247408c`，开始时工作区无未提交改动；
- 外部 Skill 固定提交和 Apache 2.0 许可证已核对；测试快照必须与该提交原目录逐文件一致，不能为了通过测试修改说明、依赖或 Python 工具；
- Windows 本机验证开发态和最终安装包；macOS Apple Silicon 由同一提交的 CI 补充。用户正式 Provider 继续只保存在本机，不写入仓库或测试产物。

## 3. 包含范围

- 将固定公开 Skill 的完整原始目录作为真实兼容 fixture，保留许可证和来源清单；导入仍走用户当前“选择本地技能文件夹 → 确认变化”的真实入口，不新增在线市场；
- 员工任务开始仍只看到 Skill 名称和用途，匹配 GIF 任务后调用 `skill_activate` 读取原始完整说明；未分配、未启用或不匹配 Skill 不获得后续能力；
- 新增 `skill.run_workspace_script` / `skill_run_workspace_script`：员工先通过现有受控写入在当前 Workspace 创建普通 UTF-8 `.py` 文件，再让软件使用指定已启用 Skill 的独立 Python 环境运行它；
- 工作区脚本只读使用环境中的 Skill 运行副本，通过内部 `PYTHONPATH` 访问原 Skill 的 `core/` 工具。模型和 Renderer 只看到 Skill 名、工作区相对脚本路径和逻辑环境，不看到应用自管绝对路径；
- 工作区脚本执行不修改导入的 Skill 或其应用自管原始副本。软件在私有运行目录建立一次性脚本副本，固定当前内容后执行，结束后清理；执行工作目录为当前 Workspace，因此 Skill 示例中的相对输出写入 Workspace；
- 自动读取 Skill 根 `requirements.txt`，为公开 Skill 展示并安装 `pillow>=10.0.0`、`imageio>=2.31.0`、`imageio-ffmpeg>=0.4.9` 和 `numpy>=1.24.0`。首次安装得到的实际版本保存在可复用独立环境中；环境复用不重新安装或升级；
- 依赖安装批准与本任务运行程序授权继续分离；拒绝、失败、取消、超时、复检失败和重启未知均不运行工作区脚本、不登记 GIF、不显示成功；
- `skill_run_workspace_script` 可声明预期 Workspace 成果，脚本成功后仍由 Native Workspace 边界核对真实文件、大小和哈希，再登记为成果；零退出码、stdout 和模型文字不能冒充 GIF；
- 成果区支持安全预览不超过 5 MiB、文件头确认为 GIF87a/GIF89a 的 `.gif`；预览通过 IPC 返回内存数据，不向 Renderer 暴露本机绝对路径。登记后变化继续明确显示；更大或无效 GIF 不在软件内预览，但仍可安全打开或查看所在位置；
- 更新系统提示、工具过程、协议、Main、Renderer、测试、权威文档和项目状态，并完成一条从真实 Skill 导入到 GIF 人工验收的连续旅程。

## 4. 非范围

- 不提供在线 Skill 市场、GitHub URL 导入、Skill 自动更新、依赖锁文件生成或任意公开 Skill 的广泛兼容声明；
- 不修改、翻译、补写或给外部 `slack-gif-creator` 增加 `scripts/`；测试辅助内容必须位于 Skill 目录外；
- 不支持工作区 JavaScript、PowerShell、Shell 或其他语言脚本通过本工具运行；它只交付本次真实 Skill 需要的 Python；
- 不新增用户图片附件、图片理解、现有图片编辑、PNG/JPEG 通用预览、视频或 Office/PDF 专用能力；本任务只从文字要求和 Python 绘图生成 GIF；
- 不保证所有 Slack 场景、任意尺寸、任意时长或审美质量；连续验收使用 128×128、3 秒以内且通过公开 Skill validator 的动画 GIF；
- 不增加 OS 级强沙箱，不修改现有 Provider、Key、公司、旧 Goal/Plan 或多员工流程。

## 5. 简化与后续增强

- `DE-013` 继续记录附件和多模态输入；公开 Skill 中“使用用户上传图片”的可选能力本任务明确不支持；
- `DE-014` 由本任务认领首个 GIF 生成与动画预览切片；PNG/JPEG、图片编辑、视频、文档和 PPT 仍需后续独立任务；
- `DE-020` 继续记录其他工作区脚本运行程序、完整锁文件和复杂依赖生态。本任务只根据真实失败样本增加 Python 工作区脚本桥接；
- `DE-019` 只有本任务的开发态、最终安装包、双平台 CI 和用户人工验收全部通过后才可标记补齐。

## 6. 依赖与接口

- `skill_run_workspace_script` 输入固定为 Skill 名、Workspace `.py` 相对路径、可选结构化 Python 依赖、预期成果相对路径和超时；不接受绝对路径、`..`、cwd、环境变量、可执行程序、shell 命令或安装命令；
- Main 在准备环境、批准后和实际启动前重新核对公司、任务、员工分配、Skill 已启用、Workspace 文件、链接、UTF-8、大小和哈希；等待期间脚本或 Skill 变化会使旧计划失效；
- SkillLibrary 提供只读的工作区 Python 入口检查，只复用 Skill 根 `requirements.txt`、Skill 摘要和完整运行副本，不把 Workspace 脚本写回 Skill；
- SkillEnvironmentManager 继续按 Skill 摘要、平台、架构、Python 和依赖摘要确定环境。一次性脚本副本不改变环境身份；PEP 723 依赖变化会改变依赖摘要并触发新环境；
- 运行时使用独立环境 Python，cwd 为可信 Workspace，`PYTHONPATH` 只指向私有 Skill 运行副本；API Key 和应用认证秘密仍不进入进程；
- GIF 预览先用 Native Core 检查当前文件，再读取受限字节并重新核对大小、哈希和 GIF 文件头；IPC 只返回 `data:image/gif;base64,...` 和当前完整性，不返回路径；
- 现有文本预览、系统打开、所在位置、外部变化提示和成果登记协议保持兼容。

## 7. 交付物与所有权

专属修改区：公开 Skill 固定测试快照与来源清单、工作区 Skill 脚本桥接、GIF 预览专项测试和 M13 证据。

共享冲突区：`skill-library.ts`、`skill-environment.ts`、`pi-task-service.ts`、Pi Task 协议、Preload/Desktop API、员工任务 Renderer、样式、系统提示、E2E、权威文档、`PROJECT_STATUS.md` 和 CI。上述共享区由本任务串行修改。

## 8. 验收合同

- [ ] 01 固定公开 Skill 快照逐文件对应提交 `3b3fad96...` 的原目录，包含 Apache 2.0 许可证；导入后 `SKILL.md`、`requirements.txt` 和 `core/` 保持原样。
- [ ] 02 用户通过真实导入入口确认后，技能列表和新员工选择立即出现 `slack-gif-creator`；员工可与内置编码 Skill 同时分配，旧员工和其他 Skill 不受影响。
- [ ] 03 GIF 文字任务开始时模型只看到 Skill 名称和用途；员工自动启用正确 Skill 后才获得完整说明，未分配或未启用 Skill 不能运行工作区脚本。
- [ ] 04 员工可在 Workspace 写入 `.py`，再用 `skill_run_workspace_script` 运行；脚本成功导入公开 Skill 的 `core.gif_builder`、`core.easing`、`core.frame_composer` 和 `core.validators`，导入 Skill 内容没有被修改。
- [ ] 05 绝对路径、`..`、链接、目录、非 UTF-8、超过 1 MiB、非 `.py`、缺失文件、并发变化、已更新 Skill 和其他工作区固定拒绝，没有 Python 进程启动。
- [ ] 06 原 `requirements.txt` 四项依赖及版本范围被准确识别；安装卡显示包、来源、联网、位置、命令和风险，用户批准后只装入 Skill 独立环境。
- [ ] 07 首次安装后真实复检 Python 和四项包；同一 Skill 和依赖在新任务、新公司复用实际环境，不再次安装或升级；Skill 或依赖变化使用新环境。
- [ ] 08 安装批准与任务运行程序授权互不替代；拒绝、失败、取消、超时、复检失败或状态变化都不运行脚本，旧按钮不能重复提交。
- [ ] 09 工作区脚本以固定内容的一次性私有副本执行，cwd 为当前 Workspace，私有副本结束后清理；过程、模型、Renderer、错误和截图不包含 Skill/环境绝对路径或 API Key。
- [ ] 10 工作区脚本 stdout、stderr、退出码、耗时、截断、取消和超时真实可见；应用退出会终止进程树，重启标记未知且不自动重放脚本或安装。
- [ ] 11 公开 Skill 真实生成 128×128、3 秒以内的动画 GIF，并由其 `core.validators` 验证；GIF 存在、文件头、帧数、大小和哈希均来自真实文件。
- [ ] 12 只有经 Native Workspace 核对的预期 GIF 进入成果区；不存在、越界、链接、伪扩展名、无效文件头或模型自述不进入成功成果。
- [ ] 13 点击“查看内容”后，合法小型 GIF 在软件内真实播放动画；登记后文件变化显示“登记后已变化”；超限或损坏 GIF 显示不能预览，但“打开文件”和“查看所在位置”仍按现有安全规则工作。
- [ ] 14 文本/代码成果预览、普通员工、编码员工、多 Skill、Skill 自带 scripts、环境复用、命令授权、成果打开和退回修改全部回归通过。
- [ ] 15 1024×700、1440×900 和 200% 缩放下，GIF 预览、长安装列表、过程卡和操作按钮无竖排、重叠、遮挡或不可达；键盘可完成批准、拒绝和成果操作。
- [ ] 16 Windows 开发态和最终打包程序完成同一条真实公开 Skill 连续旅程；不能用单元测试、构建成功、进程存活或内部 Skill 替代。
- [ ] 17 同一候选提交的 Windows x64 与 macOS Apple Silicon CI 通过工程检查、真实窗口、应用构建、打包程序专项旅程和安装包上传；两平台证据不互相代替。
- [ ] 18 用户使用当前 Windows 安装包完成公开 Skill 导入、员工分配、环境安装、GIF 生成、过程查看、动画预览和真实文件人工验收；全部断言关闭且 P0/P1 为 0 后才能完成。

## 9. 隔离与干扰控制

- 自动测试使用 `M13-TU-01-<random>` 独立 userData、SQLite、Workspace、Skill 来源、自管副本、环境根、下载缓存、脚本私有副本和成果路径；
- 固定公开 Skill 快照与测试生成脚本分开存放；测试不得向 Skill 目录写入或在运行后留下变化；
- 单元测试使用确定性 Runner 覆盖环境、路径、取消和恢复；至少一条 Windows 开发态和最终包旅程使用真实自管 Python、真实公开依赖和真实 GIF，不把 mock 当作兼容证据；
- 测试 GIF 使用独立 Workspace，核对动画帧和文件头后按精确路径清理，不扫描或删除用户目录；
- 本机 DeepSeek Provider 只用于用户人工验收或显式真实 Provider 专项，认证信息不进入 fixture、日志、截图、证据或 Git。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`git diff --check`、协议/Desktop/Native 对应测试和 `pnpm check`；
- 公开 Skill 来源清单、逐文件 SHA-256、原目录不变检查和许可证检查；
- SkillLibrary 与环境测试：工作区 Python 入口、requirements、私有脚本副本、只读 Skill core、路径/链接/并发变化、环境复用和秘密过滤；
- GIF 预览协议与 Main/Renderer 测试：合法动画、无效头、超限、外部变化、文本回归和绝对路径不可见；
- 受控 Provider 的连续旅程、Windows 开发态真实窗口、Windows 最终打包程序、1024×700/1440×900/200% 截图；
- 同一候选提交的 Windows/macOS GitHub Actions run、jobs、安装包 artifact、大小与 SHA-256；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

用户已选择 A 方案，外部 Skill、目标成果和当前边界均已明确，任务可以实施。只有 18 项验收断言全部取得当前提交直接证据、所有适用检查通过、P0/P1 为 0、已知限制如实记录，并且开发态、最终打包程序、Windows/macOS CI 和用户 Windows 安装包人工验收都通过，M13-TU-01 与 Milestone 13 才能标记“完成”。模型说“已生成”、Python 退出码为 0、GIF 文件存在、构建成功或窗口进程存活都不能单独代替动画成果和真实用户流程验收。
