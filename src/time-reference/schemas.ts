/**
 * JSON Schemas of the section 6 DTOs (spec section 6.0).
 *
 * Every schema — top-level and nested — sets `additionalProperties: false`;
 * every typed array constrains its elements. The committed artifact
 * `profiles/repo-knowledge/1/timing.schema.json` carries these same schemas
 * as data (generated from this module, never hand-edited separately).
 */

const INSTANT_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,3})?Z$";
const DIGEST_PATTERN = "^sha256:[0-9a-f]{64}$";
const REPO_PATTERN = "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$";
const SHA_PATTERN = "^[0-9a-f]{40}$";
const INT_STRING_PATTERN = "^[0-9]+$";

export interface JsonSchema {
  title: string;
  type: "object";
  properties: Record<string, unknown>;
  required: string[];
  additionalProperties: false;
}

function schema(title: string, properties: Record<string, unknown>, required: string[]): JsonSchema {
  return { title, type: "object", properties, required, additionalProperties: false };
}

/** Closed nested object subschema (shared by reference, inlined on serialization). */
function closed(properties: Record<string, unknown>, required: string[]): Record<string, unknown> {
  return { type: "object", properties, required, additionalProperties: false };
}

const instant = { type: "string", pattern: INSTANT_PATTERN };
const nullableInstant = { type: ["string", "null"], pattern: INSTANT_PATTERN };
const digest = { type: "string", pattern: DIGEST_PATTERN };
const sourceRevision = { type: "string", pattern: SHA_PATTERN };
const repo = { type: "string", pattern: REPO_PATTERN };
const int = { type: "integer" };
const nullableInt = { type: ["integer", "null"] };
const str = { type: "string" };
const nonEmptyString = { type: "string", minLength: 1 };
const bool = { type: "boolean" };

const METRIC_ENUM = ["start_to_pr_open", "pr_open_to_merge", "merge_to_installed", "agent_run_elapsed",
  "agent_work_seconds", "ci_job_service", "ci_envelope", "ci_workflow_span", "wait_interval"];
const METHOD_ENUM = ["nearest-rank/1", "weighted-ecdf/1"];
const SUPPORT_ENUM = ["descriptive", "uncalibrated-conditional", "calibrated", "insufficient-evidence"];

/** Regime fingerprint (section 6.4): every specified component present, unattested ones `unknown`. */
const fingerprint = () => closed({
  model: str, effort: str, reviewPolicy: str, workflowPath: str, configDigest: str,
  runner: str, toolchain: str, suiteShardSet: str, jobSet: str,
}, ["model", "effort", "reviewPolicy", "workflowPath", "configDigest",
  "runner", "toolchain", "suiteShardSet", "jobSet"]);

const windowSchema = () => closed({ from: instant, to: instant }, ["from", "to"]);

const manifestRef = () => closed({ ruleId: str, snapshotDigest: digest }, ["ruleId", "snapshotDigest"]);

const cohortRef = () => closed({ cohortKey: str, snapshotDigest: digest }, ["cohortKey", "snapshotDigest"]);

const seriesRef = () => closed({ seriesId: str, snapshotDigest: digest }, ["seriesId", "snapshotDigest"]);

const intString = { type: "string", pattern: INT_STRING_PATTERN };

/** Exact effective size as a reduced integer ratio (sections 4.3, 6.5). */
const nEff = () => closed({ numerator: intString, denominator: intString }, ["numerator", "denominator"]);

const quantileSet = () => closed({
  schema: { const: "engram.time-reference/quantile-set/1" },
  quantileMethod: { enum: METHOD_ENUM },
  support: { enum: SUPPORT_ENUM },
  calibrated: bool, sampleCount: int,
  nEff: nEff(),
  p50Seconds: nullableInt, p80Seconds: nullableInt, p95Seconds: nullableInt,
  maxSeconds: int, tailQualification: str, weightsPolicy: str,
}, ["schema", "quantileMethod", "support", "calibrated", "sampleCount", "nEff",
  "p50Seconds", "p80Seconds", "p95Seconds"]);

const idValue = { type: ["integer", "string"] };

const quarantineRecord = () => closed({ id: idValue, reason: nonEmptyString }, ["id", "reason"]);

const exclusionRecord = () => closed({ id: idValue, reason: nonEmptyString }, ["id", "reason"]);

const commitEvidence = () => closed(
  { sha: str, authoredAt: instant, committedAt: instant },
  ["sha", "authoredAt", "committedAt"],
);

const checkObject = () => closed({
  id: idValue, name: str, headSha: str, status: str, conclusion: str,
  startedAt: instant, completedAt: instant, url: str, checkSuiteId: idValue,
}, ["id", "name", "status", "conclusion", "startedAt", "completedAt"]);

const reviewerRun = () => closed(
  { runId: str, evidenceRefs: { type: "array", items: str } },
  ["runId", "evidenceRefs"],
);

const freshness = () => closed({
  window: windowSchema(), collectedAt: instant, referencePublishedAt: instant,
}, ["window", "collectedAt", "referencePublishedAt"]);

const profileRef = () => closed(
  { id: str, version: str, contentDigest: digest },
  ["id", "version", "contentDigest"],
);

const generator = () => closed({ name: str, version: str }, ["name", "version"]);

const mergeMilestone = () => closed({
  forecastAt: nullableInstant, mergedAt: nullableInstant,
  verdict: { enum: ["held", "missed", "pending", "not-claimed"] },
}, ["forecastAt", "mergedAt", "verdict"]);

const installMilestoneEntry = () => closed({
  targetId: nonEmptyString, forecastAt: nullableInstant,
  installedAt: { type: "string" },
  verdict: { enum: ["held", "missed", "unknown"] },
  receiptRef: str,
}, ["targetId", "forecastAt", "installedAt", "verdict"]);

const timingSeries = () => closed({
  schema: { const: "engram.time-reference/timing-series/1" },
  seriesId: str, subject: str,
  metric: { enum: METRIC_ENUM },
  cohortRef: cohortRef(), quantiles: quantileSet(),
  unit: { const: "second" }, window: windowSchema(),
  estimatorVersion: str, policyVersion: str, missingCount: int, censoredCount: int,
  exclusions: { type: "array", items: exclusionRecord() },
  fingerprint: fingerprint(), measured: bool,
}, ["schema", "seriesId", "subject", "metric", "cohortRef", "quantiles", "unit",
  "window", "estimatorVersion", "policyVersion", "missingCount", "censoredCount",
  "exclusions", "fingerprint", "measured"]);

const timingEstimate = () => closed({
  schema: { const: "engram.time-reference/timing-estimate/1" },
  estimateId: str, seriesRef: seriesRef(), quantiles: quantileSet(),
  applicability: { enum: ["applicable", "conditional-historical", "incomplete"] },
  freshness: freshness(),
  support: { enum: SUPPORT_ENUM },
  limitations: { type: "array", items: str },
}, ["schema", "estimateId", "seriesRef", "quantiles", "applicability", "freshness", "support", "limitations"]);

const timingBudget = () => closed({
  schema: { const: "engram.time-reference/timing-budget/1" },
  budgetId: str, subject: str, targetSeconds: int, boundSeconds: int,
  rationale: str, decisionRef: str, owner: str, revisitTrigger: str,
}, ["schema", "budgetId", "subject", "rationale", "decisionRef", "owner", "revisitTrigger"]);

const figureProvenance = () => closed({
  schema: { const: "engram.time-reference/figure-provenance/1" },
  figureRef: str, cohortKey: str, ruleId: str, snapshotDigest: digest,
  referenceDigest: digest, referencePublishedAt: instant, referencePublicationRevision: str,
  collectedAt: instant, firstAvailableAt: nullableInstant, appliesToRevision: str,
  fingerprintDigest: digest, estimatorVersion: str, policyVersion: str,
  quantileMethod: { enum: METHOD_ENUM },
}, ["schema", "figureRef", "cohortKey", "ruleId", "snapshotDigest", "referenceDigest",
  "referencePublishedAt", "referencePublicationRevision", "collectedAt",
  "firstAvailableAt", "appliesToRevision", "fingerprintDigest",
  "estimatorVersion", "policyVersion", "quantileMethod"]);

const deliveryMilestones = () => closed({
  schema: { const: "engram.time-reference/delivery-milestones/1" },
  repo, lotRef: str, forecastRevision: str,
  mergeSha: { type: ["string", "null"] },
  mergeMilestone: mergeMilestone(),
  installMilestones: { type: "array", items: installMilestoneEntry() },
}, ["schema", "repo", "lotRef", "forecastRevision", "mergeSha", "mergeMilestone", "installMilestones"]);

export const COLLECTION_MANIFEST_SCHEMA: JsonSchema = schema("CollectionManifestV1", {
  schema: { const: "engram.time-reference/collection-manifest/1" },
  ruleId: str, ruleVersion: str, repo, query: str, cutoff: instant, collectedAt: instant,
  firstAvailableAt: nullableInstant,
  historicalAvailability: { enum: ["attested", "unattested"] },
  pageSize: int, totalCount: nullableInt, hasNextPage: bool,
  inclusionIds: { type: "array", items: idValue }, exclusionIds: { type: "array", items: idValue },
  quarantine: { type: "array", items: quarantineRecord() },
  sourceRevision,
  sourceUrls: { type: "array", items: str }, snapshotDigest: digest,
}, ["schema", "ruleId", "ruleVersion", "repo", "query", "cutoff", "collectedAt",
  "firstAvailableAt", "historicalAvailability", "pageSize", "totalCount",
  "hasNextPage", "inclusionIds", "exclusionIds", "quarantine",
  "sourceRevision", "sourceUrls", "snapshotDigest"]);

export const PULL_REQUEST_TIMING_SCHEMA: JsonSchema = schema("PullRequestTimingV1", {
  schema: { const: "engram.time-reference/pull-request-timing/1" },
  repo, number: int, url: str, createdAt: instant, mergedAt: nullableInstant,
  headSha: str, mergeSha: str, firstCommitAt: nullableInstant,
  firstCommitPolicy: { const: "proxy-only-excluded-from-forecasts" },
  openToMergeSeconds: nullableInt,
  commits: { type: ["array", "null"], items: commitEvidence() },
  commitsCollectionState: { enum: ["not-collected", "collected", "unavailable"] },
}, ["schema", "repo", "number", "createdAt", "mergedAt", "firstCommitAt",
  "firstCommitPolicy", "openToMergeSeconds", "commits", "commitsCollectionState"]);

export const CI_CHECK_BATCH_SCHEMA: JsonSchema = schema("CiCheckBatchV1", {
  schema: { const: "engram.time-reference/ci-check-batch/1" },
  repo, number: int, headSha: str, source: str, collectedAt: instant,
  totalCount: int, pageSize: int, page: int, hasNextPage: bool,
  checks: { type: "array", items: checkObject() },
}, ["schema", "repo", "number", "headSha", "source", "collectedAt", "totalCount", "checks"]);

export const COHORT_SCHEMA: JsonSchema = schema("CohortV1", {
  schema: { const: "engram.time-reference/cohort/1" },
  cohortKey: str, repo,
  metric: { enum: METRIC_ENUM },
  manifestRef: manifestRef(),
  memberIds: { type: "array", items: idValue }, n: int,
  window: windowSchema(), fingerprint: fingerprint(), purpose: str,
}, ["schema", "cohortKey", "repo", "metric", "manifestRef", "memberIds", "n", "window", "fingerprint", "purpose"]);

export const QUANTILE_SET_SCHEMA: JsonSchema = schema("QuantileSetV1", {
  schema: { const: "engram.time-reference/quantile-set/1" },
  quantileMethod: { enum: METHOD_ENUM },
  support: { enum: SUPPORT_ENUM },
  calibrated: bool, sampleCount: int,
  nEff: nEff(),
  p50Seconds: nullableInt, p80Seconds: nullableInt, p95Seconds: nullableInt,
  maxSeconds: int, tailQualification: str, weightsPolicy: str,
}, ["schema", "quantileMethod", "support", "calibrated", "sampleCount", "nEff", "p50Seconds", "p80Seconds", "p95Seconds"]);

export const TIMING_SERIES_SCHEMA: JsonSchema = schema("TimingSeriesV1", {
  schema: { const: "engram.time-reference/timing-series/1" },
  seriesId: str, subject: str,
  metric: { enum: METRIC_ENUM },
  cohortRef: cohortRef(), quantiles: quantileSet(),
  unit: { const: "second" }, window: windowSchema(),
  estimatorVersion: str, policyVersion: str, missingCount: int, censoredCount: int,
  exclusions: { type: "array", items: exclusionRecord() },
  fingerprint: fingerprint(), measured: bool,
}, ["schema", "seriesId", "subject", "metric", "cohortRef", "quantiles", "unit",
  "window", "estimatorVersion", "policyVersion", "missingCount", "censoredCount",
  "exclusions", "fingerprint", "measured"]);

export const TIMING_ESTIMATE_SCHEMA: JsonSchema = schema("TimingEstimateV1", {
  schema: { const: "engram.time-reference/timing-estimate/1" },
  estimateId: str, seriesRef: seriesRef(), quantiles: quantileSet(),
  applicability: { enum: ["applicable", "conditional-historical", "incomplete"] },
  freshness: freshness(),
  support: { enum: SUPPORT_ENUM },
  limitations: { type: "array", items: str },
}, ["schema", "estimateId", "seriesRef", "quantiles", "applicability", "freshness", "support", "limitations"]);

export const TIMING_BUDGET_SCHEMA: JsonSchema = schema("TimingBudgetV1", {
  schema: { const: "engram.time-reference/timing-budget/1" },
  budgetId: str, subject: str, targetSeconds: int, boundSeconds: int,
  rationale: str, decisionRef: str, owner: str, revisitTrigger: str,
}, ["schema", "budgetId", "subject", "rationale", "decisionRef", "owner", "revisitTrigger"]);

export const FIGURE_PROVENANCE_SCHEMA: JsonSchema = schema("FigureProvenanceV1", {
  schema: { const: "engram.time-reference/figure-provenance/1" },
  figureRef: str, cohortKey: str, ruleId: str, snapshotDigest: digest,
  referenceDigest: digest, referencePublishedAt: instant, referencePublicationRevision: str,
  collectedAt: instant, firstAvailableAt: nullableInstant, appliesToRevision: str,
  fingerprintDigest: digest, estimatorVersion: str, policyVersion: str,
  quantileMethod: { enum: METHOD_ENUM },
}, ["schema", "figureRef", "cohortKey", "ruleId", "snapshotDigest", "referenceDigest",
  "referencePublishedAt", "referencePublicationRevision", "collectedAt",
  "firstAvailableAt", "appliesToRevision", "fingerprintDigest",
  "estimatorVersion", "policyVersion", "quantileMethod"]);

export const DELIVERY_MILESTONES_SCHEMA: JsonSchema = schema("DeliveryMilestonesV1", {
  schema: { const: "engram.time-reference/delivery-milestones/1" },
  repo, lotRef: str, forecastRevision: str,
  mergeSha: { type: ["string", "null"] },
  mergeMilestone: mergeMilestone(),
  installMilestones: { type: "array", items: installMilestoneEntry() },
}, ["schema", "repo", "lotRef", "forecastRevision", "mergeSha", "mergeMilestone", "installMilestones"]);

export const INSTALLATION_RECEIPT_SCHEMA: JsonSchema = schema("InstallationReceiptV1", {
  schema: { const: "engram.time-reference/installation-receipt/1" },
  repo, lotOccurrence: str, mergeSha: str, releaseSourceSha: str, ancestryEvidence: str,
  targetId: str, targetKind: { enum: ["ci-runner", "delivery-environment"] },
  platform: str, installationScope: str, expectedVersion: str, observedVersion: str,
  expectedTuple: str, observedTuple: str, artifactIntegrity: digest, resolvedExecutable: str,
  installStartedAt: instant, installCompletedAt: instant, smokeCompletedAt: instant,
  installOutcome: { enum: ["success", "failure"] }, smokeOutcome: { enum: ["success", "failure"] },
  clockSource: str, producerIdentity: str, evidenceDigests: { type: "array", items: digest },
}, ["schema", "repo", "lotOccurrence", "mergeSha", "releaseSourceSha", "ancestryEvidence",
  "targetId", "targetKind", "platform", "installationScope", "expectedVersion",
  "observedVersion", "expectedTuple", "observedTuple", "artifactIntegrity",
  "resolvedExecutable", "installStartedAt", "installCompletedAt", "smokeCompletedAt",
  "installOutcome", "smokeOutcome", "clockSource", "producerIdentity", "evidenceDigests"]);

export const COMMITTED_EXPORT_SCHEMA: JsonSchema = schema("CommittedExportV1", {
  schema: { const: "engram.time-reference/committed-export/1" },
  repo, serviceRevision: str,
  profileRef: profileRef(), window: windowSchema(), generatedAt: instant,
  generator: generator(),
  series: { type: "array", items: timingSeries() },
  estimates: { type: "array", items: timingEstimate() },
  budgets: { type: "array", items: timingBudget() },
  milestones: { type: "array", items: deliveryMilestones() },
  provenance: { type: "array", items: figureProvenance() },
  exportDigest: digest,
}, ["schema", "repo", "serviceRevision", "profileRef", "window", "generatedAt",
  "generator", "series", "estimates", "budgets", "milestones", "provenance", "exportDigest"]);

export const REVIEW_WAVE_MANIFEST_SCHEMA: JsonSchema = schema("ReviewWaveManifestV1", {
  schema: { const: "engram.time-reference/review-wave-manifest/1" },
  repo, lotOccurrence: str, roundId: str, candidateRevision: str,
  submittedAt: nullableInstant,
  submissionEvidenceRefs: { type: "array", items: str },
  requestEvidenceRefs: { type: "array", items: str },
  reviewerRuns: { type: "array", items: reviewerRun() },
  resultEvidenceRefs: { type: "array", items: str },
  closureEvidenceRefs: { type: "array", items: str },
  closedAt: nullableInstant,
}, ["schema", "repo", "lotOccurrence", "roundId", "candidateRevision", "submittedAt",
  "submissionEvidenceRefs", "requestEvidenceRefs", "reviewerRuns",
  "resultEvidenceRefs", "closureEvidenceRefs", "closedAt"]);

export const REVIEW_ROUNDS_ACTUAL_SCHEMA: JsonSchema = schema("ReviewRoundsActualV1", {
  schema: { const: "engram.time-reference/review-rounds-actual/1" },
  repo, lotOccurrence: str, convention: { const: "review-round/1" },
  status: { enum: ["complete", "partial", "unknown"] },
  completedCount: nullableInt,
  openRoundIds: { type: "array", items: str },
  reviewerRunCount: nullableInt,
  roundIds: { type: "array", items: str },
  coverageManifestRef: { type: ["string", "null"] },
  evidenceRefs: { type: "array", items: str }, missingReason: str,
}, ["schema", "repo", "lotOccurrence", "convention", "status", "completedCount",
  "openRoundIds", "reviewerRunCount", "roundIds", "coverageManifestRef", "evidenceRefs"]);

/** All section 6 schemas keyed by DTO title. */
export const TIMING_SCHEMAS: Record<string, JsonSchema> = {
  CollectionManifestV1: COLLECTION_MANIFEST_SCHEMA,
  PullRequestTimingV1: PULL_REQUEST_TIMING_SCHEMA,
  CiCheckBatchV1: CI_CHECK_BATCH_SCHEMA,
  CohortV1: COHORT_SCHEMA,
  QuantileSetV1: QUANTILE_SET_SCHEMA,
  TimingSeriesV1: TIMING_SERIES_SCHEMA,
  TimingEstimateV1: TIMING_ESTIMATE_SCHEMA,
  TimingBudgetV1: TIMING_BUDGET_SCHEMA,
  FigureProvenanceV1: FIGURE_PROVENANCE_SCHEMA,
  DeliveryMilestonesV1: DELIVERY_MILESTONES_SCHEMA,
  InstallationReceiptV1: INSTALLATION_RECEIPT_SCHEMA,
  CommittedExportV1: COMMITTED_EXPORT_SCHEMA,
  ReviewWaveManifestV1: REVIEW_WAVE_MANIFEST_SCHEMA,
  ReviewRoundsActualV1: REVIEW_ROUNDS_ACTUAL_SCHEMA,
};
