// @sentropic/engram-live/generation — L3a-E2 neutral generation correlation,
// completion control and view-scoped fencing helpers
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 6, 9, 12;
// spec/SPEC_L3A_GENERIC_MODULE_STORAGE_PORT.md §§2.3, 5.1, 12.1–12.3, 17.4;
// plan/09 L3a-E2).
//
// Guarantees:
//   - Producer generation IDs (`gen:<10 digits>`) remain correlation identities
//     only — this module NEVER mints storage-issued generation identities,
//     incarnations, pointer versions, seals or storage capability tokens.
//   - `deliver` acknowledges a complete durable batch receipt (`published: false`,
//     even when `finalBatch: true`); publication occurs ONLY through a separate
//     neutral completion message acknowledged by the storage kernel.
//   - Logical batch set roots are deterministic and independent of batch arrival
//     order (SPEC_L3A §12.2).
//   - View-aware fencing strictly preserves clone-scoped tokens for committed
//     views and mandatory worktree-scoped tokens for private views.
//   - L6a identity derivation in ./registration.js stays completely untouched.
//
// Neutrality: imports ONLY in-package neutral modules (./contracts.js,
// ./batch-codec.js, ./facts.js, ./integration.js) and node:crypto.

import { createHash } from "node:crypto";
import {
  BATCH_POLICY_VERSIONS,
  CONTRACT_VERSION,
  GENERATION_COMPLETION_OUTCOME_STATUSES,
  GENERATION_COMPLETION_STATES,
  GENERATION_CONTROL_VERSION,
  GENERATION_CORRELATION_ROLE,
  GENERATION_ID_WIDTH,
  GENERATION_REJECTION_CODES,
  LIVE_VIEW_KINDS,
  POLICY_VERSION,
  PRIVATE_FINGERPRINT_MODES,
  PRODUCER_NAME,
  STORAGE_KERNEL_AUTHORITY,
  isBatchDeliveryReceiptDto,
  isGenerationCompletionMessageDto,
  isGenerationCompletionOutcomeDto,
  isGenerationCompletionState,
  isLiveViewKind,
  isPrivateFingerprintMode,
  isProducerGenerationCorrelationDto,
  isPublishedGenerationOutcome,
  isStorageIssuedGenerationId,
  isStrictBatchId,
  isStrictGenerationId,
  validateAuthorizingDeclarationRef,
  validateBatchDeliveryReceipt,
  validateFactBatch,
  validateGenerationCompletionMessage,
  validateGenerationCompletionOutcome,
  validateGenerationSourceBoundary,
  validateProducerGenerationCorrelation,
  validateStorageGenerationCorrelationRecord,
  type AbortedGenerationOutcomeDto,
  type AuthorizingDeclarationRefDto,
  type BatchDeliveryReceiptDto,
  type BatchManifestEntryDto,
  type BatchPolicyVersion,
  type CommittedSourceBoundaryDto,
  type FactBatchDto,
  type GenerationCompletionMessageDto,
  type GenerationCompletionOutcomeDto,
  type GenerationCompletionOutcomeStatus,
  type GenerationCompletionState,
  type GenerationCoverageSummaryDto,
  type GenerationRejectionCode,
  type GenerationSourceBoundaryDto,
  type LiveScope,
  type LiveViewKind,
  type PrivateFingerprintMode,
  type PrivateSourceBoundaryDto,
  type ProducerGenerationCorrelationDto,
  type PublishedGenerationOutcomeDto,
  type RejectedGenerationOutcomeDto,
  type StagedGenerationOutcomeDto,
  type StorageGenerationCorrelationRecordDto,
} from "./contracts.js";
import {
  canonicalEncodeValue,
  deliverCheckedFactBatch,
  type EncodeFactBatchOptions,
  type EncodedFactBatch,
} from "./batch-codec.js";
import { classifyFactPrivacy } from "./facts.js";
import { validateScopeFencingToken, type ScopeFencingTokenDto } from "./integration.js";

export {
  GENERATION_COMPLETION_OUTCOME_STATUSES,
  GENERATION_COMPLETION_STATES,
  GENERATION_CONTROL_VERSION,
  GENERATION_CORRELATION_ROLE,
  GENERATION_ID_WIDTH,
  GENERATION_REJECTION_CODES,
  LIVE_VIEW_KINDS,
  PRIVATE_FINGERPRINT_MODES,
  STORAGE_KERNEL_AUTHORITY,
  isBatchDeliveryReceiptDto,
  isGenerationCompletionMessageDto,
  isGenerationCompletionOutcomeDto,
  isGenerationCompletionState,
  isLiveViewKind,
  isPrivateFingerprintMode,
  isProducerGenerationCorrelationDto,
  isPublishedGenerationOutcome,
  isStorageIssuedGenerationId,
  isStrictGenerationId,
  validateAuthorizingDeclarationRef,
  validateBatchDeliveryReceipt,
  validateGenerationCompletionMessage,
  validateGenerationCompletionOutcome,
  validateGenerationSourceBoundary,
  validateProducerGenerationCorrelation,
  validateStorageGenerationCorrelationRecord,
  type AbortedGenerationOutcomeDto,
  type AuthorizingDeclarationRefDto,
  type BatchDeliveryReceiptDto,
  type BatchManifestEntryDto,
  type CommittedSourceBoundaryDto,
  type GenerationCompletionMessageDto,
  type GenerationCompletionOutcomeDto,
  type GenerationCompletionOutcomeStatus,
  type GenerationCompletionState,
  type GenerationCoverageSummaryDto,
  type GenerationRejectionCode,
  type GenerationSourceBoundaryDto,
  type LiveViewKind,
  type PrivateFingerprintMode,
  type PrivateSourceBoundaryDto,
  type ProducerGenerationCorrelationDto,
  type PublishedGenerationOutcomeDto,
  type RejectedGenerationOutcomeDto,
  type StagedGenerationOutcomeDto,
  type StorageGenerationCorrelationRecordDto,
};

export const MAX_PRODUCER_GENERATION_SEQUENCE = 9_999_999_999;

export type GenerationControlErrorCode =
  | "invalid-correlation"
  | "invalid-scope"
  | "invalid-fencing-token"
  | "invalid-batch"
  | "invalid-receipt"
  | "invalid-completion"
  | "invalid-outcome"
  | "correlation-mismatch"
  | "duplicate-batch-conflict"
  | "storage-capability-forbidden"
  | "session-closed";

export class GenerationControlError extends Error {
  readonly code: GenerationControlErrorCode;

  constructor(code: GenerationControlErrorCode, message: string) {
    super(message);
    this.name = "GenerationControlError";
    this.code = code;
  }
}

export interface CreateGenerationCorrelationInput {
  readonly producerGenerationId: string;
  readonly policyVersion: BatchPolicyVersion;
  readonly view: LiveViewKind;
  readonly scope: LiveScope;
  readonly authorizingDeclaration: AuthorizingDeclarationRefDto;
  readonly sourceBoundary: GenerationSourceBoundaryDto;
}

export interface BuildGenerationCompletionInput {
  readonly correlation: ProducerGenerationCorrelationDto;
  readonly receipts: readonly BatchDeliveryReceiptDto[];
  readonly completionState: GenerationCompletionState;
  readonly expectedBatchCount?: number;
  readonly coverage: readonly GenerationCoverageSummaryDto[];
  readonly exclusions: readonly string[];
  readonly errors: readonly string[];
  readonly remainingWork: number;
  readonly abortReason?: string;
  readonly completedAt: number;
}

export interface GenerationBatchSinkPort {
  /** Durable receipt of one complete encoded batch; never implies publication. */
  deliver(
    batch: FactBatchDto,
    encoded: EncodedFactBatch,
    fencingToken: ScopeFencingTokenDto,
  ): Promise<BatchDeliveryReceiptDto>;
}

export interface GenerationCompletionPort {
  /** Separate neutral completion control message; storage decides seal/publish/abort/reject. */
  complete(
    message: GenerationCompletionMessageDto,
    fencingToken: ScopeFencingTokenDto,
  ): Promise<GenerationCompletionOutcomeDto>;
}

export interface GenerationSessionPorts {
  readonly batchSink: GenerationBatchSinkPort;
  readonly completion: GenerationCompletionPort;
}

export type GenerationSessionState =
  | "staging"
  | "published"
  | "staged"
  | "aborted"
  | "rejected";

export interface DeliverGenerationBatchOptions extends EncodeFactBatchOptions {
  readonly expectedIncarnation?: string;
  readonly nowMs?: number;
}

export interface CompleteGenerationInput {
  readonly completionState: GenerationCompletionState;
  readonly expectedBatchCount?: number;
  readonly coverage: readonly GenerationCoverageSummaryDto[];
  readonly exclusions: readonly string[];
  readonly errors: readonly string[];
  readonly remainingWork: number;
  readonly abortReason?: string;
  readonly completedAt: number;
}

export interface CompleteGenerationOptions {
  readonly expectedIncarnation?: string;
  readonly nowMs?: number;
}

export interface GenerationCompletionResult {
  readonly message: GenerationCompletionMessageDto;
  readonly outcome: GenerationCompletionOutcomeDto;
}

export interface GenerationCorrelationSession {
  readonly correlation: ProducerGenerationCorrelationDto;
  state(): GenerationSessionState;
  isPublished(): boolean;
  receipts(): readonly BatchDeliveryReceiptDto[];
  publicationOutcome(): GenerationCompletionOutcomeDto | undefined;
  deliverBatch(
    batch: FactBatchDto,
    fencingToken: ScopeFencingTokenDto,
    options?: DeliverGenerationBatchOptions,
  ): Promise<BatchDeliveryReceiptDto>;
  complete(
    input: CompleteGenerationInput,
    fencingToken: ScopeFencingTokenDto,
    options?: CompleteGenerationOptions,
  ): Promise<GenerationCompletionResult>;
}

const CREATE_CORRELATION_INPUT_KEYS: readonly string[] = [
  "producerGenerationId",
  "policyVersion",
  "view",
  "scope",
  "authorizingDeclaration",
  "sourceBoundary",
];

const BUILD_COMPLETION_INPUT_KEYS: readonly string[] = [
  "correlation",
  "receipts",
  "completionState",
  "expectedBatchCount",
  "coverage",
  "exclusions",
  "errors",
  "remainingWork",
  "abortReason",
  "completedAt",
];

const COMPLETE_SESSION_INPUT_KEYS: readonly string[] = [
  "completionState",
  "expectedBatchCount",
  "coverage",
  "exclusions",
  "errors",
  "remainingWork",
  "abortReason",
  "completedAt",
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function sha256HexBytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareLex(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function scopesEqual(left: LiveScope, right: LiveScope): boolean {
  return (
    left.tenant === right.tenant &&
    left.clone === right.clone &&
    left.worktree === right.worktree
  );
}

function cloneScope(scope: LiveScope): LiveScope {
  return scope.worktree !== undefined
    ? { tenant: scope.tenant, clone: scope.clone, worktree: scope.worktree }
    : { tenant: scope.tenant, clone: scope.clone };
}

function cloneAuthorizingDeclaration(decl: AuthorizingDeclarationRefDto): AuthorizingDeclarationRefDto {
  return {
    declarationId: decl.declarationId,
    cloneId: decl.cloneId,
    worktreeId: decl.worktreeId,
    declarationRevision: decl.declarationRevision,
  };
}

function cloneSourceBoundary(boundary: GenerationSourceBoundaryDto): GenerationSourceBoundaryDto {
  if (boundary.view === "committed") {
    return {
      view: "committed",
      oidAlgorithm: boundary.oidAlgorithm,
      observedAt: boundary.observedAt,
      refsFingerprint: boundary.refsFingerprint,
      headCommit: boundary.headCommit !== null
        ? { algorithm: boundary.headCommit.algorithm, oid: boundary.headCommit.oid }
        : null,
      rootOids: boundary.rootOids.map((oid) => ({ algorithm: oid.algorithm, oid: oid.oid })),
      configAttributesFingerprint: boundary.configAttributesFingerprint,
      completeHistoryFrontier: boundary.completeHistoryFrontier,
    };
  }
  return {
    view: "private",
    oidAlgorithm: boundary.oidAlgorithm,
    observedAt: boundary.observedAt,
    worktreeId: boundary.worktreeId,
    headCommit: boundary.headCommit !== null
      ? { algorithm: boundary.headCommit.algorithm, oid: boundary.headCommit.oid }
      : null,
    captureStable: boundary.captureStable,
    snapshotIds: [...boundary.snapshotIds],
    configAttributesFingerprint: boundary.configAttributesFingerprint,
    contentFingerprintMode: boundary.contentFingerprintMode,
    ...(boundary.disposableContentFingerprint !== undefined
      ? { disposableContentFingerprint: boundary.disposableContentFingerprint }
      : {}),
    ...(boundary.disposableKeyRef !== undefined
      ? { disposableKeyRef: boundary.disposableKeyRef }
      : {}),
  };
}

function cloneCorrelation(correlation: ProducerGenerationCorrelationDto): ProducerGenerationCorrelationDto {
  return {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "generation-correlation",
    role: GENERATION_CORRELATION_ROLE,
    producerGenerationId: correlation.producerGenerationId,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: correlation.policyVersion,
    view: correlation.view,
    scope: cloneScope(correlation.scope),
    authorizingDeclaration: cloneAuthorizingDeclaration(correlation.authorizingDeclaration),
    sourceBoundary: cloneSourceBoundary(correlation.sourceBoundary),
  };
}

function cloneBatchReceipt(receipt: BatchDeliveryReceiptDto): BatchDeliveryReceiptDto {
  return {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "batch-receipt",
    received: true,
    published: false,
    completeBatch: true,
    producerGenerationId: receipt.producerGenerationId,
    batchId: receipt.batchId,
    batchDigest: receipt.batchDigest,
    receiptId: receipt.receiptId,
    byteLength: receipt.byteLength,
    ...(receipt.finalBatch !== undefined ? { finalBatch: receipt.finalBatch } : {}),
    receivedAt: receipt.receivedAt,
  };
}

function cloneFencingToken(token: ScopeFencingTokenDto): ScopeFencingTokenDto {
  return {
    tokenId: token.tokenId,
    scope: cloneScope(token.scope),
    epoch: token.epoch,
    epochId: token.epochId,
    declarationRevision: token.declarationRevision,
    projectionIncarnation: token.projectionIncarnation,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
  };
}

function cloneCompletionMessage(message: GenerationCompletionMessageDto): GenerationCompletionMessageDto {
  return {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "generation-completion",
    role: GENERATION_CORRELATION_ROLE,
    producerGenerationId: message.producerGenerationId,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: message.policyVersion,
    view: message.view,
    scope: cloneScope(message.scope),
    authorizingDeclaration: cloneAuthorizingDeclaration(message.authorizingDeclaration),
    sourceBoundary: cloneSourceBoundary(message.sourceBoundary),
    completionState: message.completionState,
    expectedBatchCount: message.expectedBatchCount,
    batches: message.batches.map((entry) => ({
      batchId: entry.batchId,
      batchDigest: entry.batchDigest,
      receiptId: entry.receiptId,
      byteLength: entry.byteLength,
    })),
    logicalBatchSetRoot: message.logicalBatchSetRoot,
    coverage: message.coverage.map((item) => ({
      axis: item.axis,
      state: item.state,
      reason: item.reason,
      pendingCount: item.pendingCount,
      complete: item.complete,
    })),
    exclusions: [...message.exclusions],
    errors: [...message.errors],
    remainingWork: message.remainingWork,
    ...(message.abortReason !== undefined ? { abortReason: message.abortReason } : {}),
    completedAt: message.completedAt,
    messageDigest: message.messageDigest,
  };
}

function cloneCompletionOutcome(outcome: GenerationCompletionOutcomeDto): GenerationCompletionOutcomeDto {
  switch (outcome.status) {
    case "published":
      return {
        controlVersion: GENERATION_CONTROL_VERSION,
        kind: "generation-completion-outcome",
        authority: STORAGE_KERNEL_AUTHORITY,
        status: "published",
        published: true,
        producerGenerationId: outcome.producerGenerationId,
        completionMessageDigest: outcome.completionMessageDigest,
        view: outcome.view,
        scope: cloneScope(outcome.scope),
        storageGenerationId: outcome.storageGenerationId,
        storeIncarnation: outcome.storeIncarnation,
        pointerVersion: outcome.pointerVersion,
        publicationReceiptId: outcome.publicationReceiptId,
        publishedAt: outcome.publishedAt,
      };
    case "staged":
      return {
        controlVersion: GENERATION_CONTROL_VERSION,
        kind: "generation-completion-outcome",
        authority: STORAGE_KERNEL_AUTHORITY,
        status: "staged",
        published: false,
        producerGenerationId: outcome.producerGenerationId,
        completionMessageDigest: outcome.completionMessageDigest,
        view: outcome.view,
        scope: cloneScope(outcome.scope),
        storageGenerationId: outcome.storageGenerationId,
        storeIncarnation: outcome.storeIncarnation,
        stagedAt: outcome.stagedAt,
      };
    case "aborted":
      return {
        controlVersion: GENERATION_CONTROL_VERSION,
        kind: "generation-completion-outcome",
        authority: STORAGE_KERNEL_AUTHORITY,
        status: "aborted",
        published: false,
        producerGenerationId: outcome.producerGenerationId,
        completionMessageDigest: outcome.completionMessageDigest,
        view: outcome.view,
        scope: cloneScope(outcome.scope),
        reason: outcome.reason,
        abortedAt: outcome.abortedAt,
        ...(outcome.storageGenerationId !== undefined ? { storageGenerationId: outcome.storageGenerationId } : {}),
        ...(outcome.storeIncarnation !== undefined ? { storeIncarnation: outcome.storeIncarnation } : {}),
      };
    case "rejected":
      return {
        controlVersion: GENERATION_CONTROL_VERSION,
        kind: "generation-completion-outcome",
        authority: STORAGE_KERNEL_AUTHORITY,
        status: "rejected",
        published: false,
        producerGenerationId: outcome.producerGenerationId,
        completionMessageDigest: outcome.completionMessageDigest,
        view: outcome.view,
        scope: cloneScope(outcome.scope),
        rejectionCode: outcome.rejectionCode,
        reason: outcome.reason,
        rejectedAt: outcome.rejectedAt,
      };
  }
}

/**
 * Format a strictly monotonic fixed-width producer correlation identity
 * (`gen:0000000001`..`gen:9999999999`). This is a producer correlation ID only
 * and NEVER a storage capability or kernel-issued generation identity.
 */
export function formatProducerGenerationId(sequence: number): string {
  if (
    typeof sequence !== "number" ||
    !Number.isSafeInteger(sequence) ||
    sequence < 1 ||
    sequence > MAX_PRODUCER_GENERATION_SEQUENCE
  ) {
    throw new GenerationControlError(
      "invalid-correlation",
      `producer generation sequence must be an integer in [1, ${MAX_PRODUCER_GENERATION_SEQUENCE}]`,
    );
  }
  return `gen:${String(sequence).padStart(GENERATION_ID_WIDTH, "0")}`;
}

/**
 * Construct and validate a neutral producer generation correlation message.
 * Refuses any unknown/smuggled storage-capability field, enforces view-to-scope
 * binding, and returns an isolated clone independent of caller mutations.
 */
export function createGenerationCorrelation(
  input: CreateGenerationCorrelationInput,
): ProducerGenerationCorrelationDto {
  if (!isPlainRecord(input)) {
    throw new GenerationControlError("invalid-correlation", "generation correlation input must be a plain object");
  }
  for (const key of Object.keys(input)) {
    if (!CREATE_CORRELATION_INPUT_KEYS.includes(key)) {
      throw new GenerationControlError(
        "storage-capability-forbidden",
        "generation correlation input carries an unknown or disallowed key",
      );
    }
  }
  const candidate: Record<string, unknown> = {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "generation-correlation",
    role: GENERATION_CORRELATION_ROLE,
    producerGenerationId: input.producerGenerationId,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: input.policyVersion,
    view: input.view,
    scope: input.scope,
    authorizingDeclaration: input.authorizingDeclaration,
    sourceBoundary: input.sourceBoundary,
  };
  const checked = validateProducerGenerationCorrelation(candidate);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${checked.errors.join("; ")}`,
    );
  }
  return cloneCorrelation(candidate as unknown as ProducerGenerationCorrelationDto);
}

/**
 * Verify that a typed FactBatchDto belongs to the given producer generation
 * correlation: matching generationId, exact scope (including worktree absence
 * for committed views and presence for private views), matching policy/contract,
 * and zero private facts on a committed view.
 */
export function assertCorrelationMatchesBatch(
  correlation: ProducerGenerationCorrelationDto,
  batch: FactBatchDto,
): void {
  const corrChecked = validateProducerGenerationCorrelation(correlation);
  if (!corrChecked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${corrChecked.errors.join("; ")}`,
    );
  }
  const batchChecked = validateFactBatch(batch);
  if (!batchChecked.ok) {
    throw new GenerationControlError(
      "invalid-batch",
      `invalid fact batch: ${batchChecked.errors.join("; ")}`,
    );
  }
  if (batch.generationId !== correlation.producerGenerationId) {
    throw new GenerationControlError(
      "correlation-mismatch",
      `batch ${batch.batchId} generationId does not match correlation ${correlation.producerGenerationId}`,
    );
  }
  if (!scopesEqual(batch.scope, correlation.scope)) {
    throw new GenerationControlError(
      "invalid-scope",
      `batch ${batch.batchId} scope does not match generation correlation scope`,
    );
  }
  if (batch.policyVersion !== correlation.policyVersion) {
    throw new GenerationControlError(
      "correlation-mismatch",
      `batch ${batch.batchId} policyVersion does not match generation correlation policyVersion`,
    );
  }
  if (correlation.view === "committed") {
    for (let i = 0; i < batch.facts.length; i++) {
      const fact = batch.facts[i];
      if (classifyFactPrivacy(fact) === "private") {
        throw new GenerationControlError(
          "invalid-batch",
          `batch ${batch.batchId} facts[${i}] is private and cannot be delivered under a committed view correlation`,
        );
      }
    }
  }
}

/**
 * Enforce view-aware scope fencing for a generation correlation:
 *   - Committed view requires a clone-scoped token (worktree absent) matching
 *     tenant + clone + declarationRevision.
 *   - Private view requires a worktree-scoped token matching tenant + clone +
 *     exact worktree + declarationRevision — NEVER relaxed!
 */
export function assertValidViewFencingToken(
  token: unknown,
  correlation: ProducerGenerationCorrelationDto,
  expectedIncarnation?: string,
  nowMs?: number,
): ScopeFencingTokenDto {
  const corrChecked = validateProducerGenerationCorrelation(correlation);
  if (!corrChecked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${corrChecked.errors.join("; ")}`,
    );
  }
  const checked = validateScopeFencingToken(token, correlation.scope, expectedIncarnation, nowMs);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-fencing-token",
      `fencing token rejected for ${correlation.view} view: ${checked.errors.join("; ")}`,
    );
  }
  const typed = token as ScopeFencingTokenDto;
  if (correlation.view === "committed" && typed.scope.worktree !== undefined) {
    throw new GenerationControlError(
      "invalid-fencing-token",
      "committed view requires a clone-scoped fencing token without worktree",
    );
  }
  if (
    correlation.view === "private" &&
    (typed.scope.worktree === undefined || typed.scope.worktree !== correlation.scope.worktree)
  ) {
    throw new GenerationControlError(
      "invalid-fencing-token",
      "private view requires a worktree-scoped fencing token matching the target worktree",
    );
  }
  if (typed.declarationRevision !== correlation.authorizingDeclaration.declarationRevision) {
    throw new GenerationControlError(
      "invalid-fencing-token",
      "fencing token declarationRevision does not match authorizing declaration revision",
    );
  }
  return cloneFencingToken(typed);
}

/**
 * Classify a durable batch receipt (SPEC_L3A §12.3).
 * Always validates the receipt and returns `"staged-not-published"`, even when
 * `finalBatch` is `true`: a final batch receipt never implies publication.
 */
export function classifyBatchReceipt(receipt: unknown): "staged-not-published" {
  const checked = validateBatchDeliveryReceipt(receipt);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-receipt",
      `invalid batch delivery receipt: ${checked.errors.join("; ")}`,
    );
  }
  return "staged-not-published";
}

/**
 * Compute the order-independent canonical SHA-256 root over a set of acknowledged
 * `(batchId, batchDigest)` entries (SPEC_L3A §12.2: logical content roots are
 * independent of batch arrival order). Refuses duplicate or invalid batch IDs.
 */
export function computeLogicalBatchSetRoot(
  batches: readonly Pick<BatchManifestEntryDto, "batchId" | "batchDigest">[],
): string {
  if (!Array.isArray(batches)) {
    throw new GenerationControlError("invalid-completion", "batches must be an array");
  }
  const seen = new Set<string>();
  const normalized: { readonly batchId: string; readonly batchDigest: string }[] = [];
  for (let i = 0; i < batches.length; i++) {
    const entry = batches[i];
    if (!isPlainRecord(entry)) {
      throw new GenerationControlError("invalid-completion", `batches[${i}] must be a plain object`);
    }
    if (!isStrictBatchId(entry.batchId, "batch:")) {
      throw new GenerationControlError("invalid-completion", `batches[${i}].batchId must be a strict batch id`);
    }
    if (typeof entry.batchDigest !== "string" || !/^[0-9a-f]{64}$/.test(entry.batchDigest)) {
      throw new GenerationControlError("invalid-completion", `batches[${i}].batchDigest must be a 64-hex digest`);
    }
    if (seen.has(entry.batchId)) {
      throw new GenerationControlError(
        "duplicate-batch-conflict",
        `duplicate batchId ${entry.batchId} in logical batch set`,
      );
    }
    seen.add(entry.batchId);
    normalized.push({ batchId: entry.batchId, batchDigest: entry.batchDigest });
  }
  normalized.sort((a, b) => compareLex(a.batchId, b.batchId));
  return sha256HexBytes(
    canonicalEncodeValue({
      controlVersion: GENERATION_CONTROL_VERSION,
      kind: "logical-batch-set-root",
      entries: normalized,
    }),
  );
}

const ZERO_DIGEST = "0".repeat(64);

/**
 * Compute the canonical SHA-256 hex digest of a completion message payload.
 */
export function computeGenerationCompletionDigest(
  payload: Omit<GenerationCompletionMessageDto, "messageDigest">,
): string {
  const candidate = { ...payload, messageDigest: ZERO_DIGEST };
  const checked = validateGenerationCompletionMessage(candidate);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-completion",
      `invalid generation completion payload: ${checked.errors.join("; ")}`,
    );
  }
  const expectedRoot = computeLogicalBatchSetRoot(payload.batches);
  if (payload.logicalBatchSetRoot !== expectedRoot) {
    throw new GenerationControlError(
      "invalid-completion",
      "logicalBatchSetRoot does not match canonical batch manifest",
    );
  }
  return sha256HexBytes(
    canonicalEncodeValue({
      controlVersion: payload.controlVersion,
      kind: payload.kind,
      role: payload.role,
      producerGenerationId: payload.producerGenerationId,
      producerName: payload.producerName,
      contractVersion: payload.contractVersion,
      policyVersion: payload.policyVersion,
      view: payload.view,
      scope: payload.scope,
      authorizingDeclaration: payload.authorizingDeclaration,
      sourceBoundary: payload.sourceBoundary,
      completionState: payload.completionState,
      expectedBatchCount: payload.expectedBatchCount,
      batches: payload.batches,
      logicalBatchSetRoot: payload.logicalBatchSetRoot,
      coverage: payload.coverage,
      exclusions: payload.exclusions,
      errors: payload.errors,
      remainingWork: payload.remainingWork,
      ...(payload.abortReason !== undefined ? { abortReason: payload.abortReason } : {}),
      completedAt: payload.completedAt,
    }),
  );
}

/**
 * Build a complete, canonically digested neutral generation completion control
 * message from a correlation and its durably acknowledged batch receipts.
 * Deduplicates identical idempotent retries and refuses any conflicting receipt
 * or correlation mismatch.
 */
export function buildGenerationCompletionMessage(
  input: BuildGenerationCompletionInput,
): GenerationCompletionMessageDto {
  if (!isPlainRecord(input)) {
    throw new GenerationControlError("invalid-completion", "completion input must be a plain object");
  }
  for (const key of Object.keys(input)) {
    if (!BUILD_COMPLETION_INPUT_KEYS.includes(key)) {
      throw new GenerationControlError(
        "storage-capability-forbidden",
        "generation completion input carries an unknown or disallowed key",
      );
    }
  }
  const corrChecked = validateProducerGenerationCorrelation(input.correlation);
  if (!corrChecked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${corrChecked.errors.join("; ")}`,
    );
  }
  if (!Array.isArray(input.receipts)) {
    throw new GenerationControlError("invalid-receipt", "receipts must be an array");
  }
  const byBatchId = new Map<string, BatchManifestEntryDto>();
  for (let i = 0; i < input.receipts.length; i++) {
    const receipt = input.receipts[i];
    const rChecked = validateBatchDeliveryReceipt(receipt);
    if (!rChecked.ok) {
      throw new GenerationControlError(
        "invalid-receipt",
        `receipts[${i}] is invalid: ${rChecked.errors.join("; ")}`,
      );
    }
    if (receipt.producerGenerationId !== input.correlation.producerGenerationId) {
      throw new GenerationControlError(
        "correlation-mismatch",
        `receipts[${i}] belongs to ${receipt.producerGenerationId}, not ${input.correlation.producerGenerationId}`,
      );
    }
    const existing = byBatchId.get(receipt.batchId);
    if (existing !== undefined) {
      if (
        existing.batchDigest !== receipt.batchDigest ||
        existing.receiptId !== receipt.receiptId ||
        existing.byteLength !== receipt.byteLength
      ) {
        throw new GenerationControlError(
          "duplicate-batch-conflict",
          `conflicting receipts for batch ${receipt.batchId}`,
        );
      }
      continue;
    }
    byBatchId.set(receipt.batchId, {
      batchId: receipt.batchId,
      batchDigest: receipt.batchDigest,
      receiptId: receipt.receiptId,
      byteLength: receipt.byteLength,
    });
  }

  const batches = [...byBatchId.values()].sort((a, b) => compareLex(a.batchId, b.batchId));
  const logicalBatchSetRoot = computeLogicalBatchSetRoot(batches);
  const expectedBatchCount = input.expectedBatchCount ?? batches.length;

  const payloadWithoutDigest: Omit<GenerationCompletionMessageDto, "messageDigest"> = {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "generation-completion",
    role: GENERATION_CORRELATION_ROLE,
    producerGenerationId: input.correlation.producerGenerationId,
    producerName: PRODUCER_NAME,
    contractVersion: CONTRACT_VERSION,
    policyVersion: input.correlation.policyVersion,
    view: input.correlation.view,
    scope: cloneScope(input.correlation.scope),
    authorizingDeclaration: cloneAuthorizingDeclaration(input.correlation.authorizingDeclaration),
    sourceBoundary: cloneSourceBoundary(input.correlation.sourceBoundary),
    completionState: input.completionState,
    expectedBatchCount,
    batches,
    logicalBatchSetRoot,
    coverage: Array.isArray(input.coverage)
      ? input.coverage.map((item) => ({ ...item }))
      : (input.coverage as unknown as readonly GenerationCoverageSummaryDto[]),
    exclusions: Array.isArray(input.exclusions) ? [...input.exclusions] : input.exclusions,
    errors: Array.isArray(input.errors) ? [...input.errors] : input.errors,
    remainingWork: input.remainingWork,
    ...(input.abortReason !== undefined ? { abortReason: input.abortReason } : {}),
    completedAt: input.completedAt,
  };

  const messageDigest = computeGenerationCompletionDigest(payloadWithoutDigest);
  const message: GenerationCompletionMessageDto = {
    ...payloadWithoutDigest,
    messageDigest,
  };
  return cloneCompletionMessage(message);
}

/**
 * Validate a GenerationCompletionMessageDto structurally AND cryptographically
 * (recomputing both `logicalBatchSetRoot` and `messageDigest`).
 */
export function verifyGenerationCompletionMessage(message: unknown): GenerationCompletionMessageDto {
  const checked = validateGenerationCompletionMessage(message);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-completion",
      `invalid generation completion message: ${checked.errors.join("; ")}`,
    );
  }
  const typed = message as GenerationCompletionMessageDto;
  const expectedRoot = computeLogicalBatchSetRoot(typed.batches);
  if (typed.logicalBatchSetRoot !== expectedRoot) {
    throw new GenerationControlError(
      "invalid-completion",
      "generation completion logicalBatchSetRoot does not match its batches",
    );
  }
  const { messageDigest, ...payload } = typed;
  const expectedDigest = computeGenerationCompletionDigest(payload);
  if (messageDigest !== expectedDigest) {
    throw new GenerationControlError(
      "invalid-completion",
      "generation completion messageDigest does not match canonical message bytes",
    );
  }
  return cloneCompletionMessage(typed);
}

/**
 * Verify a storage-returned correlation record against a producer correlation.
 * Refuses any record that echoes the producer generation id as a storage id,
 * mismatches scope/view/producerGenerationId, or lacks storage-kernel authority.
 */
export function verifyStorageCorrelationRecord(
  record: unknown,
  correlation: ProducerGenerationCorrelationDto,
): StorageGenerationCorrelationRecordDto {
  const corrChecked = validateProducerGenerationCorrelation(correlation);
  if (!corrChecked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${corrChecked.errors.join("; ")}`,
    );
  }
  const recChecked = validateStorageGenerationCorrelationRecord(record);
  if (!recChecked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid storage generation correlation record: ${recChecked.errors.join("; ")}`,
    );
  }
  const typed = record as StorageGenerationCorrelationRecordDto;
  if (typed.producerGenerationId !== correlation.producerGenerationId) {
    throw new GenerationControlError(
      "correlation-mismatch",
      `storage correlation record binds ${typed.producerGenerationId}, not ${correlation.producerGenerationId}`,
    );
  }
  if (typed.view !== correlation.view || !scopesEqual(typed.scope, correlation.scope)) {
    throw new GenerationControlError(
      "invalid-scope",
      "storage correlation record view/scope does not match producer correlation",
    );
  }
  return {
    controlVersion: GENERATION_CONTROL_VERSION,
    kind: "storage-generation-correlation",
    authority: STORAGE_KERNEL_AUTHORITY,
    producerGenerationId: typed.producerGenerationId,
    storageGenerationId: typed.storageGenerationId,
    storeIncarnation: typed.storeIncarnation,
    view: typed.view,
    scope: cloneScope(typed.scope),
    mappedAt: typed.mappedAt,
  };
}

/**
 * Verify a storage-returned completion outcome against the emitted completion
 * message and its batch receipts. Refuses:
 *   - malformed or non-storage-kernel outcomes;
 *   - producerGenerationId / completionMessageDigest / view / scope mismatches;
 *   - publishing an aborted completion message;
 *   - echoing a producer correlation ID as storageGenerationId;
 *   - reusing any batch receiptId as publicationReceiptId.
 */
export function verifyGenerationCompletionOutcome(
  outcome: unknown,
  message: GenerationCompletionMessageDto,
  batchReceipts: readonly BatchDeliveryReceiptDto[] = [],
): GenerationCompletionOutcomeDto {
  const verifiedMessage = verifyGenerationCompletionMessage(message);
  const checked = validateGenerationCompletionOutcome(outcome);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-outcome",
      `invalid generation completion outcome: ${checked.errors.join("; ")}`,
    );
  }
  const typed = outcome as GenerationCompletionOutcomeDto;
  if (typed.producerGenerationId !== verifiedMessage.producerGenerationId) {
    throw new GenerationControlError(
      "correlation-mismatch",
      "completion outcome producerGenerationId does not match completion message",
    );
  }
  if (typed.completionMessageDigest !== verifiedMessage.messageDigest) {
    throw new GenerationControlError(
      "correlation-mismatch",
      "completion outcome completionMessageDigest does not match completion message",
    );
  }
  if (typed.view !== verifiedMessage.view || !scopesEqual(typed.scope, verifiedMessage.scope)) {
    throw new GenerationControlError(
      "invalid-scope",
      "completion outcome view/scope does not match completion message",
    );
  }
  if (typed.status === "published") {
    if (verifiedMessage.completionState === "aborted") {
      throw new GenerationControlError(
        "invalid-outcome",
        "an aborted completion message cannot receive a published outcome",
      );
    }
    const batchReceiptIds = new Set<string>([
      ...verifiedMessage.batches.map((b) => b.receiptId),
      ...batchReceipts.map((r) => r.receiptId),
    ]);
    if (batchReceiptIds.has(typed.publicationReceiptId)) {
      throw new GenerationControlError(
        "invalid-outcome",
        "publicationReceiptId must be distinct from every batch receiptId",
      );
    }
  }
  return cloneCompletionOutcome(typed);
}

/**
 * Neutral producer-side generation correlation & completion coordinator.
 * Enforces:
 *   - view-aware fencing BEFORE every sink/completion call;
 *   - pre-delivery 4 MiB + canonical digest check via batch-codec;
 *   - idempotent batch retry and conflicting-digest refusal BEFORE calling sink;
 *   - strict separation of durable batch receipts (`published: false`, even for
 *     `finalBatch: true`) from the separate neutral completion control message;
 *   - publication state becomes `true` ONLY after a verified storage-kernel
 *     `published` outcome carrying a distinct storage-issued generation ID.
 */
export function createGenerationSession(
  correlation: ProducerGenerationCorrelationDto,
  ports: GenerationSessionPorts,
): GenerationCorrelationSession {
  const checked = validateProducerGenerationCorrelation(correlation);
  if (!checked.ok) {
    throw new GenerationControlError(
      "invalid-correlation",
      `invalid producer generation correlation: ${checked.errors.join("; ")}`,
    );
  }
  if (
    !ports ||
    typeof ports.batchSink?.deliver !== "function" ||
    typeof ports.completion?.complete !== "function"
  ) {
    throw new GenerationControlError(
      "invalid-correlation",
      "generation session requires injected batchSink and completion ports",
    );
  }

  const fixedCorrelation = cloneCorrelation(correlation);
  let sessionState: GenerationSessionState = "staging";
  let closing = false;
  let inputFrozen = false;
  let inFlightDeliveries = 0;
  let storedOutcome: GenerationCompletionOutcomeDto | undefined;
  const acknowledged = new Map<string, BatchDeliveryReceiptDto>();
  const inFlightBatchDigests = new Map<string, { readonly digest: string; count: number }>();

  return {
    get correlation(): ProducerGenerationCorrelationDto {
      return cloneCorrelation(fixedCorrelation);
    },

    state(): GenerationSessionState {
      return sessionState;
    },

    isPublished(): boolean {
      return sessionState === "published" && storedOutcome?.status === "published";
    },

    receipts(): readonly BatchDeliveryReceiptDto[] {
      return [...acknowledged.values()].map(cloneBatchReceipt);
    },

    publicationOutcome(): GenerationCompletionOutcomeDto | undefined {
      return storedOutcome !== undefined ? cloneCompletionOutcome(storedOutcome) : undefined;
    },

    async deliverBatch(
      batch: FactBatchDto,
      fencingToken: ScopeFencingTokenDto,
      options?: DeliverGenerationBatchOptions,
    ): Promise<BatchDeliveryReceiptDto> {
      if (inputFrozen || closing || sessionState !== "staging") {
        throw new GenerationControlError(
          "session-closed",
          inputFrozen && sessionState === "staging"
            ? "cannot deliver batch after generation session froze input for completion"
            : `cannot deliver batch after generation session entered state "${sessionState}"`,
        );
      }
      const verifiedToken = assertValidViewFencingToken(
        fencingToken,
        fixedCorrelation,
        options?.expectedIncarnation,
        options?.nowMs,
      );
      assertCorrelationMatchesBatch(fixedCorrelation, batch);

      const prior = acknowledged.get(batch.batchId);
      if (prior !== undefined && prior.batchDigest !== batch.batchDigest) {
        throw new GenerationControlError(
          "duplicate-batch-conflict",
          `batch ${batch.batchId} was already acknowledged with a different canonical digest`,
        );
      }
      const inFlight = inFlightBatchDigests.get(batch.batchId);
      if (inFlight !== undefined && inFlight.digest !== batch.batchDigest) {
        throw new GenerationControlError(
          "duplicate-batch-conflict",
          `batch ${batch.batchId} is already in flight with a different canonical digest`,
        );
      }

      if (inFlight !== undefined) {
        inFlight.count += 1;
      } else {
        inFlightBatchDigests.set(batch.batchId, { digest: batch.batchDigest, count: 1 });
      }
      inFlightDeliveries += 1;

      try {
        const delivered = await deliverCheckedFactBatch(
          batch,
          {
            deliver: (checkedBatch, encoded) =>
              ports.batchSink.deliver(checkedBatch, encoded, cloneFencingToken(verifiedToken)),
          },
          {
            maxBytes: options?.maxBytes,
            verifyDigest: options?.verifyDigest,
          },
        );

        if (inputFrozen || closing || sessionState !== "staging") {
          throw new GenerationControlError(
            "session-closed",
            `generation session closed while batch ${delivered.batch.batchId} was in flight`,
          );
        }

        const receiptChecked = validateBatchDeliveryReceipt(delivered.receipt);
        if (!receiptChecked.ok) {
          throw new GenerationControlError(
            "invalid-receipt",
            `sink returned an invalid batch receipt: ${receiptChecked.errors.join("; ")}`,
          );
        }
        const receipt = delivered.receipt;
        if (
          receipt.producerGenerationId !== fixedCorrelation.producerGenerationId ||
          receipt.batchId !== delivered.batch.batchId ||
          receipt.batchDigest !== delivered.batch.batchDigest ||
          receipt.byteLength !== delivered.encoded.byteLength
        ) {
          throw new GenerationControlError(
            "invalid-receipt",
            `sink receipt does not match delivered batch ${delivered.batch.batchId}`,
          );
        }
        const latestPrior = acknowledged.get(receipt.batchId);
        if (latestPrior !== undefined) {
          if (latestPrior.batchDigest !== receipt.batchDigest) {
            throw new GenerationControlError(
              "duplicate-batch-conflict",
              `batch ${receipt.batchId} was acknowledged with a conflicting digest`,
            );
          }
          if (latestPrior.receiptId !== receipt.receiptId) {
            throw new GenerationControlError(
              "invalid-receipt",
              `idempotent retry of batch ${receipt.batchId} returned a different receiptId`,
            );
          }
        }

        const stored = cloneBatchReceipt(receipt);
        acknowledged.set(stored.batchId, stored);
        return cloneBatchReceipt(stored);
      } finally {
        inFlightDeliveries -= 1;
        const entry = inFlightBatchDigests.get(batch.batchId);
        if (entry !== undefined) {
          entry.count -= 1;
          if (entry.count <= 0) inFlightBatchDigests.delete(batch.batchId);
        }
      }
    },

    async complete(
      input: CompleteGenerationInput,
      fencingToken: ScopeFencingTokenDto,
      options?: CompleteGenerationOptions,
    ): Promise<GenerationCompletionResult> {
      if (closing || sessionState !== "staging") {
        throw new GenerationControlError(
          "session-closed",
          `cannot complete generation session already in state "${sessionState}"`,
        );
      }
      if (inFlightDeliveries > 0) {
        throw new GenerationControlError(
          "invalid-completion",
          "cannot emit generation completion while batch deliveries are still in flight",
        );
      }
      if (!isPlainRecord(input)) {
        throw new GenerationControlError("invalid-completion", "completion input must be a plain object");
      }
      for (const key of Object.keys(input)) {
        if (!COMPLETE_SESSION_INPUT_KEYS.includes(key)) {
          throw new GenerationControlError(
            "storage-capability-forbidden",
            "completion input carries an unknown or disallowed key",
          );
        }
      }
      const verifiedToken = assertValidViewFencingToken(
        fencingToken,
        fixedCorrelation,
        options?.expectedIncarnation,
        options?.nowMs,
      );
      const snapshotReceipts = [...acknowledged.values()].map(cloneBatchReceipt);
      const message = buildGenerationCompletionMessage({
        correlation: fixedCorrelation,
        receipts: snapshotReceipts,
        completionState: input.completionState,
        expectedBatchCount: input.expectedBatchCount,
        coverage: input.coverage,
        exclusions: input.exclusions,
        errors: input.errors,
        remainingWork: input.remainingWork,
        abortReason: input.abortReason,
        completedAt: input.completedAt,
      });

      closing = true;
      inputFrozen = true;
      let rawOutcome: GenerationCompletionOutcomeDto;
      try {
        rawOutcome = await ports.completion.complete(
          cloneCompletionMessage(message),
          cloneFencingToken(verifiedToken),
        );
      } catch (error) {
        closing = false;
        throw error;
      }

      let verifiedOutcome: GenerationCompletionOutcomeDto;
      try {
        verifiedOutcome = verifyGenerationCompletionOutcome(rawOutcome, message, snapshotReceipts);
      } catch (error) {
        closing = false;
        throw error;
      }

      storedOutcome = verifiedOutcome;
      sessionState = verifiedOutcome.status;
      return {
        message: cloneCompletionMessage(message),
        outcome: cloneCompletionOutcome(verifiedOutcome),
      };
    },
  };
}
