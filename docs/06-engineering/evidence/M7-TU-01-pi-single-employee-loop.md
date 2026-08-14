# M7-TU-01 当前验收证据

## 当前结论

M7-TU-01 的实现、自动测试、真实 DeepSeek、Windows 开发态窗口和 Windows 打包窗口检查已经通过。当前提交的 Windows/macOS CI 与用户安装包人工验收尚未完成，所以任务保持“进行中”。

## 已通过证据

- `pnpm check`：退出码 0；协议 55、Provider 28、存储 100、桌面 141、Rust 14；格式、类型、Clippy、Secret scan 通过；
- `pnpm test:e2e`：8 条开发态 Electron 真实窗口旅程通过；
- `pi-employees.spec.ts`：正常流式、用户要求修改、人工验收、取消、模型失败、工具失败、页面刷新、应用重启、运行中重启中断且不重放全部通过；
- `pi-real-provider.spec.ts`：使用应用本地已保存的 `deepseek-v4-flash` 完成真实 Pi 流式与工具循环，退出码 0；测试不读取或输出 Key；
- Windows 安装包构建：`pnpm --filter @ai-corporation/desktop package` 退出码 0；
- 旧功能打包窗口：`test-packaged-app.mjs` 退出码 0；
- Pi 打包窗口：以 `release/win-unpacked/AI Corporation Desktop.exe` 运行完整 Pi 旅程，退出码 0；
- 安装包：`release/AI Corporation Desktop Setup 0.1.0.exe`，106117301 字节；
- SHA-256：`F27C236F5AEC2AABA10BFBC78E92C7A83EC2C77AB55851D938D1C526B29D232D`。

## 尚未执行

- 当前验收候选提交的 Windows/macOS GitHub Actions；
- 用户使用当前 Windows 安装包完成完整人工旅程。

以上两项完成前，不得把 M7-TU-01 或 Milestone 7 标记为“完成”。
