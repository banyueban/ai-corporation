import type {
  AgentRun,
  AgentRunErrorCode,
  OrganizationActivation,
  OrganizationActivationRequest,
  ExecutionStart,
  OrganizationProposal,
  PlanReviewSaveVersionRequest,
  PlannerDraftPublic,
  ProviderPublic,
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
  readonly agentRun: AgentRun | undefined;
  readonly agentRunError: AgentRunErrorCode | undefined;
  readonly agentRunPending: boolean;
  readonly currentPlan: PlannerDraftPublic;
  readonly displayedPlan: PlannerDraftPublic;
  readonly onApprove: (plan: PlannerDraftPublic) => Promise<void>;
  readonly onCreateOrganization: (plan: PlannerDraftPublic) => Promise<void>;
  readonly onActivateOrganization: (
    request: OrganizationActivationRequest,
  ) => Promise<void>;
  readonly onSaveVersion: (
    request: PlanReviewSaveVersionRequest,
  ) => Promise<void>;
  readonly saving: boolean;
  readonly executionStart: ExecutionStart | undefined;
  readonly onStartExecution: () => Promise<void>;
  readonly onCancelAgentRun: () => Promise<void>;
  readonly onContinueAgentRun: () => Promise<void>;
  readonly onRetryAgentRun: () => Promise<void>;
  readonly organizationProposal: OrganizationProposal | undefined;
  readonly organizationActivation: OrganizationActivation | undefined;
  readonly providers: readonly ProviderPublic[];
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
        <PlanState
          executionStart={isCurrent ? props.executionStart : undefined}
          organizationProposal={
            isCurrent ? props.organizationProposal : undefined
          }
          organizationActivation={
            isCurrent ? props.organizationActivation : undefined
          }
          plan={displayedPlan}
        />

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
              {isCurrent &&
                displayedPlan.status === "APPROVED" &&
                props.organizationActivation === undefined && (
                  <button
                    className="primary-button"
                    disabled={props.saving}
                    onClick={() =>
                      void props.onCreateOrganization(props.currentPlan)
                    }
                    type="button"
                  >
                    {props.saving
                      ? "正在生成团队草案…"
                      : props.organizationProposal === undefined
                        ? "开始组队"
                        : "重新生成团队草案"}
                  </button>
                )}
            </div>
            {isCurrent && props.organizationProposal !== undefined && (
              <OrganizationProposalView
                activation={props.organizationActivation}
                agentRun={props.agentRun}
                agentRunError={props.agentRunError}
                agentRunPending={props.agentRunPending}
                executionStart={props.executionStart}
                onActivate={props.onActivateOrganization}
                onStartExecution={props.onStartExecution}
                onCancelAgentRun={props.onCancelAgentRun}
                onContinueAgentRun={props.onContinueAgentRun}
                onRetryAgentRun={props.onRetryAgentRun}
                proposal={props.organizationProposal}
                plan={props.currentPlan}
                providers={props.providers}
                saving={props.saving}
              />
            )}
          </>
        )}
        <p className="plan-boundary-note">
          {displayedPlan.status === "APPROVED" &&
          isCurrent &&
          props.organizationProposal !== undefined
            ? props.organizationActivation === undefined
              ? "该计划已经批准并冻结。团队草案已生成但尚未激活，也没有开始执行。"
              : props.executionStart === undefined
                ? "团队已激活，等待开始执行。当前没有运行任务。"
                : props.executionStart.corporationStatus === "WAITING_HUMAN"
                  ? "公司正在等待你的决定，当前没有运行模型任务。"
                  : "执行已经开始，首个运行记录已创建但尚未调用模型。"
            : displayedPlan.status === "APPROVED"
              ? "该计划已经批准并冻结。软件尚未组建团队，也没有开始执行。"
              : "该计划尚未组队、尚未开始执行。批准计划也不会自动执行。"}
        </p>
      </div>
    </div>
  );
}

function OrganizationProposalView(props: {
  readonly activation: OrganizationActivation | undefined;
  readonly agentRun: AgentRun | undefined;
  readonly agentRunError: AgentRunErrorCode | undefined;
  readonly agentRunPending: boolean;
  readonly executionStart: ExecutionStart | undefined;
  readonly onActivate: (
    request: OrganizationActivationRequest,
  ) => Promise<void>;
  readonly onStartExecution: () => Promise<void>;
  readonly onCancelAgentRun: () => Promise<void>;
  readonly onContinueAgentRun: () => Promise<void>;
  readonly onRetryAgentRun: () => Promise<void>;
  readonly proposal: OrganizationProposal;
  readonly plan: PlannerDraftPublic;
  readonly providers: readonly ProviderPublic[];
  readonly saving: boolean;
}) {
  const taskNames = new Map(
    props.plan.tasks.map((task) => [task.id, task.title]),
  );
  const memberNames = new Map(
    props.proposal.members.map((member) => [
      member.memberId,
      member.displayName,
    ]),
  );
  return (
    <section
      className="plan-summary"
      aria-labelledby="organization-proposal-title"
    >
      <p className="eyebrow">
        团队草案 v{props.proposal.version} · 模板{" "}
        {props.proposal.templateSetVersion}
      </p>
      <h2 id="organization-proposal-title">团队草案</h2>
      <p>
        这是本地固定规则生成的草案，没有调用模型，也没有选择准确的模型服务商或模型。
      </p>
      <div className="plan-task-list">
        {props.proposal.members.map((member) => (
          <article className="review-block" key={member.memberId}>
            <p className="eyebrow">{roleLabel(member.role)}</p>
            <h3>{member.displayName}</h3>
            <p>
              模板：{member.templateId} v{member.templateVersion}
            </p>
            <p>模型策略：{modelStrategyLabel(member.modelStrategy)}</p>
            <p>能力：{member.capabilities.join("、")}</p>
          </article>
        ))}
      </div>
      <h3>任务分工</h3>
      <ul>
        {props.proposal.assignments.map((assignment) => (
          <li key={assignment.taskId}>
            <strong>
              {taskNames.get(assignment.taskId) ?? assignment.taskId}
            </strong>
            ：
            {assignment.ownerType === "HUMAN"
              ? "用户"
              : memberNames.get(assignment.ownerId)}
            。{assignment.reason}
          </li>
        ))}
      </ul>
      <h3>职责分离</h3>
      <p>
        {props.proposal.separationConstraints.length === 0
          ? "没有机器执行任务；独立验收员仍保留在草案中。"
          : `已确认 ${props.proposal.separationConstraints.length} 个 Executor 与独立验收员不是同一成员。`}
      </p>
      <h3>能力缺口</h3>
      {props.proposal.capabilityGaps.length === 0 ? (
        <p>没有发现能力缺口。</p>
      ) : (
        <ul>
          {props.proposal.capabilityGaps.map((gap) => (
            <li key={gap.capability}>
              <strong>{gap.capability}</strong>：{gap.reason} 影响任务：
              {gap.taskIds.map((id) => taskNames.get(id) ?? id).join("、")}
            </li>
          ))}
        </ul>
      )}
      <p className="plan-boundary-note">
        {props.activation === undefined
          ? "团队草案尚未激活，不会开始执行。公司状态仍为草稿。"
          : props.executionStart === undefined
            ? "团队已激活，等待开始执行。公司状态仍为草稿，当前没有运行任务。"
            : props.executionStart.corporationStatus === "WAITING_HUMAN"
              ? "公司正在等待你的决定，当前没有运行模型任务。"
              : "公司已经进入执行状态，首个运行记录已创建但尚未调用模型。"}
      </p>
      {props.activation === undefined ? (
        <OrganizationActivationForm
          onActivate={props.onActivate}
          proposal={props.proposal}
          providers={props.providers}
          saving={props.saving}
        />
      ) : (
        <>
          <OrganizationActivationView
            activation={props.activation}
            providers={props.providers}
          />
          {props.executionStart === undefined ? (
            <button
              className="primary-button"
              disabled={props.saving}
              onClick={() => void props.onStartExecution()}
              type="button"
            >
              {props.saving ? "正在开始执行…" : "开始执行"}
            </button>
          ) : (
            <ExecutionStartView
              agentRun={props.agentRun}
              error={props.agentRunError}
              onCancel={props.onCancelAgentRun}
              onContinue={props.onContinueAgentRun}
              onRetry={props.onRetryAgentRun}
              pending={props.agentRunPending}
              result={props.executionStart}
            />
          )}
        </>
      )}
    </section>
  );
}

function roleLabel(
  role: OrganizationProposal["members"][number]["role"],
): string {
  return role === "PLANNER"
    ? "规划负责人"
    : role === "JUDGE"
      ? "独立验收员"
      : "执行员";
}

function modelStrategyLabel(
  strategy: OrganizationProposal["members"][number]["modelStrategy"],
): string {
  return strategy === "HIGH_REASONING"
    ? "高推理"
    : strategy === "LOW_COST"
      ? "低成本"
      : "均衡";
}

type RoleRouteInput = OrganizationActivationRequest["routes"]["planner"];

function OrganizationActivationForm(props: {
  readonly onActivate: (
    request: OrganizationActivationRequest,
  ) => Promise<void>;
  readonly proposal: OrganizationProposal;
  readonly providers: readonly ProviderPublic[];
  readonly saving: boolean;
}) {
  const available = props.providers.filter(
    (provider) =>
      provider.configStatus === "ENABLED" &&
      provider.hasKey &&
      provider.connectionTest?.status === "VERIFIED" &&
      provider.connectionTest.models.length > 0,
  );
  const emptyRoute = (): RoleRouteInput => ({
    providerId: "",
    providerVersion: 1,
    modelId: "",
  });
  const [routes, setRoutes] = useState({
    planner: emptyRoute(),
    executor: emptyRoute(),
    judge: emptyRoute(),
  });
  const [acceptDegraded, setAcceptDegraded] = useState(false);
  const blocking = props.proposal.capabilityGaps.some(
    ({ severity }) => severity === "BLOCKING",
  );
  const degraded = props.proposal.capabilityGaps.some(
    ({ severity }) => severity === "DEGRADED",
  );
  const complete = Object.values(routes).every(
    ({ providerId, modelId }) => providerId.length > 0 && modelId.length > 0,
  );
  const updateProvider = (role: keyof typeof routes, providerId: string) => {
    const provider = available.find(({ id }) => id === providerId);
    setRoutes((current) => ({
      ...current,
      [role]:
        provider === undefined
          ? emptyRoute()
          : {
              providerId: provider.id,
              providerVersion: provider.version,
              modelId: "",
            },
    }));
  };
  const updateModel = (role: keyof typeof routes, modelId: string) =>
    setRoutes((current) => ({
      ...current,
      [role]: { ...current[role], modelId },
    }));
  if (blocking)
    return (
      <p className="field-error" role="alert">
        当前团队存在阻断能力缺口，不能激活。请先返回并调整计划。
      </p>
    );
  return (
    <section
      className="review-block"
      aria-labelledby="team-configuration-title"
    >
      <h3 id="team-configuration-title">配置并确认团队</h3>
      <p>分别选择三组运行模型。确认只激活团队，不调用模型，也不开始执行。</p>
      {available.length === 0 && (
        <p className="field-error" role="alert">
          没有可用的模型服务商。请先启用服务商、保存 API Key 并完成连接测试。
        </p>
      )}
      {(["planner", "executor", "judge"] as const).map((role) => {
        const provider = available.find(
          ({ id }) => id === routes[role].providerId,
        );
        return (
          <div className="organization-route-row" key={role}>
            <strong>
              {role === "planner"
                ? "规划负责人"
                : role === "executor"
                  ? "全部执行人员"
                  : "验收负责人"}
            </strong>
            <label className="field">
              模型服务商
              <select
                disabled={props.saving}
                onChange={(event) => updateProvider(role, event.target.value)}
                value={routes[role].providerId}
              >
                <option value="">请选择</option>
                {available.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              精确模型
              <select
                disabled={props.saving || provider === undefined}
                onChange={(event) => updateModel(role, event.target.value)}
                value={routes[role].modelId}
              >
                <option value="">请选择</option>
                {provider?.connectionTest?.status === "VERIFIED" &&
                  provider.connectionTest.models.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.displayName}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        );
      })}
      {degraded && (
        <label className="checkbox-row">
          <input
            checked={acceptDegraded}
            disabled={props.saving}
            onChange={(event) => setAcceptDegraded(event.target.checked)}
            type="checkbox"
          />
          我接受上方列出的可降级能力缺口及其影响
        </label>
      )}
      <button
        className="primary-button"
        disabled={props.saving || !complete || (degraded && !acceptDegraded)}
        onClick={() =>
          void props.onActivate({
            schemaVersion: "1.0",
            commandId: createUuidV7(),
            corporationId: props.proposal.corporationId,
            organizationId: props.proposal.organizationId,
            expectedOrganizationVersion: props.proposal.version,
            routes,
            acceptDegradedGaps: degraded && acceptDegraded,
          })
        }
        type="button"
      >
        {props.saving ? "正在确认团队…" : "确认团队"}
      </button>
    </section>
  );
}

function OrganizationActivationView(props: {
  readonly activation: OrganizationActivation;
  readonly providers: readonly ProviderPublic[];
}) {
  const providerName = (id: string) =>
    props.providers.find((provider) => provider.id === id)?.name ??
    "已保存的模型服务商";
  return (
    <section className="success-card" aria-labelledby="active-team-title">
      <h3 id="active-team-title">团队已激活，等待开始执行</h3>
      <ul>
        <li>
          规划负责人：{providerName(props.activation.routes.planner.providerId)}{" "}
          · {props.activation.routes.planner.modelId}
        </li>
        <li>
          全部执行人员：
          {providerName(props.activation.routes.executor.providerId)} ·{" "}
          {props.activation.routes.executor.modelId}
        </li>
        <li>
          验收负责人：{providerName(props.activation.routes.judge.providerId)} ·{" "}
          {props.activation.routes.judge.modelId}
        </li>
      </ul>
      <p>
        已创建 {props.activation.agents.length}{" "}
        个团队成员。没有创建运行记录，没有调用模型，也没有开始任务。
      </p>
    </section>
  );
}

function ExecutionStartView(props: {
  readonly agentRun: AgentRun | undefined;
  readonly error: AgentRunErrorCode | undefined;
  readonly onCancel: () => Promise<void>;
  readonly onContinue: () => Promise<void>;
  readonly onRetry: () => Promise<void>;
  readonly pending: boolean;
  readonly result: ExecutionStart;
}) {
  const run = props.agentRun;
  return (
    <section className="success-card" aria-labelledby="execution-start-title">
      <h3 id="execution-start-title">
        {props.result.corporationStatus === "WAITING_HUMAN"
          ? "等待你的决定"
          : "执行已开始"}
      </h3>
      <p>
        首个任务：<strong>{props.result.selectedTaskTitle}</strong>
      </p>
      <p>
        {props.result.run === undefined
          ? "这是人工决定任务，没有创建运行记录，也没有调用模型。"
          : run === undefined || run.status === "CREATED"
            ? "已经创建首个运行记录，等待你继续执行。"
            : `当前状态：${internalLabel(run.status)}，第 ${run.attempt} 次尝试。`}
      </p>
      {props.error !== undefined && (
        <p className="field-error" role="alert">
          运行操作失败（{props.error}）。软件没有把它标记为成功。
        </p>
      )}
      {run !== undefined && run.status === "CREATED" && (
        <button
          className="primary-button"
          disabled={props.pending}
          onClick={() => void props.onContinue()}
          type="button"
        >
          {props.pending ? "正在运行…" : "继续执行"}
        </button>
      )}
      {run !== undefined &&
        ["PREPARING", "READY", "RUNNING"].includes(run.status) && (
          <button
            className="secondary-button"
            onClick={() => void props.onCancel()}
            type="button"
          >
            取消运行
          </button>
        )}
      {run !== undefined && ["FAILED", "CANCELLED"].includes(run.status) && (
        <button
          className="primary-button"
          disabled={props.pending}
          onClick={() => void props.onRetry()}
          type="button"
        >
          {props.pending ? "正在重新尝试…" : "重新尝试"}
        </button>
      )}
      {run?.failureReason !== undefined && <p>失败原因：{run.failureReason}</p>}
      {run !== undefined && run.outputs.length > 0 && (
        <section
          className="review-block"
          aria-labelledby="candidate-output-title"
        >
          <h4 id="candidate-output-title">模型候选内容</h4>
          <p>
            <strong>尚未成为正式交付物。</strong>{" "}
            后续还要保存为正式交付物并验收。
          </p>
          {run.summary !== undefined && <p>{run.summary}</p>}
          {run.outputs.map((output) => (
            <article key={output.candidateId}>
              <h5>{output.logicalName}</h5>
              <p>
                {output.artifactType} · {output.mediaType}
              </p>
              <pre className="candidate-content">{output.content}</pre>
            </article>
          ))}
          <p>
            输入 token：{run.usage.inputTokens ?? "未知"}；输出 token：
            {run.usage.outputTokens ?? "未知"}
          </p>
        </section>
      )}
      <ul>
        {props.result.tasks.map((task) => (
          <li key={task.taskId}>
            {task.title}：{internalLabel(task.status)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function PlanState(props: {
  readonly executionStart: ExecutionStart | undefined;
  readonly organizationActivation: OrganizationActivation | undefined;
  readonly organizationProposal: OrganizationProposal | undefined;
  readonly plan: PlannerDraftPublic;
}) {
  const { plan } = props;
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
        <p>
          {props.organizationProposal === undefined
            ? "此版本已经冻结。没有创建团队，也没有开始执行。"
            : props.organizationActivation === undefined
              ? "此版本已经冻结。团队草案已生成但尚未激活，也没有开始执行。"
              : props.executionStart === undefined
                ? "此版本已经冻结。团队已激活，等待开始执行。"
                : props.executionStart.corporationStatus === "WAITING_HUMAN"
                  ? "此版本已经冻结。公司正在等待你的决定。"
                  : "此版本已经冻结。执行已经开始。"}
        </p>
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
