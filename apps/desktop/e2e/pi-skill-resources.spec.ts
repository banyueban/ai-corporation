import { createServer } from "node:http";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { _electron as electron } from "playwright";

const RESOURCE_SKILL = "presentation-template-production-assets";
const PRIVATE_INSTRUCTIONS = "M12-PRIVATE-FULL-INSTRUCTIONS";
const REFERENCE_CONTENT = "M12-REFERENCE-CONTENT";

test("user imports a script Skill and can select it for a new employee", async () => {
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-import-user-data-"),
  );
  const sourceParent = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-import-source-"),
  );
  writeManagedScriptFixture(sourceParent, "m12-runtime-manual");
  const sourceDirectory = path.join(sourceParent, "m12-runtime-manual");
  const app = await launchApplication(userDataDirectory);

  try {
    // 测试只替代系统文件夹选择窗口，确认导入、复制、刷新和员工表单都走真实产品链路。
    await app.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      });
    }, sourceDirectory);
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 700);
    });
    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("Skill 导入验收公司");
    await page.getByRole("button", { name: "新建公司" }).click();

    await page.getByRole("button", { name: "导入技能文件夹" }).click();
    const importConfirmation = page.getByRole("alert").filter({
      has: page.getByRole("heading", {
        name: "确认导入：m12-runtime-manual",
      }),
    });
    await expect(importConfirmation).toBeVisible();
    await expect(importConfirmation).toBeInViewport();
    await expect(importConfirmation).toBeFocused();
    await page.getByRole("button", { name: "确认导入" }).click();

    await expect(
      page.getByText(
        "技能“m12-runtime-manual”已导入，并已加入新员工的技能选择。",
      ),
    ).toBeVisible();
    await expect(
      page.getByRole("article").filter({
        has: page.getByRole("heading", { name: "m12-runtime-manual" }),
      }),
    ).toBeVisible();
    await expect(page.getByLabel(/m12-runtime-manual/u)).toBeVisible();
    await expect(page.getByLabel(/m12-runtime-manual/u)).toBeChecked();
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-skill-import-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });
  } finally {
    await app.close().catch(() => undefined);
    await removeTemporaryDirectory(userDataDirectory);
    await removeTemporaryDirectory(sourceParent);
  }
});

test("user sees why an invalid Skill folder was not imported", async () => {
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-invalid-import-user-data-"),
  );
  const sourceParent = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-invalid-import-source-"),
  );
  const sourceDirectory = path.join(sourceParent, "wrong-folder-name");
  mkdirSync(sourceDirectory, { recursive: true });
  writeFileSync(
    path.join(sourceDirectory, "SKILL.md"),
    "---\nname: expected-folder-name\ndescription: 验证错误提示必须出现在眼前。\n---\n",
    "utf8",
  );
  const app = await launchApplication(userDataDirectory);

  try {
    await app.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      });
    }, sourceDirectory);
    const page = await app.firstWindow();
    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.setSize(1024, 700);
    });
    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("无效 Skill 提示公司");
    await page.getByRole("button", { name: "新建公司" }).click();

    await page.getByRole("button", { name: "导入技能文件夹" }).click();
    const failure = page.getByText(
      "技能无法导入：文件夹名称“wrong-folder-name”必须与 SKILL.md 中的 name“expected-folder-name”一致。",
    );
    await expect(failure).toBeVisible();
    await expect(failure).toBeInViewport();
    await expect(failure).toBeFocused();
    await expect(
      page.getByRole("heading", { name: "expected-folder-name" }),
    ).toHaveCount(0);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-skill-import-error-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });
  } finally {
    await app.close().catch(() => undefined);
    await removeTemporaryDirectory(userDataDirectory);
    await removeTemporaryDirectory(sourceParent);
  }
});

test("employee automatically activates one of multiple Skills and copies its asset", async () => {
  test.setTimeout(60_000);
  const fixture = await startProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M12-TU-01-electron-user-data-"),
  );
  const taskWorkspace = mkdtempSync(
    path.join(tmpdir(), "M12-TU-01-workspace-with-a-long-display-path-"),
  );
  const managedSkillRoot = path.join(userDataDirectory, "pi-skills");
  writeManagedSkillFixture(managedSkillRoot);
  let app = await launchApplication(userDataDirectory, taskWorkspace);

  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("M12 验收 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M12-TU-01-e2e-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("模板成果公司");
    await page.getByRole("button", { name: "新建公司" }).click();
    const resourceCard = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: RESOURCE_SKILL }),
    });
    await expect(resourceCard).toBeVisible();
    await expect(resourceCard.getByText(/不会自动获得权限/u)).toBeVisible();

    await page.getByLabel(new RegExp(RESOURCE_SKILL, "u")).check();
    await page
      .getByLabel("员工姓名")
      .fill("负责模板交付与内容整理的多技能员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "M12 验收 Provider" });
    await page.getByLabel("模型").selectOption("pi-skill-fixture-model");
    await page.getByRole("button", { name: "创建员工" }).click();
    await expect(
      page.getByText(`技能：text-organize、${RESOURCE_SKILL}`),
    ).toBeVisible();

    // 编辑入口读取同一份员工资料，两项 Skill 都必须保持选中。
    const employeeCard = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "负责模板交付与内容整理的多技能员工",
      }),
    });
    await employeeCard.getByRole("button", { name: "编辑员工" }).click();
    await expect(page.getByLabel(/text-organize/u)).toBeChecked();
    await expect(
      page.getByLabel(new RegExp(RESOURCE_SKILL, "u")),
    ).toBeChecked();
    await page.getByRole("button", { name: "取消编辑" }).click();

    await page.getByRole("button", { name: "添加工作区" }).click();
    await page
      .getByLabel("任务内容")
      .fill(
        "请按模板技能的参考资料，把模板资源复制到工作区。不要启用无关技能。",
      );
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    await expect(page.getByText("template.bin", { exact: true })).toBeVisible();
    expect(readFileSync(path.join(taskWorkspace, "template.bin"))).toEqual(
      Buffer.from([0, 1, 2, 255]),
    );

    await page.getByText("查看完整模型和工具过程").click();
    for (const toolName of [
      "skill_activate",
      "skill_list_resources",
      "skill_read_resource",
      "skill_copy_asset",
    ]) {
      await expect(
        page.locator("pre").filter({ hasText: toolName }).first(),
      ).toBeVisible();
    }
    await expect(
      page.locator("pre").filter({ hasText: "AVAILABLE" }).first(),
    ).toBeVisible();

    const requests = fixture.requests();
    const firstRequest = JSON.stringify(requests[0]);
    const firstTools = (
      requests[0] as {
        readonly tools?: readonly {
          readonly function?: { readonly name?: string };
        }[];
      }
    ).tools?.map((tool) => tool.function?.name);
    expect(firstRequest).toContain("text-organize");
    expect(firstRequest).toContain(RESOURCE_SKILL);
    expect(firstRequest).not.toContain(PRIVATE_INSTRUCTIONS);
    expect(firstRequest).not.toContain(REFERENCE_CONTENT);
    expect(firstTools).not.toContain("workspace_run_command");
    expect(JSON.stringify(requests.slice(1))).toContain(PRIVATE_INSTRUCTIONS);
    expect(JSON.stringify(requests.slice(2))).toContain(REFERENCE_CONTENT);
    expect(JSON.stringify(requests)).not.toContain(managedSkillRoot);

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(1);
    });
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu01-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.webContents.setZoomFactor(2);
    });
    const zoomedDeliverable = page.locator(".pi-delivery-file").filter({
      hasText: "template.bin",
    });
    await zoomedDeliverable.scrollIntoViewIfNeeded();
    await expect(zoomedDeliverable).toBeInViewport();
    await page.bringToFront();
    await waitForPaint(page);
    await page.waitForTimeout(500);
    await expectPageHasNoHorizontalOverflow(page);
    await captureElectronViewport(
      app,
      path.resolve(
        __dirname,
        "../../../release",
        `m12-tu01-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    );

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu01-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });

    await page.getByRole("button", { name: "验收通过" }).click();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();
    const callsBeforeRestart = fixture.requests().length;
    await app.close();
    app = await launchApplication(userDataDirectory);
    page = await app.firstWindow();
    await page.getByRole("button", { name: "员工", exact: true }).click();
    await expect(
      page.getByText(`技能：text-organize、${RESOURCE_SKILL}`),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "已完成" })).toBeVisible();
    expect(fixture.requests()).toHaveLength(callsBeforeRestart);

    // 同一员工加入第二家公司时仍使用同一组 Skill，第一家任务不会串过来。
    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("第二模板公司");
    await page.getByRole("button", { name: "新建公司" }).click();
    const reusedEmployee = page.getByRole("article").filter({
      has: page.getByRole("heading", {
        name: "负责模板交付与内容整理的多技能员工",
      }),
    });
    await expect(
      reusedEmployee.getByText(`技能：text-organize、${RESOURCE_SKILL}`),
    ).toBeVisible();
    await reusedEmployee.getByRole("button", { name: "加入当前公司" }).click();
    await expect(
      page.getByRole("heading", { name: "本公司的任务记录" }),
    ).toHaveCount(0);
  } finally {
    await app.close().catch(() => undefined);
    await fixture.close();
    await removeTemporaryDirectory(userDataDirectory);
    await removeTemporaryDirectory(taskWorkspace);
  }
});

test("employee installs a private Python, runs standard Skill scripts, and reuses the environment", async () => {
  test.setTimeout(240_000);
  const fixture = await startScriptProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-electron-user-data-"),
  );
  const taskWorkspace = mkdtempSync(
    path.join(tmpdir(), "M12-TU-02-script-workspace-"),
  );
  const managedSkillRoot = path.join(userDataDirectory, "pi-skills");
  writeManagedScriptFixture(managedSkillRoot);
  const app = await launchApplication(userDataDirectory, taskWorkspace);

  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("M12 脚本 Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M12-TU-02-e2e-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("标准脚本公司");
    await page.getByRole("button", { name: "新建公司" }).click();
    await page.getByLabel(/script-runtime-fixture/u).check();
    await page.getByLabel("员工姓名").fill("标准脚本员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "M12 脚本 Provider" });
    await page.getByLabel("模型").selectOption("pi-script-fixture-model");
    await page.getByRole("button", { name: "创建员工" }).click();
    await page.getByRole("button", { name: "添加工作区" }).click();

    await page
      .getByLabel("任务内容")
      .fill("运行 Skill 的 JavaScript 脚本并生成 js-result.txt");
    await page.getByRole("button", { name: "开始任务" }).click();
    const javaScriptEnvironmentHeading = page.getByRole("heading", {
      name: "准备“script-runtime-fixture”的独立环境",
    });
    await expect(javaScriptEnvironmentHeading).toBeVisible();
    const javaScriptEnvironmentCard = page
      .locator("section.provider-disclosure")
      .filter({ has: javaScriptEnvironmentHeading });
    await expect(
      javaScriptEnvironmentCard.getByText(/npm registry/u),
    ).toBeVisible();
    await javaScriptEnvironmentCard
      .getByRole("button", { name: "自动安装" })
      .click();
    // CI 首次安装 npm 依赖会受下载速度影响；给真实安装留出时间，但超过一分钟仍失败。
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    expect(
      readFileSync(path.join(taskWorkspace, "js-result.txt"), "utf8"),
    ).toBe("JS:标准脚本参考资料");

    await page
      .getByLabel("任务内容")
      .fill("运行 Skill 的 Python 脚本并生成 py-result.txt");
    await page.getByRole("button", { name: "开始任务" }).click();
    const environmentHeading = page.getByRole("heading", {
      name: "准备“script-runtime-fixture”的独立环境",
    });
    await expect(environmentHeading).toBeVisible();
    const environmentCard = page
      .locator("section.provider-disclosure")
      .filter({ has: environmentHeading });
    await expect(environmentCard.getByText(/固定 uv/u)).toBeVisible();
    await expect(environmentCard.getByText(/不修改系统 PATH/u)).toBeVisible();
    await expect(environmentCard.getByText(/第三方代码/u)).toBeVisible();

    // 安装卡必须能完全用键盘操作。先用 Enter 选择暂不安装，并确认脚本
    // 没有偷偷运行；随后重新发起同一任务，再用键盘批准安装。
    const deferInstallButton = environmentCard.getByRole("button", {
      name: "暂不安装",
    });
    await deferInstallButton.focus();
    await expect(deferInstallButton).toBeFocused();
    await deferInstallButton.press("Enter");
    await expect(page.getByRole("heading", { name: "失败" })).toBeVisible();
    expect(() =>
      readFileSync(path.join(taskWorkspace, "py-result.txt"), "utf8"),
    ).toThrow();

    await page
      .getByLabel("任务内容")
      .fill("重新运行 Skill 的 Python 脚本并生成 py-result.txt");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(environmentHeading).toBeVisible();

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(1);
    });
    await environmentHeading.scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-environment-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.webContents.setZoomFactor(2);
    });
    await environmentHeading.scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await captureElectronViewport(
      app,
      path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-environment-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    );
    const automaticInstallButton = environmentCard.getByRole("button", {
      name: "自动安装",
    });
    await automaticInstallButton.scrollIntoViewIfNeeded();
    await expect(automaticInstallButton).toBeInViewport();
    await captureElectronViewport(
      app,
      path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-environment-actions-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    );
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await environmentHeading.scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await page.screenshot({
      animations: "disabled",
      path: path.resolve(
        __dirname,
        "../../../release",
        `m12-tu02-environment-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });

    await automaticInstallButton.focus();
    await expect(automaticInstallButton).toBeFocused();
    await automaticInstallButton.press("Enter");
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible({ timeout: 180_000 });
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    expect(
      readFileSync(path.join(taskWorkspace, "py-result.txt"), "utf8"),
    ).toBe("PY:标准脚本参考资料");
    await page.getByText("查看完整模型和工具过程").click();
    await expect(
      page.locator("pre").filter({ hasText: "skill_run_script" }).first(),
    ).toBeVisible();
    await expect(
      page.locator("code").filter({ hasText: "uv venv" }),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      userDataDirectory,
    );

    // 第二次运行同一 Python Skill 只重新询问本任务执行权，不重复安装环境。
    await page
      .getByLabel("任务内容")
      .fill("再次运行 Python 脚本并生成 py-result-reused.txt");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible();
    await expect(environmentHeading).toHaveCount(0);
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    expect(
      readFileSync(path.join(taskWorkspace, "py-result-reused.txt"), "utf8"),
    ).toBe("PY:标准脚本参考资料");
    await expect(page.locator(".pi-delivery-check")).toHaveCount(1);

    const nativeOutput =
      process.platform === "win32" ? "native-windows.txt" : "native-macos.txt";
    await page
      .getByLabel("任务内容")
      .fill(`运行当前系统原生脚本并生成 ${nativeOutput}`);
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(
      page.getByRole("heading", { name: "等待你验收" }),
    ).toBeVisible();
    expect(readFileSync(path.join(taskWorkspace, nativeOutput), "utf8")).toBe(
      process.platform === "win32" ? "NATIVE-WINDOWS" : "NATIVE-MACOS",
    );

    const firstTools = (
      fixture.requests()[0] as {
        readonly tools?: readonly {
          readonly function?: { readonly name?: string };
        }[];
      }
    ).tools?.map((tool) => tool.function?.name);
    expect(firstTools).toEqual(
      expect.arrayContaining(["environment_prepare", "skill_run_script"]),
    );
  } finally {
    await app.close().catch(() => undefined);
    await fixture.close();
    await removeTemporaryDirectory(userDataDirectory);
    await removeTemporaryDirectory(taskWorkspace);
  }
});

test("user imports the pinned public GIF Skill and previews a real animation", async () => {
  // The public wheels are fetched from the real package index. Keep this one
  // network acceptance aligned with the product's ten-minute install limit.
  test.setTimeout(900_000);
  const fixture = await startPublicGifProviderFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M13-TU-01-electron-user-data-"),
  );
  const taskWorkspace = mkdtempSync(
    path.join(tmpdir(), "M13-TU-01-gif-workspace-"),
  );
  const publicSkillDirectory = path.resolve(
    __dirname,
    "../test-fixtures/public-skills/slack-gif-creator",
  );
  const app = await launchApplication(userDataDirectory, taskWorkspace);

  try {
    await app.evaluate(({ dialog }, selectedDirectory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [selectedDirectory],
      });
    }, publicSkillDirectory);
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("M13 公开 GIF Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill("M13-TU-01-e2e-fake-key");
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();

    await page.getByRole("button", { name: "控制台" }).click();
    await page.getByLabel("公司名称").fill("真实公开 GIF Skill 公司");
    await page.getByRole("button", { name: "新建公司" }).click();
    await page.getByRole("button", { name: "导入技能文件夹" }).click();
    await expect(
      page.getByRole("heading", { name: "确认导入：slack-gif-creator" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "确认导入" }).click();
    await expect(page.getByLabel(/slack-gif-creator/u)).toBeVisible();
    await page.getByLabel(/coding-task/u).check();
    await page.getByLabel(/slack-gif-creator/u).check();
    await page.getByLabel(/text-organize/u).uncheck();
    await page.getByLabel("员工姓名").fill("公开 GIF 制作员工");
    await page
      .getByLabel("Provider")
      .selectOption({ label: "M13 公开 GIF Provider" });
    await page.getByLabel("模型").selectOption("pi-public-gif-model");
    await page.getByRole("button", { name: "创建员工" }).click();
    await page.getByRole("button", { name: "添加工作区" }).click();

    await page
      .getByLabel("任务内容")
      .fill("使用公开 GIF Skill 制作一个 128×128 的彩色圆点移动动画。");
    await page.getByRole("button", { name: "开始任务" }).click();
    const environmentHeading = page.getByRole("heading", {
      name: "准备“slack-gif-creator”的独立环境",
    });
    await expect(environmentHeading).toBeVisible();
    const environmentCard = page
      .locator("section.provider-disclosure")
      .filter({ has: environmentHeading });
    for (const dependency of [
      "pillow>=10.0.0",
      "imageio>=2.31.0",
      "imageio-ffmpeg>=0.4.9",
      "numpy>=1.24.0",
    ]) {
      await expect(
        environmentCard.getByText(`Python：${dependency}`, { exact: true }),
      ).toBeVisible();
    }
    await environmentCard.getByRole("button", { name: "自动安装" }).click();
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible({ timeout: 600_000 });
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 90_000 },
    );

    const output = path.join(taskWorkspace, "public-skill-animation.gif");
    const bytes = readFileSync(output);
    expect(bytes.subarray(0, 6).toString("ascii")).toMatch(/^GIF8[79]a$/u);
    const gifCard = page.locator("article.pi-delivery-file").filter({
      has: page.getByText("public-skill-animation.gif", { exact: true }),
    });
    await gifCard.getByRole("button", { name: "查看内容" }).click();
    const preview = page.getByRole("img", {
      name: "public-skill-animation.gif 动画预览",
    });
    await expect(preview).toBeVisible();
    await expect(preview).toHaveJSProperty("naturalWidth", 128);
    await expect(preview).toHaveJSProperty("naturalHeight", 128);
    expect(await preview.getAttribute("src")).toMatch(
      /^data:image\/gif;base64,/u,
    );
    await page.getByText("查看完整模型和工具过程").click();
    await expect(
      page
        .locator("pre")
        .filter({ hasText: "skill_run_workspace_script" })
        .first(),
    ).toBeVisible();
    await expect(
      page.locator("pre").filter({ hasText: "VALIDATED:12" }).first(),
    ).toBeVisible();
    expect(await page.locator("body").innerText()).not.toContain(
      userDataDirectory,
    );
    // GIF 预览是本任务新增的真实界面，不能只复用旧页面的布局证据。
    // 三种窗口状态都直接检查横向溢出和成果操作是否仍然可达。
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(1);
    });
    await gifCard.scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await expect(
      gifCard.getByRole("button", { name: "查看所在位置" }),
    ).toBeInViewport();
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m13-public-gif-preview-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });

    await app.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    // 200% 时一张成果卡会高于可视区，直接滚到动画本身才是在验证用户
    // 能否真正看到内容，而不是要求整张卡一次全部塞进窗口。
    await preview.evaluate((element) =>
      element.scrollIntoView({ block: "center", inline: "nearest" }),
    );
    await page.bringToFront();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await expect(preview).toBeInViewport();
    // Playwright 在 Windows 200% 缩放时可能返回黑图；应用窗口自身截图
    // 可以保留真实画面，且上面的可视区断言仍独立验证动画可达。
    await captureElectronViewport(
      app,
      path.resolve(
        __dirname,
        "../../../release",
        `m13-public-gif-preview-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    );
    const zoomedRevealButton = gifCard.getByRole("button", {
      name: "查看所在位置",
    });
    await zoomedRevealButton.scrollIntoViewIfNeeded();
    await expect(zoomedRevealButton).toBeInViewport();

    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await gifCard.scrollIntoViewIfNeeded();
    await waitForPaint(page);
    await expectPageHasNoHorizontalOverflow(page);
    await expect(preview).toBeInViewport();
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m13-public-gif-preview-${process.env.AI_CORPORATION_PACKAGED_EXE === undefined ? "dev" : "packaged"}-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });

    // The same Skill dependencies must be reused on the next task. Only this
    // task's execution approval is requested; no random upgrade is started.
    await page
      .getByLabel("任务内容")
      .fill("再次使用同一公开 GIF Skill 生成第二个动画。");
    await page.getByRole("button", { name: "开始任务" }).click();
    await expect(
      page.getByRole("heading", { name: "是否允许本任务运行程序？" }),
    ).toBeVisible();
    await expect(environmentHeading).toHaveCount(0);
    await page.getByRole("button", { name: "允许本任务运行程序" }).click();
    await expect(page.getByRole("heading", { name: "等待你验收" })).toBeVisible(
      { timeout: 90_000 },
    );
    expect(
      readFileSync(path.join(taskWorkspace, "public-skill-animation-2.gif"))
        .subarray(0, 6)
        .toString("ascii"),
    ).toMatch(/^GIF8[79]a$/u);
    const firstTools = (
      fixture.requests()[0] as {
        readonly tools?: readonly {
          readonly function?: { readonly name?: string };
        }[];
      }
    ).tools?.map((tool) => tool.function?.name);
    expect(firstTools).toEqual(
      expect.arrayContaining([
        "workspace_write_text",
        "skill_run_workspace_script",
      ]),
    );
  } finally {
    await app.close().catch(() => undefined);
    await fixture.close();
    await removeTemporaryDirectory(userDataDirectory);
    await removeTemporaryDirectory(taskWorkspace);
  }
});

async function startPublicGifProviderFixture() {
  const requests: unknown[] = [];
  const calls = [
    {
      name: "skill_activate",
      arguments: { skillName: "slack-gif-creator" },
    },
    {
      name: "workspace_write_text",
      arguments: {
        relativePath: "make-public-animation.py",
        content: publicGifScript("public-skill-animation.gif"),
      },
    },
    {
      name: "skill_run_workspace_script",
      arguments: {
        skillName: "slack-gif-creator",
        scriptRelativePath: "make-public-animation.py",
        args: [],
        expectedOutputs: ["public-skill-animation.gif"],
        timeoutSeconds: 120,
      },
    },
    undefined,
    {
      name: "skill_activate",
      arguments: { skillName: "slack-gif-creator" },
    },
    {
      name: "workspace_write_text",
      arguments: {
        relativePath: "make-public-animation-2.py",
        content: publicGifScript("public-skill-animation-2.gif"),
      },
    },
    {
      name: "skill_run_workspace_script",
      arguments: {
        skillName: "slack-gif-creator",
        scriptRelativePath: "make-public-animation-2.py",
        args: [],
        expectedOutputs: ["public-skill-animation-2.gif"],
        timeoutSeconds: 120,
      },
    },
    undefined,
  ] as const;
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "pi-public-gif-model" }] }));
      return;
    }
    if (request.url !== "/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "not_found" } }));
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      const call = calls[requests.length - 1];
      if (call !== undefined) {
        sendChunk(response, {
          model: "pi-public-gif-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-m13-${requests.length}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.arguments),
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          model: "pi-public-gif-model",
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        });
      } else {
        sendChunk(response, {
          model: "pi-public-gif-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content:
                  "公开 GIF Skill 已生成并验证真实动画，请在成果区验收。",
              },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          model: "pi-public-gif-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await listenOnSafePort(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M13-TU-01 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests: () => [...requests],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function publicGifScript(output: string): string {
  return readFileSync(
    path.resolve(__dirname, "../test-fixtures/public-gif-workspace-script.py"),
    "utf8",
  ).replaceAll("public-skill-animation.gif", output);
}

function writeManagedScriptFixture(
  managedRoot: string,
  skillName = "script-runtime-fixture",
): void {
  const skillRoot = path.join(managedRoot, skillName);
  mkdirSync(path.join(skillRoot, "references"), { recursive: true });
  mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    `---
name: ${skillName}
description: 需要运行标准 JavaScript、Python 或当前系统原生脚本并生成工作区文件时使用。
---
先选择与用户任务匹配的 scripts/ 脚本，再把工作区逻辑路径作为独立参数传入。
`,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "references", "input.txt"),
    "标准脚本参考资料",
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "package.json"),
    '{"dependencies":{"kleur":"4.1.5"}}',
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "scripts", "create.cjs"),
    `const fs = require("node:fs");
const path = require("node:path");
require("kleur");
const reference = fs.readFileSync(path.join("references", "input.txt"), "utf8");
fs.writeFileSync(process.argv[2], ` +
      "`JS:${reference}`" +
      `, "utf8");
console.log("JavaScript Skill result created");
`,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "scripts", "create.py"),
    `from pathlib import Path
import sys
reference = Path("references/input.txt").read_text(encoding="utf-8")
Path(sys.argv[1]).write_text(f"PY:{reference}", encoding="utf-8")
print("Python Skill result created")
`,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "scripts", "native.ps1"),
    `$ErrorActionPreference = "Stop"
Set-Content -LiteralPath $args[0] -Value "NATIVE-WINDOWS" -Encoding Ascii -NoNewline
Write-Output "Windows Skill result created"
`,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "scripts", "native.sh"),
    `#!/bin/sh
printf 'NATIVE-MACOS' > "$1"
printf 'macOS Skill result created\\n'
`,
    "utf8",
  );
}

async function startScriptProviderFixture() {
  const requests: unknown[] = [];
  const nativePath =
    process.platform === "win32" ? "scripts/native.ps1" : "scripts/native.sh";
  const nativeOutput =
    process.platform === "win32" ? "native-windows.txt" : "native-macos.txt";
  const calls = [
    {
      name: "skill_activate",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_list_resources",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_run_script",
      arguments: {
        skillName: "script-runtime-fixture",
        scriptRelativePath: "scripts/create.cjs",
        args: ["{{workspace}}/js-result.txt"],
        expectedOutputs: ["js-result.txt"],
      },
    },
    undefined,
    {
      name: "skill_activate",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_run_script",
      arguments: {
        skillName: "script-runtime-fixture",
        scriptRelativePath: "scripts/create.py",
        args: ["{{workspace}}/py-result.txt"],
        expectedOutputs: ["py-result.txt"],
      },
    },
    undefined,
    {
      name: "skill_activate",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_run_script",
      arguments: {
        skillName: "script-runtime-fixture",
        scriptRelativePath: "scripts/create.py",
        args: ["{{workspace}}/py-result.txt"],
        expectedOutputs: ["py-result.txt"],
      },
    },
    undefined,
    {
      name: "skill_activate",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_run_script",
      arguments: {
        skillName: "script-runtime-fixture",
        scriptRelativePath: "scripts/create.py",
        args: ["{{workspace}}/py-result-reused.txt"],
        expectedOutputs: ["py-result-reused.txt"],
      },
    },
    undefined,
    {
      name: "skill_activate",
      arguments: { skillName: "script-runtime-fixture" },
    },
    {
      name: "skill_run_script",
      arguments: {
        skillName: "script-runtime-fixture",
        scriptRelativePath: nativePath,
        args: [`{{workspace}}/${nativeOutput}`],
        expectedOutputs: [nativeOutput],
      },
    },
    undefined,
  ] as const;
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ data: [{ id: "pi-script-fixture-model" }] }),
      );
      return;
    }
    if (request.url !== "/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "not_found" } }));
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      const call = calls[requests.length - 1];
      if (call !== undefined) {
        sendChunk(response, {
          model: "pi-script-fixture-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-m12-tu02-${requests.length}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.arguments),
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          model: "pi-script-fixture-model",
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        });
      } else {
        sendChunk(response, {
          model: "pi-script-fixture-model",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                content: "标准 Skill 脚本已真实运行并生成文件，请验收。",
              },
              finish_reason: null,
            },
          ],
        });
        sendChunk(response, {
          model: "pi-script-fixture-model",
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        });
      }
      response.end("data: [DONE]\n\n");
    });
  });
  await listenOnSafePort(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M12-TU-02 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests: () => [...requests],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

function writeManagedSkillFixture(managedRoot: string): void {
  const skillRoot = path.join(managedRoot, RESOURCE_SKILL);
  mkdirSync(path.join(skillRoot, "references"), { recursive: true });
  mkdirSync(path.join(skillRoot, "assets"), { recursive: true });
  mkdirSync(path.join(skillRoot, "scripts"), { recursive: true });
  writeFileSync(
    path.join(skillRoot, "SKILL.md"),
    `---
name: ${RESOURCE_SKILL}
description: 在用户要求使用演示文稿模板资源并核对模板说明时启用，不用于普通文字整理。
license: Apache-2.0
compatibility: Requires a writable task workspace
metadata:
  author: ai-corporation-fixture
allowed-tools: Bash(*) Read
---
${PRIVATE_INSTRUCTIONS}
先读取参考资料，再复制指定资源。
`,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "references", "guide.md"),
    REFERENCE_CONTENT,
    "utf8",
  );
  writeFileSync(
    path.join(skillRoot, "assets", "template.bin"),
    Buffer.from([0, 1, 2, 255]),
  );
  writeFileSync(
    path.join(skillRoot, "scripts", "prepare.js"),
    "console.log('not runnable in M12-TU-01');\n",
    "utf8",
  );
}

async function startProviderFixture() {
  const requests: unknown[] = [];
  const calls = [
    {
      name: "skill_activate",
      arguments: { skillName: RESOURCE_SKILL },
    },
    {
      name: "skill_list_resources",
      arguments: { skillName: RESOURCE_SKILL },
    },
    {
      name: "skill_read_resource",
      arguments: {
        skillName: RESOURCE_SKILL,
        relativePath: "references/guide.md",
      },
    },
    {
      name: "skill_copy_asset",
      arguments: {
        skillName: RESOURCE_SKILL,
        relativePath: "assets/template.bin",
        targetRelativePath: "template.bin",
      },
    },
  ] as const;
  const server = createServer((request, response) => {
    if (request.url === "/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({ data: [{ id: "pi-skill-fixture-model" }] }),
      );
      return;
    }
    if (request.url !== "/chat/completions") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "not_found" } }));
      return;
    }
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      requests.push(body);
      response.writeHead(200, { "content-type": "text/event-stream" });
      const call = calls[requests.length - 1];
      if (call !== undefined) {
        sendChunk(response, {
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: `call-m12-${requests.length}`,
                    type: "function",
                    function: {
                      name: call.name,
                      arguments: JSON.stringify(call.arguments),
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
              delta: {
                role: "assistant",
                content: "已按参考资料复制模板资源，请验收 template.bin。",
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
  await listenOnSafePort(server);
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("M12-TU-01 fixture did not expose a TCP port");
  }
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    requests: () => [...requests],
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) =>
          error === undefined ? resolve() : reject(error),
        );
      }),
  };
}

async function listenOnSafePort(
  server: import("node:http").Server,
): Promise<void> {
  // 浏览器会固定拒绝少数传统服务端口；使用高位随机端口，避免系统恰好
  // 分配到 2049 一类“服务明明启动、模型连接却被浏览器拦下”的假失败。
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const port = 41_000 + Math.floor(Math.random() * 19_000);
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error) => {
          server.off("listening", onListening);
          reject(error);
        };
        const onListening = () => {
          server.off("error", onError);
          resolve();
        };
        server.once("error", onError);
        server.once("listening", onListening);
        server.listen(port, "127.0.0.1");
      });
      return;
    } catch (error) {
      if (
        typeof error !== "object" ||
        error === null ||
        !("code" in error) ||
        !["EADDRINUSE", "EACCES"].includes(String(error.code))
      ) {
        throw error;
      }
    }
  }
  throw new Error("M12-TU-01 fixture could not reserve a safe TCP port");
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
): void {
  response.write(
    `data: ${JSON.stringify({
      id: "chatcmpl-m12-fixture",
      object: "chat.completion.chunk",
      created: 1,
      model: "pi-skill-fixture-model",
      ...payload,
    })}\n\n`,
  );
}

async function expectPageHasNoHorizontalOverflow(
  page: import("@playwright/test").Page,
): Promise<void> {
  const layout = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth:
      window.visualViewport?.width ?? document.documentElement.clientWidth,
  }));
  // Electron 的缩放会产生不到 1 个 CSS 像素的小数舍入，这不是真实滚动溢出。
  if (layout.documentWidth - layout.viewportWidth > 1) {
    throw new Error(`多技能页面横向溢出：${JSON.stringify(layout)}`);
  }
}

async function captureElectronViewport(
  app: import("playwright").ElectronApplication,
  destination: string,
): Promise<void> {
  // Playwright 在 Electron 200% 缩放后偶尔只返回背景色，直接让当前真实
  // BrowserWindow 抓取可见内容，避免生成一张看似成功的空白验收图。
  const base64 = await app.evaluate(async ({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows()[0];
    if (window === undefined) throw new Error("M12 window is missing");
    const image = await window.webContents.capturePage();
    return image.toPNG().toString("base64");
  });
  writeFileSync(destination, Buffer.from(base64, "base64"));
}

async function waitForPaint(page: import("@playwright/test").Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
}

async function removeTemporaryDirectory(directory: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      rmSync(directory, { force: true, recursive: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw lastError;
}
