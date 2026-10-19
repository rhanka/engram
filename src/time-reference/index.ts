/**
 * Public entry `@sentropic/engram/time-reference` (spec section 8).
 *
 * Data and pure functions only: closed DTO types and JSON Schemas,
 * validators, quantile primitives, export validator/regenerator check and
 * the milestone evaluator. No host imports; runtime dependencies are empty
 * beyond the Node standard library (`node:crypto` for digests).
 */

export type {
  Applicability,
  CiCheckBatchV1,
  CiCheckV1,
  CohortV1,
  CollectionManifestV1,
  CommittedExportV1,
  CommitEvidence,
  DeliveryMilestonesV1,
  EffectiveSizeRatio,
  ExclusionRecord,
  FigureProvenanceV1,
  HistoricalAvailability,
  InstallMilestoneEntry,
  InstallationReceiptV1,
  InstallOutcome,
  InstallVerdict,
  MergeMilestone,
  MergeVerdict,
  MetricId,
  PullRequestTimingV1,
  QuantileMethod,
  QuantileSetV1,
  QuarantineRecord,
  ReviewerRunRef,
  ReviewRoundsActualV1,
  ReviewWaveManifestV1,
  RoundStatus,
  SupportTier,
  TargetKind,
  TimingBudgetV1,
  TimingEstimateV1,
  TimingSeriesV1,
} from "./types.js";

export {
  SCHEMA_CI_CHECK_BATCH,
  SCHEMA_COHORT,
  SCHEMA_COLLECTION_MANIFEST,
  SCHEMA_COMMITTED_EXPORT,
  SCHEMA_DELIVERY_MILESTONES,
  SCHEMA_FIGURE_PROVENANCE,
  SCHEMA_INSTALLATION_RECEIPT,
  SCHEMA_PULL_REQUEST_TIMING,
  SCHEMA_QUANTILE_SET,
  SCHEMA_REVIEW_ROUNDS_ACTUAL,
  SCHEMA_REVIEW_WAVE_MANIFEST,
  SCHEMA_TIMING_BUDGET,
  SCHEMA_TIMING_ESTIMATE,
  SCHEMA_TIMING_SERIES,
} from "./types.js";

export {
  TIMING_SCHEMAS,
  CI_CHECK_BATCH_SCHEMA,
  COHORT_SCHEMA,
  COLLECTION_MANIFEST_SCHEMA,
  COMMITTED_EXPORT_SCHEMA,
  DELIVERY_MILESTONES_SCHEMA,
  FIGURE_PROVENANCE_SCHEMA,
  INSTALLATION_RECEIPT_SCHEMA,
  PULL_REQUEST_TIMING_SCHEMA,
  QUANTILE_SET_SCHEMA,
  REVIEW_ROUNDS_ACTUAL_SCHEMA,
  REVIEW_WAVE_MANIFEST_SCHEMA,
  TIMING_BUDGET_SCHEMA,
  TIMING_ESTIMATE_SCHEMA,
  TIMING_SERIES_SCHEMA,
  type JsonSchema,
} from "./schemas.js";

export {
  canonicalDigest,
  canonicalJson,
  entryDigestOf,
  exportDigestOf,
  fingerprintDigestOf,
  sha256Digest,
  sha256Hex,
  snapshotDigestOf,
} from "./canonical.js";

export {
  QUANTILE_NEAREST_RANK,
  QUANTILE_WEIGHTED_ECDF,
  effectiveSizeRatio,
  meetsTailSupport,
  nearestRank,
  parseDecimalWeight,
  parseEffectiveSizeRatio,
  parseP,
  weightedEcdf,
  type EffectiveSizeRatio as WeightedEffectiveSizeRatio,
  type QuantileError,
  type WeightedEntry,
} from "./quantiles.js";

export {
  DIGEST_RE,
  INSTANT_RE,
  REPO_RE,
  SHA_RE,
  durationSeconds,
  isDigest,
  isInstant,
} from "./format.js";

export {
  FINGERPRINT_COMPONENTS,
  assertSnapshotComplete,
  ciEnvelopeSeconds,
  ciJobServiceSeconds,
  dedupeIds,
  lastCheckEndToMergeSeconds,
  openToMergeSample,
  validateCheckBatchJoin,
  validateCiCheckBatch,
  validateCohort,
  validateCollectionManifest,
  validateCommittedExport,
  validateDeliveryMilestones,
  validateFigureProvenance,
  validateInstallationReceipt,
  validateMilestonesAgainstReceipts,
  validatePullRequestTiming,
  validateQuantileSet,
  validateReviewRoundsActual,
  validateReviewWaveManifest,
  validateSeriesAgainstManifest,
  validateTimingBudget,
  validateTimingEstimate,
  validateTimingSeries,
  type Diagnostic,
  type ValidationResult,
} from "./validators.js";

export {
  INSTALL_VERDICTS,
  MERGE_VERDICTS,
  buildDeliveryMilestones,
  evaluateInstallationTarget,
  mergeToInstalledSample,
  parseMergeVerdict,
  qualifyInstallation,
  summarizeReviewRounds,
  validateReviewWavesForLot,
  type EvaluatedTarget,
  type IdentifiedContext,
  type InstallationTargetInput,
  type TargetQualification,
  type WaveError,
} from "./milestones.js";

export {
  buildQuantileSet,
  regenerateCheck,
  sampleSnapshotDigest,
  verifyContractPin,
  verifyExportDigest,
  type BuildQuantileOptions,
  type ContractPinFile,
} from "./export.js";
