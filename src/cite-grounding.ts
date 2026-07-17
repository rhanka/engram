/**
 * Heuristic citation GROUNDING (WP #24 — `graphify cite`).
 *
 * Symmetric to `node-descriptions.ts` (describe) and `community-labeling.ts`
 * (label): a producer pass over an already-built graph that POPULATES
 * `node.citations[]` by SCANNING the corpus source text, as opposed to
 * `backfill-citations` which only PROJECTS pre-existing citations.
 *
 * This is the productization of ia-aero's hand-coded `ground.py` / `ground2.py`
 * (876/876 entities cited, zero API calls) and is the no-key DEFAULT path.
 *
 * ── ANTI-HALLUCINATION (HARD INVARIANT) ──────────────────────────────────────
 * Every emitted `quote` is a VERIFIED VERBATIM substring of the NORMALIZED
 * source text. A citation cannot be emitted unless its windowed quote, after the
 * same NFKD-deaccent/lowercase/whitespace-collapse normalization, is found as a
 * substring of the normalized source. There is no path to invent text. The LLM
 * (assistant/api) modes are gated by the SAME structural check: an LLM proposes
 * a quote, the heuristic verifier re-locates it in the source, and a quote that
 * does not match is DROPPED, never emitted. See `verifyVerbatim`.
 *
 * No network, no secrets in the heuristic path. Deterministic and replayable.
 */
import { readFileSync } from "node:fs";
import { isAbsolute, resolve as resolvePath } from "node:path";
import type Graph from "graphology";
import type { CitationConfidence, OntologyCitation } from "./types.js";
import { unionCitations } from "./citations.js";

// ---------------------------------------------------------------------------
// Normalization (the matcher substrate, shared by grounding + verification)
// ---------------------------------------------------------------------------

/** NFKD deaccent + ascii-fold (drops combining marks, ligatures degrade). */
export function deaccent(s: string): string {
  return (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/**
 * Dotted initial runs normalize spacing around the points only when at least
 * two one-letter initials are present: `A. J.` / `A . J .` / `A.J.` all become
 * `a.j.`. This preserves the letters and points and avoids numeric padding or
 * other cross-entity folds.
 */
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

/**
 * Canonical match form: deaccent → lowercase → collapse whitespace → trim →
 * fold dotted-initial spacing. Ligatures (œ/æ) are folded so `cœur` matches
 * `coeur`. Used for BOTH the candidate-term match and the anti-hallucination
 * verbatim check, so the two are guaranteed to agree.
 */
export function normalizeForMatch(s: string): string {
  return foldDottedInitialSpacing(normalizeForMatchBase(s));
}

// ---------------------------------------------------------------------------
// Modality-aware source parsing
// ---------------------------------------------------------------------------

export type SourceModality = "ocr-markdown" | "plain-text";

/** A locatable text unit (paragraph) parsed from a source file. */
export interface SourceUnit {
  /** Verbatim (raw) paragraph text. */
  text: string;
  /** Page number (OCR-markdown; 1 for plain text where pages are meaningless). */
  page: number;
  /** Section / chapter heading in effect for this unit (raw). */
  section: string;
  /** 0-based paragraph index within the source. */
  paragraphIndex: number;
}

/** Image reference + its surrounding prose context (OCR-markdown). */
export interface ImageContext {
  /** Image basename, e.g. `image-000.jpg`. */
  basename: string;
  page: number;
  section: string;
  /** Preceding paragraph text (raw), or "". */
  prev: string;
  /** Following paragraph text (raw), or "". */
  next: string;
}

export interface ParsedSource {
  modality: SourceModality;
  units: SourceUnit[];
  /** section heading → unit indices, for type-aware person-section matching. */
  sectionToIndices: Map<string, number[]>;
  /** image basename → context (OCR-markdown only). */
  images: Map<string, ImageContext>;
  /** Highest page seen (1 for plain text). */
  pageCount: number;
}

/** Detect modality from a source path. `.md` → OCR-markdown, else plain-text. */
export function detectModality(sourceFile: string): SourceModality {
  return /\.(md|markdown)$/i.test(sourceFile) ? "ocr-markdown" : "plain-text";
}

const FRONT_MATTER_KEY = /^[a-z_]+:\s/i;

/**
 * Parse an OCR-markdown file into locatable units (ia-aero `ground.py` parser,
 * hardened for graphify's front-matter):
 *   - the leading `---` … `---` front-matter block is SKIPPED (it is metadata,
 *     not a page break — without this, page numbering starts at 2);
 *   - a bare `---` outside front-matter → page increment (Mistral page break);
 *   - `#{1,4} ` → section heading (the section for following units);
 *   - `![alt](path)` → an image; its prev paragraph + the next paragraph become
 *     its context;
 *   - blank line / heading / image / page-break → flush the current paragraph.
 */
function parseOcrMarkdown(raw: string): ParsedSource {
  const lines = raw.split("\n");
  const units: SourceUnit[] = [];
  const sectionToIndices = new Map<string, number[]>();
  const images = new Map<string, ImageContext>();
  let page = 1;
  let section = "";
  let buf: string[] = [];
  let pendingImages: string[] = [];

  // Front-matter detection: a `---` on the FIRST line opens a metadata block
  // that closes at the next `---`. Those two `---` are not page breaks.
  let inFrontMatter = false;
  let frontMatterDone = false;
  let i = 0;
  if (lines[0]?.trim() === "---") {
    inFrontMatter = true;
    i = 1;
  }

  const flush = (): void => {
    if (buf.length === 0) return;
    const text = buf.map((x) => x.trim()).join(" ").trim();
    buf = [];
    if (!text || text.startsWith("![")) return;
    const idx = units.length;
    units.push({ text, page, section, paragraphIndex: idx });
    const arr = sectionToIndices.get(section) ?? [];
    arr.push(idx);
    sectionToIndices.set(section, arr);
    // Resolve any image awaiting its `next` paragraph.
    for (const fn of pendingImages) {
      const ctx = images.get(fn);
      if (ctx && !ctx.next) ctx.next = text;
    }
    pendingImages = [];
  };

  for (; i < lines.length; i += 1) {
    const s = (lines[i] ?? "").trim();

    if (inFrontMatter && !frontMatterDone) {
      // Skip metadata lines; the closing `---` ends the block (not a page break).
      if (s === "---") {
        frontMatterDone = true;
        inFrontMatter = false;
      } else if (s !== "" && !FRONT_MATTER_KEY.test(s)) {
        // A non-key line before a closing fence: not real front matter — bail
        // out and reprocess this line as content.
        inFrontMatter = false;
        frontMatterDone = true;
        i -= 1;
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
      const fn = basenameOf(img[1] ?? "");
      const prev = units.length > 0 ? (units[units.length - 1]?.text ?? "") : "";
      images.set(fn, { basename: fn, page, section, prev, next: "" });
      pendingImages.push(fn);
      continue;
    }
    if (s === "") {
      flush();
      continue;
    }
    buf.push(s);
  }
  flush();

  return { modality: "ocr-markdown", units, sectionToIndices, images, pageCount: page };
}

/**
 * Parse a plain-text file (mystery novels) into locatable units. Chapter / story
 * headings (heuristic: short, mostly-uppercase or `Chapter N`/`Part N` lines on
 * their own, or markdown `#` headings if present) become sections; paragraphs
 * (blank-line separated) are the units. Pages are meaningless → page 1.
 */
function parsePlainText(raw: string): ParsedSource {
  const lines = raw.split("\n");
  const units: SourceUnit[] = [];
  const sectionToIndices = new Map<string, number[]>();
  let section = "";
  let buf: string[] = [];

  const flush = (): void => {
    if (buf.length === 0) return;
    const text = buf.map((x) => x.trim()).join(" ").trim();
    buf = [];
    if (!text) return;
    const idx = units.length;
    units.push({ text, page: 1, section, paragraphIndex: idx });
    const arr = sectionToIndices.get(section) ?? [];
    arr.push(idx);
    sectionToIndices.set(section, arr);
  };

  for (const line of lines) {
    const s = line.trim();
    if (/^#{1,4}\s/.test(s)) {
      flush();
      section = s.replace(/^#{1,4}\s+/, "").trim();
      continue;
    }
    if (isHeadingLine(s, buf.length === 0)) {
      flush();
      section = s.trim();
      continue;
    }
    if (s === "") {
      flush();
      continue;
    }
    buf.push(s);
  }
  flush();

  return { modality: "plain-text", units, sectionToIndices, images: new Map(), pageCount: 1 };
}

/**
 * Heuristic chapter/story heading for plain text: a `Chapter N`/`Part N`/`Book N`
 * marker, or a short standalone line (≤ 8 words) that is mostly upper-case
 * letters and starts a paragraph. Conservative — false negatives only narrow the
 * section, never break grounding.
 */
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

function basenameOf(p: string): string {
  const norm = p.replace(/\\/g, "/");
  const idx = norm.lastIndexOf("/");
  return idx >= 0 ? norm.slice(idx + 1) : norm;
}

/** Parse any supported source modality. */
export function parseSource(raw: string, modality: SourceModality): ParsedSource {
  return modality === "ocr-markdown" ? parseOcrMarkdown(raw) : parsePlainText(raw);
}

// ---------------------------------------------------------------------------
// Quote windowing + verbatim verification (anti-hallucination)
// ---------------------------------------------------------------------------

const QUOTE_BEFORE = 110;
const QUOTE_AFTER = 210;
const QUOTE_MAXLEN = 320;
const OPEN_BOUNDARY = new Set([" ", "\n", "«", "(", '"', "“"]);
const CLOSE_BOUNDARY = new Set([" ", "\n", ".", "!", "?", "»", ")", '"', "”"]);

/**
 * Window a verbatim quote around a match offset (ia-aero `make_quote`): grab
 * ±~110/210 chars, snap the start back to an opening boundary and the end
 * forward to a sentence/quote boundary, ellipsis-pad the truncated sides, cap
 * length. Returns the RAW (verbatim) text — never normalized.
 */
export function windowQuote(text: string, offset: number): string {
  let a = Math.max(0, offset - QUOTE_BEFORE);
  let b = Math.min(text.length, offset + QUOTE_AFTER);
  while (a > 0 && !OPEN_BOUNDARY.has(text[a] ?? "")) a -= 1;
  while (b < text.length && !CLOSE_BOUNDARY.has(text[b] ?? "")) b += 1;
  let q = text.slice(a, b).trim();
  if (a > 0) q = "… " + q;
  if (b < text.length) q = q + " …";
  q = q.replace(/\s+/g, " ");
  return q.length > QUOTE_MAXLEN ? q.slice(0, QUOTE_MAXLEN).trim() : q;
}

/**
 * THE anti-hallucination gate. A quote is verbatim iff its normalized form,
 * stripped of the ellipsis padding `windowQuote` adds, is a non-empty substring
 * of the normalized source text. Used to verify EVERY emitted citation —
 * heuristic and LLM alike.
 */
export function verifyVerbatim(quote: string, normalizedSource: string): boolean {
  if (!quote) return false;
  // Strip the ellipsis padding we may have added, then normalize.
  const core = quote.replace(/^…\s*/, "").replace(/\s*…$/, "");
  const needle = normalizeForMatch(core);
  if (!needle) return false;
  return normalizedSource.includes(needle);
}

// ---------------------------------------------------------------------------
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
function buildNormToRawMap(rawText: string): { norm: string; map: number[] } {
  const normChars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false; // a run of whitespace not yet emitted
  let sawNonSpace = false; // have we emitted any non-space char yet (for trim)
  for (let i = 0; i < rawText.length; i += 1) {
    const ch = rawText[i] ?? "";
    // Per-char base normalization; dotted-initial folding is applied below
    // because it depends on neighboring normalized characters.
    const piece = normalizeForMatchBase(ch);
    if (piece === "") {
      // Whitespace (or a char that normalizes away, e.g. a combining mark).
      // Treat only real whitespace as a collapsible separator.
      if (/\s/.test(ch)) pendingSpace = true;
      continue;
    }
    if (pendingSpace && sawNonSpace) {
      normChars.push(" ");
      map.push(i); // the collapsed space anchors at the start of this token
    }
    pendingSpace = false;
    // A single raw char can normalize to multiple chars (œ→oe). Map them all to
    // the same raw offset.
    for (const c of piece) {
      normChars.push(c);
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
      const c = norm[i] ?? "";
      if (c === " ") continue;
      foldedChars.push(c);
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

/**
 * Map a normalized term to its exact RAW offset in the unit text via the
 * normalized→raw offset map, so windowing centers on the matched term even when
 * the raw text has heavy/NBSP whitespace (a windowed quote must contain the
 * term, not drift off it). Returns -1 if the term is not present.
 */
function rawOffsetForTerm(rawText: string, normTerm: string): number {
  if (!normTerm) return -1;
  const { norm, map } = buildNormToRawMap(rawText);
  const at = norm.indexOf(normTerm);
  if (at < 0) return -1;
  return map[at] ?? -1;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Split a NORMALIZED string into word tokens (letters/digits runs). Used for
 * whole-word surname matching against section headings so a surname is never a
 * mid-word substring (e.g. "Mat" must not match inside "Mathématiques").
 */
function tokenize(normalized: string): string[] {
  return normalized.match(/[a-z0-9]+/g) ?? [];
}

/**
 * True iff `needle` (a token run) appears as a CONTIGUOUS whole-token run inside
 * `tokens`. Single-token surnames match a single heading token; multi-token
 * surnames ("de la tour") match the contiguous run. Empty needle → false.
 */
function tokensContainRun(tokens: string[], needle: string[]): boolean {
  if (needle.length === 0) return false;
  for (let i = 0; i + needle.length <= tokens.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (tokens[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Map an OCR-extracted image path back to the markdown document that contains
 * it. graphify's pdf-ocr writes `<stem>.md` alongside `<stem>_images/image-N.*`
 * (pdf-ocr.ts), so `…/<stem>_images/image-000.jpg` → `…/<stem>.md`. Returns null
 * when the path does not match that convention.
 */
export function containingDocumentFor(imagePath: string): string | null {
  const norm = imagePath.replace(/\\/g, "/");
  const m = /^(.*)_images\/[^/]+$/.exec(norm);
  if (!m) return null;
  return `${m[1]}.md`;
}

// ---------------------------------------------------------------------------
// Source resolution + the graph-level driver
// ---------------------------------------------------------------------------

export interface ResolveSourceOptions {
  /** Project root; `source_file` is resolved relative to it. */
  root: string;
  /** Extra search roots (e.g. `.graphify/converted`). */
  searchRoots?: string[];
}

/**
 * Resolve a node's `source_file` to an on-disk path. Tries: absolute as-is,
 * relative to root, then relative to each search root. Returns null if none
 * exists. Pure (only fs.existsSync via readFileSync try/catch in the caller).
 */
export function resolveSourcePath(sourceFile: string, options: ResolveSourceOptions): string | null {
  if (!sourceFile) return null;
  const candidates: string[] = [];
  if (isAbsolute(sourceFile)) candidates.push(sourceFile);
  candidates.push(resolvePath(options.root, sourceFile));
  for (const r of options.searchRoots ?? []) candidates.push(resolvePath(r, sourceFile));
  for (const c of candidates) {
    try {
      readFileSync(c);
      return c;
    } catch {
      /* not here */
    }
  }
  return null;
}

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
