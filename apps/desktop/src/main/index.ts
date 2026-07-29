import path from "node:path";
import {
  NATIVE_HEALTH_IPC_CHANNEL,
  type HealthResult,
} from "@ai-corporation/protocols";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent } from "electron";
import { NativeCoreClient } from "./native-core-client";
import { resolveNativeCorePath } from "./native-core-path";
import { createWindowOptions } from "./window-options";

const rendererEntryPath = path.join(__dirname, "../../renderer/index.html");
const preloadPath = path.join(__dirname, "../preload/index.js");

let mainWindow: BrowserWindow | undefined;
let nativeCoreClient: NativeCoreClient | undefined;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow(createWindowOptions(preloadPath));

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) {
      event.preventDefault();
    }
  });

  void window.loadFile(rendererEntryPath);
  mainWindow = window;

  return window;
}

function assertTrustedRenderer(event: IpcMainInvokeEvent): void {
  if (
    mainWindow === undefined ||
    event.sender.id !== mainWindow.webContents.id ||
    event.senderFrame === null ||
    event.senderFrame.url !== mainWindow.webContents.getURL()
  ) {
    throw new Error("IPC caller is not authorized");
  }
}

async function handleNativeHealth(
  event: IpcMainInvokeEvent,
): Promise<HealthResult> {
  assertTrustedRenderer(event);
  if (nativeCoreClient === undefined) {
    throw new Error("Native Core is unavailable");
  }

  return nativeCoreClient.health();
}

void app.whenReady().then(async () => {
  ipcMain.handle(NATIVE_HEALTH_IPC_CHANNEL, handleNativeHealth);

  try {
    nativeCoreClient = await NativeCoreClient.start(
      resolveNativeCorePath({
        appPath: app.getAppPath(),
        isPackaged: app.isPackaged,
        platform: process.platform,
        resourcesPath: process.resourcesPath,
      }),
    );
  } catch {
    nativeCoreClient = undefined;
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  ipcMain.removeHandler(NATIVE_HEALTH_IPC_CHANNEL);
  nativeCoreClient?.stop();
  nativeCoreClient = undefined;
});
