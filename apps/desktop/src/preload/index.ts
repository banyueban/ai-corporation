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
  type CorporationArchiveRequest,
  type CorporationCreateRequest,
  type CorporationGetRequest,
  type CorporationListRequest,
  type CorporationPauseRequest,
  type CorporationResumeRequest,
  type CorporationUpdateNameRequest,
  healthResultSchema,
  NATIVE_HEALTH_IPC_CHANNEL,
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
  health: async () =>
    healthResultSchema.parse(
      await ipcRenderer.invoke(NATIVE_HEALTH_IPC_CHANNEL),
    ),
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
