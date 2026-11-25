import type {
  BenchResultRecord, BenchResultsFile, CostBasisKind, CurrencyCode, EffortLevel, EstimatorKind,
  PartitionKind, SeatUnknownReason, SitePresenceMatrix, UnknownOrNumber, WeightedEstimateBlock,
} from "./results-types.js";

export const ARM_MANIFEST_SCHEMA_ID = "urn:engram:bench-arm-manifest:1.0.0" as const;
export const SEAT_OBSERVATION_SCHEMA_ID = "urn:engram:seat-observation:1.0.0" as const;
export const METRICS_IMPORT_SCHEMA_ID = "urn:engram:bench-metrics-import:1.0.0" as const;
export const DOSSIER_META_SCHEMA_ID = "urn:engram:bench-dossier-meta:1.0.0" as const;
export const DECISIONS_SCHEMA_ID = "urn:engram:bench-decisions:1.0.0" as const;
export const SEAT_OBSERVATION_WINDOW_MINUTES = 10080 as const;

export const ARM_TARIFF_STATUSES = ["primary", "secondary_unverified"] as const satisfies readonly ArmTariffStatus[];
export type ArmTariffStatus = "primary" | "secondary_unverified";
export const DOSSIER_LANGUAGES = ["en", "fr"] as const satisfies readonly DossierLanguage[];
export type DossierLanguage = "en" | "fr";
export const STAKES_LEVELS = ["low", "medium", "high"] as const satisfies readonly StakesLevel[];
export type StakesLevel = "low" | "medium" | "high";

export interface ArmTariffOverride {
  readonly status: "primary" | "secondary_unverified" | "unknown"; readonly currency?: CurrencyCode;
  readonly source: string | null; readonly asOf: string | null;
  readonly perMillion?: { readonly input: number; readonly output: number; readonly reasoning?: number };
}
export interface ArmFxRate {
  readonly from: CurrencyCode; readonly to: CurrencyCode; readonly rate: number;
  readonly source: string; readonly asOf: string;
}
interface SeatBase { readonly schemaId?: typeof SEAT_OBSERVATION_SCHEMA_ID; }
export interface SeatObservationUnknown extends SeatBase {
  readonly status: "unknown"; readonly method?: "unknown"; readonly reason: SeatUnknownReason;
}
interface SeatPlanFields extends SeatBase {
  readonly windowMinutes: 10080; readonly plan: string; readonly planMonthlyPrice: number;
  readonly planCurrency?: CurrencyCode; readonly planSource: string; readonly planAsOf: string;
}
export interface SeatObservationMeasured extends SeatPlanFields {
  readonly status: "measured"; readonly method: "weekly_burn_delta"; readonly isolatedSeat: true;
  readonly remainingBefore: number; readonly remainingAfter: number; readonly observedItems: number;
}
export interface SeatObservationEstimated extends SeatPlanFields {
  readonly status: "estimated"; readonly method: "api_cost_proportional"; readonly isolatedSeat?: boolean;
  readonly observedApiEquivalent: number; readonly observedCurrency?: CurrencyCode;
  readonly quotaDeltaFraction: number; readonly basePlanMultiplier: number; readonly targetPlanMultiplier: number;
}
export type SeatObservationInput = SeatObservationUnknown | SeatObservationMeasured | SeatObservationEstimated;
export interface SeatObservationsFile {
  readonly schemaId: typeof SEAT_OBSERVATION_SCHEMA_ID;
  readonly observations: Readonly<Record<string, SeatObservationInput>>;
}
export interface ArmManifestFile {
  readonly schemaId: typeof ARM_MANIFEST_SCHEMA_ID; readonly armId: string; readonly provider: string;
  readonly model: string; readonly modelLabel: string; readonly proseName: string; readonly effort: EffortLevel;
  readonly isCascade: boolean; readonly missionPath?: string; readonly missionSha256?: string;
  readonly allowLegacyMissingMissionDigest?: boolean; readonly isHighlighted?: boolean; readonly incomplete?: boolean;
  readonly tariffStatus?: ArmTariffStatus; readonly tariffOverride?: ArmTariffOverride;
  readonly fx?: ArmFxRate; readonly seat?: SeatObservationInput;
}
export interface MetricsImportRecord {
  readonly armId: string; readonly field: string; readonly comparator: string; readonly isPrimaryComparator: boolean;
  readonly attempted: number; readonly accepted: number; readonly failed: number;
  readonly failuresByCode: Readonly<Record<string, number>>; readonly unverifiedQuotesNulled: number;
  readonly unverifiedWholeRecordsDropped: number | null; readonly goldPositive: number; readonly goldAbsent: number;
  readonly tp: number; readonly fp: number; readonly fpOnPresent: number; readonly fpOnAbsent: number;
  readonly fpElementsOnAbsent: number; readonly fn: number; readonly tn: number; readonly failedOnAbsent: number;
  readonly unresolved: number; readonly insufficient: number; readonly sitePresence: SitePresenceMatrix;
  readonly unweighted: BenchResultRecord["unweighted"]; readonly weighted: WeightedEstimateBlock | null;
  readonly independentGroupSupport?: BenchResultRecord["independentGroupSupport"];
  readonly diagnostics?: BenchResultRecord["diagnostics"]; readonly armMissionSha256?: string;
  readonly calls?: UnknownOrNumber; readonly tokens?: BenchResultRecord["tokens"];
  readonly costBasisItems?: number; readonly apiEquivalentTotal?: UnknownOrNumber;
}
export interface BenchMetricsImportFile {
  readonly schemaId: typeof METRICS_IMPORT_SCHEMA_ID; readonly campaignId: string; readonly partition: PartitionKind;
  readonly goldenLabel?: string; readonly primaryEstimator: EstimatorKind; readonly costBasisLabel?: CostBasisKind;
  readonly currency?: CurrencyCode; readonly goldenSha256: string; readonly goldenMissionSha256: string;
  readonly candidateMissionSha256: string; readonly fieldShapeVerified: true; readonly goldenIds: number;
  readonly fields: readonly string[]; readonly annotatorCount: number;
  readonly annotatorRunStats?: BenchResultsFile["corpus"]["annotatorRunStats"];
  readonly missingDigestRuns?: readonly string[];
  readonly krippendorffAlphaByField: Readonly<Record<string, number | null>>;
  readonly supportFloors?: BenchResultsFile["supportFloors"]; readonly records: readonly MetricsImportRecord[];
}
export type SourceOrigin =
  | { readonly uri: string }
  | { readonly repo: string; readonly revision: string; readonly path: string };
export interface AmendmentStep { readonly at: string; readonly author: string; readonly summary: string; }
export interface DossierMetaFile {
  readonly schemaId: typeof DOSSIER_META_SCHEMA_ID; readonly ref: string; readonly language: DossierLanguage;
  readonly title: string; readonly subject: string; readonly ownerRequestQuote: string; readonly stakes: string;
  readonly stakesLevel: StakesLevel; readonly provenance: { readonly source: string; readonly readAt: string };
  readonly reviewStatus: { readonly complete: boolean; readonly summaryProse: string };
  readonly origins: {
    readonly defaultRepo: string; readonly defaultRevision: string;
    readonly sourcePaths?: Readonly<Record<string, SourceOrigin>>;
  };
  readonly cursor?: string; readonly readingBudgetMinutes?: number;
  readonly amendmentTrace?: readonly AmendmentStep[];
  readonly fieldLabels?: Readonly<Record<string, { readonly en: string; readonly fr: string }>>;
  readonly glossaryExtra?: readonly { readonly term: string; readonly definition: string }[];
}
export interface BenchDecisionOption {
  readonly id: string; readonly label: string; readonly consequence: string; readonly body: string;
}
export interface BenchDecisionQuestion {
  readonly id: string; readonly title: string; readonly question: string; readonly context: string;
  readonly recommendedOptionId: string; readonly recommendedAnswer: string;
  readonly strongestObjectionProse: string; readonly overturnConditionProse: string;
  readonly failureScenarioProse: string; readonly presenterConvenienceProse: string;
  readonly completionCriterion?: string; readonly readingTimeMinutes?: number;
  readonly options: readonly BenchDecisionOption[];
}
export interface OwnerCriterionRow {
  readonly criterion: string; readonly requestSource: string;
  readonly addressedBy: string; readonly gapOrDeparture: string;
}
export interface BenchDecisionsFile {
  readonly schemaId: typeof DECISIONS_SCHEMA_ID;
  readonly questions: readonly BenchDecisionQuestion[]; readonly ownerCriteria: readonly OwnerCriterionRow[];
}
