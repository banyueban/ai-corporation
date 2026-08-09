import { describe, expect, it } from "vitest";
import {
  normalizedGenerationRequestSchema,
  normalizedGenerationResponseSchema,
  providerCancelGenerationTestRequestSchema,
  providerGenerationTestResultSchema,
  providerTestGenerationRequestSchema,
} from "./provider-generation";

const requestId = "019b7f4d-a000-7000-8000-000000000071";
const providerId = "019b7f4d-a000-7000-8000-000000000072";
const input = [
  { actor: "USER" as const, parts: [{ kind: "TEXT" as const, text: "Test" }] },
];

describe("Provider generation protocol", () => {
  it("accepts dialect-neutral strict requests and cancellation", () => {
    expect(
      providerTestGenerationRequestSchema.parse({
        schemaVersion: 1,
        requestId,
        providerId,
        expectedVersion: 2,
        input,
        maxOutputTokens: 32,
        temperature: 0,
      }),
    ).toMatchObject({ requestId, providerId, input });
    expect(
      providerCancelGenerationTestRequestSchema.parse({
        schemaVersion: 1,
        requestId,
      }),
    ).toEqual({ schemaVersion: 1, requestId });
    expect(
      normalizedGenerationRequestSchema.parse({
        modelId: "model",
        input,
        maxOutputTokens: 65_536,
        outputFormat: "JSON_OBJECT",
      }),
    ).toMatchObject({
      maxOutputTokens: 65_536,
      outputFormat: "JSON_OBJECT",
    });
  });

  it("rejects transport fields, provider overrides and Chat-specific DTO", () => {
    const valid = {
      schemaVersion: 1,
      requestId,
      providerId,
      expectedVersion: 1,
      input,
      maxOutputTokens: 32,
    };
    for (const extra of [
      { modelId: "override" },
      { endpoint: "https://attacker.invalid" },
      { authorization: "Bearer secret" },
      { apiDialect: "RESPONSES" },
      { messages: [] },
      { stream: true },
    ]) {
      expect(
        providerTestGenerationRequestSchema.safeParse({ ...valid, ...extra })
          .success,
      ).toBe(false);
    }
  });

  it("enforces input, output and usage limits", () => {
    expect(
      normalizedGenerationRequestSchema.safeParse({
        modelId: "model",
        input: [
          {
            actor: "USER",
            parts: [{ kind: "TEXT", text: "x".repeat(65_537) }],
          },
        ],
        maxOutputTokens: 32,
      }).success,
    ).toBe(false);
    expect(
      normalizedGenerationRequestSchema.safeParse({
        modelId: "model",
        input,
        maxOutputTokens: 65_537,
        outputFormat: "JSON_OBJECT",
      }).success,
    ).toBe(false);
    expect(
      normalizedGenerationRequestSchema.safeParse({
        modelId: "model",
        input,
        maxOutputTokens: 65_536,
        outputFormat: "CHAT_JSON_MODE",
      }).success,
    ).toBe(false);
    for (const usage of [
      { inputTokens: -1, costSource: "UNKNOWN" },
      { outputTokens: 1.5, costSource: "UNKNOWN" },
      { costMicros: "1.2", costSource: "PROVIDER" },
    ]) {
      expect(
        normalizedGenerationResponseSchema.safeParse({
          modelId: "model",
          outputParts: [{ kind: "TEXT", text: "ok" }],
          stopReason: "COMPLETED",
          usage,
        }).success,
      ).toBe(false);
    }
  });

  it("accepts only normalized completed snapshots", () => {
    const result = {
      ok: true as const,
      value: {
        status: "SUCCEEDED" as const,
        providerVersion: 1,
        modelId: "model",
        outputPreview: "ok",
        stopReason: "COMPLETED" as const,
        usage: {
          inputTokens: 2,
          outputTokens: 1,
          costSource: "UNKNOWN" as const,
        },
        completedAt: "2026-08-02T04:00:00.000Z",
      },
    };
    expect(providerGenerationTestResultSchema.parse(result)).toEqual(result);
    expect(
      providerGenerationTestResultSchema.safeParse({
        ...result,
        value: { ...result.value, choices: [] },
      }).success,
    ).toBe(false);
  });
});
