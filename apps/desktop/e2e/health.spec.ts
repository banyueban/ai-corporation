import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";
import type { DesktopApi } from "../src/shared/desktop-api";

test("user authorizes and restores a Workspace through the visible window", async () => {
  const appDirectory = path.resolve(__dirname, "..");
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M1-TU-03-electron-user-data-"),
  );
  const workspaceDirectory = mkdtempSync(
    path.join(tmpdir(), "M1-TU-03-workspace-"),
  );
  const evidenceDirectory = path.resolve(appDirectory, "../../release");
  mkdirSync(evidenceDirectory, { recursive: true });

  const electronApp = await electron.launch({
    args: [appDirectory, `--user-data-dir=${userDataDirectory}`],
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
      AI_CORPORATION_E2E_WORKSPACE_PATH: workspaceDirectory,
      CI: "true",
    },
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(
      page.getByRole("status", { name: /Native Core ready/u }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await setWindowSize(electronApp, 1024, 700);
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    await expect(
      page.getByRole("heading", { name: "Create your first Corporation" }),
    ).toBeVisible();

    const startButton = page.getByRole("button", {
      name: "Select a workspace",
    });
    await startButton.focus();
    await page.keyboard.press("Enter");
    const createHeading = page.getByRole("heading", {
      name: "Choose a workspace",
    });
    await expect(createHeading).toBeFocused();

    await page.evaluate(axe.source);
    const accessibility = await page.evaluate(async () => {
      const accessibilityEngine = (
        globalThis as typeof globalThis & {
          axe: {
            run(root: Document): Promise<{
              violations: {
                impact: string | null;
                id: string;
                nodes: unknown[];
              }[];
            }>;
          };
        }
      ).axe;
      return accessibilityEngine.run(document);
    });
    expect(
      accessibility.violations.filter((violation) =>
        ["critical", "serious"].includes(violation.impact ?? ""),
      ),
    ).toEqual([]);

    const selectButton = page.getByRole("button", {
      name: "Select folder…",
    });
    await selectButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "Workspace authorized and saved." }),
    ).toBeVisible();
    await expect(
      page.getByText(workspaceDirectory, { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".selected-boundary")).toContainText(
      "Read and write",
    );
    expect(readdirSync(workspaceDirectory)).toEqual([]);

    await page.getByLabel("Corporation name *").fill("E2E Corporation");
    await page
      .getByLabel("Goal *")
      .fill("Create a verified local Goal Contract");
    await page
      .getByLabel(/Success criteria/u)
      .fill("Goal is persisted\nTimeline is visible");
    await page.getByLabel(/Expected deliverables/u).fill("Goal report");
    await page
      .getByLabel("High-impact assumption")
      .fill("The authorized workspace is the intended target");
    const mockButton = page.getByRole("button", {
      name: "Create local Mock draft",
    });
    await mockButton.focus();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeFocused();
    await expect(page.getByText("MOCK", { exact: false })).toBeVisible();
    await expect(page.getByText("Goal Contract draft saved.")).toBeVisible();
    const confirmButton = page.getByRole("button", {
      name: "Confirm Goal Contract",
    });
    await confirmButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("ASSUMPTION_CONFIRMATION_REQUIRED"),
    ).toBeVisible();

    const assumption = page.getByRole("checkbox", {
      name: /authorized workspace is the intended target/u,
    });
    await assumption.check();
    await confirmButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText:
          "Goal Contract approved. Planning and execution have not started.",
      }),
    ).toBeVisible();
    await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
    await expect(page.getByText("v2 · APPROVED · MOCK")).toBeVisible();
    await expect(page.getByText("v1 · SUPERSEDED · MOCK")).toBeVisible();
    await expect(
      page.getByText("Goal Contract approved.", { exact: true }),
    ).toBeVisible();

    const selected = await page.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok) throw new Error(workspaces.error.code);
      const workspace = workspaces.value[0];
      if (workspace === undefined) throw new Error("Workspace missing");
      const corporations = await desktop.corporation.list({
        schemaVersion: "1.0",
        workspaceId: workspace.workspaceId,
      });
      if (!corporations.ok || corporations.value.length !== 1) {
        throw new Error("Corporation list failed");
      }
      return {
        corporationId: corporations.value[0]?.id,
        workspace,
      };
    });
    expect(selected.workspace).toMatchObject({
      displayPath: workspaceDirectory,
      permissionMode: "READ_WRITE",
      accessStatus: "AVAILABLE",
    });
    if (selected.corporationId === undefined) {
      throw new Error("Corporation fixture was not returned");
    }
    const corporationId = selected.corporationId;

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await expect(page.getByText("Available")).toBeVisible();
    await expect(page.getByText("Verifying")).toHaveCount(0);
    await expect(page.getByText("E2E Corporation")).toBeVisible();
    const restoredCorporation = await page.evaluate(async (corporationId) => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      return desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId,
      });
    }, corporationId);
    expect(restoredCorporation).toMatchObject({
      ok: true,
      value: { name: "E2E Corporation", version: 4 },
    });

    const verifyButton = page.getByRole("button", { name: "Verify again" });
    await verifyButton.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(verifyButton).toBeVisible();
    const verifyButtonBox = await verifyButton.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(verifyButtonBox).not.toBeNull();
    expect(verifyButtonBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (verifyButtonBox?.y ?? viewportHeight) +
        (verifyButtonBox?.height ?? viewportHeight),
    ).toBeLessThanOrEqual(viewportHeight);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "Open Goal Contract" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeFocused();
    await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
    await expect(
      page.getByText("Goal Contract approved.", { exact: true }),
    ).toBeVisible();
    const zoomedScreenshot = await electronApp.evaluate(
      async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) {
          throw new Error("E2E_WINDOW_UNAVAILABLE");
        }
        return (await window.webContents.capturePage())
          .toPNG()
          .toString("base64");
      },
    );
    writeFileSync(
      path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-200-percent.png`,
      ),
      Buffer.from(zoomedScreenshot, "base64"),
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });
    await setWindowSize(electronApp, 1024, 700);
    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });

    await setWindowSize(electronApp, 1440, 900);
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });
  } finally {
    await electronApp.close();
    cleanupDirectory(workspaceDirectory);
    cleanupDirectory(userDataDirectory);
  }
});

async function setWindowSize(
  electronApp: Awaited<ReturnType<typeof electron.launch>>,
  width: number,
  height: number,
) {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { height, width },
  );
}

function cleanupDirectory(directory: string) {
  rmSync(directory, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 200,
  });
}
