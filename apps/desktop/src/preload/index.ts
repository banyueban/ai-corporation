import {
  AGENT_RUN_CANCEL_IPC_CHANNEL,
  AGENT_RUN_CONTINUE_IPC_CHANNEL,
  AGENT_RUN_GET_CURRENT_IPC_CHANNEL,
  AGENT_RUN_RETRY_IPC_CHANNEL,
  agentRunCommandRequestSchema,
  agentRunGetCurrentRequestSchema,
  agentRunNullableResultSchema,
  agentRunResultSchema,
  type AgentRunCommandRequest,
  type AgentRunGetCurrentRequest,
  CORPORATION_ARCHIVE_IPC_CHANNEL,
  CORPORATION_CREATE_IPC_CHANNEL,
  CORPORATION_GET_IPC_CHANNEL,
  CORPORATION_LIST_IPC_CHANNEL,
  CORPORATION_PAUSE_IPC_CHANNEL,
  CORPORATION_RESUME_IPC_CHANNEL,
  CORPORATION_UPDATE_NAME_IPC_CHANNEL,
  corporationArchiveRequestSchema,
  corporationCreateRequestSchema,
  corporationGetRequestSchema,
  corporationItemResultSchema,
  corporationListRequestSchema,
  corporationListResultSchema,
  corporationPauseRequestSchema,
  corporationResumeRequestSchema,
  corporationUpdateNameRequestSchema,
  GOAL_CONTRACT_APPROVE_IPC_CHANNEL,
  GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL,
  GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL,
  GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL,
  goalContractApproveRequestSchema,
  goalContractGetCurrentRequestSchema,
  goalContractItemResultSchema,
  goalContractListResultSchema,
  goalContractListVersionsRequestSchema,
  goalContractNullableItemResultSchema,
  goalContractSaveDraftRequestSchema,
  type GoalContractApproveRequest,
  type GoalContractGetCurrentRequest,
  type GoalContractListVersionsRequest,
  type GoalContractSaveDraftRequest,
  GOAL_ENGINE_ANSWER_IPC_CHANNEL,
  GOAL_ENGINE_CANCEL_IPC_CHANNEL,
  GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL,
  GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL,
  GOAL_ENGINE_START_IPC_CHANNEL,
  goalEngineAnswerRequestSchema,
  goalEngineCancelRequestSchema,
  goalEngineGetCurrentRequestSchema,
  goalEngineItemResultSchema,
  goalEngineNullableItemResultSchema,
  goalEngineResolveExtensionRequestSchema,
  goalEngineStartRequestSchema,
  type GoalEngineAnswerRequest,
  type GoalEngineCancelRequest,
  type GoalEngineGetCurrentRequest,
  type GoalEngineResolveExtensionRequest,
  type GoalEngineStartRequest,
  EXECUTION_START_GET_CURRENT_IPC_CHANNEL,
  EXECUTION_START_START_IPC_CHANNEL,
  executionStartGetCurrentRequestSchema,
  executionStartItemResultSchema,
  executionStartNullableItemResultSchema,
  executionStartRequestSchema,
  type ExecutionStartGetCurrentRequest,
  type ExecutionStartRequest,
  type CorporationArchiveRequest,
  type CorporationCreateRequest,
  type CorporationGetRequest,
  type CorporationListRequest,
  type CorporationPauseRequest,
  type CorporationResumeRequest,
  type CorporationUpdateNameRequest,
  healthResultSchema,
  NATIVE_HEALTH_IPC_CHANNEL,
  ORGANIZATION_ACTIVATION_ACTIVATE_IPC_CHANNEL,
  ORGANIZATION_ACTIVATION_GET_CURRENT_IPC_CHANNEL,
  organizationActivationGetCurrentRequestSchema,
  organizationActivationItemResultSchema,
  organizationActivationNullableItemResultSchema,
  organizationActivationRequestSchema,
  type OrganizationActivationGetCurrentRequest,
  type OrganizationActivationRequest,
  ORGANIZATION_PROPOSAL_CREATE_IPC_CHANNEL,
  ORGANIZATION_PROPOSAL_GET_CURRENT_IPC_CHANNEL,
  organizationProposalCreateRequestSchema,
  organizationProposalGetCurrentRequestSchema,
  organizationProposalItemResultSchema,
  organizationProposalNullableItemResultSchema,
  type OrganizationProposalCreateRequest,
  type OrganizationProposalGetCurrentRequest,
  PLANNER_CANCEL_IPC_CHANNEL,
  PLANNER_GET_CURRENT_IPC_CHANNEL,
  PLANNER_START_IPC_CHANNEL,
  plannerCancelRequestSchema,
  plannerGetCurrentRequestSchema,
  plannerItemResultSchema,
  plannerNullableItemResultSchema,
  plannerStartRequestSchema,
  type PlannerCancelRequest,
  type PlannerGetCurrentRequest,
  type PlannerStartRequest,
  PLAN_REVIEW_APPROVE_IPC_CHANNEL,
  PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL,
  PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL,
  PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL,
  planReviewApproveRequestSchema,
  planReviewGetCurrentRequestSchema,
  planReviewItemResultSchema,
  planReviewListResultSchema,
  planReviewListVersionsRequestSchema,
  planReviewNullableItemResultSchema,
  planReviewSaveVersionRequestSchema,
  type PlanReviewApproveRequest,
  type PlanReviewGetCurrentRequest,
  type PlanReviewListVersionsRequest,
  type PlanReviewSaveVersionRequest,
  PI_EMPLOYEE_LIST_IPC_CHANNEL,
  PI_EMPLOYEE_SAVE_IPC_CHANNEL,
  piEmployeeItemResultSchema,
  piEmployeeListRequestSchema,
  piEmployeeListResultSchema,
  piEmployeeSaveRequestSchema,
  type PiEmployeeListRequest,
  type PiEmployeeSaveRequest,
  PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL,
  PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL,
  PI_COMPANY_CREATE_IPC_CHANNEL,
  PI_COMPANY_LIST_IPC_CHANNEL,
  PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL,
  PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL,
  PI_COMPANY_UPDATE_NAME_IPC_CHANNEL,
  piCompanyCreateRequestSchema,
  piCompanyEmployeeRequestSchema,
  piCompanyItemResultSchema,
  piCompanyListRequestSchema,
  piCompanyListResultSchema,
  piCompanyUpdateNameRequestSchema,
  piCompanyWorkspaceRequestSchema,
  type PiCompanyCreateRequest,
  type PiCompanyEmployeeRequest,
  type PiCompanyListRequest,
  type PiCompanyUpdateNameRequest,
  type PiCompanyWorkspaceRequest,
  PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL,
  PI_SKILL_LIST_IPC_CHANNEL,
  PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL,
  piSkillConfirmImportRequestSchema,
  piSkillItemResultSchema,
  piSkillListRequestSchema,
  piSkillListResultSchema,
  piSkillPreviewImportResultSchema,
  type PiSkillConfirmImportRequest,
  type PiSkillListRequest,
  PI_TASK_ACCEPT_IPC_CHANNEL,
  PI_TASK_CANCEL_IPC_CHANNEL,
  PI_TASK_GET_IPC_CHANNEL,
  PI_TASK_LIST_IPC_CHANNEL,
  PI_TASK_REQUEST_CHANGES_IPC_CHANNEL,
  PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL,
  PI_TASK_START_IPC_CHANNEL,
  piTaskCommandRequestSchema,
  piTaskGetRequestSchema,
  piTaskListRequestSchema,
  piTaskListResultSchema,
  piTaskRequestChangesRequestSchema,
  piTaskResolveCommandApprovalRequestSchema,
  piTaskResultSchema,
  piTaskStartRequestSchema,
  type PiTaskCommandRequest,
  type PiTaskGetRequest,
  type PiTaskListRequest,
  type PiTaskRequestChangesRequest,
  type PiTaskResolveCommandApprovalRequest,
  type PiTaskStartRequest,
  PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL,
  PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL,
  PROVIDER_DELETE_KEY_IPC_CHANNEL,
  PROVIDER_LIST_IPC_CHANNEL,
  PROVIDER_REVEAL_KEY_IPC_CHANNEL,
  PROVIDER_SAVE_IPC_CHANNEL,
  PROVIDER_TEST_CONNECTION_IPC_CHANNEL,
  PROVIDER_TEST_GENERATION_IPC_CHANNEL,
  providerCancelConnectionTestRequestSchema,
  providerCancelConnectionTestResultSchema,
  providerCancelGenerationTestRequestSchema,
  providerCancelGenerationTestResultSchema,
  providerConnectionTestResultSchema,
  providerGenerationTestResultSchema,
  providerDeleteKeyRequestSchema,
  providerItemResultSchema,
  providerListRequestSchema,
  providerListResultSchema,
  providerRevealKeyRequestSchema,
  providerRevealKeyResultSchema,
  providerSaveRequestSchema,
  providerTestConnectionRequestSchema,
  providerTestGenerationRequestSchema,
  type ProviderCancelConnectionTestRequest,
  type ProviderCancelGenerationTestRequest,
  type ProviderDeleteKeyRequest,
  type ProviderListRequest,
  type ProviderRevealKeyRequest,
  type ProviderSaveRequest,
  type ProviderTestConnectionRequest,
  type ProviderTestGenerationRequest,
  TIMELINE_LIST_IPC_CHANNEL,
  timelineListRequestSchema,
  timelineListResultSchema,
  type TimelineListRequest,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  WORKSPACE_SELECT_IPC_CHANNEL,
  workspaceListIpcResultSchema,
  workspaceRevalidateIpcResultSchema,
  workspaceRevalidateRequestSchema,
  workspaceSelectIpcResultSchema,
} from "@ai-corporation/protocols";
import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api";

async function invokePiTask(channel: string, request: unknown) {
  return piTaskResultSchema.parse(await ipcRenderer.invoke(channel, request));
}

async function invokePiCompany(channel: string, request: unknown) {
  return piCompanyItemResultSchema.parse(
    await ipcRenderer.invoke(channel, request),
  );
}

const desktopApi: DesktopApi = Object.freeze({
  agentRun: Object.freeze({
    getCurrent: async (request: AgentRunGetCurrentRequest) =>
      agentRunNullableResultSchema.parse(
        await ipcRenderer.invoke(
          AGENT_RUN_GET_CURRENT_IPC_CHANNEL,
          agentRunGetCurrentRequestSchema.parse(request),
        ),
      ),
    continue: async (request: AgentRunCommandRequest) =>
      agentRunResultSchema.parse(
        await ipcRenderer.invoke(
          AGENT_RUN_CONTINUE_IPC_CHANNEL,
          agentRunCommandRequestSchema.parse(request),
        ),
      ),
    retry: async (request: AgentRunCommandRequest) =>
      agentRunResultSchema.parse(
        await ipcRenderer.invoke(
          AGENT_RUN_RETRY_IPC_CHANNEL,
          agentRunCommandRequestSchema.parse(request),
        ),
      ),
    cancel: async (request: AgentRunCommandRequest) =>
      agentRunResultSchema.parse(
        await ipcRenderer.invoke(
          AGENT_RUN_CANCEL_IPC_CHANNEL,
          agentRunCommandRequestSchema.parse(request),
        ),
      ),
  }),
  executionStart: Object.freeze({
    getCurrent: async (request: ExecutionStartGetCurrentRequest) =>
      executionStartNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          EXECUTION_START_GET_CURRENT_IPC_CHANNEL,
          executionStartGetCurrentRequestSchema.parse(request),
        ),
      ),
    start: async (request: ExecutionStartRequest) =>
      executionStartItemResultSchema.parse(
        await ipcRenderer.invoke(
          EXECUTION_START_START_IPC_CHANNEL,
          executionStartRequestSchema.parse(request),
        ),
      ),
  }),
  corporation: Object.freeze({
    archive: async (request: CorporationArchiveRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_ARCHIVE_IPC_CHANNEL,
          corporationArchiveRequestSchema.parse(request),
        ),
      ),
    create: async (request: CorporationCreateRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_CREATE_IPC_CHANNEL,
          corporationCreateRequestSchema.parse(request),
        ),
      ),
    get: async (request: CorporationGetRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_GET_IPC_CHANNEL,
          corporationGetRequestSchema.parse(request),
        ),
      ),
    list: async (request: CorporationListRequest) =>
      corporationListResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_LIST_IPC_CHANNEL,
          corporationListRequestSchema.parse(request),
        ),
      ),
    pause: async (request: CorporationPauseRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_PAUSE_IPC_CHANNEL,
          corporationPauseRequestSchema.parse(request),
        ),
      ),
    resume: async (request: CorporationResumeRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_RESUME_IPC_CHANNEL,
          corporationResumeRequestSchema.parse(request),
        ),
      ),
    updateName: async (request: CorporationUpdateNameRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_UPDATE_NAME_IPC_CHANNEL,
          corporationUpdateNameRequestSchema.parse(request),
        ),
      ),
  }),
  goalContract: Object.freeze({
    approve: async (request: GoalContractApproveRequest) =>
      goalContractItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_CONTRACT_APPROVE_IPC_CHANNEL,
          goalContractApproveRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: GoalContractGetCurrentRequest) =>
      goalContractNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL,
          goalContractGetCurrentRequestSchema.parse(request),
        ),
      ),
    listVersions: async (request: GoalContractListVersionsRequest) =>
      goalContractListResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL,
          goalContractListVersionsRequestSchema.parse(request),
        ),
      ),
    saveDraft: async (request: GoalContractSaveDraftRequest) =>
      goalContractItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL,
          goalContractSaveDraftRequestSchema.parse(request),
        ),
      ),
  }),
  goalEngine: Object.freeze({
    answer: async (request: GoalEngineAnswerRequest) =>
      goalEngineItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_ENGINE_ANSWER_IPC_CHANNEL,
          goalEngineAnswerRequestSchema.parse(request),
        ),
      ),
    cancel: async (request: GoalEngineCancelRequest) =>
      goalEngineItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_ENGINE_CANCEL_IPC_CHANNEL,
          goalEngineCancelRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: GoalEngineGetCurrentRequest) =>
      goalEngineNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL,
          goalEngineGetCurrentRequestSchema.parse(request),
        ),
      ),
    resolveExtension: async (request: GoalEngineResolveExtensionRequest) =>
      goalEngineItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL,
          goalEngineResolveExtensionRequestSchema.parse(request),
        ),
      ),
    start: async (request: GoalEngineStartRequest) =>
      goalEngineItemResultSchema.parse(
        await ipcRenderer.invoke(
          GOAL_ENGINE_START_IPC_CHANNEL,
          goalEngineStartRequestSchema.parse(request),
        ),
      ),
  }),
  health: async () =>
    healthResultSchema.parse(
      await ipcRenderer.invoke(NATIVE_HEALTH_IPC_CHANNEL),
    ),
  organizationActivation: Object.freeze({
    activate: async (request: OrganizationActivationRequest) =>
      organizationActivationItemResultSchema.parse(
        await ipcRenderer.invoke(
          ORGANIZATION_ACTIVATION_ACTIVATE_IPC_CHANNEL,
          organizationActivationRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: OrganizationActivationGetCurrentRequest) =>
      organizationActivationNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          ORGANIZATION_ACTIVATION_GET_CURRENT_IPC_CHANNEL,
          organizationActivationGetCurrentRequestSchema.parse(request),
        ),
      ),
  }),
  organizationProposal: Object.freeze({
    create: async (request: OrganizationProposalCreateRequest) =>
      organizationProposalItemResultSchema.parse(
        await ipcRenderer.invoke(
          ORGANIZATION_PROPOSAL_CREATE_IPC_CHANNEL,
          organizationProposalCreateRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: OrganizationProposalGetCurrentRequest) =>
      organizationProposalNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          ORGANIZATION_PROPOSAL_GET_CURRENT_IPC_CHANNEL,
          organizationProposalGetCurrentRequestSchema.parse(request),
        ),
      ),
  }),
  planner: Object.freeze({
    cancel: async (request: PlannerCancelRequest) =>
      plannerItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLANNER_CANCEL_IPC_CHANNEL,
          plannerCancelRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: PlannerGetCurrentRequest) =>
      plannerNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLANNER_GET_CURRENT_IPC_CHANNEL,
          plannerGetCurrentRequestSchema.parse(request),
        ),
      ),
    start: async (request: PlannerStartRequest) =>
      plannerItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLANNER_START_IPC_CHANNEL,
          plannerStartRequestSchema.parse(request),
        ),
      ),
  }),
  planReview: Object.freeze({
    approve: async (request: PlanReviewApproveRequest) =>
      planReviewItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLAN_REVIEW_APPROVE_IPC_CHANNEL,
          planReviewApproveRequestSchema.parse(request),
        ),
      ),
    getCurrent: async (request: PlanReviewGetCurrentRequest) =>
      planReviewNullableItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL,
          planReviewGetCurrentRequestSchema.parse(request),
        ),
      ),
    listVersions: async (request: PlanReviewListVersionsRequest) =>
      planReviewListResultSchema.parse(
        await ipcRenderer.invoke(
          PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL,
          planReviewListVersionsRequestSchema.parse(request),
        ),
      ),
    saveVersion: async (request: PlanReviewSaveVersionRequest) =>
      planReviewItemResultSchema.parse(
        await ipcRenderer.invoke(
          PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL,
          planReviewSaveVersionRequestSchema.parse(request),
        ),
      ),
  }),
  piEmployee: Object.freeze({
    list: async (request: PiEmployeeListRequest) =>
      piEmployeeListResultSchema.parse(
        await ipcRenderer.invoke(
          PI_EMPLOYEE_LIST_IPC_CHANNEL,
          piEmployeeListRequestSchema.parse(request),
        ),
      ),
    save: async (request: PiEmployeeSaveRequest) =>
      piEmployeeItemResultSchema.parse(
        await ipcRenderer.invoke(
          PI_EMPLOYEE_SAVE_IPC_CHANNEL,
          piEmployeeSaveRequestSchema.parse(request),
        ),
      ),
  }),
  piCompany: Object.freeze({
    list: async (request: PiCompanyListRequest) =>
      piCompanyListResultSchema.parse(
        await ipcRenderer.invoke(
          PI_COMPANY_LIST_IPC_CHANNEL,
          piCompanyListRequestSchema.parse(request),
        ),
      ),
    create: async (request: PiCompanyCreateRequest) =>
      piCompanyItemResultSchema.parse(
        await ipcRenderer.invoke(
          PI_COMPANY_CREATE_IPC_CHANNEL,
          piCompanyCreateRequestSchema.parse(request),
        ),
      ),
    updateName: async (request: PiCompanyUpdateNameRequest) =>
      piCompanyItemResultSchema.parse(
        await ipcRenderer.invoke(
          PI_COMPANY_UPDATE_NAME_IPC_CHANNEL,
          piCompanyUpdateNameRequestSchema.parse(request),
        ),
      ),
    addEmployee: (request: PiCompanyEmployeeRequest) =>
      invokePiCompany(
        PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL,
        piCompanyEmployeeRequestSchema.parse(request),
      ),
    removeEmployee: (request: PiCompanyEmployeeRequest) =>
      invokePiCompany(
        PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL,
        piCompanyEmployeeRequestSchema.parse(request),
      ),
    addWorkspace: (request: PiCompanyWorkspaceRequest) =>
      invokePiCompany(
        PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL,
        piCompanyWorkspaceRequestSchema.parse(request),
      ),
    removeWorkspace: (request: PiCompanyWorkspaceRequest) =>
      invokePiCompany(
        PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL,
        piCompanyWorkspaceRequestSchema.parse(request),
      ),
  }),
  piSkill: Object.freeze({
    list: async (request: PiSkillListRequest) =>
      piSkillListResultSchema.parse(
        await ipcRenderer.invoke(
          PI_SKILL_LIST_IPC_CHANNEL,
          piSkillListRequestSchema.parse(request),
        ),
      ),
    previewImport: async (request: PiSkillListRequest) =>
      piSkillPreviewImportResultSchema.parse(
        await ipcRenderer.invoke(
          PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL,
          piSkillListRequestSchema.parse(request),
        ),
      ),
    confirmImport: async (request: PiSkillConfirmImportRequest) =>
      piSkillItemResultSchema.parse(
        await ipcRenderer.invoke(
          PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL,
          piSkillConfirmImportRequestSchema.parse(request),
        ),
      ),
  }),
  piTask: Object.freeze({
    start: (request: PiTaskStartRequest) =>
      invokePiTask(
        PI_TASK_START_IPC_CHANNEL,
        piTaskStartRequestSchema.parse(request),
      ),
    get: (request: PiTaskGetRequest) =>
      invokePiTask(
        PI_TASK_GET_IPC_CHANNEL,
        piTaskGetRequestSchema.parse(request),
      ),
    list: async (request: PiTaskListRequest) =>
      piTaskListResultSchema.parse(
        await ipcRenderer.invoke(
          PI_TASK_LIST_IPC_CHANNEL,
          piTaskListRequestSchema.parse(request),
        ),
      ),
    cancel: (request: PiTaskCommandRequest) =>
      invokePiTask(
        PI_TASK_CANCEL_IPC_CHANNEL,
        piTaskCommandRequestSchema.parse(request),
      ),
    accept: (request: PiTaskCommandRequest) =>
      invokePiTask(
        PI_TASK_ACCEPT_IPC_CHANNEL,
        piTaskCommandRequestSchema.parse(request),
      ),
    requestChanges: (request: PiTaskRequestChangesRequest) =>
      invokePiTask(
        PI_TASK_REQUEST_CHANGES_IPC_CHANNEL,
        piTaskRequestChangesRequestSchema.parse(request),
      ),
    resolveCommandApproval: (request: PiTaskResolveCommandApprovalRequest) =>
      invokePiTask(
        PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL,
        piTaskResolveCommandApprovalRequestSchema.parse(request),
      ),
  }),
  provider: Object.freeze({
    cancelConnectionTest: async (
      request: ProviderCancelConnectionTestRequest,
    ) =>
      providerCancelConnectionTestResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL,
          providerCancelConnectionTestRequestSchema.parse(request),
        ),
      ),
    cancelGenerationTest: async (
      request: ProviderCancelGenerationTestRequest,
    ) =>
      providerCancelGenerationTestResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL,
          providerCancelGenerationTestRequestSchema.parse(request),
        ),
      ),
    deleteKey: async (request: ProviderDeleteKeyRequest) =>
      providerItemResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_DELETE_KEY_IPC_CHANNEL,
          providerDeleteKeyRequestSchema.parse(request),
        ),
      ),
    list: async (request: ProviderListRequest) =>
      providerListResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_LIST_IPC_CHANNEL,
          providerListRequestSchema.parse(request),
        ),
      ),
    revealKey: async (request: ProviderRevealKeyRequest) =>
      providerRevealKeyResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_REVEAL_KEY_IPC_CHANNEL,
          providerRevealKeyRequestSchema.parse(request),
        ),
      ),
    save: async (request: ProviderSaveRequest) =>
      providerItemResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_SAVE_IPC_CHANNEL,
          providerSaveRequestSchema.parse(request),
        ),
      ),
    testConnection: async (request: ProviderTestConnectionRequest) =>
      providerConnectionTestResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_TEST_CONNECTION_IPC_CHANNEL,
          providerTestConnectionRequestSchema.parse(request),
        ),
      ),
    testGeneration: async (request: ProviderTestGenerationRequest) =>
      providerGenerationTestResultSchema.parse(
        await ipcRenderer.invoke(
          PROVIDER_TEST_GENERATION_IPC_CHANNEL,
          providerTestGenerationRequestSchema.parse(request),
        ),
      ),
  }),
  timeline: Object.freeze({
    list: async (request: TimelineListRequest) =>
      timelineListResultSchema.parse(
        await ipcRenderer.invoke(
          TIMELINE_LIST_IPC_CHANNEL,
          timelineListRequestSchema.parse(request),
        ),
      ),
  }),
  workspace: Object.freeze({
    list: async () =>
      workspaceListIpcResultSchema.parse(
        await ipcRenderer.invoke(WORKSPACE_LIST_IPC_CHANNEL),
      ),
    revalidate: async (workspaceId: string) => {
      const request = workspaceRevalidateRequestSchema.parse({ workspaceId });
      return workspaceRevalidateIpcResultSchema.parse(
        await ipcRenderer.invoke(WORKSPACE_REVALIDATE_IPC_CHANNEL, request),
      );
    },
    select: async () =>
      workspaceSelectIpcResultSchema.parse(
        await ipcRenderer.invoke(WORKSPACE_SELECT_IPC_CHANNEL),
      ),
  }),
  versions: Object.freeze({
    chrome: process.versions.chrome ?? "unknown",
    electron: process.versions.electron ?? "unknown",
    node: process.versions.node,
  }),
});

contextBridge.exposeInMainWorld("desktop", desktopApi);
