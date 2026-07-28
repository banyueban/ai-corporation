# Observability 设计

## 1. 目标

让用户和开发者能够回答：

- 系统现在在做什么；
- 为什么这样决策；
- 花了多少时间、Token 和费用；
- 哪一步失败；
- 是否产生了副作用；
- 怎样恢复。

## 2. 四类信号

### 2.1 Domain Events

面向用户时间线和审计，语义稳定。

### 2.2 Logs

面向诊断。结构化 JSON，包含级别、模块、关联 ID、错误码。

### 2.3 Traces

一次 Task/Run 的调用链：

```text
task.run
├── model.call
├── policy.decision
├── tool.call
└── evaluation
```

v0.1 采用本地 trace 数据结构，可兼容 OpenTelemetry 语义，不要求外部 Collector。

### 2.4 Metrics

- 任务完成/失败；
- 模型调用延迟和错误；
- Tool 调用；
- Token/成本；
- Judge 通过和人工推翻；
- 恢复成功率；
- 队列与并发。

## 3. 关联字段

每条信号尽量包含：

- `corporation_id`
- `task_id`
- `run_id`
- `model_call_id` / `tool_call_id`
- `correlation_id`
- `causation_id`

## 4. 用户时间线

用户可见事件使用自然语言摘要：

```text
10:32 Planner 完成任务计划
10:33 系统分配“编写 PRD”给 Document Executor
10:35 请求写入 docs/PRD.md，等待批准
10:36 用户批准本次写入
10:38 Judge 发现 1 个必需章节缺失
10:40 修订版本通过验收
```

默认隐藏内部 Prompt、Chain-of-thought 和敏感工具参数。

## 5. 决策可解释性

Scheduler、Policy、Evaluation 产生 Decision Record，包含：

- 输入摘要；
- 候选与排除原因；
- 使用的规则/版本；
- 结果；
- 证据引用。

不要求模型暴露隐藏推理，只保存可验证的简短理由。

## 6. 日志级别与保留

- `ERROR`：需处理；
- `WARN`：降级或可恢复异常；
- `INFO`：生命周期；
- `DEBUG`：默认关闭，启用时仍脱敏。

滚动策略按大小和天数。用户可导出诊断包，导出前再次脱敏并预览内容。

## 7. 脱敏

过滤：

- API Key、Bearer Token；
- Provider Header；
- 密码和常见 Secret 格式；
- 用户主目录绝对路径（UI 必需场景除外）；
- 文件内容；
- Prompt 中敏感片段；
- 插件私有配置。

脱敏器在落盘前运行，不依赖事后清理。

## 8. 成本观测

按层级聚合：

- Corporation；
- Task；
- Agent Run；
- Provider/模型；
- Planner/Executor/Judge；
- 模型调用和评价。

估算费用与 Provider 实报费用分别标记。

## 9. 质量观测

- 首次通过率；
- 修订后通过率；
- 失败责任分类；
- 人工审批数量；
- 人工推翻 Judge 比例；
- 无证据评价比例；
- 按能力域的平滑成功率。

指标用于决策辅助，不能自动解除安全限制。

## 10. 诊断包

包含：

- 应用版本、平台、Schema version；
- 脱敏日志；
- 事件摘要；
- 错误与状态快照；
- Provider 类型但不含 Key；
- 可选 Artifact manifest，不默认含内容。

用户在导出前选择范围并预览。

## 11. 接口

```ts
interface Observability {
  event(event: DomainEvent): Promise<void>;
  log(entry: LogEntry): void;
  startSpan(input: SpanInput): Span;
  metric(metric: MetricPoint): void;
  exportDiagnostics(input: DiagnosticExportRequest): Promise<ExportPreview>;
}
```

## 12. 测试重点

- 关联 ID 完整；
- Secret 不落盘；
- 时间线断线补发；
- 成本汇总守恒；
- 日志滚动；
- 诊断包预览；
- DEBUG 模式仍不暴露密钥；
- 大输出不进入事件。

## 13. v0.1 完成标准

- 每个 Task 可追踪到模型、工具、Artifact、评价；
- 用户看得懂当前状态与阻塞；
- 成本和 Token 可按任务汇总；
- 诊断信息默认本地且脱敏；
- 不收集隐藏推理或无必要敏感内容。

