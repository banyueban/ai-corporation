import type {
  WorkspaceIpcErrorCode,
  WorkspacePublic,
} from "@ai-corporation/protocols";

export interface WorkspacePresentation {
  readonly accessLabel: string;
  readonly permissionLabel: string;
  readonly recoveryAction: string | undefined;
  readonly tone: "positive" | "warning" | "critical" | "neutral";
}

export function presentWorkspace(
  workspace: WorkspacePublic,
): WorkspacePresentation {
  const permission =
    workspace.permissionMode === "READ_WRITE" ? "Read and write" : "Read only";
  switch (workspace.accessStatus) {
    case "AVAILABLE":
      return {
        accessLabel: "Available",
        permissionLabel: permission,
        recoveryAction: undefined,
        tone: "positive",
      };
    case "MISSING":
      return {
        accessLabel: "Folder missing",
        permissionLabel: `Last verified: ${permission.toLowerCase()}`,
        recoveryAction: "Restore the folder or select another workspace.",
        tone: "critical",
      };
    case "PERMISSION_DENIED":
      return {
        accessLabel: "Permission denied",
        permissionLabel: `Last verified: ${permission.toLowerCase()}`,
        recoveryAction:
          "Restore operating-system access, then verify this workspace again.",
        tone: "critical",
      };
    case "UNVERIFIED":
      return {
        accessLabel: "Verification required",
        permissionLabel: `Last verified: ${permission.toLowerCase()}`,
        recoveryAction: "Verify before using this workspace.",
        tone: "warning",
      };
  }
}

export function workspaceErrorMessage(code: WorkspaceIpcErrorCode): string {
  switch (code) {
    case "NATIVE_CORE_UNAVAILABLE":
      return "Workspace verification is unavailable. Restart the application, then try again.";
    case "STORAGE_UNAVAILABLE":
      return "Saved workspaces could not be loaded. Restart the application; no new authorization was recorded.";
    case "SELECTION_UNAVAILABLE":
      return "The folder selector could not be opened. Try again after checking the desktop session.";
    case "WORKSPACE_NOT_FOUND":
      return "This workspace no longer exists in local application data. Reload the dashboard.";
    case "VERIFICATION_FAILED":
      return "The selected folder could not be verified. The existing authorization was not changed.";
    case "IPC_UNAUTHORIZED":
    case "INVALID_REQUEST":
      return "The workspace request was rejected by the application security boundary.";
  }
}

export function replaceWorkspace(
  workspaces: readonly WorkspacePublic[],
  updated: WorkspacePublic,
): readonly WorkspacePublic[] {
  const index = workspaces.findIndex(
    (workspace) => workspace.workspaceId === updated.workspaceId,
  );
  if (index === -1) {
    return [...workspaces, updated];
  }
  return workspaces.map((workspace, currentIndex) =>
    currentIndex === index ? updated : workspace,
  );
}
