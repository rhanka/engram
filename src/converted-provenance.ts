/**
 * Provenance of a CONVERTED document: original PDF -> converted markdown -> citation.
 *
 * A PDF corpus never reaches the extractor as PDF: `src/pdf-ocr.ts` converts each
 * paper into `.graphify/converted/pdf/<stem>.md` and the pipeline extracts (and
 * cites) THAT markdown. So every citation's `source_file` points at the
 * conversion output, and the document the user actually owns — the PDF, with its
 * pagination, figures and layout — is nowhere in the citation record. A reader
 * asked to "open the source" gets an OCR transcript instead of the paper.
 *
 * The original path is not lost, though: the converter records it in up to three
 * carriers next to (or inside) the markdown. This module reads them back and
 * turns the pair into an explicit, serializable chain so a downstream viewer can
 * offer the ORIGINAL document. Two deliberate properties:
 *
 *   - Recording the chain and BUNDLING the originals are separate decisions.
 *     A provenance map for a whole corpus is a few thousand short strings; the
 *     originals behind it can be tens of gigabytes. The map is therefore always
 *     cheap enough to emit, and the copy stays opt-in
 *     (`--include-original-sources`).
 *   - Nothing here is allowed to fail an export. Every carrier is best-effort:
 *     a missing, truncated or hand-edited sidecar yields `null`, never a throw.
 *     Provenance is an enrichment; losing it must never cost the bundle.
 */

import { existsSync, openSync, readFileSync, readSync, closeSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Schema stamp of the emitted `sources/provenance.json`. */
export const CITED_SOURCE_PROVENANCE_SCHEMA = "graphify_cited_source_provenance_v1";

/**
 * Bundle-relative location of the provenance sidecar. It sits INSIDE `sources/`
 * (next to the optional copies of the documents it describes) so a viewer that
 * already resolves `./sources/<locator>` finds the chain at a sibling path, and
 * so the export's existing `sources/` cleanup covers it.
 */
export const PROVENANCE_SIDECAR_RELPATH = "sources/provenance.json";

/** Which of the three carriers answered for the original path. */
export type ConvertedOriginCarrier = "prep-json" | "ocr-json" | "frontmatter";

export interface ConvertedOrigin {
  /** Absolute path of the ORIGINAL document the markdown was converted from. */
  original: string;
  /** How it was converted (`graphify_conversion`), when known. */
  conversion?: string;
  /** Which carrier answered: "prep-json" | "ocr-json" | "frontmatter". */
  via: ConvertedOriginCarrier;
}

/** The frontmatter key carrying the absolute original path (JSON-quoted). */
const FRONTMATTER_SOURCE_KEY = "graphify_source_file";
/** The frontmatter key carrying the conversion provider label. */
const FRONTMATTER_CONVERSION_KEY = "graphify_conversion";

/**
 * How many leading bytes of a converted markdown are scanned for frontmatter.
 * The block the converter writes is two keys long; the body behind it can be a
 * multi-MB OCR transcript, and provenance resolution runs once per cited
 * document, so the file is deliberately NOT read whole.
 */
const FRONTMATTER_SCAN_BYTES = 8192;

/** Parse JSON from disk, or null for missing/unreadable/corrupt files. */
function readJsonSafe(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** A trimmed non-empty string, or null for anything else. */
function safeString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

/**
 * Read at most {@link FRONTMATTER_SCAN_BYTES} leading bytes of `path`. Returns
 * null when the file cannot be opened. Reading a prefix (rather than the whole
 * file) keeps provenance resolution O(corpus size in DOCUMENTS), not in bytes.
 */
function readHead(path: string): string | null {
  let fd: number | null = null;
  try {
    fd = openSync(path, "r");
    const buffer = Buffer.allocUnsafe(FRONTMATTER_SCAN_BYTES);
    const bytesRead = readSync(fd, buffer, 0, FRONTMATTER_SCAN_BYTES, 0);
    return buffer.toString("utf-8", 0, bytesRead);
  } catch {
    return null;
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd);
      } catch {
        /* best-effort */
      }
    }
  }
}

/**
 * Extract the two `graphify_*` keys from a converted markdown's LEADING YAML
 * frontmatter block (`---` … `---`).
 *
 * Hand-parsed on purpose: the converter writes exactly two flat scalar keys
 * (`graphify_source_file`, JSON-quoted so Windows separators and non-ASCII
 * survive, and `graphify_conversion`), and pulling a YAML dependency into the
 * core just to read them would be a real cost for no gain. Values are accepted
 * both JSON-quoted and bare; anything else in the block is ignored. Only the
 * FIRST block counts — a `---` further down the document is body content (a
 * horizontal rule), not metadata.
 */
export function parseConvertedFrontmatter(head: string): {
  source_file?: string;
  conversion?: string;
} {
  const text = head.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return {};
  const out: { source_file?: string; conversion?: string } = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") break;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1];
    const value = decodeScalar(match[2] ?? "");
    if (!value) continue;
    if (key === FRONTMATTER_SOURCE_KEY) out.source_file = value;
    else if (key === FRONTMATTER_CONVERSION_KEY) out.conversion = value;
  }
  return out;
}

/**
 * Decode one frontmatter scalar. A leading `"` means the writer used
 * `JSON.stringify` (paths with spaces, quotes, accents or backslashes), so the
 * value round-trips through `JSON.parse`; a malformed quoted value degrades to
 * the raw text with its outer quotes stripped rather than being dropped.
 */
function decodeScalar(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === "string") return parsed.trim();
    } catch {
      return trimmed.replace(/^"|"$/g, "").trim();
    }
  }
  return trimmed;
}

/** `<dir>/<stem>.md` -> `<dir>/<stem>.<suffix>` (the converter's sidecar naming). */
function sidecarPath(markdownPath: string, suffix: string): string {
  return markdownPath.replace(/\.md$/i, suffix);
}

/**
 * Resolve the ORIGINAL document behind a CONVERTED markdown path.
 *
 * Carriers are consulted in decreasing order of authority, FIRST HIT WINS:
 *   1. `<stem>.prep.json` — the preparation record (`writeMetadata`), the
 *      richest and the one written for every provider;
 *   2. `<stem>.ocr.json` — the OCR page-geometry sidecar;
 *   3. the markdown's own YAML frontmatter.
 * All three are optional in the field: a corpus converted by an older graphify
 * (or copied without its sidecars) frequently has only 2 and 3, which is why
 * every carrier is tried rather than trusting the canonical one.
 *
 * The conversion LABEL is filled from whichever carrier knows it, falling back
 * to the frontmatter's `graphify_conversion` when the winning carrier does not
 * name a provider (the `.ocr.json` sidecar does not). `via` always reports who
 * answered for the PATH — the identity-bearing field — not for the label.
 *
 * Returns null when `markdownPath` is not a conversion output, or when no
 * carrier yields an original path.
 */
export function resolveConvertedOrigin(markdownPath: string): ConvertedOrigin | null {
  if (!/\.md$/i.test(markdownPath)) return null;

  let original: string | null = null;
  let via: ConvertedOriginCarrier | null = null;
  let conversion: string | null = null;

  // 1. <stem>.prep.json — { source_file, provider, ... }.
  const prep = readJsonSafe(sidecarPath(markdownPath, ".prep.json"));
  if (prep) {
    const found = safeString(prep.source_file);
    if (found) {
      original = found;
      via = "prep-json";
      conversion = safeString(prep.provider);
    }
  }

  // 2. <stem>.ocr.json — { source_file, sha256, model, pages }.
  if (!original) {
    const ocr = readJsonSafe(sidecarPath(markdownPath, ".ocr.json"));
    if (ocr) {
      const found = safeString(ocr.source_file);
      if (found) {
        original = found;
        via = "ocr-json";
        // The OCR sidecar records the MODEL, not the conversion pipeline, so the
        // label is left to the frontmatter fallback below.
        conversion = safeString(ocr.conversion) ?? safeString(ocr.provider);
      }
    }
  }

  // 3. The markdown's own frontmatter (also the label fallback for 1 and 2).
  if (!original || !conversion) {
    const head = readHead(markdownPath);
    if (head !== null) {
      const front = parseConvertedFrontmatter(head);
      if (!original && front.source_file) {
        original = front.source_file;
        via = "frontmatter";
      }
      if (!conversion && front.conversion) conversion = front.conversion;
    }
  }

  if (!original || !via) return null;
  return { original, ...(conversion ? { conversion } : {}), via };
}

/** One cited locator's resolved provenance chain, as serialized in the sidecar. */
export interface ProvenanceEntry {
  /** Project-relative path of the original when it lives under a root, else absolute. */
  original: string;
  /** Conversion provider label (`graphify_conversion`), when known. */
  conversion?: string;
  /** Which carrier answered for the original path. */
  via: string;
  /** True when the original was copied into the bundle (openable offline). */
  bundled: boolean;
}

/** The `sources/provenance.json` payload: locator -> provenance chain. */
export interface CitedSourceProvenance {
  schema: string;
  documents: Record<string, ProvenanceEntry>;
}

export interface BuildCitedSourceProvenanceOptions {
  /**
   * Roots the cited locators (and the resolved originals) are interpreted
   * against, in priority order — typically the project root then the state dir.
   */
  roots: string[];
  /**
   * Whether the original at this project-relative path was copied into the
   * bundle. Called only for originals that could be relativised (an original
   * outside every root can never be mirrored). Default: nothing is bundled.
   */
  isBundled?: (originalRel: string) => boolean;
}

/**
 * Find the on-disk file a cited locator names: absolute locators are used as-is,
 * relative ones are tried against each root in order (the same resolution
 * `emitCitedSources` performs). Returns null when nothing exists.
 */
function resolveLocatorPath(locator: string, roots: string[]): string | null {
  const trimmed = locator.trim().replace(/^\.\//, "");
  if (!trimmed) return null;
  // A URL locator names no local file (and `isAbsolute` would not catch it).
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return null;
  if (isAbsolute(trimmed)) return existsSync(trimmed) ? trimmed : null;
  for (const root of roots) {
    const candidate = join(root, trimmed);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Express `target` relative to the FIRST root that contains it, with `/`
 * separators (mirroring `normalizeSourceRelPath`'s bundle convention so the
 * viewer can fetch `./sources/<original>` when the file was bundled).
 *
 * An original that escapes every root (a corpus kept outside the project) keeps
 * its ABSOLUTE path and is still recorded: the chain is worth showing as a
 * breadcrumb — "this came from /archive/2019/report.pdf" — even when the bundle
 * cannot serve the bytes.
 */
export function relativizeToRoots(target: string, roots: string[]): string {
  const absolute = resolve(target);
  for (const root of roots) {
    const resolvedRoot = resolve(root);
    const rel = relative(resolvedRoot, absolute);
    if (!rel || rel.startsWith("..") || isAbsolute(rel)) continue;
    return rel.split(sep).join("/");
  }
  return absolute;
}

/**
 * Build the locator -> entry map for a set of cited locators.
 *
 * Locators that do not resolve on disk, or that resolve to a document with no
 * recorded conversion (a plain `.md` the user wrote), are simply absent from the
 * map: only the PDF-derived subset of a mixed corpus carries a chain, and the
 * viewer treats "no entry" as "the cited file is the original".
 */
export function buildCitedSourceProvenance(
  locators: Iterable<string>,
  options: BuildCitedSourceProvenanceOptions,
): CitedSourceProvenance {
  const roots = options.roots.map((root) => resolve(root));
  const documents: Record<string, ProvenanceEntry> = {};
  // Sorted so the emitted sidecar is byte-stable across runs (it is hashed by
  // the workspace manifest and diffed by humans).
  for (const locator of [...locators].sort()) {
    const trimmed = locator.trim();
    if (!trimmed || documents[trimmed]) continue;
    const markdownPath = resolveLocatorPath(trimmed, roots);
    if (!markdownPath) continue;
    const origin = resolveConvertedOrigin(markdownPath);
    if (!origin) continue;
    const original = relativizeToRoots(origin.original, roots);
    const bundled =
      !isAbsolute(original) && options.isBundled ? options.isBundled(original) : false;
    documents[trimmed] = {
      original,
      ...(origin.conversion ? { conversion: origin.conversion } : {}),
      via: origin.via,
      bundled,
    };
  }
  return { schema: CITED_SOURCE_PROVENANCE_SCHEMA, documents };
}
