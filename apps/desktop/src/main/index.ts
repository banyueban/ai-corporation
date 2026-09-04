import path from "node:path";
import {
  AGENT_RUN_CANCEL_IPC_CHANNEL,
  AGENT_RUN_CONTINUE_IPC_CHANNEL,
  AGENT_RUN_GET_CURRENT_IPC_CHANNEL,
  AGENT_RUN_RETRY_IPC_CHANNEL,
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
  EXECUTION_START_GET_CURRENT_IPC_CHANNEL,
  EXECUTION_START_START_IPC_CHANNEL,
  NATIVE_HEALTH_IPC_CHANNEL,
  ORGANIZATION_ACTIVATION_ACTIVATE_IPC_CHANNEL,
  ORGANIZATION_ACTIVATION_GET_CURRENT_IPC_CHANNEL,
  ORGANIZATION_PROPOSAL_CREATE_IPC_CHANNEL,
  ORGANIZATION_PROPOSAL_GET_CURRENT_IPC_CHANNEL,
  PLANNER_CANCEL_IPC_CHANNEL,
  PLANNER_GET_CURRENT_IPC_CHANNEL,
  PLANNER_START_IPC_CHANNEL,
  PLAN_REVIEW_APPROVE_IPC_CHANNEL,
  PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL,
  PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL,
  PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL,
  PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL,
  PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL,
  PI_COMPANY_CREATE_IPC_CHANNEL,
  PI_COMPANY_LIST_IPC_CHANNEL,
  PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL,
  PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL,
  PI_COMPANY_UPDATE_NAME_IPC_CHANNEL,
  PI_EMPLOYEE_LIST_IPC_CHANNEL,
  PI_EMPLOYEE_SAVE_IPC_CHANNEL,
  PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL,
  PI_SKILL_LIST_IPC_CHANNEL,
  PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL,
  PI_TASK_ACCEPT_IPC_CHANNEL,
  PI_TASK_CANCEL_IPC_CHANNEL,
  PI_TASK_GET_IPC_CHANNEL,
  PI_TASK_LIST_IPC_CHANNEL,
  PI_TASK_OPEN_DELIVERABLE_IPC_CHANNEL,
  PI_TASK_PREVIEW_DELIVERABLE_IPC_CHANNEL,
  PI_TASK_REQUEST_CHANGES_IPC_CHANNEL,
  PI_TASK_REVEAL_DELIVERABLE_IPC_CHANNEL,
  PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL,
  PI_TASK_START_IPC_CHANNEL,
  PI_TASK_ATTACHMENT_SELECT_IPC_CHANNEL,
  PI_TASK_ATTACHMENT_STAGE_DROPPED_IPC_CHANNEL,
  PI_TASK_ATTACHMENT_DISCARD_IPC_CHANNEL,
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
  AgentRunRepository,
  CorporationRepository,
  CorporationStateRepository,
  GoalContractRepository,
  GoalEngineRepository,
  ExecutionStartRepository,
  OrganizationActivationRepository,
  OrganizationProposalRepository,
  PlanValidationRepository,
  PiEmployeeRepository,
  PiCompanyRepository,
  PiTaskRepository,
  PlanReviewRepository,
  PlannerRepository,
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
  shell,
  type IpcMainInvokeEvent,
} from "electron";
import type { DatabaseSync } from "node:sqlite";
import { NativeCoreClient } from "./native-core-client";
import {
  handleAgentRunCancel,
  handleAgentRunContinue,
  handleAgentRunGetCurrent,
  handleAgentRunRetry,
} from "./agent-run-ipc";
import { AgentRunService } from "./agent-run-service";
import {
  handleExecutionStart,
  handleExecutionStartGetCurrent,
} from "./execution-start-ipc";
import { ExecutionStartService } from "./execution-start-service";
import {
  handleOrganizationActivationActivate,
  handleOrganizationActivationGetCurrent,
} from "./organization-activation-ipc";
import { OrganizationActivationService } from "./organization-activation-service";
import {
  handleOrganizationProposalCreate,
  handleOrganizationProposalGetCurrent,
} from "./organization-proposal-ipc";
import { OrganizationProposalService } from "./organization-proposal-service";
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
  handlePlannerCancel,
  handlePlannerGetCurrent,
  handlePlannerStart,
} from "./planner-ipc";
import { PlannerService } from "./planner-service";
import { PlanValidationService } from "./plan-validation-service";
import {
  handlePlanReviewApprove,
  handlePlanReviewGetCurrent,
  handlePlanReviewListVersions,
  handlePlanReviewSaveVersion,
} from "./plan-review-ipc";
import { PlanReviewService } from "./plan-review-service";
import { handlePiEmployeeList, handlePiEmployeeSave } from "./pi-employee-ipc";
import { PiEmployeeService } from "./pi-employee-service";
import { handlePiCompany, handlePiCompanyList } from "./pi-company-ipc";
import { PiCompanyService } from "./pi-company-service";
import {
  handlePiSkillConfirmImport,
  handlePiSkillList,
  handlePiSkillPreviewImport,
} from "./pi-skill-ipc";
import { PiSkillService } from "./pi-skill-service";
import {
  handlePiTask,
  handlePiTaskDeliverable,
  handlePiTaskList,
} from "./pi-task-ipc";
import { PiTaskService } from "./pi-task-service";
import { TaskAttachmentService } from "./task-attachment-service";
import { DocumentService } from "./document-service";
import { createPdfFontCss } from "./pdf-font-service";
import {
  handleAttachmentDiscard,
  handleAttachmentStage,
} from "./task-attachment-ipc";
import { SkillLibrary } from "./skill-library";
import { SkillEnvironmentManager } from "./skill-environment";
import { createUuidV7 } from "./uuid-v7";
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
let agentRunService: AgentRunService | undefined;
let corporationService: CorporationService | undefined;
let corporationStateService: CorporationStateService | undefined;
let goalContractService: GoalContractService | undefined;
let goalEngineService: GoalEngineService | undefined;
let executionStartService: ExecutionStartService | undefined;
let plannerService: PlannerService | undefined;
let planReviewService: PlanReviewService | undefined;
let piEmployeeService: PiEmployeeService | undefined;
let piCompanyService: PiCompanyService | undefined;
let piSkillService: PiSkillService | undefined;
let piTaskService: PiTaskService | undefined;
let taskAttachmentService: TaskAttachmentService | undefined;
let nativeCoreClient: NativeCoreClient | undefined;
let organizationActivationService: OrganizationActivationService | undefined;
let organizationProposalService: OrganizationProposalService | undefined;
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

async function renderPdf(html: string): Promise<Uint8Array> {
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      // macOS 的隐藏窗口可能在首帧前进入后台，关闭节流可以保证打印前完成排版。
      backgroundThrottling: false,
      contextIsolation: true,
      javascript: false,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  try {
    const fontDirectory = path.join(
      app.getAppPath(),
      app.isPackaged
        ? "fonts/noto-sans-sc"
        : "node_modules/@fontsource-variable/noto-sans-sc",
    );
    const fontCss = await createPdfFontCss(html, fontDirectory);
    const printableHtml = html.replace(
      "/* AI_CORPORATION_PDF_FONT */",
      fontCss,
    );
    const firstPaint = new Promise<void>((resolve) => {
      window.once("ready-to-show", resolve);
    });
    await window.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(printableHtml)}`,
    );
    await firstPaint;
    return new Uint8Array(
      await window.webContents.printToPDF({
        // 带文字标记的 PDF 在不同系统上都能被重新读取和核对。
        generateTaggedPDF: true,
        preferCSSPageSize: true,
        printBackground: true,
      }),
    );
  } finally {
    window.destroy();
  }
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
  ipcMain.handle(
    AGENT_RUN_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAgentRunGetCurrent(
        isTrustedRenderer(event),
        request,
        agentRunService,
      ),
  );
  ipcMain.handle(
    AGENT_RUN_CONTINUE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAgentRunContinue(
        isTrustedRenderer(event),
        request,
        agentRunService,
      ),
  );
  ipcMain.handle(
    AGENT_RUN_RETRY_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAgentRunRetry(isTrustedRenderer(event), request, agentRunService),
  );
  ipcMain.handle(
    AGENT_RUN_CANCEL_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAgentRunCancel(isTrustedRenderer(event), request, agentRunService),
  );
  ipcMain.handle(NATIVE_HEALTH_IPC_CHANNEL, handleNativeHealth);
  ipcMain.handle(
    PI_SKILL_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiSkillList(isTrustedRenderer(event), request, piSkillService),
  );
  ipcMain.handle(
    PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiSkillPreviewImport(
        isTrustedRenderer(event),
        request,
        piSkillService,
      ),
  );
  ipcMain.handle(
    PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiSkillConfirmImport(
        isTrustedRenderer(event),
        request,
        piSkillService,
      ),
  );
  ipcMain.handle(
    PI_EMPLOYEE_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiEmployeeList(
        isTrustedRenderer(event),
        request,
        piEmployeeService,
      ),
  );
  ipcMain.handle(
    PI_EMPLOYEE_SAVE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiEmployeeSave(
        isTrustedRenderer(event),
        request,
        piEmployeeService,
      ),
  );
  ipcMain.handle(
    PI_COMPANY_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiCompanyList(isTrustedRenderer(event), request, piCompanyService),
  );
  for (const [channel, action] of [
    [PI_COMPANY_CREATE_IPC_CHANNEL, "create"],
    [PI_COMPANY_UPDATE_NAME_IPC_CHANNEL, "updateName"],
    [PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL, "addEmployee"],
    [PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL, "removeEmployee"],
    [PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL, "addWorkspace"],
    [PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL, "removeWorkspace"],
  ] as const) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiCompany(
        action,
        isTrustedRenderer(event),
        request,
        piCompanyService,
      ),
    );
  }
  ipcMain.handle(
    PI_TASK_ATTACHMENT_SELECT_IPC_CHANNEL,
    async (event: IpcMainInvokeEvent, request: unknown) => {
      if (mainWindow === undefined) {
        return handleAttachmentStage(
          isTrustedRenderer(event),
          request,
          undefined,
          [],
        );
      }
      const e2ePaths =
        process.env.AI_CORPORATION_E2E === "1"
          ? parseE2eAttachmentPaths(
              process.env.AI_CORPORATION_E2E_ATTACHMENT_PATHS,
            )
          : undefined;
      const selection =
        e2ePaths === undefined
          ? await dialog.showOpenDialog(mainWindow, {
              buttonLabel: "添加附件",
              filters: [
                { name: "文档", extensions: ["docx", "pdf", "txt", "md"] },
              ],
              properties: ["openFile", "multiSelections"],
              title: "添加任务附件",
            })
          : { canceled: e2ePaths.length === 0, filePaths: e2ePaths };
      return handleAttachmentStage(
        isTrustedRenderer(event),
        request,
        taskAttachmentService,
        selection.canceled ? [] : selection.filePaths,
      );
    },
  );
  ipcMain.handle(
    PI_TASK_ATTACHMENT_STAGE_DROPPED_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAttachmentStage(
        isTrustedRenderer(event),
        request,
        taskAttachmentService,
      ),
  );
  ipcMain.handle(
    PI_TASK_ATTACHMENT_DISCARD_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleAttachmentDiscard(
        isTrustedRenderer(event),
        request,
        taskAttachmentService,
      ),
  );
  for (const [channel, action] of [
    [PI_TASK_PREVIEW_DELIVERABLE_IPC_CHANNEL, "preview"],
    [PI_TASK_OPEN_DELIVERABLE_IPC_CHANNEL, "open"],
    [PI_TASK_REVEAL_DELIVERABLE_IPC_CHANNEL, "reveal"],
  ] as const) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiTaskDeliverable(
        action,
        isTrustedRenderer(event),
        request,
        piTaskService,
      ),
    );
  }
  ipcMain.handle(
    PI_TASK_LIST_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiTaskList(isTrustedRenderer(event), request, piTaskService),
  );
  for (const [channel, action] of [
    [PI_TASK_START_IPC_CHANNEL, "start"],
    [PI_TASK_GET_IPC_CHANNEL, "get"],
    [PI_TASK_CANCEL_IPC_CHANNEL, "cancel"],
    [PI_TASK_ACCEPT_IPC_CHANNEL, "accept"],
    [PI_TASK_REQUEST_CHANGES_IPC_CHANNEL, "requestChanges"],
    [PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL, "resolveCommandApproval"],
  ] as const) {
    ipcMain.handle(channel, (event: IpcMainInvokeEvent, request: unknown) =>
      handlePiTask(action, isTrustedRenderer(event), request, piTaskService),
    );
  }
  ipcMain.handle(
    EXECUTION_START_START_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleExecutionStart(
        isTrustedRenderer(event),
        request,
        executionStartService,
      ),
  );
  ipcMain.handle(
    EXECUTION_START_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleExecutionStartGetCurrent(
        isTrustedRenderer(event),
        request,
        executionStartService,
      ),
  );
  ipcMain.handle(
    ORGANIZATION_ACTIVATION_ACTIVATE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleOrganizationActivationActivate(
        isTrustedRenderer(event),
        request,
        organizationActivationService,
      ),
  );
  ipcMain.handle(
    ORGANIZATION_ACTIVATION_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleOrganizationActivationGetCurrent(
        isTrustedRenderer(event),
        request,
        organizationActivationService,
      ),
  );
  ipcMain.handle(
    ORGANIZATION_PROPOSAL_CREATE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleOrganizationProposalCreate(
        isTrustedRenderer(event),
        request,
        organizationProposalService,
      ),
  );
  ipcMain.handle(
    ORGANIZATION_PROPOSAL_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handleOrganizationProposalGetCurrent(
        isTrustedRenderer(event),
        request,
        organizationProposalService,
      ),
  );
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
    PLANNER_START_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlannerStart(isTrustedRenderer(event), request, plannerService),
  );
  ipcMain.handle(
    PLANNER_CANCEL_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlannerCancel(isTrustedRenderer(event), request, plannerService),
  );
  ipcMain.handle(
    PLANNER_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlannerGetCurrent(
        isTrustedRenderer(event),
        request,
        plannerService,
      ),
  );
  ipcMain.handle(
    PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlanReviewGetCurrent(
        isTrustedRenderer(event),
        request,
        planReviewService,
      ),
  );
  ipcMain.handle(
    PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlanReviewListVersions(
        isTrustedRenderer(event),
        request,
        planReviewService,
      ),
  );
  ipcMain.handle(
    PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlanReviewSaveVersion(
        isTrustedRenderer(event),
        request,
        planReviewService,
      ),
  );
  ipcMain.handle(
    PLAN_REVIEW_APPROVE_IPC_CHANNEL,
    (event: IpcMainInvokeEvent, request: unknown) =>
      handlePlanReviewApprove(
        isTrustedRenderer(event),
        request,
        planReviewService,
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
    const workspaceRepository = new WorkspaceRepository(workspaceDatabase);
    workspaceService = new WorkspaceService({
      nativeClient: () => nativeCoreClient,
      repository: workspaceRepository,
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
    const providerRepository = new ProviderRepository(workspaceDatabase);
    const providerVault = new ProviderKeyVault({
      keyPath: path.join(app.getPath("userData"), "key-vault", "master-key-v1"),
    });
    providerService = new ProviderService({
      repository: providerRepository,
      vault: providerVault,
    });
    const skillLibrary = new SkillLibrary(
      path.join(app.getPath("userData"), "pi-skills"),
    );
    const skillEnvironmentManager = new SkillEnvironmentManager({
      rootDirectory: path.join(app.getPath("userData"), "skill-environments"),
      runtimeDirectory: app.isPackaged
        ? path.join(process.resourcesPath, "runtime")
        : path.join(app.getAppPath(), "build", "runtime"),
      skillLibrary,
    });
    // 每个内置技能都复制到应用自管目录，开发态和安装包行为一致。
    for (const builtinSkillName of [
      "text-organize",
      "coding-task",
      "document-processing",
    ]) {
      const builtinSkillDirectory = path.join(
        app.getAppPath(),
        app.isPackaged ? "skills" : "resources/skills",
        builtinSkillName,
      );
      const builtinPreview = await skillLibrary.previewImport(
        builtinSkillDirectory,
      );
      await skillLibrary.confirmImport(
        builtinSkillDirectory,
        builtinPreview.digest,
      );
    }
    piSkillService = new PiSkillService({
      library: skillLibrary,
      selectDirectory: async () => {
        if (mainWindow === undefined) return undefined;
        const result = await dialog.showOpenDialog(mainWindow, {
          buttonLabel: "选择技能文件夹",
          properties: ["openDirectory"],
          title: "导入技能",
        });
        return result.canceled ? undefined : result.filePaths[0];
      },
    });
    const piEmployeeRepository = new PiEmployeeRepository(workspaceDatabase);
    const piCompanyRepository = new PiCompanyRepository(workspaceDatabase);
    piEmployeeService = new PiEmployeeService({
      repository: piEmployeeRepository,
      skillLibrary,
      listProviders: () => {
        const result = providerService?.list();
        return result?.ok === true ? result.value : [];
      },
    });
    piCompanyService = new PiCompanyService({
      repository: piCompanyRepository,
      workspaceRepository,
    });
    const piTaskRepository = new PiTaskRepository(workspaceDatabase);
    taskAttachmentService = new TaskAttachmentService(
      path.join(app.getPath("userData"), "pi-task-attachments"),
    );
    piTaskService = new PiTaskService({
      companyRepository: piCompanyRepository,
      employeeRepository: piEmployeeRepository,
      taskRepository: piTaskRepository,
      skillLibrary,
      environmentManager: skillEnvironmentManager,
      attachmentService: taskAttachmentService,
      documentService: new DocumentService(),
      renderPdf,
      workspaceRepository,
      nativeClient: () => nativeCoreClient,
      openPath: (canonicalPath) => shell.openPath(canonicalPath),
      revealPath: (canonicalDirectoryPath) =>
        shell.openPath(canonicalDirectoryPath),
      resolveRuntime: (providerId, modelId) => {
        if (providerService === undefined)
          throw new Error("Provider unavailable");
        return providerService.resolveCurrentPiRuntime(providerId, modelId);
      },
    });
    await piTaskService.recoverWorkspaceWrites();
    piTaskService.recoverCommands();
    piTaskRepository.interruptRunning(new Date().toISOString());
    const goalEngineRepository = new GoalEngineRepository(workspaceDatabase);
    goalEngineRepository.interruptGenerating(new Date().toISOString());
    goalEngineService = new GoalEngineService({
      provider: providerService,
      repository: goalEngineRepository,
    });
    const plannerRepository = new PlannerRepository(workspaceDatabase);
    plannerRepository.interruptGenerating(new Date().toISOString());
    const planValidationService = new PlanValidationService({
      repository: new PlanValidationRepository(workspaceDatabase),
    });
    planValidationService.recoverPending();
    planReviewService = new PlanReviewService({
      createId: createUuidV7,
      repository: new PlanReviewRepository(workspaceDatabase),
      validator: planValidationService,
    });
    organizationProposalService = new OrganizationProposalService({
      createId: createUuidV7,
      repository: new OrganizationProposalRepository(workspaceDatabase),
    });
    organizationActivationService = new OrganizationActivationService({
      createId: createUuidV7,
      repository: new OrganizationActivationRepository(workspaceDatabase),
    });
    executionStartService = new ExecutionStartService({
      createId: createUuidV7,
      repository: new ExecutionStartRepository(workspaceDatabase),
    });
    agentRunService = new AgentRunService({
      createId: createUuidV7,
      provider: providerService,
      repository: new AgentRunRepository(workspaceDatabase),
    });
    plannerService = new PlannerService({
      provider: providerService,
      repository: plannerRepository,
      validator: planValidationService,
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
    executionStartService = undefined;
    agentRunService = undefined;
    plannerService = undefined;
    planReviewService = undefined;
    piEmployeeService = undefined;
    piCompanyService = undefined;
    piSkillService = undefined;
    piTaskService = undefined;
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

function parseE2eAttachmentPaths(
  value: string | undefined,
): string[] | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) &&
      parsed.every((item) => typeof item === "string")
      ? parsed
      : [];
  } catch {
    return [];
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let quitShutdownStarted = false;
let quitCleanupReady = false;

app.on("before-quit", (event) => {
  if (!quitCleanupReady) {
    event.preventDefault();
    if (!quitShutdownStarted) {
      quitShutdownStarted = true;
      void (piTaskService?.shutdown() ?? Promise.resolve()).finally(() => {
        quitCleanupReady = true;
        app.quit();
      });
    }
    return;
  }
  ipcMain.removeHandler(AGENT_RUN_GET_CURRENT_IPC_CHANNEL);
  ipcMain.removeHandler(AGENT_RUN_CONTINUE_IPC_CHANNEL);
  ipcMain.removeHandler(AGENT_RUN_RETRY_IPC_CHANNEL);
  ipcMain.removeHandler(AGENT_RUN_CANCEL_IPC_CHANNEL);
  ipcMain.removeHandler(NATIVE_HEALTH_IPC_CHANNEL);
  ipcMain.removeHandler(PI_SKILL_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(PI_SKILL_PREVIEW_IMPORT_IPC_CHANNEL);
  ipcMain.removeHandler(PI_SKILL_CONFIRM_IMPORT_IPC_CHANNEL);
  ipcMain.removeHandler(PI_EMPLOYEE_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(PI_EMPLOYEE_SAVE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_CREATE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_UPDATE_NAME_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_ADD_EMPLOYEE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_REMOVE_EMPLOYEE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_ADD_WORKSPACE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_COMPANY_REMOVE_WORKSPACE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_START_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_GET_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_LIST_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_CANCEL_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_ACCEPT_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_REQUEST_CHANGES_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_RESOLVE_COMMAND_APPROVAL_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_PREVIEW_DELIVERABLE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_OPEN_DELIVERABLE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_REVEAL_DELIVERABLE_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_ATTACHMENT_SELECT_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_ATTACHMENT_STAGE_DROPPED_IPC_CHANNEL);
  ipcMain.removeHandler(PI_TASK_ATTACHMENT_DISCARD_IPC_CHANNEL);
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
  ipcMain.removeHandler(PLANNER_START_IPC_CHANNEL);
  ipcMain.removeHandler(PLANNER_CANCEL_IPC_CHANNEL);
  ipcMain.removeHandler(PLANNER_GET_CURRENT_IPC_CHANNEL);
  ipcMain.removeHandler(PLAN_REVIEW_GET_CURRENT_IPC_CHANNEL);
  ipcMain.removeHandler(PLAN_REVIEW_LIST_VERSIONS_IPC_CHANNEL);
  ipcMain.removeHandler(PLAN_REVIEW_SAVE_VERSION_IPC_CHANNEL);
  ipcMain.removeHandler(PLAN_REVIEW_APPROVE_IPC_CHANNEL);
  corporationService = undefined;
  goalContractService = undefined;
  goalEngineService = undefined;
  plannerService = undefined;
  planReviewService = undefined;
  piEmployeeService = undefined;
  piCompanyService = undefined;
  piSkillService = undefined;
  piTaskService = undefined;
  providerService = undefined;
  workspaceDirectorySelector = undefined;
  workspaceService = undefined;
  workspaceDatabase?.close();
  workspaceDatabase = undefined;
  nativeCoreClient?.stop();
  nativeCoreClient = undefined;
});
