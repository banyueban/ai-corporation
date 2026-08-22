import type {
  PiEmployeeItemResult,
  PiEmployeeListResult,
  PiEmployeeSaveRequest,
  ProviderPublic,
} from "@ai-corporation/protocols";
import type { PiEmployeeRepository } from "@ai-corporation/storage";
import type { SkillLibrary } from "./skill-library";
import { createUuidV7 } from "./uuid-v7";

export class PiEmployeeService {
  constructor(
    private readonly options: {
      readonly repository: Pick<PiEmployeeRepository, "get" | "list" | "save">;
      readonly listProviders: () => readonly ProviderPublic[];
      readonly skillLibrary: SkillLibrary;
      readonly createId?: () => string;
      readonly clock?: () => string;
    },
  ) {}

  list(): PiEmployeeListResult {
    try {
      return { ok: true, value: [...this.options.repository.list()] };
    } catch {
      return failure("STORAGE_UNAVAILABLE");
    }
  }

  async save(request: PiEmployeeSaveRequest): Promise<PiEmployeeItemResult> {
    try {
      const provider = this.options
        .listProviders()
        .find((item) => item.id === request.providerId);
      if (!isProviderReady(provider, request)) {
        return failure("PROVIDER_NOT_READY");
      }
      const skills = await this.options.skillLibrary.list();
      const availableNames = new Set(skills.map((skill) => skill.name));
      if (request.skillNames.some((name) => !availableNames.has(name))) {
        return failure("SKILL_NOT_FOUND");
      }
      const employeeId =
        request.employeeId ?? (this.options.createId ?? createUuidV7)();
      if (
        request.employeeId !== undefined &&
        this.options.repository.get(employeeId) === undefined
      ) {
        return failure("NOT_FOUND");
      }
      return {
        ok: true,
        value: this.options.repository.save({
          id: employeeId,
          name: request.name,
          providerId: provider.id,
          providerVersion: provider.version,
          modelId: request.modelId,
          skillNames: request.skillNames,
          now: (this.options.clock ?? (() => new Date().toISOString()))(),
        }),
      };
    } catch {
      return failure("INTERNAL");
    }
  }
}

function isProviderReady(
  provider: ProviderPublic | undefined,
  request: PiEmployeeSaveRequest,
): provider is ProviderPublic {
  const connectionTest = provider?.connectionTest;
  return (
    provider !== undefined &&
    provider.configStatus === "ENABLED" &&
    provider.hasKey &&
    provider.version === request.expectedProviderVersion &&
    connectionTest?.status === "VERIFIED" &&
    connectionTest.providerVersion === provider.version &&
    connectionTest.models.some((model) => model.id === request.modelId)
  );
}

function failure(
  code:
    | "PROVIDER_NOT_READY"
    | "SKILL_NOT_FOUND"
    | "NOT_FOUND"
    | "STORAGE_UNAVAILABLE"
    | "INTERNAL",
): PiEmployeeItemResult & PiEmployeeListResult {
  return { ok: false, error: { code, message: "员工操作失败" } };
}
