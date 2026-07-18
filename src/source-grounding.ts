/**
 * Shared, source-centric grounding substrate.
 *
 * Citation grounding and typed entity linking intentionally share parsing,
 * normalized-to-raw relocation, and the verbatim gate. `rawSource` remains
 * authoritative: a SourceUnit's display text may be a trim/join projection of
 * OCR lines and must never be treated as a raw-file slice.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";

/** NFKD deaccent + ascii-fold (drops combining marks, ligatures degrade). */
export function deaccent(s: string): string {
  return (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

const DOTTED_INITIAL_RUN_RE = /\b[a-z]\s*\.(?:\s*[a-z]\s*\.)+/g;

function normalizeForMatchBase(s: string): string {
  return deaccent(s ?? "")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/Œ/g, "OE")
    .replace(/Æ/g, "AE")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function foldDottedInitialSpacing(s: string): string {
  return s.replace(DOTTED_INITIAL_RUN_RE, (run) => run.replace(/\s+/g, ""));
}

/** Canonical match form used by both matching and the verbatim gate. */
export function normalizeForMatch(s: string): string {
  return foldDottedInitialSpacing(normalizeForMatchBase(s));
}

export type SourceModality = "ocr-markdown" | "plain-text";

export interface SourceUnit {
  /** Paragraph display text; OCR paragraphs can be a trim/join projection. */
  text: string;
  page: number;
  section: string;
  paragraphIndex: number;
  /** Raw-file half-open boundaries covering this unit's source lines. */
  documentStart?: number;
  documentEnd?: number;
  /** Normalized unit text and its per-character raw document offsets. */
  normalizedText?: string;
  normToRaw?: number[];
}

export interface ImageContext {
  basename: string;
  page: number;
  section: string;
  prev: string;
  next: string;
}

export interface ParsedSource {
  modality: SourceModality;
  units: SourceUnit[];
  sectionToIndices: Map<string, number[]>;
  images: Map<string, ImageContext>;
  pageCount: number;
  /** Original file contents; the sole authority for occurrence slices. */
  rawSource?: string;
  /** Leading YAML-ish front matter, excluded from content units. */
  frontMatter?: Record<string, string>;
}

/** Detect modality from a source path. `.md` → OCR-markdown, else plain-text. */
export function detectModality(sourceFile: string): SourceModality {
  return /\.(md|markdown)$/i.test(sourceFile) ? "ocr-markdown" : "plain-text";
}

const FRONT_MATTER_KEY = /^[a-z_]+:\s/i;

interface BufferedLine {
  text: string;
  start: number;
  end: number;
}

function lineStarts(raw: string, lines: string[]): number[] {
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  return starts;
}

function trimmedLine(rawLine: string, start: number): BufferedLine | null {
  const text = rawLine.trim();
  if (!text) return null;
  const leading = rawLine.length - rawLine.trimStart().length;
  const trailing = rawLine.trimEnd().length;
  return { text, start: start + leading, end: start + trailing };
}

function frontMatterValue(line: string): [string, string] | null {
  const match = /^([a-zA-Z0-9_-]+):\s*(.*)$/u.exec(line.trim());
  if (!match) return null;
  const key = match[1]!;
  const value = match[2]!.trim().replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/u, "$1$2");
  return [key, value];
}

function makeUnit(
  raw: string,
  lines: BufferedLine[],
  page: number,
  section: string,
  paragraphIndex: number,
): SourceUnit {
  const documentStart = lines[0]!.start;
  const documentEnd = lines[lines.length - 1]!.end;
  const table = buildNormToRawMap(raw.slice(documentStart, documentEnd));
  return {
    text: lines.map((line) => line.text).join(" ").trim(),
    page,
    section,
    paragraphIndex,
    documentStart,
    documentEnd,
    normalizedText: table.norm,
    normToRaw: table.map.map((offset) => documentStart + offset),
  };
}

function addUnit(
  raw: string,
  units: SourceUnit[],
  sectionToIndices: Map<string, number[]>,
  lines: BufferedLine[],
  page: number,
  section: string,
): SourceUnit | null {
  if (lines.length === 0) return null;
  const unit = makeUnit(raw, lines, page, section, units.length);
  if (!unit.text || unit.text.startsWith("![")) return null;
  units.push(unit);
  const arr = sectionToIndices.get(section) ?? [];
  arr.push(unit.paragraphIndex);
  sectionToIndices.set(section, arr);
  return unit;
}

function parseOcrMarkdown(raw: string): ParsedSource {
  const lines = raw.split("\n");
  const starts = lineStarts(raw, lines);
  const units: SourceUnit[] = [];
  const sectionToIndices = new Map<string, number[]>();
  const images = new Map<string, ImageContext>();
  const frontMatter: Record<string, string> = {};
  let page = 1;
  let section = "";
  let buf: BufferedLine[] = [];
  let pendingImages: string[] = [];
  let inFrontMatter = false;
  let frontMatterDone = false;
  let i = 0;
  if (lines[0]?.trim() === "---") {
    inFrontMatter = true;
    i = 1;
  }

  const flush = (): void => {
    const unit = addUnit(raw, units, sectionToIndices, buf, page, section);
    buf = [];
    if (!unit) return;
    for (const filename of pendingImages) {
      const ctx = images.get(filename);
      if (ctx && !ctx.next) ctx.next = unit.text;
    }
    pendingImages = [];
  };

  for (; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const s = rawLine.trim();
    if (inFrontMatter && !frontMatterDone) {
      if (s === "---") {
        frontMatterDone = true;
        inFrontMatter = false;
      } else if (s !== "" && !FRONT_MATTER_KEY.test(s)) {
        inFrontMatter = false;
        frontMatterDone = true;
        i -= 1;
      } else {
        const entry = frontMatterValue(rawLine);
        if (entry) frontMatter[entry[0]] = entry[1];
      }
      continue;
    }
    if (s === "---") {
      flush();
      page += 1;
      continue;
    }
    if (/^#{1,4}\s/.test(s)) {
      flush();
      section = s.replace(/^#{1,4}\s+/, "").trim();
      continue;
    }
    const img = /^!\[[^\]]*\]\(([^)]+)\)/.exec(s);
    if (img) {
      flush();
      const filename = basenameOf(img[1] ?? "");
      const prev = units.length > 0 ? (units[units.length - 1]?.text ?? "") : "";
      images.set(filename, { basename: filename, page, section, prev, next: "" });
      pendingImages.push(filename);
      continue;
    }
    if (s === "") {
      flush();
      continue;
    }
    const line = trimmedLine(rawLine, starts[i]!);
    if (line) buf.push(line);
  }
  flush();
  return { modality: "ocr-markdown", units, sectionToIndices, images, pageCount: page, rawSource: raw, frontMatter };
}

function parsePlainText(raw: string): ParsedSource {
  const lines = raw.split("\n");
  const starts = lineStarts(raw, lines);
  const units: SourceUnit[] = [];
  const sectionToIndices = new Map<string, number[]>();
  let section = "";
  let buf: BufferedLine[] = [];
  const flush = (): void => {
    addUnit(raw, units, sectionToIndices, buf, 1, section);
    buf = [];
  };
  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i] ?? "";
    const s = rawLine.trim();
    if (/^#{1,4}\s/.test(s)) {
      flush();
      section = s.replace(/^#{1,4}\s+/, "").trim();
      continue;
    }
    if (isHeadingLine(s, buf.length === 0)) {
      flush();
      section = s;
      continue;
    }
    if (s === "") {
      flush();
      continue;
    }
    const line = trimmedLine(rawLine, starts[i]!);
    if (line) buf.push(line);
  }
  flush();
  return {
    modality: "plain-text",
    units,
    sectionToIndices,
    images: new Map(),
    pageCount: 1,
    rawSource: raw,
    frontMatter: {},
  };
}

function isHeadingLine(s: string, atParagraphStart: boolean): boolean {
  if (!s || !atParagraphStart) return false;
  if (/^(chapter|part|book|adventure|story)\b/i.test(s) && s.length <= 80) return true;
  const words = s.split(/\s+/);
  if (words.length > 8 || s.length > 80) return false;
  const letters = s.replace(/[^a-zA-ZÀ-ÿ]/g, "");
  if (letters.length < 3) return false;
  const upper = s.replace(/[^A-ZÀ-Þ]/g, "");
  return upper.length / letters.length >= 0.7;
}

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

/** Parse any supported source modality. */
export function parseSource(raw: string, modality: SourceModality): ParsedSource {
  return modality === "ocr-markdown" ? parseOcrMarkdown(raw) : parsePlainText(raw);
}

const QUOTE_BEFORE = 110;
const QUOTE_AFTER = 210;
const QUOTE_MAXLEN = 320;
const OPEN_BOUNDARY = new Set([" ", "\n", "«", "(", '"', "“"]);
const CLOSE_BOUNDARY = new Set([" ", "\n", ".", "!", "?", "»", ")", '"', "”"]);

/** Return a RAW context window around an offset. */
export function windowQuote(text: string, offset: number): string {
  let a = Math.max(0, offset - QUOTE_BEFORE);
  let b = Math.min(text.length, offset + QUOTE_AFTER);
  while (a > 0 && !OPEN_BOUNDARY.has(text[a] ?? "")) a -= 1;
  while (b < text.length && !CLOSE_BOUNDARY.has(text[b] ?? "")) b += 1;
  let quote = text.slice(a, b).trim();
  if (a > 0) quote = "… " + quote;
  if (b < text.length) quote += " …";
  quote = quote.replace(/\s+/g, " ");
  return quote.length > QUOTE_MAXLEN ? quote.slice(0, QUOTE_MAXLEN).trim() : quote;
}

/** Hard gate shared by all grounding producers. */
export function verifyVerbatim(quote: string, normalizedSource: string): boolean {
  if (!quote) return false;
  const core = quote.replace(/^…\s*/, "").replace(/\s*…$/, "");
  const needle = normalizeForMatch(core);
  return Boolean(needle) && normalizedSource.includes(needle);
}

/** Build a normalized offset → raw offset table for one raw string. */
export function buildNormToRawMap(rawText: string): { norm: string; map: number[] } {
  const normChars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;
  let sawNonSpace = false;
  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i] ?? "";
    const piece = normalizeForMatchBase(ch);
    if (piece === "") {
      if (/\s/.test(ch)) pendingSpace = true;
      continue;
    }
    if (pendingSpace && sawNonSpace) {
      normChars.push(" ");
      map.push(i);
    }
    pendingSpace = false;
    for (const normalized of piece) {
      normChars.push(normalized);
      map.push(i);
    }
    sawNonSpace = true;
  }
  const norm = normChars.join("");
  const foldedChars: string[] = [];
  const foldedMap: number[] = [];
  let copiedUntil = 0;
  DOTTED_INITIAL_RUN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DOTTED_INITIAL_RUN_RE.exec(norm)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    for (let i = copiedUntil; i < start; i += 1) {
      foldedChars.push(norm[i] ?? "");
      foldedMap.push(map[i] ?? 0);
    }
    for (let i = start; i < end; i += 1) {
      const char = norm[i] ?? "";
      if (char === " ") continue;
      foldedChars.push(char);
      foldedMap.push(map[i] ?? 0);
    }
    copiedUntil = end;
  }
  for (let i = copiedUntil; i < norm.length; i += 1) {
    foldedChars.push(norm[i] ?? "");
    foldedMap.push(map[i] ?? 0);
  }
  return { norm: foldedChars.join(""), map: foldedMap };
}

/** Locate a normalized term's raw offset, or -1 when it is absent. */
export function rawOffsetForTerm(rawText: string, normTerm: string): number {
  if (!normTerm) return -1;
  const { norm, map } = buildNormToRawMap(rawText);
  const at = norm.indexOf(normTerm);
  return at < 0 ? -1 : (map[at] ?? -1);
}

export interface ResolveSourceOptions {
  root: string;
  searchRoots?: string[];
}

/** Resolve a source relative to the configured root and optional search roots. */
export function resolveSourcePath(sourceFile: string, options: ResolveSourceOptions): string | null {
  if (!sourceFile) return null;
  const candidates: string[] = [];
  if (isAbsolute(sourceFile)) candidates.push(sourceFile);
  candidates.push(resolvePath(options.root, sourceFile));
  for (const root of options.searchRoots ?? []) candidates.push(resolvePath(root, sourceFile));
  for (const candidate of candidates) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // Try the next location.
    }
  }
  return null;
}
