import { DatabaseSync } from "node:sqlite";
import {
  organizationActivationSchema,
  organizationProposalSchema,
  type OrganizationActivation,
  type OrganizationActivationRequest,
  type OrganizationProposal,
} from "@ai-corporation/protocols";

export class OrganizationActivationNotFoundError extends Error {}
export class OrganizationActivationStateError extends Error {}
export class OrganizationActivationVersionError extends Error {}
export class OrganizationActivationBlockingGapError extends Error {}
export class OrganizationActivationDegradedGapError extends Error {}
export class OrganizationActivationProviderNotReadyError extends Error {}
export class OrganizationActivationProviderVersionError extends Error {}
export class OrganizationActivationModelError extends Error {}
export class OrganizationActivationCommandConflictError extends Error {}
export class OrganizationActivationDataError extends Error {}

export class OrganizationActivationRepository {
  readonly #database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.#database = database;
  }

  getCurrent(corporationId: string): OrganizationActivation | undefined {
    const row = this.#database
      .prepare(
        `SELECT a.id, a.corporation_id, a.organization_id,
          a.organization_version, a.routes_json, a.accepted_degraded_gaps,
          a.activated_at, o.snapshot_json
        FROM organization_activation a
        JOIN organization_version o ON o.id = a.organization_id
        JOIN corporation c ON c.id = a.corporation_id
          AND c.active_organization_version = a.organization_version
        WHERE a.corporation_id = ?`,
      )
      .get(corporationId);
    return row === undefined ? undefined : this.#parseActivation(row);
  }

  resolveCommand(
    commandId: string,
    requestHash: string,
  ): OrganizationActivation | undefined {
    const row = this.#database
      .prepare(
        `SELECT request_hash, result_activation_id
        FROM organization_activation_command WHERE command_id = ?`,
      )
      .get(commandId);
    if (row === undefined) return undefined;
    if (row.request_hash !== requestHash)
      throw new OrganizationActivationCommandConflictError();
    if (typeof row.result_activation_id !== "string")
      throw new OrganizationActivationDataError();
    const result = this.#database
      .prepare(
        `SELECT a.id, a.corporation_id, a.organization_id,
          a.organization_version, a.routes_json, a.accepted_degraded_gaps,
          a.activated_at, o.snapshot_json
        FROM organization_activation a
        JOIN organization_version o ON o.id = a.organization_id
        WHERE a.id = ?`,
      )
      .get(row.result_activation_id);
    if (result === undefined) throw new OrganizationActivationDataError();
    return this.#parseActivation(result);
  }

  activate(input: {
    request: OrganizationActivationRequest;
    requestHash: string;
    activationId: string;
    agentInstanceIds: readonly string[];
    activatedAt: string;
  }): OrganizationActivation {
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const replay = this.resolveCommand(
        input.request.commandId,
        input.requestHash,
      );
      if (replay !== undefined) {
        this.#database.exec("ROLLBACK");
        return replay;
      }
      const proposal = this.#getDraft(input.request);
      if (
        proposal.capabilityGaps.some(({ severity }) => severity === "BLOCKING")
      )
        throw new OrganizationActivationBlockingGapError();
      if (
        proposal.capabilityGaps.some(
          ({ severity }) => severity === "DEGRADED",
        ) &&
        !input.request.acceptDegradedGaps
      )
        throw new OrganizationActivationDegradedGapError();

      const routes = {
        planner: this.#validateRoute(input.request.routes.planner),
        executor: this.#validateRoute(input.request.routes.executor),
        judge: this.#validateRoute(input.request.routes.judge),
      };
      if (input.agentInstanceIds.length < proposal.members.length)
        throw new OrganizationActivationDataError();

      for (const member of proposal.members) {
        this.#ensureDefinition(member, input.activatedAt);
      }
      this.#database
        .prepare(
          `INSERT INTO organization_activation
          (id, corporation_id, organization_id, organization_version,
           routes_json, accepted_degraded_gaps, activated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.activationId,
          proposal.corporationId,
          proposal.organizationId,
          proposal.version,
          JSON.stringify(routes),
          input.request.acceptDegradedGaps ? 1 : 0,
          input.activatedAt,
        );
      const changed = this.#database
        .prepare(
          "UPDATE organization_version SET status = 'APPROVED' WHERE id = ? AND corporation_id = ? AND version = ? AND status = 'DRAFT'",
        )
        .run(proposal.organizationId, proposal.corporationId, proposal.version);
      if (changed.changes !== 1) throw new OrganizationActivationVersionError();
      const corporationChanged = this.#database
        .prepare(
          "UPDATE corporation SET active_organization_version = ? WHERE id = ? AND status = 'DRAFT'",
        )
        .run(proposal.version, proposal.corporationId);
      if (corporationChanged.changes !== 1)
        throw new OrganizationActivationStateError();

      proposal.members.forEach((member, index) => {
        const instanceId = input.agentInstanceIds[index];
        if (instanceId === undefined)
          throw new OrganizationActivationDataError();
        const groupRoute =
          member.role === "PLANNER"
            ? routes.planner
            : member.role === "JUDGE"
              ? routes.judge
              : routes.executor;
        const snapshot = {
          member,
          route: { ...groupRoute, modelStrategy: member.modelStrategy },
        };
        this.#database
          .prepare(
            `INSERT INTO agent_instance
            (id, corporation_id, organization_id, member_id, definition_id,
             definition_version, status, snapshot_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 'READY', ?, ?, ?)`,
          )
          .run(
            instanceId,
            proposal.corporationId,
            proposal.organizationId,
            member.memberId,
            member.templateId,
            member.templateVersion,
            JSON.stringify(snapshot),
            input.activatedAt,
            input.activatedAt,
          );
      });
      this.#database
        .prepare(
          `INSERT INTO organization_activation_command
          (command_id, corporation_id, request_hash, result_activation_id, created_at)
          VALUES (?, ?, ?, ?, ?)`,
        )
        .run(
          input.request.commandId,
          proposal.corporationId,
          input.requestHash,
          input.activationId,
          input.activatedAt,
        );
      const result = this.getCurrent(proposal.corporationId);
      if (result === undefined) throw new OrganizationActivationDataError();
      this.#database.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        this.#database.exec("ROLLBACK");
      } catch {
        /* keep original */
      }
      if (
        error instanceof OrganizationActivationNotFoundError ||
        error instanceof OrganizationActivationStateError ||
        error instanceof OrganizationActivationVersionError ||
        error instanceof OrganizationActivationBlockingGapError ||
        error instanceof OrganizationActivationDegradedGapError ||
        error instanceof OrganizationActivationProviderNotReadyError ||
        error instanceof OrganizationActivationProviderVersionError ||
        error instanceof OrganizationActivationModelError ||
        error instanceof OrganizationActivationCommandConflictError
      )
        throw error;
      throw new OrganizationActivationDataError();
    }
  }

  validateActiveRoutes(corporationId: string): readonly string[] {
    const activation = this.getCurrent(corporationId);
    if (activation === undefined)
      throw new OrganizationActivationNotFoundError();
    const invalid: string[] = [];
    for (const [role, route] of Object.entries(activation.routes)) {
      try {
        this.#validateRoute(route);
      } catch {
        invalid.push(role);
      }
    }
    return invalid;
  }

  #getDraft(request: OrganizationActivationRequest): OrganizationProposal {
    const row = this.#database
      .prepare(
        `SELECT snapshot_json, status, version FROM organization_version
        WHERE id = ? AND corporation_id = ?`,
      )
      .get(request.organizationId, request.corporationId);
    if (row === undefined) throw new OrganizationActivationNotFoundError();
    if (row.status !== "DRAFT") throw new OrganizationActivationStateError();
    if (row.version !== request.expectedOrganizationVersion)
      throw new OrganizationActivationVersionError();
    const current = this.#database
      .prepare(
        `SELECT id FROM organization_version
        WHERE corporation_id = ? AND status <> 'SUPERSEDED'
        ORDER BY version DESC LIMIT 1`,
      )
      .get(request.corporationId);
    if (current?.id !== request.organizationId)
      throw new OrganizationActivationVersionError();
    return parseProposal(row.snapshot_json, "DRAFT");
  }

  #validateRoute(route: OrganizationActivationRequest["routes"]["planner"]) {
    const row = this.#database
      .prepare(
        `SELECT p.id, p.type, p.name, p.endpoint, p.api_dialect,
          p.selected_model_id, p.generation_timeout_ms, p.key_vault_entry_id,
          p.config_status, p.version, p.created_at, p.updated_at,
          t.status AS test_status, t.failure_reason, t.retryable,
          t.suggested_backoff_ms, t.models_json, t.tested_at,
          NULL AS generation_status, NULL AS generation_model_id,
          NULL AS generation_failure_reason, NULL AS generation_retryable,
          NULL AS generation_backoff_ms, NULL AS stop_reason,
          NULL AS output_preview, NULL AS usage_json, NULL AS completed_at
        FROM provider p LEFT JOIN provider_connection_test t
          ON t.provider_id = p.id AND t.provider_version = p.version
        WHERE p.id = ?`,
      )
      .get(route.providerId);
    if (row === undefined)
      throw new OrganizationActivationProviderNotReadyError();
    if (row.version !== route.providerVersion)
      throw new OrganizationActivationProviderVersionError();
    if (
      row.config_status !== "ENABLED" ||
      typeof row.key_vault_entry_id !== "string" ||
      row.test_status !== "VERIFIED"
    )
      throw new OrganizationActivationProviderNotReadyError();
    let models: unknown;
    try {
      models = JSON.parse(String(row.models_json));
    } catch {
      throw new OrganizationActivationDataError();
    }
    if (
      !Array.isArray(models) ||
      !models.some(
        (model) =>
          typeof model === "object" &&
          model !== null &&
          "id" in model &&
          model.id === route.modelId,
      )
    )
      throw new OrganizationActivationModelError();
    return {
      providerId: asSqlString(row.id),
      providerVersion: Number(row.version),
      modelId: route.modelId,
      apiDialect:
        row.api_dialect === "RESPONSES"
          ? ("RESPONSES" as const)
          : ("CHAT_COMPLETIONS" as const),
    };
  }

  #ensureDefinition(
    member: OrganizationProposal["members"][number],
    now: string,
  ) {
    const definition = { member };
    this.#database
      .prepare(
        `INSERT INTO agent_definition (id, version, definition_json, created_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(id, version) DO NOTHING`,
      )
      .run(
        member.templateId,
        member.templateVersion,
        JSON.stringify(definition),
        now,
      );
    const row = this.#database
      .prepare(
        "SELECT definition_json FROM agent_definition WHERE id = ? AND version = ?",
      )
      .get(member.templateId, member.templateVersion);
    if (row?.definition_json !== JSON.stringify(definition))
      throw new OrganizationActivationDataError();
  }

  #parseActivation(row: Record<string, unknown>): OrganizationActivation {
    parseProposal(row.snapshot_json, "DRAFT", "APPROVED");
    let routes: unknown;
    try {
      routes = JSON.parse(String(row.routes_json));
    } catch {
      throw new OrganizationActivationDataError();
    }
    const agents = this.#database
      .prepare(
        `SELECT id, member_id, status, snapshot_json FROM agent_instance
        WHERE organization_id = ? ORDER BY member_id`,
      )
      .all(asSqlString(row.organization_id))
      .map((agent) => {
        if (typeof agent.snapshot_json !== "string")
          throw new OrganizationActivationDataError();
        let snapshot: unknown;
        try {
          snapshot = JSON.parse(agent.snapshot_json);
        } catch {
          throw new OrganizationActivationDataError();
        }
        if (typeof snapshot !== "object" || snapshot === null)
          throw new OrganizationActivationDataError();
        return {
          instanceId: agent.id,
          member: "member" in snapshot ? snapshot.member : undefined,
          status: agent.status,
          route: "route" in snapshot ? snapshot.route : undefined,
        };
      });
    return organizationActivationSchema.parse({
      schemaVersion: "1.0",
      activationId: row.id,
      corporationId: row.corporation_id,
      organizationId: row.organization_id,
      organizationVersion: row.organization_version,
      status: "ACTIVE",
      routes,
      acceptedDegradedGaps: row.accepted_degraded_gaps === 1,
      agents,
      activatedAt: row.activated_at,
    });
  }
}

function parseProposal(
  value: unknown,
  ...allowed: Array<"DRAFT" | "APPROVED">
): OrganizationProposal {
  if (typeof value !== "string") throw new OrganizationActivationDataError();
  try {
    const proposal = organizationProposalSchema.parse(JSON.parse(value));
    if (!allowed.includes(proposal.status))
      return { ...proposal, status: allowed[0]! };
    return proposal;
  } catch {
    throw new OrganizationActivationDataError();
  }
}

function asSqlString(value: unknown): string {
  if (typeof value !== "string") throw new OrganizationActivationDataError();
  return value;
}
