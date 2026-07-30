import type {
  HealthResult,
  WorkspaceListIpcResult,
  WorkspaceRevalidateIpcResult,
  WorkspaceSelectIpcResult,
} from "@ai-corporation/protocols";

export interface DesktopApi {
  health(): Promise<HealthResult>;
  readonly workspace: Readonly<{
    list(): Promise<WorkspaceListIpcResult>;
    revalidate(workspaceId: string): Promise<WorkspaceRevalidateIpcResult>;
    select(): Promise<WorkspaceSelectIpcResult>;
  }>;
  readonly versions: Readonly<{
    readonly chrome: string;
    readonly electron: string;
    readonly node: string;
  }>;
}
