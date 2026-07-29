import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("renderer reaches Native Core through typed IPC", async () => {
  const appDirectory = path.resolve(__dirname, "..");
  const electronApp = await electron.launch({
    args: [appDirectory],
  });

  try {
    const window = await electronApp.firstWindow();
    await expect(window.getByText(/Native Core ready/u)).toBeVisible();
    await expect(window.getByText("AI Corporation Desktop")).toBeVisible();
  } finally {
    await electronApp.close();
  }
});
