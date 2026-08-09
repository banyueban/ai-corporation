import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const STARTUP_TIMEOUT_MS = 30_000;
const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");
const executableArgument = process.argv
  .slice(2)
  .find((argument) => argument !== "--");

if (executableArgument === undefined) {
  throw new Error(
    "Usage: pnpm test:packaged -- <repository-relative executable path>",
  );
}

const executablePath = path.resolve(repositoryDirectory, executableArgument);
if (!existsSync(executablePath)) {
  throw new Error(`Packaged executable does not exist: ${executablePath}`);
}

const userDataDirectory = mkdtempSync(
  path.join(os.tmpdir(), "M2-TU-02-packaged-user-data-"),
);
const workspaceDirectory = mkdtempSync(
  path.join(os.tmpdir(), "M1-TU-06-packaged-workspace-"),
);
const diagnosticChunks = [];
const providerSecret = `M2-TU-02-${randomUUID()}-packaged`;
const providerReplacement = `M2-TU-02-${randomUUID()}-packaged-replacement`;
const providerFixture = await startProviderFixture();
let { child, port } = await launchPackagedApplication();

let browser;
try {
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  let page = await waitForApplicationPage(browser);
  const externalRequests = [];
  const evidenceDirectory = path.join(repositoryDirectory, "release");
  const providerGenerationEvidencePath = path.join(
    evidenceDirectory,
    "m2-tu04-packaged-win32-x64-generation.png",
  );
  mkdirSync(evidenceDirectory, { recursive: true });
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
  });

  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("status", { name: /本地核心已就绪/u })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("heading", { name: "创建第一个公司" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByRole("button", { name: "设置" }).click();
  await page.getByLabel("名称").fill("Packaged Provider");
  await page
    .getByLabel("API 基础 URL")
    .fill(`${providerFixture.endpoint}/success`);
  await page.getByLabel("API Key").fill(providerSecret);
  await page.getByRole("button", { name: "保存模型服务商" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "模型服务商已保存。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "查看" }).click();
  await waitForInputValue(
    page.getByLabel("API Key"),
    providerSecret,
    "Packaged Provider reveal returned the wrong Key",
  );
  await page.getByRole("button", { name: "隐藏" }).click();
  await page.getByLabel("API Key").fill(providerReplacement);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "模型服务商已更新。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "测试连接" }).click();
  await page
    .getByRole("heading", { name: "已验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .locator(".provider-connection-panel")
    .getByText("packaged-fixture-model")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    !providerFixture.requests.some(
      ({ authorization, path: requestPath }) =>
        requestPath === "/success/models" &&
        authorization === `Bearer ${providerReplacement}`,
    )
  ) {
    throw new Error("Packaged Provider connection request was not observed");
  }
  await page
    .getByRole("combobox", { name: /^模型/u })
    .selectOption("packaged-fixture-model");
  await page.getByLabel("生成超时（秒）").fill("60");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "模型服务商已更新。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "测试生成" }).click();
  await page
    .getByRole("heading", { name: "生成成功" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Packaged fixture acknowledged.")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const generationRequest = providerFixture.requests.find(
    ({ path: requestPath }) => requestPath === "/success/chat/completions",
  );
  if (
    generationRequest?.authorization !== `Bearer ${providerReplacement}` ||
    generationRequest.body?.model !== "packaged-fixture-model" ||
    generationRequest.body?.max_tokens !== 32 ||
    generationRequest.body?.temperature !== 0 ||
    generationRequest.body?.stream !== false
  ) {
    throw new Error("Packaged Provider generation request was not observed");
  }
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: providerGenerationEvidencePath,
  });
  providerFixture.setGenerationMode("delay");
  await page.getByRole("button", { name: "测试生成" }).click();
  await page
    .getByRole("heading", { name: "正在生成" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "取消生成" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "生成测试已取消，上一次结果保持不变。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("heading", { name: "生成成功" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByLabel("生成超时（秒）").fill("5");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page
    .getByRole("heading", { name: "尚未测试" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "测试生成" }).click();
  await page
    .locator(".provider-generation-panel")
    .getByText(/在 5 秒内没有响应/u)
    .waitFor({ state: "visible", timeout: 10_000 });

  providerFixture.setGenerationMode("rate-limit");
  await page.getByRole("button", { name: "测试生成" }).click();
  await page
    .locator(".provider-generation-panel")
    .getByText(/限制了请求频率/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  providerFixture.setGenerationMode("success");
  await page.getByLabel("生成超时（秒）").fill("60");
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "测试生成" }).click();
  await page
    .getByRole("heading", { name: "生成成功" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const generationCallsAfterSuccess = providerFixture.generationCalls();
  assertPackagedSecretAbsent(providerSecret);
  assertPackagedSecretAbsent(providerReplacement);
  const masterKeyPath = path.join(
    userDataDirectory,
    "key-vault",
    "master-key-v1",
  );
  if (!existsSync(masterKeyPath) || readFileSync(masterKeyPath).length !== 32) {
    throw new Error("Packaged app-managed encryption key is invalid");
  }
  await page.getByRole("button", { name: "控制台" }).click();

  await page.getByRole("button", { name: "选择工作区" }).click();
  await page
    .getByRole("heading", { name: "选择工作区" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "选择文件夹…" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "工作区授权已保存。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .locator(".selected-boundary")
    .getByText(workspaceDirectory, { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (readdirSync(workspaceDirectory).length !== 0) {
    throw new Error("Packaged Workspace permission probe left residue");
  }

  await page.reload();
  await page
    .getByText(workspaceDirectory, { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("可用")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "新建公司" }).click();
  await page
    .getByRole("heading", { name: "选择工作区" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByLabel("公司名称 *").fill("Packaged Corporation");
  await page
    .getByLabel("目标 *")
    .fill("Create a verified packaged Goal Contract");
  await page
    .getByLabel(/成功标准/u)
    .fill("Goal is persisted\nTimeline is visible");
  await page.getByLabel(/预期交付物/u).fill("Packaged Goal report");
  await page
    .getByLabel("高影响假设")
    .fill("The packaged workspace is the intended target");

  const mockButton = page.getByRole("button", {
    name: "创建本地 Mock 草稿",
  });
  await mockButton.click();
  await page
    .getByRole("status")
    .filter({ hasText: "公司已创建，但目标合同没有保存" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("STORAGE_UNAVAILABLE")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const countAfterFailure = await page.evaluate(async () => {
    const workspaces = await window.desktop.workspace.list();
    if (!workspaces.ok || workspaces.value[0] === undefined) {
      throw new Error("Packaged Workspace list failed");
    }
    const corporations = await window.desktop.corporation.list({
      schemaVersion: "1.0",
      workspaceId: workspaces.value[0].workspaceId,
    });
    if (!corporations.ok) throw new Error(corporations.error.code);
    return corporations.value.length;
  });
  if (countAfterFailure !== 1) {
    throw new Error("Goal retry boundary created an unexpected Corporation");
  }

  await mockButton.click();
  await page
    .getByRole("heading", { name: "确认目标合同" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const confirmButton = page.getByRole("button", {
    name: "确认目标合同",
  });
  await confirmButton.click();
  await page
    .getByText("ASSUMPTION_CONFIRMATION_REQUIRED")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("checkbox", {
      name: /packaged workspace is the intended target/u,
    })
    .check();
  await confirmButton.click();
  await page
    .getByRole("status")
    .filter({
      hasText: "目标合同已批准。规划和执行尚未开始。",
    })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("版本 2 · 已批准 · 本地模拟")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("版本 1 · 已被新版替代 · 本地模拟")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("目标合同已批准。", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  const stored = await page.evaluate(async () => {
    const workspaces = await window.desktop.workspace.list();
    if (!workspaces.ok || workspaces.value[0] === undefined) {
      throw new Error("Packaged Workspace restore failed");
    }
    const corporations = await window.desktop.corporation.list({
      schemaVersion: "1.0",
      workspaceId: workspaces.value[0].workspaceId,
    });
    if (!corporations.ok || corporations.value.length !== 1) {
      throw new Error("Packaged Corporation restore failed");
    }
    const corporation = corporations.value[0];
    const goal = await window.desktop.goalContract.getCurrent({
      schemaVersion: "1.0",
      corporationId: corporation.id,
    });
    if (!goal.ok) throw new Error(goal.error.code);
    return { corporation, goal: goal.value };
  });
  if (
    stored.corporation.name !== "Packaged Corporation" ||
    stored.corporation.version !== 4 ||
    stored.goal?.version !== 2 ||
    stored.goal?.status !== "APPROVED"
  ) {
    throw new Error("Packaged Goal state did not match the completed journey");
  }
  if (externalRequests.length !== 0) {
    throw new Error(
      `Renderer made external requests: ${externalRequests.join(", ")}`,
    );
  }

  await page.reload();
  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Packaged Corporation", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "打开目标合同" }).click();
  await page
    .getByText("已批准", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("目标合同已批准。", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByRole("button", { name: "暂停公司" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("status")
    .filter({
      hasText: "公司已暂停。计划、任务和执行均未开始。",
    })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("已暂停", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const beforeRestart = await readPersistedState(page, stored.corporation.id);
  if (
    beforeRestart.corporation.status !== "PAUSED" ||
    beforeRestart.corporation.version !== 5 ||
    beforeRestart.corporation.pausedFrom !== "DRAFT"
  ) {
    throw new Error("Packaged pause state was not persisted");
  }
  await page.reload();
  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    JSON.stringify(await readPersistedState(page, stored.corporation.id)) !==
    JSON.stringify(beforeRestart)
  ) {
    throw new Error("Packaged Renderer reload changed paused state");
  }

  await browser.close();
  browser = undefined;
  await stopChild(child);
  ({ child, port } = await launchPackagedApplication());
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = await waitForApplicationPage(browser);
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
  });
  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("已暂停", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: /Packaged Provider/u }).click();
  await page
    .getByRole("heading", { name: "生成成功" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (providerFixture.generationCalls() !== generationCallsAfterSuccess) {
    throw new Error("Packaged restart automatically replayed generation");
  }
  if ((await page.getByLabel("API Key").inputValue()) !== "") {
    throw new Error("Packaged restart restored visible Key state");
  }
  await page.getByRole("button", { name: "查看" }).click();
  await waitForInputValue(
    page.getByLabel("API Key"),
    providerReplacement,
    "Packaged restart could not decrypt the saved Key",
  );
  await page.getByRole("button", { name: "隐藏" }).click();
  await page.getByRole("button", { name: "控制台" }).click();
  const afterRestart = await readPersistedState(page, stored.corporation.id);
  if (JSON.stringify(afterRestart) !== JSON.stringify(beforeRestart)) {
    throw new Error("Packaged startup changed persisted state");
  }
  const pausedEvidencePath = path.join(
    evidenceDirectory,
    `m1-tu06-packaged-${process.platform}-${process.arch}-paused-restored.png`,
  );
  await page.screenshot({ path: pausedEvidencePath });

  await page.getByRole("button", { name: "打开目标合同" }).click();
  await page.getByRole("button", { name: "继续运行公司" }).click();
  await page
    .getByRole("status")
    .filter({
      hasText: "公司已恢复到“草稿”状态，没有重复执行任何命令或事件。",
    })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const afterResume = await readPersistedState(page, stored.corporation.id);
  if (
    afterResume.corporation.status !== "DRAFT" ||
    afterResume.corporation.version !== 6 ||
    afterResume.eventCount !== beforeRestart.eventCount + 1
  ) {
    throw new Error("Packaged resume did not restore the exact prior state");
  }
  await page.reload();
  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    JSON.stringify(await readPersistedState(page, stored.corporation.id)) !==
    JSON.stringify(afterResume)
  ) {
    throw new Error("Packaged Renderer reload changed resumed state");
  }

  await browser.close();
  browser = undefined;
  await stopChild(child);
  ({ child, port } = await launchPackagedApplication());
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = await waitForApplicationPage(browser);
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
  });
  await page
    .getByRole("heading", { name: "控制台" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    JSON.stringify(await readPersistedState(page, stored.corporation.id)) !==
    JSON.stringify(afterResume)
  ) {
    throw new Error("Packaged process restart changed resumed state");
  }
  await page.getByRole("button", { name: "打开目标合同" }).click();
  await page
    .getByText("已批准", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  providerFixture.setGenerationMode("planner");
  await page.getByRole("button", { name: "开始规划设置" }).click();
  await page
    .getByRole("heading", { name: "生成并验证计划" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByLabel("已验证的模型服务商 / 模型")
    .selectOption({ label: "Packaged Provider · packaged-fixture-model" });
  await page.getByRole("button", { name: "生成并验证计划" }).click();
  await page
    .getByRole("heading", { name: "计划已通过本地验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText(/已验证 · 验证通过/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if ((await page.getByText(/仍在等待验证/u).count()) !== 0) {
    throw new Error("Packaged Planner displayed a stale pending message");
  }
  await page.locator(".inline-status").waitFor({
    state: "visible",
    timeout: STARTUP_TIMEOUT_MS,
  });
  if (
    !(await page.locator(".inline-status").textContent())?.includes(
      "已保存并通过本地验证",
    )
  ) {
    throw new Error("Packaged Planner did not display its validated result");
  }
  await page
    .getByText(/Writer · 尚未安排人员/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const plannerRequest = providerFixture.requests
    .filter(({ path: requestPath }) =>
      requestPath.endsWith("/chat/completions"),
    )
    .at(-1);
  const serializedPlannerRequest = JSON.stringify(plannerRequest?.body ?? {});
  if (
    plannerRequest?.body?.max_tokens !== 65_536 ||
    plannerRequest.body?.response_format?.type !== "json_object" ||
    plannerRequest.body?.stream !== false ||
    serializedPlannerRequest.includes(workspaceDirectory) ||
    serializedPlannerRequest.includes(providerReplacement)
  ) {
    throw new Error(
      "Packaged Planner request violated its normalized disclosure boundary",
    );
  }
  const packagedPlanner = await page.evaluate(async (corporationId) => {
    const result = await window.desktop.planner.getCurrent({
      schemaVersion: "1.0",
      corporationId,
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, stored.corporation.id);
  if (
    packagedPlanner?.status !== "PLAN_SAVED" ||
    packagedPlanner.plan?.status !== "VALIDATED" ||
    packagedPlanner.plan?.validationStatus !== "VALID"
  ) {
    throw new Error("Packaged Planner did not persist a VALIDATED/VALID Plan");
  }
  const plannerPlanId = packagedPlanner.plan.planId;
  const plannerEvidencePath = path.join(
    evidenceDirectory,
    `m2-tu07-packaged-${process.platform}-${process.arch}-planner.png`,
  );
  await page.screenshot({ path: plannerEvidencePath });
  await page.reload();
  await page.getByText("Packaged Corporation", { exact: true }).waitFor({
    state: "visible",
    timeout: STARTUP_TIMEOUT_MS,
  });
  await page.getByRole("button", { name: "打开目标合同" }).click();
  await page.getByRole("button", { name: "开始规划设置" }).click();
  await page
    .getByRole("heading", { name: "计划已通过本地验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const restoredPlannerPlanId = await page.evaluate(async (corporationId) => {
    const result = await window.desktop.planner.getCurrent({
      schemaVersion: "1.0",
      corporationId,
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.value?.plan?.planId;
  }, stored.corporation.id);
  if (restoredPlannerPlanId !== plannerPlanId) {
    throw new Error("Packaged Renderer reload changed the saved Plan identity");
  }

  const repairCorporation = await createApprovedGoal(
    page,
    "Packaged Planner Repair Corporation",
    "Create a repairable packaged Plan",
    100,
  );
  await openPlannerForCorporation(page, repairCorporation.name);
  await selectPlannerProvider(page);
  const callsBeforeRepair = providerFixture.generationCalls();
  providerFixture.enqueue("not valid json");
  providerFixture.enqueue(packagedPlannerOutput());
  await page.getByRole("button", { name: "生成并验证计划" }).click();
  await page
    .getByRole("heading", { name: "计划已通过本地验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (providerFixture.generationCalls() - callsBeforeRepair !== 2) {
    throw new Error("Packaged Planner did not perform exactly one repair");
  }
  const repairedPlanner = await getPlannerOperation(page, repairCorporation.id);
  if (repairedPlanner?.status !== "PLAN_SAVED" || !repairedPlanner.plan) {
    throw new Error("Packaged Planner repair did not save a Plan");
  }

  const failureCorporation = await createApprovedGoal(
    page,
    "Packaged Planner Repair Failure Corporation",
    "Reject two invalid packaged Plan outputs",
    110,
  );
  await openPlannerForCorporation(page, failureCorporation.name);
  await selectPlannerProvider(page);
  const callsBeforeFailure = providerFixture.generationCalls();
  providerFixture.enqueue("not valid json");
  providerFixture.enqueue("still not valid json");
  await page.getByRole("button", { name: "生成并验证计划" }).click();
  await page
    .getByRole("heading", { name: "失败" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("INVALID_MODEL_OUTPUT", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    providerFixture.generationCalls() - callsBeforeFailure !== 2 ||
    (await getPlannerOperation(page, failureCorporation.id))?.plan !== undefined
  ) {
    throw new Error(
      "Packaged Planner repair failure was not terminal and safe",
    );
  }

  await openPlannerForCorporation(page, failureCorporation.name);
  await page
    .getByRole("heading", { name: "重新选择模型服务商和准确模型" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const retryButton = page.getByRole("button", {
    name: "重新生成并验证计划",
  });
  if (await retryButton.isEnabled()) {
    throw new Error("Packaged Planner retry did not require model selection");
  }
  await selectPlannerProvider(page);
  if (providerFixture.generationCalls() - callsBeforeFailure !== 2) {
    throw new Error("Packaged Planner automatically retried after recovery");
  }
  providerFixture.enqueue(packagedPlannerOutput());
  await retryButton.click();
  await page
    .getByRole("heading", { name: "计划已通过本地验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const retriedPlanner = await getPlannerOperation(page, failureCorporation.id);
  if (
    providerFixture.generationCalls() - callsBeforeFailure !== 3 ||
    retriedPlanner?.status !== "PLAN_SAVED" ||
    retriedPlanner.plan?.validationStatus !== "VALID"
  ) {
    throw new Error(
      "Packaged Planner explicit retry did not save a valid Plan",
    );
  }

  const cancelCorporation = await createApprovedGoal(
    page,
    "Packaged Planner Cancel Corporation",
    "Cancel this packaged Plan",
    120,
  );
  await openPlannerForCorporation(page, cancelCorporation.name);
  await selectPlannerProvider(page);
  providerFixture.delayNext();
  await page
    .getByRole("button", { name: "生成并验证计划" })
    .click({ noWaitAfter: true });
  await waitForCondition(
    providerFixture.hasDelayedResponse,
    "Packaged Planner cancel request did not reach the Provider",
  );
  const cancelStartedAt = Date.now();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page
    .getByRole("heading", { name: "已取消" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    Date.now() - cancelStartedAt >= 2_000 ||
    (await getPlannerOperation(page, cancelCorporation.id))?.plan !== undefined
  ) {
    throw new Error("Packaged Planner cancellation was not prompt and safe");
  }
  providerFixture.releaseDelayed();

  const conflictCorporation = await createApprovedGoal(
    page,
    "Packaged Planner Conflict Corporation",
    "Reject stale packaged planning facts",
    130,
  );
  await openPlannerForCorporation(page, conflictCorporation.name);
  await selectPlannerProvider(page);
  providerFixture.delayNext();
  await page
    .getByRole("button", { name: "生成并验证计划" })
    .click({ noWaitAfter: true });
  await waitForCondition(
    providerFixture.hasDelayedResponse,
    "Packaged Planner conflict request did not reach the Provider",
  );
  const conflictUpdate = await page.evaluate(
    async ({ corporationId, version }) =>
      window.desktop.corporation.updateName({
        schemaVersion: "1.0",
        commandId: "019fa9bb-8131-7d90-a4e3-a5b0eea2a9ef",
        corporationId,
        expectedVersion: version,
        name: "Packaged Planner Conflict Corporation Updated",
      }),
    {
      corporationId: conflictCorporation.id,
      version: conflictCorporation.version,
    },
  );
  if (!conflictUpdate.ok) {
    throw new Error(
      `Packaged Planner conflict setup failed: ${conflictUpdate.error.code}`,
    );
  }
  providerFixture.completeDelayed(packagedPlannerOutput());
  await page
    .getByRole("heading", { name: "失败" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("VERSION_CONFLICT", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    (await getPlannerOperation(page, conflictCorporation.id))?.plan !==
    undefined
  ) {
    throw new Error("Packaged Planner version conflict persisted a stale Plan");
  }

  const interruptedCorporation = await createApprovedGoal(
    page,
    "Packaged Planner Interrupted Corporation",
    "Do not replay packaged Plan generation after restart",
    140,
  );
  await openPlannerForCorporation(page, interruptedCorporation.name);
  await selectPlannerProvider(page);
  providerFixture.delayNext();
  await page
    .getByRole("button", { name: "生成并验证计划" })
    .click({ noWaitAfter: true });
  await waitForCondition(
    providerFixture.hasDelayedResponse,
    "Packaged Planner interrupted request did not reach the Provider",
  );
  const callsBeforeRestart = providerFixture.generationCalls();
  await browser.close();
  browser = undefined;
  await stopChild(child);
  providerFixture.releaseDelayed();
  ({ child, port } = await launchPackagedApplication());
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  page = await waitForApplicationPage(browser);
  page.on("request", (request) => {
    if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
  });
  await openPlannerForCorporation(page, interruptedCorporation.name);
  await page
    .getByRole("heading", { name: "已中断" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText(/没有保存计划/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    providerFixture.generationCalls() !== callsBeforeRestart ||
    (await getPlannerOperation(page, interruptedCorporation.id))?.plan !==
      undefined
  ) {
    throw new Error("Packaged Planner restart replayed or persisted a Plan");
  }

  providerFixture.setGenerationMode("goal");
  await page.getByRole("button", { name: "控制台", exact: true }).click();
  await page.getByRole("button", { name: "新建公司" }).click();
  await page
    .getByLabel("公司名称 *")
    .fill("Packaged Provider Goal Corporation");
  await page
    .getByLabel("目标 *")
    .fill("Generate a Provider Goal in the final package");
  await page
    .getByLabel(/已验证的模型服务商和准确模型/u)
    .selectOption({ label: "Packaged Provider · packaged-fixture-model" });
  await page.getByRole("button", { name: "分析并创建模型服务商草稿" }).click();
  await page
    .getByRole("heading", { name: "确认目标合同" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("版本 1 · 草稿 · 模型服务商生成")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("status")
    .filter({ hasText: /用量：输入 13 \/ 输出 9/u })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const goalGenerationRequest = providerFixture.requests
    .filter(({ path: requestPath }) =>
      requestPath.endsWith("/chat/completions"),
    )
    .at(-1);
  if (
    goalGenerationRequest?.body?.max_tokens !== 65_536 ||
    goalGenerationRequest.body?.response_format?.type !== "json_object" ||
    goalGenerationRequest.body?.stream !== false
  ) {
    throw new Error(
      "Packaged Goal request did not use normalized JSON object output and 65K limit",
    );
  }
  const goalEngineEvidencePath = path.join(
    evidenceDirectory,
    `m2-tu05-packaged-${process.platform}-${process.arch}-goal-engine.png`,
  );
  await page.screenshot({ path: goalEngineEvidencePath });
  providerFixture.setGenerationMode("success");

  const healthText = await page
    .getByRole("status", { name: /本地核心已就绪/u })
    .getAttribute("aria-label");
  const evidencePath = path.join(
    evidenceDirectory,
    `m1-tu06-packaged-${process.platform}-${process.arch}-resumed.png`,
  );
  await page.screenshot({ path: evidencePath });
  console.log(`Packaged application health verified: ${healthText}`);
  console.log(
    "Packaged Workspace journey verified: select · authorize · reload · restore",
  );
  console.log(
    "Packaged Goal UI journey verified: create · injected save failure · retry · review · assumption gate · approve · timeline · reload · restore",
  );
  console.log(
    `Packaged Goal Engine verified: explicit Provider/model · final-package generation · PROVIDER draft · normalized usage · screenshot ${goalEngineEvidencePath}`,
  );
  console.log(
    `Packaged Planner verified: explicit Provider/model · normalized JSON · VALIDATED/VALID · stable reload · one repair · repair failure · prompt cancel · version conflict · interrupted restart without replay · screenshot ${plannerEvidencePath}`,
  );
  console.log(
    "Packaged Corporation restart journey verified: pause · reload · process restart · read-only restore · resume · reload · process restart",
  );
  console.log("Packaged Renderer external requests: 0");
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByRole("button", { name: /Packaged Provider/u }).click();
  await page
    .getByRole("heading", { name: "已验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page
    .getByLabel("API 基础 URL")
    .fill(`${providerFixture.endpoint}/auth`);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "测试连接" }).click();
  await page
    .getByRole("heading", { name: "测试失败" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .locator(".provider-connection-panel")
    .getByText(/身份验证失败/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page
    .getByLabel("API 基础 URL")
    .fill(`${providerFixture.endpoint}/delay`);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "测试连接" }).click();
  await page
    .getByText(/已经超过 10 秒/u)
    .waitFor({ state: "visible", timeout: 12_000 });
  await page
    .getByText(/在 15 秒内没有响应/u)
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.getByRole("button", { name: "测试连接" }).click();
  await page
    .getByRole("heading", { name: "正在测试" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "取消测试" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "连接测试已取消，上一次结果保持不变。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page
    .getByLabel("API 基础 URL")
    .fill(`${providerFixture.endpoint}/success`);
  await page.getByRole("button", { name: "保存修改" }).click();
  await page.getByRole("button", { name: "测试连接" }).click();
  await page
    .getByRole("heading", { name: "已验证" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const providerConnectionEvidencePath = path.join(
    evidenceDirectory,
    `m2-tu03-packaged-${process.platform}-${process.arch}-connection.png`,
  );
  await page.screenshot({ path: providerConnectionEvidencePath });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "删除已保存的 API Key" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "已删除保存的 API Key。" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  assertPackagedSecretAbsent(providerReplacement);
  console.log(
    "Packaged Provider Key Vault verified: save · masked · reveal · replace · process restart · remask · reveal · delete",
  );
  console.log(
    "Packaged Provider connection verified: success · restart restore · authentication failure · 10s diagnostic · 15s timeout · cancel · reset",
  );
  console.log(
    "Packaged Provider generation verified: exact model · Chat Completions non-streaming · normalized usage · cancel · 5s timeout · rate limit · restart restore without replay",
  );
  console.log(
    `Provider generation screenshot: ${providerGenerationEvidencePath}`,
  );
  console.log(
    `Provider connection screenshot: ${providerConnectionEvidencePath}`,
  );
  console.log(`Paused restart screenshot: ${pausedEvidencePath}`);
  console.log(`Evidence screenshot: ${evidencePath}`);
} catch (error) {
  const diagnostics = Buffer.concat(diagnosticChunks).toString("utf8").trim();
  if (diagnostics.length > 0) {
    console.error(diagnostics);
  }
  throw error;
} finally {
  await browser?.close().catch(() => undefined);
  await stopChild(child);
  await providerFixture.close();
  try {
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(
      `Could not remove temporary profile; runner cleanup will remove it: ${error}`,
    );
  }
  try {
    rmSync(workspaceDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  } catch (error) {
    console.warn(
      `Could not remove temporary workspace; runner cleanup will remove it: ${error}`,
    );
  }
}

async function startProviderFixture() {
  const requests = [];
  const queuedGenerations = [];
  let generationMode = "success";
  let delayNextGeneration = false;
  let delayedResponse;
  const server = createServer((request, response) => {
    if (request.url === "/success/chat/completions") {
      const chunks = [];
      request.on("data", (chunk) => chunks.push(chunk));
      request.on("end", () => {
        const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        requests.push({
          path: request.url ?? "",
          authorization: request.headers.authorization,
          body,
        });
        if (delayNextGeneration) {
          delayNextGeneration = false;
          delayedResponse = response;
          return;
        }
        const queuedGeneration = queuedGenerations.shift();
        if (queuedGeneration !== undefined) {
          sendPackagedGenerationResponse(response, queuedGeneration);
          return;
        }
        if (generationMode === "delay") return;
        if (generationMode === "rate-limit") {
          response.writeHead(429, { "content-type": "application/json" });
          response.end(
            JSON.stringify({ error: { code: "rate_limit_exceeded" } }),
          );
          return;
        }
        response.writeHead(200, { "content-type": "application/json" });
        const goalContent = JSON.stringify({
          draft: {
            statement: "Generate a Provider Goal in the final package",
            successCriteria: ["Provider draft is reviewable"],
            inScope: ["Final package"],
            outOfScope: [],
            constraints: [],
            assumptions: [],
            deliverables: ["Goal Contract"],
            riskLevel: "LOW",
            budget: {},
            stopConditions: [],
          },
          unresolvedQuestions: [],
        });
        const plannerContent = packagedPlannerOutput();
        response.end(
          JSON.stringify({
            model: "packaged-fixture-model",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content:
                    generationMode === "goal"
                      ? goalContent
                      : generationMode === "planner"
                        ? plannerContent
                        : "Packaged fixture acknowledged.",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens:
                generationMode === "goal"
                  ? 13
                  : generationMode === "planner"
                    ? 17
                    : 11,
              completion_tokens:
                generationMode === "goal"
                  ? 9
                  : generationMode === "planner"
                    ? 12
                    : 3,
              total_tokens:
                generationMode === "goal"
                  ? 22
                  : generationMode === "planner"
                    ? 29
                    : 14,
            },
          }),
        );
      });
      return;
    }
    requests.push({
      path: request.url ?? "",
      authorization: request.headers.authorization,
    });
    if (request.url === "/auth/models") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "invalid_api_key" } }));
      return;
    }
    if (request.url === "/delay/models") return;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ data: [{ id: "packaged-fixture-model" }] }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Packaged Provider fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    generationCalls: () =>
      requests.filter(({ path: requestPath }) =>
        requestPath.endsWith("/chat/completions"),
      ).length,
    enqueue: (output) => queuedGenerations.push(output),
    delayNext: () => {
      delayedResponse?.destroy();
      delayedResponse = undefined;
      delayNextGeneration = true;
    },
    hasDelayedResponse: () => delayedResponse !== undefined,
    releaseDelayed: () => {
      delayedResponse?.destroy();
      delayedResponse = undefined;
    },
    completeDelayed: (output) => {
      if (delayedResponse === undefined) {
        throw new Error("Packaged Provider fixture has no delayed response");
      }
      sendPackagedGenerationResponse(delayedResponse, output);
      delayedResponse = undefined;
    },
    setGenerationMode: (mode) => {
      generationMode = mode;
    },
    close: () =>
      new Promise((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function sendPackagedGenerationResponse(response, output) {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      model: "packaged-fixture-model",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: output },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 8,
        total_tokens: 20,
      },
    }),
  );
}

function packagedPlannerOutput() {
  return JSON.stringify({
    schemaVersion: "1.0",
    summary: "Create one packaged verification report.",
    tasks: [
      {
        localId: "task-one",
        title: "Create report",
        objective: "Create the packaged verification report.",
        kind: "GENERATION",
        priority: 50,
        riskLevel: "LOW",
        suggestedRole: "Writer",
        requiredCapabilities: [
          { path: "writing.document", minimumLevel: 0.7, mandatory: true },
        ],
        requiredTools: ["workspace.propose_write"],
        inputs: [
          {
            source: "GOAL_CONTRACT",
            logicalName: "approved-goal",
            required: true,
          },
        ],
        expectedOutputs: [
          {
            logicalName: "report",
            mediaType: "text/markdown",
            required: true,
            description: "Packaged verification report.",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "criterion-report",
            description: "The report matches the approved Goal.",
            severity: "REQUIRED",
            evidenceRequired: ["report"],
          },
        ],
        budget: { maxOutputTokens: 4096 },
        retryPolicy: {
          maxAttempts: 2,
          maxEvaluationRevisions: 1,
          retryableCategories: ["provider"],
        },
        permissionHints: {
          workspaceRead: false,
          workspaceWrite: [],
          processProfiles: [],
        },
        assumptions: [],
        nonGoals: [],
      },
    ],
    dependencies: [],
    milestones: [{ title: "Delivery", taskLocalIds: ["task-one"] }],
    assumptions: [],
    risks: [],
  });
}

function recordDiagnostic(chunk) {
  const currentLength = diagnosticChunks.reduce(
    (length, current) => length + current.length,
    0,
  );
  if (currentLength < 32 * 1024) {
    diagnosticChunks.push(Buffer.from(chunk));
  }
}

async function launchPackagedApplication() {
  const port = await reservePort();
  const child = spawn(
    executablePath,
    [
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${userDataDirectory}`,
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
    ],
    {
      env: {
        ...process.env,
        AI_CORPORATION_E2E: "1",
        AI_CORPORATION_E2E_GOAL_SAVE_FAIL_ONCE: "1",
        AI_CORPORATION_E2E_WORKSPACE_PATH: workspaceDirectory,
        CI: "true",
      },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  child.stdout.on("data", recordDiagnostic);
  child.stderr.on("data", recordDiagnostic);
  return { child, port };
}

function assertPackagedSecretAbsent(secret) {
  if (Buffer.concat(diagnosticChunks).includes(Buffer.from(secret))) {
    throw new Error("Packaged diagnostics exposed a Provider Key");
  }
  const databasePath = path.join(
    userDataDirectory,
    "ai-corporation-workspace.sqlite3",
  );
  for (const candidate of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
  ]) {
    if (
      existsSync(candidate) &&
      readFileSync(candidate).includes(Buffer.from(secret))
    ) {
      throw new Error("Packaged SQLite files exposed a Provider Key");
    }
  }
}

async function readPersistedState(page, corporationId) {
  return page.evaluate(async (id) => {
    const corporation = await window.desktop.corporation.get({
      schemaVersion: "1.0",
      corporationId: id,
    });
    const timeline = await window.desktop.timeline.list({
      schemaVersion: "1.0",
      corporationId: id,
      limit: 100,
    });
    if (!corporation.ok) throw new Error(corporation.error.code);
    if (!timeline.ok) throw new Error(timeline.error.code);
    return {
      corporation: corporation.value,
      eventCount: timeline.value.items.length,
    };
  }, corporationId);
}

async function createApprovedGoal(page, name, goal, idOffset) {
  return page.evaluate(
    async ({ name, goal, idOffset }) => {
      const workspaces = await window.desktop.workspace.list();
      if (!workspaces.ok || workspaces.value[0] === undefined) {
        throw new Error("Packaged workspace fixture is unavailable");
      }
      const commandId = (offset) =>
        `019fa9bb-${(0x8000 + idOffset + offset).toString(16)}-7d90-a4e3-a5b0eea2a9ef`;
      const created = await window.desktop.corporation.create({
        schemaVersion: "1.0",
        commandId: commandId(1),
        workspaceId: workspaces.value[0].workspaceId,
        name,
      });
      if (!created.ok) {
        throw new Error(`Corporation create failed: ${created.error.code}`);
      }
      let drafted = await window.desktop.goalContract.saveDraft({
        schemaVersion: "1.0",
        commandId: commandId(2),
        corporationId: created.value.id,
        expectedCorporationVersion: created.value.version,
        expectedGoalVersion: 0,
        content: {
          source: "MANUAL",
          originalGoal: goal,
          statement: goal,
          successCriteria: ["A verifiable draft exists"],
          inScope: ["Plan draft"],
          outOfScope: [],
          constraints: [],
          assumptions: [],
          deliverables: ["Plan draft"],
          riskLevel: "LOW",
          budget: {},
          stopConditions: [],
        },
      });
      if (!drafted.ok && drafted.error.code === "STORAGE_UNAVAILABLE") {
        drafted = await window.desktop.goalContract.saveDraft({
          schemaVersion: "1.0",
          commandId: commandId(4),
          corporationId: created.value.id,
          expectedCorporationVersion: created.value.version,
          expectedGoalVersion: 0,
          content: {
            source: "MANUAL",
            originalGoal: goal,
            statement: goal,
            successCriteria: ["A verifiable draft exists"],
            inScope: ["Plan draft"],
            outOfScope: [],
            constraints: [],
            assumptions: [],
            deliverables: ["Plan draft"],
            riskLevel: "LOW",
            budget: {},
            stopConditions: [],
          },
        });
      }
      if (!drafted.ok) {
        throw new Error(`Goal draft failed: ${drafted.error.code}`);
      }
      const afterDraft = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!afterDraft.ok) {
        throw new Error(`Corporation read failed: ${afterDraft.error.code}`);
      }
      const approved = await window.desktop.goalContract.approve({
        schemaVersion: "1.0",
        commandId: commandId(3),
        corporationId: created.value.id,
        expectedCorporationVersion: afterDraft.value.version,
        goalVersion: drafted.value.version,
      });
      if (!approved.ok) {
        throw new Error(`Goal approve failed: ${approved.error.code}`);
      }
      const current = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!current.ok) {
        throw new Error(`Corporation refresh failed: ${current.error.code}`);
      }
      return current.value;
    },
    { name, goal, idOffset },
  );
}

async function openPlannerForCorporation(page, corporationName) {
  await page.reload();
  const card = page.locator("article").filter({ hasText: corporationName });
  await card.getByRole("button", { name: "打开目标合同" }).click();
  await page.getByRole("button", { name: "开始规划设置" }).click();
}

async function selectPlannerProvider(page) {
  await page
    .getByLabel("已验证的模型服务商 / 模型")
    .selectOption({ label: "Packaged Provider · packaged-fixture-model" });
}

async function getPlannerOperation(page, corporationId) {
  const result = await page.evaluate(
    async (id) =>
      window.desktop.planner.getCurrent({
        schemaVersion: "1.0",
        corporationId: id,
      }),
    corporationId,
  );
  if (!result.ok) {
    throw new Error(`Packaged Planner read failed: ${result.error.code}`);
  }
  return result.value;
}

async function waitForCondition(predicate, failureMessage) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(failureMessage);
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    server.close();
    throw new Error("Could not reserve a debug port");
  }
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
  return address.port;
}

async function waitForDebugEndpoint(port, process) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (process.exitCode !== null) {
      throw new Error(
        `Packaged application exited before startup: ${process.exitCode}`,
      );
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) {
        return;
      }
    } catch {
      // The endpoint is expected to reject connections while Electron starts.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Packaged application debug endpoint did not start");
}

async function waitForApplicationPage(browser) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        if ((await page.getByRole("heading", { name: "控制台" }).count()) > 0) {
          return page;
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Packaged application window did not become observable");
}

async function waitForInputValue(locator, expected, failureMessage) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if ((await locator.inputValue()) === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(failureMessage);
}

async function stopChild(child) {
  if (child.exitCode !== null) {
    return;
  }
  child.kill();
  if (!(await waitForExit(child, 5_000))) {
    child.kill("SIGKILL");
    await waitForExit(child, 5_000);
  }
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const finish = (exited) => {
      clearTimeout(timeout);
      child.off("exit", onExit);
      resolve(exited);
    };
    const onExit = () => finish(true);
    const timeout = setTimeout(
      () => finish(child.exitCode !== null),
      timeoutMs,
    );
    child.once("exit", onExit);
    if (child.exitCode !== null) {
      finish(true);
    }
  });
}
