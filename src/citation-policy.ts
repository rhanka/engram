/**
 * Corpus-type-aware citation policy (SPEC_CITATIONS.md "Corpus-Type-Aware
 * Citation Policy").
 *
 * Two knobs are resolved here:
 *   - `describeCap`  — the per-node citation cap injected into the description
 *                      prompt (`CitationCap` in node-descriptions: number | "all").
 *   - `inlineTopK`   — the Level-1 inline `citations` size written to graph.json.
 *
 * One signal drives both: the corpus type, derived from the EXISTING detection
 * output `.graphify_detect.json` (no new detection pass). Resolution precedence
 * is, highest first:
 *
 *   CLI flag  >  config (`citations.*`)  >  corpus-type default  >  global default
 *
 * v1 wiring note: the `config` tier is NOT populated by the code-mode CLI —
 * `resolveCitationPolicyForRoot` never passes `config` (the loader is
 * ontology-profile-only), so the effective v1 precedence is the 3-tier
 * `CLI flag > corpus-type default > global default`. The `config` slot is
 * retained here for a future PR that wires the `citations:` YAML block; until
 * then it is inert (SPEC_CITATIONS "CLI and config surface", F3/7a).
 *
 * Everything here is a PURE function: no fs, no LLM, no network. Callers read
 * `.graphify_detect.json` and pass the parsed object in.
 */

/** The describe-prompt cap value. Mirrors `CitationCap` in node-descriptions. */
export type CitationCapValue = number | "all";

/** The resolved corpus type. */
export type CorpusType = "code" | "long-document" | "entity-corpus" | "mixed";

/**
 * The corpus-warn threshold (in words) above which document/paper corpora are
 * treated as "long-document". Kept in sync with `CORPUS_WARN_THRESHOLD` in
 * src/detect.ts — that is the same threshold `needs_graph` and the long-form
 * warning already use.
 */
export const CITATION_POLICY_LONG_DOC_WORD_THRESHOLD = 50_000;

/** Global fallback when no corpus type and no explicit override is present. */
export const CITATION_POLICY_GLOBAL_DEFAULT: {
  readonly describeCap: CitationCapValue;
  readonly inlineTopK: number;
} = { describeCap: 10, inlineTopK: 8 };

/** Per-corpus-type defaults (spec table "The three knobs and their defaults"). */
const CORPUS_TYPE_DEFAULTS: Record<
  CorpusType,
  { describeCap: CitationCapValue; inlineTopK: number }
> = {
  code: { describeCap: 3, inlineTopK: 3 },
  mixed: { describeCap: 10, inlineTopK: 8 },
  "long-document": { describeCap: "all", inlineTopK: 8 },
  "entity-corpus": { describeCap: "all", inlineTopK: 8 },
};

/** The slice of `.graphify_detect.json` the corpus classifier reads. */
export interface DetectionLike {
  files?: Partial<Record<string, unknown>>;
  total_words?: unknown;
}

export interface ResolveCorpusTypeOptions {
  /**
   * Ontology/profile mode is active (entities-over-documents). When true the
   * corpus is `entity-corpus` regardless of the file buckets. This is the
   * explicit override the skill/CLI sets for profile builds.
   */
  profileMode?: boolean;
}

function bucketLength(files: Partial<Record<string, unknown>> | undefined, bucket: string): number {
  const list = files?.[bucket];
  return Array.isArray(list) ? list.length : 0;
}

/**
 * Classify a corpus from a `.graphify_detect.json`-shaped object (or null).
 *
 * Rules (spec "The corpus-type signal"):
 *   - profile/ontology mode active → `entity-corpus` (explicit override).
 *   - `files.code` dominates and document/paper are empty/negligible → `code`.
 *   - document/paper present AND `total_words` above the corpus-warn threshold
 *     → `long-document`.
 *   - anything else → `mixed` (the middle default; also the fallback for a
 *     missing/empty detect).
 */
export function resolveCorpusType(
  detect: DetectionLike | null | undefined,
  options: ResolveCorpusTypeOptions = {},
): CorpusType {
  if (options.profileMode) return "entity-corpus";
  if (!detect || typeof detect !== "object") return "mixed";

  const files = detect.files;
  const totalWords = typeof detect.total_words === "number" && Number.isFinite(detect.total_words)
    ? detect.total_words
    : 0;

  const code = bucketLength(files, "code");
  const document = bucketLength(files, "document");
  const paper = bucketLength(files, "paper");
  const prose = document + paper;

  // code dominates and prose is empty/negligible.
  if (code > 0 && prose === 0) return "code";

  // long-form prose / papers above the warn threshold.
  if (prose > 0 && totalWords >= CITATION_POLICY_LONG_DOC_WORD_THRESHOLD) {
    return "long-document";
  }

  return "mixed";
}

export interface CitationPolicyOverrides {
  describeCap?: CitationCapValue;
  inlineTopK?: number;
}

export interface ResolveCitationPolicyInput {
  /** Corpus type (from `resolveCorpusType`). Absent → global default only. */
  corpusType?: CorpusType;
  /** Config-level knobs (`citations.describe_cap` / `citations.inline_top_k`). */
  config?: CitationPolicyOverrides;
  /** Explicit CLI flags (`--citation-cap` / `--citations-top-k`). Highest precedence. */
  cli?: CitationPolicyOverrides;
}

export interface ResolvedCitationPolicy {
  describeCap: CitationCapValue;
  inlineTopK: number;
}

/**
 * Resolve the two citation knobs with the pinned precedence
 * (CLI > config > corpus-type default > global default). The two knobs resolve
 * INDEPENDENTLY: a CLI `--citations-top-k` does not pin the describe cap, and a
 * config `describe_cap` does not pin K.
 */
export function resolveCitationPolicy(input: ResolveCitationPolicyInput): ResolvedCitationPolicy {
  const corpusDefault = input.corpusType
    ? CORPUS_TYPE_DEFAULTS[input.corpusType]
    : CITATION_POLICY_GLOBAL_DEFAULT;

  const describeCap =
    input.cli?.describeCap ??
    input.config?.describeCap ??
    corpusDefault.describeCap ??
    CITATION_POLICY_GLOBAL_DEFAULT.describeCap;

  const inlineTopK =
    input.cli?.inlineTopK ??
    input.config?.inlineTopK ??
    corpusDefault.inlineTopK ??
    CITATION_POLICY_GLOBAL_DEFAULT.inlineTopK;

  return { describeCap, inlineTopK };
}
