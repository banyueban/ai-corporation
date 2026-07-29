# 测试方案

## 1. 目标

验证系统不仅“能跑通一次”，还应在模型不稳定、用户取消、应用崩溃、路径攻击和 Provider 故障时保持安全与一致。

## 2. 测试金字塔

### 2.1 单元测试

重点：

- 状态机；
- DAG 验证；
- Scheduler 评分；
- Policy 规则；
- 预算账本；
- Schema；
- 错误归一化；
- 路径规则纯函数。

不调用真实模型或文件系统。

### 2.2 组件测试

- SQLite Repository；
- Artifact Store；
- Provider Adapter（Mock HTTP）；
- Tool Runtime（临时工作区）；
- Rust RPC；
- Event Dispatcher；
- Memory FTS。

### 2.3 集成测试

- Goal → Plan；
- Ready → Run → Artifact → Evaluation；
- Approval → Tool → Commit；
- Provider failure → fallback；
- crash checkpoint → recover；
- migration → open；
- Renderer/Main IPC。

### 2.4 E2E

Playwright Electron：

- 构建前的开发态应用 E2E；
- 构建后的最终打包产物启动、窗口可见与 Native Core health E2E；
- 首次配置；
- 创建 Corporation；
- 审阅计划；
- 审批文件写入；
- 查看验收与交付；
- 暂停/恢复；
- 重启恢复。

用户界面实现后，还必须覆盖 [UI 专项验收标准](../07-ui/UI-Acceptance.md)中与当前 Milestone 对应的 UI-AC 场景，并验证键盘、焦点、1024 × 700、1440 × 900、200% 缩放以及安全关键审批信息。

开发态与打包产物测试是两个独立门禁。安装包生成成功、应用进程短暂存活或开发态
窗口可用，均不能替代最终打包产物的窗口和关键运行时状态验证。

### 2.5 安全测试

见 Threat Model，至少覆盖：

- 路径穿越；
- symlink/junction；
- 命令参数注入；
- Prompt injection；
- 恶意 Artifact；
- IPC 越权；
- Secret 泄漏；
- 插件 Zip Slip；
- 重放审批。

## 3. 模型测试策略

### 3.1 Deterministic Mock Provider

按 fixture 返回：

- 正常结构化输出；
- 非法 JSON；
- Tool Call；
- 限流；
- 超时；
- 流中断；
- usage 缺失；
- 内容过滤。

CI 主要依赖 Mock，保证稳定。

### 3.2 Recorded Contract Test

对 Provider 协议使用去敏录制响应，验证解析兼容。

### 3.3 Live Smoke

使用测试凭据、手动或受控 CI：

- 不作为普通 PR 必需；
- 限定费用；
- 不上传真实项目；
- 验证模型列表、生成、Tool Call、Schema、取消。

### 3.4 质量基准

建立 20–50 个限定任务集，记录：

- Plan 合法率；
- 首次 Artifact 通过率；
- 修订后通过率；
- 成本；
- 延迟；
- Judge 与人工一致率。

基准用于回归，不追求虚假的通用能力分数。

## 4. 状态与故障注入

在以下点注入崩溃：

- 状态更新前/后；
- 模型调用后、响应保存前；
- Tool 开始后、结果保存前；
- 文件临时写入后、重命名前；
- Artifact 文件提交后、DB 事务前；
- Evaluation 完成前；
- 预算 reservation 后。

验证恢复状态、幂等与人工升级。

## 5. 跨平台矩阵

| 场景 | Windows | macOS |
|---|---:|---:|
| 安装/启动/卸载 | 必测 | 必测 |
| 路径与符号链接 | 必测 | 必测 |
| 安全存储 | 必测 | 必测 |
| 进程组终止 | 必测 | 必测 |
| 文件原子替换 | 必测 | 必测 |
| 睡眠/唤醒 | 必测 | 必测 |
| 自动更新 | 发布前 | 发布前 |

Apple Silicon 必测；Intel 根据发布目标测试。

## 6. 数据库测试

- 从空库迁移；
- 从每个发布版本升级；
- 中断迁移恢复；
- foreign key check；
- WAL 下并发读写；
- 乐观锁；
- Ready Task 索引；
- 备份恢复；
- Artifact 哈希一致。

## 7. Property / Model-based 测试

适用：

- 随机 Task DAG 必须正确判环；
- 任意状态命令序列不能到非法状态；
- Budget Ledger 汇总守恒；
- 路径规范化结果永不越界；
- 事件聚合版本单调；
- Artifact 版本不可覆盖。

## 8. 性能测试

- 10,000 事件时间线；
- 1,000 Task（虽超 v0.1 正常范围，用于稳定性）；
- 100MB Tool 输出截断；
- 10,000 Memory FTS；
- SQLite 冷/热查询；
- 启动时间；
- Renderer 内存；
- Sidecar 长运行。

## 9. 产品验收测试

对应 PRD：

- AC-01 文档闭环；
- AC-02 权限阻断；
- AC-03 恢复；
- AC-04 质量修订。

每项保存运行报告和证据。

## 10. 缺陷级别

- P0：未授权副作用、数据损坏、密钥泄漏；
- P1：核心闭环不可完成、恢复重复副作用；
- P2：功能降级但有替代；
- P3：体验或低影响问题。

P0/P1 阻止发布。

## 11. 测试数据

- 使用合成工作区；
- 不提交真实 Key；
- Fixture 中 Secret 使用明显假值；
- Windows/macOS 路径分别覆盖；
- 恶意文件有清晰隔离和说明；
- 测试结束只清理已验证的临时目录。

## 12. 发布报告

包含：

- 版本与 commit；
- 平台矩阵；
- 测试数量与结果；
- 产品验收证据；
- 安全测试；
- 已知缺陷；
- 模型 live smoke 日期与 Provider；
- 是否满足发布门槛。
