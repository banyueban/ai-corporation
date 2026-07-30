import {
  goalContractApproveRequestSchema,
  goalContractGetCurrentRequestSchema,
  goalContractListVersionsRequestSchema,
  goalContractSaveDraftRequestSchema,
  timelineListRequestSchema,
  type GoalContractItemResult,
  type GoalContractListResult,
  type GoalContractNullableItemResult,
  type TimelineListResult,
} from "@ai-corporation/protocols";
import {
  goalContractFailure,
  type GoalContractService,
} from "./goal-contract-service";

type Service = Pick<
  GoalContractService,
  "approve" | "getCurrent" | "listTimeline" | "listVersions" | "saveDraft"
>;

export function handleGoalContractSaveDraft(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalContractItemResult {
  if (!authorized) return goalContractFailure("UNAUTHORIZED_CALLER");
  const parsed = goalContractSaveDraftRequestSchema.safeParse(request);
  if (!parsed.success) return goalContractFailure("VALIDATION_FAILED");
  return (
    service?.saveDraft(parsed.data) ??
    goalContractFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalContractGetCurrent(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalContractNullableItemResult {
  if (!authorized) return goalContractFailure("UNAUTHORIZED_CALLER");
  const parsed = goalContractGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return goalContractFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ??
    goalContractFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalContractListVersions(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalContractListResult {
  if (!authorized) return goalContractFailure("UNAUTHORIZED_CALLER");
  const parsed = goalContractListVersionsRequestSchema.safeParse(request);
  if (!parsed.success) return goalContractFailure("VALIDATION_FAILED");
  return (
    service?.listVersions(parsed.data) ??
    goalContractFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalContractApprove(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalContractItemResult {
  if (!authorized) return goalContractFailure("UNAUTHORIZED_CALLER");
  const parsed = goalContractApproveRequestSchema.safeParse(request);
  if (!parsed.success) return goalContractFailure("VALIDATION_FAILED");
  return (
    service?.approve(parsed.data) ?? goalContractFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleTimelineList(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): TimelineListResult {
  if (!authorized) return goalContractFailure("UNAUTHORIZED_CALLER");
  const parsed = timelineListRequestSchema.safeParse(request);
  if (!parsed.success) return goalContractFailure("VALIDATION_FAILED");
  return (
    service?.listTimeline(parsed.data) ??
    goalContractFailure("STORAGE_UNAVAILABLE")
  );
}
