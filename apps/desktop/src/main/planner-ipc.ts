import {
  plannerCancelRequestSchema,
  plannerGetCurrentRequestSchema,
  plannerStartRequestSchema,
  type PlannerItemResult,
  type PlannerNullableItemResult,
} from "@ai-corporation/protocols";
import { plannerFailure, type PlannerService } from "./planner-service";

type Service = Pick<PlannerService, "cancel" | "getCurrent" | "start">;

export async function handlePlannerStart(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<PlannerItemResult> {
  if (!authorized) return plannerFailure("UNAUTHORIZED_CALLER");
  const parsed = plannerStartRequestSchema.safeParse(request);
  if (!parsed.success) return plannerFailure("VALIDATION_FAILED");
  return service?.start(parsed.data) ?? plannerFailure("STORAGE_UNAVAILABLE");
}

export function handlePlannerCancel(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlannerItemResult {
  if (!authorized) return plannerFailure("UNAUTHORIZED_CALLER");
  const parsed = plannerCancelRequestSchema.safeParse(request);
  if (!parsed.success) return plannerFailure("VALIDATION_FAILED");
  return service?.cancel(parsed.data) ?? plannerFailure("STORAGE_UNAVAILABLE");
}

export function handlePlannerGetCurrent(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlannerNullableItemResult {
  if (!authorized) return plannerFailure("UNAUTHORIZED_CALLER");
  const parsed = plannerGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return plannerFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ?? plannerFailure("STORAGE_UNAVAILABLE")
  );
}
