import {
  workspaceRevalidateRequestSchema,
  type WorkspaceListIpcResult,
  type WorkspaceRevalidateIpcResult,
} from "@ai-corporation/protocols";
import { failure, type WorkspaceService } from "./workspace-service";

type Service = Pick<WorkspaceService, "list" | "revalidate">;

export function handleWorkspaceList(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): WorkspaceListIpcResult {
  if (!authorized) {
    return failure("IPC_UNAUTHORIZED");
  }
  if (request !== undefined) {
    return failure("INVALID_REQUEST");
  }
  return service?.list() ?? failure("STORAGE_UNAVAILABLE");
}

export async function handleWorkspaceRevalidate(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<WorkspaceRevalidateIpcResult> {
  if (!authorized) {
    return failure("IPC_UNAUTHORIZED");
  }
  const parsed = workspaceRevalidateRequestSchema.safeParse(request);
  if (!parsed.success) {
    return failure("INVALID_REQUEST");
  }
  return (
    service?.revalidate(parsed.data.workspaceId) ??
    failure("STORAGE_UNAVAILABLE")
  );
}
