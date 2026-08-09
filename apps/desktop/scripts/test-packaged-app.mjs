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
    .getByRole("heading", { name: "Dashboard" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("status", { name: /Native Core ready/u })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("heading", { name: "Create your first Corporation" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByLabel("Name").fill("Packaged Provider");
  await page.getByLabel("Endpoint").fill(`${providerFixture.endpoint}/success`);
  await page.getByLabel("API Key").fill(providerSecret);
  await page.getByRole("button", { name: "Save Provider" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Provider saved." })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Show" }).click();
  await waitForInputValue(
    page.getByLabel("API Key"),
    providerSecret,
    "Packaged Provider reveal returned the wrong Key",
  );
  await page.getByRole("button", { name: "Hide" }).click();
  await page.getByLabel("API Key").fill(providerReplacement);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Provider updated." })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByRole("heading", { name: "Verified" })
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
  await page.getByLabel("Model").selectOption("packaged-fixture-model");
  await page.getByLabel("Generation timeout (seconds)").fill("60");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Provider updated." })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Test generation" }).click();
  await page
    .getByRole("heading", { name: "Generation succeeded" })
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
  await page.getByRole("button", { name: "Test generation" }).click();
  await page
    .getByRole("heading", { name: "Generating" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Cancel generation" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Generation test cancelled." })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("heading", { name: "Generation succeeded" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByLabel("Generation timeout (seconds)").fill("5");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page
    .getByRole("heading", { name: "Not tested" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Test generation" }).click();
  await page
    .locator(".provider-generation-panel")
    .getByText(/within 5 seconds/u)
    .waitFor({ state: "visible", timeout: 10_000 });

  providerFixture.setGenerationMode("rate-limit");
  await page.getByRole("button", { name: "Test generation" }).click();
  await page
    .locator(".provider-generation-panel")
    .getByText(/rate-limited/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  providerFixture.setGenerationMode("success");
  await page.getByLabel("Generation timeout (seconds)").fill("60");
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Test generation" }).click();
  await page
    .getByRole("heading", { name: "Generation succeeded" })
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
  await page.getByRole("button", { name: "Dashboard" }).click();

  await page.getByRole("button", { name: "Select a workspace" }).click();
  await page
    .getByRole("heading", { name: "Choose a workspace" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Select folder…" }).click();
  await page
    .getByRole("status")
    .filter({ hasText: "Workspace authorized and saved." })
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
    .getByText("Available")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "New Corporation" }).click();
  await page
    .getByRole("heading", { name: "Choose a workspace" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByLabel("Corporation name *").fill("Packaged Corporation");
  await page
    .getByLabel("Goal *")
    .fill("Create a verified packaged Goal Contract");
  await page
    .getByLabel(/Success criteria/u)
    .fill("Goal is persisted\nTimeline is visible");
  await page.getByLabel(/Expected deliverables/u).fill("Packaged Goal report");
  await page
    .getByLabel("High-impact assumption")
    .fill("The packaged workspace is the intended target");

  const mockButton = page.getByRole("button", {
    name: "Create local Mock draft",
  });
  await mockButton.click();
  await page
    .getByRole("status")
    .filter({ hasText: "Corporation was created, but its Goal Contract" })
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
    .getByRole("heading", { name: "Confirm Goal Contract" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const confirmButton = page.getByRole("button", {
    name: "Confirm Goal Contract",
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
      hasText:
        "Goal Contract approved. Planning and execution have not started.",
    })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("v2 · APPROVED · MOCK")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("v1 · SUPERSEDED · MOCK")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Goal Contract approved.", { exact: true })
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
    .getByRole("heading", { name: "Dashboard" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Packaged Corporation", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Open Goal Contract" }).click();
  await page
    .getByText("APPROVED", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Goal Contract approved.", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByRole("button", { name: "Pause Corporation" }).focus();
  await page.keyboard.press("Enter");
  await page
    .getByRole("status")
    .filter({
      hasText: "Corporation paused. No Plan, Task, or execution has started.",
    })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("PAUSED", { exact: true })
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
    .getByRole("heading", { name: "Dashboard" })
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
    .getByRole("heading", { name: "Dashboard" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("PAUSED", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Packaged Provider/u }).click();
  await page
    .getByRole("heading", { name: "Generation succeeded" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (providerFixture.generationCalls() !== generationCallsAfterSuccess) {
    throw new Error("Packaged restart automatically replayed generation");
  }
  if ((await page.getByLabel("API Key").inputValue()) !== "") {
    throw new Error("Packaged restart restored visible Key state");
  }
  await page.getByRole("button", { name: "Show" }).click();
  await waitForInputValue(
    page.getByLabel("API Key"),
    providerReplacement,
    "Packaged restart could not decrypt the saved Key",
  );
  await page.getByRole("button", { name: "Hide" }).click();
  await page.getByRole("button", { name: "Dashboard" }).click();
  const afterRestart = await readPersistedState(page, stored.corporation.id);
  if (JSON.stringify(afterRestart) !== JSON.stringify(beforeRestart)) {
    throw new Error("Packaged startup changed persisted state");
  }
  const pausedEvidencePath = path.join(
    evidenceDirectory,
    `m1-tu06-packaged-${process.platform}-${process.arch}-paused-restored.png`,
  );
  await page.screenshot({ path: pausedEvidencePath });

  await page.getByRole("button", { name: "Open Goal Contract" }).click();
  await page.getByRole("button", { name: "Resume Corporation" }).click();
  await page
    .getByRole("status")
    .filter({
      hasText:
        "Corporation resumed to DRAFT. No command or event was replayed.",
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
    .getByRole("heading", { name: "Dashboard" })
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
    .getByRole("heading", { name: "Dashboard" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (
    JSON.stringify(await readPersistedState(page, stored.corporation.id)) !==
    JSON.stringify(afterResume)
  ) {
    throw new Error("Packaged process restart changed resumed state");
  }
  await page.getByRole("button", { name: "Open Goal Contract" }).click();
  await page
    .getByText("APPROVED", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  providerFixture.setGenerationMode("goal");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "New Corporation" }).click();
  await page
    .getByLabel("Corporation name *")
    .fill("Packaged Provider Goal Corporation");
  await page
    .getByLabel("Goal *")
    .fill("Generate a Provider Goal in the final package");
  await page
    .getByLabel(/Verified Provider and exact model/u)
    .selectOption({ label: "Packaged Provider · packaged-fixture-model" });
  await page
    .getByRole("button", { name: "Analyze and create Provider draft" })
    .click();
  await page
    .getByRole("heading", { name: "Confirm Goal Contract" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("v1 · DRAFT · PROVIDER")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("status")
    .filter({ hasText: /usage 13 input \/ 9 output/u })
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
    .getByRole("status", { name: /Native Core ready/u })
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
    "Packaged Corporation restart journey verified: pause · reload · process restart · read-only restore · resume · reload · process restart",
  );
  console.log("Packaged Renderer external requests: 0");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: /Packaged Provider/u }).click();
  await page
    .getByRole("heading", { name: "Verified" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByLabel("Endpoint").fill(`${providerFixture.endpoint}/auth`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByRole("heading", { name: "Test failed" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .locator(".provider-connection-panel")
    .getByText(/Authentication failed/u)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByLabel("Endpoint").fill(`${providerFixture.endpoint}/delay`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByText(/taking longer than 10 seconds/u)
    .waitFor({ state: "visible", timeout: 12_000 });
  await page
    .getByText(/did not respond within 15 seconds/u)
    .first()
    .waitFor({ state: "visible", timeout: 8_000 });
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByRole("heading", { name: "Testing" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Cancel test" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Connection test cancelled." })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });

  await page.getByLabel("Endpoint").fill(`${providerFixture.endpoint}/success`);
  await page.getByRole("button", { name: "Save changes" }).click();
  await page.getByRole("button", { name: "Test connection" }).click();
  await page
    .getByRole("heading", { name: "Verified" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const providerConnectionEvidencePath = path.join(
    evidenceDirectory,
    `m2-tu03-packaged-${process.platform}-${process.arch}-connection.png`,
  );
  await page.screenshot({ path: providerConnectionEvidencePath });
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete saved Key" }).click();
  await page
    .locator(".provider-status")
    .filter({ hasText: "Saved Key deleted." })
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
  let generationMode = "success";
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
                      : "Packaged fixture acknowledged.",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: generationMode === "goal" ? 13 : 11,
              completion_tokens: generationMode === "goal" ? 9 : 3,
              total_tokens: generationMode === "goal" ? 22 : 14,
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
        if (
          (await page.getByRole("heading", { name: "Dashboard" }).count()) > 0
        ) {
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
