import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";
import type { DesktopApi } from "../src/shared/desktop-api";

test("user creates and restores an independent Pi employee in the visible window", async () => {
  const fixture = await startProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M7-TU-01-electron-user-data-"),
  );
  const taskWorkspace = mkdtempSync(path.join(tmpdir(), "M8-TU-01-workspace-"));
  let app = await launchApplication(userDataDirectory, taskWorkspace);

  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("Pi 验收 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M7-TU-01-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "员工" }).click();
    await expect(
      page.getByRole("heading", { name: "员工与技能" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "text-organize" }),
    ).toBeVisible();
    await expect(page.getByText("软件内置")).toBeVisible();
    await page.getByText("查看技能实际内容").click();
    await expect(page.getByText(/不添加用户没有提供的事实/u)).toBeVisible();

    await page.getByLabel("员工姓名").fill("小文");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "Pi 验收 Provider" });
    await page.getByLabel("模型").selectOption("pi-fixture-model");
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“小文”已创建，可以接收任务。"),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "小文" })).toBeVisible();
    await expect(page.getByText("模型：pi-fixture-model")).toBeVisible();
    await expect(page.getByText("技能：text-organize")).toBeVisible();
    const providerAfterEmployee = await page.evaluate(async () => {
      const desktop = (window as unknown as { desktop: DesktopApi }).desktop;
      return desktop.provider.list({ schemaVersion: 1 });
    });
    expect(providerAfterEmployee.ok).toBe(true);
    if (!providerAfterEmployee.ok) throw new Error("Provider list failed");
    expect(providerAfterEmployee.value[0]?.selectedModelId).toBeUndefined();
    await page.getByRole("button", { name: "添加工作区" }).click();
    await expect(
      page.getByText("工作区已授权，可以用于这次任务。"),
    ).toBeVisible();
    writeFileSync(
      path.join(taskWorkspace, "source.md"),
      "需要整理的测试文字",
      "utf8",
    );
    await page
      .getByLabel("任务内容")
      .fill("请读取 source.md，把内容整理成一句话并写入 result.md");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "员工正在工作" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    await expect(page.getByText("整理完成：测试文字。").first()).toBeVisible();
    expect(readFileSync(path.join(taskWorkspace, "result.md"), "utf8")).toBe(
      "整理完成：测试文字。",
    );
    await expectEmployeePanelsKeepReadableWidth(page);
    await page.bringToFront();
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
    );
    await page.locator(".employee-task-panel").screenshot({
      path: test.info().outputPath("employee-task-layout.png"),
    });
    const processDetails = page.getByText("查看完整模型和工具过程");
    await processDetails.click();
    await expect(page.getByText("模型原始输出").first()).toBeVisible();
    await expect(page.getByText("工具开始").first()).toBeVisible();
    await expect(page.getByText("工具结果").first()).toBeVisible();
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(2);
    });
    await waitForPaint(page);
    await expectEmployeePanelsKeepReadableWidth(page, 220);
    await page.locator(".employee-task-panel").scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await page.screenshot({
      animations: "disabled",
      fullPage: true,
      path: path.resolve(
        __dirname,
        "../../../release",
        `m8-tu01-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await waitForPaint(page);
    await expectEmployeePanelsKeepReadableWidth(page);
    await page.locator(".employee-task-panel").scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m8-tu01-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });
    await page.getByLabel("需要修改的内容").fill("再短一点");
    await page.getByRole("button", { name: "不通过，继续修改" }).click();
    await expect(
      page.getByRole("heading", { name: "员工正在工作" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    expect(readFileSync(path.join(taskWorkspace, "result.md"), "utf8")).toBe(
      "测试文字。",
    );
    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.getByText("用户没有验收通过：再短一点")).toBeVisible();
    await page.getByRole("button", { name: "验收通过" }).click();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();

    writeFileSync(
      path.join(taskWorkspace, "result.md"),
      "用户刚写入的新内容",
      "utf8",
    );
    await page.getByLabel("任务内容").fill("触发并发冲突");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(page.getByRole("heading", { name: "运行失败" })).toBeVisible();
    expect(readFileSync(path.join(taskWorkspace, "result.md"), "utf8")).toBe(
      "用户刚写入的新内容",
    );
    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.getByText("工具失败", { exact: true })).toBeVisible();

    await page.getByLabel("任务内容").fill("保持运行，等待我停止");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "员工正在工作" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "停止任务" }).click();
    await expect(page.getByRole("heading", { name: "已停止" })).toBeVisible();

    await page.getByLabel("任务内容").fill("触发工具失败");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(page.getByRole("heading", { name: "运行失败" })).toBeVisible();
    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.getByText("工具失败", { exact: true })).toBeVisible();

    await page.getByLabel("任务内容").fill("触发失败");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "员工正在工作" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "运行失败" })).toBeVisible();
    const callsBeforeRestart = fixture.modelRequests();
    await app.close();
    app = await launchApplication(userDataDirectory);
    page = await app.firstWindow();
    await page.getByRole("button", { name: "员工" }).click();
    await expect(page.getByRole("heading", { name: "小文" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "运行失败" })).toBeVisible();
    expect(fixture.modelRequests()).toBe(callsBeforeRestart);

    await page.getByLabel("任务内容").fill("保持运行，验证重启恢复");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "员工正在工作" }),
    ).toBeVisible();
    const callsAtInterruptedRun = fixture.modelRequests();
    await app.close();
    app = await launchApplication(userDataDirectory);
    page = await app.firstWindow();
    await page.getByRole("button", { name: "员工" }).click();
    await expect(
      page.getByRole("heading", { name: "上次运行被中断" }),
    ).toBeVisible();
    expect(fixture.modelRequests()).toBe(callsAtInterruptedRun);
    await expect(page.getByText(/^原因：/u)).toBeVisible();
    await expectNoSeriousAxeViolations(page);

    // 重新加载整个界面，直接验证员工资料确实写入本地数据库。
    await page.reload();
    await page.getByRole("button", { name: "员工" }).click();
    await expect(page.getByRole("heading", { name: "小文" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "上次运行被中断" }),
    ).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    await fixture.close();
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
    rmSync(taskWorkspace, {
      force: true,
      maxRetries: 10,
      recursive: true,
      retryDelay: 200,
    });
  }
});

async function startProviderFixture() {
  let generationCalls = 0;
  let modelRequests = 0;
  let toolFailureStarted = false;
  let revisionCalls = 0;
  let conflictStarted = false;
  const firstResultHash = createHash("sha256")
    .update("整理完成：测试文字。", "utf8")
    .digest("hex");
  const revisionResultHash = createHash("sha256")
    .update("测试文字。", "utf8")
    .digest("hex");
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "pi-fixture-model" }] }));
      return;
    }
    if (request.url === "/chat/completions") {
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        modelRequests += 1;
        const bodyText = Buffer.concat(chunks).toString("utf8");
        if (bodyText.includes("触发工具失败")) {
          response.writeHead(200, { "content-type": "text/event-stream" });
          if (!toolFailureStarted) {
            toolFailureStarted = true;
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: "call-missing-tool",
                        type: "function",
                        function: {
                          name: "missing_demo_tool",
                          arguments: "{}",
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            });
          } else {
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: "不应标成成功。" },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
          }
          response.end("data: [DONE]\n\n");
          return;
        }
        if (bodyText.includes("触发失败")) {
          response.writeHead(500, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: { message: "受控模型失败" } }));
          return;
        }
        if (bodyText.includes("再短一点")) {
          revisionCalls += 1;
          response.writeHead(200, { "content-type": "text/event-stream" });
          if (revisionCalls <= 2) {
            const call =
              revisionCalls === 1
                ? {
                    id: "call-read-result-for-revision",
                    name: "workspace_read_text",
                    arguments: '{"relativePath":"result.md"}',
                  }
                : {
                    id: "call-write-revision",
                    name: "workspace_write_text",
                    arguments: JSON.stringify({
                      relativePath: "result.md",
                      content: "测试文字。",
                      baseSha256: firstResultHash,
                    }),
                  };
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: call.id,
                        type: "function",
                        function: {
                          name: call.name,
                          arguments: call.arguments,
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            });
          } else {
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: "修改完成。" },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
          }
          response.end("data: [DONE]\n\n");
          return;
        }
        if (bodyText.includes("触发并发冲突")) {
          response.writeHead(200, { "content-type": "text/event-stream" });
          if (!conflictStarted) {
            conflictStarted = true;
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    tool_calls: [
                      {
                        index: 0,
                        id: "call-stale-write",
                        type: "function",
                        function: {
                          name: "workspace_write_text",
                          arguments: JSON.stringify({
                            relativePath: "result.md",
                            content: "过期内容",
                            baseSha256: revisionResultHash,
                          }),
                        },
                      },
                    ],
                  },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            });
          } else {
            sendChunk(response, {
              choices: [
                {
                  index: 0,
                  delta: { role: "assistant", content: "不应覆盖用户内容。" },
                  finish_reason: null,
                },
              ],
            });
            sendChunk(response, {
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            });
          }
          response.end("data: [DONE]\n\n");
          return;
        }
        if (bodyText.includes("保持运行")) return;
        generationCalls += 1;
        response.writeHead(200, { "content-type": "text/event-stream" });
        if (generationCalls <= 3) {
          const calls = [
            {
              id: "call-list-workspace",
              name: "workspace_list",
              arguments: '{"relativePath":""}',
            },
            {
              id: "call-read-source",
              name: "workspace_read_text",
              arguments: '{"relativePath":"source.md"}',
            },
            {
              id: "call-write-result",
              name: "workspace_write_text",
              arguments:
                '{"relativePath":"result.md","content":"整理完成：测试文字。"}',
            },
          ] as const;
          const call = calls[generationCalls - 1];
          if (call === undefined) throw new Error("missing tool fixture call");
          sendChunk(response, {
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  tool_calls: [
                    {
                      index: 0,
                      id: call.id,
                      type: "function",
                      function: {
                        name: call.name,
                        arguments: call.arguments,
                      },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          });
          sendChunk(response, {
            choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
          });
        } else {
          sendChunk(response, {
            choices: [
              {
                index: 0,
                delta: { role: "assistant", content: "整理完成：测试文字。" },
                finish_reason: null,
              },
            ],
          });
          sendChunk(response, {
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          });
        }
        response.end("data: [DONE]\n\n");
      });
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: { code: "not_found" } }));
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M7-TU-01 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    modelRequests: () => modelRequests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function launchApplication(userDataDirectory: string, taskWorkspace?: string) {
  const executablePath = process.env.AI_CORPORATION_PACKAGED_EXE;
  const sharedArgs = [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--in-process-gpu",
    "--no-sandbox",
  ];
  return electron.launch({
    ...(executablePath === undefined ? {} : { executablePath }),
    args:
      executablePath === undefined
        ? [
            ...sharedArgs,
            path.resolve(__dirname, ".."),
            `--user-data-dir=${userDataDirectory}`,
          ]
        : [...sharedArgs, `--user-data-dir=${userDataDirectory}`],
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
      CI: "true",
      ...(taskWorkspace === undefined
        ? {}
        : { AI_CORPORATION_E2E_WORKSPACE_PATH: taskWorkspace }),
    },
  });
}

function sendChunk(
  response: import("node:http").ServerResponse,
  payload: Record<string, unknown>,
) {
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-visible-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "pi-fixture-model",
      ...payload,
    })}\n\n`,
  );
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

async function waitForPaint(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function expectEmployeePanelsKeepReadableWidth(
  page: import("@playwright/test").Page,
  minimumPanelWidth = 500,
) {
  // 防止员工页的标题、卡片、表单和结果再次被两栏容器压成竖排窄条。
  const widths = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".employee-task-panel");
    const form = panel?.querySelector<HTMLElement>(":scope > form");
    const task = panel?.querySelector<HTMLElement>(":scope > .pi-task");
    const employeePanels = Array.from(
      document.querySelectorAll<HTMLElement>(
        ".employee-layout > .selection-panel",
      ),
    );
    const panelColumnCounts = employeePanels.map(
      (employeePanel) =>
        window
          .getComputedStyle(employeePanel)
          .gridTemplateColumns.trim()
          .split(/\s+/u).length,
    );
    return {
      panel: panel?.getBoundingClientRect().width ?? 0,
      form: form?.getBoundingClientRect().width ?? 0,
      task: task?.getBoundingClientRect().width ?? 0,
      panelColumnCounts,
    };
  });
  expect(widths.panel).toBeGreaterThan(minimumPanelWidth);
  expect(widths.form).toBeGreaterThan(widths.panel * 0.7);
  expect(widths.task).toBeGreaterThan(widths.panel * 0.7);
  expect(widths.panelColumnCounts).toEqual([1, 1, 1]);
}
