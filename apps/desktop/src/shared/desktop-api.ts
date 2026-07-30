import type {
  CorporationArchiveRequest,
  CorporationCreateRequest,
  CorporationGetRequest,
  CorporationItemResult,
  CorporationListRequest,
  CorporationListResult,
  CorporationUpdateNameRequest,
  HealthResult,
  WorkspaceListIpcResult,
  WorkspaceRevalidateIpcResult,
  WorkspaceSelectIpcResult,
} from "@ai-corporation/protocols";

export interface DesktopApi {
  readonly corporation: Readonly<{
    archive(request: CorporationArchiveRequest): Promise<CorporationItemResult>;
    create(request: CorporationCreateRequest): Promise<CorporationItemResult>;
    get(request: CorporationGetRequest): Promise<CorporationItemResult>;
    list(request: CorporationListRequest): Promise<CorporationListResult>;
    updateName(
      request: CorporationUpdateNameRequest,
    ): Promise<CorporationItemResult>;
  }>;
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
