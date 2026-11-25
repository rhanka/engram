import type {
  BenchCostBlock, BenchInterval, CostBasisKind, CurrencyCode, EffortLevel,
  EstimatorKind, PartitionKind, SitePresenceMatrix, UnknownOrNumber, WeightedEstimateBlock,
} from "./results-types-blocks.js";
export * from "./results-types-blocks.js";

export const BENCH_RESULTS_SCHEMA_ID = "urn:engram:bench-results:1.0.0" as const;
export const BENCH_RESULTS_SCHEMA_VERSION = 1 as const;

export interface BenchResultRecord {
  readonly armId: string;
  readonly armMissionSha256: string;
  readonly missingDigestAllowed: boolean;
  readonly provider: string;
  readonly model: string;
  readonly modelLabel: string;
  readonly proseName: string;
  readonly effort: EffortLevel;
  readonly isCascade: boolean;
  readonly isHighlighted: boolean;
  readonly incomplete: boolean;
  readonly field: string;
  readonly comparator: string;
  readonly isPrimaryComparator: boolean;
  readonly attempted: number;
  readonly accepted: number;
  readonly failed: number;
  readonly failuresByCode: Readonly<Record<string, number>>;
  readonly unverifiedQuotesNulled: number;
  readonly unverifiedWholeRecordsDropped: number | null;
  readonly goldPositive: number;
  readonly goldAbsent: number;
  readonly tp: number;
  readonly fp: number;
  readonly fpOnPresent: number;
  readonly fpOnAbsent: number;
  readonly fpElementsOnAbsent: number;
  readonly fn: number;
  readonly tn: number;
  readonly failedOnAbsent: number;
  readonly unresolved: number;
  readonly insufficient: number;
  readonly abstentionSpecificity: number | null;
  readonly sitePresence: SitePresenceMatrix;
  readonly unweighted: {
    readonly precision: number | null; readonly recall: number | null; readonly f1: number | null;
    readonly precisionInterval: BenchInterval; readonly recallInterval: BenchInterval;
  };
  readonly weighted: WeightedEstimateBlock | null;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly precisionInterval: BenchInterval;
  readonly recallInterval: BenchInterval;
  readonly independentGroupSupport?: { readonly predictions: number; readonly positives: number };
  readonly indeterminate: { readonly precision: boolean; readonly recall: boolean; readonly f1: boolean };
  readonly calls: UnknownOrNumber;
  readonly callsPerItem: UnknownOrNumber;
  readonly tokens: {
    readonly input: number; readonly output: number; readonly reasoning: number;
    readonly cached: UnknownOrNumber; readonly total: number;
  } | "unknown";
  readonly cost: BenchCostBlock;
  readonly diagnostics?: {
    readonly broad?: {
      readonly tp: number; readonly fp: number; readonly fn: number;
      readonly precision: number | null; readonly recall: number | null; readonly f1: number | null;
    };
    readonly conditionalRetainedRecall?: number | null;
  };
}

export interface BenchResultsFile {
  readonly schemaId: "urn:engram:bench-results:1.0.0";
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly campaignId: string;
  readonly corpus: {
    readonly partition: PartitionKind;
    readonly goldenLabel?: string;
    readonly primaryEstimator: EstimatorKind;
    readonly costBasisLabel: CostBasisKind;
    readonly currency: CurrencyCode;
    readonly goldenMissionSha256: string;
    readonly candidateMissionSha256: string;
    readonly fieldShapeVerified: true;
    readonly maxValuesChanged?: boolean;
    readonly goldenSha256: string;
    readonly captureSuppliedIds?: number;
    readonly captureAttemptedIds?: number;
    readonly captureOkIds?: number;
    readonly goldenIds: number;
    readonly fields: readonly string[];
    readonly fieldLabels?: Readonly<Record<string, { readonly en: string; readonly fr: string }>>;
    readonly annotatorCount: number;
    readonly annotatorRunStats?: Readonly<Record<string, {
      readonly answered: number; readonly failed: number; readonly missing: number;
    }>>;
    readonly missingDigestRuns?: readonly string[];
    readonly krippendorffAlphaByField: Readonly<Record<string, number | null>>;
  };
  readonly supportFloors: {
    readonly recallMinPositives: number; readonly precisionMinPredictions: number;
    readonly failureCeiling: number;
  };
  readonly records: readonly BenchResultRecord[];
}
