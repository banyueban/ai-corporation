import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { chromium } from "playwright";

const [executableArgument, userDataArgument] = process.argv.slice(2);
if (executableArgument === undefined || userDataArgument === undefined) {
  throw new Error("Usage: node test-real-planner.mjs <executable> <user-data>");
}
const executablePath = path.resolve(executableArgument);
const userDataDirectory = path.resolve(userDataArgument);
if (!existsSync(executablePath) || !existsSync(userDataDirectory)) {
  throw new Error(
    "The packaged executable or formal user-data directory is unavailable",
  );
}

const port = await reservePort();
const diagnostics = [];
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
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", (chunk) => {
    if (Buffer.concat(diagnostics).length < 32 * 1024) diagnostics.push(chunk);
  });
}

let browser;
try {
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await waitForApplicationPage(browser);
  const smokeName = `Planner Real Provider Smoke ${new Date().toISOString()}`;
  const facts = await page.evaluate(
    async ({ name, commandIds }) => {
      const workspaces = await window.desktop.workspace.list();
      if (!workspaces.ok) throw new Error(workspaces.error.code);
      const workspace = workspaces.value.find(
        ({ accessStatus }) => accessStatus === "AVAILABLE",
      );
      if (workspace === undefined) throw new Error("NO_AVAILABLE_WORKSPACE");
      const providers = await window.desktop.provider.list({
        schemaVersion: 1,
      });
      if (!providers.ok) throw new Error(providers.error.code);
      const provider = providers.value.find(
        ({ configStatus, connectionTest, hasKey, selectedModelId }) =>
          configStatus === "ENABLED" &&
          connectionTest?.status === "VERIFIED" &&
          hasKey &&
          selectedModelId !== undefined,
      );
      if (provider?.selectedModelId === undefined) {
        throw new Error("NO_VERIFIED_PROVIDER_MODEL");
      }
      const created = await window.desktop.corporation.create({
        schemaVersion: "1.0",
        commandId: commandIds[0],
        workspaceId: workspace.workspaceId,
        name,
      });
      if (!created.ok) throw new Error(created.error.code);
      const drafted = await window.desktop.goalContract.saveDraft({
        schemaVersion: "1.0",
        commandId: commandIds[1],
        corporationId: created.value.id,
        expectedCorporationVersion: created.value.version,
        expectedGoalVersion: 0,
        content: {
          source: "MANUAL",
          originalGoal: "Create a minimal two-step verification plan",
          statement: "Create a minimal two-step verification plan",
          successCriteria: [
            "The draft contains explicit tasks and acceptance criteria",
          ],
          inScope: ["Plan structure only"],
          outOfScope: ["Execution", "Workspace access"],
          constraints: ["Do not execute tasks"],
          assumptions: [],
          deliverables: ["Unvalidated Plan draft"],
          riskLevel: "LOW",
          budget: { maxRevisions: 1 },
          stopConditions: ["Stop after saving the draft"],
        },
      });
      if (!drafted.ok) throw new Error(drafted.error.code);
      const refreshed = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!refreshed.ok) throw new Error(refreshed.error.code);
      const approved = await window.desktop.goalContract.approve({
        schemaVersion: "1.0",
        commandId: commandIds[2],
        corporationId: created.value.id,
        expectedCorporationVersion: refreshed.value.version,
        goalVersion: drafted.value.version,
      });
      if (!approved.ok) throw new Error(approved.error.code);
      const corporation = await window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!corporation.ok) throw new Error(corporation.error.code);
      return { corporation: corporation.value, goal: approved.value, provider };
    },
    {
      name: smokeName,
      commandIds: [createUuidV7(), createUuidV7(), createUuidV7()],
    },
  );

  await page.reload();
  const card = page.locator("article").filter({ hasText: smokeName });
  await card.getByRole("button", { name: "Open Goal Contract" }).click();
  await page.getByRole("button", { name: "Start planning setup" }).click();
  await page
    .getByLabel("Verified Provider / model")
    .selectOption(facts.provider.id);
  await page
    .getByRole("button", { name: "Generate unvalidated draft" })
    .click();

  const operation = await waitForPlannerTerminal(page, facts.corporation.id);
  if (
    operation.status !== "PLAN_SAVED" ||
    operation.plan?.status !== "DRAFT" ||
    operation.plan.validationStatus !== "PENDING" ||
    operation.plan.provider.providerId !== facts.provider.id ||
    operation.plan.provider.providerVersion !== facts.provider.version ||
    operation.plan.provider.model !== facts.provider.selectedModelId
  ) {
    throw new Error(
      `Real Planner smoke failed safely: ${operation.status}/${operation.failureReason ?? "NO_REASON"}`,
    );
  }
  await page
    .getByRole("heading", { name: "Unvalidated Plan draft" })
    .waitFor({ state: "visible", timeout: 10_000 });
  const planId = operation.plan.planId;
  await page.screenshot({
    animations: "disabled",
    fullPage: true,
    path: path.resolve(
      "release",
      `m2-tu06-real-provider-${process.platform}-${process.arch}.png`,
    ),
  });

  await page.reload();
  await page
    .locator("article")
    .filter({ hasText: smokeName })
    .getByRole("button", { name: "Open Goal Contract" })
    .click();
  await page.getByRole("button", { name: "Start planning setup" }).click();
  const restored = await page.evaluate(async (corporationId) => {
    const result = await window.desktop.planner.getCurrent({
      schemaVersion: "1.0",
      corporationId,
    });
    if (!result.ok) throw new Error(result.error.code);
    return result.value;
  }, facts.corporation.id);
  if (restored?.plan?.planId !== planId) {
    throw new Error("Real Planner smoke did not restore the same saved Plan");
  }

  assertNoPlaintextKeyPattern(
    Buffer.concat(diagnostics),
    "process diagnostics",
  );
  for (const suffix of ["", "-wal", "-shm"]) {
    const candidate = path.join(
      userDataDirectory,
      `ai-corporation-workspace.sqlite3${suffix}`,
    );
    if (existsSync(candidate)) {
      assertNoPlaintextKeyPattern(readFileSync(candidate), "SQLite storage");
    }
  }
  console.log(
    JSON.stringify({
      status: operation.status,
      planVersion: operation.plan.planVersion,
      validationStatus: operation.plan.validationStatus,
      taskCount: operation.plan.tasks.length,
      usage: operation.usage,
      completedAt: operation.updatedAt,
      restoredPlanIdentity: true,
      plaintextKeyPatternFound: false,
    }),
  );
} finally {
  await browser?.close().catch(() => undefined);
  await stopChild(child);
}

async function waitForPlannerTerminal(page, corporationId) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const operation = await page.evaluate(async (id) => {
      const result = await window.desktop.planner.getCurrent({
        schemaVersion: "1.0",
        corporationId: id,
      });
      if (!result.ok) throw new Error(result.error.code);
      return result.value;
    }, corporationId);
    if (operation !== null && operation.status !== "GENERATING")
      return operation;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Real Planner smoke timed out without claiming success");
}

function createUuidV7() {
  const bytes = new Uint8Array(16);
  let remaining = Date.now();
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remaining % 256;
    remaining = Math.floor(remaining / 256);
  }
  bytes.set(randomBytes(10), 6);
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const value = [...bytes]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function assertNoPlaintextKeyPattern(buffer, source) {
  if (/sk-[A-Za-z0-9_-]{32,}/u.test(buffer.toString("latin1"))) {
    throw new Error(`A plaintext Provider Key pattern was found in ${source}`);
  }
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Could not reserve a debug port");
  }
  await new Promise((resolve, reject) =>
    server.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return address.port;
}

async function waitForDebugEndpoint(port, process) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (process.exitCode !== null)
      throw new Error("Packaged app exited during startup");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Expected until Electron exposes its debugging endpoint.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error("Packaged app did not expose its debugging endpoint");
}

async function waitForApplicationPage(browser) {
  const deadline = Date.now() + 30_000;
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
  throw new Error("Packaged application window was not observable");
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill();
  await new Promise((resolve) => {
    const timeout = setTimeout(resolve, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
  if (child.exitCode === null) child.kill("SIGKILL");
}
