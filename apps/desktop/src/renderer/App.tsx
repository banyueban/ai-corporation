import type {
  CorporationPublic,
  CorporationErrorCode,
  GoalContractContentInput,
  GoalContractErrorCode,
  GoalContractPublic,
  HealthResult,
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

type NativeCoreState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: HealthResult }
  | { readonly status: "degraded" };
type Route = "dashboard" | "create" | "review";
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
        setStatusMessage(
          `Workspace ${workspaceId.slice(0, 8)} could not be verified.`,
        );
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
    (route === "review" ? reviewHeading : createHeading).current?.focus();
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
    setStatusMessage("");
    setSelectedWorkspaceId(
      workspaces.find((workspace) => workspace.accessStatus === "AVAILABLE")
        ?.workspaceId,
    );
    setForm(emptyContent);
    setDraftCorporation(undefined);
    setDirty(false);
    setRoute("create");
  };

  const selectWorkspace = async () => {
    setSelecting(true);
    setOperationError(undefined);
    setStatusMessage("Opening the system folder selector.");
    try {
      const result = await window.desktop.workspace.select();
      if (!result.ok) {
        setOperationError(result.error.code);
        setStatusMessage("");
        return;
      }
      if (result.value.status === "CANCELLED") {
        setStatusMessage(
          "Folder selection was cancelled. No authorization was saved.",
        );
        return;
      }
      const selected = result.value.workspace;
      setWorkspaces((current) => replaceWorkspace(current, selected));
      setSelectedWorkspaceId(selected.workspaceId);
      setStatusMessage("Workspace authorized and saved.");
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
        setStatusMessage("Workspace verification updated.");
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
          "Corporation was created, but its Goal Contract was not saved. Your input is retained; retry will not create another Corporation.",
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
        ? "Restoring the persisted pre-pause state."
        : "Pausing at the current local checkpoint.",
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
          ? "Corporation paused. No Plan, Task, or execution has started."
          : `Corporation resumed to ${result.value.status}. No command or event was replayed.`,
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
      setStatusMessage(
        "Goal Contract approved. Planning and execution have not started.",
      );
      await refreshReview(corporation.id);
    } catch {
      setGoalError("STORAGE_UNAVAILABLE");
    } finally {
      setSaving(false);
    }
  };

  const leaveCreate = () => {
    if (dirty && !window.confirm("Discard the unsaved Goal Contract input?")) {
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
            headingRef={createHeading}
            onBack={leaveCreate}
            onSave={saveGoal}
            onSelect={selectWorkspace}
            onUpdate={updateForm}
            saving={saving}
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
              saving={saving}
              statePending={statePending}
              statusMessage={statusMessage}
              timeline={timeline}
              versions={versionsList}
            />
          )}
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
  readonly route: Route;
  readonly versions: { readonly chrome: string; readonly electron: string };
}) {
  return (
    <aside className="sidebar" aria-label="Application navigation">
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
            Dashboard
          </button>
          <button className="nav-button" disabled type="button">
            Running
          </button>
          <button className="nav-button" disabled type="button">
            Approvals
          </button>
          <button className="nav-button" disabled type="button">
            Settings
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
          <p className="eyebrow">Local-first workspace</p>
          <h1>Dashboard</h1>
          <p>
            Create and restore Corporation Goal Contracts inside explicitly
            authorized local workspaces.
          </p>
        </div>
        <button
          className="primary-button"
          onClick={props.onCreate}
          type="button"
        >
          New Corporation
        </button>
      </header>
      {props.loadError !== undefined && (
        <WorkspaceError
          code={props.loadError}
          title="Saved workspaces are unavailable"
        />
      )}
      {props.operationError !== undefined && (
        <WorkspaceError
          code={props.operationError}
          title="Workspace verification needs attention"
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
        <section aria-busy="true" aria-label="Loading workspaces">
          <div className="skeleton-card" />
        </section>
      ) : props.workspaces.length === 0 && props.loadError === undefined ? (
        <section className="empty-state" aria-labelledby="empty-title">
          <p className="empty-kicker">No authorized workspaces</p>
          <h2 id="empty-title">Create your first Corporation</h2>
          <p>
            Start by selecting one local folder. The app verifies its real
            access before saving the authorization.
          </p>
          <button
            className="primary-button"
            onClick={props.onCreate}
            type="button"
          >
            Select a workspace
          </button>
        </section>
      ) : (
        <>
          {props.corporations.length > 0 && (
            <section aria-labelledby="corporation-list-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Restored from SQLite</p>
                  <h2 id="corporation-list-title">Corporations</h2>
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
                        {summary.corporation.status}
                      </span>
                      <span className="permission-label">
                        Corporation v{summary.corporation.version}
                      </span>
                    </div>
                    <h3>{summary.corporation.name}</h3>
                    <p>
                      {summary.goal === null
                        ? "Corporation exists; its Goal Contract still needs to be saved."
                        : `Goal v${summary.goal.version}: ${summary.goal.statement}`}
                    </p>
                    {summary.corporation.status === "PAUSED" && (
                      <p>
                        Paused from {summary.corporation.pausedFrom} at{" "}
                        {summary.corporation.pausedAt}.
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
                          ? "Resuming…"
                          : "Pausing…"
                        : summary.corporation.status === "PAUSED"
                          ? "Resume Corporation"
                          : "Pause Corporation"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={summary.goal === null}
                      onClick={() => void props.onOpen(summary)}
                      type="button"
                    >
                      Open Goal Contract
                    </button>
                  </article>
                ))}
              </div>
            </section>
          )}
          <section aria-labelledby="workspace-list-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Authorized roots</p>
                <h2 id="workspace-list-title">Workspaces</h2>
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
                        {refreshing ? "Verifying" : presentation.accessLabel}
                      </span>
                      <span className="permission-label">
                        {presentation.permissionLabel}
                      </span>
                    </div>
                    <h3 title={workspace.displayPath}>
                      {workspace.displayPath}
                    </h3>
                    <p>
                      {presentation.recoveryAction ??
                        "This authorization is limited to the selected folder."}
                    </p>
                    <button
                      className="secondary-button"
                      disabled={refreshing}
                      onClick={() =>
                        void props.onRevalidate(workspace.workspaceId)
                      }
                      type="button"
                    >
                      {refreshing ? "Verifying…" : "Verify again"}
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
  readonly error: WorkspaceIpcErrorCode | undefined;
  readonly form: typeof emptyContent;
  readonly goalError: GoalContractErrorCode | undefined;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onBack: () => void;
  readonly onSave: (source: "MANUAL" | "MOCK") => Promise<void>;
  readonly onSelect: () => Promise<void>;
  readonly onUpdate: (field: keyof typeof emptyContent, value: string) => void;
  readonly saving: boolean;
  readonly selecting: boolean;
  readonly selectedWorkspaceId: string | undefined;
  readonly setSelectedWorkspaceId: (id: string) => void;
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
  return (
    <>
      <header className="page-header page-header--create">
        <div>
          <button className="back-button" onClick={props.onBack} type="button">
            ← Dashboard
          </button>
          <p className="eyebrow">New Corporation · Goal input</p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            Choose a workspace
          </h1>
          <p>
            Select an authorized folder, name the Corporation, and define a
            reviewable Goal Contract.
          </p>
        </div>
      </header>
      {props.error !== undefined && (
        <WorkspaceError
          code={props.error}
          title="Workspace was not authorized"
        />
      )}
      {props.goalError !== undefined && <GoalError code={props.goalError} />}
      <section className="selection-panel" aria-labelledby="selection-title">
        <div>
          <p className="eyebrow">Required boundary</p>
          <h2 id="selection-title">Workspace folder</h2>
          <p>
            The Renderer only receives the display path and public permission.
          </p>
        </div>
        <button
          className="secondary-button"
          disabled={props.selecting}
          onClick={() => void props.onSelect()}
          type="button"
        >
          {props.selecting ? "Opening selector…" : "Select folder…"}
        </button>
        {props.workspaces.length > 0 && (
          <label className="field selection-help">
            Authorized workspace
            <select
              onChange={(event) =>
                props.setSelectedWorkspaceId(event.target.value)
              }
              value={props.selectedWorkspaceId ?? ""}
            >
              <option value="">Choose…</option>
              {props.workspaces.map((workspace) => (
                <option
                  disabled={workspace.accessStatus !== "AVAILABLE"}
                  key={workspace.workspaceId}
                  value={workspace.workspaceId}
                >
                  {workspace.displayPath} · {workspace.permissionMode}
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
          {presentWorkspace(selected).permissionLabel} · selected folder only
        </p>
      )}
      <form className="goal-form">
        <label className="field">
          Corporation name *
          <input
            autoComplete="off"
            onChange={(event) =>
              props.onUpdate("corporationName", event.target.value)
            }
            value={props.form.corporationName}
          />
        </label>
        <label className="field field--wide">
          Goal *
          <textarea
            onChange={(event) => props.onUpdate("goal", event.target.value)}
            rows={5}
            value={props.form.goal}
          />
        </label>
        <label className="field field--wide">
          Success criteria * <span>One per line</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("successCriteria", event.target.value)
            }
            rows={3}
            value={props.form.successCriteria}
          />
        </label>
        <label className="field">
          Expected deliverables <span>One per line</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("deliverables", event.target.value)
            }
            rows={3}
            value={props.form.deliverables}
          />
        </label>
        <label className="field">
          Constraints <span>One per line</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("constraints", event.target.value)
            }
            rows={3}
            value={props.form.constraints}
          />
        </label>
        <label className="field">
          Out of scope <span>One per line</span>
          <textarea
            onChange={(event) =>
              props.onUpdate("outOfScope", event.target.value)
            }
            rows={3}
            value={props.form.outOfScope}
          />
        </label>
        <label className="field">
          High-impact assumption
          <input
            onChange={(event) =>
              props.onUpdate("assumption", event.target.value)
            }
            placeholder="Optional; confirmation happens in Review"
            value={props.form.assumption}
          />
        </label>
        <div className="form-actions field--wide">
          <button
            className="secondary-button"
            disabled={props.saving}
            onClick={(event) => submit(event, "MANUAL")}
            type="submit"
          >
            {props.saving ? "Saving…" : "Save manual draft"}
          </button>
          <button
            aria-describedby="mock-help"
            className="primary-button"
            disabled={props.saving}
            onClick={(event) => submit(event, "MOCK")}
            type="submit"
          >
            Create local Mock draft
          </button>
          <p id="mock-help">
            Mock is a deterministic local template. It does not call a model,
            Provider, tool, file system, or network.
          </p>
        </div>
      </form>
    </>
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
            ← Dashboard
          </button>
          <p className="eyebrow">
            {props.corporation.name} · Goal v{props.goal.version}
          </p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            Confirm Goal Contract
          </h1>
          <p>
            Approval confirms only this Goal Contract. Planning and execution
            remain outside this action.
          </p>
        </div>
        <div className="status-badge-group">
          <span
            aria-label="Corporation status"
            className="status-badge status-badge--neutral"
          >
            {props.corporation.status}
          </span>
          <span
            aria-label="Goal Contract status"
            className="status-badge status-badge--neutral"
          >
            {props.goal.status}
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
          Paused from {props.corporation.pausedFrom} at{" "}
          {props.corporation.pausedAt}. No Plan, Task, or execution has started.
        </p>
      )}
      <div className="review-grid">
        <ReviewBlock title="Goal summary" items={[props.goal.statement]} />
        <ReviewBlock
          title="Success criteria"
          items={props.goal.successCriteria}
        />
        <ReviewBlock
          title="In scope"
          items={props.goal.inScope}
          empty="Not specified"
        />
        <ReviewBlock
          title="Out of scope"
          items={props.goal.outOfScope}
          empty="Not specified"
        />
        <ReviewBlock
          title="Constraints"
          items={props.goal.constraints}
          empty="Not specified"
        />
        <ReviewBlock
          title="Deliverables"
          items={props.goal.deliverables}
          empty="Not specified"
        />
        <ReviewBlock
          title="Risk, budget, and stop conditions"
          items={[
            `Risk: ${props.goal.riskLevel}`,
            budgetLabel(props.goal),
            ...props.goal.stopConditions,
          ]}
        />
        <section
          className="review-block review-block--wide"
          aria-labelledby="assumptions-title"
        >
          <h2 id="assumptions-title">High-impact assumptions</h2>
          {props.assumptions.length === 0 ? (
            <p>None declared.</p>
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
                  <strong>{assumption.impact}</strong> · {assumption.text}
                </span>
              </label>
            ))
          )}
        </section>
      </div>
      <div className="review-actions">
        <p>
          This action will not generate a Plan, start execution, call a model,
          or modify workspace files.
        </p>
        <button
          className="secondary-button"
          disabled={props.statePending}
          onClick={() => void props.onStateChange()}
          type="button"
        >
          {props.statePending
            ? props.corporation.status === "PAUSED"
              ? "Resuming…"
              : "Pausing…"
            : props.corporation.status === "PAUSED"
              ? "Resume Corporation"
              : "Pause Corporation"}
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
          {props.saving ? "Confirming…" : "Confirm Goal Contract"}
        </button>
      </div>
      <div className="history-grid">
        <section className="history-panel" aria-labelledby="versions-title">
          <h2 id="versions-title">Versions</h2>
          <ol>
            {props.versions.map((version) => (
              <li key={version.version}>
                v{version.version} · {version.status} · {version.source}
              </li>
            ))}
          </ol>
        </section>
        <section className="history-panel" aria-labelledby="timeline-title">
          <h2 id="timeline-title">Timeline</h2>
          <ol>
            {props.timeline.map((event) => (
              <li key={event.eventId}>
                <span>{event.summary}</span>
                <time dateTime={event.occurredAt}>{event.occurredAt}</time>
              </li>
            ))}
          </ol>
        </section>
      </div>
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
        <p className="eyebrow">Action required</p>
        <h2>{props.title}</h2>
        <p>{workspaceErrorMessage(props.code)}</p>
      </div>
      <code>{props.code}</code>
    </section>
  );
}

function GoalError({ code }: { readonly code: GoalContractErrorCode }) {
  const messages: Record<GoalContractErrorCode, string> = {
    VALIDATION_FAILED:
      "Complete the required fields and remove duplicate or invalid values.",
    UNAUTHORIZED_CALLER:
      "The request did not come from the trusted app window.",
    CORPORATION_NOT_FOUND:
      "The Corporation no longer exists. Return to Dashboard.",
    VERSION_CONFLICT: "The Goal Contract changed. Reload it before retrying.",
    STATE_CONFLICT: "The Corporation state no longer permits this action.",
    ASSUMPTION_CONFIRMATION_REQUIRED:
      "Confirm every high-impact assumption before approving.",
    COMMAND_CONFLICT:
      "This command identity was already used for different input.",
    STORAGE_UNAVAILABLE:
      "Local storage is unavailable. Input is retained; retry after recovery.",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">Goal Contract not changed</p>
        <h2>Action needs attention</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function CorporationStateError({
  code,
}: {
  readonly code: CorporationErrorCode;
}) {
  const messages: Record<CorporationErrorCode, string> = {
    VALIDATION_FAILED: "The pause or resume request was invalid.",
    UNAUTHORIZED_CALLER:
      "The request did not come from the trusted app window.",
    WORKSPACE_UNAVAILABLE:
      "The Workspace is unavailable. Revalidate it before retrying.",
    NOT_FOUND: "The Corporation no longer exists. Return to Dashboard.",
    VERSION_CONFLICT:
      "The Corporation changed. Reload its current state before retrying.",
    STATE_CONFLICT: "The current Corporation state cannot perform this action.",
    COMMAND_CONFLICT:
      "This command identity was already used for different input.",
    STORAGE_UNAVAILABLE:
      "Local state storage is unavailable. No pause or resume was confirmed.",
  };
  return (
    <section className="error-state" role="alert">
      <div>
        <p className="eyebrow">Corporation state not changed</p>
        <h2>Pause or resume failed</h2>
        <p>{messages[code]}</p>
      </div>
      <code>{code}</code>
    </section>
  );
}

function nativeCoreStatusLabel(state: NativeCoreState): string {
  if (state.status === "ready")
    return `Native Core ready · v${state.result.version}`;
  return state.status === "loading"
    ? "Native Core starting"
    : "Native Core unavailable";
}

function lines(value: string): string[] {
  return value
    .split(/\r?\n/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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
      : `Cost ${goal.budget.costLimitMicros} μ`,
    goal.budget.durationLimitMinutes === undefined
      ? undefined
      : `Duration ${goal.budget.durationLimitMinutes} min`,
    goal.budget.maxRevisions === undefined
      ? undefined
      : `Revisions ${goal.budget.maxRevisions}`,
  ].filter((value): value is string => value !== undefined);
  return values.length === 0
    ? "No task-level budget overrides"
    : values.join(" · ");
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

function createUuidV7(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] ?? 0) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] ?? 0) & 0x3f);
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex
    .slice(6, 8)
    .join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
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
