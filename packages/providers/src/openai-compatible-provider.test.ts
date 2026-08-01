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
  });

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
