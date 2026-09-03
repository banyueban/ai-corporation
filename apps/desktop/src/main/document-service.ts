import { readFile } from "node:fs/promises";
import path from "node:path";
import mammoth from "mammoth";
import {
  Document,
  AlignmentType,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import type { PiTaskAttachment } from "@ai-corporation/protocols";

export interface DocumentReadResult {
  readonly attachmentId: string;
  readonly displayName: string;
  readonly content: string;
  readonly offset: number;
  readonly nextOffset: number;
  readonly totalCharacters: number;
  readonly hasMore: boolean;
}

/** 将附件转换成模型可读的规范化 Markdown，并生成普通 Word 文档。 */
export class DocumentService {
  async readAttachment(input: {
    readonly attachment: PiTaskAttachment;
    readonly filePath: string;
    readonly offset: number;
    readonly maxCharacters: number;
  }): Promise<DocumentReadResult> {
    const extension = path.extname(input.attachment.displayName).toLowerCase();
    let markdown: string;
    if (extension === ".txt" || extension === ".md") {
      const bytes = await readFile(input.filePath);
      try {
        markdown = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      } catch {
        throw new Error("文本附件不是有效的 UTF-8 编码。 ");
      }
    } else if (extension === ".docx") {
      try {
        const result = await mammoth.convertToHtml(
          { path: input.filePath },
          { includeDefaultStyleMap: true },
        );
        markdown = htmlToMarkdown(result.value);
      } catch {
        throw new Error("Word 文档已损坏、加密或无法读取。 ");
      }
    } else if (extension === ".pdf") {
      markdown = await readPdf(input.filePath);
    } else {
      throw new Error("这个附件格式不受支持。 ");
    }
    const normalized = normalizeMarkdown(markdown);
    if (normalized.length === 0) {
      throw new Error(
        extension === ".pdf"
          ? "PDF 没有可读取的文字层；扫描件首版暂不支持 OCR。"
          : "文档中没有可读取的文字。",
      );
    }
    const offset = Math.min(input.offset, normalized.length);
    const content = normalized.slice(offset, offset + input.maxCharacters);
    const nextOffset = offset + content.length;
    return {
      attachmentId: input.attachment.id,
      displayName: input.attachment.displayName,
      content,
      offset,
      nextOffset,
      totalCharacters: normalized.length,
      hasMore: nextOffset < normalized.length,
    };
  }

  async createDocx(markdown: string): Promise<Uint8Array> {
    const children = markdownToDocxBlocks(normalizeMarkdown(markdown));
    const document = new Document({
      numbering: {
        config: [
          {
            reference: "document-numbering",
            levels: [
              {
                level: 0,
                format: LevelFormat.DECIMAL,
                text: "%1.",
                alignment: AlignmentType.START,
              },
            ],
          },
        ],
      },
      sections: [{ children }],
    });
    return new Uint8Array(await Packer.toBuffer(document));
  }

  createPdfHtml(markdown: string): string {
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>${pdfStyles()}</style></head><body>${markdownToSafeHtml(normalizeMarkdown(markdown))}</body></html>`;
  }
}

async function readPdf(filePath: string): Promise<string> {
  try {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // 打包后的 Main 没有独立 worker 文件路径，显式加载官方 worker 处理器，
    // 让 PDF.js 在当前受控进程内解析，而不是尝试网络或猜测相对路径。
    const worker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
    (
      globalThis as typeof globalThis & {
        pdfjsWorker?: { WorkerMessageHandler: unknown };
      }
    ).pdfjsWorker = worker;
    const bytes = new Uint8Array(await readFile(filePath));
    const loadingTask = pdfjs.getDocument({
      data: bytes,
      disableFontFace: true,
      useSystemFonts: false,
    });
    try {
      const document = await loadingTask.promise;
      const pages: string[] = [];
      for (
        let pageNumber = 1;
        pageNumber <= document.numPages;
        pageNumber += 1
      ) {
        const page = await document.getPage(pageNumber);
        const text = await page.getTextContent();
        const lines = text.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ")
          .replace(/\s+/gu, " ")
          .trim();
        if (lines.length > 0) pages.push(`## 第 ${pageNumber} 页\n\n${lines}`);
      }
      return pages.join("\n\n");
    } finally {
      await loadingTask.destroy();
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("扫描件")) throw error;
    throw new Error("PDF 已损坏、加密或无法读取。 ", { cause: error });
  }
}

function htmlToMarkdown(html: string): string {
  return decodeEntities(
    html
      .replace(
        /<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/giu,
        (_all, level, text) =>
          `${"#".repeat(Number(level))} ${stripTags(text)}\n\n`,
      )
      .replace(
        /<li[^>]*>([\s\S]*?)<\/li>/giu,
        (_all, text) => `- ${stripTags(text)}\n`,
      )
      .replace(/<tr[^>]*>([\s\S]*?)<\/tr>/giu, (_all, row) => {
        const cells = [
          ...String(row).matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/giu),
        ].map((match) => stripTags(match[1] ?? "").trim());
        return cells.length > 0 ? `| ${cells.join(" | ")} |\n` : "";
      })
      .replace(
        /<p[^>]*>([\s\S]*?)<\/p>/giu,
        (_all, text) => `${stripTags(text)}\n\n`,
      )
      .replace(/<br\s*\/?\s*>/giu, "\n")
      .replace(/<[^>]+>/gu, ""),
  );
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/gu, "");
}

function decodeEntities(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/giu,
    (_all, entity: string) => {
      if (entity.startsWith("#x"))
        return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith("#"))
        return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return named[entity.toLowerCase()] ?? `&${entity};`;
    },
  );
}

function normalizeMarkdown(markdown: string): string {
  return markdown
    .replace(/\r\n?/gu, "\n")
    .replace(/[ \t]+$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function markdownToDocxBlocks(markdown: string): Array<Paragraph | Table> {
  const lines = markdown.split("\n");
  const blocks: Array<Paragraph | Table> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const tableLines: string[] = [];
    while (index < lines.length && /^\s*\|.*\|\s*$/u.test(lines[index] ?? "")) {
      tableLines.push(lines[index] ?? "");
      index += 1;
    }
    if (tableLines.length > 0) {
      index -= 1;
      blocks.push(markdownTable(tableLines));
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      const levels = [
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
        HeadingLevel.HEADING_6,
      ] as const;
      const headingMarks = heading[1] ?? "#";
      const headingLevel =
        levels[headingMarks.length - 1] ?? HeadingLevel.HEADING_1;
      blocks.push(
        new Paragraph({
          heading: headingLevel,
          children: [new TextRun(heading[2] ?? "")],
        }),
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/u.exec(line);
    if (bullet !== null) {
      blocks.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun(bullet[1] ?? "")],
        }),
      );
      continue;
    }
    const numbered = /^\s*\d+[.)]\s+(.+)$/u.exec(line);
    if (numbered !== null) {
      blocks.push(
        new Paragraph({
          numbering: { reference: "document-numbering", level: 0 },
          children: [new TextRun(numbered[1] ?? "")],
        }),
      );
      continue;
    }
    blocks.push(new Paragraph({ children: [new TextRun(line)] }));
  }
  return blocks.length > 0 ? blocks : [new Paragraph("")];
}

function markdownTable(lines: readonly string[]): Table {
  const rows = lines
    .filter((line) => !/^\s*\|?\s*:?-{3,}/u.test(line))
    .map((line) =>
      line
        .trim()
        .replace(/^\||\|$/gu, "")
        .split("|")
        .map((cell) => cell.trim()),
    )
    .map(
      (cells) =>
        new TableRow({
          children: cells.map(
            (cell) => new TableCell({ children: [new Paragraph(cell)] }),
          ),
        }),
    );
  return new Table({
    rows:
      rows.length > 0
        ? rows
        : [
            new TableRow({
              children: [new TableCell({ children: [new Paragraph("")] })],
            }),
          ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function markdownToSafeHtml(markdown: string): string {
  const lines = markdown.split("\n");
  const output: string[] = [];
  let list: "ul" | "ol" | undefined;
  const closeList = () => {
    if (list !== undefined) output.push(`</${list}>`);
    list = undefined;
  };
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const heading = /^(#{1,6})\s+(.+)$/u.exec(line);
    if (heading !== null) {
      closeList();
      const headingMarks = heading[1] ?? "#";
      output.push(
        `<h${headingMarks.length}>${escapeHtml(heading[2] ?? "")}</h${headingMarks.length}>`,
      );
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/u.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/u.exec(line);
    if (bullet !== null || numbered !== null) {
      const target = bullet !== null ? "ul" : "ol";
      if (list !== target) {
        closeList();
        list = target;
        output.push(`<${target}>`);
      }
      output.push(`<li>${escapeHtml((bullet ?? numbered)?.[1] ?? "")}</li>`);
      continue;
    }
    if (/^\s*\|.*\|\s*$/u.test(line)) {
      closeList();
      const tableLines: string[] = [];
      while (
        index < lines.length &&
        /^\s*\|.*\|\s*$/u.test(lines[index] ?? "")
      ) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      index -= 1;
      output.push(
        `<table>${tableLines
          .filter((line) => !/^\s*\|?\s*:?-{3,}/u.test(line))
          .map(
            (line) =>
              `<tr>${line
                .trim()
                .replace(/^\||\|$/gu, "")
                .split("|")
                .map((cell) => `<td>${escapeHtml(cell.trim())}</td>`)
                .join("")}</tr>`,
          )
          .join("")}</table>`,
      );
      continue;
    }
    closeList();
    if (line.trim().length > 0) output.push(`<p>${escapeHtml(line)}</p>`);
  }
  closeList();
  return output.join("");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;");
}

function pdfStyles(): string {
  return "@page{size:A4;margin:20mm}body{font-family:'Microsoft YaHei','PingFang SC',sans-serif;color:#111;font-size:11pt;line-height:1.65}h1,h2,h3,h4,h5,h6{page-break-after:avoid}table{border-collapse:collapse;width:100%;margin:10px 0}td{border:1px solid #999;padding:6px;vertical-align:top}p{white-space:pre-wrap}li{margin:3px 0}";
}
