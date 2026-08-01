import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";

test("user manages an app-owned Provider Key through the visible window", async () => {
  const appDirectory = path.resolve(__dirname, "..");
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-02-electron-user-data-"),
  );
  const firstSecret = `M2-TU-02-${crypto.randomUUID()}-first`;
  const replacementSecret = `M2-TU-02-${crypto.randomUUID()}-replacement`;
  let electronApp = await launchApplication(appDirectory, userDataDirectory);

  try {
    let page = await electronApp.firstWindow();
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
    });
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(2);
    });
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(
      page.getByRole("heading", { name: "Provider credentials" }),
    ).toBeFocused();
    await expectNoSeriousAxeViolations(page);

    await page.getByLabel("Name").fill("M2 Primary");
    await page.getByLabel("Endpoint").fill("https://api.example.test/v1");
    const keyInput = page.getByLabel("API Key");
    await keyInput.fill(firstSecret);
    await expect(keyInput).toHaveAttribute("type", "password");
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await page.getByRole("button", { name: "Show" }).click();
    await expect(keyInput).toHaveAttribute("type", "text");
    await expect(keyInput).toHaveValue(firstSecret);
    await page.getByRole("button", { name: "Hide" }).click();
    await expect(keyInput).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Save Provider" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "Provider saved.",
    );
    await expect(page.getByText("Key saved")).toBeVisible();
    await expect(keyInput).toHaveValue("");
    await expect(keyInput).toHaveAttribute("type", "password");

    assertSecretAbsentFromDatabase(userDataDirectory, firstSecret);
    const masterKeyPath = path.join(
      userDataDirectory,
      "key-vault",
      "master-key-v1",
    );
    expect(existsSync(masterKeyPath)).toBe(true);
    expect(readFileSync(masterKeyPath)).toHaveLength(32);

    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /M2 Primary/u }).click();
    const restoredInput = page.getByLabel("API Key");
    await expect(restoredInput).toHaveValue("");
    await expect(restoredInput).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(restoredInput).toHaveValue(firstSecret);
    await page.getByRole("button", { name: "Hide" }).click();
    await restoredInput.fill(replacementSecret);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "Provider updated.",
    );
    assertSecretAbsentFromDatabase(userDataDirectory, firstSecret);
    assertSecretAbsentFromDatabase(userDataDirectory, replacementSecret);

    await electronApp.close();
    electronApp = await launchApplication(appDirectory, userDataDirectory);
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /M2 Primary/u }).click();
    const restartedInput = page.getByLabel("API Key");
    await expect(restartedInput).toHaveValue("");
    await page.getByRole("button", { name: "Show" }).click();
    await expect(restartedInput).toHaveValue(replacementSecret);
    await page.getByRole("button", { name: "Hide" }).click();

    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Delete saved Key" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "Saved Key deleted.",
    );
    await expect(page.getByText("Key required")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Delete saved Key" }),
    ).toHaveCount(0);
    assertSecretAbsentFromDatabase(userDataDirectory, replacementSecret);
    expect(externalRequests).toEqual([]);
  } finally {
    await electronApp.close().catch(() => undefined);
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  }
});

async function launchApplication(
  appDirectory: string,
  userDataDirectory: string,
) {
  const application = await electron.launch({
    args: [
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
      "--enable-logging=stderr",
      appDirectory,
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
      CI: "true",
      ELECTRON_ENABLE_LOGGING: "1",
    },
  });
  application.process().stdout?.on("data", (chunk: Buffer) => {
    process.stdout.write(chunk);
  });
  application.process().stderr?.on("data", (chunk: Buffer) => {
    process.stderr.write(chunk);
  });
  application.process().on("exit", (code, signal) => {
    process.stderr.write(
      `Electron exited: code=${String(code)} signal=${String(signal)}\n`,
    );
  });
  return application;
}

function assertSecretAbsentFromDatabase(
  userDataDirectory: string,
  secret: string,
): void {
  const databasePath = path.join(
    userDataDirectory,
    "ai-corporation-workspace.sqlite3",
  );
  for (const candidate of [
    databasePath,
    `${databasePath}-wal`,
    `${databasePath}-shm`,
  ]) {
    if (!existsSync(candidate)) continue;
    expect(readFileSync(candidate).includes(Buffer.from(secret, "utf8"))).toBe(
      false,
    );
  }
}

async function expectNoSeriousAxeViolations(page: Page) {
  await page.evaluate(axe.source);
  const violations = await page.evaluate(async () => {
    const engine = (
      globalThis as typeof globalThis & {
        axe: {
          run(
            root: Document,
          ): Promise<{ violations: { impact: string | null; id: string }[] }>;
        };
      }
    ).axe;
    return (await engine.run(document)).violations.filter(({ impact }) =>
      ["critical", "serious"].includes(impact ?? ""),
    );
  });
  expect(violations).toEqual([]);
}
