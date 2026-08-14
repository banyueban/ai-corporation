import {
  piTaskCommandRequestSchema,
  piTaskGetRequestSchema,
  piTaskRequestChangesRequestSchema,
  piTaskStartRequestSchema,
  type PiTaskResult,
} from "@ai-corporation/protocols";
import type { PiTaskService } from "./pi-task-service";

const invalid = (): PiTaskResult => ({
  ok: false,
  error: { code: "INVALID_REQUEST", message: "任务操作失败" },
});
const unauthorized = (): PiTaskResult => ({
  ok: false,
  error: { code: "UNAUTHORIZED_CALLER", message: "任务操作失败" },
});

export function handlePiTask(
  action: "start" | "get" | "cancel" | "accept" | "requestChanges",
  authorized: boolean,
  request: unknown,
  service?: PiTaskService,
): PiTaskResult {
  if (!authorized) return unauthorized();
  if (service === undefined) return invalid();
  if (action === "start") {
    const parsed = piTaskStartRequestSchema.safeParse(request);
    return parsed.success ? service.start(parsed.data) : invalid();
  }
  if (action === "get") {
    const parsed = piTaskGetRequestSchema.safeParse(request);
    return parsed.success ? service.get(parsed.data) : invalid();
  }
  if (action === "requestChanges") {
    const parsed = piTaskRequestChangesRequestSchema.safeParse(request);
    return parsed.success ? service.requestChanges(parsed.data) : invalid();
  }
  const parsed = piTaskCommandRequestSchema.safeParse(request);
  if (!parsed.success) return invalid();
  return action === "cancel"
    ? service.cancel(parsed.data)
    : service.accept(parsed.data);
}
