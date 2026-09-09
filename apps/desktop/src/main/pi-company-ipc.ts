import {
  piCompanyCreateRequestSchema,
  piCompanyEmployeeRequestSchema,
  piCompanyListRequestSchema,
  piCompanyUpdateNameRequestSchema,
  piCompanyWorkspaceRequestSchema,
  type PiCompanyItemResult,
  type PiCompanyListResult,
} from "@ai-corporation/protocols";
import type { PiCompanyService } from "./pi-company-service";

export function handlePiCompanyList(
  authorized: boolean,
  request: unknown,
  service?: PiCompanyService,
): PiCompanyListResult {
  if (!authorized) return listFailure("UNAUTHORIZED_CALLER");
  if (!piCompanyListRequestSchema.safeParse(request).success) {
    return listFailure("INVALID_REQUEST");
  }
  return service?.list() ?? listFailure("STORAGE_UNAVAILABLE");
}

export function handlePiCompany(
  action:
    | "create"
    | "updateName"
    | "addEmployee"
    | "removeEmployee"
    | "addWorkspace"
    | "removeWorkspace",
  authorized: boolean,
  request: unknown,
  service?: PiCompanyService,
): PiCompanyItemResult {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  if (service === undefined) return failure("STORAGE_UNAVAILABLE");
  if (action === "create") {
    const parsed = piCompanyCreateRequestSchema.safeParse(request);
    return parsed.success
      ? service.create(parsed.data)
      : failure("INVALID_REQUEST");
  }
  if (action === "updateName") {
    const parsed = piCompanyUpdateNameRequestSchema.safeParse(request);
    return parsed.success
      ? service.updateName(parsed.data)
      : failure("INVALID_REQUEST");
  }
  if (action === "addEmployee" || action === "removeEmployee") {
    const parsed = piCompanyEmployeeRequestSchema.safeParse(request);
    return parsed.success
      ? service.changeEmployee(parsed.data, action === "addEmployee")
      : failure("INVALID_REQUEST");
  }
  const parsed = piCompanyWorkspaceRequestSchema.safeParse(request);
  return parsed.success
    ? service.changeWorkspace(parsed.data, action === "addWorkspace")
    : failure("INVALID_REQUEST");
}

function failure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "STORAGE_UNAVAILABLE",
): PiCompanyItemResult {
  return { ok: false, error: { code, message: "公司操作失败" } };
}

function listFailure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "STORAGE_UNAVAILABLE",
): PiCompanyListResult {
  return { ok: false, error: { code, message: "公司操作失败" } };
}
