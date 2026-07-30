import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenDialogOptions, OpenDialogReturnValue } from "electron";

export type ShowWorkspaceDirectoryDialog = (
  options: OpenDialogOptions,
) => Promise<OpenDialogReturnValue>;

export interface WorkspaceDirectorySelector {
  select(): Promise<string | undefined>;
}

export function resolveWorkspaceE2eFixturePath(
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined {
  return environment.CI === "true" && environment.AI_CORPORATION_E2E === "1"
    ? environment.AI_CORPORATION_E2E_WORKSPACE_PATH
    : undefined;
}

export function createWorkspaceDirectorySelector(options: {
  readonly e2eFixturePath?: string;
  readonly showDialog: ShowWorkspaceDirectoryDialog;
}): WorkspaceDirectorySelector {
  let fixturePath = options.e2eFixturePath;

  return {
    async select() {
      if (fixturePath !== undefined) {
        const selected = fixturePath;
        fixturePath = undefined;
        await assertSafeE2eFixture(selected);
        return selected;
      }

      const result = await options.showDialog({
        buttonLabel: "Select workspace",
        properties: ["openDirectory"],
        title: "Select a workspace folder",
      });
      if (result.canceled || result.filePaths.length !== 1) {
        return undefined;
      }
      return result.filePaths[0];
    },
  };
}

async function assertSafeE2eFixture(candidate: string): Promise<void> {
  const resolved = path.resolve(candidate);
  const temporaryRoot = path.resolve(os.tmpdir());
  const relativeToTemporaryRoot = path.relative(temporaryRoot, resolved);
  if (
    !path.isAbsolute(candidate) ||
    path.isAbsolute(relativeToTemporaryRoot) ||
    relativeToTemporaryRoot.startsWith("..") ||
    !path.basename(resolved).startsWith("M1-TU-05-")
  ) {
    throw new Error("Workspace selection fixture is invalid");
  }
  const metadata = await stat(resolved);
  if (!metadata.isDirectory() || (await readdir(resolved)).length !== 0) {
    throw new Error("Workspace selection fixture is invalid");
  }
}
