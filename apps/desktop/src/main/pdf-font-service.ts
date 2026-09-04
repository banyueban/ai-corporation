import { readFile } from "node:fs/promises";
import path from "node:path";

export const PDF_FONT_FAMILY = "AI Corporation Noto Sans SC";

const metadataCache = new Map<string, Promise<ReadonlyArray<FontSubset>>>();
const fontDataCache = new Map<string, Promise<string>>();

interface FontSubset {
  readonly fileName: string;
  readonly unicodeRange: string;
  readonly ranges: ReadonlyArray<readonly [number, number]>;
}

/**
 * 只把当前文档实际用到的 Noto Sans SC 字体片段嵌入 HTML。
 * 这样 PDF 不依赖操作系统字体，也不会每次塞入完整中文字体包。
 */
export async function createPdfFontCss(
  text: string,
  fontDirectory: string,
): Promise<string> {
  const codePoints = [
    ...new Set([...text].map((character) => character.codePointAt(0) ?? 0)),
  ];
  const subsets = await loadSubsets(fontDirectory);
  const required = subsets.filter((subset) =>
    subset.ranges.some(([start, end]) =>
      codePoints.some((codePoint) => codePoint >= start && codePoint <= end),
    ),
  );
  if (required.length === 0) {
    throw new Error("文档字体中没有当前内容需要的字符。 ");
  }
  const rules = await Promise.all(
    required.map(async (subset) => {
      const fontPath = path.join(fontDirectory, "files", subset.fileName);
      const base64 = await loadFontBase64(fontPath);
      return `@font-face{font-family:'${PDF_FONT_FAMILY}';font-style:normal;font-display:block;font-weight:100 900;src:url(data:font/woff2;base64,${base64}) format('woff2-variations');unicode-range:${subset.unicodeRange}}`;
    }),
  );
  return rules.join("");
}

async function loadSubsets(
  fontDirectory: string,
): Promise<ReadonlyArray<FontSubset>> {
  const cached = metadataCache.get(fontDirectory);
  if (cached !== undefined) return cached;
  const loading = readFile(path.join(fontDirectory, "unicode.json"), "utf8")
    .then((contents) => parseSubsets(contents))
    .catch((error: unknown) => {
      throw new Error("软件内置的 PDF 中文字体不完整。 ", { cause: error });
    });
  metadataCache.set(fontDirectory, loading);
  return loading;
}

function parseSubsets(contents: string): ReadonlyArray<FontSubset> {
  const parsed: unknown = JSON.parse(contents);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid font metadata");
  }
  return Object.entries(parsed).map(([name, value]) => {
    if (typeof value !== "string") throw new Error("Invalid font range");
    const fileName = subsetFileName(name);
    const unicodeRange = value.replace(/\s+/gu, "");
    const ranges = unicodeRange.split(",").map(parseUnicodeRange);
    return { fileName, unicodeRange, ranges };
  });
}

function subsetFileName(name: string): string {
  const numbered = /^\[(\d{1,3})\]$/u.exec(name);
  if (numbered !== null) {
    return `noto-sans-sc-${numbered[1]}-wght-normal.woff2`;
  }
  if (!/^(?:cyrillic|latin|latin-ext|vietnamese)$/u.test(name)) {
    throw new Error("Invalid font subset name");
  }
  return `noto-sans-sc-${name}-wght-normal.woff2`;
}

function parseUnicodeRange(value: string): readonly [number, number] {
  const match = /^U\+([0-9a-f?]{1,6})(?:-([0-9a-f]{1,6}))?$/iu.exec(value);
  if (match === null) throw new Error("Invalid font Unicode range");
  const startText = match[1] ?? "0";
  const endText = match[2] ?? startText.replace(/\?/gu, "f");
  const start = Number.parseInt(startText.replace(/\?/gu, "0"), 16);
  const end = Number.parseInt(endText, 16);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start > end
  ) {
    throw new Error("Invalid font Unicode range bounds");
  }
  return [start, end];
}

function loadFontBase64(fontPath: string): Promise<string> {
  const cached = fontDataCache.get(fontPath);
  if (cached !== undefined) return cached;
  const loading = readFile(fontPath).then((bytes) => bytes.toString("base64"));
  fontDataCache.set(fontPath, loading);
  return loading;
}
