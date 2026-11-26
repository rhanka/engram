import { normalizeValue, type Verdict } from "../scrap/converge.js";
import {
  assertCountInt, ensure, isPlainObject, metricsError, type SupportFloorThresholds,
} from "./metrics-intervals.js";

export type CandidateRowState = { ok: false; code: string } | { ok: true; fields: Record<string, unknown> };
export interface GoldenScalarRow { readonly id: string; readonly fields: Readonly<Record<string, unknown>> }
export type GoldUnit = { kind: "insufficient" } | { kind: "absent" }
  | { kind: "present"; goldSet: ReadonlySet<string> } | { kind: "split"; variants: readonly ReadonlySet<string>[] };
const VALID_VERDICTS = new Set<Verdict>(["unanimous", "majority", "split", "absent", "insufficient"]);

export function resolveSupportFloors(floors?: Partial<SupportFloorThresholds>): SupportFloorThresholds {
  ensure(floors === undefined || isPlainObject(floors), "NOT_OBJECT", "supportFloors must be a plain object");
  const pick = (v: unknown, name: string): number => (v === undefined ? 30 : assertCountInt(v, name));
  return {
    precisionMinPredictions: pick(floors?.precisionMinPredictions, "precisionMinPredictions"),
    recallMinPositives: pick(floors?.recallMinPositives, "recallMinPositives"),
  };
}

export function indexCandidateRows(rows: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  ensure(Array.isArray(rows), "NOT_ARRAY", "candidateRows must be an array");
  const byId = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    ensure(isPlainObject(row), "NOT_OBJECT", "candidate row must be a plain object");
    if (row.type === "summary") continue;
    ensure(typeof row.id === "string" && !!row.id.trim(), "MISSING_ID", "candidate row requires non-empty string id");
    byId.set(row.id, row);
  }
  return byId;
}

export function classifyCandidateRow(row: Record<string, unknown> | undefined): CandidateRowState {
  if (!row) return { ok: false, code: "missing" };
  if (row.error != null) return { ok: false, code: String(row.error).trim() || "unknown_error" };
  if (!isPlainObject(row.fields)) return { ok: false, code: "invalid_row" };
  return { ok: true, fields: row.fields };
}

export function normalizeItemsToSet(items: readonly unknown[], honorUnverified: boolean): Set<string> {
  const out = new Set<string>();
  for (const item of items) {
    const unverified = isPlainObject(item) && honorUnverified && item.reason === "unverified_quote";
    const val = unverified ? null : isPlainObject(item) ? item.value : item;
    const norm = normalizeValue(val);
    if (norm !== null) out.add(norm);
  }
  return out;
}

export function toGoldSet(raw: unknown, maxValues: number, tag: string, code = "BAD_GOLD_VALUE"): Set<string> {
  if (raw == null) return new Set();
  if (maxValues === 1) {
    ensure(typeof raw !== "object", code, `${tag}: scalar value cannot be object or array`);
    const norm = normalizeValue(raw);
    return norm === null ? new Set() : new Set([norm]);
  }
  ensure(Array.isArray(raw), "NOT_ARRAY", `${tag}: multi-value gold must be array`);
  return normalizeItemsToSet(raw, false);
}

export function parseGoldenUnit(row: unknown, field: string, maxValues: number): { id: string; unit: GoldUnit } {
  ensure(isPlainObject(row), "NOT_OBJECT", "golden row must be a plain object");
  ensure(typeof row.id === "string" && !!row.id.trim(), "MISSING_ID", "golden row missing id");
  const tag = `${row.id}.${field}`;
  ensure(isPlainObject(row.fields), "NOT_OBJECT", `${tag}: golden row fields must be a plain object`);
  ensure(isPlainObject(row.fields[field]), "MISSING_VOTE", `missing vote ${tag}`);
  const vote = row.fields[field] as Record<string, unknown>;
  const verdict = vote.verdict as Verdict;
  const check = (ok: boolean, code: string, msg: string) => ensure(ok, code, `${tag}: ${msg}`);
  check(VALID_VERDICTS.has(verdict), "BAD_VERDICT", "invalid verdict");
  check(
    vote.n_answered === undefined
      || (verdict === "insufficient") === (assertCountInt(vote.n_answered, "n_answered") < 2),
    "N_ANSWERED_MISMATCH",
    `n_answered contradicts ${verdict}`,
  );
  if (verdict === "insufficient") {
    check(vote.value == null, "INSUFFICIENT_NON_NULL", "insufficient non-null");
    return { id: row.id, unit: { kind: "insufficient" } };
  }
  if (verdict === "split") {
    check(vote.value == null, "SPLIT_NON_NULL", "split non-null");
    if (!isPlainObject(vote.runs)) throw metricsError("SPLIT_MISSING_RUNS", `${tag}: split requires runs`);
    const variants = Object.values(vote.runs).flatMap((run) => {
      if (!isPlainObject(run) || (run.status !== "failed" && run.status !== "missing" && !("value" in run))) {
        throw metricsError("BAD_SPLIT_RUN", `${tag}: bad split run`);
      }
      if (run.status === "failed" || run.status === "missing") return [];
      const set = toGoldSet(run.value, maxValues, tag);
      return set.size > 0 ? [set] : [];
    });
    check(variants.length > 0, "SPLIT_NO_RUN", "split has no non-null run");
    return { id: row.id, unit: { kind: "split", variants } };
  }
  const goldSet = toGoldSet(vote.value, maxValues, tag);
  check(!(verdict === "absent" && goldSet.size > 0), "ABSENT_NON_NULL", "absent non-null");
  check(!(verdict === "unanimous" && goldSet.size === 0), "UNANIMOUS_NULL", "unanimous null");
  return { id: row.id, unit: goldSet.size === 0 ? { kind: "absent" } : { kind: "present", goldSet } };
}

export function extractCandidateField(raw: unknown, maxValues: number): { set: Set<string>; nulled: number } {
  if (raw == null) return { set: new Set(), nulled: 0 };
  ensure(isPlainObject(raw), "NOT_OBJECT", "candidate field value must be a plain object or null");
  if (maxValues === 1) {
    const set = toGoldSet(raw.value ?? null, 1, "candidate", "BAD_CANDIDATE_VALUE");
    return raw.reason === "unverified_quote" ? { set: new Set(), nulled: 1 } : { set, nulled: 0 };
  }
  const dropped = raw.unverified_dropped === undefined
    ? 0 : assertCountInt(raw.unverified_dropped, "unverified_dropped");
  ensure(raw.values === undefined || Array.isArray(raw.values), "NOT_ARRAY", "candidate values must be array");
  const values = (raw.values as unknown[] | undefined) ?? [];
  const inline = values.filter((x) => isPlainObject(x) && x.reason === "unverified_quote").length;
  return { set: normalizeItemsToSet(values, true), nulled: dropped + inline };
}
