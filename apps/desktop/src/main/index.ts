import path from "node:path";
import {
  CORPORATION_ARCHIVE_IPC_CHANNEL,
  CORPORATION_CREATE_IPC_CHANNEL,
  CORPORATION_GET_IPC_CHANNEL,
  CORPORATION_LIST_IPC_CHANNEL,
  CORPORATION_UPDATE_NAME_IPC_CHANNEL,
  NATIVE_HEALTH_IPC_CHANNEL,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  WORKSPACE_SELECT_IPC_CHANNEL,
  type HealthResult,
} from "@ai-corporation/protocols";
import {
  CorporationRepository,
  openWorkspaceDatabase,
  WorkspaceRepository,
} from "@ai-corporation/storage";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import type { DatabaseSync } from "node:sqlite";
import { NativeCoreClient } from "./native-core-client";
import {
  handleCorporationArchive,
  handleCorporationCreate,
  handleCorporationGet,
  handleCorporationList,
  handleCorporationUpdateName,
} from "./corporation-ipc";
import { CorporationService } from "./corporation-service";
import { resolveNativeCorePath } from "./native-core-path";
import { createWindowOptions } from "./window-options";
import {
  createWorkspaceDirectorySelector,
  resolveWorkspaceE2eFixturePath,
  type WorkspaceDirectorySelector,
} from "./workspace-directory-selector";
import {
  handleWorkspaceList,
  handleWorkspaceRevalidate,
  handleWorkspaceSelect,
} from "./workspace-ipc";
import { resolveWorkspaceRuntimePaths } from "./workspace-paths";
import { WorkspaceService } from "./workspace-service";

const rendererEntryPath = path.join(__dirname, "../../renderer/index.html");
const preloadPath = path.join(__dirname, "../preload/index.js");

let mainWindow: BrowserWindow | undefined;
let corporationService: CorporationService | undefined;
let nativeCoreClient: NativeCoreClient | undefined;
let workspaceDatabase: DatabaseSync | undefined;
let workspaceDirectorySelector: WorkspaceDirectorySelector | undefined;
let workspaceService: WorkspaceService | undefined;

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

function isTrustedRenderer(event: IpcMainInvokeEvent): boolean {
  try {
    assertTrustedRenderer(event);
    return true;
  } catch {
    return false;
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
  ipcMain.handle(
    WORKSPACE_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleWorkspaceList(isTrustedRenderer(event), request, workspaceService),
  );
  ipcMain.handle(
    CORPORATION_CREATE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationCreate(
        isTrustedRenderer(event),
        request,
        corporationService,
      ),
  );
  ipcMain.handle(
    CORPORATION_GET_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationGet(
        isTrustedRenderer(event),
        request,
        corporationService,
      ),
  );
  ipcMain.handle(
    CORPORATION_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationList(
        isTrustedRenderer(event),
        request,
        corporationService,
      ),
  );
  ipcMain.handle(
    CORPORATION_UPDATE_NAME_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationUpdateName(
        isTrustedRenderer(event),
        request,
        corporationService,
      ),
  );
  ipcMain.handle(
    CORPORATION_ARCHIVE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationArchive(
        isTrustedRenderer(event),
        request,
        corporationService,
      ),
  );
  ipcMain.handle(
    WORKSPACE_REVALIDATE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleWorkspaceRevalidate(
        isTrustedRenderer(event),
        request,
        workspaceService,
      ),
  );
  ipcMain.handle(
    WORKSPACE_SELECT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleWorkspaceSelect(
        isTrustedRenderer(event),
        request,
        workspaceDirectorySelector,
        workspaceService,
      ),
  );

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

  try {
    const runtimePaths = resolveWorkspaceRuntimePaths({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
      userDataPath: app.getPath("userData"),
    });
    workspaceDatabase = openWorkspaceDatabase(
      runtimePaths.databasePath,
      runtimePaths.migrationDirectory,
    );
    workspaceService = new WorkspaceService({
      nativeClient: () => nativeCoreClient,
      repository: new WorkspaceRepository(workspaceDatabase),
    });
    corporationService = new CorporationService({
      repository: new CorporationRepository(workspaceDatabase),
      revalidateWorkspace: (workspaceId) =>
        workspaceService?.revalidate(workspaceId) ??
        Promise.resolve({
          ok: false,
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "Workspace operation failed",
          },
        }),
    });
    const e2eFixturePath = resolveWorkspaceE2eFixturePath(process.env);
    workspaceDirectorySelector = createWorkspaceDirectorySelector({
      ...(e2eFixturePath === undefined ? {} : { e2eFixturePath }),
      showDialog: async (options) => {
        if (mainWindow === undefined) {
          throw new Error("Workspace window is unavailable");
        }
        return dialog.showOpenDialog(mainWindow, options);
      },
    });
  } catch {
    workspaceDatabase = undefined;
    corporationService = undefined;
    workspaceDirectorySelector = undefined;
    workspaceService = undefined;
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
  ipcMain.removeHandler(WORKSPACE_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(WORKSPACE_REVALIDATE_IPC_CHANNEL);
  ipcMain.removeHandler(WORKSPACE_SELECT_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_CREATE_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_GET_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_UPDATE_NAME_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_ARCHIVE_IPC_CHANNEL);
  corporationService = undefined;
  workspaceDirectorySelector = undefined;
  workspaceService = undefined;
  workspaceDatabase?.close();
  workspaceDatabase = undefined;
  nativeCoreClient?.stop();
  nativeCoreClient = undefined;
});
