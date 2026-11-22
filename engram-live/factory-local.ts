// @sentropic/engram-live/factory-local — E-ASM3 local-state, scheduling,
// publication and capture-stability composition behind the neutral factory
// (spec/SPEC_LIVE_GIT_INDEXING.md §§3, 7–8, 10–13; plan/09 E-ASM3).
//
// Wires the five remaining neutral capabilities (`index-snapshot`,
// `working-tree`, `diffs`, `reconciliation`, `publication`) to their delivered
// neutral engines (`./worktree.js`, `./diffs.js`, `./snapshots.js`,
// `./content-policy.js`, `./scheduler.js`, `./watch.js`, `./reconcile.js`,
// `./coverage.js`, `./generation.js`), replaces the L1b `ContentPort` and
// `CachePort` placeholder seams with the typed L4b/L5 capabilities, and feeds
// verified L4a `StableCapture` evidence into L5 `analyzeCode` without editing
// `engram-live/worktree.ts`.
//
// Strict invariants:
//   - Plaintext private content NEVER enters a batch, diagnostic, store, or
//     result surface (L4b policy-before-persistence + sealed-only diffs).
//   - Every local snapshot, diff, reconciliation and publication delivery is
//     fenced by a verified `ScopeFencingTokenDto` (worktree-scoped for private
//     views and L6b scheduling; view-matched for L3a-E2 completion).
//   - The scheduler is host/factory-owned across rounds and scopes — NEVER
//     bound to an ephemeral client lifetime.
//   - Missing or refusing ports, denied writer authority, revoked fencing
//     tokens or unauthorized roots produce explicit `"unavailable"`
//     (`delivered: false`) with zero sink/store/publication writes.
//   - Verified capture evidence is populated ONLY from a verified
//     `StableCapture` (`stable: true`) with the exact captured byte
//     fingerprint — never from `UnstableCapture` or caller-supplied content.
//   - Neutral closure only: no root package, no host, no database, no network,
//     no `node:module` or loader factory.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, resolve, sep } from "node:path";
import type { AnalysisCachePort } from "./analysis-cache.js";
import {
  BatchCodecError,
  buildFactBatch,
  canonicalEncodeValue,
  encodeFactBatch,
} from "./batch-codec.js";
import type { AnalyzeCodeInput, VerifiedCaptureEvidenceDto } from "./code-analysis.js";
import {
  classifyPath,
  containsSecretText,
  protectedPathRef,
  type KeyProviderPort,
} from "./content-policy.js";
import {
  CONTRACT_VERSION,
  COVERAGE_FACT_AXES,
  COVERAGE_FACT_STATES,
  FACT_SCHEMA_VERSION,
  LOCAL_MAX_FILE_BYTES,
  MAX_FACT_BATCH_BYTES,
  POLICY_VERSION,
  PRODUCER_NAME,
  isStrictBatchId,
  isStrictGenerationId,
  isStrictKeyRef,
  validateScopeFencingToken,
  type BatchDeliveryReceiptDto,
  type CapabilityStatus,
  type CoverageFactAxis,
  type CoverageFactDto,
  type CoverageFactState,
  type FactBatchDto,
  type FactSinkPort,
  type FactSinkReceipt,
  type GenerationCompletionMessageDto,
  type GenerationCompletionOutcomeDto,
  type LiveFactDto,
  type LiveScope,
  type LocalCoverageReportDto,
  type LocalDiffDto,
  type LocalDiffEndpointDto,
  type LocalDiffKind,
  type LocalSnapshotDto,
  type ProducerGenerationCorrelationDto,
  type ReconcileCheckpointProgressFactDto,
  type ScopeFencingTokenDto,
  type WorkspaceDeclarationDto,
} from "./contracts.js";
import {
  allCurrent,
  deriveReadiness,
  sourceVectorsEqual,
  toContractState,
  type CoverageMap,
  type SourceVector,
} from "./coverage.js";
import {
  deriveLocalDiff,
  type ConflictStageInput,
  type HunkDraftInput,
  type LocalEntryInput,
} from "./diffs.js";
import {
  composeFactoryGitExecutor,
  type DeliveredBatchSummary,
  type GitPort,
  type UnavailableCapabilityResult,
} from "./factory-history.js";
import {
  defaultReadFileBytes,
  fingerprintBytes,
  splitNulBytes,
  toPathKey,
} from "./filesystem.js";
import {
  assertValidViewFencingToken,
  buildGenerationCompletionMessage,
  verifyGenerationCompletionOutcome,
  type CompleteGenerationInput,
  type GenerationCompletionPort,
} from "./generation.js";
import type { SafeGitExecutor } from "./git-executor.js";
import {
  Reconciler,
  type CollectOptions,
  type MarkerStore,
  type PublishGenerationReport,
  type ReconcileBudgets,
  type ReconcilePhase,
  type ReconcileScan,
  type ReconcilerPorts,
  type WriterAuthority,
} from "./reconcile.js";
import {
  Scheduler,
  scopeIdentity,
  type SchedulerBudgets,
  type SchedulerPorts,
  type SchedulerStats,
  type WorkItem,
} from "./scheduler.js";
import {
  SnapshotError,
  stageLocalSnapshot,
  type ContentProtectionPort,
  type LatestSnapshotPort,
} from "./snapshots.js";
import {
  createWatchHub,
  type WatchHub,
  type WatchPort,
} from "./watch.js";
import {
  captureWorktree,
  type CaptureHooks,
  type CaptureResult,
  type CapturedFile,
  type IndexEntry,
  type StableCapture,
} from "./worktree.js";

/**
 * Typed L4b local-content protection, key-custody and latest-only snapshot
 * ports supplied by the host (LIVE §§8, 10; plan/09 L4b / E-ASM3).
 * Replaces the L1b `ContentPort` placeholder seam.
 */
export interface ContentPort {
  /** Host content protection; `null` drives explicit metadata-only downgrade. */
  readonly protection?: ContentProtectionPort | null;
  /** Optional host key custody port; unavailable key drives metadata-only downgrade. */
  readonly keyProvider?: KeyProviderPort;
  /** Host latest-only snapshot store (atomic replaceLatest + unregister purgePrivate). */
  readonly latestSnapshots?: LatestSnapshotPort;
}

/**
 * Typed L5 analysis cache capability supplied by the host (LIVE §8; plan/09 L5 / E-ASM3).
 * Replaces the L1b `CachePort` placeholder seam.
 */
export interface CachePort extends AnalysisCachePort {}

/** Host-injected durable progress/backlog/sleep port for factory-composed L6b Scheduler. */
export interface SchedulerDurabilityPort {
  readonly sleep: SchedulerPorts["sleep"];
  readonly park: SchedulerPorts["park"];
  readonly readProgress: SchedulerPorts["readProgress"];
  readonly writeProgress: SchedulerPorts["writeProgress"];
  readonly backlogSize: SchedulerPorts["backlogSize"];
  readonly sink?: SchedulerPorts["sink"];
  readonly validateToken?: SchedulerPorts["validateToken"];
}

/**
 * Typed L6b scheduling, writer-authority, marker-store and scan ports supplied
 * by the host (LIVE §§7, 12–13; plan/09 L6b / E-ASM3).
 * The scheduler is host/factory-owned across rounds and scopes — never bound
 * to an ephemeral client lifetime.
 */
export interface SchedulingPort {
  readonly writer: WriterAuthority;
  readonly markerStore: MarkerStore;
  readonly scan: ReconcileScan;
  readonly pollRefs: ReconcilerPorts["pollRefs"];
  /** Optional shared host-owned Scheduler (allows multi-scope sharing across factories). */
  readonly scheduler?: Scheduler;
  /** Durable scheduler state used when the factory composes its own Scheduler. */
  readonly durability?: SchedulerDurabilityPort;
  readonly schedulerBudgets?: SchedulerBudgets;
  readonly watchBudgets?: {
    readonly debounceMs: number;
    readonly maxPendingPaths: number;
  };
  readonly reconcileBudgets?: ReconcileBudgets;
}

export interface LocalRuntimeContext {
  readonly declaration: WorkspaceDeclarationDto;
  readonly clock: { now(): number; schedule?(ms: number, callback: () => void): () => void } | undefined;
  readonly git: GitPort | undefined;
  readonly content: ContentPort | undefined;
  readonly factSink: FactSinkPort;
  readonly watch: WatchPort | undefined;
  readonly scheduling: SchedulingPort | undefined;
  readonly generationCompletion: GenerationCompletionPort | undefined;
}

/** Live L4a capture options for verified local L5 code analysis (Carbon R3-01). */
export interface LocalCaptureAnalysisOptions {
  readonly cwd: string;
  readonly snapshotKind?: "index" | "working-tree";
  readonly maxAttempts?: number;
  readonly maxFileBytes?: number;
  readonly hooks?: CaptureHooks;
}

export interface LocalPrivateBatchContext {
  /** Producer generation correlation ID (`gen:<10 digits>`, L3a-E2 / L4b-2). */
  readonly generationId: string;
  /** Worktree-scoped fencing token (`scope.worktree === declaration.worktreeId`). */
  readonly fencingToken: ScopeFencingTokenDto;
  /** Optional storage-owned projection incarnation expected on the fencing token. */
  readonly expectedIncarnation?: string;
  /** Optional strict opaque batch ID (`batch:...`); minted deterministically when omitted. */
  readonly batchId?: string;
  /** Optional per-request content-protection override (`null` for metadata-only downgrade). */
  readonly protection?: ContentProtectionPort | null;
  /** Optional per-request key-provider override. */
  readonly keyProvider?: KeyProviderPort;
  /** Optional per-request latest-only snapshot store override. */
  readonly store?: LatestSnapshotPort;
}

export interface IndexSnapshotCapabilityRequest extends LocalPrivateBatchContext {
  /** Authorized worktree root path to capture through L4a SafeGitExecutor. */
  readonly cwd: string;
  /** Staged (HEAD -> index) or conflict (index stages 1/2/3); default "staged". */
  readonly diffKind?: "staged" | "conflict";
  readonly maxAttempts?: number;
  readonly maxFileBytes?: number;
  readonly hooks?: CaptureHooks;
  readonly hunkDrafts?: readonly HunkDraftInput[];
  readonly plaintextPayload?: Uint8Array | null;
}

export interface WorkingTreeCapabilityRequest extends LocalPrivateBatchContext {
  /** Authorized worktree root path to capture through L4a SafeGitExecutor. */
  readonly cwd: string;
  readonly maxAttempts?: number;
  readonly maxFileBytes?: number;
  readonly hooks?: CaptureHooks;
  readonly hunkDrafts?: readonly HunkDraftInput[];
  readonly plaintextPayload?: Uint8Array | null;
}

export interface DiffsCapabilityRequest extends LocalPrivateBatchContext {
  readonly kind: LocalDiffKind;
  readonly base: LocalDiffEndpointDto;
  readonly tip: LocalDiffEndpointDto;
  readonly baseEntries: readonly LocalEntryInput[];
  readonly tipEntries: readonly LocalEntryInput[];
  readonly conflictStages?: readonly ConflictStageInput[];
  readonly hunkDrafts?: readonly HunkDraftInput[];
  readonly stable?: boolean;
  readonly unstableReason?: string;
  readonly maxFileBytes?: number;
  readonly plaintextPayload?: Uint8Array | null;
}

export type ReconciliationAction =
  | "bootstrap"
  | "round"
  | "converge"
  | "restart"
  | "cancel"
  | "shutdown";

export interface ReconciliationCapabilityRequest {
  readonly generationId: string;
  readonly action?: ReconciliationAction;
  /** Whether to call watchHub.bootstrap() when still starting (default: true). */
  readonly bootstrapWatch?: boolean;
  readonly maxBatchBytes?: number;
}

export interface PublicationCompletionInput {
  readonly port?: GenerationCompletionPort;
  readonly correlation: ProducerGenerationCorrelationDto;
  readonly receipts: readonly BatchDeliveryReceiptDto[];
  readonly input: CompleteGenerationInput;
}

export interface PublicationCapabilityRequest {
  readonly generationId: string;
  readonly fencingToken: ScopeFencingTokenDto;
  readonly expectedIncarnation?: string;
  readonly sourceVector?: SourceVector;
  readonly checkpoint?: string;
  readonly completion?: PublicationCompletionInput;
  /** When ports.watch is injected, require watcher readiness and zero overflow (default: true). */
  readonly requireWatchReady?: boolean;
  readonly maxBatchBytes?: number;
}

export interface IndexSnapshotCapabilityResult extends CapabilityStatus {
  readonly capability: "index-snapshot";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly capture: CaptureResult;
  readonly diff: LocalDiffDto;
  readonly snapshot: LocalSnapshotDto;
  readonly coverage: LocalCoverageReportDto;
  readonly diagnostics: readonly string[];
  readonly batch: DeliveredBatchSummary;
  readonly verifiedCaptures: Readonly<Record<string, VerifiedCaptureEvidenceDto>>;
}

export interface WorkingTreeCapabilityResult extends CapabilityStatus {
  readonly capability: "working-tree";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly capture: CaptureResult;
  readonly diff: LocalDiffDto;
  readonly snapshot: LocalSnapshotDto;
  readonly coverage: LocalCoverageReportDto;
  readonly diagnostics: readonly string[];
  readonly batch: DeliveredBatchSummary;
  readonly verifiedCaptures: Readonly<Record<string, VerifiedCaptureEvidenceDto>>;
}

export interface DiffsCapabilityResult extends CapabilityStatus {
  readonly capability: "diffs";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly diff: LocalDiffDto;
  readonly snapshot: LocalSnapshotDto;
  readonly coverage: LocalCoverageReportDto;
  readonly diagnostics: readonly string[];
  readonly batch: DeliveredBatchSummary;
}

export interface ReconciliationCapabilityResult extends CapabilityStatus {
  readonly capability: "reconciliation";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly action: ReconciliationAction;
  readonly converged: boolean;
  readonly phase: ReconcilePhase;
  readonly coverage: CoverageMap;
  readonly readiness: {
    readonly localReady: boolean;
    readonly historicalComplete: boolean;
    readonly allCurrent: boolean;
  };
  readonly schedulerStats: SchedulerStats | undefined;
  readonly ledger: ReturnType<Scheduler["ledgerSnapshot"]>;
  readonly batches: readonly DeliveredBatchSummary[];
}

export interface PublicationCapabilityResult extends CapabilityStatus {
  readonly capability: "publication";
  readonly state: "available";
  readonly delivered: true;
  readonly generationId: string;
  readonly published: boolean;
  readonly publicationReport?: PublishGenerationReport;
  readonly completionMessage?: GenerationCompletionMessageDto;
  readonly completionOutcome?: GenerationCompletionOutcomeDto;
  readonly schedulerStats: SchedulerStats | undefined;
  readonly ledger: ReturnType<Scheduler["ledgerSnapshot"]>;
  readonly batches: readonly DeliveredBatchSummary[];
}

export type LocalCapabilityResult =
  | UnavailableCapabilityResult
  | IndexSnapshotCapabilityResult
  | WorkingTreeCapabilityResult
  | DiffsCapabilityResult
  | ReconciliationCapabilityResult
  | PublicationCapabilityResult;

export interface LocalSchedulingController {
  runReconciliation(
    status: CapabilityStatus,
    request: unknown,
  ): Promise<ReconciliationCapabilityResult | UnavailableCapabilityResult>;
  runPublication(
    status: CapabilityStatus,
    request: unknown,
  ): Promise<PublicationCapabilityResult | UnavailableCapabilityResult>;
}

/** Default bounded scheduler profile matching the verified L6b profile (plan/09 L6b). */
export const DEFAULT_FACTORY_SCHEDULER_BUDGETS: SchedulerBudgets = Object.freeze({
  maxPendingPaths: 64,
  maxPendingBytes: 16 * 1024 * 1024,
  maxConcurrency: 4,
  maxActiveOperationsPerScope: 1,
  maxRetries: 2,
  retryBaseMs: 50,
  maxBackoffMs: 30_000,
  maxFailedKept: 8,
  maxConsumers: 32,
  maxFileSizeBytes: LOCAL_MAX_FILE_BYTES,
  maxPathBytes: 1024,
  readMarginBytes: 64,
  maxDiscoveryBytes: 8 * 1024,
  maxBatchBytes: 1024 * 1024,
  maxGitChildren: 4,
  attemptDeadlineMs: 30_000,
  cancellationDeadlineMs: 10,
  interactiveQuantum: 3,
  backfillQuantum: 1,
  backfillReserveBytes: 4 * 1024 * 1024,
  durableBacklogQuota: 100_000,
});

export const DEFAULT_FACTORY_WATCH_BUDGETS = Object.freeze({
  debounceMs: 500,
  maxPendingPaths: 16,
});

export const DEFAULT_FACTORY_RECONCILE_BUDGETS: ReconcileBudgets = Object.freeze({
  maxRounds: 64,
  collectPageSize: 4,
  maxPagesPerRound: 2,
  operationBytes: 4 * 1024 * 1024,
  maxDeltaPaths: 16,
  pollIntervalMs: 10_000,
});

const ENVELOPE_HEADROOM_BYTES = 1024;
const ZERO_OID = /^0+$/;
const COVERAGE_AXIS_SET: ReadonlySet<string> = new Set(COVERAGE_FACT_AXES);
const COVERAGE_STATE_SET: ReadonlySet<string> = new Set(COVERAGE_FACT_STATES);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Uint8Array) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function safeErrorDetail(error: unknown): string {
  if (error instanceof SnapshotError) return error.code;
  const raw = error instanceof Error ? error.message : String(error);
  return containsSecretText(raw) ? "operation refused by content policy" : raw;
}

function unavailable(status: CapabilityStatus, reason: string): UnavailableCapabilityResult {
  const safeReason = containsSecretText(reason) ? "capability unavailable: refused by content policy" : reason;
  return {
    capability: status.capability,
    state: "unavailable",
    reason: safeReason,
    plannedLot: status.plannedLot,
    delivered: false,
  };
}

function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function tryRealpath(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function normalizePath(path: string): string {
  const resolved = resolve(path);
  if (resolved.length > 1) {
    const trimmed = resolved.replace(/\/+$/, "");
    return trimmed.length === 0 ? "/" : trimmed;
  }
  return resolved;
}

function isInsideOrEqual(candidate: string, parent: string): boolean {
  const normCandidate = normalizePath(candidate);
  const normParent = normalizePath(parent);
  if (normParent === "/") return normCandidate === "/";
  return normCandidate === normParent || normCandidate.startsWith(`${normParent}${sep}`);
}

function readClockMs(clock: { now(): number } | undefined): { ok: true; nowMs: number } | { ok: false; reason: string } {
  if (!clock || typeof clock.now !== "function") {
    return { ok: false, reason: "missing host clock port (ports.clock.now)" };
  }
  let value: number;
  try {
    value = clock.now();
  } catch (error) {
    return { ok: false, reason: `host clock port refused: ${safeErrorDetail(error)}` };
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    return { ok: false, reason: "host clock port must return a positive safe-integer Unix millisecond timestamp" };
  }
  return { ok: true, nowMs: value };
}

function validateFactSinkPort(sink: FactSinkPort): { ok: true; sink: FactSinkPort } | { ok: false; reason: string } {
  if (!sink || typeof sink.deliver !== "function") {
    return { ok: false, reason: "missing host fact sink port (ports.factSink.deliver)" };
  }
  return { ok: true, sink };
}

function isLatestSnapshotPort(value: unknown): value is LatestSnapshotPort {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<LatestSnapshotPort>;
  return (
    typeof candidate.loadLatest === "function" &&
    typeof candidate.replaceLatest === "function" &&
    typeof candidate.purgePrivate === "function"
  );
}

function isContentProtectionPort(value: unknown): value is ContentProtectionPort {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Partial<ContentProtectionPort>).protect === "function";
}

function isKeyProviderPort(value: unknown): value is KeyProviderPort {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Partial<KeyProviderPort>).currentKeyRef === "function";
}

function isWatchPort(value: unknown): value is WatchPort {
  if (!value || typeof value !== "object") return false;
  const w = value as Partial<WatchPort>;
  return typeof w.start === "function" && typeof w.stop === "function" && typeof w.onSignal === "function";
}

function isWriterAuthority(value: unknown): value is WriterAuthority {
  if (!value || typeof value !== "object") return false;
  const w = value as Partial<WriterAuthority>;
  return (
    typeof w.acquire === "function" &&
    typeof w.renew === "function" &&
    typeof w.validate === "function" &&
    typeof w.revoke === "function" &&
    typeof w.release === "function"
  );
}

function isMarkerStore(value: unknown): value is MarkerStore {
  if (!value || typeof value !== "object") return false;
  const m = value as Partial<MarkerStore>;
  return (
    typeof m.get === "function" &&
    typeof m.set === "function" &&
    typeof m.delete === "function" &&
    typeof m.incarnation === "function" &&
    typeof m.hasGeneration === "function"
  );
}

function isReconcileScan(value: unknown): value is ReconcileScan {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<ReconcileScan>;
  return (
    typeof s.discoverPage === "function" &&
    typeof s.collectPaths === "function" &&
    typeof s.repairRelations === "function" &&
    typeof s.validateSource === "function" &&
    typeof s.publishGeneration === "function" &&
    typeof s.currentSourceVector === "function" &&
    typeof s.pathFingerprint === "function"
  );
}

function isSchedulerDurabilityPort(value: unknown): value is SchedulerDurabilityPort {
  if (!value || typeof value !== "object") return false;
  const d = value as Partial<SchedulerDurabilityPort>;
  return (
    typeof d.sleep === "function" &&
    typeof d.park === "function" &&
    typeof d.readProgress === "function" &&
    typeof d.writeProgress === "function" &&
    typeof d.backlogSize === "function"
  );
}

function isSchedulerInstance(value: unknown): value is Scheduler {
  if (!value || typeof value !== "object") return false;
  const s = value as Partial<Scheduler>;
  return (
    typeof s.execute === "function" &&
    typeof s.enqueue === "function" &&
    typeof s.cancelOperation === "function" &&
    typeof s.quiesceScope === "function" &&
    typeof s.discardPaused === "function" &&
    typeof s.retain === "function" &&
    typeof s.ledgerSnapshot === "function" &&
    typeof s.lastStats === "function" &&
    typeof s.budgets === "object" &&
    s.budgets !== null
  );
}

function isGenerationCompletionPort(value: unknown): value is GenerationCompletionPort {
  if (!value || typeof value !== "object") return false;
  return typeof (value as Partial<GenerationCompletionPort>).complete === "function";
}

function validateWorktreeFencingToken(
  token: unknown,
  declaration: WorkspaceDeclarationDto,
  nowMs: number,
  expectedIncarnation?: string,
): { ok: true; token: ScopeFencingTokenDto } | { ok: false; reason: string } {
  const worktreeScope: LiveScope = {
    tenant: declaration.tenant,
    clone: declaration.cloneId,
    worktree: declaration.worktreeId,
  };
  const checked = validateScopeFencingToken(token, worktreeScope, expectedIncarnation, nowMs);
  if (!checked.ok) {
    return { ok: false, reason: `worktree fencing token rejected: ${checked.errors.join("; ")}` };
  }
  const typed = token as ScopeFencingTokenDto;
  if (typed.scope.worktree !== declaration.worktreeId) {
    return {
      ok: false,
      reason: "local private capability requires a worktree-scoped fencing token matching declaration.worktreeId",
    };
  }
  if (typed.declarationRevision !== declaration.declarationRevision) {
    return {
      ok: false,
      reason: `fencing token declarationRevision (${typed.declarationRevision}) does not match workspace declaration revision (${declaration.declarationRevision})`,
    };
  }
  return {
    ok: true,
    token: {
      tokenId: typed.tokenId,
      scope: {
        tenant: typed.scope.tenant,
        clone: typed.scope.clone,
        worktree: typed.scope.worktree,
      },
      epoch: typed.epoch,
      epochId: typed.epochId,
      declarationRevision: typed.declarationRevision,
      projectionIncarnation: typed.projectionIncarnation,
      issuedAt: typed.issuedAt,
      expiresAt: typed.expiresAt,
    },
  };
}

function resolveAuthorizedWorktreePath(
  cwd: unknown,
  authorizedRoots: readonly string[],
): { ok: true; rootReal: string; gitDir: string | null; commonDir: string | null; configPaths: readonly string[] } | { ok: false; reason: string } {
  if (typeof cwd !== "string" || cwd.length === 0 || cwd.includes("\0") || !isAbsolute(cwd)) {
    return { ok: false, reason: "request.cwd must be a non-empty NUL-free absolute path" };
  }
  const rootReal = tryRealpath(cwd);
  if (rootReal === null) {
    return { ok: false, reason: `worktree path cannot be resolved on disk: ${cwd}` };
  }
  const authorizedReal = authorizedRoots
    .map((entry) => tryRealpath(entry))
    .filter((entry): entry is string => entry !== null);
  if (!authorizedReal.some((entry) => isInsideOrEqual(rootReal, entry))) {
    return { ok: false, reason: `worktree path is outside workspace declaration authorizedRoots: ${cwd}` };
  }
  let gitDir: string | null = null;
  try {
    const dotGit = join(rootReal, ".git");
    const st = statSync(dotGit);
    if (st.isDirectory()) {
      gitDir = dotGit;
    } else if (st.isFile()) {
      const raw = readFileSync(dotGit, "utf8").trim();
      if (raw.startsWith("gitdir:")) {
        const target = raw.slice("gitdir:".length).trim();
        gitDir = isAbsolute(target) ? target : resolve(rootReal, target);
      }
    }
  } catch {
    gitDir = null;
  }
  let commonDir = gitDir;
  if (gitDir !== null) {
    try {
      const raw = readFileSync(join(gitDir, "commondir"), "utf8").trim();
      if (raw) commonDir = isAbsolute(raw) ? raw : resolve(gitDir, raw);
    } catch {
      commonDir = gitDir;
    }
  }
  const configPaths: string[] = [];
  if (commonDir !== null && gitDir !== null) {
    for (const candidate of [join(commonDir, "config"), join(gitDir, "config.worktree")]) {
      if (existsSync(candidate)) configPaths.push(candidate);
    }
  }
  return { ok: true, rootReal, gitDir, commonDir, configPaths };
}

async function resolveContentPorts(
  ctxContent: ContentPort | undefined,
  request: Record<string, unknown>,
): Promise<
  | { readonly ok: true; readonly store: LatestSnapshotPort; readonly protection: ContentProtectionPort | null }
  | { readonly ok: false; readonly reason: string }
> {
  const storeCandidate = request.store !== undefined ? request.store : ctxContent?.latestSnapshots;
  if (!isLatestSnapshotPort(storeCandidate)) {
    return { ok: false, reason: "missing host latest-only snapshot store port (ports.content.latestSnapshots)" };
  }
  const keyProviderCandidate =
    request.keyProvider !== undefined ? request.keyProvider : ctxContent?.keyProvider;
  const protectionCandidate =
    request.protection !== undefined ? request.protection : ctxContent?.protection;

  if (keyProviderCandidate !== undefined) {
    if (!isKeyProviderPort(keyProviderCandidate)) {
      return { ok: false, reason: "host key provider port (ports.content.keyProvider) must expose currentKeyRef()" };
    }
    let keyStatus: { readonly state: "available"; readonly keyRef: string } | { readonly state: "unavailable"; readonly reason: string };
    try {
      keyStatus = await keyProviderCandidate.currentKeyRef();
    } catch (error) {
      return { ok: false, reason: `host key provider port refused: ${safeErrorDetail(error)}` };
    }
    if (!keyStatus || typeof keyStatus !== "object") {
      return { ok: false, reason: "host key provider returned invalid status" };
    }
    if (keyStatus.state === "unavailable") {
      // Explicit metadata-only downgrade (Q2 B): zero protect calls, zero plaintext.
      return { ok: true, store: storeCandidate, protection: null };
    }
    if (keyStatus.state !== "available" || !isStrictKeyRef(keyStatus.keyRef)) {
      return { ok: false, reason: "host key provider returned invalid keyRef" };
    }
  }

  if (protectionCandidate === null) {
    return { ok: true, store: storeCandidate, protection: null };
  }
  if (!isContentProtectionPort(protectionCandidate)) {
    return { ok: false, reason: "missing host content protection port (ports.content.protection)" };
  }
  return { ok: true, store: storeCandidate, protection: protectionCandidate };
}

function gitBlobHash(objectFormat: string, bytes: Uint8Array): string {
  const header = Buffer.from(`blob ${bytes.byteLength}\0`);
  const algorithm = objectFormat === "sha256" ? "sha256" : "sha1";
  return createHash(algorithm).update(header).update(bytes).digest("hex");
}

function parseLsTreeLong(output: Buffer): Array<{
  readonly mode: string;
  readonly type: string;
  readonly oid: string;
  readonly size: number | undefined;
  readonly path: Buffer;
}> {
  const out: Array<{
    readonly mode: string;
    readonly type: string;
    readonly oid: string;
    readonly size: number | undefined;
    readonly path: Buffer;
  }> = [];
  for (const record of splitNulBytes(output)) {
    const tab = record.indexOf(0x09);
    if (tab <= 0) continue;
    const header = record.subarray(0, tab).toString("latin1").trim().split(/\s+/);
    if (header.length < 4) continue;
    const mode = header[0]!;
    const type = header[1]!;
    const oid = header[2]!;
    const rawSize = header[3]!;
    const size = rawSize === "-" ? undefined : Number(rawSize);
    out.push({
      mode,
      type,
      oid,
      size: size !== undefined && Number.isSafeInteger(size) && size >= 0 ? size : undefined,
      path: record.subarray(tab + 1),
    });
  }
  return out;
}

function readVerifiedBlobInfo(
  exec: SafeGitExecutor,
  rootReal: string,
  objectFormat: string,
  oid: string,
  maxFileBytes: number,
):
  | { readonly ok: true; readonly size: number; readonly isBinary: boolean; readonly sha256: string | null }
  | { readonly ok: false; readonly oversized?: boolean } {
  if (ZERO_OID.test(oid)) return { ok: false };
  const type = exec.run(rootReal, ["cat-file", "-t", oid]).toString("utf8").trim();
  if (type !== "blob") return { ok: false };
  const size = Number(exec.run(rootReal, ["cat-file", "-s", oid]).toString("utf8").trim());
  if (!Number.isSafeInteger(size) || size < 0) return { ok: false };
  if (size > maxFileBytes) return { ok: false, oversized: true };
  const raw = exec.run(rootReal, ["cat-file", "-p", oid]);
  if (gitBlobHash(objectFormat, raw) !== oid) return { ok: false };
  const isBinary = raw.includes(0);
  return {
    ok: true,
    size: raw.byteLength,
    isBinary,
    sha256: fingerprintBytes(raw),
  };
}

function entryKindFromMode(mode: string): LocalEntryInput["kind"] {
  if (mode === "120000") return "symlink";
  if (mode === "160000") return "gitlink";
  if (mode === "100644" || mode === "100755") return "file";
  return "other";
}

function buildIndexLocalEntries(
  capture: StableCapture,
  exec: SafeGitExecutor,
  diffKind: "staged" | "conflict",
  maxFileBytes: number,
): {
  readonly base: LocalDiffEndpointDto;
  readonly tip: LocalDiffEndpointDto;
  readonly baseEntries: LocalEntryInput[];
  readonly tipEntries: LocalEntryInput[];
  readonly conflictStages?: ConflictStageInput[];
  readonly indexBlobFingerprints: Map<string, string>;
} {
  const oidLen = capture.objectFormat === "sha256" ? 64 : 40;
  const zeroOid = "0".repeat(oidLen);
  const indexEndpoint: LocalDiffEndpointDto = { label: "index", oid: capture.indexDigest };
  const capturedByKey = new Map<string, CapturedFile>();
  for (const file of capture.files) capturedByKey.set(toPathKey(file.path), file);
  const indexBlobFingerprints = new Map<string, string>();

  const toEntry = (
    path: Uint8Array,
    mode: string,
    oid: string,
    stage: number,
    knownSize?: number,
    fingerprintSink?: Map<string, string>,
  ): LocalEntryInput => {
    const key = toPathKey(Buffer.from(path));
    const cap = capturedByKey.get(key);
    const filtered = cap?.exclusionReason === "filtered";
    const kind = entryKindFromMode(mode);
    if (filtered || classifyPath(path).allowed === false || kind !== "file") {
      return {
        path: Uint8Array.from(path),
        mode,
        oid,
        stage,
        kind,
        ...(filtered ? { filtered: true } : {}),
        ...(knownSize !== undefined ? { size: knownSize } : {}),
      };
    }
    if (knownSize !== undefined && knownSize > maxFileBytes) {
      return { path: Uint8Array.from(path), mode, oid, stage, kind, size: knownSize };
    }
    const blob = readVerifiedBlobInfo(exec, capture.root, capture.objectFormat, oid, maxFileBytes);
    if (!blob.ok) {
      return {
        path: Uint8Array.from(path),
        mode,
        oid,
        stage,
        kind,
        ...(blob.oversized ? { size: maxFileBytes + 1 } : {}),
      };
    }
    if (stage === 0 && blob.sha256 !== null && fingerprintSink !== undefined) {
      fingerprintSink.set(key, blob.sha256);
    }
    return {
      path: Uint8Array.from(path),
      mode,
      oid,
      stage,
      kind,
      size: blob.size,
      isBinary: blob.isBinary,
    };
  };

  if (diffKind === "conflict") {
    const stageEntries = capture.entries.filter((e) => e.stage === 1 || e.stage === 2 || e.stage === 3);
    const byPath = new Map<string, IndexEntry[]>();
    for (const entry of stageEntries) {
      const k = toPathKey(entry.path);
      const list = byPath.get(k) ?? [];
      list.push(entry);
      byPath.set(k, list);
    }
    const localEntries: LocalEntryInput[] = [];
    const conflictStages: ConflictStageInput[] = [];
    for (const [, list] of [...byPath.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      let baseOid: string | null = null;
      let oursOid: string | null = null;
      let theirsOid: string | null = null;
      for (const entry of list) {
        localEntries.push(toEntry(entry.path, entry.mode, entry.oid, entry.stage));
        if (entry.stage === 1) baseOid = entry.oid;
        if (entry.stage === 2) oursOid = entry.oid;
        if (entry.stage === 3) theirsOid = entry.oid;
      }
      conflictStages.push({
        path: Uint8Array.from(list[0]!.path),
        baseOid,
        oursOid,
        theirsOid,
      });
    }
    return {
      base: indexEndpoint,
      tip: indexEndpoint,
      baseEntries: localEntries,
      tipEntries: localEntries,
      conflictStages,
      indexBlobFingerprints,
    };
  }

  const headEndpoint: LocalDiffEndpointDto = {
    label: "HEAD",
    oid: capture.headOid ?? zeroOid,
  };
  const headRecords =
    capture.headOid !== null
      ? parseLsTreeLong(exec.run(capture.root, ["ls-tree", "-r", "-l", "-z", capture.headOid]))
      : [];
  const headByKey = new Map(headRecords.map((rec) => [toPathKey(rec.path), rec]));
  const headBlobFingerprints = new Map<string, string>();
  const baseEntryByKey = new Map<string, LocalEntryInput>();
  const baseEntries: LocalEntryInput[] = [];
  for (const rec of headRecords) {
    const baseEntry = toEntry(rec.path, rec.mode, rec.oid, 0, rec.size, headBlobFingerprints);
    baseEntries.push(baseEntry);
    baseEntryByKey.set(toPathKey(rec.path), baseEntry);
  }
  const tipEntries: LocalEntryInput[] = [];
  for (const entry of capture.entries) {
    if (entry.stage !== 0) continue;
    const key = toPathKey(entry.path);
    const headRec = headByKey.get(key);
    if (headRec !== undefined && headRec.oid === entry.oid && headRec.mode === entry.mode) {
      // Unchanged from HEAD and still staged in index: reuse base entry and promote its verified fingerprint.
      const matchingBase = baseEntryByKey.get(key);
      if (matchingBase !== undefined) {
        const headFingerprint = headBlobFingerprints.get(key);
        if (headFingerprint !== undefined) {
          indexBlobFingerprints.set(key, headFingerprint);
        }
        tipEntries.push(matchingBase);
        continue;
      }
    }
    tipEntries.push(toEntry(entry.path, entry.mode, entry.oid, 0, undefined, indexBlobFingerprints));
  }
  return {
    base: headEndpoint,
    tip: indexEndpoint,
    baseEntries,
    tipEntries,
    indexBlobFingerprints,
  };
}

function buildWorkingTreeLocalEntries(
  capture: StableCapture,
  exec: SafeGitExecutor,
  maxFileBytes: number,
):
  | {
      readonly stable: true;
      readonly base: LocalDiffEndpointDto;
      readonly tip: LocalDiffEndpointDto;
      readonly baseEntries: LocalEntryInput[];
      readonly tipEntries: LocalEntryInput[];
    }
  | { readonly stable: false; readonly reason: string } {
  const oidLen = capture.objectFormat === "sha256" ? 64 : 40;
  const zeroOid = "0".repeat(oidLen);
  const indexEndpoint: LocalDiffEndpointDto = { label: "index", oid: capture.indexDigest };
  const worktreeEndpoint: LocalDiffEndpointDto = { label: "worktree", oid: null };

  const capturedByKey = new Map<string, CapturedFile>();
  for (const file of capture.files) capturedByKey.set(toPathKey(file.path), file);

  const sparseOmittedKeys = new Set<string>();
  for (const file of capture.files) {
    if (file.status === "sparse-omitted") sparseOmittedKeys.add(toPathKey(file.path));
  }

  const baseEntries: LocalEntryInput[] = [];
  for (const entry of capture.entries) {
    if (entry.stage !== 0) continue;
    const key = toPathKey(entry.path);
    if (sparseOmittedKeys.has(key)) continue;
    const cap = capturedByKey.get(key);
    const filtered = cap?.exclusionReason === "filtered";
    const kind = entryKindFromMode(entry.mode);
    if (filtered || classifyPath(entry.path).allowed === false || kind !== "file") {
      baseEntries.push({
        path: Uint8Array.from(entry.path),
        mode: entry.mode,
        oid: entry.oid,
        stage: 0,
        kind,
        ...(filtered ? { filtered: true } : {}),
      });
      continue;
    }
    const blob = readVerifiedBlobInfo(exec, capture.root, capture.objectFormat, entry.oid, maxFileBytes);
    baseEntries.push({
      path: Uint8Array.from(entry.path),
      mode: entry.mode,
      oid: entry.oid,
      stage: 0,
      kind,
      ...(blob.ok ? { size: blob.size, isBinary: blob.isBinary } : blob.oversized ? { size: maxFileBytes + 1 } : {}),
    });
  }

  const tipEntries: LocalEntryInput[] = [];
  for (const file of capture.files) {
    if (file.status === "deleted" || file.status === "sparse-omitted") continue;
    const key = toPathKey(file.path);
    if (file.status === "excluded") {
      const reason = file.exclusionReason;
      if (reason === "filtered") {
        tipEntries.push({
          path: Uint8Array.from(file.path),
          mode: file.mode ?? "100644",
          oid: file.indexOid ?? zeroOid,
          stage: 0,
          kind: "file",
          filtered: true,
        });
      } else if (reason === "protected") {
        tipEntries.push({
          path: Uint8Array.from(file.path),
          mode: file.mode ?? "100644",
          oid: file.indexOid ?? zeroOid,
          stage: 0,
          kind: "file",
          size: file.size ?? 0,
        });
      } else if (reason === "oversized") {
        tipEntries.push({
          path: Uint8Array.from(file.path),
          mode: file.mode ?? "100644",
          oid: file.indexOid ?? zeroOid,
          stage: 0,
          kind: "file",
          size: Math.max(file.size ?? 0, maxFileBytes + 1),
        });
      } else if (reason === "gitlink") {
        tipEntries.push({
          path: Uint8Array.from(file.path),
          mode: "160000",
          oid: file.indexOid ?? zeroOid,
          stage: 0,
          kind: "gitlink",
        });
      } else {
        tipEntries.push({
          path: Uint8Array.from(file.path),
          mode: file.mode ?? "120000",
          oid: file.indexOid ?? zeroOid,
          stage: 0,
          kind: "symlink",
          ...(file.linkTarget ? { linkTarget: Uint8Array.from(file.linkTarget) } : {}),
        });
      }
      continue;
    }

    // Present entry.
    if (file.kind === "gitlink") {
      tipEntries.push({
        path: Uint8Array.from(file.path),
        mode: "160000",
        oid: file.indexOid ?? zeroOid,
        stage: 0,
        kind: "gitlink",
      });
      continue;
    }
    if (file.kind === "symlink") {
      tipEntries.push({
        path: Uint8Array.from(file.path),
        mode: file.mode ?? "120000",
        oid: file.indexOid ?? zeroOid,
        stage: 0,
        kind: "symlink",
        ...(file.linkTarget ? { linkTarget: Uint8Array.from(file.linkTarget) } : {}),
      });
      continue;
    }
    if (file.kind === "conflict") {
      // Unmerged conflict entries belong to conflict diffs, not stage-0 unstaged diffs.
      continue;
    }
    if (classifyPath(file.path).allowed === false) {
      tipEntries.push({
        path: Uint8Array.from(file.path),
        mode: file.mode ?? "100644",
        oid: file.indexOid ?? zeroOid,
        stage: 0,
        kind: "file",
        size: file.size ?? 0,
      });
      continue;
    }
    // Safe descriptor-anchored read to compute Git blob OID & binary status,
    // verifying exact fingerprint stability against the L4a StableCapture.
    let readBytes: Buffer;
    try {
      const read = defaultReadFileBytes(capture.root, file.path, maxFileBytes);
      if (file.fingerprint !== undefined && read.fingerprint !== file.fingerprint) {
        return { stable: false, reason: "working-tree file bytes changed after L4a capture" };
      }
      readBytes = read.bytes;
    } catch {
      return { stable: false, reason: "working-tree file could not be safely re-verified after L4a capture" };
    }
    const wtBlobOid = gitBlobHash(capture.objectFormat, readBytes);
    const matchingBase = baseEntries.find((b) => toPathKey(Buffer.from(b.path)) === key);
    const effectiveMode = file.mode ?? matchingBase?.mode ?? "100644";
    tipEntries.push({
      path: Uint8Array.from(file.path),
      mode: effectiveMode,
      oid: wtBlobOid,
      stage: 0,
      kind: "file",
      size: readBytes.byteLength,
      isBinary: readBytes.includes(0),
    });
  }

  return {
    stable: true,
    base: indexEndpoint,
    tip: worktreeEndpoint,
    baseEntries,
    tipEntries,
  };
}

/**
 * Construct data-pure `VerifiedCaptureEvidenceDto` strictly from a verified L4a
 * `StableCapture` (plan/09 E-ASM3 / Carbon R3-01). Returns `undefined` for an
 * `UnstableCapture` or any absent/excluded/non-file path so a local analysis
 * can never reach `complete` without matching stable capture evidence.
 */
export function buildVerifiedCaptureEvidence(params: {
  readonly scope: { readonly tenant: string; readonly clone: string };
  readonly worktreeId: string;
  readonly snapshotId: string;
  readonly path: string;
  readonly capture: CaptureResult;
  readonly snapshotKind?: "index" | "working-tree";
  readonly indexBlobFingerprint?: string;
}): VerifiedCaptureEvidenceDto | undefined {
  if (!params.capture.stable) return undefined;
  const targetBytes = Buffer.from(params.path, "utf8");
  if (classifyPath(targetBytes).allowed === false) return undefined;
  const matched = params.capture.files.find((file) => file.path.equals(targetBytes));
  if (!matched || matched.status !== "present") return undefined;
  if (classifyPath(matched.path).allowed === false) return undefined;
  if (matched.kind !== "file" && matched.kind !== "conflict") return undefined;
  const fingerprint =
    params.snapshotKind === "index"
      ? params.indexBlobFingerprint
      : matched.fingerprint;
  if (typeof fingerprint !== "string" || !/^[0-9a-f]{64}$/.test(fingerprint)) {
    return undefined;
  }
  return {
    stable: true,
    scope: { tenant: params.scope.tenant, clone: params.scope.clone },
    worktreeId: params.worktreeId,
    snapshotId: params.snapshotId,
    path: params.path,
    contentFingerprint: fingerprint,
    indexDigest: params.capture.indexDigest,
    attrFingerprint: params.capture.attrFingerprint,
    attempts: params.capture.attempts,
    ...(params.snapshotKind !== undefined ? { snapshotKind: params.snapshotKind } : {}),
  };
}

function sanitizeCapturePathBytes(path: Buffer): Buffer {
  return classifyPath(path).allowed === false ? Buffer.from(protectedPathRef(path)) : Buffer.from(path);
}

function sanitizeCaptureForResult(capture: CaptureResult): CaptureResult {
  if (!capture.stable) return capture;
  return {
    ...capture,
    entries: capture.entries.map((entry) => ({
      ...entry,
      path: sanitizeCapturePathBytes(entry.path),
    })),
    files: capture.files.map((file) => ({
      ...file,
      path: sanitizeCapturePathBytes(file.path),
      ...(file.linkTarget !== undefined
        ? { linkTarget: sanitizeCapturePathBytes(file.linkTarget) }
        : {}),
    })),
  };
}

/**
 * Run L4a `captureWorktree` for a local (`treeOid === null`) `code-analysis`
 * request and derive `VerifiedCaptureEvidenceDto` ONLY when the capture is
 * stable and the target file was safely verified (Carbon R3-01).
 */
export function captureForLocalCodeAnalysis(
  ctx: Pick<LocalRuntimeContext, "declaration" | "git">,
  input: AnalyzeCodeInput,
  captureOptions: LocalCaptureAnalysisOptions,
):
  | { readonly ok: true; readonly capture: CaptureResult; readonly verifiedCapture: VerifiedCaptureEvidenceDto | undefined }
  | { readonly ok: false; readonly reason: string } {
  if (!isPlainObject(captureOptions)) {
    return { ok: false, reason: "code-analysis capture options must be a plain object" };
  }
  const snapshotKind = captureOptions.snapshotKind ?? (input.snapshotKind === "index" ? "index" : "working-tree");
  if (snapshotKind !== "index" && snapshotKind !== "working-tree") {
    return { ok: false, reason: 'code-analysis capture.snapshotKind must be "index" or "working-tree"' };
  }
  const resolved = resolveAuthorizedWorktreePath(captureOptions.cwd, ctx.declaration.authorizedRoots);
  if (!resolved.ok) return resolved;

  const observedPaths = [
    resolved.rootReal,
    ...(resolved.gitDir ? [resolved.gitDir] : []),
    ...(resolved.commonDir ? [resolved.commonDir] : []),
  ];
  const execCheck = composeFactoryGitExecutor(ctx.git, {
    authorizedRoots: ctx.declaration.authorizedRoots,
    observedPaths,
  });
  if (!execCheck.ok) return execCheck;

  let capture: CaptureResult;
  try {
    capture = captureWorktree(execCheck.executor, resolved.rootReal, {
      authorizedRoots: [...ctx.declaration.authorizedRoots],
      ...(captureOptions.maxAttempts !== undefined ? { maxAttempts: captureOptions.maxAttempts } : {}),
      ...(captureOptions.maxFileBytes !== undefined ? { maxFileBytes: captureOptions.maxFileBytes } : {}),
      ...(captureOptions.hooks !== undefined ? { hooks: captureOptions.hooks } : {}),
    });
  } catch (error) {
    return { ok: false, reason: `local capture failed or refused: ${safeErrorDetail(error)}` };
  }

  if (!capture.stable || input.treeOid !== null || typeof input.snapshotId !== "string" || input.snapshotId.length === 0) {
    return { ok: true, capture: sanitizeCaptureForResult(capture), verifiedCapture: undefined };
  }

  let indexBlobFingerprint: string | undefined;
  if (snapshotKind === "index") {
    const targetBytes = Buffer.from(input.path, "utf8");
    if (classifyPath(targetBytes).allowed !== false) {
      const matched = capture.files.find((file) => file.path.equals(targetBytes));
      if (matched?.status === "present" && matched.blobVerified === true && matched.indexOid) {
        const maxBytes = captureOptions.maxFileBytes ?? LOCAL_MAX_FILE_BYTES;
        const blob = readVerifiedBlobInfo(execCheck.executor, capture.root, capture.objectFormat, matched.indexOid, maxBytes);
        if (blob.ok && blob.sha256 !== null) {
          indexBlobFingerprint = blob.sha256;
        }
      }
    }
  }

  const verifiedCapture = buildVerifiedCaptureEvidence({
    scope: { tenant: ctx.declaration.tenant, clone: ctx.declaration.cloneId },
    worktreeId: ctx.declaration.worktreeId,
    snapshotId: input.snapshotId,
    path: input.path,
    capture,
    snapshotKind,
    indexBlobFingerprint,
  });
  return { ok: true, capture: sanitizeCaptureForResult(capture), verifiedCapture };
}

function buildAllVerifiedCaptures(params: {
  readonly scope: { readonly tenant: string; readonly clone: string };
  readonly worktreeId: string;
  readonly snapshotId: string;
  readonly capture: CaptureResult;
  readonly snapshotKind: "index" | "working-tree";
  readonly indexBlobFingerprints?: ReadonlyMap<string, string>;
}): Readonly<Record<string, VerifiedCaptureEvidenceDto>> {
  if (!params.capture.stable) return {};
  const out: Record<string, VerifiedCaptureEvidenceDto> = {};
  for (const file of params.capture.files) {
    if (file.status !== "present") continue;
    if (file.kind !== "file" && file.kind !== "conflict") continue;
    if (classifyPath(file.path).allowed === false) continue;
    const pathStr = file.path.toString("utf8");
    if (!Buffer.from(pathStr, "utf8").equals(file.path)) continue;
    const ev = buildVerifiedCaptureEvidence({
      scope: params.scope,
      worktreeId: params.worktreeId,
      snapshotId: params.snapshotId,
      path: pathStr,
      capture: params.capture,
      snapshotKind: params.snapshotKind,
      indexBlobFingerprint: params.indexBlobFingerprints?.get(toPathKey(file.path)),
    });
    if (ev !== undefined) out[pathStr] = ev;
  }
  return out;
}

function validateOptionalPlaintextPayload(
  capability: "index-snapshot" | "working-tree" | "diffs",
  value: unknown,
):
  | { readonly ok: true; readonly payload: Uint8Array | null | undefined }
  | { readonly ok: false; readonly reason: string } {
  if (value === undefined) return { ok: true, payload: undefined };
  if (value === null) return { ok: true, payload: null };
  if (value instanceof Uint8Array) return { ok: true, payload: value };
  return {
    ok: false,
    reason: `${capability} request.plaintextPayload, when present, must be a Uint8Array or null`,
  };
}

function capturePrivateSinkReceipt(sink: FactSinkPort): {
  readonly wrappedSink: FactSinkPort;
  readonly getLastReceipt: () => FactSinkReceipt | undefined;
} {
  let lastReceipt: FactSinkReceipt | undefined;
  return {
    wrappedSink: {
      async deliver(batch: FactBatchDto, fencingToken: ScopeFencingTokenDto): Promise<FactSinkReceipt> {
        const receipt = await sink.deliver(batch, fencingToken);
        lastReceipt = receipt;
        return receipt;
      },
    },
    getLastReceipt: () => lastReceipt,
  };
}

function extractSealedDiff(batch: FactBatchDto, fallback: LocalDiffDto): LocalDiffDto {
  for (const fact of batch.facts) {
    if (
      typeof fact === "object" &&
      fact !== null &&
      "kind" in fact &&
      (fact.kind === "staged" || fact.kind === "unstaged" || fact.kind === "conflict")
    ) {
      return fact as LocalDiffDto;
    }
  }
  return fallback;
}

function defaultMetadataPayload(summary: Record<string, unknown>): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(summary));
}

function summarizePrivateBatch(batch: FactBatchDto, receipt: FactSinkReceipt): DeliveredBatchSummary {
  const encoded = encodeFactBatch(batch);
  return {
    batchId: batch.batchId,
    batchDigest: batch.batchDigest,
    byteLength: encoded.byteLength,
    factCount: batch.facts.length,
    receipt,
  };
}

/**
 * Execute `index-snapshot` (L4a + L4b): side-effect-free capture of the index
 * through the validated host-isolated `SafeGitExecutor`, derivation of the
 * staged/conflict `LocalDiffDto` with pre-persistence secret screening,
 * latest-only encrypted snapshot staging via `stageLocalSnapshot`, and fenced
 * private batch delivery through `FactSinkPort`.
 */
export async function runIndexSnapshotCapability(
  status: CapabilityStatus,
  ctx: LocalRuntimeContext,
  request: unknown,
): Promise<IndexSnapshotCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "index-snapshot" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const generationId = request.generationId;
  if (!isStrictGenerationId(generationId)) {
    return unavailable(status, 'index-snapshot request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
  }
  const expectedIncarnation = request.expectedIncarnation;
  if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
    return unavailable(status, "index-snapshot request.expectedIncarnation, when present, must be a non-empty string");
  }
  const tokenCheck = validateWorktreeFencingToken(request.fencingToken, ctx.declaration, clockCheck.nowMs, expectedIncarnation);
  if (!tokenCheck.ok) return unavailable(status, tokenCheck.reason);

  const diffKind = (request.diffKind ?? "staged") as unknown;
  if (diffKind !== "staged" && diffKind !== "conflict") {
    return unavailable(status, 'index-snapshot request.diffKind must be "staged" or "conflict"');
  }

  const genDigits = generationId.slice("gen:".length);
  const batchId = request.batchId !== undefined ? request.batchId : `batch:index-snapshot:${diffKind}:${genDigits}:000001`;
  if (!isStrictBatchId(batchId, "batch:")) {
    return unavailable(status, 'index-snapshot request.batchId must be a strict opaque batch id starting with "batch:"');
  }
  const payloadCheck = validateOptionalPlaintextPayload("index-snapshot", request.plaintextPayload);
  if (!payloadCheck.ok) return unavailable(status, payloadCheck.reason);

  const contentCheck = await resolveContentPorts(ctx.content, request);
  if (!contentCheck.ok) return unavailable(status, contentCheck.reason);

  const resolved = resolveAuthorizedWorktreePath(request.cwd, ctx.declaration.authorizedRoots);
  if (!resolved.ok) return unavailable(status, resolved.reason);

  const observedPaths = [
    resolved.rootReal,
    ...(resolved.gitDir ? [resolved.gitDir] : []),
    ...(resolved.commonDir ? [resolved.commonDir] : []),
  ];
  const execCheck = composeFactoryGitExecutor(ctx.git, {
    authorizedRoots: ctx.declaration.authorizedRoots,
    observedPaths,
  });
  if (!execCheck.ok) return unavailable(status, execCheck.reason);

  const maxFileBytes =
    typeof request.maxFileBytes === "number" && Number.isSafeInteger(request.maxFileBytes) && request.maxFileBytes > 0
      ? request.maxFileBytes
      : LOCAL_MAX_FILE_BYTES;

  let capture: CaptureResult;
  try {
    capture = captureWorktree(execCheck.executor, resolved.rootReal, {
      authorizedRoots: [...ctx.declaration.authorizedRoots],
      ...(request.maxAttempts !== undefined ? { maxAttempts: request.maxAttempts as number } : {}),
      maxFileBytes,
      ...(request.hooks !== undefined ? { hooks: request.hooks as CaptureHooks } : {}),
    });
  } catch (error) {
    return unavailable(status, `index-snapshot L4a capture failed or refused: ${safeErrorDetail(error)}`);
  }

  const privateScope: LiveScope = {
    tenant: ctx.declaration.tenant,
    clone: ctx.declaration.cloneId,
    worktree: ctx.declaration.worktreeId,
  };

  let derived: LocalDiffDto;
  let indexBlobFingerprints: Map<string, string> | undefined;
  try {
    if (!capture.stable) {
      derived = deriveLocalDiff({
        scope: privateScope,
        worktreeId: ctx.declaration.worktreeId,
        kind: diffKind,
        base: { label: diffKind === "conflict" ? "index" : "HEAD", oid: "0".repeat(40) },
        tip: { label: "index", oid: "0".repeat(40) },
        baseEntries: [],
        tipEntries: [],
        stable: false,
        unstableReason: capture.reason,
        maxFileBytes,
      });
    } else {
      const built = buildIndexLocalEntries(capture, execCheck.executor, diffKind, maxFileBytes);
      if (resolved.configPaths.length > 0 && !execCheck.executor.probeNoConfigIncludes(resolved.configPaths)) {
        capture = {
          stable: false,
          attempts: capture.attempts,
          root: capture.root,
          reason: "unstable: repository configuration changed during index derivation",
        };
        derived = deriveLocalDiff({
          scope: privateScope,
          worktreeId: ctx.declaration.worktreeId,
          kind: diffKind,
          base: { label: diffKind === "conflict" ? "index" : "HEAD", oid: "0".repeat(40) },
          tip: { label: "index", oid: "0".repeat(40) },
          baseEntries: [],
          tipEntries: [],
          stable: false,
          unstableReason: capture.reason,
          maxFileBytes,
        });
      } else {
        indexBlobFingerprints = built.indexBlobFingerprints;
        derived = deriveLocalDiff({
          scope: privateScope,
          worktreeId: ctx.declaration.worktreeId,
          kind: diffKind,
          base: built.base,
          tip: built.tip,
          baseEntries: built.baseEntries,
          tipEntries: built.tipEntries,
          ...(built.conflictStages !== undefined ? { conflictStages: built.conflictStages } : {}),
          ...(request.hunkDrafts !== undefined ? { hunkDrafts: request.hunkDrafts as readonly HunkDraftInput[] } : {}),
          maxFileBytes,
        });
      }
    }
  } catch (error) {
    return unavailable(status, `index-snapshot diff derivation failed: ${safeErrorDetail(error)}`);
  }

  const plaintextPayload: Uint8Array | null =
    payloadCheck.payload !== undefined
      ? payloadCheck.payload
      : capture.stable
        ? defaultMetadataPayload({
            kind: "index",
            diffKind,
            headOid: capture.headOid,
            indexDigest: capture.indexDigest,
            attrFingerprint: capture.attrFingerprint,
            fileCount: derived.files.length,
          })
        : null;

  const { wrappedSink, getLastReceipt } = capturePrivateSinkReceipt(sinkCheck.sink);
  let staged;
  try {
    staged = await stageLocalSnapshot({
      scope: privateScope,
      worktreeId: ctx.declaration.worktreeId,
      kind: "index",
      capturedAt: clockCheck.nowMs,
      diff: derived,
      plaintextPayload,
      protection: contentCheck.protection,
      store: contentCheck.store,
      sink: wrappedSink,
      fencingToken: tokenCheck.token,
      batchId,
      generationId,
    });
  } catch (error) {
    return unavailable(status, `index-snapshot staging refused: ${safeErrorDetail(error)}`);
  }

  const receipt = getLastReceipt();
  if (!receipt) {
    return unavailable(status, "index-snapshot fact sink returned no receipt");
  }
  const sealedDiff = extractSealedDiff(staged.batch, derived);
  const verifiedCaptures = buildAllVerifiedCaptures({
    scope: { tenant: ctx.declaration.tenant, clone: ctx.declaration.cloneId },
    worktreeId: ctx.declaration.worktreeId,
    snapshotId: staged.snapshot.snapshotId,
    capture,
    snapshotKind: "index",
    indexBlobFingerprints,
  });

  return {
    ...status,
    capability: "index-snapshot",
    state: "available",
    delivered: true,
    generationId,
    capture: sanitizeCaptureForResult(capture),
    diff: sealedDiff,
    snapshot: staged.snapshot,
    coverage: staged.coverage,
    diagnostics: staged.diagnostics,
    batch: summarizePrivateBatch(staged.batch, receipt),
    verifiedCaptures,
  };
}

/**
 * Execute `working-tree` (L4a + L4b): side-effect-free capture of the working
 * tree through the validated host-isolated `SafeGitExecutor`, derivation of
 * the unstaged `LocalDiffDto` with pre-persistence secret screening,
 * latest-only encrypted snapshot staging, and fenced private batch delivery.
 */
export async function runWorkingTreeCapability(
  status: CapabilityStatus,
  ctx: LocalRuntimeContext,
  request: unknown,
): Promise<WorkingTreeCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "working-tree" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const generationId = request.generationId;
  if (!isStrictGenerationId(generationId)) {
    return unavailable(status, 'working-tree request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
  }
  const expectedIncarnation = request.expectedIncarnation;
  if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
    return unavailable(status, "working-tree request.expectedIncarnation, when present, must be a non-empty string");
  }
  const tokenCheck = validateWorktreeFencingToken(request.fencingToken, ctx.declaration, clockCheck.nowMs, expectedIncarnation);
  if (!tokenCheck.ok) return unavailable(status, tokenCheck.reason);

  const genDigits = generationId.slice("gen:".length);
  const batchId = request.batchId !== undefined ? request.batchId : `batch:working-tree:${genDigits}:000001`;
  if (!isStrictBatchId(batchId, "batch:")) {
    return unavailable(status, 'working-tree request.batchId must be a strict opaque batch id starting with "batch:"');
  }
  const payloadCheck = validateOptionalPlaintextPayload("working-tree", request.plaintextPayload);
  if (!payloadCheck.ok) return unavailable(status, payloadCheck.reason);

  const contentCheck = await resolveContentPorts(ctx.content, request);
  if (!contentCheck.ok) return unavailable(status, contentCheck.reason);

  const resolved = resolveAuthorizedWorktreePath(request.cwd, ctx.declaration.authorizedRoots);
  if (!resolved.ok) return unavailable(status, resolved.reason);

  const observedPaths = [
    resolved.rootReal,
    ...(resolved.gitDir ? [resolved.gitDir] : []),
    ...(resolved.commonDir ? [resolved.commonDir] : []),
  ];
  const execCheck = composeFactoryGitExecutor(ctx.git, {
    authorizedRoots: ctx.declaration.authorizedRoots,
    observedPaths,
  });
  if (!execCheck.ok) return unavailable(status, execCheck.reason);

  const maxFileBytes =
    typeof request.maxFileBytes === "number" && Number.isSafeInteger(request.maxFileBytes) && request.maxFileBytes > 0
      ? request.maxFileBytes
      : LOCAL_MAX_FILE_BYTES;

  let capture: CaptureResult;
  try {
    capture = captureWorktree(execCheck.executor, resolved.rootReal, {
      authorizedRoots: [...ctx.declaration.authorizedRoots],
      ...(request.maxAttempts !== undefined ? { maxAttempts: request.maxAttempts as number } : {}),
      maxFileBytes,
      ...(request.hooks !== undefined ? { hooks: request.hooks as CaptureHooks } : {}),
    });
  } catch (error) {
    return unavailable(status, `working-tree L4a capture failed or refused: ${safeErrorDetail(error)}`);
  }

  const privateScope: LiveScope = {
    tenant: ctx.declaration.tenant,
    clone: ctx.declaration.cloneId,
    worktree: ctx.declaration.worktreeId,
  };

  let derived: LocalDiffDto;
  try {
    if (!capture.stable) {
      derived = deriveLocalDiff({
        scope: privateScope,
        worktreeId: ctx.declaration.worktreeId,
        kind: "unstaged",
        base: { label: "index", oid: "0".repeat(40) },
        tip: { label: "worktree", oid: null },
        baseEntries: [],
        tipEntries: [],
        stable: false,
        unstableReason: capture.reason,
        maxFileBytes,
      });
    } else {
      const built = buildWorkingTreeLocalEntries(capture, execCheck.executor, maxFileBytes);
      const configOk =
        resolved.configPaths.length === 0 || execCheck.executor.probeNoConfigIncludes(resolved.configPaths);
      if (!built.stable || !configOk) {
        const unstableReason = !built.stable
          ? built.reason
          : "unstable: repository configuration changed during working-tree derivation";
        capture = {
          stable: false,
          attempts: capture.attempts,
          root: capture.root,
          reason: unstableReason,
        };
        derived = deriveLocalDiff({
          scope: privateScope,
          worktreeId: ctx.declaration.worktreeId,
          kind: "unstaged",
          base: { label: "index", oid: "0".repeat(40) },
          tip: { label: "worktree", oid: null },
          baseEntries: [],
          tipEntries: [],
          stable: false,
          unstableReason,
          maxFileBytes,
        });
      } else {
        derived = deriveLocalDiff({
          scope: privateScope,
          worktreeId: ctx.declaration.worktreeId,
          kind: "unstaged",
          base: built.base,
          tip: built.tip,
          baseEntries: built.baseEntries,
          tipEntries: built.tipEntries,
          ...(request.hunkDrafts !== undefined ? { hunkDrafts: request.hunkDrafts as readonly HunkDraftInput[] } : {}),
          maxFileBytes,
        });
      }
    }
  } catch (error) {
    return unavailable(status, `working-tree diff derivation failed: ${safeErrorDetail(error)}`);
  }

  const plaintextPayload: Uint8Array | null =
    payloadCheck.payload !== undefined
      ? payloadCheck.payload
      : capture.stable
        ? defaultMetadataPayload({
            kind: "working-tree",
            diffKind: "unstaged",
            headOid: capture.headOid,
            indexDigest: capture.indexDigest,
            attrFingerprint: capture.attrFingerprint,
            fileCount: derived.files.length,
          })
        : null;

  const { wrappedSink, getLastReceipt } = capturePrivateSinkReceipt(sinkCheck.sink);
  let staged;
  try {
    staged = await stageLocalSnapshot({
      scope: privateScope,
      worktreeId: ctx.declaration.worktreeId,
      kind: "working-tree",
      capturedAt: clockCheck.nowMs,
      diff: derived,
      plaintextPayload,
      protection: contentCheck.protection,
      store: contentCheck.store,
      sink: wrappedSink,
      fencingToken: tokenCheck.token,
      batchId,
      generationId,
    });
  } catch (error) {
    return unavailable(status, `working-tree staging refused: ${safeErrorDetail(error)}`);
  }

  const receipt = getLastReceipt();
  if (!receipt) {
    return unavailable(status, "working-tree fact sink returned no receipt");
  }
  const sealedDiff = extractSealedDiff(staged.batch, derived);
  const verifiedCaptures = buildAllVerifiedCaptures({
    scope: { tenant: ctx.declaration.tenant, clone: ctx.declaration.cloneId },
    worktreeId: ctx.declaration.worktreeId,
    snapshotId: staged.snapshot.snapshotId,
    capture,
    snapshotKind: "working-tree",
  });

  return {
    ...status,
    capability: "working-tree",
    state: "available",
    delivered: true,
    generationId,
    capture: sanitizeCaptureForResult(capture),
    diff: sealedDiff,
    snapshot: staged.snapshot,
    coverage: staged.coverage,
    diagnostics: staged.diagnostics,
    batch: summarizePrivateBatch(staged.batch, receipt),
    verifiedCaptures,
  };
}

/**
 * Execute `diffs` (L4b): derive staged, unstaged or conflict-stage local diffs
 * with deterministic pre-persistence secret screening, seal allowed hunks and
 * latest snapshot payload through host protection, replace latest atomically,
 * and deliver one fenced private batch to `FactSinkPort`.
 */
export async function runDiffsCapability(
  status: CapabilityStatus,
  ctx: LocalRuntimeContext,
  request: unknown,
): Promise<DiffsCapabilityResult | UnavailableCapabilityResult> {
  if (!isPlainObject(request)) {
    return unavailable(status, 'capability "diffs" requires a plain-object request (never reported available without executing its engine)');
  }
  const sinkCheck = validateFactSinkPort(ctx.factSink);
  if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
  const clockCheck = readClockMs(ctx.clock);
  if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

  const generationId = request.generationId;
  if (!isStrictGenerationId(generationId)) {
    return unavailable(status, 'diffs request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
  }
  const expectedIncarnation = request.expectedIncarnation;
  if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
    return unavailable(status, "diffs request.expectedIncarnation, when present, must be a non-empty string");
  }
  const tokenCheck = validateWorktreeFencingToken(request.fencingToken, ctx.declaration, clockCheck.nowMs, expectedIncarnation);
  if (!tokenCheck.ok) return unavailable(status, tokenCheck.reason);

  const kind = request.kind as unknown;
  if (kind !== "staged" && kind !== "unstaged" && kind !== "conflict") {
    return unavailable(status, 'diffs request.kind must be "staged", "unstaged" or "conflict"');
  }
  const genDigits = generationId.slice("gen:".length);
  const batchId = request.batchId !== undefined ? request.batchId : `batch:diffs:${kind}:${genDigits}:000001`;
  if (!isStrictBatchId(batchId, "batch:")) {
    return unavailable(status, 'diffs request.batchId must be a strict opaque batch id starting with "batch:"');
  }
  const payloadCheck = validateOptionalPlaintextPayload("diffs", request.plaintextPayload);
  if (!payloadCheck.ok) return unavailable(status, payloadCheck.reason);

  const contentCheck = await resolveContentPorts(ctx.content, request);
  if (!contentCheck.ok) return unavailable(status, contentCheck.reason);

  const privateScope: LiveScope = {
    tenant: ctx.declaration.tenant,
    clone: ctx.declaration.cloneId,
    worktree: ctx.declaration.worktreeId,
  };

  let derived: LocalDiffDto;
  try {
    derived = deriveLocalDiff({
      scope: privateScope,
      worktreeId: ctx.declaration.worktreeId,
      kind,
      base: request.base as LocalDiffEndpointDto,
      tip: request.tip as LocalDiffEndpointDto,
      baseEntries: request.baseEntries as readonly LocalEntryInput[],
      tipEntries: request.tipEntries as readonly LocalEntryInput[],
      ...(request.conflictStages !== undefined ? { conflictStages: request.conflictStages as readonly ConflictStageInput[] } : {}),
      ...(request.hunkDrafts !== undefined ? { hunkDrafts: request.hunkDrafts as readonly HunkDraftInput[] } : {}),
      ...(request.stable !== undefined ? { stable: request.stable as boolean } : {}),
      ...(request.unstableReason !== undefined ? { unstableReason: request.unstableReason as string } : {}),
      ...(request.maxFileBytes !== undefined ? { maxFileBytes: request.maxFileBytes as number } : {}),
    });
  } catch (error) {
    return unavailable(status, `diffs derivation refused: ${safeErrorDetail(error)}`);
  }

  const snapshotKind: "index" | "working-tree" = kind === "unstaged" ? "working-tree" : "index";
  const plaintextPayload: Uint8Array | null =
    payloadCheck.payload !== undefined
      ? payloadCheck.payload
      : request.stable !== false
        ? defaultMetadataPayload({
            kind: snapshotKind,
            diffKind: kind,
            base: derived.base,
            tip: derived.tip,
            fileCount: derived.files.length,
          })
        : null;

  const { wrappedSink, getLastReceipt } = capturePrivateSinkReceipt(sinkCheck.sink);
  let staged;
  try {
    staged = await stageLocalSnapshot({
      scope: privateScope,
      worktreeId: ctx.declaration.worktreeId,
      kind: snapshotKind,
      capturedAt: clockCheck.nowMs,
      diff: derived,
      plaintextPayload,
      protection: contentCheck.protection,
      store: contentCheck.store,
      sink: wrappedSink,
      fencingToken: tokenCheck.token,
      batchId,
      generationId,
    });
  } catch (error) {
    return unavailable(status, `diffs staging refused: ${safeErrorDetail(error)}`);
  }

  const receipt = getLastReceipt();
  if (!receipt) {
    return unavailable(status, "diffs fact sink returned no receipt");
  }
  const sealedDiff = extractSealedDiff(staged.batch, derived);
  return {
    ...status,
    capability: "diffs",
    state: "available",
    delivered: true,
    generationId,
    diff: sealedDiff,
    snapshot: staged.snapshot,
    coverage: staged.coverage,
    diagnostics: staged.diagnostics,
    batch: summarizePrivateBatch(staged.batch, receipt),
  };
}

// — Scheduling and publication (L6b + L3a-E2).

function chunkLocalFacts(
  facts: readonly LiveFactDto[],
  maxBatchBytes: number,
  buildOne: (chunk: readonly LiveFactDto[], seq: number) => ReturnType<typeof buildFactBatch>,
): ReturnType<typeof buildFactBatch>[] {
  if (facts.length === 0) return [];
  const softLimit = Math.max(1, maxBatchBytes - ENVELOPE_HEADROOM_BYTES);
  const built: ReturnType<typeof buildFactBatch>[] = [];
  let seq = 1;

  const emitChunk = (chunk: readonly LiveFactDto[]): void => {
    try {
      built.push(buildOne(chunk, seq));
      seq += 1;
    } catch (error) {
      if (error instanceof BatchCodecError && error.code === "batch-too-large" && chunk.length > 1) {
        const mid = Math.floor(chunk.length / 2);
        emitChunk(chunk.slice(0, mid));
        emitChunk(chunk.slice(mid));
        return;
      }
      throw error;
    }
  };

  let current: LiveFactDto[] = [];
  let currentEstimate = 0;
  for (const fact of facts) {
    const factBytes = canonicalEncodeValue(fact).byteLength + 2;
    if (current.length > 0 && currentEstimate + factBytes > softLimit) {
      emitChunk(current);
      current = [];
      currentEstimate = 0;
    }
    current.push(fact);
    currentEstimate += factBytes;
  }
  if (current.length > 0) emitChunk(current);
  return built;
}

async function deliverSchedulingFencedBatches(params: {
  readonly capability: "reconciliation" | "publication";
  readonly scope: LiveScope;
  readonly generationId: string;
  readonly fencingToken: ScopeFencingTokenDto;
  readonly expectedIncarnation?: string;
  readonly declarationRevision: number;
  readonly maxBatchBytes: number;
  readonly facts: readonly LiveFactDto[];
  readonly clock: { now(): number };
  readonly writer: WriterAuthority;
  readonly factSink: FactSinkPort;
  readonly validateWriterOnToken: boolean;
}): Promise<{ ok: true; batches: DeliveredBatchSummary[] } | { ok: false; reason: string }> {
  const genDigits = params.generationId.slice("gen:".length);
  let builtBatches: ReturnType<typeof buildFactBatch>[];
  try {
    builtBatches = chunkLocalFacts(params.facts, params.maxBatchBytes, (chunk, seq) =>
      buildFactBatch(
        {
          scope: params.scope,
          producerName: PRODUCER_NAME,
          contractVersion: CONTRACT_VERSION,
          policyVersion: POLICY_VERSION,
          generationId: params.generationId,
          batchId: `batch:${params.capability}:${genDigits}:${String(seq).padStart(6, "0")}`,
          facts: chunk,
        },
        { maxBytes: params.maxBatchBytes },
      ),
    );
  } catch (error) {
    return { ok: false, reason: `failed to build canonical ${params.capability} fact batch: ${safeErrorDetail(error)}` };
  }

  const summaries: DeliveredBatchSummary[] = [];
  for (const item of builtBatches) {
    const tick = readClockMs(params.clock);
    if (!tick.ok) return tick;
    const tokenChecked = validateScopeFencingToken(
      params.fencingToken,
      params.scope,
      params.expectedIncarnation,
      tick.nowMs,
    );
    if (!tokenChecked.ok) {
      return { ok: false, reason: `${params.capability} fencing token rejected: ${tokenChecked.errors.join("; ")}` };
    }
    if (params.fencingToken.declarationRevision !== params.declarationRevision) {
      return { ok: false, reason: `${params.capability} fencing token declarationRevision mismatch` };
    }
    if (params.validateWriterOnToken && !params.writer.validate(params.fencingToken)) {
      return { ok: false, reason: `${params.capability} stopped: writer fencing token revoked before sink delivery` };
    }
    let receipt: FactSinkReceipt;
    try {
      receipt = await params.factSink.deliver(item.batch, params.fencingToken);
    } catch (error) {
      return { ok: false, reason: `fact sink refused batch ${item.batch.batchId}: ${safeErrorDetail(error)}` };
    }
    if (!receipt || typeof receipt !== "object" || receipt.received !== true || receipt.batchId !== item.batch.batchId) {
      return { ok: false, reason: `fact sink returned invalid acknowledgement for batch ${item.batch.batchId}` };
    }
    summaries.push({
      batchId: item.batch.batchId,
      batchDigest: item.batch.batchDigest,
      byteLength: item.encoded.byteLength,
      factCount: item.batch.facts.length,
      receipt,
    });
  }
  return { ok: true, batches: summaries };
}

function buildCoverageFactsFromMap(map: CoverageMap, checkedAt: number): CoverageFactDto[] {
  const facts: CoverageFactDto[] = [];
  for (const [axis, report] of Object.entries(map.axes).sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!COVERAGE_AXIS_SET.has(axis)) continue;
    const state: CoverageFactState = COVERAGE_STATE_SET.has(report.state)
      ? (report.state as CoverageFactState)
      : toContractState(report.state);
    const reason =
      typeof report.reason === "string" && report.reason.trim().length > 0 && !containsSecretText(report.reason)
        ? report.reason
        : report.state === "current"
          ? `certified current generation ${report.lastVerifiedGenerationId ?? "active"}`
          : `coverage axis ${axis} state ${state}`;
    const lastSuccessAt =
      typeof report.lastValidatedAt === "number" && Number.isSafeInteger(report.lastValidatedAt) && report.lastValidatedAt > 0
        ? report.lastValidatedAt
        : null;
    facts.push({
      kind: "coverage",
      schemaVersion: FACT_SCHEMA_VERSION,
      axis: axis as CoverageFactAxis,
      state,
      reason,
      checkedAt,
      pendingCount: report.pendingCount,
      pendingFrontier: report.pendingFrontier ?? null,
      lastSuccessAt,
    });
  }
  return facts;
}

function validateCompletionCorrelationAgainstDeclaration(
  correlation: ProducerGenerationCorrelationDto,
  declaration: WorkspaceDeclarationDto,
): { readonly ok: true } | { readonly ok: false; readonly reason: string } {
  const corrScope = correlation.scope;
  if (corrScope.tenant !== declaration.tenant || corrScope.clone !== declaration.cloneId) {
    return {
      ok: false,
      reason: "publication completion.correlation.scope does not match workspace declaration tenant/clone",
    };
  }
  if (correlation.view === "private") {
    if (corrScope.worktree !== declaration.worktreeId) {
      return {
        ok: false,
        reason: "publication private completion.correlation.scope.worktree does not match workspace declaration worktreeId",
      };
    }
  } else if (corrScope.worktree !== undefined) {
    return {
      ok: false,
      reason: "publication committed completion.correlation.scope must omit worktree",
    };
  }
  const declRef = correlation.authorizingDeclaration;
  if (
    declRef.declarationId !== declaration.declarationId ||
    declRef.cloneId !== declaration.cloneId ||
    declRef.worktreeId !== declaration.worktreeId ||
    declRef.declarationRevision !== declaration.declarationRevision
  ) {
    return {
      ok: false,
      reason: "publication completion.correlation.authorizingDeclaration does not match workspace declaration",
    };
  }
  return { ok: true };
}

const ALLOWED_COMPLETION_INPUT_KEYS = new Set<string>([
  "completionState",
  "expectedBatchCount",
  "coverage",
  "exclusions",
  "errors",
  "remainingWork",
  "abortReason",
  "completedAt",
]);

/**
 * Create a factory-owned L6b scheduling and publication controller.
 * The Scheduler, WatchHub and Reconciler live for the factory's lifetime (or
 * until explicit `shutdown`) and share the host's injected Scheduler when one
 * is provided — never bound to an ephemeral client connection.
 */
export function createLocalSchedulingController(ctx: LocalRuntimeContext): LocalSchedulingController {
  const worktreeScope: LiveScope = {
    tenant: ctx.declaration.tenant,
    clone: ctx.declaration.cloneId,
    worktree: ctx.declaration.worktreeId,
  };
  const worktreeScopeId = JSON.stringify([worktreeScope.tenant, worktreeScope.clone, worktreeScope.worktree]);

  let sharedScheduler: Scheduler | undefined;
  let watchHub: WatchHub | undefined;
  let hubBootstrapPromise: Promise<void> | undefined;
  let reconciler: Reconciler | undefined;
  let activeToken: ScopeFencingTokenDto | undefined;
  let revokedOrDeniedFlag = false;
  let pubSequence = 0;

  let activeWorktreeOps = 0;
  const worktreeIdleWaiters = new Set<() => void>();
  let committedLeaseHeld = false;
  const committedLeaseWaiters = new Set<() => void>();
  let committedLeaseTail: Promise<void> = Promise.resolve();

  function waitForWorktreeOpsIdle(): Promise<void> {
    if (activeWorktreeOps === 0) return Promise.resolve();
    return new Promise<void>((resolve) => {
      worktreeIdleWaiters.add(resolve);
    });
  }

  function notifyWorktreeIdleIfZero(): void {
    if (activeWorktreeOps === 0) {
      for (const resolve of [...worktreeIdleWaiters]) {
        worktreeIdleWaiters.delete(resolve);
        resolve();
      }
    }
  }

  function waitForCommittedLeaseReleased(): Promise<void> {
    if (!committedLeaseHeld) return Promise.resolve();
    return new Promise<void>((resolve) => {
      committedLeaseWaiters.add(resolve);
    });
  }

  function notifyCommittedLeaseReleased(): void {
    if (!committedLeaseHeld) {
      for (const resolve of [...committedLeaseWaiters]) {
        committedLeaseWaiters.delete(resolve);
        resolve();
      }
    }
  }

  async function waitForScopeQuiescence(scheduler: Scheduler, scopeId: string): Promise<void> {
    for (;;) {
      await Promise.resolve();
      let pending = true;
      const quiescePromise = scheduler.quiesceScope(scopeId).then(() => {
        pending = false;
      });
      await Promise.resolve();
      if (!pending) return;
      await quiescePromise;
    }
  }

  function validateClockWithSchedule():
    | { readonly ok: true; readonly clock: { now(): number; schedule(ms: number, cb: () => void): () => void } }
    | { readonly ok: false; readonly reason: string } {
    const check = readClockMs(ctx.clock);
    if (!check.ok) return check;
    if (typeof ctx.clock?.schedule !== "function") {
      return { ok: false, reason: "missing host clock schedule port (ports.clock.schedule)" };
    }
    return {
      ok: true,
      clock: ctx.clock as { now(): number; schedule(ms: number, cb: () => void): () => void },
    };
  }

  function ensureScheduler(
    clock: { now(): number; schedule(ms: number, cb: () => void): () => void },
    scheduling: SchedulingPort,
  ): { ok: true; scheduler: Scheduler } | { ok: false; reason: string } {
    if (sharedScheduler !== undefined) return { ok: true, scheduler: sharedScheduler };
    if (scheduling.scheduler !== undefined) {
      if (!isSchedulerInstance(scheduling.scheduler)) {
        return { ok: false, reason: "invalid host scheduler port (ports.scheduling.scheduler)" };
      }
      sharedScheduler = scheduling.scheduler;
      return { ok: true, scheduler: sharedScheduler };
    }
    if (!isSchedulerDurabilityPort(scheduling.durability)) {
      return {
        ok: false,
        reason: "missing host scheduler or durability port (ports.scheduling.scheduler or ports.scheduling.durability)",
      };
    }
    const durability = scheduling.durability;
    const budgets = scheduling.schedulerBudgets ?? DEFAULT_FACTORY_SCHEDULER_BUDGETS;
    try {
      sharedScheduler = new Scheduler(
        {
          clock,
          sink: durability.sink ?? { deliver: async () => ({ ok: false, retryable: false }) },
          validateToken: (token) => {
            const tick = readClockMs(clock);
            if (!tick.ok) return false;
            const incarnation = isMarkerStore(scheduling.markerStore) ? scheduling.markerStore.incarnation() : undefined;
            if (!validateScopeFencingToken(token, undefined, incarnation, tick.nowMs).ok) return false;
            if (token.declarationRevision !== ctx.declaration.declarationRevision) return false;
            if (!scheduling.writer.validate(token)) return false;
            if (durability.validateToken && !durability.validateToken(token)) return false;
            return true;
          },
          sleep: durability.sleep,
          park: durability.park,
          readProgress: durability.readProgress,
          writeProgress: durability.writeProgress,
          backlogSize: durability.backlogSize,
        },
        budgets,
      );
      return { ok: true, scheduler: sharedScheduler };
    } catch (error) {
      return { ok: false, reason: `failed to compose bounded scheduler: ${safeErrorDetail(error)}` };
    }
  }

  function ensureWatchHub(
    clock: { now(): number; schedule(ms: number, cb: () => void): () => void },
    scheduler: Scheduler,
    scheduling: SchedulingPort,
  ): { ok: true; hub: WatchHub } | { ok: false; reason: string } {
    if (!isWatchPort(ctx.watch)) {
      return { ok: false, reason: "missing host watch port (ports.watch)" };
    }
    if (watchHub !== undefined && watchHub.state !== "stopped") {
      return { ok: true, hub: watchHub };
    }
    const watchBudgets = scheduling.watchBudgets ?? DEFAULT_FACTORY_WATCH_BUDGETS;
    try {
      watchHub = createWatchHub(ctx.watch, clock, {
        scheduler,
        debounceMs: watchBudgets.debounceMs,
        maxPendingPaths: watchBudgets.maxPendingPaths,
      });
      hubBootstrapPromise = undefined;
      return { ok: true, hub: watchHub };
    } catch (error) {
      return { ok: false, reason: `failed to compose watch hub: ${safeErrorDetail(error)}` };
    }
  }

  async function ensureWatchReady(hub: WatchHub, bootstrapWatch: boolean): Promise<{ ok: true } | { ok: false; reason: string }> {
    if (hub.isReady()) return { ok: true };
    if (!bootstrapWatch) {
      return { ok: false, reason: "watch not ready: initial scan refused before watcher readiness" };
    }
    if (hub.state === "starting") {
      if (hubBootstrapPromise === undefined) {
        hubBootstrapPromise = hub.bootstrap().catch((error: unknown) => {
          hubBootstrapPromise = undefined;
          throw error;
        });
      }
      try {
        await hubBootstrapPromise;
      } catch (error) {
        return { ok: false, reason: `host watch port refused to start: ${safeErrorDetail(error)}` };
      }
    }
    if (!hub.isReady()) {
      return { ok: false, reason: `watch not ready (state "${hub.state}")` };
    }
    return { ok: true };
  }

  function ensureReconciler(
    clock: { now(): number; schedule(ms: number, cb: () => void): () => void },
    scheduler: Scheduler,
    hub: WatchHub,
    scheduling: SchedulingPort,
  ): { ok: true; reconciler: Reconciler } | { ok: false; reason: string } {
    if (reconciler !== undefined && reconciler.lifecycle() !== "stopped") {
      return { ok: true, reconciler };
    }
    const baseWriter = scheduling.writer;
    const observingWriter: WriterAuthority = {
      async acquire(req) {
        const tok = await baseWriter.acquire(req);
        if (tok === undefined) {
          revokedOrDeniedFlag = true;
          activeToken = undefined;
        } else {
          activeToken = tok;
        }
        return tok;
      },
      async renew(tok) {
        const renewed = await baseWriter.renew(tok);
        if (renewed === undefined) {
          revokedOrDeniedFlag = true;
          activeToken = undefined;
        } else {
          activeToken = renewed;
        }
        return renewed;
      },
      validate(tok) {
        const ok = baseWriter.validate(tok);
        if (!ok && activeToken !== undefined && tok.tokenId === activeToken.tokenId) {
          revokedOrDeniedFlag = true;
        }
        return ok;
      },
      revoke(tok) {
        revokedOrDeniedFlag = true;
        if (activeToken?.tokenId === tok.tokenId) activeToken = undefined;
        baseWriter.revoke(tok);
      },
      async release(tok) {
        if (activeToken?.tokenId === tok.tokenId) activeToken = undefined;
        await baseWriter.release(tok);
      },
    };
    const budgets = scheduling.reconcileBudgets ?? DEFAULT_FACTORY_RECONCILE_BUDGETS;
    try {
      reconciler = new Reconciler({
        scope: worktreeScope,
        declarationRevision: ctx.declaration.declarationRevision,
        hub,
        scan: scheduling.scan,
        pollRefs: scheduling.pollRefs,
        clock,
        store: scheduling.markerStore,
        budgets,
        writer: observingWriter,
        scheduler,
      });
      return { ok: true, reconciler };
    } catch (error) {
      return { ok: false, reason: `failed to compose reconciler: ${safeErrorDetail(error)}` };
    }
  }

  return {
    async runReconciliation(
      status: CapabilityStatus,
      request: unknown,
    ): Promise<ReconciliationCapabilityResult | UnavailableCapabilityResult> {
      if (!isPlainObject(request)) {
        return unavailable(status, 'capability "reconciliation" requires a plain-object request (never reported available without executing its engine)');
      }
      const sinkCheck = validateFactSinkPort(ctx.factSink);
      if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
      const clockCheck = validateClockWithSchedule();
      if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

      const generationId = request.generationId;
      if (!isStrictGenerationId(generationId)) {
        return unavailable(status, 'reconciliation request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
      }
      const action = (request.action ?? "converge") as unknown;
      if (
        action !== "bootstrap" &&
        action !== "round" &&
        action !== "converge" &&
        action !== "restart" &&
        action !== "cancel" &&
        action !== "shutdown"
      ) {
        return unavailable(status, 'reconciliation request.action must be "bootstrap", "round", "converge", "restart", "cancel" or "shutdown"');
      }
      const maxBatchBytes = (request.maxBatchBytes ?? MAX_FACT_BATCH_BYTES) as unknown;
      if (
        typeof maxBatchBytes !== "number" ||
        !Number.isSafeInteger(maxBatchBytes) ||
        maxBatchBytes <= 0 ||
        maxBatchBytes > MAX_FACT_BATCH_BYTES
      ) {
        return unavailable(status, `reconciliation request.maxBatchBytes must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}`);
      }

      const scheduling = ctx.scheduling;
      if (!scheduling || typeof scheduling !== "object") {
        return unavailable(status, "missing host scheduling port (ports.scheduling)");
      }
      if (!isWriterAuthority(scheduling.writer)) {
        return unavailable(status, "missing host writer authority port (ports.scheduling.writer)");
      }
      if (!isMarkerStore(scheduling.markerStore)) {
        return unavailable(status, "missing host marker store port (ports.scheduling.markerStore)");
      }
      if (!isReconcileScan(scheduling.scan)) {
        return unavailable(status, "missing host reconcile scan port (ports.scheduling.scan)");
      }
      if (typeof scheduling.pollRefs !== "function") {
        return unavailable(status, "missing host ref polling port (ports.scheduling.pollRefs)");
      }

      const schedCheck = ensureScheduler(clockCheck.clock, scheduling);
      if (!schedCheck.ok) return unavailable(status, schedCheck.reason);
      const scheduler = schedCheck.scheduler;

      // Explicit shutdown cleanly stops any active reconciler & watch hub and releases leases.
      if (action === "shutdown") {
        let finalCoverage: CoverageMap = { axes: {} };
        if (reconciler !== undefined) {
          await reconciler.shutdown();
          finalCoverage = reconciler.coverage();
          reconciler = undefined;
        }
        if (watchHub !== undefined) {
          await watchHub.dispose();
          watchHub = undefined;
          hubBootstrapPromise = undefined;
        }
        activeToken = undefined;
        revokedOrDeniedFlag = false;
        return {
          ...status,
          capability: "reconciliation",
          state: "available",
          delivered: true,
          generationId,
          action: "shutdown",
          converged: false,
          phase: "shutdown",
          coverage: finalCoverage,
          readiness: deriveReadiness(finalCoverage),
          schedulerStats: scheduler.lastStats(),
          ledger: scheduler.ledgerSnapshot(),
          batches: [],
        };
      }

      const hubCheck = ensureWatchHub(clockCheck.clock, scheduler, scheduling);
      if (!hubCheck.ok) return unavailable(status, hubCheck.reason);
      const hub = hubCheck.hub;

      const recCheck = ensureReconciler(clockCheck.clock, scheduler, hub, scheduling);
      if (!recCheck.ok) return unavailable(status, recCheck.reason);
      const rec = recCheck.reconciler;

      const bootstrapWatch = request.bootstrapWatch !== false;
      const readyCheck = await ensureWatchReady(hub, bootstrapWatch);
      if (!readyCheck.ok) {
        return unavailable(status, readyCheck.reason);
      }

      const trackWorktreeOp = action !== "cancel";
      if (trackWorktreeOp) {
        while (committedLeaseHeld) {
          await waitForCommittedLeaseReleased();
        }
        activeWorktreeOps += 1;
      }

      try {
        revokedOrDeniedFlag = false;
        try {
          if (action === "bootstrap") {
            await rec.bootstrap();
          } else if (action === "round") {
            await rec.reconcileRound();
          } else if (action === "converge") {
            if (rec.lifecycle() === "starting") {
              await rec.bootstrap();
            } else {
              await rec.converge();
            }
          } else if (action === "restart") {
            await rec.restart();
          } else if (action === "cancel") {
            await rec.cancelReconciliation();
          }
        } catch (error) {
          return unavailable(status, `reconciliation execution failed: ${safeErrorDetail(error)}`);
        }

        const degradedReason = rec.degradedReason();
        const fenced =
          revokedOrDeniedFlag ||
          degradedReason === "fenced" ||
          (typeof degradedReason === "string" && /fenced|writer authority|revoked/i.test(degradedReason));

        if (action === "cancel") {
          if (fenced) {
            return unavailable(status, `reconciliation stopped on revoked or denied writer fencing token: ${degradedReason ?? "fenced"}`);
          }
          const coverage = rec.coverage();
          return {
            ...status,
            capability: "reconciliation",
            state: "available",
            delivered: true,
            generationId,
            action: "cancel",
            converged: false,
            phase: rec.phase(),
            coverage,
            readiness: deriveReadiness(coverage),
            schedulerStats: rec.schedulerStats(),
            ledger: scheduler.ledgerSnapshot(),
            batches: [],
          };
        }

        if (fenced || activeToken === undefined || !scheduling.writer.validate(activeToken)) {
          return unavailable(
            status,
            `reconciliation stopped on revoked or denied writer fencing token: ${degradedReason ?? "writer token revoked or absent"}`,
          );
        }

        const tick = readClockMs(clockCheck.clock);
        if (!tick.ok) return unavailable(status, tick.reason);
        const coverage = rec.coverage();
        const converged = allCurrent(coverage);
        const genDigits = generationId.slice("gen:".length);
        const pendingCount = Object.values(coverage.axes).reduce((sum, axis) => sum + axis.pendingCount, 0);
        const firstFrontier = Object.values(coverage.axes).find((axis) => axis.pendingFrontier)?.pendingFrontier ?? null;

        const checkpointFact: ReconcileCheckpointProgressFactDto = {
          kind: "progress",
          schemaVersion: FACT_SCHEMA_VERSION,
          progressKind: "reconcile-checkpoint",
          cloneId: ctx.declaration.cloneId,
          worktreeId: ctx.declaration.worktreeId,
          checkpointId: `ckpt:reconcile:${genDigits}`,
          pendingCount,
          frontier: firstFrontier,
          complete: converged,
          recordedAt: tick.nowMs,
        };
        const facts: LiveFactDto[] = [checkpointFact, ...buildCoverageFactsFromMap(coverage, tick.nowMs)];

        const delivered = await deliverSchedulingFencedBatches({
          capability: "reconciliation",
          scope: worktreeScope,
          generationId,
          fencingToken: activeToken,
          expectedIncarnation: scheduling.markerStore.incarnation(),
          declarationRevision: ctx.declaration.declarationRevision,
          maxBatchBytes,
          facts,
          clock: clockCheck.clock,
          writer: scheduling.writer,
          factSink: sinkCheck.sink,
          validateWriterOnToken: true,
        });
        if (!delivered.ok) return unavailable(status, delivered.reason);

        return {
          ...status,
          capability: "reconciliation",
          state: "available",
          delivered: true,
          generationId,
          action,
          converged,
          phase: rec.phase(),
          coverage,
          readiness: deriveReadiness(coverage),
          schedulerStats: rec.schedulerStats(),
          ledger: scheduler.ledgerSnapshot(),
          batches: delivered.batches,
        };
      } finally {
        if (trackWorktreeOp) {
          activeWorktreeOps -= 1;
          notifyWorktreeIdleIfZero();
        }
      }
    },

    async runPublication(
      status: CapabilityStatus,
      request: unknown,
    ): Promise<PublicationCapabilityResult | UnavailableCapabilityResult> {
      if (!isPlainObject(request)) {
        return unavailable(status, 'capability "publication" requires a plain-object request (never reported available without executing its engine)');
      }
      const sinkCheck = validateFactSinkPort(ctx.factSink);
      if (!sinkCheck.ok) return unavailable(status, sinkCheck.reason);
      const clockCheck = validateClockWithSchedule();
      if (!clockCheck.ok) return unavailable(status, clockCheck.reason);

      const generationId = request.generationId;
      if (!isStrictGenerationId(generationId)) {
        return unavailable(status, 'publication request.generationId must be a strict fixed-width generation id ("gen:" plus 10 digits)');
      }
      const expectedIncarnation = request.expectedIncarnation;
      if (expectedIncarnation !== undefined && (typeof expectedIncarnation !== "string" || expectedIncarnation.length === 0)) {
        return unavailable(status, "publication request.expectedIncarnation, when present, must be a non-empty string");
      }
      const maxBatchBytes = (request.maxBatchBytes ?? MAX_FACT_BATCH_BYTES) as unknown;
      if (
        typeof maxBatchBytes !== "number" ||
        !Number.isSafeInteger(maxBatchBytes) ||
        maxBatchBytes <= 0 ||
        maxBatchBytes > MAX_FACT_BATCH_BYTES
      ) {
        return unavailable(status, `publication request.maxBatchBytes must be a positive safe integer <= ${MAX_FACT_BATCH_BYTES}`);
      }

      const scheduling = ctx.scheduling;
      if (!scheduling || typeof scheduling !== "object") {
        return unavailable(status, "missing host scheduling port (ports.scheduling)");
      }
      if (!isWriterAuthority(scheduling.writer)) {
        return unavailable(status, "missing host writer authority port (ports.scheduling.writer)");
      }

      const completionReq = request.completion as PublicationCompletionInput | undefined;
      let completionPort: GenerationCompletionPort | undefined;
      if (completionReq !== undefined) {
        if (!isPlainObject(completionReq)) {
          return unavailable(status, "publication request.completion must be a plain object when supplied");
        }
        completionPort = completionReq.port ?? ctx.generationCompletion;
        if (!isGenerationCompletionPort(completionPort)) {
          return unavailable(status, "missing host generation completion port (ports.generationCompletion)");
        }
      }

      const hasScanPorts = isReconcileScan(scheduling.scan) && isMarkerStore(scheduling.markerStore);
      const runScanPublication =
        hasScanPorts && (completionReq === undefined || request.sourceVector !== undefined || request.checkpoint !== undefined);
      if (!runScanPublication && completionReq === undefined) {
        return unavailable(status, "missing host publication port (ports.scheduling.scan/markerStore or ports.generationCompletion)");
      }

      const startNow = readClockMs(clockCheck.clock);
      if (!startNow.ok) return unavailable(status, startNow.reason);

      const hasMarkerStore = isMarkerStore(scheduling.markerStore);
      const storeIncarnation = hasMarkerStore ? scheduling.markerStore.incarnation() : undefined;
      if (hasMarkerStore && (typeof storeIncarnation !== "string" || storeIncarnation.length === 0)) {
        return unavailable(status, "host marker store returned an invalid projection incarnation");
      }
      const resolvedExpectedIncarnation = expectedIncarnation ?? storeIncarnation;

      // Validate the caller's fencing token, incarnation, declaration correlation and completion payload
      // BEFORE scheduling, acquiring any lease, or running scan publication.
      let verifiedToken: ScopeFencingTokenDto;
      let batchScope: LiveScope;
      let fixedSchedulerToken: ScopeFencingTokenDto | undefined;
      let needsWorktreeLease = false;
      let incarnation: string;
      let preparedCompletionMessage: GenerationCompletionMessageDto | undefined;
      let preparedCompletionReceipts: readonly BatchDeliveryReceiptDto[] | undefined;

      if (completionReq !== undefined) {
        try {
          verifiedToken = assertValidViewFencingToken(
            request.fencingToken,
            completionReq.correlation,
            resolvedExpectedIncarnation,
            startNow.nowMs,
          );
        } catch (error) {
          return unavailable(status, `publication fencing token rejected: ${safeErrorDetail(error)}`);
        }
        if (completionReq.correlation.producerGenerationId !== generationId) {
          return unavailable(status, "publication request.generationId does not match completion.correlation.producerGenerationId");
        }
        const corrBinding = validateCompletionCorrelationAgainstDeclaration(completionReq.correlation, ctx.declaration);
        if (!corrBinding.ok) {
          return unavailable(status, corrBinding.reason);
        }
        if (!isPlainObject(completionReq.input)) {
          return unavailable(status, "publication request.completion.input must be a plain object");
        }
        for (const key of Object.keys(completionReq.input)) {
          if (!ALLOWED_COMPLETION_INPUT_KEYS.has(key)) {
            return unavailable(status, `publication request.completion.input carries an unknown or disallowed key "${key}"`);
          }
        }
        try {
          preparedCompletionMessage = buildGenerationCompletionMessage({
            correlation: completionReq.correlation,
            receipts: completionReq.receipts,
            completionState: completionReq.input.completionState,
            ...(completionReq.input.expectedBatchCount !== undefined
              ? { expectedBatchCount: completionReq.input.expectedBatchCount }
              : {}),
            coverage: completionReq.input.coverage,
            exclusions: completionReq.input.exclusions,
            errors: completionReq.input.errors,
            remainingWork: completionReq.input.remainingWork,
            ...(completionReq.input.abortReason !== undefined ? { abortReason: completionReq.input.abortReason } : {}),
            completedAt: completionReq.input.completedAt,
          });
        } catch (error) {
          return unavailable(status, `publication completion payload rejected: ${safeErrorDetail(error)}`);
        }
        preparedCompletionReceipts = completionReq.receipts.map((receipt) => ({ ...receipt }));
        batchScope = completionReq.correlation.scope;
        incarnation = resolvedExpectedIncarnation ?? verifiedToken.projectionIncarnation;
        if (verifiedToken.scope.worktree !== undefined) {
          if (!scheduling.writer.validate(verifiedToken)) {
            return unavailable(status, "publication stopped: fencing token is revoked or rejected by writer authority");
          }
          fixedSchedulerToken = verifiedToken;
        } else {
          // Committed-view completion carries a clone-scoped token; defer worktree lease
          // acquisition until active worktree operations quiesce and release it in finally.
          needsWorktreeLease = true;
        }
      } else {
        if (typeof resolvedExpectedIncarnation !== "string" || resolvedExpectedIncarnation.length === 0) {
          return unavailable(status, "publication requires a non-empty projection incarnation");
        }
        incarnation = resolvedExpectedIncarnation;
        const tokenCheck = validateWorktreeFencingToken(request.fencingToken, ctx.declaration, startNow.nowMs, incarnation);
        if (!tokenCheck.ok) return unavailable(status, tokenCheck.reason);
        if (!scheduling.writer.validate(tokenCheck.token)) {
          return unavailable(status, "publication stopped: fencing token is revoked or rejected by writer authority");
        }
        verifiedToken = tokenCheck.token;
        fixedSchedulerToken = tokenCheck.token;
        batchScope = worktreeScope;
      }

      const schedCheck = ensureScheduler(clockCheck.clock, scheduling);
      if (!schedCheck.ok) return unavailable(status, schedCheck.reason);
      const scheduler = schedCheck.scheduler;

      // When a watch port is present, verify readiness and no unacknowledged overflow before publishing.
      if (isWatchPort(ctx.watch) && request.requireWatchReady !== false) {
        const hubCheck = ensureWatchHub(clockCheck.clock, scheduler, scheduling);
        if (!hubCheck.ok) return unavailable(status, hubCheck.reason);
        const readyCheck = await ensureWatchReady(hubCheck.hub, true);
        if (!readyCheck.ok) return unavailable(status, readyCheck.reason);
        if (hubCheck.hub.overflowed()) {
          return unavailable(status, "publication deferred: unacknowledged watcher overflow requires reconciliation");
        }
      }

      const executePublicationWithToken = async (
        schedulerToken: ScopeFencingTokenDto,
      ): Promise<PublicationCapabilityResult | UnavailableCapabilityResult> => {
        const opId = `pub:${generationId}:${++pubSequence}:${schedulerToken.tokenId}`;
        const workItem: WorkItem = {
          id: opId,
          scopeId: scopeIdentity(schedulerToken),
          priority: "interactive",
          bytes: Math.min(
            scheduling.reconcileBudgets?.operationBytes ?? DEFAULT_FACTORY_RECONCILE_BUDGETS.operationBytes,
            Math.max(16_384, scheduler.budgets.maxDiscoveryBytes + 8_192),
          ),
          fencingToken: schedulerToken,
          idempotencyDigest: sha256Text(`${opId}:${incarnation}:${generationId}`),
        };

        let publicationReport: PublishGenerationReport | undefined;
        let completionMessage: GenerationCompletionMessageDto | undefined;
        let completionOutcome: GenerationCompletionOutcomeDto | undefined;
        let workerFailure: string | undefined;

        const execResult = await scheduler.execute(workItem, async (permit) => {
          permit.check();
          const tick = readClockMs(clockCheck.clock);
          if (!tick.ok) {
            workerFailure = tick.reason;
            return { ok: false, retryable: false };
          }
          if (!scheduling.writer.validate(schedulerToken)) {
            workerFailure = "fencing token revoked before publication";
            return { ok: false, retryable: false, fenced: true };
          }

          if (runScanPublication) {
            const expectedVector = (request.sourceVector as SourceVector | undefined) ?? scheduling.scan.currentSourceVector(permit);
            const checkpoint = (request.checkpoint as string | undefined) ?? scheduling.markerStore.get("live-checkpoint");
            if (typeof checkpoint !== "string" || checkpoint.length === 0) {
              workerFailure = "publication requires a durable live-checkpoint before publishing";
              return { ok: false, retryable: false };
            }
            const collectOpts: CollectOptions = {
              fencingToken: schedulerToken,
              resources: permit,
              pageId: `publish:${generationId}:${pubSequence}`,
              pageDigest: sha256Text(`${generationId}:${checkpoint}`),
              deletedPaths: [],
            };
            const validation = await scheduling.scan.validateSource(expectedVector, collectOpts);
            permit.check();
            if (!scheduling.writer.validate(schedulerToken)) {
              workerFailure = "fencing token revoked after source validation";
              return { ok: false, retryable: false, fenced: true };
            }
            if (!validation.valid || !validation.projectionMatches || !sourceVectorsEqual(expectedVector, validation.sourceVector)) {
              workerFailure = "source validation failed or projection does not match source vector";
              return { ok: false, retryable: false };
            }
            const report = await scheduling.scan.publishGeneration(
              {
                generationId,
                expectedIncarnation: incarnation,
                sourceVector: expectedVector,
                checkpoint,
              },
              collectOpts,
            );
            permit.check();
            if (!scheduling.writer.validate(schedulerToken)) {
              workerFailure = "fencing token revoked during generation publication";
              return { ok: false, retryable: false, fenced: true };
            }
            if (!report.published || !report.receiptId || report.incarnation !== incarnation || report.generationId !== generationId) {
              workerFailure = "storage publication report was incomplete or mismatched";
              return { ok: false, retryable: false };
            }
            publicationReport = report;
          }

          if (preparedCompletionMessage !== undefined && completionPort !== undefined) {
            const msg = preparedCompletionMessage;
            permit.check();
            if (!scheduling.writer.validate(schedulerToken)) {
              workerFailure = "fencing token revoked before generation completion handoff";
              return { ok: false, retryable: false, fenced: true };
            }
            const rawOutcome = await completionPort.complete(msg, verifiedToken);
            permit.check();
            if (!scheduling.writer.validate(schedulerToken)) {
              workerFailure = "fencing token revoked during generation completion handoff";
              return { ok: false, retryable: false, fenced: true };
            }
            const verifiedOutcome = verifyGenerationCompletionOutcome(rawOutcome, msg, preparedCompletionReceipts ?? []);
            if (verifiedOutcome.status === "rejected") {
              workerFailure = `generation completion rejected (${verifiedOutcome.rejectionCode}): ${verifiedOutcome.reason}`;
              return {
                ok: false,
                retryable: false,
                fenced: verifiedOutcome.rejectionCode === "fenced",
              };
            }
            completionMessage = msg;
            completionOutcome = verifiedOutcome;
          }

          const receiptId =
            publicationReport?.receiptId ??
            (completionOutcome?.status === "published" ? completionOutcome.publicationReceiptId : `pub:${generationId}:${pubSequence}`);
          return { ok: true, receiptId };
        });

        if (!execResult.ok) {
          return unavailable(
            status,
            `publication stopped (${execResult.reason}): ${workerFailure ?? execResult.reason}`,
          );
        }

        if (!scheduling.writer.validate(schedulerToken)) {
          return unavailable(status, "publication stopped: fencing token revoked before checkpoint batch delivery");
        }

        const endTick = readClockMs(clockCheck.clock);
        if (!endTick.ok) return unavailable(status, endTick.reason);
        const published =
          (publicationReport?.published ?? false) || completionOutcome?.status === "published";
        const genDigits = generationId.slice("gen:".length);
        const checkpointFact: ReconcileCheckpointProgressFactDto = {
          kind: "progress",
          schemaVersion: FACT_SCHEMA_VERSION,
          progressKind: "reconcile-checkpoint",
          cloneId: ctx.declaration.cloneId,
          worktreeId: batchScope.worktree ?? null,
          checkpointId: `ckpt:pub:${genDigits}`,
          pendingCount: 0,
          frontier: null,
          complete: published,
          recordedAt: endTick.nowMs,
        };
        const coverageFact: CoverageFactDto = {
          kind: "coverage",
          schemaVersion: FACT_SCHEMA_VERSION,
          axis: "remote-publication",
          state: published ? "current" : "partial",
          reason: published
            ? `fenced generation ${generationId} published`
            : `fenced generation ${generationId} staged without publication`,
          checkedAt: endTick.nowMs,
          pendingCount: published ? 0 : 1,
          pendingFrontier: null,
          lastSuccessAt: published ? endTick.nowMs : null,
        };

        const delivered = await deliverSchedulingFencedBatches({
          capability: "publication",
          scope: batchScope,
          generationId,
          fencingToken: verifiedToken,
          expectedIncarnation: incarnation,
          declarationRevision: ctx.declaration.declarationRevision,
          maxBatchBytes,
          facts: [checkpointFact, coverageFact],
          clock: clockCheck.clock,
          writer: scheduling.writer,
          factSink: sinkCheck.sink,
          validateWriterOnToken: verifiedToken.scope.worktree !== undefined,
        });
        if (!delivered.ok) return unavailable(status, delivered.reason);

        return {
          ...status,
          capability: "publication",
          state: "available",
          delivered: true,
          generationId,
          published,
          ...(publicationReport !== undefined ? { publicationReport } : {}),
          ...(completionMessage !== undefined ? { completionMessage } : {}),
          ...(completionOutcome !== undefined ? { completionOutcome } : {}),
          schedulerStats: scheduler.lastStats(),
          ledger: scheduler.ledgerSnapshot(),
          batches: delivered.batches,
        };
      };

      if (needsWorktreeLease) {
        const previousCommitted = committedLeaseTail;
        let releaseCommittedGate!: () => void;
        committedLeaseTail = new Promise<void>((resolve) => {
          releaseCommittedGate = resolve;
        });
        await previousCommitted;
        let acquiredLease: ScopeFencingTokenDto | undefined;
        try {
          for (;;) {
            while (activeWorktreeOps > 0) {
              await waitForWorktreeOpsIdle();
            }
            await waitForScopeQuiescence(scheduler, worktreeScopeId);
            if (activeWorktreeOps === 0) break;
          }
          const afterWaitNow = readClockMs(clockCheck.clock);
          if (!afterWaitNow.ok) return unavailable(status, afterWaitNow.reason);
          const currentStoreIncarnation = hasMarkerStore ? scheduling.markerStore.incarnation() : undefined;
          if (hasMarkerStore && (typeof currentStoreIncarnation !== "string" || currentStoreIncarnation.length === 0)) {
            return unavailable(status, "host marker store returned an invalid projection incarnation");
          }
          const currentExpectedIncarnation = expectedIncarnation ?? currentStoreIncarnation;
          try {
            verifiedToken = assertValidViewFencingToken(
              request.fencingToken,
              completionReq!.correlation,
              currentExpectedIncarnation,
              afterWaitNow.nowMs,
            );
          } catch (error) {
            return unavailable(status, `publication fencing token rejected: ${safeErrorDetail(error)}`);
          }
          incarnation = currentExpectedIncarnation ?? verifiedToken.projectionIncarnation;

          committedLeaseHeld = true;
          activeToken = undefined;
          const lease = await scheduling.writer.acquire({
            scope: worktreeScope,
            minEpoch: verifiedToken.epoch,
            declarationRevision: ctx.declaration.declarationRevision,
            projectionIncarnation: incarnation,
          });
          if (!lease || !scheduling.writer.validate(lease)) {
            if (lease) {
              try {
                await scheduling.writer.release(lease);
              } catch {
                // best-effort cleanup of unusable lease
              }
            }
            return unavailable(status, "publication stopped: writer authority refused scheduling lease");
          }
          acquiredLease = lease;
          return await executePublicationWithToken(lease);
        } finally {
          if (acquiredLease !== undefined) {
            try {
              await scheduling.writer.release(acquiredLease);
            } catch {
              // best-effort lease cleanup
            }
          }
          committedLeaseHeld = false;
          notifyCommittedLeaseReleased();
          releaseCommittedGate();
        }
      }

      while (committedLeaseHeld) {
        await waitForCommittedLeaseReleased();
      }
      activeWorktreeOps += 1;
      try {
        return await executePublicationWithToken(fixedSchedulerToken!);
      } finally {
        activeWorktreeOps -= 1;
        notifyWorktreeIdleIfZero();
      }
    },
  };
}

export async function runReconciliationCapability(
  status: CapabilityStatus,
  ctx: LocalRuntimeContext,
  request: unknown,
  controller?: LocalSchedulingController,
): Promise<ReconciliationCapabilityResult | UnavailableCapabilityResult> {
  const activeController = controller ?? createLocalSchedulingController(ctx);
  return activeController.runReconciliation(status, request);
}

export async function runPublicationCapability(
  status: CapabilityStatus,
  ctx: LocalRuntimeContext,
  request: unknown,
  controller?: LocalSchedulingController,
): Promise<PublicationCapabilityResult | UnavailableCapabilityResult> {
  const activeController = controller ?? createLocalSchedulingController(ctx);
  return activeController.runPublication(status, request);
}
