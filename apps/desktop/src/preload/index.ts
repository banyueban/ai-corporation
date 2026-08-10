import {
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
  type CorporationArchiveRequest,
  type CorporationCreateRequest,
  type CorporationGetRequest,
  type CorporationListRequest,
  type CorporationPauseRequest,
  type CorporationResumeRequest,
  type CorporationUpdateNameRequest,
  healthResultSchema,
  NATIVE_HEALTH_IPC_CHANNEL,
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

const desktopApi: DesktopApi = Object.freeze({
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
