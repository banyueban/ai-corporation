import {
  organizationActivationGetCurrentRequestSchema,
  organizationActivationRequestSchema,
  type OrganizationActivationItemResult,
  type OrganizationActivationNullableItemResult,
} from "@ai-corporation/protocols";
import {
  organizationActivationFailure,
  type OrganizationActivationService,
} from "./organization-activation-service";

type Service = Pick<OrganizationActivationService, "activate" | "getCurrent">;
export function handleOrganizationActivationActivate(
  authorized: boolean,
  request: unknown,
  service?: Service,
): OrganizationActivationItemResult {
  if (!authorized) return organizationActivationFailure("UNAUTHORIZED_CALLER");
  const parsed = organizationActivationRequestSchema.safeParse(request);
  if (!parsed.success)
    return organizationActivationFailure("VALIDATION_FAILED");
  return (
    service?.activate(parsed.data) ??
    organizationActivationFailure("STORAGE_FAILURE")
  );
}
export function handleOrganizationActivationGetCurrent(
  authorized: boolean,
  request: unknown,
  service?: Service,
): OrganizationActivationNullableItemResult {
  if (!authorized) return organizationActivationFailure("UNAUTHORIZED_CALLER");
  const parsed =
    organizationActivationGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success)
    return organizationActivationFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ??
    organizationActivationFailure("STORAGE_FAILURE")
  );
}
