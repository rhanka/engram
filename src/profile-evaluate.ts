/**
 * L5 — `graphify profile evaluate`.
 *
 * Deterministic, $0 (no LLM) measurement of a `graphify link` run against a
 * hand-labelled gold set expressed in the SAME occurrence schema as L1
 * (`TypedEntityOccurrenceV1`). It crosses the two sets by exact span identity
 * and emits precision/recall metrics plus a CI gate.
 *
 * The runner is intentionally profile-agnostic: `profile_hash` and
 * `normalizer_hashes` are stamped by the caller when a profile is available,
 * so a generic registry-bound fixture evaluates with zero domain code (no
 * zoning, no event/stage-3 semantics — see the reconciled build spec §10).
 *
 * Coordinate system: offsets are 0-based, half-open, UTF-16 code units in the
 * RAW source file, identical to L1/L4a. Matching is exact span equality on
 * `(source_file, node_type, start, end)` — no fuzzy overlap.
 */
import { createHash } from "node:crypto";

import type { TypedEntityOccurrenceV1 } from "./types.js";

export const TYPED_LINKING_GOLD_SCHEMA = "graphify_typed_linking_gold_v1" as const;
export const TYPED_LINKING_EVALUATION_SCHEMA = "graphify_typed_linking_evaluation_v1" as const;

/** Field separator for span/identity keys — a code unit that never occurs in a value. */
const KEY_SEP = String.fromCharCode(31);

/** Optional per-document strata carried by the gold envelope. */
export interface GoldDocumentStrata {
  layout?: string;
  ocr_quality?: string;
  spelling_family?: string;
}

export interface GoldDocumentMeta {
  strata?: GoldDocumentStrata;
}

/** Versioned gold envelope. Annotations reuse the L1 occurrence contract exactly. */
export interface TypedLinkingGoldV1 {
  schema: typeof TYPED_LINKING_GOLD_SCHEMA;
  occurrences: TypedEntityOccurrenceV1[];
  documents?: Record<string, GoldDocumentMeta>;
}

export interface EvaluationGateConfig {
  floors?: Record<string, number>;
  ceilings?: Record<string, number>;
}

/**
 * A metric block. `resolution_precision` and `unresolved_rate` are always
 * emitted together — reporting precision alone is a structural lie (a resolver
 * that links nothing would otherwise score 1.0). `resolution_precision` is
 * `null` (never `1.0`) when the scope links nothing.
 */
export interface MetricBlock {
  gold_spans: number;
  gold_spans_matched: number;
  mention_recall: number | null;
  set_recall: number | null;
  resolution_precision: number | null;
  unresolved_rate: number | null;
  unlinked_rate: number | null;
  ambiguous_rate: number | null;
  linked_count: number;
  run_linked: number;
  run_total: number;
  documents_scored: number;
}

export interface FloorEvaluation {
  metric: string;
  kind: "floor" | "ceiling";
  threshold: number;
  value: number | null;
  pass: boolean;
}

export interface EvaluationResult {
  schema: typeof TYPED_LINKING_EVALUATION_SCHEMA;
  profile_hash: string | null;
  normalizer_hashes: Record<string, string>;
  run_hash: string;
  gold_hash: string;
  metrics: {
    overall: MetricBlock;
    per_document: Record<string, MetricBlock>;
    per_strata: Record<string, MetricBlock>;
  };
  floors_evaluated: FloorEvaluation[];
  gate: "pass" | "fail";
}

export interface EvaluateOccurrencesInput {
  run: TypedEntityOccurrenceV1[];
  gold: TypedLinkingGoldV1;
  floors?: Record<string, number>;
  ceilings?: Record<string, number>;
  profileHash?: string | null;
  normalizerHashes?: Record<string, string>;
  /**
   * Optional corpus resolver used to detect a stale gold: given a gold
   * occurrence, return the verbatim slice of the referenced source, or `null`
   * when the corpus is unavailable (the check is then skipped, per spec).
   */
  corpusSlice?: (occurrence: TypedEntityOccurrenceV1) => string | null;
}

/** Thrown for structural gold/run problems — the gate cannot even be computed. */
export class GoldValidationError extends Error {
  readonly code: string;
  constructor(code: string, detail: string) {
    // Fold the code into the message so callers (and test matchers) see it.
    super(`${code}: ${detail}`);
    this.name = "GoldValidationError";
    this.code = code;
  }
}

const RESOLUTIONS: ReadonlySet<string> = new Set(["linked", "unlinked", "ambiguous"]);

function spanKey(occurrence: TypedEntityOccurrenceV1): string {
  return [occurrence.source_file, occurrence.node_type, occurrence.offsets.start, occurrence.offsets.end].join(KEY_SEP);
}

function linkedIdentity(occurrence: TypedEntityOccurrenceV1): string {
  return [occurrence.node_type, occurrence.registry_partition ?? "", occurrence.registry_record_id ?? ""].join(KEY_SEP);
}

function assertOccurrenceShape(occurrence: unknown, where: string): asserts occurrence is TypedEntityOccurrenceV1 {
  if (typeof occurrence !== "object" || occurrence === null) {
    throw new GoldValidationError("OCCURRENCE_NOT_OBJECT", `${where}: occurrence is not an object`);
  }
  const value = occurrence as Record<string, unknown>;
  if (typeof value.source_file !== "string" || value.source_file.length === 0) {
    throw new GoldValidationError("OCCURRENCE_MISSING_SOURCE", `${where}: occurrence.source_file must be a non-empty string`);
  }
  if (typeof value.node_type !== "string" || value.node_type.length === 0) {
    throw new GoldValidationError("OCCURRENCE_MISSING_NODE_TYPE", `${where}: occurrence.node_type must be a non-empty string`);
  }
  const offsets = value.offsets as Record<string, unknown> | undefined;
  if (!offsets || typeof offsets.start !== "number" || typeof offsets.end !== "number" || !(offsets.start < offsets.end)) {
    throw new GoldValidationError("OCCURRENCE_BAD_OFFSETS", `${where}: occurrence.offsets must be { start < end }`);
  }
  if (typeof value.resolution !== "string" || !RESOLUTIONS.has(value.resolution)) {
    throw new GoldValidationError("OCCURRENCE_BAD_RESOLUTION", `${where}: occurrence.resolution must be linked|unlinked|ambiguous`);
  }
  if (value.resolution === "linked" && (typeof value.registry_record_id !== "string" || value.registry_record_id.length === 0)) {
    throw new GoldValidationError("OCCURRENCE_LINKED_NO_RECORD", `${where}: linked occurrence must carry registry_record_id`);
  }
  if (value.resolution !== "linked" && typeof value.registry_record_id === "string") {
    throw new GoldValidationError("OCCURRENCE_UNLINKED_HAS_RECORD", `${where}: unlinked|ambiguous occurrence must not carry registry_record_id`);
  }
}

/** Validate + parse an unknown gold document into a typed envelope, or throw. */
export function parseGold(raw: unknown): TypedLinkingGoldV1 {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new GoldValidationError("GOLD_NOT_ENVELOPE", "gold must be a versioned object envelope, not a bare array");
  }
  const value = raw as Record<string, unknown>;
  if (value.schema !== TYPED_LINKING_GOLD_SCHEMA) {
    throw new GoldValidationError("GOLD_BAD_SCHEMA", `gold.schema must be "${TYPED_LINKING_GOLD_SCHEMA}"`);
  }
  if (!Array.isArray(value.occurrences)) {
    throw new GoldValidationError("GOLD_OCCURRENCES_NOT_ARRAY", "gold.occurrences must be an array");
  }
  const seen = new Set<string>();
  for (const [index, occurrence] of value.occurrences.entries()) {
    assertOccurrenceShape(occurrence, `gold.occurrences[${index}]`);
    const key = spanKey(occurrence);
    if (seen.has(key)) {
      throw new GoldValidationError("GOLD_DUPLICATE_SPAN", `gold has duplicate span ${JSON.stringify(key)} — 1-to-1 matching requires unique spans`);
    }
    seen.add(key);
  }
  let documents: Record<string, GoldDocumentMeta> | undefined;
  if (value.documents !== undefined) {
    if (typeof value.documents !== "object" || value.documents === null || Array.isArray(value.documents)) {
      throw new GoldValidationError("GOLD_DOCUMENTS_NOT_MAP", "gold.documents must be a map keyed by source_file");
    }
    documents = value.documents as Record<string, GoldDocumentMeta>;
  }
  return {
    schema: TYPED_LINKING_GOLD_SCHEMA,
    occurrences: value.occurrences as TypedEntityOccurrenceV1[],
    ...(documents ? { documents } : {}),
  };
}

function validateRun(run: unknown): TypedEntityOccurrenceV1[] {
  if (!Array.isArray(run)) {
    throw new GoldValidationError("RUN_NOT_ARRAY", "run occurrences.json must be a JSON array");
  }
  const seen = new Set<string>();
  for (const [index, occurrence] of run.entries()) {
    assertOccurrenceShape(occurrence, `run[${index}]`);
    const key = spanKey(occurrence);
    if (seen.has(key)) {
      throw new GoldValidationError("RUN_DUPLICATE_SPAN", `run has duplicate span ${JSON.stringify(key)} — 1-to-1 matching requires unique spans`);
    }
    seen.add(key);
  }
  return run as TypedEntityOccurrenceV1[];
}

/** Deterministic key-sorted serialization for order-stable hashing. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function hashOccurrences(occurrences: TypedEntityOccurrenceV1[]): string {
  const sorted = [...occurrences].sort((a, b) => spanKey(a).localeCompare(spanKey(b)));
  return createHash("sha256").update(stableStringify(sorted)).digest("hex");
}

function hashGold(gold: TypedLinkingGoldV1): string {
  const canonical = {
    schema: gold.schema,
    occurrences: [...gold.occurrences].sort((a, b) => spanKey(a).localeCompare(spanKey(b))),
    ...(gold.documents ? { documents: gold.documents } : {}),
  };
  return createHash("sha256").update(stableStringify(canonical)).digest("hex");
}

function entitySet(occurrences: TypedEntityOccurrenceV1[]): Set<string> {
  const set = new Set<string>();
  for (const occurrence of occurrences) {
    // `ambiguous` never counts as resolved — only true links join the set.
    if (occurrence.resolution === "linked" && occurrence.registry_record_id) set.add(linkedIdentity(occurrence));
  }
  return set;
}

function computeBlock(
  files: ReadonlySet<string>,
  goldOccurrences: TypedEntityOccurrenceV1[],
  runOccurrences: TypedEntityOccurrenceV1[],
  runIndex: Map<string, TypedEntityOccurrenceV1>,
  goldIndex: Map<string, TypedEntityOccurrenceV1>,
): MetricBlock {
  const goldOccs = goldOccurrences.filter((occurrence) => files.has(occurrence.source_file));
  const runOccs = runOccurrences.filter((occurrence) => files.has(occurrence.source_file));

  let matched = 0;
  for (const gold of goldOccs) if (runIndex.has(spanKey(gold))) matched += 1;

  let runLinked = 0;
  let unlinked = 0;
  let ambiguous = 0;
  let correct = 0;
  for (const run of runOccs) {
    if (run.resolution === "linked") {
      runLinked += 1;
      const gold = goldIndex.get(spanKey(run));
      if (
        gold
        && gold.resolution === "linked"
        && (gold.registry_partition ?? null) === (run.registry_partition ?? null)
        && gold.registry_record_id === run.registry_record_id
      ) {
        correct += 1;
      }
    } else if (run.resolution === "unlinked") {
      unlinked += 1;
    } else {
      ambiguous += 1;
    }
  }

  // set_recall = macro average over documents whose gold entity set is non-empty.
  let setRecallSum = 0;
  let setRecallDocs = 0;
  for (const file of [...files].sort()) {
    const goldSet = entitySet(goldOccs.filter((occurrence) => occurrence.source_file === file));
    if (goldSet.size === 0) continue;
    const runSet = entitySet(runOccs.filter((occurrence) => occurrence.source_file === file));
    let intersection = 0;
    for (const identity of goldSet) if (runSet.has(identity)) intersection += 1;
    setRecallSum += intersection / goldSet.size;
    setRecallDocs += 1;
  }

  const goldSpans = goldOccs.length;
  const runTotal = runOccs.length;
  return {
    gold_spans: goldSpans,
    gold_spans_matched: matched,
    mention_recall: goldSpans === 0 ? null : matched / goldSpans,
    set_recall: setRecallDocs === 0 ? null : setRecallSum / setRecallDocs,
    resolution_precision: runLinked === 0 ? null : correct / runLinked,
    unresolved_rate: runTotal === 0 ? null : (unlinked + ambiguous) / runTotal,
    unlinked_rate: runTotal === 0 ? null : unlinked / runTotal,
    ambiguous_rate: runTotal === 0 ? null : ambiguous / runTotal,
    linked_count: runLinked,
    run_linked: runLinked,
    run_total: runTotal,
    documents_scored: setRecallDocs,
  };
}

function readMetric(block: MetricBlock, metric: string): number | null {
  if (Object.prototype.hasOwnProperty.call(block, metric)) {
    const value = (block as unknown as Record<string, number | null>)[metric];
    return typeof value === "number" || value === null ? value : null;
  }
  return null;
}

function evaluateGate(overall: MetricBlock, floors: Record<string, number>, ceilings: Record<string, number>): {
  floors_evaluated: FloorEvaluation[];
  gate: "pass" | "fail";
} {
  const floors_evaluated: FloorEvaluation[] = [];
  for (const metric of Object.keys(floors).sort()) {
    const threshold = floors[metric] ?? 0;
    const value = readMetric(overall, metric);
    // A null metric (e.g. resolution_precision when nothing is linked) fails any
    // positive floor — a resolver that links nothing must never look perfect.
    const pass = value === null ? threshold <= 0 : value >= threshold;
    floors_evaluated.push({ metric, kind: "floor", threshold, value, pass });
  }
  for (const metric of Object.keys(ceilings).sort()) {
    const threshold = ceilings[metric] ?? 0;
    const value = readMetric(overall, metric);
    // A null ceiling value is vacuously within bounds (nothing exceeded it).
    const pass = value === null ? true : value <= threshold;
    floors_evaluated.push({ metric, kind: "ceiling", threshold, value, pass });
  }
  const gate = floors_evaluated.every((floor) => floor.pass) ? "pass" : "fail";
  return { floors_evaluated, gate };
}

export function evaluateOccurrences(input: EvaluateOccurrencesInput): EvaluationResult {
  const run = validateRun(input.run);
  const gold = input.gold;

  if (input.corpusSlice) {
    for (const [index, occurrence] of gold.occurrences.entries()) {
      const slice = input.corpusSlice(occurrence);
      if (slice !== null && slice !== occurrence.raw_span) {
        throw new GoldValidationError(
          "GOLD_STALE_SPAN",
          `gold.occurrences[${index}] raw_span ${JSON.stringify(occurrence.raw_span)} does not match corpus slice ${JSON.stringify(slice)} — gold is stale`,
        );
      }
    }
  }

  const runIndex = new Map<string, TypedEntityOccurrenceV1>();
  for (const occurrence of run) runIndex.set(spanKey(occurrence), occurrence);
  const goldIndex = new Map<string, TypedEntityOccurrenceV1>();
  for (const occurrence of gold.occurrences) goldIndex.set(spanKey(occurrence), occurrence);

  const allFiles = new Set<string>();
  for (const occurrence of gold.occurrences) allFiles.add(occurrence.source_file);
  for (const occurrence of run) allFiles.add(occurrence.source_file);

  const overall = computeBlock(allFiles, gold.occurrences, run, runIndex, goldIndex);

  const per_document: Record<string, MetricBlock> = {};
  for (const file of [...allFiles].sort()) {
    per_document[file] = computeBlock(new Set([file]), gold.occurrences, run, runIndex, goldIndex);
  }

  const per_strata: Record<string, MetricBlock> = {};
  const strataFiles = new Map<string, Set<string>>();
  for (const [file, meta] of Object.entries(gold.documents ?? {})) {
    const strata = meta?.strata;
    if (!strata) continue;
    for (const dimension of ["layout", "ocr_quality", "spelling_family"] as const) {
      const value = strata[dimension];
      if (typeof value !== "string" || value.length === 0) continue;
      const key = `${dimension}=${value}`;
      const bucket = strataFiles.get(key) ?? new Set<string>();
      bucket.add(file);
      strataFiles.set(key, bucket);
    }
  }
  for (const key of [...strataFiles.keys()].sort()) {
    per_strata[key] = computeBlock(strataFiles.get(key)!, gold.occurrences, run, runIndex, goldIndex);
  }

  const { floors_evaluated, gate } = evaluateGate(overall, input.floors ?? {}, input.ceilings ?? {});

  return {
    schema: TYPED_LINKING_EVALUATION_SCHEMA,
    profile_hash: input.profileHash ?? null,
    normalizer_hashes: input.normalizerHashes ?? {},
    run_hash: hashOccurrences(run),
    gold_hash: hashGold(gold),
    metrics: { overall, per_document, per_strata },
    floors_evaluated,
    gate,
  };
}

function fmt(value: number | null): string {
  return value === null ? "null" : value.toFixed(4);
}

/**
 * Human-readable report. Precision and unresolved-rate are ALWAYS printed as a
 * pair, even when the gate only configures one of them.
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const overall = result.metrics.overall;
  const lines: string[] = [];
  lines.push(`gate: ${result.gate.toUpperCase()}`);
  lines.push(`mention_recall: ${fmt(overall.mention_recall)} (${overall.gold_spans_matched}/${overall.gold_spans} gold spans)`);
  lines.push(`set_recall (macro): ${fmt(overall.set_recall)} over ${overall.documents_scored} document(s)`);
  lines.push(`resolution_precision: ${fmt(overall.resolution_precision)}  |  unresolved_rate: ${fmt(overall.unresolved_rate)}`);
  lines.push(`  unlinked_rate: ${fmt(overall.unlinked_rate)}  ambiguous_rate: ${fmt(overall.ambiguous_rate)}  linked_count: ${overall.linked_count}`);
  for (const [key, block] of Object.entries(result.metrics.per_strata).sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`  strata[${key}] precision: ${fmt(block.resolution_precision)} | unresolved: ${fmt(block.unresolved_rate)} | mention_recall: ${fmt(block.mention_recall)}`);
  }
  for (const floor of result.floors_evaluated) {
    const relation = floor.kind === "floor" ? ">=" : "<=";
    lines.push(`  ${floor.pass ? "PASS" : "FAIL"} ${floor.kind} ${floor.metric} ${relation} ${floor.threshold} (got ${fmt(floor.value)})`);
  }
  return lines.join("\n");
}
