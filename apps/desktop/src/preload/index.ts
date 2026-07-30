import {
  CORPORATION_ARCHIVE_IPC_CHANNEL,
  CORPORATION_CREATE_IPC_CHANNEL,
  CORPORATION_GET_IPC_CHANNEL,
  CORPORATION_LIST_IPC_CHANNEL,
  CORPORATION_UPDATE_NAME_IPC_CHANNEL,
  corporationArchiveRequestSchema,
  corporationCreateRequestSchema,
  corporationGetRequestSchema,
  corporationItemResultSchema,
  corporationListRequestSchema,
  corporationListResultSchema,
  corporationUpdateNameRequestSchema,
  type CorporationArchiveRequest,
  type CorporationCreateRequest,
  type CorporationGetRequest,
  type CorporationListRequest,
  type CorporationUpdateNameRequest,
  healthResultSchema,
  NATIVE_HEALTH_IPC_CHANNEL,
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
    updateName: async (request: CorporationUpdateNameRequest) =>
      corporationItemResultSchema.parse(
        await ipcRenderer.invoke(
          CORPORATION_UPDATE_NAME_IPC_CHANNEL,
          corporationUpdateNameRequestSchema.parse(request),
        ),
      ),
  }),
  health: async () =>
    healthResultSchema.parse(
      await ipcRenderer.invoke(NATIVE_HEALTH_IPC_CHANNEL),
    ),
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
