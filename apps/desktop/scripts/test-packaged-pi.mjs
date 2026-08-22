import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const desktopDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const repositoryDirectory = path.resolve(desktopDirectory, "..", "..");
const executableArgument = process.argv
  .slice(2)
  .find((argument) => argument !== "--");

if (executableArgument === undefined) {
  throw new Error(
    "Usage: pnpm test:packaged -- <repository-relative executable path>",
  );
}

const executablePath = path.resolve(repositoryDirectory, executableArgument);
if (!existsSync(executablePath)) {
  throw new Error(`Packaged executable does not exist: ${executablePath}`);
}

// 最终包复用当前 Pi 主流程和标准 Skill 资源旅程，不再运行已退出入口的旧流程。
const playwrightCli = path.join(
  desktopDirectory,
  "node_modules",
  "@playwright",
  "test",
  "cli.js",
);
const child = spawn(
  process.execPath,
  [playwrightCli, "test", "pi-employees.spec.ts", "pi-skill-resources.spec.ts"],
  {
    cwd: desktopDirectory,
    env: {
      ...process.env,
      AI_CORPORATION_PACKAGED_EXE: executablePath,
    },
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  },
);

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
