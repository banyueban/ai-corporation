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

const MAX_SKILL_FILES = 256;
const MAX_SKILL_BYTES = 10 * 1024 * 1024;
const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

export interface SkillSummary {
  readonly description: string;
  readonly directory: string;
  readonly name: string;
}

export interface SkillFileChange {
  readonly path: string;
  readonly type: "ADDED" | "CHANGED" | "REMOVED";
}

export interface SkillImportPreview {
  readonly changes: readonly SkillFileChange[];
  readonly description: string;
  readonly digest: string;
  readonly name: string;
}

interface SkillFile {
  readonly bytes: Uint8Array;
  readonly digest: string;
  readonly relativePath: string;
}

interface SkillSnapshot {
  readonly description: string;
  readonly digest: string;
  readonly files: readonly SkillFile[];
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
        description: snapshot.description,
        directory: path.join(this.rootDirectory, snapshot.name),
        name: snapshot.name,
      });
    }
    return skills.sort((left, right) => left.name.localeCompare(right.name));
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
      changes: compareFiles(current?.files ?? [], incoming.files),
      description: incoming.description,
      digest: incoming.digest,
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
      description: incoming.description,
      directory: target,
      name: incoming.name,
    };
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

function parseSkillMarkdown(markdown: string): {
  readonly description: string;
  readonly name: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(markdown);
  const header = match?.[1];
  if (header === undefined) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 缺少 YAML 头信息。 ",
    );
  }
  const fields = new Map<string, string>();
  for (const line of header.split(/\r?\n/u)) {
    const field = /^([a-z-]+):\s*(.+)$/u.exec(line);
    const key = field?.[1];
    const value = field?.[2];
    if (key !== undefined && value !== undefined) {
      fields.set(key, stripQuotes(value.trim()));
    }
  }
  const name = fields.get("name");
  const description = fields.get("description");
  if (
    name === undefined ||
    !SKILL_NAME_PATTERN.test(name) ||
    name.length > 64 ||
    description === undefined ||
    description.length === 0 ||
    description.length > 1024
  ) {
    throw new SkillLibraryError(
      "INVALID_SKILL",
      "SKILL.md 的 name 或 description 不符合要求。",
    );
  }
  return { description, name };
}

function stripQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
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
