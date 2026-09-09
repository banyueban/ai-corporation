import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

const INITIAL_SOURCE = `function sortNumbers(values) {
  return [...values].sort((left, right) => left - right);
}

module.exports = { sortNumbers };
`;

const REVIEWED_SOURCE = `function sortNumbers(values) {
  if (!Array.isArray(values)) {
    throw new TypeError("values must be an array");
  }
  return [...values].sort((left, right) => left - right);
}

module.exports = { sortNumbers };
`;

const FINAL_SOURCE = `${REVIEWED_SOURCE}
// 回归说明：排序结果不修改调用方传入的原数组。
`;

test("one coding owner uses helper handoffs and alone changes and tests code", async () => {
  test.setTimeout(90_000);
  const fixture = await startCodingCollaborationFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M15-TU-02-user-data-"),
  );
  const workspace = mkdtempSync(path.join(tmpdir(), "M15-TU-02-workspace-"));
  const app = await launchApplication(userDataDirectory, workspace);

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("编码协作验收 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M15-TU-02-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("编码协作验收公司");
    await page.getByRole("button", { name: "新建公司" }).click();

    await page.getByLabel("员工姓名").fill("唯一编码员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "编码协作验收 Provider" });
    await page.getByLabel("模型").selectOption("coding-collaboration-model");
    await page.getByLabel(/text-organize/u).uncheck();
    await page.getByLabel(/coding-task/u).check();
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“唯一编码员工”已创建，可以接收任务。"),
    ).toBeVisible();

    await page.getByLabel("员工姓名").fill("需求与检查员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "编码协作验收 Provider" });
    await page.getByLabel("模型").selectOption("coding-helper-model");
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“需求与检查员工”已创建，可以接收任务。"),
    ).toBeVisible();

    await page.getByRole("button", { name: "添加工作区" }).click();
    await page.getByRole("button", { name: "开始公司协作" }).click();
    await page
      .getByLabel("最终负责人")
      .selectOption({ label: "唯一编码员工 · coding-collaboration-model" });
    await expect(
      page.getByText(
        "这名负责人将作为唯一编码员工；其他员工只能读取资料和交回意见。",
        { exact: true },
      ),
    ).toBeVisible();
    await page
      .getByLabel("任务内容")
      .fill(
        "先让需求与检查员工整理快排要求，再由你实现 sort.js、运行检查，并让同一员工检查代码；收到意见后由你修订和复检。",
      );
    await page.getByRole("button", { name: "开始公司协作" }).last().click();

    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 30_000 },
    );

    await expect(
      page.getByRole("heading", { name: "分工与交接" }),
    ).toBeVisible();
    const assignments = page.locator(".pi-task-assignments");
    await expect(
      assignments.getByText("唯一编码员工", { exact: true }),
    ).toHaveCount(2);
    await expect(
      assignments.getByText("协助员工", { exact: true }),
    ).toHaveCount(2);
    await expect(
      assignments.getByText("整理快排的输入和边界要求", { exact: true }),
    ).toBeVisible();
    await expect(
      assignments.getByText("检查 sort.js 的边界处理", { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".pi-task-assignments")).toContainText(
      "必须拒绝非数组输入",
    );
    await expect(
      page.locator(".pi-delivery-checks .pi-delivery-check"),
    ).toHaveCount(2);
    await expect(page.locator(".pi-delivery-checks")).toContainText("通过");

    const outputPath = path.join(workspace, "sort.js");
    expect(readFileSync(outputPath, "utf8")).toBe(REVIEWED_SOURCE);
    expect(existsSync(path.join(workspace, ".git"))).toBe(false);

    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.locator(".pi-task-details")).toContainText(
      "需求与检查员工 · 模型原始输出",
    );
    await expect(page.locator(".pi-task-details")).toContainText(
      "唯一编码员工 · 工具结果",
    );
    await expect(page.locator(".pi-task-details")).toContainText(
      "唯一编码员工 · 确认结果",
    );

    const helperPayloads = fixture.requests
      .map((request) => request.body)
      .filter((body) => body.model === "coding-helper-model");
    expect(helperPayloads.length).toBeGreaterThanOrEqual(3);
    for (const payload of helperPayloads) {
      const toolNames = payload.tools?.map((tool) => tool.function?.name) ?? [];
      expect(toolNames).not.toContain("workspace_write_text");
      expect(toolNames).not.toContain("workspace_run_command");
      expect(toolNames).not.toContain("workspace_register_deliverable");
      expect(toolNames).not.toContain("skill_run_script");
    }
    const finalPayload = fixture.requests
      .map((request) => request.body)
      .find((body) => body.model === "coding-collaboration-model");
    const finalToolNames =
      finalPayload?.tools?.map((tool) => tool.function?.name) ?? [];
    expect(finalToolNames).toContain("workspace_write_text");
    expect(finalToolNames).toContain("workspace_run_command");
    expect(JSON.stringify(finalPayload)).toContain("唯一的编码员工");

    await page.getByLabel("需要修改的内容").fill("补充回归说明后再次运行检查");
    await page.getByRole("button", { name: "不通过，继续修改" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 30_000 },
    );
    expect(readFileSync(outputPath, "utf8")).toBe(FINAL_SOURCE);
    await expect(
      page.locator(".pi-delivery-checks .pi-delivery-check"),
    ).toHaveCount(3);

    for (const view of [
      { label: "1024x700", width: 1024, height: 700, zoom: 1 },
      { label: "1440x900", width: 1440, height: 900, zoom: 1 },
      { label: "1024x700-200-percent", width: 1024, height: 700, zoom: 2 },
    ]) {
      await app.evaluate(({ BrowserWindow }, target) => {
        const window = BrowserWindow.getAllWindows()[0];
        window?.setSize(target.width, target.height);
        window?.webContents.setZoomFactor(target.zoom);
      }, view);
      await page.locator(".employee-task-panel").scrollIntoViewIfNeeded();
      const layout = await page
        .locator(".employee-task-panel")
        .evaluate((panel) => ({
          clientWidth: panel.clientWidth,
          scrollWidth: panel.scrollWidth,
        }));
      expect(layout.scrollWidth).toBeLessThanOrEqual(layout.clientWidth + 2);
      await page.locator(".employee-task-panel").screenshot({
        path: test.info().outputPath(`m15-coding-${view.label}.png`),
      });
    }

    await page.getByRole("button", { name: "验收通过" }).click();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();
  } finally {
    await app.close();
    await fixture.close();
    rmSync(userDataDirectory, { recursive: true, force: true });
    rmSync(workspace, { recursive: true, force: true });
  }
});

type CapturedRequest = {
  readonly body: {
    readonly model?: string;
    readonly tools?: readonly {
      readonly function?: { readonly name?: string };
    }[];
  };
};

async function startCodingCollaborationFixture() {
  const requests: CapturedRequest[] = [];
  let finalCalls = 0;
  let helperCalls = 0;
  let changeCalls = 0;
  const initialHash = createHash("sha256").update(INITIAL_SOURCE).digest("hex");
  const reviewedHash = createHash("sha256")
    .update(REVIEWED_SOURCE)
    .digest("hex");
  const firstCommand = nodeCommand(
    "const {sortNumbers}=require('./sort.js'); const input=[3,1,2]; const result=sortNumbers(input); if (result.join(',') !== '1,2,3' || input.join(',') !== '3,1,2') process.exit(1);",
  );
  const reviewedCommand = nodeCommand(
    "const {sortNumbers}=require('./sort.js'); let rejected=false; try { sortNumbers('bad'); } catch { rejected=true; } if (!rejected || sortNumbers([2,1]).join(',') !== '1,2') process.exit(1);",
  );
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          data: [
            { id: "coding-collaboration-model" },
            { id: "coding-helper-model" },
          ],
        }),
      );
      return;
    }
    if (request.url !== "/chat/completions") {
      response.writeHead(404).end();
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(
        Buffer.concat(chunks).toString("utf8"),
      ) as CapturedRequest["body"];
      requests.push({ body });
      const text = JSON.stringify(body);
      response.writeHead(200, { "content-type": "text/event-stream" });

      if (text.includes("补充回归说明")) {
        changeCalls += 1;
        if (changeCalls === 1) {
          sendToolChunk(response, requests.length, "workspace_read_text", {
            relativePath: "sort.js",
          });
        } else if (changeCalls === 2) {
          sendToolChunk(response, requests.length, "workspace_write_text", {
            relativePath: "sort.js",
            content: FINAL_SOURCE,
            baseSha256: reviewedHash,
          });
        } else if (changeCalls === 3) {
          sendToolChunk(response, requests.length, "workspace_run_command", {
            command: reviewedCommand,
          });
        } else {
          sendTextChunk(response, "已补充回归说明并重新运行检查，等待验收。");
        }
        response.end("data: [DONE]\n\n");
        return;
      }

      if (body.model === "coding-helper-model") {
        helperCalls += 1;
        if (helperCalls === 1) {
          sendTextChunk(
            response,
            "要求交接：输入必须是数字数组；升序返回新数组；不能修改原数组。",
          );
        } else if (helperCalls === 2) {
          sendToolChunk(response, requests.length, "workspace_read_text", {
            relativePath: "sort.js",
          });
        } else {
          sendTextChunk(
            response,
            "检查意见：当前排序正确且不修改原数组，但必须拒绝非数组输入。",
          );
        }
        response.end("data: [DONE]\n\n");
        return;
      }

      finalCalls += 1;
      if (finalCalls === 1) {
        const helperId = /ID ([0-9a-f-]{36})：需求与检查员工/u.exec(text)?.[1];
        if (helperId === undefined) throw new Error("helper id missing");
        sendToolChunk(response, requests.length, "company_delegate", {
          employeeId: helperId,
          instruction: "整理快排的输入和边界要求",
        });
      } else if (finalCalls === 2) {
        sendToolChunk(response, requests.length, "skill_activate", {
          skillName: "coding-task",
        });
      } else if (finalCalls === 3) {
        sendToolChunk(response, requests.length, "workspace_write_text", {
          relativePath: "sort.js",
          content: INITIAL_SOURCE,
        });
      } else if (finalCalls === 4) {
        sendToolChunk(response, requests.length, "workspace_run_command", {
          command: firstCommand,
        });
      } else if (finalCalls === 5) {
        const helperId = /ID ([0-9a-f-]{36})：需求与检查员工/u.exec(text)?.[1];
        if (helperId === undefined) throw new Error("helper id missing");
        sendToolChunk(response, requests.length, "company_delegate", {
          employeeId: helperId,
          instruction: "检查 sort.js 的边界处理",
        });
      } else if (finalCalls === 6) {
        sendToolChunk(response, requests.length, "workspace_write_text", {
          relativePath: "sort.js",
          content: REVIEWED_SOURCE,
          baseSha256: initialHash,
        });
      } else if (finalCalls === 7) {
        sendToolChunk(response, requests.length, "workspace_run_command", {
          command: reviewedCommand,
        });
      } else {
        sendTextChunk(
          response,
          "已使用要求交接实现 sort.js，并根据检查意见完成修订和两次真实检查。",
        );
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("No port");
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

function nodeCommand(script: string): string {
  return `${JSON.stringify(process.execPath)} -e ${JSON.stringify(script)}`;
}

function sendToolChunk(
  response: import("node:http").ServerResponse,
  call: number,
  name: string,
  args: Record<string, unknown>,
) {
  sendChunk(response, {
    choices: [
      {
        index: 0,
        delta: {
          role: "assistant",
          tool_calls: [
            {
              index: 0,
              id: `call-m15-coding-${call}`,
              type: "function",
              function: { name, arguments: JSON.stringify(args) },
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
}

function sendTextChunk(
  response: import("node:http").ServerResponse,
  content: string,
) {
  sendChunk(response, {
    choices: [
      { index: 0, delta: { role: "assistant", content }, finish_reason: null },
    ],
  });
  sendChunk(response, {
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
  });
}

function sendChunk(
  response: import("node:http").ServerResponse,
  payload: Record<string, unknown>,
) {
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-m15-coding",
      object: "chat.completion.chunk",
      created: 1,
      model: "coding-collaboration-model",
      ...payload,
    })}\n\n`,
  );
}

function launchApplication(userDataDirectory: string, workspace: string) {
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
      AI_CORPORATION_E2E_WORKSPACE_PATH: workspace,
      CI: "true",
    },
  });
}
