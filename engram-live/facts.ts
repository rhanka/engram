// @sentropic/engram-live/facts — L3a-E1 fact-kind registry, re-exports and
// pure producer-to-fact helpers
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md
// §§12.3, 17.4; plan/09 L3a-E1).
//
// Placement rule (plan/09 round 2): the DTO types, closed union and pure
// validators live in ./contracts.js so /contracts stays strictly import-free.
// This module imports and re-exports them, holds the authoritative fact-kind
// registry (every LiveFactKind registered 1-to-1) and provides pure helpers
// that convert delivered producer records into typed LiveFactDto values.
//
// Neutrality: imports ONLY in-package neutral modules (./contracts.js,
// ./analysis-cache.js, ./code-analysis.js, ./comparisons.js) and node:crypto.

import { createHash } from "node:crypto";
import {
  ANALYSIS_EXTRACTOR_VERSION,
  L5_RESOLVER_VERSION,
} from "./analysis-cache.js";
import {
  resolveAnalysisDialect,
  type AnalyzeCodeInput,
  type AnalyzeCodeOutcome,
  type GrammarStatusDto,
} from "./code-analysis.js";
import {
  COMPARISON_COMPARATOR_VERSION,
  type BranchComparisonOutcome,
  type DerivedDiffDto,
} from "./comparisons.js";
import {
  ACTIVITY_SIGNAL_KINDS,
  BATCH_CODEC_VERSION,
  BATCH_POLICY_VERSIONS,
  BRANCH_DIFF_ALGORITHMS,
  CODE_ANALYSIS_STATES,
  CODE_RELATION_ROLES,
  CODE_UNRESOLVED_KINDS,
  COMPARISON_BASE_SOURCES,
  COMPARISON_KINDS,
  COMPARISON_STATES,
  CONTENT_POLICY_VERSION,
  COVERAGE_FACT_AXES,
  COVERAGE_FACT_STATES,
  DIFF_CHANGE_KINDS,
  FACT_SCHEMA_VERSION,
  GIT_FILE_CHANGE_STATUSES,
  LINE_ATTRIBUTION_GAP_CAUSES,
  LIVE_FACT_KINDS,
  MAX_FACT_BATCH_BYTES,
  POLICY_VERSION,
  PROGRESS_FACT_KINDS,
  REF_KINDS,
  STRUCTURAL_L4B_FACT_KINDS,
  SYMBOL_CORRESPONDENCE_REASONS,
  SYMBOL_CORRESPONDENCE_RELATIONS,
  SYMBOL_HISTORY_GAP_CAUSES,
  TAGGED_FACT_KINDS,
  classifyLiveFactKind,
  isBatchPolicyVersion,
  isFactBatchDto,
  isLiveFactDto,
  parseFactBatch,
  validateBranchComparisonFact,
  validateChangedFileFact,
  validateCodeAnalysisFact,
  validateCodeRelationFact,
  validateCommitFact,
  validateCoverageFact,
  validateFactBatch,
  validateLineAttributionFact,
  validateLiveFact,
  validateLocalCoverage,
  validateLocalSnapshot,
  validatePrAttributionFact,
  validateProgressFact,
  validatePullRequestObservationFact,
  validateReasonAnchorFact,
  validateRefObservationFact,
  validateRetentionReceiptFact,
  validateSealedLocalDiff,
  validateSymbolCorrespondenceFact,
  validateTrackedRefFact,
  type BatchPolicyVersion,
  type BranchComparisonBaseSource,
  type BranchComparisonDiffChangeFactDto,
  type BranchComparisonDiffFactDto,
  type BranchComparisonDiffOptionsFactDto,
  type BranchComparisonFactDto,
  type BranchComparisonKind,
  type BranchComparisonParentFactDto,
  type BranchComparisonState,
  type BranchDiffAlgorithm,
  type BranchDiffChangeKind,
  type ChangedFileFactDto,
  type CodeAnalysisFactDto,
  type CodeAnalysisFactState,
  type CodeRelationEndpointDto,
  type CodeRelationFactDto,
  type CodeRelationItemDto,
  type CodeRelationRole,
  type CodeSymbolFactDto,
  type CodeUnresolvedFactDto,
  type CodeUnresolvedKind,
  type CommitFactDto,
  type CoverageFactAxis,
  type CoverageFactDto,
  type CoverageFactState,
  type FactBatchDto,
  type GitFileChangeStatus,
  type HistoryCheckpointDto,
  type HistoryCheckpointProgressFactDto,
  type HistoryCommitFactDto,
  type LineAttributionFactDto,
  type LineAttributionOutcomeDto,
  type LiveFactDto,
  type LiveFactKind,
  type LocalCoverageReportDto,
  type LocalDiffDto,
  type LocalSnapshotDto,
  type OidAlgorithm,
  type PrAttributionDto,
  type PrAttributionFactDto,
  type PrCursorProgressFactDto,
  type PrObjectJobDto,
  type PrObjectJobProgressFactDto,
  type PrSyncCursorDto,
  type ProgressFactDto,
  type ProgressFactKind,
  type PullRequestFactDto,
  type PullRequestObservationFactDto,
  type QualifiedOid,
  type RawRefObservationDto,
  type ReasonAnchorFactDto,
  type ReasonAnchorPinDto,
  type ReconcileCheckpointProgressFactDto,
  type RefKind,
  type RefObservationFactDto,
  type RetainedRootDto,
  type RetainedRootProgressFactDto,
  type RetentionReceiptDto,
  type RetentionReceiptFactDto,
  type StructuralL4bFactKind,
  type SymbolCorrespondenceFactDto,
  type SymbolHistoryGapDto,
  type SymbolHistoryOutcomeDto,
  type TaggedFactKind,
  type TrackedRefDto,
  type TrackedRefFactDto,
  type ValidationResult,
} from "./contracts.js";

export {
  ACTIVITY_SIGNAL_KINDS,
  BATCH_CODEC_VERSION,
  BATCH_POLICY_VERSIONS,
  BRANCH_DIFF_ALGORITHMS,
  CODE_ANALYSIS_STATES,
  CODE_RELATION_ROLES,
  CODE_UNRESOLVED_KINDS,
  COMPARISON_BASE_SOURCES,
  COMPARISON_KINDS,
  COMPARISON_STATES,
  COVERAGE_FACT_AXES,
  COVERAGE_FACT_STATES,
  DIFF_CHANGE_KINDS,
  FACT_SCHEMA_VERSION,
  GIT_FILE_CHANGE_STATUSES,
  LINE_ATTRIBUTION_GAP_CAUSES,
  LIVE_FACT_KINDS,
  MAX_FACT_BATCH_BYTES,
  PROGRESS_FACT_KINDS,
  REF_KINDS,
  STRUCTURAL_L4B_FACT_KINDS,
  SYMBOL_CORRESPONDENCE_REASONS,
  SYMBOL_CORRESPONDENCE_RELATIONS,
  SYMBOL_HISTORY_GAP_CAUSES,
  TAGGED_FACT_KINDS,
  classifyLiveFactKind,
  isBatchPolicyVersion,
  isFactBatchDto,
  isLiveFactDto,
  parseFactBatch,
  validateBranchComparisonFact,
  validateChangedFileFact,
  validateCodeAnalysisFact,
  validateCodeRelationFact,
  validateCommitFact,
  validateCoverageFact,
  validateFactBatch,
  validateLineAttributionFact,
  validateLiveFact,
  validateLocalCoverage,
  validateLocalSnapshot,
  validatePrAttributionFact,
  validateProgressFact,
  validatePullRequestObservationFact,
  validateReasonAnchorFact,
  validateRefObservationFact,
  validateRetentionReceiptFact,
  validateSealedLocalDiff,
  validateSymbolCorrespondenceFact,
  validateTrackedRefFact,
  type BatchPolicyVersion,
  type BranchComparisonBaseSource,
  type BranchComparisonDiffChangeFactDto,
  type BranchComparisonDiffFactDto,
  type BranchComparisonDiffOptionsFactDto,
  type BranchComparisonFactDto,
  type BranchComparisonKind,
  type BranchComparisonParentFactDto,
  type BranchComparisonState,
  type BranchDiffAlgorithm,
  type BranchDiffChangeKind,
  type ChangedFileFactDto,
  type CodeAnalysisFactDto,
  type CodeAnalysisFactState,
  type CodeRelationEndpointDto,
  type CodeRelationFactDto,
  type CodeRelationItemDto,
  type CodeRelationRole,
  type CodeSymbolFactDto,
  type CodeUnresolvedFactDto,
  type CodeUnresolvedKind,
  type CommitFactDto,
  type CoverageFactAxis,
  type CoverageFactDto,
  type CoverageFactState,
  type FactBatchDto,
  type GitFileChangeStatus,
  type HistoryCheckpointProgressFactDto,
  type LineAttributionFactDto,
  type LiveFactDto,
  type LiveFactKind,
  type LocalCoverageReportDto,
  type LocalDiffDto,
  type LocalSnapshotDto,
  type PrAttributionFactDto,
  type PrCursorProgressFactDto,
  type PrObjectJobProgressFactDto,
  type ProgressFactDto,
  type ProgressFactKind,
  type PullRequestObservationFactDto,
  type ReasonAnchorFactDto,
  type ReasonAnchorPinDto,
  type ReconcileCheckpointProgressFactDto,
  type RefObservationFactDto,
  type RetainedRootProgressFactDto,
  type RetentionReceiptFactDto,
  type StructuralL4bFactKind,
  type SymbolCorrespondenceFactDto,
  type SymbolHistoryGapDto,
  type TaggedFactKind,
  type TrackedRefFactDto,
  type ValidationResult,
};

export { toReasonAnchorFact } from "./code-analysis.js";

export type FactPrivacyClass = "committed" | "private" | "metadata";
export type FactScopeLevel = "clone" | "worktree" | "either";

export interface FactKindDescriptor {
  readonly kind: LiveFactKind;
  readonly schemaVersion: typeof FACT_SCHEMA_VERSION;
  readonly structural: boolean;
  readonly privacy: FactPrivacyClass;
  readonly scopeLevel: FactScopeLevel;
  readonly producerLots: readonly string[];
  readonly validate: (fact: unknown) => ValidationResult;
}

/**
 * Authoritative closed registry of every LiveFactKind. Typed against the full
 * LiveFactKind union so adding a new fact kind in ./contracts.js forces a
 * matching registration here at compile time.
 */
export const LIVE_FACT_REGISTRY: Readonly<Record<LiveFactKind, FactKindDescriptor>> = Object.freeze({
  "ref-observation": Object.freeze({
    kind: "ref-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["L2b"],
    validate: validateRefObservationFact,
  }),
  "ref-state": Object.freeze({
    kind: "ref-state",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["L2b"],
    validate: validateTrackedRefFact,
  }),
  "commit": Object.freeze({
    kind: "commit",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["L2a", "L2b"],
    validate: validateCommitFact,
  }),
  "changed-file": Object.freeze({
    kind: "changed-file",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["L2a", "L2b"],
    validate: validateChangedFileFact,
  }),
  "pr-observation": Object.freeze({
    kind: "pr-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["P1"],
    validate: validatePullRequestObservationFact,
  }),
  "pr-attribution": Object.freeze({
    kind: "pr-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["P1"],
    validate: validatePrAttributionFact,
  }),
  "retention-receipt": Object.freeze({
    kind: "retention-receipt",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "metadata",
    scopeLevel: "clone",
    producerLots: ["R1"],
    validate: validateRetentionReceiptFact,
  }),
  "branch-comparison": Object.freeze({
    kind: "branch-comparison",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["L5"],
    validate: validateBranchComparisonFact,
  }),
  "code-analysis": Object.freeze({
    kind: "code-analysis",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "either",
    producerLots: ["L5", "L5-P"],
    validate: validateCodeAnalysisFact,
  }),
  "code-relation": Object.freeze({
    kind: "code-relation",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "either",
    producerLots: ["L5", "L5-P"],
    validate: validateCodeRelationFact,
  }),
  "line-attribution": Object.freeze({
    kind: "line-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["G1"],
    validate: validateLineAttributionFact,
  }),
  "symbol-correspondence": Object.freeze({
    kind: "symbol-correspondence",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["G2"],
    validate: validateSymbolCorrespondenceFact,
  }),
  "reason-anchor": Object.freeze({
    kind: "reason-anchor",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "committed",
    scopeLevel: "clone",
    producerLots: ["G3"],
    validate: validateReasonAnchorFact,
  }),
  "coverage": Object.freeze({
    kind: "coverage",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "metadata",
    scopeLevel: "either",
    producerLots: ["L2b", "R1", "P1", "L5", "L6b", "G1", "G2"],
    validate: validateCoverageFact,
  }),
  "progress": Object.freeze({
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: false,
    privacy: "metadata",
    scopeLevel: "either",
    producerLots: ["L2b", "P1", "L6b"],
    validate: validateProgressFact,
  }),
  "local-diff": Object.freeze({
    kind: "local-diff",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: true,
    privacy: "private",
    scopeLevel: "worktree",
    producerLots: ["L4b"],
    validate: validateSealedLocalDiff,
  }),
  "local-snapshot": Object.freeze({
    kind: "local-snapshot",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: true,
    privacy: "private",
    scopeLevel: "worktree",
    producerLots: ["L4b"],
    validate: validateLocalSnapshot,
  }),
  "local-coverage": Object.freeze({
    kind: "local-coverage",
    schemaVersion: FACT_SCHEMA_VERSION,
    structural: true,
    privacy: "metadata",
    scopeLevel: "worktree",
    producerLots: ["L4b"],
    validate: validateLocalCoverage,
  }),
});

const PRIVATE_CODE_ANALYSIS_DESCRIPTOR: FactKindDescriptor = Object.freeze({
  ...LIVE_FACT_REGISTRY["code-analysis"],
  privacy: "private",
});

const PRIVATE_CODE_RELATION_DESCRIPTOR: FactKindDescriptor = Object.freeze({
  ...LIVE_FACT_REGISTRY["code-relation"],
  privacy: "private",
});

function isPrivateCodeAnalysisFact(fact: CodeAnalysisFactDto): boolean {
  return (
    fact.snapshotId != null ||
    fact.worktreeId != null ||
    fact.tree == null ||
    fact.policyVersion === CONTENT_POLICY_VERSION ||
    fact.policyVersion !== POLICY_VERSION ||
    !Array.isArray(fact.symbols) ||
    fact.symbols.some((symbol) => symbol == null || symbol.tree == null) ||
    !Array.isArray(fact.relations) ||
    fact.relations.some(
      (relation) =>
        relation == null ||
        relation.source == null ||
        relation.target == null ||
        relation.source.tree == null ||
        relation.target.tree == null,
    )
  );
}

function isPrivateCodeRelationFact(fact: CodeRelationFactDto): boolean {
  return (
    fact.source == null ||
    fact.target == null ||
    fact.source.tree == null ||
    fact.target.tree == null ||
    fact.policyVersion === CONTENT_POLICY_VERSION ||
    fact.policyVersion !== POLICY_VERSION
  );
}

/** Own-property lookup into the closed fact-kind registry (refuses prototype names). */
export function getFactKindDescriptor(kind: string): FactKindDescriptor | undefined {
  if (!Object.prototype.hasOwnProperty.call(LIVE_FACT_REGISTRY, kind)) return undefined;
  return LIVE_FACT_REGISTRY[kind as LiveFactKind];
}

export function listFactKindDescriptors(): readonly FactKindDescriptor[] {
  return LIVE_FACT_KINDS.map((kind) => LIVE_FACT_REGISTRY[kind]);
}

/**
 * Compute instance-level privacy classification for a LiveFactDto.
 * Dual-scope ("either") code-analysis and code-relation facts report "private"
 * when bound to a snapshot or worktree, tree-less, or carrying the local
 * content policy (LIVE §§8, 10; SPEC_L3A §12.4), and "committed" when bound to
 * a committed tree under the committed policy.
 */
export function classifyFactPrivacy(fact: LiveFactDto): FactPrivacyClass {
  const kind = classifyLiveFactKind(fact);
  if (kind === null) {
    throw new Error("classifyFactPrivacy received an unrecognized fact shape");
  }
  if (kind === "code-analysis") {
    return isPrivateCodeAnalysisFact(fact as CodeAnalysisFactDto) ? "private" : "committed";
  }
  if (kind === "code-relation") {
    return isPrivateCodeRelationFact(fact as CodeRelationFactDto) ? "private" : "committed";
  }
  return LIVE_FACT_REGISTRY[kind].privacy;
}

export function describeFact(fact: LiveFactDto): FactKindDescriptor {
  const kind = classifyLiveFactKind(fact);
  if (kind === null) {
    throw new Error("describeFact received an unrecognized fact shape");
  }
  if (kind === "code-analysis" && isPrivateCodeAnalysisFact(fact as CodeAnalysisFactDto)) {
    return PRIVATE_CODE_ANALYSIS_DESCRIPTOR;
  }
  if (kind === "code-relation" && isPrivateCodeRelationFact(fact as CodeRelationFactDto)) {
    return PRIVATE_CODE_RELATION_DESCRIPTOR;
  }
  return LIVE_FACT_REGISTRY[kind];
}

export function validateFactWithRegistry(fact: unknown): ValidationResult {
  const kind = classifyLiveFactKind(fact);
  if (kind === null) {
    return { ok: false, errors: ["unknown or unrecognized fact kind: refused"] };
  }
  return LIVE_FACT_REGISTRY[kind].validate(fact);
}

// — Pure producer-to-fact adapters (preserve delivered producer bytes without modifying producers).

function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function isZeroHexOid(oid: string): boolean {
  return /^0+$/.test(oid);
}

function qualifyOrNull(algorithm: OidAlgorithm, oid: string): QualifiedOid | null {
  return isZeroHexOid(oid) ? null : { algorithm, oid };
}

/** Deterministic opaque ref-observation identity binding clone, ref, observation and generation. */
export function deriveRefObservationId(
  cloneId: string,
  observation: RawRefObservationDto,
  generation: number,
): string {
  const key = JSON.stringify([
    "refobs/1",
    cloneId,
    observation.refName,
    observation.absent === true,
    observation.oid,
    observation.observedAt,
    generation,
    observation.tipCommitterUnixSeconds ?? null,
  ]);
  return `refobs:${sha256Hex(key)}`;
}

/** Deterministic opaque PR-observation identity binding clone and complete observation tuple. */
export function derivePrObservationId(cloneId: string, fact: PullRequestFactDto): string {
  const key = JSON.stringify([
    "probs/1",
    cloneId,
    fact.repositoryOwner,
    fact.repositoryRepo,
    fact.number,
    fact.state,
    fact.isDraft,
    fact.updatedAt,
    fact.headOid.algorithm,
    fact.headOid.oid,
    fact.headRef,
    fact.baseOid.algorithm,
    fact.baseOid.oid,
    fact.baseRef,
    fact.mergeOid ? [fact.mergeOid.algorithm, fact.mergeOid.oid] : null,
    fact.mergeStrategy ?? null,
  ]);
  return `probs:${sha256Hex(key)}`;
}

export function toRefObservationFact(
  cloneId: string,
  algorithm: OidAlgorithm,
  refKind: RefKind,
  observation: RawRefObservationDto,
  generation: number,
): RefObservationFactDto {
  const absent = observation.absent === true;
  const fact: RefObservationFactDto = {
    kind: "ref-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    observationId: deriveRefObservationId(cloneId, observation, generation),
    cloneId,
    refName: observation.refName,
    refKind,
    algorithm,
    target: absent ? null : { algorithm, oid: observation.oid },
    observedAt: observation.observedAt,
    absent,
    generation,
    ...(observation.tipCommitterUnixSeconds !== undefined
      ? { tipCommitterUnixSeconds: observation.tipCommitterUnixSeconds }
      : {}),
  };
  return fact;
}

export function toTrackedRefFact(
  cloneId: string,
  algorithm: OidAlgorithm,
  tracked: TrackedRefDto,
): TrackedRefFactDto {
  return {
    kind: "ref-state",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId,
    refName: tracked.refName,
    refKind: tracked.kind,
    target: tracked.oid === null ? null : { algorithm, oid: tracked.oid },
    generation: tracked.generation,
    activity: tracked.activity ? { ...tracked.activity } : null,
    deletedAt: tracked.deletedAt,
    lastObservedAt: tracked.lastObservedAt,
  };
}

export function toCommitAndChangedFileFacts(fact: HistoryCommitFactDto): {
  readonly commit: CommitFactDto;
  readonly changedFiles: readonly ChangedFileFactDto[];
} {
  const alg = fact.algorithm;
  const commitOid: QualifiedOid = { algorithm: alg, oid: fact.oid };
  const parents: QualifiedOid[] = fact.parents.map((oid) => ({ algorithm: alg, oid }));
  const commit: CommitFactDto = {
    kind: "commit",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: fact.cloneId,
    commit: commitOid,
    tree: { algorithm: alg, oid: fact.tree },
    parents,
    author: { ...fact.author },
    committer: { ...fact.committer },
    subject: fact.subject,
    message: Uint8Array.from(fact.message),
    extractorVersion: fact.extractorVersion,
    policyVersion: fact.policyVersion,
  };
  const changedFiles: ChangedFileFactDto[] = [];
  for (const parentDiff of fact.parentDiffs) {
    const parentCommit =
      parentDiff.parentIndex === -1 ? null : (parents[parentDiff.parentIndex] ?? null);
    for (const file of parentDiff.files) {
      changedFiles.push({
        kind: "changed-file",
        schemaVersion: FACT_SCHEMA_VERSION,
        cloneId: fact.cloneId,
        commit: commitOid,
        parentIndex: parentDiff.parentIndex,
        parentCommit,
        path: Uint8Array.from(file.path),
        previousPath: file.previousPath === null ? null : Uint8Array.from(file.previousPath),
        status: file.status as GitFileChangeStatus,
        statusScore: file.statusScore,
        oldMode: file.oldMode,
        newMode: file.newMode,
        oldBlob: qualifyOrNull(alg, file.oldOid),
        newBlob: qualifyOrNull(alg, file.newOid),
        added: file.added,
        deleted: file.deleted,
        extractorVersion: fact.extractorVersion,
        policyVersion: fact.policyVersion,
      });
    }
  }
  return { commit, changedFiles };
}

export function toPullRequestObservationFact(
  cloneId: string,
  fact: PullRequestFactDto,
): PullRequestObservationFactDto {
  return {
    kind: "pr-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    observationId: derivePrObservationId(cloneId, fact),
    cloneId,
    repositoryOwner: fact.repositoryOwner,
    repositoryRepo: fact.repositoryRepo,
    number: fact.number,
    state: fact.state,
    isDraft: fact.isDraft,
    updatedAt: fact.updatedAt,
    headOid: { ...fact.headOid },
    headRef: fact.headRef,
    baseOid: { ...fact.baseOid },
    baseRef: fact.baseRef,
    ...(fact.mergeOid !== undefined ? { mergeOid: fact.mergeOid ? { ...fact.mergeOid } : null } : {}),
    ...(fact.mergeStrategy !== undefined ? { mergeStrategy: fact.mergeStrategy } : {}),
  };
}

export function toPrAttributionFact(
  cloneId: string,
  attribution: PrAttributionDto,
): PrAttributionFactDto {
  return {
    kind: "pr-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId,
    repositoryOwner: attribution.repositoryOwner,
    repositoryRepo: attribution.repositoryRepo,
    prNumber: attribution.prNumber,
    baseOid: attribution.baseOid ? { ...attribution.baseOid } : null,
    headOid: { ...attribution.headOid },
    mergeBaseOids: attribution.mergeBaseOids.map((oid) => ({ ...oid })),
    ...(attribution.mergeOid !== undefined
      ? { mergeOid: attribution.mergeOid ? { ...attribution.mergeOid } : null }
      : {}),
    mergeStrategy: attribution.mergeStrategy,
    status: attribution.status,
    reason: attribution.reason,
  };
}

export function toRetentionReceiptFact(receipt: RetentionReceiptDto): RetentionReceiptFactDto {
  return {
    kind: "retention-receipt",
    schemaVersion: FACT_SCHEMA_VERSION,
    scope: { tenant: receipt.scope.tenant, clone: receipt.scope.clone },
    target: { algorithm: receipt.algorithm, oid: receipt.oid },
    receivedAt: receipt.receivedAt,
    backupRef: receipt.backupRef,
  };
}

export function toLineAttributionFact(outcome: LineAttributionOutcomeDto): LineAttributionFactDto {
  return {
    kind: "line-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: outcome.scope.clone,
    target: { ...outcome.target },
    path: Uint8Array.from(outcome.path),
    ranges: outcome.ranges.map((range) => ({ ...range })),
    policyVersion: outcome.policyVersion,
    options: { ...outcome.options },
    calculationVersion: outcome.calculationVersion,
    gitVersion: outcome.gitVersion,
    retainedRoot: outcome.retainedRoot ? { ...outcome.retainedRoot } : null,
    state: outcome.state,
    origins: outcome.origins.map((origin) => ({
      commit: { ...origin.commit },
      author: {
        ...origin.author,
        ...(origin.author.nameBytes ? { nameBytes: Uint8Array.from(origin.author.nameBytes) } : {}),
        ...(origin.author.emailBytes ? { emailBytes: Uint8Array.from(origin.author.emailBytes) } : {}),
      },
      path: Uint8Array.from(origin.path),
      originalRange: { ...origin.originalRange },
      finalRange: { ...origin.finalRange },
    })),
    parentEvidence: outcome.parentEvidence.map((pe) => ({
      commit: { ...pe.commit },
      parents: pe.parents.map((p) => ({ ...p })),
    })),
    gaps: outcome.coverage.gaps.map((gap) => ({ ...gap })),
  };
}

export function toSymbolCorrespondenceFact(outcome: SymbolHistoryOutcomeDto): SymbolCorrespondenceFactDto {
  return {
    kind: "symbol-correspondence",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: outcome.scope.clone,
    before: { ...outcome.before },
    after: { ...outcome.after },
    policyVersion: outcome.policyVersion,
    options: { ...outcome.options },
    calculationVersion: outcome.calculationVersion,
    extractorVersion: outcome.extractorVersion,
    state: outcome.state,
    correspondences: outcome.correspondences.map((item) => ({
      before: item.before.map((anchor) => ({
        ...anchor,
        commit: { ...anchor.commit },
        tree: { ...anchor.tree },
        blob: { ...anchor.blob },
        path: Uint8Array.from(anchor.path),
        range: anchor.range ? { ...anchor.range } : null,
      })),
      after: item.after.map((anchor) => ({
        ...anchor,
        commit: { ...anchor.commit },
        tree: { ...anchor.tree },
        blob: { ...anchor.blob },
        path: Uint8Array.from(anchor.path),
        range: anchor.range ? { ...anchor.range } : null,
      })),
      relation: item.relation,
      reason: item.reason,
      similarity: item.similarity,
    })),
    parentEvidence: outcome.parentEvidence.map((pe) => ({
      commit: { ...pe.commit },
      parents: pe.parents.map((p) => ({ ...p })),
    })),
    gaps: outcome.coverage.gaps.map((gap) => ({ ...gap })),
  };
}

export function toHistoryCheckpointProgressFact(
  checkpoint: HistoryCheckpointDto,
): HistoryCheckpointProgressFactDto {
  const alg = checkpoint.algorithm;
  return {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "history-checkpoint",
    cloneId: checkpoint.cloneId,
    commit: { algorithm: alg, oid: checkpoint.oid },
    tree: { algorithm: alg, oid: checkpoint.tree },
    parents: checkpoint.parents.map((oid) => ({ algorithm: alg, oid })),
    extractorVersion: checkpoint.extractorVersion,
    policyVersion: checkpoint.policyVersion,
  };
}

export function toRetainedRootProgressFact(root: RetainedRootDto): RetainedRootProgressFactDto {
  return {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "retained-root",
    cloneId: root.cloneId,
    root: { algorithm: root.algorithm, oid: root.oid },
    firstSeenAt: root.firstSeenAt,
    firstSignal: root.firstSignal,
    refName: root.refName,
  };
}

export function toPrCursorProgressFact(
  cloneId: string,
  cursor: PrSyncCursorDto,
): PrCursorProgressFactDto {
  return {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "pr-cursor",
    cloneId,
    cursor: {
      ...cursor,
      ...(cursor.etagsByCursor !== undefined
        ? { etagsByCursor: cursor.etagsByCursor ? { ...cursor.etagsByCursor } : null }
        : {}),
      ...(cursor.pendingRetry !== undefined
        ? { pendingRetry: cursor.pendingRetry ? { ...cursor.pendingRetry } : null }
        : {}),
    },
  };
}

export function toPrObjectJobProgressFact(
  cloneId: string,
  job: PrObjectJobDto,
): PrObjectJobProgressFactDto {
  return {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "pr-object-job",
    cloneId,
    job: {
      ...job,
      headOid: { ...job.headOid },
      ...(job.acquiredOid !== undefined
        ? { acquiredOid: job.acquiredOid ? { ...job.acquiredOid } : null }
        : {}),
    },
  };
}

function decodeDiffPathBytes(
  path: string | null,
  encoding: DerivedDiffDto["pathEncoding"],
): Uint8Array | null {
  if (path === null) return null;
  const buf = Buffer.from(path, encoding === "base64url" ? "base64url" : "utf8");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).slice();
}

function toBranchComparisonDiffFact(diff: DerivedDiffDto): BranchComparisonDiffFactDto {
  return {
    beforeTree: { algorithm: diff.beforeTree.algorithm, oid: diff.beforeTree.oid },
    afterTree: { algorithm: diff.afterTree.algorithm, oid: diff.afterTree.oid },
    parentIndex: diff.parentIndex,
    comparatorVersion: diff.comparatorVersion,
    gitVersion: diff.gitVersion,
    objectFormat: diff.objectFormat,
    options: {
      algorithm: diff.options.algorithm as BranchDiffAlgorithm,
      binaryDetection: diff.options.binaryDetection as boolean,
      renameLimit: diff.options.renameLimit as number,
      renameThreshold: diff.options.renameThreshold as number,
    },
    changes: diff.changes.map((change) => ({
      beforePath: decodeDiffPathBytes(change.beforePath, diff.pathEncoding),
      afterPath: decodeDiffPathBytes(change.afterPath, diff.pathEncoding),
      beforeMode: change.beforeMode,
      afterMode: change.afterMode,
      changeKind: change.changeKind,
      renameEvidence: change.renameEvidence,
      binary: change.binary,
      insertions: change.insertions,
      deletions: change.deletions,
    })),
  };
}

export function toBranchComparisonFact(
  cloneId: string,
  outcome: BranchComparisonOutcome,
  options?: {
    readonly comparatorVersion?: string;
    readonly gitVersion?: string | null;
    readonly policyVersion?: string;
  },
): BranchComparisonFactDto {
  const firstDiff =
    outcome.diffs[0] ?? outcome.perParent.find((entry) => entry.diff !== null)?.diff ?? null;
  const comparatorVersion =
    options?.comparatorVersion ?? firstDiff?.comparatorVersion ?? COMPARISON_COMPARATOR_VERSION;
  const gitVersion =
    options?.gitVersion !== undefined ? options.gitVersion : (firstDiff?.gitVersion ?? null);
  return {
    kind: "branch-comparison",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId,
    comparisonKind: outcome.kind,
    state: outcome.state,
    baseTip: { algorithm: outcome.baseTip.algorithm, oid: outcome.baseTip.oid },
    branchTip: { algorithm: outcome.branchTip.algorithm, oid: outcome.branchTip.oid },
    mergeBases: outcome.mergeBases.map((mb) => ({ algorithm: mb.algorithm, oid: mb.oid })),
    baseSource: outcome.baseSource,
    comparatorVersion,
    gitVersion,
    policyVersion: options?.policyVersion ?? POLICY_VERSION,
    perParent: outcome.perParent.map((entry) => ({
      parentIndex: entry.parentIndex,
      parent: { algorithm: entry.parent.algorithm, oid: entry.parent.oid },
      target: entry.target ? { algorithm: entry.target.algorithm, oid: entry.target.oid } : null,
      state: entry.state,
      reason: entry.reason,
      diff: entry.diff ? toBranchComparisonDiffFact(entry.diff) : null,
    })),
    diffs: outcome.diffs.map(toBranchComparisonDiffFact),
  };
}

export interface CodeAnalysisFactGrammarEvidence {
  readonly version: string | null;
  readonly digest?: string | null;
  readonly grammarId?: string | null;
}

function qualifyHexOid(oid: string | null): QualifiedOid | null {
  if (oid === null) return null;
  return { algorithm: oid.length === 64 ? "sha256" : "sha1", oid };
}

function cloneQualifiedOid(oid: QualifiedOid | null): QualifiedOid | null {
  return oid === null ? null : { algorithm: oid.algorithm, oid: oid.oid };
}

export function toCodeAnalysisFact(
  input: AnalyzeCodeInput,
  outcome: AnalyzeCodeOutcome,
  grammar: Pick<GrammarStatusDto, "version" | "digest" | "grammarId"> | CodeAnalysisFactGrammarEvidence | null,
  options?: {
    readonly blob?: QualifiedOid | null;
    readonly commit?: QualifiedOid | null;
    readonly dialect?: string;
    readonly pathBytes?: Uint8Array;
    readonly extractorVersion?: string;
    readonly resolverVersion?: string;
    readonly policyVersion?: string;
  },
): CodeAnalysisFactDto {
  const tree = qualifyHexOid(input.treeOid);
  const commit = options?.commit !== undefined ? cloneQualifiedOid(options.commit) : undefined;
  const extractorVersion = options?.extractorVersion ?? ANALYSIS_EXTRACTOR_VERSION;
  const resolverVersion = options?.resolverVersion ?? L5_RESOLVER_VERSION;
  const policyVersion =
    options?.policyVersion ?? input.policyVersion ?? input.contentPolicyVersion ?? POLICY_VERSION;
  const dialect = options?.dialect ?? resolveAnalysisDialect(input.path, input.language).dialect;
  const toPathBytes = (path: string): Uint8Array =>
    path === input.path && options?.pathBytes !== undefined
      ? Uint8Array.from(options.pathBytes)
      : new Uint8Array(Buffer.from(path, "utf8"));
  const grammarVersion =
    grammar === null
      ? null
      : outcome.state === "unavailable" && grammar.version === ""
        ? null
        : grammar.version;
  const slotBySymbolId = new Map(outcome.symbols.map((sym) => [sym.id, sym.slot]));

  const relations: CodeRelationItemDto[] = [
    ...outcome.calls.map((call): CodeRelationItemDto => ({
      relationId: call.id,
      role: "calls",
      source: {
        symbolId: call.from,
        slot: slotBySymbolId.get(call.from) ?? call.slot,
        path: toPathBytes(call.path),
        tree: cloneQualifiedOid(tree),
        ...(commit !== undefined ? { commit: cloneQualifiedOid(commit) } : {}),
      },
      target: {
        symbolId: call.target,
        slot: call.targetSlot,
        path: toPathBytes(call.path),
        tree: cloneQualifiedOid(tree),
        ...(commit !== undefined ? { commit: cloneQualifiedOid(commit) } : {}),
      },
      external: call.external,
      extractorVersion,
      resolverVersion,
    })),
    ...outcome.inheritances.map((edge): CodeRelationItemDto => ({
      relationId: edge.id,
      role: "inherits",
      source: {
        symbolId: edge.child,
        slot: slotBySymbolId.get(edge.child) ?? edge.slot,
        path: toPathBytes(edge.path),
        tree: cloneQualifiedOid(tree),
        ...(commit !== undefined ? { commit: cloneQualifiedOid(commit) } : {}),
      },
      target: {
        symbolId: edge.parent,
        slot: slotBySymbolId.get(edge.parent) ?? edge.parent,
        path: toPathBytes(edge.path),
        tree: cloneQualifiedOid(tree),
        ...(commit !== undefined ? { commit: cloneQualifiedOid(commit) } : {}),
      },
      external: !slotBySymbolId.has(edge.parent),
      extractorVersion,
      resolverVersion,
    })),
  ];

  return {
    kind: "code-analysis",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: input.scope.clone,
    worktreeId: input.worktreeId ?? null,
    snapshotId: input.snapshotId ?? null,
    tree: cloneQualifiedOid(tree),
    blob: options?.blob ? cloneQualifiedOid(options.blob) : null,
    path: toPathBytes(input.path),
    language: input.language,
    dialect,
    state: outcome.state,
    topologyHash: outcome.topologyHash,
    contentHash: sha256Hex(input.content),
    configHash: input.configHash,
    dependencyHash: input.dependencyHash,
    grammarVersion,
    ...(grammar !== null && grammar.digest !== undefined ? { grammarDigest: grammar.digest } : {}),
    ...(grammar !== null && grammar.grammarId !== undefined ? { grammarId: grammar.grammarId } : {}),
    extractorVersion,
    resolverVersion,
    policyVersion,
    symbols: outcome.symbols.map((sym) => ({
      symbolId: sym.id,
      slot: sym.slot,
      name: sym.name,
      kind: sym.kind,
      bodyHash: sym.bodyHash,
      contentHash: sym.contentHash,
      path: toPathBytes(sym.path),
      tree: qualifyHexOid(sym.treeOid),
    })),
    relations,
    unresolved: outcome.unresolved.map((item) => ({
      unresolvedKind: item.kind,
      name: item.name,
      fromSymbolId: item.fromId,
      reason: item.reason,
    })),
  };
}
