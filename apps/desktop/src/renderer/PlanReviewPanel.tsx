import type {
  PlanReviewSaveVersionRequest,
  PlannerDraftPublic,
} from "@ai-corporation/protocols";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createUuidV7 } from "./uuid-v7";
import {
  formatUiTime,
  internalLabel,
  planValidationFindingLabel,
} from "./ui-labels";

type AcceptanceEdit =
  PlanReviewSaveVersionRequest["tasks"][number]["acceptanceCriteria"][number] & {
    readonly uiId: string;
  };
type TaskEdit = Omit<
  PlanReviewSaveVersionRequest["tasks"][number],
  "acceptanceCriteria"
> & {
  readonly acceptanceCriteria: readonly AcceptanceEdit[];
};
type DependencyEdit = PlanReviewSaveVersionRequest["dependencies"][number] & {
  readonly uiId: string;
};

export function PlanReviewPanel(props: {
  readonly currentPlan: PlannerDraftPublic;
  readonly displayedPlan: PlannerDraftPublic;
  readonly onApprove: (plan: PlannerDraftPublic) => Promise<void>;
  readonly onSaveVersion: (
    request: PlanReviewSaveVersionRequest,
  ) => Promise<void>;
  readonly saving: boolean;
  readonly versions: readonly PlannerDraftPublic[];
}) {
  const [selectedPlanId, setSelectedPlanId] = useState(
    props.currentPlan.planId,
  );
  const [editing, setEditing] = useState(false);
  const [tasks, setTasks] = useState<readonly TaskEdit[]>(() =>
    taskEdits(props.currentPlan),
  );
  const [dependencies, setDependencies] = useState<readonly DependencyEdit[]>(
    () => dependencyEdits(props.currentPlan),
  );

  useEffect(() => {
    setSelectedPlanId(props.currentPlan.planId);
    setEditing(false);
    setTasks(taskEdits(props.currentPlan));
    setDependencies(dependencyEdits(props.currentPlan));
  }, [props.currentPlan]);

  const versions = useMemo(() => {
    const byId = new Map(
      [props.currentPlan, ...props.versions].map((plan) => [plan.planId, plan]),
    );
    return [...byId.values()].sort(
      (left, right) => right.planVersion - left.planVersion,
    );
  }, [props.currentPlan, props.versions]);
  const displayedPlan =
    versions.find(({ planId }) => planId === selectedPlanId) ??
    props.displayedPlan;
  const isCurrent = displayedPlan.planId === props.currentPlan.planId;
  const canEdit =
    isCurrent &&
    ((displayedPlan.status === "VALIDATED" &&
      displayedPlan.validationStatus === "VALID") ||
      (displayedPlan.status === "DRAFT" &&
        displayedPlan.validationStatus === "INVALID"));
  const canApprove =
    isCurrent &&
    displayedPlan.status === "VALIDATED" &&
    displayedPlan.validationStatus === "VALID";

  const startEditing = () => {
    setTasks(taskEdits(props.currentPlan));
    setDependencies(dependencyEdits(props.currentPlan));
    setEditing(true);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!canEdit || tasks.length === 0) return;
    await props.onSaveVersion({
      schemaVersion: "1.0",
      commandId: createUuidV7(),
      corporationId: props.currentPlan.corporationId,
      sourcePlanId: props.currentPlan.planId,
      expectedPlanVersion: props.currentPlan.planVersion,
      tasks: tasks.map(({ acceptanceCriteria, ...task }) => ({
        ...task,
        acceptanceCriteria: acceptanceCriteria.map(({ uiId, ...criterion }) => {
          void uiId;
          return criterion;
        }),
      })),
      dependencies: dependencies.map(({ uiId, ...dependency }) => {
        void uiId;
        return dependency;
      }),
    });
  };

  return (
    <div className="plan-review-layout">
      <aside className="plan-version-panel" aria-label="计划版本">
        <h2>计划版本</h2>
        <div className="plan-version-list">
          {versions.map((version) => (
            <button
              aria-current={version.planId === displayedPlan.planId}
              className="plan-version-button"
              key={version.planId}
              onClick={() => {
                setEditing(false);
                setSelectedPlanId(version.planId);
              }}
              type="button"
            >
              <strong>版本 {version.planVersion}</strong>
              <span>{internalLabel(version.status)}</span>
            </button>
          ))}
        </div>
      </aside>

      <div className="plan-review-content">
        <PlanState plan={displayedPlan} />

        {editing ? (
          <form
            className="plan-edit-form"
            onSubmit={(event) => void save(event)}
          >
            <section className="plan-summary" aria-labelledby="edit-plan-title">
              <h2 id="edit-plan-title">
                编辑计划版本 {displayedPlan.planVersion}
              </h2>
              <p>
                保存会创建全新的计划和任务身份，当前版本将变为只读历史。预算、输入输出、能力和角色不能在这里修改。
              </p>
              {tasks.map((task, taskIndex) => (
                <TaskEditor
                  key={task.sourceTaskId}
                  onChange={(next) =>
                    setTasks((current) =>
                      current.map((item, index) =>
                        index === taskIndex ? next : item,
                      ),
                    )
                  }
                  onDelete={() => {
                    setTasks((current) =>
                      current.filter(
                        ({ sourceTaskId }) =>
                          sourceTaskId !== task.sourceTaskId,
                      ),
                    );
                    setDependencies((current) =>
                      current.filter(
                        (dependency) =>
                          dependency.upstreamSourceTaskId !==
                            task.sourceTaskId &&
                          dependency.downstreamSourceTaskId !==
                            task.sourceTaskId,
                      ),
                    );
                  }}
                  task={task}
                />
              ))}
              {tasks.length === 0 && (
                <p className="field-error" role="alert">
                  计划至少要保留一个任务。
                </p>
              )}
            </section>
            <DependencyEditor
              dependencies={dependencies}
              onChange={setDependencies}
              tasks={tasks}
            />
            <div className="plan-review-actions">
              <button
                className="secondary-button"
                disabled={props.saving}
                onClick={() => setEditing(false)}
                type="button"
              >
                取消编辑
              </button>
              <button
                className="primary-button"
                disabled={props.saving || tasks.length === 0}
                type="submit"
              >
                {props.saving ? "正在保存…" : "保存新版本"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <PlanReadOnly plan={displayedPlan} />
            <div className="plan-review-actions">
              {canEdit && (
                <button
                  className="secondary-button"
                  disabled={props.saving}
                  onClick={startEditing}
                  type="button"
                >
                  编辑计划
                </button>
              )}
              {canApprove && (
                <button
                  className="primary-button"
                  disabled={props.saving}
                  onClick={() => void props.onApprove(props.currentPlan)}
                  type="button"
                >
                  {props.saving ? "正在批准…" : "批准计划"}
                </button>
              )}
            </div>
          </>
        )}
        <p className="plan-boundary-note">
          {displayedPlan.status === "APPROVED"
            ? "该计划已经批准并冻结。软件尚未组建团队，也没有开始执行。"
            : "该计划尚未组队、尚未开始执行。批准计划也不会自动执行。"}
        </p>
      </div>
    </div>
  );
}

function PlanState({ plan }: { readonly plan: PlannerDraftPublic }) {
  if (plan.status === "APPROVED") {
    return (
      <section className="success-card" role="status">
        <h2>计划已批准</h2>
        <p>
          批准时间：
          {plan.approvedAt === undefined
            ? "未知"
            : formatUiTime(plan.approvedAt)}
        </p>
        <p>此版本已经冻结。没有创建团队，也没有开始执行。</p>
      </section>
    );
  }
  if (plan.status === "SUPERSEDED") {
    return (
      <section className="warning-card" role="status">
        <h2>这是只读历史版本</h2>
        <p>该版本已被新版本取代，不能修改或批准。</p>
      </section>
    );
  }
  if (plan.validationStatus === "PENDING") {
    return (
      <section className="warning-card" role="status">
        <h2>正在本地验证计划</h2>
        <p>不会调用模型服务商。验证完成前不能批准。</p>
      </section>
    );
  }
  if (plan.validationStatus === "INVALID") {
    return (
      <section className="error-state" role="alert">
        <div>
          <p className="eyebrow">没有创建正式任务</p>
          <h2>计划验证未通过</h2>
          <p>
            该版本已经保存，重启后仍可继续修改。当前未批准、未组队，也不能执行。
          </p>
          <ul>
            {(plan.validationReport?.issues ?? []).map((finding, index) => (
              <li key={`${finding.code}-${finding.path}-${index}`}>
                {planValidationFindingLabel(finding.code)}（位置：{finding.path}
                ）
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }
  return (
    <section className="success-card" role="status">
      <h2>计划已通过本地验证</h2>
      <p>可以继续修改，也可以批准。当前仍未组队、不能执行。</p>
      {(plan.validationReport?.warnings.length ?? 0) > 0 && (
        <ul>
          {plan.validationReport?.warnings.map((finding, index) => (
            <li key={`${finding.code}-${finding.path}-${index}`}>
              {planValidationFindingLabel(finding.code)}（位置：{finding.path}）
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanReadOnly({ plan }: { readonly plan: PlannerDraftPublic }) {
  return (
    <section className="plan-summary" aria-labelledby="plan-summary-title">
      <h2 id="plan-summary-title">{plan.summary}</h2>
      <p>
        计划版本 {plan.planVersion} · 输入 {plan.usage.inputTokens ?? "?"} /
        输出 {plan.usage.outputTokens ?? "?"} 个 token · 费用：
        {plan.usage.costMicros ?? "未知"}
      </p>
      <div className="plan-task-list">
        {plan.tasks.map((task) => (
          <article className="review-block" key={task.id}>
            <p className="eyebrow">
              {task.localId} · {internalLabel(task.kind)}
            </p>
            <h3>{task.title}</h3>
            <p>{task.objective}</p>
            {task.description !== undefined && <p>{task.description}</p>}
            <p>优先级：{task.priority}</p>
            <p>
              建议角色：<strong>{task.suggestedRole}</strong> · 尚未安排人员
            </p>
            <p>
              能力要求：
              {task.requiredCapabilities.length === 0
                ? "没有填写"
                : task.requiredCapabilities.map(({ path }) => path).join(", ")}
            </p>
            <p>
              预期输出：
              {task.expectedOutputs.length === 0
                ? "没有填写"
                : task.expectedOutputs
                    .map(({ logicalName }) => logicalName)
                    .join(", ")}
            </p>
            <h4>验收标准</h4>
            <ul>
              {task.acceptanceCriteria.map((criterion) => (
                <li key={criterion.localId}>{criterion.description}</li>
              ))}
            </ul>
            <p>
              预算：成本 {task.budget.maxCostMicros ?? "未设置"} 微美元 · 时长{" "}
              {task.budget.maxDurationMs ?? "未设置"} 毫秒 ·{" "}
              {task.retryPolicy.maxEvaluationRevisions} 次修改
            </p>
          </article>
        ))}
      </div>
      <h3>依赖关系</h3>
      {plan.dependencies.length === 0 ? (
        <p>没有任务依赖。</p>
      ) : (
        <ul>
          {plan.dependencies.map((dependency, index) => (
            <li
              key={`${dependency.upstreamLocalId}-${dependency.downstreamLocalId}-${index}`}
            >
              {dependency.upstreamLocalId} → {dependency.downstreamLocalId}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function TaskEditor(props: {
  readonly onChange: (task: TaskEdit) => void;
  readonly onDelete: () => void;
  readonly task: TaskEdit;
}) {
  const update = (patch: Partial<TaskEdit>) =>
    props.onChange({ ...props.task, ...patch });
  return (
    <fieldset className="plan-task-editor">
      <legend>任务编辑</legend>
      <label className="field">
        标题
        <input
          maxLength={500}
          onChange={(event) => update({ title: event.target.value })}
          required
          value={props.task.title}
        />
      </label>
      <label className="field">
        目标
        <textarea
          maxLength={4000}
          onChange={(event) => update({ objective: event.target.value })}
          required
          value={props.task.objective}
        />
      </label>
      <label className="field">
        说明
        <textarea
          maxLength={4000}
          onChange={(event) =>
            update({ description: event.target.value || undefined })
          }
          value={props.task.description ?? ""}
        />
      </label>
      <label className="field">
        优先级（0–100）
        <input
          max={100}
          min={0}
          onChange={(event) => update({ priority: Number(event.target.value) })}
          required
          type="number"
          value={props.task.priority}
        />
      </label>
      <div className="acceptance-editor">
        <h3>验收标准</h3>
        {props.task.acceptanceCriteria.map((criterion, index) => (
          <div className="acceptance-editor-row" key={criterion.uiId}>
            <label className="field">
              内容
              <input
                maxLength={500}
                onChange={(event) =>
                  update({
                    acceptanceCriteria: props.task.acceptanceCriteria.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, description: event.target.value }
                          : item,
                    ),
                  })
                }
                required
                value={criterion.description}
              />
            </label>
            <label className="field">
              级别
              <select
                onChange={(event) =>
                  update({
                    acceptanceCriteria: props.task.acceptanceCriteria.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              severity: event.target.value as
                                "REQUIRED" | "RECOMMENDED",
                            }
                          : item,
                    ),
                  })
                }
                value={criterion.severity}
              >
                <option value="REQUIRED">必须满足</option>
                <option value="RECOMMENDED">建议满足</option>
              </select>
            </label>
            <label className="field">
              所需证据（每行一项）
              <textarea
                onChange={(event) =>
                  update({
                    acceptanceCriteria: props.task.acceptanceCriteria.map(
                      (item, itemIndex) =>
                        itemIndex === index
                          ? {
                              ...item,
                              evidenceRequired: lines(event.target.value),
                            }
                          : item,
                    ),
                  })
                }
                value={criterion.evidenceRequired.join("\n")}
              />
            </label>
            <button
              className="danger-button"
              onClick={() =>
                update({
                  acceptanceCriteria: props.task.acceptanceCriteria.filter(
                    (_, itemIndex) => itemIndex !== index,
                  ),
                })
              }
              type="button"
            >
              删除验收标准
            </button>
          </div>
        ))}
        <button
          className="secondary-button"
          onClick={() =>
            update({
              acceptanceCriteria: [
                ...props.task.acceptanceCriteria,
                {
                  uiId: createUuidV7(),
                  description: "",
                  severity: "REQUIRED",
                  evidenceRequired: [],
                },
              ],
            })
          }
          type="button"
        >
          新增验收标准
        </button>
      </div>
      <button className="danger-button" onClick={props.onDelete} type="button">
        删除此任务
      </button>
    </fieldset>
  );
}

function DependencyEditor(props: {
  readonly dependencies: readonly DependencyEdit[];
  readonly onChange: (dependencies: readonly DependencyEdit[]) => void;
  readonly tasks: readonly TaskEdit[];
}) {
  return (
    <section className="plan-summary" aria-labelledby="dependency-edit-title">
      <h2 id="dependency-edit-title">任务依赖</h2>
      {props.dependencies.map((dependency, index) => (
        <div className="dependency-editor-row" key={dependency.uiId}>
          <label className="field">
            上游任务
            <select
              onChange={(event) =>
                props.onChange(
                  props.dependencies.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, upstreamSourceTaskId: event.target.value }
                      : item,
                  ),
                )
              }
              value={dependency.upstreamSourceTaskId}
            >
              {props.tasks.map((task) => (
                <option key={task.sourceTaskId} value={task.sourceTaskId}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <span aria-hidden="true">→</span>
          <label className="field">
            下游任务
            <select
              onChange={(event) =>
                props.onChange(
                  props.dependencies.map((item, itemIndex) =>
                    itemIndex === index
                      ? { ...item, downstreamSourceTaskId: event.target.value }
                      : item,
                  ),
                )
              }
              value={dependency.downstreamSourceTaskId}
            >
              {props.tasks.map((task) => (
                <option key={task.sourceTaskId} value={task.sourceTaskId}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <button
            className="danger-button"
            onClick={() =>
              props.onChange(
                props.dependencies.filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              )
            }
            type="button"
          >
            删除依赖
          </button>
        </div>
      ))}
      <button
        className="secondary-button"
        disabled={props.tasks.length < 2}
        onClick={() => {
          const upstream = props.tasks[0];
          const downstream = props.tasks[1];
          if (upstream === undefined || downstream === undefined) return;
          props.onChange([
            ...props.dependencies,
            {
              uiId: createUuidV7(),
              upstreamSourceTaskId: upstream.sourceTaskId,
              downstreamSourceTaskId: downstream.sourceTaskId,
              condition: "ON_SUCCESS",
            },
          ]);
        }}
        type="button"
      >
        新增依赖
      </button>
    </section>
  );
}

function taskEdits(plan: PlannerDraftPublic): readonly TaskEdit[] {
  return plan.tasks.map((task) => ({
    sourceTaskId: task.id,
    title: task.title,
    objective: task.objective,
    ...(task.description === undefined
      ? {}
      : { description: task.description }),
    priority: task.priority,
    acceptanceCriteria: task.acceptanceCriteria.map((criterion) => ({
      uiId: `${task.id}-${criterion.localId}`,
      sourceLocalId: criterion.localId,
      description: criterion.description,
      severity: criterion.severity,
      evidenceRequired: criterion.evidenceRequired,
    })),
  }));
}

function dependencyEdits(plan: PlannerDraftPublic): readonly DependencyEdit[] {
  const taskByLocalId = new Map(plan.tasks.map((task) => [task.localId, task]));
  return plan.dependencies.flatMap((dependency, index) => {
    const upstream = taskByLocalId.get(dependency.upstreamLocalId);
    const downstream = taskByLocalId.get(dependency.downstreamLocalId);
    return upstream === undefined || downstream === undefined
      ? []
      : [
          {
            uiId: `${upstream.id}-${downstream.id}-${index}`,
            upstreamSourceTaskId: upstream.id,
            downstreamSourceTaskId: downstream.id,
            condition: dependency.condition,
          },
        ];
  });
}

function lines(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/\r?\n/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}
