import path from "node:path";

export interface WorkspaceRuntimePaths {
  readonly databasePath: string;
  readonly migrationDirectory: string;
}

export function resolveWorkspaceRuntimePaths(options: {
  readonly appPath: string;
  readonly isPackaged: boolean;
  readonly userDataPath: string;
}): WorkspaceRuntimePaths {
  return {
    databasePath: path.join(
      options.userDataPath,
      "ai-corporation-workspace.sqlite3",
    ),
    migrationDirectory: options.isPackaged
      ? path.join(options.appPath, "migrations")
      : path.resolve(options.appPath, "../../packages/storage/migrations"),
  };
}
