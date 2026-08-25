import { spawn, type ChildProcess } from "node:child_process";
import path from "node:path";

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

export interface StructuredCommandInput {
  readonly executable: string;
  readonly args: readonly string[];
  readonly cwd: string;
  /** 只允许可信 Main 代码补充运行所需变量，模型不能填写。 */
  readonly environment?: Readonly<Record<string, string>>;
  readonly displayCommand: string;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly onUpdate?: (update: CommandUpdate) => void;
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
  const child = createShellProcess(input.command, input.cwd);
  return runSpawnedCommand({
    child,
    command: input.command,
    ...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

/**
 * Runs a trusted executable with an argument array and never invokes a shell.
 * Skill scripts, package managers and fixed system installers use this path so
 * model text cannot turn into command syntax.
 */
export async function runStructuredCommand(
  input: StructuredCommandInput,
): Promise<CommandResult> {
  const child = spawn(input.executable, [...input.args], {
    cwd: input.cwd,
    detached: process.platform !== "win32",
    env: {
      ...safeCommandEnvironment(process.env),
      ...input.environment,
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  return runSpawnedCommand({
    child,
    command: input.displayCommand,
    ...(input.onUpdate === undefined ? {} : { onUpdate: input.onUpdate }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
    ...(input.timeoutMs === undefined ? {} : { timeoutMs: input.timeoutMs }),
  });
}

async function runSpawnedCommand(input: {
  readonly child: ChildProcess;
  readonly command: string;
  readonly onUpdate?: (update: CommandUpdate) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}): Promise<CommandResult> {
  const startedAt = Date.now();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const { child } = input;
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let emittedBytes = 0;
  let truncationReported = false;
  let timedOut = false;
  let settled = false;
  let stopPromise: Promise<void> | undefined;

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

  const stop = () => {
    if (settled || child.pid === undefined) return Promise.resolve();
    // 同一条命令可能同时收到任务取消和超时，只执行一次进程树清理。
    // 更重要的是，下面会等待 taskkill/信号真正结束，不能只看到外层
    // shell 退出就提前告诉上层“已经停止”。
    stopPromise ??= killProcessTree(child);
    return stopPromise;
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
    if (stopPromise !== undefined) await stopPromise;
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
    // taskkill /T 在外层 cmd 先退出时偶尔会漏掉已经变成孤儿的子程序。
    // 先拍一张进程树快照并从最深层向外清理，再对根进程做一次 /T 兜底。
    const descendants = await listWindowsDescendantPids(pid);
    for (const descendantPid of descendants.reverse()) {
      await runWindowsTaskkill(descendantPid);
    }
    await runWindowsTaskkill(pid);
    try {
      child.kill("SIGKILL");
    } catch {
      // taskkill 已经结束根进程时会到这里，属于正常结果。
    }
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

/**
 * Uses the Windows process table only during cancellation/timeout. The command
 * is fixed trusted code and the only inserted value is an integer PID.
 */
async function listWindowsDescendantPids(rootPid: number): Promise<number[]> {
  // Windows 的原生进程快照不依赖可能冷启动或卡住的 WMI 服务。
  // 企业策略禁用 Add-Type 时，再退回 Get-CimInstance。
  const toolhelpResult = await listWindowsDescendantPidsWithToolhelp(rootPid);
  if (toolhelpResult !== undefined) return toolhelpResult;
  return listWindowsDescendantPidsWithPowerShell(rootPid);
}

const WINDOWS_TOOLHELP_SNAPSHOT_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;

public static class AiCorporationProcessSnapshot {
  private const uint SnapshotProcesses = 0x00000002;

  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct ProcessEntry {
    public uint Size;
    public uint Usage;
    public uint ProcessId;
    public IntPtr DefaultHeapId;
    public uint ModuleId;
    public uint Threads;
    public uint ParentProcessId;
    public int PriorityClassBase;
    public uint Flags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
    public string FileName;
  }

  [DllImport("kernel32.dll", SetLastError = true)]
  private static extern IntPtr CreateToolhelp32Snapshot(uint flags, uint processId);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "Process32FirstW")]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool Process32First(IntPtr snapshot, ref ProcessEntry entry);

  [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true, EntryPoint = "Process32NextW")]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool Process32Next(IntPtr snapshot, ref ProcessEntry entry);

  [DllImport("kernel32.dll", SetLastError = true)]
  [return: MarshalAs(UnmanagedType.Bool)]
  private static extern bool CloseHandle(IntPtr handle);

  public static string Read() {
    IntPtr snapshot = CreateToolhelp32Snapshot(SnapshotProcesses, 0);
    if (snapshot == new IntPtr(-1)) {
      throw new Win32Exception(Marshal.GetLastWin32Error());
    }
    StringBuilder result = new StringBuilder("AC_PROCESS_SNAPSHOT_V1\n");
    try {
      ProcessEntry entry = new ProcessEntry();
      entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
      if (!Process32First(snapshot, ref entry)) {
        return result.ToString();
      }
      do {
        result.Append(entry.ParentProcessId).Append(',').Append(entry.ProcessId).Append('\n');
        entry.Size = (uint)Marshal.SizeOf(typeof(ProcessEntry));
      } while (Process32Next(snapshot, ref entry));
      return result.ToString();
    } finally {
      CloseHandle(snapshot);
    }
  }
}
'@
[Console]::Out.Write([AiCorporationProcessSnapshot]::Read())
`;

async function listWindowsDescendantPidsWithToolhelp(
  rootPid: number,
): Promise<number[] | undefined> {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const encodedScript = Buffer.from(
    WINDOWS_TOOLHELP_SNAPSHOT_SCRIPT,
    "utf16le",
  ).toString("base64");
  return new Promise((resolve) => {
    const inspector = spawn(
      powershell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-EncodedCommand",
        encodedScript,
      ],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    let output = "";
    let finished = false;
    const finish = (pids: number[] | undefined) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(pids);
    };
    const timeout = setTimeout(() => {
      inspector.kill();
      finish(undefined);
    }, 5_000);
    inspector.stdout?.on("data", (chunk: Buffer) => {
      if (output.length < 1024 * 1024) output += chunk.toString("utf8");
    });
    inspector.once("error", () => finish(undefined));
    inspector.once("close", (code) => {
      finish(
        code === 0
          ? windowsDescendantsFromToolhelp(output, rootPid)
          : undefined,
      );
    });
  });
}

/** 把 Windows 原生快照输出转成从近到远的后代进程号。 */
export function windowsDescendantsFromToolhelp(
  output: string,
  rootPid: number,
): number[] | undefined {
  const marker = "AC_PROCESS_SNAPSHOT_V1";
  const markerIndex = output.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const pairs: Array<readonly [number, number]> = [];
  for (const line of output
    .slice(markerIndex + marker.length)
    .split(/\r?\n/u)) {
    const [parentText, pidText] = line.trim().split(",");
    const parentPid = Number(parentText);
    const pid = Number(pidText);
    if (
      Number.isSafeInteger(parentPid) &&
      parentPid >= 0 &&
      Number.isSafeInteger(pid) &&
      pid > 0
    ) {
      pairs.push([parentPid, pid]);
    }
  }
  return collectWindowsDescendants(pairs, rootPid);
}

function collectWindowsDescendants(
  pairs: ReadonlyArray<readonly [number, number]>,
  rootPid: number,
): number[] {
  const childrenByParent = new Map<number, number[]>();
  for (const [parentPid, pid] of pairs) {
    if (pid === rootPid) continue;
    const children = childrenByParent.get(parentPid) ?? [];
    children.push(pid);
    childrenByParent.set(parentPid, children);
  }
  const result: number[] = [];
  let pending = [rootPid];
  while (pending.length > 0) {
    const next: number[] = [];
    for (const parentPid of pending) {
      for (const pid of childrenByParent.get(parentPid) ?? []) {
        if (result.includes(pid)) continue;
        result.push(pid);
        next.push(pid);
      }
    }
    pending = next;
  }
  return result;
}

async function listWindowsDescendantPidsWithPowerShell(
  rootPid: number,
): Promise<number[]> {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const powershell = path.join(
    systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const script = [
    `$all = @(Get-CimInstance Win32_Process -Property ProcessId, ParentProcessId)`,
    `$pending = @(${rootPid})`,
    "$result = @()",
    "while ($pending.Count -gt 0) {",
    "  $parents = @($pending)",
    "  $pending = @()",
    "  foreach ($item in $all) {",
    "    $itemPid = [int]$item.ProcessId",
    "    if ($parents -contains [int]$item.ParentProcessId -and $result -notcontains $itemPid) {",
    "      $result += $itemPid",
    "      $pending += $itemPid",
    "    }",
    "  }",
    "}",
    '[Console]::Out.Write(($result -join ","))',
  ].join("\n");

  return new Promise((resolve) => {
    const inspector = spawn(
      powershell,
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
      {
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    let output = "";
    let finished = false;
    const finish = (pids: number[]) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(pids);
    };
    const timeout = setTimeout(() => {
      inspector.kill();
      finish([]);
      // GitHub 的冷启动曾超过三秒；宁可等待可靠快照，也不能假装进程树已停。
    }, 12_000);
    inspector.stdout?.on("data", (chunk: Buffer) => {
      if (output.length < 64 * 1024) output += chunk.toString("utf8");
    });
    inspector.once("error", () => finish([]));
    inspector.once("close", () => {
      const pids = output
        .trim()
        .split(",")
        .map((value) => Number(value))
        .filter(
          (value) =>
            Number.isSafeInteger(value) && value > 0 && value !== rootPid,
        );
      finish([...new Set(pids)]);
    });
  });
}

async function runWindowsTaskkill(pid: number): Promise<void> {
  const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const taskkill = path.join(systemRoot, "System32", "taskkill.exe");
  await new Promise<void>((resolve) => {
    const killer = spawn(taskkill, ["/pid", String(pid), "/t", "/f"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.once("error", () => resolve());
    killer.once("close", () => resolve());
  });
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
