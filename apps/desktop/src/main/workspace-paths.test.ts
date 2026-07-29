import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWorkspaceRuntimePaths } from "./workspace-paths";

describe("Workspace runtime paths", () => {
  it("resolves development migrations outside user data", () => {
    expect(
      resolveWorkspaceRuntimePaths({
        appPath: path.join("repo", "apps", "desktop"),
        isPackaged: false,
        userDataPath: path.join("profiles", "M1-TU-02"),
      }),
    ).toEqual({
      databasePath: path.join(
        "profiles",
        "M1-TU-02",
        "ai-corporation-workspace.sqlite3",
      ),
      migrationDirectory: path.resolve(
        "repo",
        "packages",
        "storage",
        "migrations",
      ),
    });
  });

  it("resolves packaged migrations inside the application", () => {
    expect(
      resolveWorkspaceRuntimePaths({
        appPath: path.join("installed", "app"),
        isPackaged: true,
        userDataPath: path.join("profiles", "M1-TU-02"),
      }).migrationDirectory,
    ).toBe(path.join("installed", "app", "migrations"));
  });
});
