import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { compileNormalizerByNodeType } from "./entity-normalizer.js";
import type { EntityNormalizer, NormalizerByNodeType } from "./entity-normalizer.js";
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
  canonical: OntologyPatchNode,
  candidate: OntologyPatchNode,
  normalizer: EntityNormalizer | undefined,
): number {
  const normalize = normalizer ?? normalizeTerm;
  const canonicalLabel = canonical.label ? normalize(canonical.label) : null;
  const candidateLabel = candidate.label ? normalize(candidate.label) : null;
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
  const normalizers = compileNormalizerByNodeType(context.profile);

  const candidates: OntologyReconciliationCandidate[] = [];
  const emittedPairs = new Set<string>();
  const comparableNodes = context.nodes
    // Keep the fuzzy tier's legacy admission/tokenization independent from N.
    .filter((node) => node.type && nodeTerms(node).length > 0)
    .sort((a, b) => a.id.localeCompare(b.id));

  for (let i = 0; i < comparableNodes.length; i += 1) {
    for (let j = i + 1; j < comparableNodes.length; j += 1) {
      const left = comparableNodes[i]!;
      const right = comparableNodes[j]!;
      // Type-guard applies AFTER schema hygiene has canonicalized types.
      if (!left.type || left.type !== right.type) continue;

      // Partitioned registries scope both reconciliation tiers. This guard is
      // deliberately before sharedTerms so a cross-partition label can never
      // become a score-1.0 exact candidate.
      if (violatesPartitionScope(context, left.type, left, right)) continue;

      const leftTerms = new Set(exactNodeTerms(left, normalizers));
      const sharedTerms = exactNodeTerms(right, normalizers).filter((term) => leftTerms.has(term));

      const { canonical, candidate } = chooseCanonicalPair(left, right);
      const pairKey = `${canonical.id}|${candidate.id}`;
      const evidenceRefs = uniqueSorted([
        ...(canonical.source_refs ?? []),
        ...(candidate.source_refs ?? []),
      ]);

      // Precision guards reject confidently-different entities in BOTH tiers
      // (role-noun collisions, opposite-gender/relational pairs, place
      // containment with a new head-noun, address/serial divergence).
      const rejectReason = differentEntityReason(left, right);

      if (sharedTerms.length > 0) {
        if (rejectReason) continue;
        // Exact tier: shared normalized term (label/alias/normalized_term).
        emittedPairs.add(pairKey);
        candidates.push({
          id: candidateId(canonical, candidate, sharedTerms),
          kind: "entity_match",
          status: "candidate",
          score: candidateScore(sharedTerms, canonical, candidate, normalizers[left.type]),
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
