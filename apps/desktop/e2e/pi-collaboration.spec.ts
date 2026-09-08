import { createServer } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import mammoth from "mammoth";

test("company employees hand off research and one owner creates the final Word file", async () => {
  test.setTimeout(90_000);
  const fixture = await startCollaborationProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M15-TU-01-user-data-"),
  );
  const workspace = mkdtempSync(path.join(tmpdir(), "M15-TU-01-workspace-"));
  const app = await launchApplication(userDataDirectory, workspace);

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("协作验收 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M15-TU-01-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("协作文档公司");
    await page.getByRole("button", { name: "新建公司" }).click();

    await page.getByLabel("员工姓名").fill("报告负责人");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "协作验收 Provider" });
    await page.getByLabel("模型").selectOption("collaboration-fixture-model");
    await page.getByLabel(/document-processing/u).check();
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“报告负责人”已创建，可以接收任务。"),
    ).toBeVisible();

    await page.getByLabel("员工姓名").fill("资料员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "协作验收 Provider" });
    await page.getByLabel("模型").selectOption("collaboration-fixture-model");
    await page.getByLabel(/text-organize/u).check();
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“资料员工”已创建，可以接收任务。"),
    ).toBeVisible();

    await page.getByRole("button", { name: "添加工作区" }).click();
    await page.getByRole("button", { name: "开始公司协作" }).click();
    await page
      .getByLabel("最终负责人")
      .selectOption({ label: "报告负责人 · collaboration-fixture-model" });
    await page
      .getByLabel("任务内容")
      .fill("请让资料员工整理关键事实，并生成协作报告.docx");
    await page.getByRole("button", { name: "开始公司协作" }).last().click();

    await expect
      .poll(async () => page.locator(".pi-task h3").first().textContent(), {
        timeout: 30_000,
      })
      .toBe("等待你验收");
    await expect(
      page.getByRole("heading", { name: "分工与交接" }),
    ).toBeVisible();
    await expect(
      page.getByText("资料员工", { exact: true }).last(),
    ).toBeVisible();
    const helperAssignment = page
      .locator(".pi-task-assignments .pi-delivery-check")
      .filter({ has: page.getByText("协助员工", { exact: true }) });
    await expect(
      helperAssignment.getByText("已交接", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("协作报告.docx", { exact: true }),
    ).toBeVisible();
    const outputPath = path.join(workspace, "协作报告.docx");
    expect(existsSync(outputPath)).toBe(true);
    expect(readFileSync(outputPath).subarray(0, 2).toString("ascii")).toBe(
      "PK",
    );
    expect(
      (await mammoth.extractRawText({ path: outputPath })).value,
    ).toContain("协作报告");

    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.locator(".pi-task-details")).toContainText(
      "资料员工 · 模型原始输出",
    );
    await expect(page.locator(".pi-task-details")).toContainText(
      "报告负责人 · 工具结果",
    );
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
        path: test.info().outputPath(`m15-collaboration-${view.label}.png`),
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

async function startCollaborationProviderFixture() {
  let chatCall = 0;
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ data: [{ id: "collaboration-fixture-model" }] }),
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
      chatCall += 1;
      const body = Buffer.concat(chunks).toString("utf8");
      response.writeHead(200, { "content-type": "text/event-stream" });
      if (chatCall === 1) {
        const helperId = /ID ([0-9a-f-]{36})：资料员工/u.exec(body)?.[1];
        if (helperId === undefined) {
          response.end("data: [DONE]\n\n");
          return;
        }
        sendToolChunk(response, chatCall, {
          name: "company_delegate",
          arguments: JSON.stringify({
            employeeId: helperId,
            instruction: "整理报告需要的三个关键事实",
          }),
        });
      } else if (chatCall === 2) {
        sendTextChunk(response, "资料交接：事实一、事实二、事实三。");
      } else if (chatCall === 3) {
        sendToolChunk(response, chatCall, {
          name: "skill_activate",
          arguments: JSON.stringify({ skillName: "document-processing" }),
        });
      } else if (chatCall === 4) {
        sendToolChunk(response, chatCall, {
          name: "document_create",
          arguments: JSON.stringify({
            skillName: "document-processing",
            relativePath: "协作报告.docx",
            markdown:
              "# 协作报告\n\n资料员工交接了三个关键事实。\n\n- 事实一\n- 事实二\n- 事实三\n\n**最终负责人已核对。**",
          }),
        });
      } else {
        sendTextChunk(
          response,
          "负责人已使用交接结果生成并核对协作报告.docx。",
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
  if (address === null || typeof address === "string")
    throw new Error("No port");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function sendToolChunk(
  response: import("node:http").ServerResponse,
  call: number,
  tool: { readonly name: string; readonly arguments: string },
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
              id: `call-collaboration-${call}`,
              type: "function",
              function: tool,
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
      id: "chatcmpl-m15",
      object: "chat.completion.chunk",
      created: 1,
      model: "collaboration-fixture-model",
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
