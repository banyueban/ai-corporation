# M13-TU-01 当前验收证据

## 当前结论

M13-TU-01 的真实公开 GIF Skill 连续流程已经通过本地工程检查、Windows 开发态窗口、Windows 最终打包程序、Windows/macOS CI 和用户人工验收。18 项验收断言全部关闭，M13-TU-01 与 Milestone 13 可以标记为“完成”。

## 已通过证据

- 修复候选提交：`a6b0bc23e3838e14cf766b23a0fc8c9987ec689b`；
- 固定公开来源：Anthropic `skills` 仓库提交 `3b3fad96af16a10759d930941b4520ba0c40edae` 的 `slack-gif-creator`；`SKILL.md`、`requirements.txt`、`core/` 和 Apache 2.0 许可证逐文件一致；
- `pnpm check`：退出码 0；协议 69、Provider 28、Storage 109、Desktop 197、Native Core 10、Workspace FS 11；状态、任务合同、格式、类型、Clippy 和 Secret scan 通过；
- Windows 开发态真实公开 Skill 专项 1 条通过；旅程使用中文工作区和已有中文子目录，先真实调用 `workspace_list`，再完成自动启用、环境准备、工作区 Python、公开 Skill 四个 `core/` 模块、12 帧 128×128 GIF 核对、成果登记和动画预览；
- Windows 最终打包程序完整员工与 Skill 回归 7 条全部通过；
- Windows 安装包：`release/AI Corporation Desktop Setup 0.1.0.exe`，124959708 字节，SHA-256 为 `66CAB34609996F6D9F46D14102A44E07D259390BB950044D5485A809697B4C09`；
- GitHub Actions run `33621315073`：Windows x64 8 分 15 秒、macOS Apple Silicon 6 分 2 秒；两边均通过工程检查、开发态真实窗口、应用构建、最终打包程序专项旅程和安装包上传；
- 用户人工验收：2026-09-02，使用修复后的 Windows 安装包在真实工作区重新执行任务并确认通过。

## 失败与修复证据

- 首轮人工验收中，公开 Skill 已正确导入和启用，但真实中文工作区含子目录时，Native Core 把目录大小返回为 `null`，桌面协议拒绝整个目录列表；模型连续两次无法查看工作区后退回 `pwd && ls -la`，因此没有进入环境准备和自动安装；
- 旧 Windows 安装包 SHA-256 为 `7856AE0D5398270AA7743C854F9DE3D570C8F180DA54CC29C0F195B5ACC6A33C`，只能作为失败复现来源；旧 CI run `33600482928` 不能代替修复候选证据；
- 修复提交改为省略目录条目的空大小字段，并新增中文路径、已有子目录和真实目录读取回归。修复后的开发态、最终打包程序、双平台 CI 和用户复验全部通过，旧失败没有被隐藏或当作成功。

## 最终结论

M13-TU-01 的 18 项验收断言全部通过，P0/P1 为 0，没有未执行的必检项。M13-TU-01、Milestone 13 和 `DE-019` 完成。该结论只覆盖首个真实公开 Skill；附件、通用图片、视频、文档、PPT、更多运行生态、环境员工和多员工协作仍保持未完成。
