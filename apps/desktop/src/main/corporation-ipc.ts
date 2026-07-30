import {
  corporationArchiveRequestSchema,
  corporationCreateRequestSchema,
  corporationGetRequestSchema,
  corporationListRequestSchema,
  corporationUpdateNameRequestSchema,
  type CorporationItemResult,
  type CorporationListResult,
} from "@ai-corporation/protocols";
import {
  corporationFailure,
  type CorporationService,
} from "./corporation-service";

type Service = Pick<
  CorporationService,
  "archive" | "create" | "get" | "list" | "updateName"
>;

export async function handleCorporationCreate(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): Promise<CorporationItemResult> {
  if (!authorized) return corporationFailure("UNAUTHORIZED_CALLER");
  const parsed = corporationCreateRequestSchema.safeParse(request);
  if (!parsed.success) return corporationFailure("VALIDATION_FAILED");
  return (
    service?.create(parsed.data) ?? corporationFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleCorporationGet(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): CorporationItemResult {
  if (!authorized) return corporationFailure("UNAUTHORIZED_CALLER");
  const parsed = corporationGetRequestSchema.safeParse(request);
  if (!parsed.success) return corporationFailure("VALIDATION_FAILED");
  return service?.get(parsed.data) ?? corporationFailure("STORAGE_UNAVAILABLE");
}

export function handleCorporationList(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): CorporationListResult {
  if (!authorized) return corporationFailure("UNAUTHORIZED_CALLER");
  const parsed = corporationListRequestSchema.safeParse(request);
  if (!parsed.success) return corporationFailure("VALIDATION_FAILED");
  return (
    service?.list(parsed.data) ?? corporationFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleCorporationUpdateName(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): CorporationItemResult {
  if (!authorized) return corporationFailure("UNAUTHORIZED_CALLER");
  const parsed = corporationUpdateNameRequestSchema.safeParse(request);
  if (!parsed.success) return corporationFailure("VALIDATION_FAILED");
  return (
    service?.updateName(parsed.data) ??
    corporationFailure("STORAGE_UNAVAILABLE")
  );
}

export function handleCorporationArchive(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): CorporationItemResult {
  if (!authorized) return corporationFailure("UNAUTHORIZED_CALLER");
  const parsed = corporationArchiveRequestSchema.safeParse(request);
  if (!parsed.success) return corporationFailure("VALIDATION_FAILED");
  return (
    service?.archive(parsed.data) ?? corporationFailure("STORAGE_UNAVAILABLE")
  );
}
