# M14-TU-01 当前验收证据

## 当前结论

M14-TU-01 已形成供用户人工验收的 Windows 安装包。任务附件、独立标准文档 Skill、通用文档工具、真实 Word/PDF 读写和成果展示已经通过本地完整检查、开发态窗口、最终打包程序以及同一候选的 Windows/macOS CI；用户安装包人工验收尚未完成，因此任务与 Milestone 14 保持“进行中”。

## 已通过证据

- 主实现提交：`5aa1fd6f887ad7c65fb015df2023b2ee1bedf2f9`；跨平台 PDF 字体修复提交：`a58d40d`；
- 依赖固定为 `docx 9.7.1`（MIT）、`mammoth 1.12.2`（BSD-2-Clause）、`pdfjs-dist 6.3.289`（Apache-2.0）和 `@fontsource-variable/noto-sans-sc 5.3.0`（OFL-1.1）；没有复制 Anthropic `docx` / `pdf` Skill 的提示词、脚本或资源；
- `pnpm check`：退出码 0；协议 71、Provider 28、Storage 110、Desktop 207、Native Core 11、Workspace FS 12；状态、任务合同、格式、类型、Clippy 和 Secret scan 通过；
- Windows 开发态窗口回归：11 条通过、5 条按旧入口或真实 Key 开关跳过；新增文档旅程真实添加 Markdown、Word 和带文字层 PDF，修改原件后仍读取软件固定副本，生成并重新打开新的 Word/PDF；
- 新增文档旅程还验证了错误附件 ID 被拒绝、其他已启用标准 Skill 可复用文档工具、原始路径和 API Key 不进入可见过程、原件不被软件改写；
- Word 输出重新解析后存在标题、段落、项目符号、编号列表和表格；PDF 输出具有真实 `%PDF-` 文件头，并由软件重新读取到文字层后才登记成果；
- 1024×700、1440×900 和 200% 缩放下，文档成果卡、预览和操作按钮无横向溢出、竖排、重叠或不可达；三档截图已人工核对；
- Noto Sans SC 的 101 个官方字体片段和字符索引已进入打包目录；短文单元测试只加载实际需要的少量片段，不把整套字体塞进每份 PDF；
- 当前 Windows 打包目录回归：8 条全部通过，覆盖普通员工、编码员工、Skill 导入成功与失败、多 Skill 资源、Python 环境、公开 GIF Skill 和新增文档连续旅程；
- GitHub Actions `33852156936`：成功，7 分 25 秒；Windows x64 与 macOS Apple Silicon 的开发态均为 11 条通过、5 条跳过，最终包均为 8 条通过；macOS 文档旅程真实生成并重新读取中文 PDF；
- CI 产物：Windows 154 MB，artifact digest `7fecbd925bd5acdaee9c7c87f67e8b15189c8705c5e3dea7c71c0b2e0c63e697`；macOS 192 MB，artifact digest `281e310d14f51a2aa07491bcdf368ef3dadcc5a1065e03c9278f8a831c2482cf`；
- 当前 Windows 人工验收包：`release/AI Corporation Desktop Setup 0.1.0-M14-77f8ac8.exe`，152753746 字节，SHA-256 `F7CBC64A2EA18BB11090FCF336ED95F7BFDFC2A917A5AF35EF955D055EA2B6D6`；旧安装包没有被覆盖。

## 验证中发现并修正的测试问题

- 首轮文档旅程已经完成真实 Word/PDF 生成，但过程文字断言同时命中多个元素；改为只在当前任务过程区域核对，产品结果没有被误记为失败；
- 首次整套窗口回归命令没有指定桌面端配置，误把单元测试文件当作 Playwright 测试；使用 `apps/desktop/playwright.config.ts` 后正确范围为 11 条通过、5 条跳过；该错误命令不作为产品失败或成功证据；
- Playwright 在 Electron 200% 缩放后首次只保存了背景色。当前验收改为由真实 BrowserWindow 直接截图，重新生成的 200% 图片已人工核对，按钮换行但没有竖排、重叠或遮挡。
- 首轮 macOS CI 生成的 PDF 只有表格线，`pdfinfo` 显示文件合法且已标记，渲染截图确认没有文字，`pdfplumber` 确认字符数为 0；这证明问题是系统字体没有进入 PDF，而不是 PDF 读取器误判。用户选择 A 后，软件改为随包携带允许嵌入的 Noto Sans SC，并按当前内容选择字体片段。

## 尚未完成

- 用户尚未安装当前 Windows 包并完成真实 Provider、真实附件、文档生成、内容查看、系统打开和查看所在位置的人工验收；
- 合同中仍未取得直接证据的边界项保持未勾选，不能用当前自动检查扩大成全部 21 项通过。

## 当前结论

当前没有已知 P0/P1，但 M14-TU-01 不能标记完成。只有用户完成当前 Windows 安装包人工验收，并补齐合同剩余直接证据后，才能关闭任务与 Milestone 14。
