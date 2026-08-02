import {
  providerCancelConnectionTestRequestSchema,
  type ProviderCancelConnectionTestResult,
  providerCancelGenerationTestRequestSchema,
  type ProviderCancelGenerationTestResult,
  type ProviderConnectionTestResult,
  type ProviderGenerationTestResult,
  providerDeleteKeyRequestSchema,
  type ProviderItemResult,
  providerListRequestSchema,
  type ProviderListResult,
  providerRevealKeyRequestSchema,
  type ProviderRevealKeyResult,
  providerSaveRequestSchema,
  providerTestConnectionRequestSchema,
  providerTestGenerationRequestSchema,
} from "@ai-corporation/protocols";
import { providerFailure, type ProviderService } from "./provider-service";

export function handleProviderList(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "list"> | undefined,
): ProviderListResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerListRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return service?.list() ?? providerFailure("STORAGE_UNAVAILABLE");
}

export function handleProviderSave(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "save"> | undefined,
): ProviderItemResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerSaveRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return service?.save(parsed.data) ?? providerFailure("STORAGE_UNAVAILABLE");
}

export function handleProviderRevealKey(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "revealKey"> | undefined,
): ProviderRevealKeyResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerRevealKeyRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return (
    service?.revealKey(parsed.data) ?? providerFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleProviderDeleteKey(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "deleteKey"> | undefined,
): ProviderItemResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerDeleteKeyRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return (
    service?.deleteKey(parsed.data) ?? providerFailure("STORAGE_UNAVAILABLE")
  );
}

export async function handleProviderTestConnection(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "testConnection"> | undefined,
): Promise<ProviderConnectionTestResult> {
  if (!authorized) return connectionFailure("UNAUTHORIZED_CALLER");
  const parsed = providerTestConnectionRequestSchema.safeParse(request);
  if (!parsed.success) return connectionFailure("INVALID_REQUEST");
  return (
    service?.testConnection(parsed.data) ??
    connectionFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleProviderCancelConnectionTest(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "cancelConnectionTest"> | undefined,
): ProviderCancelConnectionTestResult {
  if (!authorized) return cancellationFailure("UNAUTHORIZED_CALLER");
  const parsed = providerCancelConnectionTestRequestSchema.safeParse(request);
  if (!parsed.success) return cancellationFailure("INVALID_REQUEST");
  return (
    service?.cancelConnectionTest(parsed.data) ??
    cancellationFailure("STORAGE_UNAVAILABLE")
  );
}

export async function handleProviderTestGeneration(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "testGeneration"> | undefined,
): Promise<ProviderGenerationTestResult> {
  if (!authorized) return generationFailure("UNAUTHORIZED_CALLER");
  const parsed = providerTestGenerationRequestSchema.safeParse(request);
  if (!parsed.success) return generationFailure("INVALID_REQUEST");
  return (
    service?.testGeneration(parsed.data) ??
    generationFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleProviderCancelGenerationTest(
  authorized: boolean,
  request: unknown,
  service: Pick<ProviderService, "cancelGenerationTest"> | undefined,
): ProviderCancelGenerationTestResult {
  if (!authorized) return generationCancellationFailure("UNAUTHORIZED_CALLER");
  const parsed = providerCancelGenerationTestRequestSchema.safeParse(request);
  if (!parsed.success) return generationCancellationFailure("INVALID_REQUEST");
  return (
    service?.cancelGenerationTest(parsed.data) ??
    generationCancellationFailure("STORAGE_UNAVAILABLE")
  );
}

function connectionFailure(
  code: "UNAUTHORIZED_CALLER" | "INVALID_REQUEST" | "STORAGE_UNAVAILABLE",
): ProviderConnectionTestResult {
  return {
    ok: false,
    error: { code, message: "Provider connection test failed" },
  };
}

function cancellationFailure(
  code: "UNAUTHORIZED_CALLER" | "INVALID_REQUEST" | "STORAGE_UNAVAILABLE",
): ProviderCancelConnectionTestResult {
  return {
    ok: false,
    error: {
      code,
      message: "Provider connection test cancellation failed",
    },
  };
}

function generationFailure(
  code: "UNAUTHORIZED_CALLER" | "INVALID_REQUEST" | "STORAGE_UNAVAILABLE",
): ProviderGenerationTestResult {
  return {
    ok: false,
    error: { code, message: "Provider generation test failed" },
  };
}

function generationCancellationFailure(
  code: "UNAUTHORIZED_CALLER" | "INVALID_REQUEST" | "STORAGE_UNAVAILABLE",
): ProviderCancelGenerationTestResult {
  return {
    ok: false,
    error: {
      code,
      message: "Provider generation test cancellation failed",
    },
  };
}
