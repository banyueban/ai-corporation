import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";

test("user tests, cancels, and restores Provider connection facts in the visible window", async () => {
  const fixture = await startProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-03-electron-user-data-"),
  );
  const secret = `M2-TU-03-${crypto.randomUUID()}-connection`;
  let electronApp = await launchApplication(
    path.resolve(__dirname, ".."),
    userDataDirectory,
  );
  try {
    let page = await electronApp.firstWindow();
    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(2);
    });
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("M2 Connection Provider");
    await page.getByLabel("API 基础 URL").fill("http://remote.example.test/v1");
    await page.getByLabel("API Key").fill(secret);
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await expect(
      page.getByText(/远程 API 基础 URL 必须使用 HTTPS/u),
    ).toBeVisible();
    await expect(page.getByText("还没有保存模型服务商。")).toBeVisible();
    await page.getByLabel("API 基础 URL").fill(`${fixture.endpoint}/success`);
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await expect(page.getByRole("heading", { name: "尚未验证" })).toBeVisible();
    const testButton = page.getByRole("button", { name: "测试连接" });
    await testButton.scrollIntoViewIfNeeded();
    await expect(testButton).toBeInViewport();

    await electronApp.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await testButton.focus();
    await expect(testButton).toBeFocused();
    await testButton.press("Enter");
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();
    const connectionPanel = page.locator(".provider-connection-panel");
    await expect(connectionPanel.getByText("fixture-model-a")).toBeVisible();
    await expect(connectionPanel.getByText("fixture-model-b")).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    expect(fixture.requests).toContainEqual({
      path: "/success/models",
      authorization: `Bearer ${secret}`,
    });
    assertSecretAbsentFromDatabase(userDataDirectory, secret);

    await page.reload();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByRole("button", { name: /M2 Connection Provider/u }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await electronApp.close();
    electronApp = await launchApplication(
      path.resolve(__dirname, ".."),
      userDataDirectory,
    );
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByRole("button", { name: /M2 Connection Provider/u }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByLabel("API 基础 URL").fill(`${fixture.endpoint}/auth`);
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByRole("heading", { name: "尚未验证" })).toBeVisible();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "测试失败" })).toBeVisible();
    await expect(
      page.locator(".provider-connection-panel").getByText(/身份验证失败/u),
    ).toBeVisible();

    await page.getByLabel("API 基础 URL").fill(`${fixture.endpoint}/delay`);
    await page.getByRole("button", { name: "保存修改" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "正在测试" })).toBeVisible();
    await page.getByRole("button", { name: "取消测试" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "连接测试已取消，上一次结果保持不变。",
    );
    await expect(page.getByRole("heading", { name: "尚未验证" })).toBeVisible();
    assertSecretAbsentFromDatabase(userDataDirectory, secret);
  } finally {
    await electronApp.close().catch(() => undefined);
    await fixture.close();
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  }
});

async function startProviderFixture(): Promise<{
  readonly close: () => Promise<void>;
  readonly endpoint: string;
  readonly requests: {
    readonly authorization?: string;
    readonly path: string;
  }[];
}> {
  const requests: { authorization?: string; path: string }[] = [];
  const server = createServer((request, response) => {
    requests.push({
      path: request.url ?? "",
      ...(request.headers.authorization === undefined
        ? {}
        : { authorization: request.headers.authorization }),
    });
    if (request.url === "/auth/models") {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "invalid_api_key" } }));
      return;
    }
    if (request.url === "/delay/models") return;
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data: [{ id: "fixture-model-a" }, { id: "fixture-model-b" }],
      }),
    );
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M2-TU-03 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

async function expectNoSeriousAxeViolations(
  page: import("@playwright/test").Page,
) {
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

async function launchApplication(
  appDirectory: string,
  userDataDirectory: string,
) {
  return electron.launch({
    args: [
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
      appDirectory,
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: { ...process.env, AI_CORPORATION_E2E: "1", CI: "true" },
  });
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
