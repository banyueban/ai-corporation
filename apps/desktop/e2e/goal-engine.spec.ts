import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";

test("user creates and cancels real Goal Engine operations in the visible window", async () => {
  const fixture = await startGoalFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-05-electron-user-data-"),
  );
  const workspaceDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-05-workspace-"),
  );
  const secret = `M2-TU-05-${crypto.randomUUID()}-fake-key`;
  const app = await electron.launch({
    args: [
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
      path.resolve(__dirname, ".."),
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
      AI_CORPORATION_E2E_WORKSPACE_PATH: workspaceDirectory,
      CI: "true",
    },
  });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Settings" }).click();
    await page.getByLabel("Name").fill("Goal Fixture Provider");
    await page.getByLabel("Endpoint").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill(secret);
    await page.getByRole("button", { name: "Save Provider" }).click();
    await page.getByRole("button", { name: "Test connection" }).click();
    await expect(page.getByRole("heading", { name: "Verified" })).toBeVisible();
    await page.getByLabel("Model").selectOption("goal-model");
    await page.getByRole("button", { name: "Save changes" }).click();

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "Select a workspace" }).click();
    await page.getByRole("button", { name: /Select folder/u }).click();
    await page.getByLabel("Corporation name *").fill("Generated Corporation");
    await page.getByLabel("Goal *").fill("Launch a safe pilot");
    await page
      .getByLabel(/Verified Provider and exact model/u)
      .selectOption({ label: "Goal Fixture Provider · goal-model" });
    fixture.enqueue(goalOutput([]));
    await page
      .getByRole("button", { name: "Analyze and create Provider draft" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeFocused();
    await expect(page.getByText("v1 · DRAFT · PROVIDER")).toBeVisible();
    await expect(
      page
        .getByRole("status")
        .filter({ hasText: /usage 12 input \/ 8 output/u }),
    ).toBeVisible();
    expect(fixture.generationRequests()[0]?.body).toMatchObject({
      max_tokens: 65_536,
      response_format: { type: "json_object" },
      stream: false,
    });
    await expectNoSeriousAxeViolations(page);

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", { name: "New Corporation" }).click();
    await page.getByLabel("Corporation name *").fill("Cancelled Corporation");
    await page.getByLabel("Goal *").fill("Cancel this analysis");
    await page
      .getByLabel(/Verified Provider and exact model/u)
      .selectOption({ label: "Goal Fixture Provider · goal-model" });
    fixture.delayNext();
    await page
      .getByRole("button", { name: "Analyze and create Provider draft" })
      .click({ noWaitAfter: true });
    await expect(page.getByText("GENERATING", { exact: true })).toBeVisible();
    await expect.poll(fixture.generationCalls).toBe(2);
    await page.getByRole("button", { name: "Cancel analysis" }).click();
    await expect(page.getByText("CANCELLED", { exact: true })).toBeVisible();
    await expect(page.getByText(/did not save a Goal/u)).toBeVisible();

    fixture.enqueue("not valid json");
    fixture.enqueue(goalOutput([]));
    await page
      .getByRole("button", { name: "Analyze and create Provider draft" })
      .click();
    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeVisible();

    await openNewGoal(page, "Extended Corporation", "Clarify until the limit");
    for (let index = 0; index <= 5; index += 1) {
      fixture.enqueue(goalOutput([`Extension question ${index}`]));
    }
    await page
      .getByRole("button", { name: "Analyze and create Provider draft" })
      .click();
    for (let round = 0; round < 5; round += 1) {
      await page
        .locator(".clarification-list textarea")
        .fill(`Answer ${round}`);
      await page.getByRole("button", { name: "Submit all answers" }).click();
    }
    await expect(
      page.getByText("EXTENSION_REQUIRED", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/Provider calls are stopped/u)).toBeVisible();
    await page
      .getByRole("button", { name: "Continue another 5 rounds" })
      .click();
    await expect(page.getByText(/Cycle 2/u)).toBeVisible();
    fixture.enqueue(goalOutput([]));
    await page.locator(".clarification-list textarea").fill("Final answer");
    await page.getByRole("button", { name: "Submit all answers" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm Goal Contract" }),
    ).toBeVisible();

    await openNewGoal(
      page,
      "Assumption Corporation",
      "Save unresolved assumptions",
    );
    for (let index = 0; index <= 5; index += 1) {
      fixture.enqueue(goalOutput([`Unconfirmed question ${index}`]));
    }
    await page
      .getByRole("button", { name: "Analyze and create Provider draft" })
      .click();
    for (let round = 0; round < 5; round += 1) {
      await page
        .locator(".clarification-list textarea")
        .fill(`Known answer ${round}`);
      await page.getByRole("button", { name: "Submit all answers" }).click();
    }
    await page
      .getByRole("button", { name: "Save with unconfirmed HIGH assumptions" })
      .click();
    await expect(
      page.getByRole("checkbox", { name: /Unconfirmed question 5/u }),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: /Unconfirmed question 5/u })
      .check();
    await page.getByRole("button", { name: "Confirm Goal Contract" }).click();
    await expect(page.getByText("APPROVED", { exact: true })).toBeVisible();
    expect(
      fixture.requests.some(
        ({ authorization }) => authorization === `Bearer ${secret}`,
      ),
    ).toBe(true);
  } finally {
    fixture.releaseDelayed();
    await app.close().catch(() => undefined);
    await fixture.close();
    rmSync(workspaceDirectory, { force: true, recursive: true });
    rmSync(userDataDirectory, { force: true, recursive: true });
  }
});

async function openNewGoal(
  page: import("@playwright/test").Page,
  corporationName: string,
  goal: string,
) {
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "New Corporation" }).click();
  await page.getByLabel("Corporation name *").fill(corporationName);
  await page.getByLabel("Goal *").fill(goal);
  await page
    .getByLabel(/Verified Provider and exact model/u)
    .selectOption({ label: "Goal Fixture Provider · goal-model" });
}

async function startGoalFixture() {
  const queued: string[] = [];
  const requests: Array<{
    path: string;
    authorization?: string;
    body?: Record<string, unknown>;
  }> = [];
  let delayed = false;
  let delayedResponse: ServerResponse | undefined;
  const server = createServer((request, response) => {
    const requestRecord: (typeof requests)[number] = {
      path: request.url ?? "",
      ...(request.headers.authorization === undefined
        ? {}
        : { authorization: request.headers.authorization }),
    };
    requests.push(requestRecord);
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "goal-model" }] }));
      return;
    }
    if (request.url === "/chat/completions") {
      const chunks: Uint8Array[] = [];
      request.on("data", (chunk: Uint8Array) => chunks.push(chunk));
      request.on("end", () => {
        requestRecord.body = JSON.parse(
          Buffer.concat(chunks).toString("utf8"),
        ) as Record<string, unknown>;
        if (delayed) {
          delayed = false;
          delayedResponse = response;
          return;
        }
        const output = queued.shift();
        if (output === undefined)
          throw new Error("Goal fixture response queue is empty");
        response.writeHead(200, { "content-type": "application/json" });
        response.end(
          JSON.stringify({
            model: "goal-model",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: output },
                finish_reason: "stop",
              },
            ],
            usage: {
              prompt_tokens: 12,
              completion_tokens: 8,
              total_tokens: 20,
            },
          }),
        );
      });
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("No port");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests,
    enqueue: (output: string) => queued.push(output),
    delayNext: () => {
      delayed = true;
    },
    generationCalls: () =>
      requests.filter(
        ({ path: requestPath }) => requestPath === "/chat/completions",
      ).length,
    generationRequests: () =>
      requests.filter(
        ({ path: requestPath }) => requestPath === "/chat/completions",
      ),
    releaseDelayed: () => delayedResponse?.destroy(),
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function goalOutput(questions: readonly string[]) {
  return JSON.stringify({
    draft: {
      statement: "Launch a safe pilot",
      successCriteria: ["Pilot completes"],
      inScope: ["Pilot"],
      outOfScope: [],
      constraints: [],
      assumptions: [],
      deliverables: ["Pilot report"],
      riskLevel: "MEDIUM",
      budget: {},
      stopConditions: [],
    },
    unresolvedQuestions: questions.map((text) => ({ text, impact: "HIGH" })),
  });
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
