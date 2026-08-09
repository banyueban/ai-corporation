import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import axe from "axe-core";
import { _electron as electron } from "playwright";
import type { DesktopApi } from "../src/shared/desktop-api";

test("user authorizes and restores a Workspace through the visible window", async () => {
  const appDirectory = path.resolve(__dirname, "..");
  const userDataDirectory = mkdtempSync(
    path.join(tmpdir(), "M1-TU-06-electron-user-data-"),
  );
  const workspaceDirectory = mkdtempSync(
    path.join(tmpdir(), "M1-TU-06-workspace-"),
  );
  const evidenceDirectory = path.resolve(appDirectory, "../../release");
  mkdirSync(evidenceDirectory, { recursive: true });

  let electronApp = await launchApplication(
    appDirectory,
    userDataDirectory,
    workspaceDirectory,
  );

  try {
    let page = await electronApp.firstWindow();
    const externalRequests: string[] = [];
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
    });
    await expect(
      page.getByRole("status", { name: /本地核心已就绪/u }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await setWindowSize(electronApp, 1024, 700);
    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(2);
    });
    await expect(
      page.getByRole("heading", { name: "创建第一个公司" }),
    ).toBeVisible();

    const startButton = page.getByRole("button", {
      name: "选择工作区",
    });
    await startButton.focus();
    await page.keyboard.press("Enter");
    const createHeading = page.getByRole("heading", {
      name: "选择工作区",
    });
    await expect(createHeading).toBeFocused();

    await expectNoSeriousAxeViolations(page);

    const selectButton = page.getByRole("button", {
      name: "选择文件夹…",
    });
    await selectButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({ hasText: "工作区授权已保存。" }),
    ).toBeVisible();
    await expect(
      page.getByText(workspaceDirectory, { exact: true }),
    ).toBeVisible();
    await expect(page.locator(".selected-boundary")).toContainText("可读写");
    expect(readdirSync(workspaceDirectory)).toEqual([]);

    await page.getByLabel("公司名称 *").fill("E2E Corporation");
    await page
      .getByLabel("目标 *")
      .fill("Create a verified local Goal Contract");
    await page
      .getByLabel(/成功标准/u)
      .fill("Goal is persisted\nTimeline is visible");
    await page.getByLabel(/预期交付物/u).fill("Goal report");
    await page
      .getByLabel("高影响假设")
      .fill("The authorized workspace is the intended target");
    const mockButton = page.getByRole("button", {
      name: "创建本地 Mock 草稿",
    });
    await mockButton.focus();
    await page.keyboard.press("Enter");

    await expect(
      page
        .getByRole("status")
        .filter({ hasText: "公司已创建，但目标合同没有保存" }),
    ).toBeVisible();
    await expect(page.getByText("STORAGE_UNAVAILABLE")).toBeVisible();
    await expect(page.getByLabel("公司名称 *")).toHaveValue("E2E Corporation");
    const corporationCountAfterFailure = await page.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok || workspaces.value[0] === undefined) {
        throw new Error("Workspace list failed after injected Goal failure");
      }
      const corporations = await desktop.corporation.list({
        schemaVersion: "1.0",
        workspaceId: workspaces.value[0].workspaceId,
      });
      if (!corporations.ok) throw new Error(corporations.error.code);
      return corporations.value.length;
    });
    expect(corporationCountAfterFailure).toBe(1);
    await mockButton.focus();
    await page.keyboard.press("Enter");

    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeFocused();
    await expectNoSeriousAxeViolations(page);
    await expect(page.getByText("本地模拟", { exact: false })).toBeVisible();
    await expect(page.getByText("目标合同草稿已保存。")).toBeVisible();
    const confirmButton = page.getByRole("button", {
      name: "确认目标合同",
    });
    await confirmButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByText("ASSUMPTION_CONFIRMATION_REQUIRED"),
    ).toBeVisible();

    const competingVersion = await page.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok || workspaces.value[0] === undefined) {
        throw new Error("Workspace missing for conflict fixture");
      }
      const corporations = await desktop.corporation.list({
        schemaVersion: "1.0",
        workspaceId: workspaces.value[0].workspaceId,
      });
      const corporation = corporations.ok ? corporations.value[0] : undefined;
      if (corporation === undefined) {
        throw new Error("Corporation missing for conflict fixture");
      }
      const current = await desktop.goalContract.getCurrent({
        schemaVersion: "1.0",
        corporationId: corporation.id,
      });
      if (!current.ok || current.value === null) {
        throw new Error("Goal missing for conflict fixture");
      }
      const goal = current.value;
      return desktop.goalContract.saveDraft({
        schemaVersion: "1.0",
        commandId: "019fa9bb-5000-7d90-a4e3-a5b0eea2a9ef",
        corporationId: corporation.id,
        expectedCorporationVersion: corporation.version,
        expectedGoalVersion: goal.version,
        content: {
          source: goal.source,
          originalGoal: goal.originalGoal,
          statement: goal.statement,
          successCriteria: goal.successCriteria,
          inScope: goal.inScope,
          outOfScope: goal.outOfScope,
          constraints: goal.constraints,
          assumptions: goal.assumptions,
          deliverables: goal.deliverables,
          riskLevel: goal.riskLevel,
          budget: goal.budget,
          stopConditions: goal.stopConditions,
        },
      });
    });
    expect(competingVersion).toMatchObject({
      ok: true,
      value: { version: 2 },
    });

    const assumption = page.getByRole("checkbox", {
      name: /authorized workspace is the intended target/u,
    });
    await assumption.check();
    await confirmButton.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByText("VERSION_CONFLICT")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await page.getByRole("button", { name: "打开目标合同" }).click();
    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeFocused();
    await page
      .getByRole("checkbox", {
        name: /authorized workspace is the intended target/u,
      })
      .check();
    const recoveredConfirmButton = page.getByRole("button", {
      name: "确认目标合同",
    });
    await recoveredConfirmButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText: "目标合同已批准。规划和执行尚未开始。",
      }),
    ).toBeVisible();
    await expect(page.getByText("已批准", { exact: true })).toBeVisible();
    await expect(page.getByText("版本 3 · 已批准 · 本地模拟")).toBeVisible();
    await expect(
      page.getByText("版本 2 · 已被新版替代 · 本地模拟"),
    ).toBeVisible();
    await expect(
      page.getByText("版本 1 · 已被新版替代 · 本地模拟"),
    ).toBeVisible();
    await expect(
      page.getByText("目标合同已批准。", { exact: true }),
    ).toBeVisible();
    expect(externalRequests).toEqual([]);

    const selected = await page.evaluate(async () => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      const workspaces = await desktop.workspace.list();
      if (!workspaces.ok) throw new Error(workspaces.error.code);
      const workspace = workspaces.value[0];
      if (workspace === undefined) throw new Error("Workspace missing");
      const corporations = await desktop.corporation.list({
        schemaVersion: "1.0",
        workspaceId: workspace.workspaceId,
      });
      if (!corporations.ok || corporations.value.length !== 1) {
        throw new Error("Corporation list failed");
      }
      return {
        corporationId: corporations.value[0]?.id,
        workspace,
      };
    });
    expect(selected.workspace).toMatchObject({
      displayPath: workspaceDirectory,
      permissionMode: "READ_WRITE",
      accessStatus: "AVAILABLE",
    });
    if (selected.corporationId === undefined) {
      throw new Error("Corporation fixture was not returned");
    }
    const corporationId = selected.corporationId;

    await page.reload();
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await expect(page.getByText(workspaceDirectory)).toBeVisible();
    await expect(page.getByText("可用")).toBeVisible();
    await expect(page.getByText("正在验证")).toHaveCount(0);
    await expect(page.getByText("E2E Corporation")).toBeVisible();
    const restoredCorporation = await page.evaluate(async (corporationId) => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      return desktop.corporation.get({
        schemaVersion: "1.0",
        corporationId,
      });
    }, corporationId);
    expect(restoredCorporation).toMatchObject({
      ok: true,
      value: { name: "E2E Corporation", version: 5 },
    });

    const verifyButton = page.getByRole("button", { name: "重新验证" });
    await verifyButton.evaluate((element) =>
      element.scrollIntoView({ block: "center" }),
    );
    await expect(verifyButton).toBeVisible();
    const verifyButtonBox = await verifyButton.boundingBox();
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    expect(verifyButtonBox).not.toBeNull();
    expect(verifyButtonBox?.y ?? -1).toBeGreaterThanOrEqual(0);
    expect(
      (verifyButtonBox?.y ?? viewportHeight) +
        (verifyButtonBox?.height ?? viewportHeight),
    ).toBeLessThanOrEqual(viewportHeight);
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "打开目标合同" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeFocused();
    await expect(page.getByText("已批准", { exact: true })).toBeVisible();
    await expect(
      page.getByText("目标合同已批准。", { exact: true }),
    ).toBeVisible();
    const zoomedScreenshot = await electronApp.evaluate(
      async ({ BrowserWindow }) => {
        const window = BrowserWindow.getAllWindows()[0];
        if (!window) {
          throw new Error("E2E_WINDOW_UNAVAILABLE");
        }
        return (await window.webContents.capturePage())
          .toPNG()
          .toString("base64");
      },
    );
    writeFileSync(
      path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-200-percent.png`,
      ),
      Buffer.from(zoomedScreenshot, "base64"),
    );

    await electronApp.evaluate(({ BrowserWindow }) => {
      BrowserWindow.getAllWindows()[0]?.webContents.setZoomFactor(1);
    });
    await setWindowSize(electronApp, 1024, 700);
    await expect(
      page.getByRole("heading", { name: "确认目标合同" }),
    ).toBeVisible();
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-1024x700.png`,
      ),
    });

    await setWindowSize(electronApp, 1440, 900);
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu05-dev-${process.platform}-${process.arch}-1440x900.png`,
      ),
    });

    const competingPause = await page.evaluate(async (id) => {
      const desktop = (
        globalThis as typeof globalThis & { desktop: DesktopApi }
      ).desktop;
      return desktop.corporation.pause({
        schemaVersion: "1.0",
        commandId: "019fa9bb-5001-7d90-a4e3-a5b0eea2a9ef",
        corporationId: id,
        expectedVersion: 5,
      });
    }, corporationId);
    expect(competingPause).toMatchObject({
      ok: true,
      value: { status: "PAUSED", version: 6, pausedFrom: "DRAFT" },
    });
    await page.getByRole("button", { name: "暂停公司" }).click();
    await expect(page.getByText("VERSION_CONFLICT")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "继续运行公司" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "继续运行公司" }).focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText: "公司已恢复到“草稿”状态，没有重复执行任何命令或事件。",
      }),
    ).toBeVisible();

    const pauseButton = page.getByRole("button", {
      name: "暂停公司",
    });
    await pauseButton.focus();
    await page.keyboard.press("Enter");
    await expect(
      page.getByRole("status").filter({
        hasText: "公司已暂停。计划、任务和执行均未开始。",
      }),
    ).toBeVisible();
    await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
    await expect(page.getByText(/从“草稿”状态暂停/u)).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    const beforeRestart = await readPersistedState(page, corporationId);
    expect(beforeRestart).toMatchObject({
      corporation: {
        status: "PAUSED",
        version: 8,
        pausedFrom: "DRAFT",
      },
    });
    await page.reload();
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
    expect(await readPersistedState(page, corporationId)).toEqual(
      beforeRestart,
    );

    await electronApp.close();
    electronApp = await launchApplication(
      appDirectory,
      userDataDirectory,
      workspaceDirectory,
    );
    page = await electronApp.firstWindow();
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
    });
    await setWindowSize(electronApp, 1024, 700);
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await expect(page.getByText("已暂停", { exact: true })).toBeVisible();
    await expect(page.getByText(/从“草稿”状态暂停/u)).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu06-dev-${process.platform}-${process.arch}-paused-restored-1024x700.png`,
      ),
    });
    await setWindowSize(electronApp, 1440, 900);
    await page.screenshot({
      path: path.join(
        evidenceDirectory,
        `m1-tu06-dev-${process.platform}-${process.arch}-paused-restored-1440x900.png`,
      ),
    });
    const afterRestart = await readPersistedState(page, corporationId);
    expect(afterRestart).toEqual(beforeRestart);

    await page.getByRole("button", { name: "打开目标合同" }).click();
    const resumeButton = page.getByRole("button", {
      name: "继续运行公司",
    });
    await resumeButton.click();
    await expect(
      page.getByRole("status").filter({
        hasText: "公司已恢复到“草稿”状态，没有重复执行任何命令或事件。",
      }),
    ).toBeVisible();
    await expect(page.getByText("草稿", { exact: true })).toBeVisible();
    await expect(page.getByText("已批准", { exact: true })).toBeVisible();
    await expectNoSeriousAxeViolations(page);
    const afterResume = await readPersistedState(page, corporationId);
    expect(afterResume).toMatchObject({
      corporation: { status: "DRAFT", version: 9 },
    });
    expect(afterResume.eventCount).toBe(beforeRestart.eventCount + 1);
    await page.reload();
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await expect(page.getByText("草稿", { exact: true })).toBeVisible();
    expect(await readPersistedState(page, corporationId)).toEqual(afterResume);

    await electronApp.close();
    electronApp = await launchApplication(
      appDirectory,
      userDataDirectory,
      workspaceDirectory,
    );
    page = await electronApp.firstWindow();
    page.on("request", (request) => {
      if (/^https?:/u.test(request.url())) externalRequests.push(request.url());
    });
    await expect(page.getByRole("heading", { name: "控制台" })).toBeVisible();
    await expect(page.getByText("草稿", { exact: true })).toBeVisible();
    expect(await readPersistedState(page, corporationId)).toEqual(afterResume);
    await page.getByRole("button", { name: "打开目标合同" }).click();
    await expect(page.getByText("已批准", { exact: true })).toBeVisible();
    expect(externalRequests).toEqual([]);
  } finally {
    await electronApp.close();
    cleanupDirectory(workspaceDirectory);
    cleanupDirectory(userDataDirectory);
  }
});

async function launchApplication(
  appDirectory: string,
  userDataDirectory: string,
  workspaceDirectory: string,
) {
  return electron.launch({
    args: [
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--in-process-gpu",
      "--no-sandbox",
      appDirectory,
      `--user-data-dir=${userDataDirectory}`,
    ],
    env: {
      ...process.env,
      AI_CORPORATION_E2E: "1",
      AI_CORPORATION_E2E_GOAL_SAVE_FAIL_ONCE: "1",
      AI_CORPORATION_E2E_WORKSPACE_PATH: workspaceDirectory,
      CI: "true",
    },
  });
}

async function readPersistedState(page: Page, corporationId: string) {
  return page.evaluate(async (id) => {
    const desktop = (globalThis as typeof globalThis & { desktop: DesktopApi })
      .desktop;
    const corporation = await desktop.corporation.get({
      schemaVersion: "1.0",
      corporationId: id,
    });
    const timeline = await desktop.timeline.list({
      schemaVersion: "1.0",
      corporationId: id,
      limit: 100,
    });
    if (!corporation.ok) throw new Error(corporation.error.code);
    if (!timeline.ok) throw new Error(timeline.error.code);
    return {
      corporation: corporation.value,
      eventCount: timeline.value.items.length,
    };
  }, corporationId);
}

async function setWindowSize(
  electronApp: Awaited<ReturnType<typeof electron.launch>>,
  width: number,
  height: number,
) {
  await electronApp.evaluate(
    ({ BrowserWindow }, size) => {
      BrowserWindow.getAllWindows()[0]?.setSize(size.width, size.height);
    },
    { height, width },
  );
}

function cleanupDirectory(directory: string) {
  rmSync(directory, {
    force: true,
    maxRetries: 10,
    recursive: true,
    retryDelay: 200,
  });
}

async function expectNoSeriousAxeViolations(page: Page) {
  await page.evaluate(axe.source);
  const accessibility = await page.evaluate(async () => {
    const accessibilityEngine = (
      globalThis as typeof globalThis & {
        axe: {
          run(root: Document): Promise<{
            violations: {
              impact: string | null;
              id: string;
              nodes: unknown[];
            }[];
          }>;
        };
      }
    ).axe;
    return accessibilityEngine.run(document);
  });
  expect(
    accessibility.violations.filter((violation) =>
      ["critical", "serious"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
}
