import { describe, expect, it, vi } from "vitest";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { ProviderAdapterError } from "./model-provider";
import { DeterministicMockProvider } from "./mock-provider";
import {
  OpenAiCompatibleProvider,
  resolveModelsUrl,
} from "./openai-compatible-provider";

const config = {
  endpoint: "https://api.example.test/v1",
  key: "M2-TU-03-fake-adapter-key",
};
const generationConfig = { ...config, generationTimeoutMs: 60_000 };
const generationRequest = {
  modelId: "gpt-test",
  input: [
    {
      actor: "USER" as const,
      parts: [
        { kind: "TEXT" as const, text: "Return a short acknowledgement." },
      ],
    },
  ],
  maxOutputTokens: 32,
  temperature: 0,
};
const jsonGenerationRequest = {
  ...generationRequest,
  maxOutputTokens: 65_536,
  outputFormat: "JSON_OBJECT" as const,
};
const observedAt = "2026-08-02T01:00:00.000Z";

describe("OpenAiCompatibleProvider", () => {
  it("allows remote HTTPS and exact loopback HTTP and resolves models", () => {
    expect(resolveModelsUrl("https://api.example.test/v1").href).toBe(
      "https://api.example.test/v1/models",
    );
    expect(resolveModelsUrl("http://localhost:1234/v1").href).toBe(
      "http://localhost:1234/v1/models",
    );
    expect(resolveModelsUrl("http://127.0.0.1/v1").href).toBe(
      "http://127.0.0.1/v1/models",
    );
    expect(resolveModelsUrl("http://[::1]/v1").href).toBe(
      "http://[::1]/v1/models",
    );
  });

  it.each([
    "file:///tmp/provider",
    "ftp://example.test/v1",
    "http://example.test/v1",
    "http://127.1/v1",
    "http://2130706433/v1",
    "https://user:password@example.test/v1",
    "https://example.test/v1?target=other",
    "https://example.test/v1#fragment",
  ])("rejects unsafe Endpoint %s", (endpoint) => {
    expect(() => resolveModelsUrl(endpoint)).toThrow(
      "Provider configuration is invalid",
    );
  });

  it("sends one non-generating request and normalizes unique models", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe("https://api.example.test/v1/models");
      expect(init?.method).toBe("GET");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${config.key}`,
      );
      return new Response(
        JSON.stringify({
          data: [{ id: "gpt-test" }, { id: "gpt-test" }, { id: "gpt-next" }],
        }),
        { status: 200 },
      );
    });
    const provider = new OpenAiCompatibleProvider({
      fetch,
      clock: () => observedAt,
    });
    await expect(
      provider.listModels(config, new AbortController().signal),
    ).resolves.toEqual([
      {
        id: "gpt-test",
        displayName: "gpt-test",
        source: "PROVIDER",
        observedAt,
      },
      {
        id: "gpt-next",
        displayName: "gpt-next",
        source: "PROVIDER",
        observedAt,
      },
    ]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    [401, {}, "AUTHENTICATION", false],
    [403, {}, "PERMISSION", false],
    [429, { error: { code: "insufficient_quota" } }, "QUOTA_EXHAUSTED", false],
    [429, { error: { code: "rate_limit" } }, "RATE_LIMIT", true],
    [400, {}, "INVALID_REQUEST", false],
    [503, {}, "PROVIDER_INTERNAL", true],
  ] as const)("maps HTTP %s to %s", async (status, body, reason, retryable) => {
    const provider = new OpenAiCompatibleProvider({
      fetch: async () =>
        new Response(JSON.stringify(body), {
          status,
          headers: status === 429 ? { "retry-after": "2" } : {},
        }),
    });
    await expectFailure(provider, reason, retryable);
  });

  it("maps transport, timeout, cancellation, invalid JSON and oversize body", async () => {
    await expectFailure(
      new OpenAiCompatibleProvider({
        fetch: async () => {
          throw new TypeError("M2-TU-03 synthetic network failure");
        },
      }),
      "NETWORK",
      true,
    );

    const timeoutProvider = new OpenAiCompatibleProvider({
      timeoutMs: 5,
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("abort")),
          );
        }),
    });
    await expectFailure(timeoutProvider, "TIMEOUT", true);

    const controller = new AbortController();
    controller.abort();
    await expectFailure(
      new OpenAiCompatibleProvider({ fetch: async () => new Response("{}") }),
      "CANCELLED",
      false,
      controller.signal,
    );

    await expectFailure(
      new OpenAiCompatibleProvider({
        fetch: async () => new Response("not-json", { status: 200 }),
      }),
      "PROVIDER_INTERNAL",
      false,
    );
    await expectFailure(
      new OpenAiCompatibleProvider({
        fetch: async () =>
          new Response("x", {
            status: 200,
            headers: { "content-length": String(1024 * 1024 + 1) },
          }),
      }),
      "PROVIDER_INTERNAL",
      false,
    );
    for (const body of [
      JSON.stringify({
        data: Array.from({ length: 1_001 }, (_, id) => ({ id: String(id) })),
      }),
      JSON.stringify({ data: [{ id: "" }] }),
      JSON.stringify({ data: [{ id: "密".repeat(171) }] }),
    ]) {
      await expectFailure(
        new OpenAiCompatibleProvider({
          fetch: async () => new Response(body, { status: 200 }),
        }),
        "PROVIDER_INTERNAL",
        false,
      );
    }
    await expectFailure(
      new OpenAiCompatibleProvider({
        fetch: async () => new Response("x".repeat(1024 * 1024 + 1)),
      }),
      "PROVIDER_INTERNAL",
      false,
    );
  });

  it.each(["DNS", "TLS", "socket"])(
    "normalizes %s transport failures without exposing details",
    async (kind) => {
      await expectFailure(
        new OpenAiCompatibleProvider({
          fetch: async () => {
            throw new Error(`M2-TU-03 synthetic ${kind} detail`);
          },
        }),
        "NETWORK",
        true,
      );
    },
  );

  it("keeps the deterministic Mock interchangeable and out of HTTP", async () => {
    const mock = new DeterministicMockProvider(
      { type: "SUCCESS", modelIds: ["mock-a", "mock-a", "mock-b"] },
      () => observedAt,
    );
    expect(mock.descriptor().type).toBe("MOCK");
    await expect(
      mock.listModels(config, new AbortController().signal),
    ).resolves.toHaveLength(2);
    await expect(
      mock.generate(
        generationConfig,
        generationRequest,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({ modelId: "gpt-test", stopReason: "COMPLETED" });
  });

  it("maps a non-streaming Chat Completions call inside the Adapter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      expect(String(input)).toBe(
        "https://api.example.test/v1/chat/completions",
      );
      expect(init?.method).toBe("POST");
      expect(init?.redirect).toBe("error");
      expect(new Headers(init?.headers).get("authorization")).toBe(
        `Bearer ${config.key}`,
      );
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toEqual({
        model: "gpt-test",
        messages: [
          { role: "user", content: "Return a short acknowledgement." },
        ],
        max_tokens: 32,
        temperature: 0,
        stream: false,
      });
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: "Acknowledged." }, finish_reason: "stop" },
          ],
          usage: {
            prompt_tokens: 7,
            completion_tokens: 3,
            prompt_cache_hit_tokens: 2,
            completion_tokens_details: { reasoning_tokens: 1 },
          },
        }),
        { status: 200 },
      );
    });
    const provider = new OpenAiCompatibleProvider({ fetch });
    expect(provider.descriptor().dialect).toBe("CHAT_COMPLETIONS");
    await expect(
      provider.generate(
        generationConfig,
        generationRequest,
        new AbortController().signal,
      ),
    ).resolves.toEqual({
      modelId: "gpt-test",
      outputParts: [{ kind: "TEXT", text: "Acknowledged." }],
      stopReason: "COMPLETED",
      usage: {
        inputTokens: 7,
        outputTokens: 3,
        cachedInputTokens: 2,
        reasoningTokens: 1,
        costSource: "UNKNOWN",
      },
    });
  });

  it("maps the dialect-neutral JSON object constraint inside the Chat Adapter", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      expect(body).toMatchObject({
        max_tokens: 65_536,
        response_format: { type: "json_object" },
        stream: false,
      });
      expect(body).not.toHaveProperty("outputFormat");
      return new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"ok":true}' }, finish_reason: "stop" },
          ],
        }),
        { status: 200 },
      );
    });
    await expect(
      new OpenAiCompatibleProvider({ fetch }).generate(
        generationConfig,
        jsonGenerationRequest,
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      outputParts: [{ kind: "TEXT", text: '{"ok":true}' }],
    });
  });

  it("rejects invalid generation responses and normalizes model/content errors", async () => {
    for (const [body, diagnostic] of [
      [{}, "INVALID_RESPONSE_SHAPE"],
      [{ choices: [] }, "INVALID_RESPONSE_SHAPE"],
      [
        { choices: [{ message: { content: "" }, finish_reason: "stop" }] },
        "EMPTY_OUTPUT",
      ],
      [
        { choices: [{ message: { content: null }, finish_reason: "length" }] },
        "OUTPUT_LIMIT_WITHOUT_OUTPUT",
      ],
      [
        {
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
          usage: { prompt_tokens: -1 },
        },
        "INVALID_USAGE",
      ],
    ] as const) {
      await expectGenerationFailure(
        new OpenAiCompatibleProvider({
          fetch: async () =>
            new Response(JSON.stringify(body), { status: 200 }),
        }),
        "PROVIDER_INTERNAL",
        false,
        new AbortController().signal,
        generationConfig,
        diagnostic,
      );
    }
    await expectGenerationFailure(
      new OpenAiCompatibleProvider({
        fetch: async () => new Response("{}", { status: 404 }),
      }),
      "MODEL_NOT_FOUND",
      false,
    );
    await expectGenerationFailure(
      new OpenAiCompatibleProvider({
        fetch: async () =>
          new Response(JSON.stringify({ error: { code: "content_filter" } }), {
            status: 400,
          }),
      }),
      "CONTENT_FILTER",
      false,
    );
  });

  it("applies the configured generation deadline and user cancellation", async () => {
    const provider = new OpenAiCompatibleProvider({
      fetch: async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () =>
            reject(new Error("abort")),
          );
        }),
    });
    await expectGenerationFailure(
      provider,
      "TIMEOUT",
      true,
      new AbortController().signal,
      { ...generationConfig, generationTimeoutMs: 5_000 },
    );
  }, 7_000);

  it("uses a real dynamic loopback server and never follows a redirect with Authorization", async () => {
    await withLoopbackServer(
      async (request, response) => {
        expect(request.url).toBe("/v1/models");
        expect(request.headers.authorization).toBe(`Bearer ${config.key}`);
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [{ id: "loopback-model" }] }));
      },
      async (endpoint) => {
        const provider = new OpenAiCompatibleProvider({
          clock: () => observedAt,
        });
        await expect(
          provider.listModels(
            { ...config, endpoint: `${endpoint}/v1` },
            new AbortController().signal,
          ),
        ).resolves.toMatchObject([{ id: "loopback-model" }]);
      },
    );

    let redirectedRequests = 0;
    await withLoopbackServer(
      (request, response) => {
        if (request.url === "/redirect/models") {
          response.writeHead(302, { location: "/capture" });
          response.end();
          return;
        }
        redirectedRequests += 1;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify({ data: [] }));
      },
      async (endpoint) => {
        const provider = new OpenAiCompatibleProvider();
        await expectFailure(
          provider,
          "NETWORK",
          true,
          new AbortController().signal,
          { ...config, endpoint: `${endpoint}/redirect` },
        );
      },
    );
    expect(redirectedRequests).toBe(0);
  });
});

async function expectFailure(
  provider: OpenAiCompatibleProvider,
  reason: string,
  retryable: boolean,
  signal: AbortSignal = new AbortController().signal,
  providerConfig = config,
): Promise<void> {
  try {
    await provider.listModels(providerConfig, signal);
    throw new Error("Expected Provider failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderAdapterError);
    if (!(error instanceof ProviderAdapterError)) throw error;
    expect(error.failure).toMatchObject({ reason, retryable });
    expect(JSON.stringify(error)).not.toContain(config.key);
  }
}

async function expectGenerationFailure(
  provider: OpenAiCompatibleProvider,
  reason: string,
  retryable: boolean,
  signal: AbortSignal = new AbortController().signal,
  providerConfig = generationConfig,
  diagnostic?: string,
): Promise<void> {
  try {
    await provider.generate(providerConfig, generationRequest, signal);
    throw new Error("Expected Provider generation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderAdapterError);
    if (!(error instanceof ProviderAdapterError)) throw error;
    expect(error.failure).toMatchObject({ reason, retryable });
    if (diagnostic !== undefined) expect(error.diagnostic).toBe(diagnostic);
    expect(JSON.stringify(error)).not.toContain(config.key);
  }
}

async function withLoopbackServer(
  handler: (request: IncomingMessage, response: ServerResponse) => void,
  test: (endpoint: string) => Promise<void>,
): Promise<void> {
  const server = createServer(handler);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  try {
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Loopback fixture did not expose a TCP port");
    }
    await test(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) =>
        error === undefined ? resolve() : reject(error),
      );
    });
  }
}
