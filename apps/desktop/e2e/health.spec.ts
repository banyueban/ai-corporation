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
    await expect(page.getByText(/Native Core ready/u)).toBeVisible();
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
    await expect(page.getByRole("status")).toHaveText(
      "Workspace authorized and saved.",
    );
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

    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Dashboard" }),
    ).toBeVisible();
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await expect(page.getByText("Available")).toBeVisible();
    await expect(page.getByText("Verifying")).toHaveCount(0);

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
