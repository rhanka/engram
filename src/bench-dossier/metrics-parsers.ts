import { normalizeValue } from "../scrap/converge.js";
import { assertCountInt, ensure, isPlainObject, type SupportFloorThresholds } from "./metrics-intervals.js";

export type CandidateRowState = { ok: false; code: string } | { ok: true; fields: Record<string, unknown> };

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
