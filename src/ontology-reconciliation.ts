import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compileNormalizerByNodeType } from "./entity-normalizer.js";
import type { NormalizerByNodeType } from "./entity-normalizer.js";
import type { OntologyPatchContext, OntologyPatchNode, OntologyPatchRelation } from "./ontology-patch.js";

export const ONTOLOGY_RECONCILIATION_CANDIDATES_SCHEMA = "graphify_ontology_reconciliation_candidates_v1" as const;
export const ONTOLOGY_RECONCILIATION_CANDIDATES_RESPONSE_SCHEMA =
  "graphify_ontology_reconciliation_candidates_response_v1" as const;

export type OntologyReconciliationCandidateKind = "entity_match";
export type OntologyReconciliationCandidateStatus = "candidate";

/** Matching tier that produced a candidate. Ranked: exact > fuzzy > structural. */
export type OntologyReconciliationCandidateTier = "exact" | "fuzzy" | "structural";

/**
 * Per-signal score contributions for a candidate (spec: "the studio review
 * queue renders the breakdown so the user sees why a pair was proposed").
 * Optional and additive — the queue schema stays `…_v1`.
 */
export interface OntologyReconciliationScoreBreakdown {
  /** Jaccard over the two INFORMATIVE neighbour sets (structural tier). */
  neighbour_jaccard?: number;
  /** Count of informative (non-hub) neighbours the two nodes share. */
  shared_neighbours?: number;
  /** Jaccard over the two directed relation-type profiles. */
  relation_profile_jaccard?: number;
  /** Count of shared provenance refs (source_refs / registry_refs). */
  shared_provenance?: number;
}

/**
 * The explicit STRUCTURAL basis of a structural-tier candidate, so a human can
 * judge the proposal without re-deriving it. Deterministic, evidence-carrying.
 */
export interface OntologyReconciliationStructuralBasis {
  /** Informative neighbours shared by both nodes (sorted, capped for payload). */
  shared_neighbour_ids: string[];
  /** True count before the payload cap above. */
  shared_neighbour_count: number;
  /** Directed relation-type signatures shared by both nodes (`out:type`/`in:type`). */
  shared_relation_types: string[];
  /** Provenance refs (source_refs / registry_refs) shared by both nodes. */
  shared_provenance_refs: string[];
}

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
  /** Per-signal contributions. Present on structural-tier candidates. */
  score_breakdown?: OntologyReconciliationScoreBreakdown;
  /** Structural evidence. Present on structural-tier candidates only. */
  structural_basis?: OntologyReconciliationStructuralBasis;
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
  /**
   * Enable the LOWEST-confidence STRUCTURAL tier (shared-neighbour Jaccard +
   * relation-type profile + shared provenance). CAPABILITY-GATED: default OFF,
   * so enabling it can only ADD candidates and never changes an existing queue.
   */
  structural?: boolean;
  /** Thresholds/guard knobs for the structural tier. */
  structuralConfig?: Partial<StructuralTierConfig>;
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

/** Exact-tier terms only. Fuzzy keeps its own legacy tokenization below. */
function exactNodeTerms(node: OntologyPatchNode, normalizers: NormalizerByNodeType): string[] {
  const normalize = node.type ? normalizers[node.type] ?? normalizeTerm : normalizeTerm;
  return uniqueSorted([
    ...(node.label ? [normalize(node.label)] : []),
    ...(node.aliases ?? []).map(normalize),
    ...(node.normalized_terms ?? []).map(normalize),
  ]);
}

function violatesPartitionScope(
  context: OntologyPatchContext,
  nodeType: string,
  left: OntologyPatchNode,
  right: OntologyPatchNode,
): boolean {
  const registryId = context.profile.node_types?.[nodeType]?.registry;
  if (!registryId || !context.profile.registries?.[registryId]?.partition_column) return false;

  return left.registry_id !== registryId
    || right.registry_id !== registryId
    || !left.registry_partition
    || !right.registry_partition
    || left.registry_partition !== right.registry_partition;
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
  return fuzzyVariantsForTerms(nodeTerms(node));
}

function fuzzyVariantsForTerms(terms: readonly string[]): FuzzyVariant[] {
  const seen = new Set<string>();
  const variants: FuzzyVariant[] = [];
  for (const term of terms) {
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
  return fuzzyMatchVariants(leftSets, rightSets, threshold);
}

/**
 * Fuzzy matching over already-derived variants. Keeping this separate lets the
 * reconciliation queue compute each node's variants once rather than once for
 * every candidate pair.
 */
function fuzzyMatchVariants(
  leftSets: readonly FuzzyVariant[],
  rightSets: readonly FuzzyVariant[],
  threshold: number,
): FuzzyMatchResult {
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

// --- Precision guards ------------------------------------------------------
//
// Both tiers (exact-via-alias and fuzzy) over-generate on a large corpus by
// matching on a GENERIC shared token or across surface forms that, on close
// reading, name DIFFERENT real entities (siblings, spouses, a place vs a
// landmark inside it). These guards reject the classes that are confidently NOT
// the same entity, while deliberately KEEPING low-confidence near-duplicates
// that plausibly are the same (a human triages those by score). Each guard is
// pure over label/aliases and runs before a pair is emitted in EITHER tier.

/**
 * Generic role / common nouns that, when they are the ONLY thing two labels
 * share, do not evidence the same entity. "Narrator (Watson)" and
 * "Narrator (Bunny Manders)" share only "narrator"; a dozen revolvers share
 * only "revolver". A surname ("Robinson", "Oberstein") or a place name is NOT
 * here — those legitimately identify an entity.
 */
const GENERIC_ENTITY_NOUNS = new Set([
  // narrative / role nouns
  "narrator", "author", "writer", "editor", "client", "victim", "witness",
  "suspect", "murderer", "killer", "thief", "criminal", "detective", "prisoner",
  "stranger", "visitor", "guest", "person", "people", "figure", "character",
  // people-by-occupation / honorific common nouns
  "man", "woman", "men", "women", "boy", "girl", "child", "lady", "gentleman",
  "servant", "maid", "butler", "housekeeper", "cook", "footman", "page",
  "doctor", "nurse", "inspector", "constable", "sergeant", "officer", "policeman",
  "captain", "colonel", "general", "major", "sergeant", "soldier", "guard",
  "count", "countess", "lord", "duke", "duchess", "king", "queen", "prince",
  "princess", "baron", "earl", "knight", "priest", "vicar", "clerk", "agent",
  "spy", "sailor", "driver", "landlord", "landlady", "innkeeper", "barber",
  "husband", "wife", "widow", "son", "daughter", "brother", "sister", "father",
  "mother", "uncle", "aunt", "cousin", "nephew", "niece",
  // common object / weapon nouns
  "revolver", "razor", "rope", "knife", "gun", "pistol", "dagger", "sword",
  "hammer", "poison", "letter", "note", "key", "box", "bag", "case", "ring",
  "bottle", "glass", "cup", "hat", "coat", "stick", "cane", "lamp", "candle",
  "pipe", "cigar", "cigarette", "money", "coin", "coins", "jewel", "jewels",
  "weapon", "body", "corpse", "blood", "footprint", "footprints",
  // generic event / abstract nouns
  "murder", "death", "theft", "robbery", "crime", "case", "mystery", "secret",
  "revenge", "arrest", "escape", "trial", "execution", "disappearance",
  "analysis", "test", "method",
  // generic place nouns
  "house", "room", "inn", "hotel", "street", "road", "lane", "square", "park",
  "garden", "gardens", "church", "abbey", "hall", "tower", "bridge", "station",
  "shop", "office", "club", "school", "river", "wood", "woods", "hill", "town",
  "village", "city", "country", "estate", "manor", "castle", "cottage",
]);

/** Opposite-gender honorific pairs — a label-prefix delta that means
 * spouse/relative, never the same person. Stored as a canonical-keyed map. */
const OPPOSITE_GENDER_TITLES: Record<string, string> = {
  mr: "mrs", mrs: "mr", lord: "lady", lady: "lord", king: "queen", queen: "king",
  count: "countess", countess: "count", duke: "duchess", duchess: "duke",
  sir: "dame", dame: "sir", brother: "sister", sister: "brother",
  monsieur: "madame", madame: "monsieur", baron: "baroness", baroness: "baron",
  prince: "princess", princess: "prince", master: "mistress", mistress: "master",
  m: "mme", mme: "m",
};

/** Parenthetical RELATIONAL cues — a parenthetical describing the entity as
 * someone else's relative/ancestor names a DIFFERENT person. */
const RELATIONAL_CUES = new Set([
  "husband", "wife", "widow", "widower", "spouse", "ancestor", "descendant",
  "son", "daughter", "father", "mother", "brother", "sister", "uncle", "aunt",
  "cousin", "nephew", "niece", "fiance", "fiancee", "betrothed", "lover",
  "mistress", "relative", "kin", "parent",
]);

/** Generic place head-nouns. When two place names share one of these but carry
 * DIFFERENT qualifiers for it ("Bloomsbury Square" ↔ "Queen Square"), they are
 * different places even if one token-set contains the other. */
const PLACE_HEAD_NOUNS = new Set([
  "square", "street", "road", "lane", "avenue", "place", "court", "gardens",
  "park", "hall", "house", "inn", "hotel", "club", "bridge", "station", "yard",
  "market", "terrace", "row", "crescent", "walk", "gate", "wharf", "quay",
  "mews", "close", "drive", "way", "circus", "common", "green",
]);

/** Locational / structural head-nouns whose ADDITION turns a place name into a
 * DIFFERENT (contained or adjacent) place: "Scotland Yard" → "Black Museum,
 * Scotland Yard"; "Westminster Abbey" → "New flats near Westminster Abbey". */
const CONTAINMENT_HEAD_NOUNS = new Set([
  "near", "flat", "flats", "shop", "island", "museum", "memorial", "room",
  "building", "mine", "mines", "wing", "annex", "annexe", "outhouse", "stable",
  "stables", "cellar", "attic", "tower", "gate", "yard", "court", "monument",
  "statue", "site", "ruins", "vault", "crypt", "tomb", "well", "pond",
  "spectroscopic", "defibrination",
]);

/** Gendered honorifics (a one-sided one + shared surname = spouse/relative). */
const GENDERED_TITLES = new Set([
  "mr", "mrs", "ms", "lord", "lady", "sir", "dame", "count", "countess",
  "duke", "duchess", "king", "queen", "prince", "princess", "baron", "baroness",
  "madame", "monsieur", "mme", "m", "mlle", "miss",
]);

/** Leading-title vocabulary recognised by the guards: the fuzzy honorific
 * stop-list PLUS gendered/relational titles (count/countess, duke/duchess…)
 * that are not honorifics for tokenization but DO carry gender for guard C. */
const GUARD_TITLE_TOKENS = new Set<string>([
  ...FUZZY_HONORIFICS,
  ...Object.keys(OPPOSITE_GENDER_TITLES),
]);
/** Honorifics stripped to recover a label's bare NAME tokens (mirror of the
 * fuzzy tokenizer's stop-list; used by the guards). */
const GUARD_HONORIFICS = FUZZY_HONORIFICS;

interface GuardSurface {
  /** Bare-name tokens (parenthetical-stripped, honorific-stripped). */
  name: string[];
  /** Per-parenthetical token lists. */
  parens: string[][];
  /** Leading title of the raw label (lowercased, period-stripped), or null —
   * any recognised honorific OR gendered/relational title (count, countess…). */
  leadingTitle: string | null;
  /** All tokens of the raw label (honorific-stripped) — name + every
   * parenthetical — for cross-reference relational detection. */
  allTokens: Set<string>;
}

/** Decompose a label into bare-name tokens, parenthetical token lists, and its
 * leading title. Deterministic; reads the surface string only. */
function guardSurface(label: string): GuardSurface {
  const lead = /^\s*([A-Za-zÀ-ÖØ-öø-ÿ]+)\.?\s+/u.exec(label);
  const leadTok = lead ? lead[1]!.toLowerCase() : null;
  const leadingTitle = leadTok && GUARD_TITLE_TOKENS.has(leadTok) ? leadTok : null;
  const name = fuzzyTokens(label.replace(PARENTHETICAL, " "));
  const parens: string[][] = [];
  const allTokens = new Set<string>(name);
  for (const m of label.match(/\(([^)]*)\)/gu) ?? []) {
    const toks = fuzzyTokens(m.slice(1, -1));
    if (toks.length > 0) {
      parens.push(toks);
      for (const t of toks) allTokens.add(t);
    }
  }
  return { name, parens, leadingTitle, allTokens };
}

/** Best surface per node: the primary label decomposition. We use the node's
 * label when present, else the first alias, so the guards have a stable surface. */
function nodeGuardSurface(node: OntologyPatchNode): GuardSurface {
  const label = node.label ?? node.aliases?.[0] ?? "";
  return guardSurface(label);
}

function isSubsetTokens(small: string[], big: string[]): boolean {
  const B = new Set(big);
  return small.every((t) => B.has(t));
}

/**
 * Returns a human-readable REASON when two nodes are confidently DIFFERENT
 * entities (so the pair must be rejected by both tiers), else null. Errs toward
 * KEEPING plausible near-duplicates: only the measured high-confidence
 * false-positive classes are rejected.
 */
export function differentEntityReason(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
): string | null {
  const a = nodeGuardSurface(left);
  const b = nodeGuardSurface(right);
  return differentEntityReasonFromGuardSurfaces(left, right, a, b);
}

/**
 * Precision guard over already-derived node surfaces. The public predicate
 * above remains the single-node API; the queue uses this form to avoid
 * rebuilding either surface for every blocked pair.
 */
function differentEntityReasonFromGuardSurfaces(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
  a: GuardSurface,
  b: GuardSurface,
): string | null {
  if (a.name.length === 0 || b.name.length === 0) return null;
  // Gender/relational title rules apply to PERSON-like entities only: a place
  // name beginning with "Queen"/"King"/"Lord" ("Queen Square", "King's Bench
  // Walk") must not be read as a gendered honorific.
  const t = String(left.type ?? "").toLowerCase();
  const isPlaceType = t === "location" || t === "place";

  const setA = new Set(a.name);
  const setB = new Set(b.name);
  const sharedName = a.name.filter((t) => setB.has(t));
  const aHasParen = a.parens.length > 0;
  const bHasParen = b.parens.length > 0;
  // A bare name vs the SAME name + a parenthetical disambiguator is the
  // canonical KEEP case ("Hugo Oberstein" ↔ "Hugo Oberstein (spy)"): one side
  // has no parenthetical and its name is a subset of the other's name.
  const isDisambiguatorPair =
    (!aHasParen && isSubsetTokens(a.name, b.name)) ||
    (!bHasParen && isSubsetTokens(b.name, a.name));

  // (C) Opposite-gender / relational honorific → spouse/relative, not the same.
  if (
    !isPlaceType &&
    a.leadingTitle &&
    b.leadingTitle &&
    OPPOSITE_GENDER_TITLES[a.leadingTitle] === b.leadingTitle
  ) {
    return `opposite-gender title: ${a.leadingTitle} vs ${b.leadingTitle}`;
  }
  // Relational cue in a parenthetical that CROSS-REFERENCES the other node —
  // either the two share a name token (the relation is between these two), the
  // pair is a bare-name/disambiguator pair, or the relational parenthetical
  // names a token that appears in the OTHER node's surface ("Lucas's wife" on
  // the Fournaye node, where "Lucas" is the other node's name).
  for (const [self, other] of [[a, b], [b, a]] as const) {
    for (const paren of self.parens) {
      if (!paren.some((t) => RELATIONAL_CUES.has(t))) continue;
      const crossRef = paren.some((t) => !RELATIONAL_CUES.has(t) && other.allTokens.has(t));
      if (sharedName.length > 0 || isDisambiguatorPair || crossRef) {
        return `relational parenthetical (spouse/relative): ${paren.join(" ")}`;
      }
    }
  }
  // One-sided gendered title + shared surname + an extra given name on the
  // titled side ⇒ a relative of the bare-named person, not the same person
  // ("Lady Hilda Trelawney Hope" ↔ "Trelawney Hope"). The Lestrade keep-case is
  // safe: "Inspector" is not a gendered title.
  {
    const titled = a.leadingTitle && GENDERED_TITLES.has(a.leadingTitle) ? a : b.leadingTitle && GENDERED_TITLES.has(b.leadingTitle) ? b : null;
    const bare = titled === a ? b : titled === b ? a : null;
    if (
      !isPlaceType &&
      titled &&
      bare &&
      !(bare.leadingTitle && GENDERED_TITLES.has(bare.leadingTitle)) &&
      sharedName.length >= 1 &&
      isSubsetTokens(bare.name, titled.name) &&
      titled.name.length > bare.name.length
    ) {
      return `one-sided gendered title + extra given name (relative): ${titled.leadingTitle}`;
    }
  }

  // (A) Role-noun / common-noun-only overlap: the only shared NAME tokens are
  // all generic. "Narrator (Watson)" ↔ "Narrator (Bunny Manders)" share only
  // "narrator"; never the same entity. Disambiguator-pairs are exempt (a bare
  // generic noun + a qualifier may still be a refinement — but two DIFFERENT
  // parentheticals over a generic noun are different things).
  if (sharedName.length > 0 && sharedName.every((t) => GENERIC_ENTITY_NOUNS.has(t))) {
    if (!isDisambiguatorPair) {
      return `shared tokens are all generic nouns: ${sharedName.join(", ")}`;
    }
  }

  // (B) Thin overlap + DISJOINT disambiguators: a single shared non-generic
  // token (a surname/placename) but both carry parentheticals that are mutually
  // disjoint (neither a subset of the other) → different bearers of the name
  // ("Inspector Robinson (Highgate)" ↔ "Mrs. Robinson (housekeeper)"). When one
  // parenthetical refines the other (subset), it is the SAME entity (keep).
  if (sharedName.length <= 1 && aHasParen && bHasParen && !isDisambiguatorPair) {
    const disjoint = a.parens.every((pa) =>
      b.parens.every((pb) => !isSubsetTokens(pa, pb) && !isSubsetTokens(pb, pa)),
    );
    if (disjoint && sharedName.length === 1) {
      return `different disambiguators over a single shared token: ${sharedName[0]}`;
    }
  }

  // (D) Containment that ADDS a new locational/structural head-noun → different
  // (contained or adjacent) place. Applies when one bare name strictly contains
  // the other AND the extra tokens include a containment head-noun. The pure
  // disambiguator case (identical name-part, qualifier only in a parenthetical)
  // never reaches here because name-parts are equal, not strictly contained.
  {
    const [small, big] = a.name.length <= b.name.length ? [a.name, b.name] : [b.name, a.name];
    if (small.length >= 1 && small.length < big.length && isSubsetTokens(small, big)) {
      const smallSet = new Set(small);
      const extra = big.filter((t) => !smallSet.has(t));
      if (extra.some((t) => CONTAINMENT_HEAD_NOUNS.has(t))) {
        return `containment adds a new head-noun: ${extra.filter((t) => CONTAINMENT_HEAD_NOUNS.has(t)).join(", ")}`;
      }
      // Place re-qualification: both names contain a generic place head-noun
      // (e.g. "square") and the larger one adds a NEW qualifier for it that is
      // not itself a place head-noun ("Bloomsbury Square" ⊂ "Queen Square,
      // Bloomsbury" adds "queen") → a different place.
      if (
        isPlaceType &&
        small.some((t) => PLACE_HEAD_NOUNS.has(t)) &&
        extra.some((t) => !PLACE_HEAD_NOUNS.has(t) && !isOrdinalToken(t))
      ) {
        return `place re-qualified around a shared head-noun: +${extra.join(" ")}`;
      }
    }
  }

  // (E) Leading address-number / serial divergence: two place names that share a
  // tail and differ in a numeric leading token are distinct addresses
  // ("5A King's Bench Walk" ↔ "6A King's Bench Walk").
  if (sharedName.length >= 1) {
    const aNum = a.name[0]!;
    const bNum = b.name[0]!;
    if (aNum !== bNum && /\d/u.test(aNum) && /\d/u.test(bNum)) {
      return `address/serial number differs: ${aNum} vs ${bNum}`;
    }
  }

  // (F) Divergent distinctive tokens around a shared GENERIC head: not a
  // subset/disambiguator pair, the shared tokens include a generic place/event/
  // object head-noun, and EACH side carries a distinctive (non-generic,
  // non-ordinal) token the other lacks → different entities ("Revenge for John
  // Ferrier" ↔ "Revenge for Lucy Ferrier"; "Queen Square, Bloomsbury" ↔
  // "Bloomsbury Square"; "Murder of Major Murray" ↔ "Execution of … St. Clare").
  if (!isDisambiguatorPair && sharedName.length >= 1) {
    const sharedHasGenericHead = sharedName.some((t) => GENERIC_ENTITY_NOUNS.has(t));
    const aDistinct = a.name.filter((t) => !setB.has(t) && !GENERIC_ENTITY_NOUNS.has(t) && !isOrdinalToken(t));
    const bDistinct = b.name.filter((t) => !setA.has(t) && !GENERIC_ENTITY_NOUNS.has(t) && !isOrdinalToken(t));
    if (sharedHasGenericHead && aDistinct.length >= 1 && bDistinct.length >= 1) {
      return `divergent distinctive tokens around a shared generic head: ${aDistinct.join(" ")} vs ${bDistinct.join(" ")}`;
    }
  }

  return null;
}

// --- Structural tier -------------------------------------------------------
//
// The LOWEST-confidence tier, capability-gated (`structural`, default OFF) and
// ranked strictly BELOW exact and fuzzy. It answers the case the lexical tiers
// cannot: two entities that are the SAME real thing but whose strings do not
// look alike. Signals (spec `SPEC_ONTOLOGY_RECONCILIATION_ALGORITHM.md` §2,
// "Structural — shared-neighbour overlap (Jaccard on neighbour sets),
// same-source co-occurrence, type compatibility"):
//
//   1. shared-neighbour Jaccard over INFORMATIVE (non-hub) neighbours,
//   2. directed relation-type profile overlap,
//   3. shared registry/source provenance.
//
// It is deterministic (no LLM), it emits CANDIDATES ONLY (status "candidate",
// `accept_match` proposal for a human to adjudicate — nothing is ever applied),
// and every candidate carries its `structural_basis` so the human sees the
// exact shared neighbours the proposal rests on.
//
// FALSE-POSITIVE GUARD (the central design concern). The structural analogue of
// the known fuzzy false positive (HC-14 → COMPTON:C-15 at 0.45) is the
// SIBLING trap: two DISTINCT children of the same parent are, structurally, as
// similar as two duplicates of one entity — a pair of leaves under one hub has
// neighbour-Jaccard 1.0 while naming two different things. Four guards, each
// pinned by a test in tests/ontology-reconciliation-structural.test.ts:
//
//   (S1) EVIDENTIAL MASS — both nodes need degree ≥ `minDegree` AND
//        ≥ `minSharedNeighbours` shared informative neighbours. One shared
//        parent is never evidence, which kills the sibling-leaf explosion at
//        the root.
//   (S2) HUB DISCOUNTING — a neighbour whose degree exceeds `hubDegreeMax`
//        carries no identifying information (it connects to everything), so it
//        is removed from BOTH neighbour sets before any overlap is computed.
//        This is the structural analogue of the lexical generic-noun stop-list.
//   (S3) LEXICAL CONTRADICTION — `differentEntityReason` runs on the pair and
//        VETOES it. Structure may never re-admit a pair the lexical guards
//        confidently rejected (siblings, opposite-gender titles, address
//        divergence, place re-qualification): the structural tier must not
//        resurrect the HC-14 class through a different door.
//   (S4) SERIAL DIVERGENCE — two labels bearing DISJOINT numeric identifiers
//        ("HC-14" vs "COMPTON:C-15", "Step 3" vs "Step 7") are distinct members
//        of a series, never the same entity, however similar their context is.
//        This is the direct, explicit guard against repeating HC-14 → C-15.

/** Thresholds and guard knobs for the structural tier. */
export interface StructuralTierConfig {
  /** (S1) Minimum informative degree required on BOTH sides. */
  minDegree: number;
  /** (S1) Minimum number of shared informative neighbours. */
  minSharedNeighbours: number;
  /** (S2) A neighbour with a degree above this is a hub and carries no signal. */
  hubDegreeMax: number;
  /** Minimum Jaccard over the informative neighbour sets. */
  neighbourJaccardThreshold: number;
  /** Minimum Jaccard over the directed relation-type profiles. */
  relationProfileThreshold: number;
  /** Max shared-neighbour ids embedded in a candidate's `structural_basis`. */
  maxBasisNeighbours: number;
  /**
   * (S6) Neighbour types that carry CO-OCCURRENCE, not identity. Sharing a
   * chapter/work/scene means two entities were mentioned together, which every
   * pair of protagonists does — it is not evidence of being the same entity.
   */
  containerNeighbourTypes: readonly string[];
  /**
   * (S5) Relation types that ASSERT identity. A direct edge of any OTHER type
   * between the two nodes is the corpus asserting they are different things.
   */
  identityRelationTypes: readonly string[];
  /**
   * (S7) Require the two nodes' SOURCE provenance to be disjoint. Two nodes
   * emitted by one extraction pass over one document were distinguished BY that
   * pass; structural similarity between them is co-occurrence, not identity.
   */
  requireDisjointSourceProvenance: boolean;
}

export const DEFAULT_STRUCTURAL_TIER_CONFIG: StructuralTierConfig = {
  minDegree: 3,
  minSharedNeighbours: 3,
  hubDegreeMax: 50,
  neighbourJaccardThreshold: 0.5,
  relationProfileThreshold: 0.5,
  maxBasisNeighbours: 12,
  containerNeighbourTypes: DEFAULT_FUZZY_EXCLUDE_TYPES,
  identityRelationTypes: ["alias_of", "same_as", "duplicate_of", "canonical_of"],
  requireDisjointSourceProvenance: true,
};

/**
 * Score ceiling of the structural tier. MUST stay strictly below the fuzzy
 * floor (0.7) so the tier can never outrank a lexical match. Pinned by a test.
 */
export const STRUCTURAL_TIER_MAX_SCORE = 0.65;
/** Score floor of the structural tier (neighbour overlap alone). */
export const STRUCTURAL_TIER_BASE_SCORE = 0.5;

/**
 * Structural container types excluded from the structural tier by default —
 * the SAME list the fuzzy tier excludes. Two distinct chapters of one work, or
 * two distinct sections of one document, share almost their entire
 * neighbourhood (the work, its characters) while never being the same thing:
 * containers are exactly where the sibling trap is densest.
 */
export const DEFAULT_STRUCTURAL_EXCLUDE_TYPES = DEFAULT_FUZZY_EXCLUDE_TYPES;

/** Undirected neighbourhood + directed relation-type profile of every node. */
export interface StructuralIndex {
  neighbours: Map<string, Set<string>>;
  /** Directed relation-type signatures, `out:<type>` / `in:<type>`. */
  relationProfile: Map<string, Set<string>>;
  /** Node type by id — used to discount CONTAINER neighbours (S6). */
  nodeTypes: Map<string, string>;
  /** Relation types joining an unordered pair — used by the direct-edge veto (S5). */
  edgeTypes: Map<string, Set<string>>;
}

/** Unordered pair key. JSON encoding so no separator can collide with an id. */
function pairKeyOf(a: string, b: string): string {
  return a <= b ? JSON.stringify([a, b]) : JSON.stringify([b, a]);
}

/** Build the structural index from the context relations. Deterministic. */
export function buildStructuralIndex(
  relations: readonly OntologyPatchRelation[],
  nodes: readonly OntologyPatchNode[] = [],
): StructuralIndex {
  const neighbours = new Map<string, Set<string>>();
  const relationProfile = new Map<string, Set<string>>();
  const edgeTypes = new Map<string, Set<string>>();
  const add = (map: Map<string, Set<string>>, key: string, value: string): void => {
    let bucket = map.get(key);
    if (!bucket) {
      bucket = new Set<string>();
      map.set(key, bucket);
    }
    bucket.add(value);
  };
  for (const relation of relations) {
    const source = relation.source_id;
    const target = relation.target_id;
    if (!source || !target || source === target) continue;
    add(neighbours, source, target);
    add(neighbours, target, source);
    const type = relation.type ?? "related";
    add(relationProfile, source, `out:${type}`);
    add(relationProfile, target, `in:${type}`);
    add(edgeTypes, pairKeyOf(source, target), type);
  }
  const nodeTypes = new Map<string, string>();
  for (const node of nodes) if (node.type) nodeTypes.set(node.id, node.type);
  return { neighbours, relationProfile, nodeTypes, edgeTypes };
}

/** Digit-only tokens of a label surface (serial identifiers). */
function numericTokens(tokens: readonly string[]): Set<string> {
  return new Set(tokens.filter((token) => /^\d+$/u.test(token)));
}

function setsDisjoint(a: Set<string>, b: Set<string>): boolean {
  for (const value of a) if (b.has(value)) return false;
  return true;
}

/**
 * (S3)+(S4) LABEL-level veto for the structural tier: a reason why the two
 * nodes are confidently DIFFERENT entities regardless of how alike their
 * neighbourhoods are, or null.
 *
 * (S3) delegates to `differentEntityReason` — every measured lexical
 * false-positive class stays rejected when the proposal arrives structurally.
 * (S4) rejects DISJOINT numeric identifiers: "HC-14" vs "COMPTON:C-15" are
 * members 14 and 15 of a series. This is the explicit guard against reproducing
 * the known 0.45 fuzzy false positive in structural form.
 */
export function structuralLabelRejectReason(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
): string | null {
  // (S3) the lexical guards VETO the pair — structure never overrides them.
  const lexical = differentEntityReason(left, right);
  if (lexical) return `lexically rejected pair: ${lexical}`;

  const a = nodeGuardSurface(left);
  const b = nodeGuardSurface(right);
  // (S4) disjoint serial identifiers => distinct members of a series.
  const aNums = numericTokens([...a.allTokens]);
  const bNums = numericTokens([...b.allTokens]);
  if (aNums.size > 0 && bNums.size > 0 && setsDisjoint(aNums, bNums)) {
    return `divergent serial identifiers: ${[...aNums].sort().join(",")} vs ${[...bNums].sort().join(",")}`;
  }
  // Roman-numeral / ordinal series over an otherwise shared name.
  if (a.name.length > 0 && b.name.length > 0 && differsOnlyByOrdinal(a.name, b.name)) {
    return `formulaic series (ordinal delta): ${a.name.join(" ")} vs ${b.name.join(" ")}`;
  }
  return null;
}

export interface StructuralMatchResult {
  matched: boolean;
  /** Null when the pair was vetoed; otherwise the guard that failed, if any. */
  rejectReason: string | null;
  neighbourJaccard: number;
  relationProfileJaccard: number;
  sharedNeighbours: string[];
  sharedRelationTypes: string[];
  sharedProvenance: string[];
  score: number;
}

function jaccardOfSets(a: Set<string>, b: Set<string>): { jaccard: number; shared: string[] } {
  const shared: string[] = [];
  for (const value of a) if (b.has(value)) shared.push(value);
  const union = a.size + b.size - shared.length;
  return { jaccard: union === 0 ? 0 : shared.length / union, shared: shared.sort((x, y) => x.localeCompare(y)) };
}

/**
 * SOURCE provenance — the documents an entity was extracted FROM. Overlap here
 * is a NEGATIVE identity signal (S7): one pass over one document that emitted
 * two nodes was distinguishing them.
 */
function sourceProvenanceRefs(node: OntologyPatchNode): Set<string> {
  return new Set((node.source_refs ?? []).filter((ref) => ref.length > 0));
}

/**
 * REGISTRY provenance — references to canonical registry records. Overlap here
 * is a POSITIVE identity signal: two nodes pointing at the same registry record
 * are pointing at the same real thing.
 */
function registryProvenanceRefs(node: OntologyPatchNode): Set<string> {
  const refs = new Set((node.registry_refs ?? []).filter((ref) => ref.length > 0));
  if (node.registry_id && node.registry_record_id) refs.add(`${node.registry_id}#${node.registry_record_id}`);
  return refs;
}

/**
 * Structural similarity between two nodes. Returns `matched: false` with a
 * `rejectReason` whenever a guard fires, so the guards are observable (and
 * testable) rather than silent threshold arithmetic.
 */
export function structuralMatchNodes(
  left: OntologyPatchNode,
  right: OntologyPatchNode,
  index: StructuralIndex,
  config: StructuralTierConfig = DEFAULT_STRUCTURAL_TIER_CONFIG,
): StructuralMatchResult {
  const empty = {
    neighbourJaccard: 0,
    relationProfileJaccard: 0,
    sharedNeighbours: [] as string[],
    sharedRelationTypes: [] as string[],
    sharedProvenance: [] as string[],
    score: 0,
  };
  // (S3)+(S4) label veto first — cheapest and the strongest precision guard.
  const labelReject = structuralLabelRejectReason(left, right);
  if (labelReject) return { matched: false, rejectReason: labelReject, ...empty };

  // (S5) DIRECT-EDGE VETO. A relation between the two nodes is the CORPUS
  // asserting they are distinct things: "Prasville OPPOSES Daubrecq",
  // "Gilbert ACCOMPLICE_OF Vaucheray" — an entity does not oppose or assist
  // itself. Only identity relations (alias_of/same_as/…) are compatible with
  // the pair being one entity, and those are already a settled merge.
  const joining = index.edgeTypes.get(pairKeyOf(left.id, right.id));
  if (joining) {
    const identity = new Set(config.identityRelationTypes);
    const asserted = [...joining].filter((type) => !identity.has(type));
    if (asserted.length > 0) {
      return {
        matched: false,
        rejectReason: `direct relation asserts distinct entities: ${asserted.sort().join(", ")}`,
        ...empty,
      };
    }
  }

  const rawLeft = index.neighbours.get(left.id) ?? new Set<string>();
  const rawRight = index.neighbours.get(right.id) ?? new Set<string>();
  const containerTypes = new Set(config.containerNeighbourTypes);
  // (S2) HUB DISCOUNTING: drop neighbours that connect to everything — and drop
  // the two nodes themselves so a direct edge between them is not "context".
  // (S6) CONTAINER DISCOUNTING: drop neighbours that are structural CONTAINERS
  // (chapter/work/scene/section/saga). Sharing a chapter means the two entities
  // were mentioned together — every pair of protagonists in a book shares most
  // of its chapters. Co-occurrence is not identity, and this is the guard that
  // separates a genuine duplicate from a narrative SIBLING.
  const informative = (own: Set<string>, other: string): Set<string> => {
    const out = new Set<string>();
    for (const id of own) {
      if (id === other || id === left.id || id === right.id) continue;
      if ((index.neighbours.get(id)?.size ?? 0) > config.hubDegreeMax) continue;
      const type = index.nodeTypes.get(id);
      if (type && containerTypes.has(type)) continue;
      out.add(id);
    }
    return out;
  };
  const leftNeighbours = informative(rawLeft, right.id);
  const rightNeighbours = informative(rawRight, left.id);

  // (S1) EVIDENTIAL MASS: a node with almost no informative context cannot be
  // structurally identified — this is what stops two sibling leaves under one
  // shared parent from reading as a perfect (Jaccard 1.0) duplicate pair.
  if (leftNeighbours.size < config.minDegree || rightNeighbours.size < config.minDegree) {
    return {
      matched: false,
      rejectReason: `insufficient informative degree: ${leftNeighbours.size}/${rightNeighbours.size} < ${config.minDegree}`,
      ...empty,
    };
  }

  const neighbourOverlap = jaccardOfSets(leftNeighbours, rightNeighbours);
  if (neighbourOverlap.shared.length < config.minSharedNeighbours) {
    return {
      matched: false,
      rejectReason: `too few shared informative neighbours: ${neighbourOverlap.shared.length} < ${config.minSharedNeighbours}`,
      ...empty,
      neighbourJaccard: neighbourOverlap.jaccard,
    };
  }
  if (neighbourOverlap.jaccard < config.neighbourJaccardThreshold) {
    return {
      matched: false,
      rejectReason: `neighbour Jaccard ${neighbourOverlap.jaccard.toFixed(2)} < ${config.neighbourJaccardThreshold}`,
      ...empty,
      neighbourJaccard: neighbourOverlap.jaccard,
    };
  }

  const profileOverlap = jaccardOfSets(
    index.relationProfile.get(left.id) ?? new Set<string>(),
    index.relationProfile.get(right.id) ?? new Set<string>(),
  );
  if (profileOverlap.jaccard < config.relationProfileThreshold) {
    return {
      matched: false,
      rejectReason: `relation-type profile Jaccard ${profileOverlap.jaccard.toFixed(2)} < ${config.relationProfileThreshold}`,
      ...empty,
      neighbourJaccard: neighbourOverlap.jaccard,
      relationProfileJaccard: profileOverlap.jaccard,
    };
  }

  const registry = jaccardOfSets(registryProvenanceRefs(left), registryProvenanceRefs(right));
  const sources = jaccardOfSets(sourceProvenanceRefs(left), sourceProvenanceRefs(right));

  // (S7) SAME-SOURCE SIBLING VETO. The decisive precision guard, measured on
  // both corpora: two nodes extracted from the SAME document were separated by
  // that extraction pass, so their structural resemblance is co-occurrence
  // ("Google Sheets" and "Google Drive" support the same five processes;
  // "Father Brown" and "Flambeau" appear in the same stories). Only entities
  // seen in DIFFERENT sources can be two records of one thing. A shared
  // REGISTRY record overrides the veto — that is positive identity evidence.
  if (
    config.requireDisjointSourceProvenance &&
    sources.shared.length > 0 &&
    registry.shared.length === 0
  ) {
    return {
      matched: false,
      rejectReason: `same-source siblings: ${sources.shared.length} shared source ref(s), no shared registry record`,
      ...empty,
      neighbourJaccard: neighbourOverlap.jaccard,
      relationProfileJaccard: profileOverlap.jaccard,
    };
  }

  // Score bands, all strictly below the fuzzy floor (0.70). Base = neighbour
  // overlap alone; each corroborating signal adds 0.05, ceiling 0.65.
  let score = STRUCTURAL_TIER_BASE_SCORE;
  if (registry.shared.length > 0) score += 0.05;
  if (profileOverlap.jaccard >= 1) score += 0.05;
  if (neighbourOverlap.shared.length >= config.minSharedNeighbours * 2) score += 0.05;
  score = Math.min(score, STRUCTURAL_TIER_MAX_SCORE);
  const provenance = registry;

  return {
    matched: true,
    rejectReason: null,
    neighbourJaccard: neighbourOverlap.jaccard,
    relationProfileJaccard: profileOverlap.jaccard,
    sharedNeighbours: neighbourOverlap.shared,
    sharedRelationTypes: profileOverlap.shared,
    sharedProvenance: provenance.shared,
    score: Number(score.toFixed(2)),
  };
}

/**
 * BLOCKING for the structural tier (spec §1): candidate pairs are drawn ONLY
 * from nodes that share at least one INFORMATIVE neighbour, via an inverted
 * neighbour → nodes index. Because a neighbour is informative only when its
 * degree is ≤ `hubDegreeMax`, every block holds at most `hubDegreeMax` nodes,
 * so the pass is bounded by O(|E| · hubDegreeMax) instead of the O(n²) scan the
 * lexical tiers use. Returns pair keys `a|b` with `a < b`, sorted, deterministic.
 */
export function structuralCandidatePairs(
  index: StructuralIndex,
  config: StructuralTierConfig = DEFAULT_STRUCTURAL_TIER_CONFIG,
): Array<[string, string]> {
  // Pairs are keyed through a Map so no separator character is ever embedded in
  // a key: a node id may legitimately contain any character.
  const pairs = new Map<string, [string, string]>();
  for (const members of index.neighbours.values()) {
    // (S2) a hub block carries no identifying signal — skip it wholesale.
    if (members.size > config.hubDegreeMax) continue;
    if (members.size < 2) continue;
    const ids = [...members].sort((a, b) => a.localeCompare(b));
    for (let i = 0; i < ids.length; i += 1) {
      for (let j = i + 1; j < ids.length; j += 1) {
        const left = ids[i]!;
        const right = ids[j]!;
        pairs.set(JSON.stringify([left, right]), [left, right]);
      }
    }
  }
  return [...pairs.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, pair]) => pair);
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

function candidateScore(
  sharedTerms: string[],
  canonicalNormalizedLabel: string | null,
  candidateNormalizedLabel: string | null,
): number {
  const exactLabelMatch =
    canonicalNormalizedLabel !== null &&
    canonicalNormalizedLabel === candidateNormalizedLabel &&
    sharedTerms.includes(canonicalNormalizedLabel);
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

interface MemoizedReconciliationNode {
  node: OntologyPatchNode;
  /** Normalized terms, in the exact tier's existing stable order. */
  exactTerms: string[];
  exactTermSet: Set<string>;
  /** Normalized primary label used only for exact-tier scoring. */
  normalizedLabel: string | null;
  /** Fuzzy variants and guard data are both derived once per comparable node. */
  fuzzyVariants: FuzzyVariant[];
  guardSurface: GuardSurface;
  exactBlockingKeys: string[];
  fuzzyBlockingKeys: string[];
  /** All fuzzy token keys; queried only if some variant is repeated-token-only. */
  fuzzySingleTokenKeys: string[];
  /** A legacy containment edge case: ≥2 tokens but only one distinct token. */
  fuzzyDegenerateTokenKeys: string[];
}

/**
 * Mutable real production buckets, exposed for blocking-losslessness tests.
 * This module-level API is intentionally not re-exported from the package root.
 */
export interface OntologyReconciliationLexicalBlockingIndex {
  exact: Map<string, number[]>;
  fuzzy: Map<string, number[]>;
  fuzzySingles?: Map<string, number[]>;
  fuzzyDegenerate?: Map<string, number[]>;
}

/** Opaque row-major pair identity used by the exported blocking inspection API. */
export type OntologyReconciliationBlockedPair = `${number}:${number}`;

const BLOCKING_KEY_SEPARATOR = "\u0000";

function typedBlockingKey(type: string, value: string): string {
  return `${type}${BLOCKING_KEY_SEPARATOR}${value}`;
}

function fuzzyBlockingKeysForNode(
  type: string,
  variants: readonly FuzzyVariant[],
  threshold: number,
): string[] {
  const keys = new Set<string>();

  // fuzzyMatchNodes treats a non-positive threshold as a match even when the
  // Jaccard intersection is empty. Preserve that degenerate caller override
  // with a type-local wildcard; positive thresholds use the lossless keys
  // below and never fall back to a cross product.
  if (threshold <= 0) {
    keys.add(typedBlockingKey(type, "*"));
    return [...keys];
  }

  if (threshold <= 0.5) {
    // A pair-token block is lossless only above 0.5. For every positive caller
    // threshold at or below 0.5, a shared single token is the lossless fuzzy
    // blocking key (equality and containment also necessarily share one).
    for (const variant of variants) {
      for (const token of variant.tokens) keys.add(typedBlockingKey(type, token));
    }
    return [...keys];
  }

  for (const variant of variants) {
    // Fuzzy matching itself rejects a variant pair whose smaller side has
    // fewer than two tokens. A multiset pair (including token/token for a
    // repeated token) keeps that same condition lossless for sequence-equal
    // variants as well as ordinary distinct-token variants.
    for (let left = 0; left < variant.tokens.length; left += 1) {
      for (let right = left + 1; right < variant.tokens.length; right += 1) {
        const a = variant.tokens[left]!;
        const b = variant.tokens[right]!;
        const pair = a <= b
          ? `${a}${BLOCKING_KEY_SEPARATOR}${b}`
          : `${b}${BLOCKING_KEY_SEPARATOR}${a}`;
        keys.add(typedBlockingKey(type, pair));
      }
    }
  }
  return [...keys];
}

function fuzzySingleTokenKeysForNode(type: string, variants: readonly FuzzyVariant[]): string[] {
  const keys = new Set<string>();
  for (const variant of variants) {
    for (const token of variant.tokens) keys.add(typedBlockingKey(type, token));
  }
  return [...keys];
}

function fuzzyDegenerateTokenKeysForNode(type: string, variants: readonly FuzzyVariant[]): string[] {
  const keys = new Set<string>();
  for (const variant of variants) {
    if (variant.tokens.length < 2 || new Set(variant.tokens).size >= 2) continue;
    // The legacy `tokenSubset` predicate works over token Sets but gates on
    // token-array length. Thus "echo echo" can contain-match "echo bravo".
    // Keep a narrowly-scoped single-token side index for that exact legacy
    // case; ordinary variants still use only the pair-token index above.
    for (const token of variant.tokens) keys.add(typedBlockingKey(type, token));
  }
  return [...keys];
}

function memoizeComparableNodes(
  nodes: readonly OntologyPatchNode[],
  normalizers: NormalizerByNodeType,
  fuzzyEnabled: boolean,
  fuzzyThreshold: number,
): MemoizedReconciliationNode[] {
  const memoized: MemoizedReconciliationNode[] = [];
  for (const node of nodes) {
    // Keep the fuzzy tier's legacy admission/tokenization independent from
    // exact normalization, as the previous comparableNodes filter did.
    const terms = nodeTerms(node);
    if (!node.type || terms.length === 0) continue;

    const normalize = normalizers[node.type] ?? normalizeTerm;
    const exactTerms = exactNodeTerms(node, normalizers);
    const variants = fuzzyEnabled ? fuzzyVariantsForTerms(terms) : [];
    const fuzzySingleTokenKeys = fuzzyEnabled ? fuzzySingleTokenKeysForNode(node.type, variants) : [];
    memoized.push({
      node,
      exactTerms,
      exactTermSet: new Set(exactTerms),
      normalizedLabel: node.label ? normalize(node.label) : null,
      fuzzyVariants: variants,
      guardSurface: nodeGuardSurface(node),
      exactBlockingKeys: exactTerms.map((term) => typedBlockingKey(node.type!, term)),
      fuzzyBlockingKeys: fuzzyEnabled ? fuzzyBlockingKeysForNode(node.type, variants, fuzzyThreshold) : [],
      fuzzySingleTokenKeys,
      fuzzyDegenerateTokenKeys: fuzzyEnabled && !(fuzzyThreshold <= 0.5)
        ? fuzzyDegenerateTokenKeysForNode(node.type, variants)
        : [],
    });
  }
  return memoized.sort((a, b) => a.node.id.localeCompare(b.node.id));
}

function addToInvertedIndex(index: Map<string, number[]>, key: string, nodeIndex: number): void {
  const bucket = index.get(key);
  if (bucket) bucket.push(nodeIndex);
  else index.set(key, [nodeIndex]);
}

function buildLexicalBlockingIndex(
  nodes: readonly MemoizedReconciliationNode[],
): OntologyReconciliationLexicalBlockingIndex {
  const exact = new Map<string, number[]>();
  const fuzzy = new Map<string, number[]>();
  const hasDegenerateFuzzyVariant = nodes.some((node) => node.fuzzyDegenerateTokenKeys.length > 0);
  const fuzzySingles = hasDegenerateFuzzyVariant ? new Map<string, number[]>() : undefined;
  const fuzzyDegenerate = hasDegenerateFuzzyVariant ? new Map<string, number[]>() : undefined;
  for (let nodeIndex = 0; nodeIndex < nodes.length; nodeIndex += 1) {
    const node = nodes[nodeIndex]!;
    for (const key of node.exactBlockingKeys) addToInvertedIndex(exact, key, nodeIndex);
    for (const key of node.fuzzyBlockingKeys) addToInvertedIndex(fuzzy, key, nodeIndex);
    if (fuzzySingles && fuzzyDegenerate) {
      for (const key of node.fuzzySingleTokenKeys) addToInvertedIndex(fuzzySingles, key, nodeIndex);
      for (const key of node.fuzzyDegenerateTokenKeys) addToInvertedIndex(fuzzyDegenerate, key, nodeIndex);
    }
  }
  return { exact, fuzzy, fuzzySingles, fuzzyDegenerate };
}

/**
 * Yields the union of exact and fuzzy blocks in precisely the old nested-loop
 * order: ascending (i, j) over the id-sorted comparable-node list. Index
 * buckets are only candidate generators; all existing type/scope/precision
 * guards remain per-pair filters in the queue generator.
 */
function* enumerateBlockedPairIndexes(
  nodes: readonly MemoizedReconciliationNode[],
  index: OntologyReconciliationLexicalBlockingIndex,
): IterableIterator<readonly [number, number]> {
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const rightIndexes = new Set<number>();
    const left = nodes[leftIndex]!;
    for (const key of left.exactBlockingKeys) {
      for (const rightIndex of index.exact.get(key) ?? []) {
        if (rightIndex > leftIndex) rightIndexes.add(rightIndex);
      }
    }
    for (const key of left.fuzzyBlockingKeys) {
      for (const rightIndex of index.fuzzy.get(key) ?? []) {
        if (rightIndex > leftIndex) rightIndexes.add(rightIndex);
      }
    }
    // `tokenSubset` uses token Sets after a token-array-length gate. Repeated
    // one-token variants are therefore the one case outside the two-distinct-
    // token proof for pair keys; connect them through a narrow side index.
    if (index.fuzzySingles && index.fuzzyDegenerate) {
      for (const key of left.fuzzyDegenerateTokenKeys) {
        for (const rightIndex of index.fuzzySingles.get(key) ?? []) {
          if (rightIndex > leftIndex) rightIndexes.add(rightIndex);
        }
      }
      for (const key of left.fuzzySingleTokenKeys) {
        for (const rightIndex of index.fuzzyDegenerate.get(key) ?? []) {
          if (rightIndex > leftIndex) rightIndexes.add(rightIndex);
        }
      }
    }
    for (const rightIndex of [...rightIndexes].sort((a, b) => a - b)) {
      yield [leftIndex, rightIndex];
    }
  }
}

/** Builds the real lexical buckets for losslessness tests and diagnostics. */
export function buildOntologyReconciliationLexicalBlockingIndex(
  context: OntologyPatchContext,
  options: Pick<GenerateOntologyReconciliationCandidatesOptions, "fuzzy" | "fuzzyThreshold"> = {},
): OntologyReconciliationLexicalBlockingIndex {
  const fuzzyEnabled = options.fuzzy ?? true;
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD;
  const memoized = memoizeComparableNodes(
    context.nodes,
    compileNormalizerByNodeType(context.profile),
    fuzzyEnabled,
    fuzzyThreshold,
  );
  return buildLexicalBlockingIndex(memoized);
}

/**
 * Exposes the lossless lexical blocked-pair set for validation and diagnostic
 * tooling. Members use indices in the id-sorted comparable-node array, so the
 * insertion order is the generator's original ascending (i, j) order.
 */
export function enumerateOntologyReconciliationBlockedPairs(
  context: OntologyPatchContext,
  options: Pick<GenerateOntologyReconciliationCandidatesOptions, "fuzzy" | "fuzzyThreshold"> = {},
  blockingIndex?: OntologyReconciliationLexicalBlockingIndex,
): Set<OntologyReconciliationBlockedPair> {
  const fuzzyEnabled = options.fuzzy ?? true;
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD;
  const memoized = memoizeComparableNodes(
    context.nodes,
    compileNormalizerByNodeType(context.profile),
    fuzzyEnabled,
    fuzzyThreshold,
  );
  const index = blockingIndex ?? buildLexicalBlockingIndex(memoized);
  const pairs = new Set<OntologyReconciliationBlockedPair>();
  for (const [leftIndex, rightIndex] of enumerateBlockedPairIndexes(memoized, index)) {
    pairs.add(`${leftIndex}:${rightIndex}`);
  }
  return pairs;
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

function generateOntologyReconciliationCandidatesWithBlockingIndex(
  context: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions = {},
  suppliedBlockingIndex?: OntologyReconciliationLexicalBlockingIndex,
): OntologyReconciliationCandidateQueue {
  const fuzzyEnabled = options.fuzzy ?? true;
  const fuzzyThreshold = options.fuzzyThreshold ?? DEFAULT_FUZZY_TOKEN_JACCARD_THRESHOLD;
  const cap = options.cap ?? DEFAULT_RECONCILIATION_CANDIDATE_CAP;
  const fuzzyExcludeTypes = new Set(options.fuzzyExcludeTypes ?? DEFAULT_FUZZY_EXCLUDE_TYPES);
  const normalizers = compileNormalizerByNodeType(context.profile);

  const candidates: OntologyReconciliationCandidate[] = [];
  const emittedPairs = new Set<string>();
  const comparableNodes = memoizeComparableNodes(context.nodes, normalizers, fuzzyEnabled, fuzzyThreshold);
  const blockingIndex = suppliedBlockingIndex ?? buildLexicalBlockingIndex(comparableNodes);

  for (const [leftIndex, rightIndex] of enumerateBlockedPairIndexes(comparableNodes, blockingIndex)) {
    const leftMemo = comparableNodes[leftIndex]!;
    const rightMemo = comparableNodes[rightIndex]!;
    const left = leftMemo.node;
    const right = rightMemo.node;
    // Type-guard applies AFTER schema hygiene has canonicalized types.
    if (!left.type || left.type !== right.type) continue;

    // Partitioned registries scope both reconciliation tiers. This guard is
    // deliberately before sharedTerms so a cross-partition label can never
    // become a score-1.0 exact candidate.
    if (violatesPartitionScope(context, left.type, left, right)) continue;

    const sharedTerms = rightMemo.exactTerms.filter((term) => leftMemo.exactTermSet.has(term));

    const { canonical, candidate } = chooseCanonicalPair(left, right);
    const canonicalMemo = canonical === left ? leftMemo : rightMemo;
    const candidateMemo = candidate === left ? leftMemo : rightMemo;
    const pairKey = `${canonical.id}|${candidate.id}`;
    const evidenceRefs = uniqueSorted([
      ...(canonical.source_refs ?? []),
      ...(candidate.source_refs ?? []),
    ]);

    // Precision guards reject confidently-different entities in BOTH tiers
    // (role-noun collisions, opposite-gender/relational pairs, place
    // containment with a new head-noun, address/serial divergence).
    const rejectReason = differentEntityReasonFromGuardSurfaces(
      left,
      right,
      leftMemo.guardSurface,
      rightMemo.guardSurface,
    );

    if (sharedTerms.length > 0) {
      if (rejectReason) continue;
      // Exact tier: shared normalized term (label/alias/normalized_term).
      emittedPairs.add(pairKey);
      candidates.push({
        id: candidateId(canonical, candidate, sharedTerms),
        kind: "entity_match",
        status: "candidate",
        score: candidateScore(
          sharedTerms,
          canonicalMemo.normalizedLabel,
          candidateMemo.normalizedLabel,
        ),
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
    // Precision guard: same rejection classes as the exact tier.
    if (rejectReason) continue;
    // Fuzzy tier: honorific-stripped token containment / Jaccard.
    const fuzzy = fuzzyMatchVariants(leftMemo.fuzzyVariants, rightMemo.fuzzyVariants, fuzzyThreshold);
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

  // --- Structural tier (capability-gated, LAST, strictly additive) ----------
  //
  // Runs only when explicitly enabled, only on pairs the lexical tiers did NOT
  // already emit, and only over BLOCKED pairs (nodes sharing an informative
  // neighbour) — so switching it on can add candidates but never alter, rescore
  // or remove an existing one. Every emitted candidate is `status: "candidate"`
  // with an `accept_match` PROPOSAL: nothing is merged, here or downstream.
  if (options.structural === true) {
    const structuralConfig: StructuralTierConfig = {
      ...DEFAULT_STRUCTURAL_TIER_CONFIG,
      ...(options.structuralConfig ?? {}),
    };
    const nodeById = new Map(comparableNodes.map(({ node }) => [node.id, node]));
    const index = buildStructuralIndex(context.relations, context.nodes);
    for (const [leftId, rightId] of structuralCandidatePairs(index, structuralConfig)) {
      const left = nodeById.get(leftId);
      const right = nodeById.get(rightId);
      if (!left || !right) continue;
      if (!left.type || left.type !== right.type) continue;
      // Containers are where the sibling trap is densest — same exclusion list
      // as the fuzzy tier.
      if (fuzzyExcludeTypes.has(String(left.type))) continue;
      if (violatesPartitionScope(context, left.type, left, right)) continue;

      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const pairKey = `${canonical.id}|${candidate.id}`;
      // Strictly additive: never restate a pair a lexical tier already emitted.
      if (emittedPairs.has(pairKey)) continue;

      const structural = structuralMatchNodes(left, right, index, structuralConfig);
      if (!structural.matched) continue;
      emittedPairs.add(pairKey);

      const basisNeighbours = structural.sharedNeighbours.slice(0, structuralConfig.maxBasisNeighbours);
      const overflow = structural.sharedNeighbours.length - basisNeighbours.length;
      const neighbourList = basisNeighbours
        .map((id) => nodeById.get(id)?.label ?? id)
        .join(", ") + (overflow > 0 ? `, +${overflow} more` : "");
      candidates.push({
        id: candidateId(canonical, candidate, [
          "structural",
          `j${structural.neighbourJaccard.toFixed(3)}`,
          ...basisNeighbours,
        ]),
        kind: "entity_match",
        status: "candidate",
        score: structural.score,
        tier: "structural",
        candidate_id: candidate.id,
        canonical_id: canonical.id,
        shared_terms: [],
        evidence_refs: uniqueSorted([
          ...(canonical.source_refs ?? []),
          ...(candidate.source_refs ?? []),
        ]),
        reasons: [
          `same node type: ${canonical.type}`,
          `structural match: ${structural.sharedNeighbours.length} shared informative neighbour(s), `
            + `neighbour Jaccard ${structural.neighbourJaccard.toFixed(2)}`,
          `shared neighbours: ${neighbourList}`,
          `relation-type profile Jaccard ${structural.relationProfileJaccard.toFixed(2)}`
            + (structural.sharedRelationTypes.length > 0
              ? ` (${structural.sharedRelationTypes.join(", ")})`
              : ""),
          structural.sharedProvenance.length > 0
            ? `shared provenance: ${structural.sharedProvenance.length} ref(s)`
            : "no shared provenance",
          "structural evidence only — no lexical agreement; human adjudication required",
        ],
        proposed_patch_operation: "accept_match",
        score_breakdown: {
          neighbour_jaccard: Number(structural.neighbourJaccard.toFixed(4)),
          shared_neighbours: structural.sharedNeighbours.length,
          relation_profile_jaccard: Number(structural.relationProfileJaccard.toFixed(4)),
          shared_provenance: structural.sharedProvenance.length,
        },
        structural_basis: {
          shared_neighbour_ids: basisNeighbours,
          shared_neighbour_count: structural.sharedNeighbours.length,
          shared_relation_types: structural.sharedRelationTypes,
          shared_provenance_refs: structural.sharedProvenance.slice(0, structuralConfig.maxBasisNeighbours),
        },
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

export function generateOntologyReconciliationCandidates(
  context: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions = {},
): OntologyReconciliationCandidateQueue {
  return generateOntologyReconciliationCandidatesWithBlockingIndex(context, options);
}

/**
 * Test-only seam for proving that the production generator consumes every
 * required entry in its real lexical inverted index. Not re-exported from the
 * package root.
 */
export function generateOntologyReconciliationCandidatesWithLexicalBlockingIndexForTest(
  context: OntologyPatchContext,
  options: GenerateOntologyReconciliationCandidatesOptions,
  blockingIndex: OntologyReconciliationLexicalBlockingIndex,
): OntologyReconciliationCandidateQueue {
  return generateOntologyReconciliationCandidatesWithBlockingIndex(context, options, blockingIndex);
}

export function writeOntologyReconciliationCandidates(
  outPath: string,
  queue: OntologyReconciliationCandidateQueue,
): void {
  const resolved = resolve(outPath);
  mkdirSync(dirname(resolved), { recursive: true });
  writeFileSync(resolved, JSON.stringify(queue, null, 2) + "\n", "utf-8");
}
