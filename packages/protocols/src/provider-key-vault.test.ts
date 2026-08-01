import { describe, expect, it } from "vitest";
import {
  providerListRequestSchema,
  providerPublicSchema,
  providerSaveRequestSchema,
} from "./provider-key-vault";

const commandId = "019b7f4d-a000-7000-8000-000000000001";
const providerId = "019b7f4d-a000-7000-8000-000000000002";

describe("Provider Key Vault protocol", () => {
  it("accepts a strict create request", () => {
    expect(
      providerSaveRequestSchema.parse({
        schemaVersion: 1,
        commandId,
        name: "Primary",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
        key: "M2-TU-02-fake-key",
      }),
    ).toMatchObject({ name: "Primary", key: "M2-TU-02-fake-key" });
  });

  it("requires key on create and version on update", () => {
    expect(
      providerSaveRequestSchema.safeParse({
        schemaVersion: 1,
        commandId,
        name: "Primary",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
      }).success,
    ).toBe(false);
    expect(
      providerSaveRequestSchema.safeParse({
        schemaVersion: 1,
        commandId,
        providerId,
        name: "Primary",
        endpoint: "https://api.example.test/v1",
        configStatus: "ENABLED",
      }).success,
    ).toBe(false);
  });

  it("rejects excess fields, bad URLs, and keys over 16 KiB UTF-8", () => {
    const base = {
      schemaVersion: 1 as const,
      commandId,
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED" as const,
      key: "fake",
    };
    expect(
      providerSaveRequestSchema.safeParse({ ...base, secret: "leak" }).success,
    ).toBe(false);
    expect(
      providerSaveRequestSchema.safeParse({ ...base, endpoint: "not a url" })
        .success,
    ).toBe(false);
    for (const endpoint of [
      "http://remote.example.test/v1",
      "http://127.1/v1",
      "https://user:pass@example.test/v1",
      "https://example.test/v1?redirect=1",
      "https://example.test/v1#fragment",
    ]) {
      expect(
        providerSaveRequestSchema.safeParse({ ...base, endpoint }).success,
      ).toBe(false);
    }
    expect(
      providerSaveRequestSchema.safeParse({
        ...base,
        endpoint: "http://127.0.0.1:1234/v1",
      }).success,
    ).toBe(true);
    expect(
      providerSaveRequestSchema.safeParse({ ...base, key: "密".repeat(5_462) })
        .success,
    ).toBe(false);
  });

  it("keeps public values masked and strict", () => {
    const value = {
      schemaVersion: 1 as const,
      id: providerId,
      type: "OPENAI_COMPATIBLE" as const,
      name: "Primary",
      endpoint: "https://api.example.test/v1",
      configStatus: "ENABLED" as const,
      hasKey: true,
      version: 1,
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    expect(providerPublicSchema.parse(value)).toEqual(value);
    expect(
      providerPublicSchema.safeParse({ ...value, key: "not-public" }).success,
    ).toBe(false);
    expect(
      providerListRequestSchema.safeParse({ schemaVersion: 1, extra: true })
        .success,
    ).toBe(false);
  });
});
