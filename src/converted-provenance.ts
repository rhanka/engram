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

import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

/** Schema stamp of the emitted `sources/provenance.json`. */
export const CITED_SOURCE_PROVENANCE_SCHEMA = "engram_cited_source_provenance_v1";

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
 * Frontmatter keys carrying the WEB address a document was acquired from.
 *
 * Two spellings because two writers exist and neither is going to change:
 * `src/ingest.ts` stamps a bare `source_url` on the markdown it renders from a
 * webpage/tweet/arXiv fetch, and `src/google-workspace.ts` stamps the same key
 * beside a Drive export. A `graphify_`-prefixed spelling is accepted for
 * symmetry with the conversion keys. Unlike a path, a URL is unambiguous, so
 * reading the bare key here cannot collide with an unrelated document's
 * metadata the way a bare `source_file` would.
 */
const FRONTMATTER_URL_KEYS = ["graphify_source_url", "source_url"];

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
  source_url?: string;
} {
  const text = head.replace(/^﻿/, "");
  const lines = text.split(/\r?\n/);
  if ((lines[0] ?? "").trim() !== "---") return {};
  const out: { source_file?: string; conversion?: string; source_url?: string } = {};
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    if (line.trim() === "---") break;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const key = match[1] ?? "";
    const value = decodeScalar(match[2] ?? "");
    if (!value) continue;
    if (key === FRONTMATTER_SOURCE_KEY) out.source_file = value;
    else if (key === FRONTMATTER_CONVERSION_KEY) out.conversion = value;
    // First spelling wins, so the graphify_-prefixed key outranks the bare one.
    else if (FRONTMATTER_URL_KEYS.includes(key) && !out.source_url && isUrl(value)) {
      out.source_url = value;
    }
  }
  return out;
}

/** True for an absolute `scheme://…` locator — the only shape a web link takes. */
export function isUrl(value: string): boolean {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim());
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

/**
 * `<dir>/<stem>.<ext>` -> `<dir>/<stem><suffix>` (the converter's sidecar naming).
 *
 * The stem is taken by dropping the FINAL extension, whatever it is — not just
 * `.md`. The converter writes `<stem>.md` beside `<stem>.prep.json`, so for
 * markdown this is what it always was; generalising it lets the same lookup find
 * the conversion record of a NON-markdown artifact, which is what a chain longer
 * than one rung needs (a PDF that was itself produced from something else).
 */
function sidecarPath(documentPath: string, suffix: string): string {
  return `${documentPath.replace(/\.[^.\\/]+$/, "")}${suffix}`;
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

/**
 * Resolve the document ANY local artifact was produced from.
 *
 * For markdown this is {@link resolveConvertedOrigin} unchanged. For anything
 * else it consults the two conversion sidecars directly, without the
 * markdown-only guard: a `.prep.json` next to a PDF is an unambiguous statement
 * that the PDF was produced from the file it names, and refusing to read it
 * would truncate every chain at its first non-markdown rung — which is exactly
 * where an interesting chain (HTML -> PDF -> OCR markdown) starts.
 */
function resolveDocumentOrigin(documentPath: string): ConvertedOrigin | null {
  if (/\.md$/i.test(documentPath)) return resolveConvertedOrigin(documentPath);

  for (const [suffix, carrier] of [
    [".prep.json", "prep-json"],
    [".ocr.json", "ocr-json"],
  ] as const) {
    const sidecar = readJsonSafe(sidecarPath(documentPath, suffix));
    if (!sidecar) continue;
    const found = safeString(sidecar.source_file);
    if (!found) continue;
    const conversion = safeString(sidecar.provider) ?? safeString(sidecar.conversion);
    return { original: found, ...(conversion ? { conversion } : {}), via: carrier };
  }
  return null;
}

// ---------------------------------------------------------------------------
// ACQUISITION origin: the WEB address a local artifact was downloaded from.
//
// This is the rung the chain was missing. `resolveConvertedOrigin` walks
// converted markdown back to the local document it came from, and stops there —
// but that document was itself acquired from somewhere, and for a downloaded PDF
// nothing recorded where. `src/ingest.ts` renders frontmatter carrying
// `source_url` for the branches that produce MARKDOWN (webpage/tweet/arXiv), yet
// its `downloadBinary` path — the one that fetches a PDF — wrote the bytes and
// dropped the URL on the floor. So a corpus of downloaded PDFs, OCR'd to
// markdown and then cited, kept a chain that ended at a local path with no way
// back to the page it came from.
//
// `<file>.origin.json` is that record: a tiny sidecar written AT ACQUISITION
// time, next to the artifact, in the same naming convention the OCR sidecars
// already use. It is deliberately separate from `.prep.json` (which describes a
// CONVERSION, and is written by a different step at a different time) and is
// read here as one more best-effort carrier.
// ---------------------------------------------------------------------------

/** Schema stamp of `<file>.origin.json`. */
export const SOURCE_ORIGIN_SCHEMA = "engram_source_origin_v1";

export interface SourceOriginSidecar {
  schema: string;
  /** The URL the artifact was downloaded from. */
  source_url: string;
  /** ISO timestamp of the fetch, when known. */
  retrieved_at?: string;
  /** Response content-type, when known. */
  content_type?: string;
}

/** `<file>` -> `<file>.origin.json` (suffix APPENDED, so `a.pdf` -> `a.pdf.origin.json`). */
export function sourceOriginSidecarPath(filePath: string): string {
  return `${filePath}.origin.json`;
}

/**
 * Record where a just-downloaded artifact came from. Best-effort by contract:
 * an unwritable sidecar must never fail the download that produced the bytes,
 * so failures are swallowed and reported as `false`.
 */
export function writeSourceOriginSidecar(
  filePath: string,
  origin: { source_url: string; retrieved_at?: string; content_type?: string },
): boolean {
  try {
    const payload: SourceOriginSidecar = {
      schema: SOURCE_ORIGIN_SCHEMA,
      source_url: origin.source_url,
      ...(origin.retrieved_at ? { retrieved_at: origin.retrieved_at } : {}),
      ...(origin.content_type ? { content_type: origin.content_type } : {}),
    };
    writeFileSync(sourceOriginSidecarPath(filePath), `${JSON.stringify(payload, null, 2)}\n`);
    return true;
  } catch {
    return false;
  }
}

/** Which carrier answered for a web origin. */
export type AcquisitionOriginCarrier = "origin-json" | "prep-json" | "frontmatter";

export interface AcquisitionOrigin {
  /** The URL the document was acquired from. */
  url: string;
  via: AcquisitionOriginCarrier;
}

/**
 * Resolve the WEB address a local document was acquired from, across the three
 * carriers that can hold one, first hit wins:
 *   1. `<file>.origin.json` — written at download time, the only carrier that
 *      exists for a binary;
 *   2. `<stem>.prep.json` — the conversion record, which may have carried the
 *      URL forward;
 *   3. for markdown only, the document's own frontmatter (`source_url`).
 * Returns null when nothing records one — the overwhelmingly common case for a
 * corpus assembled by hand.
 */
export function resolveAcquisitionOrigin(path: string): AcquisitionOrigin | null {
  const origin = readJsonSafe(sourceOriginSidecarPath(path));
  const fromSidecar = origin ? safeString(origin.source_url) : null;
  if (fromSidecar && isUrl(fromSidecar)) return { url: fromSidecar, via: "origin-json" };

  const prep = readJsonSafe(sidecarPath(path, ".prep.json"));
  const fromPrep = prep ? safeString(prep.source_url) : null;
  if (fromPrep && isUrl(fromPrep)) return { url: fromPrep, via: "prep-json" };

  if (/\.md$/i.test(path)) {
    const head = readHead(path);
    if (head !== null) {
      const front = parseConvertedFrontmatter(head);
      if (front.source_url) return { url: front.source_url, via: "frontmatter" };
    }
  }
  return null;
}

/** Whether a chain link names a local artifact or a remote address. */
export type ProvenanceLinkKind = "file" | "url";

/** One rung of a provenance ladder. */
export interface ProvenanceLink {
  /**
   * Project-relative path when the artifact lives under a root, absolute when it
   * escapes them, or the URL itself when `kind` is `"url"`.
   */
  ref: string;
  kind: ProvenanceLinkKind;
  /** Which carrier answered for this rung. */
  via: string;
  /** Conversion / acquisition label, when known. */
  conversion?: string;
  /** True when the artifact is openable (bundled, or servable by the live route). */
  bundled?: boolean;
}

/**
 * One cited locator's resolved provenance chain, as serialized in the sidecar.
 *
 * The four original fields describe the PREFERRED link — the artifact a viewer
 * should present and highlight — so a consumer that only knows the single-level
 * shape keeps working unchanged and simply lands on the best target instead of
 * the nearest one.
 */
export interface ProvenanceEntry {
  /** Project-relative path of the preferred artifact when it lives under a root, else absolute. */
  original: string;
  /** Conversion provider label (`graphify_conversion`), when known. */
  conversion?: string;
  /** Which carrier answered for the preferred artifact. */
  via: string;
  /** True when the preferred artifact is openable (bundled / servable). */
  bundled: boolean;
  /**
   * The FULL ladder above the cited document, nearest ancestor first, root last.
   * Emitted only when it has more than one rung — a single-level chain is fully
   * described by the fields above, so the common payload is unchanged.
   */
  chain?: ProvenanceLink[];
  /** `ref` of the preferred link. Emitted only alongside `chain`. */
  preferred?: string;
}

/**
 * How many rungs a chain may have before the walk gives up. A provenance ladder
 * is a handful of steps in every real corpus (web -> PDF -> OCR markdown is the
 * deep case at three); the cap exists so a hand-edited or adversarial set of
 * sidecars cannot turn one cited document into an unbounded walk.
 */
const MAX_CHAIN_DEPTH = 8;

/**
 * Walk the full provenance ladder above a resolved local document.
 *
 * Each rung is tried as a CONVERSION first (a local ancestor, which the walk
 * then continues from) and only then as an ACQUISITION (a URL, which is
 * terminal — nothing above a web address is recorded anywhere). Visited
 * absolute paths are remembered, so a pair of sidecars pointing at each other
 * ends the walk instead of spinning.
 */
function walkProvenanceChain(
  startPath: string,
  roots: string[],
  isBundled: (rel: string) => boolean,
): ProvenanceLink[] {
  const links: ProvenanceLink[] = [];
  const seen = new Set<string>([resolve(startPath)]);
  let current = startPath;

  for (let depth = 0; depth < MAX_CHAIN_DEPTH; depth += 1) {
    const converted = resolveDocumentOrigin(current);
    if (converted) {
      const absolute = resolve(converted.original);
      if (seen.has(absolute)) break;
      seen.add(absolute);
      const ref = relativizeToRoots(absolute, roots);
      links.push({
        ref,
        kind: "file",
        via: converted.via,
        ...(converted.conversion ? { conversion: converted.conversion } : {}),
        bundled: !isAbsolute(ref) && isBundled(ref),
      });
      current = absolute;
      continue;
    }
    const acquired = resolveAcquisitionOrigin(current);
    if (acquired) {
      // Terminal: a URL has no local ancestor to walk to, and is never openable
      // from the bundle — the viewer links out to it rather than rendering it.
      links.push({ ref: acquired.url, kind: "url", via: acquired.via, bundled: false });
    }
    break;
  }
  return links;
}

/**
 * Suffixes of documents that can honour a citation's `page`.
 *
 * This is what decides the ACLP question — "highlight the PDF, not the source
 * HTML" — and the reason is addressing, not format snobbery. A citation carries
 * a page number; a PDF can scroll to it and mark the passage, while the web page
 * the PDF was published behind has no page 3 to go to. Preferring the paginated
 * artifact is what keeps the citation's own coordinates meaningful.
 */
const PAGE_ADDRESSABLE_EXTS = [".pdf"];

function isPageAddressable(ref: string): boolean {
  const lower = ref.toLowerCase();
  return PAGE_ADDRESSABLE_EXTS.some((ext) => lower.endsWith(ext));
}

/**
 * Choose the link a viewer should PRESENT and highlight.
 *
 * Four steps, each a fallback for the one above:
 *   1. the deepest openable, PAGE-ADDRESSABLE local file. For the ACLP chain
 *      (web page -> PDF -> OCR markdown) that is the PDF — and it stays the PDF
 *      even when the chain also records the HTML the paper was published behind,
 *      because only the PDF can honour the citation's page;
 *   2. the deepest openable local file of any kind (a corpus with no paginated
 *      artifact at all — a captured HTML page, say);
 *   3. the deepest local file, openable or not — worth naming as a breadcrumb
 *      even when its bytes are unavailable;
 *   4. the nearest link at all, which is a bare URL origin.
 *
 * A URL therefore never wins over a local file that exists: it is an address to
 * link out to, not a document this viewer can render or highlight inside.
 */
export function preferredProvenanceLink(links: ProvenanceLink[]): ProvenanceLink | null {
  const deepestMatching = (predicate: (link: ProvenanceLink) => boolean): ProvenanceLink | null => {
    for (let i = links.length - 1; i >= 0; i -= 1) {
      const link = links[i]!;
      if (predicate(link)) return link;
    }
    return null;
  };
  return (
    deepestMatching((l) => l.kind === "file" && l.bundled === true && isPageAddressable(l.ref)) ??
    deepestMatching((l) => l.kind === "file" && l.bundled === true) ??
    deepestMatching((l) => l.kind === "file") ??
    links[0] ??
    null
  );
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
  const isBundled = options.isBundled ?? (() => false);
  for (const locator of [...locators].sort()) {
    const trimmed = locator.trim();
    if (!trimmed || documents[trimmed]) continue;
    const citedPath = resolveLocatorPath(trimmed, roots);
    if (!citedPath) continue;
    const chain = walkProvenanceChain(citedPath, roots, isBundled);
    const preferred = preferredProvenanceLink(chain);
    if (!preferred) continue;
    documents[trimmed] = {
      original: preferred.ref,
      ...(preferred.conversion ? { conversion: preferred.conversion } : {}),
      via: preferred.via,
      bundled: preferred.bundled === true,
      // A single-rung ladder is fully described by the fields above, so the
      // payload for an ordinary converted corpus stays exactly what it was.
      ...(chain.length > 1 ? { chain, preferred: preferred.ref } : {}),
    };
  }
  return { schema: CITED_SOURCE_PROVENANCE_SCHEMA, documents };
}
