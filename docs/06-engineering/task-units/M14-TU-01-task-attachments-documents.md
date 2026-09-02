# M14-TU-01 任务附件与文档处理闭环

| 字段 | 内容 |
| --- | --- |
| 任务单元 ID | M14-TU-01 |
| 状态 | 就绪 |
| 所属 Milestone | Milestone 14：任务附件与文档处理 |
| 主要结果 | 用户把真实 Word、PDF、文本或 Markdown 添加到员工任务后，员工通过标准文档 Skill 读取内容并在当前 Workspace 生成新的 Word/PDF 成果。 |
| 基线提交 | `d3efb5d` |

## 1. 需求与设计引用

- 用户确认 `1A + 2B + 3A + 4A + 5A`：软件保存附件副本；同时支持 Word、文本、Markdown 和 PDF；永远生成新文件；使用标准 Skill 与通用工具；保留常用结构但不承诺复杂排版完全不变；
- 用户随后确认按说明实现，采用前序推荐 `6A + 7B`：普通 PDF 可读取和生成，扫描件 OCR 后续增加；由 AI Corporation 独立编写标准文档 Skill，不复制受限第三方 Skill；
- Anthropic 固定提交中的 `docx` 和 `pdf` Skill 许可证禁止复制、长期保留和再分发，因此只用于理解“Skill 指导模型、宿主工具真实执行”的架构事实，不复制其提示词、脚本或资源；
- [产品重启说明](../../01-product/Product-Reboot.md#12-任务附件与首个文档闭环)、[MVP Plan Milestone 14](../MVP-Plan.md#21-milestone-14任务附件与文档处理)、[Artifact System](../../03-core/Artifact-System.md#4-存储策略)、[Skill Runtime](../../03-core/Skill-Runtime.md#9-任务附件与通用文档工具)、[核心用户流程](../../07-ui/Core-User-Flows.md#04-任务附件与文档处理)和 [UI-AC-11](../../07-ui/UI-Acceptance.md#ui-ac-11-任务附件与文档处理)。

## 2. 前置条件

- Milestone 7–13 已完成，单员工、Workspace、标准 Skill、环境、脚本、成果和最终安装包验收可复用；
- 当前分支为 `codex/pi-reboot`，开始基线 `d3efb5d`，任务开始时工作区无未提交改动；
- 新增依赖固定为 `docx 9.7.1`（MIT）、`mammoth 1.12.2`（BSD-2-Clause）、`pdfjs-dist 6.3.289`（Apache-2.0），随应用打包，不要求用户预装 LibreOffice、Pandoc、Poppler 或 Tesseract；
- 用户正式 Provider 和附件继续只保存在本机，不进入仓库、fixture、截图或 CI artifact。

## 3. 包含范围

- 员工任务区增加“选择附件”和拖放；Main/Preload 解析真实文件，Renderer 只拿任务内 ID、文件名、类型、大小和哈希；
- 选择时复制到应用自管暂存区，开始任务时固定到 Task 私有目录并写入 `pi_task_attachment`；原文件不修改，任务历史和退回修改复用固定副本；
- 每次选择最多 10 个文件，单文件最多 50 MiB、总计最多 100 MiB；只接受真实 `.docx`、`.pdf`、`.txt`、`.md`；
- 新增 `document-processing` 内置标准 Skill，作为可分配、可自动启用、可查看来源的只读 Skill；处理步骤只写在 Skill 中；
- 新增通用 `document_read`：按附件 ID 和字符范围读取 UTF-8、Word 或普通 PDF，返回规范化 Markdown 片段；
- 新增通用 `document_create`：把不超过 200,000 字符的规范化 Markdown 生成新的 `.docx` 或 `.pdf`；支持标题、段落、项目符号、编号列表和表格；
- DOCX 使用 `mammoth` 读取、`docx` 生成；PDF 使用 `pdfjs-dist` 读取，生成时由无网络、无 Node、禁用脚本的隐藏 Electron 页面排版并 `printToPDF`；
- 文档二进制通过 Native Core 在当前 Workspace 原子创建并哈希，目标存在或边界变化固定拒绝；成功后登记真实成果；
- 成果区对 Word/PDF 提供规范化内容查看，并保留系统打开、查看所在位置和外部变化提示；
- 同步更新协议、迁移、Main、Preload、Renderer、Native Core、测试、权威文档和项目状态。

## 4. 非范围

- 不支持 `.doc`、`.docm`、加密 Word/PDF、扫描 PDF OCR、手写识别、宏、外部链接、嵌入对象执行或密码破解；
- 不承诺页眉页脚、自动目录、文本框、批注、修订、复杂浮动图片、精确字体和像素级排版保持不变；
- 不支持 PPT、表格、图片编辑、视频、音频、在线文档、云盘、在线 Skill 市场或多员工协作；
- 不允许覆盖附件原件或 Workspace 已有文件；不在任务开始后追加或替换附件；
- 不复制或改写 Anthropic `docx`/`pdf` Skill，不宣称兼容其完整能力；
- 不引入 LibreOffice、Pandoc、Poppler、Tesseract 或新的系统安装流程。

## 5. 简化与后续增强

- `DE-013` 由本任务认领 Word、PDF、文本和 Markdown 的首版附件输入；图片、音频和视频输入仍未完成；
- `DE-014` 由本任务认领 Word 与普通 PDF 处理切片；PPT、表格、通用图片和视频继续保留；
- `DE-021` 记录扫描 PDF OCR、复杂文档保真、任务中追加附件、导出和可视化清理；
- 应用自管附件随任务保留，当前没有单独附件清理入口；这不允许误删用户原文件或 Workspace 成果。

## 6. 依赖与接口

- 新增附件 IPC：选择、接收拖放、移除待选附件和清空待选；路径只在 Preload/Main 短暂存在；
- `PiTaskStartRequest` 可选携带待提交选择 ID，`PiTask.attachments` 返回固定元数据；同 major 只增加可选字段，不破坏旧 Renderer 或旧任务；
- `pi_task_attachment` 以 `task_id + id` 唯一，保存显示名、媒体类型、大小、SHA-256、随机存储文件名和时间；不保存原始绝对路径或提取正文；
- `document_read` 只读取当前公司、当前任务固定附件；单次最多 40,000 字符，可按 `nextOffset` 连续读取；
- `document_create` 只创建当前任务 Workspace 中不存在的 `.docx`/`.pdf`，不接受 HTML、命令、环境变量、绝对路径或应用私有路径；
- 新增 Native Workspace 二进制创建 RPC：仅允许新文件、受限大小、Base64 请求、同目录临时文件和原子落盘，返回真实哈希与大小；
- 文档内容按不可信附件处理，不能覆盖系统提示、Skill 权限和审批；生成 HTML 必须由内部 Markdown 子集转义生成，禁止脚本、远程资源和任意 HTML 注入。

## 7. 交付物与所有权

专属修改区：`document-processing` 内置 Skill、任务附件服务、文档解析/生成服务、`0024_pi_task_attachment.sql`、文档工具测试与 M14 证据。

共享冲突区：Pi Task 协议/Repository/Service/IPC、Preload/Desktop API、Native Workspace RPC、员工任务 Renderer/样式、内置 Skill 列表、系统提示、E2E、权威文档、`PROJECT_STATUS.md` 和 CI。上述共享区由本任务串行修改。

## 8. 验收合同

- [ ] 01 用户通过选择按钮和拖放添加真实 `.docx`、`.pdf`、`.txt`、`.md`；成功卡只显示名称、类型、大小，开始前可移除，键盘不依赖拖放。
- [ ] 02 Main 为附件保存应用自管副本并计算 SHA-256；原文件随后移动、修改或删除不改变任务副本，数据库和模型均无原始绝对路径。
- [ ] 03 目录、链接、设备文件、`.doc`、`.docm`、错误扩展名/文件头、非 UTF-8、单个超 50 MiB、总计超 100 MiB 和超过 10 个文件固定拒绝；有效附件不因一个错误文件丢失。
- [ ] 04 待选复制中不能开始任务；移除、清空、窗口关闭、应用重启和过期选择只清理已核对的应用暂存副本，不修改用户原件。
- [ ] 05 任务与附件数据库提交、文件固定和失败回滚一致；启动失败不留下可见半任务，旧库迁移、旧任务和无附件任务保持兼容。
- [ ] 06 `document-processing` 是独立标准 Skill，随应用导入、可分配和自动启用；工作步骤不硬编码进 Pi Task Service，其他标准 Skill 可调用相同文档工具。
- [ ] 07 `document_read` 只能读取当前公司、任务和员工可见的固定附件；未分配 Skill、错误任务、其他公司、猜测 ID、状态变化和私有路径均拒绝。
- [ ] 08 文本/Markdown 保持 UTF-8；DOCX 提取标题、段落、列表和表格；普通 PDF 提取真实文字；每段返回准确范围、总字符数、下一偏移和末尾状态。
- [ ] 09 损坏/加密 Word 或 PDF、无文字层扫描 PDF、解析失败和超限结果显示准确中文原因；空提取不冒充成功，不自动安装 OCR。
- [ ] 10 附件正文只作为不可信数据进入模型，不能提升工具权限、修改 Skill 分配、获得命令批准、读取其他附件或覆盖系统规则；路径、Key 和应用秘密不进入过程。
- [ ] 11 `document_create` 从规范化 Markdown 真实生成 `.docx` 和 `.pdf`；标题、段落、项目符号、编号列表和表格在输出结构中存在，中文内容可读。
- [ ] 12 文档生成只允许新的当前 Workspace 相对路径；绝对路径、`..`、链接、错误后缀、已有目标、超限内容、任务取消或状态变化固定拒绝，不产生部分文件。
- [ ] 13 Native Core 使用同目录临时文件原子创建二进制，成功返回真实 SHA-256 和大小；应用重启不重放未知写入，相同工具调用保持幂等。
- [ ] 14 只有可重新打开并核对文件头、非空内容和基本结构的 Word/PDF 才登记成果；退出码、模型说明、临时文件或损坏文件不显示成功。
- [ ] 15 成果区可查看规范化内容、系统打开和查看所在位置；登记后变化、缺失、损坏或超限显示真实状态，不继续声称原成果完整。
- [ ] 16 退回修改继续使用同一固定附件并生成新的输出文件；取消、失败、中断和重启不删除原附件、不重复生成、不把部分成果标记完成。
- [ ] 17 普通员工、编码员工、文本工作区、多 Skill、Skill 脚本/环境、GIF、旧成果预览与命令授权全部回归通过。
- [ ] 18 1024×700、1440×900 和 200% 下，拖放区、附件卡、错误、长文件名、过程和成果按钮无竖排、重叠、遮挡或不可达；截图人工核对。
- [ ] 19 Windows 开发态和最终打包程序完成同一条真实连续旅程：添加 Word/PDF，读取并修改内容，生成新的 Word/PDF，打开真实文件并核对原文件不变。
- [ ] 20 同一候选提交的 Windows x64 与 macOS Apple Silicon CI 通过工程检查、真实窗口、应用构建、打包程序专项旅程和安装包上传。
- [ ] 21 用户使用当前 Windows 安装包完成附件添加、文档读取、Word/PDF 新文件、过程、成果打开和真实文件人工验收；P0/P1 为 0 后才能完成。

## 9. 隔离与干扰控制

- 自动测试使用 `M14-TU-01-<random>` 独立 userData、SQLite、附件暂存/任务目录、Workspace、Skill、副本、文档和成果；
- fixture 使用合成 Word/PDF，不含真实用户内容、Key、机器路径或第三方受限 Skill；
- 原文件、应用副本和 Workspace 输出使用三个不同根目录，清理前逐个验证绝对目标位于当前测试根；
- 文档解析、生成、Native 写入、Renderer 流程和最终包分别形成证据；mock 文件存在不能替代可重新打开的 Word/PDF；
- Windows 与 macOS 的字体和 PDF 字节允许不同，但两边必须通过文字、结构、文件头、打开和用户流程断言。

## 10. 证据计划

- `pnpm check:status`、`pnpm check:task-units`、`git diff --check`、协议/Storage/Desktop/Native 测试和 `pnpm check`；
- 依赖版本、许可证、打包内容和无 Anthropic 受限文件检查；
- SQLite 空库/旧库迁移、附件事务、暂存清理、重启恢复和外键检查；
- 路径、链接、伪扩展名、大小、并发变化、Prompt injection、跨公司/任务和二进制写入攻击集；
- 合成 Word/PDF 的提取、分段、生成、重新打开、结构、中文、哈希和原文件不变检查；
- Windows 开发态、最终安装包、1024×700/1440×900/200% 截图和完整连续旅程；
- 同一候选提交的 Windows/macOS GitHub Actions run、安装包 artifact、大小和 SHA-256；
- 用户对当前 Windows 安装包的人工验收结论。

## 11. 完成规则

只有 21 项验收断言全部取得当前提交直接证据、所有适用检查通过、P0/P1 为 0、已知限制如实记录，并且开发态、最终打包程序、Windows/macOS CI 和用户 Windows 安装包人工验收都通过，M14-TU-01 与 Milestone 14 才能标记“完成”。附件已复制、模型说已处理、文档库没有抛错、文件存在、构建成功或进程存活都不能单独代替真实内容、结构、窗口和用户验收。
