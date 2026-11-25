export const EFFORT_LEVELS = [
  "off", "minimal", "low", "medium", "high", "xhigh", "max", "cascade",
] as const satisfies readonly EffortLevel[];
export type EffortLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | "cascade";

export const CURRENCY_CODES = ["USD", "CAD"] as const satisfies readonly CurrencyCode[];
export type CurrencyCode = "USD" | "CAD";
export const ESTIMATOR_KINDS = ["unweighted", "weighted"] as const satisfies readonly EstimatorKind[];
export type EstimatorKind = "unweighted" | "weighted";
export const PARTITION_KINDS = ["pilot", "eval", "sealed", "blind", "full"] as const satisfies readonly PartitionKind[];
export type PartitionKind = "pilot" | "eval" | "sealed" | "blind" | "full";
export const COST_BASIS_KINDS = [
  "extracted_packet", "attempted_id", "supplied_id",
] as const satisfies readonly CostBasisKind[];
export type CostBasisKind = "extracted_packet" | "attempted_id" | "supplied_id";
export type UnknownOrNumber = number | "unknown";

export const COST_UNKNOWN_REASONS = [
  "unpriced-mission", "reasoning-rate-missing", "incomplete-invocation-summary", "missing-usage",
] as const satisfies readonly CostUnknownReason[];
export type CostUnknownReason =
  | "unpriced-mission" | "reasoning-rate-missing" | "incomplete-invocation-summary" | "missing-usage";

export const SEAT_UNKNOWN_REASONS = [
  "missing-observation", "weekly-window-source-gap", "non-weekly-window", "shared-seat-concurrent",
  "no-quota-delta", "plan-source-gap", "transport-mismatch", "missing-usage", "api-equivalent-source-gap",
] as const satisfies readonly SeatUnknownReason[];
export type SeatUnknownReason =
  | "missing-observation" | "weekly-window-source-gap" | "non-weekly-window"
  | "shared-seat-concurrent" | "no-quota-delta" | "plan-source-gap"
  | "transport-mismatch" | "missing-usage" | "api-equivalent-source-gap";

export const INTERVAL_METHODS = [
  "wilson_95_unweighted", "design_bootstrap_95", "clopper_pearson_95_one_sided", "none",
] as const satisfies readonly BenchInterval["method"][];
export const INTERVAL_CLUSTERINGS = [
  "independent_site", "clustered_record_invalid", "group_resampled",
] as const satisfies readonly BenchInterval["clustering"][];
export const TARIFF_STATUSES = [
  "primary", "secondary_unverified", "unknown",
] as const satisfies readonly BenchCostBlock["tariffStatus"][];
export const SEAT_STATUSES = [
  "measured", "estimated", "unknown",
] as const satisfies readonly BenchCostBlock["seatStatus"][];
export const SEAT_METHODS = [
  "weekly_burn_delta", "api_cost_proportional", "unknown",
] as const satisfies readonly BenchCostBlock["seatMethod"][];

export interface BenchInterval {
  readonly estimator: EstimatorKind;
  readonly method: "wilson_95_unweighted" | "design_bootstrap_95" | "clopper_pearson_95_one_sided" | "none";
  readonly clustering: "independent_site" | "clustered_record_invalid" | "group_resampled";
  readonly valid: boolean;
  readonly low: number | null;
  readonly high: number | null;
}

export interface SitePresenceMatrix {
  readonly goldPresentSites: number;
  readonly goldAbsentSites: number;
  readonly unresolvedSites: number;
  readonly insufficientSites: number;
  readonly tpSites: number;
  readonly fnSites: number;
  readonly wrongValueOnPresentSites: number;
  readonly fpOnAbsentSites: number;
  readonly tnSites: number;
  readonly failedOnAbsentSites: number;
  readonly siteRecall: number | null;
  readonly siteRecallInterval: BenchInterval;
  readonly siteAbstentionSpecificity: number | null;
  readonly siteAbstentionInterval: BenchInterval;
}

export interface WeightedEstimateBlock {
  readonly scheme: string;
  readonly deff: number | null;
  readonly nEff: number | null;
  readonly precision: number | null;
  readonly recall: number | null;
  readonly f1: number | null;
  readonly precisionInterval: BenchInterval;
  readonly recallInterval: BenchInterval;
  readonly f1Interval?: BenchInterval;
}

export interface BenchCostBlock {
  readonly currency: CurrencyCode;
  readonly costBasisItems: number;
  readonly costUnknownReason: CostUnknownReason | null;
  readonly apiEquivalentTotal: UnknownOrNumber;
  readonly apiEquivalentPerItem: UnknownOrNumber;
  readonly tariffStatus: "primary" | "secondary_unverified" | "unknown";
  readonly tariffSource: string | null;
  readonly tariffAsOf: string | null;
  readonly fxApplied: {
    readonly from: CurrencyCode;
    readonly to: CurrencyCode;
    readonly rate: number;
    readonly source: string;
    readonly asOf: string;
  } | null;
  readonly seatStatus: "measured" | "estimated" | "unknown";
  readonly seatMethod: "weekly_burn_delta" | "api_cost_proportional" | "unknown";
  readonly seatUnknownReason: SeatUnknownReason | null;
  readonly seatSharePerItem: UnknownOrNumber;
  readonly seatCostPerItem: UnknownOrNumber;
  readonly seatPlan: string | null;
  readonly seatMonthlyPrice: number | null;
  readonly seatLimitScale: number | null;
  readonly seatPlanSource: string | null;
  readonly seatPlanAsOf: string | null;
}
