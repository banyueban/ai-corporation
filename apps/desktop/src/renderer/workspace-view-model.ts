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
    workspace.permissionMode === "READ_WRITE" ? "可读写" : "只读";
  switch (workspace.accessStatus) {
    case "AVAILABLE":
      return {
        accessLabel: "可用",
        permissionLabel: permission,
        recoveryAction: undefined,
        tone: "positive",
      };
    case "MISSING":
      return {
        accessLabel: "文件夹不存在",
        permissionLabel: `上次验证权限：${permission}`,
        recoveryAction: "请恢复该文件夹，或选择另一个工作区。",
        tone: "critical",
      };
    case "PERMISSION_DENIED":
      return {
        accessLabel: "没有访问权限",
        permissionLabel: `上次验证权限：${permission}`,
        recoveryAction: "请恢复操作系统访问权限，然后重新验证该工作区。",
        tone: "critical",
      };
    case "UNVERIFIED":
      return {
        accessLabel: "需要验证",
        permissionLabel: `上次验证权限：${permission}`,
        recoveryAction: "使用该工作区前请先验证。",
        tone: "warning",
      };
  }
}

export function workspaceErrorMessage(code: WorkspaceIpcErrorCode): string {
  switch (code) {
    case "NATIVE_CORE_UNAVAILABLE":
      return "工作区验证功能暂时不可用。请重启软件后再试。";
    case "STORAGE_UNAVAILABLE":
      return "无法加载已保存的工作区。请重启软件；本次没有保存新的授权。";
    case "SELECTION_UNAVAILABLE":
      return "无法打开文件夹选择器。请检查桌面会话后再试。";
    case "WORKSPACE_NOT_FOUND":
      return "本地软件数据中已找不到该工作区。请重新加载控制台。";
    case "VERIFICATION_FAILED":
      return "无法验证所选文件夹，原有授权没有改变。";
    case "IPC_UNAUTHORIZED":
    case "INVALID_REQUEST":
      return "该工作区请求被软件的安全边界拒绝。";
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
