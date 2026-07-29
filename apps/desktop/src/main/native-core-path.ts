import path from "node:path";

interface NativeCorePathOptions {
  readonly appPath: string;
  readonly isPackaged: boolean;
  readonly platform: NodeJS.Platform;
  readonly resourcesPath: string;
}

export function resolveNativeCorePath({
  appPath,
  isPackaged,
  platform,
  resourcesPath,
}: NativeCorePathOptions): string {
  const executableName =
    platform === "win32" ? "native-core.exe" : "native-core";

  return isPackaged
    ? path.join(resourcesPath, executableName)
    : path.resolve(appPath, "../../target/debug", executableName);
}
