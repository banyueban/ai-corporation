import {
  executionStartGetCurrentRequestSchema,
  executionStartRequestSchema,
  type ExecutionStartItemResult,
  type ExecutionStartNullableItemResult,
} from "@ai-corporation/protocols";
import {
  executionStartFailure,
  type ExecutionStartService,
} from "./execution-start-service";

type Service = Pick<ExecutionStartService, "getCurrent" | "start">;
export function handleExecutionStart(
  authorized: boolean,
  request: unknown,
  service?: Service,
): ExecutionStartItemResult {
  if (!authorized) return executionStartFailure("UNAUTHORIZED_CALLER");
  const parsed = executionStartRequestSchema.safeParse(request);
  if (!parsed.success) return executionStartFailure("VALIDATION_FAILED");
  return (
    service?.start(parsed.data) ?? executionStartFailure("STORAGE_FAILURE")
  );
}
export function handleExecutionStartGetCurrent(
  authorized: boolean,
  request: unknown,
  service?: Service,
): ExecutionStartNullableItemResult {
  if (!authorized) return executionStartFailure("UNAUTHORIZED_CALLER");
  const parsed = executionStartGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return executionStartFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ?? executionStartFailure("STORAGE_FAILURE")
  );
}
