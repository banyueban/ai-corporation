import {
  normalizedGenerationResponseSchema,
  type NormalizedGenerationRequest,
  type NormalizedGenerationResponse,
  type ProviderFailureDiagnostic,
  type ProviderModelDescriptor,
} from "@ai-corporation/protocols";
import {
  ProviderAdapterConfigError,
  ProviderAdapterError,
  type ModelProvider,
  type ProviderAdapterConfig,
  type ProviderFailure,
  type ProviderGenerationConfig,
} from "./model-provider";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODELS = 1_000;
const MAX_MODEL_ID_BYTES = 512;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;

type Fetch = typeof fetch;

export class OpenAiChatCompletionsAdapter implements ModelProvider {
  readonly #clock: () => string;
  readonly #fetch: Fetch;
  readonly #timeoutMs: number;

  constructor(
    options: {
      readonly clock?: () => string;
      readonly fetch?: Fetch;
      readonly timeoutMs?: number;
    } = {},
  ) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  descriptor() {
    return {
      type: "OPENAI_COMPATIBLE" as const,
      displayName: "OpenAI-compatible",
      dialect: "CHAT_COMPLETIONS" as const,
    };
  }

  validateConfig(config: ProviderAdapterConfig): void {
    resolveModelsUrl(config.endpoint);
    if (config.key.length === 0) throw new ProviderAdapterConfigError();
  }

  async listModels(
    config: ProviderAdapterConfig,
    signal: AbortSignal,
  ): Promise<readonly ProviderModelDescriptor[]> {
    this.validateConfig(config);
    if (signal.aborted) throw adapterFailure("CANCELLED", false);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.#timeoutMs);
    try {
      const response = await this.#fetch(resolveModelsUrl(config.endpoint), {
        method: "GET",
        headers: {
          accept: "application/json",
          authorization: `Bearer ${config.key}`,
        },
        redirect: "error",
        signal: controller.signal,
      });
      const body = await readLimitedBody(response);
      if (!response.ok) throw adapterFailureForResponse(response, body);
      return parseModels(body, this.#clock());
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      if (signal.aborted) throw adapterFailure("CANCELLED", false);
      if (timedOut) {
        throw adapterFailure("TIMEOUT", true, DEFAULT_RETRY_BACKOFF_MS);
      }
      throw adapterFailure("NETWORK", true, DEFAULT_RETRY_BACKOFF_MS);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }

  async generate(
    config: ProviderGenerationConfig,
    request: NormalizedGenerationRequest,
    signal: AbortSignal,
  ): Promise<NormalizedGenerationResponse> {
    this.validateConfig(config);
    if (
      !Number.isInteger(config.generationTimeoutMs) ||
      config.generationTimeoutMs < 5_000 ||
      config.generationTimeoutMs > 300_000
    ) {
      throw new ProviderAdapterConfigError();
    }
    if (signal.aborted) throw adapterFailure("CANCELLED", false);
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, config.generationTimeoutMs);
    try {
      const response = await this.#fetch(
        resolveApiUrl(config.endpoint, "chat/completions"),
        {
          method: "POST",
          headers: {
            accept: "application/json",
            authorization: `Bearer ${config.key}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: request.modelId,
            messages: request.input.map(({ actor, parts }) => ({
              role: actor.toLowerCase(),
              content: parts.map(({ text }) => text).join(""),
            })),
            max_tokens: request.maxOutputTokens,
            ...(request.outputFormat === "JSON_OBJECT"
              ? { response_format: { type: "json_object" } }
              : {}),
            ...(request.temperature === undefined
              ? {}
              : { temperature: request.temperature }),
            stream: false,
          }),
          redirect: "error",
          signal: controller.signal,
        },
      );
      const body = await readLimitedBody(response);
      if (!response.ok) throw adapterFailureForResponse(response, body);
      return parseGeneration(body, request.modelId);
    } catch (error) {
      if (error instanceof ProviderAdapterError) throw error;
      if (signal.aborted) throw adapterFailure("CANCELLED", false);
      if (timedOut) {
        throw adapterFailure("TIMEOUT", true, DEFAULT_RETRY_BACKOFF_MS);
      }
      throw adapterFailure("NETWORK", true, DEFAULT_RETRY_BACKOFF_MS);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
}

export { OpenAiChatCompletionsAdapter as OpenAiCompatibleProvider };

export function resolveModelsUrl(endpoint: string): URL {
  return resolveApiUrl(endpoint, "models");
}

export function resolveApiUrl(endpoint: string, relativePath: string): URL {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new ProviderAdapterConfigError();
  }
  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new ProviderAdapterConfigError();
  }
  if (url.protocol === "http:" && !isExactLoopbackHttp(endpoint)) {
    throw new ProviderAdapterConfigError();
  }
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return new URL(relativePath, url);
}

function isExactLoopbackHttp(endpoint: string): boolean {
  return /^http:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/iu.test(
    endpoint,
  );
}

async function readLimitedBody(response: Response): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (
    contentLength !== null &&
    Number.isFinite(Number(contentLength)) &&
    Number(contentLength) > MAX_RESPONSE_BYTES
  ) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "RESPONSE_TOO_LARGE",
    );
  }
  if (response.body === null) return "";
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      length += result.value.byteLength;
      if (length > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        throw adapterFailure(
          "PROVIDER_INTERNAL",
          false,
          undefined,
          "RESPONSE_TOO_LARGE",
        );
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw adapterFailure("PROVIDER_INTERNAL", false, undefined, "INVALID_UTF8");
  }
}

function parseModels(
  body: string,
  observedAt: string,
): readonly ProviderModelDescriptor[] {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw adapterFailure("PROVIDER_INTERNAL", false);
  }
  if (!isRecord(payload) || !Array.isArray(payload.data)) {
    throw adapterFailure("PROVIDER_INTERNAL", false);
  }
  if (payload.data.length > MAX_MODELS) {
    throw adapterFailure("PROVIDER_INTERNAL", false);
  }
  const seen = new Set<string>();
  const models: ProviderModelDescriptor[] = [];
  for (const item of payload.data) {
    if (
      !isRecord(item) ||
      typeof item.id !== "string" ||
      item.id.length === 0 ||
      new TextEncoder().encode(item.id).byteLength > MAX_MODEL_ID_BYTES
    ) {
      throw adapterFailure("PROVIDER_INTERNAL", false);
    }
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    models.push({
      id: item.id,
      displayName: item.id,
      source: "PROVIDER",
      observedAt,
    });
  }
  return models;
}

function parseGeneration(
  body: string,
  modelId: string,
): NormalizedGenerationResponse {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    throw adapterFailure("PROVIDER_INTERNAL", false, undefined, "INVALID_JSON");
  }
  if (!isRecord(payload) || !Array.isArray(payload.choices)) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_RESPONSE_SHAPE",
    );
  }
  if (payload.choices.length !== 1) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_RESPONSE_SHAPE",
    );
  }
  const choice = payload.choices[0];
  if (!isRecord(choice) || !isRecord(choice.message)) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_RESPONSE_SHAPE",
    );
  }
  if (
    typeof choice.message.content !== "string" ||
    choice.message.content.length === 0
  ) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      choice.finish_reason === "length"
        ? "OUTPUT_LIMIT_WITHOUT_OUTPUT"
        : "EMPTY_OUTPUT",
    );
  }
  if (
    new TextEncoder().encode(choice.message.content).byteLength >
    MAX_RESPONSE_BYTES
  ) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "RESPONSE_TOO_LARGE",
    );
  }
  const candidate = {
    modelId,
    outputParts: [{ kind: "TEXT", text: choice.message.content }],
    stopReason: mapStopReason(choice.finish_reason),
    usage: parseUsage(payload.usage),
  };
  const parsed = normalizedGenerationResponseSchema.safeParse(candidate);
  if (!parsed.success) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_RESPONSE_SHAPE",
    );
  }
  return parsed.data;
}

function mapStopReason(value: unknown) {
  if (value === "stop") return "COMPLETED" as const;
  if (value === "length") return "OUTPUT_LIMIT" as const;
  if (value === "content_filter") return "CONTENT_FILTER" as const;
  return "UNKNOWN" as const;
}

function parseUsage(value: unknown) {
  if (value === undefined || value === null) {
    return { costSource: "UNKNOWN" as const };
  }
  if (!isRecord(value)) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_USAGE",
    );
  }
  const promptTokens = optionalSafeToken(value.prompt_tokens);
  const completionTokens = optionalSafeToken(value.completion_tokens);
  const cachedInputTokens = optionalSafeToken(value.prompt_cache_hit_tokens);
  let reasoningTokens: number | undefined;
  if (value.completion_tokens_details !== undefined) {
    if (!isRecord(value.completion_tokens_details)) {
      throw adapterFailure(
        "PROVIDER_INTERNAL",
        false,
        undefined,
        "INVALID_USAGE",
      );
    }
    reasoningTokens = optionalSafeToken(
      value.completion_tokens_details.reasoning_tokens,
    );
  }
  return {
    ...(promptTokens === undefined ? {} : { inputTokens: promptTokens }),
    ...(completionTokens === undefined
      ? {}
      : { outputTokens: completionTokens }),
    ...(cachedInputTokens === undefined ? {} : { cachedInputTokens }),
    ...(reasoningTokens === undefined ? {} : { reasoningTokens }),
    costSource: "UNKNOWN" as const,
  };
}

function optionalSafeToken(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw adapterFailure(
      "PROVIDER_INTERNAL",
      false,
      undefined,
      "INVALID_USAGE",
    );
  }
  return value as number;
}

function adapterFailureForResponse(
  response: Response,
  body: string,
): ProviderAdapterError {
  if (response.status === 401) return adapterFailure("AUTHENTICATION", false);
  if (response.status === 403) return adapterFailure("PERMISSION", false);
  if (response.status === 404 || readErrorCode(body) === "model_not_found") {
    return adapterFailure("MODEL_NOT_FOUND", false);
  }
  if (readErrorCode(body) === "content_filter") {
    return adapterFailure("CONTENT_FILTER", false);
  }
  if (response.status === 429) {
    if (readErrorCode(body) === "insufficient_quota") {
      return adapterFailure("QUOTA_EXHAUSTED", false);
    }
    return adapterFailure(
      "RATE_LIMIT",
      true,
      readRetryAfter(response) ?? DEFAULT_RETRY_BACKOFF_MS,
    );
  }
  if (response.status >= 400 && response.status < 500) {
    return adapterFailure("INVALID_REQUEST", false);
  }
  if (response.status >= 500) {
    return adapterFailure(
      "PROVIDER_INTERNAL",
      true,
      readRetryAfter(response) ?? DEFAULT_RETRY_BACKOFF_MS,
      "HTTP_SERVER_ERROR",
    );
  }
  return adapterFailure("PROVIDER_INTERNAL", false);
}

function readErrorCode(body: string): string | undefined {
  try {
    const payload: unknown = JSON.parse(body);
    if (!isRecord(payload) || !isRecord(payload.error)) return undefined;
    return typeof payload.error.code === "string"
      ? payload.error.code
      : undefined;
  } catch {
    return undefined;
  }
}

function readRetryAfter(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (value === null || !/^\d+$/u.test(value)) return undefined;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds)) return undefined;
  return Math.min(seconds * 1_000, 60_000);
}

function adapterFailure(
  reason: ProviderFailure["reason"],
  retryable: boolean,
  suggestedBackoffMs?: number,
  diagnostic?: ProviderFailureDiagnostic,
): ProviderAdapterError {
  return new ProviderAdapterError(
    {
      reason,
      retryable,
      ...(suggestedBackoffMs === undefined ? {} : { suggestedBackoffMs }),
    },
    diagnostic,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
