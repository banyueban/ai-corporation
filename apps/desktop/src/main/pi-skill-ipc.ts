import {
  piSkillConfirmImportRequestSchema,
  piSkillListRequestSchema,
  type PiSkillItemResult,
  type PiSkillListResult,
  type PiSkillPreviewImportResult,
} from "@ai-corporation/protocols";
import type { PiSkillService } from "./pi-skill-service";

export async function handlePiSkillList(
  authorized: boolean,
  request: unknown,
  service: PiSkillService | undefined,
): Promise<PiSkillListResult> {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  if (!piSkillListRequestSchema.safeParse(request).success) {
    return failure("INVALID_REQUEST");
  }
  return service?.list() ?? failure("STORAGE_UNAVAILABLE");
}

export async function handlePiSkillPreviewImport(
  authorized: boolean,
  request: unknown,
  service: PiSkillService | undefined,
): Promise<PiSkillPreviewImportResult> {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  if (!piSkillListRequestSchema.safeParse(request).success) {
    return failure("INVALID_REQUEST");
  }
  return service?.previewImport() ?? failure("STORAGE_UNAVAILABLE");
}

export async function handlePiSkillConfirmImport(
  authorized: boolean,
  request: unknown,
  service: PiSkillService | undefined,
): Promise<PiSkillItemResult> {
  if (!authorized) return failure("UNAUTHORIZED_CALLER");
  const parsed = piSkillConfirmImportRequestSchema.safeParse(request);
  if (!parsed.success) return failure("INVALID_REQUEST");
  return service?.confirmImport(parsed.data) ?? failure("STORAGE_UNAVAILABLE");
}

function failure(
  code: "INVALID_REQUEST" | "UNAUTHORIZED_CALLER" | "STORAGE_UNAVAILABLE",
): PiSkillItemResult & PiSkillListResult & PiSkillPreviewImportResult {
  return { ok: false, error: { code, message: "技能操作失败" } };
}
