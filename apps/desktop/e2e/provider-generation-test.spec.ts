import { createServer } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";

test("user generates, restores, cancels, and times out in the visible window", async () => {
  const fixture = await startGenerationFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-04-electron-user-data-"),
  );
  const secret = `M2-TU-04-${crypto.randomUUID()}-generation`;
  let electronApp = await launchApplication(
    path.resolve(__dirname, ".."),
    userDataDirectory,
  );
  try {
    let page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Name").fill("M2 Generation Provider");
    await page.getByLabel("Endpoint").fill(`${fixture.endpoint}/success`);
    await page.getByLabel("API Key").fill(secret);
    await page.getByRole("button", { name: "Save Provider" }).click();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("heading", { name: "Verified" })).toBeVisible();
    await page.getByLabel("Model").selectOption("fixture-model-a");
    await page.getByLabel("Generation timeout (seconds)").fill("60");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "Provider updated.",
    );

    const generationButton = page.getByRole("button", {
      name: "Test generation",
    });
    await expect(generationButton).toBeEnabled();
    await generationButton.focus();
    await expect(generationButton).toBeFocused();
    await generationButton.press("Enter");
    await expect(
      page.getByRole("heading", { name: "Generation succeeded" }),
    ).toBeVisible();
    await expect(page.getByText("Fixture acknowledged.")).toBeVisible();
    await expect(page.getByText(/Input 11 · Output 3/u)).toBeVisible();
    await expect(page.getByText(/Cost unknown/u)).toBeVisible();
    expect(fixture.requests).toContainEqual({
      path: "/success/chat/completions",
      authorization: `Bearer ${secret}`,
      body: {
        model: "fixture-model-a",
        messages: [
          {
            role: "user",
            content:
              "Return a short acknowledgement that the Provider generation test succeeded.",
          },
        ],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      },
    });
    await expectNoSeriousAxeViolations(page);

    await page.reload();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /M2 Generation Provider/u }).click();
    await expect(
      page.getByRole("heading", { name: "Generation succeeded" }),
    ).toBeVisible();
    const callsAfterReload = fixture.generationCalls();

    await electronApp.close();
    electronApp = await launchApplication(
      path.resolve(__dirname, ".."),
      userDataDirectory,
    );
    page = await electronApp.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByRole("button", { name: /M2 Generation Provider/u }).click();
    await expect(
      page.getByRole("heading", { name: "Generation succeeded" }),
    ).toBeVisible();
    expect(fixture.generationCalls()).toBe(callsAfterReload);

    fixture.setMode("delay");
    await page.getByRole("button", { name: "Test generation" }).click();
    await expect(
      page.getByRole("heading", { name: "Generating" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel generation" }).click();
    await expect(page.locator(".provider-status")).toContainText(
      "Generation test cancelled.",
    );
    await expect(
      page.getByRole("heading", { name: "Generation succeeded" }),
    ).toBeVisible();

    await page.getByLabel("Generation timeout (seconds)").fill("5");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(
      page.getByRole("heading", { name: "Not tested" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Test generation" }).click();
    await expect(
      page.getByRole("heading", { name: "Generation failed" }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(page.locator(".provider-generation-panel")).toContainText(
      /within 5 seconds/u,
    );
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

async function startGenerationFixture() {
  type Mode = "success" | "delay";
  let mode: Mode = "success";
  const requests: { path: string; authorization?: string; body?: unknown }[] =
    [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const bodyText = Buffer.concat(chunks).toString("utf8");
      requests.push({
        path: request.url ?? "",
        ...(request.headers.authorization === undefined
          ? {}
          : { authorization: request.headers.authorization }),
        ...(bodyText.length === 0 ? {} : { body: JSON.parse(bodyText) }),
      });
      if (request.url === "/success/models") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            data: [{ id: "fixture-model-a" }, { id: "fixture-model-b" }],
          }),
        );
        return;
      }
      if (request.url === "/success/chat/completions" && mode === "delay")
        return;
      if (request.url === "/success/chat/completions") {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            model: "fixture-model-a",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "Fixture acknowledged.",
                },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 11,
              completion_tokens: 3,
              total_tokens: 14,
            },
          }),
        );
        return;
      }
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "not_found" } }));
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M2-TU-04 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    generationCalls: () =>
      requests.filter(({ path: requestPath }) =>
        requestPath.endsWith("/chat/completions"),
      ).length,
    setMode: (next: Mode) => {
      mode = next;
    },
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
          run(root: Document): Promise<{
            violations: { impact: string | null; id: string }[];
          }>;
        };
      }
    ).axe;
    return (await engine.run(document)).violations.filter(({ impact }) =>
      ["critical", "serious"].includes(impact ?? ""),
    );
  });
  expect(violations).toEqual([]);
}

function launchApplication(appDirectory: string, userDataDirectory: string) {
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
