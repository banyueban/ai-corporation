import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  classifyCommandRisk,
  CommandCancelledError,
  CommandTimeoutError,
  runStructuredCommand,
  runSystemCommand,
  safeCommandEnvironment,
  windowsDescendantsFromToolhelp,
  windowsShellWorkingDirectory,
} from "./command-runner";

describe("command runner", () => {
  const roots: string[] = [];

  afterEach(async () => {
    await Promise.all(
      roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
    );
  });

  it("runs native shell piping, chaining and redirection with visible output", async () => {
    const root = path.join(tmpdir(), `M9-TU-01-command-${crypto.randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    const node = quote(process.execPath);
    const filter =
      process.platform === "win32" ? "findstr hello" : "grep hello";
    const command = `${node} -e "process.stdout.write('hello\\n')" | ${filter} && ${node} -e "process.stdout.write('saved')" > result.txt`;
    const updates: string[] = [];

    const result = await runSystemCommand({
      command,
      cwd: root,
      onUpdate: ({ text }) => updates.push(text),
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("hello");
    expect(updates.join("")).toContain("hello");
    expect(await readFile(path.join(root, "result.txt"), "utf8")).toBe("saved");
  });

  it("passes structured arguments literally without invoking a shell", async () => {
    const root = path.join(
      tmpdir(),
      `M12-TU-02-structured-${crypto.randomUUID()}`,
    );
    roots.push(root);
    await mkdir(root, { recursive: true });
    const result = await runStructuredCommand({
      args: ["-e", "process.stdout.write(process.argv[1])", "hello && whoami"],
      cwd: root,
      displayCommand: "node Skill/scripts/run.js <arguments>",
      executable: process.execPath,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe("hello && whoami");
    expect(result.command).toBe("node Skill/scripts/run.js <arguments>");
  });

  it("kills a timed out command instead of reporting success", async () => {
    const root = path.join(tmpdir(), `M9-TU-01-timeout-${crypto.randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });

    await expect(
      runSystemCommand({
        command: `${quote(process.execPath)} -e "setInterval(() => {}, 1000)"`,
        cwd: root,
        timeoutMs: 100,
      }),
    ).rejects.toBeInstanceOf(CommandTimeoutError);
  }, 20_000);

  it("does not report cancellation until the command process is gone", async () => {
    const root = path.join(tmpdir(), `M9-TU-01-cancel-${crypto.randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    const controller = new AbortController();
    let commandPid: number | undefined;
    let confirmStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      confirmStarted = resolve;
    });
    const running = runSystemCommand({
      command: `${quote(process.execPath)} -e "console.log('M9-PID:' + process.pid); setInterval(() => {}, 1000)"`,
      cwd: root,
      signal: controller.signal,
      onUpdate: ({ text }) => {
        const match = /M9-PID:(\d+)/u.exec(text);
        if (match?.[1] !== undefined) {
          commandPid = Number(match[1]);
          confirmStarted();
        }
      },
    });
    await started;
    controller.abort();

    await expect(running).rejects.toBeInstanceOf(CommandCancelledError);
    expect(commandPid).toBeTypeOf("number");
    expect(isProcessAlive(commandPid as number)).toBe(false);
  }, 20_000);

  it("kills child processes together with a cancelled command", async () => {
    const root = path.join(
      tmpdir(),
      `M9-TU-01-process-tree-${crypto.randomUUID()}`,
    );
    roots.push(root);
    await mkdir(root, { recursive: true });
    await writeFile(
      path.join(root, "child.cjs"),
      'setTimeout(() => require("node:fs").writeFileSync("child-survived.txt", "bad"), 1200);\n',
      "utf8",
    );
    await writeFile(
      path.join(root, "parent.cjs"),
      [
        'const { spawn } = require("node:child_process");',
        'spawn(process.execPath, ["child.cjs"], { cwd: __dirname, stdio: "ignore" });',
        'console.log("M9-CHILD-STARTED");',
        "setInterval(() => {}, 1000);",
        "",
      ].join("\n"),
      "utf8",
    );
    const controller = new AbortController();
    let confirmStarted: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
      confirmStarted = resolve;
    });
    const running = runSystemCommand({
      command: `${quote(process.execPath)} parent.cjs`,
      cwd: root,
      signal: controller.signal,
      onUpdate: ({ text }) => {
        if (text.includes("M9-CHILD-STARTED")) confirmStarted();
      },
    });
    await started;
    controller.abort();
    await expect(running).rejects.toBeInstanceOf(CommandCancelledError);
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    await expect(
      readFile(path.join(root, "child-survived.txt"), "utf8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
  }, 20_000);

  it("removes likely secrets but keeps normal developer environment", () => {
    const env = safeCommandEnvironment({
      PATH: "tool-path",
      OPENAI_API_KEY: "secret",
      AI_CORPORATION_SESSION_TOKEN: "secret",
      HOME: "home",
    });
    expect(env).toEqual({ PATH: "tool-path", HOME: "home" });
  });

  it("asks again for obvious dependency, delete, Git write and publish commands", () => {
    expect(classifyCommandRisk("pnpm test")).toEqual({ high: false });
    expect(classifyCommandRisk("pnpm install").high).toBe(true);
    expect(classifyCommandRisk("rm -rf build").high).toBe(true);
    expect(classifyCommandRisk("git push origin main").high).toBe(true);
    expect(classifyCommandRisk("npm run deploy").high).toBe(true);
  });

  it("removes the Windows extended path prefix before giving cwd to cmd.exe", () => {
    expect(windowsShellWorkingDirectory("\\\\?\\C:\\work\\project")).toBe(
      "C:\\work\\project",
    );
    expect(
      windowsShellWorkingDirectory("\\\\?\\UNC\\server\\share\\project"),
    ).toBe("\\\\server\\share\\project");
  });

  it("parses a Windows native process snapshot", () => {
    expect(
      windowsDescendantsFromToolhelp(
        "AC_PROCESS_SNAPSHOT_V1\n0,4\n400,500\n500,600\n500,700\n",
        400,
      ),
    ).toEqual([500, 600, 700]);
    expect(windowsDescendantsFromToolhelp("not snapshot", 400)).toBeUndefined();
  });

  it("caps live and final output with an explicit truncation marker", async () => {
    const root = path.join(tmpdir(), `M9-TU-01-output-${crypto.randomUUID()}`);
    roots.push(root);
    await mkdir(root, { recursive: true });
    const updates: string[] = [];
    const result = await runSystemCommand({
      command: `${quote(process.execPath)} -e "process.stdout.write('x'.repeat(70000))"`,
      cwd: root,
      onUpdate: ({ text }) => updates.push(text),
    });

    expect(result.truncated).toBe(true);
    expect(Buffer.byteLength(result.stdout, "utf8")).toBeLessThanOrEqual(
      50 * 1024,
    );
    expect(updates.join("")).toContain("实时输出已截断");
  });
});

function quote(value: string): string {
  return `"${value.replaceAll('"', '\\"')}"`;
}

/** 取消结果返回时，被取消的程序必须已经真正退出。 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
