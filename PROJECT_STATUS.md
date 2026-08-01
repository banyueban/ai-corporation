# AI Corporation Desktop 项目进度

| 属性 | 当前值 |
|---|---|
| 当前产品版本 | v0.1 MVP |
| 当前阶段 | Milestone 1 已完成，阶段改进已落地 |
| 当前 Milestone | Milestone 1：本地项目骨架（完成） |
| 当前任务单元 | M1-TU-06（完成） |
| 总体状态 | 进行中 |
| 最近更新 | 2026-08-01 |
| 下一检查点 | 建立并审查 Milestone 2 首个任务合同 |

## 1. 当前结论

Milestone 1 的 `M1-TU-01` 至 `M1-TU-06` 已全部完成，Milestone L3 交付物、真实窗口演示、恢复/升级回归、Windows x64 与 macOS Apple Silicon 最终包均已通过，未执行的必检项为 0，已知未解决 P0/P1 为 0。

M1-TU-06 的实现验收提交为 `13ab5a944125eb848596ce90e1e977ae208f3f98`。GitHub Actions run `30695902463` 在该提交上完成双平台工程检查、开发态 Electron E2E、安装包构建、最终包真实窗口 E2E、清理和制品上传；Windows job `91358624310`、macOS job `91358624279` 均成功。

该结论只关闭 Milestone 1 的本地项目骨架，不代表真实 Provider、Plan、Task Graph、Agent/Tool 执行、未知外部副作用恢复、Milestone 2 或公开发布已经完成。

## 2. Milestone 1 实施状态

- [x] Workspace 选择、授权、重新验证、公开展示和持久化恢复；
- [x] Corporation 创建、读取、重命名和归档，不提供删除；
- [x] Goal Contract 手工/本地确定性 Mock、版本保存和确认，不接真实模型或 Task Graph；
- [x] SQLite Workspace、Corporation、Goal、Event 与恢复回执表及 `0001`–`0005` 升级；
- [x] Corporation 状态与 Domain Event 同事务提交及最小时间线；
- [x] 安全暂停、Renderer reload、应用进程重启、SQLite 重开和继续，启动不重复已提交副作用；
- [x] Windows x64 与 macOS Apple Silicon 开发态/最终包真实窗口演示和 artifact 上传。

## 3. L3 关闭映射

| 退出条件 | 当前直接证据 |
|---|---|
| Workspace 选择、权限、重新验证和恢复 | `M1-TU-01` 至 `M1-TU-03` 合同完成；跨平台真实窗口选择、授权、reload 与 restore 回归通过 |
| Corporation CRUD 与事务事件 | `M1-TU-04` 合同完成；状态、版本和 Event 原子写入、幂等、并发与 SQLite 重开测试通过 |
| Goal Contract 与最小时间线 | `M1-TU-05` 合同完成；手工/Mock、版本、确认、冲突、故障恢复和时间线通过 |
| 暂停、应用重启和无重复恢复 | `M1-TU-06` 合同 15 项完成；PAUSED/DRAFT 分别覆盖 reload、进程重启和 SQLite 重开，启动事件/回执计数不变 |
| 完整 Milestone 演示 | run `30695902463` 的开发态与最终包真实窗口完成 Workspace → Corporation → Goal → pause → 应用重启 → restore → resume |
| 安全、平台与回归 | 工作区外路径由 Rust 拒绝；旧迁移/Native Core health/安全 IPC/axe/清理通过；Windows/macOS jobs 均成功；P0/P1 为 0 |

最终包日志记录：`pause · reload · process restart · read-only restore · resume · reload · process restart`。Windows artifact `8817268064`，macOS artifact `8817259466`。

## 4. 阶段复盘改进

本阶段不另建历史复盘文档；经验已直接进入当前规范和自动化：

- `PROJECT_STATUS.md` 只记录当前事实，状态校验器阻止已完成事项错放在“尚未开始”区；
- 验收合同在最终候选提交前展开为“状态 × 恢复机制 × 产物形态 × 平台”的证据矩阵，复合断言不得以单一路径代替；
- 进程存活、构建成功不能代替真实可交互窗口和最终包旅程；
- fixture 验证使用受控任务 ID 格式，测试同时覆盖当前、后续合法和非法前缀，不再硬编码前一任务；
- 键盘/焦点、进程重启、持久化恢复和清理分别验收，除非产品合同要求，不把领域恢复绑定到 OS 焦点恢复；
- 用户指定的 GitHub 仓库不存在时，创建仓库属于初始化流程，不作为停止初始化的默认理由。

## 5. 活跃阻塞与外部条件

当前无产品、架构、验收或仓库同步阻塞。

已知发布条件：

- 系统 PATH 未提供 Node.js；当前工程验证使用 Codex bundled Node.js；
- 应用自身保持 Chromium `sandbox: true`；Electron GUI E2E 在允许启动真实窗口的验收环境执行；
- 应用签名与 macOS notarization 不属于 Milestone 1，但属于公开发布前置条件。

## 6. 当前验证摘要

- M1-TU-01 至 M1-TU-06 合同均为“完成”，合同未勾选项为 0；
- 本地 `pnpm check` 通过：治理、格式、lint、TypeScript、协议 20 项、Storage 61 项、Desktop 60 项、Rust 测试/fmt/clippy 与 secret scan 均通过；
- M1-TU-06 本地开发态和 Windows 最终目录包真实窗口旅程、Native Core health、Mock 网络请求 0、axe 严重/关键违规 0、布局截图人工检查和临时资源清理通过；
- GitHub Actions run `30695902463` 对提交 `13ab5a944125eb848596ce90e1e977ae208f3f98` 的 Windows job `91358624310` 与 macOS job `91358624279` 全部成功；
- 两个平台均通过工程检查、开发态真实窗口、最终包完整重启恢复旅程、清理和 artifact 上传；
- Milestone 1 必需验证未执行项为 0，已知未解决 P0/P1 为 0。

## 7. 下一步

在开始 Milestone 2 实现前，依据 MVP Plan 建立首个任务合同，完成范围、接口、所有权、隔离、风险与证据矩阵审查并达到“就绪”。Milestone 1 的完成不自动授权实施 Milestone 2。

## 8. 更新规则

- 只记录当前事实，不追加时间线或已失效结论；历史变化由 Git 和 CI 保存；
- 功能、任务或 Milestone 只有通过全部适用验收后才能标记“完成”；
- 设计文档存在不等于功能已经实现；
- 当前任务状态必须与对应任务合同一致；
- 任务通过只关闭自身，不自动推动相邻任务或 Milestone；
- 新阻塞只进入“活跃阻塞”，解除后直接删除；
- 每次完成任务后更新当前结论、验证摘要、阻塞和下一步。
