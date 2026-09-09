import {
  PlanValidationRepository,
  type StoredPlanValidationInput,
} from "@ai-corporation/storage";
import { PLANNER_CATALOGS } from "./planner-catalogs";
import { validatePlanDraft } from "./plan-validator";

type Repository = Pick<
  PlanValidationRepository,
  "commit" | "listPendingPlanIds" | "readInput"
>;

export class PlanValidationService {
  readonly #clock: () => string;
  readonly #repository: Repository;

  constructor(options: {
    readonly clock?: () => string;
    readonly repository: Repository;
  }) {
    this.#clock = options.clock ?? (() => new Date().toISOString());
    this.#repository = options.repository;
  }

  validate(planId: string) {
    const stored = this.#repository.readInput(planId);
    if (stored.plan.validationStatus !== "PENDING") return stored.plan;
    return this.#commit(stored);
  }

  recoverPending(): number {
    let count = 0;
    for (const planId of this.#repository.listPendingPlanIds()) {
      this.validate(planId);
      count += 1;
    }
    return count;
  }

  #commit(stored: StoredPlanValidationInput) {
    const result = validatePlanDraft({
      catalogs: PLANNER_CATALOGS,
      goalBudget: stored.goalBudget,
      now: this.#clock(),
      plan: stored.plan,
    });
    return this.#repository.commit({ ...result, plan: stored.plan });
  }
}
