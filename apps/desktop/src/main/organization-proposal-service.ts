import { createHash } from "node:crypto";
import {
  organizationProposalErrorMessages,
  type OrganizationProposalCreateRequest,
  type OrganizationProposalErrorCode,
  type OrganizationProposalGetCurrentRequest,
  type OrganizationProposalItemResult,
  type OrganizationProposalNullableItemResult,
} from "@ai-corporation/protocols";
import {
  OrganizationProposalCommandConflictError,
  OrganizationProposalDataError,
  OrganizationProposalNotFoundError,
  OrganizationProposalPlanStateError,
  OrganizationProposalRepository,
  OrganizationProposalVersionError,
} from "@ai-corporation/storage";
import { buildOrganizationProposal } from "./organization-proposal-builder";

type Repository = Pick<
  OrganizationProposalRepository,
  "getApprovedPlan" | "getCurrent" | "nextVersion" | "resolveCommand" | "save"
>;

export class OrganizationProposalService {
  readonly #clock: () => string;
  readonly #createId: () => string;
  readonly #repository: Repository;

  constructor(options: {
    clock?: () => string;
    createId: () => string;
    repository: Repository;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#createId = options.createId;
    this.#repository = options.repository;
  }

  getCurrent(
    request: OrganizationProposalGetCurrentRequest,
  ): OrganizationProposalNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return mapFailure(error);
    }
  }

  create(
    request: OrganizationProposalCreateRequest,
  ): OrganizationProposalItemResult {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    try {
      const existing = this.#repository.resolveCommand(
        request.commandId,
        requestHash,
      );
      if (existing !== undefined) return { ok: true, value: existing };
      const plan = this.#repository.getApprovedPlan(request);
      const proposal = buildOrganizationProposal({
        organizationId: this.#createId(),
        plan,
        version: this.#repository.nextVersion(request.corporationId),
        createdAt: this.#clock(),
      });
      return {
        ok: true,
        value: this.#repository.save({
          commandId: request.commandId,
          requestHash,
          proposal,
        }),
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
}

export function organizationProposalFailure(
  code: OrganizationProposalErrorCode,
): Extract<OrganizationProposalItemResult, { ok: false }> {
  return {
    ok: false,
    error: { code, message: organizationProposalErrorMessages[code] },
  };
}

function mapFailure(
  error: unknown,
): Extract<OrganizationProposalItemResult, { ok: false }> {
  if (error instanceof OrganizationProposalPlanStateError)
    return organizationProposalFailure("PLAN_NOT_APPROVED");
  if (error instanceof OrganizationProposalVersionError)
    return organizationProposalFailure("CURRENT_PLAN_CHANGED");
  if (error instanceof OrganizationProposalCommandConflictError)
    return organizationProposalFailure("COMMAND_CONFLICT");
  if (error instanceof OrganizationProposalNotFoundError)
    return organizationProposalFailure("ORGANIZATION_NOT_FOUND");
  if (error instanceof OrganizationProposalDataError)
    return organizationProposalFailure("STORAGE_FAILURE");
  return organizationProposalFailure("STORAGE_FAILURE");
}
