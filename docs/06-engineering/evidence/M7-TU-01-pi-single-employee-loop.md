# M7-TU-01 当前验收证据

## 当前结论

M7-TU-01 的实现、自动测试、真实 DeepSeek、Windows 开发态窗口、Windows 打包窗口和 Windows/macOS CI 已通过。用户发现的员工页布局错乱已修复，并于 2026-08-15 使用新 Windows 安装包完成人工验收并确认通过。任务及 Milestone 7 的适用退出条件均已满足。

## 已通过证据

- `pnpm check`：退出码 0；协议 55、Provider 28、存储 100、桌面 141、Rust 14；格式、类型、Clippy、Secret scan 通过；
- `pnpm test:e2e`：8 条开发态 Electron 真实窗口旅程通过；
- `pi-employees.spec.ts`：正常流式、用户要求修改、人工验收、取消、模型失败、工具失败、页面刷新、应用重启、运行中重启中断且不重放全部通过；
- `pi-real-provider.spec.ts`：使用应用本地已保存的 `deepseek-v4-flash` 完成真实 Pi 流式与工具循环，退出码 0；测试不读取或输出 Key；
- Windows 安装包构建：`pnpm --filter @ai-corporation/desktop package` 退出码 0；
- 旧功能打包窗口：`test-packaged-app.mjs` 退出码 0；
- Pi 打包窗口：以 `release/win-unpacked/AI Corporation Desktop.exe` 运行完整 Pi 旅程，退出码 0；
- 员工页布局修复：页头、技能库、员工列表和直接任务区改为符合内容顺序的单列布局；窗口测试直接检查三个面板只有一列，任务表单和结果宽度不低于面板的 70%；
- 当前开发态与 Windows 打包程序的完整员工窗口旅程各 1/1 通过；打包程序的任务区域截图已人工检查，未见竖排、重叠或溢出；
- 安装包：`release/AI Corporation Desktop Setup 0.1.0.exe`，106117299 字节；
- SHA-256：`A9C6E01C031AD5A7D0FC375EDD3455FC0A72BF3C749E704B8BF88594DD92379E`；
- 员工页布局修复提交：`95887998ae3a6e3fda5c159e5ac2a3ea55d96335`；
- GitHub Actions run `31828722640`：CI scope 通过；Windows x64 6m22s、macOS Apple Silicon 4m2s，均通过工程检查、真实窗口、安装包构建、打包程序窗口检查和安装包上传。
- 直接父提交 `1fdc7a405d35ec628a070c1d22f31516416d58f9` 的 GitHub Actions run `31829354733`：Windows x64 6m52s、macOS Apple Silicon 3m58s，完整流水线通过；
- 用户人工验收：2026-08-15，使用包含员工页布局修复的新 Windows 安装包完成检查并明确回复“确认通过”。

## 最终结论

M7-TU-01 的 17 项验收断言全部通过，P0/P1 为 0，没有未执行的必检项。M7-TU-01 和 Milestone 7 可以标记为“完成”；该结论不包含附件、通用文件修改、多员工协作、图片、视频、文档或 PPT 专用能力。
