import { createHash } from "node:crypto";
import {
  goalEngineModelOutputSchema,
  normalizedUsageSchema,
  type GoalEngineAnswerRequest,
  type GoalEngineCancelRequest,
  type GoalEngineErrorCode,
  type GoalEngineGetCurrentRequest,
  type GoalEngineItemResult,
  type GoalEngineModelOutput,
  type GoalEngineNullableItemResult,
  type GoalEngineResolveExtensionRequest,
  type GoalEngineStartRequest,
  type NormalizedGenerationResponse,
  type NormalizedGenerationRequest,
  type NormalizedUsage,
} from "@ai-corporation/protocols";
import { ProviderAdapterError } from "@ai-corporation/providers";
import {
  GoalEngineCommandConflictError,
  GoalEngineDataError,
  GoalEngineNotFoundError,
  GoalEngineProviderUnavailableError,
  GoalEngineRepository,
  GoalEngineStateConflictError,
  GoalEngineVersionConflictError,
  type GoalEngineStoredOperation,
} from "@ai-corporation/storage";
import {
  ProviderRuntimeUnavailableError,
  type ProviderService,
} from "./provider-service";
import { createUuidV7 } from "./uuid-v7";

const SYSTEM_PROMPT = `AI Corporation Goal Engine v1. Return exactly one JSON object and no markdown.
Derive a complete Goal Contract draft from the supplied Corporation name, user Goal fields, and clarification transcript.
Do not claim an unresolved high-impact fact is confirmed. Model assumptions must always use confirmed=false.
Ask at most 5 distinct HIGH-impact questions. Use this exact shape:
{"draft":{"statement":"...","successCriteria":["..."],"inScope":[],"outOfScope":[],"constraints":[],"assumptions":[{"text":"...","impact":"LOW|MEDIUM|HIGH","confirmed":false}],"deliverables":[],"riskLevel":"LOW|MEDIUM|HIGH|CRITICAL","budget":{"currency":"USD","hardLimitMicros":"0","warningThresholdPercent":80},"stopConditions":[]},"unresolvedQuestions":[{"text":"...","impact":"HIGH"}]}`;

const REPAIR_PROMPT = `Your previous response did not satisfy the required strict JSON Schema. Return one corrected JSON object only. Do not use markdown fences or commentary.`;
const UNKNOWN_USAGE: NormalizedUsage = { costSource: "UNKNOWN" };

type Repository = Pick<
  GoalEngineRepository,
  | "begin"
  | "beginAnswer"
  | "cancel"
  | "continueCycle"
  | "fail"
  | "finishModelCall"
  | "getCurrent"
  | "getPublic"
  | "nextAttempt"
  | "saveExtensionDraft"
  | "saveStage"
  | "startModelCall"
>;

type Generator = Pick<ProviderService, "generate">;

export class GoalEngineService {
  readonly #active = new Map<string, AbortController>();
  readonly #clock: () => string;
  readonly #provider: Generator;
  readonly #repository: Repository;
  readonly #uuid: () => string;

  constructor(options: {
    readonly clock?: () => string;
    readonly provider: Generator;
    readonly repository: Repository;
    readonly uuid?: () => string;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#provider = options.provider;
    this.#repository = options.repository;
    this.#uuid = options.uuid ?? createUuidV7;
  }

  async start(request: GoalEngineStartRequest): Promise<GoalEngineItemResult> {
    try {
      const operation = this.#repository.begin({
        operationId: request.operationId,
        corporationId: request.corporationId,
        expectedCorporationVersion: request.expectedCorporationVersion,
        expectedGoalVersion: request.expectedGoalVersion,
        providerId: request.providerId,
        expectedProviderVersion: request.expectedProviderVersion,
        requestHash: hashRequest(request),
        goalInput: request.input,
        now: this.#clock(),
      });
      if (
        operation.status !== "GENERATING" ||
        this.#active.has(operation.operationId)
      ) {
        return {
          ok: true,
          value: this.#repository.getPublic(operation.operationId),
        };
      }
      return await this.#generateStage(operation);
    } catch (error) {
      return goalEngineFailure(mapCommandError(error));
    }
  }

  async answer(
    request: GoalEngineAnswerRequest,
  ): Promise<GoalEngineItemResult> {
    try {
      const operation = this.#repository.beginAnswer({
        operationId: request.operationId,
        expectedVersion: request.expectedOperationVersion,
        answers: request.answers,
        now: this.#clock(),
      });
      return await this.#generateStage(operation);
    } catch (error) {
      return goalEngineFailure(mapCommandError(error));
    }
  }

  resolveExtension(
    request: GoalEngineResolveExtensionRequest,
  ): GoalEngineItemResult {
    try {
      if (request.decision === "CONTINUE") {
        return {
          ok: true,
          value: this.#repository.continueCycle({
            operationId: request.operationId,
            expectedVersion: request.expectedOperationVersion,
            now: this.#clock(),
          }),
        };
      }
      if (request.decision === "SAVE_DRAFT") {
        return {
          ok: true,
          value: this.#repository.saveExtensionDraft({
            operationId: request.operationId,
            expectedVersion: request.expectedOperationVersion,
            eventId: this.#uuid(),
            now: this.#clock(),
          }),
        };
      }
      return this.#cancelOperation(request.operationId);
    } catch (error) {
      return goalEngineFailure(mapCommandError(error));
    }
  }

  cancel(request: GoalEngineCancelRequest): GoalEngineItemResult {
    try {
      return this.#cancelOperation(request.operationId);
    } catch (error) {
      return goalEngineFailure(mapCommandError(error));
    }
  }

  getCurrent(
    request: GoalEngineGetCurrentRequest,
  ): GoalEngineNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return goalEngineFailure(mapCommandError(error));
    }
  }

  #cancelOperation(operationId: string): GoalEngineItemResult {
    this.#active.get(operationId)?.abort();
    return {
      ok: true,
      value: this.#repository.cancel({ operationId, now: this.#clock() }),
    };
  }

  async #generateStage(
    operation: GoalEngineStoredOperation,
  ): Promise<GoalEngineItemResult> {
    const controller = new AbortController();
    this.#active.set(operation.operationId, controller);
    let usage = operation.usage;
    try {
      const first = await this.#call(
        operation,
        false,
        this.#baseInput(operation),
        controller.signal,
      );
      usage = addUsage(usage, first.response.usage);
      let parsed = parseOutput(first.response);
      if (parsed === undefined) {
        const repair = await this.#call(
          operation,
          true,
          this.#repairInput(operation, first.response),
          controller.signal,
        );
        usage = addUsage(usage, repair.response.usage);
        parsed = parseOutput(repair.response);
      }
      if (parsed === undefined) {
        return {
          ok: true,
          value: this.#repository.fail({
            operationId: operation.operationId,
            expectedVersion: operation.version,
            reason: "INVALID_MODEL_OUTPUT",
            usage,
            now: this.#clock(),
          }),
        };
      }
      return {
        ok: true,
        value: this.#repository.saveStage({
          operationId: operation.operationId,
          expectedVersion: operation.version,
          draft: parsed.draft,
          questions: parsed.unresolvedQuestions.map((question) => ({
            questionId: this.#uuid(),
            ...question,
          })),
          usage,
          eventId: this.#uuid(),
          now: this.#clock(),
        }),
      };
    } catch (error) {
      if (controller.signal.aborted) {
        return this.#currentOrFailure(operation.operationId, "CANCELLED");
      }
      if (
        error instanceof GoalEngineVersionConflictError ||
        error instanceof GoalEngineStateConflictError
      ) {
        return this.#currentOrFailure(
          operation.operationId,
          "VERSION_CONFLICT",
        );
      }
      const reason =
        error instanceof ProviderRuntimeUnavailableError
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_FAILURE";
      try {
        return {
          ok: true,
          value: this.#repository.fail({
            operationId: operation.operationId,
            expectedVersion: operation.version,
            reason,
            usage,
            now: this.#clock(),
          }),
        };
      } catch {
        return goalEngineFailure("STORAGE_UNAVAILABLE");
      }
    } finally {
      if (this.#active.get(operation.operationId) === controller) {
        this.#active.delete(operation.operationId);
      }
    }
  }

  async #call(
    operation: GoalEngineStoredOperation,
    repair: boolean,
    input: NormalizedGenerationRequest["input"],
    signal: AbortSignal,
  ): Promise<{ readonly response: NormalizedGenerationResponse }> {
    const id = this.#uuid();
    const attempt = this.#repository.nextAttempt(operation.operationId);
    this.#repository.startModelCall({
      id,
      operation,
      attempt,
      repair,
      now: this.#clock(),
    });
    try {
      const response = await this.#provider.generate(
        {
          providerId: operation.providerId,
          expectedVersion: operation.providerVersion,
          generation: {
            input: [...input],
            maxOutputTokens: 4_096,
            temperature: 0,
          },
        },
        signal,
      );
      this.#repository.finishModelCall({
        id,
        status: "SUCCEEDED",
        usage: response.usage,
        now: this.#clock(),
      });
      return { response };
    } catch (error) {
      const cancelled =
        signal.aborted ||
        (error instanceof ProviderAdapterError &&
          error.failure.reason === "CANCELLED");
      this.#repository.finishModelCall({
        id,
        status: cancelled ? "CANCELLED" : "FAILED",
        usage: UNKNOWN_USAGE,
        failureReason: cancelled ? "CANCELLED" : "PROVIDER_FAILURE",
        now: this.#clock(),
      });
      throw error;
    }
  }

  #baseInput(
    operation: GoalEngineStoredOperation,
  ): NormalizedGenerationRequest["input"] {
    return [
      textItem("SYSTEM" as const, SYSTEM_PROMPT),
      textItem(
        "USER" as const,
        JSON.stringify({
          corporationName: operation.corporationName,
          goal: operation.input,
          clarificationTranscript: operation.answers.map(
            ({ question, answer }) => ({
              question,
              answer,
            }),
          ),
        }),
      ),
    ];
  }

  #repairInput(
    operation: GoalEngineStoredOperation,
    response: NormalizedGenerationResponse,
  ): NormalizedGenerationRequest["input"] {
    const base = this.#baseInput(operation);
    const raw = response.outputParts.map(({ text }) => text).join("\n");
    const withRaw =
      raw.length <= 32_768 ? [textItem("ASSISTANT" as const, raw)] : [];
    return [...base, ...withRaw, textItem("USER" as const, REPAIR_PROMPT)];
  }

  #currentOrFailure(
    operationId: string,
    code: GoalEngineErrorCode,
  ): GoalEngineItemResult {
    try {
      return { ok: true, value: this.#repository.getPublic(operationId) };
    } catch {
      return goalEngineFailure(code);
    }
  }
}

export function goalEngineFailure(code: GoalEngineErrorCode): {
  readonly ok: false;
  readonly error: {
    readonly code: GoalEngineErrorCode;
    readonly message: string;
  };
} {
  const messages: Record<GoalEngineErrorCode, string> = {
    VALIDATION_FAILED: "Goal analysis request is invalid.",
    UNAUTHORIZED_CALLER: "Goal analysis request is not allowed.",
    NOT_FOUND: "Goal analysis resource was not found.",
    VERSION_CONFLICT: "Goal analysis facts changed. Reload and retry.",
    STATE_CONFLICT: "Goal analysis state does not allow this action.",
    INCOMPLETE_ANSWERS: "All current clarification questions must be answered.",
    PROVIDER_UNAVAILABLE: "The selected Provider cannot analyze this Goal.",
    CANCELLED: "Goal analysis was cancelled.",
    STORAGE_UNAVAILABLE: "Goal analysis storage is unavailable.",
  };
  return { ok: false, error: { code, message: messages[code] } };
}

function parseOutput(
  response: NormalizedGenerationResponse,
): GoalEngineModelOutput | undefined {
  const raw = response.outputParts.map(({ text }) => text).join("\n");
  if (new TextEncoder().encode(raw).byteLength > 1_048_576) return undefined;
  try {
    return goalEngineModelOutputSchema.parse(JSON.parse(raw) as unknown);
  } catch {
    return undefined;
  }
}

function addUsage(
  left: NormalizedUsage,
  right: NormalizedUsage,
): NormalizedUsage {
  if (hasNoMeasurements(left)) return normalizedUsageSchema.parse(right);
  const summed = {
    inputTokens: sumOptional(left.inputTokens, right.inputTokens),
    outputTokens: sumOptional(left.outputTokens, right.outputTokens),
    cachedInputTokens: sumOptional(
      left.cachedInputTokens,
      right.cachedInputTokens,
    ),
    reasoningTokens: sumOptional(left.reasoningTokens, right.reasoningTokens),
  };
  const knownCosts =
    left.costMicros !== undefined && right.costMicros !== undefined;
  return normalizedUsageSchema.parse({
    ...Object.fromEntries(
      Object.entries(summed).filter(([, value]) => value !== undefined),
    ),
    ...(knownCosts
      ? {
          costMicros: (
            BigInt(left.costMicros!) + BigInt(right.costMicros!)
          ).toString(),
        }
      : {}),
    costSource:
      knownCosts && left.costSource === right.costSource
        ? left.costSource
        : "UNKNOWN",
  });
}

function hasNoMeasurements(usage: NormalizedUsage): boolean {
  return (
    usage.inputTokens === undefined &&
    usage.outputTokens === undefined &&
    usage.cachedInputTokens === undefined &&
    usage.reasoningTokens === undefined &&
    usage.costMicros === undefined
  );
}

function sumOptional(left: number | undefined, right: number | undefined) {
  return left === undefined || right === undefined ? undefined : left + right;
}

function textItem<T extends "SYSTEM" | "USER" | "ASSISTANT">(
  actor: T,
  text: string,
) {
  return { actor, parts: [{ kind: "TEXT" as const, text }] };
}

function hashRequest(value: GoalEngineStartRequest): string {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function mapCommandError(error: unknown): GoalEngineErrorCode {
  if (error instanceof GoalEngineNotFoundError) return "NOT_FOUND";
  if (error instanceof GoalEngineVersionConflictError)
    return "VERSION_CONFLICT";
  if (error instanceof GoalEngineCommandConflictError) return "STATE_CONFLICT";
  if (error instanceof GoalEngineProviderUnavailableError)
    return "PROVIDER_UNAVAILABLE";
  if (error instanceof GoalEngineStateConflictError) return "STATE_CONFLICT";
  if (error instanceof GoalEngineDataError) return "STORAGE_UNAVAILABLE";
  return "STORAGE_UNAVAILABLE";
}
