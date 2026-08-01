import type { ProviderModelDescriptor } from "@ai-corporation/protocols";
import {
  ProviderAdapterConfigError,
  ProviderAdapterError,
  type ModelProvider,
  type ProviderAdapterConfig,
  type ProviderFailure,
} from "./model-provider";

const MAX_RESPONSE_BYTES = 1024 * 1024;
const MAX_MODELS = 1_000;
const MAX_MODEL_ID_BYTES = 512;
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_BACKOFF_MS = 1_000;

type Fetch = typeof fetch;

export class OpenAiCompatibleProvider implements ModelProvider {
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
}

export function resolveModelsUrl(endpoint: string): URL {
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
  return new URL("models", url);
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
    throw adapterFailure("PROVIDER_INTERNAL", false);
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
        throw adapterFailure("PROVIDER_INTERNAL", false);
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
    throw adapterFailure("PROVIDER_INTERNAL", false);
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

function adapterFailureForResponse(
  response: Response,
  body: string,
): ProviderAdapterError {
  if (response.status === 401) return adapterFailure("AUTHENTICATION", false);
  if (response.status === 403) return adapterFailure("PERMISSION", false);
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
): ProviderAdapterError {
  return new ProviderAdapterError({
    reason,
    retryable,
    ...(suggestedBackoffMs === undefined ? {} : { suggestedBackoffMs }),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
