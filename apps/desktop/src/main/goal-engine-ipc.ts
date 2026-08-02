import {
  goalEngineAnswerRequestSchema,
  goalEngineCancelRequestSchema,
  goalEngineGetCurrentRequestSchema,
  goalEngineResolveExtensionRequestSchema,
  goalEngineStartRequestSchema,
  type GoalEngineItemResult,
  type GoalEngineNullableItemResult,
} from "@ai-corporation/protocols";
import {
  goalEngineFailure,
  type GoalEngineService,
} from "./goal-engine-service";

type Service = Pick<
  GoalEngineService,
  "answer" | "cancel" | "getCurrent" | "resolveExtension" | "start"
>;

export async function handleGoalEngineStart(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<GoalEngineItemResult> {
  if (!authorized) return goalEngineFailure("UNAUTHORIZED_CALLER");
  const parsed = goalEngineStartRequestSchema.safeParse(request);
  if (!parsed.success) return goalEngineFailure("VALIDATION_FAILED");
  return (
    service?.start(parsed.data) ?? goalEngineFailure("STORAGE_UNAVAILABLE")
  );
}

export async function handleGoalEngineAnswer(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<GoalEngineItemResult> {
  if (!authorized) return goalEngineFailure("UNAUTHORIZED_CALLER");
  const parsed = goalEngineAnswerRequestSchema.safeParse(request);
  if (!parsed.success) return goalEngineFailure("VALIDATION_FAILED");
  return (
    service?.answer(parsed.data) ?? goalEngineFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalEngineResolveExtension(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalEngineItemResult {
  if (!authorized) return goalEngineFailure("UNAUTHORIZED_CALLER");
  const parsed = goalEngineResolveExtensionRequestSchema.safeParse(request);
  if (!parsed.success) return goalEngineFailure("VALIDATION_FAILED");
  return (
    service?.resolveExtension(parsed.data) ??
    goalEngineFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalEngineCancel(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalEngineItemResult {
  if (!authorized) return goalEngineFailure("UNAUTHORIZED_CALLER");
  const parsed = goalEngineCancelRequestSchema.safeParse(request);
  if (!parsed.success) return goalEngineFailure("VALIDATION_FAILED");
  return (
    service?.cancel(parsed.data) ?? goalEngineFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleGoalEngineGetCurrent(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): GoalEngineNullableItemResult {
  if (!authorized) return goalEngineFailure("UNAUTHORIZED_CALLER");
  const parsed = goalEngineGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return goalEngineFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ?? goalEngineFailure("STORAGE_UNAVAILABLE")
  );
}
