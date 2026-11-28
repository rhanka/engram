import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isExtractUsageError, loadMission, type LoadedMission } from "../scrap/extract.js";
import * as companion from "./companion-contracts.js";
import { BenchResultsValidationError } from "./results-guards.js";

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
  if (err instanceof BenchResultsValidationError) {
    return err.code !== "IO_ERROR" || err.errno === "ENOENT" || err.errno === "ENOTDIR" || err.errno === "EISDIR";
  }
  if (isExtractUsageError(err)) return true;
  if (!(err instanceof Error) || "syscall" in err) return false;
  const code = (err as { code?: unknown }).code;
  return typeof code === "string" && !code.startsWith("ERR_") && /^[A-Z0-9]+_[A-Z0-9_]+$/.test(code);
}

/** Normalize a raw SHA-256 hex or `sha256:`-prefixed digest string to bare lowercase hex. */
export function normalizeDigest(raw: string): string {
  return raw.trim().replace(/^sha256:/i, "").trim().toLowerCase();
}

/** Compute lowercase SHA-256 hex digest of a raw byte buffer. */
export function sha256Hex(raw: Buffer): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Read a file into a Buffer, wrapping filesystem errors in BenchResultsValidationError(IO_ERROR). */
export function readCheckedBuf(filePath: string): Buffer {
  try {
    return readFileSync(filePath);
  } catch (cause) {
    const code = (cause as NodeJS.ErrnoException | undefined)?.code;
    throw new BenchResultsValidationError("IO_ERROR", filePath, {
      errno: typeof code === "string" ? code : undefined,
      cause,
    });
  }
}

/** Load and validate a mission JSON file, separating I/O errors from malformed mission schemas. */
export function loadCheckedMission(filePath: string): LoadedMission {
  try {
    return loadMission(filePath);
  } catch (cause) {
    const err = cause as NodeJS.ErrnoException | undefined;
    if (err && typeof err.syscall === "string") {
      throw new BenchResultsValidationError("IO_ERROR", filePath, { errno: err.code, cause });
    }
    throw new BenchIngestError("BAD_MISSION", `${filePath}: ${err?.message ?? String(cause)}`, cause);
  }
}

/** Load optional seat-observations JSON file into a Map keyed by armId. */
export function loadSeatMap(seatPath?: string): Map<string, companion.SeatObservationInput> {
  if (seatPath === undefined) return new Map();
  return new Map(Object.entries(companion.readSeatObservationsFile(seatPath).observations));
}
