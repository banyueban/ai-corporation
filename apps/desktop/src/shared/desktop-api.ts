import type {
  CorporationArchiveRequest,
  CorporationCreateRequest,
  CorporationGetRequest,
  CorporationItemResult,
  CorporationListRequest,
  CorporationListResult,
  CorporationPauseRequest,
  CorporationResumeRequest,
  CorporationUpdateNameRequest,
  GoalContractApproveRequest,
  GoalContractGetCurrentRequest,
  GoalContractItemResult,
  GoalContractListResult,
  GoalContractListVersionsRequest,
  GoalContractNullableItemResult,
  GoalContractSaveDraftRequest,
  HealthResult,
  ProviderDeleteKeyRequest,
  ProviderCancelConnectionTestRequest,
  ProviderCancelConnectionTestResult,
  ProviderCancelGenerationTestRequest,
  ProviderCancelGenerationTestResult,
  ProviderConnectionTestResult,
  ProviderGenerationTestResult,
  ProviderItemResult,
  ProviderListRequest,
  ProviderListResult,
  ProviderRevealKeyRequest,
  ProviderRevealKeyResult,
  ProviderSaveRequest,
  ProviderTestConnectionRequest,
  ProviderTestGenerationRequest,
  TimelineListRequest,
  TimelineListResult,
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
    pause(request: CorporationPauseRequest): Promise<CorporationItemResult>;
    resume(request: CorporationResumeRequest): Promise<CorporationItemResult>;
    updateName(
      request: CorporationUpdateNameRequest,
    ): Promise<CorporationItemResult>;
  }>;
  readonly goalContract: Readonly<{
    approve(
      request: GoalContractApproveRequest,
    ): Promise<GoalContractItemResult>;
    getCurrent(
      request: GoalContractGetCurrentRequest,
    ): Promise<GoalContractNullableItemResult>;
    listVersions(
      request: GoalContractListVersionsRequest,
    ): Promise<GoalContractListResult>;
    saveDraft(
      request: GoalContractSaveDraftRequest,
    ): Promise<GoalContractItemResult>;
  }>;
  health(): Promise<HealthResult>;
  readonly provider: Readonly<{
    cancelConnectionTest(
      request: ProviderCancelConnectionTestRequest,
    ): Promise<ProviderCancelConnectionTestResult>;
    cancelGenerationTest(
      request: ProviderCancelGenerationTestRequest,
    ): Promise<ProviderCancelGenerationTestResult>;
    deleteKey(request: ProviderDeleteKeyRequest): Promise<ProviderItemResult>;
    list(request: ProviderListRequest): Promise<ProviderListResult>;
    revealKey(
      request: ProviderRevealKeyRequest,
    ): Promise<ProviderRevealKeyResult>;
    save(request: ProviderSaveRequest): Promise<ProviderItemResult>;
    testConnection(
      request: ProviderTestConnectionRequest,
    ): Promise<ProviderConnectionTestResult>;
    testGeneration(
      request: ProviderTestGenerationRequest,
    ): Promise<ProviderGenerationTestResult>;
  }>;
  readonly timeline: Readonly<{
    list(request: TimelineListRequest): Promise<TimelineListResult>;
  }>;
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
