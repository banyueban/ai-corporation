import type {
  HealthResult,
  WorkspaceIpcErrorCode,
  WorkspacePublic,
} from "@ai-corporation/protocols";
import { useEffect, useRef, useState, type RefObject } from "react";
import {
  presentWorkspace,
  replaceWorkspace,
  workspaceErrorMessage,
} from "./workspace-view-model";

type NativeCoreState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly result: HealthResult }
  | { readonly status: "degraded" };

type Route = "dashboard" | "create";

export function App() {
  const { versions } = window.desktop;
  const [route, setRoute] = useState<Route>("dashboard");
  const [nativeCore, setNativeCore] = useState<NativeCoreState>({
    status: "loading",
  });
  const [workspaces, setWorkspaces] = useState<readonly WorkspacePublic[]>([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(true);
  const [loadError, setLoadError] = useState<WorkspaceIpcErrorCode>();
  const [operationError, setOperationError] = useState<WorkspaceIpcErrorCode>();
  const [statusMessage, setStatusMessage] = useState("");
  const [selecting, setSelecting] = useState(false);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string>();
  const [refreshingIds, setRefreshingIds] = useState<readonly string[]>([]);
  const createHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;

    void window.desktop
      .health()
      .then((result) => {
        if (active) {
          setNativeCore({ status: "ready", result });
        }
      })
      .catch(() => {
        if (active) {
          setNativeCore({ status: "degraded" });
        }
      });

    void loadAndRevalidate({
      active: () => active,
      onError: setLoadError,
      onLoaded: (loaded) => {
        setWorkspaces(loaded);
        setLoadingWorkspaces(false);
      },
      onRefreshEnd: (workspaceId) => {
        setRefreshingIds((current) =>
          current.filter((currentId) => currentId !== workspaceId),
        );
      },
      onRefreshError: (workspaceId, code) => {
        setOperationError(code);
        setStatusMessage(
          `Workspace ${workspaceId.slice(0, 8)} could not be verified.`,
        );
      },
      onRefreshStart: (workspaceIds) => setRefreshingIds(workspaceIds),
      onUpdated: (updated) =>
        setWorkspaces((current) => replaceWorkspace(current, updated)),
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (route === "create") {
      createHeading.current?.focus();
    }
  }, [route]);

  const openCreate = () => {
    setOperationError(undefined);
    setStatusMessage("");
    setSelectedWorkspaceId(undefined);
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
      const selectedWorkspace = result.value.workspace;
      setWorkspaces((current) => replaceWorkspace(current, selectedWorkspace));
      setSelectedWorkspaceId(selectedWorkspace.workspaceId);
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

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Application navigation">
        <div>
          <p className="brand-mark" aria-label="AI Corporation">
            AC
          </p>
          <p className="brand-name">AI Corporation</p>
        </div>
        <nav>
          <button
            aria-current={route === "dashboard" ? "page" : undefined}
            className="nav-button"
            onClick={() => setRoute("dashboard")}
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
        <div className="runtime-summary" aria-live="polite">
          <span
            className={`status-dot status-dot--${nativeCore.status}`}
            aria-hidden="true"
          />
          <span>
            {nativeCore.status === "loading" && "Native Core starting"}
            {nativeCore.status === "ready" &&
              `Native Core ready · v${nativeCore.result.version}`}
            {nativeCore.status === "degraded" && "Native Core unavailable"}
          </span>
          <small>
            Electron {versions.electron} · Chrome {versions.chrome}
          </small>
        </div>
      </aside>

      <main className="page">
        {route === "dashboard" ? (
          <Dashboard
            loadError={loadError}
            loading={loadingWorkspaces}
            onCreate={openCreate}
            onRevalidate={revalidateWorkspace}
            operationError={operationError}
            refreshingIds={refreshingIds}
            workspaces={workspaces}
          />
        ) : (
          <CreateWorkspace
            error={operationError}
            headingRef={createHeading}
            onBack={() => setRoute("dashboard")}
            onSelect={selectWorkspace}
            selecting={selecting}
            selectedWorkspace={workspaces.find(
              (workspace) => workspace.workspaceId === selectedWorkspaceId,
            )}
            statusMessage={statusMessage}
          />
        )}
        {route === "dashboard" && (
          <p className="sr-only" aria-live="polite">
            {statusMessage}
          </p>
        )}
      </main>
    </div>
  );
}

function Dashboard(props: {
  readonly loadError: WorkspaceIpcErrorCode | undefined;
  readonly loading: boolean;
  readonly onCreate: () => void;
  readonly onRevalidate: (workspaceId: string) => Promise<void>;
  readonly operationError: WorkspaceIpcErrorCode | undefined;
  readonly refreshingIds: readonly string[];
  readonly workspaces: readonly WorkspacePublic[];
}) {
  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Local-first workspace</p>
          <h1>Dashboard</h1>
          <p>
            Choose the folders AI Corporation may use. Authorization never
            extends beyond a selected root.
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
        <ErrorState
          code={props.loadError}
          title="Saved workspaces are unavailable"
        />
      )}
      {props.operationError !== undefined && (
        <ErrorState
          code={props.operationError}
          title="Workspace verification needs attention"
        />
      )}

      {props.loading ? (
        <section aria-busy="true" aria-label="Loading workspaces">
          <div className="skeleton-card" />
          <div className="skeleton-card skeleton-card--short" />
        </section>
      ) : props.workspaces.length === 0 && props.loadError === undefined ? (
        <section className="empty-state" aria-labelledby="empty-title">
          <p className="empty-kicker">No authorized workspaces</p>
          <h2 id="empty-title">Create your first Corporation</h2>
          <p>
            Start by selecting one local folder. The app will verify the actual
            read and write permission before saving the authorization.
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
                  data-workspace-id={workspace.workspaceId}
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
                  <h3 title={workspace.displayPath}>{workspace.displayPath}</h3>
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
      )}
    </>
  );
}

function CreateWorkspace(props: {
  readonly error: WorkspaceIpcErrorCode | undefined;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onBack: () => void;
  readonly onSelect: () => Promise<void>;
  readonly selecting: boolean;
  readonly selectedWorkspace: WorkspacePublic | undefined;
  readonly statusMessage: string;
}) {
  const selected = props.selectedWorkspace;
  const presentation =
    selected === undefined ? undefined : presentWorkspace(selected);

  return (
    <>
      <header className="page-header page-header--create">
        <div>
          <button className="back-button" onClick={props.onBack} type="button">
            ← Dashboard
          </button>
          <p className="eyebrow">New Corporation · Workspace step</p>
          <h1 ref={props.headingRef} tabIndex={-1}>
            Choose a workspace
          </h1>
          <p>
            Select one local folder to authorize. Goal and Corporation details
            are added in a later project task.
          </p>
        </div>
      </header>

      {props.error !== undefined && (
        <ErrorState code={props.error} title="Workspace was not authorized" />
      )}

      <section className="selection-panel" aria-labelledby="selection-title">
        <div>
          <p className="eyebrow">Required</p>
          <h2 id="selection-title">Workspace folder</h2>
          <p>
            The system selector is the only way to grant access. The Renderer
            cannot type or submit an absolute path.
          </p>
        </div>
        <button
          aria-describedby="selection-help"
          className="primary-button"
          disabled={props.selecting}
          onClick={() => void props.onSelect()}
          type="button"
        >
          {props.selecting ? "Opening selector…" : "Select folder…"}
        </button>
        <p className="selection-help" id="selection-help">
          Selecting a folder does not read or modify its files. A temporary,
          hidden permission probe is created only to determine write access and
          is removed immediately.
        </p>
      </section>

      {props.statusMessage.length > 0 && (
        <p className="inline-status" role="status">
          {props.statusMessage}
        </p>
      )}

      {selected !== undefined && presentation !== undefined && (
        <section
          className="selected-workspace"
          aria-labelledby="selected-title"
        >
          <div>
            <p className="eyebrow">Authorized</p>
            <h2 id="selected-title">{selected.displayPath}</h2>
          </div>
          <dl>
            <div>
              <dt>Access</dt>
              <dd>{presentation.accessLabel}</dd>
            </div>
            <div>
              <dt>Permission</dt>
              <dd>{presentation.permissionLabel}</dd>
            </div>
            <div>
              <dt>Boundary</dt>
              <dd>Selected folder only</dd>
            </div>
          </dl>
          <button
            className="secondary-button"
            onClick={props.onBack}
            type="button"
          >
            Return to Dashboard
          </button>
        </section>
      )}
    </>
  );
}

function ErrorState(props: {
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
    if (!options.active()) {
      return;
    }
    if (!listed.ok) {
      options.onError(listed.error.code);
      options.onLoaded([]);
      return;
    }
    options.onLoaded(listed.value);
    options.onRefreshStart(
      listed.value.map((workspace) => workspace.workspaceId),
    );
    await Promise.all(
      listed.value.map(async (workspace) => {
        try {
          const result = await window.desktop.workspace.revalidate(
            workspace.workspaceId,
          );
          if (!options.active()) {
            return;
          }
          if (result.ok) {
            options.onUpdated(result.value);
          } else {
            options.onRefreshError(workspace.workspaceId, result.error.code);
          }
        } catch {
          if (options.active()) {
            options.onRefreshError(
              workspace.workspaceId,
              "VERIFICATION_FAILED",
            );
          }
        } finally {
          if (options.active()) {
            options.onRefreshEnd(workspace.workspaceId);
          }
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
