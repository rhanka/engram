// L3a-E2 — generation correlation, completion control and clone-scope fencing
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 9, 12;
// spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md §§2.3, 5.1, 12.1–12.3, 17.4;
// plan/09-BRANCH_LIVE_GIT_INDEXING.md L3a-E2).
//
// Neutral test suite: stays inside NEUTRAL_TEST_FILES (engram-live/* and node:
// builtins only — zero host, storage driver, root CLI or Python dependency).

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CONTENT_POLICY_VERSION,
  CONTRACT_VERSION,
  EXPLICIT_LIVE_CAPABILITY,
  FACT_SCHEMA_VERSION,
  GENERATION_COMPLETION_STATES,
  GENERATION_CONTROL_VERSION,
  GENERATION_CORRELATION_ROLE,
  IDENTITY_UNCERTAINTY_STATES,
  ID_KINDS,
  ID_PREFIXES,
  INITIAL_BINDING_REVISION,
  INITIAL_DECLARATION_REVISION,
  LIVE_VIEW_KINDS,
  LOCAL_DIFF_NORMALIZER_VERSION,
  MAX_FACT_BATCH_BYTES,
  NON_ACTIVATING_LIFECYCLE_KINDS,
  POLICY_VERSION,
  PRODUCER_NAME,
  STORAGE_KERNEL_AUTHORITY,
  canonicalIdKey,
  isPublishedGenerationOutcome,
  isStorageIssuedGenerationId,
  isStrictGenerationId,
  validateAuthorizingDeclarationRef,
  validateBatchDeliveryReceipt,
  validateFactBatch,
  validateGenerationCompletionMessage,
  validateGenerationCompletionOutcome,
  validateGenerationSourceBoundary,
  validateLiveFact,
  validateProducerGenerationCorrelation,
  validateStorageGenerationCorrelationRecord,
  type AuthorizingDeclarationRefDto,
  type BatchDeliveryReceiptDto,
  type CommitFactDto,
  type CommittedSourceBoundaryDto,
  type FactBatchDto,
  type GenerationCompletionMessageDto,
  type GenerationCompletionOutcomeDto,
  type GenerationCoverageSummaryDto,
  type LocalCoverageReportDto,
  type LocalDiffDto,
  type LocalSnapshotDto,
  type PrivateSourceBoundaryDto,
  type ProducerGenerationCorrelationDto,
  type RefObservationFactDto,
  type StorageGenerationCorrelationRecordDto,
} from "../engram-live/contracts.js";
import {
  deriveCloneIdentity as integrationDeriveCloneIdentity,
  deriveDeclarationIdentity as integrationDeriveDeclarationIdentity,
  deriveWorktreeIdentity as integrationDeriveWorktreeIdentity,
  validateScopeFencingToken,
  type ScopeFencingTokenDto,
} from "../engram-live/integration.js";
import {
  deriveCloneIdentity,
  deriveDeclarationIdentity,
  deriveWorktreeIdentity,
} from "../engram-live/registration.js";
import { BatchCodecError, buildFactBatch } from "../engram-live/batch-codec.js";
import * as generationModule from "../engram-live/generation.js";
import {
  GenerationControlError,
  assertCorrelationMatchesBatch,
  assertValidViewFencingToken,
  buildGenerationCompletionMessage,
  classifyBatchReceipt,
  computeLogicalBatchSetRoot,
  createGenerationCorrelation,
  createGenerationSession,
  formatProducerGenerationId,
  verifyGenerationCompletionMessage,
  verifyGenerationCompletionOutcome,
  verifyStorageCorrelationRecord,
  type GenerationBatchSinkPort,
  type GenerationCompletionPort,
} from "../engram-live/generation.js";

const enc = (text: string): Uint8Array => new TextEncoder().encode(text);
const sha256Hex = (input: string): string => createHash("sha256").update(input, "utf8").digest("hex");

const SHA1_A = "a".repeat(40);
const SHA1_B = "b".repeat(40);
const SHA1_C = "c".repeat(40);
const HEX64_1 = "1".repeat(64);
const HEX64_2 = "2".repeat(64);
const HEX64_3 = "3".repeat(64);

const TENANT = "local:owner-1";
const HOST_SCOPE = "host:l3a-e2";

function deriveFixtureIdentities() {
  const clone = deriveCloneIdentity({
    hostScope: HOST_SCOPE,
    commonDirRealpath: "/srv/repo/.git",
    commonDirProjectFingerprint: "proj-fp-01",
    identityUncertainty: [],
    oidAlgorithm: "sha1",
  });
  const siblingClone = deriveCloneIdentity({
    hostScope: HOST_SCOPE,
    commonDirRealpath: "/srv/repo-copy/.git",
    commonDirProjectFingerprint: "proj-fp-01",
    identityUncertainty: [],
    oidAlgorithm: "sha1",
  });
  const mainWt = deriveWorktreeIdentity({
    hostScope: HOST_SCOPE,
    clone,
    worktreePath: "/srv/repo",
    gitDir: "/srv/repo/.git",
    worktreeFingerprint: "ws:main",
    identityUncertainty: [],
  });
  const linkedWt = deriveWorktreeIdentity({
    hostScope: HOST_SCOPE,
    clone,
    worktreePath: "/srv/repo-wt-feat",
    gitDir: "/srv/repo/.git/worktrees/feat",
    worktreeFingerprint: "ws:feat",
    identityUncertainty: [],
  });
  const mainDecl = deriveDeclarationIdentity({ hostScope: HOST_SCOPE, clone, worktree: mainWt });
  const linkedDecl = deriveDeclarationIdentity({ hostScope: HOST_SCOPE, clone, worktree: linkedWt });
  return { clone, siblingClone, mainWt, linkedWt, mainDecl, linkedDecl };
}

function committedDeclarationRef(declarationRevision = 1): AuthorizingDeclarationRefDto {
  const { mainDecl } = deriveFixtureIdentities();
  return {
    declarationId: mainDecl.declarationId,
    cloneId: mainDecl.cloneId,
    worktreeId: mainDecl.worktreeId,
    declarationRevision,
  };
}

function linkedDeclarationRef(declarationRevision = 1): AuthorizingDeclarationRefDto {
  const { linkedDecl } = deriveFixtureIdentities();
  return {
    declarationId: linkedDecl.declarationId,
    cloneId: linkedDecl.cloneId,
    worktreeId: linkedDecl.worktreeId,
    declarationRevision,
  };
}

function sampleCommittedBoundary(overrides?: Partial<CommittedSourceBoundaryDto>): CommittedSourceBoundaryDto {
  return {
    view: "committed",
    oidAlgorithm: "sha1",
    observedAt: 1_700_000_010_000,
    refsFingerprint: HEX64_1,
    headCommit: { algorithm: "sha1", oid: SHA1_A },
    rootOids: [{ algorithm: "sha1", oid: SHA1_A }],
    configAttributesFingerprint: HEX64_2,
    completeHistoryFrontier: true,
    ...overrides,
  };
}

function samplePrivateBoundary(
  worktreeId: string,
  overrides?: Partial<PrivateSourceBoundaryDto>,
): PrivateSourceBoundaryDto {
  return {
    view: "private",
    oidAlgorithm: "sha1",
    observedAt: 1_700_000_020_000,
    worktreeId,
    headCommit: { algorithm: "sha1", oid: SHA1_A },
    captureStable: true,
    snapshotIds: [`lsnap:${HEX64_3}`],
    configAttributesFingerprint: HEX64_2,
    contentFingerprintMode: "disposable-keyed",
    disposableContentFingerprint: HEX64_1,
    disposableKeyRef: "key:local-wt-1",
    ...overrides,
  };
}

function sampleCommittedCorrelation(
  sequence = 1,
  authorizingDeclaration = committedDeclarationRef(),
  boundaryOverrides?: Partial<CommittedSourceBoundaryDto>,
): ProducerGenerationCorrelationDto {
  return createGenerationCorrelation({
    producerGenerationId: formatProducerGenerationId(sequence),
    policyVersion: POLICY_VERSION,
    view: "committed",
    scope: { tenant: TENANT, clone: authorizingDeclaration.cloneId },
    authorizingDeclaration,
    sourceBoundary: sampleCommittedBoundary(boundaryOverrides),
  });
}

function samplePrivateCorrelation(
  sequence = 2,
  authorizingDeclaration = committedDeclarationRef(),
  boundaryOverrides?: Partial<PrivateSourceBoundaryDto>,
): ProducerGenerationCorrelationDto {
  return createGenerationCorrelation({
    producerGenerationId: formatProducerGenerationId(sequence),
    policyVersion: CONTENT_POLICY_VERSION,
    view: "private",
    scope: {
      tenant: TENANT,
      clone: authorizingDeclaration.cloneId,
      worktree: authorizingDeclaration.worktreeId,
    },
    authorizingDeclaration,
    sourceBoundary: samplePrivateBoundary(authorizingDeclaration.worktreeId, boundaryOverrides),
  });
}

function sampleCloneToken(
  cloneId: string,
  overrides?: Partial<ScopeFencingTokenDto>,
): ScopeFencingTokenDto {
  return {
    tokenId: "fence:clone:e1:m1",
    scope: { tenant: TENANT, clone: cloneId },
    epoch: 1,
    epochId: "epoch-1",
    declarationRevision: 1,
    projectionIncarnation: "incarnation-1",
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000,
    ...overrides,
  };
}

function sampleWorktreeToken(
  cloneId: string,
  worktreeId: string,
  overrides?: Partial<ScopeFencingTokenDto>,
): ScopeFencingTokenDto {
  return {
    tokenId: "fence:wt:e1:m1",
    scope: { tenant: TENANT, clone: cloneId, worktree: worktreeId },
    epoch: 1,
    epochId: "epoch-1",
    declarationRevision: 1,
    projectionIncarnation: "incarnation-1",
    issuedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000,
    ...overrides,
  };
}

function sampleCommitFact(cloneId: string, oid = SHA1_A): CommitFactDto {
  return {
    kind: "commit",
    schemaVersion: FACT_SCHEMA_VERSION,
    cloneId,
    commit: { algorithm: "sha1", oid },
    tree: { algorithm: "sha1", oid: SHA1_B },
    parents: [{ algorithm: "sha1", oid: SHA1_C }],
    author: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 0 },
    committer: { name: "Ada", email: "ada@example.test", unixSeconds: 1_700_000_000, offsetMinutes: 0 },
    subject: "initial live commit",
    message: enc("initial live commit\n"),
    extractorVersion: "git-stream/1",
    policyVersion: POLICY_VERSION,
  };
}

function sampleRefFact(cloneId: string, oid = SHA1_A): RefObservationFactDto {
  return {
    kind: "ref-observation",
    schemaVersion: FACT_SCHEMA_VERSION,
    observationId: `refobs:${HEX64_1}`,
    cloneId,
    refName: "refs/heads/main",
    refKind: "local-branch",
    algorithm: "sha1",
    target: { algorithm: "sha1", oid },
    observedAt: 1_700_000_005_000,
    absent: false,
    generation: 1,
    tipCommitterUnixSeconds: 1_700_000_000,
  };
}

function samplePrivateFacts(cloneId: string, worktreeId: string): [LocalDiffDto, LocalSnapshotDto, LocalCoverageReportDto] {
  const diff: LocalDiffDto = {
    scope: { tenant: TENANT, clone: cloneId, worktree: worktreeId },
    worktreeId,
    kind: "unstaged",
    base: { label: "index", oid: SHA1_A },
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
        oldOid: SHA1_A,
        newOid: SHA1_B,
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
              keyRef: "key:local-wt-1",
              ciphertext: enc("sealed-bytes"),
            },
          },
        ],
      },
    ],
  };
  const snapshot: LocalSnapshotDto = {
    scope: { tenant: TENANT, clone: cloneId, worktree: worktreeId },
    worktreeId,
    snapshotId: `lsnap:${HEX64_3}`,
    kind: "working-tree",
    diffKind: "unstaged",
    capturedAt: 1_700_000_020_000,
    diffDigest: HEX64_2,
    sealed: {
      state: "sealed",
      algorithm: "fake-seal/1",
      keyRef: "key:local-wt-1",
      ciphertext: enc("sealed-snapshot-bytes"),
    },
    policyVersion: CONTENT_POLICY_VERSION,
  };
  const coverage: LocalCoverageReportDto = {
    axis: "working-tree",
    state: "current",
    reason: "current:sealed-latest",
  };
  return [diff, snapshot, coverage];
}

function currentCommittedCoverage(): readonly GenerationCoverageSummaryDto[] {
  return [
    { axis: "refs", state: "current", reason: "refs reconciled", pendingCount: 0, complete: true },
    { axis: "dag", state: "current", reason: "dag reconciled", pendingCount: 0, complete: true },
  ];
}

function makeBatchReceipt(
  batch: FactBatchDto,
  byteLength: number,
  receiptId: string,
  options?: { readonly finalBatch?: boolean; readonly receivedAt?: number },
): BatchDeliveryReceiptDto {
  return {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "batch-receipt",
    received: true,
    published: false,
    completeBatch: true,
    producerGenerationId: batch.generationId,
    batchId: batch.batchId,
    batchDigest: batch.batchDigest,
    receiptId,
    byteLength,
    ...(options?.finalBatch !== undefined ? { finalBatch: options.finalBatch } : {}),
    receivedAt: options?.receivedAt ?? 1_700_000_030_000,
  };
}

describe("L3a-E2 generation correlation, completion control and clone-scope fencing", () => {
  // — RED 1 —
  it("a producer generation id is a correlation identity and never a storage capability", () => {
    expect(LIVE_VIEW_KINDS).toEqual(["committed", "private"]);
    expect(GENERATION_COMPLETION_STATES).toEqual(["complete", "partial", "aborted"]);

    const producerGenId = formatProducerGenerationId(1);
    expect(producerGenId).toBe("gen:0000000001");
    expect(isStrictGenerationId(producerGenId)).toBe(true);
    // Monotonic lexicographic order matches numeric order.
    expect(formatProducerGenerationId(10) > formatProducerGenerationId(9)).toBe(true);
    expect(() => formatProducerGenerationId(0)).toThrow(GenerationControlError);
    expect(() => formatProducerGenerationId(-1)).toThrow(GenerationControlError);
    expect(() => formatProducerGenerationId(1.5)).toThrow(GenerationControlError);
    expect(() => formatProducerGenerationId(10_000_000_000)).toThrow(GenerationControlError);

    // Producer-supplied correlation strings are NEVER storage-issued generation identities.
    expect(isStorageIssuedGenerationId(producerGenId)).toBe(false);
    expect(isStorageIssuedGenerationId("gen:9999999999")).toBe(false);
    expect(isStorageIssuedGenerationId("  gen:0000000001  ")).toBe(false);
    expect(isStorageIssuedGenerationId(" kgen:leading-space")).toBe(false);
    expect(isStorageIssuedGenerationId("")).toBe(false);
    expect(isStorageIssuedGenerationId("   ")).toBe(false);
    expect(isStorageIssuedGenerationId("kgen:\0bad")).toBe(false);
    expect(isStorageIssuedGenerationId("kgen:0193c4f2-storage-issued")).toBe(true);

    // The neutral module exports NO function that mints a storage-issued generation id,
    // seal, incarnation, pointer version or storage capability token.
    const exportNames = Object.keys(generationModule);
    for (const forbidden of [
      "mintStorageGenerationId",
      "createStorageGenerationId",
      "issueStorageGeneration",
      "createStorageCorrelationRecord",
      "mintFencingToken",
      "mintPublicationReceipt",
      "mintSeal",
    ]) {
      expect(exportNames).not.toContain(forbidden);
    }

    // Committed correlation is clone-scoped (worktree absent) with a non-interchangeable
    // authorizing declaration (SPEC_L3A §12.1).
    const mainRef = committedDeclarationRef(1);
    const linkedRef = linkedDeclarationRef(1);
    const correlation = sampleCommittedCorrelation(1, mainRef);
    expect(correlation.controlVersion).toBe(GENERATION_CONTROL_VERSION);
    expect(correlation.kind).toBe("generation-correlation");
    expect(correlation.role).toBe(GENERATION_CORRELATION_ROLE);
    expect(correlation.scope.worktree).toBeUndefined();
    expect(correlation.authorizingDeclaration.declarationId).toBe(mainRef.declarationId);
    expect(validateProducerGenerationCorrelation(correlation).ok).toBe(true);

    // Two linked worktrees on the same clone produce distinct authorizing declarations.
    const linkedCorrelation = sampleCommittedCorrelation(1, linkedRef);
    expect(linkedCorrelation.scope).toEqual(correlation.scope);
    expect(linkedCorrelation.authorizingDeclaration.declarationId).not.toBe(
      correlation.authorizingDeclaration.declarationId,
    );
    expect(linkedCorrelation.authorizingDeclaration.worktreeId).not.toBe(
      correlation.authorizingDeclaration.worktreeId,
    );

    // Defensive immutability: mutating caller inputs after creation does not mutate the correlation.
    const mutableBoundary = sampleCommittedBoundary();
    const mutableRoots = [...mutableBoundary.rootOids];
    const builtFromMutable = createGenerationCorrelation({
      producerGenerationId: producerGenId,
      policyVersion: POLICY_VERSION,
      view: "committed",
      scope: { tenant: TENANT, clone: mainRef.cloneId },
      authorizingDeclaration: { ...mainRef },
      sourceBoundary: { ...mutableBoundary, rootOids: mutableRoots },
    });
    mutableRoots.push({ algorithm: "sha1", oid: SHA1_C });
    expect(builtFromMutable.sourceBoundary.view).toBe("committed");
    if (builtFromMutable.sourceBoundary.view === "committed") {
      expect(builtFromMutable.sourceBoundary.rootOids).toHaveLength(1);
    }

    // Smuggling any storage capability or storage-issued identity field into a producer
    // correlation is refused by exact-key validation.
    for (const smuggled of [
      { storageGenerationId: "kgen:forged" },
      { kernelGenerationId: "kgen:forged" },
      { storeIncarnation: "incarnation-1" },
      { pointerVersion: 1 },
      { storageCapability: "cap:forged" },
      { seal: "seal:forged" },
      { publicationReceiptId: "pub:forged" },
    ]) {
      expect(
        validateProducerGenerationCorrelation({ ...correlation, ...smuggled }).ok,
        `smuggled field ${Object.keys(smuggled).join(",")} must be refused`,
      ).toBe(false);
    }
    expect(
      validateProducerGenerationCorrelation({ ...correlation, role: "storage-capability" }).ok,
    ).toBe(false);

    // A committed correlation refuses a worktree on scope, a mismatched cloneId,
    // CONTENT_POLICY_VERSION, or a private source boundary.
    expect(
      validateProducerGenerationCorrelation({
        ...correlation,
        scope: { ...correlation.scope, worktree: mainRef.worktreeId },
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...correlation,
        policyVersion: CONTENT_POLICY_VERSION,
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...correlation,
        authorizingDeclaration: { ...mainRef, cloneId: deriveFixtureIdentities().siblingClone.cloneId },
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...correlation,
        sourceBoundary: samplePrivateBoundary(mainRef.worktreeId),
      }).ok,
    ).toBe(false);

    // A private correlation requires scope.worktree === authorizingDeclaration.worktreeId === sourceBoundary.worktreeId
    // and enforces disposable-fingerprint policy (SPEC_L3A §§5.1, 12.2).
    const privateCorr = samplePrivateCorrelation(2, mainRef);
    expect(validateProducerGenerationCorrelation(privateCorr).ok).toBe(true);
    expect(
      validateProducerGenerationCorrelation({
        ...privateCorr,
        scope: { tenant: TENANT, clone: mainRef.cloneId },
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...privateCorr,
        sourceBoundary: samplePrivateBoundary(linkedRef.worktreeId),
      }).ok,
    ).toBe(false);
    // Unkeyed fingerprint or disposable fingerprint without keyRef is refused.
    expect(
      validateProducerGenerationCorrelation({
        ...privateCorr,
        sourceBoundary: {
          ...samplePrivateBoundary(mainRef.worktreeId),
          contentFingerprintMode: "unkeyed",
        },
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...privateCorr,
        sourceBoundary: {
          ...samplePrivateBoundary(mainRef.worktreeId),
          contentFingerprintMode: "disposable-keyed",
          disposableKeyRef: undefined,
        },
      }).ok,
    ).toBe(false);
    expect(
      validateProducerGenerationCorrelation({
        ...privateCorr,
        sourceBoundary: {
          view: "private",
          oidAlgorithm: "sha1",
          observedAt: 1_700_000_020_000,
          worktreeId: mainRef.worktreeId,
          headCommit: { algorithm: "sha1", oid: SHA1_A },
          captureStable: true,
          snapshotIds: [],
          configAttributesFingerprint: HEX64_2,
          contentFingerprintMode: "none",
          disposableContentFingerprint: HEX64_1,
        },
      }).ok,
    ).toBe(false);
    // Mode "none" with no fingerprint fields is valid.
    expect(
      validateProducerGenerationCorrelation(
        samplePrivateCorrelation(3, mainRef, {
          contentFingerprintMode: "none",
          disposableContentFingerprint: undefined,
          disposableKeyRef: undefined,
        }),
      ).ok,
    ).toBe(true);

    // Storage-owned correlation record maps producerGenerationId -> distinct kernel storageGenerationId.
    const validRecord: StorageGenerationCorrelationRecordDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "storage-generation-correlation",
      authority: STORAGE_KERNEL_AUTHORITY,
      producerGenerationId: correlation.producerGenerationId,
      storageGenerationId: "kgen:0193c4f2-0001",
      storeIncarnation: "incarnation-1",
      view: "committed",
      scope: correlation.scope,
      mappedAt: 1_700_000_011_000,
    };
    expect(validateStorageGenerationCorrelationRecord(validRecord).ok).toBe(true);
    expect(verifyStorageCorrelationRecord(validRecord, correlation)).toEqual(validRecord);

    // A producer generation id CANNOT impersonate a kernel-issued storageGenerationId!
    expect(
      validateStorageGenerationCorrelationRecord({
        ...validRecord,
        storageGenerationId: correlation.producerGenerationId,
      }).ok,
    ).toBe(false);
    expect(
      validateStorageGenerationCorrelationRecord({
        ...validRecord,
        storageGenerationId: formatProducerGenerationId(99),
      }).ok,
    ).toBe(false);
    expect(
      validateStorageGenerationCorrelationRecord({
        ...validRecord,
        authority: "producer",
      }).ok,
    ).toBe(false);
    expect(() =>
      verifyStorageCorrelationRecord(
        { ...validRecord, producerGenerationId: formatProducerGenerationId(2) },
        correlation,
      ),
    ).toThrow(GenerationControlError);

    // Generation control messages are NOT batch facts (no new fact kind added by L3a-E2).
    expect(validateLiveFact(correlation).ok).toBe(false);
    expect(validateLiveFact(validRecord).ok).toBe(false);
    expect(validateFactBatch(correlation).ok).toBe(false);
  });

  // — RED 2 —
  it("a final batch receipt is not publication and completion is a separate neutral message", async () => {
    const decl = committedDeclarationRef(1);
    const correlation = sampleCommittedCorrelation(1, decl);
    const cloneToken = sampleCloneToken(decl.cloneId);

    const builtA = buildFactBatch({
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:0001",
      facts: [sampleRefFact(decl.cloneId)],
    });
    const builtB = buildFactBatch({
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:0002",
      facts: [sampleCommitFact(decl.cloneId)],
    });

    // Order-independent logical content root (SPEC_L3A §12.2):
    // [A, B] and [B, A] produce the exact same root; a changed digest changes the root.
    const rootAB = computeLogicalBatchSetRoot([
      { batchId: builtA.batch.batchId, batchDigest: builtA.batch.batchDigest },
      { batchId: builtB.batch.batchId, batchDigest: builtB.batch.batchDigest },
    ]);
    const rootBA = computeLogicalBatchSetRoot([
      { batchId: builtB.batch.batchId, batchDigest: builtB.batch.batchDigest },
      { batchId: builtA.batch.batchId, batchDigest: builtA.batch.batchDigest },
    ]);
    const rootChanged = computeLogicalBatchSetRoot([
      { batchId: builtA.batch.batchId, batchDigest: builtA.batch.batchDigest },
      { batchId: builtB.batch.batchId, batchDigest: HEX64_3 },
    ]);
    expect(rootAB).toBe(rootBA);
    expect(rootChanged).not.toBe(rootAB);

    const deliveredBatches: string[] = [];
    const receivedCompletions: GenerationCompletionMessageDto[] = [];
    let sinkReturnsPublishedFlag = false;

    const sink: GenerationBatchSinkPort = {
      async deliver(batch, encoded) {
        deliveredBatches.push(batch.batchId);
        const receipt = makeBatchReceipt(
          batch,
          encoded.byteLength,
          `rcpt:${batch.batchId}`,
          { finalBatch: batch.batchId === "batch:0002" },
        );
        if (sinkReturnsPublishedFlag) {
          return { ...receipt, published: true } as unknown as BatchDeliveryReceiptDto;
        }
        return receipt;
      },
    };

    let nextOutcomeKind: "published" | "staged" | "rejected" | "echo-producer-id" | "reuse-batch-receipt" = "published";
    const completion: GenerationCompletionPort = {
      async complete(message) {
        receivedCompletions.push(message);
        if (nextOutcomeKind === "staged") {
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "staged",
            published: false,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:staged-01",
            storeIncarnation: "incarnation-1",
            stagedAt: 1_700_000_040_000,
          };
        }
        if (nextOutcomeKind === "rejected") {
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "rejected",
            published: false,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            rejectionCode: "stale-base",
            reason: "hot work published G1 while historical pass staged against G0",
            rejectedAt: 1_700_000_040_000,
          };
        }
        if (nextOutcomeKind === "echo-producer-id") {
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: message.producerGenerationId, // FORBIDDEN: echoing producer id!
            storeIncarnation: "incarnation-1",
            pointerVersion: 2,
            publicationReceiptId: "pubrcpt:0001",
            publishedAt: 1_700_000_040_000,
          };
        }
        if (nextOutcomeKind === "reuse-batch-receipt") {
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:published-02",
            storeIncarnation: "incarnation-1",
            pointerVersion: 2,
            publicationReceiptId: "rcpt:batch:0002", // FORBIDDEN: reusing batch receipt as publication receipt!
            publishedAt: 1_700_000_040_000,
          };
        }
        return {
          controlVersion: GENERATION_CONTROL_VERSION,
          kind: "generation-completion-outcome",
          authority: STORAGE_KERNEL_AUTHORITY,
          status: "published",
          published: true,
          producerGenerationId: message.producerGenerationId,
          completionMessageDigest: message.messageDigest,
          view: message.view,
          scope: message.scope,
          storageGenerationId: "kgen:published-01",
          storeIncarnation: "incarnation-1",
          pointerVersion: 2,
          publicationReceiptId: "pubrcpt:0001",
          publishedAt: 1_700_000_040_000,
        };
      },
    };

    const session = createGenerationSession(correlation, { batchSink: sink, completion });
    expect(session.state()).toBe("staging");
    expect(session.isPublished()).toBe(false);

    // Deliver batch 1 -> durable receipt, NOT published.
    const receiptA = await session.deliverBatch(builtA.batch, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs: 1_700_000_025_000,
    });
    expect(receiptA.received).toBe(true);
    expect(receiptA.published).toBe(false);
    expect(receiptA.completeBatch).toBe(true);
    expect(classifyBatchReceipt(receiptA)).toBe("staged-not-published");
    expect(session.isPublished()).toBe(false);

    // Idempotent retry of batch 1 succeeds without duplicating manifest entries.
    const receiptARetry = await session.deliverBatch(builtA.batch, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs: 1_700_000_026_000,
    });
    expect(receiptARetry.receiptId).toBe(receiptA.receiptId);
    expect(session.receipts()).toHaveLength(1);

    // Same batchId with different bytes is refused BEFORE calling the sink!
    const conflictingBatchA = buildFactBatch({
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:0001",
      facts: [sampleCommitFact(decl.cloneId)],
    });
    const deliveriesBeforeConflict = deliveredBatches.length;
    await expect(
      session.deliverBatch(conflictingBatchA.batch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_027_000,
      }),
    ).rejects.toMatchObject({ code: "duplicate-batch-conflict" });
    expect(deliveredBatches.length).toBe(deliveriesBeforeConflict);

    // Oversized batch (> 4 MiB) is refused BEFORE calling the sink!
    const hugeFact: CommitFactDto = {
      ...sampleCommitFact(decl.cloneId),
      message: new Uint8Array(MAX_FACT_BATCH_BYTES + 64).fill(0x61),
    };
    const hugeBatch: FactBatchDto = {
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:huge",
      batchDigest: sha256Hex("placeholder"),
      facts: [hugeFact],
    };
    const deliveriesBeforeHuge = deliveredBatches.length;
    await expect(
      session.deliverBatch(hugeBatch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_028_000,
        verifyDigest: false,
      }),
    ).rejects.toBeInstanceOf(BatchCodecError);
    expect(deliveredBatches.length).toBe(deliveriesBeforeHuge);

    // Committed correlation refuses private L4b facts BEFORE calling the sink!
    const [privDiff, privSnap, privCov] = samplePrivateFacts(decl.cloneId, decl.worktreeId);
    const leakedPrivateBatch = buildFactBatch({
      scope: { tenant: TENANT, clone: decl.cloneId, worktree: decl.worktreeId },
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:priv-leak",
      facts: [privDiff, privSnap, privCov],
    });
    expect(() => assertCorrelationMatchesBatch(correlation, leakedPrivateBatch.batch)).toThrow(
      GenerationControlError,
    );

    // Deliver the FINAL batch (batch:0002). Receipt carries finalBatch: true, yet:
    //   - published is STILL false;
    //   - classifyBatchReceipt still returns "staged-not-published";
    //   - validateGenerationCompletionOutcome refuses the final batch receipt;
    //   - isPublishedGenerationOutcome(receiptB) is false;
    //   - session.isPublished() is STILL false and completion port has ZERO calls!
    const receiptB = await session.deliverBatch(builtB.batch, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs: 1_700_000_029_000,
    });
    expect(receiptB.finalBatch).toBe(true);
    expect(receiptB.published).toBe(false);
    expect(classifyBatchReceipt(receiptB)).toBe("staged-not-published");
    expect(validateBatchDeliveryReceipt(receiptB).ok).toBe(true);
    expect(validateGenerationCompletionOutcome(receiptB).ok).toBe(false);
    expect(isPublishedGenerationOutcome(receiptB)).toBe(false);
    expect(session.state()).toBe("staging");
    expect(session.isPublished()).toBe(false);
    expect(receivedCompletions).toHaveLength(0);

    // A malformed batch receipt claiming published: true or completeBatch: false is refused.
    expect(validateBatchDeliveryReceipt({ ...receiptB, published: true }).ok).toBe(false);
    expect(validateBatchDeliveryReceipt({ ...receiptB, completeBatch: false }).ok).toBe(false);
    expect(() => classifyBatchReceipt({ ...receiptB, published: true })).toThrow(GenerationControlError);
    sinkReturnsPublishedFlag = true;
    const badSinkSession = createGenerationSession(correlation, { batchSink: sink, completion });
    await expect(
      badSinkSession.deliverBatch(builtB.batch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_029_000,
      }),
    ).rejects.toMatchObject({ code: "invalid-receipt" });
    sinkReturnsPublishedFlag = false;

    // Now emit the SEPARATE neutral completion message -> storage publishes with a
    // distinct kernel-issued storageGenerationId and publicationReceiptId!
    const result = await session.complete(
      {
        completionState: "complete",
        coverage: currentCommittedCoverage(),
        exclusions: [],
        errors: [],
        remainingWork: 0,
        completedAt: 1_700_000_035_000,
      },
      cloneToken,
      { expectedIncarnation: "incarnation-1", nowMs: 1_700_000_035_000 },
    );

    expect(receivedCompletions).toHaveLength(1);
    expect(result.message.kind).toBe("generation-completion");
    expect(result.message.role).toBe(GENERATION_CORRELATION_ROLE);
    expect(result.message.expectedBatchCount).toBe(2);
    expect(result.message.batches).toHaveLength(2);
    expect(result.message.logicalBatchSetRoot).toBe(rootAB);
    expect(validateGenerationCompletionMessage(result.message).ok).toBe(true);
    expect(verifyGenerationCompletionMessage(result.message)).toEqual(result.message);
    // Control messages are NOT batch facts.
    expect(validateLiveFact(result.message).ok).toBe(false);
    expect(validateLiveFact(receiptB).ok).toBe(false);
    expect(validateLiveFact(result.outcome).ok).toBe(false);

    // Tampering with logicalBatchSetRoot or messageDigest is caught by verifyGenerationCompletionMessage.
    expect(() =>
      verifyGenerationCompletionMessage({ ...result.message, logicalBatchSetRoot: HEX64_3 }),
    ).toThrow(GenerationControlError);
    expect(() =>
      verifyGenerationCompletionMessage({ ...result.message, remainingWork: 1 }),
    ).toThrow(GenerationControlError);

    // Publication succeeds ONLY via the separate storage outcome.
    expect(isPublishedGenerationOutcome(result.outcome)).toBe(true);
    expect(session.state()).toBe("published");
    expect(session.isPublished()).toBe(true);
    if (result.outcome.status === "published") {
      expect(result.outcome.storageGenerationId).toBe("kgen:published-01");
      expect(result.outcome.storageGenerationId).not.toBe(correlation.producerGenerationId);
      expect(result.outcome.publicationReceiptId).not.toBe(receiptB.receiptId);
    }

    // Session is closed after completion; no further batch or completion can be delivered.
    await expect(
      session.deliverBatch(builtA.batch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_036_000,
      }),
    ).rejects.toMatchObject({ code: "session-closed" });

    // Separate session where completion returns "staged" or "rejected" stays NOT published.
    for (const nonPublishedKind of ["staged", "rejected"] as const) {
      nextOutcomeKind = nonPublishedKind;
      const s = createGenerationSession(correlation, { batchSink: sink, completion });
      await s.deliverBatch(builtA.batch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_025_000,
      });
      const r = await s.complete(
        {
          completionState: "complete",
          coverage: currentCommittedCoverage(),
          exclusions: [],
          errors: [],
          remainingWork: 0,
          completedAt: 1_700_000_035_000,
        },
        cloneToken,
        { expectedIncarnation: "incarnation-1", nowMs: 1_700_000_035_000 },
      );
      expect(r.outcome.published).toBe(false);
      expect(isPublishedGenerationOutcome(r.outcome)).toBe(false);
      expect(s.isPublished()).toBe(false);
      expect(s.state()).toBe(nonPublishedKind);
    }

    // Storage outcome echoing producerGenerationId or reusing a batch receiptId as
    // publicationReceiptId is refused!
    for (const badKind of ["echo-producer-id", "reuse-batch-receipt"] as const) {
      nextOutcomeKind = badKind;
      const s = createGenerationSession(correlation, { batchSink: sink, completion });
      await s.deliverBatch(builtB.batch, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: 1_700_000_025_000,
      });
      await expect(
        s.complete(
          {
            completionState: "complete",
            coverage: currentCommittedCoverage(),
            exclusions: [],
            errors: [],
            remainingWork: 0,
            completedAt: 1_700_000_035_000,
          },
          cloneToken,
          { expectedIncarnation: "incarnation-1", nowMs: 1_700_000_035_000 },
        ),
      ).rejects.toThrow(GenerationControlError);
      expect(s.isPublished()).toBe(false);
    }

    // Truthful completion invariants (LIVE §9):
    // - "complete" refuses remainingWork > 0, non-empty errors, incomplete axis, or abortReason.
    expect(() =>
      buildGenerationCompletionMessage({
        correlation,
        receipts: [receiptA],
        completionState: "complete",
        coverage: currentCommittedCoverage(),
        exclusions: [],
        errors: [],
        remainingWork: 3,
        completedAt: 1_700_000_035_000,
      }),
    ).toThrow(GenerationControlError);
    expect(() =>
      buildGenerationCompletionMessage({
        correlation,
        receipts: [receiptA],
        completionState: "complete",
        coverage: [
          { axis: "refs", state: "current", reason: "ok", pendingCount: 0, complete: true },
          { axis: "dag", state: "partial", reason: "shallow boundary", pendingCount: 1, complete: false },
        ],
        exclusions: [],
        errors: [],
        remainingWork: 0,
        completedAt: 1_700_000_035_000,
      }),
    ).toThrow(GenerationControlError);

    // - "partial" truthfully carries partial historical coverage.
    const partialCorr = sampleCommittedCorrelation(4, decl, { completeHistoryFrontier: false });
    const partialBatch = buildFactBatch({
      scope: partialCorr.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: partialCorr.producerGenerationId,
      batchId: "batch:partial-1",
      facts: [sampleRefFact(decl.cloneId)],
    });
    const partialReceipt = makeBatchReceipt(partialBatch.batch, partialBatch.encoded.byteLength, "rcpt:partial-1");
    const partialMsg = buildGenerationCompletionMessage({
      correlation: partialCorr,
      receipts: [partialReceipt],
      completionState: "partial",
      coverage: [
        { axis: "refs", state: "current", reason: "refs reconciled", pendingCount: 0, complete: true },
        { axis: "dag", state: "partial", reason: "shallow boundary", pendingCount: 0, complete: false },
      ],
      exclusions: ["shallow-history"],
      errors: [],
      remainingWork: 0,
      completedAt: 1_700_000_035_000,
    });
    expect(validateGenerationCompletionMessage(partialMsg).ok).toBe(true);

    // - "aborted" requires abortReason and refuses a storage outcome claiming status: "published".
    expect(() =>
      buildGenerationCompletionMessage({
        correlation,
        receipts: [receiptA],
        completionState: "aborted",
        coverage: [{ axis: "refs", state: "pending", reason: "aborted", pendingCount: 1, complete: false }],
        exclusions: [],
        errors: ["fenced"],
        remainingWork: 1,
        completedAt: 1_700_000_035_000,
      }),
    ).toThrow(GenerationControlError);

    const abortedMsg = buildGenerationCompletionMessage({
      correlation,
      receipts: [receiptA],
      completionState: "aborted",
      coverage: [{ axis: "refs", state: "pending", reason: "aborted", pendingCount: 1, complete: false }],
      exclusions: [],
      errors: ["fenced"],
      remainingWork: 1,
      abortReason: "writer-lease-revoked",
      completedAt: 1_700_000_035_000,
    });
    expect(validateGenerationCompletionMessage(abortedMsg).ok).toBe(true);
    const bogusPublishedForAbort: GenerationCompletionOutcomeDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "generation-completion-outcome",
      authority: STORAGE_KERNEL_AUTHORITY,
      status: "published",
      published: true,
      producerGenerationId: abortedMsg.producerGenerationId,
      completionMessageDigest: abortedMsg.messageDigest,
      view: abortedMsg.view,
      scope: abortedMsg.scope,
      storageGenerationId: "kgen:should-not-publish-abort",
      storeIncarnation: "incarnation-1",
      pointerVersion: 3,
      publicationReceiptId: "pubrcpt:abort-bogus",
      publishedAt: 1_700_000_040_000,
    };
    expect(() => verifyGenerationCompletionOutcome(bogusPublishedForAbort, abortedMsg, [receiptA])).toThrow(
      GenerationControlError,
    );

    // Completion cannot fire while a batch delivery is still in flight.
    let releaseInFlight!: () => void;
    const inFlightGate = new Promise<void>((resolve) => {
      releaseInFlight = resolve;
    });
    const slowSession = createGenerationSession(correlation, {
      batchSink: {
        async deliver(batch, encoded) {
          await inFlightGate;
          return makeBatchReceipt(batch, encoded.byteLength, `rcpt:${batch.batchId}`);
        },
      },
      completion,
    });
    nextOutcomeKind = "published";
    const pendingDelivery = slowSession.deliverBatch(builtA.batch, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs: 1_700_000_025_000,
    });
    await expect(
      slowSession.complete(
        {
          completionState: "complete",
          coverage: currentCommittedCoverage(),
          exclusions: [],
          errors: [],
          remainingWork: 0,
          completedAt: 1_700_000_035_000,
        },
        cloneToken,
        { expectedIncarnation: "incarnation-1", nowMs: 1_700_000_035_000 },
      ),
    ).rejects.toMatchObject({ code: "invalid-completion" });
    releaseInFlight();
    await pendingDelivery;
    expect(slowSession.isPublished()).toBe(false);
  });

  // — RED 3 —
  it("a clone-scoped committed token validates without a worktree and a worktree mismatch is still refused", async () => {
    const { clone, siblingClone, mainWt, linkedWt } = deriveFixtureIdentities();
    const nowMs = 1_700_000_010_000;

    // 1. Clone-scoped committed token (worktree omitted) validates cleanly without a worktree!
    const cloneToken = sampleCloneToken(clone.cloneId);
    expect(validateScopeFencingToken(cloneToken)).toEqual({ ok: true, errors: [] });
    expect(
      validateScopeFencingToken(
        cloneToken,
        { tenant: TENANT, clone: clone.cloneId },
        "incarnation-1",
        nowMs,
      ),
    ).toEqual({ ok: true, errors: [] });

    // Explicit `worktree: undefined` on scope also validates as absent.
    const explicitUndefinedToken: ScopeFencingTokenDto = {
      ...cloneToken,
      scope: { tenant: TENANT, clone: clone.cloneId, worktree: undefined },
    };
    expect(
      validateScopeFencingToken(
        explicitUndefinedToken,
        { tenant: TENANT, clone: clone.cloneId },
        "incarnation-1",
        nowMs,
      ),
    ).toEqual({ ok: true, errors: [] });

    // 2. Worktree-scoped token validates when expectedScope carries the exact same worktree.
    const mainWtToken = sampleWorktreeToken(clone.cloneId, mainWt.worktreeId);
    expect(
      validateScopeFencingToken(
        mainWtToken,
        { tenant: TENANT, clone: clone.cloneId, worktree: mainWt.worktreeId },
        "incarnation-1",
        nowMs,
      ),
    ).toEqual({ ok: true, errors: [] });

    // 3. Exact equality with expectedScope.worktree (absent included):
    //    - clone-scoped token CANNOT validate against a worktree-scoped target (private write!).
    expect(
      validateScopeFencingToken(
        cloneToken,
        { tenant: TENANT, clone: clone.cloneId, worktree: mainWt.worktreeId },
        "incarnation-1",
        nowMs,
      ).ok,
    ).toBe(false);
    //    - worktree-scoped token CANNOT validate against a clone-scoped target.
    expect(
      validateScopeFencingToken(
        mainWtToken,
        { tenant: TENANT, clone: clone.cloneId },
        "incarnation-1",
        nowMs,
      ).ok,
    ).toBe(false);
    //    - worktree A token CANNOT validate against worktree B on the same clone.
    expect(
      validateScopeFencingToken(
        mainWtToken,
        { tenant: TENANT, clone: clone.cloneId, worktree: linkedWt.worktreeId },
        "incarnation-1",
        nowMs,
      ).ok,
    ).toBe(false);
    //    - clone A token CANNOT validate against clone B.
    expect(
      validateScopeFencingToken(
        cloneToken,
        { tenant: TENANT, clone: siblingClone.cloneId },
        "incarnation-1",
        nowMs,
      ).ok,
    ).toBe(false);
    //    - tenant A token CANNOT validate against tenant B.
    expect(
      validateScopeFencingToken(
        cloneToken,
        { tenant: "local:other-tenant", clone: clone.cloneId },
        "incarnation-1",
        nowMs,
      ).ok,
    ).toBe(false);

    // 4. Malformed worktree values (empty, whitespace, null, non-string, NUL, oversized) are refused!
    for (const badWorktree of ["", "   ", null, 42, "wt:\0bad", "w".repeat(1025)]) {
      expect(
        validateScopeFencingToken({
          ...cloneToken,
          scope: { tenant: TENANT, clone: clone.cloneId, worktree: badWorktree },
        }).ok,
        `malformed worktree ${JSON.stringify(badWorktree)} must be refused`,
      ).toBe(false);
    }

    // 5. Unknown keys, non-plain objects, wrong incarnation, expired/not-yet-valid, non-finite nowMs refused!
    expect(validateScopeFencingToken({ ...cloneToken, extra: true }).ok).toBe(false);
    expect(
      validateScopeFencingToken({
        ...cloneToken,
        scope: { ...cloneToken.scope, extra: true },
      }).ok,
    ).toBe(false);
    expect(validateScopeFencingToken(new Date()).ok).toBe(false);
    expect(validateScopeFencingToken([]).ok).toBe(false);
    expect(
      validateScopeFencingToken(cloneToken, { tenant: TENANT, clone: clone.cloneId }, "incarnation-2", nowMs).ok,
    ).toBe(false);
    expect(
      validateScopeFencingToken(cloneToken, { tenant: TENANT, clone: clone.cloneId }, "incarnation-1", cloneToken.expiresAt).ok,
    ).toBe(false);
    expect(
      validateScopeFencingToken(cloneToken, { tenant: TENANT, clone: clone.cloneId }, "incarnation-1", cloneToken.issuedAt - 1).ok,
    ).toBe(false);
    expect(
      validateScopeFencingToken(cloneToken, { tenant: TENANT, clone: clone.cloneId }, "incarnation-1", Number.NaN).ok,
    ).toBe(false);

    // 6. View-aware fencing enforcement: committed requires clone-scoped token;
    //    private requires worktree-scoped token (NEVER relaxed for private writes!).
    const committedCorr = sampleCommittedCorrelation(1, committedDeclarationRef(1));
    const privateCorr = samplePrivateCorrelation(2, committedDeclarationRef(1));
    const linkedWtToken = sampleWorktreeToken(clone.cloneId, linkedWt.worktreeId);

    expect(assertValidViewFencingToken(cloneToken, committedCorr, "incarnation-1", nowMs)).toEqual(cloneToken);
    expect(assertValidViewFencingToken(mainWtToken, privateCorr, "incarnation-1", nowMs)).toEqual(mainWtToken);

    // Clone-scoped token refused for private writes!
    expect(() => assertValidViewFencingToken(cloneToken, privateCorr, "incarnation-1", nowMs)).toThrow(
      GenerationControlError,
    );
    // Worktree-scoped token refused for committed writes!
    expect(() => assertValidViewFencingToken(mainWtToken, committedCorr, "incarnation-1", nowMs)).toThrow(
      GenerationControlError,
    );
    // Wrong worktree token refused for private writes!
    expect(() => assertValidViewFencingToken(linkedWtToken, privateCorr, "incarnation-1", nowMs)).toThrow(
      GenerationControlError,
    );
    // Stale declaration revision refused!
    expect(() =>
      assertValidViewFencingToken({ ...cloneToken, declarationRevision: 2 }, committedCorr, "incarnation-1", nowMs),
    ).toThrow(GenerationControlError);

    // 7. End-to-end session refusal: a clone-scoped token cannot deliver a private batch,
    //    and a wrong-worktree token cannot deliver or complete a private generation (0 sink calls!).
    let sinkCalls = 0;
    let completionCalls = 0;
    const privSession = createGenerationSession(privateCorr, {
      batchSink: {
        async deliver(batch, encoded) {
          sinkCalls += 1;
          return makeBatchReceipt(batch, encoded.byteLength, `rcpt:${batch.batchId}`);
        },
      },
      completion: {
        async complete(message) {
          completionCalls += 1;
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:priv-01",
            storeIncarnation: "incarnation-1",
            pointerVersion: 1,
            publicationReceiptId: "pubrcpt:priv-01",
            publishedAt: 1_700_000_040_000,
          };
        },
      },
    });
    const privBatch = buildFactBatch({
      scope: privateCorr.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: CONTENT_POLICY_VERSION,
      generationId: privateCorr.producerGenerationId,
      batchId: "batch:priv-1",
      facts: samplePrivateFacts(clone.cloneId, mainWt.worktreeId),
    });

    await expect(
      privSession.deliverBatch(privBatch.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toMatchObject({ code: "invalid-fencing-token" });
    await expect(
      privSession.deliverBatch(privBatch.batch, linkedWtToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toMatchObject({ code: "invalid-fencing-token" });
    expect(sinkCalls).toBe(0);
    expect(completionCalls).toBe(0);

    // Matching worktree token delivers private batch and completes cleanly.
    const privReceipt = await privSession.deliverBatch(privBatch.batch, mainWtToken, {
      expectedIncarnation: "incarnation-1",
      nowMs,
    });
    expect(sinkCalls).toBe(1);
    expect(privReceipt.published).toBe(false);
    expect(privSession.isPublished()).toBe(false);

    const privCompleted = await privSession.complete(
      {
        completionState: "complete",
        coverage: [
          { axis: "working-tree", state: "current", reason: "current:sealed-latest", pendingCount: 0, complete: true },
        ],
        exclusions: [],
        errors: [],
        remainingWork: 0,
        completedAt: 1_700_000_035_000,
      },
      mainWtToken,
      { expectedIncarnation: "incarnation-1", nowMs },
    );
    expect(completionCalls).toBe(1);
    expect(privCompleted.outcome.published).toBe(true);
    expect(privSession.isPublished()).toBe(true);
  });

  // — GUARD 4 —
  it("the L6a identity derivation is unchanged byte for byte", () => {
    // Frozen L6a constants stay identical.
    expect(ID_KINDS).toEqual(["clone", "worktree", "declaration"]);
    expect(ID_PREFIXES).toEqual({ clone: "clone:", worktree: "wt:", declaration: "decl:" });
    expect(INITIAL_DECLARATION_REVISION).toBe(1);
    expect(INITIAL_BINDING_REVISION).toBe(1);
    expect(IDENTITY_UNCERTAINTY_STATES).toEqual(["missing_history", "shallow_history"]);
    expect(POLICY_VERSION).toBe("live-git-indexing/1");
    expect(EXPLICIT_LIVE_CAPABILITY).toBe("live");
    expect(NON_ACTIVATING_LIFECYCLE_KINDS).toEqual([
      "bind",
      "upload",
      "code-workspace-create",
      "session-open",
      "session-end",
    ]);

    // integration.ts re-exports the exact registration.ts functions without wrapping or altering them.
    expect(integrationDeriveCloneIdentity).toBe(deriveCloneIdentity);
    expect(integrationDeriveWorktreeIdentity).toBe(deriveWorktreeIdentity);
    expect(integrationDeriveDeclarationIdentity).toBe(deriveDeclarationIdentity);

    // Exact canonical key serialization byte-for-byte.
    expect(canonicalIdKey("clone", [HOST_SCOPE, "/srv/repo/.git", "proj-fp-01"])).toBe(
      '["clone","host:l3a-e2","/srv/repo/.git","proj-fp-01"]',
    );
    expect(canonicalIdKey("worktree", [HOST_SCOPE, "/srv/repo/.git"])).toBe(
      '["worktree","host:l3a-e2","/srv/repo/.git"]',
    );

    // Pinned SHA-256 byte-for-byte derivation vectors verified both against pinned literals
    // and against independent node:crypto recomputation.
    const { clone, siblingClone, mainWt, linkedWt, mainDecl, linkedDecl } = deriveFixtureIdentities();
    const emptyClone = deriveCloneIdentity({
      hostScope: HOST_SCOPE,
      commonDirRealpath: "/srv/empty/.git",
      identityUncertainty: ["missing_history"],
      oidAlgorithm: "sha256",
    });
    const normalizedPathClone = deriveCloneIdentity({
      hostScope: HOST_SCOPE,
      commonDirRealpath: "/srv/repo/.git///",
      commonDirProjectFingerprint: "proj-fp-01",
      identityUncertainty: [],
      oidAlgorithm: "sha1",
    });

    expect(clone.cloneId).toBe(
      "clone:1035a2531f968bb28379f8246aa54c9914e66fca47b210597407d9f387d9ee6d",
    );
    expect(clone.cloneId).toBe(
      `clone:${sha256Hex(JSON.stringify(["clone", HOST_SCOPE, "/srv/repo/.git", "proj-fp-01"]))}`,
    );
    expect(normalizedPathClone.cloneId).toBe(clone.cloneId);
    expect(normalizedPathClone.commonDirRealpath).toBe("/srv/repo/.git");

    expect(emptyClone.cloneId).toBe(
      "clone:6b0c1ae2b486a0d47a1a14d233654b65c488c34f953378696f23bc0ce222cf6e",
    );
    expect(emptyClone.cloneId).toBe(
      `clone:${sha256Hex(JSON.stringify(["clone", HOST_SCOPE, "/srv/empty/.git", ""]))}`,
    );

    expect(siblingClone.cloneId).toBe(
      "clone:a0ee64512234a5da77a1b5c148e87f8a6839992bcb8b55ffdcf1fa235b5bb989",
    );
    expect(siblingClone.cloneId).not.toBe(clone.cloneId);

    expect(mainWt.worktreeId).toBe(
      "wt:bbd2b6f8e7843eb8500c47b2532a14f12cbb642583457738e2c9a82e8e470d85",
    );
    expect(mainWt.worktreeId).toBe(
      `wt:${sha256Hex(JSON.stringify(["worktree", HOST_SCOPE, "/srv/repo/.git"]))}`,
    );

    expect(linkedWt.worktreeId).toBe(
      "wt:a648ef8d0343d9acb99a3239b7cff1b13a78f1260aa6888e74346c3a6d5bb97a",
    );
    expect(linkedWt.cloneId).toBe(clone.cloneId);
    expect(linkedWt.worktreeId).not.toBe(mainWt.worktreeId);

    expect(mainDecl.declarationId).toBe(
      "decl:683caaa3d7aae6d63459d3f9643e36ceb7e6a315717cce364ca9186bb6252a8a",
    );
    expect(mainDecl.declarationId).toBe(
      `decl:${sha256Hex(JSON.stringify(["declaration", HOST_SCOPE, clone.cloneId, mainWt.worktreeId]))}`,
    );

    expect(linkedDecl.declarationId).toBe(
      "decl:653f511b6dd54b5dab0888f58f7084683d4a598cd664078b9daa798ec2aeef53",
    );
    expect(linkedDecl.declarationId).toBe(
      `decl:${sha256Hex(JSON.stringify(["declaration", HOST_SCOPE, clone.cloneId, linkedWt.worktreeId]))}`,
    );
    expect(linkedDecl.declarationId).not.toBe(mainDecl.declarationId);
  });

  // — Review Round 1: F-01 —
  it("F-01: authorizingDeclaration and private sourceBoundary enforce strict opaque prefixed ids", () => {
    const validRef = committedDeclarationRef(1);
    expect(validateAuthorizingDeclarationRef(validRef).ok).toBe(true);

    const validPrivateBoundary = samplePrivateBoundary(validRef.worktreeId);
    expect(validateGenerationSourceBoundary(validPrivateBoundary).ok).toBe(true);

    // Reject bare prefixes, trailing/embedded whitespace, free text, uppercase, NUL, and unbounded strings.
    const badSuffixes = ["", "   ", "unscreened { code }", "has space", "UPPER", "a\0b", "a".repeat(200)];

    for (const suffix of badSuffixes) {
      expect(
        validateAuthorizingDeclarationRef({
          ...validRef,
          declarationId: `${ID_PREFIXES.declaration}${suffix}`,
        }).ok,
        `declarationId with suffix ${JSON.stringify(suffix)} must be refused`,
      ).toBe(false);

      expect(
        validateAuthorizingDeclarationRef({
          ...validRef,
          cloneId: `${ID_PREFIXES.clone}${suffix}`,
        }).ok,
        `cloneId with suffix ${JSON.stringify(suffix)} must be refused`,
      ).toBe(false);

      expect(
        validateAuthorizingDeclarationRef({
          ...validRef,
          worktreeId: `${ID_PREFIXES.worktree}${suffix}`,
        }).ok,
        `worktreeId with suffix ${JSON.stringify(suffix)} must be refused`,
      ).toBe(false);

      expect(
        validateGenerationSourceBoundary({
          ...validPrivateBoundary,
          worktreeId: `${ID_PREFIXES.worktree}${suffix}`,
        }).ok,
        `private sourceBoundary.worktreeId with suffix ${JSON.stringify(suffix)} must be refused`,
      ).toBe(false);
    }

    // Committed correlation/completion messages omit scope.worktree, so authorizingDeclaration
    // validation is the sole guard on declarationId and worktreeId.
    const committedCorr = sampleCommittedCorrelation(1, validRef);
    expect(committedCorr.scope.worktree).toBeUndefined();
    for (const badWorktreeId of ["wt:", "wt:   ", "wt:unscreened { code }", `wt:${"a".repeat(200)}`]) {
      expect(
        validateProducerGenerationCorrelation({
          ...committedCorr,
          authorizingDeclaration: { ...validRef, worktreeId: badWorktreeId },
        }).ok,
        `committed correlation with authorizingDeclaration.worktreeId=${JSON.stringify(badWorktreeId)} must be refused`,
      ).toBe(false);
    }
    for (const badDeclId of ["decl:", "decl:   ", "decl:unscreened { code }", `decl:${"a".repeat(200)}`]) {
      expect(
        validateProducerGenerationCorrelation({
          ...committedCorr,
          authorizingDeclaration: { ...validRef, declarationId: badDeclId },
        }).ok,
        `committed correlation with authorizingDeclaration.declarationId=${JSON.stringify(badDeclId)} must be refused`,
      ).toBe(false);
    }

    const built = buildFactBatch({
      scope: committedCorr.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: committedCorr.producerGenerationId,
      batchId: "batch:f01-1",
      facts: [sampleRefFact(validRef.cloneId)],
    });
    const receipt = makeBatchReceipt(built.batch, built.encoded.byteLength, "rcpt:f01-1");
    const completionMsg = buildGenerationCompletionMessage({
      correlation: committedCorr,
      receipts: [receipt],
      completionState: "complete",
      coverage: currentCommittedCoverage(),
      exclusions: [],
      errors: [],
      remainingWork: 0,
      completedAt: 1_700_000_035_000,
    });
    expect(
      validateGenerationCompletionMessage({
        ...completionMsg,
        authorizingDeclaration: { ...validRef, worktreeId: "wt:unscreened { code }" },
      }).ok,
    ).toBe(false);
  });

  // — Review Round 1: F-02 —
  it("F-02: isStorageIssuedGenerationId rejects the entire gen: producer namespace", () => {
    // Non-padded, over-padded, bare, and free-form gen:* ids are ALL refused as storage generation ids.
    const producerNamespacedIds = [
      "gen:",
      "gen:1",
      "gen:0001",
      "gen:0000000001",
      "gen:00000000001",
      "gen:local-pass",
      "gen:storage-spoof",
    ];
    for (const candidate of producerNamespacedIds) {
      expect(
        isStorageIssuedGenerationId(candidate),
        `isStorageIssuedGenerationId(${JSON.stringify(candidate)}) must be false`,
      ).toBe(false);
    }

    // Kernel-issued storage generation ids outside the gen: namespace remain accepted.
    expect(isStorageIssuedGenerationId("kgen:0193c4f2-0001")).toBe(true);
    expect(isStorageIssuedGenerationId("storage-gen:1")).toBe(true);

    const decl = committedDeclarationRef(1);
    const correlation = sampleCommittedCorrelation(1, decl);
    const baseRecord: StorageGenerationCorrelationRecordDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "storage-generation-correlation",
      authority: STORAGE_KERNEL_AUTHORITY,
      producerGenerationId: correlation.producerGenerationId,
      storageGenerationId: "kgen:0193c4f2-0001",
      storeIncarnation: "incarnation-1",
      view: "committed",
      scope: correlation.scope,
      mappedAt: 1_700_000_011_000,
    };
    const basePublished: GenerationCompletionOutcomeDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "generation-completion-outcome",
      authority: STORAGE_KERNEL_AUTHORITY,
      status: "published",
      published: true,
      producerGenerationId: correlation.producerGenerationId,
      completionMessageDigest: HEX64_1,
      view: "committed",
      scope: correlation.scope,
      storageGenerationId: "kgen:published-f02",
      storeIncarnation: "incarnation-1",
      pointerVersion: 2,
      publicationReceiptId: "pubrcpt:f02",
      publishedAt: 1_700_000_040_000,
    };
    const baseStaged: GenerationCompletionOutcomeDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "generation-completion-outcome",
      authority: STORAGE_KERNEL_AUTHORITY,
      status: "staged",
      published: false,
      producerGenerationId: correlation.producerGenerationId,
      completionMessageDigest: HEX64_1,
      view: "committed",
      scope: correlation.scope,
      storageGenerationId: "kgen:staged-f02",
      storeIncarnation: "incarnation-1",
      stagedAt: 1_700_000_040_000,
    };
    const baseAborted: GenerationCompletionOutcomeDto = {
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "generation-completion-outcome",
      authority: STORAGE_KERNEL_AUTHORITY,
      status: "aborted",
      published: false,
      producerGenerationId: correlation.producerGenerationId,
      completionMessageDigest: HEX64_1,
      view: "committed",
      scope: correlation.scope,
      reason: "aborted-before-publish",
      abortedAt: 1_700_000_040_000,
      storageGenerationId: "kgen:aborted-f02",
      storeIncarnation: "incarnation-1",
    };

    for (const badId of producerNamespacedIds) {
      expect(
        validateStorageGenerationCorrelationRecord({ ...baseRecord, storageGenerationId: badId }).ok,
        `correlation record with storageGenerationId=${JSON.stringify(badId)} must be refused`,
      ).toBe(false);
      expect(
        validateGenerationCompletionOutcome({ ...basePublished, storageGenerationId: badId }).ok,
        `published outcome with storageGenerationId=${JSON.stringify(badId)} must be refused`,
      ).toBe(false);
      expect(
        validateGenerationCompletionOutcome({ ...baseStaged, storageGenerationId: badId }).ok,
        `staged outcome with storageGenerationId=${JSON.stringify(badId)} must be refused`,
      ).toBe(false);
      expect(
        validateGenerationCompletionOutcome({ ...baseAborted, storageGenerationId: badId }).ok,
        `aborted outcome with storageGenerationId=${JSON.stringify(badId)} must be refused`,
      ).toBe(false);
    }
  });

  // — Review Round 1: F-03 —
  it("F-03: entering completion freezes batch input on port throw or malformed outcome while allowing completion retries", async () => {
    const decl = committedDeclarationRef(1);
    const correlation = sampleCommittedCorrelation(1, decl);
    const cloneToken = sampleCloneToken(decl.cloneId);
    const nowMs = 1_700_000_025_000;

    const builtA = buildFactBatch({
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:f03-a",
      facts: [sampleRefFact(decl.cloneId)],
    });
    const builtB = buildFactBatch({
      scope: correlation.scope,
      producerName: PRODUCER_NAME,
      contractVersion: CONTRACT_VERSION,
      policyVersion: POLICY_VERSION,
      generationId: correlation.producerGenerationId,
      batchId: "batch:f03-b",
      facts: [sampleCommitFact(decl.cloneId)],
    });

    const completionInput = {
      completionState: "complete" as const,
      coverage: currentCommittedCoverage(),
      exclusions: [],
      errors: [],
      remainingWork: 0,
      completedAt: 1_700_000_035_000,
    };

    // Case 1: ports.completion.complete throws after crossing the completion boundary.
    let sinkCalls1 = 0;
    const seenMessages1: GenerationCompletionMessageDto[] = [];
    let shouldThrowTransport = true;
    const session1 = createGenerationSession(correlation, {
      batchSink: {
        async deliver(batch, encoded) {
          sinkCalls1 += 1;
          return makeBatchReceipt(batch, encoded.byteLength, `rcpt:${batch.batchId}`);
        },
      },
      completion: {
        async complete(message) {
          seenMessages1.push(message);
          if (shouldThrowTransport) {
            throw new Error("transport timeout after transmitting completion manifest");
          }
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:f03-retry-1",
            storeIncarnation: "incarnation-1",
            pointerVersion: 2,
            publicationReceiptId: "pubrcpt:f03-retry-1",
            publishedAt: 1_700_000_040_000,
          };
        },
      },
    });

    await session1.deliverBatch(builtA.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs });
    expect(sinkCalls1).toBe(1);

    await expect(
      session1.complete(completionInput, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toThrow("transport timeout");
    expect(seenMessages1).toHaveLength(1);
    expect(session1.state()).toBe("staging");
    expect(session1.isPublished()).toBe(false);

    // Input is now sticky-frozen: neither a new batch nor a re-delivered batch can enter the session.
    await expect(
      session1.deliverBatch(builtB.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toMatchObject({ code: "session-closed" });
    await expect(
      session1.deliverBatch(builtA.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toMatchObject({ code: "session-closed" });
    expect(sinkCalls1).toBe(1);

    // Idempotent retry of complete() still succeeds and transmits the exact same manifest digest/root.
    shouldThrowTransport = false;
    const retryResult1 = await session1.complete(completionInput, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs,
    });
    expect(seenMessages1).toHaveLength(2);
    expect(seenMessages1[1].expectedBatchCount).toBe(1);
    expect(seenMessages1[1].logicalBatchSetRoot).toBe(seenMessages1[0].logicalBatchSetRoot);
    expect(seenMessages1[1].messageDigest).toBe(seenMessages1[0].messageDigest);
    expect(retryResult1.outcome.published).toBe(true);
    expect(session1.state()).toBe("published");
    expect(session1.isPublished()).toBe(true);

    // Case 2: verifyGenerationCompletionOutcome throws on a malformed outcome returned by the port.
    let sinkCalls2 = 0;
    const seenMessages2: GenerationCompletionMessageDto[] = [];
    let returnMalformedOutcome = true;
    const session2 = createGenerationSession(correlation, {
      batchSink: {
        async deliver(batch, encoded) {
          sinkCalls2 += 1;
          return makeBatchReceipt(batch, encoded.byteLength, `rcpt:${batch.batchId}`);
        },
      },
      completion: {
        async complete(message) {
          seenMessages2.push(message);
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:f03-retry-2",
            storeIncarnation: "incarnation-1",
            pointerVersion: 3,
            publicationReceiptId: returnMalformedOutcome ? "rcpt:batch:f03-a" : "pubrcpt:f03-retry-2",
            publishedAt: 1_700_000_040_000,
          };
        },
      },
    });

    await session2.deliverBatch(builtA.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs });
    expect(sinkCalls2).toBe(1);

    await expect(
      session2.complete(completionInput, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toThrow(GenerationControlError);
    expect(seenMessages2).toHaveLength(1);
    expect(session2.state()).toBe("staging");
    expect(session2.isPublished()).toBe(false);

    // Input remains frozen after malformed outcome refusal.
    await expect(
      session2.deliverBatch(builtB.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs }),
    ).rejects.toMatchObject({ code: "session-closed" });
    expect(sinkCalls2).toBe(1);

    // Retrying complete() succeeds once the port returns a valid outcome.
    returnMalformedOutcome = false;
    const retryResult2 = await session2.complete(completionInput, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs,
    });
    expect(seenMessages2).toHaveLength(2);
    expect(seenMessages2[1].logicalBatchSetRoot).toBe(seenMessages2[0].logicalBatchSetRoot);
    expect(retryResult2.outcome.published).toBe(true);
    expect(session2.state()).toBe("published");
    expect(session2.isPublished()).toBe(true);

    // Case 3: Local pre-port validation error does NOT freeze input because no completion crossed the port.
    let sinkCalls3 = 0;
    let completionCalls3 = 0;
    const session3 = createGenerationSession(correlation, {
      batchSink: {
        async deliver(batch, encoded) {
          sinkCalls3 += 1;
          return makeBatchReceipt(batch, encoded.byteLength, `rcpt:${batch.batchId}`);
        },
      },
      completion: {
        async complete(message) {
          completionCalls3 += 1;
          return {
            controlVersion: GENERATION_CONTROL_VERSION,
            kind: "generation-completion-outcome",
            authority: STORAGE_KERNEL_AUTHORITY,
            status: "published",
            published: true,
            producerGenerationId: message.producerGenerationId,
            completionMessageDigest: message.messageDigest,
            view: message.view,
            scope: message.scope,
            storageGenerationId: "kgen:f03-preport-3",
            storeIncarnation: "incarnation-1",
            pointerVersion: 4,
            publicationReceiptId: "pubrcpt:f03-preport-3",
            publishedAt: 1_700_000_040_000,
          };
        },
      },
    });

    await session3.deliverBatch(builtA.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs });
    // Expired token fails locally before calling ports.completion.complete.
    await expect(
      session3.complete(completionInput, cloneToken, {
        expectedIncarnation: "incarnation-1",
        nowMs: cloneToken.expiresAt,
      }),
    ).rejects.toMatchObject({ code: "invalid-fencing-token" });
    expect(completionCalls3).toBe(0);

    // Because nothing crossed the completion port boundary, batch B can still be delivered.
    await session3.deliverBatch(builtB.batch, cloneToken, { expectedIncarnation: "incarnation-1", nowMs });
    expect(sinkCalls3).toBe(2);

    const completed3 = await session3.complete(completionInput, cloneToken, {
      expectedIncarnation: "incarnation-1",
      nowMs,
    });
    expect(completionCalls3).toBe(1);
    expect(completed3.message.expectedBatchCount).toBe(2);
    expect(session3.isPublished()).toBe(true);
  });
});
