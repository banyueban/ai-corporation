import {
  healthResultSchema,
  NATIVE_HEALTH_IPC_CHANNEL,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  workspaceListIpcResultSchema,
  workspaceRevalidateIpcResultSchema,
  workspaceRevalidateRequestSchema,
} from "@ai-corporation/protocols";
import { contextBridge, ipcRenderer } from "electron";
import type { DesktopApi } from "../shared/desktop-api";

const desktopApi: DesktopApi = Object.freeze({
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
  }),
  versions: Object.freeze({
    chrome: process.versions.chrome ?? "unknown",
    electron: process.versions.electron ?? "unknown",
    node: process.versions.node,
  }),
});

contextBridge.exposeInMainWorld("desktop", desktopApi);
