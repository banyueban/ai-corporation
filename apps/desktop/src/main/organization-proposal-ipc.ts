import {
  organizationProposalCreateRequestSchema,
  organizationProposalGetCurrentRequestSchema,
  type OrganizationProposalItemResult,
  type OrganizationProposalNullableItemResult,
} from "@ai-corporation/protocols";
import {
  organizationProposalFailure,
  type OrganizationProposalService,
} from "./organization-proposal-service";

type Service = Pick<OrganizationProposalService, "create" | "getCurrent">;

export function handleOrganizationProposalCreate(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): OrganizationProposalItemResult {
  if (!authorized) return organizationProposalFailure("UNAUTHORIZED_CALLER");
  const parsed = organizationProposalCreateRequestSchema.safeParse(request);
  if (!parsed.success) return organizationProposalFailure("VALIDATION_FAILED");
  return (
    service?.create(parsed.data) ??
    organizationProposalFailure("STORAGE_FAILURE")
  );
}

export function handleOrganizationProposalGetCurrent(
  authorized: boolean,
  request: unknown,
  service: Service | undefined,
): OrganizationProposalNullableItemResult {
  if (!authorized) return organizationProposalFailure("UNAUTHORIZED_CALLER");
  const parsed = organizationProposalGetCurrentRequestSchema.safeParse(request);
  if (!parsed.success) return organizationProposalFailure("VALIDATION_FAILED");
  return (
    service?.getCurrent(parsed.data) ??
    organizationProposalFailure("STORAGE_FAILURE")
  );
}
