/**
 * Heuristic citation grounding. Source parsing, raw-offset relocation, and
 * verbatim verification live in source-grounding so link and cite share the
 * same proof substrate.
 */
import { readFileSync } from "node:fs";
import type Graph from "graphology";

import type { CitationConfidence, OntologyCitation } from "./types.js";
import { unionCitations } from "./citations.js";
import {
  deaccent,
  detectModality,
  normalizeForMatch,
  parseSource,
  rawOffsetForTerm,
  resolveSourcePath,
  verifyVerbatim,
  windowQuote,
} from "./source-grounding.js";
import type { ParsedSource } from "./source-grounding.js";

// Public compatibility surface: all historical cite exports now come from the
// shared source module, with no behavioural fork.
export {
  buildNormToRawMap,
  deaccent,
  detectModality,
  normalizeForMatch,
  parseSource,
  rawOffsetForTerm,
  resolveSourcePath,
  verifyVerbatim,
  windowQuote,
} from "./source-grounding.js";
export type {
  ImageContext,
  ParsedSource,
  ResolveSourceOptions,
  SourceModality,
  SourceUnit,
} from "./source-grounding.js";

const QUOTE_MAXLEN = 320;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(normalized: string): string[] {
  return normalized.match(/[a-z0-9]+/g) ?? [];
}

function tokensContainRun(tokens: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= tokens.length; i += 1) {
    let matches = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (tokens[i + j] !== needle[j]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function basenameOf(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

/** Map an OCR-extracted image path to its containing OCR markdown document. */
export function containingDocumentFor(imagePath: string): string | null {
  const normalized = imagePath.replace(/\\/g, "/");
  const match = /^(.*)_images\/[^/]+$/.exec(normalized);
  return match ? `${match[1]}.md` : null;
}

// Type-aware term selection
// ---------------------------------------------------------------------------

const CONTENT_STOPWORDS = new Set(
  (
    "aeronautique aeronautics intelligence artificielle artificial systeme systemes system systems " +
    "operationnelle operationnel operational transformation developpement development application " +
    "applications technologie technologies technology analyse analysis gestion management donnees " +
    "data modele model methode method niveau level processus process secteur sector impact apport " +
    "apports enjeux defis perspective perspectives concept concepts general overview document section"
  ).split(/\s+/),
);

const CONCEPT_TYPES = new Set([
  "concept",
  "technology",
  "use_case",
  "regulation",
  "project",
  "standard",
  "tool",
  "rationale",
]);

/** A node's display type, normalized from `node_type` ?? `file_type`. */
function nodeKind(attrs: Record<string, unknown>): string {
  const nt = typeof attrs.node_type === "string" ? attrs.node_type : "";
  const ft = typeof attrs.file_type === "string" ? attrs.file_type : "";
  return (nt || ft).toLowerCase();
}

function safeStr(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** Selected candidate terms + the regexes the heuristic matcher will try. */
interface NodeTerms {
  /** Normalized terms to search for (whole-substring). */
  terms: string[];
  /** Surname (person), normalized, when derivable. */
  surname: string | null;
  /** Acronym (3-6 caps/digits), raw, when the label is one. */
  acronym: string | null;
  /** Reference marker like `[12]`, when derivable. */
  refMarker: string | null;
}

/**
 * Type-aware term selection (ia-aero `ground.py`/`ground2.py`):
 *  - person   → surname (matched against section headings first, then body).
 *  - reference→ the `[N]` bracketed marker, resolved back into the body.
 *  - acronym  → whole-word regex on the raw label (3-6 caps).
 *  - concept… → the most specific content word (≥ 5 chars, stopword-filtered).
 *  - any      → the label base + full label (≥ 4 chars) as fallbacks.
 */
export function selectNodeTerms(attrs: Record<string, unknown>): NodeTerms {
  const label = safeStr(attrs.label);
  const id = safeStr(attrs.id);
  const kind = nodeKind(attrs);
  const base = (label.split(/[—–,(]/)[0] ?? label).trim();
  const normBase = normalizeForMatch(base);
  const normLabel = normalizeForMatch(label);

  const terms = new Set<string>();
  for (const t of [normBase, normLabel]) if (t.length >= 4) terms.add(t);
  // Aliases are strong, distinct grounding terms.
  if (Array.isArray(attrs.aliases)) {
    for (const a of attrs.aliases) {
      const na = normalizeForMatch(safeStr(a));
      if (na.length >= 4) terms.add(na);
    }
  }

  let surname: string | null = null;
  if (kind === "person") {
    const toks = base.split(/\s+/).filter((t) => deaccent(t).length >= 3 && /^[a-zA-ZÀ-ÿ]/.test(t));
    if (toks.length > 0) {
      const last = normalizeForMatch(toks[toks.length - 1] ?? "");
      if (last.length >= 4) {
        surname = last;
        terms.add(last);
      }
    }
  }

  const acronym = /^[A-Z][A-Z0-9]{2,5}$/.test(base) ? base : null;

  let refMarker: string | null = null;
  if (kind === "reference") {
    const m = /\[(\d+)\]/.exec(label) ?? /ref_(\d+)/.exec(id);
    if (m) refMarker = `[${m[1]}]`;
  }

  if (CONCEPT_TYPES.has(kind)) {
    const words = (normBase.match(/[a-zà-ÿ]{5,}/g) ?? []).filter((w) => !CONTENT_STOPWORDS.has(deaccent(w)));
    if (words.length > 0) {
      const longest = words.reduce((a, b) => (b.length > a.length ? b : a));
      terms.add(longest);
    }
  }

  return { terms: [...terms], surname, acronym, refMarker };
}

// ---------------------------------------------------------------------------
// The grounding engine
// ---------------------------------------------------------------------------

export interface GroundedCitation extends OntologyCitation {
  quote: string;
  confidence: CitationConfidence;
}

export interface GroundNodeOptions {
  /** Max citations grounded per node. */
  topK: number;
  /** The `source_file` written onto each emitted citation (the locator). */
  sourceLabel: string;
}

/**
 * Ground citations for ONE node against ONE parsed source. Pure: takes the
 * node's attrs + the parsed source + a precomputed normalized-source string for
 * the anti-hallucination check. Every returned citation's `quote` is a verified
 * verbatim substring of `normalizedSource`.
 */
export function groundNodeCitations(
  attrs: Record<string, unknown>,
  source: ParsedSource,
  normalizedSource: string,
  options: GroundNodeOptions,
): GroundedCitation[] {
  const { topK, sourceLabel } = options;
  const kind = nodeKind(attrs);
  const sel = selectNodeTerms(attrs);
  const out: GroundedCitation[] = [];
  const seen = new Set<string>();

  const sourceLocation = (page: number, section: string): string => {
    if (source.modality === "ocr-markdown") {
      const sec = section ? ` · ${section.slice(0, 50)}` : "";
      return `p.${page}${sec}`;
    }
    return section || "document";
  };

  const emit = (
    rawText: string,
    offset: number,
    page: number,
    section: string,
    confidence: CitationConfidence,
    requireTerm?: string,
  ): boolean => {
    if (out.length >= topK) return false;
    const quote = windowQuote(rawText, offset);
    // HARD GATE: never emit a quote that is not a verbatim substring.
    if (!verifyVerbatim(quote, normalizedSource)) return false;
    // PRECISION GATE: a quote can be a verbatim source substring yet, due to
    // whitespace drift in windowing, NOT contain the term/ref/surname that
    // justified attaching it. When a matched term is supplied, REQUIRE the
    // emitted (normalized) quote to actually contain it — otherwise reject so we
    // never attach an unrelated passage. (Contextual emits like image prose pass
    // no term and are intentionally exempt.)
    if (requireTerm) {
      const needle = normalizeForMatch(requireTerm);
      if (needle && !normalizeForMatch(quote).includes(needle)) return false;
    }
    const dedupKey = normalizeForMatch(quote).slice(0, 60);
    if (!dedupKey || seen.has(dedupKey)) return false;
    seen.add(dedupKey);
    const cite: GroundedCitation = {
      source_file: sourceLabel,
      source_location: sourceLocation(page, section),
      quote,
      confidence,
    };
    if (source.modality === "ocr-markdown") {
      cite.page = page;
      if (section) cite.section = section;
    } else if (section) {
      cite.section = section;
    }
    cite.paragraph_id = `p${offset >= 0 ? indexOfUnit(source, rawText) : 0}`;
    out.push(cite);
    return true;
  };

  /**
   * Emit a pre-formed quote string (e.g. a node's `rationale`, which for a
   * `quote` node IS the verbatim source passage) with an explicit location.
   * Still gated by the HARD anti-hallucination check: a rationale that is a
   * paraphrase (not a verbatim source substring) is DROPPED, never emitted.
   */
  const emitVerbatimQuote = (
    quoteRaw: string,
    location: string,
    confidence: CitationConfidence,
  ): boolean => {
    if (out.length >= topK) return false;
    const quote = quoteRaw.replace(/\s+/g, " ").trim().slice(0, QUOTE_MAXLEN);
    if (!verifyVerbatim(quote, normalizedSource)) return false;
    const dedupKey = normalizeForMatch(quote).slice(0, 60);
    if (!dedupKey || seen.has(dedupKey)) return false;
    seen.add(dedupKey);
    out.push({ source_file: sourceLabel, source_location: location, quote, confidence });
    return true;
  };

  // 1) PERSON → attach the units of any section heading whose TOKENS include the
  //    surname. The surname must be a WHOLE WORD in the heading: a bare
  //    substring `includes` would let a surname like "Mat" match inside
  //    "Mathématiques", or "Section" match a "Section 3" heading, attaching an
  //    unrelated paragraph. Tokenize the normalized heading and test membership.
  if (kind === "person") {
    const labelBase = safeStr(attrs.label).split(/[—–,(]/)[0] ?? "";
    const pname = sel.surname ?? normalizeForMatch(labelBase);
    if (pname) {
      // The surname may itself be multi-token (e.g. "de la tour"); match it as a
      // whole-word token RUN within the heading's token stream.
      const nameTokens = pname.split(" ").filter(Boolean);
      for (const [sec, idxs] of source.sectionToIndices) {
        if (out.length >= topK) break;
        const secTokens = tokenize(normalizeForMatch(sec));
        if (!tokensContainRun(secTokens, nameTokens)) continue;
        for (const i of idxs) {
          if (out.length >= topK) break;
          const u = source.units[i];
          if (u) emit(u.text, 0, u.page, u.section, "EXTRACTED");
        }
      }
    }
  }

  // 2) REFERENCE → resolve the `[N]` marker back into the body.
  if (out.length < topK && sel.refMarker) {
    for (const u of source.units) {
      if (out.length >= topK) break;
      const di = u.text.indexOf(sel.refMarker);
      if (di >= 0) emit(u.text, di, u.page, u.section, "EXTRACTED", sel.refMarker);
    }
  }

  // 3) IMAGE → surrounding prose context (INFERRED).
  if (out.length < topK && kind === "image") {
    const fn = basenameOf(safeStr(attrs.source_file));
    const ctx = source.images.get(fn);
    if (ctx) {
      for (const key of ["prev", "next"] as const) {
        if (out.length >= topK) break;
        const txt = ctx[key];
        if (txt) emit(txt, 0, ctx.page, ctx.section, "INFERRED");
      }
    }
  }

  // 4) TERM / ACRONYM match in the body.
  if (out.length < topK && (sel.terms.length > 0 || sel.acronym)) {
    const acrRe = sel.acronym ? new RegExp(`\\b${escapeRegExp(sel.acronym)}\\b`) : null;
    for (const u of source.units) {
      if (out.length >= topK) break;
      const normText = normalizeForMatch(u.text);
      let di = -1;
      let matchedTerm: string | null = null;
      for (const t of sel.terms) {
        const j = normText.indexOf(t);
        if (j >= 0) {
          // Map the normalized offset back to its EXACT raw offset so the quote
          // window centers on the term (robust to NBSP/heavy whitespace).
          di = rawOffsetForTerm(u.text, t);
          if (di < 0) di = 0;
          matchedTerm = t;
          break;
        }
      }
      if (di < 0 && acrRe) {
        const m = acrRe.exec(u.text);
        if (m) {
          di = m.index;
          matchedTerm = sel.acronym;
        }
      }
      // The PRECISION GATE in `emit` re-checks that the windowed quote actually
      // contains the matched term, rejecting any whitespace-drifted miss.
      if (di >= 0) emit(u.text, di, u.page, u.section, "EXTRACTED", matchedTerm ?? undefined);
    }
  }

  // 5) RATIONALE FALLBACK → a quote-bearing node (file_type `quote`, or any node
  // whose `rationale` quotes the source verbatim) grounds on its own rationale.
  // For `quote` nodes the rationale IS the verbatim source passage. STILL gated:
  // a rationale that is a paraphrase fails verifyVerbatim and is dropped.
  if (out.length < topK) {
    const rationale = safeStr(attrs.rationale).trim();
    if (rationale) {
      const location = safeStr(attrs.source_location) || "document";
      const confidence: CitationConfidence = kind === "quote" ? "EXTRACTED" : "INFERRED";
      // Prefer the explicitly-quoted segment(s) («…» / "…" / “…”) — those are
      // the verbatim source spans; otherwise try the whole rationale.
      const quotedSpans = extractQuotedSpans(rationale);
      let emitted = false;
      for (const span of quotedSpans) {
        if (out.length >= topK) break;
        if (emitVerbatimQuote(span, location, confidence)) emitted = true;
      }
      if (!emitted) emitVerbatimQuote(rationale, location, confidence);
    }
  }

  return out;
}

/**
 * Extract the explicitly-quoted spans from a rationale (the verbatim source
 * passages a `quote` node wraps in « » / " " / “ ”). Returns [] when none.
 */
function extractQuotedSpans(text: string): string[] {
  const spans: string[] = [];
  const re = /[«"“]([^«»"“”]{8,})[»"”]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const s = (m[1] ?? "").trim();
    if (s) spans.push(s);
  }
  return spans;
}

/** Index of a unit by identity in the parsed source (for paragraph_id). */
function indexOfUnit(source: ParsedSource, rawText: string): number {
  for (const u of source.units) if (u.text === rawText) return u.paragraphIndex;
  return 0;
}

/**
 * Build a per-character map from NORMALIZED offsets back to RAW offsets for one
 * unit of text. `normalizeForMatch` deaccents, folds ligatures, lowercases,
 * collapses whitespace runs (including NBSP ` `) to a single space, and folds
 * dotted-initial spacing — so a normalized offset does NOT line up with the raw
 * offset whenever the raw text carries multi-char, non-breaking whitespace, or
 * spaces inside initial runs. This recovers the exact raw offset of every
 * normalized character so quote windowing centers on the matched term, not on
 * drifted text further along the paragraph.
 *
 * Returns `{ norm, map }` where `norm` is the normalized string and `map[k]` is
 * the raw index at which normalized char `k` begins. Implemented by normalizing
 * one raw char at a time, tracking collapsed whitespace, then applying the same
 * dotted-initial fold to the normalized chars and their raw-offset map.
 */

export interface CiteGraphOptions {
  /** Project root for resolving each node's `source_file`. */
  root: string;
  /** Max citations grounded per node. Default 6 (ia-aero's value). */
  topK?: number;
  /** Restrict to these node kinds (file_type/node_type). Empty = all. */
  types?: string[];
  /** Only ground nodes that currently have NO citations (additive 2nd pass). */
  onlyMissing?: boolean;
  /** Extra source search roots (e.g. `.graphify/converted`). */
  searchRoots?: string[];
}

export interface CiteGraphResult {
  /** Nodes that gained at least one grounded citation. */
  groundedNodes: number;
  /** Total grounded citations emitted across all nodes. */
  totalCitations: number;
  /** Per-kind counts of grounded nodes. */
  byKind: Record<string, number>;
  /** Source files that could not be resolved on disk (unique). */
  unresolvedSources: string[];
  /** Per-node grounded citations (for --dry-run reporting). */
  perNode: Record<string, GroundedCitation[]>;
}

/**
 * Ground citations across the whole graph (the `graphify cite` heuristic core).
 *
 * For each eligible node: resolve + parse its `source_file`, ground type-aware
 * verbatim citations, and UNION them with any existing `node.citations`
 * (union-not-clobber — existing extraction/sidecar citations are preserved).
 * Mutates the graph in place unless `dryRun`. Caches parsed sources per file.
 */
export function citeGraph(G: Graph, options: CiteGraphOptions, dryRun = false): CiteGraphResult {
  const topK = options.topK ?? 6;
  const typeFilter = (options.types ?? []).map((t) => t.toLowerCase()).filter(Boolean);
  const onlyMissing = options.onlyMissing ?? false;

  const parseCache = new Map<string, { parsed: ParsedSource; norm: string } | null>();
  const result: CiteGraphResult = {
    groundedNodes: 0,
    totalCitations: 0,
    byKind: {},
    unresolvedSources: [],
    perNode: {},
  };
  const unresolved = new Set<string>();

  const loadSource = (sourceFile: string): { parsed: ParsedSource; norm: string } | null => {
    if (parseCache.has(sourceFile)) return parseCache.get(sourceFile) ?? null;
    const path = resolveSourcePath(sourceFile, { root: options.root, searchRoots: options.searchRoots });
    if (!path) {
      unresolved.add(sourceFile);
      parseCache.set(sourceFile, null);
      return null;
    }
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      unresolved.add(sourceFile);
      parseCache.set(sourceFile, null);
      return null;
    }
    const parsed = parseSource(raw, detectModality(sourceFile));
    const entry = { parsed, norm: normalizeForMatch(raw) };
    parseCache.set(sourceFile, entry);
    return entry;
  };

  G.forEachNode((nodeId, rawAttrs) => {
    const attrs = rawAttrs as Record<string, unknown>;
    const kind = nodeKind(attrs);
    if (typeFilter.length > 0 && !typeFilter.includes(kind)) return;

    const existing = Array.isArray(attrs.citations) ? (attrs.citations as OntologyCitation[]) : [];
    if (onlyMissing && existing.length > 0) return;

    const sourceFile = safeStr(attrs.source_file);
    if (!sourceFile) return;

    // An image node's `source_file` is a binary image (e.g.
    // `..._images/image-000.jpg`) — not text. Ground it against the OCR-markdown
    // document that contains it (whose `images` map carries the prev/next prose
    // context), labeling the citation with that document path. This recovers the
    // image-context grounding ia-aero's ground2.py did (the page:"unknown" /
    // uncited-image gap). Other non-text source_files simply stay unresolved.
    //
    // CRITICAL: in real OCR output the binary image file USUALLY EXISTS on disk.
    // We must NOT `loadSource(image)` first — that would read the binary as text
    // and never reach the markdown fallback. For image nodes / image-extension
    // source_files, resolve the containing OCR-markdown document FIRST and only
    // fall back to reading the source itself when there is no containing doc.
    const isImageSource =
      kind === "image" || /\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(sourceFile);

    let loaded: { parsed: ParsedSource; norm: string } | null = null;
    let sourceLabel = sourceFile;
    if (isImageSource) {
      const docFile = containingDocumentFor(sourceFile);
      if (docFile) {
        const docLoaded = loadSource(docFile);
        if (docLoaded) {
          loaded = docLoaded;
          sourceLabel = docFile;
        }
      }
      // No containing-doc convention match (or it didn't load): fall back to
      // reading the source as text (degenerate, but keeps non-OCR images working
      // when the file happens to be textual).
      if (!loaded) {
        loaded = loadSource(sourceFile);
        sourceLabel = sourceFile;
      }
    } else {
      loaded = loadSource(sourceFile);
    }
    if (!loaded) return;

    const grounded = groundNodeCitations(attrs, loaded.parsed, loaded.norm, {
      topK,
      sourceLabel,
    });
    if (grounded.length === 0) return;

    // UNION-NOT-CLOBBER: fold the grounded citations into any existing set.
    const merged = unionCitations([existing, grounded]);
    if (!dryRun) {
      G.setNodeAttribute(nodeId, "citations", merged);
    }
    result.perNode[nodeId] = grounded;
    result.groundedNodes += 1;
    result.totalCitations += grounded.length;
    result.byKind[kind] = (result.byKind[kind] ?? 0) + 1;
  });

  result.unresolvedSources = [...unresolved].sort();
  return result;
}
