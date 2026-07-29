import path from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import type { DesktopApi } from "../src/shared/desktop-api";

test("renderer reaches Native Core through typed IPC", async () => {
  const appDirectory = path.resolve(__dirname, "..");
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M1-TU-02-electron-e2e-"),
  );
  const electronApp = await electron.launch({
    args: [appDirectory, `--user-data-dir=${userDataDirectory}`],
  });

  try {
    const page = await electronApp.firstWindow();
    await expect(page.getByText(/Native Core ready/u)).toBeVisible();
    await expect(page.getByText("AI Corporation Desktop")).toBeVisible();
    expect(
      await page.evaluate(() =>
        (
          globalThis as typeof globalThis & { desktop: DesktopApi }
        ).desktop.workspace.list(),
      ),
    ).toEqual({
      ok: true,
      value: [],
    });
  } finally {
    await electronApp.close();
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  }
});
