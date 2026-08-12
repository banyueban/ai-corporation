import { DatabaseSync } from "node:sqlite";
import {
  organizationProposalSchema,
  plannerDraftPublicSchema,
  type OrganizationProposal,
  type PlannerDraftPublic,
} from "@ai-corporation/protocols";

export class OrganizationProposalNotFoundError extends Error {}
export class OrganizationProposalPlanStateError extends Error {}
export class OrganizationProposalVersionError extends Error {}
export class OrganizationProposalCommandConflictError extends Error {}
export class OrganizationProposalDataError extends Error {}

export class OrganizationProposalRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  getCurrent(corporationId: string): OrganizationProposal | undefined {
    const row = this.#database
      .prepare(
        `SELECT snapshot_json FROM organization_version
       WHERE corporation_id = ? AND status <> 'SUPERSEDED'
       ORDER BY version DESC LIMIT 1`,
      )
      .get(corporationId);
    return row === undefined ? undefined : parseProposal(row.snapshot_json);
  }

  getApprovedPlan(input: {
    corporationId: string;
    planId: string;
    expectedPlanVersion: number;
  }): PlannerDraftPublic {
    const row = this.#database
      .prepare(
        `SELECT draft_json, version, status, validation_status
       FROM task_plan WHERE id = ? AND corporation_id = ?`,
      )
      .get(input.planId, input.corporationId);
    if (row === undefined) throw new OrganizationProposalNotFoundError();
    if (row.version !== input.expectedPlanVersion)
      throw new OrganizationProposalVersionError();
    if (row.status !== "APPROVED" || row.validation_status !== "VALID") {
      throw new OrganizationProposalPlanStateError();
    }
    const current = this.#database
      .prepare(
        `SELECT id FROM task_plan WHERE corporation_id = ? AND status <> 'SUPERSEDED'
       ORDER BY version DESC LIMIT 1`,
      )
      .get(input.corporationId);
    if (current === undefined || current.id !== input.planId)
      throw new OrganizationProposalVersionError();
    return parsePlan(row.draft_json);
  }

  nextVersion(corporationId: string): number {
    const row = this.#database
      .prepare(
        "SELECT COALESCE(MAX(version), 0) AS version FROM organization_version WHERE corporation_id = ?",
      )
      .get(corporationId);
    if (row === undefined || typeof row.version !== "number")
      throw new OrganizationProposalDataError();
    return row.version + 1;
  }

  resolveCommand(
    commandId: string,
    requestHash: string,
  ): OrganizationProposal | undefined {
    const row = this.#database
      .prepare(
        "SELECT request_hash, result_organization_id FROM organization_proposal_command WHERE command_id = ?",
      )
      .get(commandId);
    if (row === undefined) return undefined;
    if (row.request_hash !== requestHash)
      throw new OrganizationProposalCommandConflictError();
    if (typeof row.result_organization_id !== "string")
      throw new OrganizationProposalDataError();
    const result = this.#database
      .prepare("SELECT snapshot_json FROM organization_version WHERE id = ?")
      .get(row.result_organization_id);
    if (result === undefined) throw new OrganizationProposalDataError();
    return parseProposal(result.snapshot_json);
  }

  save(input: {
    commandId: string;
    requestHash: string;
    proposal: OrganizationProposal;
  }): OrganizationProposal {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const existing = this.resolveCommand(input.commandId, input.requestHash);
      if (existing !== undefined) {
        this.#database.exec("ROLLBACK");
        return existing;
      }
      const currentPlan = this.getApprovedPlan({
        corporationId: input.proposal.corporationId,
        planId: input.proposal.planId,
        expectedPlanVersion: input.proposal.planVersion,
      });
      if (currentPlan.planId !== input.proposal.planId)
        throw new OrganizationProposalVersionError();
      const expectedVersion = this.nextVersion(input.proposal.corporationId);
      if (expectedVersion !== input.proposal.version)
        throw new OrganizationProposalVersionError();
      this.#database
        .prepare(
          "UPDATE organization_version SET status = 'SUPERSEDED' WHERE corporation_id = ? AND status = 'DRAFT'",
        )
        .run(input.proposal.corporationId);
      this.#database
        .prepare(
          `INSERT INTO organization_version
          (id, corporation_id, plan_id, plan_version, version, status, snapshot_json, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, 'DRAFT', ?, ?, ?)`,
        )
        .run(
          input.proposal.organizationId,
          input.proposal.corporationId,
          input.proposal.planId,
          input.proposal.planVersion,
          input.proposal.version,
          JSON.stringify(input.proposal),
          input.commandId,
          input.proposal.createdAt,
        );
      this.#database
        .prepare(
          `INSERT INTO organization_proposal_command
          (command_id, corporation_id, request_hash, result_organization_id, created_at)
         VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.commandId,
          input.proposal.corporationId,
          input.requestHash,
          input.proposal.organizationId,
          input.proposal.createdAt,
        );
      this.#database.exec("COMMIT");
      return input.proposal;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        /* keep original */
      }
      if (
        error instanceof OrganizationProposalNotFoundError ||
        error instanceof OrganizationProposalPlanStateError ||
        error instanceof OrganizationProposalVersionError ||
        error instanceof OrganizationProposalCommandConflictError
      )
        throw error;
      throw new OrganizationProposalDataError();
    }
  }
}

function parseProposal(value: unknown): OrganizationProposal {
  if (typeof value !== "string") throw new OrganizationProposalDataError();
  try {
    return organizationProposalSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new OrganizationProposalDataError();
  }
}

function parsePlan(value: unknown): PlannerDraftPublic {
  if (typeof value !== "string") throw new OrganizationProposalDataError();
  try {
    return plannerDraftPublicSchema.parse(JSON.parse(value) as unknown);
  } catch {
    throw new OrganizationProposalDataError();
  }
}
