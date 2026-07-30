import {
  corporationPauseRequestSchema,
  corporationResumeRequestSchema,
  type CorporationItemResult,
} from "@ai-corporation/protocols";
import { corporationFailure } from "./corporation-service";
import type { CorporationStateService } from "./corporation-state-service";

type Service = Pick<CorporationStateService, "pause" | "resume">;

export function handleCorporationPause(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<CorporationItemResult> {
  if (!authorized) {
    return Promise.resolve(corporationFailure("UNAUTHORIZED_CALLER"));
  }
  const parsed = corporationPauseRequestSchema.safeParse(request);
  if (!parsed.success) {
    return Promise.resolve(corporationFailure("VALIDATION_FAILED"));
  }
  return (
    service?.pause(parsed.data) ??
    Promise.resolve(corporationFailure("STORAGE_UNAVAILABLE"))
  );
}

export function handleCorporationResume(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<CorporationItemResult> {
  if (!authorized) {
    return Promise.resolve(corporationFailure("UNAUTHORIZED_CALLER"));
  }
  const parsed = corporationResumeRequestSchema.safeParse(request);
  if (!parsed.success) {
    return Promise.resolve(corporationFailure("VALIDATION_FAILED"));
  }
  return (
    service?.resume(parsed.data) ??
    Promise.resolve(corporationFailure("STORAGE_UNAVAILABLE"))
  );
}
