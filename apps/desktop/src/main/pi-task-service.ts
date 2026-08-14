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
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import type {
  PiTaskCommandRequest,
  PiTaskGetRequest,
  PiTaskRequestChangesRequest,
  PiTaskResult,
  PiTaskStartRequest,
} from "@ai-corporation/protocols";
import type {
  PiEmployeeRepository,
  PiTaskRepository,
} from "@ai-corporation/storage";
import type { SkillLibrary } from "./skill-library";
import { createUuidV7 } from "./uuid-v7";

interface ActiveTask {
  readonly agent: Agent;
}

export class PiTaskService {
  readonly #active = new Map<string, ActiveTask>();
  readonly #toolStartedAt = new Map<string, number>();
  readonly #toolFailures = new Set<string>();

  constructor(
    private readonly options: {
      readonly employeeRepository: Pick<PiEmployeeRepository, "get">;
      readonly taskRepository: PiTaskRepository;
      readonly skillLibrary: SkillLibrary;
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
        ? this.options.taskRepository.getLatest(request.employeeId ?? "")
        : this.options.taskRepository.get(request.taskId);
    return task === undefined
      ? failure("NOT_FOUND")
      : { ok: true, value: task };
  }

  start(request: PiTaskStartRequest): PiTaskResult {
    try {
      const employee = this.options.employeeRepository.get(request.employeeId);
      if (employee === undefined) return failure("NOT_FOUND");
      if (
        [...this.#active.values()].some(({ agent }) => agent.state.isStreaming)
      ) {
        return failure("ALREADY_RUNNING");
      }
      const runtime = this.options.resolveRuntime(
        employee.providerId,
        employee.providerVersion,
        employee.modelId,
      );
      const task = this.options.taskRepository.create({
        id: (this.options.createId ?? createUuidV7)(),
        employeeId: employee.id,
        userInput: request.input,
        now: this.#now(),
      });
      void this.#run(task.id, employee, request.input, runtime);
      return { ok: true, value: task };
    } catch {
      return failure("EMPLOYEE_NOT_READY");
    }
  }

  cancel(request: PiTaskCommandRequest): PiTaskResult {
    const task = this.options.taskRepository.get(request.taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.status !== "RUNNING") return failure("INVALID_STATE");
    this.#active.get(task.id)?.agent.abort();
    const cancelled = this.options.taskRepository.setStatus(
      task.id,
      "CANCELLED",
      this.#now(),
      { failureMessage: "用户已停止任务。" },
    );
    return { ok: true, value: cancelled };
  }

  accept(request: PiTaskCommandRequest): PiTaskResult {
    return this.#transition(request.taskId, "WAITING_ACCEPTANCE", "COMPLETED");
  }

  requestChanges(request: PiTaskRequestChangesRequest): PiTaskResult {
    const task = this.options.taskRepository.get(request.taskId);
    if (task === undefined) return failure("NOT_FOUND");
    if (task.status !== "WAITING_ACCEPTANCE") return failure("INVALID_STATE");
    try {
      const employee = this.options.employeeRepository.get(task.employeeId);
      if (employee === undefined) return failure("NOT_FOUND");
      const runtime = this.options.resolveRuntime(
        employee.providerId,
        employee.providerVersion,
        employee.modelId,
      );
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
        `上一次结果：\n${task.finalOutput ?? ""}\n\n请继续修改。用户要求：${request.input}`,
        runtime,
      );
      return { ok: true, value: running };
    } catch {
      return failure("EMPLOYEE_NOT_READY");
    }
  }

  async #run(
    taskId: string,
    employee: NonNullable<ReturnType<PiEmployeeRepository["get"]>>,
    input: string,
    runtime: {
      readonly endpoint: string;
      readonly key: string;
      readonly timeoutMs: number;
    },
  ): Promise<void> {
    let finalOutput = "";
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
          tools: [createDemoTool()],
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
      this.#active.set(taskId, { agent });
      agent.subscribe((event) => {
        finalOutput = this.#recordAgentEvent(taskId, event, finalOutput);
      });
      this.#event(taskId, "PROGRESS", `${employee.name} 正在理解任务。`);
      await agent.prompt(input);
      if (agent.state.errorMessage !== undefined) {
        throw new Error(agent.state.errorMessage);
      }
      if (this.#toolFailures.delete(taskId)) {
        throw new Error("工具运行失败，请展开完整过程查看工具名称和原因。 ");
      }
      const current = this.options.taskRepository.get(taskId);
      if (current?.status === "RUNNING") {
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
      if (current?.status === "RUNNING") {
        this.options.taskRepository.setStatus(taskId, "FAILED", this.#now(), {
          failureMessage: hideSecret(readableError(error), runtime.key),
        });
      }
    } finally {
      this.#active.delete(taskId);
      this.#toolFailures.delete(taskId);
    }
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
    if (event.type === "tool_execution_end") {
      if (event.isError) this.#toolFailures.add(taskId);
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
    taskId: string,
    from: string,
    to: "COMPLETED" | "CHANGES_REQUESTED",
  ): PiTaskResult {
    const task = this.options.taskRepository.get(taskId);
    if (task === undefined) return failure("NOT_FOUND");
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
      | "TOOL_ERROR",
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

function createDemoTool(): AgentTool {
  const parameters = Type.Object({
    text: Type.String({ description: "需要检查的文本" }),
  });
  const tool: AgentTool<typeof parameters> = {
    name: "text_summary_check",
    label: "文本结果检查",
    description: "统计待检查文本的字符数和行数，不读取、写入或修改任何文件。",
    parameters,
    executionMode: "sequential",
    execute: async (_toolCallId, { text }) => ({
      content: [
        {
          type: "text",
          text: `检查完成：${text.length} 个字符，${text.split(/\r?\n/u).length} 行。`,
        },
      ],
      details: { characters: text.length, lines: text.split(/\r?\n/u).length },
    }),
  };
  return tool;
}

function buildSystemPrompt(employeeName: string, skill: string): string {
  return `你是 AI Corporation 的员工“${employeeName}”。\n\n${skill}\n\n请直接完成用户任务。完成正文后，必须调用 text_summary_check 检查你的结果，再根据检查结果给出最终答复。不要声称读写了文件，因为当前没有文件工具。`;
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
    | "ALREADY_RUNNING"
    | "INVALID_STATE"
    | "STORAGE_UNAVAILABLE"
    | "INTERNAL",
): PiTaskResult {
  return { ok: false, error: { code, message: "任务操作失败" } };
}
