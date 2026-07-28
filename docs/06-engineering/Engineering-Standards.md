# 工程与编码规范

## 1. 总则

- 正确性和安全优先于抽象优雅；
- 领域状态只能通过领域服务/状态机改变；
- 所有外部输入必须运行时验证；
- 不把模型输出当作可信代码或权限；
- 不在 UI、日志和错误中泄露秘密；
- 跨平台差异封装在适配器。

## 2. TypeScript

- `strict: true`；
- 禁止无理由 `any`；
- 外部边界使用 Schema 解析后再进入领域层；
- 使用 discriminated union 表达状态与结果；
- 错误使用结构化类型，不靠字符串匹配；
- async 操作接受 `AbortSignal`；
- 金额不使用浮点；
- 时间由 Clock 接口注入；
- UUID 由 IdGenerator 接口注入，便于测试。

## 3. Rust

- stable toolchain；
- `cargo fmt`、`clippy -D warnings`；
- 禁止在请求路径 `unwrap/expect`；
- 路径使用 `Path/PathBuf`，不字符串拼接；
- 子进程使用 executable + args；
- 平台 `unsafe` 代码集中、注释安全不变量并单测；
- 错误映射为版本化 RPC Error；
- 日志不得打印凭据或文件内容。

## 4. 模块边界

- Domain 不依赖 Electron、SQLite、Provider SDK；
- Application 依赖 Domain 接口；
- Infrastructure 实现接口；
- Renderer 只依赖公开 DTO；
- Native Core 不理解 Corporation 业务，只执行受限系统动作；
- 循环依赖在 CI 中检测。

## 5. 协议与 Schema

- Schema 是跨进程合同；
- 变更 Schema 必须更新示例、类型和兼容测试；
- 同 major 只新增可选字段；
- 每个持久化 JSON 带 schema version；
- IPC/RPC 不发送类实例；
- 大内容用引用传递。

## 6. 数据库

- 每个迁移不可修改；
- Repository 不返回 SQLite 原始行；
- 外键始终启用；
- 状态 + 事件同事务；
- 模型/工具调用不在数据库事务内；
- 使用参数化 SQL；
- 查询计划在关键路径检查；
- 金额账本 append-only。

## 7. 状态机

- 状态迁移有明确命令和原因码；
- 非法迁移返回领域错误；
- 状态迁移测试覆盖完整矩阵；
- 不在多个模块分别复制状态逻辑；
- 取消、暂停、恢复是正常状态，不作为通用异常。

## 8. Prompt 与模型

- Prompt 模板版本化，不散落硬编码；
- 输出优先 JSON Schema；
- Prompt 中区分可信规则与不可信内容；
- 不保存或展示隐藏推理；
- 失败修复有次数上限；
- 测试使用 Mock Provider，真实模型测试独立标记；
- 模型名称不写进 Task Contract。

## 9. 工具

- Tool 输入 Schema；
- Tool 描述副作用；
- 每次调用经过 Policy；
- 命令禁止 shell 字符串；
- 文件写入走 Change Set；
- 调用有 idempotency key；
- 输出有限，完整内容 Artifact 化。

## 10. UI

- 状态由后端事实驱动，不猜测；
- 危险审批展示精确对象和副作用；
- 错误提供下一步；
- 长列表虚拟化；
- 无障碍：键盘、焦点、颜色对比；
- 不用动画掩盖未知进度；
- “AI 正在思考”不等于任务进度。

## 11. 日志

结构化字段：

```json
{
  "level": "INFO",
  "module": "task-engine",
  "code": "TASK_STATE_CHANGED",
  "correlationId": "...",
  "taskId": "...",
  "message": "Task entered VERIFYING"
}
```

禁止：

- Key/Header；
- 完整 Prompt；
- 完整文件内容；
- 未脱敏绝对路径；
- Chain-of-thought。

## 12. Git 与 Review

- 小步提交；
- PR 说明用户影响、风险、测试；
- Schema、migration、安全策略需指定 Reviewer；
- 禁止提交真实 Key 与生产用户数据；
- 生成文件明确标记；
- 重大决策更新 Decision Records。

## 13. CI 门禁

- format；
- lint/clippy；
- typecheck；
- unit/integration；
- migration test；
- dependency/license scan；
- secret scan；
- Electron security test；
- Windows/macOS build；
- 关键 E2E。

## 14. Definition of Done

功能只有在正常、错误、取消、恢复和安全边界均有验证后才完成。

