import { describe, expect, it, vi } from "vitest";
import type { ProviderPublic } from "@ai-corporation/protocols";
import {
  handleProviderCancelConnectionTest,
  handleProviderCancelGenerationTest,
  handleProviderDeleteKey,
  handleProviderList,
  handleProviderRevealKey,
  handleProviderSave,
  handleProviderTestConnection,
  handleProviderTestGeneration,
} from "./provider-ipc";

const provider: ProviderPublic = {
  schemaVersion: 1,
  id: "019b7f4d-a000-7000-8000-000000000051",
  type: "OPENAI_COMPATIBLE",
  name: "Primary",
  endpoint: "https://api.example.test/v1",
  configStatus: "ENABLED",
  hasKey: true,
  version: 1,
  createdAt: "2026-08-02T00:00:00.000Z",
  updatedAt: "2026-08-02T00:00:00.000Z",
};

const service = {
  cancelConnectionTest: vi.fn(() => ({
    ok: true as const,
    value: {
      schemaVersion: 1 as const,
      requestId: "019b7f4d-a000-7000-8000-000000000054",
      cancelled: true as const,
    },
  })),
  cancelGenerationTest: vi.fn(() => ({
    ok: true as const,
    value: {
      schemaVersion: 1 as const,
      requestId: "019b7f4d-a000-7000-8000-000000000055",
      cancelled: true as const,
    },
  })),
  list: vi.fn(() => ({ ok: true as const, value: [provider] })),
  save: vi.fn(() => ({ ok: true as const, value: provider })),
  revealKey: vi.fn(() => ({
    ok: true as const,
    value: {
      schemaVersion: 1 as const,
      providerId: provider.id,
      key: "M2-TU-02-fake-ipc-key",
    },
  })),
  deleteKey: vi.fn(() => ({
    ok: true as const,
    value: { ...provider, hasKey: false, version: 2 },
  })),
  testConnection: vi.fn(async () => ({
    ok: true as const,
    value: {
      status: "VERIFIED" as const,
      providerVersion: 1,
      testedAt: "2026-08-02T00:00:00.000Z",
      models: [],
    },
  })),
  testGeneration: vi.fn(async () => ({
    ok: true as const,
    value: {
      status: "SUCCEEDED" as const,
      providerVersion: 1,
      modelId: "fixture-model-a",
      outputPreview: "Acknowledged.",
      stopReason: "COMPLETED" as const,
      usage: {
        inputTokens: 8,
        outputTokens: 2,
        costSource: "UNKNOWN" as const,
      },
      completedAt: "2026-08-02T00:00:00.000Z",
    },
  })),
};

describe("Provider IPC", () => {
  it("rejects unauthorized and malformed calls before the service", () => {
    expect(
      handleProviderList(false, { schemaVersion: 1 }, service),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
    expect(
      handleProviderSave(true, { schemaVersion: 1, key: "secret" }, service),
    ).toMatchObject({ ok: false, error: { code: "INVALID_REQUEST" } });
    expect(service.save).not.toHaveBeenCalled();
  });

  it("routes strict list, save, reveal, and delete requests", () => {
    expect(handleProviderList(true, { schemaVersion: 1 }, service).ok).toBe(
      true,
    );
    expect(
      handleProviderSave(
        true,
        {
          schemaVersion: 1,
          commandId: "019b7f4d-a000-7000-8000-000000000052",
          name: "Primary",
          endpoint: "https://api.example.test/v1",
          configStatus: "ENABLED",
          key: "M2-TU-02-fake-ipc-key",
        },
        service,
      ).ok,
    ).toBe(true);
    expect(
      handleProviderRevealKey(
        true,
        { schemaVersion: 1, providerId: provider.id },
        service,
      ),
    ).toMatchObject({ ok: true, value: { key: "M2-TU-02-fake-ipc-key" } });
    expect(
      handleProviderDeleteKey(
        true,
        {
          schemaVersion: 1,
          commandId: "019b7f4d-a000-7000-8000-000000000053",
          providerId: provider.id,
          expectedVersion: 1,
        },
        service,
      ).ok,
    ).toBe(true);
  });

  it("routes strict connection tests and cancellation without accepting URLs or Keys", async () => {
    const requestId = "019b7f4d-a000-7000-8000-000000000054";
    await expect(
      handleProviderTestConnection(
        true,
        {
          schemaVersion: 1,
          requestId,
          providerId: provider.id,
          expectedVersion: 1,
        },
        service,
      ),
    ).resolves.toMatchObject({ ok: true, value: { status: "VERIFIED" } });
    expect(
      handleProviderCancelConnectionTest(
        true,
        { schemaVersion: 1, requestId },
        service,
      ),
    ).toMatchObject({ ok: true, value: { cancelled: true } });
    await expect(
      handleProviderTestConnection(
        true,
        {
          schemaVersion: 1,
          requestId,
          providerId: provider.id,
          expectedVersion: 1,
          endpoint: "https://attacker.invalid",
          key: "leak",
        },
        service,
      ),
    ).resolves.toMatchObject({
      ok: false,
      error: { code: "INVALID_REQUEST" },
    });
    expect(
      handleProviderCancelConnectionTest(
        false,
        { schemaVersion: 1, requestId },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
  });

  it("routes generic generation and rejects forged transport and Chat fields", async () => {
    const requestId = "019b7f4d-a000-7000-8000-000000000055";
    const request = {
      schemaVersion: 1,
      requestId,
      providerId: provider.id,
      expectedVersion: 1,
      input: [{ actor: "USER", parts: [{ kind: "TEXT", text: "Test" }] }],
      maxOutputTokens: 32,
      temperature: 0,
    };
    await expect(
      handleProviderTestGeneration(true, request, service),
    ).resolves.toMatchObject({ ok: true, value: { status: "SUCCEEDED" } });
    expect(
      handleProviderCancelGenerationTest(
        true,
        { schemaVersion: 1, requestId },
        service,
      ),
    ).toMatchObject({ ok: true, value: { cancelled: true } });

    for (const forged of [
      { endpoint: "https://attacker.invalid" },
      { key: "leak" },
      { model: "forged-model" },
      { messages: [{ role: "user", content: "chat-only" }] },
      { stream: true },
      { headers: { authorization: "Bearer leak" } },
      { apiDialect: "RESPONSES" },
    ]) {
      await expect(
        handleProviderTestGeneration(true, { ...request, ...forged }, service),
      ).resolves.toMatchObject({
        ok: false,
        error: { code: "INVALID_REQUEST" },
      });
    }
    expect(
      handleProviderCancelGenerationTest(
        false,
        { schemaVersion: 1, requestId },
        service,
      ),
    ).toMatchObject({ ok: false, error: { code: "UNAUTHORIZED_CALLER" } });
  });
});
