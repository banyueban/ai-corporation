import type { SkillScriptInspection } from "./skill-library";

export type SkillDependencyEcosystem = "JAVASCRIPT" | "PYTHON" | "SYSTEM";

export interface SkillDependency {
  readonly ecosystem: SkillDependencyEcosystem;
  /** JavaScript/Python 包名，或系统中需要出现的可执行程序名。 */
  readonly name: string;
  /** 系统依赖使用 winget ID 或 Homebrew formula。 */
  readonly installId?: string;
  readonly version?: string;
}

export interface ResolvedSkillDependencies {
  readonly javascript: readonly SkillDependency[];
  readonly packageJsonType?: "commonjs" | "module";
  readonly python: readonly SkillDependency[];
  readonly pythonRequest: string;
  readonly system: readonly SkillDependency[];
}

const JAVASCRIPT_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/iu;
const JAVASCRIPT_VERSION = /^(?:latest|next|[-0-9x*^~<>=.,+ ]{1,128})$/iu;
const PYTHON_NAME = /^[a-z0-9][a-z0-9._-]*(?:\[[a-z0-9._,-]+\])?$/iu;
const PYTHON_VERSION =
  /^(?:(?:==|!=|~=|>=|<=|>|<)[a-z0-9.*+_-]+)(?:,(?:==|!=|~=|>=|<=|>|<)[a-z0-9.*+_-]+)*$/iu;
const SYSTEM_NAME = /^[a-z0-9][a-z0-9._+-]{0,63}$/iu;
const SYSTEM_INSTALL_ID = /^[a-z0-9][a-z0-9._+/-]{0,127}$/iu;

export class SkillDependencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SkillDependencyError";
  }
}

/**
 * Turns standard dependency declarations into package names and versions.
 * No returned value can contain a command, URL, local path or package-manager
 * switch; later code can safely pass the values as separate process arguments.
 */
export function resolveSkillDependencies(
  inspection: SkillScriptInspection,
  supplemental: readonly SkillDependency[] = [],
): ResolvedSkillDependencies {
  if (supplemental.length > 64) {
    throw new SkillDependencyError("一次最多补充 64 项依赖。");
  }
  const javascript: SkillDependency[] = [];
  const python: SkillDependency[] = [];
  const system: SkillDependency[] = [];
  let packageJsonType: "commonjs" | "module" | undefined;
  let pythonRequest = "3.12";

  if (
    inspection.runtime === "JAVASCRIPT" &&
    inspection.packageJson !== undefined
  ) {
    const parsed = parsePackageJson(inspection.packageJson);
    javascript.push(...parsed.dependencies);
    packageJsonType = parsed.type;
  }
  if (inspection.runtime === "PYTHON") {
    const inline = parsePep723(inspection.scriptContent);
    python.push(...inline.dependencies);
    pythonRequest = inline.pythonRequest ?? pythonRequest;
    if (inspection.requirements !== undefined) {
      python.push(...parseRequirements(inspection.requirements));
    }
  }

  for (const item of supplemental) {
    const checked = validateDependency(item);
    if (
      checked.ecosystem === "JAVASCRIPT" &&
      inspection.runtime !== "JAVASCRIPT"
    ) {
      throw new SkillDependencyError(
        "只有 JavaScript 脚本可以补充 JavaScript 包。",
      );
    }
    if (checked.ecosystem === "PYTHON" && inspection.runtime !== "PYTHON") {
      throw new SkillDependencyError("只有 Python 脚本可以补充 Python 包。");
    }
    if (checked.ecosystem === "JAVASCRIPT") javascript.push(checked);
    else if (checked.ecosystem === "PYTHON") python.push(checked);
    else system.push(checked);
  }

  return {
    javascript: mergeDependencies(javascript),
    ...(packageJsonType === undefined ? {} : { packageJsonType }),
    python: mergeDependencies(python),
    pythonRequest: validatePythonRequest(pythonRequest),
    system: mergeDependencies(system),
  };
}

export function javascriptPackageSpec(dependency: SkillDependency): string {
  return dependency.version === undefined
    ? dependency.name
    : `${dependency.name}@${dependency.version}`;
}

export function pythonPackageSpec(dependency: SkillDependency): string {
  return `${dependency.name}${dependency.version ?? ""}`;
}

export function normalizedPackageJson(
  dependencies: readonly SkillDependency[],
  type: "commonjs" | "module" | undefined,
): string {
  return `${JSON.stringify(
    {
      name: "ai-corporation-skill-environment",
      private: true,
      ...(type === undefined ? {} : { type }),
      dependencies: Object.fromEntries(
        dependencies.map((dependency) => [
          dependency.name,
          dependency.version ?? "latest",
        ]),
      ),
    },
    undefined,
    2,
  )}\n`;
}

function parsePackageJson(content: string): {
  readonly dependencies: readonly SkillDependency[];
  readonly type?: "commonjs" | "module";
} {
  let value: unknown;
  try {
    value = JSON.parse(content) as unknown;
  } catch {
    throw new SkillDependencyError("package.json 不是合法 JSON。");
  }
  if (!isRecord(value)) {
    throw new SkillDependencyError("package.json 顶层必须是对象。");
  }
  const type = value.type;
  if (type !== undefined && type !== "commonjs" && type !== "module") {
    throw new SkillDependencyError(
      "package.json 的 type 只支持 commonjs 或 module。",
    );
  }
  const dependencies = [
    ...parseJavascriptMap(value.dependencies, "dependencies"),
    ...parseJavascriptMap(value.optionalDependencies, "optionalDependencies"),
  ];
  return {
    dependencies: mergeDependencies(dependencies),
    ...(type === undefined ? {} : { type }),
  };
}

function parseJavascriptMap(value: unknown, field: string): SkillDependency[] {
  if (value === undefined) return [];
  if (!isRecord(value) || Object.keys(value).length > 128) {
    throw new SkillDependencyError(`package.json 的 ${field} 不符合要求。`);
  }
  return Object.entries(value).map(([name, version]) => {
    if (typeof version !== "string") {
      throw new SkillDependencyError(`JavaScript 包“${name}”的版本不正确。`);
    }
    return validateDependency({ ecosystem: "JAVASCRIPT", name, version });
  });
}

function parsePep723(content: string): {
  readonly dependencies: readonly SkillDependency[];
  readonly pythonRequest?: string;
} {
  const match =
    /(?:^|\n)#\s*\/\/\/\s*script\s*\r?\n([\s\S]*?)(?:^|\n)#\s*\/\/\/\s*(?:\r?\n|$)/mu.exec(
      content,
    );
  if (match === null) return { dependencies: [] };
  const body = (match[1] ?? "")
    .split(/\r?\n/u)
    .map((line) => line.replace(/^# ?/u, ""))
    .join("\n");
  const request = /(?:^|\n)requires-python\s*=\s*["']([^"']+)["']/u.exec(
    body,
  )?.[1];
  const array = /(?:^|\n)dependencies\s*=\s*\[([\s\S]*?)\]/u.exec(body)?.[1];
  if (array === undefined) {
    return {
      dependencies: [],
      ...(request === undefined
        ? {}
        : { pythonRequest: validatePythonRequest(request) }),
    };
  }
  const quoted = [...array.matchAll(/["']([^"']+)["']/gu)].flatMap((entry) =>
    entry[1] === undefined ? [] : [entry[1]],
  );
  const residue = array.replace(/["'][^"']+["']/gu, "").replace(/[\s,]/gu, "");
  if (residue !== "" || quoted.length > 128) {
    throw new SkillDependencyError("PEP 723 dependencies 格式不受支持。");
  }
  return {
    dependencies: quoted.map(parsePythonRequirement),
    ...(request === undefined
      ? {}
      : { pythonRequest: validatePythonRequest(request) }),
  };
}

function parseRequirements(content: string): readonly SkillDependency[] {
  const dependencies: SkillDependency[] = [];
  for (const rawLine of content.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, "").trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("-") || /(?:https?:|git\+|@\s|[\\/])/iu.test(line)) {
      throw new SkillDependencyError(
        "requirements.txt 只支持普通公开包名和版本，不支持命令、URL 或本地路径。",
      );
    }
    dependencies.push(parsePythonRequirement(line));
    if (dependencies.length > 128) {
      throw new SkillDependencyError("requirements.txt 最多包含 128 个包。");
    }
  }
  return mergeDependencies(dependencies);
}

function parsePythonRequirement(spec: string): SkillDependency {
  const match = /^(.*?)(===|==|!=|~=|>=|<=|>|<)(.+)$/u.exec(spec.trim());
  return validateDependency({
    ecosystem: "PYTHON",
    name: (match?.[1] ?? spec).trim(),
    ...(match === null
      ? {}
      : { version: `${match[2] ?? ""}${(match[3] ?? "").trim()}` }),
  });
}

function validateDependency(input: SkillDependency): SkillDependency {
  const name = input.name.trim();
  const version = input.version?.trim();
  const installId = input.installId?.trim();
  if (input.ecosystem === "JAVASCRIPT") {
    if (!JAVASCRIPT_NAME.test(name)) {
      throw new SkillDependencyError(`JavaScript 包名“${name}”不正确。`);
    }
    if (version !== undefined && !JAVASCRIPT_VERSION.test(version)) {
      throw new SkillDependencyError(
        `JavaScript 包“${name}”的版本只能是普通 registry 版本。`,
      );
    }
  } else if (input.ecosystem === "PYTHON") {
    if (!PYTHON_NAME.test(name)) {
      throw new SkillDependencyError(`Python 包名“${name}”不正确。`);
    }
    if (version !== undefined && !PYTHON_VERSION.test(version)) {
      throw new SkillDependencyError(
        `Python 包“${name}”的版本只能是普通版本约束。`,
      );
    }
  } else {
    if (!SYSTEM_NAME.test(name) || installId === undefined) {
      throw new SkillDependencyError(
        "系统依赖必须提供可执行程序名和 winget ID/Homebrew formula。",
      );
    }
    if (!SYSTEM_INSTALL_ID.test(installId)) {
      throw new SkillDependencyError("系统安装 ID 或 formula 不正确。");
    }
    if (version !== undefined) {
      throw new SkillDependencyError("当前系统安装方案不接受版本命令参数。");
    }
  }
  return {
    ecosystem: input.ecosystem,
    name,
    ...(installId === undefined ? {} : { installId }),
    ...(version === undefined ? {} : { version }),
  };
}

function validatePythonRequest(value: string): string {
  const request = value.trim();
  if (!/^[0-9.*<>=!~, ]{1,64}$/u.test(request)) {
    throw new SkillDependencyError("PEP 723 的 Python 版本要求不正确。");
  }
  const minors = [...request.matchAll(/3\.(\d+)/gu)].map((match) =>
    Number.parseInt(match[1] ?? "0", 10),
  );
  if (minors.some((minor) => minor < 10 || minor > 14)) {
    throw new SkillDependencyError(
      "当前私有 Python 只支持 CPython 3.10–3.14。",
    );
  }
  // 固定成一个具体小版本，避免把“>=3.11”当成复检时应出现的版本号。
  const selected = ["3.12", "3.11", "3.13", "3.10", "3.14"].find((candidate) =>
    pythonVersionMatches(candidate, request),
  );
  if (selected === undefined) {
    throw new SkillDependencyError(
      "PEP 723 的版本要求没有可用的 CPython 3.10–3.14。",
    );
  }
  return selected;
}

function pythonVersionMatches(candidate: string, request: string): boolean {
  const [candidateMajor = 0, candidateMinor = 0] = candidate
    .split(".")
    .map(Number);
  return request.split(",").every((rawCondition) => {
    const condition = rawCondition.trim();
    if (condition === "") return true;
    const match =
      /^(~=|==|!=|>=|<=|>|<)?(\d+)(?:\.(\d+|\*))?(?:\.(\d+|\*))?$/u.exec(
        condition,
      );
    if (match === null) return false;
    const operator = match[1] ?? "==";
    const major = Number(match[2] ?? 0);
    const minor =
      match[3] === undefined || match[3] === "*" ? undefined : Number(match[3]);
    const patch =
      match[4] === undefined || match[4] === "*" ? undefined : Number(match[4]);
    const comparison =
      candidateMajor === major
        ? minor === undefined
          ? 0
          : candidateMinor - minor
        : candidateMajor - major;
    if (operator === "==") {
      return (
        candidateMajor === major &&
        (minor === undefined || candidateMinor === minor)
      );
    }
    if (operator === "!=") {
      return !(
        candidateMajor === major &&
        (minor === undefined || candidateMinor === minor)
      );
    }
    if (operator === ">=") return comparison >= 0;
    if (operator === "<=") return comparison <= 0;
    if (operator === ">") return comparison > 0;
    if (operator === "<") return comparison < 0;
    // ~=3.11 允许同一主版本内不低于 3.11；~=3.11.2 收窄到 3.11。
    return (
      comparison >= 0 &&
      candidateMajor === major &&
      (patch === undefined || candidateMinor === minor)
    );
  });
}

function mergeDependencies(
  dependencies: readonly SkillDependency[],
): readonly SkillDependency[] {
  const result = new Map<string, SkillDependency>();
  for (const dependency of dependencies) {
    const key = `${dependency.ecosystem}:${dependency.name.toLowerCase()}`;
    const current = result.get(key);
    if (
      current !== undefined &&
      (current.version !== dependency.version ||
        current.installId !== dependency.installId)
    ) {
      throw new SkillDependencyError(
        `依赖“${dependency.name}”声明了互相冲突的版本或安装 ID。`,
      );
    }
    result.set(key, dependency);
  }
  return [...result.values()].sort((left, right) =>
    `${left.ecosystem}:${left.name}`.localeCompare(
      `${right.ecosystem}:${right.name}`,
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
