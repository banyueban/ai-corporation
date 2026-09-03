# M14-TU-01 当前验收证据

## 当前结论

M14-TU-01 已形成可供 CI 和用户人工验收的 Windows 候选。任务附件、独立标准文档 Skill、通用文档工具、真实 Word/PDF 读写和成果展示已经通过本地完整检查、开发态窗口与最终打包程序连续旅程；Windows/macOS CI 和用户安装包人工验收尚未完成，因此任务与 Milestone 14 保持“进行中”。

## 已通过证据

- 实现提交：`5aa1fd6f887ad7c65fb015df2023b2ee1bedf2f9`；
- 依赖固定为 `docx 9.7.1`（MIT）、`mammoth 1.12.2`（BSD-2-Clause）和 `pdfjs-dist 6.3.289`（Apache-2.0）；没有复制 Anthropic `docx` / `pdf` Skill 的提示词、脚本或资源；
- `pnpm check`：退出码 0；协议 71、Provider 28、Storage 110、Desktop 205、Native Core 11、Workspace FS 12；状态、任务合同、格式、类型、Clippy 和 Secret scan 通过；
- Windows 开发态窗口回归：11 条通过、5 条按旧入口或真实 Key 开关跳过；新增文档旅程真实添加 Markdown、Word 和带文字层 PDF，修改原件后仍读取软件固定副本，生成并重新打开新的 Word/PDF；
- 新增文档旅程还验证了错误附件 ID 被拒绝、其他已启用标准 Skill 可复用文档工具、原始路径和 API Key 不进入可见过程、原件不被软件改写；
- Word 输出重新解析后存在标题、段落、项目符号、编号列表和表格；PDF 输出具有真实 `%PDF-` 文件头，并由软件重新读取到文字层后才登记成果；
- 1024×700、1440×900 和 200% 缩放下，文档成果卡、预览和操作按钮无横向溢出、竖排、重叠或不可达；三档截图已人工核对；
- Windows 最终打包程序回归：8 条全部通过，覆盖普通员工、编码员工、Skill 导入成功与失败、多 Skill 资源、Python 环境、公开 GIF Skill 和新增文档连续旅程；
- Windows 安装包：`release/AI Corporation Desktop Setup 0.1.0.exe`，143581106 字节，SHA-256 为 `09D106AD8C290F23FD2966EABF528A23D7F609633277242D341D06D9628FB41C`。

## 验证中发现并修正的测试问题

- 首轮文档旅程已经完成真实 Word/PDF 生成，但过程文字断言同时命中多个元素；改为只在当前任务过程区域核对，产品结果没有被误记为失败；
- 首次整套窗口回归命令没有指定桌面端配置，误把单元测试文件当作 Playwright 测试；使用 `apps/desktop/playwright.config.ts` 后正确范围为 11 条通过、5 条跳过；该错误命令不作为产品失败或成功证据；
- Playwright 在 Electron 200% 缩放后首次只保存了背景色。当前验收改为由真实 BrowserWindow 直接截图，重新生成的 200% 图片已人工核对，按钮换行但没有竖排、重叠或遮挡。

## 尚未完成

- 当前候选提交的 Windows x64 与 macOS Apple Silicon GitHub Actions 尚未取得结果；
- 用户尚未安装当前 Windows 包并完成真实 Provider、真实附件、文档生成、内容查看、系统打开和查看所在位置的人工验收；
- 合同中仍未取得直接证据的边界项保持未勾选，不能用当前自动检查扩大成全部 21 项通过。

## 当前结论

当前没有已知 P0/P1，但 M14-TU-01 不能标记完成。只有双平台 CI 和用户安装包人工验收通过，并补齐合同剩余直接证据后，才能关闭任务与 Milestone 14。
