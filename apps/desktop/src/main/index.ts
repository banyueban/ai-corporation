import path from "node:path";
import {
  CORPORATION_ARCHIVE_IPC_CHANNEL,
  CORPORATION_CREATE_IPC_CHANNEL,
  CORPORATION_GET_IPC_CHANNEL,
  CORPORATION_LIST_IPC_CHANNEL,
  CORPORATION_PAUSE_IPC_CHANNEL,
  CORPORATION_RESUME_IPC_CHANNEL,
  CORPORATION_UPDATE_NAME_IPC_CHANNEL,
  GOAL_CONTRACT_APPROVE_IPC_CHANNEL,
  GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL,
  GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL,
  GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL,
  GOAL_ENGINE_ANSWER_IPC_CHANNEL,
  GOAL_ENGINE_CANCEL_IPC_CHANNEL,
  GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL,
  GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL,
  GOAL_ENGINE_START_IPC_CHANNEL,
  NATIVE_HEALTH_IPC_CHANNEL,
  PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL,
  PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL,
  PROVIDER_DELETE_KEY_IPC_CHANNEL,
  PROVIDER_LIST_IPC_CHANNEL,
  PROVIDER_REVEAL_KEY_IPC_CHANNEL,
  PROVIDER_SAVE_IPC_CHANNEL,
  PROVIDER_TEST_CONNECTION_IPC_CHANNEL,
  PROVIDER_TEST_GENERATION_IPC_CHANNEL,
  TIMELINE_LIST_IPC_CHANNEL,
  WORKSPACE_LIST_IPC_CHANNEL,
  WORKSPACE_REVALIDATE_IPC_CHANNEL,
  WORKSPACE_SELECT_IPC_CHANNEL,
  type HealthResult,
} from "@ai-corporation/protocols";
import {
  CorporationRepository,
  CorporationStateRepository,
  GoalContractRepository,
  GoalEngineRepository,
  ProviderRepository,
  type GoalFaultStage,
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
import {
  handleCorporationPause,
  handleCorporationResume,
} from "./corporation-state-ipc";
import { CorporationStateService } from "./corporation-state-service";
import {
  handleGoalContractApprove,
  handleGoalContractGetCurrent,
  handleGoalContractListVersions,
  handleGoalContractSaveDraft,
  handleTimelineList,
} from "./goal-contract-ipc";
import { GoalContractService } from "./goal-contract-service";
import {
  handleGoalEngineAnswer,
  handleGoalEngineCancel,
  handleGoalEngineGetCurrent,
  handleGoalEngineResolveExtension,
  handleGoalEngineStart,
} from "./goal-engine-ipc";
import { GoalEngineService } from "./goal-engine-service";
import {
  handleProviderCancelConnectionTest,
  handleProviderCancelGenerationTest,
  handleProviderDeleteKey,
  handleProviderList,
  handleProviderRevealKey,
  handleProviderSave,
  handleProviderTestConnection,
  handleProviderTestGeneration,
} from "./provider-ipc";
import { ProviderKeyVault } from "./provider-key-vault";
import { ProviderService } from "./provider-service";
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

if (process.env.AI_CORPORATION_E2E === "1") {
  app.disableHardwareAcceleration();
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("disable-gpu-compositing");
  app.commandLine.appendSwitch("disable-software-rasterizer");
}

const rendererEntryPath = path.join(__dirname, "../../renderer/index.html");
const preloadPath = path.join(__dirname, "../preload/index.js");

let mainWindow: BrowserWindow | undefined;
let corporationService: CorporationService | undefined;
let corporationStateService: CorporationStateService | undefined;
let goalContractService: GoalContractService | undefined;
let goalEngineService: GoalEngineService | undefined;
let nativeCoreClient: NativeCoreClient | undefined;
let providerService: ProviderService | undefined;
let workspaceDatabase: DatabaseSync | undefined;
let workspaceDirectorySelector: WorkspaceDirectorySelector | undefined;
let workspaceService: WorkspaceService | undefined;

function createGoalContractRepository(
  database: DatabaseSync,
  environment: NodeJS.ProcessEnv,
): GoalContractRepository {
  if (
    environment.AI_CORPORATION_E2E !== "1" ||
    environment.AI_CORPORATION_E2E_GOAL_SAVE_FAIL_ONCE !== "1"
  ) {
    return new GoalContractRepository(database);
  }

  let injected = false;
  return new GoalContractRepository(database, {
    fault: (stage: GoalFaultStage) => {
      if (!injected && stage === "GOAL") {
        injected = true;
        throw new Error("M1-TU-05 injected Goal save failure");
      }
    },
  });
}

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
  if (process.env.AI_CORPORATION_E2E === "1") {
    window.webContents.on("render-process-gone", (_event, details) => {
      process.stderr.write(
        `Renderer gone: reason=${details.reason} exitCode=${details.exitCode}\n`,
      );
    });
  }

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
    PROVIDER_TEST_CONNECTION_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderTestConnection(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderCancelConnectionTest(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    PROVIDER_TEST_GENERATION_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderTestGeneration(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderCancelGenerationTest(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    PROVIDER_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderList(isTrustedRenderer(event), request, providerService),
  );
  ipcMain.handle(
    PROVIDER_SAVE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderSave(isTrustedRenderer(event), request, providerService),
  );
  ipcMain.handle(
    PROVIDER_REVEAL_KEY_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderRevealKey(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    PROVIDER_DELETE_KEY_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleProviderDeleteKey(
        isTrustedRenderer(event),
        request,
        providerService,
      ),
  );
  ipcMain.handle(
    WORKSPACE_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleWorkspaceList(isTrustedRenderer(event), request, workspaceService),
  );
  ipcMain.handle(
    GOAL_ENGINE_START_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalEngineStart(
        isTrustedRenderer(event),
        request,
        goalEngineService,
      ),
  );
  ipcMain.handle(
    GOAL_ENGINE_ANSWER_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalEngineAnswer(
        isTrustedRenderer(event),
        request,
        goalEngineService,
      ),
  );
  ipcMain.handle(
    GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalEngineResolveExtension(
        isTrustedRenderer(event),
        request,
        goalEngineService,
      ),
  );
  ipcMain.handle(
    GOAL_ENGINE_CANCEL_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalEngineCancel(
        isTrustedRenderer(event),
        request,
        goalEngineService,
      ),
  );
  ipcMain.handle(
    GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalEngineGetCurrent(
        isTrustedRenderer(event),
        request,
        goalEngineService,
      ),
  );
  ipcMain.handle(
    GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalContractSaveDraft(
        isTrustedRenderer(event),
        request,
        goalContractService,
      ),
  );
  ipcMain.handle(
    GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalContractGetCurrent(
        isTrustedRenderer(event),
        request,
        goalContractService,
      ),
  );
  ipcMain.handle(
    GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalContractListVersions(
        isTrustedRenderer(event),
        request,
        goalContractService,
      ),
  );
  ipcMain.handle(
    GOAL_CONTRACT_APPROVE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleGoalContractApprove(
        isTrustedRenderer(event),
        request,
        goalContractService,
      ),
  );
  ipcMain.handle(
    TIMELINE_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleTimelineList(
        isTrustedRenderer(event),
        request,
        goalContractService,
      ),
  );
  ipcMain.handle(
    CORPORATION_PAUSE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationPause(
        isTrustedRenderer(event),
        request,
        corporationStateService,
      ),
  );
  ipcMain.handle(
    CORPORATION_RESUME_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleCorporationResume(
        isTrustedRenderer(event),
        request,
        corporationStateService,
      ),
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
    const corporationRepository = new CorporationRepository(workspaceDatabase);
    corporationStateService = new CorporationStateService({
      repository: new CorporationStateRepository(workspaceDatabase),
      revalidateWorkspace: (workspaceId) =>
        workspaceService?.revalidate(workspaceId) ??
        Promise.resolve({
          ok: false,
          error: {
            code: "STORAGE_UNAVAILABLE",
            message: "Workspace operation failed",
          },
        }),
      resolveWorkspaceId: (corporationId) =>
        corporationRepository.get(corporationId)?.workspaceId,
    });
    goalContractService = new GoalContractService({
      repository: createGoalContractRepository(workspaceDatabase, process.env),
    });
    providerService = new ProviderService({
      repository: new ProviderRepository(workspaceDatabase),
      vault: new ProviderKeyVault({
        keyPath: path.join(
          app.getPath("userData"),
          "key-vault",
          "master-key-v1",
        ),
      }),
    });
    const goalEngineRepository = new GoalEngineRepository(workspaceDatabase);
    goalEngineRepository.interruptGenerating(new Date().toISOString());
    goalEngineService = new GoalEngineService({
      provider: providerService,
      repository: goalEngineRepository,
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
    corporationStateService = undefined;
    goalContractService = undefined;
    goalEngineService = undefined;
    providerService = undefined;
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
  ipcMain.removeHandler(PROVIDER_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_TEST_CONNECTION_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_CANCEL_CONNECTION_TEST_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_TEST_GENERATION_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_CANCEL_GENERATION_TEST_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_SAVE_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_REVEAL_KEY_IPC_CHANNEL);
  ipcMain.removeHandler(PROVIDER_DELETE_KEY_IPC_CHANNEL);
  ipcMain.removeHandler(WORKSPACE_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(WORKSPACE_REVALIDATE_IPC_CHANNEL);
  ipcMain.removeHandler(WORKSPACE_SELECT_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_CREATE_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_GET_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_UPDATE_NAME_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_ARCHIVE_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_PAUSE_IPC_CHANNEL);
  ipcMain.removeHandler(CORPORATION_RESUME_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_CONTRACT_SAVE_DRAFT_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_CONTRACT_GET_CURRENT_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_CONTRACT_LIST_VERSIONS_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_CONTRACT_APPROVE_IPC_CHANNEL);
  ipcMain.removeHandler(TIMELINE_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_ENGINE_START_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_ENGINE_ANSWER_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_ENGINE_RESOLVE_EXTENSION_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_ENGINE_CANCEL_IPC_CHANNEL);
  ipcMain.removeHandler(GOAL_ENGINE_GET_CURRENT_IPC_CHANNEL);
  corporationService = undefined;
  goalContractService = undefined;
  goalEngineService = undefined;
  providerService = undefined;
  workspaceDirectorySelector = undefined;
  workspaceService = undefined;
  workspaceDatabase?.close();
  workspaceDatabase = undefined;
  nativeCoreClient?.stop();
  nativeCoreClient = undefined;
});
