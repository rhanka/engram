import { existsSync, realpathSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import type { LoadedMission, Mission } from "../scrap/extract.js";
import * as companion from "./companion-contracts.js";
import { computeArmCostAndSeat, parseResultsNdjson, summarizeInvocationUsage } from "./cost-seat.js";
import { BenchIngestError, loadCheckedMission, normalizeDigest, readCheckedBuf,
  type BenchIngestErrorCode } from "./ingest-golden.js";
import { compatibleMissionFieldShape } from "./invariants.js";
import type { ImportedArmCostInput } from "./metrics-records.js";
import type { CurrencyCode } from "./results-contract.js";
import { enumValue, fail, nonEmptyString } from "./results-guards.js";

export interface LoadedArmBundle {
  readonly armDir: string;
  readonly arm: companion.ArmManifestFile;
  readonly armMission?: LoadedMission;
  readonly expectedDigest: string;
  readonly resultRows?: Record<string, unknown>[];
  readonly armCost?: ImportedArmCostInput;
  readonly priceTable?: Mission["price_table"];
}

export interface LoadArmsInput {
  readonly armDirs: readonly string[];
  readonly refMission?: LoadedMission;
  readonly defaultMission?: LoadedMission;
  readonly defaultDigest?: string;
  readonly requireResults: boolean;
  readonly currency: CurrencyCode;
  readonly seatMap: ReadonlyMap<string, companion.SeatObservationInput>;
}

const canonicalPath = (dirPath: string): string => {
  const absolute = resolve(dirPath);
  try { return realpathSync(absolute); } catch { return absolute; }
};

/** Load arm manifests, verify missionPath shape and results.ndjson digests, and compute unsealed costs. */
export function loadArmBundles(input: LoadArmsInput) {
  const seenDirs = new Set<string>();
  const seenIds = new Set<string>();
  const bundles: LoadedArmBundle[] = [];
  let maxValuesChanged = false;
  for (const armDir of input.armDirs) {
    const canon = canonicalPath(armDir);
    if (seenDirs.has(canon)) throw new BenchIngestError("DUPLICATE_ARM_DIR", armDir);
    seenDirs.add(canon);
    const arm = companion.readArmManifest(join(armDir, "arm.json"));
    if (seenIds.has(arm.armId)) throw new BenchIngestError("DUPLICATE_ARM_ID", arm.armId);
    seenIds.add(arm.armId);
    const armMission = arm.missionPath
      ? loadCheckedMission(isAbsolute(arm.missionPath) ? arm.missionPath : resolve(armDir, arm.missionPath))
      : undefined;
    if (armMission && input.refMission && compatibleMissionFieldShape(input.refMission.mission,
      armMission.mission).maxValuesChanged) maxValuesChanged = true;
    const armSha = arm.missionSha256 !== undefined ? normalizeDigest(arm.missionSha256) : undefined;
    const expectedDigest = armMission?.digest
      ?? (input.requireResults ? input.defaultMission!.digest : armSha ?? input.defaultDigest!);
    const failMismatch = (): never => { throw new BenchIngestError("MISSION_DIGEST_MISMATCH", arm.armId); };
    if (armSha !== undefined && armSha !== expectedDigest) failMismatch();
    const priceTable = armMission ? armMission.mission.price_table
      : input.defaultMission && expectedDigest === input.defaultMission.digest
        ? input.defaultMission.mission.price_table : undefined;
    const resultsPath = join(armDir, "results.ndjson");
    if (!input.requireResults && !existsSync(resultsPath)) {
      bundles.push({ armDir, arm, armMission, expectedDigest, priceTable });
      continue;
    }
    const resultRows = parseResultsNdjson(readCheckedBuf(resultsPath).toString("utf8"));
    const usage = summarizeInvocationUsage(resultRows);
    if ((usage.summaryRows === 0 || usage.hasMissingDigest) && arm.allowLegacyMissingMissionDigest !== true)
      throw new BenchIngestError("MISSING_ARM_DIGEST", arm.armId);
    if (usage.missionDigests.some((digest) => normalizeDigest(digest) !== expectedDigest)) failMismatch();
    const seatObservation = input.seatMap.get(arm.armId);
    const cost = computeArmCostAndSeat({ resultRows, arm, priceTable, currency: input.currency, seatObservation });
    bundles.push({ armDir, arm, armMission, expectedDigest, priceTable, resultRows,
      armCost: { armMissionSha256: expectedDigest, ...cost } });
  }
  return { bundles, maxValuesChanged };
}

const CAPTURE_STATUS = enumValue([
  "ok", "dns", "timeout", "http_4xx", "http_5xx",
  "robots_denied", "blocked_antibot", "empty_js_shell", "invalid_url", "invalid_input",
] as const);

/** Read `<captureDir>/state.jsonl` (latest record per ID) into supplied/attempted/ok counts. */
export function readCaptureStats(captureDir: string) {
  const rows = parseResultsNdjson(readCheckedBuf(join(captureDir, "state.jsonl")).toString("utf8"));
  const latest = new Map<string, string>();
  let invalidInput = 0;
  rows.forEach((row, idx) => {
    const base = `$.state[${idx}]`;
    if (!Object.hasOwn(row, "status")) fail("MISSING_KEY", `${base}.status`);
    CAPTURE_STATUS(row.status, `${base}.status`);
    if (row.status === "invalid_input") {
      invalidInput++;
      return;
    }
    if (!Object.hasOwn(row, "id")) fail("MISSING_KEY", `${base}.id`);
    nonEmptyString(row.id, `${base}.id`);
    latest.set(row.id as string, row.status as string);
  });
  const statuses = [...latest.values()];
  return { captureSuppliedIds: latest.size + invalidInput,
    captureAttemptedIds: statuses.filter((status) => status !== "invalid_url").length,
    captureOkIds: statuses.filter((status) => status === "ok").length };
}

/** Load an optional mission JSON file and verify its SHA-256 digest matches expectedDigest. */
export function checkOptionalMission(
  filePath: string | undefined, expectedDigest: string, code: BenchIngestErrorCode,
): LoadedMission | undefined {
  if (filePath === undefined) return undefined;
  const loaded = loadCheckedMission(filePath);
  if (loaded.digest !== normalizeDigest(expectedDigest)) throw new BenchIngestError(code, filePath);
  return loaded;
}
