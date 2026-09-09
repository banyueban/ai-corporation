import {
  planReviewApproveRequestSchema,
  planReviewGetCurrentRequestSchema,
  planReviewListVersionsRequestSchema,
  planReviewSaveVersionRequestSchema,
  type PlanReviewItemResult,
  type PlanReviewListResult,
  type PlanReviewNullableItemResult,
} from "@ai-corporation/protocols";
import {
  planReviewFailure,
  type PlanReviewService,
} from "./plan-review-service";

type Service = Pick<
  PlanReviewService,
  "approve" | "getCurrent" | "listVersions" | "saveVersion"
>;

export function handlePlanReviewGetCurrent(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlanReviewNullableItemResult {
  if (!authorized) return planReviewFailure("UNAUTHORIZED_CALLER");
  const parsed = planReviewGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return planReviewFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ?? planReviewFailure("STORAGE_UNAVAILABLE")
  );
}

export function handlePlanReviewListVersions(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlanReviewListResult {
  if (!authorized) return planReviewFailure("UNAUTHORIZED_CALLER");
  const parsed = planReviewListVersionsRequestSchema.safeParse(request);
  if (!parsed.success) return planReviewFailure("VALIDATION_FAILED");
  return (
    service?.listVersions(parsed.data) ??
    planReviewFailure("STORAGE_UNAVAILABLE")
  );
}

export function handlePlanReviewSaveVersion(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlanReviewItemResult {
  if (!authorized) return planReviewFailure("UNAUTHORIZED_CALLER");
  const parsed = planReviewSaveVersionRequestSchema.safeParse(request);
  if (!parsed.success) return planReviewFailure("VALIDATION_FAILED");
  return (
    service?.saveVersion(parsed.data) ??
    planReviewFailure("STORAGE_UNAVAILABLE")
  );
}

export function handlePlanReviewApprove(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): PlanReviewItemResult {
  if (!authorized) return planReviewFailure("UNAUTHORIZED_CALLER");
  const parsed = planReviewApproveRequestSchema.safeParse(request);
  if (!parsed.success) return planReviewFailure("VALIDATION_FAILED");
  return (
    service?.approve(parsed.data) ?? planReviewFailure("STORAGE_UNAVAILABLE")
  );
}
