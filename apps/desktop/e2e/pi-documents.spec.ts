import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";
import mammoth from "mammoth";
import { Document, Packer, Paragraph } from "docx";

test("employee reads a fixed attachment and creates real Word and PDF results", async () => {
  test.setTimeout(60_000);
  const fixture = await startDocumentProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M14-TU-01-user-data-"),
  );
  const taskWorkspace = mkdtempSync(
    path.join(tmpdir(), "M14-TU-01-workspace-"),
  );
  const sourceDirectory = mkdtempSync(path.join(tmpdir(), "M14-TU-01-source-"));
  const sourcePath = path.join(sourceDirectory, "source.md");
  const sourceDocxPath = path.join(sourceDirectory, "source.docx");
  const sourcePdfPath = path.join(sourceDirectory, "source.pdf");
  const originalContent = "# 原始说明\n\n请整理成 Word 和 PDF。";
  writeFileSync(sourcePath, originalContent, "utf8");
  writeFileSync(
    sourceDocxPath,
    await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph("WORD SOURCE CONTENT M14")] }],
      }),
    ),
  );
  writeFileSync(sourcePdfPath, simpleTextPdf("PDF SOURCE CONTENT M14"));
  const app = await launchApplication(userDataDirectory, taskWorkspace, [
    sourcePath,
    sourceDocxPath,
    sourcePdfPath,
  ]);

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("文档验收 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M14-TU-01-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("文档公司");
    await page.getByRole("button", { name: "新建公司" }).click();
    await expect(
      page.getByRole("heading", { name: "document-processing" }),
    ).toBeVisible();
    await page.getByLabel("员工姓名").fill("文档员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "文档验收 Provider" });
    await page.getByLabel("模型").selectOption("document-fixture-model");
    await page.getByLabel(/document-processing/u).check();
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText("员工“文档员工”已创建，可以接收任务。"),
    ).toBeVisible();

    await page.getByRole("button", { name: "添加工作区" }).click();
    await page.getByRole("button", { name: "选择附件" }).click();
    await expect(page.getByText("已添加 3 个附件。")).toBeVisible();
    await expect(
      page.getByText("source.md", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("source.docx", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByText("source.pdf", { exact: true }).first(),
    ).toBeVisible();
    // 任务开始前修改原件，模型仍必须读取软件已保存的第一版副本。
    writeFileSync(sourcePath, "用户后来的改动", "utf8");
    writeFileSync(sourceDocxPath, "用户后来替换了 Word", "utf8");
    writeFileSync(sourcePdfPath, "用户后来替换了 PDF", "utf8");
    await page
      .getByLabel("任务内容")
      .fill("读取附件，生成整理结果.docx 和整理结果.pdf");
    await page.getByRole("button", { name: "开始任务" }).click();

    await expect
      .poll(async () => page.locator(".pi-task h3").first().textContent())
      .toMatch(/等待你验收|运行失败/u);
    if (await page.getByRole("heading", { name: "运行失败" }).isVisible()) {
      const reason = await page
        .locator(".pi-task .error-copy")
        .last()
        .innerText();
      await page.getByText("查看完整模型和工具过程").click();
      const details = await page.locator(".pi-task-details").innerText();
      // CI 注解有长度限制，只保留末尾的工具结果和真正失败原因，
      // 避免前面的长模型请求把有用信息挤掉。
      throw new Error(`${reason}\n\n${details.slice(-1_500)}`);
    }
    await expect(
      page.getByText("整理结果.docx", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("整理结果.pdf", { exact: true })).toBeVisible();
    await expect(page.getByText("任务附件", { exact: true })).toBeVisible();
    expect(readFileSync(sourcePath, "utf8")).toBe("用户后来的改动");
    expect(readFileSync(sourceDocxPath, "utf8")).toBe("用户后来替换了 Word");
    expect(readFileSync(sourcePdfPath, "utf8")).toBe("用户后来替换了 PDF");

    const docxPath = path.join(taskWorkspace, "整理结果.docx");
    const pdfPath = path.join(taskWorkspace, "整理结果.pdf");
    expect(readFileSync(docxPath).subarray(0, 2).toString("ascii")).toBe("PK");
    expect(readFileSync(pdfPath).subarray(0, 5).toString("ascii")).toBe(
      "%PDF-",
    );
    expect((await mammoth.extractRawText({ path: docxPath })).value).toContain(
      "整理结果",
    );

    const docxCard = page
      .locator(".pi-delivery-file")
      .filter({ hasText: "整理结果.docx" });
    await docxCard.getByRole("button", { name: "查看内容" }).click();
    await expect(page.locator(".pi-delivery-preview pre")).toContainText(
      "这是一份由附件整理出的文档。",
    );
    const pdfCard = page
      .locator(".pi-delivery-file")
      .filter({ hasText: "整理结果.pdf" });
    await pdfCard.getByRole("button", { name: "查看内容" }).click();
    await expect(page.locator(".pi-delivery-preview pre")).toContainText(
      "这是一份由附件整理出的文档",
    );
    for (const view of [
      { label: "1024x700", width: 1024, height: 700, zoom: 1 },
      { label: "1024x700-200-percent", width: 1024, height: 700, zoom: 2 },
      { label: "1440x900", width: 1440, height: 900, zoom: 1 },
    ]) {
      await app.evaluate(({ BrowserWindow }, target) => {
        const window = BrowserWindow.getAllWindows()[0];
        window?.setSize(target.width, target.height);
        window?.webContents.setZoomFactor(target.zoom);
      }, view);
      const deliveryFile = page.locator(".pi-delivery-file").first();
      await deliveryFile.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth + 1,
        ),
      ).toBe(true);
      await expect(deliveryFile).toBeInViewport();
      await expect(
        deliveryFile.getByRole("button", { name: "查看所在位置" }),
      ).toBeInViewport();
      const screenshotPath = test
        .info()
        .outputPath(`m14-document-task-${view.label}.png`);
      if (view.zoom === 2) {
        await captureElectronViewport(app, screenshotPath);
      } else {
        await page.screenshot({ path: screenshotPath, fullPage: false });
      }
    }

    await page.getByText("查看完整模型和工具过程").click();
    const processDetails = page.locator(".pi-task-details");
    await expect(processDetails).toContainText("document_read");
    await expect(processDetails).toContainText("document_create");
    await expect(processDetails).toContainText("原始说明");
    await expect(processDetails).toContainText("请整理成 Word 和 PDF");
    await expect(processDetails).toContainText("WORD SOURCE CONTENT M14");
    await expect(processDetails).toContainText("PDF SOURCE CONTENT M14");
    await expect(processDetails).toContainText("当前任务中没有这个附件");
    const processText = await processDetails.innerText();
    expect(processText).not.toContain(sourceDirectory);
    expect(processText).not.toContain("M14-TU-01-fake-key");
  } finally {
    await app.close().catch(() => undefined);
    await fixture.close();
    for (const directory of [
      userDataDirectory,
      taskWorkspace,
      sourceDirectory,
    ]) {
      rmSync(directory, { force: true, recursive: true });
    }
  }
});

async function startDocumentProviderFixture() {
  let call = 0;
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ data: [{ id: "document-fixture-model" }] }),
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
      call += 1;
      const body = Buffer.concat(chunks).toString("utf8");
      const attachmentIds = Object.fromEntries(
        [...body.matchAll(/ID ([0-9a-f-]{36})：([^（\n]+)/gu)].map((match) => [
          match[2]?.trim(),
          match[1],
        ]),
      );
      const calls = [
        {
          name: "skill_activate",
          arguments: JSON.stringify({ skillName: "document-processing" }),
        },
        {
          name: "document_read",
          arguments: JSON.stringify({
            skillName: "document-processing",
            attachmentId: "019d0000-0000-7000-8000-000000000099",
            offset: 0,
            maxCharacters: 40_000,
          }),
        },
        {
          name: "document_read",
          arguments: JSON.stringify({
            skillName: "document-processing",
            attachmentId: attachmentIds["source.md"],
            offset: 0,
            maxCharacters: 40_000,
          }),
        },
        {
          name: "document_read",
          arguments: JSON.stringify({
            skillName: "document-processing",
            attachmentId: attachmentIds["source.docx"],
            offset: 0,
            maxCharacters: 40_000,
          }),
        },
        {
          name: "skill_activate",
          arguments: JSON.stringify({ skillName: "text-organize" }),
        },
        {
          name: "document_read",
          arguments: JSON.stringify({
            skillName: "text-organize",
            attachmentId: attachmentIds["source.pdf"],
            offset: 0,
            maxCharacters: 40_000,
          }),
        },
        {
          name: "document_create",
          arguments: JSON.stringify({
            skillName: "text-organize",
            relativePath: "整理结果.docx",
            markdown:
              "# 整理结果\n\n这是一份由附件整理出的文档。\n\n- 原件保持不变\n- 生成新的文件",
          }),
        },
        {
          name: "document_create",
          arguments: JSON.stringify({
            skillName: "document-processing",
            relativePath: "整理结果.pdf",
            markdown:
              "# 整理结果\n\n这是一份由附件整理出的文档。\n\n| 项目 | 状态 |\n| --- | --- |\n| Word | 已生成 |\n| PDF | 已生成 |",
          }),
        },
      ];
      response.writeHead(200, { "content-type": "text/event-stream" });
      const tool = calls[call - 1];
      if (tool !== undefined) {
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-document-${call}`,
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
      } else {
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "已读取固定附件并生成新的 Word 和 PDF，请验收。",
              },
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
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (address === null || typeof address === "string")
    throw new Error("fixture unavailable");
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

function sendChunk(
  response: import("node:http").ServerResponse,
  payload: Record<string, unknown>,
) {
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-m14",
      object: "chat.completion.chunk",
      created: 1,
      model: "document-fixture-model",
      ...payload,
    })}\n\n`,
  );
}

function launchApplication(
  userDataDirectory: string,
  taskWorkspace: string,
  attachmentPaths: readonly string[],
) {
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
      AI_CORPORATION_E2E_WORKSPACE_PATH: taskWorkspace,
      AI_CORPORATION_E2E_ATTACHMENT_PATHS: JSON.stringify(attachmentPaths),
      CI: "true",
    },
  });
}

/** 生成一个只含标准字体和文字层的最小 PDF，避免测试依赖外部程序。 */
function simpleTextPdf(text: string): Buffer {
  const safeText = text.replace(/[\\()]/gu, (character) => `\\${character}`);
  const stream = `BT /F1 18 Tf 72 720 Td (${safeText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(body));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "ascii");
}

async function captureElectronViewport(
  app: import("playwright").ElectronApplication,
  destination: string,
): Promise<void> {
  // Playwright 在 Electron 200% 缩放后可能只截到背景，直接从真实窗口取图。
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) throw new Error("M14 window is missing");
    const image = await window.webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  writeFileSync(destination, Buffer.from(base64, "base64"));
}
