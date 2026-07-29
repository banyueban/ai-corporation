import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const appDirectory = path.join(desktopDirectory, "build", "app");
const nativeCoreName =
  process.platform === "win32" ? "native-core.exe" : "native-core";
const sourceNativeCore = path.resolve(
  desktopDirectory,
  "..",
  "..",
  "target",
  "release",
  nativeCoreName,
);

rmSync(appDirectory, { force: true, recursive: true });
mkdirSync(appDirectory, { recursive: true });
cpSync(path.join(desktopDirectory, "dist"), path.join(appDirectory, "dist"), {
  recursive: true,
});
cpSync(
  path.resolve(
    desktopDirectory,
    "..",
    "..",
    "packages",
    "storage",
    "migrations",
  ),
  path.join(appDirectory, "migrations"),
  { recursive: true },
);
cpSync(sourceNativeCore, path.join(desktopDirectory, "build", nativeCoreName));
writeFileSync(
  path.join(appDirectory, "package.json"),
  `${JSON.stringify(
    {
      name: "ai-corporation-desktop",
      version: "0.1.0",
      author: "AI Corporation contributors",
      description: "Electron desktop shell for AI Corporation.",
      main: "dist/electron/main/index.js",
    },
    undefined,
    2,
  )}\n`,
  "utf8",
);

console.log(`Prepared packaged application with ${nativeCoreName}`);
