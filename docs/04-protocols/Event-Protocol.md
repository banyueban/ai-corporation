# Event Protocol v1.0

## 1. 目的

Event Protocol 统一状态变化、UI 实时更新、审计和恢复所需的事件格式。v0.1 使用进程内 Event Bus + SQLite 事件表，不引入 Kafka/NATS。

## 2. 事件信封

```ts
type DomainEvent<T> = {
  schemaVersion: "1.0";
  eventId: string;
  eventType: string;
  aggregateType: "CORPORATION" | "TASK" | "AGENT_RUN" | "ARTIFACT" | "EVALUATION" | "TOOL";
  aggregateId: string;
  aggregateVersion: number;
  corporationId: string;
  correlationId: string;
  causationId?: string;
  actor: {
    kind: "USER" | "SYSTEM" | "AGENT";
    id: string;
  };
  occurredAt: string;
  payload: T;
  sensitivity: "NORMAL" | "REDACTED";
};
```

## 3. 写入语义

- 状态变更与事件插入同一 SQLite 事务；
- 事件表 append-only；
- `eventId` 唯一；
- `aggregateVersion` 单调递增；
- 消费者按 event ID 幂等；
- 事件负载保存最小事实，不复制完整 Artifact 或 Prompt。

## 4. 分发

```text
Domain Service
  → SQLite transaction: state + outbox event
  → Event Dispatcher
      → in-process subscribers
      → Electron IPC stream
      → metrics projection
```

v0.1 可将事件表本身作为 outbox。Dispatcher 维护投递游标，UI 重连时按 cursor 补发。

## 5. 事件命名

格式：`<aggregate>.<subject>.<past-tense-action>`

示例：

- `corporation.goal.approved`
- `task.state.changed`
- `agent.run.started`
- `model.call.completed`
- `tool.approval.requested`
- `artifact.version.committed`
- `evaluation.completed`

## 6. UI 订阅

Renderer 请求：

```ts
type EventSubscription = {
  corporationId: string;
  afterCursor?: string;
  eventTypes?: string[];
};
```

Main 返回脱敏事件。Renderer 不可订阅其他未打开工作区的敏感内容。

## 7. 保留与压缩

- 核心审计事件长期保留；
- 高频 token/stream 增量不逐条永久落库，只保存调用摘要；
- UI 可丢弃中间渲染事件，但不可丢状态事件；
- 归档时可生成事件摘要，原始安全审计事件仍保留。

## 8. 错误处理

- 消费者失败不回滚已提交业务事务；
- 重试采用指数退避；
- 无法解析的未知 major 事件进入 dead-letter 表并告警；
- Projection 可从事件游标重建，但业务状态不依赖全量重放。

## 9. 验收

- 状态与事件不出现一方提交、一方缺失；
- UI 重连可补发；
- 重复投递不产生重复副作用；
- 敏感内容被脱敏；
- 事件可关联完整运行链路。

