import type {
  CorporationPublic,
  CorporationErrorCode,
  GoalContractContentInput,
  GoalContractErrorCode,
  GoalContractPublic,
  GoalEngineErrorCode,
  GoalEngineOperationPublic,
  ExecutionStart,
  ExecutionStartErrorCode,
  HealthResult,
  OrganizationActivation,
  OrganizationActivationErrorCode,
  OrganizationActivationRequest,
  OrganizationProposal,
  OrganizationProposalErrorCode,
  PlanReviewFailure,
  PlanReviewSaveVersionRequest,
  PlannerDraftPublic,
  PlannerErrorCode,
  PlannerOperationPublic,
  ProviderPublic,
  TimelineEventPublic,
  WorkspaceIpcErrorCode,
  WorkspacePublic,
} from "@ai-corporation/protocols";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type RefObject,
} from "react";
import {
  presentWorkspace,
  replaceWorkspace,
  workspaceErrorMessage,
} from "./workspace-view-model";
import { ProviderSettings } from "./ProviderSettings";
import { PlanReviewPanel } from "./PlanReviewPanel";
import { formatUiTime, internalLabel, timelineLabel } from "./ui-labels";
import { createUuidV7 } from "./uuid-v7";

type NativeCoreState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: HealthResult }
  | { readonly status: "degraded" };
type Route = "dashboard" | "create" | "review" | "planner" | "settings";
type CorporationSummary = {
  readonly corporation: CorporationPublic;
  readonly goal: GoalContractPublic | null;
};

const emptyContent = {
  corporationName: "",
  goal: "",
  successCriteria: "",
  deliverables: "",
  constraints: "",
  outOfScope: "",
  assumption: "",
};

export function App() {
  const { versions } = window.desktop;
  const [route, setRoute] = useState<Route>("dashboard");
  const [nativeCore, setNativeCore] = useState<NativeCoreState>({
    status: "loading",
  });
  const [workspaces, setWorkspaces] = useState<readonly WorkspacePublic[]>([]);
  const [corporations, setCorporations] = useState<
    readonly CorporationSummary[]
  >([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadError, setLoadError] = useState<WorkspaceIpcErrorCode>();
  const [operationError, setOperationError] = useState<WorkspaceIpcErrorCode>();
  const [statusMessage, setStatusMessage] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [refreshingIds, setRefreshingIds] = useState<readonly string[]>([]);
  const [form, setForm] = useState(emptyContent);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goalError, setGoalError] = useState<GoalContractErrorCode>();
  const [goalEngineError, setGoalEngineError] = useState<GoalEngineErrorCode>();
  const [goalOperation, setGoalOperation] =
    useState<GoalEngineOperationPublic>();
  const [plannerError, setPlannerError] = useState<PlannerErrorCode>();
  const [plannerOperation, setPlannerOperation] =
    useState<PlannerOperationPublic>();
  const [reviewPlan, setReviewPlan] = useState<PlannerDraftPublic>();
  const [planVersions, setPlanVersions] = useState<
    readonly PlannerDraftPublic[]
  >([]);
  const [planReviewError, setPlanReviewError] =
    useState<PlanReviewFailure["error"]>();
  const [organizationProposal, setOrganizationProposal] =
    useState<OrganizationProposal>();
  const [organizationError, setOrganizationError] =
    useState<OrganizationProposalErrorCode>();
  const [organizationActivation, setOrganizationActivation] =
    useState<OrganizationActivation>();
  const [organizationActivationError, setOrganizationActivationError] =
    useState<OrganizationActivationErrorCode>();
  const [executionStart, setExecutionStart] = useState<ExecutionStart>();
  const [executionStartError, setExecutionStartError] =
    useState<ExecutionStartErrorCode>();
  const [providers, setProviders] = useState<readonly ProviderPublic[]>([]);
  const [selectedProviderId, setSelectedProviderId] = useState<string>();
  const [clarificationAnswers, setClarificationAnswers] = useState<
    Readonly<Record<string, string>>
  >({});
  const [stateError, setStateError] = useState<CorporationErrorCode>();
  const [statePending, setStatePending] = useState(false);
  const [draftCorporation, setDraftCorporation] = useState<CorporationPublic>();
  const [reviewCorporation, setReviewCorporation] =
    useState<CorporationPublic>();
  const [reviewGoal, setReviewGoal] = useState<GoalContractPublic>();
  const [versionsList, setVersionsList] = useState<
    readonly GoalContractPublic[]
  >([]);
  const [timeline, setTimeline] = useState<readonly TimelineEventPublic[]>([]);
  const [reviewAssumptions, setReviewAssumptions] = useState<
    GoalContractContentInput["assumptions"]
  >([]);
  const createHeading = useRef<HTMLHeadingElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const plannerHeading = useRef<HTMLHeadingElement>(null);
  const requestSequence = useRef(0);

  useEffect(() => {
    let active = true;
    void window.desktop
      .health()
      .then((result) => {
        if (active) setNativeCore({ status: "ready", result });
      })
      .catch(() => {
        if (active) setNativeCore({ status: "degraded" });
      });
    void loadAndRevalidate({
      active: () => active,
      onError: setLoadError,
      onLoaded: (loaded) => {
        setWorkspaces(loaded);
        setLoadingWorkspaces(false);
      },
      onRefreshEnd: (workspaceId) =>
        setRefreshingIds((current) =>
          current.filter((currentId) => currentId !== workspaceId),
        ),
      onRefreshError: (workspaceId, code) => {
        setOperationError(code);
        setStatusMessage(`无法验证工作区 ${workspaceId.slice(0, 8)}。`);
      },
      onRefreshStart: setRefreshingIds,
      onUpdated: (updated) =>
        setWorkspaces((current) => replaceWorkspace(current, updated)),
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (workspaces.length === 0) {
      setCorporations([]);
      return;
    }
    let active = true;
    void loadCorporations(workspaces).then((loaded) => {
      if (active) setCorporations(loaded);
    });
    return () => {
      active = false;
    };
  }, [workspaces]);

  useEffect(() => {
    (route === "review"
      ? reviewHeading
      : route === "planner"
        ? plannerHeading
        : createHeading
    ).current?.focus();
  }, [route]);

  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);

  const openCreate = () => {
    setOperationError(undefined);
    setGoalError(undefined);
    setGoalEngineError(undefined);
    setGoalOperation(undefined);
    setClarificationAnswers({});
    setStatusMessage("");
    setSelectedWorkspaceId(
      workspaces.find((workspace) => workspace.accessStatus === "AVAILABLE")
        ?.workspaceId,
    );
    setForm(emptyContent);
    setDraftCorporation(undefined);
    setDirty(false);
    setRoute("create");
    void window.desktop.provider.list({ schemaVersion: 1 }).then((result) => {
      if (!result.ok) return;
      const available = result.value.filter(isGoalProviderAvailable);
      setProviders(available);
      setSelectedProviderId(undefined);
    });
  };

  const resumeGoalAnalysis = async (summary: CorporationSummary) => {
    const [providerResult, operationResult] = await Promise.all([
      window.desktop.provider.list({ schemaVersion: 1 }),
      window.desktop.goalEngine.getCurrent({
        schemaVersion: "1.0",
        corporationId: summary.corporation.id,
      }),
    ]);
    setProviders(
      providerResult.ok
        ? providerResult.value.filter(isGoalProviderAvailable)
        : [],
    );
    setSelectedProviderId(undefined);
    setDraftCorporation(summary.corporation);
    setSelectedWorkspaceId(summary.corporation.workspaceId);
    setForm({ ...emptyContent, corporationName: summary.corporation.name });
    setGoalOperation(
      operationResult.ok ? (operationResult.value ?? undefined) : undefined,
    );
    setGoalEngineError(
      operationResult.ok ? undefined : operationResult.error.code,
    );
    setClarificationAnswers({});
    setDirty(false);
    setRoute("create");
  };

  const selectWorkspace = async () => {
    setSelecting(true);
    setOperationError(undefined);
    setStatusMessage("正在打开系统文件夹选择器。");
    try {
      const result = await window.desktop.workspace.select();
      if (!result.ok) {
        setOperationError(result.error.code);
        setStatusMessage("");
        return;
      }
      if (result.value.status === "CANCELLED") {
        setStatusMessage("已取消选择文件夹，没有保存任何授权。");
        return;
      }
      const selected = result.value.workspace;
      setWorkspaces((current) => replaceWorkspace(current, selected));
      setSelectedWorkspaceId(selected.workspaceId);
      setStatusMessage("工作区授权已保存。");
    } catch {
      setOperationError("SELECTION_UNAVAILABLE");
      setStatusMessage("");
    } finally {
      setSelecting(false);
    }
  };

  const revalidateWorkspace = async (workspaceId: string) => {
    setRefreshingIds((current) => [...new Set([...current, workspaceId])]);
    setOperationError(undefined);
    try {
      const result = await window.desktop.workspace.revalidate(workspaceId);
      if (result.ok) {
        setWorkspaces((current) => replaceWorkspace(current, result.value));
        setStatusMessage("工作区验证结果已更新。");
      } else {
        setOperationError(result.error.code);
        setStatusMessage("");
      }
    } catch {
      setOperationError("VERIFICATION_FAILED");
      setStatusMessage("");
    } finally {
      setRefreshingIds((current) =>
        current.filter((currentId) => currentId !== workspaceId),
      );
    }
  };

  const updateForm = (field: keyof typeof emptyContent, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setDirty(true);
    setGoalError(undefined);
  };

  const saveGoal = async (source: "MANUAL" | "MOCK") => {
    const workspace = workspaces.find(
      ({ workspaceId }) => workspaceId === selectedWorkspaceId,
    );
    if (
      workspace === undefined ||
      workspace.accessStatus !== "AVAILABLE" ||
      form.corporationName.trim().length === 0 ||
      form.goal.trim().length === 0 ||
      lines(form.successCriteria).length === 0
    ) {
      setGoalError("VALIDATION_FAILED");
      return;
    }
    const requestId = ++requestSequence.current;
    setSaving(true);
    setGoalError(undefined);
    try {
      let corporation = draftCorporation;
      if (corporation === undefined) {
        const created = await window.desktop.corporation.create({
          schemaVersion: "1.0",
          commandId: createUuidV7(),
          workspaceId: workspace.workspaceId,
          name: form.corporationName,
        });
        if (!created.ok) {
          setGoalError(mapCorporationError(created.error.code));
          return;
        }
        corporation = created.value;
        if (requestId !== requestSequence.current) return;
        setDraftCorporation(corporation);
      }
      const content = contentFromForm(form, source);
      const saved = await window.desktop.goalContract.saveDraft({
        schemaVersion: "1.0",
        commandId: createUuidV7(),
        corporationId: corporation.id,
        expectedCorporationVersion: corporation.version,
        expectedGoalVersion: 0,
        content,
      });
      if (requestId !== requestSequence.current) return;
      if (!saved.ok) {
        setGoalError(saved.error.code);
        setStatusMessage(
          "公司已创建，但目标合同没有保存。你输入的内容仍然保留；重试不会再创建一个公司。",
        );
        return;
      }
      const refreshed = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: corporation.id,
      });
      if (!refreshed.ok || requestId !== requestSequence.current) {
        setGoalError(
          refreshed.ok
            ? "STORAGE_UNAVAILABLE"
            : mapCorporationError(refreshed.error.code),
        );
        return;
      }
      setReviewCorporation(refreshed.value);
      setReviewGoal(saved.value);
      setReviewAssumptions(saved.value.assumptions);
      setDirty(false);
      setStatusMessage("");
      await refreshReview(corporation.id);
      setRoute("review");
    } catch {
      setGoalError("STORAGE_UNAVAILABLE");
    } finally {
      if (requestId === requestSequence.current) setSaving(false);
    }
  };

  const acceptGoalOperation = async (
    operation: GoalEngineOperationPublic,
    corporation: CorporationPublic,
  ) => {
    setGoalOperation(operation);
    setClarificationAnswers({});
    setDirty(false);
    if (operation.status !== "GOAL_SAVED" || operation.goal === undefined)
      return;
    const refreshed = await window.desktop.corporation.get({
      schemaVersion: "1.0",
      corporationId: corporation.id,
    });
    if (!refreshed.ok) {
      setGoalEngineError("STORAGE_UNAVAILABLE");
      return;
    }
    setReviewCorporation(refreshed.value);
    setReviewGoal(operation.goal);
    setReviewAssumptions(operation.goal.assumptions);
    setStatusMessage(
      `模型服务商生成的目标草稿已保存，批准前需要人工检查。${usageLabel(operation.usage)}`,
    );
    await refreshReview(corporation.id);
    setRoute("review");
  };

  const analyzeGoal = async () => {
    const workspace = workspaces.find(
      ({ workspaceId }) => workspaceId === selectedWorkspaceId,
    );
    const provider = providers.find(({ id }) => id === selectedProviderId);
    if (
      workspace?.accessStatus !== "AVAILABLE" ||
      provider === undefined ||
      form.corporationName.trim().length === 0 ||
      form.goal.trim().length === 0
    ) {
      setGoalEngineError("VALIDATION_FAILED");
      return;
    }
    setSaving(true);
    setGoalEngineError(undefined);
    try {
      let corporation = draftCorporation;
      if (corporation === undefined) {
        const created = await window.desktop.corporation.create({
          schemaVersion: "1.0",
          commandId: createUuidV7(),
          workspaceId: workspace.workspaceId,
          name: form.corporationName,
        });
        if (!created.ok) {
          setGoalEngineError("STATE_CONFLICT");
          return;
        }
        corporation = created.value;
        setDraftCorporation(corporation);
      }
      const operationId = createUuidV7();
      setGoalOperation({
        schemaVersion: "1.0",
        operationId,
        corporationId: corporation.id,
        providerId: provider.id,
        providerVersion: provider.version,
        modelId: provider.selectedModelId!,
        status: "GENERATING",
        version: 1,
        cycleNumber: 1,
        roundInCycle: 0,
        questions: [],
        usage: { costSource: "UNKNOWN" },
        updatedAt: new Date().toISOString(),
      });
      const result = await window.desktop.goalEngine.start({
        schemaVersion: "1.0",
        operationId,
        corporationId: corporation.id,
        expectedCorporationVersion: corporation.version,
        expectedGoalVersion: 0,
        providerId: provider.id,
        expectedProviderVersion: provider.version,
        input: {
          originalGoal: form.goal,
          ...(lines(form.successCriteria).length === 0
            ? {}
            : { successCriteriaHints: lines(form.successCriteria) }),
          ...(lines(form.deliverables).length === 0
            ? {}
            : { deliverableHints: lines(form.deliverables) }),
          ...(lines(form.constraints).length === 0
            ? {}
            : { constraints: lines(form.constraints) }),
          ...(lines(form.outOfScope).length === 0
            ? {}
            : { outOfScope: lines(form.outOfScope) }),
        },
      });
      if (!result.ok) {
        setGoalEngineError(result.error.code);
        return;
      }
      await acceptGoalOperation(result.value, corporation);
    } catch {
      setGoalEngineError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const answerGoalQuestions = async () => {
    if (goalOperation === undefined || draftCorporation === undefined) return;
    setSaving(true);
    setGoalEngineError(undefined);
    try {
      const result = await window.desktop.goalEngine.answer({
        schemaVersion: "1.0",
        operationId: goalOperation.operationId,
        expectedOperationVersion: goalOperation.version,
        answers: goalOperation.questions.map(({ questionId }) => ({
          questionId,
          answer: clarificationAnswers[questionId] ?? "",
        })),
      });
      if (!result.ok) {
        setGoalEngineError(result.error.code);
        return;
      }
      await acceptGoalOperation(result.value, draftCorporation);
    } catch {
      setGoalEngineError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const resolveGoalExtension = async (
    decision: "CONTINUE" | "SAVE_DRAFT" | "CANCEL",
  ) => {
    if (goalOperation === undefined || draftCorporation === undefined) return;
    setSaving(true);
    setGoalEngineError(undefined);
    try {
      const result = await window.desktop.goalEngine.resolveExtension({
        schemaVersion: "1.0",
        operationId: goalOperation.operationId,
        expectedOperationVersion: goalOperation.version,
        decision,
      });
      if (!result.ok) {
        setGoalEngineError(result.error.code);
        return;
      }
      await acceptGoalOperation(result.value, draftCorporation);
    } catch {
      setGoalEngineError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const cancelGoalAnalysis = async () => {
    if (goalOperation === undefined) return;
    setSaving(true);
    const result = await window.desktop.goalEngine.cancel({
      schemaVersion: "1.0",
      operationId: goalOperation.operationId,
    });
    if (result.ok) setGoalOperation(result.value);
    else setGoalEngineError(result.error.code);
    setSaving(false);
  };

  const refreshReview = async (corporationId: string) => {
    const [history, events] = await Promise.all([
      window.desktop.goalContract.listVersions({
        schemaVersion: "1.0",
        corporationId,
      }),
      window.desktop.timeline.list({
        schemaVersion: "1.0",
        corporationId,
        limit: 100,
      }),
    ]);
    if (history.ok) setVersionsList(history.value);
    if (events.ok) setTimeline(events.value.items);
  };

  const openReview = async (summary: CorporationSummary) => {
    if (summary.goal === null) return;
    setReviewCorporation(summary.corporation);
    setReviewGoal(summary.goal);
    setReviewAssumptions(summary.goal.assumptions);
    setGoalError(undefined);
    setStateError(undefined);
    await refreshReview(summary.corporation.id);
    setRoute("review");
  };

  const changeCorporationState = async (corporation: CorporationPublic) => {
    const requestId = ++requestSequence.current;
    setStatePending(true);
    setStateError(undefined);
    setStatusMessage(
      corporation.status === "PAUSED"
        ? "正在恢复暂停前保存的状态。"
        : "正在当前本地检查点暂停。",
    );
    try {
      const request = {
        schemaVersion: "1.0" as const,
        commandId: createUuidV7(),
        corporationId: corporation.id,
        expectedVersion: corporation.version,
      };
      const result =
        corporation.status === "PAUSED"
          ? await window.desktop.corporation.resume(request)
          : await window.desktop.corporation.pause(request);
      if (requestId !== requestSequence.current) return;
      if (!result.ok) {
        setStateError(result.error.code);
        setStatusMessage("");
        if (result.error.code === "VERSION_CONFLICT") {
          const latest = await window.desktop.corporation.get({
            schemaVersion: "1.0",
            corporationId: corporation.id,
          });
          if (requestId !== requestSequence.current) return;
          if (latest.ok) {
            setCorporations((current) =>
              current.map((summary) =>
                summary.corporation.id === latest.value.id
                  ? { ...summary, corporation: latest.value }
                  : summary,
              ),
            );
            if (reviewCorporation?.id === latest.value.id) {
              setReviewCorporation(latest.value);
            }
          }
        }
        return;
      }
      setCorporations((current) =>
        current.map((summary) =>
          summary.corporation.id === result.value.id
            ? { ...summary, corporation: result.value }
            : summary,
        ),
      );
      if (reviewCorporation?.id === result.value.id) {
        setReviewCorporation(result.value);
        await refreshReview(result.value.id);
      }
      setStatusMessage(
        result.value.status === "PAUSED"
          ? "公司已暂停。计划、任务和执行均未开始。"
          : `公司已恢复到“${internalLabel(result.value.status)}”状态，没有重复执行任何命令或事件。`,
      );
    } catch {
      if (requestId === requestSequence.current) {
        setStateError("STORAGE_UNAVAILABLE");
        setStatusMessage("");
      }
    } finally {
      if (requestId === requestSequence.current) setStatePending(false);
    }
  };

  const approveGoal = async () => {
    if (reviewCorporation === undefined || reviewGoal === undefined) return;
    setSaving(true);
    setGoalError(undefined);
    try {
      let corporation = reviewCorporation;
      let goal = reviewGoal;
      if (
        JSON.stringify(reviewAssumptions) !==
        JSON.stringify(reviewGoal.assumptions)
      ) {
        const saved = await window.desktop.goalContract.saveDraft({
          schemaVersion: "1.0",
          commandId: createUuidV7(),
          corporationId: corporation.id,
          expectedCorporationVersion: corporation.version,
          expectedGoalVersion: goal.version,
          content: {
            ...goalContent(goal),
            assumptions: reviewAssumptions,
          },
        });
        if (!saved.ok) {
          setGoalError(saved.error.code);
          return;
        }
        goal = saved.value;
        const refreshed = await window.desktop.corporation.get({
          schemaVersion: "1.0",
          corporationId: corporation.id,
        });
        if (!refreshed.ok) {
          setGoalError(mapCorporationError(refreshed.error.code));
          return;
        }
        corporation = refreshed.value;
      }
      const approved = await window.desktop.goalContract.approve({
        schemaVersion: "1.0",
        commandId: createUuidV7(),
        corporationId: corporation.id,
        expectedCorporationVersion: corporation.version,
        goalVersion: goal.version,
      });
      if (!approved.ok) {
        setGoalError(approved.error.code);
        return;
      }
      const refreshed = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: corporation.id,
      });
      if (refreshed.ok) setReviewCorporation(refreshed.value);
      setReviewGoal(approved.value);
      setReviewAssumptions(approved.value.assumptions);
      setStatusMessage("目标合同已批准。规划和执行尚未开始。");
      await refreshReview(corporation.id);
    } catch {
      setGoalError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const openPlanner = async () => {
    if (reviewCorporation === undefined || reviewGoal?.status !== "APPROVED") {
      setPlannerError("STATE_CONFLICT");
      return;
    }
    setSaving(true);
    setPlannerError(undefined);
    try {
      const [
        corporationResult,
        providerResult,
        operationResult,
        currentPlanResult,
        planVersionsResult,
        organizationResult,
        activationResult,
        executionResult,
      ] = await Promise.all([
        window.desktop.corporation.get({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.provider.list({ schemaVersion: 1 }),
        window.desktop.planner.getCurrent({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.planReview.getCurrent({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.planReview.listVersions({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.organizationProposal.getCurrent({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.organizationActivation.getCurrent({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
        window.desktop.executionStart.getCurrent({
          schemaVersion: "1.0",
          corporationId: reviewCorporation.id,
        }),
      ]);
      if (!corporationResult.ok) {
        setPlannerError("VERSION_CONFLICT");
        return;
      }
      setReviewCorporation(corporationResult.value);
      const available = providerResult.ok
        ? providerResult.value.filter(isGoalProviderAvailable)
        : [];
      setProviders(available);
      setSelectedProviderId(undefined);
      setPlanReviewError(undefined);
      if (!operationResult.ok) {
        setPlannerError(operationResult.error.code);
        setPlannerOperation(undefined);
      } else {
        setPlannerOperation(operationResult.value ?? undefined);
      }
      if (!currentPlanResult.ok) {
        setPlanReviewError(currentPlanResult.error);
        setReviewPlan(undefined);
      } else {
        setReviewPlan(currentPlanResult.value ?? undefined);
      }
      if (!planVersionsResult.ok) {
        setPlanReviewError(planVersionsResult.error);
        setPlanVersions([]);
      } else {
        setPlanVersions(planVersionsResult.value);
      }
      if (organizationResult.ok) {
        setOrganizationProposal(organizationResult.value ?? undefined);
        setOrganizationError(undefined);
      } else {
        setOrganizationProposal(undefined);
        setOrganizationError(organizationResult.error.code);
      }
      if (activationResult.ok) {
        setOrganizationActivation(activationResult.value ?? undefined);
        setOrganizationActivationError(undefined);
      } else {
        setOrganizationActivation(undefined);
        setOrganizationActivationError(activationResult.error.code);
      }
      if (executionResult.ok) {
        setExecutionStart(executionResult.value ?? undefined);
        setExecutionStartError(undefined);
      } else {
        setExecutionStart(undefined);
        setExecutionStartError(executionResult.error.code);
      }
      setStatusMessage("");
      setRoute("planner");
    } catch {
      setPlannerError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const startPlanner = async () => {
    const provider = providers.find(({ id }) => id === selectedProviderId);
    if (
      reviewCorporation === undefined ||
      reviewGoal?.status !== "APPROVED" ||
      provider?.selectedModelId === undefined
    ) {
      setPlannerError("VALIDATION_FAILED");
      return;
    }
    setSaving(true);
    setPlannerError(undefined);
    const operationId = createUuidV7();
    setPlannerOperation({
      schemaVersion: "1.0",
      operationId,
      corporationId: reviewCorporation.id,
      providerId: provider.id,
      providerVersion: provider.version,
      modelId: provider.selectedModelId,
      status: "GENERATING",
      version: 1,
      usage: { costSource: "UNKNOWN" },
      updatedAt: new Date().toISOString(),
    });
    try {
      const result = await window.desktop.planner.start({
        schemaVersion: "1.0",
        operationId,
        corporationId: reviewCorporation.id,
        expectedCorporationVersion: reviewCorporation.version,
        goalVersion: reviewGoal.version,
        providerId: provider.id,
        expectedProviderVersion: provider.version,
        modelId: provider.selectedModelId,
      });
      if (!result.ok) {
        setPlannerError(result.error.code);
        return;
      }
      setPlannerOperation(result.value);
      setReviewPlan(result.value.plan);
      if (result.value.plan !== undefined) {
        setPlanVersions([result.value.plan]);
      }
      setStatusMessage(
        result.value.status !== "PLAN_SAVED"
          ? "计划生成已停止，没有保存草稿。"
          : result.value.plan?.validationStatus === "VALID"
            ? "计划已保存并通过本地验证。仍未批准、未组队，不能执行。"
            : result.value.plan?.validationStatus === "INVALID"
              ? "计划草稿已保存，但本地验证未通过。没有创建正式任务。"
              : "计划草稿已保存，正在进行本地验证。",
      );
    } catch {
      setPlannerError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const cancelPlanner = async () => {
    if (plannerOperation === undefined) return;
    setSaving(true);
    const result = await window.desktop.planner.cancel({
      schemaVersion: "1.0",
      operationId: plannerOperation.operationId,
    });
    if (result.ok) setPlannerOperation(result.value);
    else setPlannerError(result.error.code);
    setSaving(false);
  };

  const savePlanVersion = async (request: PlanReviewSaveVersionRequest) => {
    setSaving(true);
    setPlanReviewError(undefined);
    try {
      const result = await window.desktop.planReview.saveVersion(request);
      if (!result.ok) {
        setPlanReviewError(result.error);
        return;
      }
      setReviewPlan(result.value);
      const versionsResult = await window.desktop.planReview.listVersions({
        schemaVersion: "1.0",
        corporationId: request.corporationId,
      });
      if (versionsResult.ok) setPlanVersions(versionsResult.value);
      else setPlanReviewError(versionsResult.error);
      setStatusMessage(
        result.value.validationStatus === "VALID"
          ? "新计划版本已保存并通过本地验证。仍未批准、未组队，也没有开始执行。"
          : "新计划版本已保存，但验证未通过。可以继续修改，不会调用模型服务商。",
      );
    } catch {
      setPlanReviewError({
        code: "STORAGE_UNAVAILABLE",
        message: "Plan review storage is unavailable.",
      });
    } finally {
      setSaving(false);
    }
  };

  const approvePlan = async (plan: PlannerDraftPublic) => {
    setSaving(true);
    setPlanReviewError(undefined);
    try {
      const result = await window.desktop.planReview.approve({
        schemaVersion: "1.0",
        commandId: createUuidV7(),
        corporationId: plan.corporationId,
        planId: plan.planId,
        expectedPlanVersion: plan.planVersion,
      });
      if (!result.ok) {
        setPlanReviewError(result.error);
        return;
      }
      setReviewPlan(result.value);
      setPlanVersions((versions) =>
        versions.map((version) =>
          version.planId === result.value.planId ? result.value : version,
        ),
      );
      setStatusMessage("计划已批准并冻结。软件没有创建团队，也没有开始执行。");
    } catch {
      setPlanReviewError({
        code: "STORAGE_UNAVAILABLE",
        message: "Plan review storage is unavailable.",
      });
    } finally {
      setSaving(false);
    }
  };

  const createOrganizationProposal = async (plan: PlannerDraftPublic) => {
    setSaving(true);
    setOrganizationError(undefined);
    try {
      const result = await window.desktop.organizationProposal.create({
        schemaVersion: "1.0",
        commandId: createUuidV7(),
        corporationId: plan.corporationId,
        planId: plan.planId,
        expectedPlanVersion: plan.planVersion,
      });
      if (!result.ok) {
        setOrganizationError(result.error.code);
        return;
      }
      setOrganizationProposal(result.value);
      setOrganizationActivation(undefined);
      setStatusMessage("团队草案已保存。尚未激活，也没有开始执行。");
    } catch {
      setOrganizationError("STORAGE_FAILURE");
    } finally {
      setSaving(false);
    }
  };

  const activateOrganization = async (
    request: OrganizationActivationRequest,
  ) => {
    setSaving(true);
    setOrganizationActivationError(undefined);
    try {
      const result =
        await window.desktop.organizationActivation.activate(request);
      if (!result.ok) {
        setOrganizationActivationError(result.error.code);
        return;
      }
      setOrganizationActivation(result.value);
      setStatusMessage(
        "团队已激活，等待开始执行。当前没有运行任务，也没有调用模型。",
      );
    } catch {
      setOrganizationActivationError("STORAGE_FAILURE");
    } finally {
      setSaving(false);
    }
  };

  const startExecution = async () => {
    if (reviewCorporation === undefined) return;
    setSaving(true);
    setExecutionStartError(undefined);
    try {
      const result = await window.desktop.executionStart.start({
        schemaVersion: "1.0",
        commandId: createUuidV7(),
        corporationId: reviewCorporation.id,
        expectedCorporationVersion: reviewCorporation.version,
      });
      if (!result.ok) {
        setExecutionStartError(result.error.code);
        return;
      }
      setExecutionStart(result.value);
      setReviewCorporation((current) =>
        current === undefined
          ? current
          : {
              ...current,
              status: result.value.corporationStatus,
              version: result.value.corporationVersion,
              updatedAt: result.value.startedAt,
            },
      );
      setStatusMessage(
        result.value.run === undefined
          ? "已进入等待人工处理，当前没有调用模型。"
          : "执行已开始，已创建首个运行记录，但尚未调用模型。",
      );
    } catch {
      setExecutionStartError("STORAGE_FAILURE");
    } finally {
      setSaving(false);
    }
  };

  const leaveCreate = () => {
    if (dirty && !window.confirm("要放弃尚未保存的目标合同内容吗？")) {
      return;
    }
    setDirty(false);
    setRoute("dashboard");
  };

  return (
    <div className="app-shell">
      <Sidebar
        nativeCore={nativeCore}
        onDashboard={
          route === "create" ? leaveCreate : () => setRoute("dashboard")
        }
        onSettings={() => setRoute("settings")}
        route={route}
        versions={versions}
      />
      <main className="page">
        {route === "dashboard" && (
          <Dashboard
            corporations={corporations}
            loadError={loadError}
            loading={loadingWorkspaces}
            onCreate={openCreate}
            onOpen={openReview}
            onResume={resumeGoalAnalysis}
            onRevalidate={revalidateWorkspace}
            onStateChange={changeCorporationState}
            operationError={operationError}
            refreshingIds={refreshingIds}
            stateError={stateError}
            statePending={statePending}
            statusMessage={statusMessage}
            workspaces={workspaces}
          />
        )}
        {route === "create" && (
          <CreateCorporation
            error={operationError}
            form={form}
            goalError={goalError}
            goalEngineError={goalEngineError}
            goalOperation={goalOperation}
            headingRef={createHeading}
            clarificationAnswers={clarificationAnswers}
            onAnalyze={analyzeGoal}
            onAnswer={answerGoalQuestions}
            onBack={leaveCreate}
            onCancelAnalysis={cancelGoalAnalysis}
            onResolveExtension={resolveGoalExtension}
            onSave={saveGoal}
            onSelect={selectWorkspace}
            onUpdate={updateForm}
            saving={saving}
            providers={providers}
            selectedProviderId={selectedProviderId}
            setSelectedProviderId={setSelectedProviderId}
            setClarificationAnswers={setClarificationAnswers}
            selecting={selecting}
            selectedWorkspaceId={selectedWorkspaceId}
            setSelectedWorkspaceId={setSelectedWorkspaceId}
            statusMessage={statusMessage}
            workspaces={workspaces}
          />
        )}
        {route === "review" &&
          reviewCorporation !== undefined &&
          reviewGoal !== undefined && (
            <GoalReview
              assumptions={reviewAssumptions}
              corporation={reviewCorporation}
              error={goalError}
              stateError={stateError}
              goal={reviewGoal}
              headingRef={reviewHeading}
              onApprove={approveGoal}
              onBack={() => setRoute("dashboard")}
              onChangeAssumption={setReviewAssumptions}
              onStateChange={() => changeCorporationState(reviewCorporation)}
              onPlan={openPlanner}
              saving={saving}
              statePending={statePending}
              statusMessage={statusMessage}
              timeline={timeline}
              versions={versionsList}
            />
          )}
        {route === "planner" &&
          reviewCorporation !== undefined &&
          reviewGoal !== undefined && (
            <PlannerDraftView
              corporation={reviewCorporation}
              error={plannerError}
              goal={reviewGoal}
              headingRef={plannerHeading}
              onBack={() => setRoute("review")}
              onCancel={cancelPlanner}
              onStart={startPlanner}
              operation={plannerOperation}
              plan={reviewPlan}
              planReviewError={planReviewError}
              planVersions={planVersions}
              onApprovePlan={approvePlan}
              onCreateOrganization={createOrganizationProposal}
              onActivateOrganization={activateOrganization}
              onSaveVersion={savePlanVersion}
              organizationError={organizationError}
              organizationActivation={organizationActivation}
              organizationActivationError={organizationActivationError}
              executionStart={executionStart}
              executionStartError={executionStartError}
              onStartExecution={startExecution}
              organizationProposal={organizationProposal}
              providers={providers}
              saving={saving}
              selectedProviderId={selectedProviderId}
              setSelectedProviderId={setSelectedProviderId}
              statusMessage={statusMessage}
            />
          )}
        {route === "settings" && <ProviderSettings />}
        <p className="sr-only" aria-live="polite">
          {statusMessage}
        </p>
      </main>
    </div>
  );
}

function Sidebar(props: {
  readonly nativeCore: NativeCoreState;
  readonly onDashboard: () => void;
  readonly onSettings: () => void;
  readonly route: Route;
  readonly versions: { readonly chrome: string; readonly electron: string };
}) {
  return (
    <aside className="sidebar" aria-label="软件导航">
      <div>
        <p className="brand-mark" aria-label="AI Corporation">
          AC
        </p>
        <p className="brand-name">AI Corporation</p>
        <nav>
          <button
            aria-current={props.route === "dashboard" ? "page" : undefined}
            className="nav-button"
            onClick={props.onDashboard}
            type="button"
          >
            控制台
          </button>
          <button className="nav-button" disabled type="button">
            运行中
          </button>
          <button className="nav-button" disabled type="button">
            待批准
          </button>
          <button
            aria-current={props.route === "settings" ? "page" : undefined}
            className="nav-button"
            onClick={props.onSettings}
            type="button"
          >
            设置
          </button>
        </nav>
      </div>
      <div
        className="runtime-summary"
        aria-label={nativeCoreStatusLabel(props.nativeCore)}
        aria-live="polite"
        role="status"
      >
        <span
          className={`status-dot status-dot--${props.nativeCore.status}`}
          aria-hidden="true"
        />
        <span>{nativeCoreStatusLabel(props.nativeCore)}</span>
        <small>
          Electron {props.versions.electron} · Chrome {props.versions.chrome}
        </small>
      </div>
    </aside>
  );
}

function Dashboard(props: {
  readonly corporations: readonly CorporationSummary[];
  readonly loadError: WorkspaceIpcErrorCode | undefined;
  readonly loading: boolean;
  readonly onCreate: () => void;
  readonly onOpen: (summary: CorporationSummary) => Promise<void>;
  readonly onResume: (summary: CorporationSummary) => Promise<void>;
  readonly onRevalidate: (workspaceId: string) => Promise<void>;
  readonly onStateChange: (corporation: CorporationPublic) => Promise<void>;
  readonly operationError: WorkspaceIpcErrorCode | undefined;
  readonly refreshingIds: readonly string[];
  readonly stateError: CorporationErrorCode | undefined;
  readonly statePending: boolean;
  readonly statusMessage: string;
  readonly workspaces: readonly WorkspacePublic[];
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">本地优先的工作区</p>
          <h1>控制台</h1>
          <p>在你明确授权的本地工作区中创建和恢复公司的目标合同。</p>
        </div>
        <button
          className="primary-button"
          onClick={props.onCreate}
          type="button"
        >
          新建公司
        </button>
      </header>
      {props.loadError !== undefined && (
        <WorkspaceError code={props.loadError} title="无法使用已保存的工作区" />
      )}
      {props.operationError !== undefined && (
        <WorkspaceError
          code={props.operationError}
          title="工作区验证需要处理"
        />
      )}
      {props.stateError !== undefined && (
        <CorporationStateError code={props.stateError} />
      )}
      {props.statusMessage.length > 0 && (
        <p className="inline-status" role="status">
          {props.statusMessage}
        </p>
      )}
      {props.loading ? (
        <section aria-busy="true" aria-label="正在加载工作区">
          <div className="skeleton-card" />
        </section>
      ) : props.workspaces.length === 0 && props.loadError === undefined ? (
        <section className="empty-state" aria-labelledby="empty-title">
          <p className="empty-kicker">还没有已授权的工作区</p>
          <h2 id="empty-title">创建第一个公司</h2>
          <p>请先选择一个本地文件夹。软件会先验证实际访问权限，再保存授权。</p>
          <button
            className="primary-button"
            onClick={props.onCreate}
            type="button"
          >
            选择工作区
          </button>
        </section>
      ) : (
        <>
          {props.corporations.length > 0 && (
            <section aria-labelledby="corporation-list-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">已从 SQLite 恢复</p>
                  <h2 id="corporation-list-title">公司</h2>
                </div>
                <span>{props.corporations.length}</span>
              </div>
              <div className="workspace-grid">
                {props.corporations.map((summary) => (
                  <article
                    className="workspace-card"
                    key={summary.corporation.id}
                  >
                    <div className="workspace-card__top">
                      <span className="status-badge status-badge--neutral">
                        {internalLabel(summary.corporation.status)}
                      </span>
                      <span className="permission-label">
                        公司版本 {summary.corporation.version}
                      </span>
                    </div>
                    <h3>{summary.corporation.name}</h3>
                    <p>
                      {summary.goal === null
                        ? "公司已经创建，但还需要保存目标合同。"
                        : `目标版本 ${summary.goal.version}：${summary.goal.statement}`}
                    </p>
                    {summary.corporation.status === "PAUSED" && (
                      <p>
                        从“{internalLabel(summary.corporation.pausedFrom ?? "")}
                        ”状态暂停，时间：
                        {formatUiTime(summary.corporation.pausedAt ?? "")}。
                      </p>
                    )}
                    <button
                      className="secondary-button"
                      disabled={props.statePending}
                      onClick={() =>
                        void props.onStateChange(summary.corporation)
                      }
                      type="button"
                    >
                      {props.statePending
                        ? summary.corporation.status === "PAUSED"
                          ? "正在继续…"
                          : "正在暂停…"
                        : summary.corporation.status === "PAUSED"
                          ? "继续运行公司"
                          : "暂停公司"}
                    </button>
                    <button
                      className="secondary-button"
                      onClick={() =>
                        void (summary.goal === null
                          ? props.onResume(summary)
                          : props.onOpen(summary))
                      }
                      type="button"
                    >
                      {summary.goal === null ? "继续创建目标" : "打开目标合同"}
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="workspace-list-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">已授权的根目录</p>
                <h2 id="workspace-list-title">工作区</h2>
              </div>
              <span>{props.workspaces.length}</span>
            </div>
            <div className="workspace-grid">
              {props.workspaces.map((workspace) => {
                const presentation = presentWorkspace(workspace);
                const refreshing = props.refreshingIds.includes(
                  workspace.workspaceId,
                );
                return (
                  <article
                    className="workspace-card"
                    key={workspace.workspaceId}
                  >
                    <div className="workspace-card__top">
                      <span
                        className={`status-badge status-badge--${presentation.tone}`}
                      >
                        {refreshing ? "正在验证" : presentation.accessLabel}
                      </span>
                      <span className="permission-label">
                        {presentation.permissionLabel}
                      </span>
                    </div>
                    <h3 title={workspace.displayPath}>
                      {workspace.displayPath}
                    </h3>
                    <p>
                      {presentation.recoveryAction ?? "该授权仅限所选文件夹。"}
                    </p>
                    <button
                      className="secondary-button"
                      disabled={refreshing}
                      onClick={() =>
                        void props.onRevalidate(workspace.workspaceId)
                      }
                      type="button"
                    >
                      {refreshing ? "正在验证…" : "重新验证"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        </>
      )}
    </>
  );
}

function CreateCorporation(props: {
  readonly clarificationAnswers: Readonly<Record<string, string>>;
  readonly error: WorkspaceIpcErrorCode | undefined;
  readonly form: typeof emptyContent;
  readonly goalError: GoalContractErrorCode | undefined;
  readonly goalEngineError: GoalEngineErrorCode | undefined;
  readonly goalOperation: GoalEngineOperationPublic | undefined;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onAnalyze: () => Promise<void>;
  readonly onAnswer: () => Promise<void>;
  readonly onBack: () => void;
  readonly onCancelAnalysis: () => Promise<void>;
  readonly onResolveExtension: (
    decision: "CONTINUE" | "SAVE_DRAFT" | "CANCEL",
  ) => Promise<void>;
  readonly onSave: (source: "MANUAL" | "MOCK") => Promise<void>;
  readonly onSelect: () => Promise<void>;
  readonly onUpdate: (field: keyof typeof emptyContent, value: string) => void;
  readonly providers: readonly ProviderPublic[];
  readonly saving: boolean;
  readonly selectedProviderId: string | undefined;
  readonly selecting: boolean;
  readonly selectedWorkspaceId: string | undefined;
  readonly setSelectedWorkspaceId: (id: string) => void;
  readonly setSelectedProviderId: (id: string | undefined) => void;
  readonly setClarificationAnswers: (
    answers: Readonly<Record<string, string>>,
  ) => void;
  readonly statusMessage: string;
  readonly workspaces: readonly WorkspacePublic[];
}) {
  const selected = props.workspaces.find(
    ({ workspaceId }) => workspaceId === props.selectedWorkspaceId,
  );
  const submit = (event: FormEvent, source: "MANUAL" | "MOCK") => {
    event.preventDefault();
    void props.onSave(source);
  };
  const selectedProvider = props.providers.find(
    ({ id }) => id === props.selectedProviderId,
  );
  const operationActive =
    props.goalOperation !== undefined &&
    ["GENERATING", "CLARIFICATION_REQUIRED", "EXTENSION_REQUIRED"].includes(
      props.goalOperation.status,
    );
  return (
    <>
      <header className="page-header page-header--create">
        <div>
          <button className="back-button" onClick={props.onBack} type="button">
            ← 控制台
          </button>
          <p className="eyebrow">新建公司 · 输入目标</p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            选择工作区
          </h1>
          <p>
            选择已授权的文件夹，填写公司名称，并定义一份可供检查的目标合同。
          </p>
        </div>
      </header>
      {props.error !== undefined && (
        <WorkspaceError code={props.error} title="工作区未获授权" />
      )}
      {props.goalError !== undefined && <GoalError code={props.goalError} />}
      {props.goalEngineError !== undefined && (
        <GoalEngineError code={props.goalEngineError} />
      )}
      <section className="selection-panel" aria-labelledby="selection-title">
        <div>
          <p className="eyebrow">必须明确的边界</p>
          <h2 id="selection-title">工作区文件夹</h2>
          <p>界面只能获取用于显示的路径和公开权限信息。</p>
        </div>
        <button
          className="secondary-button"
          disabled={props.selecting}
          onClick={() => void props.onSelect()}
          type="button"
        >
          {props.selecting ? "正在打开选择器…" : "选择文件夹…"}
        </button>
        {props.workspaces.length > 0 && (
          <label className="field selection-help">
            已授权的工作区
            <select
              onChange={(event) =>
                props.setSelectedWorkspaceId(event.target.value)
              }
              value={props.selectedWorkspaceId ?? ""}
            >
              <option value="">请选择…</option>
              {props.workspaces.map((workspace) => (
                <option
                  disabled={workspace.accessStatus !== "AVAILABLE"}
                  key={workspace.workspaceId}
                  value={workspace.workspaceId}
                >
                  {workspace.displayPath} ·{" "}
                  {internalLabel(workspace.permissionMode)}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      {props.statusMessage.length > 0 && (
        <p className="inline-status" role="status">
          {props.statusMessage}
        </p>
      )}
      {selected !== undefined && (
        <p className="selected-boundary">
          <strong>{selected.displayPath}</strong> ·{" "}
          {presentWorkspace(selected).permissionLabel} · 仅限所选文件夹
        </p>
      )}
      <form className="goal-form">
        <label className="field">
          公司名称 *
          <input
            autoComplete="off"
            onChange={(event) =>
              props.onUpdate("corporationName", event.target.value)
            }
            value={props.form.corporationName}
          />
        </label>
        <label className="field field--wide">
          目标 *
          <textarea
            onChange={(event) => props.onUpdate("goal", event.target.value)}
            rows={5}
            value={props.form.goal}
          />
        </label>
        <label className="field field--wide">
          成功标准 <span>手动或 Mock 草稿必填，每行一项</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("successCriteria", event.target.value)
            }
            rows={3}
            value={props.form.successCriteria}
          />
        </label>
        <label className="field">
          预期交付物 <span>每行一项</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("deliverables", event.target.value)
            }
            rows={3}
            value={props.form.deliverables}
          />
        </label>
        <label className="field">
          限制条件 <span>每行一项</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("constraints", event.target.value)
            }
            rows={3}
            value={props.form.constraints}
          />
        </label>
        <label className="field">
          不包含的范围 <span>每行一项</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("outOfScope", event.target.value)
            }
            rows={3}
            value={props.form.outOfScope}
          />
        </label>
        <label className="field">
          高影响假设
          <input
            onChange={(event) =>
              props.onUpdate("assumption", event.target.value)
            }
            placeholder="选填；稍后需要在检查页面确认"
            value={props.form.assumption}
          />
        </label>
        <div className="form-actions field--wide">
          <section
            className="provider-disclosure"
            aria-labelledby="provider-analysis-title"
          >
            <h2 id="provider-analysis-title">模型服务商目标分析</h2>
            <label className="field">
              已验证的模型服务商和准确模型 *
              <select
                disabled={operationActive || props.saving}
                onChange={(event) =>
                  props.setSelectedProviderId(event.target.value || undefined)
                }
                value={props.selectedProviderId ?? ""}
              >
                <option value="">请明确选择…</option>
                {props.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} · {provider.selectedModelId}
                  </option>
                ))}
              </select>
            </label>
            <p>
              将发送给所选模型服务商：公司名称、目标、可选的目标提示和补充说明答案。
              不会发送工作区路径、文件夹、文件或 API Key。
            </p>
            {selectedProvider !== undefined && (
              <p className="selected-boundary">
                已选择：<strong>{selectedProvider.name}</strong> · 模型{" "}
                <strong>{selectedProvider.selectedModelId}</strong> · 配置版本{" "}
                {selectedProvider.version}
              </p>
            )}
            <button
              className="primary-button"
              disabled={
                operationActive ||
                props.saving ||
                selectedProvider === undefined
              }
              onClick={(event) => {
                event.preventDefault();
                void props.onAnalyze();
              }}
              type="submit"
            >
              {props.saving ? "正在分析…" : "分析并创建模型服务商草稿"}
            </button>
          </section>
          {props.goalOperation !== undefined && (
            <GoalAnalysisPanel
              answers={props.clarificationAnswers}
              onAnswer={props.onAnswer}
              onCancel={props.onCancelAnalysis}
              onChangeAnswers={props.setClarificationAnswers}
              onResolve={props.onResolveExtension}
              operation={props.goalOperation}
              saving={props.saving}
            />
          )}
          <button
            className="secondary-button"
            disabled={props.saving || operationActive}
            onClick={(event) => submit(event, "MANUAL")}
            type="submit"
          >
            {props.saving ? "正在保存…" : "保存手动草稿"}
          </button>
          <button
            aria-describedby="mock-help"
            className="primary-button"
            disabled={props.saving || operationActive}
            onClick={(event) => submit(event, "MOCK")}
            type="submit"
          >
            创建本地 Mock 草稿
          </button>
          <p id="mock-help">
            Mock
            是固定结果的本地模板，不会调用模型、模型服务商、工具、文件系统或网络。
          </p>
        </div>
      </form>
    </>
  );
}

function GoalAnalysisPanel(props: {
  readonly answers: Readonly<Record<string, string>>;
  readonly onAnswer: () => Promise<void>;
  readonly onCancel: () => Promise<void>;
  readonly onChangeAnswers: (answers: Readonly<Record<string, string>>) => void;
  readonly onResolve: (
    decision: "CONTINUE" | "SAVE_DRAFT" | "CANCEL",
  ) => Promise<void>;
  readonly operation: GoalEngineOperationPublic;
  readonly saving: boolean;
}) {
  const operation = props.operation;
  const answersComplete = operation.questions.every(
    ({ questionId }) => (props.answers[questionId] ?? "").trim().length > 0,
  );
  return (
    <section className="goal-analysis" aria-live="polite">
      <div className="workspace-card__top">
        <h2>目标分析</h2>
        <span className="status-badge status-badge--neutral">
          {internalLabel(operation.status)}
        </span>
      </div>
      <p>
        第 {operation.cycleNumber} 个周期 · 已完成补充说明{" "}
        {operation.roundInCycle}/5 轮 · {usageLabel(operation.usage)}
      </p>
      {operation.status === "GENERATING" && (
        <>
          <p>模型服务商正在生成内容。验证通过前不会显示目标草稿。</p>
          <button
            className="secondary-button"
            disabled={false}
            onClick={() => void props.onCancel()}
            type="button"
          >
            取消分析
          </button>
        </>
      )}
      {(operation.status === "CLARIFICATION_REQUIRED" ||
        operation.status === "EXTENSION_REQUIRED") && (
        <div className="clarification-list">
          <h3>仍需回答的高影响问题</h3>
          {operation.questions.map((question) => (
            <label className="field" key={question.questionId}>
              {question.text} *
              <textarea
                disabled={
                  operation.status === "EXTENSION_REQUIRED" || props.saving
                }
                onChange={(event) =>
                  props.onChangeAnswers({
                    ...props.answers,
                    [question.questionId]: event.target.value,
                  })
                }
                rows={3}
                value={props.answers[question.questionId] ?? ""}
              />
            </label>
          ))}
        </div>
      )}
      {operation.status === "CLARIFICATION_REQUIRED" && (
        <div className="analysis-actions">
          <button
            className="primary-button"
            disabled={!answersComplete || props.saving}
            onClick={() => void props.onAnswer()}
            type="button"
          >
            提交全部答案
          </button>
          <button
            className="secondary-button"
            disabled={props.saving}
            onClick={() => void props.onCancel()}
            type="button"
          >
            取消
          </button>
        </div>
      )}
      {operation.status === "EXTENSION_REQUIRED" && (
        <div className="analysis-actions">
          <p>
            本周期已达到 5
            轮上限。你明确选择下一步之前，不会继续调用模型服务商。
          </p>
          <button
            className="primary-button"
            disabled={props.saving}
            onClick={() => void props.onResolve("CONTINUE")}
            type="button"
          >
            再继续 5 轮
          </button>
          <button
            className="secondary-button"
            disabled={props.saving}
            onClick={() => void props.onResolve("SAVE_DRAFT")}
            type="button"
          >
            保存含未确认高影响假设的草稿
          </button>
          <button
            className="secondary-button"
            disabled={props.saving}
            onClick={() => void props.onResolve("CANCEL")}
            type="button"
          >
            取消
          </button>
        </div>
      )}
      {["FAILED", "CANCELLED", "INTERRUPTED"].includes(operation.status) && (
        <p>
          本次分析没有保存目标。公司和输入内容仍然保留；你可以再次明确发起分析，
          或改用手动/Mock 草稿。
        </p>
      )}
    </section>
  );
}

function GoalReview(props: {
  readonly assumptions: GoalContractContentInput["assumptions"];
  readonly corporation: CorporationPublic;
  readonly error: GoalContractErrorCode | undefined;
  readonly stateError: CorporationErrorCode | undefined;
  readonly goal: GoalContractPublic;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onApprove: () => Promise<void>;
  readonly onBack: () => void;
  readonly onChangeAssumption: (
    assumptions: GoalContractContentInput["assumptions"],
  ) => void;
  readonly onStateChange: () => Promise<void>;
  readonly onPlan: () => Promise<void>;
  readonly saving: boolean;
  readonly statePending: boolean;
  readonly statusMessage: string;
  readonly timeline: readonly TimelineEventPublic[];
  readonly versions: readonly GoalContractPublic[];
}) {
  return (
    <>
      <header className="page-header page-header--create">
        <div>
          <button className="back-button" onClick={props.onBack} type="button">
            ← 控制台
          </button>
          <p className="eyebrow">
            {props.corporation.name} · 目标版本 {props.goal.version}
          </p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            确认目标合同
          </h1>
          <p>本次操作只批准这份目标合同，不会开始规划或执行。</p>
        </div>
        <div className="status-badge-group">
          <span
            aria-label="公司状态"
            className="status-badge status-badge--neutral"
          >
            {internalLabel(props.corporation.status)}
          </span>
          <span
            aria-label="目标合同状态"
            className="status-badge status-badge--neutral"
          >
            {internalLabel(props.goal.status)}
          </span>
        </div>
      </header>
      {props.error !== undefined && <GoalError code={props.error} />}
      {props.stateError !== undefined && (
        <CorporationStateError code={props.stateError} />
      )}
      {props.statusMessage.length > 0 && (
        <p className="inline-status" role="status">
          {props.statusMessage}
        </p>
      )}
      {props.corporation.status === "PAUSED" && (
        <p className="inline-status">
          从“{internalLabel(props.corporation.pausedFrom ?? "")}
          ”状态暂停，时间：
          {formatUiTime(props.corporation.pausedAt ?? "")}
          。计划、任务和执行均未开始。
        </p>
      )}
      <div className="review-grid">
        <ReviewBlock title="目标摘要" items={[props.goal.statement]} />
        <ReviewBlock title="成功标准" items={props.goal.successCriteria} />
        <ReviewBlock
          title="包含的范围"
          items={props.goal.inScope}
          empty="未填写"
        />
        <ReviewBlock
          title="不包含的范围"
          items={props.goal.outOfScope}
          empty="未填写"
        />
        <ReviewBlock
          title="限制条件"
          items={props.goal.constraints}
          empty="未填写"
        />
        <ReviewBlock
          title="交付物"
          items={props.goal.deliverables}
          empty="未填写"
        />
        <ReviewBlock
          title="风险、预算和停止条件"
          items={[
            `风险：${internalLabel(props.goal.riskLevel)}`,
            budgetLabel(props.goal),
            ...props.goal.stopConditions,
          ]}
        />
        <section
          className="review-block review-block--wide"
          aria-labelledby="assumptions-title"
        >
          <h2 id="assumptions-title">高影响假设</h2>
          {props.assumptions.length === 0 ? (
            <p>没有填写。</p>
          ) : (
            props.assumptions.map((assumption, index) => (
              <label
                className="assumption-row"
                key={`${assumption.text}-${index}`}
              >
                <input
                  checked={assumption.confirmed}
                  disabled={props.goal.status === "APPROVED"}
                  onChange={(event) =>
                    props.onChangeAssumption(
                      props.assumptions.map((current, currentIndex) =>
                        currentIndex === index
                          ? { ...current, confirmed: event.target.checked }
                          : current,
                      ),
                    )
                  }
                  type="checkbox"
                />
                <span>
                  <strong>{internalLabel(assumption.impact)}</strong> ·{" "}
                  {assumption.text}
                </span>
              </label>
            ))
          )}
        </section>
      </div>
      <div className="review-actions">
        <p>本次操作不会生成计划、开始执行、调用模型或修改工作区文件。</p>
        <button
          className="secondary-button"
          disabled={props.statePending}
          onClick={() => void props.onStateChange()}
          type="button"
        >
          {props.statePending
            ? props.corporation.status === "PAUSED"
              ? "正在继续…"
              : "正在暂停…"
            : props.corporation.status === "PAUSED"
              ? "继续运行公司"
              : "暂停公司"}
        </button>
        <button
          className="primary-button"
          disabled={
            props.saving ||
            props.goal.status === "APPROVED" ||
            props.corporation.status === "PAUSED"
          }
          onClick={() => void props.onApprove()}
          type="button"
        >
          {props.saving ? "正在确认…" : "确认目标合同"}
        </button>
        {props.goal.status === "APPROVED" && (
          <button
            className="primary-button"
            disabled={props.saving || props.corporation.status === "PAUSED"}
            onClick={() => void props.onPlan()}
            type="button"
          >
            开始规划设置
          </button>
        )}
      </div>
      <div className="history-grid">
        <section className="history-panel" aria-labelledby="versions-title">
          <h2 id="versions-title">历史版本</h2>
          <ol>
            {props.versions.map((version) => (
              <li key={version.version}>
                版本 {version.version} · {internalLabel(version.status)} ·{" "}
                {internalLabel(version.source)}
              </li>
            ))}
          </ol>
        </section>
        <section className="history-panel" aria-labelledby="timeline-title">
          <h2 id="timeline-title">时间线</h2>
          <ol>
            {props.timeline.map((event) => (
              <li key={event.eventId}>
                <span>{timelineLabel(event.eventType)}</span>
                <time dateTime={event.occurredAt}>
                  {formatUiTime(event.occurredAt)}
                </time>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </>
  );
}

function PlannerDraftView(props: {
  readonly corporation: CorporationPublic;
  readonly error: PlannerErrorCode | undefined;
  readonly goal: GoalContractPublic;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onBack: () => void;
  readonly onCancel: () => Promise<void>;
  readonly onStart: () => Promise<void>;
  readonly operation: PlannerOperationPublic | undefined;
  readonly plan: PlannerDraftPublic | undefined;
  readonly planReviewError: PlanReviewFailure["error"] | undefined;
  readonly planVersions: readonly PlannerDraftPublic[];
  readonly onApprovePlan: (plan: PlannerDraftPublic) => Promise<void>;
  readonly onCreateOrganization: (plan: PlannerDraftPublic) => Promise<void>;
  readonly onActivateOrganization: (
    request: OrganizationActivationRequest,
  ) => Promise<void>;
  readonly onSaveVersion: (
    request: PlanReviewSaveVersionRequest,
  ) => Promise<void>;
  readonly providers: readonly ProviderPublic[];
  readonly organizationError: OrganizationProposalErrorCode | undefined;
  readonly organizationActivation: OrganizationActivation | undefined;
  readonly organizationActivationError:
    OrganizationActivationErrorCode | undefined;
  readonly executionStart: ExecutionStart | undefined;
  readonly executionStartError: ExecutionStartErrorCode | undefined;
  readonly onStartExecution: () => Promise<void>;
  readonly organizationProposal: OrganizationProposal | undefined;
  readonly saving: boolean;
  readonly selectedProviderId: string | undefined;
  readonly setSelectedProviderId: (value: string | undefined) => void;
  readonly statusMessage: string;
}) {
  const operation = props.operation;
  const plan = props.plan ?? operation?.plan;
  const generating = operation?.status === "GENERATING";
  const terminalWithoutPlan =
    plan === undefined &&
    ["FAILED", "CANCELLED", "INTERRUPTED"].includes(operation?.status ?? "");
  return (
    <>
      <header className="page-header page-header--create">
        <div>
          <button className="back-button" onClick={props.onBack} type="button">
            ← 目标合同
          </button>
          <p className="eyebrow">
            {props.corporation.name} · 已批准目标版本 {props.goal.version}
          </p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            {plan === undefined ? "生成并验证计划" : "审阅和批准计划"}
          </h1>
          <p>
            {plan === undefined
              ? "软件会先生成结构化草稿，再立即进行本地验证。验证不会再次调用模型服务商。"
              : "你可以有限编辑并保存新版本，也可以批准已验证版本。批准不会组队或开始执行。"}
          </p>
        </div>
        <div className="status-badge-group">
          <span className="status-badge status-badge--neutral">
            {internalLabel(operation?.status ?? "NOT_STARTED")}
          </span>
          {plan !== undefined && (
            <span className="status-badge status-badge--neutral">
              {internalLabel(plan.status)} ·{" "}
              {internalLabel(plan.validationStatus)}
            </span>
          )}
        </div>
      </header>
      {props.error !== undefined && <PlannerError code={props.error} />}
      {props.planReviewError !== undefined && (
        <PlanReviewError error={props.planReviewError} plan={plan} />
      )}
      {props.organizationError !== undefined && (
        <OrganizationProposalError code={props.organizationError} />
      )}
      {props.organizationActivationError !== undefined && (
        <OrganizationActivationErrorView
          code={props.organizationActivationError}
        />
      )}
      {props.executionStartError !== undefined && (
        <ExecutionStartErrorView code={props.executionStartError} />
      )}
      {props.statusMessage.length > 0 && (
        <p className="inline-status" role="status">
          {props.statusMessage}
        </p>
      )}
      {terminalWithoutPlan && (
        <section className="error-state" role="status">
          <div>
            <p className="eyebrow">没有保存计划</p>
            <h2>{internalLabel(operation?.status ?? "")}</h2>
            {operation?.failureReason !== undefined && (
              <p>
                原因：{plannerFailureReasonLabel(operation.failureReason)}（
                <code>{operation.failureReason}</code>）
              </p>
            )}
            <p>
              请在下方重新选择模型服务商和模型，再明确发起一次新尝试。软件不会自动重试。
            </p>
          </div>
        </section>
      )}
      {plan === undefined && (
        <section
          className="goal-analysis"
          aria-labelledby="planner-provider-title"
        >
          <h2 id="planner-provider-title">
            {terminalWithoutPlan
              ? "重新选择模型服务商和准确模型"
              : "模型服务商和准确模型"}
          </h2>
          <label className="field">
            已验证的模型服务商 / 模型
            <select
              disabled={generating || props.saving}
              onChange={(event) =>
                props.setSelectedProviderId(event.target.value || undefined)
              }
              value={props.selectedProviderId ?? ""}
            >
              <option value="">请明确选择</option>
              {props.providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} · {provider.selectedModelId}
                </option>
              ))}
            </select>
          </label>
          <div className="disclosure-card">
            <h3>将发送给该模型服务商的数据</h3>
            <ul>
              <li>当前已批准的目标合同</li>
              <li>软件内置的能力、工具和媒体类型允许列表</li>
            </ul>
            <p>
              不会发送：工作区路径、目录列表、文件、API Key
              或任何未批准的目标版本。
            </p>
          </div>
          <div className="analysis-actions">
            <button
              className="primary-button"
              disabled={
                props.selectedProviderId === undefined ||
                generating ||
                props.saving
              }
              onClick={() => void props.onStart()}
              type="button"
            >
              {generating
                ? "正在生成…"
                : terminalWithoutPlan
                  ? "重新生成并验证计划"
                  : "生成并验证计划"}
            </button>
            {generating && (
              <button
                className="secondary-button"
                onClick={() => void props.onCancel()}
                type="button"
              >
                取消
              </button>
            )}
          </div>
        </section>
      )}
      {plan !== undefined && (
        <PlanReviewPanel
          currentPlan={props.plan ?? plan}
          displayedPlan={plan}
          onApprove={props.onApprovePlan}
          onCreateOrganization={props.onCreateOrganization}
          onActivateOrganization={props.onActivateOrganization}
          executionStart={props.executionStart}
          onStartExecution={props.onStartExecution}
          onSaveVersion={props.onSaveVersion}
          organizationProposal={props.organizationProposal}
          organizationActivation={props.organizationActivation}
          providers={props.providers}
          saving={props.saving}
          versions={props.planVersions}
        />
      )}
    </>
  );
}

function ReviewBlock(props: {
  readonly empty?: string;
  readonly items: readonly string[];
  readonly title: string;
}) {
  return (
    <section className="review-block">
      <h2>{props.title}</h2>
      {props.items.length === 0 ? (
        <p>{props.empty}</p>
      ) : (
        <ul>
          {props.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WorkspaceError(props: {
  readonly code: WorkspaceIpcErrorCode;
  readonly title: string;
}) {
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">需要处理</p>
        <h2>{props.title}</h2>
        <p>{workspaceErrorMessage(props.code)}</p>
      </div>
      <code>{props.code}</code>
    </section>
  );
}

function GoalError({ code }: { readonly code: GoalContractErrorCode }) {
  const messages: Record<GoalContractErrorCode, string> = {
    VALIDATION_FAILED: "请填写必填内容，并删除重复或无效的值。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    CORPORATION_NOT_FOUND: "该公司已不存在，请返回控制台。",
    VERSION_CONFLICT: "目标合同已经变化，请重新加载后再试。",
    STATE_CONFLICT: "公司当前状态不允许执行此操作。",
    ASSUMPTION_CONFIRMATION_REQUIRED: "批准前请确认每一项高影响假设。",
    COMMAND_CONFLICT: "本次命令编号已被其他输入使用，请重新操作。",
    STORAGE_UNAVAILABLE: "本地存储不可用，输入内容仍然保留。恢复后请重试。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">目标合同没有改变</p>
        <h2>此操作需要处理</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function GoalEngineError({ code }: { readonly code: GoalEngineErrorCode }) {
  const messages: Record<GoalEngineErrorCode, string> = {
    VALIDATION_FAILED:
      "请选择可用的工作区和已验证的模型服务商，然后填写公司名称和目标。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    NOT_FOUND: "目标分析记录已不存在。",
    VERSION_CONFLICT:
      "公司、目标、模型服务商或分析依据已经变化，请重新加载后再试。",
    STATE_CONFLICT: "目标分析的当前状态不允许执行此操作。",
    INCOMPLETE_ANSWERS: "继续前请回答当前全部高影响问题。",
    PROVIDER_UNAVAILABLE: "所选模型服务商、API Key、验证结果或模型已不可用。",
    CANCELLED: "目标分析已取消，没有保存目标。",
    STORAGE_UNAVAILABLE: "目标分析存储不可用，不能认为操作成功。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">目标分析未完成</p>
        <h2>此操作需要处理</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function PlannerError({ code }: { readonly code: PlannerErrorCode }) {
  const messages: Record<PlannerErrorCode, string> = {
    VALIDATION_FAILED: "请选择可用且已验证的模型服务商和准确模型。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    NOT_FOUND: "规划记录已不存在。",
    VERSION_CONFLICT:
      "公司、已批准目标、模型服务商或模型已经变化，请重新加载后再试。",
    STATE_CONFLICT: "开始规划需要当前已批准的目标，并且不能已有活动计划。",
    PROVIDER_UNAVAILABLE: "所选模型服务商、API Key、验证结果或准确模型不可用。",
    INPUT_TOO_LARGE:
      "已批准目标超过安全请求上限。没有发送数据，也没有保存计划。",
    CANCELLED: "计划生成已取消，没有保存计划。",
    STORAGE_UNAVAILABLE: "规划存储不可用，不能认为计划已经保存。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">没有创建计划草稿</p>
        <h2>此操作需要处理</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function PlanReviewError(props: {
  readonly error: PlanReviewFailure["error"];
  readonly plan: PlannerDraftPublic | undefined;
}) {
  const messages: Record<PlanReviewFailure["error"]["code"], string> = {
    VALIDATION_FAILED: "计划编辑内容不完整或格式不正确，请检查后再试。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    NOT_FOUND: "当前计划已经不存在，请重新进入计划审阅。",
    VERSION_CONFLICT: "计划版本已经变化，请重新加载后再操作。",
    STATE_CONFLICT: "当前计划状态不允许保存或批准。",
    DELETE_BLOCKED:
      "不能删除这个任务，因为保留的任务仍在使用它的输出。请先保留该任务。",
    STORAGE_UNAVAILABLE: "本地计划存储不可用，不能认为操作已经成功。",
  };
  const taskById = new Map(
    (props.plan?.tasks ?? []).map((task) => [task.id, task.title]),
  );
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">计划没有改变</p>
        <h2>此操作需要处理</h2>
        <p>{messages[props.error.code]}</p>
        {props.error.blockingTaskIds !== undefined && (
          <ul>
            {props.error.blockingTaskIds.map((taskId) => (
              <li key={taskId}>{taskById.get(taskId) ?? "受影响任务"}</li>
            ))}
          </ul>
        )}
      </div>
      <code>{props.error.code}</code>
    </section>
  );
}

function OrganizationProposalError(props: {
  readonly code: OrganizationProposalErrorCode;
}) {
  const messages: Record<OrganizationProposalErrorCode, string> = {
    VALIDATION_FAILED: "组队请求内容不完整或格式不正确。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    PLAN_NOT_APPROVED: "当前计划尚未批准，不能开始组队。",
    CURRENT_PLAN_CHANGED: "计划版本已经变化，请重新加载后再开始组队。",
    COMMAND_CONFLICT: "这次操作编号已用于其他请求，请重新点击开始组队。",
    ORGANIZATION_NOT_FOUND: "没有找到对应的计划或团队草案。",
    STORAGE_FAILURE: "本地团队草案存储不可用，不能认为组队已经成功。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">没有生成团队草案</p>
        <h2>组队失败</h2>
        <p>{messages[props.code]}</p>
        <p>
          软件不会自动重试，也没有激活团队或开始执行。请确认计划后再次点击“开始组队”。
        </p>
      </div>
    </section>
  );
}

function OrganizationActivationErrorView(props: {
  readonly code: OrganizationActivationErrorCode;
}) {
  const messages: Record<OrganizationActivationErrorCode, string> = {
    VALIDATION_FAILED: "团队配置不完整或格式不正确。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    ORGANIZATION_NOT_FOUND: "没有找到当前团队草案。",
    ORGANIZATION_NOT_DRAFT: "该团队已经激活或不再是可激活草案。",
    ORGANIZATION_CHANGED: "团队草案已经变化，请重新加载后再确认。",
    BLOCKING_CAPABILITY_GAP: "团队仍有阻断能力缺口，不能激活。",
    DEGRADED_GAP_ACCEPTANCE_REQUIRED: "请先明确接受可降级能力缺口。",
    PROVIDER_NOT_READY: "所选模型服务商未启用、没有 API Key 或连接验证已失效。",
    PROVIDER_CHANGED: "所选模型服务商配置已经变化，请重新选择。",
    MODEL_NOT_AVAILABLE: "所选模型已不在当前验证模型列表中。",
    COMMAND_CONFLICT: "这次操作编号已用于其他请求，请重新点击确认。",
    STORAGE_FAILURE: "本地团队激活存储不可用，不能认为团队已经激活。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">团队没有激活</p>
        <h2>确认团队失败</h2>
        <p>{messages[props.code]}</p>
        <p>软件不会自动重试，也没有开始执行任务。</p>
      </div>
      <code>{props.code}</code>
    </section>
  );
}

function ExecutionStartErrorView(props: {
  readonly code: ExecutionStartErrorCode;
}) {
  const messages: Record<ExecutionStartErrorCode, string> = {
    VALIDATION_FAILED: "开始执行请求不完整或格式不正确。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    CORPORATION_NOT_FOUND: "没有找到当前公司。",
    CORPORATION_CHANGED: "公司状态已经变化，请重新加载后再试。",
    STATE_CONFLICT: "公司已经开始运行，或当前状态不能开始执行。",
    WORKSPACE_UNAVAILABLE: "工作区当前不可用，请重新验证后再试。",
    PLAN_NOT_READY: "当前计划不是已批准且验证通过的版本。",
    ORGANIZATION_NOT_READY: "当前团队尚未正确激活。",
    PROVIDER_NOT_READY: "团队绑定的模型服务商或模型已经失效。",
    ASSIGNMENT_INVALID: "任务分工与当前团队成员不一致。",
    NO_ENTRY_TASK: "当前计划没有可以开始的入口任务。",
    COMMAND_CONFLICT: "这次操作编号已用于其他请求，请重新点击。",
    STORAGE_FAILURE: "本地执行记录保存失败，不能认为已经开始。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">没有开始执行</p>
        <h2>开始执行失败</h2>
        <p>{messages[props.code]}</p>
        <p>任务、成员和公司状态不会被当作已开始。软件不会自动重试。</p>
      </div>
      <code>{props.code}</code>
    </section>
  );
}

function CorporationStateError({
  code,
}: {
  readonly code: CorporationErrorCode;
}) {
  const messages: Record<CorporationErrorCode, string> = {
    VALIDATION_FAILED: "暂停或继续请求无效。",
    UNAUTHORIZED_CALLER: "该请求不是来自可信的软件窗口。",
    WORKSPACE_UNAVAILABLE: "工作区不可用，请重新验证后再试。",
    NOT_FOUND: "该公司已不存在，请返回控制台。",
    VERSION_CONFLICT: "公司已经变化，请重新加载当前状态后再试。",
    STATE_CONFLICT: "公司当前状态不能执行此操作。",
    COMMAND_CONFLICT: "本次命令编号已被其他输入使用，请重新操作。",
    STORAGE_UNAVAILABLE: "本地状态存储不可用，无法确认暂停或继续成功。",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">公司状态没有改变</p>
        <h2>暂停或继续失败</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function nativeCoreStatusLabel(state: NativeCoreState): string {
  if (state.status === "ready")
    return `本地核心已就绪 · 版本 ${state.result.version}`;
  return state.status === "loading" ? "本地核心正在启动" : "本地核心不可用";
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function isGoalProviderAvailable(provider: ProviderPublic): boolean {
  return (
    provider.configStatus === "ENABLED" &&
    provider.hasKey &&
    provider.connectionTest?.status === "VERIFIED" &&
    provider.selectedModelId !== undefined &&
    provider.connectionTest.models.some(
      ({ id }) => id === provider.selectedModelId,
    )
  );
}

function usageLabel(usage: GoalEngineOperationPublic["usage"]): string {
  const input = usage.inputTokens === undefined ? "?" : usage.inputTokens;
  const output = usage.outputTokens === undefined ? "?" : usage.outputTokens;
  return `用量：输入 ${input} / 输出 ${output} 个 token · 费用：${
    usage.costMicros === undefined ? "未知" : `${usage.costMicros} µUSD`
  }`;
}

function plannerFailureReasonLabel(
  reason: NonNullable<PlannerOperationPublic["failureReason"]>,
): string {
  const labels: Record<
    NonNullable<PlannerOperationPublic["failureReason"]>,
    string
  > = {
    PROVIDER_FAILURE: "模型服务商请求失败",
    INVALID_MODEL_OUTPUT: "第一次输出和一次修复结果都无效",
    INPUT_TOO_LARGE: "已批准目标超过安全输入上限",
    PROVIDER_UNAVAILABLE: "已绑定的模型服务商或准确模型变得不可用",
    VERSION_CONFLICT: "保存草稿前，规划依据已经变化",
    STORAGE_UNAVAILABLE: "本地规划存储失败",
  };
  return labels[reason];
}

function contentFromForm(
  form: typeof emptyContent,
  source: "MANUAL" | "MOCK",
): GoalContractContentInput {
  const goal = form.goal.trim();
  return {
    source,
    originalGoal: goal,
    statement: goal,
    successCriteria: lines(form.successCriteria),
    inScope: [],
    outOfScope: lines(form.outOfScope),
    constraints: lines(form.constraints),
    assumptions:
      form.assumption.trim().length === 0
        ? []
        : [
            {
              text: form.assumption.trim(),
              impact: "HIGH",
              confirmed: false,
            },
          ],
    deliverables: lines(form.deliverables),
    riskLevel: form.assumption.trim().length === 0 ? "LOW" : "HIGH",
    budget: {},
    stopConditions: [],
  };
}

function goalContent(goal: GoalContractPublic): GoalContractContentInput {
  return {
    source: goal.source,
    originalGoal: goal.originalGoal,
    statement: goal.statement,
    successCriteria: goal.successCriteria,
    inScope: goal.inScope,
    outOfScope: goal.outOfScope,
    constraints: goal.constraints,
    assumptions: goal.assumptions,
    deliverables: goal.deliverables,
    riskLevel: goal.riskLevel,
    budget: goal.budget,
    stopConditions: goal.stopConditions,
  };
}

function budgetLabel(goal: GoalContractPublic): string {
  const values = [
    goal.budget.costLimitMicros === undefined
      ? undefined
      : `费用 ${goal.budget.costLimitMicros} μ`,
    goal.budget.durationLimitMinutes === undefined
      ? undefined
      : `时长 ${goal.budget.durationLimitMinutes} 分钟`,
    goal.budget.maxRevisions === undefined
      ? undefined
      : `最多修改 ${goal.budget.maxRevisions} 次`,
  ].filter((value): value is string => value !== undefined);
  return values.length === 0 ? "没有单独设置任务预算" : values.join(" · ");
}

function mapCorporationError(code: string): GoalContractErrorCode {
  if (code === "NOT_FOUND") return "CORPORATION_NOT_FOUND";
  if (code === "VERSION_CONFLICT") return "VERSION_CONFLICT";
  if (code === "STATE_CONFLICT") return "STATE_CONFLICT";
  if (code === "COMMAND_CONFLICT") return "COMMAND_CONFLICT";
  if (code === "VALIDATION_FAILED") return "VALIDATION_FAILED";
  if (code === "UNAUTHORIZED_CALLER") return "UNAUTHORIZED_CALLER";
  return "STORAGE_UNAVAILABLE";
}

async function loadCorporations(
  workspaces: readonly WorkspacePublic[],
): Promise<readonly CorporationSummary[]> {
  const summaries: CorporationSummary[] = [];
  for (const workspace of workspaces) {
    const listed = await window.desktop.corporation.list({
      schemaVersion: "1.0",
      workspaceId: workspace.workspaceId,
    });
    if (!listed.ok) continue;
    for (const corporation of listed.value) {
      const goal = await window.desktop.goalContract.getCurrent({
        schemaVersion: "1.0",
        corporationId: corporation.id,
      });
      summaries.push({
        corporation,
        goal: goal.ok ? goal.value : null,
      });
    }
  }
  return summaries;
}

async function loadAndRevalidate(options: {
  readonly active: () => boolean;
  readonly onError: (code: WorkspaceIpcErrorCode) => void;
  readonly onLoaded: (workspaces: readonly WorkspacePublic[]) => void;
  readonly onRefreshEnd: (workspaceId: string) => void;
  readonly onRefreshError: (
    workspaceId: string,
    code: WorkspaceIpcErrorCode,
  ) => void;
  readonly onRefreshStart: (workspaceIds: readonly string[]) => void;
  readonly onUpdated: (workspace: WorkspacePublic) => void;
}) {
  try {
    const listed = await window.desktop.workspace.list();
    if (!options.active()) return;
    if (!listed.ok) {
      options.onError(listed.error.code);
      options.onLoaded([]);
      return;
    }
    options.onLoaded(listed.value);
    options.onRefreshStart(listed.value.map(({ workspaceId }) => workspaceId));
    await Promise.all(
      listed.value.map(async (workspace) => {
        try {
          const result = await window.desktop.workspace.revalidate(
            workspace.workspaceId,
          );
          if (!options.active()) return;
          if (result.ok) options.onUpdated(result.value);
          else options.onRefreshError(workspace.workspaceId, result.error.code);
        } catch {
          if (options.active()) {
            options.onRefreshError(
              workspace.workspaceId,
              "VERIFICATION_FAILED",
            );
          }
        } finally {
          if (options.active()) options.onRefreshEnd(workspace.workspaceId);
        }
      }),
    );
  } catch {
    if (options.active()) {
      options.onError("STORAGE_UNAVAILABLE");
      options.onLoaded([]);
    }
  }
}
