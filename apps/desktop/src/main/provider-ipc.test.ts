import { describe, expect, it, vi } from "vitest";
import type { ProviderPublic } from "@ai-corporation/protocols";
import {
  handleProviderDeleteKey,
  handleProviderList,
  handleProviderRevealKey,
  handleProviderSave,
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
});
