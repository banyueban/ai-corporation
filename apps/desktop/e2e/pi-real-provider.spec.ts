import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

test("saved real Provider completes one Pi employee task", async () => {
  test.skip(
    process.env.AI_CORPORATION_REAL_PROVIDER !== "1",
    "只在明确发起本机真实 Provider 验收时运行",
  );
  test.setTimeout(180_000);
  const userDataDirectory = process.env.AI_CORPORATION_REAL_USER_DATA;
  if (userDataDirectory === undefined) {
    throw new Error("AI_CORPORATION_REAL_USER_DATA is required");
  }
  const app = await electron.launch({
    args: [
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
      path.resolve(__dirname, ".."),
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: { ...process.env, AI_CORPORATION_E2E: "1", CI: "true" },
  });

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "员工" }).click();
    if (
      (await page
        .getByRole("heading", { name: "真实模型验收员工", exact: true })
        .count()) === 0
    ) {
      await page.getByLabel("员工姓名").fill("真实模型验收员工");
      await page.getByLabel("Provider").selectOption({ label: "deepseek" });
      await page.getByLabel("模型").selectOption("deepseek-v4-flash");
      await page.getByRole("button", { name: "创建员工" }).click();
      await expect(
        page.getByText("员工“真实模型验收员工”已创建，可以接收任务。"),
      ).toBeVisible();
    }
    await page
      .getByLabel("员工", { exact: true })
      .selectOption({ label: "真实模型验收员工 · deepseek-v4-flash" });
    await page
      .getByLabel("任务内容")
      .fill("请用一句中文说明 Pi 真实模型连接成功，并按要求完成文本检查。 ");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 120_000 },
    );
    await page.getByText("查看完整模型和工具过程").click();
    await expect(page.getByText("模型原始输出").first()).toBeVisible();
    await expect(page.getByText("工具开始")).toBeVisible();
    await expect(page.getByText("工具结果")).toBeVisible();
    await expect(page.locator(".pi-task")).not.toContainText("Authorization");
    await page.getByRole("button", { name: "验收通过" }).click();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
  }
});
