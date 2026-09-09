import {
  piEmployeeListRequestSchema,
  piEmployeeSaveRequestSchema,
  type PiEmployeeItemResult,
  type PiEmployeeListResult,
} from "@ai-corporation/protocols";
import type { PiEmployeeService } from "./pi-employee-service";

export function handlePiEmployeeList(
  authorized: boolean,
  request: unknown,
  service: PiEmployeeService | undefined,
): PiEmployeeListResult {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  if (!piEmployeeListRequestSchema.safeParse(request).success) {
    return failure("INVALID_REQUEST");
  }
  return service?.list() ?? failure("STORAGE_UNAVAILABLE");
}

export async function handlePiEmployeeSave(
  authorized: boolean,
  request: unknown,
  service: PiEmployeeService | undefined,
): Promise<PiEmployeeItemResult> {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  const parsed = piEmployeeSaveRequestSchema.safeParse(request);
  if (!parsed.success) return failure("INVALID_REQUEST");
  return service?.save(parsed.data) ?? failure("STORAGE_UNAVAILABLE");
}

function failure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "STORAGE_UNAVAILABLE",
): PiEmployeeItemResult & PiEmployeeListResult {
  return { ok: false, error: { code, message: "员工操作失败" } };
}
