import { createHash, randomUUID } from "node:crypto";
import { constants, copyFile, lstat, readFile, rm } from "node:fs/promises";
import { mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import path from "node:path";
import mammoth from "mammoth";
import type { PiTaskAttachment } from "@ai-corporation/protocols";
import { createUuidV7 } from "./uuid-v7";

const MAX_FILES = 10;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;

export interface StoredTaskAttachment extends PiTaskAttachment {
  readonly storageName: string;
  readonly createdAt: string;
}

interface StagedAttachment extends StoredTaskAttachment {
  readonly stagedPath: string;
}

/** 保存任务附件副本，且不向 Renderer 或模型暴露真实路径。 */
export class TaskAttachmentService {
  readonly #staged = new Map<string, StagedAttachment>();
  readonly #stagingDirectory: string;
  readonly #taskDirectory: string;
  #operationQueue: Promise<void> = Promise.resolve();
  #pendingOperations = 0;

  constructor(rootDirectory: string) {
    this.#stagingDirectory = path.join(rootDirectory, "staging");
    this.#taskDirectory = path.join(rootDirectory, "tasks");
    // 待选附件不跨应用重启恢复；只清理应用自己的固定暂存目录。
    rmSync(this.#stagingDirectory, { force: true, recursive: true });
    mkdirSync(this.#stagingDirectory, { recursive: true });
    mkdirSync(this.#taskDirectory, { recursive: true });
  }

  stage(paths: readonly string[]): Promise<{
    readonly attachments: readonly PiTaskAttachment[];
    readonly rejected: readonly { displayName: string; reason: string }[];
  }> {
    return this.#enqueue(() => this.#stageNow(paths));
  }

  discard(ids: readonly string[]): Promise<number> {
    return this.#enqueue(() => this.#discardNow(ids));
  }

  async #stageNow(paths: readonly string[]): Promise<{
    readonly attachments: readonly PiTaskAttachment[];
    readonly rejected: readonly { displayName: string; reason: string }[];
  }> {
    const accepted: PiTaskAttachment[] = [];
    const rejected: { displayName: string; reason: string }[] = [];
    for (const sourcePath of paths.slice(0, MAX_FILES)) {
      const displayName = safeDisplayName(sourcePath);
      try {
        if (this.#staged.size >= MAX_FILES) {
          throw new Error("一次任务最多添加 10 个附件。 ");
        }
        const currentTotal = [...this.#staged.values()].reduce(
          (total, item) => total + item.sizeBytes,
          0,
        );
        const item = await this.#stageOne(
          sourcePath,
          displayName,
          currentTotal,
        );
        this.#staged.set(item.id, item);
        accepted.push(publicAttachment(item));
      } catch (error) {
        rejected.push({
          displayName,
          reason:
            error instanceof Error
              ? error.message.trim()
              : "无法读取这个文件。",
        });
      }
    }
    if (paths.length > MAX_FILES) {
      rejected.push({
        displayName: "其余文件",
        reason: "一次最多选择 10 个附件。",
      });
    }
    return { attachments: accepted, rejected };
  }

  async #discardNow(ids: readonly string[]): Promise<number> {
    let discarded = 0;
    for (const id of ids) {
      const item = this.#staged.get(id);
      if (item === undefined) continue;
      this.#staged.delete(id);
      await rm(item.stagedPath, { force: true });
      discarded += 1;
    }
    return discarded;
  }

  commit(
    taskId: string,
    ids: readonly string[],
  ): readonly StoredTaskAttachment[] {
    if (this.#pendingOperations > 0) {
      throw new Error("附件仍在复制，请稍后再开始任务。 ");
    }
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length !== ids.length || uniqueIds.length > MAX_FILES) {
      throw new Error("附件列表无效。 ");
    }
    const items = uniqueIds.map((id) => {
      const item = this.#staged.get(id);
      if (item === undefined) throw new Error("附件已过期，请重新选择。 ");
      return item;
    });
    const taskRoot = this.taskRoot(taskId);
    mkdirSync(taskRoot, { recursive: false });
    try {
      for (const item of items) {
        const targetPath = path.join(taskRoot, item.storageName);
        renameSync(item.stagedPath, targetPath);
        const bytes = readFileSync(targetPath);
        if (
          bytes.byteLength !== item.sizeBytes ||
          createHash("sha256").update(bytes).digest("hex") !== item.sha256
        ) {
          throw new Error("附件副本在任务开始前发生变化。 ");
        }
      }
      for (const item of items) this.#staged.delete(item.id);
      return items.map(storedAttachment);
    } catch (error) {
      rmSync(taskRoot, { force: true, recursive: true });
      throw error;
    }
  }

  rollbackTask(taskId: string): void {
    rmSync(this.taskRoot(taskId), { force: true, recursive: true });
  }

  taskRoot(taskId: string): string {
    return path.join(this.#taskDirectory, taskId);
  }

  taskFile(taskId: string, storageName: string): string {
    if (!/^[a-z0-9-]+\.(docx|pdf|txt|md)$/u.test(storageName)) {
      throw new Error("附件存储名称无效。 ");
    }
    return path.join(this.taskRoot(taskId), storageName);
  }

  async #stageOne(
    sourcePath: string,
    displayName: string,
    currentTotal: number,
  ): Promise<StagedAttachment> {
    const metadata = await lstat(sourcePath);
    if (metadata.isSymbolicLink() || !metadata.isFile()) {
      throw new Error("只能添加普通文件，不能添加文件夹或链接。 ");
    }
    if (metadata.size <= 0) throw new Error("空文件不能作为附件。 ");
    if (metadata.size > MAX_FILE_BYTES)
      throw new Error("单个附件不能超过 50 MiB。 ");
    if (currentTotal + metadata.size > MAX_TOTAL_BYTES) {
      throw new Error("本次任务的附件总大小不能超过 100 MiB。 ");
    }
    const extension = path.extname(displayName).toLowerCase();
    const mediaType = mediaTypeForExtension(extension);
    const id = createUuidV7();
    const storageName = `${randomUUID()}${extension}`;
    const stagedPath = path.join(this.#stagingDirectory, storageName);
    await copyFile(sourcePath, stagedPath, constants.COPYFILE_EXCL);
    try {
      const bytes = await readFile(stagedPath);
      if (bytes.byteLength !== metadata.size)
        throw new Error("复制附件时文件发生变化。 ");
      await validateContent(stagedPath, extension, bytes);
      return {
        id,
        displayName,
        mediaType,
        sizeBytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        storageName,
        stagedPath,
        createdAt: new Date().toISOString(),
      };
    } catch (error) {
      await rm(stagedPath, { force: true });
      throw error;
    }
  }

  #enqueue<T>(operation: () => Promise<T>): Promise<T> {
    this.#pendingOperations += 1;
    const result = this.#operationQueue.then(operation);
    this.#operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result.finally(() => {
      this.#pendingOperations -= 1;
    });
  }
}

function safeDisplayName(filePath: string): string {
  const name = path.basename(filePath).trim();
  return name.length > 0 ? name.slice(0, 255) : "未命名文件";
}

function mediaTypeForExtension(
  extension: string,
): PiTaskAttachment["mediaType"] {
  if (extension === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".txt") return "text/plain";
  if (extension === ".md") return "text/markdown";
  throw new Error("只支持 Word（.docx）、PDF、TXT 和 Markdown 文件。 ");
}

async function validateContent(
  filePath: string,
  extension: string,
  bytes: Buffer,
): Promise<void> {
  if (extension === ".pdf") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new Error("文件内容不是有效的 PDF。 ");
    }
    return;
  }
  if (extension === ".docx") {
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error("文件内容不是有效的 Word 文档。 ");
    }
    try {
      await mammoth.extractRawText({ path: filePath });
    } catch {
      throw new Error("Word 文档已损坏、加密或格式不受支持。 ");
    }
    return;
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (text.includes("\0")) throw new Error();
  } catch {
    throw new Error("文本附件必须是 UTF-8 编码。 ");
  }
}

function publicAttachment(item: StagedAttachment): PiTaskAttachment {
  return {
    id: item.id,
    displayName: item.displayName,
    mediaType: item.mediaType,
    sizeBytes: item.sizeBytes,
    sha256: item.sha256,
  };
}

function storedAttachment(item: StagedAttachment): StoredTaskAttachment {
  return {
    ...publicAttachment(item),
    storageName: item.storageName,
    createdAt: item.createdAt,
  };
}
