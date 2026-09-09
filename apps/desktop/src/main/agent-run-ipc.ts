import {
  agentRunCommandRequestSchema,
  agentRunGetCurrentRequestSchema,
  type AgentRunNullableResult,
  type AgentRunResult,
} from "@ai-corporation/protocols";
import { AgentRunService } from "./agent-run-service";
type Service = Pick<
  AgentRunService,
  "getCurrent" | "continue" | "retry" | "cancel"
>;
const invalid = (): AgentRunResult => ({
  ok: false,
  error: { code: "VALIDATION_FAILED", message: "Agent run operation failed" },
});
const unauthorized = (): AgentRunResult => ({
  ok: false,
  error: { code: "UNAUTHORIZED_CALLER", message: "Agent run operation failed" },
});
export function handleAgentRunGetCurrent(
  authorized: boolean,
  request: unknown,
  service?: Service,
): AgentRunNullableResult {
  if (!authorized) return unauthorized();
  const p = agentRunGetCurrentRequestSchema.safeParse(request);
  return p.success
    ? (service?.getCurrent(p.data.corporationId) ?? invalid())
    : invalid();
}
export function handleAgentRunContinue(
  authorized: boolean,
  request: unknown,
  service?: Service,
) {
  if (!authorized) return unauthorized();
  const p = agentRunCommandRequestSchema.safeParse(request);
  return p.success ? (service?.continue(p.data) ?? invalid()) : invalid();
}
export function handleAgentRunRetry(
  authorized: boolean,
  request: unknown,
  service?: Service,
) {
  if (!authorized) return unauthorized();
  const p = agentRunCommandRequestSchema.safeParse(request);
  return p.success ? (service?.retry(p.data) ?? invalid()) : invalid();
}
export function handleAgentRunCancel(
  authorized: boolean,
  request: unknown,
  service?: Service,
) {
  if (!authorized) return unauthorized();
  const p = agentRunCommandRequestSchema.safeParse(request);
  return p.success ? (service?.cancel(p.data) ?? invalid()) : invalid();
}
