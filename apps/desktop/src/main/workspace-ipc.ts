import {
  workspaceRevalidateRequestSchema,
  type WorkspaceListIpcResult,
  type WorkspaceRevalidateIpcResult,
  type WorkspaceSelectIpcResult,
} from "@ai-corporation/protocols";
import type { WorkspaceDirectorySelector } from "./workspace-directory-selector";
import { failure, type WorkspaceService } from "./workspace-service";

type Service = Pick<
  WorkspaceService,
  "authorizeSelectedRoot" | "list" | "revalidate"
>;

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

export async function handleWorkspaceSelect(
  authorized: boolean,
  request: unknown,
  selector: WorkspaceDirectorySelector | undefined,
  service: Service | undefined,
): Promise<WorkspaceSelectIpcResult> {
  if (!authorized) {
    return failure("IPC_UNAUTHORIZED");
  }
  if (request !== undefined) {
    return failure("INVALID_REQUEST");
  }
  if (selector === undefined || service === undefined) {
    return failure("SELECTION_UNAVAILABLE");
  }

  let selectedPath: string | undefined;
  try {
    selectedPath = await selector.select();
  } catch {
    return failure("SELECTION_UNAVAILABLE");
  }
  if (selectedPath === undefined) {
    return {
      ok: true,
      value: { status: "CANCELLED" },
    };
  }
  return service.authorizeSelectedRoot(selectedPath);
}
