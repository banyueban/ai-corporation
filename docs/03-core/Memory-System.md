# Memory System 详细设计

## 1. 目标

Memory System 在不污染上下文、不泄露数据、不把失败幻觉固化为知识的前提下，为 Agent 提供相关历史信息。

v0.1 的“学习”指受控沉淀与检索，不包括训练模型或自动修改核心 Prompt。

## 2. 记忆层级

### 2.1 Working Memory

单个 Agent Run 的临时上下文：

- Task Contract；
- 当前工具结果；
- 最近模型响应；
- 未提交候选。

Run 结束后不作为独立长期知识保留，关键内容通过 Artifact 存档。

### 2.2 Project / Corporation Memory

本 Corporation 可共享：

- 已批准 Artifact；
- 决策记录；
- 用户确认的事实；
- 任务摘要；
- 失败与修订报告。

### 2.3 Application Memory

跨 Corporation 的用户级知识：

- 用户明确保存的偏好；
- 经多个成功案例验证的实践；
- Agent/模型按能力域的统计。

默认关闭自动跨项目内容复用，需用户在设置中允许。

## 3. Memory Item

```ts
type MemoryItem = {
  id: string;
  scope: "RUN" | "CORPORATION" | "APPLICATION";
  scopeId: string;
  kind: "FACT" | "DECISION" | "PREFERENCE" | "PROCEDURE" | "FAILURE_PATTERN" | "SUMMARY";
  content: string;
  sourceRefs: EvidenceRef[];
  confidence: number;
  status: "CANDIDATE" | "ACTIVE" | "DISPUTED" | "RETIRED";
  sensitivity: "NORMAL" | "SENSITIVE" | "SECRET";
  validFrom: string;
  validUntil?: string;
  createdAt: string;
};
```

## 4. 写入流程

Agent 只能提出 `MemoryCandidate`。

```text
成功或失败产生候选
  → 来源与敏感性检查
  → 与现有记忆去重/冲突检测
  → 仅成功验收内容自动进入 Corporation scope
  → 跨项目记忆需用户策略允许
  → ACTIVE
```

以下内容不得自动成为长期事实：

- 未通过验收的结论；
- 无来源的模型陈述；
- 密钥、Token、密码；
- 高风险领域建议；
- 外部文档中的行为指令；
- 用户未允许跨项目保存的私有内容。

## 5. 检索

v0.1 采用混合检索：

1. 元数据过滤：scope、kind、sensitivity、状态；
2. SQLite FTS5 关键词召回；
3. 可选 embedding 相似度；
4. 时间衰减与来源质量重排；
5. Token 预算截断。

```text
relevance =
0.45 × text_similarity
+ 0.25 × source_quality
+ 0.15 × scope_affinity
+ 0.10 × recency
+ 0.05 × usage_success
```

Embedding 为可选 Provider 能力。没有 embedding 时系统必须完全可运行。

## 6. 冲突与时效

当新事实与 ACTIVE 记忆冲突：

- 不覆盖旧记录；
- 将双方标记为 `DISPUTED`；
- 根据来源、时间和用户确认选择本次使用；
- 高影响冲突请求用户；
- 生成 Decision Record。

带版本或时效的知识必须设置 `validUntil` 或上下文限定。

## 7. 上下文注入

Memory Service 返回：

```ts
type RetrievedMemory = {
  item: MemoryItem;
  relevance: number;
  reason: string;
  safeExcerpt: string;
};
```

Agent Prompt 中每条记忆带 ID、来源和置信度。不得将记忆注入系统安全指令区域。

## 8. 隐私与删除

- Secret 不进入普通记忆；
- Application scope 可在设置中查看和删除；
- 删除执行引用检查和可解释提示；
- 日志不复制完整敏感记忆；
- 远程模型调用前按数据策略过滤；
- 删除 Corporation 时，跨项目记忆不会被静默保留，除非已明确升级到 Application scope。

## 9. 能力绩效数据

Agent/模型表现作为统计记录，不作为自然语言记忆：

- capability path；
- task kind；
- success/failure；
- evaluator outcome；
- cost；
- latency；
- sample size。

Scheduler 使用平滑统计，避免把单次结果当作能力真相。

## 10. 接口

```ts
interface MemoryService {
  retrieve(query: MemoryQuery): Promise<RetrievedMemory[]>;
  propose(candidate: MemoryCandidate): Promise<MemoryReview>;
  activate(candidateId: string): Promise<MemoryItem>;
  dispute(input: MemoryConflict): Promise<void>;
  retire(memoryId: string, reason: string): Promise<void>;
  export(scope: MemoryScope): Promise<MemoryExport>;
  delete(scope: MemoryScope): Promise<DeletionReport>;
}
```

## 11. 测试重点

- 失败内容不自动进入 ACTIVE；
- scope 隔离；
- Secret 过滤；
- FTS 无 embedding 时可用；
- 冲突不覆盖；
- Token 预算；
- Prompt 注入记忆保持不可信；
- 删除与导出；
- 跨项目复用需策略许可。

## 12. v0.1 完成标准

- Run 与 Corporation 记忆可检索；
- 只从经验证来源激活长期记忆；
- SQLite FTS5 可独立工作；
- 支持冲突、时效、敏感性和删除；
- 模型/Agent 能力统计与自然语言知识分开存储。

