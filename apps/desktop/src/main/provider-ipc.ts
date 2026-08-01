import {
  providerDeleteKeyRequestSchema,
  type ProviderItemResult,
  providerListRequestSchema,
  type ProviderListResult,
  providerRevealKeyRequestSchema,
  type ProviderRevealKeyResult,
  providerSaveRequestSchema,
} from "@ai-corporation/protocols";
import { providerFailure, type ProviderService } from "./provider-service";

type Service = Pick<
  ProviderService,
  "deleteKey" | "list" | "revealKey" | "save"
>;

export function handleProviderList(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): ProviderListResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerListRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return service?.list() ?? providerFailure("STORAGE_UNAVAILABLE");
}

export function handleProviderSave(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): ProviderItemResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerSaveRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return service?.save(parsed.data) ?? providerFailure("STORAGE_UNAVAILABLE");
}

export function handleProviderRevealKey(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
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
  service: Service | undefined,
): ProviderItemResult {
  if (!authorized) return providerFailure("UNAUTHORIZED_CALLER");
  const parsed = providerDeleteKeyRequestSchema.safeParse(request);
  if (!parsed.success) return providerFailure("INVALID_REQUEST");
  return (
    service?.deleteKey(parsed.data) ?? providerFailure("STORAGE_UNAVAILABLE")
  );
}
