import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceDirectorySelector,
  resolveWorkspaceE2eFixturePath,
} from "./workspace-directory-selector";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("Workspace directory selector", () => {
  it("enables the fixture only in an explicit CI E2E process", () => {
    expect(
      resolveWorkspaceE2eFixturePath({
        AI_CORPORATION_E2E: "1",
        AI_CORPORATION_E2E_WORKSPACE_PATH: "E:\\fixture",
      }),
    ).toBeUndefined();
    expect(
      resolveWorkspaceE2eFixturePath({
        CI: "true",
        AI_CORPORATION_E2E: "1",
        AI_CORPORATION_E2E_WORKSPACE_PATH: "E:\\fixture",
      }),
    ).toBe("E:\\fixture");
  });

  it("opens only the native single-directory dialog", async () => {
    const showDialog = vi.fn(async () => ({
      canceled: false,
      filePaths: ["E:\\example"],
    }));
    const selector = createWorkspaceDirectorySelector({ showDialog });

    await expect(selector.select()).resolves.toBe("E:\\example");
    expect(showDialog).toHaveBeenCalledWith({
      buttonLabel: "选择工作区",
      properties: ["openDirectory"],
      title: "选择工作区文件夹",
    });
  });

  it("returns cancellation without a path", async () => {
    const selector = createWorkspaceDirectorySelector({
      showDialog: async () => ({ canceled: true, filePaths: [] }),
    });

    await expect(selector.select()).resolves.toBeUndefined();
  });

  it("consumes only an empty task-owned E2E fixture once", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "M1-TU-06-select-"));
    temporaryDirectories.push(fixture);
    const showDialog = vi.fn(async () => ({
      canceled: true,
      filePaths: [],
    }));
    const selector = createWorkspaceDirectorySelector({
      e2eFixturePath: fixture,
      showDialog,
    });

    await expect(selector.select()).resolves.toBe(fixture);
    expect(showDialog).not.toHaveBeenCalled();
    await expect(selector.select()).resolves.toBeUndefined();
    expect(showDialog).toHaveBeenCalledOnce();
  });

  it("accepts a future well-formed task ID without hard-coding the prior task", async () => {
    const fixture = await mkdtemp(path.join(os.tmpdir(), "M2-TU-01-select-"));
    temporaryDirectories.push(fixture);
    const selector = createWorkspaceDirectorySelector({
      e2eFixturePath: fixture,
      showDialog: async () => ({ canceled: true, filePaths: [] }),
    });

    await expect(selector.select()).resolves.toBe(fixture);
  });

  it("rejects non-empty or non-task fixture directories", async () => {
    const nonEmpty = await mkdtemp(
      path.join(os.tmpdir(), "M1-TU-05-non-empty-"),
    );
    temporaryDirectories.push(nonEmpty);
    await writeFile(path.join(nonEmpty, "existing.txt"), "existing");

    await expect(
      createWorkspaceDirectorySelector({
        e2eFixturePath: nonEmpty,
        showDialog: async () => ({ canceled: true, filePaths: [] }),
      }).select(),
    ).rejects.toThrow("Workspace selection fixture is invalid");
    await expect(
      createWorkspaceDirectorySelector({
        e2eFixturePath: os.tmpdir(),
        showDialog: async () => ({ canceled: true, filePaths: [] }),
      }).select(),
    ).rejects.toThrow("Workspace selection fixture is invalid");
  });
});
