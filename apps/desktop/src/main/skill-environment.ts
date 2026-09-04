import { createHash, randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { CommandResult, CommandUpdate } from "./command-runner";
import {
  CommandCancelledError,
  CommandTimeoutError,
  runStructuredCommand,
} from "./command-runner";
import {
  javascriptPackageSpec,
  normalizedPackageJson,
  pythonPackageSpec,
  resolveSkillDependencies,
  type ResolvedSkillDependencies,
  type SkillDependency,
} from "./skill-dependencies";
import type {
  SkillLibrary,
  SkillScriptInspection,
  SkillScriptRuntime,
} from "./skill-library";

const ENVIRONMENT_SCHEMA_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10 * 60 * 1_000;
const MAX_ARGUMENTS = 64;
const MAX_ARGUMENT_BYTES = 16 * 1024;

export type SkillEnvironmentScope = "SKILL" | "PROJECT";

export interface SkillEnvironmentRequest {
  readonly dependencies?: readonly SkillDependency[];
  readonly projectReason?: string;
  readonly scope: SkillEnvironmentScope;
  readonly scriptRelativePath: string;
  /** Main-only source marker; the model cannot provide private script bytes. */
  readonly scriptSource?: "SKILL" | "WORKSPACE";
  readonly skillName: string;
  /** Trusted UTF-8 content read through Native Core for WORKSPACE scripts. */
  readonly workspaceScriptContent?: string;
  readonly workspaceScriptSha256?: string;
  /** 可信 Workspace 根由 Main 填写，模型永远不能提交这个值。 */
  readonly workspaceRoot: string;
}

export interface SkillEnvironmentSummary {
  readonly dependencies: readonly string[];
  readonly location: string;
  readonly reused: boolean;
  readonly runtime: SkillScriptRuntime;
  readonly scope: SkillEnvironmentScope;
  readonly scriptRelativePath: string;
  readonly skillName: string;
}

export interface SkillInstallPlan {
  readonly command: string;
  readonly id: string;
  readonly items: readonly string[];
  readonly kind: "ENVIRONMENT" | "SYSTEM_INSTALL" | "MANUAL";
  readonly location: string;
  readonly network: boolean;
  readonly reason: string;
  readonly risk: string;
  readonly source: string;
  readonly systemImpact: string;
  readonly title: string;
}

export type SkillEnvironmentCheck =
  | {
      readonly status: "READY";
      readonly environment: SkillEnvironmentSummary;
    }
  | {
      readonly status: "INSTALL_REQUIRED";
      readonly plan: SkillInstallPlan;
    }
  | {
      readonly status: "MANUAL_REQUIRED";
      readonly plan: SkillInstallPlan;
    };

interface EnvironmentContext {
  readonly dependencies: ResolvedSkillDependencies;
  readonly environmentDirectory: string;
  readonly environmentKey: string;
  readonly inspection: SkillScriptInspection;
  readonly locationLabel: string;
  readonly request: SkillEnvironmentRequest;
  readonly scriptSource: "SKILL" | "WORKSPACE";
  readonly skillDirectory: string;
}

interface ReadyManifest {
  readonly architecture: string;
  readonly dependenciesDigest: string;
  readonly environmentKey: string;
  readonly platform: string;
  readonly pythonVersion?: string;
  readonly runtime: SkillScriptRuntime;
  readonly schemaVersion: 1;
  readonly scope: SkillEnvironmentScope;
  readonly skillDigest: string;
  readonly status: "READY";
}

interface PrivatePlanState {
  readonly context: EnvironmentContext;
  readonly kind: "ENVIRONMENT";
}

interface SystemPlanState {
  readonly context: EnvironmentContext;
  readonly executable: string;
  readonly kind: "SYSTEM_INSTALL";
  readonly missing: readonly SkillDependency[];
}

type InstallPlanState = PrivatePlanState | SystemPlanState;

type StructuredRunner = (input: {
  readonly args: readonly string[];
  readonly cwd: string;
  readonly displayCommand: string;
  readonly environment?: Readonly<Record<string, string>>;
  readonly executable: string;
  readonly onUpdate?: (update: CommandUpdate) => void;
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
}) => Promise<CommandResult>;

export class SkillEnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillEnvironmentError";
  }
}

/**
 * Prepares and runs standard Skill scripts without accepting a shell command
 * from the model. All private paths stay inside this Main-process service.
 */
export class SkillEnvironmentManager {
  readonly #plans = new Map<string, InstallPlanState>();
  readonly #platform: NodeJS.Platform;
  readonly #architecture: string;
  readonly #nodeExecutable: string;
  readonly #npmCliPath: string;
  readonly #uvExecutable: string;
  readonly #runner: StructuredRunner;
  readonly #findExecutable: (
    name: string,
    platform: NodeJS.Platform,
  ) => Promise<string | undefined>;

  constructor(
    private readonly options: {
      readonly rootDirectory: string;
      readonly runtimeDirectory: string;
      readonly skillLibrary: SkillLibrary;
      readonly architecture?: string;
      readonly nodeExecutable?: string;
      readonly npmCliPath?: string;
      readonly platform?: NodeJS.Platform;
      readonly findExecutable?: (
        name: string,
        platform: NodeJS.Platform,
      ) => Promise<string | undefined>;
      readonly runner?: StructuredRunner;
      readonly uvExecutable?: string;
    },
  ) {
    this.#platform = options.platform ?? process.platform;
    this.#architecture = options.architecture ?? process.arch;
    this.#nodeExecutable = options.nodeExecutable ?? process.execPath;
    this.#npmCliPath =
      options.npmCliPath ??
      path.join(options.runtimeDirectory, "npm", "bin", "npm-cli.js");
    this.#uvExecutable =
      options.uvExecutable ??
      path.join(
        options.runtimeDirectory,
        "uv",
        `${this.#platform}-${this.#architecture}`,
        this.#platform === "win32" ? "uv.exe" : "uv",
      );
    this.#runner = options.runner ?? runStructuredCommand;
    this.#findExecutable = options.findExecutable ?? findExecutable;
  }

  async check(
    request: SkillEnvironmentRequest,
  ): Promise<SkillEnvironmentCheck> {
    const context = await this.#resolveContext(request);
    let ready = await this.#isReady(context);
    const reused = ready;
    if (!ready && this.#canPrepareWithoutInstall(context)) {
      await this.#prepareBareEnvironment(context);
      ready = await this.#isReady(context);
    }
    if (!ready) return this.#privateInstallPlan(context);

    const nativeProgram = await this.#nativeRuntimeProgram(context);
    if (nativeProgram === undefined) {
      return {
        status: "MANUAL_REQUIRED",
        plan: this.#manualNativeRuntimePlan(context),
      };
    }

    const missingSystem = await this.#missingSystemDependencies(context);
    if (missingSystem.length > 0) {
      return this.#systemInstallPlan(context, missingSystem);
    }
    return {
      status: "READY",
      environment: this.#summary(context, reused),
    };
  }

  /** Consumes one exact plan. A stale or reused approval cannot install again. */
  async install(
    planId: string,
    input: {
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
    } = {},
  ): Promise<CommandResult> {
    const plan = this.#plans.get(planId);
    if (plan === undefined) {
      throw new SkillEnvironmentError("安装计划已失效，请重新检查。");
    }
    this.#plans.delete(planId);
    try {
      // 批准后再读取一次当前 Skill。用户批准的是一个固定内容摘要；如果
      // Skill 或依赖在等待期间变化，旧计划必须作废，不能安装旧目标。
      const currentContext = await this.#resolveContext(plan.context.request);
      if (currentContext.environmentKey !== plan.context.environmentKey) {
        throw new SkillEnvironmentError(
          "技能或依赖在批准后发生了变化，请重新检查安装计划。",
        );
      }
      return plan.kind === "ENVIRONMENT"
        ? await this.#preparePrivateEnvironment(currentContext, input)
        : await this.#installSystemDependencies(
            { ...plan, context: currentContext },
            input,
          );
    } catch (error) {
      if (
        error instanceof CommandCancelledError ||
        error instanceof CommandTimeoutError
      ) {
        throw error;
      }
      throw new SkillEnvironmentError(
        this.#sanitizeText(readableError(error), plan.context),
      );
    }
  }

  async runScript(
    request: SkillEnvironmentRequest,
    input: {
      readonly args: readonly string[];
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
      readonly timeoutMs?: number;
    },
  ): Promise<CommandResult> {
    const context = await this.#resolveContext(request);
    if (!(await this.#isReady(context))) {
      throw new SkillEnvironmentError("技能环境还没有准备好，请先完成安装。");
    }
    if ((await this.#missingSystemDependencies(context)).length > 0) {
      throw new SkillEnvironmentError("技能需要的系统程序还没有安装好。");
    }
    const nativeProgram = await this.#nativeRuntimeProgram(context);
    if (nativeProgram === undefined) {
      throw new SkillEnvironmentError("当前系统缺少运行这个脚本所需的程序。");
    }
    const logicalArgs = validateScriptArguments(input.args);
    const processArgs = logicalArgs.map((argument) =>
      resolveWorkspaceArgument(argument, request.workspaceRoot),
    );
    const scriptPath = path.join(
      context.skillDirectory,
      ...context.inspection.relativePath.split("/"),
    );
    const invocation = this.#scriptInvocation(
      context,
      nativeProgram,
      scriptPath,
      processArgs,
    );
    const displayCommand = `${displayRuntime(context.inspection.runtime)} Skill/${context.inspection.relativePath}${
      logicalArgs.length === 0
        ? ""
        : ` ${logicalArgs.map(displayArgument).join(" ")}`
    }`;
    const onUpdate =
      input.onUpdate === undefined
        ? undefined
        : (update: CommandUpdate) =>
            input.onUpdate?.({
              ...update,
              text: this.#sanitizeText(update.text, context),
            });
    try {
      const result = await this.#runner({
        args: invocation.args,
        cwd: context.skillDirectory,
        displayCommand,
        environment: {
          AI_CORPORATION_WORKSPACE: request.workspaceRoot,
          ...invocation.environment,
        },
        executable: invocation.executable,
        ...(onUpdate === undefined ? {} : { onUpdate }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.timeoutMs === undefined
          ? {}
          : { timeoutMs: input.timeoutMs }),
      });
      return this.#sanitizeResult(result, context, displayCommand);
    } catch (error) {
      if (
        error instanceof CommandCancelledError ||
        error instanceof CommandTimeoutError
      ) {
        throw error;
      }
      throw new SkillEnvironmentError(
        this.#sanitizeText(readableError(error), context),
      );
    }
  }

  /**
   * Runs a Native-Core-verified Workspace Python file in a disposable private
   * copy while exposing only the imported Skill runtime through PYTHONPATH.
   */
  async runWorkspaceScript(
    request: SkillEnvironmentRequest,
    input: {
      readonly args: readonly string[];
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
      readonly timeoutMs?: number;
    },
  ): Promise<CommandResult> {
    const context = await this.#resolveContext(request);
    if (context.scriptSource !== "WORKSPACE") {
      throw new SkillEnvironmentError("这不是工作区脚本运行请求。");
    }
    if (!(await this.#isReady(context))) {
      throw new SkillEnvironmentError("技能环境还没有准备好，请先完成安装。");
    }
    if ((await this.#missingSystemDependencies(context)).length > 0) {
      throw new SkillEnvironmentError("技能需要的系统程序还没有安装好。");
    }
    const nativeProgram = await this.#nativeRuntimeProgram(context);
    if (nativeProgram === undefined) {
      throw new SkillEnvironmentError("当前系统缺少运行这个脚本所需的程序。");
    }
    const content = request.workspaceScriptContent;
    const expectedSha256 = request.workspaceScriptSha256;
    if (
      content === undefined ||
      expectedSha256 === undefined ||
      sha256(content) !== expectedSha256
    ) {
      throw new SkillEnvironmentError("工作区脚本内容与核对结果不一致。");
    }
    const logicalArgs = validateScriptArguments(input.args);
    const processArgs = logicalArgs.map((argument) =>
      resolveWorkspaceArgument(argument, request.workspaceRoot),
    );
    const runDirectory = path.join(
      context.environmentDirectory,
      ".runs",
      randomUUID(),
    );
    const privateScript = path.join(runDirectory, "workspace-script.py");
    const displayCommand = `Python Workspace/${request.scriptRelativePath}${
      logicalArgs.length === 0
        ? ""
        : ` ${logicalArgs.map(displayArgument).join(" ")}`
    }`;
    const onUpdate =
      input.onUpdate === undefined
        ? undefined
        : (update: CommandUpdate) =>
            input.onUpdate?.({
              ...update,
              text: this.#sanitizeText(update.text, context),
            });
    await mkdir(runDirectory, { recursive: true });
    try {
      await writeFile(privateScript, content, { encoding: "utf8", flag: "wx" });
      const result = await this.#runner({
        args: [privateScript, ...processArgs],
        cwd: request.workspaceRoot,
        displayCommand,
        environment: {
          AI_CORPORATION_WORKSPACE: request.workspaceRoot,
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONIOENCODING: "utf-8",
          PYTHONNOUSERSITE: "1",
          PYTHONPATH: context.skillDirectory,
          PYTHONUTF8: "1",
        },
        executable: nativeProgram,
        ...(onUpdate === undefined ? {} : { onUpdate }),
        ...(input.signal === undefined ? {} : { signal: input.signal }),
        ...(input.timeoutMs === undefined
          ? {}
          : { timeoutMs: input.timeoutMs }),
      });
      return this.#sanitizeResult(result, context, displayCommand);
    } catch (error) {
      if (
        error instanceof CommandCancelledError ||
        error instanceof CommandTimeoutError
      ) {
        throw error;
      }
      throw new SkillEnvironmentError(
        this.#sanitizeText(readableError(error), context),
      );
    } finally {
      await rm(runDirectory, { recursive: true, force: true });
    }
  }

  async #resolveContext(
    request: SkillEnvironmentRequest,
  ): Promise<EnvironmentContext> {
    validateRequest(request);
    const scriptSource = request.scriptSource ?? "SKILL";
    const inspection =
      scriptSource === "WORKSPACE"
        ? await this.options.skillLibrary.inspectWorkspacePython(
            request.skillName,
            request.scriptRelativePath,
            request.workspaceScriptContent ?? "",
          )
        : await this.options.skillLibrary.inspectScript(
            request.skillName,
            request.scriptRelativePath,
          );
    const dependencies = resolveSkillDependencies(
      inspection,
      request.dependencies ?? [],
    );
    const dependenciesDigest = dependencyDigest(dependencies);
    const keyInput = {
      architecture: this.#architecture,
      dependenciesDigest,
      platform: this.#platform,
      runtime: inspection.runtime,
      scope: request.scope,
      skillDigest: inspection.digest,
      ...(request.scope === "PROJECT"
        ? { workspace: sha256(path.resolve(request.workspaceRoot)) }
        : {}),
    };
    const environmentKey = sha256(JSON.stringify(keyInput));
    const base =
      request.scope === "SKILL"
        ? path.join(this.options.rootDirectory, "skills")
        : path.join(
            request.workspaceRoot,
            ".ai-corporation",
            "skill-environments",
          );
    const environmentDirectory = path.join(base, environmentKey);
    return {
      dependencies,
      environmentDirectory,
      environmentKey,
      inspection,
      locationLabel:
        request.scope === "SKILL"
          ? "软件自己的 Skill 独立环境"
          : "当前工作区的 .ai-corporation/skill-environments 目录",
      request,
      scriptSource,
      skillDirectory: path.join(environmentDirectory, "skill"),
    };
  }

  #canPrepareWithoutInstall(context: EnvironmentContext): boolean {
    return (
      context.inspection.runtime !== "PYTHON" &&
      context.dependencies.javascript.length === 0
    );
  }

  async #prepareBareEnvironment(context: EnvironmentContext): Promise<void> {
    const staging = `${context.environmentDirectory}.tmp-${randomUUID()}`;
    await mkdir(path.dirname(context.environmentDirectory), {
      recursive: true,
    });
    try {
      await this.options.skillLibrary.materializeRuntimeCopy(
        context.inspection.skillName,
        context.inspection.digest,
        path.join(staging, "skill"),
      );
      await rm(context.environmentDirectory, { recursive: true, force: true });
      await rename(staging, context.environmentDirectory);
      await this.#writeReadyManifest(context);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  #privateInstallPlan(context: EnvironmentContext): SkillEnvironmentCheck {
    const id = randomUUID();
    this.#plans.set(id, { context, kind: "ENVIRONMENT" });
    const items = dependencyLabels(context.dependencies);
    const isPython = context.inspection.runtime === "PYTHON";
    const command = isPython
      ? [
          `uv venv --python ${context.dependencies.pythonRequest} --relocatable <Skill 环境>`,
          ...(context.dependencies.python.length === 0
            ? []
            : [
                `uv pip install --python <Skill 环境中的 Python> ${context.dependencies.python
                  .map(pythonPackageSpec)
                  .map(displayArgument)
                  .join(" ")}`,
              ]),
        ].join("\n")
      : "npm install --omit=dev --no-audit --no-fund --package-lock=false";
    return {
      status: "INSTALL_REQUIRED",
      plan: {
        command,
        id,
        items:
          items.length === 0
            ? [
                isPython
                  ? `CPython ${context.dependencies.pythonRequest}`
                  : "Skill 运行副本",
              ]
            : items,
        kind: "ENVIRONMENT",
        location: context.locationLabel,
        network: true,
        reason: isPython
          ? "这个脚本需要软件自管的 Python 和独立包环境。"
          : "这个脚本声明了需要安装的 JavaScript 包。",
        risk: "包安装脚本可能会执行第三方代码；安装和脚本都使用当前系统账户，软件目前不能把它们与电脑上的其他文件彻底隔开。",
        source: isPython
          ? "随软件提供的固定 uv、Astral 提供的 Python 预构建版本和 Python Package Index"
          : "随软件提供的 npm 和 npm registry",
        systemImpact:
          "只写独立环境，不修改系统 PATH、注册表或全局 Node/Python。",
        title: `准备“${context.inspection.skillName}”的独立环境`,
      },
    };
  }

  async #systemInstallPlan(
    context: EnvironmentContext,
    missing: readonly SkillDependency[],
  ): Promise<SkillEnvironmentCheck> {
    const managerName = this.#platform === "win32" ? "winget" : "brew";
    const executable = await this.#findExecutable(managerName, this.#platform);
    const commands = missing.map((dependency) =>
      this.#platform === "win32"
        ? `winget install --id ${dependency.installId ?? ""} --exact --accept-package-agreements --accept-source-agreements --disable-interactivity`
        : `brew install ${dependency.installId ?? ""}`,
    );
    if (executable === undefined) {
      return {
        status: "MANUAL_REQUIRED",
        plan: {
          command: commands.join("\n"),
          id: randomUUID(),
          items: missing.map((item) => `${item.name}（${item.installId}）`),
          kind: "MANUAL",
          location: "系统软件目录",
          network: true,
          reason: `当前系统找不到 ${managerName}，软件不能安全地自动安装。`,
          risk: "请从软件官方来源手动安装，完成后回到任务重新尝试。",
          source: managerName,
          systemImpact: "会在系统范围增加软件，具体位置由系统安装管理器决定。",
          title: "需要手动安装系统程序",
        },
      };
    }
    const id = randomUUID();
    this.#plans.set(id, {
      context,
      executable,
      kind: "SYSTEM_INSTALL",
      missing,
    });
    return {
      status: "INSTALL_REQUIRED",
      plan: {
        command: commands.join("\n"),
        id,
        items: missing.map((item) => `${item.name}（${item.installId}）`),
        kind: "SYSTEM_INSTALL",
        location: "系统软件目录",
        network: true,
        reason: "这个 Skill 依赖当前系统中还没有的程序。",
        risk: "这是系统级安装，会改变本机软件；批准只绑定上面列出的包和命令。",
        source: managerName,
        systemImpact: "会在系统范围增加软件，具体位置由系统安装管理器决定。",
        title: "安装 Skill 需要的系统程序",
      },
    };
  }

  #manualNativeRuntimePlan(context: EnvironmentContext): SkillInstallPlan {
    const runtime = displayRuntime(context.inspection.runtime);
    return {
      command: `请修复或安装系统自带的 ${runtime} 后重新尝试`,
      id: randomUUID(),
      items: [runtime],
      kind: "MANUAL",
      location: "系统软件目录",
      network: false,
      reason: `当前系统找不到运行这个脚本所需的 ${runtime}。`,
      risk: "软件不会假装安装成功，也不会启动脚本。",
      source: "当前操作系统",
      systemImpact: "需要用户修复系统运行程序。",
      title: "缺少脚本运行程序",
    };
  }

  async #preparePrivateEnvironment(
    context: EnvironmentContext,
    input: {
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<CommandResult> {
    if (await this.#isReady(context)) {
      return emptyResult("独立环境已经由另一个任务准备完成");
    }
    const staging = `${context.environmentDirectory}.tmp-${randomUUID()}`;
    await mkdir(path.dirname(context.environmentDirectory), {
      recursive: true,
    });
    const results: CommandResult[] = [];
    try {
      await this.options.skillLibrary.materializeRuntimeCopy(
        context.inspection.skillName,
        context.inspection.digest,
        path.join(staging, "skill"),
      );
      if (context.inspection.runtime === "JAVASCRIPT") {
        await writeFile(
          path.join(staging, "package.json"),
          normalizedPackageJson(
            context.dependencies.javascript,
            context.dependencies.packageJsonType,
          ),
          "utf8",
        );
        results.push(
          await this.#runInstallCommand(context, input, {
            args: [
              this.#npmCliPath,
              "install",
              "--omit=dev",
              "--no-audit",
              "--no-fund",
              "--package-lock=false",
            ],
            cwd: staging,
            displayCommand:
              "npm install --omit=dev --no-audit --no-fund --package-lock=false",
            environment: { ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "" },
            executable: this.#nodeExecutable,
          }),
        );
      } else if (context.inspection.runtime === "PYTHON") {
        const uvEnvironment = this.#uvEnvironment();
        results.push(
          await this.#runInstallCommand(context, input, {
            args: [
              "venv",
              "--python",
              context.dependencies.pythonRequest,
              "--relocatable",
              path.join(staging, ".venv"),
            ],
            cwd: staging,
            displayCommand: `uv venv --python ${context.dependencies.pythonRequest} --relocatable <Skill 环境>`,
            environment: uvEnvironment,
            executable: this.#uvExecutable,
          }),
        );
        if (context.dependencies.python.length > 0) {
          results.push(
            await this.#runInstallCommand(context, input, {
              args: [
                "pip",
                "install",
                "--python",
                pythonExecutable(staging, this.#platform),
                ...context.dependencies.python.map(pythonPackageSpec),
              ],
              cwd: staging,
              displayCommand: `uv pip install --python <Skill 环境中的 Python> ${context.dependencies.python
                .map(pythonPackageSpec)
                .map(displayArgument)
                .join(" ")}`,
              environment: uvEnvironment,
              executable: this.#uvExecutable,
            }),
          );
        }
      }
      await this.#verifyStagedEnvironment(context, staging);
      await rm(context.environmentDirectory, { recursive: true, force: true });
      await rename(staging, context.environmentDirectory);
      await this.#verifyRuntimeContents(context);
      await this.#writeReadyManifest(context);
      return combineResults(results, "独立环境准备完成");
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      await rm(context.environmentDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  async #installSystemDependencies(
    plan: SystemPlanState,
    input: {
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<CommandResult> {
    const results: CommandResult[] = [];
    for (const dependency of plan.missing) {
      if (
        (await this.#findExecutable(dependency.name, this.#platform)) !==
        undefined
      ) {
        continue;
      }
      const args =
        this.#platform === "win32"
          ? [
              "install",
              "--id",
              dependency.installId ?? "",
              "--exact",
              "--accept-package-agreements",
              "--accept-source-agreements",
              "--disable-interactivity",
            ]
          : ["install", dependency.installId ?? ""];
      const displayCommand =
        this.#platform === "win32"
          ? `winget install --id ${dependency.installId ?? ""} --exact --accept-package-agreements --accept-source-agreements --disable-interactivity`
          : `brew install ${dependency.installId ?? ""}`;
      results.push(
        await this.#runInstallCommand(plan.context, input, {
          args,
          cwd: plan.context.request.workspaceRoot,
          displayCommand,
          executable: plan.executable,
        }),
      );
    }
    return combineResults(results, "系统程序安装完成");
  }

  async #runInstallCommand(
    context: EnvironmentContext,
    input: {
      readonly onUpdate?: (update: CommandUpdate) => void;
      readonly signal?: AbortSignal;
    },
    command: {
      readonly args: readonly string[];
      readonly cwd: string;
      readonly displayCommand: string;
      readonly environment?: Readonly<Record<string, string>>;
      readonly executable: string;
    },
  ): Promise<CommandResult> {
    const onUpdate =
      input.onUpdate === undefined
        ? undefined
        : (update: CommandUpdate) =>
            input.onUpdate?.({
              ...update,
              text: this.#sanitizeText(update.text, context),
            });
    const result = await this.#runner({
      args: command.args,
      cwd: command.cwd,
      displayCommand: command.displayCommand,
      ...(command.environment === undefined
        ? {}
        : { environment: command.environment }),
      executable: command.executable,
      ...(onUpdate === undefined ? {} : { onUpdate }),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
    if (result.exitCode !== 0) {
      throw new SkillEnvironmentError(
        `${command.displayCommand} 失败，退出码 ${result.exitCode ?? "未知"}。`,
      );
    }
    return this.#sanitizeResult(result, context, command.displayCommand);
  }

  async #isReady(context: EnvironmentContext): Promise<boolean> {
    let manifest: ReadyManifest;
    try {
      manifest = JSON.parse(
        await readFile(
          path.join(context.environmentDirectory, "ready.json"),
          "utf8",
        ),
      ) as ReadyManifest;
    } catch {
      return false;
    }
    if (
      manifest.schemaVersion !== ENVIRONMENT_SCHEMA_VERSION ||
      manifest.status !== "READY" ||
      manifest.environmentKey !== context.environmentKey ||
      manifest.skillDigest !== context.inspection.digest ||
      manifest.runtime !== context.inspection.runtime ||
      manifest.scope !== context.request.scope ||
      manifest.platform !== this.#platform ||
      manifest.architecture !== this.#architecture ||
      manifest.dependenciesDigest !== dependencyDigest(context.dependencies)
    ) {
      return false;
    }
    try {
      await this.#verifyRuntimeContents(context);
      return true;
    } catch {
      return false;
    }
  }

  async #verifyStagedEnvironment(
    context: EnvironmentContext,
    staging: string,
  ): Promise<void> {
    const stagedContext: EnvironmentContext = {
      ...context,
      environmentDirectory: staging,
      skillDirectory: path.join(staging, "skill"),
    };
    await this.#verifyRuntimeContents(stagedContext);
  }

  async #verifyRuntimeContents(context: EnvironmentContext): Promise<void> {
    const requiredRuntimeFile =
      context.scriptSource === "WORKSPACE"
        ? path.join(context.skillDirectory, "SKILL.md")
        : path.join(
            context.skillDirectory,
            ...context.inspection.relativePath.split("/"),
          );
    const scriptStat = await stat(requiredRuntimeFile);
    if (!scriptStat.isFile()) {
      throw new SkillEnvironmentError(
        context.scriptSource === "WORKSPACE"
          ? "技能运行副本不存在。"
          : "技能脚本副本不存在。",
      );
    }
    if (context.inspection.runtime === "JAVASCRIPT") {
      await access(this.#nodeExecutable);
      await Promise.all(
        context.dependencies.javascript.map((dependency) =>
          access(
            path.join(
              context.environmentDirectory,
              "node_modules",
              ...dependency.name.split("/"),
              "package.json",
            ),
          ),
        ),
      );
    } else if (context.inspection.runtime === "PYTHON") {
      const executable = pythonExecutable(
        context.environmentDirectory,
        this.#platform,
      );
      await access(executable);
      const packageNames = context.dependencies.python.map((dependency) =>
        dependency.name.replace(/\[.*$/u, ""),
      );
      const verification = await this.#runner({
        args: [
          "-c",
          "import importlib.metadata as m,sys; [m.distribution(n) for n in sys.argv[1:]]; print(f'{sys.version_info.major}.{sys.version_info.minor}')",
          ...packageNames,
        ],
        cwd: context.skillDirectory,
        displayCommand: "检查 Skill 私有 Python 和依赖",
        environment: {
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONIOENCODING: "utf-8",
          PYTHONNOUSERSITE: "1",
          PYTHONUTF8: "1",
        },
        executable,
        timeoutMs: 30_000,
      });
      if (
        verification.exitCode !== 0 ||
        verification.stdout.trim() !== context.dependencies.pythonRequest
      ) {
        throw new SkillEnvironmentError("Skill 私有 Python 或依赖复检失败。");
      }
    }
  }

  async #writeReadyManifest(context: EnvironmentContext): Promise<void> {
    const manifest: ReadyManifest = {
      architecture: this.#architecture,
      dependenciesDigest: dependencyDigest(context.dependencies),
      environmentKey: context.environmentKey,
      platform: this.#platform,
      ...(context.inspection.runtime === "PYTHON"
        ? { pythonVersion: context.dependencies.pythonRequest }
        : {}),
      runtime: context.inspection.runtime,
      schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
      scope: context.request.scope,
      skillDigest: context.inspection.digest,
      status: "READY",
    };
    const temporary = path.join(
      context.environmentDirectory,
      `.ready-${randomUUID()}.json`,
    );
    await writeFile(
      temporary,
      `${JSON.stringify(manifest, undefined, 2)}\n`,
      "utf8",
    );
    await rename(
      temporary,
      path.join(context.environmentDirectory, "ready.json"),
    );
  }

  async #nativeRuntimeProgram(
    context: EnvironmentContext,
  ): Promise<string | undefined> {
    if (context.inspection.runtime === "JAVASCRIPT")
      return this.#nodeExecutable;
    if (context.inspection.runtime === "PYTHON") {
      return pythonExecutable(context.environmentDirectory, this.#platform);
    }
    if (context.inspection.runtime === "POWERSHELL") {
      const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
      const executable = path.join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      );
      return (await exists(executable)) ? executable : undefined;
    }
    return (await exists("/bin/sh")) ? "/bin/sh" : undefined;
  }

  async #missingSystemDependencies(
    context: EnvironmentContext,
  ): Promise<readonly SkillDependency[]> {
    const missing: SkillDependency[] = [];
    for (const dependency of context.dependencies.system) {
      if (
        (await this.#findExecutable(dependency.name, this.#platform)) ===
        undefined
      ) {
        missing.push(dependency);
      }
    }
    return missing;
  }

  #scriptInvocation(
    context: EnvironmentContext,
    nativeProgram: string,
    scriptPath: string,
    args: readonly string[],
  ): {
    readonly args: readonly string[];
    readonly environment: Readonly<Record<string, string>>;
    readonly executable: string;
  } {
    if (context.inspection.runtime === "JAVASCRIPT") {
      return {
        args: [scriptPath, ...args],
        environment: { ELECTRON_RUN_AS_NODE: "1", NODE_OPTIONS: "" },
        executable: nativeProgram,
      };
    }
    if (context.inspection.runtime === "PYTHON") {
      return {
        args: [scriptPath, ...args],
        environment: {
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONIOENCODING: "utf-8",
          PYTHONNOUSERSITE: "1",
          PYTHONUTF8: "1",
        },
        executable: nativeProgram,
      };
    }
    if (context.inspection.runtime === "POWERSHELL") {
      return {
        args: [
          "-NoLogo",
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          scriptPath,
          ...args,
        ],
        environment: {},
        executable: nativeProgram,
      };
    }
    return {
      args: [scriptPath, ...args],
      environment: {},
      executable: nativeProgram,
    };
  }

  #uvEnvironment(): Readonly<Record<string, string>> {
    return {
      UV_CACHE_DIR: path.join(this.options.rootDirectory, "uv-cache"),
      UV_MANAGED_PYTHON: "1",
      UV_NO_CONFIG: "1",
      UV_NO_PROGRESS: "1",
      UV_PYTHON_INSTALL_DIR: path.join(
        this.options.rootDirectory,
        "python-installations",
      ),
      UV_PYTHON_INSTALL_REGISTRY: "0",
    };
  }

  #summary(
    context: EnvironmentContext,
    reused: boolean,
  ): SkillEnvironmentSummary {
    return {
      dependencies: dependencyLabels(context.dependencies),
      location: context.locationLabel,
      reused,
      runtime: context.inspection.runtime,
      scope: context.request.scope,
      scriptRelativePath: context.inspection.relativePath,
      skillName: context.inspection.skillName,
    };
  }

  #sanitizeResult(
    result: CommandResult,
    context: EnvironmentContext,
    displayCommand: string,
  ): CommandResult {
    return {
      ...result,
      command: displayCommand,
      stderr: this.#sanitizeText(result.stderr, context),
      stdout: this.#sanitizeText(result.stdout, context),
    };
  }

  #sanitizeText(value: string, context: EnvironmentContext): string {
    const replacements: ReadonlyArray<readonly [string, string]> = [
      [context.skillDirectory, "<Skill 运行副本>"],
      [context.environmentDirectory, "<Skill 独立环境>"],
      [this.options.rootDirectory, "<软件环境目录>"],
      [context.request.workspaceRoot, "<当前工作区>"],
      [this.options.runtimeDirectory, "<软件运行资源>"],
    ];
    let sanitized = value;
    for (const [actual, label] of replacements) {
      for (const candidate of absolutePathVariants(actual)) {
        sanitized = sanitized.replace(
          new RegExp(
            escapeRegularExpression(candidate),
            this.#platform === "win32" ? "giu" : "gu",
          ),
          label,
        );
      }
    }
    return sanitized;
  }
}

function validateRequest(request: SkillEnvironmentRequest): void {
  const scriptSource = request.scriptSource ?? "SKILL";
  if (scriptSource !== "SKILL" && scriptSource !== "WORKSPACE") {
    throw new SkillEnvironmentError("脚本来源不正确。");
  }
  if (scriptSource === "WORKSPACE") {
    const relativePath = request.scriptRelativePath.replaceAll("\\", "/");
    if (
      relativePath.length === 0 ||
      path.win32.isAbsolute(relativePath) ||
      path.posix.isAbsolute(relativePath) ||
      /(?:^|\/)\.\.(?:\/|$)/u.test(relativePath) ||
      !relativePath.toLowerCase().endsWith(".py") ||
      request.workspaceScriptContent === undefined ||
      request.workspaceScriptSha256 === undefined ||
      !/^[a-f0-9]{64}$/u.test(request.workspaceScriptSha256)
    ) {
      throw new SkillEnvironmentError("工作区 Python 脚本信息不正确。");
    }
  }
  if (request.scope === "PROJECT") {
    const reason = request.projectReason?.trim() ?? "";
    if (reason.length < 2 || reason.length > 500) {
      throw new SkillEnvironmentError(
        "只有 Skill 明确要求项目环境并说明原因时，才能使用 PROJECT 范围。",
      );
    }
  }
  if (request.scope !== "SKILL" && request.scope !== "PROJECT") {
    throw new SkillEnvironmentError("环境范围不正确。");
  }
}

function validateScriptArguments(args: readonly string[]): readonly string[] {
  if (args.length > MAX_ARGUMENTS) {
    throw new SkillEnvironmentError(`脚本参数最多 ${MAX_ARGUMENTS} 项。`);
  }
  return args.map((argument) => {
    if (
      argument.includes("\0") ||
      Buffer.byteLength(argument, "utf8") > MAX_ARGUMENT_BYTES
    ) {
      throw new SkillEnvironmentError("脚本参数太长或包含非法字符。");
    }
    // 用普通相对段做校验占位，避免合法的“{{workspace}}/file”被误认成“/file”。
    const withoutWorkspace = argument.replaceAll("{{workspace}}", "workspace");
    if (
      path.win32.isAbsolute(withoutWorkspace) ||
      path.posix.isAbsolute(withoutWorkspace) ||
      /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(withoutWorkspace)
    ) {
      throw new SkillEnvironmentError(
        "脚本参数不能包含绝对路径或返回上级目录；请使用 {{workspace}} 表示当前工作区。",
      );
    }
    return argument;
  });
}

function resolveWorkspaceArgument(
  argument: string,
  workspaceRoot: string,
): string {
  return argument.replaceAll("{{workspace}}", workspaceRoot);
}

function dependencyDigest(dependencies: ResolvedSkillDependencies): string {
  return sha256(
    JSON.stringify({
      javascript: dependencies.javascript,
      packageJsonType: dependencies.packageJsonType ?? null,
      python: dependencies.python,
      pythonRequest: dependencies.pythonRequest,
      system: dependencies.system,
    }),
  );
}

function dependencyLabels(
  dependencies: ResolvedSkillDependencies,
): readonly string[] {
  return [
    ...dependencies.javascript.map(
      (item) => `JavaScript：${javascriptPackageSpec(item)}`,
    ),
    ...dependencies.python.map((item) => `Python：${pythonPackageSpec(item)}`),
    ...dependencies.system.map(
      (item) => `系统程序：${item.name}（${item.installId}）`,
    ),
  ];
}

function pythonExecutable(root: string, platform: NodeJS.Platform): string {
  return platform === "win32"
    ? path.join(root, ".venv", "Scripts", "python.exe")
    : path.join(root, ".venv", "bin", "python");
}

async function findExecutable(
  name: string,
  platform: NodeJS.Platform,
): Promise<string | undefined> {
  const pathValue = process.env.PATH ?? "";
  const extensions =
    platform === "win32"
      ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter(Boolean)
      : [""];
  for (const directory of pathValue.split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(
        directory.replace(/^"|"$/gu, ""),
        platform === "win32" && path.extname(name) === ""
          ? `${name}${extension}`
          : name,
      );
      if (await exists(candidate)) return candidate;
    }
  }
  return undefined;
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value);
    return true;
  } catch {
    return false;
  }
}

function displayRuntime(runtime: SkillScriptRuntime): string {
  if (runtime === "JAVASCRIPT") return "JavaScript";
  if (runtime === "PYTHON") return "Python";
  if (runtime === "POWERSHELL") return "Windows PowerShell";
  return "macOS Shell";
}

function displayArgument(value: string): string {
  return /[\s"']/u.test(value) ? JSON.stringify(value) : value;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function emptyResult(command: string): CommandResult {
  return {
    command,
    durationMs: 0,
    exitCode: 0,
    stderr: "",
    stdout: "",
    timedOut: false,
    truncated: false,
  };
}

function combineResults(
  results: readonly CommandResult[],
  fallbackCommand: string,
): CommandResult {
  if (results.length === 0) return emptyResult(fallbackCommand);
  return {
    command: results.map((result) => result.command).join("\n"),
    durationMs: results.reduce((sum, result) => sum + result.durationMs, 0),
    exitCode: results.every((result) => result.exitCode === 0) ? 0 : 1,
    stderr: results
      .map((result) => result.stderr)
      .filter(Boolean)
      .join("\n"),
    stdout: results
      .map((result) => result.stdout)
      .filter(Boolean)
      .join("\n"),
    timedOut: results.some((result) => result.timedOut),
    truncated: results.some((result) => result.truncated),
  };
}

function readableError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function absolutePathVariants(value: string): readonly string[] {
  const resolved = path.resolve(value);
  return [
    ...new Set([
      value,
      resolved,
      value.replaceAll("\\", "/"),
      resolved.replaceAll("\\", "/"),
    ]),
  ]
    .filter((item) => item.length > 3)
    .sort((left, right) => right.length - left.length);
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
