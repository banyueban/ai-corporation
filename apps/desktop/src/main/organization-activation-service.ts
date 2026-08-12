import { createHash } from "node:crypto";
import {
  organizationActivationErrorMessages,
  type OrganizationActivationErrorCode,
  type OrganizationActivationGetCurrentRequest,
  type OrganizationActivationItemResult,
  type OrganizationActivationNullableItemResult,
  type OrganizationActivationRequest,
} from "@ai-corporation/protocols";
import {
  OrganizationActivationBlockingGapError,
  OrganizationActivationCommandConflictError,
  OrganizationActivationDataError,
  OrganizationActivationDegradedGapError,
  OrganizationActivationModelError,
  OrganizationActivationNotFoundError,
  OrganizationActivationProviderNotReadyError,
  OrganizationActivationProviderVersionError,
  OrganizationActivationRepository,
  OrganizationActivationStateError,
  OrganizationActivationVersionError,
} from "@ai-corporation/storage";

type Repository = Pick<
  OrganizationActivationRepository,
  "activate" | "getCurrent" | "resolveCommand"
>;

export class OrganizationActivationService {
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
    request: OrganizationActivationGetCurrentRequest,
  ): OrganizationActivationNullableItemResult {
    try {
      return {
        ok: true,
        value: this.#repository.getCurrent(request.corporationId) ?? null,
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
  activate(
    request: OrganizationActivationRequest,
  ): OrganizationActivationItemResult {
    const requestHash = createHash("sha256")
      .update(JSON.stringify(request))
      .digest("hex");
    try {
      const replay = this.#repository.resolveCommand(
        request.commandId,
        requestHash,
      );
      if (replay !== undefined) return { ok: true, value: replay };
      return {
        ok: true,
        value: this.#repository.activate({
          request,
          requestHash,
          activationId: this.#createId(),
          agentInstanceIds: Array.from({ length: 5 }, () => this.#createId()),
          activatedAt: this.#clock(),
        }),
      };
    } catch (error) {
      return mapFailure(error);
    }
  }
}

export function organizationActivationFailure(
  code: OrganizationActivationErrorCode,
): Extract<OrganizationActivationItemResult, { ok: false }> {
  return {
    ok: false,
    error: { code, message: organizationActivationErrorMessages[code] },
  };
}
function mapFailure(
  error: unknown,
): Extract<OrganizationActivationItemResult, { ok: false }> {
  if (error instanceof OrganizationActivationNotFoundError)
    return organizationActivationFailure("ORGANIZATION_NOT_FOUND");
  if (error instanceof OrganizationActivationStateError)
    return organizationActivationFailure("ORGANIZATION_NOT_DRAFT");
  if (error instanceof OrganizationActivationVersionError)
    return organizationActivationFailure("ORGANIZATION_CHANGED");
  if (error instanceof OrganizationActivationBlockingGapError)
    return organizationActivationFailure("BLOCKING_CAPABILITY_GAP");
  if (error instanceof OrganizationActivationDegradedGapError)
    return organizationActivationFailure("DEGRADED_GAP_ACCEPTANCE_REQUIRED");
  if (error instanceof OrganizationActivationProviderNotReadyError)
    return organizationActivationFailure("PROVIDER_NOT_READY");
  if (error instanceof OrganizationActivationProviderVersionError)
    return organizationActivationFailure("PROVIDER_CHANGED");
  if (error instanceof OrganizationActivationModelError)
    return organizationActivationFailure("MODEL_NOT_AVAILABLE");
  if (error instanceof OrganizationActivationCommandConflictError)
    return organizationActivationFailure("COMMAND_CONFLICT");
  if (error instanceof OrganizationActivationDataError)
    return organizationActivationFailure("STORAGE_FAILURE");
  return organizationActivationFailure("STORAGE_FAILURE");
}
