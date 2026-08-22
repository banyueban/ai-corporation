import path from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("saved real Provider repairs code and runs its test", async () => {
  test.skip(
    process.env.AI_CORPORATION_REAL_PROVIDER !== "1",
    "只在明确发起本机真实 Provider 验收时运行",
  );
  test.setTimeout(180_000);
  const userDataDirectory = process.env.AI_CORPORATION_REAL_USER_DATA;
  if (userDataDirectory === undefined) {
    throw new Error("AI_CORPORATION_REAL_USER_DATA is required");
  }
  const taskWorkspace = process.env.AI_CORPORATION_REAL_WORKSPACE;
  if (taskWorkspace === undefined) {
    throw new Error("AI_CORPORATION_REAL_WORKSPACE is required");
  }
  const executablePath = process.env.AI_CORPORATION_PACKAGED_EXE;
  const fixtureRelativeDirectory = "m9-real-provider-fixture";
  const fixtureDirectory = path.join(taskWorkspace, fixtureRelativeDirectory);
  const sharedArgs = [
    "--disable-gpu",
    "--disable-software-rasterizer",
    "--in-process-gpu",
    "--no-sandbox",
  ];
  const app = await electron.launch({
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
      CI: "true",
    },
  });

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "员工" }).click();
    if (
      (await page
        .getByRole("heading", { name: "真实编码验收员工", exact: true })
        .count()) === 0
    ) {
      await page.getByLabel("员工姓名").fill("真实编码验收员工");
      await page.getByLabel("Provider").selectOption({ label: "deepseek" });
      await page.getByLabel("模型").selectOption("deepseek-v4-flash");
      await page.getByLabel(/text-organize/u).uncheck();
      await page.getByLabel(/coding-task/u).check();
      await page.getByRole("button", { name: "创建员工" }).click();
      await expect(
        page.getByText("员工“真实编码验收员工”已创建，可以接收任务。"),
      ).toBeVisible();
    }
    await page
      .getByLabel("员工", { exact: true })
      .selectOption({ label: "真实编码验收员工 · deepseek-v4-flash" });
    const workspaceSelect = page.getByLabel("本次任务的工作区");
    const workspaceOptions = await workspaceSelect
      .locator("option")
      .allTextContents();
    if (workspaceOptions.includes(taskWorkspace)) {
      await workspaceSelect.selectOption({ label: taskWorkspace });
    } else {
      await page.getByRole("button", { name: "添加工作区" }).click();
      await expect(
        page.getByText("工作区已授权，可以用于这次任务。"),
      ).toBeVisible();
    }
    // 真实模型也使用隔离的小项目，避免碰用户仓库里的任何文件。
    mkdirSync(fixtureDirectory, { recursive: true });
    writeFileSync(
      path.join(fixtureDirectory, "calculator.js"),
      "module.exports.add = (a, b) => a - b;\n",
      "utf8",
    );
    writeFileSync(
      path.join(fixtureDirectory, "check.js"),
      [
        'const { add } = require("./calculator");',
        'if (add(2, 3) !== 5) throw new Error("加法仍然错误");',
        'console.log("M9-REAL-PROVIDER-OK");',
        "",
      ].join("\n"),
      "utf8",
    );
    await page
      .getByLabel("任务内容")
      .fill(
        [
          `请修复当前工作区 ${fixtureRelativeDirectory}/calculator.js 里的加法错误。`,
          `必须先读取文件，只做必要修改，再用命令 node ${fixtureRelativeDirectory}/check.js 运行真实测试。`,
          "不要只解释；测试通过后再交付。",
        ].join("\n"),
      );
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行命令？" }),
    ).toBeVisible({ timeout: 120_000 });
    await page.getByRole("button", { name: "允许本任务运行命令" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 120_000 },
    );
    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.getByText("模型原始输出").first()).toBeVisible();
    await expect(page.getByText("工具开始").first()).toBeVisible();
    await expect(page.getByText("工具结果").first()).toBeVisible();
    await expect(page.locator(".pi-task")).not.toContainText("Authorization");
    await expect(page.getByText(/M9-REAL-PROVIDER-OK/u).first()).toBeVisible();
    expect(
      readFileSync(path.join(fixtureDirectory, "calculator.js"), "utf8"),
    ).toContain("a + b");
    await page.locator(".employee-task-panel").screenshot({
      path: path.resolve(
        __dirname,
        "../../../release/m9-tu01-real-provider-win32-x64.png",
      ),
    });
    await page.getByRole("button", { name: "验收通过" }).click();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
  }
});
