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
      page.getByText("Workspace authorized and saved.", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await expect(page.getByText("Read and write")).toBeVisible();
    expect(readdirSync(workspaceDirectory)).toEqual([]);

    const selected = await page.evaluate(() =>
      (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop.workspace.list(),
    );
    expect(selected).toMatchObject({
      ok: true,
      value: [
        {
          displayPath: workspaceDirectory,
          permissionMode: "READ_WRITE",
          accessStatus: "AVAILABLE",
        },
      ],
    });
    if (!selected.ok) {
      throw new Error("Workspace API failed");
    }
    const workspaceId = selected.value[0]?.workspaceId;
    if (workspaceId === undefined) {
      throw new Error("Workspace fixture was not returned");
    }
    const corporationId = await page.evaluate(
      async ({ workspaceId }) => {
        const desktop = (
          globalThis as typeof globalThis & { desktop: DesktopApi }
        ).desktop;
        const created = await desktop.corporation.create({
          schemaVersion: "1.0",
          commandId: "019fa9bb-3770-7d90-a4e3-a5b0eea2a9ef",
          workspaceId,
          name: "E2E Corporation",
        });
        if (!created.ok) throw new Error(created.error.code);
        const listed = await desktop.corporation.list({
          schemaVersion: "1.0",
          workspaceId,
        });
        if (!listed.ok || listed.value.length !== 1) {
          throw new Error("Corporation list failed");
        }
        const fetched = await desktop.corporation.get({
          schemaVersion: "1.0",
          corporationId: created.value.id,
        });
        if (!fetched.ok || fetched.value.version !== 1) {
          throw new Error("Corporation get failed");
        }
        const updated = await desktop.corporation.updateName({
          schemaVersion: "1.0",
          commandId: "019fa9bb-3771-7d90-a4e3-a5b0eea2a9ef",
          corporationId: created.value.id,
          expectedVersion: created.value.version,
          name: "E2E Corporation Renamed",
        });
        if (!updated.ok || updated.value.version !== 2) {
          throw new Error("Corporation update failed");
        }
        return created.value.id;
      },
      { workspaceId },
    );

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await expect(page.getByText("Available")).toBeVisible();
    await expect(page.getByText("Verifying")).toHaveCount(0);
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
      value: { name: "E2E Corporation Renamed", version: 2 },
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
        `m1-tu03-dev-${process.platform}-${process.arch}-200-percent.png`,
      ),
      Buffer.from(zoomedScreenshot, "base64"),
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });
    await setWindowSize(electronApp, 1024, 700);
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu03-dev-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });

    await setWindowSize(electronApp, 1440, 900);
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu03-dev-${process.platform}-${process.arch}-1440x900.png`,
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
