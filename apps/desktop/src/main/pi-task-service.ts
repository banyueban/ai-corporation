import {
  Agent,
  type AgentEvent,
  type AgentTool,
} from "@earendil-works/pi-agent-core";
import {
  Type,
  createModels,
  createProvider,
  type Model,
} from "@earendil-works/pi-ai";
import { createHash } from "node:crypto";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type {
  PiTaskCommandRequest,
  PiTaskGetRequest,
  PiTaskListRequest,
  PiTaskListResult,
  PiTask,
  PiTaskRequestChangesRequest,
  PiTaskResolveCommandApprovalRequest,
  PiTaskResult,
  PiTaskStartRequest,
} from "@ai-corporation/protocols";
import type {
  PiEmployeeRepository,
  PiCompanyRepository,
  PiTaskRepository,
  WorkspaceRepository,
} from "@ai-corporation/storage";
import {
  WorkspaceNativeError,
  type NativeCoreClient,
} from "./native-core-client";
import type { SkillLibrary } from "./skill-library";
import { createUuidV7 } from "./uuid-v7";
import {
  classifyCommandRisk,
  CommandCancelledError,
  CommandTimeoutError,
  runSystemCommand,
} from "./command-runner";

interface ActiveTask {
  readonly abortController: AbortController;
  readonly agent?: Agent;
}

interface PendingCommandApproval {
  readonly approvalId: string;
  readonly command: string;
  readonly resolve: (approved: boolean) => void;
}

export class PiTaskService {
  readonly #active = new Map<string, ActiveTask>();
  readonly #toolStartedAt = new Map<string, number>();
  readonly #lastToolFailed = new Map<string, boolean>();
  readonly #pendingCommandApprovals = new Map<string, PendingCommandApproval>();
  #shuttingDown = false;

  constructor(
    private readonly options: {
      readonly employeeRepository: Pick<PiEmployeeRepository, "get">;
      readonly companyRepository: Pick<
        PiCompanyRepository,
        "get" | "hasEmployee" | "hasWorkspace"
      >;
      readonly taskRepository: PiTaskRepository;
      readonly skillLibrary: SkillLibrary;
      readonly workspaceRepository: Pick<WorkspaceRepository, "getTrusted">;
      readonly nativeClient: () =>
        | Pick<
            NativeCoreClient,
            "listWorkspace" | "readWorkspaceText" | "writeWorkspaceText"
          >
        | undefined;
      readonly resolveRuntime: (
        providerId: string,
        providerVersion: number,
        modelId: string,
      ) => {
        readonly endpoint: string;
        readonly key: string;
        readonly timeoutMs: number;
      };
      readonly createId?: () => string;
      readonly clock?: () => string;
    },
  ) {}

  get(request: PiTaskGetRequest): PiTaskResult {
    const task =
      request.taskId === undefined
        ? this.options.taskRepository.getLatest(
            request.companyId,
            request.employeeId ?? "",
          )
        : this.options.taskRepository.get(request.taskId);
    return task === undefined || task.companyId !== request.companyId
      ? failure("NOT_FOUND")
      : { ok: true, value: task };
  }

  list(request: PiTaskListRequest): PiTaskListResult {
    if (this.options.companyRepository.get(request.companyId) === undefined) {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "任务操作失败" },
      };
    }
    return {
      ok: true,
      value: [...this.options.taskRepository.list(request.companyId)],
    };
  }

  /** Classifies unfinished write records without ever replaying them. */
  async recoverWorkspaceWrites(): Promise<void> {
    for (const pending of this.options.taskRepository.listPendingWorkspaceWrites()) {
      let status: "SUCCEEDED" | "FAILED" | "UNKNOWN" = "UNKNOWN";
      let message =
        "软件上次关闭时写入尚未确认，当前无法判断文件是否完整写入。";
      try {
        const workspace = this.#requireWorkspace(pending.workspaceId);
        const current = await this.#native().readWorkspaceText(
          workspace.canonicalRootPath,
          pending.relativePath,
        );
        if (current.sha256 === pending.targetSha256) {
          status = "SUCCEEDED";
          message = "软件重启后核对文件哈希，确认上次写入已经完整完成。";
        } else if (
          pending.baseSha256 !== undefined &&
          current.sha256 === pending.baseSha256
        ) {
          status = "FAILED";
          message = "软件重启后核对文件哈希，确认上次写入没有发生。";
        }
      } catch (error) {
        if (
          error instanceof WorkspaceNativeError &&
          error.reason === "NOT_FOUND" &&
          pending.baseSha256 === undefined
        ) {
          status = "FAILED";
          message = "软件重启后确认目标文件不存在，上次创建没有发生。";
        }
      }
      const result = {
        recovered: true,
        relativePath: pending.relativePath,
        targetSha256: pending.targetSha256,
        message,
      };
      this.options.taskRepository.finishWorkspaceWrite(
        pending.toolCallId,
        status,
        result,
        this.#now(),
      );
      this.#event(
        pending.taskId,
        status === "SUCCEEDED" ? "TOOL_RESULT" : "TOOL_ERROR",
        JSON.stringify(result, null, 2),
      );
    }
  }

  /** Marks interrupted commands unknown and never starts them again. */
  recoverCommands(): void {
    const now = this.#now();
    for (const pending of this.options.taskRepository.recoverPendingCommands(
      now,
    )) {
      this.#event(
        pending.taskId,
        "TOOL_ERROR",
        JSON.stringify(
          {
            command: pending.command,
            message: "软件关闭时命令仍在运行，结果未知，不会自动重放。",
            status: "UNKNOWN",
          },
          null,
          2,
        ),
      );
    }
  }

  /** Stops active model/tool work before Electron closes its database. */
  async shutdown(): Promise<void> {
    this.#shuttingDown = true;
    for (const pending of this.#pendingCommandApprovals.values()) {
      pending.resolve(false);
    }
    this.#pendingCommandApprovals.clear();
    for (const { abortController, agent } of this.#active.values()) {
      abortController.abort();
      agent?.abort();
    }
    const deadline = Date.now() + 10_000;
    while (this.#active.size > 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  start(request: PiTaskStartRequest): PiTaskResult {
    try {
      if (this.options.companyRepository.get(request.companyId) === undefined) {
        return failure("NOT_FOUND");
      }
      if (
        !this.options.companyRepository.hasEmployee(
          request.companyId,
          request.employeeId,
        ) ||
        !this.options.companyRepository.hasWorkspace(
          request.companyId,
          request.workspaceId,
        )
      ) {
        return failure("NOT_A_MEMBER");
      }
      const employee = this.options.employeeRepository.get(request.employeeId);
      if (employee === undefined) return failure("NOT_FOUND");
      if (
        [...this.#active.entries()].some(
          ([activeTaskId, { agent }]) =>
            this.options.taskRepository.get(activeTaskId)?.status ===
              "RUNNING" &&
            (agent?.state.isStreaming ?? true),
        )
      ) {
        return failure("ALREADY_RUNNING");
      }
      const runtime = this.options.resolveRuntime(
        employee.providerId,
        employee.providerVersion,
        employee.modelId,
      );
      const workspace = this.#requireWorkspace(request.workspaceId);
      const task = this.options.taskRepository.create({
        id: (this.options.createId ?? createUuidV7)(),
        companyId: request.companyId,
        employeeId: employee.id,
        workspaceId: workspace.workspaceId,
        userInput: request.input,
        now: this.#now(),
      });
      void this.#run(
        task.id,
        employee,
        workspace.canonicalRootPath,
        request.input,
        runtime,
      );
      return { ok: true, value: task };
    } catch (error) {
      if (error instanceof WorkspaceNotReadyError) {
        return failure("WORKSPACE_NOT_READY");
      }
      return failure("EMPLOYEE_NOT_READY");
    }
  }

  cancel(request: PiTaskCommandRequest): PiTaskResult {
    const task = this.options.taskRepository.get(request.taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.companyId !== request.companyId) return failure("NOT_A_MEMBER");
    if (task.status !== "RUNNING") return failure("INVALID_STATE");
    this.#pendingCommandApprovals.get(task.id)?.resolve(false);
    this.#pendingCommandApprovals.delete(task.id);
    const active = this.#active.get(task.id);
    active?.abortController.abort();
    active?.agent?.abort();
    this.options.taskRepository.revokeCommandGrant(task.id);
    const cancelled = this.options.taskRepository.setStatus(
      task.id,
      "CANCELLED",
      this.#now(),
      { failureMessage: "用户已停止任务。" },
    );
    return { ok: true, value: cancelled };
  }

  accept(request: PiTaskCommandRequest): PiTaskResult {
    const result = this.#transition(
      request.companyId,
      request.taskId,
      "WAITING_ACCEPTANCE",
      "COMPLETED",
    );
    if (result.ok) {
      this.options.taskRepository.revokeCommandGrant(request.taskId);
    }
    return result;
  }

  resolveCommandApproval(
    request: PiTaskResolveCommandApprovalRequest,
  ): PiTaskResult {
    const task = this.options.taskRepository.get(request.taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.companyId !== request.companyId) return failure("NOT_A_MEMBER");
    // Renderer 可能因网络或轮询竞争重复提交同一次决定。已经落库的相同决定
    // 直接按成功返回，既不会重复运行命令，也不会误导用户说“状态已变化”。
    if (hasMatchingApprovalResolution(task, request)) {
      return { ok: true, value: task };
    }
    if (task.status !== "RUNNING") return failure("INVALID_STATE");
    const pending = this.#pendingCommandApprovals.get(task.id);
    if (pending === undefined || pending.approvalId !== request.approvalId) {
      return failure("INVALID_STATE");
    }
    this.#pendingCommandApprovals.delete(task.id);
    const approved = request.decision === "APPROVE";
    this.#event(
      task.id,
      "APPROVAL_RESOLVED",
      JSON.stringify(
        {
          approvalId: pending.approvalId,
          command: pending.command,
          decision: request.decision,
        },
        null,
        2,
      ),
    );
    pending.resolve(approved);
    return {
      ok: true,
      value: this.options.taskRepository.get(task.id) ?? task,
    };
  }

  requestChanges(request: PiTaskRequestChangesRequest): PiTaskResult {
    const task = this.options.taskRepository.get(request.taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.companyId !== request.companyId) return failure("NOT_A_MEMBER");
    if (task.status !== "WAITING_ACCEPTANCE") return failure("INVALID_STATE");
    try {
      const employee = this.options.employeeRepository.get(task.employeeId);
      if (employee === undefined) return failure("NOT_FOUND");
      const runtime = this.options.resolveRuntime(
        employee.providerId,
        employee.providerVersion,
        employee.modelId,
      );
      if (task.workspaceId === undefined) return failure("WORKSPACE_NOT_READY");
      const workspace = this.#requireWorkspace(task.workspaceId);
      this.options.taskRepository.setStatus(
        task.id,
        "CHANGES_REQUESTED",
        this.#now(),
        task.finalOutput === undefined ? {} : { finalOutput: task.finalOutput },
      );
      this.options.taskRepository.appendEvent(
        task.id,
        "PROGRESS",
        `用户没有验收通过：${request.input}`,
        this.#now(),
      );
      const running = this.options.taskRepository.setStatus(
        task.id,
        "RUNNING",
        this.#now(),
        task.finalOutput === undefined ? {} : { finalOutput: task.finalOutput },
      );
      void this.#run(
        task.id,
        employee,
        workspace.canonicalRootPath,
        `上一次结果：\n${task.finalOutput ?? ""}\n\n请继续修改。用户要求：${request.input}`,
        runtime,
      );
      return { ok: true, value: running };
    } catch (error) {
      if (error instanceof WorkspaceNotReadyError) {
        return failure("WORKSPACE_NOT_READY");
      }
      return failure("EMPLOYEE_NOT_READY");
    }
  }

  async #run(
    taskId: string,
    employee: NonNullable<ReturnType<PiEmployeeRepository["get"]>>,
    workspaceRoot: string,
    input: string,
    runtime: {
      readonly endpoint: string;
      readonly key: string;
      readonly timeoutMs: number;
    },
  ): Promise<void> {
    let finalOutput = "";
    // Pi 的 agent.abort() 不保证正在执行的工具收到信号，因此任务自己持有取消器。
    const taskAbortController = new AbortController();
    this.#active.set(taskId, { abortController: taskAbortController });
    try {
      const instructions = await this.options.skillLibrary.readInstructions(
        employee.skillName,
      );
      const providerId = `ai-corporation-${employee.providerId}`;
      const model: Model<"openai-completions"> = {
        id: employee.modelId,
        name: employee.modelId,
        api: "openai-completions",
        provider: providerId,
        baseUrl: runtime.endpoint,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
        compat: {
          supportsDeveloperRole: false,
          supportsReasoningEffort: false,
        },
      };
      const models = createModels();
      models.setProvider(
        createProvider({
          id: providerId,
          name: providerId,
          baseUrl: runtime.endpoint,
          auth: {
            apiKey: {
              name: "AI Corporation Provider Key",
              resolve: async () => ({
                auth: { apiKey: runtime.key },
                source: "AI Corporation 本地凭据",
              }),
            },
          },
          models: [model],
          api: openAICompletionsApi(),
        }),
      );
      const systemPrompt = buildSystemPrompt(employee.name, instructions);
      const agent = new Agent({
        initialState: {
          systemPrompt,
          model,
          thinkingLevel: "off",
          tools: this.#createWorkspaceTools(
            taskId,
            workspaceRoot,
            employee.skillName === "coding-task",
            taskAbortController.signal,
          ),
        },
        streamFn: (requestModel, context, options) =>
          models.streamSimple(requestModel, context, {
            ...options,
            timeoutMs: runtime.timeoutMs,
          }),
        toolExecution: "sequential",
        onPayload: (payload) => {
          this.#event(
            taskId,
            "MODEL_INPUT",
            hideSecret(JSON.stringify(payload, null, 2), runtime.key),
          );
          return undefined;
        },
      });
      this.#active.set(taskId, {
        abortController: taskAbortController,
        agent,
      });
      agent.subscribe((event) => {
        finalOutput = this.#recordAgentEvent(taskId, event, finalOutput);
      });
      this.#event(taskId, "PROGRESS", `${employee.name} 正在理解任务。`);
      if (taskAbortController.signal.aborted) {
        throw new CommandCancelledError();
      }
      await agent.prompt(input);
      if (agent.state.errorMessage !== undefined) {
        throw new Error(agent.state.errorMessage);
      }
      // 允许员工从早期尝试失败中恢复，但最后一次工具操作仍失败时不能
      // 把任务伪装成可验收。用户可以在完整过程中看到所有早期失败。
      if (this.#lastToolFailed.get(taskId) === true) {
        throw new Error(
          "最后一次工具操作失败，请展开完整过程查看名称和原因。 ",
        );
      }
      const current = this.options.taskRepository.get(taskId);
      if (current?.status === "RUNNING" && !this.#shuttingDown) {
        this.options.taskRepository.setStatus(
          taskId,
          "WAITING_ACCEPTANCE",
          this.#now(),
          { finalOutput },
        );
        this.#event(taskId, "PROGRESS", "员工已完成回答和自查，等待你验收。 ");
      }
    } catch (error) {
      const current = this.options.taskRepository.get(taskId);
      if (current?.status === "RUNNING" && !this.#shuttingDown) {
        this.options.taskRepository.setStatus(taskId, "FAILED", this.#now(), {
          failureMessage: hideSecret(readableError(error), runtime.key),
        });
      }
    } finally {
      this.#active.delete(taskId);
      this.#lastToolFailed.delete(taskId);
      const current = this.options.taskRepository.get(taskId);
      if (current?.status !== "WAITING_ACCEPTANCE") {
        this.options.taskRepository.revokeCommandGrant(taskId);
      }
    }
  }

  #requireWorkspace(workspaceId: string) {
    const workspace = this.options.workspaceRepository.getTrusted(workspaceId);
    if (
      workspace === undefined ||
      workspace.accessStatus !== "AVAILABLE" ||
      workspace.permissionMode !== "READ_WRITE"
    ) {
      throw new WorkspaceNotReadyError();
    }
    if (this.options.nativeClient() === undefined) {
      throw new WorkspaceNotReadyError();
    }
    return workspace;
  }

  #createWorkspaceTools(
    taskId: string,
    workspaceRoot: string,
    allowCommands: boolean,
    taskSignal: AbortSignal,
  ): AgentTool[] {
    const listParameters = Type.Object({
      relativePath: Type.String({
        description: "要查看的相对目录；根目录使用空字符串",
      }),
    });
    const readParameters = Type.Object({
      relativePath: Type.String({
        description: "要读取的普通文本文件相对路径",
      }),
    });
    const writeParameters = Type.Object({
      relativePath: Type.String({
        description: "要创建或修改的文本文件相对路径",
      }),
      content: Type.String({ description: "文件的完整新内容" }),
      baseSha256: Type.Optional(
        Type.String({
          description:
            "修改已有文件时必须填写最近读取到的 SHA-256；创建新文件时省略",
        }),
      ),
    });
    const tools: AgentTool[] = [
      {
        name: "workspace_list",
        label: "查看工作区目录",
        description: "查看当前任务工作区内的普通文件和目录。",
        parameters: listParameters,
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const { relativePath } = params as { relativePath: string };
          const result = await this.#native().listWorkspace(
            workspaceRoot,
            relativePath,
          );
          return toolResult(result);
        },
      },
      {
        name: "workspace_read_text",
        label: "读取工作区文本",
        description: "读取当前任务工作区内不超过 1 MiB 的普通 UTF-8 文本。",
        parameters: readParameters,
        executionMode: "sequential",
        execute: async (_toolCallId, params) => {
          const { relativePath } = params as { relativePath: string };
          const result = await this.#native().readWorkspaceText(
            workspaceRoot,
            relativePath,
          );
          return toolResult(result);
        },
      },
      {
        name: "workspace_write_text",
        label: "写入工作区文本",
        description:
          "自动创建或修改普通 UTF-8 文本。修改已有文件前必须先读取并传入 baseSha256。",
        parameters: writeParameters,
        executionMode: "sequential",
        execute: async (toolCallId, params) => {
          const { relativePath, content, baseSha256 } = params as {
            relativePath: string;
            content: string;
            baseSha256?: string;
          };
          const targetSha256 = createHash("sha256")
            .update(content, "utf8")
            .digest("hex");
          let previousContent: string | undefined;
          if (baseSha256 !== undefined) {
            const before = await this.#native().readWorkspaceText(
              workspaceRoot,
              relativePath,
            );
            if (before.sha256 !== baseSha256) {
              throw new Error(
                "文件在员工读取后已被其他操作修改，本次不会覆盖新内容。",
              );
            }
            previousContent = before.content;
          }
          const existing = this.options.taskRepository.beginWorkspaceWrite({
            toolCallId,
            taskId,
            relativePath,
            ...(baseSha256 === undefined ? {} : { baseSha256 }),
            targetSha256,
            now: this.#now(),
          });
          if (existing !== undefined) {
            if (
              existing.status === "SUCCEEDED" &&
              existing.result !== undefined
            ) {
              return toolResult(existing.result);
            }
            throw new Error(
              "这次写入的状态不明确，软件不会自动重复写入。请检查文件后重新发起任务。",
            );
          }
          try {
            const result = await this.#native().writeWorkspaceText(
              workspaceRoot,
              relativePath,
              content,
              baseSha256,
            );
            if (result.sha256 !== targetSha256) {
              this.options.taskRepository.finishWorkspaceWrite(
                toolCallId,
                "UNKNOWN",
                { error: "写入后的文件哈希与目标不一致" },
                this.#now(),
              );
              throw new WorkspaceWriteUnknownError();
            }
            const visible = {
              ...result,
              diff: readableTextDiff(relativePath, previousContent, content),
            };
            this.options.taskRepository.finishWorkspaceWrite(
              toolCallId,
              "SUCCEEDED",
              visible,
              this.#now(),
            );
            return toolResult(visible);
          } catch (error) {
            if (!(error instanceof WorkspaceWriteUnknownError)) {
              const status =
                error instanceof WorkspaceNativeError &&
                error.reason === "WRITE_FAILED"
                  ? "UNKNOWN"
                  : "FAILED";
              this.options.taskRepository.finishWorkspaceWrite(
                toolCallId,
                status,
                { error: readableError(error) },
                this.#now(),
              );
            }
            throw error;
          }
        },
      },
    ];
    if (allowCommands) {
      const commandParameters = Type.Object({
        command: Type.String({
          description:
            "在当前工作区运行的完整系统命令，可使用管道、串联和重定向",
          maxLength: 20_000,
          minLength: 1,
        }),
        timeoutSeconds: Type.Optional(
          Type.Integer({
            description: "超时秒数，默认 120，范围 1 到 600",
            maximum: 600,
            minimum: 1,
          }),
        ),
      });
      tools.push({
        name: "workspace_run_command",
        label: "运行工作区命令",
        description:
          "使用当前系统的原生命令方式运行完整命令，返回真实输出、退出码和耗时。",
        parameters: commandParameters,
        executionMode: "sequential",
        execute: async (toolCallId, params, signal) => {
          const { command, timeoutSeconds } = params as {
            command: string;
            timeoutSeconds?: number;
          };
          const commandSignal =
            signal === undefined
              ? taskSignal
              : AbortSignal.any([taskSignal, signal]);
          if (!this.options.taskRepository.hasCommandGrant(taskId)) {
            const approved = await this.#requestCommandApproval(
              taskId,
              command,
              "TASK",
              "命令会使用你当前的系统账户运行，项目脚本可能访问工作区外文件；当前版本没有 OS 级强隔离。批准只对本任务有效。",
              commandSignal,
            );
            if (!approved) throw new Error("用户没有允许本任务运行命令。");
            this.options.taskRepository.grantCommandsForTask(
              taskId,
              this.#now(),
            );
          }
          const risk = classifyCommandRisk(command);
          if (risk.high) {
            const approved = await this.#requestCommandApproval(
              taskId,
              command,
              "HIGH_RISK",
              risk.reason,
              commandSignal,
            );
            if (!approved) throw new Error("用户拒绝了这条高风险命令。");
          }
          this.options.taskRepository.beginCommandCall({
            command,
            now: this.#now(),
            taskId,
            toolCallId,
          });
          let recorded = false;
          try {
            const result = await runSystemCommand({
              command,
              cwd: workspaceRoot,
              signal: commandSignal,
              timeoutMs: (timeoutSeconds ?? 120) * 1_000,
              onUpdate: (update) => {
                this.#event(
                  taskId,
                  "TOOL_UPDATE",
                  JSON.stringify({ command, ...update }, null, 2),
                );
              },
            });
            const status = result.exitCode === 0 ? "SUCCEEDED" : "FAILED";
            this.options.taskRepository.finishCommandCall(
              toolCallId,
              status,
              result,
              this.#now(),
            );
            recorded = true;
            if (result.exitCode !== 0) {
              throw new Error(`命令退出码为 ${result.exitCode ?? "未知"}。`);
            }
            return toolResult(result);
          } catch (error) {
            const status =
              error instanceof CommandCancelledError
                ? "CANCELLED"
                : error instanceof CommandTimeoutError
                  ? "TIMED_OUT"
                  : "FAILED";
            if (!recorded) {
              this.options.taskRepository.finishCommandCall(
                toolCallId,
                status,
                { error: readableError(error) },
                this.#now(),
              );
            }
            throw error;
          }
        },
      });
    }
    return tools;
  }

  #requestCommandApproval(
    taskId: string,
    command: string,
    kind: "TASK" | "HIGH_RISK",
    reason: string,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (signal?.aborted === true) return Promise.resolve(false);
    const approvalId = createUuidV7();
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (approved: boolean) => {
        if (settled) return;
        settled = true;
        const current = this.#pendingCommandApprovals.get(taskId);
        if (current?.approvalId === approvalId) {
          this.#pendingCommandApprovals.delete(taskId);
        }
        signal?.removeEventListener("abort", onAbort);
        resolve(approved);
      };
      const onAbort = () => finish(false);
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#pendingCommandApprovals.set(taskId, {
        approvalId,
        command,
        resolve: finish,
      });
      this.#event(
        taskId,
        "APPROVAL_REQUIRED",
        JSON.stringify({ approvalId, command, kind, reason }, null, 2),
      );
    });
  }

  #native() {
    const native = this.options.nativeClient();
    if (native === undefined) throw new WorkspaceNotReadyError();
    return native;
  }

  #recordAgentEvent(taskId: string, event: AgentEvent, output: string): string {
    if (event.type === "message_update") {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        this.#event(taskId, "MODEL_OUTPUT", update.delta);
        return output + update.delta;
      }
    }
    if (event.type === "tool_execution_start") {
      this.#toolStartedAt.set(`${taskId}:${event.toolCallId}`, Date.now());
      this.#event(
        taskId,
        "TOOL_START",
        JSON.stringify({ name: event.toolName, input: event.args }, null, 2),
      );
    }
    if (event.type === "tool_execution_update") {
      this.#event(
        taskId,
        "TOOL_UPDATE",
        JSON.stringify(
          { name: event.toolName, result: event.partialResult },
          null,
          2,
        ),
      );
    }
    if (event.type === "tool_execution_end") {
      this.#lastToolFailed.set(taskId, event.isError);
      const timerKey = `${taskId}:${event.toolCallId}`;
      const startedAt = this.#toolStartedAt.get(timerKey);
      this.#toolStartedAt.delete(timerKey);
      this.#event(
        taskId,
        event.isError ? "TOOL_ERROR" : "TOOL_RESULT",
        JSON.stringify(
          {
            name: event.toolName,
            result: event.result,
            isError: event.isError,
            durationMs:
              startedAt === undefined ? undefined : Date.now() - startedAt,
          },
          null,
          2,
        ),
      );
    }
    return output;
  }

  #transition(
    companyId: string,
    taskId: string,
    from: string,
    to: "COMPLETED" | "CHANGES_REQUESTED",
  ): PiTaskResult {
    const task = this.options.taskRepository.get(taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.companyId !== companyId) return failure("NOT_A_MEMBER");
    if (task.status !== from) return failure("INVALID_STATE");
    return {
      ok: true,
      value: this.options.taskRepository.setStatus(taskId, to, this.#now(), {
        ...(task.finalOutput === undefined
          ? {}
          : { finalOutput: task.finalOutput }),
      }),
    };
  }

  #event(
    taskId: string,
    kind:
      | "PROGRESS"
      | "MODEL_INPUT"
      | "MODEL_OUTPUT"
      | "TOOL_START"
      | "TOOL_RESULT"
      | "TOOL_ERROR"
      | "TOOL_UPDATE"
      | "APPROVAL_REQUIRED"
      | "APPROVAL_RESOLVED",
    content: string,
  ): void {
    const current = this.options.taskRepository.get(taskId);
    if (current?.status === "RUNNING" || kind === "PROGRESS") {
      this.options.taskRepository.appendEvent(
        taskId,
        kind,
        content,
        this.#now(),
      );
    }
  }

  #now(): string {
    return (this.options.clock ?? (() => new Date().toISOString()))();
  }
}

function buildSystemPrompt(employeeName: string, skill: string): string {
  return `你是 AI Corporation 的员工“${employeeName}”。\n\n${skill}\n\n请直接完成用户交代的真实工作区任务。先用 workspace_list 了解目录；需要参考已有内容时用 workspace_read_text。创建文本文件时直接调用 workspace_write_text 且省略 baseSha256；修改已有文本时必须先读取，再把读取结果中的 sha256 原样作为 baseSha256。编码技能还可以调用 workspace_run_command 运行真实检查和测试。不得声称执行了工具没有真正完成的操作。完成后请说明实际创建或修改的相对路径、运行过的检查和真实结果，并提醒用户验收。`;
}

function toolResult(details: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(details, null, 2) },
    ],
    details,
  };
}

function hasMatchingApprovalResolution(
  task: PiTask,
  request: PiTaskResolveCommandApprovalRequest,
): boolean {
  return task.events.some((event) => {
    if (event.kind !== "APPROVAL_RESOLVED") return false;
    try {
      const value = JSON.parse(event.content) as {
        approvalId?: unknown;
        decision?: unknown;
      };
      return (
        value.approvalId === request.approvalId &&
        value.decision === request.decision
      );
    } catch {
      // 损坏的旧事件不能伪造成已经处理过的决定。
      return false;
    }
  });
}

class WorkspaceNotReadyError extends Error {}
class WorkspaceWriteUnknownError extends Error {
  constructor() {
    super("写入结果不明确，软件不会把它标记为成功，也不会自动重复写入。");
  }
}

function readableTextDiff(
  relativePath: string,
  before: string | undefined,
  after: string,
): string {
  if (before === undefined)
    return `新增 ${relativePath}\n${prefixLines(after, "+ ")}`;
  return `修改 ${relativePath}\n--- 修改前\n${prefixLines(before, "- ")}\n+++ 修改后\n${prefixLines(after, "+ ")}`;
}

function prefixLines(value: string, prefix: string): string {
  return value
    .split(/\r?\n/u)
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

function readableError(error: unknown): string {
  if (error instanceof Error && error.message.trim() !== "")
    return error.message;
  return "模型或工具运行失败，可以直接重试。";
}

function hideSecret(value: string, secret: string): string {
  return secret === "" ? value : value.split(secret).join("[已隐藏认证信息]");
}

function failure(
  code:
    | "NOT_FOUND"
    | "EMPLOYEE_NOT_READY"
    | "WORKSPACE_NOT_READY"
    | "NOT_A_MEMBER"
    | "ALREADY_RUNNING"
    | "INVALID_STATE"
    | "STORAGE_UNAVAILABLE"
    | "INTERNAL",
): PiTaskResult {
  return { ok: false, error: { code, message: "任务操作失败" } };
}
