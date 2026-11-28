import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseScrapScoreOptions, type ScrapScoreOptions } from "./ingest-cli.js";
import { loadCheckedMission, loadSeatMap, readConvergeGolden } from "./ingest-golden.js";
import { loadArmBundles, readCaptureStats } from "./ingest-io.js";
import { compatibleMissionFieldShape, validateBenchResultsInvariants } from "./invariants.js";
import { scoreUnweightedRecord } from "./metrics-records.js";
import { scoreUnweightedScalar } from "./metrics-unweighted.js";
import {
  BENCH_RESULTS_SCHEMA_ID, BENCH_RESULTS_SCHEMA_VERSION, parseBenchResultsFile, type BenchResultsFile,
} from "./results-contract.js";

export * from "./ingest-cli.js";
export * from "./ingest-golden.js";
export * from "./ingest-io.js";
export * from "./ingest-sealed.js";

const definedEntries = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined));

function writeBenchResults(outPath: string, file: BenchResultsFile): void {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
}

/** Verify mission digests/shape, score candidate arms against converged golden NDJSON, and write bench-results.json. */
export async function runScrapScore(rawOptions: ScrapScoreOptions): Promise<BenchResultsFile> {
  const options = parseScrapScoreOptions(rawOptions);
  const currency = options.currency ?? "USD";
  const goldenMission = loadCheckedMission(options.goldenMission);
  const candidateMission = loadCheckedMission(options.candidateMission);
  const shape = compatibleMissionFieldShape(goldenMission.mission, candidateMission.mission);
  const seatMap = loadSeatMap(options.seatObservations);
  const { bundles, maxValuesChanged } = loadArmBundles({
    armDirs: options.arms, refMission: goldenMission, defaultMission: candidateMission,
    requireResults: true, currency, seatMap,
  });
  const golden = readConvergeGolden(options.golden, goldenMission.digest, options.fields, shape.goldenSpecs);
  const supportFloors = { recallMinPositives: options.recallFloor ?? 30,
    precisionMinPredictions: options.precisionFloor ?? 30, failureCeiling: options.failureCeiling ?? 0.05 };
  const records = bundles.flatMap((bundle) => golden.fields.map((field) => {
    const spec = golden.specMap.get(field)!;
    const scoreFn = spec.kind === "record" ? scoreUnweightedRecord : scoreUnweightedScalar;
    return {
      armId: bundle.arm.armId, missingDigestAllowed: bundle.arm.allowLegacyMissingMissionDigest ?? false,
      provider: bundle.arm.provider, model: bundle.arm.model, modelLabel: bundle.arm.modelLabel,
      proseName: bundle.arm.proseName, effort: bundle.arm.effort, isCascade: bundle.arm.isCascade,
      isHighlighted: bundle.arm.isHighlighted ?? false, incomplete: bundle.arm.incomplete ?? false,
      comparator: "generic", isPrimaryComparator: true, weighted: null, ...bundle.armCost!,
      ...scoreFn({ field, maxValues: spec.maxValues, supportFloors,
        goldenRows: golden.goldenRows, candidateRows: bundle.resultRows! }),
    };
  }));
  const captureStats = options.captureDir !== undefined ? readCaptureStats(options.captureDir) : {};
  const corpus = { partition: options.partition ?? "eval", primaryEstimator: "unweighted",
    costBasisLabel: options.costBasis ?? "extracted_packet", currency, goldenMissionSha256: goldenMission.digest,
    candidateMissionSha256: candidateMission.digest, fieldShapeVerified: true, goldenSha256: golden.goldenSha256,
    goldenIds: golden.goldenRows.length, fields: golden.fields, annotatorCount: golden.annotatorCount,
    krippendorffAlphaByField: golden.krippendorffAlphaByField, ...captureStats,
    ...definedEntries({ goldenLabel: options.goldenLabel, fieldLabels: options.fieldLabels,
      annotatorRunStats: golden.annotatorRunStats, missingDigestRuns: golden.missingDigestRuns,
      maxValuesChanged: shape.maxValuesChanged || maxValuesChanged ? true : undefined }) };
  const file = validateBenchResultsInvariants(parseBenchResultsFile({ schemaId: BENCH_RESULTS_SCHEMA_ID,
    schemaVersion: BENCH_RESULTS_SCHEMA_VERSION,
    generatedAt: options.generatedAt ?? new Date().toISOString().replace(".000Z", "Z"),
    campaignId: options.campaignId, corpus, supportFloors, records }), { missionSpecs: shape.goldenSpecs });
  writeBenchResults(options.out, file);
  return file;
}
