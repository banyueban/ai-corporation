import { createHash, randomUUID } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";

const MAX_SKILL_FILES = 256;
const MAX_SKILL_BYTES = 10 * 1024 * 1024;
const MAX_REFERENCE_BYTES = 1024 * 1024;
const MAX_SCRIPT_BYTES = 1024 * 1024;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface SkillSummary {
  readonly allowedTools?: string;
  readonly compatibility?: string;
  readonly description: string;
  readonly directory: string;
  readonly license?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly name: string;
}

export interface SkillResourceSummary {
  readonly available?:
    "AVAILABLE" | "UNSUPPORTED_PLATFORM" | "UNSUPPORTED_TYPE";
  readonly kind: "ASSET" | "REFERENCE" | "SCRIPT";
  readonly relativePath: string;
  readonly runtime?: SkillScriptRuntime;
  readonly sizeBytes: number;
}

export type SkillScriptRuntime =
  "JAVASCRIPT" | "PYTHON" | "POWERSHELL" | "SHELL";

export interface SkillScriptInspection {
  readonly digest: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly packageJson?: string;
  readonly relativePath: string;
  readonly requirements?: string;
  readonly runtime: SkillScriptRuntime;
  readonly scriptContent: string;
  readonly skillName: string;
}

export interface SkillAssetInspection {
  readonly rootDirectory: string;
  readonly relativePath: string;
  readonly sha256: string;
  readonly sizeBytes: number;
}

export interface SkillFileChange {
  readonly path: string;
  readonly type: "ADDED" | "CHANGED" | "REMOVED";
}

export interface SkillImportPreview {
  readonly allowedTools?: string;
  readonly changes: readonly SkillFileChange[];
  readonly compatibility?: string;
  readonly description: string;
  readonly digest: string;
  readonly license?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly name: string;
}

interface SkillFile {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly relativePath: string;
}

interface SkillSnapshot {
  readonly allowedTools?: string;
  readonly compatibility?: string;
  readonly description: string;
  readonly digest: string;
  readonly files: readonly SkillFile[];
  readonly instructions: string;
  readonly license?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly name: string;
}

export class SkillLibraryError extends Error {
  constructor(
    readonly code:
      "INVALID_SKILL" | "SOURCE_CHANGED" | "SKILL_TOO_LARGE" | "UNSAFE_ENTRY",
    message: string,
  ) {
    super(message);
    this.name = "SkillLibraryError";
  }
}

/**
 * Owns imported skill folders. Runtime code only reads these managed copies,
 * never the original user-selected directory.
 */
export class SkillLibrary {
  constructor(private readonly rootDirectory: string) {}

  async list(): Promise<readonly SkillSummary[]> {
    await mkdir(this.rootDirectory, { recursive: true });
    const entries = await readdir(this.rootDirectory, { withFileTypes: true });
    const skills: SkillSummary[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
      const snapshot = await readSnapshot(
        path.join(this.rootDirectory, entry.name),
      );
      skills.push({
        ...(snapshot.allowedTools === undefined
          ? {}
          : { allowedTools: snapshot.allowedTools }),
        ...(snapshot.compatibility === undefined
          ? {}
          : { compatibility: snapshot.compatibility }),
        description: snapshot.description,
        directory: path.join(this.rootDirectory, snapshot.name),
        ...(snapshot.license === undefined
          ? {}
          : { license: snapshot.license }),
        metadata: snapshot.metadata,
        name: snapshot.name,
      });
    }
    return skills.sort((left, right) => left.name.localeCompare(right.name));
  }

  async readInstructions(name: string): Promise<string> {
    return (await this.#readManagedSnapshot(name)).instructions;
  }

  async get(name: string): Promise<SkillSummary> {
    const snapshot = await this.#readManagedSnapshot(name);
    return {
      ...(snapshot.allowedTools === undefined
        ? {}
        : { allowedTools: snapshot.allowedTools }),
      ...(snapshot.compatibility === undefined
        ? {}
        : { compatibility: snapshot.compatibility }),
      description: snapshot.description,
      directory: path.join(this.rootDirectory, snapshot.name),
      ...(snapshot.license === undefined ? {} : { license: snapshot.license }),
      metadata: snapshot.metadata,
      name: snapshot.name,
    };
  }

  async listResources(name: string): Promise<readonly SkillResourceSummary[]> {
    const snapshot = await this.#readManagedSnapshot(name);
    return snapshot.files.flatMap((file): SkillResourceSummary[] => {
      const kind = resourceKind(file.relativePath);
      return kind === undefined
        ? []
        : [
            {
              ...(kind === "SCRIPT"
                ? scriptResourceDetails(file.relativePath)
                : {}),
              kind,
              relativePath: file.relativePath,
              sizeBytes: file.bytes.byteLength,
            },
          ];
    });
  }

  async inspectScript(
    name: string,
    relativePath: string,
  ): Promise<SkillScriptInspection> {
    requireResourcePath(relativePath, "scripts");
    const snapshot = await this.#readManagedSnapshot(name);
    const file = snapshot.files.find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (file === undefined) {
      throw new SkillLibraryError("INVALID_SKILL", "技能脚本不存在。");
    }
    if (file.bytes.byteLength > MAX_SCRIPT_BYTES) {
      throw new SkillLibraryError("SKILL_TOO_LARGE", "技能脚本超过 1 MiB。");
    }
    const details = scriptResourceDetails(relativePath);
    if (details.available !== "AVAILABLE" || details.runtime === undefined) {
      throw new SkillLibraryError(
        "INVALID_SKILL",
        details.available === "UNSUPPORTED_PLATFORM"
          ? "这个脚本不支持当前系统。"
          : "这个脚本类型暂不支持。",
      );
    }
    const scriptContent = decodeRuntimeText(file.bytes, "技能脚本");
    const packageFile = snapshot.files.find(
      (candidate) => candidate.relativePath === "package.json",
    );
    const requirementsFile = snapshot.files.find(
      (candidate) => candidate.relativePath === "requirements.txt",
    );
    return {
      digest: snapshot.digest,
      metadata: snapshot.metadata,
      ...(packageFile === undefined
        ? {}
        : {
            packageJson: decodeRuntimeText(packageFile.bytes, "package.json"),
          }),
      relativePath,
      ...(requirementsFile === undefined
        ? {}
        : {
            requirements: decodeRuntimeText(
              requirementsFile.bytes,
              "requirements.txt",
            ),
          }),
      runtime: details.runtime,
      scriptContent,
      skillName: snapshot.name,
    };
  }

  /** Writes the exact validated snapshot into an environment staging folder. */
  async materializeRuntimeCopy(
    name: string,
    expectedDigest: string,
    targetDirectory: string,
  ): Promise<void> {
    const snapshot = await this.#readManagedSnapshot(name);
    if (snapshot.digest !== expectedDigest) {
      throw new SkillLibraryError(
        "SOURCE_CHANGED",
        "技能在环境准备期间发生了变化，请重新检查。",
      );
    }
    await writeSnapshot(targetDirectory, snapshot.files);
  }

  async readReference(
    name: string,
    relativePath: string,
  ): Promise<{
    readonly content: string;
    readonly relativePath: string;
    readonly sha256: string;
    readonly sizeBytes: number;
  }> {
    requireResourcePath(relativePath, "references");
    const snapshot = await this.#readManagedSnapshot(name);
    const file = snapshot.files.find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (file === undefined) {
      throw new SkillLibraryError("INVALID_SKILL", "参考资料不存在。");
    }
    if (file.bytes.byteLength > MAX_REFERENCE_BYTES) {
      throw new SkillLibraryError("SKILL_TOO_LARGE", "参考资料超过 1 MiB。");
    }
    let content: string;
    try {
      content = new TextDecoder("utf-8", { fatal: true }).decode(file.bytes);
    } catch {
      throw new SkillLibraryError(
        "INVALID_SKILL",
        "参考资料不是普通 UTF-8 文本。",
      );
    }
    if (content.includes("\0")) {
      throw new SkillLibraryError(
        "INVALID_SKILL",
        "参考资料不是普通 UTF-8 文本。",
      );
    }
    return {
      content,
      relativePath,
      sha256: file.digest,
      sizeBytes: file.bytes.byteLength,
    };
  }

  async inspectAsset(
    name: string,
    relativePath: string,
  ): Promise<SkillAssetInspection> {
    requireResourcePath(relativePath, "assets");
    const snapshot = await this.#readManagedSnapshot(name);
    const file = snapshot.files.find(
      (candidate) => candidate.relativePath === relativePath,
    );
    if (file === undefined) {
      throw new SkillLibraryError("INVALID_SKILL", "技能资源不存在。");
    }
    return {
      rootDirectory: path.join(this.rootDirectory, name),
      relativePath,
      sha256: file.digest,
      sizeBytes: file.bytes.byteLength,
    };
  }

  async previewImport(sourceDirectory: string): Promise<SkillImportPreview> {
    const incoming = await readSnapshot(sourceDirectory);
    const currentDirectory = path.join(this.rootDirectory, incoming.name);
    let current: SkillSnapshot | undefined;
    try {
      current = await readSnapshot(currentDirectory);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    return {
      ...(incoming.allowedTools === undefined
        ? {}
        : { allowedTools: incoming.allowedTools }),
      changes: compareFiles(current?.files ?? [], incoming.files),
      ...(incoming.compatibility === undefined
        ? {}
        : { compatibility: incoming.compatibility }),
      description: incoming.description,
      digest: incoming.digest,
      ...(incoming.license === undefined ? {} : { license: incoming.license }),
      metadata: incoming.metadata,
      name: incoming.name,
    };
  }

  async confirmImport(
    sourceDirectory: string,
    expectedDigest: string,
  ): Promise<SkillSummary> {
    const incoming = await readSnapshot(sourceDirectory);
    if (incoming.digest !== expectedDigest) {
      throw new SkillLibraryError(
        "SOURCE_CHANGED",
        "技能文件夹在确认前发生了变化，请重新预览。",
      );
    }

    await mkdir(this.rootDirectory, { recursive: true });
    const target = path.join(this.rootDirectory, incoming.name);
    const staging = path.join(this.rootDirectory, `.import-${randomUUID()}`);
    const backup = path.join(this.rootDirectory, `.backup-${randomUUID()}`);
    let movedCurrent = false;
    try {
      await writeSnapshot(staging, incoming.files);
      try {
        await rename(target, backup);
        movedCurrent = true;
      } catch (error) {
        if (!isMissing(error)) throw error;
      }
      await rename(staging, target);
      if (movedCurrent) await rm(backup, { recursive: true, force: true });
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      if (movedCurrent) {
        await rm(target, { recursive: true, force: true });
        await rename(backup, target);
      }
      throw error;
    }

    return {
      ...(incoming.allowedTools === undefined
        ? {}
        : { allowedTools: incoming.allowedTools }),
      ...(incoming.compatibility === undefined
        ? {}
        : { compatibility: incoming.compatibility }),
      description: incoming.description,
      directory: target,
      ...(incoming.license === undefined ? {} : { license: incoming.license }),
      metadata: incoming.metadata,
      name: incoming.name,
    };
  }

  async #readManagedSnapshot(name: string): Promise<SkillSnapshot> {
    if (!SKILL_NAME_PATTERN.test(name) || name.length > 64) {
      throw new SkillLibraryError("INVALID_SKILL", "技能名称不正确。");
    }
    // 运行时只重新核对应用自管副本，不相信模型提交的路径。
    try {
      return await readSnapshot(path.join(this.rootDirectory, name));
    } catch (error) {
      if (error instanceof SkillLibraryError) throw error;
      // 文件系统原始错误可能包含应用内部绝对路径，不能进入模型或过程区。
      throw new SkillLibraryError(
        "INVALID_SKILL",
        `技能“${name}”不存在或无法读取。`,
      );
    }
  }
}

async function readSnapshot(directory: string): Promise<SkillSnapshot> {
  const root = path.resolve(directory);
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new SkillLibraryError("INVALID_SKILL", "请选择技能文件夹。 ");
  }

  const files: SkillFile[] = [];
  await collectFiles(root, root, files);
  const skillFile = files.find((file) => file.relativePath === "SKILL.md");
  if (skillFile === undefined) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "技能文件夹根目录必须包含 SKILL.md。",
    );
  }
  const parsed = parseSkillMarkdown(
    Buffer.from(skillFile.bytes).toString("utf8"),
    path.basename(root),
  );
  const digest = createHash("sha256");
  for (const file of files) {
    digest
      .update(file.relativePath)
      .update("\0")
      .update(file.digest)
      .update("\0");
  }
  return { ...parsed, digest: digest.digest("hex"), files };
}

async function collectFiles(
  root: string,
  directory: string,
  files: SkillFile[],
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(directory, entry.name);
    const metadata = await lstat(absolute);
    if (metadata.isSymbolicLink()) {
      throw new SkillLibraryError(
        "UNSAFE_ENTRY",
        `技能中不允许符号链接：${entry.name}`,
      );
    }
    if (metadata.isDirectory()) {
      await collectFiles(root, absolute, files);
      continue;
    }
    if (!metadata.isFile()) {
      throw new SkillLibraryError(
        "UNSAFE_ENTRY",
        `不支持的技能文件：${entry.name}`,
      );
    }
    if (files.length >= MAX_SKILL_FILES) {
      throw new SkillLibraryError(
        "SKILL_TOO_LARGE",
        "技能文件数量超过 256 个。 ",
      );
    }
    const bytes = await readFile(absolute);
    const totalBytes = files.reduce(
      (sum, file) => sum + file.bytes.byteLength,
      0,
    );
    if (totalBytes + bytes.byteLength > MAX_SKILL_BYTES) {
      throw new SkillLibraryError(
        "SKILL_TOO_LARGE",
        "技能文件总大小超过 10 MiB。 ",
      );
    }
    files.push({
      bytes,
      digest: createHash("sha256").update(bytes).digest("hex"),
      relativePath: path.relative(root, absolute).split(path.sep).join("/"),
    });
  }
}

function parseSkillMarkdown(
  markdown: string,
  directoryName: string,
): {
  readonly allowedTools?: string;
  readonly compatibility?: string;
  readonly description: string;
  readonly instructions: string;
  readonly license?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly name: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  const header = match?.[1];
  const frontmatter = match?.[0];
  if (header === undefined || frontmatter === undefined) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 缺少 YAML 头信息。 ",
    );
  }
  let fields: unknown;
  try {
    fields = parseYaml(header, { maxAliasCount: 0, uniqueKeys: true });
  } catch {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 的 YAML 头信息不正确。",
    );
  }
  if (!isPlainObject(fields)) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 的 YAML 头信息不正确。",
    );
  }
  const name = fields.name;
  const description = fields.description;
  const license = optionalString(fields.license);
  const compatibility = optionalString(fields.compatibility);
  const allowedTools = optionalString(fields["allowed-tools"]);
  const metadata = parseStringMap(fields.metadata);
  if (
    typeof name !== "string" ||
    !SKILL_NAME_PATTERN.test(name) ||
    name.length > 64
  ) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 的 name 必须是有效的标准 Skill 名称。",
    );
  }
  if (name !== directoryName) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      `文件夹名称“${directoryName}”必须与 SKILL.md 中的 name“${name}”一致。`,
    );
  }
  if (
    typeof description !== "string" ||
    description.length === 0 ||
    description.length > 1024 ||
    (fields.license !== undefined && license === undefined) ||
    (fields.compatibility !== undefined &&
      (compatibility === undefined || compatibility.length > 500)) ||
    (fields["allowed-tools"] !== undefined && allowedTools === undefined) ||
    (fields.metadata !== undefined && metadata === undefined)
  ) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 的 description 或可选信息不符合要求。",
    );
  }
  return {
    ...(allowedTools === undefined ? {} : { allowedTools }),
    ...(compatibility === undefined ? {} : { compatibility }),
    description,
    instructions: markdown.slice(frontmatter.length).trimStart(),
    ...(license === undefined ? {} : { license }),
    metadata: metadata ?? {},
    name,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function parseStringMap(
  value: unknown,
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) return {};
  if (!isPlainObject(value)) return undefined;
  const entries = Object.entries(value);
  if (
    entries.length > 64 ||
    entries.some(
      ([key, item]) =>
        key.length === 0 ||
        key.length > 128 ||
        typeof item !== "string" ||
        item.length > 1024,
    )
  ) {
    return undefined;
  }
  return Object.fromEntries(entries) as Readonly<Record<string, string>>;
}

function resourceKind(
  relativePath: string,
): SkillResourceSummary["kind"] | undefined {
  if (relativePath.startsWith("references/")) return "REFERENCE";
  if (relativePath.startsWith("assets/")) return "ASSET";
  if (relativePath.startsWith("scripts/")) return "SCRIPT";
  return undefined;
}

function scriptResourceDetails(relativePath: string): {
  readonly available: "AVAILABLE" | "UNSUPPORTED_PLATFORM" | "UNSUPPORTED_TYPE";
  readonly runtime?: SkillScriptRuntime;
} {
  const extension = path.extname(relativePath).toLowerCase();
  if ([".js", ".mjs", ".cjs"].includes(extension)) {
    return { available: "AVAILABLE", runtime: "JAVASCRIPT" };
  }
  if (extension === ".py") {
    return { available: "AVAILABLE", runtime: "PYTHON" };
  }
  if (extension === ".ps1") {
    return process.platform === "win32"
      ? { available: "AVAILABLE", runtime: "POWERSHELL" }
      : { available: "UNSUPPORTED_PLATFORM", runtime: "POWERSHELL" };
  }
  if (extension === ".sh") {
    return process.platform === "darwin"
      ? { available: "AVAILABLE", runtime: "SHELL" }
      : { available: "UNSUPPORTED_PLATFORM", runtime: "SHELL" };
  }
  return { available: "UNSUPPORTED_TYPE" };
}

function decodeRuntimeText(bytes: Uint8Array, name: string): string {
  if (bytes.byteLength > MAX_SCRIPT_BYTES) {
    throw new SkillLibraryError("SKILL_TOO_LARGE", `${name} 超过 1 MiB。`);
  }
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (!content.includes("\0")) return content;
  } catch {
    // 统一在下方返回不包含内部路径的固定错误。
  }
  throw new SkillLibraryError("INVALID_SKILL", `${name} 不是普通 UTF-8 文本。`);
}

function requireResourcePath(relativePath: string, directory: string): void {
  const portable = relativePath.replaceAll("\\", "/");
  if (
    portable !== relativePath ||
    !portable.startsWith(`${directory}/`) ||
    portable.endsWith("/") ||
    portable
      .split("/")
      .some((part) => part.length === 0 || part === "." || part === "..")
  ) {
    throw new SkillLibraryError("UNSAFE_ENTRY", "技能资源路径不正确。");
  }
}

function compareFiles(
  current: readonly SkillFile[],
  incoming: readonly SkillFile[],
): readonly SkillFileChange[] {
  const currentMap = new Map(
    current.map((file) => [file.relativePath, file.digest]),
  );
  const incomingMap = new Map(
    incoming.map((file) => [file.relativePath, file.digest]),
  );
  const paths = new Set([...currentMap.keys(), ...incomingMap.keys()]);
  return [...paths].sort().flatMap((filePath): SkillFileChange[] => {
    const before = currentMap.get(filePath);
    const after = incomingMap.get(filePath);
    if (before === undefined) return [{ path: filePath, type: "ADDED" }];
    if (after === undefined) return [{ path: filePath, type: "REMOVED" }];
    return before === after ? [] : [{ path: filePath, type: "CHANGED" }];
  });
}

async function writeSnapshot(
  target: string,
  files: readonly SkillFile[],
): Promise<void> {
  for (const file of files) {
    const destination = path.join(target, ...file.relativePath.split("/"));
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, file.bytes, { flag: "wx" });
  }
}

function isMissing(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}
