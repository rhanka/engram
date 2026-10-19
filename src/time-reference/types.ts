/**
 * Engram time-reference contract — closed DTO types.
 *
 * Implements SPEC-time-reference-contract.md section 6 (Tour 3 revision,
 * 2026-10-18). All DTOs are closed: no index signatures, every field named
 * below. `schema` literals version each DTO independently of the package
 * version. Canonical unit for durations: seconds. Instants: UTC ISO-8601.
 */

export const SCHEMA_COLLECTION_MANIFEST = "engram.time-reference/collection-manifest/1" as const;
export const SCHEMA_PULL_REQUEST_TIMING = "engram.time-reference/pull-request-timing/1" as const;
export const SCHEMA_CI_CHECK_BATCH = "engram.time-reference/ci-check-batch/1" as const;
export const SCHEMA_COHORT = "engram.time-reference/cohort/1" as const;
export const SCHEMA_QUANTILE_SET = "engram.time-reference/quantile-set/1" as const;
export const SCHEMA_TIMING_SERIES = "engram.time-reference/timing-series/1" as const;
export const SCHEMA_TIMING_ESTIMATE = "engram.time-reference/timing-estimate/1" as const;
export const SCHEMA_TIMING_BUDGET = "engram.time-reference/timing-budget/1" as const;
export const SCHEMA_DELIVERY_MILESTONES = "engram.time-reference/delivery-milestones/1" as const;
export const SCHEMA_INSTALLATION_RECEIPT = "engram.time-reference/installation-receipt/1" as const;
export const SCHEMA_COMMITTED_EXPORT = "engram.time-reference/committed-export/1" as const;
export const SCHEMA_FIGURE_PROVENANCE = "engram.time-reference/figure-provenance/1" as const;
export const SCHEMA_REVIEW_WAVE_MANIFEST = "engram.time-reference/review-wave-manifest/1" as const;
export const SCHEMA_REVIEW_ROUNDS_ACTUAL = "engram.time-reference/review-rounds-actual/1" as const;

export type MetricId =
  | "start_to_pr_open"
  | "pr_open_to_merge"
  | "merge_to_installed"
  | "agent_run_elapsed"
  | "agent_work_seconds"
  | "ci_job_service"
  | "ci_envelope"
  | "ci_workflow_span"
  | "wait_interval";

export type QuantileMethod = "nearest-rank/1" | "weighted-ecdf/1";
export type SupportTier = "descriptive" | "uncalibrated-conditional" | "calibrated" | "insufficient-evidence";
export type Applicability = "applicable" | "conditional-historical" | "incomplete";
export type HistoricalAvailability = "attested" | "unattested";
export type CommitsCollectionState = "not-collected" | "collected" | "unavailable";
export type MergeVerdict = "held" | "missed" | "pending" | "not-claimed";
export type InstallVerdict = "held" | "missed" | "unknown";
export type TargetKind = "ci-runner" | "delivery-environment";
export type InstallOutcome = "success" | "failure";
export type RoundStatus = "complete" | "partial" | "unknown";

/** Exact effective size as a reduced integer ratio (decimal integer strings). */
export interface EffectiveSizeRatio {
  numerator: string;
  denominator: string;
}

export interface QuarantineRecord {
  id: number | string;
  reason: string;
}

export interface ExclusionRecord {
  id: number | string;
  reason: string;
}

export interface CollectionManifestV1 {
  schema: typeof SCHEMA_COLLECTION_MANIFEST;
  ruleId: string;
  ruleVersion: string;
  repo: string;
  query: string;
  cutoff: string;
  collectedAt: string;
  firstAvailableAt: string | null;
  historicalAvailability: HistoricalAvailability;
  pageSize: number;
  totalCount: number | null;
  hasNextPage: boolean;
  inclusionIds: Array<number | string>;
  exclusionIds: Array<number | string>;
  quarantine: QuarantineRecord[];
  sourceRevision: string;
  sourceUrls: string[];
  snapshotDigest: string;
}

export interface CommitEvidence {
  sha: string;
  authoredAt: string;
  committedAt: string;
}

export interface PullRequestTimingV1 {
  schema: typeof SCHEMA_PULL_REQUEST_TIMING;
  repo: string;
  number: number;
  url?: string;
  createdAt: string;
  mergedAt: string | null;
  headSha?: string;
  mergeSha?: string;
  firstCommitAt: string | null;
  firstCommitPolicy: "proxy-only-excluded-from-forecasts";
  openToMergeSeconds: number | null;
  commits: CommitEvidence[] | null;
  commitsCollectionState: CommitsCollectionState;
}

export interface CiCheckV1 {
  id: number | string;
  name: string;
  headSha?: string;
  status: string;
  conclusion: string;
  startedAt: string;
  completedAt: string;
  url?: string;
  checkSuiteId?: number | string;
}

export interface CiCheckBatchV1 {
  schema: typeof SCHEMA_CI_CHECK_BATCH;
  repo: string;
  number: number;
  headSha: string;
  source: string;
  collectedAt: string;
  totalCount: number;
  pageSize?: number;
  page?: number;
  hasNextPage?: boolean;
  checks: CiCheckV1[];
}

export interface CohortV1 {
  schema: typeof SCHEMA_COHORT;
  cohortKey: string;
  repo: string;
  metric: MetricId;
  manifestRef: { ruleId: string; snapshotDigest: string };
  memberIds: Array<number | string>;
  n: number;
  window: { from: string; to: string };
  fingerprint: Record<string, unknown>;
  purpose: string;
}

export interface QuantileSetV1 {
  schema: typeof SCHEMA_QUANTILE_SET;
  quantileMethod: QuantileMethod;
  support: SupportTier;
  calibrated: boolean;
  sampleCount: number;
  nEff: EffectiveSizeRatio;
  p50Seconds: number | null;
  p80Seconds: number | null;
  p95Seconds: number | null;
  maxSeconds?: number;
  tailQualification?: string;
  weightsPolicy?: string;
}

export interface TimingSeriesV1 {
  schema: typeof SCHEMA_TIMING_SERIES;
  seriesId: string;
  subject: string;
  metric: MetricId;
  cohortRef: { cohortKey: string; snapshotDigest: string };
  quantiles: QuantileSetV1;
  unit: "second";
  window: { from: string; to: string };
  estimatorVersion: string;
  policyVersion: string;
  missingCount: number;
  censoredCount: number;
  exclusions: ExclusionRecord[];
  fingerprint: Record<string, unknown>;
  measured: boolean;
}

export interface TimingEstimateV1 {
  schema: typeof SCHEMA_TIMING_ESTIMATE;
  estimateId: string;
  seriesRef: { seriesId: string; snapshotDigest: string };
  quantiles: QuantileSetV1;
  applicability: Applicability;
  freshness: { window: { from: string; to: string }; collectedAt: string; referencePublishedAt: string };
  support: SupportTier;
  limitations: string[];
}

export interface TimingBudgetV1 {
  schema: typeof SCHEMA_TIMING_BUDGET;
  budgetId: string;
  subject: string;
  targetSeconds?: number;
  boundSeconds?: number;
  rationale: string;
  decisionRef: string;
  owner: string;
  revisitTrigger: string;
}

export interface FigureProvenanceV1 {
  schema: typeof SCHEMA_FIGURE_PROVENANCE;
  figureRef: string;
  cohortKey: string;
  ruleId: string;
  snapshotDigest: string;
  referenceDigest: string;
  referencePublishedAt: string;
  referencePublicationRevision: string;
  collectedAt: string;
  firstAvailableAt: string | null;
  appliesToRevision: string;
  fingerprintDigest: string;
  estimatorVersion: string;
  policyVersion: string;
  quantileMethod: QuantileMethod;
}

export interface MergeMilestone {
  forecastAt: string | null;
  mergedAt: string | null;
  verdict: MergeVerdict;
}

export interface InstallMilestoneEntry {
  targetId: string;
  forecastAt: string | null;
  installedAt: string;
  verdict: InstallVerdict;
  receiptRef?: string;
}

export interface DeliveryMilestonesV1 {
  schema: typeof SCHEMA_DELIVERY_MILESTONES;
  repo: string;
  lotRef: string;
  forecastRevision: string;
  mergeSha: string | null;
  mergeMilestone: MergeMilestone;
  installMilestones: InstallMilestoneEntry[];
}

export interface InstallationReceiptV1 {
  schema: typeof SCHEMA_INSTALLATION_RECEIPT;
  repo: string;
  lotOccurrence: string;
  mergeSha: string;
  releaseSourceSha: string;
  ancestryEvidence: string;
  targetId: string;
  targetKind: TargetKind;
  platform: string;
  installationScope: string;
  expectedVersion: string;
  observedVersion: string;
  expectedTuple: string;
  observedTuple: string;
  artifactIntegrity: string;
  resolvedExecutable: string;
  installStartedAt: string;
  installCompletedAt: string;
  smokeCompletedAt: string;
  installOutcome: InstallOutcome;
  smokeOutcome: InstallOutcome;
  clockSource: string;
  producerIdentity: string;
  evidenceDigests: string[];
}

export interface CommittedExportV1 {
  schema: typeof SCHEMA_COMMITTED_EXPORT;
  repo: string;
  serviceRevision: string;
  profileRef: { id: string; version: string; contentDigest: string };
  window: { from: string; to: string };
  generatedAt: string;
  generator: { name: string; version: string };
  series: TimingSeriesV1[];
  estimates: TimingEstimateV1[];
  budgets: TimingBudgetV1[];
  milestones: DeliveryMilestonesV1[];
  provenance: FigureProvenanceV1[];
  exportDigest: string;
}

export interface ReviewerRunRef {
  runId: string;
  evidenceRefs: string[];
}

export interface ReviewWaveManifestV1 {
  schema: typeof SCHEMA_REVIEW_WAVE_MANIFEST;
  repo: string;
  lotOccurrence: string;
  roundId: string;
  candidateRevision: string;
  submittedAt: string | null;
  submissionEvidenceRefs: string[];
  requestEvidenceRefs: string[];
  reviewerRuns: ReviewerRunRef[];
  resultEvidenceRefs: string[];
  closureEvidenceRefs: string[];
  closedAt: string | null;
}

export interface ReviewRoundsActualV1 {
  schema: typeof SCHEMA_REVIEW_ROUNDS_ACTUAL;
  repo: string;
  lotOccurrence: string;
  convention: "review-round/1";
  status: RoundStatus;
  completedCount: number | null;
  openRoundIds: string[];
  reviewerRunCount: number | null;
  roundIds: string[];
  coverageManifestRef: string | null;
  evidenceRefs: string[];
  missingReason?: string;
}
