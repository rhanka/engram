import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isExtractUsageError, loadMission, type FieldSpec, type LoadedMission } from "../scrap/extract.js";
import * as companion from "./companion-contracts.js";
import { parseResultsNdjson } from "./cost-seat.js";
import type { GoldenScalarRow } from "./metrics-unweighted.js";
import type { BenchResultsFile } from "./results-contract.js";
import * as guards from "./results-guards.js";

export type BenchIngestErrorCode =
  | "BAD_USAGE" | "BAD_MISSION" | "MISSING_GOLDEN_SUMMARY" | "DUPLICATE_GOLDEN_SUMMARY" | "MISSING_GOLDEN_DIGEST"
  | "GOLDEN_MISSION_DIGEST_MISMATCH" | "CANDIDATE_MISSION_DIGEST_MISMATCH" | "GOLDEN_DIGEST_MISMATCH"
  | "GOLDEN_IDS_MISMATCH" | "MISSING_ARM_DIGEST" | "MISSION_DIGEST_MISMATCH" | "DUPLICATE_ARM_DIR"
  | "DUPLICATE_ARM_ID" | "UNKNOWN_FIELD" | "DUPLICATE_FIELD" | "MAX_VALUES_CONFLICT" | "COST_CONFLICT";

/** Typed bench-dossier ingest refusal carrying stable code and optional cause. */
export class BenchIngestError extends Error {
  constructor(readonly code: BenchIngestErrorCode, message: string, cause?: unknown) {
    super(`${code}: ${message}`, cause !== undefined ? { cause } : undefined);
    this.name = "BenchIngestError";
  }
}

/** Return true for CLI usage, contract, digest, mission-shape, metrics, or missing-input errors (exit 2). */
export function isBenchIngestUsageError(err: unknown): boolean {
  if (err instanceof guards.BenchResultsValidationError) {
    return err.code !== "IO_ERROR" || err.errno === "ENOENT" || err.errno === "ENOTDIR" || err.errno === "EISDIR";
  }
  if (isExtractUsageError(err)) return true;
  if (!(err instanceof Error) || "syscall" in err) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && !code.startsWith("ERR_") && /^[A-Z0-9]+_[A-Z0-9_]+$/.test(code);
}

/** Normalize a SHA-256 digest string to lowercase hex, or hash a raw buffer to lowercase hex. */
export const normalizeDigest = (raw: string): string => raw.trim().replace(/^sha256:/i, "").trim().toLowerCase();
export const sha256Hex = (raw: Buffer): string => createHash("sha256").update(raw).digest("hex");
const toIoErr = (filePath: string, cause: unknown) => {
  const code = (cause as NodeJS.ErrnoException | undefined)?.code;
  return new guards.BenchResultsValidationError("IO_ERROR", filePath,
    { errno: typeof code === "string" ? code : undefined, cause });
};
/** Read a file into a Buffer, or load/validate a mission JSON file, wrapping I/O errors cleanly. */
export function readCheckedBuf(filePath: string): Buffer {
  try { return readFileSync(filePath); } catch (cause) { throw toIoErr(filePath, cause); }
}
export function loadCheckedMission(filePath: string): LoadedMission {
  try { return loadMission(filePath); } catch (cause) {
    const err = cause as NodeJS.ErrnoException | undefined;
    if (err && typeof err.syscall === "string") throw toIoErr(filePath, cause);
    throw new BenchIngestError("BAD_MISSION", `${filePath}: ${err?.message ?? String(cause)}`, cause);
  }
}
/** Load optional seat-observations JSON file into a Map keyed by armId. */
export function loadSeatMap(seatPath?: string): Map<string, companion.SeatObservationInput> {
  if (seatPath === undefined) return new Map();
  return new Map(Object.entries(companion.readSeatObservationsFile(seatPath).observations));
}

type RunStatsRow = { answered: number; failed: number; missing: number; failed_by_code?: Record<string, number> };
const STATS_VAL = guards.stringMapOf(guards.objectSchema<RunStatsRow>(
  guards.fieldsOf(["answered", "failed", "missing"], guards.countInt),
  { failed_by_code: guards.stringMapOf(guards.countInt) },
));
const ALPHA_VAL = guards.nullable(guards.finiteNumber);
const RUNS_VAL = guards.arrayOf(guards.nonEmptyString);
function readAlpha(rawFields: Record<string, unknown> | undefined, fieldKey: string): number | null {
  const [topKey, subKey] = fieldKey.split(".");
  const own = (obj: Record<string, unknown> | undefined, key: string, path: string) =>
    obj && Object.hasOwn(obj, key) ? guards.assertPlainObject(obj[key], path) : undefined;
  const top = own(rawFields, topKey!, `$.summary.fields.${topKey}`);
  const subObj = subKey === undefined || top?.subfields === undefined
    ? undefined : guards.assertPlainObject(top.subfields, `$.summary.fields.${topKey}.subfields`);
  const entry = subKey === undefined ? top : own(subObj, subKey, `$.summary.fields.${fieldKey}`);
  if (!entry || entry.krippendorff_alpha === undefined) return null;
  ALPHA_VAL(entry.krippendorff_alpha, `$.summary.fields.${fieldKey}.krippendorff_alpha`);
  return entry.krippendorff_alpha as number | null;
}

/** Read and digest-verify converged golden NDJSON, `#509` run_stats, missing_digest_runs, and alphas. */
export function readConvergeGolden(goldenPath: string, goldenMissionDigest: string,
  requestedFields: readonly string[] | undefined, goldenSpecs: readonly FieldSpec[]) {
  const raw = readCheckedBuf(goldenPath);
  const allRows = parseResultsNdjson(raw.toString("utf8"));
  const sums = allRows.filter((row) => row.type === "summary");
  const goldenRows = allRows.filter((row) => row.type !== "summary") as unknown as GoldenScalarRow[];
  const failGolden = (code: BenchIngestErrorCode): never => { throw new BenchIngestError(code, goldenPath); };
  if (sums.length !== 1) failGolden(sums.length === 0 ? "MISSING_GOLDEN_SUMMARY" : "DUPLICATE_GOLDEN_SUMMARY");
  const sum = sums[0]!;
  const rawDigest = sum.mission_digest ?? sum.missionDigest;
  if (rawDigest == null || (typeof rawDigest === "string" && !rawDigest.trim())) failGolden("MISSING_GOLDEN_DIGEST");
  if (typeof rawDigest !== "string") guards.fail("WRONG_TYPE", "$.summary.mission_digest");
  if (normalizeDigest(rawDigest as string) !== goldenMissionDigest) failGolden("GOLDEN_MISSION_DIGEST_MISMATCH");
  RUNS_VAL(sum.runs, "$.summary.runs");
  if ((sum.runs as string[]).length === 0) guards.fail("BAD_SHAPE", "$.summary.runs");
  if (sum.ids !== undefined) {
    guards.countInt(sum.ids, "$.summary.ids");
    if (sum.ids !== goldenRows.length) failGolden("GOLDEN_IDS_MISMATCH");
  }
  if (sum.missing_digest_runs !== undefined) RUNS_VAL(sum.missing_digest_runs, "$.summary.missing_digest_runs");
  if (sum.run_stats !== undefined) STATS_VAL(sum.run_stats, "$.summary.run_stats");
  const rawStats = sum.run_stats as NonNullable<BenchResultsFile["corpus"]["annotatorRunStats"]> | undefined;
  const annotatorRunStats = rawStats && Object.fromEntries(
    Object.entries(rawStats).map(([runId, { answered, failed, missing }]) => [runId, { answered, failed, missing }]));
  const specMap = new Map(goldenSpecs.flatMap((spec) => spec.kind === "scalar"
    ? [[spec.name, spec] as const] : spec.subFields!.map((sub) => [`${spec.name}.${sub.name}`, spec] as const)));
  const fields: string[] = [];
  for (const field of requestedFields ?? specMap.keys()) {
    if (fields.includes(field) || !specMap.has(field)) {
      throw new BenchIngestError(fields.includes(field) ? "DUPLICATE_FIELD" : "UNKNOWN_FIELD", field);
    }
    fields.push(field);
  }
  const rawFields = sum.fields === undefined ? undefined : guards.assertPlainObject(sum.fields, "$.summary.fields");
  return { goldenSha256: sha256Hex(raw), goldenRows, fields, specMap, annotatorCount: (sum.runs as string[]).length,
    annotatorRunStats, missingDigestRuns: sum.missing_digest_runs as readonly string[] | undefined,
    krippendorffAlphaByField: Object.fromEntries(fields.map((key) => [key, readAlpha(rawFields, key)])) };
}
