import { createServer, type ServerResponse } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";
import type { DesktopApi } from "../src/shared/desktop-api";

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
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(2);
    });
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("Goal Fixture Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page.getByLabel("API Key").fill(secret);
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();
    await page
      .getByRole("combobox", { name: /^模型/u })
      .selectOption("goal-model");
    await page.getByRole("button", { name: "保存修改" }).click();

    await page.getByRole("button", { name: "控制台", exact: true }).click();
    await page.getByRole("button", { name: "选择工作区" }).click();
    await page.getByRole("button", { name: /选择文件夹/u }).click();
    await page.getByLabel("公司名称 *").fill("Generated Corporation");
    await page.getByLabel("目标 *").fill("Launch a safe pilot");
    await page
      .getByLabel(/已验证的模型服务商和准确模型/u)
      .selectOption({ label: "Goal Fixture Provider · goal-model" });
    fixture.enqueue(goalOutput([]));
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeFocused();
    await expect(
      page.getByText("版本 1 · 草稿 · 模型服务商生成"),
    ).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: /用量：输入 12 \/ 输出 8/u }),
    ).toBeVisible();
    expect(fixture.generationRequests()[0]?.body).toMatchObject({
      max_tokens: 65_536,
      response_format: { type: "json_object" },
      stream: false,
    });
    await expectNoSeriousAxeViolations(page);
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m2-tu05-dev-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });

    await page.getByRole("button", { name: "控制台", exact: true }).click();
    await page.getByRole("button", { name: "新建公司" }).click();
    await page.getByLabel("公司名称 *").fill("Cancelled Corporation");
    await page.getByLabel("目标 *").fill("Cancel this analysis");
    await page
      .getByLabel(/已验证的模型服务商和准确模型/u)
      .selectOption({ label: "Goal Fixture Provider · goal-model" });
    fixture.delayNext();
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click({ noWaitAfter: true });
    await expect(page.getByText("生成中", { exact: true })).toBeVisible();
    await expect.poll(fixture.generationCalls).toBe(2);
    await page.getByRole("button", { name: "取消分析" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();
    await expect(page.getByText(/没有保存目标/u)).toBeVisible();

    await openNewGoal(
      page,
      "Version Conflict Corporation",
      "Reject stale clarification facts",
    );
    fixture.enqueue(goalOutput(["Confirm the current Corporation version"]));
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    await expect(page.getByText("需要补充说明", { exact: true })).toBeVisible();
    const updateResult = await page.evaluate(async () => {
      const desktop = (window as unknown as { desktop: DesktopApi }).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok) return workspaces;
      const listed = await desktop.corporation.list({
        schemaVersion: "1.0",
        workspaceId: workspaces.value[0]?.workspaceId ?? "",
      });
      if (!listed.ok) return listed;
      const corporation = listed.value.find(
        ({ name }) => name === "Version Conflict Corporation",
      );
      if (corporation === undefined) throw new Error("Corporation not found");
      return desktop.corporation.updateName({
        schemaVersion: "1.0",
        commandId: "019fa9bb-6000-7d90-a4e3-a5b0eea2a9ef",
        corporationId: corporation.id,
        expectedVersion: corporation.version,
        name: "Version Conflict Corporation Updated",
      });
    });
    expect(updateResult.ok).toBe(true);
    await page
      .locator(".clarification-list textarea")
      .fill("Use the current Corporation facts only");
    await page.getByRole("button", { name: "提交全部答案" }).click();
    await expect(
      page.getByText(/分析依据已经变化，请重新加载后再试/u),
    ).toBeVisible();

    await openNewGoal(page, "Repair Corporation", "Repair one invalid output");
    fixture.enqueue("not valid json");
    fixture.enqueue(goalOutput([]));
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeVisible();

    await openNewGoal(page, "Repair Failure Corporation", "Reject bad output");
    fixture.enqueue("not valid json");
    fixture.enqueue("still not valid json");
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    await expect(page.getByText("失败", { exact: true })).toBeVisible();
    await expect(page.getByText(/没有保存目标/u)).toBeVisible();

    await openNewGoal(page, "Extended Corporation", "Clarify until the limit");
    for (let index = 0; index <= 10; index += 1) {
      fixture.enqueue(goalOutput([`Extension question ${index}`]));
    }
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    for (let round = 0; round < 5; round += 1) {
      await page
        .locator(".clarification-list textarea")
        .fill(`Answer ${round}`);
      await page.getByRole("button", { name: "提交全部答案" }).click();
    }
    await expect(
      page.getByText("需要决定是否继续", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText(/不会继续调用模型服务商/u)).toBeVisible();
    await page.getByRole("button", { name: "再继续 5 轮" }).click();
    await expect(page.getByText(/第 2 个周期/u)).toBeVisible();
    for (let round = 0; round < 5; round += 1) {
      await page
        .locator(".clarification-list textarea")
        .fill(`Extended answer ${round}`);
      await page.getByRole("button", { name: "提交全部答案" }).click();
    }
    await expect(
      page.getByText("需要决定是否继续", { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(/第 2 个周期 · 已完成补充说明 5\/5 轮/u),
    ).toBeVisible();
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m2-tu05-dev-${process.platform}-${process.arch}-1440x900-cycle-2.png`,
      ),
    });
    await page.getByRole("button", { name: "取消" }).click();
    await expect(page.getByText("已取消", { exact: true })).toBeVisible();

    await openNewGoal(
      page,
      "Assumption Corporation",
      "Save unresolved assumptions",
    );
    for (let index = 0; index <= 5; index += 1) {
      fixture.enqueue(goalOutput([`Unconfirmed question ${index}`]));
    }
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click();
    for (let round = 0; round < 5; round += 1) {
      await page
        .locator(".clarification-list textarea")
        .fill(`Known answer ${round}`);
      await page.getByRole("button", { name: "提交全部答案" }).click();
    }
    await page
      .getByRole("button", { name: "保存含未确认高影响假设的草稿" })
      .click();
    await expect(
      page.getByRole("checkbox", { name: /Unconfirmed question 5/u }),
    ).not.toBeChecked();
    await page
      .getByRole("checkbox", { name: /Unconfirmed question 5/u })
      .check();
    await page.getByRole("button", { name: "确认目标合同" }).click();
    await expect(page.getByText("已批准", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "开始规划设置" }).click();
    await expect(
      page.getByRole("heading", { name: "生成计划草稿" }),
    ).toBeFocused();
    await expect(page.getByText(/不会发送：工作区路径/u)).toBeVisible();
    await page
      .getByLabel("已验证的模型服务商 / 模型")
      .selectOption({ label: "Goal Fixture Provider · goal-model" });
    fixture.enqueue(plannerOutput());
    await page.getByRole("button", { name: "生成尚未验证的草稿" }).click();
    await expect(
      page.getByRole("heading", { name: "尚未验证的计划草稿" }),
    ).toBeVisible();
    await expect(page.getByText(/草稿 · 等待验证/u)).toBeVisible();
    await expect(page.getByText(/建议角色：/u)).toContainText(
      "Writer · 尚未安排人员",
    );
    await expect(page.getByText(/目前不能执行/u)).toBeVisible();
    const plannerRequest = fixture.generationRequests().at(-1)?.body;
    expect(plannerRequest).toMatchObject({
      max_tokens: 65_536,
      response_format: { type: "json_object" },
      stream: false,
    });
    expect(JSON.stringify(plannerRequest)).not.toContain(workspaceDirectory);
    expect(JSON.stringify(plannerRequest)).not.toContain(secret);
    await expectNoSeriousAxeViolations(page);
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1024, 700);
      window?.webContents.setZoomFactor(2);
    });
    await expect(page.getByText(/尚未验证的计划草稿/u)).toBeVisible();
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m2-tu06-dev-${process.platform}-${process.arch}-1024x700-200-percent.png`,
      ),
    });
    await app.evaluate(({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      window?.setSize(1440, 900);
      window?.webContents.setZoomFactor(1);
    });
    await page.screenshot({
      path: path.resolve(
        __dirname,
        "../../../release",
        `m2-tu06-dev-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });
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

test("user sees an interrupted Goal operation after process restart without replay", async () => {
  const fixture = await startGoalFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-05-restart-user-data-"),
  );
  const workspaceDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-05-restart-workspace-"),
  );
  let app = await launchGoalApplication(userDataDirectory, workspaceDirectory);
  try {
    let page = await app.firstWindow();
    await page.getByRole("button", { name: "设置" }).click();
    await page.getByLabel("名称").fill("Restart Goal Provider");
    await page.getByLabel("API 基础 URL").fill(fixture.endpoint);
    await page
      .getByLabel("API Key")
      .fill(`M2-TU-05-${crypto.randomUUID()}-restart-key`);
    await page.getByRole("button", { name: "保存模型服务商" }).click();
    await page.getByRole("button", { name: "测试连接" }).click();
    await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();
    await page
      .getByRole("combobox", { name: /^模型/u })
      .selectOption("goal-model");
    await page.getByRole("button", { name: "保存修改" }).click();
    await page.getByRole("button", { name: "控制台", exact: true }).click();
    await page.getByRole("button", { name: "选择工作区" }).click();
    await page.getByRole("button", { name: /选择文件夹/u }).click();
    await page.getByLabel("公司名称 *").fill("Interrupted Corporation");
    await page.getByLabel("目标 *").fill("Do not replay after restart");
    await page
      .getByLabel(/已验证的模型服务商和准确模型/u)
      .selectOption({ label: "Restart Goal Provider · goal-model" });
    fixture.delayNext();
    await page
      .getByRole("button", { name: "分析并创建模型服务商草稿" })
      .click({ noWaitAfter: true });
    await expect.poll(fixture.generationCalls).toBe(1);
    await expect.poll(fixture.hasDelayedResponse).toBe(true);

    const firstProcess = app.process();
    const exited = new Promise<void>((resolve) =>
      firstProcess.once("exit", () => resolve()),
    );
    await app.evaluate(({ app: electronApp }) => {
      setTimeout(() => electronApp.exit(1), 0);
    });
    await exited;
    fixture.releaseDelayed();
    app = await launchGoalApplication(userDataDirectory, workspaceDirectory);
    page = await app.firstWindow();
    const interruptedCard = page
      .locator("article")
      .filter({ hasText: "Interrupted Corporation" });
    await interruptedCard.getByRole("button", { name: "继续创建目标" }).click();
    await expect(page.getByText("已中断", { exact: true })).toBeVisible();
    await expect(page.getByText(/没有保存目标/u)).toBeVisible();
    await expect.poll(fixture.generationCalls).toBe(1);

    const plannerCorporation = await createApprovedGoal(
      page,
      "Interrupted Planner Corporation",
      "Do not replay Plan generation after restart",
      100,
    );
    await openPlannerForCorporation(page, plannerCorporation.name);
    await selectPlannerProvider(page, "Restart Goal Provider · goal-model");
    fixture.delayNext();
    await page
      .getByRole("button", { name: "生成尚未验证的草稿" })
      .click({ noWaitAfter: true });
    await expect.poll(fixture.generationCalls).toBe(2);
    await expect.poll(fixture.hasDelayedResponse).toBe(true);

    const plannerProcess = app.process();
    const plannerExited = new Promise<void>((resolve) =>
      plannerProcess.once("exit", () => resolve()),
    );
    await app.evaluate(({ app: electronApp }) => {
      setTimeout(() => electronApp.exit(1), 0);
    });
    await plannerExited;
    fixture.releaseDelayed();
    app = await launchGoalApplication(userDataDirectory, workspaceDirectory);
    page = await app.firstWindow();
    await openPlannerForCorporation(page, plannerCorporation.name);
    await expect(page.getByRole("heading", { name: "已中断" })).toBeVisible();
    await expect(page.getByText(/没有保存计划/u)).toBeVisible();
    await expect.poll(fixture.generationCalls).toBe(2);
  } finally {
    fixture.releaseDelayed();
    await app.close().catch(() => undefined);
    await fixture.close();
    rmSync(workspaceDirectory, {
      force: true,
      maxRetries: 50,
      recursive: true,
      retryDelay: 200,
    });
    rmSync(userDataDirectory, {
      force: true,
      maxRetries: 50,
      recursive: true,
      retryDelay: 200,
    });
  }
});

test("Planner repairs once, fails safely, cancels, rejects stale facts, and restores its draft", async () => {
  test.setTimeout(90_000);
  const fixture = await startGoalFixture();
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-06-matrix-user-data-"),
  );
  const workspaceDirectory = mkdtempSync(
    path.join(tmpdir(), "M2-TU-06-matrix-workspace-"),
  );
  const app = await launchGoalApplication(
    userDataDirectory,
    workspaceDirectory,
  );
  try {
    const page = await app.firstWindow();
    await configureFixtureProvider(
      page,
      fixture.endpoint,
      "Planner Matrix Provider",
    );
    await page.getByRole("button", { name: "控制台", exact: true }).click();
    await page.getByRole("button", { name: "选择工作区" }).click();
    await page.getByRole("button", { name: /选择文件夹/u }).click();

    const repairCorporation = await createApprovedGoal(
      page,
      "Planner Repair Corporation",
      "Create a repairable plan",
      0,
    );
    await openPlannerForCorporation(page, repairCorporation.name);
    await selectPlannerProvider(page, "Planner Matrix Provider · goal-model");
    const callsBeforeRepair = fixture.generationCalls();
    fixture.enqueue("not valid json");
    fixture.enqueue(plannerOutput());
    await page.getByRole("button", { name: "生成尚未验证的草稿" }).click();
    await expect(
      page.getByRole("heading", { name: "尚未验证的计划草稿" }),
    ).toBeVisible();
    expect(fixture.generationCalls() - callsBeforeRepair).toBe(2);
    const firstRead = await getPlannerOperation(page, repairCorporation.id);
    expect(firstRead?.status).toBe("PLAN_SAVED");
    const stablePlanId = firstRead?.plan?.planId;
    expect(stablePlanId).toBeTruthy();

    await page.reload();
    await openPlannerForCorporation(page, repairCorporation.name);
    await expect(
      page.getByRole("heading", { name: "尚未验证的计划草稿" }),
    ).toBeVisible();
    const restored = await getPlannerOperation(page, repairCorporation.id);
    expect(restored?.plan?.planId).toBe(stablePlanId);

    const failureCorporation = await createApprovedGoal(
      page,
      "Planner Repair Failure Corporation",
      "Reject two invalid outputs",
      10,
    );
    await openPlannerForCorporation(page, failureCorporation.name);
    await selectPlannerProvider(page, "Planner Matrix Provider · goal-model");
    const callsBeforeFailure = fixture.generationCalls();
    fixture.enqueue("not valid json");
    fixture.enqueue("still not valid json");
    await page.getByRole("button", { name: "生成尚未验证的草稿" }).click();
    await expect(page.getByRole("heading", { name: "失败" })).toBeVisible();
    await expect(
      page.getByText("INVALID_MODEL_OUTPUT", { exact: true }),
    ).toBeVisible();
    expect(fixture.generationCalls() - callsBeforeFailure).toBe(2);
    expect(
      (await getPlannerOperation(page, failureCorporation.id))?.plan,
    ).toBeUndefined();

    const cancelCorporation = await createApprovedGoal(
      page,
      "Planner Cancel Corporation",
      "Cancel this plan",
      20,
    );
    await openPlannerForCorporation(page, cancelCorporation.name);
    await selectPlannerProvider(page, "Planner Matrix Provider · goal-model");
    fixture.delayNext();
    await page
      .getByRole("button", { name: "生成尚未验证的草稿" })
      .click({ noWaitAfter: true });
    await expect.poll(fixture.hasDelayedResponse).toBe(true);
    const cancelStartedAt = Date.now();
    await page.getByRole("button", { name: "取消", exact: true }).click();
    await expect(page.getByRole("heading", { name: "已取消" })).toBeVisible();
    expect(Date.now() - cancelStartedAt).toBeLessThan(2_000);
    expect(
      (await getPlannerOperation(page, cancelCorporation.id))?.plan,
    ).toBeUndefined();

    const conflictCorporation = await createApprovedGoal(
      page,
      "Planner Conflict Corporation",
      "Reject stale planning facts",
      30,
    );
    await openPlannerForCorporation(page, conflictCorporation.name);
    await selectPlannerProvider(page, "Planner Matrix Provider · goal-model");
    fixture.delayNext();
    await page
      .getByRole("button", { name: "生成尚未验证的草稿" })
      .click({ noWaitAfter: true });
    await expect.poll(fixture.hasDelayedResponse).toBe(true);
    const update = await page.evaluate(
      async ({ corporationId, version }) => {
        return (
          window as unknown as { desktop: DesktopApi }
        ).desktop.corporation.updateName({
          schemaVersion: "1.0",
          commandId: "019fa9bb-8030-7d90-a4e3-a5b0eea2a9ef",
          corporationId,
          expectedVersion: version,
          name: "Planner Conflict Corporation Updated",
        });
      },
      {
        corporationId: conflictCorporation.id,
        version: conflictCorporation.version,
      },
    );
    expect(update.ok).toBe(true);
    fixture.completeDelayed(plannerOutput());
    await expect(page.getByRole("heading", { name: "失败" })).toBeVisible();
    await expect(
      page.getByText("VERSION_CONFLICT", { exact: true }),
    ).toBeVisible();
    expect(
      (await getPlannerOperation(page, conflictCorporation.id))?.plan,
    ).toBeUndefined();
  } finally {
    fixture.releaseDelayed();
    await app.close().catch(() => undefined);
    await fixture.close();
    rmSync(workspaceDirectory, { force: true, recursive: true });
    rmSync(userDataDirectory, { force: true, recursive: true });
  }
});

function launchGoalApplication(
  userDataDirectory: string,
  workspaceDirectory: string,
) {
  return electron.launch({
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
}

async function configureFixtureProvider(
  page: import("@playwright/test").Page,
  endpoint: string,
  name: string,
) {
  await page.getByRole("button", { name: "设置" }).click();
  await page.getByLabel("名称").fill(name);
  await page.getByLabel("API 基础 URL").fill(endpoint);
  await page
    .getByLabel("API Key")
    .fill(`M2-TU-06-${crypto.randomUUID()}-fake-key`);
  await page.getByRole("button", { name: "保存模型服务商" }).click();
  await page.getByRole("button", { name: "测试连接" }).click();
  await expect(page.getByRole("heading", { name: "已验证" })).toBeVisible();
  await page
    .getByRole("combobox", { name: /^模型/u })
    .selectOption("goal-model");
  await page.getByRole("button", { name: "保存修改" }).click();
}

async function createApprovedGoal(
  page: import("@playwright/test").Page,
  name: string,
  goal: string,
  idOffset: number,
) {
  return page.evaluate(
    async ({ name, goal, idOffset }) => {
      const desktop = (window as unknown as { desktop: DesktopApi }).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok || workspaces.value[0] === undefined) {
        throw new Error("Workspace fixture is unavailable");
      }
      const commandId = (offset: number) =>
        `019fa9bb-${(0x8000 + idOffset + offset).toString(16)}-7d90-a4e3-a5b0eea2a9ef`;
      const created = await desktop.corporation.create({
        schemaVersion: "1.0",
        commandId: commandId(1),
        workspaceId: workspaces.value[0].workspaceId,
        name,
      });
      if (!created.ok)
        throw new Error(`Corporation create failed: ${created.error.code}`);
      const drafted = await desktop.goalContract.saveDraft({
        schemaVersion: "1.0",
        commandId: commandId(2),
        corporationId: created.value.id,
        expectedCorporationVersion: created.value.version,
        expectedGoalVersion: 0,
        content: {
          source: "MANUAL",
          originalGoal: goal,
          statement: goal,
          successCriteria: ["A verifiable draft exists"],
          inScope: ["Plan draft"],
          outOfScope: [],
          constraints: [],
          assumptions: [],
          deliverables: ["Plan draft"],
          riskLevel: "LOW",
          budget: {},
          stopConditions: [],
        },
      });
      if (!drafted.ok)
        throw new Error(`Goal draft failed: ${drafted.error.code}`);
      const afterDraft = await desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!afterDraft.ok)
        throw new Error(`Corporation read failed: ${afterDraft.error.code}`);
      const approved = await desktop.goalContract.approve({
        schemaVersion: "1.0",
        commandId: commandId(3),
        corporationId: created.value.id,
        expectedCorporationVersion: afterDraft.value.version,
        goalVersion: drafted.value.version,
      });
      if (!approved.ok)
        throw new Error(`Goal approve failed: ${approved.error.code}`);
      const current = await desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId: created.value.id,
      });
      if (!current.ok)
        throw new Error(`Corporation refresh failed: ${current.error.code}`);
      return current.value;
    },
    { name, goal, idOffset },
  );
}

async function openPlannerForCorporation(
  page: import("@playwright/test").Page,
  corporationName: string,
) {
  await page.reload();
  const card = page.locator("article").filter({ hasText: corporationName });
  await card.getByRole("button", { name: "打开目标合同" }).click();
  await page.getByRole("button", { name: "开始规划设置" }).click();
}

async function selectPlannerProvider(
  page: import("@playwright/test").Page,
  label: string,
) {
  await page.getByLabel("已验证的模型服务商 / 模型").selectOption({ label });
}

async function getPlannerOperation(
  page: import("@playwright/test").Page,
  corporationId: string,
) {
  const result = await page.evaluate(
    async (id) =>
      (window as unknown as { desktop: DesktopApi }).desktop.planner.getCurrent(
        {
          schemaVersion: "1.0",
          corporationId: id,
        },
      ),
    corporationId,
  );
  if (!result.ok) throw new Error(`Planner read failed: ${result.error.code}`);
  return result.value;
}

async function openNewGoal(
  page: import("@playwright/test").Page,
  corporationName: string,
  goal: string,
) {
  await page.getByRole("button", { name: "控制台", exact: true }).click();
  await page.getByRole("button", { name: "新建公司" }).click();
  await page.getByLabel("公司名称 *").fill(corporationName);
  await page.getByLabel("目标 *").fill(goal);
  await page
    .getByLabel(/已验证的模型服务商和准确模型/u)
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
        sendGoalResponse(response, output);
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
      delayedResponse?.destroy();
      delayedResponse = undefined;
      delayed = true;
    },
    hasDelayedResponse: () => delayedResponse !== undefined,
    generationCalls: () =>
      requests.filter(
        ({ path: requestPath }) => requestPath === "/chat/completions",
      ).length,
    generationRequests: () =>
      requests.filter(
        ({ path: requestPath }) => requestPath === "/chat/completions",
      ),
    releaseDelayed: () => {
      delayedResponse?.destroy();
      delayedResponse = undefined;
    },
    completeDelayed: (output: string) => {
      if (delayedResponse === undefined) throw new Error("No delayed response");
      sendGoalResponse(delayedResponse, output);
      delayedResponse = undefined;
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

function sendGoalResponse(response: ServerResponse, output: string) {
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

function plannerOutput() {
  return JSON.stringify({
    schemaVersion: "1.0",
    summary: "Create one verifiable report.",
    tasks: [
      {
        localId: "task-one",
        title: "Create report",
        objective: "Create the requested report.",
        kind: "GENERATION",
        priority: 50,
        riskLevel: "LOW",
        suggestedRole: "Writer",
        requiredCapabilities: [
          { path: "writing.document", minimumLevel: 0.7, mandatory: true },
        ],
        requiredTools: ["workspace.propose_write"],
        inputs: [
          {
            source: "GOAL_CONTRACT",
            logicalName: "approved-goal",
            required: true,
          },
        ],
        expectedOutputs: [
          {
            logicalName: "report",
            mediaType: "text/markdown",
            required: true,
            description: "Requested report.",
          },
        ],
        acceptanceCriteria: [
          {
            localId: "criterion-report",
            description: "The report matches the approved Goal.",
            severity: "REQUIRED",
            evidenceRequired: ["report"],
          },
        ],
        budget: { maxOutputTokens: 4096 },
        retryPolicy: {
          maxAttempts: 2,
          maxEvaluationRevisions: 1,
          retryableCategories: ["provider"],
        },
        permissionHints: {
          workspaceRead: false,
          workspaceWrite: [],
          processProfiles: [],
        },
        assumptions: [],
        nonGoals: [],
      },
    ],
    dependencies: [],
    milestones: [{ title: "Delivery", taskLocalIds: ["task-one"] }],
    assumptions: [],
    risks: [
      {
        description: "Revision may be needed.",
        level: "LOW",
        mitigation: "Validate against explicit criteria.",
      },
    ],
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
