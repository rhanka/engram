import { canonicalizeJcs } from "./canonical-json.js";
import { receiptDigest } from "./digests.js";
import { applyPortOwnedRedaction } from "./engine.js";
import { isCanonicalCursor } from "./validation.js";
import type {
  AcceptedCandidateSnapshotV1,
  AcceptedLexicalDocumentV1,
  AuthorizationAllowedV1,
  Digest,
  MemoryEngineDependenciesV2,
  MemoryErrorCode,
  MemoryOperation,
  MemoryRecordV2,
  RankReceiptV1,
  RecallPacketV2,
  RecallRecordPacketV2,
  RecallRequestV2,
  Result,
  SemanticAdjacencyV1,
  ValidIntervalV1,
} from "./contracts/index.js";

/* --------------------------------------------------------------------------
 * Pinned profile identities and formula constants (SPEC §7 / D7).
 * ------------------------------------------------------------------------ */

export const OFFLINE_PROFILE = "offline_lexical_v1" as const;
export const SEMANTIC_PROFILE = "semantic_v1" as const;
export const PROFILE_VERSION = "1.0.0";
export const OFFLINE_FORMULA_REF = "graphify-memory:offline-lexical-recency:v1";
export const SEMANTIC_FORMULA_REF = "graphify-memory:semantic-rrf-recency:v1";
export const TOKENIZER_VERSION = "graphify-memory:tokenizer:v1";

const HALF_LIFE_MS = 2_592_000_000; // 30 days
const CANDIDATE_HARD_CAP = 2000;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const RRF_K = 60;
const MAX_LEXICAL_VARIANTS = 8;
const LEXICAL_WEIGHT = 0.85;
const RECENCY_WEIGHT = 0.15;
const CHANNEL_CAP = 2000;

const PPR_ALPHA = 0.85;
const PPR_LAZY = 0.6;
const PPR_TOLERANCE = 1e-6;
const PPR_MAX_ITERATIONS = 100;

const LEXICAL_FIELDS = ["primary", "decision", "evidence", "context", "citations"] as const;
type LexicalField = (typeof LEXICAL_FIELDS)[number];
const FIELD_WEIGHTS: Record<LexicalField, number> = {
  primary: 3.0,
  decision: 2.0,
  evidence: 1.5,
  context: 1.0,
  citations: 0.5,
};

/* --------------------------------------------------------------------------
 * Vendored pure lexical algorithms (SPEC §7: reuse the tokenizer/BM25/RRF pure
 * algorithms after adapting the accepted-record lexical DTO; the package stays
 * self-contained and never imports the projection-oriented query module).
 * ------------------------------------------------------------------------ */

/** Unicode-word tokenizer; drops pure-ASCII tokens of length <= 2. */
function tokenize(value: string | undefined | null): string[] {
  if (!value) return [];
  const out: string[] = [];
  for (const raw of value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []) {
    let englishOnly = true;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw.charCodeAt(i);
      if (ch < 0x61 || ch > 0x7a) { englishOnly = false; break; }
    }
    if (englishOnly && raw.length <= 2) continue;
    out.push(raw);
  }
  return out;
}

interface LexicalDoc {
  record_id: string;
  fields: Record<LexicalField, string[]>;
}

/** Adapt one accepted-record lexical DTO into tokenized fields. */
function adaptLexicalDocument(document: AcceptedLexicalDocumentV1): LexicalDoc {
  return {
    record_id: document.record_id,
    fields: {
      primary: tokenize(document.fields.primary),
      decision: tokenize(document.fields.decision),
      evidence: tokenize(document.fields.evidence),
      context: tokenize(document.fields.context),
      citations: tokenize(document.fields.citations),
    },
  };
}

function idf(n: number, df: number): number {
  return Math.max(0, Math.log(1 + (n - df + 0.5) / (df + 0.5)));
}

/** BM25F over the five weighted accepted-record fields; returns id -> score. */
function scoreBm25f(docs: LexicalDoc[], queryTokens: string[]): Map<string, number> {
  const n = docs.length;
  const scores = new Map<string, number>();
  if (n === 0 || queryTokens.length === 0) return scores;

  const avg: Record<LexicalField, number> = { primary: 0, decision: 0, evidence: 0, context: 0, citations: 0 };
  for (const field of LEXICAL_FIELDS) {
    let total = 0;
    for (const doc of docs) total += doc.fields[field].length;
    avg[field] = total / n;
  }
  // document frequency per distinct query term (a doc counts once if any field has it).
  const df = new Map<string, number>();
  const seenTerms = new Set(queryTokens);
  for (const term of seenTerms) {
    let count = 0;
    for (const doc of docs) {
      if (LEXICAL_FIELDS.some((field) => doc.fields[field].includes(term))) count += 1;
    }
    if (count > 0) df.set(term, count);
  }

  for (const doc of docs) {
    let score = 0;
    for (const term of seenTerms) {
      const documentFrequency = df.get(term);
      if (documentFrequency === undefined) continue;
      const termIdf = idf(n, documentFrequency);
      if (termIdf <= 0) continue;
      let fieldScore = 0;
      for (const field of LEXICAL_FIELDS) {
        const tf = doc.fields[field].filter((token) => token === term).length;
        if (tf === 0) continue;
        const avgdl = avg[field] || 1;
        const norm = 1 - BM25_B + BM25_B * (doc.fields[field].length / avgdl);
        const sat = (tf * (BM25_K1 + 1)) / (tf + BM25_K1 * norm);
        fieldScore += FIELD_WEIGHTS[field] * sat;
      }
      if (fieldScore > 0) score += termIdf * fieldScore;
    }
    if (score > 0) scores.set(doc.record_id, score);
  }
  return scores;
}

/** Deterministic ranked id list from a score map: score desc, id asc. */
function rankedList(scores: Map<string, number>): string[] {
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id]) => id);
}

/** RRF over N ranked lists (k=60); returns id -> fused score. */
function reciprocalRankFusion(lists: string[][]): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists) {
    for (let i = 0; i < list.length; i++) {
      const id = list[i]!;
      fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + (i + 1)));
    }
  }
  return fused;
}

/* Recency per D4 (valid-time only). */
function recencyAnchor(validTime: ValidIntervalV1, validAsOf: number): number {
  const anchor = validTime.t_end === undefined ? validAsOf : Math.min(validAsOf, validTime.t_end);
  const age = Math.max(0, validAsOf - anchor);
  return Math.exp((-Math.LN2 * age) / HALF_LIFE_MS);
}

/* --------------------------------------------------------------------------
 * Personalized PageRank over the induced eligibility subgraph.
 * ------------------------------------------------------------------------ */

function personalizedPageRank(
  nodePtr: number[],
  neighbours: number[],
  weights: number[],
  n: number,
  teleport: Map<number, number>,
): number[] {
  if (n === 0) return [];
  const p = new Float64Array(n);
  let teleportTotal = 0;
  for (const [node, mass] of teleport) {
    if (node >= 0 && node < n && Number.isFinite(mass) && mass > 0) { p[node]! += mass; teleportTotal += mass; }
  }
  if (teleportTotal <= 0) { for (let i = 0; i < n; i++) p[i] = 1 / n; }
  else { for (let i = 0; i < n; i++) p[i]! /= teleportTotal; }

  const outWeight = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = nodePtr[i]!; k < nodePtr[i + 1]!; k++) sum += weights[k]!;
    outWeight[i] = sum;
  }
  let r = new Float64Array(p);
  let next = new Float64Array(n);
  const spread = 1 - PPR_LAZY;
  let delta = Number.POSITIVE_INFINITY;
  for (let iteration = 0; iteration < PPR_MAX_ITERATIONS && delta > PPR_TOLERANCE; iteration++) {
    let dangling = 0;
    for (let i = 0; i < n; i++) if (outWeight[i] === 0) dangling += r[i]!;
    for (let i = 0; i < n; i++) next[i] = (1 - PPR_ALPHA) * p[i]! + PPR_ALPHA * dangling * p[i]!;
    for (let i = 0; i < n; i++) {
      const ow = outWeight[i]!;
      if (ow === 0) continue;
      next[i]! += PPR_ALPHA * PPR_LAZY * r[i]!;
      const share = (PPR_ALPHA * spread * r[i]!) / ow;
      for (let k = nodePtr[i]!; k < nodePtr[i + 1]!; k++) next[neighbours[k]!]! += share * weights[k]!;
    }
    delta = 0;
    for (let i = 0; i < n; i++) delta += Math.abs(next[i]! - r[i]!);
    const tmp = r; r = next; next = tmp;
  }
  return Array.from(r);
}

/* --------------------------------------------------------------------------
 * Recall executor.
 * ------------------------------------------------------------------------ */

function fail<T>(operation: MemoryOperation, code: MemoryErrorCode, message: string, retryable = false): Result<T> {
  return { ok: false, error: { code, operation, message, retryable } };
}

type SelectedProfile = typeof OFFLINE_PROFILE | typeof SEMANTIC_PROFILE;

interface PagePins {
  profile: SelectedProfile;
  valid_as_of: number;
  system_as_of: string;
  offset: number;
  ordered_ids_digest: Digest;
}

function encodePageCursor(pins: PagePins): string {
  return Buffer.from(canonicalizeJcs(pins as unknown as Record<string, unknown>), "utf8").toString("base64url");
}

function decodePageCursor(cursor: string): PagePins | undefined {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as PagePins;
    if ((decoded.profile !== OFFLINE_PROFILE && decoded.profile !== SEMANTIC_PROFILE)
      || typeof decoded.valid_as_of !== "number" || !Number.isSafeInteger(decoded.valid_as_of)
      || !isCanonicalCursor(decoded.system_as_of) || !Number.isSafeInteger(decoded.offset) || decoded.offset < 0
      || typeof decoded.ordered_ids_digest !== "string") return undefined;
    return decoded;
  } catch {
    return undefined;
  }
}

interface OrderedRanking {
  ordered: string[];                 // post-revalidation eligible ids, final order
  scoreById: Map<string, number>;
  candidateCount: number;
  candidateIdsDigest: Digest;
  orderedIdsDigest: Digest;
  snapshot: AcceptedCandidateSnapshotV1;
  revalidationReceiptDigest: Digest;
  profileConfigDigest: Digest;
  scoringFormulaRef: string;
  projectionReceiptDigests: Digest[];
}

interface ExecuteRecallInput {
  request: RecallRequestV2;
  authorization: AuthorizationAllowedV1;
  now: string;
}

/** Selects a single profile before reading candidates; never mixes or falls back. */
function selectProfile(dependencies: MemoryEngineDependenciesV2, request: RecallRequestV2): Result<SelectedProfile> {
  const semanticAvailable = dependencies.semantic_projection !== undefined && dependencies.vector_projection !== undefined;
  if (request.capability_policy.minimum_channels === "lexical_and_semantic") {
    return semanticAvailable
      ? { ok: true, value: SEMANTIC_PROFILE }
      : fail("recall_current", "RANKING_UNAVAILABLE", "the semantic channel is required but unavailable; no raw lexical fallback is permitted");
  }
  return { ok: true, value: semanticAvailable ? SEMANTIC_PROFILE : OFFLINE_PROFILE };
}

function offlineConfigDigest(): Digest {
  return receiptDigest("recall-profile-config", {
    profile: OFFLINE_PROFILE,
    tokenizer_version: TOKENIZER_VERSION,
    bm25: { k1: BM25_K1, b: BM25_B },
    field_weights: FIELD_WEIGHTS,
    rrf_k: RRF_K,
    max_lexical_variants: MAX_LEXICAL_VARIANTS,
    half_life_ms: HALF_LIFE_MS,
    weights: { lexical: LEXICAL_WEIGHT, recency: RECENCY_WEIGHT },
  }, "profile_config_digest");
}

function semanticConfigDigest(adjacency: SemanticAdjacencyV1, modelRef: string, vectorCursor: string): Digest {
  return receiptDigest("recall-profile-config", {
    profile: SEMANTIC_PROFILE,
    tokenizer_version: TOKENIZER_VERSION,
    bm25: { k1: BM25_K1, b: BM25_B },
    field_weights: FIELD_WEIGHTS,
    rrf_k: RRF_K,
    max_lexical_variants: MAX_LEXICAL_VARIANTS,
    half_life_ms: HALF_LIFE_MS,
    weights: { lexical: LEXICAL_WEIGHT, recency: RECENCY_WEIGHT },
    ppr: { alpha: PPR_ALPHA, lazy: PPR_LAZY, tolerance: PPR_TOLERANCE, max_iterations: PPR_MAX_ITERATIONS },
    vector_model_ref: modelRef,
    channels: { lexical: true, induced_ppr: true, vector: true },
    projection_cursors: { adjacency: adjacency.projection_cursor, vector: vectorCursor },
  }, "profile_config_digest");
}

async function computeRanking(
  dependencies: MemoryEngineDependenciesV2,
  input: { profile: SelectedProfile; request: RecallRequestV2; authorization: AuthorizationAllowedV1; valid_as_of: number; system_as_of: string; now: string },
): Promise<Result<OrderedRanking>> {
  const { profile, request, authorization, valid_as_of, system_as_of } = input;
  const candidateCap = Math.min(request.budgets.max_candidates, CANDIDATE_HARD_CAP);

  const snapshotResult = await dependencies.canonical_store.acceptedSnapshot({
    valid_as_of,
    system_as_of,
    authorization_receipt_digest: authorization.receipt_digest,
    max_candidates: candidateCap,
  });
  if (!snapshotResult.ok) return { ok: false, error: { ...snapshotResult.error, operation: "recall_current" } };
  const snapshot = snapshotResult.value;
  const docs = snapshot.documents.map(adaptLexicalDocument);
  const validTimeById = new Map(snapshot.documents.map((document) => [document.record_id, document.valid_time] as const));

  const queryTokens = tokenize(request.query);
  const lexicalScores = scoreBm25f(docs, queryTokens);
  const lexicalRanked = rankedList(lexicalScores).slice(0, CHANNEL_CAP);

  const projectionReceiptDigests: Digest[] = [];
  let fusedScore: Map<string, number>;
  let scoringFormulaRef: string;
  let profileConfigDigest: Digest;

  if (profile === OFFLINE_PROFILE) {
    // Single engine-generated lexical variant → RRF identity over the lexical list.
    fusedScore = reciprocalRankFusion([lexicalRanked]);
    scoringFormulaRef = OFFLINE_FORMULA_REF;
    profileConfigDigest = offlineConfigDigest();
  } else {
    const semantic = dependencies.semantic_projection!;
    const vector = dependencies.vector_projection!;
    const eligibleIds = snapshot.documents.map((document) => document.record_id);
    const adjacencyResult = await semantic.inducedAdjacency({ eligible_record_ids: eligibleIds, system_as_of });
    if (!adjacencyResult.ok) return { ok: false, error: { ...adjacencyResult.error, operation: "recall_current" } };
    const adjacency = adjacencyResult.value;
    projectionReceiptDigests.push(adjacency.adjacency_digest);

    // Induced eligibility subgraph: only ids the adjacency carries participate.
    const indexById = new Map(adjacency.record_ids.map((id, index) => [id, index] as const));
    const n = adjacency.record_ids.length;
    const teleport = new Map<number, number>();
    for (const [id, score] of lexicalScores) {
      const index = indexById.get(id);
      if (index !== undefined) teleport.set(index, score);
    }
    const pprScores = personalizedPageRank([...adjacency.offsets], [...adjacency.neighbours], [...adjacency.weights], n, teleport);
    const pprRanked = rankedList(new Map(adjacency.record_ids.map((id, index) => [id, pprScores[index] ?? 0] as const)
      .filter(([, score]) => score > 0))).slice(0, CHANNEL_CAP);

    const vectorResult = await vector.query({ snapshot_id: snapshot.snapshot_id, eligible_record_ids: eligibleIds, query_text: request.query, limit: CHANNEL_CAP });
    if (!vectorResult.ok) return { ok: false, error: { ...vectorResult.error, operation: "recall_current" } };
    projectionReceiptDigests.push(vectorResult.value.receipt_digest);
    // Vector allowlist: keep only eligible ids.
    const eligibleSet = new Set(eligibleIds);
    const vectorRanked = [...vectorResult.value.matches]
      .filter((match) => eligibleSet.has(match.record_id))
      .sort((a, b) => b.score - a.score || (a.record_id < b.record_id ? -1 : 1))
      .map((match) => match.record_id).slice(0, CHANNEL_CAP);

    fusedScore = reciprocalRankFusion([lexicalRanked, pprRanked, vectorRanked]);
    scoringFormulaRef = SEMANTIC_FORMULA_REF;
    profileConfigDigest = semanticConfigDigest(adjacency, vectorResult.value.model_ref, vectorResult.value.projection_cursor);
  }

  // Normalize fused → lexical_i, combine with recency, deterministic tie-break.
  const maxFused = Math.max(0, ...fusedScore.values());
  const combined: Array<{ id: string; score: number; recency: number }> = [];
  for (const [id, fused] of fusedScore) {
    const lexical = maxFused > 0 ? fused / maxFused : 0;
    const validTime = validTimeById.get(id);
    if (validTime === undefined) continue; // only accepted snapshot ids are candidates
    const recency = recencyAnchor(validTime, valid_as_of);
    combined.push({ id, score: LEXICAL_WEIGHT * lexical + RECENCY_WEIGHT * recency, recency });
  }
  combined.sort((a, b) => b.score - a.score || b.recency - a.recency || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const ranked = combined.slice(0, candidateCap);
  const candidateIds = ranked.map((entry) => entry.id);
  const candidateIdsDigest = receiptDigest("recall-candidates", { candidate_ids: candidateIds }, "candidate_ids_digest");

  // Mandatory final revalidation against canonical state (SPEC §5.7 / §7).
  const revalidation = await dependencies.canonical_store.revalidate({
    record_ids: candidateIds,
    valid_as_of,
    system_as_of,
    authorization_receipt_digest: authorization.receipt_digest,
    operation: "recall_current",
  });
  if (!revalidation.ok) return { ok: false, error: { ...revalidation.error, operation: "recall_current" } };
  const eligible = new Set(revalidation.value.eligible_record_ids);
  const ordered = candidateIds.filter((id) => eligible.has(id));
  const scoreById = new Map(ranked.map((entry) => [entry.id, entry.score] as const));

  return {
    ok: true,
    value: {
      ordered,
      scoreById,
      candidateCount: candidateIds.length,
      candidateIdsDigest,
      orderedIdsDigest: receiptDigest("recall-ordered", { ordered_ids: ordered }, "ordered_ids_digest"),
      snapshot,
      revalidationReceiptDigest: revalidation.value.receipt_digest,
      profileConfigDigest,
      scoringFormulaRef,
      projectionReceiptDigests,
    },
  };
}

function requestDigest(request: RecallRequestV2, profile: SelectedProfile, valid_as_of: number, system_as_of: string): Digest {
  return receiptDigest("recall-request", {
    query: request.query,
    purpose_ref: request.purpose_ref,
    profile,
    valid_as_of,
    system_as_of,
    capability_policy: request.capability_policy,
    budgets: { max_candidates: request.budgets.max_candidates, max_results: request.budgets.max_results, max_packet_bytes: request.budgets.max_packet_bytes },
  }, "request_digest");
}

/** Full accepted-only recall: pin dual-as-of + profile, rank, revalidate, redact, page. */
export async function executeRecall(dependencies: MemoryEngineDependenciesV2, input: ExecuteRecallInput): Promise<Result<RecallPacketV2>> {
  const { request, authorization, now } = input;

  // Pin the dual-as-of pair once, or reuse a page's pinned pair.
  let pins: Pick<PagePins, "profile" | "valid_as_of" | "system_as_of"> | undefined;
  let offset = 0;
  let expectedOrderedDigest: Digest | undefined;
  if (request.page?.cursor !== undefined) {
    const decoded = decodePageCursor(request.page.cursor);
    if (decoded === undefined) return fail("recall_current", "STALE_PAGE", "page cursor is malformed");
    if ((request.as_of?.system_cursor !== undefined && request.as_of.system_cursor !== decoded.system_as_of)
      || (request.as_of?.valid_time !== undefined && request.as_of.valid_time !== decoded.valid_as_of)) {
      return fail("recall_current", "STALE_PAGE", "page request does not reuse the pinned dual-as-of pair");
    }
    pins = { profile: decoded.profile, valid_as_of: decoded.valid_as_of, system_as_of: decoded.system_as_of };
    offset = decoded.offset;
    expectedOrderedDigest = decoded.ordered_ids_digest;
  } else {
    const selected = selectProfile(dependencies, request);
    if (!selected.ok) return selected;
    let systemAsOf = request.as_of?.system_cursor;
    if (systemAsOf === undefined) {
      const readiness = await dependencies.canonical_store.readiness();
      if (!readiness.ok) return { ok: false, error: { ...readiness.error, operation: "recall_current" } };
      systemAsOf = readiness.value.high_water_cursor;
    }
    if (!isCanonicalCursor(systemAsOf)) return fail("recall_current", "STALE_PAGE", "system cursor is not canonical");
    const validAsOf = request.as_of?.valid_time ?? Date.parse(now);
    if (!Number.isSafeInteger(validAsOf)) return fail("recall_current", "INVALID_SCHEMA", "valid_as_of is not a safe integer");
    pins = { profile: selected.value, valid_as_of: validAsOf, system_as_of: systemAsOf };
  }

  const ranking = await computeRanking(dependencies, { profile: pins.profile, request, authorization, valid_as_of: pins.valid_as_of, system_as_of: pins.system_as_of, now });
  if (!ranking.ok) return ranking;
  if (expectedOrderedDigest !== undefined && ranking.value.orderedIdsDigest !== expectedOrderedDigest) {
    return fail("recall_current", "STALE_PAGE", "canonical state advanced under an active pagination pin");
  }

  const pageSize = request.page?.size ?? Math.min(request.budgets.max_results, 50);
  const pageIds = ranking.value.ordered.slice(offset, offset + pageSize);

  const records: RecallRecordPacketV2[] = [];
  let usedBytes = 0;
  let materialised = 0;
  for (const id of pageIds) {
    const read = await dependencies.canonical_store.readRecord({
      record_id: id,
      system_as_of: pins.system_as_of,
      authorization_receipt_digest: authorization.receipt_digest,
    });
    if (!read.ok) continue; // a record that vanished under revalidation is dropped, never back-filled unvalidated
    const redacted = applyPortOwnedRedaction(read.value as unknown as import("./contracts/index.js").CandidatePayloadV2, authorization.redaction);
    if (!redacted.ok) return { ok: false, error: { ...redacted.error, operation: "recall_current" } };
    const redactedRecord = redacted.value as MemoryRecordV2;
    const redactedFields = Object.keys(read.value)
      .filter((key) => !Object.hasOwn(redactedRecord as unknown as Record<string, unknown>, key))
      .map((key) => `/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`)
      .sort();
    const packetRecord: RecallRecordPacketV2 = {
      record: redactedRecord,
      redacted_fields: redactedFields,
      redaction_receipt_digest: receiptDigest("recall-redaction", {
        record_id: id,
        source_record_digest: read.value.record_digest,
        policy_version: authorization.policy_version,
        redacted_fields: redactedFields,
      }, "redaction_receipt_digest"),
      score: ranking.value.scoreById.get(id) ?? 0,
      rank: offset + materialised + 1,
    };
    const projected = usedBytes + new TextEncoder().encode(canonicalizeJcs(packetRecord as unknown as Record<string, unknown>)).byteLength;
    if (projected > request.budgets.max_packet_bytes) break; // bounded packet byte budget
    usedBytes = projected;
    materialised += 1;
    records.push(packetRecord);
  }

  const nextOffset = offset + materialised;
  const hasMore = nextOffset < ranking.value.ordered.length;
  const nextPageCursor = hasMore
    ? encodePageCursor({ profile: pins.profile, valid_as_of: pins.valid_as_of, system_as_of: pins.system_as_of, offset: nextOffset, ordered_ids_digest: ranking.value.orderedIdsDigest })
    : undefined;

  const rankReceiptBody = {
    request_digest: requestDigest(request, pins.profile, pins.valid_as_of, pins.system_as_of),
    authorization_receipt_digest: authorization.receipt_digest,
    profile: pins.profile,
    profile_version: PROFILE_VERSION,
    profile_config_digest: ranking.value.profileConfigDigest,
    valid_as_of: pins.valid_as_of,
    system_as_of: pins.system_as_of,
    snapshot_id: ranking.value.snapshot.snapshot_id,
    snapshot_digest: ranking.value.snapshot.snapshot_digest,
    candidate_count: ranking.value.candidateCount,
    candidate_ids_digest: ranking.value.candidateIdsDigest,
    scoring_formula_ref: ranking.value.scoringFormulaRef,
    ordered_ids_digest: ranking.value.orderedIdsDigest,
    revalidation_receipt_digest: ranking.value.revalidationReceiptDigest,
    projection_receipt_digests: ranking.value.projectionReceiptDigests,
    issued_at: now,
  };
  const rankReceipt: RankReceiptV1 = { ...rankReceiptBody, receipt_digest: receiptDigest("rank-receipt", rankReceiptBody) };

  const packetBody = { records, rank_receipt: rankReceipt, ...(nextPageCursor !== undefined ? { next_page_cursor: nextPageCursor } : {}) };
  return { ok: true, value: { ...packetBody, packet_digest: receiptDigest("recall-packet", packetBody as unknown as Record<string, unknown>, "packet_digest") } };
}
