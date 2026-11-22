// L3a-E1 — typed facts and canonical batch codec
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 13; spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md
// §§12.3, 17.4; plan/09-BRANCH_LIVE_GIT_INDEXING.md L3a-E1).
//
// Neutral test suite: stays inside NEUTRAL_TEST_FILES (engram-live/* and node:
// builtins only — zero host, storage driver, root CLI or Python dependency).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BATCH_CODEC_VERSION,
  CONTENT_POLICY_VERSION,
  CONTRACT_VERSION,
  FACT_SCHEMA_VERSION,
  LIVE_FACT_KINDS,
  LOCAL_DIFF_NORMALIZER_VERSION,
  MAX_FACT_BATCH_BYTES,
  POLICY_VERSION,
  PRODUCER_NAME,
  STRUCTURAL_L4B_FACT_KINDS,
  TAGGED_FACT_KINDS,
  classifyDuplicateBatch,
  classifyLiveFactKind,
  isFactBatchDto,
  isLiveFactDto,
  parseFactBatch,
  validateCodeFileDeletionFact,
  validateFactBatch,
  validateLiveFact,
  validateReasonAnchorFact,
  type BranchComparisonFactDto,
  type ChangedFileFactDto,
  type CodeAnalysisFactDto,
  type CodeFileDeletionFactDto,
  type CodeRelationFactDto,
  type CommitFactDto,
  type CoverageFactDto,
  type FactBatchDto,
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
  type PullRequestObservationFactDto,
  type ReasonAnchorFactDto,
  type ReconcileCheckpointProgressFactDto,
  type RefObservationFactDto,
  type RetainedRootProgressFactDto,
  type RetentionReceiptFactDto,
  type SymbolCorrespondenceFactDto,
  type TrackedRefFactDto,
} from "../engram-live/contracts.js";
import {
  LIVE_FACT_REGISTRY,
  classifyFactPrivacy,
  describeFact,
  getFactKindDescriptor,
  listFactKindDescriptors,
  toBranchComparisonFact,
  toCodeAnalysisFact,
  toCodeFileDeletionFact,
  toCommitAndChangedFileFacts,
  toPrAttributionFact,
  toPullRequestObservationFact,
  toRefObservationFact,
  toRetentionReceiptFact,
  toTrackedRefFact,
  validateFactWithRegistry,
  verifyFileDeletion,
} from "../engram-live/facts.js";
import {
  BatchCodecError,
  MAX_CANONICAL_DEPTH,
  buildFactBatch,
  canonicalEncodeValue,
  computeFactBatchDigest,
  decodeFactBatch,
  deliverCheckedFactBatch,
  encodeFactBatch,
  type BatchDeliveryPort,
  type EncodedFactBatch,
  type FactBatchPayloadInput,
} from "../engram-live/batch-codec.js";
import { trackRef } from "../engram-live/refs.js";
import { pinPrAttribution } from "../engram-live/pr-attribution.js";
import { analyzeCode, type GrammarStatusDto } from "../engram-live/code-analysis.js";
import { DEFAULT_DIFF_OPTIONS, type BranchComparisonOutcome } from "../engram-live/comparisons.js";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);

const SHA1_A = "a".repeat(40);
const SHA1_B = "b".repeat(40);
const SHA1_C = "c".repeat(40);
const SHA1_D = "d".repeat(40);
const SHA1_E = "e".repeat(40);
const SHA256_A = "1".repeat(64);
const SHA256_B = "2".repeat(64);
const HEX64_1 = "3".repeat(64);
const HEX64_2 = "4".repeat(64);

const CLONE_SCOPE = { tenant: "local:owner-1", clone: `clone:${"a".repeat(64)}` } as const;
const WORKTREE_SCOPE = {
  tenant: "local:owner-1",
  clone: `clone:${"a".repeat(64)}`,
  worktree: `wt:${"b".repeat(64)}`,
} as const;
const CLONE_ID = CLONE_SCOPE.clone;
const WORKTREE_ID = WORKTREE_SCOPE.worktree;

function sampleRefObservationFact(): RefObservationFactDto {
  return {
    kind: "ref-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    observationId: `refobs:${"1".repeat(64)}`,
    cloneId: CLONE_ID,
    refName: "refs/heads/main",
    refKind: "local-branch",
    algorithm: "sha1",
    target: { algorithm: "sha1", oid: SHA1_A },
    observedAt: 1_700_000_001_000,
    absent: false,
    generation: 1,
    tipCommitterUnixSeconds: 1_700_000_000,
  };
}

function sampleTrackedRefFact(): TrackedRefFactDto {
  return {
    kind: "ref-state",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    refName: "refs/heads/main",
    refKind: "local-branch",
    target: { algorithm: "sha1", oid: SHA1_A },
    generation: 2,
    activity: { activityAt: 1_700_000_001_000, signal: "observed-target-change" },
    deletedAt: null,
    lastObservedAt: 1_700_000_002_000,
  };
}

function sampleCommitFact(): CommitFactDto {
  return {
    kind: "commit",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    commit: { algorithm: "sha1", oid: SHA1_A },
    tree: { algorithm: "sha1", oid: SHA1_B },
    parents: [
      { algorithm: "sha1", oid: SHA1_C },
      { algorithm: "sha1", oid: SHA1_D },
    ],
    author: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 60 },
    committer: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_010, offsetMinutes: 60 },
    subject: "Merge branch feature into main",
    message: enc("Merge branch feature into main\n\nPreserves ordered parents.\n"),
    extractorVersion: "engram-live/git-stream/1",
    policyVersion: POLICY_VERSION,
  };
}

function sampleChangedFileFact(): ChangedFileFactDto {
  return {
    kind: "changed-file",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    commit: { algorithm: "sha1", oid: SHA1_A },
    parentIndex: 0,
    parentCommit: { algorithm: "sha1", oid: SHA1_C },
    path: new Uint8Array([0x73, 0x72, 0x63, 0x2f, 0xff, 0xfe, 0x2e, 0x74, 0x73]),
    previousPath: enc("src/old-name.ts"),
    status: "R",
    statusScore: 95,
    oldMode: "100644",
    newMode: "100644",
    oldBlob: { algorithm: "sha1", oid: SHA1_D },
    newBlob: { algorithm: "sha1", oid: SHA1_E },
    added: 12,
    deleted: 3,
    extractorVersion: "engram-live/git-stream/1",
    policyVersion: POLICY_VERSION,
  };
}

function samplePrObservationFact(): PullRequestObservationFactDto {
  return {
    kind: "pr-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    observationId: `probs:${"2".repeat(64)}`,
    cloneId: CLONE_ID,
    repositoryOwner: "rhanka",
    repositoryRepo: "engram",
    number: 459,
    state: "merged",
    isDraft: false,
    updatedAt: 1_700_000_005_000,
    headOid: { algorithm: "sha1", oid: SHA1_A },
    headRef: "feat/live-git-l3a-e1",
    baseOid: { algorithm: "sha1", oid: SHA1_C },
    baseRef: "main",
    mergeOid: { algorithm: "sha1", oid: SHA1_E },
    mergeStrategy: "merge",
  };
}

function samplePrAttributionFact(): PrAttributionFactDto {
  return {
    kind: "pr-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    repositoryOwner: "rhanka",
    repositoryRepo: "engram",
    prNumber: 459,
    baseOid: { algorithm: "sha1", oid: SHA1_C },
    headOid: { algorithm: "sha1", oid: SHA1_A },
    mergeBaseOids: [{ algorithm: "sha1", oid: SHA1_D }],
    mergeOid: { algorithm: "sha1", oid: SHA1_E },
    mergeStrategy: "merge",
    status: "complete",
    reason: "verified merge-base evidence",
  };
}

function sampleRetentionReceiptFact(): RetentionReceiptFactDto {
  return {
    kind: "retention-receipt",
    schemaVersion: FACT_SCHEMA_VERSION,
    scope: CLONE_SCOPE,
    target: { algorithm: "sha1", oid: SHA1_A },
    receivedAt: 1_700_000_006_000,
    backupRef: "backup:clone-a:sha1-root",
  };
}

function sampleBranchComparisonFact(): BranchComparisonFactDto {
  return {
    kind: "branch-comparison",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    comparisonKind: "contribution",
    state: "complete",
    baseTip: { algorithm: "sha1", oid: SHA1_C },
    branchTip: { algorithm: "sha1", oid: SHA1_A },
    mergeBases: [{ algorithm: "sha1", oid: SHA1_D }],
    baseSource: "pr-base",
    comparatorVersion: "live-comparator/1",
    gitVersion: "2.53.0",
    policyVersion: POLICY_VERSION,
    perParent: [
      {
        parentIndex: 0,
        parent: { algorithm: "sha1", oid: SHA1_C },
        target: { algorithm: "sha1", oid: SHA1_A },
        state: "complete",
        reason: "verified parent diff",
        diff: {
          beforeTree: { algorithm: "sha1", oid: SHA1_B },
          afterTree: { algorithm: "sha1", oid: SHA1_E },
          parentIndex: 0,
          comparatorVersion: "live-comparator/1",
          gitVersion: "2.53.0",
          objectFormat: "sha1",
          options: {
            algorithm: "histogram",
            binaryDetection: true,
            renameLimit: 1000,
            renameThreshold: 50,
          },
          changes: [
            {
              beforePath: enc("src/a.ts"),
              afterPath: enc("src/a.ts"),
              beforeMode: "100644",
              afterMode: "100644",
              changeKind: "modified",
              renameEvidence: null,
              binary: false,
              insertions: 4,
              deletions: 1,
            },
          ],
        },
      },
    ],
    diffs: [
      {
        beforeTree: { algorithm: "sha1", oid: SHA1_B },
        afterTree: { algorithm: "sha1", oid: SHA1_E },
        parentIndex: null,
        comparatorVersion: "live-comparator/1",
        gitVersion: "2.53.0",
        objectFormat: "sha1",
        options: {
          algorithm: "histogram",
          binaryDetection: true,
          renameLimit: 1000,
          renameThreshold: 50,
        },
        changes: [
          {
            beforePath: enc("src/a.ts"),
            afterPath: enc("src/a.ts"),
            beforeMode: "100644",
            afterMode: "100644",
            changeKind: "modified",
            renameEvidence: null,
            binary: false,
            insertions: 4,
            deletions: 1,
          },
        ],
      },
    ],
  };
}

function sampleCodeAnalysisFact(): CodeAnalysisFactDto {
  return {
    kind: "code-analysis",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    worktreeId: null,
    snapshotId: null,
    tree: { algorithm: "sha1", oid: SHA1_B },
    blob: { algorithm: "sha1", oid: SHA1_E },
    path: enc("src/service.ts"),
    language: "typescript",
    dialect: "typescript:ts",
    state: "complete",
    topologyHash: HEX64_1,
    contentHash: HEX64_2,
    configHash: SHA256_A,
    dependencyHash: SHA256_B,
    grammarVersion: "tree-sitter-typescript/0.23.2",
    grammarDigest: HEX64_1,
    grammarId: "tree-sitter-typescript",
    extractorVersion: "live-extractor/1",
    resolverVersion: "live-resolver/1",
    policyVersion: POLICY_VERSION,
    symbols: [
      {
        symbolId: `sym:${HEX64_1}`,
        slot: "fn:run",
        name: "run",
        kind: "function",
        bodyHash: HEX64_2,
        contentHash: HEX64_2,
        path: enc("src/service.ts"),
        tree: { algorithm: "sha1", oid: SHA1_B },
      },
    ],
    relations: [
      {
        relationId: `rel:${HEX64_2}`,
        role: "calls",
        source: {
          symbolId: `sym:${HEX64_1}`,
          slot: "fn:run",
          path: enc("src/service.ts"),
          tree: { algorithm: "sha1", oid: SHA1_B },
          commit: { algorithm: "sha1", oid: SHA1_A },
        },
        target: {
          symbolId: `sym:${SHA256_A}`,
          slot: "fn:helper",
          path: enc("src/helper.ts"),
          tree: { algorithm: "sha1", oid: SHA1_B },
          commit: { algorithm: "sha1", oid: SHA1_A },
        },
        external: false,
        extractorVersion: "live-extractor/1",
        resolverVersion: "live-resolver/1",
      },
    ],
    unresolved: [
      {
        unresolvedKind: "unresolved-call",
        name: "externalInvoke",
        fromSymbolId: `sym:${HEX64_1}`,
        reason: "no unique local declaration",
      },
    ],
  };
}

function sampleCodeRelationFact(): CodeRelationFactDto {
  return {
    kind: "code-relation",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    relationId: `rel:${HEX64_2}`,
    role: "inherits",
    source: {
      symbolId: `sym:${HEX64_1}`,
      slot: "class:Child",
      path: enc("src/child.ts"),
      tree: { algorithm: "sha1", oid: SHA1_B },
      commit: { algorithm: "sha1", oid: SHA1_A },
    },
    target: {
      symbolId: `sym:${SHA256_A}`,
      slot: "class:Base",
      path: enc("src/base.ts"),
      tree: { algorithm: "sha1", oid: SHA1_B },
      commit: { algorithm: "sha1", oid: SHA1_A },
    },
    external: false,
    extractorVersion: "live-extractor/1",
    resolverVersion: "live-resolver/1",
    policyVersion: POLICY_VERSION,
  };
}

function sampleCodeFileDeletionFact(): CodeFileDeletionFactDto {
  return {
    kind: "code-file-deletion",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    worktreeId: null,
    snapshotId: null,
    beforeTree: { algorithm: "sha1", oid: SHA1_B },
    afterTree: { algorithm: "sha1", oid: SHA1_E },
    path: enc("src/service.ts"),
    language: "typescript",
    beforeContentHash: HEX64_2,
    beforeTopologyHash: HEX64_1,
    invalidatedSymbolIds: [`sym:${HEX64_1}`],
    invalidatedSlots: ["fn:run"],
    unresolved: [
      {
        unresolvedKind: "unresolved-call",
        name: "fn:run",
        fromSymbolId: `sym:${SHA256_A}`,
        reason: 'unresolved-call: caller target slot "fn:run" has confirmed whole-file deletion',
      },
    ],
    extractorVersion: "live-extractor/1",
    resolverVersion: "live-resolver/1",
    policyVersion: POLICY_VERSION,
  };
}

function sampleLineAttributionFact(): LineAttributionFactDto {
  return {
    kind: "line-attribution",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    target: { algorithm: "sha1", oid: SHA1_A },
    path: enc("src/service.ts"),
    ranges: [{ start: 1, end: 10 }],
    policyVersion: POLICY_VERSION,
    options: {
      version: "native-blame-options/1",
      algorithm: "myers",
      moveMinCharacters: 20,
      copyMinCharacters: 20,
      copySearch: "all",
    },
    calculationVersion: "live-line-attribution/1",
    gitVersion: "2.53.0",
    retainedRoot: { algorithm: "sha1", oid: SHA1_A },
    state: "complete",
    origins: [
      {
        commit: { algorithm: "sha1", oid: SHA1_C },
        author: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 0 },
        path: enc("src/service.ts"),
        originalRange: { start: 1, end: 10 },
        finalRange: { start: 1, end: 10 },
      },
    ],
    parentEvidence: [
      {
        commit: { algorithm: "sha1", oid: SHA1_A },
        parents: [{ algorithm: "sha1", oid: SHA1_C }],
      },
    ],
    gaps: [],
  };
}

function sampleSymbolCorrespondenceFact(): SymbolCorrespondenceFactDto {
  return {
    kind: "symbol-correspondence",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId: CLONE_ID,
    before: { algorithm: "sha1", oid: SHA1_C },
    after: { algorithm: "sha1", oid: SHA1_A },
    policyVersion: POLICY_VERSION,
    options: {
      version: "exact-l5-body/1",
      renameThreshold: 100,
      moveThreshold: 100,
      copyThreshold: 100,
    },
    calculationVersion: "live-symbol-history/1",
    extractorVersion: "live-extractor/1",
    state: "complete",
    correspondences: [
      {
        before: [
          {
            commit: { algorithm: "sha1", oid: SHA1_C },
            tree: { algorithm: "sha1", oid: SHA1_B },
            blob: { algorithm: "sha1", oid: SHA1_D },
            path: enc("src/old.ts"),
            symbolId: `sym:${HEX64_1}`,
            slot: "fn:oldRun",
            name: "oldRun",
            kind: "function",
            language: "typescript",
            bodyHash: HEX64_2,
            range: null,
          },
        ],
        after: [
          {
            commit: { algorithm: "sha1", oid: SHA1_A },
            tree: { algorithm: "sha1", oid: SHA1_E },
            blob: { algorithm: "sha1", oid: SHA1_D },
            path: enc("src/new.ts"),
            symbolId: `sym:${SHA256_A}`,
            slot: "fn:newRun",
            name: "newRun",
            kind: "function",
            language: "typescript",
            bodyHash: HEX64_2,
            range: { start: 1, end: 8 },
          },
        ],
        relation: "renamed-and-moved",
        reason: "unique-exact-body",
        similarity: 100,
      },
    ],
    parentEvidence: [
      { commit: { algorithm: "sha1", oid: SHA1_A }, parents: [{ algorithm: "sha1", oid: SHA1_C }] },
    ],
    gaps: [],
  };
}

function sampleCoverageFact(): CoverageFactDto {
  return {
    kind: "coverage",
    schemaVersion: FACT_SCHEMA_VERSION,
    axis: "dag",
    state: "partial",
    reason: "shallow boundary recorded",
    checkedAt: 1_700_000_010_000,
    cause: "shallow-boundary",
    pendingCount: 3,
    pendingFrontier: SHA1_D,
    boundary: [{ algorithm: "sha1", oid: SHA1_D }],
  };
}

function sampleProgressFacts(): readonly ProgressFactDto[] {
  const historyCheckpoint: HistoryCheckpointProgressFactDto = {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "history-checkpoint",
    cloneId: CLONE_ID,
    commit: { algorithm: "sha1", oid: SHA1_A },
    tree: { algorithm: "sha1", oid: SHA1_B },
    parents: [{ algorithm: "sha1", oid: SHA1_C }],
    extractorVersion: "engram-live/git-stream/1",
    policyVersion: POLICY_VERSION,
  };
  const retainedRoot: RetainedRootProgressFactDto = {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "retained-root",
    cloneId: CLONE_ID,
    root: { algorithm: "sha1", oid: SHA1_A },
    firstSeenAt: 1_700_000_001_000,
    firstSignal: "default-branch",
    refName: "refs/heads/main",
  };
  const prCursor: PrCursorProgressFactDto = {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "pr-cursor",
    cloneId: CLONE_ID,
    cursor: {
      repositoryOwner: "rhanka",
      repositoryRepo: "engram",
      updatedAtCursor: 1_700_000_005_000,
      lastSuccessAt: 1_700_000_006_000,
      lastEtag: '"etag-1"',
      etagsByCursor: { "page:1": '"etag-1"' },
      sweepKind: "incremental",
      pendingRetry: null,
    },
  };
  const prObjectJob: PrObjectJobProgressFactDto = {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "pr-object-job",
    cloneId: CLONE_ID,
    job: {
      repositoryOwner: "rhanka",
      repositoryRepo: "engram",
      prNumber: 459,
      headOid: { algorithm: "sha1", oid: SHA1_A },
      state: "acquired",
      attempts: 1,
      lastError: null,
      acquiredOid: { algorithm: "sha1", oid: SHA1_A },
      totalCommits: 1501,
      acquiredCommits: 1501,
    },
  };
  const reconcileCheckpoint: ReconcileCheckpointProgressFactDto = {
    kind: "progress",
    schemaVersion: FACT_SCHEMA_VERSION,
    progressKind: "reconcile-checkpoint",
    cloneId: CLONE_ID,
    worktreeId: WORKTREE_ID,
    checkpointId: "ckpt:0001",
    pendingCount: 0,
    frontier: null,
    complete: true,
    recordedAt: 1_700_000_009_000,
  };
  return [historyCheckpoint, retainedRoot, prCursor, prObjectJob, reconcileCheckpoint];
}

function sampleLocalDiffFact(): LocalDiffDto {
  return {
    scope: WORKTREE_SCOPE,
    worktreeId: WORKTREE_ID,
    kind: "unstaged",
    base: { label: "index", oid: SHA1_B },
    tip: { label: "worktree", oid: null },
    normalizerVersion: LOCAL_DIFF_NORMALIZER_VERSION,
    policyVersion: CONTENT_POLICY_VERSION,
    files: [
      {
        path: enc("src/app.ts"),
        previousPath: null,
        status: "modified",
        oldMode: "100644",
        newMode: "100644",
        oldOid: SHA1_C,
        newOid: SHA1_D,
        added: 1,
        deleted: 0,
        hunks: [
          {
            startBefore: 1,
            countBefore: 1,
            startAfter: 1,
            countAfter: 2,
            payload: {
              state: "sealed",
              algorithm: "fake-seal/1",
              keyRef: "local:key-1",
              ciphertext: enc("sealed-payload-bytes"),
            },
          },
        ],
      },
    ],
  };
}

function sampleLocalSnapshotFact(): LocalSnapshotDto {
  return {
    scope: WORKTREE_SCOPE,
    worktreeId: WORKTREE_ID,
    snapshotId: `lsnap:${HEX64_1}`,
    kind: "working-tree",
    diffKind: "unstaged",
    capturedAt: 1_700_000_007_000,
    diffDigest: HEX64_2,
    sealed: {
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: "local:key-1",
      ciphertext: enc("sealed-snapshot-bytes"),
    },
    policyVersion: CONTENT_POLICY_VERSION,
  };
}

function sampleLocalCoverageFact(): LocalCoverageReportDto {
  return {
    axis: "working-tree",
    state: "current",
    reason: "current:sealed-latest",
  };
}

function allExemplarFactsByKind(): Record<LiveFactKind, LiveFactDto> {
  return {
    "ref-observation": sampleRefObservationFact(),
    "ref-state": sampleTrackedRefFact(),
    "commit": sampleCommitFact(),
    "changed-file": sampleChangedFileFact(),
    "pr-observation": samplePrObservationFact(),
    "pr-attribution": samplePrAttributionFact(),
    "retention-receipt": sampleRetentionReceiptFact(),
    "branch-comparison": sampleBranchComparisonFact(),
    "code-analysis": sampleCodeAnalysisFact(),
    "code-relation": sampleCodeRelationFact(),
    "code-file-deletion": sampleCodeFileDeletionFact(),
    "line-attribution": sampleLineAttributionFact(),
    "symbol-correspondence": sampleSymbolCorrespondenceFact(),
    "reason-anchor": sampleReasonCodeAnchor(),
    "coverage": sampleCoverageFact(),
    "progress": sampleProgressFacts()[0]!,
    "local-diff": sampleLocalDiffFact(),
    "local-snapshot": sampleLocalSnapshotFact(),
    "local-coverage": sampleLocalCoverageFact(),
  };
}

function sampleReasonCodeAnchor() {
  return {
    kind: "reason-anchor",
    schemaVersion: FACT_SCHEMA_VERSION,
    policyVersion: POLICY_VERSION,
    scope: CLONE_SCOPE,
    anchorKind: "code",
    commit: { algorithm: "sha1", oid: SHA1_A },
    blob: { algorithm: "sha1", oid: SHA1_B },
    path: Uint8Array.of(0x73, 0x2f, 0xff),
    range: { start: 1, end: 3 },
    calculationVersion: "live-line-attribution/1",
  } as const satisfies ReasonAnchorFactDto;
}

function makeBatchInput(
  facts: readonly LiveFactDto[],
  overrides: Partial<FactBatchPayloadInput> = {},
): FactBatchPayloadInput {
  return {
    scope: CLONE_SCOPE,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: POLICY_VERSION,
    generationId: "gen:0000000001",
    batchId: "batch:l3a-e1-0001",
    facts,
    ...overrides,
  };
}

function scrambleObjectKeys(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(scrambleObjectKeys);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).reverse();
    const out: Record<string, unknown> = {};
    for (const [key, entry] of entries) {
      out[key] = scrambleObjectKeys(entry);
    }
    return out;
  }
  return value;
}

describe("L3a-E1 typed facts and canonical batch codec", () => {
  it.each([
    ["worktree", { scope: { ...CLONE_SCOPE, worktree: undefined } }],
    ["calculation version", { calculationVersion: undefined }],
  ] as const)("reason anchor validation accepts an explicitly undefined %s", (_field, overrides) => {
    const code = sampleReasonCodeAnchor();
    expect(validateReasonAnchorFact({ ...code, ...overrides })).toEqual({ ok: true, errors: [] });
  });

  it("reason anchor variants round-trip through the batch codec and refuse malformed or private keys", () => {
    const code = sampleReasonCodeAnchor();
    const { kind, schemaVersion, policyVersion, scope, commit } = code;
    const common = { kind, schemaVersion, policyVersion, scope };
    const commitAnchor = { ...common, anchorKind: "commit", commit } as const satisfies ReasonAnchorFactDto;
    const pr = {
      ...common,
      anchorKind: "pr",
      repository: { owner: "rhanka", repo: "engram" },
      prNumber: 459,
      headObservationId: `probs:${HEX64_1}`,
      baseObservationId: `probs:${HEX64_2}`,
    } as const satisfies ReasonAnchorFactDto;
    const anchors = [code, commitAnchor, pr];
    const input = makeBatchInput(anchors);
    const built = buildFactBatch(input);
    expect(decodeFactBatch(built.encoded.bytes).facts).toStrictEqual(anchors);
    const scrambled = buildFactBatch(scrambleObjectKeys(input) as FactBatchPayloadInput);
    expect(scrambled.encoded.bytes).toEqual(built.encoded.bytes);
    expect(scrambled.batch.batchDigest).toBe(built.batch.batchDigest);

    const mutations: readonly [field: string, index: number, anchor: ReasonAnchorFactDto][] = [
      ["code commit", 0, { ...code, commit: { ...commit, oid: SHA1_C } }],
      ["code blob", 0, { ...code, blob: { ...code.blob, oid: SHA1_C } }],
      ["code path", 0, { ...code, path: Uint8Array.of(0x73, 0x2f, 0xfe) }],
      ["code range", 0, { ...code, range: { ...code.range, end: 4 } }],
      ["code calculation version", 0, { ...code, calculationVersion: "live-line-attribution/2" }],
      ["commit OID", 1, { ...commitAnchor, commit: { ...commit, oid: SHA1_C } }],
      ["PR repository", 2, { ...pr, repository: { ...pr.repository, repo: "other" } }],
      ["PR number", 2, { ...pr, prNumber: 460 }],
      ["PR head observation", 2, { ...pr, headObservationId: `probs:${HEX64_2}` }],
      ["PR base observation", 2, { ...pr, baseObservationId: `probs:${HEX64_1}` }],
    ];
    for (const [field, index, replacement] of mutations) {
      const facts = anchors.map((anchor, position) => position === index ? replacement : anchor);
      expect(buildFactBatch(makeBatchInput(facts)).batch.batchDigest, field).not.toBe(built.batch.batchDigest);
    }
    expect(describeFact(code)).toMatchObject({ scopeLevel: "clone", privacy: "committed" });
    for (const anchor of anchors) {
      expect(validateFactWithRegistry(anchor)).toEqual({ ok: true, errors: [] });
      expect(validateLiveFact({ ...anchor, memoryId: "memory:secret" }).ok).toBe(false);
    }
    const malformed = [
      { ...code, anchorKind: "unknown" },
      { ...code, scope: { ...scope, worktree: WORKTREE_ID } },
      { ...code, scope: { ...scope, session: "private" } },
      { ...code, policyVersion: CONTENT_POLICY_VERSION },
      { ...code, commit: { ...commit, message: "private" } },
      { ...code, blob: { algorithm: "sha256", oid: SHA256_B } },
      { ...code, path: "s/decoded.ts" },
      { ...code, path: Uint8Array.of(0) },
      { ...code, range: { start: 0, end: 3 } },
      { ...code, range: { start: 3, end: 2 } },
      { ...code, range: { start: 1, end: 3, citationText: "private" } },
      { ...code, calculationVersion: "" },
      { ...commitAnchor, range: code.range },
      { ...pr, repository: { ...pr.repository, owner: "" } },
      { ...pr, repository: { ...pr.repository, sessionContent: "private" } },
      { ...pr, prNumber: 0 },
      { ...pr, headObservationId: "refs/pull/459/head" },
      { ...pr, baseObservationId: undefined },
    ];
    for (const anchor of malformed) {
      expect(validateLiveFact(anchor).ok, JSON.stringify(anchor)).toBe(false);
    }
    for (const scope of [{ ...CLONE_SCOPE, tenant: "local:other" }, { ...CLONE_SCOPE, clone: "clone:other" }]) {
      expect(validateFactBatch({ ...built.batch, scope }).ok).toBe(false);
    }
  });

  it("every fact kind has an exact-key typed DTO and an unknown kind or an extra key is refused", () => {
    const exemplars = allExemplarFactsByKind();
    const expectedKinds = Object.keys(exemplars).sort();

    // Closed union + registry stay in exact 1-to-1 correspondence.
    expect([...LIVE_FACT_KINDS].sort()).toEqual(expectedKinds);
    expect([...TAGGED_FACT_KINDS, ...STRUCTURAL_L4B_FACT_KINDS].sort()).toEqual(expectedKinds);
    expect(Object.keys(LIVE_FACT_REGISTRY).sort()).toEqual(expectedKinds);
    expect(listFactKindDescriptors().map((descriptor) => descriptor.kind).sort()).toEqual(expectedKinds);

    // Inherited prototype property names never resolve through the registry.
    expect(getFactKindDescriptor("constructor")).toBeUndefined();
    expect(getFactKindDescriptor("toString")).toBeUndefined();
    expect(getFactKindDescriptor("not-a-kind")).toBeUndefined();

    // Every fact kind validates cleanly, classifies accurately, and rejects any extra key.
    for (const kind of LIVE_FACT_KINDS) {
      const fact = exemplars[kind];
      expect(classifyLiveFactKind(fact), `classify ${kind}`).toBe(kind);
      expect(isLiveFactDto(fact), `isLiveFactDto ${kind}`).toBe(true);
      expect(validateLiveFact(fact), `validateLiveFact ${kind}`).toEqual({ ok: true, errors: [] });
      expect(validateFactWithRegistry(fact), `validateFactWithRegistry ${kind}`).toEqual({ ok: true, errors: [] });

      const descriptor = describeFact(fact);
      expect(descriptor.kind).toBe(kind);
      expect(descriptor.schemaVersion).toBe(FACT_SCHEMA_VERSION);
      expect(descriptor.structural).toBe((STRUCTURAL_L4B_FACT_KINDS as readonly string[]).includes(kind));

      // Exact-key enforcement: an extra top-level key is refused with an opaque diagnostic.
      const secretKey = "smuggled_private_field_name";
      const withExtra = { ...(fact as unknown as Record<string, unknown>), [secretKey]: "unexpected" };
      const checkedExtra = validateLiveFact(withExtra);
      expect(checkedExtra.ok, `extra key on ${kind} must be refused`).toBe(false);
      expect(checkedExtra.errors.join(" "), `extra key diagnostic for ${kind} must stay opaque`).not.toContain(secretKey);

      // Inside a FactBatchDto envelope, valid fact passes and extra-key fact fails.
      const policyVersion = descriptor.structural ? CONTENT_POLICY_VERSION : POLICY_VERSION;
      const scope = descriptor.structural ? WORKTREE_SCOPE : CLONE_SCOPE;
      const built = buildFactBatch(makeBatchInput([fact], { scope, policyVersion }));
      expect(validateFactBatch(built.batch), `batch with ${kind}`).toEqual({ ok: true, errors: [] });
      expect(isFactBatchDto(built.batch)).toBe(true);
      const parsed = parseFactBatch(built.batch);
      expect(parsed.ok).toBe(true);

      const batchWithExtra = { ...built.batch, facts: [withExtra] };
      expect(validateFactBatch(batchWithExtra).ok, `batch with extra key on ${kind} must fail`).toBe(false);

      // Tagged facts must refuse a wrong or missing schemaVersion.
      if (!descriptor.structural) {
        const wrongVersion = { ...(fact as unknown as Record<string, unknown>), schemaVersion: 2 };
        expect(validateLiveFact(wrongVersion).ok, `wrong schemaVersion on ${kind}`).toBe(false);
        const missingVersion = { ...(fact as unknown as Record<string, unknown>) };
        delete missingVersion.schemaVersion;
        expect(validateLiveFact(missingVersion).ok, `missing schemaVersion on ${kind}`).toBe(false);
      }
    }

    // All 5 progress variants validate individually and refuse extra or cross-variant keys.
    for (const progress of sampleProgressFacts()) {
      expect(validateLiveFact(progress), `progress:${progress.progressKind}`).toEqual({ ok: true, errors: [] });
      const extraProgress = { ...(progress as unknown as Record<string, unknown>), stray: true };
      expect(validateLiveFact(extraProgress).ok, `extra key on progress:${progress.progressKind}`).toBe(false);
    }

    // Unknown kinds, spoofed structural kinds, untagged objects and primitives are refused.
    const unknownCandidates: unknown[] = [
      null,
      undefined,
      42,
      "commit",
      [],
      {},
      { foo: "bar" },
      { kind: "unknown-fact-kind", schemaVersion: FACT_SCHEMA_VERSION },
      { kind: "local-diff", schemaVersion: FACT_SCHEMA_VERSION },
      { kind: "local-snapshot", schemaVersion: FACT_SCHEMA_VERSION },
      { kind: "local-coverage", schemaVersion: FACT_SCHEMA_VERSION },
      { kind: "cumulative", schemaVersion: FACT_SCHEMA_VERSION },
      { files: [] },
      { snapshotId: `lsnap:${HEX64_1}` },
    ];
    for (const candidate of unknownCandidates) {
      expect(classifyLiveFactKind(candidate)).toBeNull();
      expect(validateLiveFact(candidate).ok, `unknown candidate ${JSON.stringify(candidate)}`).toBe(false);
      const badBatch = {
        scope: CLONE_SCOPE,
        producerName: PRODUCER_NAME,
        contractVersion: CONTRACT_VERSION,
        policyVersion: POLICY_VERSION,
        generationId: "gen:0000000001",
        batchId: "batch:l3a-e1-unknown",
        batchDigest: "0".repeat(64),
        facts: [candidate],
      };
      expect(validateFactBatch(badBatch).ok).toBe(false);
    }

    // Nested exact-key & domain-invariant checks:
    // 1. Extra key inside a QualifiedOid is refused.
    const commitWithExtraOidKey = {
      ...sampleCommitFact(),
      commit: { algorithm: "sha1", oid: SHA1_A, extra: 1 },
    };
    expect(validateLiveFact(commitWithExtraOidKey).ok).toBe(false);

    // 2. Algorithm mismatch between commit and parent OID is refused.
    const commitMixedAlg = {
      ...sampleCommitFact(),
      parents: [{ algorithm: "sha256", oid: SHA256_A }],
    };
    expect(validateLiveFact(commitMixedAlg).ok).toBe(false);

    // 3. Ref deletion observation requires target: null; present requires target !== null.
    const badAbsentRef = { ...sampleRefObservationFact(), absent: true };
    expect(validateLiveFact(badAbsentRef).ok).toBe(false);
    const goodAbsentRef: RefObservationFactDto = {
      ...sampleRefObservationFact(),
      absent: true,
      target: null,
    };
    expect(validateLiveFact(goodAbsentRef).ok).toBe(true);
    const badPresentRef = { ...sampleRefObservationFact(), absent: false, target: null };
    expect(validateLiveFact(badPresentRef).ok).toBe(false);

    // 4. Changed-file root parentIndex -1 requires parentCommit: null; parentIndex >= 0 requires QualifiedOid.
    expect(validateLiveFact({ ...sampleChangedFileFact(), parentIndex: -1, parentCommit: null }).ok).toBe(true);
    expect(validateLiveFact({ ...sampleChangedFileFact(), parentIndex: -1 }).ok).toBe(false);
    expect(validateLiveFact({ ...sampleChangedFileFact(), parentIndex: 0, parentCommit: null }).ok).toBe(false);

    // 5. Code relation endpoint rejects extra keys and unknown role.
    const relBadEndpoint = {
      ...sampleCodeRelationFact(),
      source: { ...sampleCodeRelationFact().source, extraEndpointKey: "nope" },
    };
    expect(validateLiveFact(relBadEndpoint).ok).toBe(false);
    const relBadRole = { ...sampleCodeRelationFact(), role: "unknown-role" };
    expect(validateLiveFact(relBadRole).ok).toBe(false);

    // 6. L4b structural facts keep their exact bytes (no kind key added on LocalCoverageReportDto)
    //    and transient "open-lines" on LocalDiffDto is refused at the batch boundary.
    expect("kind" in sampleLocalCoverageFact()).toBe(false);
    const unsealedDiff = {
      ...sampleLocalDiffFact(),
      files: [
        {
          ...sampleLocalDiffFact().files[0]!,
          hunks: [
            {
              startBefore: 1,
              countBefore: 1,
              startAfter: 1,
              countAfter: 1,
              payload: { state: "open-lines", lines: ["+plaintext"] },
            },
          ],
        },
      ],
    };
    expect(validateLiveFact(unsealedDiff).ok).toBe(false);

    // 7. Retention receipt must remain clone-scoped (no worktree).
    expect(validateLiveFact({ ...sampleRetentionReceiptFact(), scope: WORKTREE_SCOPE }).ok).toBe(false);

    // 8. PR observation refuses forbidden credential keys.
    expect(validateLiveFact({ ...samplePrObservationFact(), token: "ghp_forbidden" }).ok).toBe(false);

    // 9. Real delivered producer outputs convert cleanly through facts.ts helpers and validate.
    const rawObs = {
      refName: "refs/heads/main",
      oid: SHA1_A,
      observedAt: 1_700_000_001_000,
      tipCommitterUnixSeconds: 1_700_000_000,
    };
    const tracked = trackRef("refs/heads/main", [rawObs]);
    expect(validateLiveFact(toRefObservationFact(CLONE_ID, "sha1", tracked.kind, rawObs, tracked.generation)).ok).toBe(true);
    expect(validateLiveFact(toTrackedRefFact(CLONE_ID, "sha1", tracked)).ok).toBe(true);

    const { commit, changedFiles } = toCommitAndChangedFileFacts({
      cloneId: CLONE_ID,
      algorithm: "sha1",
      oid: SHA1_A,
      tree: SHA1_B,
      parents: [SHA1_C],
      author: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 0 },
      committer: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 0 },
      subject: "initial",
      message: enc("initial\n"),
      parentDiffs: [
        {
          parentIndex: 0,
          files: [
            {
              path: enc("src/a.ts"),
              previousPath: null,
              status: "A",
              statusScore: null,
              oldMode: "000000",
              newMode: "100644",
              oldOid: "0".repeat(40),
              newOid: SHA1_D,
              added: 5,
              deleted: 0,
            },
          ],
        },
      ],
      extractorVersion: "engram-live/git-stream/1",
      policyVersion: POLICY_VERSION,
    });
    expect(validateLiveFact(commit).ok).toBe(true);
    expect(changedFiles).toHaveLength(1);
    expect(validateLiveFact(changedFiles[0]!).ok).toBe(true);

    const prRaw = {
      repositoryOwner: "rhanka",
      repositoryRepo: "engram",
      number: 459,
      state: "open" as const,
      isDraft: false,
      updatedAt: 1_700_000_005_000,
      headOid: { algorithm: "sha1" as const, oid: SHA1_A },
      headRef: "feat/x",
      baseOid: { algorithm: "sha1" as const, oid: SHA1_C },
      baseRef: "main",
    };
    expect(validateLiveFact(toPullRequestObservationFact(CLONE_ID, prRaw)).ok).toBe(true);
    const prAttr = pinPrAttribution({
      repositoryOwner: "rhanka",
      repositoryRepo: "engram",
      prNumber: 459,
      headOid: { algorithm: "sha1", oid: SHA1_A },
      baseOid: { algorithm: "sha1", oid: SHA1_C },
      mergeBaseOids: [{ algorithm: "sha1", oid: SHA1_D }],
      mergeStrategy: "merge",
    });
    expect(validateLiveFact(toPrAttributionFact(CLONE_ID, prAttr)).ok).toBe(true);
    expect(validateLiveFact(toRetentionReceiptFact({
      scope: CLONE_SCOPE,
      algorithm: "sha1",
      oid: SHA1_A,
      receivedAt: 1_700_000_006_000,
      backupRef: "backup:r1",
    })).ok).toBe(true);
  });

  it("canonical batch encoding is byte-stable across key order and a changed fact changes the batch digest", () => {
    const facts: readonly LiveFactDto[] = [
      sampleRefObservationFact(),
      sampleCommitFact(),
      sampleChangedFileFact(),
      sampleCodeAnalysisFact(),
      sampleCodeRelationFact(),
      sampleCodeFileDeletionFact(),
      sampleLineAttributionFact(),
      sampleSymbolCorrespondenceFact(),
      sampleReasonCodeAnchor(),
      sampleCoverageFact(),
      ...sampleProgressFacts(),
    ];
    const input = makeBatchInput(facts);
    const builtA = buildFactBatch(input);

    // Scramble object key insertion order at every nesting depth and add explicit
    // undefined optional properties — canonical encoding and digest must be byte-identical.
    const scrambledInput = scrambleObjectKeys({
      ...input,
      scope: { clone: CLONE_SCOPE.clone, tenant: CLONE_SCOPE.tenant, worktree: undefined },
    }) as FactBatchPayloadInput;
    const builtB = buildFactBatch(scrambledInput);

    expect(builtB.batch.batchDigest).toBe(builtA.batch.batchDigest);
    expect(builtB.encoded.codecVersion).toBe(BATCH_CODEC_VERSION);
    expect(builtB.encoded.bytes).toEqual(builtA.encoded.bytes);
    expect(builtB.encoded.byteLength).toBe(builtA.encoded.bytes.byteLength);
    expect(classifyDuplicateBatch(builtA.batch, builtB.batch)).toBe("idempotent");

    // Round-trip decode restores exact typed batch including raw non-UTF-8 Uint8Array bytes,
    // ordered parents, ref-observation identity, and complete code relation endpoints/roles/versions.
    const decoded = decodeFactBatch(builtA.encoded.bytes);
    expect(validateFactBatch(decoded)).toEqual({ ok: true, errors: [] });
    expect(decoded.batchDigest).toBe(builtA.batch.batchDigest);
    const decodedChangedFile = decoded.facts[2] as ChangedFileFactDto;
    expect(decodedChangedFile.path).toBeInstanceOf(Uint8Array);
    expect(Array.from(decodedChangedFile.path)).toEqual([0x73, 0x72, 0x63, 0x2f, 0xff, 0xfe, 0x2e, 0x74, 0x73]);
    const decodedCommit = decoded.facts[1] as CommitFactDto;
    expect(decodedCommit.parents.map((p) => `${p.algorithm}:${p.oid}`)).toEqual([
      `sha1:${SHA1_C}`,
      `sha1:${SHA1_D}`,
    ]);
    const decodedRefObs = decoded.facts[0] as RefObservationFactDto;
    expect(decodedRefObs.observationId).toBe(sampleRefObservationFact().observationId);
    const decodedRelation = decoded.facts[4] as CodeRelationFactDto;
    expect(decodedRelation.role).toBe("inherits");
    expect(decodedRelation.source.symbolId).toBe(sampleCodeRelationFact().source.symbolId);
    expect(decodedRelation.target.symbolId).toBe(sampleCodeRelationFact().target.symbolId);
    expect(decodedRelation.extractorVersion).toBe("live-extractor/1");
    expect(decodedRelation.resolverVersion).toBe("live-resolver/1");

    // Re-encoding the decoded batch produces the exact same canonical bytes.
    const reEncoded = encodeFactBatch(decoded);
    expect(reEncoded.bytes).toEqual(builtA.encoded.bytes);

    // Every meaningful mutation changes both the canonical bytes and the batch digest,
    // and classifyDuplicateBatch refuses same batchId with changed digest.
    const mutations: { label: string; facts: readonly LiveFactDto[] }[] = [
      {
        label: "swapped ordered parents",
        facts: facts.map((f, i) =>
          i === 1
            ? { ...(f as CommitFactDto), parents: [(f as CommitFactDto).parents[1]!, (f as CommitFactDto).parents[0]!] }
            : f,
        ),
      },
      {
        label: "changed single byte in raw Uint8Array path",
        facts: facts.map((f, i) =>
          i === 2
            ? { ...(f as ChangedFileFactDto), path: new Uint8Array([0x73, 0x72, 0x63, 0x2f, 0xff, 0xfd, 0x2e, 0x74, 0x73]) }
            : f,
        ),
      },
      {
        label: "changed ref observation identity",
        facts: facts.map((f, i) =>
          i === 0 ? { ...(f as RefObservationFactDto), observationId: `refobs:${"9".repeat(64)}` } : f,
        ),
      },
      {
        label: "changed OID algorithm from sha1 to sha256",
        facts: facts.map((f, i) =>
          i === 0
            ? { ...(f as RefObservationFactDto), algorithm: "sha256" as const, target: { algorithm: "sha256" as const, oid: SHA256_A } }
            : f,
        ),
      },
      {
        label: "changed relationship role",
        facts: facts.map((f, i) =>
          i === 4 ? { ...(f as CodeRelationFactDto), role: "calls" as const } : f,
        ),
      },
      {
        label: "changed relationship version",
        facts: facts.map((f, i) =>
          i === 4 ? { ...(f as CodeRelationFactDto), resolverVersion: "live-resolver/2" } : f,
        ),
      },
      {
        label: "reordered facts in batch",
        facts: [facts[1]!, facts[0]!, ...facts.slice(2)],
      },
    ];

    for (const mutation of mutations) {
      const mutated = buildFactBatch(makeBatchInput(mutation.facts));
      expect(mutated.batch.batchDigest, mutation.label).not.toBe(builtA.batch.batchDigest);
      expect(Buffer.from(mutated.encoded.bytes).equals(Buffer.from(builtA.encoded.bytes)), mutation.label).toBe(false);
      expect(classifyDuplicateBatch(builtA.batch, mutated.batch), mutation.label).toBe("refused");
    }

    // Tampered batchDigest is refused by encodeFactBatch, and tampered wire bytes are refused by decodeFactBatch.
    const tamperedBatch: FactBatchDto = { ...builtA.batch, batchDigest: "f".repeat(64) };
    expect(() => encodeFactBatch(tamperedBatch)).toThrowError(BatchCodecError);
    try {
      encodeFactBatch(tamperedBatch);
    } catch (error) {
      expect((error as BatchCodecError).code).toBe("digest-mismatch");
    }

    const tamperedBytes = Uint8Array.from(builtA.encoded.bytes);
    const idx = Buffer.from(tamperedBytes).indexOf("Merge branch");
    expect(idx).toBeGreaterThan(0);
    tamperedBytes[idx] = "X".charCodeAt(0);
    expect(() => decodeFactBatch(tamperedBytes)).toThrowError(BatchCodecError);

    // Collision-free byte escaping: a plain object with key "$t" inside etagsByCursor round-trips cleanly.
    const cursorWithTagKey: PrCursorProgressFactDto = {
      kind: "progress",
      schemaVersion: FACT_SCHEMA_VERSION,
      progressKind: "pr-cursor",
      cloneId: CLONE_ID,
      cursor: {
        repositoryOwner: "rhanka",
        repositoryRepo: "engram",
        updatedAtCursor: 1_700_000_005_000,
        lastSuccessAt: 1_700_000_006_000,
        lastEtag: '"etag-2"',
        etagsByCursor: { "$t": "bytes", v: "not-a-uint8array" },
        sweepKind: "full",
        pendingRetry: null,
      },
    };
    const escapedBuilt = buildFactBatch(makeBatchInput([cursorWithTagKey]));
    const escapedDecoded = decodeFactBatch(escapedBuilt.encoded.bytes);
    const decodedCursor = escapedDecoded.facts[0] as PrCursorProgressFactDto;
    expect(decodedCursor.cursor.etagsByCursor).toEqual({ "$t": "bytes", v: "not-a-uint8array" });

    // Direct canonicalEncodeValue stability check for -0 vs 0 and key order.
    expect(canonicalEncodeValue({ b: -0, a: [1, 2] })).toEqual(canonicalEncodeValue({ a: [1, 2], b: 0 }));
    expect(computeFactBatchDigest(input)).toBe(builtA.batch.batchDigest);
  });

  it("a batch above 4 MiB is refused before delivery and no prefix is acknowledged", async () => {
    expect(MAX_FACT_BATCH_BYTES).toBe(4 * 1024 * 1024);

    // Construct a valid multi-fact batch whose canonical wire encoding exceeds 4 MiB.
    // A 3.2 MiB raw message encodes to ~4.27 MiB in canonical base64, plus a prefix fact
    // so we prove neither the prefix fact nor any partial batch is delivered or acknowledged.
    const prefixFact = sampleRefObservationFact();
    const oversizedCommit: CommitFactDto = {
      ...sampleCommitFact(),
      message: new Uint8Array(3_200_000).fill(0x61),
    };
    const oversizedInput = makeBatchInput([prefixFact, oversizedCommit], {
      batchId: "batch:l3a-e1-oversized",
    });

    // 1. buildFactBatch refuses before producing an emitted batch.
    let buildError: unknown;
    try {
      buildFactBatch(oversizedInput);
    } catch (error) {
      buildError = error;
    }
    expect(buildError).toBeInstanceOf(BatchCodecError);
    expect((buildError as BatchCodecError).code).toBe("batch-too-large");

    // 2. Manually assembling a FactBatchDto with a valid canonical digest is STILL
    //    refused by encodeFactBatch and deliverCheckedFactBatch before sink.deliver is called.
    const manualDigest = computeFactBatchDigest(oversizedInput);
    const manualOversizedBatch: FactBatchDto = {
      ...oversizedInput,
      batchDigest: manualDigest,
    };
    expect(validateFactBatch(manualOversizedBatch)).toEqual({ ok: true, errors: [] });

    let encodeError: unknown;
    try {
      encodeFactBatch(manualOversizedBatch);
    } catch (error) {
      encodeError = error;
    }
    expect(encodeError).toBeInstanceOf(BatchCodecError);
    expect((encodeError as BatchCodecError).code).toBe("batch-too-large");

    const delivered: { batch: FactBatchDto; encoded: EncodedFactBatch }[] = [];
    const acknowledged: string[] = [];
    const fakeSink: BatchDeliveryPort = {
      async deliver(batch, encoded) {
        delivered.push({ batch, encoded });
        acknowledged.push(batch.batchId);
        return { received: true, batchId: batch.batchId };
      },
    };

    let deliverError: unknown;
    try {
      await deliverCheckedFactBatch(manualOversizedBatch, fakeSink);
    } catch (error) {
      deliverError = error;
    }
    expect(deliverError).toBeInstanceOf(BatchCodecError);
    expect((deliverError as BatchCodecError).code).toBe("batch-too-large");
    expect(delivered).toHaveLength(0);
    expect(acknowledged).toHaveLength(0);

    // 3. Exact 4 MiB boundary proof: 4,194,304 bytes succeeds; 4,194,305 bytes is refused!
    const emptyMsgCommit: CommitFactDto = { ...sampleCommitFact(), message: new Uint8Array(0) };
    const exactId = "batch:l3a-e1-exact-4mib";
    const overId = "batch:l3a-e1-over1-4mib";
    expect(overId.length).toBe(exactId.length);
    const baseInput = makeBatchInput([emptyMsgCommit], { batchId: exactId });
    const baseEncoded = buildFactBatch(baseInput).encoded;
    // Every additional ASCII byte in `subject` adds exactly 1 UTF-8 byte to the canonical JSON.
    const slack = MAX_FACT_BATCH_BYTES - baseEncoded.byteLength;
    expect(slack).toBeGreaterThan(0);

    const exactLimitInput = makeBatchInput(
      [{ ...emptyMsgCommit, subject: `${emptyMsgCommit.subject}${"x".repeat(slack)}` }],
      { batchId: exactId },
    );
    const exactBuilt = buildFactBatch(exactLimitInput);
    expect(exactBuilt.encoded.byteLength).toBe(MAX_FACT_BATCH_BYTES);
    const exactResult = await deliverCheckedFactBatch(exactBuilt.batch, fakeSink);
    expect(exactResult.receipt).toEqual({ received: true, batchId: exactId });
    expect(delivered).toHaveLength(1);
    expect(acknowledged).toEqual([exactId]);

    const oneByteOverInput = makeBatchInput(
      [{ ...emptyMsgCommit, subject: `${emptyMsgCommit.subject}${"x".repeat(slack + 1)}` }],
      { batchId: overId },
    );
    const oneByteOverBatch: FactBatchDto = {
      ...oneByteOverInput,
      batchDigest: computeFactBatchDigest(oneByteOverInput),
    };
    let overByOneError: unknown;
    try {
      await deliverCheckedFactBatch(oneByteOverBatch, fakeSink);
    } catch (error) {
      overByOneError = error;
    }
    expect(overByOneError).toBeInstanceOf(BatchCodecError);
    expect((overByOneError as BatchCodecError).code).toBe("batch-too-large");
    expect((overByOneError as BatchCodecError).byteLength).toBe(MAX_FACT_BATCH_BYTES + 1);
    // No second call, no prefix acknowledged.
    expect(delivered).toHaveLength(1);
    expect(acknowledged).toEqual([exactId]);

    // 4. Callers cannot relax the 4 MiB ceiling via options.maxBytes.
    expect(() => encodeFactBatch(exactBuilt.batch, { maxBytes: MAX_FACT_BATCH_BYTES + 1 })).toThrowError(BatchCodecError);

    // 5. decodeFactBatch rejects an oversized buffer before parsing.
    const oversizedBuffer = new Uint8Array(MAX_FACT_BATCH_BYTES + 1).fill(0x20);
    let decodeError: unknown;
    try {
      decodeFactBatch(oversizedBuffer);
    } catch (error) {
      decodeError = error;
    }
    expect(decodeError).toBeInstanceOf(BatchCodecError);
    expect((decodeError as BatchCodecError).code).toBe("batch-too-large");
  });

  it("MAJOR 1: preserves own __proto__ keys through buildFactBatch, decodeFactBatch and deliverCheckedFactBatch without digest mismatch", async () => {
    const etags: Record<string, string> = { "page:1": '"etag-page-1"' };
    Object.defineProperty(etags, "__proto__", {
      value: '"etag-proto-1"',
      enumerable: true,
      writable: true,
      configurable: true,
    });
    const cursorFact: PrCursorProgressFactDto = {
      kind: "progress",
      schemaVersion: FACT_SCHEMA_VERSION,
      progressKind: "pr-cursor",
      cloneId: CLONE_ID,
      cursor: {
        repositoryOwner: "rhanka",
        repositoryRepo: "engram",
        updatedAtCursor: 1_700_000_005_000,
        lastSuccessAt: 1_700_000_006_000,
        lastEtag: '"etag-1"',
        etagsByCursor: etags,
        sweepKind: "incremental",
        pendingRetry: null,
      },
    };

    const built = buildFactBatch(makeBatchInput([cursorFact], { batchId: "batch:l3a-e1-proto" }));
    const builtCursor = built.batch.facts[0] as PrCursorProgressFactDto;
    const builtEtags = builtCursor.cursor.etagsByCursor!;
    expect(Object.getPrototypeOf(builtEtags)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(builtEtags, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(builtEtags, "__proto__")?.value).toBe('"etag-proto-1"');
    expect(builtEtags["page:1"]).toBe('"etag-page-1"');

    const decoded = decodeFactBatch(built.encoded.bytes);
    const decodedCursor = decoded.facts[0] as PrCursorProgressFactDto;
    const decodedEtags = decodedCursor.cursor.etagsByCursor!;
    expect(Object.getPrototypeOf(decodedEtags)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(decodedEtags, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(decodedEtags, "__proto__")?.value).toBe('"etag-proto-1"');
    expect(decodedEtags["page:1"]).toBe('"etag-page-1"');

    const delivered: FactBatchDto[] = [];
    const result = await deliverCheckedFactBatch(built.batch, {
      async deliver(batch) {
        delivered.push(batch);
        return { received: true as const, batchId: batch.batchId };
      },
    });
    expect(result.receipt).toEqual({ received: true, batchId: "batch:l3a-e1-proto" });
    const sinkEtags = (delivered[0]!.facts[0] as PrCursorProgressFactDto).cursor.etagsByCursor!;
    expect(Object.prototype.hasOwnProperty.call(sinkEtags, "__proto__")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(sinkEtags, "__proto__")?.value).toBe('"etag-proto-1"');
  });

  it("MAJOR 2: rejects non-plain object prototypes in open record slots and canonical encoding", async () => {
    const baseCursor = sampleProgressFacts()[2] as PrCursorProgressFactDto;
    const nonPlainValues: { label: string; value: unknown }[] = [
      { label: "Map", value: new Map([["secret", "value"]]) },
      { label: "Set", value: new Set(["secret"]) },
      { label: "Date", value: new Date(1_700_000_000_000) },
      { label: "RegExp", value: /secret/ },
      { label: "Uint8Array", value: new Uint8Array(0) },
    ];

    for (const { label, value } of nonPlainValues) {
      const badFact = {
        ...baseCursor,
        cursor: { ...baseCursor.cursor, etagsByCursor: value },
      };
      expect(validateLiveFact(badFact).ok, `validateLiveFact must reject ${label}`).toBe(false);
      const badBatch = {
        ...makeBatchInput([baseCursor]),
        batchDigest: "0".repeat(64),
        facts: [badFact],
      };
      expect(validateFactBatch(badBatch).ok, `validateFactBatch must reject ${label}`).toBe(false);
      expect(() => buildFactBatch(makeBatchInput([badFact as unknown as LiveFactDto]))).toThrowError(BatchCodecError);

      let deliverCalls = 0;
      await expect(
        deliverCheckedFactBatch(badBatch as unknown as FactBatchDto, {
          async deliver(batch) {
            deliverCalls += 1;
            return { received: true as const, batchId: batch.batchId };
          },
        }),
      ).rejects.toThrowError(BatchCodecError);
      expect(deliverCalls, `deliverCheckedFactBatch must not invoke sink for ${label}`).toBe(0);
    }

    for (const nonPlain of [new Map([["k", "v"]]), new Set(["v"]), new Date(0), /abc/]) {
      let err: unknown;
      try {
        canonicalEncodeValue(nonPlain);
      } catch (error) {
        err = error;
      }
      expect(err).toBeInstanceOf(BatchCodecError);
      expect((err as BatchCodecError).code).toBe("invalid-encoding");
    }

    // Null-prototype plain objects remain valid plain records.
    const nullProtoEtags = Object.assign(Object.create(null) as Record<string, string>, {
      "page:1": '"etag-null-proto"',
    });
    const nullProtoFact: PrCursorProgressFactDto = {
      ...baseCursor,
      cursor: { ...baseCursor.cursor, etagsByCursor: nullProtoEtags },
    };
    expect(validateLiveFact(nullProtoFact)).toEqual({ ok: true, errors: [] });
    const builtNullProto = buildFactBatch(makeBatchInput([nullProtoFact]));
    expect((decodeFactBatch(builtNullProto.encoded.bytes).facts[0] as PrCursorProgressFactDto).cursor.etagsByCursor).toEqual({
      "page:1": '"etag-null-proto"',
    });
  });

  it("MAJOR 3: enforces envelope scope, cloneId and worktree binding across every fact in validateFactBatch", () => {
    const foreignTenant = "local:foreign-tenant-9";
    const foreignClone = `clone:${"f".repeat(64)}`;
    const foreignWorktree = `wt:${"9".repeat(64)}`;
    const foreignScope = { tenant: foreignTenant, clone: foreignClone } as const;
    const foreignWorktreeScope = { tenant: foreignTenant, clone: foreignClone, worktree: foreignWorktree } as const;

    const makeRawBatch = (
      scope: { readonly tenant: string; readonly clone: string; readonly worktree?: string },
      facts: readonly LiveFactDto[],
      policyVersion: string = POLICY_VERSION,
    ) => ({
      scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion,
      generationId: "gen:0000000001",
      batchId: "batch:l3a-e1-scope",
      batchDigest: "0".repeat(64),
      facts,
    });

    // Foreign tenant/clone on retention-receipt, local-diff, local-snapshot must be refused opaquely.
    const foreignRetention = { ...sampleRetentionReceiptFact(), scope: foreignScope };
    const resRetention = validateFactBatch(makeRawBatch(CLONE_SCOPE, [foreignRetention]));
    expect(resRetention.ok).toBe(false);
    expect(resRetention.errors.join(" ")).not.toContain(foreignTenant);
    expect(resRetention.errors.join(" ")).not.toContain(foreignClone);

    const foreignDiff = { ...sampleLocalDiffFact(), scope: foreignWorktreeScope, worktreeId: foreignWorktree };
    expect(validateFactBatch(makeRawBatch(WORKTREE_SCOPE, [foreignDiff], CONTENT_POLICY_VERSION)).ok).toBe(false);

    const foreignSnapshot = { ...sampleLocalSnapshotFact(), scope: foreignWorktreeScope, worktreeId: foreignWorktree };
    expect(validateFactBatch(makeRawBatch(WORKTREE_SCOPE, [foreignSnapshot], CONTENT_POLICY_VERSION)).ok).toBe(false);

    // Foreign cloneId on ref-state / commit / progress must be refused.
    expect(validateFactBatch(makeRawBatch(CLONE_SCOPE, [{ ...sampleTrackedRefFact(), cloneId: foreignClone }])).ok).toBe(false);
    expect(validateFactBatch(makeRawBatch(CLONE_SCOPE, [{ ...sampleCommitFact(), cloneId: foreignClone }])).ok).toBe(false);

    // Unbound local-coverage when batch.scope has no worktree and no companion L4b worktree fact is refused.
    expect(validateFactBatch(makeRawBatch(CLONE_SCOPE, [sampleLocalCoverageFact()], CONTENT_POLICY_VERSION)).ok).toBe(false);

    // L4b scope.worktree mismatch (present on fact vs absent on batch, or vice versa) is refused.
    expect(validateFactBatch(makeRawBatch(CLONE_SCOPE, [sampleLocalDiffFact()], CONTENT_POLICY_VERSION)).ok).toBe(false);
    const diffWithoutScopeWorktree: LocalDiffDto = { ...sampleLocalDiffFact(), scope: CLONE_SCOPE };
    expect(validateFactBatch(makeRawBatch(WORKTREE_SCOPE, [diffWithoutScopeWorktree], CONTENT_POLICY_VERSION)).ok).toBe(false);

    // Non-null worktreeId differing from present batch.scope.worktree is refused.
    const foreignWtCodeAnalysis: CodeAnalysisFactDto = { ...sampleCodeAnalysisFact(), worktreeId: foreignWorktree };
    expect(validateFactBatch(makeRawBatch(WORKTREE_SCOPE, [foreignWtCodeAnalysis])).ok).toBe(false);
    const foreignWtReconcile: ReconcileCheckpointProgressFactDto = {
      ...(sampleProgressFacts()[4] as ReconcileCheckpointProgressFactDto),
      worktreeId: foreignWorktree,
    };
    expect(validateFactBatch(makeRawBatch(WORKTREE_SCOPE, [foreignWtReconcile])).ok).toBe(false);

    // Conflicting worktreeIds across L4b structural facts in one batch are refused.
    const snapOtherWt: LocalSnapshotDto = {
      ...sampleLocalSnapshotFact(),
      scope: CLONE_SCOPE,
      worktreeId: foreignWorktree,
    };
    expect(
      validateFactBatch(makeRawBatch(CLONE_SCOPE, [diffWithoutScopeWorktree, snapOtherWt], CONTENT_POLICY_VERSION)).ok,
    ).toBe(false);

    // Delivered L4b shape (batch.scope without worktree, companion local-diff + local-snapshot sharing worktreeId + local-coverage) remains accepted.
    const snapSameWt: LocalSnapshotDto = {
      ...sampleLocalSnapshotFact(),
      scope: CLONE_SCOPE,
      worktreeId: WORKTREE_ID,
    };
    expect(
      validateFactBatch(
        makeRawBatch(CLONE_SCOPE, [diffWithoutScopeWorktree, snapSameWt, sampleLocalCoverageFact()], CONTENT_POLICY_VERSION),
      ),
    ).toEqual({ ok: true, errors: [] });
  });

  it("MAJOR 4: accepts generation 0 on absent ref observations from trackRef while refusing generation 0 when present", () => {
    const initialAbsent = {
      refName: "refs/heads/never-created",
      oid: "",
      observedAt: 1_700_000_001_000,
      absent: true as const,
    };
    const tracked = trackRef("refs/heads/never-created", [initialAbsent]);
    expect(tracked.generation).toBe(0);
    expect(validateLiveFact(toTrackedRefFact(CLONE_ID, "sha1", tracked))).toEqual({ ok: true, errors: [] });

    const obsFact = toRefObservationFact(CLONE_ID, "sha1", tracked.kind, initialAbsent, tracked.generation);
    expect(obsFact.absent).toBe(true);
    expect(obsFact.generation).toBe(0);
    expect(validateLiveFact(obsFact)).toEqual({ ok: true, errors: [] });

    // Present ref observation must still require generation > 0.
    expect(validateLiveFact({ ...sampleRefObservationFact(), absent: false, generation: 0 }).ok).toBe(false);
    // Negative generation on absent ref observation is still refused.
    expect(validateLiveFact({ ...obsFact, generation: -1 }).ok).toBe(false);
  });

  it("MAJOR 5: requires versioned grammar evidence and bound context on code-analysis facts and exact options on branch-comparison diffs", async () => {
    // (a) CodeAnalysisFactDto requires grammarVersion (and accepts optional grammarDigest/grammarId)
    //     and requires tree !== null || snapshotId !== null when state !== "unavailable".
    const codeAnalysisWithoutGrammar = { ...(sampleCodeAnalysisFact() as unknown as Record<string, unknown>) };
    delete codeAnalysisWithoutGrammar.grammarVersion;
    expect(validateLiveFact(codeAnalysisWithoutGrammar).ok).toBe(false);
    expect(validateLiveFact({ ...sampleCodeAnalysisFact(), grammarVersion: null }).ok).toBe(false);
    expect(validateLiveFact({ ...sampleCodeAnalysisFact(), grammarVersion: "" }).ok).toBe(false);
    expect(validateLiveFact({ ...sampleCodeAnalysisFact(), grammarDigest: "not-hex64" }).ok).toBe(false);
    expect(validateLiveFact({ ...sampleCodeAnalysisFact(), grammarId: "" }).ok).toBe(false);

    const codeAnalysisWithGrammar = {
      ...codeAnalysisWithoutGrammar,
      grammarVersion: "tree-sitter-typescript/0.23.2",
      grammarDigest: HEX64_1,
      grammarId: "tree-sitter-typescript",
    };
    expect(validateLiveFact(codeAnalysisWithGrammar)).toEqual({ ok: true, errors: [] });

    const unboundComplete = { ...codeAnalysisWithGrammar, tree: null, snapshotId: null, state: "complete" };
    expect(validateLiveFact(unboundComplete).ok).toBe(false);
    const unboundPartial = { ...codeAnalysisWithGrammar, tree: null, snapshotId: null, state: "partial" };
    expect(validateLiveFact(unboundPartial).ok).toBe(false);
    const snapshotBound = {
      ...codeAnalysisWithGrammar,
      tree: null,
      snapshotId: `lsnap:${HEX64_1}`,
      worktreeId: WORKTREE_ID,
      state: "complete",
    };
    expect(validateLiveFact(snapshotBound)).toEqual({ ok: true, errors: [] });
    const unavailableUnbound = {
      ...codeAnalysisWithGrammar,
      tree: null,
      snapshotId: null,
      state: "unavailable",
      grammarVersion: null,
      topologyHash: "",
      symbols: [],
      relations: [],
      unresolved: [],
    };
    expect(validateLiveFact(unavailableUnbound)).toEqual({ ok: true, errors: [] });

    // (b) BranchComparisonDiffFactDto requires exact-key options object.
    const branchFactRaw = sampleBranchComparisonFact() as unknown as {
      diffs: Record<string, unknown>[];
      perParent: { diff: Record<string, unknown> | null }[];
    };
    const branchWithoutOptions = {
      ...branchFactRaw,
      perParent: branchFactRaw.perParent.map((p) => ({
        ...p,
        diff: p.diff ? Object.fromEntries(Object.entries(p.diff).filter(([k]) => k !== "options")) : null,
      })),
      diffs: branchFactRaw.diffs.map((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== "options"))),
    };
    expect(validateLiveFact(branchWithoutOptions).ok).toBe(false);

    const validDiffOptions = {
      algorithm: "histogram",
      binaryDetection: true,
      renameLimit: 1000,
      renameThreshold: 50,
    };
    const branchWithOptions = {
      ...branchWithoutOptions,
      perParent: branchWithoutOptions.perParent.map((p) => ({
        ...p,
        diff: p.diff ? { ...p.diff, options: validDiffOptions } : null,
      })),
      diffs: branchWithoutOptions.diffs.map((d) => ({ ...d, options: validDiffOptions })),
    };
    expect(validateLiveFact(branchWithOptions)).toEqual({ ok: true, errors: [] });

    // Extra key or invalid value inside options is refused.
    const branchBadOptions = {
      ...branchWithOptions,
      diffs: branchWithOptions.diffs.map((d) => ({
        ...d,
        options: { ...validDiffOptions, stray: 1 },
      })),
    };
    expect(validateLiveFact(branchBadOptions).ok).toBe(false);
    expect(
      validateLiveFact({
        ...branchWithOptions,
        diffs: branchWithOptions.diffs.map((d) => ({
          ...d,
          options: { ...validDiffOptions, renameThreshold: 101 },
        })),
      }).ok,
    ).toBe(false);
    expect(
      validateLiveFact({
        ...branchWithOptions,
        diffs: branchWithOptions.diffs.map((d) => ({
          ...d,
          options: { ...validDiffOptions, algorithm: "bogus" },
        })),
      }).ok,
    ).toBe(false);

    // (c) Pure producer adapters in facts.ts convert real L5 analyzeCode & comparison outcomes cleanly.
    const minimalWasm = new Uint8Array([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
    const wasmDigest = createHash("sha256").update(minimalWasm).digest("hex");
    const grammarStatus: GrammarStatusDto = {
      state: "available",
      version: "tree-sitter-typescript/0.23.2",
      digest: wasmDigest,
      abi: "14",
      grammarId: "tree-sitter-typescript",
      bytes: minimalWasm,
    };
    const analysisInput = {
      scope: { tenant: CLONE_SCOPE.tenant, clone: CLONE_SCOPE.clone },
      language: "typescript",
      path: "src/service.ts",
      content: "export function run() { return helper(); }\n",
      treeOid: SHA1_B,
      configHash: SHA256_A,
      dependencyHash: SHA256_B,
      historicalBounds: null,
    };
    const analysisOutcome = await analyzeCode(analysisInput, {
      grammar: {
        status: () => grammarStatus,
        load: () => ({ loaded: true }),
      },
      objects: { loadBlob: async () => null },
      extractor: {
        parse: () => ({
          symbols: [{ slot: "fn:run", name: "run", kind: "function", bodyHash: HEX64_2 }],
          calls: [{ slot: "call:1", fromSlot: "fn:run", targetSlotOrName: "helper", external: true }],
          inheritances: [],
          topologyHash: HEX64_1,
          syntax: { rootSpansBytes: true, hasError: false, hasMissing: false, walkComplete: true },
        }),
      },
    });
    const convertedAnalysis = toCodeAnalysisFact(analysisInput, analysisOutcome, grammarStatus);
    expect(convertedAnalysis.grammarVersion).toBe("tree-sitter-typescript/0.23.2");
    expect(convertedAnalysis.grammarDigest).toBe(wasmDigest);
    expect(convertedAnalysis.grammarId).toBe("tree-sitter-typescript");
    expect(validateLiveFact(convertedAnalysis)).toEqual({ ok: true, errors: [] });

    const rawPathBytes = new Uint8Array([0x73, 0x72, 0x63, 0x2f, 0xff, 0x2e, 0x74, 0x73]);
    const comparisonOutcome: BranchComparisonOutcome = {
      state: "complete",
      kind: "contribution",
      baseTip: { algorithm: "sha1", oid: SHA1_C },
      branchTip: { algorithm: "sha1", oid: SHA1_A },
      mergeBases: [{ algorithm: "sha1", oid: SHA1_D }],
      baseSource: "pr-base",
      perParent: [],
      diffs: [
        {
          beforeTree: { algorithm: "sha1", oid: SHA1_B },
          afterTree: { algorithm: "sha1", oid: SHA1_E },
          parentIndex: null,
          comparatorVersion: "live-comparator/1",
          gitVersion: "git/2.53.0",
          pathEncoding: "base64url",
          objectFormat: "sha1",
          options: { ...DEFAULT_DIFF_OPTIONS },
          changes: [
            {
              beforePath: Buffer.from(rawPathBytes).toString("base64url"),
              afterPath: Buffer.from(rawPathBytes).toString("base64url"),
              beforeMode: "100644",
              afterMode: "100644",
              changeKind: "modified",
              renameEvidence: null,
              binary: false,
              insertions: 2,
              deletions: 1,
            },
          ],
          derived: true,
        },
      ],
      coverage: { axis: "dag", state: "current", reason: "verified" },
    };
    const convertedComparison = toBranchComparisonFact(CLONE_ID, comparisonOutcome);
    expect(convertedComparison.diffs[0]?.options).toEqual(DEFAULT_DIFF_OPTIONS);
    expect(Array.from(convertedComparison.diffs[0]!.changes[0]!.beforePath!)).toEqual(Array.from(rawPathBytes));
    expect(validateLiveFact(convertedComparison)).toEqual({ ok: true, errors: [] });

    // Round-trip both adapted L5 facts through buildFactBatch + decodeFactBatch and verify digest sensitivity.
    const l5Built = buildFactBatch(makeBatchInput([convertedAnalysis, convertedComparison], { batchId: "batch:l3a-e1-l5" }));
    expect(decodeFactBatch(l5Built.encoded.bytes).batchDigest).toBe(l5Built.batch.batchDigest);
    const l5MutatedGrammar = buildFactBatch(
      makeBatchInput([{ ...convertedAnalysis, grammarVersion: "tree-sitter-typescript/0.23.3" }, convertedComparison], {
        batchId: "batch:l3a-e1-l5",
      }),
    );
    expect(l5MutatedGrammar.batch.batchDigest).not.toBe(l5Built.batch.batchDigest);
    const l5MutatedOptions = buildFactBatch(
      makeBatchInput(
        [
          convertedAnalysis,
          {
            ...convertedComparison,
            diffs: [
              {
                ...convertedComparison.diffs[0]!,
                options: { ...convertedComparison.diffs[0]!.options, renameThreshold: 75 },
              },
            ],
          },
        ],
        { batchId: "batch:l3a-e1-l5" },
      ),
    );
    expect(l5MutatedOptions.batch.batchDigest).not.toBe(l5Built.batch.batchDigest);
  });

  it("MINOR 6: refuses non-canonical wire buffers in decodeFactBatch even when the decoded batchDigest matches", () => {
    const zeroOffsetCommit: CommitFactDto = {
      ...sampleCommitFact(),
      author: { ...sampleCommitFact().author, offsetMinutes: 0 },
      committer: { ...sampleCommitFact().committer, offsetMinutes: 0 },
    };
    const built = buildFactBatch(
      makeBatchInput([zeroOffsetCommit, sampleProgressFacts()[2]!], { batchId: "batch:l3a-e1-canonical-wire" }),
    );
    const canonicalText = new TextDecoder().decode(built.encoded.bytes);

    const variants: { label: string; wire: string }[] = [
      { label: "leading/trailing whitespace", wire: ` ${canonicalText}\n` },
      {
        label: "reordered top-level keys",
        wire: (() => {
          const parsed = JSON.parse(canonicalText) as { batch: unknown; codecVersion: string };
          return JSON.stringify({ codecVersion: parsed.codecVersion, batch: parsed.batch });
        })(),
      },
      {
        label: "unicode escape in string",
        wire: canonicalText.replace(`"${PRODUCER_NAME}"`, `"\\u0065${PRODUCER_NAME.slice(1)}"`),
      },
      {
        label: "negative zero (-0)",
        wire: canonicalText.replace('"offsetMinutes":0', '"offsetMinutes":-0'),
      },
      {
        label: "duplicate JSON key",
        wire: canonicalText.replace(
          '"batchId":"batch:l3a-e1-canonical-wire"',
          '"batchId":"batch:l3a-e1-canonical-wire","batchId":"batch:l3a-e1-canonical-wire"',
        ),
      },
      {
        label: "redundant $t object wrapper",
        wire: canonicalText.replace(
          '"etagsByCursor":{"page:1":"\\"etag-1\\""}',
          '"etagsByCursor":{"$t":"object","v":{"page:1":"\\"etag-1\\""}}',
        ),
      },
    ];

    for (const { label, wire } of variants) {
      expect(wire, `${label} must actually differ from canonical wire bytes`).not.toBe(canonicalText);
      let caught: unknown;
      try {
        decodeFactBatch(enc(wire));
      } catch (error) {
        caught = error;
      }
      expect(caught, `${label} must be refused by decodeFactBatch`).toBeInstanceOf(BatchCodecError);
      expect((caught as BatchCodecError).code, `${label} must fail with invalid-encoding`).toBe("invalid-encoding");
    }
  });

  it("ROUND 2 MINOR 1: code-analysis and code-relation report private when snapshot-bound, worktree-bound, tree-less or under content policy, and committed when committed", () => {
    const committedAnalysis = sampleCodeAnalysisFact();
    expect(validateLiveFact(committedAnalysis)).toEqual({ ok: true, errors: [] });
    const committedAnalysisDesc = describeFact(committedAnalysis);
    expect(committedAnalysisDesc.kind).toBe("code-analysis");
    expect(committedAnalysisDesc.privacy).toBe("committed");
    expect(classifyFactPrivacy(committedAnalysis)).toBe("committed");
    expect(Object.isFrozen(committedAnalysisDesc)).toBe(true);

    const committedRelation = sampleCodeRelationFact();
    expect(validateLiveFact(committedRelation)).toEqual({ ok: true, errors: [] });
    const committedRelationDesc = describeFact(committedRelation);
    expect(committedRelationDesc.kind).toBe("code-relation");
    expect(committedRelationDesc.privacy).toBe("committed");
    expect(classifyFactPrivacy(committedRelation)).toBe("committed");
    expect(Object.isFrozen(committedRelationDesc)).toBe(true);

    // Every individual private trigger on code-analysis (plus the combined uncommitted snapshot case).
    const privateAnalysisCases: { label: string; fact: CodeAnalysisFactDto }[] = [
      {
        label: "snapshot-bound uncommitted analysis (worktree + snapshot + tree-less + content policy)",
        fact: {
          ...committedAnalysis,
          worktreeId: WORKTREE_ID,
          snapshotId: `lsnap:${HEX64_1}`,
          tree: null,
          blob: null,
          policyVersion: CONTENT_POLICY_VERSION,
          symbols: committedAnalysis.symbols.map((sym) => ({ ...sym, tree: null })),
          relations: committedAnalysis.relations.map((rel) => ({
            ...rel,
            source: { ...rel.source, tree: null, commit: null },
            target: { ...rel.target, tree: null, commit: null },
          })),
        },
      },
      {
        label: "snapshot-bound only",
        fact: {
          ...committedAnalysis,
          snapshotId: `lsnap:${HEX64_2}`,
        },
      },
      {
        label: "worktree-bound only",
        fact: {
          ...committedAnalysis,
          worktreeId: WORKTREE_ID,
        },
      },
      {
        label: "tree-less only (unavailable)",
        fact: {
          ...committedAnalysis,
          tree: null,
          blob: null,
          state: "unavailable",
          topologyHash: "",
          grammarVersion: null,
          symbols: [],
          relations: [],
          unresolved: [],
        },
      },
      {
        label: "content policy only",
        fact: {
          ...committedAnalysis,
          policyVersion: CONTENT_POLICY_VERSION,
        },
      },
      {
        label: "tree-less embedded symbol",
        fact: {
          ...committedAnalysis,
          symbols: committedAnalysis.symbols.map((sym) => ({ ...sym, tree: null })),
        },
      },
      {
        label: "tree-less embedded relation endpoint",
        fact: {
          ...committedAnalysis,
          relations: committedAnalysis.relations.map((rel) => ({
            ...rel,
            target: { ...rel.target, tree: null, commit: null },
          })),
        },
      },
    ];

    for (const { label, fact } of privateAnalysisCases) {
      expect(validateLiveFact(fact), `valid private code-analysis (${label})`).toEqual({ ok: true, errors: [] });
      const desc = describeFact(fact);
      expect(desc.kind, label).toBe("code-analysis");
      expect(desc.privacy, `code-analysis (${label}) must report private`).toBe("private");
      expect(classifyFactPrivacy(fact), `classifyFactPrivacy code-analysis (${label})`).toBe("private");
      expect(Object.isFrozen(desc), label).toBe(true);
    }

    // Every individual private trigger on code-relation.
    const privateRelationCases: { label: string; fact: CodeRelationFactDto }[] = [
      {
        label: "source tree-less",
        fact: {
          ...committedRelation,
          source: { ...committedRelation.source, tree: null, commit: null },
        },
      },
      {
        label: "target tree-less",
        fact: {
          ...committedRelation,
          target: { ...committedRelation.target, tree: null, commit: null },
        },
      },
      {
        label: "both endpoints tree-less",
        fact: {
          ...committedRelation,
          source: { ...committedRelation.source, tree: null, commit: null },
          target: { ...committedRelation.target, tree: null, commit: null },
        },
      },
      {
        label: "content policy only",
        fact: {
          ...committedRelation,
          policyVersion: CONTENT_POLICY_VERSION,
        },
      },
    ];

    for (const { label, fact } of privateRelationCases) {
      expect(validateLiveFact(fact), `valid private code-relation (${label})`).toEqual({ ok: true, errors: [] });
      const desc = describeFact(fact);
      expect(desc.kind, label).toBe("code-relation");
      expect(desc.privacy, `code-relation (${label}) must report private`).toBe("private");
      expect(classifyFactPrivacy(fact), `classifyFactPrivacy code-relation (${label})`).toBe("private");
      expect(Object.isFrozen(desc), label).toBe(true);
    }

    // Static registry entries and non-dual fact kinds stay untouched.
    expect(LIVE_FACT_REGISTRY["code-analysis"].privacy).toBe("committed");
    expect(LIVE_FACT_REGISTRY["code-relation"].privacy).toBe("committed");
    expect(describeFact(sampleCommitFact()).privacy).toBe("committed");
    expect(classifyFactPrivacy(sampleCommitFact())).toBe("committed");
    expect(describeFact(sampleLocalSnapshotFact()).privacy).toBe("private");
    expect(classifyFactPrivacy(sampleLocalSnapshotFact())).toBe("private");
    expect(describeFact(sampleLocalDiffFact()).privacy).toBe("private");
    expect(classifyFactPrivacy(sampleLocalDiffFact())).toBe("private");
    expect(describeFact(sampleCoverageFact()).privacy).toBe("metadata");
    expect(classifyFactPrivacy(sampleCoverageFact())).toBe("metadata");
    expect(describeFact(sampleProgressFacts()[0]!).privacy).toBe("metadata");
    expect(classifyFactPrivacy(sampleProgressFacts()[0]!)).toBe("metadata");
    expect(describeFact(sampleLocalCoverageFact()).privacy).toBe("metadata");
    expect(classifyFactPrivacy(sampleLocalCoverageFact())).toBe("metadata");
  });

  it("ROUND 2 MINOR 2: decodeFactBatch and canonicalEncodeValue enforce bounded recursion depth without RangeError", async () => {
    expect(MAX_CANONICAL_DEPTH).toBe(32);

    const nestArrays = (depth: number, leaf?: unknown): unknown => {
      let current: unknown = leaf === undefined ? [] : leaf;
      const iterations = leaf === undefined ? depth - 1 : depth;
      for (let i = 0; i < iterations; i++) {
        current = [current];
      }
      return current;
    };

    const nestObjects = (depth: number, leaf: unknown): unknown => {
      let current: unknown = leaf;
      for (let i = 0; i < depth; i++) {
        current = { a: current };
      }
      return current;
    };

    // 15,000 nested arrays (~30 KB, well under the 4 MiB byte limit) must fail closed with
    // BatchCodecError("invalid-encoding") and NEVER throw RangeError.
    const deepWire = `{"codecVersion":"${BATCH_CODEC_VERSION}","batch":${"[".repeat(15_000)}${"]".repeat(15_000)}}`;
    expect(enc(deepWire).byteLength).toBeLessThan(MAX_FACT_BATCH_BYTES);
    let caughtDeepDecode: unknown;
    try {
      decodeFactBatch(enc(deepWire));
    } catch (error) {
      caughtDeepDecode = error;
    }
    expect(caughtDeepDecode).toBeInstanceOf(BatchCodecError);
    expect(caughtDeepDecode).not.toBeInstanceOf(RangeError);
    expect((caughtDeepDecode as BatchCodecError).code).toBe("invalid-encoding");

    // Deeply nested objects and nested $t:"object" escapes also fail closed with invalid-encoding.
    const deepObjectWire = `{"codecVersion":"${BATCH_CODEC_VERSION}","batch":${'{"a":'.repeat(1_000)}0${"}".repeat(1_000)}}`;
    let caughtDeepObjectDecode: unknown;
    try {
      decodeFactBatch(enc(deepObjectWire));
    } catch (error) {
      caughtDeepObjectDecode = error;
    }
    expect(caughtDeepObjectDecode).toBeInstanceOf(BatchCodecError);
    expect((caughtDeepObjectDecode as BatchCodecError).code).toBe("invalid-encoding");

    const deepTagWire = `{"codecVersion":"${BATCH_CODEC_VERSION}","batch":${'{"$t":"object","v":'.repeat(100)}{}${"}".repeat(100)}}`;
    let caughtDeepTagDecode: unknown;
    try {
      decodeFactBatch(enc(deepTagWire));
    } catch (error) {
      caughtDeepTagDecode = error;
    }
    expect(caughtDeepTagDecode).toBeInstanceOf(BatchCodecError);
    expect((caughtDeepTagDecode as BatchCodecError).code).toBe("invalid-encoding");

    // Exact MAX_CANONICAL_DEPTH = 32 boundary on canonicalEncodeValue (arrays and objects).
    expect(() => canonicalEncodeValue(nestArrays(32))).not.toThrow();
    expect(() => canonicalEncodeValue(nestArrays(32, 0))).not.toThrow();
    expect(() => canonicalEncodeValue(nestObjects(32, 0))).not.toThrow();
    // Wide shallow array (> 32 siblings) stays accepted in both encode and decode; only nesting depth is bounded.
    expect(() => canonicalEncodeValue(Array.from({ length: 64 }, (_, i) => i))).not.toThrow();
    const wideBatch = buildFactBatch(
      makeBatchInput(
        Array.from({ length: 40 }, (_, i) => ({
          ...sampleRefObservationFact(),
          observationId: `refobs:${i.toString(16).padStart(64, "0")}`,
          generation: i + 1,
        })),
        { batchId: "batch:l3a-e1-wide-40" },
      ),
    );
    expect(decodeFactBatch(wideBatch.encoded.bytes).facts).toHaveLength(40);

    for (const [label, value] of [
      ["33 nested empty arrays", nestArrays(33)],
      ["33 nested arrays around leaf", nestArrays(33, 0)],
      ["33 nested objects", nestObjects(33, 0)],
    ] as const) {
      let caughtEncode: unknown;
      try {
        canonicalEncodeValue(value);
      } catch (error) {
        caughtEncode = error;
      }
      expect(caughtEncode, `${label} must be refused by canonicalEncodeValue`).toBeInstanceOf(BatchCodecError);
      expect((caughtEncode as BatchCodecError).code, label).toBe("invalid-encoding");
    }

    // Cyclic object passed directly to canonicalEncodeValue or deliverCheckedFactBatch fails closed without RangeError.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let caughtCyclicEncode: unknown;
    try {
      canonicalEncodeValue(cyclic);
    } catch (error) {
      caughtCyclicEncode = error;
    }
    expect(caughtCyclicEncode).toBeInstanceOf(BatchCodecError);
    expect(caughtCyclicEncode).not.toBeInstanceOf(RangeError);
    expect((caughtCyclicEncode as BatchCodecError).code).toBe("invalid-encoding");

    let sinkCalls = 0;
    const sink: BatchDeliveryPort = {
      async deliver() {
        sinkCalls += 1;
        return { received: true, batchId: "never" };
      },
    };
    let caughtCyclicDeliver: unknown;
    try {
      await deliverCheckedFactBatch(cyclic as unknown as FactBatchDto, sink);
    } catch (error) {
      caughtCyclicDeliver = error;
    }
    expect(caughtCyclicDeliver).toBeInstanceOf(BatchCodecError);
    expect(caughtCyclicDeliver).not.toBeInstanceOf(RangeError);
    expect((caughtCyclicDeliver as BatchCodecError).code).toBe("invalid-encoding");
    expect(sinkCalls).toBe(0);
  });

  it("L5-D: code-file-deletion validates exact keys, invariants, privacy and canonical batch encoding", () => {
    const committed = sampleCodeFileDeletionFact();
    expect(validateCodeFileDeletionFact(committed)).toEqual({ ok: true, errors: [] });
    expect(validateLiveFact(committed)).toEqual({ ok: true, errors: [] });
    expect(validateFactWithRegistry(committed)).toEqual({ ok: true, errors: [] });
    expect(describeFact(committed)).toMatchObject({
      kind: "code-file-deletion",
      privacy: "committed",
      scopeLevel: "either",
    });
    expect(classifyFactPrivacy(committed)).toBe("committed");
    expect(Object.isFrozen(describeFact(committed))).toBe(true);
    expect(typeof verifyFileDeletion).toBe("function");
    expect(typeof toCodeFileDeletionFact).toBe("function");

    // Round-trip canonical encoding, key-order invariance, and digest sensitivity on every field.
    const built = buildFactBatch(makeBatchInput([committed], { batchId: "batch:l5-d-contract" }));
    expect(decodeFactBatch(built.encoded.bytes).facts).toStrictEqual([committed]);
    const scrambled = buildFactBatch(scrambleObjectKeys(makeBatchInput([committed], { batchId: "batch:l5-d-contract" })) as FactBatchPayloadInput);
    expect(scrambled.encoded.bytes).toEqual(built.encoded.bytes);
    expect(scrambled.batch.batchDigest).toBe(built.batch.batchDigest);

    const digestMutations: readonly [string, CodeFileDeletionFactDto][] = [
      ["beforeTree", { ...committed, beforeTree: { algorithm: "sha1", oid: SHA1_C } }],
      ["afterTree", { ...committed, afterTree: { algorithm: "sha1", oid: SHA1_D } }],
      ["path", { ...committed, path: new Uint8Array([0x73, 0x72, 0x63, 0x2f, 0xff, 0x2e, 0x74, 0x73]) }],
      ["language", { ...committed, language: "javascript" }],
      ["beforeContentHash", { ...committed, beforeContentHash: SHA256_A }],
      ["beforeTopologyHash", { ...committed, beforeTopologyHash: SHA256_B }],
      ["invalidatedSymbolIds", { ...committed, invalidatedSymbolIds: [`sym:${SHA256_B}`] }],
      ["invalidatedSlots", { ...committed, invalidatedSlots: ["fn:other"] }],
      ["unresolved", { ...committed, unresolved: [] }],
      ["extractorVersion", { ...committed, extractorVersion: "live-extractor/2" }],
      ["resolverVersion", { ...committed, resolverVersion: "live-resolver/2" }],
      ["policyVersion", { ...committed, policyVersion: CONTENT_POLICY_VERSION }],
    ];
    for (const [label, mutated] of digestMutations) {
      expect(validateLiveFact(mutated), `valid mutation ${label}`).toEqual({ ok: true, errors: [] });
      const mutatedBatch = buildFactBatch(makeBatchInput([mutated], { batchId: "batch:l5-d-contract" }));
      expect(mutatedBatch.batch.batchDigest, label).not.toBe(built.batch.batchDigest);
    }

    // Verified-empty file deletion (zero invalidated symbols and zero unresolved) is valid.
    const emptyFileDeletion: CodeFileDeletionFactDto = {
      ...committed,
      invalidatedSymbolIds: [],
      invalidatedSlots: [],
      unresolved: [],
    };
    expect(validateLiveFact(emptyFileDeletion)).toEqual({ ok: true, errors: [] });

    // Private classification triggers (same dual-scope rule as code-analysis).
    const privateCases: readonly [string, CodeFileDeletionFactDto][] = [
      [
        "snapshot-bound deletion",
        {
          ...committed,
          worktreeId: WORKTREE_ID,
          snapshotId: `lsnap:${HEX64_1}`,
          afterTree: null,
          policyVersion: CONTENT_POLICY_VERSION,
        },
      ],
      ["worktree-bound only", { ...committed, worktreeId: WORKTREE_ID }],
      ["snapshotId only", { ...committed, snapshotId: `lsnap:${HEX64_2}` }],
      ["content policy only", { ...committed, policyVersion: CONTENT_POLICY_VERSION }],
      ["beforeTree null with snapshot", { ...committed, beforeTree: null, afterTree: null, snapshotId: `lsnap:${HEX64_1}` }],
    ];
    for (const [label, fact] of privateCases) {
      expect(validateLiveFact(fact), label).toEqual({ ok: true, errors: [] });
      expect(classifyFactPrivacy(fact), label).toBe("private");
      expect(describeFact(fact).privacy, label).toBe("private");
      expect(Object.isFrozen(describeFact(fact)), label).toBe(true);
    }
    expect(LIVE_FACT_REGISTRY["code-file-deletion"].privacy).toBe("committed");

    // Envelope scope binding rejects foreign cloneId and foreign worktreeId.
    const foreignClone = `clone:${"f".repeat(64)}`;
    const foreignWorktree = `wt:${"9".repeat(64)}`;
    expect(
      validateFactBatch({
        ...built.batch,
        facts: [{ ...committed, cloneId: foreignClone }],
      }).ok,
    ).toBe(false);
    expect(
      validateFactBatch({
        ...built.batch,
        scope: WORKTREE_SCOPE,
        facts: [{ ...committed, worktreeId: foreignWorktree }],
      }).ok,
    ).toBe(false);

    // Malformed / invariant-violating shapes must be refused.
    const malformed: readonly [string, unknown][] = [
      ["unknown extra key", { ...committed, receiptToken: "secret" }],
      ["wrong kind", { ...committed, kind: "code-analysis" }],
      ["wrong schemaVersion", { ...committed, schemaVersion: 2 }],
      ["same beforeTree and afterTree", { ...committed, afterTree: committed.beforeTree }],
      ["mismatched OID algorithms", { ...committed, afterTree: { algorithm: "sha256", oid: SHA256_A } }],
      ["afterTree null without snapshotId", { ...committed, afterTree: null, snapshotId: null }],
      ["beforeTree null without snapshotId", { ...committed, beforeTree: null, snapshotId: null }],
      ["leading slash path", { ...committed, path: enc("/src/service.ts") }],
      ["trailing slash path", { ...committed, path: enc("src/service.ts/") }],
      ["dot segment path", { ...committed, path: enc("./src/service.ts") }],
      ["parent segment path", { ...committed, path: enc("src/../service.ts") }],
      ["empty segment path", { ...committed, path: enc("src//service.ts") }],
      ["NUL byte in path", { ...committed, path: Uint8Array.of(0x61, 0x00, 0x62) }],
      ["empty path", { ...committed, path: new Uint8Array(0) }],
      ["string path instead of Uint8Array", { ...committed, path: "src/service.ts" }],
      ["empty language", { ...committed, language: "" }],
      ["bad beforeContentHash", { ...committed, beforeContentHash: "not-hex" }],
      ["bad beforeTopologyHash", { ...committed, beforeTopologyHash: "not-hex" }],
      ["duplicate invalidatedSymbolIds", { ...committed, invalidatedSymbolIds: ["a", "a"], invalidatedSlots: ["s1", "s2"] }],
      ["duplicate invalidatedSlots", { ...committed, invalidatedSymbolIds: ["a", "b"], invalidatedSlots: ["s1", "s1"] }],
      ["mismatched invalidated lengths", { ...committed, invalidatedSymbolIds: ["a", "b"], invalidatedSlots: ["s1"] }],
      ["empty invalidatedSymbolId", { ...committed, invalidatedSymbolIds: [""], invalidatedSlots: ["s1"] }],
      ["empty invalidatedSlot", { ...committed, invalidatedSymbolIds: ["a"], invalidatedSlots: [""] }],
      ["unknown key inside unresolved item", { ...committed, unresolved: [{ ...committed.unresolved[0]!, extra: 1 }] }],
      ["invalid policyVersion", { ...committed, policyVersion: "policy/other" }],
      ["invalid snapshotId", { ...committed, snapshotId: "not-lsnap" }],
      ["invalid worktreeId", { ...committed, worktreeId: "bad worktree id" }],
    ];
    for (const [label, candidate] of malformed) {
      expect(validateCodeFileDeletionFact(candidate).ok, label).toBe(false);
      expect(validateLiveFact(candidate).ok, label).toBe(false);
    }
  });
});
