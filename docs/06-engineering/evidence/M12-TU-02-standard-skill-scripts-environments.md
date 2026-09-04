# M12-TU-02 当前验收证据

## 当前结论

M12-TU-02 的标准 Skill 脚本、独立环境、安装批准、真实过程和成果闭环已经通过本地工程检查、Windows 开发态窗口、Windows 最终打包程序、Windows/macOS CI 和用户人工验收。22 项验收断言全部关闭，M12-TU-02 与 Milestone 12 可以标记为“完成”。

## 已通过证据

- 验收候选提交：`66c924fa269be5e6ead878455e4aa885e7fd084c`；
- `pnpm check`：退出码 0；协议 69、Provider 28、Storage 109、Desktop 194、Native Core 9、Workspace FS 11；状态、任务合同、格式、类型、Clippy、Secret scan 通过；
- 失败同例：`pi-skill-resources.spec.ts` 的脚本环境安装与复用流程 1/1 通过，用时 1.1 分钟；
- `pnpm test:e2e`：开发态主流程 9 条通过，5 条按当前产品入口或本地真实 Key 开关明确跳过；技能导入成功与失败、资源、JavaScript、应用自管 Python、Windows 原生脚本、成果和环境复用均通过；
- Windows 本地最终打包程序：6 条员工与 Skill 主流程通过；安装包为 `release/AI Corporation Desktop Setup 0.1.0.exe`，124957679 字节，SHA-256 为 `79F11DB88D04C84532E57F6B466765005488EEDE2A860AEBD7F6FB55FC52F054`；
- GitHub Actions run `32869895594`：Windows x64 7 分 33 秒、macOS Apple Silicon 5 分 41 秒；两边均通过工程检查、开发态真实窗口、应用构建、最终打包程序窗口检查和安装包上传；
- 用户人工验收：2026-08-26，使用当前 Windows 安装包确认导入 `m12-runtime-manual` 后技能列表和新员工选项立即更新；
- 用户人工验收：确认 Python 独立环境计划显示 `colorama==0.4.6`、应用自管且不修改系统 PATH，自动安装后运行脚本并生成内容正确的 `py-result.txt`；
- 用户人工验收：展开过程可见 `environment_prepare`、安装和 `skill_run_script`，没有 API Key 明文；第二次运行没有重复安装，并生成内容正确的 `py-result-reused.txt`。

## 失败与修复证据

- 首次人工验收失败：原本地验收文件夹名与 `SKILL.md` 的 `name` 不一致，软件拒绝后又把原因显示在长页面底部；修复后文件夹同名，导入预览自动进入视野，成功与具体失败原因显示在技能区，并新增开发态与打包版真实导入回归；
- GitHub Actions run `32868410520`：macOS 通过，Windows 在 JavaScript 首次依赖安装后只等待 5 秒即误报失败，未形成完整 Windows 证据；验收测试改为最多等待 60 秒，真实产品超时仍会失败；
- 修复提交 `66c924fa269be5e6ead878455e4aa885e7fd084c` 的本地同例、完整开发态窗口和 run `32869895594` 全部通过，旧失败没有被隐藏或当作成功。

## 最终结论

M12-TU-02 的 22 项验收断言全部通过，P0/P1 为 0，没有未执行的必检项。M12-TU-02 和 Milestone 12 完成。`DE-018` 环境员工、`DE-019` 真实公开 Skill 兼容验收和 `DE-020` 更多脚本生态继续保留，不在本次完成范围内。
