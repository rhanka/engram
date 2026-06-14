import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { OntologyPatchContext, OntologyPatchNode } from "./ontology-patch.js";

export const ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA = "graphify_ontology_reconciliation_candidates_v1" as const;
export const ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA =
  "graphify_ontology_reconciliation_candidates_response_v1" as const;

export type OntologyReconciliationCandidateKind = "entity_match";
export type OntologyReconciliationCandidateStatus = "candidate";

/** Matching tier that produced a candidate. */
export type OntologyReconciliationCandidateTier = "exact" | "fuzzy";

export interface OntologyReconciliationCandidate {
  id: string;
  kind: OntologyReconciliationCandidateKind;
  status: OntologyReconciliationCandidateStatus;
  score: number;
  /** Which matching tier produced this candidate. Optional for back-compat. */
  tier?: OntologyReconciliationCandidateTier;
  candidate_id: string;
  canonical_id: string;
  shared_terms: string[];
  evidence_refs: string[];
  reasons: string[];
  proposed_patch_operation: "accept_match";
}

export interface OntologyReconciliationCandidateQueue {
  schema: typeof ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA;
  graph_hash: string;
  profile_hash: string;
  generated_at: string;
  candidate_count: number;
  candidates: OntologyReconciliationCandidate[];
}

export interface OntologyReconciliationCandidateFilter {
  status?: OntologyReconciliationCandidateStatus;
  kind?: OntologyReconciliationCandidateKind;
  operation?: OntologyReconciliationCandidate["proposed_patch_operation"];
  canonical_id?: string;
  candidate_id?: string;
  min_score?: number;
  query?: string;
  sort?: "score" | "id";
  order?: "asc" | "desc";
  limit?: number;
  offset?: number;
  stale?: boolean;
}

export interface OntologyReconciliationCandidatesResponse {
  schema: typeof ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA;
  generated_at: string;
  graph_hash: string;
  profile_hash: string;
  stale: boolean;
  total: number;
  limit: number;
  offset: number;
  items: OntologyReconciliationCandidate[];
}

export interface GenerateOntologyReconciliationCandidatesOptions {
  generatedAt?: string;
  /**
   * Enable the LOWER-confidence fuzzy tier (token-containment + token Jaccard,
   * honorific-stripped) over the exact-normalized-label tier. Default true.
   */
  fuzzy?: boolean;
  /** Token-Jaccard threshold for the fuzzy tier. */
  fuzzyThreshold?: number;
  /** Cap on the total number of emitted candidates (after ranking by score). */
  cap?: number;
  /**
   * Node types excluded from the FUZZY tier (structural containers by default).
   * The exact tier always runs on every type.
   */
  fuzzyExcludeTypes?: readonly string[];
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizeTerm(value: string): string {
  return value.trim().replace(/\s+/gu, " ").toLowerCase();
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort((a, b) => a.localeCompare(b));
}

function nodeTerms(node: OntologyPatchNode): string[] {
  return uniqueSorted([
    ...(node.label ? [normalizeTerm(node.label)] : []),
    ...(node.aliases ?? []).map(normalizeTerm),
    ...(node.normalized_terms ?? []).map(normalizeTerm),
  ]);
}

// --- Fuzzy tier ------------------------------------------------------------
//
// A LOWER-confidence tier over the exact-normalized-label tier. It compares
// honorific-stripped token SETS across surface VARIANTS of each label/alias
// (the full surface, the parenthetical-stripped surface, and the
// parenthetical CONTENT on its own). Two entities are a fuzzy match when some
// variant pair is token-set-EQUAL, or one variant's tokens are a strict subset
// of the other's (≥ 2 meaningful tokens), or their best token Jaccard clears
// the threshold. This surfaces genuine qualifier-variants
// ("Hugo Oberstein" ↔ "Hugo Oberstein (spy)";
//  "Devonshire (Exmoor estate)" ↔ "Exmoor estate") while rejecting siblings
// ("Sir Henry" ↔ "Sir Charles"), regnal series ("Edward I/II/III"), generic
// honorific collisions ("Inspector …"), and distinct "Château de …".

/** Leading honorifics/titles stripped before fuzzy token comparison. */
const FUZZY_HONORIFICS = new Set([
  "dr",
  "sir",
  "colonel",
  "col",
  "inspector",
  "mr",
  "mrs",
  "ms",
  "miss",
  "lord",
  "lady",
  "captain",
  "capt",
  "professor",
  "prof",
  "doctor",
  "madame",
  "madam",
  "monsieur",
  "m",
  "mme",
  "mlle",
  "the",
]);

/** Default token-Jaccard threshold for the fuzzy tier. */
export const DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD = 0.6;
/** Default cap on the number of emitted candidates (exact + fuzzy). */
export const DEFAULT_RECONCILIATION_CANDIDATE_CAP = 200;
/**
 * Structural CONTAINER types excluded from the FUZZY tier by default. Fuzzy
 * coreference is for ENTITIES (characters, places, objects); distinct chapters
 * / works / sagas are never the "same real thing", and their formulaic titles
 * ("Part I, Chapter II", "The Adventures of …") otherwise dominate the output
 * with non-mergeable noise. The exact tier still runs on these types.
 */
export const DEFAULT_FUZZY_EXCLUDE_TYPES = [
  "Work",
  "ChapterOrStory",
  "Scene",
  "Section",
  "Saga",
] as const;

const NON_WORD = /[^\p{L}\p{N}]+/gu;
const PARENTHETICAL = /\([^)]*\)/gu;

/**
 * A variant is either the entity NAME (the full surface or its
 * parenthetical-stripped form) or the PARENTHETICAL content alone. Tagging
 * matters because a parenthetical is often a generic descriptor ("(servant)",
 * "(mentioned)", "(Evidence)") that must NOT match another node's descriptor —
 * only a node's real NAME. So `paren` variants are compared against `name`
 * variants only, never `paren`↔`paren`.
 */
interface FuzzyVariant {
  tokens: string[];
  kind: "name" | "paren";
}

/** Honorific-stripped, NFKC-folded token list of a surface string. */
function fuzzyTokens(variant: string): string[] {
  return variant
    .normalize("NFKC")
    .toLowerCase()
    .replace(NON_WORD, " ")
    .split(/\s+/u)
    .filter((t) => t.length > 0 && !FUZZY_HONORIFICS.has(t));
}

/** Tagged surface variants of a single term. The NAME is the parenthetical-
 * STRIPPED surface (not the full surface — keeping the parenthetical tokens in
 * a name variant would leak generic descriptors like "(murder weapon)" into
 * name comparisons). The parenthetical content is a separate `paren` variant. */
function surfaceVariants(term: string): FuzzyVariant[] {
  const out: FuzzyVariant[] = [];
  const noParen = fuzzyTokens(term.replace(PARENTHETICAL, " "));
  if (noParen.length > 0) out.push({ tokens: noParen, kind: "name" });
  for (const m of term.match(/\(([^)]*)\)/gu) ?? []) {
    const paren = fuzzyTokens(m.slice(1, -1));
    if (paren.length > 0) out.push({ tokens: paren, kind: "paren" });
  }
  return out;
}

/** All distinct tagged token sets across a node's terms + variants. */
function fuzzyVariants(node: OntologyPatchNode): FuzzyVariant[] {
  const seen = new Set<string>();
  const variants: FuzzyVariant[] = [];
  for (const term of nodeTerms(node)) {
    for (const variant of surfaceVariants(term)) {
      // Order-preserving dedup key: token SEQUENCE matters (so "Part I Chapter
      // II" and "Part II Chapter I" stay distinct variants).
      const key = `${variant.kind}:${variant.tokens.join(" ")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      variants.push(variant);
    }
  }
  return variants;
}

function tokenJaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  let inter = 0;
  for (const x of A) if (B.has(x)) inter += 1;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : inter / union;
}

/** Order-preserving token-sequence equality (kills reordered-ordinal collisions). */
function tokenSequenceEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

// Ordinal-ish tokens: roman numerals i–xx, plain digits, and single letters.
// Two labels differing ONLY by these are a FORMULAIC SERIES — "Edward I/II/III",
// "Part I, Chapter II", "Sir James / Sir Robert"(no — surnames differ) — and
// must NOT fuzzy-match: a one-numeral delta is a DISTINCT member, not a variant.
const ROMAN_NUMERAL = /^(?:x{0,3})(?:ix|iv|v?i{0,3})$/u;
function isOrdinalToken(token: string): boolean {
  if (/^\d+$/u.test(token)) return true;
  if (token.length === 1) return true; // single letter (regnal, sub-section)
  return token.length <= 4 && ROMAN_NUMERAL.test(token) && token !== "";
}

/**
 * True when the two token sets share ≥1 token AND every token in their
 * symmetric difference is ordinal-ish — i.e. they are the same template with a
 * different serial number ("part i chapter ii" vs "part ii chapter i";
 * "edward i" vs "edward ii"). Such pairs are formulaic-series false positives.
 */
function differsOnlyByOrdinal(a: string[], b: string[]): boolean {
  const A = new Set(a);
  const B = new Set(b);
  let shared = 0;
  const diff: string[] = [];
  for (const x of A) (B.has(x) ? (shared += 1) : diff.push(x));
  for (const x of B) if (!A.has(x)) diff.push(x);
  if (shared === 0 || diff.length === 0) return false;
  return diff.every(isOrdinalToken);
}

function tokenSubset(a: string[], b: string[]): boolean {
  const A = new Set(a);
  const B = new Set(b);
  if (A.size === 0 || B.size === 0) return false;
  const [small, big] = A.size <= B.size ? [A, B] : [B, A];
  for (const x of small) if (!big.has(x)) return false;
  return true;
}

export interface FuzzyMatchResult {
  matched: boolean;
  /** Best token Jaccard across all admissible variant pairs. */
  jaccard: number;
  /** True when some name↔name variant pair was token-set-equal. */
  equal: boolean;
  /** True when a ≥2-token strict containment held (incl. paren↔name). */
  contained: boolean;
}

/**
 * Fuzzy match between two nodes across honorific-stripped tagged variants.
 * Deterministic; reads label/aliases/normalized_terms only.
 *
 * Admissibility:
 *   - name↔name: equality / containment / Jaccard all eligible.
 *   - paren↔name: only token-set EQUALITY or strict containment with ≥2 tokens
 *     (captures "Exmoor estate" ⊆ "Devonshire (Exmoor estate)"), so a generic
 *     ≥2-word descriptor never matches by mere Jaccard.
 *   - paren↔paren: NEVER (generic-descriptor collision guard).
 */
export function fuzzyMatchNodes(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
  threshold: number = DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD,
): FuzzyMatchResult {
  const leftSets = fuzzyVariants(left);
  const rightSets = fuzzyVariants(right);
  let best = 0;
  let equal = false;
  let contained = false;
  for (const a of leftSets) {
    for (const b of rightSets) {
      // paren↔paren is never admissible (generic-descriptor collision guard).
      if (a.kind === "paren" && b.kind === "paren") continue;
      // A match needs ≥2 meaningful tokens on the smaller side so a single
      // generic locator ("Greenford", "Seawood", "butler", "inn") cannot match
      // every node that merely mentions it in a parenthetical.
      const minLen = Math.min(a.tokens.length, b.tokens.length);
      if (minLen < 2) continue;
      // Formulaic-series guard: a one-numeral delta is a distinct member, not a
      // variant ("Edward I/II"). Also reject a same-token-set pair whose
      // sequences differ AND that carries ordinal tokens ("Part I, Chapter II"
      // vs "Part II, Chapter I" share the token SET but swap the serials).
      if (differsOnlyByOrdinal(a.tokens, b.tokens)) continue;
      if (
        !tokenSequenceEqual(a.tokens, b.tokens) &&
        a.tokens.length === b.tokens.length &&
        tokenSubset(a.tokens, b.tokens) &&
        (a.tokens.some(isOrdinalToken) || b.tokens.some(isOrdinalToken))
      ) {
        continue;
      }
      const nameName = a.kind === "name" && b.kind === "name";
      // Equality is SEQUENCE-equal (order preserved) so reordered ordinals
      // do not collide.
      if (tokenSequenceEqual(a.tokens, b.tokens)) equal = true;
      if (tokenSubset(a.tokens, b.tokens)) contained = true;
      // Jaccard-threshold matching is name↔name only (loose-similarity tier).
      if (nameName) {
        const j = tokenJaccard(a.tokens, b.tokens);
        if (j > best) best = j;
      }
    }
  }
  const matched = equal || contained || best >= threshold;
  return { matched, jaccard: best, equal, contained };
}

/** Fuzzy-tier score: equality > containment > threshold-only. Always < exact 1.0. */
function fuzzyScore(result: FuzzyMatchResult): number {
  if (result.equal) return 0.9;
  if (result.contained) return 0.75;
  return 0.7;
}

function statusRank(status: string | undefined): number {
  switch (status) {
    case "validated":
      return 4;
    case "needs_review":
      return 3;
    case "candidate":
      return 2;
    case "rejected":
      return 1;
    default:
      return 0;
  }
}

function chooseCanonicalPair(a: OntologyPatchNode, b: OntologyPatchNode): {
  canonical: OntologyPatchNode;
  candidate: OntologyPatchNode;
} {
  const rankA = statusRank(a.status);
  const rankB = statusRank(b.status);
  if (rankA !== rankB) {
    return rankA > rankB ? { canonical: a, candidate: b } : { canonical: b, candidate: a };
  }
  return a.id.localeCompare(b.id) <= 0 ? { canonical: a, candidate: b } : { canonical: b, candidate: a };
}

function candidateScore(sharedTerms: string[], canonical: OntologyPatchNode, candidate: OntologyPatchNode): number {
  const canonicalLabel = canonical.label ? normalizeTerm(canonical.label) : null;
  const candidateLabel = candidate.label ? normalizeTerm(candidate.label) : null;
  const exactLabelMatch = canonicalLabel !== null && canonicalLabel === candidateLabel && sharedTerms.includes(canonicalLabel);
  // Exact normalized-label match is the top tier: score 1.0 (canonical pair).
  // A shared non-label term (alias/normalized_term) is strong but sub-exact.
  return exactLabelMatch ? 1 : 0.85;
}

function candidateId(canonical: OntologyPatchNode, candidate: OntologyPatchNode, sharedTerms: string[]): string {
  return `reconcile:${sha256([
    "entity_match",
    canonical.id,
    candidate.id,
    ...sharedTerms,
  ].join("|")).slice(0, 24)}`;
}

export function loadOntologyReconciliationCandidates(path: string): OntologyReconciliationCandidateQueue {
  return JSON.parse(readFileSync(resolve(path), "utf-8")) as OntologyReconciliationCandidateQueue;
}

export function queryOntologyReconciliationCandidates(
  queue: OntologyReconciliationCandidateQueue,
  options: OntologyReconciliationCandidateFilter = {},
): OntologyReconciliationCandidatesResponse {
  const sortKey = options.sort ?? "score";
  const order = options.order ?? "desc";
  const query = options.query?.trim().toLowerCase();
  const status = options.status;
  const kind = options.kind;
  const operation = options.operation;
  const canonicalId = options.canonical_id;
  const candidateIdFilter = options.candidate_id;
  const minScore = options.min_score;
  const offset = Math.max(0, Math.floor(options.offset ?? 0));
  const limitValue = options.limit ?? Number.POSITIVE_INFINITY;
  const hasExplicitLimit = Number.isFinite(limitValue);
  const limit = hasExplicitLimit ? Math.max(0, Math.floor(limitValue)) : Number.POSITIVE_INFINITY;

  const filtered = queue.candidates.filter((candidate) => {
    if (status !== undefined && candidate.status !== status) return false;
    if (kind !== undefined && candidate.kind !== kind) return false;
    if (operation !== undefined && candidate.proposed_patch_operation !== operation) return false;
    if (canonicalId !== undefined && candidate.canonical_id !== canonicalId) return false;
    if (candidateIdFilter !== undefined && candidate.candidate_id !== candidateIdFilter) return false;
    if (typeof minScore === "number" && candidate.score < minScore) return false;
    if (!query) return true;

    const haystack = [
      candidate.id,
      candidate.kind,
      candidate.status,
      candidate.candidate_id,
      candidate.canonical_id,
      candidate.proposed_patch_operation,
      ...candidate.shared_terms,
      ...candidate.evidence_refs,
      ...candidate.reasons,
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(query);
  });

  filtered.sort((left, right) => {
    if (sortKey === "id") {
      const orderDelta = left.id.localeCompare(right.id);
      return order === "asc" ? orderDelta : -orderDelta;
    }
    const scoreDelta = left.score - right.score;
    if (scoreDelta !== 0) return order === "asc" ? scoreDelta : -scoreDelta;
    return left.id.localeCompare(right.id);
  });

  const resolvedLimit = Number.isFinite(limit) ? limit : filtered.length;
  const start = Math.min(offset, filtered.length);
  const end = Number.isFinite(resolvedLimit) ? start + resolvedLimit : undefined;
  const items = filtered.slice(start, end);

  return {
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA,
    generated_at: queue.generated_at,
    graph_hash: queue.graph_hash,
    profile_hash: queue.profile_hash,
    stale: options.stale ?? false,
    total: filtered.length,
    limit: Number.isFinite(resolvedLimit) ? resolvedLimit : items.length,
    offset,
    items,
  };
}

export function filterOntologyReconciliationCandidates(
  queue: OntologyReconciliationCandidateQueue,
  options: OntologyReconciliationCandidateFilter = {},
): OntologyReconciliationCandidatesResponse {
  return queryOntologyReconciliationCandidates(queue, options);
}

export function generateOntologyReconciliationCandidates(
  context: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions = {},
): OntologyReconciliationCandidateQueue {
  const fuzzyEnabled = options.fuzzy ?? true;
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD;
  const cap = options.cap ?? DEFAULT_RECONCILIATION_CANDIDATE_CAP;
  const fuzzyExcludeTypes = new Set(options.fuzzyExcludeTypes ?? DEFAULT_FUZZY_EXCLUDE_TYPES);

  const candidates: OntologyReconciliationCandidate[] = [];
  const emittedPairs = new Set<string>();
  const comparableNodes = context.nodes
    .filter((node) => node.type && nodeTerms(node).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < comparableNodes.length; i += 1) {
    for (let j = i + 1; j < comparableNodes.length; j += 1) {
      const left = comparableNodes[i]!;
      const right = comparableNodes[j]!;
      // Type-guard applies AFTER schema hygiene has canonicalized types.
      if (left.type !== right.type) continue;

      const leftTerms = new Set(nodeTerms(left));
      const sharedTerms = nodeTerms(right).filter((term) => leftTerms.has(term));

      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const pairKey = `${canonical.id}|${candidate.id}`;
      const evidenceRefs = uniqueSorted([
        ...(canonical.source_refs ?? []),
        ...(candidate.source_refs ?? []),
      ]);

      if (sharedTerms.length > 0) {
        // Exact tier: shared normalized term (label/alias/normalized_term).
        emittedPairs.add(pairKey);
        candidates.push({
          id: candidateId(canonical, candidate, sharedTerms),
          kind: "entity_match",
          status: "candidate",
          score: candidateScore(sharedTerms, canonical, candidate),
          tier: "exact",
          candidate_id: candidate.id,
          canonical_id: canonical.id,
          shared_terms: sharedTerms,
          evidence_refs: evidenceRefs,
          reasons: [
            `same node type: ${canonical.type}`,
            `shared normalized term(s): ${sharedTerms.join(", ")}`,
          ],
          proposed_patch_operation: "accept_match",
        });
        continue;
      }

      if (!fuzzyEnabled) continue;
      // Fuzzy tier is for ENTITIES — skip structural container types (their
      // formulaic titles are non-mergeable noise). Types are equal here.
      if (fuzzyExcludeTypes.has(String(left.type))) continue;
      // Fuzzy tier: honorific-stripped token containment / Jaccard.
      const fuzzy = fuzzyMatchNodes(left, right, fuzzyThreshold);
      if (!fuzzy.matched) continue;
      if (emittedPairs.has(pairKey)) continue;
      emittedPairs.add(pairKey);
      const reasonDetail = fuzzy.equal
        ? "token-set equal (honorific/parenthetical-stripped)"
        : fuzzy.contained
          ? "token containment (honorific/parenthetical-stripped)"
          : `token Jaccard ${fuzzy.jaccard.toFixed(2)} ≥ ${fuzzyThreshold}`;
      candidates.push({
        id: candidateId(canonical, candidate, [reasonDetail]),
        kind: "entity_match",
        status: "candidate",
        score: fuzzyScore(fuzzy),
        tier: "fuzzy",
        candidate_id: candidate.id,
        canonical_id: canonical.id,
        shared_terms: [],
        evidence_refs: evidenceRefs,
        reasons: [
          `same node type: ${canonical.type}`,
          `fuzzy match: ${reasonDetail}`,
        ],
        proposed_patch_operation: "accept_match",
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const capped = Number.isFinite(cap) && cap >= 0 ? candidates.slice(0, cap) : candidates;
  return {
    schema: ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA,
    graph_hash: context.graphHash,
    profile_hash: context.profile.profile_hash,
    generated_at: options.generatedAt ?? new Date().toISOString(),
    candidate_count: capped.length,
    candidates: capped,
  };
}

export function writeOntologyReconciliationCandidates(
  outPath: string,
  queue: OntologyReconciliationCandidateQueue,
): void {
  const resolved = resolve(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(queue, null, 2) + "\n", "utf-8");
}
