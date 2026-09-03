import type {
  AgentRunCommandRequest,
  AgentRunGetCurrentRequest,
  AgentRunNullableResult,
  AgentRunResult,
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
  GoalEngineAnswerRequest,
  GoalEngineCancelRequest,
  GoalEngineGetCurrentRequest,
  GoalEngineItemResult,
  GoalEngineNullableItemResult,
  GoalEngineResolveExtensionRequest,
  GoalEngineStartRequest,
  ExecutionStartGetCurrentRequest,
  ExecutionStartItemResult,
  ExecutionStartNullableItemResult,
  ExecutionStartRequest,
  HealthResult,
  OrganizationActivationGetCurrentRequest,
  OrganizationActivationItemResult,
  OrganizationActivationNullableItemResult,
  OrganizationActivationRequest,
  OrganizationProposalCreateRequest,
  OrganizationProposalGetCurrentRequest,
  OrganizationProposalItemResult,
  OrganizationProposalNullableItemResult,
  PlannerCancelRequest,
  PlannerGetCurrentRequest,
  PlannerItemResult,
  PlannerNullableItemResult,
  PlannerStartRequest,
  PlanReviewApproveRequest,
  PlanReviewGetCurrentRequest,
  PlanReviewItemResult,
  PlanReviewListResult,
  PlanReviewListVersionsRequest,
  PlanReviewNullableItemResult,
  PlanReviewSaveVersionRequest,
  PiEmployeeItemResult,
  PiEmployeeListRequest,
  PiEmployeeListResult,
  PiEmployeeSaveRequest,
  PiCompanyCreateRequest,
  PiCompanyEmployeeRequest,
  PiCompanyItemResult,
  PiCompanyListRequest,
  PiCompanyListResult,
  PiCompanyUpdateNameRequest,
  PiCompanyWorkspaceRequest,
  PiSkillConfirmImportRequest,
  PiSkillItemResult,
  PiSkillListRequest,
  PiSkillListResult,
  PiSkillPreviewImportResult,
  PiTaskCommandRequest,
  PiTaskDeliverableActionResult,
  PiTaskDeliverablePreviewResult,
  PiTaskDeliverableRequest,
  PiTaskGetRequest,
  PiTaskListRequest,
  PiTaskListResult,
  PiTaskRequestChangesRequest,
  PiTaskResolveCommandApprovalRequest,
  PiTaskResult,
  PiTaskStartRequest,
  PiTaskAttachment,
  PiTaskAttachmentDiscardResult,
  PiTaskAttachmentStageResult,
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
  readonly agentRun: Readonly<{
    getCurrent(
      request: AgentRunGetCurrentRequest,
    ): Promise<AgentRunNullableResult>;
    continue(request: AgentRunCommandRequest): Promise<AgentRunResult>;
    retry(request: AgentRunCommandRequest): Promise<AgentRunResult>;
    cancel(request: AgentRunCommandRequest): Promise<AgentRunResult>;
  }>;
  readonly executionStart: Readonly<{
    getCurrent(
      request: ExecutionStartGetCurrentRequest,
    ): Promise<ExecutionStartNullableItemResult>;
    start(request: ExecutionStartRequest): Promise<ExecutionStartItemResult>;
  }>;
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
  readonly goalEngine: Readonly<{
    answer(request: GoalEngineAnswerRequest): Promise<GoalEngineItemResult>;
    cancel(request: GoalEngineCancelRequest): Promise<GoalEngineItemResult>;
    getCurrent(
      request: GoalEngineGetCurrentRequest,
    ): Promise<GoalEngineNullableItemResult>;
    resolveExtension(
      request: GoalEngineResolveExtensionRequest,
    ): Promise<GoalEngineItemResult>;
    start(request: GoalEngineStartRequest): Promise<GoalEngineItemResult>;
  }>;
  health(): Promise<HealthResult>;
  readonly organizationActivation: Readonly<{
    activate(
      request: OrganizationActivationRequest,
    ): Promise<OrganizationActivationItemResult>;
    getCurrent(
      request: OrganizationActivationGetCurrentRequest,
    ): Promise<OrganizationActivationNullableItemResult>;
  }>;
  readonly organizationProposal: Readonly<{
    create(
      request: OrganizationProposalCreateRequest,
    ): Promise<OrganizationProposalItemResult>;
    getCurrent(
      request: OrganizationProposalGetCurrentRequest,
    ): Promise<OrganizationProposalNullableItemResult>;
  }>;
  readonly planner: Readonly<{
    cancel(request: PlannerCancelRequest): Promise<PlannerItemResult>;
    getCurrent(
      request: PlannerGetCurrentRequest,
    ): Promise<PlannerNullableItemResult>;
    start(request: PlannerStartRequest): Promise<PlannerItemResult>;
  }>;
  readonly planReview: Readonly<{
    approve(request: PlanReviewApproveRequest): Promise<PlanReviewItemResult>;
    getCurrent(
      request: PlanReviewGetCurrentRequest,
    ): Promise<PlanReviewNullableItemResult>;
    listVersions(
      request: PlanReviewListVersionsRequest,
    ): Promise<PlanReviewListResult>;
    saveVersion(
      request: PlanReviewSaveVersionRequest,
    ): Promise<PlanReviewItemResult>;
  }>;
  readonly piEmployee: Readonly<{
    list(request: PiEmployeeListRequest): Promise<PiEmployeeListResult>;
    save(request: PiEmployeeSaveRequest): Promise<PiEmployeeItemResult>;
  }>;
  readonly piCompany: Readonly<{
    list(request: PiCompanyListRequest): Promise<PiCompanyListResult>;
    create(request: PiCompanyCreateRequest): Promise<PiCompanyItemResult>;
    updateName(
      request: PiCompanyUpdateNameRequest,
    ): Promise<PiCompanyItemResult>;
    addEmployee(
      request: PiCompanyEmployeeRequest,
    ): Promise<PiCompanyItemResult>;
    removeEmployee(
      request: PiCompanyEmployeeRequest,
    ): Promise<PiCompanyItemResult>;
    addWorkspace(
      request: PiCompanyWorkspaceRequest,
    ): Promise<PiCompanyItemResult>;
    removeWorkspace(
      request: PiCompanyWorkspaceRequest,
    ): Promise<PiCompanyItemResult>;
  }>;
  readonly piSkill: Readonly<{
    list(request: PiSkillListRequest): Promise<PiSkillListResult>;
    previewImport(
      request: PiSkillListRequest,
    ): Promise<PiSkillPreviewImportResult>;
    confirmImport(
      request: PiSkillConfirmImportRequest,
    ): Promise<PiSkillItemResult>;
  }>;
  readonly piTask: Readonly<{
    start(request: PiTaskStartRequest): Promise<PiTaskResult>;
    get(request: PiTaskGetRequest): Promise<PiTaskResult>;
    list(request: PiTaskListRequest): Promise<PiTaskListResult>;
    cancel(request: PiTaskCommandRequest): Promise<PiTaskResult>;
    accept(request: PiTaskCommandRequest): Promise<PiTaskResult>;
    requestChanges(request: PiTaskRequestChangesRequest): Promise<PiTaskResult>;
    resolveCommandApproval(
      request: PiTaskResolveCommandApprovalRequest,
    ): Promise<PiTaskResult>;
    previewDeliverable(
      request: PiTaskDeliverableRequest,
    ): Promise<PiTaskDeliverablePreviewResult>;
    openDeliverable(
      request: PiTaskDeliverableRequest,
    ): Promise<PiTaskDeliverableActionResult>;
    revealDeliverable(
      request: PiTaskDeliverableRequest,
    ): Promise<PiTaskDeliverableActionResult>;
    selectAttachments(): Promise<PiTaskAttachmentStageResult>;
    stageDroppedAttachments(
      files: readonly File[],
    ): Promise<PiTaskAttachmentStageResult>;
    discardAttachments(
      attachments: readonly PiTaskAttachment[],
    ): Promise<PiTaskAttachmentDiscardResult>;
  }>;
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
