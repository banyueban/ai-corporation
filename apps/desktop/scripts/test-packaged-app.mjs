import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import net from "node:net";
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
  path.join(os.tmpdir(), "M1-TU-03-packaged-user-data-"),
);
const workspaceDirectory = mkdtempSync(
  path.join(os.tmpdir(), "M1-TU-03-packaged-workspace-"),
);
const port = await reservePort();
const diagnosticChunks = [];
const child = spawn(
  executablePath,
  [`--remote-debugging-port=${port}`, `--user-data-dir=${userDataDirectory}`],
  {
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
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

let browser;
try {
  await waitForDebugEndpoint(port, child);
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = await waitForApplicationPage(browser);

  await page
    .getByRole("heading", { name: "Dashboard" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("status", { name: /Native Core ready/u })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByRole("heading", { name: "Create your first Corporation" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Select a workspace" }).click();
  await page
    .getByRole("heading", { name: "Choose a workspace" })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page.getByRole("button", { name: "Select folder…" }).click();
  await page
    .getByText("Workspace authorized and saved.", { exact: true })
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText(workspaceDirectory)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  if (readdirSync(workspaceDirectory).length !== 0) {
    throw new Error("Packaged Workspace permission probe left residue");
  }

  await page.reload();
  await page
    .getByText(workspaceDirectory)
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  await page
    .getByText("Available")
    .waitFor({ state: "visible", timeout: STARTUP_TIMEOUT_MS });
  const workspaceList = await page.evaluate(() =>
    window.desktop.workspace.list(),
  );
  if (
    workspaceList.ok !== true ||
    !Array.isArray(workspaceList.value) ||
    workspaceList.value.length !== 1 ||
    workspaceList.value[0]?.displayPath !== workspaceDirectory ||
    workspaceList.value[0]?.accessStatus !== "AVAILABLE"
  ) {
    throw new Error("Packaged Workspace did not survive the Renderer reload");
  }
  const workspaceId = workspaceList.value[0].workspaceId;
  const corporationId = await page.evaluate(async (workspaceId) => {
    const created = await window.desktop.corporation.create({
      schemaVersion: "1.0",
      commandId: "019fa9bb-3780-7d90-a4e3-a5b0eea2a9ef",
      workspaceId,
      name: "Packaged Corporation",
    });
    if (!created.ok) throw new Error(created.error.code);
    const listed = await window.desktop.corporation.list({
      schemaVersion: "1.0",
      workspaceId,
    });
    if (!listed.ok || listed.value.length !== 1) {
      throw new Error("Packaged Corporation list failed");
    }
    const updated = await window.desktop.corporation.updateName({
      schemaVersion: "1.0",
      commandId: "019fa9bb-3781-7d90-a4e3-a5b0eea2a9ef",
      corporationId: created.value.id,
      expectedVersion: 1,
      name: "Packaged Corporation Renamed",
    });
    if (!updated.ok || updated.value.version !== 2) {
      throw new Error("Packaged Corporation update failed");
    }
    return created.value.id;
  }, workspaceId);
  await page.reload();
  const restoredCorporation = await page.evaluate(
    (corporationId) =>
      window.desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId,
      }),
    corporationId,
  );
  if (
    !restoredCorporation.ok ||
    restoredCorporation.value.name !== "Packaged Corporation Renamed" ||
    restoredCorporation.value.version !== 2
  ) {
    throw new Error("Packaged Corporation did not survive Renderer reload");
  }

  const healthText = await page
    .getByRole("status", { name: /Native Core ready/u })
    .getAttribute("aria-label");
  const evidenceDirectory = path.join(repositoryDirectory, "release");
  const evidencePath = path.join(
    evidenceDirectory,
    `packaged-workspace-${process.platform}-${process.arch}.png`,
  );
  mkdirSync(evidenceDirectory, { recursive: true });
  await page.screenshot({ path: evidencePath });
  console.log(`Packaged application health verified: ${healthText}`);
  console.log(
    "Packaged Workspace journey verified: select · authorize · reload · restore",
  );
  console.log(
    "Packaged Corporation API journey verified: create · get/list · update · reload · restore",
  );
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

function recordDiagnostic(chunk) {
  const currentLength = diagnosticChunks.reduce(
    (length, current) => length + current.length,
    0,
  );
  if (currentLength < 32 * 1024) {
    diagnosticChunks.push(Buffer.from(chunk));
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
