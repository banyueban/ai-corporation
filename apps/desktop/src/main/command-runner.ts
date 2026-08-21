import { spawn, type ChildProcess } from "node:child_process";

const MAX_OUTPUT_BYTES = 50 * 1024;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface CommandUpdate {
  readonly stream: "stdout" | "stderr";
  readonly text: string;
}

export interface CommandResult {
  readonly command: string;
  readonly durationMs: number;
  readonly exitCode: number | null;
  readonly stderr: string;
  readonly stdout: string;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

/**
 * Runs a command through the platform's normal command interpreter.
 * The structure follows pi-coding-agent's bash tool, adapted to AI Corporation's
 * task approval, secret filtering and event model.
 */
export async function runSystemCommand(input: {
  readonly command: string;
  readonly cwd: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onUpdate?: (update: CommandUpdate) => void;
}): Promise<CommandResult> {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const child = createShellProcess(input.command, input.cwd);
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let emittedBytes = 0;
  let truncationReported = false;
  let timedOut = false;
  let settled = false;

  const append = (stream: "stdout" | "stderr", chunk: Buffer) => {
    const text = chunk.toString("utf8");
    const current = stream === "stdout" ? stdout : stderr;
    const combined = current + text;
    const bytes = Buffer.byteLength(combined, "utf8");
    let visible = combined;
    if (bytes > MAX_OUTPUT_BYTES) {
      truncated = true;
      visible = Buffer.from(combined, "utf8")
        .subarray(bytes - MAX_OUTPUT_BYTES)
        .toString("utf8");
    }
    if (stream === "stdout") stdout = visible;
    else stderr = visible;
    const remaining = MAX_OUTPUT_BYTES - emittedBytes;
    if (remaining > 0) {
      const visibleUpdate = Buffer.from(text, "utf8")
        .subarray(0, remaining)
        .toString("utf8");
      emittedBytes += Buffer.byteLength(visibleUpdate, "utf8");
      if (visibleUpdate !== "")
        input.onUpdate?.({ stream, text: visibleUpdate });
    }
    if (bytes > MAX_OUTPUT_BYTES && !truncationReported) {
      truncationReported = true;
      input.onUpdate?.({
        stream,
        text: "\n[后续实时输出已截断，最终结果会保留末尾摘要]\n",
      });
    }
  };

  child.stdout?.on("data", (chunk: Buffer) => append("stdout", chunk));
  child.stderr?.on("data", (chunk: Buffer) => append("stderr", chunk));

  const stop = async () => {
    if (settled || child.pid === undefined) return;
    await killProcessTree(child);
  };
  const onAbort = () => void stop();
  input.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    void stop();
  }, timeoutMs);

  try {
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code) => resolve(code));
    });
    settled = true;
    if (input.signal?.aborted === true) throw new CommandCancelledError();
    if (timedOut) throw new CommandTimeoutError();
    return {
      command: input.command,
      durationMs: Date.now() - startedAt,
      exitCode,
      stderr,
      stdout,
      timedOut: false,
      truncated,
    };
  } finally {
    settled = true;
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onAbort);
  }
}

function createShellProcess(command: string, cwd: string): ChildProcess {
  const env = safeCommandEnvironment(process.env);
  if (process.platform === "win32") {
    const workingDirectory = windowsShellWorkingDirectory(cwd);
    const isUnc = workingDirectory.startsWith("\\\\");
    // cmd.exe 不支持把 UNC 作为 cwd；pushd 会临时映射并在进程退出时释放。
    const commandInWorkspace = isUnc
      ? `pushd "${workingDirectory}" && ${command}`
      : command;
    const commandLine = `chcp 65001>nul && ${commandInWorkspace}`;
    return spawn(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", `"${commandLine}"`],
      {
        cwd: isUnc
          ? (process.env.SystemRoot ?? "C:\\Windows")
          : workingDirectory,
        env,
        windowsVerbatimArguments: true,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  }
  return spawn(process.env.SHELL ?? "/bin/sh", ["-lc", command], {
    cwd,
    detached: true,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** cmd.exe cannot use the Win32 extended-length prefix as its current folder. */
export function windowsShellWorkingDirectory(cwd: string): string {
  if (cwd.startsWith("\\\\?\\UNC\\")) return `\\\\${cwd.slice(8)}`;
  if (cwd.startsWith("\\\\?\\")) return cwd.slice(4);
  return cwd;
}

/** Keeps normal developer tooling available while excluding likely secrets. */
export function safeCommandEnvironment(
  source: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(source).filter(([name, value]) => {
      if (value === undefined) return false;
      const upper = name.toUpperCase();
      return !(
        upper.startsWith("AI_CORPORATION_") ||
        upper.includes("API_KEY") ||
        upper.includes("PASSWORD") ||
        upper.includes("SECRET") ||
        upper.endsWith("_TOKEN") ||
        upper === "TOKEN"
      );
    }),
  );
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  const pid = child.pid;
  if (pid === undefined) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/pid", String(pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
      killer.once("error", () => resolve());
      killer.once("exit", () => resolve());
    });
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // 进程树已经退出就是成功，不把 ESRCH 当作失败。
  }
}

export class CommandCancelledError extends Error {
  constructor() {
    super("命令已随任务停止，整个进程树已经终止。");
  }
}

export class CommandTimeoutError extends Error {
  constructor() {
    super("命令运行超时，整个进程树已经终止。");
  }
}

export function classifyCommandRisk(
  command: string,
): { readonly high: false } | { readonly high: true; readonly reason: string } {
  const checks: ReadonlyArray<readonly [RegExp, string]> = [
    [
      /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|remove|uninstall)\b/iu,
      "会改变项目依赖",
    ],
    [
      /\b(?:pip|pip3|conda|cargo)\s+(?:install|add|remove|uninstall)\b/iu,
      "会安装或删除依赖",
    ],
    [/\b(?:rm|rmdir|del|erase|remove-item)\b/iu, "会删除文件或目录"],
    [
      /\bgit\s+(?:add|commit|push|pull|merge|rebase|reset|checkout|switch|restore|clean|tag)\b/iu,
      "会修改 Git 状态或远程仓库",
    ],
    [/\b(?:publish|deploy|release)\b/iu, "可能发布或部署内容"],
  ];
  for (const [pattern, reason] of checks) {
    if (pattern.test(command)) return { high: true, reason };
  }
  return { high: false };
}
