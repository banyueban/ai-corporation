import { contextBridge } from "electron";
import type { DesktopApi } from "../shared/desktop-api";

const desktopApi: DesktopApi = Object.freeze({
  versions: Object.freeze({
    chrome: process.versions.chrome ?? "unknown",
    electron: process.versions.electron ?? "unknown",
    node: process.versions.node,
  }),
});

contextBridge.exposeInMainWorld("desktop", desktopApi);
